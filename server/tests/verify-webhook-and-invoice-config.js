/**
 * Test Suite: verify-webhook-and-invoice-config.js
 * 
 * Verifies:
 * 1. Admin Invoicing Settings persistence (prefix, default_gst_rate, invoice_gst_enabled, invoice_terms)
 * 2. Prefix validation and dynamic prefix resolution in generateInvoiceId()
 * 3. Razorpay Webhook HMAC-SHA256 signature verification & fail-closed protection
 * 4. Internal 'webhook_verified' sentinel authorization security (403 when forged directly)
 * 5. Webhook payment settlement and payload persistence
 * 6. Webhook replay idempotency (safe duplicate webhook handling)
 * 7. Webhook amount mismatch rejection (tamper resistance)
 * 8. Standalone invoice settlement idempotency
 */

const crypto = require('crypto');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const billingController = require('../controllers/billing.controller');
const adminController = require('../controllers/admin.controller');
const { generateInvoiceId } = require('../utils/helpers');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedTests++;
  }
}

function createMockReqRes(user, body = {}, headers = {}, params = {}, query = {}) {
  const req = {
    user,
    body,
    headers,
    params,
    query,
    ip: '127.0.0.1'
  };
  const res = {
    statusCode: 200,
    data: null,
    locals: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    }
  };
  return { req, res };
}

async function runTests() {
  console.log('====================================================');
  console.log('TEST SUITE: Razorpay Webhook & Admin Invoice Config');
  console.log('====================================================\n');

  const webhookSecret = config.razorpay?.webhookSecret || 'jWZshoQa5lRZXKZFUAaJOqMAmUi+b75RsDEgvx36MaA';
  let testUserId = null;
  let testAdminUser = null;
  let testInvoice1Id = null;
  let testInvoice2Id = null;
  let testInvoice3Id = null;

  try {
    // 0. Setup test users
    const [custRes] = await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES ('Webhook Test Cust', 'webhook_cust_${Date.now()}@tekdoctor.test', 'hash', 'customer', 1)`
    );
    testUserId = custRes.insertId;
    testAdminUser = { id: 1, role: 'admin', email: 'admin@tekdoctor.in' };

    // -------------------------------------------------------------------------
    // TEST GROUP 1: Admin Invoicing Settings & Dynamic Prefix Generation
    // -------------------------------------------------------------------------
    console.log('[Test Group 1] Admin Invoicing Configuration & Dynamic Prefix');

    // 1a. Validate prefix input constraints (reject special characters)
    const { req: invalidReq, res: invalidRes } = createMockReqRes(
      testAdminUser,
      { settings: { invoice_prefix: 'INV#@!INVALID' } }
    );
    await adminController.updateSettings(invalidReq, invalidRes, () => {});
    assert(invalidRes.statusCode === 400, 'Rejects invalid invoice prefix containing special characters');

    // 1b. Update valid settings
    const { req: validReq, res: validRes } = createMockReqRes(
      testAdminUser,
      {
        settings: {
          invoice_prefix: 'TD-BILL',
          default_gst_rate: '12.00',
          invoice_gst_enabled: 'true'
        }
      }
    );
    await adminController.updateSettings(validReq, validRes, () => {});
    assert(validRes.statusCode === 200, 'Admin can successfully update invoice prefix and billing settings');

    // 1c. Verify generateInvoiceId dynamically uses the configured prefix
    const generatedId = await generateInvoiceId();
    assert(generatedId.startsWith('TD-BILL-'), `generateInvoiceId produced dynamic prefix: ${generatedId}`);

    // Restore prefix to 'inv' for system consistency
    const { req: restoreReq, res: restoreRes } = createMockReqRes(
      testAdminUser,
      { settings: { invoice_prefix: 'inv', default_gst_rate: '18.00' } }
    );
    await adminController.updateSettings(restoreReq, restoreRes, () => {});
    assert(restoreRes.statusCode === 200, 'Restored invoice prefix to default "inv"');

    // -------------------------------------------------------------------------
    // TEST GROUP 2: Razorpay Webhook HMAC Signature & Anti-Forgery Protection
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 2] Razorpay Webhook HMAC-SHA256 Signature Verification');

    // 2a. Reject request with invalid signature
    const samplePayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_bogus_01',
            order_id: 'order_test_bogus_01',
            amount: 100000,
            status: 'captured'
          }
        }
      }
    };
    const { req: badSigReq, res: badSigRes } = createMockReqRes(
      null,
      Buffer.from(JSON.stringify(samplePayload)),
      { 'x-razorpay-signature': 'invalid_forged_hmac_signature' }
    );
    await billingController.handleRazorpayWebhook(badSigReq, badSigRes, () => {});
    assert(badSigRes.statusCode === 400, 'Rejects webhook with forged/invalid HMAC signature');

    // 2b. Block direct bypass attempt on verifyPayment - client HMAC verification strictly required
    const { req: bypassReq, res: bypassRes } = createMockReqRes(
      { id: testUserId, role: 'customer' },
      {
        razorpay_order_id: 'order_bypass_01',
        razorpay_payment_id: 'pay_bypass_01',
        razorpay_signature: 'webhook_verified'
      }
    );
    await billingController.verifyPayment(bypassReq, bypassRes, () => {});
    assert(bypassRes.statusCode === 400, 'Direct call attempting "webhook_verified" fails client HMAC and is rejected with 400');

    // -------------------------------------------------------------------------
    // TEST GROUP 3: Valid Webhook Settlement & Order Association
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 3] Webhook Settlement with Authoritative Order Association');

    testInvoice1Id = `inv-test-hook-${Date.now()}`;
    const testOrderId1 = `order_hook_${Date.now()}`;
    const testPaymentId1 = `pay_hook_${Date.now()}`;
    const invoiceAmount = 1500.00;
    const amountInPaise = 150000;

    // Create a finalized invoice in the database
    await pool.query(
      `INSERT INTO invoices (id, user_id, client_name, amount, subtotal, tax_amount, currency, invoice_date, due_date, status, notes)
       VALUES (?, ?, 'Hook Customer', ?, ?, 0.00, 'INR', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY), 'Final', 'Webhook Test')`,
      [testInvoice1Id, testUserId, invoiceAmount, invoiceAmount]
    );
    await pool.query(
      `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total, tax_rate, tax_amount)
       VALUES (?, 'Webhook Service Item', 1, ?, ?, 0.00, 0.00)`,
      [testInvoice1Id, invoiceAmount, invoiceAmount]
    );

    // Create an associated pending payment record for this invoice
    await pool.query(
      `INSERT INTO payments (user_id, invoice_id, amount, currency, status, order_id, payment_method)
       VALUES (?, ?, ?, 'INR', 'pending', ?, 'card')`,
      [testUserId, testInvoice1Id, invoiceAmount, testOrderId1]
    );

    // Construct valid Razorpay payment.captured event
    const validWebhookEvent = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: testPaymentId1,
            order_id: testOrderId1,
            amount: amountInPaise,
            currency: 'INR',
            status: 'captured',
            method: 'upi',
            bank: null,
            wallet: null,
            vpa: 'customer@okaxis'
          }
        }
      }
    };
    const rawPayloadBuffer = Buffer.from(JSON.stringify(validWebhookEvent));
    const validHmac = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawPayloadBuffer)
      .digest('hex');

    const { req: hookReq, res: hookRes } = createMockReqRes(
      null,
      rawPayloadBuffer,
      { 'x-razorpay-signature': validHmac }
    );
    await billingController.handleRazorpayWebhook(hookReq, hookRes, () => {});
    assert(hookRes.statusCode === 200, 'Valid webhook processed successfully (HTTP 200)');

    // Verify database state: invoice is Paid, payment is paid
    const [inv1Rows] = await pool.query('SELECT status FROM invoices WHERE id = ?', [testInvoice1Id]);
    assert(inv1Rows[0]?.status === 'Paid', `Invoice status transitioned to Paid (actual: ${inv1Rows[0]?.status})`);

    const [pmt1Rows] = await pool.query('SELECT status, payment_id, gateway_response FROM payments WHERE order_id = ?', [testOrderId1]);
    assert(pmt1Rows[0]?.status === 'paid', `Payment status transitioned to paid (actual: ${pmt1Rows[0]?.status})`);
    assert(pmt1Rows[0]?.payment_id === testPaymentId1, `Payment record associated with gateway payment_id`);
    assert(pmt1Rows[0]?.gateway_response !== null, 'Rich gateway_response JSON persisted');

    // -------------------------------------------------------------------------
    // TEST GROUP 4: Webhook Replay Idempotency
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 4] Webhook Replay Idempotency');

    // Replay the exact same webhook event
    const { req: replayReq, res: replayRes } = createMockReqRes(
      null,
      rawPayloadBuffer,
      { 'x-razorpay-signature': validHmac }
    );
    await billingController.handleRazorpayWebhook(replayReq, replayRes, () => {});
    assert(replayRes.statusCode === 200, 'Replayed webhook returns 200 without error');

    // Verify no duplicate payment records were created
    const [allPmtsForInv1] = await pool.query('SELECT COUNT(*) as count FROM payments WHERE invoice_id = ?', [testInvoice1Id]);
    assert(allPmtsForInv1[0]?.count === 1, `Exactly 1 payment record exists for invoice (actual: ${allPmtsForInv1[0]?.count})`);

    // -------------------------------------------------------------------------
    // TEST GROUP 5: Webhook Amount Mismatch Rejection (Tamper Resistance)
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 5] Webhook Amount Mismatch Rejection');

    testInvoice2Id = `inv-test-tamper-${Date.now()}`;
    const testOrderId2 = `order_tamper_${Date.now()}`;
    const testPaymentId2 = `pay_tamper_${Date.now()}`;
    const fullAmount = 5000.00; // ₹5,000

    await pool.query(
      `INSERT INTO invoices (id, user_id, client_name, amount, subtotal, tax_amount, currency, invoice_date, due_date, status, notes)
       VALUES (?, ?, 'Tamper Test', ?, ?, 0.00, 'INR', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY), 'Final', 'Tamper Test')`,
      [testInvoice2Id, testUserId, fullAmount, fullAmount]
    );

    await pool.query(
      `INSERT INTO payments (user_id, invoice_id, amount, currency, status, order_id, payment_method)
       VALUES (?, ?, ?, 'INR', 'pending', ?, 'card')`,
      [testUserId, testInvoice2Id, fullAmount, testOrderId2]
    );

    // Webhook reports captured amount of only 1000 paise (₹10 instead of ₹5,000)
    const tamperedWebhookEvent = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: testPaymentId2,
            order_id: testOrderId2,
            amount: 1000, // ₹10 tampered
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    };
    const tamperBuffer = Buffer.from(JSON.stringify(tamperedWebhookEvent));
    const tamperHmac = crypto
      .createHmac('sha256', webhookSecret)
      .update(tamperBuffer)
      .digest('hex');

    const { req: tamperReq, res: tamperRes } = createMockReqRes(
      null,
      tamperBuffer,
      { 'x-razorpay-signature': tamperHmac }
    );
    await billingController.handleRazorpayWebhook(tamperReq, tamperRes, () => {});
    assert(tamperRes.statusCode === 400, 'Rejects webhook when captured amount mismatches invoice order total');

    const [inv2Rows] = await pool.query('SELECT status FROM invoices WHERE id = ?', [testInvoice2Id]);
    assert(inv2Rows[0]?.status === 'Final', `Tampered invoice remains unpaid/Final (actual: ${inv2Rows[0]?.status})`);

    // -------------------------------------------------------------------------
    // TEST GROUP 6: Standalone Invoice Settlement Idempotency
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 6] Standalone Invoice Settlement Idempotency');

    testInvoice3Id = `inv-test-settled-${Date.now()}`;
    await pool.query(
      `INSERT INTO invoices (id, user_id, client_name, amount, subtotal, tax_amount, currency, invoice_date, due_date, status, notes)
       VALUES (?, ?, 'Settled Customer', 800.00, 800.00, 0.00, 'INR', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY), 'Paid', 'Settled')`,
      [testInvoice3Id, testUserId]
    );

    const settledResult = await billingController.processAuthoritativePaymentSettlement({
      orderId: 'order_already_settled',
      paymentId: 'pay_already_settled',
      invoiceId: testInvoice3Id,
      user: { id: testUserId, role: 'customer' }
    });
    assert(settledResult.statusCode === 200, 'Settling already-settled invoice returns 200 idempotently');
    assert(settledResult.alreadySettled === true, 'Returns clean alreadySettled flag without duplicate mutations');

    console.log('\n====================================================');
    console.log(`SUMMARY: ${passedTests} passed, ${failedTests} failed`);
    console.log('====================================================');

    if (failedTests > 0) {
      throw new Error(`${failedTests} tests failed.`);
    }

  } finally {
    console.log('\nCleaning up test artifacts...');
    const invoicesToDelete = [testInvoice1Id, testInvoice2Id, testInvoice3Id].filter(Boolean);
    if (invoicesToDelete.length > 0) {
      await pool.query('DELETE FROM invoice_line_items WHERE invoice_id IN (?)', [invoicesToDelete]);
      await pool.query('DELETE FROM payments WHERE invoice_id IN (?)', [invoicesToDelete]);
      await pool.query('DELETE FROM invoices WHERE id IN (?)', [invoicesToDelete]);
    }
    if (testUserId) {
      await pool.query('DELETE FROM notifications WHERE user_id = ?', [testUserId]);
      await pool.query('DELETE FROM users WHERE id = ?', [testUserId]);
    }
    await pool.end();
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
