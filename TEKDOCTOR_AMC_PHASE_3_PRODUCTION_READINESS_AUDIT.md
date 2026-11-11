# TekDoctor — AMC Phase 3: Production Readiness Deep Audit Report

**Audit Date:** 2026-10-31  
**Target:** AMC Phase 3 Implementation (Automated Reminders, Expiry Sweeps, Renewals & Compliance Certificates)  
**Scope:** Read-Only Deep Technical Audit (Backend, Schedulers, Concurrency, Security, Database Integrity)  
**Status:** COMPLETE (Audit-Only; Zero Source Modifications Applied)

---

## Executive Summary

A comprehensive, read-only production readiness deep audit of the **TekDoctor AMC Phase 3** implementation was performed across backend services, controllers, schedulers, routes, and UI utilities.

Thirteen (13) focused audit tests were executed against isolated database test fixtures (`CMP-AUD-*`). The audit identified **6 verified PASS** architectural safeguards and **7 FAIL** production resilience gaps requiring controlled remediation before live production deployment.

### Summary Scorecard

| Area | Audit Focus | Verified Status |
| :--- | :--- | :---: |
| **1. Reminder Delivery Reliability** | Pre-delivery ledger insert & crash vulnerability | **FAIL** |
| | Retry strategy for failed reminder dispatches | **FAIL** |
| **2. Expiry Transaction Safety** | Transaction atomicity during expiry cascade | **FAIL** |
| | Multi-coverage preservation across active contracts | **PASS** |
| **3. Renewal Activation & Eligibility** | Contract activation prior to device allocation | **FAIL** |
| | AMC repair eligibility gating on unallocated devices | **PASS** |
| | Selection deadline enforcement during allocation | **FAIL** |
| | Idempotency and duplicate renewal request prevention | **FAIL** |
| **4. Scheduler Reliability** | Advisory lock ownership and session binding | **PASS** |
| | Synchronization between manual and scheduled sweeps | **FAIL** |
| **5. Certificate Security** | Cryptographic verification signature vs plain hash | **FAIL** |
| | Tenant isolation & cross-company access prohibition | **PASS** |
| | Sensitive data exposure in certificate payload | **PASS** |

---

## 1. Reminder Delivery Reliability

### Relevant Files & Code Paths
- `server/services/amc.service.js`: `processExpiryReminders` (lines 1668–1768)
- `server/services/amc.service.js`: `sendAmcNotification` (lines 1006–1040)
- `server/models/db.init.js`: Table `amc_expiry_reminders`

### Verified Runtime Findings

#### Finding 1.1: Pre-Delivery Ledger Insertion with False `'success'` Status
In `amc.service.js` (lines 1715–1725):
```javascript
const [insertRes] = await connection.query(`
  INSERT INTO amc_expiry_reminders (contract_id, company_id, milestone_days, expiry_date, delivery_channel, delivery_status, metadata)
  VALUES (?, ?, ?, ?, 'both', 'success', ?)
`, [contract.id, contract.company_id, targetMilestone, endDateStr, ...]);
```
- **Audit Result:** **FAIL**
- **Existing Behavior:** The record is inserted into `amc_expiry_reminders` with `delivery_status = 'success'` **before** `sendAmcNotification` is even invoked.
- **Failure Scenario:**
  1. The ledger insert executes successfully.
  2. The Node.js process crashes (e.g. host OOM, unhandled exception in another worker, container termination) before `sendAmcNotification` runs.
  3. When the service restarts, the scheduled sweep queries active contracts and attempts an `INSERT` for the same milestone.
  4. The query triggers `ER_DUP_ENTRY` on `uk_contract_milestone_expiry (contract_id, milestone_days, expiry_date)`.
  5. The exception handler catches `ER_DUP_ENTRY` and sets `inserted = false`.
  6. **Impact:** The notification is permanently lost. The system believes the reminder was delivered, but the client never received an in-app alert or email.

#### Finding 1.2: Unawaited, Swallowed Email Dispatch
In `amc.service.js` (lines 1029–1035):
```javascript
try {
  if (role === 'admin' || r.role === 'admin') {
    sendAdminNotification(title, `<p>${message}</p>`).catch(() => {});
  } else if (r.email) {
    sendCustomerNotification(r.email, title, `<p>Hello ${r.name || 'Valued Client'},</p><p>${message}</p>`).catch(() => {});
  }
} catch (_) {}
```
- **Audit Result:** **FAIL**
- **Existing Behavior:** Email delivery is invoked without `await` and attaches `.catch(() => {})`.
- **Failure Scenario:** If the SMTP server returns `ECONNREFUSED`, rate-limits the connection, or rejects the recipient, the promise rejects silently. Because `sendAmcNotification` does not return delivery status, `processExpiryReminders` has no awareness of the failure. The ledger remains marked `delivery_status = 'success'`, and `delivery_channel = 'both'` falsely indicates both channels succeeded.

#### Finding 1.3: Absence of a Controlled Retry Mechanism
- **Audit Result:** **FAIL**
- **Existing Behavior:** The database table defines `delivery_status ENUM('pending', 'success', 'failed') DEFAULT 'success'`. However:
  - There is no query in `amc.service.js` that selects records where `delivery_status = 'failed'` for retry.
  - When test records were manually updated to `delivery_status = 'failed'`, running `processExpiryReminders` produced zero retries because the outer query selects from `amc_contracts` and attempts an `INSERT`, which immediately collides with the existing unique index.

### Existing Safeguards
- Composite unique key `uk_contract_milestone_expiry (contract_id, milestone_days, expiry_date)` prevents duplicate notifications under normal operating conditions.
- Deduplication across multiple cluster workers and restarts is verified.

### Missing Safeguards
1. Two-phase delivery state: Insert as `'pending'`, dispatch in-app and email, then update to `'success'` or `'failed'`.
2. Awaitable email dispatch returning discrete `{ inAppDelivered: boolean, emailDelivered: boolean, errorMessage: string | null }`.
3. Dedicated retry sweep for `delivery_status = 'failed'` with maximum retry limits (e.g. 3 attempts).

---

## 2. Expiry Transaction Safety

### Relevant Files & Code Paths
- `server/services/amc.service.js`: `processContractExpiries` (lines 1546–1661)
- `server/controllers/amc.controller.js`: `processMaintenanceExpiries` (lines 620–627)

### Verified Runtime Findings

#### Finding 2.1: Non-Atomic Database Cascades (No Explicit Transactions)
In `amc.service.js` (lines 1562–1600):
```javascript
for (const contract of expiredContracts) {
  const [updateResult] = await connection.query(`
    UPDATE amc_contracts SET status = 'expired' WHERE id = ? AND status = 'active'
  `, [contract.id]);

  if (updateResult.affectedRows > 0) {
    expiredContractsCount++;

    await connection.query(`
      UPDATE amc_covered_devices SET status = 'expired' WHERE contract_id = ? AND status = 'active'
    `, [contract.id]);

    await connection.query(`
      UPDATE company_devices cd SET cd.is_amc = 0 WHERE cd.id IN (...) AND NOT EXISTS (...)
    `, [contract.id]);

    await connection.query(`
      INSERT INTO amc_contract_history ...
    `, [contract.id, ...]);
  }
}
```
- **Audit Result:** **FAIL**
- **Existing Behavior:** Each query runs in **autocommit mode**. There is no `connection.beginTransaction()`, `connection.commit()`, or `connection.rollback()`.
- **Failure Scenario:** If the database terminates the connection, encounters a lock wait timeout, or crashes after `UPDATE amc_contracts SET status = 'expired'`:
  - `amc_contracts.status` is committed as `'expired'`.
  - `amc_covered_devices` remains `'active'`.
  - `company_devices.is_amc` remains `1`.
  - On the next scheduled run, `SELECT ... WHERE status = 'active' AND end_date < CURRENT_DATE()` will **never select this contract again** because its status is already `'expired'`.
  - **Impact:** An orphaned database state where devices remain actively covered in sub-tables under an expired contract.

#### Finding 2.2: Device Multi-Coverage Preservation
- **Audit Result:** **PASS**
- **Verification:** An audit test fixture covered device `SN-SHARED-*` under both an expired contract and a valid future active contract. When `processContractExpiries` executed:
  - The subquery `AND NOT EXISTS (SELECT 1 FROM amc_covered_devices acd JOIN amc_contracts ac ... WHERE acd.status = 'active' AND ac.status = 'active')` evaluated to `FALSE`.
  - `company_devices.is_amc` remained `1`.
  - Multi-contract coverage was preserved without premature deactivation.

#### Finding 2.3: Timezone Skew between Node.js and MySQL
- **Audit Result:** **WARNING / RISK**
- **Finding:** Expiry queries use MySQL's `CURRENT_DATE()` in database system time, while Node.js calculates `todayStr` via `new Date().toISOString().slice(0, 10)` in UTC.
- **Impact:** If the database host is configured in Indian Standard Time (IST, UTC+05:30) while Node runs in UTC (or vice versa), there is a 5.5-hour window between 00:00 IST and 05:30 IST where MySQL and Node calculate different dates, causing boundary-shift anomalies on midnight transitions.

### Existing Safeguards
- `affectedRows > 0` condition prevents duplicate counter increments and duplicate audit logs.
- `NOT EXISTS` clause protects devices covered by multiple active contracts.

### Missing Safeguards
1. Each expired contract processing step must be wrapped in `await connection.beginTransaction()` with `commit()` and `rollback()`.
2. Standardized UTC date evaluation across both MySQL and Node.js (`CONVERT_TZ(CURRENT_TIMESTAMP, @@session.time_zone, '+00:00')` or explicit session timezone setup).

---

## 3. Renewal Activation and Eligibility

### Relevant Files & Code Paths
- `server/services/amc.service.js`: `requestAmcRenewal` (lines 1842–1899)
- `server/services/amc.service.js`: `createAmcRenewalContract` (lines 1911–2043)
- `server/services/amc.service.js`: `assignDevicesToCoverage` (lines 311–360)
- `server/services/amc.service.js`: `resolveDeviceAmcEligibility` (lines 140–220)
- `server/services/amc.service.js`: `approveAmcContract` & `activateAmcContract` (lines 929–1000)

### Verified Runtime Findings

#### Finding 3.1: Contract Activation Prior to Device Allocation
- **Audit Result:** **FAIL** (Architectural Asymmetry)
- **Existing Behavior:** When a renewal contract is approved by Admin and paid by Company, `amc_contracts.status` is set to `'active'`. However, renewals deliberately start with `0` covered devices to require explicit allocation.
- **Impact:** The contract is technically in an `active` state in the Admin and Company dashboards, displaying `0 / N Devices Covered`. While repair tickets are safely blocked (see Finding 3.2), the system lacks an explicit intermediate state such as `pending_device_selection` or `active_pending_devices`.

#### Finding 3.2: Eligibility Gate on Unallocated Devices
- **Audit Result:** **PASS**
- **Verification:** A test device belonging to the company was submitted for repair eligibility checking while the contract was `status = 'active'` with 0 devices allocated.
- **Result:** `resolveDeviceAmcEligibility` returned `isEligible: false` with reason `DEVICE_NOT_IN_COVERED_FLEET`.
- **Conclusion:** Devices are strictly ineligible for free AMC repairs unless an explicit record exists in `amc_covered_devices` with `status = 'active'`.

#### Finding 3.3: Selection Deadline Enforcement Missing in Device Assignment
In `amc.service.js` (lines 339–343):
```javascript
const contract = contracts[0];
if (!['active', 'accepted', 'draft', 'offered'].includes(contract.status)) {
  throw new Error(`Cannot assign devices to a contract with status "${contract.status}".`);
}
```
- **Audit Result:** **FAIL**
- **Existing Behavior:** While `selection_deadline` is set on contracts (e.g. 15 days from offer), `assignDevicesToCoverage` **does not inspect `contract.selection_deadline`**.
- **Verified Failure Scenario:** In our audit test, a contract with `selection_deadline = '2026-01-01'` (in the past) allowed device assignment without restriction.
- **Impact:** Companies can allocate devices months after the deadline has expired, bypassing the intended selection window.

#### Finding 3.4: Duplicate Pending Renewal Requests Allowed
In `amc.service.js` (lines 1842–1878):
- **Audit Result:** **FAIL**
- **Existing Behavior:** `requestAmcRenewal` does not check if an active request already exists in `amc_requests` for this contract with status `'pending'` or `'under_review'`.
- **Verified Failure Scenario:** Two consecutive calls to `requestAmcRenewal` for the same contract created two separate records in `amc_requests` (`REQ-1` and `REQ-2`) and two duplicate admin notifications.
- **Impact:** If a user clicks the button repeatedly, or multiple company managers submit renewal requests, duplicate tickets clutter the admin queue.

### Existing Safeguards
- Strict coverage isolation: Previous covered devices are never automatically rolled over into renewed contracts.
- Prohibition of retroactive coverage: Gap renewals enforce `startDate >= CURRENT_DATE()`.
- Device repair eligibility strictly requires an active row in `amc_covered_devices`.

### Missing Safeguards
1. Enforce `selection_deadline` in `assignDevicesToCoverage` (reject if `contract.selection_deadline < CURRENT_DATE()`).
2. Request idempotency: Block new renewal requests if `amc_requests` has an existing record with status in `('pending', 'under_review')` for the same contract.

---

## 4. Scheduler Reliability

### Relevant Files & Code Paths
- `server/schedulers/amc.scheduler.js`: `runAmcMaintenanceSweep` & `startAmcScheduler` (lines 16–109)
- `server/controllers/amc.controller.js`: `processMaintenanceExpiries` & `processMaintenanceReminders` (lines 620–636)
- `server/server.js`: lines 343–344, 365–380

### Verified Runtime Findings

#### Finding 4.1: MySQL Advisory Lock Ownership and Connection Session Binding
- **Audit Result:** **PASS**
- **Verification:** Tested across two distinct connection instances from the pool. Connection 1 acquired `GET_LOCK('audit_test_lock', 0) = 1`. Connection 2 was immediately rejected with `0`. Connection 1 called `RELEASE_LOCK('audit_test_lock') = 1`, successfully freeing the lock.
- **Conclusion:** `runAmcMaintenanceSweep` maintains the exact same connection instance from acquisition through release in the `finally` block. If the process crashes, MySQL automatically releases the session lock.

#### Finding 4.2: Manual Maintenance Sweeps Bypass Advisory Lock
In `server/controllers/amc.controller.js`:
```javascript
const processMaintenanceExpiries = async (req, res, next) => {
  try {
    const results = await amcService.processContractExpiries(pool);
    return res.json(formatResponse(true, 'AMC contract expiries processed successfully.', results));
  } catch (error) { next(error); }
};
```
- **Audit Result:** **FAIL**
- **Existing Behavior:** The manual endpoints (`POST /api/amc/admin/maintenance/process-expiries` and `POST /api/amc/admin/maintenance/process-reminders`) call the service methods directly on `pool` **without acquiring `tekdoctor_amc_scheduler_lock`**.
- **Failure Scenario:** An administrator clicks "Sweep Expiries" in the Admin Dashboard at the exact moment the hourly scheduler fires. Both sweeps execute simultaneously on different database connections, creating lock contention, deadlocks, or interleaved history logs.

#### Finding 4.3: Graceful Shutdown Unwired
In `server/server.js`:
- `startAmcScheduler(pool)` returns an `intervalId`, but the timer ID is not saved in a module-scoped variable and is not cleared in `gracefulShutdown(signal)`.

### Existing Safeguards
- Non-blocking advisory locking (`GET_LOCK(..., 0)`) prevents multiple background worker processes from duplicating scheduled sweeps.
- Automated lock release on TCP session drop by MySQL engine.

### Missing Safeguards
1. Wrap manual maintenance controller actions in the advisory lock (or call `runAmcMaintenanceSweep` directly).
2. Register scheduler timers with the server shutdown coordinator.

---

## 5. Certificate Security

### Relevant Files & Code Paths
- `server/services/amc.service.js`: `getContractCertificateData` (lines 2049–2174)
- `server/routes/amc.routes.js`: line 52
- `client/src/utils/amcCertificateGenerator.ts`

### Verified Runtime Findings

#### Finding 5.1: Plain SHA-256 Hash vs HMAC Cryptographic Signature
In `amc.service.js` (lines 2105–2110):
```javascript
const verificationHash = crypto
  .createHash('sha256')
  .update(`${contract.contract_number}:${contract.start_date}:${contract.end_date}:${contract.company_id}`)
  .digest('hex')
  .slice(0, 16)
  .toUpperCase();
```
- **Audit Result:** **FAIL**
- **Existing Behavior:** The verification code is a plain SHA-256 hash slice without a server-side secret key.
- **Vulnerability:** Anyone knowing the formula can compute a matching 16-character hash for any forged contract parameters. It functions as an integrity checksum, but **not as a tamper-proof cryptographic signature**.

#### Finding 5.2: Non-Deterministic Hash Across Host Timezones
- **Audit Result:** **FAIL**
- **Finding:** The input string interpolates raw JavaScript `Date` objects (`${contract.start_date}`). In JavaScript, `${dateObj}` invokes `Date.prototype.toString()`, which outputs local timezone representations (e.g. `Thu Jan 01 2026 00:00:00 GMT+0530 (IST)` vs `Wed Dec 31 2025 18:30:00 GMT+0000 (UTC)`).
- **Impact:** The verification code produced on a developer machine in IST differs from the code produced on a production server in UTC for the exact same contract.

#### Finding 5.3: Strict Cross-Company Tenant Isolation
- **Audit Result:** **PASS**
- **Verification:** An authenticated Company B user attempted to access the certificate endpoint for Company A's contract (`cActive.id`). The service rejected the request with `403 Access Denied: You are not authorized to view this contract certificate.`
- **Conclusion:** Cross-tenant certificate access is strictly blocked at the backend service layer.

#### Finding 5.4: Data Minimization & Sensitive Fields
- **Audit Result:** **PASS**
- **Verification:** Inspected serialized payload. Confirmed zero passwords, JWT secrets, payment tokens, API keys, or private internal technician notes are present in the certificate data contract.

#### Finding 5.5: Missing Public Verification Endpoint
- **Audit Result:** **INFORMATIONAL / GAP**
- **Finding:** The generated compliance certificate prints a `Verification Code: <HASH>` and instructs third-party auditors to verify authenticity. However, there is no public verification route (e.g. `/api/public/verify-amc-certificate/:code`) where a third party can validate the certificate without authenticating as an admin or the contract owner.

---

## 6. Comprehensive Remediation Plan (Prioritized)

> [!IMPORTANT]
> The following remediation steps are recommendations for the subsequent implementation phase. No changes have been applied during this audit.

### Priority 1: High Severity (Data Integrity & Delivery Reliability)

1. **Two-Phase Reminder Delivery & Retry Loop (`amc.service.js`):**
   - Insert reminders with `delivery_status = 'pending'`.
   - Await in-app and email delivery; update record to `'success'` or `'failed'` with error details.
   - Add a retry sweep query selecting `WHERE delivery_status = 'failed' AND attempts < 3`.

2. **Atomic Expiry Transactions (`amc.service.js`):**
   - Wrap contract expiry, covered devices update, legacy fleet synchronization, and audit logging inside `await connection.beginTransaction()` / `await connection.commit()`.

3. **Timezone-Normalized HMAC Signature (`amc.service.js`):**
   - Replace plain SHA-256 with HMAC-SHA256 using `config.jwt.secret` (or dedicated certificate secret).
   - Format dates to ISO strings (`YYYY-MM-DD`) before hashing to eliminate host timezone differences:
     ```javascript
     const payload = `${contract.contract_number}:${formatDateOnly(contract.start_date)}:${formatDateOnly(contract.end_date)}:${contract.company_id}`;
     const verificationHash = crypto.createHmac('sha256', config.jwt.secret).update(payload).digest('hex').slice(0, 16).toUpperCase();
     ```

### Priority 2: Medium-High Severity (Business Rule Enforcement)

4. **Selection Deadline Enforcement (`amc.service.js`):**
   - In `assignDevicesToCoverage`, add check:
     ```javascript
     if (contract.selection_deadline && formatDateOnly(contract.selection_deadline) < formatDateOnly(new Date())) {
       throw new Error(`Device allocation window closed on ${formatDateOnly(contract.selection_deadline)}. Please contact support to extend your deadline.`);
     }
     ```

5. **Duplicate Renewal Request Idempotency (`amc.service.js`):**
   - In `requestAmcRenewal`, query `amc_requests` for existing pending requests on the same contract:
     ```javascript
     const [existing] = await pool.query(
       "SELECT id FROM amc_requests WHERE company_id = ? AND notes LIKE ? AND status IN ('pending', 'under_review')",
       [resolvedCompanyId, `%${previousContract.contract_number}%`]
     );
     if (existing.length > 0) throw new Error('A renewal request for this contract is already pending review.');
     ```

### Priority 3: Medium Severity (Concurrency & Architecture Polish)

6. **Synchronize Manual Admin Sweeps with Advisory Lock (`amc.controller.js`):**
   - Update `processMaintenanceExpiries` and `processMaintenanceReminders` to acquire `tekdoctor_amc_scheduler_lock` or execute through `runAmcMaintenanceSweep`.

7. **Public Verification Route (`amc.routes.js`):**
   - Implement lightweight public endpoint `GET /api/public/verify-certificate/:code` validating against `verificationCode` and contract dates without requiring user authentication.

---

## 7. Audit Conclusion

The AMC Phase 3 foundation is architecturally well-conceived, with strong tenant isolation, strict coverage quota gating, robust legacy fleet synchronization, and proper MySQL advisory locking.

Addressing the 7 identified production gaps—primarily around transaction atomicity, two-phase delivery tracking, HMAC signing, and selection deadline enforcement—will elevate the module to enterprise-grade production reliability.

