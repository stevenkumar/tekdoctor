const { pool } = require('./config/db.config');
const http = require('http');
const fs = require('fs');

// We will start a local http server on port 9000 to listen for the webhooks
function startMockReceiver(onReceived) {
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
        });
        req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            try {
                const payload = JSON.parse(body);
                onReceived(payload);
            } catch (err) {
                console.error('Error parsing webhook payload:', err.message);
            }
        });
    });
    server.listen(9000);
    return server;
}

async function runTest() {
    let server;
    try {
        console.log('1. Setting up mock webhook receiver...');
        const receivedPayloads = [];
        server = startMockReceiver((payload) => {
            console.log('Receiver caught Webhook:', payload.type);
            receivedPayloads.push(payload);
        });

        console.log('2. Configuring integrations settings in DB for testing...');
        // Enable google sheets webhook pointing to our local receiver on port 9000
        await pool.query(
            "INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES ('google_sheet_enabled', 'true', 'integrations') ON DUPLICATE KEY UPDATE setting_value = 'true', setting_group = 'integrations'"
        );
        await pool.query(
            "INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES ('google_sheet_url', 'http://localhost:9000/webhook', 'integrations') ON DUPLICATE KEY UPDATE setting_value = 'http://localhost:9000/webhook', setting_group = 'integrations'"
        );
        await pool.query(
            "INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES ('google_maps_link', 'https://goo.gl/maps/test', 'integrations') ON DUPLICATE KEY UPDATE setting_value = 'https://goo.gl/maps/test', setting_group = 'integrations'"
        );
        await pool.query(
            "INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES ('maintenance_mode', 'false', 'system') ON DUPLICATE KEY UPDATE setting_value = 'false', setting_group = 'system'"
        );
        await pool.query(
            "INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES ('meta_description', 'Custom dynamic description', 'seo') ON DUPLICATE KEY UPDATE setting_value = 'Custom dynamic description', setting_group = 'seo'"
        );
        await pool.query(
            "INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES ('meta_keywords', 'custom, dynamic, seo', 'seo') ON DUPLICATE KEY UPDATE setting_value = 'custom, dynamic, seo', setting_group = 'seo'"
        );

        console.log('3. Triggering Contact Form Submission API...');
        const contactPostData = JSON.stringify({
            name: 'Integration Test Boy',
            email: 'testboy@inquiry.com',
            phone: '9876543210',
            message: 'Hello, this is a Google Sheets sync test message!'
        });

        const contactReq = http.request({
            hostname: 'localhost',
            port: 5000,
            path: '/api/contact',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': contactPostData.length
            }
        }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', async () => {
                console.log('Contact response status:', res.statusCode);

                console.log('4. Triggering Repair Request Submission API...');
                const repairPostData = JSON.stringify({
                    customerName: 'Integration Test Boy',
                    mobile: '9876543210',
                    email: 'testboy@inquiry.com',
                    city: 'Mumbai',
                    deviceCategory: 'Smartphone',
                    brand: 'Samsung',
                    modelNumber: 'Galaxy S23',
                    problemType: 'Screen Damage',
                    problemDescription: 'My phone screen is broken and flickering',
                    serviceType: 'Bring to Service Center',
                    priority: 'Urgent',
                    preferredContactMethod: 'Call'
                });

                const repairReq = http.request({
                    hostname: 'localhost',
                    port: 5000,
                    path: '/api/repair-request',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': repairPostData.length
                    }
                }, (repairRes) => {
                    let repairBody = '';
                    repairRes.on('data', c => repairBody += c);
                    repairRes.on('end', () => {
                        console.log('Repair response status:', repairRes.statusCode);

                        // Wait a moment for async fetch webhooks to execute fully
                        setTimeout(() => {
                            console.log('Received payloads count:', receivedPayloads.length);

                            const contactWebhook = receivedPayloads.find(p => p.type === 'contact');
                            const repairWebhook = receivedPayloads.find(p => p.type === 'repair_request');

                            let success = true;
                            let report = '';

                            if (contactWebhook && contactWebhook.name === 'Integration Test Boy') {
                                report += '✓ ContactWebhook success!\n';
                            } else {
                                report += '✗ ContactWebhook failed or invalid payload!\n';
                                success = false;
                            }

                            if (repairWebhook && repairWebhook.brand === 'Samsung' && repairWebhook.priority === 'Urgent') {
                                report += '✓ RepairWebhook success!\n';
                            } else {
                                report += '✗ RepairWebhook failed or invalid payload!\n';
                                success = false;
                            }

                            fs.writeFileSync('integration-test-results.txt', report + (success ? 'RESULT: SUCCESS' : 'RESULT: FAILURE'));
                            console.log(report);
                            console.log(success ? 'ALL TESTS PASSED!' : 'SOME TESTS FAILED!');

                            server.close();
                            process.exit(success ? 0 : 1);
                        }, 1500);
                    });
                });

                repairReq.on('error', (err) => {
                    console.error('Repair POST request error:', err.message);
                    server.close();
                    process.exit(1);
                });

                repairReq.write(repairPostData);
                repairReq.end();
            });
        });

        contactReq.on('error', (err) => {
            console.error('Contact POST request error:', err.message);
            server.close();
            process.exit(1);
        });

        contactReq.write(contactPostData);
        contactReq.end();

    } catch (err) {
        console.error('Integration test script encountered error:', err.message);
        if (server) server.close();
        process.exit(1);
    }
}

runTest();
