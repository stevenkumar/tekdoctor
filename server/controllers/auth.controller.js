const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const { logActivity } = require('../utils/activity.logger');

// Generate JWT helper
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      token_version: user.token_version || 1
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
};

/**
 * Handle new user registration (SignUp)
 */
const signup = async (req, res, next) => {
  const { name, email, password, role } = req.body;
  let connection;

  try {
    connection = await pool.getConnection();

    // Check if user already exists
    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json(formatResponse(false, 'An account with this email address already exists.'));
    }

    // Hash the password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Default role is customer
    const userRole = role || 'customer';

    // Insert user
    const [result] = await connection.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, userRole]
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

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
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

    return res.status(200).json(formatResponse(true, 'Login successful.', {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
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

module.exports = {
  signup,
  signin,
  setPassword
};
