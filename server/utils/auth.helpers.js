const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/app.config');

/**
 * Generate a JWT token for a user.
 * Centralized to ensure all roles include `token_version` for session invalidation.
 *
 * @param {Object} user - User object with { id, name, email, role, token_version }
 * @returns {string} Signed JWT token
 */
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
 * Generate a cryptographically secure, time-limited token for guest estimate actions (approve/reject).
 * 
 * @param {Object} params
 * @param {number|string} params.ticketId - Repair ticket ID
 * @param {string} params.ticketNumber - Ticket number (e.g. TD-001)
 * @param {'approve_estimate'|'reject_estimate'} params.action - Specific action permitted
 * @param {string} [params.email] - Associated customer email
 * @returns {string} Signed JWT token valid for 7 days
 */
const generateEstimateActionToken = ({ ticketId, ticketNumber, action, email }) => {
  return jwt.sign(
    {
      ticketId: Number(ticketId),
      ticketNumber,
      action,
      email: email ? email.trim().toLowerCase() : null,
      type: 'estimate_action'
    },
    config.jwt.secret,
    { expiresIn: '7d' }
  );
};

/**
 * Verify whether the caller is authorized to perform an estimate action on a repair ticket.
 * Checks both authenticated users (customer ownership, company ownership, admin)
 * and guest action tokens. Blocks unauthorized users and technicians.
 *
 * @param {Object} req - Express request object
 * @param {Object} ticket - Service request database record
 * @param {'approve_estimate'|'reject_estimate'} requiredAction - Required action type
 * @returns {{ authorized: boolean, statusCode?: number, error?: string, userType?: string, userId?: number|null }}
 */
const verifyEstimateAuthorization = (req, ticket, requiredAction) => {
  // 1. Authenticated User Check (via req.user from JWT authentication)
  if (req.user) {
    const role = req.user.role;

    if (role === 'admin') {
      return { authorized: true, userType: 'admin', userId: req.user.id };
    }

    if (role === 'technician') {
      return {
        authorized: false,
        statusCode: 403,
        error: 'Forbidden: Technicians are not permitted to approve or reject customer estimates.'
      };
    }

    if (role === 'customer') {
      const isOwnerId = ticket.user_id && Number(ticket.user_id) === Number(req.user.id);
      const isOwnerEmail = ticket.email && req.user.email && ticket.email.trim().toLowerCase() === req.user.email.trim().toLowerCase();

      if (isOwnerId || isOwnerEmail) {
        return { authorized: true, userType: 'customer', userId: req.user.id };
      }

      return {
        authorized: false,
        statusCode: 403,
        error: 'Unauthorized: You can only approve or reject estimates for your own tickets.'
      };
    }

    if (role === 'company') {
      const rowCompId = ticket.company_id ? Number(ticket.company_id) : null;
      const rowUserId = ticket.user_id ? Number(ticket.user_id) : null;
      const reqUserId = Number(req.user.id);

      if (rowCompId === reqUserId || rowUserId === reqUserId) {
        return { authorized: true, userType: 'company', userId: req.user.id };
      }

      return {
        authorized: false,
        statusCode: 403,
        error: 'Unauthorized: You can only approve or reject estimates for your company tickets.'
      };
    }

    return {
      authorized: false,
      statusCode: 403,
      error: 'Forbidden: Insufficient permissions.'
    };
  }

  // 2. Guest Action Token Check (for unauthenticated callers holding a signed estimate action token)
  let candidateToken = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    candidateToken = authHeader.split(' ')[1];
  } else if (req.body && (req.body.token || req.body.actionToken)) {
    candidateToken = req.body.token || req.body.actionToken;
  } else if (req.query && (req.query.token || req.query.actionToken)) {
    candidateToken = req.query.token || req.query.actionToken;
  }

  if (candidateToken) {
    try {
      const decoded = jwt.verify(candidateToken, config.jwt.secret);

      if (decoded.type !== 'estimate_action') {
        return {
          authorized: false,
          statusCode: 403,
          error: 'Forbidden: Invalid token type for estimate action.'
        };
      }

      if (Number(decoded.ticketId) !== Number(ticket.id)) {
        return {
          authorized: false,
          statusCode: 403,
          error: 'Forbidden: Estimate action token is not authorized for this repair ticket.'
        };
      }

      if (decoded.action !== requiredAction) {
        return {
          authorized: false,
          statusCode: 403,
          error: `Forbidden: Token was issued for ${decoded.action}, cannot be used for ${requiredAction}.`
        };
      }

      if (decoded.email && ticket.email && decoded.email.toLowerCase() !== ticket.email.trim().toLowerCase()) {
        return {
          authorized: false,
          statusCode: 403,
          error: 'Forbidden: Estimate token does not match ticket recipient.'
        };
      }

      return { authorized: true, userType: 'guest_token', userId: null };
    } catch (err) {
      return {
        authorized: false,
        statusCode: 401,
        error: 'Invalid or expired estimate action token. Please request a new link or log in.'
      };
    }
  }

  // 3. Neither authenticated session nor guest action token provided
  return {
    authorized: false,
    statusCode: 401,
    error: 'Authentication required. Please sign in to your TekDoctor account or use your secure estimate link.'
  };
};

/**
 * Verify whether a technician is authorized to access a given repair ticket.
 * A technician is authorized ONLY if:
 * 1. They are currently the assigned technician (`ticket.assigned_technician_id === userId`)
 * 2. OR they are the pending technician (`ticket.pending_technician_id === userId`)
 *
 * If a ticket is unassigned or has been reassigned to another technician, access is strictly forbidden (403).
 *
 * @param {number|string} userId - Authenticated technician user's ID
 * @param {Object} ticket - Ticket object containing { assigned_technician_id, pending_technician_id, id }
 * @param {Object} [dbConnection] - MySQL connection/pool
 * @returns {Promise<boolean>}
 */
const canTechnicianAccessTicket = async (userId, ticket, dbConnection) => {
  if (!userId || !ticket) return false;

  const numericUserId = Number(userId);
  const assignedTechId = ticket.assigned_technician_id ? Number(ticket.assigned_technician_id) : null;
  const pendingTechId = ticket.pending_technician_id ? Number(ticket.pending_technician_id) : null;

  return assignedTechId === numericUserId || pendingTechId === numericUserId;
};

/**
 * Generate a cryptographically secure, time-limited token for guest invoice/receipt access.
 * 
 * @param {Object} params
 * @param {number|string} params.ticketId - Repair ticket ID
 * @param {string} [params.ticketNumber] - Ticket number (e.g. TD-001)
 * @param {string} [params.invoiceId] - Invoice ID (e.g. inv-101)
 * @param {number|string} [params.userId] - Associated customer user ID
 * @param {string} [params.email] - Associated customer email
 * @param {string} [expiresIn='24h'] - Expiration time (default 24 hours)
 * @returns {string} Signed JWT token
 */
const generateGuestInvoiceAccessToken = ({ ticketId, ticketNumber, invoiceId, userId, email }, expiresIn = '24h') => {
  return jwt.sign(
    {
      ticketId: ticketId ? Number(ticketId) : null,
      ticketNumber: ticketNumber || null,
      invoiceId: invoiceId ? String(invoiceId) : null,
      userId: userId ? Number(userId) : null,
      email: email ? String(email).trim().toLowerCase() : null,
      type: 'invoice_access',
      purpose: 'invoice_download'
    },
    config.jwt.secret,
    { expiresIn }
  );
};

/**
 * Verify whether the caller is authorized to view or download a payment receipt / invoice.
 * Checks:
 * 1. Authenticated sessions (req.user): admin, technician (scoped), customer (own), company (own).
 * 2. Guest invoice access token: validates signature, expiration, type === 'invoice_access', purpose === 'invoice_download',
 *    and matching ticket/invoice bindings.
 * Fails closed on forged tokens, expired tokens, wrong-action tokens, and mismatched ownership.
 *
 * @param {Object} req - Express request object
 * @param {Object} context - { ticket, invoice } database records
 * @param {Object} [context.ticket] - Service request database row
 * @param {Object} [context.invoice] - Invoice database row
 * @param {Object} [dbConnection] - MySQL connection/pool
 * @returns {Promise<{ authorized: boolean, statusCode?: number, error?: string, userType?: string, userId?: number|null }>}
 */
const verifyInvoiceAuthorization = async (req, { ticket, invoice }, dbConnection) => {
  // 1. Authenticated User Check (via req.user from JWT authentication)
  if (req.user) {
    const role = req.user.role;
    const authUserId = Number(req.user.id);

    if (role === 'admin') {
      return { authorized: true, userType: 'admin', userId: authUserId };
    }

    if (role === 'technician') {
      let authorized = false;
      if (ticket) {
        authorized = await canTechnicianAccessTicket(authUserId, ticket, dbConnection);
      } else if (invoice && invoice.ticket_id && dbConnection) {
        try {
          const [tRows] = await dbConnection.query(
            'SELECT id, assigned_technician_id, pending_technician_id FROM service_requests WHERE id = ? LIMIT 1',
            [invoice.ticket_id]
          );
          if (tRows.length > 0) {
            authorized = await canTechnicianAccessTicket(authUserId, tRows[0], dbConnection);
          }
        } catch (_) {
          authorized = false;
        }
      }

      if (!authorized) {
        return {
          authorized: false,
          statusCode: 403,
          error: 'Access denied. You can only view bills for your authorized repair tickets.'
        };
      }

      return { authorized: true, userType: 'technician', userId: authUserId };
    }

    if (role === 'customer') {
      let isOwner = false;
      if (ticket) {
        const ticketOwnerId = ticket.user_id ? Number(ticket.user_id) : null;
        const ticketEmail = ticket.email ? ticket.email.trim().toLowerCase() : null;
        const userEmail = req.user.email ? req.user.email.trim().toLowerCase() : null;
        if (ticketOwnerId === authUserId || (ticketEmail && userEmail && ticketEmail === userEmail)) {
          isOwner = true;
        }
      } else if (invoice) {
        const invUserId = invoice.user_id ? Number(invoice.user_id) : null;
        if (invUserId === authUserId) {
          isOwner = true;
        }
      }

      if (!isOwner) {
        return {
          authorized: false,
          statusCode: 403,
          error: 'Access denied. You can only view bills for your own repair tickets.'
        };
      }

      return { authorized: true, userType: 'customer', userId: authUserId };
    }

    if (role === 'company') {
      let isCompanyOwner = false;
      if (ticket) {
        const ticketCompId = ticket.company_id ? Number(ticket.company_id) : null;
        const ticketUserId = ticket.user_id ? Number(ticket.user_id) : null;
        if (ticketCompId === authUserId || ticketUserId === authUserId) {
          isCompanyOwner = true;
        }
      } else if (invoice) {
        const invUserId = invoice.user_id ? Number(invoice.user_id) : null;
        const invCompId = invoice.company_id ? Number(invoice.company_id) : null;
        if (invUserId === authUserId || invCompId === authUserId) {
          isCompanyOwner = true;
        } else if (invoice.ticket_id && dbConnection) {
          try {
            const [tkRows] = await dbConnection.query(
              'SELECT id, company_id, user_id FROM service_requests WHERE id = ? LIMIT 1',
              [invoice.ticket_id]
            );
            if (tkRows.length > 0) {
              const rowCompId = tkRows[0].company_id ? Number(tkRows[0].company_id) : null;
              const rowUserId = tkRows[0].user_id ? Number(tkRows[0].user_id) : null;
              if (rowCompId === authUserId || rowUserId === authUserId) {
                isCompanyOwner = true;
              }
            }
          } catch (_) {
            isCompanyOwner = false;
          }
        }
      }

      if (!isCompanyOwner) {
        return {
          authorized: false,
          statusCode: 403,
          error: 'Access denied. You can only view bills for your company repair tickets.'
        };
      }

      return { authorized: true, userType: 'company', userId: authUserId };
    }

    return {
      authorized: false,
      statusCode: 403,
      error: 'Forbidden: Insufficient permissions.'
    };
  }

  // 2. Guest Action / Access Token Check
  let candidateToken = null;
  const authHeader = req.headers ? req.headers.authorization : null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    candidateToken = authHeader.split(' ')[1];
  } else if (req.query && (req.query.token || req.query.invoiceToken || req.query.actionToken)) {
    candidateToken = req.query.token || req.query.invoiceToken || req.query.actionToken;
  } else if (req.body && (req.body.token || req.body.invoiceToken || req.body.actionToken)) {
    candidateToken = req.body.token || req.body.invoiceToken || req.body.actionToken;
  }

  if (candidateToken) {
    try {
      const decoded = jwt.verify(candidateToken, config.jwt.secret);

      if (decoded.type !== 'invoice_access') {
        return {
          authorized: false,
          statusCode: 403,
          error: 'Forbidden: Invalid token type for invoice access.'
        };
      }

      if (decoded.purpose && decoded.purpose !== 'invoice_download') {
        return {
          authorized: false,
          statusCode: 403,
          error: 'Forbidden: Invalid token purpose for invoice access.'
        };
      }

      // Check Ticket Binding
      if (ticket && decoded.ticketId && Number(decoded.ticketId) !== Number(ticket.id)) {
        return {
          authorized: false,
          statusCode: 403,
          error: 'Forbidden: Invoice access token is not authorized for this repair ticket.'
        };
      }

      // Check Invoice Binding
      if (invoice && decoded.invoiceId && String(decoded.invoiceId).toLowerCase() !== String(invoice.id).toLowerCase()) {
        return {
          authorized: false,
          statusCode: 403,
          error: 'Forbidden: Invoice access token is not authorized for this invoice.'
        };
      }

      // Check User ID Binding
      if (decoded.userId) {
        if (ticket && ticket.user_id && Number(decoded.userId) !== Number(ticket.user_id)) {
          return {
            authorized: false,
            statusCode: 403,
            error: 'Forbidden: Invoice access token does not match ticket owner.'
          };
        }
        if (invoice && invoice.user_id && Number(decoded.userId) !== Number(invoice.user_id)) {
          return {
            authorized: false,
            statusCode: 403,
            error: 'Forbidden: Invoice access token does not match invoice owner.'
          };
        }
      }

      // Check Email Binding
      if (decoded.email) {
        const decodedEmail = decoded.email.trim().toLowerCase();
        if (ticket && ticket.email && decodedEmail !== ticket.email.trim().toLowerCase()) {
          return {
            authorized: false,
            statusCode: 403,
            error: 'Forbidden: Invoice access token does not match ticket recipient.'
          };
        }
      }

      return { authorized: true, userType: 'guest_token', userId: decoded.userId || null };
    } catch (err) {
      return {
        authorized: false,
        statusCode: 401,
        error: 'Invalid or expired invoice access token.'
      };
    }
  }

  // 3. Unauthenticated and no valid token provided
  return {
    authorized: false,
    statusCode: 401,
    error: 'Authentication required to access this invoice.'
  };
};

/**
 * Generate a cryptographically secure 6-digit numeric OTP code.
 * @returns {string} 6-digit OTP code string
 */
const generateOtpCode = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

/**
 * Hash an OTP code with SHA-256 for secure storage at rest.
 * @param {string|number} otp - Plaintext OTP
 * @returns {string} Hex-encoded SHA-256 hash
 */
const hashOtp = (otp) => {
  return crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
};

/**
 * Timing-safe comparison of an input OTP against the stored SHA-256 hash.
 * @param {string|number} inputOtp - User-supplied OTP
 * @param {string} storedHash - Stored hex hash from DB
 * @returns {boolean}
 */
const verifyOtpHash = (inputOtp, storedHash) => {
  if (!inputOtp || !storedHash) return false;
  const inputHash = crypto.createHash('sha256').update(String(inputOtp).trim()).digest('hex');
  if (inputHash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(storedHash));
};

/**
 * Generate a short-lived restricted JWT for the pending MFA state.
 * @param {Object} user - User object with { id, email, role }
 * @returns {string} Signed pending JWT valid for 5 minutes
 */
const generatePendingAuthToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      type: 'admin_login_pending'
    },
    config.jwt.secret,
    { expiresIn: '5m' }
  );
};

/**
 * Verify and decode a pending MFA token.
 * @param {string} token - Signed pending JWT
 * @returns {Object} Decoded payload
 */
const verifyPendingAuthToken = (token) => {
  return jwt.verify(token, config.jwt.secret);
};

/**
 * Partially mask an email address for safe display in UI/logs.
 * Example: 'vkvseri@gmail.com' -> 'vk***@gmail.com'
 * @param {string} email
 * @returns {string} Masked email
 */
const maskEmail = (email) => {
  if (!email || typeof email !== 'string' || !email.includes('@')) return email || '';
  const [userPart, domainPart] = email.split('@');
  if (userPart.length <= 2) {
    return `${userPart.charAt(0)}*@${domainPart}`;
  }
  return `${userPart.slice(0, 2)}${'*'.repeat(Math.min(5, userPart.length - 2))}@${domainPart}`;
};

/**
 * Generate a short-lived restricted JWT for the pending Admin Change Password state.
 * @param {Object} user - User object with { id, email, role, token_version }
 * @param {string} newPasswordHash - Bcrypt hash of the new password to apply upon verification
 * @returns {string} Signed pending JWT valid for 10 minutes
 */
const generatePendingChangePasswordToken = (user, newPasswordHash) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      newPasswordHash,
      token_version: user.token_version || 1,
      type: 'admin_change_password_pending'
    },
    config.jwt.secret,
    { expiresIn: '10m' }
  );
};

module.exports = {
  generateToken,
  generateEstimateActionToken,
  verifyEstimateAuthorization,
  canTechnicianAccessTicket,
  generateGuestInvoiceAccessToken,
  verifyInvoiceAuthorization,
  generateOtpCode,
  hashOtp,
  verifyOtpHash,
  generatePendingAuthToken,
  verifyPendingAuthToken,
  generatePendingChangePasswordToken,
  maskEmail
};

