const assert = require('assert');
const { pool } = require('../config/db.config');
const BASE_URL = 'http://localhost:5000/api';

async function testAdminTicketActions() {
    console.log('--- STARTING AUTOMATED ADMIN TICKET ACTIONS VERIFICATION ---');
    let connection;
    let token = null;
    let testTicketId = null;

    try {
        connection = await pool.getConnection();

        // 1. Log in as Admin
        const loginRes = await fetch(`${BASE_URL}/auth/signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
            body: JSON.stringify({
                email: 'admin@tekdoctor.in',
                password: 'Admin@123'
            })
        });

        assert.strictEqual(loginRes.status, 200, 'Admin login should succeed');
        const loginJson = await loginRes.json();
        token = loginJson.data.token;
        console.log('[PASS] Logged in as Admin successfully.');

        // 2. Find or create a test repair request ticket
        const [existing] = await connection.query('SELECT id FROM service_requests LIMIT 1');
        if (existing.length > 0) {
            testTicketId = existing[0].id;
            console.log(`Using existing ticket ID: ${testTicketId}`);
        } else {
            // Insert a mock repair request
            const [res] = await connection.query(`
        INSERT INTO service_requests (customer_name, mobile, city, device_category, brand, problem_type, status, priority)
        VALUES ('Test Guest Customer', '9876543210', 'Bangalore', 'Mobile', 'Apple', 'Screen Damage', 'pending', 'Standard')
      `);
            testTicketId = res.insertId;
            console.log(`Created new mock ticket ID: ${testTicketId}`);
        }

        // 3. Test Edit Ticket (PUT /api/repair-request/:id)
        console.log(`Editing ticket #${testTicketId}...`);
        const editPayload = {
            customerName: 'Test Guest Customer Edited',
            mobile: '9876543211',
            city: 'Delhi',
            deviceCategory: 'Laptop',
            brand: 'Dell',
            problemType: 'Battery Issue',
            problemDescription: 'Battery dies quickly',
            priority: 'Urgent'
        };

        const editRes = await fetch(`${BASE_URL}/repair-request/${testTicketId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Connection': 'close'
            },
            body: JSON.stringify(editPayload)
        });

        assert.strictEqual(editRes.status, 200, 'Edit ticket API should return 200 OK');
        const editJson = await editRes.json();
        assert.ok(editJson.success, 'Edit ticket operation should report success');
        console.log('[PASS] Edited ticket details successfully.');

        // Check DB state for edits
        const [updatedRow] = await connection.query('SELECT customer_name, brand, priority FROM service_requests WHERE id = ?', [testTicketId]);
        assert.strictEqual(updatedRow[0].customer_name, 'Test Guest Customer Edited');
        assert.strictEqual(updatedRow[0].brand, 'Dell');
        assert.strictEqual(updatedRow[0].priority, 'Urgent');
        console.log('[PASS] Verified edits in Database.');

        // 4. Test Technician Assignment and status update (PUT /api/repair-request/:id/status)
        console.log(`Assigning technician ID 7 (Alam) to ticket #${testTicketId}...`);
        const assignPayload = {
            status: 'in_progress',
            assignedTechnicianId: 7
        };

        const assignRes = await fetch(`${BASE_URL}/repair-request/${testTicketId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Connection': 'close'
            },
            body: JSON.stringify(assignPayload)
        });

        assert.strictEqual(assignRes.status, 200, 'Assign ticket API should return 200 OK');
        const assignJson = await assignRes.json();
        assert.ok(assignJson.success, 'Assign ticket status response should report success');
        console.log('[PASS] Assigned technician and status updated.');

        // Check DB state for assignment
        const [assignedRow] = await connection.query('SELECT status, assigned_technician_id FROM service_requests WHERE id = ?', [testTicketId]);
        assert.strictEqual(assignedRow[0].status, 'in_progress');
        assert.strictEqual(assignedRow[0].assigned_technician_id, 7);
        console.log('[PASS] Verified assignment and status in Database.');

        console.log('\n🌟 ALL ADMIN TICKET ACTIONS WORKFLOW API TESTS PASSED!');
        setTimeout(() => { process.exit(0); }, 150);
    } catch (error) {
        console.error('\n🚨 TEST FAILURE:', error.message);
        setTimeout(() => { process.exit(1); }, 150);
    } finally {
        if (connection) connection.release();
        await pool.end();
    }
}

testAdminTicketActions();
