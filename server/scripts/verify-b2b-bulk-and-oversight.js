const assert = require('assert');
const { pool } = require('../config/db.config');
const BASE_URL = 'http://localhost:5000/api';

async function testB2BOversight() {
    console.log('--- STARTING AUTOMATED B2B OVERSIGHT & BULK ACTIONS VERIFICATION ---');
    let connection;
    let token = null;

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

        // 2. Test GET /api/admin/companies/stats
        console.log('Fetching B2B stats dashboard...');
        const statsRes = await fetch(`${BASE_URL}/admin/companies/stats`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Connection': 'close' }
        });
        assert.strictEqual(statsRes.status, 200, 'Stats endpoint should return 200 OK');
        const statsJson = await statsRes.json();
        assert.ok(statsJson.success, 'Stats response should report success');
        const stats = statsJson.data;
        assert.ok(stats.hasOwnProperty('totalCompanies'), 'Stats should contain totalCompanies');
        assert.ok(stats.hasOwnProperty('totalCompanyTickets'), 'Stats should contain totalCompanyTickets');
        assert.ok(stats.hasOwnProperty('totalDevicesUnderRepair'), 'Stats should contain totalDevicesUnderRepair');
        assert.ok(stats.hasOwnProperty('statusCounts'), 'Stats should contain statusCounts');
        console.log('[PASS] B2B Stats aggregation validated successfully:', stats);

        // 3. Test GET /api/admin/companies
        console.log('Fetching companies roster...');
        const listRes = await fetch(`${BASE_URL}/admin/companies`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Connection': 'close' }
        });
        assert.strictEqual(listRes.status, 200, 'Companies listing should return 200 OK');
        const listJson = await listRes.json();
        assert.ok(listJson.success, 'Companies listing should report success');
        const companies = listJson.data.data;
        console.log(`[PASS] Fetched ${companies.length} companies from roster.`);

        let testCompanyId = null;
        if (companies.length > 0) {
            testCompanyId = companies[0].id;
        } else {
            // Check if the mock user already exists by email
            const [existing] = await connection.query('SELECT id FROM users WHERE email = ?', ['corp_test@acme.com']);
            if (existing.length > 0) {
                testCompanyId = existing[0].id;
                console.log(`Found existing mock company with ID: ${testCompanyId}`);
                // Ensure profile exists as well
                const [existingProfile] = await connection.query('SELECT company_name FROM company_profiles WHERE company_id = ?', [testCompanyId]);
                if (existingProfile.length === 0) {
                    await connection.query(`
                        INSERT INTO company_profiles (company_id, company_name, phone, billing_address, active_fleet_count)
                        VALUES (?, 'Test Corporate Client Inc', '555-0199', '123 Enterprise Way', 10)
                    `);
                    console.log('Created missing profile for existing corporate user.');
                }
            } else {
                // Seed a test company user and profile
                const [userRes] = await connection.query(`
                    INSERT INTO users (name, email, password, role)
                    VALUES ('Test Corporate Client', 'corp_test@acme.com', '$2b$10$xyz', 'company')
                `);
                testCompanyId = userRes.insertId;
                await connection.query(`
                    INSERT INTO company_profiles (company_id, company_name, phone, billing_address, active_fleet_count)
                    VALUES (?, 'Test Corporate Client Inc', '555-0199', '123 Enterprise Way', 10)
                `);
                console.log(`Seeded mock company account with ID: ${testCompanyId}`);
            }
        }

        // 4. Test GET /api/admin/companies/:id/detail
        console.log(`Fetching 360-degree details for company ID ${testCompanyId}...`);
        const detailRes = await fetch(`${BASE_URL}/admin/companies/${testCompanyId}/detail`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Connection': 'close' }
        });
        assert.strictEqual(detailRes.status, 200, 'Detail endpoint should return 200 OK');
        const detailJson = await detailRes.json();
        assert.ok(detailJson.success, 'Detail response should report success');
        const detail = detailJson.data;
        assert.ok(detail.profile, 'Detail should contain profile');
        assert.ok(Array.isArray(detail.employees), 'Detail should contain employees list');
        assert.ok(Array.isArray(detail.devices), 'Detail should contain devices list');
        assert.ok(Array.isArray(detail.tickets), 'Detail should contain tickets list');
        assert.ok(Array.isArray(detail.quotations), 'Detail should contain quotations list');
        assert.ok(Array.isArray(detail.invoices), 'Detail should contain invoices list');
        assert.ok(Array.isArray(detail.activityLogs), 'Detail should contain activityLogs list');
        console.log('[PASS] Company 360-degree aggregated details loaded successfully.');

        // 5. Test PUT /api/admin/companies/:id/status (toggle status)
        console.log(`Toggling status for company ID ${testCompanyId}...`);
        const toggleRes = await fetch(`${BASE_URL}/admin/companies/${testCompanyId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Connection': 'close' },
            body: JSON.stringify({ isActive: false })
        });
        assert.strictEqual(toggleRes.status, 200, 'Status toggle endpoint should return 200 OK');
        const toggleJson = await toggleRes.json();
        assert.ok(toggleJson.success, 'Status toggle response should report success');
        console.log('[PASS] Status toggle action validated successfully.');

        // Reset status back to active
        await connection.query('UPDATE users SET is_active = 1 WHERE id = ?', [testCompanyId]);

        // 6. Test PUT /api/admin/tickets/bulk (bulk operations)
        console.log('Testing bulk ticket status modifications & assignment...');
        // Create 2 test tickets if none exist
        const [ticketRows] = await connection.query('SELECT id FROM service_requests LIMIT 2');
        let selectedTicketIds = [];
        if (ticketRows.length >= 2) {
            selectedTicketIds = ticketRows.map(t => t.id);
        } else {
            const [t1] = await connection.query(`
                INSERT INTO service_requests (customer_name, mobile, city, device_category, brand, problem_type, status, priority)
                VALUES ('Bulk User 1', '9000000001', 'City A', 'Mobile', 'Apple', 'Problem A', 'pending', 'Standard')
            `);
            const [t2] = await connection.query(`
                INSERT INTO service_requests (customer_name, mobile, city, device_category, brand, problem_type, status, priority)
                VALUES ('Bulk User 2', '9000000002', 'City B', 'Laptop', 'Dell', 'Problem B', 'pending', 'Standard')
            `);
            selectedTicketIds = [t1.insertId, t2.insertId];
        }

        console.log(`Modifying status and technician for tickets: ${selectedTicketIds.join(', ')}`);
        const bulkPayload = {
            ticketIds: selectedTicketIds,
            assignedTechnicianId: 7, // Alam
            status: 'in_progress'
        };

        const bulkRes = await fetch(`${BASE_URL}/admin/tickets/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Connection': 'close' },
            body: JSON.stringify(bulkPayload)
        });

        assert.strictEqual(bulkRes.status, 200, 'Bulk action endpoint should return 200 OK');
        const bulkJson = await bulkRes.json();
        assert.ok(bulkJson.success, 'Bulk action response should report success');
        console.log('[PASS] Bulk ticket updates applied successfully.');

        // Validate database fields for the tickets
        const [updatedTickets] = await connection.query('SELECT id, status, assigned_technician_id FROM service_requests WHERE id IN (?)', [selectedTicketIds]);
        for (const t of updatedTickets) {
            assert.strictEqual(t.status, 'in_progress', `Ticket ID ${t.id} status should be updated to in_progress`);
            assert.strictEqual(t.assigned_technician_id, 7, `Ticket ID ${t.id} tech should be assigned to 7`);
        }
        console.log('[PASS] Database states for bulk actions validated successfully.');

        console.log('\n🌟 ALL B2B OVERSIGHT & BULK OPERATIONS TESTS PASSED!');
        setTimeout(() => { process.exit(0); }, 150);

    } catch (err) {
        console.error('\n🚨 TEST FAILURE:', err.message);
        setTimeout(() => { process.exit(1); }, 150);
    } finally {
        if (connection) connection.release();
        await pool.end();
    }
}

testB2BOversight();
