/**
 * Verification Suite: Phase 3 — Renewal Request Numbering (REQ-RNW-...) &
 * Bounded Duplicate-Key Contract Retry with Mandatory Rollback Safety
 *
 * Covers:
 *  A. Contract retry unit/mocked tests (MariaDB & MySQL keys, rollback success/failure,
 *     non-extensible error objects, 5-attempt cap, non-retry errors, connection release,
 *     zero pre-commit email/notification dispatches)
 *  B. Renewal request unit/mocked tests (REQ-RNW regex, 2 collisions + attempt 3 success,
 *     3-attempt exhaustion, unrelated errors fail fast, 1x history/notification post-insert)
 *  C. Real isolated MariaDB integration tests (real ER_DUP_ENTRY collisions, sequence
 *     non-reuse, FK non-retry, REQ-RNW insertion & notifications, legacy AMC-RNW
 *     preservation & CERT-RNW certificate compatibility)
 */

const assert = require('assert');
const { pool } = require('../config/db.config');
const amcService = require('../services/amc.service');

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

/**
 * Loads a fresh instance of server/services/amc.service.js with controlled dependencies
 * in require.cache and restores original cache entries on cleanup.
 */
function withMockedAmcService({ poolMock, allocateMock, emailMock, loggerMock }, fn) {
  const paths = {
    service: require.resolve('../services/amc.service'),
    db: require.resolve('../config/db.config'),
    helpers: require.resolve('../utils/helpers'),
    email: require.resolve('../utils/email.utils'),
    logger: require.resolve('../utils/logger')
  };

  const originalCache = {};
  for (const key of Object.keys(paths)) {
    originalCache[key] = require.cache[paths[key]];
  }

  const realHelpers = require('../utils/helpers');
  const realEmail = require('../utils/email.utils');
  const realLogger = require('../utils/logger');

  try {
    delete require.cache[paths.service];

    require.cache[paths.db] = {
      id: paths.db,
      filename: paths.db,
      loaded: true,
      exports: { pool: poolMock }
    };

    require.cache[paths.helpers] = {
      id: paths.helpers,
      filename: paths.helpers,
      loaded: true,
      exports: {
        ...realHelpers,
        allocateNextCompanyAmcContractNumber: allocateMock || realHelpers.allocateNextCompanyAmcContractNumber
      }
    };

    require.cache[paths.email] = {
      id: paths.email,
      filename: paths.email,
      loaded: true,
      exports: {
        ...realEmail,
        ...(emailMock || {})
      }
    };

    require.cache[paths.logger] = {
      id: paths.logger,
      filename: paths.logger,
      loaded: true,
      exports: {
        ...realLogger,
        ...(loggerMock || {})
      }
    };

    const isolatedService = require('../services/amc.service');
    return fn(isolatedService);
  } finally {
    delete require.cache[paths.service];
    for (const key of Object.keys(paths)) {
      if (originalCache[key]) {
        require.cache[paths[key]] = originalCache[key];
      } else {
        delete require.cache[paths[key]];
      }
    }
  }
}

function makeDupError(message, { freeze = false } = {}) {
  const err = new Error(message);
  err.code = 'ER_DUP_ENTRY';
  err.errno = 1062;
  err.sqlMessage = message;
  return freeze ? Object.freeze(err) : err;
}

async function runMockedContractRetryTests() {
  console.log('\n[Section A] Mocked Contract Retry & Rollback Safety Tests');

  // 1. Rollback failure stops immediately, preserves both errors (extensible & frozen), releases connection
  for (const freezeError of [false, true]) {
    let allocCalls = 0;
    let getConnCalls = 0;
    let releaseCalls = 0;
    let rollbackCalls = 0;
    let customerEmailCalls = 0;
    const errorLogs = [];

    const dupErr = makeDupError("Duplicate entry 'AMC-CMP-M01-001' for key 'contract_number'", { freeze: freezeError });
    const rbErr = new Error('Connection lost during rollback');
    rbErr.code = 'PROTOCOL_CONNECTION_LOST';

    const poolMock = {
      async query(sql) {
        if (sql.includes('FROM amc_contracts WHERE id = ?')) {
          return [[{ id: 10, company_id: 101, contract_number: 'AMC-CMP-M01-000', plan_id: 1, plan_name: 'Gold', device_capacity: 5, price: 1000, end_date: '2099-01-01', terms_and_conditions: 'T' }]];
        }
        return [[]];
      },
      async getConnection() {
        getConnCalls++;
        return {
          async beginTransaction() {},
          async query(sql) {
            if (sql.includes('INSERT INTO amc_contracts')) throw dupErr;
            return [{ insertId: 1 }];
          },
          async commit() {
            throw new Error('commit must not be reached');
          },
          async rollback() {
            rollbackCalls++;
            throw rbErr;
          },
          release() {
            releaseCalls++;
          }
        };
      }
    };

    await withMockedAmcService(
      {
        poolMock,
        allocateMock: async () => {
          allocCalls++;
          return `AMC-CMP-M01-00${allocCalls}`;
        },
        emailMock: {
          async sendCustomerNotification() { customerEmailCalls++; return true; },
          async sendAdminNotification() { return true; }
        },
        loggerMock: {
          error(msg, meta) { errorLogs.push({ msg, meta }); },
          warn() {},
          info() {}
        }
      },
      async (svc) => {
        let caught = null;
        try {
          await svc.createAmcRenewalContract({ previousContractId: 10, createdBy: 1 });
        } catch (err) {
          caught = err;
        }
        const label = freezeError ? 'frozen non-extensible error' : 'extensible error';
        check(caught === dupErr, `Rollback failure (${label}) rethrows exact original insertion error`);
        check(allocCalls === 1, `Rollback failure (${label}) halts immediately after 1st attempt (allocCalls=${allocCalls})`);
        check(getConnCalls === 1 && rollbackCalls === 1 && releaseCalls === 1, `Rollback failure (${label}) checked out 1 conn, called rollback once, released in finally`);
        check(customerEmailCalls === 0, `Rollback failure (${label}) sends 0 emails/notifications`);
        check(
          errorLogs.length >= 1 &&
          errorLogs[0].meta &&
          errorLogs[0].meta.insertError === dupErr.message &&
          errorLogs[0].meta.rollbackError === rbErr.message,
          `Rollback failure (${label}) preserves both insertError and rollbackError in structured diagnostics`
        );
        if (!freezeError) {
          check(caught.rollbackError === rbErr, 'Rollback failure attaches rollbackError cleanly when error object is extensible');
        }
      }
    );
  }

  // 2. Exhausting 5 attempts on MySQL-formatted key ('amc_contracts.contract_number')
  {
    const allocatedNumbers = [];
    const lifecycle = [];
    let getConnCalls = 0;
    let releaseCalls = 0;
    let rollbackCalls = 0;
    let customerEmailCalls = 0;

    const poolMock = {
      async query(sql) {
        if (sql.includes('FROM amc_contracts WHERE id = ?')) {
          return [[{ id: 11, company_id: 102, contract_number: 'AMC-CMP-M02-000', plan_id: 1, plan_name: 'Pro', device_capacity: 5, price: 2000, end_date: '2099-01-01', terms_and_conditions: 'T' }]];
        }
        return [[]];
      },
      async getConnection() {
        const idx = ++getConnCalls;
        lifecycle.push(`acquire-${idx}`);
        return {
          async beginTransaction() { lifecycle.push(`begin-${idx}`); },
          async query(sql) {
            if (sql.includes('INSERT INTO amc_contracts')) {
              throw makeDupError(`Duplicate entry 'AMC-CMP-M02-00${idx}' for key 'amc_contracts.contract_number'`);
            }
            return [{ insertId: 1 }];
          },
          async commit() { lifecycle.push(`commit-${idx}`); },
          async rollback() { rollbackCalls++; lifecycle.push(`rollback-${idx}`); },
          release() { releaseCalls++; lifecycle.push(`release-${idx}`); }
        };
      }
    };

    await withMockedAmcService(
      {
        poolMock,
        allocateMock: async () => {
          const num = `AMC-CMP-M02-00${allocatedNumbers.length + 1}`;
          allocatedNumbers.push(num);
          return num;
        },
        emailMock: {
          async sendCustomerNotification() { customerEmailCalls++; return true; },
          async sendAdminNotification() { return true; }
        },
        loggerMock: { error() {}, warn() {}, info() {} }
      },
      async (svc) => {
        let caught = null;
        try {
          await svc.createAmcRenewalContract({ previousContractId: 11, createdBy: 1 });
        } catch (err) {
          caught = err;
        }
        check(caught && caught.code === 'ER_DUP_ENTRY', 'Exhausted 5-attempt MySQL duplicate key throws ER_DUP_ENTRY');
        check(allocatedNumbers.length === 5 && new Set(allocatedNumbers).size === 5, 'Exhaustion executes exactly 5 attempts with 5 distinct sequence numbers (no reuse)');
        check(getConnCalls === 5 && rollbackCalls === 5 && releaseCalls === 5, 'Exhaustion acquires 5 connections, rolls back 5 times, releases all 5');
        check(customerEmailCalls === 0, 'Exhaustion triggers 0 renewal emails/notifications');
        check(lifecycle.indexOf('release-1') < lifecycle.indexOf('acquire-2'), 'Connection 1 is released before Attempt 2 acquires Connection 2');
      }
    );
  }

  // 3. No retry on unrelated ER_DUP_ENTRY key, FK error, or deadlock
  for (const scenario of [
    { label: 'unrelated unique key', err: makeDupError("Duplicate entry 'x@y.com' for key 'users.email'") },
    { label: 'foreign key failure', err: Object.assign(new Error('Cannot add or update a child row'), { code: 'ER_NO_REFERENCED_ROW_2', errno: 1452 }) },
    { label: 'deadlock error', err: Object.assign(new Error('Deadlock found when trying to get lock'), { code: 'ER_LOCK_DEADLOCK', errno: 1213 }) }
  ]) {
    let allocCalls = 0;
    let releaseCalls = 0;
    let rollbackCalls = 0;

    const poolMock = {
      async getConnection() {
        return {
          async beginTransaction() {},
          async query(sql) {
            if (sql.includes('INSERT INTO amc_contracts')) throw scenario.err;
            return [{ insertId: 1 }];
          },
          async commit() {},
          async rollback() { rollbackCalls++; },
          release() { releaseCalls++; }
        };
      }
    };

    await withMockedAmcService(
      {
        poolMock,
        allocateMock: async () => {
          allocCalls++;
          return 'AMC-CMP-M03-001';
        },
        loggerMock: { error() {}, warn() {}, info() {} }
      },
      async (svc) => {
        let caught = null;
        try {
          await svc.createAmcContract({
            companyId: 103,
            planName: 'Basic',
            deviceCapacity: 1,
            price: 1000,
            totalAmount: 1000
          });
        } catch (err) {
          caught = err;
        }
        check(caught === scenario.err, `Non-retry (${scenario.label}) propagates original error`);
        check(allocCalls === 1 && rollbackCalls === 1 && releaseCalls === 1, `Non-retry (${scenario.label}) stops on attempt 1, rolls back, and releases connection`);
      }
    );
  }

  // 4. Collision on attempt 1, success on attempt 2 for createAmcContract
  {
    const allocated = [];
    let attempt = 0;
    let releaseCalls = 0;
    let rollbackCalls = 0;

    const poolMock = {
      async getConnection() {
        const myAttempt = ++attempt;
        return {
          async beginTransaction() {},
          async query(sql) {
            if (sql.includes('INSERT INTO amc_contracts')) {
              if (myAttempt === 1) {
                throw makeDupError(`Duplicate entry '${allocated[0]}' for key 'contract_number'`);
              }
              return [{ insertId: 801 }];
            }
            return [{ insertId: 1 }];
          },
          async commit() {},
          async rollback() { rollbackCalls++; },
          release() { releaseCalls++; }
        };
      }
    };

    await withMockedAmcService(
      {
        poolMock,
        allocateMock: async () => {
          const code = `AMC-CMP-M03C-00${allocated.length + 1}`;
          allocated.push(code);
          return code;
        },
        loggerMock: { error() {}, warn() {}, info() {} }
      },
      async (svc) => {
        const res = await svc.createAmcContract({
          companyId: 103,
          planName: 'Retry Standard Plan',
          deviceCapacity: 2,
          price: 2000,
          totalAmount: 2000
        });
        check(res.id === 801 && res.contractNumber === 'AMC-CMP-M03C-002', `createAmcContract recovered on attempt 2 with ${res.contractNumber}`);
        check(allocated.join(',') === 'AMC-CMP-M03C-001,AMC-CMP-M03C-002', 'createAmcContract skipped collided -001 and advanced to -002');
        check(rollbackCalls === 1 && releaseCalls === 2, 'createAmcContract rolled back attempt 1 and released both connections');
      }
    );
  }

  // 5. Collision on attempts 1 & 2, success on attempt 3 for createAmcRenewalContract + single email dispatch
  {
    const allocated = [];
    let attempt = 0;
    let customerEmails = 0;
    let inAppInserts = 0;
    let releaseCalls = 0;
    let rollbackCalls = 0;

    const poolMock = {
      async query(sql) {
        if (sql.includes('FROM amc_contracts WHERE id = ?')) {
          return [[{ id: 12, company_id: 104, contract_number: 'AMC-CMP-M04-000', plan_id: 1, plan_name: 'Enterprise', device_capacity: 5, price: 5000, end_date: '2099-01-01', terms_and_conditions: 'T' }]];
        }
        if (sql.includes('SELECT id, email, name, role FROM users')) {
          return [[{ id: 104, email: 'corp104@example.com', name: 'Corp 104', role: 'company' }]];
        }
        if (sql.includes('INSERT INTO notifications')) {
          inAppInserts++;
          return [{ insertId: 700 }];
        }
        return [[]];
      },
      async getConnection() {
        const myAttempt = ++attempt;
        return {
          async beginTransaction() {},
          async query(sql) {
            if (sql.includes('INSERT INTO amc_contracts')) {
              if (myAttempt <= 2) {
                throw makeDupError(`Duplicate entry '${allocated[myAttempt - 1]}' for key 'contract_number'`);
              }
              return [{ insertId: 901 }];
            }
            return [{ insertId: 1 }];
          },
          async commit() {},
          async rollback() { rollbackCalls++; },
          release() { releaseCalls++; }
        };
      }
    };

    await withMockedAmcService(
      {
        poolMock,
        allocateMock: async () => {
          const code = `AMC-CMP-M04-00${allocated.length + 1}`;
          allocated.push(code);
          return code;
        },
        emailMock: {
          async sendCustomerNotification() { customerEmails++; return true; },
          async sendAdminNotification() { return true; }
        },
        loggerMock: { error() {}, warn() {}, info() {} }
      },
      async (svc) => {
        const res = await svc.createAmcRenewalContract({ previousContractId: 12, createdBy: 1 });
        check(res.id === 901 && res.contractNumber === 'AMC-CMP-M04-003', `createAmcRenewalContract recovered on attempt 3 with ${res.contractNumber}`);
        check(allocated.join(',') === 'AMC-CMP-M04-001,AMC-CMP-M04-002,AMC-CMP-M04-003', 'Consumed sequence numbers -001 and -002 were skipped cleanly');
        check(rollbackCalls === 2 && releaseCalls === 3, 'Rolled back 2 failed attempts and released all 3 connections');
        check(inAppInserts === 1 && customerEmails === 1, `Post-commit notification (inApp=${inAppInserts}) and email (email=${customerEmails}) executed exactly once`);
      }
    );
  }
}

async function runMockedRenewalRequestTests() {
  console.log('\n[Section B] Mocked Renewal Request (REQ-RNW) Retry Tests');

  // 1. Two collisions (MariaDB + MySQL format) followed by success on attempt 3
  {
    const attemptedNumbers = [];
    let historyCalls = 0;
    let adminEmailCalls = 0;
    let inAppAdminNotifs = 0;

    const poolMock = {
      async query(sql, params) {
        if (sql.includes('SELECT * FROM amc_contracts WHERE id = ?')) {
          return [[{ id: 21, company_id: 201, contract_number: 'AMC-CMP-R01-001', status: 'active', plan_id: 1, plan_name: 'Gold', device_capacity: 4 }]];
        }
        if (sql.includes('FROM amc_requests') && sql.includes('SELECT id, request_number')) return [[]];
        if (sql.includes('FROM amc_contracts') && sql.includes('previous_contract_id = ?')) return [[]];
        if (sql.includes('INSERT INTO amc_requests')) {
          attemptedNumbers.push(params[0]);
          if (attemptedNumbers.length === 1) {
            throw makeDupError(`Duplicate entry '${params[0]}' for key 'request_number'`);
          }
          if (attemptedNumbers.length === 2) {
            throw makeDupError(`Duplicate entry '${params[0]}' for key 'amc_requests.request_number'`);
          }
          return [{ insertId: 505 }];
        }
        if (sql.includes('INSERT INTO amc_contract_history')) {
          historyCalls++;
          return [{ insertId: 1 }];
        }
        if (sql.includes('FROM users WHERE role = "admin"')) {
          return [[{ id: 1, email: 'admin@tekdoctor.in', name: 'Admin', role: 'admin' }]];
        }
        if (sql.includes('INSERT INTO notifications')) {
          inAppAdminNotifs++;
          return [{ insertId: 1 }];
        }
        return [[]];
      }
    };

    await withMockedAmcService(
      {
        poolMock,
        emailMock: {
          async sendAdminNotification() { adminEmailCalls++; return true; },
          async sendCustomerNotification() { return true; }
        },
        loggerMock: { error() {}, warn() {}, info() {} }
      },
      async (svc) => {
        const res = await svc.requestAmcRenewal({ contractId: 21, companyId: 201, requestedCapacity: 3, userId: 201 });
        check(res.success === true && res.requestId === 505, 'requestAmcRenewal succeeded on attempt 3 after 2 request_number collisions');
        check(/^REQ-RNW-[A-Z0-9]+-\d{3}$/.test(res.requestNumber), `Generated requestNumber matches ^REQ-RNW-[A-Z0-9]+-\\d{3}$ (${res.requestNumber})`);
        check(attemptedNumbers.length === 3 && attemptedNumbers.every(n => /^REQ-RNW-[A-Z0-9]+-\d{3}$/.test(n)), 'Attempted 3 fresh REQ-RNW-... IDs');
        check(historyCalls === 1 && inAppAdminNotifs === 1 && adminEmailCalls === 1, 'History (1) and admin notification/email (1) executed once post-insert');
      }
    );
  }

  // 2. Three consecutive collisions fail after exactly 3 attempts with 0 history & 0 notifications
  {
    let insertAttempts = 0;
    let historyCalls = 0;
    let adminEmailCalls = 0;
    let notifInserts = 0;

    const poolMock = {
      async query(sql, params) {
        if (sql.includes('SELECT * FROM amc_contracts WHERE id = ?')) {
          return [[{ id: 22, company_id: 202, contract_number: 'AMC-CMP-R02-001', status: 'active', plan_id: 1, plan_name: 'Gold', device_capacity: 4 }]];
        }
        if (sql.includes('FROM amc_requests') && sql.includes('SELECT id, request_number')) return [[]];
        if (sql.includes('FROM amc_contracts') && sql.includes('previous_contract_id = ?')) return [[]];
        if (sql.includes('INSERT INTO amc_requests')) {
          insertAttempts++;
          throw makeDupError(`Duplicate entry '${params[0]}' for key 'amc_requests.request_number'`);
        }
        if (sql.includes('INSERT INTO amc_contract_history')) {
          historyCalls++;
          return [{ insertId: 1 }];
        }
        if (sql.includes('INSERT INTO notifications')) {
          notifInserts++;
          return [{ insertId: 1 }];
        }
        return [[]];
      }
    };

    await withMockedAmcService(
      {
        poolMock,
        emailMock: {
          async sendAdminNotification() { adminEmailCalls++; return true; },
          async sendCustomerNotification() { return true; }
        },
        loggerMock: { error() {}, warn() {}, info() {} }
      },
      async (svc) => {
        let caught = null;
        try {
          await svc.requestAmcRenewal({ contractId: 22, companyId: 202, userId: 202 });
        } catch (err) {
          caught = err;
        }
        check(caught && caught.code === 'ER_DUP_ENTRY', '3 consecutive request_number collisions fail with ER_DUP_ENTRY');
        check(insertAttempts === 3, `Stopped after exactly 3 insert attempts (attempts=${insertAttempts})`);
        check(historyCalls === 0 && notifInserts === 0 && adminEmailCalls === 0, 'Zero history or notifications occurred when all 3 attempts failed');
      }
    );
  }

  // 3. Unrelated error fails immediately on attempt 1 without retry
  for (const errCase of [
    { label: 'FK error', err: Object.assign(new Error('FK fail'), { code: 'ER_NO_REFERENCED_ROW_2', errno: 1452 }) },
    { label: 'unrelated ER_DUP_ENTRY', err: makeDupError("Duplicate entry 'X' for key 'other_unique_col'") },
    { label: 'connection error', err: Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }) }
  ]) {
    let insertAttempts = 0;
    let historyCalls = 0;

    const poolMock = {
      async query(sql) {
        if (sql.includes('SELECT * FROM amc_contracts WHERE id = ?')) {
          return [[{ id: 23, company_id: 203, contract_number: 'AMC-CMP-R03-001', status: 'active', plan_id: 1, plan_name: 'Gold', device_capacity: 4 }]];
        }
        if (sql.includes('FROM amc_requests') && sql.includes('SELECT id, request_number')) return [[]];
        if (sql.includes('FROM amc_contracts') && sql.includes('previous_contract_id = ?')) return [[]];
        if (sql.includes('INSERT INTO amc_requests')) {
          insertAttempts++;
          throw errCase.err;
        }
        if (sql.includes('INSERT INTO amc_contract_history')) {
          historyCalls++;
        }
        return [[]];
      }
    };

    await withMockedAmcService(
      {
        poolMock,
        loggerMock: { error() {}, warn() {}, info() {} }
      },
      async (svc) => {
        let caught = null;
        try {
          await svc.requestAmcRenewal({ contractId: 23, companyId: 203, userId: 203 });
        } catch (err) {
          caught = err;
        }
        check(caught === errCase.err && insertAttempts === 1 && historyCalls === 0, `requestAmcRenewal fails immediately on attempt 1 for ${errCase.label}`);
      }
    );
  }
}

async function runRealDbIntegrationTests() {
  console.log('\n[Section C] Real MariaDB Integration Tests (Isolated Fixtures)');

  const suffix = Date.now().toString().slice(-6);
  const compCode = `CMP-P3R-${suffix}`;
  const seqName = `amc_contract_${compCode}`;
  const legacyContractNumber = `AMC-RNW-LEG${suffix}-101`;
  const createdUserIds = [];
  const createdContractIds = [];
  const createdRequestIds = [];

  try {
    const [uRes] = await pool.query(
      'INSERT INTO users (name, email, password, role, company_id, is_active) VALUES (?, ?, ?, "company", ?, 1)',
      ['Phase3 Retry Corp', `phase3_retry_${suffix}@example.com`, 'hash', compCode]
    );
    const companyUserId = uRes.insertId;
    createdUserIds.push(companyUserId);

    await pool.query(
      'INSERT INTO company_profiles (user_id, company_id, company_name) VALUES (?, ?, ?)',
      [companyUserId, compCode, 'Phase3 Retry Corp']
    );

    // 1. Legacy AMC-RNW-... contract record preservation & CERT-RNW-... certificate compatibility
    const [legRes] = await pool.query(`
      INSERT INTO amc_contracts (
        contract_number, company_id, contract_type, plan_name, device_capacity,
        price, total_amount, start_date, end_date, status, approval_status, payment_status, is_renewal
      ) VALUES (?, ?, 'renewal', 'Legacy Renewal Plan', 3, 5000, 5000, '2026-01-01', '2027-01-01', 'active', 'approved', 'paid', 1)
    `, [legacyContractNumber, companyUserId]);
    const legacyContractId = legRes.insertId;
    createdContractIds.push(legacyContractId);

    const legacyCert = await amcService.getContractCertificateData(legacyContractId, { id: companyUserId, role: 'company' });
    check(
      legacyCert.certificateNumber === `CERT-RNW-LEG${suffix}-101`,
      `Legacy AMC-RNW contract preserved and maps to ${legacyCert.certificateNumber}`
    );

    // Historical AMC-RNW-... request record remains unchanged
    const legacyReqNum = `AMC-RNW-HIST-${suffix}`;
    const [histReqRes] = await pool.query(`
      INSERT INTO amc_requests (request_number, company_id, requested_device_count, notes, status)
      VALUES (?, ?, 2, 'Historical legacy renewal request', 'offered')
    `, [legacyReqNum, companyUserId]);
    createdRequestIds.push(histReqRes.insertId);

    // 2. Real requestAmcRenewal creates REQ-RNW-... without altering historical AMC-RNW-... row
    const rnwReq = await amcService.requestAmcRenewal({
      contractId: legacyContractId,
      companyId: companyUserId,
      requestedCapacity: 4,
      notes: 'Phase 3 retry suite renewal request',
      userId: companyUserId
    });
    createdRequestIds.push(rnwReq.requestId);
    check(
      /^REQ-RNW-[A-Z0-9]+-\d{3}$/.test(rnwReq.requestNumber),
      `Real DB requestAmcRenewal created ${rnwReq.requestNumber}`
    );

    const [rnwReqHist] = await pool.query(
      "SELECT action FROM amc_contract_history WHERE contract_id = ? AND action = 'RENEWAL_REQUESTED'",
      [legacyContractId]
    );
    check(rnwReqHist.length === 1, 'Real DB requestAmcRenewal recorded exactly 1 RENEWAL_REQUESTED history entry');

    const [histReqCheck] = await pool.query('SELECT request_number FROM amc_requests WHERE id = ?', [histReqRes.insertId]);
    const [legCtrCheck] = await pool.query('SELECT contract_number FROM amc_contracts WHERE id = ?', [legacyContractId]);
    check(
      histReqCheck[0].request_number === legacyReqNum && legCtrCheck[0].contract_number === legacyContractNumber,
      'Historical AMC-RNW request and contract numbers remain completely unchanged'
    );

    // 3. Real MariaDB ER_DUP_ENTRY collision on createAmcContract -> rolls back attempt 1, advances to -002
    const realGetConnection = pool.getConnection.bind(pool);
    let injectFirstInsertCollision = true;
    let firstAllocatedByRace = null;
    pool.getConnection = async () => {
      const conn = await realGetConnection();
      const realQuery = conn.query.bind(conn);
      conn.query = async (sql, params) => {
        if (injectFirstInsertCollision && typeof sql === 'string' && sql.includes('INSERT INTO amc_contracts')) {
          injectFirstInsertCollision = false;
          firstAllocatedByRace = params[0];
          // Competing connection commits the colliding contract_number right before this TX's INSERT
          const [compIns] = await pool.query(`
            INSERT INTO amc_contracts (
              contract_number, company_id, contract_type, plan_name, device_capacity,
              price, total_amount, status, approval_status, payment_status
            ) VALUES (?, ?, 'standard', 'Competing Row', 1, 1000, 1000, 'offered', 'pending_approval', 'unpaid')
          `, [firstAllocatedByRace, companyUserId]);
          createdContractIds.push(compIns.insertId);
        }
        return realQuery(sql, params);
      };
      return conn;
    };

    let createdAfterRace;
    try {
      createdAfterRace = await amcService.createAmcContract({
        companyId: companyUserId,
        planName: 'Phase 3 Race Recovery Plan',
        deviceCapacity: 2,
        price: 3000,
        totalAmount: 3540,
        startDate: '2026-11-01',
        endDate: '2027-10-31'
      });
    } finally {
      pool.getConnection = realGetConnection;
    }

    createdContractIds.push(createdAfterRace.id);
    check(
      firstAllocatedByRace === `AMC-${compCode}-001` &&
      createdAfterRace.contractNumber === `AMC-${compCode}-002`,
      `Real MariaDB ER_DUP_ENTRY rolled back ${firstAllocatedByRace} and committed ${createdAfterRace.contractNumber}`
    );

    const [c1Hist] = await pool.query(
      'SELECT action FROM amc_contract_history WHERE contract_id = ?',
      [createdAfterRace.id]
    );
    check(c1Hist.length === 1 && c1Hist[0].action === 'CONTRACT_CREATED', 'Committed retry contract has exactly 1 CONTRACT_CREATED history row');

    // 4. Real MariaDB ER_DUP_ENTRY collision on createAmcRenewalContract -> rolls back attempt 1 (-003), commits -004, single notification
    let injectRenewalCollision = true;
    let renewalCollidedNum = null;
    pool.getConnection = async () => {
      const conn = await realGetConnection();
      const realQuery = conn.query.bind(conn);
      conn.query = async (sql, params) => {
        if (injectRenewalCollision && typeof sql === 'string' && sql.includes('INSERT INTO amc_contracts')) {
          injectRenewalCollision = false;
          renewalCollidedNum = params[0];
          const [compIns] = await pool.query(`
            INSERT INTO amc_contracts (
              contract_number, company_id, contract_type, plan_name, device_capacity,
              price, total_amount, status, approval_status, payment_status
            ) VALUES (?, ?, 'renewal', 'Competing Renewal Row', 1, 1000, 1000, 'offered', 'pending_approval', 'unpaid')
          `, [renewalCollidedNum, companyUserId]);
          createdContractIds.push(compIns.insertId);
        }
        return realQuery(sql, params);
      };
      return conn;
    };

    let renewalAfterRace;
    try {
      renewalAfterRace = await amcService.createAmcRenewalContract({
        previousContractId: legacyContractId,
        deviceCapacity: 4,
        price: 6000,
        totalAmount: 7080
      });
    } finally {
      pool.getConnection = realGetConnection;
    }

    createdContractIds.push(renewalAfterRace.id);
    check(
      renewalCollidedNum === `AMC-${compCode}-003` &&
      renewalAfterRace.contractNumber === `AMC-${compCode}-004`,
      `Real DB createAmcRenewalContract rolled back ${renewalCollidedNum} and committed ${renewalAfterRace.contractNumber}`
    );

    const [rnwNotifs] = await pool.query(
      'SELECT id, title FROM notifications WHERE user_id = ? AND title LIKE ?',
      [companyUserId, `%${renewalAfterRace.contractNumber}%`]
    );
    const [collidedNotifs] = await pool.query(
      'SELECT id FROM notifications WHERE user_id = ? AND title LIKE ?',
      [companyUserId, `%${renewalCollidedNum}%`]
    );
    check(
      rnwNotifs.length === 1 && collidedNotifs.length === 0,
      'Real DB renewal sent exactly 1 notification for committed number and 0 for collided attempt'
    );

    const [rnwPrevHist] = await pool.query(
      "SELECT action, details FROM amc_contract_history WHERE contract_id = ? AND action = 'RENEWAL_OFFER_ISSUED'",
      [legacyContractId]
    );
    check(rnwPrevHist.length === 1, 'Previous contract has exactly 1 RENEWAL_OFFER_ISSUED history entry (attempt 1 rolled back cleanly)');

    // 5. Real DB FK failure fails fast on attempt 1 without consuming 5 sequence numbers
    let fkFailed = false;
    try {
      await amcService.createAmcContract({
        companyId: companyUserId,
        requestId: 999999999,
        planName: 'Invalid FK Plan',
        deviceCapacity: 1,
        price: 1000,
        totalAmount: 1000
      });
    } catch (err) {
      fkFailed = err.code === 'ER_NO_REFERENCED_ROW_2' || err.errno === 1452;
    }
    const [[seqAfterFk]] = await pool.query('SELECT current_val FROM app_sequences WHERE sequence_name = ?', [seqName]);
    check(fkFailed && Number(seqAfterFk.current_val) === 5, `Real DB FK failure failed on attempt 1 (sequence advanced once to ${seqAfterFk.current_val}, not 5x)`);
  } finally {
    try {
      if (createdContractIds.length > 0) {
        await pool.query('DELETE FROM amc_covered_devices WHERE contract_id IN (?)', [createdContractIds]);
        await pool.query('DELETE FROM amc_contract_history WHERE contract_id IN (?)', [createdContractIds]);
        await pool.query('DELETE FROM amc_contracts WHERE id IN (?)', [createdContractIds]);
      }
      if (createdRequestIds.length > 0) {
        await pool.query('DELETE FROM amc_requests WHERE id IN (?)', [createdRequestIds]);
      }
      if (createdUserIds.length > 0) {
        await pool.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds]);
        await pool.query('DELETE FROM company_profiles WHERE user_id IN (?)', [createdUserIds]);
        await pool.query('DELETE FROM users WHERE id IN (?)', [createdUserIds]);
      }
      await pool.query('DELETE FROM notifications WHERE title LIKE ?', [`%${legacyContractNumber}%`]);
      await pool.query('DELETE FROM app_sequences WHERE sequence_name = ?', [seqName]);
    } catch (cleanupErr) {
      console.error('Fixture cleanup warning:', cleanupErr.message);
    }
  }
}

(async () => {
  console.log('===================================================================');
  console.log('TEST SUITE: Phase 3 — Retry Safety & REQ-RNW Renewal Numbering');
  console.log('===================================================================');

  await runMockedContractRetryTests();
  await runMockedRenewalRequestTests();
  await runRealDbIntegrationTests();

  console.log('\n===================================================================');
  console.log(`PHASE 3 RETRY & RENEWAL SUMMARY: Passed: ${passed} | Failed: ${failed}`);
  console.log('===================================================================');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
})().catch(async (err) => {
  console.error('Fatal Test Error:', err);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
