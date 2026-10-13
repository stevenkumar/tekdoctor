/**
 * Verification Test Suite: Payment Verification Rejection Notifications
 *
 * Verifies:
 * 1. Offline payment rejected by Admin -> BOTH Customer and Assigned Technician receive notifications.
 * 2. Notification content: clearly indicates payment verification rejected, references amount, payment ID, ticket number, rejection reason.
 * 3. Read/unread state and existing notification API integration (/api/notifications).
 * 4. Isolation: Customer sees only customer notification, Technician sees only technician notification.
 * 5. Idempotency: Retrying or repeated rejection notification does not create duplicate notifications.
 * 6. Unassigned technician case: If no technician assigned to ticket, technician notification is cleanly skipped.
 * 7. Inactive technician case: If assigned technician is deactivated (is_active = 0), technician notification is cleanly skipped.
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
    console.log('TEST SUITE: Payment Verification Rejection Notifications');
    console.log('================================================================\n');

    let connection;
    let adminUser, adminToken;
    let customerUser, customerToken;
    let assignedTech, assignedTechToken;
    let inactiveTech;
    let ticketIdWithTech, ticketIdUnassigned, ticketIdInactiveTech;
    const testPaymentIds = [];

    try {
        connection = await pool.getConnection();

        // -------------------------------------------------------------
        // Setup Users
        // -------------------------------------------------------------
        console.log('[Setup] Preparing test users & tokens...');
        const [adminRows] = await connection.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
        if (adminRows.length === 0) throw new Error('No admin user found.');
        adminUser = adminRows[0];
        adminToken = await generateToken(adminUser);

        const defaultHash = await bcrypt.hash('Test@12345', 10);
        const timestamp = Date.now();

        // Create dedicated test customer
        const [custRes] = await connection.query(
            "INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, 'customer', 1)",
            [`Test Customer ${timestamp}`, `cust_rej_${timestamp}@tektest.com`, defaultHash]
        );
        const [cRows] = await connection.query('SELECT * FROM users WHERE id = ?', [custRes.insertId]);
        customerUser = cRows[0];
        customerToken = await generateToken(customerUser);

        // Create dedicated test technician (active)
        const [techRes] = await connection.query(
            "INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, 'technician', 1)",
            [`Test Tech ${timestamp}`, `tech_rej_${timestamp}@tektest.com`, defaultHash]
        );
        const [tRows] = await connection.query('SELECT * FROM users WHERE id = ?', [techRes.insertId]);
        assignedTech = tRows[0];
        assignedTechToken = await generateToken(assignedTech);

        // Create dedicated test technician (inactive)
        const [inactTechRes] = await connection.query(
            "INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, 'technician', 0)",
            [`Inactive Tech ${timestamp}`, `inact_tech_${timestamp}@tektest.com`, defaultHash]
        );
        const [itRows] = await connection.query('SELECT * FROM users WHERE id = ?', [inactTechRes.insertId]);
        inactiveTech = itRows[0];

        // -------------------------------------------------------------
        // Setup Tickets
        // -------------------------------------------------------------
        console.log('[Setup] Creating test tickets...');
        // 1. Ticket assigned to active technician
        const [tk1Res] = await connection.query(`
            INSERT INTO service_requests (
                ticket_number, user_id, customer_name, email, mobile, city, problem_type,
                device_category, brand, model_number, problem_description,
                status, repair_cost, estimated_cost, customer_approval_status,
                payment_status, assigned_technician_id
            ) VALUES (?, ?, ?, ?, '9999999999', 'Delhi', 'Hardware', 'smartphone', 'Google', 'Pixel 8', 'Damaged screen',
                      'completed', 3500.00, 3500.00, 'approved', 'unpaid', ?)
        `, [`TD-REJ-A-${timestamp}`, customerUser.id, customerUser.name, customerUser.email, assignedTech.id]);
        ticketIdWithTech = tk1Res.insertId;

        // 2. Ticket initially assigned to technician, will be unassigned before rejection
        const [tk2Res] = await connection.query(`
            INSERT INTO service_requests (
                ticket_number, user_id, customer_name, email, mobile, city, problem_type,
                device_category, brand, model_number, problem_description,
                status, repair_cost, estimated_cost, customer_approval_status,
                payment_status, assigned_technician_id
            ) VALUES (?, ?, ?, ?, '9999999999', 'Delhi', 'Hardware', 'laptop', 'Dell', 'XPS 15', 'Battery issue',
                      'completed', 4200.00, 4200.00, 'approved', 'unpaid', ?)
        `, [`TD-REJ-B-${timestamp}`, customerUser.id, customerUser.name, customerUser.email, assignedTech.id]);
        ticketIdUnassigned = tk2Res.insertId;

        // 3. Ticket assigned to technician who will be deactivated before rejection
        const [tk3Res] = await connection.query(`
            INSERT INTO service_requests (
                ticket_number, user_id, customer_name, email, mobile, city, problem_type,
                device_category, brand, model_number, problem_description,
                status, repair_cost, estimated_cost, customer_approval_status,
                payment_status, assigned_technician_id
            ) VALUES (?, ?, ?, ?, '9999999999', 'Delhi', 'Hardware', 'tablet', 'Apple', 'iPad Air', 'Port broken',
                      'completed', 2800.00, 2800.00, 'approved', 'unpaid', ?)
        `, [`TD-REJ-C-${timestamp}`, customerUser.id, customerUser.name, customerUser.email, inactiveTech.id]);
        ticketIdInactiveTech = tk3Res.insertId;

        console.log(`  Tickets created: ActiveTech=#${ticketIdWithTech}, Unassigned=#${ticketIdUnassigned}, InactiveTech=#${ticketIdInactiveTech}\n`);

        // =============================================================
        // SCENARIO 1: Happy Path - Both Customer & Assigned Tech Notified
        // =============================================================
        console.log('[Test 1] Submit offline payment for Ticket with Assigned Tech');
        const submitRes1 = await fetch(`${API_BASE}/billing/offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerToken}`
            },
            body: JSON.stringify({
                ticketId: ticketIdWithTech,
                paymentMethod: 'cash'
            })
        });
        const submitData1 = await submitRes1.json();
        assert(submitRes1.status === 200 && submitData1.success === true, 'Offline cash payment submitted successfully');
        const paymentId1 = submitData1.data?.paymentId;
        testPaymentIds.push(paymentId1);
        assert(paymentId1 != null, `Payment record created with ID: ${paymentId1}`);

        console.log('\n[Test 2] Admin rejects offline payment with reason');
        const rejectionReason = 'Counterfeit currency note detected during physical cash audit';
        const rejectRes1 = await fetch(`${API_BASE}/billing/verify-offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                ticketId: ticketIdWithTech,
                action: 'reject',
                rejectionReason
            })
        });
        const rejectData1 = await rejectRes1.json();
        assert(rejectRes1.status === 200 && rejectData1.success === true, 'Admin payment rejection endpoint returned 200 OK');
        assert(rejectData1.data.status === 'rejected', 'Payment status returned as "rejected"');

        // Check DB payment and ticket status
        const [pmtCheck1] = await connection.query('SELECT status, verification_status FROM payments WHERE payment_id = ?', [paymentId1]);
        assert(pmtCheck1[0].status === 'rejected', 'DB payments.status transitioned to "rejected"');
        assert(pmtCheck1[0].verification_status === 'rejected', 'DB payments.verification_status transitioned to "rejected"');

        const [tkCheck1] = await connection.query('SELECT payment_status FROM service_requests WHERE id = ?', [ticketIdWithTech]);
        assert(tkCheck1[0].payment_status === 'rejected', 'DB service_requests.payment_status transitioned to "rejected"');

        console.log('\n[Test 3] Verify Customer Rejection Notification');
        const [custNotifs] = await connection.query(
            "SELECT * FROM notifications WHERE user_id = ? AND ticket_id = ? AND title = 'Payment Verification Rejected' ORDER BY id DESC",
            [customerUser.id, ticketIdWithTech]
        );
        assert(custNotifs.length === 1, `Customer received exactly 1 rejection notification for ticket ${ticketIdWithTech}`);
        const cNotif = custNotifs[0];
        assert(cNotif.title === 'Payment Verification Rejected', 'Customer notification title is "Payment Verification Rejected"');
        assert(cNotif.message.includes(rejectionReason), 'Customer notification message contains the rejection reason');
        assert(cNotif.message.includes('3500.00'), 'Customer notification message contains the payment amount ₹3500.00');
        assert(cNotif.message.includes(paymentId1), 'Customer notification message contains the payment ID reference');
        assert(cNotif.message.includes(`TD-REJ-A-${timestamp}`), 'Customer notification message contains the ticket number');
        assert(cNotif.is_read === 0 || cNotif.is_read === false, 'Customer notification is initially unread (is_read = 0)');

        console.log('\n[Test 4] Verify Assigned Technician Rejection Notification');
        const [techNotifs] = await connection.query(
            "SELECT * FROM notifications WHERE user_id = ? AND ticket_id = ? AND title = 'Payment Verification Rejected' ORDER BY id DESC",
            [assignedTech.id, ticketIdWithTech]
        );
        assert(techNotifs.length === 1, `Assigned Technician received exactly 1 rejection notification for ticket ${ticketIdWithTech}`);
        const tNotif = techNotifs[0];
        assert(tNotif.title === 'Payment Verification Rejected', 'Technician notification title is "Payment Verification Rejected"');
        assert(tNotif.message.includes(rejectionReason), 'Technician notification message contains the rejection reason');
        assert(tNotif.message.includes('3500.00'), 'Technician notification message contains the payment amount ₹3500.00');
        assert(tNotif.message.includes(paymentId1), 'Technician notification message contains the payment ID reference');
        assert(tNotif.message.includes(`TD-REJ-A-${timestamp}`), 'Technician notification message contains the ticket number');
        assert(tNotif.is_read === 0 || tNotif.is_read === false, 'Technician notification is initially unread (is_read = 0)');

        console.log('\n[Test 5] Notification Isolation & API Read/Unread');
        // Customer calls GET /api/notifications
        const custApiRes = await fetch(`${API_BASE}/notifications`, {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        const custApiData = await custApiRes.json();
        assert(custApiRes.status === 200 && custApiData.success === true, 'Customer GET /api/notifications succeeds');
        const custNotifList = custApiData.data || [];
        const hasTechNotifInCust = custNotifList.some(n => n.id === tNotif.id);
        assert(!hasTechNotifInCust, 'Customer CANNOT see Technician notification (Strict Isolation)');

        // Technician calls GET /api/notifications
        const techApiRes = await fetch(`${API_BASE}/notifications`, {
            headers: { 'Authorization': `Bearer ${assignedTechToken}` }
        });
        const techApiData = await techApiRes.json();
        assert(techApiRes.status === 200 && techApiData.success === true, 'Technician GET /api/notifications succeeds');
        const techNotifList = techApiData.data || [];
        const hasCustNotifInTech = techNotifList.some(n => n.id === cNotif.id);
        assert(!hasCustNotifInTech, 'Technician CANNOT see Customer notification (Strict Isolation)');

        // Technician marks notification as read
        const markReadRes = await fetch(`${API_BASE}/notifications/${tNotif.id}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${assignedTechToken}` }
        });
        const markReadData = await markReadRes.json();
        assert(markReadRes.status === 200 && markReadData.success === true, 'Technician successfully marked notification as read');
        const [readCheck] = await connection.query('SELECT is_read FROM notifications WHERE id = ?', [tNotif.id]);
        assert(readCheck[0].is_read === 1 || readCheck[0].is_read === true, 'DB notification is_read updated to 1');

        console.log('\n[Test 6] Deduplication on Retry / Repeated Processing');
        // Re-invoke verify-offline-payment with action: reject on the same payment
        const retryRes = await fetch(`${API_BASE}/billing/verify-offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                paymentId: paymentId1,
                action: 'reject',
                rejectionReason: 'Retry rejection attempt'
            })
        });
        // API correctly blocks verification of already rejected payment
        assert(retryRes.status === 400, 'Duplicate rejection attempt on already rejected payment blocked with 400');

        // Check notifications count: MUST STILL BE 1 rejection notification for both customer and technician
        const [custNotifsAfterRetry] = await connection.query(
            "SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND ticket_id = ? AND title = 'Payment Verification Rejected'",
            [customerUser.id, ticketIdWithTech]
        );
        assert(custNotifsAfterRetry[0].cnt === 1, 'NO duplicate notification created for Customer');

        const [techNotifsAfterRetry] = await connection.query(
            "SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND ticket_id = ? AND title = 'Payment Verification Rejected'",
            [assignedTech.id, ticketIdWithTech]
        );
        assert(techNotifsAfterRetry[0].cnt === 1, 'NO duplicate notification created for Technician');

        // =============================================================
        // SCENARIO 2: Unassigned Ticket
        // =============================================================
        console.log('\n[Test 7] Unassigned Ticket Rejection: Customer notified, NO tech notification');
        const submitRes2 = await fetch(`${API_BASE}/billing/offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerToken}`
            },
            body: JSON.stringify({
                ticketId: ticketIdUnassigned,
                paymentMethod: 'bank_transfer',
                transactionRef: 'UTR998877665544'
            })
        });
        const submitData2 = await submitRes2.json();
        assert(submitRes2.status === 200 && submitData2.success === true, 'Bank transfer payment initiated for ticket');
        const paymentId2 = submitData2.data?.paymentId;
        testPaymentIds.push(paymentId2);

        // Unassign technician before admin rejection to verify unassigned ticket handling
        await connection.query('UPDATE service_requests SET assigned_technician_id = NULL WHERE id = ?', [ticketIdUnassigned]);

        const rejectRes2 = await fetch(`${API_BASE}/billing/verify-offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                ticketId: ticketIdUnassigned,
                action: 'reject',
                rejectionReason: 'UTR reference not found in bank statement'
            })
        });
        const rejectData2 = await rejectRes2.json();
        assert(rejectRes2.status === 200 && rejectData2.success === true, 'Admin rejection of unassigned ticket payment succeeded');

        // Customer receives notification
        const [custNotifs2] = await connection.query(
            "SELECT * FROM notifications WHERE user_id = ? AND ticket_id = ? AND title = 'Payment Verification Rejected'",
            [customerUser.id, ticketIdUnassigned]
        );
        assert(custNotifs2.length === 1, 'Customer received rejection notification for unassigned ticket');
        assert(custNotifs2[0].message.includes('UTR reference not found'), 'Customer notification contains rejection reason');

        // Ensure NO rejection notification was created with ticket_id = ticketIdUnassigned for any technician
        const [anyTechNotif] = await connection.query(`
            SELECT n.* FROM notifications n
            JOIN users u ON n.user_id = u.id
            WHERE n.ticket_id = ? AND u.role = 'technician' AND n.title = 'Payment Verification Rejected'
        `, [ticketIdUnassigned]);
        assert(anyTechNotif.length === 0, 'No notification created for non-existent technician');

        // =============================================================
        // SCENARIO 3: Inactive Technician
        // =============================================================
        console.log('\n[Test 8] Deactivated Technician: Cleanly skipped');
        const submitRes3 = await fetch(`${API_BASE}/billing/offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customerToken}`
            },
            body: JSON.stringify({
                ticketId: ticketIdInactiveTech,
                paymentMethod: 'offline_upi',
                transactionRef: 'UPI1122334455'
            })
        });
        const submitData3 = await submitRes3.json();
        assert(submitRes3.status === 200 && submitData3.success === true, 'UPI payment initiated for ticket with inactive tech');
        const paymentId3 = submitData3.data?.paymentId;
        testPaymentIds.push(paymentId3);

        // Deactivate technician before rejection
        await connection.query('UPDATE users SET is_active = 0 WHERE id = ?', [inactiveTech.id]);

        const rejectRes3 = await fetch(`${API_BASE}/billing/verify-offline-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                ticketId: ticketIdInactiveTech,
                action: 'reject',
                rejectionReason: 'Invalid UPI screenshot submitted'
            })
        });
        const rejectData3 = await rejectRes3.json();
        assert(rejectRes3.status === 200 && rejectData3.success === true, 'Admin rejection succeeded for inactive technician ticket');

        // Customer receives notification
        const [custNotifs3] = await connection.query(
            "SELECT * FROM notifications WHERE user_id = ? AND ticket_id = ? AND title = 'Payment Verification Rejected'",
            [customerUser.id, ticketIdInactiveTech]
        );
        assert(custNotifs3.length === 1, 'Customer received rejection notification');

        // Inactive tech does NOT receive rejection notification
        const [inactNotifs] = await connection.query(
            "SELECT * FROM notifications WHERE user_id = ? AND ticket_id = ? AND title = 'Payment Verification Rejected'",
            [inactiveTech.id, ticketIdInactiveTech]
        );
        assert(inactNotifs.length === 0, 'Deactivated technician received NO rejection notification');

    } catch (err) {
        console.error('Fatal test error:', err);
        testsFailed++;
    } finally {
        if (connection) {
            console.log('\n[Cleanup] Cleaning up test artifacts...');
            try {
                // Delete notifications
                if (customerUser || assignedTech || inactiveTech) {
                    await connection.query('DELETE FROM notifications WHERE user_id IN (?, ?, ?)', [
                        customerUser?.id || 0,
                        assignedTech?.id || 0,
                        inactiveTech?.id || 0
                    ]);
                }
                // Delete payments
                if (testPaymentIds.length > 0) {
                    await connection.query('DELETE FROM payments WHERE payment_id IN (?)', [testPaymentIds]);
                }
                // Delete tickets
                const tks = [ticketIdWithTech, ticketIdUnassigned, ticketIdInactiveTech].filter(Boolean);
                if (tks.length > 0) {
                    await connection.query('DELETE FROM service_requests WHERE id IN (?)', [tks]);
                }
                // Delete users
                const uids = [customerUser?.id, assignedTech?.id, inactiveTech?.id].filter(Boolean);
                if (uids.length > 0) {
                    await connection.query('DELETE FROM users WHERE id IN (?)', [uids]);
                }
            } catch (cleanErr) {
                console.error('Cleanup error:', cleanErr.message);
            }
            connection.release();
        }

        console.log('\n================================================================');
        console.log(`SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
        console.log('================================================================\n');

        if (testsFailed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    }
}

runTests();
