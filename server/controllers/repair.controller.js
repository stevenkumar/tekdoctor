const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const { formatResponse, generateTicketNumber } = require('../utils/helpers');
const logger = require('../utils/logger');
const { sendAdminNotification, sendCustomerNotification } = require('../utils/email.utils');
const { logActivity } = require('../utils/activity.logger');

// Generate JWT token helper
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, token_version: user.token_version || 1 },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
};

/**
 * Submit a new repair/service request
 */
const createRepairRequest = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const {
      customerName,
      mobile,
      email,
      city,
      deviceCategory,
      brand,
      customBrand,
      modelNumber,
      serialNumber,
      deviceConfiguration,
      problemType,
      problemDescription,
      serviceType,
      priority,
      preferredContactMethod,
      address,
      state,
      zipCode
    } = req.body;

    let userId = req.user ? req.user.id : null;
    let autoLoginData = null;

    // Guest flow: User is not authenticated but provided an email
    if (!userId && email) {
      // Check if user already exists
      const [existingUsers] = await connection.query(
        'SELECT id, name, email, role FROM users WHERE email = ? LIMIT 1',
        [email]
      );

      if (existingUsers.length > 0) {
        // Associate request with existing user
        userId = existingUsers[0].id;
      } else {
        // Auto-create guest user account
        const randomPassword = uuidv4().substring(0, 12);
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(randomPassword, salt);

        const [userResult] = await connection.query(
          'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
          [customerName, email, hashedPassword, 'customer']
        );

        userId = userResult.insertId;
        const newUser = { id: userId, name: customerName, email, role: 'customer' };
        const token = generateToken(newUser);

        autoLoginData = {
          token,
          user: newUser,
          generatedPassword: randomPassword // Include this for debugging/informing if needed
        };

        logger.info(`Guest account auto-created: ${email} (ID: ${userId})`);
      }
    }

    // Extract file paths from multer fields
    let deviceImagePath = null;
    let screenshotPath = null;

    if (req.files) {
      if (req.files.deviceImage && req.files.deviceImage[0]) {
        deviceImagePath = `/uploads/repairs/images/${req.files.deviceImage[0].filename}`;
      }
      if (req.files.errorScreenshot && req.files.errorScreenshot[0]) {
        screenshotPath = `/uploads/repairs/screenshots/${req.files.errorScreenshot[0].filename}`;
      }
    }

    let userRole = req.user ? req.user.role : (autoLoginData?.user?.role || 'customer');
    let ticketPrefix = userRole === 'company' ? 'TD-C' : 'TD-';

    let customerIdStr = userId ? `${ticketPrefix}${String(userId).padStart(3, '0')}` : `${ticketPrefix}GUEST-${Math.floor(1000 + Math.random() * 9000)}`;

    let requestCount = 1;
    if (userId) {
      const [existingCount] = await connection.query('SELECT COUNT(*) as count FROM service_requests WHERE user_id = ?', [userId]);
      requestCount = existingCount[0].count + 1;
    }

    const ticketNumber = `${customerIdStr}-R${String(requestCount).padStart(3, '0')}`;

    // Insert service request
    const [result] = await connection.query(`
      INSERT INTO service_requests (
        user_id, customer_name, mobile, email, address, city, state, zip_code, device_category, 
        brand, custom_brand, model_number, serial_number, device_configuration, problem_type, 
        problem_description, service_type, priority, preferred_contact_method, 
        image_path, screenshot_path, status, ticket_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [
      userId, customerName, mobile, email || null, address || null, city,
      state || null, zipCode || null, deviceCategory, brand, customBrand || null,
      modelNumber || null, serialNumber || null, deviceConfiguration || null, problemType,
      problemDescription, serviceType || 'Bring to Service Center', priority || 'Standard',
      preferredContactMethod || 'WhatsApp', deviceImagePath, screenshotPath, ticketNumber
    ]);

    const requestId = result.insertId;
    await connection.commit();

    logger.info(`Repair request submitted: ID ${requestId} by ${customerName}`);

    // Handle Google Sheets Integration Webhook asynchronously
    try {
      const [settings] = await connection.query(
        "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('google_sheet_enabled', 'google_sheet_url')"
      );
      const settingsMap = {};
      settings.forEach(s => {
        settingsMap[s.setting_key] = s.setting_value;
      });

      if (settingsMap.google_sheet_enabled === 'true' && settingsMap.google_sheet_url) {
        const { triggerGoogleSheetWebhook } = require('../utils/webhook.utils');
        triggerGoogleSheetWebhook(settingsMap.google_sheet_url, {
          type: 'repair_request',
          requestId,
          ticketNumber,
          customerName,
          mobile,
          email,
          city,
          deviceCategory,
          brand,
          customBrand,
          modelNumber,
          serialNumber,
          deviceConfiguration,
          problemType,
          problemDescription,
          serviceType,
          priority,
          preferredContactMethod
        }).catch(err => logger.error('Failed to trigger Google Sheets Webhook for repair request:', err));
      }
    } catch (wsErr) {
      logger.error('Error fetching/triggering Google Sheets integration for repair request:', wsErr);
    }

    // Asynchronously send email notification to admin
    const emailSubject = `New Repair Request [ID: ${requestId}] - ${customerName}`;
    const emailHtml = `
      <h2>New Repair Request Submitted</h2>
      <p><strong>Request ID:</strong> ${requestId}</p>
      <p><strong>Customer Name:</strong> ${customerName}</p>
      <p><strong>Mobile:</strong> ${mobile}</p>
      <p><strong>Email:</strong> ${email || 'N/A'}</p>
      <p><strong>Device:</strong> ${brand} ${modelNumber || ''} (${deviceCategory})</p>
      <p><strong>Serial Number:</strong> ${serialNumber || 'N/A'}</p>
      <p><strong>Device Configuration:</strong> ${deviceConfiguration || 'N/A'}</p>
      <p><strong>Problem:</strong> ${problemType}</p>
      <p><strong>Description:</strong><br/>${problemDescription}</p>
      <p><strong>Service Preference:</strong> ${serviceType || 'Bring to Service Center'}</p>
      <p><strong>Priority:</strong> ${priority || 'Standard'}</p>
    `;
    sendAdminNotification(emailSubject, emailHtml).catch(err => logger.error('Failed to send repair notification'));

    const responsePayload = { requestId, ticketNumber };
    if (autoLoginData) {
      responsePayload.autoLogin = autoLoginData;

      // Send Welcome/Password Setup Email to the newly auto-registered customer
      const welcomeSubject = `Welcome to TekDoctor! Your Account is Ready`;
      const welcomeHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #00e5ff;">Welcome, ${autoLoginData.user.name}!</h2>
          <p>Thank you for submitting a repair request. We have automatically created a customer account for you to track your service status easily.</p>
          <div style="background: #f4f4f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Your Login Credentials:</strong></p>
            <p style="margin: 0 0 5px 0;"><strong>Email:</strong> ${autoLoginData.user.email}</p>
            <p style="margin: 0;"><strong>Temporary Password:</strong> ${autoLoginData.generatedPassword}</p>
          </div>
          <p>You can sign in from any device to check your repair progress. We recommend logging in and changing this temporary password from your Profile page as soon as possible.</p>
          <p>Best regards,<br/>The TekDoctor Team</p>
        </div>
      `;
      sendCustomerNotification(autoLoginData.user.email, welcomeSubject, welcomeHtml).catch(err => logger.error('Failed to send auto-registration welcome email'));
    }

    // Log Activity
    await logActivity(req.user ? req.user.id : null, 'repair', 'create_repair_request', 'service_requests', requestId, { ticketNumber }, req.ip);

    return res.status(201).json(formatResponse(true, 'Repair request submitted successfully.', responsePayload));

  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Fetch list of repair requests (Admin / Technician)
 */
const getRepairRequests = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();

    // Pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Filters
    const statusFilter = req.query.status;
    const priorityFilter = req.query.priority;
    const technicianFilter = req.query.technicianId;
    const deviceCategoryFilter = req.query.deviceCategory;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const search = req.query.search ? req.query.search.trim() : '';

    let baseQuery = ' FROM service_requests';
    const queryParams = [];
    const whereConditions = [];

    if (search) {
      whereConditions.push('(ticket_number LIKE ? OR customer_name LIKE ? OR mobile LIKE ? OR email LIKE ? OR brand LIKE ? OR model_number LIKE ? OR serial_number LIKE ? OR device_category LIKE ? OR city LIKE ?)');
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (statusFilter && statusFilter !== 'all') {
      whereConditions.push('status = ?');
      queryParams.push(statusFilter);
    }

    if (priorityFilter && priorityFilter !== 'all') {
      whereConditions.push('priority = ?');
      queryParams.push(priorityFilter);
    }

    if (technicianFilter && technicianFilter !== 'all') {
      if (technicianFilter === 'unassigned') {
        whereConditions.push('(assigned_technician_id IS NULL OR assigned_technician_id = 0)');
      } else {
        whereConditions.push('assigned_technician_id = ?');
        queryParams.push(technicianFilter);
      }
    }

    if (deviceCategoryFilter && deviceCategoryFilter !== 'all') {
      whereConditions.push('device_category = ?');
      queryParams.push(deviceCategoryFilter);
    }

    const sanitizeDate = (d) => {
      if (!d) return null;
      const match = String(d).match(/^\d{4}-\d{2}-\d{2}/);
      return match ? match[0] : null;
    };
    const sanitizedStartDate = sanitizeDate(startDate);
    const sanitizedEndDate = sanitizeDate(endDate);

    if (sanitizedStartDate) {
      whereConditions.push('DATE(created_at) >= ?');
      queryParams.push(sanitizedStartDate);
    }

    if (sanitizedEndDate) {
      whereConditions.push('DATE(created_at) <= ?');
      queryParams.push(sanitizedEndDate);
    }

    if (whereConditions.length > 0) {
      baseQuery += ' WHERE ' + whereConditions.join(' AND ');
    }

    // Get total count
    const [countResult] = await connection.query(`SELECT COUNT(*) as total${baseQuery}`, queryParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Get paginated data
    const dataQuery = `SELECT *${baseQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const dataParams = [...queryParams, limit, offset];

    const [rows] = await connection.query(dataQuery, dataParams);

    // Map response keys to match CamelCase expectations of React frontend if needed
    // e.g. mapping snake_case db columns to camelCase
    const requests = rows.map(row => ({
      id: row.id,
      ticketNumber: row.ticket_number,
      userId: row.user_id,
      deviceId: row.device_id || null, // Map device ID
      customerName: row.customer_name,
      mobile: row.mobile,
      email: row.email,
      address: row.address,
      city: row.city,
      state: row.state,
      zipCode: row.zip_code,
      deviceCategory: row.device_category,
      brand: row.brand,
      customBrand: row.custom_brand,
      modelNumber: row.model_number,
      serialNumber: row.serial_number,
      deviceConfiguration: row.device_configuration,
      problemType: row.problem_type,
      problemDescription: row.problem_description,
      serviceType: row.service_type,
      priority: row.priority,
      preferredContactMethod: row.preferred_contact_method,
      imagePath: row.image_path,
      screenshotPath: row.screenshot_path,
      status: row.status,
      assignedTechnicianId: row.assigned_technician_id,
      pendingTechnicianId: row.pending_technician_id,
      customerRepairDescription: row.customer_repair_description,
      feedbackRating: row.feedback_rating,
      feedbackComment: row.feedback_comment,
      feedbackDate: row.feedback_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    for (const r of requests) {
      let repeatRows = [];
      if (r.deviceId) {
        const [devRows] = await connection.query(
          'SELECT serial_number FROM company_devices WHERE id = ? LIMIT 1',
          [r.deviceId]
        );
        if (devRows.length > 0 && devRows[0].serial_number) {
          const serial = devRows[0].serial_number;
          const [history] = await connection.query(
            `SELECT sr.id, sr.created_at as createdAt, sr.status, sr.problem_description as problemDescription, u.name as techName 
             FROM service_requests sr
             LEFT JOIN company_devices d ON sr.device_id = d.id
             LEFT JOIN users u ON sr.assigned_technician_id = u.id
             WHERE (d.serial_number = ?) AND sr.id != ?
             ORDER BY sr.created_at DESC`,
            [serial, r.id]
          );
          repeatRows = history;
        }
      }
      // B2C Fallback mapping
      if (repeatRows.length === 0 && r.mobile && r.modelNumber) {
        const [history] = await connection.query(
          `SELECT sr.id, sr.created_at as createdAt, sr.status, sr.problem_description as problemDescription, u.name as techName 
           FROM service_requests sr
           LEFT JOIN users u ON sr.assigned_technician_id = u.id
           WHERE sr.mobile = ? AND sr.model_number = ? AND sr.id != ?
           ORDER BY sr.created_at DESC`,
          [r.mobile, r.modelNumber, r.id]
        );
        repeatRows = history;
      }
      r.repeatCount = repeatRows.length + 1;
      r.repairHistory = repeatRows;
    }

    // Calculate global status counts for tabs
    const [statusCountRows] = await connection.query(`
      SELECT status, COUNT(*) as count 
      FROM service_requests 
      GROUP BY status
    `);
    const statusCounts = {
      all: 0,
      pending: 0,
      in_progress: 0,
      completed: 0,
      delivered: 0,
      cancelled: 0
    };
    statusCountRows.forEach(row => {
      const key = (row.status || '').toLowerCase();
      const count = Number(row.count) || 0;
      if (statusCounts[key] !== undefined) {
        statusCounts[key] = count;
      }
      statusCounts.all += count;
    });

    const responseData = {
      data: requests,
      pagination: {
        total,
        page,
        limit,
        totalPages
      },
      statusCounts
    };

    return res.status(200).json(formatResponse(true, 'Repair requests fetched successfully.', responseData));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Fetch only the tasks assigned to the currently-authenticated technician
 * GET /api/repair-request/my-tasks
 */
const getMyTasks = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const [rows] = await connection.query(
      'SELECT * FROM service_requests WHERE assigned_technician_id = ? OR pending_technician_id = ? ORDER BY created_at DESC',
      [req.user.id, req.user.id]
    );

    const requests = rows.map(row => ({
      id: row.id,
      ticketNumber: row.ticket_number,
      userId: row.user_id,
      customerName: row.customer_name,
      mobile: row.mobile,
      email: row.email,
      address: row.address,
      city: row.city,
      state: row.state,
      zipCode: row.zip_code,
      deviceCategory: row.device_category,
      brand: row.brand,
      customBrand: row.custom_brand,
      modelNumber: row.model_number,
      serialNumber: row.serial_number,
      deviceConfiguration: row.device_configuration,
      problemType: row.problem_type,
      problemDescription: row.problem_description,
      serviceType: row.service_type,
      priority: row.priority,
      preferredContactMethod: row.preferred_contact_method,
      imagePath: row.image_path,
      screenshotPath: row.screenshot_path,
      status: row.status,
      assignedTechnicianId: row.assigned_technician_id,
      pendingTechnicianId: row.pending_technician_id,
      customerRepairDescription: row.customer_repair_description,
      feedbackRating: row.feedback_rating,
      feedbackComment: row.feedback_comment,
      feedbackDate: row.feedback_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return res.status(200).json(formatResponse(true, 'Assigned tasks fetched successfully.', requests));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Fetch repair history for the authenticated customer
 * GET /api/repair-request/history
 */
const getCustomerHistory = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const [metricResult] = await connection.query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as total_completed
       FROM service_requests WHERE user_id = ?`,
      [req.user.id]
    );
    const total = metricResult[0].total || 0;
    const totalCompleted = metricResult[0].total_completed || 0;
    const totalPages = Math.ceil(total / limit);

    const [rows] = await connection.query(
      `SELECT sr.*, t.name as technician_name 
       FROM service_requests sr
       LEFT JOIN users t ON sr.assigned_technician_id = t.id
       WHERE sr.user_id = ? ORDER BY sr.created_at DESC LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    );

    const requests = rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      customerName: row.customer_name,
      mobile: row.mobile,
      email: row.email,
      address: row.address,
      city: row.city,
      state: row.state,
      zipCode: row.zip_code,
      deviceCategory: row.device_category,
      brand: row.brand,
      customBrand: row.custom_brand,
      modelNumber: row.model_number,
      serialNumber: row.serial_number,
      deviceConfiguration: row.device_configuration,
      problemType: row.problem_type,
      problemDescription: row.problem_description,
      serviceType: row.service_type,
      priority: row.priority,
      preferredContactMethod: row.preferred_contact_method,
      imagePath: row.image_path,
      screenshotPath: row.screenshot_path,
      status: row.status,
      assignedTechnicianId: row.assigned_technician_id,
      pendingTechnicianId: row.pending_technician_id,
      technicianName: row.technician_name,
      ticketNumber: row.ticket_number,
      customerRepairDescription: row.customer_repair_description,
      feedbackRating: row.feedback_rating,
      feedbackComment: row.feedback_comment,
      feedbackDate: row.feedback_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    const responseData = {
      data: requests,
      pagination: {
        total,
        totalCompleted, // Exposed to UI
        page,
        limit,
        totalPages
      }
    };

    return res.status(200).json(formatResponse(true, 'Customer repair history fetched successfully.', responseData));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Update the status of a repair request and optionally assign a technician
 */
const updateRequestStatus = async (req, res, next) => {
  const { id } = req.params;
  const { status, assignedTechnicianId } = req.body;
  let connection;

  try {
    connection = await pool.getConnection();

    // Check if the request exists
    const [existing] = await connection.query(
      'SELECT * FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const request = existing[0];

    // Ownership & Decision Restriction: Technicians can only modify decisions/status for their own assigned tasks
    if (req.user && req.user.role === 'technician') {
      if (request.assigned_technician_id !== req.user.id) {
        return res.status(403).json(
          formatResponse(false, "Unauthorized: You cannot modify another technician's decision or ticket status.")
        );
      }
      if (assignedTechnicianId !== undefined && assignedTechnicianId !== null && Number(assignedTechnicianId) !== Number(request.assigned_technician_id)) {
        return res.status(403).json(
          formatResponse(false, 'Unauthorized: Technicians cannot directly reassign tickets. Please use the task transfer workflow.')
        );
      }
    }

    let updateQuery = 'UPDATE service_requests SET status = ?';
    const params = [status];

    // If technician assignment is passed
    if (assignedTechnicianId !== undefined) {
      if (assignedTechnicianId) {
        updateQuery += ', pending_technician_id = ?';
        params.push(assignedTechnicianId);
      } else {
        updateQuery += ', assigned_technician_id = NULL, pending_technician_id = NULL';
      }
    }

    updateQuery += ' WHERE id = ?';
    params.push(id);

    await connection.query(updateQuery, params);

    logger.info(`Repair request ID ${id} status updated to: ${status}${assignedTechnicianId ? ` (Assigned to tech: ${assignedTechnicianId})` : ''}`);

    // Dispatch notification to Pending Technician
    if (assignedTechnicianId) {
      try {
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [assignedTechnicianId, 'Ticket Assignment Unconfirmed', `You have been assigned Ticket ${request.ticket_number || id}. Please Review and Accept.`, id, req.user ? req.user.id : null]
        );
      } catch (e) {
        logger.warn('Failed to dispatch notification to pending tech ' + e.message);
      }
    }

    // Log Activity
    await logActivity(req.user ? req.user.id : null, 'repair', 'update_status', 'service_requests', id, { status, assignedTechnicianId }, req.ip);

    // If cancelled manually by Admin/Technician, notify all admins
    if (status === 'cancelled') {
      try {
        const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin'");
        const notificationTitle = `Repair Request Cancelled [${request.ticket_number || id}]`;
        const cancelReason = req.body.reason || 'Status updated to cancelled';
        const notificationMessage = `User: ${request.customer_name} | Ticket ID: ${request.ticket_number || id} | Device: ${request.brand} ${request.model_number || ''} | Reason: ${cancelReason}`;

        for (const admin of admins) {
          await connection.query(
            'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
            [admin.id, notificationTitle, notificationMessage, id, req.user.id]
          );
        }
      } catch (notifErr) {
        logger.error('Failed to create in-app cancellation notification on status update: ' + notifErr.message);
      }
    }

    // If completed, notify customer to leave feedback
    if (status === 'completed' && request.status !== 'completed' && request.user_id) {
      try {
        const notificationTitle = `Repair Completed [${request.ticket_number || id}]`;
        const notificationMessage = `Your device repair is complete! Please view your History to leave a review of your experience.`;
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [request.user_id, notificationTitle, notificationMessage, id, req.user ? req.user.id : null]
        );
      } catch (notifErr) {
        logger.error('Failed to create in-app completion notification: ' + notifErr.message);
      }
    }

    return res.status(200).json(formatResponse(true, `Repair request status updated to ${status}.`));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Fetch a single repair request by ID
 * GET /api/repair-request/:id
 */
const getRepairRequestById = async (req, res, next) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await pool.getConnection();

    const [rows] = await connection.query('SELECT * FROM service_requests WHERE id = ? LIMIT 1', [id]);

    if (rows.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const row = rows[0];

    // Ownership & Role-based Authorization:
    // - Admin and Technician have access
    // - Customer & Company can only view their own repair request
    if (req.user && (req.user.role === 'customer' || req.user.role === 'company')) {
      if (row.user_id && row.user_id !== req.user.id) {
        return res.status(403).json(formatResponse(false, 'Unauthorized to view this repair request.'));
      }
    }

    const request = {
      id: row.id,
      ticketNumber: row.ticket_number,
      userId: row.user_id,
      deviceId: row.device_id || null,
      customerName: row.customer_name,
      mobile: row.mobile,
      email: row.email,
      address: row.address,
      city: row.city,
      state: row.state,
      zipCode: row.zip_code,
      deviceCategory: row.device_category,
      brand: row.brand,
      customBrand: row.custom_brand,
      modelNumber: row.model_number,
      serialNumber: row.serial_number,
      deviceConfiguration: row.device_configuration,
      problemType: row.problem_type,
      problemDescription: row.problem_description,
      serviceType: row.service_type,
      priority: row.priority,
      preferredContactMethod: row.preferred_contact_method,
      imagePath: row.image_path,
      screenshotPath: row.screenshot_path,
      assignedTechnicianId: row.assigned_technician_id,
      status: row.status,
      customerRepairDescription: row.customer_repair_description,
      feedbackRating: row.feedback_rating,
      feedbackComment: row.feedback_comment,
      feedbackDate: row.feedback_date,
      isRead: row.is_read !== undefined ? row.is_read : 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    return res.status(200).json(formatResponse(true, 'Repair request fetched successfully.', request));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

const deleteRepairRequest = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const { id } = req.params;
    const { reason } = req.body || {};

    // Check if the request exists
    const [existing] = await connection.query(
      'SELECT id, ticket_number, customer_name, status, is_active FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    // Soft-deactivate and set status to cancelled while preserving full history
    await connection.query(
      'UPDATE service_requests SET is_active = FALSE, status = "cancelled", deactivated_at = NOW(), deactivated_by = ?, deactivation_reason = ? WHERE id = ?',
      [req.user ? req.user.id : null, reason || 'Cancelled / deactivated by admin', id]
    );

    logger.info(`Repair request ID ${id} (${existing[0].ticket_number || id}) was deactivated/cancelled by admin.`);

    // Log Activity
    await logActivity(req.user ? req.user.id : null, 'repair', 'deactivate_repair_request', 'service_requests', id, { ticketNumber: existing[0].ticket_number, reason }, req.ip);

    return res.status(200).json(formatResponse(true, 'Repair request cancelled and deactivated successfully.'));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Reactivate a deactivated/cancelled repair request (Admin only)
 * PUT /api/repair-request/:id/reactivate
 */
const reactivateRepairRequest = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const { id } = req.params;

    const [existing] = await connection.query(
      'SELECT id, ticket_number, customer_name, status FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    await connection.query(
      'UPDATE service_requests SET is_active = TRUE, status = "pending", deactivated_at = NULL, deactivated_by = NULL, deactivation_reason = NULL WHERE id = ?',
      [id]
    );

    logger.info(`Repair request ID ${id} was reactivated by admin.`);
    await logActivity(req.user ? req.user.id : null, 'repair', 'reactivate_repair_request', 'service_requests', id, { ticketNumber: existing[0].ticket_number }, req.ip);

    return res.status(200).json(formatResponse(true, 'Repair request reactivated successfully.'));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Public route to track a repair request by ID
 * GET /api/repair-request/track/:id
 */
const trackRequest = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    let { id } = req.params;

    if (id.toUpperCase().startsWith('TD-') && isNaN(parseInt(id.substring(3)))) {
      // It might be a fully valid string, but if they enter TD-24 instead of ID 24 we can test
    }

    const [rows] = await connection.query(
      'SELECT id, ticket_number, customer_name, device_category, brand, model_number, serial_number, device_configuration, problem_type, status, customer_repair_description, created_at, updated_at, image_path, screenshot_path FROM service_requests WHERE id = ? OR ticket_number = ? LIMIT 1',
      [id, id]
    );

    if (rows.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found with that ID.'));
    }

    const row = rows[0];
    const trackingData = {
      id: row.id,
      ticketNumber: row.ticket_number,
      customerName: row.customer_name,
      deviceCategory: row.device_category,
      brand: row.brand,
      modelNumber: row.model_number,
      serialNumber: row.serial_number,
      deviceConfiguration: row.device_configuration,
      problemType: row.problem_type,
      status: row.status,
      customerRepairDescription: row.customer_repair_description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      imagePath: row.image_path,
      screenshotPath: row.screenshot_path
    };

    return res.status(200).json(formatResponse(true, 'Tracking data fetched successfully.', trackingData));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Notify customer that the repair is ready/completed
 * POST /api/repair-request/:id/notify
 */
const notifyCustomer = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const { id } = req.params;

    const [rows] = await connection.query(
      'SELECT id, ticket_number, user_id, customer_name, email, device_category, brand, model_number, status, assigned_technician_id FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const request = rows[0];

    // Ownership & Decision Restriction: Technicians can only notify customers for their own assigned tasks
    if (req.user && req.user.role === 'technician' && request.assigned_technician_id !== req.user.id) {
      return res.status(403).json(
        formatResponse(false, "Unauthorized: You cannot send customer notifications for another technician's ticket.")
      );
    }

    if (request.status !== 'completed') {
      return res.status(400).json(formatResponse(false, 'Notification failed: Status must be completed to send ready notification.'));
    }

    if (!request.email) {
      return res.status(400).json(formatResponse(false, 'Customer did not provide an email address.'));
    }

    // Dispatch email
    const subject = `Your Repair is Ready - TekDoctor [ID: TD-${request.id}]`;
    const html = `
      <h2>Good news, ${request.customer_name}!</h2>
      <p>Your repair for the <strong>${request.brand} ${request.model_number ? request.model_number : ''} (${request.device_category})</strong> has been successfully completed.</p>
      <p>Your device is now fully tested and ready for pickup.</p>
      <p><strong>Job Ticket ID:</strong> ${request.ticket_number || ('TD-' + request.id)}</p>
      <br/>
      <p>Thank you for trusting TekDoctor!</p>
    `;

    const emailSent = await sendCustomerNotification(request.email, subject, html);

    if (emailSent) {
      // Create Database Notification
      if (request.user_id) {
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [request.user_id, 'Repair Ready for Pickup', `Your ${request.brand} device is fully repaired and ready.`, request.id, req.user.id]
        );
      }

      logger.info(`Customer notified for completed repair ID: ${request.id}`);
      return res.status(200).json(formatResponse(true, 'Customer has been successfully notified via email!'));
    } else {
      return res.status(500).json(formatResponse(false, 'Failed to send the email notification.'));
    }

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Update full repair request details (Admin only)
 */
const updateRepairRequest = async (req, res, next) => {
  let connection;
  try {
    const { id } = req.params;
    const {
      customerName, mobile, email, address, city, state, zipCode, deviceCategory, brand,
      modelNumber, serialNumber, deviceConfiguration, problemType, problemDescription, priority
    } = req.body;

    connection = await pool.getConnection();

    // Verify exists
    const [existing] = await connection.query('SELECT id, image_path, screenshot_path FROM service_requests WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Request not found.'));
    }

    let deviceImagePath = existing[0].image_path;
    let screenshotPath = existing[0].screenshot_path;

    if (req.files) {
      if (req.files.deviceImage && req.files.deviceImage[0]) {
        deviceImagePath = `/uploads/repairs/images/${req.files.deviceImage[0].filename}`;
      }
      if (req.files.errorScreenshot && req.files.errorScreenshot[0]) {
        screenshotPath = `/uploads/repairs/screenshots/${req.files.errorScreenshot[0].filename}`;
      }
    }

    await connection.query(`
      UPDATE service_requests SET
        customer_name = ?, mobile = ?, email = ?, address = ?, city = ?, state = ?, zip_code = ?,
        device_category = ?, brand = ?, model_number = ?, 
        serial_number = ?, device_configuration = ?, 
        problem_type = ?, problem_description = ?, priority = ?,
        image_path = ?, screenshot_path = ?
      WHERE id = ?
    `, [
      customerName, mobile, email || null, address || null, city, state || null, zipCode || null,
      deviceCategory, brand, modelNumber || null,
      serialNumber || null, deviceConfiguration || null,
      problemType, problemDescription || null, priority || 'Standard',
      deviceImagePath, screenshotPath,
      id
    ]);

    logger.info(`Repair request ${id} updated by Admin ${req.user.email}`);

    // Log Activity
    await logActivity(req.user ? req.user.id : null, 'repair', 'update_repair_request', 'service_requests', id, { brand, modelNumber, priority }, req.ip);

    return res.status(200).json(formatResponse(true, 'Repair request updated successfully.', { id, imagePath: deviceImagePath, screenshotPath }));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

// GET /api/repair-request/:id/work-logs (Admin / Technician)
const getWorkLogs = async (req, res, next) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.query(
      `SELECT wl.*, u.name as technician_name, u.email as technician_email 
       FROM technician_work_logs wl 
       LEFT JOIN users u ON wl.technician_id = u.id 
       WHERE wl.repair_request_id = ? 
       ORDER BY wl.created_at DESC`,
      [id]
    );
    return res.status(200).json(formatResponse(true, 'Work logs fetched successfully.', rows));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

// POST /api/repair-request/:id/work-logs (Admin / Technician)
const createWorkLog = async (req, res, next) => {
  const { id } = req.params;
  const { repairStage, actionPerformed, partsReplaced, timeSpent, notes } = req.body;
  let connection;
  try {
    if (!repairStage || !actionPerformed) {
      return res.status(400).json(formatResponse(false, 'Repair stage and action performed are required.'));
    }

    connection = await pool.getConnection();

    // Check request exists
    const [request] = await connection.query(
      'SELECT id, ticket_number, assigned_technician_id FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );
    if (request.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    // Ownership & Decision Restriction: Technicians can only add work logs to their own assigned tasks
    if (req.user && req.user.role === 'technician' && request[0].assigned_technician_id !== req.user.id) {
      return res.status(403).json(
        formatResponse(false, "Unauthorized: You cannot add work logs to another technician's ticket.")
      );
    }

    let mediaPath = null;
    if (req.file) {
      mediaPath = `/uploads/${req.file.filename}`;
    }

    await connection.query(
      `INSERT INTO technician_work_logs 
       (repair_request_id, technician_id, repair_stage, action_performed, parts_replaced, time_spent, notes, media_path) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, repairStage, actionPerformed, partsReplaced || null, timeSpent || null, notes || null, mediaPath]
    );

    // Track activity log
    await logActivity(
      req.user.id,
      'technician',
      'create_work_log',
      'service_requests',
      id,
      {
        ticketNumber: request[0].ticket_number,
        repairStage,
        actionPerformed,
        partsReplaced
      },
      req.ip
    );

    return res.status(201).json(formatResponse(true, 'Work log created successfully.'));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

// PUT /api/repair-request/:id/customer-description (Admin / Technician)
const updateCustomerDescription = async (req, res, next) => {
  const { id } = req.params;
  const { customerRepairDescription } = req.body;
  let connection;
  try {
    connection = await pool.getConnection();

    // Verify request existence
    const [request] = await connection.query(
      'SELECT id, ticket_number, assigned_technician_id FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );
    if (request.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    // Ownership & Decision Restriction: Technicians can only modify customer notes for their own assigned tasks
    if (req.user && req.user.role === 'technician' && request[0].assigned_technician_id !== req.user.id) {
      return res.status(403).json(
        formatResponse(false, "Unauthorized: You cannot modify customer notes for another technician's ticket.")
      );
    }

    await connection.query(
      'UPDATE service_requests SET customer_repair_description = ? WHERE id = ?',
      [customerRepairDescription || null, id]
    );

    // Track activity log
    await logActivity(
      req.user.id,
      'technician',
      'update_customer_description',
      'service_requests',
      id,
      { ticketNumber: request[0].ticket_number },
      req.ip
    );

    return res.status(200).json(formatResponse(true, 'Customer repair description updated successfully.'));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

// POST /api/repair-request/:id/milestones (Admin / Technician)
const sendMilestoneNotification = async (req, res, next) => {
  const { id } = req.params;
  const { milestone, notes } = req.body;
  let connection;
  try {
    if (!milestone) {
      return res.status(400).json(formatResponse(false, 'Milestone is required.'));
    }

    connection = await pool.getConnection();

    // Fetch request
    const [request] = await connection.query(
      'SELECT id, ticket_number, user_id, customer_name, email, device_category, brand, model_number, assigned_technician_id FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );

    if (request.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const reqData = request[0];

    // Ownership & Decision Restriction: Technicians can only send milestone notifications for their own assigned tasks
    if (req.user && req.user.role === 'technician' && reqData.assigned_technician_id !== req.user.id) {
      return res.status(403).json(
        formatResponse(false, "Unauthorized: You cannot send milestone updates for another technician's ticket.")
      );
    }

    let milestoneTitle = '';
    let milestoneMsg = '';
    let emailSubject = '';
    let emailBody = '';

    const deviceName = `${reqData.brand} ${reqData.model_number || ''} (${reqData.device_category})`;

    switch (milestone) {
      case 'diagnosis_completed':
        milestoneTitle = 'Diagnosis Completed';
        milestoneMsg = `The technician has completed the diagnosis for your device: ${deviceName}.`;
        emailSubject = `Diagnosis Completed for Repair Ticket #${reqData.ticket_number || reqData.id}`;
        emailBody = `
          <h2>Diagnosis Completed</h2>
          <p>Hi ${reqData.customer_name},</p>
          <p>Our technician has completed the diagnosis of your <strong>${deviceName}</strong>.</p>
          ${notes ? `<p><strong>Diagnosis Details:</strong><br/>${notes}</p>` : ''}
          <p>We will keep you updated on the repair progress.</p>
          <br/>
          <p>Thank you for choosing TekDoctor!</p>
        `;
        break;
      case 'repair_started':
        milestoneTitle = 'Repair Started';
        milestoneMsg = `Repair work has started on your device: ${deviceName}.`;
        emailSubject = `Repair Started for Repair Ticket #${reqData.ticket_number || reqData.id}`;
        emailBody = `
          <h2>Repair Work Started</h2>
          <p>Hi ${reqData.customer_name},</p>
          <p>The repair process has officially started for your <strong>${deviceName}</strong>.</p>
          ${notes ? `<p><strong>Tech Notes:</strong><br/>${notes}</p>` : ''}
          <br/>
          <p>Thank you for choosing TekDoctor!</p>
        `;
        break;
      case 'parts_required':
        milestoneTitle = 'Additional Parts Required';
        milestoneMsg = `Additional parts are required to complete the repair of your device: ${deviceName}.`;
        emailSubject = `Action Needed: Parts Required for Ticket #${reqData.ticket_number || reqData.id}`;
        emailBody = `
          <h2>Additional Parts Required</h2>
          <p>Hi ${reqData.customer_name},</p>
          <p>Our technician has informed us that additional parts are needed to repair your <strong>${deviceName}</strong>.</p>
          ${notes ? `<p><strong>Details of parts required:</strong><br/>${notes}</p>` : '<p>We are sourcing the required parts and will update you shortly.</p>'}
          <br/>
          <p>Thank you for choosing TekDoctor!</p>
        `;
        break;
      case 'repair_completed':
        milestoneTitle = 'Repair Completed';
        milestoneMsg = `The repair of your device ${deviceName} has been successfully completed.`;
        emailSubject = `Repair Completed for Ticket #${reqData.ticket_number || reqData.id}`;
        emailBody = `
          <h2>Repair Completed</h2>
          <p>Hi ${reqData.customer_name},</p>
          <p>Great news! The repair work is complete for your <strong>${deviceName}</strong>.</p>
          ${notes ? `<p><strong>Summary:</strong><br/>${notes}</p>` : ''}
          <p>Our team is conducting final checks before packaging/pick-up.</p>
          <br/>
          <p>Thank you for choosing TekDoctor!</p>
        `;
        break;
      case 'ready_for_pickup':
        milestoneTitle = 'Device Ready for Pickup';
        milestoneMsg = `Your device ${deviceName} is fully ready for pickup at our service center.`;
        emailSubject = `Your Device is Ready for Pickup - Ticket #${reqData.ticket_number || reqData.id}`;
        emailBody = `
          <h2>Device Ready for Pickup!</h2>
          <p>Hi ${reqData.customer_name},</p>
          <p>Your <strong>${deviceName}</strong> is ready for pickup at our center.</p>
          <p><strong>Job Ticket ID:</strong> ${reqData.ticket_number || ('TD-' + reqData.id)}</p>
          ${notes ? `<p><strong>Collection Notes:</strong><br/>${notes}</p>` : ''}
          <br/>
          <p>Thank you for choosing TekDoctor!</p>
        `;
        break;
      default:
        return res.status(400).json(formatResponse(false, `Invalid milestone value: ${milestone}`));
    }

    // 1. Create In-App Notification (database)
    if (reqData.user_id) {
      await connection.query(
        'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
        [reqData.user_id, milestoneTitle, milestoneMsg, id, req.user.id]
      );
    }

    // 2. Dispatch email if email exists
    let emailSent = false;
    if (reqData.email) {
      emailSent = await sendCustomerNotification(reqData.email, emailSubject, emailBody);
    }

    // 3. Log milestone activity
    await logActivity(
      req.user.id,
      'technician',
      'milestone_notification',
      'service_requests',
      id,
      {
        ticketNumber: reqData.ticket_number,
        milestone,
        milestoneTitle,
        emailSent
      },
      req.ip
    );

    return res.status(200).json(
      formatResponse(true, `Milestone notification '${milestoneTitle}' processed successfully.`, { emailSent })
    );
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Cancel a repair request (User / Company)
 */
const cancelRepairRequest = async (req, res, next) => {
  let connection;
  try {
    const { id } = req.params;
    const { reason } = req.body;
    connection = await pool.getConnection();

    const [rows] = await connection.query('SELECT * FROM service_requests WHERE id = ? LIMIT 1', [id]);

    if (rows.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const request = rows[0];

    // Verify ownership
    if (req.user.role !== 'admin' && request.user_id !== req.user.id) {
      return res.status(403).json(formatResponse(false, 'Unauthorized to cancel this request.'));
    }

    if (request.status !== 'pending' && request.status !== 'submitted') {
      return res.status(400).json(formatResponse(false, 'Repair request cannot be cancelled at this stage.'));
    }

    await connection.query("UPDATE service_requests SET status = 'cancelled' WHERE id = ?", [id]);

    // Log Activity
    await logActivity(req.user.id, 'repair', 'cancel_repair_request', 'service_requests', id, { reason }, req.ip);

    logger.info(`Request ${id} was cancelled by ${req.user.role} (${req.user.email}). Reason: ${reason || 'N/A'}`);

    // Send email notification
    const subject = `Repair Request Cancelled [ID: ${request.ticket_number || id}]`;
    const message = `<p>Repair request for <strong>${request.brand} ${request.model_number || ''}</strong> has been cancelled.</p><p><strong>Client:</strong> ${request.customer_name}</p><p><strong>Reason:</strong> ${reason || 'Not provided'}</p>`;
    sendAdminNotification(subject, message).catch(e => logger.error('Failed to send cancellation email to Admin.'));

    // Create in-app notification for all admins
    try {
      const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin'");
      const notificationTitle = `Repair Request Cancelled [${request.ticket_number || id}]`;
      const notificationMessage = `User: ${request.customer_name} | Ticket ID: ${request.ticket_number || id} | Device: ${request.brand} ${request.model_number || ''} | Reason: ${reason || 'Not provided'}`;

      for (const admin of admins) {
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [admin.id, notificationTitle, notificationMessage, id, req.user.id]
        );
      }
    } catch (notifErr) {
      logger.error('Failed to create in-app cancellation notification for admins: ' + notifErr.message);
    }

    return res.status(200).json(formatResponse(true, 'Repair request cancelled successfully.', { id, status: 'cancelled' }));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

// ==========================================
// FORM DRAFT ENDPOINTS
// ==========================================

const saveRepairDraft = async (req, res, next) => {
  let connection;
  try {
    const { draftId } = req.params;
    const formData = req.body;

    if (!draftId || !formData) {
      return res.status(400).json(formatResponse(false, 'draftId and formData are required.'));
    }

    connection = await pool.getConnection();

    const query = `
      INSERT INTO repair_form_drafts (draft_id, form_data)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE form_data = VALUES(form_data), updated_at = CURRENT_TIMESTAMP
    `;
    await connection.query(query, [draftId, JSON.stringify(formData)]);

    return res.status(200).json(formatResponse(true, 'Draft saved successfully.'));
  } catch (error) {
    logger.error('Error saving repair draft:', error);
    return res.status(500).json(formatResponse(false, 'Failed to save draft.'));
  } finally {
    if (connection) connection.release();
  }
};

const getRepairDraft = async (req, res, next) => {
  let connection;
  try {
    const { draftId } = req.params;

    if (!draftId) {
      return res.status(400).json(formatResponse(false, 'draftId is required.'));
    }
    connection = await pool.getConnection();

    const [rows] = await connection.query('SELECT form_data FROM repair_form_drafts WHERE draft_id = ?', [draftId]);

    if (rows.length === 0) {
      return res.status(404).json(formatResponse(false, 'Draft not found.'));
    }

    // Since form_data is a JSON field in MySQL, mysql2 might parse it automatically 
    // or return it as string depending on config. Let's handle both.
    let parsedData = rows[0].form_data;
    if (typeof parsedData === 'string') {
      try {
        parsedData = JSON.parse(parsedData);
      } catch (e) { }
    }

    return res.status(200).json(formatResponse(true, 'Draft loaded.', parsedData));
  } catch (error) {
    logger.error('Error loading repair draft:', error);
    return res.status(500).json(formatResponse(false, 'Failed to load draft.'));
  } finally {
    if (connection) connection.release();
  }
};

const acceptAssignment = async (req, res, next) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await pool.getConnection();

    const [rows] = await connection.query('SELECT pending_technician_id, assigned_technician_id, ticket_number, customer_name FROM service_requests WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json(formatResponse(false, 'Request not found.'));

    if (rows[0].pending_technician_id !== req.user.id) {
      return res.status(403).json(formatResponse(false, 'You do not have permission to accept this assignment.'));
    }

    // Update pending transfer history record
    await connection.query(
      "UPDATE task_transfers SET status = 'accepted', responded_at = CURRENT_TIMESTAMP WHERE repair_request_id = ? AND to_technician_id = ? AND status = 'pending'",
      [id, req.user.id]
    );

    await connection.query(
      'UPDATE service_requests SET assigned_technician_id = pending_technician_id, pending_technician_id = NULL WHERE id = ?',
      [id]
    );

    await logActivity(req.user.id, 'repair', 'accept_assignment', 'service_requests', id, {}, req.ip);

    // Notify Admin
    try {
      const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin'");
      for (const admin of admins) {
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [admin.id, 'Ticket Assignment Accepted', `Technician accepted assignment for Ticket ${rows[0].ticket_number || id}.`, id, req.user.id]
        );
      }
      if (rows[0].assigned_technician_id && rows[0].assigned_technician_id !== req.user.id) {
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [rows[0].assigned_technician_id, 'Transfer Accepted', `Your transfer request for Ticket ${rows[0].ticket_number || id} was accepted by the receiving technician.`, id, req.user.id]
        );
      }
    } catch (e) { }

    return res.status(200).json(formatResponse(true, 'Assignment Accepted'));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

const rejectAssignment = async (req, res, next) => {
  let connection;
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    connection = await pool.getConnection();

    const [rows] = await connection.query('SELECT pending_technician_id, assigned_technician_id, ticket_number FROM service_requests WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json(formatResponse(false, 'Request not found.'));

    if (rows[0].pending_technician_id !== req.user.id) {
      return res.status(403).json(formatResponse(false, 'You do not have permission to reject this assignment.'));
    }

    // Update pending transfer history record
    await connection.query(
      "UPDATE task_transfers SET status = 'rejected', response_notes = ?, responded_at = CURRENT_TIMESTAMP WHERE repair_request_id = ? AND to_technician_id = ? AND status = 'pending'",
      [reason || null, id, req.user.id]
    );

    await connection.query(
      'UPDATE service_requests SET pending_technician_id = NULL WHERE id = ?',
      [id]
    );

    await logActivity(req.user.id, 'repair', 'reject_assignment', 'service_requests', id, { reason }, req.ip);

    // Notify the original tech if they transferred it, and notify admins
    try {
      const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin'");
      for (const admin of admins) {
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [admin.id, 'Ticket Assignment Rejected', `Technician rejected assignment for Ticket ${rows[0].ticket_number || id}.${reason ? ` Reason: ${reason}` : ''}`, id, req.user.id]
        );
      }
      if (rows[0].assigned_technician_id) {
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [rows[0].assigned_technician_id, 'Transfer Rejected', `Your transfer request for Ticket ${rows[0].ticket_number || id} was rejected.${reason ? ` Reason: ${reason}` : ''}`, id, req.user.id]
        );
      }
    } catch (e) { }

    return res.status(200).json(formatResponse(true, 'Assignment Rejected'));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

const transferTicket = async (req, res, next) => {
  let connection;
  try {
    const { id } = req.params;
    const { targetTechnicianId, reason } = req.body;
    connection = await pool.getConnection();

    const [rows] = await connection.query('SELECT assigned_technician_id, ticket_number, status FROM service_requests WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json(formatResponse(false, 'Request not found.'));

    if (['completed', 'cancelled'].includes(rows[0].status)) {
      return res.status(400).json(formatResponse(false, 'Cannot transfer a completed or cancelled ticket.'));
    }

    if (req.user.role === 'technician' && rows[0].assigned_technician_id !== req.user.id) {
      return res.status(403).json(formatResponse(false, 'You can only transfer your own tasks.'));
    }

    if (Number(targetTechnicianId) === Number(rows[0].assigned_technician_id)) {
      return res.status(400).json(formatResponse(false, 'Cannot transfer ticket to the currently assigned technician.'));
    }

    // Cancel any previous pending transfer record for this ticket
    await connection.query(
      "UPDATE task_transfers SET status = 'cancelled' WHERE repair_request_id = ? AND status = 'pending'",
      [id]
    );

    // Insert new task transfer history row
    await connection.query(
      `INSERT INTO task_transfers 
       (repair_request_id, from_technician_id, to_technician_id, initiated_by_user_id, reason, status, transferred_at) 
       VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
      [id, rows[0].assigned_technician_id || null, targetTechnicianId, req.user.id, reason || null]
    );

    await connection.query(
      'UPDATE service_requests SET pending_technician_id = ? WHERE id = ?',
      [targetTechnicianId, id]
    );

    await logActivity(req.user.id, 'repair', 'transfer_ticket', 'service_requests', id, { targetTechnicianId, reason }, req.ip);

    try {
      await connection.query(
        'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
        [targetTechnicianId, 'Ticket Transfer Request', `Ticket ${rows[0].ticket_number || id} has been requested for transfer to you. Reason: ${reason || 'None'}`, id, req.user.id]
      );
    } catch (e) { }

    return res.status(200).json(formatResponse(true, 'Transfer Initiated'));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

const getTicketTransfers = async (req, res, next) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await pool.getConnection();

    const [tickets] = await connection.query('SELECT id, assigned_technician_id, pending_technician_id, user_id FROM service_requests WHERE id = ?', [id]);
    if (tickets.length === 0) return res.status(404).json(formatResponse(false, 'Ticket not found.'));

    if (req.user.role === 'technician') {
      const isAssigned = tickets[0].assigned_technician_id === req.user.id || tickets[0].pending_technician_id === req.user.id;
      if (!isAssigned) {
        const [transfersCount] = await connection.query(
          'SELECT id FROM task_transfers WHERE repair_request_id = ? AND (from_technician_id = ? OR to_technician_id = ?) LIMIT 1',
          [id, req.user.id, req.user.id]
        );
        if (transfersCount.length === 0) {
          return res.status(403).json(formatResponse(false, 'You do not have permission to view this transfer history.'));
        }
      }
    }

    const query = `
      SELECT 
        tt.id,
        tt.repair_request_id AS repairRequestId,
        tt.from_technician_id AS fromTechnicianId,
        tt.to_technician_id AS toTechnicianId,
        tt.initiated_by_user_id AS initiatedByUserId,
        tt.reason,
        tt.status AS transferStatus,
        tt.response_notes AS responseNotes,
        tt.transferred_at AS transferredAt,
        tt.responded_at AS respondedAt,
        from_u.name AS fromTechnicianName,
        from_u.email AS fromTechnicianEmail,
        to_u.name AS toTechnicianName,
        to_u.email AS toTechnicianEmail,
        init_u.name AS initiatedByName,
        init_u.role AS initiatedByRole,
        sr.ticket_number AS ticketNumber,
        sr.customer_name AS customerName,
        sr.device_category AS deviceCategory,
        sr.brand,
        sr.model_number AS modelNumber,
        sr.status AS currentTicketStatus
      FROM task_transfers tt
      LEFT JOIN users from_u ON tt.from_technician_id = from_u.id
      LEFT JOIN users to_u ON tt.to_technician_id = to_u.id
      LEFT JOIN users init_u ON tt.initiated_by_user_id = init_u.id
      LEFT JOIN service_requests sr ON tt.repair_request_id = sr.id
      WHERE tt.repair_request_id = ?
      ORDER BY tt.transferred_at ASC
    `;

    const [rows] = await connection.query(query, [id]);
    return res.status(200).json(formatResponse(true, 'Transfer history retrieved successfully.', rows));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

const getMyTransferHistory = async (req, res, next) => {
  let connection;
  try {
    const techId = req.user.id;
    const { type = 'all', status = 'all', search = '', page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const numLimit = parseInt(limit, 10);

    connection = await pool.getConnection();

    let whereClause = 'WHERE (tt.to_technician_id = ? OR tt.from_technician_id = ?)';
    const params = [techId, techId];

    if (type === 'incoming') {
      whereClause = 'WHERE tt.to_technician_id = ?';
      params.splice(0, 2, techId);
    } else if (type === 'outgoing') {
      whereClause = 'WHERE tt.from_technician_id = ?';
      params.splice(0, 2, techId);
    }

    if (status && status !== 'all') {
      whereClause += ' AND tt.status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      whereClause += ' AND (sr.ticket_number LIKE ? OR sr.customer_name LIKE ? OR sr.brand LIKE ? OR sr.model_number LIKE ? OR from_u.name LIKE ? OR to_u.name LIKE ? OR tt.reason LIKE ?)';
      params.push(q, q, q, q, q, q, q);
    }

    // Get Total Count
    const [countRows] = await connection.query(
      `SELECT COUNT(*) as total 
       FROM task_transfers tt
       LEFT JOIN users from_u ON tt.from_technician_id = from_u.id
       LEFT JOIN users to_u ON tt.to_technician_id = to_u.id
       LEFT JOIN service_requests sr ON tt.repair_request_id = sr.id
       ${whereClause}`,
      params
    );
    const totalRecords = countRows[0].total;

    // Get Summary Counts for Technician
    const [statRows] = await connection.query(`
      SELECT 
        COUNT(*) as totalCount,
        SUM(CASE WHEN to_technician_id = ? THEN 1 ELSE 0 END) as incomingCount,
        SUM(CASE WHEN from_technician_id = ? THEN 1 ELSE 0 END) as outgoingCount,
        SUM(CASE WHEN to_technician_id = ? AND status = 'pending' THEN 1 ELSE 0 END) as pendingCount,
        SUM(CASE WHEN (to_technician_id = ? OR from_technician_id = ?) AND status = 'accepted' THEN 1 ELSE 0 END) as acceptedCount,
        SUM(CASE WHEN (to_technician_id = ? OR from_technician_id = ?) AND status = 'rejected' THEN 1 ELSE 0 END) as rejectedCount
      FROM task_transfers
      WHERE to_technician_id = ? OR from_technician_id = ?
    `, [techId, techId, techId, techId, techId, techId, techId, techId, techId]);

    const stats = {
      total: statRows[0]?.totalCount || 0,
      incomingCount: statRows[0]?.incomingCount || 0,
      outgoingCount: statRows[0]?.outgoingCount || 0,
      pendingCount: statRows[0]?.pendingCount || 0,
      acceptedCount: statRows[0]?.acceptedCount || 0,
      rejectedCount: statRows[0]?.rejectedCount || 0
    };

    // Get Data
    const dataQuery = `
      SELECT 
        tt.id,
        tt.repair_request_id AS repairRequestId,
        tt.from_technician_id AS fromTechnicianId,
        tt.to_technician_id AS toTechnicianId,
        tt.initiated_by_user_id AS initiatedByUserId,
        tt.reason,
        tt.status AS transferStatus,
        tt.response_notes AS responseNotes,
        tt.transferred_at AS transferredAt,
        tt.responded_at AS respondedAt,
        CASE WHEN tt.to_technician_id = ? THEN 'incoming' ELSE 'outgoing' END AS direction,
        from_u.name AS fromTechnicianName,
        from_u.email AS fromTechnicianEmail,
        to_u.name AS toTechnicianName,
        to_u.email AS toTechnicianEmail,
        init_u.name AS initiatedByName,
        init_u.role AS initiatedByRole,
        sr.ticket_number AS ticketNumber,
        sr.customer_name AS customerName,
        sr.device_category AS deviceCategory,
        sr.brand,
        sr.model_number AS modelNumber,
        sr.status AS currentTicketStatus,
        sr.priority AS ticketPriority
      FROM task_transfers tt
      LEFT JOIN users from_u ON tt.from_technician_id = from_u.id
      LEFT JOIN users to_u ON tt.to_technician_id = to_u.id
      LEFT JOIN users init_u ON tt.initiated_by_user_id = init_u.id
      LEFT JOIN service_requests sr ON tt.repair_request_id = sr.id
      ${whereClause}
      ORDER BY tt.transferred_at DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [techId, ...params, numLimit, offset];
    const [rows] = await connection.query(dataQuery, dataParams);

    return res.status(200).json(formatResponse(true, 'My task transfers retrieved.', {
      transfers: rows,
      pagination: {
        page: Math.max(1, parseInt(page, 10)),
        limit: numLimit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / numLimit) || 1
      },
      stats
    }));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

const submitFeedback = async (req, res, next) => {
  const { id } = req.params;
  const { rating, comment } = req.body;
  let connection;

  try {
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json(formatResponse(false, 'Valid rating (1-5) is required.'));
    }

    connection = await pool.getConnection();

    const [existing] = await connection.query(
      'SELECT status, feedback_rating, user_id FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const request = existing[0];

    if (request.status !== 'completed') {
      return res.status(400).json(formatResponse(false, 'Feedback can only be submitted for completed requests.'));
    }

    if (request.feedback_rating !== null) {
      return res.status(400).json(formatResponse(false, 'Feedback has already been submitted for this request.'));
    }

    if (req.user.role === 'customer' || req.user.role === 'company') {
      if (request.user_id !== req.user.id) {
        return res.status(403).json(formatResponse(false, 'You are not authorized to submit feedback for this request.'));
      }
    } else {
      return res.status(403).json(formatResponse(false, 'Only customers can submit service feedback.'));
    }

    await connection.query(
      'UPDATE service_requests SET feedback_rating = ?, feedback_comment = ?, feedback_date = CURRENT_TIMESTAMP WHERE id = ?',
      [rating, comment || null, id]
    );

    await logActivity(req.user.id, 'repair', 'submit_feedback', 'service_requests', id, { rating, comment }, req.ip);

    try {
      const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin'");
      const notificationTitle = `New Service Feedback [Ticket ${id}]`;
      const notificationMessage = `A customer submitted a ${rating}-star review for their repair.`;

      for (const admin of admins) {
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [admin.id, notificationTitle, notificationMessage, id, req.user.id]
        );
      }
    } catch (notifErr) { }

    return res.status(200).json(formatResponse(true, 'Feedback submitted successfully.'));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  createRepairRequest,
  getRepairRequests,
  getMyTasks,
  updateRequestStatus,
  deleteRepairRequest,
  reactivateRepairRequest,
  getCustomerHistory,
  trackRequest,
  notifyCustomer,
  updateRepairRequest,
  getWorkLogs,
  createWorkLog,
  updateCustomerDescription,
  sendMilestoneNotification,
  getRepairRequestById,
  cancelRepairRequest,
  saveRepairDraft,
  getRepairDraft,
  acceptAssignment,
  rejectAssignment,
  transferTicket,
  getTicketTransfers,
  getMyTransferHistory,
  submitFeedback
};
