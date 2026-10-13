const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const { formatResponse, generateInvoiceId, generateQuotationId } = require('../utils/helpers');
const logger = require('../utils/logger');
const { logActivity } = require('../utils/activity.logger');
const { canTechnicianAccessTicket, generateGuestInvoiceAccessToken, verifyInvoiceAuthorization } = require('../utils/auth.helpers');

/**
 * Get public payment gateway configuration
 */
const getPaymentConfig = async (req, res) => {
  const keyId = config.razorpay?.keyId || '';
  const keySecret = config.razorpay?.keySecret || '';
  const currency = config.razorpay?.currency || 'INR';
  const isRealKey = Boolean(keyId.startsWith('rzp_live_') || keyId.startsWith('rzp_test_')) && !keyId.includes('demo') && !keyId.includes('YourKeyId');
  const isLive = Boolean(keyId.startsWith('rzp_live_') && keySecret);

  // Never expose placeholder/fake keys to the client; real live/test keys only.
  return res.status(200).json(formatResponse(true, 'Payment gateway configuration.', {
    keyId: isRealKey ? keyId : '',
    currency,
    isLive
  }));
};

/**
 * Helper to call Razorpay order creation API (live or test keys). Fails closed
 * when the gateway is not configured with real Razorpay credentials.
 */
const callRazorpayCreateOrder = async ({ amountInPaise, currency = 'INR', receipt, notes = {} }) => {
  const keyId = config.razorpay?.keyId;
  const keySecret = config.razorpay?.keySecret;

  const isRealKey = Boolean((keyId && keyId.startsWith('rzp_live_')) || (keyId && keyId.startsWith('rzp_test_')))
    && !keyId.includes('demo') && !keyId.includes('YourKeyId');

  if (isRealKey && keySecret) {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency,
          receipt,
          notes
        })
      });
      if (response.ok) {
        const orderData = await response.json();
        return { success: true, order: orderData };
      }
      const errData = await response.json();
      logger.warn('Razorpay order API error: ' + JSON.stringify(errData));
    } catch (e) {
      logger.error('Failed calling Razorpay API: ' + e.message);
    }
    return { success: false, error: 'Payment gateway could not create the order. Please try again later.' };
  }

  logger.warn('Payment gateway is not configured with valid Razorpay credentials.');
  return { success: false, error: 'Payment gateway is not configured. Please contact support.' };
};

/**
 * Helper to verify Razorpay signature (strict HMAC; fails closed)
 */
const verifyRazorpaySignature = (orderId, paymentId, signature) => {
  const keySecret = config.razorpay?.keySecret;
  if (!keySecret || keySecret.includes('YourKeySecret') || keySecret.includes('demo')) {
    return false;
  }
  if (!orderId || !paymentId || !signature) {
    return false;
  }
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expectedSignature === signature;
};

/**
 * Helper to notify the assigned technician upon verified payment settlement.
 * Idempotent: Skips if a notification referencing this paymentId already exists.
 * Failsafe: Catches and logs errors without disrupting the financial transaction response.
 */
const notifyTechnicianOnPayment = async ({ connection, ticketId, paymentId, amount, senderId, paymentMethod }) => {
  if (!ticketId || !paymentId) {
    return { notified: false, reason: 'missing_parameters' };
  }

  try {
    const [tkRows] = await connection.query(
      `SELECT sr.id, sr.ticket_number, sr.brand, sr.model_number, sr.device_category,
              sr.assigned_technician_id, sr.customer_name, sr.payment_method,
              u.id as tech_id, u.name as tech_name, u.is_active as tech_is_active
       FROM service_requests sr
       LEFT JOIN users u ON sr.assigned_technician_id = u.id AND u.role = 'technician'
       WHERE sr.id = ? LIMIT 1`,
      [ticketId]
    );

    if (tkRows.length === 0) {
      return { notified: false, reason: 'ticket_not_found' };
    }

    const ticket = tkRows[0];

    // If no technician assigned, skip cleanly
    if (!ticket.assigned_technician_id || !ticket.tech_id) {
      return { notified: false, reason: 'unassigned' };
    }

    // If technician is deactivated, skip cleanly
    if (ticket.tech_is_active === 0 || ticket.tech_is_active === false) {
      logger.info(`Skipping payment notification for deactivated technician ${ticket.tech_id} on ticket ${ticket.id}`);
      return { notified: false, reason: 'technician_inactive' };
    }

    const assignedTechId = ticket.tech_id;

    // Idempotency check: Ensure no duplicate notification for this transaction ID
    const [existingNotif] = await connection.query(
      'SELECT id FROM notifications WHERE user_id = ? AND ticket_id = ? AND message LIKE ? LIMIT 1',
      [assignedTechId, ticketId, `%${paymentId}%`]
    );

    if (existingNotif.length > 0) {
      return { notified: false, reason: 'already_notified' };
    }

    const resolvedMethod = (paymentMethod || ticket.payment_method || '').toLowerCase();
    const isCash = resolvedMethod === 'cash' || (paymentId && String(paymentId).startsWith('PAY-CASH'));
    const isBankOrUpi = resolvedMethod === 'bank_transfer' || resolvedMethod === 'offline_upi' || (paymentId && (String(paymentId).startsWith('PAY-BANK') || String(paymentId).startsWith('PAY-UPI')));
    const idLabel = isCash ? 'Cash Payment Reference' : isBankOrUpi ? 'Payment Ref' : 'Transaction ID';

    const ticketRef = ticket.ticket_number || `#${ticket.id}`;
    const deviceInfo = `${ticket.brand || ''} ${ticket.model_number || ''}`.trim() || ticket.device_category || 'Device Repair';
    const techMessage = `Payment of ₹${parseFloat(amount || 0).toFixed(2)} for repair ticket ${ticketRef} (${deviceInfo}) has been successfully received and verified. ${idLabel}: ${paymentId}`;

    await connection.query(
      `INSERT INTO notifications (user_id, ticket_id, title, message, sender_id)
       VALUES (?, ?, 'Payment Received', ?, ?)`,
      [
        assignedTechId,
        ticketId,
        techMessage,
        senderId || null
      ]
    );

    logger.info(`Assigned technician ${assignedTechId} notified of payment for ticket ${ticketRef} (Payment: ${paymentId}, Amount: ₹${parseFloat(amount || 0).toFixed(2)})`);
    return { notified: true, technicianId: assignedTechId };

  } catch (err) {
    logger.error(`Error notifying technician on payment: ${err.message}`);
    return { notified: false, error: err.message };
  }
};

/**
 * Helper to notify the assigned technician when offline payment verification is rejected by Admin.
 * Respects idempotency, inactive/unassigned technician checks, and standard notification schema.
 */
const notifyTechnicianOnPaymentRejection = async ({ connection, ticketId, paymentId, amount, senderId, paymentMethod, rejectionReason }) => {
  if (!ticketId || !paymentId) {
    return { notified: false, reason: 'missing_parameters' };
  }

  try {
    const conn = connection || pool;
    const [tkRows] = await conn.query(
      `SELECT sr.id, sr.ticket_number, sr.brand, sr.model_number, sr.device_category,
              sr.assigned_technician_id, sr.customer_name, sr.payment_method,
              u.id as tech_id, u.name as tech_name, u.is_active as tech_is_active
       FROM service_requests sr
       LEFT JOIN users u ON sr.assigned_technician_id = u.id AND u.role = 'technician'
       WHERE sr.id = ? LIMIT 1`,
      [ticketId]
    );

    if (tkRows.length === 0) {
      return { notified: false, reason: 'ticket_not_found' };
    }

    const ticket = tkRows[0];

    // If no technician assigned, skip cleanly
    if (!ticket.assigned_technician_id || !ticket.tech_id) {
      return { notified: false, reason: 'unassigned' };
    }

    // If technician is deactivated, skip cleanly
    if (ticket.tech_is_active === 0 || ticket.tech_is_active === false) {
      logger.info(`Skipping payment rejection notification for deactivated technician ${ticket.tech_id} on ticket ${ticket.id}`);
      return { notified: false, reason: 'technician_inactive' };
    }

    const assignedTechId = ticket.tech_id;

    // Idempotency check: Ensure no duplicate rejection notification for this payment ID and recipient
    const [existingNotif] = await conn.query(
      `SELECT id FROM notifications 
       WHERE user_id = ? 
         AND ticket_id = ? 
         AND title = 'Payment Verification Rejected' 
         AND message LIKE ? 
       LIMIT 1`,
      [assignedTechId, ticketId, `%${paymentId}%`]
    );

    if (existingNotif.length > 0) {
      return { notified: false, reason: 'already_notified' };
    }

    const resolvedMethod = (paymentMethod || ticket.payment_method || '').toLowerCase();
    const isCash = resolvedMethod === 'cash' || (paymentId && String(paymentId).startsWith('PAY-CASH'));
    const isBankOrUpi = resolvedMethod === 'bank_transfer' || resolvedMethod === 'offline_upi' || (paymentId && (String(paymentId).startsWith('PAY-BANK') || String(paymentId).startsWith('PAY-UPI')));
    const idLabel = isCash ? 'Cash Payment Reference' : isBankOrUpi ? 'Payment Ref' : 'Transaction ID';

    const ticketRef = ticket.ticket_number || `#${ticket.id}`;
    const deviceInfo = `${ticket.brand || ''} ${ticket.model_number || ''}`.trim() || ticket.device_category || 'Device Repair';
    const reasonText = rejectionReason ? ` Reason: ${rejectionReason}.` : '';
    const techMessage = `Payment verification of ₹${parseFloat(amount || 0).toFixed(2)} for your assigned ticket ${ticketRef} (${deviceInfo}) was rejected by administrator.${reasonText} ${idLabel}: ${paymentId}. Please follow up with the customer or check payment status.`;

    await conn.query(
      `INSERT INTO notifications (user_id, ticket_id, title, message, sender_id)
       VALUES (?, ?, 'Payment Verification Rejected', ?, ?)`,
      [
        assignedTechId,
        ticketId,
        techMessage,
        senderId || null
      ]
    );

    logger.info(`Assigned technician ${assignedTechId} notified of payment rejection for ticket ${ticketRef} (Payment: ${paymentId}, Amount: ₹${parseFloat(amount || 0).toFixed(2)})`);
    return { notified: true, technicianId: assignedTechId };

  } catch (err) {
    logger.error(`Error notifying technician on payment rejection: ${err.message}`);
    return { notified: false, error: err.message };
  }
};

/**
 * Get all invoices (Customers view their own, Admins/Technicians view all)
 */
const getInvoices = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const { role, id: authUserId } = req.user;
    const { userId, status } = req.query;

    let query = `
      SELECT inv.*, 
             sr.ticket_number, 
             sr.brand as device_brand, 
             sr.model_number as device_model, 
             sr.device_category,
             sr.payment_status as ticket_payment_status,
             sr.status as ticket_status
      FROM invoices inv
      LEFT JOIN service_requests sr ON inv.ticket_id = sr.id
      WHERE 1=1
    `;
    const params = [];

    // Security Check: Customers/Companies can only see their own active, non-draft invoices
    if (role === 'customer') {
      query += " AND inv.user_id = ? AND inv.status != 'Draft' AND inv.is_active = TRUE";
      params.push(authUserId);
    } else if (role === 'company') {
      query += " AND (inv.user_id = ? OR sr.company_id = ?) AND inv.status != 'Draft' AND inv.is_active = TRUE";
      params.push(authUserId, authUserId);
    } else if (role === 'technician') {
      // Technicians can only see invoices associated with their authorized repair tickets
      query += ' AND inv.ticket_id IN (SELECT id FROM service_requests WHERE assigned_technician_id = ? OR pending_technician_id = ?)';
      params.push(authUserId, authUserId);
    } else if (userId || (role === 'admin' && (req.headers['x-company-id'] || req.query.companyId))) {
      // Admins can filter by userId or X-Company-ID
      const targetUserId = userId || (role === 'admin' ? (req.headers['x-company-id'] || req.query.companyId) : null);
      if (targetUserId) {
        query += ' AND inv.user_id = ?';
        params.push(targetUserId);
      }
    }

    if (status) {
      query += ' AND inv.status = ?';
      params.push(status);
    }

    query += ' ORDER BY inv.created_at DESC';

    const [invoices] = await connection.query(query, params);

    if (invoices.length === 0) {
      return res.status(200).json(formatResponse(true, 'No invoices found.', []));
    }

    // Fetch line items for all these invoices
    const invoiceIds = invoices.map(inv => inv.id);
    const placeholders = invoiceIds.map(() => '?').join(',');

    const [lineItems] = await connection.query(
      `SELECT * FROM invoice_line_items WHERE invoice_id IN (${placeholders})`,
      invoiceIds
    );

    // Group line items by invoice_id
    const lineItemsMap = {};
    lineItems.forEach(item => {
      if (!lineItemsMap[item.invoice_id]) {
        lineItemsMap[item.invoice_id] = [];
      }
      lineItemsMap[item.invoice_id].push({
        id: item.id,
        description: item.description,
        hsnSac: item.hsn_sac || '9987',
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price),
        total: parseFloat(item.total),
        taxRate: parseFloat(item.tax_rate !== null && item.tax_rate !== undefined ? item.tax_rate : 18.0),
        taxAmount: parseFloat(item.tax_amount || 0)
      });
    });

    // Format response (mapping snake_case to camelCase)
    const formattedInvoices = invoices.map(inv => ({
      id: inv.id,
      userId: inv.user_id,
      ticketId: inv.ticket_id,
      ticketNumber: inv.ticket_number || null,
      ticket_number: inv.ticket_number || null,
      deviceBrand: inv.device_brand || null,
      deviceModel: inv.device_model || null,
      deviceCategory: inv.device_category || null,
      ticketStatus: inv.ticket_status || null,
      ticketPaymentStatus: inv.ticket_payment_status || null,
      clientName: inv.client_name,
      amount: parseFloat(inv.amount),
      subtotal: parseFloat(inv.subtotal !== null && inv.subtotal !== undefined ? inv.subtotal : inv.amount),
      taxAmount: parseFloat(inv.tax_amount || 0),
      cgstAmount: parseFloat(inv.cgst_amount || 0),
      sgstAmount: parseFloat(inv.sgst_amount || 0),
      igstAmount: parseFloat(inv.igst_amount || 0),
      originalEstimate: inv.original_estimate !== null && inv.original_estimate !== undefined ? parseFloat(inv.original_estimate) : null,
      isInterstate: Boolean(inv.is_interstate),
      currency: inv.currency,
      invoiceDate: inv.invoice_date,
      dueDate: inv.due_date,
      status: inv.status,
      notes: inv.notes,
      finalizedAt: inv.finalized_at,
      finalizedBy: inv.finalized_by,
      createdAt: inv.created_at,
      updatedAt: inv.updated_at,
      lineItems: lineItemsMap[inv.id] || []
    }));

    return res.status(200).json(formatResponse(true, 'Invoices fetched successfully.', formattedInvoices));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Get single invoice by ID
 */
const getInvoiceById = async (req, res, next) => {
  const { id } = req.params;
  const { role, id: authUserId } = req.user;
  let connection;

  try {
    connection = await pool.getConnection();

    const [invoices] = await connection.query(`
      SELECT inv.*,
             sr.ticket_number,
             sr.brand as device_brand,
             sr.model_number as device_model,
             sr.device_category,
             sr.payment_status as ticket_payment_status,
             sr.status as ticket_status,
             sr.company_id as ticket_company_id
      FROM invoices inv
      LEFT JOIN service_requests sr ON inv.ticket_id = sr.id
      WHERE inv.id = ? LIMIT 1
    `, [id]);

    if (invoices.length === 0) {
      return res.status(404).json(formatResponse(false, 'Invoice not found.'));
    }

    const inv = invoices[0];

    // Security Check: Customers and Companies cannot view other users' invoices
    if (role === 'customer' && inv.user_id !== authUserId) {
      return res.status(403).json(formatResponse(false, 'Forbidden. Access to this invoice is restricted.'));
    }
    if (role === 'company' && inv.user_id !== authUserId && inv.ticket_company_id !== authUserId) {
      return res.status(403).json(formatResponse(false, 'Forbidden. Access to this invoice is restricted.'));
    }

    // Security Check: Customers and Companies cannot view Draft invoices
    if ((role === 'customer' || role === 'company') && inv.status === 'Draft') {
      return res.status(403).json(formatResponse(false, 'Forbidden. Draft invoices are under administrative review and not accessible to clients until finalized.'));
    }

    // Security Check: Technicians can only view invoices for their authorized repair tickets
    if (role === 'technician') {
      if (!inv.ticket_id) {
        return res.status(403).json(formatResponse(false, 'Forbidden. Technicians can only view invoices associated with assigned repair tickets.'));
      }
      const [ticketRows] = await connection.query(
        'SELECT id, assigned_technician_id, pending_technician_id FROM service_requests WHERE id = ? LIMIT 1',
        [inv.ticket_id]
      );
      if (ticketRows.length === 0 || !(await canTechnicianAccessTicket(authUserId, ticketRows[0], connection))) {
        return res.status(403).json(formatResponse(false, 'Forbidden. You are not authorized to view the invoice for this repair ticket.'));
      }
    }

    // Fetch line items
    const [lineItems] = await connection.query(
      'SELECT * FROM invoice_line_items WHERE invoice_id = ?',
      [id]
    );

    const formattedInvoice = {
      id: inv.id,
      userId: inv.user_id,
      ticketId: inv.ticket_id,
      ticketNumber: inv.ticket_number || null,
      ticket_number: inv.ticket_number || null,
      deviceBrand: inv.device_brand || null,
      deviceModel: inv.device_model || null,
      deviceCategory: inv.device_category || null,
      ticketStatus: inv.ticket_status || null,
      ticketPaymentStatus: inv.ticket_payment_status || null,
      clientName: inv.client_name,
      amount: parseFloat(inv.amount),
      subtotal: parseFloat(inv.subtotal !== null && inv.subtotal !== undefined ? inv.subtotal : inv.amount),
      taxAmount: parseFloat(inv.tax_amount || 0),
      cgstAmount: parseFloat(inv.cgst_amount || 0),
      sgstAmount: parseFloat(inv.sgst_amount || 0),
      igstAmount: parseFloat(inv.igst_amount || 0),
      originalEstimate: inv.original_estimate !== null && inv.original_estimate !== undefined ? parseFloat(inv.original_estimate) : null,
      isInterstate: Boolean(inv.is_interstate),
      currency: inv.currency,
      invoiceDate: inv.invoice_date,
      dueDate: inv.due_date,
      status: inv.status,
      notes: inv.notes,
      finalizedAt: inv.finalized_at,
      finalizedBy: inv.finalized_by,
      createdAt: inv.created_at,
      updatedAt: inv.updated_at,
      lineItems: lineItems.map(item => ({
        id: item.id,
        description: item.description,
        hsnSac: item.hsn_sac || '9987',
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price),
        total: parseFloat(item.total),
        taxRate: parseFloat(item.tax_rate !== null && item.tax_rate !== undefined ? item.tax_rate : 18.0),
        taxAmount: parseFloat(item.tax_amount || 0)
      }))
    };

    return res.status(200).json(formatResponse(true, 'Invoice fetched successfully.', formattedInvoice));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Server-authoritative calculation for invoice totals and item-level taxes.
 * Line Amount = Quantity * Unit Rate
 * Line Tax = Line Amount * (Tax Rate / 100)
 * Subtotal = Sum(Line Amount)
 * Total GST = Sum(Line Tax)
 * Grand Total = Subtotal + Total GST
 * Intra-state: CGST = Total GST / 2, SGST = Total GST / 2, IGST = 0
 * Inter-state: IGST = Total GST, CGST = 0, SGST = 0
 */
const calculateInvoiceTotals = (lineItems = [], isInterstate = false, defaultTaxRate = 18.0) => {
  let subtotal = 0;
  let totalTax = 0;

  const fallbackRate = defaultTaxRate !== undefined && defaultTaxRate !== null && !isNaN(Number(defaultTaxRate))
    ? Math.max(0, parseFloat(defaultTaxRate))
    : 18.0;

  const processedItems = (lineItems || []).map((item) => {
    const qty = Math.max(1, parseInt(item.quantity !== undefined ? item.quantity : (item.qty || 1), 10) || 1);
    const unitPrice = Math.max(0, parseFloat(
      item.unitPrice !== undefined ? item.unitPrice :
        item.unitRate !== undefined ? item.unitRate :
          item.unit_price !== undefined ? item.unit_price :
            item.rate !== undefined ? item.rate :
              item.price !== undefined ? item.price : 0
    ) || 0);
    const lineTotal = Math.round(qty * unitPrice * 100) / 100;
    const taxRate = item.taxRate !== undefined && item.taxRate !== null && !isNaN(Number(item.taxRate))
      ? Math.max(0, parseFloat(item.taxRate))
      : (item.tax_rate !== undefined && item.tax_rate !== null && !isNaN(Number(item.tax_rate))
        ? Math.max(0, parseFloat(item.tax_rate))
        : fallbackRate);
    const itemTax = Math.round(lineTotal * (taxRate / 100) * 100) / 100;
    const hsnSac = String(item.hsnSac || item.hsn_sac || item.sacCode || '9987').trim();
    const description = String(item.description || 'Service item').trim();

    subtotal += lineTotal;
    totalTax += itemTax;

    return {
      id: item.id,
      description,
      hsn_sac: hsnSac,
      quantity: qty,
      unit_price: unitPrice,
      total: lineTotal,
      tax_rate: taxRate,
      tax_amount: itemTax
    };
  });

  subtotal = Math.round(subtotal * 100) / 100;
  totalTax = Math.round(totalTax * 100) / 100;
  const grandTotal = Math.round((subtotal + totalTax) * 100) / 100;

  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (Boolean(isInterstate)) {
    igstAmount = totalTax;
  } else {
    cgstAmount = Math.round((totalTax / 2) * 100) / 100;
    sgstAmount = Math.round((totalTax - cgstAmount) * 100) / 100;
  }

  return {
    subtotal,
    taxAmount: totalTax,
    cgstAmount,
    sgstAmount,
    igstAmount,
    grandTotal,
    processedItems
  };
};

/**
 * Create new invoice (Admins only)
 */
const createInvoice = async (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json(formatResponse(false, 'Forbidden. Only administrators can create commercial invoices.'));
  }

  const { clientName, userId, ticketId, currency, invoiceDate, dueDate, status, notes, lineItems, isInterstate, originalEstimate } = req.body;
  const resolvedTicketId = ticketId !== undefined ? ticketId : (req.body.ticket_id !== undefined ? req.body.ticket_id : null);
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Calculate authoritative totals
    const isInter = Boolean(isInterstate);
    const rawItems = lineItems || req.body.items || [];
    const calculated = calculateInvoiceTotals(rawItems, isInter);

    // If linked to a ticket, ensure ticket exists and no active invoice already exists (concurrency-safe)
    if (resolvedTicketId) {
      const [ticketRows] = await connection.query(
        'SELECT id FROM service_requests WHERE id = ? LIMIT 1 FOR UPDATE',
        [resolvedTicketId]
      );
      if (ticketRows.length === 0) {
        await connection.rollback();
        return res.status(404).json(formatResponse(false, 'Associated repair ticket not found.'));
      }

      const [existingActive] = await connection.query(
        'SELECT id, status FROM invoices WHERE ticket_id = ? AND is_active = TRUE LIMIT 1 FOR UPDATE',
        [resolvedTicketId]
      );
      if (existingActive.length > 0) {
        await connection.rollback();
        return res.status(400).json(formatResponse(
          false,
          `An active invoice (#${existingActive[0].id}, ${existingActive[0].status}) is already linked to this repair ticket.`
        ));
      }
    }

    // 2. Generate unique sequential invoice ID (e.g. inv-001)
    const invoiceId = await generateInvoiceId(connection);

    // 3. Insert into invoices table
    await connection.query(`
      INSERT INTO invoices (
        id, user_id, ticket_id, client_name, amount, subtotal, tax_amount,
        cgst_amount, sgst_amount, igst_amount, is_interstate, original_estimate,
        currency, invoice_date, due_date, status, notes, finalized_at, finalized_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      invoiceId,
      userId,
      resolvedTicketId,
      clientName,
      calculated.grandTotal,
      calculated.subtotal,
      calculated.taxAmount,
      calculated.cgstAmount,
      calculated.sgstAmount,
      calculated.igstAmount,
      isInter,
      originalEstimate !== undefined && originalEstimate !== null ? parseFloat(originalEstimate) : null,
      currency || 'INR',
      new Date(invoiceDate),
      new Date(dueDate),
      status || 'Draft',
      notes || null,
      status === 'Final' ? new Date() : null,
      status === 'Final' ? req.user.id : null
    ]);

    // 4. Insert each line item with item-level tax
    for (const item of calculated.processedItems) {
      await connection.query(`
        INSERT INTO invoice_line_items (invoice_id, description, hsn_sac, quantity, unit_price, total, tax_rate, tax_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [invoiceId, item.description, item.hsn_sac, item.quantity, item.unit_price, item.total, item.tax_rate, item.tax_amount]);
    }

    await connection.commit();
    logger.info(`Invoice created: ${invoiceId} for user ID ${userId} (amount: ${calculated.grandTotal})`);

    // Log Activity
    await logActivity(req.user.id, 'billing', 'create_invoice', 'invoices', invoiceId, { userId, amount: calculated.grandTotal, status: status || 'Draft' }, req.ip);

    return res.status(201).json(formatResponse(true, 'Invoice created successfully.', { invoiceId, amount: calculated.grandTotal }));

  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Update an invoice (Admins only)
 */
const updateInvoice = async (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json(formatResponse(false, 'Forbidden. Only administrators can edit commercial invoices.'));
  }

  const { id } = req.params;
  const { clientName, userId, ticketId, currency, invoiceDate, dueDate, status, notes, lineItems, newInvoiceId, isInterstate, originalEstimate, taxRate, gstRate, gstPercentage } = req.body;
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Verify existence
    const [existing] = await connection.query('SELECT * FROM invoices WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json(formatResponse(false, 'Invoice not found.'));
    }

    const currentInv = existing[0];

    // Locked check: Once finalized, invoice is immutable under normal editing
    if ((currentInv.status === 'Final' || currentInv.status === 'Paid') && status !== 'Void') {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, 'Finalized invoice is immutable and locked against normal editing.'));
    }

    // Ensure PUT /api/billing/invoices/:id cannot set status: "Final" or bypass the dedicated Admin-only finalize endpoint
    if (status === 'Final' || req.body.status === 'Final') {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, 'Cannot set invoice status to Final via update. Invoices must be finalized via the dedicated finalize endpoint.'));
    }

    let effectiveId = id;
    const targetCustomId = (newInvoiceId || req.body.id || '').trim();

    // Custom Invoice ID editing rules: Only permitted while invoice is in Draft
    if (targetCustomId && targetCustomId !== id) {
      if (currentInv.status !== 'Draft') {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'Invoice number can only be edited while invoice is in Draft status.'));
      }

      // Format validation: 1-50 alphanumeric, slashes, dashes, underscores, dots
      if (targetCustomId.length > 50 || !/^[A-Za-z0-9\/\-_.]+$/.test(targetCustomId)) {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'Invalid invoice number format. Must be 1-50 characters containing only letters, numbers, hyphens, slashes, underscores, or dots.'));
      }

      // Must be unique
      const [colliding] = await connection.query('SELECT id FROM invoices WHERE id = ? LIMIT 1', [targetCustomId]);
      if (colliding.length > 0) {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, `Invoice number '${targetCustomId}' is already in use by another invoice. Must be unique.`));
      }

      // Safely update primary key across tables without touching sequence counter
      try {
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        await connection.query('UPDATE invoices SET id = ? WHERE id = ?', [targetCustomId, id]);
        await connection.query('UPDATE invoice_line_items SET invoice_id = ? WHERE invoice_id = ?', [targetCustomId, id]);
        await connection.query('UPDATE payments SET invoice_id = ? WHERE invoice_id = ?', [targetCustomId, id]);
      } finally {
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
      }

      logger.info(`Invoice ID renamed from ${id} to ${targetCustomId} by Admin ${req.user.email}`);
      await logActivity(req.user.id, 'billing', 'update_invoice_number', 'invoices', targetCustomId, { oldId: id, newId: targetCustomId }, req.ip);
      effectiveId = targetCustomId;
    }

    // Authoritative total recalculation
    const isInter = isInterstate !== undefined ? Boolean(isInterstate) : Boolean(currentInv.is_interstate);
    let rawItems = lineItems || req.body.items;
    let shouldUpdateLineItems = true;

    if (rawItems === undefined) {
      const [existingLines] = await connection.query('SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY id ASC', [effectiveId]);
      rawItems = existingLines;
      shouldUpdateLineItems = false;
    }

    const defaultTaxRate = taxRate !== undefined ? taxRate : (gstRate !== undefined ? gstRate : gstPercentage);
    const calculated = calculateInvoiceTotals(rawItems || [], isInter, defaultTaxRate);

    const newStatus = status || currentInv.status;

    const resolvedTicketId = ticketId !== undefined ? ticketId : (req.body.ticket_id !== undefined ? req.body.ticket_id : currentInv.ticket_id);

    // 2. Update invoices table
    await connection.query(`
      UPDATE invoices 
      SET user_id = ?, ticket_id = ?, client_name = ?, amount = ?, subtotal = ?, tax_amount = ?,
          cgst_amount = ?, sgst_amount = ?, igst_amount = ?, is_interstate = ?,
          original_estimate = ?, currency = ?, invoice_date = ?, due_date = ?,
          status = ?, notes = ?
      WHERE id = ?
    `, [
      userId || currentInv.user_id,
      resolvedTicketId,
      clientName || currentInv.client_name,
      calculated.grandTotal,
      calculated.subtotal,
      calculated.taxAmount,
      calculated.cgstAmount,
      calculated.sgstAmount,
      calculated.igstAmount,
      isInter,
      originalEstimate !== undefined && originalEstimate !== null ? parseFloat(originalEstimate) : currentInv.original_estimate,
      currency || currentInv.currency || 'INR',
      invoiceDate ? new Date(invoiceDate) : currentInv.invoice_date,
      dueDate ? new Date(dueDate) : currentInv.due_date,
      newStatus,
      notes !== undefined ? notes : currentInv.notes,
      effectiveId
    ]);

    // 3. Update line items if provided in payload
    if (shouldUpdateLineItems) {
      await connection.query('DELETE FROM invoice_line_items WHERE invoice_id = ?', [effectiveId]);

      for (const item of calculated.processedItems) {
        await connection.query(`
          INSERT INTO invoice_line_items (invoice_id, description, hsn_sac, quantity, unit_price, total, tax_rate, tax_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [effectiveId, item.description, item.hsn_sac, item.quantity, item.unit_price, item.total, item.tax_rate, item.tax_amount]);
      }
    }

    await connection.commit();
    logger.info(`Invoice updated: ${effectiveId} (Status: ${newStatus}, Amount: ${calculated.grandTotal})`);

    await logActivity(req.user.id, 'billing', 'update_invoice', 'invoices', effectiveId, {
      amount: calculated.grandTotal,
      status: newStatus,
      lineItemsCount: calculated.processedItems.length
    }, req.ip);

    return res.status(200).json(formatResponse(true, 'Invoice updated successfully.', {
      invoiceId: effectiveId,
      amount: calculated.grandTotal,
      status: newStatus
    }));

  } catch (error) {
    if (connection) {
      try { await connection.query('SET FOREIGN_KEY_CHECKS = 1'); } catch (_) { }
      await connection.rollback();
    }
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Finalize a Draft Invoice (Admins only)
 */
const finalizeInvoice = async (req, res, next) => {
  const { id } = req.params;

  // Commercial invoice finalization is strictly Admin only
  if (req.user?.role !== 'admin') {
    return res.status(403).json(formatResponse(false, 'Forbidden. Only administrators can finalize commercial invoices.'));
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [existing] = await connection.query('SELECT * FROM invoices WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json(formatResponse(false, 'Invoice not found.'));
    }

    const inv = existing[0];

    if (inv.status === 'Final' || inv.status === 'Paid') {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, 'This invoice is already finalized.'));
    }

    // Fetch line items
    const [lineItems] = await connection.query(
      'SELECT * FROM invoice_line_items WHERE invoice_id = ?',
      [id]
    );

    if (lineItems.length === 0) {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, 'Cannot finalize invoice with zero line items. Please add at least one line item.'));
    }

    // Validate line items
    for (const li of lineItems) {
      if (!li.description || !li.description.trim()) {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'All line items must have a valid description.'));
      }
      if (Number(li.quantity) <= 0) {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'Line item quantity must be greater than zero.'));
      }
      if (Number(li.unit_price) < 0) {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'Line item unit rate cannot be negative.'));
      }
    }

    // Recalculate totals server-side
    const calculated = calculateInvoiceTotals(lineItems, Boolean(inv.is_interstate));

    // Update invoice to Final
    await connection.query(`
      UPDATE invoices
      SET status = 'Final',
          amount = ?,
          subtotal = ?,
          tax_amount = ?,
          cgst_amount = ?,
          sgst_amount = ?,
          igst_amount = ?,
          finalized_at = NOW(),
          finalized_by = ?,
          updated_at = NOW()
      WHERE id = ?
    `, [
      calculated.grandTotal,
      calculated.subtotal,
      calculated.taxAmount,
      calculated.cgstAmount,
      calculated.sgstAmount,
      calculated.igstAmount,
      req.user.id,
      id
    ]);

    // Synchronize commercial total with associated ticket's payable charges (repair_cost),
    // keeping technician estimate (estimated_cost), diagnosis, and ticket status untouched
    let associatedTicket = null;
    if (inv.ticket_id) {
      const [tkRows] = await connection.query(
        'SELECT id, ticket_number, user_id, company_id, brand, model_number FROM service_requests WHERE id = ? LIMIT 1',
        [inv.ticket_id]
      );
      if (tkRows.length > 0) associatedTicket = tkRows[0];

      await connection.query(`
        UPDATE service_requests
        SET repair_cost = ?,
            updated_at = NOW()
        WHERE id = ?
      `, [calculated.grandTotal, inv.ticket_id]);
    }

    // Dispatch release notification to all authorized recipient users (customer & company)
    const recipientUserIds = new Set();
    if (inv.user_id) recipientUserIds.add(Number(inv.user_id));
    if (associatedTicket?.user_id) recipientUserIds.add(Number(associatedTicket.user_id));
    if (associatedTicket?.company_id) recipientUserIds.add(Number(associatedTicket.company_id));

    const ticketRef = associatedTicket?.ticket_number || (inv.ticket_id ? `#${inv.ticket_id}` : '');
    const refText = ticketRef ? ` for repair ticket ${ticketRef}` : '';
    const notifMsg = `Your commercial tax invoice #${id}${refText} (Amount: ₹${calculated.grandTotal.toFixed(2)}) has been finalized and released by administration. You may now review your final bill and complete payment.`;

    for (const recipientId of recipientUserIds) {
      try {
        await connection.query(
          `INSERT INTO notifications (user_id, ticket_id, title, message, sender_id)
           VALUES (?, ?, 'Invoice Finalized & Released', ?, ?)`,
          [recipientId, inv.ticket_id || null, notifMsg, req.user.id]
        );
      } catch (notifErr) {
        logger.warn(`Failed to dispatch release notification to user ${recipientId}: ${notifErr.message}`);
      }
    }

    await connection.commit();
    logger.info(`Invoice finalized: ${id} by Admin ${req.user.email} (Grand Total: ₹${calculated.grandTotal})`);

    await logActivity(req.user.id, 'billing', 'finalize_invoice', 'invoices', id, {
      grandTotal: calculated.grandTotal,
      subtotal: calculated.subtotal,
      taxAmount: calculated.taxAmount,
      ticketId: inv.ticket_id
    }, req.ip);

    return res.status(200).json(formatResponse(true, 'Invoice finalized successfully.', {
      invoiceId: id,
      status: 'Final',
      amount: calculated.grandTotal,
      subtotal: calculated.subtotal,
      taxAmount: calculated.taxAmount,
      cgstAmount: calculated.cgstAmount,
      sgstAmount: calculated.sgstAmount,
      igstAmount: calculated.igstAmount
    }));

  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Delete invoice (Admins only)
 */
const deleteInvoice = async (req, res, next) => {
  const { id } = req.params;
  let connection;

  try {
    connection = await pool.getConnection();

    const [existing] = await connection.query('SELECT id, status FROM invoices WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Invoice not found.'));
    }

    const { reason } = req.body || {};

    // Void / deactivate invoice keeping line items and financial history intact
    await connection.query(
      'UPDATE invoices SET is_active = FALSE, status = "Void", deactivated_at = NOW(), deactivated_by = ?, deactivation_reason = ? WHERE id = ?',
      [req.user ? req.user.id : null, reason || 'Voided / deactivated by admin', id]
    );

    logger.info(`Invoice voided/deactivated: ${id}`);
    return res.status(200).json(formatResponse(true, 'Invoice voided and deactivated successfully.'));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Reactivate / restore a voided invoice (Admins only)
 */
const reactivateInvoice = async (req, res, next) => {
  const { id } = req.params;
  let connection;

  try {
    connection = await pool.getConnection();

    const [existing] = await connection.query('SELECT id, status FROM invoices WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Invoice not found.'));
    }

    await connection.query(
      'UPDATE invoices SET is_active = TRUE, status = "Draft", deactivated_at = NULL, deactivated_by = NULL, deactivation_reason = NULL WHERE id = ?',
      [id]
    );

    logger.info(`Invoice reactivated: ${id}`);
    return res.status(200).json(formatResponse(true, 'Invoice reactivated successfully.'));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Helper to validate whether a repair ticket is currently eligible for payment.
 * Payment is available ONLY AFTER:
 * 1. Ticket belongs to the authorized user or company
 * 2. Active and not cancelled
 * 3. Not already paid
 * 4. Technician assigned
 * 5. Customer approval status is 'approved' (not rejected, on_hold, reapproval_requested, none)
 * 6. Repair work completed (status is 'completed' or 'delivered')
 * 7. Final amount confirmed by admin (> 0)
 */
const checkTicketPaymentEligibility = (ticket, user = null, options = {}) => {
  if (!ticket) {
    return { eligible: false, statusCode: 404, reason: 'Repair ticket not found.' };
  }

  // 1. Ownership & Authorization validation
  const ticketUserId = ticket.user_id ? Number(ticket.user_id) : null;
  const ticketCompanyId = ticket.company_id ? Number(ticket.company_id) : null;
  const isRegisteredTicket = Boolean(ticketUserId || ticketCompanyId);

  if (isRegisteredTicket && !options.allowSettlement) {
    if (!user) {
      if (ticketCompanyId) {
        return {
          eligible: false,
          statusCode: 401,
          reason: 'Authentication required. Please sign in to your corporate account to access payment for this ticket.'
        };
      }
      return {
        eligible: false,
        statusCode: 401,
        reason: 'Authentication required. Please sign in to your TekDoctor account to access payment for this ticket.'
      };
    }

    const authUserId = Number(user.id);
    const role = user.role;

    if (role === 'admin') {
      // Admins have full access to payment operations
    } else if (role === 'technician') {
      const assignedTechId = ticket.assigned_technician_id ? Number(ticket.assigned_technician_id) : null;
      const pendingTechId = ticket.pending_technician_id ? Number(ticket.pending_technician_id) : null;
      if (assignedTechId !== authUserId && pendingTechId !== authUserId) {
        return {
          eligible: false,
          statusCode: 403,
          reason: 'Forbidden: Technicians can only access payment for their assigned repair tickets.'
        };
      }
    } else if (role === 'customer') {
      if (ticketUserId && ticketUserId !== authUserId) {
        return {
          eligible: false,
          statusCode: 403,
          reason: 'Forbidden: You can only pay for your own repair tickets.'
        };
      }
      if (ticketCompanyId && !ticketUserId) {
        return {
          eligible: false,
          statusCode: 403,
          reason: 'Forbidden: You cannot pay for a corporate repair ticket with a personal customer account.'
        };
      }
    } else if (role === 'company') {
      if (ticketCompanyId && ticketCompanyId !== authUserId && ticketUserId !== authUserId) {
        return {
          eligible: false,
          statusCode: 403,
          reason: 'Forbidden: You can only pay for your corporate repair tickets.'
        };
      }
    } else {
      return {
        eligible: false,
        statusCode: 403,
        reason: 'Forbidden: Insufficient permissions.'
      };
    }
  }

  // 2. Active status check
  if (ticket.is_active === 0 || ticket.is_active === false) {
    return { eligible: false, statusCode: 400, reason: 'This repair ticket has been deactivated.' };
  }

  // 3. Payment status check
  if (ticket.payment_status === 'paid') {
    return { eligible: false, statusCode: 400, reason: 'This repair ticket has already been paid and settled.' };
  }

  // 4. Cancellation check
  if (ticket.status === 'cancelled') {
    return { eligible: false, statusCode: 400, reason: 'Payment cannot be processed for a cancelled repair ticket.' };
  }

  // 5. Customer estimate explicit rejection & hold checks
  const approvalStatus = ticket.customer_approval_status || 'none';
  if (approvalStatus === 'rejected') {
    return { eligible: false, statusCode: 400, reason: 'Repair estimate was rejected by the customer. Payment is not available for rejected repairs. If you wish to proceed, please request repair again.' };
  }
  if (approvalStatus === 'on_hold') {
    return { eligible: false, statusCode: 400, reason: 'This repair ticket is on hold awaiting customer estimate approval. Payment is not available until the estimate is approved and repair is completed.' };
  }
  if (approvalStatus === 'reapproval_requested') {
    return { eligible: false, statusCode: 400, reason: 'Re-approval has been requested for this repair. Payment will become available once the estimate is approved and repair is completed.' };
  }

  // 6. Technician assignment check
  if (!ticket.assigned_technician_id) {
    return { eligible: false, statusCode: 400, reason: 'Payment is available only after the repair has been completed. Technician has not been assigned yet.' };
  }

  // 7. General customer / company approval requirement
  if (approvalStatus !== 'approved') {
    return { eligible: false, statusCode: 400, reason: 'Payment requires prior customer approval of the repair estimate. Please review and approve the estimate first.' };
  }

  // 8. Repair completion check (Strict enforcement: only completed or delivered)
  if (ticket.status === 'pending') {
    return { eligible: false, statusCode: 400, reason: 'Payment is available only after the repair has been completed. Device inspection and repair are still pending.' };
  }
  if (ticket.status === 'in_progress') {
    return { eligible: false, statusCode: 400, reason: 'Payment is available only after the repair has been completed. Repair work is currently in progress.' };
  }
  if (ticket.status !== 'completed' && ticket.status !== 'delivered') {
    return { eligible: false, statusCode: 400, reason: 'Payment is available only after the repair has been completed.' };
  }

  // 9. Final Amount validation & Invoice Status Check
  const linkedInvoice = options.invoice || null;
  if (linkedInvoice) {
    if (linkedInvoice.status === 'Draft') {
      return {
        eligible: false,
        statusCode: 400,
        reason: 'Repair invoice is currently in Draft review. Payment will become available once Admin finalizes the commercial invoice.'
      };
    }
    if (linkedInvoice.status === 'Void' || linkedInvoice.is_active === false || linkedInvoice.is_active === 0) {
      return {
        eligible: false,
        statusCode: 400,
        reason: 'This repair invoice has been voided and cannot be paid.'
      };
    }
    if (linkedInvoice.status !== 'Final' && !(options.allowSettlement && linkedInvoice.status === 'Paid')) {
      return {
        eligible: false,
        statusCode: 400,
        reason: 'Repair invoice has not been finalized yet. Payment will become available once Admin finalizes the commercial invoice.'
      };
    }
    const payableAmount = parseFloat(linkedInvoice.amount || 0);
    if (payableAmount <= 0) {
      return { eligible: false, statusCode: 400, reason: 'The repair charges have not been assessed or set by the Admin yet. Please wait for the final repair charges before initiating payment.' };
    }
    return { eligible: true, statusCode: 200, payableAmount, reason: 'Repair completed and invoice finalized. Payment is now available.' };
  }

  const payableAmount = parseFloat(ticket.repair_cost || 0);
  if (payableAmount <= 0) {
    return { eligible: false, statusCode: 400, reason: 'The repair charges have not been assessed or set by the Admin yet. Please wait for the final repair charges before initiating payment.' };
  }

  return { eligible: true, statusCode: 200, payableAmount, reason: 'Repair completed. Payment is now available.' };
};

/**
 * Check payment eligibility for a repair ticket
 */
const getPaymentEligibility = async (req, res, next) => {
  const ticketId = req.params.ticketId || req.query.ticketId || req.query.ticketNumber;
  if (!ticketId) {
    return res.status(400).json(formatResponse(false, 'Ticket ID or ticket number is required.'));
  }

  let connection;
  try {
    connection = await pool.getConnection();
    const isNumeric = !isNaN(Number(ticketId)) && /^\d+$/.test(String(ticketId));
    const [tickets] = await connection.query(
      isNumeric
        ? 'SELECT * FROM service_requests WHERE id = ? OR ticket_number = ? LIMIT 1'
        : 'SELECT * FROM service_requests WHERE ticket_number = ? LIMIT 1',
      isNumeric ? [Number(ticketId), String(ticketId)] : [String(ticketId)]
    );

    if (tickets.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair ticket not found.'));
    }

    const ticket = tickets[0];
    const [invRows] = await connection.query(
      'SELECT * FROM invoices WHERE ticket_id = ? AND is_active = TRUE ORDER BY id DESC LIMIT 1',
      [ticket.id]
    );
    const linkedInvoice = invRows.length > 0 ? invRows[0] : null;

    const eligibility = checkTicketPaymentEligibility(ticket, req.user, { invoice: linkedInvoice });
    if (!eligibility.eligible && (eligibility.statusCode === 401 || eligibility.statusCode === 403)) {
      return res.status(eligibility.statusCode).json(formatResponse(false, eligibility.reason, {
        eligible: false,
        reason: eligibility.reason
      }));
    }
    const canSwitch = Boolean(
      ticket.payment_status === 'pending_verification' &&
      ticket.payment_method === 'cash' &&
      ticket.collection_status !== 'collected'
    );

    return res.status(200).json(formatResponse(true, eligibility.reason, {
      eligible: eligibility.eligible,
      status: ticket.status,
      customerApprovalStatus: ticket.customer_approval_status,
      paymentStatus: ticket.payment_status,
      collectionStatus: ticket.collection_status || 'not_applicable',
      paymentId: ticket.payment_id || null,
      paymentMethod: ticket.payment_method || null,
      canSwitchPaymentMethod: canSwitch,
      amount: eligibility.payableAmount || (linkedInvoice ? parseFloat(linkedInvoice.amount) : parseFloat(ticket.repair_cost || 0)),
      invoiceId: linkedInvoice ? linkedInvoice.id : null,
      invoiceStatus: linkedInvoice ? linkedInvoice.status : null,
      currency: 'INR',
      reason: eligibility.reason
    }));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Create a Razorpay payment order for a repair ticket or invoice
 */
const createPaymentOrder = async (req, res, next) => {
  const reqBody = req.body || {};
  const ticketId = reqBody.ticketId || reqBody.ticket_id;
  const invoiceId = reqBody.invoiceId || reqBody.invoice_id;
  const ticketNumber = reqBody.ticketNumber || reqBody.ticket_number;
  let connection;

  try {
    connection = await pool.getConnection();

    let targetTicket = null;
    let targetInvoice = null;
    let payableAmount = 0;
    let targetUserId = req.user ? req.user.id : null;
    let targetCompanyId = null;
    let customerName = req.user ? req.user.name : 'Customer';
    let customerEmail = req.user ? req.user.email : '';
    let customerPhone = '';
    let description = 'TekDoctor Repair Payment';

    // 1. If Ticket ID or Ticket Number provided
    if (ticketId || ticketNumber) {
      const searchIdentifier = ticketId || ticketNumber;
      const isNumeric = !isNaN(Number(searchIdentifier)) && /^\d+$/.test(String(searchIdentifier));
      const [tickets] = await connection.query(
        isNumeric
          ? 'SELECT * FROM service_requests WHERE id = ? OR ticket_number = ? LIMIT 1'
          : 'SELECT * FROM service_requests WHERE ticket_number = ? LIMIT 1',
        isNumeric ? [Number(searchIdentifier), String(searchIdentifier)] : [String(searchIdentifier)]
      );

      if (tickets.length === 0) {
        return res.status(404).json(formatResponse(false, 'Repair ticket not found.'));
      }

      targetTicket = tickets[0];
      targetUserId = targetTicket.user_id || (req.user ? req.user.id : null);
      targetCompanyId = targetTicket.company_id || null;
      customerName = targetTicket.customer_name || customerName;
      customerEmail = targetTicket.email || customerEmail;
      customerPhone = targetTicket.mobile || '';

      const [invRows] = await connection.query(
        'SELECT * FROM invoices WHERE ticket_id = ? AND is_active = TRUE ORDER BY id DESC LIMIT 1',
        [targetTicket.id]
      );
      const linkedInvoice = invRows.length > 0 ? invRows[0] : null;
      if (linkedInvoice) targetInvoice = linkedInvoice;

      const eligibility = checkTicketPaymentEligibility(targetTicket, req.user, { invoice: linkedInvoice });
      if (!eligibility.eligible) {
        const statusCode = eligibility.statusCode || 400;
        return res.status(statusCode).json(formatResponse(false, eligibility.reason));
      }

      // If cash has already been collected, block online checkout
      if (targetTicket.collection_status === 'collected') {
        return res.status(400).json(formatResponse(false, 'Cash has already been collected for this repair. Online checkout is not available.'));
      }

      payableAmount = eligibility.payableAmount;
      description = `Repair Payment - Ticket #${targetTicket.ticket_number || targetTicket.id}`;
    } else if (invoiceId) {
      // 2. If Invoice ID provided
      const [invoices] = await connection.query(
        'SELECT * FROM invoices WHERE id = ? LIMIT 1',
        [invoiceId]
      );

      if (invoices.length === 0) {
        return res.status(404).json(formatResponse(false, 'Invoice not found.'));
      }

      targetInvoice = invoices[0];
      targetUserId = targetInvoice.user_id || (req.user ? req.user.id : null);
      customerName = targetInvoice.client_name || customerName;

      // Ownership check for invoices
      if (targetInvoice.user_id) {
        if (!req.user) {
          return res.status(401).json(formatResponse(false, 'Authentication required. Please sign in to pay this invoice.'));
        }
        if ((req.user.role === 'customer' || req.user.role === 'company') && targetInvoice.user_id !== req.user.id) {
          return res.status(403).json(formatResponse(false, 'Forbidden: You can only pay your own invoices.'));
        }
      }

      if (targetInvoice.status === 'Paid') {
        return res.status(400).json(formatResponse(false, 'This invoice is already paid.'));
      }

      if (targetInvoice.status === 'Draft') {
        return res.status(400).json(formatResponse(false, 'This invoice is currently in Draft review and cannot be paid until finalized by an administrator.'));
      }

      if (targetInvoice.status === 'Void' || targetInvoice.is_active === false || targetInvoice.is_active === 0) {
        return res.status(400).json(formatResponse(false, 'This invoice has been voided and cannot be paid.'));
      }

      // Check if this invoice belongs to a corporate account
      if (req.user && req.user.role === 'company') {
        targetCompanyId = req.user.id;
      }
      if (targetUserId) {
        const [cpRows] = await connection.query('SELECT user_id, company_name, phone_number FROM company_profiles WHERE user_id = ? LIMIT 1', [targetUserId]);
        if (cpRows.length > 0) {
          targetCompanyId = cpRows[0].user_id;
          if (!customerName || customerName === 'Customer') customerName = cpRows[0].company_name;
          if (!customerPhone && cpRows[0].phone_number) customerPhone = cpRows[0].phone_number;
        }
        if (!customerEmail) {
          const [uEmailRows] = await connection.query('SELECT email FROM users WHERE id = ? LIMIT 1', [targetUserId]);
          if (uEmailRows.length > 0 && uEmailRows[0].email) customerEmail = uEmailRows[0].email;
        }
      }

      // Check linked repair ticket if this invoice is tied to a repair
      if (targetInvoice.ticket_id) {
        const [linkedTks] = await connection.query(
          'SELECT * FROM service_requests WHERE id = ? LIMIT 1',
          [targetInvoice.ticket_id]
        );
        if (linkedTks.length > 0) {
          const lTicket = linkedTks[0];
          if (lTicket.collection_status === 'collected') {
            return res.status(400).json(formatResponse(false, 'Cash has already been collected for this repair. Online checkout is not available.'));
          }
          if (lTicket.company_id) targetCompanyId = lTicket.company_id;
          const lEligibility = checkTicketPaymentEligibility(lTicket, req.user, { invoice: targetInvoice });
          if (!lEligibility.eligible) {
            const lStatusCode = lEligibility.statusCode || 400;
            return res.status(lStatusCode).json(formatResponse(false, `Associated repair ticket payment blocked: ${lEligibility.reason}`));
          }
        }
      }

      payableAmount = parseFloat(targetInvoice.amount);
      description = `Invoice Payment - #${targetInvoice.id}`;
    } else {
      return res.status(400).json(formatResponse(false, 'Please provide either ticketId, ticketNumber, or invoiceId to initiate payment.'));
    }

    const currency = config.razorpay?.currency || 'INR';
    const amountInPaise = Math.round(payableAmount * 100);
    const receipt = targetInvoice ? `rcpt_inv_${targetInvoice.id}` : `rcpt_tk_${targetTicket.id}`;

    const orderResult = await callRazorpayCreateOrder({
      amountInPaise,
      currency,
      receipt,
      notes: {
        ticketId: targetTicket ? targetTicket.id : null,
        ticketNumber: targetTicket ? targetTicket.ticket_number : null,
        invoiceId: targetInvoice ? targetInvoice.id : null,
        userId: targetUserId,
        companyId: targetCompanyId
      }
    });

    if (!orderResult.success || !orderResult.order) {
      return res.status(503).json(formatResponse(false, orderResult.error || 'Payment gateway is not configured. Please contact support.'));
    }

    const razorpayOrder = orderResult.order;

    // Record initial order in payments table
    await connection.query(
      `INSERT INTO payments (order_id, ticket_id, invoice_id, user_id, company_id, amount, currency, status, gateway)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'created', 'razorpay')`,
      [
        razorpayOrder.id,
        targetTicket ? targetTicket.id : null,
        targetInvoice ? targetInvoice.id : null,
        targetUserId,
        targetCompanyId,
        payableAmount,
        currency
      ]
    );

    logger.info(`Payment order created: ${razorpayOrder.id} for amount ₹${payableAmount} (ticket: ${targetTicket?.ticket_number || 'none'}, invoice: ${targetInvoice?.id || 'none'})`);

    const keyId = config.razorpay?.keyId || '';
    const isRealKey = Boolean(keyId.startsWith('rzp_live_') || keyId.startsWith('rzp_test_')) && !keyId.includes('demo') && !keyId.includes('YourKeyId');

    return res.status(200).json(formatResponse(true, 'Payment order created successfully.', {
      orderId: razorpayOrder.id,
      amount: payableAmount,
      amountInPaise,
      currency,
      keyId: isRealKey ? keyId : '',
      ticketId: targetTicket ? targetTicket.id : null,
      ticketNumber: targetTicket ? targetTicket.ticket_number : null,
      invoiceId: targetInvoice ? targetInvoice.id : null,
      customerName,
      customerEmail,
      customerPhone,
      description
    }));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Core Authoritative Payment Settlement (Internal Engine)
 * 
 * Safely invoked by:
 * 1. verifyPayment (after successful client browser HMAC verification)
 * 2. handleRazorpayWebhook (after successful raw webhook HMAC verification)
 *
 * Concurrency-safe: uses SELECT ... FOR UPDATE transactions.
 * Idempotent: detects already-paid invoices/tickets/orders and returns clean 200 without duplicate mutations.
 * Anti-tamper: checks webhookAmount in paise and currency against authoritative order amount.
 */
const processAuthoritativePaymentSettlement = async ({
  orderId,
  paymentId,
  paymentMethod = 'card',
  ticketId = null,
  invoiceId = null,
  ticketNumber = null,
  webhookAmount = null,
  currency = 'INR',
  gatewayResponse = null,
  user = null,
  ip = '127.0.0.1'
}) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    let resolvedTicketId = ticketId;
    let resolvedInvoiceId = invoiceId;

    if (!resolvedTicketId && ticketNumber) {
      const [tRows] = await connection.query('SELECT id FROM service_requests WHERE ticket_number = ? LIMIT 1', [ticketNumber]);
      if (tRows.length > 0) resolvedTicketId = tRows[0].id;
    }

    // 1. Lock and inspect existing payment record
    const [pmtRows] = await connection.query('SELECT * FROM payments WHERE order_id = ? FOR UPDATE', [orderId]);
    let paymentRecord = pmtRows.length > 0 ? pmtRows[0] : null;

    if (paymentRecord) {
      if (!resolvedTicketId && paymentRecord.ticket_id) resolvedTicketId = paymentRecord.ticket_id;
      if (!resolvedInvoiceId && paymentRecord.invoice_id) resolvedInvoiceId = paymentRecord.invoice_id;

      // Currency check
      if (currency && paymentRecord.currency && String(currency).toUpperCase() !== String(paymentRecord.currency).toUpperCase()) {
        await connection.rollback();
        logger.warn(`Currency mismatch for order ${orderId}: gateway received ${currency}, expected ${paymentRecord.currency}`);
        return { success: false, statusCode: 400, message: 'Payment verification failed: Currency mismatch.' };
      }

      // Webhook amount mismatch verification in paise
      if (webhookAmount !== undefined && webhookAmount !== null) {
        const expectedPaise = Math.round(parseFloat(paymentRecord.amount) * 100);
        if (Number(webhookAmount) !== expectedPaise) {
          await connection.rollback();
          logger.warn(`Payment amount mismatch for order ${orderId}: received ${webhookAmount} paise, expected ${expectedPaise} paise`);
          return { success: false, statusCode: 400, message: 'Payment verification failed: Amount mismatch between gateway order and capture.' };
        }
      }

      // Concurrency / Idempotency check: already marked paid
      if (paymentRecord.status === 'paid') {
        await connection.commit();
        let existingGuestToken = null;
        if (resolvedTicketId || resolvedInvoiceId) {
          existingGuestToken = generateGuestInvoiceAccessToken({
            ticketId: resolvedTicketId,
            ticketNumber: ticketNumber || null,
            invoiceId: resolvedInvoiceId,
            userId: paymentRecord.user_id,
            email: null
          });
        }
        return {
          success: true,
          statusCode: 200,
          alreadySettled: true,
          message: 'Payment already verified and settled for this order.',
          data: {
            paymentId: paymentRecord.payment_id || paymentId,
            orderId,
            amount: parseFloat(paymentRecord.amount),
            status: 'paid',
            ticketId: resolvedTicketId,
            invoiceId: resolvedInvoiceId,
            paymentMethod: paymentRecord.payment_method || paymentMethod,
            paidAt: paymentRecord.created_at || new Date().toISOString(),
            invoiceAccessToken: existingGuestToken,
            token: existingGuestToken
          }
        };
      }
    }

    let finalAmount = paymentRecord ? parseFloat(paymentRecord.amount) : 0;
    let finalUserId = paymentRecord ? paymentRecord.user_id : (user ? user.id : null);
    let finalCompanyId = paymentRecord ? paymentRecord.company_id : null;
    let itemDescription = 'Device Repair';

    // 2. Update Service Request if applicable
    if (resolvedTicketId) {
      const [tkRows] = await connection.query('SELECT * FROM service_requests WHERE id = ? FOR UPDATE', [resolvedTicketId]);
      if (tkRows.length > 0) {
        const ticket = tkRows[0];

        if (ticket.payment_status === 'paid') {
          // Already settled - do not overwrite existing successful payment
          const [invRows] = await connection.query('SELECT id FROM invoices WHERE ticket_id = ? ORDER BY id DESC LIMIT 1', [ticket.id]);
          const existingInvId = invRows.length > 0 ? invRows[0].id : null;
          const invoiceAccessToken = generateGuestInvoiceAccessToken({
            ticketId: ticket.id,
            ticketNumber: ticket.ticket_number,
            invoiceId: existingInvId,
            userId: ticket.user_id,
            email: ticket.email
          });
          await connection.commit();
          return {
            success: true,
            statusCode: 200,
            alreadySettled: true,
            message: 'Payment already verified and settled for this ticket.',
            data: {
              ticketId: resolvedTicketId,
              paymentId: ticket.payment_id,
              status: 'paid',
              invoiceAccessToken,
              token: invoiceAccessToken
            }
          };
        }

        // If cash has already been collected, block online verification
        if (ticket.collection_status === 'collected') {
          await connection.rollback();
          return { success: false, statusCode: 400, message: 'Cash has already been collected for this repair ticket. Online payment settlement blocked.' };
        }

        // Strict post-completion verification guard against uncompleted, rejected, cancelled, on_hold, or unapproved ticket payments
        const eligibility = checkTicketPaymentEligibility(ticket, user, { allowSettlement: true });
        if (!eligibility.eligible) {
          await connection.rollback();
          logger.warn(`Security block: Rejected payment verification for ticket ${ticket.ticket_number || ticket.id} (status: ${ticket.status}, approval: ${ticket.customer_approval_status}): ${eligibility.reason}`);
          return { success: false, statusCode: 400, message: `Payment settlement blocked: ${eligibility.reason}` };
        }

        if (!finalAmount) finalAmount = parseFloat(ticket.repair_cost || eligibility.payableAmount || 150.00);
        if (!finalUserId) finalUserId = ticket.user_id;
        if (!finalCompanyId) finalCompanyId = ticket.company_id;
        itemDescription = `Device Repair Service - Ticket #${ticket.ticket_number || ticket.id}`;

        await connection.query(
          `UPDATE service_requests 
           SET payment_status = 'paid', 
               payment_id = ?, 
               payment_order_id = ?, 
               payment_method = ?, 
               collection_status = 'not_applicable',
               paid_at = NOW() 
           WHERE id = ?`,
          [paymentId, orderId, paymentMethod, resolvedTicketId]
        );

        // Safely cancel / supersede any pending uncollected cash / offline payment records for this ticket
        await connection.query(
          `UPDATE payments 
           SET status = 'cancelled', 
               reference_note = CONCAT(COALESCE(reference_note, ''), ' | Superseded by online payment') 
           WHERE ticket_id = ? 
             AND status = 'pending_verification' 
             AND collection_status != 'collected'`,
          [resolvedTicketId]
        );
      }
    }

    // 3. Update or Auto-generate Invoice
    if (resolvedInvoiceId) {
      const [invRows] = await connection.query('SELECT * FROM invoices WHERE id = ? FOR UPDATE', [resolvedInvoiceId]);
      if (invRows.length > 0) {
        // Idempotency check for already settled invoices
        if (invRows[0].status === 'Paid') {
          const [invTicket] = invRows[0].ticket_id
            ? await connection.query('SELECT id, ticket_number, user_id, email FROM service_requests WHERE id = ? LIMIT 1', [invRows[0].ticket_id])
            : [[]];
          const ticketObj = invTicket.length > 0 ? invTicket[0] : null;
          const invoiceAccessToken = generateGuestInvoiceAccessToken({
            ticketId: ticketObj?.id || null,
            ticketNumber: ticketObj?.ticket_number || null,
            invoiceId: resolvedInvoiceId,
            userId: invRows[0].user_id || ticketObj?.user_id,
            email: ticketObj?.email
          });
          await connection.commit();
          return {
            success: true,
            statusCode: 200,
            alreadySettled: true,
            message: 'Payment already verified and settled for this invoice.',
            data: {
              invoiceId: resolvedInvoiceId,
              paymentId: invRows[0].payment_id || paymentId,
              status: 'Paid',
              invoiceAccessToken,
              token: invoiceAccessToken
            }
          };
        }

        if (invRows[0].ticket_id) {
          const [lTks] = await connection.query('SELECT * FROM service_requests WHERE id = ? LIMIT 1', [invRows[0].ticket_id]);
          if (lTks.length > 0 && lTks[0].payment_status !== 'paid') {
            const lEligibility = checkTicketPaymentEligibility(lTks[0], user, { allowSettlement: true });
            if (!lEligibility.eligible) {
              await connection.rollback();
              return { success: false, statusCode: 400, message: `Payment settlement blocked: ${lEligibility.reason}` };
            }
          }
        }

        if (!finalAmount) finalAmount = parseFloat(invRows[0].amount);
        if (!finalUserId) finalUserId = invRows[0].user_id;
        if (!finalCompanyId && invRows[0].user_id) {
          const [cpCheck] = await connection.query('SELECT user_id FROM company_profiles WHERE user_id = ? LIMIT 1', [invRows[0].user_id]);
          if (cpCheck.length > 0) finalCompanyId = cpCheck[0].user_id;
        }

        await connection.query(
          `UPDATE invoices 
           SET status = 'Paid', 
               payment_id = ?, 
               payment_order_id = ?, 
               payment_method = ?, 
               paid_at = NOW() 
           WHERE id = ?`,
          [paymentId, orderId, paymentMethod, resolvedInvoiceId]
        );

        // Safely cancel / supersede any pending uncollected cash / offline payment records for this invoice
        await connection.query(
          `UPDATE payments 
           SET status = 'cancelled', 
               reference_note = CONCAT(COALESCE(reference_note, ''), ' | Superseded by online payment') 
           WHERE invoice_id = ? 
             AND status = 'pending_verification' 
             AND collection_status != 'collected'`,
          [resolvedInvoiceId]
        );
      }
    } else if (resolvedTicketId) {
      // Check if an invoice already exists for this ticket
      const [existingInv] = await connection.query('SELECT id FROM invoices WHERE ticket_id = ? AND is_active = TRUE ORDER BY id DESC LIMIT 1 FOR UPDATE', [resolvedTicketId]);
      if (existingInv.length > 0) {
        resolvedInvoiceId = existingInv[0].id;
        await connection.query(
          `UPDATE invoices 
           SET status = 'Paid', 
               payment_id = ?, 
               payment_order_id = ?, 
               payment_method = ?, 
               paid_at = NOW() 
           WHERE id = ?`,
          [paymentId, orderId, paymentMethod, resolvedInvoiceId]
        );
      } else if (finalUserId) {
        // Auto-generate official paid invoice
        resolvedInvoiceId = await generateInvoiceId(connection);
        const [uRows] = await connection.query('SELECT name FROM users WHERE id = ? LIMIT 1', [finalUserId]);
        const clientName = uRows.length > 0 ? uRows[0].name : 'Customer';

        await connection.query(
          `INSERT INTO invoices (id, user_id, client_name, amount, currency, invoice_date, due_date, status, notes, payment_id, payment_order_id, payment_method, ticket_id, paid_at)
           VALUES (?, ?, ?, ?, 'INR', NOW(), NOW(), 'Paid', ?, ?, ?, ?, ?, NOW())`,
          [resolvedInvoiceId, finalUserId, clientName, finalAmount, itemDescription, paymentId, orderId, paymentMethod, resolvedTicketId]
        );

        await connection.query(
          `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total)
           VALUES (?, ?, 1, ?, ?)`,
          [resolvedInvoiceId, itemDescription, finalAmount, finalAmount]
        );
      }
    }

    // 4. Update or insert Payments table record
    const gatewayPayloadToStore = gatewayResponse
      ? JSON.stringify(gatewayResponse)
      : JSON.stringify({ payment_id: paymentId, order_id: orderId, method: paymentMethod });

    if (paymentRecord) {
      await connection.query(
        `UPDATE payments 
         SET status = 'paid', 
             payment_id = ?, 
             payment_method = ?, 
             ticket_id = COALESCE(ticket_id, ?),
             invoice_id = COALESCE(invoice_id, ?),
             company_id = COALESCE(company_id, ?),
             user_id = COALESCE(user_id, ?),
             gateway_response = ? 
         WHERE order_id = ?`,
        [
          paymentId,
          paymentMethod,
          resolvedTicketId || null,
          resolvedInvoiceId || null,
          finalCompanyId || null,
          finalUserId || null,
          gatewayPayloadToStore,
          orderId
        ]
      );
    } else {
      await connection.query(
        `INSERT INTO payments (payment_id, order_id, ticket_id, invoice_id, user_id, company_id, amount, currency, payment_method, status, gateway, gateway_response)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'INR', ?, 'paid', 'razorpay', ?)`,
        [
          paymentId,
          orderId,
          resolvedTicketId || null,
          resolvedInvoiceId || null,
          finalUserId,
          finalCompanyId,
          finalAmount,
          paymentMethod,
          gatewayPayloadToStore
        ]
      );
    }

    await connection.commit();

    logger.info(`Authoritative payment settled: Order ${orderId}, Payment ${paymentId}, Amount ₹${finalAmount}`);

    // 5. Log Activity & Notifications (only once on first settlement)
    if (finalUserId) {
      await logActivity(finalUserId, 'billing', 'payment_success', 'service_requests', resolvedTicketId || resolvedInvoiceId, {
        paymentId,
        orderId,
        amount: finalAmount,
        method: paymentMethod
      }, ip);
    }

    // Notifications to Admin & Tech
    try {
      let customerName = 'Customer';
      let ticketRef = resolvedTicketId ? `#${resolvedTicketId}` : (resolvedInvoiceId ? `Invoice #${resolvedInvoiceId}` : 'N/A');
      let deviceInfo = 'Device Repair';

      if (resolvedTicketId) {
        const [tks] = await connection.query(
          'SELECT ticket_number, customer_name, brand, model_number, device_category FROM service_requests WHERE id = ? LIMIT 1',
          [resolvedTicketId]
        );
        if (tks.length > 0) {
          const t = tks[0];
          if (t.customer_name) customerName = t.customer_name;
          if (t.ticket_number) ticketRef = t.ticket_number;
          const dev = `${t.brand || ''} ${t.model_number || ''}`.trim() || t.device_category;
          if (dev) deviceInfo = dev;
        }
      }

      if (customerName === 'Customer' && finalUserId) {
        const [usrs] = await connection.query('SELECT name, email FROM users WHERE id = ? LIMIT 1', [finalUserId]);
        if (usrs.length > 0 && usrs[0].name) {
          customerName = usrs[0].name;
        }
      }

      const paymentTimestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const adminMessage = [
        `Customer: ${customerName}`,
        `Repair Ticket: ${ticketRef} (Ticket ID: ${ticketRef})`,
        `Device: ${deviceInfo}`,
        `Amount Paid: ₹${finalAmount.toFixed(2)} (Amount: ₹${finalAmount.toFixed(2)})`,
        `Payment Date: ${paymentTimestamp}`,
        `Status: Paid`,
        `Transaction ID: ${paymentId} | Ref: ${paymentId}`
      ].join(' | ');

      const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin'");
      for (const admin of admins) {
        await connection.query(
          `INSERT INTO notifications (user_id, ticket_id, title, message, sender_id)
           VALUES (?, ?, 'Payment Received Successfully', ?, ?)`,
          [admin.id, resolvedTicketId || null, adminMessage, finalUserId || null]
        );
      }
    } catch (e) {
      logger.debug('Admin payment notification error: ' + e.message);
    }

    if (resolvedTicketId) {
      try {
        await notifyTechnicianOnPayment({
          connection,
          ticketId: resolvedTicketId,
          paymentId,
          amount: finalAmount,
          senderId: finalUserId || null,
          paymentMethod
        });
      } catch (techNotifErr) {
        logger.debug('Technician payment notification error: ' + techNotifErr.message);
      }
    }

    // Generate guest token
    let customerEmail = null;
    let ticketNum = null;
    if (resolvedTicketId) {
      const [tks] = await connection.query('SELECT ticket_number, email FROM service_requests WHERE id = ? LIMIT 1', [resolvedTicketId]);
      if (tks.length > 0) {
        customerEmail = tks[0].email;
        ticketNum = tks[0].ticket_number;
      }
    }
    if (!customerEmail && finalUserId) {
      const [uRows] = await connection.query('SELECT email FROM users WHERE id = ? LIMIT 1', [finalUserId]);
      if (uRows.length > 0) customerEmail = uRows[0].email;
    }

    const invoiceAccessToken = generateGuestInvoiceAccessToken({
      ticketId: resolvedTicketId,
      ticketNumber: ticketNum,
      invoiceId: resolvedInvoiceId,
      userId: finalUserId,
      email: customerEmail
    });

    return {
      success: true,
      statusCode: 200,
      message: 'Payment verified and recorded successfully.',
      data: {
        paymentId,
        orderId,
        amount: finalAmount,
        status: 'paid',
        ticketId: resolvedTicketId,
        invoiceId: resolvedInvoiceId,
        paymentMethod,
        paidAt: new Date().toISOString(),
        invoiceAccessToken,
        token: invoiceAccessToken
      }
    };
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Verify Razorpay payment signature from client browser checkout.
 * Requires genuine HMAC signature (orderId|paymentId). Never accepts any bypass sentinel.
 */
const verifyPayment = async (req, res, next) => {
  const reqBody = req.body || {};
  const razorpay_order_id = reqBody.razorpay_order_id || reqBody.orderId || reqBody.order_id;
  const razorpay_payment_id = reqBody.razorpay_payment_id || reqBody.paymentId || reqBody.payment_id;
  const razorpay_signature = reqBody.razorpay_signature || reqBody.signature;
  const ticketId = reqBody.ticketId || reqBody.ticket_id;
  const invoiceId = reqBody.invoiceId || reqBody.invoice_id;
  const ticketNumber = reqBody.ticketNumber || reqBody.ticket_number;
  const paymentMethod = reqBody.paymentMethod || reqBody.payment_method || 'card';

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json(formatResponse(false, 'Payment verification failed: Missing order, payment reference, or signature.'));
  }

  // Strict client HMAC verification (order_id|payment_id). No bypass markers are ever accepted.
  const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) {
    logger.warn(`Signature verification failed for order ${razorpay_order_id} / payment ${razorpay_payment_id}`);
    try {
      const conn = await pool.getConnection();
      await conn.query("UPDATE payments SET status = 'failed', error_message = 'Invalid payment signature. Verification failed.' WHERE order_id = ? AND status != 'paid'", [razorpay_order_id]);
      const [pmts] = await conn.query("SELECT user_id, ticket_id FROM payments WHERE order_id = ? LIMIT 1", [razorpay_order_id]);
      let targetUid = pmts.length > 0 ? pmts[0].user_id : (req.user ? req.user.id : null);
      let targetTkId = pmts.length > 0 ? pmts[0].ticket_id : (ticketId || null);
      if (!targetUid && targetTkId) {
        const [tks] = await conn.query("SELECT user_id FROM service_requests WHERE id = ? LIMIT 1", [targetTkId]);
        if (tks.length > 0) targetUid = tks[0].user_id;
      }
      if (targetUid) {
        await conn.query(
          `INSERT INTO notifications (user_id, ticket_id, title, message, sender_id)
           VALUES (?, ?, 'Payment Failed', 'Sir, your payment could not be completed and has failed. Please try again.', NULL)`,
          [targetUid, targetTkId || null]
        );
      }
      conn.release();
    } catch (e) {
      logger.debug('Signature verification failure notification error: ' + e.message);
    }
    return res.status(400).json(formatResponse(false, 'Sir, your payment could not be completed and has failed. Please try again.'));
  }

  try {
    const result = await processAuthoritativePaymentSettlement({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      paymentMethod,
      ticketId,
      invoiceId,
      ticketNumber,
      user: req.user,
      ip: req.ip
    });
    return res.status(result.statusCode).json(formatResponse(result.success, result.message, result.data));
  } catch (error) {
    next(error);
  }
};

/**
 * Get payment transactions list (Admin views all, Customer/Company views their own)
 */
const getPayments = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const { role, id: authUserId } = req.user;
    const { status, ticketId, invoiceId } = req.query;

    let query = `
      SELECT p.*, 
             sr.ticket_number, 
             sr.brand, 
             sr.model_number, 
             sr.customer_name as ticket_customer_name,
             inv.client_name as invoice_client_name,
             u_collector.name as collector_name,
             u_verifier.name as verifier_name
      FROM payments p
      LEFT JOIN service_requests sr ON p.ticket_id = sr.id
      LEFT JOIN invoices inv ON p.invoice_id = inv.id
      LEFT JOIN users u_collector ON p.collected_by = u_collector.id
      LEFT JOIN users u_verifier ON p.verified_by = u_verifier.id
      WHERE 1=1
    `;
    const params = [];

    if (role === 'customer' || role === 'company') {
      query += ' AND (p.user_id = ? OR p.company_id = ?)';
      params.push(authUserId, authUserId);
    } else if (role === 'technician') {
      // Technicians can only view payments associated with tickets assigned to them
      query += ' AND p.ticket_id IN (SELECT id FROM service_requests WHERE assigned_technician_id = ? OR pending_technician_id = ?)';
      params.push(authUserId, authUserId);
    } else if (role === 'admin' && (req.headers['x-company-id'] || req.query.companyId || req.query.userId)) {
      const targetId = req.headers['x-company-id'] || req.query.companyId || req.query.userId;
      query += ' AND (p.user_id = ? OR p.company_id = ?)';
      params.push(targetId, targetId);
    }

    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }

    if (ticketId) {
      query += ' AND p.ticket_id = ?';
      params.push(ticketId);
    }

    if (invoiceId) {
      query += ' AND p.invoice_id = ?';
      params.push(invoiceId);
    }

    query += ' ORDER BY p.created_at DESC';

    const [rows] = await connection.query(query, params);

    const formattedPayments = rows.map(p => ({
      id: p.id,
      paymentId: p.payment_id,
      orderId: p.order_id,
      ticketId: p.ticket_id,
      ticketNumber: p.ticket_number,
      invoiceId: p.invoice_id,
      userId: p.user_id,
      companyId: p.company_id,
      amount: parseFloat(p.amount),
      currency: p.currency,
      paymentMethod: p.payment_method,
      status: p.status,
      gateway: p.gateway,
      collectionStatus: p.collection_status || 'not_applicable',
      collectedBy: p.collected_by || null,
      collectorName: p.collector_name || null,
      collectedAt: p.collected_at || null,
      verificationStatus: p.verification_status || 'pending',
      verifiedBy: p.verified_by || null,
      verifierName: p.verifier_name || null,
      verifiedAt: p.verified_at || null,
      referenceNote: p.reference_note || null,
      errorMessage: p.error_message || null,
      clientName: p.ticket_customer_name || p.invoice_client_name || 'Customer',
      deviceInfo: p.brand ? `${p.brand} ${p.model_number || ''}`.trim() : null,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }));

    return res.status(200).json(formatResponse(true, 'Payment history fetched successfully.', formattedPayments));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Handle Razorpay Webhooks
 */
const handleRazorpayWebhook = async (req, res, next) => {
  const webhookSecret = config.razorpay?.webhookSecret;
  const signature = req.headers['x-razorpay-signature'];

  // Fail closed: reject unauthenticated or unsigned webhooks
  if (!webhookSecret) {
    logger.warn('Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not configured. Rejecting.');
    return res.status(400).json({ status: 'invalid_signature' });
  }
  if (!signature) {
    logger.warn('Razorpay webhook received without a signature header. Rejecting.');
    return res.status(400).json({ status: 'invalid_signature' });
  }

  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body));

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      logger.warn('Razorpay webhook signature mismatch.');
      return res.status(400).json({ status: 'invalid_signature' });
    }
  } catch (sigErr) {
    logger.error('Razorpay webhook signature verification error: ' + sigErr.message);
    return res.status(400).json({ status: 'invalid_signature' });
  }

  try {
    // The webhook route is served via express.raw(), so req.body is a Buffer.
    // Re-parse it back to JSON before reading the event payload.
    const parsedBody = Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString('utf8'))
      : req.body;
    const event = parsedBody.event;
    const payload = parsedBody.payload;

    if (event === 'payment.captured' || event === 'order.paid') {
      const payment = payload?.payment?.entity;
      const orderId = payment?.order_id;
      const paymentId = payment?.id;
      const paymentMethod = payment?.method || 'card';
      const webhookAmount = payment?.amount;
      const currency = payment?.currency || 'INR';

      if (orderId && paymentId) {
        // Enforce captured or paid state at the gateway
        const isCaptured = payment?.status === 'captured' || event === 'order.paid';
        if (!isCaptured) {
          logger.warn(`Webhook received payment ${paymentId} in non-captured status: ${payment?.status}`);
          return res.status(200).json({ status: 'ignored_unsettled_state' });
        }

        const result = await processAuthoritativePaymentSettlement({
          orderId,
          paymentId,
          paymentMethod,
          webhookAmount,
          currency,
          gatewayResponse: payment,
          ip: req.ip
        });

        return res.status(result.statusCode).json({
          status: result.success ? 'ok' : 'error',
          message: result.message
        });
      }
    }

    if (event === 'payment.failed') {
      const payment = payload?.payment?.entity;
      const orderId = payment?.order_id;
      const paymentId = payment?.id;
      const errorDesc = payment?.error_description || payment?.error_reason || 'Payment failed at gateway.';
      if (orderId) {
        let conn;
        try {
          conn = await pool.getConnection();
          await conn.query(
            "UPDATE payments SET status = 'failed', payment_id = ?, error_message = ? WHERE order_id = ? AND status != 'paid'",
            [paymentId || null, errorDesc, orderId]
          );
          const [pmts] = await conn.query("SELECT user_id, ticket_id FROM payments WHERE order_id = ? LIMIT 1", [orderId]);
          if (pmts.length > 0 && pmts[0].user_id) {
            await conn.query(
              `INSERT INTO notifications (user_id, ticket_id, title, message, sender_id)
               VALUES (?, ?, 'Payment Failed', 'Sir, your payment could not be completed and has failed. Please try again.', NULL)`,
              [pmts[0].user_id, pmts[0].ticket_id || null]
            );
          }
        } catch (we) {
          logger.error('Webhook payment.failed error: ' + we.message);
        } finally {
          if (conn) conn.release();
        }
      }
      return res.status(200).json({ status: 'ok' });
    }

    return res.status(200).json({ status: 'ok' });
  } catch (e) {
    logger.error('Webhook processing error: ' + e.message);
    return res.status(500).json({ status: 'error', message: e.message });
  }
};

/**
 * Process invoice payment (Direct / Simulated or manual settlement)
 */
const payInvoice = async (req, res, next) => {
  const { invoiceId, paymentMethod = 'card' } = req.body;
  const { role, id: authUserId } = req.user;
  let connection;

  try {
    connection = await pool.getConnection();

    const [invoices] = await connection.query(
      'SELECT id, user_id, status, amount, ticket_id FROM invoices WHERE id = ? LIMIT 1',
      [invoiceId]
    );

    if (invoices.length === 0) {
      return res.status(404).json(formatResponse(false, 'Invoice not found.'));
    }

    const inv = invoices[0];

    // Security Check: Customers and Companies cannot pay other users' invoices
    if ((role === 'customer' || role === 'company') && inv.user_id !== authUserId) {
      return res.status(403).json(formatResponse(false, 'Forbidden. Access restricted.'));
    }

    if (inv.status === 'Paid') {
      return res.status(400).json(formatResponse(false, 'Invoice is already paid.'));
    }

    if (inv.status === 'Draft') {
      return res.status(400).json(formatResponse(false, 'Draft invoices cannot be paid. Please review and finalize the invoice before recording payment.'));
    }

    if (inv.status === 'Void' || inv.is_active === false || inv.is_active === 0) {
      return res.status(400).json(formatResponse(false, 'Voided invoices cannot be paid.'));
    }

    // If ticket is linked to invoice, check ticket eligibility too
    if (inv.ticket_id) {
      const [linkedTks] = await connection.query('SELECT * FROM service_requests WHERE id = ? LIMIT 1', [inv.ticket_id]);
      if (linkedTks.length > 0) {
        const lTicket = linkedTks[0];
        const eligibility = checkTicketPaymentEligibility(lTicket, req.user, { invoice: inv, allowSettlement: true });
        if (!eligibility.eligible) {
          return res.status(400).json(formatResponse(false, `Cannot pay invoice: ${eligibility.reason}`));
        }
      }
    }

    const simulatedPaymentId = `pay_direct_${Date.now()}`;
    const simulatedOrderId = `order_direct_${Date.now()}`;

    // Mark as Paid
    await connection.query(
      `UPDATE invoices 
       SET status = "Paid", payment_id = ?, payment_order_id = ?, payment_method = ?, paid_at = NOW() 
       WHERE id = ?`,
      [simulatedPaymentId, simulatedOrderId, paymentMethod, invoiceId]
    );

    // If ticket is linked to invoice, update ticket too
    if (inv.ticket_id) {
      await connection.query(
        `UPDATE service_requests 
         SET payment_status = 'paid', payment_id = ?, payment_order_id = ?, payment_method = ?, paid_at = NOW() 
         WHERE id = ?`,
        [simulatedPaymentId, simulatedOrderId, paymentMethod, inv.ticket_id]
      );

      // Notify assigned technician on direct offline payment settlement
      try {
        await notifyTechnicianOnPayment({
          connection,
          ticketId: inv.ticket_id,
          paymentId: simulatedPaymentId,
          amount: inv.amount,
          senderId: req.user ? req.user.id : null
        });
      } catch (techNotifErr) {
        logger.debug('Technician notification on payInvoice error: ' + techNotifErr.message);
      }
    }

    // Insert payment record
    await connection.query(
      `INSERT INTO payments (payment_id, order_id, invoice_id, ticket_id, user_id, amount, currency, payment_method, status, gateway)
       VALUES (?, ?, ?, ?, ?, ?, 'INR', ?, 'paid', 'direct')`,
      [simulatedPaymentId, simulatedOrderId, invoiceId, inv.ticket_id || null, inv.user_id, inv.amount, paymentMethod]
    );

    logger.info(`Invoice marked as Paid: ${invoiceId}`);

    // Log Activity
    await logActivity(req.user.id, 'billing', 'pay_invoice', 'invoices', invoiceId, { status: 'Paid', amount: inv.amount }, req.ip);

    return res.status(200).json(formatResponse(true, 'Payment recorded successfully. Invoice status is now Paid.', {
      invoiceId,
      paymentId: simulatedPaymentId,
      status: 'Paid'
    }));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Initiate an offline payment collection request (Cash, Bank Transfer, Offline UPI)
 * Supports customer, B2B company, guest, and admin.
 * Authoritative amount is strictly calculated on the server from the DB ticket or invoice.
 */
const initiateOfflinePayment = async (req, res, next) => {
  const reqBody = req.body || {};
  const ticketId = reqBody.ticketId || reqBody.ticket_id;
  const invoiceId = reqBody.invoiceId || reqBody.invoice_id;
  const ticketNumber = reqBody.ticketNumber || reqBody.ticket_number;
  const paymentMethod = (reqBody.paymentMethod || reqBody.payment_method || '').toLowerCase().trim();
  const referenceNote = reqBody.referenceNote || reqBody.reference_note || reqBody.referenceNumber || reqBody.utrNumber || reqBody.notes || '';

  const allowedOfflineMethods = ['cash', 'bank_transfer', 'offline_upi'];
  if (!allowedOfflineMethods.includes(paymentMethod)) {
    return res.status(400).json(formatResponse(false, 'Invalid offline payment method. Supported methods: Cash, Bank Transfer, Offline UPI.'));
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    let targetTicket = null;
    let targetInvoice = null;
    let payableAmount = 0;
    let targetUserId = req.user ? req.user.id : null;
    let targetCompanyId = null;
    let customerName = req.user ? req.user.name : 'Customer';
    let customerEmail = req.user ? req.user.email : '';
    let customerPhone = '';

    // 1. If Ticket ID / Ticket Number provided
    if (ticketId || ticketNumber) {
      const searchIdentifier = ticketId || ticketNumber;
      const isNumeric = !isNaN(Number(searchIdentifier)) && /^\d+$/.test(String(searchIdentifier));
      const [tickets] = await connection.query(
        isNumeric
          ? 'SELECT * FROM service_requests WHERE id = ? OR ticket_number = ? LIMIT 1'
          : 'SELECT * FROM service_requests WHERE ticket_number = ? LIMIT 1',
        isNumeric ? [Number(searchIdentifier), String(searchIdentifier)] : [String(searchIdentifier)]
      );

      if (tickets.length === 0) {
        await connection.rollback();
        return res.status(404).json(formatResponse(false, 'Repair ticket not found.'));
      }

      targetTicket = tickets[0];
      targetUserId = targetTicket.user_id || (req.user ? req.user.id : null);
      targetCompanyId = targetTicket.company_id || null;
      customerName = targetTicket.customer_name || customerName;
      customerEmail = targetTicket.email || customerEmail;
      customerPhone = targetTicket.mobile || '';

      const [invRows] = await connection.query(
        'SELECT * FROM invoices WHERE ticket_id = ? AND is_active = TRUE ORDER BY id DESC LIMIT 1',
        [targetTicket.id]
      );
      const linkedInvoice = invRows.length > 0 ? invRows[0] : null;
      if (linkedInvoice) targetInvoice = linkedInvoice;

      // Check eligibility (ensures ticket completed, approved, valid amount, and ownership)
      const eligibility = checkTicketPaymentEligibility(targetTicket, req.user, { invoice: linkedInvoice });
      if (!eligibility.eligible) {
        await connection.rollback();
        const statusCode = eligibility.statusCode || 400;
        return res.status(statusCode).json(formatResponse(false, eligibility.reason));
      }

      // Check for active pending verification (Duplicate submission idempotency)
      if (targetTicket.payment_status === 'pending_verification') {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'An offline payment request for this repair ticket is already pending verification. Please wait for administrator verification or switch payment method.'));
      }

      payableAmount = eligibility.payableAmount;
    } else if (invoiceId) {
      // 2. If Invoice ID provided
      const [invoices] = await connection.query(
        'SELECT * FROM invoices WHERE id = ? LIMIT 1',
        [invoiceId]
      );

      if (invoices.length === 0) {
        await connection.rollback();
        return res.status(404).json(formatResponse(false, 'Invoice not found.'));
      }

      targetInvoice = invoices[0];
      targetUserId = targetInvoice.user_id || (req.user ? req.user.id : null);
      customerName = targetInvoice.client_name || customerName;

      // Ownership check for invoices
      if (targetInvoice.user_id) {
        if (!req.user) {
          await connection.rollback();
          return res.status(401).json(formatResponse(false, 'Authentication required. Please sign in to pay this invoice.'));
        }
        if ((req.user.role === 'customer' || req.user.role === 'company') && targetInvoice.user_id !== req.user.id) {
          await connection.rollback();
          return res.status(403).json(formatResponse(false, 'Forbidden: You can only pay your own invoices.'));
        }
      }

      if (targetInvoice.status === 'Paid') {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'This invoice is already paid and settled.'));
      }

      if (targetInvoice.status === 'Draft') {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'This invoice is currently in Draft review and cannot be paid until finalized by an administrator.'));
      }

      if (targetInvoice.status === 'Void' || targetInvoice.is_active === false || targetInvoice.is_active === 0) {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'This invoice has been voided and cannot be paid.'));
      }

      if (targetInvoice.ticket_id) {
        const [linkedTks] = await connection.query('SELECT * FROM service_requests WHERE id = ? LIMIT 1', [targetInvoice.ticket_id]);
        if (linkedTks.length > 0) {
          targetTicket = linkedTks[0];
          targetCompanyId = targetTicket.company_id || targetCompanyId;
          const lEligibility = checkTicketPaymentEligibility(targetTicket, req.user, { invoice: targetInvoice });
          if (!lEligibility.eligible) {
            await connection.rollback();
            const lStatusCode = lEligibility.statusCode || 400;
            return res.status(lStatusCode).json(formatResponse(false, `Associated repair ticket payment blocked: ${lEligibility.reason}`));
          }
        }
      }

      // Check if existing payment for this invoice is pending verification (Duplicate submission idempotency)
      const [existingPending] = await connection.query(
        "SELECT id FROM payments WHERE invoice_id = ? AND status = 'pending_verification' LIMIT 1",
        [invoiceId]
      );
      if (existingPending.length > 0) {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'An offline payment request for this invoice is already pending verification. Please wait for administrator verification or switch payment method.'));
      }

      payableAmount = parseFloat(targetInvoice.amount);
    } else {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, 'Please provide either ticketId, ticketNumber, or invoiceId.'));
    }

    if (payableAmount <= 0) {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, 'The payable amount must be greater than zero.'));
    }

    // Determine initial collection status
    // For cash: 'pending_collection'
    // For bank_transfer / offline_upi: 'not_applicable' (collected digitally, pending admin verification)
    const initialCollectionStatus = paymentMethod === 'cash' ? 'pending_collection' : 'not_applicable';

    // Generate unique offline payment & order ID
    // CASH payments must NOT receive a gateway-style Transaction ID.
    // Use clear internal audit identifiers.
    const pmtTimestamp = Date.now();
    const pmtRandom = Math.floor(1000 + Math.random() * 9000);
    let offlinePaymentId;
    let offlineOrderId;

    if (paymentMethod === 'cash') {
      offlinePaymentId = `PAY-CASH-${pmtTimestamp}-${pmtRandom}`;
      offlineOrderId = `REF-CASH-${pmtTimestamp}-${pmtRandom}`;
    } else if (paymentMethod === 'bank_transfer') {
      offlinePaymentId = `PAY-BANK-${pmtTimestamp}-${pmtRandom}`;
      offlineOrderId = `REF-BANK-${pmtTimestamp}-${pmtRandom}`;
    } else if (paymentMethod === 'offline_upi') {
      offlinePaymentId = `PAY-UPI-${pmtTimestamp}-${pmtRandom}`;
      offlineOrderId = `REF-UPI-${pmtTimestamp}-${pmtRandom}`;
    } else {
      offlinePaymentId = `PAY-OFF-${pmtTimestamp}-${pmtRandom}`;
      offlineOrderId = `REF-OFF-${pmtTimestamp}-${pmtRandom}`;
    }

    // Create Payment Record
    const [pmtInsertResult] = await connection.query(
      `INSERT INTO payments (
         payment_id, order_id, ticket_id, invoice_id, user_id, company_id,
         amount, currency, payment_method, status, gateway,
         collection_status, verification_status, reference_note
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'INR', ?, 'pending_verification', 'offline', ?, 'pending', ?)`,
      [
        offlinePaymentId,
        offlineOrderId,
        targetTicket ? targetTicket.id : null,
        targetInvoice ? targetInvoice.id : null,
        targetUserId,
        targetCompanyId,
        payableAmount,
        paymentMethod,
        initialCollectionStatus,
        referenceNote || null
      ]
    );

    // Update Service Request if applicable
    if (targetTicket) {
      await connection.query(
        `UPDATE service_requests 
         SET payment_status = 'pending_verification',
             payment_id = ?,
             payment_order_id = ?,
             payment_method = ?,
             collection_status = ?
         WHERE id = ?`,
        [offlinePaymentId, offlineOrderId, paymentMethod, initialCollectionStatus, targetTicket.id]
      );
    }

    // Update Invoice if applicable
    if (targetInvoice) {
      await connection.query(
        `UPDATE invoices 
         SET payment_id = ?,
             payment_order_id = ?,
             payment_method = ?
         WHERE id = ?`,
        [offlinePaymentId, offlineOrderId, paymentMethod, targetInvoice.id]
      );
    } else if (targetTicket) {
      // If invoice exists for ticket, update it
      const [existingInv] = await connection.query('SELECT id FROM invoices WHERE ticket_id = ? LIMIT 1', [targetTicket.id]);
      if (existingInv.length > 0) {
        await connection.query(
          `UPDATE invoices 
           SET payment_id = ?,
               payment_order_id = ?,
               payment_method = ?
           WHERE id = ?`,
          [offlinePaymentId, offlineOrderId, paymentMethod, existingInv[0].id]
        );
      }
    }

    await connection.commit();

    const methodLabels = {
      cash: 'Cash Payment',
      bank_transfer: 'Bank Transfer (NEFT/IMPS/RTGS)',
      offline_upi: 'Offline UPI Transfer'
    };
    const methodLabel = methodLabels[paymentMethod] || paymentMethod.toUpperCase();
    const ticketRef = targetTicket ? (targetTicket.ticket_number || `#${targetTicket.id}`) : (targetInvoice ? `Invoice #${targetInvoice.id}` : 'N/A');

    // Notify Admins
    try {
      const adminMessage = `Offline Payment Request (${methodLabel}): ₹${payableAmount.toFixed(2)} for ${ticketRef}. Client: ${customerName}. Reference: ${referenceNote || 'None'}. Pending Admin Verification.`;
      const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin'");
      for (const admin of admins) {
        await pool.query(
          `INSERT INTO notifications (user_id, ticket_id, title, message, sender_id)
           VALUES (?, ?, 'Offline Payment Pending Verification', ?, ?)`,
          [admin.id, targetTicket ? targetTicket.id : null, adminMessage, targetUserId || null]
        );
      }
    } catch (notifErr) {
      logger.debug('Admin notification for offline payment failed: ' + notifErr.message);
    }

    // If Cash and technician assigned, notify technician
    if (targetTicket && targetTicket.assigned_technician_id && paymentMethod === 'cash') {
      try {
        const techMessage = `Customer requested Cash Payment (₹${payableAmount.toFixed(2)}) for ticket ${ticketRef}. Please collect cash upon device delivery/service and record cash collected.`;
        await pool.query(
          `INSERT INTO notifications (user_id, ticket_id, title, message, sender_id)
           VALUES (?, ?, 'Cash Payment Collection Request', ?, ?)`,
          [targetTicket.assigned_technician_id, targetTicket.id, techMessage, targetUserId || null]
        );
      } catch (techErr) {
        logger.debug('Technician notification for cash collection request failed: ' + techErr.message);
      }
    }

    // Log Activity
    if (targetUserId) {
      await logActivity(targetUserId, 'billing', 'offline_payment_requested', 'payments', offlinePaymentId, {
        method: paymentMethod,
        amount: payableAmount,
        ticketId: targetTicket ? targetTicket.id : null,
        invoiceId: targetInvoice ? targetInvoice.id : null,
        referenceNote
      }, req.ip);
    }

    logger.info(`Offline payment initiated: ${offlinePaymentId} (${paymentMethod}) for ₹${payableAmount} (ticket: ${targetTicket?.ticket_number || 'none'}, invoice: ${targetInvoice?.id || 'none'})`);

    return res.status(200).json(formatResponse(true, 'Offline payment recorded successfully. It is currently pending verification.', {
      id: pmtInsertResult.insertId,
      paymentId: offlinePaymentId,
      orderId: offlineOrderId,
      amount: payableAmount,
      currency: 'INR',
      paymentMethod,
      status: 'pending_verification',
      collectionStatus: initialCollectionStatus,
      ticketId: targetTicket ? targetTicket.id : null,
      ticketNumber: targetTicket ? targetTicket.ticket_number : null,
      invoiceId: targetInvoice ? targetInvoice.id : null,
      customerName,
      referenceNote
    }));

  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Switch payment method from uncollected Cash (or unverified offline) to allow Online or other payment
 * POST /api/billing/switch-payment-method
 */
const switchPaymentMethod = async (req, res, next) => {
  const reqBody = req.body || {};
  const ticketId = reqBody.ticketId || reqBody.ticket_id;
  const ticketNumber = reqBody.ticketNumber || reqBody.ticket_number;
  const invoiceId = reqBody.invoiceId || reqBody.invoice_id;
  const authUser = req.user || null;
  let connection;

  try {
    if (!ticketId && !ticketNumber && !invoiceId) {
      return res.status(400).json(formatResponse(false, 'Please provide ticketId, ticketNumber, or invoiceId to switch payment method.'));
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    let targetTicket = null;
    let targetInvoice = null;

    if (ticketId || ticketNumber) {
      const searchIdentifier = ticketId || ticketNumber;
      const isNumeric = !isNaN(Number(searchIdentifier)) && /^\d+$/.test(String(searchIdentifier));
      const [tickets] = await connection.query(
        isNumeric
          ? 'SELECT * FROM service_requests WHERE id = ? OR ticket_number = ? LIMIT 1'
          : 'SELECT * FROM service_requests WHERE ticket_number = ? LIMIT 1',
        isNumeric ? [Number(searchIdentifier), String(searchIdentifier)] : [String(searchIdentifier)]
      );

      if (tickets.length === 0) {
        await connection.rollback();
        return res.status(404).json(formatResponse(false, 'Repair ticket not found.'));
      }
      targetTicket = tickets[0];

      // IDOR & Authorization check
      const ticketUserId = targetTicket.user_id ? Number(targetTicket.user_id) : null;
      const ticketCompanyId = targetTicket.company_id ? Number(targetTicket.company_id) : null;
      const isRegisteredTicket = Boolean(ticketUserId || ticketCompanyId);

      if (isRegisteredTicket) {
        if (!authUser) {
          await connection.rollback();
          if (ticketCompanyId) {
            return res.status(401).json(formatResponse(false, 'Authentication required. Please sign in to your corporate account to modify payment for this repair ticket.'));
          }
          return res.status(401).json(formatResponse(false, 'Authentication required. Please sign in to your TekDoctor account to modify payment for this repair ticket.'));
        }

        const authUserId = Number(authUser.id);
        const role = authUser.role;

        if (role === 'admin') {
          // Admin allowed
        } else if (role === 'technician') {
          const assignedTechId = targetTicket.assigned_technician_id ? Number(targetTicket.assigned_technician_id) : null;
          const pendingTechId = targetTicket.pending_technician_id ? Number(targetTicket.pending_technician_id) : null;
          if (assignedTechId !== authUserId && pendingTechId !== authUserId) {
            await connection.rollback();
            return res.status(403).json(formatResponse(false, 'Forbidden: Technicians can only modify payment for their assigned repair tickets.'));
          }
        } else if (role === 'customer') {
          if (ticketUserId && ticketUserId !== authUserId) {
            await connection.rollback();
            return res.status(403).json(formatResponse(false, 'Forbidden: You can only modify your own repair tickets.'));
          }
          if (ticketCompanyId && !ticketUserId) {
            await connection.rollback();
            return res.status(403).json(formatResponse(false, 'Forbidden: You cannot modify corporate repair tickets with a personal customer account.'));
          }
        } else if (role === 'company') {
          if (ticketCompanyId && ticketCompanyId !== authUserId && ticketUserId !== authUserId) {
            await connection.rollback();
            return res.status(403).json(formatResponse(false, 'Forbidden: You can only modify your own corporate repair tickets.'));
          }
        } else {
          await connection.rollback();
          return res.status(403).json(formatResponse(false, 'Forbidden: Insufficient permissions.'));
        }
      }

      if (targetTicket.payment_status === 'paid') {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'Payment has already been settled and paid for this ticket. Payment method cannot be changed.'));
      }

      // Check if cash has already been collected
      if (targetTicket.collection_status === 'collected') {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'Cash has already been collected by your technician and is undergoing verification. Payment method cannot be changed.'));
      }

    } else if (invoiceId) {
      const [invoices] = await connection.query('SELECT * FROM invoices WHERE id = ? LIMIT 1', [invoiceId]);
      if (invoices.length === 0) {
        await connection.rollback();
        return res.status(404).json(formatResponse(false, 'Invoice not found.'));
      }
      targetInvoice = invoices[0];

      if (targetInvoice.user_id) {
        if (!authUser) {
          await connection.rollback();
          return res.status(401).json(formatResponse(false, 'Authentication required. Please sign in to modify payment for this invoice.'));
        }
        if ((authUser.role === 'customer' || authUser.role === 'company') && targetInvoice.user_id !== authUser.id) {
          await connection.rollback();
          return res.status(403).json(formatResponse(false, 'Forbidden: You can only modify your own invoices.'));
        }
      }

      if (targetInvoice.status === 'Paid') {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'This invoice is already paid and settled. Payment method cannot be changed.'));
      }

      if (targetInvoice.ticket_id) {
        const [linkedTks] = await connection.query('SELECT * FROM service_requests WHERE id = ? LIMIT 1', [targetInvoice.ticket_id]);
        if (linkedTks.length > 0) {
          targetTicket = linkedTks[0];
          if (targetTicket.collection_status === 'collected') {
            await connection.rollback();
            return res.status(400).json(formatResponse(false, 'Cash has already been collected by your technician and is undergoing verification. Payment method cannot be changed.'));
          }
        }
      }
    }

    // Find any pending offline payments for this ticket or invoice
    const pmtConditions = [];
    const pmtParams = [];
    if (targetTicket) {
      pmtConditions.push('ticket_id = ?');
      pmtParams.push(targetTicket.id);
    }
    if (targetInvoice) {
      pmtConditions.push('invoice_id = ?');
      pmtParams.push(targetInvoice.id);
    }

    const [pendingPmts] = await connection.query(
      `SELECT * FROM payments WHERE (${pmtConditions.join(' OR ')}) AND status = 'pending_verification' ORDER BY id DESC`,
      pmtParams
    );

    // Double check if any pending payment has collection_status === 'collected'
    const collectedPmt = pendingPmts.find(p => p.collection_status === 'collected');
    if (collectedPmt) {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, 'Cash has already been collected by technician and is undergoing verification. Payment method cannot be changed.'));
    }

    // Cancel / supersede pending uncollected payment attempts (safely, WITHOUT marking as rejected)
    for (const pmt of pendingPmts) {
      const supersededNote = pmt.reference_note
        ? `${pmt.reference_note} | Superseded: switched payment method`
        : 'Superseded: customer switched payment method';
      await connection.query(
        `UPDATE payments 
         SET status = 'cancelled', 
             reference_note = ?
         WHERE id = ?`,
        [supersededNote, pmt.id]
      );
    }

    // Reset Service Request payment fields
    if (targetTicket) {
      await connection.query(
        `UPDATE service_requests 
         SET payment_status = 'pending',
             collection_status = 'not_applicable',
             payment_id = NULL,
             payment_order_id = NULL,
             payment_method = NULL
         WHERE id = ?`,
        [targetTicket.id]
      );
    }

    // Reset Invoice payment fields while preserving Final status for payment re-entry
    if (targetInvoice) {
      await connection.query(
        `UPDATE invoices 
         SET status = CASE WHEN status = 'Paid' THEN status ELSE 'Final' END,
             payment_id = NULL,
             payment_order_id = NULL,
             payment_method = NULL
         WHERE id = ?`,
        [targetInvoice.id]
      );
    } else if (targetTicket) {
      // Also reset any existing invoice for this ticket
      await connection.query(
        `UPDATE invoices 
         SET status = CASE WHEN status = 'Paid' THEN status ELSE 'Final' END,
             payment_id = NULL,
             payment_order_id = NULL,
             payment_method = NULL
         WHERE ticket_id = ? AND status != 'Paid'`,
        [targetTicket.id]
      );
    }

    await connection.commit();

    const targetUserId = (targetTicket && targetTicket.user_id) || (targetInvoice && targetInvoice.user_id) || (authUser ? authUser.id : null);
    if (targetUserId) {
      await logActivity(targetUserId, 'billing', 'switch_payment_method', 'service_requests', targetTicket?.id || targetInvoice?.id, {
        previousMethod: targetTicket?.payment_method || 'cash',
        reason: 'Customer switched payment method'
      }, req.ip);
    }

    logger.info(`Payment method switch allowed: Ticket ${targetTicket?.ticket_number || targetTicket?.id || 'none'}, Invoice ${targetInvoice?.id || 'none'}. Uncollected cash superseded.`);

    return res.status(200).json(formatResponse(true, 'Payment method switched successfully. You can now pay online or choose another payment method.', {
      ticketId: targetTicket ? targetTicket.id : null,
      ticketNumber: targetTicket ? targetTicket.ticket_number : null,
      invoiceId: targetInvoice ? targetInvoice.id : null,
      paymentStatus: 'pending'
    }));

  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Record that cash was collected by an authorized technician or admin.
 * Technicians can only record cash collected for tickets assigned to them (IDOR guard).
 * Does NOT mark payment as paid; it stays 'pending_verification' until admin verifies.
 */
const recordCashCollected = async (req, res, next) => {
  const reqBody = req.body || {};
  const ticketId = reqBody.ticketId || reqBody.ticket_id;
  const paymentId = reqBody.paymentId || reqBody.payment_id;
  const notes = reqBody.notes || reqBody.referenceNote || '';
  const { role, id: authUserId } = req.user;

  if (!ticketId && !paymentId) {
    return res.status(400).json(formatResponse(false, 'Ticket ID or Payment ID is required.'));
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Resolve Target Ticket
    let ticket = null;
    let resolvedTicketId = ticketId;

    if (ticketId) {
      const [tkLookup] = await connection.query(
        'SELECT * FROM service_requests WHERE id = ? OR ticket_number = ? LIMIT 1',
        [ticketId, ticketId]
      );
      if (tkLookup.length > 0) {
        ticket = tkLookup[0];
        resolvedTicketId = ticket.id;
      }
    } else if (paymentId) {
      const [pmtTk] = await connection.query(
        'SELECT ticket_id FROM payments WHERE payment_id = ? OR id = ? LIMIT 1',
        [paymentId, paymentId]
      );
      if (pmtTk.length > 0 && pmtTk[0].ticket_id) {
        resolvedTicketId = pmtTk[0].ticket_id;
        const [tkLookup] = await connection.query('SELECT * FROM service_requests WHERE id = ? LIMIT 1', [resolvedTicketId]);
        if (tkLookup.length > 0) ticket = tkLookup[0];
      }
    }

    if (!ticket) {
      await connection.rollback();
      return res.status(404).json(formatResponse(false, 'Repair ticket not found.'));
    }

    // 2. Check if ticket is already settled and paid
    if (ticket.payment_status === 'paid') {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, 'This repair ticket has already been paid and settled. Cash collection blocked.'));
    }

    // 3. Role-based authorization & IDOR Protection:
    // Technicians can only record cash collection for tickets assigned to them.
    if (role === 'technician') {
      const hasAccess = await canTechnicianAccessTicket(authUserId, ticket, connection);
      if (!hasAccess || ticket.assigned_technician_id !== authUserId) {
        await connection.rollback();
        return res.status(403).json(formatResponse(false, 'Forbidden: You are not authorized to record cash collection for this ticket. You can only record collection for tickets assigned to you.'));
      }
    }

    // 4. Commercial invoice check: Must exist, be active, and be in canonical 'Final' state
    const [invLookup] = await connection.query(
      "SELECT * FROM invoices WHERE ticket_id = ? AND is_active = TRUE ORDER BY id DESC LIMIT 1",
      [ticket.id]
    );
    const targetInvoice = invLookup.length > 0 ? invLookup[0] : null;

    if (!targetInvoice || targetInvoice.status !== 'Final') {
      await connection.rollback();
      return res.status(409).json(formatResponse(false, 'Cash collection is unavailable until the final invoice is released.'));
    }

    // 5. Selected payment method check: Must not silently override online or bank payment
    const currentTicketMethod = (ticket.payment_method || '').toLowerCase().trim();
    if (currentTicketMethod && currentTicketMethod !== 'cash') {
      await connection.rollback();
      return res.status(400).json(formatResponse(
        false,
        `Cannot record cash collection because ${ticket.payment_method} is currently selected as the payment method. Customer or staff must select Cash payment first.`
      ));
    }

    // 6. Explicit Eligible Cash-Payment Intent/Record Check:
    // A button click must NOT create a cash collection when no eligible cash payment transaction or explicit cash-payment selection exists.
    let pmtQuery = 'SELECT * FROM payments WHERE ';
    const pmtParams = [];
    if (paymentId) {
      pmtQuery += "(payment_id = ? OR id = ?) AND payment_method = 'cash' LIMIT 1";
      pmtParams.push(paymentId, paymentId);
    } else {
      pmtQuery += "(ticket_id = ? OR invoice_id = ?) AND payment_method = 'cash' ORDER BY id DESC LIMIT 1";
      pmtParams.push(ticket.id, targetInvoice.id);
    }

    const [pmtRows] = await connection.query(pmtQuery, pmtParams);
    const payment = pmtRows.length > 0 ? pmtRows[0] : null;

    if (!payment || currentTicketMethod !== 'cash') {
      await connection.rollback();
      return res.status(400).json(formatResponse(
        false,
        'Cash payment has not been initiated for this repair ticket. An explicit cash payment intent must be initiated before physical cash collection can be recorded.'
      ));
    }

    if (payment.status === 'paid') {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, 'This payment is already verified and marked as Paid.'));
    }

    if (payment.collection_status === 'collected') {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, 'Cash has already been recorded as collected for this payment. It is currently awaiting Admin verification.'));
    }

    if (payment.status === 'rejected') {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, 'This cash payment attempt was rejected. A new cash payment request must be initiated before recording collection.'));
    }

    if (payment.status !== 'pending_verification') {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, `Cash collection cannot be recorded because this payment attempt has been ${payment.status}.`));
    }

    const payableAmount = parseFloat(targetInvoice.amount || 0);
    if (payableAmount <= 0) {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, 'Cannot record cash collection for an unpriced invoice.'));
    }

    // 7. Record physical collection: update payment collection_status to 'collected'
    // STATUS REMAINS 'pending_verification' - Do NOT mark as paid!
    const updatedNote = notes
      ? (payment.reference_note ? `${payment.reference_note} | Cash collected: ${notes}` : `Cash collected: ${notes}`)
      : payment.reference_note;

    await connection.query(
      `UPDATE payments 
       SET collection_status = 'collected',
           collected_by = ?,
           collected_at = NOW(),
           invoice_id = COALESCE(invoice_id, ?),
           amount = ?,
           reference_note = ?
       WHERE id = ?`,
      [authUserId, targetInvoice.id, payableAmount, updatedNote, payment.id]
    );

    // Update ticket collection_status
    await connection.query(
      `UPDATE service_requests 
       SET collection_status = 'collected',
           payment_method = 'cash'
       WHERE id = ?`,
      [ticket.id]
    );

    await connection.commit();

    const collectorName = req.user.name || (role === 'admin' ? 'Admin' : 'Technician');
    const ticketRef = ticket.ticket_number || `#${ticket.id}`;

    // Notify Admin: Cash collected, ready for verification
    try {
      const adminMessage = `Cash of ₹${payableAmount.toFixed(2)} for ticket ${ticketRef} has been recorded as collected by ${collectorName}. Please review and verify this payment.`;
      const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin'");
      for (const admin of admins) {
        await pool.query(
          `INSERT INTO notifications (user_id, ticket_id, title, message, sender_id)
           VALUES (?, ?, 'Cash Collected — Pending Verification', ?, ?)`,
          [admin.id, ticket.id, adminMessage, authUserId]
        );
      }
    } catch (notifErr) {
      logger.debug('Admin notification on cash collected error: ' + notifErr.message);
    }

    // Log Activity
    await logActivity(authUserId, 'billing', 'cash_collected', 'payments', payment.payment_id || String(payment.id), {
      ticketId: ticket.id,
      amount: payableAmount,
      collectedBy: authUserId,
      notes
    }, req.ip);

    logger.info(`Cash collection recorded for payment ${payment.payment_id} on ticket ${ticket.id} by user ${authUserId} (${role})`);

    return res.status(200).json(formatResponse(true, 'Cash collection recorded successfully. Payment is pending Admin verification.', {
      paymentId: payment.payment_id,
      ticketId: ticket.id,
      status: 'pending_verification',
      collectionStatus: 'collected',
      collectedBy: authUserId,
      collectedAt: new Date().toISOString()
    }));

  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Admin verification or rejection of offline payments (Cash, Bank Transfer, Offline UPI)
 * Admin only.
 * Synchronizes payment, ticket, invoice, receipt, notifications, and activity logs.
 */
const verifyOfflinePayment = async (req, res, next) => {
  const reqBody = req.body || {};
  const paymentId = reqBody.paymentId || reqBody.payment_id;
  const orderId = reqBody.orderId || reqBody.order_id;
  const ticketId = reqBody.ticketId || reqBody.ticket_id;
  const invoiceId = reqBody.invoiceId || reqBody.invoice_id;
  const action = (reqBody.action || 'verify').toLowerCase().trim(); // 'verify' or 'reject'
  const rejectionReason = reqBody.rejectionReason || reqBody.reason || 'Verification rejected by administrator.';
  const notes = reqBody.notes || '';
  const adminId = req.user.id;

  if (action !== 'verify' && action !== 'reject') {
    return res.status(400).json(formatResponse(false, 'Action must be either "verify" or "reject".'));
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Find payment record
    let pmtQuery = 'SELECT * FROM payments WHERE ';
    const pmtParams = [];

    if (paymentId) {
      pmtQuery += '(payment_id = ? OR id = ?) LIMIT 1';
      pmtParams.push(paymentId, paymentId);
    } else if (orderId) {
      pmtQuery += 'order_id = ? LIMIT 1';
      pmtParams.push(orderId);
    } else if (ticketId) {
      pmtQuery += "ticket_id = ? AND status = 'pending_verification' ORDER BY id DESC LIMIT 1";
      pmtParams.push(ticketId);
    } else if (invoiceId) {
      pmtQuery += "invoice_id = ? AND status = 'pending_verification' ORDER BY id DESC LIMIT 1";
      pmtParams.push(invoiceId);
    } else {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, 'Please provide paymentId, orderId, ticketId, or invoiceId.'));
    }

    const [pmtRows] = await connection.query(pmtQuery, pmtParams);
    if (pmtRows.length === 0) {
      if (ticketId) {
        const [alreadyPaidTk] = await connection.query('SELECT payment_status FROM service_requests WHERE id = ? LIMIT 1', [ticketId]);
        if (alreadyPaidTk.length > 0 && alreadyPaidTk[0].payment_status === 'paid') {
          await connection.rollback();
          return res.status(400).json(formatResponse(false, 'This repair ticket has already been settled and paid. Duplicate settlement blocked.'));
        }
      }
      if (invoiceId) {
        const [alreadyPaidInv] = await connection.query('SELECT status FROM invoices WHERE id = ? LIMIT 1', [invoiceId]);
        if (alreadyPaidInv.length > 0 && alreadyPaidInv[0].status === 'Paid') {
          await connection.rollback();
          return res.status(400).json(formatResponse(false, 'This invoice has already been settled and paid. Duplicate settlement blocked.'));
        }
      }
      await connection.rollback();
      return res.status(404).json(formatResponse(false, 'Offline payment record not found.'));
    }

    const payment = pmtRows[0];
    let resolvedTicketId = payment.ticket_id || ticketId;
    let resolvedInvoiceId = payment.invoice_id || invoiceId;
    if (!resolvedTicketId && resolvedInvoiceId) {
      const [invTk] = await connection.query('SELECT ticket_id FROM invoices WHERE id = ? LIMIT 1', [resolvedInvoiceId]);
      if (invTk.length > 0 && invTk[0].ticket_id) {
        resolvedTicketId = invTk[0].ticket_id;
      }
    }
    const finalAmount = parseFloat(payment.amount);
    const finalUserId = payment.user_id;
    const finalCompanyId = payment.company_id;
    const paymentMethod = payment.payment_method || 'cash';

    if (payment.status === 'paid') {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, 'This payment is already verified and marked as Paid.'));
    }

    if (payment.status !== 'pending_verification') {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, `This offline payment attempt has been ${payment.status} and cannot be verified.`));
    }

    if (resolvedTicketId) {
      const [tkCheck] = await connection.query('SELECT payment_status FROM service_requests WHERE id = ? LIMIT 1', [resolvedTicketId]);
      if (tkCheck.length > 0 && tkCheck[0].payment_status === 'paid') {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'This repair ticket has already been settled and paid. Duplicate settlement blocked.'));
      }
    }

    if (resolvedInvoiceId) {
      const [invCheck] = await connection.query('SELECT status FROM invoices WHERE id = ? LIMIT 1', [resolvedInvoiceId]);
      if (invCheck.length > 0 && invCheck[0].status === 'Paid') {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'This invoice has already been settled and paid. Duplicate settlement blocked.'));
      }
    }

    if (action === 'verify') {
      // For cash payments, verify that physical cash has been recorded as collected by staff
      if (paymentMethod === 'cash' && payment.collection_status !== 'collected') {
        await connection.rollback();
        return res.status(400).json(formatResponse(false, 'Cash has not been recorded as collected yet. Admin verification requires prior cash collection by staff or technician.'));
      }

      // Check linked commercial invoice status: Must not be Draft or Void
      if (resolvedInvoiceId) {
        const [invCheck] = await connection.query('SELECT status FROM invoices WHERE id = ? LIMIT 1', [resolvedInvoiceId]);
        if (invCheck.length > 0 && invCheck[0].status !== 'Final') {
          await connection.rollback();
          return res.status(400).json(formatResponse(false, `Cannot verify payment for an invoice in ${invCheck[0].status} state. Final commercial invoice required.`));
        }
      }

      // 1. Settle Ticket
      if (resolvedTicketId) {
        await connection.query(
          `UPDATE service_requests 
           SET payment_status = 'paid', 
               payment_id = ?, 
               payment_method = ?, 
               collection_status = 'collected', 
               paid_at = NOW() 
           WHERE id = ?`,
          [payment.payment_id, paymentMethod, resolvedTicketId]
        );
      }

      // 2. Settle or auto-generate Invoice
      if (resolvedInvoiceId) {
        await connection.query(
          `UPDATE invoices 
           SET status = 'Paid', 
               payment_id = ?, 
               payment_method = ?, 
               paid_at = NOW() 
           WHERE id = ?`,
          [payment.payment_id, paymentMethod, resolvedInvoiceId]
        );
      } else if (resolvedTicketId) {
        const [existingInv] = await connection.query('SELECT id FROM invoices WHERE ticket_id = ? AND is_active = TRUE ORDER BY id DESC LIMIT 1', [resolvedTicketId]);
        if (existingInv.length > 0) {
          resolvedInvoiceId = existingInv[0].id;
          await connection.query(
            `UPDATE invoices 
             SET status = 'Paid', 
                 payment_id = ?, 
                 payment_method = ?, 
                 paid_at = NOW() 
             WHERE id = ?`,
            [payment.payment_id, paymentMethod, resolvedInvoiceId]
          );
        } else if (finalUserId) {
          // Auto-generate official paid invoice
          resolvedInvoiceId = await generateInvoiceId(connection);
          const [uRows] = await connection.query('SELECT name FROM users WHERE id = ? LIMIT 1', [finalUserId]);
          const clientName = uRows.length > 0 ? uRows[0].name : 'Customer';
          const itemDescription = `Device Repair Service - Ticket #${resolvedTicketId}`;

          await connection.query(
            `INSERT INTO invoices (id, user_id, client_name, amount, currency, invoice_date, due_date, status, notes, payment_id, payment_order_id, payment_method, ticket_id, paid_at)
             VALUES (?, ?, ?, ?, 'INR', NOW(), NOW(), 'Paid', ?, ?, ?, ?, ?, NOW())`,
            [resolvedInvoiceId, finalUserId, clientName, finalAmount, itemDescription, payment.payment_id, payment.order_id, paymentMethod, resolvedTicketId]
          );

          await connection.query(
            `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total)
             VALUES (?, ?, 1, ?, ?)`,
            [resolvedInvoiceId, itemDescription, finalAmount, finalAmount]
          );
        }
      }

      // 3. Update payment record
      const updatedNote = notes
        ? (payment.reference_note ? `${payment.reference_note} | Verified: ${notes}` : `Verified: ${notes}`)
        : payment.reference_note;

      await connection.query(
        `UPDATE payments 
         SET status = 'paid', 
             verification_status = 'verified', 
             verified_by = ?, 
             verified_at = NOW(),
             invoice_id = COALESCE(invoice_id, ?),
             collection_status = 'collected',
             reference_note = ?
         WHERE id = ?`,
        [adminId, resolvedInvoiceId || null, updatedNote, payment.id]
      );

      await connection.commit();

      logger.info(`Offline payment ${payment.payment_id} verified by admin ${adminId} for amount ₹${finalAmount}`);

      // Log Activity
      await logActivity(adminId, 'billing', 'verify_offline_payment', 'payments', payment.payment_id, {
        status: 'paid',
        amount: finalAmount,
        ticketId: resolvedTicketId,
        invoiceId: resolvedInvoiceId
      }, req.ip);

      // Notify Customer / Company
      if (finalUserId) {
        try {
          const clientMessage = `Sir, your offline payment of ₹${finalAmount.toFixed(2)} via ${paymentMethod.replace('_', ' ').toUpperCase()} has been verified and settled. Your tax invoice is now available for download.`;
          await pool.query(
            `INSERT INTO notifications (user_id, ticket_id, title, message, sender_id)
             VALUES (?, ?, 'Payment Verified & Settled', ?, ?)`,
            [finalUserId, resolvedTicketId || null, clientMessage, adminId]
          );
        } catch (e) {
          logger.debug('Customer notification error on verify: ' + e.message);
        }
      }

      // Notify Assigned Technician
      if (resolvedTicketId) {
        try {
          await notifyTechnicianOnPayment({
            connection: pool,
            ticketId: resolvedTicketId,
            paymentId: payment.payment_id,
            amount: finalAmount,
            senderId: adminId,
            paymentMethod
          });
        } catch (techErr) {
          logger.debug('Technician notification error on verify: ' + techErr.message);
        }
      }

      // Generate guest invoice token for downloading bill
      let customerEmail = null;
      let ticketNum = null;
      if (resolvedTicketId) {
        const [tks] = await pool.query('SELECT ticket_number, email FROM service_requests WHERE id = ? LIMIT 1', [resolvedTicketId]);
        if (tks.length > 0) {
          customerEmail = tks[0].email;
          ticketNum = tks[0].ticket_number;
        }
      }

      const invoiceAccessToken = generateGuestInvoiceAccessToken({
        ticketId: resolvedTicketId,
        ticketNumber: ticketNum,
        invoiceId: resolvedInvoiceId,
        userId: finalUserId,
        email: customerEmail
      });

      return res.status(200).json(formatResponse(true, 'Offline payment successfully verified and settled across all records.', {
        paymentId: payment.payment_id,
        orderId: payment.order_id,
        amount: finalAmount,
        status: 'paid',
        verificationStatus: 'verified',
        ticketId: resolvedTicketId,
        invoiceId: resolvedInvoiceId,
        invoiceAccessToken,
        token: invoiceAccessToken
      }));

    } else {
      // ── REJECT OFFLINE PAYMENT ──
      const updatedNote = payment.reference_note
        ? `${payment.reference_note} | Rejected: ${rejectionReason}`
        : `Rejected: ${rejectionReason}`;

      await connection.query(
        `UPDATE payments 
         SET status = 'rejected', 
             verification_status = 'rejected', 
             verified_by = ?, 
             verified_at = NOW(),
             error_message = ?,
             reference_note = ?
         WHERE id = ?`,
        [adminId, rejectionReason, updatedNote, payment.id]
      );

      // Update ticket payment status to 'rejected'
      if (resolvedTicketId) {
        await connection.query(
          `UPDATE service_requests 
           SET payment_status = 'rejected',
               collection_status = 'not_applicable'
           WHERE id = ?`,
          [resolvedTicketId]
        );
      }

      // If invoice was linked, ensure status is not Paid while preserving Final status for payment retry
      if (resolvedInvoiceId) {
        await connection.query(
          `UPDATE invoices 
           SET status = CASE WHEN status = 'Paid' THEN status ELSE 'Final' END,
               payment_id = NULL,
               payment_order_id = NULL,
               payment_method = NULL
           WHERE id = ? AND status != 'Paid'`,
          [resolvedInvoiceId]
        );
      }

      await connection.commit();

      logger.info(`Offline payment ${payment.payment_id} rejected by admin ${adminId}. Reason: ${rejectionReason}`);

      // Log Activity
      await logActivity(adminId, 'billing', 'reject_offline_payment', 'payments', payment.payment_id, {
        status: 'rejected',
        amount: finalAmount,
        rejectionReason,
        ticketId: resolvedTicketId,
        invoiceId: resolvedInvoiceId
      }, req.ip);

      // ── NOTIFY CUSTOMER & ASSIGNED TECHNICIAN (REJECTION) ──
      // Fetch ticket context if resolvedTicketId exists
      let ticketData = null;
      if (resolvedTicketId) {
        try {
          const [tRows] = await pool.query(
            `SELECT sr.id, sr.ticket_number, sr.brand, sr.model_number, sr.device_category,
                    sr.user_id, sr.company_id, sr.assigned_technician_id, sr.customer_name
             FROM service_requests sr WHERE sr.id = ? LIMIT 1`,
            [resolvedTicketId]
          );
          if (tRows.length > 0) {
            ticketData = tRows[0];
          }
        } catch (tErr) {
          logger.debug('Error fetching ticket data for payment rejection notification: ' + tErr.message);
        }
      }

      // Determine customer user ID from payment, ticket, or invoice
      const targetUserId = finalUserId || ticketData?.user_id || ticketData?.company_id || null;

      // 1. Notify Customer / Company User
      if (targetUserId) {
        try {
          // Verify customer user exists and is active
          const [uCheck] = await pool.query('SELECT id, is_active FROM users WHERE id = ? LIMIT 1', [targetUserId]);
          if (uCheck.length > 0 && uCheck[0].is_active !== 0 && uCheck[0].is_active !== false) {
            // Deduplication check: Do not send duplicate rejection notification for this payment
            const [existingCustNotif] = await pool.query(
              `SELECT id FROM notifications 
               WHERE user_id = ? 
                 AND title = 'Payment Verification Rejected' 
                 AND (
                   (ticket_id = ? AND message LIKE ?) 
                   OR message LIKE ?
                 )
               LIMIT 1`,
              [
                targetUserId,
                resolvedTicketId || null,
                payment.payment_id ? `%${payment.payment_id}%` : `%₹${finalAmount.toFixed(2)}%`,
                payment.payment_id ? `%${payment.payment_id}%` : `%₹${finalAmount.toFixed(2)}%`
              ]
            );

            if (existingCustNotif.length === 0) {
              const ticketRef = ticketData?.ticket_number || (resolvedTicketId ? `#${resolvedTicketId}` : '');
              const ticketLabel = ticketRef ? ` for repair ticket ${ticketRef}` : '';
              const paymentRefLabel = payment.payment_id ? ` (Ref: ${payment.payment_id})` : '';
              const methodLabel = paymentMethod ? ` via ${paymentMethod.replace(/_/g, ' ').toUpperCase()}` : '';
              const clientMessage = `Sir, your offline payment of ₹${finalAmount.toFixed(2)}${methodLabel}${paymentRefLabel}${ticketLabel} could not be verified and was rejected. Reason: ${rejectionReason}. Please retry or choose another payment method.`;

              await pool.query(
                `INSERT INTO notifications (user_id, ticket_id, title, message, sender_id)
                 VALUES (?, ?, 'Payment Verification Rejected', ?, ?)`,
                [targetUserId, resolvedTicketId || null, clientMessage, adminId]
              );
              logger.info(`Customer ${targetUserId} notified of payment rejection for payment ${payment.payment_id}`);
            } else {
              logger.info(`Skipping duplicate payment rejection notification for customer ${targetUserId} on payment ${payment.payment_id}`);
            }
          } else {
            logger.info(`Skipping payment rejection notification: Customer user ${targetUserId} not found or inactive`);
          }
        } catch (e) {
          logger.debug('Customer notification error on reject: ' + e.message);
        }
      }

      // 2. Notify Assigned Technician
      if (resolvedTicketId) {
        try {
          await notifyTechnicianOnPaymentRejection({
            connection: pool,
            ticketId: resolvedTicketId,
            paymentId: payment.payment_id,
            amount: finalAmount,
            senderId: adminId,
            paymentMethod,
            rejectionReason
          });
        } catch (techErr) {
          logger.debug('Technician notification error on reject: ' + techErr.message);
        }
      }

      return res.status(200).json(formatResponse(true, 'Offline payment has been rejected. Customer and technician have been notified.', {
        paymentId: payment.payment_id,
        status: 'rejected',
        verificationStatus: 'rejected',
        rejectionReason
      }));
    }

  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Get all quotations
 */
const getQuotations = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const { role, id: authUserId } = req.user;
    const { companyId, status } = req.query;

    let query = 'SELECT q.*, cp.company_name FROM quotations q LEFT JOIN company_profiles cp ON q.company_id = cp.user_id WHERE 1=1';
    const params = [];

    if (role === 'company') {
      query += ' AND q.company_id = ?';
      params.push(authUserId);
    } else if (companyId || (role === 'admin' && (req.headers['x-company-id'] || req.query.companyId))) {
      const targetCompanyId = companyId || (role === 'admin' ? (req.headers['x-company-id'] || req.query.companyId) : null);
      if (targetCompanyId) {
        query += ' AND q.company_id = ?';
        params.push(targetCompanyId);
      }
    }

    if (status) {
      query += ' AND q.status = ?';
      params.push(status);
    }

    query += ' ORDER BY q.created_at DESC';

    const [quotations] = await connection.query(query, params);

    const formattedQuotations = quotations.map(q => ({
      id: q.id,
      companyId: q.company_id,
      companyName: q.company_name,
      requestId: q.request_id,
      title: q.title,
      amount: parseFloat(q.amount),
      status: q.status,
      items: typeof q.items === 'string' ? JSON.parse(q.items) : q.items,
      notes: q.notes,
      createdAt: q.created_at,
      updatedAt: q.updated_at
    }));

    return res.status(200).json(formatResponse(true, 'Quotations fetched successfully.', formattedQuotations));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Get single quotation by ID
 */
const getQuotationById = async (req, res, next) => {
  const { id } = req.params;
  const { role, id: authUserId } = req.user;
  let connection;

  try {
    connection = await pool.getConnection();

    const [quotations] = await connection.query(
      'SELECT q.*, cp.company_name FROM quotations q LEFT JOIN company_profiles cp ON q.company_id = cp.user_id WHERE q.id = ? LIMIT 1',
      [id]
    );

    if (quotations.length === 0) {
      return res.status(404).json(formatResponse(false, 'Quotation not found.'));
    }

    const q = quotations[0];

    if (role === 'company' && q.company_id !== authUserId) {
      return res.status(403).json(formatResponse(false, 'Forbidden. Access restricted.'));
    }

    const formattedQuotation = {
      id: q.id,
      companyId: q.company_id,
      companyName: q.company_name,
      requestId: q.request_id,
      title: q.title,
      amount: parseFloat(q.amount),
      status: q.status,
      items: typeof q.items === 'string' ? JSON.parse(q.items) : q.items,
      notes: q.notes,
      createdAt: q.created_at,
      updatedAt: q.updated_at
    };

    return res.status(200).json(formatResponse(true, 'Quotation fetched successfully.', formattedQuotation));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Create new quotation (Admins & Technicians only)
 */
const createQuotation = async (req, res, next) => {
  const { companyId, requestId, title, amount, items, notes } = req.body;
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const quotationId = await generateQuotationId(connection);

    await connection.query(`
      INSERT INTO quotations (id, company_id, request_id, title, amount, status, items, notes)
      VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?)
    `, [
      quotationId,
      companyId,
      requestId || null,
      title,
      amount,
      JSON.stringify(items || []),
      notes || null
    ]);

    await connection.commit();
    logger.info(`Quotation created: ${quotationId} for company ID ${companyId}`);

    // Log Activity
    await logActivity(req.user.id, 'billing', 'create_quotation', 'quotations', quotationId, { companyId, amount }, req.ip);

    return res.status(201).json(formatResponse(true, 'Quotation created successfully.', { quotationId }));
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Update an existing quotation (Admins & Technicians only)
 */
const updateQuotation = async (req, res, next) => {
  const { id } = req.params;
  const { title, amount, items, notes, status } = req.body;
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [existing] = await connection.query('SELECT id FROM quotations WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json(formatResponse(false, 'Quotation not found.'));
    }

    await connection.query(`
      UPDATE quotations 
      SET title = ?, amount = ?, items = ?, notes = ?, status = ?
      WHERE id = ?
    `, [
      title,
      amount,
      JSON.stringify(items || []),
      notes || null,
      status || 'Pending',
      id
    ]);

    await connection.commit();
    logger.info(`Quotation updated: ${id}`);

    return res.status(200).json(formatResponse(true, 'Quotation updated successfully.'));
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Respond to quotation (Company only)
 */
const respondToQuotation = async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body; // 'Approved' or 'Rejected'
  const { id: companyId } = req.user;
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [quotations] = await connection.query(
      'SELECT * FROM quotations WHERE id = ? LIMIT 1',
      [id]
    );

    if (quotations.length === 0) {
      await connection.rollback();
      return res.status(404).json(formatResponse(false, 'Quotation not found.'));
    }

    const q = quotations[0];

    if (q.company_id !== companyId) {
      await connection.rollback();
      return res.status(403).json(formatResponse(false, 'Forbidden. Access restricted.'));
    }

    if (q.status !== 'Pending') {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, `Quotation has already been ${q.status}.`));
    }

    if (status !== 'Approved' && status !== 'Rejected') {
      await connection.rollback();
      return res.status(400).json(formatResponse(false, 'Invalid response status. Must be Approved or Rejected.'));
    }

    // Update status
    await connection.query(
      'UPDATE quotations SET status = ? WHERE id = ?',
      [status, id]
    );

    // If Approved, convert to an Invoice automatically!
    let generatedInvoiceIdVal = null;
    if (status === 'Approved') {
      generatedInvoiceIdVal = await generateInvoiceId(connection);

      // Get company name from profile
      const [profiles] = await connection.query(
        'SELECT company_name FROM company_profiles WHERE user_id = ? LIMIT 1',
        [companyId]
      );
      const clientName = profiles.length > 0 ? profiles[0].company_name : 'Valued Corporate Client';

      // Insert invoice
      await connection.query(`
        INSERT INTO invoices (id, user_id, client_name, amount, currency, invoice_date, due_date, status, notes)
        VALUES (?, ?, ?, ?, 'INR', ?, ?, 'Unpaid', ?)
      `, [
        generatedInvoiceIdVal,
        companyId,
        clientName,
        q.amount,
        new Date(), // invoiceDate
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // dueDate (Net 30)
        `Automatically generated from approved Quotation ${id}. \nNotes: ${q.notes || ''}`
      ]);

      // Insert line items
      const itemsList = typeof q.items === 'string' ? JSON.parse(q.items) : q.items;
      for (const item of itemsList) {
        const itemTotal = item.quantity * item.unitPrice;
        await connection.query(`
          INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total)
          VALUES (?, ?, ?, ?, ?)
        `, [
          generatedInvoiceIdVal,
          item.description,
          item.quantity,
          item.unitPrice,
          itemTotal
        ]);
      }

      logger.info(`Automated invoice generated: ${generatedInvoiceIdVal} from approved quote: ${id}`);
    }

    await connection.commit();
    logger.info(`Quotation status updated to ${status} for ID: ${id}`);

    // Log corporate activity
    const activityDetails = { quotationId: id, status };
    if (generatedInvoiceIdVal) {
      activityDetails.invoiceId = generatedInvoiceIdVal;
    }

    await logActivity(companyId, 'billing', status === 'Approved' ? 'approve_quotation' : 'reject_quotation', 'quotations', id, activityDetails, req.ip);

    return res.status(200).json(
      formatResponse(
        true,
        `Quotation successfully ${status.toLowerCase()}.`,
        generatedInvoiceIdVal ? { invoiceId: generatedInvoiceIdVal } : null
      )
    );
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Get verified payment receipt/bill for a repair ticket or invoice
 * GET /api/billing/receipt/ticket/:ticketId or GET /api/billing/receipt/:id
 */
const getPaymentReceipt = async (req, res, next) => {
  let connection;
  try {
    const targetId = req.params.ticketId || req.params.invoiceId || req.params.id || req.query.ticketId || req.query.invoiceId;
    const authUser = req.user || null;

    if (!targetId) {
      return res.status(400).json(formatResponse(false, 'Ticket ID or Invoice ID is required.'));
    }

    connection = await pool.getConnection();

    // 1. Try finding by Service Request first
    let tkQuery = `
      SELECT 
        sr.*,
        u.name as user_name,
        u.email as user_email,
        u.role as user_role,
        cp.company_name,
        cp.contact_person,
        cp.gst_number as company_tax_id,
        cd.serial_number as device_serial,
        cd.asset_id as device_asset_id,
        cd.brand as cd_brand,
        cd.model_number as cd_model
      FROM service_requests sr
      LEFT JOIN users u ON sr.user_id = u.id
      LEFT JOIN company_profiles cp ON sr.company_id = cp.user_id
      LEFT JOIN company_devices cd ON sr.device_id = cd.id
      WHERE (sr.id = ? OR sr.ticket_number = ?)
      LIMIT 1
    `;

    const [tkRows] = await connection.query(tkQuery, [targetId, targetId]);
    let ticket = tkRows.length > 0 ? tkRows[0] : null;

    let invoice = null;
    let lineItems = [];
    let isPaid = false;

    if (ticket) {
      // Fetch linked invoice
      const [invRows] = await connection.query(
        'SELECT * FROM invoices WHERE ticket_id = ? ORDER BY id DESC LIMIT 1',
        [ticket.id]
      );
      invoice = invRows.length > 0 ? invRows[0] : null;

      isPaid = ticket.payment_status === 'paid' || (invoice && invoice.status === 'Paid');

      // If not paid, verify whether a preview is allowed:
      if (!isPaid) {
        if (!invoice) {
          return res.status(400).json(formatResponse(false, 'Payment has not been settled for this repair ticket yet. Bill is only available for paid repairs or finalized invoices.'));
        }
        const isStaff = authUser && (authUser.role === 'admin' || authUser.role === 'technician');
        if (invoice.status === 'Draft' && !isStaff) {
          return res.status(400).json(formatResponse(false, 'Repair invoice is currently in Draft review. It will become available once Admin finalizes the invoice.'));
        }
      }

      // Verify Authorization across all roles and guest tokens
      const auth = await verifyInvoiceAuthorization(req, { ticket, invoice }, connection);
      if (!auth.authorized) {
        return res.status(auth.statusCode || 403).json(formatResponse(false, auth.error || 'Access denied.'));
      }

      if (invoice) {
        const [liRows] = await connection.query(
          'SELECT * FROM invoice_line_items WHERE invoice_id = ?',
          [invoice.id]
        );
        lineItems = liRows;
      }
    } else {
      // 2. Try finding by Invoice ID directly
      const [invRows] = await connection.query(
        'SELECT * FROM invoices WHERE id = ? LIMIT 1',
        [targetId]
      );
      if (invRows.length === 0) {
        return res.status(404).json(formatResponse(false, 'Payment receipt or invoice not found.'));
      }
      invoice = invRows[0];

      if (invoice.ticket_id) {
        const [tkRows2] = await connection.query(tkQuery, [invoice.ticket_id, invoice.ticket_id]);
        if (tkRows2.length > 0) ticket = tkRows2[0];
      }

      isPaid = invoice.status === 'Paid' || (ticket && ticket.payment_status === 'paid');

      if (!isPaid) {
        const isStaff = authUser && (authUser.role === 'admin' || authUser.role === 'technician');
        if (invoice.status === 'Draft' && !isStaff) {
          return res.status(400).json(formatResponse(false, 'This invoice is currently in Draft review. It will become available once finalized.'));
        }
      }

      // Verify Authorization across all roles and guest tokens
      const auth = await verifyInvoiceAuthorization(req, { ticket, invoice }, connection);
      if (!auth.authorized) {
        return res.status(auth.statusCode || 403).json(formatResponse(false, auth.error || 'Access denied.'));
      }

      const [liRows] = await connection.query(
        'SELECT * FROM invoice_line_items WHERE invoice_id = ?',
        [invoice.id]
      );
      lineItems = liRows;
    }

    const totalAmount = ticket
      ? parseFloat(ticket.repair_cost || (invoice ? invoice.amount : 0))
      : parseFloat(invoice.amount || 0);

    if (lineItems.length === 0) {
      const baseRepairCost = ticket ? parseFloat(ticket.repair_cost || ticket.estimated_cost || 0) : totalAmount;
      const addCharges = ticket ? parseFloat(ticket.additional_charges || 0) : 0;
      if (addCharges > 0) {
        lineItems = [
          {
            id: 1,
            description: ticket
              ? `Device Repair Service - ${ticket.brand || ''} ${ticket.model_number || ''}`.trim()
              : 'Device Repair Service',
            quantity: 1,
            unitPrice: baseRepairCost,
            total: baseRepairCost,
            taxRate: 18
          },
          {
            id: 2,
            description: 'Additional Service & Components Charges',
            quantity: 1,
            unitPrice: addCharges,
            total: addCharges,
            taxRate: 18
          }
        ];
      } else {
        lineItems = [
          {
            id: 1,
            description: ticket
              ? `Device Repair Service - ${ticket.brand || ''} ${ticket.model_number || ''}`.trim()
              : (invoice ? invoice.notes || 'IT & Device Repair Service' : 'Repair Service'),
            quantity: 1,
            unitPrice: totalAmount,
            total: totalAmount,
            taxRate: 18
          }
        ];
      }
    } else {
      lineItems = lineItems.map(li => ({
        id: li.id,
        description: li.description,
        hsn_sac: li.hsn_sac || '9987',
        quantity: li.quantity || 1,
        unitPrice: parseFloat(li.unit_price !== undefined ? li.unit_price : li.total),
        total: parseFloat(li.total),
        tax_rate: li.tax_rate !== undefined && li.tax_rate !== null ? parseFloat(li.tax_rate) : 18.0,
        tax_amount: li.tax_amount !== undefined && li.tax_amount !== null ? parseFloat(li.tax_amount) : 0
      }));
    }

    // Fetch linked payment record
    const [pmtRows] = await connection.query(
      'SELECT * FROM payments WHERE (ticket_id IS NOT NULL AND ticket_id = ?) OR (invoice_id IS NOT NULL AND invoice_id = ?) OR payment_id = ? ORDER BY id DESC LIMIT 1',
      [ticket ? ticket.id : null, invoice ? invoice.id : null, (ticket && ticket.payment_id) || (invoice && invoice.payment_id) || '']
    );
    const payment = pmtRows.length > 0 ? pmtRows[0] : null;

    // Site settings
    const [settingsRows] = await connection.query('SELECT setting_key as `key`, setting_value as `value` FROM site_settings');
    const settings = {};
    settingsRows.forEach(row => {
      settings[row.key] = row.value;
    });

    const billNumber = invoice ? invoice.id : `BILL-${ticket ? (ticket.ticket_number || ticket.id) : Date.now()}`;
    const paymentDate = (ticket && ticket.paid_at) || (invoice && invoice.paid_at) || (payment && payment.created_at) || new Date();

    let logoUrl = settings.logo_url || null;
    let logoBase64 = null;

    try {
      const blackLogoPath = path.join(config.paths.uploadsRoot, 'tekdoctor_logo_black.png');
      if (fs.existsSync(blackLogoPath)) {
        const fileBuf = fs.readFileSync(blackLogoPath);
        logoBase64 = `data:image/png;base64,${fileBuf.toString('base64')}`;
      } else if (logoUrl) {
        const cleanLogoPath = logoUrl.replace(/^\/uploads\//, '').replace(/^uploads\//, '');
        const absLogoPath = path.join(config.paths.uploadsRoot, cleanLogoPath);
        if (fs.existsSync(absLogoPath)) {
          const ext = path.extname(absLogoPath).toLowerCase().replace('.', '') || 'png';
          const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
          const fileBuf = fs.readFileSync(absLogoPath);
          logoBase64 = `data:${mime};base64,${fileBuf.toString('base64')}`;
        }
      }
    } catch (err) {
      logger.warn(`Could not read logo file for bill: ${err.message}`);
    }

    // Look up company profile if applicable
    let companyProfile = null;
    const resolvedCompanyUserId = (ticket && ticket.company_id) || (payment && payment.company_id) || (invoice && invoice.user_id) || null;
    if (resolvedCompanyUserId) {
      const [cpRows] = await connection.query('SELECT * FROM company_profiles WHERE user_id = ? LIMIT 1', [resolvedCompanyUserId]);
      if (cpRows.length > 0) companyProfile = cpRows[0];
    }

    const companyGstin = (companyProfile && companyProfile.gst_number) || (ticket && ticket.company_tax_id) || null;
    const companyAddress = (companyProfile && companyProfile.address) || (ticket ? ticket.address : null);

    // TekDoctor GSTIN & State
    const businessGstin = settings.gstin || settings.company_tax_id || '27AAAAA0000A1Z5';
    const businessStateCode = businessGstin.substring(0, 2); // '27' for Maharashtra

    // Check interstate vs intrastate
    let resolvedIsInterstate = false;
    if (invoice && invoice.is_interstate !== null && invoice.is_interstate !== undefined) {
      resolvedIsInterstate = Boolean(invoice.is_interstate);
    } else if (companyGstin && companyGstin.length >= 2) {
      const compStateCode = companyGstin.substring(0, 2);
      if (/^\d{2}$/.test(compStateCode) && compStateCode !== businessStateCode) {
        resolvedIsInterstate = true;
      }
    } else if (companyAddress && !companyAddress.toLowerCase().includes('maharashtra') && (
      companyAddress.toLowerCase().includes('karnataka') ||
      companyAddress.toLowerCase().includes('delhi') ||
      companyAddress.toLowerCase().includes('tamil nadu') ||
      companyAddress.toLowerCase().includes('gujarat') ||
      companyAddress.toLowerCase().includes('telangana')
    )) {
      resolvedIsInterstate = true;
    }

    let resolvedGrandTotal = 0;
    let resolvedSubtotal = 0;
    let resolvedTaxAmount = 0;
    let resolvedCgstAmount = 0;
    let resolvedSgstAmount = 0;
    let resolvedIgstAmount = 0;

    let formattedLineItems = [];

    if (invoice && invoice.subtotal !== null && invoice.subtotal !== undefined) {
      resolvedGrandTotal = parseFloat(invoice.amount || 0);
      resolvedSubtotal = parseFloat(invoice.subtotal || 0);
      resolvedTaxAmount = parseFloat(invoice.tax_amount || 0);
      resolvedCgstAmount = parseFloat(invoice.cgst_amount || 0);
      resolvedSgstAmount = parseFloat(invoice.sgst_amount || 0);
      resolvedIgstAmount = parseFloat(invoice.igst_amount || 0);

      formattedLineItems = lineItems.map((li, idx) => {
        const qty = parseInt(li.quantity || 1, 10) || 1;
        const unitRate = parseFloat(li.unit_price !== undefined ? li.unit_price : (li.unitPrice !== undefined ? li.unitPrice : (li.total / qty)));
        const amount = parseFloat(li.total !== undefined ? li.total : (qty * unitRate));
        const taxRate = parseFloat(li.tax_rate !== undefined && li.tax_rate !== null ? li.tax_rate : (li.taxRate !== undefined && li.taxRate !== null ? li.taxRate : 18));
        const taxAmount = parseFloat(li.tax_amount !== undefined && li.tax_amount !== null ? li.tax_amount : Math.round((amount * taxRate / 100) * 100) / 100);
        const hsnSac = li.hsn_sac || li.hsnSac || li.sacCode || '9987';

        return {
          id: li.id || idx + 1,
          description: li.description || 'Repair Service Item',
          hsnSac: hsnSac,
          sacCode: hsnSac,
          quantity: qty,
          unitRate: unitRate,
          unitPrice: unitRate,
          amount: amount,
          total: amount,
          taxRate: taxRate,
          taxAmount: taxAmount,
          taxableAmount: amount
        };
      });
    } else {
      // Legacy fallback or ticket-only bill
      resolvedGrandTotal = totalAmount;
      const legacyCalculated = calculateInvoiceTotals(lineItems.map(li => ({
        id: li.id,
        description: li.description,
        hsnSac: li.hsn_sac || li.hsnSac || '9987',
        quantity: li.quantity || 1,
        unitPrice: li.unit_price || li.unitPrice || (li.total / (li.quantity || 1)),
        taxRate: li.tax_rate !== undefined ? li.tax_rate : 18
      })), resolvedIsInterstate);

      resolvedSubtotal = legacyCalculated.subtotal;
      resolvedTaxAmount = legacyCalculated.taxAmount;
      resolvedCgstAmount = legacyCalculated.cgstAmount;
      resolvedSgstAmount = legacyCalculated.sgstAmount;
      resolvedIgstAmount = legacyCalculated.igstAmount;
      resolvedGrandTotal = legacyCalculated.grandTotal;

      formattedLineItems = legacyCalculated.processedItems.map(item => ({
        id: item.id,
        description: item.description,
        hsnSac: item.hsn_sac,
        sacCode: item.hsn_sac,
        quantity: item.quantity,
        unitRate: item.unit_price,
        unitPrice: item.unit_price,
        amount: item.total,
        total: item.total,
        taxRate: item.tax_rate,
        taxAmount: item.tax_amount,
        taxableAmount: item.total
      }));
    }

    const isCompanyClient = Boolean(
      (ticket && ticket.company_id) ||
      (payment && payment.company_id) ||
      companyProfile ||
      (authUser && authUser.role === 'company')
    );

    const originalEstimate = invoice && invoice.original_estimate !== null && invoice.original_estimate !== undefined
      ? parseFloat(invoice.original_estimate)
      : (ticket && ticket.estimated_cost !== null && ticket.estimated_cost !== undefined
        ? parseFloat(ticket.estimated_cost)
        : (ticket && ticket.repair_cost !== null && ticket.repair_cost !== undefined ? parseFloat(ticket.repair_cost) : null));

    const estimateDisclaimer = 'This is an approximate repair estimate provided by the technician for approval purposes. It is not the final invoice. The final amount may vary based on actual parts, services, technician/service charges, and applicable taxes after repair completion.';

    const receiptData = {
      receiptNumber: billNumber,
      invoiceId: invoice ? invoice.id : null,
      ticketId: ticket ? ticket.id : null,
      ticketNumber: ticket ? ticket.ticket_number : null,
      billDate: paymentDate,
      paymentDate: paymentDate,
      paymentStatus: isPaid ? 'paid' : (invoice && invoice.status === 'Draft' ? 'draft' : ((payment && payment.status) || (ticket && ticket.payment_status) || 'unpaid')),
      collectionStatus: (payment && payment.collection_status) || (ticket && ticket.collection_status) || null,
      invoiceStatus: invoice ? invoice.status : (isPaid ? 'Paid' : 'Pending'),
      isFinal: invoice ? (invoice.status === 'Final' || invoice.status === 'Paid') : isPaid,
      originalEstimate: originalEstimate,
      originalEstimateLabel: 'Original Repair Estimate (Technician) (Without GST)',
      estimateDisclaimer: estimateDisclaimer,
      paymentId: (ticket && ticket.payment_id) || (invoice && invoice.payment_id) || (payment ? payment.payment_id : (isPaid ? 'VERIFIED-SETTLEMENT' : null)),
      orderId: (ticket && ticket.payment_order_id) || (invoice && invoice.payment_order_id) || (payment ? payment.order_id : null),
      paymentMethod: (ticket && ticket.payment_method) || (invoice && invoice.payment_method) || (payment ? payment.payment_method : (isPaid ? 'Debit / Credit Card (Razorpay)' : 'Pending')),
      referenceNote: (payment && (payment.reference_note || payment.notes)) || null,
      clientType: isCompanyClient ? 'company' : 'individual',
      customer: {
        name: (companyProfile && companyProfile.company_name) || (ticket && (ticket.company_name || ticket.customer_name || ticket.user_name)) || (invoice ? invoice.client_name : 'Customer'),
        contactPerson: (companyProfile && companyProfile.contact_person) || (ticket && ticket.company_name ? ticket.customer_name : null),
        email: (ticket && (ticket.email || ticket.user_email)) || (companyProfile && authUser ? authUser.email : (authUser ? authUser.email : 'N/A')),
        mobile: (companyProfile && companyProfile.phone_number) || (ticket && ticket.mobile) || 'N/A',
        address: companyAddress,
        city: ticket ? ticket.city : null,
        state: ticket ? ticket.state : null,
        zipCode: ticket ? ticket.zip_code : null,
        companyName: (companyProfile && companyProfile.company_name) || (ticket ? ticket.company_name : null),
        companyTaxId: companyGstin,
        gstin: companyGstin
      },
      device: ticket ? {
        brand: ticket.brand || 'Standard',
        modelNumber: ticket.cd_model || ticket.model_number || 'N/A',
        category: ticket.device_category || 'Electronics Device',
        serialNumber: ticket.device_serial || ticket.serial_number || 'N/A',
        assetId: ticket.device_asset_id || null,
        problemDescription: ticket.problem_description || 'Device diagnostics and component repair',
        serviceType: ticket.service_type || 'Service Center Repair'
      } : null,
      financials: (() => {
        const effectiveTaxRate = resolvedSubtotal > 0
          ? Math.round((resolvedTaxAmount / resolvedSubtotal) * 10000) / 100
          : (formattedLineItems.length > 0 && formattedLineItems[0].taxRate !== undefined ? formattedLineItems[0].taxRate : 18.0);
        const halfRate = Math.round((effectiveTaxRate / 2) * 100) / 100;

        return {
          currency: 'INR',
          currencySymbol: '₹',
          subtotal: resolvedSubtotal,
          taxableAmount: resolvedSubtotal,
          taxRate: effectiveTaxRate,
          taxAmount: resolvedTaxAmount,
          totalGst: resolvedTaxAmount,
          isInterstate: resolvedIsInterstate,
          cgstRate: resolvedIsInterstate ? 0 : halfRate,
          cgstAmount: resolvedCgstAmount,
          sgstRate: resolvedIsInterstate ? 0 : halfRate,
          sgstAmount: resolvedSgstAmount,
          igstRate: resolvedIsInterstate ? effectiveTaxRate : 0,
          igstAmount: resolvedIgstAmount,
          totalAmount: resolvedGrandTotal,
          grandTotal: resolvedGrandTotal,
          amountPaid: isPaid ? resolvedGrandTotal : 0.00,
          balanceDue: isPaid ? 0.00 : resolvedGrandTotal,
          originalEstimate: originalEstimate,
          originalEstimateLabel: 'Original Repair Estimate (Technician) (Without GST)',
          estimateDisclaimer: estimateDisclaimer,
          lineItems: formattedLineItems
        };
      })(),
      business: {
        name: settings.company_name || settings.site_name || 'TekDoctor',
        tagline: settings.company_tagline || "Your Computer's Personal Care Specialist",
        logoUrl: logoUrl,
        logoBase64: logoBase64,
        address: settings.company_address || 'Silicon Valley Hub, Mumbai, Maharashtra, India',
        email: settings.contact_email || settings.support_email || settings.company_email || 'support@tekdoctor.in',
        phone: settings.contact_phone || settings.company_phone || '+91 98765 43210',
        gstin: businessGstin,
        website: config.frontend?.url || 'https://thetekdoctor.com'
      }
    };

    return res.status(200).json(formatResponse(true, 'Payment bill retrieved successfully.', receiptData));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Record client-reported payment failure or cancellation and notify the user
 * POST /api/billing/payment-failed
 */
const handlePaymentFailure = async (req, res, next) => {
  const reqBody = req.body || {};
  const orderId = reqBody.orderId || reqBody.order_id;
  const ticketId = reqBody.ticketId || reqBody.ticket_id;
  const invoiceId = reqBody.invoiceId || reqBody.invoice_id;
  const reason = reqBody.reason || reqBody.error || 'Payment could not be completed';
  const status = reqBody.status === 'cancelled' ? 'cancelled' : 'failed';
  let connection;

  try {
    connection = await pool.getConnection();

    let targetUserId = req.user ? req.user.id : null;
    let resolvedTicketId = ticketId;

    if (orderId) {
      const [pmts] = await connection.query(
        "SELECT user_id, ticket_id, invoice_id, status FROM payments WHERE order_id = ? LIMIT 1",
        [orderId]
      );
      if (pmts.length > 0) {
        if (pmts[0].status === 'paid') {
          return res.status(200).json(formatResponse(true, 'Payment already verified as paid.', { status: 'paid' }));
        }
        if (!targetUserId && pmts[0].user_id) targetUserId = pmts[0].user_id;
        if (!resolvedTicketId && pmts[0].ticket_id) resolvedTicketId = pmts[0].ticket_id;

        await connection.query(
          "UPDATE payments SET status = ?, error_message = ? WHERE order_id = ? AND status != 'paid'",
          [status, reason, orderId]
        );
      }
    }

    if (!targetUserId && resolvedTicketId) {
      const [tks] = await connection.query(
        "SELECT user_id FROM service_requests WHERE id = ? LIMIT 1",
        [resolvedTicketId]
      );
      if (tks.length > 0 && tks[0].user_id) targetUserId = tks[0].user_id;
    }

    // Insert user notification on failure
    if (targetUserId) {
      await connection.query(
        `INSERT INTO notifications (user_id, ticket_id, title, message, sender_id)
         VALUES (?, ?, 'Payment Failed', 'Sir, your payment could not be completed and has failed. Please try again.', NULL)`,
        [targetUserId, resolvedTicketId || null]
      );
    }

    if (targetUserId) {
      await logActivity(
        targetUserId,
        'billing',
        'payment_failed',
        'service_requests',
        resolvedTicketId || invoiceId,
        { orderId, reason, status },
        req.ip
      );
    }

    return res.status(200).json(formatResponse(true, 'Payment failure recorded and user notified.', {
      orderId,
      status,
      message: 'Sir, your payment could not be completed and has failed. Please try again.'
    }));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  reactivateInvoice,
  payInvoice,
  getPaymentConfig,
  createPaymentOrder,
  verifyPayment,
  processAuthoritativePaymentSettlement,
  handlePaymentFailure,
  getPaymentEligibility,
  checkTicketPaymentEligibility,
  getPayments,
  getPaymentReceipt,
  handleRazorpayWebhook,
  getQuotations,
  getQuotationById,
  createQuotation,
  updateQuotation,
  respondToQuotation,
  notifyTechnicianOnPayment,
  notifyTechnicianOnPaymentRejection,
  initiateOfflinePayment,
  recordCashCollected,
  verifyOfflinePayment,
  switchPaymentMethod,
  finalizeInvoice,
  calculateInvoiceTotals
};
