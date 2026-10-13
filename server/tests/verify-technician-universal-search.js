/**
 * Verification & Regression Test Suite: Technician Dashboard Universal Ticket Search
 * 
 * Verifies:
 * 1. Authoritative Ticket ID search (service_requests.ticket_number, exact and partial)
 * 2. Serial Number search (service_requests.serial_number, company_devices.serial_number, company_devices.asset_id)
 * 3. Model Name & Brand search (model_number, brand, device_model_number)
 * 4. Customer Name search (customer_name, company_name, company_contact_person, employee_name)
 * 5. Customer Phone Number search (mobile, company_phone, employee_phone)
 * 6. Partial search and case-insensitive matching
 * 7. Empty / No results search handling
 * 8. Search reset (empty query returns all authorized workload)
 * 9. Technician authorization & IDOR isolation (Technician A CANNOT find Technician B's tickets)
 * 10. Individual Customer & B2B Corporate Company ticket support
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
        { expiresIn: '1h' }
    );
}

async function runTests() {
    console.log('================================================================');
    console.log('TEST SUITE: Technician Universal Ticket Search & IDOR Isolation');
    console.log('================================================================\n');

    let connection;
    let techUserA, techTokenA;
    let techUserB, techTokenB;
    let companyUser, companyProfileId, companyDeviceId, companyEmployeeId;
    let ticketIdA1, ticketNumA1 = 'TD-SRCH-INDIV-001';
    let ticketIdA2, ticketNumA2 = 'TD-SRCH-B2B-002';
    let ticketIdB1, ticketNumB1 = 'TD-SRCH-TECHB-003';

    try {
        connection = await pool.getConnection();

        // -------------------------------------------------------------
        // SETUP: Technicians & Users
        // -------------------------------------------------------------
        console.log('[Setup] Preparing test technicians, B2B company, and test tickets...');
        const defaultHash = await bcrypt.hash('Test@12345', 10);

        // Tech A
        const [existingTechA] = await connection.query("SELECT * FROM users WHERE email = 'tech_srch_a@tektest.com'");
        if (existingTechA.length > 0) {
            techUserA = existingTechA[0];
        } else {
            const [resA] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Tech Alpha', 'tech_srch_a@tektest.com', ?, 'technician', 1)",
                [defaultHash]
            );
            const [rowsA] = await connection.query('SELECT * FROM users WHERE id = ?', [resA.insertId]);
            techUserA = rowsA[0];
        }
        techTokenA = await generateToken(techUserA);

        // Tech B
        const [existingTechB] = await connection.query("SELECT * FROM users WHERE email = 'tech_srch_b@tektest.com'");
        if (existingTechB.length > 0) {
            techUserB = existingTechB[0];
        } else {
            const [resB] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Tech Beta', 'tech_srch_b@tektest.com', ?, 'technician', 1)",
                [defaultHash]
            );
            const [rowsB] = await connection.query('SELECT * FROM users WHERE id = ?', [resB.insertId]);
            techUserB = rowsB[0];
        }
        techTokenB = await generateToken(techUserB);

        // B2B Company User & Profile
        const [existingComp] = await connection.query("SELECT * FROM users WHERE email = 'apex_srch@tektest.com'");
        if (existingComp.length > 0) {
            companyUser = existingComp[0];
        } else {
            const [resC] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Apex Corp', 'apex_srch@tektest.com', ?, 'company', 1)",
                [defaultHash]
            );
            const [rowsC] = await connection.query('SELECT * FROM users WHERE id = ?', [resC.insertId]);
            companyUser = rowsC[0];
        }

        // B2B Company Profile
        const [existingProf] = await connection.query('SELECT * FROM company_profiles WHERE user_id = ?', [companyUser.id]);
        if (existingProf.length > 0) {
            companyProfileId = existingProf[0].id;
        } else {
            const [profRes] = await connection.query(`
                INSERT INTO company_profiles (user_id, company_name, contact_person, phone_number, address)
                VALUES (?, 'Apex Global Infotech', 'Vikram Malhotra', '9822334455', 'Tower 4 Cyber Hub, Gurugram')
            `, [companyUser.id]);
            companyProfileId = profRes.insertId;
        }

        // B2B Company Device
        const [existingDev] = await connection.query("SELECT * FROM company_devices WHERE company_id = ? AND serial_number = 'SN-LENOVO-4411'", [companyUser.id]);
        if (existingDev.length > 0) {
            companyDeviceId = existingDev[0].id;
        } else {
            const [devRes] = await connection.query(`
                INSERT INTO company_devices (company_id, device_category, brand, model_number, serial_number, asset_id, status)
                VALUES (?, 'Laptop', 'Lenovo', 'ThinkPad T14 Gen 3', 'SN-LENOVO-4411', 'ASSET-APEX-099', 'active')
            `, [companyUser.id]);
            companyDeviceId = devRes.insertId;
        }

        // B2B Company Employee
        const [existingEmp] = await connection.query("SELECT * FROM company_employees WHERE company_id = ? AND email = 'ananya.roy@apex.com'", [companyUser.id]);
        if (existingEmp.length > 0) {
            companyEmployeeId = existingEmp[0].id;
        } else {
            const [empRes] = await connection.query(`
                INSERT INTO company_employees (company_id, name, email, phone, department)
                VALUES (?, 'Ananya Roy', 'ananya.roy@apex.com', '9811223344', 'DevOps Engineering')
            `, [companyUser.id]);
            companyEmployeeId = empRes.insertId;
        }

        // Clean up any stale test tickets
        await connection.query('DELETE FROM service_requests WHERE ticket_number IN (?, ?, ?)', [
            ticketNumA1, ticketNumA2, ticketNumB1
        ]);

        // Insert Ticket 1 (Individual, Assigned to Tech A)
        const [resT1] = await connection.query(`
            INSERT INTO service_requests (
                ticket_number, user_id, customer_name, mobile, email, city,
                device_category, brand, model_number, serial_number, problem_type,
                problem_description, service_type, priority, status, assigned_technician_id
            ) VALUES (
                ?, ?, 'Rajesh Sharma', '9876543210', 'rajesh.sharma@example.com', 'Delhi',
                'Laptop', 'Dell', 'Inspiron 5510', 'SN-DELL-9871', 'Display Issue',
                'Flickering screen on cold boot', 'Carry-In', 'High', 'pending', ?
            )
        `, [ticketNumA1, techUserA.id, techUserA.id]);
        ticketIdA1 = resT1.insertId;

        // Insert Ticket 2 (B2B Company, Assigned to Tech A)
        const [resT2] = await connection.query(`
            INSERT INTO service_requests (
                ticket_number, user_id, company_id, device_id, employee_id, customer_name, mobile, email, city,
                device_category, brand, model_number, serial_number, problem_type,
                problem_description, service_type, priority, status, assigned_technician_id
            ) VALUES (
                ?, ?, ?, ?, ?, 'Ananya Roy', '9811223344', 'ananya.roy@apex.com', 'Gurugram',
                'Laptop', 'Lenovo', 'ThinkPad T14 Gen 3', 'SN-LENOVO-4411', 'Battery Replacement',
                'Battery swelling reported by IT department', 'On-Site', 'Urgent', 'in_progress', ?
            )
        `, [ticketNumA2, companyUser.id, companyUser.id, companyDeviceId, companyEmployeeId, techUserA.id]);
        ticketIdA2 = resT2.insertId;

        // Insert Ticket 3 (Assigned to Tech B — for isolation / IDOR test)
        const [resT3] = await connection.query(`
            INSERT INTO service_requests (
                ticket_number, user_id, customer_name, mobile, email, city,
                device_category, brand, model_number, serial_number, problem_type,
                problem_description, service_type, priority, status, assigned_technician_id
            ) VALUES (
                ?, ?, 'Priya Patel', '9123456789', 'priya.patel@example.com', 'Mumbai',
                'Laptop', 'Apple', 'MacBook Pro M2', 'SN-APPLE-8833', 'Trackpad Sticking',
                'Haptic feedback intermittently disabled', 'Carry-In', 'Medium', 'pending', ?
            )
        `, [ticketNumB1, techUserB.id, techUserB.id]);
        ticketIdB1 = resT3.insertId;

        console.log(`  Created test tickets:
    Ticket 1 (Tech A, Indiv): ${ticketNumA1} (ID: ${ticketIdA1})
    Ticket 2 (Tech A, B2B)  : ${ticketNumA2} (ID: ${ticketIdA2})
    Ticket 3 (Tech B, Indiv): ${ticketNumB1} (ID: ${ticketIdB1})\n`);

        // Helper function to call GET /api/repair-request/my-tasks
        async function fetchMyTasks(token, searchParam) {
            const url = searchParam !== undefined && searchParam !== null
                ? `${API_BASE}/repair-request/my-tasks?search=${encodeURIComponent(searchParam)}`
                : `${API_BASE}/repair-request/my-tasks`;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            return { status: res.status, body: data };
        }

        // -------------------------------------------------------------
        // TEST 1: Authoritative Ticket ID Search (exact & partial)
        // -------------------------------------------------------------
        console.log('[Test 1] Authoritative Ticket ID Search');
        {
            // Exact search
            const res1 = await fetchMyTasks(techTokenA, ticketNumA1);
            assert(res1.status === 200, 'GET /my-tasks returns 200 OK');
            const found1 = res1.body.data.some(t => t.ticketNumber === ticketNumA1);
            assert(found1, `Exact Ticket ID search "${ticketNumA1}" finds ticket`);

            // Partial search
            const res2 = await fetchMyTasks(techTokenA, 'INDIV-001');
            const found2 = res2.body.data.some(t => t.ticketNumber === ticketNumA1);
            assert(found2, 'Partial Ticket ID search "INDIV-001" finds ticket');

            // Case-insensitive search
            const res3 = await fetchMyTasks(techTokenA, 'td-srch-indiv');
            const found3 = res3.body.data.some(t => t.ticketNumber === ticketNumA1);
            assert(found3, 'Case-insensitive Ticket ID search "td-srch-indiv" finds ticket');
        }

        // -------------------------------------------------------------
        // TEST 2: Serial Number & Asset ID Search
        // -------------------------------------------------------------
        console.log('\n[Test 2] Serial Number & Asset ID Search');
        {
            // Individual device serial number
            const res1 = await fetchMyTasks(techTokenA, 'SN-DELL-9871');
            assert(res1.body.data.some(t => t.ticketNumber === ticketNumA1), 'Exact serial "SN-DELL-9871" finds individual ticket');

            // Partial serial number
            const res2 = await fetchMyTasks(techTokenA, 'DELL-987');
            assert(res2.body.data.some(t => t.ticketNumber === ticketNumA1), 'Partial serial "DELL-987" finds individual ticket');

            // B2B Device Serial Number
            const res3 = await fetchMyTasks(techTokenA, 'SN-LENOVO-4411');
            assert(res3.body.data.some(t => t.ticketNumber === ticketNumA2), 'B2B device serial "SN-LENOVO-4411" finds B2B ticket');

            // B2B Asset ID
            const res4 = await fetchMyTasks(techTokenA, 'ASSET-APEX-099');
            assert(res4.body.data.some(t => t.ticketNumber === ticketNumA2), 'B2B asset ID "ASSET-APEX-099" finds B2B ticket');

            // Partial Asset ID
            const res5 = await fetchMyTasks(techTokenA, 'APEX-099');
            assert(res5.body.data.some(t => t.ticketNumber === ticketNumA2), 'Partial asset ID "APEX-099" finds B2B ticket');
        }

        // -------------------------------------------------------------
        // TEST 3: Model Name & Brand Search
        // -------------------------------------------------------------
        console.log('\n[Test 3] Model Name & Brand Search');
        {
            // Exact model number
            const res1 = await fetchMyTasks(techTokenA, 'Inspiron 5510');
            assert(res1.body.data.some(t => t.ticketNumber === ticketNumA1), 'Model search "Inspiron 5510" finds ticket');

            // Partial model number
            const res2 = await fetchMyTasks(techTokenA, '5510');
            assert(res2.body.data.some(t => t.ticketNumber === ticketNumA1), 'Partial model "5510" finds ticket');

            // Brand search
            const res3 = await fetchMyTasks(techTokenA, 'Dell');
            assert(res3.body.data.some(t => t.ticketNumber === ticketNumA1), 'Brand search "Dell" finds ticket');

            // B2B Model Search
            const res4 = await fetchMyTasks(techTokenA, 'ThinkPad T14');
            assert(res4.body.data.some(t => t.ticketNumber === ticketNumA2), 'B2B model search "ThinkPad T14" finds B2B ticket');
        }

        // -------------------------------------------------------------
        // TEST 4: Customer Name Search (Individual & B2B)
        // -------------------------------------------------------------
        console.log('\n[Test 4] Customer Name Search (Individual & B2B)');
        {
            // Individual Customer Name
            const res1 = await fetchMyTasks(techTokenA, 'Rajesh Sharma');
            assert(res1.body.data.some(t => t.ticketNumber === ticketNumA1), 'Customer name search "Rajesh Sharma" finds individual ticket');

            // Partial customer name
            const res2 = await fetchMyTasks(techTokenA, 'Rajesh');
            assert(res2.body.data.some(t => t.ticketNumber === ticketNumA1), 'Partial customer name "Rajesh" finds ticket');

            // B2B Corporate Company Name
            const res3 = await fetchMyTasks(techTokenA, 'Apex Global Infotech');
            assert(res3.body.data.some(t => t.ticketNumber === ticketNumA2), 'Company name search "Apex Global Infotech" finds B2B ticket');

            // Partial Company Name
            const res4 = await fetchMyTasks(techTokenA, 'Apex');
            assert(res4.body.data.some(t => t.ticketNumber === ticketNumA2), 'Partial company search "Apex" finds B2B ticket');

            // B2B Contact Person Name
            const res5 = await fetchMyTasks(techTokenA, 'Vikram Malhotra');
            assert(res5.body.data.some(t => t.ticketNumber === ticketNumA2), 'B2B contact person search "Vikram Malhotra" finds B2B ticket');

            // B2B Employee Name
            const res6 = await fetchMyTasks(techTokenA, 'Ananya Roy');
            assert(res6.body.data.some(t => t.ticketNumber === ticketNumA2), 'B2B employee search "Ananya Roy" finds B2B ticket');
        }

        // -------------------------------------------------------------
        // TEST 5: Customer Phone Number Search
        // -------------------------------------------------------------
        console.log('\n[Test 5] Customer Phone Number Search');
        {
            // Individual Customer Mobile
            const res1 = await fetchMyTasks(techTokenA, '9876543210');
            assert(res1.body.data.some(t => t.ticketNumber === ticketNumA1), 'Phone search "9876543210" finds individual ticket');

            // Partial phone number
            const res2 = await fetchMyTasks(techTokenA, '43210');
            assert(res2.body.data.some(t => t.ticketNumber === ticketNumA1), 'Partial phone "43210" finds individual ticket');

            // B2B Company Phone Number
            const res3 = await fetchMyTasks(techTokenA, '9822334455');
            assert(res3.body.data.some(t => t.ticketNumber === ticketNumA2), 'B2B company phone "9822334455" finds B2B ticket');

            // B2B Employee Phone Number
            const res4 = await fetchMyTasks(techTokenA, '9811223344');
            assert(res4.body.data.some(t => t.ticketNumber === ticketNumA2), 'B2B employee phone "9811223344" finds B2B ticket');
        }

        // -------------------------------------------------------------
        // TEST 6: No-result Search
        // -------------------------------------------------------------
        console.log('\n[Test 6] No-Result Search Query');
        {
            const res = await fetchMyTasks(techTokenA, 'NONEXISTENT_DEVICE_QUERY_99999');
            assert(res.status === 200, 'GET /my-tasks returns 200 for unmatched search query');
            assert(Array.isArray(res.body.data) && res.body.data.length === 0, 'Unmatched search query returns empty array []');
        }

        // -------------------------------------------------------------
        // TEST 7: Reset / Empty Search Query
        // -------------------------------------------------------------
        console.log('\n[Test 7] Reset / Empty Search Query');
        {
            // Query with search=""
            const resEmpty = await fetchMyTasks(techTokenA, '');
            assert(resEmpty.status === 200, 'Empty string search returns 200');
            assert(
                resEmpty.body.data.some(t => t.ticketNumber === ticketNumA1) &&
                resEmpty.body.data.some(t => t.ticketNumber === ticketNumA2),
                'Empty search returns all assigned tickets (both Ticket 1 and Ticket 2)'
            );

            // Query without search parameter
            const resNoParam = await fetchMyTasks(techTokenA);
            assert(
                resNoParam.body.data.some(t => t.ticketNumber === ticketNumA1) &&
                resNoParam.body.data.some(t => t.ticketNumber === ticketNumA2),
                'Omitted search param returns all assigned tickets'
            );
        }

        // -------------------------------------------------------------
        // TEST 8: Technician Isolation & IDOR Protection
        // -------------------------------------------------------------
        console.log('\n[Test 8] Technician Authorization & IDOR Protection');
        {
            // Tech A searches for Tech B's ticket ID
            const resId = await fetchMyTasks(techTokenA, ticketNumB1);
            const foundId = resId.body.data.some(t => t.ticketNumber === ticketNumB1);
            assert(!foundId && resId.body.data.length === 0, 'Tech A cannot find Tech B ticket by Ticket ID (IDOR prevented)');

            // Tech A searches for Tech B's customer name
            const resCust = await fetchMyTasks(techTokenA, 'Priya Patel');
            const foundCust = resCust.body.data.some(t => t.ticketNumber === ticketNumB1);
            assert(!foundCust && resCust.body.data.length === 0, 'Tech A cannot find Tech B ticket by Customer Name');

            // Tech A searches for Tech B's serial number
            const resSn = await fetchMyTasks(techTokenA, 'SN-APPLE-8833');
            const foundSn = resSn.body.data.some(t => t.ticketNumber === ticketNumB1);
            assert(!foundSn && resSn.body.data.length === 0, 'Tech A cannot find Tech B ticket by Serial Number');

            // Tech A searches for Tech B's phone
            const resPhone = await fetchMyTasks(techTokenA, '9123456789');
            const foundPhone = resPhone.body.data.some(t => t.ticketNumber === ticketNumB1);
            assert(!foundPhone && resPhone.body.data.length === 0, 'Tech A cannot find Tech B ticket by Phone Number');

            // Confirm Tech B CAN find their own ticket
            const resTechB = await fetchMyTasks(techTokenB, ticketNumB1);
            const foundTechB = resTechB.body.data.some(t => t.ticketNumber === ticketNumB1);
            assert(foundTechB, 'Tech B successfully finds their own assigned ticket');

            // Confirm Tech B CANNOT find Tech A's tickets
            const resTechBIsolation = await fetchMyTasks(techTokenB, ticketNumA1);
            const foundAInB = resTechBIsolation.body.data.some(t => t.ticketNumber === ticketNumA1);
            assert(!foundAInB && resTechBIsolation.body.data.length === 0, 'Tech B cannot find Tech A ticket (Bidirectional isolation verified)');
        }

        // -------------------------------------------------------------
        // CLEANUP
        // -------------------------------------------------------------
        console.log('\n[Cleanup] Cleaning up test tickets...');
        await connection.query('DELETE FROM service_requests WHERE id IN (?, ?, ?)', [
            ticketIdA1, ticketIdA2, ticketIdB1
        ]);
        console.log('  Cleaned up test tickets.');

    } catch (err) {
        console.error('Test execution error:', err);
        testsFailed++;
    } finally {
        if (connection) connection.release();
    }

    console.log('\n================================================================');
    console.log(`TEST SUMMARY: ${testsPassed} Passed, ${testsFailed} Failed`);
    console.log('================================================================');

    if (testsFailed > 0) {
        process.exit(1);
    }
}

runTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
