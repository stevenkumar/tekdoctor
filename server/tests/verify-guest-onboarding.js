/**
 * End-to-End Automated Verification Test: Guest Book a Repair -> Customer Account Onboarding Flow
 *
 * Tests:
 * 1. Guest submits repair request -> new customer account created -> session token issued -> ticket linked.
 * 2. Set-password token works -> password updated -> replay protection prevents second use.
 * 3. Sign in with newly set password works.
 * 4. Existing customer books another repair -> no duplicate account created -> ticket linked -> session token issued.
 * 5. Idempotent rapid resubmission handled properly.
 * 6. Profile update (Name & Phone) via PUT /api/auth/profile.
 * 7. Estimate approval via POST /api/repair-request/:id/approve-estimate.
 * 8. Server logout via POST /api/auth/logout increments token_version and invalidates session token.
 * 9. Authorization isolation: Customer A cannot access Customer B's private data.
 */

const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../server');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');

let server;
let port;
let baseUrl;

function makeRequest(method, endpoint, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, baseUrl);
    const headers = {};
    let data = null;

    if (body) {
      data = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }

    headers['x-recaptcha-token'] = 'test-token';
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => (rawData += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(rawData);
          } catch (e) {
            parsed = rawData;
          }
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        });
      }
    );

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 Starting Guest Onboarding & Customer Flow Verification');
  console.log('================================================================');

  // Start internal test server
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`Test server running on ${baseUrl}`);
      resolve();
    });
  });

  const uniqueSuffix = Date.now();
  const guestEmail = `testguest_${uniqueSuffix}@tekdoctor-test.in`;
  const guestPhone = `98${String(uniqueSuffix).slice(-8)}`;
  const guestName = 'Aarav Sharma';

  try {
    // -------------------------------------------------------------------------
    // TEST 1: New Guest Book a Repair
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: New Guest Submits Repair Booking ---');
    const repairPayload = {
      customerName: guestName,
      email: guestEmail,
      mobile: guestPhone,
      city: 'Bangalore',
      deviceCategory: 'laptop',
      brand: 'Apple',
      modelNumber: 'MacBook Pro',
      problemType: 'battery/charging issue',
      problemDescription: 'Battery drains within 20 minutes',
      priority: 'high',
      preferredContactMethod: 'email',
    };

    const bookingRes = await makeRequest('POST', '/api/repair-request', repairPayload);
    if (bookingRes.status !== 200 && bookingRes.status !== 201) {
      console.error('Booking response error payload:', JSON.stringify(bookingRes.data, null, 2));
    }
    assert(bookingRes.status === 201 || bookingRes.status === 200, `Repair booking responded with ${bookingRes.status}`);
    assert(bookingRes.data.success === true, 'Booking response indicates success: true');
    assert(bookingRes.data.isNewCustomer === true, 'Response marks isNewCustomer: true');
    assert(!!bookingRes.data.ticketNumber, `Ticket number generated: ${bookingRes.data.ticketNumber}`);
    assert(!!bookingRes.data.autoLogin, 'AutoLogin payload returned');
    assert(!!bookingRes.data.autoLogin.token, 'AutoLogin JWT session token provided');

    const guestUserId = bookingRes.data.autoLogin.user.id;
    const sessionToken = bookingRes.data.autoLogin.token;

    // Verify DB state for new user
    const [userRows] = await pool.query('SELECT * FROM users WHERE id = ?', [guestUserId]);
    assert(userRows.length === 1, 'New user successfully created in users table');
    assert(userRows[0].email === guestEmail, 'User email matches booking email');
    assert(userRows[0].role === 'customer', 'User role is customer');
    assert(userRows[0].is_active === 1, 'User account is active');

    // Verify DB state for ticket
    const [ticketRows] = await pool.query('SELECT * FROM service_requests WHERE user_id = ?', [guestUserId]);
    assert(ticketRows.length === 1, 'Repair ticket linked to newly created customer user_id');
    const ticketId = ticketRows[0].id;

    // -------------------------------------------------------------------------
    // TEST 2: Set-Password Token & Replay Protection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Set Password Token & Replay Protection ---');
    // Generate valid single-use set_password token as created by repair.controller
    const setPasswordToken = jwt.sign(
      {
        id: guestUserId,
        email: guestEmail,
        type: 'set_password',
        token_version: userRows[0].token_version,
      },
      config.jwt.secret,
      { expiresIn: '24h' }
    );

    const newPass = 'SecureCustomerPass@123!';
    const resetRes = await makeRequest('POST', '/api/auth/reset-password', {
      token: setPasswordToken,
      password: newPass,
      confirmPassword: newPass,
    });

    assert(resetRes.status === 200, `Set-password responded with 200 (got ${resetRes.status})`);
    assert(resetRes.data.success === true, 'Password reset succeeded');

    // Verify token_version bumped in DB
    const [updatedUserRows] = await pool.query('SELECT token_version FROM users WHERE id = ?', [guestUserId]);
    assert(
      updatedUserRows[0].token_version > userRows[0].token_version,
      `User token_version incremented from ${userRows[0].token_version} to ${updatedUserRows[0].token_version}`
    );

    // Replay protection test: Reusing the same token MUST fail
    console.log('Testing set_password replay protection with reused token...');
    const replayRes = await makeRequest('POST', '/api/auth/reset-password', {
      token: setPasswordToken,
      password: 'AnotherPassword@456!',
      confirmPassword: 'AnotherPassword@456!',
    });
    assert(replayRes.status === 400, `Reused token rejected with 400 (got ${replayRes.status})`);
    assert(replayRes.data.success === false, 'Reused token blocked by token_version check');

    // -------------------------------------------------------------------------
    // TEST 3: Sign In with Newly Set Password
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Sign In with Newly Set Password ---');
    const signinRes = await makeRequest('POST', '/api/auth/signin', {
      email: guestEmail,
      password: newPass,
    });
    assert(signinRes.status === 200, `Sign-in responded with 200 (got ${signinRes.status})`);
    assert(signinRes.data.success === true, 'Sign-in succeeded with new password');
    assert(signinRes.data.data.role === 'customer', 'Signed-in user role is customer');
    const newSessionToken = signinRes.data.data.token;

    // -------------------------------------------------------------------------
    // TEST 4: Existing Customer Books Another Repair (No Duplicates in Users)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Existing Customer Books Second Repair ---');
    const secondRepairPayload = {
      customerName: guestName,
      email: guestEmail,
      mobile: guestPhone,
      city: 'Bangalore',
      deviceCategory: 'laptop',
      brand: 'Dell',
      modelNumber: 'XPS 15',
      problemType: 'screen crack/flicker',
      problemDescription: 'Display flickering and horizontal lines appearing when screen tilted',
      priority: 'standard',
      preferredContactMethod: 'email',
    };

    const secondBookingRes = await makeRequest('POST', '/api/repair-request', secondRepairPayload);
    assert(secondBookingRes.status === 201 || secondBookingRes.status === 200, 'Second booking created successfully');
    assert(secondBookingRes.data.isExistingCustomer === true, 'Response marks isExistingCustomer: true');
    assert(secondBookingRes.data.isNewCustomer === false, 'Response marks isNewCustomer: false');

    // Verify only ONE customer record exists for this email
    const [allUserRows] = await pool.query('SELECT id FROM users WHERE email = ?', [guestEmail]);
    assert(allUserRows.length === 1, `Exactly 1 user account exists for ${guestEmail} (no duplicates)`);

    // Verify customer now has TWO tickets
    const [allTickets] = await pool.query('SELECT id FROM service_requests WHERE user_id = ?', [guestUserId]);
    assert(allTickets.length === 2, `Customer now has 2 tickets linked to their account`);

    // -------------------------------------------------------------------------
    // TEST 4B: Idempotent Rapid Resubmission (60s Anti-Duplicate Window)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4B: Idempotent Rapid Resubmission ---');
    const duplicateBookingRes = await makeRequest('POST', '/api/repair-request', secondRepairPayload);
    assert(duplicateBookingRes.status === 200, 'Duplicate submission handled gracefully with 200 OK');
    assert(duplicateBookingRes.data.isDuplicate === true, 'Response marks isDuplicate: true');
    assert(!!duplicateBookingRes.data.autoLogin, 'AutoLogin session provided even on duplicate');

    // -------------------------------------------------------------------------
    // TEST 5: Customer Profile Update (Name & Phone)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Update Customer Profile (Name & Phone) ---');
    const updatedName = 'Aarav Sharma Updated';
    const updatedPhone = `99${String(uniqueSuffix).slice(-8)}`;

    const profileUpdateRes = await makeRequest(
      'PUT',
      '/api/auth/profile',
      { name: updatedName, phone: updatedPhone },
      newSessionToken
    );

    assert(profileUpdateRes.status === 200, `Profile update responded with 200 (got ${profileUpdateRes.status})`);
    assert(profileUpdateRes.data.success === true, 'Profile updated successfully');

    // Verify in database
    const [profileInDb] = await pool.query('SELECT name, phone FROM users WHERE id = ?', [guestUserId]);
    assert(profileInDb[0].name === updatedName, 'Database contains updated name');
    assert(
      profileInDb[0].phone === updatedPhone || profileInDb[0].phone === `+91${updatedPhone}`,
      `Database contains updated phone: ${profileInDb[0].phone}`
    );

    // -------------------------------------------------------------------------
    // TEST 6: Estimate Approval Flow
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Estimate Approval ---');
    // Set an estimated cost and status = pending_approval on ticketId
    await pool.query(
      `UPDATE service_requests
       SET estimated_cost = 2500.00, customer_approval_status = 'pending_approval'
       WHERE id = ?`,
      [ticketId]
    );

    const approveRes = await makeRequest(
      'POST',
      `/api/repair-request/${ticketId}/approve-estimate`,
      {},
      newSessionToken
    );

    assert(approveRes.status === 200, `Approve estimate responded with 200 (got ${approveRes.status})`);
    assert(approveRes.data.success === true, 'Estimate approved successfully');

    // Verify in database
    const [approvedTicket] = await pool.query(
      'SELECT customer_approval_status FROM service_requests WHERE id = ?',
      [ticketId]
    );
    assert(approvedTicket[0].customer_approval_status === 'approved', 'Ticket customer_approval_status is approved');

    // -------------------------------------------------------------------------
    // TEST 7: Customer Dashboard History Fetching
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Customer History Endpoint ---');
    const historyRes = await makeRequest('GET', '/api/repair-request/history?page=1&limit=10', null, newSessionToken);
    assert(historyRes.status === 200, `History fetch responded with 200 (got ${historyRes.status})`);
    assert(historyRes.data.data.pagination.total >= 2, 'History returns at least 2 customer tickets');

    // -------------------------------------------------------------------------
    // TEST 8: Server Logout Session Invalidation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Server Logout Session Invalidation ---');
    const logoutRes = await makeRequest('POST', '/api/auth/logout', {}, newSessionToken);
    assert(logoutRes.status === 200, `Logout responded with 200 (got ${logoutRes.status})`);
    assert(logoutRes.data.success === true, 'Logout succeeded and session invalidated');

    // Attempting to access protected profile or history with the logged out token MUST fail
    console.log('Verifying logged out token is rejected by authenticate middleware...');
    const rejectedReqRes = await makeRequest('GET', '/api/repair-request/history', null, newSessionToken);
    assert(
      rejectedReqRes.status === 401,
      `Logged out token correctly rejected with 401 Unauthorized (got ${rejectedReqRes.status})`
    );

    // -------------------------------------------------------------------------
    // TEST 9: Authorization Isolation (Customer A vs Customer B)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Authorization Isolation Between Customers ---');
    // Create Customer B
    const customerBSuffix = Date.now() + 10;
    const customerBEmail = `customerB_${customerBSuffix}@tekdoctor-test.in`;
    const customerBRes = await makeRequest('POST', '/api/repair-request', {
      customerName: 'Priya Patel',
      email: customerBEmail,
      mobile: `97${String(customerBSuffix).slice(-8)}`,
      city: 'Delhi',
      deviceCategory: 'laptop',
      brand: 'Samsung',
      problemType: 'screen crack/flicker',
      problemDescription: 'Cracked screen',
      priority: 'low',
      preferredContactMethod: 'email',
    });
    const customerBToken = customerBRes.data.autoLogin.token;

    // Customer B tries to view customer history; verify they DO NOT see Customer A's tickets
    const customerBHistoryRes = await makeRequest('GET', '/api/repair-request/history', null, customerBToken);
    assert(customerBHistoryRes.status === 200, 'Customer B fetched history');
    const customerBTickets = customerBHistoryRes.data.data.data;
    const customerBHasCustomerATicket = customerBTickets.some((t) => t.email === guestEmail);
    assert(!customerBHasCustomerATicket, "Customer B CANNOT see Customer A's service tickets");

    console.log('\n================================================================');
    console.log('🎉 ALL 9 TEST SUITES PASSED FLAWLESSLY!');
    console.log('================================================================\n');

    // Clean up test data
    await pool.query('DELETE FROM service_requests WHERE email IN (?, ?)', [guestEmail, customerBEmail]);
    await pool.query('DELETE FROM users WHERE email IN (?, ?)', [guestEmail, customerBEmail]);
    console.log('✓ Test data cleaned up cleanly.');

  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ TEST RUN FAILED:\n', err);
    process.exit(1);
  });
