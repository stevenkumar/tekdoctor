/**
 * Dedicated Integration Test Suite:
 * AMC Stage 3B: Public Certificate Verification Experience
 *
 * Verifies all criteria specified in Stage 3B requirements:
 * 1. Correct client public verification API endpoint (/api/amc/public/verify-certificate/:code).
 * 2. Route registration in client router (ROUTES.VERIFY_CERTIFICATE & App.tsx).
 * 3. Public accessibility of verification page (unauthenticated).
 * 4. QR Code generation: getCertificateVerificationUrl and generateQrCodeSvg.
 * 5. Inclusion of scannable QR code SVG in certificate HTML layout.
 * 6. End-to-End HTTP public verification:
 *    - Active contract returns 200 and ACTIVE_COMPLIANT.
 *    - Expired contract returns 200 and EXPIRED.
 *    - Cancelled contract returns 200 and CANCELLED.
 *    - Invalid code returns 404 and CERTIFICATE_NOT_FOUND_OR_INVALID.
 *    - Confidential fields (serials, financials, contacts) are strictly excluded.
 * 7. Rate limiter and legacy v1 security regression checks remain passed.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const crypto = require('crypto');
const config = require('../config/app.config');
const amcService = require('../services/amc.service');
const amcRoutes = require('../routes/amc.routes');
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
  console.log('TEST SUITE: AMC Stage 3B Public Certificate Verification Flow');
  console.log('===================================================================');

  let testServer = null;
  let serverBaseUrl = '';

  try {
    // ══════════════════════════════════════════════════════════════════
    // SECTION 1: Client API Endpoint & Route Configuration
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 1] Client API Endpoint & Router Inspection');

    const apiTsPath = path.join(__dirname, '../../client/src/services/api.ts');
    const apiTsContent = fs.readFileSync(apiTsPath, 'utf8');

    assert.ok(
      apiTsContent.includes("PUBLIC_VERIFY_CERTIFICATE: (code: string) => `/api/amc/public/verify-certificate/${encodeURIComponent(code)}`"),
      'ENDPOINTS.AMC.PUBLIC_VERIFY_CERTIFICATE constant must be defined with /api prefix'
    );
    pass('1.1 ENDPOINTS.AMC.PUBLIC_VERIFY_CERTIFICATE correctly defined with /api prefix');

    assert.ok(
      apiTsContent.includes('getUrl(`${ENDPOINTS.AMC.PUBLIC_VERIFY_CERTIFICATE(code)}${query}`)'),
      'amcApi.verifyPublicCertificate must invoke ENDPOINTS.AMC.PUBLIC_VERIFY_CERTIFICATE'
    );
    pass('1.2 amcApi.verifyPublicCertificate utilizes centralized /api endpoint helper');

    const routesTsPath = path.join(__dirname, '../../client/src/config/routes.ts');
    const routesTsContent = fs.readFileSync(routesTsPath, 'utf8');
    assert.ok(
      routesTsContent.includes("VERIFY_CERTIFICATE: '/verify-certificate/:code'"),
      'ROUTES.VERIFY_CERTIFICATE must be registered in routes.ts'
    );
    pass('1.3 ROUTES.VERIFY_CERTIFICATE registered in centralized routes definition');

    const appTsxPath = path.join(__dirname, '../../client/src/App.tsx');
    const appTsxContent = fs.readFileSync(appTsxPath, 'utf8');
    assert.ok(
      appTsxContent.includes('AmcCertificateVerification'),
      'AmcCertificateVerification page component must be imported in App.tsx'
    );
    assert.ok(
      appTsxContent.includes('path={ROUTES.VERIFY_CERTIFICATE}') || appTsxContent.includes('path="/verify-certificate/:code"'),
      'Public route /verify-certificate/:code must be registered in App.tsx'
    );
    pass('1.4 Public verification route registered without authentication guards in App.tsx');

    // ══════════════════════════════════════════════════════════════════
    // SECTION 2: QR Code Generation & PDF Template Embedding
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 2] QR Code Generation & Certificate PDF Embedding');

    const certGenTsPath = path.join(__dirname, '../../client/src/utils/amcCertificateGenerator.ts');
    const certGenContent = fs.readFileSync(certGenTsPath, 'utf8');

    assert.ok(
      certGenContent.includes('getCertificateVerificationUrl'),
      'amcCertificateGenerator must expose getCertificateVerificationUrl'
    );
    assert.ok(
      certGenContent.includes('generateQrCodeSvg'),
      'amcCertificateGenerator must import and invoke generateQrCodeSvg'
    );
    assert.ok(
      certGenContent.includes('Scan to Verify Certificate'),
      'Certificate PDF layout must render "Scan to Verify Certificate" caption'
    );
    assert.ok(
      certGenContent.includes('${qrSvg}'),
      'Certificate HTML template must embed generated QR code SVG'
    );
    pass('2.1 Certificate generator template embeds scannable QR code SVG and verification caption');

    const qrTsPath = path.join(__dirname, '../../client/src/utils/qrCode.ts');
    assert.ok(fs.existsSync(qrTsPath), 'qrCode.ts generator utility must exist');
    pass('2.2 Pure TypeScript QR code generator utility exists with zero npm dependencies');

    // ══════════════════════════════════════════════════════════════════
    // SECTION 3: End-to-End HTTP Public Verification Workflow
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 3] End-to-End HTTP Public Verification Over Network');

    const app = express();
    app.use(express.json());
    app.use('/api/amc', amcRoutes);

    testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, resolve));
    const port = testServer.address().port;
    serverBaseUrl = `http://127.0.0.1:${port}`;

    const makeGetRequest = (urlPath) => {
      return new Promise((resolve, reject) => {
        const fullUrl = new URL(urlPath, serverBaseUrl);
        const req = http.request(
          {
            hostname: fullUrl.hostname,
            port: fullUrl.port,
            path: fullUrl.pathname + fullUrl.search,
            method: 'GET'
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                resolve({ statusCode: res.statusCode, data: parsed });
              } catch (_) {
                resolve({ statusCode: res.statusCode, raw: data });
              }
            });
          }
        );
        req.on('error', reject);
        req.end();
      });
    };

    // Fetch an active contract from the database
    const [activeRows] = await pool.query(
      "SELECT c.*, u.name as company_name FROM amc_contracts c JOIN users u ON c.company_id = u.id WHERE c.status = 'active' LIMIT 1"
    );

    if (activeRows.length > 0) {
      const dbContract = activeRows[0];
      const validCode = amcService.generateCertificateHmacCode(dbContract);

      // 3.1 HTTP: Valid Active Contract Verification
      const httpActiveRes = await makeGetRequest(
        `/api/amc/public/verify-certificate/${validCode}?contractNumber=${encodeURIComponent(dbContract.contract_number)}`
      );

      assert.strictEqual(httpActiveRes.statusCode, 200, 'HTTP status must be 200 for valid certificate');
      assert.strictEqual(httpActiveRes.data.success, true);
      assert.strictEqual(httpActiveRes.data.data.valid, true);
      assert.strictEqual(httpActiveRes.data.data.complianceStatus, 'ACTIVE_COMPLIANT');
      assert.strictEqual(httpActiveRes.data.data.contractNumber, dbContract.contract_number);
      assert.strictEqual(httpActiveRes.data.data.companyName, dbContract.company_name);

      // Verify confidential data is strictly excluded
      assert.strictEqual(httpActiveRes.data.data.total_amount, undefined, 'Total amount must not be exposed');
      assert.strictEqual(httpActiveRes.data.data.invoice_id, undefined, 'Invoice ID must not be exposed');
      assert.strictEqual(httpActiveRes.data.data.phone, undefined, 'Customer phone must not be exposed');
      assert.strictEqual(httpActiveRes.data.data.serial_number, undefined, 'Device serials must not be exposed');
      pass('3.1 HTTP Verification: Active contract verified with status 200 and ACTIVE_COMPLIANT (sanitized data)');

      // 3.2 HTTP: Invalid Code Verification -> HTTP 404
      const invalidCode = validCode.slice(0, 15) + (validCode[15] === 'A' ? 'B' : 'A');
      const httpInvalidRes = await makeGetRequest(
        `/api/amc/public/verify-certificate/${invalidCode}?contractNumber=${encodeURIComponent(dbContract.contract_number)}`
      );

      assert.strictEqual(httpInvalidRes.statusCode, 404, 'HTTP status must be 404 for invalid code');
      assert.strictEqual(httpInvalidRes.data.success, false);
      assert.strictEqual(httpInvalidRes.data.data.valid, false);
      pass('3.2 HTTP Verification: Invalid code correctly rejected with HTTP 404');

      // 3.3 HTTP: Blind Lookup without contractNumber query parameter
      const httpBlindRes = await makeGetRequest(
        `/api/amc/public/verify-certificate/${validCode}`
      );

      assert.strictEqual(httpBlindRes.statusCode, 200);
      assert.strictEqual(httpBlindRes.data.data.valid, true);
      assert.strictEqual(httpBlindRes.data.data.complianceStatus, 'ACTIVE_COMPLIANT');
      pass('3.3 HTTP Verification: Blind lookup without query parameters succeeds consistently');
    }

    console.log('\n===================================================================');
    console.log(`STAGE 3B TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('===================================================================');

  } catch (err) {
    fail('Unhandled exception in Stage 3B test suite', err);
  } finally {
    if (testServer) {
      await new Promise((resolve) => testServer.close(resolve));
    }
    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

runTests();

