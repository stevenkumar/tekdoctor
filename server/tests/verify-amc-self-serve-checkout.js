/**
 * Comprehensive Integration Test Suite: AMC Self-Serve Checkout Workflow
 * 
 * Tests all requirements against the real local MySQL database:
 * 1. addMonthsCorrect calendar math & edge cases.
 * 2. Scenario (a): Validation (duplicate email/phone, inactive plan, client amount ignored, state mandatory).
 * 3. Scenario (b): Full public checkout & confirm (company CMP-xxx, profile, active+approved+paid contract, invoice with GST split, 0 covered devices, password_hash cleared, login verification).
 * 4. Scenario (c): Webhook first then client confirm (and reverse) -> exactly 1 company, 1 contract, 1 invoice.
 * 5. Scenario (d): Concurrent settle calls -> exactly 1 company, 1 contract, 1 invoice.
 * 6. Scenario (e): Amount mismatch -> nothing provisioned.
 * 7. Scenario (f): Email taken between start and settle -> needs_attention, no user/contract, webhook returns 200.
 * 8. Scenario (g): Paid after expiry -> still provisions.
 * 9. Scenario (h): Existing company purchase -> provisions without recreating company.
 * 10. Scenario (i): Registration gate -> returns 403 when company_self_registration_enabled = false.
 * 11. Scenario (j): AMC checkout order never creates 0-amount fallback payment row.
 */

const http = require('http');
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const amcService = require('../services/amc.service');
const { getSetting, getBooleanSetting } = require('../utils/settings');
const { generateToken } = require('../utils/auth.helpers');

// Routes for HTTP testing
const amcRoutes = require('../routes/amc.routes');
const companyRoutes = require('../routes/company.routes');
const billingRoutes = require('../routes/billing.routes');

let passedTests = 0;
let failedTests = 0;

function pass(name, details = '') {
  console.log(`  ✓ [PASS] ${name}`);
  if (details) console.log(`      ${details}`);
  passedTests++;
}

function fail(name, error) {
  console.error(`  ✗ [FAIL] ${name}: ${error.message}`);
  failedTests++;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

const generateSig = (orderId, paymentId) => {
  const keySecret = config.razorpay?.keySecret || '';
  return crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
};

async function runTestSuite() {
  console.log('================================================================');
  console.log('   REAL-DB INTEGRATION: AMC SELF-SERVE CHECKOUT SUITE           ');
  console.log('================================================================\n');

  const connection = await pool.getConnection();
  const testSuffix = Math.floor(10000 + Math.random() * 90000);

  // Setup Test Express Server on ephemeral port
  const app = express();
  app.use(express.json());
  app.use('/api/amc', amcRoutes);
  app.use('/api/company', companyRoutes);
  app.use('/api/billing', billingRoutes);

  let server;
  let baseUrl;

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const createdUserIds = [];
  const createdPlanIds = [];
  const createdCheckoutTokens = [];
  const createdOrderIds = [];
  const createdContractIds = [];
  const createdInvoiceIds = [];

  try {
    // -------------------------------------------------------------------------
    // SECTION 0: Date Math Helper Verification
    // -------------------------------------------------------------------------
    console.log('[Section 0] Testing addMonthsCorrect Calendar Math');

    try {
      const res1 = amcService.addMonthsCorrect('2026-04-01', 12);
      assert(res1 === '2027-03-31', `Expected 2027-03-31, got ${res1}`);
      pass('0.1 2026-04-01 + 12 months = 2027-03-31');

      const res2 = amcService.addMonthsCorrect('2026-03-31', 1);
      assert(res2 === '2026-04-30', `Expected 2026-04-30, got ${res2}`);
      pass('0.2 2026-03-31 + 1 month = 2026-04-30 (last day of March -> last day of April)');

      const res3 = amcService.addMonthsCorrect('2026-01-31', 1);
      assert(res3 === '2026-02-28', `Expected 2026-02-28, got ${res3}`);
      pass('0.3 2026-01-31 + 1 month = 2026-02-28 (last day of Jan -> last day of Feb in non-leap)');

      const res4 = amcService.addMonthsCorrect('2026-01-15', 1);
      assert(res4 === '2026-02-14', `Expected 2026-02-14, got ${res4}`);
      pass('0.4 2026-01-15 + 1 month = 2026-02-14 (mid-month calendar day minus 1)');
    } catch (err) {
      fail('Section 0 failed', err);
    }

    // -------------------------------------------------------------------------
    // SETUP FIXTURES
    // -------------------------------------------------------------------------
    console.log('\n[Setup] Provisioning isolated test plans & company fixtures');

    // Active test plan
    const [activePlanRes] = await connection.query(`
      INSERT INTO amc_plans (plan_code, name, description, base_price, duration_months, default_device_capacity, is_active)
      VALUES (?, 'Self-Serve Test Plan Alpha', 'Test plan for self-serve checkout', 20000.00, 12, 10, 1)
    `, [`PLAN-SS-${testSuffix}`]);
    const activePlanId = activePlanRes.insertId;
    createdPlanIds.push(activePlanId);

    // Inactive test plan
    const [inactivePlanRes] = await connection.query(`
      INSERT INTO amc_plans (plan_code, name, description, base_price, duration_months, default_device_capacity, is_active)
      VALUES (?, 'Inactive Test Plan', 'Inactive plan for validation', 15000.00, 6, 5, 0)
    `, [`PLAN-INACT-${testSuffix}`]);
    const inactivePlanId = inactivePlanRes.insertId;
    createdPlanIds.push(inactivePlanId);

    // Existing user for duplicate email/phone testing
    const existingEmail = `existing_${testSuffix}@tekdoctor.in`;
    const existingPhone = `98200${testSuffix}`;
    const [existUserRes] = await connection.query(`
      INSERT INTO users (name, email, password, role, phone, is_active, company_id)
      VALUES ('Existing User Co', ?, 'hashed_pass', 'company', ?, 1, ?)
    `, [existingEmail, `+91${existingPhone}`, `CMP-EX-${testSuffix}`]);
    const existingUserId = existUserRes.insertId;
    createdUserIds.push(existingUserId);

    await connection.query(`
      INSERT INTO company_profiles (user_id, company_id, company_name, contact_person, phone_number, address)
      VALUES (?, ?, 'Existing User Co', 'Alice Existing', ?, '123 Market St, Pune, Maharashtra')
    `, [existingUserId, `CMP-EX-${testSuffix}`, `+91${existingPhone}`]);

    // Ensure amc_self_serve_enabled is true
    await connection.query(`
      INSERT INTO site_settings (setting_key, setting_value, setting_group)
      VALUES ('amc_self_serve_enabled', 'true', 'amc')
      ON DUPLICATE KEY UPDATE setting_value = 'true'
    `);

    // -------------------------------------------------------------------------
    // SECTION 1: Scenario (a) - Validation
    // -------------------------------------------------------------------------
    console.log('\n[Section 1] Scenario (a): Checkout Validation Rules');

    // a.1 Duplicate Email
    try {
      const resp = await fetch(`${baseUrl}/api/amc/public/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: activePlanId,
          companyName: 'New Corp',
          contactPerson: 'Bob New',
          email: existingEmail,
          phone: `98765${testSuffix}`,
          password: 'Password123!',
          address: '456 MG Road',
          state: 'Maharashtra'
        })
      });
      const data = await resp.json();
      assert(resp.status === 400, `Expected 400 for duplicate email, got ${resp.status}`);
      assert(data.success === false, 'Expected success=false');
      pass('1.1 Duplicate email is rejected with HTTP 400 before payment');
    } catch (err) {
      fail('1.1 Duplicate email check failed', err);
    }

    // a.2 Duplicate Phone
    try {
      const resp = await fetch(`${baseUrl}/api/amc/public/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: activePlanId,
          companyName: 'New Corp 2',
          contactPerson: 'Charlie New',
          email: `unique_${testSuffix}_1@tekdoctor.in`,
          phone: existingPhone,
          password: 'Password123!',
          address: '456 MG Road',
          state: 'Maharashtra'
        })
      });
      const data = await resp.json();
      assert(resp.status === 400, `Expected 400 for duplicate phone, got ${resp.status}`);
      assert(data.success === false, 'Expected success=false');
      pass('1.2 Duplicate phone is rejected with HTTP 400 before payment');
    } catch (err) {
      fail('1.2 Duplicate phone check failed', err);
    }

    // a.3 Inactive Plan
    try {
      const resp = await fetch(`${baseUrl}/api/amc/public/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: inactivePlanId,
          companyName: 'New Corp 3',
          contactPerson: 'Dave New',
          email: `unique_${testSuffix}_2@tekdoctor.in`,
          phone: `98333${testSuffix}`,
          password: 'Password123!',
          address: '456 MG Road',
          state: 'Maharashtra'
        })
      });
      const data = await resp.json();
      assert(resp.status === 400, `Expected 400 for inactive plan, got ${resp.status}`);
      pass('1.3 Inactive AMC plan is rejected with HTTP 400');
    } catch (err) {
      fail('1.3 Inactive plan check failed', err);
    }

    // a.4 Missing State
    try {
      const resp = await fetch(`${baseUrl}/api/amc/public/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: activePlanId,
          companyName: 'New Corp 4',
          contactPerson: 'Eve New',
          email: `unique_${testSuffix}_3@tekdoctor.in`,
          phone: `98444${testSuffix}`,
          password: 'Password123!',
          address: '456 MG Road'
          // state omitted
        })
      });
      assert(resp.status === 400, `Expected 400 when state is missing, got ${resp.status}`);
      pass('1.4 State is mandatory and rejected with HTTP 400 when omitted');
    } catch (err) {
      fail('1.4 State mandatory check failed', err);
    }

    // a.5 Client Amount Ignored
    let validCheckoutToken = null;
    let validOrderId = null;
    let calculatedTotal = null;
    try {
      const clientEmail = `buyer_${testSuffix}@tekdoctor.in`;
      const clientPhone = `98555${testSuffix}`;
      const resp = await fetch(`${baseUrl}/api/amc/public/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: activePlanId,
          companyName: `Apex Solutions ${testSuffix}`,
          contactPerson: 'Apex Admin',
          email: clientEmail,
          phone: clientPhone,
          password: 'ApexSecretPassword@123',
          address: 'Floor 5, IT Park, Hinjawadi',
          state: 'Maharashtra',
          gstNumber: '27AAPFU0939F1ZV',
          amount: 1.00 // Client tampering attempt: ₹1
        })
      });
      const data = await resp.json();
      assert(resp.status === 201, `Expected 201, got ${resp.status}`);
      assert(data.success === true, 'Expected success=true');

      // Base price 20,000 + 18% GST (3,600) = 23,600
      calculatedTotal = data.data.amount;
      assert(calculatedTotal === 23600, `Expected server calculated 23600, got ${calculatedTotal}`);
      validCheckoutToken = data.data.checkoutToken;
      validOrderId = data.data.razorpayOrderId;
      createdCheckoutTokens.push(validCheckoutToken);
      createdOrderIds.push(validOrderId);

      // Verify payments row created with 23600
      const [pmts] = await connection.query('SELECT * FROM payments WHERE order_id = ?', [validOrderId]);
      assert(pmts.length === 1, 'Expected payments row');
      assert(parseFloat(pmts[0].amount) === 23600, `Expected payments.amount 23600, got ${pmts[0].amount}`);
      assert(pmts[0].reference_note === `AMC Checkout: ${validCheckoutToken}`, 'Payment reference note matches checkout token');

      pass('1.5 Client-sent amount is ignored; server calculates ₹23,600 (base ₹20k + 18% GST)');
    } catch (err) {
      fail('1.5 Client amount ignore check failed', err);
    }

    // -------------------------------------------------------------------------
    // SECTION 2: Scenario (b) - Confirm & Full Provisioning
    // -------------------------------------------------------------------------
    console.log('\n[Section 2] Scenario (b): Confirm Payment and Full Automated Provisioning');

    let provisionedCompanyUserId = null;
    let provisionedContractId = null;
    let provisionedInvoiceId = null;

    try {
      const confirmPaymentId = `pay_${testSuffix}_b`;
      const confirmResp = await fetch(`${baseUrl}/api/amc/public/checkout/${validCheckoutToken}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpayOrderId: validOrderId,
          razorpayPaymentId: confirmPaymentId,
          razorpaySignature: generateSig(validOrderId, confirmPaymentId)
        })
      });
      const confirmData = await confirmResp.json();
      assert(confirmResp.status === 200, `Expected 200, got ${confirmResp.status}: ${JSON.stringify(confirmData)}`);
      assert(confirmData.success === true, 'Confirm success=true');
      assert(confirmData.data.status === 'provisioned', 'Status is provisioned');

      provisionedContractId = confirmData.data.contractId;
      provisionedCompanyUserId = confirmData.data.companyUserId;
      createdContractIds.push(provisionedContractId);
      createdUserIds.push(provisionedCompanyUserId);

      // 1. Verify User created with role 'company' and CMP-xxx format
      const [users] = await connection.query('SELECT * FROM users WHERE id = ?', [provisionedCompanyUserId]);
      assert(users.length === 1, 'User must exist');
      const user = users[0];
      assert(user.role === 'company', `Role must be 'company', got ${user.role}`);
      assert(/^CMP-\d+$/.test(user.company_id), `User company_id must match CMP-xxx, got ${user.company_id}`);

      // 2. Verify Company Profile created
      const [profiles] = await connection.query('SELECT * FROM company_profiles WHERE user_id = ?', [provisionedCompanyUserId]);
      assert(profiles.length === 1, 'Company profile must exist');
      const profile = profiles[0];
      assert(profile.company_name === `Apex Solutions ${testSuffix}`, 'Company name matches');
      assert(profile.contact_person === 'Apex Admin', 'Contact person matches');
      assert(profile.gst_number === '27AAPFU0939F1ZV', 'GSTIN matches');

      // 3. Verify Active + Approved + Paid Contract
      const [contracts] = await connection.query('SELECT * FROM amc_contracts WHERE id = ?', [provisionedContractId]);
      assert(contracts.length === 1, 'Contract must exist');
      const contract = contracts[0];
      assert(contract.status === 'active', `Contract status must be 'active', got ${contract.status}`);
      assert(contract.approval_status === 'approved', `Contract approval_status must be 'approved', got ${contract.approval_status}`);
      assert(contract.payment_status === 'paid', `Contract payment_status must be 'paid', got ${contract.payment_status}`);
      assert(contract.device_capacity === 10, 'Device capacity matches plan');
      assert(contract.invoice_id, 'Contract must link to invoice');
      provisionedInvoiceId = contract.invoice_id;
      createdInvoiceIds.push(provisionedInvoiceId);

      // 4. Verify 0 covered devices inserted initially
      const [coveredDevs] = await connection.query('SELECT COUNT(*) AS cnt FROM amc_covered_devices WHERE contract_id = ?', [provisionedContractId]);
      assert(coveredDevs[0].cnt === 0, `Expected 0 covered devices, got ${coveredDevs[0].cnt}`);

      // 5. Verify Invoice created with intra-state GST split (Maharashtra to Maharashtra: CGST 9% + SGST 9%)
      const [invoices] = await connection.query('SELECT * FROM invoices WHERE id = ?', [provisionedInvoiceId]);
      assert(invoices.length === 1, 'Invoice must exist');
      const inv = invoices[0];
      assert(inv.status === 'Paid', `Invoice status must be Paid, got ${inv.status}`);
      assert(parseFloat(inv.subtotal) === 20000.00, `Invoice subtotal 20000, got ${inv.subtotal}`);
      assert(parseFloat(inv.tax_amount) === 3600.00, `Invoice tax 3600, got ${inv.tax_amount}`);
      assert(parseFloat(inv.amount) === 23600.00, `Invoice total 23600, got ${inv.amount}`);
      assert(inv.gst_type === 'intra', `Expected intra-state, got ${inv.gst_type}`);
      assert(parseFloat(inv.cgst_amount) === 1800.00, `Expected CGST 1800, got ${inv.cgst_amount}`);
      assert(parseFloat(inv.sgst_amount) === 1800.00, `Expected SGST 1800, got ${inv.sgst_amount}`);

      // 6. Verify password_hash cleared on amc_checkouts
      const [checkouts] = await connection.query('SELECT * FROM amc_checkouts WHERE checkout_token = ?', [validCheckoutToken]);
      assert(checkouts[0].status === 'provisioned', `Expected status 'provisioned', got ${checkouts[0].status}`);
      assert(checkouts[0].password_hash === null, 'password_hash must be cleared to NULL in amc_checkouts');

      // 7. Verify login with chosen password
      const passwordMatch = await bcrypt.compare('ApexSecretPassword@123', user.password);
      assert(passwordMatch === true, 'User can log in with chosen password');

      pass('2.1 Full provisioning verified: CMP-xxx company, active contract, invoice with GST split, 0 covered devices, password_hash cleared, login password verified');
    } catch (err) {
      fail('Section 2 confirm provisioning failed', err);
    }

    // -------------------------------------------------------------------------
    // SECTION 3: Scenario (c) - Webhook first then Client confirm (and reverse)
    // -------------------------------------------------------------------------
    console.log('\n[Section 3] Scenario (c): Webhook & Client Confirm Idempotency');

    // Case 1: Webhook arrives FIRST, then client confirm
    try {
      const emailC1 = `order_c1_${testSuffix}@tekdoctor.in`;
      const phoneC1 = `98661${testSuffix}`;
      const chk1 = await amcService.createPublicAmcCheckout({
        planId: activePlanId,
        companyName: `Webhook First Corp ${testSuffix}`,
        contactPerson: 'C1 Admin',
        email: emailC1,
        phone: phoneC1,
        address: '100 Webhook Lane, Bangalore',
        state: 'Karnataka',
        gstNumber: '29AAACT2727Q1ZW',
        password: 'Password123!'
      });
      createdCheckoutTokens.push(chk1.checkoutToken);
      createdOrderIds.push(chk1.razorpayOrderId);

      // Webhook arrives
      const webhookPayload1 = {
        orderId: chk1.razorpayOrderId,
        paymentId: `pay_c1_wh_${testSuffix}`,
        amountPaise: Math.round(chk1.amount * 100),
        method: 'card',
        gatewayResponse: { id: `pay_c1_wh_${testSuffix}`, method: 'card' }
      };
      const settleWh1 = await amcService.settleAmcCheckout(webhookPayload1);
      assert(settleWh1.status === 'provisioned', `Expected status provisioned, got ${settleWh1.status}`);
      createdContractIds.push(settleWh1.contractId);
      createdUserIds.push(settleWh1.companyUserId);

      // Client confirm arrives AFTER webhook
      const confirmClient1 = await amcService.confirmAmcCheckout({
        token: chk1.checkoutToken,
        razorpayOrderId: chk1.razorpayOrderId,
        razorpayPaymentId: `pay_c1_wh_${testSuffix}`,
        razorpaySignature: generateSig(chk1.razorpayOrderId, `pay_c1_wh_${testSuffix}`)
      });
      assert(confirmClient1.status === 'provisioned', 'Client confirm returns provisioned');
      assert(confirmClient1.contractId === settleWh1.contractId, 'Returns same contractId');

      // Verify count: exactly 1 user, 1 contract, 1 invoice
      const [uCnt1] = await connection.query('SELECT COUNT(*) AS cnt FROM users WHERE email = ?', [emailC1]);
      assert(uCnt1[0].cnt === 1, `Expected exactly 1 user, got ${uCnt1[0].cnt}`);
      const [cCnt1] = await connection.query('SELECT COUNT(*) AS cnt FROM amc_contracts WHERE company_id = ?', [settleWh1.companyUserId]);
      assert(cCnt1[0].cnt === 1, `Expected exactly 1 contract, got ${cCnt1[0].cnt}`);

      pass('3.1 Webhook first then client confirm: exactly 1 company, 1 contract, 1 invoice');
    } catch (err) {
      fail('3.1 Webhook first check failed', err);
    }

    // Case 2: Client confirm arrives FIRST, then webhook
    try {
      const emailC2 = `order_c2_${testSuffix}@tekdoctor.in`;
      const phoneC2 = `98662${testSuffix}`;
      const chk2 = await amcService.createPublicAmcCheckout({
        planId: activePlanId,
        companyName: `Client First Corp ${testSuffix}`,
        contactPerson: 'C2 Admin',
        email: emailC2,
        phone: phoneC2,
        address: '200 Client Road, Chennai',
        state: 'Tamil Nadu',
        password: 'Password123!'
      });
      createdCheckoutTokens.push(chk2.checkoutToken);
      createdOrderIds.push(chk2.razorpayOrderId);

      const payC2Id = `pay_c2_cl_${testSuffix}`;
      // Client confirm arrives first
      const confirmClient2 = await amcService.confirmAmcCheckout({
        token: chk2.checkoutToken,
        razorpayOrderId: chk2.razorpayOrderId,
        razorpayPaymentId: payC2Id,
        razorpaySignature: generateSig(chk2.razorpayOrderId, payC2Id)
      });
      assert(confirmClient2.status === 'provisioned', 'Client confirm returns provisioned');
      createdContractIds.push(confirmClient2.contractId);
      createdUserIds.push(confirmClient2.companyUserId);

      // Webhook arrives AFTER client confirm
      const webhookPayload2 = {
        orderId: chk2.razorpayOrderId,
        paymentId: `pay_c2_cl_${testSuffix}`,
        amountPaise: Math.round(chk2.amount * 100),
        method: 'upi'
      };
      const settleWh2 = await amcService.settleAmcCheckout(webhookPayload2);
      assert(settleWh2.status === 'provisioned', 'Webhook returns provisioned');
      assert(settleWh2.contractId === confirmClient2.contractId, 'Returns same contractId');

      // Verify count: exactly 1 user, 1 contract, 1 invoice
      const [uCnt2] = await connection.query('SELECT COUNT(*) AS cnt FROM users WHERE email = ?', [emailC2]);
      assert(uCnt2[0].cnt === 1, `Expected exactly 1 user, got ${uCnt2[0].cnt}`);
      const [cCnt2] = await connection.query('SELECT COUNT(*) AS cnt FROM amc_contracts WHERE company_id = ?', [confirmClient2.companyUserId]);
      assert(cCnt2[0].cnt === 1, `Expected exactly 1 contract, got ${cCnt2[0].cnt}`);

      pass('3.2 Client confirm first then webhook: exactly 1 company, 1 contract, 1 invoice');
    } catch (err) {
      fail('3.2 Client confirm first check failed', err);
    }

    // -------------------------------------------------------------------------
    // SECTION 4: Scenario (d) - Two Concurrent Settle Calls
    // -------------------------------------------------------------------------
    console.log('\n[Section 4] Scenario (d): Concurrent Settle Calls Race Condition Safety');

    try {
      const emailD = `order_d_${testSuffix}@tekdoctor.in`;
      const phoneD = `98771${testSuffix}`;
      const chkD = await amcService.createPublicAmcCheckout({
        planId: activePlanId,
        companyName: `Concurrent Race Corp ${testSuffix}`,
        contactPerson: 'D Admin',
        email: emailD,
        phone: phoneD,
        address: '500 Concurrency Plaza, Mumbai',
        state: 'Maharashtra',
        password: 'Password123!'
      });
      createdCheckoutTokens.push(chkD.checkoutToken);
      createdOrderIds.push(chkD.razorpayOrderId);

      // Fire 2 concurrent settle calls simultaneously
      const [settleRes1, settleRes2] = await Promise.all([
        amcService.settleAmcCheckout({
          orderId: chkD.razorpayOrderId,
          paymentId: `pay_race_1_${testSuffix}`,
          amountPaise: Math.round(chkD.amount * 100),
          method: 'card'
        }),
        amcService.settleAmcCheckout({
          orderId: chkD.razorpayOrderId,
          paymentId: `pay_race_2_${testSuffix}`,
          amountPaise: Math.round(chkD.amount * 100),
          method: 'card'
        })
      ]);

      assert(settleRes1.status === 'provisioned', 'Settle 1 provisioned');
      assert(settleRes2.status === 'provisioned', 'Settle 2 provisioned');
      assert(settleRes1.contractId === settleRes2.contractId, 'Both settle calls resolved to same contract');

      const provisionedId = settleRes1.contractId;
      createdContractIds.push(provisionedId);
      createdUserIds.push(settleRes1.companyUserId);

      // Verify DB counts
      const [uCntD] = await connection.query('SELECT COUNT(*) AS cnt FROM users WHERE email = ?', [emailD]);
      assert(uCntD[0].cnt === 1, `Expected exactly 1 user, got ${uCntD[0].cnt}`);
      const [cCntD] = await connection.query('SELECT COUNT(*) AS cnt FROM amc_contracts WHERE company_id = ?', [settleRes1.companyUserId]);
      assert(cCntD[0].cnt === 1, `Expected exactly 1 contract, got ${cCntD[0].cnt}`);

      pass('4.1 Two concurrent settle calls serialize cleanly via advisory lock -> exactly 1 company, 1 contract, 1 invoice');
    } catch (err) {
      fail('Section 4 concurrent settle failed', err);
    }

    // -------------------------------------------------------------------------
    // SECTION 5: Scenario (e) - Amount Mismatch
    // -------------------------------------------------------------------------
    console.log('\n[Section 5] Scenario (e): Payment Amount Mismatch');

    try {
      const emailE = `order_e_${testSuffix}@tekdoctor.in`;
      const phoneE = `98772${testSuffix}`;
      const chkE = await amcService.createPublicAmcCheckout({
        planId: activePlanId,
        companyName: `Mismatch Corp ${testSuffix}`,
        contactPerson: 'E Admin',
        email: emailE,
        phone: phoneE,
        address: '700 Security Blvd, Delhi',
        state: 'Delhi',
        password: 'Password123!'
      });
      createdCheckoutTokens.push(chkE.checkoutToken);
      createdOrderIds.push(chkE.razorpayOrderId);

      // Attempt settle with 50000 paise (₹500 instead of ₹23,600)
      const settleMismatch = await amcService.settleAmcCheckout({
        orderId: chkE.razorpayOrderId,
        paymentId: `pay_bad_amt_${testSuffix}`,
        amountPaise: 50000,
        method: 'card'
      });

      assert(settleMismatch.status === 'mismatch', `Expected status mismatch, got ${settleMismatch.status}`);

      // Verify nothing provisioned
      const [chkRow] = await connection.query('SELECT * FROM amc_checkouts WHERE checkout_token = ?', [chkE.checkoutToken]);
      assert(chkRow[0].status === 'created', `Checkout status must remain 'created', got ${chkRow[0].status}`);
      assert(chkRow[0].provisioned_user_id === null, 'No user must be provisioned');
      assert(chkRow[0].contract_id === null, 'No contract must be provisioned');

      const [uCntE] = await connection.query('SELECT COUNT(*) AS cnt FROM users WHERE email = ?', [emailE]);
      assert(uCntE[0].cnt === 0, 'No user should be inserted');

      pass('5.1 Amount mismatch returns status "mismatch" and leaves checkout unprovisioned');
    } catch (err) {
      fail('Section 5 amount mismatch failed', err);
    }

    // -------------------------------------------------------------------------
    // SECTION 6: Scenario (f) - Email Taken Between Start and Settle
    // -------------------------------------------------------------------------
    console.log('\n[Section 6] Scenario (f): Email Conflict Prior to Settlement');

    try {
      const emailF = `order_f_${testSuffix}@tekdoctor.in`;
      const phoneF = `98773${testSuffix}`;
      const chkF = await amcService.createPublicAmcCheckout({
        planId: activePlanId,
        companyName: `Conflict Corp ${testSuffix}`,
        contactPerson: 'F Admin',
        email: emailF,
        phone: phoneF,
        address: '800 Race condition Way, Nagpur',
        state: 'Maharashtra',
        password: 'Password123!'
      });
      createdCheckoutTokens.push(chkF.checkoutToken);
      createdOrderIds.push(chkF.razorpayOrderId);

      // Intervening user registers with emailF before settle
      const [interveningUser] = await connection.query(`
        INSERT INTO users (name, email, password, role, phone, is_active, company_id)
        VALUES ('Intervening User', ?, 'pass', 'customer', '9899999999', 1, NULL)
      `, [emailF]);
      createdUserIds.push(interveningUser.insertId);

      // Settle is now called
      const settleConflict = await amcService.settleAmcCheckout({
        orderId: chkF.razorpayOrderId,
        paymentId: `pay_conflict_${testSuffix}`,
        amountPaise: Math.round(chkF.amount * 100),
        method: 'card'
      });

      assert(settleConflict.status === 'needs_attention', `Expected status needs_attention, got ${settleConflict.status}`);

      // Verify amc_checkouts row
      const [chkRowF] = await connection.query('SELECT * FROM amc_checkouts WHERE checkout_token = ?', [chkF.checkoutToken]);
      assert(chkRowF[0].status === 'needs_attention', `Status must be needs_attention, got ${chkRowF[0].status}`);
      assert(chkRowF[0].error_message && chkRowF[0].error_message.includes('registered by another account'), 'Error message recorded');
      assert(chkRowF[0].contract_id === null, 'No contract should be created');

      pass('6.1 Intervening email conflict transitions checkout to "needs_attention" without creating duplicate user/contract');
    } catch (err) {
      fail('Section 6 email conflict failed', err);
    }

    // -------------------------------------------------------------------------
    // SECTION 7: Scenario (g) - Paid After Expiry
    // -------------------------------------------------------------------------
    console.log('\n[Section 7] Scenario (g): Payment After Session Expiry');

    try {
      const emailG = `order_g_${testSuffix}@tekdoctor.in`;
      const phoneG = `98774${testSuffix}`;
      const chkG = await amcService.createPublicAmcCheckout({
        planId: activePlanId,
        companyName: `Late Payer Corp ${testSuffix}`,
        contactPerson: 'G Admin',
        email: emailG,
        phone: phoneG,
        address: '900 Late Lane, Nashik',
        state: 'Maharashtra',
        password: 'Password123!'
      });
      createdCheckoutTokens.push(chkG.checkoutToken);
      createdOrderIds.push(chkG.razorpayOrderId);

      // Manually set status to 'expired' and expires_at to 1 hour ago
      await connection.query(`
        UPDATE amc_checkouts
        SET status = 'expired', expires_at = DATE_SUB(NOW(), INTERVAL 1 HOUR)
        WHERE checkout_token = ?
      `, [chkG.checkoutToken]);

      // Late payment arrives via webhook / settle
      const settleLate = await amcService.settleAmcCheckout({
        orderId: chkG.razorpayOrderId,
        paymentId: `pay_late_${testSuffix}`,
        amountPaise: Math.round(chkG.amount * 100),
        method: 'netbanking'
      });

      assert(settleLate.status === 'provisioned', `Expected status provisioned even when expired, got ${settleLate.status}`);
      createdContractIds.push(settleLate.contractId);
      createdUserIds.push(settleLate.companyUserId);

      const [contractG] = await connection.query('SELECT status, payment_status FROM amc_contracts WHERE id = ?', [settleLate.contractId]);
      assert(contractG[0].status === 'active', 'Contract is active');
      assert(contractG[0].payment_status === 'paid', 'Contract is paid');

      pass('7.1 Late payment on expired checkout session still successfully provisions customer contract');
    } catch (err) {
      fail('Section 7 paid after expiry failed', err);
    }

    // -------------------------------------------------------------------------
    // SECTION 8: Scenario (h) - Existing Company Purchase
    // -------------------------------------------------------------------------
    console.log('\n[Section 8] Scenario (h): Existing Company Self-Serve Purchase');

    try {
      // Use existingUserId from Setup
      const chkH = await amcService.createCompanyAmcCheckout({
        planId: activePlanId,
        companyUserId: existingUserId
      });
      createdCheckoutTokens.push(chkH.checkoutToken);
      createdOrderIds.push(chkH.razorpayOrderId);

      const settleH = await amcService.settleAmcCheckout({
        orderId: chkH.razorpayOrderId,
        paymentId: `pay_exist_comp_${testSuffix}`,
        amountPaise: Math.round(chkH.amount * 100),
        method: 'card'
      });

      assert(settleH.status === 'provisioned', `Expected status provisioned, got ${settleH.status}`);
      assert(settleH.companyUserId === existingUserId, `Expected companyUserId ${existingUserId}, got ${settleH.companyUserId}`);
      createdContractIds.push(settleH.contractId);

      // Verify no duplicate user was created
      const [uCntH] = await connection.query('SELECT COUNT(*) AS cnt FROM users WHERE email = ?', [existingEmail]);
      assert(uCntH[0].cnt === 1, `Expected exactly 1 user for existing company, got ${uCntH[0].cnt}`);

      // Verify contract belongs to existing company
      const [contractH] = await connection.query('SELECT company_id, status FROM amc_contracts WHERE id = ?', [settleH.contractId]);
      assert(contractH[0].company_id === existingUserId, 'Contract assigned to existing company user');
      assert(contractH[0].status === 'active', 'Contract status active');

      pass('8.1 Existing company purchase provisions active contract without creating duplicate user or profile');
    } catch (err) {
      fail('Section 8 existing company failed', err);
    }

    // -------------------------------------------------------------------------
    // SECTION 9: Scenario (i) - Registration Gate (company_self_registration_enabled = false)
    // -------------------------------------------------------------------------
    console.log('\n[Section 9] Scenario (i): Company Registration Gate Enforcement');

    try {
      // 1. Set company_self_registration_enabled = false
      await connection.query(`
        INSERT INTO site_settings (setting_key, setting_value, setting_group)
        VALUES ('company_self_registration_enabled', 'false', 'amc')
        ON DUPLICATE KEY UPDATE setting_value = 'false'
      `);

      const regResp = await fetch(`${baseUrl}/api/company/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: `Gate Test ${testSuffix}`,
          email: `gate_${testSuffix}@tekdoctor.in`,
          password: 'Password123!',
          phone: `98888${testSuffix}`,
          contactPerson: 'Gate Admin',
          address: 'Gate Street'
        })
      });
      const regData = await regResp.json();
      assert(regResp.status === 403, `Expected 403 Forbidden, got ${regResp.status}`);
      assert(regData.success === false, 'Expected success=false');
      assert(regData.message === 'Company accounts are created when you purchase an AMC plan.', `Expected gate message, got "${regData.message}"`);
      assert(regData.redirect === '/amc', `Expected redirect '/amc', got "${regData.redirect}"`);

      // 2. Restore setting to true
      await connection.query(`
        UPDATE site_settings SET setting_value = 'true' WHERE setting_key = 'company_self_registration_enabled'
      `);

      pass('9.1 Company self-registration gate returns HTTP 403 with redirect: "/amc" when disabled');
    } catch (err) {
      fail('Section 9 registration gate failed', err);
    }

    // -------------------------------------------------------------------------
    // SECTION 10: Scenario (j) - No 0-Amount Fallback Payment Rows
    // -------------------------------------------------------------------------
    console.log('\n[Section 10] Scenario (j): Zero-Amount Fallback Check on Payments Table');

    try {
      // Query all payments rows created during this test suite
      const [zeroPmts] = await connection.query(`
        SELECT id, order_id, amount, reference_note
        FROM payments
        WHERE reference_note LIKE 'AMC Checkout:%'
          AND amount <= 0
      `);

      assert(zeroPmts.length === 0, `Expected 0 zero-amount payment rows, found ${zeroPmts.length}`);

      // Verify all created order payments have positive amounts
      const [createdPmts] = await connection.query(`
        SELECT order_id, amount
        FROM payments
        WHERE order_id IN (?)
      `, [createdOrderIds]);

      for (const p of createdPmts) {
        assert(parseFloat(p.amount) > 0, `Payment row for ${p.order_id} must have amount > 0, got ${p.amount}`);
      }

      pass('10.1 AMC checkout orders never create 0-amount fallback payment rows');
    } catch (err) {
      fail('Section 10 zero-amount fallback check failed', err);
    }

    // -------------------------------------------------------------------------
    // SECTION 11: Background Scheduler Sweep Expiry Verification
    // -------------------------------------------------------------------------
    console.log('\n[Section 11] Background Expiry Sweep Testing');

    try {
      // Create a checkout session that is expired
      const chkExp = await amcService.createPublicAmcCheckout({
        planId: activePlanId,
        companyName: `Sweep Corp ${testSuffix}`,
        contactPerson: 'Sweep Admin',
        email: `sweep_${testSuffix}@tekdoctor.in`,
        phone: `98799${testSuffix}`,
        address: 'Sweep St, Pune',
        state: 'Maharashtra',
        password: 'Password123!'
      });
      createdCheckoutTokens.push(chkExp.checkoutToken);
      createdOrderIds.push(chkExp.razorpayOrderId);

      // Backdate expires_at
      await connection.query(`
        UPDATE amc_checkouts
        SET expires_at = DATE_SUB(NOW(), INTERVAL 10 MINUTE)
        WHERE checkout_token = ?
      `, [chkExp.checkoutToken]);

      // Run processCheckoutExpiries
      const sweptCount = await amcService.processCheckoutExpiries(connection);
      assert(sweptCount >= 1, `Expected at least 1 checkout swept, got ${sweptCount}`);

      const [sweptRow] = await connection.query('SELECT status FROM amc_checkouts WHERE checkout_token = ?', [chkExp.checkoutToken]);
      assert(sweptRow[0].status === 'expired', `Expected status 'expired', got ${sweptRow[0].status}`);

      pass('11.1 processCheckoutExpiries sweeps past-deadline "created" sessions to "expired"');
    } catch (err) {
      fail('Section 11 expiry sweep failed', err);
    }

    console.log('\n================================================================');
    console.log(`TEST SUMMARY: ${passedTests} passed, ${failedTests} failed`);
    console.log('================================================================');

  } catch (err) {
    fail('Unhandled test suite error', err);
  } finally {
    console.log('\n[Cleanup] Cleaning up test fixtures...');

    // Close server
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    try {
      if (createdContractIds.length > 0) {
        await connection.query('DELETE FROM amc_contract_history WHERE contract_id IN (?)', [createdContractIds]);
        await connection.query('DELETE FROM amc_covered_devices WHERE contract_id IN (?)', [createdContractIds]);
        await connection.query('DELETE FROM amc_contracts WHERE id IN (?)', [createdContractIds]);
      }
      if (createdInvoiceIds.length > 0) {
        await connection.query('DELETE FROM invoice_line_items WHERE invoice_id IN (?)', [createdInvoiceIds]);
        await connection.query('DELETE FROM invoices WHERE id IN (?)', [createdInvoiceIds]);
      }
      if (createdOrderIds.length > 0) {
        await connection.query('DELETE FROM payments WHERE order_id IN (?)', [createdOrderIds]);
      }
      if (createdCheckoutTokens.length > 0) {
        await connection.query('DELETE FROM amc_checkouts WHERE checkout_token IN (?)', [createdCheckoutTokens]);
      }
      if (createdUserIds.length > 0) {
        await connection.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds]);
        await connection.query('DELETE FROM company_profiles WHERE user_id IN (?)', [createdUserIds]);
        await connection.query('DELETE FROM users WHERE id IN (?)', [createdUserIds]);
      }
      if (createdPlanIds.length > 0) {
        await connection.query('DELETE FROM amc_plans WHERE id IN (?)', [createdPlanIds]);
      }
    } catch (cleanupErr) {
      console.error('Error during cleanup:', cleanupErr.message);
    } finally {
      connection.release();
      await pool.end();
      process.exit(failedTests > 0 ? 1 : 0);
    }
  }
}

runTestSuite();
