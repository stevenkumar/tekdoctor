const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { pool } = require('../config/db.config');

let sequenceTableReady = false;
const initializedSequences = new Set();

/**
 * Ensures app_sequences table exists using a separate pool query to prevent implicit transaction commits.
 */
const ensureSequenceTable = async () => {
  if (sequenceTableReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_sequences (
        sequence_name VARCHAR(50) PRIMARY KEY,
        current_val INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);
    sequenceTableReady = true;
  } catch (e) {
    // If error, will retry on subsequent calls
  }
};

/**
 * Ensures sequence row exists in app_sequences using standalone pool queries.
 * @param {string} seqName 
 * @param {string} prefix 
 * @param {string} table 
 */
const ensureSequence = async (seqName, prefix, table) => {
  if (initializedSequences.has(seqName)) return;
  await ensureSequenceTable();
  const [rows] = await pool.query('SELECT current_val FROM app_sequences WHERE sequence_name = ?', [seqName]);
  if (rows.length === 0) {
    const substrLen = prefix.length + 2;
    const [maxRows] = await pool.query(`
      SELECT MAX(CAST(SUBSTRING(id, ${substrLen}) AS UNSIGNED)) as max_val 
      FROM ${table} 
      WHERE id REGEXP '^(${prefix}|${prefix.toUpperCase()})-[0-9]+$'
    `);
    const initialVal = maxRows[0]?.max_val ? parseInt(maxRows[0].max_val, 10) : 0;
    await pool.query(`
      INSERT INTO app_sequences (sequence_name, current_val) 
      VALUES (?, ?) 
      ON DUPLICATE KEY UPDATE current_val = current_val
    `, [seqName, isNaN(initialVal) ? 0 : initialVal]);
  }
  initializedSequences.add(seqName);
};

/**
 * Generates the next sequential invoice ID (e.g. inv-001, inv-002, ...)
 * Concurrency-safe atomic generation backed by MySQL InnoDB app_sequences.
 * @param {Object} [connection] - MySQL database connection/pool (defaults to pool)
 * @returns {Promise<string>} Next invoice ID
 */
const generateInvoiceId = async (connection = pool) => {
  await ensureSequence('invoice', 'inv', 'invoices');

  // If connection is pool, checkout a dedicated connection so LAST_INSERT_ID() is connection-isolated
  const isPool = typeof connection.getConnection === 'function';
  const conn = isPool ? await connection.getConnection() : connection;

  try {
    let prefix = 'inv';
    try {
      const [pRows] = await conn.query("SELECT setting_value FROM site_settings WHERE setting_key = 'invoice_prefix' LIMIT 1");
      if (pRows.length > 0 && pRows[0].setting_value && pRows[0].setting_value.trim()) {
        prefix = pRows[0].setting_value.trim();
      }
    } catch (_) {}

    // Atomically increment and reserve next sequence value
    await conn.query(`
      UPDATE app_sequences 
      SET current_val = LAST_INSERT_ID(current_val + 1) 
      WHERE sequence_name = 'invoice'
    `);
    const [[{ nextVal }]] = await conn.query('SELECT LAST_INSERT_ID() as nextVal');

    let candidateId = `${prefix}-${String(nextVal || 1).padStart(3, '0')}`;

    // Safety loop: verify candidate does not collide with historical/manual records
    while (true) {
      const [existing] = await conn.query('SELECT id FROM invoices WHERE id = ? LIMIT 1', [candidateId]);
      if (existing.length === 0) break;
      await conn.query("UPDATE app_sequences SET current_val = LAST_INSERT_ID(current_val + 1) WHERE sequence_name = 'invoice'");
      const [[{ advancedVal }]] = await conn.query('SELECT LAST_INSERT_ID() as advancedVal');
      candidateId = `${prefix}-${String(advancedVal).padStart(3, '0')}`;
    }

    return candidateId;
  } finally {
    if (isPool && conn) {
      conn.release();
    }
  }
};

/**
 * Generates the next sequential quotation ID (e.g. qt-001, qt-002, ...)
 * Concurrency-safe atomic generation backed by MySQL InnoDB app_sequences.
 * @param {Object} [connection] - MySQL database connection/pool (defaults to pool)
 * @returns {Promise<string>} Next quotation ID
 */
const generateQuotationId = async (connection = pool) => {
  await ensureSequence('quotation', 'qt', 'quotations');

  const isPool = typeof connection.getConnection === 'function';
  const conn = isPool ? await connection.getConnection() : connection;

  try {
    // Atomically increment and reserve next sequence value
    await conn.query(`
      UPDATE app_sequences 
      SET current_val = LAST_INSERT_ID(current_val + 1) 
      WHERE sequence_name = 'quotation'
    `);
    const [[{ nextVal }]] = await conn.query('SELECT LAST_INSERT_ID() as nextVal');

    let candidateId = `qt-${String(nextVal || 1).padStart(3, '0')}`;

    // Safety loop: verify candidate does not collide with historical/manual records
    while (true) {
      const [existing] = await conn.query('SELECT id FROM quotations WHERE id = ? LIMIT 1', [candidateId]);
      if (existing.length === 0) break;
      await conn.query("UPDATE app_sequences SET current_val = LAST_INSERT_ID(current_val + 1) WHERE sequence_name = 'quotation'");
      const [[{ advancedVal }]] = await conn.query('SELECT LAST_INSERT_ID() as advancedVal');
      candidateId = `qt-${String(advancedVal).padStart(3, '0')}`;
    }

    return candidateId;
  } finally {
    if (isPool && conn) {
      conn.release();
    }
  }
};

/**
 * Sanitizes a filename to make it safe for storage and cross-platform compatible.
 * Prefixing with UUID to prevent naming collisions.
 * @param {string} originalName - Original filename
 * @returns {string} Sanitized filename
 */
const sanitizeFilename = (originalName) => {
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, ext)
    .replace(/[^a-zA-Z0-9]/g, '_') // Replace non-alphanumeric with underscores
    .substring(0, 50);             // Cap length

  const uniqueId = uuidv4().substring(0, 8);
  return `${uniqueId}_${baseName}${ext}`;
};

/**
 * Generates the next sequential technician ID
 * @param {Object} connection - MySQL database connection
 * @returns {Promise<string>} Next technician ID (TD-TECH-XXX)
 */
const generateTechnicianId = async (connection) => {
  try {
    const [rows] = await connection.query(`
      SELECT technician_id FROM users 
      WHERE role = 'technician' AND technician_id LIKE 'TD-TECH-%'
      ORDER BY CAST(SUBSTRING(technician_id, 9) AS UNSIGNED) DESC LIMIT 1
    `);

    let nextNum = 1;
    if (rows.length > 0 && rows[0].technician_id) {
      const lastId = rows[0].technician_id.substring(8);
      nextNum = parseInt(lastId, 10) + 1;
    }

    return `TD-TECH-${String(nextNum).padStart(3, '0')}`;
  } catch (error) {
    return `TD-TECH-${uuidv4().substring(0, 6)}`;
  }
};

/**
 * Generates the next sequential Company ID (e.g. CMP-001, CMP-002, ...)
 * @param {Object} connection - MySQL database connection/pool
 * @returns {Promise<string>} Next company ID
 */
const generateCompanyId = async (connection) => {
  try {
    await connection.query(`
      INSERT INTO app_sequences (sequence_name, current_val) 
      VALUES ('company_id', 1) 
      ON DUPLICATE KEY UPDATE current_val = LAST_INSERT_ID(current_val + 1)
    `);
    const [[{ nextVal }]] = await connection.query('SELECT LAST_INSERT_ID() as nextVal');

    let candidate = `CMP-${String(nextVal || 1).padStart(3, '0')}`;

    // Safety loop to ensure uniqueness against existing records
    while (true) {
      const [existing] = await connection.query(
        'SELECT id FROM company_profiles WHERE company_id = ? LIMIT 1',
        [candidate]
      );
      if (existing.length === 0) break;
      await connection.query("UPDATE app_sequences SET current_val = LAST_INSERT_ID(current_val + 1) WHERE sequence_name = 'company_id'");
      const [[{ advancedVal }]] = await connection.query('SELECT LAST_INSERT_ID() as advancedVal');
      candidate = `CMP-${String(advancedVal).padStart(3, '0')}`;
    }

    return candidate;
  } catch (error) {
    return `CMP-${uuidv4().substring(0, 6).toUpperCase()}`;
  }
};

/**
 * Resolves the permanent account ID based on customer or corporate identity:
 * - Customer: TD-001, TD-002, TD-170, TD-9103...
 * - Company: CMP-001, CMP-002, CMP-004...
 *
 * @param {Object} connection - MySQL database connection
 * @param {Object} options - { userId, companyId, isAmc }
 * @returns {Promise<string>} Permanent Account ID
 */
const resolvePermanentAccountId = async (connection, options = {}) => {
  const { userId, companyId, isAmc } = options;

  // 1. If an explicit canonical Company ID string was passed (e.g. 'CMP-001')
  if (typeof companyId === 'string' && companyId.trim().toUpperCase().startsWith('CMP-')) {
    return companyId.trim().toUpperCase();
  }

  // 2. If companyId was passed (could be numeric users.id, company_profiles.id, or company code string)
  if (companyId) {
    try {
      const [profiles] = await connection.query(
        'SELECT u.id, COALESCE(p.company_id, u.company_id) AS canonical_company_id FROM users u LEFT JOIN company_profiles p ON u.id = p.user_id WHERE u.id = ? OR p.id = ? OR u.company_id = ? OR p.company_id = ? LIMIT 1',
        [companyId, companyId, String(companyId), String(companyId)]
      );
      if (profiles && profiles.length > 0 && profiles[0].canonical_company_id) {
        return profiles[0].canonical_company_id;
      }
    } catch (e) {
      // fallback
    }

    // Preserve explicit legacy test formats if specifically provided as string
    if (typeof companyId === 'string' && (companyId.startsWith('TD-C') || companyId.startsWith('TD-AMC-C'))) {
      return companyId;
    }

    // Default canonical format for unpersisted company IDs
    const paddedCompId = String(companyId).padStart(3, '0');
    return `CMP-${paddedCompId}`;
  }

  // 3. If userId was passed
  if (userId) {
    try {
      const [users] = await connection.query(
        'SELECT u.id, u.role, COALESCE(p.company_id, u.company_id) AS canonical_company_id FROM users u LEFT JOIN company_profiles p ON u.id = p.user_id WHERE u.id = ? LIMIT 1',
        [userId]
      );
      if (users && users.length > 0) {
        if (users[0].role === 'company') {
          if (users[0].canonical_company_id) {
            return users[0].canonical_company_id;
          }
          return `CMP-${String(users[0].id).padStart(3, '0')}`;
        }
        // Customer
        return `TD-${String(users[0].id).padStart(3, '0')}`;
      }
    } catch (e) {
      // ignore
    }
    const paddedUserId = String(userId).padStart(3, '0');
    return `TD-${paddedUserId}`;
  }

  return 'TD-001';
};

/**
 * Generates the authoritative per-customer / per-company sequential ticket ID:
 * Format:
 * - Company: PERMANENT_COMPANY_ID + "-" + 3-digit company-specific ticket serial
 *   Examples: CMP-001-001, CMP-001-002, CMP-002-001, CMP-003-001...
 * - Customer: PERMANENT_ACCOUNT_ID + "-" + 2-digit customer-specific ticket serial
 *   Examples: TD-001-01, TD-001-02, TD-170-01...
 *
 * Concurrency & Idempotency:
 * - MySQL atomic increment on app_sequences using sequence_name = 'tkt:' + permanentAccountId
 * - Collision safety verification loop ensuring single authoritative uniqueness
 *
 * @param {Object} connection - MySQL database connection
 * @param {Object|string} optionsOrType - Options object { userId, companyId, isAmc } or legacy string
 * @returns {Promise<string>} Next ticket number
 */
const generateTicketNumber = async (connection, optionsOrType = {}) => {
  let permanentAccountId = null;

  if (typeof optionsOrType === 'string') {
    // Legacy fallback for string type ('Individual', 'Company', 'AMC')
    if (optionsOrType === 'AMC' || optionsOrType === 'Company') {
      permanentAccountId = 'CMP-001';
    } else {
      permanentAccountId = 'TD-001';
    }
  } else if (optionsOrType && typeof optionsOrType === 'object') {
    permanentAccountId = await resolvePermanentAccountId(connection, optionsOrType);
  }

  if (!permanentAccountId) {
    permanentAccountId = 'TD-001';
  }

  const isCompany = permanentAccountId.toUpperCase().startsWith('CMP-');
  const seqPadding = isCompany ? 3 : 2;
  const seqName = `tkt:${permanentAccountId}`;

  try {
    // Concurrency-safe atomic insert/update using LAST_INSERT_ID
    await connection.query(`
      INSERT INTO app_sequences (sequence_name, current_val) 
      VALUES (?, LAST_INSERT_ID(1)) 
      ON DUPLICATE KEY UPDATE current_val = LAST_INSERT_ID(current_val + 1)
    `, [seqName]);
    const [[{ nextVal }]] = await connection.query('SELECT LAST_INSERT_ID() as nextVal');

    const serialNum = nextVal || 1;
    let candidate = `${permanentAccountId}-${String(serialNum).padStart(seqPadding, '0')}`;

    // Safety loop to verify candidate does not collide with any pre-existing entry
    while (true) {
      const [existing] = await connection.query(
        'SELECT id FROM service_requests WHERE ticket_number = ? LIMIT 1',
        [candidate]
      );
      if (existing.length === 0) break;

      await connection.query(
        'UPDATE app_sequences SET current_val = LAST_INSERT_ID(current_val + 1) WHERE sequence_name = ?',
        [seqName]
      );
      const [[{ advancedVal }]] = await connection.query('SELECT LAST_INSERT_ID() as advancedVal');
      candidate = `${permanentAccountId}-${String(advancedVal).padStart(seqPadding, '0')}`;
    }

    return candidate;
  } catch (error) {
    console.error('Error in generateTicketNumber:', error.message);
    return `${permanentAccountId}-${uuidv4().substring(0, isCompany ? 3 : 4).toUpperCase()}`;
  }
};


/**
 * Standard API Response Formatter
 * @param {boolean} success - Whether request succeeded
 * @param {string} message - User-friendly status message
 * @param {Object} [data] - Optional response payload
 * @returns {Object} Standard response object
 */
const formatResponse = (success, message, data = null) => {
  const response = {
    success,
    message
  };
  if (data !== null) {
    response.data = data;
  }
  return response;
};

module.exports = {
  generateInvoiceId,
  generateQuotationId,
  sanitizeFilename,
  generateTechnicianId,
  generateCompanyId,
  resolvePermanentAccountId,
  generateTicketNumber,
  formatResponse
};
