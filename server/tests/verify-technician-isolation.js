const { pool } = require('../config/db.config');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/app.config');

const API_BASE = (process.env.TEST_API_BASE || 'http://127.0.0.1:5000') + '/api';

async function generateTokenForUser(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            token_version: user.token_version || 1,
            tokenVersion: user.token_version || 1
        },
        config.jwt.secret,
        { expiresIn: '1h' }
    );
}

async function runTechnicianVerification() {
    console.log('========================================================');
    console.log('   STARTING TECHNICIAN WORKBENCH & ISOLATION VERIFICATION');
    console.log('========================================================');

    let techAUser, techBUser;
    let techAToken, techBToken, adminToken;
    let ticketIndividualId, ticketB2BId, ticketUnassignedId, ticketTechBId;
    let testCompanyId;

    try {
        // 1. Ensure Tech A and Tech B exist
        console.log('\n[1/8] Setting up Tech A, Tech B, and Admin...');
        const [adminRows] = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
        if (adminRows.length === 0) {
            throw new Error('No admin user found in database.');
        }
        adminToken = await generateTokenForUser(adminRows[0]);

        // Find or create Tech A
        const [techRows] = await pool.query("SELECT * FROM users WHERE role = 'technician' LIMIT 2");
        if (techRows.length < 2) {
            // Create test technicians if needed
            const passwordHash = await bcrypt.hash('Tech@12345', 10);
            if (techRows.length === 0) {
                const [r1] = await pool.query(
                    "INSERT INTO users (name, email, password, role, is_active) VALUES ('Tech Alpha', 'tech.alpha@test.com', ?, 'technician', 1)",
                    [passwordHash]
                );
                const [createdA] = await pool.query('SELECT * FROM users WHERE id = ?', [r1.insertId]);
                techAUser = createdA[0];
            } else {
                techAUser = techRows[0];
            }

            const [r2] = await pool.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Tech Beta', 'tech.beta@test.com', ?, 'technician', 1)",
                [passwordHash]
            );
            const [createdB] = await pool.query('SELECT * FROM users WHERE id = ?', [r2.insertId]);
            techBUser = createdB[0];
        } else {
            techAUser = techRows[0];
            techBUser = techRows[1];
        }

        techAToken = await generateTokenForUser(techAUser);
        techBToken = await generateTokenForUser(techBUser);

        console.log(`✓ Tech A: ${techAUser.name} (ID: ${techAUser.id})`);
        console.log(`✓ Tech B: ${techBUser.name} (ID: ${techBUser.id})`);

        // Find or create a test company for B2B testing
        let testCompanyUserId;
        const [compRows] = await pool.query('SELECT * FROM company_profiles LIMIT 1');
        if (compRows.length > 0) {
            testCompanyUserId = compRows[0].user_id;
        } else {
            const dummyHash = await bcrypt.hash('dummy', 10);
            const [uRes] = await pool.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Apex Admin', 'apex@apex.com', ?, 'company', 1)",
                [dummyHash]
            );
            const [cRes] = await pool.query(
                "INSERT INTO company_profiles (user_id, company_name, phone_number, company_type, amc_status) VALUES (?, 'Apex Industries Ltd', '9876543210', 'Corporate', 'active')",
                [uRes.insertId]
            );
            testCompanyUserId = uRes.insertId;
        }

        // 2. Create test tickets
        console.log('\n[2/8] Creating test tickets (Individual, B2B, Unassigned, Tech B)...');
        await pool.query("DELETE FROM technician_work_logs WHERE repair_request_id IN (SELECT id FROM service_requests WHERE ticket_number LIKE 'TD-TEST-%')");
        await pool.query("DELETE FROM task_transfers WHERE repair_request_id IN (SELECT id FROM service_requests WHERE ticket_number LIKE 'TD-TEST-%')");
        await pool.query("DELETE FROM service_requests WHERE ticket_number LIKE 'TD-TEST-%'");
        
        // Ticket 1: Individual assigned to Tech A
        const [t1] = await pool.query(
            `INSERT INTO service_requests 
             (ticket_number, customer_name, mobile, email, city, device_category, brand, model_number, problem_type, problem_description, status, priority, assigned_technician_id)
             VALUES ('TD-TEST-A1', 'John Doe Individual', '9870000001', 'john@test.com', 'Mumbai', 'Laptop', 'Dell', 'Inspiron 15', 'Screen Flickering', 'Screen goes black intermittently', 'pending', 'medium', ?)`,
            [techAUser.id]
        );
        ticketIndividualId = t1.insertId;

        // Ticket 2: B2B company ticket assigned to Tech A
        const [t2] = await pool.query(
            `INSERT INTO service_requests 
             (ticket_number, customer_name, mobile, email, city, device_category, brand, model_number, problem_type, problem_description, status, priority, assigned_technician_id, company_id)
             VALUES ('TD-TEST-A2', 'Apex Procurement User', '9870000002', 'proc@apex.com', 'Bengaluru', 'Workstation', 'HP', 'ZBook Power', 'Overheating under load', 'Thermal throttling during rendering', 'pending', 'high', ?, ?)`,
            [techAUser.id, testCompanyUserId]
        );
        ticketB2BId = t2.insertId;

        // Ticket 3: Unassigned ticket
        const [t3] = await pool.query(
            `INSERT INTO service_requests 
             (ticket_number, customer_name, mobile, email, city, device_category, brand, model_number, problem_type, problem_description, status, priority, assigned_technician_id)
             VALUES ('TD-TEST-UN', 'Unassigned Customer', '9870000003', 'unassigned@test.com', 'Delhi', 'Phone', 'Apple', 'iPhone 13', 'Battery Replacement', 'Battery health 71%', 'pending', 'low', NULL)`
        );
        ticketUnassignedId = t3.insertId;

        // Ticket 4: Assigned to Tech B
        const [t4] = await pool.query(
            `INSERT INTO service_requests 
             (ticket_number, customer_name, mobile, email, city, device_category, brand, model_number, problem_type, problem_description, status, priority, assigned_technician_id)
             VALUES ('TD-TEST-B1', 'Beta Customer', '9870000004', 'beta@test.com', 'Pune', 'Tablet', 'Samsung', 'Galaxy Tab S8', 'Port Damaged', 'Charging cable loose', 'pending', 'urgent', ?)`,
            [techBUser.id]
        );
        ticketTechBId = t4.insertId;

        console.log(`✓ Ticket 1 (Individual, Tech A): ID ${ticketIndividualId}, TD-TEST-A1`);
        console.log(`✓ Ticket 2 (B2B Company, Tech A): ID ${ticketB2BId}, TD-TEST-A2`);
        console.log(`✓ Ticket 3 (Unassigned): ID ${ticketUnassignedId}, TD-TEST-UN`);
        console.log(`✓ Ticket 4 (Tech B): ID ${ticketTechBId}, TD-TEST-B1`);

        // 3. Test Tech A's task listing: GET /api/repair-request/my-tasks
        console.log('\n[3/8] Testing Tech A task listing isolation (GET /api/repair-request/my-tasks)...');
        const tasksRes = await fetch(`${API_BASE}/repair-request/my-tasks`, {
            headers: { Authorization: `Bearer ${techAToken}` }
        });
        const tasksData = await tasksRes.json();
        if (tasksRes.status !== 200 || !tasksData.data) {
            throw new Error(`Failed to get tasks for Tech A: ${JSON.stringify(tasksData)}`);
        }

        const techATaskIds = tasksData.data.map(t => t.id);
        console.log(`Tech A task list IDs: [${techATaskIds.join(', ')}]`);

        // Assertions for Tech A task list
        if (!techATaskIds.includes(ticketIndividualId)) {
            throw new Error(`FAIL: Tech A cannot see their own assigned individual ticket ${ticketIndividualId}`);
        }
        if (!techATaskIds.includes(ticketB2BId)) {
            throw new Error(`FAIL: Tech A cannot see their own assigned B2B ticket ${ticketB2BId}`);
        }
        if (techATaskIds.includes(ticketUnassignedId)) {
            throw new Error(`FAIL: Tech A task list contains UNASSIGNED ticket ${ticketUnassignedId}`);
        }
        if (techATaskIds.includes(ticketTechBId)) {
            throw new Error(`FAIL: Tech A task list contains TECH B's ticket ${ticketTechBId}`);
        }
        console.log('✓ PASS: Tech A sees only tickets assigned to them (Individual and B2B).');
        console.log('✓ PASS: Unassigned and Tech B tickets are completely omitted from Tech A list.');

        // 4. Verify B2B company data fields in Tech A's task
        console.log('\n[4/8] Verifying B2B Company fields on Ticket 2...');
        const b2bTask = tasksData.data.find(t => t.id === ticketB2BId);
        if (!b2bTask.companyName && !b2bTask.company_name) {
            console.warn('Note: companyName not populated on row, checking companyId...');
        }
        if (!b2bTask.companyId && !b2bTask.company_id) {
            throw new Error('FAIL: B2B task is missing companyId');
        }
        console.log(`✓ PASS: B2B Ticket contains companyId: ${b2bTask.companyId || b2bTask.company_id}, Company: ${b2bTask.companyName || b2bTask.company_name}`);

        // 5. Test Direct URL / API Access Authorization (GET /api/repair-request/:id)
        console.log('\n[5/8] Testing Direct URL/API Access Authorization (canTechnicianAccessTicket)...');
        
        // 5a. Tech A accessing own Ticket 1 -> 200 OK
        const ownRes = await fetch(`${API_BASE}/repair-request/${ticketIndividualId}`, {
            headers: { Authorization: `Bearer ${techAToken}` }
        });
        if (ownRes.status !== 200) {
            throw new Error(`FAIL: Tech A direct access to own ticket returned ${ownRes.status}`);
        }
        console.log('✓ PASS: Tech A direct access to own ticket returns 200 OK.');

        // 5b. Tech A accessing unassigned Ticket 3 -> 403 Forbidden
        const unassignedAccess = await fetch(`${API_BASE}/repair-request/${ticketUnassignedId}`, {
            headers: { Authorization: `Bearer ${techAToken}` }
        });
        if (unassignedAccess.status !== 403) {
            throw new Error(`SECURITY FAIL: Tech A accessing unassigned ticket returned ${unassignedAccess.status}, expected 403`);
        }
        console.log('✓ PASS: Tech A accessing unassigned ticket returns 403 Forbidden (Blocked).');

        // 5c. Tech A accessing Tech B's Ticket 4 -> 403 Forbidden
        const otherTechAccess = await fetch(`${API_BASE}/repair-request/${ticketTechBId}`, {
            headers: { Authorization: `Bearer ${techAToken}` }
        });
        if (otherTechAccess.status !== 403) {
            throw new Error(`SECURITY FAIL: Tech A accessing Tech B ticket returned ${otherTechAccess.status}, expected 403`);
        }
        console.log("✓ PASS: Tech A accessing Tech B's ticket returns 403 Forbidden (IDOR Protected).");

        // 5d. Tech B accessing Tech A's Ticket 1 -> 403 Forbidden
        const techBAccessTechA = await fetch(`${API_BASE}/repair-request/${ticketIndividualId}`, {
            headers: { Authorization: `Bearer ${techBToken}` }
        });
        if (techBAccessTechA.status !== 403) {
            throw new Error(`SECURITY FAIL: Tech B accessing Tech A ticket returned ${techBAccessTechA.status}, expected 403`);
        }
        console.log("✓ PASS: Tech B accessing Tech A's ticket returns 403 Forbidden (Mutual Isolation).");

        // 6. Test Diagnosis & Estimation Workflow Authorization
        console.log('\n[6/8] Testing Diagnosis & Estimation Workflow Authorization...');
        
        // 6a. Tech B attempting to diagnose Ticket 1 (Tech A's ticket) -> 403
        const unauthorizedDiag = await fetch(`${API_BASE}/repair-request/${ticketIndividualId}/diagnosis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${techBToken}`
            },
            body: JSON.stringify({
                diagnosis: 'Faulty screen flex cable',
                estimatedCost: 1500
            })
        });
        if (unauthorizedDiag.status !== 403) {
            throw new Error(`SECURITY FAIL: Tech B submitting diagnosis on Tech A ticket returned ${unauthorizedDiag.status}, expected 403`);
        }
        console.log("✓ PASS: Tech B submitting diagnosis on Tech A's ticket blocked with 403 Forbidden.");

        // 6b. Tech A submitting diagnosis on Ticket 1 -> 200 OK
        const validDiag = await fetch(`${API_BASE}/repair-request/${ticketIndividualId}/diagnosis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${techAToken}`
            },
            body: JSON.stringify({
                diagnosis: 'Inspected display panel and replaced faulty flex cable ribbon.',
                identifiedIssues: 'Damaged eDP connector pins',
                requiredWork: 'Micro-soldering and ribbon replacement',
                requiredParts: 'eDP Display Ribbon 40-pin',
                estimatedCost: 2200,
                additionalCharges: 300,
                estimatedCompletionDate: new Date(Date.now() + 86400000).toISOString()
            })
        });
        const validDiagData = await validDiag.json();
        if (validDiag.status !== 200 || !validDiagData.success) {
            throw new Error(`FAIL: Tech A diagnosis submission failed: ${JSON.stringify(validDiagData)}`);
        }
        console.log('✓ PASS: Tech A diagnosis & estimate submission succeeded (200 OK).');

        // 7. Test Ticket Reassignment / Unassignment Isolation
        console.log('\n[7/8] Testing Ticket Reassignment Isolation...');
        
        // Admin reassigns Ticket 1 from Tech A to Tech B
        await pool.query(
            'UPDATE service_requests SET assigned_technician_id = ? WHERE id = ?',
            [techBUser.id, ticketIndividualId]
        );

        // Fetch Tech A's tasks again
        const tasksResAfterReassign = await fetch(`${API_BASE}/repair-request/my-tasks`, {
            headers: { Authorization: `Bearer ${techAToken}` }
        });
        const tasksDataAfterReassign = await tasksResAfterReassign.json();
        const techATaskIdsAfter = tasksDataAfterReassign.data.map(t => t.id);

        if (techATaskIdsAfter.includes(ticketIndividualId)) {
            throw new Error(`FAIL: Reassigned ticket ${ticketIndividualId} still visible in Tech A's list!`);
        }
        console.log("✓ PASS: Reassigned ticket immediately disappeared from old technician's list.");

        // Tech A now tries direct access to previously assigned Ticket 1 -> 403 Forbidden
        const techAAccessReassigned = await fetch(`${API_BASE}/repair-request/${ticketIndividualId}`, {
            headers: { Authorization: `Bearer ${techAToken}` }
        });
        if (techAAccessReassigned.status !== 403) {
            throw new Error(`SECURITY FAIL: Tech A can still directly access reassigned ticket! Returned ${techAAccessReassigned.status}, expected 403`);
        }
        console.log('✓ PASS: Tech A direct access to reassigned ticket blocked with 403 Forbidden.');

        // Tech B fetches tasks -> now contains Ticket 1
        const techBTasksRes = await fetch(`${API_BASE}/repair-request/my-tasks`, {
            headers: { Authorization: `Bearer ${techBToken}` }
        });
        const techBTasksData = await techBTasksRes.json();
        const techBTaskIds = techBTasksData.data.map(t => t.id);

        if (!techBTaskIds.includes(ticketIndividualId)) {
            throw new Error(`FAIL: Newly assigned ticket ${ticketIndividualId} not visible in Tech B's list!`);
        }
        console.log("✓ PASS: Newly assigned ticket immediately appears in new technician's list.");

        // Tech B direct access now works (200 OK)
        const techBAccessReassigned = await fetch(`${API_BASE}/repair-request/${ticketIndividualId}`, {
            headers: { Authorization: `Bearer ${techBToken}` }
        });
        if (techBAccessReassigned.status !== 200) {
            throw new Error(`FAIL: Tech B cannot directly access newly assigned ticket! Returned ${techBAccessReassigned.status}`);
        }
        console.log('✓ PASS: New technician has full direct access to the reassigned ticket (200 OK).');

        // 8. Test Unassignment
        console.log('\n[8/8] Testing Ticket Unassignment Isolation...');
        await pool.query(
            'UPDATE service_requests SET assigned_technician_id = NULL WHERE id = ?',
            [ticketIndividualId]
        );

        const techBTasksAfterUnassign = await fetch(`${API_BASE}/repair-request/my-tasks`, {
            headers: { Authorization: `Bearer ${techBToken}` }
        });
        const techBTasksDataAfterUnassign = await techBTasksAfterUnassign.json();
        const techBTaskIdsAfterUnassign = techBTasksDataAfterUnassign.data.map(t => t.id);

        if (techBTaskIdsAfterUnassign.includes(ticketIndividualId)) {
            throw new Error(`FAIL: Unassigned ticket still visible in Tech B list!`);
        }
        console.log("✓ PASS: Unassigned ticket immediately disappeared from technician's list.");

        console.log('\n========================================================');
        console.log('   ALL 8 TECHNICIAN ISOLATION CHECKS PASSED PERFECTLY!');
        console.log('========================================================');

    } finally {
        // Cleanup test tickets
        console.log('\nCleaning up test tickets...');
        try {
            await pool.query("DELETE FROM technician_work_logs WHERE repair_request_id IN (SELECT id FROM service_requests WHERE ticket_number LIKE 'TD-TEST-%')");
            await pool.query("DELETE FROM task_transfers WHERE repair_request_id IN (SELECT id FROM service_requests WHERE ticket_number LIKE 'TD-TEST-%')");
            await pool.query("DELETE FROM service_requests WHERE ticket_number LIKE 'TD-TEST-%'");
            console.log('Cleaned up all TD-TEST-% tickets.');
        } catch (cleanupErr) {
            console.error('Cleanup error:', cleanupErr.message);
        }
        await pool.end();
    }
}

runTechnicianVerification()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('\n❌ VERIFICATION ERROR:', err);
        process.exit(1);
    });
