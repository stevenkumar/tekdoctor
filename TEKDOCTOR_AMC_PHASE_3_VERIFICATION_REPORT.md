# TekDoctor — AMC Phase 3 Implementation & Verification Report

## 1. Executive Summary

The **AMC Management Module Phase 3** for TekDoctor has been successfully designed, implemented, tested, and verified. Phase 3 completes the end-to-end lifecycle of annual maintenance contracts by introducing:

1. **Automated AMC Expiry Reminders Engine:** Configurable multi-stage reminder milestones (`30, 15, 7, 1` days), cross-worker and restart deduplication via atomic database constraints, in-app notifications, transactional email integration, and an admin audit ledger.
2. **Automated Expiry & Coverage Status Transitions:** Scheduled and on-demand sweep processing that detects elapsed active contracts (`end_date < CURRENT_DATE()`), seamlessly updates contract status to `'expired'`, cascades to mark all linked covered devices in `amc_covered_devices` as `'expired'`, synchronizes legacy `company_devices.is_amc` flags, and expires unaccepted offers past their validity window.
3. **Robust AMC Renewal Workflow:** Full support for company-initiated renewal requests, admin renewal offers, **reduced-capacity renewals** (e.g. downsizing device fleets), **gap renewals** (prohibiting retroactive coverage by enforcing prospective-only start dates), and **strict device coverage isolation** (requiring explicit device re-selection without automatic rollover).
4. **Authoritative AMC Contract Certificate & Compliance PDF:** High-trust backend data contract providing cryptographic SHA-256 verification codes, SLA commitments, corporate branding, covered device schedules, and tenant isolation, accompanied by professional client-side PDF generation and print formatting (`html2pdf.js`).
5. **Admin and Company Portal UI:** Complete interface controls including renewal request modals, renewal offer generation forms, an Expiry Reminders audit tab with manual sweep triggers in the Admin Dashboard, and certificate download/print actions in both Admin and Company portals.

All 21 comprehensive test assertions in `server/tests/verify-amc-phase3.js` passed with zero errors, all prior test suites (61 Phase 2 assertions, 44 Phase 1 assertions, 8 Fixes assertions, 42 Company/Serial consistency assertions, 25 Ticket system assertions, 16 Client dropdown assertions) passed without regression, and the client frontend production build (`tsc -b && vite build`) completed cleanly.

---

## 2. Pre-Implementation Audit Findings & Resolution

Prior to making changes, an exhaustive codebase audit was conducted (documented in `TEKDOCTOR_AMC_PHASE_3_AUDIT_REPORT.md`). The audit revealed key architectural gaps that were resolved in Phase 3:

| Pre-Audit Gap | Risk Identified | Phase 3 Resolution |
| :--- | :--- | :--- |
| **No Reminder Tracking Table** | In a multi-worker cluster or on server restarts, contracts would receive spam notifications or duplicates. | Introduced `amc_expiry_reminders` with a composite `UNIQUE KEY uk_contract_milestone_expiry (contract_id, milestone_days, expiry_date)` and atomic `INSERT` handling. |
| **Silent Expiry of Active Contracts** | Contracts whose `end_date` passed remained marked as `status = 'active'`, giving false coverage. | Implemented `processContractExpiries` with advisory-locked background scheduling, automatically expiring lapsed contracts and their covered devices. |
| **Retroactive Gap Coverage Risk** | Renewing a contract weeks or months after expiration could allow companies to claim coverage for repairs that occurred during the lapse. | Implemented strict UTC validation in `createAmcRenewalContract` requiring `startDate >= CURRENT_DATE()` whenever `prev.end_date < CURRENT_DATE()`. |
| **Automatic Device Rollover Assumption** | Renewing contracts could accidentally carry forward decommissioned or unwanted devices, or exceed reduced capacities. | Enforced device coverage isolation: renewal contracts initialize with 0 devices, requiring explicit company allocation up to the new quota. |
| **Hardcoded or Unverified PDFs** | Generating client-only PDFs without server authority would permit tampering and lack SLA compliance proof. | Created authoritative backend data contract `getContractCertificateData` with SHA-256 verification hash, SLA terms, and strict tenant isolation. |

---

## 3. Database Architecture & Migrations

### Schema Migration: `2026_13_amc_expiry_reminders_and_phase3`
File: `server/models/db.init.js`

1. **`amc_covered_devices.status` Enum Extension:**
   Extended to include `'expired'` status:
   ```sql
   ALTER TABLE amc_covered_devices 
   MODIFY COLUMN status ENUM('active', 'decommissioned', 'replaced', 'expired') DEFAULT 'active';
   ```

2. **Dedicated Audit & Deduplication Ledger: `amc_expiry_reminders`:**
   ```sql
   CREATE TABLE IF NOT EXISTS amc_expiry_reminders (
     id INT AUTO_INCREMENT PRIMARY KEY,
     contract_id INT NOT NULL,
     company_id INT NOT NULL,
     milestone_days INT NOT NULL,
     expiry_date DATE NOT NULL,
     delivery_channel ENUM('in_app', 'email', 'both') DEFAULT 'both',
     delivery_status ENUM('pending', 'success', 'failed') DEFAULT 'success',
     error_message TEXT NULL,
     metadata JSON NULL,
     sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uk_contract_milestone_expiry (contract_id, milestone_days, expiry_date),
     INDEX idx_reminder_contract (contract_id),
     INDEX idx_reminder_company (company_id),
     INDEX idx_reminder_sent (sent_at),
     CONSTRAINT fk_reminder_contract FOREIGN KEY (contract_id) REFERENCES amc_contracts(id) ON DELETE CASCADE,
     CONSTRAINT fk_reminder_company FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
   ```

3. **Configurable Reminder Milestones Seed:**
   Seeded into `site_settings`:
   - `setting_key`: `'amc_reminder_milestones_days'`
   - `setting_value`: `'30,15,7,1'`
   - `is_public`: `0`

---

## 4. Automated Expiry Reminders Engine

### Architecture & Clustering Safety
- **Scheduler:** `server/schedulers/amc.scheduler.js`
- **Advisory Lock:** Employs MySQL level locking `SELECT GET_LOCK('tekdoctor_amc_scheduler_lock', 0)` to guarantee that only a single Node.js worker runs the sweep at any scheduled cycle, preventing race conditions in horizontally scaled or clustered production environments.
- **Default Schedule:** Runs daily at midnight UTC (`0 0 * * *`), with automatic execution 15 seconds after application boot.

### Multi-Worker & Restart Deduplication
- Reminders use atomic `INSERT INTO amc_expiry_reminders` relying on `uk_contract_milestone_expiry`.
- Duplicate attempts trigger `ER_DUP_ENTRY` (MySQL error 1062), which is caught cleanly without sending duplicate email or in-app alerts.
- Verified in tests by running sweeps back-to-back; 0 duplicate deliveries occurred.

### Channels
1. **In-App Notification:** Persisted in `notifications` table for the target company user.
2. **Transactional Email:** Emits notification payload dispatched via TekDoctor mailer (`server/utils/email.util.js`).
3. **Audit History:** Emits `'EXPIRY_REMINDER_SENT'` in `amc_contract_history`.

---

## 5. Contract Expiry & Coverage Status Transition System

### Expiry Sweep: `amcService.processContractExpiries`
Executed atomically across all affected records:
1. **Active Contracts:** Selects all contracts where `status = 'active' AND end_date < CURRENT_DATE()`.
2. **Status Transition:** Updates `amc_contracts.status = 'expired'`.
3. **Device Coverage Cascade:** Updates all linked active devices in `amc_covered_devices.status = 'expired'`.
4. **Fleet Synchronization:** Updates `company_devices.is_amc = 0` for all affected devices (unless covered by another distinct active AMC contract).
5. **Offer Validity Sweep:** Selects all contracts where `status = 'offered' AND offer_valid_until < CURRENT_DATE()`, transitions them to `'expired'`, and logs `'OFFER_EXPIRED'`.
6. **Rejection of Expired Offers:** `acceptAmcOffer` evaluates offer validity and strictly rejects acceptance attempts on expired offers with HTTP 400.

---

## 6. AMC Renewal Lifecycle & Safeguards

### Renewal Request & Offer Workflow
```
[Active/Expired Contract]
        │
        ▼ (Company clicks "Renew AMC" or Admin initiates)
[amc_requests] (Type: Renewal, Requested Capacity: e.g. 50 devices)
        │
        ▼ (Admin creates Renewal Contract)
[amc_contracts] (status: offered, contract_type: renewal, is_renewal: 1, previous_contract_id: X)
        │
        ▼ (Company accepts & completes payment)
[amc_contracts] (status: active, approval_status: approved, payment_status: paid)
        │
        ▼ (Explicit Device Allocation)
[amc_covered_devices] (Company selects up to renewed quota)
```

### Key Business Safeguards Verified
1. **Reduced-Capacity Renewals:** Companies can downsize fleets (e.g. from 100 devices to 50 devices). Admin sets the new `device_capacity` accordingly.
2. **Gap Renewals (Prohibition of Retroactive Coverage):** If a contract expired prior to renewal, `startDate` cannot be backdated to the old expiration date. The backend enforces `startDate >= CURRENT_DATE()` with an explicit business validation exception.
3. **Device Coverage Isolation:** Previous covered devices are **never** automatically rolled over. The new renewal contract starts with `amc_covered_devices` count = 0, enforcing explicit device selection.

---

## 7. Contract Certificate & Compliance PDF Engine

### Backend Authoritative Data Contract
- **Endpoint:** `GET /api/amc/contracts/:id/certificate`
- **Authentication:** `authenticate`, `authorize('admin', 'company')`
- **Tenant Isolation:** Strictly verified. A company user can only access certificates for contracts matching their own company profile. Cross-tenant access is rejected with `403 Forbidden`. Admins have universal read access.
- **Verification Hash:** Cryptographic SHA-256 signature generated from `contract_number`, `start_date`, `end_date`, and `company_id`.
- **SLA Parameters:** Authoritative turnaround hours, labor discount, parts discount, and quarterly audit entitlement.

### Client-Side PDF Generation & Print
- File: `client/src/utils/amcCertificateGenerator.ts`
- Utilizes dynamic import of `html2pdf.js` for instant PDF downloads (`TekDoctor-AMC-Certificate-<NUMBER>.pdf`).
- Provides dedicated print layout helper utilizing browser print dialog with print-optimized CSS rules.

---

## 8. Frontend Integration

### Admin AMC Management (`AdminAmcManagement.tsx`)
- **New Tab: Expiry Reminders:** Displays real-time audit ledger of all milestone notices dispatched, contract numbers, recipient companies, milestones, delivery statuses, and timestamps.
- **Manual Maintenance Controls:**
  - `Sweep Expiries`: Manually triggers contract and offer expiration check.
  - `Dispatch Milestones`: Manually runs milestone reminder evaluation.
- **Renewal Offer Modal:** Accessible directly from contract rows; pre-populates previous contract details, enforces prospective dates, and captures custom pricing/capacity.
- **Certificate Actions:** "Download Certificate" and "Print Certificate" added to contract drawer.

### Company Portal AMC Management (`CompanyAmcManagement.tsx`)
- **Contract Cards & Drawer:**
  - Added "Renew AMC" button for active contracts approaching expiration or expired contracts.
  - Added "Download Certificate" and "Print" actions with inline loading states.
- **Request AMC Renewal Modal:**
  - Displays current capacity and terms.
  - Allows company to specify requested capacity adjustments (expansion or downsizing).
  - Captures renewal notes and submits renewal request to Admin.

---

## 9. Automated Test Suite & Regression Verification

### 1. Dedicated Phase 3 Test Suite (`server/tests/verify-amc-phase3.js`)
Executed via `node server/tests/verify-amc-phase3.js` against live database:

```
====================================================
TEST SUITE: AMC Phase 3 Verification
====================================================

[Feature 1] Automated AMC Expiry Reminders & Deduplication
  ✓ Milestone reminder generated and logged to amc_expiry_reminders
  ✓ Audit history logged for expiry reminder
  ✓ Multi-worker and restart deduplication verified (UNIQUE KEY prevents duplicate delivery)
  ✓ Admin expiry reminders history endpoint verified

[Feature 2] Contract Expiry & Coverage Status Transitions
  ✓ Lapsed active contract transitioned to "expired"
  ✓ Covered device transitioned from "active" to "expired"
  ✓ Legacy company_devices.is_amc synchronized to 0
  ✓ CONTRACT_EXPIRED audit event logged
  ✓ Idempotency verified: re-running expiry sweep leaves state unchanged

[Feature 3] Offer Expiry Status Transitions & Acceptance Rejection
  ✓ acceptAmcOffer rejects offer past validity deadline
  ✓ OFFER_EXPIRED audit event recorded in history

[Feature 4] AMC Renewal Workflow, Reduced Capacity & Gap Safeguards
  ✓ Company renewal request created with reduced capacity
  ✓ RENEWAL_REQUESTED recorded in previous contract audit trail
  ✓ Retroactive backdating correctly blocked for gap renewal
  ✓ Prospective renewal contract created with reduced capacity
  ✓ Renewal database links (previous_contract_id, is_renewal, contract_type) verified
  ✓ Device coverage isolation verified (no automatic device rollover)

[Feature 5] AMC Certificate Data Contract & Tenant Isolation
  ✓ Authoritative certificate data contract verified for admin access
  ✓ Contract holder successfully accesses certificate
  ✓ Strict tenant isolation enforced (cross-tenant access prohibited)
  ✓ Non-existent contract request returns clear not found error

====================================================
ALL AMC PHASE 3 TESTS PASSED (21/21)
====================================================
```

### 2. Comprehensive Regression Verification
Every existing test suite was executed to ensure zero breaking changes across all modules:

| Test Script | Area Tested | Result |
| :--- | :--- | :--- |
| `server/tests/verify-amc-phase3.js` | Phase 3 Reminders, Expiries, Renewals, Certificates | **21 passed, 0 failed** |
| `server/tests/verify-amc-four-fixes.js` | Payments, Duplicate Exclusions, Replacements, Dates | **8 passed, 0 failed** |
| `server/tests/verify-amc-phase2.js` | Phase 2 Admin & Company Lifecycle, Future Dates | **61 passed, 0 failed** |
| `server/tests/verify-amc-phase1.js` | Phase 1 Schema, Quotas, Eligibility, Replacements | **44 passed, 0 failed** |
| `server/tests/verify-ticket-system.js` | Sequential Ticket Numbering, Concurrency | **25 passed, 0 failed** |
| `server/tests/verify-company-id-ticket-serial-consistency.js` | Canonical Company IDs, Cross-Portal Consistency | **42 passed, 0 failed** |
| `server/tests/verify-client-dropdown-logic.js` | Client Pincode and District Dropdown Logic | **16 passed, 0 failed** |
| **Client Frontend Build (`tsc -b && vite build`)** | TypeScript Compilation & Production Bundling | **Exit Code 0 (Built in 2.61s)** |

---

## 10. Production Deployment Runbook

### Database Initialization
- Schema changes are automated on startup via `server/models/db.init.js`.
- During application startup (`node server.js`), migration `2026_13_amc_expiry_reminders_and_phase3` executes idempotently, altering the ENUM and creating `amc_expiry_reminders`.

### Environment Configuration
- No new required `.env` variables are needed.
- `site_settings` contains `amc_reminder_milestones_days` (`30,15,7,1`), customizable via database or admin settings without redeploying.

### Background Worker Process
- `server/schedulers/amc.scheduler.js` is automatically spawned when `server.js` boots.
- Single-instance safety is guaranteed by MySQL `GET_LOCK('tekdoctor_amc_scheduler_lock', 0)`.

---

## 11. Files Changed & Inventory

| File Path | Description of Changes |
| :--- | :--- |
| `server/models/db.init.js` | Added migration `2026_13_amc_expiry_reminders_and_phase3`, updated `amc_covered_devices.status` ENUM, added `amc_expiry_reminders` table, seeded default milestone settings. |
| `server/services/amc.service.js` | Implemented `processContractExpiries`, `processExpiryReminders`, `processSelectionDeadlineReminders`, `requestAmcRenewal`, `createAmcRenewalContract`, `getContractCertificateData`, `getExpiryRemindersHistory`, and updated `acceptAmcOffer`. |
| `server/controllers/amc.controller.js` | Added controller handlers for certificate retrieval, renewal request/creation, reminders history, and manual maintenance triggers. |
| `server/routes/amc.routes.js` | Mounted REST endpoints under `/api/amc/*` with role-based auth middleware. |
| `server/schedulers/amc.scheduler.js` | Created background cron scheduler with MySQL advisory locking. |
| `server/server.js` | Wired `startAmcScheduler` into server initialization lifecycle. |
| `server/tests/verify-amc-phase3.js` | Created end-to-end automated test suite covering all Phase 3 requirements. |
| `client/src/services/api.ts` | Added Phase 3 API methods to `amcApi` for certificates, renewals, reminders, and sweep triggers. |
| `client/src/utils/amcCertificateGenerator.ts` | Created certificate template renderer, printable layout, and PDF download utility. |
| `client/src/pages/admin/AdminAmcManagement.tsx` | Added Expiry Reminders audit tab, sweep trigger buttons, Renewal offer modal, and Certificate actions. |
| `client/src/pages/company/CompanyAmcManagement.tsx` | Added renewal request modal, contract certificate download/print triggers, and status badge handling. |

