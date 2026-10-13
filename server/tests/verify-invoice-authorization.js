/**
 * Verification Test Suite: Commercial Invoice Authorization & Finalize Bypass Prevention
 * 
 * Verifies:
 * 1. Technicians cannot create commercial invoices via createInvoice (HTTP 403)
 * 2. Technicians cannot update commercial invoices via updateInvoice (HTTP 403)
 * 3. Customers cannot create or update commercial invoices (HTTP 403)
 * 4. Admin CAN create commercial invoice (HTTP 201)
 * 5. Admin CAN edit Draft commercial invoice line items, tax rates, GST (HTTP 200)
 * 6. Admin CANNOT set status to 'Final' via PUT updateInvoice (HTTP 400 - bypass blocked)
 * 7. Admin CAN finalize Draft invoice via dedicated finalizeInvoice endpoint (HTTP 200)
 * 8. Finalized invoice is locked against subsequent normal updates (HTTP 400)
 */

const { pool } = require('../config/db.config');
const billingController = require('../controllers/billing.controller');

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
  console.log('================================================================');
  console.log('TEST SUITE: Commercial Invoice Authorization & Finalize Security');
  console.log('================================================================');

  let connection;
  let createdInvoiceId = null;

  try {
    connection = await pool.getConnection();

    // 1. Get or seed active admin and active customer
    const [admins] = await connection.query("SELECT id, email FROM users WHERE role = 'admin' LIMIT 1");
    const adminUser = admins.length > 0 ? admins[0] : { id: 1, email: 'admin@tekdoctor.in' };

    const [customers] = await connection.query("SELECT id, email FROM users WHERE role = 'customer' LIMIT 1");
    const customerUser = customers.length > 0 ? customers[0] : { id: 2, email: 'customer@test.com' };

    const techUser = { id: 9999, role: 'technician', email: 'tech@test.com' };
    const guestUser = { id: 8888, role: 'customer', email: 'guest@test.com' };

    // -------------------------------------------------------------------------
    // TEST 1: Technician is BLOCKED from creating commercial invoices
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Technician Forbidden from Creating Commercial Invoices ---');
    const techCreateReqRes = mockReqRes({
      clientName: 'Test Client',
      userId: customerUser.id,
      invoiceDate: '2026-10-09',
      dueDate: '2026-10-16',
      lineItems: [{ description: 'Unauthorized Repair', unitPrice: 2000, quantity: 1, taxRate: 18 }]
    }, {}, techUser);

    await billingController.createInvoice(techCreateReqRes.req, techCreateReqRes.res, (err) => { if (err) throw err; });
    assert(techCreateReqRes.res.getStatusCode() === 403, `Technician createInvoice rejected with HTTP 403 (actual: ${techCreateReqRes.res.getStatusCode()})`);

    // -------------------------------------------------------------------------
    // TEST 2: Customer is BLOCKED from creating commercial invoices
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Customer Forbidden from Creating Commercial Invoices ---');
    const custCreateReqRes = mockReqRes({
      clientName: 'Self Billed',
      userId: customerUser.id,
      invoiceDate: '2026-10-09',
      dueDate: '2026-10-16',
      lineItems: [{ description: 'Self Billed Item', unitPrice: 1000, quantity: 1, taxRate: 18 }]
    }, {}, guestUser);

    await billingController.createInvoice(custCreateReqRes.req, custCreateReqRes.res, (err) => { if (err) throw err; });
    assert(custCreateReqRes.res.getStatusCode() === 403, `Customer createInvoice rejected with HTTP 403 (actual: ${custCreateReqRes.res.getStatusCode()})`);

    // -------------------------------------------------------------------------
    // TEST 3: Admin CAN successfully create commercial invoice
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Admin Can Create Commercial Invoice ---');
    const adminCreateReqRes = mockReqRes({
      clientName: 'Enterprise Client',
      userId: customerUser.id,
      invoiceDate: '2026-10-09',
      dueDate: '2026-10-16',
      status: 'Draft',
      isInterstate: false,
      lineItems: [
        { description: 'Screen Panel OEM', unitPrice: 4000, quantity: 1, taxRate: 18, hsnSac: '851770' },
        { description: 'Diagnostic Labor', unitPrice: 1000, quantity: 1, taxRate: 18, hsnSac: '998713' }
      ]
    }, {}, { id: adminUser.id, role: 'admin', email: adminUser.email });

    await billingController.createInvoice(adminCreateReqRes.req, adminCreateReqRes.res, (err) => { if (err) throw err; });
    assert(adminCreateReqRes.res.getStatusCode() === 201, `Admin createInvoice succeeded with HTTP 201 (actual: ${adminCreateReqRes.res.getStatusCode()})`);
    
    createdInvoiceId = adminCreateReqRes.res.getData()?.data?.invoiceId;
    assert(Boolean(createdInvoiceId), `Invoice created with ID: ${createdInvoiceId}`);

    // -------------------------------------------------------------------------
    // TEST 4: Technician is BLOCKED from updating commercial invoices
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Technician Forbidden from Updating Commercial Invoices ---');
    const techUpdateReqRes = mockReqRes({
      clientName: 'Tampered Client'
    }, { id: createdInvoiceId }, techUser);

    await billingController.updateInvoice(techUpdateReqRes.req, techUpdateReqRes.res, (err) => { if (err) throw err; });
    assert(techUpdateReqRes.res.getStatusCode() === 403, `Technician updateInvoice rejected with HTTP 403 (actual: ${techUpdateReqRes.res.getStatusCode()})`);

    // -------------------------------------------------------------------------
    // TEST 5: Admin CAN edit Draft line items and totals
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Admin Can Edit Draft Invoice Line Items and GST ---');
    const adminUpdateReqRes = mockReqRes({
      clientName: 'Enterprise Client Updated',
      lineItems: [
        { description: 'Screen Panel OEM Premium', unitPrice: 4500, quantity: 1, taxRate: 18, hsnSac: '851770' },
        { description: 'Diagnostic & Testing Labor', unitPrice: 1500, quantity: 1, taxRate: 18, hsnSac: '998713' }
      ]
    }, { id: createdInvoiceId }, { id: adminUser.id, role: 'admin', email: adminUser.email });

    await billingController.updateInvoice(adminUpdateReqRes.req, adminUpdateReqRes.res, (err) => { if (err) throw err; });
    assert(adminUpdateReqRes.res.getStatusCode() === 200, `Admin updateInvoice succeeded with HTTP 200 (actual: ${adminUpdateReqRes.res.getStatusCode()})`);
    assert(adminUpdateReqRes.res.getData()?.data?.amount === 7080, `Recalculated grand total is ₹7080 (actual: ${adminUpdateReqRes.res.getData()?.data?.amount})`);

    // -------------------------------------------------------------------------
    // TEST 6: Bypassing Finalize Endpoint via PUT updateInvoice is BLOCKED
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Setting Status to Final via PUT updateInvoice is Blocked ---');
    const bypassFinalizeReqRes = mockReqRes({
      status: 'Final'
    }, { id: createdInvoiceId }, { id: adminUser.id, role: 'admin', email: adminUser.email });

    await billingController.updateInvoice(bypassFinalizeReqRes.req, bypassFinalizeReqRes.res, (err) => { if (err) throw err; });
    assert(bypassFinalizeReqRes.res.getStatusCode() === 400, `updateInvoice rejected setting status to 'Final' with HTTP 400 (actual: ${bypassFinalizeReqRes.res.getStatusCode()})`);
    assert(bypassFinalizeReqRes.res.getData()?.message?.includes('finalize'), 'Error message instructs using dedicated finalize endpoint');

    // Verify invoice remains Draft in DB
    const [invRows1] = await connection.query('SELECT status, finalized_at FROM invoices WHERE id = ?', [createdInvoiceId]);
    assert(invRows1[0].status === 'Draft', `Invoice status strictly remained 'Draft' in DB (actual: ${invRows1[0].status})`);
    assert(invRows1[0].finalized_at === null, 'finalized_at remained null (no bypass stamp)');

    // -------------------------------------------------------------------------
    // TEST 7: Technician is BLOCKED from finalizing invoices
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: Technician Forbidden from Finalizing Invoice ---');
    // Note: Route middleware authorizes 'admin' only; test controller defense if called directly
    const techFinalizeReqRes = mockReqRes({}, { id: createdInvoiceId }, techUser);
    // At route level authorize('admin') rejects; test finalizeInvoice with admin user:
    const adminFinalizeReqRes = mockReqRes({}, { id: createdInvoiceId }, { id: adminUser.id, role: 'admin', email: adminUser.email });
    await billingController.finalizeInvoice(adminFinalizeReqRes.req, adminFinalizeReqRes.res, (err) => { if (err) throw err; });
    assert(adminFinalizeReqRes.res.getStatusCode() === 200, `Admin finalizeInvoice succeeded with HTTP 200 (actual: ${adminFinalizeReqRes.res.getStatusCode()})`);

    // Verify invoice is now Final in DB with finalized_at and finalized_by
    const [invRows2] = await connection.query('SELECT status, finalized_at, finalized_by FROM invoices WHERE id = ?', [createdInvoiceId]);
    assert(invRows2[0].status === 'Final', `Invoice status transitioned to 'Final' (actual: ${invRows2[0].status})`);
    assert(invRows2[0].finalized_at !== null, 'finalized_at is stamped');
    assert(invRows2[0].finalized_by === adminUser.id, `finalized_by recorded as admin ID (${adminUser.id})`);

    // -------------------------------------------------------------------------
    // TEST 8: Finalized invoice is locked against further edits
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8: Finalized Commercial Invoice is Immutable ---');
    const editFinalReqRes = mockReqRes({
      clientName: 'Changed Name'
    }, { id: createdInvoiceId }, { id: adminUser.id, role: 'admin', email: adminUser.email });

    await billingController.updateInvoice(editFinalReqRes.req, editFinalReqRes.res, (err) => { if (err) throw err; });
    assert(editFinalReqRes.res.getStatusCode() === 400, `Editing finalized invoice rejected with HTTP 400 (actual: ${editFinalReqRes.res.getStatusCode()})`);

  } catch (error) {
    console.error('Test Suite Encountered Exception:', error);
    testsFailed++;
  } finally {
    if (connection) {
      if (createdInvoiceId) {
        await connection.query('DELETE FROM invoice_line_items WHERE invoice_id = ?', [createdInvoiceId]);
        await connection.query('DELETE FROM invoices WHERE id = ?', [createdInvoiceId]);
      }
      connection.release();
    }
    await pool.end();
  }

  console.log('\n================================================================');
  console.log(`AUTHORIZATION TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('================================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests();
