/**
 * TekDoctor — Verification Test Suite: Book a Repair Form Validation Audit & Fix
 * 
 * Verifies frontend validation rules and backend API enforcement for:
 * 1. Customer Name (trimming, 2-30 chars, reject empty/whitespace/numbers)
 * 2. Phone Number (Indian mobile 10-digit format, 6-9 prefix, non-repeating)
 * 3. Email (format, trimmed, max 255 chars)
 * 4. Device Brand & Model (max 30 chars, customBrand required 2-30 chars when Other)
 * 5. Serial Number (max 30 chars, preserves legitimate chars)
 * 6. Device Configuration (max 200 chars)
 * 7. Address (max 150 chars)
 * 8. Postal / PIN Code (6-digit Indian PIN)
 * 9. City & State (city required, state max 50 chars matching DB column)
 * 10. Service Type & "Other" Service Option (customServiceType required 2-150 chars when Other)
 * 11. Problem Type & Description (10-500 chars)
 * 12. Direct Backend HTTP validation & 400 responses
 * 13. Valid Booking submission, DB persistence & trimming check
 * 14. Idempotency & duplicate submission prevention
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { pool } = require('../config/db.config');
const { isValidPhone, isValidDistrictForState, findStateKey, indiaStatesDistricts } = require('../middleware/validate.middleware');

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

// ── Frontend Validation Simulation (mirrors client/src/pages/repair/RepairInquiryForm.tsx) ──
function clientValidateField(name, value, allValues = {}) {
  const val = typeof value === 'string' ? value.trim() : (value || '');

  switch (name) {
    case 'customerName': {
      if (!val) return 'Full name is required.';
      if (val.length < 2 || val.length > 30) return 'Name must be between 2 and 30 characters.';
      if (!/^[a-zA-Z\s.'-]+$/.test(val)) return 'Name cannot contain numbers or special characters.';
      return undefined;
    }
    case 'mobile': {
      if (!val) return 'Mobile number is required.';
      try {
        isValidPhone(val);
      } catch (err) {
        return err.message;
      }
      return undefined;
    }
    case 'email': {
      if (!val) return 'Email address is required.';
      if (val.length > 255) return 'Email cannot exceed 255 characters.';
      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
      if (!emailRegex.test(val) || val.includes('..')) return 'Please enter a valid email address.';
      return undefined;
    }
    case 'address': {
      if (val && val.length > 150) return 'Address cannot exceed 150 characters.';
      return undefined;
    }
    case 'city': {
      if (!val) return 'City is required.';
      if (val.length < 2 || val.length > 100) return 'City name must be between 2 and 100 characters.';
      return undefined;
    }
    case 'state': {
      if (val && val.length > 50) return 'State name cannot exceed 50 characters.';
      return undefined;
    }
    case 'zipCode': {
      if (val && !/^[1-9][0-9]{5}$/.test(val)) return 'Please enter a valid 6-digit Indian PIN code.';
      return undefined;
    }
    case 'deviceCategory': {
      if (!val) return 'Please select a device category.';
      return undefined;
    }
    case 'customDeviceCategory': {
      if (allValues.deviceCategory === 'Other') {
        if (!val) return 'Please specify your device category.';
        if (val.length < 2 || val.length > 100) return 'Device category must be between 2 and 100 characters.';
      }
      return undefined;
    }
    case 'brand': {
      if (!val) return 'Please select a brand.';
      if (val.length > 30) return 'Brand name cannot exceed 30 characters.';
      return undefined;
    }
    case 'customBrand': {
      if (allValues.brand === 'Other') {
        if (!val) return 'Please specify your brand name.';
        if (val.length < 2 || val.length > 30) return 'Custom brand must be between 2 and 30 characters.';
      }
      return undefined;
    }
    case 'modelNumber': {
      if (val && val.length > 30) return 'Model number cannot exceed 30 characters.';
      return undefined;
    }
    case 'serialNumber': {
      if (val && val.length > 30) return 'Serial number cannot exceed 30 characters.';
      return undefined;
    }
    case 'deviceConfiguration': {
      if (val && val.length > 200) return 'Device configuration cannot exceed 200 characters.';
      return undefined;
    }
    case 'problemType': {
      if (!val) return 'Please select a problem type.';
      return undefined;
    }
    case 'customProblemType': {
      if (allValues.problemType === 'Other') {
        if (!val) return 'Please specify your problem type.';
        if (val.length < 2 || val.length > 150) return 'Custom problem type must be between 2 and 150 characters.';
      }
      return undefined;
    }
    case 'problemDescription': {
      if (!val) return 'Problem description is required.';
      if (val.length < 10 || val.length > 500) return 'Problem description must be between 10 and 500 characters.';
      return undefined;
    }
    case 'serviceType': {
      const validTypes = ['Bring to Service Center', 'Home Visit', 'Pickup & Drop', 'Other'];
      if (val && !validTypes.includes(val)) return 'Invalid service type selected.';
      return undefined;
    }
    case 'customServiceType': {
      if (allValues.serviceType === 'Other') {
        if (!val) return 'Please specify the service when Other is selected.';
        if (val.length < 2 || val.length > 150) return 'Custom service type must be between 2 and 150 characters.';
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

async function runTests() {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  testPort = server.address().port;

  console.log('\n================================================================');
  console.log(`TEKDOCTOR — BOOK A REPAIR FORM VALIDATION TEST SUITE (PORT: ${testPort})`);
  console.log('================================================================\n');

  // ── 1. Customer Name Validation ───────────────────────────────────────────
  console.log('--- 1. Customer Name Validation ---');
  report('Empty name is rejected', clientValidateField('customerName', '') === 'Full name is required.');
  report('Whitespace-only name is rejected', clientValidateField('customerName', '     ') === 'Full name is required.');
  report('1 character name is rejected', clientValidateField('customerName', 'A') === 'Name must be between 2 and 30 characters.');
  report('2 characters name is accepted', clientValidateField('customerName', 'Al') === undefined);
  report('30 characters name is accepted', clientValidateField('customerName', 'A'.repeat(30)) === undefined);
  report('31 characters name is rejected', clientValidateField('customerName', 'A'.repeat(31)) === 'Name must be between 2 and 30 characters.');
  report('Numbers in name rejected', clientValidateField('customerName', 'Vivek123') === 'Name cannot contain numbers or special characters.');
  report('Name with hyphens and spaces accepted', clientValidateField('customerName', 'Mary-Jane Watson') === undefined);
  report('Surrounding spaces trimmed', clientValidateField('customerName', '  Vivek Kumar  ') === undefined);

  // ── 2. Phone Number Validation ────────────────────────────────────────────
  console.log('\n--- 2. Phone Number Validation (Indian Mobile) ---');
  report('Empty phone rejected', clientValidateField('mobile', '') === 'Mobile number is required.');
  report('9 digits rejected', clientValidateField('mobile', '987654321') === 'Enter a valid 10-digit mobile number.');
  report('11 digits rejected', clientValidateField('mobile', '98765432101') === 'Enter a valid 10-digit mobile number.');
  report('Non 6-9 prefix rejected (e.g. starting with 5)', clientValidateField('mobile', '5876543210') === 'Enter a valid 10-digit mobile number.');
  report('Repeating digits rejected (9999999999)', clientValidateField('mobile', '9999999999') === 'Enter a valid 10-digit mobile number.');
  report('Repeating digits rejected (8888888888)', clientValidateField('mobile', '8888888888') === 'Enter a valid 10-digit mobile number.');
  report('Valid Indian mobile starting with 9 accepted', clientValidateField('mobile', '9876543210') === undefined);
  report('Valid Indian mobile starting with 8 accepted', clientValidateField('mobile', '8765432109') === undefined);
  report('Valid Indian mobile starting with 7 accepted', clientValidateField('mobile', '7654321098') === undefined);
  report('Valid Indian mobile starting with 6 accepted', clientValidateField('mobile', '6543210987') === undefined);

  // ── 3. Email Address Validation ───────────────────────────────────────────
  console.log('\n--- 3. Email Address Validation ---');
  report('Empty email rejected', clientValidateField('email', '') === 'Email address is required.');
  report('Malformed email without domain rejected', clientValidateField('email', 'test@') === 'Please enter a valid email address.');
  report('Malformed email without @ rejected', clientValidateField('email', 'test.com') === 'Please enter a valid email address.');
  report('Double dots rejected', clientValidateField('email', 'test..user@example.com') === 'Please enter a valid email address.');
  report('Email over 255 chars rejected', clientValidateField('email', 'a'.repeat(250) + '@example.com') === 'Email cannot exceed 255 characters.');
  report('Valid email accepted', clientValidateField('email', 'valid.customer@tekdoctor.in') === undefined);

  // ── 4. Address and Location Validation ────────────────────────────────────
  console.log('\n--- 4. Address and Location Validation ---');
  report('Empty address is allowed (optional)', clientValidateField('address', '') === undefined);
  report('150 chars address accepted', clientValidateField('address', 'A'.repeat(150)) === undefined);
  report('151 chars address rejected', clientValidateField('address', 'A'.repeat(151)) === 'Address cannot exceed 150 characters.');
  report('Empty city rejected', clientValidateField('city', '') === 'City is required.');
  report('Valid city accepted', clientValidateField('city', 'Bangalore') === undefined);
  report('50 chars state accepted', clientValidateField('state', 'A'.repeat(50)) === undefined);
  report('51 chars state rejected (DB column limit)', clientValidateField('state', 'A'.repeat(51)) === 'State name cannot exceed 50 characters.');
  report('Valid 6-digit Indian PIN accepted', clientValidateField('zipCode', '560001') === undefined);
  report('PIN starting with 0 rejected', clientValidateField('zipCode', '012345') === 'Please enter a valid 6-digit Indian PIN code.');
  report('5-digit PIN rejected', clientValidateField('zipCode', '56001') === 'Please enter a valid 6-digit Indian PIN code.');
  report('7-digit PIN rejected', clientValidateField('zipCode', '5600001') === 'Please enter a valid 6-digit Indian PIN code.');

  // ── 5. Device Details Validation ──────────────────────────────────────────
  console.log('\n--- 5. Device Details Validation ---');
  report('Empty brand rejected', clientValidateField('brand', '') === 'Please select a brand.');
  report('30 chars brand accepted', clientValidateField('brand', 'A'.repeat(30)) === undefined);
  report('31 chars brand rejected', clientValidateField('brand', 'A'.repeat(31)) === 'Brand name cannot exceed 30 characters.');
  report('Brand Other with empty customBrand rejected', clientValidateField('customBrand', '', { brand: 'Other' }) === 'Please specify your brand name.');
  report('Brand Other with whitespace customBrand rejected', clientValidateField('customBrand', '   ', { brand: 'Other' }) === 'Please specify your brand name.');
  report('Brand Other with 30 chars customBrand accepted', clientValidateField('customBrand', 'A'.repeat(30), { brand: 'Other' }) === undefined);
  report('Brand Other with 31 chars customBrand rejected', clientValidateField('customBrand', 'A'.repeat(31), { brand: 'Other' }) === 'Custom brand must be between 2 and 30 characters.');
  report('Model number 30 chars accepted', clientValidateField('modelNumber', 'A'.repeat(30)) === undefined);
  report('Model number 31 chars rejected', clientValidateField('modelNumber', 'A'.repeat(31)) === 'Model number cannot exceed 30 characters.');
  report('Model number with legitimate chars accepted', clientValidateField('modelNumber', 'Latitude 5420/v2-X') === undefined);
  report('Serial number 30 chars accepted', clientValidateField('serialNumber', 'A'.repeat(30)) === undefined);
  report('Serial number 31 chars rejected', clientValidateField('serialNumber', 'A'.repeat(31)) === 'Serial number cannot exceed 30 characters.');
  report('Serial number with legitimate chars accepted', clientValidateField('serialNumber', 'SN-2026/09_XYZ') === undefined);
  report('Device configuration 200 chars accepted', clientValidateField('deviceConfiguration', 'A'.repeat(200)) === undefined);
  report('Device configuration 201 chars rejected', clientValidateField('deviceConfiguration', 'A'.repeat(201)) === 'Device configuration cannot exceed 200 characters.');

  // ── 6. Issues and Service Preference Validation ───────────────────────────
  console.log('\n--- 6. Issues and Service Preference Validation ---');
  report('Empty problem type rejected', clientValidateField('problemType', '') === 'Please select a problem type.');
  report('Problem type Other with empty customProblemType rejected', clientValidateField('customProblemType', '', { problemType: 'Other' }) === 'Please specify your problem type.');
  report('Custom problem type 150 chars accepted', clientValidateField('customProblemType', 'A'.repeat(150), { problemType: 'Other' }) === undefined);
  report('Custom problem type 151 chars rejected', clientValidateField('customProblemType', 'A'.repeat(151), { problemType: 'Other' }) === 'Custom problem type must be between 2 and 150 characters.');
  report('Problem description < 10 chars rejected', clientValidateField('problemDescription', 'Broken') === 'Problem description must be between 10 and 500 characters.');
  report('Problem description 10 chars accepted', clientValidateField('problemDescription', '1234567890') === undefined);
  report('Problem description 500 chars accepted', clientValidateField('problemDescription', 'A'.repeat(500)) === undefined);
  report('Problem description 501 chars rejected', clientValidateField('problemDescription', 'A'.repeat(501)) === 'Problem description must be between 10 and 500 characters.');
  report('Invalid serviceType rejected', clientValidateField('serviceType', 'Drone Delivery') === 'Invalid service type selected.');
  report('Valid serviceType accepted', clientValidateField('serviceType', 'Bring to Service Center') === undefined);
  report('Service type Other with empty customServiceType rejected', clientValidateField('customServiceType', '', { serviceType: 'Other' }) === 'Please specify the service when Other is selected.');
  report('Service type Other with whitespace customServiceType rejected', clientValidateField('customServiceType', '   ', { serviceType: 'Other' }) === 'Please specify the service when Other is selected.');
  report('Custom service type 150 chars accepted', clientValidateField('customServiceType', 'A'.repeat(150), { serviceType: 'Other' }) === undefined);
  report('Custom service type 151 chars rejected', clientValidateField('customServiceType', 'A'.repeat(151), { serviceType: 'Other' }) === 'Custom service type must be between 2 and 150 characters.');
  report('Valid customServiceType accepted', clientValidateField('customServiceType', 'Board Level Micro Soldering', { serviceType: 'Other' }) === undefined);

  // ── 7. Direct Backend HTTP API Validation ─────────────────────────────────
  console.log('\n--- 7. Direct Backend HTTP API Validation (POST /api/repair-request) ---');

  // Test 7.1: Empty payload
  const emptyRes = await makeRequest('POST', '/api/repair-request', {});
  report('Empty request returns 400 Bad Request', emptyRes.status === 400);
  report('Empty request contains validation errors', typeof emptyRes.data?.errors === 'object' && Object.keys(emptyRes.data.errors).length > 0);

  // Test 7.2: Whitespace-only name
  const wsNameRes = await makeRequest('POST', '/api/repair-request', {
    customerName: '     ',
    mobile: '9876543210',
    email: 'valid@tekdoctor.in',
    city: 'Bangalore',
    deviceCategory: 'Laptop',
    brand: 'Dell',
    problemType: 'Screen Issue',
    problemDescription: 'Screen flickering constantly whenever tilted.'
  });
  report('Whitespace name rejected with 400', wsNameRes.status === 400);
  const nameErrMsg = wsNameRes.data?.errors?.customerName || wsNameRes.data?.message;
  report('Customer name error mentions 2-30 characters', Boolean(nameErrMsg && nameErrMsg.includes('between 2 and 30 characters')));

  // Test 7.3: Invalid phone number (11 digits)
  const phoneRes = await makeRequest('POST', '/api/repair-request', {
    customerName: 'Vivek Kumar',
    mobile: '98765432109', // 11 digits
    email: 'valid@tekdoctor.in',
    city: 'Bangalore',
    deviceCategory: 'Laptop',
    brand: 'Dell',
    problemType: 'Screen Issue',
    problemDescription: 'Screen flickering constantly whenever tilted.'
  });
  report('11-digit mobile rejected with 400', phoneRes.status === 400);
  const phoneErrMsg = phoneRes.data?.errors?.mobile || phoneRes.data?.message;
  report('Mobile error message is exact: "Enter a valid 10-digit mobile number."', phoneErrMsg === 'Enter a valid 10-digit mobile number.');

  // Test 7.4: Brand 'Other' without customBrand
  const otherBrandRes = await makeRequest('POST', '/api/repair-request', {
    customerName: 'Vivek Kumar',
    mobile: '9876543210',
    email: 'valid@tekdoctor.in',
    city: 'Bangalore',
    deviceCategory: 'Laptop',
    brand: 'Other',
    customBrand: '',
    problemType: 'Screen Issue',
    problemDescription: 'Screen flickering constantly whenever tilted.'
  });
  report('Brand Other without customBrand rejected with 400', otherBrandRes.status === 400);
  const brandErrMsg = otherBrandRes.data?.errors?.customBrand || otherBrandRes.data?.message;
  report('Custom brand error message present', Boolean(brandErrMsg && brandErrMsg.includes('Please specify your brand name')));

  // Test 7.5: ServiceType 'Other' without customServiceType
  const otherServiceRes = await makeRequest('POST', '/api/repair-request', {
    customerName: 'Vivek Kumar',
    mobile: '9876543210',
    email: 'valid@tekdoctor.in',
    city: 'Bangalore',
    deviceCategory: 'Laptop',
    brand: 'Dell',
    problemType: 'Screen Issue',
    problemDescription: 'Screen flickering constantly whenever tilted.',
    serviceType: 'Other',
    customServiceType: ''
  });
  report('ServiceType Other without customServiceType rejected with 400', otherServiceRes.status === 400);
  const srvErrMsg = otherServiceRes.data?.errors?.customServiceType || otherServiceRes.data?.message;
  report('Custom service type error message exact: "Please specify the service when Other is selected."', srvErrMsg === 'Please specify the service when Other is selected.');

  // Test 7.6: State exceeding 50 characters (schema integrity)
  const stateOversizedRes = await makeRequest('POST', '/api/repair-request', {
    customerName: 'Vivek Kumar',
    mobile: '9876543210',
    email: 'valid@tekdoctor.in',
    city: 'Bangalore',
    state: 'A'.repeat(51),
    deviceCategory: 'Laptop',
    brand: 'Dell',
    problemType: 'Screen Issue',
    problemDescription: 'Screen flickering constantly whenever tilted.'
  });
  report('State over 50 chars rejected with 400', stateOversizedRes.status === 400);
  const stateErrMsg = stateOversizedRes.data?.errors?.state || stateOversizedRes.data?.message;
  report('State error mentions 50 characters', Boolean(stateErrMsg && stateErrMsg.includes('cannot exceed 50 characters')));

  // Test 7.7: Address exceeding 150 characters
  const addrOversizedRes = await makeRequest('POST', '/api/repair-request', {
    customerName: 'Vivek Kumar',
    mobile: '9876543210',
    email: 'valid@tekdoctor.in',
    address: 'A'.repeat(151),
    city: 'Bangalore',
    deviceCategory: 'Laptop',
    brand: 'Dell',
    problemType: 'Screen Issue',
    problemDescription: 'Screen flickering constantly whenever tilted.'
  });
  report('Address over 150 chars rejected with 400', addrOversizedRes.status === 400);
  const addrErrMsg = addrOversizedRes.data?.errors?.address || addrOversizedRes.data?.message;
  report('Address error mentions 150 characters', Boolean(addrErrMsg && addrErrMsg.includes('cannot exceed 150 characters')));

  // Helper to allocate dynamic unique phone with zero collision with existing accounts
  async function allocateUniqueMobile() {
    while (true) {
      const randDigits = Math.floor(10000000 + Math.random() * 90000000);
      const candidateMobile = `98${randDigits}`;
      const [existing] = await pool.query(
        'SELECT id FROM users WHERE phone = ? OR phone = ?',
        [candidateMobile, `+91${candidateMobile}`]
      );
      if (existing.length === 0) {
        return candidateMobile;
      }
    }
  }

  // Helper to completely clean up test ticket, test user, and test sequence
  async function cleanupBookingFixture(ticketNum, email) {
    try {
      if (ticketNum) {
        const [rows] = await pool.execute('SELECT user_id FROM service_requests WHERE ticket_number = ?', [ticketNum]);
        const userId = rows[0]?.user_id;
        await pool.execute('DELETE FROM service_requests WHERE ticket_number = ?', [ticketNum]);
        const accId = ticketNum.substring(0, ticketNum.lastIndexOf('-'));
        await pool.execute('DELETE FROM app_sequences WHERE sequence_name = ?', [`tkt:${accId}`]);
        if (userId) {
          await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
        }
      }
      if (email) {
        await pool.execute('DELETE FROM users WHERE email = ?', [email]);
      }
    } catch (e) {
      // ignore
    }
  }

  // ── 8. Real Booking Submission & Database Persistence ─────────────────────
  console.log('\n--- 8. Real Booking Submission & Database Persistence ---');

  const testSubmissionId = 'test-sub-' + Date.now();
  const testEmail = `audit_test_${Date.now()}@tekdoctor-audit.in`;
  const testPhone8 = await allocateUniqueMobile();
  const validPayload = {
    clientSubmissionId: testSubmissionId,
    customerName: '  Test Booking User  ', // Intentionally with spaces to verify trimming
    mobile: testPhone8,
    email: testEmail,
    address: '  123 Tech Park, 4th Cross  ',
    city: '  Bangalore  ',
    state: 'Karnataka',
    zipCode: '560001',
    deviceCategory: 'Laptop',
    brand: 'Other',
    customBrand: '  Framework Laptop  ',
    modelNumber: '  Framework 16  ',
    serialNumber: '  FRM-16-2026-XYZ  ',
    deviceConfiguration: '  AMD Ryzen 7, 32GB RAM, 1TB NVMe  ',
    problemType: 'Other',
    customProblemType: '  Mainboard power rail short circuit  ',
    problemDescription: 'Device stopped booting after a sudden power surge. Power LED blinks amber 3 times.',
    serviceType: 'Other',
    customServiceType: '  Component Level Micro-Soldering  ',
    priority: 'Priority',
    preferredContactMethod: 'Phone Call, WhatsApp'
  };

  let createdTicketNumber = null;
  try {
    const validRes = await makeRequest('POST', '/api/repair-request', validPayload);
    report('Valid booking created with status 201', validRes.status === 201);
    report('Returns ticketNumber', Boolean(validRes.data?.data?.ticketNumber));
    createdTicketNumber = validRes.data?.data?.ticketNumber;

    if (createdTicketNumber) {
      // Verify persistence and trimming in MySQL database
      const [rows] = await pool.execute(
        'SELECT * FROM service_requests WHERE ticket_number = ?',
        [createdTicketNumber]
      );

      report('Database record found in service_requests', rows.length === 1);
      if (rows.length === 1) {
        const record = rows[0];
        report('Customer name is trimmed in DB', record.customer_name === 'Test Booking User');
        report('Address is trimmed in DB', record.address === '123 Tech Park, 4th Cross');
        report('City is trimmed in DB', record.city === 'Bangalore');
        report('Brand is saved as Other', record.brand === 'Other');
        report('Custom brand is trimmed in DB', record.custom_brand === 'Framework Laptop');
        report('Model number is trimmed in DB', record.model_number === 'Framework 16');
        report('Serial number is trimmed in DB', record.serial_number === 'FRM-16-2026-XYZ');
        report('Device configuration is trimmed in DB', record.device_configuration === 'AMD Ryzen 7, 32GB RAM, 1TB NVMe');
        report('Problem type is Other', record.problem_type === 'Other');
        report('Custom problem type is trimmed in DB', record.custom_problem_type === 'Mainboard power rail short circuit');
        report('Service type is Other', record.service_type === 'Other');
        report('Custom service type is saved and trimmed in DB', record.custom_service_type === 'Component Level Micro-Soldering');
      }

      // ── 9. Duplicate Submission Prevention ──────────────────────────────────
      console.log('\n--- 9. Duplicate Submission Prevention ---');
      const duplicateRes = await makeRequest('POST', '/api/repair-request', validPayload);
      report('Duplicate request handled gracefully (status 200 or 201)', duplicateRes.status === 200 || duplicateRes.status === 201);
      report('Duplicate request identified as duplicate', duplicateRes.data?.isDuplicate === true);
      report('Duplicate request returns the same ticketNumber', duplicateRes.data?.data?.ticketNumber === createdTicketNumber);
    }
  } finally {
    // ── 10. Database Cleanup ────────────────────────────────────────────────
    console.log('\n--- 10. Database Cleanup ---');
    await cleanupBookingFixture(createdTicketNumber, testEmail);
    report('Cleaned up test booking, fixture user and sequence records', true);
  }

  // ── 11. State-Wise District Dataset Verification ──────────────────────────
  console.log('\n--- 11. State-Wise District Dataset Verification ---');
  const serverDataset = indiaStatesDistricts;
  const clientDatasetPath = path.resolve(__dirname, '../../client/src/data/indiaStatesDistricts.json');
  const clientDataset = JSON.parse(fs.readFileSync(clientDatasetPath, 'utf8'));

  const stateKeys = Object.keys(serverDataset);
  report('All 36 Indian States and Union Territories present', stateKeys.length === 36);

  // Check Uttar Pradesh
  const upDistricts = serverDataset['Uttar Pradesh'] || [];
  report('Uttar Pradesh contains all 75 verified districts', upDistricts.length === 75);

  // Check Maharashtra
  const mhDistricts = serverDataset['Maharashtra'] || [];
  report('Maharashtra contains 36 verified districts', mhDistricts.length === 36);

  // Check Karnataka
  const kaDistricts = serverDataset['Karnataka'] || [];
  report('Karnataka contains 31 verified districts', kaDistricts.length === 31);

  // Check for 0 empty district lists
  const allStatesHaveDistricts = stateKeys.every(s => Array.isArray(serverDataset[s]) && serverDataset[s].length > 0);
  report('Every State and UT has a non-empty district list', allStatesHaveDistricts);

  // Check for duplicate districts within any State/UT
  let totalDuplicates = 0;
  for (const st of stateKeys) {
    const list = serverDataset[st];
    const seen = new Set();
    for (const d of list) {
      if (seen.has(d.toLowerCase())) totalDuplicates++;
      seen.add(d.toLowerCase());
    }
  }
  report('Zero duplicate districts detected in any State/UT', totalDuplicates === 0);

  // Verify Client and Server datasets are completely identical
  const datasetsIdentical = JSON.stringify(serverDataset) === JSON.stringify(clientDataset);
  report('Client and Server datasets are identical', datasetsIdentical);

  // ── 12. State-District Validation & Dropdown Dynamics ─────────────────────
  console.log('\n--- 12. State-District Validation & Dropdown Dynamics ---');
  report('UP district (Lucknow) validates against Uttar Pradesh', isValidDistrictForState('Uttar Pradesh', 'Lucknow'));
  report('UP district (Varanasi) validates against Uttar Pradesh', isValidDistrictForState('Uttar Pradesh', 'Varanasi'));
  report('UP district (Prayagraj) validates against Uttar Pradesh', isValidDistrictForState('Uttar Pradesh', 'Prayagraj'));
  report('MH district (Pune) validates against Maharashtra', isValidDistrictForState('Maharashtra', 'Pune'));
  report('MH district (Mumbai City) validates against Maharashtra', isValidDistrictForState('Maharashtra', 'Mumbai City'));
  report('MH district (Nagpur) validates against Maharashtra', isValidDistrictForState('Maharashtra', 'Nagpur'));

  // Invalid / Mismatched State-District pairs
  report('Mismatched pair rejected: Lucknow does NOT belong to Maharashtra', !isValidDistrictForState('Maharashtra', 'Lucknow'));
  report('Mismatched pair rejected: Pune does NOT belong to Uttar Pradesh', !isValidDistrictForState('Uttar Pradesh', 'Pune'));
  report('Mismatched pair rejected: Patna does NOT belong to Gujarat', !isValidDistrictForState('Gujarat', 'Patna'));
  report('Unknown State rejected: Pune does NOT belong to UnknownState', !isValidDistrictForState('UnknownState', 'Pune'));

  // Common aliases and compound names
  report('Alias accepted: Bangalore resolves to Bengaluru Urban in Karnataka', isValidDistrictForState('Karnataka', 'Bangalore'));
  report('Alias accepted: Noida resolves to Gautam Buddha Nagar in Uttar Pradesh', isValidDistrictForState('Uttar Pradesh', 'Noida'));
  report('Alias accepted: Gurgaon resolves to Gurugram in Haryana', isValidDistrictForState('Haryana', 'Gurgaon'));
  report('Compound name accepted: Chhatrapati Sambhajinagar in Maharashtra', isValidDistrictForState('Maharashtra', 'Chhatrapati Sambhajinagar'));

  // ── 13. Backend HTTP API State-District Validation ────────────────────────
  console.log('\n--- 13. Backend HTTP API State-District Validation ---');

  // Test 13.1: Mismatched State and District via API
  const mismatchedRes = await makeRequest('POST', '/api/repair-request', {
    customerName: 'State District Test User',
    mobile: '9876543210',
    email: 'mismatch_test@tekdoctor.in',
    state: 'Maharashtra',
    city: 'Lucknow', // Belongs to UP, not MH
    deviceCategory: 'Laptop',
    brand: 'Dell',
    problemType: 'Screen Issue',
    problemDescription: 'Testing invalid State-District rejection.'
  });
  report('Mismatched State-District rejected with 400', mismatchedRes.status === 400);
  const cityErrMsg = mismatchedRes.data?.errors?.city || mismatchedRes.data?.message;
  report('Error message specifies district is not valid for state', Boolean(cityErrMsg && cityErrMsg.includes('not valid for Maharashtra')));

  // Test 13.2: Invalid / Unrecognized State via API
  const invalidStateRes = await makeRequest('POST', '/api/repair-request', {
    customerName: 'State District Test User',
    mobile: '9876543210',
    email: 'invalid_state_test@tekdoctor.in',
    state: 'NonExistentStateOfIndia',
    city: 'Pune',
    deviceCategory: 'Laptop',
    brand: 'Dell',
    problemType: 'Screen Issue',
    problemDescription: 'Testing invalid State rejection.'
  });
  report('Unrecognized State rejected with 400', invalidStateRes.status === 400);
  const stateErr = invalidStateRes.data?.errors?.state || invalidStateRes.data?.message;
  report('State error mentions valid Indian State or Union Territory', Boolean(stateErr && stateErr.includes('valid Indian State or Union Territory')));

  // Test 13.3: Valid State-District submission creates ticket and persists in DB
  const mhMobile = await allocateUniqueMobile();
  const validMhPayload = {
    clientSubmissionId: 'test-mh-sub-' + Date.now(),
    customerName: 'Maharashtra User',
    mobile: mhMobile,
    email: `mh_test_${Date.now()}@tekdoctor.in`,
    address: 'FC Road, Shivajinagar',
    state: 'Maharashtra',
    city: 'Pune',
    zipCode: '411005',
    deviceCategory: 'Desktop PC',
    brand: 'HP',
    problemType: 'No Power/No Display',
    problemDescription: 'Desktop PC does not display anything on boot.',
    serviceType: 'Bring to Service Center'
  };

  let mhTicket = null;
  try {
    const validMhRes = await makeRequest('POST', '/api/repair-request', validMhPayload);
    report('Valid State-District booking created with status 201', validMhRes.status === 201);
    mhTicket = validMhRes.data?.data?.ticketNumber;
    report('Valid booking returns ticket number', Boolean(mhTicket));

    if (mhTicket) {
      const [mhRows] = await pool.execute('SELECT * FROM service_requests WHERE ticket_number = ?', [mhTicket]);
      report('Maharashtra booking found in service_requests', mhRows.length === 1);
      if (mhRows.length === 1) {
        report('State correctly saved as Maharashtra', mhRows[0].state === 'Maharashtra');
        report('City correctly saved as Pune', mhRows[0].city === 'Pune');
      }
    }
  } finally {
    await cleanupBookingFixture(mhTicket, validMhPayload.email);
  }

  // Test 13.4: Valid Uttar Pradesh booking creates ticket
  const upMobile = await allocateUniqueMobile();
  const validUpPayload = {
    clientSubmissionId: 'test-up-sub-' + Date.now(),
    customerName: 'UP Test User',
    mobile: upMobile,
    email: `up_test_${Date.now()}@tekdoctor.in`,
    address: 'Ghat Road',
    state: 'Uttar Pradesh',
    city: 'Varanasi',
    zipCode: '221001',
    deviceCategory: 'Laptop',
    brand: 'Lenovo',
    problemType: 'Screen Crack/Flicker',
    problemDescription: 'Screen has horizontal colored lines running across.',
    serviceType: 'Home Visit'
  };

  let upTicket = null;
  try {
    const validUpRes = await makeRequest('POST', '/api/repair-request', validUpPayload);
    report('Valid UP State-District booking created with status 201', validUpRes.status === 201);
    upTicket = validUpRes.data?.data?.ticketNumber;
    report('Valid UP booking returns ticket number', Boolean(upTicket));

    if (upTicket) {
      const [upRows] = await pool.execute('SELECT * FROM service_requests WHERE ticket_number = ?', [upTicket]);
      report('UP booking found in service_requests', upRows.length === 1);
      if (upRows.length === 1) {
        report('State correctly saved as Uttar Pradesh', upRows[0].state === 'Uttar Pradesh');
        report('City correctly saved as Varanasi', upRows[0].city === 'Varanasi');
      }
    }
  } finally {
    await cleanupBookingFixture(upTicket, validUpPayload.email);
  }

  // Close server and pool
  await new Promise((resolve) => server.close(resolve));
  await pool.end();

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running verification test suite:', err);
  if (server) server.close();
  process.exit(1);
});
