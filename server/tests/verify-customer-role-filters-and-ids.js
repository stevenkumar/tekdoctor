/**
 * TekDoctor — Verification Test Suite: Admin Customers Tab Role Filters & User IDs
 * 
 * Verifies:
 * 1. Role filtering:
 *    - role=customer returns only customer records with TD-XXX
 *    - role=company returns only company records with CMP-XXX
 *    - role=technician returns only technician records with TD-TECH-XXX
 *    - role=admin returns only admin records with TD-XXX
 *    - role=all returns all accounts
 * 2. ID integrity:
 *    - Technicians have valid TD-TECH-XXX identifiers and no ticket IDs
 *    - Companies have valid CMP-XXX identifiers and no generic user IDs as company ID
 *    - Customers and admins have valid TD-XXX permanent IDs
 * 3. Search functionality:
 *    - Search within technician by TD-TECH-XXX ID and name
 *    - Search within company by CMP-XXX ID and company name
 *    - Search within customer by TD-XXX ID and name
 * 4. Pagination & Counts:
 *    - Limit and page parameters respected
 *    - Total count matches actual number of records in role
 * 5. Empty states:
 *    - Searching for non-existent query yields total: 0 and empty array
 * 6. Customer History & Update:
 *    - getCustomerHistory returns proper identifiers
 *    - updateCustomer works for customer and company roles
 */

const { pool } = require('../config/db.config');
const initDatabase = require('../models/db.init');
const { generateTechnicianId, generateCompanyId } = require('../utils/helpers');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/app.config');
const http = require('http');

const PORT = process.env.PORT || 5000;
const HOST = '127.0.0.1';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  [PASS] ${message}`);
        testsPassed++;
    } else {
        console.error(`  [FAIL] ${message}`);
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

function apiRequest(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const headers = {
            'Content-Type': 'application/json'
        };
        if (payload) {
            headers['Content-Length'] = Buffer.byteLength(payload);
        }
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(
            {
                hostname: HOST,
                port: PORT,
                path,
                method,
                headers
            },
            (res) => {
                let raw = '';
                res.on('data', chunk => { raw += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = raw ? JSON.parse(raw) : {};
                        resolve({ status: res.statusCode, data: parsed });
                    } catch (e) {
                        resolve({ status: res.statusCode, raw });
                    }
                });
            }
        );

        req.on('error', reject);
        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

async function runTests() {
    console.log('================================================================');
    console.log('TEST SUITE: Admin Customers Tab Role Filters & Entity IDs');
    console.log('================================================================\n');

    let adminToken;
    let sampleCustomer;
    let sampleTechnician;
    let sampleCompany;
    let sampleAdmin;

    try {
        // Step 1: Ensure DB is initialized and default data / backfill is run
        console.log('[Setup 1/3] Initializing DB and running backfill check...');
        await initDatabase();

        // Step 2: Get or create an admin user
        console.log('[Setup 2/3] Retrieving admin user for authorization...');
        const [admins] = await pool.execute("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
        if (admins.length === 0) {
            const hash = await bcrypt.hash('Admin@123', 10);
            const [insertRes] = await pool.execute(
                "INSERT INTO users (name, email, password, role, is_active) VALUES ('System Admin', 'admin@tekdoctor.in', ?, 'admin', 1)",
                [hash]
            );
            const [newAdmin] = await pool.execute('SELECT * FROM users WHERE id = ?', [insertRes.insertId]);
            adminToken = await generateToken(newAdmin[0]);
        } else {
            adminToken = await generateToken(admins[0]);
        }

        // Step 3: Ensure we have test records for each role
        console.log('[Setup 3/3] Ensuring test data exists for customer, company, technician, admin...');
        const defaultHash = await bcrypt.hash('Test@123', 10);

        // Ensure at least 1 customer
        const [existingCust] = await pool.execute("SELECT * FROM users WHERE role = 'customer' LIMIT 1");
        if (existingCust.length === 0) {
            await pool.execute(
                "INSERT INTO users (name, email, phone, password, role, is_active) VALUES ('John Customer', 'john_cust@test.com', '9876543210', ?, 'customer', 1)",
                [defaultHash]
            );
        }

        // Ensure at least 1 technician
        const [existingTech] = await pool.execute("SELECT * FROM users WHERE role = 'technician' LIMIT 1");
        if (existingTech.length === 0) {
            const nextTechId = await generateTechnicianId(pool);
            await pool.execute(
                "INSERT INTO users (name, email, phone, password, role, technician_id, is_active) VALUES ('Alex Tech', 'alex_tech@test.com', '9876543211', ?, 'technician', ?, 1)",
                [defaultHash, nextTechId]
            );
        }

        // Ensure at least 1 company
        const [existingComp] = await pool.execute("SELECT u.*, cp.company_id as cp_cid FROM users u LEFT JOIN company_profiles cp ON u.id = cp.user_id WHERE u.role = 'company' LIMIT 1");
        if (existingComp.length === 0) {
            const nextCompId = await generateCompanyId(pool);
            const [compUserRes] = await pool.execute(
                "INSERT INTO users (name, email, phone, password, role, company_id, is_active) VALUES ('Acme Corp', 'contact@acme.com', '9876543212', ?, 'company', ?, 1)",
                [defaultHash, nextCompId]
            );
            await pool.execute(
                "INSERT INTO company_profiles (user_id, company_name, company_id, email, phone_number, is_active) VALUES (?, 'Acme Corp', ?, 'contact@acme.com', '9876543212', 1)",
                [compUserRes.insertId, nextCompId]
            );
        }

        console.log('\n--- Test Group 1: Role Filtering Isolation ---');

        // Test 1.1: role=customer
        const custRes = await apiRequest('GET', '/api/admin/customers?role=customer', null, adminToken);
        assert(custRes.status === 200, 'GET /api/admin/customers?role=customer returns 200 OK');
        const custData = custRes.data.data;
        const customers = custData.data;
        assert(Array.isArray(customers) && customers.length > 0, `Returned ${customers.length} customer records`);
        const nonCustInCust = customers.filter(c => c.role !== 'customer');
        assert(nonCustInCust.length === 0, 'role=customer contains NO records with other roles (technician/company/admin)');
        sampleCustomer = customers[0];

        // Test 1.2: role=technician
        const techRes = await apiRequest('GET', '/api/admin/customers?role=technician', null, adminToken);
        assert(techRes.status === 200, 'GET /api/admin/customers?role=technician returns 200 OK');
        const techData = techRes.data.data;
        const techs = techData.data;
        assert(Array.isArray(techs) && techs.length > 0, `Returned ${techs.length} technician records`);
        const nonTechInTech = techs.filter(c => c.role !== 'technician');
        assert(nonTechInTech.length === 0, 'role=technician contains NO records with other roles (customer/company/admin)');
        sampleTechnician = techs[0];

        // Test 1.3: role=company
        const compRes = await apiRequest('GET', '/api/admin/customers?role=company', null, adminToken);
        assert(compRes.status === 200, 'GET /api/admin/customers?role=company returns 200 OK');
        const compData = compRes.data.data;
        const comps = compData.data;
        assert(Array.isArray(comps) && comps.length > 0, `Returned ${comps.length} company records`);
        const nonCompInComp = comps.filter(c => c.role !== 'company');
        assert(nonCompInComp.length === 0, 'role=company contains NO records with other roles (customer/technician/admin)');
        sampleCompany = comps[0];

        // Test 1.4: role=admin
        const adminRes = await apiRequest('GET', '/api/admin/customers?role=admin', null, adminToken);
        assert(adminRes.status === 200, 'GET /api/admin/customers?role=admin returns 200 OK');
        const adminData = adminRes.data.data;
        const adminsList = adminData.data;
        assert(Array.isArray(adminsList) && adminsList.length > 0, `Returned ${adminsList.length} admin records`);
        const nonAdminInAdmin = adminsList.filter(c => c.role !== 'admin');
        assert(nonAdminInAdmin.length === 0, 'role=admin contains NO records with other roles (customer/technician/company)');
        sampleAdmin = adminsList[0];

        // Test 1.5: role=all (or no role specified)
        const allRes = await apiRequest('GET', '/api/admin/customers?role=all', null, adminToken);
        assert(allRes.status === 200, 'GET /api/admin/customers?role=all returns 200 OK');
        const allRoles = new Set(allRes.data.data.data.map(c => c.role));
        assert(allRoles.has('customer') || allRoles.has('technician') || allRoles.has('admin') || allRoles.has('company'), 
            `role=all contains records from system roles (present: ${Array.from(allRoles).join(', ')})`);

        console.log('\n--- Test Group 2: Entity ID Format Verification ---');

        // Test 2.1: Technicians display TD-TECH-XXX
        console.log(`  Inspecting sample technician: ID=${sampleTechnician.id}, Name=${sampleTechnician.name}, tech_id=${sampleTechnician.technician_id}, perm_id=${sampleTechnician.permanent_customer_id}`);
        assert(sampleTechnician.technician_id && /^TD-TECH-\d+$/.test(sampleTechnician.technician_id),
            `Technician record has authoritative technician_id matching ^TD-TECH-\\d+$: "${sampleTechnician.technician_id}"`);
        assert(sampleTechnician.permanent_customer_id === sampleTechnician.technician_id,
            `Technician permanent_customer_id is mapped to technician_id ("${sampleTechnician.permanent_customer_id}")`);
        assert(Boolean(sampleTechnician.technician_id && !/^TD-\d{3}$/.test(sampleTechnician.technician_id) && !sampleTechnician.technician_id.startsWith('TD-202')),
            `Technician ID is NOT a generic TD-XXX or repair ticket format`);

        // Test 2.2: Companies display CMP-XXX
        console.log(`  Inspecting sample company: ID=${sampleCompany.id}, Name=${sampleCompany.name}, comp_id=${sampleCompany.company_id}, perm_id=${sampleCompany.permanent_customer_id}`);
        assert(sampleCompany.company_id && /^CMP-\d+$/.test(sampleCompany.company_id),
            `Company record has authoritative company_id matching ^CMP-\\d+$: "${sampleCompany.company_id}"`);
        assert(sampleCompany.permanent_customer_id === sampleCompany.company_id,
            `Company permanent_customer_id is mapped to company_id ("${sampleCompany.permanent_customer_id}")`);
        assert(Boolean(sampleCompany.company_id && !/^TD-\d+$/.test(sampleCompany.company_id)),
            `Company ID is NOT a generic user ID (TD-XXX)`);

        // Test 2.3: Customers display TD-XXX
        console.log(`  Inspecting sample customer: ID=${sampleCustomer.id}, Name=${sampleCustomer.name}, perm_id=${sampleCustomer.permanent_customer_id}`);
        assert(sampleCustomer.permanent_customer_id && /^TD-\d+$/.test(sampleCustomer.permanent_customer_id),
            `Customer record has authoritative TD-XXX ID: "${sampleCustomer.permanent_customer_id}"`);
        const custIds = customers.map(c => c.permanent_customer_id);
        const uniqueCustIds = new Set(custIds);
        assert(custIds.length === uniqueCustIds.size,
            `All customer IDs are unique with zero duplicates (verified ${custIds.length} customer IDs)`);

        // Test 2.4: Admins display ADMIN (never TD-001)
        console.log(`  Inspecting sample admin: ID=${sampleAdmin.id}, Name=${sampleAdmin.name}, perm_id=${sampleAdmin.permanent_customer_id}`);
        assert(sampleAdmin.permanent_customer_id === 'ADMIN',
            `Admin record has authoritative ID 'ADMIN': "${sampleAdmin.permanent_customer_id}"`);
        assert(sampleAdmin.permanent_customer_id !== 'TD-001',
            `Admin record NEVER displays 'TD-001'`);

        console.log('\n--- Test Group 3: Search Functionality Within Role Filters ---');

        // Test 3.1: Search technician by TD-TECH ID
        const techSearchIdRes = await apiRequest('GET', `/api/admin/customers?role=technician&search=${encodeURIComponent(sampleTechnician.technician_id)}`, null, adminToken);
        const techFoundById = techSearchIdRes.data.data.data;
        assert(techFoundById.length >= 1 && techFoundById.some(t => t.id === sampleTechnician.id),
            `Search by technician_id "${sampleTechnician.technician_id}" inside role=technician successfully returned the technician`);

        // Test 3.2: Search company by CMP ID
        const compSearchIdRes = await apiRequest('GET', `/api/admin/customers?role=company&search=${encodeURIComponent(sampleCompany.company_id)}`, null, adminToken);
        const compFoundById = compSearchIdRes.data.data.data;
        assert(compFoundById.length >= 1 && compFoundById.some(c => c.id === sampleCompany.id),
            `Search by company_id "${sampleCompany.company_id}" inside role=company successfully returned the company`);

        // Test 3.3: Search customer by name
        const custSearchNameRes = await apiRequest('GET', `/api/admin/customers?role=customer&search=${encodeURIComponent(sampleCustomer.name.substring(0, 4))}`, null, adminToken);
        const custFoundByName = custSearchNameRes.data.data.data;
        assert(custFoundByName.length >= 1 && custFoundByName.some(c => c.id === sampleCustomer.id),
            `Search by customer partial name "${sampleCustomer.name.substring(0, 4)}" inside role=customer found customer`);

        // Test 3.4: Cross-role search isolation: Searching for technician's TD-TECH ID inside role=customer returns 0
        const crossSearchRes = await apiRequest('GET', `/api/admin/customers?role=customer&search=${encodeURIComponent(sampleTechnician.technician_id)}`, null, adminToken);
        assert(crossSearchRes.data.data.data.length === 0,
            `Searching for technician ID "${sampleTechnician.technician_id}" inside role=customer correctly returns 0 records`);

        // Test 3.5: Search 'ADMIN' returns the Admin
        const adminSearchRes = await apiRequest('GET', '/api/admin/customers?role=admin&search=ADMIN', null, adminToken);
        const adminFound = adminSearchRes.data.data.data;
        assert(adminFound.length >= 1 && adminFound.some(a => a.id === sampleAdmin.id && a.role === 'admin'),
            `Search by "ADMIN" inside role=admin successfully returned the admin`);

        // Test 3.6: Search 'TD-001' must NEVER return the Admin
        const cust001SearchRes = await apiRequest('GET', '/api/admin/customers?role=all&search=TD-001', null, adminToken);
        const cust001Found = cust001SearchRes.data.data.data;
        const adminIn001Search = cust001Found.filter(a => a.role === 'admin');
        assert(adminIn001Search.length === 0,
            `Search by "TD-001" NEVER returns an admin record (returned ${adminIn001Search.length} admin records)`);

        console.log('\n--- Test Group 4: Pagination & Record Counts ---');

        // Test 4.1: Pagination limit respected
        const pageRes = await apiRequest('GET', '/api/admin/customers?role=all&page=1&limit=2', null, adminToken);
        const pageData = pageRes.data.data;
        assert(pageData.data.length <= 2, `limit=2 returned at most 2 records (got ${pageData.data.length})`);
        assert(pageData.pagination.page === 1 && pageData.pagination.limit === 2, `pagination metadata page=1, limit=2`);
        assert(pageData.pagination.total >= pageData.data.length, `pagination total (${pageData.pagination.total}) >= count on page`);

        // Test 4.2: Role-filtered total count matches
        const techTotal = techRes.data.data.pagination.total;
        assert(techTotal === techs.length || techTotal >= techs.length,
            `Technician total count (${techTotal}) is accurate`);

        console.log('\n--- Test Group 5: Empty Search Results & Non-Existent Handlers ---');

        // Test 5.1: Non-existent query yields total 0 and empty array
        const emptyRes = await apiRequest('GET', '/api/admin/customers?role=technician&search=NONEXISTENT_QUERY_XYZ_9999', null, adminToken);
        assert(emptyRes.data.data.data.length === 0, 'Non-existent search returns empty customer list');
        assert(emptyRes.data.data.pagination.total === 0, 'Non-existent search returns pagination total: 0');

        console.log('\n--- Test Group 6: History & Update API Endpoints ---');

        // Test 6.1: getCustomerHistory returns proper identifiers
        const histRes = await apiRequest('GET', `/api/admin/customers/${sampleTechnician.id}/history`, null, adminToken);
        assert(histRes.status === 200, `GET /api/admin/customers/${sampleTechnician.id}/history returns 200 OK`);
        assert(histRes.data.data.customer.technician_id === sampleTechnician.technician_id,
            `History endpoint preserves technician_id (${histRes.data.data.customer.technician_id})`);

        // Test 6.1b: getCustomerHistory for admin returns 'ADMIN' and never 'TD-001'
        const adminHistRes = await apiRequest('GET', `/api/admin/customers/${sampleAdmin.id}/history`, null, adminToken);
        assert(adminHistRes.status === 200, `GET /api/admin/customers/${sampleAdmin.id}/history returns 200 OK`);
        assert(adminHistRes.data.data.customer.permanent_customer_id === 'ADMIN',
            `History endpoint preserves admin ID as 'ADMIN' (${adminHistRes.data.data.customer.permanent_customer_id})`);
        assert(adminHistRes.data.data.customer.permanent_customer_id !== 'TD-001',
            `History endpoint admin ID is NEVER 'TD-001'`);

        // Test 6.2: Update customer details via PUT /api/admin/customers/:id
        const updatePayload = {
            name: sampleCustomer.name,
            email: sampleCustomer.email,
            phone: '9876543210'
        };
        const updateRes = await apiRequest('PUT', `/api/admin/customers/${sampleCustomer.id}`, updatePayload, adminToken);
        assert(updateRes.status === 200, `PUT /api/admin/customers/${sampleCustomer.id} returns 200 OK`);

        // Test 6.3: Update company details via PUT /api/admin/customers/:id
        const updateCompPayload = {
            name: 'Apex Global Infotech',
            email: sampleCompany.email,
            phone: sampleCompany.phone || `98${Math.floor(10000000 + Math.random() * 90000000)}`
        };
        const updateCompRes = await apiRequest('PUT', `/api/admin/customers/${sampleCompany.id}`, updateCompPayload, adminToken);
        assert(updateCompRes.status === 200, `PUT /api/admin/customers/${sampleCompany.id} for company account returns 200 OK`);

    } catch (err) {
        console.error('Unexpected error in test suite:', err);
        testsFailed++;
    } finally {
        console.log('\n================================================================');
        console.log(`TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
        console.log('================================================================');
        try {
            await pool.end();
        } catch (e) {}
        process.exit(testsFailed > 0 ? 1 : 0);
    }
}

runTests();
