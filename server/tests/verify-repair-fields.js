const assert = require('assert');
const { pool } = require('../config/db.config');
const BASE_URL = 'http://localhost:5000/api';

async function testRepairRequestFields() {
    console.log('--- STARTING AUTOMATED REPAIR FORM FIELDS VERIFICATION ---');
    let connection;
    let adminToken = null;
    let savedRequestObj = null;

    try {
        connection = await pool.getConnection();

        // 1. Get Admin Token for authenticated service requests
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
        adminToken = loginJson.data.token;
        console.log('[PASS] Logged in as Admin successfully.');

        // 2. Validate email is mandatory - Submit without email should fail with 400
        console.log('Submitting repair request without email...');
        const badPayload = {
            customerName: 'Test Field User',
            mobile: '9876543210',
            email: '', // Empty email
            city: 'Bangalore',
            deviceCategory: 'Laptop',
            brand: 'Dell',
            modelNumber: 'XPS 15',
            problemType: 'Screen Flickering',
            problemDescription: 'Screen flickers when starting up.',
            serviceType: 'Carry-In',
            priority: 'Priority',
            preferredContactMethod: 'email'
        };

        const badRes = await fetch(`${BASE_URL}/repair-request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
            body: JSON.stringify(badPayload)
        });

        assert.strictEqual(badRes.status, 400, 'Submission without email must fail with 400 Bad Request');
        const badJson = await badRes.json();
        console.log('[PASS] Verified empty email submission is blocked:', badJson.message || badJson.errors);

        // 3. Submit valid repair request with Serial Number and Device Configuration
        console.log('Submitting valid repair request with serial number and config...');
        const goodPayload = {
            customerName: 'Test Field User',
            mobile: '9876543210',
            email: 'testfielduser@example.com',
            city: 'Bangalore',
            deviceCategory: 'Laptop',
            brand: 'Dell',
            modelNumber: 'XPS 15',
            serialNumber: 'SN-DELL-XPS-9988-77',
            deviceConfiguration: '16GB RAM, 512GB SSD, Intel i7',
            problemType: 'Screen Flickering',
            problemDescription: 'Screen flickers when starting up.',
            serviceType: 'Bring to Service Center',
            priority: 'Priority',
            preferredContactMethod: 'Email'
        };

        const goodRes = await fetch(`${BASE_URL}/repair-request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
            body: JSON.stringify(goodPayload)
        });

        assert.strictEqual(goodRes.status, 201, 'Valid creation request should succeed: 201 Created');
        const goodJson = await goodRes.json();
        assert.ok(goodJson.success, 'Valid creation payload should report success');
        const ticketNumber = goodJson.data.ticketNumber;
        console.log(`[PASS] Created repair ticket successfully. Ticket Number: ${ticketNumber}`);

        // 4. Retrieve requests and verify serial number, device configurations, and lack of device age in DB
        const [rows] = await connection.query(
            'SELECT * FROM service_requests WHERE ticket_number = ?',
            [ticketNumber]
        );
        assert.strictEqual(rows.length, 1, 'Ticket should be found in DB');
        const dbRow = rows[0];

        assert.strictEqual(dbRow.serial_number, 'SN-DELL-XPS-9988-77', 'Serial number should be parsed and saved');
        assert.strictEqual(dbRow.device_configuration, '16GB RAM, 512GB SSD, Intel i7', 'Device configuration should be parsed and saved');
        assert.strictEqual(dbRow.device_age, null, 'device_age should be null / omitted for new creations');
        assert.strictEqual(dbRow.priority, 'Priority', 'Priority value should be saved as "Priority" and not "Urgent"');
        console.log('[PASS] Verified fields match the Database insertion perfectly.');

        // 5. Test retrieve API
        console.log('Retrieving tasks using admin token...');
        const listRes = await fetch(`${BASE_URL}/repair-request`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Connection': 'close'
            }
        });
        assert.strictEqual(listRes.status, 200, 'Listing repairs should be 200 OK');
        const listJson = await listRes.json();

        const retrievedObj = listJson.data.data.find(r => r.ticketNumber === ticketNumber);
        assert.ok(retrievedObj, 'Newly created request should be in the retrieved list');
        assert.strictEqual(retrievedObj.serialNumber, 'SN-DELL-XPS-9988-77');
        assert.strictEqual(retrievedObj.deviceConfiguration, '16GB RAM, 512GB SSD, Intel i7');
        console.log('[PASS] Verified serialNumber and deviceConfiguration map correctly in GET API response.');

        // 6. Test Admin updates these fields via PUT edit request
        console.log(`Performing admin update on ticket #${retrievedObj.id}...`);
        const updatePayload = {
            customerName: 'Test Field User Upd',
            mobile: '9876543210',
            city: 'Bangalore',
            deviceCategory: 'Laptop',
            brand: 'Dell',
            modelNumber: 'XPS 15',
            serialNumber: 'SN-UPDATED-9999',
            deviceConfiguration: '32GB RAM, 1TB SSD',
            problemType: 'Battery Issue',
            problemDescription: 'Upgraded battery issue details.',
            priority: 'Priority'
        };

        const updateRes = await fetch(`${BASE_URL}/repair-request/${retrievedObj.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`,
                'Connection': 'close'
            },
            body: JSON.stringify(updatePayload)
        });

        assert.strictEqual(updateRes.status, 200, 'Edit API should succeed with 200');
        const updateJson = await updateRes.json();
        assert.ok(updateJson.success, 'Update return status should be successful');

        // Check db content post-update
        const [updatedRows] = await connection.query('SELECT serial_number, device_configuration FROM service_requests WHERE id = ?', [retrievedObj.id]);
        assert.strictEqual(updatedRows[0].serial_number, 'SN-UPDATED-9999');
        assert.strictEqual(updatedRows[0].device_configuration, '32GB RAM, 1TB SSD');
        console.log('[PASS] Tested custom PUT edits update serial_number and device_configuration in database.');

        console.log('\n🌟 ALL AUTOMATED REPAIR FORM FIELDS AND VALIDATIONS PASSED!');
        setTimeout(() => { process.exit(0); }, 150);
    } catch (error) {
        console.error('\n🚨 TEST FAILURE:', error.message);
        setTimeout(() => { process.exit(1); }, 150);
    } finally {
        if (connection) connection.release();
        await pool.end();
    }
}

testRepairRequestFields();
