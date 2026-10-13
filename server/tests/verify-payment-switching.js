/**
 * Verification & Regression Test Suite: Payment Switching & Cash ID Bug Fixes
 * 
 * Verifies:
 * 1. Cash Payment Creation:
 *    - Uses PAY-CASH-... / REF-CASH-...
 *    - Does NOT generate a gateway transaction ID or Razorpay format
 * 2. Cash -> Online Payment Switch:
 *    - Uncollected cash can be switched by customer
 *    - Safely marks uncollected cash payment as 'cancelled' (not 'rejected')
 *    - Resets ticket & invoice payment status to allow instant checkout
 * 3. Prevention of Double Settlement:
 *    - Once switched to online, prior cash attempt cannot be verified or collected
 *    - When online payment completes, invoice & ticket become 'paid'
 * 4. Collected/Verified Cash Protection:
 *    - Once cash is marked 'collected', customer CANNOT switch payment method
 *    - Online order creation is blocked for collected cash
 * 5. Authorization & IDOR Protection:
 *    - Unauthorized user cannot switch another customer's payment method
 * 6. Audit & Data Consistency:
 *    - Receipt data generation correctly provides proper labels and identifiers
 */

const { pool } = require('../config/db.config');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/app.config');
const { generateInvoiceId } = require('../utils/helpers');

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
    console.log('TEST SUITE: Payment Switching & Cash Transaction ID Fixes');
    console.log('================================================================\n');

    let connection;
    let adminUser, adminToken;
    let assignedTech, assignedTechToken;
    let customerA, customerAToken;
    let customerB, customerBToken;
    let testTicketId, testInvoiceId;
    let testTicket2Id, testInvoice2Id;

    try {
        connection = await pool.getConnection();

        // 1. Setup Users
        console.log('[Setup] Preparing test users & credentials...');
        const [adminRows] = await connection.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
        if (adminRows.length === 0) throw new Error('No admin user found.');
        adminUser = adminRows[0];
        adminToken = await generateToken(adminUser);

        const defaultHash = await bcrypt.hash('Test@12345', 10);
        const [techRows] = await connection.query("SELECT * FROM users WHERE role = 'technician' LIMIT 1");
        if (techRows.length === 0) {
            const [t1] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Tech One', 'tech1@tektest.com', ?, 'technician', 1)",
                [defaultHash]
            );
            const [tr] = await connection.query('SELECT * FROM users WHERE id = ?', [t1.insertId]);
            assignedTech = tr[0];
        } else {
            assignedTech = techRows[0];
        }
        assignedTechToken = await generateToken(assignedTech);

        // Find or create Customer A
        const [custARows] = await connection.query("SELECT * FROM users WHERE role = 'customer' AND email = 'custA_test@tektest.com'");
        if (custARows.length === 0) {
            const [cA] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Customer Alpha', 'custA_test@tektest.com', ?, 'customer', 1)",
                [defaultHash]
            );
            const [rA] = await connection.query('SELECT * FROM users WHERE id = ?', [cA.insertId]);
            customerA = rA[0];
        } else {
            customerA = custARows[0];
        }
        customerAToken = await generateToken(customerA);

        // Find or create Customer B (for IDOR check)
        const [custBRows] = await connection.query("SELECT * FROM users WHERE role = 'customer' AND email = 'custB_test@tektest.com'");
        if (custBRows.length === 0) {
            const [cB] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Customer Beta', 'custB_test@tektest.com', ?, 'customer', 1)",
                [defaultHash]
            );
            const [rB] = await connection.query('SELECT * FROM users WHERE id = ?', [cB.insertId]);
            customerB = rB[0];
        } else {
            customerB = custBRows[0];
        }
        customerBToken = await generateToken(customerB);

        // Create Test Ticket 1 for Customer A
        const testTicketNumber = `TD-SWITCH-${Date.now()}`;
        const [ticketRes] = await connection.query(`
            INSERT INTO service_requests (
                ticket_number, user_id, customer_name, email, mobile, city, problem_type,
                device_category, brand, model_number, problem_description,
                status, customer_approval_status, payment_status, collection_status, repair_cost, assigned_technician_id
            ) VALUES (?, ?, ?, ?, ?, 'Mumbai', 'Hardware', 'Laptop', 'Lenovo', 'ThinkPad', 'Battery Replacement', 'completed', 'approved', 'unpaid', 'not_applicable', 3500.00, ?)
        `, [testTicketNumber, customerA.id, customerA.name, customerA.email, '9876543211', assignedTech.id]);
        testTicketId = ticketRes.insertId;

        // Create Test Invoice 1
        const testInvoiceIdStr = await generateInvoiceId(connection);
        await connection.query(`
            INSERT INTO invoices (
                id, user_id, ticket_id, client_name, amount, currency, status, invoice_date, due_date
            ) VALUES (?, ?, ?, ?, 3500.00, 'INR', 'Final', NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY))
        `, [testInvoiceIdStr, customerA.id, testTicketId, customerA.name]);
        testInvoiceId = testInvoiceIdStr;

        console.log(`  Created test ticket ID ${testTicketId} (${testTicketNumber}) & invoice ${testInvoiceId}\n`);

        // -------------------------------------------------------------
        // TEST 1: Cash Payment ID & Identifier Generation Bug Fix
        // -------------------------------------------------------------
        console.log('[Test 1] Cash Payment ID Generation (Must NOT be gateway-style)');
        const cashRes = await fetch(`${API_BASE}/billing/offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerAToken}`
            },
            body: JSON.stringify({
                ticketId: testTicketId,
                paymentMethod: 'cash',
                notes: 'Will hand cash to tech'
            })
        });
        const cashData = await cashRes.json();
        assert(cashRes.status === 200 && cashData.success === true, 'Cash payment submission accepted');
        
        // Query payment record in DB
        const [cashPmtRows] = await connection.query(
            "SELECT * FROM payments WHERE ticket_id = ? AND payment_method = 'cash' ORDER BY id DESC LIMIT 1",
            [testTicketId]
        );
        assert(cashPmtRows.length > 0, 'Cash payment record exists in DB');
        const cashPmt = cashPmtRows[0];
        
        assert(cashPmt.payment_id.startsWith('PAY-CASH-'), `payment_id is ${cashPmt.payment_id} (starts with PAY-CASH-)`);
        assert(!cashPmt.payment_id.startsWith('pay_'), 'payment_id does NOT use Razorpay pay_ prefix');
        assert(cashPmt.order_id === null || !cashPmt.order_id.startsWith('order_'), 'order_id is null / not a gateway order');
        assert(cashPmt.status === 'pending_verification', 'Status is pending_verification');
        assert(cashPmt.collection_status === 'pending_collection', 'Collection status is pending_collection');

        // -------------------------------------------------------------
        // TEST 2: IDOR Protection on Payment Switching
        // -------------------------------------------------------------
        console.log('\n[Test 2] IDOR Protection: Customer B cannot switch Customer A payment method');
        const idorRes = await fetch(`${API_BASE}/billing/switch-payment-method`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerBToken}`
            },
            body: JSON.stringify({
                ticketId: testTicketId
            })
        });
        const idorData = await idorRes.json();
        assert(idorRes.status === 403 && idorData.success === false, 'Unauthorized switch rejected with 403 Forbidden');

        // -------------------------------------------------------------
        // TEST 3: Customer A Switches Cash to Online Payment
        // -------------------------------------------------------------
        console.log('\n[Test 3] Customer A Switches from Uncollected Cash to Online');
        const switchRes = await fetch(`${API_BASE}/billing/switch-payment-method`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerAToken}`
            },
            body: JSON.stringify({
                ticketId: testTicketId
            })
        });
        const switchData = await switchRes.json();
        assert(switchRes.status === 200 && switchData.success === true, 'Switch endpoint returned 200 OK');
        assert(switchData.message.includes('switched'), 'Response message confirms payment method switch');

        // Verify previous cash payment status in DB: MUST be 'cancelled', NOT 'rejected'
        const [updatedCashRows] = await connection.query(
            "SELECT * FROM payments WHERE id = ?",
            [cashPmt.id]
        );
        assert(updatedCashRows[0].status === 'cancelled', `Previous cash payment status is 'cancelled' (was ${updatedCashRows[0].status})`);
        assert(updatedCashRows[0].status !== 'rejected', 'Previous cash payment is NOT marked as rejected');
        const refNote = updatedCashRows[0].reference_note || updatedCashRows[0].notes || '';
        assert(refNote.includes('Superseded'), 'Notes indicate payment was superseded by customer');

        // Verify ticket & invoice status reset for online payment
        const [ticketAfterSwitch] = await connection.query(
            "SELECT payment_status, collection_status, payment_id FROM service_requests WHERE id = ?",
            [testTicketId]
        );
        assert(ticketAfterSwitch[0].payment_status === 'pending', 'Ticket payment_status reset to pending');
        assert(ticketAfterSwitch[0].collection_status === 'not_applicable', 'Ticket collection_status reset to not_applicable');
        assert(ticketAfterSwitch[0].payment_id === null, 'Ticket payment_id cleared');

        const [invoiceAfterSwitch] = await connection.query(
            "SELECT status, payment_id FROM invoices WHERE id = ?",
            [testInvoiceId]
        );
        assert(invoiceAfterSwitch[0].status === 'Final', `Invoice status remains Final for payment re-entry (actual: ${invoiceAfterSwitch[0].status})`);
        assert(invoiceAfterSwitch[0].payment_id === null, 'Invoice payment_id cleared');

        // -------------------------------------------------------------
        // TEST 4: Online Razorpay Order Creation After Switch
        // -------------------------------------------------------------
        console.log('\n[Test 4] Online Payment Order Creation After Switch');
        const orderRes = await fetch(`${API_BASE}/billing/create-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerAToken}`
            },
            body: JSON.stringify({
                ticketId: testTicketId
            })
        });
        const orderData = await orderRes.json();
        assert(orderRes.status === 200 && orderData.success === true, 'Online order created successfully after switch');
        assert(orderData.data.orderId.startsWith('order_'), `Razorpay orderId returned: ${orderData.data.orderId}`);
        assert(Number(orderData.data.amount) === 3500, 'Order amount matches repair cost ₹3500');

        // -------------------------------------------------------------
        // TEST 5: Double Settlement Prevention (Superseded Cash Cannot Be Verified or Collected)
        // -------------------------------------------------------------
        console.log('\n[Test 5] Double Settlement Prevention: Superseded Cash Cannot Be Collected or Verified');
        
        // 5a. Assigned technician tries to record cash for superseded payment
        const doubleCollectRes = await fetch(`${API_BASE}/billing/record-cash-collected`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${assignedTechToken}`
            },
            body: JSON.stringify({
                paymentId: cashPmt.id
            })
        });
        const doubleCollectData = await doubleCollectRes.json();
        assert(doubleCollectRes.status === 400 && doubleCollectData.success === false, 'Technician collection of cancelled payment rejected with 400');

        // 5b. Admin tries to verify superseded payment
        const doubleVerifyRes = await fetch(`${API_BASE}/billing/verify-offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                paymentId: cashPmt.id,
                action: 'verify'
            })
        });
        const doubleVerifyData = await doubleVerifyRes.json();
        assert(doubleVerifyRes.status === 400 && doubleVerifyData.success === false, 'Admin verification of cancelled payment rejected with 400');

        // -------------------------------------------------------------
        // TEST 6: Online Payment Settle & Verification
        // -------------------------------------------------------------
        console.log('\n[Test 6] Online Payment Verification & Settlement');
        // Simulate online payment settlement in DB (as would happen via Razorpay webhook or verifyPayment)
        const dummyGatewayPaymentId = `pay_test_${Date.now()}`;
        await connection.query(`
            INSERT INTO payments (
                ticket_id, invoice_id, user_id, amount, currency, payment_method, gateway,
                payment_id, order_id, status, collection_status, verification_status, created_at, updated_at
            ) VALUES (?, ?, ?, 3500.00, 'INR', 'card', 'razorpay', ?, ?, 'paid', 'not_applicable', 'verified', NOW(), NOW())
        `, [testTicketId, testInvoiceId, customerA.id, dummyGatewayPaymentId, orderData.data.orderId]);

        await connection.query(`
            UPDATE service_requests 
            SET payment_status = 'paid', payment_id = ?, payment_method = 'card', paid_at = NOW() 
            WHERE id = ?
        `, [dummyGatewayPaymentId, testTicketId]);

        await connection.query(`
            UPDATE invoices 
            SET status = 'Paid', payment_id = ?, payment_method = 'card', paid_at = NOW() 
            WHERE id = ?
        `, [dummyGatewayPaymentId, testInvoiceId]);

        // Verify receipt endpoint returns online gateway transaction ID
        const receiptRes = await fetch(`${API_BASE}/billing/receipt/ticket/${testTicketId}`, {
            headers: { 'Authorization': `Bearer ${customerAToken}` }
        });
        const receiptData = await receiptRes.json();
        assert(receiptRes.status === 200 && receiptData.success === true, 'Receipt retrieved for settled online payment');
        assert(receiptData.data.paymentId === dummyGatewayPaymentId, `Online paymentId is gateway ID: ${receiptData.data.paymentId}`);
        assert(receiptData.data.paymentStatus === 'paid', 'Payment status is paid');

        // -------------------------------------------------------------
        // TEST 7: Collected Cash CANNOT Be Switched or Circumvented
        // -------------------------------------------------------------
        console.log('\n[Test 7] Collected Cash CANNOT Be Switched or Circumvented');
        // Setup Ticket 2
        const testTicket2Number = `TD-COLLECT-${Date.now()}`;
        const [ticket2Res] = await connection.query(`
            INSERT INTO service_requests (
                ticket_number, user_id, customer_name, email, mobile, city, problem_type,
                device_category, brand, model_number, problem_description,
                status, customer_approval_status, payment_status, collection_status, repair_cost, assigned_technician_id
            ) VALUES (?, ?, ?, ?, ?, 'Delhi', 'Hardware', 'Phone', 'Apple', 'iPhone 13', 'Battery Replacement', 'completed', 'approved', 'unpaid', 'not_applicable', 5000.00, ?)
        `, [testTicket2Number, customerA.id, customerA.name, customerA.email, '9876543212', assignedTech.id]);
        testTicket2Id = ticket2Res.insertId;

        // Create Final Invoice for Ticket 2 (required for cash collection)
        const testInvoice2IdStr = await generateInvoiceId(connection);
        await connection.query(`
            INSERT INTO invoices (
                id, user_id, ticket_id, client_name, amount, currency, status, invoice_date, due_date
            ) VALUES (?, ?, ?, ?, 5000.00, 'INR', 'Final', NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY))
        `, [testInvoice2IdStr, customerA.id, testTicket2Id, customerA.name]);

        // Submit Cash for Ticket 2
        const cash2Res = await fetch(`${API_BASE}/billing/offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerAToken}`
            },
            body: JSON.stringify({
                ticketId: testTicket2Id,
                paymentMethod: 'cash',
                notes: 'Cash payment for ticket 2'
            })
        });
        const cash2Data = await cash2Res.json();
        const pmt2Id = cash2Data.data.paymentId || cash2Data.data.id;
        assert(cash2Res.status === 200, 'Ticket 2 cash payment initiated');

        // Technician marks cash as collected!
        const collectRes = await fetch(`${API_BASE}/billing/record-cash-collected`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${assignedTechToken}`
            },
            body: JSON.stringify({
                paymentId: pmt2Id,
                ticketId: testTicket2Id
            })
        });
        const collectData = await collectRes.json();
        assert(collectRes.status === 200 && collectData.success === true, 'Technician successfully recorded physical cash collection');

        // Now customer tries to switch payment method after collection!
        const switchCollectedRes = await fetch(`${API_BASE}/billing/switch-payment-method`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerAToken}`
            },
            body: JSON.stringify({
                ticketId: testTicket2Id
            })
        });
        const switchCollectedData = await switchCollectedRes.json();
        assert(
            switchCollectedRes.status === 400 && switchCollectedData.success === false,
            'Switching collected cash is blocked with 400'
        );
        assert(
            switchCollectedData.message.includes('already been collected'),
            `Blocked message explains cash collected: "${switchCollectedData.message}"`
        );

        // Customer also cannot create online order for collected cash
        const orderCollectedRes = await fetch(`${API_BASE}/billing/create-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerAToken}`
            },
            body: JSON.stringify({
                ticketId: testTicket2Id
            })
        });
        const orderCollectedData = await orderCollectedRes.json();
        assert(
            orderCollectedRes.status === 400 && orderCollectedData.success === false,
            'Online order creation blocked for collected cash'
        );

        // -------------------------------------------------------------
        // TEST 8: Bank Transfer & UPI Identifiers (No Gateway Txn ID, UTR Preserved)
        // -------------------------------------------------------------
        console.log('\n[Test 8] Bank Transfer / UPI UTR & Payment Reference Format');
        // Setup Ticket 3
        const testTicket3Number = `TD-BANK-${Date.now()}`;
        const [ticket3Res] = await connection.query(`
            INSERT INTO service_requests (
                ticket_number, user_id, customer_name, email, mobile, city, problem_type,
                device_category, brand, model_number, problem_description,
                status, customer_approval_status, payment_status, collection_status, repair_cost, assigned_technician_id
            ) VALUES (?, ?, ?, ?, ?, 'Bangalore', 'Hardware', 'Laptop', 'HP', 'Spectre', 'Keyboard Replacement', 'completed', 'approved', 'unpaid', 'not_applicable', 4200.00, ?)
        `, [testTicket3Number, customerA.id, customerA.name, customerA.email, '9876543213', assignedTech.id]);
        const testTicket3Id = ticket3Res.insertId;

        const bankRes = await fetch(`${API_BASE}/billing/offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerAToken}`
            },
            body: JSON.stringify({
                ticketId: testTicket3Id,
                paymentMethod: 'bank_transfer',
                notes: 'UTR-HDFC-998877665544'
            })
        });
        const bankData = await bankRes.json();
        assert(bankRes.status === 200 && bankData.success === true, 'Bank transfer offline payment initiated');
        assert(bankData.data.paymentId.startsWith('PAY-BANK-'), `Bank payment ID is ${bankData.data.paymentId}`);
        assert(bankData.data.referenceNote === 'UTR-HDFC-998877665544', 'UTR reference note preserved');

        // Cleanup test data
        console.log('\n[Cleanup] Removing temporary test records...');
        await connection.query("DELETE FROM payments WHERE ticket_id IN (?, ?, ?)", [testTicketId, testTicket2Id, testTicket3Id]);
        await connection.query("DELETE FROM invoices WHERE ticket_id IN (?, ?, ?)", [testTicketId, testTicket2Id, testTicket3Id]);
        await connection.query("DELETE FROM service_requests WHERE id IN (?, ?, ?)", [testTicketId, testTicket2Id, testTicket3Id]);
        await connection.query("DELETE FROM users WHERE email IN ('custA_test@tektest.com', 'custB_test@tektest.com')");
        console.log('  Cleaned up all test artifacts.');

    } catch (err) {
        console.error('Test execution failed with error:', err);
        testsFailed++;
    } finally {
        if (connection) connection.release();
        await pool.end();
    }

    console.log('\n================================================================');
    console.log(`SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('================================================================\n');

    process.exit(testsFailed > 0 ? 1 : 0);
}

runTests();
