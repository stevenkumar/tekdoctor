# TekDoctor AMC Phase 3 — Final Production Hardening Report

**Project:** TekDoctor AMC Management Module  
**Lifecycle Stage:** Phase 3 Final Production Hardening  
**Date:** October 31, 2026  
**Status:** **APPROVED & FULLY HARDENED FOR PRODUCTION**  
**Total Verification Checks Passed:** 244 / 244 (Across 9 Automated Suites)  
**Client Bundle Build:** Clean Build (0 TypeScript / Vite Errors)

---

## Executive Summary

Following the comprehensive read-only audit ([`TEKDOCTOR_AMC_PHASE_3_FINAL_APPROVAL_AUDIT.md`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/TEKDOCTOR_AMC_PHASE_3_FINAL_APPROVAL_AUDIT.md)), all six identified operational, cryptographic, and resiliency findings have been resolved and hardened.

The hardening implements:
1. **Exponential Retry Backoff (P0)** with outbox claim safety, persisted scheduling (`next_retry_at`), channel isolation, and explicit documentation of the single-delivery SMTP crash window.
2. **Admin Reminder Audit UI & Manual Retry Action (P1)** with real-time status filtering, channel-level tracking, error message inspection, and manual re-dispatch capabilities.
3. **Public Certificate Rate Limiting (P1)** with strict window capping (30 req / 15 min per IP) and data minimization.
4. **Certificate HMAC Secret Rotation (P1)** supporting active signing key (`v2_hmac`), secondary rotated keys (`v2_hmac_rotated`), and legacy plain SHA-256 fallback (`v1_legacy`).
5. **Authoritative AMC Business Timezone (P1)** enforcing explicit `Asia/Kolkata` calendar date formatting without server UTC-boundary shifts.
6. **Certificate Date Canonicalization (P1)** enforcing strict `YYYY-MM-DD` validation and corrupt input rejection before signature calculation.

All existing contracts, invoices, tickets, and reminder histories remain intact without destructive mutations.

---

## Detailed Findings & Hardening Implementation

### Fix 1: Reminder Retry Backoff (P0)

#### 1. Finding & Root Cause
- **Finding:** Failed reminder sweeps retried immediately on every cron invocation (every 10 minutes) regardless of transient network failures, causing rapid retry exhaustion up to the limit of 5. Additionally, the SMTP crash window (email accepted by SMTP server but worker crashes before database update) lacked formal failure analysis.
- **Root Cause:** Reminders were filtered only by `delivery_status IN ('pending', 'failed', 'partial')` without a persistent timestamp gating future retries.

#### 2. Implementation
- Added column `next_retry_at TIMESTAMP NULL` and index `idx_amc_rem_next_retry` to `amc_expiry_reminders` via migration `2026_15_amc_phase3_hardening`.
- Configured dynamic retry base delay in site settings: `amc_reminder_retry_base_minutes` (default: 15 minutes).
- Implemented exponential backoff algorithm:
  $$\Delta t = \text{baseMinutes} \times 2^{\text{retry\_count} - 1}$$
  - Attempt 1 failure: delay 15 minutes (`15 * 2^0`).
  - Attempt 2 failure: delay 30 minutes (`15 * 2^1`).
  - Attempt 3 failure: delay 60 minutes (`15 * 2^2`).
  - Attempt 4 failure: delay 120 minutes (`15 * 2^3`).
  - Attempt 5: permanently marked `failed`, excluded from automated outbox sweeps.
- Updated outbox claiming query:
  ```sql
  WHERE (delivery_status = 'pending' OR (delivery_status IN ('failed', 'partial') AND retry_count < 5))
    AND (next_retry_at IS NULL OR next_retry_at <= NOW())
  ```
- **SMTP Crash Window Analysis & Recovery Policy:**
  - Standard SMTP protocols acknowledge receipt before message delivery; once the socket write receives `250 OK`, SMTP dispatch has succeeded. If a worker process crashes between SMTP socket completion and MySQL row update, the row remains in `processing`.
  - Stale worker recovery (`INTERVAL 5 MINUTE`) resets crashed rows to `failed` and schedules backoff. On the subsequent sweep, independent channel isolation checks if the email channel was marked `success`; if the crash occurred prior to recording `email_status = 'success'`, a duplicate email may be sent.
  - **Mitigation:** The system logs an idempotent tracking ID `X-TekDoctor-Reminder-ID: <id>` in mail headers and persists delivery state per-channel immediately upon receipt of SMTP `250 OK`.

---

### Fix 2: Admin Reminder Audit UI & Manual Retry Action (P1)

#### 1. Finding & Root Cause
- **Finding:** The Admin AMC Management interface lacked visibility into failed delivery channels, retry counts, and next retry schedules, and administrators could not manually trigger a retry for stuck or failed reminders.
- **Root Cause:** Backend API returned unparsed metadata and lacked status filtering, while frontend table only rendered binary status indicators.

#### 2. Implementation
- **Backend API & Controller:**
  - Extended `getExpiryRemindersHistory` to accept a `status` filter parameter (`all`, `failed`, `partial`, `success`, `pending`, `processing`).
  - Parsed `metadata` JSON to expose channel-specific error messages.
  - Added `retryReminder(reminderId, adminUserId)` service function that:
    - Atomically claims the row.
    - Resets `next_retry_at = NOW()` and re-dispatches unfulfilled channels.
    - Logs admin trigger action: `manualRetriedBy: adminUserId` in JSON metadata.
    - Mounted endpoint `POST /api/amc/admin/reminders/:id/retry` with Admin authorization.
- **Frontend Dashboard:**
  - Updated [`client/src/pages/admin/AdminAmcManagement.tsx`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/client/src/pages/admin/AdminAmcManagement.tsx):
    - Added Status Filter Dropdown (`All Statuses`, `Failed Only`, `Partial Only`, `Delivered Only`, `Pending Only`).
    - Styled status badges with semantic colors: Delivered (emerald), Partial (amber), Failed (rose), Processing (blue), Queued (zinc).
    - Added Channel Breakdown badges displaying in-app and email statuses.
    - Added error tooltip displaying raw SMTP or system failure messages.
    - Added "Retry" action button for `failed` or `partial` records with inline loading spinner and feedback toast.

---

### Fix 3: Public Certificate Verification Rate Limiting (P1)

#### 1. Finding & Root Cause
- **Finding:** The public certificate verification route `GET /api/amc/public/verify-certificate/:code` was mounted on the public router without dedicated rate limiting, creating vulnerability to automated enumeration or brute-force code scanning.
- **Root Cause:** Standard API rate limiting was too permissive for high-security public cryptographic verification.

#### 2. Implementation
- Implemented `certVerifyLimiter` in [`server/middleware/rateLimiter.middleware.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/middleware/rateLimiter.middleware.js):
  - Standard window: 15 minutes.
  - Maximum attempts: 30 requests per IP address.
  - Clear JSON error message: `{"error": "Too many certificate verification attempts. Please try again in 15 minutes."}`.
- Mounted `certVerifyLimiter` specifically on `GET /public/verify-certificate/:code` in [`server/routes/amc.routes.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/routes/amc.routes.js).
- Maintained sanitized public payload returning only non-sensitive verification status (`isValid`, `companyName`, `planName`, `startDate`, `endDate`, `status`, `verificationType`), completely omitting financials and serial numbers.

---

### Fix 4: Certificate HMAC Secret Rotation (P1)

#### 1. Finding & Root Cause
- **Finding:** The system verified HMAC signatures against a single active secret. Rotating the secret in `.env` would immediately invalidate all previously issued physical or digital certificates.
- **Root Cause:** `verifyCertificateAuthenticity` checked only the primary signing key with fallback to plain SHA-256.

#### 2. Implementation
- Updated configuration in [`server/config/app.config.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/config/app.config.js) to support `AMC_CERTIFICATE_PREVIOUS_SECRETS` (comma-delimited list of retired secrets).
- Updated cryptographic verification in [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js):
  1. Computes signature against current signing secret: returns `{ valid: true, verificationType: 'v2_hmac' }`.
  2. If unmatched, iterates through `previousSecrets`: returns `{ valid: true, verificationType: 'v2_hmac_rotated' }`.
  3. If unmatched, checks legacy SHA-256 hash: returns `{ valid: true, verificationType: 'v1_legacy' }`.
  4. If all fail, returns `{ valid: false, verificationType: 'invalid' }`.
- Guarantees zero-downtime key rotation across historical certificate batches.

---

### Fix 5: Explicit AMC Business Timezone (P1)

#### 1. Finding & Root Cause
- **Finding:** Server environments running under `TZ=UTC` or host timezones other than IST could evaluate calendar day boundaries differently, potentially causing 1-day shifts when converting MySQL `DATE` fields to JavaScript `Date` objects.
- **Root Cause:** Standard JavaScript `Date` methods (`getFullYear`, `getMonth`, `getDate`) resolve against local runtime timezone rather than the business timezone.

#### 2. Implementation
- Defined canonical timezone constant `AMC_TIMEZONE = 'Asia/Kolkata'` in [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js).
- Implemented `formatDateOnly(dateVal)` using `Intl.DateTimeFormat('en-CA', { timeZone: AMC_TIMEZONE })` to guarantee deterministic `YYYY-MM-DD` string resolution.
- Implemented `getBusinessTodayStr()` resolving the exact Indian calendar date for all milestone evaluations, deadline calculations, and contract expirations.

---

### Fix 6: Certificate Date Canonicalization (P1)

#### 1. Finding & Root Cause
- **Finding:** Formatting variations in dates (e.g. ISO string with millisecond timestamps vs raw SQL date strings) could yield mismatched canonical payload strings across environments. Malformed date inputs were not rejected upfront.
- **Root Cause:** Date normalization lacked strict format regex validation before payload concatenation.

#### 2. Implementation
- Updated `generateCertificateCanonicalPayload(contract)`:
  - Formats `startDate` and `endDate` via `formatDateOnly()`.
  - Enforces strict regex validation `/^\d{4}-\d{2}-\d{2}$/`.
  - Throws explicit `INVALID_CONTRACT_DATES` error if inputs are invalid or unparseable.
  - Constructs canonical string: `<contractNumber>:<YYYY-MM-DD>:<YYYY-MM-DD>:<deviceCapacity>`.

---

## Database Migration Details

**Migration File:** `server/models/db.init.js`  
**Migration Key:** `2026_15_amc_phase3_hardening`  
**Execution:** Idempotent, Additive, Non-Destructive

```sql
-- 1. Add next_retry_at column to amc_expiry_reminders
ALTER TABLE amc_expiry_reminders 
ADD COLUMN next_retry_at TIMESTAMP NULL AFTER retry_count;

-- 2. Add composite index for backoff sweep performance
CREATE INDEX idx_amc_rem_next_retry 
ON amc_expiry_reminders (delivery_status, next_retry_at, retry_count);

-- 3. Seed site settings
INSERT IGNORE INTO site_settings (setting_key, setting_value, setting_group, is_public, description)
VALUES 
  ('amc_reminder_retry_base_minutes', '15', 'amc', 0, 'Base minutes for exponential retry backoff delay on failed expiry reminders'),
  ('amc_business_timezone', 'Asia/Kolkata', 'amc', 0, 'Authoritative business timezone for AMC contracts and reminders');
```

---

## Verification Test Results

All 9 automated test suites were executed sequentially against the hardened application. Zero failures were recorded across 244 individual assertions.

| Test Suite | Command | Result | Checked Items |
| :--- | :--- | :---: | :--- |
| **AMC Phase 3 Final Hardening** | `node server/tests/verify-amc-final-hardening.js` | **13 / 13 PASSED** | Exponential backoff, outbox claiming, retry cap, admin UI endpoints, rate limiter, HMAC rotation, timezone invariance, canonical dates |
| **AMC Phase 3 Remediation Audit** | `node server/tests/verify-amc-production-audit.js` | **14 / 14 PASSED** | Channel isolation, stale recovery, transaction atomicity, deadline gating, duplicate request prevention, scheduler locks |
| **AMC Phase 3 Core Functional** | `node server/tests/verify-amc-phase3.js` | **21 / 21 PASSED** | Expiry reminders, status transitions, offer lapse, renewal creation, certificate data contract |
| **AMC 4 Fixes Verification** | `node server/tests/verify-amc-four-fixes.js` | **8 / 8 PASSED** | Payment verification, duplicate covered device prevention, replacement modal list, date formatting |
| **AMC Phase 2 Workflows** | `node server/tests/verify-amc-phase2.js` | **61 / 61 PASSED** | Plan management, request lifecycle, contract offers, online/offline payment, device allocation, replacements, explicit dates |
| **AMC Phase 1 Backend** | `node server/tests/verify-amc-phase1.js` | **44 / 44 PASSED** | Schema completeness, ticket numbering, fleet decoupling, eligibility checking, capacity enforcement, audit history |
| **Global Ticket System** | `node server/tests/verify-ticket-system.js` | **25 / 25 PASSED** | Per-account numbering, monotonic sequence contiguity, concurrency safety |
| **Company ID & Serial Consistency** | `node server/tests/verify-company-id-ticket-serial-consistency.js` | **42 / 42 PASSED** | Canonical IDs, device serial numbers, repair history, cross-tenant isolation |
| **Client Dropdown & Logic** | `node server/tests/verify-client-dropdown-logic.js` | **16 / 16 PASSED** | Pincode district resolution, client field validation, state clearing |
| **Client Frontend Production Build** | `npm run build --prefix client` | **CLEAN BUILD** | Zero TypeScript compilation errors, Vite production bundle generated |
| **TOTAL** | | **244 / 244 PASSED** | **100% Pass Rate** |

---

## Modified & Added Files Summary

### Modified Files
1. [`server/models/db.init.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/models/db.init.js) — Added migration `2026_15_amc_phase3_hardening` (`next_retry_at`, index, default site settings).
2. [`server/config/app.config.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/config/app.config.js) — Added `amc` configuration block and `certVerify` rate limit configuration.
3. [`server/middleware/rateLimiter.middleware.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/middleware/rateLimiter.middleware.js) — Implemented `certVerifyLimiter` (30 req / 15 min).
4. [`server/routes/amc.routes.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/routes/amc.routes.js) — Mounted rate limiter on public verify route; mounted `POST /admin/reminders/:id/retry`.
5. [`server/services/amc.service.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/services/amc.service.js) — Implemented exponential backoff, retry claiming, `retryReminder`, secret rotation keyring, timezone helper `formatDateOnly()`, and date canonicalization.
6. [`server/controllers/amc.controller.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/controllers/amc.controller.js) — Added `retryAdminReminder` controller method.
7. [`client/src/services/api.ts`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/client/src/services/api.ts) — Added `retryAdminReminder` and updated `getAdminReminders` with `status` filter.
8. [`client/src/pages/admin/AdminAmcManagement.tsx`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/client/src/pages/admin/AdminAmcManagement.tsx) — Added reminder filter dropdown, color-coded badges, error messages, and retry button with spinner.

### Added Files
1. [`server/tests/verify-amc-final-hardening.js`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/server/tests/verify-amc-final-hardening.js) — Automated test suite covering the 6 hardening fixes.
2. [`TEKDOCTOR_AMC_PHASE_3_FINAL_HARDENING_REPORT.md`](file:///c:/Users/Vivek%20Kumar/Downloads/tekdoctor-main/tekdoctor-main/TEKDOCTOR_AMC_PHASE_3_FINAL_HARDENING_REPORT.md) — This report.

---

## Production Deployment Runbook

1. **Environment Variables Configuration (`server/.env`):**
   ```env
   # Cryptographic Secrets
   AMC_CERTIFICATE_SECRET=<strong-random-secret>
   # When rotating, move previous secret here (comma-separated):
   AMC_CERTIFICATE_PREVIOUS_SECRETS=<old-secret-1>,<old-secret-2>
   
   # Timezone (Defaults to Asia/Kolkata if omitted)
   AMC_BUSINESS_TIMEZONE=Asia/Kolkata
   ```

2. **Database Initialization:**
   Start the backend service; `initDatabase()` automatically applies migration `2026_15_amc_phase3_hardening` idempotently.

3. **Frontend Build & Deployment:**
   ```bash
   npm run build --prefix client
   ```
   Deploy `client/dist` contents to public hosting directory (e.g. `public_html`).

4. **Verify Live Health & AMC Endpoints:**
   - Health check: `GET /health` -> `{"status": "UP", "database": "connected"}`.
   - Public certificate verification test: `GET /api/amc/public/verify-certificate/UNKNOWN` -> Returns sanitized `isValid: false` and HTTP headers include rate limiting counters (`ratelimit-remaining`).

