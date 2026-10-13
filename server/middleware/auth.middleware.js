const jwt = require('jsonwebtoken');
const config = require('../config/app.config');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate requests via JWT Bearer token.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json(formatResponse(false, 'Access denied. No token provided.'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);

    // Verify token version and user activation status in database for session invalidation
    const { pool } = require('../config/db.config');
    const [rows] = await pool.query('SELECT is_active, token_version FROM users WHERE id = ? LIMIT 1', [decoded.id]);

    if (rows.length === 0) {
      return res.status(401).json(formatResponse(false, 'User account no longer exists.'));
    }

    const userDb = rows[0];
    if (!userDb.is_active) {
      return res.status(403).json(formatResponse(false, 'Your account has been deactivated. Please contact support.'));
    }

    const dbTokenVersion = (userDb.token_version != null && userDb.token_version !== '')
      ? Number(userDb.token_version)
      : 1;
    const rawJwtVersion = decoded.token_version ?? decoded.tokenVersion;
    const jwtTokenVersion = (rawJwtVersion != null && rawJwtVersion !== '')
      ? Number(rawJwtVersion)
      : 1;

    if (dbTokenVersion !== jwtTokenVersion) {
      return res.status(401).json(formatResponse(false, 'Session invalidated due to password change. Please log in again.'));
    }

    req.user = decoded; // { id, name, email, role, token_version }
    next();
  } catch (error) {
    logger.warn(`Failed token verification attempt: ${error.message}`);
    return res.status(401).json(formatResponse(false, 'Invalid or expired token.'));
  }
};

/**
 * Middleware to optionally authenticate requests.
 * Extracts user if token is present AND valid (including DB checks), but doesn't block request if missing or invalid.
 * Matches the security checks of `authenticate` — verifies is_active and token_version.
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, config.jwt.secret);

      // Verify user is still active and token version matches (same as authenticate)
      const { pool } = require('../config/db.config');
      const [rows] = await pool.query('SELECT is_active, token_version FROM users WHERE id = ? LIMIT 1', [decoded.id]);

      if (rows.length > 0 && rows[0].is_active) {
        const dbTokenVersion = (rows[0].token_version != null && rows[0].token_version !== '')
          ? Number(rows[0].token_version)
          : 1;
        const rawJwtVersion = decoded.token_version ?? decoded.tokenVersion;
        const jwtTokenVersion = (rawJwtVersion != null && rawJwtVersion !== '')
          ? Number(rawJwtVersion)
          : 1;

        if (dbTokenVersion !== jwtTokenVersion) {
          logger.debug(`Optional auth: token version mismatch for user ${decoded.id}`);
        } else {
          req.user = decoded;
        }
      } else {
        logger.debug(`Optional auth: user ${decoded.id} not found or deactivated`);
      }
    } catch (error) {
      // Just log and continue as guest
      logger.debug(`Optional auth failed verification: ${error.message}`);
    }
  }
  next();
};

/**
 * Middleware factory for role-based authorization.
 * @param {...string} roles - Allowed roles (e.g. 'admin', 'technician')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(formatResponse(false, 'Authentication required.'));
    }

    if (!roles.includes(req.user.role)) {
      logger.warn(`Unauthorized access attempt by ${req.user.email} (${req.user.role}) to protected route.`);
      return res.status(403).json(formatResponse(false, 'Access forbidden. Insufficient permissions.'));
    }

    next();
  };
};

module.exports = {
  authenticate,
  optionalAuth,
  authorize
};
