/**
 * Verification Script for Technician Decision Restriction & Ticket Status Tracking
 * Tests:
 * 1. Technician A vs Technician B decision and status modification restrictions
 * 2. Work log, customer notes, milestone, and customer notification access guards
 * 3. Admin bypass and full administrative control
 * 4. Ticket status auto-tracking data retrieval
 */

const { pool } = require('../config/db.config');
const dbInit = require('../models/db.init');
const repairController = require('../controllers/repair.controller');

// Helper to mock express req and res
function mockReqRes({ user, body = {}, params = {}, query = {}, file = null }) {
  const req = {
    user,
    body,
    params,
    query,
    file,
    ip: '127.0.0.1',
    headers: {}
  };

  let statusCode = 200;
  let responseData = null;

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
    getResponseData() {
      return responseData;
    }
  };

  const next = (err) => {
    if (err) {
      statusCode = 500;
      responseData = { success: false, message: err.message };
    }
  };

  return { req, res, next };
}

async function runVerification() {
  console.log('--- STARTING TECHNICIAN DECISION RESTRICTIONS & TRACKING VERIFICATION ---');

  try {
    // 1. Ensure DB initialized
    console.log('1. Initializing DB schema...');
    await dbInit();

    // Pre-cleanup in case of previous aborted runs
    await pool.query(`DELETE FROM service_requests WHERE ticket_number = 'TK-RESTR-TEST-001'`);
    await pool.query(`DELETE FROM users WHERE email IN ('tech.alpha.restr@tekdoctor.in', 'tech.beta.restr@tekdoctor.in', 'admin.verifier@tekdoctor.in', 'cust.restr@tekdoctor.in')`);

    // 2. Setup Test Data (2 technicians + 1 admin + 1 customer + 1 ticket)
    console.log('\n2. Setting up test entities...');

    // Tech Alpha (Owner)
    await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES ('Tech Alpha', 'tech.alpha.restr@tekdoctor.in', 'dummy_hash', 'technician', 1)
       ON DUPLICATE KEY UPDATE name = 'Tech Alpha'`
    );
    const [t1Rows] = await pool.query(`SELECT id, role, name, email FROM users WHERE email = 'tech.alpha.restr@tekdoctor.in'`);
    const techAlpha = t1Rows[0];

    // Tech Beta (Unauthorized intruder)
    await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES ('Tech Beta', 'tech.beta.restr@tekdoctor.in', 'dummy_hash', 'technician', 1)
       ON DUPLICATE KEY UPDATE name = 'Tech Beta'`
    );
    const [t2Rows] = await pool.query(`SELECT id, role, name, email FROM users WHERE email = 'tech.beta.restr@tekdoctor.in'`);
    const techBeta = t2Rows[0];

    // Admin User
    await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES ('Admin Verifier', 'admin.verifier@tekdoctor.in', 'dummy_hash', 'admin', 1)
       ON DUPLICATE KEY UPDATE name = 'Admin Verifier'`
    );
    const [admRows] = await pool.query(`SELECT id, role, name, email FROM users WHERE email = 'admin.verifier@tekdoctor.in'`);
    const adminUser = admRows[0];

    // Test Customer
    await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES ('Customer Restr', 'cust.restr@tekdoctor.in', 'dummy_hash', 'customer', 1)
       ON DUPLICATE KEY UPDATE name = 'Customer Restr'`
    );
    const [cRows] = await pool.query(`SELECT id, role, name, email FROM users WHERE email = 'cust.restr@tekdoctor.in'`);
    const customer = cRows[0];

    // Test Repair Ticket initially assigned to Tech Alpha
    const [ticketRes] = await pool.query(
      `INSERT INTO service_requests (
        user_id, ticket_number, customer_name, mobile, email, city,
        device_category, brand, model_number, problem_type,
        service_type, priority, status, assigned_technician_id
      ) VALUES (
        ?, 'TK-RESTR-TEST-001', 'Customer Restr', '9876543210', 'cust.restr@tekdoctor.in', 'Bengaluru',
        'Laptop / Computer', 'Dell', 'XPS 15', 'Screen Flickering',
        'Carry In', 'High', 'pending', ?
      )`,
      [customer.id, techAlpha.id]
    );
    const ticketId = ticketRes.insertId;
    console.log(`✓ Test ticket created: ID #${ticketId}, assigned to Tech Alpha (ID #${techAlpha.id})`);

    // 3. Test updateRequestStatus Permission Restrictions
    console.log('\n3. Testing updateRequestStatus Decision Restrictions...');

    // Test 3A: Tech Beta (unauthorized) tries to change status
    {
      const { req, res, next } = mockReqRes({
        user: techBeta,
        params: { id: ticketId },
        body: { status: 'in_progress' }
      });
      await repairController.updateRequestStatus(req, res, next);
      console.log(`Tech Beta status change attempt response status: ${res.getStatusCode()}`);
      if (res.getStatusCode() !== 403) {
        throw new Error(`Expected 403 for Tech Beta status change, got ${res.getStatusCode()}`);
      }
      console.log('✓ Tech Beta was successfully blocked with 403 Forbidden.');
    }

    // Test 3B: Tech Alpha (authorized owner) changes status to in_progress
    {
      const { req, res, next } = mockReqRes({
        user: techAlpha,
        params: { id: ticketId },
        body: { status: 'in_progress' }
      });
      await repairController.updateRequestStatus(req, res, next);
      console.log(`Tech Alpha status change response status: ${res.getStatusCode()}`);
      if (res.getStatusCode() !== 200) {
        throw new Error(`Expected 200 for Tech Alpha status change, got ${res.getStatusCode()}`);
      }
      console.log('✓ Tech Alpha successfully updated status to in_progress.');
    }

    // Test 3C: Tech Alpha tries direct reassignment without task transfer
    {
      const { req, res, next } = mockReqRes({
        user: techAlpha,
        params: { id: ticketId },
        body: { status: 'in_progress', assignedTechnicianId: techBeta.id }
      });
      await repairController.updateRequestStatus(req, res, next);
      console.log(`Tech Alpha direct reassignment attempt response status: ${res.getStatusCode()}`);
      if (res.getStatusCode() !== 403) {
        throw new Error(`Expected 403 for technician direct reassignment, got ${res.getStatusCode()}`);
      }
      console.log('✓ Direct reassignment by technician blocked with 403 (enforces task transfer workflow).');
    }

    // Test 3D: Admin changes status & technician directly
    {
      const { req, res, next } = mockReqRes({
        user: adminUser,
        params: { id: ticketId },
        body: { status: 'in_progress' }
      });
      await repairController.updateRequestStatus(req, res, next);
      if (res.getStatusCode() !== 200) {
        throw new Error(`Expected 200 for Admin status update, got ${res.getStatusCode()}`);
      }
      console.log('✓ Admin successfully bypassed technician restrictions with full authority.');
    }

    // 4. Test Work Log Creation Restrictions
    console.log('\n4. Testing createWorkLog Restrictions...');

    // Test 4A: Tech Beta tries to add work log to Tech Alpha's ticket
    {
      const { req, res, next } = mockReqRes({
        user: techBeta,
        params: { id: ticketId },
        body: { repairStage: 'Diagnostic', actionPerformed: 'Unauthorized disassembly attempt' }
      });
      await repairController.createWorkLog(req, res, next);
      if (res.getStatusCode() !== 403) {
        throw new Error(`Expected 403 for Tech Beta work log creation, got ${res.getStatusCode()}`);
      }
      console.log('✓ Tech Beta work log creation blocked with 403 Forbidden.');
    }

    // Test 4B: Tech Alpha adds valid work log
    {
      const { req, res, next } = mockReqRes({
        user: techAlpha,
        params: { id: ticketId },
        body: { repairStage: 'Inspection', actionPerformed: 'Screen ribbon cable reseated', timeSpent: '45m' }
      });
      await repairController.createWorkLog(req, res, next);
      if (res.getStatusCode() !== 201) {
        throw new Error(`Expected 201 for Tech Alpha work log creation, got ${res.getStatusCode()}`);
      }
      console.log('✓ Tech Alpha successfully created work log entry.');
    }

    // 5. Test Customer Description Updates
    console.log('\n5. Testing updateCustomerDescription Restrictions...');

    // Test 5A: Tech Beta tries to update customer description
    {
      const { req, res, next } = mockReqRes({
        user: techBeta,
        params: { id: ticketId },
        body: { customerRepairDescription: 'Tampered note from unassigned tech' }
      });
      await repairController.updateCustomerDescription(req, res, next);
      if (res.getStatusCode() !== 403) {
        throw new Error(`Expected 403 for Tech Beta customer description update, got ${res.getStatusCode()}`);
      }
      console.log('✓ Tech Beta customer note modification blocked with 403 Forbidden.');
    }

    // Test 5B: Tech Alpha updates customer description
    {
      const { req, res, next } = mockReqRes({
        user: techAlpha,
        params: { id: ticketId },
        body: { customerRepairDescription: 'Display panel cable diagnosed and adjusted. Testing for stability.' }
      });
      await repairController.updateCustomerDescription(req, res, next);
      if (res.getStatusCode() !== 200) {
        throw new Error(`Expected 200 for Tech Alpha customer description update, got ${res.getStatusCode()}`);
      }
      console.log('✓ Tech Alpha successfully updated customer note.');
    }

    // 6. Test Milestone Notification Dispatch
    console.log('\n6. Testing sendMilestoneNotification Restrictions...');

    // Test 6A: Tech Beta tries to dispatch milestone
    {
      const { req, res, next } = mockReqRes({
        user: techBeta,
        params: { id: ticketId },
        body: { milestone: 'parts_ordered', notes: 'Parts on the way' }
      });
      await repairController.sendMilestoneNotification(req, res, next);
      if (res.getStatusCode() !== 403) {
        throw new Error(`Expected 403 for Tech Beta milestone dispatch, got ${res.getStatusCode()}`);
      }
      console.log('✓ Tech Beta milestone notification blocked with 403 Forbidden.');
    }

    // Test 6B: Tech Alpha sends milestone
    {
      const { req, res, next } = mockReqRes({
        user: techAlpha,
        params: { id: ticketId },
        body: { milestone: 'diagnosis_completed', notes: 'Initial inspection complete' }
      });
      await repairController.sendMilestoneNotification(req, res, next);
      if (res.getStatusCode() !== 200) {
        throw new Error(`Expected 200 for Tech Alpha milestone dispatch, got ${res.getStatusCode()}`);
      }
      console.log('✓ Tech Alpha successfully sent milestone notification.');
    }

    // 7. Test Customer Completion Notification
    console.log('\n7. Testing notifyCustomer Restrictions...');

    // Test 7A: Tech Beta tries to send completion notice
    {
      const { req, res, next } = mockReqRes({
        user: techBeta,
        params: { id: ticketId },
        body: {}
      });
      await repairController.notifyCustomer(req, res, next);
      if (res.getStatusCode() !== 403) {
        throw new Error(`Expected 403 for Tech Beta notifyCustomer, got ${res.getStatusCode()}`);
      }
      console.log('✓ Tech Beta customer completion notification blocked with 403 Forbidden.');
    }

    // 8. Test Public Tracking Endpoint for Ticket Status
    console.log('\n8. Testing trackRequest ticket status auto-fetch...');
    {
      const { req, res, next } = mockReqRes({
        params: { id: 'TK-RESTR-TEST-001' }
      });
      await repairController.trackRequest(req, res, next);
      if (res.getStatusCode() !== 200) {
        throw new Error(`Expected 200 for trackRequest, got ${res.getStatusCode()}`);
      }
      const data = res.getResponseData()?.data;
      if (!data) throw new Error('trackRequest did not return data');
      if (data.status !== 'in_progress') throw new Error(`Expected status 'in_progress', got ${data.status}`);
      if (data.customerRepairDescription !== 'Display panel cable diagnosed and adjusted. Testing for stability.') {
        throw new Error('customerRepairDescription mismatch');
      }
      console.log(`✓ trackRequest returned latest status: "${data.status}", description: "${data.customerRepairDescription}"`);
    }

    // 9. Cleanup
    console.log('\n9. Cleaning up test data...');
    await pool.query(`DELETE FROM technician_work_logs WHERE repair_request_id = ?`, [ticketId]);
    await pool.query(`DELETE FROM notifications WHERE ticket_id = ?`, [ticketId]);
    await pool.query(`DELETE FROM service_requests WHERE id = ?`, [ticketId]);
    await pool.query(`DELETE FROM users WHERE email IN ('tech.alpha.restr@tekdoctor.in', 'tech.beta.restr@tekdoctor.in', 'admin.verifier@tekdoctor.in', 'cust.restr@tekdoctor.in')`);
    console.log('✓ Cleanup complete.');

    console.log('\n==================================================================');
    console.log('ALL TECHNICIAN DECISION RESTRICTION VERIFICATIONS PASSED (100%)!');
    console.log('==================================================================');
    process.exit(0);
  } catch (err) {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  }
}

runVerification();
