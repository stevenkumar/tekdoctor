/**
 * Dedicated Automated Test Suite: AMC Workflow Bug Fixes & Data Synchronization
 * 
 * Issue 1: Admin Cannot Approve a Company-Rejected AMC Offer (State Machine & Entry Points)
 * Issue 2: Company Rejection Reason Captured & Distinguishable in Admin AMC Management
 * Issue 3: Contract-Specific Device Capacity & Covered Count Invariance in Details & Summary
 */

const assert = require('assert');
const { pool } = require('../config/db.config');
const amcService = require('../services/amc.service');

async function runTests() {
  console.log('===================================================================');
  console.log('TEST SUITE: AMC Workflow Bug Fixes & Data Synchronization');
  console.log('===================================================================\n');

  let passed = 0;
  const cleanupUserIds = [];
  const cleanupContractIds = [];
  const cleanupRequestIds = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Test Fixtures: Admin, Company, and Fleet Devices
    // -------------------------------------------------------------------------
    const ts = Date.now();
    const adminEmail = `amc_wf_admin_${ts}@tekdoctor.in`;
    const [adminUser] = await pool.query(
      'INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, ?, 1)',
      ['AMC Workflow Admin', adminEmail, 'hash_pwd_123', 'admin']
    );
    const adminUserId = adminUser.insertId;
    cleanupUserIds.push(adminUserId);

    const compCode = `CMP-WF${ts.toString().slice(-4)}`;
    const compEmail = `amc_wf_comp_${ts}@tekdoctor.in`;
    const [compUser] = await pool.query(
      'INSERT INTO users (name, email, password, role, company_id, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      ['AMC Workflow Corp', compEmail, 'hash_pwd_123', 'company', compCode]
    );
    const companyUserId = compUser.insertId;
    cleanupUserIds.push(companyUserId);

    await pool.query(
      'INSERT INTO company_profiles (user_id, company_id, company_name) VALUES (?, ?, ?)',
      [companyUserId, compCode, 'AMC Workflow Corp']
    );

    // Create 12 company devices for capacity testing
    const deviceIds = [];
    for (let i = 1; i <= 12; i++) {
      const [d] = await pool.query(
        'INSERT INTO company_devices (company_id, brand, model_number, serial_number, is_active) VALUES (?, ?, ?, ?, 1)',
        [companyUserId, 'Dell', `Latitude ${5000 + i}`, `SN-WF-${ts}-${i}`]
      );
      deviceIds.push(d.insertId);
    }

    // =========================================================================
    // ISSUE 1: Admin Cannot Approve a Company-Rejected AMC Offer
    // =========================================================================
    console.log('[Issue 1] Company Rejection State Machine & Blocked Approval');

    // 1. Create offer for company
    const offer1 = await amcService.createAmcContract({
      companyId: companyUserId,
      planName: 'Enterprise Silver Fleet',
      deviceCapacity: 10,
      price: 25000,
      totalAmount: 29500,
      startDate: '2026-11-01',
      endDate: '2027-10-31',
      createdBy: adminUserId
    });
    cleanupContractIds.push(offer1.id);

    // Verify initial offer status
    const [initialRows] = await pool.query('SELECT status, approval_status FROM amc_contracts WHERE id = ?', [offer1.id]);
    assert.strictEqual(initialRows[0].status, 'offered', 'Offer is initially in "offered" status');
    assert.strictEqual(initialRows[0].approval_status, 'pending_approval', 'Offer initial approval_status is "pending_approval"');
    console.log('  ✓ Contract offer created in "offered" status with "pending_approval"');
    passed++;

    // 2. Company rejects the offer with specific reason
    const rejectionReason = 'Budget reduced for Q4 fleet upgrades';
    const rejectRes = await amcService.rejectAmcOffer({
      contractId: offer1.id,
      companyId: companyUserId,
      reason: rejectionReason,
      userId: companyUserId
    });
    assert.strictEqual(rejectRes.success, true, 'Offer rejection returns success');

    // Verify database state: both status and approval_status must be 'rejected'
    const [rejectedRows] = await pool.query('SELECT status, approval_status FROM amc_contracts WHERE id = ?', [offer1.id]);
    assert.strictEqual(rejectedRows[0].status, 'rejected', 'Contract status transitioned to "rejected"');
    assert.strictEqual(rejectedRows[0].approval_status, 'rejected', 'Contract approval_status transitioned to "rejected"');
    console.log('  ✓ Authoritative persistence: status and approval_status both set to "rejected"');
    passed++;

    // 3. Admin attempts to approve the rejected contract offer -> MUST THROW
    let approveRejectedFailed = false;
    let approveErrorMessage = '';
    try {
      await amcService.approveAmcContract({
        contractId: offer1.id,
        adminUserId: adminUserId
      });
    } catch (err) {
      approveRejectedFailed = true;
      approveErrorMessage = err.message;
    }
    assert(approveRejectedFailed, 'Backend strictly rejects Admin approval of rejected offer');
    assert.match(approveErrorMessage, /Cannot approve a rejected contract offer/i, 'Correct error message on rejected approval attempt');
    console.log(`  ✓ Admin approval strictly blocked with error: "${approveErrorMessage}"`);
    passed++;

    // 4. Payment order initiation on rejected offer -> MUST THROW
    let paymentOrderFailed = false;
    try {
      await amcService.createContractPaymentOrder({
        contractId: offer1.id,
        companyId: companyUserId,
        userId: companyUserId
      });
    } catch (err) {
      paymentOrderFailed = true;
      assert.match(err.message, /Cannot initiate payment for a rejected contract offer/i);
    }
    assert(paymentOrderFailed, 'Online payment order creation blocked for rejected offer');
    console.log('  ✓ Online payment initiation strictly blocked for rejected offer');
    passed++;

    // 5. Offline payment initiation on rejected offer -> MUST THROW
    let offlinePayFailed = false;
    try {
      await amcService.initiateContractOfflinePayment({
        contractId: offer1.id,
        companyId: companyUserId,
        referenceNumber: 'NEFT-REJECT-001',
        userId: companyUserId
      });
    } catch (err) {
      offlinePayFailed = true;
      assert.match(err.message, /Cannot initiate payment for a rejected contract offer/i);
    }
    assert(offlinePayFailed, 'Offline payment initiation blocked for rejected offer');
    console.log('  ✓ Offline payment initiation strictly blocked for rejected offer');
    passed++;

    // 6. Direct contract activation on rejected offer -> MUST THROW
    let activationFailed = false;
    try {
      await amcService.activateAmcContract({
        contractId: offer1.id,
        adminUserId: adminUserId
      });
    } catch (err) {
      activationFailed = true;
      assert.match(err.message, /Cannot activate a rejected contract/i);
    }
    assert(activationFailed, 'Direct contract activation blocked for rejected offer');
    console.log('  ✓ Contract activation strictly blocked for rejected offer');
    passed++;

    // 7. Normal workflow for a new contract offer must NOT be blocked by previous rejection
    const offer2 = await amcService.createAmcContract({
      companyId: companyUserId,
      planName: 'Enterprise Silver Fleet (Revised)',
      deviceCapacity: 10,
      price: 22000,
      totalAmount: 25960,
      startDate: '2026-11-01',
      endDate: '2027-10-31',
      createdBy: adminUserId
    });
    cleanupContractIds.push(offer2.id);

    // Company accepts new offer
    await amcService.acceptAmcOffer({
      contractId: offer2.id,
      companyId: companyUserId,
      userId: companyUserId
    });

    // Admin approves accepted offer
    const approvedOffer2 = await amcService.approveAmcContract({
      contractId: offer2.id,
      adminUserId: adminUserId
    });
    assert.strictEqual(approvedOffer2.approvalStatus, 'approved', 'New offer approved normally');
    console.log('  ✓ New valid offer succeeds through normal acceptance and approval without interference');
    passed++;

    // =========================================================================
    // ISSUE 2: Company Rejection Reason Captured & Distinguishable in Admin AMC
    // =========================================================================
    console.log('\n[Issue 2] Rejection Reason Association, Source & Distinction');

    // 1. Check getContractDetails for the rejected offer (Offer 1)
    const details1 = await amcService.getContractDetails(offer1.id);
    assert.strictEqual(details1.status, 'rejected', 'Contract details status is "rejected"');
    assert.strictEqual(details1.rejection_reason, rejectionReason, 'Contract details returns exact rejection_reason');
    assert.strictEqual(details1.rejection_source, 'Company', 'Contract details returns rejection_source: "Company"');
    assert(details1.rejected_at, 'Contract details returns rejected_at timestamp');
    console.log('  ✓ getContractDetails exposes rejection_reason, rejection_source: "Company", and rejected_at');
    passed++;

    // 2. Check getContracts (contracts list summary) for the rejected offer
    const allContracts = await amcService.getContracts({ companyId: companyUserId });
    const rejectedInList = allContracts.find(c => c.id === offer1.id);
    assert(rejectedInList, 'Rejected contract found in contracts summary list');
    assert.strictEqual(rejectedInList.rejection_reason, rejectionReason, 'Summary list includes rejection_reason');
    assert.strictEqual(rejectedInList.rejection_source, 'Company', 'Summary list includes rejection_source: "Company"');
    assert(rejectedInList.rejected_at, 'Summary list includes rejected_at timestamp');
    console.log('  ✓ getContracts list projects rejection metadata for table display');
    passed++;

    // 3. Admin rejects an AMC request (Distinguishing Admin Request Rejection from Company Offer Rejection)
    const req1 = await amcService.createAmcRequest({
      companyId: companyUserId,
      requestedDeviceCount: 5,
      notes: 'Initial inquiry for branch office'
    });
    cleanupRequestIds.push(req1.id);

    const adminRejectionNote = 'Outside regional technician service territory';
    await amcService.reviewAmcRequest({
      requestId: req1.id,
      adminUserId: adminUserId,
      status: 'rejected',
      adminNotes: adminRejectionNote
    });

    const allRequests = await amcService.getAmcRequests({ companyId: companyUserId });
    const rejectedReq = allRequests.find(r => r.id === req1.id);
    assert(rejectedReq, 'Rejected request found in requests list');
    assert.strictEqual(rejectedReq.status, 'rejected', 'Request status is "rejected"');
    assert.strictEqual(rejectedReq.admin_notes, adminRejectionNote, 'Request includes exact admin_notes');
    assert(rejectedReq.reviewed_by_name, 'Request includes reviewed_by_name from Admin user');
    console.log('  ✓ Admin request rejection distinct with admin_notes and reviewed_by_name');
    passed++;

    // 4. Verify historical audit trail preserves rejection records
    const [histRows] = await pool.query(
      'SELECT action, details FROM amc_contract_history WHERE contract_id = ? AND action = "OFFER_REJECTED"',
      [offer1.id]
    );
    assert.strictEqual(histRows.length, 1, 'Exactly 1 OFFER_REJECTED history record');
    const histDetails = typeof histRows[0].details === 'string' ? JSON.parse(histRows[0].details) : histRows[0].details;
    assert.strictEqual(histDetails.reason, rejectionReason, 'Audit history preserves exact reason payload');
    console.log('  ✓ Historical audit trail preserves immutable OFFER_REJECTED event and metadata');
    passed++;

    // =========================================================================
    // ISSUE 3: Contract-Specific Device Capacity & Covered Count Invariance
    // =========================================================================
    console.log('\n[Issue 3] Contract-Specific Device Capacity & Covered Device Count Invariance');

    // Contract A: Capacity 25, 7 allocated devices
    const contractA = await amcService.createAmcContract({
      companyId: companyUserId,
      planName: 'Corporate Premium Fleet AMC',
      deviceCapacity: 25,
      price: 15000,
      totalAmount: 17699,
      startDate: '2026-10-31',
      endDate: '2027-10-07',
      createdBy: adminUserId
    });
    cleanupContractIds.push(contractA.id);

    // Accept & approve Contract A
    await amcService.acceptAmcOffer({ contractId: contractA.id, companyId: companyUserId, userId: companyUserId });
    await amcService.approveAmcContract({ contractId: contractA.id, adminUserId: adminUserId });

    // Mark paid & active
    await pool.query('UPDATE amc_contracts SET payment_status = "paid", status = "active" WHERE id = ?', [contractA.id]);

    // Assign 7 devices to Contract A (devices 0 to 6)
    const devicesForA = deviceIds.slice(0, 7);
    await amcService.assignDevicesToCoverage(pool, {
      contractId: contractA.id,
      companyId: companyUserId,
      deviceIds: devicesForA,
      userId: companyUserId
    });

    // Contract B: Capacity 10, 3 allocated devices
    const contractB = await amcService.createAmcContract({
      companyId: companyUserId,
      planName: 'Branch Office Fleet AMC',
      deviceCapacity: 10,
      price: 8000,
      totalAmount: 9440,
      startDate: '2026-11-01',
      endDate: '2027-10-31',
      createdBy: adminUserId
    });
    cleanupContractIds.push(contractB.id);

    // Accept & approve Contract B
    await amcService.acceptAmcOffer({ contractId: contractB.id, companyId: companyUserId, userId: companyUserId });
    await amcService.approveAmcContract({ contractId: contractB.id, adminUserId: adminUserId });

    // Mark paid & active
    await pool.query('UPDATE amc_contracts SET payment_status = "paid", status = "active" WHERE id = ?', [contractB.id]);

    // Assign 3 devices to Contract B (devices 7 to 9)
    const devicesForB = deviceIds.slice(7, 10);
    await amcService.assignDevicesToCoverage(pool, {
      contractId: contractB.id,
      companyId: companyUserId,
      deviceIds: devicesForB,
      userId: companyUserId
    });

    // Contract C: Capacity 5, 0 allocated devices (Zero allocation test)
    const contractC = await amcService.createAmcContract({
      companyId: companyUserId,
      planName: 'Reserve Fleet AMC',
      deviceCapacity: 5,
      price: 5000,
      totalAmount: 5900,
      startDate: '2026-11-01',
      endDate: '2027-10-31',
      createdBy: adminUserId
    });
    cleanupContractIds.push(contractC.id);
    await amcService.acceptAmcOffer({ contractId: contractC.id, companyId: companyUserId, userId: companyUserId });
    await amcService.approveAmcContract({ contractId: contractC.id, adminUserId: adminUserId });
    await pool.query('UPDATE amc_contracts SET payment_status = "paid", status = "active" WHERE id = ?', [contractC.id]);

    // 1. Verify getContractDetails for Contract A -> strictly 7 / 25
    const detailsA = await amcService.getContractDetails(contractA.id);
    assert.strictEqual(detailsA.device_capacity, 25, 'Contract A capacity is 25');
    assert.strictEqual(detailsA.active_covered_count, 7, 'Contract A active_covered_count is strictly 7');
    assert.strictEqual(detailsA.coveredDevices.length, 7, 'Contract A coveredDevices array has 7 devices');
    console.log('  ✓ Contract A getContractDetails: 7 / 25 Devices (exact match)');
    passed++;

    // 2. Verify getContractDetails for Contract B -> strictly 3 / 10
    const detailsB = await amcService.getContractDetails(contractB.id);
    assert.strictEqual(detailsB.device_capacity, 10, 'Contract B capacity is 10');
    assert.strictEqual(detailsB.active_covered_count, 3, 'Contract B active_covered_count is strictly 3');
    assert.strictEqual(detailsB.coveredDevices.length, 3, 'Contract B coveredDevices array has 3 devices');
    console.log('  ✓ Contract B getContractDetails: 3 / 10 Devices (exact match)');
    passed++;

    // 3. Verify getContractDetails for Contract C -> strictly 0 / 5 (does not inherit other contract counts)
    const detailsC = await amcService.getContractDetails(contractC.id);
    assert.strictEqual(detailsC.device_capacity, 5, 'Contract C capacity is 5');
    assert.strictEqual(detailsC.active_covered_count, 0, 'Contract C active_covered_count is strictly 0');
    assert.strictEqual(detailsC.coveredDevices.length, 0, 'Contract C coveredDevices array is empty');
    console.log('  ✓ Contract C getContractDetails: 0 / 5 Devices (unassigned contract isolates to 0)');
    passed++;

    // 4. Verify getContracts summary list reflects contract-specific counts
    const contractsList = await amcService.getContracts({ companyId: companyUserId });
    const listA = contractsList.find(c => c.id === contractA.id);
    const listB = contractsList.find(c => c.id === contractB.id);
    const listC = contractsList.find(c => c.id === contractC.id);

    assert.strictEqual(listA.active_covered_count, 7, 'Summary list Contract A active_covered_count === 7');
    assert.strictEqual(listB.active_covered_count, 3, 'Summary list Contract B active_covered_count === 3');
    assert.strictEqual(listC.active_covered_count, 0, 'Summary list Contract C active_covered_count === 0');
    console.log('  ✓ getContracts summary list accurately returns 7/25, 3/10, and 0/5 without cross-contamination');
    passed++;

    // 5. Invariance Check: Fetching Contract A again after Contract B and C confirms no state drift
    const detailsARecheck = await amcService.getContractDetails(contractA.id);
    assert.strictEqual(detailsARecheck.active_covered_count, 7, 'Contract A count remains invariant (7) regardless of order or active contracts');
    console.log('  ✓ Invariance verified: Order of retrieval does not alter contract-specific device count');
    passed++;

  } finally {
    // -------------------------------------------------------------------------
    // Teardown: Clean up isolated test fixtures
    // -------------------------------------------------------------------------
    try {
      if (cleanupContractIds.length > 0) {
        await pool.query('DELETE FROM amc_covered_devices WHERE contract_id IN (?)', [cleanupContractIds]);
        await pool.query('DELETE FROM amc_contract_history WHERE contract_id IN (?)', [cleanupContractIds]);
        await pool.query('DELETE FROM amc_contracts WHERE id IN (?)', [cleanupContractIds]);
      }
      if (cleanupRequestIds.length > 0) {
        await pool.query('DELETE FROM amc_requests WHERE id IN (?)', [cleanupRequestIds]);
      }
      if (cleanupUserIds.length > 0) {
        await pool.query('DELETE FROM company_devices WHERE company_id IN (?)', [cleanupUserIds]);
        await pool.query('DELETE FROM company_profiles WHERE user_id IN (?)', [cleanupUserIds]);
        await pool.query('DELETE FROM users WHERE id IN (?)', [cleanupUserIds]);
      }
    } catch (cleanupErr) {
      console.error('Error during teardown cleanup:', cleanupErr);
    }
  }

  console.log('\n===================================================================');
  console.log(`WORKFLOW FIXES RESULTS: ${passed} passed, 0 failed`);
  console.log('===================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test suite execution failed:', err);
  process.exit(1);
});
