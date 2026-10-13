/**
 * Verification Test Suite: Admin Billing Synchronization & Cross-Portal Consistency
 * 
 * Verifies:
 * 1. Repair completion auto-creates exactly one Draft Invoice linked to the ticket.
 * 2. Repeated status updates / retries do not create duplicate invoices.
 * 3. Admin getInvoices fetches all invoices without user ID restriction, with ticketNumber joined.
 * 4. Customers & Companies cannot view Draft invoices via getInvoices or getInvoiceById.
 * 5. Draft invoices are strictly non-payable (create-order, offline-payment, payInvoice rejected with 400).
 * 6. Invoice editing updates line items without altering technician estimated_cost or diagnosis.
 * 7. finalizeInvoice marks invoice Final, synchronizes repair_cost, and enables payment eligibility.
 * 8. Payment settlement settles both ticket and invoice to Paid.
 * 9. getRepairRequestById and getRepairRequests return synchronized invoice details.
 * 10. Technician cannot modify or finalize commercial invoices.
 */

const { pool } = require('../config/db.config');
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

function mockReqRes(body = {}, params = {}, user = { id: 1, role: 'admin' }, query = {}) {
  let responseData = null;
  let statusCode = 200;

  const req = {
    body,
    params,
    query,
    user,
    headers: {},
    ip: '127.0.0.1'
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
  console.log('\n=== Starting Admin Billing Synchronization Audit & Test Suite ===\n');

  let adminUser, techUser, custUser, compUser;
  let testTicketId, testInvoiceId;

  try {
    // 1. Setup test users
    const [adminRows] = await pool.query("SELECT id, email, role FROM users WHERE role = 'admin' LIMIT 1");
    if (adminRows.length === 0) throw new Error('No admin user found');
    adminUser = adminRows[0];

    const [techRows] = await pool.query("SELECT id, email, role FROM users WHERE role = 'technician' LIMIT 1");
    if (techRows.length === 0) throw new Error('No technician user found');
    techUser = techRows[0];

    const [custRows] = await pool.query("SELECT id, email, role FROM users WHERE role = 'customer' LIMIT 1");
    if (custRows.length === 0) throw new Error('No customer user found');
    custUser = custRows[0];

    const [compRows] = await pool.query("SELECT id, email, role FROM users WHERE role = 'company' LIMIT 1");
    if (compRows.length > 0) compUser = compRows[0];
    else compUser = { id: 99999, email: 'fake_comp@tekdoctor.in', role: 'company' };

    console.log(`[Setup] Admin ID: ${adminUser.id}, Tech ID: ${techUser.id}, Customer ID: ${custUser.id}`);

    // Create a fresh test repair ticket
    const ticketNum = `TD-SYNC-${Date.now()}`;
    const [ticketInsert] = await pool.query(`
      INSERT INTO service_requests (
        user_id, customer_name, mobile, email, brand, model_number,
        device_category, problem_type, problem_description, status,
        assigned_technician_id, estimated_cost, diagnosis,
        customer_approval_status, payment_status, ticket_number
      ) VALUES (?, 'Sync Test Customer', '9876543210', ?, 'Dell', 'XPS 15',
                'Laptop', 'Display Glitch', 'Screen flicker under load', 'in_progress',
                ?, 4500.00, 'Faulty display cable and ribbon',
                'approved', 'unpaid', ?)
    `, [custUser.id, custUser.email, techUser.id, ticketNum]);

    testTicketId = ticketInsert.insertId;
    console.log(`[Setup] Created Test Ticket #${ticketNum} (ID: ${testTicketId})`);

    // ── Test 1: Ticket Completion Creates Exactly One Draft Invoice ──────────
    console.log('\n--- 1. Ticket Completion Auto-Creates Draft Invoice ---');
    {
      const { req, res } = mockReqRes({ status: 'completed' }, { id: testTicketId }, adminUser);
      await repairController.updateRequestStatus(req, res, (err) => { if (err) throw err; });

      assert(res.getStatusCode() === 200, 'Status updated to completed returned HTTP 200');

      const [invs] = await pool.query('SELECT * FROM invoices WHERE ticket_id = ?', [testTicketId]);
      assert(invs.length === 1, `Exactly 1 invoice created for ticket (found ${invs.length})`);
      testInvoiceId = invs[0]?.id;
      assert(invs[0]?.status === 'Draft', `Invoice status is 'Draft' (actual: ${invs[0]?.status})`);
      assert(parseFloat(invs[0]?.original_estimate) === 4500.00, `Original estimate preserved as ₹4500 (actual: ${invs[0]?.original_estimate})`);
      assert(parseFloat(invs[0]?.subtotal) === 4500.00, `Subtotal initialized to estimate ₹4500 (actual: ${invs[0]?.subtotal})`);
      assert(parseFloat(invs[0]?.tax_amount) === 810.00, `18% GST initialized as ₹810 (actual: ${invs[0]?.tax_amount})`);
      assert(parseFloat(invs[0]?.amount) === 5310.00, `Grand total initialized as ₹5310 (actual: ${invs[0]?.amount})`);
    }

    // ── Test 2: Idempotency & Duplicate Prevention ────────────────────────────
    console.log('\n--- 2. Duplicate Prevention On Retries & Re-reads ---');
    {
      // Retry status update to completed
      const { req: retryReq, res: retryRes } = mockReqRes({ status: 'completed' }, { id: testTicketId }, adminUser);
      await repairController.updateRequestStatus(retryReq, retryRes, (err) => { if (err) throw err; });
      assert(retryRes.getStatusCode() === 200, 'Duplicate status update to completed succeeded');

      const [invsAfterRetry] = await pool.query('SELECT * FROM invoices WHERE ticket_id = ?', [testTicketId]);
      assert(invsAfterRetry.length === 1, `Still exactly 1 invoice after repeated status update (found ${invsAfterRetry.length})`);

      // Re-read via getRepairRequestById
      const { req: getReq, res: getRes } = mockReqRes({}, { id: testTicketId }, adminUser);
      await repairController.getRepairRequestById(getReq, getRes, (err) => { if (err) throw err; });
      assert(getRes.getStatusCode() === 200, 'getRepairRequestById succeeded');
      const ticketData = getRes.getData()?.data;
      assert(ticketData?.invoiceId === testInvoiceId, `getRepairRequestById returned correct invoiceId ${testInvoiceId}`);
      assert(ticketData?.invoiceStatus === 'Draft', `getRepairRequestById returned invoiceStatus 'Draft'`);

      const [invsAfterGet] = await pool.query('SELECT * FROM invoices WHERE ticket_id = ?', [testTicketId]);
      assert(invsAfterGet.length === 1, `Still exactly 1 invoice after getRepairRequestById read`);
    }

    // ── Test 3: Admin getInvoices Fetches All Invoices (Not Blocked by Admin ID)
    console.log('\n--- 3. Admin getInvoices Synchronization ---');
    {
      const { req, res } = mockReqRes({}, {}, adminUser, {});
      await billingController.getInvoices(req, res, (err) => { if (err) throw err; });

      assert(res.getStatusCode() === 200, 'Admin getInvoices returned HTTP 200');
      const allInvoices = res.getData()?.data || [];
      assert(Array.isArray(allInvoices) && allInvoices.length > 0, `Admin sees all system invoices (count: ${allInvoices.length})`);

      const foundTestInv = allInvoices.find(inv => inv.id === testInvoiceId);
      assert(Boolean(foundTestInv), `Admin invoices list includes test invoice ${testInvoiceId}`);
      assert(foundTestInv?.ticketNumber === ticketNum, `Invoice list includes ticketNumber '${ticketNum}'`);
      assert(foundTestInv?.ticketId === testTicketId, `Invoice list includes ticketId '${testTicketId}'`);
      assert(foundTestInv?.deviceBrand === 'Dell', `Invoice list includes deviceBrand 'Dell'`);
    }

    // ── Test 4: Customer & Company Cannot See Draft Invoices ──────────────────
    console.log('\n--- 4. Customer & Company Draft Invoice Isolation ---');
    {
      // Customer getInvoices
      const { req: custReq, res: custRes } = mockReqRes({}, {}, custUser, {});
      await billingController.getInvoices(custReq, custRes, (err) => { if (err) throw err; });
      assert(custRes.getStatusCode() === 200, 'Customer getInvoices returned HTTP 200');
      const custInvoices = custRes.getData()?.data || [];
      const custFoundDraft = custInvoices.find(inv => inv.id === testInvoiceId);
      assert(!custFoundDraft, 'Draft invoice is strictly excluded from customer invoices list');

      // Customer getInvoiceById on Draft invoice
      const { req: getInvReq, res: getInvRes } = mockReqRes({}, { id: testInvoiceId }, custUser);
      await billingController.getInvoiceById(getInvReq, getInvRes, (err) => { if (err) throw err; });
      assert(getInvRes.getStatusCode() === 403, 'Customer direct getInvoiceById on Draft invoice returned HTTP 403 Forbidden');

      // Company direct getInvoiceById on Draft invoice
      const { req: compInvReq, res: compInvRes } = mockReqRes({}, { id: testInvoiceId }, compUser);
      await billingController.getInvoiceById(compInvReq, compInvRes, (err) => { if (err) throw err; });
      assert(compInvRes.getStatusCode() === 403, 'Company direct getInvoiceById on Draft invoice returned HTTP 403 Forbidden');
    }

    // ── Test 5: Draft Invoices Are Strictly Non-Payable ───────────────────────
    console.log('\n--- 5. Draft Invoice Payment Security ---');
    {
      // 5a. createPaymentOrder with { invoiceId: testInvoiceId }
      const { req: orderReq, res: orderRes } = mockReqRes({ invoiceId: testInvoiceId }, {}, custUser);
      await billingController.createPaymentOrder(orderReq, orderRes, (err) => { if (err) throw err; });
      assert(orderRes.getStatusCode() === 400, `Online checkout blocked for Draft invoice (HTTP ${orderRes.getStatusCode()})`);
      assert(String(orderRes.getData()?.message).includes('Draft'), 'Error message informs invoice is in Draft review');

      // 5b. initiateOfflinePayment with { invoiceId: testInvoiceId }
      const { req: offReq, res: offRes } = mockReqRes({ invoiceId: testInvoiceId, paymentMethod: 'cash' }, {}, custUser);
      await billingController.initiateOfflinePayment(offReq, offRes, (err) => { if (err) throw err; });
      assert(offRes.getStatusCode() === 400, `Offline payment initiation blocked for Draft invoice (HTTP ${offRes.getStatusCode()})`);

      // 5c. payInvoice direct settlement
      const { req: payReq, res: payRes } = mockReqRes({ invoiceId: testInvoiceId, paymentMethod: 'cash' }, {}, adminUser);
      await billingController.payInvoice(payReq, payRes, (err) => { if (err) throw err; });
      assert(payRes.getStatusCode() === 400, `Direct settlement payInvoice blocked for Draft invoice (HTTP ${payRes.getStatusCode()})`);
    }

    // ── Test 6: Draft Invoice Edits Do Not Overwrite Technician Estimate ──────
    console.log('\n--- 6. Draft Invoice Line Item Editing & Estimate Separation ---');
    {
      const updatedLines = [
        { description: 'OEM Display Screen Replacement', quantity: 1, unitPrice: 3800.00, total: 3800.00, taxRate: 18.00 },
        { description: 'Labor & Calibration Fee', quantity: 1, unitPrice: 700.00, total: 700.00, taxRate: 18.00 }
      ];

      const { req: editReq, res: editRes } = mockReqRes({
        clientName: 'Sync Test Customer (Revised)',
        lineItems: updatedLines,
        notes: 'Commercial lines adjusted by admin'
      }, { id: testInvoiceId }, adminUser);

      await billingController.updateInvoice(editReq, editRes, (err) => { if (err) throw err; });
      assert(editRes.getStatusCode() === 200, 'Admin updateInvoice succeeded (HTTP 200)');
      assert(parseFloat(editRes.getData()?.data?.amount) === 5310.00, `Recalculated grand total matches ₹5310.00`);

      // Verify technician estimate & diagnosis on service_requests was NOT overwritten
      const [ticketCheck] = await pool.query('SELECT estimated_cost, diagnosis, customer_approval_status FROM service_requests WHERE id = ?', [testTicketId]);
      assert(parseFloat(ticketCheck[0].estimated_cost) === 4500.00, `Technician estimate remains unchanged at ₹4500.00`);
      assert(ticketCheck[0].diagnosis === 'Faulty display cable and ribbon', `Technician diagnosis remains intact`);
      assert(ticketCheck[0].customer_approval_status === 'approved', `Approval status preserved`);
    }

    // ── Test 7: Finalize Invoice & Synchronize Ticket Payable Cost ─────────────
    console.log('\n--- 7. Finalize Invoice & Payment Eligibility ---');
    {
      const { req: finReq, res: finRes } = mockReqRes({}, { id: testInvoiceId }, adminUser);
      await billingController.finalizeInvoice(finReq, finRes, (err) => { if (err) throw err; });

      assert(finRes.getStatusCode() === 200, 'Admin finalizeInvoice succeeded (HTTP 200)');
      assert(finRes.getData()?.data?.status === 'Final', `Invoice status updated to 'Final'`);

      // Verify repair_cost on ticket was synchronized to commercial total
      const [ticketCheck] = await pool.query('SELECT repair_cost, estimated_cost, status FROM service_requests WHERE id = ?', [testTicketId]);
      assert(parseFloat(ticketCheck[0].repair_cost) === 5310.00, `Ticket repair_cost synchronized to commercial total ₹5310.00`);
      assert(parseFloat(ticketCheck[0].estimated_cost) === 4500.00, `Technician estimate remains separate at ₹4500.00`);
      assert(ticketCheck[0].status === 'completed', `Ticket status preserved as 'completed'`);

      // Check payment eligibility now passes for finalized invoice
      const { req: eligReq, res: eligRes } = mockReqRes({}, { ticketId: testTicketId }, custUser);
      await billingController.getPaymentEligibility(eligReq, eligRes, (err) => { if (err) throw err; });
      assert(eligRes.getStatusCode() === 200, 'Ticket payment eligibility is now true after invoice finalization');
      assert(eligRes.getData()?.data?.eligible === true, 'Eligible flag is true');
      assert(parseFloat(eligRes.getData()?.data?.amount) === 5310.00, `Payable amount equals commercial total ₹5310.00`);
    }

    // ── Test 8: Payment Settlement Across Invoices & Tickets ───────────────────
    console.log('\n--- 8. Payment Settlement Synchronization ---');
    {
      const simPaymentId = `PAY-SYNC-${Date.now()}`;
      const simOrderId = `ORD-SYNC-${Date.now()}`;

      // Simulate payment verification settle
      const { req: payReq, res: payRes } = mockReqRes({
        ticketId: testTicketId,
        invoiceId: testInvoiceId,
        paymentId: simPaymentId,
        orderId: simOrderId,
        paymentMethod: 'cash',
        action: 'verify'
      }, {}, adminUser);

      // Verify direct offline payment settlement endpoint
      await billingController.payInvoice(mockReqRes({ invoiceId: testInvoiceId, paymentMethod: 'cash' }, {}, adminUser).req, payRes, (err) => { if (err) throw err; });
      assert(payRes.getStatusCode() === 200, 'payInvoice settlement succeeded for Final invoice (HTTP 200)');

      // Verify both invoice and ticket are now Paid
      const [invCheck] = await pool.query('SELECT status, payment_id FROM invoices WHERE id = ?', [testInvoiceId]);
      assert(invCheck[0].status === 'Paid', `Invoice status is 'Paid'`);
      assert(Boolean(invCheck[0].payment_id), `Invoice payment_id recorded`);

      const [tkCheck] = await pool.query('SELECT payment_status, payment_id FROM service_requests WHERE id = ?', [testTicketId]);
      assert(tkCheck[0].payment_status === 'paid', `Ticket payment_status is 'paid'`);
      assert(Boolean(tkCheck[0].payment_id), `Ticket payment_id recorded`);
    }

    // ── Test 9: getRepairRequests Returns Synchronized State ──────────────────
    console.log('\n--- 9. Ticket List getRepairRequests Invoice Join ---');
    {
      const { req: listReq, res: listRes } = mockReqRes({}, {}, adminUser, { search: ticketNum });
      await repairController.getRepairRequests(listReq, listRes, (err) => { if (err) throw err; });
      assert(listRes.getStatusCode() === 200, 'getRepairRequests returned HTTP 200');
      const tickets = listRes.getData()?.data?.data || listRes.getData()?.data?.requests || [];
      const found = tickets.find(t => t.ticketNumber === ticketNum);
      assert(Boolean(found), `Found ticket ${ticketNum} in paginated search`);
      assert(found?.invoiceId === testInvoiceId, `getRepairRequests returned joined invoiceId ${testInvoiceId}`);
      assert(found?.invoiceStatus === 'Paid', `getRepairRequests returned joined invoiceStatus 'Paid'`);
    }

    // ── Test 10: Technician Cannot Modify or Finalize Invoices ─────────────────
    console.log('\n--- 10. Technician Commercial Invoice Restrictions ---');
    {
      const { req: techCreateReq, res: techCreateRes } = mockReqRes({ clientName: 'Illegal' }, {}, techUser);
      await billingController.createInvoice(techCreateReq, techCreateRes, (err) => { if (err) throw err; });
      assert(techCreateRes.getStatusCode() === 403, 'Technician createInvoice returns HTTP 403');

      const { req: techUpdateReq, res: techUpdateRes } = mockReqRes({ clientName: 'Illegal' }, { id: testInvoiceId }, techUser);
      await billingController.updateInvoice(techUpdateReq, techUpdateRes, (err) => { if (err) throw err; });
      assert(techUpdateRes.getStatusCode() === 403, 'Technician updateInvoice returns HTTP 403');

      const { req: techFinReq, res: techFinRes } = mockReqRes({}, { id: testInvoiceId }, techUser);
      await billingController.finalizeInvoice(techFinReq, techFinRes, (err) => { if (err) throw err; });
      assert(techFinRes.getStatusCode() === 403, 'Technician finalizeInvoice returns HTTP 403');
    }

    // ── Test 11: Real Concurrent Completion Stress Test ───────────────────────
    console.log('\n--- 11. Real Concurrent Completion Stress Test (5 Parallel Calls) ---');
    let concTicketId = null;
    try {
      const concTicketNum = `TD-CONC-${Date.now()}`;
      const [concInsert] = await pool.query(`
        INSERT INTO service_requests (
          user_id, customer_name, mobile, email, brand, model_number,
          device_category, problem_type, problem_description, status,
          assigned_technician_id, estimated_cost, diagnosis,
          customer_approval_status, payment_status, ticket_number
        ) VALUES (?, 'Concurrency Tester', '9876543210', ?, 'HP', 'Spectre',
                  'Laptop', 'Battery', 'Battery drains quickly', 'in_progress',
                  ?, 3200.00, 'Battery cell degradation',
                  'approved', 'unpaid', ?)
      `, [custUser.id, custUser.email, techUser.id, concTicketNum]);
      concTicketId = concInsert.insertId;

      // Fire 5 simultaneous completion requests
      const concPromises = Array.from({ length: 5 }, () => {
        const { req, res } = mockReqRes({ status: 'completed' }, { id: concTicketId }, adminUser);
        return repairController.updateRequestStatus(req, res, (err) => { if (err) throw err; })
          .then(() => res);
      });

      const concResults = await Promise.all(concPromises);
      const allSucceeded = concResults.every(r => r.getStatusCode() === 200);
      assert(allSucceeded, 'All 5 concurrent completion requests completed with HTTP 200 without deadlocks');

      const [concInvs] = await pool.query('SELECT id, status, is_active FROM invoices WHERE ticket_id = ?', [concTicketId]);
      assert(concInvs.length === 1, `Exactly 1 active Draft invoice created under concurrency (found ${concInvs.length})`);
      assert(concInvs[0]?.status === 'Draft', `Created concurrent invoice has status 'Draft'`);
    } finally {
      if (concTicketId) {
        await pool.query('DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE ticket_id = ?)', [concTicketId]);
        await pool.query('DELETE FROM invoices WHERE ticket_id = ?', [concTicketId]);
        await pool.query('DELETE FROM service_requests WHERE id = ?', [concTicketId]);
      }
    }

    // ── Test 12: Safe Read Endpoint Verification (Zero Side-Effects) ───────────
    console.log('\n--- 12. Safe Read Endpoint Verification (Zero Side Effects on GET) ---');
    let legacyTicketId = null;
    try {
      const legacyNum = `TD-LEGACY-${Date.now()}`;
      const [legInsert] = await pool.query(`
        INSERT INTO service_requests (
          user_id, customer_name, mobile, email, brand, model_number,
          device_category, problem_type, problem_description, status,
          assigned_technician_id, estimated_cost, diagnosis,
          customer_approval_status, payment_status, ticket_number
        ) VALUES (?, 'Legacy Completed Customer', '9876543210', ?, 'Apple', 'MacBook',
                  'Laptop', 'Trackpad', 'Click mechanism unresponsive', 'completed',
                  ?, 4000.00, 'Replaced trackpad sensor',
                  'approved', 'unpaid', ?)
      `, [custUser.id, custUser.email, techUser.id, legacyNum]);
      legacyTicketId = legInsert.insertId;

      // Ensure no invoice exists currently
      const [preInvCheck] = await pool.query('SELECT COUNT(*) as count FROM invoices WHERE ticket_id = ?', [legacyTicketId]);
      assert(preInvCheck[0].count === 0, 'No invoice exists initially for legacy completed ticket');

      // Call getRepairRequestById multiple times
      for (let i = 0; i < 3; i++) {
        const { req: legReq, res: legRes } = mockReqRes({}, { id: legacyTicketId }, adminUser);
        await repairController.getRepairRequestById(legReq, legRes, (err) => { if (err) throw err; });
        assert(legRes.getStatusCode() === 200, `getRepairRequestById read ${i + 1} succeeded with HTTP 200`);
        assert(legRes.getData()?.data?.invoiceId === null, `Read response reports invoiceId as null`);
      }

      // Verify that ZERO invoices were inserted as a side effect
      const [postInvCheck] = await pool.query('SELECT COUNT(*) as count FROM invoices WHERE ticket_id = ?', [legacyTicketId]);
      assert(postInvCheck[0].count === 0, 'Zero invoices inserted after multiple reads (read endpoint is pure and side-effect-free)');
    } finally {
      if (legacyTicketId) {
        await pool.query('DELETE FROM service_requests WHERE id = ?', [legacyTicketId]);
      }
    }

    // ── Test 13: Manual Duplicate Invoice Creation Prevention ─────────────────
    console.log('\n--- 13. Duplicate Manual Invoice Creation Prevention ---');
    {
      // Attempt to manually create an invoice for testTicketId, which already has testInvoiceId
      const { req: dupInvReq, res: dupInvRes } = mockReqRes({
        clientName: 'Duplicate Test',
        ticketId: testTicketId,
        userId: custUser.id,
        items: [{ description: 'Illegal extra invoice', quantity: 1, unit_price: 1000, tax_rate: 18 }]
      }, {}, adminUser);

      await billingController.createInvoice(dupInvReq, dupInvRes, (err) => { if (err) throw err; });
      assert(dupInvRes.getStatusCode() === 400, 'createInvoice rejected duplicate invoice for ticket with HTTP 400');
      assert(dupInvRes.getData()?.message?.includes('already linked'), 'Error message informs an active invoice is already linked to this repair ticket');
    }

  } catch (err) {
    console.error('Test suite uncaught error:', err);
    testsFailed++;
  } finally {
    // Cleanup test artifacts
    if (testTicketId) {
      try {
        await pool.query('DELETE FROM payments WHERE ticket_id = ? OR invoice_id = ?', [testTicketId, testInvoiceId || '']);
        await pool.query('DELETE FROM invoice_line_items WHERE invoice_id = ?', [testInvoiceId || '']);
        await pool.query('DELETE FROM invoices WHERE ticket_id = ? OR id = ?', [testTicketId, testInvoiceId || '']);
        await pool.query('DELETE FROM service_requests WHERE id = ?', [testTicketId]);
        console.log('\n[Cleanup] Test ticket and invoice cleaned up.');
      } catch (cleanErr) {
        console.error('Cleanup error:', cleanErr.message);
      }
    }

    console.log(`\n========================================`);
    console.log(`Test Results: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log(`========================================\n`);

    if (testsFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTests();
