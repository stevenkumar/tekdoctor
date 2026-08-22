const http = require('http');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');

const BASE_URL = `http://localhost:${config.server.port || 5000}`;

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    testsFailed++;
  }
}

// Minimal multipart form-data builder without third-party libraries
function createMultipartPayload(fields, files) {
  const boundary = `--------------------------${Date.now().toString(16)}`;
  const chunks = [];

  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
    ));
  }

  for (const file of files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
    ));
    chunks.push(file.content);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(chunks);

  return {
    boundary,
    contentType: `multipart/form-data; boundary=${boundary}`,
    body
  };
}

function makeRequest(method, pathName, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathName, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        ...headers
      }
    };

    if (body) {
      if (Buffer.isBuffer(body)) {
        options.headers['Content-Length'] = body.length;
      } else if (typeof body === 'object') {
        const jsonBody = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(jsonBody);
        body = jsonBody;
      }
    }

    const req = http.request(options, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        let parsed = null;
        const text = buffer.toString('utf8');
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          parsed = text;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
          rawBuffer: buffer
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log(' TEKDOCTOR — REPAIR IMAGE UPLOAD & DISPLAY VERIFICATION SUITE');
  console.log('================================================================\n');

  let testUser1Id = null;
  let testUser2Id = null;
  let adminId = null;
  let techId = null;
  let user1Token = null;
  let user2Token = null;
  let adminToken = null;
  let techToken = null;

  try {
    // 1. Admin login to obtain token
    console.log('1. Authenticating test accounts...');
    const adminLogin = await makeRequest('POST', '/api/auth/signin', {}, {
      email: 'admin@tekdoctor.in',
      password: 'Admin@123'
    });

    if (adminLogin.status === 200 && adminLogin.data.success) {
      adminToken = adminLogin.data.data.token;
      adminId = adminLogin.data.data.id;
      assert(true, 'Admin authentication successful');
    } else {
      assert(false, `Admin authentication failed: ${JSON.stringify(adminLogin.data)}`);
    }

    // Register Customer 1
    const testEmail1 = `img_cust1_${Date.now()}@example.com`;
    const cust1Reg = await makeRequest('POST', '/api/auth/signup', {}, {
      name: 'Image Test Customer 1',
      email: testEmail1,
      password: 'Password@123',
      role: 'customer'
    });
    user1Token = cust1Reg.data?.data?.token;
    testUser1Id = cust1Reg.data?.data?.id;
    assert(cust1Reg.status === 201 && !!user1Token, 'Customer 1 registered successfully');

    // Register Customer 2 (for unauthorized access tests)
    const testEmail2 = `img_cust2_${Date.now()}@example.com`;
    const cust2Reg = await makeRequest('POST', '/api/auth/signup', {}, {
      name: 'Image Test Customer 2',
      email: testEmail2,
      password: 'Password@123',
      role: 'customer'
    });
    user2Token = cust2Reg.data?.data?.token;
    testUser2Id = cust2Reg.data?.data?.id;
    assert(cust2Reg.status === 201 && !!user2Token, 'Customer 2 registered successfully');

    // Register Technician
    const techEmail = `img_tech_${Date.now()}@example.com`;
    const techReg = await makeRequest('POST', '/api/auth/signup', {}, {
      name: 'Image Test Tech',
      email: techEmail,
      password: 'Password@123',
      role: 'technician'
    });
    techToken = techReg.data?.data?.token;
    techId = techReg.data?.data?.id;
    assert(techReg.status === 201 && !!techToken, 'Technician registered successfully');

    // 2. Submit Repair Request with Device Image and Error Screenshot
    console.log('\n2. Testing Repair Request submission with multipart images...');
    
    // Create minimal 1x1 PNG buffers for testing
    const fakePng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
    ]);

    const fields = {
      customerName: 'Image Test Customer 1',
      mobile: '9876543210',
      email: testEmail1,
      city: 'Bengaluru',
      deviceCategory: 'Laptop',
      brand: 'Dell',
      modelNumber: 'XPS 15 9520',
      problemType: 'Screen Damage',
      problemDescription: 'Cracked screen after falling down from the office desk and needs replacement',
      serviceType: 'Bring to Service Center',
      priority: 'Standard',
      preferredContactMethod: 'WhatsApp'
    };

    const files = [
      {
        fieldname: 'deviceImage',
        filename: 'laptop_photo.png',
        contentType: 'image/png',
        content: fakePng
      },
      {
        fieldname: 'errorScreenshot',
        filename: 'screen_artifact.png',
        contentType: 'image/png',
        content: fakePng
      }
    ];

    const multipart = createMultipartPayload(fields, files);

    const submitRes = await makeRequest(
      'POST',
      '/api/repair-request',
      {
        'Content-Type': multipart.contentType,
        'Authorization': `Bearer ${user1Token}`
      },
      multipart.body
    );

    assert(submitRes.status === 201 && submitRes.data.success, 'Repair request submitted successfully with images');
    const createdRequestId = submitRes.data?.data?.requestId;
    const createdTicketNumber = submitRes.data?.data?.ticketNumber;
    assert(!!createdRequestId, `Repair Request ID created: ${createdRequestId} (Ticket: ${createdTicketNumber})`);

    // 3. Verify Database Storage Paths
    console.log('\n3. Verifying Database record and disk file persistence...');
    const [dbRows] = await pool.query(
      'SELECT id, ticket_number, image_path, screenshot_path FROM service_requests WHERE id = ?',
      [createdRequestId]
    );

    assert(dbRows.length === 1, 'Service request record found in MySQL');
    const dbRecord = dbRows[0];
    assert(
      typeof dbRecord.image_path === 'string' && dbRecord.image_path.startsWith('/uploads/repairs/images/'),
      `image_path correctly formatted: ${dbRecord.image_path}`
    );
    assert(
      typeof dbRecord.screenshot_path === 'string' && dbRecord.screenshot_path.startsWith('/uploads/repairs/screenshots/'),
      `screenshot_path correctly formatted: ${dbRecord.screenshot_path}`
    );

    // Verify physical file existence on disk
    const diskImagePath = path.join(__dirname, '..', dbRecord.image_path.replace(/^\//, ''));
    const diskScreenshotPath = path.join(__dirname, '..', dbRecord.screenshot_path.replace(/^\//, ''));

    assert(fs.existsSync(diskImagePath), `Device image exists on disk: ${diskImagePath}`);
    assert(fs.existsSync(diskScreenshotPath), `Screenshot exists on disk: ${diskScreenshotPath}`);

    // 4. Test Static Asset Serving over HTTP
    console.log('\n4. Testing Static Asset Serving via HTTP...');
    const imageHttpRes = await makeRequest('GET', dbRecord.image_path);
    assert(imageHttpRes.status === 200, `GET ${dbRecord.image_path} returns HTTP 200 OK`);
    assert(imageHttpRes.headers['content-type']?.includes('image'), `Content-Type is image/*: ${imageHttpRes.headers['content-type']}`);

    const screenshotHttpRes = await makeRequest('GET', dbRecord.screenshot_path);
    assert(screenshotHttpRes.status === 200, `GET ${dbRecord.screenshot_path} returns HTTP 200 OK`);
    assert(screenshotHttpRes.headers['content-type']?.includes('image'), `Content-Type is image/*: ${screenshotHttpRes.headers['content-type']}`);

    // 5. Test Backward-compatibility alias routes
    console.log('\n5. Testing Legacy Static Aliases (/uploads/device-images, /uploads/screenshots)...');
    const legacyDeviceUrl = dbRecord.image_path.replace('/uploads/repairs/images/', '/uploads/device-images/');
    const legacyScreenshotUrl = dbRecord.screenshot_path.replace('/uploads/repairs/screenshots/', '/uploads/screenshots/');

    const legacyDevRes = await makeRequest('GET', legacyDeviceUrl);
    assert(legacyDevRes.status === 200, `GET legacy alias ${legacyDeviceUrl} returns HTTP 200 OK`);

    const legacyScrRes = await makeRequest('GET', legacyScreenshotUrl);
    assert(legacyScrRes.status === 200, `GET legacy alias ${legacyScreenshotUrl} returns HTTP 200 OK`);

    // 6. Test Retrieval via APIs
    console.log('\n6. Testing Retrieval APIs across User, Admin, Technician, and Public Tracker...');
    
    // (a) Customer History API
    const custHistoryRes = await makeRequest('GET', '/api/repair-request/history', {
      'Authorization': `Bearer ${user1Token}`
    });
    assert(custHistoryRes.status === 200 && custHistoryRes.data.success, 'GET /api/repair-request/history returns 200');
    const custHistoryItem = custHistoryRes.data.data.data.find(r => r.id === createdRequestId);
    assert(!!custHistoryItem, 'Submitted ticket found in customer history');
    assert(custHistoryItem?.imagePath === dbRecord.image_path, `customer history imagePath matches: ${custHistoryItem?.imagePath}`);
    assert(custHistoryItem?.screenshotPath === dbRecord.screenshot_path, `customer history screenshotPath matches: ${custHistoryItem?.screenshotPath}`);

    // (b) Public Tracking API
    const trackingRes = await makeRequest('GET', `/api/repair-request/track/${createdTicketNumber}`);
    assert(trackingRes.status === 200 && trackingRes.data.success, `GET /api/repair-request/track/${createdTicketNumber} returns 200`);
    assert(trackingRes.data.data.imagePath === dbRecord.image_path, `Public tracking imagePath matches: ${trackingRes.data.data.imagePath}`);
    assert(trackingRes.data.data.screenshotPath === dbRecord.screenshot_path, `Public tracking screenshotPath matches: ${trackingRes.data.data.screenshotPath}`);

    // (c) Admin Ticket Detail API
    const adminDetailRes = await makeRequest('GET', `/api/repair-request/${createdRequestId}`, {
      'Authorization': `Bearer ${adminToken}`
    });
    assert(adminDetailRes.status === 200 && adminDetailRes.data.success, `Admin GET /api/repair-request/${createdRequestId} returns 200`);
    assert(adminDetailRes.data.data.imagePath === dbRecord.image_path, `Admin detail imagePath matches: ${adminDetailRes.data.data.imagePath}`);
    assert(adminDetailRes.data.data.screenshotPath === dbRecord.screenshot_path, `Admin detail screenshotPath matches: ${adminDetailRes.data.data.screenshotPath}`);

    // (d) Technician Task List API (Assign ticket first)
    await pool.query('UPDATE service_requests SET assigned_technician_id = ? WHERE id = ?', [techId, createdRequestId]);
    const techTasksRes = await makeRequest('GET', '/api/repair-request/my-tasks', {
      'Authorization': `Bearer ${techToken}`
    });
    assert(techTasksRes.status === 200 && techTasksRes.data.success, 'Technician GET /api/repair-request/my-tasks returns 200');
    const techTaskItem = techTasksRes.data.data.find(r => r.id === createdRequestId);
    assert(!!techTaskItem, 'Ticket found in technician task list');
    assert(techTaskItem?.imagePath === dbRecord.image_path, `Tech task imagePath matches: ${techTaskItem?.imagePath}`);
    assert(techTaskItem?.screenshotPath === dbRecord.screenshot_path, `Tech task screenshotPath matches: ${techTaskItem?.screenshotPath}`);

    // 7. Security & Access Control Verification
    console.log('\n7. Testing Security & Access Control...');
    // Customer 1 viewing own ticket by ID -> Allowed
    const cust1OwnRes = await makeRequest('GET', `/api/repair-request/${createdRequestId}`, {
      'Authorization': `Bearer ${user1Token}`
    });
    assert(cust1OwnRes.status === 200, 'Customer 1 allowed to view own ticket by ID (200 OK)');

    // Customer 2 viewing Customer 1's ticket by ID -> Forbidden
    const cust2CrossRes = await makeRequest('GET', `/api/repair-request/${createdRequestId}`, {
      'Authorization': `Bearer ${user2Token}`
    });
    assert(cust2CrossRes.status === 403, 'Customer 2 forbidden from viewing Customer 1 ticket (403 Forbidden)');

    // 8. Admin Update with Image Replacement Test
    console.log('\n8. Testing Admin PUT /api/repair-request/:id image update...');
    const updateFields = {
      customerName: 'Image Test Customer 1 Updated',
      mobile: '9876543210',
      email: testEmail1,
      deviceCategory: 'Laptop',
      brand: 'Dell',
      modelNumber: 'XPS 15 9520 Updated',
      problemType: 'Screen & Battery Damage',
      priority: 'Urgent'
    };

    const updateFiles = [
      {
        fieldname: 'deviceImage',
        filename: 'replacement_laptop_photo.png',
        contentType: 'image/png',
        content: fakePng
      }
    ];

    const updateMultipart = createMultipartPayload(updateFields, updateFiles);
    const updateRes = await makeRequest(
      'PUT',
      `/api/repair-request/${createdRequestId}`,
      {
        'Content-Type': updateMultipart.contentType,
        'Authorization': `Bearer ${adminToken}`
      },
      updateMultipart.body
    );

    assert(updateRes.status === 200 && updateRes.data.success, 'Admin updated repair request with replacement image');

    const [updatedDbRows] = await pool.query(
      'SELECT id, image_path, screenshot_path FROM service_requests WHERE id = ?',
      [createdRequestId]
    );
    assert(
      updatedDbRows[0].image_path !== dbRecord.image_path && updatedDbRows[0].image_path.startsWith('/uploads/repairs/images/'),
      `Updated image_path persisted: ${updatedDbRows[0].image_path}`
    );
    assert(
      updatedDbRows[0].screenshot_path === dbRecord.screenshot_path,
      'Untouched screenshot_path remained intact'
    );

  } catch (err) {
    console.error('Unexpected test failure:', err);
    testsFailed++;
  } finally {
    // Cleanup created test files on disk and db entries
    try {
      const [cleanupRows] = await pool.query(
        "SELECT image_path, screenshot_path FROM service_requests WHERE customer_name LIKE 'Image Test Customer%'"
      );
      for (const row of cleanupRows) {
        if (row.image_path) {
          const p = path.join(__dirname, '..', row.image_path.replace(/^\//, ''));
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        if (row.screenshot_path) {
          const p = path.join(__dirname, '..', row.screenshot_path.replace(/^\//, ''));
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }
      }

      await pool.query("DELETE FROM service_requests WHERE customer_name LIKE 'Image Test Customer%'");
      await pool.query("DELETE FROM users WHERE email LIKE 'img_%@example.com'");
    } catch (cleanupErr) { }

    console.log('\n================================================================');
    console.log(` RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('================================================================\n');

    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

runTests();
