const { pool } = require('../config/db.config');
const { formatResponse, generateInvoiceId, generateQuotationId } = require('../utils/helpers');
const logger = require('../utils/logger');
const { logActivity } = require('../utils/activity.logger');

/**
 * Get all invoices (Customers view their own, Admins/Technicians view all)
 */
const getInvoices = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const { role, id: authUserId } = req.user;
    const { userId, status } = req.query;

    let query = 'SELECT * FROM invoices WHERE 1=1';
    const params = [];

    // Security Check: Customers/Companies can only see their own invoices
    if (role === 'customer' || role === 'company') {
      query += ' AND user_id = ?';
      params.push(authUserId);
    } else if (userId) {
      // Admins/Technicians can filter by userId
      query += ' AND user_id = ?';
      params.push(userId);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

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
        quantity: item.quantity,
        unitPrice: item.unit_price,
        total: item.total
      });
    });

    // Format response (mapping snake_case to camelCase)
    const formattedInvoices = invoices.map(inv => ({
      id: inv.id,
      userId: inv.user_id,
      clientName: inv.client_name,
      amount: parseFloat(inv.amount),
      currency: inv.currency,
      invoiceDate: inv.invoice_date,
      dueDate: inv.due_date,
      status: inv.status,
      notes: inv.notes,
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

    const [invoices] = await connection.query(
      'SELECT * FROM invoices WHERE id = ? LIMIT 1',
      [id]
    );

    if (invoices.length === 0) {
      return res.status(404).json(formatResponse(false, 'Invoice not found.'));
    }

    const inv = invoices[0];

    // Security Check: Customers and Companies cannot view other users' invoices
    if ((role === 'customer' || role === 'company') && inv.user_id !== authUserId) {
      return res.status(403).json(formatResponse(false, 'Forbidden. Access to this invoice is restricted.'));
    }

    // Fetch line items
    const [lineItems] = await connection.query(
      'SELECT * FROM invoice_line_items WHERE invoice_id = ?',
      [id]
    );

    const formattedInvoice = {
      id: inv.id,
      userId: inv.user_id,
      clientName: inv.client_name,
      amount: parseFloat(inv.amount),
      currency: inv.currency,
      invoiceDate: inv.invoice_date,
      dueDate: inv.due_date,
      status: inv.status,
      notes: inv.notes,
      createdAt: inv.created_at,
      updatedAt: inv.updated_at,
      lineItems: lineItems.map(item => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        total: item.total
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
 * Create new invoice (Admins & Technicians only)
 */
const createInvoice = async (req, res, next) => {
  const { clientName, userId, amount, currency, invoiceDate, dueDate, status, notes, lineItems } = req.body;
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Generate unique sequential invoice ID (e.g. inv-001)
    const invoiceId = await generateInvoiceId(connection);

    // 2. Insert into invoices table
    await connection.query(`
      INSERT INTO invoices (id, user_id, client_name, amount, currency, invoice_date, due_date, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      invoiceId,
      userId,
      clientName,
      amount,
      currency || 'INR',
      new Date(invoiceDate),
      new Date(dueDate),
      status || 'Draft',
      notes || null
    ]);

    // 3. Insert each line item
    for (const item of lineItems) {
      const itemTotal = item.quantity * item.unitPrice;
      await connection.query(`
        INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total)
        VALUES (?, ?, ?, ?, ?)
      `, [invoiceId, item.description, item.quantity, item.unitPrice, itemTotal]);
    }

    await connection.commit();
    logger.info(`Invoice created: ${invoiceId} for user ID ${userId} (amount: ${amount})`);

    // Log Activity
    await logActivity(req.user.id, 'billing', 'create_invoice', 'invoices', invoiceId, { userId, amount }, req.ip);

    return res.status(201).json(formatResponse(true, 'Invoice created successfully.', { invoiceId }));

  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Update an invoice (Admins & Technicians only)
 */
const updateInvoice = async (req, res, next) => {
  const { id } = req.params;
  const { clientName, userId, amount, currency, invoiceDate, dueDate, status, notes, lineItems } = req.body;
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Verify existence
    const [existing] = await connection.query('SELECT id FROM invoices WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json(formatResponse(false, 'Invoice not found.'));
    }

    // 2. Update invoices table
    await connection.query(`
      UPDATE invoices 
      SET user_id = ?, client_name = ?, amount = ?, currency = ?, invoice_date = ?, due_date = ?, status = ?, notes = ?
      WHERE id = ?
    `, [
      userId,
      clientName,
      amount,
      currency || 'INR',
      new Date(invoiceDate),
      new Date(dueDate),
      status,
      notes || null,
      id
    ]);

    // 3. Update line items: Delete old ones and insert new ones
    await connection.query('DELETE FROM invoice_line_items WHERE invoice_id = ?', [id]);

    for (const item of lineItems) {
      const itemTotal = item.quantity * item.unitPrice;
      await connection.query(`
        INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total)
        VALUES (?, ?, ?, ?, ?)
      `, [id, item.description, item.quantity, item.unitPrice, itemTotal]);
    }

    await connection.commit();
    logger.info(`Invoice updated: ${id}`);

    return res.status(200).json(formatResponse(true, 'Invoice updated successfully.'));

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

    const [existing] = await connection.query('SELECT id FROM invoices WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Invoice not found.'));
    }

    // Delete query (cascades automatically to invoice_line_items via FK config)
    await connection.query('DELETE FROM invoices WHERE id = ?', [id]);

    logger.info(`Invoice deleted: ${id}`);
    return res.status(200).json(formatResponse(true, 'Invoice deleted successfully.'));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Process invoice payment (Mark as Paid)
 */
const payInvoice = async (req, res, next) => {
  const { invoiceId } = req.body;
  const { role, id: authUserId } = req.user;
  let connection;

  try {
    connection = await pool.getConnection();

    const [invoices] = await connection.query(
      'SELECT user_id, status FROM invoices WHERE id = ? LIMIT 1',
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

    // Mark as Paid
    await connection.query(
      'UPDATE invoices SET status = "Paid" WHERE id = ?',
      [invoiceId]
    );

    logger.info(`Invoice marked as Paid: ${invoiceId}`);

    // Log Activity
    await logActivity(req.user.id, 'billing', 'pay_invoice', 'invoices', invoiceId, { status: 'Paid' }, req.ip);

    return res.status(200).json(formatResponse(true, 'Payment recorded successfully. Invoice status is now Paid.'));

  } catch (error) {
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
    } else if (companyId) {
      query += ' AND q.company_id = ?';
      params.push(companyId);
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

module.exports = {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  payInvoice,
  getQuotations,
  getQuotationById,
  createQuotation,
  updateQuotation,
  respondToQuotation
};
