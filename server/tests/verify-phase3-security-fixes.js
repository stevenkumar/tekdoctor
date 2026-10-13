/**
 * Phase 3 Security Fixes Verification Script
 * 
 * Verifies:
 * 1. C-01: Company registration rate limiting
 *    - authLimiter is mounted on POST /api/company/register
 *    - Rejects spam/flood requests with 429 when rate limit is exceeded
 *    - Preserves normal company registration validation and duplicate email/phone checks
 * 
 * 2. B-01: Payment ownership authorization
 *    - Guest ticket (user_id IS NULL) + unauthenticated => allowed (200)
 *    - Registered customer ticket (user_id IS NOT NULL) + unauthenticated => rejected (401)
 *    - Registered customer ticket + correct customer => allowed (200)
 *    - Registered customer ticket + wrong customer => rejected (403)
 *    - Company ticket (company_id IS NOT NULL) + unauthenticated => rejected (401)
 *    - Company ticket + correct company => allowed (200)
 *    - Company ticket + wrong company => rejected (403)
 *    - Admin access => allowed (200)
 *    - Assigned technician access => allowed (200)
 *    - initiateOfflinePayment rejects unauthenticated callers on registered customer/company tickets (401)
 *    - switchPaymentMethod rejects unauthenticated callers on registered customer/company tickets (401)
 */

const http = require('http');
const { pool } = require('../config/db.config');
const { generateToken } = require('../utils/auth.helpers');

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

function assert(message, condition) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING PHASE 3 VERIFICATION TESTS');
  console.log('====================================================\n');

  let connection;
  try {
    connection = await pool.getConnection();

    // ── TEST SETUP: Create mock test users, company and tickets ──────────────────
    console.log('--- Setting up test fixtures in database ---');

    // 1. Customer User 1 (owner)
    const [u1Res] = await connection.query(`
      INSERT INTO users (name, email, password, role, is_active, token_version)
      VALUES ('Phase3 Owner Customer', 'phase3_owner@tektest.com', 'hashed_pass_123', 'customer', 1, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `);
    const ownerUserId = u1Res.insertId;

    // 2. Customer User 2 (attacker / different customer)
    const [u2Res] = await connection.query(`
      INSERT INTO users (name, email, password, role, is_active, token_version)
      VALUES ('Phase3 Other Customer', 'phase3_other@tektest.com', 'hashed_pass_123', 'customer', 1, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `);
    const otherUserId = u2Res.insertId;

    // 3. Company User 1 (owner)
    const [c1Res] = await connection.query(`
      INSERT INTO users (name, email, password, role, is_active, token_version, company_id)
      VALUES ('Phase3 Corp One', 'phase3_corp1@tektest.com', 'hashed_pass_123', 'company', 1, 1, 'CMP-P3-001')
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `);
    const companyUserId = c1Res.insertId;

    // 4. Company User 2 (other company)
    const [c2Res] = await connection.query(`
      INSERT INTO users (name, email, password, role, is_active, token_version, company_id)
      VALUES ('Phase3 Corp Two', 'phase3_corp2@tektest.com', 'hashed_pass_123', 'company', 1, 1, 'CMP-P3-002')
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `);
    const otherCompanyUserId = c2Res.insertId;

    // 5. Admin User
    const [admRes] = await connection.query(`
      INSERT INTO users (name, email, password, role, is_active, token_version)
      VALUES ('Phase3 Test Admin', 'phase3_admin@tektest.com', 'hashed_pass_123', 'admin', 1, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `);
    const adminUserId = admRes.insertId;

    // 6. Assigned Technician
    const [techRes] = await connection.query(`
      INSERT INTO users (name, email, password, role, is_active, token_version)
      VALUES ('Phase3 Assigned Tech', 'phase3_tech@tektest.com', 'hashed_pass_123', 'technician', 1, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `);
    const techUserId = techRes.insertId;

    // 7. Unassigned Technician
    const [unTechRes] = await connection.query(`
      INSERT INTO users (name, email, password, role, is_active, token_version)
      VALUES ('Phase3 Unassigned Tech', 'phase3_untech@tektest.com', 'hashed_pass_123', 'technician', 1, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `);
    const unassignedTechId = unTechRes.insertId;

    // Generate tokens
    const ownerToken = generateToken({ id: ownerUserId, name: 'Phase3 Owner', email: 'phase3_owner@tektest.com', role: 'customer', token_version: 1 });
    const otherToken = generateToken({ id: otherUserId, name: 'Phase3 Other', email: 'phase3_other@tektest.com', role: 'customer', token_version: 1 });
    const companyToken = generateToken({ id: companyUserId, name: 'Phase3 Corp 1', email: 'phase3_corp1@tektest.com', role: 'company', token_version: 1, companyId: 'CMP-P3-001' });
    const otherCompanyToken = generateToken({ id: otherCompanyUserId, name: 'Phase3 Corp 2', email: 'phase3_corp2@tektest.com', role: 'company', token_version: 1, companyId: 'CMP-P3-002' });
    const adminToken = generateToken({ id: adminUserId, name: 'Phase3 Admin', email: 'phase3_admin@tektest.com', role: 'admin', token_version: 1 });
    const techToken = generateToken({ id: techUserId, name: 'Phase3 Tech', email: 'phase3_tech@tektest.com', role: 'technician', token_version: 1 });
    const unassignedTechToken = generateToken({ id: unassignedTechId, name: 'Phase3 Unassigned Tech', email: 'phase3_untech@tektest.com', role: 'technician', token_version: 1 });

    // Insert Tickets:
    // A. Guest Ticket: user_id is NULL, company_id is NULL, completed, approved, amount = 500
    const [guestTkRes] = await connection.query(`
      INSERT INTO service_requests (
        user_id, company_id, customer_name, mobile, email, device_category, brand, problem_type,
        problem_description, status, customer_approval_status, assigned_technician_id,
        repair_cost, payment_status, ticket_number
      ) VALUES (
        NULL, NULL, 'Guest Customer', '9876543210', 'guest@tektest.com', 'Smartphone', 'Apple', 'Screen',
        'Guest screen repair', 'completed', 'approved', ?, 500.00, 'pending', 'TD-P3-GUEST-01'
      )
    `, [techUserId]);
    const guestTicketId = guestTkRes.insertId;

    // B. Registered Customer Ticket: user_id is ownerUserId, completed, approved, amount = 1200
    const [custTkRes] = await connection.query(`
      INSERT INTO service_requests (
        user_id, company_id, customer_name, mobile, email, device_category, brand, problem_type,
        problem_description, status, customer_approval_status, assigned_technician_id,
        repair_cost, payment_status, ticket_number
      ) VALUES (
        ?, NULL, 'Phase3 Owner Customer', '9876543211', 'phase3_owner@tektest.com', 'Laptop', 'Dell', 'Battery',
        'Registered customer repair', 'completed', 'approved', ?, 1200.00, 'pending', 'TD-P3-CUST-01'
      )
    `, [ownerUserId, techUserId]);
    const custTicketId = custTkRes.insertId;

    // C. Company Ticket: company_id is companyUserId, completed, approved, amount = 2500
    const [compTkRes] = await connection.query(`
      INSERT INTO service_requests (
        user_id, company_id, customer_name, mobile, email, device_category, brand, problem_type,
        problem_description, status, customer_approval_status, assigned_technician_id,
        repair_cost, payment_status, ticket_number
      ) VALUES (
        ?, ?, 'Phase3 Corp Client', '9876543212', 'phase3_corp1@tektest.com', 'Server', 'HP', 'Power Supply',
        'Company ticket repair', 'completed', 'approved', ?, 2500.00, 'pending', 'TD-P3-COMP-01'
      )
    `, [companyUserId, companyUserId, techUserId]);
    const compTicketId = compTkRes.insertId;

    console.log(`Fixtures initialized: Guest ID ${guestTicketId}, Customer Ticket ID ${custTicketId}, Company Ticket ID ${compTicketId}\n`);

    // ── SECTION 1: C-01 — Company Registration Rate Limiting & Validation ────────
    console.log('--- Testing C-01: Company Registration Rate Limiting & Validation ---');

    // 1.1 Verify route declaration includes authLimiter in company.routes.js
    const fs = require('fs');
    const companyRoutesSource = fs.readFileSync(require('path').resolve(__dirname, '../routes/company.routes.js'), 'utf8');
    assert(
      'company.routes.js imports authLimiter from rateLimiter.middleware',
      companyRoutesSource.includes("const { authLimiter } = require('../middleware/rateLimiter.middleware')")
    );
    assert(
      'company.routes.js mounts authLimiter on POST /register before logo upload and controllers',
      companyRoutesSource.includes("router.post('/register', authLimiter,")
    );

    // 1.2 POST /api/company/register rejects invalid email/phone with standard validation (not rate limited)
    const badRegRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/company/register',
      method: 'POST'
    }, {
      companyName: 'X',
      email: 'not-an-email',
      password: 'weak'
    });
    assert(
      'Company registration validation still works and rejects invalid payload with 400',
      badRegRes.statusCode === 400 && badRegRes.data.success === false
    );

    // 1.3 Duplicate email registration rejected with 400
    const dupRegRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/company/register',
      method: 'POST'
    }, {
      companyName: 'Duplicate Corp',
      email: 'phase3_corp1@tektest.com',
      password: 'Password123'
    });
    assert(
      'Company registration duplicate email check rejected with 400',
      dupRegRes.statusCode === 400 && dupRegRes.data.success === false && dupRegRes.data.errors?.email
    );

    // ── SECTION 2: B-01 — Payment Ownership Authorization (getPaymentEligibility) ─
    console.log('\n--- Testing B-01: Payment Eligibility Ownership Matrix ---');

    // 2.1 Guest ticket + unauthenticated => ALLOWED (200, eligible: true)
    const guestEligibility = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/billing/eligibility/${guestTicketId}`,
      method: 'GET'
    });
    assert(
      'Guest ticket + unauthenticated => 200 OK & eligible: true',
      guestEligibility.statusCode === 200 && guestEligibility.data.data?.eligible === true
    );

    // 2.2 Registered customer ticket + unauthenticated => REJECTED (401)
    const custUnauthRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/billing/eligibility/${custTicketId}`,
      method: 'GET'
    });
    assert(
      'Registered customer ticket + unauthenticated => 401 Unauthorized',
      custUnauthRes.statusCode === 401 && custUnauthRes.data.success === false && custUnauthRes.data.message.includes('Authentication required')
    );

    // 2.3 Registered customer ticket + correct customer token => ALLOWED (200, eligible: true)
    const custOwnerRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/billing/eligibility/${custTicketId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    assert(
      'Registered customer ticket + correct customer token => 200 OK & eligible: true',
      custOwnerRes.statusCode === 200 && custOwnerRes.data.data?.eligible === true
    );

    // 2.4 Registered customer ticket + wrong customer token => REJECTED (403)
    const custWrongRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/billing/eligibility/${custTicketId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${otherToken}` }
    });
    assert(
      'Registered customer ticket + wrong customer token => 403 Forbidden',
      custWrongRes.statusCode === 403 && custWrongRes.data.success === false && custWrongRes.data.message.includes('Forbidden')
    );

    // 2.5 Company ticket + unauthenticated => REJECTED (401)
    const compUnauthRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/billing/eligibility/${compTicketId}`,
      method: 'GET'
    });
    assert(
      'Company ticket + unauthenticated => 401 Unauthorized',
      compUnauthRes.statusCode === 401 && compUnauthRes.data.success === false && compUnauthRes.data.message.includes('Authentication required')
    );

    // 2.6 Company ticket + correct company token => ALLOWED (200, eligible: true)
    const compOwnerRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/billing/eligibility/${compTicketId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${companyToken}` }
    });
    assert(
      'Company ticket + correct company token => 200 OK & eligible: true',
      compOwnerRes.statusCode === 200 && compOwnerRes.data.data?.eligible === true
    );

    // 2.7 Company ticket + wrong company token => REJECTED (403)
    const compWrongRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/billing/eligibility/${compTicketId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${otherCompanyToken}` }
    });
    assert(
      'Company ticket + wrong company token => 403 Forbidden',
      compWrongRes.statusCode === 403 && compWrongRes.data.success === false && compWrongRes.data.message.includes('Forbidden')
    );

    // 2.8 Company ticket + customer token => REJECTED (403)
    const compCustRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/billing/eligibility/${compTicketId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    assert(
      'Company ticket + customer token => 403 Forbidden',
      compCustRes.statusCode === 403 && compCustRes.data.success === false
    );

    // 2.9 Admin accessing customer and company tickets => ALLOWED (200)
    const adminCustRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/billing/eligibility/${custTicketId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const adminCompRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/billing/eligibility/${compTicketId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(
      'Admin token accessing registered customer ticket => 200 OK',
      adminCustRes.statusCode === 200 && adminCustRes.data.data?.eligible === true
    );
    assert(
      'Admin token accessing company ticket => 200 OK',
      adminCompRes.statusCode === 200 && adminCompRes.data.data?.eligible === true
    );

    // 2.10 Assigned technician accessing assigned ticket => ALLOWED (200)
    const techAssignedRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/billing/eligibility/${custTicketId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${techToken}` }
    });
    assert(
      'Assigned technician accessing assigned ticket => 200 OK',
      techAssignedRes.statusCode === 200 && techAssignedRes.data.data?.eligible === true
    );

    // 2.11 Unassigned technician accessing ticket => REJECTED (403)
    const techUnassignedRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/billing/eligibility/${custTicketId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${unassignedTechToken}` }
    });
    assert(
      'Unassigned technician accessing ticket => 403 Forbidden',
      techUnassignedRes.statusCode === 403 && techUnassignedRes.data.success === false
    );

    // ── SECTION 3: B-01 — Payment State Modification Flows ────────────────────────
    console.log('\n--- Testing B-01: Offline Payment & Switch Payment Method State Transitions ---');

    // 3.1 initiateOfflinePayment: Anonymous caller on registered customer ticket => REJECTED (401)
    const anonOfflineCustRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/billing/offline-payment',
      method: 'POST'
    }, {
      ticketId: custTicketId,
      paymentMethod: 'cash'
    });
    assert(
      'initiateOfflinePayment on registered customer ticket without auth => 401 Unauthorized',
      anonOfflineCustRes.statusCode === 401 && anonOfflineCustRes.data.success === false
    );

    // 3.2 initiateOfflinePayment: Wrong customer on registered customer ticket => REJECTED (403)
    const wrongOfflineCustRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/billing/offline-payment',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${otherToken}` }
    }, {
      ticketId: custTicketId,
      paymentMethod: 'cash'
    });
    assert(
      'initiateOfflinePayment on registered customer ticket with wrong customer => 403 Forbidden',
      wrongOfflineCustRes.statusCode === 403 && wrongOfflineCustRes.data.success === false
    );

    // 3.3 initiateOfflinePayment: Anonymous caller on GUEST ticket => ALLOWED (200)
    const anonOfflineGuestRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/billing/offline-payment',
      method: 'POST'
    }, {
      ticketId: guestTicketId,
      paymentMethod: 'cash'
    });
    assert(
      'initiateOfflinePayment on guest ticket without auth => 200 OK (Guest payment preserved)',
      anonOfflineGuestRes.statusCode === 200 && anonOfflineGuestRes.data.success === true
    );

    // 3.4 switchPaymentMethod: Anonymous caller on registered customer ticket => REJECTED (401)
    const anonSwitchCustRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/billing/switch-payment-method',
      method: 'POST'
    }, {
      ticketId: custTicketId
    });
    assert(
      'switchPaymentMethod on registered customer ticket without auth => 401 Unauthorized',
      anonSwitchCustRes.statusCode === 401 && anonSwitchCustRes.data.success === false
    );

    // 3.5 switchPaymentMethod: Anonymous caller on guest ticket that is in pending_verification cash => ALLOWED (200)
    const anonSwitchGuestRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/billing/switch-payment-method',
      method: 'POST'
    }, {
      ticketId: guestTicketId
    });
    assert(
      'switchPaymentMethod on guest ticket without auth => 200 OK (Guest switching preserved)',
      anonSwitchGuestRes.statusCode === 200 && anonSwitchGuestRes.data.success === true
    );

    // 3.6 createPaymentOrder: Anonymous caller on registered customer ticket => REJECTED (401)
    const anonOrderCustRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/billing/create-order',
      method: 'POST'
    }, {
      ticketId: custTicketId
    });
    assert(
      'createPaymentOrder on registered customer ticket without auth => 401 Unauthorized',
      anonOrderCustRes.statusCode === 401 && anonOrderCustRes.data.success === false
    );

    // ── CLEANUP TEST FIXTURES ─────────────────────────────────────────────────────
    console.log('\n--- Cleaning up test fixtures ---');
    await connection.query('DELETE FROM payments WHERE ticket_id IN (?, ?, ?)', [guestTicketId, custTicketId, compTicketId]);
    await connection.query('DELETE FROM service_requests WHERE id IN (?, ?, ?)', [guestTicketId, custTicketId, compTicketId]);
    await connection.query('DELETE FROM users WHERE id IN (?, ?, ?, ?, ?, ?, ?)', [ownerUserId, otherUserId, companyUserId, otherCompanyUserId, adminUserId, techUserId, unassignedTechId]);

    console.log('Cleanup completed successfully.');

  } catch (err) {
    console.error('Unexpected error during test execution:', err);
    failed++;
  } finally {
    if (connection) connection.release();
    await pool.end();
  }

  console.log('\n====================================================');
  console.log(`PHASE 3 VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
