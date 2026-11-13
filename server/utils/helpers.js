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
        sequence_name VARCHAR(100) PRIMARY KEY,
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
 * Enforces dual-table uniqueness across both users and company_profiles without UUID fallback.
 * @param {Object} [connection] - MySQL database connection or pool (defaults to pool)
 * @returns {Promise<string>} Next canonical company ID
 */
const generateCompanyId = async (connection = pool) => {
  const isPool = typeof connection?.getConnection === 'function';
  const conn = isPool ? await connection.getConnection() : connection;

  try {
    const [[userMaxRow]] = await conn.query(
      "SELECT COALESCE(MAX(CAST(SUBSTRING(company_id, 5) AS UNSIGNED)), 0) AS max_val FROM users WHERE company_id REGEXP '^CMP-[0-9]+$'"
    );
    const [[profileMaxRow]] = await conn.query(
      "SELECT COALESCE(MAX(CAST(SUBSTRING(company_id, 5) AS UNSIGNED)), 0) AS max_val FROM company_profiles WHERE company_id REGEXP '^CMP-[0-9]+$'"
    );
    const maxExisting = Math.max(
      Number(userMaxRow?.max_val || 0),
      Number(profileMaxRow?.max_val || 0)
    );

    await conn.query(
      "INSERT IGNORE INTO app_sequences (sequence_name, current_val) VALUES ('company_id', ?)",
      [maxExisting]
    );
    await conn.query(
      "UPDATE app_sequences SET current_val = LAST_INSERT_ID(GREATEST(current_val, ?) + 1) WHERE sequence_name = 'company_id'",
      [maxExisting]
    );
    const [[{ nextVal }]] = await conn.query('SELECT LAST_INSERT_ID() AS nextVal');

    let seqVal = Number(nextVal || 1);
    let candidate = `CMP-${String(seqVal).padStart(3, '0')}`;

    // Bounded safety loop verifying uniqueness across BOTH users and company_profiles
    const MAX_ATTEMPTS = 100;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const [existing] = await conn.query(
        `SELECT 1 FROM users WHERE company_id = ?
         UNION ALL
         SELECT 1 FROM company_profiles WHERE company_id = ?
         LIMIT 1`,
        [candidate, candidate]
      );
      if (existing.length === 0) {
        return candidate;
      }

      await conn.query(
        "UPDATE app_sequences SET current_val = LAST_INSERT_ID(current_val + 1) WHERE sequence_name = 'company_id'"
      );
      const [[{ advancedVal }]] = await conn.query('SELECT LAST_INSERT_ID() AS advancedVal');
      seqVal = Number(advancedVal);
      candidate = `CMP-${String(seqVal).padStart(3, '0')}`;
    }

    throw new Error('Unable to allocate a unique Company ID after maximum collision retries.');
  } finally {
    if (isPool && conn) {
      conn.release();
    }
  }
};

/**
 * Normalizes a nullable Company ID string; converts empty/whitespace-only strings to null.
 */
const normalizeCompanyIdValue = (val) => {
  if (val === null || val === undefined) return null;
  const trimmed = String(val).trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Core locked resolver operating inside an active database transaction.
 * Locks users and company_profiles rows for the target company user ID using FOR UPDATE,
 * validates ownership and dual-table uniqueness, and never overwrites conflicting IDs.
 */
const reconcileOrAssignCompanyIdLocked = async (conn, companyUserId) => {
  const numericUserId = Number(companyUserId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    const err = new Error('Valid numeric company user ID is required.');
    err.code = 'INVALID_COMPANY_USER_ID';
    throw err;
  }

  const [rows] = await conn.query(
    `SELECT u.id, u.role, u.company_id AS user_company_id,
            p.id AS profile_id, p.company_id AS profile_company_id
     FROM users u
     LEFT JOIN company_profiles p ON p.user_id = u.id
     WHERE u.id = ?
     FOR UPDATE`,
    [numericUserId]
  );

  if (rows.length === 0) {
    const err = new Error(`Company user account #${numericUserId} not found.`);
    err.code = 'COMPANY_NOT_FOUND';
    throw err;
  }

  const record = rows[0];
  if (record.role !== 'company') {
    const err = new Error(`Account #${numericUserId} is not a corporate company account (role="${record.role}").`);
    err.code = 'NOT_A_COMPANY_ACCOUNT';
    throw err;
  }

  const userCode = normalizeCompanyIdValue(record.user_company_id);
  const profileCode = normalizeCompanyIdValue(record.profile_company_id);
  const hasProfile = Boolean(record.profile_id);

  // Case 1: Both values exist and conflict — NEVER auto-select or overwrite either
  if (userCode && profileCode && userCode !== profileCode) {
    const err = new Error(
      `Company account #${numericUserId} has conflicting Company IDs (users.company_id="${userCode}", company_profiles.company_id="${profileCode}"). Manual administrator reconciliation is required.`
    );
    err.code = 'COMPANY_ID_CONFLICT';
    err.details = { companyUserId: numericUserId, userCode, profileCode };
    throw err;
  }

  // Case 2: Valid canonical ID already matches (or userCode exists without a profile row)
  if (userCode && (!hasProfile || userCode === profileCode)) {
    return { companyCode: userCode, status: 'matched' };
  }

  // Case 3: Exactly one side exists — validate ownership/uniqueness across BOTH tables before syncing
  if (userCode || profileCode) {
    const canonical = userCode || profileCode;

    const [conflictingUsers] = await conn.query(
      'SELECT id FROM users WHERE company_id = ? AND id <> ? LIMIT 1',
      [canonical, numericUserId]
    );
    const [conflictingProfiles] = await conn.query(
      'SELECT id, user_id FROM company_profiles WHERE company_id = ? AND (user_id IS NULL OR user_id <> ?) LIMIT 1',
      [canonical, numericUserId]
    );

    if (conflictingUsers.length > 0 || conflictingProfiles.length > 0) {
      const err = new Error(
        `Cannot synchronize Company ID "${canonical}" for company user #${numericUserId} because it is already assigned to another account.`
      );
      err.code = 'COMPANY_ID_OWNERSHIP_CONFLICT';
      err.details = {
        companyUserId: numericUserId,
        candidateCode: canonical,
        conflictingUserId: conflictingUsers[0]?.id || null,
        conflictingProfileUserId: conflictingProfiles[0]?.user_id || null
      };
      throw err;
    }

    if (!userCode) {
      await conn.query(
        "UPDATE users SET company_id = ? WHERE id = ? AND (company_id IS NULL OR TRIM(company_id) = '')",
        [canonical, numericUserId]
      );
    }
    if (hasProfile && !profileCode) {
      await conn.query(
        "UPDATE company_profiles SET company_id = ? WHERE user_id = ? AND (company_id IS NULL OR TRIM(company_id) = '')",
        [canonical, numericUserId]
      );
    }

    return { companyCode: canonical, status: 'synchronized' };
  }

  // Case 4: Both NULL/empty — generate one canonical ID and persist to both tables
  const assignedCode = await generateCompanyId(conn);
  await conn.query(
    "UPDATE users SET company_id = ? WHERE id = ? AND (company_id IS NULL OR TRIM(company_id) = '')",
    [assignedCode, numericUserId]
  );
  if (hasProfile) {
    await conn.query(
      "UPDATE company_profiles SET company_id = ? WHERE user_id = ? AND (company_id IS NULL OR TRIM(company_id) = '')",
      [assignedCode, numericUserId]
    );
  }

  return { companyCode: assignedCode, status: 'generated' };
};

/**
 * Concurrency-safe canonical Company ID resolver with FOR UPDATE row locking.
 * Guarantees dual-table synchronization without silent overwrites or unpersisted synthetic fallbacks.
 * @param {Object} [connectionOrPool] - MySQL pool or connection
 * @param {number} companyUserId - Numeric users.id of the company account
 * @param {Object} [options] - { inTransaction?: boolean }
 * @returns {Promise<{ companyCode: string, status: 'matched'|'synchronized'|'generated' }>}
 */
const resolveCanonicalCompanyCode = async (connectionOrPool = pool, companyUserId, options = {}) => {
  const isPool = typeof connectionOrPool?.getConnection === 'function';
  const conn = isPool ? await connectionOrPool.getConnection() : connectionOrPool;
  const shouldManageTransaction = isPool || !options.inTransaction;

  try {
    if (shouldManageTransaction) {
      await conn.beginTransaction();
    }

    const result = await reconcileOrAssignCompanyIdLocked(conn, companyUserId);

    if (shouldManageTransaction) {
      await conn.commit();
    }
    return result;
  } catch (error) {
    if (shouldManageTransaction) {
      try {
        await conn.rollback();
      } catch (_) {}
    }
    throw error;
  } finally {
    if (isPool && conn) {
      conn.release();
    }
  }
};

/**
 * Extracts a positive integer sequence suffix when a contract number follows
 * the company canonical prefix "AMC-<companyCode>-<digits>".
 * Ignores legacy random formats (AMC-CTR-..., AMC-RNW-...) and suffixed formats.
 */
const parseCompanyContractSequenceSuffix = (contractNumber, companyCode) => {
  if (!contractNumber || !companyCode) return null;
  const normalizedContract = String(contractNumber).trim();
  const expectedPrefix = `AMC-${String(companyCode).trim()}-`;
  if (normalizedContract.length <= expectedPrefix.length) return null;
  if (normalizedContract.slice(0, expectedPrefix.length).toUpperCase() !== expectedPrefix.toUpperCase()) {
    return null;
  }
  const suffix = normalizedContract.slice(expectedPrefix.length);
  if (!/^\d+$/.test(suffix)) return null;
  const parsed = Number.parseInt(suffix, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Allocates the next company-wise sequential AMC contract number (e.g. AMC-CMP-001-001).
 * Reconciles against existing company contract numbers and atomically increments app_sequences
 * using a dedicated checked-out connection so caller contract transactions do not nest or hold locks.
 * @param {Object} [connectionOrPool] - MySQL pool (preferred) or connection
 * @param {number} companyUserId - Numeric users.id of the corporate company account
 * @param {Object} [options] - { inTransaction?: boolean }
 * @returns {Promise<string>} Allocated contract number
 */
const allocateNextCompanyAmcContractNumber = async (connectionOrPool = pool, companyUserId, options = {}) => {
  const isPool = typeof connectionOrPool?.getConnection === 'function';
  const conn = isPool ? await connectionOrPool.getConnection() : connectionOrPool;

  try {
    const { companyCode } = await resolveCanonicalCompanyCode(conn, companyUserId, {
      inTransaction: isPool ? false : Boolean(options.inTransaction)
    });

    const seqName = `amc_contract_${companyCode}`;

    // Reconcile sequence floor strictly from existing canonical contracts for this numeric company user
    const [existingContracts] = await conn.query(
      'SELECT contract_number FROM amc_contracts WHERE company_id = ?',
      [Number(companyUserId)]
    );

    let maxExisting = 0;
    for (const row of existingContracts) {
      const suffixNum = parseCompanyContractSequenceSuffix(row.contract_number, companyCode);
      if (suffixNum !== null && suffixNum > maxExisting) {
        maxExisting = suffixNum;
      }
    }

    await conn.query(
      'INSERT IGNORE INTO app_sequences (sequence_name, current_val) VALUES (?, ?)',
      [seqName, maxExisting]
    );

    const [updateRes] = await conn.query(
      'UPDATE app_sequences SET current_val = LAST_INSERT_ID(GREATEST(current_val, ?) + 1) WHERE sequence_name = ?',
      [maxExisting, seqName]
    );
    if (!updateRes || updateRes.affectedRows === 0) {
      const err = new Error(`Failed to advance AMC contract sequence "${seqName}".`);
      err.code = 'CONTRACT_SEQUENCE_UPDATE_FAILED';
      throw err;
    }

    const [[{ nextVal }]] = await conn.query('SELECT LAST_INSERT_ID() AS nextVal');
    let seqVal = Number(nextVal);
    if (!Number.isInteger(seqVal) || seqVal <= 0) {
      const err = new Error(`Invalid AMC contract sequence value returned for "${seqName}".`);
      err.code = 'CONTRACT_SEQUENCE_INVALID';
      throw err;
    }

    const formatContractNumber = (val) => `AMC-${companyCode}-${String(val).padStart(3, '0')}`;
    let candidate = formatContractNumber(seqVal);

    const MAX_ATTEMPTS = 100;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const [collisions] = await conn.query(
        'SELECT id FROM amc_contracts WHERE contract_number = ? LIMIT 1',
        [candidate]
      );
      if (collisions.length === 0) {
        return candidate;
      }

      const [advRes] = await conn.query(
        'UPDATE app_sequences SET current_val = LAST_INSERT_ID(current_val + 1) WHERE sequence_name = ?',
        [seqName]
      );
      if (!advRes || advRes.affectedRows === 0) {
        const err = new Error(`Failed to advance AMC contract sequence "${seqName}" during collision handling.`);
        err.code = 'CONTRACT_SEQUENCE_UPDATE_FAILED';
        throw err;
      }

      const [[{ advancedVal }]] = await conn.query('SELECT LAST_INSERT_ID() AS advancedVal');
      const nextAdvancedVal = Number(advancedVal);
      if (!Number.isInteger(nextAdvancedVal) || nextAdvancedVal <= seqVal) {
        const err = new Error(`Invalid advanced AMC contract sequence value returned for "${seqName}".`);
        err.code = 'CONTRACT_SEQUENCE_INVALID';
        throw err;
      }

      seqVal = nextAdvancedVal;
      candidate = formatContractNumber(seqVal);
    }

    const limitErr = new Error(
      `Unable to allocate a unique AMC contract number for company "${companyCode}" after ${MAX_ATTEMPTS} collision retries.`
    );
    limitErr.code = 'CONTRACT_NUMBER_ALLOCATION_FAILED';
    throw limitErr;
  } finally {
    if (isPool && conn) {
      conn.release();
    }
  }
};

/**
 * Resolves the permanent account ID based on customer, corporate identity, or AMC status:
 * - Customer: TD-001, TD-002, TD-170, TD-9103...
 * - Company (standard): CMP-001, CMP-002, CMP-004...
 * - Company (AMC): TD-AMC-C001, TD-AMC-C002...
 *
 * @param {Object} connection - MySQL database connection
 * @param {Object} options - { userId, companyId, isAmc }
 * @returns {Promise<string>} Permanent Account ID
 */
const resolvePermanentAccountId = async (connection, options = {}) => {
  const { userId, companyId, isAmc } = options;

  const formatAmcCompanyId = (canonicalCompId) => {
    const upper = String(canonicalCompId).trim().toUpperCase();
    if (upper.startsWith('TD-AMC-C')) {
      return upper;
    }
    if (upper.startsWith('CMP-')) {
      return `TD-AMC-C${upper.substring(4)}`;
    }
    if (upper.startsWith('TD-C')) {
      return `TD-AMC-C${upper.substring(4)}`;
    }
    if (upper.startsWith('C')) {
      return `TD-AMC-${upper}`;
    }
    const padded = String(canonicalCompId).padStart(3, '0');
    return `TD-AMC-C${padded}`;
  };

  // 1. If an explicit canonical Company ID string was passed (e.g. 'CMP-001')
  if (typeof companyId === 'string' && companyId.trim().toUpperCase().startsWith('CMP-')) {
    const canonical = companyId.trim().toUpperCase();
    return isAmc ? formatAmcCompanyId(canonical) : canonical;
  }

  // 2. If companyId was passed (could be numeric users.id, company_profiles.id, or company code string)
  if (companyId) {
    try {
      const [profiles] = await connection.query(
        'SELECT u.id, COALESCE(p.company_id, u.company_id) AS canonical_company_id FROM users u LEFT JOIN company_profiles p ON u.id = p.user_id WHERE u.id = ? OR p.id = ? OR u.company_id = ? OR p.company_id = ? LIMIT 1',
        [companyId, companyId, String(companyId), String(companyId)]
      );
      if (profiles && profiles.length > 0 && profiles[0].canonical_company_id) {
        const canonical = profiles[0].canonical_company_id;
        return isAmc ? formatAmcCompanyId(canonical) : canonical;
      }
    } catch (e) {
      // fallback
    }

    // Preserve explicit legacy test formats if specifically provided as string
    if (typeof companyId === 'string' && (companyId.startsWith('TD-C') || companyId.startsWith('TD-AMC-C'))) {
      if (isAmc && companyId.startsWith('TD-C')) {
        return formatAmcCompanyId(companyId);
      }
      return companyId;
    }

    // Default canonical format for unpersisted company IDs
    const paddedCompId = String(companyId).padStart(3, '0');
    return isAmc ? `TD-AMC-C${paddedCompId}` : `CMP-${paddedCompId}`;
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
          const canonical = users[0].canonical_company_id || `CMP-${String(users[0].id).padStart(3, '0')}`;
          return isAmc ? formatAmcCompanyId(canonical) : canonical;
        }
        // Customer
        if (isAmc) {
          return formatAmcCompanyId(users[0].id);
        }
        return `TD-${String(users[0].id).padStart(3, '0')}`;
      }
    } catch (e) {
      // ignore
    }
    const paddedUserId = String(userId).padStart(3, '0');
    return isAmc ? `TD-AMC-C${paddedUserId}` : `TD-${paddedUserId}`;
  }

  return isAmc ? 'TD-AMC-C001' : 'TD-001';
};

/**
 * Generates the authoritative per-customer / per-company sequential ticket ID:
 * Format:
 * - AMC Company: TD-AMC-C001-01, TD-AMC-C001-02, TD-AMC-C002-01... (2-digit serial)
 * - Standard Company: CMP-001-001, CMP-001-002, CMP-002-001... (3-digit serial)
 * - Customer: TD-001-01, TD-001-02, TD-170-01... (2-digit serial)
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
    if (optionsOrType === 'AMC') {
      permanentAccountId = 'TD-AMC-C001';
    } else if (optionsOrType === 'Company') {
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

  const isCompanyNonAmc = permanentAccountId.toUpperCase().startsWith('CMP-');
  const seqPadding = isCompanyNonAmc ? 3 : 2;
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
    return `${permanentAccountId}-${uuidv4().substring(0, isCompanyNonAmc ? 3 : 4).toUpperCase()}`;
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
  resolveCanonicalCompanyCode,
  allocateNextCompanyAmcContractNumber,
  resolvePermanentAccountId,
  generateTicketNumber,
  formatResponse
};
