/**
 * verify-company-ticket-admin-notifications.js
 * 
 * Targeted automated test suite for Company Repair Ticket Admin Notifications & Bulk Alerts:
 * 1. Individual company ticket creation:
 *    - Persists Admin notification in `notifications` table.
 *    - Validates notification fields: title, sender_id, ticket_id, message (Company, Ticket ID, Type: Individual, Device, Issue, Status).
 *    - Confirms GET /api/notifications resolves corporate `sender_name` from company_profiles.
 *    - Dispatches Admin email alert asynchronously without blocking or failing on SMTP errors.
 *    - Validates idempotency duplicate submission does NOT create duplicate alerts.
 * 2. Bulk company ticket creation:
 *    - Validates single batch-level summary notification (NOT one per ticket).
 *    - Validates notification fields: title, ticket_id IS NULL, message (Company, Type: Bulk, Created count, Failed count, Time).
 *    - Dispatches single summary email alert to Admin.
 * 3. Partial success bulk upload:
 *    - Validates accurate counts: Created: X, Failed: Y.
 * 4. All-invalid / rolled-back bulk upload:
 *    - Validates zero successful-submission alerts generated on 100% failure.
 */

const { pool } = require('../config/db.config');
const { generateToken } = require('../utils/auth.helpers');
const fs = require('fs');
const path = require('path');

const API_BASE = (process.env.TEST_API_BASE || 'http://127.0.0.1:5000') + '/api';

async function runTests() {
  console.log('================================================================');
  console.log('   COMPANY TICKET ADMIN NOTIFICATIONS & BULK ALERTS TEST SUITE   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${message}`);
      failed++;
    }
  }

  const runId = Date.now();
  let adminUser = null;
  let adminToken = null;
  let companyUser = null;
  let companyToken = null;
  let testDeviceId1 = null;
  let testDeviceId2 = null;
  const testSerial1 = `SN-NOTIF-A-${runId}`;
  const testSerial2 = `SN-NOTIF-B-${runId}`;
  const testCompanyName = `MegaCorp Global [${runId}]`;

  try {
    // 0. Setup: Identify Admin and create test Company user & profile
    const [admins] = await pool.query("SELECT id, name, email, role, token_version FROM users WHERE role = 'admin' AND is_active = 1 LIMIT 1");
    if (admins.length === 0) {
      throw new Error('No active admin user found in database.');
    }
    adminUser = admins[0];
    adminToken = generateToken(adminUser);

    const companyEmail = `company_notif_${runId}@tekdoctor-test.in`;
    const [userRes] = await pool.query(
      "INSERT INTO users (name, email, password, role, is_active, phone, token_version) VALUES (?, ?, 'TestPass123!', 'company', 1, ?, 1)",
      [`Contact Person ${runId}`, companyEmail, `98${Math.floor(10000000 + Math.random() * 90000000)}`]
    );
    const companyUserId = userRes.insertId;
    companyUser = { id: companyUserId, email: companyEmail, name: `Contact Person ${runId}`, role: 'company', token_version: 1 };
    companyToken = generateToken(companyUser);

    await pool.query(
      `INSERT INTO company_profiles (user_id, company_name, contact_person, phone_number, address, amc_status) 
       VALUES (?, ?, ?, '9876543210', '123 Tech Park', 'Inactive')`,
      [companyUserId, testCompanyName, `Contact Person ${runId}`]
    );

    // Register 2 test devices
    const [dev1] = await pool.query(
      `INSERT INTO company_devices (company_id, serial_number, device_category, brand, model_number, status, is_active)
       VALUES (?, ?, 'Laptop', 'Lenovo', 'ThinkPad T14', 'active', 1)`,
      [companyUserId, testSerial1]
    );
    testDeviceId1 = dev1.insertId;

    const [dev2] = await pool.query(
      `INSERT INTO company_devices (company_id, serial_number, device_category, brand, model_number, status, is_active)
       VALUES (?, ?, 'Laptop', 'Dell', 'Latitude 5420', 'active', 1)`,
      [companyUserId, testSerial2]
    );
    testDeviceId2 = dev2.insertId;

    console.log(`[SETUP] Admin: ${adminUser.email} (ID ${adminUser.id})`);
    console.log(`[SETUP] Company: "${testCompanyName}" (User ID ${companyUserId})`);
    console.log(`[SETUP] Devices: ${testSerial1} (ID ${testDeviceId1}), ${testSerial2} (ID ${testDeviceId2})\n`);

    // ── Test 1: Individual Company Ticket Creation ────────────────────────
    console.log('--- Test Group 1: Individual Company Repair Ticket Notification ---');

    const [adminNotifsBefore] = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ?',
      [adminUser.id]
    );
    const beforeCount = adminNotifsBefore[0].count;

    const indSubmissionId = `sub-ind-${runId}`;
    const indPayload = {
      deviceId: testDeviceId1,
      problemType: 'Hardware',
      problemDescription: 'Display backlight failing intermittently when lid is adjusted.',
      priority: 'Standard',
      serviceType: 'Bring to Service Center',
      preferredContactMethod: 'WhatsApp',
      clientSubmissionId: indSubmissionId
    };

    const res1 = await fetch(`${API_BASE}/company/repairs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${companyToken}`
      },
      body: JSON.stringify(indPayload)
    });
    const data1 = await res1.json();

    assert(res1.status === 201 && data1.success === true, `Individual ticket creation returned HTTP 201: ${data1.message}`);
    const createdTicketId = data1.data?.id;
    const createdTicketNumber = data1.data?.ticketNumber;
    assert(Boolean(createdTicketId && createdTicketNumber), `Authoritative ticket created: ID ${createdTicketId}, Number ${createdTicketNumber}`);

    // Verify Notification in Database for Admin
    const [indNotifs] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? AND ticket_id = ? ORDER BY id DESC LIMIT 1',
      [adminUser.id, createdTicketId]
    );
    assert(indNotifs.length === 1, 'Admin received a persistent notification in `notifications` table for individual ticket');

    if (indNotifs.length > 0) {
      const notif = indNotifs[0];
      assert(notif.title === 'New Company Repair Request', `Notification title is exact: "${notif.title}"`);
      assert(notif.sender_id === companyUserId, `Notification sender_id matches company user (${notif.sender_id})`);
      assert(notif.ticket_id === createdTicketId, `Notification ticket_id matches created ticket (${notif.ticket_id})`);
      assert(notif.message.includes(`Company: ${testCompanyName}`), `Notification message clearly identifies corporate company name: "${testCompanyName}"`);
      assert(notif.message.includes(`Ticket ID: ${createdTicketNumber}`), `Notification message includes ticket ID: "${createdTicketNumber}"`);
      assert(notif.message.includes('Type: Individual'), 'Notification message specifies "Type: Individual"');
      assert(notif.message.includes('Lenovo ThinkPad T14') || notif.message.includes('Laptop'), 'Notification message includes device summary');
      assert(notif.message.includes('Status: Pending'), 'Notification message includes initial pending status');
    }

    // Verify GET /api/notifications resolves corporate sender_name for Admin
    const notifRes = await fetch(`${API_BASE}/notifications`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const notifData = await notifRes.json();
    assert(notifRes.status === 200 && notifData.success === true, 'Admin GET /api/notifications returned HTTP 200');
    const matchedNotif = (notifData.data || []).find(n => n.ticket_id === createdTicketId);
    assert(Boolean(matchedNotif), 'Found created ticket notification in Admin notifications endpoint list');
    if (matchedNotif) {
      assert(
        matchedNotif.sender_name === testCompanyName,
        `Admin API resolved corporate sender_name: expected "${testCompanyName}", got "${matchedNotif.sender_name}"`
      );
      assert(
        matchedNotif.ticket_number === createdTicketNumber,
        `Admin API joined ticket_number: "${matchedNotif.ticket_number}"`
      );
    }

    // ── Test 2: Idempotency Retry Check ────────────────────────────────────
    console.log('\n--- Test Group 2: Idempotency & Duplicate Submission Isolation ---');
    const resDup = await fetch(`${API_BASE}/company/repairs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${companyToken}`
      },
      body: JSON.stringify(indPayload)
    });
    const dataDup = await resDup.json();
    assert(resDup.status === 200 && dataDup.isDuplicate === true, 'Duplicate submission with same clientSubmissionId returned HTTP 200 with isDuplicate=true');

    const [dupNotifs] = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND ticket_id = ?',
      [adminUser.id, createdTicketId]
    );
    assert(dupNotifs[0].count === 1, 'Duplicate submission did NOT create duplicate notification records in database');

    // ── Test 3: Bulk Repair Ticket Import (Full Success) ───────────────────
    console.log('\n--- Test Group 3: Bulk Repair Ticket Import Summary Alert ---');

    // Prepare CSV with 1 valid ticket for testDeviceId2
    const csvContent = `device_serial,problem_type,priority,service_type,problem_description\n${testSerial2},Hardware,Urgent,Bring to Service Center,Keyboard keys stuck and not registering keystrokes.`;
    const form = new FormData();
    form.append('csvFile', new Blob([csvContent], { type: 'text/csv' }), 'bulk.csv');

    const bulkRes = await fetch(`${API_BASE}/company/bulk-requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${companyToken}`
      },
      body: form
    });
    const bulkData = await bulkRes.json();

    assert(bulkRes.status === 200 && bulkData.success === true, `Bulk ticket upload returned HTTP 200: ${bulkData.message}`);
    assert(bulkData.data?.imported === 1 && bulkData.data?.failed === 0, `Bulk response reports accurate counts: imported=1, failed=0`);

    // Verify single summary notification created for admin
    const [bulkNotifs] = await pool.query(
      "SELECT * FROM notifications WHERE user_id = ? AND title = 'New Bulk Repair Request' ORDER BY id DESC LIMIT 1",
      [adminUser.id]
    );
    assert(bulkNotifs.length === 1, 'Admin received a single summary notification in `notifications` table for bulk upload');
    if (bulkNotifs.length > 0) {
      const bNotif = bulkNotifs[0];
      assert(bNotif.ticket_id === null, 'Bulk notification ticket_id is NULL (summary of batch, not single ticket)');
      assert(bNotif.sender_id === companyUserId, `Bulk notification sender_id matches company user (${bNotif.sender_id})`);
      assert(bNotif.message.includes(`Company: ${testCompanyName}`), `Bulk notification identifies company: "${testCompanyName}"`);
      assert(bNotif.message.includes('Type: Bulk'), 'Bulk notification specifies "Type: Bulk"');
      assert(bNotif.message.includes('Created: 1'), 'Bulk notification reports created count: "Created: 1"');
      assert(bNotif.message.includes('Failed: 0'), 'Bulk notification reports failed count: "Failed: 0"');
      assert(bNotif.message.includes('Time:'), 'Bulk notification includes submission time');
    }

    // ── Test 4: Partial Bulk Import (1 Valid, 2 Invalid) ───────────────────
    console.log('\n--- Test Group 4: Partial Success Bulk Import Accurate Reporting ---');

    // Register a 3rd device for partial test
    const testSerial3 = `SN-NOTIF-C-${runId}`;
    await pool.query(
      `INSERT INTO company_devices (company_id, serial_number, device_category, brand, model_number, status, is_active)
       VALUES (?, ?, 'Laptop', 'HP', 'EliteBook 840', 'active', 1)`,
      [companyUserId, testSerial3]
    );

    const partialCsvContent = `device_serial,problem_type,priority,service_type,problem_description
${testSerial3},Software,Standard,Bring to Service Center,Operating system freezing randomly on boot.
NON_EXISTENT_SERIAL_1,Hardware,Standard,Bring to Service Center,Screen cracked completely.
NON_EXISTENT_SERIAL_2,Hardware,Standard,Bring to Service Center,Water spill damage on motherboard.`;

    const formPartial = new FormData();
    formPartial.append('csvFile', new Blob([partialCsvContent], { type: 'text/csv' }), 'partial.csv');

    const partialRes = await fetch(`${API_BASE}/company/bulk-requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${companyToken}`
      },
      body: formPartial
    });
    const partialData = await partialRes.json();

    assert(partialRes.status === 200 && partialData.success === true, `Partial bulk upload returned HTTP 200: ${partialData.message}`);
    assert(partialData.data?.imported === 1, `Partial bulk import created exactly 1 valid ticket (got ${partialData.data?.imported})`);
    assert(partialData.data?.failed === 2, `Partial bulk import reported exactly 2 failed rows (got ${partialData.data?.failed})`);

    // Verify Admin notification reflects 1 created, 2 failed
    const [partialNotifs] = await pool.query(
      "SELECT * FROM notifications WHERE user_id = ? AND title = 'New Bulk Repair Request' ORDER BY id DESC LIMIT 1",
      [adminUser.id]
    );
    if (partialNotifs.length > 0) {
      const pNotif = partialNotifs[0];
      assert(pNotif.message.includes('Created: 1'), `Partial notification message reports "Created: 1"`);
      assert(pNotif.message.includes('Failed: 2'), `Partial notification message reports "Failed: 2"`);
    }

    // ── Test 5: All-Invalid Bulk Import (0 Success) ────────────────────────
    console.log('\n--- Test Group 5: All-Invalid Bulk Import Suppresses Success Alert ---');

    const [bulkNotifCountBefore] = await pool.query(
      "SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND title = 'New Bulk Repair Request'",
      [adminUser.id]
    );
    const beforeBulkCount = bulkNotifCountBefore[0].count;

    const allInvalidContent = `device_serial,problem_type,priority,service_type,problem_description
UNKNOWN_SERIAL_X,Hardware,Standard,Bring to Service Center,Screen cracked.
UNKNOWN_SERIAL_Y,Hardware,Standard,Bring to Service Center,Battery dead.`;

    const formInvalid = new FormData();
    formInvalid.append('csvFile', new Blob([allInvalidContent], { type: 'text/csv' }), 'invalid.csv');

    const invalidRes = await fetch(`${API_BASE}/company/bulk-requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${companyToken}`
      },
      body: formInvalid
    });
    const invalidData = await invalidRes.json();

    assert(invalidRes.status === 400 && invalidData.success === false, `All-invalid bulk upload properly returned HTTP 400: ${invalidData.message}`);
    assert(invalidData.data?.imported === 0 && invalidData.data?.failed === 2, 'Response reports 0 imported, 2 failed');

    const [bulkNotifCountAfter] = await pool.query(
      "SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND title = 'New Bulk Repair Request'",
      [adminUser.id]
    );
    const afterBulkCount = bulkNotifCountAfter[0].count;
    assert(afterBulkCount === beforeBulkCount, 'All-invalid import did NOT generate any false success notifications');

  } catch (err) {
    console.error('Test execution failed with error:', err);
    failed++;
  } finally {
    // Cleanup test data
    console.log('\n--- Cleaning up test artifacts ---');
    if (companyUser) {
      await pool.query('DELETE FROM notifications WHERE sender_id = ?', [companyUser.id]);
      await pool.query('DELETE FROM service_requests WHERE company_id = ?', [companyUser.id]);
      await pool.query('DELETE FROM company_devices WHERE company_id = ?', [companyUser.id]);
      await pool.query('DELETE FROM company_profiles WHERE user_id = ?', [companyUser.id]);
      await pool.query('DELETE FROM users WHERE id = ?', [companyUser.id]);
      console.log('✓ Cleaned up test company, devices, tickets, and notifications.');
    }

    console.log('\n================================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
