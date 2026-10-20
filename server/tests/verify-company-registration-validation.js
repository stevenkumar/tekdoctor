/**
 * TekDoctor — Verification Test Suite: Company Registration Form Validation
 * 
 * Verifies both frontend validation contracts and backend API enforcement for:
 * 1. Required fields (companyName, email, password)
 * 2. 10-digit Indian phone validation (length, digits only, starting with 6-9, non-repeating)
 * 3. 15-character Indian GSTIN validation (state code, PAN format, Z entity, Mod-36 checksum)
 * 4. Website URL validation (protocol support, scheme-less support, invalid structure rejection, max 255 length)
 * 5. Address length validation (max 250 length, trimming)
 * 6. Real API registration test, duplicate prevention, and DB cleanup
 */

const assert = require('assert');
const http = require('http');
const path = require('path');
const app = require('../server');
const { pool } = require('../config/db.config');
const {
  isValidGstinChecksum,
  isValidUrl
} = require('../middleware/validate.middleware');

let server;
let testPort;
const HOST = '127.0.0.1';

let passedTests = 0;
let failedTests = 0;

function report(name, passed, details = '') {
  if (passed) {
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${name} ${details ? '- ' + details : ''}`);
  }
}

function makeRequest(method, endpoint, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      ...headers,
      'Content-Type': 'application/json'
    };
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: HOST,
        port: testPort,
        path: endpoint,
        method,
        headers: reqHeaders
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let data = null;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, data });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Frontend Validation Logic Simulation (mirrors client/src/utils/companyValidation.ts)
const GSTN_CODEPOINT_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function clientValidateGstin(gstin) {
  const g = (gstin || '').trim().toUpperCase();
  if (!g) return undefined; // Optional
  if (g.length !== 15) return 'Enter a valid 15-character GSTIN.';
  const gstinRegex = /^(0[1-9]|[1-2][0-9]|3[0-8]|97|99)[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(g)) return 'Enter a valid 15-character GSTIN.';
  if (!isValidGstinChecksum(g)) return 'Enter a valid 15-character GSTIN.';
  return undefined;
}

function clientValidatePhone(phone) {
  const str = (phone || '').trim();
  if (!str) return undefined; // Optional
  if (!/^[6-9]\d{9}$/.test(str) || /^(\d)\1{9}$/.test(str)) {
    return 'Enter a valid 10-digit mobile number.';
  }
  return undefined;
}

function clientValidateUrl(url) {
  const str = (url || '').trim();
  if (!str) return undefined; // Optional
  if (str.length > 255) return 'Website URL is too long.';
  if (!isValidUrl(str)) return 'Enter a valid website URL.';
  return undefined;
}

function clientValidateAddress(address) {
  const str = (address || '').trim();
  if (!str) return undefined; // Optional
  if (str.length > 250) return 'Address is too long.';
  return undefined;
}

async function runTests() {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  testPort = server.address().port;

  console.log('\n================================================================');
  console.log(`TEKDOCTOR — COMPANY REGISTRATION VALIDATION TEST SUITE (PORT: ${testPort})`);
  console.log('================================================================\n');

  // ── 1. Phone Number Unit Validation Tests ─────────────────────────────────
  console.log('--- 1. Phone Number Validation Rules ---');
  report('Empty phone is allowed (optional)', clientValidatePhone('') === undefined);
  report('9 digits is rejected', clientValidatePhone('987654321') === 'Enter a valid 10-digit mobile number.');
  report('11 digits is rejected', clientValidatePhone('98765432101') === 'Enter a valid 10-digit mobile number.');
  report('Letters in phone rejected', clientValidatePhone('98765ABCDE') === 'Enter a valid 10-digit mobile number.');
  report('Special chars rejected', clientValidatePhone('98765-43210') === 'Enter a valid 10-digit mobile number.');
  report('Invalid Indian starting digit (e.g. 5) rejected', clientValidatePhone('5876543210') === 'Enter a valid 10-digit mobile number.');
  report('Repeating digits (9999999999) rejected', clientValidatePhone('9999999999') === 'Enter a valid 10-digit mobile number.');
  report('Repeating digits (0000000000) rejected', clientValidatePhone('0000000000') === 'Enter a valid 10-digit mobile number.');
  report('Valid Indian mobile (9876543210) accepted', clientValidatePhone('9876543210') === undefined);
  report('Valid Indian mobile (8123456789) accepted', clientValidatePhone('8123456789') === undefined);
  report('Valid Indian mobile (7012345678) accepted', clientValidatePhone('7012345678') === undefined);
  report('Valid Indian mobile (6234567890) accepted', clientValidatePhone('6234567890') === undefined);

  // ── 2. GSTIN Unit Validation Tests ────────────────────────────────────────
  console.log('\n--- 2. GST Number (GSTIN) Validation Rules ---');
  report('Empty GSTIN is allowed (optional)', clientValidateGstin('') === undefined);
  report('14-char GSTIN rejected', clientValidateGstin('27AAPFU0939F1Z') === 'Enter a valid 15-character GSTIN.');
  report('16-char GSTIN rejected', clientValidateGstin('27AAPFU0939F1ZVA') === 'Enter a valid 15-character GSTIN.');
  report('Invalid state code 00 rejected', clientValidateGstin('00AAPFU0939F1ZV') === 'Enter a valid 15-character GSTIN.');
  report('Invalid state code 39 rejected', clientValidateGstin('39AAPFU0939F1ZV') === 'Enter a valid 15-character GSTIN.');
  report('Invalid state code 98 rejected', clientValidateGstin('98AAPFU0939F1ZV') === 'Enter a valid 15-character GSTIN.');
  report('Invalid PAN portion rejected', clientValidateGstin('27123450939F1ZV') === 'Enter a valid 15-character GSTIN.');
  report('14th char not Z rejected', clientValidateGstin('27AAPFU0939F1AV') === 'Enter a valid 15-character GSTIN.');
  report('Invalid checksum character rejected', clientValidateGstin('27AAPFU0939F1ZX') === 'Enter a valid 15-character GSTIN.');
  report('Valid GSTIN 27AAPFU0939F1ZV accepted', clientValidateGstin('27AAPFU0939F1ZV') === undefined);
  report('Valid GSTIN 09AAAUP8175A1ZG accepted', clientValidateGstin('09AAAUP8175A1ZG') === undefined);
  report('Valid GSTIN 27AAACT2727Q1ZW accepted', clientValidateGstin('27AAACT2727Q1ZW') === undefined);
  report('Lowercase valid GSTIN normalized and accepted', clientValidateGstin('27aapfu0939f1zv') === undefined);

  // ── 3. Website URL Validation Tests ───────────────────────────────────────
  console.log('\n--- 3. Website URL Validation Rules ---');
  report('Empty website URL is allowed (optional)', clientValidateUrl('') === undefined);
  report('Valid https:// URL accepted', clientValidateUrl('https://thetekdoctor.com') === undefined);
  report('Valid http:// URL accepted', clientValidateUrl('http://thetekdoctor.com') === undefined);
  report('Valid scheme-less domain accepted', clientValidateUrl('thetekdoctor.com') === undefined);
  report('Valid URL with path & query accepted', clientValidateUrl('https://sub.domain.co.in/services?view=all#team') === undefined);
  report('Malformed URL "not a url" rejected', clientValidateUrl('not a url') === 'Enter a valid website URL.');
  report('Malformed protocol "ftp://" rejected', clientValidateUrl('ftp://company.com') === 'Enter a valid website URL.');
  report('Incomplete URL "https://" rejected', clientValidateUrl('https://') === 'Enter a valid website URL.');
  report('Incomplete URL "http://" rejected', clientValidateUrl('http://') === 'Enter a valid website URL.');
  report('Excessively long URL (>255 chars) rejected', clientValidateUrl('https://example.com/' + 'a'.repeat(250)) === 'Website URL is too long.');

  // ── 4. Address Validation Tests ───────────────────────────────────────────
  console.log('\n--- 4. Address Validation Rules ---');
  report('Empty address is allowed (optional)', clientValidateAddress('') === undefined);
  report('Valid address <= 250 chars accepted', clientValidateAddress('Unit 402, Cyber Heights, HITEC City, Hyderabad') === undefined);
  report('Address of exactly 250 chars accepted', clientValidateAddress('A'.repeat(250)) === undefined);
  report('Address exceeding 250 chars rejected', clientValidateAddress('A'.repeat(251)) === 'Address is too long.');

  // ── 5. Backend HTTP API Enforcement Tests ─────────────────────────────────
  console.log('\n--- 5. Backend HTTP API Enforcement (/api/company/register) ---');

  // 5.1 Empty Payload
  const emptyRes = await makeRequest('POST', '/api/company/register', {});
  report(
    'Backend rejects empty payload with 400',
    emptyRes.status === 400 && emptyRes.data.success === false
  );
  report(
    'Backend returns field-specific required errors',
    emptyRes.data.errors &&
      emptyRes.data.errors.companyName === 'Company name is required.' &&
      emptyRes.data.errors.email === 'Corporate email is required.' &&
      emptyRes.data.errors.password === 'Password is required.'
  );

  // 5.2 Invalid Phone
  const badPhoneRes = await makeRequest('POST', '/api/company/register', {
    companyName: 'Test Corp',
    email: 'valid_test@company.com',
    password: 'Password123',
    phone: '987654321' // 9 digits
  });
  report(
    'Backend rejects 9-digit phone with 400 and inline error',
    badPhoneRes.status === 400 &&
      badPhoneRes.data.errors?.phone === 'Enter a valid 10-digit mobile number.'
  );

  const lettersPhoneRes = await makeRequest('POST', '/api/company/register', {
    companyName: 'Test Corp',
    email: 'valid_test@company.com',
    password: 'Password123',
    phone: '98765ABCDE'
  });
  report(
    'Backend rejects letters in phone with 400',
    lettersPhoneRes.status === 400 &&
      lettersPhoneRes.data.errors?.phone === 'Enter a valid 10-digit mobile number.'
  );

  const repeatPhoneRes = await makeRequest('POST', '/api/company/register', {
    companyName: 'Test Corp',
    email: 'valid_test@company.com',
    password: 'Password123',
    phone: '9999999999'
  });
  report(
    'Backend rejects repeating digits phone (9999999999) with 400',
    repeatPhoneRes.status === 400 &&
      repeatPhoneRes.data.errors?.phone === 'Enter a valid 10-digit mobile number.'
  );

  // 5.3 Invalid GSTIN
  const badGstRes = await makeRequest('POST', '/api/company/register', {
    companyName: 'Test Corp',
    email: 'valid_test@company.com',
    password: 'Password123',
    gstNumber: '27AAPFU0939F1ZX' // Invalid checksum
  });
  report(
    'Backend rejects invalid GSTIN checksum with 400 and inline error',
    badGstRes.status === 400 &&
      badGstRes.data.errors?.gstNumber === 'Enter a valid 15-character GSTIN.'
  );

  const badGstStateRes = await makeRequest('POST', '/api/company/register', {
    companyName: 'Test Corp',
    email: 'valid_test@company.com',
    password: 'Password123',
    gstNumber: '98AAPFU0939F1ZV' // Invalid state code
  });
  report(
    'Backend rejects invalid GSTIN state code with 400',
    badGstStateRes.status === 400 &&
      badGstStateRes.data.errors?.gstNumber === 'Enter a valid 15-character GSTIN.'
  );

  // 5.4 Invalid Website URL
  const badUrlRes = await makeRequest('POST', '/api/company/register', {
    companyName: 'Test Corp',
    email: 'valid_test@company.com',
    password: 'Password123',
    websiteUrl: 'not a valid url'
  });
  report(
    'Backend rejects malformed website URL with 400 and inline error',
    badUrlRes.status === 400 &&
      badUrlRes.data.errors?.websiteUrl === 'Enter a valid website URL.'
  );

  const longUrlRes = await makeRequest('POST', '/api/company/register', {
    companyName: 'Test Corp',
    email: 'valid_test@company.com',
    password: 'Password123',
    websiteUrl: 'https://example.com/' + 'z'.repeat(250)
  });
  report(
    'Backend rejects excessive website URL (>255) with 400',
    longUrlRes.status === 400 &&
      longUrlRes.data.errors?.websiteUrl === 'Website URL is too long.'
  );

  // 5.5 Invalid Address
  const longAddressRes = await makeRequest('POST', '/api/company/register', {
    companyName: 'Test Corp',
    email: 'valid_test@company.com',
    password: 'Password123',
    address: 'A'.repeat(251)
  });
  report(
    'Backend rejects excessive address (>250) with 400',
    longAddressRes.status === 400 &&
      longAddressRes.data.errors?.address === 'Address is too long.'
  );

  // 5.6 Successful Registration with Valid Data
  const uniqueSuffix = Date.now().toString().slice(-6);
  const testEmail = `test_corp_${uniqueSuffix}@tekdoctor-test.com`;
  const validRegisterPayload = {
    companyName: `Valitech Innovations ${uniqueSuffix}`,
    email: testEmail,
    password: 'SecurePassword123',
    contactPerson: 'Aditya Sharma',
    phone: `98${uniqueSuffix}10`.slice(0, 10),
    gstNumber: '27AAPFU0939F1ZV',
    websiteUrl: 'https://valitech.example.com',
    address: 'Plot 42, Silicon Valley Park, Bengaluru'
  };

  const successRes = await makeRequest('POST', '/api/company/register', validRegisterPayload);
  report(
    'Backend accepts fully valid company registration with 201',
    successRes.status === 201 && successRes.data.success === true,
    JSON.stringify(successRes.data)
  );

  // 5.7 Duplicate Email Prevention
  const dupEmailRes = await makeRequest('POST', '/api/company/register', validRegisterPayload);
  report(
    'Backend rejects duplicate email with 400 and inline email error',
    dupEmailRes.status === 400 &&
      dupEmailRes.data.errors?.email?.includes('already registered')
  );

  // ── Clean up database ─────────────────────────────────────────────────────
  try {
    const conn = await pool.getConnection();
    const [userRows] = await conn.query('SELECT id, company_id FROM users WHERE email = ?', [testEmail]);
    if (userRows.length > 0) {
      const uId = userRows[0].id;
      await conn.query('DELETE FROM company_profiles WHERE user_id = ?', [uId]);
      await conn.query('DELETE FROM users WHERE id = ?', [uId]);
    }
    conn.release();
    console.log('\n[INFO] Cleaned up temporary test company from database.');
  } catch (err) {
    console.warn('[WARN] DB cleanup note:', err.message);
  }

  if (server) {
    server.close();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`TEST SUMMARY: Total=${passedTests + failedTests} | Passed=${passedTests} | Failed=${failedTests}`);
  console.log('================================================================\n');

  await pool.end();

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
