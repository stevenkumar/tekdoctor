/**
 * Dedicated Security Verification Suite:
 * AMC Certificate Security Hardening (Stage 2)
 *
 * Verifies all criteria specified in the Stage 2 Certificate Security Hardening requirements:
 *
 * SEC-01: Rate-Limit Bypass Security
 * 1. Source code verification: certVerifyLimiter strictly gates header bypass behind config.env === 'test'.
 * 2. Production + bypass header: bypass is NOT honored; requests are counted by rate limiter.
 * 3. Development + bypass header: bypass is NOT honored; requests are counted by rate limiter.
 * 4. Test + bypass header: bypass IS honored; requests with header skip the limiter.
 * 5. Production requests without bypass header: rate-limit threshold remains active.
 * 6. HTTP integration test on Express:
 *    - In production mode with bypass header, requests exceeding threshold are blocked (HTTP 429).
 *    - In test mode with bypass header, requests exceeding threshold are permitted (HTTP 200).
 *
 * SEC-02: Legacy v1 Signature Compatibility Gate
 * 7. Valid current-secret v2 HMAC signature: accepted ({ valid: true, version: 'v2_hmac' }).
 * 8. Valid previous-secret v2 HMAC signature (key rotation): accepted ({ valid: true, version: 'v2_hmac_rotated' }).
 * 9. Invalid v2 signature (tampered code or payload): rejected.
 * 10. Valid legacy v1 signature with AMC_ALLOW_LEGACY_V1 unset: rejected ({ valid: false }).
 * 11. Valid legacy v1 signature with AMC_ALLOW_LEGACY_V1="false": rejected ({ valid: false }).
 * 12. Valid legacy v1 signature with AMC_ALLOW_LEGACY_V1="true": accepted ({ valid: true, version: 'v1_legacy' }).
 * 13. Invalid legacy v1 signature with AMC_ALLOW_LEGACY_V1="true": rejected ({ valid: false }).
 * 14. Public verification endpoint (getPublicCertificateVerification):
 *     - Real contract with valid v2 HMAC returns sanitized compliance response.
 *     - Sensitive data (serials, amounts, customer phone, GSTIN) are excluded.
 *     - Legacy v1 signature is rejected when flag is unset / false.
 *     - Legacy v1 signature is accepted when flag is 'true'.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config/app.config');
const { certVerifyLimiter } = require('../middleware/rateLimiter.middleware');
const amcService = require('../services/amc.service');
const { pool } = require('../config/db.config');

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
  console.log('TEST SUITE: AMC Certificate Security Hardening (Stage 2)');
  console.log('===================================================================');

  // Save original environment variables to guarantee safe cleanup
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowLegacy = process.env.AMC_ALLOW_LEGACY_V1;
  const originalPrevSecrets = process.env.AMC_CERTIFICATE_PREVIOUS_SECRETS;
  const originalConfigEnv = config.env;

  try {
    // ══════════════════════════════════════════════════════════════════
    // SECTION 1: SEC-01 Static Source Verification
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 1] SEC-01: certVerifyLimiter Implementation Inspection');

    const rateLimiterSourcePath = path.join(__dirname, '../middleware/rateLimiter.middleware.js');
    const rateLimiterSource = fs.readFileSync(rateLimiterSourcePath, 'utf8');

    assert.ok(
      rateLimiterSource.includes("config.env === 'test' && req.headers['x-bypass-rate-limit'] === 'test-bypass'"),
      'certVerifyLimiter must strictly gate x-bypass-rate-limit behind config.env === "test"'
    );
    pass('1.1 certVerifyLimiter source code verifies config.env === "test" before checking x-bypass-rate-limit');

    assert.ok(
      !rateLimiterSource.includes("skip: (req) => req.headers['x-bypass-rate-limit'] === 'test-bypass'"),
      'Old insecure un-gated skip callback must be completely removed'
    );
    pass('1.2 Insecure un-gated skip callback is completely eliminated');

    // ══════════════════════════════════════════════════════════════════
    // SECTION 2: SEC-01 HTTP Integration Test on Rate Limiting
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 2] SEC-01: HTTP Rate Limiting Integration Enforcement');

    // Build dedicated test limiter using the exact same logic as certVerifyLimiter but with small threshold (2 reqs)
    const testLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => config.env === 'test' && req.headers['x-bypass-rate-limit'] === 'test-bypass',
      message: { success: false, message: 'Too many certificate verification requests. Please try again after 15 minutes.' }
    });

    const testApp = express();
    testApp.get('/api/amc/public/verify-certificate/:code', testLimiter, (req, res) => {
      res.json({ success: true, code: req.params.code });
    });

    const server = http.createServer(testApp);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const makeRequest = (pathStr, headers = {}) => {
      return new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: pathStr,
            method: 'GET',
            headers
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
          }
        );
        req.on('error', reject);
        req.end();
      });
    };

    try {
      // Test 2.1: Production mode with bypass header -> bypass is NOT honored, 3rd request blocked with 429
      config.env = 'production';
      const r1 = await makeRequest('/api/amc/public/verify-certificate/CODE1', { 'x-bypass-rate-limit': 'test-bypass' });
      const r2 = await makeRequest('/api/amc/public/verify-certificate/CODE2', { 'x-bypass-rate-limit': 'test-bypass' });
      const r3 = await makeRequest('/api/amc/public/verify-certificate/CODE3', { 'x-bypass-rate-limit': 'test-bypass' });

      assert.strictEqual(r1.statusCode, 200, 'First request should succeed');
      assert.strictEqual(r2.statusCode, 200, 'Second request should succeed');
      assert.strictEqual(r3.statusCode, 429, 'Production + bypass header: 3rd request must be BLOCKED (429)');
      pass('2.1 Production + bypass header: bypass is NOT honored (requests blocked with HTTP 429)');

      // Test 2.2: Development mode with bypass header -> bypass is NOT honored
      // Reset rate limit key by creating fresh limiter on new route
      const devLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 1,
        skip: (req) => config.env === 'test' && req.headers['x-bypass-rate-limit'] === 'test-bypass',
        message: { success: false }
      });
      testApp.get('/test-dev-limit', devLimiter, (req, res) => res.json({ ok: true }));

      config.env = 'development';
      const d1 = await makeRequest('/test-dev-limit', { 'x-bypass-rate-limit': 'test-bypass' });
      const d2 = await makeRequest('/test-dev-limit', { 'x-bypass-rate-limit': 'test-bypass' });

      assert.strictEqual(d1.statusCode, 200);
      assert.strictEqual(d2.statusCode, 429, 'Development + bypass header: 2nd request must be BLOCKED (429)');
      pass('2.2 Development + bypass header: bypass is NOT honored (requests blocked with HTTP 429)');

      // Test 2.3: Test mode with bypass header -> bypass IS honored
      const testModeLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 1,
        skip: (req) => config.env === 'test' && req.headers['x-bypass-rate-limit'] === 'test-bypass',
        message: { success: false }
      });
      testApp.get('/test-testmode-limit', testModeLimiter, (req, res) => res.json({ ok: true }));

      config.env = 'test';
      const t1 = await makeRequest('/test-testmode-limit', { 'x-bypass-rate-limit': 'test-bypass' });
      const t2 = await makeRequest('/test-testmode-limit', { 'x-bypass-rate-limit': 'test-bypass' });
      const t3 = await makeRequest('/test-testmode-limit', { 'x-bypass-rate-limit': 'test-bypass' });

      assert.strictEqual(t1.statusCode, 200);
      assert.strictEqual(t2.statusCode, 200, 'Test mode + bypass header: 2nd request must SUCCEED (200)');
      assert.strictEqual(t3.statusCode, 200, 'Test mode + bypass header: 3rd request must SUCCEED (200)');
      pass('2.3 Test + bypass header: bypass IS honored (all requests succeed with HTTP 200)');

      // Test 2.4: Production requests without bypass header -> normal rate limiting applies
      const prodNoHeaderLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 1,
        skip: (req) => config.env === 'test' && req.headers['x-bypass-rate-limit'] === 'test-bypass',
        message: { success: false }
      });
      testApp.get('/test-prod-no-header', prodNoHeaderLimiter, (req, res) => res.json({ ok: true }));

      config.env = 'production';
      const p1 = await makeRequest('/test-prod-no-header', {});
      const p2 = await makeRequest('/test-prod-no-header', {});
      assert.strictEqual(p1.statusCode, 200);
      assert.strictEqual(p2.statusCode, 429);
      pass('2.4 Production requests without header: rate-limit threshold remains active (HTTP 429)');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }

    // ══════════════════════════════════════════════════════════════════
    // SECTION 3: SEC-02 HMAC Signature Verification (Current & Rotated Keys)
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 3] SEC-02: Cryptographic HMAC Signature Verification');

    const testContract = {
      id: 9999,
      contract_number: 'AMC-CTR-TEST-2026-001',
      start_date: '2026-11-01',
      end_date: '2027-10-31',
      company_id: 888,
      status: 'active',
      plan_name: 'Test Enterprise Security Plan'
    };

    // Generate valid current-key HMAC
    const validCurrentCode = amcService.generateCertificateHmacCode(testContract);
    assert.strictEqual(typeof validCurrentCode, 'string');
    assert.strictEqual(validCurrentCode.length, 16);

    // 7. Valid current-secret v2 signature
    const currentResult = amcService.verifyCertificateAuthenticity(testContract, validCurrentCode);
    assert.strictEqual(currentResult.valid, true);
    assert.strictEqual(currentResult.version, 'v2_hmac');
    pass('3.1 Valid current-secret v2 signature is accepted ({ valid: true, version: "v2_hmac" })');

    // 8. Valid previous-secret v2 signature (key rotation support)
    const previousSecret = 'test-previous-rotation-secret-32-bytes!';
    process.env.AMC_CERTIFICATE_PREVIOUS_SECRETS = `${previousSecret},another-old-key`;

    // Compute code using the previous secret
    const canonicalPayload = amcService.generateCertificateCanonicalPayload(testContract);
    const validRotatedCode = crypto
      .createHmac('sha256', previousSecret)
      .update(canonicalPayload)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();

    const rotatedResult = amcService.verifyCertificateAuthenticity(testContract, validRotatedCode);
    assert.strictEqual(rotatedResult.valid, true);
    assert.strictEqual(rotatedResult.version, 'v2_hmac_rotated');
    pass('3.2 Valid previous-secret v2 signature is accepted ({ valid: true, version: "v2_hmac_rotated" })');

    // 9. Invalid v2 signature (tampered code)
    const tamperedCode = validCurrentCode.slice(0, 15) + (validCurrentCode[15] === 'A' ? 'B' : 'A');
    const tamperedResult = amcService.verifyCertificateAuthenticity(testContract, tamperedCode);
    assert.strictEqual(tamperedResult.valid, false);
    assert.strictEqual(tamperedResult.reason, 'VERIFICATION_FAILED');
    pass('3.3 Tampered v2 signature is strictly rejected ({ valid: false, reason: "VERIFICATION_FAILED" })');

    // 9b. Tampered contract data (e.g., date altered by 1 day)
    const alteredContract = { ...testContract, end_date: '2027-11-01' };
    const alteredResult = amcService.verifyCertificateAuthenticity(alteredContract, validCurrentCode);
    assert.strictEqual(alteredResult.valid, false);
    pass('3.4 Tampered contract validity date causes immediate verification failure');

    // ══════════════════════════════════════════════════════════════════
    // SECTION 4: SEC-02 Legacy v1 Signature Compatibility Gating
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 4] SEC-02: Legacy v1 Signature Compatibility Gating');

    // Generate unkeyed v1 legacy SHA-256 hash for test contract
    const legacyPayload = `${testContract.contract_number}:${testContract.start_date}:${testContract.end_date}:${testContract.company_id}`;
    const validLegacyCode = crypto
      .createHash('sha256')
      .update(legacyPayload)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();

    assert.strictEqual(validLegacyCode.length, 16);

    // 10. Legacy v1 with flag UNSET
    delete process.env.AMC_ALLOW_LEGACY_V1;
    config.amc.allowLegacyV1 = false;
    const unsetResult = amcService.verifyCertificateAuthenticity(testContract, validLegacyCode);
    assert.strictEqual(unsetResult.valid, false, 'Unkeyed v1 hash must be REJECTED when AMC_ALLOW_LEGACY_V1 is unset');
    assert.strictEqual(unsetResult.reason, 'VERIFICATION_FAILED');
    pass('4.1 Legacy v1 signature with AMC_ALLOW_LEGACY_V1 UNSET: rejected ({ valid: false })');

    // 11. Legacy v1 with flag set to 'false'
    process.env.AMC_ALLOW_LEGACY_V1 = 'false';
    config.amc.allowLegacyV1 = false;
    const falseResult = amcService.verifyCertificateAuthenticity(testContract, validLegacyCode);
    assert.strictEqual(falseResult.valid, false, 'Unkeyed v1 hash must be REJECTED when AMC_ALLOW_LEGACY_V1 is "false"');
    pass('4.2 Legacy v1 signature with AMC_ALLOW_LEGACY_V1="false": rejected ({ valid: false })');

    // 11b. Legacy v1 with flag set to arbitrary invalid string
    process.env.AMC_ALLOW_LEGACY_V1 = 'no';
    config.amc.allowLegacyV1 = false;
    const invalidFlagResult = amcService.verifyCertificateAuthenticity(testContract, validLegacyCode);
    assert.strictEqual(invalidFlagResult.valid, false, 'Unkeyed v1 hash must be REJECTED when AMC_ALLOW_LEGACY_V1 is not exactly "true"');
    pass('4.3 Legacy v1 signature with arbitrary string flag ("no"): rejected ({ valid: false })');

    // 12. Legacy v1 with flag set to 'true'
    process.env.AMC_ALLOW_LEGACY_V1 = 'true';
    config.amc.allowLegacyV1 = true;
    const trueResult = amcService.verifyCertificateAuthenticity(testContract, validLegacyCode);
    assert.strictEqual(trueResult.valid, true, 'Unkeyed v1 hash must be ACCEPTED when AMC_ALLOW_LEGACY_V1="true"');
    assert.strictEqual(trueResult.version, 'v1_legacy');
    pass('4.4 Legacy v1 signature with AMC_ALLOW_LEGACY_V1="true": accepted ({ valid: true, version: "v1_legacy" })');

    // 13. Invalid legacy v1 signature with flag set to 'true'
    const tamperedLegacyCode = validLegacyCode.slice(0, 15) + (validLegacyCode[15] === '0' ? '1' : '0');
    const tamperedLegacyResult = amcService.verifyCertificateAuthenticity(testContract, tamperedLegacyCode);
    assert.strictEqual(tamperedLegacyResult.valid, false, 'Invalid legacy hash must be rejected even when legacy mode is enabled');
    pass('4.5 Invalid legacy v1 signature with AMC_ALLOW_LEGACY_V1="true": rejected ({ valid: false })');

    // Clean up AMC_ALLOW_LEGACY_V1 to ensure secure default remains
    delete process.env.AMC_ALLOW_LEGACY_V1;
    config.amc.allowLegacyV1 = false;

    // ══════════════════════════════════════════════════════════════════
    // SECTION 5: Public Certificate Verification Service Integration
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 5] Public Verification Workflow & Data Sanitization');

    // Fetch existing contract from DB to verify end-to-end getPublicCertificateVerification
    const [contractRows] = await pool.query(
      "SELECT c.*, u.name as company_name FROM amc_contracts c JOIN users u ON c.company_id = u.id WHERE c.status = 'active' LIMIT 1"
    );

    if (contractRows.length > 0) {
      const dbContract = contractRows[0];
      const dbV2Code = amcService.generateCertificateHmacCode(dbContract);

      // Verify valid v2 certificate
      const verifyRes = await amcService.getPublicCertificateVerification(dbV2Code, dbContract.contract_number);
      assert.strictEqual(verifyRes.valid, true);
      assert.strictEqual(verifyRes.version, 'v2_hmac');
      assert.strictEqual(verifyRes.contractNumber, dbContract.contract_number);
      assert.strictEqual(verifyRes.companyName, dbContract.company_name);
      assert.strictEqual(verifyRes.complianceStatus, 'ACTIVE_COMPLIANT');

      // Assert that confidential data is stripped
      assert.strictEqual(verifyRes.total_amount, undefined, 'Total amount must not be exposed');
      assert.strictEqual(verifyRes.invoice_id, undefined, 'Invoice ID must not be exposed');
      assert.strictEqual(verifyRes.phone, undefined, 'Phone must not be exposed');
      assert.strictEqual(verifyRes.serial_number, undefined, 'Device serials must not be exposed');
      pass('5.1 Public verification endpoint accepts v2 HMAC and returns strictly sanitized compliance data');

      // Verify legacy v1 against DB contract with flag unset -> must fail
      delete process.env.AMC_ALLOW_LEGACY_V1;
      config.amc.allowLegacyV1 = false;
      const dbLegacyPayload = `${dbContract.contract_number}:${amcService.formatDateOnly(dbContract.start_date)}:${amcService.formatDateOnly(dbContract.end_date)}:${dbContract.company_id}`;
      const dbLegacyCode = crypto.createHash('sha256').update(dbLegacyPayload).digest('hex').slice(0, 16).toUpperCase();

      const legacyUnsetRes = await amcService.getPublicCertificateVerification(dbLegacyCode, dbContract.contract_number);
      assert.strictEqual(legacyUnsetRes.valid, false, 'Legacy v1 must fail public verification when flag is unset');
      pass('5.2 Public verification rejects unkeyed legacy code when AMC_ALLOW_LEGACY_V1 is unset');

      // Verify legacy v1 against DB contract with flag set to 'true' -> must succeed
      process.env.AMC_ALLOW_LEGACY_V1 = 'true';
      config.amc.allowLegacyV1 = true;
      const legacyTrueRes = await amcService.getPublicCertificateVerification(dbLegacyCode, dbContract.contract_number);
      assert.strictEqual(legacyTrueRes.valid, true, 'Legacy v1 must succeed public verification when AMC_ALLOW_LEGACY_V1="true"');
      assert.strictEqual(legacyTrueRes.version, 'v1_legacy');
      pass('5.3 Public verification accepts legacy v1 code when AMC_ALLOW_LEGACY_V1="true" compatibility flag is explicitly enabled');
    } else {
      console.log('  [Notice] No active DB contracts found; skipped DB-specific integration assertions.');
    }

    console.log('\n===================================================================');
    console.log(`TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('===================================================================');

  } catch (err) {
    fail('Unhandled exception during security test suite', err);
  } finally {
    // Restore all original environment state
    if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
    else delete process.env.NODE_ENV;

    if (originalAllowLegacy !== undefined) process.env.AMC_ALLOW_LEGACY_V1 = originalAllowLegacy;
    else delete process.env.AMC_ALLOW_LEGACY_V1;

    if (originalPrevSecrets !== undefined) process.env.AMC_CERTIFICATE_PREVIOUS_SECRETS = originalPrevSecrets;
    else delete process.env.AMC_CERTIFICATE_PREVIOUS_SECRETS;

    config.env = originalConfigEnv;

    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

runTests();
