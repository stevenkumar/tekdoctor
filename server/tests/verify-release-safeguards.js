/**
 * Verification Test Suite: Payment Visibility, Release Notifications & Shared Bill Integrity
 * 
 * Verifies:
 * 1. Draft & Void invoices reject online order creation, offline payment, and direct payment.
 * 2. Public tracking endpoint (/api/repair-request/track/:id) reports authoritative invoice state.
 * 3. Finalize & release workflow dispatches in-app notifications to all relevant recipients
 *    (including distinct company user IDs for company tickets).
 * 4. Canonical bill receipt endpoint (/api/billing/receipt/:id) returns exact authoritative totals,
 *    line items, GST breakdown, and business metadata consumed by the shared bill generator.
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
  console.log('\n============================================================');
  console.log('TEST SUITE: Release Safeguards, Tracking & Shared Bill Format');
  console.log('============================================================\n');

  let adminUser, custUser, compManagerUser, compEmployeeUser, techUser;
  let testTicketId1, testInvoiceId1, testTicketNumber1;
  let testTicketId2, testInvoiceId2, testTicketNumber2;

  try {
    // 1. Setup users
    const [adminRows] = await pool.query("SELECT id, email, role FROM users WHERE role = 'admin' LIMIT 1");
    if (adminRows.length === 0) throw new Error('No admin user found');
    adminUser = adminRows[0];

    const [techRows] = await pool.query("SELECT id, email, role FROM users WHERE role = 'technician' LIMIT 1");
    techUser = techRows.length > 0 ? techRows[0] : adminUser;

    const ts = Date.now().toString().slice(-6);
    const [custRes] = await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES (?, ?, 'Hash123!', 'customer', 1)`,
      [`Customer Safe ${ts}`, `cust.sf.${ts}@test.com`]
    );
    custUser = { id: custRes.insertId, email: `cust.sf.${ts}@test.com`, role: 'customer' };

    const [mgrRes] = await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES (?, ?, 'Hash123!', 'company', 1)`,
      [`Company Mgr ${ts}`, `comp.mgr.${ts}@test.com`]
    );
    compManagerUser = { id: mgrRes.insertId, email: `comp.mgr.${ts}@test.com`, role: 'company' };

    const [empRes] = await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES (?, ?, 'Hash123!', 'customer', 1)`,
      [`Company Employee ${ts}`, `comp.emp.${ts}@test.com`]
    );
    compEmployeeUser = { id: empRes.insertId, email: `comp.emp.${ts}@test.com`, role: 'customer' };

    // --- TEST GROUP 1: Individual Ticket & Draft Payment Rejections ---
    console.log('--- Test Group 1: Draft Invoice Payment Blocking across Endpoints ---');
    testTicketNumber1 = `TD-SF-${ts}-1`;
    const [t1Res] = await pool.query(
      `INSERT INTO service_requests (
        user_id, ticket_number, customer_name, email, mobile, device_category,
        brand, model_number, problem_description, status, customer_approval_status,
        assigned_technician_id, estimated_cost, repair_cost
      ) VALUES (?, ?, ?, ?, ?, 'Laptop', 'Lenovo', 'ThinkPad T14', 'Battery replacement', 'completed', 'approved', ?, 3500.00, 3500.00)`,
      [custUser.id, testTicketNumber1, 'Safe Test Customer', custUser.email, '9998887771', techUser.id]
    );
    testTicketId1 = t1Res.insertId;

    // Short invoice ID <= 20 chars
    testInvoiceId1 = `inv-s1-${ts}`;
    await pool.query(
      `INSERT INTO invoices (
        id, user_id, ticket_id, client_name, amount, subtotal, tax_amount,
        cgst_amount, sgst_amount, is_interstate, status, invoice_date, due_date, is_active
      ) VALUES (?, ?, ?, ?, 4130.00, 3500.00, 630.00, 315.00, 315.00, 0, 'Draft', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY), 1)`,
      [testInvoiceId1, custUser.id, testTicketId1, 'Safe Test Customer']
    );
    await pool.query(
      `INSERT INTO invoice_line_items (invoice_id, description, hsn_sac, quantity, unit_price, tax_rate, tax_amount, total)
       VALUES (?, 'Genuine Lenovo Battery', '850760', 1, 3500.00, 18.00, 630.00, 3500.00)`,
      [testInvoiceId1]
    );

    // 1.1 Online payment order creation blocked for Draft
    const ordReqRes = mockReqRes({ invoiceId: testInvoiceId1, amount: 4130.00 }, {}, custUser);
    await billingController.createPaymentOrder(ordReqRes.req, ordReqRes.res, (err) => { if (err) throw err; });
    assert(ordReqRes.res.getStatusCode() === 400, `createPaymentOrder rejects Draft invoice with HTTP 400 (actual: ${ordReqRes.res.getStatusCode()})`);
    assert(String(ordReqRes.res.getData()?.message || '').toLowerCase().includes('draft'), 'createPaymentOrder message explains invoice is in Draft review');

    // 1.2 Offline payment initiation blocked for Draft
    const offReqRes = mockReqRes({ invoiceId: testInvoiceId1, paymentMethod: 'bank_transfer', referenceNote: 'UTR123' }, {}, custUser);
    await billingController.initiateOfflinePayment(offReqRes.req, offReqRes.res, (err) => { if (err) throw err; });
    assert(offReqRes.res.getStatusCode() === 400, `initiateOfflinePayment rejects Draft invoice with HTTP 400 (actual: ${offReqRes.res.getStatusCode()})`);
    assert(String(offReqRes.res.getData()?.message || '').toLowerCase().includes('draft'), 'initiateOfflinePayment message explains invoice is in Draft review');

    // 1.3 Direct payInvoice settlement blocked for Draft
    const payReqRes = mockReqRes({ invoiceId: testInvoiceId1, paymentMethod: 'card' }, {}, custUser);
    await billingController.payInvoice(payReqRes.req, payReqRes.res, (err) => { if (err) throw err; });
    assert(payReqRes.res.getStatusCode() === 400, `payInvoice rejects Draft invoice with HTTP 400 (actual: ${payReqRes.res.getStatusCode()})`);

    // 1.4 Ticket eligibility check reports Draft
    const [ticketRow1] = await pool.query('SELECT * FROM service_requests WHERE id = ?', [testTicketId1]);
    const [invRow1] = await pool.query('SELECT * FROM invoices WHERE id = ?', [testInvoiceId1]);
    const elig1 = billingController.checkTicketPaymentEligibility(ticketRow1[0], custUser, { invoice: invRow1[0] });
    assert(elig1.eligible === false, 'Ticket payment eligibility is false when invoice is Draft');
    assert(String(elig1.reason).toLowerCase().includes('draft'), 'Ticket payment eligibility reason indicates Draft review');

    // --- TEST GROUP 2: Public Tracking Reflects Draft & Finalize States ---
    console.log('\n--- Test Group 2: Public Tracking State Verification ---');
    const trackReq1 = mockReqRes({}, { id: testTicketNumber1 }, null);
    await repairController.trackRequest(trackReq1.req, trackReq1.res);
    assert(trackReq1.res.getStatusCode() === 200, 'trackRequest succeeded for valid ticket');
    const trackData1 = trackReq1.res.getData()?.data;
    assert(trackData1?.invoiceId === testInvoiceId1, `trackRequest reports correct invoiceId (${trackData1?.invoiceId})`);
    assert(trackData1?.invoiceStatus === 'Draft', 'trackRequest reports invoiceStatus as Draft');
    assert(trackData1?.isInvoiceDraft === true, 'trackRequest reports isInvoiceDraft === true');
    assert(trackData1?.isInvoiceFinal === false, 'trackRequest reports isInvoiceFinal === false');

    // --- TEST GROUP 3: Void Invoice Payment Blocking ---
    console.log('\n--- Test Group 3: Void Invoice Payment Blocking ---');
    // Set invoice to Void
    await pool.query("UPDATE invoices SET status = 'Void' WHERE id = ?", [testInvoiceId1]);

    const ordVoidRes = mockReqRes({ invoiceId: testInvoiceId1, amount: 4130.00 }, {}, custUser);
    await billingController.createPaymentOrder(ordVoidRes.req, ordVoidRes.res, (err) => { if (err) throw err; });
    assert(ordVoidRes.res.getStatusCode() === 400, 'createPaymentOrder rejects Void invoice with HTTP 400');

    const offVoidRes = mockReqRes({ invoiceId: testInvoiceId1, paymentMethod: 'bank_transfer' }, {}, custUser);
    await billingController.initiateOfflinePayment(offVoidRes.req, offVoidRes.res, (err) => { if (err) throw err; });
    assert(offVoidRes.res.getStatusCode() === 400, 'initiateOfflinePayment rejects Void invoice with HTTP 400');

    const payVoidRes = mockReqRes({ invoiceId: testInvoiceId1, paymentMethod: 'card' }, {}, custUser);
    await billingController.payInvoice(payVoidRes.req, payVoidRes.res, (err) => { if (err) throw err; });
    assert(payVoidRes.res.getStatusCode() === 400, 'payInvoice rejects Void invoice with HTTP 400');

    // Revert status back to Draft so we can test finalization
    await pool.query("UPDATE invoices SET status = 'Draft' WHERE id = ?", [testInvoiceId1]);

    // --- TEST GROUP 4: Finalize & Release Workflow + Tracking Update ---
    console.log('\n--- Test Group 4: Finalize & Release Workflow ---');
    const finReqRes1 = mockReqRes({}, { id: testInvoiceId1 }, adminUser);
    await billingController.finalizeInvoice(finReqRes1.req, finReqRes1.res, (err) => { if (err) throw err; });
    assert(finReqRes1.res.getStatusCode() === 200, `finalizeInvoice succeeded with HTTP 200 (actual: ${finReqRes1.res.getStatusCode()})`);

    // Verify tracking now reports Finalized
    const trackReq2 = mockReqRes({}, { id: testTicketNumber1 }, null);
    await repairController.trackRequest(trackReq2.req, trackReq2.res);
    const trackData2 = trackReq2.res.getData()?.data;
    assert(trackData2?.invoiceStatus === 'Final', 'trackRequest reports invoiceStatus as Final after release');
    assert(trackData2?.isInvoiceFinal === true, 'trackRequest reports isInvoiceFinal === true after release');
    assert(trackData2?.isInvoiceDraft === false, 'trackRequest reports isInvoiceDraft === false after release');

    // Verify in-app release notification was created for customer
    const [notifRows1] = await pool.query(
      "SELECT * FROM notifications WHERE user_id = ? AND title = 'Invoice Finalized & Released' ORDER BY id DESC LIMIT 1",
      [custUser.id]
    );
    assert(notifRows1.length > 0, 'Release notification successfully dispatched to customer user ID');
    if (notifRows1.length > 0) {
      assert(notifRows1[0].message.includes(testInvoiceId1), 'Notification text contains invoice ID');
      assert(notifRows1[0].message.includes('4130.00'), 'Notification text contains authoritative amount');
    }

    // --- TEST GROUP 5: B2B Company Multi-Recipient Notification Safeguard ---
    console.log('\n--- Test Group 5: B2B Company Multi-Recipient Resolution ---');
    testTicketNumber2 = `TD-CP-${ts}-2`;
    const [t2Res] = await pool.query(
      `INSERT INTO service_requests (
        user_id, company_id, ticket_number, customer_name, email, mobile, device_category,
        brand, model_number, problem_description, status, customer_approval_status,
        assigned_technician_id, estimated_cost, repair_cost
      ) VALUES (?, ?, ?, 'Acme Corp Workstation', 'corp@acme.com', '9888777666', 'Workstation', 'HP', 'Z4 G4', 'Power supply issue', 'completed', 'approved', ?, 5000.00, 5000.00)`,
      [compEmployeeUser.id, compManagerUser.id, testTicketNumber2, techUser.id]
    );
    testTicketId2 = t2Res.insertId;

    testInvoiceId2 = `inv-s2-${ts}`;
    await pool.query(
      `INSERT INTO invoices (
        id, user_id, ticket_id, client_name, amount, subtotal, tax_amount,
        cgst_amount, sgst_amount, is_interstate, status, invoice_date, due_date, is_active
      ) VALUES (?, ?, ?, 'Acme Corp', 5900.00, 5000.00, 900.00, 450.00, 450.00, 0, 'Draft', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 14 DAY), 1)`,
      [testInvoiceId2, compEmployeeUser.id, testTicketId2]
    );
    await pool.query(
      `INSERT INTO invoice_line_items (invoice_id, description, hsn_sac, quantity, unit_price, tax_rate, tax_amount, total)
       VALUES (?, 'HP Z4 Power Supply Unit', '850440', 1, 5000.00, 18.00, 900.00, 5000.00)`,
      [testInvoiceId2]
    );

    // Finalize company invoice
    const finReqRes2 = mockReqRes({}, { id: testInvoiceId2 }, adminUser);
    await billingController.finalizeInvoice(finReqRes2.req, finReqRes2.res, (err) => { if (err) throw err; });
    assert(finReqRes2.res.getStatusCode() === 200, `Company finalizeInvoice succeeded with HTTP 200 (actual: ${finReqRes2.res.getStatusCode()})`);

    // Verify notifications were delivered to BOTH the employee (user_id) AND the company manager (company_id)
    const [empNotif] = await pool.query(
      "SELECT * FROM notifications WHERE user_id = ? AND title = 'Invoice Finalized & Released' ORDER BY id DESC LIMIT 1",
      [compEmployeeUser.id]
    );
    const [mgrNotif] = await pool.query(
      "SELECT * FROM notifications WHERE user_id = ? AND title = 'Invoice Finalized & Released' ORDER BY id DESC LIMIT 1",
      [compManagerUser.id]
    );
    assert(empNotif.length > 0, 'Company ticket employee received release notification');
    assert(mgrNotif.length > 0, 'Company portal manager (company_id) received release notification');
    if (mgrNotif.length > 0) {
      assert(mgrNotif[0].message.includes(testInvoiceId2), 'Manager notification contains invoice ID');
    }

    // --- TEST GROUP 6: Canonical Bill Receipt & Totals Consistency ---
    console.log('\n--- Test Group 6: Canonical Bill Data & Totals Integrity ---');
    const rctReqRes = mockReqRes({}, { id: testInvoiceId1 }, adminUser);
    await billingController.getPaymentReceipt(rctReqRes.req, rctReqRes.res, (err) => { if (err) throw err; });
    assert(rctReqRes.res.getStatusCode() === 200, 'getPaymentReceipt succeeded with HTTP 200');

    const receipt = rctReqRes.res.getData()?.data;
    assert(receipt !== null && typeof receipt === 'object', 'Receipt data payload is present');
    assert(receipt.invoiceId === testInvoiceId1 || receipt.invoice_id === testInvoiceId1, 'Receipt invoice ID matches authoritative invoice');
    assert(receipt.ticketNumber === testTicketNumber1 || receipt.ticket_number === testTicketNumber1, 'Receipt ticket number matches');
    const fin = receipt.financials || receipt;
    assert(Number(fin.grandTotal || fin.totalAmount || receipt.amount) === 4130.00, 'Receipt total amount exactly matches ₹4130.00');
    assert(Number(fin.subtotal) === 3500.00, 'Receipt subtotal exactly matches ₹3500.00');
    assert(Number(fin.taxAmount) === 630.00, 'Receipt tax amount exactly matches ₹630.00');
    assert(Number(fin.cgstAmount) === 315.00, 'Receipt CGST exactly matches ₹315.00');
    assert(Number(fin.sgstAmount) === 315.00, 'Receipt SGST exactly matches ₹315.00');

    // Line items structure check for canonical bill template
    const items = fin.lineItems || receipt.lineItems || [];
    assert(items.length === 1, 'Receipt contains exactly 1 line item');
    assert(items[0].description === 'Genuine Lenovo Battery', 'Line item description matches');
    assert(Number(items[0].unitPrice || items[0].unitRate) === 3500.00, 'Line item unit price matches');
    assert(Number(items[0].taxRate) === 18.00, 'Line item tax rate matches 18%');
    assert(Number(items[0].total || items[0].amount) === 3500.00, 'Line item total matches');

    // Business details presence check
    const biz = receipt.business || receipt.company;
    assert(biz !== null && typeof biz === 'object', 'Receipt includes business branding metadata');
    assert(typeof biz.name === 'string' && biz.name.length > 0, 'Business name is populated');

  } catch (err) {
    console.error('Fatal error during test run:', err);
    testsFailed++;
  } finally {
    // Cleanup test records
    console.log('\n[Cleanup] Cleaning up test records...');
    try {
      if (testInvoiceId1) {
        await pool.query('DELETE FROM invoice_line_items WHERE invoice_id = ?', [testInvoiceId1]);
        await pool.query('DELETE FROM invoices WHERE id = ?', [testInvoiceId1]);
      }
      if (testTicketId1) {
        await pool.query('DELETE FROM notifications WHERE ticket_id = ?', [testTicketId1]);
        await pool.query('DELETE FROM service_requests WHERE id = ?', [testTicketId1]);
      }
      if (testInvoiceId2) {
        await pool.query('DELETE FROM invoice_line_items WHERE invoice_id = ?', [testInvoiceId2]);
        await pool.query('DELETE FROM invoices WHERE id = ?', [testInvoiceId2]);
      }
      if (testTicketId2) {
        await pool.query('DELETE FROM notifications WHERE ticket_id = ?', [testTicketId2]);
        await pool.query('DELETE FROM service_requests WHERE id = ?', [testTicketId2]);
      }
      if (custUser?.id) await pool.query('DELETE FROM users WHERE id = ?', [custUser.id]);
      if (compManagerUser?.id) await pool.query('DELETE FROM users WHERE id = ?', [compManagerUser.id]);
      if (compEmployeeUser?.id) await pool.query('DELETE FROM users WHERE id = ?', [compEmployeeUser.id]);
      console.log('✓ Cleanup completed.');
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr.message);
    }
  }

  console.log('\n============================================================');
  console.log(`RELEASE SAFEGUARDS SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('============================================================\n');

  if (testsFailed > 0) process.exit(1);
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
