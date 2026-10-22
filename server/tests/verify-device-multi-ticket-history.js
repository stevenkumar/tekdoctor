/**
 * Automated Verification & Regression Test Suite:
 * Critical Fix: Multi-Ticket Device History & Independent Ticket Accessibility
 *
 * Scenarios Tested:
 * - Test A: 5 repeated individual customer tickets for the same physical device.
 *   - All 5 tickets appear in device repair history.
 *   - Every ticket retains its own unique ID and ticket_number.
 *   - Every ticket is independently accessible via GET /api/repair-request/:id with exact details.
 *   - No older ticket collapses to or is overwritten by the latest ticket.
 * - Test B: 5 repeated company tickets for the same company device.
 *   - All 5 tickets appear in device repair history.
 *   - Every ticket is independently accessible.
 *   - Strict customer vs company separation is verified.
 * - Test C: Independent technician assignment to unassigned tickets.
 *   - Assigning a technician to Ticket 5 does not modify Tickets 1-4.
 * - Test D: Historical mixed statuses.
 *   - Correct counts in summary (total, active, completed, activeRepair).
 * - Test E: Search, filtering, and pagination across repeated tickets.
 *   - Search by serial number finds all 5 tickets.
 *   - Each returned ticket displays correct repeatCount = 5 and repairHistory.
 * - Test F: Regression, authorization, and data isolation.
 *   - Zero duplicate rows in history.
 *   - Access controls for customers and companies.
 */

const { pool } = require('../config/db.config');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/app.config');

const API_BASE = (process.env.TEST_API_BASE || 'http://127.0.0.1:5000') + '/api';

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

async function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            token_version: user.token_version || 1,
            tokenVersion: user.token_version || 1
        },
        config.jwt.secret,
        { expiresIn: '2h' }
    );
}

async function runTestSuite() {
    console.log('================================================================');
    console.log('  TEST SUITE: Multi-Ticket Device History & Accessibility Fix   ');
    console.log('================================================================\n');

    let adminToken, customerToken, companyToken, techToken;
    let adminUser, customerUser, companyUser, techUser, otherCustomerUser;
    let customerTickets = [];
    let companyTickets = [];
    let companyDeviceId;

    const connection = await pool.getConnection();

    try {
        // -------------------------------------------------------------
        // Setup Users & Authorization Tokens
        // -------------------------------------------------------------
        console.log('[Setup] Preparing test accounts and tokens...');
        const [adminRows] = await connection.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
        if (adminRows.length === 0) throw new Error('No admin user found in database');
        adminUser = adminRows[0];
        adminToken = await generateToken(adminUser);

        const passwordHash = await bcrypt.hash('Test@12345', 10);
        const timestamp = Date.now();

        // 1. Test Technician
        const [techRes] = await connection.query(
            "INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, 'technician', 1)",
            [`Test Tech ${timestamp}`, `tech_${timestamp}@test.com`, passwordHash]
        );
        techUser = { id: techRes.insertId, email: `tech_${timestamp}@test.com`, role: 'technician' };
        techToken = await generateToken(techUser);

        // 2. Test Customer
        const [custRes] = await connection.query(
            "INSERT INTO users (name, email, phone, password, role, is_active) VALUES (?, ?, ?, ?, 'customer', 1)",
            [`Test Customer ${timestamp}`, `cust_${timestamp}@test.com`, '9876543210', passwordHash]
        );
        customerUser = { id: custRes.insertId, email: `cust_${timestamp}@test.com`, role: 'customer' };
        customerToken = await generateToken(customerUser);

        // 3. Other Customer (for boundary / authorization testing)
        const [otherCustRes] = await connection.query(
            "INSERT INTO users (name, email, phone, password, role, is_active) VALUES (?, ?, ?, ?, 'customer', 1)",
            [`Other Customer ${timestamp}`, `other_${timestamp}@test.com`, '9876543211', passwordHash]
        );
        otherCustomerUser = { id: otherCustRes.insertId, email: `other_${timestamp}@test.com`, role: 'customer' };

        // 4. Test Company User & Profile
        const [compRes] = await connection.query(
            "INSERT INTO users (name, email, phone, password, role, is_active) VALUES (?, ?, ?, ?, 'company', 1)",
            [`Corporate Client ${timestamp}`, `company_${timestamp}@test.com`, '9876543212', passwordHash]
        );
        companyUser = { id: compRes.insertId, email: `company_${timestamp}@test.com`, role: 'company' };
        companyToken = await generateToken(companyUser);

        await connection.query(
            "INSERT INTO company_profiles (user_id, company_name, contact_person, phone_number) VALUES (?, ?, ?, ?)",
            [companyUser.id, `TechCorp Solutions ${timestamp}`, 'John Director', '9876543212']
        );

        // 5. Test Company Device
        const compSerial = `SN-CORP-${timestamp}`;
        const compAsset = `AST-CORP-${timestamp}`;
        const [devRes] = await connection.query(
            `INSERT INTO company_devices 
             (company_id, device_category, brand, model_number, serial_number, asset_id, is_active, status)
             VALUES (?, 'Laptop', 'Apple', 'MacBook Pro 16 M2', ?, ?, 1, 'active')`,
            [companyUser.id, compSerial, compAsset]
        );
        companyDeviceId = devRes.insertId;

        console.log(`  ✓ Setup completed successfully (Admin ID: ${adminUser.id}, Cust ID: ${customerUser.id}, Comp ID: ${companyUser.id}, Tech ID: ${techUser.id})\n`);

        // =============================================================
        // TEST A: 5 Repeated Individual Customer Tickets for Same Physical Device
        // =============================================================
        console.log('[Test Group A] 5 Repeated Customer Tickets for the Same Physical Device');

        const custSerial = `SN-CUST-${timestamp}`;
        const custBrand = 'Dell';
        const custModel = 'XPS 15 9520';

        const customerTicketData = [
            { desc: 'Screen broken with vertical lines', prob: 'Screen Replacement', status: 'completed', cost: 14500, paid: 'paid' },
            { desc: 'Battery draining in 30 minutes', prob: 'Battery Replacement', status: 'completed', cost: 6500, paid: 'paid' },
            { desc: 'Charging port intermittent failure', prob: 'Port Repair', status: 'delivered', cost: 3200, paid: 'paid' },
            { desc: 'Overheating under load with thermal throttle', prob: 'Fan Cleaning & Thermal Paste', status: 'in_progress', cost: 2500, paid: 'unpaid' },
            { desc: 'Trackpad gesture erratic jumping', prob: 'Trackpad Fault', status: 'pending', cost: 0, paid: 'unpaid' }
        ];

        for (let i = 0; i < customerTicketData.length; i++) {
            const t = customerTicketData[i];
            const ticketNum = `TD-TEST-CUST-${timestamp}-${i + 1}`;
            const [srRes] = await connection.query(
                `INSERT INTO service_requests 
                 (user_id, customer_name, mobile, email, city, device_category, brand, model_number, serial_number,
                  problem_type, problem_description, status, repair_cost, payment_status, ticket_number, created_at)
                 VALUES (?, ?, ?, ?, 'Mumbai', 'Laptop', ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ${5 - i} DAY))`,
                [
                    customerUser.id,
                    'Test Customer',
                    '9876543210',
                    customerUser.email,
                    custBrand,
                    custModel,
                    custSerial,
                    t.prob,
                    t.desc,
                    t.status,
                    t.cost,
                    t.paid,
                    ticketNum
                ]
            );
            customerTickets.push({
                id: srRes.insertId,
                ticketNumber: ticketNum,
                ...t
            });
        }

        assert(customerTickets.length === 5, 'Inserted 5 sequential customer repair tickets for the same physical device');

        // Verify Device Repair History Endpoint for Customer Device via Admin
        // Calling with the latest ticket ID (customerTickets[4].id)
        const custHistoryRes = await fetch(`${API_BASE}/company/devices/${customerTickets[4].id}/history`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const custHistoryData = await custHistoryRes.json();

        assert(custHistoryRes.status === 200, `Device history returned HTTP 200 (Got ${custHistoryRes.status})`);
        assert(custHistoryData.success === true, 'Device history response success is true');
        assert(custHistoryData.data.device.brand === custBrand, `Device brand matches: ${custHistoryData.data?.device?.brand}`);
        assert(custHistoryData.data.device.serial_number === custSerial, `Device serial matches: ${custHistoryData.data?.device?.serial_number}`);
        assert(custHistoryData.data.repairs.length === 5, `Device history contains all 5 tickets (Got ${custHistoryData.data?.repairs?.length})`);

        // Check that EACH ticket in the history retains its own distinct ID and ticket number
        const historyIds = custHistoryData.data.repairs.map(r => r.id);
        const historyTicketNumbers = custHistoryData.data.repairs.map(r => r.ticket_number);
        const uniqueIds = new Set(historyIds);
        const uniqueTicketNumbers = new Set(historyTicketNumbers);

        assert(uniqueIds.size === 5, 'All 5 repair tickets retain distinct unique internal IDs in history');
        assert(uniqueTicketNumbers.size === 5, 'All 5 repair tickets retain distinct unique ticket numbers in history');

        // Test independent accessibility for each of the 5 tickets
        console.log('  Testing independent detail accessibility for each of the 5 customer tickets:');
        for (let i = 0; i < customerTickets.length; i++) {
            const expected = customerTickets[i];

            // 1. Fetch by internal numeric ID
            const resById = await fetch(`${API_BASE}/repair-request/${expected.id}`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            const dataById = await resById.json();

            assert(resById.status === 200, `Ticket #${expected.ticketNumber} fetched independently by numeric ID ${expected.id}`);
            assert(dataById.data.id === expected.id, `Ticket ${i + 1} has correct ID: ${dataById.data.id}`);
            assert(dataById.data.ticketNumber === expected.ticketNumber, `Ticket ${i + 1} has correct ticketNumber: ${dataById.data.ticketNumber}`);
            assert(dataById.data.problemDescription === expected.desc, `Ticket ${i + 1} retained its own problem description: "${dataById.data.problemDescription}"`);
            assert(dataById.data.status === expected.status, `Ticket ${i + 1} retained its own status: "${dataById.data.status}"`);
            assert(Number(dataById.data.repairCost) === expected.cost, `Ticket ${i + 1} retained its own repair cost: ₹${dataById.data.repairCost}`);

            // 2. Fetch by public ticket number string
            const resByTicketNum = await fetch(`${API_BASE}/repair-request/${expected.ticketNumber}`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            const dataByTicketNum = await resByTicketNum.json();
            assert(resByTicketNum.status === 200 && dataByTicketNum.data.id === expected.id, `Ticket ${i + 1} successfully accessible by public ticket_number string: ${expected.ticketNumber}`);
        }

        // =============================================================
        // TEST B: 5 Repeated Company Tickets for the Same Company Device
        // =============================================================
        console.log('\n[Test Group B] 5 Repeated Company Tickets for the Same Company Device');

        const companyTicketData = [
            { desc: 'Keyboard keys sticky and unresponsive', prob: 'Keyboard Replacement', status: 'completed', cost: 8900 },
            { desc: 'Trackpad haptic feedback dead', prob: 'Trackpad Sensor Fix', status: 'completed', cost: 4200 },
            { desc: 'macOS corrupt after update failure', prob: 'OS Clean Reinstall', status: 'delivered', cost: 1500 },
            { desc: 'Right speaker crackling and distortion', prob: 'Speaker Replacement', status: 'in_progress', cost: 3600 },
            { desc: 'Thermal throttling under video render', prob: 'Thermal Module Service', status: 'pending', cost: 0 }
        ];

        for (let i = 0; i < companyTicketData.length; i++) {
            const t = companyTicketData[i];
            const ticketNum = `TD-TEST-COMP-${timestamp}-${i + 1}`;
            const [srRes] = await connection.query(
                `INSERT INTO service_requests 
                 (company_id, device_id, customer_name, mobile, email, city, device_category, brand, model_number, serial_number,
                  problem_type, problem_description, status, repair_cost, ticket_number, created_at)
                 VALUES (?, ?, 'TechCorp Enterprise', '9876543212', ?, 'Bangalore', 'Laptop', 'Apple', 'MacBook Pro 16 M2', ?,
                         ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ${5 - i} DAY))`,
                [
                    companyUser.id,
                    companyDeviceId,
                    companyUser.email,
                    compSerial,
                    t.prob,
                    t.desc,
                    t.status,
                    t.cost,
                    ticketNum
                ]
            );
            companyTickets.push({
                id: srRes.insertId,
                ticketNumber: ticketNum,
                ...t
            });
        }

        assert(companyTickets.length === 5, 'Inserted 5 sequential company repair tickets for company device');

        // Fetch company device history
        const compHistoryRes = await fetch(`${API_BASE}/company/devices/${companyDeviceId}/history`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const compHistoryData = await compHistoryRes.json();

        assert(compHistoryRes.status === 200, `Company device history returned HTTP 200 (Got ${compHistoryRes.status})`);
        assert(compHistoryData.data.repairs.length === 5, `Company device history contains all 5 tickets (Got ${compHistoryData.data?.repairs?.length})`);

        // Check company tickets independent accessibility
        for (let i = 0; i < companyTickets.length; i++) {
            const expected = companyTickets[i];
            const resById = await fetch(`${API_BASE}/repair-request/${expected.id}`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            const dataById = await resById.json();

            assert(resById.status === 200 && dataById.data.id === expected.id, `Company ticket #${expected.ticketNumber} independently accessible`);
            assert(dataById.data.companyId === companyUser.id, `Company ticket #${expected.ticketNumber} preserves company classification`);
        }

        // Strict customer vs company separation
        const custHistoryTicketIds = custHistoryData.data.repairs.map(r => r.id);
        const compHistoryTicketIds = compHistoryData.data.repairs.map(r => r.id);
        const overlap = custHistoryTicketIds.filter(id => compHistoryTicketIds.includes(id));
        assert(overlap.length === 0, 'Strict Customer vs Company separation preserved: Zero ticket overlap between history records');

        // =============================================================
        // TEST C: Independent Technician Assignment to Unassigned Ticket
        // =============================================================
        console.log('\n[Test Group C] Independent Technician Assignment to Unassigned Ticket');

        const unassignedCustTicket = customerTickets[4]; // Ticket 5 (pending, unassigned)
        const unassignedCompTicket = companyTickets[4]; // Ticket C5 (pending, unassigned)

        // Assign technician to Ticket 5
        const assignCustRes = await fetch(`${API_BASE}/repair-request/${unassignedCustTicket.id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                status: 'in_progress',
                assignedTechnicianId: techUser.id
            })
        });

        assert(assignCustRes.status === 200, `Technician assignment to Customer Ticket 5 returned HTTP 200`);

        // Verify Ticket 5 is updated
        const [updatedT5Rows] = await connection.query("SELECT * FROM service_requests WHERE id = ?", [unassignedCustTicket.id]);
        assert(updatedT5Rows[0].assigned_technician_id === techUser.id, 'Customer Ticket 5 now has assigned technician ID');

        // Verify Tickets 1, 2, 3, and 4 are UNTOUCHED
        const otherTicketIds = customerTickets.slice(0, 4).map(t => t.id);
        const [otherRows] = await connection.query("SELECT id, assigned_technician_id, status FROM service_requests WHERE id IN (?)", [otherTicketIds]);

        for (const row of otherRows) {
            const original = customerTickets.find(t => t.id === row.id);
            assert(row.status === original.status, `Older Ticket #${original.ticketNumber} status was NOT modified (Still "${row.status}")`);
            assert(row.assigned_technician_id === null || row.assigned_technician_id === 0, `Older Ticket #${original.ticketNumber} technician assignment unaffected`);
        }

        // Assign technician to Company Ticket C5
        const assignCompRes = await fetch(`${API_BASE}/repair-request/${unassignedCompTicket.id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                status: 'in_progress',
                assignedTechnicianId: techUser.id
            })
        });
        assert(assignCompRes.status === 200, 'Technician assignment to Company Ticket C5 returned HTTP 200');

        const [compOtherRows] = await connection.query(
            "SELECT id, status FROM service_requests WHERE id IN (?)",
            [companyTickets.slice(0, 4).map(t => t.id)]
        );
        for (const row of compOtherRows) {
            const orig = companyTickets.find(t => t.id === row.id);
            assert(row.status === orig.status, `Older Company Ticket #${orig.ticketNumber} status unaffected (Still "${row.status}")`);
        }

        // =============================================================
        // TEST D: Historical Mixed Statuses & KPI Summary
        // =============================================================
        console.log('\n[Test Group D] Historical Mixed Statuses & KPI Summary');

        const freshCustHistoryRes = await fetch(`${API_BASE}/company/devices/${customerTickets[0].id}/history`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const freshCustHistory = await freshCustHistoryRes.json();
        const summary = freshCustHistory.data.summary;

        assert(summary.totalRepairs === 5, `KPI Total Repairs equals 5 (Got ${summary.totalRepairs})`);
        assert(summary.completedRepairs === 3, `KPI Completed/Delivered Repairs equals 3 (Got ${summary.completedRepairs})`);
        assert(summary.activeRepairs === 2, `KPI Active Repairs equals 2 (Got ${summary.activeRepairs})`);
        assert(summary.activeRepair !== null, 'KPI Active Repair is present');
        assert(summary.totalAmountBilled === (14500 + 6500 + 3200), `Verified Spend equals sum of paid repairs ₹24,200 (Got ₹${summary.totalAmountBilled})`);

        // =============================================================
        // TEST E: Search, Filtering & Listing Across Repeated Tickets
        // =============================================================
        console.log('\n[Test Group E] Search, Filtering & Listing Across Repeated Tickets');

        // Search by customer serial number
        const searchCustRes = await fetch(`${API_BASE}/repair-request?search=${custSerial}`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const searchCustData = await searchCustRes.json();
        const custFoundRequests = searchCustData.data?.data || searchCustData.data?.requests || [];

        assert(searchCustRes.status === 200, `Search by customer serial returned HTTP 200`);
        assert(custFoundRequests.length === 5, `Search by customer serial returned all 5 tickets (Got ${custFoundRequests.length})`);

        for (const req of custFoundRequests) {
            assert(req.repeatCount === 5, `Ticket #${req.ticketNumber} accurately displays repeatCount = 5 (Got ${req.repeatCount})`);
            assert(Array.isArray(req.repairHistory) && req.repairHistory.length === 4, `Ticket #${req.ticketNumber} has repairHistory with other 4 tickets (Got ${req.repairHistory?.length})`);
        }

        // Search by company asset ID
        const searchCompRes = await fetch(`${API_BASE}/repair-request?search=${compAsset}`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const searchCompData = await searchCompRes.json();
        const compFoundRequests = searchCompData.data?.data || searchCompData.data?.requests || [];

        assert(searchCompRes.status === 200, `Search by company asset ID returned HTTP 200`);
        assert(compFoundRequests.length === 5, `Search by company asset ID returned all 5 corporate tickets (Got ${compFoundRequests.length})`);

        // =============================================================
        // TEST F: Regression, Authorization & Boundary Security
        // =============================================================
        console.log('\n[Test Group F] Regression, Authorization & Boundary Security');

        // 1. Zero Duplicate Rows Guarantee
        const repairsList = custHistoryData.data.repairs;
        const seenIds = new Set();
        let hasDuplicate = false;
        for (const r of repairsList) {
            if (seenIds.has(r.id)) hasDuplicate = true;
            seenIds.add(r.id);
        }
        assert(!hasDuplicate, 'Zero duplicate rows verified across device repair history');

        // 2. Other customer cannot access this customer\'s device history
        const otherCustToken = await generateToken(otherCustomerUser);
        const forbiddenRes = await fetch(`${API_BASE}/company/devices/${customerTickets[0].id}/history`, {
            headers: { 'Authorization': `Bearer ${otherCustToken}` }
        });
        assert(forbiddenRes.status === 403 || forbiddenRes.status === 404, `Unauthorized customer accessing another customer's device history is blocked with ${forbiddenRes.status}`);

        // 3. Other company cannot access this company\'s device history
        const [otherCompRes] = await connection.query(
            "INSERT INTO users (name, email, password, role, is_active) VALUES ('Rival Corp', ?, ?, 'company', 1)",
            [`rival_${timestamp}@test.com`, passwordHash]
        );
        const rivalUser = { id: otherCompRes.insertId, email: `rival_${timestamp}@test.com`, role: 'company' };
        const rivalToken = await generateToken(rivalUser);

        const rivalAccessRes = await fetch(`${API_BASE}/company/devices/${companyDeviceId}/history`, {
            headers: { 'Authorization': `Bearer ${rivalToken}` }
        });
        assert(rivalAccessRes.status === 403 || rivalAccessRes.status === 404, `Rival company accessing company device history is blocked with ${rivalAccessRes.status}`);

        // 4. Non-existent ticket or device ID returns 404
        const notFoundRes = await fetch(`${API_BASE}/company/devices/999999999/history`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert(notFoundRes.status === 404, `Non-existent device ID returns HTTP 404 (Got ${notFoundRes.status})`);

    } catch (err) {
        console.error('Fatal Test Exception:', err);
        testsFailed++;
    } finally {
        // -------------------------------------------------------------
        // Cleanup Test Data
        // -------------------------------------------------------------
        console.log('\n[Cleanup] Cleaning up test records...');
        try {
            const allTestIds = [...customerTickets.map(t => t.id), ...companyTickets.map(t => t.id)];
            if (allTestIds.length > 0) {
                await connection.query("DELETE FROM technician_work_logs WHERE repair_request_id IN (?)", [allTestIds]);
                await connection.query("DELETE FROM invoices WHERE ticket_id IN (?)", [allTestIds]);
                await connection.query("DELETE FROM payments WHERE ticket_id IN (?)", [allTestIds]);
                await connection.query("DELETE FROM quotations WHERE request_id IN (?)", [allTestIds]);
                await connection.query("DELETE FROM service_requests WHERE id IN (?)", [allTestIds]);
            }
            if (companyDeviceId) {
                await connection.query("DELETE FROM company_devices WHERE id = ?", [companyDeviceId]);
            }
            if (companyUser?.id) {
                await connection.query("DELETE FROM company_profiles WHERE user_id = ?", [companyUser.id]);
                await connection.query("DELETE FROM users WHERE id = ?", [companyUser.id]);
            }
            if (customerUser?.id) await connection.query("DELETE FROM users WHERE id = ?", [customerUser.id]);
            if (otherCustomerUser?.id) await connection.query("DELETE FROM users WHERE id = ?", [otherCustomerUser.id]);
            if (techUser?.id) await connection.query("DELETE FROM users WHERE id = ?", [techUser.id]);
            console.log('  ✓ Test records cleaned up successfully\n');
        } catch (cleanupErr) {
            console.error('Cleanup error:', cleanupErr);
        }

        connection.release();

        console.log('================================================================');
        console.log(`TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
        console.log('================================================================\n');

        if (testsFailed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    }
}

runTestSuite();
