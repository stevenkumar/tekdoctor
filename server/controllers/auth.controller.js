const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const { logActivity } = require('../utils/activity.logger');
const { generateToken } = require('../utils/auth.helpers');
const { sendCustomerNotification } = require('../utils/email.utils');
const { verifyGoogleIdentity, getGoogleConfig } = require('../utils/google.auth');
const { normalizePhoneNumber } = require('../middleware/validate.middleware');

/**
 * Handle new user registration (SignUp)
 */
const signup = async (req, res, next) => {
  const { name, email, password, phone } = req.body;
  let connection;

  try {
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    const cleanPhone = phone ? normalizePhoneNumber(phone) : null;
    connection = await pool.getConnection();

    // Check if user already exists with this email
    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [cleanEmail]
    );

    if (existingUsers.length > 0) {
      const resp = formatResponse(false, 'This email address is already registered. Please use a different email address.');
      resp.errors = { email: 'This email address is already registered. Please use a different email address.' };
      return res.status(400).json(resp);
    }

    // Check if phone number is already registered
    if (cleanPhone) {
      const [existingPhone] = await connection.query(
        'SELECT id FROM users WHERE phone = ? LIMIT 1',
        [cleanPhone]
      );
      if (existingPhone.length > 0) {
        const resp = formatResponse(false, 'This phone number is already registered. Please use a different phone number.');
        resp.errors = { phone: 'This phone number is already registered. Please use a different phone number.' };
        return res.status(400).json(resp);
      }
    }

    // Hash the password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Public registration must never create privileged accounts.
    // Technicians are created by admins and companies use their dedicated registration flow.
    const userRole = 'customer';

    // Insert user
    const [result] = await connection.query(
      'INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), cleanEmail, hashedPassword, userRole, cleanPhone || null]
    );

    const userId = result.insertId;
    const user = { id: userId, name, email, role: userRole };
    const token = generateToken(user);

    logger.info(`New user registered: ${email} with role ${userRole} (ID: ${userId})`);

    // Log Activity
    await logActivity(userId, 'user', 'registration', 'users', userId, { name, email, role: userRole }, req.ip);

    return res.status(201).json(formatResponse(true, 'Registration successful.', {
      id: userId,
      name,
      email,
      role: userRole,
      token
    }));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Handle user login (SignIn)
 */
const signin = async (req, res, next) => {
  const { email, password } = req.body;
  let connection;

  try {
    connection = await pool.getConnection();

    // Fetch user details
    const [rows] = await connection.query(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (rows.length === 0) {
      await logActivity(null, 'security', 'failed_login', 'users', null, { email, reason: 'user_not_found' }, req.ip);
      return res.status(400).json(formatResponse(false, 'Invalid email or password.'));
    }

    const user = rows[0];

    // Verify password (bcrypt hash only; supports standard $2a$, $2b$, and $2y$ prefixes)
    let isMatch = false;
    if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$'))) {
      isMatch = await bcrypt.compare(password, user.password);
    }

    if (!isMatch) {
      await logActivity(user.id, 'security', 'failed_login', 'users', user.id, { email, reason: 'password_mismatch' }, req.ip);
      return res.status(400).json(formatResponse(false, 'Invalid email or password.'));
    }

    // Verify account activation status
    if (user.is_active === 0 || user.is_active === false) {
      await logActivity(user.id, 'security', 'failed_login', 'users', user.id, { email, reason: 'account_deactivated' }, req.ip);
      return res.status(403).json(formatResponse(false, 'Your account has been deactivated. Please contact support.'));
    }

    const token = generateToken(user);

    logger.info(`User logged in: ${email} (ID: ${user.id})`);

    // Log Activity
    await logActivity(user.id, 'security', 'login', 'users', user.id, { name: user.name, role: user.role }, req.ip);

    let displayName = user.name;
    let avatarUrl = user.avatar_url;

    if (user.role === 'company') {
      const [compProfile] = await connection.query(
        'SELECT company_name, company_logo FROM company_profiles WHERE user_id = ? LIMIT 1',
        [user.id]
      );
      if (compProfile.length > 0) {
        if (compProfile[0].company_name) displayName = compProfile[0].company_name;
        if (compProfile[0].company_logo) avatarUrl = compProfile[0].company_logo;
      }
    }

    return res.status(200).json(formatResponse(true, 'Login successful.', {
      id: user.id,
      name: displayName,
      email: user.email,
      role: user.role,
      avatar_url: avatarUrl,
      token
    }));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Handle password changes for logged-in users
 */
const setPassword = async (req, res, next) => {
  const { password } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  let connection;

  // Technicians are restricted from changing their own password
  if (userRole === 'technician') {
    return res.status(403).json(formatResponse(false, 'Technicians are not authorized to change their own passwords. Please contact your coordinator.'));
  }

  try {
    if (!password || password.length < 8) {
      return res.status(400).json(formatResponse(false, 'Password must be at least 8 characters long.'));
    }

    connection = await pool.getConnection();

    // Hash the password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update in database and increment token_version
    const [result] = await connection.query(
      'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
      [hashedPassword, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json(formatResponse(false, 'User not found.'));
    }

    logger.info(`Password updated successfully for user ID: ${userId} (${userRole})`);

    // Log Activity
    await logActivity(userId, 'security', 'password_change', 'users', userId, { role: userRole }, req.ip);

    // If Company account updates their password, notify admins
    if (userRole === 'company') {
      const [admins] = await connection.query('SELECT id FROM users WHERE role = "admin"');
      for (const admin of admins) {
        await connection.query(
          'INSERT INTO notifications (user_id, title, message, is_read) VALUES (?, ?, ?, 0)',
          [
            admin.id,
            'Security Alert: Company Password Updated',
            `Company account "${req.user.name}" (${req.user.email}) has updated their password. Date: ${new Date().toLocaleString()}`
          ]
        );
      }
    }

    // Fetch updated token version to generate a new token
    const [versionRows] = await connection.query('SELECT token_version FROM users WHERE id = ?', [userId]);
    const newTokenVersion = versionRows.length > 0 ? versionRows[0].token_version : 1;

    // Generate a new token with updated version so they aren't logged out
    const newToken = generateToken({
      id: userId,
      name: req.user.name,
      email: req.user.email,
      role: userRole,
      token_version: newTokenVersion
    });

    return res.status(200).json(formatResponse(true, 'Password updated successfully.', { token: newToken }));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Helper to determine the client frontend base URL reliably
 */
const getFrontendBaseUrl = (req) => {
  // 1. Explicit configured FRONTEND_URL
  if (config.frontend && config.frontend.url) {
    return config.frontend.url;
  }
  if (process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim()) {
    return process.env.FRONTEND_URL.trim().replace(/\/+$/, '');
  }

  // 2. Origin header from browser CORS requests
  const origin = req.get('origin');
  if (origin && origin !== 'null' && !origin.includes(`localhost:${config.server.port}`)) {
    return origin.replace(/\/+$/, '');
  }

  // 3. Referer header fallback
  const referer = req.get('referer');
  if (referer) {
    try {
      const parsed = new URL(referer);
      if (!parsed.host.includes(`localhost:${config.server.port}`)) {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch (_) {}
  }

  // 4. Production fallback to trusted CORS origins
  if (config.isProduction && config.server.corsOrigins && config.server.corsOrigins.length > 0) {
    const trustedOrigin = config.server.corsOrigins.find(o => !o.includes('localhost'));
    if (trustedOrigin) {
      return trustedOrigin.replace(/\/+$/, '');
    }
  }

  // 5. Default to the configured public origin (app.config.js guarantees this
  //    is a real https:// domain in production, never a dev host).
  return config.frontend?.url || config.server?.publicOrigin || '';
};

/**
 * Request password reset email
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res, next) => {
  const { email } = req.body;
  let connection;

  try {
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    connection = await pool.getConnection();

    const [rows] = await connection.query(
      'SELECT id, name, email, token_version FROM users WHERE LOWER(email) = ? AND is_active = 1 LIMIT 1',
      [normalizedEmail]
    );

    // Always respond with success to prevent user email enumeration
    if (rows.length === 0) {
      logger.info(`Password reset requested for unregistered or inactive email: ${normalizedEmail}`);
      return res.status(200).json(formatResponse(true, 'If an active account exists with that email, a password reset link has been sent.'));
    }

    const user = rows[0];

    // Generate short-lived reset token (1 hour)
    const resetToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        type: 'password_reset',
        token_version: user.token_version || 1
      },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    // Build frontend reset URL based on reliable client origin
    const baseUrl = getFrontendBaseUrl(req);
    const resetUrl = `${baseUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(user.email)}`;

    const emailSubject = 'TekDoctor — Password Reset Request';
    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0d0d12; color: #f4f4f5; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; padding: 32px 24px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.5px; color: #ffffff;">TEK<span style="color: #00e5ff;">DOCTOR</span></span>
        </div>
        <h2 style="font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px;">Password Reset Request</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 16px;">Hello ${user.name || 'Valued Customer'},</p>
        <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 24px;">We received a request to reset the password for your TekDoctor account. Click the button below to choose a new password. This link is single-use and will expire in <strong>1 hour</strong>.</p>
        <div style="margin: 28px 0;">
          <a href="${resetUrl}" style="background-color: #00e5ff; color: #000000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block; text-transform: uppercase; letter-spacing: 0.5px;">Reset My Password</a>
        </div>
        <p style="font-size: 12px; color: #71717a; margin-bottom: 8px;">If the button above does not work, copy and paste this URL into your browser:</p>
        <p style="font-size: 12px; word-break: break-all; color: #00e5ff; background-color: #18181b; padding: 10px; border-radius: 6px; margin-bottom: 24px;">${resetUrl}</p>
        <hr style="border: 0; border-top: 1px solid #27272a; margin: 24px 0;" />
        <p style="font-size: 11px; color: #71717a; line-height: 1.5; margin: 0;">If you did not request this password reset, please ignore this email. Your current password remains completely secure.</p>
      </div>
    `;

    // Await delivery result
    const emailSent = await sendCustomerNotification(user.email, emailSubject, emailHtml);

    // In development only, log the clickable link for developer convenience (never in production)
    if (config.env === 'development') {
      logger.info(`[DEV PASSWORD RESET LINK] User: ${user.email} | Reset URL: ${resetUrl}`);
    }

    if (!emailSent && config.isProduction) {
      logger.error(`[PASSWORD_RESET_FAIL] Password reset email could not be delivered to ${user.email}`);
      return res.status(503).json(formatResponse(false, 'Email service is temporarily unavailable. Please try again later or contact support.'));
    }

    await logActivity(user.id, 'security', 'forgot_password_request', 'users', user.id, { email: user.email }, req.ip);

    return res.status(200).json(formatResponse(true, 'If an active account exists with that email, a password reset link has been sent.'));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Reset password using token
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res, next) => {
  const token = req.body.token;
  const newPassword = req.body.newPassword || req.body.password;
  let connection;

  try {
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      return res.status(400).json(formatResponse(false, 'Invalid or expired password reset link. Please request a new one.'));
    }

    if ((decoded.type !== 'password_reset' && decoded.type !== 'set_password') || !decoded.id) {
      return res.status(400).json(formatResponse(false, 'Invalid reset token.'));
    }

    connection = await pool.getConnection();

    const [rows] = await connection.query(
      'SELECT id, name, email, role, token_version, is_active FROM users WHERE id = ? LIMIT 1',
      [decoded.id]
    );

    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(400).json(formatResponse(false, 'Account not found or has been deactivated.'));
    }

    const user = rows[0];

    // Invalidate token if token_version has already been bumped (prevents replay/reuse)
    if (decoded.token_version !== undefined && user.token_version !== undefined && decoded.token_version !== user.token_version) {
      return res.status(400).json(formatResponse(false, 'This reset link has already been used or is no longer valid.'));
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await connection.query(
      'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
      [hashedPassword, user.id]
    );

    logger.info(`Password successfully set/reset for user: ${user.email} (ID: ${user.id})`);
    await logActivity(user.id, 'security', 'password_reset_completed', 'users', user.id, { email: user.email }, req.ip);

    return res.status(200).json(formatResponse(true, 'Password has been set successfully. You can now sign in with your new password.'));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Invalidate current user session on server
 * POST /api/auth/logout
 */
const logout = async (req, res, next) => {
  let connection;
  try {
    const userId = req.user.id;
    connection = await pool.getConnection();

    await connection.query(
      'UPDATE users SET token_version = token_version + 1 WHERE id = ?',
      [userId]
    );

    logger.info(`Session invalidated (logged out) for user ID: ${userId}`);
    await logActivity(userId, 'security', 'logout', 'users', userId, {}, req.ip);

    return res.status(200).json(formatResponse(true, 'Logged out successfully. Session invalidated.'));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Update Customer/User Profile (Name & Phone only)
 * PUT /api/auth/profile
 */
const updateProfile = async (req, res, next) => {
  let connection;
  try {
    const userId = req.user.id;
    const { name, phone } = req.body;

    connection = await pool.getConnection();

    const [users] = await connection.query(
      'SELECT id, name, email, phone, role, token_version FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json(formatResponse(false, 'User not found.'));
    }

    const updates = [];
    const params = [];

    if (name && typeof name === 'string' && name.trim()) {
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (phone !== undefined) {
      const cleanPhone = phone ? phone.trim() : null;
      if (cleanPhone) {
        // Ensure phone is not already in use by another user
        const [conflict] = await connection.query(
          'SELECT id FROM users WHERE phone = ? AND id != ? LIMIT 1',
          [cleanPhone, userId]
        );
        if (conflict.length > 0) {
          return res.status(409).json(formatResponse(false, 'This phone number is already associated with another account.'));
        }
      }
      updates.push('phone = ?');
      params.push(cleanPhone);
    }

    if (updates.length > 0) {
      params.push(userId);
      await connection.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    const [updatedRows] = await connection.query(
      'SELECT id, name, email, phone, role, token_version FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    const updatedUser = updatedRows[0];
    logger.info(`Profile updated for user: ${updatedUser.email} (ID: ${userId})`);
    await logActivity(userId, 'user', 'profile_update', 'users', userId, { name: updatedUser.name, phone: updatedUser.phone }, req.ip);

    return res.status(200).json(formatResponse(true, 'Profile updated successfully.', updatedUser));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Handle Google Sign-In & Registration (OAuth 2.0 / OpenID Connect)
 */
const googleSignIn = async (req, res, next) => {
  const { credential, code } = req.body;
  let connection;

  try {
    // 0. Enforce Google Sign-In enable/disable state
    const googleConfig = await getGoogleConfig();
    if (!googleConfig.enabled) {
      logger.warn(`Google Sign-In rejected: Google authentication is disabled by administrator. IP: ${req.ip}`);
      return res.status(403).json(formatResponse(false, 'Google Sign-In is currently disabled.'));
    }

    // 1. Verify Google Identity Token or Code on backend
    let googleUser;
    try {
      googleUser = await verifyGoogleIdentity({ credential, code });
    } catch (verifyErr) {
      logger.warn(`Google token verification failed: ${verifyErr.message}`);
      return res.status(401).json(formatResponse(false, verifyErr.message || 'Invalid or expired Google authentication credentials.'));
    }

    const { googleId, email, name, avatarUrl, emailVerified } = googleUser;

    if (!emailVerified) {
      return res.status(400).json(formatResponse(false, 'Google email address is not verified. Please verify your email with Google.'));
    }

    connection = await pool.getConnection();

    // 2. Case A: Check if an account is already linked with this google_id
    const [linkedUsers] = await connection.query(
      'SELECT * FROM users WHERE google_id = ? LIMIT 1',
      [googleId]
    );

    if (linkedUsers.length > 0) {
      const user = linkedUsers[0];

      // Security check: Google account conflict prevention
      if (user.email.toLowerCase() !== email) {
        logger.warn(`Google account conflict: Google ID ${googleId} linked to ${user.email}, but received token for ${email}`);
        return res.status(409).json(formatResponse(false, 'This Google account is already linked to a different TekDoctor account.'));
      }

      // Check account activation
      if (user.is_active === 0 || user.is_active === false) {
        await logActivity(user.id, 'security', 'failed_google_login', 'users', user.id, { email, reason: 'account_deactivated' }, req.ip);
        return res.status(403).json(formatResponse(false, 'Your account has been deactivated. Please contact support.'));
      }

      // Update avatar if not previously set
      if (!user.avatar_url && avatarUrl) {
        await connection.query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, user.id]);
        user.avatar_url = avatarUrl;
      }

      const token = generateToken(user);
      logger.info(`Google Sign-In successful for linked user: ${email} (ID: ${user.id}, Role: ${user.role})`);
      await logActivity(user.id, 'security', 'google_login', 'users', user.id, { email, role: user.role }, req.ip);

      return res.status(200).json(formatResponse(true, 'Login successful.', {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url || avatarUrl,
        token
      }));
    }

    // 3. Case B: Check if an existing account exists with this email address
    const [existingUsers] = await connection.query(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existingUsers.length > 0) {
      const user = existingUsers[0];

      // Security check: If existing account is already linked to another google_id
      if (user.google_id && user.google_id !== googleId) {
        logger.warn(`Google account linking conflict: Account ${user.email} already linked to Google ID ${user.google_id}, received ${googleId}`);
        return res.status(409).json(formatResponse(false, 'This email address is already linked to a different Google account.'));
      }

      // Check account activation
      if (user.is_active === 0 || user.is_active === false) {
        await logActivity(user.id, 'security', 'failed_google_login', 'users', user.id, { email, reason: 'account_deactivated' }, req.ip);
        return res.status(403).json(formatResponse(false, 'Your account has been deactivated. Please contact support.'));
      }

      // Securely link Google account to existing user without modifying password or role
      await connection.query(
        `UPDATE users SET
          google_id = ?,
          auth_provider = IF(auth_provider = 'local', 'both', COALESCE(auth_provider, 'both')),
          avatar_url = COALESCE(avatar_url, ?)
         WHERE id = ?`,
        [googleId, avatarUrl, user.id]
      );

      // Refresh user object for token & response
      user.google_id = googleId;
      if (!user.avatar_url && avatarUrl) user.avatar_url = avatarUrl;

      const token = generateToken(user);
      logger.info(`Existing account ${email} securely linked to Google ID ${googleId} (ID: ${user.id}, Role: ${user.role})`);
      await logActivity(user.id, 'security', 'google_account_link', 'users', user.id, { email, role: user.role }, req.ip);

      return res.status(200).json(formatResponse(true, 'Account linked and logged in successfully.', {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url || avatarUrl,
        token
      }));
    }

    // 4. Case C: New Google User Registration
    // Default role is strictly 'customer' (never privileged roles)
    const userRole = 'customer';

    // Generate random secure hash for password so legacy non-null constraint is met
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(randomPassword, salt);

    const [insertResult] = await connection.query(
      `INSERT INTO users (name, email, password, role, google_id, auth_provider, avatar_url, is_active, token_version)
       VALUES (?, ?, ?, ?, ?, 'google', ?, 1, 1)`,
      [name, email, hashedPassword, userRole, googleId, avatarUrl]
    );

    const userId = insertResult.insertId;
    const newUser = {
      id: userId,
      name,
      email,
      role: userRole,
      token_version: 1,
      avatar_url: avatarUrl
    };

    const token = generateToken(newUser);
    logger.info(`New user registered via Google: ${email} (ID: ${userId}, Role: ${userRole})`);
    await logActivity(userId, 'user', 'google_registration', 'users', userId, { name, email, role: userRole }, req.ip);

    // Send welcome notification if email service is active
    try {
      await sendCustomerNotification(email, 'Welcome to TekDoctor', `Hello ${name}, welcome to TekDoctor! Your account has been created via Google Sign-In.`);
    } catch (emailErr) {
      logger.debug(`Welcome email notification skipped or failed: ${emailErr.message}`);
    }

    return res.status(201).json(formatResponse(true, 'Registration successful with Google.', {
      id: userId,
      name,
      email,
      role: userRole,
      avatar_url: avatarUrl,
      token
    }));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  signup,
  signin,
  setPassword,
  forgotPassword,
  resetPassword,
  googleSignIn,
  logout,
  updateProfile
};
