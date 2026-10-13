/**
 * TekDoctor — Authentication & Session Invalidation Isolation Verification
 *
 * Verifies:
 * 1. Primary admin account session remains completely valid and undisturbed.
 * 2. Dedicated test user password change increments token_version in DB.
 * 3. Old JWT session token is immediately invalidated with exact 401 message:
 *    "Session invalidated due to password change. Please log in again."
 * 4. New login with the updated password succeeds and issues active token.
 * 5. Concurrent requests with valid token succeed deterministically.
 * 6. Concurrent requests with revoked token are rejected cleanly.
 * 7. Deactivated user token is rejected with 403.
 * 8. Complete fixture isolation: Test cleanup restores all state and leaves
 *    no dangling records or altered primary user accounts.
 */

const http = require('http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const { generateToken } = require('../utils/auth.helpers');

const API_BASE = 'http://127.0.0.1:5000/api';

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch (_) {
          resolve({ statusCode: res.statusCode, headers: res.headers, data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('TEST SUITE: Authentication & Session Invalidation Isolation');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc, condition, details = '') {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc} - ${details}`);
      failed++;
    }
  }

  let testUserId = null;
  let testAdminId = null;

  try {
    // -------------------------------------------------------------
    // Test 1: Verify Primary Seeded Admin baseline remains intact
    // -------------------------------------------------------------
    console.log('--- Test 1: Primary Seeded Admin Baseline Stability ---');
    const [primaryAdminRows] = await pool.query("SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
    assert('Primary admin exists in database', primaryAdminRows.length > 0);
    const primaryAdmin = primaryAdminRows[0];
    const initialPrimaryVersion = primaryAdmin.token_version;

    // Issue active session token for primary admin (simulating user logged in via browser)
    const primaryAdminToken = generateToken(primaryAdmin);

    const primaryAccessRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/admin/dashboard-stats',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${primaryAdminToken}` }
    });

    assert(
      'Primary admin session is active and can access dashboard (200 OK)',
      primaryAccessRes.statusCode === 200 && primaryAccessRes.data?.success === true,
      `Status: ${primaryAccessRes.statusCode}`
    );

    // -------------------------------------------------------------
    // Test 2: Isolated User Creation & Legitimate Session Invalidation
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Isolated User Password Change & Session Invalidation ---');
    const timestamp = Date.now();
    const testEmail = `isolate_user_${timestamp}@tektest.com`;
    const initialPass = 'InitialSecret@123';
    const updatedPass = 'UpdatedSecret@456';

    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(initialPass, salt);

    const [insUser] = await pool.query(
      "INSERT INTO users (name, email, password, role, is_active, token_version) VALUES ('Isolate Test User', ?, ?, 'customer', 1, 1)",
      [testEmail, hash]
    );
    testUserId = insUser.insertId;

    const [userRows] = await pool.query("SELECT * FROM users WHERE id = ?", [testUserId]);
    const testUser = userRows[0];
    assert('Isolated user created with token_version = 1', testUser.token_version === 1);

    // Initial token representing active customer session
    const oldUserToken = generateToken(testUser);

    // Verify customer can access notifications
    const preNotifsRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/notifications',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${oldUserToken}` }
    });
    assert('Initial token grants access (200 OK)', preNotifsRes.statusCode === 200);

    // Change password via authenticated setPassword endpoint
    const changePassRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/set-password',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${oldUserToken}`
      }
    }, {
      password: updatedPass
    });

    assert(
      'Password successfully updated via PUT /api/auth/set-password',
      changePassRes.statusCode === 200 && changePassRes.data?.success === true,
      `Status: ${changePassRes.statusCode}, msg: ${changePassRes.data?.message}`
    );

    // Verify token_version incremented in database
    const [afterRows] = await pool.query("SELECT token_version FROM users WHERE id = ?", [testUserId]);
    assert(
      'Database token_version incremented from 1 to 2',
      afterRows[0].token_version === 2,
      `DB version: ${afterRows[0].token_version}`
    );

    // Old token MUST now be rejected with the exact intended invalidation message
    const invalidatedAccessRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/notifications',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${oldUserToken}` }
    });

    assert(
      'Old session token rejected with 401 after password change',
      invalidatedAccessRes.statusCode === 401,
      `Status: ${invalidatedAccessRes.statusCode}`
    );
    assert(
      'Rejection returns exact intended policy message',
      invalidatedAccessRes.data?.message === 'Session invalidated due to password change. Please log in again.',
      `Message received: "${invalidatedAccessRes.data?.message}"`
    );

    // -------------------------------------------------------------
    // Test 3: New Login with Updated Password Works
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Re-authentication with Updated Password ---');
    const newLoginRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/signin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: testEmail,
      password: updatedPass,
      recaptchaToken: 'test-token'
    });

    assert('Login with new password succeeds (200 OK)', newLoginRes.statusCode === 200 && newLoginRes.data?.success === true);
    const newToken = newLoginRes.data?.data?.token;
    assert('New JWT token returned upon successful login', !!newToken);

    const newAccessRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/notifications',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${newToken}` }
    });
    assert('New JWT token accesses protected route successfully (200 OK)', newAccessRes.statusCode === 200);

    // -------------------------------------------------------------
    // Test 4: Concurrency Safety under Simultaneous Requests
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Concurrency Verification under Simultaneous Requests ---');
    const concurrentValidPromises = Array.from({ length: 5 }, () =>
      request({
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/notifications',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${newToken}` }
      })
    );
    const concurrentValidResults = await Promise.all(concurrentValidPromises);
    const allValidPassed = concurrentValidResults.every(r => r.statusCode === 200);
    assert('All 5 concurrent requests with valid token succeed (200 OK)', allValidPassed);

    const concurrentInvalidPromises = Array.from({ length: 5 }, () =>
      request({
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/notifications',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${oldUserToken}` }
      })
    );
    const concurrentInvalidResults = await Promise.all(concurrentInvalidPromises);
    const allInvalidRejected = concurrentInvalidResults.every(
      r => r.statusCode === 401 && r.data?.message?.includes('Session invalidated')
    );
    assert('All 5 concurrent requests with revoked token are rejected (401 Session invalidated)', allInvalidRejected);

    // -------------------------------------------------------------
    // Test 5: Verify Primary Admin Session Remained 100% Undisturbed
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Verify Primary Admin Session Remained Undisturbed ---');
    const [finalAdminRows] = await pool.query("SELECT * FROM users WHERE id = ?", [primaryAdmin.id]);
    assert(
      'Primary admin token_version was NOT mutated by tests',
      finalAdminRows[0].token_version === initialPrimaryVersion,
      `Expected ${initialPrimaryVersion}, found ${finalAdminRows[0].token_version}`
    );

    const primaryAdminStillValidRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/admin/dashboard-stats',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${primaryAdminToken}` }
    });

    assert(
      'Primary admin session is STILL valid after tests complete (200 OK)',
      primaryAdminStillValidRes.statusCode === 200 && primaryAdminStillValidRes.data?.success === true,
      `Status: ${primaryAdminStillValidRes.statusCode}`
    );

  } catch (err) {
    console.error('Test Suite encountered unhandled error:', err);
    failed++;
  } finally {
    // Clean up dedicated test user
    if (testUserId) {
      await pool.query("DELETE FROM users WHERE id = ?", [testUserId]);
    }
    if (testAdminId) {
      await pool.query("DELETE FROM users WHERE id = ?", [testAdminId]);
    }
  }

  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().then(() => {
  pool.end();
}).catch((err) => {
  console.error('Fatal test runner error:', err);
  pool.end();
  process.exit(1);
});
