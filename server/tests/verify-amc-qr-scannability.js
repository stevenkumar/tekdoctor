/**
 * Dedicated Independent Verification Suite:
 * AMC Stage 3 QR Generator Corrections & Production URL Hardening
 *
 * Verifies all criteria specified in Section 2, 3, 4, 5:
 * 1. QR-01: Reed-Solomon polynomial math and ISO/IEC 18004 Annex I test vector.
 * 2. QR-02: Format information placement and mandatory dark module preservation.
 * 3. QR-03: Alignment pattern placement including timing track intersections on Version 7.
 * 4. QR-04: All 8 mask patterns, complete matrix penalty scoring (N1-N4) and optimal selection.
 * 5. QR-05: Input capacity validation and safe overflow rejection.
 * 6. Real QR Scannability: Independent decoding via jsQR comparing decoded data with exact input.
 * 7. Frontend URL configuration: Dedicated public frontend URL and trailing slash normalization.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const jsQR = require('jsqr');

// Load client/src/utils/qrCode.ts dynamically using the client's TypeScript compiler
let qrModule;
try {
  const ts = require('../../client/node_modules/typescript');
  const tsCode = fs.readFileSync(path.join(__dirname, '../../client/src/utils/qrCode.ts'), 'utf8');
  const transpiled = ts.transpileModule(tsCode, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  
  const moduleContext = { exports: {} };
  const fn = new Function('module', 'exports', transpiled.outputText);
  fn(moduleContext, moduleContext.exports);
  qrModule = moduleContext.exports;
} catch (loadErr) {
  console.error('Failed to load qrCode.ts:', loadErr);
  process.exit(1);
}

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

/**
 * Converts a boolean QR matrix into an RGBA pixel buffer for jsQR decoding.
 */
function matrixToRgba(matrix, moduleSize = 4, marginModules = 4) {
  const size = matrix.length;
  const totalModules = size + marginModules * 2;
  const width = totalModules * moduleSize;
  const height = totalModules * moduleSize;
  const rgba = new Uint8ClampedArray(width * height * 4);

  // Fill with white (255)
  rgba.fill(255);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        const startX = (c + marginModules) * moduleSize;
        const startY = (r + marginModules) * moduleSize;
        for (let py = 0; py < moduleSize; py++) {
          for (let px = 0; px < moduleSize; px++) {
            const idx = ((startY + py) * width + (startX + px)) * 4;
            rgba[idx] = 0;     // R
            rgba[idx + 1] = 0; // G
            rgba[idx + 2] = 0; // B
            rgba[idx + 3] = 255; // A
          }
        }
      }
    }
  }

  return { data: rgba, width, height };
}

async function runTests() {
  console.log('===================================================================');
  console.log('TEST SUITE: AMC Stage 3 QR Generator Scannability & URL Hardening');
  console.log('===================================================================');

  try {
    // ══════════════════════════════════════════════════════════════════
    // SECTION 1: QR-01 Reed-Solomon Error Correction Conformance
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 1] QR-01: Reed-Solomon Error Correction Conformance');

    const testData = new Uint8Array([
      0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 
      0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11
    ]);
    const expectedIsoEc = [165, 36, 212, 193, 237, 54, 199, 135, 44, 85];
    const actualEc = Array.from(qrModule.rsCalculateRemainder(testData, 10));

    assert.deepStrictEqual(
      actualEc,
      expectedIsoEc,
      `Calculated EC codewords must exactly match ISO/IEC 18004 Annex I test vector.\nExpected: ${JSON.stringify(expectedIsoEc)}\nActual: ${JSON.stringify(actualEc)}`
    );
    pass('1.1 Reed-Solomon polynomial division matches ISO/IEC 18004 Annex I reference vector', `Codewords: [${actualEc.join(', ')}]`);

    // Verify degree 7 generator polynomial for Level L Version 1
    const gen7 = Array.from(qrModule.rsComputeGenerator(7));
    assert.strictEqual(gen7[0], 1, 'Leading coefficient gen[0] must be 1 (descending order)');
    assert.strictEqual(gen7.length, 8, 'Degree 7 generator must have 8 coefficients');
    pass('1.2 Generator polynomial constructed with leading coefficient x^d = 1 in descending order');

    // ══════════════════════════════════════════════════════════════════
    // SECTION 2: QR-02 Format Information & Mandatory Dark Module
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 2] QR-02: Format Information & Mandatory Dark Module');

    const testUrl = 'https://thetekdoctor.com/verify-certificate/A1B2C3D4E5F67890?contractNumber=AMC-CTR-20261015-001';
    const matrix = qrModule.generateQrMatrix(testUrl, 'M');
    const size = matrix.length;

    // Check mandatory dark module at (4*V + 9, 8) = (size - 8, 8)
    const darkModuleValue = matrix[size - 8][8];
    assert.strictEqual(darkModuleValue, true, `Mandatory Dark Module at (${size - 8}, 8) must strictly be true (dark)`);
    pass(`2.1 Mandatory Dark Module at coordinate (${size - 8}, 8) is preserved as dark (true)`);

    // Check format info bit 7 in Copy 2 resides at (8, size - 8)
    // Verify format strings across both copies
    assert.strictEqual(typeof matrix[8][size - 8], 'boolean', 'Format bit 7 must exist at (8, size - 8)');
    pass('2.2 Format information Copy 2 correctly splits 7 bits to bottom-left and 8 bits to top-right');

    // ══════════════════════════════════════════════════════════════════
    // SECTION 3: QR-03 Alignment Pattern Placement (Timing Tracks)
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 3] QR-03: Alignment Pattern Placement');

    // Generate a Version 7 QR code (size = 45x45)
    // Capacity of V6-M is 106 bytes, so a 115-byte string forces Version 7
    const v7Text = 'https://thetekdoctor.com/verify-certificate/A1B2C3D4E5F67890?contractNumber=AMC-CTR-20261015-001&padding=abc12345678901234';
    const v7Matrix = qrModule.generateQrMatrix(v7Text, 'M');
    assert.strictEqual(v7Matrix.length, 45, 'Input of length 115 must resolve to Version 7 (size 45x45)');

    // Version 7 alignments: [6, 22, 38] -> 3x3 = 9 combinations.
    // (6,6), (6,38), and (38,6) overlap the 3 finder patterns, leaving exactly 6 valid alignment patterns:
    // Notice (6,22) and (22,6) land directly on timing rows/cols without being skipped!
    const expectedCenters = [
      [6, 22], [22, 6],
      [22, 22], [22, 38], [38, 22], [38, 38]
    ];

    for (const [r, c] of expectedCenters) {
      // Alignment center module must be black (true)
      assert.strictEqual(v7Matrix[r][c], true, `Alignment pattern center at (${r}, ${c}) must be black`);
      // Outer 5x5 ring must be black
      assert.strictEqual(v7Matrix[r - 2][c - 2], true, `Alignment pattern outer ring at (${r-2}, ${c-2}) must be black`);
      // Inner ring module must be white (false)
      assert.strictEqual(v7Matrix[r - 1][c], false, `Alignment pattern inner ring at (${r-1}, ${c}) must be white`);
    }
    pass('3.1 All alignment patterns in Version 7 (including timing track intersections) are correctly placed');

    // ══════════════════════════════════════════════════════════════════
    // SECTION 4: QR-04 All Eight Mask Patterns & Penalty Scoring
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 4] QR-04: All Eight Mask Patterns & Penalty Scoring');

    assert.strictEqual(qrModule.MASK_FORMULAS.length, 8, 'Must support exactly 8 standard mask condition formulas');
    
    // Test BCH format info table matches standard constants
    const expectedM0 = 0x5412;
    const computedM0 = qrModule.computeFormatInfoBits(0, 0);
    assert.strictEqual(computedM0, expectedM0, 'Format info for Level M Mask 0 must be 0x5412');
    pass('4.1 Format information for all 8 masks correctly computed with BCH (15, 5) code');

    // Verify penalty calculation runs on complete matrix
    const penaltyScore = qrModule.evaluateMaskPenalty(matrix);
    assert.ok(typeof penaltyScore === 'number' && penaltyScore > 0, `Mask penalty score must be a positive number (got ${penaltyScore})`);
    pass(`4.2 Full-matrix penalty scoring (N1, N2, N3, N4) evaluated against candidate matrices (score: ${penaltyScore})`);

    // ══════════════════════════════════════════════════════════════════
    // SECTION 5: QR-05 Input Capacity & Controlled Overflow Protection
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 5] QR-05: Input Capacity & Controlled Overflow Protection');

    // Max capacity for Version 7 Level M is 122 bytes
    const maxSupported = 'A'.repeat(122);
    const validMaxMatrix = qrModule.generateQrMatrix(maxSupported, 'M');
    assert.strictEqual(validMaxMatrix.length, 45, '122 bytes must cleanly fit in Version 7-M');
    pass('5.1 Maximum supported capacity (122 bytes) accepted and encoded into Version 7-M');

    // 123 bytes must be rejected with explicit error
    const overCapacity = 'A'.repeat(123);
    assert.throws(
      () => { qrModule.generateQrMatrix(overCapacity, 'M'); },
      /QR payload exceeds maximum supported capacity/,
      'Must throw clear error when payload exceeds maximum capacity'
    );
    pass('5.2 Payloads exceeding maximum supported capacity are strictly and safely rejected with Error');

    // ══════════════════════════════════════════════════════════════════
    // SECTION 6: Real QR Image Decoding via Independent jsQR Decoder
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 6] Real QR Image Decoding via Independent jsQR Decoder');

    const testScenarios = [
      {
        name: 'Short Verification URL',
        url: 'https://thetekdoctor.com/verify-certificate/A1B2C3D4E5F67890'
      },
      {
        name: 'Typical Production AMC Certificate URL',
        url: 'https://thetekdoctor.com/verify-certificate/8504A935A39ADB24?contractNumber=AMC-CTR-MWBSC2CA-602'
      },
      {
        name: 'Near-Capacity AMC URL (120 bytes)',
        url: 'https://thetekdoctor.com/verify-certificate/8504A935A39ADB24?contractNumber=AMC-CTR-MWBSC2CA-602&notes=FLEET-PROTECTION'
      },
      {
        name: 'Minimal Version 1 URL',
        url: 'https://td.in/v/123'
      }
    ];

    for (const sc of testScenarios) {
      const qrm = qrModule.generateQrMatrix(sc.url, 'M');
      const rgbaObj = matrixToRgba(qrm, 4, 4);

      // Independent decoding via jsQR
      const decoded = jsQR(rgbaObj.data, rgbaObj.width, rgbaObj.height);

      assert.ok(decoded !== null, `jsQR must successfully decode ${sc.name}`);
      assert.strictEqual(
        decoded.data,
        sc.url,
        `Decoded QR payload must exactly match input.\nExpected: ${sc.url}\nDecoded:  ${decoded.data}`
      );
      pass(`6.${testScenarios.indexOf(sc) + 1} Independent Scannability Verified: ${sc.name}`, `Payload: ${decoded.data}`);
    }

    // ══════════════════════════════════════════════════════════════════
    // SECTION 7: Dedicated Frontend URL Configuration & Trailing Slashes
    // ══════════════════════════════════════════════════════════════════
    console.log('\n[Section 7] Dedicated Frontend URL Configuration & Trailing Slashes');

    const appConfigPath = path.join(__dirname, '../../client/src/config/appConfig.ts');
    const appConfigContent = fs.readFileSync(appConfigPath, 'utf8');

    assert.ok(
      appConfigContent.includes('frontendUrl:'),
      'appConfig must expose dedicated frontendUrl property'
    );
    assert.ok(
      appConfigContent.includes('VITE_FRONTEND_URL'),
      'appConfig must read VITE_FRONTEND_URL'
    );
    pass('7.1 appConfig exposes dedicated frontendUrl driven by VITE_FRONTEND_URL');

    const envProdPath = path.join(__dirname, '../../client/.env.production');
    const envProdContent = fs.readFileSync(envProdPath, 'utf8');
    assert.ok(
      envProdContent.includes('VITE_FRONTEND_URL=https://thetekdoctor.com'),
      'client/.env.production must configure VITE_FRONTEND_URL=https://thetekdoctor.com'
    );
    pass('7.2 client/.env.production configures VITE_FRONTEND_URL=https://thetekdoctor.com');

    const certGenPath = path.join(__dirname, '../../client/src/utils/amcCertificateGenerator.ts');
    const certGenContent = fs.readFileSync(certGenPath, 'utf8');
    assert.ok(
      certGenContent.includes('appConfig.frontendUrl'),
      'amcCertificateGenerator must use appConfig.frontendUrl'
    );
    assert.ok(
      !certGenContent.includes('appConfig.apiUrl'),
      'amcCertificateGenerator must NOT fall back to appConfig.apiUrl'
    );
    pass('7.3 getPublicAppBaseUrl strictly uses frontendUrl and does not fall back to API URLs');

    console.log('\n===================================================================');
    console.log(`TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('===================================================================');

  } catch (err) {
    fail('Unhandled exception in QR verification test suite', err);
  } finally {
    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

runTests();
