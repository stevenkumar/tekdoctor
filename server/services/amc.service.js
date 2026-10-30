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

/**
 * Format a Date object or string into YYYY-MM-DD reliably without timezone shift.
 */
const formatDateOnly = (d) => {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(d).slice(0, 10);
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

    const targetDate = repairDate ? formatDateOnly(repairDate) : formatDateOnly(new Date());

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
    SELECT r.*, p.name AS plan_name, p.plan_code, u.name AS company_name, cp.company_id AS canonical_company_id
    FROM amc_requests r
    LEFT JOIN amc_plans p ON r.plan_id = p.id
    LEFT JOIN users u ON r.company_id = u.id
    LEFT JOIN company_profiles cp ON u.id = cp.user_id
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
      terms_and_conditions, offer_valid_until, start_date, end_date,
      status, approval_status, payment_status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offered', 'pending_approval', 'unpaid', ?)
  `, [
    contractNumber, resolvedCompanyId, requestId || null, planId || null, contractType,
    planName, deviceCapacity, price, discountAmount, taxAmount, totalAmount,
    termsAndConditions || null, offerValidUntil || null, startDate || null, endDate || null,
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
      (SELECT COUNT(*) FROM amc_covered_devices cd WHERE cd.contract_id = c.id AND cd.status = 'active') AS active_covered_count
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
  return rows.map(r => ({
    ...r,
    start_date: r.start_date ? formatDateOnly(r.start_date) : null,
    end_date: r.end_date ? formatDateOnly(r.end_date) : null,
    offer_valid_until: r.offer_valid_until ? formatDateOnly(r.offer_valid_until) : null
  }));
};

const getContractDetails = async (contractId, companyId = null) => {
  let sql = `
    SELECT c.*, u.name AS company_name, u.email AS company_email, cp.company_id AS canonical_company_id
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

  return {
    ...contract,
    start_date: contract.start_date ? formatDateOnly(contract.start_date) : null,
    end_date: contract.end_date ? formatDateOnly(contract.end_date) : null,
    offer_valid_until: contract.offer_valid_until ? formatDateOnly(contract.offer_valid_until) : null,
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
 */
const sendAmcNotification = async ({ userId = null, companyId = null, role = null, title, message, ticketId = null }) => {
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

    for (const r of recipients) {
      await pool.query(
        'INSERT INTO notifications (user_id, ticket_id, title, message) VALUES (?, ?, ?, ?)',
        [r.id, ticketId, title, message]
      );
      // Asynchronous email dispatch (failsafe)
      try {
        if (role === 'admin' || r.role === 'admin') {
          sendAdminNotification(title, `<p>${message}</p>`).catch(() => {});
        } else if (r.email) {
          sendCustomerNotification(r.email, title, `<p>Hello ${r.name || 'Valued Client'},</p><p>${message}</p>`).catch(() => {});
        }
      } catch (_) {}
    }
  } catch (err) {
    logger.warn(`Failed to dispatch AMC notification: ${err.message}`);
  }
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

  await pool.query('UPDATE amc_contracts SET status = "rejected" WHERE id = ?', [contractId]);

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'OFFER_REJECTED', ?, ?)
  `, [contractId, userId || null, JSON.stringify({ reason: reason || 'Company declined offer', rejectedAt: new Date() })]);

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

module.exports = {
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
  sendAmcNotification
};
