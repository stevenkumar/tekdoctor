const crypto = require('crypto');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const logger = require('../utils/logger');
const { generateInvoiceId } = require('../utils/helpers');
const { sendAdminNotification, sendCustomerNotification } = require('../utils/email.utils');

/**
 * Helper to resolve numeric company user ID from either numeric ID or string code (e.g. 'CMP-001').
 */
const resolveCompanyUserId = async (connection, companyIdOrCode) => {
  if (!companyIdOrCode) return null;
  if (typeof companyIdOrCode === 'number' || /^\d+$/.test(String(companyIdOrCode))) {
    return parseInt(companyIdOrCode, 10);
  }
  const cleanCode = String(companyIdOrCode).trim();
  const [rows] = await connection.query(
    'SELECT user_id FROM company_profiles WHERE company_id = ? LIMIT 1',
    [cleanCode]
  );
  if (rows.length > 0 && rows[0].user_id) {
    return rows[0].user_id;
  }
  const [userRows] = await connection.query(
    'SELECT id FROM users WHERE company_id = ? LIMIT 1',
    [cleanCode]
  );
  if (userRows.length > 0) {
    return userRows[0].id;
  }
  return null;
};

const AMC_TIMEZONE = config.amc?.businessTimezone || 'Asia/Kolkata';

/**
 * Format any Date object or string into canonical YYYY-MM-DD in the authoritative AMC business timezone (Fix 5 & Fix 6).
 */
const formatDateOnly = (d) => {
  if (!d) return null;
  if (typeof d === 'string') {
    const clean = d.trim();
    if (!clean) return null;
    // Pure YYYY-MM-DD string
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    // Date with time (e.g. ISO 8601 or SQL datetime)
    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: AMC_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(parsed);
    }
    // Fallback if not parsable
    if (/^\d{4}-\d{2}-\d{2}/.test(clean)) return clean.slice(0, 10);
    return null;
  }
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: AMC_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  }
  return null;
};

/**
 * Current calendar date in the authoritative AMC business timezone (Asia/Kolkata) as YYYY-MM-DD.
 */
const getBusinessTodayStr = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: AMC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
};

/**
 * Add days to a YYYY-MM-DD date string using UTC arithmetic to eliminate daylight-savings shifts.
 */
const addDaysOnly = (dateStr, days) => {
  const clean = formatDateOnly(dateStr);
  if (!clean) return null;
  const d = new Date(clean + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * 1. Authoritative AMC Repair Eligibility Checker
 * Resolves whether a device is currently covered under an active, approved, paid AMC contract.
 *
 * @param {Object} connectionOrPool - MySQL connection or pool
 * @param {Object} params
 * @param {number|string} params.companyId - Numeric user_id or canonical company code (CMP-001)
 * @param {number} [params.deviceId] - ID of device in company_devices
 * @param {Date|string} [params.repairDate] - Date of repair request (defaults to current date)
 * @returns {Promise<{ isEligible: boolean, reason: string|null, contract: Object|null, coverage: Object|null }>}
 */
const resolveDeviceAmcEligibility = async (connectionOrPool, { companyId, deviceId, repairDate } = {}) => {
  const isPool = typeof connectionOrPool.getConnection === 'function';
  const connection = isPool ? await connectionOrPool.getConnection() : connectionOrPool;

  try {
    const resolvedCompanyId = await resolveCompanyUserId(connection, companyId);
    if (!resolvedCompanyId) {
      return {
        isEligible: false,
        reason: 'COMPANY_NOT_FOUND',
        contract: null,
        coverage: null
      };
    }

    const targetDate = repairDate ? formatDateOnly(repairDate) : getBusinessTodayStr();

    // If no specific device is provided, check if the company has any active, approved, paid contract
    if (!deviceId) {
      const [contracts] = await connection.query(`
        SELECT id, contract_number, plan_name, device_capacity, status, approval_status, payment_status, start_date, end_date
        FROM amc_contracts
        WHERE company_id = ?
          AND status = 'active'
          AND approval_status = 'approved'
          AND payment_status = 'paid'
          AND start_date <= ?
          AND end_date >= ?
        ORDER BY end_date DESC
        LIMIT 1
      `, [resolvedCompanyId, targetDate, targetDate]);

      if (contracts.length === 0) {
        return {
          isEligible: false,
          reason: 'NO_ACTIVE_CONTRACT',
          contract: null,
          coverage: null
        };
      }

      return {
        isEligible: false, // Specific device is required for repair ticket coverage
        reason: 'DEVICE_NOT_SPECIFIED',
        contract: contracts[0],
        coverage: null
      };
    }

    // Verify device belongs to this company
    const [devRows] = await connection.query(
      'SELECT id, brand, model_number, serial_number, is_active FROM company_devices WHERE id = ? AND company_id = ? LIMIT 1',
      [deviceId, resolvedCompanyId]
    );

    if (devRows.length === 0) {
      return {
        isEligible: false,
        reason: 'DEVICE_NOT_FOUND_FOR_COMPANY',
        contract: null,
        coverage: null
      };
    }

    // Query active coverage for device under an active, approved, paid AMC contract with valid dates
    const [coverageRows] = await connection.query(`
      SELECT 
        cd.id AS coverage_id,
        cd.contract_id,
        cd.device_id,
        cd.amc_tag,
        cd.coverage_start_date,
        cd.coverage_end_date,
        cd.status AS coverage_status,
        c.contract_number,
        c.plan_name,
        c.device_capacity,
        c.status AS contract_status,
        c.approval_status,
        c.payment_status,
        c.start_date,
        c.end_date
      FROM amc_covered_devices cd
      JOIN amc_contracts c ON cd.contract_id = c.id
      WHERE cd.device_id = ?
        AND cd.company_id = ?
        AND cd.status = 'active'
        AND c.company_id = ?
        AND c.status = 'active'
        AND c.approval_status = 'approved'
        AND c.payment_status = 'paid'
        AND c.start_date <= ?
        AND c.end_date >= ?
        AND cd.coverage_start_date <= ?
        AND cd.coverage_end_date >= ?
      ORDER BY c.end_date DESC
      LIMIT 1
    `, [deviceId, resolvedCompanyId, resolvedCompanyId, targetDate, targetDate, targetDate, targetDate]);

    if (coverageRows.length > 0) {
      const row = coverageRows[0];
      return {
        isEligible: true,
        reason: null,
        contract: {
          id: row.contract_id,
          contract_number: row.contract_number,
          plan_name: row.plan_name,
          device_capacity: row.device_capacity,
          start_date: row.start_date,
          end_date: row.end_date,
          status: row.contract_status,
          approval_status: row.approval_status,
          payment_status: row.payment_status
        },
        coverage: {
          id: row.coverage_id,
          amc_tag: row.amc_tag,
          coverage_start_date: row.coverage_start_date,
          coverage_end_date: row.coverage_end_date,
          status: row.coverage_status
        }
      };
    }

    // Check why not eligible for helpful diagnostics
    const [anyContract] = await connection.query(`
      SELECT id, status, approval_status, payment_status, start_date, end_date
      FROM amc_contracts
      WHERE company_id = ?
      ORDER BY id DESC
      LIMIT 1
    `, [resolvedCompanyId]);

    if (anyContract.length === 0) {
      return { isEligible: false, reason: 'NO_CONTRACT_RECORD', contract: null, coverage: null };
    }

    const cnt = anyContract[0];
    if (cnt.approval_status !== 'approved') {
      return { isEligible: false, reason: 'CONTRACT_NOT_APPROVED', contract: cnt, coverage: null };
    }
    if (cnt.payment_status !== 'paid') {
      return { isEligible: false, reason: 'CONTRACT_UNPAID', contract: cnt, coverage: null };
    }
    if (cnt.status !== 'active') {
      return { isEligible: false, reason: `CONTRACT_${cnt.status.toUpperCase()}`, contract: cnt, coverage: null };
    }

    const targetDateStr = formatDateOnly(targetDate);
    const startDateStr = formatDateOnly(cnt.start_date);
    const endDateStr = formatDateOnly(cnt.end_date);
    if (startDateStr && startDateStr > targetDateStr) {
      return { isEligible: false, reason: 'CONTRACT_NOT_STARTED', contract: cnt, coverage: null };
    }
    if (endDateStr && endDateStr < targetDateStr) {
      return { isEligible: false, reason: 'CONTRACT_EXPIRED', contract: cnt, coverage: null };
    }

    // Check if contract has zero allocated devices (incomplete device selection)
    const [coveredCountRows] = await connection.query(`
      SELECT COUNT(*) AS activeCount FROM amc_covered_devices WHERE contract_id = ? AND status = 'active'
    `, [cnt.id]);
    const contractCoveredCount = coveredCountRows[0]?.activeCount || 0;
    if (contractCoveredCount === 0) {
      return { isEligible: false, reason: 'CONTRACT_HAS_ZERO_ALLOCATED_DEVICES', contract: cnt, coverage: null };
    }

    const [deviceInContract] = await connection.query(`
      SELECT id, status FROM amc_covered_devices WHERE device_id = ? AND company_id = ? LIMIT 1
    `, [deviceId, resolvedCompanyId]);

    if (deviceInContract.length === 0) {
      return { isEligible: false, reason: 'DEVICE_NOT_IN_COVERED_FLEET', contract: cnt, coverage: null };
    }

    return { isEligible: false, reason: 'DEVICE_COVERAGE_INACTIVE_OR_EXPIRED', contract: cnt, coverage: deviceInContract[0] };
  } finally {
    if (isPool && connection) {
      connection.release();
    }
  }
};

/**
 * 2. Check Contract Capacity
 * Computes capacity, covered device count, and available slots.
 */
const checkContractCapacity = async (connectionOrPool, contractId) => {
  const isPool = typeof connectionOrPool.getConnection === 'function';
  const connection = isPool ? await connectionOrPool.getConnection() : connectionOrPool;

  try {
    const [contracts] = await connection.query(
      'SELECT id, contract_number, company_id, device_capacity, status, approval_status, payment_status FROM amc_contracts WHERE id = ? LIMIT 1',
      [contractId]
    );

    if (contracts.length === 0) {
      throw new Error(`AMC Contract ${contractId} not found.`);
    }

    const contract = contracts[0];
    const [countRows] = await connection.query(
      'SELECT COUNT(*) AS coveredCount FROM amc_covered_devices WHERE contract_id = ? AND status = ?',
      [contractId, 'active']
    );

    const coveredCount = countRows[0].coveredCount || 0;
    const capacity = contract.device_capacity;
    const availableSlots = Math.max(0, capacity - coveredCount);

    const [coveredRows] = await connection.query(
      'SELECT device_id FROM amc_covered_devices WHERE contract_id = ? AND status = ?',
      [contractId, 'active']
    );
    const coveredDeviceIds = coveredRows.map(r => r.device_id);

    const [companyCoveredRows] = await connection.query(
      `SELECT cd.device_id 
       FROM amc_covered_devices cd
       JOIN amc_contracts c ON cd.contract_id = c.id
       WHERE c.company_id = ? AND cd.status = 'active' AND c.status = 'active'`,
      [contract.company_id]
    );
    const companyCoveredDeviceIds = companyCoveredRows.map(r => r.device_id);

    return {
      contractId: contract.id,
      contractNumber: contract.contract_number,
      companyId: contract.company_id,
      capacity,
      coveredCount,
      availableSlots,
      isAtCapacity: coveredCount >= capacity,
      status: contract.status,
      coveredDeviceIds,
      companyCoveredDeviceIds
    };
  } finally {
    if (isPool && connection) {
      connection.release();
    }
  }
};

/**
 * 3. Assign Devices to AMC Coverage
 * Validates capacity, company ownership, and assigns devices atomically.
 */
const assignDevicesToCoverage = async (connectionOrPool, { contractId, companyId, deviceIds, userId }) => {
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
    throw new Error('Device IDs array is required and must not be empty.');
  }

  const isExternalConnection = typeof connectionOrPool.beginTransaction === 'function' && typeof connectionOrPool.getConnection !== 'function';
  const connection = isExternalConnection ? connectionOrPool : await pool.getConnection();

  if (!isExternalConnection) {
    await connection.beginTransaction();
  }

  try {
    const resolvedCompanyId = await resolveCompanyUserId(connection, companyId);
    if (!resolvedCompanyId) {
      throw new Error('Company not found.');
    }

    // Row-level lock on contract
    const [contracts] = await connection.query(
      'SELECT * FROM amc_contracts WHERE id = ? AND company_id = ? FOR UPDATE',
      [contractId, resolvedCompanyId]
    );

    if (contracts.length === 0) {
      throw new Error('Contract not found or does not belong to this company.');
    }

    const contract = contracts[0];
    if (!['active', 'accepted', 'draft', 'offered'].includes(contract.status)) {
      throw new Error(`Cannot assign devices to a contract with status "${contract.status}".`);
    }

    // Selection deadline verification (Fix C)
    if (contract.selection_deadline) {
      const deadlineStr = formatDateOnly(contract.selection_deadline);
      const todayStr = getBusinessTodayStr();
      if (deadlineStr < todayStr) {
        throw new Error(`Device allocation window closed on ${deadlineStr}. Allocation past the selection deadline is prohibited.`);
      }
    }

    // Capacity verification
    const [countRows] = await connection.query(
      'SELECT COUNT(*) AS activeCount FROM amc_covered_devices WHERE contract_id = ? AND status = ?',
      [contractId, 'active']
    );
    const activeCount = countRows[0].activeCount || 0;
    const remainingSlots = contract.device_capacity - activeCount;

    if (deviceIds.length > remainingSlots) {
      throw new Error(`CAPACITY_EXCEEDED: Selecting ${deviceIds.length} devices exceeds remaining capacity of ${remainingSlots} slot(s).`);
    }

    // Validate that all devices belong to this company
    const [devices] = await connection.query(
      'SELECT id, brand, model_number, serial_number, is_active FROM company_devices WHERE id IN (?) AND company_id = ?',
      [deviceIds, resolvedCompanyId]
    );

    if (devices.length !== deviceIds.length) {
      throw new Error('INVALID_DEVICE: One or more selected devices do not belong to this company fleet.');
    }

    // Check if any device already has active coverage in ANY contract
    const [existingCoverage] = await connection.query(
      'SELECT device_id FROM amc_covered_devices WHERE device_id IN (?) AND status = ?',
      [deviceIds, 'active']
    );

    if (existingCoverage.length > 0) {
      const dupeIds = existingCoverage.map(r => r.device_id).join(', ');
      throw new Error(`ALREADY_COVERED: Device(s) [${dupeIds}] already have active AMC coverage.`);
    }

    const startDate = contract.start_date ? formatDateOnly(contract.start_date) : formatDateOnly(new Date());
    const endDate = contract.end_date ? formatDateOnly(contract.end_date) : formatDateOnly(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

    // Get current max sequence number for tag generation
    const [tagRows] = await connection.query(
      'SELECT COUNT(*) AS totalTags FROM amc_covered_devices WHERE contract_id = ?',
      [contractId]
    );
    let tagSeq = (tagRows[0]?.totalTags || 0) + 1;

    for (const dev of devices) {
      const amcTag = `${contract.contract_number}-DEV-${String(tagSeq++).padStart(3, '0')}`;

      await connection.query(`
        INSERT INTO amc_covered_devices 
          (contract_id, device_id, company_id, amc_tag, coverage_start_date, coverage_end_date, status, selected_by)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
      `, [contractId, dev.id, resolvedCompanyId, amcTag, startDate, endDate, userId || null]);

      // Backward compatibility sync for legacy device table fields
      await connection.query(
        'UPDATE company_devices SET is_amc = 1, amc_tag = ? WHERE id = ?',
        [amcTag, dev.id]
      );
    }

    // Record audit history
    await connection.query(`
      INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
      VALUES (?, 'DEVICES_ASSIGNED', ?, ?)
    `, [contractId, userId || null, JSON.stringify({ deviceIds, assignedCount: devices.length })]);

    if (!isExternalConnection) {
      await connection.commit();
    }

    return {
      success: true,
      contractId,
      assignedCount: devices.length,
      deviceIds
    };
  } catch (error) {
    if (!isExternalConnection) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (!isExternalConnection && connection) {
      connection.release();
    }
  }
};

/**
 * 4. Request Device Replacement
 * Creates a replacement request without mutating active coverage until approved by Admin.
 */
const requestDeviceReplacement = async (connectionOrPool, { contractId, companyId, oldDeviceId, newDeviceId, reason, userId }) => {
  if (!oldDeviceId || !newDeviceId) {
    throw new Error('Both old device and replacement device are required.');
  }
  if (oldDeviceId === newDeviceId) {
    throw new Error('Replacement device must be different from current device.');
  }
  if (!reason || !reason.trim()) {
    throw new Error('Replacement reason is required.');
  }

  const isExternalConnection = typeof connectionOrPool.beginTransaction === 'function' && typeof connectionOrPool.getConnection !== 'function';
  const connection = isExternalConnection ? connectionOrPool : await pool.getConnection();

  if (!isExternalConnection) {
    await connection.beginTransaction();
  }

  try {
    const resolvedCompanyId = await resolveCompanyUserId(connection, companyId);
    if (!resolvedCompanyId) {
      throw new Error('Company not found.');
    }

    // Verify contract
    const [contracts] = await connection.query(
      'SELECT id, contract_number, status FROM amc_contracts WHERE id = ? AND company_id = ?',
      [contractId, resolvedCompanyId]
    );
    if (contracts.length === 0) {
      throw new Error('Contract not found or does not belong to company.');
    }

    // Verify old device has active coverage under this contract
    const [oldCov] = await connection.query(
      'SELECT * FROM amc_covered_devices WHERE contract_id = ? AND device_id = ? AND status = ?',
      [contractId, oldDeviceId, 'active']
    );
    if (oldCov.length === 0) {
      throw new Error('Current device is not actively covered under this contract.');
    }

    // Verify new device belongs to company fleet
    const [newDev] = await connection.query(
      'SELECT id, brand, model_number, serial_number, is_active FROM company_devices WHERE id = ? AND company_id = ?',
      [newDeviceId, resolvedCompanyId]
    );
    if (newDev.length === 0) {
      throw new Error('Replacement device does not exist in your registered fleet.');
    }

    // Verify new device does not already have active coverage
    const [newCov] = await connection.query(
      'SELECT id FROM amc_covered_devices WHERE device_id = ? AND status = ?',
      [newDeviceId, 'active']
    );
    if (newCov.length > 0) {
      throw new Error('Replacement device already has active AMC coverage.');
    }

    // Verify no pending replacement exists for these devices
    const [pendingReq] = await connection.query(
      'SELECT id FROM amc_device_replacements WHERE contract_id = ? AND status = ? AND (old_device_id = ? OR new_device_id = ?)',
      [contractId, 'pending', oldDeviceId, newDeviceId]
    );
    if (pendingReq.length > 0) {
      throw new Error('A replacement request is already pending for this device.');
    }

    const replacementNumber = `REP-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const [insertResult] = await connection.query(`
      INSERT INTO amc_device_replacements
        (replacement_number, contract_id, company_id, old_device_id, new_device_id, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `, [replacementNumber, contractId, resolvedCompanyId, oldDeviceId, newDeviceId, reason.trim()]);

    await connection.query(`
      INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
      VALUES (?, 'REPLACEMENT_REQUESTED', ?, ?)
    `, [contractId, userId || null, JSON.stringify({ replacementNumber, oldDeviceId, newDeviceId, reason })]);

    if (!isExternalConnection) {
      await connection.commit();
    }

    return {
      id: insertResult.insertId,
      replacementNumber,
      contractId,
      oldDeviceId,
      newDeviceId,
      status: 'pending'
    };
  } catch (error) {
    if (!isExternalConnection) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (!isExternalConnection && connection) {
      connection.release();
    }
  }
};

/**
 * 5. Review Device Replacement (Admin only)
 * Approves or rejects a device replacement request.
 */
const reviewDeviceReplacement = async (connectionOrPool, { replacementId, adminUserId, decision, adminNotes }) => {
  if (!['approved', 'rejected'].includes(decision)) {
    throw new Error('Decision must be either "approved" or "rejected".');
  }

  const isExternalConnection = typeof connectionOrPool.beginTransaction === 'function' && typeof connectionOrPool.getConnection !== 'function';
  const connection = isExternalConnection ? connectionOrPool : await pool.getConnection();

  if (!isExternalConnection) {
    await connection.beginTransaction();
  }

  try {
    const [rows] = await connection.query(
      'SELECT * FROM amc_device_replacements WHERE id = ? FOR UPDATE',
      [replacementId]
    );

    if (rows.length === 0) {
      throw new Error(`Replacement request ${replacementId} not found.`);
    }

    const req = rows[0];
    if (req.status !== 'pending') {
      throw new Error(`Replacement request has already been reviewed (status: ${req.status}).`);
    }

    const [contracts] = await connection.query(
      'SELECT * FROM amc_contracts WHERE id = ?',
      [req.contract_id]
    );
    const contract = contracts[0];

    if (decision === 'approved') {
      // 1. Mark replacement approved
      await connection.query(`
        UPDATE amc_device_replacements 
        SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, effective_date = CURRENT_DATE, admin_notes = ?
        WHERE id = ?
      `, [adminUserId, adminNotes || null, replacementId]);

      // 2. Decommission old device from contract coverage
      await connection.query(`
        UPDATE amc_covered_devices 
        SET status = 'replaced' 
        WHERE contract_id = ? AND device_id = ? AND status = 'active'
      `, [req.contract_id, req.old_device_id]);

      // Reset legacy flag on old device
      await connection.query(
        'UPDATE company_devices SET is_amc = 0 WHERE id = ?',
        [req.old_device_id]
      );

      // 3. Add new device to active coverage
      const [oldCov] = await connection.query(
        'SELECT amc_tag FROM amc_covered_devices WHERE contract_id = ? AND device_id = ? ORDER BY id DESC LIMIT 1',
        [req.contract_id, req.old_device_id]
      );
      const inheritedTag = oldCov[0]?.amc_tag || `${contract.contract_number}-REP-${req.new_device_id}`;
      const startDate = new Date().toISOString().slice(0, 10);
      const endDate = contract.end_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      await connection.query(`
        INSERT INTO amc_covered_devices 
          (contract_id, device_id, company_id, amc_tag, coverage_start_date, coverage_end_date, status, selected_by)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
      `, [req.contract_id, req.new_device_id, req.company_id, inheritedTag, startDate, endDate, adminUserId]);

      await connection.query(
        'UPDATE company_devices SET is_amc = 1, amc_tag = ? WHERE id = ?',
        [inheritedTag, req.new_device_id]
      );

      // 4. Record history
      await connection.query(`
        INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
        VALUES (?, 'REPLACEMENT_APPROVED', ?, ?)
      `, [req.contract_id, adminUserId, JSON.stringify({ replacementId, oldDeviceId: req.old_device_id, newDeviceId: req.new_device_id, adminNotes })]);
    } else {
      // Rejected
      await connection.query(`
        UPDATE amc_device_replacements 
        SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, admin_notes = ?
        WHERE id = ?
      `, [adminUserId, adminNotes || null, replacementId]);

      await connection.query(`
        INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
        VALUES (?, 'REPLACEMENT_REJECTED', ?, ?)
      `, [req.contract_id, adminUserId, JSON.stringify({ replacementId, adminNotes })]);
    }

    if (!isExternalConnection) {
      await connection.commit();
    }

    return {
      replacementId,
      decision,
      contractId: req.contract_id
    };
  } catch (error) {
    if (!isExternalConnection) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (!isExternalConnection && connection) {
      connection.release();
    }
  }
};

/**
 * 6. Plan Management
 */
const getPlans = async ({ isActiveOnly = false } = {}) => {
  let sql = 'SELECT * FROM amc_plans';
  const params = [];
  if (isActiveOnly) {
    sql += ' WHERE is_active = TRUE';
  }
  sql += ' ORDER BY base_price ASC';
  const [plans] = await pool.query(sql, params);
  return plans;
};

const createPlan = async ({ planCode, name, description, basePrice, durationMonths = 12, defaultDeviceCapacity = 10, coverageTerms = null }) => {
  const [result] = await pool.query(`
    INSERT INTO amc_plans 
      (plan_code, name, description, base_price, duration_months, default_device_capacity, coverage_terms, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
  `, [
    planCode.toUpperCase().trim(),
    name.trim(),
    description || null,
    basePrice,
    durationMonths,
    defaultDeviceCapacity,
    coverageTerms ? (typeof coverageTerms === 'string' ? coverageTerms : JSON.stringify(coverageTerms)) : null
  ]);
  return { id: result.insertId, planCode };
};

/**
 * 7. AMC Requests
 */
const createAmcRequest = async ({ companyId, planId, requestedDeviceCount = 1, notes = '' }) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  if (!resolvedCompanyId) {
    throw new Error('Company not found.');
  }

  const requestNumber = `REQ-AMC-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

  const [result] = await pool.query(`
    INSERT INTO amc_requests (request_number, company_id, plan_id, requested_device_count, notes, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `, [requestNumber, resolvedCompanyId, planId || null, requestedDeviceCount, notes || null]);

  return { id: result.insertId, requestNumber };
};

const getAmcRequests = async ({ companyId = null, status = null } = {}) => {
  let sql = `
    SELECT r.*, p.name AS plan_name, p.plan_code, u.name AS company_name, cp.company_id AS canonical_company_id,
           adm.name AS reviewed_by_name
    FROM amc_requests r
    LEFT JOIN amc_plans p ON r.plan_id = p.id
    LEFT JOIN users u ON r.company_id = u.id
    LEFT JOIN company_profiles cp ON u.id = cp.user_id
    LEFT JOIN users adm ON r.reviewed_by = adm.id
    WHERE 1=1
  `;
  const params = [];
  if (companyId) {
    const resolvedId = await resolveCompanyUserId(pool, companyId);
    sql += ' AND r.company_id = ?';
    params.push(resolvedId);
  }
  if (status) {
    sql += ' AND r.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY r.created_at DESC';
  const [rows] = await pool.query(sql, params);
  return rows;
};

/**
 * 8. Contract Creation and Lifecycle
 */
const createAmcContract = async ({
  companyId,
  requestId = null,
  planId = null,
  contractType = 'standard',
  planName,
  deviceCapacity,
  price,
  discountAmount = 0.00,
  taxAmount = 0.00,
  totalAmount,
  termsAndConditions = null,
  offerValidUntil = null,
  selectionDeadline = null,
  startDate = null,
  endDate = null,
  createdBy = null
}) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  if (!resolvedCompanyId) {
    throw new Error('Company not found.');
  }

  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      throw new Error('Invalid start date or end date format.');
    }
    if (e < s) {
      throw new Error('Contract end date cannot be earlier than start date.');
    }
  }

  const contractNumber = `AMC-CTR-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

  const [result] = await pool.query(`
    INSERT INTO amc_contracts (
      contract_number, company_id, request_id, plan_id, contract_type,
      plan_name, device_capacity, price, discount_amount, tax_amount, total_amount,
      terms_and_conditions, offer_valid_until, selection_deadline, start_date, end_date,
      status, approval_status, payment_status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offered', 'pending_approval', 'unpaid', ?)
  `, [
    contractNumber, resolvedCompanyId, requestId || null, planId || null, contractType,
    planName, deviceCapacity, price, discountAmount, taxAmount, totalAmount,
    termsAndConditions || null,
    offerValidUntil ? formatDateOnly(offerValidUntil) : null,
    selectionDeadline ? formatDateOnly(selectionDeadline) : null,
    startDate ? formatDateOnly(startDate) : null,
    endDate ? formatDateOnly(endDate) : null,
    createdBy || null
  ]);

  if (requestId) {
    await pool.query('UPDATE amc_requests SET status = "offered" WHERE id = ?', [requestId]);
  }

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'CONTRACT_CREATED', ?, ?)
  `, [result.insertId, createdBy || null, JSON.stringify({ contractNumber, planName, deviceCapacity, totalAmount })]);

  return { id: result.insertId, contractNumber };
};

const getContracts = async ({ companyId = null, status = null } = {}) => {
  let sql = `
    SELECT c.*, u.name AS company_name, cp.company_id AS canonical_company_id,
      (SELECT COUNT(*) FROM amc_covered_devices cd WHERE cd.contract_id = c.id AND cd.status = 'active') AS active_covered_count,
      (SELECT h.details FROM amc_contract_history h WHERE h.contract_id = c.id AND h.action IN ('OFFER_REJECTED', 'CONTRACT_REJECTED') ORDER BY h.id DESC LIMIT 1) AS rejection_details_raw,
      (SELECT h.action FROM amc_contract_history h WHERE h.contract_id = c.id AND h.action IN ('OFFER_REJECTED', 'CONTRACT_REJECTED') ORDER BY h.id DESC LIMIT 1) AS rejection_action_raw,
      (SELECT h.created_at FROM amc_contract_history h WHERE h.contract_id = c.id AND h.action IN ('OFFER_REJECTED', 'CONTRACT_REJECTED') ORDER BY h.id DESC LIMIT 1) AS rejection_created_at,
      (SELECT adm.name FROM amc_contract_history h JOIN users adm ON h.performed_by = adm.id WHERE h.contract_id = c.id AND h.action IN ('OFFER_REJECTED', 'CONTRACT_REJECTED') ORDER BY h.id DESC LIMIT 1) AS rejection_user_name
    FROM amc_contracts c
    LEFT JOIN users u ON c.company_id = u.id
    LEFT JOIN company_profiles cp ON u.id = cp.user_id
    WHERE 1=1
  `;
  const params = [];
  if (companyId) {
    const resolvedId = await resolveCompanyUserId(pool, companyId);
    sql += ' AND c.company_id = ?';
    params.push(resolvedId);
  }
  if (status) {
    sql += ' AND c.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY c.created_at DESC';
  const [rows] = await pool.query(sql, params);
  return rows.map(r => {
    let rejectionReason = null;
    let rejectionSource = null;
    let rejectedAt = r.rejection_created_at || null;
    let rejectedByName = r.rejection_user_name || null;

    if (r.rejection_details_raw) {
      try {
        const parsed = typeof r.rejection_details_raw === 'string' ? JSON.parse(r.rejection_details_raw) : r.rejection_details_raw;
        rejectionReason = parsed.reason || null;
        rejectionSource = parsed.rejection_source || (r.rejection_action_raw === 'OFFER_REJECTED' ? 'Company' : 'Admin');
      } catch (e) {}
    }

    return {
      ...r,
      active_covered_count: Number(r.active_covered_count || 0),
      rejection_reason: rejectionReason,
      rejection_source: rejectionSource,
      rejected_at: rejectedAt,
      rejected_by_name: rejectedByName,
      start_date: r.start_date ? formatDateOnly(r.start_date) : null,
      end_date: r.end_date ? formatDateOnly(r.end_date) : null,
      offer_valid_until: r.offer_valid_until ? formatDateOnly(r.offer_valid_until) : null,
      selection_deadline: r.selection_deadline ? formatDateOnly(r.selection_deadline) : null
    };
  });
};

const getContractDetails = async (contractId, companyId = null) => {
  let sql = `
    SELECT c.*, u.name AS company_name, u.email AS company_email, cp.company_id AS canonical_company_id,
      (SELECT COUNT(*) FROM amc_covered_devices cd WHERE cd.contract_id = c.id AND cd.status = 'active') AS active_covered_count
    FROM amc_contracts c
    LEFT JOIN users u ON c.company_id = u.id
    LEFT JOIN company_profiles cp ON u.id = cp.user_id
    WHERE c.id = ?
  `;
  const params = [contractId];

  if (companyId) {
    const resolvedId = await resolveCompanyUserId(pool, companyId);
    sql += ' AND c.company_id = ?';
    params.push(resolvedId);
  }

  const [contracts] = await pool.query(sql, params);
  if (contracts.length === 0) return null;

  const contract = contracts[0];

  // Covered devices
  const [devices] = await pool.query(`
    SELECT cd.*, d.brand, d.model_number, d.serial_number, d.asset_id, d.device_category
    FROM amc_covered_devices cd
    JOIN company_devices d ON cd.device_id = d.id
    WHERE cd.contract_id = ?
    ORDER BY cd.id ASC
  `, [contractId]);

  // History
  const [history] = await pool.query(`
    SELECT h.*, u.name AS performed_by_name
    FROM amc_contract_history h
    LEFT JOIN users u ON h.performed_by = u.id
    WHERE h.contract_id = ?
    ORDER BY h.created_at ASC
  `, [contractId]);

  // Replacements
  const [replacements] = await pool.query(`
    SELECT r.*, 
      old_dev.brand AS old_brand, old_dev.model_number AS old_model, old_dev.serial_number AS old_serial,
      new_dev.brand AS new_brand, new_dev.model_number AS new_model, new_dev.serial_number AS new_serial
    FROM amc_device_replacements r
    JOIN company_devices old_dev ON r.old_device_id = old_dev.id
    JOIN company_devices new_dev ON r.new_device_id = new_dev.id
    WHERE r.contract_id = ?
    ORDER BY r.created_at DESC
  `, [contractId]);

  let rejectionReason = null;
  let rejectionSource = null;
  let rejectedAt = null;
  let rejectedByName = null;

  const rejectionEntry = [...history].reverse().find(h => h.action === 'OFFER_REJECTED' || h.action === 'CONTRACT_REJECTED');
  if (rejectionEntry) {
    let detailsObj = rejectionEntry.details;
    if (typeof detailsObj === 'string') {
      try { detailsObj = JSON.parse(detailsObj); } catch (e) {}
    }
    rejectionReason = detailsObj?.reason || null;
    rejectionSource = detailsObj?.rejection_source || (rejectionEntry.action === 'OFFER_REJECTED' ? 'Company' : 'Admin');
    rejectedAt = rejectionEntry.created_at;
    rejectedByName = rejectionEntry.performed_by_name || null;
  }

  return {
    ...contract,
    active_covered_count: Number(contract.active_covered_count || 0),
    rejection_reason: rejectionReason,
    rejection_source: rejectionSource,
    rejected_at: rejectedAt,
    rejected_by_name: rejectedByName,
    start_date: contract.start_date ? formatDateOnly(contract.start_date) : null,
    end_date: contract.end_date ? formatDateOnly(contract.end_date) : null,
    offer_valid_until: contract.offer_valid_until ? formatDateOnly(contract.offer_valid_until) : null,
    selection_deadline: contract.selection_deadline ? formatDateOnly(contract.selection_deadline) : null,
    coveredDevices: devices.map(d => ({
      ...d,
      coverage_start_date: d.coverage_start_date ? formatDateOnly(d.coverage_start_date) : null,
      coverage_end_date: d.coverage_end_date ? formatDateOnly(d.coverage_end_date) : null
    })),
    history,
    replacements
  };
};

const acceptAmcOffer = async ({ contractId, companyId, userId }) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  const [contracts] = await pool.query(
    'SELECT * FROM amc_contracts WHERE id = ? AND company_id = ?',
    [contractId, resolvedCompanyId]
  );
  if (contracts.length === 0) throw new Error('Contract not found.');

  const contract = contracts[0];
  if (contract.status !== 'offered') {
    throw new Error(`Cannot accept contract with status "${contract.status}". Must be "offered".`);
  }

  if (contract.offer_valid_until && new Date(contract.offer_valid_until) < new Date(new Date().toISOString().slice(0, 10))) {
    await pool.query('UPDATE amc_contracts SET status = "expired" WHERE id = ?', [contractId]);
    await pool.query(`
      INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
      VALUES (?, 'OFFER_EXPIRED', ?, ?)
    `, [contractId, userId || null, JSON.stringify({ expiredAt: new Date().toISOString(), offerValidUntil: contract.offer_valid_until })]);
    throw new Error('This offer has expired and cannot be accepted.');
  }

  await pool.query(
    'UPDATE amc_contracts SET status = "accepted" WHERE id = ?',
    [contractId]
  );

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'OFFER_ACCEPTED', ?, ?)
  `, [contractId, userId || null, JSON.stringify({ acceptedAt: new Date() })]);

  return { success: true, contractId, status: 'accepted' };
};

const approveAmcContract = async ({ contractId, adminUserId, startDate = null, endDate = null }) => {
  const [contracts] = await pool.query('SELECT * FROM amc_contracts WHERE id = ?', [contractId]);
  if (contracts.length === 0) throw new Error('Contract not found.');

  const contract = contracts[0];
  if (contract.status === 'rejected' || contract.approval_status === 'rejected') {
    throw new Error('Cannot approve a rejected contract offer.');
  }

  const start = startDate ? formatDateOnly(startDate) : (contract.start_date ? formatDateOnly(contract.start_date) : formatDateOnly(new Date()));
  const end = endDate ? formatDateOnly(endDate) : (contract.end_date ? formatDateOnly(contract.end_date) : formatDateOnly(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)));

  if (new Date(end) < new Date(start)) {
    throw new Error('Contract end date cannot be earlier than start date.');
  }

  // If already paid, activating right away; otherwise stays accepted/pending payment
  const newStatus = contract.payment_status === 'paid' ? 'active' : (contract.status === 'accepted' ? 'accepted' : 'draft');

  await pool.query(`
    UPDATE amc_contracts
    SET approval_status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP,
        start_date = ?, end_date = ?, status = ?
    WHERE id = ?
  `, [adminUserId, start, end, newStatus, contractId]);

  if (newStatus === 'active') {
    await pool.query(`
      UPDATE amc_covered_devices
      SET coverage_start_date = ?, coverage_end_date = ?
      WHERE contract_id = ? AND status = 'active'
    `, [start, end, contractId]);
  }

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'CONTRACT_APPROVED', ?, ?)
  `, [contractId, adminUserId, JSON.stringify({ approvedBy: adminUserId, startDate: start, endDate: end, status: newStatus })]);

  return { success: true, contractId, approvalStatus: 'approved', status: newStatus };
};

const activateAmcContract = async ({ contractId, adminUserId = null }) => {
  const [contracts] = await pool.query('SELECT * FROM amc_contracts WHERE id = ?', [contractId]);
  if (contracts.length === 0) throw new Error('Contract not found.');

  const contract = contracts[0];
  if (contract.status === 'rejected' || contract.approval_status === 'rejected') {
    throw new Error('Cannot activate a rejected contract.');
  }
  if (contract.approval_status !== 'approved') {
    throw new Error('Contract must be approved by admin before activation.');
  }
  if (contract.payment_status !== 'paid') {
    throw new Error('Contract must be paid before activation.');
  }

  const start = contract.start_date ? formatDateOnly(contract.start_date) : formatDateOnly(new Date());
  const end = contract.end_date ? formatDateOnly(contract.end_date) : formatDateOnly(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

  await pool.query(`
    UPDATE amc_contracts 
    SET status = 'active', start_date = ?, end_date = ?
    WHERE id = ?
  `, [start, end, contractId]);

  // Update covered devices coverage dates if not set
  await pool.query(`
    UPDATE amc_covered_devices 
    SET coverage_start_date = ?, coverage_end_date = ?
    WHERE contract_id = ? AND status = 'active'
  `, [start, end, contractId]);

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'CONTRACT_ACTIVATED', ?, ?)
  `, [contractId, adminUserId, JSON.stringify({ activatedAt: new Date(), startDate: start, endDate: end })]);

  return { success: true, contractId, status: 'active' };
};

/**
 * 9. Notifications helper for AMC events
 * Supports independent in-app and email delivery tracking with awaited confirmation.
 */
const sendAmcNotification = async ({
  userId = null,
  companyId = null,
  role = null,
  title,
  message,
  ticketId = null,
  sendInApp = true,
  sendEmail = true
}) => {
  let inAppSuccess = !sendInApp;
  let emailSuccess = !sendEmail;
  let inAppError = null;
  let emailError = null;
  let recipientsCount = 0;

  try {
    const recipients = [];
    if (userId) {
      const [u] = await pool.query('SELECT id, email, name, role FROM users WHERE id = ?', [userId]);
      if (u.length > 0) recipients.push(u[0]);
    } else if (companyId) {
      const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
      if (resolvedCompanyId) {
        const [u] = await pool.query('SELECT id, email, name, role FROM users WHERE id = ?', [resolvedCompanyId]);
        if (u.length > 0) recipients.push(u[0]);
      }
    } else if (role === 'admin') {
      const [admins] = await pool.query('SELECT id, email, name, role FROM users WHERE role = "admin" AND is_active = 1');
      recipients.push(...admins);
    }

    recipientsCount = recipients.length;

    for (const r of recipients) {
      // 1. In-App Notification Delivery
      if (sendInApp) {
        try {
          await pool.query(
            'INSERT INTO notifications (user_id, ticket_id, title, message) VALUES (?, ?, ?, ?)',
            [r.id, ticketId, title, message]
          );
          inAppSuccess = true;
        } catch (inAppErr) {
          inAppSuccess = false;
          inAppError = inAppErr.message;
          logger.error(`Failed to dispatch in-app AMC notification to user ${r.id}: ${inAppErr.message}`);
        }
      }

      // 2. Email Notification Delivery (Awaited with error capture)
      if (sendEmail) {
        try {
          if (role === 'admin' || r.role === 'admin') {
            const adminSent = await sendAdminNotification(title, `<p>${message}</p>`);
            if (adminSent) {
              emailSuccess = true;
            } else {
              emailSuccess = false;
              emailError = 'Admin notification email delivery returned false or unconfigured.';
            }
          } else if (r.email) {
            const customerSent = await sendCustomerNotification(
              r.email,
              title,
              `<p>Hello ${r.name || 'Valued Client'},</p><p>${message}</p>`
            );
            if (customerSent) {
              emailSuccess = true;
            } else {
              emailSuccess = false;
              emailError = `Customer notification email delivery to ${r.email} returned false or unconfigured.`;
            }
          } else {
            emailSuccess = false;
            emailError = 'No valid email address found on user account.';
          }
        } catch (emailErr) {
          emailSuccess = false;
          emailError = emailErr.message;
          logger.error(`Failed to send email AMC notification to ${r.email}: ${emailErr.message}`);
        }
      }
    }
  } catch (err) {
    logger.warn(`Failed to dispatch AMC notification: ${err.message}`);
    if (sendInApp && !inAppSuccess) inAppError = err.message;
    if (sendEmail && !emailSuccess) emailError = err.message;
  }

  return {
    success: inAppSuccess && emailSuccess,
    inAppSuccess,
    emailSuccess,
    inAppError,
    emailError,
    recipientsCount
  };
};

/**
 * 10. Admin Overview Statistics
 */
const getAdminOverview = async () => {
  const [[reqStats]] = await pool.query(`
    SELECT 
      COUNT(*) AS totalRequests,
      SUM(CASE WHEN status IN ('pending', 'under_review') THEN 1 ELSE 0 END) AS pendingRequests
    FROM amc_requests
  `);

  const [[contractStats]] = await pool.query(`
    SELECT 
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeContracts,
      SUM(CASE WHEN approval_status = 'pending_approval' THEN 1 ELSE 0 END) AS pendingApprovals,
      SUM(CASE WHEN payment_status IN ('unpaid', 'pending_verification') AND status != 'cancelled' THEN 1 ELSE 0 END) AS awaitingPayment,
      SUM(CASE WHEN status = 'active' AND end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS nearingExpiry,
      SUM(CASE WHEN status = 'expired' OR (status = 'active' AND end_date < CURDATE()) THEN 1 ELSE 0 END) AS expiredContracts
    FROM amc_contracts
  `);

  const [[repStats]] = await pool.query(`
    SELECT COUNT(*) AS pendingReplacements
    FROM amc_device_replacements
    WHERE status = 'pending'
  `);

  return {
    totalRequests: Number(reqStats?.totalRequests || 0),
    pendingRequests: Number(reqStats?.pendingRequests || 0),
    activeContracts: Number(contractStats?.activeContracts || 0),
    pendingApprovals: Number(contractStats?.pendingApprovals || 0),
    awaitingPayment: Number(contractStats?.awaitingPayment || 0),
    nearingExpiry: Number(contractStats?.nearingExpiry || 0),
    expiredContracts: Number(contractStats?.expiredContracts || 0),
    pendingReplacements: Number(repStats?.pendingReplacements || 0)
  };
};

/**
 * 11. Update AMC Plan
 */
const updatePlan = async (planId, data) => {
  const { name, description, basePrice, durationMonths, defaultDeviceCapacity, coverageTerms, isActive } = data;
  const updates = [];
  const params = [];

  if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description || null); }
  if (basePrice !== undefined) { updates.push('base_price = ?'); params.push(parseFloat(basePrice)); }
  if (durationMonths !== undefined) { updates.push('duration_months = ?'); params.push(parseInt(durationMonths, 10)); }
  if (defaultDeviceCapacity !== undefined) { updates.push('default_device_capacity = ?'); params.push(parseInt(defaultDeviceCapacity, 10)); }
  if (coverageTerms !== undefined) {
    updates.push('coverage_terms = ?');
    params.push(typeof coverageTerms === 'string' ? coverageTerms : JSON.stringify(coverageTerms));
  }
  if (isActive !== undefined) { updates.push('is_active = ?'); params.push(Boolean(isActive)); }

  if (updates.length === 0) return { id: planId };

  params.push(planId);
  await pool.query(`UPDATE amc_plans SET ${updates.join(', ')} WHERE id = ?`, params);
  return { id: planId, success: true };
};

/**
 * 12. Toggle Plan Status
 */
const togglePlanStatus = async (planId) => {
  const [plans] = await pool.query('SELECT id, is_active FROM amc_plans WHERE id = ?', [planId]);
  if (plans.length === 0) throw new Error('AMC Plan not found.');
  const newStatus = !plans[0].is_active;
  await pool.query('UPDATE amc_plans SET is_active = ? WHERE id = ?', [newStatus, planId]);
  return { id: planId, isActive: newStatus };
};

/**
 * 13. Review AMC Request (Admin)
 */
const reviewAmcRequest = async ({ requestId, adminUserId, status, adminNotes }) => {
  if (!['under_review', 'offered', 'rejected', 'cancelled'].includes(status)) {
    throw new Error('Invalid status for request review.');
  }

  const [reqs] = await pool.query('SELECT * FROM amc_requests WHERE id = ?', [requestId]);
  if (reqs.length === 0) throw new Error('AMC Request not found.');
  const req = reqs[0];

  await pool.query(`
    UPDATE amc_requests
    SET status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [status, adminNotes || null, adminUserId, requestId]);

  // Notify company
  await sendAmcNotification({
    userId: req.company_id,
    title: `AMC Request Update (${req.request_number})`,
    message: `Your AMC service request ${req.request_number} has been updated to: ${status.replace('_', ' ').toUpperCase()}.${adminNotes ? ` Note: ${adminNotes}` : ''}`
  });

  return { id: requestId, status };
};

/**
 * 14. Reject AMC Offer (Company)
 */
const rejectAmcOffer = async ({ contractId, companyId, reason, userId }) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  const [contracts] = await pool.query(
    'SELECT * FROM amc_contracts WHERE id = ? AND company_id = ?',
    [contractId, resolvedCompanyId]
  );
  if (contracts.length === 0) throw new Error('Contract not found.');

  const contract = contracts[0];
  if (contract.status !== 'offered') {
    throw new Error(`Cannot reject contract with status "${contract.status}". Must be "offered".`);
  }

  await pool.query('UPDATE amc_contracts SET status = "rejected", approval_status = "rejected" WHERE id = ?', [contractId]);

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'OFFER_REJECTED', ?, ?)
  `, [contractId, userId || null, JSON.stringify({ reason: reason || 'Company declined offer', rejection_source: 'Company', rejectedAt: new Date() })]);

  // Notify admin
  await sendAmcNotification({
    role: 'admin',
    title: `AMC Offer Declined (${contract.contract_number})`,
    message: `Company declined AMC offer for ${contract.plan_name} (${contract.contract_number}). Reason: ${reason || 'None provided'}`
  });

  return { success: true, contractId, status: 'rejected' };
};

/**
 * 15. Update Contract Status (Admin: cancel / suspend / activate)
 */
const updateContractStatus = async ({ contractId, adminUserId, status, reason }) => {
  if (!['active', 'suspended', 'cancelled'].includes(status)) {
    throw new Error('Status must be "active", "suspended", or "cancelled".');
  }

  const [contracts] = await pool.query('SELECT * FROM amc_contracts WHERE id = ?', [contractId]);
  if (contracts.length === 0) throw new Error('Contract not found.');
  const contract = contracts[0];

  await pool.query('UPDATE amc_contracts SET status = ? WHERE id = ?', [status, contractId]);

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, ?, ?, ?)
  `, [contractId, `CONTRACT_${status.toUpperCase()}`, adminUserId, JSON.stringify({ reason: reason || '', previousStatus: contract.status })]);

  // Notify company
  await sendAmcNotification({
    userId: contract.company_id,
    title: `AMC Contract Status: ${status.toUpperCase()} (${contract.contract_number})`,
    message: `Your AMC contract ${contract.contract_number} has been set to: ${status.toUpperCase()}.${reason ? ` Reason: ${reason}` : ''}`
  });

  return { success: true, contractId, status };
};

/**
 * 16. Create AMC Contract Payment Order (Razorpay / Online)
 */
const createContractPaymentOrder = async ({ contractId, companyId, userId }) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  const [contracts] = await pool.query(
    'SELECT * FROM amc_contracts WHERE id = ? AND company_id = ?',
    [contractId, resolvedCompanyId]
  );
  if (contracts.length === 0) throw new Error('Contract not found.');

  const contract = contracts[0];
  if (contract.status === 'rejected' || contract.approval_status === 'rejected') {
    throw new Error('Cannot initiate payment for a rejected contract offer.');
  }
  if (contract.payment_status === 'paid') {
    throw new Error('This contract is already paid.');
  }

  const totalAmount = parseFloat(contract.total_amount);
  const keyId = config.razorpay?.keyId || '';
  const keySecret = config.razorpay?.keySecret || '';
  const currency = contract.currency || 'INR';

  let orderId = `order_amc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // If live Razorpay keys are configured, create real Razorpay order
  if (keyId && keySecret && !keySecret.includes('YourKeySecret') && !keySecret.includes('demo')) {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: Math.round(totalAmount * 100), // in paise
          currency,
          receipt: `amc_${contract.id}`,
          notes: {
            contract_id: String(contract.id),
            contract_number: contract.contract_number,
            company_id: String(resolvedCompanyId)
          }
        })
      });
      const orderData = await res.json();
      if (orderData && orderData.id) {
        orderId = orderData.id;
      }
    } catch (orderErr) {
      logger.warn(`Razorpay API order creation fallback: ${orderErr.message}`);
    }
  }

  // Insert payment record
  await pool.query(`
    INSERT INTO payments (order_id, user_id, company_id, amount, currency, status, gateway, reference_note)
    VALUES (?, ?, ?, ?, ?, 'created', 'razorpay', ?)
  `, [orderId, userId, resolvedCompanyId, totalAmount, currency, `AMC Contract: ${contract.contract_number}`]);

  return {
    orderId,
    amount: totalAmount,
    currency,
    keyId,
    contractId: contract.id,
    contractNumber: contract.contract_number,
    planName: contract.plan_name
  };
};

/**
 * 17. Verify AMC Contract Payment (Razorpay signature verification)
 */
const verifyContractPayment = async ({ contractId, companyId, razorpayOrderId, razorpayPaymentId, razorpaySignature, userId }) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  const [contracts] = await pool.query(
    'SELECT * FROM amc_contracts WHERE id = ? AND company_id = ?',
    [contractId, resolvedCompanyId]
  );
  if (contracts.length === 0) throw new Error('Contract not found.');

  const contract = contracts[0];
  if (contract.status === 'rejected' || contract.approval_status === 'rejected') {
    throw new Error('Cannot verify payment for a rejected contract offer.');
  }

  // Idempotency: avoid duplicate invoices on verification replays
  if (contract.payment_status === 'paid') {
    return {
      success: true,
      contractId,
      invoiceId: contract.invoice_id,
      paymentStatus: 'paid',
      status: contract.status
    };
  }

  const keySecret = config.razorpay?.keySecret;

  // Strict signature verification when real keys are configured
  if (keySecret && !keySecret.includes('YourKeySecret') && !keySecret.includes('demo')) {
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    if (expectedSignature !== razorpaySignature) {
      await pool.query('UPDATE payments SET status = "failed", error_message = "Invalid signature" WHERE order_id = ?', [razorpayOrderId]);
      await pool.query('UPDATE amc_contracts SET payment_status = "failed" WHERE id = ?', [contractId]);
      throw new Error('Payment signature verification failed.');
    }
  }

  // Update payment record
  await pool.query(`
    UPDATE payments 
    SET payment_id = ?, status = 'paid', verification_status = 'verified', verified_at = CURRENT_TIMESTAMP
    WHERE order_id = ?
  `, [razorpayPaymentId, razorpayOrderId]);

  // Create commercial invoice
  const [profiles] = await pool.query('SELECT company_name FROM company_profiles WHERE user_id = ?', [resolvedCompanyId]);
  const [users] = await pool.query('SELECT name FROM users WHERE id = ?', [resolvedCompanyId]);
  const clientName = profiles[0]?.company_name || users[0]?.name || 'Corporate Client';
  const invoiceId = await generateInvoiceId(pool);

  await pool.query(`
    INSERT INTO invoices (
      id, user_id, client_name, amount, subtotal, tax_amount, currency, invoice_date, due_date, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Paid', ?)
  `, [
    invoiceId, resolvedCompanyId, clientName,
    contract.total_amount, contract.price, contract.tax_amount || 0,
    contract.currency || 'INR', `AMC Contract Payment: ${contract.contract_number} (${contract.plan_name})`
  ]);

  await pool.query(`
    INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total, tax_amount)
    VALUES (?, ?, 1, ?, ?, ?)
  `, [invoiceId, `AMC Plan: ${contract.plan_name} (${contract.device_capacity} Devices)`, contract.price, contract.price, contract.tax_amount || 0]);

  // Update contract
  const shouldActivate = contract.approval_status === 'approved';
  const start = contract.start_date ? formatDateOnly(contract.start_date) : formatDateOnly(new Date());
  const end = contract.end_date ? formatDateOnly(contract.end_date) : formatDateOnly(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

  await pool.query(`
    UPDATE amc_contracts
    SET payment_status = 'paid', invoice_id = ?, status = ?, start_date = ?, end_date = ?
    WHERE id = ?
  `, [invoiceId, shouldActivate ? 'active' : (contract.status === 'offered' ? 'accepted' : contract.status), start, end, contractId]);

  if (shouldActivate) {
    await pool.query(`
      UPDATE amc_covered_devices
      SET coverage_start_date = ?, coverage_end_date = ?
      WHERE contract_id = ? AND status = 'active'
    `, [start, end, contractId]);
  }

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'PAYMENT_VERIFIED', ?, ?)
  `, [contractId, userId || null, JSON.stringify({ razorpayPaymentId, razorpayOrderId, invoiceId, amount: contract.total_amount, activated: shouldActivate })]);

  // Notify admin & company
  await sendAmcNotification({
    role: 'admin',
    title: `AMC Payment Verified (${contract.contract_number})`,
    message: `Payment of ₹${contract.total_amount} verified for contract ${contract.contract_number} (${contract.plan_name}). Invoice ${invoiceId} generated.`
  });
  await sendAmcNotification({
    userId: resolvedCompanyId,
    title: `Payment Receipt: AMC Contract ${contract.contract_number}`,
    message: `Your payment of ₹${contract.total_amount} was successfully verified. Invoice ${invoiceId} is generated.${shouldActivate ? ' Your AMC coverage is now ACTIVE.' : ' Contract is awaiting final admin approval.'}`
  });

  return {
    success: true,
    contractId,
    invoiceId,
    paymentStatus: 'paid',
    status: shouldActivate ? 'active' : contract.status
  };
};

/**
 * 18. Initiate Contract Offline Payment (Bank Transfer / NEFT / Cheque)
 */
const initiateContractOfflinePayment = async ({ contractId, companyId, paymentMethod = 'bank_transfer', referenceNumber, notes, userId }) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  const [contracts] = await pool.query(
    'SELECT * FROM amc_contracts WHERE id = ? AND company_id = ?',
    [contractId, resolvedCompanyId]
  );
  if (contracts.length === 0) throw new Error('Contract not found.');

  const contract = contracts[0];
  if (contract.status === 'rejected' || contract.approval_status === 'rejected') {
    throw new Error('Cannot initiate payment for a rejected contract offer.');
  }
  if (contract.payment_status === 'paid') {
    throw new Error('This contract is already paid.');
  }

  const orderId = `offline_amc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  await pool.query(`
    INSERT INTO payments (order_id, user_id, company_id, amount, currency, payment_method, status, gateway, reference_note)
    VALUES (?, ?, ?, ?, ?, ?, 'pending_verification', 'offline', ?)
  `, [orderId, userId, resolvedCompanyId, contract.total_amount, contract.currency || 'INR', paymentMethod, `AMC Ref: ${referenceNumber || 'N/A'}. Contract: ${contract.contract_number}. ${notes || ''}`]);

  await pool.query('UPDATE amc_contracts SET payment_status = "pending_verification" WHERE id = ?', [contractId]);

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'OFFLINE_PAYMENT_INITIATED', ?, ?)
  `, [contractId, userId || null, JSON.stringify({ paymentMethod, referenceNumber, amount: contract.total_amount })]);

  // Notify admin to review offline payment
  await sendAmcNotification({
    role: 'admin',
    title: `AMC Offline Payment Awaiting Verification (${contract.contract_number})`,
    message: `Company initiated ${paymentMethod} payment for AMC contract ${contract.contract_number}. Ref: ${referenceNumber || 'N/A'}. Amount: ₹${contract.total_amount}.`
  });

  return { success: true, contractId, paymentStatus: 'pending_verification' };
};

/**
 * 19. Verify Contract Offline Payment (Admin)
 */
const verifyContractOfflinePayment = async ({ contractId, adminUserId, decision, adminNotes }) => {
  if (!['verified', 'rejected'].includes(decision)) {
    throw new Error('Decision must be "verified" or "rejected".');
  }

  const [contracts] = await pool.query('SELECT * FROM amc_contracts WHERE id = ?', [contractId]);
  if (contracts.length === 0) throw new Error('Contract not found.');
  const contract = contracts[0];

  if (contract.status === 'rejected' || contract.approval_status === 'rejected') {
    throw new Error('Cannot verify offline payment for a rejected contract offer.');
  }

  if (decision === 'verified') {
    // Idempotency: avoid duplicate invoices on offline verification replays
    if (contract.payment_status === 'paid') {
      return {
        success: true,
        contractId,
        invoiceId: contract.invoice_id,
        paymentStatus: 'paid',
        status: contract.status
      };
    }

    // Generate invoice
    const [profiles] = await pool.query('SELECT company_name FROM company_profiles WHERE user_id = ?', [contract.company_id]);
    const [users] = await pool.query('SELECT name FROM users WHERE id = ?', [contract.company_id]);
    const clientName = profiles[0]?.company_name || users[0]?.name || 'Corporate Client';
    const invoiceId = await generateInvoiceId(pool);

    await pool.query(`
      INSERT INTO invoices (
        id, user_id, client_name, amount, subtotal, tax_amount, currency, invoice_date, due_date, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Paid', ?)
    `, [
      invoiceId, contract.company_id, clientName,
      contract.total_amount, contract.price, contract.tax_amount || 0,
      contract.currency || 'INR', `AMC Contract Payment (Offline): ${contract.contract_number} (${contract.plan_name})`
    ]);

    await pool.query(`
      INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total, tax_amount)
      VALUES (?, ?, 1, ?, ?, ?)
    `, [invoiceId, `AMC Plan: ${contract.plan_name} (${contract.device_capacity} Devices)`, contract.price, contract.price, contract.tax_amount || 0]);

    // Update payment records
    await pool.query(`
      UPDATE payments 
      SET status = 'paid', verification_status = 'verified', verified_by = ?, verified_at = CURRENT_TIMESTAMP
      WHERE company_id = ? AND reference_note LIKE ? AND status = 'pending_verification'
      ORDER BY id DESC LIMIT 1
    `, [adminUserId, contract.company_id, `%${contract.contract_number}%`]);

    const shouldActivate = contract.approval_status === 'approved';
    const start = contract.start_date ? formatDateOnly(contract.start_date) : formatDateOnly(new Date());
    const end = contract.end_date ? formatDateOnly(contract.end_date) : formatDateOnly(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

    await pool.query(`
      UPDATE amc_contracts
      SET payment_status = 'paid', invoice_id = ?, status = ?, start_date = ?, end_date = ?
      WHERE id = ?
    `, [invoiceId, shouldActivate ? 'active' : (contract.status === 'offered' ? 'accepted' : contract.status), start, end, contractId]);

    if (shouldActivate) {
      await pool.query(`
        UPDATE amc_covered_devices
        SET coverage_start_date = ?, coverage_end_date = ?
        WHERE contract_id = ? AND status = 'active'
      `, [start, end, contractId]);
    }

    await pool.query(`
      INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
      VALUES (?, 'OFFLINE_PAYMENT_VERIFIED', ?, ?)
    `, [contractId, adminUserId, JSON.stringify({ invoiceId, adminNotes, activated: shouldActivate })]);

    // Notify company
    await sendAmcNotification({
      userId: contract.company_id,
      title: `AMC Offline Payment Verified (${contract.contract_number})`,
      message: `Your offline payment for contract ${contract.contract_number} has been verified! Invoice ${invoiceId} is generated.${shouldActivate ? ' Your AMC coverage is now ACTIVE.' : ' Contract is awaiting final admin approval.'}`
    });

    return { success: true, contractId, paymentStatus: 'paid', invoiceId, status: shouldActivate ? 'active' : contract.status };
  } else {
    // Rejected
    await pool.query('UPDATE amc_contracts SET payment_status = "failed" WHERE id = ?', [contractId]);
    await pool.query(`
      UPDATE payments
      SET status = 'rejected', verification_status = 'rejected', verified_by = ?, verified_at = CURRENT_TIMESTAMP, error_message = ?
      WHERE company_id = ? AND reference_note LIKE ? AND status = 'pending_verification'
      ORDER BY id DESC LIMIT 1
    `, [adminUserId, adminNotes || 'Offline payment verification rejected by admin', contract.company_id, `%${contract.contract_number}%`]);

    await pool.query(`
      INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
      VALUES (?, 'OFFLINE_PAYMENT_REJECTED', ?, ?)
    `, [contractId, adminUserId, JSON.stringify({ adminNotes })]);

    // Notify company
    await sendAmcNotification({
      userId: contract.company_id,
      title: `AMC Payment Rejected (${contract.contract_number})`,
      message: `Your offline payment for contract ${contract.contract_number} was rejected by admin.${adminNotes ? ` Reason: ${adminNotes}` : ''} Please contact support or retry payment.`
    });

    return { success: true, contractId, paymentStatus: 'failed' };
  }
};

/**
 * 20. Process Contract Expiries and Offer Expiries
 * Automatically transitions active contracts that have passed their end_date to 'expired'
 * and updates covered devices to 'expired'.
 * Sweeps offered contracts past their offer_valid_until to 'expired'.
 */
const processContractExpiries = async (connectionOrPool) => {
  const isPool = typeof connectionOrPool.getConnection === 'function';
  const connection = isPool ? await connectionOrPool.getConnection() : connectionOrPool;

  try {
    let expiredContractsCount = 0;
    let expiredOffersCount = 0;

    const todayStr = getBusinessTodayStr();

    // 1. Sweep active contracts that have reached or passed their end_date in AMC business timezone
    const [expiredContracts] = await connection.query(`
      SELECT id, contract_number, company_id, end_date, plan_name
      FROM amc_contracts
      WHERE status = 'active'
        AND end_date < ?
    `, [todayStr]);

    for (const contract of expiredContracts) {
      await connection.beginTransaction();
      try {
        const [updateResult] = await connection.query(`
          UPDATE amc_contracts
          SET status = 'expired'
          WHERE id = ? AND status = 'active'
        `, [contract.id]);

        if (updateResult.affectedRows > 0) {
          // Transition covered devices to 'expired'
          await connection.query(`
            UPDATE amc_covered_devices
            SET status = 'expired'
            WHERE contract_id = ? AND status = 'active'
          `, [contract.id]);

          // Legacy device table synchronization
          await connection.query(`
            UPDATE company_devices cd
            SET cd.is_amc = 0
            WHERE cd.id IN (
              SELECT device_id FROM amc_covered_devices WHERE contract_id = ?
            ) AND NOT EXISTS (
              SELECT 1 FROM amc_covered_devices acd
              JOIN amc_contracts ac ON acd.contract_id = ac.id
              WHERE acd.device_id = cd.id AND acd.status = 'active' AND ac.status = 'active'
            )
          `, [contract.id]);

          // Audit trail
          await connection.query(`
            INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
            VALUES (?, 'CONTRACT_EXPIRED', NULL, ?)
          `, [contract.id, JSON.stringify({
            expiredAt: new Date().toISOString(),
            endDate: formatDateOnly(contract.end_date)
          })]);

          await connection.commit();
          expiredContractsCount++;

          // Dispatch notifications after commit
          await sendAmcNotification({
            userId: contract.company_id,
            title: `AMC Contract Expired (${contract.contract_number})`,
            message: `Your AMC contract ${contract.contract_number} (${contract.plan_name}) expired on ${formatDateOnly(contract.end_date)}. Device repair coverage is now inactive. You can initiate a renewal from your portal.`
          });
          await sendAmcNotification({
            role: 'admin',
            title: `AMC Contract Expired (${contract.contract_number})`,
            message: `AMC contract ${contract.contract_number} for company #${contract.company_id} has expired.`
          });
        } else {
          await connection.rollback();
        }
      } catch (err) {
        await connection.rollback();
        logger.error(`[AMC Expiry Sweep] Failed processing expiry for contract ${contract.id}: ${err.message}`);
      }
    }

    // 2. Sweep offered contracts past their offer_valid_until date in AMC business timezone
    const [expiredOffers] = await connection.query(`
      SELECT id, contract_number, company_id, offer_valid_until, plan_name
      FROM amc_contracts
      WHERE status = 'offered'
        AND offer_valid_until < ?
    `, [todayStr]);

    for (const offer of expiredOffers) {
      await connection.beginTransaction();
      try {
        const [updateOfferResult] = await connection.query(`
          UPDATE amc_contracts
          SET status = 'expired'
          WHERE id = ? AND status = 'offered'
        `, [offer.id]);

        if (updateOfferResult.affectedRows > 0) {
          // Audit trail
          await connection.query(`
            INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
            VALUES (?, 'OFFER_EXPIRED', NULL, ?)
          `, [offer.id, JSON.stringify({
            expiredAt: new Date().toISOString(),
            offerValidUntil: formatDateOnly(offer.offer_valid_until)
          })]);

          await connection.commit();
          expiredOffersCount++;

          // Notification
          await sendAmcNotification({
            userId: offer.company_id,
            title: `AMC Offer Expired (${offer.contract_number})`,
            message: `The AMC offer for ${offer.plan_name} (${offer.contract_number}) expired on ${formatDateOnly(offer.offer_valid_until)}.`
          });
        } else {
          await connection.rollback();
        }
      } catch (offerErr) {
        await connection.rollback();
        logger.error(`[AMC Expiry Sweep] Failed processing offer expiry for contract ${offer.id}: ${offerErr.message}`);
      }
    }

    return {
      success: true,
      expiredContractsCount,
      expiredOffersCount
    };
  } finally {
    if (isPool && connection) {
      connection.release();
    }
  }
};

/**
 * 21. Process Expiry Reminders (Fix A Remediation)
 * Dispatches automated reminders at configured milestones (e.g. 30, 15, 7, 1 days).
 * Employs durable outbox lifecycle: pending -> processing -> success / partial / failed.
 * Features:
 * - Persistent reminder intent creation before network/email calls
 * - Independent tracking of in_app_status and email_status
 * - Controlled retries for failed/interrupted channels without duplicating successful ones
 * - Automatic recovery of stale 'processing' records after worker crash
 * - Duplicate prevention via UNIQUE KEY uk_contract_milestone_expiry
 */
const processExpiryReminders = async (connectionOrPool) => {
  const isPool = typeof connectionOrPool.getConnection === 'function';
  const connection = isPool ? await connectionOrPool.getConnection() : connectionOrPool;

  try {
    // 1. Stale processing recovery (recover crashes where worker died mid-processing > 5 minutes)
    await connection.query(`
      UPDATE amc_expiry_reminders
      SET delivery_status = 'pending'
      WHERE delivery_status = 'processing'
        AND (last_attempted_at IS NULL OR last_attempted_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE))
    `);

    // 2. Read configured milestones and retry base delay
    let milestones = [30, 15, 7, 1];
    let retryBaseMinutes = config.amc?.retryBaseMinutes || 15;
    try {
      const [settingRows] = await connection.query(
        "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('amc_reminder_milestones_days', 'amc_reminder_retry_base_minutes')"
      );
      for (const row of settingRows) {
        if (row.setting_key === 'amc_reminder_milestones_days' && row.setting_value) {
          const parsed = row.setting_value
            .split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(n => !isNaN(n) && n > 0)
            .sort((a, b) => b - a);
          if (parsed.length > 0) milestones = parsed;
        } else if (row.setting_key === 'amc_reminder_retry_base_minutes' && row.setting_value) {
          const parsedMinutes = parseInt(row.setting_value, 10);
          if (!isNaN(parsedMinutes) && parsedMinutes > 0) {
            retryBaseMinutes = parsedMinutes;
          }
        }
      }
    } catch (settingErr) {
      logger.warn(`[AMC Reminders] Could not read custom settings: ${settingErr.message}`);
    }

    const todayBusinessStr = getBusinessTodayStr();

    // 3. Scan active contracts nearing expiry and persist reminder intents as 'pending'
    const [contracts] = await connection.query(`
      SELECT c.id, c.contract_number, c.company_id, c.plan_name, c.end_date,
             DATEDIFF(c.end_date, ?) AS days_left,
             u.name AS company_name, u.email AS company_email
      FROM amc_contracts c
      JOIN users u ON c.company_id = u.id
      WHERE c.status = 'active'
        AND c.end_date >= ?
    `, [todayBusinessStr, todayBusinessStr]);

    for (const contract of contracts) {
      const daysLeft = parseInt(contract.days_left, 10);
      const endDateStr = formatDateOnly(contract.end_date);

      const applicableMilestones = milestones.filter(m => daysLeft <= m);
      if (applicableMilestones.length === 0) continue;

      const targetMilestone = Math.min(...applicableMilestones);

      try {
        await connection.query(`
          INSERT INTO amc_expiry_reminders (
            contract_id, company_id, milestone_days, expiry_date, delivery_channel,
            delivery_status, in_app_status, email_status, metadata
          ) VALUES (?, ?, ?, ?, 'both', 'pending', 'pending', 'pending', ?)
        `, [
          contract.id,
          contract.company_id,
          targetMilestone,
          endDateStr,
          JSON.stringify({ daysLeft, contractNumber: contract.contract_number, queuedAt: new Date().toISOString() })
        ]);
      } catch (dupErr) {
        // Ignored: Reminder intent for this contract, milestone and expiry date already exists
        if (dupErr.code !== 'ER_DUP_ENTRY' && dupErr.errno !== 1062) {
          logger.error(`[AMC Reminders] Error recording reminder intent for contract ${contract.id}: ${dupErr.message}`);
        }
      }
    }

    // 4. Outbox Dispatch & Controlled Retries for all pending / failed / partial reminders respecting backoff (Fix 1)
    const [outboxItems] = await connection.query(`
      SELECT r.*, c.contract_number, c.plan_name, u.name AS company_name, u.email AS company_email
      FROM amc_expiry_reminders r
      JOIN amc_contracts c ON r.contract_id = c.id
      JOIN users u ON r.company_id = u.id
      WHERE r.delivery_status IN ('pending', 'failed', 'partial')
        AND r.retry_count < 5
        AND (r.next_retry_at IS NULL OR r.next_retry_at <= NOW())
        AND c.status = 'active'
      ORDER BY r.id ASC
      LIMIT 100
    `);

    let remindersSent = 0;

    for (const reminder of outboxItems) {
      // Concurrency-safe claim: only advance if still in an uncompleted status
      const [claimRes] = await connection.query(`
        UPDATE amc_expiry_reminders
        SET delivery_status = 'processing', last_attempted_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1
        WHERE id = ? AND delivery_status IN ('pending', 'failed', 'partial')
      `, [reminder.id]);

      if (claimRes.affectedRows === 0) {
        // Grabbed by another concurrent sweep or worker
        continue;
      }

      const currentRetryCount = reminder.retry_count + 1;
      const endDateStr = formatDateOnly(reminder.expiry_date);
      const daysLeft = Math.max(0, Math.ceil((new Date(endDateStr + 'T00:00:00+05:30').getTime() - new Date(todayBusinessStr + 'T00:00:00+05:30').getTime()) / (1000 * 60 * 60 * 24)));

      const title = `AMC Expiry Notice: ${reminder.contract_number} (${reminder.milestone_days} Day${reminder.milestone_days === 1 ? '' : 's'} Notice)`;
      const message = `Dear ${reminder.company_name || 'Valued Client'}, your AMC contract ${reminder.contract_number} (${reminder.plan_name}) will expire on ${endDateStr}. Please renew before the expiry date to ensure continuous device repair protection and prevent coverage lapse.`;

      // Determine channel dispatch needs: only retry channels that have not yet succeeded
      const needInApp = reminder.in_app_status !== 'success';
      const needEmail = reminder.email_status !== 'success';

      const dispatchTrackingId = `AMC-NOTIF-${reminder.id}-ATTEMPT-${currentRetryCount}-${Date.now()}`;

      const dispatchResult = await sendAmcNotification({
        userId: reminder.company_id,
        title,
        message,
        sendInApp: needInApp,
        sendEmail: needEmail
      });

      const updatedInAppStatus = needInApp ? (dispatchResult.inAppSuccess ? 'success' : 'failed') : reminder.in_app_status;
      const updatedEmailStatus = needEmail ? (dispatchResult.emailSuccess ? 'success' : 'failed') : reminder.email_status;

      let finalDeliveryStatus = 'failed';
      if (updatedInAppStatus === 'success' && updatedEmailStatus === 'success') {
        finalDeliveryStatus = 'success';
      } else if (updatedInAppStatus === 'success' || updatedEmailStatus === 'success') {
        finalDeliveryStatus = 'partial';
      }

      const errors = [];
      if (dispatchResult.inAppError) errors.push(`In-App: ${dispatchResult.inAppError}`);
      if (dispatchResult.emailError) errors.push(`Email: ${dispatchResult.emailError}`);
      const errorMessage = errors.length > 0 ? errors.join('; ') : null;

      // Exponential backoff calculation for next retry (e.g. attempt 1: 15m, attempt 2: 30m, attempt 3: 60m...)
      let nextRetryClause = 'NULL';
      const updateParams = [finalDeliveryStatus, updatedInAppStatus, updatedEmailStatus, errorMessage];

      if ((finalDeliveryStatus === 'failed' || finalDeliveryStatus === 'partial') && currentRetryCount < 5) {
        const backoffMinutes = retryBaseMinutes * Math.pow(2, currentRetryCount - 1);
        nextRetryClause = 'DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)';
        updateParams.push(backoffMinutes);
      }

      updateParams.push(dispatchTrackingId, reminder.id);

      await connection.query(`
        UPDATE amc_expiry_reminders
        SET delivery_status = ?,
            in_app_status = ?,
            email_status = ?,
            error_message = ?,
            sent_at = CURRENT_TIMESTAMP,
            next_retry_at = ${nextRetryClause},
            metadata = JSON_SET(COALESCE(metadata, '{}'), '$.lastDispatchTrackingId', ?, '$.lastAttemptAt', CURRENT_TIMESTAMP)
        WHERE id = ?
      `, updateParams);

      if (finalDeliveryStatus === 'success' || finalDeliveryStatus === 'partial') {
        remindersSent++;

        // Audit trail (only once per milestone)
        const [existingHist] = await connection.query(`
          SELECT 1 FROM amc_contract_history
          WHERE contract_id = ? AND action = 'EXPIRY_REMINDER_SENT' AND details LIKE ?
          LIMIT 1
        `, [reminder.contract_id, `%"milestoneDays":${reminder.milestone_days}%`]);

        if (existingHist.length === 0) {
          await connection.query(`
            INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
            VALUES (?, 'EXPIRY_REMINDER_SENT', NULL, ?)
          `, [reminder.contract_id, JSON.stringify({
            milestoneDays: reminder.milestone_days,
            daysLeft,
            expiryDate: endDateStr,
            deliveryStatus: finalDeliveryStatus,
            inAppStatus: updatedInAppStatus,
            emailStatus: updatedEmailStatus,
            sentAt: new Date().toISOString()
          })]);
        }
      }
    }

    return {
      success: true,
      remindersSent
    };
  } finally {
    if (isPool && connection) {
      connection.release();
    }
  }
};

/**
 * 22. Process Selection Deadline Reminders
 * Alerts companies if selection deadline is approaching and device quota has not been fulfilled.
 */
const processSelectionDeadlineReminders = async (connectionOrPool) => {
  const isPool = typeof connectionOrPool.getConnection === 'function';
  const connection = isPool ? await connectionOrPool.getConnection() : connectionOrPool;

  try {
    const todayBusinessStr = getBusinessTodayStr();

    const [contracts] = await connection.query(`
      SELECT c.id, c.contract_number, c.company_id, c.device_capacity, c.selection_deadline,
             DATEDIFF(c.selection_deadline, ?) AS days_left,
             u.name AS company_name,
             (SELECT COUNT(*) FROM amc_covered_devices cd WHERE cd.contract_id = c.id AND cd.status = 'active') AS active_count
      FROM amc_contracts c
      JOIN users u ON c.company_id = u.id
      WHERE c.selection_deadline IS NOT NULL
        AND c.selection_deadline >= ?
        AND DATEDIFF(c.selection_deadline, ?) <= 3
        AND c.status IN ('offered', 'accepted', 'active')
    `, [todayBusinessStr, todayBusinessStr, todayBusinessStr]);

    let remindersSent = 0;

    for (const contract of contracts) {
      if (contract.active_count < contract.device_capacity) {
        const daysLeft = parseInt(contract.days_left, 10);
        const deadlineStr = formatDateOnly(contract.selection_deadline);

        let inserted = false;
        try {
          const [insertRes] = await connection.query(`
            INSERT INTO amc_expiry_reminders (contract_id, company_id, milestone_days, expiry_date, delivery_channel, delivery_status, metadata)
            VALUES (?, ?, ?, ?, 'both', 'success', ?)
          `, [
            contract.id,
            contract.company_id,
            -100 - daysLeft,
            deadlineStr,
            JSON.stringify({ type: 'selection_deadline', activeCount: contract.active_count, capacity: contract.device_capacity })
          ]);
          inserted = insertRes.affectedRows > 0;
        } catch (dupErr) {
          inserted = false;
        }

        if (inserted) {
          remindersSent++;
          const title = `Action Required: Device Allocation Deadline Approaching (${contract.contract_number})`;
          const message = `Please select your covered devices for AMC ${contract.contract_number}. Deadline is ${deadlineStr} (${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining). Currently allocated: ${contract.active_count}/${contract.device_capacity} devices.`;

          await sendAmcNotification({
            userId: contract.company_id,
            title,
            message
          });
        }
      }
    }

    return { success: true, remindersSent };
  } finally {
    if (isPool && connection) {
      connection.release();
    }
  }
};

/**
 * 23. Request AMC Renewal (Company)
 * Submits a formal renewal request for an active or expired AMC contract.
 */
const requestAmcRenewal = async ({ contractId, companyId, requestedCapacity = null, notes = null, userId = null }) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  if (!resolvedCompanyId) {
    throw new Error('Company not found.');
  }

  const [contracts] = await pool.query(
    'SELECT * FROM amc_contracts WHERE id = ? AND company_id = ?',
    [contractId, resolvedCompanyId]
  );
  if (contracts.length === 0) {
    throw new Error('Contract not found or does not belong to your company.');
  }

  const previousContract = contracts[0];
  if (!['active', 'expired'].includes(previousContract.status)) {
    throw new Error(`Cannot renew contract with status "${previousContract.status}". Must be active or expired.`);
  }

  // Duplicate Check 1: Check if an existing renewal request is currently pending or under review (Fix E)
  const [existingPending] = await pool.query(`
    SELECT id, request_number, status, created_at
    FROM amc_requests
    WHERE (previous_contract_id = ? OR (company_id = ? AND notes LIKE ?))
      AND status IN ('pending', 'under_review')
    LIMIT 1
  `, [previousContract.id, resolvedCompanyId, `%${previousContract.contract_number}%`]);

  if (existingPending.length > 0) {
    throw new Error(`A renewal request (${existingPending[0].request_number}) is already pending review for contract ${previousContract.contract_number}. Duplicate requests are not permitted.`);
  }

  // Duplicate Check 2: Check if an active renewal contract offer is already issued and pending acceptance
  const [existingOffer] = await pool.query(`
    SELECT id, contract_number, status
    FROM amc_contracts
    WHERE previous_contract_id = ?
      AND status IN ('offered', 'accepted')
    LIMIT 1
  `, [previousContract.id]);

  if (existingOffer.length > 0) {
    throw new Error(`A renewal offer (${existingOffer[0].contract_number}) has already been generated for contract ${previousContract.contract_number}. Please review and accept the offer in your portal.`);
  }

  const capacity = requestedCapacity ? parseInt(requestedCapacity, 10) : previousContract.device_capacity;
  const requestNumber = `AMC-RNW-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

  const renewalNotes = `Renewal request for AMC ${previousContract.contract_number} (${previousContract.plan_name}). ` +
    (requestedCapacity && requestedCapacity !== previousContract.device_capacity ? `Requested capacity: ${capacity} (previously ${previousContract.device_capacity}). ` : '') +
    (notes ? `Notes: ${notes}` : '');

  const [result] = await pool.query(`
    INSERT INTO amc_requests (
      request_number, company_id, plan_id, requested_device_count, notes, status, previous_contract_id
    ) VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `, [
    requestNumber,
    resolvedCompanyId,
    previousContract.plan_id,
    capacity,
    renewalNotes.trim(),
    previousContract.id
  ]);

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'RENEWAL_REQUESTED', ?, ?)
  `, [
    contractId,
    userId || null,
    JSON.stringify({ requestId: result.insertId, requestNumber, requestedCapacity: capacity })
  ]);

  await sendAmcNotification({
    role: 'admin',
    title: `AMC Renewal Requested (${previousContract.contract_number})`,
    message: `Company has submitted a renewal request for contract ${previousContract.contract_number}. Requested capacity: ${capacity} devices.`
  });

  return {
    success: true,
    requestId: result.insertId,
    requestNumber,
    contractId
  };
};

/**
 * 24. Create AMC Renewal Contract (Admin)
 * Creates a renewal contract linked to previous_contract_id.
 * Strict rules:
 * - Gap renewal: If previous contract expired, dates are prospective only (startDate >= CURRENT_DATE). No retroactive coverage.
 * - Device selection: Explicit selection required. Does NOT auto-assign previous covered devices.
 * - Reduced-capacity: device_capacity can be less than previous contract capacity.
 */
const createAmcRenewalContract = async ({
  previousContractId,
  companyId = null,
  planId = null,
  planName = null,
  deviceCapacity = null,
  price = null,
  discountAmount = 0.00,
  taxAmount = 0.00,
  totalAmount = null,
  termsAndConditions = null,
  offerValidUntil = null,
  startDate = null,
  endDate = null,
  selectionDeadline = null,
  createdBy = null
}) => {
  const [prevRows] = await pool.query('SELECT * FROM amc_contracts WHERE id = ?', [previousContractId]);
  if (prevRows.length === 0) {
    throw new Error('Previous contract not found.');
  }

  const prev = prevRows[0];
  const targetCompanyId = companyId ? (await resolveCompanyUserId(pool, companyId)) : prev.company_id;
  const targetPlanId = planId || prev.plan_id;
  const targetPlanName = planName || prev.plan_name;
  const targetCapacity = deviceCapacity ? parseInt(deviceCapacity, 10) : prev.device_capacity;
  const targetPrice = price !== null ? parseFloat(price) : parseFloat(prev.price);
  const targetDiscount = parseFloat(discountAmount || 0);
  const targetTax = parseFloat(taxAmount || 0);
  const targetTotal = totalAmount !== null ? parseFloat(totalAmount) : (targetPrice - targetDiscount + targetTax);
  const targetTerms = termsAndConditions || prev.terms_and_conditions;

  const todayStr = formatDateOnly(new Date());
  const prevEndDateStr = prev.end_date ? formatDateOnly(prev.end_date) : null;
  const isGapRenewal = !prevEndDateStr || prevEndDateStr < todayStr;

  let computedStart = startDate ? formatDateOnly(startDate) : null;

  if (isGapRenewal) {
    if (computedStart && computedStart < todayStr) {
      throw new Error('Renewal start date cannot be in the past for an expired contract. Retroactive AMC coverage is not permitted.');
    }
    if (!computedStart) {
      computedStart = todayStr;
    }
  } else {
    if (!computedStart) {
      computedStart = addDaysOnly(prevEndDateStr, 1);
    }
  }

  let computedEnd = endDate ? formatDateOnly(endDate) : null;
  if (!computedEnd) {
    computedEnd = addDaysOnly(computedStart, 365);
  }

  if (computedEnd < computedStart) {
    throw new Error('Renewal end date cannot be earlier than start date.');
  }

  const computedSelectionDeadline = selectionDeadline ? formatDateOnly(selectionDeadline) : computedStart;
  const contractNumber = `AMC-RNW-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

  const [result] = await pool.query(`
    INSERT INTO amc_contracts (
      contract_number, company_id, request_id, plan_id, contract_type,
      plan_name, device_capacity, price, discount_amount, tax_amount, total_amount,
      terms_and_conditions, offer_valid_until, selection_deadline, start_date, end_date,
      status, approval_status, payment_status, previous_contract_id, is_renewal, created_by
    ) VALUES (?, ?, NULL, ?, 'renewal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offered', 'pending_approval', 'unpaid', ?, 1, ?)
  `, [
    contractNumber, targetCompanyId, targetPlanId, targetPlanName, targetCapacity,
    targetPrice, targetDiscount, targetTax, targetTotal, targetTerms,
    offerValidUntil ? formatDateOnly(offerValidUntil) : null,
    computedSelectionDeadline,
    computedStart,
    computedEnd,
    previousContractId,
    createdBy || null
  ]);

  const newContractId = result.insertId;

  // Record audit history on new contract
  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'RENEWAL_CONTRACT_CREATED', ?, ?)
  `, [
    newContractId,
    createdBy || null,
    JSON.stringify({
      previousContractId,
      previousContractNumber: prev.contract_number,
      deviceCapacity: targetCapacity,
      previousCapacity: prev.device_capacity,
      startDate: computedStart,
      endDate: computedEnd,
      isGapRenewal
    })
  ]);

  // Record audit history on previous contract
  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'RENEWAL_OFFER_ISSUED', ?, ?)
  `, [
    previousContractId,
    createdBy || null,
    JSON.stringify({
      renewalContractId: newContractId,
      renewalContractNumber: contractNumber,
      capacity: targetCapacity
    })
  ]);

  // Notify company
  await sendAmcNotification({
    userId: targetCompanyId,
    title: `AMC Renewal Offer Available (${contractNumber})`,
    message: `A renewal offer (${contractNumber}) for your AMC coverage is ready. Capacity: ${targetCapacity} devices. Validity: ${computedStart} to ${computedEnd}. Please review and accept in your portal.`
  });

  return {
    id: newContractId,
    contractNumber,
    previousContractId,
    startDate: computedStart,
    endDate: computedEnd,
    deviceCapacity: targetCapacity,
    isGapRenewal
  };
};

/**
 * Helper to obtain the certificate signing secrets from environment or server security config.
 * Supports current signing secret and previous secrets for zero-downtime key rotation (Fix 4).
 */
const getCertificateSecrets = () => {
  const currentSecret = (process.env.AMC_CERTIFICATE_SECRET || config.amc?.certificateSecret || config.security?.settingsEncryptionKey || config.jwt?.secret || '').trim();
  if (!currentSecret) {
    throw new Error('Certificate signing secret is not configured.');
  }

  // Previous secrets can be comma-separated in AMC_CERTIFICATE_PREVIOUS_SECRETS
  const previousEnv = (process.env.AMC_CERTIFICATE_PREVIOUS_SECRETS || '').trim();
  const previousConfig = config.amc?.certificatePreviousSecrets || [];
  const previousList = (previousEnv ? previousEnv.split(',') : previousConfig)
    .map(s => String(s).trim())
    .filter(s => s && s !== currentSecret);

  // Also include settings encryption key or jwt secret as previous keys if current secret is AMC_CERTIFICATE_SECRET
  if (process.env.AMC_CERTIFICATE_SECRET) {
    const encKey = (config.security?.settingsEncryptionKey || '').trim();
    const jwtSec = (config.jwt?.secret || '').trim();
    if (encKey && encKey !== currentSecret && !previousList.includes(encKey)) previousList.push(encKey);
    if (jwtSec && jwtSec !== currentSecret && !previousList.includes(jwtSec)) previousList.push(jwtSec);
  }

  return { currentSecret, previousSecrets: previousList };
};

const getCertificateSecret = () => getCertificateSecrets().currentSecret;

/**
 * Generates canonical payload for certificate signing (Fix 6).
 * Normalizes dates to canonical YYYY-MM-DD in the business timezone so timezones never skew signature generation.
 * Format: "<CONTRACT_NUMBER>:<START_DATE>:<END_DATE>:<COMPANY_ID>"
 */
const generateCertificateCanonicalPayload = (contract) => {
  if (!contract || typeof contract !== 'object') {
    throw new Error('Contract object is required to generate certificate canonical payload.');
  }
  const contractNumber = String(contract.contract_number || contract.contractNumber || '').trim();
  const startDateStr = formatDateOnly(contract.start_date || contract.startDate);
  const endDateStr = formatDateOnly(contract.end_date || contract.endDate);
  const companyId = String(contract.company_id || contract.companyId || (contract.company && contract.company.id) || '').trim();

  if (!contractNumber || !startDateStr || !endDateStr || !companyId) {
    throw new Error('Malformed contract payload: contract number, valid start date, valid end date, and company ID are required.');
  }

  return `${contractNumber}:${startDateStr}:${endDateStr}:${companyId}`;
};

/**
 * Computes deterministic HMAC-SHA256 verification code with a given secret.
 */
const computeHmacWithSecret = (canonicalPayload, secret) => {
  return crypto
    .createHmac('sha256', secret)
    .update(canonicalPayload)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();
};

/**
 * Computes deterministic HMAC-SHA256 verification code for an AMC contract using the CURRENT active key.
 */
const generateCertificateHmacCode = (contract) => {
  const { currentSecret } = getCertificateSecrets();
  const canonicalPayload = generateCertificateCanonicalPayload(contract);
  return computeHmacWithSecret(canonicalPayload, currentSecret);
};

/**
 * Verifies the authenticity of a certificate verification code using constant-time comparison.
 * Supports:
 * - Current active HMAC key: returns { valid: true, version: 'v2_hmac' }
 * - Previous rotated HMAC keys: returns { valid: true, version: 'v2_hmac_rotated' }
 * - Legacy v1 plain SHA-256 fallback: returns { valid: true, version: 'v1_legacy' }
 */
const verifyCertificateAuthenticity = (contract, providedCode) => {
  if (!providedCode || typeof providedCode !== 'string' || providedCode.trim().length !== 16) {
    return { valid: false, reason: 'INVALID_CODE_FORMAT' };
  }
  const cleanCode = providedCode.trim().toUpperCase();
  const providedBuf = Buffer.from(cleanCode, 'utf8');

  let canonicalPayload;
  try {
    canonicalPayload = generateCertificateCanonicalPayload(contract);
  } catch (payloadErr) {
    return { valid: false, reason: 'MALFORMED_CONTRACT_DATA', error: payloadErr.message };
  }

  const { currentSecret, previousSecrets } = getCertificateSecrets();

  // 1. Verify against current HMAC-SHA256 key (v2_hmac)
  const currentHmac = computeHmacWithSecret(canonicalPayload, currentSecret);
  const currentBuf = Buffer.from(currentHmac, 'utf8');
  if (providedBuf.length === currentBuf.length && crypto.timingSafeEqual(providedBuf, currentBuf)) {
    return { valid: true, version: 'v2_hmac' };
  }

  // 2. Verify against previous rotated HMAC keys (v2_hmac_rotated)
  for (const prevSecret of previousSecrets) {
    const prevHmac = computeHmacWithSecret(canonicalPayload, prevSecret);
    const prevBuf = Buffer.from(prevHmac, 'utf8');
    if (providedBuf.length === prevBuf.length && crypto.timingSafeEqual(providedBuf, prevBuf)) {
      return { valid: true, version: 'v2_hmac_rotated' };
    }
  }

  // 3. Backward compatibility fallback for v1 legacy plain SHA-256 (unkeyed hash)
  // SEC-02: Strictly gated behind explicit AMC_ALLOW_LEGACY_V1 compatibility flag. Default: disabled (secure).
  const allowLegacyV1 = (process.env.AMC_ALLOW_LEGACY_V1 || '').trim().toLowerCase() === 'true' || config.amc?.allowLegacyV1 === true;
  if (allowLegacyV1) {
    const contractNumber = String(contract.contract_number || contract.contractNumber || '').trim();
    const startDateStr = formatDateOnly(contract.start_date || contract.startDate) || '';
    const endDateStr = formatDateOnly(contract.end_date || contract.endDate) || '';
    const companyId = String(contract.company_id || contract.companyId || (contract.company && contract.company.id) || '').trim();
    const legacyPayload = `${contractNumber}:${startDateStr}:${endDateStr}:${companyId}`;
    const legacyHash = crypto.createHash('sha256').update(legacyPayload).digest('hex').slice(0, 16).toUpperCase();
    const legacyBuf = Buffer.from(legacyHash, 'utf8');

    if (providedBuf.length === legacyBuf.length && crypto.timingSafeEqual(providedBuf, legacyBuf)) {
      return { valid: true, version: 'v1_legacy' };
    }
  }

  return { valid: false, reason: 'VERIFICATION_FAILED' };
};

/**
 * Evaluates contract-level compliance status based on authoritative business rules (Stage 3A - ISSUE-01).
 * Accounts for contract status, approval status, payment status, effective start date,
 * expiry date, and current date in Asia/Kolkata business timezone.
 */
const evaluateContractCompliance = (contract) => {
  if (!contract || typeof contract !== 'object') {
    return { isCompliant: false, complianceStatus: 'INVALID_CONTRACT' };
  }

  const todayStr = getBusinessTodayStr();
  const startDateStr = formatDateOnly(contract.start_date || contract.startDate);
  const endDateStr = formatDateOnly(contract.end_date || contract.endDate);
  const status = String(contract.status || '').toLowerCase().trim();
  const approvalStatus = String(contract.approval_status || contract.approvalStatus || '').toLowerCase().trim();
  const paymentStatus = String(contract.payment_status || contract.paymentStatus || '').toLowerCase().trim();

  // Cancelled contracts are never active or compliant
  if (status === 'cancelled') {
    return { isCompliant: false, complianceStatus: 'CANCELLED' };
  }

  // Rejected contracts are never active or compliant
  if (status === 'rejected' || approvalStatus === 'rejected') {
    return { isCompliant: false, complianceStatus: 'REJECTED' };
  }

  // If expiry date has passed, it is expired regardless of whether background cron has transitioned stored status
  if (endDateStr && todayStr > endDateStr) {
    return { isCompliant: false, complianceStatus: 'EXPIRED' };
  }
  if (status === 'expired') {
    return { isCompliant: false, complianceStatus: 'EXPIRED' };
  }

  // Future-dated contracts that have not yet reached start date
  if (startDateStr && todayStr < startDateStr) {
    return { isCompliant: false, complianceStatus: 'PENDING_START_DATE' };
  }

  // Check active-compliance conditions:
  // Must be active status, approved, paid, and within valid date boundaries
  const hasActiveStatus = status === 'active';
  const isApproved = approvalStatus === 'approved';
  const isPaid = paymentStatus === 'paid';
  const isDateValid = (!startDateStr || todayStr >= startDateStr) && (!endDateStr || todayStr <= endDateStr);

  const isCompliant = hasActiveStatus && isApproved && isPaid && isDateValid;

  if (isCompliant) {
    return { isCompliant: true, complianceStatus: 'ACTIVE_COMPLIANT' };
  }

  // Non-compliant fallback reflecting normalized contract status
  const normalizedStatus = status ? status.toUpperCase() : 'NON_COMPLIANT';
  return { isCompliant: false, complianceStatus: normalizedStatus };
};

/**
 * 25. Get Contract Certificate Data
 * Authoritative backend data contract for generating official compliance certificate / printable PDF.
 */
const getContractCertificateData = async (contractId, user) => {
  const [contracts] = await pool.query(`
    SELECT c.*, 
           u.name AS company_name, u.email AS company_email, u.phone AS company_phone,
           cp.company_id AS canonical_company_id, cp.address AS company_address, cp.gst_number AS gstin,
           p.coverage_terms, p.duration_months
    FROM amc_contracts c
    JOIN users u ON c.company_id = u.id
    LEFT JOIN company_profiles cp ON u.id = cp.user_id
    LEFT JOIN amc_plans p ON c.plan_id = p.id
    WHERE c.id = ?
  `, [contractId]);

  if (contracts.length === 0) {
    throw new Error('AMC Contract not found.');
  }

  const contract = contracts[0];

  // Tenant Authorization
  if (user.role === 'company') {
    const resolvedCompanyId = await resolveCompanyUserId(pool, user.id);
    if (contract.company_id !== resolvedCompanyId) {
      throw new Error('Access denied: You are not authorized to view this contract certificate.');
    }
  } else if (user.role !== 'admin') {
    throw new Error('Access denied: Only admins and the registered contract holder can access this certificate.');
  }

  // Covered devices
  const [devices] = await pool.query(`
    SELECT cd.id, cd.amc_tag, cd.coverage_start_date, cd.coverage_end_date, cd.status,
           d.brand, d.model_number, d.serial_number, d.asset_id, d.device_category
    FROM amc_covered_devices cd
    JOIN company_devices d ON cd.device_id = d.id
    WHERE cd.contract_id = ?
    ORDER BY cd.id ASC
  `, [contractId]);

  // Site branding
  const [settings] = await pool.query(`
    SELECT setting_key, setting_value FROM site_settings 
    WHERE setting_key IN ('company_name', 'company_email', 'company_phone', 'company_address', 'gstin')
  `);
  const orgSettings = {};
  settings.forEach(s => { orgSettings[s.setting_key] = s.setting_value; });

  const issuer = {
    name: orgSettings.company_name || 'The Tek Doctor',
    email: orgSettings.company_email || 'info@tekdoctor.in',
    phone: orgSettings.company_phone || '+91 9136868902',
    address: orgSettings.company_address || 'Mumbai, Maharashtra, India',
    gstin: orgSettings.gstin || '27AAAAA0000A1Z5'
  };

  const certificateNumber = `CERT-${contract.contract_number.replace(/^AMC-CTR-/, '').replace(/^AMC-RNW-/, 'RNW-')}`;
  const verificationCode = generateCertificateHmacCode(contract);

  let parsedTerms = null;
  try {
    parsedTerms = typeof contract.coverage_terms === 'string' ? JSON.parse(contract.coverage_terms) : contract.coverage_terms;
  } catch (_) {}

  const compResult = evaluateContractCompliance(contract);

  return {
    certificateNumber,
    verificationCode,
    issuedAt: new Date().toISOString(),
    isVerified: compResult.isCompliant,
    complianceStatus: compResult.complianceStatus,
    contract: {
      id: contract.id,
      companyId: contract.company_id,
      company_id: contract.company_id,
      contractNumber: contract.contract_number,
      planName: contract.plan_name,
      contractType: contract.contract_type,
      isRenewal: Boolean(contract.is_renewal),
      previousContractId: contract.previous_contract_id,
      status: contract.status,
      approvalStatus: contract.approval_status,
      paymentStatus: contract.payment_status,
      startDate: formatDateOnly(contract.start_date),
      endDate: formatDateOnly(contract.end_date),
      deviceCapacity: contract.device_capacity,
      activeCoveredCount: devices.filter(d => d.status === 'active').length,
      totalAmount: contract.total_amount,
      currency: contract.currency || 'INR',
      invoiceId: contract.invoice_id,
      termsAndConditions: contract.terms_and_conditions
    },
    company: {
      id: contract.company_id,
      code: contract.canonical_company_id || `CMP-${contract.company_id}`,
      name: contract.company_name,
      email: contract.company_email,
      phone: contract.company_phone,
      address: contract.company_address || 'Address on record',
      gstin: contract.gstin || 'N/A'
    },
    coveredDevices: devices.map(d => ({
      id: d.id,
      amcTag: d.amc_tag,
      brand: d.brand,
      modelNumber: d.model_number,
      serialNumber: d.serial_number,
      assetId: d.asset_id,
      deviceCategory: d.device_category,
      status: d.status,
      coverageStartDate: formatDateOnly(d.coverage_start_date),
      coverageEndDate: formatDateOnly(d.coverage_end_date)
    })),
    sla: {
      slaTurnaroundHours: parsedTerms?.sla_turnaround_hours || 48,
      priorityLevel: parsedTerms?.priority_level || 'Standard Business Fleet SLA',
      quarterlyAudit: parsedTerms?.quarterly_audit !== false,
      laborDiscountPct: parsedTerms?.labor_discount_pct !== undefined ? parsedTerms.labor_discount_pct : 100,
      partsDiscountPct: parsedTerms?.parts_discount_pct !== undefined ? parsedTerms.parts_discount_pct : 10
    },
    issuer
  };
};

/**
 * 26. Public Certificate Verification (Fix F & Stage 3A ISSUE-01, ISSUE-05)
 * Validates a certificate verification code and returns safe, sanitized public compliance metadata.
 * Zero internal credentials, device serials, financials, or private notes are exposed.
 */
const getPublicCertificateVerification = async (verificationCode, contractNumber = null) => {
  if (!verificationCode || typeof verificationCode !== 'string' || verificationCode.trim().length !== 16) {
    return { valid: false, reason: 'INVALID_CODE_FORMAT' };
  }

  let sql = `
    SELECT c.*, u.name AS company_name
    FROM amc_contracts c
    JOIN users u ON c.company_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (contractNumber) {
    sql += ' AND c.contract_number = ?';
    params.push(contractNumber.trim());
  } else {
    // Stage 3A (ISSUE-05): Consistent lifecycle states included in blind lookup
    sql += " AND c.status IN ('active', 'expired', 'cancelled', 'suspended', 'rejected', 'accepted', 'offered')";
  }
  sql += ' ORDER BY c.id DESC LIMIT 100';

  const [contracts] = await pool.query(sql, params);

  for (const c of contracts) {
    const authResult = verifyCertificateAuthenticity(c, verificationCode);
    if (authResult.valid) {
      const compResult = evaluateContractCompliance(c);
      return {
        valid: true,
        version: authResult.version,
        certificateNumber: `CERT-${c.contract_number.replace(/^AMC-CTR-/, '').replace(/^AMC-RNW-/, 'RNW-')}`,
        contractNumber: c.contract_number,
        companyName: c.company_name,
        planName: c.plan_name,
        status: c.status,
        complianceStatus: compResult.complianceStatus,
        startDate: formatDateOnly(c.start_date),
        endDate: formatDateOnly(c.end_date),
        verifiedAt: new Date().toISOString()
      };
    }
  }

  return {
    valid: false,
    reason: 'CERTIFICATE_NOT_FOUND_OR_INVALID'
  };
};

/**
 * 27. Get Expiry Reminders History (Admin Audit Log)
 */
const getExpiryRemindersHistory = async ({ contractId = null, companyId = null, status = null, limit = 50 } = {}) => {
  let sql = `
    SELECT r.*, c.contract_number, c.plan_name, u.name AS company_name, cp.company_id AS canonical_company_id
    FROM amc_expiry_reminders r
    JOIN amc_contracts c ON r.contract_id = c.id
    JOIN users u ON r.company_id = u.id
    LEFT JOIN company_profiles cp ON u.id = cp.user_id
    WHERE 1=1
  `;
  const params = [];
  if (contractId) {
    sql += ' AND r.contract_id = ?';
    params.push(contractId);
  }
  if (companyId) {
    const resolvedId = await resolveCompanyUserId(pool, companyId);
    sql += ' AND r.company_id = ?';
    params.push(resolvedId);
  }
  if (status && status !== 'all') {
    sql += ' AND r.delivery_status = ?';
    params.push(status.trim().toLowerCase());
  }
  sql += ' ORDER BY r.id DESC LIMIT ?';
  params.push(parseInt(limit, 10) || 50);

  const [rows] = await pool.query(sql, params);
  return rows.map(r => {
    let parsedMeta = null;
    try {
      parsedMeta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
    } catch (_) {}
    return {
      ...r,
      metadata: parsedMeta,
      expiry_date: formatDateOnly(r.expiry_date)
    };
  });
};

/**
 * 28. Retry Failed AMC Expiry Reminder (Fix 2 Hardening)
 * Manually retries unfulfilled delivery channels for a failed or partial reminder.
 */
const retryReminder = async (reminderId, adminUserId = null) => {
  const [reminders] = await pool.query(`
    SELECT r.*, c.contract_number, c.plan_name, c.status AS contract_status, u.name AS company_name, u.email AS company_email
    FROM amc_expiry_reminders r
    JOIN amc_contracts c ON r.contract_id = c.id
    JOIN users u ON r.company_id = u.id
    WHERE r.id = ?
    LIMIT 1
  `, [reminderId]);

  if (reminders.length === 0) {
    throw new Error(`Reminder record #${reminderId} not found.`);
  }

  const reminder = reminders[0];
  if (reminder.contract_status !== 'active') {
    throw new Error(`Cannot retry reminder for contract with status "${reminder.contract_status}". Contract must be "active".`);
  }
  if (reminder.delivery_status === 'success') {
    throw new Error(`Reminder #${reminderId} has already completed successfully.`);
  }
  if (reminder.delivery_status === 'processing') {
    throw new Error(`Reminder #${reminderId} is currently being processed by another worker.`);
  }

  // Atomically claim the reminder
  const [claimRes] = await pool.query(`
    UPDATE amc_expiry_reminders
    SET delivery_status = 'processing',
        last_attempted_at = CURRENT_TIMESTAMP,
        retry_count = retry_count + 1
    WHERE id = ? AND delivery_status IN ('failed', 'partial', 'pending')
  `, [reminder.id]);

  if (claimRes.affectedRows === 0) {
    throw new Error('Reminder is already being processed or modified by another worker.');
  }

  // Read retry base minutes setting (default 15 minutes)
  let retryBaseMinutes = config.amc?.retryBaseMinutes || 15;
  try {
    const [settingRows] = await pool.query(
      "SELECT setting_value FROM site_settings WHERE setting_key = 'amc_reminder_retry_base_minutes' LIMIT 1"
    );
    if (settingRows.length > 0 && settingRows[0].setting_value) {
      const parsedMinutes = parseInt(settingRows[0].setting_value, 10);
      if (!isNaN(parsedMinutes) && parsedMinutes > 0) {
        retryBaseMinutes = parsedMinutes;
      }
    }
  } catch (settingErr) {
    logger.warn(`[AMC Reminders] Could not read custom retry base minutes: ${settingErr.message}`);
  }

  const currentRetryCount = reminder.retry_count + 1;
  const todayBusinessStr = getBusinessTodayStr();
  const endDateStr = formatDateOnly(reminder.expiry_date);
  const daysLeft = Math.max(0, Math.ceil((new Date(endDateStr + 'T00:00:00+05:30').getTime() - new Date(todayBusinessStr + 'T00:00:00+05:30').getTime()) / (1000 * 60 * 60 * 24)));

  const title = `AMC Expiry Notice: ${reminder.contract_number} (${reminder.milestone_days} Day${reminder.milestone_days === 1 ? '' : 's'} Notice)`;
  const message = `Dear ${reminder.company_name || 'Valued Client'}, your AMC contract ${reminder.contract_number} (${reminder.plan_name}) will expire on ${endDateStr}. Please renew before the expiry date to ensure continuous device repair protection and prevent coverage lapse.`;

  const needInApp = reminder.in_app_status !== 'success';
  const needEmail = reminder.email_status !== 'success';

  const dispatchTrackingId = `MANUAL-RETRY-${reminder.id}-ATTEMPT-${currentRetryCount}-${Date.now()}`;

  const dispatchResult = await sendAmcNotification({
    userId: reminder.company_id,
    title,
    message,
    sendInApp: needInApp,
    sendEmail: needEmail
  });

  const updatedInAppStatus = needInApp ? (dispatchResult.inAppSuccess ? 'success' : 'failed') : reminder.in_app_status;
  const updatedEmailStatus = needEmail ? (dispatchResult.emailSuccess ? 'success' : 'failed') : reminder.email_status;

  let finalDeliveryStatus = 'failed';
  if (updatedInAppStatus === 'success' && updatedEmailStatus === 'success') {
    finalDeliveryStatus = 'success';
  } else if (updatedInAppStatus === 'success' || updatedEmailStatus === 'success') {
    finalDeliveryStatus = 'partial';
  }

  const errors = [];
  if (dispatchResult.inAppError) errors.push(`In-App: ${dispatchResult.inAppError}`);
  if (dispatchResult.emailError) errors.push(`Email: ${dispatchResult.emailError}`);
  const errorMessage = errors.length > 0 ? errors.join('; ') : null;

  // Calculate exponential backoff for next retry if still failed/partial and within retry limit
  let nextRetryClause = 'NULL';
  const updateParams = [finalDeliveryStatus, updatedInAppStatus, updatedEmailStatus, errorMessage];

  if ((finalDeliveryStatus === 'failed' || finalDeliveryStatus === 'partial') && currentRetryCount < 5) {
    const backoffMinutes = retryBaseMinutes * Math.pow(2, currentRetryCount - 1);
    nextRetryClause = 'DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)';
    updateParams.push(backoffMinutes);
  }

  updateParams.push(adminUserId || null, dispatchTrackingId, reminder.id);

  await pool.query(`
    UPDATE amc_expiry_reminders
    SET delivery_status = ?,
        in_app_status = ?,
        email_status = ?,
        error_message = ?,
        sent_at = CURRENT_TIMESTAMP,
        next_retry_at = ${nextRetryClause},
        metadata = JSON_SET(COALESCE(metadata, '{}'), '$.manualRetriedBy', ?, '$.lastDispatchTrackingId', ?, '$.manualRetriedAt', CURRENT_TIMESTAMP)
    WHERE id = ?
  `, updateParams);

  return {
    success: finalDeliveryStatus === 'success' || finalDeliveryStatus === 'partial',
    deliveryStatus: finalDeliveryStatus,
    inAppStatus: updatedInAppStatus,
    emailStatus: updatedEmailStatus,
    errorMessage,
    message: finalDeliveryStatus === 'success'
      ? 'Reminder successfully dispatched across all channels.'
      : (finalDeliveryStatus === 'partial'
        ? 'Reminder partially delivered (one channel succeeded).'
        : `Retry attempted but delivery failed: ${errorMessage || 'Unknown error'}`)
  };
};

module.exports = {
  addDaysOnly,
  formatDateOnly,
  getBusinessTodayStr,
  resolveDeviceAmcEligibility,
  checkContractCapacity,
  assignDevicesToCoverage,
  requestDeviceReplacement,
  reviewDeviceReplacement,
  getPlans,
  createPlan,
  updatePlan,
  togglePlanStatus,
  createAmcRequest,
  getAmcRequests,
  reviewAmcRequest,
  createAmcContract,
  getContracts,
  getContractDetails,
  acceptAmcOffer,
  rejectAmcOffer,
  approveAmcContract,
  activateAmcContract,
  updateContractStatus,
  getAdminOverview,
  createContractPaymentOrder,
  verifyContractPayment,
  initiateContractOfflinePayment,
  verifyContractOfflinePayment,
  sendAmcNotification,
  processContractExpiries,
  processExpiryReminders,
  processSelectionDeadlineReminders,
  requestAmcRenewal,
  createAmcRenewalContract,
  getCertificateSecret,
  getCertificateSecrets,
  generateCertificateCanonicalPayload,
  generateCertificateHmacCode,
  verifyCertificateAuthenticity,
  getContractCertificateData,
  getPublicCertificateVerification,
  evaluateContractCompliance,
  getExpiryRemindersHistory,
  retryReminder
};
