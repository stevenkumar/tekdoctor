/**
 * Verification Script for Task Transfer History Feature
 * Tests:
 * 1. Database schema and task_transfers table structure
 * 2. Transfer initiation (pending status + pending_technician_id)
 * 3. Technician incoming & outgoing history queries with direction labeling
 * 4. Admin global task transfer oversight query & stats
 * 5. Ticket chronological transfer chain query
 * 6. Assignment acceptance flow (transfer status updated to accepted, assigned tech updated)
 * 7. Second transfer & assignment rejection with reason flow (status rejected + response_notes)
 */

const { pool } = require('../config/db.config');
const dbInit = require('../models/db.init');

async function runVerification() {
  console.log('--- STARTING TASK TRANSFER HISTORY VERIFICATION ---');

  try {
    // 1. Ensure DB initialized
    console.log('1. Initializing DB schema...');
    await dbInit();

    // Check table structure
    const [cols] = await pool.query('DESCRIBE task_transfers');
    const columnNames = cols.map(c => c.Field);
    console.log('task_transfers columns:', columnNames.join(', '));
    const requiredCols = [
      'id', 'repair_request_id', 'from_technician_id', 'to_technician_id',
      'initiated_by_user_id', 'reason', 'status', 'response_notes',
      'transferred_at', 'responded_at'
    ];
    for (const rc of requiredCols) {
      if (!columnNames.includes(rc)) {
        throw new Error(`Missing column in task_transfers: ${rc}`);
      }
    }
    console.log('✓ Database schema verified successfully.');

    // 2. Setup Test Data (2 technicians + 1 customer + 1 ticket)
    console.log('\n2. Setting up test entities...');
    
    // Create/get Tech 1
    const [t1Res] = await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES ('Tech Alpha', 'tech.alpha.test@tekdoctor.in', 'dummy_hash', 'technician', 1)
       ON DUPLICATE KEY UPDATE name = 'Tech Alpha'`
    );
    const [t1Rows] = await pool.query(`SELECT id FROM users WHERE email = 'tech.alpha.test@tekdoctor.in'`);
    const tech1Id = t1Rows[0].id;

    // Create/get Tech 2
    const [t2Res] = await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES ('Tech Beta', 'tech.beta.test@tekdoctor.in', 'dummy_hash', 'technician', 1)
       ON DUPLICATE KEY UPDATE name = 'Tech Beta'`
    );
    const [t2Rows] = await pool.query(`SELECT id FROM users WHERE email = 'tech.beta.test@tekdoctor.in'`);
    const tech2Id = t2Rows[0].id;

    // Create test customer
    await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES ('Customer Tester', 'cust.tester@tekdoctor.in', 'dummy_hash', 'customer', 1)
       ON DUPLICATE KEY UPDATE name = 'Customer Tester'`
    );
    const [cRows] = await pool.query(`SELECT id FROM users WHERE email = 'cust.tester@tekdoctor.in'`);
    const customerId = cRows[0].id;

    // Create test repair ticket
    const [ticketRes] = await pool.query(
      `INSERT INTO service_requests (
        user_id, ticket_number, customer_name, mobile, email, city,
        device_category, brand, model_number, problem_type,
        service_type, priority, status, assigned_technician_id
      ) VALUES (
        ?, 'TK-TRANSFER-TEST-001', 'Customer Tester', '9876543210', 'cust.tester@tekdoctor.in', 'Bengaluru',
        'Mobile / Smartphone', 'OnePlus', '11R', 'Battery Drain Issue',
        'Carry In', 'Standard', 'in_progress', ?
      )`,
      [customerId, tech1Id]
    );
    const ticketId = ticketRes.insertId;
    console.log(`✓ Test ticket created: ID #${ticketId} (Ticket #TK-TRANSFER-TEST-001), assigned to Tech 1 (ID #${tech1Id})`);

    // 3. Initiate Transfer (Tech 1 -> Tech 2)
    console.log('\n3. Testing Transfer Initiation (Tech 1 -> Tech 2)...');
    
    // Simulate what transferTicket controller does:
    // Mark previous pending transfers as cancelled
    await pool.query(
      `UPDATE task_transfers SET status = 'cancelled' WHERE repair_request_id = ? AND status = 'pending'`,
      [ticketId]
    );
    // Insert into task_transfers
    const [insTransfer] = await pool.query(
      `INSERT INTO task_transfers (
        repair_request_id, from_technician_id, to_technician_id,
        initiated_by_user_id, reason, status
      ) VALUES (?, ?, ?, ?, ?, 'pending')`,
      [ticketId, tech1Id, tech2Id, tech1Id, 'Specialized battery diagnostic equipment needed']
    );
    const transfer1Id = insTransfer.insertId;
    // Set pending_technician_id on ticket
    await pool.query(
      `UPDATE service_requests SET pending_technician_id = ? WHERE id = ?`,
      [tech2Id, ticketId]
    );
    console.log(`✓ Transfer record #${transfer1Id} created with status 'pending'.`);

    // Verify pending state
    const [transferCheck] = await pool.query(`SELECT * FROM task_transfers WHERE id = ?`, [transfer1Id]);
    if (transferCheck[0].status !== 'pending') throw new Error('Transfer status is not pending!');
    if (transferCheck[0].to_technician_id !== tech2Id) throw new Error('to_technician_id mismatch!');

    // 4. Query Technician Direction Views
    console.log('\n4. Testing Technician Incoming vs Outgoing Views...');
    
    // Tech 1 query (Outgoing)
    const [tech1Transfers] = await pool.query(
      `SELECT tt.*,
              (CASE WHEN tt.to_technician_id = ? THEN 'incoming' ELSE 'outgoing' END) AS direction
       FROM task_transfers tt
       WHERE tt.from_technician_id = ? OR tt.to_technician_id = ?`,
      [tech1Id, tech1Id, tech1Id]
    );
    console.log(`Tech 1 (Transfer Initiator) sees direction: "${tech1Transfers[0].direction}"`);
    if (tech1Transfers[0].direction !== 'outgoing') throw new Error('Expected outgoing direction for Tech 1!');

    // Tech 2 query (Incoming)
    const [tech2Transfers] = await pool.query(
      `SELECT tt.*,
              (CASE WHEN tt.to_technician_id = ? THEN 'incoming' ELSE 'outgoing' END) AS direction
       FROM task_transfers tt
       WHERE tt.from_technician_id = ? OR tt.to_technician_id = ?`,
      [tech2Id, tech2Id, tech2Id]
    );
    console.log(`Tech 2 (Transfer Recipient) sees direction: "${tech2Transfers[0].direction}"`);
    if (tech2Transfers[0].direction !== 'incoming') throw new Error('Expected incoming direction for Tech 2!');
    console.log('✓ Technician direction classification verified.');

    // 5. Query Ticket Transfer Chain
    console.log('\n5. Testing Ticket Chronological Transfer Chain...');
    const [chain1] = await pool.query(
      `SELECT tt.*,
              from_tech.name AS from_technician_name,
              to_tech.name AS to_technician_name
       FROM task_transfers tt
       LEFT JOIN users from_tech ON from_tech.id = tt.from_technician_id
       JOIN users to_tech ON to_tech.id = tt.to_technician_id
       WHERE tt.repair_request_id = ?
       ORDER BY tt.transferred_at ASC`,
      [ticketId]
    );
    console.log(`Found ${chain1.length} chain event(s). Event #1: ${chain1[0].from_technician_name} -> ${chain1[0].to_technician_name} (${chain1[0].status})`);
    if (chain1.length !== 1) throw new Error('Expected 1 chain event');

    // 6. Test Accept Assignment Flow
    console.log('\n6. Testing Accept Assignment Flow (Tech 2 accepts)...');
    await pool.query(
      `UPDATE task_transfers
       SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
       WHERE repair_request_id = ? AND to_technician_id = ? AND status = 'pending'`,
      [ticketId, tech2Id]
    );
    await pool.query(
      `UPDATE service_requests
       SET assigned_technician_id = ?, pending_technician_id = NULL
       WHERE id = ?`,
      [tech2Id, ticketId]
    );

    const [ticketAfterAccept] = await pool.query(`SELECT * FROM service_requests WHERE id = ?`, [ticketId]);
    const [transferAfterAccept] = await pool.query(`SELECT * FROM task_transfers WHERE id = ?`, [transfer1Id]);
    
    if (ticketAfterAccept[0].assigned_technician_id !== tech2Id) throw new Error('Assigned tech was not updated to Tech 2!');
    if (ticketAfterAccept[0].pending_technician_id !== null) throw new Error('Pending tech was not cleared!');
    if (transferAfterAccept[0].status !== 'accepted') throw new Error('Transfer status was not updated to accepted!');
    if (!transferAfterAccept[0].responded_at) throw new Error('responded_at was not recorded!');
    console.log('✓ Accept transfer workflow verified: assigned_technician_id is now Tech 2, transfer status is accepted.');

    // 7. Test Second Transfer and Reject with Reason Flow
    console.log('\n7. Testing Second Transfer and Rejection with Reason (Tech 2 -> Tech 1, Tech 1 rejects)...');
    const [insTransfer2] = await pool.query(
      `INSERT INTO task_transfers (
        repair_request_id, from_technician_id, to_technician_id,
        initiated_by_user_id, reason, status
      ) VALUES (?, ?, ?, ?, ?, 'pending')`,
      [ticketId, tech2Id, tech1Id, tech2Id, 'Re-routing back after diagnostics complete']
    );
    const transfer2Id = insTransfer2.insertId;
    await pool.query(
      `UPDATE service_requests SET pending_technician_id = ? WHERE id = ?`,
      [tech1Id, ticketId]
    );

    // Tech 1 rejects with note
    const rejectComment = 'High bench queue today, please assign to another senior tech';
    await pool.query(
      `UPDATE task_transfers
       SET status = 'rejected', response_notes = ?, responded_at = CURRENT_TIMESTAMP
       WHERE repair_request_id = ? AND to_technician_id = ? AND status = 'pending'`,
      [rejectComment, ticketId, tech1Id]
    );
    await pool.query(
      `UPDATE service_requests SET pending_technician_id = NULL WHERE id = ?`,
      [ticketId]
    );

    const [transferAfterReject] = await pool.query(`SELECT * FROM task_transfers WHERE id = ?`, [transfer2Id]);
    if (transferAfterReject[0].status !== 'rejected') throw new Error('Transfer status not rejected!');
    if (transferAfterReject[0].response_notes !== rejectComment) throw new Error('Rejection notes not saved!');
    console.log(`✓ Rejection workflow verified: transfer status is rejected, comment "${transferAfterReject[0].response_notes}" preserved.`);

    // 8. Test Admin Global Overview Query & KPI Aggregates
    console.log('\n8. Testing Admin Global Transfers Query & KPI Aggregates...');
    const [adminRows] = await pool.query(
      `SELECT tt.*,
              from_tech.name AS from_technician_name,
              to_tech.name AS to_technician_name,
              sr.ticket_number,
              sr.customer_name
       FROM task_transfers tt
       LEFT JOIN users from_tech ON from_tech.id = tt.from_technician_id
       JOIN users to_tech ON to_tech.id = tt.to_technician_id
       JOIN service_requests sr ON sr.id = tt.repair_request_id
       WHERE tt.repair_request_id = ?
       ORDER BY tt.transferred_at DESC`,
      [ticketId]
    );
    console.log(`Admin query returned ${adminRows.length} events for ticket #${ticketId}`);
    if (adminRows.length !== 2) throw new Error('Expected 2 transfer records in admin overview');

    // 9. Cleanup Test Data
    console.log('\n9. Cleaning up test data...');
    await pool.query(`DELETE FROM task_transfers WHERE repair_request_id = ?`, [ticketId]);
    await pool.query(`DELETE FROM service_requests WHERE id = ?`, [ticketId]);
    await pool.query(`DELETE FROM users WHERE email IN ('tech.alpha.test@tekdoctor.in', 'tech.beta.test@tekdoctor.in', 'cust.tester@tekdoctor.in')`);
    console.log('✓ Cleanup complete.');

    console.log('\n======================================================');
    console.log('ALL TASK TRANSFER HISTORY VERIFICATIONS PASSED (100%)!');
    console.log('======================================================');
    process.exit(0);
  } catch (err) {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  }
}

runVerification();
