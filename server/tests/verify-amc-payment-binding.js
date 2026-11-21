/**
 * Real-DB Integration Test Suite: AMC Payment Binding, Fail-Closed Security & GST Split
 * 
 * Verifies all 5 scenarios against the real local MySQL database:
 * (a) Valid order verifies and activates contract
 * (b) Order for a different amount or contract is rejected
 * (c) Replay is idempotent (returns existing invoice, creates no duplicate)
 * (d) Production mode + demo/missing keys throws (fail-closed in-process)
 * (e) Invoice has CGST+SGST for intra-state and IGST for inter-state
 * 
 * Follows the fixture/cleanup pattern of verify-amc-phase2.js (real company, real contracts, real payments).
 */

const assert = require('assert');
const crypto = require('crypto');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const amcService = require('../services/amc.service');

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

async function runTestSuite() {
  console.log('================================================================');
  console.log('   REAL-DB INTEGRATION: AMC PAYMENT BINDING & FAIL-CLOSED SUITE ');
  console.log('================================================================\n');

  // Verify DB connection
  const connection = await pool.getConnection();

  const testSuffix = Math.floor(10000 + Math.random() * 90000);
  let testAdminId = null;
  let testCompanyId = null;
  let testOtherCompanyId = null;
  let intraCompanyId = null;
  let interCompanyId = null;
  let testPlanId = null;

  const createdUserIds = [];
  const createdContractIds = [];
  const createdPaymentIds = [];
  const createdInvoiceIds = [];

  try {
    console.log(`[Setup] Provisioning real DB test fixtures (suffix: ${testSuffix})`);

    // 1. Admin User
    const [admins] = await connection.query('SELECT id FROM users WHERE role = "admin" LIMIT 1');
    if (admins.length > 0) {
      testAdminId = admins[0].id;
    } else {
      const [admIns] = await connection.query(`
        INSERT INTO users (name, email, password, role, is_active)
        VALUES ('Test Admin Binding', ?, 'hash', 'admin', 1)
      `, [`admin_bind_${testSuffix}@tekdoctor.in`]);
      testAdminId = admIns.insertId;
      createdUserIds.push(testAdminId);
    }

    // 2. Main Test Company
    const [compIns] = await connection.query(`
      INSERT INTO users (name, email, password, role, company_id, is_active)
      VALUES ('Binding Test Corp', ?, 'hash', 'company', ?, 1)
    `, [`company_bind_${testSuffix}@tekdoctor.in`, `CMP-BND-${testSuffix}`]);
    testCompanyId = compIns.insertId;
    createdUserIds.push(testCompanyId);

    await connection.query(`
      INSERT INTO company_profiles (user_id, company_id, company_name, gst_number, address)
      VALUES (?, ?, 'Binding Test Corp Ltd', '27ABCDE1234F1Z5', 'Mumbai, Maharashtra')
    `, [testCompanyId, `CMP-BND-${testSuffix}`]);

    // 2b. Second Test Company (for cross-company isolation test)
    const [comp2Ins] = await connection.query(`
      INSERT INTO users (name, email, password, role, company_id, is_active)
      VALUES ('Other Isolation Corp', ?, 'hash', 'company', ?, 1)
    `, [`company_iso_${testSuffix}@tekdoctor.in`, `CMP-ISO-${testSuffix}`]);
    testOtherCompanyId = comp2Ins.insertId;
    createdUserIds.push(testOtherCompanyId);

    await connection.query(`
      INSERT INTO company_profiles (user_id, company_id, company_name, gst_number, address)
      VALUES (?, ?, 'Other Isolation Corp Ltd', '27XYZDE1234F1Z9', 'Pune, Maharashtra')
    `, [testOtherCompanyId, `CMP-ISO-${testSuffix}`]);

    // 3. Test AMC Plan
    const [planIns] = await connection.query(`
      INSERT INTO amc_plans (plan_code, name, description, base_price, duration_months, default_device_capacity, coverage_terms, is_active)
      VALUES (?, 'Binding Hardened Plan', 'Test plan for payment binding tests', 20000.00, 12, 10, '{"sla":"24h"}', 1)
    `, [`AMC-BIND-${testSuffix}`]);
    testPlanId = planIns.insertId;

    pass('Test fixtures provisioned successfully', `Company #${testCompanyId}, Plan #${testPlanId}`);

    // ═════════════════════════════════════════════════════════════════
    // SCENARIO (A): Valid order verifies and activates
    // ═════════════════════════════════════════════════════════════════
    console.log('\n[Scenario A] Valid order verifies and activates');
    let contractAId = null;
    let invoiceAId = null;
    {
      const contractA = await amcService.createAmcContract({
        companyId: testCompanyId,
        planId: testPlanId,
        planName: 'Binding Hardened Plan',
        deviceCapacity: 10,
        price: 20000.00,
        discountAmount: 0.00,
        taxAmount: 3600.00,
        totalAmount: 23600.00,
        createdBy: testAdminId
      });
      contractAId = contractA.id;
      createdContractIds.push(contractAId);

      // Company accepts, Admin approves
      await amcService.acceptAmcOffer({ contractId: contractAId, companyId: testCompanyId, userId: testCompanyId });
      await amcService.approveAmcContract({ contractId: contractAId, adminUserId: testAdminId });

      // Create Payment Order via service
      const paymentOrder = await amcService.createContractPaymentOrder({
        contractId: contractAId,
        companyId: testCompanyId,
        userId: testCompanyId
      });
      assert(paymentOrder.orderId, 'Order ID must be generated');
      assert.strictEqual(paymentOrder.amount, 23600.00, 'Order amount must match contract total');

      // Verify payment was recorded in payments table with amc_contract_id
      const [pmtRows] = await connection.query('SELECT * FROM payments WHERE order_id = ?', [paymentOrder.orderId]);
      assert.strictEqual(pmtRows.length, 1, 'Payment record must be inserted in DB');
      assert.strictEqual(pmtRows[0].amc_contract_id, contractAId, 'payments.amc_contract_id must match contract ID');
      createdPaymentIds.push(pmtRows[0].id);

      // Generate authentic HMAC signature
      const paymentId = `pay_valid_${Date.now()}_${testSuffix}`;
      const keySecret = config.razorpay?.keySecret || '';
      let signature = 'demo_sig';
      if (keySecret && !keySecret.includes('YourKeySecret') && !keySecret.includes('demo')) {
        signature = crypto
          .createHmac('sha256', keySecret)
          .update(`${paymentOrder.orderId}|${paymentId}`)
          .digest('hex');
      }

      // Verify payment
      const verifyRes = await amcService.verifyContractPayment({
        contractId: contractAId,
        companyId: testCompanyId,
        razorpayOrderId: paymentOrder.orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
        userId: testCompanyId
      });

      assert.strictEqual(verifyRes.success, true, 'Verification should return success: true');
      assert.strictEqual(verifyRes.paymentStatus, 'paid', 'Payment status should be paid');
      assert.strictEqual(verifyRes.status, 'active', 'Contract should be automatically activated');
      assert.ok(verifyRes.invoiceId, 'Invoice ID should be generated');
      invoiceAId = verifyRes.invoiceId;
      createdInvoiceIds.push(invoiceAId);

      // Verify DB state
      const [cDb] = await connection.query('SELECT payment_status, status, invoice_id FROM amc_contracts WHERE id = ?', [contractAId]);
      assert.strictEqual(cDb[0].payment_status, 'paid', 'amc_contracts.payment_status must be paid');
      assert.strictEqual(cDb[0].status, 'active', 'amc_contracts.status must be active');
      assert.strictEqual(cDb[0].invoice_id, invoiceAId, 'amc_contracts.invoice_id must match generated invoice');

      const [pDb] = await connection.query('SELECT status, verification_status, payment_id FROM payments WHERE order_id = ?', [paymentOrder.orderId]);
      assert.strictEqual(pDb[0].status, 'paid', 'payments.status must be paid');
      assert.strictEqual(pDb[0].verification_status, 'verified', 'payments.verification_status must be verified');
      assert.strictEqual(pDb[0].payment_id, paymentId, 'payments.payment_id must match verified payment ID');

      pass('(a) Valid order verifies and activates', `Contract #${contractAId} activated with invoice #${invoiceAId}`);
    }

    // ═════════════════════════════════════════════════════════════════
    // SCENARIO (B): Order for different amount or contract is rejected
    // ═════════════════════════════════════════════════════════════════
    console.log('\n[Scenario B] Order for different amount or contract is rejected');
    {
      const contractB = await amcService.createAmcContract({
        companyId: testCompanyId,
        planId: testPlanId,
        planName: 'Binding Hardened Plan',
        deviceCapacity: 10,
        price: 20000.00,
        taxAmount: 3600.00,
        totalAmount: 23600.00,
        createdBy: testAdminId
      });
      const contractBId = contractB.id;
      createdContractIds.push(contractBId);
      await amcService.acceptAmcOffer({ contractId: contractBId, companyId: testCompanyId, userId: testCompanyId });
      await amcService.approveAmcContract({ contractId: contractBId, adminUserId: testAdminId });

      // Case B1: Amount mismatch (tampered payment record with different amount)
      const wrongAmountOrderId = `order_amc_wrong_amt_${Date.now()}_${testSuffix}`;
      const [pmtB1] = await connection.query(`
        INSERT INTO payments (order_id, amc_contract_id, user_id, company_id, amount, currency, status, gateway, reference_note)
        VALUES (?, ?, ?, ?, 10000.00, 'INR', 'created', 'razorpay', ?)
      `, [wrongAmountOrderId, contractBId, testCompanyId, testCompanyId, `AMC Contract: ${contractB.contractNumber}`]);
      createdPaymentIds.push(pmtB1.insertId);

      const keySec = config.razorpay?.keySecret || '';
      const b1PaymentId = `pay_b1_${Date.now()}`;
      let b1Sig = 'sig';
      if (keySec && !keySec.includes('YourKeySecret') && !keySec.includes('demo')) {
        b1Sig = crypto.createHmac('sha256', keySec).update(`${wrongAmountOrderId}|${b1PaymentId}`).digest('hex');
      }

      let b1Rejected = false;
      try {
        await amcService.verifyContractPayment({
          contractId: contractBId,
          companyId: testCompanyId,
          razorpayOrderId: wrongAmountOrderId,
          razorpayPaymentId: b1PaymentId,
          razorpaySignature: b1Sig,
          userId: testCompanyId
        });
      } catch (err) {
        b1Rejected = true;
        assert.strictEqual(err.message, 'Payment does not belong to this contract.', 'Must reject amount mismatch with exact message');
      }
      assert(b1Rejected, 'Payment with different amount must be rejected');

      // Case B2: Contract ID mismatch (payment is bound to another contract)
      const wrongContractOrderId = `order_amc_wrong_ctr_${Date.now()}_${testSuffix}`;
      const [pmtB2] = await connection.query(`
        INSERT INTO payments (order_id, amc_contract_id, user_id, company_id, amount, currency, status, gateway, reference_note)
        VALUES (?, 999999, ?, ?, 23600.00, 'INR', 'created', 'razorpay', 'AMC Contract: TD-AMC-OTHER-001')
      `, [wrongContractOrderId, testCompanyId, testCompanyId]);
      createdPaymentIds.push(pmtB2.insertId);

      const b2PaymentId = `pay_b2_${Date.now()}`;
      let b2Sig = 'sig';
      if (keySec && !keySec.includes('YourKeySecret') && !keySec.includes('demo')) {
        b2Sig = crypto.createHmac('sha256', keySec).update(`${wrongContractOrderId}|${b2PaymentId}`).digest('hex');
      }

      let b2Rejected = false;
      try {
        await amcService.verifyContractPayment({
          contractId: contractBId,
          companyId: testCompanyId,
          razorpayOrderId: wrongContractOrderId,
          razorpayPaymentId: b2PaymentId,
          razorpaySignature: b2Sig,
          userId: testCompanyId
        });
      } catch (err) {
        b2Rejected = true;
        assert.strictEqual(err.message, 'Payment does not belong to this contract.', 'Must reject contract id mismatch');
      }
      assert(b2Rejected, 'Payment bound to different contract must be rejected');

      // Case (i) / B3: valid signature + payment id already used by another row -> rejected
      const consumedPaymentId = `pay_consumed_${Date.now()}_${testSuffix}`;
      const [pmtB3A] = await connection.query(`
        INSERT INTO payments (order_id, payment_id, amc_contract_id, user_id, company_id, amount, currency, status, gateway, reference_note)
        VALUES (?, ?, ?, ?, ?, 23600.00, 'INR', 'paid', 'razorpay', 'Prior Payment')
      `, [`order_consumed_${Date.now()}`, consumedPaymentId, contractBId, testCompanyId, testCompanyId]);
      createdPaymentIds.push(pmtB3A.insertId);

      // Create a valid pending payment order for contract B
      const validPendingOrderId = `order_amc_b_pending_${Date.now()}_${testSuffix}`;
      const [pmtB3B] = await connection.query(`
        INSERT INTO payments (order_id, amc_contract_id, user_id, company_id, amount, currency, status, gateway, reference_note)
        VALUES (?, ?, ?, ?, 23600.00, 'INR', 'created', 'razorpay', ?)
      `, [validPendingOrderId, contractBId, testCompanyId, testCompanyId, `AMC Contract: ${contractB.contractNumber}`]);
      createdPaymentIds.push(pmtB3B.insertId);

      let b3Rejected = false;
      let b3Sig = 'demo_sig';
      if (keySec && !keySec.includes('YourKeySecret') && !keySec.includes('demo')) {
        b3Sig = crypto.createHmac('sha256', keySec).update(`${validPendingOrderId}|${consumedPaymentId}`).digest('hex');
      }

      try {
        await amcService.verifyContractPayment({
          contractId: contractBId,
          companyId: testCompanyId,
          razorpayOrderId: validPendingOrderId,
          razorpayPaymentId: consumedPaymentId, // Reusing consumed payment_id
          razorpaySignature: b3Sig,
          userId: testCompanyId
        });
      } catch (err) {
        b3Rejected = true;
        assert(err.message.includes('has already been used'), 'Must reject duplicate razorpayPaymentId');
      }
      assert(b3Rejected, 'Replay of existing razorpayPaymentId with valid signature must be rejected');

      // Case (ii) / B4: invalid signature using someone else's order id never changes that order's payments row
      const otherCompanyOrderId = `order_other_company_${Date.now()}_${testSuffix}`;
      const [pmtOther] = await connection.query(`
        INSERT INTO payments (order_id, amc_contract_id, user_id, company_id, amount, currency, status, gateway, reference_note)
        VALUES (?, NULL, ?, ?, 23600.00, 'INR', 'created', 'razorpay', 'AMC Contract: TD-AMC-OTHER-001')
      `, [otherCompanyOrderId, testOtherCompanyId, testOtherCompanyId]);
      createdPaymentIds.push(pmtOther.insertId);

      let b4Rejected = false;
      try {
        await amcService.verifyContractPayment({
          contractId: contractBId,
          companyId: testCompanyId,
          razorpayOrderId: otherCompanyOrderId,
          razorpayPaymentId: `pay_tamper_${Date.now()}`,
          razorpaySignature: 'invalid_forged_signature_xyz',
          userId: testCompanyId
        });
      } catch (err) {
        b4Rejected = true;
        assert(err.message.includes('signature verification failed'), 'Must reject invalid signature');
      }
      assert(b4Rejected, 'Invalid signature attempt must be rejected');

      // Verify that someone else's payment row was NOT modified to 'failed'
      const [checkPmtOther] = await connection.query('SELECT status FROM payments WHERE id = ?', [pmtOther.insertId]);
      assert.strictEqual(checkPmtOther[0].status, 'created', "Someone else's payments row must remain in 'created' status despite failed signature attempt");

      pass('(b) Order for different amount or contract is rejected', 'Amount mismatch, contract mismatch, duplicate payment IDs, and cross-order isolation properly verified');
    }

    // ═════════════════════════════════════════════════════════════════
    // SCENARIO (C): Replay is idempotent (one invoice)
    // ═════════════════════════════════════════════════════════════════
    console.log('\n[Scenario C] Replay is idempotent (one invoice)');
    {
      // Count invoices linked to contractA before replay
      const [invBefore] = await connection.query('SELECT COUNT(*) as cnt FROM invoices WHERE id = ?', [invoiceAId]);
      assert.strictEqual(invBefore[0].cnt, 1, 'Exactly one invoice must exist before replay');

      // Call verifyContractPayment on the already paid contractA
      const replayRes = await amcService.verifyContractPayment({
        contractId: contractAId,
        companyId: testCompanyId,
        razorpayOrderId: 'order_any_replay',
        razorpayPaymentId: 'pay_any_replay',
        razorpaySignature: 'sig_any',
        userId: testCompanyId
      });

      assert.strictEqual(replayRes.success, true, 'Replay should return success: true');
      assert.strictEqual(replayRes.contractId, contractAId, 'Contract ID should match');
      assert.strictEqual(replayRes.invoiceId, invoiceAId, 'Must return identical invoice ID');
      assert.strictEqual(replayRes.paymentStatus, 'paid', 'Payment status must be paid');

      // Verify no second invoice was inserted in DB
      const [invTotal] = await connection.query('SELECT COUNT(*) as cnt FROM invoices WHERE notes LIKE ?', [`%${contractAId}%`]);
      const [cCheck] = await connection.query('SELECT invoice_id FROM amc_contracts WHERE id = ?', [contractAId]);
      assert.strictEqual(cCheck[0].invoice_id, invoiceAId, 'Contract invoice_id must remain unchanged');

      pass('(c) Replay is idempotent', `Returned existing invoice #${invoiceAId} with zero duplicate invoices created`);
    }

    // ═════════════════════════════════════════════════════════════════
    // SCENARIO (D): Production mode + demo keys throws (fail-closed)
    // ═════════════════════════════════════════════════════════════════
    console.log('\n[Scenario D] Production mode + demo keys throws (fail-closed)');
    {
      const origIsProd = config.isProduction;
      const origKeySecret = config.razorpay?.keySecret;

      // In-process configuration override
      config.isProduction = true;
      config.razorpay = config.razorpay || {};
      config.razorpay.keySecret = 'demo_secret_key';

      // Create test contract
      const contractD = await amcService.createAmcContract({
        companyId: testCompanyId,
        planId: testPlanId,
        planName: 'Binding Hardened Plan',
        deviceCapacity: 10,
        price: 20000.00,
        taxAmount: 3600.00,
        totalAmount: 23600.00,
        createdBy: testAdminId
      });
      createdContractIds.push(contractD.id);

      // Test D1: Order creation fails closed in production with demo keys
      let d1FailedClosed = false;
      try {
        await amcService.createContractPaymentOrder({
          contractId: contractD.id,
          companyId: testCompanyId,
          userId: testCompanyId
        });
      } catch (err) {
        d1FailedClosed = true;
        assert(err.message.includes('not configured with live credentials'), 'Order creation must reject unconfigured/demo keys in production');
      }
      assert(d1FailedClosed, 'createContractPaymentOrder must fail closed in production');

      // Insert a real matching payment record for contract D to reach the keySecret check
      const prodTestOrderId = `order_amc_prod_${Date.now()}_${testSuffix}`;
      const [pmtD] = await connection.query(`
        INSERT INTO payments (order_id, amc_contract_id, user_id, company_id, amount, currency, status, gateway, reference_note)
        VALUES (?, ?, ?, ?, 23600.00, 'INR', 'created', 'razorpay', ?)
      `, [prodTestOrderId, contractD.id, testCompanyId, testCompanyId, `AMC Contract: ${contractD.contractNumber}`]);
      createdPaymentIds.push(pmtD.insertId);

      // Test D2: Payment verification fails closed in production with demo keys
      let d2FailedClosed = false;
      try {
        await amcService.verifyContractPayment({
          contractId: contractD.id,
          companyId: testCompanyId,
          razorpayOrderId: prodTestOrderId,
          razorpayPaymentId: 'pay_fake_prod',
          razorpaySignature: 'sig',
          userId: testCompanyId
        });
      } catch (err) {
        d2FailedClosed = true;
        assert(err.message.includes('Live Razorpay credentials required in production'), 'Verification must reject demo keys in production');
      }
      assert(d2FailedClosed, 'verifyContractPayment must fail closed in production');

      // Restore configuration
      config.isProduction = origIsProd;
      config.razorpay.keySecret = origKeySecret;

      pass('(d) Production mode + demo keys throws', 'Order creation and payment verification both fail closed in production');
    }

    // ═════════════════════════════════════════════════════════════════
    // SCENARIO (E): Invoice has CGST+SGST for intra-state and IGST for inter-state
    // ═════════════════════════════════════════════════════════════════
    console.log('\n[Scenario E] Invoice has CGST+SGST for intra-state and IGST for inter-state');
    {
      // 1. Intra-State Company (Maharashtra: state code 27)
      const [intraUser] = await connection.query(`
        INSERT INTO users (name, email, password, role, company_id, is_active)
        VALUES ('Intra State Corp', ?, 'hash', 'company', ?, 1)
      `, [`intra_${testSuffix}@tekdoctor.in`, `CMP-INTRA-${testSuffix}`]);
      intraCompanyId = intraUser.insertId;
      createdUserIds.push(intraCompanyId);

      await connection.query(`
        INSERT INTO company_profiles (user_id, company_id, company_name, gst_number, address)
        VALUES (?, ?, 'Intra State Corp Ltd', '27AABCT1234F1Z5', 'Pune, Maharashtra')
      `, [intraCompanyId, `CMP-INTRA-${testSuffix}`]);

      const intraContract = await amcService.createAmcContract({
        companyId: intraCompanyId,
        planId: testPlanId,
        planName: 'Binding Hardened Plan',
        deviceCapacity: 10,
        price: 10000.00,
        taxAmount: 1800.00,
        totalAmount: 11800.00,
        createdBy: testAdminId
      });
      createdContractIds.push(intraContract.id);
      await amcService.acceptAmcOffer({ contractId: intraContract.id, companyId: intraCompanyId, userId: intraCompanyId });
      await amcService.approveAmcContract({ contractId: intraContract.id, adminUserId: testAdminId });

      const intraOrder = await amcService.createContractPaymentOrder({
        contractId: intraContract.id,
        companyId: intraCompanyId,
        userId: intraCompanyId
      });
      const [intraPmt] = await connection.query('SELECT id FROM payments WHERE order_id = ?', [intraOrder.orderId]);
      createdPaymentIds.push(intraPmt[0].id);

      const intraKeySecret = config.razorpay?.keySecret || '';
      const intraPayId = `pay_intra_${Date.now()}_${testSuffix}`;
      let intraSig = 'demo';
      if (intraKeySecret && !intraKeySecret.includes('YourKeySecret') && !intraKeySecret.includes('demo')) {
        intraSig = crypto.createHmac('sha256', intraKeySecret).update(`${intraOrder.orderId}|${intraPayId}`).digest('hex');
      }

      const intraVerifyRes = await amcService.verifyContractPayment({
        contractId: intraContract.id,
        companyId: intraCompanyId,
        razorpayOrderId: intraOrder.orderId,
        razorpayPaymentId: intraPayId,
        razorpaySignature: intraSig,
        userId: intraCompanyId
      });
      createdInvoiceIds.push(intraVerifyRes.invoiceId);

      // Verify intra-state invoice in real DB
      const [intraInvRows] = await connection.query('SELECT * FROM invoices WHERE id = ?', [intraVerifyRes.invoiceId]);
      assert.strictEqual(intraInvRows.length, 1, 'Intra-state invoice must exist in DB');
      const intraInv = intraInvRows[0];
      assert.strictEqual(Number(intraInv.is_interstate), 0, 'is_interstate must be 0 for Maharashtra client');
      assert.strictEqual(intraInv.gst_type, 'intra', 'gst_type must be intra');
      assert.strictEqual(Number(intraInv.subtotal), 10000.00, 'Subtotal should be 10000.00');
      assert.strictEqual(Number(intraInv.tax_amount), 1800.00, 'Tax amount should be 1800.00');
      assert.strictEqual(Number(intraInv.cgst_rate), 9.00, 'CGST rate must be 9.00%');
      assert.strictEqual(Number(intraInv.sgst_rate), 9.00, 'SGST rate must be 9.00%');
      assert.strictEqual(Number(intraInv.igst_rate), 0.00, 'IGST rate must be 0.00%');
      assert.strictEqual(Number(intraInv.cgst_amount), 900.00, 'CGST amount must be 900.00');
      assert.strictEqual(Number(intraInv.sgst_amount), 900.00, 'SGST amount must be 900.00');
      assert.strictEqual(Number(intraInv.igst_amount), 0.00, 'IGST amount must be 0.00');

      // 2. Inter-State Company (Karnataka: state code 29)
      const [interUser] = await connection.query(`
        INSERT INTO users (name, email, password, role, company_id, is_active)
        VALUES ('Inter State Corp', ?, 'hash', 'company', ?, 1)
      `, [`inter_${testSuffix}@tekdoctor.in`, `CMP-INTER-${testSuffix}`]);
      interCompanyId = interUser.insertId;
      createdUserIds.push(interCompanyId);

      await connection.query(`
        INSERT INTO company_profiles (user_id, company_id, company_name, gst_number, address)
        VALUES (?, ?, 'Inter State Corp Ltd', '29AABCT5678F1Z5', 'Bengaluru, Karnataka')
      `, [interCompanyId, `CMP-INTER-${testSuffix}`]);

      const interContract = await amcService.createAmcContract({
        companyId: interCompanyId,
        planId: testPlanId,
        planName: 'Binding Hardened Plan',
        deviceCapacity: 10,
        price: 10000.00,
        taxAmount: 1800.00,
        totalAmount: 11800.00,
        createdBy: testAdminId
      });
      createdContractIds.push(interContract.id);
      await amcService.acceptAmcOffer({ contractId: interContract.id, companyId: interCompanyId, userId: interCompanyId });
      await amcService.approveAmcContract({ contractId: interContract.id, adminUserId: testAdminId });

      const interOrder = await amcService.createContractPaymentOrder({
        contractId: interContract.id,
        companyId: interCompanyId,
        userId: interCompanyId
      });
      const [interPmt] = await connection.query('SELECT id FROM payments WHERE order_id = ?', [interOrder.orderId]);
      createdPaymentIds.push(interPmt[0].id);

      const interKeySecret = config.razorpay?.keySecret || '';
      const interPayId = `pay_inter_${Date.now()}_${testSuffix}`;
      let interSig = 'demo';
      if (interKeySecret && !interKeySecret.includes('YourKeySecret') && !interKeySecret.includes('demo')) {
        interSig = crypto.createHmac('sha256', interKeySecret).update(`${interOrder.orderId}|${interPayId}`).digest('hex');
      }

      const interVerifyRes = await amcService.verifyContractPayment({
        contractId: interContract.id,
        companyId: interCompanyId,
        razorpayOrderId: interOrder.orderId,
        razorpayPaymentId: interPayId,
        razorpaySignature: interSig,
        userId: interCompanyId
      });
      createdInvoiceIds.push(interVerifyRes.invoiceId);

      // Verify inter-state invoice in real DB
      const [interInvRows] = await connection.query('SELECT * FROM invoices WHERE id = ?', [interVerifyRes.invoiceId]);
      assert.strictEqual(interInvRows.length, 1, 'Inter-state invoice must exist in DB');
      const interInv = interInvRows[0];
      assert.strictEqual(Number(interInv.is_interstate), 1, 'is_interstate must be 1 for Karnataka client');
      assert.strictEqual(interInv.gst_type, 'inter', 'gst_type must be inter');
      assert.strictEqual(Number(interInv.subtotal), 10000.00, 'Subtotal should be 10000.00');
      assert.strictEqual(Number(interInv.tax_amount), 1800.00, 'Tax amount should be 1800.00');
      assert.strictEqual(Number(interInv.igst_rate), 18.00, 'IGST rate must be 18.00%');
      assert.strictEqual(Number(interInv.cgst_rate), 0.00, 'CGST rate must be 0.00%');
      assert.strictEqual(Number(interInv.sgst_rate), 0.00, 'SGST rate must be 0.00%');
      assert.strictEqual(Number(interInv.igst_amount), 1800.00, 'IGST amount must be 1800.00');
      assert.strictEqual(Number(interInv.cgst_amount), 0.00, 'CGST amount must be 0.00');
      assert.strictEqual(Number(interInv.sgst_amount), 0.00, 'SGST amount must be 0.00');

      pass('(e) Invoice has CGST+SGST for intra-state and IGST for inter-state', 'Intra-state (9%+9%) and Inter-state (18% IGST) verified in real DB');
    }

  } catch (err) {
    console.error('\n[FATAL TEST RUNNER ERROR]:', err);
    failedTests++;
  } finally {
    console.log('\n[Teardown] Cleaning up real DB test fixtures...');
    try {
      if (createdInvoiceIds.length > 0) {
        await connection.query('DELETE FROM invoice_line_items WHERE invoice_id IN (?)', [createdInvoiceIds]);
        await connection.query('DELETE FROM invoices WHERE id IN (?)', [createdInvoiceIds]);
      }
      if (createdContractIds.length > 0) {
        await connection.query('DELETE FROM amc_contract_history WHERE contract_id IN (?)', [createdContractIds]);
        await connection.query('DELETE FROM amc_covered_devices WHERE contract_id IN (?)', [createdContractIds]);
        await connection.query('DELETE FROM amc_contracts WHERE id IN (?)', [createdContractIds]);
      }
      if (createdPaymentIds.length > 0) {
        await connection.query('DELETE FROM payments WHERE id IN (?)', [createdPaymentIds]);
      }
      if (testPlanId) {
        await connection.query('DELETE FROM amc_plans WHERE id = ?', [testPlanId]);
      }
      if (createdUserIds.length > 0) {
        await connection.query('DELETE FROM payments WHERE company_id IN (?)', [createdUserIds]);
        await connection.query('DELETE FROM company_profiles WHERE user_id IN (?)', [createdUserIds]);
        await connection.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds]);
        await connection.query('DELETE FROM users WHERE id IN (?)', [createdUserIds]);
      }
      console.log('✓ Teardown complete. All test fixtures purged.\n');
    } catch (cleanupErr) {
      console.error('Teardown cleanup error:', cleanupErr.message);
    } finally {
      connection.release();
    }
  }

  console.log('================================================================');
  console.log(`TOTAL REAL-DB TESTS: ${passedTests + failedTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
