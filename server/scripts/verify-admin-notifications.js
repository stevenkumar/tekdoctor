const assert = require('assert');
const { pool } = require('../config/db.config');
const BASE_URL = 'http://localhost:5000/api';

async function testAdminNotificationsFlow() {
    console.log('--- STARTING AUTOMATED ADMIN NOTIFICATIONS VERIFICATION ---');
    let connection;
    let token = null;
    let adminUserId = null;
    let testNotificationId = null;

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
        adminUserId = loginJson.data.id;
        console.log(`[PASS] Logged in as Admin (User ID: ${adminUserId}) successfully.`);

        // 2. Fetch Notifications List
        const fetchRes = await fetch(`${BASE_URL}/notifications`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Connection': 'close'
            }
        });
        assert.strictEqual(fetchRes.status, 200, 'Fetch notifications should respond 200 OK');
        const fetchJson = await fetchRes.json();
        assert.ok(fetchJson.success, 'Fetch notifications response should report success');
        console.log(`[PASS] Initial notifications fetched. Count: ${fetchJson.data.length}`);

        // 3. Send Notification to Admin
        const sendPayload = {
            userId: adminUserId,
            title: 'System Alert Test Notification',
            message: 'Dashboard alerts indicator automated integration test check.'
        };
        const sendRes = await fetch(`${BASE_URL}/notifications/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Connection': 'close'
            },
            body: JSON.stringify(sendPayload)
        });
        assert.strictEqual(sendRes.status, 200, 'Send notification API should respond 200 OK');
        console.log('[PASS] Sent test notification to Admin user account.');

        // 4. Fetch notifications again and verify the new one is present and is UNREAD
        const fetch2Res = await fetch(`${BASE_URL}/notifications`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Connection': 'close'
            }
        });
        const fetch2Json = await fetch2Res.json();
        const testNotif = fetch2Json.data.find(n => n.title === sendPayload.title);
        assert.ok(testNotif, 'Created notification should exist in the notifications array');
        assert.strictEqual(testNotif.is_read, 0, 'New notification should initially be UNREAD (is_read = 0)');
        testNotificationId = testNotif.id;
        console.log(`[PASS] Verified test notification exists and is unread. In-App ID: ${testNotificationId}`);

        // 5. Mark as Read (PUT /api/notifications/:id/read)
        const readRes = await fetch(`${BASE_URL}/notifications/${testNotificationId}/read`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Connection': 'close'
            }
        });
        assert.strictEqual(readRes.status, 200, 'Mark as read API should respond 200 OK');
        console.log(`[PASS] Marked notification ${testNotificationId} as Read.`);

        // 6. Fetch third time and verify status updated to READ
        const fetch3Res = await fetch(`${BASE_URL}/notifications`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Connection': 'close'
            }
        });
        const fetch3Json = await fetch3Res.json();
        const testNotifUpdated = fetch3Json.data.find(n => n.id === testNotificationId);
        assert.ok(testNotifUpdated, 'Notification must still exist');
        assert.strictEqual(testNotifUpdated.is_read, 1, 'Mark as read should successfully change status in DB to READ (is_read = 1)');
        console.log('[PASS] Verified read status synchronization in Database.');

        // Clean up from Database
        await connection.query('DELETE FROM notifications WHERE id = ?', [testNotificationId]);
        console.log('[PASS] Database cleaned up.');

        console.log('\n🌟 ALL NOTIFICATIONS FLOW API VERIFICATION TESTS PASSED!');
        setTimeout(() => { process.exit(0); }, 150);
    } catch (error) {
        console.error('\n🚨 TEST FAILURE:', error.message);
        setTimeout(() => { process.exit(1); }, 150);
    } finally {
        if (connection) connection.release();
        await pool.end();
    }
}

testAdminNotificationsFlow();
