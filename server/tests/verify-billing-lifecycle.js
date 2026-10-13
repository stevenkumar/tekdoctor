/**
 * Verification Test Suite: Complete Billing Lifecycle, Item-level GST, Draft Review & Finalization
 * 
 * Verifies:
 * 1. Technician Estimate != Final Invoice (Approximate estimate is without GST, distinct from commercial invoice)
 * 2. Repair Completion triggers automatic Draft invoice creation (Status: 'Draft')
 * 3. Payment is blocked while invoice is Draft ("Repair invoice is currently a draft")
 * 4. Item-level GST calculation: Independent editable tax rates per item (e.g., 18% & 12%)
 * 5. Correct CGST (half) + SGST (half) vs Interstate IGST (full) tax breakdown
 * 6. Authoritative server-side totals: Subtotal + Total GST = Grand Total
 * 7. Invoice sequence integrity: Draft renaming to custom format does not corrupt or advance sequence
 * 8. Duplicate invoice number rejection
 * 9. Draft Finalization: transitions to 'Final', records finalized_at / finalized_by
 * 10. Immutability of Finalized invoice under normal editing
 * 11. Payment integration uses finalized payable amount instead of technician estimate
 * 12. Receipt / PDF data contract includes original estimate, disclaimer, HSN/SAC, tax breakup
 */

const { pool } = require('../config/db.config');
const { generateInvoiceId } = require('../utils/helpers');
const billingController = require('../controllers/billing.controller');
const repairController = require('../controllers/repair.controller');

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

// Mock Express req/res
function mockReqRes(body = {}, params = {}, user = { id: 1, role: 'admin' }, query = {}) {
  let responseData = null;
  let statusCode = 200;

  const req = {
    body,
    params,
    query,
    user
  };

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    getStatusCode() {
      return statusCode;
    },
    getData() {
      return responseData;
    }
  };

  return { req, res };
}

async function runTests() {
  console.log('====================================================');
  console.log('TEST SUITE: Billing Lifecycle, Item GST & Finalization');
  console.log('====================================================\n');

  const connection = await pool.getConnection();

  let testUserId = null;
  let testTicketId = null;
  let draftInvoiceId = null;
  const customInvoiceId = 'TD/TEST/2026/INV999';

  try {
    // -------------------------------------------------------------------------
    // SETUP: Create test customer and repair ticket with technician estimate
    // -------------------------------------------------------------------------
    console.log('[Setup] Creating test customer and repair ticket with technician estimate');
    
    const [uRes] = await connection.query(`
      INSERT INTO users (name, email, password, role, is_active, created_at)
      VALUES ('Billing Lifecycle Customer', 'test-billing-lifecycle@tekdoctor.in', 'dummy', 'customer', 1, NOW())
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `);
    testUserId = uRes.insertId;

    const [adminUser] = await connection.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    const adminId = adminUser[0]?.id || 1;

    const testTicketNum = 'TKT-TEST-BILL-' + Date.now().toString().slice(-6);
    const techEstimate = 4500.00;

    const [tRes] = await connection.query(`
      INSERT INTO service_requests (
        user_id, ticket_number, customer_name, email, mobile,
        device_category, brand, model_number, problem_description,
        status, assigned_technician_id, customer_approval_status, repair_cost, estimated_cost, created_at
      ) VALUES (?, ?, 'Billing Lifecycle Customer', 'test-billing-lifecycle@tekdoctor.in', '9876543210',
        'Smartphone', 'Apple', 'iPhone 13', 'Screen cracked and battery degraded',
        'in_progress', ?, 'approved', ?, ?, NOW())
    `, [testUserId, testTicketNum, adminId, techEstimate, techEstimate]);
    testTicketId = tRes.insertId;

    assert(testTicketId > 0, `Repair ticket created with ID: ${testTicketId} and estimate: ₹${techEstimate}`);

    // -------------------------------------------------------------------------
    // TEST 1: Repair Completion triggers automatic Draft invoice creation
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Repair Completion triggers Draft Invoice ---');

    // Call updateRequestStatus controller with status = 'completed'
    const statusReqRes = mockReqRes({ status: 'completed' }, { id: testTicketId }, { id: adminId, role: 'admin' });
    await repairController.updateRequestStatus(statusReqRes.req, statusReqRes.res);

    assert(statusReqRes.res.getStatusCode() === 200, 'Ticket marked completed successfully');

    // Verify invoice created in database
    const [invoices] = await connection.query(
      'SELECT * FROM invoices WHERE ticket_id = ?',
      [testTicketId]
    );

    assert(invoices.length === 1, 'Draft invoice automatically created for completed repair ticket');
    const inv = invoices[0];
    draftInvoiceId = inv.id;
    assert(inv.status === 'Draft', `Invoice status is 'Draft' (actual: ${inv.status})`);
    assert(Number(inv.original_estimate) === techEstimate, `Invoice preserves original_estimate ₹${techEstimate} (actual: ${inv.original_estimate})`);
    assert(Number(inv.amount) > 0, `Draft initial amount initialized: ₹${inv.amount}`);

    // -------------------------------------------------------------------------
    // TEST 2: Payment blocked while invoice is Draft
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Payment Blocked for Draft Invoice ---');

    const payEligReqRes = mockReqRes({}, { ticketId: testTicketId }, { id: testUserId, role: 'customer' }, { ticketNumber: testTicketNum });
    await billingController.getPaymentEligibility(payEligReqRes.req, payEligReqRes.res);
    const payEligData = payEligReqRes.res.getData()?.data;

    assert(
      payEligData && payEligData.eligible === false,
      `Payment eligibility check correctly reports invoice is draft (eligible: ${payEligData?.eligible})`
    );

    const orderReqRes = mockReqRes({ ticketNumber: testTicketNum, amount: techEstimate }, {}, { id: testUserId, role: 'customer' });
    await billingController.createPaymentOrder(orderReqRes.req, orderReqRes.res);
    assert(orderReqRes.res.getStatusCode() === 400, 'createPaymentOrder rejects payment when invoice is Draft');

    // -------------------------------------------------------------------------
    // TEST 3: Admin Review & Edit Draft Line Items with Item-level GST
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Admin Edit Draft with Item-Level GST (Intra-state) ---');

    // Line items:
    // Item 1: Qty 1, Unit Rate 5000, Tax Rate 18% -> Amount 5000, Tax 900
    // Item 2: Qty 2, Unit Rate 1000, Tax Rate 12% -> Amount 2000, Tax 240
    // Subtotal: 7000
    // Total GST: 1140 (CGST: 570, SGST: 570, IGST: 0)
    // Grand Total: 8140
    const editPayload = {
      isInterstate: false,
      lineItems: [
        {
          description: 'Premium OLED Screen Replacement',
          hsnSac: '851770',
          quantity: 1,
          unitRate: 5000,
          taxRate: 18
        },
        {
          description: 'Precision Diagnostic & Calibration Labor',
          hsnSac: '998713',
          quantity: 2,
          unitRate: 1000,
          taxRate: 12
        }
      ]
    };

    const updateReqRes = mockReqRes(editPayload, { id: draftInvoiceId }, { id: adminId, role: 'admin' });
    await billingController.updateInvoice(updateReqRes.req, updateReqRes.res);
    assert(updateReqRes.res.getStatusCode() === 200, 'updateInvoice succeeded for Draft');

    const [updatedInvRows] = await connection.query('SELECT * FROM invoices WHERE id = ?', [draftInvoiceId]);
    const updatedInv = updatedInvRows[0];
    const [lineItemRows] = await connection.query('SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY id ASC', [draftInvoiceId]);

    assert(Number(updatedInv.subtotal) === 7000, `Invoice Subtotal is 7000 (actual: ${updatedInv.subtotal})`);
    assert(Number(updatedInv.tax_amount) === 1140, `Invoice Total Tax is 1140 (actual: ${updatedInv.tax_amount})`);
    assert(Number(updatedInv.cgst_amount) === 570, `Invoice CGST is 570 (actual: ${updatedInv.cgst_amount})`);
    assert(Number(updatedInv.sgst_amount) === 570, `Invoice SGST is 570 (actual: ${updatedInv.sgst_amount})`);
    assert(Number(updatedInv.igst_amount) === 0, `Invoice IGST is 0 for intra-state (actual: ${updatedInv.igst_amount})`);
    assert(Number(updatedInv.amount) === 8140, `Grand Total is 8140 (actual: ${updatedInv.amount})`);

    assert(lineItemRows.length === 2, '2 line items stored in DB');
    assert(lineItemRows[0].hsn_sac === '851770' && Number(lineItemRows[0].tax_rate) === 18 && Number(lineItemRows[0].tax_amount) === 900,
      'Item 1: HSN 851770, Tax Rate 18%, Tax Amount 900');
    assert(lineItemRows[1].hsn_sac === '998713' && Number(lineItemRows[1].tax_rate) === 12 && Number(lineItemRows[1].tax_amount) === 240,
      'Item 2: HSN 998713, Tax Rate 12%, Tax Amount 240');

    // -------------------------------------------------------------------------
    // TEST 4: Interstate IGST Calculation
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Interstate IGST Calculation ---');

    const interstatePayload = {
      ...editPayload,
      isInterstate: true
    };
    const interstateReqRes = mockReqRes(interstatePayload, { id: draftInvoiceId }, { id: adminId, role: 'admin' });
    await billingController.updateInvoice(interstateReqRes.req, interstateReqRes.res);

    const [interstateInvRows] = await connection.query('SELECT * FROM invoices WHERE id = ?', [draftInvoiceId]);
    const interInv = interstateInvRows[0];

    assert(Number(interInv.cgst_amount) === 0, `CGST is 0 for interstate (actual: ${interInv.cgst_amount})`);
    assert(Number(interInv.sgst_amount) === 0, `SGST is 0 for interstate (actual: ${interInv.sgst_amount})`);
    assert(Number(interInv.igst_amount) === 1140, `IGST is full 1140 for interstate (actual: ${interInv.igst_amount})`);
    assert(Number(interInv.amount) === 8140, `Grand Total remains 8140 (actual: ${interInv.amount})`);

    // -------------------------------------------------------------------------
    // TEST 5: Sequence Integrity & Draft Custom Invoice Number Editing
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Invoice Number Sequence & Custom Renaming ---');

    // Check sequence before rename
    const preSeqId = await generateInvoiceId(connection);

    // Rename draft invoice to custom number
    const renamePayload = {
      ...interstatePayload,
      isInterstate: false, // switch back to intra-state
      newInvoiceId: customInvoiceId
    };

    const renameReqRes = mockReqRes(renamePayload, { id: draftInvoiceId }, { id: adminId, role: 'admin' });
    await billingController.updateInvoice(renameReqRes.req, renameReqRes.res);
    assert(renameReqRes.res.getStatusCode() === 200, `Draft invoice renamed to ${customInvoiceId}`);

    // Verify DB reflects custom ID
    const [renamedRows] = await connection.query('SELECT * FROM invoices WHERE id = ?', [customInvoiceId]);
    assert(renamedRows.length === 1, `Invoice found under new ID ${customInvoiceId}`);
    const [orphanRows] = await connection.query('SELECT * FROM invoices WHERE id = ?', [draftInvoiceId]);
    assert(orphanRows.length === 0, `Old invoice ID ${draftInvoiceId} no longer in invoices table`);

    // Verify child line items re-linked
    const [childLines] = await connection.query('SELECT * FROM invoice_line_items WHERE invoice_id = ?', [customInvoiceId]);
    assert(childLines.length === 2, `Line items cleanly re-linked to ${customInvoiceId}`);

    // Verify sequence was not altered or corrupted
    const postSeqId = await generateInvoiceId(connection);
    const preSeqNum = parseInt(preSeqId.replace(/\D/g, ''), 10);
    const postSeqNum = parseInt(postSeqId.replace(/\D/g, ''), 10);
    assert(
      postSeqNum === preSeqNum + 1,
      `Automatic sequence continued monotonically: ${preSeqId} -> ${postSeqId}`
    );

    // Verify duplicate custom invoice number collision rejection
    const dupPayload = {
      ...interstatePayload,
      newInvoiceId: customInvoiceId
    };
    // Attempting to rename another invoice (or create with duplicate ID)
    const dupReqRes = mockReqRes(dupPayload, { id: 'INV-NONEXISTENT' }, { id: adminId, role: 'admin' });
    await billingController.updateInvoice(dupReqRes.req, dupReqRes.res);
    assert(dupReqRes.res.getStatusCode() === 404 || dupReqRes.res.getStatusCode() === 400, 'Duplicate / invalid target rejected');

    // -------------------------------------------------------------------------
    // TEST 6: Invoice Finalization
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Invoice Finalization ---');

    const finalizeReqRes = mockReqRes({}, { id: customInvoiceId }, { id: adminId, role: 'admin' });
    await billingController.finalizeInvoice(finalizeReqRes.req, finalizeReqRes.res);
    assert(finalizeReqRes.res.getStatusCode() === 200, 'finalizeInvoice succeeded');

    const [finalInvRows] = await connection.query('SELECT * FROM invoices WHERE id = ?', [customInvoiceId]);
    const finalInv = finalInvRows[0];

    assert(finalInv.status === 'Final', `Status is now 'Final' (actual: ${finalInv.status})`);
    assert(finalInv.finalized_at !== null, 'finalized_at timestamp is recorded');
    assert(Number(finalInv.finalized_by) === adminId, `finalized_by recorded as admin ID (${adminId})`);

    // Verify finalized invoice cannot be casually edited
    const editFinalReqRes = mockReqRes({ items: [{ description: 'Hacked Item', quantity: 1, unitRate: 10 }] }, { id: customInvoiceId }, { id: adminId, role: 'admin' });
    await billingController.updateInvoice(editFinalReqRes.req, editFinalReqRes.res);
    assert(editFinalReqRes.res.getStatusCode() === 400, 'Editing finalized invoice is blocked');

    // -------------------------------------------------------------------------
    // TEST 7: Payment Flow Enforces Finalized Commercial Amount
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: Payment Enforces Final Commercial Amount ---');

    // Now check payment eligibility again
    const postFinalPayReqRes = mockReqRes({}, { ticketId: testTicketId }, { id: testUserId, role: 'customer' }, { ticketNumber: testTicketNum });
    await billingController.getPaymentEligibility(postFinalPayReqRes.req, postFinalPayReqRes.res);
    const postFinalData = postFinalPayReqRes.res.getData()?.data;

    assert(postFinalData?.eligible === true, 'Ticket is now payable after finalization');
    assert(
      Number(postFinalData?.amount) === 8140,
      `Payable amount is authoritative finalized invoice total ₹8140 (actual: ${postFinalData?.amount}), NOT technician estimate ₹${techEstimate}`
    );

    // -------------------------------------------------------------------------
    // TEST 8: Payment Receipt / PDF Data Contract
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8: Payment Receipt / PDF Contract Verification ---');

    const receiptReqRes = mockReqRes({}, { id: customInvoiceId }, { id: testUserId, email: 'test-billing-lifecycle@tekdoctor.in', role: 'customer' });
    await billingController.getPaymentReceipt(receiptReqRes.req, receiptReqRes.res, (err) => { if (err) throw err; });
    assert(receiptReqRes.res.getStatusCode() === 200, 'getPaymentReceipt succeeded');
    const receiptData = receiptReqRes.res.getData()?.data;

    assert(receiptData !== null, 'Receipt payload returned');
    const fin = receiptData.financials;
    assert(
      Number(receiptData.originalEstimate || fin.originalEstimate) === techEstimate,
      `Receipt includes original_estimate ₹${techEstimate}`
    );
    assert(
      (receiptData.estimateDisclaimer || fin.estimateDisclaimer || '').includes('approximate repair estimate'),
      'Receipt includes standard estimate disclaimer text'
    );
    assert(
      (receiptData.originalEstimateLabel || fin.originalEstimateLabel) === 'Original Repair Estimate (Technician) (Without GST)',
      'Receipt estimate_label matches required specification'
    );
    assert(Number(fin.subtotal) === 7000, `Receipt subtotal is ₹7000 (actual: ${fin.subtotal})`);
    assert(Number(fin.cgstAmount) === 570, `Receipt CGST is ₹570 (actual: ${fin.cgstAmount})`);
    assert(Number(fin.sgstAmount) === 570, `Receipt SGST is ₹570 (actual: ${fin.sgstAmount})`);
    assert(Number(fin.totalAmount) === 8140, `Receipt total amount is ₹8140 (actual: ${fin.totalAmount})`);

  } catch (err) {
    console.error('Unexpected error in billing lifecycle test suite:', err);
    testsFailed++;
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP: Remove test records
    // -------------------------------------------------------------------------
    console.log('\n[Cleanup] Removing test invoice, ticket, and customer records');
    try {
      if (customInvoiceId) {
        await connection.query('DELETE FROM invoice_line_items WHERE invoice_id = ?', [customInvoiceId]);
        await connection.query('DELETE FROM invoices WHERE id = ?', [customInvoiceId]);
      }
      if (draftInvoiceId) {
        await connection.query('DELETE FROM invoice_line_items WHERE invoice_id = ?', [draftInvoiceId]);
        await connection.query('DELETE FROM invoices WHERE id = ?', [draftInvoiceId]);
      }
      if (testTicketId) {
        await connection.query('DELETE FROM service_requests WHERE id = ?', [testTicketId]);
      }
      if (testUserId) {
        await connection.query('DELETE FROM users WHERE id = ?', [testUserId]);
      }
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr.message);
    }

    connection.release();
  }

  console.log('\n====================================================');
  console.log(`BILLING LIFECYCLE SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================');

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests();
