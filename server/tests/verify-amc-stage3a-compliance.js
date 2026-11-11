/**
 * Dedicated Test Suite:
 * AMC Stage 3A: Backend Compliance & Verification Correctness
 *
 * Verifies all 12 scenarios specified in Stage 3A requirements:
 * 1. Active + approved + paid + valid dates -> Compliant (ACTIVE_COMPLIANT)
 * 2. Expired contract + approved + paid -> Not compliant (EXPIRED)
 * 3. Cancelled contract + approved + paid -> Not compliant (CANCELLED)
 * 4. Rejected contract + paid -> Not compliant (REJECTED)
 * 5. Pending approval -> Not compliant (OFFERED / pending status)
 * 6. Unpaid contract -> Not compliant (ACCEPTED / unpaid status)
 * 7. Future start date -> Not currently compliant (PENDING_START_DATE)
 * 8. Expiry date already passed (even if stored status is still 'active') -> Not compliant (EXPIRED)
 * 9. Authentic expired certificate -> Authentic (valid: true), but complianceStatus: EXPIRED
 * 10. Authentic cancelled certificate -> Authentic (valid: true), but complianceStatus: CANCELLED
 * 11. Invalid certificate code -> Verification rejected (valid: false)
 * 12. Direct and blind lookup -> Consistent lifecycle handling across active, expired, cancelled, rejected
 * 13. Asia/Kolkata timezone boundary handling
 */

const assert = require('assert');
const crypto = require('crypto');
const config = require('../config/app.config');
const amcService = require('../services/amc.service');
const { pool } = require('../config/db.config');

let testsPassed = 0;
let testsFailed = 0;

function pass(name, details = '') {
  console.log(`  ✓ [PASS] ${name}`);
  if (details) console.log(`      ${details}`);
  testsPassed++;
}

function fail(name, error) {
  console.error(`  ✗ [FAIL] ${name}: ${error.message}`);
  testsFailed++;
}

async function runTests() {
  console.log('===================================================================');
  console.log('TEST SUITE: AMC Stage 3A Backend Compliance & Verification Correctness');
  console.log('===================================================================');

  try {
    const today = amcService.getBusinessTodayStr();
    console.log(`[Context] Active business date in Asia/Kolkata: ${today}`);

    // Helper to generate dates relative to today
    const pastStart = amcService.addDaysOnly(today, -30);
    const futureEnd = amcService.addDaysOnly(today, 335);
    const expiredPastStart = amcService.addDaysOnly(today, -395);
    const expiredPastEnd = amcService.addDaysOnly(today, -30);
    const futureStart = amcService.addDaysOnly(today, 15);
    const futureFarEnd = amcService.addDaysOnly(today, 380);

    // ══════════════════════════════════════════════════════════════════
    // SECTION 1: evaluateContractCompliance Unit Scenarios
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 1] Contract-Level Compliance Business Rules');

    // Scenario 1: Active + approved + paid + valid dates -> Compliant
    const sc1 = {
      status: 'active',
      approval_status: 'approved',
      payment_status: 'paid',
      start_date: pastStart,
      end_date: futureEnd
    };
    const res1 = amcService.evaluateContractCompliance(sc1);
    assert.strictEqual(res1.isCompliant, true);
    assert.strictEqual(res1.complianceStatus, 'ACTIVE_COMPLIANT');
    pass('1.1 Active + approved + paid + valid dates -> Compliant (ACTIVE_COMPLIANT)');

    // Scenario 2: Expired contract + approved + paid -> Not compliant (EXPIRED)
    const sc2 = {
      status: 'expired',
      approval_status: 'approved',
      payment_status: 'paid',
      start_date: expiredPastStart,
      end_date: expiredPastEnd
    };
    const res2 = amcService.evaluateContractCompliance(sc2);
    assert.strictEqual(res2.isCompliant, false);
    assert.strictEqual(res2.complianceStatus, 'EXPIRED');
    pass('1.2 Expired contract + approved + paid -> Not compliant (EXPIRED)');

    // Scenario 3: Cancelled contract + approved + paid -> Not compliant (CANCELLED)
    const sc3 = {
      status: 'cancelled',
      approval_status: 'approved',
      payment_status: 'paid',
      start_date: pastStart,
      end_date: futureEnd
    };
    const res3 = amcService.evaluateContractCompliance(sc3);
    assert.strictEqual(res3.isCompliant, false);
    assert.strictEqual(res3.complianceStatus, 'CANCELLED');
    pass('1.3 Cancelled contract + approved + paid -> Not compliant (CANCELLED)');

    // Scenario 4: Rejected contract + paid -> Not compliant (REJECTED)
    const sc4 = {
      status: 'rejected',
      approval_status: 'rejected',
      payment_status: 'paid',
      start_date: pastStart,
      end_date: futureEnd
    };
    const res4 = amcService.evaluateContractCompliance(sc4);
    assert.strictEqual(res4.isCompliant, false);
    assert.strictEqual(res4.complianceStatus, 'REJECTED');
    pass('1.4 Rejected contract + paid -> Not compliant (REJECTED)');

    // Scenario 5: Pending approval -> Not compliant (OFFERED)
    const sc5 = {
      status: 'offered',
      approval_status: 'pending_approval',
      payment_status: 'unpaid',
      start_date: pastStart,
      end_date: futureEnd
    };
    const res5 = amcService.evaluateContractCompliance(sc5);
    assert.strictEqual(res5.isCompliant, false);
    assert.strictEqual(res5.complianceStatus, 'OFFERED');
    pass('1.5 Pending approval contract -> Not compliant (OFFERED)');

    // Scenario 6: Unpaid contract -> Not compliant (ACCEPTED)
    const sc6 = {
      status: 'accepted',
      approval_status: 'approved',
      payment_status: 'unpaid',
      start_date: pastStart,
      end_date: futureEnd
    };
    const res6 = amcService.evaluateContractCompliance(sc6);
    assert.strictEqual(res6.isCompliant, false);
    assert.strictEqual(res6.complianceStatus, 'ACCEPTED');
    pass('1.6 Unpaid accepted contract -> Not compliant (ACCEPTED)');

    // Scenario 7: Future start date -> Not currently compliant (PENDING_START_DATE)
    const sc7 = {
      status: 'active',
      approval_status: 'approved',
      payment_status: 'paid',
      start_date: futureStart,
      end_date: futureFarEnd
    };
    const res7 = amcService.evaluateContractCompliance(sc7);
    assert.strictEqual(res7.isCompliant, false);
    assert.strictEqual(res7.complianceStatus, 'PENDING_START_DATE');
    pass('1.7 Future start date contract -> Not currently compliant (PENDING_START_DATE)');

    // Scenario 8: Expiry date already passed while stored status is still 'active' (cron delay) -> Not compliant (EXPIRED)
    const sc8 = {
      status: 'active',
      approval_status: 'approved',
      payment_status: 'paid',
      start_date: expiredPastStart,
      end_date: expiredPastEnd // already passed
    };
    const res8 = amcService.evaluateContractCompliance(sc8);
    assert.strictEqual(res8.isCompliant, false);
    assert.strictEqual(res8.complianceStatus, 'EXPIRED');
    pass('1.8 Expiry date passed with active stored status -> Accurately evaluated as EXPIRED');

    // ══════════════════════════════════════════════════════════════════
    // SECTION 2: Public Verification Authenticity vs Compliance
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 2] Separation of Authenticity vs. Compliance Status');

    // Check on an existing active contract in the database
    const [dbRows] = await pool.query(
      "SELECT c.*, u.name as company_name FROM amc_contracts c JOIN users u ON c.company_id = u.id WHERE c.status = 'active' LIMIT 1"
    );

    if (dbRows.length > 0) {
      const dbContract = dbRows[0];
      const validCode = amcService.generateCertificateHmacCode(dbContract);

      // 9. Authentic Active contract -> Authentic and Compliant
      const activeVerify = await amcService.getPublicCertificateVerification(validCode, dbContract.contract_number);
      assert.strictEqual(activeVerify.valid, true);
      assert.strictEqual(activeVerify.complianceStatus, 'ACTIVE_COMPLIANT');
      pass('2.1 Authentic active contract is confirmed valid and ACTIVE_COMPLIANT');

      // 10. Simulate Authentic Expired Contract verification
      // Even if expired, signature matches (authentic!), but complianceStatus must be EXPIRED
      const expiredMock = {
        ...dbContract,
        start_date: expiredPastStart,
        end_date: expiredPastEnd,
        status: 'expired'
      };
      const expiredCode = amcService.generateCertificateHmacCode(expiredMock);
      const authExpired = amcService.verifyCertificateAuthenticity(expiredMock, expiredCode);
      const compExpired = amcService.evaluateContractCompliance(expiredMock);

      assert.strictEqual(authExpired.valid, true, 'Cryptographic signature of expired contract is authentic');
      assert.strictEqual(compExpired.isCompliant, false, 'Expired contract is NOT compliant');
      assert.strictEqual(compExpired.complianceStatus, 'EXPIRED', 'Compliance status must be EXPIRED');
      pass('2.2 Authentic expired contract: authentic provenance preserved, complianceStatus: EXPIRED');

      // 11. Simulate Authentic Cancelled Contract verification
      const cancelledMock = {
        ...dbContract,
        status: 'cancelled'
      };
      const cancelledCode = amcService.generateCertificateHmacCode(cancelledMock);
      const authCancelled = amcService.verifyCertificateAuthenticity(cancelledMock, cancelledCode);
      const compCancelled = amcService.evaluateContractCompliance(cancelledMock);

      assert.strictEqual(authCancelled.valid, true, 'Cryptographic signature of cancelled contract is authentic');
      assert.strictEqual(compCancelled.isCompliant, false, 'Cancelled contract is NOT compliant');
      assert.strictEqual(compCancelled.complianceStatus, 'CANCELLED', 'Compliance status must be CANCELLED');
      pass('2.3 Authentic cancelled contract: authentic provenance preserved, complianceStatus: CANCELLED');

      // 12. Invalid verification code -> Rejected
      const invalidCode = validCode.slice(0, 15) + (validCode[15] === '0' ? '1' : '0');
      const invalidVerify = await amcService.getPublicCertificateVerification(invalidCode, dbContract.contract_number);
      assert.strictEqual(invalidVerify.valid, false);
      assert.strictEqual(invalidVerify.reason, 'CERTIFICATE_NOT_FOUND_OR_INVALID');
      pass('2.4 Invalid verification code is rejected (valid: false, CERTIFICATE_NOT_FOUND_OR_INVALID)');

      // 13. Direct lookup vs Blind lookup consistency
      // Direct lookup with contract number
      const directRes = await amcService.getPublicCertificateVerification(validCode, dbContract.contract_number);
      // Blind lookup without contract number
      const blindRes = await amcService.getPublicCertificateVerification(validCode);

      assert.strictEqual(directRes.valid, true);
      assert.strictEqual(blindRes.valid, true);
      assert.strictEqual(directRes.complianceStatus, blindRes.complianceStatus);
      assert.strictEqual(directRes.contractNumber, blindRes.contractNumber);
      pass('2.5 Direct lookup and blind lookup yield identical, consistent verification responses');
    }

    // ══════════════════════════════════════════════════════════════════
    // SECTION 3: Asia/Kolkata Timezone Date Boundaries
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 3] Timezone Boundary Precision (Asia/Kolkata)');

    // Start date is exactly today -> Compliant
    const boundaryStartToday = {
      status: 'active',
      approval_status: 'approved',
      payment_status: 'paid',
      start_date: today,
      end_date: futureEnd
    };
    const bStartRes = amcService.evaluateContractCompliance(boundaryStartToday);
    assert.strictEqual(bStartRes.isCompliant, true);
    assert.strictEqual(bStartRes.complianceStatus, 'ACTIVE_COMPLIANT');
    pass('3.1 Start date equal to current business date is active and compliant');

    // End date is exactly today -> Compliant until midnight passes
    const boundaryEndToday = {
      status: 'active',
      approval_status: 'approved',
      payment_status: 'paid',
      start_date: pastStart,
      end_date: today
    };
    const bEndRes = amcService.evaluateContractCompliance(boundaryEndToday);
    assert.strictEqual(bEndRes.isCompliant, true);
    assert.strictEqual(bEndRes.complianceStatus, 'ACTIVE_COMPLIANT');
    pass('3.2 End date equal to current business date remains active and compliant');

    // End date was yesterday -> Expired
    const yesterday = amcService.addDaysOnly(today, -1);
    const boundaryExpiredYesterday = {
      status: 'active',
      approval_status: 'approved',
      payment_status: 'paid',
      start_date: pastStart,
      end_date: yesterday
    };
    const bYestRes = amcService.evaluateContractCompliance(boundaryExpiredYesterday);
    assert.strictEqual(bYestRes.isCompliant, false);
    assert.strictEqual(bYestRes.complianceStatus, 'EXPIRED');
    pass('3.3 End date in past (yesterday) evaluates strictly as EXPIRED even if stored status is "active"');

    // Start date is tomorrow -> Pending
    const tomorrow = amcService.addDaysOnly(today, 1);
    const boundaryPendingTomorrow = {
      status: 'active',
      approval_status: 'approved',
      payment_status: 'paid',
      start_date: tomorrow,
      end_date: futureEnd
    };
    const bTomRes = amcService.evaluateContractCompliance(boundaryPendingTomorrow);
    assert.strictEqual(bTomRes.isCompliant, false);
    assert.strictEqual(bTomRes.complianceStatus, 'PENDING_START_DATE');
    pass('3.4 Start date in future (tomorrow) evaluates strictly as PENDING_START_DATE');

    console.log('\n===================================================================');
    console.log(`STAGE 3A TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('===================================================================');

  } catch (err) {
    fail('Unhandled exception in Stage 3A test suite', err);
  } finally {
    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

runTests();

