/**
 * Verification Test Suite: Phase 2 — Admin AMC Management & Company Portal Workflows
 * 
 * Verifies:
 * 1. Plan update and active/inactive status toggle.
 * 2. Request submission and Admin review lifecycle.
 * 3. Company contract offer rejection workflow with audit trail.
 * 4. Company contract acceptance, admin approval, online payment order, signature verification, invoice generation & activation.
 * 5. Offline bank transfer initiation, pending verification state, and Admin verification.
 * 6. Device assignment within capacity and strict overflow rejection (> capacity).
 * 7. Device replacement request and Admin approval workflow.
 * 8. Admin overview statistics accuracy.
 * 9. In-app notification creation in the notifications table.
 * 10. Self-contained fixture cleanup.
 */

const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const crypto = require('crypto');
const amcService = require('../services/amc.service');

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

const toDateStr = (d) => {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(d).slice(0, 10);
};

async function runTestSuite() {
  console.log('===================================================================');
  console.log('TEST SUITE: AMC Module Phase 2 — Admin & Company Portal Workflows');
  console.log('===================================================================\n');

  const connection = await pool.getConnection();

  // Test Fixture IDs for Cleanup
  let testAdminId = null;
  let testCompany1Id = null;
  let testCompany2Id = null;
  const createdContractIds = [];
  const createdRequestIds = [];
  const createdDeviceIds = [];
  const createdReplacementIds = [];
  const createdInvoiceIds = [];
  let testPlanId = null;

  try {
    // -------------------------------------------------------------------------
    // SETUP TEST FIXTURES
    // -------------------------------------------------------------------------
    console.log('[Setup] Provisioning Isolated Phase 2 Test Fixtures');

    // 1. Admin user
    const [admins] = await connection.query('SELECT id FROM users WHERE role = "admin" LIMIT 1');
    if (admins.length > 0) {
      testAdminId = admins[0].id;
    } else {
      const [admIns] = await connection.query(`
        INSERT INTO users (name, email, password, role, is_active)
        VALUES ('Test Admin P2', 'testadmin_p2@tekdoctor.in', 'hash', 'admin', 1)
      `);
      testAdminId = admIns.insertId;
    }

    // 2. Test Company 1 (CMP-901)
    const [comp1Ins] = await connection.query(`
      INSERT INTO users (name, email, password, role, company_id, is_active)
      VALUES ('AMC Corp Alpha', 'amc_alpha_p2@tekdoctor.in', 'hash', 'company', 'CMP-901', 1)
    `);
    testCompany1Id = comp1Ins.insertId;

    // 3. Test Company 2 (CMP-902)
    const [comp2Ins] = await connection.query(`
      INSERT INTO users (name, email, password, role, company_id, is_active)
      VALUES ('AMC Corp Beta', 'amc_beta_p2@tekdoctor.in', 'hash', 'company', 'CMP-902', 1)
    `);
    testCompany2Id = comp2Ins.insertId;

    // 4. Test Plan
    const [planIns] = await connection.query(`
      INSERT INTO amc_plans (plan_code, name, description, base_price, duration_months, default_device_capacity, coverage_terms, is_active)
      VALUES ('AMC-TEST-P2', 'Phase 2 Test Plan', 'Dedicated test plan for phase 2', 50000.00, 12, 5, '{"sla_response_time":"4h"}', 1)
    `);
    testPlanId = planIns.insertId;

    // 5. Fleet Devices for Company 1
    for (let i = 1; i <= 6; i++) {
      const [devIns] = await connection.query(`
        INSERT INTO company_devices (company_id, device_category, brand, model_number, serial_number, asset_id, is_amc, amc_tag, is_active, status)
        VALUES (?, 'Laptop', 'Dell', 'Latitude 5420', ?, ?, 0, NULL, 1, 'active')
      `, [testCompany1Id, `SN-DELL-P2-00${i}`, `TAG-DELL-00${i}`]);
      createdDeviceIds.push(devIns.insertId);
    }

    assert(testAdminId && testCompany1Id && testCompany2Id && testPlanId, 'Test admin, companies, and test plan provisioned');

    // -------------------------------------------------------------------------
    // TEST GROUP 1: Plan Update & Toggle Status
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 1] Plan Management (Update & Toggle Status)');

    // Update Plan
    const updateResult = await amcService.updatePlan(testPlanId, {
      name: 'Phase 2 Premium Plan',
      description: 'Updated description for plan',
      basePrice: 55000,
      durationMonths: 12,
      defaultDeviceCapacity: 6,
      coverageTerms: { sla_response_time: '2h', standby_device: true },
    });
    assert(updateResult.success, 'Plan updated successfully via amcService.updatePlan');

    // Query updated plan from DB
    const [planRows] = await connection.query('SELECT * FROM amc_plans WHERE id = ?', [testPlanId]);
    assert(planRows[0].name === 'Phase 2 Premium Plan', 'Plan name persisted as Phase 2 Premium Plan');
    assert(Number(planRows[0].base_price) === 55000, 'Plan base_price persisted as 55000');
    assert(planRows[0].default_device_capacity === 6, 'Plan default_device_capacity persisted as 6');

    // Toggle Plan Status (active -> inactive)
    const toggledOff = await amcService.togglePlanStatus(testPlanId);
    assert(toggledOff.isActive === false, 'Plan successfully toggled to inactive (isActive: false)');

    // Toggle Plan Status back (inactive -> active)
    const toggledOn = await amcService.togglePlanStatus(testPlanId);
    assert(toggledOn.isActive === true, 'Plan successfully toggled back to active (isActive: true)');

    // -------------------------------------------------------------------------
    // TEST GROUP 2: Request Submission & Admin Review
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 2] Request Submission & Admin Review Lifecycle');

    const newReq = await amcService.createAmcRequest({
      companyId: testCompany1Id,
      planId: testPlanId,
      requestedDeviceCount: 5,
      notes: 'Initial enterprise request for 5 Dell laptops',
    });
    createdRequestIds.push(newReq.id);
    assert(newReq.requestNumber && newReq.requestNumber.startsWith('REQ-AMC-'), `AMC Request created with number ${newReq.requestNumber}`);

    // Admin reviews request
    const reviewedReq = await amcService.reviewAmcRequest({
      requestId: newReq.id,
      adminUserId: testAdminId,
      status: 'under_review',
      adminNotes: 'Assigned to enterprise quote specialist',
    });
    assert(reviewedReq.status === 'under_review', 'Admin successfully changed request status to under_review');

    const [reqDbRows] = await connection.query('SELECT * FROM amc_requests WHERE id = ?', [newReq.id]);
    assert(reqDbRows[0].admin_notes === 'Assigned to enterprise quote specialist', 'Admin notes persisted in amc_requests');

    // -------------------------------------------------------------------------
    // TEST GROUP 3: Contract Creation & Offer Rejection
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 3] Contract Offer Creation & Company Rejection');

    // Admin creates contract offer for Company 2
    const offerForComp2 = await amcService.createAmcContract({
      companyId: testCompany2Id,
      planId: testPlanId,
      planName: 'Phase 2 Premium Plan',
      deviceCapacity: 3,
      price: 30000,
      discountAmount: 2000,
      taxAmount: 5040,
      totalAmount: 33040,
      termsAndConditions: 'Standard 1-year coverage terms',
      createdBy: testAdminId,
    });
    createdContractIds.push(offerForComp2.id);
    assert(offerForComp2.contractNumber && offerForComp2.contractNumber.startsWith('AMC-CTR-'),
      `Contract offer created with number ${offerForComp2.contractNumber}`);

    // Company 2 rejects the offer
    const rejectedOffer = await amcService.rejectAmcOffer({
      contractId: offerForComp2.id,
      companyId: testCompany2Id,
      reason: 'Requested higher discount on spare parts',
      userId: testCompany2Id,
    });
    assert(rejectedOffer.status === 'rejected', 'Contract status transitioned to rejected on company decline');

    // Verify cannot accept a rejected offer
    let acceptRejectedFailed = false;
    try {
      await amcService.acceptAmcOffer({
        contractId: offerForComp2.id,
        companyId: testCompany2Id,
        userId: testCompany2Id,
      });
    } catch (err) {
      acceptRejectedFailed = true;
    }
    assert(acceptRejectedFailed, 'System strictly prevents accepting an already rejected contract offer');

    // -------------------------------------------------------------------------
    // TEST GROUP 4: Contract Acceptance, Admin Approval & Online Payment Activation
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 4] Online Payment Order, Verification & Activation');

    // Create contract offer for Company 1
    const contractComp1 = await amcService.createAmcContract({
      companyId: testCompany1Id,
      requestId: newReq.id,
      planId: testPlanId,
      planName: 'Phase 2 Premium Plan',
      deviceCapacity: 4,
      price: 40000,
      discountAmount: 0,
      taxAmount: 7200,
      totalAmount: 47200,
      createdBy: testAdminId,
    });
    createdContractIds.push(contractComp1.id);

    // Company 1 accepts offer
    const acceptedContract = await amcService.acceptAmcOffer({
      contractId: contractComp1.id,
      companyId: testCompany1Id,
      userId: testCompany1Id,
    });
    assert(acceptedContract.status === 'accepted', 'Company 1 successfully accepted the contract offer');

    // Admin approves the accepted contract (setting validity dates)
    const approvedContract = await amcService.approveAmcContract({
      contractId: contractComp1.id,
      adminUserId: testAdminId,
    });
    assert(approvedContract.approvalStatus === 'approved', 'Admin approved the contract');

    // Create Razorpay payment order
    const paymentOrder = await amcService.createContractPaymentOrder({
      contractId: contractComp1.id,
      companyId: testCompany1Id,
      userId: testCompany1Id,
    });
    assert(paymentOrder.orderId && paymentOrder.amount === 47200, `Payment order generated: ${paymentOrder.orderId} for ₹${paymentOrder.amount}`);

    // Verify invalid signature is rejected
    let invalidSigRejected = false;
    try {
      await amcService.verifyContractPayment({
        contractId: contractComp1.id,
        companyId: testCompany1Id,
        razorpayOrderId: paymentOrder.orderId,
        razorpayPaymentId: 'pay_test_phase2_001',
        razorpaySignature: 'tampered_invalid_signature',
        userId: testCompany1Id,
      });
    } catch (err) {
      invalidSigRejected = true;
      assert(err.message.includes('signature verification failed'), 'Invalid HMAC signature properly rejected');
    }
    assert(invalidSigRejected, 'System prevents payment activation with forged Razorpay signatures');

    // Compute cryptographically valid HMAC signature
    const mockPaymentId = `pay_test_${Date.now()}`;
    const validSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(`${paymentOrder.orderId}|${mockPaymentId}`)
      .digest('hex');

    // Verify payment with authentic signature
    const paymentResult = await amcService.verifyContractPayment({
      contractId: contractComp1.id,
      companyId: testCompany1Id,
      razorpayOrderId: paymentOrder.orderId,
      razorpayPaymentId: mockPaymentId,
      razorpaySignature: validSignature,
      userId: testCompany1Id,
    });
    assert(paymentResult.paymentStatus === 'paid', 'Contract paymentStatus updated to paid');
    assert(paymentResult.status === 'active', 'Contract status automatically activated upon verified payment');
    assert(paymentResult.invoiceId, `Commercial invoice generated: ${paymentResult.invoiceId}`);
    createdInvoiceIds.push(paymentResult.invoiceId);

    // Verify invoice record in database
    const [invRows] = await connection.query('SELECT * FROM invoices WHERE id = ?', [paymentResult.invoiceId]);
    assert(invRows.length > 0 && invRows[0].status.toLowerCase() === 'paid', 'Invoice recorded in invoices table with status Paid');

    // -------------------------------------------------------------------------
    // TEST GROUP 5: Offline Bank Payment Initiation & Admin Verification
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 5] Offline Bank Payment & Admin Verification');

    // Create a second contract for Company 1 with status accepted and approved
    const offlineContract = await amcService.createAmcContract({
      companyId: testCompany1Id,
      planId: testPlanId,
      planName: 'Phase 2 Premium Plan',
      deviceCapacity: 2,
      price: 20000,
      discountAmount: 0,
      taxAmount: 3600,
      totalAmount: 23600,
      createdBy: testAdminId,
    });
    createdContractIds.push(offlineContract.id);

    await amcService.acceptAmcOffer({
      contractId: offlineContract.id,
      companyId: testCompany1Id,
      userId: testCompany1Id,
    });

    await amcService.approveAmcContract({
      contractId: offlineContract.id,
      adminUserId: testAdminId,
    });

    // Company initiates offline payment
    await amcService.initiateContractOfflinePayment({
      contractId: offlineContract.id,
      companyId: testCompany1Id,
      userId: testCompany1Id,
      paymentMethod: 'neft',
      referenceNumber: 'NEFT-ICICI-20261029-9988',
      notes: 'Transferred via corporate NetBanking',
    });

    const [offDbContract] = await connection.query('SELECT payment_status FROM amc_contracts WHERE id = ?', [offlineContract.id]);
    assert(offDbContract[0].payment_status === 'pending_verification', 'Contract payment_status set to pending_verification');

    // Admin verifies the offline payment
    const verifiedOffline = await amcService.verifyContractOfflinePayment({
      contractId: offlineContract.id,
      adminUserId: testAdminId,
      decision: 'verified',
      adminNotes: 'NEFT credit confirmed in ICICI bank statement',
    });
    assert(verifiedOffline.paymentStatus === 'paid', 'Admin verification updated paymentStatus to paid');
    assert(verifiedOffline.status === 'active', 'Contract automatically activated after Admin verification');
    if (verifiedOffline.invoiceId) createdInvoiceIds.push(verifiedOffline.invoiceId);

    // -------------------------------------------------------------------------
    // TEST GROUP 6: Covered Devices Assignment & Capacity Enforcement
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 6] Covered Devices Assignment & Capacity Limits');

    // contractComp1 has capacity = 4.
    // Try to assign 3 devices (within capacity)
    const assignResult = await amcService.assignDevicesToCoverage(pool, {
      contractId: contractComp1.id,
      companyId: testCompany1Id,
      deviceIds: [createdDeviceIds[0], createdDeviceIds[1], createdDeviceIds[2]],
    });
    assert(assignResult.assignedCount === 3, 'Successfully assigned 3 devices within capacity of 4');

    // Verify capacity tracking endpoint
    const capacityInfo = await amcService.checkContractCapacity(pool, contractComp1.id);
    assert(capacityInfo.capacity === 4 && capacityInfo.coveredCount === 3 && capacityInfo.availableSlots === 1,
      'Capacity calculation accurate: 3 used, 1 remaining out of 4');

    // Try to assign 2 more devices (3 + 2 = 5 > 4 capacity) -> Must be rejected!
    let overflowRejected = false;
    try {
      await amcService.assignDevicesToCoverage(pool, {
        contractId: contractComp1.id,
        companyId: testCompany1Id,
        deviceIds: [createdDeviceIds[3], createdDeviceIds[4]],
      });
    } catch (err) {
      overflowRejected = true;
      assert(err.message.includes('exceeds contract capacity') || err.message.includes('capacity'),
        `Capacity overflow rejected with message: "${err.message}"`);
    }
    assert(overflowRejected, 'Attempting to assign devices exceeding contract capacity was strictly rejected');

    // Assign exactly 1 device to reach 100% capacity (4/4)
    const fillCapacity = await amcService.assignDevicesToCoverage(pool, {
      contractId: contractComp1.id,
      companyId: testCompany1Id,
      deviceIds: [createdDeviceIds[3]],
    });
    assert(fillCapacity.assignedCount === 1, 'Successfully reached full 4/4 contract device capacity');

    // -------------------------------------------------------------------------
    // TEST GROUP 7: Device Replacement Workflow
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 7] Device Replacement Request & Admin Review');

    // Company requests replacing Device 0 with Device 4 (from uncovered fleet)
    const replacementReq = await amcService.requestDeviceReplacement(pool, {
      contractId: contractComp1.id,
      companyId: testCompany1Id,
      oldDeviceId: createdDeviceIds[0],
      newDeviceId: createdDeviceIds[4],
      reason: 'Liquid damage on motherboard; replacement unit deployed',
      userId: testCompany1Id,
    });
    createdReplacementIds.push(replacementReq.id);
    assert(replacementReq.replacementNumber && replacementReq.status === 'pending',
      `Device replacement requested: ${replacementReq.replacementNumber} with status 'pending'`);

    // While replacement is requested, old device must remain active until approved
    const [oldDevBefore] = await connection.query(
      'SELECT status FROM amc_covered_devices WHERE contract_id = ? AND device_id = ?',
      [contractComp1.id, createdDeviceIds[0]]
    );
    assert(oldDevBefore[0].status === 'active', 'Original device coverage remains active while replacement is pending review');

    // Admin approves replacement
    const reviewedReplacement = await amcService.reviewDeviceReplacement(pool, {
      replacementId: replacementReq.id,
      adminUserId: testAdminId,
      decision: 'approved',
      adminNotes: 'Hardware replacement authorized per enterprise terms',
    });
    assert(reviewedReplacement.decision === 'approved', 'Replacement request decision recorded as approved');

    // Verify old device is now 'replaced' and new device is 'active'
    const [oldDevAfter] = await connection.query(
      'SELECT status FROM amc_covered_devices WHERE contract_id = ? AND device_id = ?',
      [contractComp1.id, createdDeviceIds[0]]
    );
    const [newDevAfter] = await connection.query(
      'SELECT status FROM amc_covered_devices WHERE contract_id = ? AND device_id = ?',
      [contractComp1.id, createdDeviceIds[4]]
    );
    assert(oldDevAfter[0].status === 'replaced', 'Old device status updated to replaced');
    assert(newDevAfter.length > 0 && newDevAfter[0].status === 'active', 'New replacement device coverage inserted as active');

    // Verify active covered count remains 4
    const capacityAfterReplacement = await amcService.checkContractCapacity(pool, contractComp1.id);
    assert(capacityAfterReplacement.coveredCount === 4, 'Active covered count remains strictly at 4 after device swap');

    // -------------------------------------------------------------------------
    // TEST GROUP 8: Admin Overview Statistics Accuracy
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 8] Admin Overview Metrics Accuracy');

    const overview = await amcService.getAdminOverview();
    assert(typeof overview.totalRequests === 'number' && overview.totalRequests >= 1, `Overview totalRequests = ${overview.totalRequests}`);
    assert(typeof overview.activeContracts === 'number' && overview.activeContracts >= 2, `Overview activeContracts = ${overview.activeContracts}`);
    assert(typeof overview.pendingReplacements === 'number', `Overview pendingReplacements = ${overview.pendingReplacements}`);

    // -------------------------------------------------------------------------
    // TEST GROUP 9: In-App Notification Dispatch
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 9] In-App Notification Dispatch');

    const [notifRows] = await connection.query(
      'SELECT * FROM notifications WHERE user_id = ? AND (title LIKE "%AMC%" OR message LIKE "%AMC%")',
      [testCompany1Id]
    );
    assert(notifRows.length > 0, `In-app notifications successfully dispatched to Company 1 (Found ${notifRows.length} notification records)`);

    // -------------------------------------------------------------------------
    // TEST GROUP 10: Explicit Contract Dates, Validation, Future Start & Idempotency
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 10] Explicit Contract Dates, Validation, Future Start & Idempotency');

    // Test 1: Contract creation rejects endDate < startDate
    let invalidCreationRejected = false;
    try {
      await amcService.createAmcContract({
        companyId: testCompany2Id,
        planId: testPlanId,
        planName: 'Phase 2 Premium Plan',
        deviceCapacity: 2,
        price: 20000,
        discountAmount: 0,
        taxAmount: 3600,
        totalAmount: 23600,
        startDate: '2027-06-01',
        endDate: '2027-05-31', // earlier than startDate
        createdBy: testAdminId,
      });
    } catch (err) {
      invalidCreationRejected = true;
      assert(err.message.includes('Contract end date cannot be earlier than start date'),
        'createAmcContract rejects endDate earlier than startDate');
    }
    assert(invalidCreationRejected, 'Creation validation prevented inverted date range');

    // Test 2: Contract creation persists explicit Admin startDate and endDate with separate offerValidUntil
    const futureContract = await amcService.createAmcContract({
      companyId: testCompany2Id,
      planId: testPlanId,
      planName: 'Phase 2 Premium Plan',
      deviceCapacity: 2,
      price: 20000,
      discountAmount: 0,
      taxAmount: 3600,
      totalAmount: 23600,
      startDate: '2027-06-01',
      endDate: '2028-05-31',
      offerValidUntil: '2027-05-15',
      createdBy: testAdminId,
    });
    createdContractIds.push(futureContract.id);
    assert(futureContract.id, `Future-dated contract created with ID ${futureContract.id}`);

    const [persistedFutureRows] = await connection.query(
      'SELECT start_date, end_date, offer_valid_until FROM amc_contracts WHERE id = ?',
      [futureContract.id]
    );
    const persistedStart = toDateStr(persistedFutureRows[0].start_date);
    const persistedEnd = toDateStr(persistedFutureRows[0].end_date);
    const persistedOffer = toDateStr(persistedFutureRows[0].offer_valid_until);
    assert(persistedStart === '2027-06-01', 'start_date persisted as 2027-06-01');
    assert(persistedEnd === '2028-05-31', 'end_date persisted as 2028-05-31');
    assert(persistedOffer === '2027-05-15', 'offer_valid_until persisted separately as 2027-05-15');

    // Company accepts offer
    await amcService.acceptAmcOffer({
      contractId: futureContract.id,
      companyId: testCompany2Id,
      userId: testCompany2Id,
    });

    // Test 3: approveAmcContract rejects explicit endDate < startDate
    let invalidApproveRejected = false;
    try {
      await amcService.approveAmcContract({
        contractId: futureContract.id,
        adminUserId: testAdminId,
        startDate: '2027-06-01',
        endDate: '2027-01-01',
      });
    } catch (err) {
      invalidApproveRejected = true;
      assert(err.message.includes('Contract end date cannot be earlier than start date'),
        'approveAmcContract rejects endDate earlier than startDate');
    }
    assert(invalidApproveRejected, 'Approval validation prevented inverted date override');

    // Test 4: approveAmcContract preserves pre-configured startDate and endDate when not overridden
    const futureApproved = await amcService.approveAmcContract({
      contractId: futureContract.id,
      adminUserId: testAdminId,
    });
    assert(futureApproved.approvalStatus === 'approved', 'Contract approved successfully');

    const [afterApproveRows] = await connection.query(
      'SELECT start_date, end_date FROM amc_contracts WHERE id = ?',
      [futureContract.id]
    );
    const approvedStart = toDateStr(afterApproveRows[0].start_date);
    const approvedEnd = toDateStr(afterApproveRows[0].end_date);
    assert(approvedStart === '2027-06-01' && approvedEnd === '2028-05-31',
      'Approval preserved existing explicit start_date and end_date without silent overwrite');

    // Test 5: Online payment verification preserves explicit dates and activates
    const futureOrder = await amcService.createContractPaymentOrder({
      contractId: futureContract.id,
      companyId: testCompany2Id,
      userId: testCompany2Id,
    });
    const futurePaymentId = `pay_future_${Date.now()}`;
    const futureSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(`${futureOrder.orderId}|${futurePaymentId}`)
      .digest('hex');

    const futurePaymentResult = await amcService.verifyContractPayment({
      contractId: futureContract.id,
      companyId: testCompany2Id,
      razorpayOrderId: futureOrder.orderId,
      razorpayPaymentId: futurePaymentId,
      razorpaySignature: futureSignature,
      userId: testCompany2Id,
    });
    assert(futurePaymentResult.paymentStatus === 'paid' && futurePaymentResult.status === 'active',
      'Contract status active and paymentStatus paid upon payment verification');
    if (futurePaymentResult.invoiceId) {
      createdInvoiceIds.push(futurePaymentResult.invoiceId);
    }

    const [afterPaymentRows] = await connection.query(
      'SELECT start_date, end_date FROM amc_contracts WHERE id = ?',
      [futureContract.id]
    );
    const paymentStart = toDateStr(afterPaymentRows[0].start_date);
    const paymentEnd = toDateStr(afterPaymentRows[0].end_date);
    assert(paymentStart === '2027-06-01' && paymentEnd === '2028-05-31',
      'Payment verification preserved explicit start_date and end_date without resetting to current date');

    // Test 6: Payment verification idempotency prevents duplicate invoices on repeat calls
    const replayPaymentResult = await amcService.verifyContractPayment({
      contractId: futureContract.id,
      companyId: testCompany2Id,
      razorpayOrderId: futureOrder.orderId,
      razorpayPaymentId: futurePaymentId,
      razorpaySignature: futureSignature,
      userId: testCompany2Id,
    });
    assert(replayPaymentResult.success === true, 'Replay payment verification handled gracefully');

    const [invoicesForFuture] = await connection.query(
      'SELECT COUNT(*) as invCount FROM invoices WHERE notes LIKE ?',
      [`%${futureContract.contractNumber || futureContract.id}%`]
    );
    assert(invoicesForFuture[0].invCount === 1,
      'Payment verification replay did not generate a duplicate commercial invoice');

    // Fleet device for Company 2
    const [devComp2] = await connection.query(`
      INSERT INTO company_devices (company_id, device_category, brand, model_number, serial_number, asset_id, is_amc, amc_tag, is_active, status)
      VALUES (?, 'Laptop', 'Lenovo', 'ThinkPad T14', 'SN-THINK-P2-099', 'TAG-THINK-099', 0, NULL, 1, 'active')
    `, [testCompany2Id]);
    createdDeviceIds.push(devComp2.insertId);

    // Test 7: Device assignment to future-dated contract synchronizes coverage dates
    await amcService.assignDevicesToCoverage(pool, {
      contractId: futureContract.id,
      companyId: testCompany2Id,
      deviceIds: [devComp2.insertId],
      userId: testCompany2Id,
    });

    const [covRows] = await connection.query(
      'SELECT coverage_start_date, coverage_end_date FROM amc_covered_devices WHERE contract_id = ? AND device_id = ?',
      [futureContract.id, devComp2.insertId]
    );
    const covStart = toDateStr(covRows[0].coverage_start_date);
    const covEnd = toDateStr(covRows[0].coverage_end_date);
    assert(covStart === '2027-06-01' && covEnd === '2028-05-31',
      'Covered device synchronized coverage_start_date and coverage_end_date from future contract');

    // Test 8: Future-dated contract repair eligibility lifecycle checks
    // 8a. At current date (today): Not eligible, diagnostic reason CONTRACT_NOT_STARTED
    const currentEligibility = await amcService.resolveDeviceAmcEligibility(pool, {
      companyId: testCompany2Id,
      deviceId: devComp2.insertId,
      repairDate: new Date(),
    });
    assert(currentEligibility.isEligible === false, 'Device is NOT eligible for AMC repair today because contract has not started');
    assert(currentEligibility.reason === 'CONTRACT_NOT_STARTED', `Diagnostic reason returned as CONTRACT_NOT_STARTED (got ${currentEligibility.reason})`);

    // 8b. At active date (2027-07-01): Eligible
    const futureEligibility = await amcService.resolveDeviceAmcEligibility(pool, {
      companyId: testCompany2Id,
      deviceId: devComp2.insertId,
      repairDate: '2027-07-01',
    });
    assert(futureEligibility.isEligible === true, 'Device IS eligible for AMC repair during contract active window (2027-07-01)');
    assert(futureEligibility.reason === null, 'Diagnostic reason is null during active coverage');

    // 8c. After contract end date (2028-06-15): Not eligible, diagnostic reason CONTRACT_EXPIRED
    const expiredEligibility = await amcService.resolveDeviceAmcEligibility(pool, {
      companyId: testCompany2Id,
      deviceId: devComp2.insertId,
      repairDate: '2028-06-15',
    });
    assert(expiredEligibility.isEligible === false, 'Device is NOT eligible for AMC repair after contract end date');
    assert(expiredEligibility.reason === 'CONTRACT_EXPIRED', `Diagnostic reason returned as CONTRACT_EXPIRED (got ${expiredEligibility.reason})`);

  } catch (error) {
    console.error('UNEXPECTED TEST EXCEPTION:', error);
    failedTests++;
  } finally {
    // -------------------------------------------------------------------------
    // TEARDOWN TEST FIXTURES
    // -------------------------------------------------------------------------
    console.log('\n[Teardown] Cleaning up Phase 2 test fixtures...');

    try {
      if (createdReplacementIds.length > 0) {
        await connection.query('DELETE FROM amc_device_replacements WHERE id IN (?)', [createdReplacementIds]);
      }
      if (createdContractIds.length > 0) {
        await connection.query('DELETE FROM amc_covered_devices WHERE contract_id IN (?)', [createdContractIds]);
        await connection.query('DELETE FROM amc_contract_history WHERE contract_id IN (?)', [createdContractIds]);
        await connection.query('DELETE FROM amc_contracts WHERE id IN (?)', [createdContractIds]);
      }
      if (createdRequestIds.length > 0) {
        await connection.query('DELETE FROM amc_requests WHERE id IN (?)', [createdRequestIds]);
      }
      if (createdDeviceIds.length > 0) {
        await connection.query('DELETE FROM company_devices WHERE id IN (?)', [createdDeviceIds]);
      }
      if (createdInvoiceIds.length > 0) {
        await connection.query('DELETE FROM invoice_line_items WHERE invoice_id IN (?)', [createdInvoiceIds]);
        await connection.query('DELETE FROM invoices WHERE id IN (?)', [createdInvoiceIds]);
      }
      if (testPlanId) {
        await connection.query('DELETE FROM amc_plans WHERE id = ?', [testPlanId]);
      }
      if (testCompany1Id || testCompany2Id) {
        const cIds = [testCompany1Id, testCompany2Id].filter(Boolean);
        await connection.query('DELETE FROM payments WHERE company_id IN (?)', [cIds]);
      }
      if (testCompany1Id) {
        await connection.query('DELETE FROM notifications WHERE user_id = ?', [testCompany1Id]);
        await connection.query('DELETE FROM users WHERE id = ?', [testCompany1Id]);
      }
      if (testCompany2Id) {
        await connection.query('DELETE FROM notifications WHERE user_id = ?', [testCompany2Id]);
        await connection.query('DELETE FROM users WHERE id = ?', [testCompany2Id]);
      }
      console.log('✓ Teardown complete. All Phase 2 test fixtures purged.\n');
    } catch (cleanupErr) {
      console.error('Teardown error:', cleanupErr);
    } finally {
      connection.release();
    }
  }

  console.log('===================================================================');
  console.log(`PHASE 2 TEST SUMMARY: Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('===================================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
