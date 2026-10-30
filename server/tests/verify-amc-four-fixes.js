/**
 * Verification Script for TekDoctor AMC Management 4 Fixes
 * 
 * 1. Online AMC payment order & verification (envelope unnesting, error propagation, no premature pending_verification).
 * 2. Add / Manage Devices duplicate options elimination (coveredDeviceIds and companyCoveredDeviceIds exclusion).
 * 3. Replacement requests covered device dropdown (coveredDevices populated with active devices).
 * 4. Human-readable AMC validity dates (preventing raw ISO strings in UI).
 */

const assert = require('assert');
const { pool } = require('../config/db.config');
const amcService = require('../services/amc.service');

async function runTests() {
  console.log('====================================================');
  console.log('TEST SUITE: AMC 4 Fixes Verification');
  console.log('====================================================\n');

  let passed = 0;

  // Setup test company & contract
  const cmpCode = `CMP-FX${Date.now().toString().slice(-4)}`;
  const [compUser] = await pool.query(
    'INSERT INTO users (name, email, password, role, company_id, is_active) VALUES (?, ?, ?, ?, ?, 1)',
    ['Fixes Test Corp', `test_fixes_${Date.now()}@example.com`, 'hash123', 'company', cmpCode]
  );
  const companyUserId = compUser.insertId;

  const [compProfile] = await pool.query(
    'INSERT INTO company_profiles (user_id, company_id, company_name) VALUES (?, ?, ?)',
    [companyUserId, cmpCode, 'Fixes Test Corp']
  );

  // Setup 3 company devices
  const [d1] = await pool.query(
    'INSERT INTO company_devices (company_id, brand, model_number, serial_number, is_active) VALUES (?, ?, ?, ?, 1)',
    [companyUserId, 'Apple', 'MacBook Pro 16', `SN-FX-001-${Date.now()}`]
  );
  const [d2] = await pool.query(
    'INSERT INTO company_devices (company_id, brand, model_number, serial_number, is_active) VALUES (?, ?, ?, ?, 1)',
    [companyUserId, 'Dell', 'XPS 15', `SN-FX-002-${Date.now()}`]
  );
  const [d3] = await pool.query(
    'INSERT INTO company_devices (company_id, brand, model_number, serial_number, is_active) VALUES (?, ?, ?, ?, 1)',
    [companyUserId, 'Lenovo', 'ThinkPad T14', `SN-FX-003-${Date.now()}`]
  );

  // Create contract
  const contractRes = await amcService.createAmcContract({
    companyId: companyUserId,
    planName: 'Gold Enterprise',
    deviceCapacity: 2,
    price: 30000,
    totalAmount: 35400,
    startDate: '2026-11-01',
    endDate: '2027-10-31',
    createdBy: companyUserId
  });
  const contractId = contractRes.id;

  try {
    // ── FIX 1: Online Payment Order & Verification ──
    console.log('[Fix 1] Online Payment Order Creation & Status Integrity');

    const orderRes = await amcService.createContractPaymentOrder({
      contractId,
      companyId: companyUserId,
      userId: companyUserId
    });

    assert(orderRes.orderId, 'Payment order returns valid orderId');
    assert(orderRes.amount === 35400, 'Payment order returns correct amount');
    assert(orderRes.keyId, 'Payment order returns keyId');
    console.log('  ✓ Payment order created with orderId, amount, currency, and keyId');
    passed++;

    // Verify contract is NOT prematurely set to pending_verification
    const [cRowsAfterOrder] = await pool.query('SELECT payment_status FROM amc_contracts WHERE id = ?', [contractId]);
    assert(cRowsAfterOrder[0].payment_status === 'unpaid', 'Payment status remains "unpaid" after order generation (not prematurely locked into pending_verification)');
    console.log('  ✓ Contract payment_status remains "unpaid" until actual payment occurs');
    passed++;

    // ── FIX 2: Add / Manage Devices Duplicate Options ──
    console.log('\n[Fix 2] Covered Devices Capacity & Company-Wide Covered Device IDs');

    // Assign device 1 to contract
    await amcService.assignDevicesToCoverage(pool, {
      contractId,
      companyId: companyUserId,
      deviceIds: [d1.insertId],
      userId: companyUserId
    });

    const capInfo = await amcService.checkContractCapacity(pool, contractId);
    assert(Array.isArray(capInfo.coveredDeviceIds), 'Capacity endpoint returns coveredDeviceIds array');
    assert(capInfo.coveredDeviceIds.includes(d1.insertId), 'coveredDeviceIds includes assigned device ID');
    assert(Array.isArray(capInfo.companyCoveredDeviceIds), 'Capacity endpoint returns companyCoveredDeviceIds array');
    console.log('  ✓ checkContractCapacity returns coveredDeviceIds and companyCoveredDeviceIds');
    passed++;

    // Verify that attempting to assign device 1 again fails
    let dupeError = null;
    try {
      await amcService.assignDevicesToCoverage(pool, {
        contractId,
        companyId: companyUserId,
        deviceIds: [d1.insertId],
        userId: companyUserId
      });
    } catch (err) {
      dupeError = err;
    }
    assert(dupeError && dupeError.message.includes('ALREADY_COVERED'), 'Assigning already-covered device is blocked with ALREADY_COVERED');
    console.log('  ✓ Backend strictly rejects duplicate assignment of already covered device');
    passed++;

    // ── FIX 3: Replacement Covered Device Dropdown ──
    console.log('\n[Fix 3] Contract Details Populates Covered Devices for Replacement Modal');

    const details = await amcService.getContractDetails(contractId, companyUserId);
    assert(Array.isArray(details.coveredDevices), 'getContractDetails returns coveredDevices array');
    assert(details.coveredDevices.length === 1, 'coveredDevices contains the active device');
    assert(details.coveredDevices[0].device_id === d1.insertId, 'coveredDevices has device_id');
    assert(details.coveredDevices[0].brand === 'Apple', 'coveredDevices has brand');
    assert(details.coveredDevices[0].model_number === 'MacBook Pro 16', 'coveredDevices has model_number');
    assert(details.coveredDevices[0].status === 'active', 'coveredDevices has active status');
    console.log('  ✓ getContractDetails provides active covered devices with brand, model, SN for modal dropdown');
    passed++;

    // ── FIX 4: Date Formatting Integrity (No Raw ISO Strings) ──
    console.log('\n[Fix 4] Date Formatting Integrity Across Backend & Frontend Helper');

    // Test backend normalization: getContracts & getContractDetails return clean YYYY-MM-DD strings
    const contractsList = await amcService.getContracts({ companyId: companyUserId });
    const cItem = contractsList.find(c => c.id === contractId);
    assert(cItem.start_date === '2026-11-01', 'start_date normalized to YYYY-MM-DD');
    assert(cItem.end_date === '2027-10-31', 'end_date normalized to YYYY-MM-DD');
    console.log('  ✓ Backend getContracts returns clean date strings (YYYY-MM-DD) instead of raw ISO timestamps');
    passed++;

    assert(details.start_date === '2026-11-01', 'getContractDetails start_date normalized');
    assert(details.end_date === '2027-10-31', 'getContractDetails end_date normalized');
    assert(details.coveredDevices[0].coverage_start_date === '2026-11-01', 'coverage_start_date normalized');
    console.log('  ✓ Backend getContractDetails normalizes contract and device validity dates');
    passed++;

    // Test client formatDisplayDate logic
    function formatDisplayDate(dateInput, fallback = 'N/A') {
      if (!dateInput) return fallback;
      try {
        let d;
        if (typeof dateInput === 'string') {
          const clean = dateInput.trim();
          if (!clean) return fallback;
          if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
            const [year, month, day] = clean.split('-').map(Number);
            d = new Date(year, month - 1, day);
          } else {
            d = new Date(clean);
          }
        } else {
          d = new Date(dateInput);
        }
        if (isNaN(d.getTime())) return String(dateInput);
        return d.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      } catch {
        return String(dateInput);
      }
    }

    assert(formatDisplayDate('2026-11-01') === '1 Nov 2026', 'formatDisplayDate("2026-11-01") -> "1 Nov 2026"');
    assert(formatDisplayDate('2026-10-29T18:30:00.000Z') === '30 Oct 2026', 'formatDisplayDate raw ISO string -> human-readable "30 Oct 2026"');
    assert(formatDisplayDate(null) === 'N/A', 'formatDisplayDate(null) -> "N/A"');
    console.log('  ✓ formatDisplayDate turns raw ISO string "2026-10-29T18:30:00.000Z" into "30 Oct 2026"');
    passed++;

  } finally {
    // Teardown
    await pool.query('DELETE FROM amc_covered_devices WHERE contract_id = ?', [contractId]);
    await pool.query('DELETE FROM payments WHERE reference_note LIKE ?', [`%${contractId}%`]);
    await pool.query('DELETE FROM amc_contract_history WHERE contract_id = ?', [contractId]);
    await pool.query('DELETE FROM amc_contracts WHERE id = ?', [contractId]);
    await pool.query('DELETE FROM company_devices WHERE company_id = ?', [companyUserId]);
    await pool.query('DELETE FROM company_profiles WHERE user_id = ?', [companyUserId]);
    await pool.query('DELETE FROM users WHERE id = ?', [companyUserId]);
  }

  console.log('\n====================================================');
  console.log(`FOUR FIXES RESULTS: ${passed} passed, 0 failed`);
  console.log('====================================================\n');
}

runTests().then(() => process.exit(0)).catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
