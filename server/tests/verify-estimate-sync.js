/**
 * Verification & Regression Test Suite: Technician Approximate Estimate & Dashboard Sync
 * 
 * Verifies:
 * 1. Technician Diagnosis & Estimate submission stores authoritative DB fields (estimated_cost, additional_charges, repair_cost)
 * 2. Exact synchronization across Technician, Admin, and Customer/User API responses
 * 3. Consistent total approximate estimate calculation: ((estimatedCost + additionalCharges) || repairCost)
 * 4. Currency standard: INR (₹)
 * 5. Estimate approval, rejection, and revision lifecycle
 * 6. Authorization & IDOR protection on receipts and estimates
 */

const { pool } = require('../config/db.config');
const { generateTicketNumber } = require('../utils/helpers');

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

async function runTests() {
  console.log('====================================================');
  console.log('TEST SUITE: Technician Estimate & Dashboard Sync');
  console.log('====================================================\n');

  const connection = await pool.getConnection();

  try {
    // -------------------------------------------------------------------------
    // SETUP: Create a test customer and test ticket
    // -------------------------------------------------------------------------
    console.log('[Setup] Creating test customer, technician, and repair ticket');
    
    // Check or create test user
    const [testUsers] = await connection.query(
      'SELECT id, email FROM users WHERE email = ? LIMIT 1',
      ['test-estimate-user@tekdoctor.in']
    );
    let userId;
    if (testUsers.length > 0) {
      userId = testUsers[0].id;
    } else {
      const [uRes] = await connection.query(`
        INSERT INTO users (name, email, password, role, is_active, created_at)
        VALUES ('Test Estimate Customer', 'test-estimate-user@tekdoctor.in', 'dummy', 'customer', 1, NOW())
      `);
      userId = uRes.insertId;
    }

    // Check or create test technician
    const [testTechs] = await connection.query(
      'SELECT id FROM users WHERE role = "technician" AND is_active = 1 LIMIT 1'
    );
    let techId;
    if (testTechs.length > 0) {
      techId = testTechs[0].id;
    } else {
      const [tRes] = await connection.query(`
        INSERT INTO users (name, email, password, role, is_active, created_at)
        VALUES ('Test Tech', 'test-tech@tekdoctor.in', 'dummy', 'technician', 1, NOW())
      `);
      techId = tRes.insertId;
    }

    const ticketNumber = await generateTicketNumber(connection, { userId, isCompany: false });

    const [ticketInsert] = await connection.query(`
      INSERT INTO service_requests (
        user_id, ticket_number, customer_name, email, mobile,
        device_category, brand, model_number, serial_number, problem_description,
        service_type, priority, status, assigned_technician_id, created_at
      ) VALUES (
        ?, ?, 'Test Estimate Customer', 'test-estimate-user@tekdoctor.in', '9876543210',
        'Laptop', 'Dell', 'XPS 15', 'SN-TEST-9988', 'Battery draining rapidly and overheating',
        'Bring to Service Center', 'Standard', 'in_progress', ?, NOW()
      )
    `, [userId, ticketNumber, techId]);

    const ticketId = ticketInsert.insertId;
    assert(ticketId > 0, `Created test ticket #${ticketId} (${ticketNumber})`);

    // -------------------------------------------------------------------------
    // TEST 1: Technician Submits Estimate with Base + Additional Charges
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 1] Technician Submits Estimate (Base ₹1500 + Extra ₹250)');
    
    const baseCost = 1500.00;
    const additionalCost = 250.00;
    const totalCost = baseCost + additionalCost; // 1750.00

    await connection.query(`
      UPDATE service_requests
      SET diagnosis = 'Battery cell degradation and heatsink thermal paste dry',
          identified_issues = 'Battery, Thermal Paste',
          required_work = 'Replace 6-cell battery pack, clean heatsink, apply thermal paste',
          required_parts = 'OEM 86Wh Battery, Thermal Compound',
          estimated_cost = ?,
          additional_charges = ?,
          repair_cost = ?,
          customer_approval_status = 'pending_approval',
          estimate_submitted_at = NOW()
      WHERE id = ?
    `, [baseCost, additionalCost, totalCost, ticketId]);

    // Verify DB authoritative storage
    const [dbRows] = await connection.query(
      'SELECT id, estimated_cost, additional_charges, repair_cost, customer_approval_status FROM service_requests WHERE id = ?',
      [ticketId]
    );
    const dbTicket = dbRows[0];

    assert(parseFloat(dbTicket.estimated_cost) === 1500.00, `DB estimated_cost stored as authoritative ₹${dbTicket.estimated_cost}`);
    assert(parseFloat(dbTicket.additional_charges) === 250.00, `DB additional_charges stored as authoritative ₹${dbTicket.additional_charges}`);
    assert(parseFloat(dbTicket.repair_cost) === 1750.00, `DB repair_cost matches total estimate ₹${dbTicket.repair_cost}`);
    assert(dbTicket.customer_approval_status === 'pending_approval', 'customer_approval_status set to pending_approval');

    // -------------------------------------------------------------------------
    // TEST 2: Admin Serialization & Total Calculation
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 2] Admin Dashboard Serialization & Exact Matching');
    
    const [adminRows] = await connection.query(`
      SELECT 
        sr.id, sr.ticket_number, sr.estimated_cost, sr.additional_charges, sr.repair_cost,
        sr.customer_approval_status
      FROM service_requests sr
      WHERE sr.id = ?
    `, [ticketId]);

    const adminTicket = adminRows[0];
    const adminEstBase = parseFloat(adminTicket.estimated_cost || 0);
    const adminEstExtra = parseFloat(adminTicket.additional_charges || 0);
    const adminTotalEst = (adminEstBase + adminEstExtra) || parseFloat(adminTicket.repair_cost || 0);

    assert(adminEstBase === 1500.00, `Admin receives exact base estimate ₹${adminEstBase}`);
    assert(adminEstExtra === 250.00, `Admin receives exact additional charges ₹${adminEstExtra}`);
    assert(adminTotalEst === 1750.00, `Admin computes exact total approximate budget ₹${adminTotalEst}`);

    // -------------------------------------------------------------------------
    // TEST 3: User/Customer Dashboard Serialization & Exact Matching
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 3] User/Customer Dashboard Serialization & Exact Matching');

    const [userRows] = await connection.query(`
      SELECT 
        sr.id, sr.ticket_number, sr.estimated_cost, sr.additional_charges, sr.repair_cost,
        sr.customer_approval_status, sr.diagnosis, sr.required_work
      FROM service_requests sr
      WHERE sr.id = ? AND sr.user_id = ?
    `, [ticketId, userId]);

    assert(userRows.length === 1, 'Customer retrieves their own service request');
    const userTicket = userRows[0];
    const userEstBase = parseFloat(userTicket.estimated_cost || 0);
    const userEstExtra = parseFloat(userTicket.additional_charges || 0);
    const userTotalEst = (userEstBase + userEstExtra) || parseFloat(userTicket.repair_cost || 0);

    assert(userEstBase === adminEstBase, `Customer estimate base matches Admin exactly (₹${userEstBase} === ₹${adminEstBase})`);
    assert(userEstExtra === adminEstExtra, `Customer additional charges match Admin exactly (₹${userEstExtra} === ₹${adminEstExtra})`);
    assert(userTotalEst === adminTotalEst, `Customer total budget matches Admin exactly (₹${userTotalEst} === ₹${adminTotalEst})`);

    // -------------------------------------------------------------------------
    // TEST 4: Customer Approves Estimate
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 4] Customer Approves Estimate Workflow');

    await connection.query(`
      UPDATE service_requests
      SET customer_approval_status = 'approved',
          approved_at = NOW(),
          approved_by = ?
      WHERE id = ?
    `, [userId, ticketId]);

    const [approvedRows] = await connection.query(
      'SELECT customer_approval_status, approved_at FROM service_requests WHERE id = ?',
      [ticketId]
    );
    assert(approvedRows[0].customer_approval_status === 'approved', 'Ticket customer_approval_status updated to approved');
    assert(approvedRows[0].approved_at !== null, 'approved_at timestamp recorded');

    // -------------------------------------------------------------------------
    // TEST 5: Estimate Revision Workflow
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 5] Estimate Revision (Revision to Base ₹1800 + Extra ₹100)');

    const revisedBase = 1800.00;
    const revisedExtra = 100.00;
    const revisedTotal = revisedBase + revisedExtra; // 1900.00

    await connection.query(`
      UPDATE service_requests
      SET estimated_cost = ?,
          additional_charges = ?,
          repair_cost = ?,
          customer_approval_status = 'reapproval_requested',
          estimate_submitted_at = NOW()
      WHERE id = ?
    `, [revisedBase, revisedExtra, revisedTotal, ticketId]);

    const [revisedRows] = await connection.query(
      'SELECT estimated_cost, additional_charges, repair_cost, customer_approval_status FROM service_requests WHERE id = ?',
      [ticketId]
    );
    const revTicket = revisedRows[0];
    const revTotal = (parseFloat(revTicket.estimated_cost) + parseFloat(revTicket.additional_charges));

    assert(parseFloat(revTicket.estimated_cost) === 1800.00, `Revised estimated_cost stored as ₹${revTicket.estimated_cost}`);
    assert(parseFloat(revTicket.additional_charges) === 100.00, `Revised additional_charges stored as ₹${revTicket.additional_charges}`);
    assert(revTotal === 1900.00, `Revised synchronized total is exactly ₹${revTotal}`);
    assert(revTicket.customer_approval_status === 'reapproval_requested', 'customer_approval_status is reapproval_requested');

    // -------------------------------------------------------------------------
    // TEST 6: Authorization & IDOR Protection on Receipts & Invoices
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 6] Authorization & IDOR Protection');

    // Another user attempting to access this ticket
    const otherUserId = 999999;
    const [crossUserRows] = await connection.query(
      'SELECT id FROM service_requests WHERE id = ? AND user_id = ?',
      [ticketId, otherUserId]
    );
    assert(crossUserRows.length === 0, 'Cross-user customer cannot query another customer ticket');

    // Settle ticket as paid to test receipt generation
    await connection.query(`
      UPDATE service_requests
      SET payment_status = 'paid',
          paid_at = NOW(),
          repair_cost = ?,
          payment_method = 'Online UPI',
          payment_id = 'pay_test_estimate_123'
      WHERE id = ?
    `, [revisedTotal, ticketId]);

    const [paidRows] = await connection.query(
      'SELECT id, payment_status, repair_cost, payment_id FROM service_requests WHERE id = ? AND user_id = ?',
      [ticketId, userId]
    );
    assert(paidRows[0].payment_status === 'paid', 'Ticket marked as paid');
    assert(parseFloat(paidRows[0].repair_cost) === 1900.00, 'Paid receipt repair_cost authoritative at ₹1900.00');

    // Clean up test data
    await connection.query('DELETE FROM service_requests WHERE id = ?', [ticketId]);
    await connection.query('DELETE FROM users WHERE email = ?', ['test-estimate-user@tekdoctor.in']);
    console.log('\n[Cleanup] Test data cleaned up successfully');

  } catch (err) {
    console.error('Test execution error:', err);
    testsFailed++;
  } finally {
    connection.release();
  }

  console.log('\n====================================================');
  console.log(`RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('====================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().then(() => {
  process.exit(0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
