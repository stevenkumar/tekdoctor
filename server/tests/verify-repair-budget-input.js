/**
 * Verification & Regression Test Suite: Technician Repair Budget Input Fix
 * 
 * Tests:
 * 1. Unit testing of currency sanitization:
 *    - Valid values: 1, 100, 1000, 3000, 0, 0.50
 *    - Invalid text, negative signs, multiple dots, excess decimal precision
 * 2. Backend API submission (POST /api/repair-request/:id/diagnosis):
 *    - Valid amounts: 1, 100, 1000, 3000
 *    - Combined budget + additional charges (e.g. 3000 + 500 = 3500)
 *    - Correct reflection in Admin endpoints & Customer tracking endpoints
 *    - Rejection of negative values (-50)
 *    - Rejection of invalid text / NaN
 *    - Rejection of empty values
 *    - Rejection of excess decimal precision (e.g. 100.1234)
 *    - Rejection of amounts exceeding ₹10,000,000
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

// Replicate frontend sanitizeAmountInput for unit assertions
function sanitizeAmountInput(value) {
    if (!value) return '';
    let cleaned = String(value).replace(/[^0-9.]/g, '');
    const firstDotIndex = cleaned.indexOf('.');
    if (firstDotIndex !== -1) {
        const beforeDot = cleaned.substring(0, firstDotIndex);
        const afterDot = cleaned.substring(firstDotIndex + 1).replace(/\./g, '');
        cleaned = `${beforeDot}.${afterDot.slice(0, 2)}`;
    }
    if (/^0[0-9]/.test(cleaned)) {
        cleaned = cleaned.replace(/^0+/, '');
        if (cleaned === '' || cleaned.startsWith('.')) {
            cleaned = '0' + cleaned;
        }
    }
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num > 10000000) {
        return '10000000';
    }
    return cleaned;
}

async function runTests() {
    console.log('================================================================');
    console.log('TEST SUITE: Technician Repair Budget Input & Validation');
    console.log('================================================================\n');

    let connection;
    let techUser, techToken;
    let customerUser, customerToken;
    let adminUser, adminToken;
    let testTicketId, testTicketNumber;

    try {
        // -------------------------------------------------------------
        // PART 1: Frontend Sanitization Unit Tests
        // -------------------------------------------------------------
        console.log('[Part 1] Frontend Currency Sanitization Unit Tests');
        assert(sanitizeAmountInput('1') === '1', 'Input "1" produces "1"');
        assert(sanitizeAmountInput('100') === '100', 'Input "100" produces "100"');
        assert(sanitizeAmountInput('1000') === '1000', 'Input "1000" produces "1000"');
        assert(sanitizeAmountInput('3000') === '3000', 'Input "3000" produces "3000"');
        assert(sanitizeAmountInput('0') === '0', 'Input "0" produces "0"');
        assert(sanitizeAmountInput('0.5') === '0.5', 'Input "0.5" produces "0.5"');
        assert(sanitizeAmountInput('0.50') === '0.50', 'Input "0.50" produces "0.50"');
        assert(sanitizeAmountInput('00100') === '100', 'Leading zero "00100" normalized to "100"');
        assert(sanitizeAmountInput('-50') === '50', 'Negative "-50" stripped of sign to "50"');
        assert(sanitizeAmountInput('invalid text') === '', 'Invalid text produces empty string ""');
        assert(sanitizeAmountInput('abc123xyz') === '123', 'Mixed alphanumeric "abc123xyz" stripped to "123"');
        assert(sanitizeAmountInput('100.1234') === '100.12', 'Excess decimal precision "100.1234" truncated to "100.12"');
        assert(sanitizeAmountInput('100.20.30') === '100.20', 'Multiple dots "100.20.30" stripped to single dot "100.20"');
        assert(sanitizeAmountInput('15000000') === '10000000', 'Amounts exceeding 10M clamped to "10000000"');

        // -------------------------------------------------------------
        // PART 2: Database & Users Setup
        // -------------------------------------------------------------
        console.log('\n[Part 2] Preparing test database and credentials...');
        connection = await pool.getConnection();

        const [adminRows] = await connection.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
        if (adminRows.length === 0) throw new Error('No admin user found.');
        adminUser = adminRows[0];
        adminToken = await generateToken(adminUser);

        const defaultHash = await bcrypt.hash('Test@12345', 10);
        const [techRows] = await connection.query("SELECT * FROM users WHERE role = 'technician' LIMIT 1");
        if (techRows.length === 0) {
            const [t1] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Tech Test', 'tech_budget@tektest.com', ?, 'technician', 1)",
                [defaultHash]
            );
            const [tr] = await connection.query('SELECT * FROM users WHERE id = ?', [t1.insertId]);
            techUser = tr[0];
        } else {
            techUser = techRows[0];
        }
        techToken = await generateToken(techUser);

        const [custRows] = await connection.query("SELECT * FROM users WHERE role = 'customer' LIMIT 1");
        if (custRows.length === 0) {
            const [c1] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Customer Test', 'cust_budget@tektest.com', ?, 'customer', 1)",
                [defaultHash]
            );
            const [cr] = await connection.query('SELECT * FROM users WHERE id = ?', [c1.insertId]);
            customerUser = cr[0];
        } else {
            customerUser = custRows[0];
        }
        customerToken = await generateToken(customerUser);

        // Setup Test Ticket assigned to techUser
        testTicketNumber = `TD-BUDGET-${Date.now()}`;
        const [ticketRes] = await connection.query(`
            INSERT INTO service_requests (
                ticket_number, user_id, customer_name, email, mobile, city, problem_type,
                device_category, brand, model_number, problem_description,
                status, customer_approval_status, payment_status, collection_status, repair_cost, assigned_technician_id
            ) VALUES (?, ?, ?, ?, '9876543210', 'Mumbai', 'Hardware', 'Laptop', 'Dell', 'XPS', 'Diagnostics needed', 'assigned', 'none', 'unpaid', 'not_applicable', 0.00, ?)
        `, [testTicketNumber, customerUser.id, customerUser.name, customerUser.email, techUser.id]);
        testTicketId = ticketRes.insertId;

        console.log(`  Created test ticket ID ${testTicketId} (${testTicketNumber}) assigned to Technician ${techUser.id}\n`);

        // -------------------------------------------------------------
        // PART 3: Backend Rejection of Invalid / Tampered Values
        // -------------------------------------------------------------
        console.log('[Part 3] Backend Validation Against Tampered/Invalid Values');

        // 3a. Empty estimatedCost
        const emptyRes = await fetch(`${API_BASE}/repair-request/${testTicketId}/diagnosis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${techToken}`
            },
            body: JSON.stringify({
                diagnosis: 'Faulty battery diagnosed',
                estimatedCost: ''
            })
        });
        const emptyData = await emptyRes.json();
        assert(emptyRes.status === 400 && emptyData.success === false, 'Empty estimatedCost rejected with 400');

        // 3b. Invalid text in estimatedCost
        const textRes = await fetch(`${API_BASE}/repair-request/${testTicketId}/diagnosis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${techToken}`
            },
            body: JSON.stringify({
                diagnosis: 'Faulty battery diagnosed',
                estimatedCost: 'invalid_price'
            })
        });
        const textData = await textRes.json();
        assert(textRes.status === 400 && textData.success === false, 'Invalid text in estimatedCost rejected with 400');

        // 3c. Negative estimatedCost
        const negRes = await fetch(`${API_BASE}/repair-request/${testTicketId}/diagnosis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${techToken}`
            },
            body: JSON.stringify({
                diagnosis: 'Faulty battery diagnosed',
                estimatedCost: -500
            })
        });
        const negData = await negRes.json();
        assert(negRes.status === 400 && negData.success === false, 'Negative estimatedCost (-500) rejected with 400');

        // 3d. Excessive decimal places
        const decimalRes = await fetch(`${API_BASE}/repair-request/${testTicketId}/diagnosis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${techToken}`
            },
            body: JSON.stringify({
                diagnosis: 'Faulty battery diagnosed',
                estimatedCost: 100.1234
            })
        });
        const decimalData = await decimalRes.json();
        assert(decimalRes.status === 400 && decimalData.success === false, 'Excess decimal places (100.1234) rejected with 400');

        // 3e. Amount exceeding ₹10,000,000
        const exceedRes = await fetch(`${API_BASE}/repair-request/${testTicketId}/diagnosis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${techToken}`
            },
            body: JSON.stringify({
                diagnosis: 'Faulty battery diagnosed',
                estimatedCost: 15000000
            })
        });
        const exceedData = await exceedRes.json();
        assert(exceedRes.status === 400 && exceedData.success === false, 'Amount exceeding ₹10,000,000 rejected with 400');

        // 3f. Negative additionalCharges
        const negAddRes = await fetch(`${API_BASE}/repair-request/${testTicketId}/diagnosis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${techToken}`
            },
            body: JSON.stringify({
                diagnosis: 'Faulty battery diagnosed',
                estimatedCost: 1500,
                additionalCharges: -100
            })
        });
        const negAddData = await negAddRes.json();
        assert(negAddRes.status === 400 && negAddData.success === false, 'Negative additionalCharges (-100) rejected with 400');

        // -------------------------------------------------------------
        // PART 4: Submitting Valid Direct Numeric Values & Verification
        // -------------------------------------------------------------
        console.log('\n[Part 4] Submitting Valid Direct Numeric Amounts');

        // Test amount: 1
        console.log('  Testing submission of amount: ₹1');
        const res1 = await fetch(`${API_BASE}/repair-request/${testTicketId}/diagnosis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${techToken}`
            },
            body: JSON.stringify({
                diagnosis: 'Quick solder repair',
                estimatedCost: 1,
                additionalCharges: 0
            })
        });
        const data1 = await res1.json();
        assert(res1.status === 200 && data1.success === true, 'Amount ₹1 submitted successfully');
        assert(Number(data1.data.estimatedCost) === 1, 'Returned estimatedCost is 1');
        assert(Number(data1.data.totalEstimatedCost) === 1, 'Returned totalEstimatedCost is 1');

        // Test amount: 100
        console.log('  Testing submission of amount: ₹100');
        const res100 = await fetch(`${API_BASE}/repair-request/${testTicketId}/diagnosis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${techToken}`
            },
            body: JSON.stringify({
                diagnosis: 'Port cleaning and diagnostic test',
                estimatedCost: 100,
                additionalCharges: 0
            })
        });
        const data100 = await res100.json();
        assert(res100.status === 200 && data100.success === true, 'Amount ₹100 submitted successfully');
        assert(Number(data100.data.estimatedCost) === 100, 'Returned estimatedCost is 100');

        // Test amount: 1000
        console.log('  Testing submission of amount: ₹1000');
        const res1000 = await fetch(`${API_BASE}/repair-request/${testTicketId}/diagnosis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${techToken}`
            },
            body: JSON.stringify({
                diagnosis: 'Thermal paste replacement and heatsink service',
                estimatedCost: 1000,
                additionalCharges: 0
            })
        });
        const data1000 = await res1000.json();
        assert(res1000.status === 200 && data1000.success === true, 'Amount ₹1000 submitted successfully');
        assert(Number(data1000.data.estimatedCost) === 1000, 'Returned estimatedCost is 1000');

        // Test amount: 3000 with additionalCharges: 500
        console.log('  Testing submission of amount: ₹3000 + ₹500 extra');
        const res3000 = await fetch(`${API_BASE}/repair-request/${testTicketId}/diagnosis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${techToken}`
            },
            body: JSON.stringify({
                diagnosis: 'Screen replacement required',
                estimatedCost: 3000,
                additionalCharges: 500
            })
        });
        const data3000 = await res3000.json();
        assert(res3000.status === 200 && data3000.success === true, 'Amount ₹3000 + ₹500 submitted successfully');
        assert(Number(data3000.data.estimatedCost) === 3000, 'Returned estimatedCost is 3000');
        assert(Number(data3000.data.additionalCharges) === 500, 'Returned additionalCharges is 500');
        assert(Number(data3000.data.totalEstimatedCost) === 3500, 'Total quote is ₹3500');

        // -------------------------------------------------------------
        // PART 5: Verify Exact Reflection in Admin & Customer Dashboards
        // -------------------------------------------------------------
        console.log('\n[Part 5] Verifying Reflection in Admin & Customer Dashboards');

        // 5a. Admin View
        const adminRes = await fetch(`${API_BASE}/repair-request/${testTicketId}`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const adminData = await adminRes.json();
        assert(adminRes.status === 200 && adminData.success === true, 'Admin query returned 200 OK');
        const adminTicket = adminData.data;
        assert(Number(adminTicket.estimatedCost || adminTicket.estimated_cost) === 3000, 'Admin ticket reflects exact base budget ₹3000');
        assert(Number(adminTicket.additionalCharges || adminTicket.additional_charges) === 500, 'Admin ticket reflects exact additional charges ₹500');
        assert(Number(adminTicket.repairCost || adminTicket.repair_cost) === 3500, 'Admin ticket reflects exact total quote ₹3500');

        // 5b. Customer Tracking View
        const custTrackRes = await fetch(`${API_BASE}/repair-request/track/${testTicketNumber}`);
        const custTrackData = await custTrackRes.json();
        assert(custTrackRes.status === 200 && custTrackData.success === true, 'Customer tracking query returned 200 OK');
        const custTicket = custTrackData.data;
        assert(Number(custTicket.estimatedCost) === 3000, 'Customer tracking reflects exact base budget ₹3000');
        assert(Number(custTicket.additionalCharges) === 500, 'Customer tracking reflects exact additional charges ₹500');
        assert(Number(custTicket.repairCost) === 3500, 'Customer tracking reflects exact total quote ₹3500');
        assert(custTicket.customerApprovalStatus === 'pending_approval', 'Ticket approval status is pending_approval');

        // 5c. Customer Approves Estimate
        console.log('  Customer approves the ₹3500 estimate');
        const approveRes = await fetch(`${API_BASE}/repair-request/${testTicketId}/approve-estimate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerToken}`
            }
        });
        const approveData = await approveRes.json();
        assert(approveRes.status === 200 && approveData.success === true, 'Customer successfully approved estimate');

        // 5d. Technician cannot modify estimate once customer approved
        console.log('  Verifying estimate lock after customer approval');
        const lockedRes = await fetch(`${API_BASE}/repair-request/${testTicketId}/diagnosis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${techToken}`
            },
            body: JSON.stringify({
                diagnosis: 'Attempt to overwrite approved estimate',
                estimatedCost: 4000
            })
        });
        const lockedData = await lockedRes.json();
        assert(lockedRes.status === 400 && lockedData.success === false, 'Estimate modification locked once approved');

        // Cleanup test data
        console.log('\n[Cleanup] Cleaning up test records...');
        await connection.query("DELETE FROM service_requests WHERE id = ?", [testTicketId]);
        console.log('  Cleaned up test ticket.');

    } catch (err) {
        console.error('Test failed with unexpected error:', err);
        testsFailed++;
    } finally {
        if (connection) connection.release();
    }

    console.log('\n================================================================');
    console.log(`SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('================================================================\n');

    process.exit(testsFailed > 0 ? 1 : 0);
}

runTests();
