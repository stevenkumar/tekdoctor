/**
 * Dedicated Verification Suite:
 * AMC Expiry Reminder Retry Mechanism & Admin Monitoring Hardening
 *
 * Verifies all 10 criteria specified in Stage 2 Implementation requirements:
 * 1. Correct frontend manual-retry endpoint resolution.
 * 2. Manual retry succeeds for an authorized Admin over HTTP.
 * 3. Manual retry rejects unauthorized users (401 / 403).
 * 4. Manual retry dispatches only unsuccessful channels (preserves already succeeded channels).
 * 5. Automated outbox skips cancelled contracts.
 * 6. Automated outbox skips all other non-active contracts (expired, draft, offered, rejected).
 * 7. Manual retry rejects non-active contracts with clear business error.
 * 8. Failed manual retry calculates correct exponential backoff (next_retry_at not NULL).
 * 9. Partial manual retry preserves successful channel status and applies backoff.
 * 10. Retry limit (5 attempts) and terminal behavior (next_retry_at = NULL) remain correct.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const amcService = require('../services/amc.service');
const amcRoutes = require('../routes/amc.routes');

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
  console.log('TEST SUITE: AMC Expiry Reminder Retry & Admin Monitoring Hardening');
  console.log('===================================================================');

  const testSuffix = Math.floor(10000 + Math.random() * 90000);
  const createdUserIds = [];
  const createdContractIds = [];
  const createdReminderIds = [];

  let testServer = null;
  let serverBaseUrl = '';

  try {
    // ══════════════════════════════════════════════════════════════════
    // CRITERION 1: Frontend Manual-Retry Endpoint Inspection
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Criterion 1] Frontend Manual-Retry Endpoint Verification');
    const apiTsContent = fs.readFileSync(
      path.resolve(__dirname, '../../client/src/services/api.ts'),
      'utf8'
    );

    // Verify endpoint constant is defined in ENDPOINTS.AMC
    assert(
      apiTsContent.includes("ADMIN_REMINDER_RETRY: (id: number | string) => `/api/amc/admin/reminders/${id}/retry`"),
      'ENDPOINTS.AMC.ADMIN_REMINDER_RETRY must be properly defined with /api prefix'
    );

    // Verify retryAdminReminder uses the constant
    assert(
      apiTsContent.includes('getUrl(ENDPOINTS.AMC.ADMIN_REMINDER_RETRY(reminderId))'),
      'amcApi.retryAdminReminder must call getUrl with ENDPOINTS.AMC.ADMIN_REMINDER_RETRY'
    );
    pass(
      'Frontend Endpoint Definition',
      'ENDPOINTS.AMC.ADMIN_REMINDER_RETRY correctly resolves to /api/amc/admin/reminders/:id/retry'
    );

    // ══════════════════════════════════════════════════════════════════
    // PROVISION TEST FIXTURES & HTTP TEST SERVER
    // ══════════════════════════════════════════════════════════════════
    // Create an Admin user and a Company user
    const [adminRes] = await pool.query(`
      INSERT INTO users (email, name, password, role, is_active)
      VALUES (?, ?, 'AdminPass123!', 'admin', 1)
    `, [`admin_rem_${testSuffix}@example.com`, `Admin ${testSuffix}`]);
    const adminUserId = adminRes.insertId;
    createdUserIds.push(adminUserId);

    const [compRes] = await pool.query(`
      INSERT INTO users (email, name, password, role, is_active)
      VALUES (?, ?, 'CompPass123!', 'company', 1)
    `, [`comp_rem_${testSuffix}@example.com`, `Company ${testSuffix}`]);
    const companyUserId = compRes.insertId;
    createdUserIds.push(companyUserId);

    await pool.query(`
      INSERT INTO company_profiles (user_id, company_id, company_name)
      VALUES (?, ?, ?)
    `, [companyUserId, `CMP-REM-${testSuffix}`, `Company ${testSuffix}`]);

    // Generate JWT tokens
    const jwtSecret = config.jwt?.secret || 'test-jwt-secret';
    const adminToken = jwt.sign({ id: adminUserId, email: `admin_rem_${testSuffix}@example.com`, role: 'admin' }, jwtSecret, { expiresIn: '1h' });
    const companyToken = jwt.sign({ id: companyUserId, email: `comp_rem_${testSuffix}@example.com`, role: 'company' }, jwtSecret, { expiresIn: '1h' });

    // Start ephemeral test express server mounting amcRoutes
    const app = express();
    app.use(express.json());
    app.use('/api/amc', amcRoutes);

    await new Promise((resolve) => {
      testServer = app.listen(0, '127.0.0.1', () => {
        const port = testServer.address().port;
        serverBaseUrl = `http://127.0.0.1:${port}/api/amc`;
        resolve();
      });
    });

    const todayStr = amcService.getBusinessTodayStr();
    const expiryStr = amcService.addDaysOnly(todayStr, 15);

    // Helper to create contract
    const createTestContract = async (status = 'active', customNum = null) => {
      const cNum = customNum || `AMC-CTR-TEST-${status.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const [cRes] = await pool.query(`
        INSERT INTO amc_contracts (
          contract_number, company_id, plan_id, plan_name, device_capacity,
          price, total_amount, currency, start_date, end_date,
          status, approval_status, payment_status
        ) VALUES (?, ?, 1, 'Standard Fleet Plan', 10, 50000, 59000, 'INR', ?, ?, ?, 'approved', 'paid')
      `, [cNum, companyUserId, amcService.addDaysOnly(todayStr, -350), expiryStr, status]);
      createdContractIds.push(cRes.insertId);
      return { id: cRes.insertId, contractNumber: cNum };
    };

    // Helper to create reminder record
    const createTestReminder = async ({ contractId, status = 'failed', inApp = 'failed', email = 'failed', retryCount = 1, nextRetry = null, milestone = 15 }) => {
      const [rRes] = await pool.query(`
        INSERT INTO amc_expiry_reminders (
          contract_id, company_id, milestone_days, expiry_date,
          delivery_channel, delivery_status, in_app_status, email_status,
          retry_count, next_retry_at, error_message, metadata
        ) VALUES (?, ?, ?, ?, 'both', ?, ?, ?, ?, ?, ?, ?)
      `, [
        contractId, companyUserId, milestone, expiryStr,
        status, inApp, email, retryCount, nextRetry,
        status === 'failed' ? 'Simulated connection timeout' : null,
        JSON.stringify({ testFixture: true })
      ]);
      createdReminderIds.push(rRes.insertId);
      return rRes.insertId;
    };

    // ══════════════════════════════════════════════════════════════════
    // CRITERION 2: Manual Retry Succeeds for Authorized Admin (HTTP)
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Criterion 2] Manual Retry Succeeds for Authorized Admin');
    const activeContract = await createTestContract('active');
    const reminderId1 = await createTestReminder({ contractId: activeContract.id, status: 'failed', retryCount: 1 });

    const httpRes = await fetch(`${serverBaseUrl}/admin/reminders/${reminderId1}/retry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const httpData = await httpRes.json();
    assert.strictEqual(httpRes.status, 200, `Expected HTTP 200, got ${httpRes.status}`);
    assert.strictEqual(httpData.success, true, 'Response body indicates success: true');

    const [updatedRow1] = await pool.query('SELECT * FROM amc_expiry_reminders WHERE id = ?', [reminderId1]);
    const meta1 = typeof updatedRow1[0].metadata === 'string' ? JSON.parse(updatedRow1[0].metadata) : updatedRow1[0].metadata;
    assert.strictEqual(meta1.manualRetriedBy, adminUserId, 'Recorded admin user ID in metadata.manualRetriedBy');
    assert(meta1.lastDispatchTrackingId.startsWith(`MANUAL-RETRY-${reminderId1}`), 'Recorded manual dispatch tracking ID');
    pass(
      'Authorized Admin Manual Retry HTTP 200',
      `Manual retry endpoint succeeded with delivery_status: ${updatedRow1[0].delivery_status}, tracking: ${meta1.lastDispatchTrackingId}`
    );

    // ══════════════════════════════════════════════════════════════════
    // CRITERION 3: Manual Retry Rejects Unauthorized Users
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Criterion 3] Manual Retry Rejects Unauthorized Users');
    // 1. Unauthenticated request
    const unauthRes = await fetch(`${serverBaseUrl}/admin/reminders/${reminderId1}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    assert.strictEqual(unauthRes.status, 401, `Expected HTTP 401 for unauthenticated request, got ${unauthRes.status}`);

    // 2. Company user (forbidden)
    const compHttpRes = await fetch(`${serverBaseUrl}/admin/reminders/${reminderId1}/retry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${companyToken}`
      }
    });
    assert.strictEqual(compHttpRes.status, 403, `Expected HTTP 403 for company user, got ${compHttpRes.status}`);
    pass(
      'Unauthorized Rejection',
      'Unauthenticated requests rejected with HTTP 401; non-admin users rejected with HTTP 403'
    );

    // ══════════════════════════════════════════════════════════════════
    // CRITERION 4: Manual Retry Dispatches Only Unsuccessful Channels
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Criterion 4] Channel Independence on Manual Retry');
    const activeContract2 = await createTestContract('active');
    // Pre-seed with in-app already successful, email failed
    const reminderIdPartial = await createTestReminder({
      contractId: activeContract2.id,
      status: 'partial',
      inApp: 'success',
      email: 'failed',
      retryCount: 1
    });

    // Count in-app notifications for this company before retry
    const [notifBefore] = await pool.query('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ?', [companyUserId]);
    const beforeCount = notifBefore[0].c;

    // Retry reminder
    await amcService.retryReminder(reminderIdPartial, adminUserId);

    // Count in-app notifications after retry
    const [notifAfter] = await pool.query('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ?', [companyUserId]);
    const afterCount = notifAfter[0].c;

    assert.strictEqual(afterCount, beforeCount, 'In-app notification count did not increase (channel was not re-sent)');

    const [retriedPartialRow] = await pool.query('SELECT in_app_status, email_status FROM amc_expiry_reminders WHERE id = ?', [reminderIdPartial]);
    assert.strictEqual(retriedPartialRow[0].in_app_status, 'success', 'in_app_status remained preserved as success');
    pass(
      'Channel Independence Preserved',
      'In-app notification was not duplicated; only unfulfilled email channel was retried'
    );

    // ══════════════════════════════════════════════════════════════════
    // CRITERION 5: Automated Outbox Skips Cancelled Contracts
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Criterion 5] Automated Outbox Skips Cancelled Contracts');
    const cancelledContract = await createTestContract('cancelled');
    const remCancelledId = await createTestReminder({ contractId: cancelledContract.id, status: 'pending', retryCount: 0 });

    // ══════════════════════════════════════════════════════════════════
    // CRITERION 6: Automated Outbox Skips All Other Non-Active Contracts
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Criterion 6] Automated Outbox Skips Other Non-Active Contracts (Expired, Draft, Rejected)');
    const expiredContract = await createTestContract('expired');
    const draftContract = await createTestContract('draft');
    const rejectedContract = await createTestContract('rejected');

    const remExpiredId = await createTestReminder({ contractId: expiredContract.id, status: 'pending', retryCount: 0 });
    const remDraftId = await createTestReminder({ contractId: draftContract.id, status: 'pending', retryCount: 0 });
    const remRejectedId = await createTestReminder({ contractId: rejectedContract.id, status: 'pending', retryCount: 0 });

    // Run outbox sweep
    await amcService.processExpiryReminders(pool);

    // Verify cancelled contract reminder was skipped
    const [cancelledCheck] = await pool.query('SELECT delivery_status, retry_count FROM amc_expiry_reminders WHERE id = ?', [remCancelledId]);
    assert.strictEqual(cancelledCheck[0].delivery_status, 'pending', 'Cancelled contract reminder remained skipped (pending)');
    assert.strictEqual(cancelledCheck[0].retry_count, 0, 'Cancelled contract reminder retry_count was not incremented');
    pass(
      'Outbox Cancelled Contract Filtration',
      'Automated outbox sweep strictly excluded reminder for cancelled contract'
    );

    // Verify other non-active contracts reminders were skipped
    const [nonActiveCheck] = await pool.query(`
      SELECT id, contract_id, delivery_status, retry_count
      FROM amc_expiry_reminders
      WHERE id IN (?, ?, ?)
    `, [remExpiredId, remDraftId, remRejectedId]);

    for (const row of nonActiveCheck) {
      assert.strictEqual(row.delivery_status, 'pending', `Reminder ${row.id} for non-active contract remained skipped (pending)`);
      assert.strictEqual(row.retry_count, 0, `Reminder ${row.id} retry_count was not incremented`);
    }
    pass(
      'Outbox Other Non-Active Contracts Filtration',
      'Automated outbox strictly skipped expired, draft, and rejected contract reminders'
    );

    // ══════════════════════════════════════════════════════════════════
    // CRITERION 7: Manual Retry Rejects Non-Active Contracts
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Criterion 7] Manual Retry Rejection for Non-Active Contracts');
    let cancelledRetryError = null;
    try {
      await amcService.retryReminder(remCancelledId, adminUserId);
    } catch (err) {
      cancelledRetryError = err.message;
    }
    assert(cancelledRetryError !== null, 'retryReminder threw an error for cancelled contract');
    assert.match(
      cancelledRetryError,
      /Cannot retry reminder for contract with status "cancelled"\. Contract must be "active"\./i,
      'Error message clearly explains contract must be active'
    );

    // Also test through HTTP endpoint to verify 400 Bad Request
    const httpCancelledRes = await fetch(`${serverBaseUrl}/admin/reminders/${remCancelledId}/retry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });
    const httpCancelledData = await httpCancelledRes.json();
    assert.strictEqual(httpCancelledRes.status, 400, `Expected HTTP 400, got ${httpCancelledRes.status}`);
    assert.match(httpCancelledData.message, /Contract must be "active"/i);
    pass(
      'Manual Retry Non-Active Guard',
      `Manual retry for cancelled contract cleanly rejected with 400: "${httpCancelledData.message}"`
    );

    // ══════════════════════════════════════════════════════════════════
    // CRITERION 8: Failed Manual Retry Calculates Exponential Backoff
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Criterion 8] Exponential Backoff on Failed Manual Retry');
    // Create an active contract with a company with an empty email to simulate channel failure
    const [dummyUser] = await pool.query(`
      INSERT INTO users (email, name, password, role, is_active)
      VALUES (?, ?, 'DummyPass123!', 'company', 1)
    `, [`dummy_invalid_${testSuffix}@tekdoctor-test.local`, `Dummy ${testSuffix}`]);
    const dummyId = dummyUser.insertId;
    createdUserIds.push(dummyId);

    // Empty out the email to ensure email dispatch fails predictably
    await pool.query('UPDATE users SET email = "" WHERE id = ?', [dummyId]);

    const [cDummy] = await pool.query(`
      INSERT INTO amc_contracts (
        contract_number, company_id, plan_id, plan_name, device_capacity,
        price, total_amount, currency, start_date, end_date,
        status, approval_status, payment_status
      ) VALUES (?, ?, 1, 'Dummy Plan', 10, 50000, 59000, 'INR', ?, ?, 'active', 'approved', 'paid')
    `, [`AMC-CTR-DUMMY-${testSuffix}`, dummyId, amcService.addDaysOnly(todayStr, -350), expiryStr]);
    createdContractIds.push(cDummy.insertId);

    // Pre-create a reminder for attempt 1 (retry_count = 0)
    const [rFailRes] = await pool.query(`
      INSERT INTO amc_expiry_reminders (
        contract_id, company_id, milestone_days, expiry_date,
        delivery_channel, delivery_status, in_app_status, email_status,
        retry_count, next_retry_at, metadata
      ) VALUES (?, ?, 7, ?, 'both', 'failed', 'pending', 'pending', 0, NULL, '{}')
    `, [cDummy.insertId, dummyId, expiryStr]);
    const failReminderId = rFailRes.insertId;
    createdReminderIds.push(failReminderId);

    // Execute manual retry where email delivery will fail
    await amcService.retryReminder(failReminderId, adminUserId);

    const [postRetryRow] = await pool.query(`
      SELECT delivery_status, in_app_status, email_status, retry_count, next_retry_at,
             TIMESTAMPDIFF(MINUTE, CURRENT_TIMESTAMP, next_retry_at) AS diff_minutes
      FROM amc_expiry_reminders
      WHERE id = ?
    `, [failReminderId]);

    // Note: In-app insertion succeeds, email delivery fails -> delivery_status = 'partial' or 'failed'
    // For attempt 1, backoff is 15 * 2^0 = 15 minutes
    assert(postRetryRow[0].next_retry_at !== null, 'next_retry_at must NOT be NULL for failed/partial retry under limit');
    assert(
      postRetryRow[0].diff_minutes >= 13 && postRetryRow[0].diff_minutes <= 16,
      `next_retry_at is ~15 minutes in future (got ${postRetryRow[0].diff_minutes} minutes)`
    );
    pass(
      'Exponential Backoff Calculated on Retry',
      `Manual retry resulted in ${postRetryRow[0].delivery_status} (attempt ${postRetryRow[0].retry_count}/5); next_retry_at scheduled ~15m ahead`
    );

    // ══════════════════════════════════════════════════════════════════
    // CRITERION 9: Partial Manual Retry Preserves Success & Sets Backoff
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Criterion 9] Partial Manual Retry Lifecycle');
    assert.strictEqual(postRetryRow[0].delivery_status, 'partial', 'Delivery status correctly set to partial when in-app succeeded but email failed');
    pass(
      'Partial Delivery Status',
      'Record transitioned to "partial" with independent channel statuses recorded'
    );

    // ══════════════════════════════════════════════════════════════════
    // CRITERION 10: Retry Limit Cap & Terminal Behavior
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Criterion 10] Retry Limit Cap (5 Attempts) & Terminal Behavior');
    // Advance retry_count to 4 (so retry will become attempt 5 = terminal)
    await pool.query('UPDATE amc_expiry_reminders SET retry_count = 4, in_app_status = "failed", email_status = "failed", delivery_status = "failed" WHERE id = ?', [failReminderId]);

    await amcService.retryReminder(failReminderId, adminUserId);

    const [terminalRow] = await pool.query(`
      SELECT retry_count, next_retry_at, delivery_status
      FROM amc_expiry_reminders
      WHERE id = ?
    `, [failReminderId]);

    assert.strictEqual(terminalRow[0].retry_count, 5, 'retry_count reached max limit of 5');
    assert.strictEqual(terminalRow[0].next_retry_at, null, 'next_retry_at is strictly NULL after reaching terminal attempt 5');

    // Also verify that automated sweep will NOT pick up this terminal record
    const [sweepPickup] = await pool.query(`
      SELECT id FROM amc_expiry_reminders
      WHERE id = ?
        AND delivery_status IN ('pending', 'failed', 'partial')
        AND retry_count < 5
        AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    `, [failReminderId]);

    assert.strictEqual(sweepPickup.length, 0, 'Terminal reminder is completely excluded from automated retry sweep');
    pass(
      'Terminal Attempt Behavior',
      'Attempt 5 capped retry_count; next_retry_at set to NULL; automated sweeps permanently skip record'
    );

  } catch (err) {
    fail('Test execution error', err);
  } finally {
    if (testServer) {
      testServer.close();
    }

    // Teardown test fixtures
    try {
      if (createdReminderIds.length > 0) {
        await pool.query('DELETE FROM amc_expiry_reminders WHERE id IN (?)', [createdReminderIds]);
      }
      if (createdContractIds.length > 0) {
        await pool.query('DELETE FROM amc_contracts WHERE id IN (?)', [createdContractIds]);
      }
      if (createdUserIds.length > 0) {
        await pool.query('DELETE FROM company_profiles WHERE user_id IN (?)', [createdUserIds]);
        await pool.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds]);
        await pool.query('DELETE FROM users WHERE id IN (?)', [createdUserIds]);
      }
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr.message);
    }

    console.log('\n===================================================================');
    console.log(`TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('===================================================================');

    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

runTests();
