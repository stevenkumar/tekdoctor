# TEKDOCTOR AMC MANAGEMENT MODULE — PHASE 1 VERIFICATION REPORT
**Database & Backend Foundation Implementation**

- **Date:** October 29, 2026
- **Auditor / Implementer:** Antigravity AI Engineering
- **Target Branch / Commit:** `main`
- **Environment:** Local Development (Node.js v24.19.0, Express.js, MySQL/InnoDB)
- **Phase 1 Verdict:** **PASS (READY FOR PHASE 2)**

---

## 1. Executive Summary & Verdict

Phase 1 established the authoritative database schema and backend foundations for the dedicated **AMC (Annual Maintenance Contract) Management Module** within TekDoctor. All requirements defined in Phase 0 audit and Phase 1 business decisions were implemented, verified, and regression-tested.

### Core Achievements
1. **Authoritative AMC Data Schema:** Added 6 dedicated tables (`amc_plans`, `amc_requests`, `amc_contracts`, `amc_covered_devices`, `amc_device_replacements`, and `amc_contract_history`) managed via idempotent migration `2026_12_amc_contract_management` in `server/models/db.init.js`.
2. **Fleet Inventory vs AMC Capacity Decoupling:** Unlimited fleet registration in `company_devices` was preserved and formally decoupled from contract-level coverage capacity (`amc_contracts.device_capacity`). Client self-entitlement of AMC status was eradicated.
3. **Canonical AMC Ticket Numbering:** Standardized corporate AMC repair tickets to the canonical format `TD-AMC-C001-01` (2-digit serial) while preserving non-AMC company tickets (`CMP-001-001`, 3-digit serial) and individual customer tickets (`TD-001-01`, 2-digit serial) with isolated, collision-safe atomic sequences.
4. **Authoritative Eligibility Engine:** Implemented `resolveDeviceAmcEligibility` in `server/services/amc.service.js`, terminating insecure legacy flags (`company_profiles.amc_status` and `company_devices.is_amc`) that previously granted perpetual free repairs.
5. **Atomic All-or-Nothing Fleet Bulk Import:** Upfront validation rejects any invalid spreadsheet row with 0 records inserted, ensuring data integrity.
6. **Device Replacement Workflow:** Designed admin-gated replacement tracking (`amc_device_replacements`) where pending requests preserve active coverage until explicit Admin review and approval.
7. **Comprehensive Test Verification:** Executed 44/44 dedicated AMC Phase 1 tests, 25/25 ticket system regression tests, 42/42 company ID & serial consistency tests, 213/213 bulk import tests, and 0-error client production build.

---

## 2. Schema & Database Verification

### A. Baselined Migration: `2026_12_amc_contract_management`
Migration was registered in `server/models/db.init.js` with idempotent execution and baselining:
- **Status:** Baselined & Verified across subsequent runs without duplicating tables, keys, or seeds.
- **Engine & Charset:** InnoDB, `utf8mb4_unicode_ci`.

### B. Created Tables & Entity Relations
| Table Name | Primary Purpose | Foreign Keys & Cascades | Indexes |
|---|---|---|---|
| `amc_plans` | Reusable plan templates & catalog | None | `idx_plans_active`, `idx_plans_code` |
| `amc_requests` | Company inquiries/requests | `company_id` → `users(id)` ON DELETE CASCADE, `plan_id` → `amc_plans(id)` ON DELETE SET NULL | `idx_amc_req_company`, `idx_amc_req_status` |
| `amc_contracts` | Authoritative contracts / offers | `company_id` → `users(id)`, `request_id` → `amc_requests(id)`, `plan_id` → `amc_plans(id)`, `invoice_id` → `invoices(id)` | `idx_amc_cnt_company`, `idx_amc_cnt_status`, `idx_amc_cnt_dates`, `idx_amc_cnt_approval`, `idx_amc_cnt_payment` |
| `amc_covered_devices` | Explicit covered devices | `contract_id` → `amc_contracts(id)` ON DELETE CASCADE, `device_id` → `company_devices(id)` ON DELETE RESTRICT, `company_id` → `users(id)` | `uk_contract_device` (UNIQUE), `idx_cov_dev_id`, `idx_cov_amc_tag`, `idx_cov_company`, `idx_cov_status`, `idx_cov_dates` |
| `amc_device_replacements`| Replacement request tracking | `contract_id` → `amc_contracts(id)` ON DELETE CASCADE, `company_id` → `users(id)`, `old_device_id` → `company_devices(id)` ON DELETE RESTRICT, `new_device_id` → `company_devices(id)` ON DELETE RESTRICT | `idx_amc_rep_contract`, `idx_amc_rep_company`, `idx_amc_rep_status` |
| `amc_contract_history` | Audit trail of lifecycle events | `contract_id` → `amc_contracts(id)` ON DELETE CASCADE, `performed_by` → `users(id)` ON DELETE SET NULL | `idx_amc_hist_contract`, `idx_amc_hist_action` |

### C. Seed Data Verification
Default plans seeded on empty initialization:
1. `AMC-STD-10`: Standard Business Fleet AMC (Base Price: ₹14,999, 10 devices, 12 months)
2. `AMC-CORP-25`: Corporate Premium Fleet AMC (Base Price: ₹34,999, 25 devices, 12 months)
3. `AMC-ENT-50`: Enterprise Dedicated Fleet AMC (Base Price: ₹64,999, 50 devices, 12 months)

---

## 3. Inventory & Fleet Decoupling

- **Unlimited Fleet Registration:** Confirmed that corporate fleet inventory (`company_devices`) has no 50-device quota limit. In testing, 12+ devices registered without restriction.
- **Decoupled AMC Capacity:** AMC coverage is strictly enforced at the contract level via `amc_contracts.device_capacity`.
- **Elimination of Client Self-Entitlement:**
  - In `company.controller.js` (`createDevice`), incoming `isAmc` and `amcTag` parameters are bypassed; new devices are inserted with `is_amc = 0` and `amc_tag = NULL`.
  - In `company.controller.js` (`bulkImportDevices`), devices imported via CSV/XLSX are persisted with `is_amc = 0` and `amc_tag = NULL`.
  - AMC coverage is exclusively assigned via `amcService.assignDevicesToCoverage` backed by row locks and capacity checks.

---

## 4. Ticket Numbering Architecture

### A. Numbering Scheme Matrix
| Category | Permanent Account ID | Ticket Serial Format | Example | Concurrency Sequence Name |
|---|---|---|---|---|
| **AMC Company Repair** | `TD-AMC-C001` | 2-digit zero-padded (`-01`) | `TD-AMC-C001-01` | `tkt:TD-AMC-C001` |
| **Standard Company Repair** | `CMP-001` | 3-digit zero-padded (`-001`) | `CMP-001-001` | `tkt:CMP-001` |
| **Individual Customer Repair** | `TD-001` | 2-digit zero-padded (`-01`) | `TD-001-01` | `tkt:TD-001` |

### B. Collision Safety & Concurrency
- Implemented in `server/utils/helpers.js` (`generateTicketNumber` & `resolvePermanentAccountId`).
- Sequences are atomic via `INSERT ... ON DUPLICATE KEY UPDATE current_val = LAST_INSERT_ID(current_val + 1)`.
- Verified under high concurrency: 10 parallel calls generated 10 distinct, contiguous ticket IDs without gaps or duplicates.

---

## 5. Authoritative Eligibility Engine

### A. Algorithm: `resolveDeviceAmcEligibility` (`server/services/amc.service.js`)
A repair request is eligible for AMC coverage if and only if ALL of the following criteria are satisfied:
1. Company exists and matches `amc_contracts.company_id`.
2. Target device exists in `company_devices` belonging to the same company.
3. Contract status is `'active'`.
4. Contract approval status is `'approved'`.
5. Contract payment status is `'paid'`.
6. Date check: `c.start_date <= targetDate AND c.end_date >= targetDate`.
7. Device is listed in `amc_covered_devices` with `status = 'active'`.
8. Coverage dates: `cd.coverage_start_date <= targetDate AND cd.coverage_end_date >= targetDate`.

### B. Legacy Bypass Eradication
- Tested setting `company_profiles.amc_status = 'Active'`: **NOT eligible**.
- Tested setting `company_devices.is_amc = 1`: **NOT eligible**.
- Legacy checks in `repair.controller.js:372` and `company.controller.js:1441` were completely replaced with `resolveDeviceAmcEligibility`.

---

## 6. Bulk Import All-or-Nothing Atomicity

- **Phase 1 Validation Pass:** Iterates all spreadsheet rows, validating serial number uniqueness, manufacturer brand, model number, branch foreign keys, employee foreign keys, and date formats.
- **Rejection on Error:** If `errors.length > 0`, the transaction rolls back immediately and returns HTTP 400. Exactly 0 rows are inserted or updated.
- **Phase 2 Persistence Pass:** Executes only if all rows in the batch are 100% valid.
- **Verified via Test:** Uploading an invalid row with valid rows aborted the entire batch with zero sequence or database changes.

---

## 7. Device Replacement Lifecycle

1. **Request Submission:** Company initiates a replacement request (`requestDeviceReplacement`). Generates unique `replacement_number` (`REP-...`) with `status = 'pending'`.
2. **Active Coverage Invariant:** While pending, the old device remains actively covered and eligible; the replacement device has no coverage.
3. **Admin Review (`reviewDeviceReplacement`):**
   - **Approval:** Old device is marked `'replaced'` in `amc_covered_devices` (retained in `company_devices` without deletion or quota refund). New device is inserted into `amc_covered_devices` with `'active'` status.
   - **Rejection:** Replacement status updated to `'rejected'`; active coverage remains unchanged.
4. **Audit Trail:** All transitions are logged to `amc_contract_history`.

---

## 8. Multi-Tenant Cross-Company Isolation

- **Device Access:** Company B cannot check eligibility for Company A's device. Returns `DEVICE_NOT_FOUND_FOR_COMPANY`.
- **Contract Access:** Company B cannot assign devices to Company A's contract. Row-level `WHERE id = ? AND company_id = ?` blocks cross-company mutations.
- **Replacement Isolation:** Company B cannot request replacement against Company A's contracts.

---

## 9. Backward Compatibility Verification

- **Historical Tickets:** Existing tickets (`TD-035-03`, `CMP-001-001`, etc.) remain queryable and unaltered.
- **Foreign Keys:** `company_devices.id` in `amc_covered_devices` uses `ON DELETE RESTRICT` to prevent accidental loss of device history.
- **Legacy Invoices & Payments:** Existing billing models remain completely untouched.

---

## 10. Test Execution Ledger

| Test Suite / Script | Test Groups | Assertions Checked | Status | Evidence / Key Output |
|---|---|---|---|---|
| `verify-amc-phase1.js` | 9 Groups | 44 / 44 Passed | **PASS** | `TEST RESULTS: 44 passed, 0 failed` |
| `verify-ticket-system.js` | 8 Groups | 25 / 25 Passed | **PASS** | `TEST RESULTS: 25 passed, 0 failed` |
| `verify-company-id-ticket-serial-consistency.js` | 10 Criteria | 42 / 42 Passed | **PASS** | `TEST RESULTS: 42 passed, 0 failed` |
| `verify-company-bulk-import-export.js` | 7 Groups | 213 / 213 Passed | **PASS** | `TOTAL TESTS: 213 \| PASSED: 213 \| FAILED: 0` |
| Client Production Build (`npm run build`) | Vite & TypeScript | 2,835 modules | **PASS** | `✓ built in 1.39s (0 compile errors)` |

---

## 11. Residual Risks & Technical Debt

1. **Email Alerts for AMC Lifecycle:** Phase 1 lays the backend methods; Phase 2 UI integration should connect transactional email alerts for AMC offer notifications and contract approval.
2. **Razorpay Payment Integration for AMC:** Contract payments in Phase 1 support standard database status transitions; Phase 2 will bind Razorpay checkout orders to AMC contract IDs.

---

## 12. Sign-off & Recommendations for Phase 2

- **Phase 1 Status:** **COMPLETE & FULLY VERIFIED.**
- **Recommendation:** Proceed to **Phase 2 (Admin AMC Management & Company Portal AMC Workflows UI)** upon user confirmation. All database entities, API endpoints, ticket formats, and security boundaries are fully operational.

