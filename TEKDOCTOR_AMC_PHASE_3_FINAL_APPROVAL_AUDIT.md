# TekDoctor AMC — Final Production Approval Audit Report

**Audit Date:** October 31, 2026  
**Auditor:** Automated Engineering Production Readiness Auditor  
**Audit Scope:** AMC Phase 3 Production Readiness Remediation (Post-Remediation Architecture & Edge Case Verification)  
**Status:** **AUDIT COMPLETED — CONDITIONAL APPROVAL WITH 5 OPERATIONAL FINDINGS**  
**Audit Mode:** Read-Only Audit (Zero database or codebase mutations executed)

---

## Executive Summary

This audit evaluated the four mandatory production areas of the TekDoctor AMC Phase 3 remediation:
1. **Reminder Delivery & Outbox Reliability**
2. **Renewal Coverage Activation & Eligibility Isolation**
3. **Certificate Cryptographic Verification & Public Security**
4. **Selection Deadline Date & Timezone Mechanics**

### Overall Verdict: CONDITIONAL PRODUCTION APPROVAL
The core database transactions, monotonic sequence numbering, cryptographic HMAC generation, deadline enforcement, and tenant isolation gates are solid and pass all core verification tests. 

However, **5 operational edge cases and reliability risks** were identified that operations and engineering teams should review before full deployment.

---

## Summary Scorecard

| Area # | Inspection Topic | Check Description | Audit Verdict | Severity |
|---|---|---|---|---|
| **1.1** | Reminder Delivery | SMTP accepted, app crash before DB update | **FAIL / RISK** | P1 |
| **1.2** | Reminder Delivery | Duplicate email risk during standard retry | **PASS** | — |
| **1.3** | Reminder Delivery | Retry backoff implementation | **FAIL** | P2 |
| **1.4** | Reminder Delivery | Retry limit enforcement (< 5) | **PASS** | — |
| **1.5** | Reminder Delivery | Permanent failure visibility in Admin UI | **FAIL** | P2 |
| **1.6** | Reminder Delivery | Stale processing recovery (5 min threshold) | **PASS** | — |
| **1.7** | Reminder Delivery | Concurrent worker advisory lock synchronization | **PASS** | — |
| **2.1** | Renewal Coverage | Incomplete device selection blocks coverage | **PASS** | — |
| **2.2** | Renewal Coverage | Paid/Approved contracts with zero allocated devices | **PASS** | — |
| **2.3** | Renewal Coverage | Partial device selection quota enforcement | **PASS** | — |
| **2.4** | Renewal Coverage | Selection deadline expiration blocks assignment | **PASS** | — |
| **2.5** | Renewal Coverage | Independent device repair eligibility evaluation | **PASS** | — |
| **2.6** | Renewal Coverage | Separation of commercial contract `status` vs device coverage | **PASS** | — |
| **3.1** | Certificate Verification | Dedicated `AMC_CERTIFICATE_SECRET` handling | **PASS** | — |
| **3.2** | Certificate Verification | Fallback security chain | **PASS** | — |
| **3.3** | Certificate Verification | Secret rotation invalidation behavior | **RISK / ADVISORY** | P2 |
| **3.4** | Certificate Verification | Legacy v1 codes identified as `v1_legacy` (not HMAC) | **PASS** | — |
| **3.5** | Certificate Verification | Public endpoint sensitive data sanitization | **PASS** | — |
| **3.6** | Certificate Verification | Public endpoint dedicated rate limiting | **RISK** | P2 |
| **3.7** | Certificate Verification | Deterministic HMAC across server timezones | **PASS / CONDITIONAL** | P2 |
| **4.1** | Selection Deadline | MySQL `DATE` column handling | **PASS** | — |
| **4.2** | Selection Deadline | Server timezone & lexicographical date comparison | **PASS** | — |
| **4.3** | Selection Deadline | Final valid selection day (same-day behavior) | **PASS** | — |
| **4.4** | Selection Deadline | First invalid day after deadline | **PASS** | — |
| **4.5** | Selection Deadline | UTC vs Application local timezone rollover shift | **RISK / ADVISORY** | P3 |

---

## Detailed Audit Findings by Area

---

### Area 1: Reminder Delivery & Outbox Reliability

#### Check 1.1: SMTP Accepted but Application Crashed Before Recording Success
- **Verdict:** `FAIL / RISK IDENTIFIED`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L1874-L1913) — `processExpiryReminders()` and `sendAmcNotification()`.
- **Reproducible Scenario:**
  1. The outbox processor picks up an eligible reminder #101 (`delivery_status = 'pending'`, `in_app_status = 'pending'`, `email_status = 'pending'`).
  2. Sets `delivery_status = 'processing'`.
  3. Dispatches `sendAmcNotification`:
     - In-App: Inserted into `notifications` table (`inAppSuccess = true`).
     - Email: Dispatched via Nodemailer/SMTP. The remote SMTP server responds with `250 OK: Message accepted for delivery` (`emailSuccess = true`).
  4. Immediately after SMTP return, before line 1910 (`UPDATE amc_expiry_reminders SET delivery_status = 'success', email_status = 'success' ...`) completes, the Node.js process crashes (e.g., Linux OOM killer, host power cycle, uncaught exception in another worker thread).
  5. State in MySQL: `amc_expiry_reminders` record remains in `delivery_status = 'processing'`, `in_app_status = 'pending'`, `email_status = 'pending'`.
  6. After 5 minutes, the stale recovery query resets `delivery_status` to `'pending'`.
  7. On the next sweep, because `reminder.email_status` is `'pending'`, `needEmail` evaluates to `true`.
  8. A **second identical email** is dispatched to the customer's SMTP server.
- **Production Impact:** At-least-once delivery trade-off; in crash events between network completion and DB commit, customers receive duplicate renewal notifications.
- **Recommended Fix:** Record `email_status = 'success'` immediately within an atomic channel callback or store the external SMTP `Message-ID` to detect recent dispatches.

#### Check 1.2: Duplicate Email Risk During Standard Retry
- **Verdict:** `PASS`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L1882-L1895) — `processExpiryReminders()`.
- **Reproducible Scenario:**
  1. In-app delivery succeeds (`in_app_status = 'success'`), but SMTP fails with `ECONNRESET` (`email_status = 'failed'`).
  2. The record transitions to `delivery_status = 'partial'`.
  3. On the subsequent retry attempt, line 1883 evaluates:
     `needInApp = reminder.in_app_status !== 'success'` → evaluates to `false`.
     `needEmail = reminder.email_status !== 'success'` → evaluates to `true`.
  4. `sendAmcNotification({ sendInApp: false, sendEmail: true })` is invoked.
  5. The customer receives only the email; in-app notification is strictly bypassed and not duplicated.
- **Production Impact:** Channel filtering reliably isolates failed channels without re-triggering successful ones.

#### Check 1.3: Retry Backoff Implementation
- **Verdict:** `FAIL`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L1855-L1864) — `processExpiryReminders()`.
- **Reproducible Scenario:**
  1. A reminder fails due to a temporary SMTP outage (`delivery_status = 'failed'`, `retry_count = 1`, `last_attempted_at = NOW()`).
  2. The SQL query in line 1855 selects outbox items:
     ```sql
     SELECT r.* FROM amc_expiry_reminders r
     WHERE r.delivery_status IN ('pending', 'failed', 'partial')
       AND r.retry_count < 5
     ORDER BY r.id ASC LIMIT 100
     ```
  3. The query does **not** check `last_attempted_at`.
  4. If manual sweeps are triggered or the scheduler runs shortly thereafter, the record is immediately re-attempted.
  5. All 5 retries can be consumed in consecutive sweeps within minutes during a transient network outage.
- **Production Impact:** Fast retry exhaustion without giving third-party mail providers time to recover.
- **Recommended Fix:** Add exponential or minimum interval backoff to the query:
  ```sql
  AND (r.last_attempted_at IS NULL OR r.last_attempted_at < DATE_SUB(NOW(), INTERVAL (r.retry_count * 15) MINUTE))
  ```

#### Check 1.4: Retry Limit Enforcement
- **Verdict:** `PASS`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L1861) — `processExpiryReminders()`.
- **Reproducible Scenario:**
  - `retry_count` increments atomically on each attempt (`retry_count = retry_count + 1`).
  - Once `retry_count >= 5`, the condition `AND r.retry_count < 5` excludes the reminder from future sweeps.
- **Production Impact:** Prevents infinite delivery retry loops.

#### Check 1.5: Permanent Failure Visibility for Admin
- **Verdict:** `FAIL`
- **Exact File & Function:** [`client/src/pages/admin/AdminAmcManagement.tsx`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/client/src/pages/admin/AdminAmcManagement.tsx#L1575-L1582) & [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L2513-L2540).
- **Reproducible Scenario:**
  1. A reminder fails permanently (`delivery_status = 'failed'`, `retry_count = 5`, `error_message = 'SMTP Invalid Mailbox'`).
  2. Admin navigates to Admin AMC Management → Reminders Tab.
  3. Line 1576 unconditionally renders a green checkmark:
     ```tsx
     <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
       <Check className="h-3 w-3" /> {rem.delivery_status}
     </span>
     ```
     It displays in green text `<Check /> failed`.
  4. The column `error_message`, `retry_count`, and channel breakdown are not displayed in the table.
  5. There is no filter for failed reminders and no administrative alert.
  6. If `sent_at` is `NULL`, `new Date(rem.sent_at).toLocaleString()` renders `1/1/1970, 5:30:00 AM`.
- **Production Impact:** Administrators cannot easily discover which companies missed contractual expiry notices.
- **Recommended Fix:** Color-code statuses (emerald for `success`, red for `failed`, amber for `partial`), render `error_message` tooltip, and add a "Failed Reminders" filter badge.

#### Check 1.6 & 1.7: Stale Processing Recovery & Concurrency Locking
- **Verdict:** `PASS`
- **Exact File & Function:** [`server/schedulers/amc.scheduler.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/schedulers/amc.scheduler.js#L25-L55) & [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L1786-L1791).
- **Verification:**
  - Automated sweeps and manual controller actions (`processMaintenanceExpiries`, `processMaintenanceReminders`) are guarded by `withAmcAdvisoryLock('tekdoctor_amc_maintenance_lock')`.
  - Secondary concurrent requests are gracefully rejected with `{ locked: true }`.
  - Stale processing locks (>5 minutes) are automatically reset to `pending` on the next sweep.

---

### Area 2: Renewal Coverage Activation

#### Check 2.1: Incomplete Device Selection Prevents Actual Coverage Activation
- **Verdict:** `PASS`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L150-L194) — `resolveDeviceAmcEligibility()`.
- **Verification:**
  - Contract status may be `active`, but eligibility checks join `amc_covered_devices cd JOIN amc_contracts c`.
  - If a device ID has not been explicitly allocated to the contract in `amc_covered_devices`, the join returns zero rows.
  - The function returns `{ isEligible: false, reason: 'DEVICE_NOT_IN_COVERED_FLEET' }`.

#### Check 2.2: Paid and Approved Contracts with Zero Devices
- **Verdict:** `PASS`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L229-L236) — `resolveDeviceAmcEligibility()`.
- **Verification:**
  - If a company pays for and approves a renewal contract but allocates zero devices, `contractCoveredCount` is `0`.
  - Repair eligibility returns `{ isEligible: false, reason: 'CONTRACT_HAS_ZERO_ALLOCATED_DEVICES' }`.
  - Technicians and customers receive unambiguous diagnostics rather than confusing error messages.

#### Check 2.3: Partial Selection Quota Enforcement
- **Verdict:** `PASS`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L363-L370).
- **Verification:**
  - For a 5-device plan with 2 devices selected:
    - Device 1 (selected): `isEligible: true`.
    - Device 2 (selected): `isEligible: true`.
    - Device 3 (unselected): `isEligible: false`, `reason: 'DEVICE_NOT_IN_COVERED_FLEET'`.
  - Each hardware device is verified independently by ID and serial number.

#### Check 2.4: Selection Deadline Expiry Blocks Assignment
- **Verdict:** `PASS`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L353-L360) — `assignDevicesToCoverage()`.
- **Verification:**
  - If `formatDateOnly(contract.selection_deadline) < formatDateOnly(new Date())`, assignment is rejected with an exception: `Device allocation window closed on YYYY-MM-DD. Allocation past the selection deadline is prohibited.`
  - The transaction aborts; no device allocations can be injected post-deadline.

#### Check 2.5 & 2.6: Independent Eligibility & Separation of Contract vs Coverage Status
- **Verdict:** `PASS`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L60-L194).
- **Verification:**
  - Contract status `active` reflects the commercial billing agreement.
  - Device entitlement is governed exclusively by `amc_covered_devices.status = 'active'` with date range enforcement.
  - Setting `company_devices.is_amc = 1` or changing profile status does not grant repair eligibility.

---

### Area 3: Certificate Verification

#### Check 3.1 & 3.2: Dedicated `AMC_CERTIFICATE_SECRET` & Fallback Security Chain
- **Verdict:** `PASS`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L2259-L2265) — `getCertificateSecret()`.
- **Verification:**
  - Reads `process.env.AMC_CERTIFICATE_SECRET`.
  - Falls back gracefully to `config.security.settingsEncryptionKey` or `config.jwt.secret`.
  - Throws an explicit configuration exception if no secret is available.

#### Check 3.3: Secret Rotation Invalidation Behavior
- **Verdict:** `RISK / ADVISORY`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L2283-L2327).
- **Analysis:**
  - Because HMAC verification codes are derived from `(secret, canonicalPayload)`, rotating `AMC_CERTIFICATE_SECRET` in `.env` immediately renders all previously generated compliance certificates un-verifiable.
  - There is currently no multi-key ring support (e.g. `AMC_CERTIFICATE_SECRET_PREVIOUS`).
- **Production Impact:** Secret rotation will invalidate previously printed or distributed physical certificates.
- **Recommended Fix:** Implement key versioning in certificate codes (e.g., prefixing `v2:`) or allow dual-secret verification during rotation grace periods.

#### Check 3.4: Legacy v1 Codes Not Represented as HMAC
- **Verdict:** `PASS`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L2310,L2323,L2490).
- **Verification:**
  - v1 SHA-256 codes return `{ valid: true, version: 'v1_legacy' }`.
  - v2 HMAC codes return `{ valid: true, version: 'v2_hmac' }`.
  - The public verification route explicitly outputs the `version` field.

#### Check 3.5: Public Endpoint Sensitive Data Sanitization
- **Verdict:** `PASS`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L2488-L2500) — `getPublicCertificateVerification()`.
- **Verification:**
  - Sanitized public response returns only: `valid`, `version`, `certificateNumber`, `contractNumber`, `companyName`, `planName`, `status`, `complianceStatus`, `startDate`, `endDate`, `verifiedAt`.
  - Total amounts, invoices, Razorpay IDs, and covered device hardware serial numbers are strictly excluded.

#### Check 3.6: Public Endpoint Dedicated Rate Limiting
- **Verdict:** `RISK`
- **Exact File & Function:** [`server/routes/amc.routes.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/routes/amc.routes.js#L49).
- **Analysis:**
  - `GET /api/amc/public/verify-certificate/:code` is mounted without route-specific rate limiting (`authLimiter` or `contactLimiter`).
  - It relies only on the application-wide `globalLimiter` (1,000 requests per 15 minutes).
- **Production Impact:** A distributed or automated crawler could brute-force 16-character hex signatures against contracts.
- **Recommended Fix:** Mount a strict rate limiter (e.g., 30 requests / 15 minutes per IP) on `/public/verify-certificate/:code`.

#### Check 3.7: Deterministic HMAC Across Server Timezones
- **Verdict:** `PASS / CONDITIONAL`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L37-L47,L2272-L2278).
- **Analysis:**
  - MySQL `DATE` columns parsed by `mysql2` construct `Date` objects at local midnight.
  - `formatDateOnly` reads `getFullYear()`, `getMonth() + 1`, `getDate()`.
  - Local construction and local extraction cancel out, producing the identical `YYYY-MM-DD` string in both UTC and IST environments.
  - **Edge Case Condition:** If external callers provide ISO strings with timezone offsets (e.g., `"2026-10-29T18:30:00.000Z"`), `d.slice(0, 10)` extracts the UTC date prefix (`2026-10-29`), which is 1 day earlier than the Indian calendar date (`2026-10-30`).
- **Production Impact:** Server-side certificate generation is deterministic. Payload tampering or passing raw ISO strings from clients will fail HMAC.

---

### Area 4: Selection Deadline Timezone

#### Check 4.1 & 4.2: MySQL DATE Handling & Lexicographical Comparison
- **Verdict:** `PASS`
- **Exact File & Function:** [`server/models/db.init.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/models/db.init.js#L677) & [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L354-L358).
- **Verification:**
  - `selection_deadline` is stored as `DATE` (`YYYY-MM-DD`).
  - Comparison is performed using normalized `YYYY-MM-DD` strings: `deadlineStr < todayStr`.
  - Lexicographical comparison is immune to daylight savings time and leap seconds.

#### Check 4.3: Final Valid Selection Day
- **Verdict:** `PASS`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L357).
- **Test:**
  - `deadlineStr = "2026-11-15"`.
  - On `2026-11-15` (at 09:00:00 or 23:59:59): `todayStr = "2026-11-15"`.
  - `"2026-11-15" < "2026-11-15"` evaluates to `false`.
  - **Result:** No exception thrown; device assignment **succeeds** throughout the entire final valid calendar day.

#### Check 4.4: First Invalid Day After Deadline
- **Verdict:** `PASS`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L357).
- **Test:**
  - `deadlineStr = "2026-11-15"`.
  - On `2026-11-16` (at 00:00:01): `todayStr = "2026-11-16"`.
  - `"2026-11-15" < "2026-11-16"` evaluates to `true`.
  - **Result:** Throws `Device allocation window closed on 2026-11-15. Allocation past the selection deadline is prohibited.`
  - Device assignment strictly rejected.

#### Check 4.5: Behavior Across UTC and Application Timezone
- **Verdict:** `RISK / ADVISORY`
- **Exact File & Function:** [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js#L356).
- **Analysis:**
  - If the Node.js production server runs with `TZ=UTC` while customers operate in India (`UTC+05:30`):
    - At 12:30 AM IST on `2026-11-16`, the UTC server time is `2026-11-15 19:00:00 UTC`.
    - `todayStr` on the UTC server is still `"2026-11-15"`.
    - Indian users submitting during this 5.5-hour window after Indian midnight are permitted until 5:30 AM IST (when UTC reaches midnight).
- **Production Impact:** A 5.5-hour grace window occurs if the backend runs in UTC.
- **Recommended Fix:** Set `TZ=Asia/Kolkata` in `server/.env` or docker container environment to ensure server calendar midnight synchronizes with Indian business hours.

---

## Actionable Operational Recommendations

1. **Add Exponential Backoff for Reminders (P2):**
   Update the outbox selection query in `processExpiryReminders` to enforce a delay between attempts:
   `AND (r.last_attempted_at IS NULL OR r.last_attempted_at < DATE_SUB(NOW(), INTERVAL POW(2, r.retry_count) * 10 MINUTE))`

2. **Fix Admin Reminder Status Rendering (P2):**
   In `AdminAmcManagement.tsx`, update the status cell to display red badge for `failed` and amber for `partial`, render `error_message`, and add an administrative "Retry" action.

3. **Protect Public Certificate Verification Route (P2):**
   Mount a dedicated rate limiter (e.g. 30 requests / 15 minutes) on `GET /api/amc/public/verify-certificate/:code` in `amc.routes.js`.

4. **Synchronize Server Timezone in Production (P3):**
   Ensure `TZ=Asia/Kolkata` is defined in production deployment environments (cPanel Passenger / Docker / PM2) so that calendar boundaries match local customer expectations.

