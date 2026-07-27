const jwt = require('jsonwebtoken');
const fs = require('fs');
const appConfig = require('../config/app.config');
const { pool } = require('../config/db.config');

const BASE_URL = 'http://localhost:5000/api';

const logLines = [];
function testLog(msg) {
    console.log(msg);
    logLines.push(msg);
}
function testLogError(msg) {
    console.error(msg);
    logLines.push(msg);
}

function generateTokenForTest(user) {
    return jwt.sign(
        {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        },
        appConfig.jwt.secret,
        { expiresIn: '1h' }
    );
}

async function runTests() {
    testLog('--- STARTING ROLE-BASED ACCESS & DATA ISOLATION VERIFICATION WITH SELF-SEEDING ---');
    let connection;
    const createdUserIds = [];
    let exitCode = 0;

    try {
        connection = await pool.getConnection();

        // 1. Check existing users
        const [existingUsers] = await connection.query(
            'SELECT id, name, email, role FROM users WHERE is_active = 1'
        );

        let admin = existingUsers.find(u => u.role === 'admin');
        let technician = existingUsers.find(u => u.role === 'technician');
        let company = existingUsers.find(u => u.role === 'company');
        let customer = existingUsers.find(u => u.role === 'customer');

        // Dynamic seeding for missing roles
        if (!admin) {
            testLog('Seeding temporary Admin user...');
            const [res] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Temp Admin', 'temp-admin-isolation-test@example.com', 'hashedpwd', 'admin', 1)"
            );
            admin = { id: res.insertId, name: 'Temp Admin', email: 'temp-admin-isolation-test@example.com', role: 'admin' };
            createdUserIds.push(res.insertId);
        }
        if (!technician) {
            testLog('Seeding temporary Technician user...');
            const [res] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Temp Tech', 'temp-tech-isolation-test@example.com', 'hashedpwd', 'technician', 1)"
            );
            technician = { id: res.insertId, name: 'Temp Tech', email: 'temp-tech-isolation-test@example.com', role: 'technician' };
            createdUserIds.push(res.insertId);
        }
        if (!company) {
            testLog('Seeding temporary Company user...');
            const [res] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Temp Company', 'temp-company-isolation-test@example.com', 'hashedpwd', 'company', 1)"
            );
            company = { id: res.insertId, name: 'Temp Company', email: 'temp-company-isolation-test@example.com', role: 'company' };
            createdUserIds.push(res.insertId);

            // Seed company profile
            await connection.query(
                "INSERT INTO company_profiles (user_id, company_name, contact_person, address) VALUES (?, 'Temp Company', 'Contact Person', 'Test Address')",
                [res.insertId]
            );
        }
        if (!customer) {
            testLog('Seeding temporary Customer user...');
            const [res] = await connection.query(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('Temp Customer', 'temp-customer-isolation-test@example.com', 'hashedpwd', 'customer', 1)"
            );
            customer = { id: res.insertId, name: 'Temp Customer', email: 'temp-customer-isolation-test@example.com', role: 'customer' };
            createdUserIds.push(res.insertId);
        }

        const adminToken = generateTokenForTest(admin);
        const techToken = generateTokenForTest(technician);
        const companyToken = generateTokenForTest(company);
        const customerToken = generateTokenForTest(customer);

        testLog(`Roles Loaded/Created — Admin: ${admin.email}, Tech: ${technician.email}, Company: ${company.email}, Customer: ${customer.email}`);

        // Helper to perform fetch requests
        const testRequest = async (path, token, expectedStatus) => {
            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            try {
                const res = await fetch(`${BASE_URL}${path}`, { headers });
                if (res.status === expectedStatus) {
                    testLog(`[PASS] GET ${path} with role: ${token ? jwt.decode(token).role : 'guest'} -> Expected: ${expectedStatus}, Got: ${res.status}`);
                    return true;
                } else {
                    testLogError(`[FAIL] GET ${path} with role: ${token ? jwt.decode(token).role : 'guest'} -> Expected: ${expectedStatus}, Got: ${res.status}`);
                    return false;
                }
            } catch (err) {
                testLogError(`[ERR] Request GET ${path} failed: ${err.message}`);
                return false;
            }
        };

        let success = true;

        // Test cases on company endpoints
        testLog('\n--- Evaluating Company Restricted Routes ---');
        success = await testRequest('/company/devices', companyToken, 200) && success;
        success = await testRequest('/company/activity-logs', companyToken, 200) && success;
        success = await testRequest('/company/branches', companyToken, 200) && success;
        success = await testRequest('/company/devices', adminToken, 403) && success;
        success = await testRequest('/company/devices', techToken, 403) && success;
        success = await testRequest('/company/devices', customerToken, 403) && success;
        success = await testRequest('/company/devices', null, 401) && success;

        // Test cases on corporate billing & quotations isolation
        testLog('\n--- Evaluating Corporate Billing & Quotations Restricted Routes ---');
        success = await testRequest('/billing/quotations', companyToken, 200) && success;
        success = await testRequest('/billing/quotations', adminToken, 200) && success;
        success = await testRequest('/billing/quotations', techToken, 200) && success;
        success = await testRequest('/billing/quotations', customerToken, 403) && success;
        success = await testRequest('/billing/quotations', null, 401) && success;

        // Test cases on admin endpoints
        testLog('\n--- Evaluating Admin Restricted Routes ---');
        success = await testRequest('/admin/dashboard-stats', adminToken, 200) && success;
        success = await testRequest('/admin/dashboard-stats', companyToken, 403) && success;
        success = await testRequest('/admin/dashboard-stats', techToken, 403) && success;
        success = await testRequest('/admin/dashboard-stats', customerToken, 403) && success;
        success = await testRequest('/admin/dashboard-stats', null, 401) && success;

        if (success) {
            testLog('\n🌟 ALL SECURITY ACCESS SYSTEM CHECKS COMPLETED SUCCESSFULLY! No leaks found.');
            exitCode = 0;
        } else {
            testLogError('\n🚨 ONE OR MORE SECURITY ROUTE TEST CASES FAILED! Check logic.');
            exitCode = 1;
        }

    } catch (error) {
        testLogError('Fatal error during integration run: ' + error.stack);
        exitCode = 1;
    } finally {
        // Cleanup seeded users
        if (createdUserIds.length > 0) {
            testLog('\n--- Cleaning Up Temporary Seeded Users ---');
            try {
                // Delete company profiles
                await connection.query(
                    'DELETE FROM company_profiles WHERE user_id IN (?)',
                    [createdUserIds]
                );
                // Delete user records
                await connection.query(
                    'DELETE FROM users WHERE id IN (?)',
                    [createdUserIds]
                );
                testLog(`Deleted ${createdUserIds.length} temporary user registrations.`);
            } catch (cleanupErr) {
                testLogError('Failed to clean up testing database tables: ' + cleanupErr.message);
            }
        }

        if (connection) connection.release();
        await pool.end();

        // Write UTF-8 log file
        fs.writeFileSync('test-output-utf8.log', logLines.join('\n'), 'utf8');

        process.exit(exitCode);
    }
}

runTests();
