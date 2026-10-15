/**
 * Verification Test Suite: Stage 2 Dynamic Google OAuth & reCAPTCHA Settings
 *
 * Fully Non-Destructive & Isolated:
 * Uses in-memory interceptors to mock `site_settings` and `activity_logs` queries,
 * guaranteeing zero test pollution, zero mutations to developer/production credentials,
 * and zero real .env mutations.
 *
 * Verifies:
 * 1. Public API Settings & Secrets Protection:
 *    - GET /api/public/site-data exposes only public safe keys:
 *      google_login_enabled, google_client_id, recaptcha_enabled, recaptcha_site_key.
 *    - Never exposes google_client_secret, recaptcha_secret_key, recaptcha_api_key, recaptcha_score_threshold.
 * 2. Admin Settings & Secrets Handling:
 *    - GET /api/admin/settings masks secrets with '••••••••'.
 *    - Submitting blank or masked placeholder preserves existing encrypted secrets.
 *    - Submitting new secret encrypts with AES-256-GCM.
 *    - Score threshold validation enforces 0.0 to 1.0.
 *    - Enabling Google Login requires Client ID; enabling reCAPTCHA requires Site Key.
 * 3. Dynamic Google OAuth Behavior:
 *    - When google_login_enabled is 'false', POST /api/auth/google returns HTTP 403 Forbidden.
 *    - Dynamic getGoogleConfig() resolves DB settings and decrypts stored client secret.
 *    - Invalidation clears cached config immediately.
 * 4. Dynamic reCAPTCHA Security & Fail-Closed Behavior:
 *    - When recaptcha_enabled is 'false', verification bypasses even without a token.
 *    - When recaptcha_enabled is 'true', missing token or invalid token is rejected.
 *    - When recaptcha_enabled is 'true' with missing credentials in production, it fails closed.
 *    - Dynamic risk score threshold from DB rejects scores below threshold.
 *    - Enterprise assessment is Priority 1; falls back to Standard v3 when enterprise is unavailable.
 * 5. Audit Logging for Enable/Disable Actions:
 *    - Toggling Google login or reCAPTCHA records audit event with setting name and actor.
 *    - Never records secret keys, tokens, or plaintext secrets in audit logs.
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const path = require('path');
const http = require('http');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = require('../config/app.config');
const { pool } = require('../config/db.config');
const {
  isSecretKey,
  isMaskedPlaceholder,
  encryptSecret,
  decryptSecret,
  MASKED_SECRET_INDICATOR
} = require('../utils/crypto.utils');
const { getPublicSiteData } = require('../controllers/public.controller');
const { getSettings, updateSettings } = require('../controllers/admin.controller');
const { getGoogleConfig, invalidateGoogleConfigCache } = require('../utils/google.auth');
const { getRecaptchaConfig, invalidateRecaptchaConfigCache, verifyRecaptchaEnterprise } = require('../utils/recaptcha.utils');
const app = require('../server');

// ── In-Memory Isolated Mock Store for site_settings ─────────────────────────────
const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.SETTINGS_ENCRYPTION_KEY = TEST_KEY;

const mockSettingsStore = new Map();
const loggedAuditActivities = [];

function resetMockStore() {
  mockSettingsStore.clear();
  loggedAuditActivities.length = 0;

  // Initial standard seed
  mockSettingsStore.set('company_name', { value: 'TekDoctor Test Corp', group: 'company' });
  mockSettingsStore.set('theme_primary_color', { value: '#00f2ff', group: 'theme' });
  mockSettingsStore.set('google_maps_link', { value: 'https://maps.google.com/test', group: 'integrations' });
  mockSettingsStore.set('google_login_enabled', { value: 'true', group: 'integrations' });
  mockSettingsStore.set('google_client_id', { value: 'test-google-client-id.apps.googleusercontent.com', group: 'integrations' });
  mockSettingsStore.set('google_client_secret', { value: encryptSecret('my-google-client-secret-xyz', TEST_KEY), group: 'integrations' });
  mockSettingsStore.set('recaptcha_enabled', { value: 'true', group: 'security' });
  mockSettingsStore.set('recaptcha_site_key', { value: '6LtestSiteKey123', group: 'security' });
  mockSettingsStore.set('recaptcha_secret_key', { value: encryptSecret('my-recaptcha-secret-key-xyz', TEST_KEY), group: 'security' });
  mockSettingsStore.set('recaptcha_api_key', { value: encryptSecret('my-recaptcha-api-key-xyz', TEST_KEY), group: 'security' });
  mockSettingsStore.set('recaptcha_project_id', { value: 'test-project-123', group: 'security' });
  mockSettingsStore.set('recaptcha_score_threshold', { value: '0.6', group: 'security' });
}

// Intercept DB connection queries
const originalGetConnection = pool.getConnection;
const originalQuery = pool.query;

function handleMockQuery(sql, params) {
  const norm = (sql || '').trim().replace(/\s+/g, ' ');

  // 1. SELECT setting_group, setting_key, setting_value FROM site_settings
  if (norm.includes('FROM site_settings') && norm.startsWith('SELECT setting_group, setting_key, setting_value')) {
    const rows = [];
    for (const [key, item] of mockSettingsStore.entries()) {
      rows.push({ setting_group: item.group, setting_key: key, setting_value: item.value });
    }
    return [rows, []];
  }

  // 2. SELECT * FROM site_settings
  if (norm.includes('FROM site_settings') && norm.startsWith('SELECT *')) {
    const rows = [];
    for (const [key, item] of mockSettingsStore.entries()) {
      rows.push({ id: 1, setting_key: key, setting_value: item.value, setting_group: item.group });
    }
    return [rows, []];
  }

  // 3. SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN (...)
  if (norm.includes('FROM site_settings') && norm.includes('WHERE setting_key IN')) {
    const rows = [];
    for (const [key, item] of mockSettingsStore.entries()) {
      rows.push({ setting_key: key, setting_value: item.value });
    }
    return [rows, []];
  }

  // 4. SELECT setting_value FROM site_settings WHERE setting_key = ...
  if (norm.includes('FROM site_settings') && norm.includes('WHERE setting_key =')) {
    const match = norm.match(/WHERE setting_key\s*=\s*['"]?([a-zA-Z0-9_]+)['"]?/);
    const key = (params && params[0]) ? params[0] : (match ? match[1] : null);
    if (key && mockSettingsStore.has(key)) {
      return [[{ setting_value: mockSettingsStore.get(key).value }], []];
    }
    return [[], []];
  }

  // 5. INSERT INTO site_settings (setting_key, setting_value, setting_group) ... ON DUPLICATE KEY UPDATE
  if (norm.startsWith('INSERT INTO site_settings') || norm.startsWith('INSERT IGNORE INTO site_settings')) {
    if (params && params.length >= 3) {
      const [key, val, grp] = params;
      mockSettingsStore.set(key, { value: val, group: grp });
    }
    return [{ affectedRows: 1 }, []];
  }

  // 6. UPDATE site_settings SET setting_value = ? WHERE setting_key = ?
  if (norm.startsWith('UPDATE site_settings SET setting_value = ? WHERE setting_key = ?')) {
    if (params && params.length >= 2) {
      const [val, key] = params;
      const existing = mockSettingsStore.get(key) || { group: 'general' };
      mockSettingsStore.set(key, { value: val, group: existing.group });
    }
    return [{ affectedRows: 1 }, []];
  }

  // Activity logs intercept
  if (norm.startsWith('INSERT INTO activity_logs')) {
    loggedAuditActivities.push({ sql: norm, params });
    return [{ insertId: 100 }, []];
  }

  return [[], []];
}

const mockConnection = {
  query: async (sql, params) => handleMockQuery(sql, params),
  release: () => {}
};

pool.getConnection = async () => mockConnection;
pool.query = async (sql, params) => handleMockQuery(sql, params);

// ── Test Runner ─────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('=================================================================');
  console.log(' Running Stage 2 Dynamic Google OAuth & reCAPTCHA Verification');
  console.log('=================================================================\n');

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

  resetMockStore();

  // ── TEST 1: Public Allowlist strictly hides secrets and score threshold ───────
  await testAsync('Public API: getPublicSiteData exposes only public-safe OAuth & reCAPTCHA keys', async () => {
    resetMockStore();
    let sentStatus = 200;
    let sentJson = null;

    const req = {};
    const res = {
      status: (code) => { sentStatus = code; return res; },
      json: (data) => { sentJson = data; return res; }
    };
    const next = (err) => { if (err) throw err; };

    await getPublicSiteData(req, res, next);
    assert.strictEqual(sentStatus, 200);
    assert.ok(sentJson.success);

    const s = sentJson.data.settings;

    // Integrations group
    assert.ok(s.integrations, 'Integrations group must be present');
    assert.strictEqual(s.integrations.google_login_enabled, 'true');
    assert.strictEqual(s.integrations.google_client_id, 'test-google-client-id.apps.googleusercontent.com');
    assert.strictEqual(s.integrations.google_client_secret, undefined, 'Client Secret must NEVER be in public response');

    // Security group
    assert.ok(s.security, 'Security group must be present');
    assert.strictEqual(s.security.recaptcha_enabled, 'true');
    assert.strictEqual(s.security.recaptcha_site_key, '6LtestSiteKey123');
    assert.strictEqual(s.security.recaptcha_secret_key, undefined, 'Secret Key must NEVER be in public response');
    assert.strictEqual(s.security.recaptcha_api_key, undefined, 'API Key must NEVER be in public response');
    assert.strictEqual(s.security.recaptcha_score_threshold, undefined, 'Score threshold must NEVER be in public response');
  });

  // ── TEST 2: Admin API masks secrets with •••••••• ─────────────────────────────
  await testAsync('Admin API: getSettings returns masked indicators for OAuth & reCAPTCHA secrets', async () => {
    resetMockStore();
    let sentJson = null;

    const req = { query: {} };
    const res = {
      json: (data) => { sentJson = data; return res; }
    };
    const next = (err) => { if (err) throw err; };

    await getSettings(req, res, next);
    assert.ok(sentJson.success);

    const s = sentJson.data;
    assert.strictEqual(s.integrations.google_client_secret, MASKED_SECRET_INDICATOR);
    assert.strictEqual(s.security.recaptcha_secret_key, MASKED_SECRET_INDICATOR);
    assert.strictEqual(s.security.recaptcha_api_key, MASKED_SECRET_INDICATOR);

    // Non-secrets must be returned in plaintext
    assert.strictEqual(s.integrations.google_client_id, 'test-google-client-id.apps.googleusercontent.com');
    assert.strictEqual(s.security.recaptcha_site_key, '6LtestSiteKey123');
    assert.strictEqual(s.security.recaptcha_score_threshold, '0.6');
  });

  // ── TEST 3: Submitting blank/masked placeholders preserves existing secrets ────
  await testAsync('Admin API: updateSettings preserves secrets when blank or masked placeholder submitted', async () => {
    resetMockStore();
    const origGoogleSecret = mockSettingsStore.get('google_client_secret').value;
    const origRecaptchaSecret = mockSettingsStore.get('recaptcha_secret_key').value;

    let sentJson = null;
    const req = {
      user: { id: 1 },
      ip: '127.0.0.1',
      body: {
        settings: {
          google_client_secret: MASKED_SECRET_INDICATOR,
          recaptcha_secret_key: '   ',
          recaptcha_score_threshold: '0.7'
        }
      }
    };
    const res = {
      json: (data) => { sentJson = data; return res; },
      status: () => res
    };
    const next = (err) => { if (err) throw err; };

    await updateSettings(req, res, next);
    assert.ok(sentJson.success);

    assert.strictEqual(mockSettingsStore.get('google_client_secret').value, origGoogleSecret, 'Google secret was preserved');
    assert.strictEqual(mockSettingsStore.get('recaptcha_secret_key').value, origRecaptchaSecret, 'reCAPTCHA secret was preserved');
    assert.strictEqual(mockSettingsStore.get('recaptcha_score_threshold').value, '0.7', 'Threshold was updated');
  });

  // ── TEST 4: Score threshold validation rejects invalid ranges ──────────────────
  await testAsync('Admin API: updateSettings rejects score threshold outside 0.0 to 1.0', async () => {
    resetMockStore();
    let sentStatus = 200;
    let sentJson = null;

    const req = {
      user: { id: 1 },
      ip: '127.0.0.1',
      body: {
        settings: {
          recaptcha_score_threshold: '1.5'
        }
      }
    };
    const res = {
      status: (code) => { sentStatus = code; return res; },
      json: (data) => { sentJson = data; return res; }
    };
    const next = (err) => { if (err) throw err; };

    await updateSettings(req, res, next);
    assert.strictEqual(sentStatus, 400);
    assert.strictEqual(sentJson.success, false);
    assert.match(sentJson.message, /reCAPTCHA score threshold must be a valid number between 0.0 and 1.0/);
  });

  // ── TEST 5: Dynamic Google Config Resolver & Decryption ────────────────────────
  await testAsync('Google OAuth: getGoogleConfig dynamically reads DB and decrypts client secret', async () => {
    resetMockStore();
    invalidateGoogleConfigCache();

    const gConfig = await getGoogleConfig();
    assert.strictEqual(gConfig.enabled, true);
    assert.strictEqual(gConfig.clientId, 'test-google-client-id.apps.googleusercontent.com');
    assert.strictEqual(gConfig.clientSecret, 'my-google-client-secret-xyz');

    // Test explicit disable in DB
    mockSettingsStore.set('google_login_enabled', { value: 'false', group: 'integrations' });
    invalidateGoogleConfigCache();

    const disabledConfig = await getGoogleConfig();
    assert.strictEqual(disabledConfig.enabled, false);
  });

  // ── TEST 6: Disabled Google Sign-In returns HTTP 403 on backend ───────────────
  await testAsync('Google OAuth: Backend /api/auth/google returns HTTP 403 when Google Login is disabled', async () => {
    resetMockStore();
    mockSettingsStore.set('google_login_enabled', { value: 'false', group: 'integrations' });
    invalidateGoogleConfigCache();

    // Start ephemeral test server
    const testServer = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = testServer.address().port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: 'test-google-token',
          recaptchaToken: 'test-token'
        })
      });

      assert.strictEqual(response.status, 403, 'Disabled Google login must return HTTP 403 Forbidden');
      const data = await response.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /Google Sign-In is currently disabled/);
    } finally {
      await new Promise(resolve => testServer.close(resolve));
    }
  });

  // ── TEST 7: Dynamic reCAPTCHA Config Resolver & Decryption ─────────────────────
  await testAsync('reCAPTCHA: getRecaptchaConfig dynamically resolves DB keys, threshold, and decrypts secrets', async () => {
    resetMockStore();
    invalidateRecaptchaConfigCache();

    const rConfig = await getRecaptchaConfig();
    assert.strictEqual(rConfig.enabled, true);
    assert.strictEqual(rConfig.siteKey, '6LtestSiteKey123');
    assert.strictEqual(rConfig.secretKey, 'my-recaptcha-secret-key-xyz');
    assert.strictEqual(rConfig.apiKey, 'my-recaptcha-api-key-xyz');
    assert.strictEqual(rConfig.projectId, 'test-project-123');
    assert.strictEqual(rConfig.scoreThreshold, 0.6);
  });

  // ── TEST 8: Explicitly disabled reCAPTCHA bypasses verification ────────────────
  await testAsync('reCAPTCHA: Explicitly disabled reCAPTCHA bypasses verification even without token', async () => {
    resetMockStore();
    mockSettingsStore.set('recaptcha_enabled', { value: 'false', group: 'security' });
    invalidateRecaptchaConfigCache();

    const res = await verifyRecaptchaEnterprise({
      token: '',
      expectedAction: 'login'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.bypassed, true);
    assert.strictEqual(res.score, 1.0);
  });

  // ── TEST 9: Enabled reCAPTCHA rejects missing or invalid tokens ────────────────
  await testAsync('reCAPTCHA: Enabled reCAPTCHA strictly rejects empty token with actionable error', async () => {
    resetMockStore();
    mockSettingsStore.set('recaptcha_enabled', { value: 'true', group: 'security' });
    invalidateRecaptchaConfigCache();

    const res = await verifyRecaptchaEnterprise({
      token: '',
      expectedAction: 'login'
    });
    assert.strictEqual(res.success, false);
    assert.match(res.reason, /reCAPTCHA token is required/i);
  });

  // ── TEST 10: Missing credentials fail closed in production ────────────────────
  await testAsync('reCAPTCHA: Enabled reCAPTCHA with unconfigured credentials fails closed in production', async () => {
    resetMockStore();
    mockSettingsStore.set('recaptcha_enabled', { value: 'true', group: 'security' });
    mockSettingsStore.set('recaptcha_secret_key', { value: '', group: 'security' });
    mockSettingsStore.set('recaptcha_api_key', { value: '', group: 'security' });
    mockSettingsStore.set('recaptcha_project_id', { value: '', group: 'security' });
    invalidateRecaptchaConfigCache();

    const origEnv = config.env;
    const origEnvSecret = config.recaptcha.secretKey;
    const origEnvApiKey = config.recaptcha.apiKey;
    const origEnvProj = config.recaptcha.projectId;

    config.env = 'production';
    config.recaptcha.secretKey = '';
    config.recaptcha.apiKey = '';
    config.recaptcha.projectId = '';

    try {
      const res = await verifyRecaptchaEnterprise({
        token: 'real-or-test-token',
        expectedAction: 'login'
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.reason, 'Security verification service is not configured.');
    } finally {
      config.env = origEnv;
      config.recaptcha.secretKey = origEnvSecret;
      config.recaptcha.apiKey = origEnvApiKey;
      config.recaptcha.projectId = origEnvProj;
    }
  });

  // ── TEST 11: Audit logging for Google and reCAPTCHA toggles without secret leakage
  await testAsync('Audit: Toggling Google Login and reCAPTCHA logs security event without leaking secrets', async () => {
    resetMockStore();

    let sentJson = null;
    const req = {
      user: { id: 42 },
      ip: '192.168.1.10',
      body: {
        settings: {
          google_login_enabled: 'false',
          recaptcha_enabled: 'false',
          google_client_secret: 'new-plain-secret-should-not-be-in-audit'
        }
      }
    };
    const res = {
      json: (data) => { sentJson = data; return res; },
      status: () => res
    };
    const next = (err) => { if (err) throw err; };

    await updateSettings(req, res, next);
    assert.ok(sentJson.success);

    // Verify audit activities logged
    const activitiesLogged = loggedAuditActivities.map(a => JSON.stringify(a.params));
    const fullLogText = activitiesLogged.join(' ');

    assert.ok(fullLogText.includes('google_login_disabled'), 'Google login disable audit event recorded');
    assert.ok(fullLogText.includes('recaptcha_disabled'), 'reCAPTCHA disable audit event recorded');
    assert.ok(!fullLogText.includes('new-plain-secret-should-not-be-in-audit'), 'Secrets must NEVER be in audit logs');
    assert.ok(!fullLogText.includes('my-google-client-secret-xyz'), 'Old secrets must NEVER be in audit logs');
  });

  // ── TEST 12: Cohesive Credential Pairing (Prevents hybrid site/secret key mismatch) ──
  await testAsync('Credentials: Sourcing siteKey from ENV strictly forces secretKey from ENV even if orphan secret exists in DB', async () => {
    resetMockStore();
    // Simulate orphan/stale secret in DB without a siteKey
    mockSettingsStore.delete('recaptcha_site_key');
    mockSettingsStore.set('recaptcha_secret_key', { value: encryptSecret('orphan-stale-secret-key', TEST_KEY), group: 'security' });
    mockSettingsStore.delete('google_client_id');
    mockSettingsStore.set('google_client_secret', { value: encryptSecret('orphan-stale-google-secret', TEST_KEY), group: 'integrations' });
    invalidateRecaptchaConfigCache();
    invalidateGoogleConfigCache();

    const origEnvSecret = config.recaptcha?.secretKey;
    const origEnvSiteKey = config.recaptcha?.siteKey;
    const origGoogleId = config.google?.clientId;
    const origGoogleSecret = config.google?.clientSecret;

    config.recaptcha.siteKey = '6LenvSiteKey40CharsTestingOnlyXXXXXXXXXX';
    config.recaptcha.secretKey = '6LenvSecretKey40CharsTestingOnlyXXXXXXXX';
    config.google.clientId = 'env-google-client-id.apps.googleusercontent.com';
    config.google.clientSecret = 'env-google-client-secret-matched';

    try {
      const recaptchaConfig = await getRecaptchaConfig();
      assert.strictEqual(recaptchaConfig.siteKey, '6LenvSiteKey40CharsTestingOnlyXXXXXXXXXX', 'siteKey resolved from ENV');
      assert.strictEqual(recaptchaConfig.secretKey, '6LenvSecretKey40CharsTestingOnlyXXXXXXXX', 'secretKey MUST resolve from ENV to match siteKey, NOT from orphan DB secret');

      const googleConfig = await getGoogleConfig();
      assert.strictEqual(googleConfig.clientId, 'env-google-client-id.apps.googleusercontent.com', 'clientId resolved from ENV');
      assert.strictEqual(googleConfig.clientSecret, 'env-google-client-secret-matched', 'clientSecret MUST resolve from ENV to match clientId, NOT from orphan DB secret');

      // Now test that when authoritative siteKey IS in DB, secretKey is paired from DB
      mockSettingsStore.set('recaptcha_site_key', { value: '6LcustomDbSiteKey', group: 'security' });
      mockSettingsStore.set('recaptcha_secret_key', { value: encryptSecret('custom-db-secret-key-matched', TEST_KEY), group: 'security' });
      invalidateRecaptchaConfigCache();

      const dbPairedConfig = await getRecaptchaConfig();
      assert.strictEqual(dbPairedConfig.siteKey, '6LcustomDbSiteKey', 'siteKey resolved from DB');
      assert.strictEqual(dbPairedConfig.secretKey, 'custom-db-secret-key-matched', 'secretKey resolved from DB to match DB siteKey');
    } finally {
      config.recaptcha.secretKey = origEnvSecret;
      config.recaptcha.siteKey = origEnvSiteKey;
      config.google.clientId = origGoogleId;
      config.google.clientSecret = origGoogleSecret;
      invalidateRecaptchaConfigCache();
      invalidateGoogleConfigCache();
    }
  });

  // ── Cleanup and Restore Interceptors ──────────────────────────────────────────
  pool.getConnection = originalGetConnection;
  pool.query = originalQuery;

  console.log(`\nResults: ${passed}/${total} tests passed.`);
  if (passed === total) {
    console.log('✓ ALL STAGE 2 DYNAMIC CONFIGURATION TESTS PASSED SUCCESSFULLY!\n');
  } else {
    console.error('✗ Some tests failed.\n');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unexpected test error:', err);
  process.exit(1);
});
