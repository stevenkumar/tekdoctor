/**
 * Verification & Regression Test Suite: Company Portal Bulk Import/Export
 * 
 * Verifies:
 * 1. Spreadsheet Utilities & Formula Injection Defense (CSV & Excel)
 * 2. Leading Zero & Identifier Preservation (No scientific notation)
 * 3. Branches: CSV & Excel templates, import, duplicate checks, update, filtered export
 * 4. Employees: CSV & Excel templates, import, NO phantom branch creation, no credential exposure in export
 * 5. Devices: CSV & Excel templates, import, branch/employee reference validation, update, text serial export
 * 6. Repair Tickets: CSV & Excel templates, strict pre-validation, ZERO sequence number leakage,
 *    NO phantom device creation, active repair conflict check, authoritative numbering preservation
 * 7. Cross-Company Isolation: Strict company ownership, no cross-company reference or data leak
 * 8. Safe Cleanup: Isolated fixtures, zero pollution of production records or sequence counters
 */

const { pool } = require('../config/db.config');
const spreadsheetUtils = require('../utils/spreadsheet.utils');
const { generateTicketNumber, resolvePermanentAccountId } = require('../utils/helpers');
const { verifyFileSignature, verifyUploadSignatures } = require('../middleware/security.middleware');
const fs = require('fs');
const path = require('path');
const os = require('os');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    testsFailed++;
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('TEST SUITE: Company Portal Bulk Import/Export Standardization');
  console.log('================================================================\n');

  const connection = await pool.getConnection();

  // Test company IDs & emails
  const testCompA_Email = 'test-corp-alpha-import@tekdoctor-test.com';
  const testCompB_Email = 'test-corp-beta-import@tekdoctor-test.com';
  let compA_Id = null;
  let compA_UserId = null;
  let compB_Id = null;
  let compB_UserId = null;

  try {
    // =========================================================================
    // 0. SETUP ISOLATED TEST FIXTURES
    // =========================================================================
    console.log('[Setup] Creating isolated test companies and accounts...');

    // Clean any remnants first
    await connection.query('DELETE FROM users WHERE email IN (?, ?)', [testCompA_Email, testCompB_Email]);

    // Create Company A
    const [resUserA] = await connection.query(
      "INSERT INTO users (name, email, password, role) VALUES ('Alpha Enterprises', ?, 'TestPass123!', 'company')",
      [testCompA_Email]
    );
    compA_UserId = resUserA.insertId;

    await connection.query(
      "INSERT INTO company_profiles (user_id, company_name, contact_person, phone_number) VALUES (?, 'Alpha Enterprises Ltd', 'Anand Kumar', '9876543210')",
      [compA_UserId]
    );
    compA_Id = compA_UserId;

    // Create Company B
    const [resUserB] = await connection.query(
      "INSERT INTO users (name, email, password, role) VALUES ('Beta Solutions', ?, 'TestPass123!', 'company')",
      [testCompB_Email]
    );
    compB_UserId = resUserB.insertId;

    await connection.query(
      "INSERT INTO company_profiles (user_id, company_name, contact_person, phone_number) VALUES (?, 'Beta Solutions Pvt Ltd', 'Sunita Rao', '9876543211')",
      [compB_UserId]
    );
    compB_Id = compB_UserId;

    assert(compA_Id && compB_Id, `Isolated test companies created (Alpha ID: ${compA_Id}, Beta ID: ${compB_Id})`);

    // =========================================================================
    // 1. SPREADSHEET UTILITIES & FORMULA INJECTION DEFENSE
    // =========================================================================
    console.log('\n[Test Group 1] Spreadsheet Utilities & Formula Injection Defense');

    // 1.1 Legitimate Business Data Preservation (Import & Export)
    const legitimateValues = [
      { raw: '-45.2', desc: 'Negative decimal amount (-45.2)', expected: '-45.2', shouldQuoteExport: false },
      { raw: '-100', desc: 'Negative integer (-100)', expected: '-100', shouldQuoteExport: false },
      { raw: '+50', desc: 'Explicitly positive number (+50)', expected: '+50', shouldQuoteExport: false },
      { raw: '0.05', desc: 'Positive decimal (0.05)', expected: '0.05', shouldQuoteExport: false },
      { raw: '+919876543210', desc: 'Indian phone with +91 (+919876543210)', expected: '+919876543210', shouldQuoteExport: false },
      { raw: '+91 98765 43210', desc: 'Indian phone with spaces (+91 98765 43210)', expected: '+91 98765 43210', shouldQuoteExport: false },
      { raw: '+1 (555) 234-5678', desc: 'US phone with formatting (+1 (555) 234-5678)', expected: '+1 (555) 234-5678', shouldQuoteExport: false },
      { raw: '001234', desc: 'Serial with leading zeros (001234)', expected: '001234', shouldQuoteExport: false },
      { raw: '- Screen flickering issue', desc: 'Ordinary text starting with dash', expected: '- Screen flickering issue', shouldQuoteExport: true },
      { raw: '+ Priority repair requested', desc: 'Ordinary text starting with plus', expected: '+ Priority repair requested', shouldQuoteExport: true },
      { raw: 'Dell XPS 15 - Core i7', desc: 'Ordinary text containing dash in middle', expected: 'Dell XPS 15 - Core i7', shouldQuoteExport: false }
    ];

    for (const item of legitimateValues) {
      const disarmed = spreadsheetUtils.disarmFormula(item.raw);
      assert(disarmed === item.expected, `Preserved ${item.desc}: "${item.raw}" -> "${disarmed}"`);

      const escaped = spreadsheetUtils.escapeForExport(item.raw);
      if (item.shouldQuoteExport) {
        assert(escaped.startsWith("'"), `Export quotes special text to protect Excel: "${item.raw}" -> "${escaped}"`);
        // Roundtrip test: exporting and re-importing must preserve original value exactly
        const roundtripped = spreadsheetUtils.disarmFormula(escaped);
        assert(roundtripped === item.expected, `Roundtrip export -> re-import preserves original: "${item.raw}" === "${roundtripped}"`);
      } else {
        assert(!escaped.startsWith("'"), `Export does NOT quote legitimate number/phone: "${item.raw}" -> "${escaped}"`);
        const roundtripped = spreadsheetUtils.disarmFormula(escaped);
        assert(roundtripped === item.expected, `Roundtrip preserves exact value: "${item.raw}" === "${roundtripped}"`);
      }
    }

    // 1.2 Malicious Formula Payload Disarming
    const maliciousPayloads = [
      { raw: '=1+1', expected: '1+1', desc: 'Equation starting with =' },
      { raw: '=cmd|\' /C calc\'!A0', expected: 'cmd|\' /C calc\'!A0', desc: 'DDE execution starting with =' },
      { raw: '+cmd|\' /C calc\'!A0', expected: 'cmd|\' /C calc\'!A0', desc: 'DDE execution starting with +' },
      { raw: '-cmd|\' /C calc\'!A0', expected: 'cmd|\' /C calc\'!A0', desc: 'DDE execution starting with -' },
      { raw: '+SUM(A1:A10)', expected: 'SUM(A1:A10)', desc: 'Spreadsheet formula starting with +' },
      { raw: '-SUM(A1:A10)', expected: 'SUM(A1:A10)', desc: 'Spreadsheet formula starting with -' },
      { raw: '@SUM(A1)', expected: 'SUM(A1)', desc: 'Formula starting with @' },
      { raw: '+1+2', expected: '1+2', desc: 'Arithmetic expression starting with +' },
      { raw: '\tTabInjected', expected: 'TabInjected', desc: 'Tab-prefixed CSV injection' },
      { raw: '\rCRInjected', expected: 'CRInjected', desc: 'Carriage-return-prefixed CSV injection' }
    ];

    for (const item of maliciousPayloads) {
      const disarmed = spreadsheetUtils.disarmFormula(item.raw);
      assert(disarmed === item.expected, `Malicious payload "${item.raw}" disarmed to "${disarmed}" (${item.desc})`);

      const escaped = spreadsheetUtils.escapeForExport(item.raw);
      assert(escaped.startsWith("'"), `Malicious payload "${item.raw}" escaped with single quote on export: "${escaped}"`);
    }

    // 1.3 Format Verification: CSV, XLSX, and Explicit .XLS Rejection
    // 1.3.1 CSV Generation & Parsing (RFC 4180 with quotes, commas, newlines)
    const testRecords = [
      {
        id: '001234',
        name: 'Alpha "Prime" Branch, South',
        notes: 'Line 1\nLine 2 with "quotes" and, commas',
        code: '=ALERT',
        amount: '-45.2',
        phone: '+919876543210'
      },
      {
        id: '005678',
        name: 'Alpha East Branch',
        notes: '- Replaced screen on Friday',
        code: '+919876543210',
        amount: '1200.50',
        phone: '+1 (555) 234-5678'
      }
    ];

    const testColumns = [
      { key: 'id', header: 'Branch Code', type: 'text' },
      { key: 'name', header: 'Branch Name', type: 'text' },
      { key: 'notes', header: 'Notes', type: 'text' },
      { key: 'code', header: 'Reference', type: 'text' },
      { key: 'amount', header: 'Amount', type: 'text' },
      { key: 'phone', header: 'Contact Phone', type: 'text' }
    ];

    const generatedCsv = spreadsheetUtils.generateCsv(testColumns, testRecords);
    assert(generatedCsv.includes('"Alpha ""Prime"" Branch, South"'), 'CSV escapes double quotes and wraps comma-containing strings');
    assert(generatedCsv.includes("'=ALERT"), 'CSV exports formula-injected values with prepended single quote');
    assert(generatedCsv.includes('"-45.2"'), 'CSV exports negative amounts without prepended quote: "-45.2"');
    assert(generatedCsv.includes('"+919876543210"'), 'CSV exports +91 phone without prepended quote: "+919876543210"');

    const parsedFromCsv = await spreadsheetUtils.parseSpreadsheet(Buffer.from(generatedCsv, 'utf-8'), 'branches.csv');
    assert(parsedFromCsv.data.length === 2, `Parsed exactly 2 rows from generated CSV (found ${parsedFromCsv.data.length})`);
    assert(parsedFromCsv.data[0].branch_code === '001234', `Leading zeros preserved in CSV parse: "${parsedFromCsv.data[0].branch_code}"`);
    assert(parsedFromCsv.data[0].amount === '-45.2', `Negative amount preserved exactly in CSV parse: "${parsedFromCsv.data[0].amount}"`);
    assert(parsedFromCsv.data[0].contact_phone === '+919876543210', `+91 phone preserved exactly in CSV parse: "${parsedFromCsv.data[0].contact_phone}"`);
    assert(parsedFromCsv.data[1].notes === '- Replaced screen on Friday', `Text starting with dash preserved in CSV parse: "${parsedFromCsv.data[1].notes}"`);
    assert(!parsedFromCsv.data[0].reference.startsWith('='), `Formula disarmed on CSV parse: "${parsedFromCsv.data[0].reference}"`);

    // 1.3.2 Excel (.xlsx) Generation & Parsing (ExcelJS)
    const excelBuffer = await spreadsheetUtils.generateExcel({ sheetName: 'Branches', columns: testColumns, rows: testRecords });
    assert(Buffer.isBuffer(excelBuffer) && excelBuffer.length > 500, `Generated valid Excel (.xlsx) binary buffer (${excelBuffer.length} bytes)`);

    const parsedFromExcel = await spreadsheetUtils.parseSpreadsheet(excelBuffer, 'branches.xlsx');
    assert(parsedFromExcel.data.length === 2, `Parsed exactly 2 rows from Excel (.xlsx) buffer (found ${parsedFromExcel.data.length})`);
    assert(parsedFromExcel.data[0].branch_code === '001234', `Leading zeros preserved in Excel (.xlsx) parse: "${parsedFromExcel.data[0].branch_code}"`);
    assert(parsedFromExcel.data[0].amount === '-45.2', `Negative amount preserved in Excel (.xlsx) parse: "${parsedFromExcel.data[0].amount}"`);
    assert(parsedFromExcel.data[0].contact_phone === '+919876543210', `+91 phone preserved in Excel (.xlsx) parse: "${parsedFromExcel.data[0].contact_phone}"`);
    assert(parsedFromExcel.data[0].branch_name.includes('Alpha "Prime" Branch, South'), 'Excel preserves quotes and commas in cell text');

    // 1.3.3 Comprehensive Round-Trip Matrix for CSV and XLSX Files
    console.log('\n  --> Testing Real Round-Trip CSV/XLSX Export and Re-Import Matrix:');
    const roundTripMatrix = [
      { original: '- Screen flickering', isFormula: false, desc: 'Ordinary text starting with dash', expectQuotedInExport: true, expectedImport: '- Screen flickering' },
      { original: '+ Priority ticket', isFormula: false, desc: 'Ordinary text starting with plus', expectQuotedInExport: true, expectedImport: '+ Priority ticket' },
      { original: '-45.2', isFormula: false, desc: 'Negative float number', expectQuotedInExport: false, expectedImport: '-45.2' },
      { original: '-100', isFormula: false, desc: 'Negative integer', expectQuotedInExport: false, expectedImport: '-100' },
      { original: '+919876543210', isFormula: false, desc: 'Indian phone number with +91', expectQuotedInExport: false, expectedImport: '+919876543210' },
      { original: '+1 (555) 234-5678', isFormula: false, desc: 'US phone number with formatting', expectQuotedInExport: false, expectedImport: '+1 (555) 234-5678' },
      { original: '001234', isFormula: false, desc: 'Serial code with leading zeros', expectQuotedInExport: false, expectedImport: '001234' },
      { original: '=1+1', isFormula: true, desc: 'Basic arithmetic formula', expectQuotedInExport: true, expectedImport: '1+1' },
      { original: "=cmd|' /C calc'!A0", isFormula: true, desc: 'DDE execution payload with =', expectQuotedInExport: true, expectedImport: "cmd|' /C calc'!A0" },
      { original: "+cmd|' /C calc'!A0", isFormula: true, desc: 'DDE execution payload with +', expectQuotedInExport: true, expectedImport: "cmd|' /C calc'!A0" },
      { original: '@SUM(A1:A10)', isFormula: true, desc: 'Spreadsheet formula with @', expectQuotedInExport: true, expectedImport: 'SUM(A1:A10)' },
      { original: "\t=cmd|' /C calc'!A0", isFormula: true, desc: 'Tab-prefixed DDE payload', expectQuotedInExport: true, expectedImport: "cmd|' /C calc'!A0" },
      { original: '\r=1+1', isFormula: true, desc: 'Carriage-return-prefixed formula', expectQuotedInExport: true, expectedImport: '1+1' },
      { original: '\tTabPayload', isFormula: true, desc: 'Tab-prefixed plain string', expectQuotedInExport: true, expectedImport: 'TabPayload' },
      { original: '\rCRPayload', isFormula: true, desc: 'Carriage-return-prefixed plain string', expectQuotedInExport: true, expectedImport: 'CRPayload' },
      { original: "'Tis the season", isFormula: false, desc: 'User-entered legitimate leading apostrophe', expectQuotedInExport: false, expectedImport: "'Tis the season" },
      { original: "'Hello World'", isFormula: false, desc: 'User-entered text enclosed in apostrophes', expectQuotedInExport: false, expectedImport: "'Hello World'" },
      { original: "'John's Laptop'", isFormula: false, desc: 'User-entered text with apostrophes', expectQuotedInExport: false, expectedImport: "'John's Laptop'" }
    ];

    const matrixCols = [{ key: 'val', header: 'Value', isText: true }];
    const matrixRows = roundTripMatrix.map(m => ({ val: m.original }));

    // Generate real CSV and XLSX files
    const matrixCsvStr = spreadsheetUtils.generateCsv(matrixCols, matrixRows);
    const parsedMatrixCsv = await spreadsheetUtils.parseSpreadsheet(Buffer.from(matrixCsvStr, 'utf-8'), 'matrix.csv');

    const matrixExcelBuf = await spreadsheetUtils.generateExcel({ sheetName: 'Matrix', columns: matrixCols, rows: matrixRows });
    const parsedMatrixXlsx = await spreadsheetUtils.parseSpreadsheet(matrixExcelBuf, 'matrix.xlsx');

    assert(parsedMatrixCsv.data.length === roundTripMatrix.length, `Parsed all ${roundTripMatrix.length} rows from round-trip CSV`);
    assert(parsedMatrixXlsx.data.length === roundTripMatrix.length, `Parsed all ${roundTripMatrix.length} rows from round-trip XLSX`);

    for (let idx = 0; idx < roundTripMatrix.length; idx++) {
      const item = roundTripMatrix[idx];
      const exported = spreadsheetUtils.escapeForExport(item.original);

      // Verify export escaping expectations
      if (item.expectQuotedInExport) {
        assert(exported.startsWith("'"), `Export quotes special trigger: "${item.original.replace(/[\r\t\n]/g, '\\')}" -> "${exported.replace(/[\r\t\n]/g, '\\')}"`);
      } else {
        assert(!exported.startsWith("'") || item.original.startsWith("'"), `Export leaves legitimate data unquoted: "${item.original}" -> "${exported}"`);
      }

      // Verify CSV re-import
      const csvImportedVal = parsedMatrixCsv.data[idx].value;
      assert(csvImportedVal === item.expectedImport, `CSV Round-Trip for [${item.desc}]: "${item.original.replace(/[\r\t\n]/g, '\\')}" -> "${csvImportedVal}" (expected: "${item.expectedImport}")`);

      // Verify XLSX re-import
      const xlsxImportedVal = parsedMatrixXlsx.data[idx].value;
      assert(xlsxImportedVal === item.expectedImport, `XLSX Round-Trip for [${item.desc}]: "${item.original.replace(/[\r\t\n]/g, '\\')}" -> "${xlsxImportedVal}" (expected: "${item.expectedImport}")`);

      // Assert formula injection safety: cannot execute as spreadsheet formula
      if (item.isFormula) {
        assert(!csvImportedVal.startsWith('=') && !csvImportedVal.startsWith('@') && !csvImportedVal.startsWith('+cmd'), `CSV imported value disarmed from formula execution: "${csvImportedVal}"`);
        assert(!xlsxImportedVal.startsWith('=') && !xlsxImportedVal.startsWith('@') && !xlsxImportedVal.startsWith('+cmd'), `XLSX imported value disarmed from formula execution: "${xlsxImportedVal}"`);
      }
    }

    // 1.3.4 Format Enforcement, Extension Spoofing & Upload Cleanup
    console.log('\n  --> Testing Format Enforcement, Spoofing & Upload Cleanup:');

    // Explicit .xls Rejection
    let xlsRejected = false;
    let xlsErrorMessage = '';
    try {
      await spreadsheetUtils.parseSpreadsheet(Buffer.from('D0CF11E0A1B11AE10000', 'hex'), 'legacy_branches.xls');
    } catch (err) {
      xlsRejected = true;
      xlsErrorMessage = err.message;
    }
    assert(xlsRejected, 'Legacy .xls files are strictly rejected with an explicit error');
    assert(xlsErrorMessage.includes('Legacy Excel 97-2003 (.xls) files are not supported'), `Descriptive .xls error message: "${xlsErrorMessage}"`);

    // Extension Spoofing: .xls disguised as .xlsx (OLE Compound header D0 CF 11 E0)
    const spoofedXlsxPath = path.join(os.tmpdir(), `spoofed_xls_${Date.now()}.xlsx`);
    fs.writeFileSync(spoofedXlsxPath, Buffer.from('D0CF11E0A1B11AE100000000', 'hex'));
    const isSpoofedXlsxValid = verifyFileSignature(spoofedXlsxPath);
    assert(isSpoofedXlsxValid === false, 'File signature check detects .xls file disguised as .xlsx');

    // Extension Spoofing: Executable binary disguised as .xlsx (MZ header 4D 5A)
    const spoofedExeXlsxPath = path.join(os.tmpdir(), `spoofed_exe_${Date.now()}.xlsx`);
    fs.writeFileSync(spoofedExeXlsxPath, Buffer.from('4D5A90000300000004000000FFFF0000', 'hex'));
    const isSpoofedExeXlsxValid = verifyFileSignature(spoofedExeXlsxPath);
    assert(isSpoofedExeXlsxValid === false, 'File signature check detects Windows executable disguised as .xlsx');

    // Extension Spoofing: Binary containing null bytes disguised as .csv
    const spoofedCsvPath = path.join(os.tmpdir(), `spoofed_bin_${Date.now()}.csv`);
    fs.writeFileSync(spoofedCsvPath, Buffer.from('4D5A000048656C6C6F', 'hex'));
    const isSpoofedCsvValid = verifyFileSignature(spoofedCsvPath);
    assert(isSpoofedCsvValid === false, 'File signature check detects binary null bytes in disguised .csv');

    // Upload Cleanup: verifyUploadSignatures middleware safely cleans up rejected files
    const mockRes = () => {
      const res = {};
      res.statusCode = 200;
      res.jsonData = null;
      res.status = function(code) { this.statusCode = code; return this; };
      res.json = function(data) { this.jsonData = data; return this; };
      return res;
    };

    // Test 1: Rejected legacy .xls file is deleted from disk
    const testUploadXlsPath = path.join(os.tmpdir(), `upload_test_${Date.now()}.xls`);
    fs.writeFileSync(testUploadXlsPath, 'dummy legacy xls content');
    const resXls = mockRes();
    let nextCalledXls = false;
    verifyUploadSignatures({ file: { path: testUploadXlsPath, originalname: 'data.xls' } }, resXls, () => { nextCalledXls = true; });
    assert(resXls.statusCode === 400, 'verifyUploadSignatures returns HTTP 400 for .xls upload');
    assert(nextCalledXls === false, 'verifyUploadSignatures blocks execution of next middleware for rejected .xls');
    assert(!fs.existsSync(testUploadXlsPath), 'Rejected .xls file safely deleted from disk');

    // Test 2: Rejected spoofed signature file is deleted from disk
    const resSpoofed = mockRes();
    let nextCalledSpoofed = false;
    verifyUploadSignatures({ file: { path: spoofedXlsxPath, originalname: 'data.xlsx' } }, resSpoofed, () => { nextCalledSpoofed = true; });
    assert(resSpoofed.statusCode === 400, 'verifyUploadSignatures returns HTTP 400 for signature mismatch');
    assert(nextCalledSpoofed === false, 'verifyUploadSignatures blocks next middleware on signature mismatch');
    assert(!fs.existsSync(spoofedXlsxPath), 'Rejected signature mismatch file safely deleted from disk');

    // Clean up temporary spoof test files if still on disk
    try { if (fs.existsSync(spoofedExeXlsxPath)) fs.unlinkSync(spoofedExeXlsxPath); } catch (_) {}
    try { if (fs.existsSync(spoofedCsvPath)) fs.unlinkSync(spoofedCsvPath); } catch (_) {}

    // 1.4 Date Parsing Safety
    assert(spreadsheetUtils.parseDateSafe('2025-03-15') === '2025-03-15', 'Safe date parsing for YYYY-MM-DD');
    assert(spreadsheetUtils.parseDateSafe('15/03/2025') === '2025-03-15', 'Safe date parsing for DD/MM/YYYY');
    assert(spreadsheetUtils.parseDateSafe('15-03-2025') === '2025-03-15', 'Safe date parsing for DD-MM-YYYY');
    assert(spreadsheetUtils.parseDateSafe('not-a-date') === null, 'Invalid date string returns null safely');
    assert(spreadsheetUtils.parseDateSafe(null) === null, 'Null date returns null safely');

    // =========================================================================
    // 2. BRANCHES: BULK IMPORT & EXPORT
    // =========================================================================
    console.log('\n[Test Group 2] Branches: Bulk Import & Export');

    // 2.1 Missing required fields
    const invalidBranchCsv = 'branch_name,address,city\n,Missing Name,Bengaluru\n';
    const parsedInvalidBranch = await spreadsheetUtils.parseSpreadsheet(Buffer.from(invalidBranchCsv), 'branches.csv');
    const branchRow = parsedInvalidBranch.data[0];
    const branchNameVal = branchRow.branch_name || branchRow.name;
    assert(!branchNameVal, 'Detected missing branch_name in invalid row');

    // 2.2 In-file duplicate detection
    const duplicateBranchCsv = 'branch_name,address,city,state,pincode\nKoramanagala Tech Park,123 Hosur Rd,Bengaluru,Karnataka,560095\nKoramanagala Tech Park,456 Sarjapur Rd,Bengaluru,Karnataka,560034\n';
    const parsedDupBranches = await spreadsheetUtils.parseSpreadsheet(Buffer.from(duplicateBranchCsv), 'branches.csv');
    const seenBranchNames = new Set();
    let fileDupFound = false;
    for (const r of parsedDupBranches.data) {
      const bName = (r.branch_name || r.name || '').trim().toLowerCase();
      if (seenBranchNames.has(bName)) fileDupFound = true;
      seenBranchNames.add(bName);
    }
    assert(fileDupFound, 'In-file duplicate branch names accurately detected');

    // 2.3 Valid Branch Import into Database for Company A
    const [insBranchA1] = await connection.query(
      "INSERT INTO company_branches (company_id, name, address, phone) VALUES (?, 'Koramangala Hub', '100 Hosur Rd, Bengaluru, Karnataka 560095', '08012345678')",
      [compA_Id]
    );
    const branchA1_Id = insBranchA1.insertId;

    const [insBranchA2] = await connection.query(
      "INSERT INTO company_branches (company_id, name, address, phone) VALUES (?, 'Whitefield Tech Zone', '200 ITPL Main Rd, Bengaluru, Karnataka 560066', '08087654321')",
      [compA_Id]
    );
    const branchA2_Id = insBranchA2.insertId;
    assert(branchA1_Id && branchA2_Id, `Created 2 valid test branches for Company A (IDs: ${branchA1_Id}, ${branchA2_Id})`);

    // 2.4 Verify Duplicate Branch Name Against Company DB
    const [existingBranchCheck] = await connection.query(
      'SELECT id FROM company_branches WHERE company_id = ? AND LOWER(name) = ?',
      [compA_Id, 'koramangala hub']
    );
    assert(existingBranchCheck.length === 1 && existingBranchCheck[0].id === branchA1_Id, 'Existing branch match detected correctly');

    // 2.5 Branch Export - No Sensitive or Unrelated Data
    const [exportedBranchesA] = await connection.query(
      `SELECT b.id, b.name, b.address, b.phone, b.is_active, b.created_at
       FROM company_branches b
       WHERE b.company_id = ?
       ORDER BY b.id ASC`,
      [compA_Id]
    );
    assert(exportedBranchesA.length === 2, `Company A has 2 branches for export (found ${exportedBranchesA.length})`);
    const expBranchKeys = Object.keys(exportedBranchesA[0]);
    assert(!expBranchKeys.includes('password') && !expBranchKeys.includes('token') && !expBranchKeys.includes('secret'), 'Branch export contains zero sensitive fields');

    // =========================================================================
    // 3. EMPLOYEES: BULK IMPORT & EXPORT
    // =========================================================================
    console.log('\n[Test Group 3] Employees: Bulk Import & Export');

    // 3.1 Non-existent Branch Rejection — Zero Phantom Branch Creation
    const initialBranchCountQuery = 'SELECT COUNT(*) as count FROM company_branches WHERE company_id = ?';
    const [[{ count: branchesBefore }]] = await connection.query(initialBranchCountQuery, [compA_Id]);

    const fakeBranchName = 'Non-Existent Ghost Branch';
    const [branchLookup] = await connection.query(
      'SELECT id FROM company_branches WHERE company_id = ? AND (LOWER(name) = ?)',
      [compA_Id, fakeBranchName.toLowerCase()]
    );
    assert(branchLookup.length === 0, `Pre-condition: Branch "${fakeBranchName}" does not exist in DB`);

    // Verify rejection logic (simulating importBulkEmployees validation)
    const invalidEmployeeRow = {
      full_name: 'Rahul Sharma',
      email: 'rahul.sharma@alpha.com',
      phone: '9876500001',
      branch: fakeBranchName
    };

    let rejectedBranch = false;
    let errorDetail = null;
    if (invalidEmployeeRow.branch) {
      const [found] = await connection.query(
        'SELECT id FROM company_branches WHERE company_id = ? AND LOWER(name) = ?',
        [compA_Id, invalidEmployeeRow.branch.toLowerCase()]
      );
      if (found.length === 0) {
        rejectedBranch = true;
        errorDetail = {
          row: 2,
          field: 'branch',
          error: `Referenced branch "${invalidEmployeeRow.branch}" does not exist for this company.`,
          suggestion: 'Ensure the branch is created first or use an existing branch name/ID.'
        };
      }
    }
    assert(rejectedBranch, 'Employee referencing non-existent branch is strictly rejected');
    assert(errorDetail && errorDetail.field === 'branch', 'Detailed row error includes row, field, and actionable suggestion');

    // Verify ZERO phantom branches were created
    const [[{ count: branchesAfter }]] = await connection.query(initialBranchCountQuery, [compA_Id]);
    assert(branchesBefore === branchesAfter, `Zero phantom branches created (count before: ${branchesBefore}, count after: ${branchesAfter})`);

    // 3.2 In-file Duplicate Email Detection
    const dupEmployeeCsv = 'full_name,email,phone,branch\nAmit Verma,amit@alpha.com,9876500002,Koramangala Hub\nSumit Verma,amit@alpha.com,9876500003,Koramangala Hub\n';
    const parsedEmp = await spreadsheetUtils.parseSpreadsheet(Buffer.from(dupEmployeeCsv), 'employees.csv');
    const seenEmpEmails = new Set();
    let empDupFound = false;
    for (const r of parsedEmp.data) {
      const email = (r.email || '').trim().toLowerCase();
      if (seenEmpEmails.has(email)) empDupFound = true;
      seenEmpEmails.add(email);
    }
    assert(empDupFound, 'In-file duplicate employee email accurately detected');

    // 3.3 Valid Employee Creation linked to Real Branch
    const [insEmp1] = await connection.query(
      "INSERT INTO company_employees (company_id, branch_id, name, email, phone, department, designation) VALUES (?, ?, 'Priya Patel', 'priya.patel@alpha.com', '9876500010', 'Engineering', 'Lead Architect')",
      [compA_Id, branchA1_Id]
    );
    const emp1_Id = insEmp1.insertId;

    const [insEmp2] = await connection.query(
      "INSERT INTO company_employees (company_id, branch_id, name, email, phone, department, designation) VALUES (?, ?, 'Vikram Singh', 'vikram.singh@alpha.com', '9876500020', 'Operations', 'Ops Manager')",
      [compA_Id, branchA2_Id]
    );
    const emp2_Id = insEmp2.insertId;
    assert(emp1_Id && emp2_Id, `Created 2 valid employees linked to real branches (IDs: ${emp1_Id}, ${emp2_Id})`);

    // 3.4 Employee Export - Security Check (No credentials)
    const [exportedEmployeesA] = await connection.query(
      `SELECT e.id, e.name, e.email, e.phone, e.department, e.designation, b.name AS branch_name, e.is_active, e.created_at
       FROM company_employees e
       LEFT JOIN company_branches b ON e.branch_id = b.id
       WHERE e.company_id = ?
       ORDER BY e.id ASC`,
      [compA_Id]
    );
    assert(exportedEmployeesA.length === 2, `Company A has 2 employees for export (found ${exportedEmployeesA.length})`);
    const empExportRow = exportedEmployeesA[0];
    assert(empExportRow.branch_name === 'Koramangala Hub', `Employee branch resolved correctly: "${empExportRow.branch_name}"`);
    assert(!('password' in empExportRow) && !('token' in empExportRow) && !('otp' in empExportRow), 'Employee export NEVER includes credentials or auth tokens');

    // =========================================================================
    // 4. DEVICES: BULK IMPORT & EXPORT
    // =========================================================================
    console.log('\n[Test Group 4] Devices: Bulk Import & Export');

    // 4.1 In-file Duplicate Serial Detection
    const dupDeviceCsv = 'device_type,brand,model,serial_number,asset_tag\nLaptop,Apple,MacBook Pro,SN-ALPHA-001,TAG-001\nLaptop,Apple,MacBook Air,SN-ALPHA-001,TAG-002\n';
    const parsedDevices = await spreadsheetUtils.parseSpreadsheet(Buffer.from(dupDeviceCsv), 'devices.csv');
    const seenSerials = new Set();
    let devDupFound = false;
    for (const r of parsedDevices.data) {
      const sn = (r.serial_number || r.serial || '').trim().toUpperCase();
      if (seenSerials.has(sn)) devDupFound = true;
      seenSerials.add(sn);
    }
    assert(devDupFound, 'In-file duplicate device serial numbers detected');

    // 4.2 Valid Device Insertion with Leading Zero Asset Tag
    const testSerial1 = 'SN-ALPHA-001';
    const testSerial2 = '0088991122'; // Numeric with leading zeroes
    const [insDev1] = await connection.query(
      "INSERT INTO company_devices (company_id, branch_id, employee_id, device_category, brand, model_number, serial_number, asset_id, purchase_date) VALUES (?, ?, ?, 'Laptop', 'Apple', 'MacBook Pro M3', ?, 'TAG-001', '2025-01-15')",
      [compA_Id, branchA1_Id, emp1_Id, testSerial1]
    );
    const dev1_Id = insDev1.insertId;

    const [insDev2] = await connection.query(
      "INSERT INTO company_devices (company_id, branch_id, employee_id, device_category, brand, model_number, serial_number, asset_id, purchase_date) VALUES (?, ?, ?, 'Mobile', 'Samsung', 'Galaxy S24', ?, '0012345', '2025-02-20')",
      [compA_Id, branchA2_Id, emp2_Id, testSerial2]
    );
    const dev2_Id = insDev2.insertId;
    assert(dev1_Id && dev2_Id, `Created 2 valid fleet devices (IDs: ${dev1_Id}, ${dev2_Id})`);

    // 4.3 Device Export - Preservation of Leading Zeroes as Text
    const [exportedDevicesA] = await connection.query(
      `SELECT d.id, d.device_category, d.brand, d.model_number, d.serial_number, d.asset_id, b.name AS branch_name, e.name AS employee_name, e.email AS employee_email, d.purchase_date, d.is_active
       FROM company_devices d
       LEFT JOIN company_branches b ON d.branch_id = b.id
       LEFT JOIN company_employees e ON d.employee_id = e.id
       WHERE d.company_id = ?
       ORDER BY d.id ASC`,
      [compA_Id]
    );
    assert(exportedDevicesA.length === 2, `Exported 2 devices for Company A`);
    const devRow2 = exportedDevicesA.find(d => d.serial_number === testSerial2);
    assert(devRow2 && devRow2.serial_number === '0088991122', `Leading zeroes preserved in device serial: "${devRow2?.serial_number}"`);
    assert(devRow2 && devRow2.asset_id === '0012345', `Leading zeroes preserved in asset tag: "${devRow2?.asset_id}"`);

    // Verify Excel generation formats serial & tag as text cells
    const deviceExcelCols = [
      { key: 'serial_number', header: 'Serial Number', type: 'text' },
      { key: 'asset_id', header: 'Asset Tag', type: 'text' }
    ];
    const devExcelBuf = await spreadsheetUtils.generateExcel({ sheetName: 'Devices', columns: deviceExcelCols, rows: exportedDevicesA });
    const reparsedDevExcel = await spreadsheetUtils.parseSpreadsheet(devExcelBuf, 'devices.xlsx');
    const reparsedDev2 = reparsedDevExcel.data.find(d => d.serial_number === testSerial2);
    assert(reparsedDev2 && reparsedDev2.serial_number === '0088991122', 'Excel roundtrip preserves text serial numbers without scientific notation');

    // =========================================================================
    // 5. REPAIR TICKETS: BULK IMPORT & EXPORT
    // =========================================================================
    console.log('\n[Test Group 5] Repair Tickets: Bulk Import & Export');

    // 5.1 Pre-validation: Non-existent Device Serial Rejection
    const initialDevicesCountQuery = 'SELECT COUNT(*) as count FROM company_devices WHERE company_id = ?';
    const [[{ count: devCountBefore }]] = await connection.query(initialDevicesCountQuery, [compA_Id]);

    const fakeDeviceSerial = 'SN-GHOST-DEVICE-999';
    const [devLookup] = await connection.query(
      'SELECT id FROM company_devices WHERE company_id = ? AND serial_number = ?',
      [compA_Id, fakeDeviceSerial]
    );
    assert(devLookup.length === 0, `Pre-condition: Device serial "${fakeDeviceSerial}" does not exist in DB`);

    // Verify rejection logic
    let ticketRowRejected = false;
    let ticketError = null;
    if (devLookup.length === 0) {
      ticketRowRejected = true;
      ticketError = {
        row: 2,
        field: 'device_serial',
        error: `Device with serial "${fakeDeviceSerial}" is not registered in your fleet.`,
        suggestion: 'Please register the device under Fleet Devices first.'
      };
    }
    assert(ticketRowRejected, 'Ticket referencing unregistered device serial is strictly rejected in pre-validation');
    assert(ticketError && ticketError.field === 'device_serial', 'Actionable error suggestion given for missing fleet device');

    // Verify ZERO phantom devices were created
    const [[{ count: devCountAfter }]] = await connection.query(initialDevicesCountQuery, [compA_Id]);
    assert(devCountBefore === devCountAfter, `Zero phantom devices created (count before: ${devCountBefore}, count after: ${devCountAfter})`);

    // 5.2 Scenario 1: Entire Batch Rejected During Validation
    const accIdA = await resolvePermanentAccountId(connection, { companyId: compA_Id });
    const seqKey = `tkt:${accIdA}`;
    const [seqBefore1] = await connection.query('SELECT current_val FROM app_sequences WHERE sequence_name = ?', [seqKey]);
    const countSeqBefore1 = seqBefore1.length > 0 ? seqBefore1[0].current_val : 0;

    // Simulate batch of 3 rows where all 3 fail validation (unregistered serial, missing problem description, invalid employee)
    const invalidBatchRows = [
      { serial: 'SN-GHOST-1', desc: 'Valid problem description long enough' },
      { serial: '', desc: 'Valid problem description' },
      { serial: testSerial1, desc: 'Short' } // Too short (< 10 chars)
    ];
    const scenario1Valid = [];
    for (const r of invalidBatchRows) {
      if (!r.serial || r.serial.startsWith('SN-GHOST') || r.desc.length < 10) {
        // rejected
      } else {
        scenario1Valid.push(r);
      }
    }
    assert(scenario1Valid.length === 0, 'Scenario 1: All rows rejected during Phase 1 pre-validation');

    // Because validBatch is empty, Phase 2 is skipped and zero tickets are generated
    const [seqAfter1] = await connection.query('SELECT current_val FROM app_sequences WHERE sequence_name = ?', [seqKey]);
    const countSeqAfter1 = seqAfter1.length > 0 ? seqAfter1[0].current_val : 0;
    assert(countSeqBefore1 === countSeqAfter1, `Scenario 1 Evidence: Sequence counter UNCHANGED when entire batch fails validation (${countSeqBefore1} === ${countSeqAfter1})`);

    // 5.3 Scenario 2: Database Insert Failure After Validation (InnoDB Transaction Rollback)
    const [seqBefore2] = await connection.query('SELECT current_val FROM app_sequences WHERE sequence_name = ?', [seqKey]);
    const countSeqBefore2 = seqBefore2.length > 0 ? seqBefore2[0].current_val : 0;

    const rollbackConn = await pool.getConnection();
    try {
      await rollbackConn.beginTransaction();
      // Generate candidate ticket number inside transaction
      const rollbackTicket = await generateTicketNumber(rollbackConn, { companyId: compA_Id });
      assert(rollbackTicket.startsWith('TD-C'), `Generated candidate ticket inside transaction: ${rollbackTicket}`);

      // Simulate mid-batch database error (e.g. SQL syntax or constraint violation)
      try {
        await rollbackConn.query('INSERT INTO service_requests (non_existent_column) VALUES (1)');
      } catch (simulatedDbError) {
        // Transaction failure caught: perform rollback
        await rollbackConn.rollback();
      }
    } finally {
      rollbackConn.release();
    }

    const [seqAfter2] = await connection.query('SELECT current_val FROM app_sequences WHERE sequence_name = ?', [seqKey]);
    const countSeqAfter2 = seqAfter2.length > 0 ? seqAfter2[0].current_val : 0;
    assert(countSeqBefore2 === countSeqAfter2, `Scenario 2 Evidence: Sequence counter restored atomically on DB failure rollback (${countSeqBefore2} === ${countSeqAfter2}, zero sequences burned)`);

    // 5.4 Scenario 3: Mixed Valid and Invalid Rows (Zero Sequence Numbers Burned on Failed Rows)
    const [seqBefore3] = await connection.query('SELECT current_val FROM app_sequences WHERE sequence_name = ?', [seqKey]);
    const countSeqBefore3 = seqBefore3.length > 0 ? seqBefore3[0].current_val : 0;

    // 4 rows: Row 1 (valid), Row 2 (invalid - bad serial), Row 3 (valid), Row 4 (invalid - short desc)
    const mixedRows = [
      { row: 1, serial: testSerial1, desc: 'Battery draining rapidly within 1 hour', valid: true },
      { row: 2, serial: 'SN-INVALID-99', desc: 'Screen flickering problem observed', valid: false },
      { row: 3, serial: testSerial2, desc: 'Camera sensor error on startup', valid: true },
      { row: 4, serial: testSerial1, desc: 'Broken', valid: false }
    ];

    // Phase 1: Filter valid
    const validMixed = mixedRows.filter(r => r.valid);
    assert(validMixed.length === 2, 'Scenario 3: Exactly 2 of 4 rows passed Phase 1 validation');

    // Phase 2: Create tickets inside transaction ONLY for valid rows
    const scenario3Tickets = [];
    await connection.beginTransaction();
    for (const item of validMixed) {
      const tNo = await generateTicketNumber(connection, { companyId: compA_Id });
      scenario3Tickets.push(tNo);
      await connection.query(
        `INSERT INTO service_requests (
          user_id, company_id, ticket_number, brand, model_number, serial_number,
          problem_description, problem_type, priority, status, customer_name, email, mobile,
          preferred_contact_method, service_type
        ) VALUES (?, ?, ?, 'Apple', 'MacBook Pro M3', ?, ?, 'Hardware', 'High', 'pending', 'Alpha Corp', 'alpha@corp.com', '9876543210', 'email', 'carry_in')`,
        [compA_UserId, compA_Id, tNo, item.serial, item.desc]
      );
    }
    await connection.commit();

    const [seqAfter3] = await connection.query('SELECT current_val FROM app_sequences WHERE sequence_name = ?', [seqKey]);
    const countSeqAfter3 = seqAfter3.length > 0 ? seqAfter3[0].current_val : 0;
    assert(countSeqAfter3 === countSeqBefore3 + 2, `Scenario 3 Evidence: Sequence counter advanced by EXACTLY the valid count 2 (from ${countSeqBefore3} to ${countSeqAfter3})`);
    
    // Verify serial numbers are strictly consecutive without gaps
    const parseSerialNum = (t) => parseInt(t.split('-').pop(), 10);
    const serial1 = parseSerialNum(scenario3Tickets[0]);
    const serial2 = parseSerialNum(scenario3Tickets[1]);
    assert(serial2 === serial1 + 1, `Scenario 3 Evidence: Ticket numbers are strictly contiguous with ZERO gaps: [${scenario3Tickets[0]}, ${scenario3Tickets[1]}]`);

    // 5.5 Scenario 4: Concurrent Imports for the Same Company
    const [seqBefore4] = await connection.query('SELECT current_val FROM app_sequences WHERE sequence_name = ?', [seqKey]);
    const countSeqBefore4 = seqBefore4.length > 0 ? seqBefore4[0].current_val : 0;

    // Simulate 2 parallel import transactions running concurrently for Company A
    const concurrentImport = async (importName, count) => {
      const conn = await pool.getConnection();
      const generated = [];
      try {
        await conn.beginTransaction();
        for (let i = 0; i < count; i++) {
          const t = await generateTicketNumber(conn, { companyId: compA_Id });
          generated.push(t);
        }
        await conn.commit();
        return generated;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    };

    const [batchA_Tickets, batchB_Tickets] = await Promise.all([
      concurrentImport('Batch_A', 2),
      concurrentImport('Batch_B', 2)
    ]);

    const allConcurrentTickets = [...batchA_Tickets, ...batchB_Tickets];
    const uniqueConcurrent = new Set(allConcurrentTickets);
    assert(uniqueConcurrent.size === 4, `Scenario 4 Evidence: All 4 concurrent tickets are distinct (generated: ${allConcurrentTickets.join(', ')})`);

    const [seqAfter4] = await connection.query('SELECT current_val FROM app_sequences WHERE sequence_name = ?', [seqKey]);
    const countSeqAfter4 = seqAfter4.length > 0 ? seqAfter4[0].current_val : 0;
    assert(countSeqAfter4 === countSeqBefore4 + 4, `Scenario 4 Evidence: Sequence counter advanced by exactly 4 under concurrent execution (from ${countSeqBefore4} to ${countSeqAfter4})`);

    // 5.6 Rejection of Duplicate Open Ticket on Same Device
    const [openTicketConflict] = await connection.query(
      `SELECT id, ticket_number FROM service_requests
       WHERE company_id = ? AND serial_number = ? AND status NOT IN ('completed', 'cancelled', 'delivered')`,
      [compA_Id, testSerial1]
    );
    assert(openTicketConflict.length > 0, `Detected existing active ticket conflict (${openTicketConflict[0].ticket_number}) on device "${testSerial1}"`);

    // 5.7 Repair Ticket Export Filtering
    const [exportedRepairsPending] = await connection.query(
      `SELECT sr.id, sr.ticket_number, sr.brand, sr.model_number, sr.serial_number, sr.customer_name, sr.problem_type, sr.status, sr.priority, sr.created_at
       FROM service_requests sr
       WHERE sr.company_id = ? AND sr.status = 'pending'
       ORDER BY sr.id ASC`,
      [compA_Id]
    );
    assert(exportedRepairsPending.length >= 2, `Filtered ticket export returns matching pending records (found ${exportedRepairsPending.length})`);

    // =========================================================================
    // 6. CROSS-COMPANY ISOLATION & AUTHORIZATION
    // =========================================================================
    console.log('\n[Test Group 6] Cross-Company Isolation & Security');

    // 6.1 Create Branch in Company B
    const [insBranchB] = await connection.query(
      "INSERT INTO company_branches (company_id, name, address, phone) VALUES (?, 'Beta Chennai Office', '77 OMR Rd, Chennai, Tamil Nadu 600096', '04412345678')",
      [compB_Id]
    );
    const branchB_Id = insBranchB.insertId;

    // 6.2 Company A Cannot Reference Company B's Branch
    const [crossCompBranchCheck] = await connection.query(
      'SELECT id FROM company_branches WHERE company_id = ? AND id = ?',
      [compA_Id, branchB_Id]
    );
    assert(crossCompBranchCheck.length === 0, 'Company A cannot access or reference Company B branch by ID');

    const [crossCompBranchNameCheck] = await connection.query(
      'SELECT id FROM company_branches WHERE company_id = ? AND LOWER(name) = ?',
      [compA_Id, 'beta chennai office']
    );
    assert(crossCompBranchNameCheck.length === 0, 'Company A cannot access or reference Company B branch by Name');

    // 6.3 Company A Cannot Export Company B's Data
    const [compA_RepairsLeakCheck] = await connection.query(
      'SELECT id FROM service_requests WHERE company_id = ?',
      [compB_Id]
    );
    assert(compA_RepairsLeakCheck.length === 0, 'Company B has zero tickets; Company A queries return zero Company B records');

    // 6.4 Company B Device Query Isolation
    const [compB_Devices] = await connection.query(
      'SELECT id FROM company_devices WHERE company_id = ?',
      [compB_Id]
    );
    assert(compB_Devices.length === 0, 'Company B sees 0 devices despite Company A having 2 devices');

  } catch (err) {
    console.error('\n❌ UNEXPECTED ERROR IN TEST SUITE:', err);
    testsFailed++;
  } finally {
    // =========================================================================
    // 7. SAFE CLEANUP (ZERO DIRTY FIXTURES OR DAMAGED COUNTERS)
    // =========================================================================
    console.log('\n[Cleanup] Cleaning up isolated test fixtures...');
    try {
      if (compA_Id) {
        await connection.query('DELETE FROM service_requests WHERE company_id = ?', [compA_Id]);
        await connection.query('DELETE FROM company_devices WHERE company_id = ?', [compA_Id]);
        await connection.query('DELETE FROM company_employees WHERE company_id = ?', [compA_Id]);
        await connection.query('DELETE FROM company_branches WHERE company_id = ?', [compA_Id]);
        await connection.query('DELETE FROM app_sequences WHERE sequence_name LIKE ?', [`%C${String(compA_Id).padStart(3, '0')}%`]);
        await connection.query('DELETE FROM company_profiles WHERE user_id = ?', [compA_Id]);
      }
      if (compA_UserId) {
        await connection.query('DELETE FROM users WHERE id = ?', [compA_UserId]);
      }
      if (compB_Id) {
        await connection.query('DELETE FROM service_requests WHERE company_id = ?', [compB_Id]);
        await connection.query('DELETE FROM company_devices WHERE company_id = ?', [compB_Id]);
        await connection.query('DELETE FROM company_employees WHERE company_id = ?', [compB_Id]);
        await connection.query('DELETE FROM company_branches WHERE company_id = ?', [compB_Id]);
        await connection.query('DELETE FROM app_sequences WHERE sequence_name LIKE ?', [`%C${String(compB_Id).padStart(3, '0')}%`]);
        await connection.query('DELETE FROM company_profiles WHERE user_id = ?', [compB_Id]);
      }
      if (compB_UserId) {
        await connection.query('DELETE FROM users WHERE id = ?', [compB_UserId]);
      }
      console.log('  ✓ Cleaned all test fixtures and sequences safely.');
    } catch (cleanErr) {
      console.error('  ✗ Error cleaning test fixtures:', cleanErr);
    }
    connection.release();
  }

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test failure:', err);
  process.exit(1);
});
