const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const config = require('../config/app.config');
const { pool } = require('../config/db.config');
const { formatResponse, generateTicketNumber, generateInvoiceId } = require('../utils/helpers');
const logger = require('../utils/logger');
const { sendAdminNotification, sendCustomerNotification } = require('../utils/email.utils');
const { logActivity } = require('../utils/activity.logger');
const { generateToken, generateEstimateActionToken, verifyEstimateAuthorization, canTechnicianAccessTicket } = require('../utils/auth.helpers');

const getFrontendBaseUrl = (req) => {
  if (config.frontend && config.frontend.url) {
    return config.frontend.url.replace(/\/+$/, '');
  }
  if (process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim()) {
    return process.env.FRONTEND_URL.trim().replace(/\/+$/, '');
  }
  const origin = req.get('origin');
  if (origin && origin !== 'null' && !origin.includes(`localhost:${config.server?.port || 5000}`)) {
    return origin.replace(/\/+$/, '');
  }
  const referer = req.get('referer');
  if (referer) {
    try {
      const parsed = new URL(referer);
      if (!parsed.host.includes(`localhost:${config.server?.port || 5000}`)) {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch (_) {}
  }
  return config.frontend?.url || config.server?.publicOrigin || '';
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
      customDeviceCategory,
      brand,
      customBrand,
      modelNumber,
      serialNumber,
      deviceConfiguration,
      problemType,
      customProblemType,
      problemDescription,
      serviceType,
      customServiceType,
      priority,
      preferredContactMethod,
      address,
      state,
      zipCode,
      deviceId,
      employeeId,
      companyId,
      clientSubmissionId
    } = req.body;

    let userId = req.user ? req.user.id : null;
    let autoLoginData = null;

    let contactMethodStr = 'WhatsApp';
    if (Array.isArray(preferredContactMethod)) {
      contactMethodStr = preferredContactMethod.filter(Boolean).join(', ') || 'WhatsApp';
    } else if (typeof preferredContactMethod === 'string' && preferredContactMethod.trim()) {
      contactMethodStr = preferredContactMethod.trim();
    }

    // Resolve company identifiers if submitted by a corporate client or referencing a device
    let targetCompanyId = null;
    if (req.user && req.user.role === 'company') {
      targetCompanyId = req.user.id;
    } else if (companyId) {
      targetCompanyId = Number(companyId);
    }

    let targetDeviceId = deviceId ? Number(deviceId) : null;
    let targetEmployeeId = employeeId ? Number(employeeId) : null;

    let resolvedBrand = brand;
    let resolvedModelNumber = modelNumber;
    let resolvedSerialNumber = serialNumber;
    let resolvedDeviceCategory = deviceCategory;
    let resolvedDeviceConfig = deviceConfiguration;

    if (targetDeviceId) {
      const [devRows] = await connection.query(
        'SELECT id, company_id, employee_id, brand, model_number, serial_number, device_category, notes, is_active, status FROM company_devices WHERE id = ?',
        [targetDeviceId]
      );
      if (devRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'The specified company device was not found.'
        });
      }

      const d = devRows[0];

      // Company isolation: if authenticated as company or companyId resolved, device must belong to this company
      if ((req.user && req.user.role === 'company' && d.company_id !== req.user.id) || (targetCompanyId && d.company_id !== targetCompanyId)) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to create a repair request for this device.'
        });
      }

      // Check if device is deactivated / inactive / decommissioned
      const isDeactivated = d.is_active === 0 || d.is_active === false || d.status === 'decommissioned' || d.status === 'inactive' || d.status === 'retired' || d.status === 'disposed';
      if (isDeactivated) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: 'This device is inactive/deactivated and cannot be used to create a new repair ticket.'
        });
      }

      if (!targetCompanyId) targetCompanyId = d.company_id;
      if (!targetEmployeeId && d.employee_id) targetEmployeeId = d.employee_id;
      if (!resolvedBrand) resolvedBrand = d.brand;
      if (!resolvedModelNumber) resolvedModelNumber = d.model_number;
      if (!resolvedSerialNumber) resolvedSerialNumber = d.serial_number;
      if (!resolvedDeviceCategory) resolvedDeviceCategory = d.device_category;
      if (!resolvedDeviceConfig && d.notes) {
        resolvedDeviceConfig = d.notes;
      }
    } else if (targetCompanyId && resolvedSerialNumber) {
      // If company ticket submitted with serial number without deviceId, resolve and enforce status
      const [matchedDevs] = await connection.query(
        'SELECT id, company_id, employee_id, brand, model_number, serial_number, device_category, notes, is_active, status FROM company_devices WHERE serial_number = ? LIMIT 1',
        [resolvedSerialNumber.trim()]
      );
      if (matchedDevs.length > 0) {
        const d = matchedDevs[0];
        if (d.company_id !== targetCompanyId) {
          await connection.rollback();
          return res.status(403).json({
            success: false,
            message: 'You are not authorized to create a repair request for this device.'
          });
        }
        const isDeactivated = d.is_active === 0 || d.is_active === false || d.status === 'decommissioned' || d.status === 'inactive' || d.status === 'retired' || d.status === 'disposed';
        if (isDeactivated) {
          await connection.rollback();
          return res.status(403).json({
            success: false,
            message: 'This device is inactive/deactivated and cannot be used to create a new repair ticket.'
          });
        }
        targetDeviceId = d.id;
        if (!targetEmployeeId && d.employee_id) targetEmployeeId = d.employee_id;
        if (!resolvedBrand) resolvedBrand = d.brand;
        if (!resolvedModelNumber) resolvedModelNumber = d.model_number;
        if (!resolvedDeviceCategory) resolvedDeviceCategory = d.device_category;
        if (!resolvedDeviceConfig && d.notes) {
          resolvedDeviceConfig = d.notes;
        }
      }
    }

    // Guest flow: User is not authenticated but provided an email
    if (!userId && email) {
      const cleanEmail = email.trim().toLowerCase();
      const cleanMobile = mobile ? mobile.trim() : null;

      // Check if user already exists by email
      const [existingUsers] = await connection.query(
        'SELECT id, name, email, phone, role, token_version FROM users WHERE LOWER(email) = ? LIMIT 1',
        [cleanEmail]
      );

      let matchedUser = existingUsers.length > 0 ? existingUsers[0] : null;

      // If not matched by email but mobile provided, check if user exists by phone
      if (!matchedUser && cleanMobile) {
        const [phoneUsers] = await connection.query(
          'SELECT id, name, email, phone, role, token_version FROM users WHERE phone = ? LIMIT 1',
          [cleanMobile]
        );
        if (phoneUsers.length > 0) {
          matchedUser = phoneUsers[0];
        }
      }

      if (matchedUser) {
        // Securely resolve ownership
        userId = matchedUser.id;

        // If user is a customer, verify ownership and establish authenticated session
        if (matchedUser.role === 'customer') {
          // If customer has no phone on record yet, attach cleanMobile
          if (!matchedUser.phone && cleanMobile) {
            await connection.query(
              'UPDATE users SET phone = ? WHERE id = ? AND (phone IS NULL OR phone = "")',
              [cleanMobile, matchedUser.id]
            );
            matchedUser.phone = cleanMobile;
          }

          const customerToken = generateToken({
            id: matchedUser.id,
            name: matchedUser.name,
            email: matchedUser.email,
            role: 'customer',
            token_version: matchedUser.token_version || 1
          });

          autoLoginData = {
            token: customerToken,
            user: {
              id: matchedUser.id,
              name: matchedUser.name,
              email: matchedUser.email,
              role: 'customer'
            },
            isExistingCustomer: true
          };

          logger.info(`Existing customer verified & linked: ${matchedUser.email} (ID: ${userId})`);
        } else {
          // For non-customer accounts (admin, technician, company), never auto-login from guest form
          logger.info(`Guest repair associated with existing non-customer user ID ${userId} (${matchedUser.role}) without auto-login session.`);
        }
      } else {
        // Auto-create new customer account with secure random bcrypt hash
        const randomSecret = uuidv4() + uuidv4();
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(randomSecret, salt);

        let newUserId;
        try {
          const [userResult] = await connection.query(
            'INSERT INTO users (name, email, phone, password, role, token_version) VALUES (?, ?, ?, ?, "customer", 1)',
            [customerName, cleanEmail, cleanMobile, hashedPassword]
          );
          newUserId = userResult.insertId;
        } catch (insertErr) {
          // Concurrency safety against rapid double submit race conditions
          if (insertErr.code === 'ER_DUP_ENTRY') {
            const [dupUsers] = await connection.query('SELECT id, name, email, role, token_version FROM users WHERE LOWER(email) = ? LIMIT 1', [cleanEmail]);
            if (dupUsers.length > 0) {
              newUserId = dupUsers[0].id;
            } else {
              throw insertErr;
            }
          } else {
            throw insertErr;
          }
        }

        userId = newUserId;
        const newUser = { id: userId, name: customerName, email: cleanEmail, role: 'customer', token_version: 1 };
        const sessionToken = generateToken(newUser);

        // Generate secure, short-lived (24h) set-password token bound to user and token_version
        const setPasswordToken = jwt.sign(
          {
            id: userId,
            email: cleanEmail,
            type: 'set_password',
            token_version: 1
          },
          config.jwt.secret,
          { expiresIn: '24h' }
        );

        autoLoginData = {
          token: sessionToken,
          user: newUser,
          setPasswordToken,
          isNewCustomer: true
        };

        logger.info(`New customer account auto-created: ${cleanEmail} (ID: ${userId})`);
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

    // 1. Check idempotency token (clientSubmissionId) if provided
    const submissionKey = (clientSubmissionId || req.headers['x-submission-id'] || '').trim();
    if (submissionKey) {
      const [existingSub] = await connection.query(
        'SELECT id, ticket_number, status, customer_name FROM service_requests WHERE submission_id = ? LIMIT 1',
        [submissionKey]
      );
      if (existingSub.length > 0) {
        logger.info(`Duplicate repair submission prevented via submission_id [${submissionKey}]. Existing ticket: ${existingSub[0].ticket_number}`);
        await connection.rollback();
        return res.status(200).json({
          success: true,
          isDuplicate: true,
          message: `You have already submitted this repair request. Ticket ID: ${existingSub[0].ticket_number}`,
          ticketNumber: existingSub[0].ticket_number,
          isNewCustomer: Boolean(autoLoginData?.isNewCustomer),
          isExistingCustomer: Boolean(autoLoginData?.isExistingCustomer),
          autoLogin: autoLoginData ? { token: autoLoginData.token, user: autoLoginData.user } : null,
          data: {
            id: existingSub[0].id,
            ticketNumber: existingSub[0].ticket_number,
            status: existingSub[0].status,
            alreadySubmitted: true
          }
        });
      }
    }

    // 2. Content fingerprint & 60-second window duplicate check
    const cleanDesc = (problemDescription || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanMobile = (mobile || '').trim();
    const [recentSub] = await connection.query(
      `SELECT id, ticket_number, status FROM service_requests 
       WHERE (user_id = ? OR (email = ? AND mobile = ?)) 
         AND problem_type = ? AND problem_description = ? 
         AND created_at >= NOW() - INTERVAL 60 SECOND 
       ORDER BY id DESC LIMIT 1`,
      [userId || -1, cleanEmail, cleanMobile, problemType, cleanDesc]
    );
    if (recentSub.length > 0) {
      logger.info(`Duplicate repair submission prevented via 60s window for ${customerName} (${cleanEmail}). Existing ticket: ${recentSub[0].ticket_number}`);
      await connection.rollback();
      return res.status(200).json({
        success: true,
        isDuplicate: true,
        message: `You have already submitted this repair request. Ticket ID: ${recentSub[0].ticket_number}`,
        ticketNumber: recentSub[0].ticket_number,
        isNewCustomer: Boolean(autoLoginData?.isNewCustomer),
        isExistingCustomer: Boolean(autoLoginData?.isExistingCustomer),
        autoLogin: autoLoginData ? { token: autoLoginData.token, user: autoLoginData.user } : null,
        data: {
          id: recentSub[0].id,
          ticketNumber: recentSub[0].ticket_number,
          status: recentSub[0].status,
          alreadySubmitted: true
        }
      });
    }

    // 3. Resolve ticket sequence category and permanent account ID
    let userRole = req.user ? req.user.role : (autoLoginData?.user?.role || 'customer');
    if (userRole === 'company' && !targetCompanyId) {
      targetCompanyId = userId;
    }

    let isAmc = false;
    if (targetCompanyId) {
      const [profiles] = await connection.query(
        'SELECT amc_status, company_type FROM company_profiles WHERE user_id = ? LIMIT 1',
        [targetCompanyId]
      );
      isAmc = (profiles[0]?.amc_status || '').toLowerCase() === 'active' || (profiles[0]?.company_type || '').toUpperCase() === 'AMC';
      if (!isAmc && targetDeviceId) {
        const [devRows] = await connection.query('SELECT is_amc FROM company_devices WHERE id = ? LIMIT 1', [targetDeviceId]);
        if (devRows[0]?.is_amc === 1) isAmc = true;
      }
    }

    // Authoritative per-account sequential ticket number generation (TD-xxx-01, CMP-xxx-xxx)
    let compIdToPass = targetCompanyId;
    if (targetCompanyId) {
      const [cpRows] = await connection.query('SELECT company_id FROM company_profiles WHERE user_id = ? LIMIT 1', [targetCompanyId]);
      if (cpRows.length > 0 && cpRows[0].company_id) {
        compIdToPass = cpRows[0].company_id;
      }
    }
    const ticketNumber = await generateTicketNumber(connection, {
      userId,
      companyId: compIdToPass,
      isAmc
    });

    const finalDeviceCategory = resolvedDeviceCategory ? resolvedDeviceCategory.trim() : '';
    const finalCustomDeviceCategory = (finalDeviceCategory.toLowerCase() === 'other' && customDeviceCategory)
      ? customDeviceCategory.trim()
      : null;

    const cleanCustomerName = (customerName || '').trim();
    const cleanAddress = address && address.trim() ? address.trim() : null;
    const cleanCity = (city || '').trim();
    const cleanState = state && state.trim() ? state.trim() : null;
    const cleanZip = zipCode && zipCode.trim() ? zipCode.trim() : null;
    const cleanBrand = resolvedBrand ? resolvedBrand.trim() : '';
    const cleanCustomBrand = (cleanBrand.toLowerCase() === 'other' && customBrand && customBrand.trim()) ? customBrand.trim() : null;
    const cleanModelNumber = resolvedModelNumber && resolvedModelNumber.trim() ? resolvedModelNumber.trim() : null;
    const cleanSerialNumber = resolvedSerialNumber && resolvedSerialNumber.trim() ? resolvedSerialNumber.trim() : null;
    const cleanDeviceConfig = resolvedDeviceConfig && resolvedDeviceConfig.trim() ? resolvedDeviceConfig.trim() : null;
    const cleanProblemType = (problemType || '').trim();
    const cleanCustomProblem = (cleanProblemType.toLowerCase() === 'other' && customProblemType && customProblemType.trim()) ? customProblemType.trim() : null;
    const cleanServiceType = (serviceType || 'Bring to Service Center').trim();
    const cleanCustomServiceType = (cleanServiceType.toLowerCase() === 'other' && customServiceType && customServiceType.trim()) ? customServiceType.trim() : null;

    // Insert service request with corporate linkages and submission_id
    const [result] = await connection.query(`
      INSERT INTO service_requests (
        user_id, company_id, device_id, employee_id, customer_name, mobile, email, address, city, state, zip_code, 
        device_category, custom_device_category, brand, custom_brand, model_number, 
        serial_number, device_configuration, problem_type, custom_problem_type, 
        problem_description, service_type, custom_service_type, priority, preferred_contact_method, 
        image_path, screenshot_path, status, ticket_number, submission_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `, [
      userId, targetCompanyId, targetDeviceId, targetEmployeeId, cleanCustomerName, cleanMobile, cleanEmail, cleanAddress, cleanCity,
      cleanState, cleanZip, finalDeviceCategory, finalCustomDeviceCategory,
      cleanBrand, cleanCustomBrand, cleanModelNumber, cleanSerialNumber,
      cleanDeviceConfig, cleanProblemType, cleanCustomProblem,
      cleanDesc, cleanServiceType, cleanCustomServiceType,
      priority || 'Standard', contactMethodStr,
      deviceImagePath, screenshotPath, ticketNumber, submissionKey || null
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
          deviceCategory: finalDeviceCategory,
          customDeviceCategory: finalCustomDeviceCategory,
          brand: resolvedBrand,
          customBrand,
          modelNumber: resolvedModelNumber,
          serialNumber: resolvedSerialNumber,
          deviceConfiguration: resolvedDeviceConfig,
          problemType,
          customProblemType,
          problemDescription,
          serviceType,
          customServiceType,
          priority,
          preferredContactMethod
        }).catch(err => logger.error('Failed to trigger Google Sheets Webhook for repair request:', err));
      }
    } catch (wsErr) {
      logger.error('Error fetching/triggering Google Sheets integration for repair request:', wsErr);
    }

    // Asynchronously send email notification to admin
    const displayCategory = finalDeviceCategory.toLowerCase() === 'other' && finalCustomDeviceCategory ? `Other (${finalCustomDeviceCategory})` : finalDeviceCategory;
    const displayBrand = resolvedBrand === 'Other' && customBrand ? `Other (${customBrand})` : resolvedBrand;
    const displayProblem = problemType === 'Other' && customProblemType ? `Other (${customProblemType})` : problemType;
    const displayService = serviceType === 'Other' && customServiceType ? `Other (${customServiceType})` : (serviceType || 'Bring to Service Center');

    const emailSubject = `New Repair Request [ID: ${requestId}] - ${customerName}`;
    const emailHtml = `
      <h2>New Repair Request Submitted</h2>
      <p><strong>Request ID:</strong> ${requestId}</p>
      <p><strong>Customer Name:</strong> ${customerName}</p>
      <p><strong>Mobile:</strong> ${mobile}</p>
      <p><strong>Email:</strong> ${email || 'N/A'}</p>
      <p><strong>Device:</strong> ${displayBrand} ${resolvedModelNumber || ''} (${displayCategory})</p>
      <p><strong>Serial Number:</strong> ${resolvedSerialNumber || 'N/A'}</p>
      <p><strong>Device Configuration:</strong> ${resolvedDeviceConfig || 'N/A'}</p>
      <p><strong>Problem:</strong> ${displayProblem}</p>
      <p><strong>Description:</strong><br/>${problemDescription}</p>
      <p><strong>Service Preference:</strong> ${displayService}</p>
      <p><strong>Priority:</strong> ${priority || 'Standard'}</p>
    `;
    sendAdminNotification(emailSubject, emailHtml).catch(err => logger.error('Failed to send repair notification'));

    const responsePayload = {
      id: requestId,
      requestId,
      ticketNumber,
      isNewCustomer: Boolean(autoLoginData?.isNewCustomer),
      isExistingCustomer: Boolean(autoLoginData?.isExistingCustomer)
    };

    if (autoLoginData) {
      // Only include token and user in the response — never expose any passwords
      responsePayload.autoLogin = {
        token: autoLoginData.token,
        user: autoLoginData.user
      };

      // Send Welcome / Set Password Email to newly auto-registered customer
      if (autoLoginData.isNewCustomer && autoLoginData.setPasswordToken) {
        const baseUrl = getFrontendBaseUrl(req);
        const setPasswordUrl = `${baseUrl}/auth/reset-password?token=${encodeURIComponent(autoLoginData.setPasswordToken)}&email=${encodeURIComponent(autoLoginData.user.email)}&mode=setup`;

        const welcomeSubject = 'Welcome to TekDoctor — Your Customer Account Is Ready';
        const welcomeHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0d0d12; color: #f4f4f5; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; padding: 32px 24px;">
            <div style="margin-bottom: 24px;">
              <span style="font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.5px; color: #ffffff;">TEK<span style="color: #00e5ff;">DOCTOR</span></span>
            </div>
            <h2 style="font-size: 22px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px;">Your Customer Account Is Ready</h2>
            <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 16px;">Hello ${autoLoginData.user.name || 'Valued Customer'},</p>
            <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 20px;">
              Thank you for booking a repair with TekDoctor. We have automatically initialized your secure Customer Account so you can track repair progress, approve estimates, view diagnostics, and access payment receipts.
            </p>

            <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 16px; margin-bottom: 24px; font-size: 13px; line-height: 1.6;">
              <div style="color: #00e5ff; font-weight: 700; font-family: monospace; font-size: 14px; margin-bottom: 8px;">TICKET ID: #${ticketNumber}</div>
              <div style="color: #d4d4d8;"><strong>Device:</strong> ${displayBrand} ${resolvedModelNumber || ''} (${displayCategory})</div>
              <div style="color: #d4d4d8;"><strong>Problem:</strong> ${displayProblem}</div>
              <div style="color: #d4d4d8;"><strong>Current Status:</strong> Pending Review / In Queue</div>
            </div>

            <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 24px;">
              You are currently authenticated on the browser where you placed this booking. To sign in to your Customer Account from <strong>any other device or browser</strong>, please set your password using the link below:
            </p>

            <div style="margin: 28px 0; text-align: center;">
              <a href="${setPasswordUrl}" style="background-color: #00e5ff; color: #000000; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block; text-transform: uppercase; letter-spacing: 0.5px;">Set Your Password</a>
            </div>

            <p style="font-size: 12px; color: #71717a; margin-bottom: 8px;">If the button above does not work, copy and paste this URL into your browser:</p>
            <p style="font-size: 11px; word-break: break-all; color: #00e5ff; background-color: #18181b; padding: 10px; border-radius: 6px; margin-bottom: 24px; font-family: monospace;">${setPasswordUrl}</p>

            <hr style="border: 0; border-top: 1px solid #27272a; margin: 24px 0;" />
            <p style="font-size: 11px; color: #71717a; line-height: 1.5; margin: 0;">This setup link is single-use, user-bound, and expires in 24 hours. Once configured, you can log in directly from our Customer Login terminal at any time.</p>
          </div>
        `;

        sendCustomerNotification(autoLoginData.user.email, welcomeSubject, welcomeHtml).catch(err => logger.error('Failed to send auto-registration welcome email'));

        if (config.env === 'development') {
          logger.info(`[DEV SET PASSWORD LINK] User: ${autoLoginData.user.email} | URL: ${setPasswordUrl}`);
        }
      }
    }

    // Log Activity
    await logActivity(req.user ? req.user.id : null, 'repair', 'create_repair_request', 'service_requests', requestId, { ticketNumber }, req.ip);

    const jsonResponse = formatResponse(true, 'Repair request submitted successfully.', responsePayload);
    Object.assign(jsonResponse, responsePayload);

    return res.status(201).json(jsonResponse);

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

    let baseQuery = `
      FROM service_requests sr
      LEFT JOIN company_profiles cp ON sr.company_id = cp.user_id
      LEFT JOIN company_devices cd ON sr.device_id = cd.id
      LEFT JOIN company_employees ce ON sr.employee_id = ce.id
      LEFT JOIN users tu ON sr.assigned_technician_id = tu.id
      LEFT JOIN invoices inv ON inv.id = (
        SELECT i2.id FROM invoices i2
        WHERE i2.ticket_id = sr.id AND i2.is_active = TRUE
        ORDER BY i2.created_at DESC
        LIMIT 1
      )
    `;
    const queryParams = [];
    const whereConditions = [];

    if (search) {
      whereConditions.push('(sr.ticket_number LIKE ? OR sr.customer_name LIKE ? OR sr.mobile LIKE ? OR sr.email LIKE ? OR sr.brand LIKE ? OR sr.model_number LIKE ? OR sr.serial_number LIKE ? OR sr.device_category LIKE ? OR sr.city LIKE ? OR cp.company_name LIKE ? OR cd.serial_number LIKE ? OR cd.asset_id LIKE ? OR ce.name LIKE ?)');
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (statusFilter && statusFilter !== 'all') {
      whereConditions.push('sr.status = ?');
      queryParams.push(statusFilter);
    }

    if (priorityFilter && priorityFilter !== 'all') {
      whereConditions.push('sr.priority = ?');
      queryParams.push(priorityFilter);
    }

    // Enforce role-based technician isolation server-side:
    // Technicians can ONLY view tickets where they are the assigned or pending technician.
    // Client-provided technicianId filters are overridden to prevent IDOR / privilege escalation.
    if (req.user && req.user.role === 'technician') {
      whereConditions.push('(sr.assigned_technician_id = ? OR sr.pending_technician_id = ?)');
      queryParams.push(req.user.id, req.user.id);
    } else if (technicianFilter && technicianFilter !== 'all') {
      if (technicianFilter === 'unassigned') {
        whereConditions.push('(sr.assigned_technician_id IS NULL OR sr.assigned_technician_id = 0)');
      } else {
        whereConditions.push('sr.assigned_technician_id = ?');
        queryParams.push(technicianFilter);
      }
    }

    if (deviceCategoryFilter && deviceCategoryFilter !== 'all') {
      whereConditions.push('sr.device_category = ?');
      queryParams.push(deviceCategoryFilter);
    }

    const companyIdFilter = req.query.companyId;
    if (companyIdFilter && companyIdFilter !== 'all') {
      whereConditions.push('sr.company_id = ?');
      queryParams.push(companyIdFilter);
    }

    const deviceIdFilter = req.query.deviceId;
    if (deviceIdFilter && deviceIdFilter !== 'all') {
      whereConditions.push('sr.device_id = ?');
      queryParams.push(deviceIdFilter);
    }

    const clientTypeFilter = req.query.clientType;
    if (clientTypeFilter === 'company') {
      whereConditions.push('sr.company_id IS NOT NULL');
    } else if (clientTypeFilter === 'individual') {
      whereConditions.push('sr.company_id IS NULL');
    }

    const paymentStatusFilter = req.query.paymentStatus;
    if (paymentStatusFilter && paymentStatusFilter !== 'all') {
      if (paymentStatusFilter === 'paid') {
        whereConditions.push("sr.payment_status = 'paid'");
      } else if (paymentStatusFilter === 'unpaid') {
        whereConditions.push("(sr.payment_status = 'unpaid' OR sr.payment_status IS NULL OR sr.payment_status = 'pending')");
      } else if (paymentStatusFilter === 'not_set') {
        whereConditions.push("(sr.repair_cost IS NULL OR sr.repair_cost <= 0)");
      } else if (paymentStatusFilter === 'set') {
        whereConditions.push("(sr.repair_cost > 0)");
      } else {
        whereConditions.push("sr.payment_status = ?");
        queryParams.push(paymentStatusFilter);
      }
    }

    const sanitizeDate = (d) => {
      if (!d) return null;
      const match = String(d).match(/^\d{4}-\d{2}-\d{2}/);
      return match ? match[0] : null;
    };
    const sanitizedStartDate = sanitizeDate(startDate);
    const sanitizedEndDate = sanitizeDate(endDate);

    if (sanitizedStartDate) {
      whereConditions.push('DATE(sr.created_at) >= ?');
      queryParams.push(sanitizedStartDate);
    }

    if (sanitizedEndDate) {
      whereConditions.push('DATE(sr.created_at) <= ?');
      queryParams.push(sanitizedEndDate);
    }

    if (whereConditions.length > 0) {
      baseQuery += ' WHERE ' + whereConditions.join(' AND ');
    }

    // Get total count
    const [countResult] = await connection.query(`SELECT COUNT(*) as total ${baseQuery}`, queryParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Get paginated data
    const dataQuery = `SELECT sr.*, 
                              cp.company_id as canonical_company_id,
                              cp.company_name, 
                              cp.company_logo,
                              cp.contact_person as company_contact_person,
                              cp.amc_status as company_amc_status,
                              cd.serial_number as device_serial,
                              cd.asset_id,
                              cd.is_amc,
                              cd.amc_tag,
                              ce.name as employee_name,
                              tu.name as technician_name,
                              inv.id as invoice_id,
                              inv.amount as invoice_amount,
                              inv.status as invoice_status,
                              inv.invoice_date,
                              inv.paid_at as invoice_paid_at
                       ${baseQuery} 
                       ORDER BY sr.created_at DESC 
                       LIMIT ? OFFSET ?`;
    const dataParams = [...queryParams, limit, offset];

    const [rows] = await connection.query(dataQuery, dataParams);

    // Map response keys to match CamelCase expectations of React frontend
    const requests = rows.map(row => ({
      id: row.id,
      ticketNumber: row.ticket_number,
      userId: row.user_id,
      invoiceId: row.invoice_id || null,
      invoice_id: row.invoice_id || null,
      invoiceAmount: row.invoice_amount ? parseFloat(row.invoice_amount) : null,
      invoiceStatus: row.invoice_status || null,
      invoice_status: row.invoice_status || null,
      invoiceDate: row.invoice_date || null,
      companyId: row.company_id || null,
      company_id: row.company_id || null,
      companyNumericId: row.company_id || null,
      permanent_company_id: row.canonical_company_id || (row.company_id ? 'CMP-' + String(row.company_id).padStart(3, '0') : null),
      companyPermanentId: row.canonical_company_id || (row.company_id ? 'CMP-' + String(row.company_id).padStart(3, '0') : null),
      companyCode: row.canonical_company_id || (row.company_id ? 'CMP-' + String(row.company_id).padStart(3, '0') : null),
      companyName: row.company_name || null,
      companyLogo: row.company_logo || null,
      companyContactPerson: row.company_contact_person || null,
      companyAmcStatus: row.company_amc_status || null,
      deviceId: row.device_id || null,
      employeeId: row.employee_id || null,
      employeeName: row.employee_name || null,
      assetId: row.asset_id || null,
      isAmc: !!row.is_amc,
      amcTag: row.amc_tag || null,
      customerName: row.customer_name,
      mobile: row.mobile,
      email: row.email,
      address: row.address,
      city: row.city,
      state: row.state,
      zipCode: row.zip_code,
      deviceCategory: row.device_category,
      customDeviceCategory: row.custom_device_category || null,
      brand: row.brand,
      customBrand: row.custom_brand || null,
      modelNumber: row.model_number,
      serialNumber: row.device_serial || row.serial_number,
      deviceConfiguration: row.device_configuration,
      problemType: row.problem_type,
      customProblemType: row.custom_problem_type || null,
      problemDescription: row.problem_description,
      serviceType: row.service_type,
      customServiceType: row.custom_service_type || null,
      priority: row.priority,
      preferredContactMethod: row.preferred_contact_method,
      imagePath: row.image_path,
      screenshotPath: row.screenshot_path,
      status: row.status,
      assignedTechnicianId: row.assigned_technician_id,
      pendingTechnicianId: row.pending_technician_id,
      technicianName: row.technician_name || null,
      customerRepairDescription: row.customer_repair_description,
      slaDeadline: row.sla_deadline,
      repairCost: row.repair_cost ? parseFloat(row.repair_cost) : 0,
      repair_cost: row.repair_cost ? parseFloat(row.repair_cost) : 0,
      paymentStatus: row.payment_status || 'unpaid',
      payment_status: row.payment_status || 'unpaid',
      collectionStatus: row.collection_status || 'not_applicable',
      collection_status: row.collection_status || 'not_applicable',
      paymentId: row.payment_id || null,
      payment_id: row.payment_id || null,
      paymentMethod: row.payment_method || null,
      payment_method: row.payment_method || null,
      paidAt: row.paid_at || null,
      paid_at: row.paid_at || null,
      repairNotes: row.repair_notes,
      feedbackRating: row.feedback_rating,
      feedbackComment: row.feedback_comment,
      feedbackDate: row.feedback_date,
      // Diagnosis & Estimation Fields
      diagnosis: row.diagnosis || null,
      identifiedIssues: row.identified_issues || null,
      requiredWork: row.required_work || null,
      estimatedCost: row.estimated_cost !== null && row.estimated_cost !== undefined && Number(row.estimated_cost) > 0 ? parseFloat(row.estimated_cost) : (row.repair_cost ? parseFloat(row.repair_cost) : 0),
      additionalCharges: row.additional_charges ? parseFloat(row.additional_charges) : 0,
      totalEstimatedCost: (row.estimated_cost !== null && row.estimated_cost !== undefined && Number(row.estimated_cost) > 0)
        ? (parseFloat(row.estimated_cost) + (row.additional_charges ? parseFloat(row.additional_charges) : 0))
        : (row.repair_cost ? parseFloat(row.repair_cost) : 0),
      inspectionNotes: row.inspection_notes || null,
      deviceCondition: row.device_condition || null,
      inspectedAt: row.inspected_at || null,
      estimateSubmittedAt: row.estimate_submitted_at || null,
      // Customer Approval & Hold Fields
      customerApprovalStatus: row.customer_approval_status || 'none',
      approvedAt: row.approved_at || null,
      approvedBy: row.approved_by || null,
      approvalNotes: row.approval_notes || null,
      rejectedAt: row.rejected_at || null,
      rejectionReason: row.rejection_reason || null,
      holdStartDate: row.hold_start_date || null,
      holdEndDate: row.hold_end_date || null,
      holdReason: row.hold_reason || null,
      holdNotes: row.hold_notes || null,
      reapprovalRequestedAt: row.reapproval_requested_at || null,
      reapprovalNotes: row.reapproval_notes || null,
      cancellationReason: row.cancellation_reason || null,
      cancelledAt: row.cancelled_at || null,
      cancelledBy: row.cancelled_by || null,
      amountUpdatedByAdmin: Boolean(row.amount_updated_by_admin),
      adminUpdatedAmount: row.admin_updated_amount ? parseFloat(row.admin_updated_amount) : null,
      amountUpdatedAt: row.amount_updated_at || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    if (requests.length > 0) {
      // 1. Batch fetch company device serial numbers if any deviceIds exist
      const deviceIds = requests.map(r => r.deviceId).filter(Boolean);
      const deviceSerialMap = new Map();
      if (deviceIds.length > 0) {
        const [devRows] = await connection.query(
          'SELECT id, serial_number FROM company_devices WHERE id IN (?)',
          [deviceIds]
        );
        devRows.forEach(d => {
          if (d.serial_number) deviceSerialMap.set(d.id, d.serial_number);
        });
      }

      // 2. Collect unique serials and (mobile, modelNumber) keys for batch querying
      const serials = [];
      const mobiles = [];
      const models = [];

      requests.forEach(r => {
        const serial = r.deviceId ? deviceSerialMap.get(r.deviceId) : (r.serialNumber || null);
        if (serial) {
          serials.push(serial);
        } else if (r.mobile && r.modelNumber) {
          mobiles.push(r.mobile);
          models.push(r.modelNumber);
        }
      });

      // 3. Batch fetch repeat repair histories in a single query if there are criteria
      const conditions = [];
      const queryParams = [];

      if (serials.length > 0) {
        conditions.push('(d.serial_number IN (?) OR sr.serial_number IN (?))');
        queryParams.push(serials, serials);
      }
      if (mobiles.length > 0 && models.length > 0) {
        conditions.push('(sr.mobile IN (?) AND sr.model_number IN (?))');
        queryParams.push([...new Set(mobiles)], [...new Set(models)]);
      }

      let allHistory = [];
      if (conditions.length > 0) {
        const [historyRows] = await connection.query(
          `SELECT sr.id, sr.ticket_number, sr.device_id, sr.mobile, sr.model_number, sr.created_at as createdAt, sr.status, 
                  sr.problem_description as problemDescription, u.name as techName, d.serial_number as serialNumber,
                  sr.serial_number as directSerialNumber
           FROM service_requests sr
           LEFT JOIN company_devices d ON sr.device_id = d.id
           LEFT JOIN users u ON sr.assigned_technician_id = u.id
           WHERE (${conditions.join(' OR ')})
           ORDER BY sr.created_at DESC`,
          queryParams
        );
        allHistory = historyRows;
      }

      // 4. Map histories back to each request in-memory
      for (const r of requests) {
        const serial = r.deviceId ? deviceSerialMap.get(r.deviceId) : (r.serialNumber || null);
        let repeatRows = [];

        if (serial) {
          repeatRows = allHistory.filter(h => (h.serialNumber === serial || h.directSerialNumber === serial) && h.id !== r.id);
        } else if (r.mobile && r.modelNumber) {
          repeatRows = allHistory.filter(h => h.mobile === r.mobile && h.model_number === r.modelNumber && h.id !== r.id);
        }

        r.repeatCount = repeatRows.length + 1;
        r.repairHistory = repeatRows.map(h => ({
          id: h.id,
          ticketNumber: h.ticket_number,
          createdAt: h.createdAt,
          status: h.status,
          problemDescription: h.problemDescription,
          techName: h.techName
        }));
      }
    }

    // Calculate status counts for tabs (scoped to company filters if set)
    let countBase = ' FROM service_requests sr';
    const countWhere = [];
    const countParams = [];
    if (companyIdFilter && companyIdFilter !== 'all') {
      countWhere.push('sr.company_id = ?');
      countParams.push(companyIdFilter);
    }
    if (clientTypeFilter === 'company') {
      countWhere.push('sr.company_id IS NOT NULL');
    } else if (clientTypeFilter === 'individual') {
      countWhere.push('sr.company_id IS NULL');
    }
    if (countWhere.length > 0) {
      countBase += ' WHERE ' + countWhere.join(' AND ');
    }

    const [statusCountRows] = await connection.query(`
      SELECT sr.status, COUNT(*) as count 
      ${countBase} 
      GROUP BY sr.status
    `, countParams);
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

    const search = (req.query.search || req.query.q || '').trim();

    let sqlQuery = `
      SELECT sr.*,
             cp.company_name,
             cp.contact_person as company_contact_person,
             cp.phone_number as company_phone,
             cp.address as company_address,
             cp.company_logo,
             cp.gst_number as company_gst,
             comp_u.email as company_email,
             cd.asset_id,
             cd.serial_number as device_serial_number,
             cd.model_number as device_model_number,
             ce.name as employee_name,
             ce.email as employee_email,
             ce.phone as employee_phone,
             inv.id as invoice_id,
             inv.amount as invoice_amount,
             inv.status as invoice_status,
             inv.invoice_date,
             inv.paid_at as invoice_paid_at
      FROM service_requests sr
      LEFT JOIN company_profiles cp ON (sr.company_id = cp.user_id OR (sr.company_id IS NULL AND sr.user_id = cp.user_id))
      LEFT JOIN users comp_u ON (sr.company_id = comp_u.id OR (sr.company_id IS NULL AND sr.user_id = comp_u.id AND comp_u.role = 'company'))
      LEFT JOIN company_devices cd ON sr.device_id = cd.id
      LEFT JOIN company_employees ce ON sr.employee_id = ce.id
      LEFT JOIN invoices inv ON inv.id = (
        SELECT i2.id FROM invoices i2
        WHERE i2.ticket_id = sr.id AND i2.is_active = TRUE
        ORDER BY i2.created_at DESC
        LIMIT 1
      )
      WHERE (sr.assigned_technician_id = ? OR sr.pending_technician_id = ?)
    `;

    const queryParams = [req.user.id, req.user.id];

    if (search) {
      sqlQuery += ` AND (
        sr.ticket_number LIKE ?
        OR sr.serial_number LIKE ?
        OR cd.serial_number LIKE ?
        OR cd.asset_id LIKE ?
        OR sr.model_number LIKE ?
        OR cd.model_number LIKE ?
        OR sr.brand LIKE ?
        OR sr.custom_brand LIKE ?
        OR sr.customer_name LIKE ?
        OR cp.company_name LIKE ?
        OR cp.contact_person LIKE ?
        OR ce.name LIKE ?
        OR sr.mobile LIKE ?
        OR cp.phone_number LIKE ?
        OR ce.phone LIKE ?
      )`;
      const pattern = `%${search}%`;
      queryParams.push(
        pattern, // sr.ticket_number
        pattern, // sr.serial_number
        pattern, // cd.serial_number
        pattern, // cd.asset_id
        pattern, // sr.model_number
        pattern, // cd.model_number
        pattern, // sr.brand
        pattern, // sr.custom_brand
        pattern, // sr.customer_name
        pattern, // cp.company_name
        pattern, // cp.contact_person
        pattern, // ce.name
        pattern, // sr.mobile
        pattern, // cp.phone_number
        pattern  // ce.phone
      );
    }

    sqlQuery += ` ORDER BY sr.created_at DESC`;

    const [rows] = await connection.query(sqlQuery, queryParams);

    const requests = rows.map(row => ({
      id: row.id,
      ticketNumber: row.ticket_number,
      userId: row.user_id,
      invoiceId: row.invoice_id || null,
      invoice_id: row.invoice_id || null,
      invoiceStatus: row.invoice_status || null,
      invoice_status: row.invoice_status || null,
      invoiceAmount: row.invoice_amount ? parseFloat(row.invoice_amount) : null,
      invoice_amount: row.invoice_amount ? parseFloat(row.invoice_amount) : null,
      invoiceDate: row.invoice_date || null,
      invoicePaidAt: row.invoice_paid_at || null,
      customerName: row.customer_name,
      mobile: row.mobile,
      email: row.email,
      address: row.address,
      city: row.city,
      state: row.state,
      zipCode: row.zip_code,
      deviceCategory: row.device_category,
      customDeviceCategory: row.custom_device_category || null,
      brand: row.brand,
      customBrand: row.custom_brand || null,
      modelNumber: row.model_number || row.device_model_number || null,
      serialNumber: row.serial_number || row.device_serial_number || null,
      deviceConfiguration: row.device_configuration,
      problemType: row.problem_type,
      customProblemType: row.custom_problem_type || null,
      problemDescription: row.problem_description,
      serviceType: row.service_type,
      customServiceType: row.custom_service_type || null,
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
      // Corporate B2B Fields
      companyId: row.company_id || (row.company_name ? row.user_id : null),
      companyName: row.company_name || null,
      companyEmail: row.company_email || null,
      companyPhone: row.company_phone || null,
      companyAddress: row.company_address || null,
      companyContactPerson: row.company_contact_person || null,
      companyLogo: row.company_logo || null,
      companyGst: row.company_gst || null,
      assetId: row.asset_id || null,
      employeeName: row.employee_name || null,
      employeeEmail: row.employee_email || null,
      employeePhone: row.employee_phone || null,
      assignedAt: row.assigned_at || row.updated_at || row.created_at,
      // Diagnosis & Estimation Fields
      diagnosis: row.diagnosis || null,
      identifiedIssues: row.identified_issues || null,
      requiredWork: row.required_work || null,
      estimatedCost: row.estimated_cost !== null && row.estimated_cost !== undefined && Number(row.estimated_cost) > 0 ? parseFloat(row.estimated_cost) : (row.repair_cost ? parseFloat(row.repair_cost) : 0),
      additionalCharges: row.additional_charges ? parseFloat(row.additional_charges) : 0,
      totalEstimatedCost: (row.estimated_cost !== null && row.estimated_cost !== undefined && Number(row.estimated_cost) > 0)
        ? (parseFloat(row.estimated_cost) + (row.additional_charges ? parseFloat(row.additional_charges) : 0))
        : (row.repair_cost ? parseFloat(row.repair_cost) : 0),
      inspectionNotes: row.inspection_notes || null,
      deviceCondition: row.device_condition || null,
      inspectedAt: row.inspected_at || null,
      estimateSubmittedAt: row.estimate_submitted_at || null,
      // Customer Approval & Hold Fields
      customerApprovalStatus: row.customer_approval_status || 'none',
      approvedAt: row.approved_at || null,
      approvedBy: row.approved_by || null,
      approvalNotes: row.approval_notes || null,
      rejectedAt: row.rejected_at || null,
      rejectionReason: row.rejection_reason || null,
      holdStartDate: row.hold_start_date || null,
      holdEndDate: row.hold_end_date || null,
      holdReason: row.hold_reason || null,
      holdNotes: row.hold_notes || null,
      reapprovalRequestedAt: row.reapproval_requested_at || null,
      reapprovalNotes: row.reapproval_notes || null,
      cancellationReason: row.cancellation_reason || null,
      cancelledAt: row.cancelled_at || null,
      cancelledBy: row.cancelled_by || null,
      repairCost: row.repair_cost ? parseFloat(row.repair_cost) : 0,
      repair_cost: row.repair_cost ? parseFloat(row.repair_cost) : 0,
      paymentStatus: row.payment_status || 'unpaid',
      payment_status: row.payment_status || 'unpaid',
      collectionStatus: row.collection_status || 'not_applicable',
      collection_status: row.collection_status || 'not_applicable',
      paymentId: row.payment_id || null,
      paymentMethod: row.payment_method || null,
      paidAt: row.paid_at || null,
      amountUpdatedByAdmin: Boolean(row.amount_updated_by_admin),
      adminUpdatedAmount: row.admin_updated_amount ? parseFloat(row.admin_updated_amount) : null,
      amountUpdatedAt: row.amount_updated_at || null,
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
         SUM(CASE WHEN status IN ('completed', 'delivered') THEN 1 ELSE 0 END) as total_completed
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
      customDeviceCategory: row.custom_device_category || null,
      brand: row.brand,
      customBrand: row.custom_brand || null,
      modelNumber: row.model_number,
      serialNumber: row.serial_number,
      deviceConfiguration: row.device_configuration,
      problemType: row.problem_type,
      customProblemType: row.custom_problem_type || null,
      problemDescription: row.problem_description,
      serviceType: row.service_type,
      customServiceType: row.custom_service_type || null,
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
      // Diagnosis & Estimation Fields
      diagnosis: row.diagnosis || null,
      identifiedIssues: row.identified_issues || null,
      requiredWork: row.required_work || null,
      estimatedCost: row.estimated_cost !== null && row.estimated_cost !== undefined && Number(row.estimated_cost) > 0 ? parseFloat(row.estimated_cost) : (row.repair_cost ? parseFloat(row.repair_cost) : 0),
      additionalCharges: row.additional_charges ? parseFloat(row.additional_charges) : 0,
      totalEstimatedCost: (row.estimated_cost !== null && row.estimated_cost !== undefined && Number(row.estimated_cost) > 0)
        ? (parseFloat(row.estimated_cost) + (row.additional_charges ? parseFloat(row.additional_charges) : 0))
        : (row.repair_cost ? parseFloat(row.repair_cost) : 0),
      inspectionNotes: row.inspection_notes || null,
      deviceCondition: row.device_condition || null,
      inspectedAt: row.inspected_at || null,
      estimateSubmittedAt: row.estimate_submitted_at || null,
      // Customer Approval & Hold Fields
      customerApprovalStatus: row.customer_approval_status || 'none',
      approvedAt: row.approved_at || null,
      approvedBy: row.approved_by || null,
      approvalNotes: row.approval_notes || null,
      rejectedAt: row.rejected_at || null,
      rejectionReason: row.rejection_reason || null,
      holdStartDate: row.hold_start_date || null,
      holdEndDate: row.hold_end_date || null,
      holdReason: row.hold_reason || null,
      holdNotes: row.hold_notes || null,
      reapprovalRequestedAt: row.reapproval_requested_at || null,
      reapprovalNotes: row.reapproval_notes || null,
      cancellationReason: row.cancellation_reason || null,
      cancelledAt: row.cancelled_at || null,
      cancelledBy: row.cancelled_by || null,
      repairCost: row.repair_cost ? parseFloat(row.repair_cost) : 0,
      repair_cost: row.repair_cost ? parseFloat(row.repair_cost) : 0,
      paymentStatus: row.payment_status || 'unpaid',
      payment_status: row.payment_status || 'unpaid',
      collectionStatus: row.collection_status || 'not_applicable',
      collection_status: row.collection_status || 'not_applicable',
      paymentId: row.payment_id || null,
      paymentMethod: row.payment_method || null,
      paidAt: row.paid_at || null,
      amountUpdatedByAdmin: Boolean(row.amount_updated_by_admin),
      adminUpdatedAmount: row.admin_updated_amount ? parseFloat(row.admin_updated_amount) : null,
      amountUpdatedAt: row.amount_updated_at || null,
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
  const { status, assignedTechnicianId, isOverride, overrideReason } = req.body;
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Check if the request exists and acquire exclusive row lock
    const [existing] = await connection.query(
      'SELECT * FROM service_requests WHERE id = ? LIMIT 1 FOR UPDATE',
      [id]
    );

    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const request = existing[0];

    // Status Transition Rules: Enforce locks and permissions on completed and delivered tasks
    if ((request.status === 'completed' || request.status === 'delivered') && req.user && req.user.role === 'technician') {
      await connection.rollback();
      return res.status(403).json(
        formatResponse(false, `${request.status === 'completed' ? 'Completed' : 'Delivered'} repair tickets are terminal and locked. Technicians cannot modify or update this ticket.`)
      );
    }

    if (request.status === 'completed' && status !== 'completed') {
      // 1. Technician is completely locked out from reverting completed tasks
      if (req.user && req.user.role === 'technician') {
        await connection.rollback();
        return res.status(403).json(
          formatResponse(false, 'Completed repair tasks are terminal and locked. Technicians cannot revert or reopen a completed repair task.')
        );
      }

      // 2. Completed -> Pending is strictly forbidden for ALL roles (including Admin)
      if (status === 'pending') {
        await connection.rollback();
        return res.status(400).json(
          formatResponse(false, 'Invalid status transition: A completed repair task cannot be reverted to Pending.')
        );
      }

      // 3. Completed -> In Progress requires authorized Admin override
      if (status === 'in_progress') {
        if (!req.user || req.user.role !== 'admin') {
          await connection.rollback();
          return res.status(403).json(
            formatResponse(false, 'Unauthorized: Only an Administrator can perform a status override on a completed task.')
          );
        }

        const isAuthorizedOverride = isOverride === true || Boolean(overrideReason && overrideReason.trim());
        if (!isAuthorizedOverride) {
          await connection.rollback();
          return res.status(400).json(
            formatResponse(false, 'Completed repair tasks are protected. To reopen a completed repair, an authorized Admin override with confirmation and reason is required.')
          );
        }
      }
    }

    if (request.status === 'delivered') {
      // 1. Technician is completely locked out from mutating delivered tickets
      if (req.user && req.user.role === 'technician') {
        await connection.rollback();
        return res.status(403).json(
          formatResponse(false, 'Delivered repair tickets are terminal and locked. Technicians cannot modify or revert a delivered repair ticket.')
        );
      }

      // 2. Delivered -> Pending is strictly forbidden for ALL roles (including Admin)
      if (status === 'pending') {
        await connection.rollback();
        return res.status(400).json(
          formatResponse(false, 'Invalid status transition: A delivered repair ticket cannot be reverted to Pending.')
        );
      }

      // 3. Delivered -> In Progress or Completed requires authorized Admin override
      if (status !== 'delivered') {
        if (!req.user || req.user.role !== 'admin') {
          await connection.rollback();
          return res.status(403).json(
            formatResponse(false, 'Unauthorized: Only an Administrator can perform a status override on a delivered ticket.')
          );
        }

        const isAuthorizedOverride = isOverride === true || Boolean(overrideReason && overrideReason.trim());
        if (!isAuthorizedOverride) {
          await connection.rollback();
          return res.status(400).json(
            formatResponse(false, 'Delivered repair tickets are protected. To reopen or modify a delivered repair, an authorized Admin override with confirmation and reason is required.')
          );
        }
      }
    }

    // Ownership & Decision Restriction: Technicians can only modify decisions/status for their own assigned tasks
    if (req.user && req.user.role === 'technician') {
      if (request.assigned_technician_id !== req.user.id) {
        await connection.rollback();
        return res.status(403).json(
          formatResponse(false, "Unauthorized: You cannot modify another technician's decision or ticket status.")
        );
      }
      if (assignedTechnicianId !== undefined && assignedTechnicianId !== null && Number(assignedTechnicianId) !== Number(request.assigned_technician_id)) {
        await connection.rollback();
        return res.status(403).json(
          formatResponse(false, 'Unauthorized: Technicians cannot directly reassign tickets. Please use the task transfer workflow.')
        );
      }

      // Technicians cannot revert in_progress -> pending
      if (request.status === 'in_progress' && status === 'pending') {
        await connection.rollback();
        return res.status(400).json(
          formatResponse(false, 'Technicians cannot revert an In Progress task back to Pending.')
        );
      }

      // Restrict technician from marking in_progress or completed before customer approves estimate
      if ((status === 'in_progress' || status === 'completed') && request.customer_approval_status !== 'approved') {
        await connection.rollback();
        return res.status(400).json(
          formatResponse(false, 'Cannot start or complete repair before the customer has approved the estimated repair cost.')
        );
      }
    }

    // Detect if this is an authorized Admin override from completed/delivered -> in_progress/completed
    const isOverrideAction = ['completed', 'delivered'].includes(request.status) && ['in_progress', 'completed'].includes(status) && req.user?.role === 'admin';
    const cleanOverrideReason = (overrideReason || req.body.reason || `Admin status override: Reopened repair task from ${request.status} to ${status}`).trim();

    let updateQuery = 'UPDATE service_requests SET status = ?';
    const params = [status];

    // If technician assignment is passed
    if (assignedTechnicianId !== undefined) {
      if (assignedTechnicianId) {
        if (req.user && req.user.role === 'admin') {
          // Direct admin assignment: assign immediately to technician
          updateQuery += ', assigned_technician_id = ?, pending_technician_id = NULL';
          params.push(assignedTechnicianId);
        } else {
          updateQuery += ', pending_technician_id = ?';
          params.push(assignedTechnicianId);
        }
      } else {
        updateQuery += ', assigned_technician_id = NULL, pending_technician_id = NULL';
      }
    }

    updateQuery += ' WHERE id = ?';
    params.push(id);

    await connection.query(updateQuery, params);

    logger.info(`Repair request ID ${id} status updated to: ${status}${assignedTechnicianId ? ` (Assigned to tech: ${assignedTechnicianId})` : ''}${isOverrideAction ? ' [ADMIN OVERRIDE]' : ''}`);

    // If Admin override was performed, record comprehensive audit trail & notify technician
    if (isOverrideAction) {
      // 1. Audit Log via logActivity
      await logActivity(
        req.user.id,
        'repair',
        'admin_status_override',
        'service_requests',
        id,
        {
          previousStatus: request.status,
          newStatus: status,
          reason: cleanOverrideReason,
          adminId: req.user.id,
          adminName: req.user.name,
          adminEmail: req.user.email,
          ticketNumber: request.ticket_number
        },
        req.ip
      );

      // 2. Work log entry in technician_work_logs
      try {
        await connection.query(
          `INSERT INTO technician_work_logs (repair_request_id, technician_id, repair_stage, action_performed, notes)
           VALUES (?, ?, ?, ?, ?)`,
          [
            id,
            request.assigned_technician_id || req.user.id,
            status,
            `Admin Status Override: ${request.status} -> ${status}`,
            `Admin override performed by ${req.user.name || 'Admin'} (${req.user.email || req.user.id}): ${cleanOverrideReason}`
          ]
        );
      } catch (wlErr) {
        logger.warn('Failed to insert work log on admin status override: ' + wlErr.message);
      }

      // 3. Notify assigned technician (if assigned)
      if (request.assigned_technician_id) {
        try {
          await connection.query(
            `INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
             VALUES (?, ?, ?, ?, ?)`,
            [
              request.assigned_technician_id,
              `Ticket Reopened by Admin [${request.ticket_number || id}]`,
              `Admin ${req.user.name || 'Admin'} has reopened this ${request.status} repair task to '${status}'. Reason: ${cleanOverrideReason}`,
              id,
              req.user.id
            ]
          );
        } catch (notifErr) {
          logger.warn('Failed to dispatch reopen notification to technician: ' + notifErr.message);
        }
      }
    }

    // Dispatch notification to Assigned Technician
    if (assignedTechnicianId) {
      try {
        const notifTitle = req.user?.role === 'admin'
          ? `Repair Ticket Assigned [${request.ticket_number || id}]`
          : 'Ticket Assignment Unconfirmed';
        const notifMsg = req.user?.role === 'admin'
          ? `Admin assigned Ticket #${request.ticket_number || id} (${request.brand || ''} ${request.model_number || ''}) to you.`
          : `You have been assigned Ticket ${request.ticket_number || id}. Please Review and Accept.`;
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [assignedTechnicianId, notifTitle, notifMsg, id, req.user ? req.user.id : null]
        );
      } catch (e) {
        logger.warn('Failed to dispatch notification to tech: ' + e.message);
      }
    }

    // Log standard status update Activity
    await logActivity(req.user ? req.user.id : null, 'repair', 'update_status', 'service_requests', id, { status, assignedTechnicianId, isOverride: isOverrideAction }, req.ip);

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

    // If completed or delivered, ensure Draft invoice exists for this ticket
    if (status === 'completed' || status === 'delivered') {
      try {
        const [existingInvs] = await connection.query(
          'SELECT id, status FROM invoices WHERE ticket_id = ? AND is_active = TRUE LIMIT 1 FOR UPDATE',
          [id]
        );
        if (existingInvs.length === 0) {
          const draftInvId = await generateInvoiceId(connection);
          const rawAddCharges = parseFloat(request.additional_charges || 0);
          const rawEstCost = parseFloat(request.estimated_cost || 0);
          const rawRepairCost = parseFloat(request.repair_cost || 0);

          let baseServiceCost = 0;
          let additionalCharges = Math.max(0, isNaN(rawAddCharges) ? 0 : rawAddCharges);

          if (rawEstCost > 0) {
            baseServiceCost = rawEstCost;
          } else if (rawRepairCost > 0) {
            baseServiceCost = Math.max(0, rawRepairCost - additionalCharges);
          } else {
            baseServiceCost = 0;
          }

          let gstEnabled = true;
          let gstRate = 18.0;
          try {
            const [gstSettings] = await connection.query(
              "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('invoice_gst_enabled', 'default_gst_rate')"
            );
            for (const s of gstSettings) {
              if (s.setting_key === 'invoice_gst_enabled') gstEnabled = s.setting_value !== 'false';
              if (s.setting_key === 'default_gst_rate') {
                const parsedRate = parseFloat(s.setting_value);
                if (!isNaN(parsedRate) && parsedRate >= 0) gstRate = parsedRate;
              }
            }
          } catch (_) {}

          const effectiveTaxRate = gstEnabled ? gstRate : 0.0;
          const defaultSubtotal = Math.round((baseServiceCost + additionalCharges) * 100) / 100;
          const defaultTax = Math.round((defaultSubtotal * (effectiveTaxRate / 100)) * 100) / 100;
          const defaultCgst = Math.round((defaultTax / 2) * 100) / 100;
          const defaultSgst = Math.round((defaultTax - defaultCgst) * 100) / 100;
          const defaultTotal = Math.round((defaultSubtotal + defaultTax) * 100) / 100;
          const clientName = request.customer_name || request.user_name || 'Customer';

          await connection.query(`
            INSERT INTO invoices (
              id, user_id, ticket_id, client_name, amount, subtotal, tax_amount,
              cgst_amount, sgst_amount, igst_amount, is_interstate, original_estimate,
              currency, invoice_date, due_date, status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, FALSE, ?, 'INR', NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY), 'Draft', ?)
          `, [
            draftInvId,
            request.user_id || request.company_id || null,
            id,
            clientName,
            defaultTotal,
            defaultSubtotal,
            defaultTax,
            defaultCgst,
            defaultSgst,
            (rawEstCost > 0 ? rawEstCost : (rawRepairCost > 0 ? rawRepairCost : defaultSubtotal)),
            `Draft invoice auto-created upon repair completion for ticket ${request.ticket_number || id}.`
          ]);

          const desc = `Device Repair Service - ${request.brand || ''} ${request.model_number || ''}`.trim() || 'Device Repair Service';
          const baseTax = Math.round((baseServiceCost * (effectiveTaxRate / 100)) * 100) / 100;
          await connection.query(`
            INSERT INTO invoice_line_items (invoice_id, description, hsn_sac, quantity, unit_price, total, tax_rate, tax_amount)
            VALUES (?, ?, '9987', 1, ?, ?, ?, ?)
          `, [draftInvId, desc, baseServiceCost, baseServiceCost, effectiveTaxRate, baseTax]);

          if (additionalCharges > 0) {
            const addTax = Math.round((additionalCharges * (effectiveTaxRate / 100)) * 100) / 100;
            await connection.query(`
              INSERT INTO invoice_line_items (invoice_id, description, hsn_sac, quantity, unit_price, total, tax_rate, tax_amount)
              VALUES (?, 'Additional Approved Service / Component Charges', '9987', 1, ?, ?, ?, ?)
            `, [draftInvId, additionalCharges, additionalCharges, effectiveTaxRate, addTax]);
          }

          logger.info(`Auto-created Draft invoice ${draftInvId} upon repair completion for ticket ${id} (Base: ₹${baseServiceCost}, Additional: ₹${additionalCharges}, Total: ₹${defaultTotal})`);
        }
      } catch (invErr) {
        logger.error('Failed to auto-create Draft invoice on repair completion: ' + invErr.message);
        throw invErr;
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

    // If delivered, notify customer
    if (status === 'delivered' && request.status !== 'delivered' && request.user_id) {
      try {
        const notificationTitle = `Device Delivered [${request.ticket_number || id}]`;
        const notificationMessage = `Your device has been delivered! Thank you for choosing TekDoctor. Please review your repair summary and invoice.`;
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [request.user_id, notificationTitle, notificationMessage, id, req.user ? req.user.id : null]
        );
      } catch (notifErr) {
        logger.error('Failed to create in-app delivery notification: ' + notifErr.message);
      }
    }

    await connection.commit();
    return res.status(200).json(formatResponse(true, `Repair request status updated to ${status}.`));

  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (_) {}
    }
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

    const isNumericId = !isNaN(Number(id)) && /^\d+$/.test(String(id));
    const whereSql = isNumericId ? 'WHERE sr.id = ? OR sr.ticket_number = ?' : 'WHERE sr.ticket_number = ?';
    const whereParams = isNumericId ? [Number(id), String(id)] : [String(id)];

    const [rows] = await connection.query(`
      SELECT sr.*, 
             d.id as fleet_device_id,
             d.device_category as linked_device_category,
             d.brand as linked_brand,
             d.model_number as linked_model,
             d.serial_number as linked_serial,
             d.notes as linked_device_notes,
             d.asset_id,
             d.is_amc,
             d.amc_tag,
             d.purchase_date as device_purchase_date,
             e.name as employee_name,
             e.email as employee_email,
             e.phone as employee_phone,
             e.department as employee_department,
             b.name as branch_name,
             tech.name as technician_name,
             tech.email as technician_email,
             tech.phone as technician_phone,
             cp.company_id as canonical_company_id,
             cp.company_name,
             cp.contact_person as company_contact_person,
             cp.phone_number as company_phone,
             cp.address as company_address,
             cp.company_logo,
             cp.gst_number as company_gst,
             comp_u.email as company_email,
             inv.id as invoice_id,
             inv.amount as invoice_amount,
             inv.invoice_date,
             inv.status as invoice_status,
             inv.paid_at as invoice_paid_at
      FROM service_requests sr
      LEFT JOIN company_devices d ON sr.device_id = d.id
      LEFT JOIN company_employees e ON sr.employee_id = e.id
      LEFT JOIN company_branches b ON (e.branch_id = b.id OR d.branch_id = b.id)
      LEFT JOIN users tech ON sr.assigned_technician_id = tech.id
      LEFT JOIN users comp_u ON (sr.company_id = comp_u.id OR (sr.company_id IS NULL AND sr.user_id = comp_u.id AND comp_u.role = 'company'))
      LEFT JOIN company_profiles cp ON (cp.user_id = sr.company_id OR (sr.company_id IS NULL AND cp.user_id = sr.user_id))
      LEFT JOIN invoices inv ON inv.id = (
        SELECT i2.id FROM invoices i2
        WHERE i2.ticket_id = sr.id
        ORDER BY i2.is_active DESC, i2.created_at DESC
        LIMIT 1
      )
      ${whereSql}
      LIMIT 1
    `, whereParams);

    if (rows.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const row = rows[0];

    // Ownership & Role-based Authorization:
    // - Admin has global access
    // - Technician can view only if assigned, pending, or involved in task transfers
    // - Company can view if company_id or user_id matches
    // - Customer can view if user_id matches
    if (req.user) {
      if (req.user.role === 'technician') {
        const canAccess = await canTechnicianAccessTicket(req.user.id, row, connection);
        if (!canAccess) {
          return res.status(403).json(formatResponse(false, 'Unauthorized to view this repair request.'));
        }
      } else if (req.user.role === 'company') {
        const rowCompId = row.company_id ? Number(row.company_id) : null;
        const rowUserId = row.user_id ? Number(row.user_id) : null;
        const reqUserId = Number(req.user.id);
        if (rowCompId !== reqUserId && rowUserId !== reqUserId) {
          return res.status(403).json(formatResponse(false, 'Unauthorized to view this corporate repair request.'));
        }
      } else if (req.user.role === 'customer') {
        if (Number(row.user_id) !== Number(req.user.id)) {
          return res.status(403).json(formatResponse(false, 'Unauthorized to view this repair request.'));
        }
      }
    }

    // Fetch associated technician work logs
    let workLogs = [];
    try {
      const [logRows] = await connection.query(
        `SELECT wl.*, u.name as technician_name, u.email as technician_email 
         FROM technician_work_logs wl 
         LEFT JOIN users u ON wl.technician_id = u.id 
         WHERE wl.repair_request_id = ? 
         ORDER BY wl.created_at ASC`,
        [row.id]
      );
      workLogs = logRows;
    } catch (_) { }

    // Fetch prior repair history for this device / serial number
    let deviceRepairHistory = [];
    try {
      const targetDeviceId = row.device_id || row.fleet_device_id;
      const targetSerial = row.linked_serial || row.serial_number;
      if (targetDeviceId) {
        const [histRows] = await connection.query(`
          SELECT sr.id, sr.ticket_number, sr.created_at, sr.status, sr.priority, 
                 sr.problem_type, sr.problem_description, sr.repair_cost, sr.payment_status,
                 tech.name as technician_name
          FROM service_requests sr
          LEFT JOIN users tech ON sr.assigned_technician_id = tech.id
          WHERE sr.device_id = ? AND sr.id != ?
          ORDER BY sr.created_at DESC
          LIMIT 20
        `, [targetDeviceId, row.id]);
        deviceRepairHistory = histRows;
      } else if (targetSerial && String(targetSerial).trim() !== '') {
        let compWhere = '';
        const queryParams = [targetSerial, targetSerial];
        if (row.company_id) {
          compWhere = ' AND sr.company_id = ?';
          queryParams.push(row.company_id);
        } else if (row.user_id) {
          compWhere = ' AND sr.company_id IS NULL AND sr.user_id = ?';
          queryParams.push(row.user_id);
        }
        queryParams.push(row.id);
        const [histRows] = await connection.query(`
          SELECT sr.id, sr.ticket_number, sr.created_at, sr.status, sr.priority, 
                 sr.problem_type, sr.problem_description, sr.repair_cost, sr.payment_status,
                 tech.name as technician_name
          FROM service_requests sr
          LEFT JOIN users tech ON sr.assigned_technician_id = tech.id
          WHERE (sr.serial_number = ? OR sr.device_id IN (SELECT id FROM company_devices WHERE serial_number = ?))
            ${compWhere}
            AND sr.id != ?
          ORDER BY sr.created_at DESC
          LIMIT 20
        `, queryParams);
        deviceRepairHistory = histRows;
      } else if (row.user_id && row.brand && row.model_number) {
        const [histRows] = await connection.query(`
          SELECT sr.id, sr.ticket_number, sr.created_at, sr.status, sr.priority, 
                 sr.problem_type, sr.problem_description, sr.repair_cost, sr.payment_status,
                 tech.name as technician_name
          FROM service_requests sr
          LEFT JOIN users tech ON sr.assigned_technician_id = tech.id
          WHERE sr.user_id = ? AND sr.brand = ? AND sr.model_number = ?
            AND sr.company_id IS NULL
            AND sr.id != ?
          ORDER BY sr.created_at DESC
          LIMIT 20
        `, [row.user_id, row.brand, row.model_number, row.id]);
        deviceRepairHistory = histRows;
      }
    } catch (e) {
      console.error('Error loading device repair history in getRepairRequestById:', e);
    }

    const request = {
      ...row,
      id: row.id,
      ticket_number: row.ticket_number,
      ticketNumber: row.ticket_number,
      user_id: row.user_id,
      userId: row.user_id,
      company_id: row.company_id || null,
      companyId: row.company_id || null,
      companyNumericId: row.company_id || null,
      permanent_company_id: row.canonical_company_id || (row.company_id ? 'CMP-' + String(row.company_id).padStart(3, '0') : null),
      companyPermanentId: row.canonical_company_id || (row.company_id ? 'CMP-' + String(row.company_id).padStart(3, '0') : null),
      companyCode: row.canonical_company_id || (row.company_id ? 'CMP-' + String(row.company_id).padStart(3, '0') : null),
      company_name: row.company_name || null,
      companyName: row.company_name || null,
      company_email: row.company_email || null,
      companyEmail: row.company_email || null,
      company_phone: row.company_phone || null,
      companyPhone: row.company_phone || null,
      company_address: row.company_address || null,
      companyAddress: row.company_address || null,
      company_contact_person: row.company_contact_person || null,
      companyContactPerson: row.company_contact_person || null,
      company_logo: row.company_logo || null,
      companyLogo: row.company_logo || null,
      company_gst: row.company_gst || null,
      companyGst: row.company_gst || null,
      company_amc_status: !!row.is_amc ? 'Active AMC' : 'Standard Warranty',
      companyAmcStatus: !!row.is_amc ? 'Active AMC' : 'Standard Warranty',
      device_id: row.device_id || row.fleet_device_id || null,
      deviceId: row.device_id || row.fleet_device_id || null,
      employee_id: row.employee_id || null,
      employeeId: row.employee_id || null,
      employee_name: row.employee_name || null,
      employeeName: row.employee_name || null,
      employee_email: row.employee_email || null,
      employeeEmail: row.employee_email || null,
      employee_phone: row.employee_phone || null,
      employeePhone: row.employee_phone || null,
      employee_department: row.employee_department || null,
      employeeDepartment: row.employee_department || null,
      branch_name: row.branch_name || null,
      branchName: row.branch_name || null,
      asset_id: row.asset_id || null,
      assetId: row.asset_id || null,
      is_amc: !!row.is_amc,
      isAmc: !!row.is_amc,
      amc_tag: row.amc_tag || null,
      amcTag: row.amc_tag || null,
      invoice_id: row.invoice_id || null,
      invoiceId: row.invoice_id || null,
      invoice_amount: row.invoice_amount ? parseFloat(row.invoice_amount) : null,
      invoiceAmount: row.invoice_amount ? parseFloat(row.invoice_amount) : null,
      invoice_date: row.invoice_date || null,
      invoiceDate: row.invoice_date || null,
      invoice_status: row.invoice_status || null,
      invoiceStatus: row.invoice_status || null,
      deviceRepairHistory,
      repairHistory: deviceRepairHistory,
      repeatCount: deviceRepairHistory.length + 1,
      customer_name: row.customer_name || row.employee_name || row.company_name || 'Customer',
      customerName: row.customer_name || row.employee_name || row.company_name || 'Customer',
      mobile: row.mobile || row.employee_phone || row.company_phone || '',
      email: row.email || row.employee_email || row.company_email || null,
      address: row.address || row.company_address || null,
      city: row.city || row.branch_name || '',
      state: row.state,
      zip_code: row.zip_code,
      zipCode: row.zip_code,
      device_category: row.linked_device_category || row.device_category,
      deviceCategory: row.linked_device_category || row.device_category,
      customDeviceCategory: row.custom_device_category || null,
      brand: row.linked_brand || row.brand,
      customBrand: row.custom_brand || null,
      model_number: row.linked_model || row.model_number,
      modelNumber: row.linked_model || row.model_number,
      serial_number: row.linked_serial || row.serial_number,
      serialNumber: row.linked_serial || row.serial_number,
      deviceConfiguration: row.device_configuration || row.linked_device_notes || null,
      problem_type: row.problem_type,
      problemType: row.problem_type,
      customProblemType: row.custom_problem_type || null,
      problem_description: row.problem_description,
      problemDescription: row.problem_description,
      service_type: row.service_type,
      serviceType: row.service_type,
      customServiceType: row.custom_service_type || null,
      priority: row.priority,
      preferredContactMethod: row.preferred_contact_method,
      imagePath: row.image_path,
      screenshotPath: row.screenshot_path,
      assignedTechnicianId: row.assigned_technician_id,
      technician_name: row.technician_name || null,
      technicianName: row.technician_name || null,
      technician_email: row.technician_email || null,
      technicianEmail: row.technician_email || null,
      technician_phone: row.technician_phone || null,
      status: row.status,
      customerRepairDescription: row.customer_repair_description,
      slaDeadline: row.sla_deadline,
      repairCost: parseFloat(row.repair_cost || 0),
      repair_cost: parseFloat(row.repair_cost || 0),
      paymentStatus: row.payment_status || 'unpaid',
      payment_status: row.payment_status || 'unpaid',
      collectionStatus: row.collection_status || 'not_applicable',
      collection_status: row.collection_status || 'not_applicable',
      paymentId: row.payment_id || null,
      payment_id: row.payment_id || null,
      paymentMethod: row.payment_method || null,
      payment_method: row.payment_method || null,
      paidAt: row.paid_at || null,
      paid_at: row.paid_at || null,
      repairNotes: row.repair_notes,
      feedbackRating: row.feedback_rating,
      feedbackComment: row.feedback_comment,
      feedbackDate: row.feedback_date,
      // Diagnosis & Estimation Fields
      diagnosis: row.diagnosis || null,
      identifiedIssues: row.identified_issues || null,
      requiredWork: row.required_work || null,
      estimatedCost: row.estimated_cost !== null && row.estimated_cost !== undefined && Number(row.estimated_cost) > 0 ? parseFloat(row.estimated_cost) : (row.repair_cost ? parseFloat(row.repair_cost) : 0),
      additionalCharges: row.additional_charges ? parseFloat(row.additional_charges) : 0,
      totalEstimatedCost: (row.estimated_cost !== null && row.estimated_cost !== undefined && Number(row.estimated_cost) > 0)
        ? (parseFloat(row.estimated_cost) + (row.additional_charges ? parseFloat(row.additional_charges) : 0))
        : (row.repair_cost ? parseFloat(row.repair_cost) : 0),
      inspectionNotes: row.inspection_notes || null,
      deviceCondition: row.device_condition || null,
      inspectedAt: row.inspected_at || null,
      estimateSubmittedAt: row.estimate_submitted_at || null,
      // Customer Approval & Hold Fields
      customerApprovalStatus: row.customer_approval_status || 'none',
      approvedAt: row.approved_at || null,
      approvedBy: row.approved_by || null,
      approvalNotes: row.approval_notes || null,
      rejectedAt: row.rejected_at || null,
      rejectionReason: row.rejection_reason || null,
      holdStartDate: row.hold_start_date || null,
      holdEndDate: row.hold_end_date || null,
      holdReason: row.hold_reason || null,
      holdNotes: row.hold_notes || null,
      reapprovalRequestedAt: row.reapproval_requested_at || null,
      reapprovalNotes: row.reapproval_notes || null,
      cancellationReason: row.cancellation_reason || null,
      cancelledAt: row.cancelled_at || null,
      cancelledBy: row.cancelled_by || null,
      amountUpdatedByAdmin: Boolean(row.amount_updated_by_admin),
      adminUpdatedAmount: row.admin_updated_amount ? parseFloat(row.admin_updated_amount) : null,
      amountUpdatedAt: row.amount_updated_at || null,
      isRead: row.is_read !== undefined ? row.is_read : 0,
      created_at: row.created_at,
      createdAt: row.created_at,
      updated_at: row.updated_at,
      updatedAt: row.updated_at,
      workLogs,
      work_logs: workLogs
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
 * Bulk Soft-Delete / Deactivate repair requests (Admin only)
 * POST /api/repair-request/bulk-delete
 */
const bulkDeleteRepairRequests = async (req, res, next) => {
  let connection;
  try {
    const { ticketIds, reason } = req.body;
    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res.status(400).json(formatResponse(false, 'ticketIds must be a non-empty array of numbers.'));
    }

    const numericIds = ticketIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0);
    if (numericIds.length === 0) {
      return res.status(400).json(formatResponse(false, 'No valid ticket IDs provided.'));
    }

    connection = await pool.getConnection();

    // Fetch existing records for audit logging and verification
    const [existing] = await connection.query(
      'SELECT id, ticket_number FROM service_requests WHERE id IN (?)',
      [numericIds]
    );

    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'No matching repair tickets found.'));
    }

    const foundIds = existing.map(r => r.id);
    const deactivationReason = reason && String(reason).trim() ? String(reason).trim() : 'Bulk cancelled / deactivated by admin';

    // Soft-deactivate and mark status as cancelled
    await connection.query(
      'UPDATE service_requests SET is_active = FALSE, status = "cancelled", deactivated_at = NOW(), deactivated_by = ?, deactivation_reason = ? WHERE id IN (?)',
      [req.user ? req.user.id : null, deactivationReason, foundIds]
    );

    logger.info(`Bulk deleted/deactivated ${foundIds.length} repair tickets by admin ID ${req.user ? req.user.id : 'unknown'}.`);

    // Audit logs for each deactivated ticket
    for (const ticket of existing) {
      await logActivity(
        req.user ? req.user.id : null,
        'repair',
        'bulk_deactivate_repair_request',
        'service_requests',
        ticket.id,
        { ticketNumber: ticket.ticket_number, reason: deactivationReason },
        req.ip
      );
    }

    return res.status(200).json(formatResponse(true, `Successfully deleted ${foundIds.length} repair ticket(s).`, {
      deletedCount: foundIds.length,
      deletedIds: foundIds
    }));
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
 * Helper to mask customer name for unauthenticated public tracking responses
 */
const maskCustomerName = (name) => {
  if (!name || typeof name !== 'string') return 'Customer';
  const trimmed = name.trim();
  if (!trimmed) return 'Customer';
  return trimmed
    .split(/\s+/)
    .map(part => {
      if (part.length <= 1) return part;
      if (part.length === 2) return part[0] + '*';
      return part[0] + '*'.repeat(Math.min(part.length - 1, 3));
    })
    .join(' ');
};

/**
 * Public route to track a repair request by ticketNumber
 * GET /api/repair-request/track/:id
 */
const trackRequest = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    let { id } = req.params;

    const [rows] = await connection.query(`
      SELECT sr.*, tu.name as technician_name
      FROM service_requests sr
      LEFT JOIN users tu ON sr.assigned_technician_id = tu.id
      WHERE sr.ticket_number = ?
      LIMIT 1
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found with that ID.'));
    }

    const row = rows[0];

    const [invRows] = await connection.query(
      'SELECT id, status, is_active FROM invoices WHERE ticket_id = ? AND is_active = TRUE ORDER BY id DESC LIMIT 1',
      [row.id]
    );
    const linkedInvoice = invRows.length > 0 ? invRows[0] : null;
    const isInvoiceFinal = Boolean(linkedInvoice && (linkedInvoice.status === 'Final' || linkedInvoice.status === 'Paid'));
    const isInvoiceDraft = Boolean(linkedInvoice && linkedInvoice.status === 'Draft');

    const trackingData = {
      id: row.id,
      ticketNumber: row.ticket_number,
      invoiceId: linkedInvoice ? linkedInvoice.id : null,
      invoiceStatus: linkedInvoice ? linkedInvoice.status : null,
      isInvoiceFinal,
      isInvoiceDraft,
      customerName: maskCustomerName(row.customer_name),
      deviceCategory: row.device_category,
      customDeviceCategory: row.custom_device_category || null,
      brand: row.brand,
      customBrand: row.custom_brand || null,
      modelNumber: row.model_number,
      serialNumber: row.serial_number,
      deviceConfiguration: row.device_configuration,
      problemType: row.problem_type,
      customProblemType: row.custom_problem_type || null,
      serviceType: row.service_type,
      customServiceType: row.custom_service_type || null,
      status: row.status,
      assignedTechnicianId: row.assigned_technician_id,
      technicianName: row.technician_name || null,
      repairCost: parseFloat(row.repair_cost || 0),
      repair_cost: parseFloat(row.repair_cost || 0),
      paymentStatus: row.payment_status || 'unpaid',
      payment_status: row.payment_status || 'unpaid',
      collectionStatus: row.collection_status || 'not_applicable',
      collection_status: row.collection_status || 'not_applicable',
      paymentId: row.payment_id || null,
      payment_id: row.payment_id || null,
      paymentMethod: row.payment_method || null,
      payment_method: row.payment_method || null,
      paidAt: row.paid_at || null,
      paid_at: row.paid_at || null,
      customerRepairDescription: row.customer_repair_description,
      // Diagnosis & Estimation Fields
      diagnosis: row.diagnosis || null,
      identifiedIssues: row.identified_issues || null,
      requiredWork: row.required_work || null,
      estimatedCost: row.estimated_cost !== null && row.estimated_cost !== undefined && Number(row.estimated_cost) > 0 ? parseFloat(row.estimated_cost) : (row.repair_cost ? parseFloat(row.repair_cost) : 0),
      additionalCharges: row.additional_charges ? parseFloat(row.additional_charges) : 0,
      totalEstimatedCost: (row.estimated_cost !== null && row.estimated_cost !== undefined && Number(row.estimated_cost) > 0)
        ? (parseFloat(row.estimated_cost) + (row.additional_charges ? parseFloat(row.additional_charges) : 0))
        : (row.repair_cost ? parseFloat(row.repair_cost) : 0),
      inspectionNotes: row.inspection_notes || null,
      deviceCondition: row.device_condition || null,
      inspectedAt: row.inspected_at || null,
      estimateSubmittedAt: row.estimate_submitted_at || null,
      // Customer Approval & Hold Fields
      customerApprovalStatus: row.customer_approval_status || 'none',
      approvedAt: row.approved_at || null,
      approvedBy: row.approved_by || null,
      approvalNotes: row.approval_notes || null,
      rejectedAt: row.rejected_at || null,
      rejectionReason: row.rejection_reason || null,
      holdStartDate: row.hold_start_date || null,
      holdEndDate: row.hold_end_date || null,
      holdReason: row.hold_reason || null,
      holdNotes: row.hold_notes || null,
      reapprovalRequestedAt: row.reapproval_requested_at || null,
      reapprovalNotes: row.reapproval_notes || null,
      cancellationReason: row.cancellation_reason || null,
      cancelledAt: row.cancelled_at || null,
      cancelledBy: row.cancelled_by || null,
      amountUpdatedByAdmin: Boolean(row.amount_updated_by_admin),
      adminUpdatedAmount: row.admin_updated_amount ? parseFloat(row.admin_updated_amount) : null,
      amountUpdatedAt: row.amount_updated_at || null,
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

    if (request.status !== 'completed' && request.status !== 'delivered') {
      return res.status(400).json(formatResponse(false, 'Notification failed: Status must be completed or delivered to send notification.'));
    }

    if (!request.email) {
      return res.status(400).json(formatResponse(false, 'Customer did not provide an email address.'));
    }

    const isDelivered = request.status === 'delivered';
    // Dispatch email
    const subject = isDelivered
      ? `Your Device Service Summary - TekDoctor [ID: ${request.ticket_number || ('TD-' + request.id)}]`
      : `Your Repair is Ready - TekDoctor [ID: TD-${request.id}]`;
    const html = `
      <h2>Good news, ${request.customer_name}!</h2>
      <p>Your repair for the <strong>${request.brand} ${request.model_number ? request.model_number : ''} (${request.device_category})</strong> ${isDelivered ? 'has been delivered.' : 'has been successfully completed.'}</p>
      <p>${isDelivered ? 'Your service is fulfilled. Thank you for choosing TekDoctor!' : 'Your device is now fully tested and ready for pickup.'}</p>
      <p><strong>Job Ticket ID:</strong> ${request.ticket_number || ('TD-' + request.id)}</p>
      <br/>
      <p>Thank you for trusting TekDoctor!</p>
    `;

    const emailSent = await sendCustomerNotification(request.email, subject, html);

    if (emailSent) {
      // Create Database Notification
      if (request.user_id) {
        const notifTitle = isDelivered ? 'Device Delivered' : 'Repair Ready for Pickup';
        const notifMsg = isDelivered
          ? `Your ${request.brand} device repair has been completed and delivered.`
          : `Your ${request.brand} device is fully repaired and ready.`;
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [request.user_id, notifTitle, notifMsg, request.id, req.user.id]
        );
      }

      logger.info(`Customer notified for ${request.status} repair ID: ${request.id}`);
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
 * Set or update repair charges / payable amount (Admin only)
 * PUT /api/repair-request/:id/charges
 */
const setRepairCharges = async (req, res, next) => {
  let connection;
  try {
    const { id } = req.params;
    const { repairCost, notifyCustomer, notes } = req.body;

    if (repairCost === undefined || repairCost === null || isNaN(Number(repairCost)) || Number(repairCost) < 0) {
      return res.status(400).json(formatResponse(false, 'Please provide a valid non-negative repair charge amount.'));
    }

    const finalAmount = parseFloat(repairCost);

    connection = await pool.getConnection();

    // Check ticket exists
    const [existing] = await connection.query(
      'SELECT id, ticket_number, customer_name, email, mobile, user_id, company_id, brand, model_number, status, repair_cost, payment_status, estimated_cost, additional_charges, customer_approval_status, assigned_technician_id, diagnosis FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const request = existing[0];

    // Immutability rule: Never modify charges if already paid
    if (request.payment_status === 'paid') {
      return res.status(400).json(formatResponse(false, 'Cannot modify repair charges for an already settled/paid ticket.'));
    }

    const oldCost = request.repair_cost ? parseFloat(request.repair_cost) : (request.estimated_cost ? parseFloat(request.estimated_cost) : 0);
    const previousApprovalStatus = request.customer_approval_status || 'none';
    const amountChanged = Math.abs(oldCost - finalAmount) > 0.001;

    // Estimate re-approval handling:
    // If the estimate was already approved and the admin changes the amount, mark as awaiting re-approval
    const isRevised = (previousApprovalStatus === 'approved' && amountChanged);
    const newApprovalStatus = isRevised ? 'pending_approval' : (previousApprovalStatus === 'none' && request.diagnosis ? 'pending_approval' : previousApprovalStatus);
    const revisionNote = isRevised
      ? `Estimate revised from ₹${oldCost.toFixed(2)} to ₹${finalAmount.toFixed(2)} by Admin (${req.user.email}). Awaiting customer re-approval.`
      : (notes || null);

    // Update repair_cost and synchronize estimated_cost in service_requests
    await connection.query(
      `UPDATE service_requests
       SET repair_cost = ?,
           estimated_cost = ?,
           additional_charges = 0,
           amount_updated_by_admin = TRUE,
           admin_updated_amount = ?,
           amount_updated_at = NOW(),
           customer_approval_status = ?,
           approval_notes = COALESCE(?, approval_notes),
           updated_at = NOW()
       WHERE id = ?`,
      [finalAmount, finalAmount, finalAmount, newApprovalStatus, revisionNote, id]
    );

    // Sync technician estimate on any existing draft invoice (never overwrite Final or Paid commercial invoice)
    await connection.query(
      "UPDATE invoices SET original_estimate = ?, updated_at = NOW() WHERE ticket_id = ? AND status = 'Draft'",
      [finalAmount, id]
    );

    const ticketNum = request.ticket_number || `#${request.id}`;
    const deviceName = `${request.brand} ${request.model_number || ''}`.trim();
    logger.info(`Repair charges for ticket ID ${id} (${ticketNum}) set to ₹${finalAmount} by Admin ${req.user.email} (was ₹${oldCost})`);

    // Technician Work Log entry
    try {
      await connection.query(
        `INSERT INTO technician_work_logs (repair_request_id, technician_id, repair_stage, action_performed, notes)
         VALUES (?, ?, 'Admin Cost Update', ?, ?)`,
        [
          id,
          request.assigned_technician_id || (req.user ? req.user.id : 1),
          `Admin updated repair amount from ₹${oldCost.toFixed(2)} to ₹${finalAmount.toFixed(2)}. ${isRevised ? 'Estimate marked for customer re-approval.' : ''}`,
          notes || `Amount finalized by Admin (${req.user.email})`
        ]
      );
    } catch (wlErr) {
      logger.warn('Failed to insert work log on admin cost update: ' + wlErr.message);
    }

    // Audit log
    await logActivity(
      req.user ? req.user.id : null,
      'repair',
      'set_repair_charges',
      'service_requests',
      id,
      {
        oldCost,
        newCost: finalAmount,
        previousApprovalStatus,
        newApprovalStatus,
        isRevised,
        notes: notes || null
      },
      req.ip
    );

    // 1. In-app notification to customer or corporate user
    const recipientUserId = request.user_id || request.company_id;
    if (notifyCustomer !== false && recipientUserId) {
      try {
        const notifTitle = isRevised
          ? `Estimate Revised: ₹${finalAmount.toFixed(2)} [${ticketNum}]`
          : `Repair Charges Finalized: ₹${finalAmount.toFixed(2)} [${ticketNum}]`;
        const notifMessage = isRevised
          ? `Admin has updated the repair estimate for your ${deviceName} to ₹${finalAmount.toFixed(2)} (was ₹${oldCost.toFixed(2)}). Please review and approve the revised estimate so repair work can proceed.`
          : `Admin has finalized the repair charges (₹${finalAmount.toFixed(2)}) for your ${deviceName}. You can now review and proceed with online payment.`;
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [recipientUserId, notifTitle, notifMessage, id, req.user.id]
        );
      } catch (notifErr) {
        logger.warn('Failed to send payment request notification: ' + notifErr.message);
      }
    }

    // 2. Customer email notification if email exists
    if (notifyCustomer !== false && request.email) {
      try {
        const emailSubject = isRevised
          ? `TekDoctor - Revised Repair Estimate [${ticketNum}]`
          : `TekDoctor - Repair Charges Finalized [${ticketNum}]`;
        const emailHtml = `
          <div style="font-family: sans-serif; max-width: 600px; color: #333;">
            <h3 style="color: #00f0ff;">${isRevised ? 'Revised Repair Estimate' : 'Repair Charges Finalized'}</h3>
            <p>Dear ${request.customer_name},</p>
            <p>The repair charges for your device <strong>${deviceName}</strong> (Ticket: <strong>${ticketNum}</strong>) have been updated by Admin.</p>
            <div style="background: #f4f4f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
              ${oldCost > 0 ? `<p style="margin: 0 0 8px 0; color: #71717a;"><strong>Previous Amount:</strong> ₹${oldCost.toFixed(2)}</p>` : ''}
              <p style="margin: 0; font-size: 18px; font-weight: bold; color: #0284c7;"><strong>Authoritative Amount:</strong> ₹${finalAmount.toFixed(2)}</p>
              ${notes ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #52525b;"><strong>Note:</strong> ${notes}</p>` : ''}
            </div>
            <p>${isRevised ? 'Please log in to your account to review and approve the revised estimate so our technician can proceed.' : 'You may now proceed to complete the payment online at your convenience.'}</p>
            <p>Best regards,<br/>The TekDoctor Team</p>
          </div>
        `;
        sendCustomerNotification(request.email, emailSubject, emailHtml).catch(e => logger.warn(`Customer charge update email error: ${e.message}`));
      } catch (emailErr) { }
    }

    // 3. In-app notification to assigned technician
    if (request.assigned_technician_id) {
      try {
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [
            request.assigned_technician_id,
            `Repair Charges Updated by Admin [${ticketNum}]`,
            `Admin has updated the repair charges for Ticket ${ticketNum} (${request.customer_name}) to ₹${finalAmount.toFixed(2)} (was ₹${oldCost.toFixed(2)}). ${isRevised ? 'Estimate awaiting customer re-approval.' : ''}`,
            id,
            req.user.id
          ]
        );
      } catch (techNotifErr) {
        logger.warn('Failed to send technician charge update notification: ' + techNotifErr.message);
      }
    }

    return res.status(200).json(formatResponse(true, `Repair charges updated to ₹${finalAmount.toFixed(2)}.`, {
      id: Number(id),
      ticketNumber: request.ticket_number,
      repairCost: finalAmount,
      repair_cost: finalAmount,
      estimatedCost: finalAmount,
      estimated_cost: finalAmount,
      additionalCharges: 0,
      additional_charges: 0,
      customerApprovalStatus: newApprovalStatus,
      paymentStatus: request.payment_status || 'unpaid',
      amountUpdatedByAdmin: true,
      adminUpdatedAmount: finalAmount,
      amountUpdatedAt: new Date().toISOString()
    }));

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
      customerName, mobile, email, address, city, state, zipCode,
      deviceCategory, customDeviceCategory, brand, customBrand,
      modelNumber, serialNumber, deviceConfiguration,
      problemType, customProblemType, problemDescription,
      serviceType, customServiceType, priority
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

    const finalDeviceCategory = deviceCategory !== undefined ? (deviceCategory ? deviceCategory.trim() : '') : existing[0].device_category;
    const finalCustomDeviceCategory = (finalDeviceCategory && finalDeviceCategory.toLowerCase() === 'other' && customDeviceCategory)
      ? customDeviceCategory.trim()
      : null;

    await connection.query(`
      UPDATE service_requests SET
        customer_name = ?, mobile = ?, email = ?, address = ?, city = ?, state = ?, zip_code = ?,
        device_category = ?, custom_device_category = ?, brand = ?, custom_brand = ?, model_number = ?, 
        serial_number = ?, device_configuration = ?, 
        problem_type = ?, custom_problem_type = ?, problem_description = ?,
        service_type = ?, custom_service_type = ?, priority = ?,
        image_path = ?, screenshot_path = ?
      WHERE id = ?
    `, [
      customerName, mobile, email || null, address || null, city, state || null, zipCode || null,
      finalDeviceCategory, finalCustomDeviceCategory, brand, customBrand || null, modelNumber || null,
      serialNumber || null, deviceConfiguration || null,
      problemType, customProblemType || null, problemDescription || null,
      serviceType || 'Bring to Service Center', customServiceType || null, priority || 'Standard',
      deviceImagePath, screenshotPath,
      id
    ]);

    const repairCostVal = req.body.repairCost !== undefined ? req.body.repairCost : req.body.repair_cost;
    if (repairCostVal !== undefined && !isNaN(Number(repairCostVal)) && Number(repairCostVal) >= 0) {
      const parsedCost = parseFloat(repairCostVal);
      await connection.query(
        `UPDATE service_requests
         SET repair_cost = ?,
             estimated_cost = ?,
             additional_charges = 0,
             amount_updated_by_admin = TRUE,
             admin_updated_amount = ?,
             amount_updated_at = NOW()
         WHERE id = ? AND (payment_status IS NULL OR payment_status != "paid")`,
        [parsedCost, parsedCost, parsedCost, id]
      );
      await connection.query(
        "UPDATE invoices SET original_estimate = ?, updated_at = NOW() WHERE ticket_id = ? AND status = 'Draft'",
        [parsedCost, id]
      );
    }

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

    // Verify request existence
    const [request] = await connection.query(
      'SELECT id, assigned_technician_id, pending_technician_id, user_id FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );
    if (request.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    // Role-based authorization for technicians:
    if (req.user && req.user.role === 'technician') {
      const canAccess = await canTechnicianAccessTicket(req.user.id, request[0], connection);
      if (!canAccess) {
        return res.status(403).json(
          formatResponse(false, 'Unauthorized: You can only view work logs for your authorized repair tickets.')
        );
      }
    }

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
  const rawNote = req.body.customerRepairDescription !== undefined
    ? req.body.customerRepairDescription
    : (req.body.notes !== undefined ? req.body.notes : (req.body.description !== undefined ? req.body.description : req.body.problemDescription));
  const customerRepairDescription = typeof rawNote === 'string' ? rawNote.trim() : (rawNote || null);
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
      [customerRepairDescription, id]
    );

    // Track activity log
    await logActivity(
      req.user.id,
      req.user.role || 'technician',
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

    // Verify role and ownership
    if (req.user.role === 'admin') {
      // Admin allowed according to existing rules
    } else if (req.user.role === 'customer') {
      if (!request.user_id || Number(request.user_id) !== Number(req.user.id)) {
        return res.status(403).json(formatResponse(false, 'Unauthorized to cancel this repair request.'));
      }
    } else if (req.user.role === 'company') {
      const rowCompId = request.company_id ? Number(request.company_id) : null;
      const rowUserId = request.user_id ? Number(request.user_id) : null;
      const reqUserId = Number(req.user.id);
      if (rowCompId !== reqUserId && rowUserId !== reqUserId) {
        return res.status(403).json(formatResponse(false, 'Unauthorized to cancel this corporate repair request.'));
      }
    } else {
      // Technicians and unauthorized roles are denied
      return res.status(403).json(formatResponse(false, 'Unauthorized to cancel this repair request.'));
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

    if (['completed', 'delivered', 'cancelled'].includes(rows[0].status)) {
      return res.status(400).json(formatResponse(false, 'Cannot transfer a completed, delivered, or cancelled ticket.'));
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
        return res.status(403).json(formatResponse(false, 'You do not have permission to view this transfer history.'));
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
    if (comment && typeof comment === 'string' && comment.trim().length > 500) {
      return res.status(400).json(formatResponse(false, 'Feedback comment cannot exceed 500 characters.'));
    }

    connection = await pool.getConnection();

    const [existing] = await connection.query(
      'SELECT status, feedback_rating, user_id, assigned_technician_id, ticket_number FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const request = existing[0];

    if (request.status !== 'completed' && request.status !== 'delivered') {
      return res.status(400).json(formatResponse(false, 'Feedback can only be submitted for completed or delivered requests.'));
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
      const ticketRef = request.ticket_number || id;
      const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin'");
      const notificationTitle = `New Service Feedback [Ticket ${ticketRef}]`;
      const notificationMessage = `A customer submitted a ${rating}-star review for their repair.`;

      for (const admin of admins) {
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [admin.id, notificationTitle, notificationMessage, id, req.user.id]
        );
      }

      // Also notify assigned technician
      if (request.assigned_technician_id) {
        const techNotificationTitle = `Customer Feedback Received [Ticket ${ticketRef}]`;
        const techNotificationMessage = `Customer rated your completed service ${rating} star${rating > 1 ? 's' : ''}${comment ? `: "${comment}"` : '.'}`;
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
          [request.assigned_technician_id, techNotificationTitle, techNotificationMessage, id, req.user.id]
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

/**
 * Submit Technician Device Diagnosis & Cost Estimate
 * POST /api/repair-request/:id/diagnosis
 */
const submitDiagnosis = async (req, res, next) => {
  const { id } = req.params;
  const {
    diagnosis,
    identifiedIssues,
    requiredWork,
    requiredParts,
    estimatedCost,
    additionalCharges,
    estimatedCompletionDate,
    inspectionNotes,
    deviceCondition
  } = req.body;
  let connection;

  try {
    if (!diagnosis || diagnosis.trim() === '') {
      return res.status(400).json(formatResponse(false, 'Diagnosis / identified problem is required.'));
    }

    const rawEstCost = req.body.estimatedCost !== undefined ? req.body.estimatedCost : req.body.estimated_cost;
    const rawAddCharges = req.body.additionalCharges !== undefined ? req.body.additionalCharges : req.body.additional_charges;

    if (rawEstCost === undefined || rawEstCost === null || String(rawEstCost).trim() === '' || isNaN(Number(rawEstCost)) || Number(rawEstCost) < 0) {
      return res.status(400).json(formatResponse(false, 'Valid non-negative estimated repair cost is required.'));
    }

    const estCostNum = parseFloat(rawEstCost);
    if (!isFinite(estCostNum) || estCostNum > 10000000) {
      return res.status(400).json(formatResponse(false, 'Estimated repair cost cannot exceed ₹10,000,000.'));
    }
    const costParts = String(rawEstCost).split('.');
    if (costParts.length === 2 && costParts[1].length > 2) {
      return res.status(400).json(formatResponse(false, 'Estimated repair cost cannot exceed 2 decimal places.'));
    }

    const addChargesNum = (rawAddCharges !== undefined && rawAddCharges !== null && String(rawAddCharges).trim() !== '')
      ? parseFloat(rawAddCharges)
      : 0;

    if (isNaN(addChargesNum) || !isFinite(addChargesNum) || addChargesNum < 0 || addChargesNum > 10000000) {
      return res.status(400).json(formatResponse(false, 'Valid non-negative additional charges amount (up to ₹10,000,000) is required.'));
    }
    const addParts = String(rawAddCharges).split('.');
    if (addParts.length === 2 && addParts[1].length > 2) {
      return res.status(400).json(formatResponse(false, 'Additional charges cannot exceed 2 decimal places.'));
    }

    const totalEstimated = Math.round((estCostNum + addChargesNum) * 100) / 100;

    connection = await pool.getConnection();

    const [existing] = await connection.query(
      'SELECT * FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const request = existing[0];

    // Role verification: check ownership first to prevent 400 leaks and return 403 Forbidden
    if (req.user && req.user.role === 'technician') {
      if (Number(request.assigned_technician_id) !== Number(req.user.id)) {
        return res.status(403).json(
          formatResponse(false, "Unauthorized: You can only submit diagnosis for your own assigned tasks.")
        );
      }

      // If customer has already approved the estimate, technician cannot overwrite it
      if (request.customer_approval_status === 'approved') {
        return res.status(400).json(
          formatResponse(false, 'Estimate has already been approved by the customer and is locked. Contact an Administrator if a revision is required.')
        );
      }
    }

    if (request.status === 'cancelled') {
      return res.status(400).json(formatResponse(false, 'Cannot submit diagnosis for a cancelled repair request.'));
    }

    if (request.payment_status === 'paid') {
      return res.status(400).json(formatResponse(false, 'Cannot modify estimate for an already paid and settled repair ticket.'));
    }

    if (request.status === 'completed' || request.status === 'delivered') {
      return res.status(400).json(formatResponse(false, 'Cannot submit estimate for an already completed repair request.'));
    }

    // Update service request
    await connection.query(`
      UPDATE service_requests
      SET diagnosis = ?,
          identified_issues = ?,
          required_work = ?,
          required_parts = ?,
          estimated_cost = ?,
          additional_charges = ?,
          repair_cost = ?,
          inspection_notes = ?,
          device_condition = ?,
          inspected_at = NOW(),
          estimate_submitted_at = NOW(),
          customer_approval_status = 'pending_approval',
          hold_start_date = NULL,
          hold_end_date = NULL,
          hold_reason = NULL,
          hold_notes = NULL,
          estimated_completion_date = ?
      WHERE id = ?
    `, [
      diagnosis.trim(),
      identifiedIssues ? identifiedIssues.trim() : null,
      requiredWork ? requiredWork.trim() : null,
      requiredParts ? requiredParts.trim() : null,
      estCostNum,
      addChargesNum,
      totalEstimated,
      inspectionNotes ? inspectionNotes.trim() : null,
      deviceCondition ? deviceCondition.trim() : null,
      estimatedCompletionDate || null,
      id
    ]);

    const ticketNum = request.ticket_number || `#${request.id}`;
    const deviceName = `${request.brand} ${request.model_number || ''}`.trim();
    const formattedCostStr = `₹${totalEstimated.toFixed(2)}`;

    // Create a direct message in messages table
    const estimateMessageText = `Sir, your device has the following issues: ${diagnosis.trim()}.${requiredWork ? ` Required Work: ${requiredWork.trim()}.` : ''} The estimated repair cost is ${formattedCostStr}. Please review the estimate and approve it if it is within your budget.`;
    
    // Create direct messages and notifications for customer/company recipients
    const recipientUserIds = new Set();
    if (request.company_id) recipientUserIds.add(request.company_id);
    if (request.user_id) recipientUserIds.add(request.user_id);

    for (const recipientId of recipientUserIds) {
      try {
        await connection.query(`
          INSERT INTO messages (repair_request_id, sender_id, receiver_id, message)
          VALUES (?, ?, ?, ?)
        `, [
          id,
          req.user ? req.user.id : request.assigned_technician_id || 1,
          recipientId,
          estimateMessageText
        ]);
      } catch (msgErr) {
        logger.warn(`Failed to insert diagnosis message: ${msgErr.message}`);
      }

      // In-app notification
      try {
        await connection.query(`
          INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
          VALUES (?, ?, ?, ?, ?)
        `, [
          recipientId,
          `A repair budget is ready for your approval [${ticketNum}]`,
          `Diagnosis completed for ${deviceName}. Estimated repair cost: ${formattedCostStr}. Please review and approve your estimate.`,
          id,
          req.user ? req.user.id : null
        ]);
      } catch (notifErr) {
        logger.warn(`Failed to create estimate notification: ${notifErr.message}`);
      }
    }

    // Customer email notification
    if (request.email) {
      try {
        const config = require('../config/app.config');
        const frontendBaseUrl = config.frontend?.url || config.server?.publicOrigin || '';

        const approvalToken = generateEstimateActionToken({
          ticketId: id,
          ticketNumber: ticketNum,
          action: 'approve_estimate',
          email: request.email
        });
        const rejectionToken = generateEstimateActionToken({
          ticketId: id,
          ticketNumber: ticketNum,
          action: 'reject_estimate',
          email: request.email
        });

        const approveUrl = `${frontendBaseUrl}/repair/status?id=${encodeURIComponent(ticketNum)}&action=approve&token=${encodeURIComponent(approvalToken)}`;
        const rejectUrl = `${frontendBaseUrl}/repair/status?id=${encodeURIComponent(ticketNum)}&action=reject&token=${encodeURIComponent(rejectionToken)}`;
        const trackingUrl = `${frontendBaseUrl}/repair/status?id=${encodeURIComponent(ticketNum)}`;

        const emailSubject = `TekDoctor - Repair Diagnosis & Estimate Ready [${ticketNum}]`;
        const emailHtml = `
          <div style="font-family: sans-serif; max-width: 600px; color: #333; line-height: 1.5;">
            <div style="background: #09090b; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
              <h2 style="color: #00f0ff; margin: 0; font-family: monospace; letter-spacing: 2px;">TEKDOCTOR SERVICE</h2>
            </div>
            <div style="background: #ffffff; padding: 24px; border: 1px solid #e4e4e7; border-radius: 0 0 8px 8px;">
              <h3 style="color: #09090b; margin-top: 0;">Repair Diagnosis & Cost Estimate</h3>
              <p>Dear ${request.customer_name},</p>
              <p>Our technician has inspected your device <strong>${deviceName}</strong> (Ticket: <strong>${ticketNum}</strong>).</p>
              <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #00f0ff;">
                <p style="margin: 0 0 8px 0;"><strong>Diagnosis:</strong> ${diagnosis.trim()}</p>
                ${identifiedIssues ? `<p style="margin: 0 0 8px 0;"><strong>Identified Issues:</strong> ${identifiedIssues.trim()}</p>` : ''}
                ${requiredWork ? `<p style="margin: 0 0 8px 0;"><strong>Required Work:</strong> ${requiredWork.trim()}</p>` : ''}
                ${requiredParts ? `<p style="margin: 0 0 8px 0;"><strong>Parts Required:</strong> ${requiredParts.trim()}</p>` : ''}
                <p style="margin: 0 0 8px 0;"><strong>Estimated Repair Cost:</strong> ₹${estCostNum.toFixed(2)}</p>
                ${addChargesNum > 0 ? `<p style="margin: 0 0 8px 0;"><strong>Additional Charges:</strong> ₹${addChargesNum.toFixed(2)}</p>` : ''}
                <p style="margin: 0; font-size: 16px; font-weight: bold; color: #0284c7;"><strong>Total Estimate:</strong> ${formattedCostStr}</p>
              </div>

              <div style="margin: 24px 0; text-align: center;">
                <a href="${approveUrl}" style="background: #10b981; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block; margin-right: 12px; margin-bottom: 8px;">
                  Approve Estimate (${formattedCostStr})
                </a>
                <a href="${rejectUrl}" style="background: #ef4444; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 6px; font-weight: bold; display: inline-block; margin-bottom: 8px;">
                  Decline Estimate
                </a>
              </div>

              <p style="font-size: 13px; color: #71717a;">
                You can also track real-time progress or sign in to your customer dashboard at: <br/>
                <a href="${trackingUrl}" style="color: #0284c7;">${trackingUrl}</a>
              </p>
              <p style="font-size: 12px; color: #a1a1aa; margin-top: 24px;">
                Note: This estimate authorization link is valid for 7 days. If you did not request this service, please ignore this email.
              </p>
              <p style="margin-top: 20px;">Best regards,<br/><strong>The TekDoctor Service Team</strong></p>
            </div>
          </div>
        `;
        sendCustomerNotification(request.email, emailSubject, emailHtml).catch(e => logger.warn(`Customer estimate email error: ${e.message}`));
      } catch (emailErr) { }
    }

    // Admin in-app notification
    try {
      const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin'");
      for (const admin of admins) {
        if (!req.user || req.user.id !== admin.id) {
          await connection.query(`
            INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
            VALUES (?, ?, ?, ?, ?)
          `, [
            admin.id,
            `Diagnosis & Estimate Submitted [${ticketNum}]`,
            `Technician submitted estimate of ${formattedCostStr} for ticket ${ticketNum} (${request.customer_name}). Awaiting customer approval.`,
            id,
            req.user ? req.user.id : null
          ]);
        }
      }
    } catch (adminNotifErr) { }

    // Work log
    try {
      const isRevision = request.customer_approval_status === 'rejected' ||
                         request.customer_approval_status === 'reapproval_requested' ||
                         (request.estimated_cost && Number(request.estimated_cost) > 0);
      const stageName = isRevision ? 'Estimate Revised' : 'Diagnosis & Estimation';
      const actionText = isRevision
        ? `Submitted revised estimate: ${formattedCostStr}. Diagnosis: "${diagnosis.substring(0, 100)}".`
        : `Submitted diagnosis: "${diagnosis.substring(0, 100)}". Estimate: ${formattedCostStr}.`;

      await connection.query(`
        INSERT INTO technician_work_logs (repair_request_id, technician_id, repair_stage, action_performed, parts_replaced, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        id,
        req.user ? req.user.id : request.assigned_technician_id,
        stageName,
        actionText,
        requiredParts || null,
        inspectionNotes || null
      ]);
    } catch (wlErr) { }

    // Activity log
    await logActivity(
      req.user ? req.user.id : null,
      'repair',
      'submit_diagnosis_estimate',
      'service_requests',
      id,
      {
        ticketNumber: ticketNum,
        estimatedCost: estCostNum,
        additionalCharges: addChargesNum,
        total: totalEstimated,
        diagnosis
      },
      req.ip
    );

    return res.status(200).json(formatResponse(true, 'Diagnosis and estimate submitted successfully.', {
      id: Number(id),
      diagnosis,
      identifiedIssues,
      requiredWork,
      requiredParts,
      estimatedCost: estCostNum,
      additionalCharges: addChargesNum,
      repairCost: totalEstimated,
      repair_cost: totalEstimated,
      totalEstimatedCost: totalEstimated,
      totalEstimated,
      customerApprovalStatus: 'pending_approval'
    }));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Customer / Company approves technician estimate
 * POST /api/repair-request/:id/approve-estimate
 */
const approveEstimate = async (req, res, next) => {
  const { id } = req.params;
  const { notes } = req.body || {};
  let connection;

  try {
    connection = await pool.getConnection();

    const [existing] = await connection.query(
      'SELECT * FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const request = existing[0];

    // 1. Authoritative Ownership & Role Authorization Check
    const authResult = verifyEstimateAuthorization(req, request, 'approve_estimate');
    if (!authResult.authorized) {
      return res.status(authResult.statusCode || 403).json(formatResponse(false, authResult.error || 'Unauthorized'));
    }

    // 2. State Eligibility Guards
    if (request.status === 'cancelled') {
      return res.status(400).json(formatResponse(false, 'Cannot approve estimate for a cancelled repair request.'));
    }

    if (request.payment_status === 'paid') {
      return res.status(400).json(formatResponse(false, 'This repair ticket has already been paid and settled.'));
    }

    if (request.status === 'completed' || request.status === 'delivered') {
      return res.status(400).json(formatResponse(false, 'Cannot approve estimate for an already completed repair request.'));
    }

    // Check if estimate exists
    if (!request.diagnosis && (!request.estimated_cost || Number(request.estimated_cost) <= 0)) {
      return res.status(400).json(formatResponse(false, 'No estimate has been submitted for this ticket yet.'));
    }

    // Prevent duplicate approval / replay
    if (request.customer_approval_status === 'approved') {
      return res.status(400).json(formatResponse(false, 'Estimate is already approved.'));
    }

    const allowedApprovalStatuses = ['pending_approval', 'on_hold', 'reapproval_requested', 'none'];
    if (!allowedApprovalStatuses.includes(request.customer_approval_status)) {
      return res.status(400).json(formatResponse(false, `Ticket cannot be approved from current approval status: ${request.customer_approval_status}.`));
    }

    // Update approval status, exit hold if applicable, and move status to in_progress
    const approverUserId = req.user ? req.user.id : (authResult.userId || request.user_id || null);
    await connection.query(`
      UPDATE service_requests
      SET customer_approval_status = 'approved',
          approved_at = NOW(),
          approved_by = ?,
          approval_notes = ?,
          status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
          hold_start_date = NULL,
          hold_end_date = NULL,
          hold_reason = NULL,
          hold_notes = NULL
      WHERE id = ?
    `, [approverUserId, notes || null, id]);

    const ticketNum = request.ticket_number || `#${request.id}`;
    const totalCostStr = `₹${(parseFloat(request.repair_cost || request.estimated_cost || 0)).toFixed(2)}`;

    // 1. Notify Assigned Technician
    if (request.assigned_technician_id) {
      try {
        await connection.query(`
          INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
          VALUES (?, ?, ?, ?, ?)
        `, [
          request.assigned_technician_id,
          `Estimate Approved [${ticketNum}]`,
          `Customer ${request.customer_name} has APPROVED the repair estimate of ${totalCostStr}. You may now proceed with the repair.`,
          id,
          req.user ? req.user.id : null
        ]);
      } catch (notifErr) { }
    }

    // 2. Notify Admins
    try {
      const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin'");
      for (const admin of admins) {
        await connection.query(`
          INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
          VALUES (?, ?, ?, ?, ?)
        `, [
          admin.id,
          `Estimate Approved [${ticketNum}]`,
          `Estimate of ${totalCostStr} for ticket ${ticketNum} (${request.customer_name}) was approved by the customer.`,
          id,
          req.user ? req.user.id : null
        ]);
      }
    } catch (notifErr) { }

    // 3. Work Log
    try {
      await connection.query(`
        INSERT INTO technician_work_logs (repair_request_id, technician_id, repair_stage, action_performed, notes)
        VALUES (?, ?, 'Estimate Approved', 'Customer approved estimated repair cost. Authorized to proceed with repair.', ?)
      `, [
        id,
        request.assigned_technician_id || (req.user ? req.user.id : 1),
        notes || null
      ]);
    } catch (wlErr) { }

    // 4. Activity Log
    await logActivity(
      req.user ? req.user.id : null,
      'repair',
      'approve_estimate',
      'service_requests',
      id,
      {
        ticketNumber: ticketNum,
        customerName: request.customer_name,
        amount: request.repair_cost || request.estimated_cost,
        notes
      },
      req.ip
    );

    return res.status(200).json(formatResponse(true, 'Estimate approved successfully. Technician has been authorized to proceed with repair.'));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Customer / Company rejects technician estimate
 * POST /api/repair-request/:id/reject-estimate
 */
const rejectEstimate = async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  let connection;

  try {
    connection = await pool.getConnection();

    const [existing] = await connection.query(
      'SELECT * FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const request = existing[0];

    // 1. Authoritative Ownership & Role Authorization Check
    const authResult = verifyEstimateAuthorization(req, request, 'reject_estimate');
    if (!authResult.authorized) {
      return res.status(authResult.statusCode || 403).json(formatResponse(false, authResult.error || 'Unauthorized'));
    }

    // 2. Validate Rejection Reason
    let cleanReason = (reason && typeof reason === 'string') ? reason.trim() : '';
    if (cleanReason.length > 500) {
      return res.status(400).json(formatResponse(false, 'Rejection reason cannot exceed 500 characters.'));
    }
    if (!cleanReason) {
      cleanReason = 'Estimate declined by customer';
    }

    // 3. State Eligibility Guards
    if (request.status === 'cancelled') {
      return res.status(400).json(formatResponse(false, 'Cannot reject estimate for a cancelled repair request.'));
    }

    if (request.payment_status === 'paid') {
      return res.status(400).json(formatResponse(false, 'Cannot reject estimate for a paid repair request. This repair ticket has already been paid and settled.'));
    }

    if (request.status === 'completed' || request.status === 'delivered') {
      return res.status(400).json(formatResponse(false, 'Cannot reject estimate for an already completed repair request.'));
    }

    // Prevent duplicate rejection / replay
    if (request.customer_approval_status === 'rejected') {
      return res.status(400).json(formatResponse(false, 'Estimate has already been rejected.'));
    }

    if (request.customer_approval_status === 'approved') {
      return res.status(400).json(formatResponse(false, 'Cannot reject an already approved estimate. Please contact customer support.'));
    }

    // Check if estimate exists
    if (!request.diagnosis && (!request.estimated_cost || Number(request.estimated_cost) <= 0)) {
      return res.status(400).json(formatResponse(false, 'No estimate has been submitted for this ticket to decline.'));
    }

    // Update rejection status with 3-day hold period for reconsideration
    await connection.query(`
      UPDATE service_requests
      SET customer_approval_status = 'rejected',
          rejected_at = NOW(),
          rejection_reason = ?,
          hold_start_date = NOW(),
          hold_end_date = DATE_ADD(NOW(), INTERVAL 3 DAY),
          hold_reason = ?
      WHERE id = ?
    `, [
      cleanReason,
      `Estimate declined by customer: ${cleanReason}`,
      id
    ]);

    // Record rejection in work logs
    try {
      await connection.query(`
        INSERT INTO technician_work_logs (repair_request_id, technician_id, repair_stage, action_performed, notes)
        VALUES (?, ?, 'Estimate Rejected', 'Customer declined repair quotation. Ticket placed on hold for reconsideration.', ?)
      `, [
        id,
        request.assigned_technician_id || (req.user ? req.user.id : 1),
        reason || 'No specific reason provided'
      ]);
    } catch (wlErr) { }

    const ticketNum = request.ticket_number || `#${request.id}`;

    // 1. Notify Assigned Technician
    if (request.assigned_technician_id) {
      try {
        await connection.query(`
          INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
          VALUES (?, ?, ?, ?, ?)
        `, [
          request.assigned_technician_id,
          `Estimate Rejected [${ticketNum}]`,
          `Customer ${request.customer_name} has REJECTED the repair estimate. Reason: ${reason || 'Not specified'}. Repair cannot proceed without customer authorization.`,
          id,
          req.user ? req.user.id : null
        ]);
      } catch (notifErr) { }
    }

    // 2. Notify Admins
    try {
      const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin'");
      for (const admin of admins) {
        await connection.query(`
          INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
          VALUES (?, ?, ?, ?, ?)
        `, [
          admin.id,
          `Estimate Rejected [${ticketNum}]`,
          `Customer ${request.customer_name} rejected the estimate for ticket ${ticketNum}. Reason: ${reason || 'Not specified'}.`,
          id,
          req.user ? req.user.id : null
        ]);
      }
    } catch (notifErr) { }

    // 3. Activity Log
    await logActivity(
      req.user ? req.user.id : null,
      'repair',
      'reject_estimate',
      'service_requests',
      id,
      {
        ticketNumber: ticketNum,
        customerName: request.customer_name,
        reason
      },
      req.ip
    );

    return res.status(200).json(formatResponse(true, 'Estimate rejected. Admin and technician have been notified.'));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Admin places ticket on hold for 2 to 5 days
 * POST /api/repair-request/:id/hold
 */
const placeTicketOnHold = async (req, res, next) => {
  const { id } = req.params;
  const { holdDays = 3, holdReason, holdNotes } = req.body;
  let connection;

  try {
    const days = parseInt(holdDays, 10);
    if (isNaN(days) || days < 2 || days > 5) {
      return res.status(400).json(formatResponse(false, 'Hold duration must be between 2 and 5 days.'));
    }

    connection = await pool.getConnection();

    const [existing] = await connection.query(
      'SELECT * FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const request = existing[0];

    if (['completed', 'delivered', 'cancelled'].includes(request.status)) {
      return res.status(400).json(formatResponse(false, 'Cannot place a completed, delivered, or cancelled ticket on hold.'));
    }

    if (request.payment_status === 'paid') {
      return res.status(400).json(formatResponse(false, 'Cannot place a paid repair ticket on hold. This repair ticket has already been paid and settled.'));
    }

    // Set hold deadline: NOW() + INTERVAL ? DAY
    await connection.query(`
      UPDATE service_requests
      SET customer_approval_status = 'on_hold',
          hold_start_date = NOW(),
          hold_end_date = DATE_ADD(NOW(), INTERVAL ? DAY),
          hold_reason = ?,
          hold_notes = ?
      WHERE id = ?
    `, [
      days,
      holdReason || 'Awaiting customer approval on repair estimate',
      holdNotes || null,
      id
    ]);

    // Fetch updated hold_end_date for exact response
    const [[updated]] = await connection.query('SELECT hold_end_date FROM service_requests WHERE id = ?', [id]);
    const deadlineStr = new Date(updated.hold_end_date).toLocaleString();
    const ticketNum = request.ticket_number || `#${request.id}`;

    // 1. In-App Notification to Customer
    if (request.user_id) {
      try {
        await connection.query(`
          INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
          VALUES (?, ?, ?, ?, ?)
        `, [
          request.user_id,
          `Repair On Hold [${ticketNum}]`,
          `Your repair request is on hold until ${deadlineStr} awaiting your estimate approval. Please approve your estimate before the deadline to avoid ticket cancellation.`,
          id,
          req.user ? req.user.id : null
        ]);
      } catch (notifErr) { }
    }

    // 2. Email Notification to Customer
    if (request.email) {
      try {
        const emailSubject = `TekDoctor - Action Required: Repair Ticket On Hold [${ticketNum}]`;
        const emailHtml = `
          <div style="font-family: sans-serif; max-width: 600px; color: #333;">
            <h3 style="color: #f59e0b;">Repair On Hold — Approval Needed</h3>
            <p>Dear ${request.customer_name},</p>
            <p>Your repair service ticket <strong>${ticketNum}</strong> for <strong>${request.brand} ${request.model_number || ''}</strong> has been placed on hold.</p>
            <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <p style="margin: 0 0 5px 0;"><strong>Hold Reason:</strong> ${holdReason || 'Awaiting estimate approval'}</p>
              <p style="margin: 0; font-weight: bold; color: #b45309;"><strong>Approval Deadline:</strong> ${deadlineStr} (${days} days)</p>
            </div>
            <p>Please log in to review and approve the repair estimate before the deadline. If not approved within this period, the ticket will be automatically cancelled.</p>
            <p>Best regards,<br/>The TekDoctor Service Team</p>
          </div>
        `;
        sendCustomerNotification(request.email, emailSubject, emailHtml).catch(e => logger.warn(`Customer hold email error: ${e.message}`));
      } catch (emailErr) { }
    }

    // 3. In-App Notification to Assigned Technician
    if (request.assigned_technician_id) {
      try {
        await connection.query(`
          INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
          VALUES (?, ?, ?, ?, ?)
        `, [
          request.assigned_technician_id,
          `Ticket Placed On Hold [${ticketNum}]`,
          `Ticket ${ticketNum} (${request.customer_name}) has been placed on hold for ${days} days until ${deadlineStr}.`,
          id,
          req.user ? req.user.id : null
        ]);
      } catch (notifErr) { }
    }

    // 4. Activity Log
    await logActivity(
      req.user ? req.user.id : null,
      'repair',
      'place_ticket_on_hold',
      'service_requests',
      id,
      {
        ticketNumber: ticketNum,
        holdDays: days,
        holdEndDate: updated.hold_end_date,
        holdReason,
        holdNotes
      },
      req.ip
    );

    return res.status(200).json(formatResponse(true, `Ticket placed on hold for ${days} days until ${deadlineStr}.`, {
      id: Number(id),
      holdDays: days,
      holdStartDate: new Date().toISOString(),
      holdEndDate: updated.hold_end_date,
      customerApprovalStatus: 'on_hold'
    }));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Admin cancels hold on ticket
 * POST /api/repair-request/:id/cancel-hold
 */
const cancelHold = async (req, res, next) => {
  const { id } = req.params;
  let connection;

  try {
    connection = await pool.getConnection();

    const [existing] = await connection.query(
      'SELECT * FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const request = existing[0];

    await connection.query(`
      UPDATE service_requests
      SET customer_approval_status = CASE WHEN customer_approval_status = 'on_hold' THEN 'pending_approval' ELSE customer_approval_status END,
          hold_start_date = NULL,
          hold_end_date = NULL,
          hold_reason = NULL,
          hold_notes = NULL
      WHERE id = ?
    `, [id]);

    await logActivity(
      req.user ? req.user.id : null,
      'repair',
      'cancel_ticket_hold',
      'service_requests',
      id,
      { ticketNumber: request.ticket_number },
      req.ip
    );

    return res.status(200).json(formatResponse(true, 'Hold on ticket has been cancelled. Ticket returned to active pending status.', {
      id: Number(id),
      customerApprovalStatus: 'pending_approval'
    }));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Customer / Company requests repair again after previous estimate rejection or on-hold status
 * POST /api/repair-request/:id/request-repair-again
 */
const requestRepairAgain = async (req, res, next) => {
  const { id } = req.params;
  const { comment } = req.body || {};
  let connection;

  try {
    connection = await pool.getConnection();

    const [existing] = await connection.query(
      'SELECT * FROM service_requests WHERE id = ? LIMIT 1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json(formatResponse(false, 'Repair request not found.'));
    }

    const request = existing[0];

    // Ownership / Authorization Check
    const authResult = verifyEstimateAuthorization(req, request, 'reject_estimate');
    if (!authResult.authorized) {
      // Also allow if caller holds an approve_estimate token
      const authApprove = verifyEstimateAuthorization(req, request, 'approve_estimate');
      if (!authApprove.authorized) {
        return res.status(authResult.statusCode || 401).json(formatResponse(false, authResult.error || 'Authentication required to request re-evaluation.'));
      }
    }

    // State Eligibility Guards
    if (request.status === 'cancelled') {
      return res.status(400).json(formatResponse(false, 'Cannot request repair again for a cancelled ticket. Please submit a new service request.'));
    }

    if (request.payment_status === 'paid') {
      return res.status(400).json(formatResponse(false, 'This repair ticket has already been paid and settled.'));
    }

    if (request.status === 'completed' || request.status === 'delivered') {
      return res.status(400).json(formatResponse(false, 'This repair ticket has already been completed.'));
    }

    if (request.customer_approval_status === 'reapproval_requested') {
      return res.status(400).json(formatResponse(false, 'You have already requested to proceed with this repair. Our engineering team has been notified.'));
    }

    // Allowed states to request again: rejected, on_hold, pending_approval (or none if estimate existed)
    const allowedPriorStates = ['rejected', 'on_hold', 'pending_approval', 'none'];
    if (!allowedPriorStates.includes(request.customer_approval_status)) {
      return res.status(400).json(formatResponse(false, `Ticket cannot be re-approved in current approval status: ${request.customer_approval_status}.`));
    }

    if (comment && typeof comment === 'string' && comment.trim().length > 500) {
      return res.status(400).json(formatResponse(false, 'Revision request note cannot exceed 500 characters.'));
    }

    const userComment = (comment && typeof comment === 'string') ? comment.trim() : '';
    const previousStatus = request.customer_approval_status || 'none';

    // Update approval state, clear hold, and record re-approval request
    await connection.query(`
      UPDATE service_requests
      SET customer_approval_status = 'reapproval_requested',
          reapproval_requested_at = NOW(),
          reapproval_notes = ?,
          hold_start_date = NULL,
          hold_end_date = NULL,
          hold_reason = NULL,
          hold_notes = NULL
      WHERE id = ?
    `, [userComment || 'Customer requested to proceed with repair', id]);

    const ticketNum = request.ticket_number || `#${request.id}`;

    // 1. Notify Assigned Technician
    if (request.assigned_technician_id) {
      try {
        const notifTitle = previousStatus === 'pending_approval'
          ? `Estimate Revision Requested [${ticketNum}]`
          : `Repair Re-Approval Requested [${ticketNum}]`;
        const notifMsg = previousStatus === 'pending_approval'
          ? `Customer ${request.customer_name} has requested an estimate revision for ticket ${ticketNum}. Note: ${userComment || 'None provided'}.`
          : `Customer ${request.customer_name} has requested to proceed with repair for ticket ${ticketNum} (previous decision: ${previousStatus}). Note: ${userComment || 'None provided'}.`;

        await connection.query(`
          INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
          VALUES (?, ?, ?, ?, ?)
        `, [
          request.assigned_technician_id,
          notifTitle,
          notifMsg,
          id,
          req.user ? req.user.id : null
        ]);
      } catch (notifErr) { }
    }

    // 2. Notify Admins
    try {
      const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin'");
      const adminTitle = previousStatus === 'pending_approval'
        ? `Customer Requested Estimate Revision [${ticketNum}]`
        : `Customer Requested Repair Again [${ticketNum}]`;
      const adminMsg = previousStatus === 'pending_approval'
        ? `Customer ${request.customer_name} requested estimate revision for ticket ${ticketNum}. Note: ${userComment || 'None provided'}.`
        : `Customer ${request.customer_name} requested repair again for ticket ${ticketNum}. Previous decision: ${previousStatus}. Note: ${userComment || 'None provided'}.`;

      for (const admin of admins) {
        await connection.query(`
          INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
          VALUES (?, ?, ?, ?, ?)
        `, [
          admin.id,
          adminTitle,
          adminMsg,
          id,
          req.user ? req.user.id : null
        ]);
      }
    } catch (notifErr) { }

    // 3. Work Log
    try {
      const stage = previousStatus === 'pending_approval' ? 'Revision Requested' : 'Re-Approval Requested';
      const action = previousStatus === 'pending_approval'
        ? 'Customer Requested Estimate Revision'
        : 'Customer Requested Repair Re-Approval (proceed with repair after rejection/hold)';

      await connection.query(`
        INSERT INTO technician_work_logs (repair_request_id, technician_id, repair_stage, action_performed, notes)
        VALUES (?, ?, ?, ?, ?)
      `, [
        id,
        request.assigned_technician_id || (req.user ? req.user.id : 1),
        stage,
        action,
        userComment ? `Customer note: ${userComment}` : 'Customer requested revision/re-evaluation'
      ]);
    } catch (wlErr) { }

    // 4. Activity Log
    await logActivity(
      req.user ? req.user.id : null,
      'repair',
      'request_repair_again',
      'service_requests',
      id,
      {
        ticketNumber: ticketNum,
        customerName: request.customer_name,
        previousStatus,
        notes: userComment
      },
      req.ip
    );

    return res.status(200).json(formatResponse(true, 'Your request to proceed with the repair has been submitted. Our engineering team has been notified.', {
      id: Number(id),
      customerApprovalStatus: 'reapproval_requested',
      reapprovalRequestedAt: new Date().toISOString(),
      reapprovalNotes: userComment || 'Customer requested to proceed with repair'
    }));

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
  bulkDeleteRepairRequests,
  setRepairCharges,
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
  submitFeedback,
  submitDiagnosis,
  approveEstimate,
  rejectEstimate,
  placeTicketOnHold,
  cancelHold,
  requestRepairAgain
};
