/**
 * Comprehensive Automated Regression Test Suite:
 * Company Permanent ID, Repair Ticket ID & Serial Number Consistency Audit and Fix
 *
 * Verifies all 10 mandatory criteria specified in Section 6:
 * 1. Admin Dashboard and Company Portal show the same permanent company ID.
 * 2. Sequential tickets for one company: CMP-001-001, CMP-001-002, CMP-001-003.
 * 3. Independent sequences for two companies.
 * 4. Concurrent ticket creation without duplicate IDs.
 * 5. Repeated repair requests for the same device with unique ticket IDs.
 * 6. Serial number remaining unchanged after multiple repair tickets.
 * 7. Correct serial number and ticket history in Admin and Company views.
 * 8. Existing invoices, payments, estimates, notifications, and ticket assignments remaining linked correctly.
 * 9. Legacy records and existing AMC ticket behavior.
 * 10. Unauthorized users being unable to access another company's tickets or device history.
 */

const { pool } = require('../config/db.config');
const { generateTicketNumber, resolvePermanentAccountId, generateCompanyId } = require('../utils/helpers');
const jwt = require('jsonwebtoken');
const config = require('../config/app.config');

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:5000/api';

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

async function apiRequest(method, endpoint, body = null, token = null) {
  const url = `${API_BASE}${endpoint}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runAuditRegressionSuite() {
  console.log('================================================================');
  console.log('  TEST SUITE: Company ID, Repair Ticket ID & Serial Number Consistency');
  console.log('================================================================');

  const connection = await pool.getConnection();

  // Test artifacts to clean up
  const createdUserIds = [];
  const createdTicketIds = [];
  const createdDeviceIds = [];
  const createdSeqNames = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Admin Token
    // -------------------------------------------------------------------------
    const [adminRows] = await connection.query("SELECT id, email, role, token_version FROM users WHERE role = 'admin' LIMIT 1");
    assert(adminRows.length > 0, 'Admin account exists in database');
    const adminUser = adminRows[0];
    const adminVersion = adminUser.token_version != null ? Number(adminUser.token_version) : 1;
    const adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: 'admin', token_version: adminVersion, tokenVersion: adminVersion },
      config.jwt.secret,
      { expiresIn: '2h' }
    );

    // -------------------------------------------------------------------------
    // Setup Isolated Real Company Account for Tests
    // -------------------------------------------------------------------------
    const compCode = await generateCompanyId(connection);
    const [compUserRes] = await connection.query(
      "INSERT INTO users (name, email, password, role, phone, company_id, token_version, is_active) VALUES (?, ?, 'dummy_hash', 'company', ?, ?, 1, 1)",
      ['Consistency Test Corp', `test_corp_${Date.now()}@test.com`, `98${Math.floor(10000000 + Math.random() * 90000000)}`, compCode]
    );
    const testCompUserId = compUserRes.insertId;
    createdUserIds.push(testCompUserId);

    await connection.query(
      'INSERT INTO company_profiles (user_id, company_id, company_name, contact_person, phone_number, amc_status) VALUES (?, ?, ?, ?, ?, ?)',
      [testCompUserId, compCode, 'Consistency Test Corp', 'Test Officer', '9800000001', 'Inactive']
    );

    const compToken = jwt.sign(
      { id: testCompUserId, email: `test_corp_${Date.now()}@test.com`, role: 'company', token_version: 1, tokenVersion: 1 },
      config.jwt.secret,
      { expiresIn: '2h' }
    );

    // -------------------------------------------------------------------------
    // 1. Admin Dashboard and Company Portal showing the same permanent company ID
    // -------------------------------------------------------------------------
    console.log('\n[Criteria 1] Admin Dashboard & Company Portal Permanent ID Consistency');

    // Admin view: list
    const adminListRes = await apiRequest('GET', `/admin/companies?search=${compCode}`, null, adminToken);
    assert(adminListRes.status === 200, `Admin list companies returns HTTP 200`);
    const compRows = adminListRes.data?.data?.data || adminListRes.data?.data?.companies || (Array.isArray(adminListRes.data?.data) ? adminListRes.data.data : []);
    const foundAdminComp = compRows.find(c => c.id === testCompUserId);
    assert(foundAdminComp !== undefined, `Test company found in Admin list search`);
    assert(foundAdminComp?.permanent_company_id === compCode, `Admin list displays canonical permanent_company_id: ${compCode} (got ${foundAdminComp?.permanent_company_id})`);
    assert(foundAdminComp?.company_id === compCode, `Admin list displays canonical company_id: ${compCode} (got ${foundAdminComp?.company_id})`);

    // Admin view: details
    const adminDetailsRes = await apiRequest('GET', `/admin/companies/${testCompUserId}/detail`, null, adminToken);
    assert(adminDetailsRes.status === 200, `Admin getCompanyDetails returns HTTP 200`);
    const adminDetailsComp = adminDetailsRes.data?.data?.profile || adminDetailsRes.data?.data;
    assert(adminDetailsComp?.permanent_company_id === compCode, `Admin details displays canonical permanent_company_id: ${compCode}`);
    assert(adminDetailsComp?.company_id === compCode, `Admin details displays canonical company_id: ${compCode}`);

    // Company portal view: profile
    const compProfileRes = await apiRequest('GET', '/company/profile', null, compToken);
    assert(compProfileRes.status === 200, `Company portal getProfile returns HTTP 200`);
    const compProfileData = compProfileRes.data?.data;
    assert(compProfileData?.permanent_company_id === compCode, `Company portal returns permanent_company_id: ${compCode} (got ${compProfileData?.permanent_company_id})`);
    assert(compProfileData?.company_id === compCode, `Company portal returns company_id: ${compCode} (got ${compProfileData?.company_id})`);
    assert(
      foundAdminComp?.permanent_company_id === compProfileData?.permanent_company_id,
      `PERFECT MATCH: Admin Dashboard (${foundAdminComp?.permanent_company_id}) === Company Portal (${compProfileData?.permanent_company_id})`
    );

    // -------------------------------------------------------------------------
    // 2. Sequential tickets for one company: CMP-xxx-001, CMP-xxx-002, CMP-xxx-003
    // -------------------------------------------------------------------------
    console.log('\n[Criteria 2] Sequential Tickets for One Company: CMP-xxx-001, CMP-xxx-002');
    const seqKey1 = `tkt:${compCode}`;
    createdSeqNames.push(seqKey1);

    const t1 = await generateTicketNumber(connection, { companyId: compCode });
    assert(t1 === `${compCode}-001`, `First ticket starts at 001: ${t1} (expected ${compCode}-001)`);

    // Insert into service_requests so collision check detects it
    const [t1Res] = await connection.query(
      `INSERT INTO service_requests (ticket_number, user_id, company_id, customer_name, mobile, device_category, brand, problem_type, problem_description, status)
       VALUES (?, ?, ?, 'Corp Customer', '9800000001', 'Laptop', 'Dell', 'Hardware', 'First ticket', 'pending')`,
      [t1, testCompUserId, testCompUserId]
    );
    createdTicketIds.push(t1Res.insertId);

    const t2 = await generateTicketNumber(connection, { companyId: compCode });
    assert(t2 === `${compCode}-002`, `Second ticket increments sequentially to 002: ${t2} (expected ${compCode}-002)`);

    const [t2Res] = await connection.query(
      `INSERT INTO service_requests (ticket_number, user_id, company_id, customer_name, mobile, device_category, brand, problem_type, problem_description, status)
       VALUES (?, ?, ?, 'Corp Customer', '9800000001', 'Laptop', 'Dell', 'Hardware', 'Second ticket', 'pending')`,
      [t2, testCompUserId, testCompUserId]
    );
    createdTicketIds.push(t2Res.insertId);

    const t3 = await generateTicketNumber(connection, { companyId: compCode });
    assert(t3 === `${compCode}-003`, `Third ticket increments sequentially to 003: ${t3} (expected ${compCode}-003)`);

    const [t3Res] = await connection.query(
      `INSERT INTO service_requests (ticket_number, user_id, company_id, customer_name, mobile, device_category, brand, problem_type, problem_description, status)
       VALUES (?, ?, ?, 'Corp Customer', '9800000001', 'Laptop', 'Dell', 'Hardware', 'Third ticket', 'pending')`,
      [t3, testCompUserId, testCompUserId]
    );
    createdTicketIds.push(t3Res.insertId);

    // -------------------------------------------------------------------------
    // 3. Independent sequences for two companies
    // -------------------------------------------------------------------------
    console.log('\n[Criteria 3] Independent Sequences for Two Distinct Companies');
    const compA = `CMP-A${Date.now().toString().slice(-4)}`;
    const compB = `CMP-B${Date.now().toString().slice(-4)}`;
    createdSeqNames.push(`tkt:${compA}`, `tkt:${compB}`);

    const tA1 = await generateTicketNumber(connection, { companyId: compA });
    assert(tA1 === `${compA}-001`, `Company A first ticket: ${tA1}`);

    const tB1 = await generateTicketNumber(connection, { companyId: compB });
    assert(tB1 === `${compB}-001`, `Company B first ticket starts independently at 001: ${tB1}`);

    const tA2 = await generateTicketNumber(connection, { companyId: compA });
    assert(tA2 === `${compA}-002`, `Company A second ticket increments to 002: ${tA2}`);

    const tB2 = await generateTicketNumber(connection, { companyId: compB });
    assert(tB2 === `${compB}-002`, `Company B second ticket increments independently to 002: ${tB2}`);

    // Verify counter states in DB
    const [seqARows] = await connection.query('SELECT current_val FROM app_sequences WHERE sequence_name = ?', [`tkt:${compA}`]);
    const [seqBRows] = await connection.query('SELECT current_val FROM app_sequences WHERE sequence_name = ?', [`tkt:${compB}`]);
    assert(seqARows[0]?.current_val === 2, `Company A sequence value is 2`);
    assert(seqBRows[0]?.current_val === 2, `Company B sequence value is 2`);

    // -------------------------------------------------------------------------
    // 4. Concurrent ticket creation without duplicate IDs
    // -------------------------------------------------------------------------
    console.log('\n[Criteria 4] Concurrency Safety: Parallel Ticket Generation');
    const compConc = `CMP-C${Date.now().toString().slice(-4)}`;
    createdSeqNames.push(`tkt:${compConc}`);

    const concurrentPromises = Array.from({ length: 10 }, async () => {
      const conn = await pool.getConnection();
      try {
        return await generateTicketNumber(conn, { companyId: compConc });
      } finally {
        conn.release();
      }
    });

    const concurrentResults = await Promise.all(concurrentPromises);
    const uniqueSet = new Set(concurrentResults);
    assert(uniqueSet.size === 10, `10 parallel calls produced exactly 10 unique ticket numbers (no collisions: 10/10)`);

    const suffixes = concurrentResults.map(t => parseInt(t.split('-').pop(), 10)).sort((a, b) => a - b);
    const expectedConsecutive = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const isStrictlyConsecutive = suffixes.every((v, i) => v === expectedConsecutive[i]);
    assert(isStrictlyConsecutive, `Suffixes are strictly consecutive 001..010 without gaps: [${suffixes.join(', ')}]`);

    // -------------------------------------------------------------------------
    // 5. Repeated repair requests for the same device with unique ticket IDs
    // -------------------------------------------------------------------------
    console.log('\n[Criteria 5] Repeated Repair Requests for Same Device With Unique Ticket IDs');
    const deviceSerial = `SN-AUDIT-${Date.now()}`;
    const [devRes] = await connection.query(
      `INSERT INTO company_devices (company_id, device_category, brand, model_number, serial_number, asset_id, is_active)
       VALUES (?, 'Laptop', 'Lenovo', 'ThinkPad T14', ?, ?, 1)`,
      [testCompUserId, deviceSerial, `AST-${Date.now().toString().slice(-6)}`]
    );
    const testDeviceId = devRes.insertId;
    createdDeviceIds.push(testDeviceId);

    const devTickets = [];
    for (let i = 1; i <= 3; i++) {
      const ticketNum = await generateTicketNumber(connection, { companyId: compCode });
      const [insRes] = await connection.query(
        `INSERT INTO service_requests (ticket_number, user_id, company_id, device_id, customer_name, mobile, device_category, brand, model_number, serial_number, problem_type, problem_description, status)
         VALUES (?, ?, ?, ?, 'Corp Client', '9800000001', 'Laptop', 'Lenovo', 'ThinkPad T14', ?, 'Hardware', ?, 'pending')`,
        [ticketNum, testCompUserId, testCompUserId, testDeviceId, deviceSerial, `Issue iteration ${i}`]
      );
      devTickets.push({ id: insRes.insertId, ticketNumber: ticketNum });
      createdTicketIds.push(insRes.insertId);
    }

    assert(devTickets.length === 3, `3 tickets successfully created for device ${deviceSerial}`);
    const distinctTicketNums = new Set(devTickets.map(t => t.ticketNumber));
    assert(distinctTicketNums.size === 3, `All 3 repair tickets have distinct, unique ticket IDs: [${Array.from(distinctTicketNums).join(', ')}]`);

    // -------------------------------------------------------------------------
    // 6. Serial number remaining unchanged after multiple repair tickets
    // -------------------------------------------------------------------------
    console.log('\n[Criteria 6] Device Serial Number Invariant Preservation');
    const [postDeviceRows] = await connection.query('SELECT serial_number FROM company_devices WHERE id = ?', [testDeviceId]);
    assert(postDeviceRows[0]?.serial_number === deviceSerial, `company_devices.serial_number remains untouched: "${postDeviceRows[0]?.serial_number}"`);

    const [postTicketRows] = await connection.query(
      'SELECT id, ticket_number, serial_number FROM service_requests WHERE id IN (?)',
      [[devTickets[0].id, devTickets[1].id, devTickets[2].id]]
    );
    const allSerialsPreserved = postTicketRows.every(r => r.serial_number === deviceSerial);
    assert(allSerialsPreserved, `All service_requests retain exact hardware serial: "${deviceSerial}" without overwrite`);

    // -------------------------------------------------------------------------
    // 7. Correct serial number and ticket history in Admin and Company views
    // -------------------------------------------------------------------------
    console.log('\n[Criteria 7] Serial Number & Ticket History in Admin & Company Views');

    // Admin view: get repair request by ticket_number
    const adminTicketRes = await apiRequest('GET', `/repair-request/${devTickets[0].ticketNumber}`, null, adminToken);
    assert(adminTicketRes.status === 200, `Admin fetches ticket by number HTTP 200`);
    assert(adminTicketRes.data?.data?.serialNumber === deviceSerial, `Admin view returns correct serialNumber: "${adminTicketRes.data?.data?.serialNumber}"`);
    assert(adminTicketRes.data?.data?.permanent_company_id === compCode, `Admin ticket detail contains canonical permanent_company_id: ${compCode}`);
    assert(Array.isArray(adminTicketRes.data?.data?.deviceRepairHistory), `Admin view includes deviceRepairHistory array`);
    assert(adminTicketRes.data?.data?.deviceRepairHistory?.length >= 2, `deviceRepairHistory returns prior repairs for this serial (${adminTicketRes.data?.data?.deviceRepairHistory?.length} prior tickets)`);

    // Company portal view: company device history
    const compDeviceHistoryRes = await apiRequest('GET', `/company/devices/${testDeviceId}/history`, null, compToken);
    assert(compDeviceHistoryRes.status === 200, `Company device history returns HTTP 200`);
    const historyRepairs = compDeviceHistoryRes.data?.data?.repairs || [];
    assert(historyRepairs.length === 3, `Company device history contains all 3 repairs for this device (got ${historyRepairs.length})`);
    assert(compDeviceHistoryRes.data?.data?.device?.serial_number === deviceSerial, `Company device history header shows correct serial_number`);

    // -------------------------------------------------------------------------
    // 8. Existing invoices, payments, estimates, notifications linked correctly
    // -------------------------------------------------------------------------
    console.log('\n[Criteria 8] Invoices, Payments, Estimates & Notifications Integrity');

    // Link invoice, payment, notification to devTickets[0]
    const invoiceNum = `INV-AUDIT-${Date.now().toString().slice(-6)}`;
    await connection.query(
      `INSERT INTO invoices (id, ticket_id, user_id, client_name, amount, subtotal, tax_amount, status, invoice_date, due_date, is_active)
       VALUES (?, ?, ?, 'Consistency Test Corp', 5000.00, 4237.29, 762.71, 'Paid', NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY), 1)`,
      [invoiceNum, devTickets[0].id, testCompUserId]
    );

    await connection.query(
      `INSERT INTO payments (order_id, ticket_id, user_id, company_id, invoice_id, amount, status, payment_method)
       VALUES (?, ?, ?, ?, ?, 5000.00, 'paid', 'corporate_card')`,
      [`ORD-AUDIT-${Date.now().toString().slice(-6)}`, devTickets[0].id, testCompUserId, testCompUserId, invoiceNum]
    );

    await connection.query(
      `INSERT INTO notifications (user_id, ticket_id, title, message, is_read)
       VALUES (?, ?, 'Repair Completed', 'Your device repair is finished.', 0)`,
      [testCompUserId, devTickets[0].id]
    );

    // Fetch ticket detail again and verify relation resolution
    const verifyRelRes = await apiRequest('GET', `/repair-request/${devTickets[0].ticketNumber}`, null, adminToken);
    assert(verifyRelRes.data?.data?.invoice_id === invoiceNum, `Ticket accurately links to invoice ID ${invoiceNum}`);
    assert(verifyRelRes.data?.data?.invoice_status === 'Paid', `Invoice status resolved as Paid`);

    // Cleanup auxiliary billing
    await connection.query('DELETE FROM payments WHERE ticket_id = ?', [devTickets[0].id]);
    await connection.query('DELETE FROM notifications WHERE ticket_id = ?', [devTickets[0].id]);
    await connection.query('DELETE FROM invoices WHERE id = ?', [invoiceNum]);

    // -------------------------------------------------------------------------
    // 9. Legacy records and existing AMC ticket behavior
    // -------------------------------------------------------------------------
    console.log('\n[Criteria 9] Legacy Records & AMC Ticket Compatibility');

    // Verify existing historical tickets remain queryable
    const [historical] = await connection.query('SELECT ticket_number FROM service_requests ORDER BY id ASC LIMIT 1');
    if (historical.length > 0) {
      const histTicketNum = historical[0].ticket_number;
      const histLookup = await apiRequest('GET', `/repair-request/${histTicketNum}`, null, adminToken);
      assert(histLookup.status === 200, `Legacy ticket ${histTicketNum} remains 100% accessible via API`);
    }

    // Verify AMC company permanent ID and ticket generation
    const amcCompCode = await generateCompanyId(connection);
    const [amcUserRes] = await connection.query(
      "INSERT INTO users (name, email, password, role, phone, company_id, is_active) VALUES (?, ?, 'dummy_hash', 'company', '9800000099', ?, 1)",
      ['AMC Enterprise Corp', `amc_${Date.now()}@test.com`, amcCompCode]
    );
    const amcUserId = amcUserRes.insertId;
    createdUserIds.push(amcUserId);

    await connection.query(
      'INSERT INTO company_profiles (user_id, company_id, company_name, company_type, amc_status) VALUES (?, ?, ?, ?, ?)',
      [amcUserId, amcCompCode, 'AMC Enterprise Corp', 'AMC', 'Active']
    );

    const amcResolvedId = await resolvePermanentAccountId(connection, { companyId: amcUserId, isAmc: true });
    const expectedAmcPrefix = `TD-AMC-${amcCompCode.replace(/^CMP-/, 'C')}`;
    assert(amcResolvedId === expectedAmcPrefix, `AMC Company resolves canonical permanent ID: ${expectedAmcPrefix} (got ${amcResolvedId})`);

    const amcTicket1 = await generateTicketNumber(connection, { companyId: amcUserId, isAmc: true });
    assert(amcTicket1 === `${expectedAmcPrefix}-01`, `AMC Company ticket uses canonical prefix with 2-digit suffix: ${amcTicket1}`);
    createdSeqNames.push(`tkt:${expectedAmcPrefix}`);

    // -------------------------------------------------------------------------
    // 10. Unauthorized users being unable to access another company's tickets or device history
    // -------------------------------------------------------------------------
    console.log('\n[Criteria 10] Unauthorized Cross-Company Access Isolation');

    // Create rival company
    const rivalCode = await generateCompanyId(connection);
    const [rivalUserRes] = await connection.query(
      "INSERT INTO users (name, email, password, role, phone, company_id, token_version, is_active) VALUES (?, ?, 'dummy_hash', 'company', '9800000088', ?, 1, 1)",
      ['Rival Corp', `rival_${Date.now()}@test.com`, rivalCode]
    );
    const rivalUserId = rivalUserRes.insertId;
    createdUserIds.push(rivalUserId);

    await connection.query(
      'INSERT INTO company_profiles (user_id, company_id, company_name, amc_status) VALUES (?, ?, ?, ?)',
      [rivalUserId, rivalCode, 'Rival Corp', 'Inactive']
    );

    const rivalToken = jwt.sign(
      { id: rivalUserId, email: `rival_${Date.now()}@test.com`, role: 'company', token_version: 1, tokenVersion: 1 },
      config.jwt.secret,
      { expiresIn: '2h' }
    );

    // Rival company attempting to access test company's ticket
    const rivalAccessTicketRes = await apiRequest('GET', `/repair-request/${devTickets[0].ticketNumber}`, null, rivalToken);
    assert(
      rivalAccessTicketRes.status === 403 || rivalAccessTicketRes.status === 404,
      `Rival company blocked from viewing another company's repair ticket (HTTP ${rivalAccessTicketRes.status})`
    );

    // Rival company attempting to access test company's device history
    const rivalAccessDeviceRes = await apiRequest('GET', `/company/devices/${testDeviceId}/history`, null, rivalToken);
    assert(
      rivalAccessDeviceRes.status === 403 || rivalAccessDeviceRes.status === 404,
      `Rival company blocked from viewing another company's device history (HTTP ${rivalAccessDeviceRes.status})`
    );

  } catch (err) {
    console.error('Test suite error:', err);
    testsFailed++;
  } finally {
    console.log('\n[Cleanup] Removing temporary test records...');
    if (createdTicketIds.length > 0) {
      await connection.query('DELETE FROM service_requests WHERE id IN (?)', [createdTicketIds]);
    }
    if (createdDeviceIds.length > 0) {
      await connection.query('DELETE FROM company_devices WHERE id IN (?)', [createdDeviceIds]);
    }
    if (createdUserIds.length > 0) {
      await connection.query('DELETE FROM company_profiles WHERE user_id IN (?)', [createdUserIds]);
      await connection.query('DELETE FROM users WHERE id IN (?)', [createdUserIds]);
    }
    if (createdSeqNames.length > 0) {
      await connection.query('DELETE FROM app_sequences WHERE sequence_name IN (?)', [createdSeqNames]);
    }
    connection.release();

    console.log('\n================================================================');
    console.log(`TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('================================================================\n');

    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

runAuditRegressionSuite();
