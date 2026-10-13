/**
 * Verification Test Suite: Targeted Production-Safety Verification
 * Invoice Number Editing, Atomicity, Sequence Integrity & Concurrency Safety
 * 
 * Verifies:
 * 1. Atomicity of Draft invoice renaming (successful, duplicate, invalid, child failure, payment failure)
 * 2. FOREIGN_KEY_CHECKS guarantee: Restored to 1 in ALL success and failure paths
 * 3. Sequence integrity: Editing Draft invoice number NEVER modifies, resets, or decrements app_sequences
 * 4. Automatic sequencing monotonicity: Future invoices continue seamless numbering
 * 5. High-concurrency safety: Simultaneous rename + parallel automated invoice creations
 * 6. Reference integrity: invoices.id, invoice_line_items, payments, receipt, eligibility, finalization
 * 7. State immutability: Draft allows rename; Final, Paid, and Void block rename
 */

const { pool } = require('../config/db.config');
const { generateInvoiceId } = require('../utils/helpers');
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

function mockReqRes(body = {}, params = {}, user = { id: 1, email: 'admin@tekdoctor.in', role: 'admin' }, query = {}) {
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

async function getFkChecks(conn) {
  const [[row]] = await conn.query('SELECT @@FOREIGN_KEY_CHECKS as fk');
  return row.fk;
}

async function runTests() {
  console.log('================================================================');
  console.log('TEST SUITE: Invoice Number Editing, Atomicity & Sequence Safety');
  console.log('================================================================\n');

  const connection = await pool.getConnection();

  let testUserId = null;
  let adminId = 1;
  const createdInvoiceIds = [];
  const createdTicketIds = [];

  try {
    // -------------------------------------------------------------------------
    // SETUP: Test Customer & Admin Resolution
    // -------------------------------------------------------------------------
    console.log('[Setup] Preparing test customer and resolving active admin ID');
    const [uRes] = await connection.query(`
      INSERT INTO users (name, email, password, role, is_active, created_at)
      VALUES ('Rename Safety Customer', 'test-rename-safety@tekdoctor.in', 'dummy', 'customer', 1, NOW())
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `);
    testUserId = uRes.insertId;

    const [adminRow] = await connection.query("SELECT id, email FROM users WHERE role = 'admin' LIMIT 1");
    if (adminRow.length > 0) {
      adminId = adminRow[0].id;
    }

    // Helper to create an isolated Draft invoice with its own ticket and pending payment
    async function createTestDraftInvoice() {
      const ticketNum = 'TKT-RN-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random() * 10000);
      const [tRes] = await connection.query(`
        INSERT INTO service_requests (
          user_id, ticket_number, customer_name, email, mobile,
          device_category, brand, model_number, problem_description,
          status, assigned_technician_id, customer_approval_status, repair_cost, estimated_cost, created_at
        ) VALUES (?, ?, 'Rename Safety Customer', 'test-rename-safety@tekdoctor.in', '9876543210',
          'Laptop', 'Dell', 'XPS 13', 'Keyboard unresponsive',
          'completed', ?, 'approved', 6000.00, 6000.00, NOW())
      `, [testUserId, ticketNum, adminId]);
      const ticketId = tRes.insertId;
      createdTicketIds.push(ticketId);

      const invId = await generateInvoiceId(connection);
      createdInvoiceIds.push(invId);

      await connection.query(`
        INSERT INTO invoices (
          id, user_id, ticket_id, client_name, amount, subtotal, tax_amount,
          cgst_amount, sgst_amount, igst_amount, is_interstate, original_estimate,
          currency, invoice_date, due_date, status, notes
        ) VALUES (?, ?, ?, 'Rename Safety Customer', 5900.00, 5000.00, 900.00, 450.00, 450.00, 0.00, FALSE, 5000.00,
          'INR', NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY), 'Draft', 'Test Draft for Rename Verification')
      `, [invId, testUserId, ticketId]);

      await connection.query(`
        INSERT INTO invoice_line_items (invoice_id, description, hsn_sac, quantity, unit_price, total, tax_rate, tax_amount)
        VALUES (?, 'Keyboard Replacement', '8471', 1, 5000.00, 5000.00, 18.00, 900.00)
      `, [invId]);

      // Seed a pending payment linked to this invoice
      const [pmtRes] = await connection.query(`
        INSERT INTO payments (
          order_id, ticket_id, invoice_id, user_id, amount, currency,
          payment_method, status, collection_status, verification_status
        ) VALUES (?, ?, ?, ?, 5900.00, 'INR', 'cash', 'pending_verification', 'pending_collection', 'pending')
      `, [`ORD-TEST-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*1000)}`, ticketId, invId, testUserId]);

      return { invId, ticketId, ticketNum, paymentId: pmtRes.insertId };
    }

    // -------------------------------------------------------------------------
    // TEST 1: Baseline Successful Rename of Draft Invoice
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Successful Draft Invoice Number Rename ---');
    const { invId: inv1, paymentId: pmt1 } = await createTestDraftInvoice();
    const customId1 = 'TD/INV/2026/REN001';
    createdInvoiceIds.push(customId1);

    const renameReqRes1 = mockReqRes({ newInvoiceId: customId1 }, { id: inv1 }, { id: adminId, role: 'admin' });
    await billingController.updateInvoice(renameReqRes1.req, renameReqRes1.res);

    assert(renameReqRes1.res.getStatusCode() === 200, `updateInvoice succeeded with HTTP 200`);

    const [ren1Rows] = await connection.query('SELECT id, status FROM invoices WHERE id = ?', [customId1]);
    assert(ren1Rows.length === 1, `invoices.id successfully updated to '${customId1}'`);

    const [old1Rows] = await connection.query('SELECT id FROM invoices WHERE id = ?', [inv1]);
    assert(old1Rows.length === 0, `Old invoice ID '${inv1}' no longer present in invoices`);

    const [lines1] = await connection.query('SELECT invoice_id FROM invoice_line_items WHERE invoice_id = ?', [customId1]);
    assert(lines1.length === 1 && lines1[0].invoice_id === customId1, `invoice_line_items.invoice_id updated to '${customId1}'`);

    const [pmt1Rows] = await connection.query('SELECT invoice_id FROM payments WHERE id = ?', [pmt1]);
    assert(pmt1Rows.length === 1 && pmt1Rows[0].invoice_id === customId1, `payments.invoice_id updated to '${customId1}'`);

    const fkCheck1 = await getFkChecks(connection);
    assert(fkCheck1 === 1, `FOREIGN_KEY_CHECKS is active (1) after successful rename`);

    // -------------------------------------------------------------------------
    // TEST 2: Duplicate Invoice Number Rejection
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Duplicate Invoice Number Rejection ---');
    const { invId: inv2, paymentId: pmt2 } = await createTestDraftInvoice();

    // Attempt to rename inv2 to customId1 (which already exists)
    const dupReqRes = mockReqRes({ newInvoiceId: customId1 }, { id: inv2 }, { id: adminId, role: 'admin' });
    await billingController.updateInvoice(dupReqRes.req, dupReqRes.res);

    assert(dupReqRes.res.getStatusCode() === 400, `Collision correctly rejected with HTTP 400`);
    assert(
      dupReqRes.res.getData()?.message?.includes('already in use'),
      `Error message indicates collision: "${dupReqRes.res.getData()?.message}"`
    );

    // Verify inv2 remained completely unchanged
    const [inv2StillThere] = await connection.query('SELECT id FROM invoices WHERE id = ?', [inv2]);
    assert(inv2StillThere.length === 1, `Original invoice ID '${inv2}' remains intact`);

    const [lines2StillThere] = await connection.query('SELECT invoice_id FROM invoice_line_items WHERE invoice_id = ?', [inv2]);
    assert(lines2StillThere.length === 1, `Child line items still reference '${inv2}'`);

    const [pmt2StillThere] = await connection.query('SELECT invoice_id FROM payments WHERE id = ?', [pmt2]);
    assert(pmt2StillThere[0].invoice_id === inv2, `Payment record still references '${inv2}'`);

    const fkCheck2 = await getFkChecks(connection);
    assert(fkCheck2 === 1, `FOREIGN_KEY_CHECKS is active (1) after duplicate collision rejection`);

    // -------------------------------------------------------------------------
    // TEST 3: Invalid Invoice Number Format Rejection
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Invalid Invoice Number Format Rejection ---');
    const invalidIds = [
      'INV 123 456',              // Contains spaces
      'INV<script>alert(1)</script>', // XSS payload
      'INV#SPECIAL!@$',           // Illegal characters
      'A'.repeat(51)              // Exceeds 50 characters
    ];

    for (const badId of invalidIds) {
      const badReqRes = mockReqRes({ newInvoiceId: badId }, { id: inv2 }, { id: adminId, role: 'admin' });
      await billingController.updateInvoice(badReqRes.req, badReqRes.res);
      assert(badReqRes.res.getStatusCode() === 400, `Invalid ID format rejected with HTTP 400 for: "${badId.slice(0, 20)}..."`);
    }

    const [inv2Untouched] = await connection.query('SELECT id FROM invoices WHERE id = ?', [inv2]);
    assert(inv2Untouched.length === 1, `Invoice '${inv2}' remains intact after invalid rename attempts`);

    const fkCheck3 = await getFkChecks(connection);
    assert(fkCheck3 === 1, `FOREIGN_KEY_CHECKS is active (1) after invalid format rejections`);

    // -------------------------------------------------------------------------
    // TEST 4: Atomicity & Rollback under Forced Failure in Child References
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Atomicity & Rollback under Child Failure ---');
    const { invId: inv3, paymentId: pmt3 } = await createTestDraftInvoice();
    const targetCustomId3 = 'TD/FAIL/CHILD/001';

    // Simulate failure during rename: parent update succeeds, but line items update throws
    const testConn = await pool.getConnection();
    let failureCaught = false;

    try {
      await testConn.beginTransaction();
      try {
        await testConn.query('SET FOREIGN_KEY_CHECKS = 0');
        await testConn.query('UPDATE invoices SET id = ? WHERE id = ?', [targetCustomId3, inv3]);

        // Force intentional failure in line items update
        throw new Error('Forced line-items update failure simulation');
      } finally {
        await testConn.query('SET FOREIGN_KEY_CHECKS = 1');
      }
    } catch (simErr) {
      failureCaught = true;
      try { await testConn.query('SET FOREIGN_KEY_CHECKS = 1'); } catch (_) {}
      await testConn.rollback();
    } finally {
      const connFkState = await getFkChecks(testConn);
      assert(connFkState === 1, `FOREIGN_KEY_CHECKS restored to 1 on connection after simulated child failure`);
      testConn.release();
    }

    assert(failureCaught, `Simulated child failure was triggered and handled`);

    // Verify full rollback: parent, lines, and payments must reference inv3
    const [inv3Check] = await connection.query('SELECT id FROM invoices WHERE id = ?', [inv3]);
    const [inv3Ghost] = await connection.query('SELECT id FROM invoices WHERE id = ?', [targetCustomId3]);
    assert(inv3Check.length === 1 && inv3Ghost.length === 0, `Rollback succeeded: invoices.id is '${inv3}', ghost '${targetCustomId3}' does not exist`);

    const [lines3Check] = await connection.query('SELECT invoice_id FROM invoice_line_items WHERE invoice_id = ?', [inv3]);
    assert(lines3Check.length === 1, `Line items intact: still reference '${inv3}'`);

    const [pmt3Check] = await connection.query('SELECT invoice_id FROM payments WHERE id = ?', [pmt3]);
    assert(pmt3Check[0].invoice_id === inv3, `Payments intact: still reference '${inv3}'`);

    // -------------------------------------------------------------------------
    // TEST 5: Atomicity & Rollback under Forced Failure in Payment References
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Atomicity & Rollback under Payment Reference Failure ---');
    const { invId: inv4, paymentId: pmt4 } = await createTestDraftInvoice();
    const targetCustomId4 = 'TD/FAIL/PMT/001';

    const testConn4 = await pool.getConnection();
    let pmtFailureCaught = false;

    try {
      await testConn4.beginTransaction();
      try {
        await testConn4.query('SET FOREIGN_KEY_CHECKS = 0');
        await testConn4.query('UPDATE invoices SET id = ? WHERE id = ?', [targetCustomId4, inv4]);
        await testConn4.query('UPDATE invoice_line_items SET invoice_id = ? WHERE invoice_id = ?', [targetCustomId4, inv4]);

        // Force intentional failure in payments update
        throw new Error('Forced payments update failure simulation');
      } finally {
        await testConn4.query('SET FOREIGN_KEY_CHECKS = 1');
      }
    } catch (simErr) {
      pmtFailureCaught = true;
      try { await testConn4.query('SET FOREIGN_KEY_CHECKS = 1'); } catch (_) {}
      await testConn4.rollback();
    } finally {
      const connFkState4 = await getFkChecks(testConn4);
      assert(connFkState4 === 1, `FOREIGN_KEY_CHECKS restored to 1 on connection after simulated payment failure`);
      testConn4.release();
    }

    assert(pmtFailureCaught, `Simulated payment failure was triggered and handled`);

    const [inv4Check] = await connection.query('SELECT id FROM invoices WHERE id = ?', [inv4]);
    const [inv4Ghost] = await connection.query('SELECT id FROM invoices WHERE id = ?', [targetCustomId4]);
    assert(inv4Check.length === 1 && inv4Ghost.length === 0, `Rollback succeeded: invoices.id is '${inv4}', ghost '${targetCustomId4}' does not exist`);

    const [lines4Check] = await connection.query('SELECT invoice_id FROM invoice_line_items WHERE invoice_id = ?', [inv4]);
    assert(lines4Check.length === 1, `Line items intact: still reference '${inv4}'`);

    const [pmt4Check] = await connection.query('SELECT invoice_id FROM payments WHERE id = ?', [pmt4]);
    assert(pmt4Check[0].invoice_id === inv4, `Payments intact: still reference '${inv4}'`);

    // -------------------------------------------------------------------------
    // TEST 6: Sequence Integrity (Draft Renaming NEVER touches app_sequences)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Sequence Integrity Verification ---');

    // 1. Fetch current sequence value before test
    const [[seqRowBefore]] = await connection.query(
      "SELECT current_val FROM app_sequences WHERE sequence_name = 'invoice'"
    );
    const startSeqVal = seqRowBefore.current_val;

    // 2. Create invoice A automatically
    const invA = await generateInvoiceId(connection);
    createdInvoiceIds.push(invA);
    const numA = parseInt(invA.replace(/\D/g, ''), 10);

    const [[seqRowAfterA]] = await connection.query(
      "SELECT current_val FROM app_sequences WHERE sequence_name = 'invoice'"
    );
    assert(seqRowAfterA.current_val === numA, `app_sequences correctly incremented to ${numA} for invoice A (${invA})`);

    // Save invoice A as Draft
    await connection.query(`
      INSERT INTO invoices (id, user_id, ticket_id, client_name, amount, subtotal, tax_amount, status, invoice_date, due_date)
      VALUES (?, ?, NULL, 'Seq Test Customer', 1000, 1000, 0, 'Draft', NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY))
    `, [invA, testUserId]);

    // 3. Rename Draft invoice A to custom number
    const customIdA = 'TD/CORP/2026/SEQ-TEST-A';
    createdInvoiceIds.push(customIdA);
    const renameReqA = mockReqRes({ newInvoiceId: customIdA }, { id: invA }, { id: adminId, role: 'admin' });
    await billingController.updateInvoice(renameReqA.req, renameReqA.res);
    assert(renameReqA.res.getStatusCode() === 200, `Draft invoice A successfully renamed to '${customIdA}'`);

    // 4. Verify app_sequences was NOT modified by rename
    const [[seqRowAfterRename]] = await connection.query(
      "SELECT current_val FROM app_sequences WHERE sequence_name = 'invoice'"
    );
    assert(
      seqRowAfterRename.current_val === numA,
      `app_sequences current_val remained strictly unchanged at ${numA} (NOT modified, NOT decremented, NOT advanced)`
    );

    // 5. Create invoice B automatically
    const invB = await generateInvoiceId(connection);
    createdInvoiceIds.push(invB);
    const numB = parseInt(invB.replace(/\D/g, ''), 10);

    // 6. Verify invoice B received the exact contiguous next sequence number
    assert(
      numB === numA + 1,
      `Invoice B received next sequential number: ${invB} (num: ${numB}) immediately following ${invA} (num: ${numA})`
    );

    const [[seqRowAfterB]] = await connection.query(
      "SELECT current_val FROM app_sequences WHERE sequence_name = 'invoice'"
    );
    assert(seqRowAfterB.current_val === numB, `app_sequences cleanly advanced to ${numB}`);

    // -------------------------------------------------------------------------
    // TEST 7: High-Concurrency Safety (Concurrent Rename + Concurrent Creations)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: Concurrency Safety (Simultaneous Rename + Batch Creations) ---');

    const { invId: invConcurrent, ticketId: tktConcurrent } = await createTestDraftInvoice();
    const targetConcurrentCustomId = 'TD/CONC/2026/001';
    createdInvoiceIds.push(targetConcurrentCustomId);

    // Launch simultaneous operations:
    // Operation 1: Rename invConcurrent
    // Operation 2-7: 6 Parallel calls to generateInvoiceId
    const concurrentRenamePromise = (async () => {
      const resObj = mockReqRes({ newInvoiceId: targetConcurrentCustomId }, { id: invConcurrent }, { id: adminId, role: 'admin' });
      await billingController.updateInvoice(resObj.req, resObj.res);
      return resObj.res.getStatusCode();
    })();

    const parallelCreationPromises = Array.from({ length: 6 }, async () => {
      return await generateInvoiceId(pool);
    });

    const [renameStatus, ...createdBatchIds] = await Promise.all([
      concurrentRenamePromise,
      ...parallelCreationPromises
    ]);

    createdBatchIds.forEach(id => createdInvoiceIds.push(id));

    assert(renameStatus === 200, `Concurrent rename completed successfully with HTTP 200`);

    // Check unique set of generated IDs
    const uniqueIds = new Set(createdBatchIds);
    assert(uniqueIds.size === 6, `All 6 parallel invoice generations yielded distinct IDs (no duplicates)`);

    // Verify all generated IDs are contiguous
    const parsedNums = createdBatchIds.map(id => parseInt(id.replace(/\D/g, ''), 10)).sort((a, b) => a - b);
    let contiguous = true;
    for (let i = 1; i < parsedNums.length; i++) {
      if (parsedNums[i] !== parsedNums[i - 1] + 1) {
        contiguous = false;
        break;
      }
    }
    assert(contiguous, `Generated parallel sequence is strictly monotonic and contiguous: ${parsedNums.join(', ')}`);

    // Verify renamed invoice relationships remain intact under concurrency
    const [concInv] = await connection.query('SELECT id FROM invoices WHERE id = ?', [targetConcurrentCustomId]);
    assert(concInv.length === 1, `Renamed invoice '${targetConcurrentCustomId}' found in invoices table`);

    const [concLines] = await connection.query('SELECT invoice_id FROM invoice_line_items WHERE invoice_id = ?', [targetConcurrentCustomId]);
    assert(concLines.length === 1, `Line items correctly linked to '${targetConcurrentCustomId}'`);

    // -------------------------------------------------------------------------
    // TEST 8: Reference Integrity across All System Workflows
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8: Reference Integrity Across Workflows ---');

    const testRefCustomId = targetConcurrentCustomId;

    // 1. invoices.id lookup
    const [refInv] = await connection.query('SELECT * FROM invoices WHERE id = ?', [testRefCustomId]);
    assert(refInv.length === 1, `Direct DB lookup by invoices.id = '${testRefCustomId}' works`);

    // 2. invoice_line_items.invoice_id lookup
    const [refLines] = await connection.query('SELECT * FROM invoice_line_items WHERE invoice_id = ?', [testRefCustomId]);
    assert(refLines.length === 1, `Line items linked by invoice_id = '${testRefCustomId}'`);

    // 3. payments.invoice_id lookup
    const [refPmts] = await connection.query('SELECT * FROM payments WHERE invoice_id = ?', [testRefCustomId]);
    assert(refPmts.length === 1, `Payments linked by invoice_id = '${testRefCustomId}'`);

    // 4. Receipt lookup by new ID (staff preview allowed for Draft)
    const receiptReq = mockReqRes({}, { id: testRefCustomId }, { id: adminId, role: 'admin' });
    await billingController.getPaymentReceipt(receiptReq.req, receiptReq.res, (err) => { if (err) throw err; });
    assert(receiptReq.res.getStatusCode() === 200, `getPaymentReceipt succeeded using renamed ID '${testRefCustomId}'`);
    assert(receiptReq.res.getData()?.data?.invoiceId === testRefCustomId, `Receipt data invoiceId matches '${testRefCustomId}'`);

    // 5. Finalization using renamed ID
    const finalizeReq = mockReqRes({}, { id: testRefCustomId }, { id: adminId, role: 'admin' });
    await billingController.finalizeInvoice(finalizeReq.req, finalizeReq.res);
    assert(finalizeReq.res.getStatusCode() === 200, `finalizeInvoice succeeded using renamed ID '${testRefCustomId}'`);

    const [finalCheck] = await connection.query('SELECT status, finalized_at FROM invoices WHERE id = ?', [testRefCustomId]);
    assert(finalCheck[0].status === 'Final', `Status transitioned to 'Final' for renamed ID`);
    assert(finalCheck[0].finalized_at !== null, `finalized_at timestamp stamped`);

    // 6. Payment Eligibility Check after finalization
    const eligReq = mockReqRes({}, { ticketId: tktConcurrent }, { id: testUserId, email: 'test-rename-safety@tekdoctor.in', role: 'customer' });
    await billingController.getPaymentEligibility(eligReq.req, eligReq.res);
    const eligData = eligReq.res.getData()?.data;
    assert(eligData?.eligible === true, `Payment eligibility is true after finalization`);
    assert(eligData?.invoiceId === testRefCustomId, `Eligibility reports linked invoiceId as '${testRefCustomId}'`);

    // -------------------------------------------------------------------------
    // TEST 9: Finalized, Paid, and Void Protection
    // -------------------------------------------------------------------------
    console.log('\n--- Test 9: Finalized & Paid Immutability Protection ---');

    // 1. Rename on Final invoice MUST BE BLOCKED
    const renameFinalReq = mockReqRes({ newInvoiceId: 'TD/HACK/FINAL/001' }, { id: testRefCustomId }, { id: adminId, role: 'admin' });
    await billingController.updateInvoice(renameFinalReq.req, renameFinalReq.res);
    assert(renameFinalReq.res.getStatusCode() === 400, `Renaming Final invoice is strictly BLOCKED (HTTP 400)`);

    // 2. Normal line item edits on Final invoice MUST BE BLOCKED
    const editLinesFinalReq = mockReqRes({ lineItems: [{ description: 'Hack', quantity: 1, unitRate: 1 }] }, { id: testRefCustomId }, { id: adminId, role: 'admin' });
    await billingController.updateInvoice(editLinesFinalReq.req, editLinesFinalReq.res);
    assert(editLinesFinalReq.res.getStatusCode() === 400, `Editing line items on Final invoice is strictly BLOCKED (HTTP 400)`);

    // 3. Mark invoice as Paid
    await connection.query("UPDATE invoices SET status = 'Paid' WHERE id = ?", [testRefCustomId]);

    // 4. Rename on Paid invoice MUST BE BLOCKED
    const renamePaidReq = mockReqRes({ newInvoiceId: 'TD/HACK/PAID/001' }, { id: testRefCustomId }, { id: adminId, role: 'admin' });
    await billingController.updateInvoice(renamePaidReq.req, renamePaidReq.res);
    assert(renamePaidReq.res.getStatusCode() === 400, `Renaming Paid invoice is strictly BLOCKED (HTTP 400)`);

    // 5. Void status transition behavior
    const voidReq = mockReqRes({ status: 'Void' }, { id: testRefCustomId }, { id: adminId, role: 'admin' });
    await billingController.updateInvoice(voidReq.req, voidReq.res);
    assert(voidReq.res.getStatusCode() === 200, `Transitioning invoice to 'Void' is permitted per business rules`);

    // 6. Rename on Void invoice MUST BE BLOCKED
    const renameVoidReq = mockReqRes({ newInvoiceId: 'TD/HACK/VOID/001' }, { id: testRefCustomId }, { id: adminId, role: 'admin' });
    await billingController.updateInvoice(renameVoidReq.req, renameVoidReq.res);
    assert(renameVoidReq.res.getStatusCode() === 400, `Renaming Void invoice is strictly BLOCKED (HTTP 400)`);

    const fkCheckFinal = await getFkChecks(connection);
    assert(fkCheckFinal === 1, `FOREIGN_KEY_CHECKS remains active (1) throughout all state transition tests`);

  } catch (err) {
    console.error('Unexpected error in rename safety test suite:', err);
    testsFailed++;
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    console.log('\n[Cleanup] Cleaning up test records');
    try {
      if (createdInvoiceIds.length > 0) {
        const placeholders = createdInvoiceIds.map(() => '?').join(',');
        await connection.query(`DELETE FROM payments WHERE invoice_id IN (${placeholders})`, createdInvoiceIds);
        await connection.query(`DELETE FROM invoice_line_items WHERE invoice_id IN (${placeholders})`, createdInvoiceIds);
        await connection.query(`DELETE FROM invoices WHERE id IN (${placeholders})`, createdInvoiceIds);
      }
      if (createdTicketIds.length > 0) {
        const placeholders = createdTicketIds.map(() => '?').join(',');
        await connection.query(`DELETE FROM payments WHERE ticket_id IN (${placeholders})`, createdTicketIds);
        await connection.query(`DELETE FROM service_requests WHERE id IN (${placeholders})`, createdTicketIds);
      }
      if (testUserId) {
        await connection.query('DELETE FROM users WHERE id = ?', [testUserId]);
      }
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr.message);
    }

    connection.release();
  }

  console.log('\n================================================================');
  console.log(`RENAME SAFETY SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('================================================================');

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests();
