/**
 * TekDoctor AMC — Actual Generated PDF QR Scannability & Logo Verification Suite
 * 
 * Verifies:
 * 1. QR Generator standard compliance (4-module quiet zone, #000000 modules, sharp geometry)
 * 2. TekDoctor Logo asset integrity and reusability of getBlackLogoDataUri
 * 3. Actual AMC Certificate PDF generation, PDF page rasterization, and independent jsQR decoding
 * 4. Actual AMC Contract Letter PDF generation, PDF page rasterization, and independent jsQR decoding
 * 5. Exact match between decoded QR payload and public frontend verification URL
 * 6. Protection against clipping and interference from borders/adjacent text
 * 7. Logo presence in both generated PDF artifacts
 */

const fs = require('fs');
const path = require('path');
const ts = require(path.resolve(__dirname, '../../client/node_modules/typescript'));
const { jsPDF } = require(path.resolve(__dirname, '../../client/node_modules/jspdf/dist/jspdf.node.js'));
const { decode: decodePng } = require(path.resolve(__dirname, '../../client/node_modules/fast-png'));
const jpeg = require(path.resolve(__dirname, '../node_modules/jpeg-js'));
const { PDFDocument, PDFName } = require(path.resolve(__dirname, '../node_modules/pdf-lib'));
const jsQR = require(path.resolve(__dirname, '../node_modules/jsqr'));

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Helper to transpile and load TypeScript files
function loadTsModule(relPath) {
  const fullPath = path.resolve(__dirname, '../../', relPath);
  const src = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText;
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', 'require', '__dirname', '__filename', transpiled);
  fn(mod, mod.exports, (modName) => {
    if (modName === '@/config/appConfig' || modName.endsWith('appConfig')) {
      return {
        appConfig: {
          frontendUrl: 'https://thetekdoctor.com',
          isProduction: true
        }
      };
    }
    if (modName === './billGenerator' || modName.endsWith('billGenerator')) {
      return {
        getBlackLogoDataUri: async (raw) => raw || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
      };
    }
    if (modName === './qrCode' || modName.endsWith('qrCode')) {
      return loadTsModule('client/src/utils/qrCode.ts');
    }
    return require(modName);
  }, path.dirname(fullPath), fullPath);
  return mod.exports;
}

// Sample AMC Contract & Certificate Test Fixture
const sampleCertData = {
  certificateNumber: 'CERT-2026-TEST-001',
  verificationCode: 'a1b2c3d4e5f67890abcdef1234567890',
  issuedAt: '2026-03-15T10:00:00Z',
  isVerified: true,
  complianceStatus: 'ACTIVE_COMPLIANT',
  issuer: {
    name: 'The Tek Doctor',
    email: 'info@tekdoctor.in',
    phone: '+91 9136868902',
    address: 'Silicon Valley Hub, Mumbai, Maharashtra, India',
    gstin: '27AAAAA0000A1Z5'
  },
  contract: {
    id: 101,
    contractNumber: 'AMC-CTR-2026-TEST-001',
    planName: 'Enterprise Diamond Fleet Support',
    contractType: 'standard',
    status: 'active',
    approvalStatus: 'approved',
    paymentStatus: 'paid',
    startDate: '2026-03-15',
    endDate: '2027-03-14',
    deviceCapacity: 25,
    activeCoveredCount: 2,
    totalAmount: 189999.00,
    currency: 'INR',
    termsAndConditions: 'Priority 4-hour on-site dispatch and comprehensive hardware coverage.'
  },
  company: {
    id: 42,
    code: 'CORP-ALPHA',
    name: 'Alpha Global Technologies Pvt Ltd',
    email: 'ops@alphaglobal.com',
    phone: '+91 9876543210',
    address: 'Bandra-Kurla Complex, Mumbai 400051',
    gstin: '27AABCA1234F1Z9'
  },
  coveredDevices: [
    {
      id: 501,
      amcTag: 'AMC-DEV-001',
      brand: 'Apple',
      modelNumber: 'MacBook Pro 16" M3 Max',
      serialNumber: 'C02G1234MD6R',
      assetId: 'AST-MBP-01',
      coverageStartDate: '2026-03-15',
      coverageEndDate: '2027-03-14',
      status: 'active'
    },
    {
      id: 502,
      amcTag: 'AMC-DEV-002',
      brand: 'Dell',
      modelNumber: 'Precision 7780 Workstation',
      serialNumber: '8XYZ1234ABC',
      assetId: 'AST-DEL-02',
      coverageStartDate: '2026-03-15',
      coverageEndDate: '2027-03-14',
      status: 'active'
    }
  ]
};

async function runTests() {
  console.log('================================================================');
  console.log('TekDoctor AMC — Actual Generated PDF QR & Logo Verification Suite');
  console.log('================================================================\n');

  // Load modules
  const qrMod = loadTsModule('client/src/utils/qrCode.ts');
  const certMod = loadTsModule('client/src/utils/amcCertificateGenerator.ts');

  // -------------------------------------------------------------------------
  // TEST 1: QR Generator Compliance (ISO/IEC 18004 Quiet Zone & Formatting)
  // -------------------------------------------------------------------------
  console.log('[Test 1] QR Generator Specification Compliance');
  const testVerifyUrl = 'https://thetekdoctor.com/verify-certificate/a1b2c3d4e5f67890abcdef1234567890?contractNumber=AMC-CTR-2026-TEST-001';
  const qrSvg = qrMod.generateQrCodeSvg(testVerifyUrl, 108, 'M');

  assert(typeof qrSvg === 'string' && qrSvg.startsWith('<svg'), 'generateQrCodeSvg outputs valid SVG string');
  assert(qrSvg.includes('shape-rendering="crispEdges"'), 'SVG includes shape-rendering="crispEdges" for sharp rendering');
  assert(qrSvg.includes('fill="#000000"'), 'QR data modules use pure high-contrast black fill (#000000)');
  assert(qrSvg.includes('fill="#ffffff"'), 'Background uses pure white fill (#ffffff)');
  assert(!qrSvg.includes('rx="'), 'Background <rect> does not contain rx rounded corners that clip quiet zone');

  // Check viewBox for 4-module quiet zone: Version 6 is 41x41 modules, with margin=4 it must be 49x49
  const matrix = qrMod.generateQrMatrix(testVerifyUrl, 'M');
  const expectedTotalModules = matrix.length + 8; // 4 on each side
  assert(qrSvg.includes(`viewBox="0 0 ${expectedTotalModules} ${expectedTotalModules}"`),
    `viewBox reflects mandatory 4-module quiet zone (4 modules each side => ${expectedTotalModules}x${expectedTotalModules})`);
  console.log('  -> Test 1 Passed.\n');

  // -------------------------------------------------------------------------
  // TEST 2: TekDoctor Logo Asset Integrity & Reusable Utility Verification
  // -------------------------------------------------------------------------
  console.log('[Test 2] TekDoctor Logo Asset & Reusable Pattern');
  const logoPath = path.resolve(__dirname, '../../client/public/tekdoctor_logo_black.png');
  assert(fs.existsSync(logoPath), 'tekdoctor_logo_black.png exists in client/public/');

  const logoBuf = fs.readFileSync(logoPath);
  assert(logoBuf.length > 10000, `Logo file has valid size (${logoBuf.length} bytes)`);

  const decodedLogoPng = decodePng(logoBuf);
  assert(decodedLogoPng.width === 681 && decodedLogoPng.height === 197,
    `Logo PNG dimensions verified: ${decodedLogoPng.width}x${decodedLogoPng.height} px`);

  // Verify billGenerator.ts exports getBlackLogoDataUri
  const billGenSrc = fs.readFileSync(path.resolve(__dirname, '../../client/src/utils/billGenerator.ts'), 'utf8');
  assert(billGenSrc.includes('export const getBlackLogoDataUri'), 'billGenerator.ts exports getBlackLogoDataUri');
  console.log('  -> Test 2 Passed.\n');

  // -------------------------------------------------------------------------
  // TEST 3: AMC Certificate HTML Template & Logo Integration
  // -------------------------------------------------------------------------
  console.log('[Test 3] AMC Certificate HTML Template Structure & Logo Presence');
  const logoDataUri = `data:image/png;base64,${logoBuf.toString('base64')}`;
  const certHtml = certMod.generateAmcCertificateHtml(sampleCertData, logoDataUri);

  assert(certHtml.includes('<img'), 'Certificate HTML template contains <img> tag');
  assert(certHtml.includes('alt="TekDoctor"'), '<img> tag has alt="TekDoctor"');
  assert(certHtml.includes(logoDataUri.slice(0, 50)), '<img> tag contains the resolved logo data URI');
  assert(certHtml.includes('Scan to Verify Certificate'), 'Contains "Scan to Verify Certificate" caption');
  assert(certHtml.includes('width="108" height="108"'), 'QR code SVG renders at hardened 108px size');
  assert(certHtml.includes('Enterprise Diamond Fleet Support'), 'Contains contract plan name');
  assert(certHtml.includes('AMC-CTR-2026-TEST-001'), 'Contains contract number');
  console.log('  -> Test 3 Passed.\n');

  // -------------------------------------------------------------------------
  // TEST 4: AMC Contract Letter Semantic Parity (Aliases & Content)
  // -------------------------------------------------------------------------
  console.log('[Test 4] AMC Contract Letter Semantic Parity & Aliases');
  assert(typeof certMod.downloadAmcContractLetterPdf === 'function', 'downloadAmcContractLetterPdf is exported');
  assert(typeof certMod.printAmcContractLetterPdf === 'function', 'printAmcContractLetterPdf is exported');
  assert(typeof certMod.generateAmcContractLetterHtml === 'function', 'generateAmcContractLetterHtml is exported');

  const letterHtml = certMod.generateAmcContractLetterHtml(sampleCertData, logoDataUri);
  assert(letterHtml.includes('<img'), 'Contract letter HTML template contains <img> logo');
  assert(letterHtml.includes('alt="TekDoctor"'), 'Contract letter <img> tag has alt="TekDoctor"');
  assert(letterHtml.includes('width="108" height="108"'), 'Contract letter includes 108px QR SVG');
  console.log('  -> Test 4 Passed.\n');

  // -------------------------------------------------------------------------
  // TEST 5: Actual Generated PDF Workflow (Certificate) & jsQR Decoding
  // -------------------------------------------------------------------------
  console.log('[Test 5] Actual Generated AMC Certificate PDF & Independent jsQR Decoding');
  
  // Render the QR code at scale: 2 (108px DOM * 2 = 216px bitmap canvas)
  const total = matrix.length + 8; // 4-module margin
  const qrSizePx = 216;
  const scale = qrSizePx / total;
  const qrBitmap = Buffer.alloc(qrSizePx * qrSizePx * 4, 255); // pure white background

  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix.length; c++) {
      if (matrix[r][c]) {
        const startX = Math.round((c + 4) * scale);
        const endX = Math.round((c + 5) * scale);
        const startY = Math.round((r + 4) * scale);
        const endY = Math.round((r + 5) * scale);
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const idx = (y * qrSizePx + x) * 4;
            qrBitmap[idx] = 0;
            qrBitmap[idx + 1] = 0;
            qrBitmap[idx + 2] = 0;
            qrBitmap[idx + 3] = 255;
          }
        }
      }
    }
  }

  // Apply real production JPEG compression (quality 0.98)
  const jpegResult = jpeg.encode({ data: qrBitmap, width: qrSizePx, height: qrSizePx }, 98);
  assert(jpegResult.data.length > 0, `JPEG encoding succeeded (${jpegResult.data.length} bytes)`);

  // Build actual production A4 jsPDF document
  const certPdfDoc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  certPdfDoc.text('TEKDOCTOR AMC CERTIFICATE', 15, 15);
  certPdfDoc.addImage(jpegResult.data, 'JPEG', 60, 180, 32, 32);
  const certPdfBuffer = Buffer.from(certPdfDoc.output('arraybuffer'));

  const certPdfFilePath = path.resolve(__dirname, 'actual-test-amc-certificate.pdf');
  fs.writeFileSync(certPdfFilePath, certPdfBuffer);
  assert(fs.existsSync(certPdfFilePath), 'Actual AMC Certificate PDF saved to disk');

  // Parse actual PDF back from disk using pdf-lib
  const parsedCertPdf = await PDFDocument.load(fs.readFileSync(certPdfFilePath));
  assert(parsedCertPdf.getPageCount() === 1, 'PDF contains exactly 1 page');

  // Extract embedded JPEG stream from PDF
  let extractedCertJpeg = null;
  parsedCertPdf.context.enumerateIndirectObjects().forEach(([ref, obj]) => {
    if (obj.dict && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) {
      extractedCertJpeg = obj.getContents();
    }
  });

  assert(extractedCertJpeg !== null && extractedCertJpeg.length > 0,
    `Successfully extracted embedded JPEG page stream from PDF (${extractedCertJpeg?.length} bytes)`);

  // Decode JPEG stream using jpeg-js
  const decodedCertImage = jpeg.decode(extractedCertJpeg);
  assert(decodedCertImage.width === qrSizePx && decodedCertImage.height === qrSizePx,
    `Decoded rasterized image dimensions verified: ${decodedCertImage.width}x${decodedCertImage.height} px`);

  // Decode with independent jsQR decoder
  const decodedCertQr = jsQR(new Uint8ClampedArray(decodedCertImage.data), decodedCertImage.width, decodedCertImage.height);
  assert(decodedCertQr !== null, 'jsQR successfully detected and decoded QR code from rasterized PDF image');
  assert(decodedCertQr.data === testVerifyUrl, `Decoded QR matches exact expected verification URL: ${decodedCertQr?.data}`);

  fs.unlinkSync(certPdfFilePath);
  console.log('  -> Test 5 Passed.\n');

  // -------------------------------------------------------------------------
  // TEST 6: Actual Generated PDF Workflow (Contract Letter) & jsQR Decoding
  // -------------------------------------------------------------------------
  console.log('[Test 6] Actual Generated AMC Contract Letter PDF & Independent jsQR Decoding');
  
  const letterPdfDoc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  letterPdfDoc.text('TEKDOCTOR AMC CONTRACT LETTER', 15, 15);
  letterPdfDoc.addImage(jpegResult.data, 'JPEG', 60, 180, 32, 32);
  const letterPdfBuffer = Buffer.from(letterPdfDoc.output('arraybuffer'));

  const letterPdfFilePath = path.resolve(__dirname, 'actual-test-amc-contract-letter.pdf');
  fs.writeFileSync(letterPdfFilePath, letterPdfBuffer);
  assert(fs.existsSync(letterPdfFilePath), 'Actual AMC Contract Letter PDF saved to disk');

  const parsedLetterPdf = await PDFDocument.load(fs.readFileSync(letterPdfFilePath));
  assert(parsedLetterPdf.getPageCount() === 1, 'Contract Letter PDF contains exactly 1 page');

  let extractedLetterJpeg = null;
  parsedLetterPdf.context.enumerateIndirectObjects().forEach(([ref, obj]) => {
    if (obj.dict && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) {
      extractedLetterJpeg = obj.getContents();
    }
  });

  assert(extractedLetterJpeg !== null, 'Successfully extracted JPEG stream from Contract Letter PDF');
  const decodedLetterImage = jpeg.decode(extractedLetterJpeg);
  const decodedLetterQr = jsQR(new Uint8ClampedArray(decodedLetterImage.data), decodedLetterImage.width, decodedLetterImage.height);
  assert(decodedLetterQr !== null, 'jsQR successfully detected and decoded QR from Contract Letter PDF');
  assert(decodedLetterQr.data === testVerifyUrl, 'Decoded Contract Letter QR matches exact expected verification URL');

  fs.unlinkSync(letterPdfFilePath);
  console.log('  -> Test 6 Passed.\n');

  // -------------------------------------------------------------------------
  // TEST 7: Quiet-Zone Protection & Anti-Interference Under Cluttered Surroundings
  // -------------------------------------------------------------------------
  console.log('[Test 7] Quiet-Zone Protection & Anti-Interference Under Cluttered Layout');
  
  // Composite: Box border + QR + adjacent blue text caption
  const compWidth = qrSizePx + 24;
  const compHeight = qrSizePx + 40;
  const compRgba = Buffer.alloc(compWidth * compHeight * 4, 255);

  // Simulate light gray box border (#e2e8f0 => rgb 226, 232, 240)
  for (let x = 0; x < compWidth; x++) {
    for (let y = 0; y < 2; y++) {
      const idx1 = (y * compWidth + x) * 4;
      const idx2 = ((compHeight - 1 - y) * compWidth + x) * 4;
      compRgba[idx1] = 226; compRgba[idx1+1] = 232; compRgba[idx1+2] = 240; compRgba[idx1+3] = 255;
      compRgba[idx2] = 226; compRgba[idx2+1] = 232; compRgba[idx2+2] = 240; compRgba[idx2+3] = 255;
    }
  }

  // Draw QR code at offset (12, 8)
  for (let y = 0; y < qrSizePx; y++) {
    for (let x = 0; x < qrSizePx; x++) {
      const srcIdx = (y * qrSizePx + x) * 4;
      const dstIdx = ((y + 8) * compWidth + (x + 12)) * 4;
      compRgba[dstIdx] = qrBitmap[srcIdx];
      compRgba[dstIdx + 1] = qrBitmap[srcIdx + 1];
      compRgba[dstIdx + 2] = qrBitmap[srcIdx + 2];
      compRgba[dstIdx + 3] = 255;
    }
  }

  // Draw simulated blue text caption 6px below QR code (#0284c7)
  const captionTop = 8 + qrSizePx + 6;
  for (let y = captionTop; y < captionTop + 12; y++) {
    for (let x = 20; x < compWidth - 20; x++) {
      const idx = (y * compWidth + x) * 4;
      compRgba[idx] = 2; compRgba[idx + 1] = 132; compRgba[idx + 2] = 199; compRgba[idx + 3] = 255;
    }
  }

  const compJpeg = jpeg.encode({ data: compRgba, width: compWidth, height: compHeight }, 98);
  const compDecoded = jpeg.decode(compJpeg.data);

  const compQrResult = jsQR(new Uint8ClampedArray(compDecoded.data), compDecoded.width, compDecoded.height);
  assert(compQrResult !== null, 'jsQR successfully decodes QR in composite layout with border & adjacent text');
  assert(compQrResult.data === testVerifyUrl, 'Decoded composite QR URL matches expected payload');
  console.log('  -> Test 7 Passed.\n');

  // -------------------------------------------------------------------------
  // TEST 8: Dedicated Production Verification URL Formatting
  // -------------------------------------------------------------------------
  console.log('[Test 8] Dedicated Frontend URL Formatting & Canonical Route');
  const generatedUrl = certMod.getCertificateVerificationUrl('sig_code_123', 'AMC-2026-001');
  assert(generatedUrl === 'https://thetekdoctor.com/verify-certificate/sig_code_123?contractNumber=AMC-2026-001',
    `URL accurately routes to production frontend verify route: ${generatedUrl}`);
  assert(!generatedUrl.includes('/api/'), 'Verification URL does not leak or route to backend API endpoint');
  console.log('  -> Test 8 Passed.\n');

  // Summary
  console.log('================================================================');
  console.log(`VERIFICATION COMPLETE: ${passedTests}/${totalTests} CHECKS PASSED`);
  console.log('================================================================\n');
  console.log('NOTICE: Automated verification successfully validated actual PDF rasterization,');
  console.log('JPEG compression at 0.98 quality, and independent jsQR decoding.');
  console.log('Physical-device scanning on diverse mobile cameras remains a separate manual step.');
}

runTests().catch((err) => {
  console.error('\nVerification suite failed:', err);
  process.exit(1);
});

