/**
 * Test Suite: verify-post-audit-billing-fixes.js
 *
 * Verifies the complete billing, invoice rendering, additional charges,
 * and cash collection lifecycle fixes:
 *  1. Additional charges line itemization, subtotal, and GST calculation.
 *  2. Stage A: Estimate approved, invoice absent -> cash collection rejected (409), no payment records created.
 *  3. Stage B: Repair completed, Draft invoice -> cash collection rejected (409), draft invoices remain non-payable.
 *  4. Stage C: Commercial invoice finalization by Admin establishes authoritative payable total.
 *  5. Stage D: Assigned Technician and Admin can record cash collection on Final invoice (200),
 *     creating pending-verification payment without marking invoice or ticket Paid.
 *  6. Stage D: Unauthorized or unassigned Technician blocked (403), duplicate collection rejected (400).
 *  7. Stage E: Successful Admin verification settles payment, invoice, and ticket to Paid.
 *  8. Stage E: Rejected cash collection preserves invoice's Final status (does not revert to Draft or mark Paid).
 *  9. Corporate (Company) invoice access isolation across different companies.
 */

const { pool } = require('../config/db.config');
const repairController = require('../controllers/repair.controller');
const billingController = require('../controllers/billing.controller');
const authHelpers = require('../utils/auth.helpers');

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

// Mock Express req/res
function createMockReqRes(user, body = {}, params = {}, query = {}) {
  const req = {
    user,
    body,
    params,
    query,
    headers: {},
    ip: '127.0.0.1'
  };
  const res = {
    statusCode: 200,
    data: null,
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
  console.log('TEST SUITE: Post-Audit Billing, Invoices & Cash Flows');
  console.log('====================================================\n');

  let testUserId = null;
  let testCompanyAUser = null;
  let testCompanyBUser = null;
  let testTech1 = null;
  let testTech2 = null;
  let testAdmin = null;
  let ticket1Id = null;
  let ticket2Id = null;
  let ticket3Id = null;
  let ticketCompanyAId = null;
  let ticketCompanyBId = null;
  let invoice1Id = null;
  let invoice3Id = null;

  try {
    // 0. Setup test users
    const [custRes] = await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES ('Audit Test Cust', 'audit_cust_${Date.now()}@tekdoctor.test', 'hash', 'customer', 1)`
    );
    testUserId = custRes.insertId;

    const [compARes] = await pool.query(
      `INSERT INTO users (name, email, password, role, is_active, company_id)
       VALUES ('Audit Corp A', 'corp_a_${Date.now()}@tekdoctor.test', 'hash', 'company', 1, 999901)`
    );
    testCompanyAUser = { id: compARes.insertId, email: 'corp_a@tekdoctor.test', role: 'company', companyId: 999901 };

    const [compBRes] = await pool.query(
      `INSERT INTO users (name, email, password, role, is_active, company_id)
       VALUES ('Audit Corp B', 'corp_b_${Date.now()}@tekdoctor.test', 'hash', 'company', 1, 999902)`
    );
    testCompanyBUser = { id: compBRes.insertId, email: 'corp_b@tekdoctor.test', role: 'company', companyId: 999902 };

    const [t1Res] = await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES ('Audit Tech 1', 'tech1_${Date.now()}@tekdoctor.test', 'hash', 'technician', 1)`
    );
    testTech1 = { id: t1Res.insertId, email: 'tech1@tekdoctor.test', role: 'technician' };

    const [t2Res] = await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES ('Audit Tech 2', 'tech2_${Date.now()}@tekdoctor.test', 'hash', 'technician', 1)`
    );
    testTech2 = { id: t2Res.insertId, email: 'tech2@tekdoctor.test', role: 'technician' };

    const [admRes] = await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES ('Audit Admin', 'admin_${Date.now()}@tekdoctor.test', 'hash', 'admin', 1)`
    );
    testAdmin = { id: admRes.insertId, email: 'admin@tekdoctor.test', role: 'admin' };

    console.log('[Setup] Test users created successfully.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Additional Charges in Repair Completion & Auto-Created Draft Invoice
    // ─────────────────────────────────────────────────────────────
    console.log('--- Test 1: Additional Charges in Auto-Created Draft Invoice ---');
    const [ticketRes1] = await pool.query(
      `INSERT INTO service_requests (
         user_id, ticket_number, customer_name, email, mobile, device_category, brand,
         problem_description, status, customer_approval_status, repair_cost, estimated_cost, additional_charges,
         assigned_technician_id
       ) VALUES (?, 'TKT-AUDIT-1', 'Audit Cust', 'audit@test.com', '9876543210', 'Laptop', 'Dell',
         'Screen flicker', 'in_progress', 'approved', 3000.00, 3000.00, 1000.00, ?)`,
      [testUserId, testTech1.id]
    );
    ticket1Id = ticketRes1.insertId;

    // Trigger repair completion via updateRequestStatus
    const { req: reqComp, res: resComp } = createMockReqRes(testAdmin, { status: 'completed' }, { id: ticket1Id });
    await repairController.updateRequestStatus(reqComp, resComp, (err) => { if (err) throw err; });

    assert(resComp.statusCode === 200, 'updateRequestStatus completed with HTTP 200');

    // Query the generated invoice
    const [invoices1] = await pool.query(
      `SELECT * FROM invoices WHERE ticket_id = ? ORDER BY id DESC LIMIT 1`,
      [ticket1Id]
    );
    assert(invoices1.length === 1, 'Draft invoice auto-created in database');
    const autoInv1 = invoices1[0];
    invoice1Id = autoInv1.id;

    // Subtotal = base (3000) + additional (1000) = 4000
    // Tax = 4000 * 0.18 = 720
    // Grand total = 4720
    assert(autoInv1.status === 'Draft', `Auto-created invoice is in 'Draft' state (actual: ${autoInv1.status})`);
    assert(Number(autoInv1.subtotal) === 4000, `Draft invoice subtotal is ₹4000 (actual: ${autoInv1.subtotal})`);
    assert(Number(autoInv1.tax_amount) === 720, `Draft invoice tax_amount is ₹720 (actual: ${autoInv1.tax_amount})`);
    assert(Number(autoInv1.amount) === 4720, `Draft invoice grand total is ₹4720 (actual: ${autoInv1.amount})`);

    // Verify line items
    const [items1] = await pool.query(
      `SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY id ASC`,
      [invoice1Id]
    );
    assert(items1.length === 2, `Invoice has 2 line items: base repair + additional charges (actual: ${items1.length})`);
    if (items1.length === 2) {
      assert(items1[0].description.includes('Repair Service') && Number(items1[0].unit_price) === 3000, 'Item 1 is Repair Service at ₹3000');
      assert(items1[1].description.includes('Additional') && Number(items1[1].unit_price) === 1000, 'Item 2 is Additional Charges at ₹1000');
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Stage A — Estimate Approved, Invoice Absent -> Cash Collection Blocked (HTTP 409)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Test 2: Stage A — Estimate Approved, Invoice Absent -> Cash Collection Blocked ---');
    const [ticketRes2] = await pool.query(
      `INSERT INTO service_requests (
         user_id, ticket_number, customer_name, email, mobile, device_category, brand,
         problem_description, status, customer_approval_status, repair_cost, estimated_cost,
         assigned_technician_id
       ) VALUES (?, 'TKT-AUDIT-2', 'Audit Cust 2', 'audit2@test.com', '9876543211', 'Phone', 'Samsung',
         'Battery drain', 'in_progress', 'approved', 2500.00, 2500.00, ?)`,
      [testUserId, testTech1.id]
    );
    ticket2Id = ticketRes2.insertId;

    // Verify no invoice exists for ticket 2
    const [noInvRows] = await pool.query(`SELECT * FROM invoices WHERE ticket_id = ?`, [ticket2Id]);
    assert(noInvRows.length === 0, 'No invoice exists for Ticket 2 at Stage A');

    // Attempt cash collection by assigned technician
    const { req: reqTechStageA, res: resTechStageA } = createMockReqRes(testTech1, { ticketId: ticket2Id });
    await billingController.recordCashCollected(reqTechStageA, resTechStageA, (err) => { if (err) throw err; });

    assert(resTechStageA.statusCode === 409, `Stage A cash collection rejected with HTTP 409 (actual: ${resTechStageA.statusCode})`);
    assert(
      String(resTechStageA.data?.message || '').includes('Cash collection is unavailable until the final invoice is released'),
      `Stage A response message explains invoice release requirement: "${resTechStageA.data?.message}"`
    );

    // Verify zero payment records and no state changes in database
    const [pmtStageA] = await pool.query(`SELECT * FROM payments WHERE ticket_id = ?`, [ticket2Id]);
    assert(pmtStageA.length === 0, 'No payment record created for premature Stage A collection attempt');

    const [tkStageA] = await pool.query(`SELECT payment_status, collection_status FROM service_requests WHERE id = ?`, [ticket2Id]);
    assert(tkStageA[0].payment_status === 'unpaid', `Ticket payment_status remains unpaid (actual: ${tkStageA[0].payment_status})`);
    assert(tkStageA[0].collection_status === 'not_applicable', `Ticket collection_status remains not_applicable (actual: ${tkStageA[0].collection_status})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Stage B — Repair Completed, Draft Invoice -> Cash Collection Blocked (HTTP 409)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Test 3: Stage B — Repair Completed, Draft Invoice -> Cash Collection Blocked ---');

    // On Ticket 1, auto-created invoice exists in Draft state
    const { req: reqTechDraft, res: resTechDraft } = createMockReqRes(testTech1, { ticketId: ticket1Id });
    await billingController.recordCashCollected(reqTechDraft, resTechDraft, (err) => { if (err) throw err; });

    assert(resTechDraft.statusCode === 409, `Draft invoice cash collection rejected with HTTP 409 (actual: ${resTechDraft.statusCode})`);
    assert(
      String(resTechDraft.data?.message || '').includes('Cash collection is unavailable until the final invoice is released'),
      `Draft invoice response message explains invoice release requirement: "${resTechDraft.data?.message}"`
    );

    // Also verify Admin cash collection on Draft invoice is blocked
    const { req: reqAdminDraft, res: resAdminDraft } = createMockReqRes(testAdmin, { ticketId: ticket1Id });
    await billingController.recordCashCollected(reqAdminDraft, resAdminDraft, (err) => { if (err) throw err; });
    assert(resAdminDraft.statusCode === 409, `Admin cash collection on Draft invoice rejected with HTTP 409 (actual: ${resAdminDraft.statusCode})`);

    // Verify zero payment records created
    const [pmtDraft] = await pool.query(`SELECT * FROM payments WHERE ticket_id = ?`, [ticket1Id]);
    assert(pmtDraft.length === 0, 'No payment record created for Draft invoice collection attempt');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: getPaymentReceipt Reflects Itemized Charges & Non-Payable Draft Status
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Test 4: getPaymentReceipt Reflects Itemized Charges & Non-Payable Draft Status ---');
    const { req: reqRec, res: resRec } = createMockReqRes(testAdmin, {}, { id: invoice1Id });
    await billingController.getPaymentReceipt(reqRec, resRec, (err) => { if (err) throw err; });

    assert(resRec.statusCode === 200, 'getPaymentReceipt returned HTTP 200');
    const receiptData = resRec.data?.data;
    assert(receiptData !== null, 'Receipt payload returned');
    assert(receiptData.invoiceStatus === 'Draft', `Receipt reflects invoiceStatus 'Draft' (actual: ${receiptData.invoiceStatus})`);
    assert(receiptData.isFinal === false, 'Receipt isFinal is false for Draft invoice');
    assert(receiptData.financials.subtotal === 4000, `Receipt subtotal is ₹4000 (actual: ${receiptData.financials?.subtotal})`);
    assert(receiptData.financials.totalAmount === 4720, `Receipt total amount is ₹4720 (actual: ${receiptData.financials?.totalAmount})`);
    assert(receiptData.financials.lineItems.length === 2, `Receipt lineItems contains 2 items (actual: ${receiptData.financials?.lineItems?.length})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Stage C & D — Admin Finalizes Invoice -> Authorized Cash Collection
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Test 5: Stage C & D — Admin Finalizes Invoice -> Authorized Cash Collection ---');

    // Admin finalizes the invoice to Final
    await pool.query(
      `UPDATE invoices SET status = 'Final', finalized_at = NOW(), finalized_by = ? WHERE id = ?`,
      [testAdmin.id, invoice1Id]
    );

    // 5a. Unassigned technician should be blocked (403 IDOR prevention)
    const { req: reqTech2, res: resTech2 } = createMockReqRes(testTech2, { ticketId: ticket1Id });
    await billingController.recordCashCollected(reqTech2, resTech2, (err) => { if (err) throw err; });
    assert(resTech2.statusCode === 403, `Unassigned technician blocked with HTTP 403 (actual: ${resTech2.statusCode})`);

    // 5b. Assigned technician attempting collection WITHOUT customer/staff cash initiation must be REJECTED (400)
    const { req: reqPrematureCash, res: resPrematureCash } = createMockReqRes(testTech1, { ticketId: ticket1Id });
    await billingController.recordCashCollected(reqPrematureCash, resPrematureCash, (err) => { if (err) throw err; });
    assert(resPrematureCash.statusCode === 400, `Premature cash collection without initiated cash payment rejected with HTTP 400 (actual: ${resPrematureCash.statusCode})`);
    assert(String(resPrematureCash.data?.message || '').includes('Cash payment has not been initiated'), 'Response clearly explains cash payment has not been initiated');

    // 5c. Customer selecting online method (e.g. card) must NOT be silently overridden by cash collection
    await pool.query(`UPDATE service_requests SET payment_method = 'card' WHERE id = ?`, [ticket1Id]);
    const { req: reqOverrideOnline, res: resOverrideOnline } = createMockReqRes(testTech1, { ticketId: ticket1Id });
    await billingController.recordCashCollected(reqOverrideOnline, resOverrideOnline, (err) => { if (err) throw err; });
    assert(resOverrideOnline.statusCode === 400, `Cash collection rejected when card payment is selected (actual: ${resOverrideOnline.statusCode})`);
    assert(String(resOverrideOnline.data?.message || '').includes('card is currently selected'), 'Response explains card is currently selected');

    // Reset payment_method
    await pool.query(`UPDATE service_requests SET payment_method = NULL WHERE id = ?`, [ticket1Id]);

    // 5d. Explicit Cash Payment Initiation by Customer or Staff
    const { req: reqInitCash1, res: resInitCash1 } = createMockReqRes(
      testTech1,
      { ticketId: ticket1Id, paymentMethod: 'cash', notes: 'Customer opted to pay cash at desk' }
    );
    await billingController.initiateOfflinePayment(reqInitCash1, resInitCash1, (err) => { if (err) throw err; });
    assert(resInitCash1.statusCode === 200, `Explicit cash payment initiated with HTTP 200 (actual: ${resInitCash1.statusCode})`);
    assert(resInitCash1.data?.data?.paymentMethod === 'cash', 'Initiated paymentMethod is cash');
    assert(resInitCash1.data?.data?.collectionStatus === 'pending_collection', 'Initial collectionStatus is pending_collection');

    // 5e. Assigned technician records physical cash collection -> Succeeds (200)
    const { req: reqTech1, res: resTech1 } = createMockReqRes(testTech1, { ticketId: ticket1Id, notes: 'Received ₹4720 in notes' });
    await billingController.recordCashCollected(reqTech1, resTech1, (err) => { if (err) throw err; });
    assert(resTech1.statusCode === 200, `Assigned technician cash collection recorded with HTTP 200 (actual: ${resTech1.statusCode})`);

    // Verify DB states: status must NOT be 'paid' until Admin verifies!
    const [payments] = await pool.query(
      `SELECT * FROM payments WHERE ticket_id = ? ORDER BY id DESC LIMIT 1`,
      [ticket1Id]
    );
    assert(payments.length === 1, 'Payment record exists in database');
    const cashPayment = payments[0];
    assert(cashPayment.status === 'pending_verification', `Payment status is 'pending_verification' (actual: ${cashPayment.status})`);
    assert(cashPayment.collection_status === 'collected', `Payment collection_status is 'collected' (actual: ${cashPayment.collection_status})`);
    assert(cashPayment.collected_by === testTech1.id, `Payment collected_by is assigned technician ID (actual: ${cashPayment.collected_by})`);
    assert(cashPayment.payment_method === 'cash', `Payment method is 'cash' (actual: ${cashPayment.payment_method})`);
    assert(Number(cashPayment.amount) === 4720, `Payment amount matches authoritative invoice total ₹4720 (actual: ${cashPayment.amount})`);

    // Verify invoice is NOT marked Paid upon collection recording
    const [invAfterCash] = await pool.query(`SELECT status FROM invoices WHERE id = ?`, [invoice1Id]);
    assert(invAfterCash[0].status === 'Final', `Invoice remains in 'Final' state, NOT marked Paid (actual: ${invAfterCash[0].status})`);

    const [ticketAfterCash] = await pool.query(
      `SELECT payment_status, collection_status FROM service_requests WHERE id = ?`,
      [ticket1Id]
    );
    assert(ticketAfterCash[0].payment_status === 'pending_verification', `Ticket payment_status is 'pending_verification' (actual: ${ticketAfterCash[0].payment_status})`);
    assert(ticketAfterCash[0].collection_status === 'collected', `Ticket collection_status is 'collected' (actual: ${ticketAfterCash[0].collection_status})`);

    // 5f. Duplicate collection attempt must be blocked (400)
    const { req: reqDupCash, res: resDupCash } = createMockReqRes(testTech1, { ticketId: ticket1Id });
    await billingController.recordCashCollected(reqDupCash, resDupCash, (err) => { if (err) throw err; });
    assert(resDupCash.statusCode === 400, `Duplicate cash collection rejected with HTTP 400 (actual: ${resDupCash.statusCode})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Stage E — Successful Admin Verification Synchronizes All Records
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Test 6: Stage E — Successful Admin Verification Synchronizes Records ---');

    const { req: reqVerify, res: resVerify } = createMockReqRes(
      testAdmin,
      { ticketId: ticket1Id, action: 'verify' }
    );
    await billingController.verifyOfflinePayment(reqVerify, resVerify, (err) => { if (err) throw err; });

    assert(resVerify.statusCode === 200, `Admin verification completed with HTTP 200 (actual: ${resVerify.statusCode})`);

    // Verify all records transitioned to Paid
    const [pmtVerified] = await pool.query(`SELECT status, verification_status, verified_by FROM payments WHERE id = ?`, [cashPayment.id]);
    assert(pmtVerified[0].status === 'paid', `Payment status is 'paid' (actual: ${pmtVerified[0].status})`);
    assert(pmtVerified[0].verification_status === 'verified', `Payment verification_status is 'verified' (actual: ${pmtVerified[0].verification_status})`);
    assert(pmtVerified[0].verified_by === testAdmin.id, `Payment verified_by is Admin ID (actual: ${pmtVerified[0].verified_by})`);

    const [invVerified] = await pool.query(`SELECT status, paid_at FROM invoices WHERE id = ?`, [invoice1Id]);
    assert(invVerified[0].status === 'Paid', `Invoice status transitioned to 'Paid' (actual: ${invVerified[0].status})`);
    assert(invVerified[0].paid_at !== null, 'Invoice paid_at timestamp recorded');

    const [tkVerified] = await pool.query(`SELECT payment_status, paid_at FROM service_requests WHERE id = ?`, [ticket1Id]);
    assert(tkVerified[0].payment_status === 'paid', `Ticket payment_status transitioned to 'paid' (actual: ${tkVerified[0].payment_status})`);
    assert(tkVerified[0].paid_at !== null, 'Ticket paid_at timestamp recorded');

    // Duplicate settlement on already paid ticket blocked
    const { req: reqDupSettle, res: resDupSettle } = createMockReqRes(testAdmin, { ticketId: ticket1Id, action: 'verify' });
    await billingController.verifyOfflinePayment(reqDupSettle, resDupSettle, (err) => { if (err) throw err; });
    assert(resDupSettle.statusCode === 400, `Duplicate settlement attempt blocked with HTTP 400 (actual: ${resDupSettle.statusCode})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Stage E — Admin Cash Rejection & Status Preservation on Separate Ticket
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Test 7: Stage E — Admin Cash Rejection & Status Preservation ---');

    // Setup Ticket 3
    const [ticketRes3] = await pool.query(
      `INSERT INTO service_requests (
         user_id, ticket_number, customer_name, email, mobile, device_category, brand,
         problem_description, status, customer_approval_status, repair_cost, estimated_cost,
         assigned_technician_id
       ) VALUES (?, 'TKT-AUDIT-3', 'Audit Cust 3', 'audit3@test.com', '9876543212', 'Desktop', 'HP',
         'No power', 'completed', 'approved', 2000.00, 2000.00, ?)`,
      [testUserId, testTech1.id]
    );
    ticket3Id = ticketRes3.insertId;

    invoice3Id = `TD-C3-${Date.now().toString().slice(-10)}`;
    await pool.query(
      `INSERT INTO invoices (
         id, user_id, ticket_id, client_name, amount, subtotal, tax_amount,
         currency, status, invoice_date, due_date
       ) VALUES (?, ?, ?, 'Audit Cust 3', 2360.00, 2000.00, 360.00, 'INR', 'Final', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY))`,
      [invoice3Id, testUserId, ticket3Id]
    );

    // Initiate cash payment on Ticket 3 first
    const { req: reqInitCash3, res: resInitCash3 } = createMockReqRes(
      testTech1,
      { ticketId: ticket3Id, paymentMethod: 'cash', notes: 'Ticket 3 cash payment initiated' }
    );
    await billingController.initiateOfflinePayment(reqInitCash3, resInitCash3, (err) => { if (err) throw err; });
    assert(resInitCash3.statusCode === 200, `Ticket 3 cash payment initiated with HTTP 200 (actual: ${resInitCash3.statusCode})`);

    // Record cash collection on Ticket 3
    const { req: reqTech3, res: resTech3 } = createMockReqRes(testTech1, { ticketId: ticket3Id });
    await billingController.recordCashCollected(reqTech3, resTech3, (err) => { if (err) throw err; });
    assert(resTech3.statusCode === 200, `Ticket 3 cash collection recorded with HTTP 200 (actual: ${resTech3.statusCode})`);

    // Admin rejects the cash payment
    const { req: reqReject, res: resReject } = createMockReqRes(
      testAdmin,
      { ticketId: ticket3Id, action: 'reject', rejectionReason: 'Currency serial verification mismatch' }
    );
    await billingController.verifyOfflinePayment(reqReject, resReject, (err) => { if (err) throw err; });

    assert(resReject.statusCode === 200, `Admin rejection completed with HTTP 200 (actual: ${resReject.statusCode})`);

    const [pmtRejected] = await pool.query(
      `SELECT status, verification_status, reference_note FROM payments WHERE ticket_id = ? ORDER BY id DESC LIMIT 1`,
      [ticket3Id]
    );
    assert(pmtRejected[0].status === 'rejected', `Payment status is 'rejected' (actual: ${pmtRejected[0].status})`);
    assert(pmtRejected[0].verification_status === 'rejected', `Payment verification_status is 'rejected' (actual: ${pmtRejected[0].verification_status})`);
    assert(pmtRejected[0].reference_note.includes('Currency serial verification mismatch'), 'Audit rejection reason preserved in reference_note');

    // CRITICAL REQUIREMENT: Finalized invoice status must remain 'Final', NOT reset to Draft!
    const [invAfterReject] = await pool.query(
      `SELECT status, amount FROM invoices WHERE id = ?`,
      [invoice3Id]
    );
    assert(invAfterReject[0].status === 'Final', `Commercial invoice status remains 'Final' (actual: ${invAfterReject[0].status})`);
    assert(Number(invAfterReject[0].amount) === 2360, `Invoice amount remains authoritative ₹2360 (actual: ${invAfterReject[0].amount})`);

    // Verify ticket is still eligible for payment retry (not blocked, not double counted)
    const { req: reqElig, res: resElig } = createMockReqRes(
      { id: testUserId, role: 'customer' },
      {},
      { ticketId: ticket3Id }
    );
    await billingController.getPaymentEligibility(reqElig, resElig, (err) => { if (err) throw err; });
    assert(resElig.statusCode === 200, 'Payment eligibility endpoint returned 200');
    assert(resElig.data?.data?.eligible === true, 'Ticket is eligible for payment retry after cash rejection');
    assert(Number(resElig.data?.data?.amount) === 2360, `Authoritative payable amount matches invoice total ₹2360 (actual: ${resElig.data?.data?.amount})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 8: GST Editing, Line-Item Recalculation, Persistence, and Canonical Preview/Receipt
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Test 8: GST Editing, Line-Item Recalculation, Persistence & Preview/Receipt ---');

    let ticket4Id = null;
    let invoice4Id = `TD-C4-${Date.now().toString().slice(-10)}`;

    const [ticketRes4] = await pool.query(
      `INSERT INTO service_requests (
         user_id, ticket_number, customer_name, email, mobile, device_category, brand,
         problem_description, status, customer_approval_status, repair_cost, estimated_cost,
         assigned_technician_id
       ) VALUES (?, 'TKT-AUDIT-4', 'Audit Cust 4', 'audit4@test.com', '9876543213', 'Laptop', 'Lenovo',
         'Screen issue', 'completed', 'approved', 5000.00, 5000.00, ?)`,
      [testUserId, testTech1.id]
    );
    ticket4Id = ticketRes4.insertId;

    // 8a. Create initial Draft invoice at standard 18% GST (Subtotal: 5000, Tax: 900, Total: 5900)
    await pool.query(
      `INSERT INTO invoices (
         id, user_id, ticket_id, client_name, amount, subtotal, tax_amount,
         cgst_amount, sgst_amount, igst_amount, is_interstate,
         currency, status, invoice_date, due_date
       ) VALUES (?, ?, ?, 'Audit Cust 4', 5900.00, 5000.00, 900.00, 450.00, 450.00, 0, FALSE, 'INR', 'Draft', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY))`,
      [invoice4Id, testUserId, ticket4Id]
    );
    await pool.query(
      `INSERT INTO invoice_line_items (invoice_id, description, hsn_sac, quantity, unit_price, total, tax_rate, tax_amount)
       VALUES (?, 'Screen Replacement Assembly', '9987', 1, 5000.00, 5000.00, 18.00, 900.00)`,
      [invoice4Id]
    );

    // 8b. Admin updates Draft invoice GST rate to 12% via updateInvoice
    const { req: reqGst12, res: resGst12 } = createMockReqRes(
      testAdmin,
      {
        taxRate: 12,
        lineItems: [
          { description: 'Screen Replacement Assembly', hsnSac: '9987', quantity: 1, unitPrice: 5000, taxRate: 12 }
        ]
      },
      { id: invoice4Id }
    );
    await billingController.updateInvoice(reqGst12, resGst12, (err) => { if (err) throw err; });
    assert(resGst12.statusCode === 200, `Admin updated invoice GST rate to 12% (HTTP ${resGst12.statusCode})`);

    // 8c. Verify recalculated values persisted into database
    const [inv4Reloaded] = await pool.query(`SELECT * FROM invoices WHERE id = ?`, [invoice4Id]);
    assert(Number(inv4Reloaded[0].subtotal) === 5000, `Persisted subtotal is ₹5000 (actual: ${inv4Reloaded[0].subtotal})`);
    assert(Number(inv4Reloaded[0].tax_amount) === 600, `Persisted tax_amount at 12% is ₹600 (actual: ${inv4Reloaded[0].tax_amount})`);
    assert(Number(inv4Reloaded[0].cgst_amount) === 300, `Persisted cgst_amount is ₹300 (actual: ${inv4Reloaded[0].cgst_amount})`);
    assert(Number(inv4Reloaded[0].sgst_amount) === 300, `Persisted sgst_amount is ₹300 (actual: ${inv4Reloaded[0].sgst_amount})`);
    assert(Number(inv4Reloaded[0].amount) === 5600, `Persisted grand total is ₹5600 (actual: ${inv4Reloaded[0].amount})`);

    const [lines4Reloaded] = await pool.query(`SELECT * FROM invoice_line_items WHERE invoice_id = ?`, [invoice4Id]);
    assert(lines4Reloaded.length === 1, 'Line items reloaded');
    assert(Number(lines4Reloaded[0].tax_rate) === 12, `Line item tax_rate persisted as 12% (actual: ${lines4Reloaded[0].tax_rate})`);
    assert(Number(lines4Reloaded[0].tax_amount) === 600, `Line item tax_amount persisted as ₹600 (actual: ${lines4Reloaded[0].tax_amount})`);

    // 8d. Preview/Receipt reflects updated 12% GST rate & dynamic totals
    const { req: reqRcpt4, res: resRcpt4 } = createMockReqRes(testAdmin, {}, { id: invoice4Id });
    await billingController.getPaymentReceipt(reqRcpt4, resRcpt4, (err) => { if (err) throw err; });
    assert(resRcpt4.statusCode === 200, `getPaymentReceipt returned HTTP 200 for updated invoice`);
    const fin4 = resRcpt4.data?.data?.financials;
    assert(fin4?.taxRate === 12, `Receipt financials.taxRate is 12% (actual: ${fin4?.taxRate})`);
    assert(fin4?.cgstRate === 6, `Receipt financials.cgstRate is 6% (actual: ${fin4?.cgstRate})`);
    assert(fin4?.sgstRate === 6, `Receipt financials.sgstRate is 6% (actual: ${fin4?.sgstRate})`);
    assert(fin4?.cgstAmount === 300, `Receipt financials.cgstAmount is ₹300 (actual: ${fin4?.cgstAmount})`);
    assert(fin4?.sgstAmount === 300, `Receipt financials.sgstAmount is ₹300 (actual: ${fin4?.sgstAmount})`);
    assert(fin4?.totalAmount === 5600, `Receipt financials.totalAmount is ₹5600 (actual: ${fin4?.totalAmount})`);
    assert(fin4?.lineItems[0].taxRate === 12, `Receipt line item taxRate is 12% (actual: ${fin4?.lineItems[0].taxRate})`);

    // 8e. Interstate GST calculation (IGST 12%, CGST 0, SGST 0)
    const { req: reqInter, res: resInter } = createMockReqRes(
      testAdmin,
      {
        isInterstate: true,
        taxRate: 12,
        lineItems: [
          { description: 'Screen Replacement Assembly', hsnSac: '9987', quantity: 1, unitPrice: 5000, taxRate: 12 }
        ]
      },
      { id: invoice4Id }
    );
    await billingController.updateInvoice(reqInter, resInter, (err) => { if (err) throw err; });
    assert(resInter.statusCode === 200, `Admin updated invoice to Interstate (HTTP ${resInter.statusCode})`);

    const { req: reqRcptInter, res: resRcptInter } = createMockReqRes(testAdmin, {}, { id: invoice4Id });
    await billingController.getPaymentReceipt(reqRcptInter, resRcptInter, (err) => { if (err) throw err; });
    const finInter = resRcptInter.data?.data?.financials;
    assert(finInter?.isInterstate === true, 'Receipt financials isInterstate is true');
    assert(finInter?.igstRate === 12, `Receipt financials.igstRate is 12% (actual: ${finInter?.igstRate})`);
    assert(finInter?.igstAmount === 600, `Receipt financials.igstAmount is ₹600 (actual: ${finInter?.igstAmount})`);
    assert(finInter?.cgstAmount === 0, `Receipt financials.cgstAmount is ₹0 for interstate (actual: ${finInter?.cgstAmount})`);
    assert(finInter?.sgstAmount === 0, `Receipt financials.sgstAmount is ₹0 for interstate (actual: ${finInter?.sgstAmount})`);

    // 8f. Admin finalizes invoice: authoritative payable amount matches ₹5600
    const { req: reqFin4, res: resFin4 } = createMockReqRes(testAdmin, {}, { id: invoice4Id });
    await billingController.finalizeInvoice(reqFin4, resFin4, (err) => { if (err) throw err; });
    assert(resFin4.statusCode === 200, `Invoice finalized with HTTP 200`);
    assert(Number(resFin4.data?.data?.amount) === 5600, `Finalized invoice amount is ₹5600 (actual: ${resFin4.data?.data?.amount})`);

    // 8g. Immutable lifecycle protection: finalized invoice cannot be modified
    const { req: reqLockEdit, res: resLockEdit } = createMockReqRes(
      testAdmin,
      { taxRate: 18, lineItems: [{ description: 'Tamper attempt', unitPrice: 1000 }] },
      { id: invoice4Id }
    );
    await billingController.updateInvoice(reqLockEdit, resLockEdit, (err) => { if (err) throw err; });
    assert(resLockEdit.statusCode === 400, `Finalized invoice is immutable; update rejected with HTTP 400 (actual: ${resLockEdit.statusCode})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 9: Corporate (Company) Invoice Access & Multi-Tenant Isolation
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Test 9: Corporate (Company) Invoice Access & Multi-Tenant Isolation ---');

    // Create tickets for Company Alpha and Company Beta
    const [compATicket] = await pool.query(
      `INSERT INTO service_requests (
         user_id, ticket_number, company_id, customer_name, email, mobile,
         device_category, brand, problem_description, status, customer_approval_status, repair_cost
       ) VALUES (?, 'TKT-CORP-A', ?, 'Alpha Employee', 'alpha@corp.test', '9123456789',
         'Workstation', 'HP', 'Motherboard issue', 'completed', 'approved', 8000.00)`,
      [testCompanyAUser.id, testCompanyAUser.id]
    );
    ticketCompanyAId = compATicket.insertId;

    const [compBTicket] = await pool.query(
      `INSERT INTO service_requests (
         user_id, ticket_number, company_id, customer_name, email, mobile,
         device_category, brand, problem_description, status, customer_approval_status, repair_cost
       ) VALUES (?, 'TKT-CORP-B', ?, 'Beta Employee', 'beta@corp.test', '9123456788',
         'Server', 'Dell', 'RAID rebuild', 'completed', 'approved', 15000.00)`,
      [testCompanyBUser.id, testCompanyBUser.id]
    );
    ticketCompanyBId = compBTicket.insertId;

    // Create invoices for both company tickets (using IDs within VARCHAR(20) limit)
    const invoiceCompanyAId = `TD-CA-${Date.now().toString().slice(-10)}`;
    await pool.query(
      `INSERT INTO invoices (
         id, user_id, ticket_id, client_name, amount, subtotal, tax_amount,
         currency, status, invoice_date, due_date
       ) VALUES (?, ?, ?, 'Company Alpha', 9440.00, 8000.00, 1440.00, 'INR', 'Final', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 15 DAY))`,
      [invoiceCompanyAId, testCompanyAUser.id, ticketCompanyAId]
    );

    const invoiceCompanyBId = `TD-CB-${Date.now().toString().slice(-10)}`;
    await pool.query(
      `INSERT INTO invoices (
         id, user_id, ticket_id, client_name, amount, subtotal, tax_amount,
         currency, status, invoice_date, due_date
       ) VALUES (?, ?, ?, 'Company Beta', 17700.00, 15000.00, 2700.00, 'INR', 'Final', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 15 DAY))`,
      [invoiceCompanyBId, testCompanyBUser.id, ticketCompanyBId]
    );

    // 9a. Company Alpha user can access Company Alpha's invoice receipt
    const { req: reqCompA, res: resCompA } = createMockReqRes(
      testCompanyAUser,
      {},
      { id: invoiceCompanyAId }
    );
    await billingController.getPaymentReceipt(reqCompA, resCompA, (err) => { if (err) throw err; });
    assert(resCompA.statusCode === 200, `Company Alpha can access own invoice receipt (HTTP ${resCompA.statusCode})`);
    assert(resCompA.data?.data?.receiptNumber === String(invoiceCompanyAId), 'Company Alpha receipt number matches');

    // 9b. Company Beta user attempting to access Company Alpha's invoice receipt must be REJECTED (403 Forbidden)
    const { req: reqCrossComp, res: resCrossComp } = createMockReqRes(
      testCompanyBUser,
      {},
      { id: invoiceCompanyAId }
    );
    await billingController.getPaymentReceipt(reqCrossComp, resCrossComp, (err) => { if (err) throw err; });
    assert(resCrossComp.statusCode === 403, `Cross-tenant access by Company Beta to Company Alpha invoice strictly blocked with HTTP 403 (actual: ${resCrossComp.statusCode})`);

    // 9c. Company Beta user can access their own invoice receipt
    const { req: reqCompB, res: resCompB } = createMockReqRes(
      testCompanyBUser,
      {},
      { id: invoiceCompanyBId }
    );
    await billingController.getPaymentReceipt(reqCompB, resCompB, (err) => { if (err) throw err; });
    assert(resCompB.statusCode === 200, `Company Beta can access own invoice receipt (HTTP ${resCompB.statusCode})`);
    assert(resCompB.data?.data?.receiptNumber === String(invoiceCompanyBId), 'Company Beta receipt number matches');

    // Cleanup ticket 4 / invoice 4
    if (invoice4Id) {
      await pool.query(`DELETE FROM invoice_line_items WHERE invoice_id = ?`, [invoice4Id]);
      await pool.query(`DELETE FROM invoices WHERE id = ?`, [invoice4Id]);
    }
    if (ticket4Id) {
      await pool.query(`DELETE FROM service_requests WHERE id = ?`, [ticket4Id]);
    }

  } catch (err) {
    console.error('Fatal error during test execution:', err);
    failedTests++;
  } finally {
    // Cleanup test data
    console.log('\n[Cleanup] Cleaning up test database artifacts...');
    try {
      if (invoice1Id) {
        await pool.query(`DELETE FROM invoice_line_items WHERE invoice_id = ?`, [invoice1Id]);
        await pool.query(`DELETE FROM payments WHERE ticket_id = ?`, [ticket1Id]);
        await pool.query(`DELETE FROM invoices WHERE ticket_id = ?`, [ticket1Id]);
      }
      if (invoice3Id) {
        await pool.query(`DELETE FROM payments WHERE ticket_id = ?`, [ticket3Id]);
        await pool.query(`DELETE FROM invoices WHERE ticket_id = ?`, [ticket3Id]);
      }
      if (ticketCompanyAId) {
        await pool.query(`DELETE FROM invoices WHERE ticket_id = ?`, [ticketCompanyAId]);
        await pool.query(`DELETE FROM service_requests WHERE id = ?`, [ticketCompanyAId]);
      }
      if (ticketCompanyBId) {
        await pool.query(`DELETE FROM invoices WHERE ticket_id = ?`, [ticketCompanyBId]);
        await pool.query(`DELETE FROM service_requests WHERE id = ?`, [ticketCompanyBId]);
      }
      if (ticket1Id) {
        await pool.query(`DELETE FROM service_requests WHERE id = ?`, [ticket1Id]);
      }
      if (ticket2Id) {
        await pool.query(`DELETE FROM service_requests WHERE id = ?`, [ticket2Id]);
      }
      if (ticket3Id) {
        await pool.query(`DELETE FROM service_requests WHERE id = ?`, [ticket3Id]);
      }
      const usersToClean = [
        testUserId,
        testCompanyAUser?.id,
        testCompanyBUser?.id,
        testTech1?.id,
        testTech2?.id,
        testAdmin?.id
      ].filter(Boolean);
      if (usersToClean.length > 0) {
        await pool.query(`DELETE FROM users WHERE id IN (?)`, [usersToClean]);
      }
    } catch (cleanErr) {
      console.error('Cleanup error:', cleanErr);
    }

    console.log('====================================================');
    console.log(`SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('====================================================\n');
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runTests();
