/**
 * Verification Test Suite: Google reCAPTCHA Integration & Recovery
 *
 * Verifies:
 * 1. Unit verification of verifyRecaptchaEnterprise logic:
 *    - Token presence check (missing token returns failure with clear reason)
 *    - Non-production / test-mode test token acceptance (score 1.0, testMode: true)
 *    - Support for all 6 target action identifiers
 *    - Graceful bypass when RECAPTCHA_ENABLED=false (even with missing token)
 *    - Graceful bypass in development when unconfigured
 * 2. API Endpoints Protection (All 6 target endpoints):
 *    - POST /api/auth/signin (action: 'login')
 *    - POST /api/auth/signup (action: 'signup')
 *    - POST /api/auth/forgot-password (action: 'forgot_password')
 *    - POST /api/auth/google (action: 'google_login')
 *    - POST /api/contact (action: 'contact_us')
 *    - POST /api/repair-request (action: 'book_repair')
 * 3. Enforces that missing tokens are rejected with 400 Bad Request
 * 4. Enforces that valid test tokens pass reCAPTCHA and proceed to controllers/validators
 * 5. Verifies that public/unprotected routes remain accessible without tokens
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const path = require('path');
const http = require('http');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = require('../config/app.config');
const { pool } = require('../config/db.config');
const { verifyRecaptchaEnterprise } = require('../utils/recaptcha.utils');
const app = require('../server');

async function runTests() {
  console.log('====================================================');
  console.log(' Running Google reCAPTCHA & Auth Verification Tests');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}: ${err.message}`);
    }
  }

  // ── TEST GROUP 1: Unit Logic & Bypass Verification ────────────────────────────

  await testAsync('Unit: Missing token returns failure with clear reason', async () => {
    const res = await verifyRecaptchaEnterprise({
      token: '',
      expectedAction: 'login'
    });
    assert.strictEqual(res.success, false);
    assert.match(res.reason, /reCAPTCHA token is required/i);
  });

  await testAsync('Unit: Test-token in test/dev environment succeeds with score 1.0', async () => {
    const res = await verifyRecaptchaEnterprise({
      token: 'test-token',
      expectedAction: 'login'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.score, 1.0);
    assert.strictEqual(res.testMode, true);
  });

  await testAsync('Unit: Test-token for all 6 target actions works correctly', async () => {
    const actions = ['login', 'signup', 'forgot_password', 'google_login', 'contact_us', 'book_repair'];
    for (const action of actions) {
      const res = await verifyRecaptchaEnterprise({
        token: 'test-token',
        expectedAction: action
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.score, 1.0);
    }
  });

  await testAsync('Unit: When reCAPTCHA is disabled, verification bypasses even with missing token', async () => {
    const originalEnabled = config.recaptcha.enabled;
    config.recaptcha.enabled = false;
    try {
      const res = await verifyRecaptchaEnterprise({
        token: '',
        expectedAction: 'login'
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.bypassed, true);
      assert.strictEqual(res.score, 1.0);
    } finally {
      config.recaptcha.enabled = originalEnabled;
    }
  });

  await testAsync('Unit: Unconfigured credentials in dev/test bypasses safely', async () => {
    const origSecret = config.recaptcha.secretKey;
    const origProj = config.recaptcha.projectId;
    const origApi = config.recaptcha.apiKey;
    config.recaptcha.secretKey = '';
    config.recaptcha.projectId = '';
    config.recaptcha.apiKey = '';
    try {
      const res = await verifyRecaptchaEnterprise({
        token: '',
        expectedAction: 'login'
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.bypassed, true);
    } finally {
      config.recaptcha.secretKey = origSecret;
      config.recaptcha.projectId = origProj;
      config.recaptcha.apiKey = origApi;
    }
  });

  // ── TEST GROUP 2: API Endpoints & Middleware Protection ───────────────────────

  // Start in-process ephemeral test server
  const testServer = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = testServer.address().port;
  const API_BASE = `http://127.0.0.1:${port}/api`;

  const postJson = async (endpoint, body) => {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };

  try {
    // 1. POST /api/auth/signin
    await testAsync('API: /api/auth/signin rejects missing token with 400', async () => {
      const res = await postJson('/auth/signin', {
        email: 'user@example.com',
        password: 'Password123!'
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data?.success, false);
      assert.match(res.data?.message, /reCAPTCHA token is required/i);
    });

    await testAsync('API: /api/auth/signin passes reCAPTCHA with valid test-token and reaches validator', async () => {
      const res = await postJson('/auth/signin', {
        email: 'invalid-email',
        password: 'Password123!',
        recaptchaToken: 'test-token'
      });
      assert.strictEqual(res.status, 400);
      assert.notStrictEqual(res.data?.message, 'reCAPTCHA token is required.');
      assert.match(res.data?.message, /valid email address/i);
    });

    // 2. POST /api/auth/signup
    await testAsync('API: /api/auth/signup rejects missing token with 400', async () => {
      const res = await postJson('/auth/signup', {
        name: 'New User',
        email: 'newuser@example.com',
        password: 'Password123!'
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data?.success, false);
      assert.match(res.data?.message, /reCAPTCHA token is required/i);
    });

    await testAsync('API: /api/auth/signup passes reCAPTCHA with test-token and reaches validator', async () => {
      const res = await postJson('/auth/signup', {
        name: 'New User',
        email: 'invalid-email',
        password: 'weak',
        recaptchaToken: 'test-token'
      });
      assert.strictEqual(res.status, 400);
      assert.notStrictEqual(res.data?.message, 'reCAPTCHA token is required.');
      assert.ok(res.data?.errors, 'Validation errors should be returned');
    });

    // 3. POST /api/auth/forgot-password
    await testAsync('API: /api/auth/forgot-password rejects missing token with 400', async () => {
      const res = await postJson('/auth/forgot-password', {
        email: 'user@example.com'
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data?.success, false);
      assert.match(res.data?.message, /reCAPTCHA token is required/i);
    });

    await testAsync('API: /api/auth/forgot-password passes reCAPTCHA with test-token', async () => {
      const res = await postJson('/auth/forgot-password', {
        email: 'invalid-email',
        recaptchaToken: 'test-token'
      });
      assert.strictEqual(res.status, 400);
      assert.notStrictEqual(res.data?.message, 'reCAPTCHA token is required.');
      assert.match(res.data?.message, /valid email/i);
    });

    // 4. POST /api/auth/google
    await testAsync('API: /api/auth/google rejects missing token with 400', async () => {
      const res = await postJson('/auth/google', {
        code: 'dummy-google-auth-code'
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data?.success, false);
      assert.match(res.data?.message, /reCAPTCHA token is required/i);
    });

    await testAsync('API: /api/auth/google passes reCAPTCHA with test-token and validates OAuth request', async () => {
      const res = await postJson('/auth/google', {
        code: 'dummy-google-auth-code',
        recaptchaToken: 'test-token'
      });
      assert.notStrictEqual(res.data?.message, 'reCAPTCHA token is required.');
      assert.ok(res.status === 400 || res.status === 401);
    });

    // 5. POST /api/contact
    await testAsync('API: /api/contact rejects missing token with 400', async () => {
      const res = await postJson('/contact', {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '9876543210',
        message: 'Inquiry message.'
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data?.success, false);
      assert.match(res.data?.message, /reCAPTCHA token is required/i);
    });

    await testAsync('API: /api/contact passes reCAPTCHA with test-token and validates fields', async () => {
      const res = await postJson('/contact', {
        name: '',
        email: 'invalid',
        phone: '123',
        message: '',
        recaptchaToken: 'test-token'
      });
      assert.strictEqual(res.status, 400);
      assert.notStrictEqual(res.data?.message, 'reCAPTCHA token is required.');
      assert.ok(res.data?.errors, 'Form validation errors returned');
    });

    // 6. POST /api/repair-request
    await testAsync('API: /api/repair-request rejects missing token with 400', async () => {
      const res = await postJson('/repair-request', {
        customerName: 'Customer',
        mobile: '9876543210',
        problemType: 'Screen'
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data?.success, false);
      assert.match(res.data?.message, /reCAPTCHA token is required/i);
    });

    await testAsync('API: /api/repair-request passes reCAPTCHA with test-token and validates fields', async () => {
      const res = await postJson('/repair-request', {
        customerName: '',
        mobile: '123',
        problemType: '',
        recaptchaToken: 'test-token'
      });
      assert.strictEqual(res.status, 400);
      assert.notStrictEqual(res.data?.message, 'reCAPTCHA token is required.');
    });

    // ── TEST GROUP 3: Unprotected Routes ──────────────────────────────────────────

    await testAsync('API: /health is accessible without reCAPTCHA', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.notStrictEqual(res.status, 400);
      assert.notStrictEqual(res.status, 403);
    });

  } finally {
    await new Promise((resolve) => testServer.close(resolve));
    await pool.end().catch(() => {});
  }

  console.log(`\nResults: ${passed}/${total} tests passed.`);
  if (passed === total) {
    console.log('✓ ALL RECAPTCHA & AUTH INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } else {
    console.error('✗ Some tests failed.');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  pool.end().catch(() => {});
  process.exit(1);
});
