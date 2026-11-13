/**
 * Dedicated Verification Suite: Phase 4 — Admin AMC Dashboard & Lifecycle Safeguards
 *
 * Verifies:
 * 1. Full contract status transition matrix in updateContractStatus:
 *    - draft/offered -> active BLOCKED (protects Company acceptance step)
 *    - draft/offered -> suspended BLOCKED
 *    - draft/offered -> cancelled ALLOWED
 *    - accepted/suspended -> active ALLOWED ONLY when approved + paid + valid IST dates
 *    - active -> suspended / cancelled ALLOWED; active -> active BLOCKED (no-op)
 *    - rejected (status OR approval_status), expired, cancelled -> ALL transitions BLOCKED
 *    - past end_date or start_date > end_date -> active BLOCKED
 * 2. approveAmcContract preserves 'offered' status when unpaid (so Company can accept & pay),
 *    and blocks cancelled/expired/rejected contracts.
 * 3. Full Company lifecycle after pre-approval: offered (approved, unpaid) -> acceptAmcOffer ->
 *    initiateContractOfflinePayment -> verifyContractOfflinePayment('verified') -> active & paid.
 * 4. Offline payment association:
 *    - orderId recorded on OFFLINE_PAYMENT_INITIATED history and resolved cleanly without cross-contract pollution
 *      even when notes mention another contract number.
 *    - Ambiguous legacy pending payments fail closed (never arbitrarily pick one).
 * 5. Renewal request linking (REQ-RNW-... -> amc_contracts.request_id):
 *    - pending & under_review ALLOWED -> sets amc_contracts.request_id & amc_requests.status = 'offered' atomically
 *    - offered, rejected, cancelled REJECTED
 *    - Cross-company renewal request REJECTED
 *    - Mismatched previous_contract_id REJECTED
 *    - Duplicate & concurrent renewal submissions prevented via SELECT ... FOR UPDATE (exactly 1 wins)
 *    - Transaction rollback on DB failure leaves request status untouched ('pending')
 */

const assert = require('assert');
const { pool } = require('../config/db.config');
const amcService = require('../services/amc.service');

let passed = 0;
let failed = 0;

function check(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

async function expectThrows(fn, pattern, label) {
  let threw = false;
  let message = '';
  try {
    await fn();
  } catch (err) {
    threw = true;
    message = err?.message || String(err);
  }
  const matched = threw && (!pattern || pattern.test(message));
  if (matched) {
    console.log(`  ✓ ${label} ("${message}")`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label} (threw=${threw}, message="${message}")`);
    failed++;
  }
}

async function runTests() {
  console.log('=====================================================================');
  console.log('TEST SUITE: AMC Phase 4 — Admin Dashboard & Lifecycle Safeguards');
  console.log('=====================================================================\n');

  const ts = Date.now().toString().slice(-6);
  const compCodeA = `CMP-P4A${ts.slice(-3)}`;
  const compCodeB = `CMP-P4B${ts.slice(-3)}`;

  const createdUserIds = [];
  const createdContractIds = [];
  const createdRequestIds = [];
  const createdInvoiceIds = [];
  const createdPaymentOrderIds = [];
  const createdSequenceKeys = [`amc_contract_${compCodeA}`, `amc_contract_${compCodeB}`];

  try {
    // -------------------------------------------------------------------------
    // Setup Isolated Fixtures (2 Companies + 1 Admin)
    // -------------------------------------------------------------------------
    const [adminIns] = await pool.query(
      'INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, ?, 1)',
      ['Phase4 Admin', `p4_admin_${ts}@tekdoctor.in`, 'hash_p4', 'admin']
    );
    const adminId = adminIns.insertId;
    createdUserIds.push(adminId);

    const [compAIns] = await pool.query(
      'INSERT INTO users (name, email, password, role, company_id, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      ['Phase4 Corp A', `p4_compa_${ts}@tekdoctor.in`, 'hash_p4', 'company', compCodeA]
    );
    const compAId = compAIns.insertId;
    createdUserIds.push(compAId);
    await pool.query(
      'INSERT INTO company_profiles (user_id, company_id, company_name) VALUES (?, ?, ?)',
      [compAId, compCodeA, 'Phase4 Corp A']
    );

    const [compBIns] = await pool.query(
      'INSERT INTO users (name, email, password, role, company_id, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      ['Phase4 Corp B', `p4_compb_${ts}@tekdoctor.in`, 'hash_p4', 'company', compCodeB]
    );
    const compBId = compBIns.insertId;
    createdUserIds.push(compBId);
    await pool.query(
      'INSERT INTO company_profiles (user_id, company_id, company_name) VALUES (?, ?, ?)',
      [compBId, compCodeB, 'Phase4 Corp B']
    );

    const todayStr = amcService.getBusinessTodayStr();
    const nextYearStr = amcService.addDaysOnly(todayStr, 365);
    const yesterdayStr = amcService.addDaysOnly(todayStr, -1);
    const prevYearStr = amcService.addDaysOnly(todayStr, -365);

    // Helper to seed contracts quickly
    const seedContract = async ({
      companyId = compAId,
      status = 'offered',
      approvalStatus = 'pending_approval',
      paymentStatus = 'unpaid',
      startDate = todayStr,
      endDate = nextYearStr
    } = {}) => {
      const created = await amcService.createAmcContract({
        companyId,
        planName: 'Phase 4 Matrix Plan',
        deviceCapacity: 5,
        price: 10000,
        taxAmount: 1800,
        totalAmount: 11800,
        startDate,
        endDate,
        createdBy: adminId
      });
      createdContractIds.push(created.id);
      if (status !== 'offered' || approvalStatus !== 'pending_approval' || paymentStatus !== 'unpaid') {
        await pool.query(
          'UPDATE amc_contracts SET status = ?, approval_status = ?, payment_status = ? WHERE id = ?',
          [status, approvalStatus, paymentStatus, created.id]
        );
      }
      return created;
    };

    // =========================================================================
    // GROUP 1: Full Contract Status Transition Matrix
    // =========================================================================
    console.log('[Group 1] Contract Status Transition Matrix Guards');

    const cDraft = await seedContract({ status: 'draft', approvalStatus: 'approved', paymentStatus: 'paid' });
    await expectThrows(
      () => amcService.updateContractStatus({ contractId: cDraft.id, adminUserId: adminId, status: 'active', reason: 'bypass' }),
      /Company acceptance is required/i,
      'draft -> active blocked even if approved & paid'
    );
    await expectThrows(
      () => amcService.updateContractStatus({ contractId: cDraft.id, adminUserId: adminId, status: 'suspended', reason: 'invalid' }),
      /Only active contracts can be suspended/i,
      'draft -> suspended blocked'
    );
    const cancelDraftRes = await amcService.updateContractStatus({ contractId: cDraft.id, adminUserId: adminId, status: 'cancelled', reason: 'Withdrawn' });
    check(cancelDraftRes.status === 'cancelled', 'draft -> cancelled allowed');

    const cOffered = await seedContract({ status: 'offered', approvalStatus: 'approved', paymentStatus: 'paid' });
    await expectThrows(
      () => amcService.updateContractStatus({ contractId: cOffered.id, adminUserId: adminId, status: 'active', reason: 'bypass' }),
      /Company acceptance is required/i,
      'offered -> active blocked even if approved & paid'
    );
    await expectThrows(
      () => amcService.updateContractStatus({ contractId: cOffered.id, adminUserId: adminId, status: 'suspended', reason: 'invalid' }),
      /Only active contracts can be suspended/i,
      'offered -> suspended blocked'
    );
    const cancelOfferedRes = await amcService.updateContractStatus({ contractId: cOffered.id, adminUserId: adminId, status: 'cancelled', reason: 'Withdrawn offer' });
    check(cancelOfferedRes.status === 'cancelled', 'offered -> cancelled allowed');

    const cAcceptedUnapproved = await seedContract({ status: 'accepted', approvalStatus: 'pending_approval', paymentStatus: 'paid' });
    await expectThrows(
      () => amcService.updateContractStatus({ contractId: cAcceptedUnapproved.id, adminUserId: adminId, status: 'active', reason: 'unapproved' }),
      /approved by admin/i,
      'accepted -> active blocked when unapproved'
    );

    const cAcceptedUnpaid = await seedContract({ status: 'accepted', approvalStatus: 'approved', paymentStatus: 'unpaid' });
    await expectThrows(
      () => amcService.updateContractStatus({ contractId: cAcceptedUnpaid.id, adminUserId: adminId, status: 'active', reason: 'unpaid' }),
      /must be paid/i,
      'accepted -> active blocked when unpaid'
    );
    await expectThrows(
      () => amcService.updateContractStatus({ contractId: cAcceptedUnpaid.id, adminUserId: adminId, status: 'suspended', reason: 'not active' }),
      /Only active contracts/i,
      'accepted -> suspended blocked'
    );

    const cAcceptedPastEnd = await seedContract({ status: 'accepted', approvalStatus: 'approved', paymentStatus: 'paid', startDate: prevYearStr, endDate: yesterdayStr });
    await expectThrows(
      () => amcService.updateContractStatus({ contractId: cAcceptedPastEnd.id, adminUserId: adminId, status: 'active', reason: 'past date' }),
      /earlier than today/i,
      'accepted -> active blocked when end_date < IST today'
    );

    const cAcceptedBadRange = await seedContract({ status: 'accepted', approvalStatus: 'approved', paymentStatus: 'paid', startDate: todayStr, endDate: nextYearStr });
    await pool.query('UPDATE amc_contracts SET start_date = ?, end_date = ? WHERE id = ?', [nextYearStr, todayStr, cAcceptedBadRange.id]);
    await expectThrows(
      () => amcService.updateContractStatus({ contractId: cAcceptedBadRange.id, adminUserId: adminId, status: 'active', reason: 'inverted dates' }),
      /start date cannot exceed end date/i,
      'accepted -> active blocked when start_date > end_date'
    );

    const cAcceptedReady = await seedContract({ status: 'accepted', approvalStatus: 'approved', paymentStatus: 'paid' });
    const actFromAccepted = await amcService.updateContractStatus({ contractId: cAcceptedReady.id, adminUserId: adminId, status: 'active', reason: 'All prerequisites met' });
    check(actFromAccepted.status === 'active', 'accepted -> active allowed when approved, paid, and valid dates');

    await expectThrows(
      () => amcService.updateContractStatus({ contractId: cAcceptedReady.id, adminUserId: adminId, status: 'active', reason: 'redundant' }),
      /already in "active" status/i,
      'active -> active blocked as no-op'
    );

    const suspRes = await amcService.updateContractStatus({ contractId: cAcceptedReady.id, adminUserId: adminId, status: 'suspended', reason: 'Billing hold' });
    check(suspRes.status === 'suspended', 'active -> suspended allowed');

    const reactivateRes = await amcService.updateContractStatus({ contractId: cAcceptedReady.id, adminUserId: adminId, status: 'active', reason: 'Hold cleared' });
    check(reactivateRes.status === 'active', 'suspended -> active allowed when approved, paid, and valid dates');

    const cancelActiveRes = await amcService.updateContractStatus({ contractId: cAcceptedReady.id, adminUserId: adminId, status: 'cancelled', reason: 'Terminated' });
    check(cancelActiveRes.status === 'cancelled', 'active -> cancelled allowed');

    const cSuspended = await seedContract({ status: 'suspended', approvalStatus: 'approved', paymentStatus: 'paid' });
    const cancelSuspendedRes = await amcService.updateContractStatus({ contractId: cSuspended.id, adminUserId: adminId, status: 'cancelled', reason: 'Closed during suspension' });
    check(cancelSuspendedRes.status === 'cancelled', 'suspended -> cancelled allowed');

    const cSuspendedUnpaid = await seedContract({ status: 'suspended', approvalStatus: 'approved', paymentStatus: 'unpaid' });
    await expectThrows(
      () => amcService.updateContractStatus({ contractId: cSuspendedUnpaid.id, adminUserId: adminId, status: 'active', reason: 'unpaid' }),
      /must be paid/i,
      'suspended -> active blocked when payment_status != paid'
    );

    // Terminal states: rejected (status OR approval_status), expired, cancelled
    const cRejected = await seedContract({ status: 'rejected', approvalStatus: 'rejected', paymentStatus: 'unpaid' });
    const cApprovalRejectedOnly = await seedContract({ status: 'offered', approvalStatus: 'rejected', paymentStatus: 'paid' });
    const cExpired = await seedContract({ status: 'expired', approvalStatus: 'approved', paymentStatus: 'paid' });

    for (const target of ['active', 'suspended', 'cancelled']) {
      await expectThrows(
        () => amcService.updateContractStatus({ contractId: cRejected.id, adminUserId: adminId, status: target, reason: 'blocked' }),
        /rejected contract/i,
        `rejected -> ${target} blocked`
      );
      await expectThrows(
        () => amcService.updateContractStatus({ contractId: cApprovalRejectedOnly.id, adminUserId: adminId, status: target, reason: 'blocked' }),
        /rejected contract/i,
        `approval_status=rejected -> ${target} blocked`
      );
      await expectThrows(
        () => amcService.updateContractStatus({ contractId: cExpired.id, adminUserId: adminId, status: target, reason: 'blocked' }),
        /expired contract/i,
        `expired -> ${target} blocked`
      );
      await expectThrows(
        () => amcService.updateContractStatus({ contractId: cDraft.id, adminUserId: adminId, status: target, reason: 'blocked' }),
        /cancelled contract/i,
        `cancelled -> ${target} blocked`
      );
    }

    // =========================================================================
    // GROUP 2: approveAmcContract Offered Preservation + Full Lifecycle
    // =========================================================================
    console.log('\n[Group 2] Offered Preservation on Admin Approval & Full Lifecycle');

    await expectThrows(
      () => amcService.approveAmcContract({ contractId: cExpired.id, adminUserId: adminId }),
      /Cannot approve a expired contract/i,
      'approveAmcContract blocks expired contract'
    );
    await expectThrows(
      () => amcService.approveAmcContract({ contractId: cDraft.id, adminUserId: adminId }),
      /Cannot approve a cancelled contract/i,
      'approveAmcContract blocks cancelled contract'
    );

    const cLifecycle = await seedContract({ status: 'offered', approvalStatus: 'pending_approval', paymentStatus: 'unpaid' });
    const approvedOffered = await amcService.approveAmcContract({ contractId: cLifecycle.id, adminUserId: adminId });
    check(
      approvedOffered.approvalStatus === 'approved' && approvedOffered.status === 'offered',
      'approveAmcContract sets approval_status="approved" while preserving status="offered" (not draft)'
    );

    const acceptedByComp = await amcService.acceptAmcOffer({
      contractId: cLifecycle.id,
      companyId: compAId,
      userId: compAId
    });
    check(acceptedByComp.status === 'accepted', 'Company successfully calls acceptAmcOffer after Admin pre-approval');

    // Seed a second unpaid accepted contract with a pending offline payment for same company to test cross-contract isolation
    const cPeerOffline = await seedContract({ status: 'accepted', approvalStatus: 'approved', paymentStatus: 'unpaid' });
    await amcService.initiateContractOfflinePayment({
      contractId: cPeerOffline.id,
      companyId: compAId,
      paymentMethod: 'cheque',
      referenceNumber: `CHQ-PEER-${ts}`,
      notes: 'Separate peer contract payment',
      userId: compAId
    });
    const peerDetailsBefore = await amcService.getContractDetails(cPeerOffline.id);
    if (peerDetailsBefore.offlinePayment?.orderId) {
      createdPaymentOrderIds.push(peerDetailsBefore.offlinePayment.orderId);
    }

    const offInit = await amcService.initiateContractOfflinePayment({
      contractId: cLifecycle.id,
      companyId: compAId,
      paymentMethod: 'neft',
      referenceNumber: `UTR-P4-${ts}`,
      notes: `Cross-mention test ${cPeerOffline.contractNumber}`,
      userId: compAId
    });
    check(offInit.paymentStatus === 'pending_verification', 'Company initiated offline payment');

    const detailsBeforeVerify = await amcService.getContractDetails(cLifecycle.id);
    check(
      detailsBeforeVerify.offlinePayment &&
      detailsBeforeVerify.offlinePayment.paymentMethod === 'neft' &&
      detailsBeforeVerify.offlinePayment.referenceNumber === `UTR-P4-${ts}` &&
      detailsBeforeVerify.offlinePayment.orderId &&
      detailsBeforeVerify.offlinePayment.notes === `Cross-mention test ${cPeerOffline.contractNumber}`,
      'getContractDetails exposes exact offlinePayment metadata (method, UTR, orderId, notes)'
    );
    if (detailsBeforeVerify.offlinePayment?.orderId) {
      createdPaymentOrderIds.push(detailsBeforeVerify.offlinePayment.orderId);
    }

    const verifiedOffline = await amcService.verifyContractOfflinePayment({
      contractId: cLifecycle.id,
      adminUserId: adminId,
      decision: 'verified',
      adminNotes: 'Verified bank UTR'
    });
    if (verifiedOffline.invoiceId) createdInvoiceIds.push(verifiedOffline.invoiceId);
    check(
      verifiedOffline.paymentStatus === 'paid' && verifiedOffline.status === 'active',
      'verifyContractOfflinePayment transitions pre-approved accepted contract to active & paid'
    );

    // Ensure peer pending payment row was NOT touched even though cLifecycle's notes mentioned cPeerOffline.contractNumber
    const [peerPayRow] = await pool.query('SELECT status FROM payments WHERE order_id = ?', [peerDetailsBefore.offlinePayment.orderId]);
    check(
      peerPayRow.length === 1 && peerPayRow[0].status === 'pending_verification',
      'Cross-contract mention in notes did not pollute or verify peer contract payment row'
    );

    // =========================================================================
    // GROUP 3: Ambiguous Legacy Offline Payments Fail Closed
    // =========================================================================
    console.log('\n[Group 3] Legacy Offline Payment Ambiguity Fail-Closed');

    const cLegacyAmbiguous = await seedContract({ status: 'accepted', approvalStatus: 'approved', paymentStatus: 'pending_verification' });
    const legOrder1 = `offline_amc_leg1_${ts}`;
    const legOrder2 = `offline_amc_leg2_${ts}`;
    createdPaymentOrderIds.push(legOrder1, legOrder2);

    await pool.query(
      `INSERT INTO payments (order_id, user_id, company_id, amount, currency, payment_method, status, gateway, reference_note)
       VALUES (?, ?, ?, 11800, 'INR', 'bank_transfer', 'pending_verification', 'offline', ?),
              (?, ?, ?, 11800, 'INR', 'cheque', 'pending_verification', 'offline', ?)`,
      [
        legOrder1, compAId, compAId, `AMC Ref: LEG-1. Contract: ${cLegacyAmbiguous.contractNumber}. First attempt`,
        legOrder2, compAId, compAId, `AMC Ref: LEG-2. Contract: ${cLegacyAmbiguous.contractNumber}. Duplicate attempt`
      ]
    );

    const ambigDetails = await amcService.getContractDetails(cLegacyAmbiguous.id);
    check(
      ambigDetails.offlinePayment && ambigDetails.offlinePayment.ambiguous === true && ambigDetails.offlinePayment.pendingCount === 2,
      'getContractDetails surfaces ambiguity flag when multiple legacy pending payments match contract'
    );

    await expectThrows(
      () => amcService.verifyContractOfflinePayment({
        contractId: cLegacyAmbiguous.id,
        adminUserId: adminId,
        decision: 'verified',
        adminNotes: 'Should fail closed'
      }),
      /Ambiguous legacy pending offline payments/i,
      'verifyContractOfflinePayment fails closed on multiple matching legacy pending payments'
    );

    // =========================================================================
    // GROUP 4: Renewal Request Linking, Eligibility, Rollback & Concurrency
    // =========================================================================
    console.log('\n[Group 4] Renewal Request Linking, Eligibility & Concurrency');

    const cSource = await seedContract({
      companyId: compAId,
      status: 'active',
      approvalStatus: 'approved',
      paymentStatus: 'paid',
      startDate: amcService.addDaysOnly(todayStr, -300),
      endDate: amcService.addDaysOnly(todayStr, 65)
    });

    const rnwReq = await amcService.requestAmcRenewal({
      contractId: cSource.id,
      companyId: compAId,
      requestedCapacity: 4,
      notes: 'Phase 4 renewal request test',
      userId: compAId
    });
    createdRequestIds.push(rnwReq.requestId);
    check(/^REQ-RNW-[A-Z0-9]+-\d{3}$/.test(rnwReq.requestNumber), `Created renewal request ${rnwReq.requestNumber}`);

    // Disallowed company cross-tenant call
    await expectThrows(
      () => amcService.createAmcRenewalContract({
        previousContractId: cSource.id,
        requestId: rnwReq.requestId,
        companyId: compBId,
        createdBy: adminId
      }),
      /does not match previous contract company/i,
      'Cross-company renewal request rejected'
    );

    // Cross-company contract mismatch when previous contract belongs to B but request belongs to A
    const cOtherCompanyPrev = await seedContract({ companyId: compBId, status: 'active', approvalStatus: 'approved', paymentStatus: 'paid' });
    await expectThrows(
      () => amcService.createAmcRenewalContract({
        previousContractId: cOtherCompanyPrev.id,
        requestId: rnwReq.requestId,
        createdBy: adminId
      }),
      /does not belong to target company/i,
      'Request from Company A blocked when renewing Company B contract'
    );

    // Same-company wrong previous_contract_id rejected
    const cWrongPrevSameComp = await seedContract({ companyId: compAId, status: 'active', approvalStatus: 'approved', paymentStatus: 'paid' });
    await expectThrows(
      () => amcService.createAmcRenewalContract({
        previousContractId: cWrongPrevSameComp.id,
        requestId: rnwReq.requestId,
        createdBy: adminId
      }),
      /linked to a different previous contract/i,
      'Mismatched previous_contract_id rejected'
    );

    // Transaction rollback check: inject failure on history insert during renewal creation -> request MUST remain 'pending'
    const realGetConnection = pool.getConnection.bind(pool);
    let failHistoryOnce = true;
    pool.getConnection = async () => {
      const conn = await realGetConnection();
      const realQuery = conn.query.bind(conn);
      conn.query = async (sql, params) => {
        if (failHistoryOnce && typeof sql === 'string' && sql.includes('RENEWAL_CONTRACT_CREATED')) {
          failHistoryOnce = false;
          throw new Error('Injected rollback test error after request status update');
        }
        return realQuery(sql, params);
      };
      return conn;
    };

    try {
      await expectThrows(
        () => amcService.createAmcRenewalContract({
          previousContractId: cSource.id,
          requestId: rnwReq.requestId,
          deviceCapacity: 4,
          price: 9000,
          totalAmount: 10620,
          createdBy: adminId
        }),
        /Injected rollback test error/i,
        'Failure inside renewal transaction throws and rolls back'
      );
    } finally {
      pool.getConnection = realGetConnection;
    }

    const [afterRollbackReq] = await pool.query('SELECT status FROM amc_requests WHERE id = ?', [rnwReq.requestId]);
    check(afterRollbackReq[0].status === 'pending', 'Transaction rollback preserved request status="pending"');
    const [afterRollbackContract] = await pool.query('SELECT id FROM amc_contracts WHERE request_id = ?', [rnwReq.requestId]);
    check(afterRollbackContract.length === 0, 'Transaction rollback left 0 renewal contracts linked to request');

    // Concurrent renewal submissions for the same pending request -> exactly 1 succeeds, 1 fails
    const concurrentResults = await Promise.allSettled([
      amcService.createAmcRenewalContract({
        previousContractId: cSource.id,
        requestId: rnwReq.requestId,
        deviceCapacity: 4,
        price: 9000,
        totalAmount: 10620,
        createdBy: adminId
      }),
      amcService.createAmcRenewalContract({
        previousContractId: cSource.id,
        requestId: rnwReq.requestId,
        deviceCapacity: 4,
        price: 9000,
        totalAmount: 10620,
        createdBy: adminId
      })
    ]);

    const fulfilled = concurrentResults.filter(r => r.status === 'fulfilled');
    const rejectedConcurrent = concurrentResults.filter(r => r.status === 'rejected');
    for (const r of fulfilled) createdContractIds.push(r.value.id);

    check(
      fulfilled.length === 1 && rejectedConcurrent.length === 1,
      `Concurrent renewal submission serialized cleanly (${fulfilled.length} succeeded, ${rejectedConcurrent.length} blocked)`
    );

    const [linkedContracts] = await pool.query('SELECT id, request_id, contract_type, is_renewal FROM amc_contracts WHERE request_id = ?', [rnwReq.requestId]);
    const [updatedReq] = await pool.query('SELECT status, reviewed_by FROM amc_requests WHERE id = ?', [rnwReq.requestId]);
    check(
      linkedContracts.length === 1 &&
      linkedContracts[0].request_id === rnwReq.requestId &&
      linkedContracts[0].contract_type === 'renewal' &&
      linkedContracts[0].is_renewal === 1 &&
      updatedReq[0].status === 'offered' &&
      updatedReq[0].reviewed_by === adminId,
      'Renewal contract linked via request_id and request updated atomically to status="offered"'
    );

    // Subsequent duplicate attempt against now-offered request blocked
    await expectThrows(
      () => amcService.createAmcRenewalContract({
        previousContractId: cSource.id,
        requestId: rnwReq.requestId,
        deviceCapacity: 4,
        price: 9000,
        totalAmount: 10620,
        createdBy: adminId
      }),
      /status "offered"|already been created/i,
      'Duplicate renewal attempt on offered request rejected'
    );

    // Disallowed statuses (rejected / cancelled) & valid under_review status
    const seedManualRnwReq = async (status) => {
      const reqNum = `REQ-RNW-P4-${status.toUpperCase()}-${ts}`;
      const [ins] = await pool.query(
        `INSERT INTO amc_requests (request_number, company_id, requested_device_count, status, previous_contract_id)
         VALUES (?, ?, 3, ?, ?)`,
        [reqNum, compAId, status, cWrongPrevSameComp.id]
      );
      createdRequestIds.push(ins.insertId);
      return ins.insertId;
    };

    const reqRejectedId = await seedManualRnwReq('rejected');
    const reqCancelledId = await seedManualRnwReq('cancelled');
    const reqUnderReviewId = await seedManualRnwReq('under_review');

    await expectThrows(
      () => amcService.createAmcRenewalContract({ previousContractId: cWrongPrevSameComp.id, requestId: reqRejectedId, createdBy: adminId }),
      /status "rejected"/i,
      'Renewal blocked for request in status="rejected"'
    );
    await expectThrows(
      () => amcService.createAmcRenewalContract({ previousContractId: cWrongPrevSameComp.id, requestId: reqCancelledId, createdBy: adminId }),
      /status "cancelled"/i,
      'Renewal blocked for request in status="cancelled"'
    );

    const rnwFromUnderReview = await amcService.createAmcRenewalContract({
      previousContractId: cWrongPrevSameComp.id,
      requestId: reqUnderReviewId,
      deviceCapacity: 3,
      price: 8000,
      totalAmount: 9440,
      createdBy: adminId
    });
    createdContractIds.push(rnwFromUnderReview.id);
    const [urReqCheck] = await pool.query('SELECT status FROM amc_requests WHERE id = ?', [reqUnderReviewId]);
    check(
      rnwFromUnderReview.requestId === reqUnderReviewId && urReqCheck[0].status === 'offered',
      'Renewal allowed from request status="under_review" and transitions request to "offered"'
    );

    // =========================================================================
    // GROUP 5: Offline Payment Safeguards, Rollback & Attempt Superseding
    // =========================================================================
    console.log('\n[Group 5] Offline Payment Safeguards, Rollback & Superseding');

    // 5a. Cancelled contract blocked even if payment_status='pending_verification' with valid payment row
    const cCancelledPay = await seedContract({ status: 'accepted', approvalStatus: 'approved', paymentStatus: 'unpaid' });
    await amcService.initiateContractOfflinePayment({
      contractId: cCancelledPay.id,
      companyId: compAId,
      paymentMethod: 'neft',
      referenceNumber: `UTR-CANC-${ts}`,
      notes: 'Cancel guard test',
      userId: compAId
    });
    const cancPayDetails = await amcService.getContractDetails(cCancelledPay.id);
    if (cancPayDetails.offlinePayment?.orderId) createdPaymentOrderIds.push(cancPayDetails.offlinePayment.orderId);
    await pool.query("UPDATE amc_contracts SET status = 'cancelled' WHERE id = ?", [cCancelledPay.id]);

    await expectThrows(
      () => amcService.verifyContractOfflinePayment({
        contractId: cCancelledPay.id,
        adminUserId: adminId,
        decision: 'verified',
        adminNotes: 'Should reject cancelled contract'
      }),
      /cancelled/i,
      'verifyContractOfflinePayment blocks cancelled contract'
    );
    const [cancContractAfter] = await pool.query('SELECT status, payment_status, invoice_id FROM amc_contracts WHERE id = ?', [cCancelledPay.id]);
    const [cancPayAfter] = await pool.query('SELECT status FROM payments WHERE order_id = ?', [cancPayDetails.offlinePayment.orderId]);
    check(
      cancContractAfter[0].status === 'cancelled' &&
      cancContractAfter[0].payment_status === 'pending_verification' &&
      cancContractAfter[0].invoice_id === null &&
      cancPayAfter[0].status === 'pending_verification',
      'Blocked verification on cancelled contract leaves contract, invoice_id, and payment untouched'
    );

    // 5b. Expired contract blocked even if payment_status='pending_verification' with valid payment row
    const cExpiredPay = await seedContract({ status: 'accepted', approvalStatus: 'approved', paymentStatus: 'unpaid' });
    await amcService.initiateContractOfflinePayment({
      contractId: cExpiredPay.id,
      companyId: compAId,
      paymentMethod: 'neft',
      referenceNumber: `UTR-EXP-${ts}`,
      notes: 'Expired guard test',
      userId: compAId
    });
    const expPayDetails = await amcService.getContractDetails(cExpiredPay.id);
    if (expPayDetails.offlinePayment?.orderId) createdPaymentOrderIds.push(expPayDetails.offlinePayment.orderId);
    await pool.query("UPDATE amc_contracts SET status = 'expired' WHERE id = ?", [cExpiredPay.id]);

    await expectThrows(
      () => amcService.verifyContractOfflinePayment({
        contractId: cExpiredPay.id,
        adminUserId: adminId,
        decision: 'verified',
        adminNotes: 'Should reject expired contract'
      }),
      /expired/i,
      'verifyContractOfflinePayment blocks expired contract'
    );
    const [expPayAfter] = await pool.query('SELECT status FROM payments WHERE order_id = ?', [expPayDetails.offlinePayment.orderId]);
    check(expPayAfter[0].status === 'pending_verification', 'Blocked verification on expired contract leaves payment row untouched');

    // 5c. Non-pending_verification contract blocked
    const cUnpaidPay = await seedContract({ status: 'accepted', approvalStatus: 'approved', paymentStatus: 'unpaid' });
    await expectThrows(
      () => amcService.verifyContractOfflinePayment({
        contractId: cUnpaidPay.id,
        adminUserId: adminId,
        decision: 'verified',
        adminNotes: 'Should reject unpaid contract'
      }),
      /pending_verification|pending verification|payment status/i,
      'verifyContractOfflinePayment blocks contract when payment_status != pending_verification'
    );

    // 5d. Missing pending payments record fails closed (no phantom activation or invoice)
    const cMissingPayRow = await seedContract({ status: 'accepted', approvalStatus: 'approved', paymentStatus: 'pending_verification' });
    const [invBeforeMissing] = await pool.query('SELECT COUNT(*) AS cnt FROM invoices');
    await expectThrows(
      () => amcService.verifyContractOfflinePayment({
        contractId: cMissingPayRow.id,
        adminUserId: adminId,
        decision: 'verified',
        adminNotes: 'Should fail when payments row missing'
      }),
      /offline payment|payment record|not found/i,
      'verifyContractOfflinePayment fails closed when pending payments record is missing'
    );
    const [invAfterMissing] = await pool.query('SELECT COUNT(*) AS cnt FROM invoices');
    const [missingContractAfter] = await pool.query('SELECT status, payment_status, invoice_id FROM amc_contracts WHERE id = ?', [cMissingPayRow.id]);
    check(
      invBeforeMissing[0].cnt === invAfterMissing[0].cnt &&
      missingContractAfter[0].payment_status === 'pending_verification' &&
      missingContractAfter[0].invoice_id === null,
      'Missing payment record creates zero invoices and keeps contract unaltered'
    );

    // 5e. Transaction rollback when post-update history insert fails inside verifyContractOfflinePayment
    const cRollback = await seedContract({ status: 'accepted', approvalStatus: 'approved', paymentStatus: 'unpaid' });
    await amcService.initiateContractOfflinePayment({
      contractId: cRollback.id,
      companyId: compAId,
      paymentMethod: 'rtgs',
      referenceNumber: `UTR-RBK-${ts}`,
      notes: 'Rollback verification test',
      userId: compAId
    });
    const rbkDetails = await amcService.getContractDetails(cRollback.id);
    if (rbkDetails.offlinePayment?.orderId) createdPaymentOrderIds.push(rbkDetails.offlinePayment.orderId);

    const [invBeforeRbk] = await pool.query('SELECT COUNT(*) AS cnt FROM invoices');
    const origGetConn = pool.getConnection.bind(pool);
    pool.getConnection = async () => {
      const conn = await origGetConn();
      const wrapSql = (origFn) => {
        if (typeof origFn !== 'function') return origFn;
        return async function wrappedQuery(sql, params) {
          const isHistInsert =
            typeof sql === 'string' &&
            sql.includes('amc_contract_history') &&
            (sql.includes('OFFLINE_PAYMENT_VERIFIED') || (Array.isArray(params) && params.includes('OFFLINE_PAYMENT_VERIFIED')));
          if (isHistInsert) {
            throw new Error('Injected rollback error on OFFLINE_PAYMENT_VERIFIED');
          }
          return origFn.call(this, sql, params);
        };
      };
      conn.query = wrapSql(conn.query);
      conn.execute = wrapSql(conn.execute);
      return conn;
    };

    try {
      await expectThrows(
        () => amcService.verifyContractOfflinePayment({
          contractId: cRollback.id,
          adminUserId: adminId,
          decision: 'verified',
          adminNotes: 'Should roll back on history insert failure'
        }),
        /Injected rollback error/i,
        'verifyContractOfflinePayment surfaces mid-transaction error'
      );
    } finally {
      pool.getConnection = origGetConn;
    }

    const [invAfterRbk] = await pool.query('SELECT COUNT(*) AS cnt FROM invoices');
    const [rbkContractAfter] = await pool.query('SELECT status, payment_status, invoice_id FROM amc_contracts WHERE id = ?', [cRollback.id]);
    const [rbkPayAfter] = await pool.query('SELECT status FROM payments WHERE order_id = ?', [rbkDetails.offlinePayment.orderId]);
    check(
      invBeforeRbk[0].cnt === invAfterRbk[0].cnt &&
      rbkContractAfter[0].status === 'accepted' &&
      rbkContractAfter[0].payment_status === 'pending_verification' &&
      rbkContractAfter[0].invoice_id === null &&
      rbkPayAfter[0].status === 'pending_verification',
      'verifyContractOfflinePayment rolls back payment status, invoice, and contract state atomically'
    );

    // 5f. Repeated offline payment attempts: verifying latest attempt supersedes prior stale attempt
    const cRepeat = await seedContract({ status: 'accepted', approvalStatus: 'approved', paymentStatus: 'unpaid' });
    await amcService.initiateContractOfflinePayment({
      contractId: cRepeat.id,
      companyId: compAId,
      paymentMethod: 'neft',
      referenceNumber: `UTR-ATT1-${ts}`,
      notes: 'Attempt 1',
      userId: compAId
    });
    const repDet1 = await amcService.getContractDetails(cRepeat.id);
    if (repDet1.offlinePayment?.orderId) createdPaymentOrderIds.push(repDet1.offlinePayment.orderId);

    // Small tick so attempt 2 has a strictly newer created_at/id
    await new Promise((r) => setTimeout(r, 50));
    await amcService.initiateContractOfflinePayment({
      contractId: cRepeat.id,
      companyId: compAId,
      paymentMethod: 'rtgs',
      referenceNumber: `UTR-ATT2-${ts}`,
      notes: 'Attempt 2',
      userId: compAId
    });
    const repDet2 = await amcService.getContractDetails(cRepeat.id);
    if (repDet2.offlinePayment?.orderId) createdPaymentOrderIds.push(repDet2.offlinePayment.orderId);

    check(
      repDet1.offlinePayment?.orderId &&
      repDet2.offlinePayment?.orderId &&
      repDet1.offlinePayment.orderId !== repDet2.offlinePayment.orderId,
      'Repeated offline payment attempts yield distinct orderIds'
    );

    const repeatVerified = await amcService.verifyContractOfflinePayment({
      contractId: cRepeat.id,
      adminUserId: adminId,
      decision: 'verified',
      adminNotes: 'Verified latest attempt'
    });
    if (repeatVerified.invoiceId) createdInvoiceIds.push(repeatVerified.invoiceId);

    const [att1Row] = await pool.query('SELECT status FROM payments WHERE order_id = ?', [repDet1.offlinePayment.orderId]);
    const [att2Row] = await pool.query('SELECT status FROM payments WHERE order_id = ?', [repDet2.offlinePayment.orderId]);
    check(
      repeatVerified.status === 'active' &&
      repeatVerified.paymentStatus === 'paid' &&
      att2Row[0].status === 'paid' &&
      att1Row[0].status === 'cancelled',
      'Verifying latest offline payment marks latest attempt paid and supersedes prior pending attempt'
    );

    // 5g. updateContractStatus transaction rollback on mid-transaction history failure
    const cStatusRbk = await seedContract({ status: 'active', approvalStatus: 'approved', paymentStatus: 'paid' });
    pool.getConnection = async () => {
      const conn = await origGetConn();
      const wrapSql = (origFn) => {
        if (typeof origFn !== 'function') return origFn;
        return async function wrappedQuery(sql, params) {
          const isStatusHist =
            typeof sql === 'string' &&
            sql.includes('amc_contract_history') &&
            (sql.includes('CONTRACT_SUSPENDED') || (Array.isArray(params) && params.includes('CONTRACT_SUSPENDED')));
          if (isStatusHist) {
            throw new Error('Injected rollback error on CONTRACT_SUSPENDED');
          }
          return origFn.call(this, sql, params);
        };
      };
      conn.query = wrapSql(conn.query);
      conn.execute = wrapSql(conn.execute);
      return conn;
    };
    try {
      await expectThrows(
        () => amcService.updateContractStatus({
          contractId: cStatusRbk.id,
          adminUserId: adminId,
          status: 'suspended',
          reason: 'Should roll back'
        }),
        /Injected rollback error/i,
        'updateContractStatus surfaces mid-transaction error'
      );
    } finally {
      pool.getConnection = origGetConn;
    }
    const [statusRbkRow] = await pool.query('SELECT status FROM amc_contracts WHERE id = ?', [cStatusRbk.id]);
    check(statusRbkRow[0].status === 'active', 'updateContractStatus rolls back status change on mid-transaction failure');
  } finally {
    // Self-contained isolated cleanup
    try {
      if (createdContractIds.length > 0) {
        await pool.query('DELETE FROM amc_contract_history WHERE contract_id IN (?)', [createdContractIds]);
        await pool.query('DELETE FROM amc_covered_devices WHERE contract_id IN (?)', [createdContractIds]);
        await pool.query('DELETE FROM amc_contracts WHERE id IN (?)', [createdContractIds]);
      }
      if (createdRequestIds.length > 0) {
        await pool.query('DELETE FROM amc_requests WHERE id IN (?)', [createdRequestIds]);
      }
      if (createdPaymentOrderIds.length > 0) {
        await pool.query('DELETE FROM payments WHERE order_id IN (?)', [createdPaymentOrderIds]);
      }
      if (createdInvoiceIds.length > 0) {
        await pool.query('DELETE FROM invoice_line_items WHERE invoice_id IN (?)', [createdInvoiceIds]);
        await pool.query('DELETE FROM invoices WHERE id IN (?)', [createdInvoiceIds]);
      }
      if (createdUserIds.length > 0) {
        await pool.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds]);
        await pool.query('DELETE FROM company_profiles WHERE user_id IN (?)', [createdUserIds]);
        await pool.query('DELETE FROM users WHERE id IN (?)', [createdUserIds]);
      }
      await pool.query('DELETE FROM app_sequences WHERE sequence_name IN (?)', [createdSequenceKeys]);
    } catch (cleanupErr) {
      console.error('Cleanup warning:', cleanupErr.message);
    }
    await pool.end();
  }

  console.log('\n=====================================================================');
  console.log(`PHASE 4 VERIFICATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('=====================================================================');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
