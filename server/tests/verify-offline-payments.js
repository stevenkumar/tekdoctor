/**
 * Verification & Regression Test Suite: Offline & Cash Payment System
 * 
 * Verifies:
 * 1. Online payment flow intact & functional
 * 2. Payment eligibility calculation (DB-authoritative amount)
 * 3. Offline Cash payment submission -> pending_verification, pending_collection
 * 4. Idempotency protection against duplicate pending submissions
 * 5. Strict Technician scoping & IDOR prevention (only assigned tech can record cash)
 * 6. Technician cash recording -> collection_status = 'collected', status remains 'pending_verification'
 * 7. Admin payment rejection with reason -> status = 'rejected'
 * 8. Customer payment retry with Bank Transfer + UTR
 * 9. Admin payment verification & final ticket/invoice settlement -> status = 'paid'
 * 10. Post-settlement receipt generation & idempotency lock
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
    console.log('TEST SUITE: Offline & Cash Payment Architecture Verification');
    console.log('================================================================\n');

    let connection;
    let adminUser, adminToken;
    let assignedTech, assignedTechToken;
    let otherTech, otherTechToken;
    let customerUser, customerToken;
    let testTicketId, testInvoiceId;

    try {
        connection = await pool.getConnection();

        // -------------------------------------------------------------
        // Setup Users
        // -------------------------------------------------------------
        console.log('[Setup] Preparing test users & credentials...');
        const [adminRows] = await connection.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
        if (adminRows.length === 0) throw new Error('No admin user found.');
        adminUser = adminRows[0];
        adminToken = await generateToken(adminUser);

        // Find or create Assigned Tech and Other Tech
        const [techRows] = await connection.query("SELECT * FROM users WHERE role = 'technician' LIMIT 2");
        const defaultHash = await bcrypt.hash('Test@12345', 10);

        if (techRows.length < 2) {
            const [t1] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Test Tech 1', 'testtech1@tektest.com', ?, 'technician', 1)",
                [defaultHash]
            );
            const [t2] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Test Tech 2', 'testtech2@tektest.com', ?, 'technician', 1)",
                [defaultHash]
            );
            const [r1] = await connection.query('SELECT * FROM users WHERE id = ?', [t1.insertId]);
            const [r2] = await connection.query('SELECT * FROM users WHERE id = ?', [t2.insertId]);
            assignedTech = r1[0];
            otherTech = r2[0];
        } else {
            assignedTech = techRows[0];
            otherTech = techRows[1];
        }
        assignedTechToken = await generateToken(assignedTech);
        otherTechToken = await generateToken(otherTech);

        // Find or create customer
        const [custRows] = await connection.query("SELECT * FROM users WHERE role = 'customer' LIMIT 1");
        if (custRows.length === 0) {
            const [c1] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Test Customer', 'testcust@tektest.com', ?, 'customer', 1)",
                [defaultHash]
            );
            const [rc] = await connection.query('SELECT * FROM users WHERE id = ?', [c1.insertId]);
            customerUser = rc[0];
        } else {
            customerUser = custRows[0];
        }
        customerToken = await generateToken(customerUser);

        // Setup Test Ticket
        const testTicketNumber = `TD-TEST-${Date.now()}`;
        const [ticketRes] = await connection.query(`
            INSERT INTO service_requests (
                ticket_number, user_id, customer_name, email, mobile, city, problem_type,
                device_category, brand, model_number, problem_description,
                status, customer_approval_status, payment_status, collection_status, repair_cost, assigned_technician_id
            ) VALUES (?, ?, ?, ?, ?, 'Mumbai', 'Hardware', 'Laptop', 'Dell', 'XPS 15', 'Screen replacement', 'completed', 'approved', 'unpaid', 'not_applicable', 2499.00, ?)
        `, [testTicketNumber, customerUser.id, customerUser.name, customerUser.email, '9876543210', assignedTech.id]);
        testTicketId = ticketRes.insertId;

        // Setup Test Invoice
        const testInvoiceIdStr = await generateInvoiceId(connection);
        await connection.query(`
            INSERT INTO invoices (
                id, user_id, ticket_id, client_name, amount, currency, status, invoice_date, due_date
            ) VALUES (?, ?, ?, ?, 2499.00, 'INR', 'Final', NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY))
        `, [testInvoiceIdStr, customerUser.id, testTicketId, customerUser.name]);
        testInvoiceId = testInvoiceIdStr;

        console.log(`  Created test ticket ID ${testTicketId} (${testTicketNumber}) & invoice ${testInvoiceId}\n`);

        // -------------------------------------------------------------
        // TEST 1: Payment Eligibility Check
        // -------------------------------------------------------------
        console.log('[Test 1] Payment Eligibility Query');
        const eligRes = await fetch(`${API_BASE}/billing/eligibility/${testTicketId}`, {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        const eligData = await eligRes.json();
        assert(eligRes.status === 200 && eligData.success === true, 'Eligibility endpoint returned 200 OK');
        assert(eligData.data.eligible === true, 'Ticket is reported as eligible for payment');
        assert(Number(eligData.data.amount) === 2499, 'Payment amount matches DB-authoritative amount ₹2499');
        assert(eligData.data.currency === 'INR', 'Currency is correctly formatted as INR');

        // -------------------------------------------------------------
        // TEST 2: Customer Submits Cash Payment
        // -------------------------------------------------------------
        console.log('\n[Test 2] Customer Submits Offline Cash Payment');
        const cashRes = await fetch(`${API_BASE}/billing/offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerToken}`
            },
            body: JSON.stringify({
                ticketId: testTicketId,
                paymentMethod: 'cash',
                notes: 'Will hand over exact cash to technician upon delivery'
            })
        });
        const cashData = await cashRes.json();
        assert(cashRes.status === 200 && cashData.success === true, 'Cash payment submission accepted');
        assert(cashData.data.status === 'pending_verification', 'Payment status initialized to pending_verification');
        assert(cashData.data.collectionStatus === 'pending_collection', 'Collection status initialized to pending_collection');

        // Verify DB state
        const [dbCheck1] = await connection.query('SELECT status, payment_status, collection_status FROM service_requests WHERE id = ?', [testTicketId]);
        assert(dbCheck1[0].payment_status === 'pending_verification', 'DB service_requests.payment_status updated to pending_verification');
        assert(dbCheck1[0].collection_status === 'pending_collection', 'DB service_requests.collection_status updated to pending_collection');

        // -------------------------------------------------------------
        // TEST 3: Duplicate Submission Idempotency Check
        // -------------------------------------------------------------
        console.log('\n[Test 3] Idempotency: Duplicate Offline Payment Rejection');
        const dupRes = await fetch(`${API_BASE}/billing/offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerToken}`
            },
            body: JSON.stringify({
                ticketId: testTicketId,
                paymentMethod: 'cash'
            })
        });
        const dupData = await dupRes.json();
        assert(dupRes.status === 400 && dupData.success === false, 'Duplicate pending request rejected with 400');
        assert(dupData.message.includes('pending verification'), 'Rejection message explains payment is pending');

        // -------------------------------------------------------------
        // TEST 4: Technician Security & Cash Collection
        // -------------------------------------------------------------
        console.log('\n[Test 4] Technician Isolation & Scoped Cash Collection');
        // 4a. Unassigned Technician attempts collection
        const unauthRes = await fetch(`${API_BASE}/billing/record-cash-collected`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${otherTechToken}`
            },
            body: JSON.stringify({
                ticketId: testTicketId,
                notes: 'Malicious / unassigned collection attempt'
            })
        });
        const unauthData = await unauthRes.json();
        assert(unauthRes.status === 403, 'Unassigned technician is strictly forbidden (403)');

        // 4b. Customer attempts to call record-cash-collected
        const custCollectRes = await fetch(`${API_BASE}/billing/record-cash-collected`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerToken}`
            },
            body: JSON.stringify({ ticketId: testTicketId })
        });
        assert(custCollectRes.status === 403, 'Customer role cannot call cash collected endpoint (403)');

        // 4c. Assigned Technician records cash collected
        const authCollectRes = await fetch(`${API_BASE}/billing/record-cash-collected`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${assignedTechToken}`
            },
            body: JSON.stringify({
                ticketId: testTicketId,
                notes: 'Received ₹2499 in cash from customer'
            })
        });
        const authCollectData = await authCollectRes.json();
        assert(authCollectRes.status === 200 && authCollectData.success === true, 'Assigned technician cash collection recorded');

        // Verify DB: collection_status is 'collected', but status remains 'pending_verification'
        const [dbCheck2] = await connection.query(`
            SELECT p.status, p.collection_status, p.collected_by, sr.collection_status as sr_col
            FROM payments p
            JOIN service_requests sr ON p.ticket_id = sr.id
            WHERE p.ticket_id = ?
            ORDER BY p.id DESC LIMIT 1
        `, [testTicketId]);
        assert(dbCheck2[0].collection_status === 'collected', 'Payment collection_status is now "collected"');
        assert(dbCheck2[0].collected_by === assignedTech.id, 'collected_by matches assigned technician ID');
        assert(dbCheck2[0].sr_col === 'collected', 'Ticket collection_status is now "collected"');
        assert(dbCheck2[0].status === 'pending_verification', 'CRITICAL: status remains "pending_verification" until Admin verifies');

        // -------------------------------------------------------------
        // TEST 5: Admin Payment Rejection
        // -------------------------------------------------------------
        console.log('\n[Test 5] Admin Rejection with Audit Reason');
        const rejectRes = await fetch(`${API_BASE}/billing/verify-offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                ticketId: testTicketId,
                action: 'reject',
                rejectionReason: 'Cash envelope received was short by ₹200'
            })
        });
        const rejectData = await rejectRes.json();
        assert(rejectRes.status === 200 && rejectData.success === true, 'Admin rejection executed successfully');

        const [dbCheck3] = await connection.query(`
            SELECT p.status, p.verification_status, p.reference_note, sr.payment_status
            FROM payments p
            JOIN service_requests sr ON p.ticket_id = sr.id
            WHERE p.ticket_id = ?
            ORDER BY p.id DESC LIMIT 1
        `, [testTicketId]);
        assert(dbCheck3[0].status === 'rejected', 'Payment status transitioned to "rejected"');
        assert(dbCheck3[0].verification_status === 'rejected', 'verification_status transitioned to "rejected"');
        assert(dbCheck3[0].payment_status === 'rejected', 'Ticket payment_status transitioned to "rejected"');
        assert(dbCheck3[0].reference_note.includes('Cash envelope received was short'), 'Rejection reason recorded in reference_note');

        // -------------------------------------------------------------
        // TEST 6: Customer Retries with Bank Transfer / UTR
        // -------------------------------------------------------------
        console.log('\n[Test 6] Customer Retries with Bank Transfer & UTR');
        const retryRes = await fetch(`${API_BASE}/billing/offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerToken}`
            },
            body: JSON.stringify({
                ticketId: testTicketId,
                paymentMethod: 'bank_transfer',
                referenceNote: 'NEFT UTR: SBIN2026092601928374'
            })
        });
        const retryData = await retryRes.json();
        assert(retryRes.status === 200 && retryData.success === true, 'Retry with Bank Transfer accepted');
        assert(retryData.data.paymentMethod === 'bank_transfer', 'Payment method is bank_transfer');
        assert(retryData.data.referenceNote === 'NEFT UTR: SBIN2026092601928374', 'UTR reference note persisted');
        assert(retryData.data.status === 'pending_verification', 'New payment record is pending_verification');

        // -------------------------------------------------------------
        // TEST 7: Admin Verification & Full Ticket Settlement
        // -------------------------------------------------------------
        console.log('\n[Test 7] Admin Verification & Ticket Settlement');
        const verifyRes = await fetch(`${API_BASE}/billing/verify-offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                ticketId: testTicketId,
                action: 'verify',
                notes: 'Bank statement verified. Funds received in ICICI account.'
            })
        });
        const verifyData = await verifyRes.json();
        assert(verifyRes.status === 200 && verifyData.success === true, 'Admin offline payment verification succeeded');

        const [dbCheck4] = await connection.query(`
            SELECT p.status, p.verification_status, p.verified_by, sr.payment_status, inv.status as inv_status
            FROM payments p
            JOIN service_requests sr ON p.ticket_id = sr.id
            LEFT JOIN invoices inv ON p.invoice_id = inv.id
            WHERE p.ticket_id = ?
            ORDER BY p.id DESC LIMIT 1
        `, [testTicketId]);
        assert(dbCheck4[0].status === 'paid', 'Payment status is now "paid"');
        assert(dbCheck4[0].verification_status === 'verified', 'verification_status is now "verified"');
        assert(dbCheck4[0].verified_by === adminUser.id, 'verified_by matches admin user ID');
        assert(dbCheck4[0].payment_status === 'paid', 'Ticket payment_status is now "paid"');
        assert(dbCheck4[0].inv_status === 'Paid', 'Invoice status is now "Paid"');

        // -------------------------------------------------------------
        // TEST 8: Post-Settlement Eligibility Lock & Receipt
        // -------------------------------------------------------------
        console.log('\n[Test 8] Post-Settlement Eligibility & Receipt Access');
        const postEligRes = await fetch(`${API_BASE}/billing/eligibility/${testTicketId}`, {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        const postEligData = await postEligRes.json();
        assert(postEligData.data.eligible === false, 'Settled ticket is no longer eligible for checkout');
        assert(postEligData.data.reason.includes('already been paid'), 'Reason specifies payment already completed');

        const receiptRes = await fetch(`${API_BASE}/billing/receipt/${testInvoiceId}`, {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        const receiptData = await receiptRes.json();
        if (!receiptRes.ok) {
            console.error('Receipt error:', receiptRes.status, receiptData);
        }
        assert(receiptRes.status === 200 && receiptData.success === true, 'Receipt retrieved successfully');
        if (receiptData.data) {
            assert(receiptData.data.paymentStatus === 'paid', 'Receipt reflects Paid status');
            assert(receiptData.data.paymentMethod === 'bank_transfer', 'Receipt reflects Bank Transfer method');
        }

        // -------------------------------------------------------------
        // TEST 9: Online Payment Order Creation Flow Intact
        // -------------------------------------------------------------
        console.log('\n[Test 9] Online Payment Flow Preservation');
        // Create an eligible online ticket
        const [onlineTicketRes] = await connection.query(`
            INSERT INTO service_requests (
                ticket_number, user_id, customer_name, email, mobile, city, problem_type,
                device_category, brand, model_number, problem_description,
                status, customer_approval_status, payment_status, repair_cost, assigned_technician_id
            ) VALUES (?, ?, ?, ?, ?, 'Delhi', 'Battery', 'Phone', 'Apple', 'iPhone 14', 'Battery replacement', 'completed', 'approved', 'unpaid', 1200.00, ?)
        `, [`TD-ONLINE-${Date.now()}`, customerUser.id, customerUser.name, customerUser.email, '9876543210', assignedTech.id]);
        const onlineTicketId = onlineTicketRes.insertId;

        const onlineOrderRes = await fetch(`${API_BASE}/billing/create-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerToken}`
            },
            body: JSON.stringify({ ticketId: onlineTicketId })
        });
        const onlineOrderData = await onlineOrderRes.json();
        assert(onlineOrderRes.status === 200 && onlineOrderData.success === true, 'Online Razorpay order created without regressions');
        assert(onlineOrderData.data.orderId && onlineOrderData.data.keyId, 'Order contains orderId and client keyId');
        assert(Number(onlineOrderData.data.amount) === 1200, 'Online order amount is ₹1200');

        // Clean up online test ticket
        await connection.query('DELETE FROM payments WHERE ticket_id = ?', [onlineTicketId]);
        await connection.query('DELETE FROM invoices WHERE ticket_id = ?', [onlineTicketId]);
        await connection.query('DELETE FROM service_requests WHERE id = ?', [onlineTicketId]);

        // Clean up main test records
        await connection.query('DELETE FROM payments WHERE ticket_id = ?', [testTicketId]);
        await connection.query('DELETE FROM invoices WHERE id = ?', [testInvoiceId]);
        await connection.query('DELETE FROM service_requests WHERE id = ?', [testTicketId]);
        console.log('\n  Cleaned up all test artifacts.');

    } catch (err) {
        console.error('Test execution failed with error:', err);
        testsFailed++;
    } finally {
        if (connection) connection.release();
        await pool.end();
    }

    console.log('\n================================================================');
    console.log(`SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('================================================================');

    if (testsFailed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests();
