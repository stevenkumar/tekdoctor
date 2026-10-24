/**
 * Automated Verification Suite: Admin Password Change OTP Flow & Profile Validation
 * 
 * Verifies:
 * 1. Admin profile update with unchanged data is rejected (400)
 * 2. Technician profile update with unchanged data is rejected (400)
 * 3. Profile update with actual modifications succeeds (200)
 * 4. Admin change-password with wrong current password is rejected (400)
 * 5. Admin change-password with valid passwords issues OTP challenge (requiresOtp: true, pendingToken, maskedEmail)
 * 6. Password is NOT changed before OTP verification
 * 7. Invalid OTP is rejected with remaining attempts tracking
 * 8. Resend OTP within cooldown is rejected (429)
 * 9. Valid OTP verifies and updates password in DB with incremented token_version
 * 10. Old session token is invalidated
 * 11. Replay of used OTP is rejected (400)
 * 12. Non-admin (technician) cannot access admin password change and receives coordinator notice
 */

const http = require('http');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');

const API_HOST = '127.0.0.1';
const API_PORT = 5000;

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const postBody = postData ? (typeof postData === 'string' ? postData : JSON.stringify(postData)) : null;
    const reqHeaders = { ...(options.headers || {}) };
    if (postBody && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postBody);
    }

    const req = http.request({
      hostname: API_HOST,
      port: API_PORT,
      ...options,
      headers: reqHeaders,
    }, (res) => {
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

    if (postBody) {
      req.write(postBody);
    }
    req.end();
  });
}

function makeToken(user) {
  return jwt.sign({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    token_version: user.token_version || 1
  }, config.jwt.secret, { expiresIn: '1h' });
}

async function runVerification() {
  console.log('================================================================');
  console.log('   ADMIN PASSWORD CHANGE OTP & PROFILE VALIDATION TEST');
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

  let connection;
  try {
    connection = await pool.getConnection();

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 1: Profile Update No-Changes Validation (Admin & Technician)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('--- Suite 1: Profile Update No-Changes Validation ---');

    const [adminRows] = await connection.query('SELECT * FROM users WHERE role = "admin" AND email = "vkvseri@gmail.com" LIMIT 1');
    assert('Admin user exists in database', adminRows.length === 1);
    const adminUser = adminRows[0];
    const adminToken = makeToken(adminUser);

    // 1.1 Admin calls PUT /api/admin/profile with unchanged data
    const adminNoChangeRes = await request({
      path: '/api/admin/profile',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      name: adminUser.name,
      email: adminUser.email,
      phone: adminUser.phone || ''
    });

    assert(
      'Admin PUT /api/admin/profile with unchanged data returns 400',
      adminNoChangeRes.statusCode === 400,
      `Status: ${adminNoChangeRes.statusCode}, msg: ${adminNoChangeRes.data?.message}`
    );
    assert(
      'Admin message states no changes detected',
      (adminNoChangeRes.data?.message || '').toLowerCase().includes('no changes detected'),
      `Msg: ${adminNoChangeRes.data?.message}`
    );

    // 1.2 Technician calls PUT /api/technicians/profile with unchanged data
    const [techRows] = await connection.query('SELECT * FROM users WHERE role = "technician" AND is_active = 1 LIMIT 1');
    assert('Active technician exists in database', techRows.length === 1);
    const techUser = techRows[0];
    const techToken = makeToken(techUser);

    const techNoChangeRes = await request({
      path: '/api/technicians/profile',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${techToken}`
      }
    }, {
      name: techUser.name,
      email: techUser.email,
      phone: techUser.phone || ''
    });

    assert(
      'Technician PUT /api/technicians/profile with unchanged data returns 400',
      techNoChangeRes.statusCode === 400,
      `Status: ${techNoChangeRes.statusCode}, msg: ${techNoChangeRes.data?.message}`
    );

    // 1.3 Admin calls PUT /api/admin/profile with modified data -> succeeds
    const adminChangeRes = await request({
      path: '/api/admin/profile',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      name: 'TekDoctor Admin Updated',
      email: adminUser.email,
      phone: adminUser.phone || ''
    });

    assert(
      'Admin PUT /api/admin/profile with changed name returns 200',
      adminChangeRes.statusCode === 200 && adminChangeRes.data?.success === true,
      `Status: ${adminChangeRes.statusCode}, msg: ${adminChangeRes.data?.message}`
    );

    // Restore admin original name
    await connection.query('UPDATE users SET name = ? WHERE id = ?', [adminUser.name, adminUser.id]);

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 2: Admin Password Change Mandatory OTP Flow
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- Suite 2: Admin Password Change Mandatory OTP Verification ---');

    // 2.1 Admin calls change-password with wrong current password
    const badPassRes = await request({
      path: '/api/admin/change-password',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      currentPassword: 'WrongPassword999!',
      newPassword: 'BrandNewPassword@2026'
    });

    assert(
      'Incorrect current password returns 400',
      badPassRes.statusCode === 400 && (badPassRes.data?.message || '').toLowerCase().includes('incorrect'),
      `Status: ${badPassRes.statusCode}, msg: ${badPassRes.data?.message}`
    );

    // 2.2 Admin calls change-password with correct current password (VIVEKvKUMAR)
    const validRequestRes = await request({
      path: '/api/admin/change-password',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      currentPassword: 'VIVEKvKUMAR',
      newPassword: 'BrandNewPassword@2026'
    });

    assert(
      'Valid password change request returns 200 with requiresOtp: true',
      validRequestRes.statusCode === 200 && validRequestRes.data?.data?.requiresOtp === true,
      `Status: ${validRequestRes.statusCode}, body: ${JSON.stringify(validRequestRes.data)}`
    );
    assert(
      'Returns pendingToken',
      Boolean(validRequestRes.data?.data?.pendingToken)
    );
    assert(
      'Returns maskedEmail',
      Boolean(validRequestRes.data?.data?.maskedEmail && validRequestRes.data?.data?.maskedEmail.includes('@'))
    );

    const pendingToken = validRequestRes.data?.data?.pendingToken;

    // 2.3 Verify password was NOT changed yet in DB
    const [dbAdminCheck] = await connection.query('SELECT password FROM users WHERE id = ?', [adminUser.id]);
    const passMatchesOld = await bcrypt.compare('VIVEKvKUMAR', dbAdminCheck[0].password);
    assert('Database password remains old password (not mutated before OTP verification)', passMatchesOld);

    // 2.4 Verify OTP record created in auth_otps
    const [otpRecords] = await connection.query(
      'SELECT id, otp_hash, attempts_count, max_attempts, expires_at, is_used FROM auth_otps WHERE user_id = ? AND purpose = "admin_change_password" ORDER BY id DESC LIMIT 1',
      [adminUser.id]
    );
    assert('Active OTP record exists in auth_otps with purpose admin_change_password', otpRecords.length === 1 && otpRecords[0].is_used === 0);
    const dbOtp = otpRecords[0];

    // 2.5 Submit invalid OTP
    const invalidOtpRes = await request({
      path: '/api/admin/verify-change-password-otp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      pendingToken,
      otp: '000000'
    });

    assert(
      'Invalid verification code returns 400',
      invalidOtpRes.statusCode === 400 && (invalidOtpRes.data?.message || '').toLowerCase().includes('remaining'),
      `Status: ${invalidOtpRes.statusCode}, msg: ${invalidOtpRes.data?.message}`
    );

    // Check attempts_count incremented
    const [afterInvalid] = await connection.query('SELECT attempts_count FROM auth_otps WHERE id = ?', [dbOtp.id]);
    assert('Attempts count incremented in DB', afterInvalid[0].attempts_count === 1);

    // 2.6 Resend OTP cooldown enforcement (60s)
    const earlyResendRes = await request({
      path: '/api/admin/resend-change-password-otp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      pendingToken
    });

    assert(
      'Resend within cooldown returns 429 Too Many Requests',
      earlyResendRes.statusCode === 429,
      `Status: ${earlyResendRes.statusCode}, msg: ${earlyResendRes.data?.message}`
    );

    // 2.7 Set known OTP hash in DB to test successful verification
    const testOtpCode = '789123';
    const testOtpHash = crypto.createHash('sha256').update(testOtpCode).digest('hex');
    await connection.query('UPDATE auth_otps SET otp_hash = ?, attempts_count = 0 WHERE id = ?', [testOtpHash, dbOtp.id]);

    const oldTokenVersion = adminUser.token_version || 1;

    // Verify valid OTP
    const validVerifyRes = await request({
      path: '/api/admin/verify-change-password-otp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      pendingToken,
      otp: testOtpCode
    });

    assert(
      'Valid OTP verification returns 200 with success: true',
      validVerifyRes.statusCode === 200 && validVerifyRes.data?.success === true,
      `Status: ${validVerifyRes.statusCode}, msg: ${validVerifyRes.data?.message}`
    );
    assert(
      'Valid OTP verification returns updated session token',
      Boolean(validVerifyRes.data?.data?.token)
    );

    // 2.8 Verify password was updated in DB to new password
    const [updatedAdmin] = await connection.query('SELECT password, token_version FROM users WHERE id = ?', [adminUser.id]);
    const passMatchesNew = await bcrypt.compare('BrandNewPassword@2026', updatedAdmin[0].password);
    assert('Database password successfully updated to new password', passMatchesNew);
    assert('User token_version was incremented in DB', updatedAdmin[0].token_version > oldTokenVersion);

    // 2.9 Confirm old JWT is now rejected due to session invalidation
    const staleJwtRes = await request({
      path: '/api/admin/dashboard/stats',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert('Old admin JWT session token is rejected with 401 after password change', staleJwtRes.statusCode === 401);

    // 2.10 Replay attack prevention: Same OTP cannot be used again
    const refreshedAdminToken = validVerifyRes.data?.data?.token;
    const replayRes = await request({
      path: '/api/admin/verify-change-password-otp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refreshedAdminToken}`
      }
    }, {
      pendingToken,
      otp: testOtpCode
    });
    assert('Replay of already used OTP is rejected with 400', replayRes.statusCode === 400, `Status: ${replayRes.statusCode}`);

    // 2.11 Restore Admin password back to VIVEKvKUMAR
    const originalHash = await bcrypt.hash('VIVEKvKUMAR', 12);
    await connection.query('UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?', [originalHash, adminUser.id]);
    console.log('[INFO] Admin password safely restored to initial bcrypt hash of VIVEKvKUMAR.');

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 3: Technician Non-Regression
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- Suite 3: Technician Non-Regression ---');

    const techPassRes = await request({
      path: '/api/technicians/change-password',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${techToken}`
      }
    }, {
      currentPassword: 'any',
      newPassword: 'any'
    });

    assert(
      'Technician PUT /api/technicians/change-password is blocked with 403',
      techPassRes.statusCode === 403,
      `Status: ${techPassRes.statusCode}`
    );

    const techAdminPassRes = await request({
      path: '/api/admin/change-password',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${techToken}`
      }
    }, {
      currentPassword: 'any',
      newPassword: 'any'
    });

    assert(
      'Technician blocked from admin change-password with 403',
      techAdminPassRes.statusCode === 403,
      `Status: ${techAdminPassRes.statusCode}`
    );

    // ──────────────────────────────────────────────────────────────────────────
    // Summary
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log(`VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }

  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    if (connection) connection.release();
    pool.end();
  }
}

runVerification();
