const assert = require('assert');
const { pool } = require('../config/db.config');
const BASE_URL = 'http://localhost:5000/api';

async function testTechnicianFeatures() {
    console.log('--- STARTING AUTOMATED TECHNICIAN MODULE VERIFICATION ---');
    let connection;
    let adminToken = null;
    let techToken = null;
    let techUserId = null;
    let requestId = null;
    let customerUserId = null;

    try {
        connection = await pool.getConnection();

        // 1. Log in as Admin
        console.log('Logging in as Admin...');
        const adminLoginRes = await fetch(`${BASE_URL}/auth/signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
            body: JSON.stringify({
                email: 'admin@tekdoctor.in',
                password: 'Admin@123'
            })
        });
        assert.strictEqual(adminLoginRes.status, 200, 'Admin login should succeed');
        const adminLoginJson = await adminLoginRes.json();
        adminToken = adminLoginJson.data.token;
        console.log('[PASS] Logged in as Admin successfully.');

        // Get or Create test customer user for in-app notification linking
        const [customers] = await connection.query("SELECT id FROM users WHERE email = 'customer@test.com' LIMIT 1");
        if (customers.length > 0) {
            customerUserId = customers[0].id;
        } else {
            // Seed a test customer
            const bcrypt = require('bcryptjs');
            const passHash = await bcrypt.hash('Customer@123', 10);
            const [custInsert] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Test Customer', 'customer@test.com', ?, 'customer', 1)",
                [passHash]
            );
            customerUserId = custInsert.insertId;
            console.log(`[PASS] Seeded test customer user ID: ${customerUserId}.`);
        }

        // 2. Create a Technician via Admin API (or use existing test technician)
        console.log('Creating/retrieving test technician...');
        const techEmail = 'test_tech_feat@tekdoctor.in';
        const techPassword = 'TechPassword@123';

        // Check if tech already exists in DB to prevent duplicates
        const [existingTechs] = await connection.query("SELECT id FROM users WHERE email = ?", [techEmail]);
        if (existingTechs.length === 0) {
            const createTechRes = await fetch(`${BASE_URL}/technicians`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`,
                    'Connection': 'close'
                },
                body: JSON.stringify({
                    name: 'Test Technician',
                    email: techEmail,
                    password: techPassword
                })
            });

            assert.ok(createTechRes.status === 200 || createTechRes.status === 201, 'Technician creation should succeed');
            const createTechJson = await createTechRes.json();
            techUserId = createTechJson.data.id;
            console.log(`[PASS] Created test technician via API. User ID: ${techUserId}`);
        } else {
            techUserId = existingTechs[0].id;
            // Reset password if needed, or simply log in with known test credentials
            // (we can seed password hash in DB directly to ensure we can log in if needed)
            const bcrypt = require('bcryptjs');
            const passHash = await bcrypt.hash(techPassword, 10);
            await connection.query("UPDATE users SET password = ? WHERE id = ?", [passHash, techUserId]);
            console.log(`[PASS] Found existing technician. Reset password. User ID: ${techUserId}`);
        }

        // 3. Log in as Technician
        console.log('Logging in as Technician...');
        const techLoginRes = await fetch(`${BASE_URL}/auth/signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
            body: JSON.stringify({
                email: techEmail,
                password: techPassword
            })
        });
        assert.strictEqual(techLoginRes.status, 200, 'Technician login should succeed');
        const techLoginJson = await techLoginRes.json();
        techToken = techLoginJson.data.token;
        console.log('[PASS] Logged in as Technician successfully.');

        // 4. Create a repair request linked to the test customer
        console.log('Submitting repair request for test customer...');
        const repairRes = await fetch(`${BASE_URL}/repair-request`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`,
                'Connection': 'close'
            },
            body: JSON.stringify({
                customerName: 'Test Customer',
                mobile: '9876543210',
                email: 'customer@test.com',
                city: 'Bangalore',
                deviceCategory: 'Smartphone',
                brand: 'Samsung',
                modelNumber: 'Galaxy S23',
                problemType: 'Cracked Screen',
                problemDescription: 'Front glass is completely broken.',
                serviceType: 'Carry-In',
                priority: 'Priority',
                preferredContactMethod: 'email'
            })
        });
        assert.strictEqual(repairRes.status, 201, 'Repair request submission should succeed');
        const repairJson = await repairRes.json();
        requestId = repairJson.requestId;
        console.log(`[PASS] Repair request created successfully. ID: ${requestId}`);

        // Set user_id in DB for notification routing
        await connection.query("UPDATE service_requests SET user_id = ? WHERE id = ?", [customerUserId, requestId]);

        // 5. Admin assigns the request to the Technician
        console.log('Assigning repair request to technician...');
        const assignRes = await fetch(`${BASE_URL}/repair-request/${requestId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`,
                'Connection': 'close'
            },
            body: JSON.stringify({
                status: 'in_progress',
                assignedTechnicianId: techUserId
            })
        });
        assert.strictEqual(assignRes.status, 200, 'Assignment should succeed');
        console.log('[PASS] Request assigned to technician.');

        // 6. Technician posts a work log entry
        console.log('Adding technician work log...');
        const workLogPayload = {
            repairStage: 'Diagnosis',
            actionPerformed: 'Disassembled device and checked mother board connections.',
            partsReplaced: 'None',
            timeSpent: '30 mins',
            notes: 'Motherboard looks intact. Screen glass requires replacement.'
        };
        const workLogRes = await fetch(`${BASE_URL}/repair-request/${requestId}/work-logs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${techToken}`,
                'Connection': 'close'
            },
            body: JSON.stringify(workLogPayload)
        });
        assert.strictEqual(workLogRes.status, 201, 'Adding work log should succeed');
        console.log('[PASS] Work log created.');

        // 7. Retrieve work log history
        console.log('Fetching work log history...');
        const getLogsRes = await fetch(`${BASE_URL}/repair-request/${requestId}/work-logs`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${techToken}`,
                'Connection': 'close'
            }
        });
        assert.strictEqual(getLogsRes.status, 200, 'Retrieving work logs should succeed');
        const logsJson = await getLogsRes.json();
        assert.strictEqual(logsJson.data.length, 1, 'Should have exactly 1 work log entry');
        assert.strictEqual(logsJson.data[0].action_performed, workLogPayload.actionPerformed, 'Action performed should match');
        console.log('[PASS] Work log verified successfully.');

        // 8. Update Customer Repair Description
        console.log('Updating customer repair description...');
        const descPayload = {
            customerRepairDescription: 'Internal diagnosis complete. The phone motherboard is functioning perfectly. A brand new Samsung OEM screen replacment will be installed to resolve the display issues.'
        };
        const descRes = await fetch(`${BASE_URL}/repair-request/${requestId}/customer-description`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${techToken}`,
                'Connection': 'close'
            },
            body: JSON.stringify(descPayload)
        });
        assert.strictEqual(descRes.status, 200, 'Updating customer description should succeed');
        console.log('[PASS] Customer repair description updated.');

        // Verify Description appears in repair search
        const requestsRes = await fetch(`${BASE_URL}/repair-request`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Connection': 'close'
            }
        });
        const requestsJson = await requestsRes.json();
        // Fetch paginated wrapper structure
        const requestsList = requestsJson.data.data;
        const targetReq = requestsList.find(r => r.id === requestId);
        assert.ok(targetReq, 'Created request should be in list');
        assert.strictEqual(targetReq.customerRepairDescription, descPayload.customerRepairDescription, 'Customer repair description must be mapped and returned in list api');
        console.log('[PASS] Customer repair description verified in GET /repair-request.');

        // 9. Send Milestone Notification
        console.log('Sending milestone notification...');
        const milestonePayload = {
            milestone: 'diagnosis_completed',
            notes: 'Diagnosed screen cracking. Screen replacment parts ordered.'
        };
        const milestoneRes = await fetch(`${BASE_URL}/repair-request/${requestId}/milestones`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${techToken}`,
                'Connection': 'close'
            },
            body: JSON.stringify(milestonePayload)
        });
        assert.strictEqual(milestoneRes.status, 200, 'Milestone POST should succeed');
        console.log('[PASS] Milestone notification api succeeded.');

        // 10. Verify notification has been created in DB notifications table for customer
        const [notifications] = await connection.query(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
            [customerUserId]
        );
        assert.strictEqual(notifications.length, 1, 'One DB notification should be recorded for customer');
        assert.strictEqual(notifications[0].title, 'Diagnosis Completed', 'Notification title should be milestone title');
        console.log('[PASS] DB notification verified for client user.');

        // 11. Verify activity logs
        const [activities] = await connection.query(
            "SELECT * FROM activity_logs WHERE target_id = ? ORDER BY created_at DESC",
            [requestId]
        );
        const actionTypes = activities.map(a => a.action);
        assert.ok(actionTypes.includes('create_work_log'), 'Should include log for create_work_log');
        assert.ok(actionTypes.includes('update_customer_description'), 'Should include log for update_customer_description');
        assert.ok(actionTypes.includes('milestone_notification'), 'Should include log for milestone_notification');
        console.log('[PASS] Operator activity logs verified.');

        console.log('--- ALL AUTOMATED TECHNICIAN MODULE VERIFICATIONS PASSED SUCCESSFULLY ---');

    } catch (err) {
        console.error('[FAIL] Verification failed:', err);
        process.exit(1);
    } finally {
        // Cleanup test data
        if (connection) {
            console.log('Cleaning up test data...');
            if (requestId) {
                await connection.query("DELETE FROM technician_work_logs WHERE repair_request_id = ?", [requestId]);
                await connection.query("DELETE FROM service_requests WHERE id = ?", [requestId]);
            }
            if (techUserId) {
                await connection.query("DELETE FROM users WHERE id = ?", [techUserId]);
            }
            // Cleanup notifications
            if (customerUserId) {
                await connection.query("DELETE FROM notifications WHERE user_id = ?", [customerUserId]);
            }
            connection.release();
        }
        process.exit(0);
    }
}

testTechnicianFeatures();
