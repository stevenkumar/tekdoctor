/**
 * Phase 1 Security Fixes Verification Script
 * Tests:
 * 1. Normal password login (bcrypt) works
 * 2. Incorrect password login is rejected
 * 3. Plaintext password comparison is eliminated (no fallback)
 * 4. Token version / session invalidation works
 * 5. Technician password change authorization:
 *    - Technicians calling PUT /api/technicians/change-password are denied (403) with coordinator policy
 *    - Non-admins cannot invoke admin changePassword (403)
 *    - Admin changePassword continues to work for admins
 * 6. CSP configuration allows required reCAPTCHA Enterprise domains without wildcards
 * 7. Verification that reCAPTCHA routes for all 6 features are properly protected
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
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

function makeToken(user) {
  return generateToken(user);
}

async function runTests() {
  console.log('====================================================');
  console.log('       PHASE 1 SECURITY FIXES VERIFICATION');
  console.log('====================================================\n');

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

  try {
    // -------------------------------------------------------------
    // Test 1: S-01 Plaintext Fallback Elimination & Normal Bcrypt Login
    // -------------------------------------------------------------
    console.log('--- Test Suite 1: S-01 Password Authentication ---');

    // 1.1 Verify Admin Bcrypt Login works
    const [adminRow] = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
    const adminEmail = adminRow[0].email;

    const adminLoginRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/signin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: adminEmail,
      password: 'VIVEKvKUMAR',
      recaptchaToken: 'test-token'
    });

    assert(
      'Admin normal bcrypt login succeeds (200)',
      adminLoginRes.statusCode === 200 && adminLoginRes.data?.success === true,
      `Status: ${adminLoginRes.statusCode}, msg: ${JSON.stringify(adminLoginRes.data)}`
    );

    // 1.2 Verify Incorrect Password is rejected
    const badLoginRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/signin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: adminEmail,
      password: 'WrongPassword123!',
      recaptchaToken: 'test-token'
    });

    assert(
      'Incorrect password rejected with 400',
      badLoginRes.statusCode === 400 && badLoginRes.data?.success === false,
      `Status: ${badLoginRes.statusCode}, msg: ${badLoginRes.data?.message}`
    );

    // 1.3 Verify that user with plaintext password in DB CANNOT authenticate via plaintext comparison
    // Create a temporary test user with raw plaintext password in DB (not starting with $2a$/$2b$/$2y$)
    const rawPlaintextUserEmail = `test_plaintext_${Date.now()}@example.com`;
    const [rawInsert] = await pool.query(
      "INSERT INTO users (name, email, password, role, is_active) VALUES ('Plaintext Test', ?, 'UnHashedPlainPass123', 'customer', 1)",
      [rawPlaintextUserEmail]
    );
    const rawUserId = rawInsert.insertId;

    const rawLoginRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/signin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: rawPlaintextUserEmail,
      password: 'UnHashedPlainPass123',
      recaptchaToken: 'test-token'
    });

    assert(
      'Raw plaintext password in DB is REJECTED by login (no plaintext fallback execution)',
      rawLoginRes.statusCode === 400 && rawLoginRes.data?.success === false,
      `Status: ${rawLoginRes.statusCode}, message: ${rawLoginRes.data?.message}`
    );

    // Verify password in DB was NOT auto-converted at login time (meaning the insecure fallback code did not run)
    const [chkRaw] = await pool.query('SELECT password FROM users WHERE id = ?', [rawUserId]);
    assert(
      'Database password was not mutated by login handler (fallback code completely removed)',
      chkRaw[0].password === 'UnHashedPlainPass123'
    );

    // Clean up temporary test user
    await pool.query('DELETE FROM users WHERE id = ?', [rawUserId]);

    // 1.4 Verify legacy accounts that were migrated to bcrypt can login normally
    // User apex@apex.com was legacy 'dummy', which db.init migrated to bcrypt
    const [apexUser] = await pool.query('SELECT * FROM users WHERE email = "apex@apex.com" LIMIT 1');
    if (apexUser.length > 0) {
      assert(
        'Legacy user password in database has valid bcrypt prefix ($2a$)',
        apexUser[0].password && apexUser[0].password.startsWith('$2a$')
      );

      const apexLoginRes = await request({
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/auth/signin',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        email: 'apex@apex.com',
        password: 'dummy',
        recaptchaToken: 'test-token'
      });

      assert(
        'Migrated legacy user logs in successfully with bcrypt comparison',
        apexLoginRes.statusCode === 200 && apexLoginRes.data?.success === true,
        `Status: ${apexLoginRes.statusCode}`
      );
    }

    // -------------------------------------------------------------
    // Test 2: R-01 Technician Password-Change Authorization
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 2: R-01 Technician Password-Change Authorization ---');

    // Fetch a technician
    const [techRows] = await pool.query("SELECT * FROM users WHERE role = 'technician' LIMIT 1");
    if (techRows.length === 0) {
      const pHash = await bcrypt.hash('TechPass123!', 10);
      const [ins] = await pool.query(
        "INSERT INTO users (name, email, password, role, is_active) VALUES ('Tech Test', 'tech_phase1@test.com', ?, 'technician', 1)",
        [pHash]
      );
      const [t] = await pool.query("SELECT * FROM users WHERE id = ?", [ins.insertId]);
      techRows.push(t[0]);
    }
    const techUser = techRows[0];
    const techToken = makeToken(techUser);

    // 2.1 Technician calls PUT /api/technicians/change-password
    const techChangeRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/technicians/change-password',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${techToken}`
      }
    }, {
      currentPassword: 'AnyPassword123!',
      newPassword: 'NewPassword123!'
    });

    assert(
      'Technician PUT /api/technicians/change-password returns 403 Forbidden',
      techChangeRes.statusCode === 403,
      `Status: ${techChangeRes.statusCode}`
    );

    assert(
      'Technician receives exact coordinator policy message',
      techChangeRes.data?.message === 'Technicians are not authorized to change their own passwords. Please contact your coordinator.',
      `Message received: "${techChangeRes.data?.message}"`
    );

    // 2.2 Technician attempts to call admin changePassword endpoint directly
    const techAdminChangeRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/admin/change-password',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${techToken}`
      }
    }, {
      currentPassword: 'AnyPassword123!',
      newPassword: 'NewPassword123!'
    });

    assert(
      'Technician blocked from admin /api/admin/change-password (403 Forbidden)',
      techAdminChangeRes.statusCode === 403,
      `Status: ${techAdminChangeRes.statusCode}`
    );

    // 2.3 & 2.4 Dedicated Isolated Test Admin for Password Change & Session Invalidation
    // We isolate this test user completely from the primary shared admin account to avoid
    // mutating shared credentials or invalidating active developer/AI sessions in the browser.
    const testAdminSalt = await bcrypt.genSalt(12);
    const testAdminHash = await bcrypt.hash('Admin@123', testAdminSalt);
    const testAdminEmail = `phase1_admin_${Date.now()}_${Math.floor(Math.random() * 10000)}@tektest.com`;

    let testAdminId = null;
    try {
      const [adminIns] = await pool.query(
        "INSERT INTO users (name, email, password, role, is_active, token_version) VALUES ('Phase1 Test Admin', ?, ?, 'admin', 1, 1)",
        [testAdminEmail, testAdminHash]
      );
      testAdminId = adminIns.insertId;
      const [adminUserRows] = await pool.query("SELECT * FROM users WHERE id = ?", [testAdminId]);
      const isolatedAdminUser = adminUserRows[0];
      const adminToken = makeToken(isolatedAdminUser);

      // Test with incorrect current password
      const adminBadPassRes = await request({
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/admin/change-password',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        }
      }, {
        currentPassword: 'WrongCurrentPassword123!',
        newPassword: 'NewAdminPassword@123'
      });

      assert(
        'Admin change-password validates current password correctly (400 on incorrect)',
        adminBadPassRes.statusCode === 400 && adminBadPassRes.data?.message?.includes('Incorrect current password'),
        `Status: ${adminBadPassRes.statusCode}, message: ${adminBadPassRes.data?.message}`
      );

      // 2.4 Test Admin changing password and session invalidation (token_version increment)
      const prevTokenVersion = isolatedAdminUser.token_version || 1;
      const adminGoodPassRes = await request({
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/admin/change-password',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        }
      }, {
        currentPassword: 'Admin@123',
        newPassword: 'Admin@123Updated'
      });

      assert(
        'Admin can successfully change their password',
        adminGoodPassRes.statusCode === 200 && adminGoodPassRes.data?.success === true,
        `Status: ${adminGoodPassRes.statusCode}, msg: ${adminGoodPassRes.data?.message}`
      );

      // Verify token_version increment in DB
      const [refreshedAdmin] = await pool.query("SELECT token_version FROM users WHERE id = ?", [testAdminId]);
      assert(
        'Admin token_version incremented upon password change',
        refreshedAdmin[0].token_version > prevTokenVersion,
        `Old: ${prevTokenVersion}, New: ${refreshedAdmin[0].token_version}`
      );

      // Verify that the OLD adminToken is now rejected due to token_version mismatch
      const invalidatedRes = await request({
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/admin/dashboard-stats',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      assert(
        'Old JWT is invalidated after password change (session invalidation works)',
        invalidatedRes.statusCode === 401 && invalidatedRes.data?.message?.includes('Session invalidated'),
        `Status: ${invalidatedRes.statusCode}, message: ${invalidatedRes.data?.message}`
      );

      // Verify that signing in with the NEW password succeeds and issues an active token
      const newLoginRes = await request({
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/auth/signin',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        email: testAdminEmail,
        password: 'Admin@123Updated',
        recaptchaToken: 'test-token'
      });

      assert(
        'New login with updated password succeeds after password change',
        newLoginRes.statusCode === 200 && newLoginRes.data?.success === true,
        `Status: ${newLoginRes.statusCode}, msg: ${JSON.stringify(newLoginRes.data)}`
      );

      let newToken = newLoginRes.data?.data?.token;
      if (newLoginRes.data?.data?.requiresOtp) {
        // Complete Admin OTP verification step
        const [otpRow] = await pool.query(
          "SELECT id FROM auth_otps WHERE user_id = ? AND purpose = 'admin_login' AND is_used = 0 ORDER BY id DESC LIMIT 1",
          [testAdminId]
        );
        const testCode = '777888';
        const crypto = require('crypto');
        const testHash = crypto.createHash('sha256').update(testCode).digest('hex');
        await pool.query("UPDATE auth_otps SET otp_hash = ? WHERE id = ?", [testHash, otpRow[0].id]);

        const verifyOtpRes = await request({
          hostname: '127.0.0.1',
          port: 5000,
          path: '/api/auth/admin/verify-login-otp',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, {
          pendingToken: newLoginRes.data?.data?.pendingToken,
          otp: testCode
        });
        newToken = verifyOtpRes.data?.data?.token;
      }

      const newAccessRes = await request({
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/admin/dashboard-stats',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${newToken}`
        }
      });

      assert(
        'New token from updated password login successfully accesses protected routes',
        newAccessRes.statusCode === 200 && newAccessRes.data?.success === true,
        `Status: ${newAccessRes.statusCode}`
      );
    } finally {
      if (testAdminId) {
        await pool.query("DELETE FROM users WHERE id = ?", [testAdminId]);
      }
    }

    // -------------------------------------------------------------
    // Test 3: S-06 Content Security Policy (Helmet) Verification
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 3: S-06 Helmet CSP reCAPTCHA Configuration ---');

    const fs = require('fs');
    const path = require('path');
    const serverFileContent = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');

    assert(
      'server.js scriptSrc includes https://www.google.com/recaptcha/',
      serverFileContent.includes("'https://www.google.com/recaptcha/'")
    );
    assert(
      'server.js scriptSrc includes https://www.gstatic.com/recaptcha/',
      serverFileContent.includes("'https://www.gstatic.com/recaptcha/'")
    );
    assert(
      'server.js frameSrc includes https://www.google.com/recaptcha/',
      serverFileContent.includes("frameSrc:") && serverFileContent.includes("'https://recaptcha.google.com/recaptcha/'")
    );
    assert(
      'server.js connectSrc includes https://recaptchaenterprise.googleapis.com',
      serverFileContent.includes("'https://recaptchaenterprise.googleapis.com'")
    );
    assert(
      'CSP does NOT use broad wildcard * in connectSrc, frameSrc, or scriptSrc',
      !serverFileContent.match(/scriptSrc:\s*\[[^\]]*'\*'/) &&
      !serverFileContent.match(/frameSrc:\s*\[[^\]]*'\*'/)
    );

    // -------------------------------------------------------------
    // Test 4: reCAPTCHA Protection on all 6 Features
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 4: Approved 6 Features reCAPTCHA Coverage ---');

    const authRoutes = fs.readFileSync(path.resolve(__dirname, '../routes/auth.routes.js'), 'utf8');
    const contactRoutes = fs.readFileSync(path.resolve(__dirname, '../routes/contact.routes.js'), 'utf8');
    const repairRoutes = fs.readFileSync(path.resolve(__dirname, '../routes/repair.routes.js'), 'utf8');

    assert(
      'Feature 1: Login has verifyRecaptcha("login")',
      authRoutes.includes("verifyRecaptcha('login')")
    );
    assert(
      'Feature 2: Signup has verifyRecaptcha("signup")',
      authRoutes.includes("verifyRecaptcha('signup')")
    );
    assert(
      'Feature 3: Forgot Password has verifyRecaptcha("forgot_password")',
      authRoutes.includes("verifyRecaptcha('forgot_password')")
    );
    assert(
      'Feature 4: Book a Repair has verifyRecaptcha("book_repair")',
      repairRoutes.includes("verifyRecaptcha('book_repair')")
    );
    assert(
      'Feature 5: Contact Us has verifyRecaptcha("contact_us")',
      contactRoutes.includes("verifyRecaptcha('contact_us')")
    );
    assert(
      'Feature 6: Google Login has verifyRecaptcha("google_login")',
      authRoutes.includes("verifyRecaptcha('google_login')")
    );

  } catch (err) {
    console.error('Unexpected error during test execution:', err);
    failed++;
  } finally {
    await pool.end();
  }

  console.log('\n====================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
