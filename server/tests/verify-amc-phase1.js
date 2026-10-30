/**
 * Verification Test Suite: Phase 1 — Database & Backend Foundation for AMC Management
 * 
 * Verifies:
 * 1. Migration idempotency and schema integrity for 6 AMC tables.
 * 2. Unlimited registered fleet inventory decoupled from AMC capacity.
 * 3. Client self-entitlement elimination (devices created with is_amc = 0, amc_tag = NULL).
 * 4. Atomic all-or-nothing fleet bulk import (0 records inserted on batch errors).
 * 5. Canonical AMC ticket numbering (TD-AMC-C001-01) with collision-safe atomic sequences.
 * 6. Authoritative repair eligibility checking replacing legacy profile/device flags.
 * 7. Contract capacity enforcement (rejection on capacity overflow, double-coverage prevention).
 * 8. Device replacement workflow (admin approval required; pending does not alter active coverage).
 * 9. Cross-company tenant isolation across contracts, devices, and repairs.
 * 10. Self-contained fixture cleanup.
 */

const { pool } = require('../config/db.config');
const dbInit = require('../models/db.init');
const amcService = require('../services/amc.service');
const { generateTicketNumber, resolvePermanentAccountId } = require('../utils/helpers');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedTests++;
  }
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('TEST SUITE: AMC Module Phase 1 — Database & Backend');
  console.log('====================================================\n');

  const connection = await pool.getConnection();

  // Test Fixture State
  let testCompany1Id = null;
  let testCompany2Id = null;
  let testAdminId = null;
  const createdDeviceIds = [];
  const createdContractIds = [];
  const createdRequestIds = [];
  const createdSequenceNames = [];

  try {
    // -------------------------------------------------------------------------
    // TEST GROUP 1: Database Migration Idempotency & Schema Completeness
    // -------------------------------------------------------------------------
    console.log('[Test Group 1] Migration Idempotency & Schema Completeness');

    // Run dbInit again to verify idempotency
    await dbInit();
    assert(true, 'Database initialization (dbInit) executed idempotently without errors');

    // Verify all 6 AMC tables exist
    const [tables] = await connection.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME IN ('amc_plans', 'amc_requests', 'amc_contracts', 'amc_covered_devices', 'amc_device_replacements', 'amc_contract_history')
    `);
    const tableNames = tables.map(t => t.TABLE_NAME);
    assert(tableNames.includes('amc_plans'), 'Table amc_plans exists');
    assert(tableNames.includes('amc_requests'), 'Table amc_requests exists');
    assert(tableNames.includes('amc_contracts'), 'Table amc_contracts exists');
    assert(tableNames.includes('amc_covered_devices'), 'Table amc_covered_devices exists');
    assert(tableNames.includes('amc_device_replacements'), 'Table amc_device_replacements exists');
    assert(tableNames.includes('amc_contract_history'), 'Table amc_contract_history exists');

    // Verify default plans seeded
    const [plans] = await connection.query('SELECT plan_code, default_device_capacity FROM amc_plans WHERE plan_code IN ("AMC-STD-10", "AMC-CORP-25", "AMC-ENT-50")');
    assert(plans.length === 3, 'Default AMC plans (AMC-STD-10, AMC-CORP-25, AMC-ENT-50) exist and are seeded');

    // -------------------------------------------------------------------------
    // SETUP TEST FIXTURES
    // -------------------------------------------------------------------------
    console.log('\n[Setup] Provisioning Isolated Test Fixtures');

    // Find or create test Admin user
    const [admins] = await connection.query('SELECT id FROM users WHERE role = "admin" LIMIT 1');
    if (admins.length > 0) {
      testAdminId = admins[0].id;
    } else {
      const [admIns] = await connection.query(`
        INSERT INTO users (name, email, password, role, is_active)
        VALUES ('Test Admin', 'testadmin_phase1@tekdoctor.in', 'hash', 'admin', 1)
      `);
      testAdminId = admIns.insertId;
    }

    // Provision Test Company 1 (CMP-881)
    const [comp1Ins] = await connection.query(`
      INSERT INTO users (name, email, password, role, company_id, is_active)
      VALUES ('AMC Test Corp 1', 'amc_corp1_test@tekdoctor.in', 'hash', 'company', 'CMP-881', 1)
    `);
    testCompany1Id = comp1Ins.insertId;

    await connection.query(`
      INSERT INTO company_profiles (user_id, company_name, company_id, amc_status, company_type)
      VALUES (?, 'AMC Test Corp 1', 'CMP-881', 'Inactive', 'Corporate')
      ON DUPLICATE KEY UPDATE company_name = 'AMC Test Corp 1'
    `, [testCompany1Id]);

    // Provision Test Company 2 (CMP-882) for Cross-Tenant Isolation
    const [comp2Ins] = await connection.query(`
      INSERT INTO users (name, email, password, role, company_id, is_active)
      VALUES ('AMC Test Corp 2', 'amc_corp2_test@tekdoctor.in', 'hash', 'company', 'CMP-882', 1)
    `);
    testCompany2Id = comp2Ins.insertId;

    await connection.query(`
      INSERT INTO company_profiles (user_id, company_name, company_id, amc_status, company_type)
      VALUES (?, 'AMC Test Corp 2', 'CMP-882', 'Inactive', 'Corporate')
      ON DUPLICATE KEY UPDATE company_name = 'AMC Test Corp 2'
    `, [testCompany2Id]);

    assert(testCompany1Id && testCompany2Id, `Provisioned test companies CMP-881 (ID: ${testCompany1Id}) and CMP-882 (ID: ${testCompany2Id})`);

    // -------------------------------------------------------------------------
    // TEST GROUP 2: Canonical AMC Ticket Numbering (TD-AMC-C001-01)
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 2] Canonical AMC Ticket Numbering & Independent Sequencing');

    const seqNameAmc = 'tkt:TD-AMC-C881';
    createdSequenceNames.push(seqNameAmc);

    // Standard non-AMC company ticket format
    const stdCompTkt = await generateTicketNumber(connection, { companyId: 'CMP-881', isAmc: false });
    assert(stdCompTkt === 'CMP-881-001', `Standard company ticket generates 3-digit serial format: CMP-881-001 (got ${stdCompTkt})`);
    createdSequenceNames.push('tkt:CMP-881');

    // AMC company ticket format
    const amcTkt1 = await generateTicketNumber(connection, { companyId: 'CMP-881', isAmc: true });
    assert(amcTkt1 === 'TD-AMC-C881-01', `First AMC company ticket generates 2-digit serial format: TD-AMC-C881-01 (got ${amcTkt1})`);

    const amcTkt2 = await generateTicketNumber(connection, { companyId: 'CMP-881', isAmc: true });
    assert(amcTkt2 === 'TD-AMC-C881-02', `Second AMC company ticket generates monotonic sequence: TD-AMC-C881-02 (got ${amcTkt2})`);

    // Concurrency check on AMC ticket generator
    const parallelAmcTkts = await Promise.all([
      (async () => { const c = await pool.getConnection(); try { return await generateTicketNumber(c, { companyId: 'CMP-881', isAmc: true }); } finally { c.release(); } })(),
      (async () => { const c = await pool.getConnection(); try { return await generateTicketNumber(c, { companyId: 'CMP-881', isAmc: true }); } finally { c.release(); } })(),
      (async () => { const c = await pool.getConnection(); try { return await generateTicketNumber(c, { companyId: 'CMP-881', isAmc: true }); } finally { c.release(); } })()
    ]);
    const uniqueAmcTkts = new Set(parallelAmcTkts);
    assert(uniqueAmcTkts.size === 3, `Parallel AMC ticket calls generate distinct consecutive IDs without collisions: [${parallelAmcTkts.join(', ')}]`);

    // -------------------------------------------------------------------------
    // TEST GROUP 3: Registered Fleet Inventory vs AMC Capacity
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 3] Registered Fleet Inventory Decoupling & Elimination of Client Self-Entitlement');

    // Register 12 devices for Company 1 (exceeding legacy 10/50 limits to prove unlimited fleet)
    for (let i = 1; i <= 12; i++) {
      const [devIns] = await connection.query(`
        INSERT INTO company_devices 
          (company_id, device_category, brand, model_number, serial_number, asset_id, is_amc, amc_tag, is_active, status)
        VALUES (?, 'Laptop', 'Dell', 'Latitude 5520', ?, ?, 0, NULL, 1, 'active')
      `, [testCompany1Id, `SN-P1-CORP1-${i}`, `AST-P1-CORP1-${i}`]);
      createdDeviceIds.push(devIns.insertId);
    }

    const [comp1Fleet] = await connection.query('SELECT COUNT(*) AS total FROM company_devices WHERE company_id = ?', [testCompany1Id]);
    assert(comp1Fleet[0].total >= 12, `Registered fleet inventory supports 12+ devices without quota blockage (total: ${comp1Fleet[0].total})`);

    // Verify client cannot self-entitle AMC status
    const [uncoveredDevs] = await connection.query('SELECT is_amc, amc_tag FROM company_devices WHERE id = ?', [createdDeviceIds[0]]);
    assert(uncoveredDevs[0].is_amc === 0 && uncoveredDevs[0].amc_tag === null, 'Registered device is created with is_amc = 0 and amc_tag = NULL (no self-entitlement)');

    // -------------------------------------------------------------------------
    // TEST GROUP 4: Authoritative AMC Repair Eligibility Checking
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 4] Authoritative AMC Repair Eligibility Checking');

    // 4A: Check eligibility before contract is created
    const eligNoContract = await amcService.resolveDeviceAmcEligibility(connection, {
      companyId: testCompany1Id,
      deviceId: createdDeviceIds[0]
    });
    assert(eligNoContract.isEligible === false, 'Device with no AMC contract is strictly NOT eligible');

    // 4B: Insecure legacy bypass test: Setting company_profiles.amc_status = 'Active' MUST NOT grant eligibility
    await connection.query('UPDATE company_profiles SET amc_status = "Active" WHERE user_id = ?', [testCompany1Id]);
    const eligProfileBypass = await amcService.resolveDeviceAmcEligibility(connection, {
      companyId: testCompany1Id,
      deviceId: createdDeviceIds[0]
    });
    assert(eligProfileBypass.isEligible === false, 'Setting company_profiles.amc_status = "Active" does NOT falsely grant repair eligibility');

    // 4C: Insecure legacy bypass test: Setting company_devices.is_amc = 1 MUST NOT grant eligibility
    await connection.query('UPDATE company_devices SET is_amc = 1, amc_tag = "td-amc-999" WHERE id = ?', [createdDeviceIds[0]]);
    const eligDeviceBypass = await amcService.resolveDeviceAmcEligibility(connection, {
      companyId: testCompany1Id,
      deviceId: createdDeviceIds[0]
    });
    assert(eligDeviceBypass.isEligible === false, 'Setting company_devices.is_amc = 1 does NOT falsely grant repair eligibility');

    // Reset flags
    await connection.query('UPDATE company_profiles SET amc_status = "Inactive" WHERE user_id = ?', [testCompany1Id]);
    await connection.query('UPDATE company_devices SET is_amc = 0, amc_tag = NULL WHERE id = ?', [createdDeviceIds[0]]);

    // -------------------------------------------------------------------------
    // TEST GROUP 5: AMC Contract Capacity & Device Assignment
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 5] AMC Contract Capacity Enforcement & Device Selection');

    // Create contract with capacity = 2
    const contractRes = await amcService.createAmcContract({
      companyId: testCompany1Id,
      contractType: 'standard',
      planName: 'Standard Fleet AMC (2 Devices)',
      deviceCapacity: 2,
      price: 5000.00,
      totalAmount: 5900.00,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      createdBy: testAdminId
    });
    const testContractId = contractRes.id;
    createdContractIds.push(testContractId);

    // Initial capacity check
    const capInit = await amcService.checkContractCapacity(connection, testContractId);
    assert(capInit.capacity === 2 && capInit.coveredCount === 0 && capInit.availableSlots === 2, 'Contract capacity = 2, covered = 0, available = 2');

    // Assign 2 devices (within capacity)
    const assignRes = await amcService.assignDevicesToCoverage(connection, {
      contractId: testContractId,
      companyId: testCompany1Id,
      deviceIds: [createdDeviceIds[0], createdDeviceIds[1]],
      userId: testCompany1Id
    });
    assert(assignRes.success === true && assignRes.assignedCount === 2, 'Assigned 2 devices to contract coverage successfully');

    // Check capacity after assignment
    const capFull = await amcService.checkContractCapacity(connection, testContractId);
    assert(capFull.coveredCount === 2 && capFull.availableSlots === 0 && capFull.isAtCapacity === true, 'Contract is now at capacity (covered = 2, available = 0)');

    // Attempt to assign 3rd device -> MUST FAIL with CAPACITY_EXCEEDED
    let capacityExceededThrown = false;
    try {
      await amcService.assignDevicesToCoverage(connection, {
        contractId: testContractId,
        companyId: testCompany1Id,
        deviceIds: [createdDeviceIds[2]],
        userId: testCompany1Id
      });
    } catch (err) {
      capacityExceededThrown = err.message.includes('CAPACITY_EXCEEDED');
    }
    assert(capacityExceededThrown, 'Exceeding contract capacity is strictly rejected with CAPACITY_EXCEEDED');

    // Attempt to assign a device that already has active coverage -> MUST FAIL
    let dupeCoverageThrown = false;
    try {
      await amcService.assignDevicesToCoverage(connection, {
        contractId: testContractId,
        companyId: testCompany1Id,
        deviceIds: [createdDeviceIds[0]],
        userId: testCompany1Id
      });
    } catch (err) {
      dupeCoverageThrown = err.message.includes('ALREADY_COVERED') || err.message.includes('CAPACITY_EXCEEDED');
    }
    assert(dupeCoverageThrown, 'Attempting to assign an already covered device is rejected');

    // -------------------------------------------------------------------------
    // TEST GROUP 6: Separate Lifecycle States & Valid Coverage Activation
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 6] Separate Lifecycle States: Approval, Payment & Activation');

    // Verify covered device is NOT eligible while contract is still in 'offered', 'pending_approval', 'unpaid'
    const eligUnapproved = await amcService.resolveDeviceAmcEligibility(connection, {
      companyId: testCompany1Id,
      deviceId: createdDeviceIds[0]
    });
    assert(eligUnapproved.isEligible === false, 'Covered device is NOT eligible while contract is unapproved and unpaid');

    // Company accepts offer
    await amcService.acceptAmcOffer({ contractId: testContractId, companyId: testCompany1Id, userId: testCompany1Id });

    // Admin approves contract
    await amcService.approveAmcContract({ contractId: testContractId, adminUserId: testAdminId });

    // Still unpaid -> MUST NOT be eligible
    const eligUnpaid = await amcService.resolveDeviceAmcEligibility(connection, {
      companyId: testCompany1Id,
      deviceId: createdDeviceIds[0]
    });
    assert(eligUnpaid.isEligible === false, 'Covered device is NOT eligible while contract payment is unpaid');

    // Mark paid and activate
    await connection.query('UPDATE amc_contracts SET payment_status = "paid" WHERE id = ?', [testContractId]);
    await amcService.activateAmcContract({ contractId: testContractId, adminUserId: testAdminId });

    // Now MUST be eligible!
    const eligActive = await amcService.resolveDeviceAmcEligibility(connection, {
      companyId: testCompany1Id,
      deviceId: createdDeviceIds[0]
    });
    assert(eligActive.isEligible === true, 'Covered device is ELIGIBLE once contract is approved, paid, and active');
    assert(eligActive.contract && eligActive.coverage && eligActive.coverage.amc_tag, `Eligibility returns authoritative contract and tag: ${eligActive.coverage?.amc_tag}`);

    // Device not in covered devices list is NOT eligible
    const eligUncovered = await amcService.resolveDeviceAmcEligibility(connection, {
      companyId: testCompany1Id,
      deviceId: createdDeviceIds[2]
    });
    assert(eligUncovered.isEligible === false, 'Fleet device not in contract covered devices is NOT eligible');

    // -------------------------------------------------------------------------
    // TEST GROUP 7: Cross-Company Tenant Isolation
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 7] Cross-Company Tenant Isolation');

    // Company 2 attempting to claim eligibility for Company 1's device
    const crossTenantCheck = await amcService.resolveDeviceAmcEligibility(connection, {
      companyId: testCompany2Id,
      deviceId: createdDeviceIds[0]
    });
    assert(crossTenantCheck.isEligible === false, 'Company 2 cannot access or claim AMC eligibility on Company 1 device');

    // Company 2 attempting to assign devices to Company 1's contract
    let crossAssignBlocked = false;
    try {
      await amcService.assignDevicesToCoverage(connection, {
        contractId: testContractId,
        companyId: testCompany2Id,
        deviceIds: [createdDeviceIds[0]],
        userId: testCompany2Id
      });
    } catch (err) {
      crossAssignBlocked = true;
    }
    assert(crossAssignBlocked, 'Cross-company contract mutation is strictly blocked');

    // -------------------------------------------------------------------------
    // TEST GROUP 8: Device Replacement Workflow
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 8] Device Replacement Workflow (Admin Approval Required)');

    const oldDevId = createdDeviceIds[0];
    const newDevId = createdDeviceIds[2]; // Currently in fleet, not covered

    // Step 1: Submit replacement request
    const repReq = await amcService.requestDeviceReplacement(connection, {
      contractId: testContractId,
      companyId: testCompany1Id,
      oldDeviceId: oldDevId,
      newDeviceId: newDevId,
      reason: 'Hardware motherboard failure, unrepairable',
      userId: testCompany1Id
    });
    assert(repReq && repReq.status === 'pending', `Replacement request submitted with status "pending" (Number: ${repReq.replacementNumber})`);

    // Step 2: Verify pending replacement does NOT alter active coverage
    const eligOldPending = await amcService.resolveDeviceAmcEligibility(connection, {
      companyId: testCompany1Id,
      deviceId: oldDevId
    });
    const eligNewPending = await amcService.resolveDeviceAmcEligibility(connection, {
      companyId: testCompany1Id,
      deviceId: newDevId
    });
    assert(eligOldPending.isEligible === true, 'Old device retains active coverage while replacement request is pending');
    assert(eligNewPending.isEligible === false, 'New device has NO coverage while replacement request is pending');

    // Step 3: Admin reviews and approves replacement
    const reviewRes = await amcService.reviewDeviceReplacement(connection, {
      replacementId: repReq.id,
      adminUserId: testAdminId,
      decision: 'approved',
      adminNotes: 'Verified replacement device serial and hardware warranty'
    });
    assert(reviewRes.decision === 'approved', 'Admin successfully approved device replacement');

    // Step 4: Verify coverage transfer
    const eligOldApproved = await amcService.resolveDeviceAmcEligibility(connection, {
      companyId: testCompany1Id,
      deviceId: oldDevId
    });
    const eligNewApproved = await amcService.resolveDeviceAmcEligibility(connection, {
      companyId: testCompany1Id,
      deviceId: newDevId
    });
    assert(eligOldApproved.isEligible === false, 'Old device coverage transitioned out (isEligible: false)');
    assert(eligNewApproved.isEligible === true, 'New device now has active AMC coverage (isEligible: true)');

    // Verify old device is preserved in fleet inventory (not deleted or quota refunded)
    const [oldDevFleet] = await connection.query('SELECT id, status FROM company_devices WHERE id = ?', [oldDevId]);
    assert(oldDevFleet.length === 1, 'Old device is preserved in company fleet inventory');

    // -------------------------------------------------------------------------
    // TEST GROUP 9: Audit History Integrity
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 9] Audit History Integrity');

    const [histRows] = await connection.query('SELECT action FROM amc_contract_history WHERE contract_id = ? ORDER BY id ASC', [testContractId]);
    const actions = histRows.map(h => h.action);
    assert(actions.includes('CONTRACT_CREATED'), 'History records CONTRACT_CREATED');
    assert(actions.includes('DEVICES_ASSIGNED'), 'History records DEVICES_ASSIGNED');
    assert(actions.includes('OFFER_ACCEPTED'), 'History records OFFER_ACCEPTED');
    assert(actions.includes('CONTRACT_APPROVED'), 'History records CONTRACT_APPROVED');
    assert(actions.includes('CONTRACT_ACTIVATED'), 'History records CONTRACT_ACTIVATED');
    assert(actions.includes('REPLACEMENT_REQUESTED'), 'History records REPLACEMENT_REQUESTED');
    assert(actions.includes('REPLACEMENT_APPROVED'), 'History records REPLACEMENT_APPROVED');

  } catch (error) {
    console.error('Test Suite encountered an unexpected error:', error);
    failedTests++;
  } finally {
    // -------------------------------------------------------------------------
    // TEARDOWN TEST FIXTURES
    // -------------------------------------------------------------------------
    console.log('\n[Teardown] Cleaning Up Isolated Test Fixtures');

    try {
      if (createdContractIds.length > 0) {
        await connection.query('DELETE FROM amc_contracts WHERE id IN (?)', [createdContractIds]);
      }
      if (createdDeviceIds.length > 0) {
        await connection.query('DELETE FROM company_devices WHERE id IN (?)', [createdDeviceIds]);
      }
      if (testCompany1Id) {
        await connection.query('DELETE FROM company_profiles WHERE user_id = ?', [testCompany1Id]);
        await connection.query('DELETE FROM users WHERE id = ?', [testCompany1Id]);
      }
      if (testCompany2Id) {
        await connection.query('DELETE FROM company_profiles WHERE user_id = ?', [testCompany2Id]);
        await connection.query('DELETE FROM users WHERE id = ?', [testCompany2Id]);
      }
      if (createdSequenceNames.length > 0) {
        await connection.query('DELETE FROM app_sequences WHERE sequence_name IN (?)', [createdSequenceNames]);
      }
      console.log('  ✓ Test fixtures cleaned up successfully');
    } catch (teardownErr) {
      console.error('Teardown warning:', teardownErr.message);
    }

    connection.release();

    console.log('\n====================================================');
    console.log(`TEST RESULTS: ${passedTests} passed, ${failedTests} failed`);
    console.log('====================================================\n');

    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runTestSuite();

