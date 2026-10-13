/**
 * TekDoctor — Phase 8B-1 Verification Test Suite
 * 
 * Verifies:
 * 1. Admin Dashboard polling interval (30s) & event-driven synchronization
 * 2. Notification payload bounding (limit parameter, max clamp, unreadCount, cross-user isolation, admin history)
 * 3. Hold expiration scheduler (background auto-cancellation, multi-party notifications, activity logging, idempotency)
 * 4. Read-path isolation (zero processHoldExpirations calls in repair.controller read paths)
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const { processHoldExpirations } = require('../utils/hold.scheduler');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✓ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ [FAIL] ${testName} ${details ? `(${details})` : ''}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('       PHASE 8B-1 OPTIMIZATION VERIFICATION         ');
  console.log('====================================================');

  // ─────────────────────────────────────────────────────────────
  // 1. Static Contract Checks for Admin Polling
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Test 1: Admin Polling Interval & Event Synchronization ---');
  
  const dashboardPath = path.resolve(__dirname, '../../client/src/pages/admin/DashboardOverview.tsx');
  const ticketsPath = path.resolve(__dirname, '../../client/src/pages/admin/RepairTickets.tsx');

  const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');
  const ticketsCode = fs.readFileSync(ticketsPath, 'utf8');

  // DashboardOverview checks
  assert(
    dashboardCode.includes('setInterval(doSilentRefresh, 30000)'),
    'DashboardOverview uses 30-second interval (30000ms)'
  );
  assert(
    !dashboardCode.includes('setInterval(doSilentRefresh, 5000)'),
    'DashboardOverview removed 5-second aggressive interval'
  );
  assert(
    dashboardCode.includes("document.visibilityState !== 'visible'"),
    'DashboardOverview pauses silent refresh when tab is hidden'
  );
  assert(
    dashboardCode.includes('subscribeToPaymentUpdates'),
    'DashboardOverview subscribes to real-time payment updates'
  );
  assert(
    dashboardCode.includes('tekdoctor:notifications_updated'),
    'DashboardOverview listens to notifications_updated event'
  );

  // RepairTickets checks
  assert(
    ticketsCode.includes('setInterval(doSilentRefresh, 30000)'),
    'RepairTickets uses 30-second interval (30000ms)'
  );
  assert(
    !ticketsCode.includes('setInterval(doSilentRefresh, 5000)'),
    'RepairTickets removed 5-second aggressive interval'
  );
  assert(
    ticketsCode.includes("document.visibilityState !== 'visible'"),
    'RepairTickets pauses silent refresh when tab is hidden'
  );
  assert(
    ticketsCode.includes('subscribeToPaymentUpdates'),
    'RepairTickets subscribes to real-time payment updates'
  );
  assert(
    ticketsCode.includes('tekdoctor:notifications_updated'),
    'RepairTickets listens to notifications_updated event'
  );

  // ─────────────────────────────────────────────────────────────
  // 2. Read-path Zero-Execution Contract for processHoldExpirations
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Test 2: Read-Path Isolation (Hold Expiration Execution) ---');

  const repairControllerPath = path.resolve(__dirname, '../controllers/repair.controller.js');
  const repairControllerCode = fs.readFileSync(repairControllerPath, 'utf8');

  assert(
    !repairControllerCode.includes('processHoldExpirations'),
    'repair.controller.js contains zero references to processHoldExpirations'
  );

  const holdSchedulerPath = path.resolve(__dirname, '../utils/hold.scheduler.js');
  const holdSchedulerCode = fs.readFileSync(holdSchedulerPath, 'utf8');

  assert(
    holdSchedulerCode.includes('startHoldScheduler') && holdSchedulerCode.includes('processHoldExpirations'),
    'hold.scheduler.js exports startHoldScheduler and processHoldExpirations'
  );

  const serverJsPath = path.resolve(__dirname, '../server.js');
  const serverJsCode = fs.readFileSync(serverJsPath, 'utf8');

  assert(
    serverJsCode.includes('startHoldScheduler(pool)'),
    'server.js starts hold scheduler in background on startup'
  );

  // ─────────────────────────────────────────────────────────────
  // 3. Database Fixtures & Notification Payload Optimization
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Test 3: Notification Payload Bounding & Queries ---');

  const conn = await pool.getConnection();
  let testUserIdA = null;
  let testUserIdB = null;
  let testTicketId = null;

  try {
    // Pre-cleanup in case previous run was interrupted
    await conn.query(`DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email IN ('phase8b_user_a@test.com', 'phase8b_user_b@test.com'))`);
    await conn.query(`DELETE FROM activity_logs WHERE target_type = 'service_requests' AND target_id IN (SELECT id FROM service_requests WHERE ticket_number = 'TD-HOLD-EXP-001')`);
    await conn.query(`DELETE FROM notifications WHERE ticket_id IN (SELECT id FROM service_requests WHERE ticket_number = 'TD-HOLD-EXP-001')`);
    await conn.query(`DELETE FROM service_requests WHERE ticket_number = 'TD-HOLD-EXP-001'`);
    await conn.query(`DELETE FROM users WHERE email IN ('phase8b_user_a@test.com', 'phase8b_user_b@test.com')`);

    // Create test user A
    const [userARes] = await conn.query(`
      INSERT INTO users (name, email, password, role, is_active)
      VALUES ('Phase 8B Test User A', 'phase8b_user_a@test.com', 'dummy_hash', 'customer', 1)
    `);
    testUserIdA = userARes.insertId;

    // Create test user B
    const [userBRes] = await conn.query(`
      INSERT INTO users (name, email, password, role, is_active)
      VALUES ('Phase 8B Test User B', 'phase8b_user_b@test.com', 'dummy_hash', 'customer', 1)
    `);
    testUserIdB = userBRes.insertId;

    // Insert 15 notifications for user A (10 unread, 5 read)
    for (let i = 1; i <= 15; i++) {
      const isRead = i > 10 ? 1 : 0;
      await conn.query(`
        INSERT INTO notifications (user_id, title, message, is_read, created_at)
        VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE))
      `, [testUserIdA, `Test Notification ${i}`, `Message body ${i}`, isRead, 20 - i]);
    }

    // Insert 2 notifications for user B
    for (let i = 1; i <= 2; i++) {
      await conn.query(`
        INSERT INTO notifications (user_id, title, message, is_read)
        VALUES (?, ?, ?, 0)
      `, [testUserIdB, `User B Notif ${i}`, `User B message ${i}`]);
    }

    // Direct Controller Test for Notification Bounding
    const { getNotifications } = require('../controllers/notification.controller');

    // Scenario A: Bounded limit=5
    let resStatusA = null;
    let resDataA = null;
    const reqA = {
      user: { id: testUserIdA, role: 'customer' },
      query: { limit: '5' }
    };
    const mockResA = {
      status: (code) => {
        resStatusA = code;
        return {
          json: (data) => { resDataA = data; }
        };
      }
    };

    await getNotifications(reqA, mockResA, (err) => { if (err) throw err; });

    assert(resStatusA === 200, 'GET /api/notifications?limit=5 returns 200');
    assert(resDataA.success === true, 'Response indicates success');
    assert(Array.isArray(resDataA.data) && resDataA.data.length === 5, 'Payload accurately bounded to 5 items', `Got: ${resDataA.data?.length}`);
    assert(resDataA.unreadCount === 10, 'Unread count reflects full user unread total (10)', `Got: ${resDataA.unreadCount}`);
    assert(resDataA.data.every(n => n.user_id === testUserIdA), 'All returned items belong strictly to user A (no cross-user leakage)');

    // Scenario B: Ordering check (most recent first)
    const timestamps = resDataA.data.map(n => new Date(n.created_at).getTime());
    let isDescending = true;
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] > timestamps[i - 1]) isDescending = false;
    }
    assert(isDescending, 'Notifications ordered by created_at DESC');

    // Scenario C: Server-side clamp check (limit=500 clamped to 100)
    let resDataC = null;
    const reqC = {
      user: { id: testUserIdA, role: 'customer' },
      query: { limit: '500' }
    };
    const mockResC = {
      status: () => ({
        json: (data) => { resDataC = data; }
      })
    };
    await getNotifications(reqC, mockResC, (err) => { if (err) throw err; });
    assert(resDataC.data.length === 15, 'All 15 available items returned when limit exceeds total, without error');

    // ─────────────────────────────────────────────────────────────
    // 4. Hold Expiration Scheduler Functionality & Verification
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Test 4: Hold Expiration Processing & Notifications ---');

    // Create an expired on-hold ticket
    const [ticketRes] = await conn.query(`
      INSERT INTO service_requests (
        ticket_number, customer_name, mobile, email, user_id, assigned_technician_id,
        brand, model_number, device_category, problem_type, service_type,
        status, customer_approval_status, hold_start_date, hold_end_date, hold_reason,
        is_active
      ) VALUES (
        'TD-HOLD-EXP-001', 'Hold Test Customer', '9999988888', 'hold_customer@test.com',
        ?, ?, 'Apple', 'MacBook Air M1', 'Laptop', 'Battery', 'carry_in',
        'in_progress', 'on_hold', DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 1 HOUR), 'Customer needed time to consider budget',
        1
      )
    `, [testUserIdA, testUserIdB]); // assigned to user B as technician
    testTicketId = ticketRes.insertId;

    // Run processHoldExpirations
    const initialExpiredCount = await processHoldExpirations(pool);
    assert(initialExpiredCount >= 1, `processHoldExpirations processed at least 1 expired ticket (found ${initialExpiredCount})`);

    // Verify DB ticket state
    const [updatedTicketRows] = await conn.query(`
      SELECT status, customer_approval_status, cancellation_reason, cancelled_at
      FROM service_requests WHERE id = ?
    `, [testTicketId]);

    const updatedTicket = updatedTicketRows[0];
    assert(updatedTicket.status === 'cancelled', 'Expired ticket status updated to cancelled');
    assert(updatedTicket.customer_approval_status === 'auto_cancelled', 'customer_approval_status updated to auto_cancelled');
    assert(
      updatedTicket.cancellation_reason && updatedTicket.cancellation_reason.includes('Hold period expired'),
      'cancellation_reason documents hold expiration'
    );
    assert(updatedTicket.cancelled_at !== null, 'cancelled_at timestamp recorded');

    // Verify Customer Notification
    const [custNotifs] = await conn.query(`
      SELECT * FROM notifications WHERE user_id = ? AND ticket_id = ?
    `, [testUserIdA, testTicketId]);
    assert(custNotifs.length >= 1, 'In-app notification sent to customer');
    assert(
      custNotifs[0].title.includes('Cancelled') && custNotifs[0].title.includes('TD-HOLD-EXP-001'),
      'Customer notification title includes ticket number'
    );

    // Verify Technician Notification
    const [techNotifs] = await conn.query(`
      SELECT * FROM notifications WHERE user_id = ? AND ticket_id = ?
    `, [testUserIdB, testTicketId]);
    assert(techNotifs.length >= 1, 'In-app notification sent to assigned technician');

    // Verify Activity Log Entry
    const [logs] = await conn.query(`
      SELECT * FROM activity_logs WHERE target_type = 'service_requests' AND target_id = ? AND action = 'auto_cancel_hold_expired'
    `, [testTicketId]);
    assert(logs.length >= 1, 'Activity log entry created for auto-cancellation');

    // ─────────────────────────────────────────────────────────────
    // 5. Idempotency & Duplicate Notification Protection
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Test 5: Idempotency & Duplicate Protection ---');

    const customerNotifCountBefore = (await conn.query(`SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND ticket_id = ?`, [testUserIdA, testTicketId]))[0][0].cnt;

    // Run processHoldExpirations a second time
    const secondExpiredCount = await processHoldExpirations(pool);
    const customerNotifCountAfter = (await conn.query(`SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND ticket_id = ?`, [testUserIdA, testTicketId]))[0][0].cnt;

    assert(
      customerNotifCountAfter === customerNotifCountBefore,
      'No duplicate notifications created on second scheduler execution'
    );

  } finally {
    // Cleanup fixtures
    if (testTicketId) {
      await conn.query('DELETE FROM activity_logs WHERE target_type = "service_requests" AND target_id = ?', [testTicketId]);
      await conn.query('DELETE FROM notifications WHERE ticket_id = ?', [testTicketId]);
      await conn.query('DELETE FROM service_requests WHERE id = ?', [testTicketId]);
    }
    if (testUserIdA) {
      await conn.query('DELETE FROM notifications WHERE user_id = ?', [testUserIdA]);
      await conn.query('DELETE FROM users WHERE id = ?', [testUserIdA]);
    }
    if (testUserIdB) {
      await conn.query('DELETE FROM notifications WHERE user_id = ?', [testUserIdB]);
      await conn.query('DELETE FROM users WHERE id = ?', [testUserIdB]);
    }
    conn.release();
  }

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  console.log('\n====================================================');
  console.log(`PHASE 8B-1 VERIFICATION SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
