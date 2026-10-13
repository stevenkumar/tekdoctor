/**
 * Phase 5 Security Fixes Verification Script
 * 
 * Verifies:
 * 1. M-01: Public Repair Tracking PII Exposure & ID Enumeration Prevention
 *    - Query by valid ticket_number succeeds (200)
 *    - Query by sequential numeric database ID does not expose ticket (404)
 *    - Invalid ticket_number safely fails with 404
 *    - Public response does NOT expose raw email
 *    - Public response does NOT expose raw mobile
 *    - Customer name is masked (e.g. R*** O***)
 *    - Legitimate tracking details (deviceCategory, status, brand, model, etc.) remain intact
 * 
 * 2. M-02: Company Ticket Cancellation Ownership
 *    - Customer owning ticket can cancel (200)
 *    - Unrelated customer is rejected with 403 Forbidden
 *    - Company owning ticket can cancel (200)
 *    - Unrelated company is rejected with 403 Forbidden
 *    - Technician cannot cancel customer/company ticket (403 Forbidden)
 *    - Admin can cancel ticket (200)
 *    - Cancellation state rules preserved (cannot cancel non-pending/in_progress ticket -> 400)
 * 
 * 3. L-02: Public Draft Endpoint Rate Limiting
 *    - rateLimiter.middleware.js exports apiLimiter
 *    - repair.routes.js imports and mounts apiLimiter on POST and GET /draft/:draftId
 *    - apiLimiter reuses globalLimiter config (0 duplicate rate limiters)
 *    - Legitimate draft save (POST) and retrieve (GET) continue working flawlessly
 * 
 * 4. L-01: SMTP TLS Certificate Validation
 *    - Production / external SMTP strictly enforces TLS certificate validation (rejectUnauthorized: true)
 *    - Local development / loopback SMTP remains compatible (rejectUnauthorized: false)
 *    - Config override (SMTP_REJECT_UNAUTHORIZED) is honored
 *    - getEmailConfig loads successfully and error sanitization is preserved
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const { generateToken } = require('../utils/auth.helpers');
const { resolveTlsConfig, getEmailConfig, sanitizeErrorMessage } = require('../utils/email.utils');
const rateLimiter = require('../middleware/rateLimiter.middleware');

const API_BASE = 'http://127.0.0.1:5000/api';

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      if (typeof postData === 'object' && !(postData instanceof Buffer)) {
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(postData));
      } else {
        req.write(postData);
      }
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(message, condition, details = '') {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}${details ? ' - ' + details : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING PHASE 5 TARGETED SECURITY VERIFICATION');
  console.log('====================================================\n');

  let connection;
  const createdTicketIds = [];
  const createdUserIds = [];

  try {
    connection = await pool.getConnection();

    // ── SETUP: Create test users and tickets ──────────────────
    console.log('--- Setting up test fixtures in database ---');

    // 1. Customer User A (owner)
    const [uARes] = await connection.query(`
      INSERT INTO users (name, email, password, role, is_active, token_version)
      VALUES ('Phase5 Cust Alpha', 'phase5_cust_a@tektest.com', 'hashed_pass_123', 'customer', 1, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `);
    const custAId = uARes.insertId;
    createdUserIds.push(custAId);

    // 2. Customer User B (unrelated customer)
    const [uBRes] = await connection.query(`
      INSERT INTO users (name, email, password, role, is_active, token_version)
      VALUES ('Phase5 Cust Beta', 'phase5_cust_b@tektest.com', 'hashed_pass_123', 'customer', 1, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `);
    const custBId = uBRes.insertId;
    createdUserIds.push(custBId);

    // 3. Company User A (owner company)
    const [cARes] = await connection.query(`
      INSERT INTO users (name, email, password, role, is_active, token_version, company_id)
      VALUES ('Phase5 Corp Alpha', 'phase5_corp_a@tektest.com', 'hashed_pass_123', 'company', 1, 1, 'CMP-P5-001')
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `);
    const compAId = cARes.insertId;
    createdUserIds.push(compAId);

    // 4. Company User B (unrelated company)
    const [cBRes] = await connection.query(`
      INSERT INTO users (name, email, password, role, is_active, token_version, company_id)
      VALUES ('Phase5 Corp Beta', 'phase5_corp_b@tektest.com', 'hashed_pass_123', 'company', 1, 1, 'CMP-P5-002')
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `);
    const compBId = cBRes.insertId;
    createdUserIds.push(compBId);

    // 5. Technician User
    const [techRes] = await connection.query(`
      INSERT INTO users (name, email, password, role, is_active, token_version)
      VALUES ('Phase5 Tech Agent', 'phase5_tech@tektest.com', 'hashed_pass_123', 'technician', 1, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `);
    const techId = techRes.insertId;
    createdUserIds.push(techId);

    // 6. Admin User
    const [admRes] = await connection.query(`
      INSERT INTO users (name, email, password, role, is_active, token_version)
      VALUES ('Phase5 Admin Agent', 'phase5_admin@tektest.com', 'hashed_pass_123', 'admin', 1, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `);
    const adminId = admRes.insertId;
    createdUserIds.push(adminId);

    // Tokens
    const custAToken = generateToken({ id: custAId, name: 'Phase5 Cust Alpha', email: 'phase5_cust_a@tektest.com', role: 'customer', token_version: 1 });
    const custBToken = generateToken({ id: custBId, name: 'Phase5 Cust Beta', email: 'phase5_cust_b@tektest.com', role: 'customer', token_version: 1 });
    const compAToken = generateToken({ id: compAId, name: 'Phase5 Corp Alpha', email: 'phase5_corp_a@tektest.com', role: 'company', token_version: 1, companyId: 'CMP-P5-001' });
    const compBToken = generateToken({ id: compBId, name: 'Phase5 Corp Beta', email: 'phase5_corp_b@tektest.com', role: 'company', token_version: 1, companyId: 'CMP-P5-002' });
    const techToken = generateToken({ id: techId, name: 'Phase5 Tech Agent', email: 'phase5_tech@tektest.com', role: 'technician', token_version: 1 });
    const adminToken = generateToken({ id: adminId, name: 'Phase5 Admin Agent', email: 'phase5_admin@tektest.com', role: 'admin', token_version: 1 });

    // 7. Create tickets for testing
    // Ticket 1: Customer A pending ticket (for tracking and cancellation)
    const [t1Res] = await connection.query(`
      INSERT INTO service_requests (
        ticket_number, user_id, customer_name, email, mobile,
        device_category, brand, model_number, problem_type, service_type,
        status, repair_cost, payment_status, is_active
      ) VALUES (
        'TD-P5-TKT-01', ?, 'Robert Oppenheimer', 'robert.oppenheimer@example.com', '+919876543210',
        'Laptop', 'Dell', 'XPS 15', 'Screen Flickering', 'Carry In',
        'pending', 3500.00, 'unpaid', 1
      )
    `, [custAId]);
    const t1Id = t1Res.insertId;
    createdTicketIds.push(t1Id);

    // Ticket 2: Company A pending ticket
    const [t2Res] = await connection.query(`
      INSERT INTO service_requests (
        ticket_number, company_id, customer_name, email, mobile,
        device_category, brand, model_number, problem_type, service_type,
        status, repair_cost, payment_status, is_active
      ) VALUES (
        'TD-P5-TKT-02', ?, 'Corp Desk Employee', 'corp.desk@example.com', '+919876543211',
        'Workstation', 'HP', 'Z4 G4', 'Power Failure', 'On Site',
        'pending', 5000.00, 'unpaid', 1
      )
    `, [compAId]);
    const t2Id = t2Res.insertId;
    createdTicketIds.push(t2Id);

    // Ticket 3: Customer A ticket in 'in_progress' stage (cannot be cancelled)
    const [t3Res] = await connection.query(`
      INSERT INTO service_requests (
        ticket_number, user_id, customer_name, email, mobile,
        device_category, brand, model_number, problem_type, service_type,
        status, repair_cost, payment_status, is_active
      ) VALUES (
        'TD-P5-TKT-03', ?, 'Robert Oppenheimer', 'robert.oppenheimer@example.com', '+919876543210',
        'Laptop', 'Dell', 'XPS 15', 'Screen Replacement', 'Carry In',
        'in_progress', 4000.00, 'unpaid', 1
      )
    `, [custAId]);
    const t3Id = t3Res.insertId;
    createdTicketIds.push(t3Id);

    // Ticket 4: For admin cancellation
    const [t4Res] = await connection.query(`
      INSERT INTO service_requests (
        ticket_number, user_id, customer_name, email, mobile,
        device_category, brand, model_number, problem_type, service_type,
        status, repair_cost, payment_status, is_active
      ) VALUES (
        'TD-P5-TKT-04', ?, 'Sample Guest Client', 'guest@example.com', '+919876543212',
        'Tablet', 'Apple', 'iPad Air', 'Battery Drain', 'Carry In',
        'pending', 2500.00, 'unpaid', 1
      )
    `, [custAId]);
    const t4Id = t4Res.insertId;
    createdTicketIds.push(t4Id);

    console.log(`Fixtures initialized: Tickets [${createdTicketIds.join(', ')}]\n`);

    // ── SECTION 1: M-01 — Public Repair Tracking PII Exposure ────────
    console.log('--- Testing M-01: Public Repair Tracking PII Exposure & ID Enumeration ---');

    // 1.1 Public tracking by valid ticket_number succeeds
    const trackByTicketRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/repair-request/track/TD-P5-TKT-01',
      method: 'GET'
    });
    assert(
      'Public tracking by valid ticket_number returns 200 OK',
      trackByTicketRes.statusCode === 200 && trackByTicketRes.data.success === true
    );

    const trackingData = trackByTicketRes.data.data;

    // 1.2 Public tracking by sequential numeric database ID does not expose another ticket
    const trackByNumericIdRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/repair-request/track/${t1Id}`,
      method: 'GET'
    });
    assert(
      'Public tracking by sequential numeric DB ID fails with 404 (ID enumeration prevented)',
      trackByNumericIdRes.statusCode === 404 && trackByNumericIdRes.data.success === false
    );

    // 1.3 Invalid ticket_number safely fails with 404
    const trackInvalidRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/repair-request/track/NON_EXISTENT_99999',
      method: 'GET'
    });
    assert(
      'Invalid ticket_number safely returns 404 Not Found',
      trackInvalidRes.statusCode === 404 && trackInvalidRes.data.success === false
    );

    // 1.4 Public response does not expose raw email
    assert(
      'Public tracking response does NOT expose raw email address',
      trackingData.email === undefined || trackingData.email === null || !String(trackingData.email).includes('@')
    );

    // 1.5 Public response does not expose raw mobile/phone
    assert(
      'Public tracking response does NOT expose raw mobile/phone number',
      trackingData.mobile === undefined || trackingData.mobile === null || !String(trackingData.mobile).includes('9876543210')
    );

    // 1.6 Customer name is masked
    assert(
      'Customer name is appropriately masked in public tracking response',
      trackingData.customerName !== 'Robert Oppenheimer' && trackingData.customerName.includes('*')
    );

    // 1.7 Existing legitimate tracking information remains intact
    assert(
      'Legitimate tracking details (ticketNumber, brand, model, status, repairCost) remain intact',
      trackingData.ticketNumber === 'TD-P5-TKT-01' &&
      trackingData.brand === 'Dell' &&
      trackingData.modelNumber === 'XPS 15' &&
      trackingData.status === 'pending' &&
      trackingData.repairCost === 3500
    );


    // ── SECTION 2: M-02 — Company Ticket Cancellation Ownership ──────
    console.log('\n--- Testing M-02: Company Ticket Cancellation Ownership ---');

    // 2.1 Customer owning ticket can cancel
    const custCancelRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/repair-request/${t1Id}/cancel`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${custAToken}`,
        'Content-Type': 'application/json'
      }
    }, { reason: 'Found alternative solution' });
    assert(
      'Customer owning the ticket can cancel (200 OK)',
      custCancelRes.statusCode === 200 && custCancelRes.data.success === true
    );

    // Verify ticket status in DB is cancelled
    const [[t1After]] = await connection.query('SELECT status FROM service_requests WHERE id = ?', [t1Id]);
    assert(
      'Ticket status is transitioned to "cancelled" after customer cancellation',
      t1After.status === 'cancelled'
    );

    // 2.2 Unrelated customer is denied with 403 on another ticket
    const otherCustCancelRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/repair-request/${t2Id}/cancel`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${custBToken}`,
        'Content-Type': 'application/json'
      }
    }, { reason: 'Malicious attempt' });
    assert(
      'Unrelated customer cancelling someone else ticket is denied with 403 Forbidden',
      otherCustCancelRes.statusCode === 403 && otherCustCancelRes.data.success === false
    );

    // 2.3 Company owning ticket can cancel
    const compCancelRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/repair-request/${t2Id}/cancel`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${compAToken}`,
        'Content-Type': 'application/json'
      }
    }, { reason: 'Corporate branch order updated' });
    assert(
      'Company owning the corporate ticket can cancel (200 OK)',
      compCancelRes.statusCode === 200 && compCancelRes.data.success === true
    );

    // Verify corporate ticket in DB is cancelled
    const [[t2After]] = await connection.query('SELECT status FROM service_requests WHERE id = ?', [t2Id]);
    assert(
      'Corporate ticket status is transitioned to "cancelled" after company cancellation',
      t2After.status === 'cancelled'
    );

    // 2.4 Unrelated company is denied with 403
    // Create another pending ticket for Company A to test unrelated Company B rejection
    const [tCompA2Res] = await connection.query(`
      INSERT INTO service_requests (
        ticket_number, company_id, customer_name, email, mobile,
        device_category, brand, model_number, problem_type, service_type,
        status, repair_cost, payment_status, is_active
      ) VALUES (
        'TD-P5-TKT-05', ?, 'Corp Emp 2', 'corp2@example.com', '+919876543299',
        'Server', 'Dell', 'PowerEdge', 'RAID rebuild', 'On Site',
        'pending', 9000.00, 'unpaid', 1
      )
    `, [compAId]);
    const tCompA2Id = tCompA2Res.insertId;
    createdTicketIds.push(tCompA2Id);

    const otherCompCancelRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/repair-request/${tCompA2Id}/cancel`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${compBToken}`,
        'Content-Type': 'application/json'
      }
    }, { reason: 'Competitor attempt' });
    assert(
      'Unrelated company cancelling another company ticket is denied with 403 Forbidden',
      otherCompCancelRes.statusCode === 403 && otherCompCancelRes.data.success === false
    );

    // 2.5 Technician cannot cancel customer/company repair requests
    const techCancelRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/repair-request/${tCompA2Id}/cancel`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${techToken}`,
        'Content-Type': 'application/json'
      }
    }, { reason: 'Technician attempt' });
    assert(
      'Technician cancelling ticket is denied with 403 Forbidden',
      techCancelRes.statusCode === 403 && techCancelRes.data.success === false
    );

    // 2.6 Admin can cancel ticket according to existing rules
    const adminCancelRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/repair-request/${t4Id}/cancel`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    }, { reason: 'Admin override' });
    assert(
      'Admin cancelling ticket succeeds with 200 OK',
      adminCancelRes.statusCode === 200 && adminCancelRes.data.success === true
    );

    // 2.7 Cancellation status restriction enforced (cannot cancel in_progress)
    const inProgressCancelRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/repair-request/${t3Id}/cancel`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${custAToken}`,
        'Content-Type': 'application/json'
      }
    }, { reason: 'Want to cancel now' });
    assert(
      'Ticket in progress cannot be cancelled (400 Bad Request)',
      inProgressCancelRes.statusCode === 400 && inProgressCancelRes.data.success === false
    );


    // ── SECTION 3: L-02 — Public Draft Endpoint Rate Limiting ────────
    console.log('\n--- Testing L-02: Public Draft Endpoint Rate Limiting ---');

    // 3.1 Verify rateLimiter.middleware.js exports apiLimiter
    assert(
      'rateLimiter.middleware.js exports apiLimiter',
      typeof rateLimiter.apiLimiter === 'function'
    );

    // 3.2 Verify repair.routes.js imports apiLimiter and mounts it on draft endpoints
    const repairRoutesSrc = fs.readFileSync(path.resolve(__dirname, '../routes/repair.routes.js'), 'utf8');
    assert(
      'repair.routes.js imports apiLimiter from rateLimiter.middleware',
      repairRoutesSrc.includes("const { apiLimiter } = require('../middleware/rateLimiter.middleware');")
    );
    assert(
      'repair.routes.js mounts apiLimiter on POST /draft/:draftId',
      repairRoutesSrc.includes("router.post('/draft/:draftId', apiLimiter,")
    );
    assert(
      'repair.routes.js mounts apiLimiter on GET /draft/:draftId',
      repairRoutesSrc.includes("router.get('/draft/:draftId', apiLimiter,")
    );

    // 3.3 Verify existing apiLimiter reuses globalLimiter config (0 duplicate rate limiters created)
    assert(
      'apiLimiter strictly references existing globalLimiter instance without duplication',
      rateLimiter.apiLimiter === rateLimiter.globalLimiter
    );

    // 3.4 Verify legitimate draft save (POST) works
    const draftTestId = 'draft_phase5_test_9988';
    const draftPayload = { deviceCategory: 'Laptop', brand: 'Lenovo', problemType: 'Keyboard' };
    const draftSaveRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/repair-request/draft/${draftTestId}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, draftPayload);
    assert(
      'Legitimate draft save (POST /draft/:draftId) returns 200 OK',
      draftSaveRes.statusCode === 200 && draftSaveRes.data.success === true
    );

    // 3.5 Verify legitimate draft retrieval (GET) works
    const draftGetRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/repair-request/draft/${draftTestId}`,
      method: 'GET'
    });
    assert(
      'Legitimate draft retrieval (GET /draft/:draftId) returns 200 OK with persisted formData',
      draftGetRes.statusCode === 200 &&
      draftGetRes.data.success === true &&
      draftGetRes.data.data.brand === 'Lenovo'
    );

    // Clean up draft
    await connection.query('DELETE FROM repair_form_drafts WHERE draft_id = ?', [draftTestId]);


    // ── SECTION 4: L-01 — SMTP TLS Certificate Validation ────────────
    console.log('\n--- Testing L-01: SMTP TLS Certificate Validation ---');

    // 4.1 Production SMTP enforces TLS certificate validation (rejectUnauthorized: true)
    const origEnv = config.env;
    const origIsProd = config.isProduction;

    try {
      config.isProduction = true;
      delete process.env.SMTP_REJECT_UNAUTHORIZED;
      if (config.email) config.email.smtpRejectUnauthorized = null;

      const prodTlsExternal = resolveTlsConfig('smtp.sendgrid.net');
      assert(
        'Production external SMTP enforces strict TLS certificate validation (rejectUnauthorized: true)',
        prodTlsExternal.rejectUnauthorized === true
      );

      const prodTlsGmail = resolveTlsConfig('smtp.gmail.com');
      assert(
        'Production Gmail SMTP enforces strict TLS certificate validation (rejectUnauthorized: true)',
        prodTlsGmail.rejectUnauthorized === true
      );
    } finally {
      config.isProduction = origIsProd;
      config.env = origEnv;
    }

    // 4.2 Non-production local SMTP allows compatible validation (rejectUnauthorized: false)
    try {
      config.isProduction = false;
      config.env = 'development';
      delete process.env.SMTP_REJECT_UNAUTHORIZED;
      if (config.email) config.email.smtpRejectUnauthorized = null;

      const devTlsLocal = resolveTlsConfig('localhost');
      assert(
        'Development localhost SMTP allows compatible validation (rejectUnauthorized: false)',
        devTlsLocal.rejectUnauthorized === false
      );

      const devTls127 = resolveTlsConfig('127.0.0.1');
      assert(
        'Development 127.0.0.1 SMTP allows compatible validation (rejectUnauthorized: false)',
        devTls127.rejectUnauthorized === false
      );
    } finally {
      config.isProduction = origIsProd;
      config.env = origEnv;
    }

    // 4.3 Explicit configuration override is honored
    process.env.SMTP_REJECT_UNAUTHORIZED = 'true';
    const explicitTrue = resolveTlsConfig('localhost');
    assert(
      'Explicit SMTP_REJECT_UNAUTHORIZED=true override is strictly honored',
      explicitTrue.rejectUnauthorized === true
    );

    process.env.SMTP_REJECT_UNAUTHORIZED = 'false';
    const explicitFalse = resolveTlsConfig('smtp.external.com');
    assert(
      'Explicit SMTP_REJECT_UNAUTHORIZED=false override is strictly honored',
      explicitFalse.rejectUnauthorized === false
    );
    delete process.env.SMTP_REJECT_UNAUTHORIZED;

    // 4.4 getEmailConfig loads successfully without throwing
    const emailConfig = await getEmailConfig();
    assert(
      'getEmailConfig resolves valid configuration structure',
      emailConfig && typeof emailConfig === 'object' && 'source' in emailConfig
    );

    // 4.5 Error message redaction is preserved
    const sanitized = sanitizeErrorMessage('SMTP error: password=secretpass123 for user john@example.com');
    assert(
      'Email error message sanitizer preserves password redaction',
      !sanitized.includes('secretpass123') && sanitized.includes('password=[REDACTED]')
    );

  } catch (err) {
    console.error('Test execution failed with error:', err);
    failed++;
  } finally {
    // ── TEARDOWN: Clean up test fixtures ──────────────────────
    console.log('\n--- Cleaning up test fixtures ---');
    if (connection) {
      if (createdTicketIds.length > 0) {
        await connection.query('DELETE FROM service_requests WHERE id IN (?)', [createdTicketIds]);
      }
      if (createdUserIds.length > 0) {
        await connection.query('DELETE FROM notifications WHERE user_id IN (?) OR sender_id IN (?)', [createdUserIds, createdUserIds]);
        await connection.query('DELETE FROM activity_logs WHERE user_id IN (?)', [createdUserIds]);
        await connection.query('DELETE FROM users WHERE id IN (?)', [createdUserIds]);
      }
      connection.release();
      console.log('Cleanup completed successfully.');
    }
  }

  console.log('\n====================================================');
  console.log(`PHASE 5 VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
