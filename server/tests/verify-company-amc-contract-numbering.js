/**
 * Verification Suite: Phase 2 — Company-wise Sequential AMC Contract Numbering
 *
 * Covers all 12 Phase 2 requirements against isolated dev fixtures and mocked pool failure paths:
 *  1. First contract allocation for a company (AMC-<COMPANY_CODE>-001)
 *  2. Sequential allocations for the same company (including shared sequence for renewals, no R1 suffix)
 *  3. Independent sequences for two companies
 *  4. Reconciliation against existing contract numbers (ignoring legacy AMC-CTR-/AMC-RNW- and suffixed rows)
 *  5. Preservation of existing historical contract numbers
 *  6. Concurrent allocations for the same company (zero collisions, strictly unique consecutive numbers)
 *  7. Bounded collision handling (skips pre-existing colliding contract_number)
 *  8. No sequence reuse after failed or rolled-back contract creation
 *  9. Database allocation error and Company ID conflict propagation (no synthetic fallback)
 * 10. Checked-out connection release on both success and failure paths
 * 11. Compatibility with createAmcContract, createAmcRenewalContract, certificates & verification
 * 12. Unchanged repair ticket numbering (CMP-XXX-001 / TD-AMC-CXXX-01)
 */

const assert = require('assert');
const { pool } = require('../config/db.config');
const helpers = require('../utils/helpers');
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

async function runMockedConnectionAndErrorTests() {
  console.log('[Mocked Unit Checks] Error Propagation & Connection Release Safety');

  // Test A: Connection released on success + single connection checkout (no nested getConnection)
  {
    let getConnCount = 0;
    let releaseCount = 0;
    const fakeConn = {
      async beginTransaction() {},
      async commit() {},
      async rollback() {},
      async query(sql) {
        const s = sql.replace(/\s+/g, ' ').trim();
        if (s.includes('FROM users u') && s.includes('FOR UPDATE')) {
          return [[{ id: 501, role: 'company', user_company_id: 'CMP-MOCK-1', profile_id: 91, profile_company_id: 'CMP-MOCK-1' }]];
        }
        if (s.startsWith('SELECT contract_number FROM amc_contracts')) {
          return [[]];
        }
        if (s.startsWith('INSERT IGNORE INTO app_sequences')) {
          return [{ affectedRows: 1 }];
        }
        if (s.startsWith('UPDATE app_sequences')) {
          return [{ affectedRows: 1 }];
        }
        if (s.startsWith('SELECT LAST_INSERT_ID()')) {
          return [[{ nextVal: 1 }]];
        }
        if (s.startsWith('SELECT id FROM amc_contracts WHERE contract_number')) {
          return [[]];
        }
        return [[]];
      },
      release() {
        releaseCount++;
      }
    };
    const fakePool = {
      async getConnection() {
        getConnCount++;
        if (getConnCount > 1) {
          throw new Error('Nested getConnection() detected!');
        }
        return fakeConn;
      }
    };

    const allocated = await helpers.allocateNextCompanyAmcContractNumber(fakePool, 501);
    check(allocated === 'AMC-CMP-MOCK-1-001', `Mocked single-connection allocation returned ${allocated}`);
    check(getConnCount === 1 && releaseCount === 1, 'Checked out exactly 1 connection and released it on success');
  }

  // Test B: Database error (ER_LOCK_DEADLOCK) propagates and releases connection
  {
    let getConnCount = 0;
    let releaseCount = 0;
    const fakeConn = {
      async beginTransaction() {},
      async commit() {},
      async rollback() {},
      async query(sql) {
        const s = sql.replace(/\s+/g, ' ').trim();
        if (s.includes('FROM users u') && s.includes('FOR UPDATE')) {
          return [[{ id: 502, role: 'company', user_company_id: 'CMP-MOCK-2', profile_id: 92, profile_company_id: 'CMP-MOCK-2' }]];
        }
        if (s.startsWith('SELECT contract_number FROM amc_contracts')) {
          return [[]];
        }
        if (s.startsWith('INSERT IGNORE INTO app_sequences')) {
          return [{ affectedRows: 1 }];
        }
        if (s.startsWith('UPDATE app_sequences')) {
          const err = new Error('Deadlock found when trying to get lock');
          err.code = 'ER_LOCK_DEADLOCK';
          throw err;
        }
        return [[]];
      },
      release() {
        releaseCount++;
      }
    };
    const fakePool = {
      async getConnection() {
        getConnCount++;
        return fakeConn;
      }
    };

    let caughtErr = null;
    try {
      await helpers.allocateNextCompanyAmcContractNumber(fakePool, 502);
    } catch (e) {
      caughtErr = e;
    }
    check(caughtErr && caughtErr.code === 'ER_LOCK_DEADLOCK', 'Unexpected DB error (ER_LOCK_DEADLOCK) propagated cleanly');
    check(getConnCount === 1 && releaseCount === 1, 'Checked-out connection released cleanly on DB failure');
  }

  // Test C: COMPANY_ID_CONFLICT fails explicitly without synthetic fallback and releases connection
  {
    let releaseCount = 0;
    const fakeConn = {
      async beginTransaction() {},
      async commit() {},
      async rollback() {},
      async query(sql) {
        const s = sql.replace(/\s+/g, ' ').trim();
        if (s.includes('FROM users u') && s.includes('FOR UPDATE')) {
          return [[{ id: 503, role: 'company', user_company_id: 'CMP-A', profile_id: 93, profile_company_id: 'CMP-B' }]];
        }
        return [[]];
      },
      release() {
        releaseCount++;
      }
    };
    const fakePool = {
      async getConnection() {
        return fakeConn;
      }
    };

    let conflictErr = null;
    try {
      await helpers.allocateNextCompanyAmcContractNumber(fakePool, 503);
    } catch (e) {
      conflictErr = e;
    }
    check(conflictErr && conflictErr.code === 'COMPANY_ID_CONFLICT', 'COMPANY_ID_CONFLICT failed explicitly without synthetic fallback');
    check(releaseCount === 1, 'Checked-out connection released cleanly on COMPANY_ID_CONFLICT');
  }

  // Test D: Bounded collision limit exceeded throws explicit error and releases connection
  {
    let releaseCount = 0;
    let seqCounter = 0;
    const fakeConn = {
      async beginTransaction() {},
      async commit() {},
      async rollback() {},
      async query(sql) {
        const s = sql.replace(/\s+/g, ' ').trim();
        if (s.includes('FROM users u') && s.includes('FOR UPDATE')) {
          return [[{ id: 504, role: 'company', user_company_id: 'CMP-MOCK-4', profile_id: null, profile_company_id: null }]];
        }
        if (s.startsWith('SELECT contract_number FROM amc_contracts')) {
          return [[]];
        }
        if (s.startsWith('INSERT IGNORE INTO app_sequences')) {
          return [{ affectedRows: 1 }];
        }
        if (s.startsWith('UPDATE app_sequences')) {
          seqCounter++;
          return [{ affectedRows: 1 }];
        }
        if (s.startsWith('SELECT LAST_INSERT_ID()')) {
          return [[{ nextVal: seqCounter, advancedVal: seqCounter }]];
        }
        if (s.startsWith('SELECT id FROM amc_contracts WHERE contract_number')) {
          return [[{ id: 999 }]]; // Always collide
        }
        return [[]];
      },
      release() {
        releaseCount++;
      }
    };
    const fakePool = {
      async getConnection() {
        return fakeConn;
      }
    };

    let limitErr = null;
    try {
      await helpers.allocateNextCompanyAmcContractNumber(fakePool, 504);
    } catch (e) {
      limitErr = e;
    }
    check(limitErr && limitErr.code === 'CONTRACT_NUMBER_ALLOCATION_FAILED', 'Exhausted collision retries fail explicitly with CONTRACT_NUMBER_ALLOCATION_FAILED');
    check(releaseCount === 1, 'Checked-out connection released cleanly after collision retry exhaustion');
  }
}

async function runDbIntegrationTests() {
  console.log('\n[DB Integration Checks] Company-wise AMC Contract Numbering');

  const suffix = Date.now().toString().slice(-6);
  const codeA = `CMP-P2A-${suffix}`;
  const codeB = `CMP-P2B-${suffix}`;
  const codeC = `CMP-P2C-${suffix}`;

  const createdUserIds = [];
  const createdContractIds = [];
  const createdSeqNames = [
    `amc_contract_${codeA}`,
    `amc_contract_${codeB}`,
    `amc_contract_${codeC}`,
    `tkt:${codeA}`,
    `tkt:TD-AMC-C${codeA.slice(4)}`
  ];

  try {
    // Provision 3 isolated test companies
    const provisionCompany = async (code, idx) => {
      const [uRes] = await pool.query(
        'INSERT INTO users (name, email, password, role, company_id, is_active) VALUES (?, ?, ?, "company", ?, 1)',
        [`Test Phase2 Co ${idx}`, `p2_seq_${idx}_${suffix}@tekdoctor.in`, 'hash123', code]
      );
      const uId = uRes.insertId;
      createdUserIds.push(uId);
      await pool.query(
        'INSERT INTO company_profiles (user_id, company_id, company_name) VALUES (?, ?, ?)',
        [uId, code, `Test Phase2 Co ${idx}`]
      );
      return uId;
    };

    const compAId = await provisionCompany(codeA, 'A');
    const compBId = await provisionCompany(codeB, 'B');
    const compCId = await provisionCompany(codeC, 'C');

    // 1. First contract allocation for Company A
    const cA1 = await amcService.createAmcContract({
      companyId: compAId,
      planName: 'Phase 2 Gold',
      deviceCapacity: 5,
      price: 10000,
      totalAmount: 11800,
      startDate: '2026-11-01',
      endDate: '2027-10-31'
    });
    createdContractIds.push(cA1.id);
    check(cA1.contractNumber === `AMC-${codeA}-001`, `1. First contract for Company A is ${cA1.contractNumber}`);

    // 2. Sequential allocation for same company + renewal shares same sequence (no R1 suffix)
    const cA2 = await amcService.createAmcContract({
      companyId: compAId,
      planName: 'Phase 2 Platinum',
      deviceCapacity: 10,
      price: 20000,
      totalAmount: 23600,
      startDate: '2026-11-01',
      endDate: '2027-10-31'
    });
    createdContractIds.push(cA2.id);
    check(cA2.contractNumber === `AMC-${codeA}-002`, `2a. Second contract for Company A is ${cA2.contractNumber}`);

    const rA3 = await amcService.createAmcRenewalContract({
      previousContractId: cA1.id,
      price: 12000,
      totalAmount: 14160
    });
    createdContractIds.push(rA3.id);
    check(rA3.contractNumber === `AMC-${codeA}-003`, `2b. Renewal contract shares sequence with no R1 suffix: ${rA3.contractNumber}`);

    // 3. Independent sequence for Company B
    const cB1 = await amcService.createAmcContract({
      companyId: compBId,
      planName: 'Phase 2 Silver',
      deviceCapacity: 3,
      price: 6000,
      totalAmount: 7080
    });
    createdContractIds.push(cB1.id);
    check(cB1.contractNumber === `AMC-${codeB}-001`, `3. Company B starts independently at ${cB1.contractNumber}`);

    // 4 & 5. Reconciliation against existing contract numbers + historical preservation
    const legacyCtr = `AMC-CTR-LEGACY-${suffix}-101`;
    const legacyRnw = `AMC-RNW-LEGACY-${suffix}-999`;
    const manualSeq5 = `AMC-${codeC}-005`;
    const suffixedRow = `AMC-${codeC}-999-R1`;

    for (const num of [legacyCtr, legacyRnw, manualSeq5, suffixedRow]) {
      const [ins] = await pool.query(
        `INSERT INTO amc_contracts (
           contract_number, company_id, plan_name, device_capacity, price, total_amount, status, approval_status, payment_status
         ) VALUES (?, ?, 'Historical Plan', 2, 5000, 5900, 'active', 'approved', 'paid')`,
        [num, compCId]
      );
      createdContractIds.push(ins.insertId);
    }

    // Seed a stale sequence value lower than existing max suffix 5
    await pool.query(
      'INSERT INTO app_sequences (sequence_name, current_val) VALUES (?, 1)',
      [`amc_contract_${codeC}`]
    );

    const cC6 = await amcService.createAmcContract({
      companyId: compCId,
      planName: 'Post Reconciliation Plan',
      deviceCapacity: 4,
      price: 8000,
      totalAmount: 9440
    });
    createdContractIds.push(cC6.id);
    check(cC6.contractNumber === `AMC-${codeC}-006`, `4. Reconciled past stale sequence (1) and existing -005 while ignoring legacy/-R1 -> ${cC6.contractNumber}`);

    const [legacyCheck] = await pool.query(
      'SELECT contract_number FROM amc_contracts WHERE company_id = ? AND contract_number IN (?, ?)',
      [compCId, legacyCtr, legacyRnw]
    );
    check(legacyCheck.length === 2, '5. Existing historical contract numbers remain completely unchanged');

    // 6. Concurrent allocations for the same company
    const parallelAllocated = await Promise.all(
      Array.from({ length: 6 }, () => helpers.allocateNextCompanyAmcContractNumber(pool, compAId))
    );
    const uniqueAllocated = new Set(parallelAllocated);
    const expectedConcurrent = [4, 5, 6, 7, 8, 9].map((n) => `AMC-${codeA}-${String(n).padStart(3, '0')}`);
    const sortedAllocated = [...parallelAllocated].sort();
    check(
      uniqueAllocated.size === 6 && JSON.stringify(sortedAllocated) === JSON.stringify(expectedConcurrent),
      `6. Concurrent allocations produced 6 distinct consecutive numbers: [${sortedAllocated.join(', ')}]`
    );

    // 7. Collision handling: pre-insert AMC-<codeA>-010 under compBId so compA's maxExisting stays < 10
    //    and app_sequences must catch and skip the UNIQUE collision inside the collision loop
    const preExisting010 = `AMC-${codeA}-010`;
    const [colIns] = await pool.query(
      `INSERT INTO amc_contracts (
         contract_number, company_id, plan_name, device_capacity, price, total_amount, status, approval_status, payment_status
       ) VALUES (?, ?, 'Manual Collision Row', 1, 1000, 1180, 'offered', 'pending_approval', 'unpaid')`,
      [preExisting010, compBId]
    );
    createdContractIds.push(colIns.insertId);
    await pool.query('UPDATE app_sequences SET current_val = 9 WHERE sequence_name = ?', [`amc_contract_${codeA}`]);

    const afterCollision = await helpers.allocateNextCompanyAmcContractNumber(pool, compAId);
    check(afterCollision === `AMC-${codeA}-011`, `7. Collision handling skipped colliding ${preExisting010} -> ${afterCollision}`);

    // 8. No sequence reuse after failed/rolled-back contract creation
    // Pass non-existent requestId = 999999999 so FK fails UPDATE/INSERT inside createAmcContract transaction
    let createFailed = false;
    try {
      await amcService.createAmcContract({
        companyId: compAId,
        requestId: 999999999,
        planName: 'Should Rollback',
        deviceCapacity: 1,
        price: 1000,
        totalAmount: 1180
      });
    } catch (_) {
      createFailed = true;
    }
    check(createFailed, '8a. Failed contract creation with invalid FK rolled back and threw');

    const afterRollback = await amcService.createAmcContract({
      companyId: compAId,
      planName: 'Post Failure Contract',
      deviceCapacity: 2,
      price: 4000,
      totalAmount: 4720,
      startDate: '2026-11-01',
      endDate: '2027-10-31'
    });
    createdContractIds.push(afterRollback.id);
    check(
      afterRollback.contractNumber === `AMC-${codeA}-013`,
      `8b. Consumed number -012 was NOT reused after rollback; allocated ${afterRollback.contractNumber}`
    );

    // 11. Compatibility with existing workflows & certificates
    await pool.query(
      "UPDATE amc_contracts SET status = 'active', approval_status = 'approved', payment_status = 'paid' WHERE id = ?",
      [afterRollback.id]
    );
    const details = await amcService.getContractDetails(afterRollback.id, compAId);
    check(details && details.contract_number === afterRollback.contractNumber, '11a. getContractDetails works with new contract number');

    const cert = await amcService.getContractCertificateData(afterRollback.id, { id: compAId, role: 'company' });
    check(
      cert && cert.contract.contractNumber === afterRollback.contractNumber && cert.verificationCode.length === 16,
      `11b. Certificate & HMAC generated cleanly (cert: ${cert.certificateNumber}, hmac: ${cert.verificationCode})`
    );
    const verified = await amcService.verifyCertificateAuthenticity(cert.contract, cert.verificationCode);
    check(verified.valid === true, '11c. verifyCertificateAuthenticity validates new contract number');

    const publicVerify = await amcService.getPublicCertificateVerification(cert.verificationCode, cert.contract.contractNumber);
    check(publicVerify.valid === true && publicVerify.contractNumber === afterRollback.contractNumber, '11d. Public verification matches new contract number');

    // 12. Repair ticket numbering remains unchanged
    const stdTicket = await helpers.generateTicketNumber(pool, { companyId: compAId, isAmc: false });
    const amcTicket = await helpers.generateTicketNumber(pool, { companyId: compAId, isAmc: true });
    check(
      stdTicket === `${codeA}-001` && amcTicket === `TD-AMC-C${codeA.slice(4)}-01`,
      `12. Ticket numbering unchanged (standard: ${stdTicket}, AMC: ${amcTicket})`
    );
  } finally {
    // Cleanup isolated fixtures
    try {
      if (createdContractIds.length > 0) {
        await pool.query('DELETE FROM amc_covered_devices WHERE contract_id IN (?)', [createdContractIds]);
        await pool.query('DELETE FROM amc_contract_history WHERE contract_id IN (?)', [createdContractIds]);
        await pool.query('DELETE FROM amc_contracts WHERE id IN (?)', [createdContractIds]);
      }
      if (createdUserIds.length > 0) {
        await pool.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds]);
        await pool.query('DELETE FROM company_profiles WHERE user_id IN (?)', [createdUserIds]);
        await pool.query('DELETE FROM users WHERE id IN (?)', [createdUserIds]);
      }
      await pool.query('DELETE FROM app_sequences WHERE sequence_name IN (?)', [createdSeqNames]);
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr.message);
    }
  }
}

(async () => {
  console.log('===================================================================');
  console.log('TEST SUITE: Phase 2 — Company-wise Sequential AMC Contract Numbering');
  console.log('===================================================================\n');

  await runMockedConnectionAndErrorTests();
  await runDbIntegrationTests();

  console.log('\n===================================================================');
  console.log(`PHASE 2 CONTRACT NUMBERING SUMMARY: Passed: ${passed} | Failed: ${failed}`);
  console.log('===================================================================');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
})().catch(async (err) => {
  console.error('Fatal Test Error:', err);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
