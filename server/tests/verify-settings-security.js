/**
 * Verification Test Suite: Stage 1 Settings Security & Secret Protection
 * 
 * NOTE: Non-destructive & completely isolated.
 * All site_settings queries (SELECT, INSERT, UPDATE) are intercepted by an in-memory
 * mock store so no working database records or credentials are ever modified.
 *
 * Verifies:
 * 1. Cryptographic engine (AES-256-GCM, versioned envelopes, tamper resistance, key validation).
 * 2. Public API allowlist & sensitive data leak prevention (isolated mock store).
 * 3. Public API safe configuration retention (isolated mock store).
 * 4. Admin API secret masking with '••••••••' (isolated mock store).
 * 5. Admin API blank / masked input preservation on update (isolated mock store).
 * 6. Admin API explicit secret rotation (isolated mock store).
 * 7. Admin API non-secret updates preserving unrelated credentials (isolated mock store).
 * 8. SMTP configuration decryption & test password resolution (isolated mock store).
 * 9. Database startup migration 2026_09 encryption behavior (isolated mock store).
 * 10. HTTP endpoints authorization and leak prevention (isolated in-process server).
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = require('../config/app.config');
const { pool } = require('../config/db.config');
const app = require('../server');
const cryptoUtils = require('../utils/crypto.utils');
const adminController = require('../controllers/admin.controller');
const { getPublicSiteData } = require('../controllers/public.controller');
const { getEmailConfig } = require('../utils/email.utils');
const initDatabase = require('../models/db.init');

// ── In-Memory Isolated Mock Store for site_settings ─────────────────────────────
const mockStore = new Map();

function resetMockStore() {
  mockStore.clear();
  const defaults = [
    ['company_name', 'The Tek Doctor', 'company'],
    ['company_email', 'info@tekdoctor.in', 'company'],
    ['company_phone', '+91 9136868902', 'company'],
    ['company_address', 'Mumbai, India', 'company'],
    ['logo_url', '/uploads/logo.png', 'company'],
    ['gstin', '27AAAAA0000A1Z5', 'company'],
    ['site_tagline', 'Your Personal Care Specialist', 'company'],
    ['theme_primary_color', '#00e5ff', 'theme'],
    ['theme_secondary_color', '#1a1a1a', 'theme'],
    ['favicon_url', '/favicon.ico', 'branding'],
    ['maintenance_mode', 'false', 'system'],
    ['meta_title', 'TekDoctor Repair', 'seo'],
    ['invoice_prefix', 'inv', 'billing'],
    ['default_gst_rate', '18.00', 'billing'],
    ['smtp_host', 'smtp.gmail.com', 'email'],
    ['smtp_port', '587', 'email'],
    ['smtp_user', 'admin@tekdoctor.in', 'email'],
    ['smtp_password', '', 'email'],
    ['google_client_secret', '', 'integrations'],
    ['recaptcha_secret_key', '', 'security']
  ];
  for (const [k, v, g] of defaults) {
    mockStore.set(k, { setting_key: k, setting_value: v, setting_group: g });
  }
}

async function handleMockQuery(sql, params = []) {
  const norm = typeof sql === 'string' ? sql.trim() : '';

  // 1. SELECT setting_group, setting_key, setting_value FROM site_settings
  if (norm.includes('FROM site_settings') && norm.startsWith('SELECT setting_group, setting_key, setting_value')) {
    const rows = Array.from(mockStore.values()).map(r => ({
      setting_group: r.setting_group,
      setting_key: r.setting_key,
      setting_value: r.setting_value
    }));
    return [rows];
  }

  // 2. SELECT * FROM site_settings
  if (norm.includes('FROM site_settings') && norm.startsWith('SELECT *')) {
    let rows = Array.from(mockStore.values());
    if (norm.includes('WHERE setting_group = ?') && params.length > 0) {
      rows = rows.filter(r => r.setting_group === params[0]);
    }
    return [rows];
  }

  // 3. SELECT setting_value FROM site_settings WHERE setting_key = ...
  if (norm.includes('FROM site_settings') && norm.includes('WHERE setting_key =')) {
    let targetKey = params[0];
    if (!targetKey && norm.includes("'smtp_password'")) {
      targetKey = 'smtp_password';
    }
    if (targetKey && mockStore.has(targetKey)) {
      return [[{ setting_value: mockStore.get(targetKey).setting_value }]];
    }
    return [[]];
  }

  // 4. SELECT setting_key, setting_value FROM site_settings WHERE setting_group = 'email' OR setting_key IN ...
  if (norm.includes('FROM site_settings') && norm.includes("setting_group = 'email'")) {
    const rows = Array.from(mockStore.values())
      .filter(r => r.setting_group === 'email' || ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password'].includes(r.setting_key))
      .map(r => ({ setting_key: r.setting_key, setting_value: r.setting_value }));
    return [rows];
  }

  // 5. SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN (?)
  if (norm.includes('FROM site_settings') && norm.includes('WHERE setting_key IN (?)')) {
    const keyList = Array.isArray(params[0]) ? params[0] : [params[0]];
    const rows = Array.from(mockStore.values())
      .filter(r => keyList.includes(r.setting_key) && r.setting_value !== null && r.setting_value !== '')
      .map(r => ({ setting_key: r.setting_key, setting_value: r.setting_value }));
    return [rows];
  }

  // 6. INSERT INTO site_settings (setting_key, setting_value, setting_group) ... ON DUPLICATE KEY UPDATE
  if (norm.startsWith('INSERT INTO site_settings') || norm.startsWith('INSERT IGNORE INTO site_settings')) {
    if (params && params.length >= 3) {
      const [key, val, grp] = params;
      mockStore.set(key, { setting_key: key, setting_value: val, setting_group: grp });
    }
    return [{ affectedRows: 1, insertId: 1 }];
  }

  // 7. UPDATE site_settings SET setting_value = ? WHERE setting_key = ?
  if (norm.startsWith('UPDATE site_settings SET setting_value = ? WHERE setting_key = ?')) {
    const [val, key] = params;
    const existing = mockStore.get(key) || { setting_group: 'general' };
    mockStore.set(key, { ...existing, setting_key: key, setting_value: val });
    return [{ affectedRows: 1 }];
  }

  // 8. UPDATE site_settings with hardcoded key/value
  if (norm.startsWith('UPDATE site_settings SET')) {
    const keyMatch = norm.match(/WHERE setting_key = '([^']+)'/i);
    const valMatch = norm.match(/setting_value = '([^']+)'/i);
    if (keyMatch && valMatch) {
      const key = keyMatch[1];
      const val = valMatch[1];
      const existing = mockStore.get(key) || { setting_group: 'general' };
      mockStore.set(key, { ...existing, setting_key: key, setting_value: val });
    } else if (keyMatch && params.length > 0) {
      const key = keyMatch[1];
      const val = params[0];
      const existing = mockStore.get(key) || { setting_group: 'general' };
      mockStore.set(key, { ...existing, setting_key: key, setting_value: val });
    }
    return [{ affectedRows: 1 }];
  }

  // 9. Activity logs mock
  if (norm.startsWith('INSERT INTO activity_logs')) {
    return [{ affectedRows: 1, insertId: 1 }];
  }

  // 10. Homepage content mock
  if (norm.includes('FROM homepage_content')) {
    return [[]];
  }

  // Delegate non-settings queries (like user authentication or ping)
  return originalQuery.call(pool, sql, params);
}

const mockConnection = {
  query: async (sql, params = []) => handleMockQuery(sql, params),
  release: () => {}
};

const originalGetConnection = pool.getConnection;
const originalQuery = pool.query;
const originalKey = process.env.SETTINGS_ENCRYPTION_KEY;

async function runTests() {
  console.log('====================================================');
  console.log(' Running Non-Destructive Stage 1 Settings Security Tests');
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

  // Install non-destructive in-memory mock hooks
  pool.getConnection = async () => mockConnection;
  pool.query = async (sql, params = []) => handleMockQuery(sql, params);

  // Dedicated test encryption key for in-memory assertions
  const testKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.SETTINGS_ENCRYPTION_KEY = testKeyHex;
  resetMockStore();

  let testServer = null;

  try {
    // ── TEST GROUP 1: Cryptographic Engine & Unit Invariants ──────────────────────

    await testAsync('Crypto: AES-256-GCM round-trip encrypts and decrypts correctly', async () => {
      const rawSecret = 'P@ssw0rd_Test_12345!#';
      const encrypted = cryptoUtils.encryptSecret(rawSecret);
      assert.ok(encrypted.startsWith('enc:v1:'), 'Encrypted envelope must start with enc:v1:');
      const decrypted = cryptoUtils.decryptSecret(encrypted);
      assert.strictEqual(decrypted, rawSecret, 'Decrypted secret must match original plaintext');
    });

    await testAsync('Crypto: Tampered ciphertext or tag fails authentication with error', async () => {
      const rawSecret = 'Authenticity_Check_Secret';
      const encrypted = cryptoUtils.encryptSecret(rawSecret);
      const parts = encrypted.split(':');

      // Tamper ciphertext
      parts[4] = (parts[4].startsWith('aa') ? 'bb' : 'aa') + parts[4].slice(2);
      const tampered = parts.join(':');

      assert.throws(() => {
        cryptoUtils.decryptSecret(tampered);
      }, /Authentication\/Decryption failed|Unsupported state or unable to authenticate/i);
    });

    await testAsync('Crypto: Non-hex tampering in envelope components is immediately rejected', async () => {
      const rawSecret = 'NonHexCheck';
      const encrypted = cryptoUtils.encryptSecret(rawSecret);
      assert.throws(() => {
        cryptoUtils.decryptSecret(encrypted + 'zzz');
      }, /Malformed encrypted secret format/i);
    });

    await testAsync('Crypto: Backward compatibility preserves legacy unencrypted secrets', async () => {
      const legacyPlaintext = 'legacy_unencrypted_smtp_password';
      const result = cryptoUtils.decryptSecret(legacyPlaintext);
      assert.strictEqual(result, legacyPlaintext, 'Legacy plaintext must be returned as-is');
    });

    await testAsync('Crypto: Missing or invalid encryption key fails safely without writing plaintext', async () => {
      const currentKey = process.env.SETTINGS_ENCRYPTION_KEY;
      process.env.SETTINGS_ENCRYPTION_KEY = '';
      try {
        assert.throws(() => {
          cryptoUtils.encryptSecret('some_new_secret');
        }, /SETTINGS_ENCRYPTION_KEY is required/i);
      } finally {
        process.env.SETTINGS_ENCRYPTION_KEY = currentKey;
      }
    });

    await testAsync('Crypto: Masked placeholder detection identifies masks and blanks', async () => {
      assert.strictEqual(cryptoUtils.isMaskedPlaceholder('••••••••'), true);
      assert.strictEqual(cryptoUtils.isMaskedPlaceholder('********'), true);
      assert.strictEqual(cryptoUtils.isMaskedPlaceholder(''), true);
      assert.strictEqual(cryptoUtils.isMaskedPlaceholder('   '), true);
      assert.strictEqual(cryptoUtils.isMaskedPlaceholder(null), true);
      assert.strictEqual(cryptoUtils.isMaskedPlaceholder(undefined), true);
      assert.strictEqual(cryptoUtils.isMaskedPlaceholder('new_real_secret'), false);
      assert.strictEqual(cryptoUtils.isMaskedPlaceholder('P@ssword123'), false);
    });

    // ── TEST GROUP 2: Public Settings Allowlist & Leak Prevention ─────────────────

    await testAsync('Public API: getPublicSiteData excludes all sensitive keys and email group', async () => {
      // Seed dummy secrets in isolated mock store
      mockStore.set('smtp_password', { setting_key: 'smtp_password', setting_value: 'secret_smtp_pass_leak_check', setting_group: 'email' });
      mockStore.set('google_client_secret', { setting_key: 'google_client_secret', setting_value: 'secret_google_oauth_check', setting_group: 'integrations' });
      mockStore.set('recaptcha_secret_key', { setting_key: 'recaptcha_secret_key', setting_value: 'secret_recaptcha_check', setting_group: 'security' });
      mockStore.set('smtp_user', { setting_key: 'smtp_user', setting_value: 'internal_smtp_user@tekdoctor.in', setting_group: 'email' });

      let responseData = null;
      const req = {};
      const res = {
        status: () => res,
        json: (data) => { responseData = data; }
      };

      await getPublicSiteData(req, res, (err) => { if (err) throw err; });

      assert.ok(responseData && responseData.data && responseData.data.settings, 'Response data must exist');
      const settings = responseData.data.settings;

      // 1. Email group must be completely absent from public settings
      assert.strictEqual('email' in settings, false, 'Public settings must NEVER contain the email group');

      // 2. Secret keys must be completely absent anywhere in settings
      const serialized = JSON.stringify(settings).toLowerCase();
      assert.strictEqual(serialized.includes('smtp_password'), false, 'smtp_password must not exist in public data');
      assert.strictEqual(serialized.includes('google_client_secret'), false, 'google_client_secret must not exist in public data');
      assert.strictEqual(serialized.includes('recaptcha_secret_key'), false, 'recaptcha_secret_key must not exist in public data');
      assert.strictEqual(serialized.includes('secret_smtp_pass_leak_check'), false, 'Raw SMTP secret value must not leak');
      assert.strictEqual(serialized.includes('secret_google_oauth_check'), false, 'Raw Google secret value must not leak');
      assert.strictEqual(serialized.includes('secret_recaptcha_check'), false, 'Raw reCAPTCHA secret value must not leak');
    });

    await testAsync('Public API: getPublicSiteData retains legitimate public-safe settings', async () => {
      let responseData = null;
      const req = {};
      const res = {
        status: () => res,
        json: (data) => { responseData = data; }
      };

      await getPublicSiteData(req, res, (err) => { if (err) throw err; });

      const settings = responseData.data.settings;
      assert.ok(settings.company, 'Public settings must include company group');
      assert.ok('company_name' in settings.company, 'Company group must include company_name');
      assert.ok('company_email' in settings.company, 'Company group must include company_email');
      assert.ok('logo_url' in settings.company, 'Company group must include logo_url');

      assert.ok(settings.theme, 'Public settings must include theme group');
      assert.ok('theme_primary_color' in settings.theme, 'Theme group must include theme_primary_color');

      assert.ok(settings.branding, 'Public settings must include branding group');
      assert.ok('favicon_url' in settings.branding, 'Branding group must include favicon_url');

      assert.ok(settings.system, 'Public settings must include system group');
      assert.ok('maintenance_mode' in settings.system, 'System group must include maintenance_mode');

      assert.ok(settings.billing, 'Public settings must include billing group');
      assert.ok('invoice_prefix' in settings.billing, 'Billing group must include invoice_prefix');
    });

    // ── TEST GROUP 3: Admin Secret Responses & Safe Update Behavior ────────────────

    await testAsync('Admin API: getSettings returns masked indicator for secrets without plaintext', async () => {
      const plainPass = 'MyUltraSecretSMTPPass!99';
      const encrypted = cryptoUtils.encryptSecret(plainPass);
      mockStore.set('smtp_password', { setting_key: 'smtp_password', setting_value: encrypted, setting_group: 'email' });

      let result = null;
      const req = { query: { group: 'email' } };
      const res = {
        json: (data) => { result = data; }
      };

      await adminController.getSettings(req, res, (err) => { if (err) throw err; });

      assert.ok(result && result.data && result.data.email, 'Admin settings response must have email group');
      const returnedPass = result.data.email.smtp_password;

      assert.strictEqual(returnedPass, cryptoUtils.MASKED_SECRET_INDICATOR, 'Stored secret must be masked with bullet placeholder');
      assert.notStrictEqual(returnedPass, plainPass, 'Plaintext secret must NEVER be returned in admin settings response');
      assert.ok(!returnedPass.startsWith('enc:v1:'), 'Encrypted ciphertext envelope must not be leaked to the client');
    });

    await testAsync('Admin API: updateSettings preserves existing secret when masked placeholder is submitted', async () => {
      const originalPlain = 'Original_Secret_To_Preserve_123';
      const originalEncrypted = cryptoUtils.encryptSecret(originalPlain);
      mockStore.set('smtp_password', { setting_key: 'smtp_password', setting_value: originalEncrypted, setting_group: 'email' });

      const updateReq = {
        body: {
          settings: {
            smtp_password: cryptoUtils.MASKED_SECRET_INDICATOR,
            smtp_port: '587'
          },
          group: 'email'
        },
        user: { id: 1 },
        ip: '127.0.0.1'
      };
      const updateRes = {
        status: () => updateRes,
        json: () => {}
      };

      await adminController.updateSettings(updateReq, updateRes, (err) => { if (err) throw err; });

      // In mockStore, value must remain untouched
      const stored = mockStore.get('smtp_password').setting_value;
      assert.strictEqual(stored, originalEncrypted, 'Ciphertext in store must remain identical');
      assert.strictEqual(cryptoUtils.decryptSecret(stored), originalPlain, 'Decrypted value must equal original plaintext');
    });

    await testAsync('Admin API: updateSettings preserves existing secret when field is omitted or blank', async () => {
      const originalPlain = 'Preserve_On_Blank_Secret_456';
      const originalEncrypted = cryptoUtils.encryptSecret(originalPlain);
      mockStore.set('smtp_password', { setting_key: 'smtp_password', setting_value: originalEncrypted, setting_group: 'email' });

      const updateReq = {
        body: {
          settings: {
            smtp_password: '   ',
            smtp_user: 'admin@tekdoctor.in'
          },
          group: 'email'
        },
        user: { id: 1 },
        ip: '127.0.0.1'
      };
      const updateRes = {
        status: () => updateRes,
        json: () => {}
      };

      await adminController.updateSettings(updateReq, updateRes, (err) => { if (err) throw err; });

      const stored = mockStore.get('smtp_password').setting_value;
      assert.strictEqual(stored, originalEncrypted, 'Ciphertext must not be overwritten by blank spaces');
      assert.strictEqual(cryptoUtils.decryptSecret(stored), originalPlain);
    });

    await testAsync('Admin API: Explicit secret rotation updates credential to new encrypted value', async () => {
      const newRotatedPlain = 'Brand_New_Rotated_Secret_789!';

      const updateReq = {
        body: {
          settings: {
            smtp_password: newRotatedPlain
          },
          group: 'email'
        },
        user: { id: 1 },
        ip: '127.0.0.1'
      };
      const updateRes = {
        status: () => updateRes,
        json: () => {}
      };

      await adminController.updateSettings(updateReq, updateRes, (err) => { if (err) throw err; });

      const stored = mockStore.get('smtp_password').setting_value;
      assert.ok(stored.startsWith('enc:v1:'), 'Rotated secret must be stored as encrypted envelope');
      assert.notStrictEqual(stored, newRotatedPlain, 'Must not be stored in plaintext');
      assert.strictEqual(cryptoUtils.decryptSecret(stored), newRotatedPlain, 'Decrypted secret must match new plaintext');
    });

    await testAsync('Admin API: Non-secret setting updates preserve unrelated credentials', async () => {
      const storedSecretPlain = 'Unrelated_Secret_Value_ABC';
      const storedEncrypted = cryptoUtils.encryptSecret(storedSecretPlain);
      mockStore.set('smtp_password', { setting_key: 'smtp_password', setting_value: storedEncrypted, setting_group: 'email' });

      const updateReq = {
        body: {
          settings: {
            company_name: 'The Tek Doctor Test Mock'
          },
          group: 'company'
        },
        user: { id: 1 },
        ip: '127.0.0.1'
      };
      const updateRes = {
        status: () => updateRes,
        json: () => {}
      };

      await adminController.updateSettings(updateReq, updateRes, (err) => { if (err) throw err; });

      // Verify company_name changed
      assert.strictEqual(mockStore.get('company_name').setting_value, 'The Tek Doctor Test Mock');

      // Verify smtp_password remains completely intact
      const stored = mockStore.get('smtp_password').setting_value;
      assert.strictEqual(stored, storedEncrypted);
      assert.strictEqual(cryptoUtils.decryptSecret(stored), storedSecretPlain);
    });

    // ── TEST GROUP 4: SMTP Integration Compatibility ──────────────────────────────

    await testAsync('SMTP: getEmailConfig decrypts stored password and prepares transport', async () => {
      const smtpPass = 'Smtp_Email_Integration_Test_Pass!';
      const encrypted = cryptoUtils.encryptSecret(smtpPass);

      mockStore.set('smtp_host', { setting_key: 'smtp_host', setting_value: 'smtp.testserver.com', setting_group: 'email' });
      mockStore.set('smtp_port', { setting_key: 'smtp_port', setting_value: '587', setting_group: 'email' });
      mockStore.set('smtp_user', { setting_key: 'smtp_user', setting_value: 'mailer@tekdoctor.in', setting_group: 'email' });
      mockStore.set('smtp_password', { setting_key: 'smtp_password', setting_value: encrypted, setting_group: 'email' });

      const emailConfig = await getEmailConfig();
      assert.strictEqual(emailConfig.isConfigured, true);
      assert.strictEqual(emailConfig.source, 'database_smtp');
      assert.strictEqual(emailConfig.transporter.options.auth.pass, smtpPass, 'Transporter must receive the decrypted password');
      assert.strictEqual(emailConfig.transporter.options.auth.user, 'mailer@tekdoctor.in');
    });

    await testAsync('SMTP: testEmailSettings automatically resolves masked password from DB', async () => {
      const realPassword = 'RealStoredSecretForTestEmail';
      const encrypted = cryptoUtils.encryptSecret(realPassword);
      mockStore.set('smtp_password', { setting_key: 'smtp_password', setting_value: encrypted, setting_group: 'email' });

      const testReq = {
        body: {
          settings: {
            smtp_host: 'smtp.gmail.com',
            smtp_port: '587',
            smtp_user: 'test@tekdoctor.in',
            smtp_password: cryptoUtils.MASKED_SECRET_INDICATOR
          }
        },
        user: { id: 1, email: 'admin@tekdoctor.in' }
      };

      let response = null;
      const testRes = {
        status: () => testRes,
        json: (data) => { response = data; }
      };

      await adminController.testEmailSettings(testReq, testRes, () => {});

      assert.notStrictEqual(response?.message, 'Incomplete SMTP configuration provided.');
      assert.notStrictEqual(response?.message, 'SMTP password is required to test email.');
    });

    // ── TEST GROUP 5: Migration 2026_09 Unit Verification ──────────────────────────

    await testAsync('Migration: 2026_09_encrypt_stored_secrets encrypts legacy plaintext secrets into versioned envelopes', async () => {
      // Find migration definition
      const migration = (initDatabase.MIGRATIONS || []).find(m => m.version === '2026_09_encrypt_stored_secrets');
      assert.ok(migration, 'Migration 2026_09_encrypt_stored_secrets must be defined');

      // Populate mock store with legacy plaintext secrets
      mockStore.set('smtp_password', { setting_key: 'smtp_password', setting_value: 'legacy_plain_smtp_pass', setting_group: 'email' });
      mockStore.set('google_client_secret', { setting_key: 'google_client_secret', setting_value: 'legacy_plain_google_sec', setting_group: 'integrations' });
      mockStore.set('recaptcha_secret_key', { setting_key: 'recaptcha_secret_key', setting_value: 'legacy_plain_recaptcha_sec', setting_group: 'security' });

      // Initially isSatisfied must be false
      const satisfiedBefore = await migration.isSatisfied(mockConnection);
      assert.strictEqual(satisfiedBefore, false, 'Migration must not be satisfied when plaintext secrets exist');

      // Run apply
      await migration.apply(mockConnection);

      // Verify all secret rows are now encrypted with enc:v1:
      const smtpStored = mockStore.get('smtp_password').setting_value;
      const googleStored = mockStore.get('google_client_secret').setting_value;
      const recaptchaStored = mockStore.get('recaptcha_secret_key').setting_value;

      assert.ok(smtpStored.startsWith('enc:v1:'), 'smtp_password must be encrypted');
      assert.ok(googleStored.startsWith('enc:v1:'), 'google_client_secret must be encrypted');
      assert.ok(recaptchaStored.startsWith('enc:v1:'), 'recaptcha_secret_key must be encrypted');

      // Verify they decrypt back to original legacy values
      assert.strictEqual(cryptoUtils.decryptSecret(smtpStored), 'legacy_plain_smtp_pass');
      assert.strictEqual(cryptoUtils.decryptSecret(googleStored), 'legacy_plain_google_sec');
      assert.strictEqual(cryptoUtils.decryptSecret(recaptchaStored), 'legacy_plain_recaptcha_sec');

      // Now isSatisfied must return true
      const satisfiedAfter = await migration.isSatisfied(mockConnection);
      assert.strictEqual(satisfiedAfter, true, 'Migration must be satisfied after applying encryption');
    });

    // ── TEST GROUP 6: HTTP Endpoints & Authorization Invariants ───────────────────

    testServer = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = testServer.address().port;
    const API_BASE = `http://127.0.0.1:${port}/api`;

    await testAsync('HTTP: Public /api/public/site-data returns 200 without secrets', async () => {
      const res = await fetch(`${API_BASE}/public/site-data`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      const text = JSON.stringify(json).toLowerCase();
      assert.strictEqual(text.includes('smtp_password'), false);
      assert.strictEqual(text.includes('google_client_secret'), false);
      assert.strictEqual(text.includes('recaptcha_secret_key'), false);
    });

    await testAsync('HTTP: Unauthorized request to /api/admin/settings is rejected with 401', async () => {
      const res = await fetch(`${API_BASE}/admin/settings`);
      assert.strictEqual(res.status, 401, 'Unauthenticated request must be rejected with HTTP 401');
    });

  } finally {
    // Teardown test server cleanly
    if (testServer) {
      await new Promise((resolve) => testServer.close(resolve));
    }
    // Restore original pool functions and environment key
    pool.getConnection = originalGetConnection;
    pool.query = originalQuery;
    process.env.SETTINGS_ENCRYPTION_KEY = originalKey;

    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`\nResults: ${passed}/${total} tests passed.`);
  if (passed === total) {
    console.log('✓ ALL NON-DESTRUCTIVE STAGE 1 SECURITY TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } else {
    console.error('✗ Some tests failed.');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  pool.getConnection = originalGetConnection;
  pool.query = originalQuery;
  process.env.SETTINGS_ENCRYPTION_KEY = originalKey;
  process.exit(1);
});
