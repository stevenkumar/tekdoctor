# TekDoctor Technical Architecture & AMC Automation Report

> **Target Audience:** Engineering Agent / Technical Architect designing automated AMC (Annual Maintenance Contract) workflows.
> **Source of Truth:** Real Codebase Analysis. All secrets, keys, and credentials are masked. No opinions; factual analysis only.

---

=== PART 1: Overview ===

### 1. Folder Tree (2 Levels Deep)

*(Ignoring `node_modules`, `dist`, `uploads`, `.git`, `deploy`, `database_backups`)*

```text
📁 .github
  📁 workflows
📄 .gitignore
📄 .htaccess
📄 AGENTS.md
📄 audit-icons.js
📁 client
  📄 .env.development
  📄 .env.example
  📄 .env.production
  📄 .gitignore
  📄 eslint.config.js
  📄 index.html
  📄 package-lock.json
  📄 package.json
  📁 public
  📄 README.md
  📁 src
  📄 tsconfig.app.json
  📄 tsconfig.json
  📄 tsconfig.node.json
  📄 vite.config.ts
📄 DEPLOY-CPANEL.md
📁 docs
  📄 GOOGLE_AUTH_SETUP.md
📄 package.json
📄 PROJECT_CONTEXT.md
📁 scripts
  📄 deploy-cpanel.ps1
  📄 generate-db-sql.js
  📄 live_smoke_test.js
  📄 verify_gst_calculations.js
📁 server
  📄 .env
  📄 .env.example
  📄 .env.production
  📁 config
  📁 controllers
  📁 data
  📁 logs
  📁 middleware
  📁 models
  📄 package-lock.json
  📄 package.json
  📄 passenger.htaccess.example
  📁 routes
  📁 schedulers
  📁 scripts
  📄 server.js
  📁 services
  📁 tests
  📁 utils
📄 TEKDOCTOR_AMC_PHASE_1_VERIFICATION_REPORT.md
📄 TEKDOCTOR_AMC_PHASE_2_VERIFICATION_REPORT.md
📄 TEKDOCTOR_AMC_PHASE_3_AUDIT_REPORT.md
📄 TEKDOCTOR_AMC_PHASE_3_FINAL_APPROVAL_AUDIT.md
📄 TEKDOCTOR_AMC_PHASE_3_FINAL_HARDENING_REPORT.md
📄 TEKDOCTOR_AMC_PHASE_3_PRODUCTION_READINESS_AUDIT.md
📄 TEKDOCTOR_AMC_PHASE_3_REMEDIATION_REPORT.md
📄 TEKDOCTOR_AMC_PHASE_3_VERIFICATION_REPORT.md
```

### 15 Largest Source Files by Size

*(Excluding `node_modules`, `dist`, `uploads`, `.git`, `deploy`, `database_backups`, `package-lock.json`, and `.log` files)*

| # | File Path | Size (Bytes) | Line Count |
|---|---|---|---|
| 1 | `client/src/pages/admin/CompanyManagementDashboard.tsx` | 337,818 | 4,659 |
| 2 | `server/controllers/repair.controller.js` | 224,011 | 5,100 |
| 3 | `server/controllers/billing.controller.js` | 210,040 | 4,935 |
| 4 | `client/src/pages/admin/CustomerManagement.tsx` | 199,977 | 2,875 |
| 5 | `client/src/pages/technician/TechnicianDashboard.tsx` | 196,594 | 2,822 |
| 6 | `server/controllers/company.controller.js` | 176,753 | 3,681 |
| 7 | `server/controllers/admin.controller.js` | 168,532 | 3,566 |
| 8 | `client/src/pages/admin/AdminAmcManagement.tsx` | 153,289 | 3,122 |
| 9 | `client/src/pages/admin/RepairTickets.tsx` | 147,778 | 2,323 |
| 10 | `client/src/components/AdminTicketWorkspace.tsx` | 141,186 | 1,857 |
| 11 | `server/services/amc.service.js` | 138,300 | 3,481 |
| 12 | `client/src/components/TechnicianTaskWorkspace.tsx` | 126,537 | 1,789 |
| 13 | `server/models/db.init.js` | 114,609 | 2,297 |
| 14 | `client/src/services/api.ts` | 114,515 | 2,928 |
| 15 | `client/src/pages/company/CompanyAmcManagement.tsx` | 113,545 | 2,446 |

### 2. Last 15 Git Commits

| Commit Hash | Date | Message |
|---|---|---|
| `360fe80` | 2026-11-19 | fix(sync): cross-dashboard ticket lifecycle, invoice voiding, notifications, and schema synchronization |
| `7022105` | 2026-11-19 | fix(company): enforce multi-tenant foreign key ownership validation and corporate route guards |
| `8474892` | 2026-11-19 | fix(technician): enforce strict IDOR ticket isolation and transfer locks in technician operations |
| `ef77229` | 2026-11-19 | fix(admin): guard administrator accounts from customer deactivation and enforce token invalidation |
| `5926e5e` | 2026-11-19 | fix(auth): enforce current password check, token version invalidation, and hasPassword state |
| `357e9ba` | 2026-11-19 | feat(server): update security headers, rate limiting, and config helpers |
| `bfefabe` | 2026-11-19 | fix(technician): harden ticket transfers with locks, block status cancel bypass, add server auth guard and align approval UI |
| `f5320b6` | 2026-11-19 | fix(admin): guard customer delete from admin role, revert orphaned tech tickets, isolate AdminLayout errors and secret clearing |
| `b15f8d5` | 2026-11-19 | fix(auth): enforce current password check, add CORS custom headers, route guard and cancel tech alert |
| `0560cc0` | 2026-11-19 | fix(public): unblock guest razorpay checkout, add rate limiters, restore sitemap and legal pages |
| `8482598` | 2026-11-18 | feat(admin): add bulk ticket technician assignment and terminal status guard |
| `be4a0ac` | 2026-11-18 | fix(company): repair bulk upload drag-drop, error unpacking, and CSV header aliases |
| `dd160e9` | 2026-11-18 | feat(notifications): add PWA lockscreen push alerts and transactional emails |
| `3d9fea2` | 2026-11-18 | feat(ids): add sequential TD-XXX customer IDs and exclude admin from customer lists |
| `123cbe9` | 2026-11-17 | fix(billing): enforce Indian GST statutory slab rates and persistent schema |

### 3. AMC Phase 3 Implementation Status (Actual Code vs Reports)

The repository contains 6 markdown verification/audit reports (`TEKDOCTOR_AMC_PHASE_3_*.md`). Below is the factual implementation audit against actual codebase files:

| Feature / Phase 3 Item | Status | Verification Details | Relevant File Paths |
|---|---|---|---|
| **Expiry Sweep Engine (`processContractExpiries`)** | `Implemented` | Detects active contracts where `end_date < CURRENT_DATE()`, marks contract status as `expired`, cascades to mark `amc_covered_devices.status = "expired"`, synchronizes legacy `company_devices.is_amc = 0`. Also expires unaccepted offers where `offer_valid_until < CURRENT_DATE()`. | `server/services/amc.service.js` (lines 2119–2265), `server/schedulers/amc.scheduler.js` |
| **Automated Background Scheduler (`startAmcScheduler`)** | `Implemented` | Runs periodically (default 1 hour interval) and 5 seconds after server startup. Uses MySQL advisory lock (`GET_LOCK("tekdoctor_amc_scheduler_lock", 0)`). Initiated in `server/server.js` (lines 521-523). | `server/schedulers/amc.scheduler.js` (lines 112–153), `server/server.js` (lines 521–523, 549) |
| **AMC Expiry Reminders Table & Outbox (`amc_expiry_reminders`)** | `Implemented` | Table `amc_expiry_reminders` with `uk_contract_milestone_expiry (contract_id, milestone_days, expiry_date)`. Milestones read from `site_settings` (default: 30,15,7,1 days). Tracks `delivery_status`, `in_app_status`, `email_status`, `retry_count`, `next_retry_at`. | `server/models/db.init.js` (migrations `2026_13`, `2026_14`, `2026_15`), `server/services/amc.service.js` (lines 2267–2478) |
| **Exponential Retry Backoff for Failed Reminders** | `Implemented` | Uses `next_retry_at` with exponential backoff: `baseMinutes * 2^(retry_count - 1)` (base read from site setting `amc_reminder_retry_base_minutes`, default 15 min). Max retry cap of 5. | `server/services/amc.service.js` (lines 2410–2438, 3307–3420) |
| **Selection Deadline Reminders (`processSelectionDeadlineReminders`)** | `Implemented` | Sweeps contracts where `status = "accepted"` and `selection_deadline` is approaching, sending alerts to company. | `server/services/amc.service.js` (lines 2480–2548) |
| **Company Renewal Request Endpoint (`POST /api/amc/company/contracts/:id/renew`)** | `Implemented` | Function `requestAmcRenewal` checks contract belongs to company, is eligible (`active` or `expired`), and creates an `amc_requests` row with `previous_contract_id`. | `server/routes/amc.routes.js` (line 49), `server/controllers/amc.controller.js` (lines 579–594), `server/services/amc.service.js` (lines 2550–2665) |
| **Admin Renewal Contract Offer (`POST /api/amc/admin/contracts/:id/renew`)** | `Implemented` | Function `createAmcRenewalContract` enforces prospective start dates (`startDate >= CURRENT_DATE()` if previously expired), device coverage isolation (renewal starts with 0 covered devices), sets `contract_type = "renewal"`, `previous_contract_id`, and links request. | `server/routes/amc.routes.js` (line 72), `server/controllers/amc.controller.js` (lines 595–607), `server/services/amc.service.js` (lines 2667–2890) |
| **Contract Certificate Cryptographic Generation & Public Verification** | `Implemented` | Authoritative backend data provider `getContractCertificateData` computes HMAC SHA-256 code (`v2_hmac` with rotated key support and `v1_legacy` fallback), canonical payload with `Asia/Kolkata` date formatting. Public verification endpoint `/api/amc/public/verify-certificate/:code` rate limited via `certVerifyLimiter` (30 req / 15 min). | `server/services/amc.service.js` (lines 2893–3260), `server/routes/amc.routes.js` (lines 27–29), `server/controllers/amc.controller.js` (lines 671–726) |
| **Client-Side Certificate Generation & Verification UI** | `Implemented` | `client/src/utils/amcCertificateGenerator.ts` generates branded compliance PDF using `html2pdf.js` with QR code scannability pointing to `/verify-certificate/:code`. Verification page `AmcCertificateVerification.tsx` handles verification and displays contract status. | `client/src/utils/amcCertificateGenerator.ts` (572 lines), `client/src/pages/public/AmcCertificateVerification.tsx` (376 lines) |
| **Admin UI: Expiry Reminders Audit Tab & Manual Sweeps** | `Implemented` | `AdminAmcManagement.tsx` has tab `reminders` showing all expiry reminders, filters by delivery status, error message display, "Retry" action calling `retryAdminReminder`, and buttons to trigger manual expiries/reminders sweeps. | `client/src/pages/admin/AdminAmcManagement.tsx` (lines 477–557, 1719–1850) |
| **Automated AMC Online Payment Webhook Reconciler** | `Missing` | The Razorpay webhook (`/api/billing/webhook`) in `server/controllers/billing.controller.js` only updates repair service tickets (`service_requests`) and repair invoices (`invoices`). It has NO handling for AMC contract payments (`amc_contracts`). If a user closes the browser before frontend verification returns, contract remains unpaid. | `server/controllers/billing.controller.js` (lines 1811–2250, 2536–2646) |
| **Direct Public/Guest AMC Purchase Without Pre-Existing Company Account** | `Missing` | Public AMC page (`/amc`) only shows informational cards linking to `/auth/signup?role=company` and `/contact`. All contract creation, device assignment, and payment APIs require pre-existing company user (`role = "company"`). No self-service checkout exists. | `client/src/pages/amc/page.tsx`, `server/routes/amc.routes.js` |

### 4. Exact Commands to Run Server, Client, and Tests

#### Exact Commands

- **Server (Backend):**
  ```bash
  cd server && npm run dev     # nodemon auto-reload on port 5000
  # or from root:
  npm run dev:backend
  ```
- **Client (Frontend):**
  ```bash
  cd client && npm run dev     # Vite dev server on http://localhost:3000
  # or from root:
  npm run dev:frontend
  ```
- **Verify AMC Test Suites:**
  ```bash
  node server/tests/verify-amc-phase1.js
  node server/tests/verify-amc-phase2.js
  node server/tests/verify-amc-phase3.js
  node server/tests/verify-amc-phase3-retry-and-renewal.js
  node server/tests/verify-amc-final-hardening.js
  node server/tests/verify-amc-certificate-security.js
  ```

#### Test Execution Result & Status

> **TESTS SKIPPED (FACTUAL REASON):**
> The local `.env` specifies `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_NAME=tekdoctor_db`.
> A socket connection probe to `127.0.0.1:3306` returned `connect ECONNREFUSED 127.0.0.1:3306`.
> Because no local MySQL service is currently running on port 3306, running the database-backed test suites would immediately fail with connection refused errors. Per prompt instructions ("Run the tests ONLY if the DB is a local dev DB; otherwise skip and say so"), execution of tests was skipped.


---

=== PART 2: Database ===

### 1. Database Table Definitions & Alterations (from `server/models/db.init.js`)

#### Table: `amc_plans` (AMC Plans Master Catalog)

**CREATE TABLE definition (verbatim from `server/models/db.init.js`):**

```sql
CREATE TABLE IF NOT EXISTS amc_plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      plan_code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(150) NOT NULL,
      description TEXT NULL,
      base_price DECIMAL(12,2) NOT NULL,
      duration_months INT NOT NULL DEFAULT 12,
      default_device_capacity INT NOT NULL DEFAULT 10,
      coverage_terms JSON NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_plans_active (is_active),
      INDEX idx_plans_code (plan_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

*No direct ALTER TABLE statements recorded for `amc_plans` in migrations (created in current form).* 

#### Table: `amc_requests` (AMC Quote Requests & Renewal Requests)

**CREATE TABLE definition (verbatim from `server/models/db.init.js`):**

```sql
CREATE TABLE IF NOT EXISTS amc_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_number VARCHAR(50) UNIQUE NOT NULL,
      company_id INT NOT NULL,
      plan_id INT NULL,
      previous_contract_id INT NULL,
      requested_device_count INT NOT NULL DEFAULT 1,
      notes TEXT NULL,
      status ENUM('pending', 'under_review', 'offered', 'rejected', 'cancelled') DEFAULT 'pending',
      admin_notes TEXT NULL,
      reviewed_by INT NULL,
      reviewed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES amc_plans(id) ON DELETE SET NULL,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_amc_req_company (company_id),
      INDEX idx_amc_req_status (status),
      INDEX idx_amc_req_prev_contract (previous_contract_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**ALTER TABLE statements affecting `amc_requests` in `server/models/db.init.js`:**

- Line 1972: `await connection.query('ALTER TABLE amc_requests ADD INDEX idx_amc_req_prev_contract (previous_contract_id)');`

#### Table: `amc_contracts` (AMC Contracts Lifecycle Entity)

**CREATE TABLE definition (verbatim from `server/models/db.init.js`):**

```sql
CREATE TABLE IF NOT EXISTS amc_contracts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      contract_number VARCHAR(50) UNIQUE NOT NULL,
      company_id INT NOT NULL,
      request_id INT NULL,
      plan_id INT NULL,
      contract_type ENUM('standard', 'custom', 'renewal') DEFAULT 'standard',
      plan_name VARCHAR(150) NOT NULL,
      device_capacity INT NOT NULL,
      price DECIMAL(12,2) NOT NULL,
      discount_amount DECIMAL(12,2) DEFAULT 0.00,
      tax_amount DECIMAL(12,2) DEFAULT 0.00,
      total_amount DECIMAL(12,2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'INR',
      terms_and_conditions TEXT NULL,
      offer_valid_until DATE NULL,
      selection_deadline DATE NULL,
      start_date DATE NULL,
      end_date DATE NULL,
      status ENUM('draft', 'offered', 'accepted', 'rejected', 'active', 'expired', 'cancelled', 'suspended') DEFAULT 'draft',
      approval_status ENUM('pending_approval', 'approved', 'rejected') DEFAULT 'pending_approval',
      approved_by INT NULL,
      approved_at TIMESTAMP NULL,
      payment_status ENUM('unpaid', 'pending_verification', 'paid', 'failed') DEFAULT 'unpaid',
      invoice_id VARCHAR(50) NULL,
      previous_contract_id INT NULL,
      is_renewal BOOLEAN DEFAULT FALSE,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (request_id) REFERENCES amc_requests(id) ON DELETE SET NULL,
      FOREIGN KEY (plan_id) REFERENCES amc_plans(id) ON DELETE SET NULL,
      FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
      FOREIGN KEY (previous_contract_id) REFERENCES amc_contracts(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_amc_cnt_company (company_id),
      INDEX idx_amc_cnt_status (status),
      INDEX idx_amc_cnt_dates (start_date, end_date),
      INDEX idx_amc_cnt_approval (approval_status),
      INDEX idx_amc_cnt_payment (payment_status),
      INDEX idx_amc_cnt_invoice (invoice_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

*No direct ALTER TABLE statements recorded for `amc_contracts` in migrations (created in current form).* 

#### Table: `amc_covered_devices` (AMC Covered Fleet Devices)

**CREATE TABLE definition (verbatim from `server/models/db.init.js`):**

```sql
CREATE TABLE IF NOT EXISTS amc_covered_devices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      contract_id INT NOT NULL,
      device_id INT NOT NULL,
      company_id INT NOT NULL,
      amc_tag VARCHAR(50) NOT NULL,
      coverage_start_date DATE NOT NULL,
      coverage_end_date DATE NOT NULL,
      status ENUM('active', 'decommissioned', 'replaced', 'expired') DEFAULT 'active',
      selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      selected_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES amc_contracts(id) ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES company_devices(id) ON DELETE RESTRICT,
      FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (selected_by) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE KEY uk_contract_device (contract_id, device_id),
      INDEX idx_cov_dev_id (device_id),
      INDEX idx_cov_amc_tag (amc_tag),
      INDEX idx_cov_company (company_id),
      INDEX idx_cov_status (status),
      INDEX idx_cov_dates (coverage_start_date, coverage_end_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**ALTER TABLE statements affecting `amc_covered_devices` in `server/models/db.init.js`:**

- Line 1903: `ALTER TABLE amc_covered_devices MODIFY COLUMN status ENUM('active', 'decommissioned', 'replaced', 'expired') DEFAULT 'active' `);`

#### Table: `amc_device_replacements` (AMC Hardware Device Replacements)

**CREATE TABLE definition (verbatim from `server/models/db.init.js`):**

```sql
CREATE TABLE IF NOT EXISTS amc_device_replacements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      replacement_number VARCHAR(50) UNIQUE NOT NULL,
      contract_id INT NOT NULL,
      company_id INT NOT NULL,
      old_device_id INT NOT NULL,
      new_device_id INT NOT NULL,
      reason TEXT NOT NULL,
      status ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending',
      admin_notes TEXT NULL,
      reviewed_by INT NULL,
      reviewed_at TIMESTAMP NULL,
      effective_date DATE NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES amc_contracts(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (old_device_id) REFERENCES company_devices(id) ON DELETE RESTRICT,
      FOREIGN KEY (new_device_id) REFERENCES company_devices(id) ON DELETE RESTRICT,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_amc_rep_contract (contract_id),
      INDEX idx_amc_rep_company (company_id),
      INDEX idx_amc_rep_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

*No direct ALTER TABLE statements recorded for `amc_device_replacements` in migrations (created in current form).* 

#### Table: `amc_contract_history` (AMC Immutable Contract Audit History)

**CREATE TABLE definition (verbatim from `server/models/db.init.js`):**

```sql
CREATE TABLE IF NOT EXISTS amc_contract_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      contract_id INT NOT NULL,
      action VARCHAR(50) NOT NULL,
      performed_by INT NULL,
      details JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES amc_contracts(id) ON DELETE CASCADE,
      FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_amc_hist_contract (contract_id),
      INDEX idx_amc_hist_action (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

*No direct ALTER TABLE statements recorded for `amc_contract_history` in migrations (created in current form).* 

#### Table: `amc_expiry_reminders` (AMC Expiry Reminders Outbox & Milestone Tracker (Phase 3))

**CREATE TABLE definition (verbatim from `server/models/db.init.js`):**

```sql
CREATE TABLE IF NOT EXISTS amc_expiry_reminders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      contract_id INT NOT NULL,
      company_id INT NOT NULL,
      milestone_days INT NOT NULL,
      expiry_date DATE NOT NULL,
      sent_at TIMESTAMP NULL,
      delivery_channel ENUM('email', 'notification', 'both') DEFAULT 'both',
      delivery_status ENUM('pending', 'processing', 'success', 'failed', 'partial') DEFAULT 'pending',
      in_app_status ENUM('pending', 'success', 'failed', 'skipped') DEFAULT 'pending',
      email_status ENUM('pending', 'success', 'failed', 'skipped') DEFAULT 'pending',
      retry_count INT NOT NULL DEFAULT 0,
      last_attempted_at TIMESTAMP NULL,
      next_retry_at TIMESTAMP NULL,
      error_message TEXT NULL,
      metadata JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES amc_contracts(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uk_contract_milestone_expiry (contract_id, milestone_days, expiry_date),
      INDEX idx_amc_rem_contract (contract_id),
      INDEX idx_amc_rem_company (company_id),
      INDEX idx_amc_rem_milestone (milestone_days),
      INDEX idx_amc_rem_sent_at (sent_at),
      INDEX idx_amc_rem_status_attempt (delivery_status, last_attempted_at),
      INDEX idx_amc_rem_next_retry (delivery_status, next_retry_at, retry_count)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**ALTER TABLE statements affecting `amc_expiry_reminders` in `server/models/db.init.js`:**

- Line 1952: `ALTER TABLE amc_expiry_reminders MODIFY COLUMN delivery_status ENUM('pending', 'processing', 'success', 'failed', 'partial') DEFAULT 'pending' `);`
- Line 1965: `await connection.query('ALTER TABLE amc_expiry_reminders ADD INDEX idx_amc_rem_status_attempt (delivery_status, last_attempted_at)');`
- Line 1993: `await connection.query('ALTER TABLE amc_expiry_reminders ADD INDEX idx_amc_rem_next_retry (delivery_status, next_retry_at, retry_count)');`

#### Table: `company_profiles` (Corporate / B2B Company Profiles)

**CREATE TABLE definition (verbatim from `server/models/db.init.js`):**

```sql
CREATE TABLE IF NOT EXISTS company_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      company_id VARCHAR(50) UNIQUE NULL,
      company_name VARCHAR(150) NOT NULL,
      company_logo VARCHAR(500) NULL,
      contact_person VARCHAR(100) NOT NULL,
      phone_number VARCHAR(20) NOT NULL,
      address TEXT NOT NULL,
      gst_number VARCHAR(15) NULL,
      website_url VARCHAR(255) NULL,
      social_facebook VARCHAR(255) NULL,
      social_instagram VARCHAR(255) NULL,
      social_twitter VARCHAR(255) NULL,
      social_linkedin VARCHAR(255) NULL,
      company_type VARCHAR(50) DEFAULT 'Business',
      notes TEXT NULL,
      amc_status VARCHAR(50) DEFAULT 'Inactive',
      assigned_technician_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_technician_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

*No direct ALTER TABLE statements recorded for `company_profiles` in migrations (created in current form).* 

#### Table: `company_devices` (Corporate Hardware Fleet Assets)

**CREATE TABLE definition (verbatim from `server/models/db.init.js`):**

```sql
CREATE TABLE IF NOT EXISTS company_devices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      branch_id INT NULL,
      employee_id INT NULL,
      device_category VARCHAR(100) NOT NULL,
      brand VARCHAR(50) NOT NULL,
      model_number VARCHAR(100) NOT NULL,
      serial_number VARCHAR(100) NOT NULL,
      asset_id VARCHAR(100) NOT NULL,
      purchase_date DATE NULL,
      warranty_expiry DATE NULL,
      notes TEXT NULL,
      is_amc TINYINT(1) DEFAULT 0,
      amc_tag VARCHAR(50) DEFAULT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      status VARCHAR(20) DEFAULT 'active',
      deactivated_at TIMESTAMP NULL,
      deactivated_by INT NULL,
      deactivation_reason TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (branch_id) REFERENCES company_branches(id) ON DELETE SET NULL,
      FOREIGN KEY (employee_id) REFERENCES company_employees(id) ON DELETE SET NULL,
      INDEX idx_cd_company (company_id),
      INDEX idx_cd_serial (serial_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**ALTER TABLE statements affecting `company_devices` in `server/models/db.init.js`:**

- Line 1633: `await connection.query('ALTER TABLE company_devices MODIFY COLUMN device_category VARCHAR(100) NOT NULL');`

#### Table: `users` (Users Table (with corporate & auth columns))

**CREATE TABLE definition (verbatim from `server/models/db.init.js`):**

```sql
CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NULL,
      role ENUM('customer', 'technician', 'admin', 'company') DEFAULT 'customer',
      google_id VARCHAR(255) UNIQUE NULL,
      auth_provider VARCHAR(50) DEFAULT 'local',
      avatar_url VARCHAR(500) NULL,
      token_version INT DEFAULT 1,
      technician_id VARCHAR(50) UNIQUE NULL,
      customer_id VARCHAR(50) UNIQUE NULL,
      is_active BOOLEAN DEFAULT TRUE,
      phone VARCHAR(30) NULL,
      company_id VARCHAR(50) UNIQUE NULL,
      deactivated_at TIMESTAMP NULL,
      deactivated_by INT NULL,
      deactivation_reason TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_users_email (email),
      INDEX idx_users_google (google_id),
      INDEX idx_users_role (role),
      INDEX idx_users_active (is_active),
      UNIQUE INDEX idx_users_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

*No direct ALTER TABLE statements recorded for `users` in migrations (created in current form).* 

#### Table: `site_settings` (Key-Value System Configuration Store)

**CREATE TABLE definition (verbatim from `server/models/db.init.js`):**

```sql
CREATE TABLE IF NOT EXISTS site_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      setting_key VARCHAR(100) UNIQUE NOT NULL,
      setting_value TEXT NULL,
      setting_group VARCHAR(50) DEFAULT 'general',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_settings_key (setting_key),
      INDEX idx_settings_group (setting_group)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

*No direct ALTER TABLE statements recorded for `site_settings` in migrations (created in current form).* 

#### Table: `notifications` (In-App Notifications Ledger)

**CREATE TABLE definition (verbatim from `server/models/db.init.js`):**

```sql
CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      ticket_id INT NULL,
      sender_id INT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (ticket_id) REFERENCES service_requests(id) ON DELETE SET NULL,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_notif_user_read (user_id, is_read),
      INDEX idx_notif_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

*No direct ALTER TABLE statements recorded for `notifications` in migrations (created in current form).* 

#### Table: `payments` (Financial Payment Transactions)

**CREATE TABLE definition (verbatim from `server/models/db.init.js`):**

```sql
CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      payment_id VARCHAR(100) UNIQUE NULL,
      order_id VARCHAR(100) NOT NULL,
      ticket_id INT NULL,
      invoice_id VARCHAR(50) NULL,
      user_id INT NULL,
      company_id INT NULL,
      amount DECIMAL(12,2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'INR',
      payment_method VARCHAR(50) DEFAULT 'card',
      status ENUM('created', 'processing', 'pending_verification', 'paid', 'failed', 'cancelled', 'refunded', 'rejected') DEFAULT 'created',
      gateway VARCHAR(50) DEFAULT 'razorpay',
      gateway_response JSON NULL,
      error_message TEXT NULL,
      collection_status ENUM('pending_collection', 'collected', 'not_applicable') DEFAULT 'not_applicable',
      collected_by INT NULL,
      collected_at TIMESTAMP NULL,
      verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
      verified_by INT NULL,
      verified_at TIMESTAMP NULL,
      reference_note TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES service_requests(id) ON DELETE SET NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (collected_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_pmt_order (order_id),
      INDEX idx_pmt_status (status),
      INDEX idx_pmt_ticket (ticket_id),
      INDEX idx_pmt_invoice (invoice_id),
      INDEX idx_pmt_user (user_id),
      INDEX idx_pmt_verification_status (verification_status),
      INDEX idx_pmt_collection_status (collection_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**ALTER TABLE statements affecting `payments` in `server/models/db.init.js`:**

- Line 1471: `await connection.query('ALTER TABLE payments DROP FOREIGN KEY payments_ibfk_2');`
- Line 1473: `await connection.query('ALTER TABLE payments MODIFY COLUMN invoice_id VARCHAR(50) NULL');`
- Line 1475: `await connection.query('ALTER TABLE payments ADD CONSTRAINT payments_ibfk_2 FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL');`

#### Table: `invoices` (Commercial Tax Invoices)

**CREATE TABLE definition (verbatim from `server/models/db.init.js`):**

```sql
CREATE TABLE IF NOT EXISTS invoices (
      id VARCHAR(50) PRIMARY KEY,
      user_id INT NULL,
      client_name VARCHAR(100) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      subtotal DECIMAL(12,2) NULL DEFAULT 0.00,
      tax_amount DECIMAL(12,2) NULL DEFAULT 0.00,
      cgst_amount DECIMAL(12,2) NULL DEFAULT 0.00,
      sgst_amount DECIMAL(12,2) NULL DEFAULT 0.00,
      igst_amount DECIMAL(12,2) NULL DEFAULT 0.00,
      original_estimate DECIMAL(12,2) NULL DEFAULT 0.00,
      is_interstate BOOLEAN DEFAULT FALSE,
      gst_type ENUM('intra', 'inter') DEFAULT 'intra',
      cgst_rate DECIMAL(5,2) DEFAULT 9.00,
      sgst_rate DECIMAL(5,2) DEFAULT 9.00,
      igst_rate DECIMAL(5,2) DEFAULT 0.00,
      discount_amount DECIMAL(12,2) DEFAULT 0.00,
      taxable_amount DECIMAL(12,2) NULL DEFAULT 0.00,
      finalized_at TIMESTAMP NULL,
      finalized_by INT NULL,
      currency VARCHAR(10) DEFAULT 'INR',
      invoice_date DATETIME NOT NULL,
      due_date DATETIME NOT NULL,
      status VARCHAR(20) DEFAULT 'Draft',
      notes TEXT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      deactivated_at TIMESTAMP NULL,
      deactivated_by INT NULL,
      deactivation_reason TEXT NULL,
      payment_id VARCHAR(100) NULL,
      payment_order_id VARCHAR(100) NULL,
      payment_method VARCHAR(50) NULL,
      ticket_id INT NULL,
      paid_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_inv_user (user_id),
      INDEX idx_inv_status (status),
      INDEX idx_inv_payment_id (payment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**ALTER TABLE statements affecting `invoices` in `server/models/db.init.js`:**

- Line 1462: `await connection.query('ALTER TABLE invoices MODIFY COLUMN id VARCHAR(50) NOT NULL');`
- Line 1464: `await connection.query('ALTER TABLE invoices MODIFY COLUMN user_id INT NULL');`
- Line 1475: `await connection.query('ALTER TABLE payments ADD CONSTRAINT payments_ibfk_2 FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL');`

### 2. Seeded Site Settings Keys with Default Values (from `seedDefaultDataIfEmpty` in `server/models/db.init.js`)

| Key | Default Value | Group | Description |
|---|---|---|---|
| `company_name` | `The Tek Doctor` | `company` | Brand name |
| `company_email` | `info@tekdoctor.in` | `company` | Public company email |
| `company_phone` | `+91 9136868902` | `company` | Primary support phone |
| `company_alternate_phone` | `""` | `company` | Alternate contact |
| `company_address` | `Mumbai, Maharashtra, India` | `company` | Headquarters |
| `logo_url` | `""` | `company` | Header logo image |
| `theme_primary_color` | `#00e5ff` | `theme` | Cyan neon accent |
| `theme_secondary_color` | `#1a1a1a` | `theme` | Dark secondary background |
| `favicon_url` | `""` | `branding` | Browser favicon |
| `tekunik_image_url` | `""` | `branding` | Secondary brand badge |
| `facebook_url` | `""` | `social` | Social handle |
| `twitter_url` | `""` | `social` | Social handle |
| `instagram_url` | `""` | `social` | Social handle |
| `linkedin_url` | `""` | `social` | Social handle |
| `google_maps_link` | `""` | `integrations` | Store map embed |
| `google_sheet_url` | `""` | `integrations` | Google Sheets sync |
| `maintenance_mode` | `false` | `system` | Site maintenance toggle |
| `meta_title` | `""` | `seo` | Default meta title |
| `meta_description` | `""` | `seo` | Default meta description |
| `meta_keywords` | `""` | `seo` | Default meta keywords |
| `smtp_host` | `smtp.gmail.com` | `email` | SMTP gateway |
| `smtp_port` | `587` | `email` | TLS port |
| `smtp_user` | `""` | `email` | SMTP username |
| `smtp_password` | `""` | `email` | SMTP password (encrypted at rest) |
| `from_email` | `noreply@tekdoctor.in` | `email` | Transactional sender email |
| `from_name` | `The Tek Doctor` | `email` | Transactional sender name |
| `google_login_enabled` | `false` | `integrations` | OAuth2 toggle |
| `google_client_id` | `""` | `integrations` | OAuth Client ID |
| `google_client_secret` | `""` | `integrations` | OAuth Client Secret (encrypted) |
| `recaptcha_enabled` | `false` | `security` | reCAPTCHA v3 toggle |
| `recaptcha_site_key` | `""` | `security` | reCAPTCHA Public Key |
| `recaptcha_secret_key` | `""` | `security` | reCAPTCHA Secret Key (encrypted) |
| `recaptcha_api_key` | `""` | `security` | Enterprise API Key (encrypted) |
| `recaptcha_project_id` | `""` | `security` | Enterprise Project ID |
| `recaptcha_score_threshold` | `0.5` | `security` | Minimum human score |
| `invoice_prefix` | `inv` | `billing` | Invoice numbering prefix |
| `default_gst_rate` | `18.00` | `billing` | Default GST percentage |
| `invoice_gst_enabled` | `true` | `billing` | GST statutory compliance toggle |
| `gstin` | `27AAAAA0000A1Z5` | `company` | Corporate GST identification |
| `invoice_default_items` | `[JSON: 6 catalog items]` | `billing` | Default repair catalog |
| `amc_reminder_milestones_days` | `30,15,7,1` | `amc` | Days before expiry to trigger reminder |
| `amc_reminder_retry_base_minutes` | `15` | `amc` | Base exponential retry interval |
| `amc_business_timezone` | `Asia/Kolkata` | `amc` | Timezone for canonical expiry & certificate |

### 3. How AMC Plans Are Seeded (from `server/models/db.init.js` lines 1054–1132)

The table `amc_plans` is seeded on server startup if `SELECT COUNT(*) FROM amc_plans` returns 0. Three plans are inserted:

1. **`AMC-STD-10`** — "Standard Business Fleet AMC":
   - Base Price: ₹14,999.00 | Duration: 12 months | Capacity: 10 devices
   - Coverage terms: `{"quarterly_audit": true, "priority_level": "Standard", "labor_discount_pct": 100, "parts_discount_pct": 10, "sla_turnaround_hours": 48}`
2. **`AMC-CORP-25`** — "Corporate Premium Fleet AMC":
   - Base Price: ₹34,999.00 | Duration: 12 months | Capacity: 25 devices
   - Coverage terms: `{"quarterly_audit": true, "priority_level": "High", "labor_discount_pct": 100, "parts_discount_pct": 15, "loaner_device": true, "sla_turnaround_hours": 24}`
3. **`AMC-ENT-50`** — "Enterprise Dedicated Fleet AMC":
   - Base Price: ₹64,999.00 | Duration: 12 months | Capacity: 50 devices
   - Coverage terms: `{"quarterly_audit": true, "priority_level": "Urgent", "labor_discount_pct": 100, "parts_discount_pct": 20, "loaner_device": true, "dedicated_technician": true, "sla_turnaround_hours": 12}`

### 4. AMC Status ENUM Values and State Transitions in Code

#### ENUM Value Definitions

- **`amc_requests.status`**: `pending`, `under_review`, `offered`, `rejected`, `cancelled`
- **`amc_contracts.status`**: `draft`, `offered`, `accepted`, `rejected`, `active`, `expired`, `cancelled`, `suspended`
- **`amc_contracts.approval_status`**: `pending_approval`, `approved`, `rejected`
- **`amc_contracts.payment_status`**: `unpaid`, `pending_verification`, `paid`, `failed`
- **`amc_contracts.contract_type`**: `standard`, `custom`, `renewal`
- **`amc_covered_devices.status`**: `active`, `decommissioned`, `replaced`, `expired`
- **`amc_device_replacements.status`**: `pending`, `approved`, `rejected`, `cancelled`
- **`payments.status`**: `created`, `processing`, `pending_verification`, `paid`, `failed`, `cancelled`, `refunded`, `rejected`
- **`payments.verification_status`**: `pending`, `verified`, `rejected`
- **`amc_expiry_reminders.delivery_status`**: `pending`, `processing`, `success`, `failed`, `partial`
- **`amc_expiry_reminders.in_app_status`**: `pending`, `success`, `failed`, `skipped`
- **`amc_expiry_reminders.email_status`**: `pending`, `success`, `failed`, `skipped`

#### State Transitions Matrix (Every Status Mutation in Code)

| Entity / Column | From Status | To Status | Function Name | File & Line |
|---|---|---|---|---|
| `amc_requests.status` | *(new)* | `pending` | `createAmcRequest` | `server/services/amc.service.js:864` |
| `amc_requests.status` | `pending` | `offered` | `createAmcContract` | `server/services/amc.service.js:958` |
| `amc_requests.status` | `pending` | `offered` | `createAmcRenewalContract` | `server/services/amc.service.js:2824` |
| `amc_requests.status` | `pending` | `under_review` / `rejected` / `cancelled` | `reviewAmcRequest` | `server/services/amc.service.js:1570` |
| `amc_contracts.status` | *(new)* | `offered` | `createAmcContract` | `server/services/amc.service.js:936` |
| `amc_contracts.status` | *(new)* | `offered` | `createAmcRenewalContract` | `server/services/amc.service.js:2804` |
| `amc_contracts.status` | `offered` | `accepted` | `acceptAmcOffer` | `server/services/amc.service.js:1279` |
| `amc_contracts.status` | `offered` | `expired` | `acceptAmcOffer` (if validity passed) | `server/services/amc.service.js:1270` |
| `amc_contracts.status` | `offered` / `accepted` | `rejected` | `rejectAmcOffer` | `server/services/amc.service.js:1601` |
| `amc_contracts.status` | `accepted` / `offered` | `active` | `approveAmcContract` (if already paid) | `server/services/amc.service.js:1316` |
| `amc_contracts.status` | `accepted` / `offered` | `active` | `activateAmcContract` | `server/services/amc.service.js:1357` |
| `amc_contracts.status` | `offered` / `accepted` | `active` | `verifyContractPayment` (if approved) | `server/services/amc.service.js:1856` |
| `amc_contracts.status` | `offered` | `accepted` | `verifyContractPayment` (if not yet approved) | `server/services/amc.service.js:1856` |
| `amc_contracts.status` | `offered` / `accepted` | `active` | `verifyContractOfflinePayment` (if approved) | `server/services/amc.service.js:2040` |
| `amc_contracts.status` | `offered` | `accepted` | `verifyContractOfflinePayment` (if not yet approved) | `server/services/amc.service.js:2040` |
| `amc_contracts.status` | Any | `active` / `cancelled` / `suspended` | `updateContractStatus` | `server/services/amc.service.js:1677` |
| `amc_contracts.status` | `active` | `expired` | `processContractExpiries` (sweep) | `server/services/amc.service.js:2141` |
| `amc_contracts.status` | `offered` | `expired` | `processContractExpiries` (sweep) | `server/services/amc.service.js:2211` |
| `amc_contracts.approval_status` | *(new)* | `pending_approval` | `createAmcContract` | `server/services/amc.service.js:936` |
| `amc_contracts.approval_status` | `pending_approval` | `approved` | `approveAmcContract` | `server/services/amc.service.js:1316` |
| `amc_contracts.approval_status` | Any | `rejected` | `rejectAmcOffer` | `server/services/amc.service.js:1601` |
| `amc_contracts.payment_status` | *(new)* | `unpaid` | `createAmcContract` | `server/services/amc.service.js:936` |
| `amc_contracts.payment_status` | `unpaid` | `pending_verification` | `initiateContractOfflinePayment` | `server/services/amc.service.js:1921` |
| `amc_contracts.payment_status` | `unpaid` / `pending_verification` | `paid` | `verifyContractPayment` | `server/services/amc.service.js:1856` |
| `amc_contracts.payment_status` | `unpaid` | `failed` | `verifyContractPayment` (signature invalid) | `server/services/amc.service.js:1817` |
| `amc_contracts.payment_status` | `pending_verification` | `paid` | `verifyContractOfflinePayment` (decision = verified) | `server/services/amc.service.js:2040` |
| `amc_contracts.payment_status` | `pending_verification` | `failed` | `verifyContractOfflinePayment` (decision = rejected) | `server/services/amc.service.js:2071` |
| `amc_covered_devices.status` | *(new)* | `active` | `assignDevicesToCoverage` | `server/services/amc.service.js:550` |
| `amc_covered_devices.status` | `active` | `replaced` | `reviewDeviceReplacement` (decision = approved) | `server/services/amc.service.js:752` |
| `amc_covered_devices.status` | *(new)* | `active` | `reviewDeviceReplacement` (new device) | `server/services/amc.service.js:770` |
| `amc_covered_devices.status` | `active` | `expired` | `processContractExpiries` (sweep) | `server/services/amc.service.js:2149` |
| `amc_device_replacements.status`| *(new)* | `pending` | `requestDeviceReplacement` | `server/services/amc.service.js:669` |
| `amc_device_replacements.status`| `pending` | `approved` | `reviewDeviceReplacement` | `server/services/amc.service.js:745` |
| `amc_device_replacements.status`| `pending` | `rejected` | `reviewDeviceReplacement` | `server/services/amc.service.js:791` |
| `payments.status` | *(new)* | `created` | `createContractPaymentOrder` | `server/services/amc.service.js:1760` |
| `payments.status` | `created` | `paid` | `verifyContractPayment` | `server/services/amc.service.js:1830` |
| `payments.status` | `created` | `failed` | `verifyContractPayment` (signature fail) | `server/services/amc.service.js:1816` |
| `payments.status` | *(new)* | `pending_verification` | `initiateContractOfflinePayment` | `server/services/amc.service.js:1916` |
| `payments.status` | `pending_verification` | `paid` | `verifyContractOfflinePayment` (decision = verified) | `server/services/amc.service.js:1991` |
| `payments.status` | `pending_verification` | `rejected` | `verifyContractOfflinePayment` (decision = rejected) | `server/services/amc.service.js:2062` |
| `payments.status` | `pending_verification` | `cancelled` | `verifyContractOfflinePayment` (prior duplicate offline) | `server/services/amc.service.js:2002` |
| `amc_expiry_reminders.delivery_status` | *(new)* | `pending` | `processExpiryReminders` (insert outbox) | `server/services/amc.service.js:2334` |
| `amc_expiry_reminders.delivery_status` | `pending` / `failed` / `partial` | `processing` | `processExpiryReminders` (claim lock) | `server/services/amc.service.js:2368` |
| `amc_expiry_reminders.delivery_status` | `processing` | `success` / `partial` / `failed` | `processExpiryReminders` (after delivery) | `server/services/amc.service.js:2427` |
| `amc_expiry_reminders.delivery_status` | `failed` / `partial` / `pending` | `processing` | `retryReminder` (manual retry claim) | `server/services/amc.service.js:3334` |
| `amc_expiry_reminders.delivery_status` | `processing` | `success` / `partial` / `failed` | `retryReminder` (after retry delivery) | `server/services/amc.service.js:3410` |


---

=== PART 3: Company registration & access ===

### 1. Company Registration Endpoint (Full Code)

#### Route Definition
**File:** `server/routes/company.routes.js` (Lines 60–62)

```javascript
// POST /api/company/register (Rate-limited, logo upload, SVG/file signature check, validate, register)
router.post('/register', authLimiter, logoUpload, verifyUploadSignatures, validateCompanyRegister, registerCompany);
```

#### Validation Rules (`validateCompanyRegister`)
**File:** `server/middleware/validate.middleware.js` (Lines 934–1007)

```javascript
const validateCompanyRegister = validate([
  body('companyName')
    .trim()
    .notEmpty().withMessage('Company name is required.')
    .isLength({ min: 2, max: 50 }).withMessage('Company name must be between 2 and 50 characters.'),
  body('email')
    .trim()
    .notEmpty().withMessage('Corporate email is required.')
    .isEmail().withMessage('Please provide a valid corporate email.')
    .isLength({ max: 255 }).withMessage('Email cannot exceed 255 characters.')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .custom((value) => {
      if (!value) return true;
      const str = String(value).trim();
      const clean = str.replace(/[\s\-()]/g, '');
      let national = clean;
      if (clean.startsWith('+91') && clean.length === 13) {
        national = clean.slice(3);
      }
      if (!/^[6-9]\d{9}$/.test(national) || /^(\d)\1{9}$/.test(national)) {
        throw new Error('Enter a valid 10-digit mobile number.');
      }
      return true;
    })
    .customSanitizer(normalizePhoneNumber),
  body('contactPerson')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Contact person name must be between 2 and 50 characters.'),
  body('gstNumber')
    .optional({ checkFalsy: true })
    .trim()
    .custom((value) => {
      if (!value) return true;
      const g = String(value).trim().toUpperCase();
      if (g.length !== 15) {
        throw new Error('Enter a valid 15-character GSTIN.');
      }
      const gstinRegex = /^(0[1-9]|[1-2][0-9]|3[0-8]|97|99)[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(g)) {
        throw new Error('Enter a valid 15-character GSTIN.');
      }
      if (!isValidGstinChecksum(g)) {
        throw new Error('Enter a valid 15-character GSTIN.');
      }
      return true;
    })
    .customSanitizer(value => (value ? String(value).trim().toUpperCase() : null)),
  body('websiteUrl')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 }).withMessage('Website URL is too long.')
    .custom((value) => {
      if (!value) return true;
      if (!isValidUrl(value)) {
        throw new Error('Enter a valid website URL.');
      }
      return true;
    }),
  body('address')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 250 }).withMessage('Address is too long.')
]);

const validateBranch = validate([
```

#### Controller Function (`registerCompany`)
**File:** `server/controllers/company.controller.js` (Lines 136–258)

```javascript
const registerCompany = async (req, res, next) => {
    const {
        companyName,
        contactPerson,
        email,
        phone,
        address,
        password,
        gstNumber,
        websiteUrl,
        socialFacebook,
        socialInstagram,
        socialTwitter,
        socialLinkedin
    } = req.body;

    let connection;
    try {
        const cleanEmail = email ? email.trim().toLowerCase() : '';
        const cleanPhone = phone ? normalizePhoneNumber(phone) : null;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Check if user already exists with this email
        const [existingUsers] = await connection.query(
            'SELECT id FROM users WHERE email = ? LIMIT 1',
            [cleanEmail]
        );

        if (existingUsers.length > 0) {
            await connection.rollback();
            const resp = formatResponse(false, 'This email address is already registered. Please use a different email address.');
            resp.errors = { email: 'This email address is already registered. Please use a different email address.' };
            return res.status(400).json(resp);
        }

        // Check if phone already exists
        if (cleanPhone) {
            const [existingPhone] = await connection.query(
                'SELECT id FROM users WHERE phone = ? LIMIT 1',
                [cleanPhone]
            );
            if (existingPhone.length > 0) {
                await connection.rollback();
                const resp = formatResponse(false, 'This phone number is already registered. Please use a different phone number.');
                resp.errors = { phone: 'This phone number is already registered. Please use a different phone number.' };
                return res.status(400).json(resp);
            }
        }

        // Hash the password
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Determine if logo was uploaded or is just a string URL
        let logoPath = null;
        if (req.file) {
            // In case logo uploaded via multer
            logoPath = `/uploads/${req.file.filename}`;
        } else if (req.body.companyLogo) {
            logoPath = req.body.companyLogo;
        }

        // Generate stable company ID (CMP-001, CMP-002...)
        const companyId = await generateCompanyId(connection);

        // 1. Insert user
        const [userResult] = await connection.query(
            'INSERT INTO users (name, email, password, role, phone, avatar_url, is_active, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [companyName.trim(), cleanEmail, hashedPassword, 'company', cleanPhone, logoPath || null, true, companyId]
        );
        const userId = userResult.insertId;

        // 2. Insert company profile
        await connection.query(
            `INSERT INTO company_profiles 
        (user_id, company_id, company_name, company_logo, contact_person, phone_number, address, gst_number, website_url, 
         social_facebook, social_instagram, social_twitter, social_linkedin) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                companyId,
                companyName.trim(),
                logoPath,
                contactPerson ? contactPerson.trim() : '',
                cleanPhone || '',
                address ? address.trim() : '',
                gstNumber || null,
                websiteUrl || null,
                socialFacebook || null,
                socialInstagram || null,
                socialTwitter || null,
                socialLinkedin || null
            ]
        );

        await connection.commit();

        const user = { id: userId, name: companyName, email, role: 'company', companyId };
        const token = generateToken(user);

        logger.info(`New company registered: ${companyName} (${email}) (ID: ${userId}, CompanyID: ${companyId})`);

        return res.status(201).json(formatResponse(true, 'Company registration successful.', {
            id: userId,
            companyId,
            name: companyName,
            email,
            role: 'company',
            token
        }));
    } catch (error) {
        if (connection) await connection.rollback();
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getCompanyProfile = async (req, res, next) => {
    let connection;
    try {
```

#### Verification / Approval Status Received Upon Registration
- **Account Active State (`users.is_active`):** Set directly to `true` (`1`). The user is immediately active.
- **Account Role (`users.role`):** Set directly to `"company"`.
- **AMC Status (`company_profiles.amc_status`):** Schema default is `"Inactive"` (not set explicitly in registration insert).
- **Admin Approval Status:** **NONE**. There is no `pending_approval` or `verified` column on `users` or `company_profiles`.
- **Immediate JWT Generation:** The controller immediately issues a signed JWT (`generateToken(user)`) and returns HTTP 201 with `{ token, role: "company", companyId }`.

### 2. Immediate Capabilities of a Newly Registered Company

Because the company receives a fully valid JWT with `role: "company"` upon registration and `users.is_active = 1`, the company can **IMMEDIATELY** perform the following actions without any administrator verification or manual approval:

1. **Create Repair Tickets (`POST /api/company/repairs`):**
   - **Guards:** `authenticate`, `authorize("company", "admin")`, `stripProtectedFields`, `validateCompanyRepairRequest`.
   - Can book repair tickets immediately for any of their devices.

2. **Request Custom AMC Quotes (`POST /api/amc/company/requests`):**
   - **Guards:** `authenticate`, `authorize("company")`.
   - Can submit AMC quote requests immediately for their fleet.

3. **Create Branches & Employees (`POST /api/company/branches`, `POST /api/company/employees`):**
   - **Guards:** `authenticate`, `authorize("company", "admin")`.
   - Can add physical locations and staff records immediately.

4. **Add Fleet Devices (`POST /api/company/devices`):**
   - **Guards:** `authenticate`, `authorize("company", "admin")`, `validateDevice`.
   - Can register devices under their corporate account immediately.

5. **Execute Bulk CSV / Excel Imports (`POST /api/company/bulk-*`):**
   - **Guards:** `authenticate`, `authorize("company", "admin")`, `csvImportUpload`, `verifyUploadSignatures`.
   - Endpoints: `/bulk-devices`, `/bulk-employees`, `/bulk-branches`, `/bulk-requests`.
   - Can bulk upload devices, employees, branches, and repair tickets immediately.

6. **Accept Offers & Pay (`POST /api/amc/company/contracts/:id/accept`, `/create-payment-order`, `/verify-payment`):**
   - Once an offer is generated by admin, the company can accept, initiate Razorpay payment, or submit bank transfer details immediately.

### 3. How Admin Creates a Company (`POST /api/admin/companies`)

#### Route Definition
**File:** `server/routes/admin.routes.js` (Line 39)

```javascript
router.post('/companies', validateCreateCompany, admin.createCompany);
```

#### Controller Function (`createCompany`)
**File:** `server/controllers/admin.controller.js` (Lines 638–692)

```javascript
const createCompany = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { name, email, phone, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json(formatResponse(false, 'Company name, email, and password are required.'));
        }

        if (password.length < 8) {
            return res.status(400).json(formatResponse(false, 'Password must be at least 8 characters long.'));
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanPhone = phone ? normalizePhoneNumber(phone) : null;

        // Check if email already exists
        const [existing] = await connection.query('SELECT id FROM users WHERE email = ? LIMIT 1', [cleanEmail]);
        if (existing.length > 0) {
            const resp = formatResponse(false, 'This email address is already registered. Please use a different email address.');
            resp.errors = { email: 'This email address is already registered. Please use a different email address.' };
            return res.status(409).json(resp);
        }

        // Check if phone already exists
        if (cleanPhone) {
            const [existingPhone] = await connection.query('SELECT id FROM users WHERE phone = ? LIMIT 1', [cleanPhone]);
            if (existingPhone.length > 0) {
                const resp = formatResponse(false, 'This phone number is already registered. Please use a different phone number.');
                resp.errors = { phone: 'This phone number is already registered. Please use a different phone number.' };
                return res.status(409).json(resp);
            }
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const companyCode = await generateCompanyId(connection);

        // Insert Company User
        const [userResult] = await connection.query(
            'INSERT INTO users (name, email, password, phone, role, company_id) VALUES (?, ?, ?, ?, "company", ?)',
            [name, cleanEmail, hashedPassword, cleanPhone, companyCode]
        );
        const companyUserId = userResult.insertId;

        // Scaffold company_profiles to prevent auth crashes
        await connection.query(
            'INSERT INTO company_profiles (user_id, company_id, company_name, contact_person, phone_number, address) VALUES (?, ?, ?, ?, ?, ?)',
            [companyUserId, companyCode, name, 'Admin Created', cleanPhone || '', '']
        );

        await logActivity(connection, req.user.id, 'create_company', 'user', companyUserId, { name, email: cleanEmail }, req.ip);

        return res.status(201).json(formatResponse(true, 'Company account created successfully.', { id: companyUserId }));
    } catch (error) {
```

### 4. Existing "Pending / Verified / Approved" Field or Admin Approval Step for Companies

**Factual Finding: NONE EXISTS.**

- In `users` table: only `is_active BOOLEAN DEFAULT TRUE` exists. When a company registers (self or admin-created), `is_active` is `1` (true).
- In `company_profiles` table: columns are `company_name`, `contact_person`, `phone_number`, `address`, `gst_number`, `website_url`, `company_type`, `amc_status` (defaults to `"Inactive"`), `assigned_technician_id`. There are **NO** verification columns (e.g. `is_verified`, `verification_status`, `approved_by`, `approved_at`, `approval_status`).
- There is **NO** admin approval queue or admin approval gate for newly registered companies. Admin can only toggle active status after the fact via `PUT /api/admin/companies/:id/status`.


---

=== PART 4: AMC backend ===

### 1. Complete Catalog of Exported Functions in `server/services/amc.service.js`

| # | Function Signature | 1-Line Behavior | Tables Read / Written |
|---|---|---|---|
| 1 | `addDaysOnly(dateStr, days)` | Calculates date string offset by N days without timezone distortion. | None (Pure Math) |
| 2 | `formatDateOnly(d)` | Formats date to canonical YYYY-MM-DD string. | None (Pure Math) |
| 3 | `getBusinessTodayStr()` | Returns current calendar date string in configured business timezone (Asia/Kolkata). | None (Config-driven) |
| 4 | `resolveDeviceAmcEligibility(connectionOrPool, { companyId, deviceId, repairDate })` | Checks if a company device has valid active AMC coverage on a target date. | `amc_contracts`, `amc_covered_devices`, `company_devices`, `users` (Read) |
| 5 | `checkContractCapacity(connectionOrPool, contractId)` | Returns maximum device capacity, active covered device count, and remaining quota. | `amc_contracts`, `amc_covered_devices` (Read) |
| 6 | `assignDevicesToCoverage(connectionOrPool, { contractId, companyId, deviceIds, userId })` | Allocates company fleet devices to an active/accepted contract within quota. | `amc_contracts`, `company_devices`, `amc_covered_devices`, `amc_contract_history` (Read/Write) |
| 7 | `requestDeviceReplacement(connectionOrPool, { contractId, companyId, oldDeviceId, newDeviceId, reason, userId })` | Submits a device swap request under AMC SLA for administrative review. | `amc_contracts`, `amc_covered_devices`, `company_devices`, `amc_device_replacements`, `amc_contract_history`, `app_sequences` (Read/Write) |
| 8 | `reviewDeviceReplacement(connectionOrPool, { replacementId, adminUserId, decision, adminNotes })` | Admin approves or rejects a hardware swap, updating coverage status and tags. | `amc_device_replacements`, `amc_covered_devices`, `company_devices`, `amc_contract_history`, `notifications` (Read/Write) |
| 9 | `getPlans({ isActiveOnly = false })` | Retrieves AMC plan catalog with optional active-only filtering. | `amc_plans` (Read) |
| 10 | `createPlan({ planCode, name, description, basePrice, durationMonths, defaultDeviceCapacity, coverageTerms })` | Creates a new AMC plan in the master catalog. | `amc_plans` (Write) |
| 11 | `updatePlan(planId, data)` | Updates fields and terms of an existing AMC plan. | `amc_plans` (Write) |
| 12 | `togglePlanStatus(planId)` | Toggles plan active state between 1 and 0. | `amc_plans` (Read/Write) |
| 13 | `createAmcRequest({ companyId, planId, requestedDeviceCount, notes })` | Submits a company AMC quote inquiry or request. | `amc_requests`, `users`, `notifications`, `app_sequences` (Read/Write) |
| 14 | `getAmcRequests({ companyId = null, status = null })` | Retrieves AMC quote requests with optional company and status filters. | `amc_requests`, `users`, `amc_plans`, `amc_contracts` (Read) |
| 15 | `reviewAmcRequest({ requestId, adminUserId, status, adminNotes })` | Admin updates status and notes on an AMC quote request. | `amc_requests`, `users`, `notifications` (Read/Write) |
| 16 | `createAmcContract({ companyId, requestId, planId, planName, deviceCapacity, price, discountAmount, taxAmount, totalAmount, termsAndConditions, offerValidUntil, selectionDeadline, startDate, endDate, createdBy })` | Admin creates an official AMC contract offer for a company. | `amc_contracts`, `amc_requests`, `amc_contract_history`, `app_sequences`, `notifications` (Read/Write) |
| 17 | `getContracts({ companyId = null, status = null })` | Fetches AMC contracts list with coverage statistics and rejection history. | `amc_contracts`, `users`, `company_profiles`, `amc_plans`, `amc_covered_devices`, `amc_contract_history` (Read) |
| 18 | `getContractDetails(contractId, companyId = null)` | Retrieves full details of a single contract including covered devices, history, and invoice. | `amc_contracts`, `users`, `company_profiles`, `amc_plans`, `invoices`, `amc_covered_devices`, `company_devices`, `amc_contract_history` (Read) |
| 19 | `acceptAmcOffer({ contractId, companyId, userId })` | Company accepts an offered AMC contract before validity expiration. | `amc_contracts`, `amc_contract_history`, `notifications` (Read/Write) |
| 20 | `rejectAmcOffer({ contractId, companyId, reason, userId })` | Company declines an offered contract, recording audit reason. | `amc_contracts`, `amc_contract_history`, `notifications` (Read/Write) |
| 21 | `approveAmcContract({ contractId, adminUserId, startDate, endDate })` | Admin approves an AMC contract, setting coverage dates and activating if paid. | `amc_contracts`, `amc_covered_devices`, `amc_contract_history`, `notifications` (Read/Write) |
| 22 | `activateAmcContract({ contractId, adminUserId })` | Transitions an approved and paid contract to active status. | `amc_contracts`, `amc_covered_devices`, `amc_contract_history`, `notifications` (Read/Write) |
| 23 | `updateContractStatus({ contractId, adminUserId, status, reason })` | Admin updates contract lifecycle state (e.g. suspended, cancelled). | `amc_contracts`, `amc_contract_history` (Read/Write) |
| 24 | `getAdminOverview()` | Aggregates metrics for AMC admin dashboard overview widgets. | `amc_contracts`, `amc_requests`, `amc_covered_devices`, `amc_device_replacements` (Read) |
| 25 | `createContractPaymentOrder({ contractId, companyId, userId })` | Creates Razorpay payment order for an accepted AMC contract. | `amc_contracts`, `payments` (Read/Write) |
| 26 | `verifyContractPayment({ contractId, companyId, razorpayOrderId, razorpayPaymentId, razorpaySignature, userId })` | Verifies Razorpay HMAC signature, creates invoice, records payment, and activates coverage. | `amc_contracts`, `payments`, `invoices`, `invoice_line_items`, `amc_covered_devices`, `amc_contract_history`, `notifications`, `app_sequences` (Read/Write) |
| 27 | `initiateContractOfflinePayment({ contractId, companyId, paymentMethod, referenceNumber, notes, userId })` | Submits bank transfer / offline payment details for admin review. | `amc_contracts`, `payments`, `amc_contract_history`, `notifications` (Read/Write) |
| 28 | `verifyContractOfflinePayment({ contractId, adminUserId, decision, adminNotes })` | Admin verifies or rejects offline bank payment, generates invoice and activates coverage. | `amc_contracts`, `payments`, `invoices`, `invoice_line_items`, `amc_covered_devices`, `amc_contract_history`, `notifications`, `app_sequences` (Read/Write) |
| 29 | `sendAmcNotification({ userId, companyId, role, title, message, ticketId, sendInApp, sendEmail })` | Dispatches in-app notification and email to customer or administrator. | `notifications`, `users` (Read/Write) |
| 30 | `processContractExpiries(connectionOrPool)` | Scheduled maintenance sweep: marks elapsed active contracts as expired, cascades to devices. | `amc_contracts`, `amc_covered_devices`, `company_devices`, `amc_contract_history`, `notifications` (Read/Write) |
| 31 | `processExpiryReminders(connectionOrPool)` | Scheduled maintenance sweep: evaluates milestone reminders (30,15,7,1d) and dispatches outbox. | `amc_contracts`, `site_settings`, `amc_expiry_reminders`, `users`, `notifications`, `amc_contract_history` (Read/Write) |
| 32 | `processSelectionDeadlineReminders(connectionOrPool)` | Sends reminders to companies with pending device allocations approaching deadline. | `amc_contracts`, `amc_covered_devices`, `notifications` (Read/Write) |
| 33 | `requestAmcRenewal({ contractId, companyId, requestedCapacity, notes, userId })` | Company initiates a renewal request for an active or expired contract. | `amc_contracts`, `amc_requests`, `amc_contract_history`, `notifications`, `app_sequences` (Read/Write) |
| 34 | `createAmcRenewalContract({ previousContractId, requestId, planId, ... })` | Admin creates renewal offer with device isolation and gap coverage prevention. | `amc_contracts`, `amc_requests`, `amc_contract_history`, `app_sequences`, `notifications` (Read/Write) |
| 35 | `getCertificateSecret()` | Returns the primary active secret key for HMAC certificate generation. | None (Reads process.env / fallback) |
| 36 | `getCertificateSecrets()` | Returns primary and rotated secret keys for signature verification. | None (Reads process.env / fallback) |
| 37 | `generateCertificateCanonicalPayload(contract)` | Builds canonical serialized string representing contract SLA & identity. | None (Pure serialization) |
| 38 | `generateCertificateHmacCode(contract)` | Calculates cryptographic verification hash for AMC certificate. | None (Crypto HMAC SHA-256) |
| 39 | `verifyCertificateAuthenticity(contract, providedCode)` | Verifies certificate code against current key, rotated keys, and legacy SHA-256. | None (Crypto timingSafeEqual) |
| 40 | `getContractCertificateData(contractId, user)` | Returns authoritative certificate data payload with SLA terms, covered devices, and verification code. | `amc_contracts`, `users`, `company_profiles`, `amc_plans`, `amc_covered_devices`, `company_devices`, `site_settings` (Read) |
| 41 | `getPublicCertificateVerification(verificationCode, contractNumber)` | Sanitized public verification lookup by code or contract number for unauthenticated users. | `amc_contracts`, `users`, `amc_plans`, `amc_covered_devices`, `company_devices` (Read) |
| 42 | `evaluateContractCompliance(contract)` | Evaluates real-time compliance and validity state of a contract. | None (Pure logic) |
| 43 | `getExpiryRemindersHistory({ contractId, companyId, status, limit })` | Fetches admin audit log of scheduled expiry reminders. | `amc_expiry_reminders`, `amc_contracts`, `users` (Read) |
| 44 | `retryReminder(reminderId, adminUserId)` | Manually re-triggers a failed or partial expiry reminder outbox record. | `amc_expiry_reminders`, `amc_contracts`, `users`, `site_settings`, `notifications`, `amc_contract_history` (Read/Write) |

### 2. Full Verbatim Code of Target AMC Backend Functions

#### createRequest / submitRequest (`createAmcRequest`)
**File:** `server/services/amc.service.js` (Lines 857–871)

```javascript
const createAmcRequest = async ({ companyId, planId, requestedDeviceCount = 1, notes = '' }) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  if (!resolvedCompanyId) {
    throw new Error('Company not found.');
  }

  const requestNumber = `REQ-AMC-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

  const [result] = await pool.query(`
    INSERT INTO amc_requests (request_number, company_id, plan_id, requested_device_count, notes, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `, [requestNumber, resolvedCompanyId, planId || null, requestedDeviceCount, notes || null]);

  return { id: result.insertId, requestNumber };
};
```

#### reviewRequest (`reviewAmcRequest`)
**File:** `server/services/amc.service.js` (Lines 1560–1586)

```javascript
const reviewAmcRequest = async ({ requestId, adminUserId, status, adminNotes }) => {
  if (!['under_review', 'offered', 'rejected', 'cancelled'].includes(status)) {
    throw new Error('Invalid status for request review.');
  }

  const [reqs] = await pool.query('SELECT * FROM amc_requests WHERE id = ?', [requestId]);
  if (reqs.length === 0) throw new Error('AMC Request not found.');
  const req = reqs[0];

  await pool.query(`
    UPDATE amc_requests
    SET status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [status, adminNotes || null, adminUserId, requestId]);

  // Notify company
  await sendAmcNotification({
    userId: req.company_id,
    title: `AMC Request Update (${req.request_number})`,
    message: `Your AMC service request ${req.request_number} has been updated to: ${status.replace('_', ' ').toUpperCase()}.${adminNotes ? ` Note: ${adminNotes}` : ''}`
  });

  return { id: requestId, status };
};

/**
 * 14. Reject AMC Offer (Company)
```

#### createContract (offer) (`createAmcContract`)
**File:** `server/services/amc.service.js` (Lines 902–969)

```javascript
const createAmcContract = async ({
  companyId,
  requestId = null,
  planId = null,
  contractType = 'standard',
  planName,
  deviceCapacity,
  price,
  discountAmount = 0.00,
  taxAmount = 0.00,
  totalAmount,
  termsAndConditions = null,
  offerValidUntil = null,
  selectionDeadline = null,
  startDate = null,
  endDate = null,
  createdBy = null
}) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  if (!resolvedCompanyId) {
    throw new Error('Company not found.');
  }

  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      throw new Error('Invalid start date or end date format.');
    }
    if (e < s) {
      throw new Error('Contract end date cannot be earlier than start date.');
    }
  }

  return await createContractWithSequenceRetry({
    companyId: resolvedCompanyId,
    insertOperation: async (connection, contractNumber) => {
      const [result] = await connection.query(`
        INSERT INTO amc_contracts (
          contract_number, company_id, request_id, plan_id, contract_type,
          plan_name, device_capacity, price, discount_amount, tax_amount, total_amount,
          terms_and_conditions, offer_valid_until, selection_deadline, start_date, end_date,
          status, approval_status, payment_status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offered', 'pending_approval', 'unpaid', ?)
      `, [
        contractNumber, resolvedCompanyId, requestId || null, planId || null, contractType,
        planName, deviceCapacity, price, discountAmount, taxAmount, totalAmount,
        termsAndConditions || null,
        offerValidUntil ? formatDateOnly(offerValidUntil) : null,
        selectionDeadline ? formatDateOnly(selectionDeadline) : null,
        startDate ? formatDateOnly(startDate) : null,
        endDate ? formatDateOnly(endDate) : null,
        createdBy || null
      ]);

      if (requestId) {
        await connection.query('UPDATE amc_requests SET status = "offered" WHERE id = ?', [requestId]);
      }

      await connection.query(`
        INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
        VALUES (?, 'CONTRACT_CREATED', ?, ?)
      `, [result.insertId, createdBy || null, JSON.stringify({ contractNumber, planName, deviceCapacity, totalAmount })]);

      return { id: result.insertId };
    }
  });
};
```

#### approveContract (`approveAmcContract`)
**File:** `server/services/amc.service.js` (Lines 1291–1336)

```javascript
const approveAmcContract = async ({ contractId, adminUserId, startDate = null, endDate = null }) => {
  const [contracts] = await pool.query('SELECT * FROM amc_contracts WHERE id = ?', [contractId]);
  if (contracts.length === 0) throw new Error('Contract not found.');

  const contract = contracts[0];
  if (contract.status === 'rejected' || contract.approval_status === 'rejected') {
    throw new Error('Cannot approve a rejected contract offer.');
  }
  if (['cancelled', 'expired'].includes(contract.status)) {
    throw new Error(`Cannot approve a ${contract.status} contract.`);
  }

  const start = startDate ? formatDateOnly(startDate) : (contract.start_date ? formatDateOnly(contract.start_date) : formatDateOnly(new Date()));
  const end = endDate ? formatDateOnly(endDate) : (contract.end_date ? formatDateOnly(contract.end_date) : formatDateOnly(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)));

  if (new Date(end) < new Date(start)) {
    throw new Error('Contract end date cannot be earlier than start date.');
  }

  // If already paid, activate right away; otherwise preserve accepted or offered state so Company can still accept & pay
  const newStatus = contract.payment_status === 'paid'
    ? 'active'
    : ((contract.status === 'accepted' || contract.status === 'offered') ? contract.status : 'draft');

  await pool.query(`
    UPDATE amc_contracts
    SET approval_status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP,
        start_date = ?, end_date = ?, status = ?
    WHERE id = ?
  `, [adminUserId, start, end, newStatus, contractId]);

  if (newStatus === 'active') {
    await pool.query(`
      UPDATE amc_covered_devices
      SET coverage_start_date = ?, coverage_end_date = ?
      WHERE contract_id = ? AND status = 'active'
    `, [start, end, contractId]);
  }

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'CONTRACT_APPROVED', ?, ?)
  `, [contractId, adminUserId, JSON.stringify({ approvedBy: adminUserId, startDate: start, endDate: end, status: newStatus })]);

  return { success: true, contractId, approvalStatus: 'approved', status: newStatus };
};
```

#### acceptOffer (`acceptAmcOffer`)
**File:** `server/services/amc.service.js` (Lines 1256–1289)

```javascript
const acceptAmcOffer = async ({ contractId, companyId, userId }) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  const [contracts] = await pool.query(
    'SELECT * FROM amc_contracts WHERE id = ? AND company_id = ?',
    [contractId, resolvedCompanyId]
  );
  if (contracts.length === 0) throw new Error('Contract not found.');

  const contract = contracts[0];
  if (contract.status !== 'offered') {
    throw new Error(`Cannot accept contract with status "${contract.status}". Must be "offered".`);
  }

  if (contract.offer_valid_until && new Date(contract.offer_valid_until) < new Date(new Date().toISOString().slice(0, 10))) {
    await pool.query('UPDATE amc_contracts SET status = "expired" WHERE id = ?', [contractId]);
    await pool.query(`
      INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
      VALUES (?, 'OFFER_EXPIRED', ?, ?)
    `, [contractId, userId || null, JSON.stringify({ expiredAt: new Date().toISOString(), offerValidUntil: contract.offer_valid_until })]);
    throw new Error('This offer has expired and cannot be accepted.');
  }

  await pool.query(
    'UPDATE amc_contracts SET status = "accepted" WHERE id = ?',
    [contractId]
  );

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'OFFER_ACCEPTED', ?, ?)
  `, [contractId, userId || null, JSON.stringify({ acceptedAt: new Date() })]);

  return { success: true, contractId, status: 'accepted' };
};
```

#### assignDevicesToCoverage (`assignDevicesToCoverage`)
**File:** `server/services/amc.service.js` (Lines 466–597)

```javascript
const assignDevicesToCoverage = async (connectionOrPool, { contractId, companyId, deviceIds, userId }) => {
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
    throw new Error('Device IDs array is required and must not be empty.');
  }

  const isExternalConnection = typeof connectionOrPool.beginTransaction === 'function' && typeof connectionOrPool.getConnection !== 'function';
  const connection = isExternalConnection ? connectionOrPool : await pool.getConnection();

  if (!isExternalConnection) {
    await connection.beginTransaction();
  }

  try {
    const resolvedCompanyId = await resolveCompanyUserId(connection, companyId);
    if (!resolvedCompanyId) {
      throw new Error('Company not found.');
    }

    // Row-level lock on contract
    const [contracts] = await connection.query(
      'SELECT * FROM amc_contracts WHERE id = ? AND company_id = ? FOR UPDATE',
      [contractId, resolvedCompanyId]
    );

    if (contracts.length === 0) {
      throw new Error('Contract not found or does not belong to this company.');
    }

    const contract = contracts[0];
    if (!['active', 'accepted', 'draft', 'offered'].includes(contract.status)) {
      throw new Error(`Cannot assign devices to a contract with status "${contract.status}".`);
    }

    // Selection deadline verification (Fix C)
    if (contract.selection_deadline) {
      const deadlineStr = formatDateOnly(contract.selection_deadline);
      const todayStr = getBusinessTodayStr();
      if (deadlineStr < todayStr) {
        throw new Error(`Device allocation window closed on ${deadlineStr}. Allocation past the selection deadline is prohibited.`);
      }
    }

    // Capacity verification
    const [countRows] = await connection.query(
      'SELECT COUNT(*) AS activeCount FROM amc_covered_devices WHERE contract_id = ? AND status = ?',
      [contractId, 'active']
    );
    const activeCount = countRows[0].activeCount || 0;
    const remainingSlots = contract.device_capacity - activeCount;

    if (deviceIds.length > remainingSlots) {
      throw new Error(`CAPACITY_EXCEEDED: Selecting ${deviceIds.length} devices exceeds remaining capacity of ${remainingSlots} slot(s).`);
    }

    // Validate that all devices belong to this company
    const [devices] = await connection.query(
      'SELECT id, brand, model_number, serial_number, is_active FROM company_devices WHERE id IN (?) AND company_id = ?',
      [deviceIds, resolvedCompanyId]
    );

    if (devices.length !== deviceIds.length) {
      throw new Error('INVALID_DEVICE: One or more selected devices do not belong to this company fleet.');
    }

    // Check if any device already has active coverage in ANY contract
    const [existingCoverage] = await connection.query(
      'SELECT device_id FROM amc_covered_devices WHERE device_id IN (?) AND status = ?',
      [deviceIds, 'active']
    );

    if (existingCoverage.length > 0) {
      const dupeIds = existingCoverage.map(r => r.device_id).join(', ');
      throw new Error(`ALREADY_COVERED: Device(s) [${dupeIds}] already have active AMC coverage.`);
    }

    const startDate = contract.start_date ? formatDateOnly(contract.start_date) : formatDateOnly(new Date());
    const endDate = contract.end_date ? formatDateOnly(contract.end_date) : formatDateOnly(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

    // Get current max sequence number for tag generation
    const [tagRows] = await connection.query(
      'SELECT COUNT(*) AS totalTags FROM amc_covered_devices WHERE contract_id = ?',
      [contractId]
    );
    let tagSeq = (tagRows[0]?.totalTags || 0) + 1;

    for (const dev of devices) {
      const amcTag = `${contract.contract_number}-DEV-${String(tagSeq++).padStart(3, '0')}`;

      await connection.query(`
        INSERT INTO amc_covered_devices 
          (contract_id, device_id, company_id, amc_tag, coverage_start_date, coverage_end_date, status, selected_by)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
      `, [contractId, dev.id, resolvedCompanyId, amcTag, startDate, endDate, userId || null]);

      // Backward compatibility sync for legacy device table fields
      await connection.query(
        'UPDATE company_devices SET is_amc = 1, amc_tag = ? WHERE id = ?',
        [amcTag, dev.id]
      );
    }

    // Record audit history
    await connection.query(`
      INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
      VALUES (?, 'DEVICES_ASSIGNED', ?, ?)
    `, [contractId, userId || null, JSON.stringify({ deviceIds, assignedCount: devices.length })]);

    if (!isExternalConnection) {
      await connection.commit();
    }

    return {
      success: true,
      contractId,
      assignedCount: devices.length,
      deviceIds
    };
  } catch (error) {
    if (!isExternalConnection) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (!isExternalConnection && connection) {
      connection.release();
    }
  }
};

/**
 * 4. Request Device Replacement
 * Creates a replacement request without mutating active coverage until approved by Admin.
```

#### requestDeviceReplacement (`requestDeviceReplacement`)
**File:** `server/services/amc.service.js` (Lines 599–707)

```javascript
const requestDeviceReplacement = async (connectionOrPool, { contractId, companyId, oldDeviceId, newDeviceId, reason, userId }) => {
  if (!oldDeviceId || !newDeviceId) {
    throw new Error('Both old device and replacement device are required.');
  }
  if (oldDeviceId === newDeviceId) {
    throw new Error('Replacement device must be different from current device.');
  }
  if (!reason || !reason.trim()) {
    throw new Error('Replacement reason is required.');
  }

  const isExternalConnection = typeof connectionOrPool.beginTransaction === 'function' && typeof connectionOrPool.getConnection !== 'function';
  const connection = isExternalConnection ? connectionOrPool : await pool.getConnection();

  if (!isExternalConnection) {
    await connection.beginTransaction();
  }

  try {
    const resolvedCompanyId = await resolveCompanyUserId(connection, companyId);
    if (!resolvedCompanyId) {
      throw new Error('Company not found.');
    }

    // Verify contract
    const [contracts] = await connection.query(
      'SELECT id, contract_number, status FROM amc_contracts WHERE id = ? AND company_id = ?',
      [contractId, resolvedCompanyId]
    );
    if (contracts.length === 0) {
      throw new Error('Contract not found or does not belong to company.');
    }

    // Verify old device has active coverage under this contract
    const [oldCov] = await connection.query(
      'SELECT * FROM amc_covered_devices WHERE contract_id = ? AND device_id = ? AND status = ?',
      [contractId, oldDeviceId, 'active']
    );
    if (oldCov.length === 0) {
      throw new Error('Current device is not actively covered under this contract.');
    }

    // Verify new device belongs to company fleet
    const [newDev] = await connection.query(
      'SELECT id, brand, model_number, serial_number, is_active FROM company_devices WHERE id = ? AND company_id = ?',
      [newDeviceId, resolvedCompanyId]
    );
    if (newDev.length === 0) {
      throw new Error('Replacement device does not exist in your registered fleet.');
    }

    // Verify new device does not already have active coverage
    const [newCov] = await connection.query(
      'SELECT id FROM amc_covered_devices WHERE device_id = ? AND status = ?',
      [newDeviceId, 'active']
    );
    if (newCov.length > 0) {
      throw new Error('Replacement device already has active AMC coverage.');
    }

    // Verify no pending replacement exists for these devices
    const [pendingReq] = await connection.query(
      'SELECT id FROM amc_device_replacements WHERE contract_id = ? AND status = ? AND (old_device_id = ? OR new_device_id = ?)',
      [contractId, 'pending', oldDeviceId, newDeviceId]
    );
    if (pendingReq.length > 0) {
      throw new Error('A replacement request is already pending for this device.');
    }

    const replacementNumber = `REP-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const [insertResult] = await connection.query(`
      INSERT INTO amc_device_replacements
        (replacement_number, contract_id, company_id, old_device_id, new_device_id, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `, [replacementNumber, contractId, resolvedCompanyId, oldDeviceId, newDeviceId, reason.trim()]);

    await connection.query(`
      INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
      VALUES (?, 'REPLACEMENT_REQUESTED', ?, ?)
    `, [contractId, userId || null, JSON.stringify({ replacementNumber, oldDeviceId, newDeviceId, reason })]);

    if (!isExternalConnection) {
      await connection.commit();
    }

    return {
      id: insertResult.insertId,
      replacementNumber,
      contractId,
      oldDeviceId,
      newDeviceId,
      status: 'pending'
    };
  } catch (error) {
    if (!isExternalConnection) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (!isExternalConnection && connection) {
      connection.release();
    }
  }
};

/**
 * 5. Review Device Replacement (Admin only)
 * Approves or rejects a device replacement request.
```

#### reviewDeviceReplacement (`reviewDeviceReplacement`)
**File:** `server/services/amc.service.js` (Lines 709–824)

```javascript
const reviewDeviceReplacement = async (connectionOrPool, { replacementId, adminUserId, decision, adminNotes }) => {
  if (!['approved', 'rejected'].includes(decision)) {
    throw new Error('Decision must be either "approved" or "rejected".');
  }

  const isExternalConnection = typeof connectionOrPool.beginTransaction === 'function' && typeof connectionOrPool.getConnection !== 'function';
  const connection = isExternalConnection ? connectionOrPool : await pool.getConnection();

  if (!isExternalConnection) {
    await connection.beginTransaction();
  }

  try {
    const [rows] = await connection.query(
      'SELECT * FROM amc_device_replacements WHERE id = ? FOR UPDATE',
      [replacementId]
    );

    if (rows.length === 0) {
      throw new Error(`Replacement request ${replacementId} not found.`);
    }

    const req = rows[0];
    if (req.status !== 'pending') {
      throw new Error(`Replacement request has already been reviewed (status: ${req.status}).`);
    }

    const [contracts] = await connection.query(
      'SELECT * FROM amc_contracts WHERE id = ?',
      [req.contract_id]
    );
    const contract = contracts[0];

    if (decision === 'approved') {
      // 1. Mark replacement approved
      await connection.query(`
        UPDATE amc_device_replacements 
        SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, effective_date = CURRENT_DATE, admin_notes = ?
        WHERE id = ?
      `, [adminUserId, adminNotes || null, replacementId]);

      // 2. Decommission old device from contract coverage
      await connection.query(`
        UPDATE amc_covered_devices 
        SET status = 'replaced' 
        WHERE contract_id = ? AND device_id = ? AND status = 'active'
      `, [req.contract_id, req.old_device_id]);

      // Reset legacy flag on old device
      await connection.query(
        'UPDATE company_devices SET is_amc = 0 WHERE id = ?',
        [req.old_device_id]
      );

      // 3. Add new device to active coverage
      const [oldCov] = await connection.query(
        'SELECT amc_tag FROM amc_covered_devices WHERE contract_id = ? AND device_id = ? ORDER BY id DESC LIMIT 1',
        [req.contract_id, req.old_device_id]
      );
      const inheritedTag = oldCov[0]?.amc_tag || `${contract.contract_number}-REP-${req.new_device_id}`;
      const startDate = new Date().toISOString().slice(0, 10);
      const endDate = contract.end_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      await connection.query(`
        INSERT INTO amc_covered_devices 
          (contract_id, device_id, company_id, amc_tag, coverage_start_date, coverage_end_date, status, selected_by)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
      `, [req.contract_id, req.new_device_id, req.company_id, inheritedTag, startDate, endDate, adminUserId]);

      await connection.query(
        'UPDATE company_devices SET is_amc = 1, amc_tag = ? WHERE id = ?',
        [inheritedTag, req.new_device_id]
      );

      // 4. Record history
      await connection.query(`
        INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
        VALUES (?, 'REPLACEMENT_APPROVED', ?, ?)
      `, [req.contract_id, adminUserId, JSON.stringify({ replacementId, oldDeviceId: req.old_device_id, newDeviceId: req.new_device_id, adminNotes })]);
    } else {
      // Rejected
      await connection.query(`
        UPDATE amc_device_replacements 
        SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, admin_notes = ?
        WHERE id = ?
      `, [adminUserId, adminNotes || null, replacementId]);

      await connection.query(`
        INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
        VALUES (?, 'REPLACEMENT_REJECTED', ?, ?)
      `, [req.contract_id, adminUserId, JSON.stringify({ replacementId, adminNotes })]);
    }

    if (!isExternalConnection) {
      await connection.commit();
    }

    return {
      replacementId,
      decision,
      contractId: req.contract_id
    };
  } catch (error) {
    if (!isExternalConnection) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (!isExternalConnection && connection) {
      connection.release();
    }
  }
};

/**
 * 6. Plan Management
```

#### resolveDeviceAmcEligibility (`resolveDeviceAmcEligibility`)
**File:** `server/services/amc.service.js` (Lines 216–402)

```javascript
const resolveDeviceAmcEligibility = async (connectionOrPool, { companyId, deviceId, repairDate } = {}) => {
  const isPool = typeof connectionOrPool.getConnection === 'function';
  const connection = isPool ? await connectionOrPool.getConnection() : connectionOrPool;

  try {
    const resolvedCompanyId = await resolveCompanyUserId(connection, companyId);
    if (!resolvedCompanyId) {
      return {
        isEligible: false,
        reason: 'COMPANY_NOT_FOUND',
        contract: null,
        coverage: null
      };
    }

    const targetDate = repairDate ? formatDateOnly(repairDate) : getBusinessTodayStr();

    // If no specific device is provided, check if the company has any active, approved, paid contract
    if (!deviceId) {
      const [contracts] = await connection.query(`
        SELECT id, contract_number, plan_name, device_capacity, status, approval_status, payment_status, start_date, end_date
        FROM amc_contracts
        WHERE company_id = ?
          AND status = 'active'
          AND approval_status = 'approved'
          AND payment_status = 'paid'
          AND start_date <= ?
          AND end_date >= ?
        ORDER BY end_date DESC
        LIMIT 1
      `, [resolvedCompanyId, targetDate, targetDate]);

      if (contracts.length === 0) {
        return {
          isEligible: false,
          reason: 'NO_ACTIVE_CONTRACT',
          contract: null,
          coverage: null
        };
      }

      return {
        isEligible: false, // Specific device is required for repair ticket coverage
        reason: 'DEVICE_NOT_SPECIFIED',
        contract: contracts[0],
        coverage: null
      };
    }

    // Verify device belongs to this company
    const [devRows] = await connection.query(
      'SELECT id, brand, model_number, serial_number, is_active FROM company_devices WHERE id = ? AND company_id = ? LIMIT 1',
      [deviceId, resolvedCompanyId]
    );

    if (devRows.length === 0) {
      return {
        isEligible: false,
        reason: 'DEVICE_NOT_FOUND_FOR_COMPANY',
        contract: null,
        coverage: null
      };
    }

    // Query active coverage for device under an active, approved, paid AMC contract with valid dates
    const [coverageRows] = await connection.query(`
      SELECT 
        cd.id AS coverage_id,
        cd.contract_id,
        cd.device_id,
        cd.amc_tag,
        cd.coverage_start_date,
        cd.coverage_end_date,
        cd.status AS coverage_status,
        c.contract_number,
        c.plan_name,
        c.device_capacity,
        c.status AS contract_status,
        c.approval_status,
        c.payment_status,
        c.start_date,
        c.end_date
      FROM amc_covered_devices cd
      JOIN amc_contracts c ON cd.contract_id = c.id
      WHERE cd.device_id = ?
        AND cd.company_id = ?
        AND cd.status = 'active'
        AND c.company_id = ?
        AND c.status = 'active'
        AND c.approval_status = 'approved'
        AND c.payment_status = 'paid'
        AND c.start_date <= ?
        AND c.end_date >= ?
        AND cd.coverage_start_date <= ?
        AND cd.coverage_end_date >= ?
      ORDER BY c.end_date DESC
      LIMIT 1
    `, [deviceId, resolvedCompanyId, resolvedCompanyId, targetDate, targetDate, targetDate, targetDate]);

    if (coverageRows.length > 0) {
      const row = coverageRows[0];
      return {
        isEligible: true,
        reason: null,
        contract: {
          id: row.contract_id,
          contract_number: row.contract_number,
          plan_name: row.plan_name,
          device_capacity: row.device_capacity,
          start_date: row.start_date,
          end_date: row.end_date,
          status: row.contract_status,
          approval_status: row.approval_status,
          payment_status: row.payment_status
        },
        coverage: {
          id: row.coverage_id,
          amc_tag: row.amc_tag,
          coverage_start_date: row.coverage_start_date,
          coverage_end_date: row.coverage_end_date,
          status: row.coverage_status
        }
      };
    }

    // Check why not eligible for helpful diagnostics
    const [anyContract] = await connection.query(`
      SELECT id, status, approval_status, payment_status, start_date, end_date
      FROM amc_contracts
      WHERE company_id = ?
      ORDER BY id DESC
      LIMIT 1
    `, [resolvedCompanyId]);

    if (anyContract.length === 0) {
      return { isEligible: false, reason: 'NO_CONTRACT_RECORD', contract: null, coverage: null };
    }

    const cnt = anyContract[0];
    if (cnt.approval_status !== 'approved') {
      return { isEligible: false, reason: 'CONTRACT_NOT_APPROVED', contract: cnt, coverage: null };
    }
    if (cnt.payment_status !== 'paid') {
      return { isEligible: false, reason: 'CONTRACT_UNPAID', contract: cnt, coverage: null };
    }
    if (cnt.status !== 'active') {
      return { isEligible: false, reason: `CONTRACT_${cnt.status.toUpperCase()}`, contract: cnt, coverage: null };
    }

    const targetDateStr = formatDateOnly(targetDate);
    const startDateStr = formatDateOnly(cnt.start_date);
    const endDateStr = formatDateOnly(cnt.end_date);
    if (startDateStr && startDateStr > targetDateStr) {
      return { isEligible: false, reason: 'CONTRACT_NOT_STARTED', contract: cnt, coverage: null };
    }
    if (endDateStr && endDateStr < targetDateStr) {
      return { isEligible: false, reason: 'CONTRACT_EXPIRED', contract: cnt, coverage: null };
    }

    // Check if contract has zero allocated devices (incomplete device selection)
    const [coveredCountRows] = await connection.query(`
      SELECT COUNT(*) AS activeCount FROM amc_covered_devices WHERE contract_id = ? AND status = 'active'
    `, [cnt.id]);
    const contractCoveredCount = coveredCountRows[0]?.activeCount || 0;
    if (contractCoveredCount === 0) {
      return { isEligible: false, reason: 'CONTRACT_HAS_ZERO_ALLOCATED_DEVICES', contract: cnt, coverage: null };
    }

    const [deviceInContract] = await connection.query(`
      SELECT id, status FROM amc_covered_devices WHERE device_id = ? AND company_id = ? LIMIT 1
    `, [deviceId, resolvedCompanyId]);

    if (deviceInContract.length === 0) {
      return { isEligible: false, reason: 'DEVICE_NOT_IN_COVERED_FLEET', contract: cnt, coverage: null };
    }

    return { isEligible: false, reason: 'DEVICE_COVERAGE_INACTIVE_OR_EXPIRED', contract: cnt, coverage: deviceInContract[0] };
  } finally {
    if (isPool && connection) {
      connection.release();
    }
  }
};

/**
 * 2. Check Contract Capacity
 * Computes capacity, covered device count, and available slots.
```

#### Payment Order Creation (`createContractPaymentOrder`)
**File:** `server/services/amc.service.js` (Lines 1707–1778)

```javascript
const createContractPaymentOrder = async ({ contractId, companyId, userId }) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  const [contracts] = await pool.query(
    'SELECT * FROM amc_contracts WHERE id = ? AND company_id = ?',
    [contractId, resolvedCompanyId]
  );
  if (contracts.length === 0) throw new Error('Contract not found.');

  const contract = contracts[0];
  if (contract.status === 'rejected' || contract.approval_status === 'rejected') {
    throw new Error('Cannot initiate payment for a rejected contract offer.');
  }
  if (contract.payment_status === 'paid') {
    throw new Error('This contract is already paid.');
  }

  const totalAmount = parseFloat(contract.total_amount);
  const keyId = config.razorpay?.keyId || '';
  const keySecret = config.razorpay?.keySecret || '';
  const currency = contract.currency || 'INR';

  let orderId = `order_amc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // If live Razorpay keys are configured, create real Razorpay order
  if (keyId && keySecret && !keySecret.includes('YourKeySecret') && !keySecret.includes('demo')) {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: Math.round(totalAmount * 100), // in paise
          currency,
          receipt: `amc_${contract.id}`,
          notes: {
            contract_id: String(contract.id),
            contract_number: contract.contract_number,
            company_id: String(resolvedCompanyId)
          }
        })
      });
      const orderData = await res.json();
      if (orderData && orderData.id) {
        orderId = orderData.id;
      }
    } catch (orderErr) {
      logger.warn(`Razorpay API order creation fallback: ${orderErr.message}`);
    }
  }

  // Insert payment record
  await pool.query(`
    INSERT INTO payments (order_id, user_id, company_id, amount, currency, status, gateway, reference_note)
    VALUES (?, ?, ?, ?, ?, 'created', 'razorpay', ?)
  `, [orderId, userId, resolvedCompanyId, totalAmount, currency, `AMC Contract: ${contract.contract_number}`]);

  return {
    orderId,
    amount: totalAmount,
    currency,
    keyId,
    contractId: contract.id,
    contractNumber: contract.contract_number,
    planName: contract.plan_name
  };
};

/**
 * 17. Verify AMC Contract Payment (Razorpay signature verification)
```

#### Payment Verification (Razorpay) (`verifyContractPayment`)
**File:** `server/services/amc.service.js` (Lines 1780–1896)

```javascript
const verifyContractPayment = async ({ contractId, companyId, razorpayOrderId, razorpayPaymentId, razorpaySignature, userId }) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  const [contracts] = await pool.query(
    'SELECT * FROM amc_contracts WHERE id = ? AND company_id = ?',
    [contractId, resolvedCompanyId]
  );
  if (contracts.length === 0) throw new Error('Contract not found.');

  const contract = contracts[0];
  if (contract.status === 'rejected' || contract.approval_status === 'rejected') {
    throw new Error('Cannot verify payment for a rejected contract offer.');
  }

  // Idempotency: avoid duplicate invoices on verification replays
  if (contract.payment_status === 'paid') {
    return {
      success: true,
      contractId,
      invoiceId: contract.invoice_id,
      paymentStatus: 'paid',
      status: contract.status
    };
  }

  const keySecret = config.razorpay?.keySecret;

  // Strict signature verification when real keys are configured
  if (keySecret && !keySecret.includes('YourKeySecret') && !keySecret.includes('demo')) {
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    const bufExpected = Buffer.from(expectedSignature, 'utf8');
    const bufReceived = Buffer.from(razorpaySignature || '', 'utf8');
    const isSignatureValid = bufExpected.length === bufReceived.length && crypto.timingSafeEqual(bufExpected, bufReceived);
    if (!isSignatureValid) {
      await pool.query('UPDATE payments SET status = "failed", error_message = "Invalid signature" WHERE order_id = ?', [razorpayOrderId]);
      await pool.query('UPDATE amc_contracts SET payment_status = "failed" WHERE id = ?', [contractId]);
      throw new Error('Payment signature verification failed.');
    }
  }

  // Update payment record
  await pool.query(`
    UPDATE payments 
    SET payment_id = ?, status = 'paid', verification_status = 'verified', verified_at = CURRENT_TIMESTAMP
    WHERE order_id = ?
  `, [razorpayPaymentId, razorpayOrderId]);

  // Create commercial invoice
  const [profiles] = await pool.query('SELECT company_name FROM company_profiles WHERE user_id = ?', [resolvedCompanyId]);
  const [users] = await pool.query('SELECT name FROM users WHERE id = ?', [resolvedCompanyId]);
  const clientName = profiles[0]?.company_name || users[0]?.name || 'Corporate Client';
  const invoiceId = await generateInvoiceId(pool);

  await pool.query(`
    INSERT INTO invoices (
      id, user_id, client_name, amount, subtotal, tax_amount, currency, invoice_date, due_date, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Paid', ?)
  `, [
    invoiceId, resolvedCompanyId, clientName,
    contract.total_amount, contract.price, contract.tax_amount || 0,
    contract.currency || 'INR', `AMC Contract Payment: ${contract.contract_number} (${contract.plan_name})`
  ]);

  await pool.query(`
    INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total, tax_amount)
    VALUES (?, ?, 1, ?, ?, ?)
  `, [invoiceId, `AMC Plan: ${contract.plan_name} (${contract.device_capacity} Devices)`, contract.price, contract.price, contract.tax_amount || 0]);

  // Update contract
  const shouldActivate = contract.approval_status === 'approved';
  const start = contract.start_date ? formatDateOnly(contract.start_date) : formatDateOnly(new Date());
  const end = contract.end_date ? formatDateOnly(contract.end_date) : formatDateOnly(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

  await pool.query(`
    UPDATE amc_contracts
    SET payment_status = 'paid', invoice_id = ?, status = ?, start_date = ?, end_date = ?
    WHERE id = ?
  `, [invoiceId, shouldActivate ? 'active' : (contract.status === 'offered' ? 'accepted' : contract.status), start, end, contractId]);

  if (shouldActivate) {
    await pool.query(`
      UPDATE amc_covered_devices
      SET coverage_start_date = ?, coverage_end_date = ?
      WHERE contract_id = ? AND status = 'active'
    `, [start, end, contractId]);
  }

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'PAYMENT_VERIFIED', ?, ?)
  `, [contractId, userId || null, JSON.stringify({ razorpayPaymentId, razorpayOrderId, invoiceId, amount: contract.total_amount, activated: shouldActivate })]);

  // Notify admin & company
  await sendAmcNotification({
    role: 'admin',
    title: `AMC Payment Verified (${contract.contract_number})`,
    message: `Payment of ₹${contract.total_amount} verified for contract ${contract.contract_number} (${contract.plan_name}). Invoice ${invoiceId} generated.`
  });
  await sendAmcNotification({
    userId: resolvedCompanyId,
    title: `Payment Receipt: AMC Contract ${contract.contract_number}`,
    message: `Your payment of ₹${contract.total_amount} was successfully verified. Invoice ${invoiceId} is generated.${shouldActivate ? ' Your AMC coverage is now ACTIVE.' : ' Contract is awaiting final admin approval.'}`
  });

  return {
    success: true,
    contractId,
    invoiceId,
    paymentStatus: 'paid',
    status: shouldActivate ? 'active' : contract.status
  };
};

/**
 * 18. Initiate Contract Offline Payment (Bank Transfer / NEFT / Cheque)
```

#### Offline Payment Submit (`initiateContractOfflinePayment`)
**File:** `server/services/amc.service.js` (Lines 1898–1939)

```javascript
const initiateContractOfflinePayment = async ({ contractId, companyId, paymentMethod = 'bank_transfer', referenceNumber, notes, userId }) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  const [contracts] = await pool.query(
    'SELECT * FROM amc_contracts WHERE id = ? AND company_id = ?',
    [contractId, resolvedCompanyId]
  );
  if (contracts.length === 0) throw new Error('Contract not found.');

  const contract = contracts[0];
  if (contract.status === 'rejected' || contract.approval_status === 'rejected') {
    throw new Error('Cannot initiate payment for a rejected contract offer.');
  }
  if (contract.payment_status === 'paid') {
    throw new Error('This contract is already paid.');
  }

  const orderId = `offline_amc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  await pool.query(`
    INSERT INTO payments (order_id, user_id, company_id, amount, currency, payment_method, status, gateway, reference_note)
    VALUES (?, ?, ?, ?, ?, ?, 'pending_verification', 'offline', ?)
  `, [orderId, userId, resolvedCompanyId, contract.total_amount, contract.currency || 'INR', paymentMethod, `AMC Ref: ${referenceNumber || 'N/A'}. Contract: ${contract.contract_number}. ${notes || ''}`]);

  await pool.query('UPDATE amc_contracts SET payment_status = "pending_verification" WHERE id = ?', [contractId]);

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'OFFLINE_PAYMENT_INITIATED', ?, ?)
  `, [contractId, userId || null, JSON.stringify({ orderId, paymentMethod, referenceNumber, notes: notes || null, amount: contract.total_amount })]);

  // Notify admin to review offline payment
  await sendAmcNotification({
    role: 'admin',
    title: `AMC Offline Payment Awaiting Verification (${contract.contract_number})`,
    message: `Company initiated ${paymentMethod} payment for AMC contract ${contract.contract_number}. Ref: ${referenceNumber || 'N/A'}. Amount: ₹${contract.total_amount}.`
  });

  return { success: true, contractId, paymentStatus: 'pending_verification' };
};

/**
 * 19. Verify Contract Offline Payment (Admin)
```

#### Offline Payment Admin Verify (`verifyContractOfflinePayment`)
**File:** `server/services/amc.service.js` (Lines 1941–2117)

```javascript
const verifyContractOfflinePayment = async ({ contractId, adminUserId, decision, adminNotes }) => {
  if (!['verified', 'rejected'].includes(decision)) {
    throw new Error('Decision must be "verified" or "rejected".');
  }

  const connection = await pool.getConnection();
  let contract = null;
  let verifiedResult = null;
  let rejectedResult = null;

  try {
    await connection.beginTransaction();

    const [contracts] = await connection.query('SELECT * FROM amc_contracts WHERE id = ? FOR UPDATE', [contractId]);
    if (contracts.length === 0) throw new Error('Contract not found.');
    contract = contracts[0];

    if (contract.status === 'rejected' || contract.approval_status === 'rejected') {
      throw new Error('Cannot verify offline payment for a rejected contract offer.');
    }
    if (['cancelled', 'expired'].includes(contract.status)) {
      throw new Error(`Cannot verify offline payment for a ${contract.status} contract.`);
    }

    if (decision === 'verified' && contract.payment_status === 'paid') {
      // Idempotency: avoid duplicate invoices on offline verification replays
      await connection.commit();
      return {
        success: true,
        contractId,
        invoiceId: contract.invoice_id,
        paymentStatus: 'paid',
        status: contract.status
      };
    }

    if (contract.payment_status !== 'pending_verification') {
      throw new Error(`Cannot ${decision === 'verified' ? 'verify' : 'reject'} offline payment when contract payment status is "${contract.payment_status}".`);
    }

    // Resolve and lock exact pending offline payment before mutating invoices or contract status
    const offlineResolution = await resolveContractOfflinePayment({ contract, pendingOnly: true, connection });
    if (!offlineResolution.paymentRow) {
      throw new Error('No pending offline payment record found for verification on this contract.');
    }

    const paymentRow = offlineResolution.paymentRow;

    if (decision === 'verified') {
      const [payUpdateRes] = await connection.query(`
        UPDATE payments 
        SET status = 'paid', verification_status = 'verified', verified_by = ?, verified_at = CURRENT_TIMESTAMP
        WHERE id = ? AND company_id = ? AND gateway = 'offline' AND status = 'pending_verification'
      `, [adminUserId, paymentRow.id, contract.company_id]);

      if (payUpdateRes.affectedRows !== 1) {
        throw new Error('Pending offline payment record could not be updated or was already processed.');
      }

      if (Array.isArray(offlineResolution.priorHistoryOrderIds) && offlineResolution.priorHistoryOrderIds.length > 0) {
        await connection.query(`
          UPDATE payments
          SET status = 'cancelled',
              error_message = COALESCE(error_message, 'Superseded by newer verified offline payment')
          WHERE company_id = ?
            AND gateway = 'offline'
            AND status = 'pending_verification'
            AND id <> ?
            AND order_id IN (?)
        `, [contract.company_id, paymentRow.id, offlineResolution.priorHistoryOrderIds]);
      }

      // Generate invoice atomically inside the transaction
      const [profiles] = await connection.query('SELECT company_name FROM company_profiles WHERE user_id = ?', [contract.company_id]);
      const [users] = await connection.query('SELECT name FROM users WHERE id = ?', [contract.company_id]);
      const clientName = profiles[0]?.company_name || users[0]?.name || 'Corporate Client';
      const invoiceId = await generateInvoiceId(connection);

      await connection.query(`
        INSERT INTO invoices (
          id, user_id, client_name, amount, subtotal, tax_amount, currency, invoice_date, due_date, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Paid', ?)
      `, [
        invoiceId, contract.company_id, clientName,
        contract.total_amount, contract.price, contract.tax_amount || 0,
        contract.currency || 'INR', `AMC Contract Payment (Offline): ${contract.contract_number} (${contract.plan_name})`
      ]);

      await connection.query(`
        INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total, tax_amount)
        VALUES (?, ?, 1, ?, ?, ?)
      `, [invoiceId, `AMC Plan: ${contract.plan_name} (${contract.device_capacity} Devices)`, contract.price, contract.price, contract.tax_amount || 0]);

      const shouldActivate = contract.approval_status === 'approved';
      const nextContractStatus = shouldActivate ? 'active' : (contract.status === 'offered' ? 'accepted' : contract.status);
      const start = contract.start_date ? formatDateOnly(contract.start_date) : formatDateOnly(new Date());
      const end = contract.end_date ? formatDateOnly(contract.end_date) : formatDateOnly(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

      await connection.query(`
        UPDATE amc_contracts
        SET payment_status = 'paid', invoice_id = ?, status = ?, start_date = ?, end_date = ?
        WHERE id = ?
      `, [invoiceId, nextContractStatus, start, end, contractId]);

      if (shouldActivate) {
        await connection.query(`
          UPDATE amc_covered_devices
          SET coverage_start_date = ?, coverage_end_date = ?
          WHERE contract_id = ? AND status = 'active'
        `, [start, end, contractId]);
      }

      await connection.query(`
        INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
        VALUES (?, 'OFFLINE_PAYMENT_VERIFIED', ?, ?)
      `, [contractId, adminUserId, JSON.stringify({ invoiceId, adminNotes, activated: shouldActivate, orderId: paymentRow.order_id || null })]);

      await connection.commit();
      verifiedResult = { success: true, contractId, paymentStatus: 'paid', invoiceId, status: nextContractStatus, shouldActivate };
    } else {
      const [payRejectRes] = await connection.query(`
        UPDATE payments
        SET status = 'rejected', verification_status = 'rejected', verified_by = ?, verified_at = CURRENT_TIMESTAMP, error_message = ?
        WHERE id = ? AND company_id = ? AND gateway = 'offline' AND status = 'pending_verification'
      `, [adminUserId, adminNotes || 'Offline payment verification rejected by admin', paymentRow.id, contract.company_id]);

      if (payRejectRes.affectedRows !== 1) {
        throw new Error('Pending offline payment record could not be updated or was already processed.');
      }

      await connection.query('UPDATE amc_contracts SET payment_status = "failed" WHERE id = ?', [contractId]);

      await connection.query(`
        INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
        VALUES (?, 'OFFLINE_PAYMENT_REJECTED', ?, ?)
      `, [contractId, adminUserId, JSON.stringify({ adminNotes, orderId: paymentRow.order_id || null })]);

      await connection.commit();
      rejectedResult = { success: true, contractId, paymentStatus: 'failed' };
    }
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    throw err;
  } finally {
    connection.release();
  }

  if (verifiedResult) {
    await sendAmcNotification({
      userId: contract.company_id,
      title: `AMC Offline Payment Verified (${contract.contract_number})`,
      message: `Your offline payment for contract ${contract.contract_number} has been verified! Invoice ${verifiedResult.invoiceId} is generated.${verifiedResult.shouldActivate ? ' Your AMC coverage is now ACTIVE.' : ' Contract is awaiting final admin approval.'}`
    });
    return {
      success: true,
      contractId: verifiedResult.contractId,
      paymentStatus: verifiedResult.paymentStatus,
      invoiceId: verifiedResult.invoiceId,
      status: verifiedResult.status
    };
  }

  await sendAmcNotification({
    userId: contract.company_id,
    title: `AMC Payment Rejected (${contract.contract_number})`,
    message: `Your offline payment for contract ${contract.contract_number} was rejected by admin.${adminNotes ? ` Reason: ${adminNotes}` : ''} Please contact support or retry payment.`
  });
  return rejectedResult;
};

/**
 * 20. Process Contract Expiries and Offer Expiries
 * Automatically transitions active contracts that have passed their end_date to 'expired'
 * and updates covered devices to 'expired'.
 * Sweeps offered contracts past their offer_valid_until to 'expired'.
```

#### Contract Activation (`activateAmcContract`)
**File:** `server/services/amc.service.js` (Lines 1338–1379)

```javascript
const activateAmcContract = async ({ contractId, adminUserId = null }) => {
  const [contracts] = await pool.query('SELECT * FROM amc_contracts WHERE id = ?', [contractId]);
  if (contracts.length === 0) throw new Error('Contract not found.');

  const contract = contracts[0];
  if (contract.status === 'rejected' || contract.approval_status === 'rejected') {
    throw new Error('Cannot activate a rejected contract.');
  }
  if (contract.approval_status !== 'approved') {
    throw new Error('Contract must be approved by admin before activation.');
  }
  if (contract.payment_status !== 'paid') {
    throw new Error('Contract must be paid before activation.');
  }

  const start = contract.start_date ? formatDateOnly(contract.start_date) : formatDateOnly(new Date());
  const end = contract.end_date ? formatDateOnly(contract.end_date) : formatDateOnly(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

  await pool.query(`
    UPDATE amc_contracts 
    SET status = 'active', start_date = ?, end_date = ?
    WHERE id = ?
  `, [start, end, contractId]);

  // Update covered devices coverage dates if not set
  await pool.query(`
    UPDATE amc_covered_devices 
    SET coverage_start_date = ?, coverage_end_date = ?
    WHERE contract_id = ? AND status = 'active'
  `, [start, end, contractId]);

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'CONTRACT_ACTIVATED', ?, ?)
  `, [contractId, adminUserId, JSON.stringify({ activatedAt: new Date(), startDate: start, endDate: end })]);

  return { success: true, contractId, status: 'active' };
};

/**
 * 9. Notifications helper for AMC events
 * Supports independent in-app and email delivery tracking with awaited confirmation.
```

#### Commercial Invoice Generation for AMC Contracts
AMC invoices are generated atomically inside both `verifyContractPayment` (online) and `verifyContractOfflinePayment` (offline).

**Excerpt from `verifyContractPayment` (Lines 1836–1854):**

```javascript
    INSERT INTO invoices (
      id, user_id, client_name, amount, subtotal, tax_amount, currency, invoice_date, due_date, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Paid', ?)
  `, [
    invoiceId, resolvedCompanyId, clientName,
    contract.total_amount, contract.price, contract.tax_amount || 0,
    contract.currency || 'INR', `AMC Contract Payment: ${contract.contract_number} (${contract.plan_name})`
  ]);

  await pool.query(`
    INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total, tax_amount)
    VALUES (?, ?, 1, ?, ?, ?)
  `, [invoiceId, `AMC Plan: ${contract.plan_name} (${contract.device_capacity} Devices)`, contract.price, contract.price, contract.tax_amount || 0]);

  // Update contract
  const shouldActivate = contract.approval_status === 'approved';
  const start = contract.start_date ? formatDateOnly(contract.start_date) : formatDateOnly(new Date());
  const end = contract.end_date ? formatDateOnly(contract.end_date) : formatDateOnly(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

```

**Excerpt from `verifyContractOfflinePayment` (Lines 2020–2038):**

```javascript
        INSERT INTO invoices (
          id, user_id, client_name, amount, subtotal, tax_amount, currency, invoice_date, due_date, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Paid', ?)
      `, [
        invoiceId, contract.company_id, clientName,
        contract.total_amount, contract.price, contract.tax_amount || 0,
        contract.currency || 'INR', `AMC Contract Payment (Offline): ${contract.contract_number} (${contract.plan_name})`
      ]);

      await connection.query(`
        INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total, tax_amount)
        VALUES (?, ?, 1, ?, ?, ?)
      `, [invoiceId, `AMC Plan: ${contract.plan_name} (${contract.device_capacity} Devices)`, contract.price, contract.price, contract.tax_amount || 0]);

      const shouldActivate = contract.approval_status === 'approved';
      const nextContractStatus = shouldActivate ? 'active' : (contract.status === 'offered' ? 'accepted' : contract.status);
      const start = contract.start_date ? formatDateOnly(contract.start_date) : formatDateOnly(new Date());
      const end = contract.end_date ? formatDateOnly(contract.end_date) : formatDateOnly(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

```

#### Contract Audit History Logging (`amc_contract_history`)
Audit history entries are recorded inline directly into `amc_contract_history`. There is no wrapper helper function. Example pattern used across all contract mutations:

```javascript
await pool.query(`
  INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
  VALUES (?, ?, ?, ?)
`, [contractId, actionName, userId || null, JSON.stringify(actionDetails)]);
```

### 3. Server Routes (`server/routes/amc.routes.js`) — Full File

**File:** `server/routes/amc.routes.js` (Lines 1–90)

```javascript
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { certVerifyLimiter } = require('../middleware/rateLimiter.middleware');
const {
  getAdminOverview,
  getPublicPlans,
  getAdminPlans,
  createPlan,
  updatePlan,
  togglePlanStatus,
  createRequest,
  getCompanyRequests,
  getAdminRequests,
  reviewRequest,
  createAdminContract,
  getAdminContracts,
  getAdminContractDetails,
  approveContract,
  getCompanyContracts,
  getCompanyContractDetails,
  acceptOffer,
  rejectOffer,
  updateContractStatus,
  getCapacity,
  assignDevices,
  requestReplacement,
  getCompanyReplacements,
  getAdminReplacements,
  reviewReplacement,
  checkEligibility,
  createPaymentOrder,
  verifyPayment,
  initiateOfflinePayment,
  verifyOfflinePayment,
  getContractCertificate,
  requestRenewal,
  createRenewalContract,
  getAdminReminders,
  retryAdminReminder,
  processMaintenanceExpiries,
  processMaintenanceReminders,
  publicVerifyCertificate
} = require('../controllers/amc.controller');

// ── Public Routes ───────────────────────────────────────────────────────
// Anyone can view active public plans
router.get('/plans', getPublicPlans);

// Public Certificate Verification (safe, sanitized metadata only, rate limited)
router.get('/public/verify-certificate/:code', certVerifyLimiter, publicVerifyCertificate);

// ── Shared Authenticated Routes ─────────────────────────────────────────
// Check repair eligibility (accessible by authenticated users: admin, company, technician)
router.get('/eligibility', authenticate, checkEligibility);

// Official AMC Contract Certificate / Compliance Data (admin or owning company)
router.get('/contracts/:id/certificate', authenticate, authorize('admin', 'company'), getContractCertificate);

// ── Company Routes ──────────────────────────────────────────────────────
router.get('/company/plans', authenticate, authorize('company'), getPublicPlans);
router.post('/company/requests', authenticate, authorize('company'), createRequest);
router.get('/company/requests', authenticate, authorize('company'), getCompanyRequests);
router.get('/company/contracts', authenticate, authorize('company'), getCompanyContracts);
router.get('/company/contracts/:id', authenticate, authorize('company'), getCompanyContractDetails);
router.post('/company/contracts/:id/accept', authenticate, authorize('company'), acceptOffer);
router.post('/company/contracts/:id/reject', authenticate, authorize('company'), rejectOffer);
router.get('/company/contracts/:id/capacity', authenticate, authorize('company', 'admin'), getCapacity);
router.post('/company/contracts/:id/devices', authenticate, authorize('company'), assignDevices);
router.post('/company/contracts/:id/create-payment-order', authenticate, authorize('company'), createPaymentOrder);
router.post('/company/contracts/:id/verify-payment', authenticate, authorize('company'), verifyPayment);
router.post('/company/contracts/:id/offline-payment', authenticate, authorize('company'), initiateOfflinePayment);
router.post('/company/contracts/:id/renew', authenticate, authorize('company'), requestRenewal);
router.post('/company/replacements', authenticate, authorize('company'), requestReplacement);
router.get('/company/replacements', authenticate, authorize('company'), getCompanyReplacements);

// ── Admin Routes ────────────────────────────────────────────────────────
router.get('/admin/overview', authenticate, authorize('admin'), getAdminOverview);
router.get('/admin/plans', authenticate, authorize('admin'), getAdminPlans);
router.post('/admin/plans', authenticate, authorize('admin'), createPlan);
router.put('/admin/plans/:id', authenticate, authorize('admin'), updatePlan);
router.patch('/admin/plans/:id/toggle-status', authenticate, authorize('admin'), togglePlanStatus);
router.get('/admin/requests', authenticate, authorize('admin'), getAdminRequests);
router.put('/admin/requests/:id/review', authenticate, authorize('admin'), reviewRequest);
router.post('/admin/contracts', authenticate, authorize('admin'), createAdminContract);
router.get('/admin/contracts', authenticate, authorize('admin'), getAdminContracts);
router.get('/admin/contracts/:id', authenticate, authorize('admin'), getAdminContractDetails);
router.put('/admin/contracts/:id/approve', authenticate, authorize('admin'), approveContract);
router.put('/admin/contracts/:id/status', authenticate, authorize('admin'), updateContractStatus);
router.post('/admin/contracts/:id/renew', authenticate, authorize('admin'), createRenewalContract);
router.post('/admin/contracts/:id/verify-offline-payment', authenticate, authorize('admin'), verifyOfflinePayment);
router.get('/admin/reminders', authenticate, authorize('admin'), getAdminReminders);
router.post('/admin/reminders/:id/retry', authenticate, authorize('admin'), retryAdminReminder);
router.post('/admin/maintenance/process-expiries', authenticate, authorize('admin'), processMaintenanceExpiries);
router.post('/admin/maintenance/process-reminders', authenticate, authorize('admin'), processMaintenanceReminders);
router.get('/admin/replacements', authenticate, authorize('admin'), getAdminReplacements);
router.put('/admin/replacements/:id/review', authenticate, authorize('admin'), reviewReplacement);

module.exports = router;


```

### 4. Controller Handlers (`server/controllers/amc.controller.js`)

#### Handler Behavior Summary (All 38 Handlers)

| Handler Name | Lines | 1-Line Behavior |
|---|---|---|
| `getAdminOverview` | Lines 20-30 | Returns aggregated AMC contract and request statistics for admin dashboard overview. |
| `getPublicPlans` | Lines 31-39 | Returns active AMC plans for public visitors and company portal. |
| `getAdminPlans` | Lines 40-48 | Returns all AMC plans (both active and inactive) for admin management. |
| `createPlan` | Lines 49-69 | Creates a new AMC plan with pricing and SLA coverage terms. |
| `updatePlan` | Lines 70-78 | Updates plan pricing, capacity, and coverage terms. |
| `togglePlanStatus` | Lines 79-89 | Toggles plan active status between enabled and disabled. |
| `createRequest` | Lines 90-107 | Company submits a new AMC quote inquiry or request. |
| `getCompanyRequests` | Lines 108-117 | Returns all quote requests submitted by the authenticated company. |
| `getAdminRequests` | Lines 118-127 | Returns all quote requests across all companies for admin review. |
| `reviewRequest` | Lines 128-147 | Admin reviews, approves, or rejects an AMC quote request. |
| `createAdminContract` | Lines 148-205 | Admin creates an official contract offer (with pricing, tax, discounts, deadlines) for a company. |
| `getAdminContracts` | Lines 206-215 | Returns all contracts across all companies with optional status filter. |
| `getAdminContractDetails` | Lines 216-227 | Returns full contract record, covered fleet devices, and audit history for admin. |
| `approveContract` | Lines 228-252 | Admin approves an AMC contract and sets effective coverage date range. |
| `getCompanyContracts` | Lines 253-263 | Returns all contracts belonging to the authenticated company. |
| `getCompanyContractDetails` | Lines 264-276 | Returns contract details, device allocations, and invoice reference for owning company. |
| `acceptOffer` | Lines 277-290 | Company accepts an offered AMC contract before validity expires. |
| `rejectOffer` | Lines 291-306 | Company declines an offered AMC contract with a reason note. |
| `updateContractStatus` | Lines 307-326 | Admin updates contract state (e.g. active, cancelled, suspended). |
| `createPaymentOrder` | Lines 327-341 | Company initiates online checkout, generating a Razorpay order. |
| `verifyPayment` | Lines 342-363 | Company submits Razorpay payment signature for verification and activation. |
| `initiateOfflinePayment` | Lines 364-382 | Company submits bank transfer / NEFT reference for manual admin verification. |
| `verifyOfflinePayment` | Lines 383-401 | Admin verifies or rejects an offline bank transfer for an AMC contract. |
| `getCapacity` | Lines 402-414 | Returns contract device capacity, used count, and remaining slots. |
| `assignDevices` | Lines 415-438 | Company assigns fleet hardware devices to an active/accepted contract. |
| `requestReplacement` | Lines 439-463 | Company requests a device replacement (hardware swap) under SLA. |
| `getCompanyReplacements` | Lines 464-485 | Returns replacement requests for the authenticated company. |
| `getAdminReplacements` | Lines 486-519 | Returns replacement requests across all companies for admin review. |
| `reviewReplacement` | Lines 520-541 | Admin approves or rejects a hardware replacement request. |
| `checkEligibility` | Lines 542-563 | API endpoint checking device AMC coverage status for repairs. |
| `getContractCertificate` | Lines 564-578 | Returns authoritative certificate data with cryptographic signature. |
| `requestRenewal` | Lines 579-594 | Company requests renewal for an active or expired contract. |
| `createRenewalContract` | Lines 595-607 | Admin creates a renewal offer linked to a previous contract. |
| `getAdminReminders` | Lines 608-621 | Returns AMC expiry reminders outbox audit log for admin review. |
| `retryAdminReminder` | Lines 622-638 | Admin manually triggers retry dispatch for a failed reminder. |
| `processMaintenanceExpiries` | Lines 639-654 | Admin trigger to run scheduled contract expiry sweeps. |
| `processMaintenanceReminders` | Lines 655-670 | Admin trigger to run scheduled reminder milestone sweeps. |
| `publicVerifyCertificate` | Lines 671-726 | Rate-limited public verification for certificate QR code scans. |

#### Full Code of the 3 Longest Handlers in `server/controllers/amc.controller.js`

##### 1. `createAdminContract` (Lines 148–205, 58 lines)

```javascript
const createAdminContract = async (req, res, next) => {
  try {
    const {
      companyId,
      requestId,
      planId,
      contractType,
      planName,
      deviceCapacity,
      price,
      discountAmount,
      taxAmount,
      totalAmount,
      termsAndConditions,
      offerValidUntil,
      startDate,
      endDate
    } = req.body;

    if (!companyId || !planName || !deviceCapacity || price === undefined || totalAmount === undefined) {
      return res.status(400).json(formatResponse(false, 'companyId, planName, deviceCapacity, price, and totalAmount are required.'));
    }

    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) {
        return res.status(400).json(formatResponse(false, 'Invalid date format for startDate or endDate.'));
      }
      if (e < s) {
        return res.status(400).json(formatResponse(false, 'Contract end date cannot be earlier than contract start date.'));
      }
    }

    const result = await amcService.createAmcContract({
      companyId,
      requestId,
      planId,
      contractType: contractType || 'standard',
      planName,
      deviceCapacity: parseInt(deviceCapacity, 10),
      price: parseFloat(price),
      discountAmount: discountAmount ? parseFloat(discountAmount) : 0,
      taxAmount: taxAmount ? parseFloat(taxAmount) : 0,
      totalAmount: parseFloat(totalAmount),
      termsAndConditions,
      offerValidUntil,
      startDate,
      endDate,
      createdBy: req.user.id
    });

    return res.status(201).json(formatResponse(true, 'AMC contract created successfully.', result));
  } catch (error) {
    next(error);
  }
};

```

##### 2. `publicVerifyCertificate` (Lines 671–726, 56 lines)

```javascript
const publicVerifyCertificate = async (req, res, next) => {
  try {
    const code = req.params.code;
    const contractNumber = req.query.contractNumber || null;
    const result = await amcService.getPublicCertificateVerification(code, contractNumber);
    if (!result.valid) {
      return res.status(404).json(formatResponse(false, 'Certificate verification failed or invalid code.', result));
    }
    return res.json(formatResponse(true, 'Certificate verified successfully.', result));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdminOverview,
  getPublicPlans,
  getAdminPlans,
  createPlan,
  updatePlan,
  togglePlanStatus,
  createRequest,
  getCompanyRequests,
  getAdminRequests,
  reviewRequest,
  createAdminContract,
  getAdminContracts,
  getAdminContractDetails,
  approveContract,
  getCompanyContracts,
  getCompanyContractDetails,
  acceptOffer,
  rejectOffer,
  updateContractStatus,
  getCapacity,
  assignDevices,
  requestReplacement,
  getCompanyReplacements,
  getAdminReplacements,
  reviewReplacement,
  checkEligibility,
  createPaymentOrder,
  verifyPayment,
  initiateOfflinePayment,
  verifyOfflinePayment,
  getContractCertificate,
  requestRenewal,
  createRenewalContract,
  getAdminReminders,
  retryAdminReminder,
  processMaintenanceExpiries,
  processMaintenanceReminders,
  publicVerifyCertificate
};


```

##### 3. `getAdminReplacements` (Lines 486–519, 34 lines)

```javascript
const getAdminReplacements = async (req, res, next) => {
  try {
    const { status, contractId } = req.query;
    let sql = `
      SELECT r.*, 
        c.contract_number, u.name AS company_name, cp.company_id AS canonical_company_id,
        old_dev.brand AS old_brand, old_dev.model_number AS old_model, old_dev.serial_number AS old_serial,
        new_dev.brand AS new_brand, new_dev.model_number AS new_model, new_dev.serial_number AS new_serial
      FROM amc_device_replacements r
      JOIN amc_contracts c ON r.contract_id = c.id
      JOIN users u ON r.company_id = u.id
      LEFT JOIN company_profiles cp ON u.id = cp.user_id
      JOIN company_devices old_dev ON r.old_device_id = old_dev.id
      JOIN company_devices new_dev ON r.new_device_id = new_dev.id
      WHERE 1=1
    `;
    const params = [];
    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }
    if (contractId) {
      sql += ' AND r.contract_id = ?';
      params.push(contractId);
    }
    sql += ' ORDER BY r.created_at DESC';

    const [rows] = await pool.query(sql, params);
    return res.json(formatResponse(true, 'All replacement requests retrieved successfully.', rows));
  } catch (error) {
    next(error);
  }
};

```

### 5. How the System Detects and Expires Contracts After `end_date`

The system detects and expires contracts via **`amcService.processContractExpiries(connectionOrPool)`**.

#### Detection Query & Cascade Logic
**File:** `server/services/amc.service.js` (Lines 2125–2179)

```javascript
    let expiredOffersCount = 0;

    const todayStr = getBusinessTodayStr();

    // 1. Sweep active contracts that have reached or passed their end_date in AMC business timezone
    const [expiredContracts] = await connection.query(`
      SELECT id, contract_number, company_id, end_date, plan_name
      FROM amc_contracts
      WHERE status = 'active'
        AND end_date < ?
    `, [todayStr]);

    for (const contract of expiredContracts) {
      await connection.beginTransaction();
      try {
        const [updateResult] = await connection.query(`
          UPDATE amc_contracts
          SET status = 'expired'
          WHERE id = ? AND status = 'active'
        `, [contract.id]);

        if (updateResult.affectedRows > 0) {
          // Transition covered devices to 'expired'
          await connection.query(`
            UPDATE amc_covered_devices
            SET status = 'expired'
            WHERE contract_id = ? AND status = 'active'
          `, [contract.id]);

          // Legacy device table synchronization
          await connection.query(`
            UPDATE company_devices cd
            SET cd.is_amc = 0
            WHERE cd.id IN (
              SELECT device_id FROM amc_covered_devices WHERE contract_id = ?
            ) AND NOT EXISTS (
              SELECT 1 FROM amc_covered_devices acd
              JOIN amc_contracts ac ON acd.contract_id = ac.id
              WHERE acd.device_id = cd.id AND acd.status = 'active' AND ac.status = 'active'
            )
          `, [contract.id]);

          // Audit trail
          await connection.query(`
            INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
            VALUES (?, 'CONTRACT_EXPIRED', NULL, ?)
          `, [contract.id, JSON.stringify({
            expiredAt: new Date().toISOString(),
            endDate: formatDateOnly(contract.end_date)
          })]);

          await connection.commit();
          expiredContractsCount++;

          // Dispatch notifications after commit
          await sendAmcNotification({
```

#### Execution Mechanism
1. **Background Scheduler:** `startAmcScheduler` in `server/schedulers/amc.scheduler.js` runs `runAmcMaintenanceSweep` every 60 minutes and 5 seconds after startup.
2. **Advisory Locking:** Protected by MySQL advisory lock `GET_LOCK("tekdoctor_amc_scheduler_lock", 0)` to prevent multi-worker collisions.
3. **Manual Admin Trigger:** `POST /api/amc/admin/maintenance/process-expiries` allows admin to trigger on demand.
4. **Real-Time Guard:** `evaluateContractCompliance` in `amc.service.js` also evaluates `end_date < CURRENT_DATE()` at runtime on every certificate lookup, returning non-compliant even if the cron has not yet transitioned the stored column.


---

=== PART 5: Billing webhook & payments ===

### 1. Razorpay Webhook Handler (Full Code)

#### Route Definition
**File:** `server/routes/billing.routes.js` (Lines 64–65)

```javascript
// Route: POST /api/billing/webhook (Razorpay Webhook listener)
router.post('/webhook', express.raw({ type: 'application/json' }), handleRazorpayWebhook);
```

#### Controller Function (`handleRazorpayWebhook`)
**File:** `server/controllers/billing.controller.js` (Lines 2536–2646)

```javascript
const handleRazorpayWebhook = async (req, res, next) => {
  const webhookSecret = config.razorpay?.webhookSecret;
  const signature = req.headers['x-razorpay-signature'];

  // Fail closed: reject unauthenticated or unsigned webhooks
  if (!webhookSecret) {
    logger.warn('Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not configured. Rejecting.');
    return res.status(400).json({ status: 'invalid_signature' });
  }
  if (!signature) {
    logger.warn('Razorpay webhook received without a signature header. Rejecting.');
    return res.status(400).json({ status: 'invalid_signature' });
  }

  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body));

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (!timingSafeMatch(expectedSignature, signature)) {
      logger.warn('Razorpay webhook signature mismatch.');
      return res.status(400).json({ status: 'invalid_signature' });
    }
  } catch (sigErr) {
    logger.error('Razorpay webhook signature verification error: ' + sigErr.message);
    return res.status(400).json({ status: 'invalid_signature' });
  }

  try {
    // The webhook route is served via express.raw(), so req.body is a Buffer.
    // Re-parse it back to JSON before reading the event payload.
    const parsedBody = Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString('utf8'))
      : req.body;
    const event = parsedBody.event;
    const payload = parsedBody.payload;

    if (event === 'payment.captured' || event === 'order.paid') {
      const payment = payload?.payment?.entity;
      const orderId = payment?.order_id;
      const paymentId = payment?.id;
      const paymentMethod = payment?.method || 'card';
      const webhookAmount = payment?.amount;
      const currency = payment?.currency || 'INR';

      if (orderId && paymentId) {
        // Enforce captured or paid state at the gateway
        const isCaptured = payment?.status === 'captured' || event === 'order.paid';
        if (!isCaptured) {
          logger.warn(`Webhook received payment ${paymentId} in non-captured status: ${payment?.status}`);
          return res.status(200).json({ status: 'ignored_unsettled_state' });
        }

        const result = await processAuthoritativePaymentSettlement({
          orderId,
          paymentId,
          paymentMethod,
          webhookAmount,
          currency,
          gatewayResponse: payment,
          ip: req.ip
        });

        return res.status(result.statusCode).json({
          status: result.success ? 'ok' : 'error',
          message: result.message
        });
      }
    }

    if (event === 'payment.failed') {
      const payment = payload?.payment?.entity;
      const orderId = payment?.order_id;
      const paymentId = payment?.id;
      const errorDesc = payment?.error_description || payment?.error_reason || 'Payment failed at gateway.';
      if (orderId) {
        let conn;
        try {
          conn = await pool.getConnection();
          await conn.query(
            "UPDATE payments SET status = 'failed', payment_id = ?, error_message = ? WHERE order_id = ? AND status != 'paid'",
            [paymentId || null, errorDesc, orderId]
          );
          const [pmts] = await conn.query("SELECT user_id, ticket_id FROM payments WHERE order_id = ? LIMIT 1", [orderId]);
          if (pmts.length > 0 && pmts[0].user_id) {
            await conn.query(
              `INSERT INTO notifications (user_id, ticket_id, title, message, sender_id)
               VALUES (?, ?, 'Payment Failed', 'Sir, your payment could not be completed and has failed. Please try again.', NULL)`,
              [pmts[0].user_id, pmts[0].ticket_id || null]
            );
          }
        } catch (we) {
          logger.error('Webhook payment.failed error: ' + we.message);
        } finally {
          if (conn) conn.release();
        }
      }
      return res.status(200).json({ status: 'ok' });
    }

    return res.status(200).json({ status: 'ok' });
  } catch (e) {
    logger.error('Webhook processing error: ' + e.message);
    return res.status(500).json({ status: 'error', message: e.message });
  }
};
```

### 2. Does the Webhook Handle AMC Contract Payments?

**Factual Finding: NO. The webhook does NOT handle AMC contract payments at all.**

#### Exact Code Behavior Trace:
1. When Razorpay delivers `payment.captured` or `order.paid`, `handleRazorpayWebhook` delegates to `processAuthoritativePaymentSettlement` (`server/controllers/billing.controller.js`, lines 1811–2250).
2. `processAuthoritativePaymentSettlement` queries `SELECT * FROM payments WHERE order_id = ? FOR UPDATE`.
3. When an AMC payment order was created via `createContractPaymentOrder` in `amc.service.js`, the row in `payments` was inserted with `ticket_id = NULL` and `invoice_id = NULL`.
4. In `processAuthoritativePaymentSettlement`:
   - **Step 2:** `if (resolvedTicketId)` evaluates to `false` (skipped).
   - **Step 3:** `if (resolvedInvoiceId)` evaluates to `false` and `else if (resolvedTicketId)` evaluates to `false` (skipped).
   - **Step 4:** It executes `UPDATE payments SET status = "paid", payment_id = ? WHERE order_id = ?`.
   - **`amc_contracts` is NEVER queried or updated.** `processAuthoritativePaymentSettlement` has zero references to `amc_contracts` or `amc_covered_devices`.
   - Consequently: `amc_contracts.payment_status` remains `"unpaid"`, `amc_contracts.status` remains `"offered"`, no AMC tax invoice is generated in `invoices`, and covered devices remain unactivated.
5. **What does it do with unknown order IDs?**
   If `orderId` is not found in `payments` at all (`paymentRecord === null`):
   - `resolvedTicketId` and `resolvedInvoiceId` remain `null`.
   - `finalAmount` defaults to `0`.
   - Lines 2110–2126 execute:
     ```sql
     INSERT INTO payments (payment_id, order_id, ticket_id, invoice_id, user_id, company_id, amount, currency, payment_method, status, gateway, gateway_response)
     VALUES (?, ?, NULL, NULL, NULL, NULL, 0, 'INR', ?, 'paid', 'razorpay', ?)
     ```
   - It commits the transaction and returns HTTP 200 `{ status: "ok" }`. It does not reject the webhook or fail.

### 3. How `payments` Rows are Linked to AMC Contracts & Idempotency Protection

#### Linking Columns (No Foreign Key on `payments`)
- The `payments` table schema does **NOT** possess an `amc_contract_id` or `contract_id` column.
- When `createContractPaymentOrder` creates an AMC order, it links via:
  - `payments.order_id`: The Razorpay order ID (e.g. `order_amc_...` or gateway ID `order_...`).
  - `payments.company_id`: Set to the company's user ID (`contract.company_id`).
  - `payments.reference_note`: Formatted string `AMC Contract: ${contract.contract_number}`.
  - Razorpay order metadata `notes`: `{ contract_id: String(contract.id), contract_number: contract.contract_number, company_id: String(resolvedCompanyId) }`.
- On the contract side, `amc_contracts.invoice_id` links to the generated invoice once verified.

#### Idempotency Protection in Code

**1. Online AMC Payment Idempotency (`verifyContractPayment` in `server/services/amc.service.js`, lines 1793–1804):**

```javascript
  // Idempotency: avoid duplicate invoices on verification replays
  if (contract.payment_status === 'paid') {
    return {
      success: true,
      contractId,
      invoiceId: contract.invoice_id,
      paymentStatus: 'paid',
      status: contract.status
    };
  }

  const keySecret = config.razorpay?.keySecret;
```

**2. Offline AMC Payment Idempotency (`verifyContractOfflinePayment` in `server/services/amc.service.js`, lines 1965–1976):**

```javascript
    if (decision === 'verified' && contract.payment_status === 'paid') {
      // Idempotency: avoid duplicate invoices on offline verification replays
      await connection.commit();
      return {
        success: true,
        contractId,
        invoiceId: contract.invoice_id,
        paymentStatus: 'paid',
        status: contract.status
      };
    }

```

**3. Billing Webhook Idempotency (`processAuthoritativePaymentSettlement` in `server/controllers/billing.controller.js`, lines 1856–1889):**

```javascript
        const expectedPaise = Math.round(parseFloat(paymentRecord.amount) * 100);
        if (Number(webhookAmount) !== expectedPaise) {
          await connection.rollback();
          logger.warn(`Payment amount mismatch for order ${orderId}: received ${webhookAmount} paise, expected ${expectedPaise} paise`);
          return { success: false, statusCode: 400, message: 'Payment verification failed: Amount mismatch between gateway order and capture.' };
        }
      }

      // Concurrency / Idempotency check: already marked paid
      if (paymentRecord.status === 'paid') {
        await connection.commit();
        let existingGuestToken = null;
        if (resolvedTicketId || resolvedInvoiceId) {
          existingGuestToken = generateGuestInvoiceAccessToken({
            ticketId: resolvedTicketId,
            ticketNumber: ticketNumber || null,
            invoiceId: resolvedInvoiceId,
            userId: paymentRecord.user_id,
            email: null
          });
        }
        return {
          success: true,
          statusCode: 200,
          alreadySettled: true,
          message: 'Payment already verified and settled for this order.',
          data: {
            paymentId: paymentRecord.payment_id || paymentId,
            orderId,
            amount: parseFloat(paymentRecord.amount),
            status: 'paid',
            ticketId: resolvedTicketId,
            invoiceId: resolvedInvoiceId,
            paymentMethod: paymentRecord.payment_method || paymentMethod,
```


---

=== PART 6: Schedulers, settings, notifications, email ===

### 1. Hold Expiration Scheduler (Full Code)

**File:** `server/utils/hold.scheduler.js` (Lines 1–177)

```javascript
const logger = require('./logger');
const { logActivity } = require('./activity.logger');
const { sendAdminNotification, sendCustomerNotification } = require('./email.utils');

/**
 * Process all tickets whose hold period has expired without customer approval.
 * Transitions them to 'cancelled' with status 'auto_cancelled' and dispatches notifications.
 */
const processHoldExpirations = async (pool) => {
  let connection;
  try {
    connection = await pool.getConnection();

    // Find all expired on-hold requests
    const [expiredTickets] = await connection.query(`
      SELECT id, ticket_number, customer_name, email, mobile, user_id, 
             assigned_technician_id, brand, model_number, 
             hold_start_date, hold_end_date, hold_reason, estimated_cost
      FROM service_requests
      WHERE customer_approval_status IN ('on_hold', 'rejected')
        AND hold_end_date IS NOT NULL
        AND hold_end_date <= NOW()
        AND is_active = 1
        AND status != 'cancelled'
    `);

    if (expiredTickets.length === 0) {
      return 0;
    }

    logger.info(`Found ${expiredTickets.length} expired on-hold tickets to auto-cancel.`);

    for (const ticket of expiredTickets) {
      const cancellationReason = 'Cancelled — Customer Approval Not Received (Hold period expired)';
      
      // Update ticket status with strict state guards
      const [updateRes] = await connection.query(`
        UPDATE service_requests
        SET status = 'cancelled',
            customer_approval_status = 'auto_cancelled',
            cancellation_reason = ?,
            cancelled_at = NOW(),
            cancelled_by = NULL
        WHERE id = ?
          AND customer_approval_status IN ('on_hold', 'rejected')
          AND status NOT IN ('completed', 'delivered', 'cancelled')
          AND payment_status != 'paid'
      `, [cancellationReason, ticket.id]);

      // If the ticket was settled, completed, or updated concurrently, skip notifications
      if (updateRes.affectedRows === 0) {
        logger.warn(`Skipped auto-cancellation for ticket ${ticket.id}: state changed concurrently.`);
        continue;
      }

      const ticketNum = ticket.ticket_number || `#${ticket.id}`;
      const deviceStr = `${ticket.brand} ${ticket.model_number || ''}`.trim();

      // 1. In-App Notification to Customer
      if (ticket.user_id) {
        try {
          await connection.query(`
            INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
            VALUES (?, ?, ?, ?, NULL)
          `, [
            ticket.user_id,
            `Repair Request Cancelled [${ticketNum}]`,
            `Your repair request for ${deviceStr} was automatically cancelled because the estimate was not approved within the hold deadline.`,
            ticket.id
          ]);
        } catch (notifErr) {
          logger.warn(`Failed to create customer auto-cancel notification for ticket ${ticket.id}: ${notifErr.message}`);
        }
      }

      // 2. Email Notification to Customer
      if (ticket.email) {
        try {
          const emailSubject = `TekDoctor - Repair Ticket Cancelled [${ticketNum}]`;
          const emailHtml = `
            <div style="font-family: sans-serif; max-width: 600px; color: #333;">
              <h3 style="color: #ef4444;">Repair Request Cancelled</h3>
              <p>Dear ${ticket.customer_name},</p>
              <p>Your repair service ticket <strong>${ticketNum}</strong> for <strong>${deviceStr}</strong> has been automatically cancelled because estimate approval was not received within the hold deadline.</p>
              <p>If you still wish to repair this device in the future, please submit a new service request or contact our support team.</p>
              <p>Best regards,<br/>The TekDoctor Team</p>
            </div>
          `;
          sendCustomerNotification(ticket.email, emailSubject, emailHtml).catch(e => logger.warn(`Auto-cancel customer email error: ${e.message}`));
        } catch (emailErr) { }
      }

      // 3. In-App Notification to Assigned Technician
      if (ticket.assigned_technician_id) {
        try {
          await connection.query(`
            INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
            VALUES (?, ?, ?, ?, NULL)
          `, [
            ticket.assigned_technician_id,
            `Ticket Auto-Cancelled [${ticketNum}]`,
            `Ticket ${ticketNum} (${ticket.customer_name}) has been automatically cancelled after the customer estimate approval hold period expired.`,
            ticket.id
          ]);
        } catch (notifErr) {
          logger.warn(`Failed to create technician auto-cancel notification for ticket ${ticket.id}: ${notifErr.message}`);
        }
      }

      // 4. In-App Notification to All Admins
      try {
        const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin'");
        for (const admin of admins) {
          await connection.query(`
            INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
            VALUES (?, ?, ?, ?, NULL)
          `, [
            admin.id,
            `Ticket Auto-Cancelled [${ticketNum}]`,
            `Ticket ${ticketNum} (${ticket.customer_name} - ${deviceStr}) was automatically cancelled. Hold deadline expired without customer approval.`,
            ticket.id
          ]);
        }
      } catch (notifErr) {
        logger.warn(`Failed to notify admins of auto-cancellation for ticket ${ticket.id}: ${notifErr.message}`);
      }

      // 5. Activity Log
      try {
        await logActivity(
          null,
          'repair',
          'auto_cancel_hold_expired',
          'service_requests',
          ticket.id,
          {
            ticketNumber: ticketNum,
            customerName: ticket.customer_name,
            holdEndDate: ticket.hold_end_date,
            cancellationReason
          },
          'system'
        );
      } catch (actErr) { }

      logger.info(`Ticket ${ticketNum} (ID: ${ticket.id}) auto-cancelled due to hold expiration.`);
    }

    return expiredTickets.length;

  } catch (error) {
    logger.error(`Error processing hold expirations: ${error.message}`);
    return 0;
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Start the recurring hold scheduler
 */
const startHoldScheduler = (pool, intervalMs = 60000) => {
  // Run once on startup
  processHoldExpirations(pool).catch(err => {
    logger.error(`Startup hold check error: ${err.message}`);
  });

  // Schedule recurring checks
  const intervalId = setInterval(() => {
    processHoldExpirations(pool).catch(err => {
      logger.error(`Periodic hold check error: ${err.message}`);
    });
  }, intervalMs);

  return intervalId;
};

module.exports = {
  processHoldExpirations,
  startHoldScheduler
};

```

#### How and Where It Is Started in `server/server.js`

**Startup Excerpt:** `server/server.js` (Lines 513–516)

```javascript
    // Start background hold expiration scheduler
    const { startHoldScheduler } = require('./utils/hold.scheduler');
    const holdIntervalId = startHoldScheduler(pool);

```

**Shutdown Cleanup Excerpt:** `server/server.js` (Lines 546–548)

```javascript
      logger.info(`${signal} received. Initiating graceful shutdown...`);
      if (holdIntervalId) clearInterval(holdIntervalId);
      if (retentionIntervalId) clearInterval(retentionIntervalId);
      stopAmcScheduler();
```

### 2. Every Scheduler / Cron / setInterval in the Server & Passenger Note

| Scheduler File | Exported Initializer | Default Interval | Purpose & Action |
|---|---|---|---|
| `server/utils/hold.scheduler.js` | `startHoldScheduler(pool, intervalMs)` | `60,000 ms` (1 min) | Evaluates service requests where hold period expired without customer approval; auto-cancels tickets and sends multi-party notifications. |
| `server/utils/retention.scheduler.js` | `startRetentionScheduler(pool, intervalMs)` | `86,400,000 ms` (24 hr) | Prunes notifications older than 3 months and contact messages older than 6 months. |
| `server/schedulers/amc.scheduler.js` | `startAmcScheduler(pool, intervalMs)` | `3,600,000 ms` (1 hr) + 5s startup sweep | Runs `runAmcMaintenanceSweep` under MySQL advisory lock: expires elapsed contracts, cascades to devices, dispatches milestone reminders (30,15,7,1d). |

#### Deployment Note About cPanel / Phusion Passenger
> **IMPORTANT PRODUCTION CHARACTERISTIC:**
> Under Phusion Passenger (the primary cPanel production deployment target), when there are no active incoming HTTP requests for a duration (Passenger pool idle timeout, typically 300 seconds), Passenger **spins down / idles the Node.js application process** to conserve shared hosting memory.
> When the Node.js process is idled or stopped by Passenger, all active `setInterval()` timers are suspended. Schedulers will **NOT** fire until a new incoming HTTP request wakes the application process.
> **Mitigation implemented in codebase:** Administrative maintenance endpoints (`POST /api/amc/admin/maintenance/process-expiries` and `POST /api/amc/admin/maintenance/process-reminders`) exist so that an external system cron (e.g. cPanel standard Cron Jobs manager running `curl -X POST ...`) can invoke sweeps reliably regardless of web traffic.

### 3. How Site Settings Are Read and Written on Backend

#### Reading Settings (`getSettings` in `server/controllers/admin.controller.js`)
**File:** `server/controllers/admin.controller.js` (Lines 835–915)

```javascript
const getSettings = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const group = req.query.group;
        let query = 'SELECT * FROM site_settings';
        const params = [];
        if (group) {
            query += ' WHERE setting_group = ?';
            params.push(group);
        }
        query += ' ORDER BY setting_group, setting_key';
        const [rows] = await connection.query(query, params);

        // Transform to a grouped object, masking any secret fields
        const settings = {};
        rows.forEach(r => {
            if (!settings[r.setting_group]) settings[r.setting_group] = {};
            if (isSecretKey(r.setting_key)) {
                // Return masked indicator if secret exists and is non-empty, otherwise empty string
                settings[r.setting_group][r.setting_key] = (r.setting_value && String(r.setting_value).trim())
                    ? MASKED_SECRET_INDICATOR
                    : '';
            } else {
                settings[r.setting_group][r.setting_key] = r.setting_value;
            }
        });

        return res.json(formatResponse(true, 'Settings fetched.', settings));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const SETTING_KEY_GROUPS = {
    company_name: 'company',
    company_phone: 'company',
    company_alternate_phone: 'company',
    company_email: 'company',
    company_address: 'company',
    logo_url: 'company',
    gstin: 'company',
    theme_primary_color: 'theme',
    theme_secondary_color: 'theme',
    favicon_url: 'branding',
    tekunik_image_url: 'branding',
    facebook_url: 'social',
    twitter_url: 'social',
    instagram_url: 'social',
    linkedin_url: 'social',
    google_maps_link: 'integrations',
    google_sheet_url: 'integrations',
    google_login_enabled: 'integrations',
    google_client_id: 'integrations',
    google_client_secret: 'integrations',
    recaptcha_enabled: 'security',
    recaptcha_site_key: 'security',
    recaptcha_secret_key: 'security',
    recaptcha_api_key: 'security',
    recaptcha_project_id: 'security',
    recaptcha_score_threshold: 'security',
    maintenance_mode: 'system',
    meta_title: 'seo',
    meta_description: 'seo',
    meta_keywords: 'seo',
    smtp_host: 'email',
    smtp_port: 'email',
    smtp_user: 'email',
    smtp_password: 'email',
    from_email: 'email',
    from_name: 'email',
    template_repair_ready: 'email',
    template_new_ticket: 'email',
    template_status_update: 'email',
    invoice_prefix: 'billing',
    default_gst_rate: 'billing',
    invoice_gst_enabled: 'billing',
    invoice_default_items: 'billing'
};
```

#### Writing Settings (`updateSettings` in `server/controllers/admin.controller.js`)
**File:** `server/controllers/admin.controller.js` (Lines 917–1070)

```javascript
const updateSettings = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { settings, group } = req.body; // { key: value, ... }

        if (!settings || typeof settings !== 'object') {
            return res.status(400).json(formatResponse(false, 'Settings object is required.'));
        }

        // Auto-trim strings and validate alternate contact number
        if (settings.company_alternate_phone !== undefined) {
            let altPhone = typeof settings.company_alternate_phone === 'string' ? settings.company_alternate_phone.trim() : '';
            if (altPhone) {
                const cleanDigits = altPhone.replace(/[\s\-()]/g, '').replace(/^(\+91|91|0)/, '');
                if (!/^[6-9]\d{9}$/.test(cleanDigits) && !/^\d{10}$/.test(cleanDigits)) {
                    return res.status(400).json(formatResponse(false, 'Alternate contact number must be a valid 10-digit phone number.'));
                }
            }
            settings.company_alternate_phone = altPhone;
        }

        // Validate invoice configuration
        if (settings.invoice_prefix !== undefined) {
            const prefixStr = String(settings.invoice_prefix).trim();
            if (prefixStr && (!/^[a-zA-Z0-9\-_]{1,15}$/.test(prefixStr))) {
                return res.status(400).json(formatResponse(false, 'Invoice prefix must be 1-15 characters containing only alphanumeric characters, hyphens, or underscores.'));
            }
            settings.invoice_prefix = prefixStr || 'inv';
        }

        if (settings.default_gst_rate !== undefined) {
            const rateNum = parseFloat(settings.default_gst_rate);
            if (isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
                return res.status(400).json(formatResponse(false, 'Default GST rate must be a valid percentage between 0 and 100.'));
            }
            settings.default_gst_rate = String(rateNum);
        }

        if (settings.invoice_default_items !== undefined) {
            if (typeof settings.invoice_default_items === 'object') {
                settings.invoice_default_items = JSON.stringify(settings.invoice_default_items);
            } else if (typeof settings.invoice_default_items === 'string') {
                try {
                    JSON.parse(settings.invoice_default_items);
                } catch (_) {
                    return res.status(400).json(formatResponse(false, 'Invoice default items must be valid JSON array.'));
                }
            }
        }

        // Validate reCAPTCHA score threshold (0.0 to 1.0)
        if (settings.recaptcha_score_threshold !== undefined) {
            const thresholdNum = parseFloat(settings.recaptcha_score_threshold);
            if (isNaN(thresholdNum) || thresholdNum < 0 || thresholdNum > 1) {
                return res.status(400).json(formatResponse(false, 'reCAPTCHA score threshold must be a valid number between 0.0 and 1.0.'));
            }
            settings.recaptcha_score_threshold = String(thresholdNum);
        }

        // Validate enabling Google Login
        if (settings.google_login_enabled === 'true' || settings.google_login_enabled === true) {
            let clientId = settings.google_client_id;
            if (!clientId || typeof clientId !== 'string' || !clientId.trim()) {
                const [dbClientId] = await connection.query(
                    "SELECT setting_value FROM site_settings WHERE setting_key = 'google_client_id' LIMIT 1"
                );
                clientId = (dbClientId[0]?.setting_value) || process.env.GOOGLE_CLIENT_ID || '';
            }
            if (!clientId || !String(clientId).trim()) {
                return res.status(400).json(formatResponse(false, 'Cannot enable Google Sign-In: Google Client ID must be configured.'));
            }
        }

        // Validate enabling reCAPTCHA
        if (settings.recaptcha_enabled === 'true' || settings.recaptcha_enabled === true) {
            let siteKey = settings.recaptcha_site_key;
            if (!siteKey || typeof siteKey !== 'string' || !siteKey.trim()) {
                const [dbSiteKey] = await connection.query(
                    "SELECT setting_value FROM site_settings WHERE setting_key = 'recaptcha_site_key' LIMIT 1"
                );
                siteKey = (dbSiteKey[0]?.setting_value) || process.env.RECAPTCHA_SITE_KEY || '';
            }
            if (!siteKey || !String(siteKey).trim()) {
                return res.status(400).json(formatResponse(false, 'Cannot enable reCAPTCHA: Site Key must be configured.'));
            }
        }

        for (const [key, value] of Object.entries(settings)) {
            const keyGroup = group || SETTING_KEY_GROUPS[key] || 'general';
            const isSecret = isSecretKey(key);

            if (isSecret) {
                // [CFG-ADM-01] Explicit secret clearing support (e.g. '__CLEAR__' or { clear: true })
                const isExplicitClear = value === '__CLEAR__' || (typeof value === 'object' && value !== null && value.clear === true);
                if (isExplicitClear) {
                    await connection.query(
                        'INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?, setting_group = ?',
                        [key, '', keyGroup, '', keyGroup]
                    );
                    continue;
                }

                // If omitted, blank, or unchanged masked placeholder, preserve existing stored secret without overwriting
                if (value === undefined || value === null || isMaskedPlaceholder(value)) {
                    continue;
                }
                const cleanVal = typeof value === 'string' ? value.trim() : String(value);
                if (!cleanVal) {
                    continue;
                }
                // Explicit new secret supplied: encrypt with AES-256-GCM before writing to database
                const encryptedVal = encryptSecret(cleanVal);
                await connection.query(
                    'INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?, setting_group = ?',
                    [key, encryptedVal, keyGroup, encryptedVal, keyGroup]
                );
            } else {
                const cleanVal = typeof value === 'string' ? value.trim() : value;
                await connection.query(
                    'INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?, setting_group = ?',
                    [key, cleanVal, keyGroup, cleanVal, keyGroup]
                );
            }
        }

        // Specific security activity logging for Google Login and reCAPTCHA toggle changes
        if (settings.google_login_enabled !== undefined) {
            const googleStatus = (settings.google_login_enabled === 'true' || settings.google_login_enabled === true) ? 'enabled' : 'disabled';
            await logActivity(
                connection,
                req.user.id,
                `google_login_${googleStatus}`,
                'security_setting',
                null,
                { setting: 'google_login_enabled', status: googleStatus },
                req.ip
            );
        }

        if (settings.recaptcha_enabled !== undefined) {
            const recaptchaStatus = (settings.recaptcha_enabled === 'true' || settings.recaptcha_enabled === true) ? 'enabled' : 'disabled';
            await logActivity(
                connection,
                req.user.id,
                `recaptcha_${recaptchaStatus}`,
                'security_setting',
                null,
                { setting: 'recaptcha_enabled', status: recaptchaStatus },
                req.ip
            );
        }

        // Invalidate cached runtime configurations
```

#### Is There Caching?
**Factual Finding: NO.** There is no Redis, Memcached, or in-memory LRU cache for `site_settings`. Every controller, middleware, and scheduler queries `site_settings` directly from MySQL via SQL (`SELECT setting_key, setting_value FROM site_settings WHERE ...`). Updates execute direct `INSERT ... ON DUPLICATE KEY UPDATE` queries against the database table.

### 4. Notification and Email Helper Functions (Signatures + Full Code)

#### Helper 1: `sendCustomerNotification`
**File:** `server/utils/email.utils.js` (Lines 259–301)

```javascript
const sendCustomerNotification = async (toEmail, subject, htmlContent) => {
    try {
        if (!toEmail) {
            logger.warn('sendCustomerNotification called without toEmail');
            return false;
        }

        const { transporter, fromHeader, isConfigured, source } = await getEmailConfig();

        if (!isConfigured || !transporter) {
            if (config.env === 'development' || config.env === 'test') {
                logger.info(`[DEV EMAIL SIMULATION] Email to ${toEmail} not sent (no SMTP configured). Subject: "${subject}".`);
                return true;
            }
            logger.error(`[EMAIL DELIVERY FAILURE] Email credentials not configured in DB or .env. Cannot deliver email to ${toEmail}.`);
            return false;
        }

        const mailOptions = {
            from: fromHeader,
            to: toEmail,
            subject: subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        logger.info(`Customer notification sent to ${toEmail} via [${source}]: ${info.messageId}`);
        return true;
    } catch (error) {
        clearEmailConfigCache();
        logger.error(`Error sending customer email to ${toEmail}: ${sanitizeErrorMessage(error.message)}`);
        return false;
    }
};

/**
 * Send an OTP code verification email using the branded TekDoctor template.
 * @param {Object} options
 * @param {string} options.toEmail - Recipient email address
 * @param {string} options.otpCode - 6-digit numeric OTP
 * @param {'login'|'password_reset'} [options.purpose='login']
 * @param {number} [options.expiresInMinutes=5]
 * @returns {Promise<boolean>}
```

#### Helper 2: `sendAdminNotification`
**File:** `server/utils/email.utils.js` (Lines 222–257)

```javascript
const sendAdminNotification = async (subject, htmlContent) => {
    try {
        const { transporter, fromHeader, adminEmail, isConfigured, source } = await getEmailConfig();

        if (!isConfigured || !transporter || !adminEmail) {
            if (config.env === 'development' || config.env === 'test') {
                logger.info(`[DEV EMAIL SIMULATION] Admin email not sent (no SMTP configured). Subject: "${subject}"`);
                return true;
            }
            logger.warn('Email credentials not configured in DB or .env. Skipping admin email notification.');
            return false;
        }

        const mailOptions = {
            from: fromHeader,
            to: adminEmail,
            subject: subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        logger.info(`Admin email notification sent via [${source}]: ${info.messageId}`);
        return true;
    } catch (error) {
        clearEmailConfigCache();
        logger.error(`Error sending admin email: ${sanitizeErrorMessage(error.message)}`);
        return false;
    }
};

/**
 * Send an email notification to a customer or user
 * @param {string} toEmail - Customer email address
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML formatted email body
 * @returns {Promise<boolean>}
```

#### Helper 3: `sendAmcNotification` (Dispatches both In-App & Email)
**File:** `server/services/amc.service.js` (Lines 1381–1473)

```javascript
const sendAmcNotification = async ({
  userId = null,
  companyId = null,
  role = null,
  title,
  message,
  ticketId = null,
  sendInApp = true,
  sendEmail = true
}) => {
  let inAppSuccess = !sendInApp;
  let emailSuccess = !sendEmail;
  let inAppError = null;
  let emailError = null;
  let recipientsCount = 0;

  try {
    const recipients = [];
    if (userId) {
      const [u] = await pool.query('SELECT id, email, name, role FROM users WHERE id = ?', [userId]);
      if (u.length > 0) recipients.push(u[0]);
    } else if (companyId) {
      const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
      if (resolvedCompanyId) {
        const [u] = await pool.query('SELECT id, email, name, role FROM users WHERE id = ?', [resolvedCompanyId]);
        if (u.length > 0) recipients.push(u[0]);
      }
    } else if (role === 'admin') {
      const [admins] = await pool.query('SELECT id, email, name, role FROM users WHERE role = "admin" AND is_active = 1');
      recipients.push(...admins);
    }

    recipientsCount = recipients.length;

    for (const r of recipients) {
      // 1. In-App Notification Delivery
      if (sendInApp) {
        try {
          await pool.query(
            'INSERT INTO notifications (user_id, ticket_id, title, message) VALUES (?, ?, ?, ?)',
            [r.id, ticketId, title, message]
          );
          inAppSuccess = true;
        } catch (inAppErr) {
          inAppSuccess = false;
          inAppError = inAppErr.message;
          logger.error(`Failed to dispatch in-app AMC notification to user ${r.id}: ${inAppErr.message}`);
        }
      }

      // 2. Email Notification Delivery (Awaited with error capture)
      if (sendEmail) {
        try {
          if (role === 'admin' || r.role === 'admin') {
            const adminSent = await sendAdminNotification(title, `<p>${message}</p>`);
            if (adminSent) {
              emailSuccess = true;
            } else {
              emailSuccess = false;
              emailError = 'Admin notification email delivery returned false or unconfigured.';
            }
          } else if (r.email) {
            const customerSent = await sendCustomerNotification(
              r.email,
              title,
              `<p>Hello ${r.name || 'Valued Client'},</p><p>${message}</p>`
            );
            if (customerSent) {
              emailSuccess = true;
            } else {
              emailSuccess = false;
              emailError = `Customer notification email delivery to ${r.email} returned false or unconfigured.`;
            }
          } else {
            emailSuccess = false;
            emailError = 'No valid email address found on user account.';
          }
        } catch (emailErr) {
          emailSuccess = false;
          emailError = emailErr.message;
          logger.error(`Failed to send email AMC notification to ${r.email}: ${emailErr.message}`);
        }
      }
    }
  } catch (err) {
    logger.warn(`Failed to dispatch AMC notification: ${err.message}`);
    if (sendInApp && !inAppSuccess) inAppError = err.message;
    if (sendEmail && !emailSuccess) emailError = err.message;
  }

  return {
    success: inAppSuccess && emailSuccess,
    inAppSuccess,
```

### 5. Where TekDoctor Bank Details for AMC Offline Payment are Located

**Factual Finding: Hardcoded in Frontend JSX.**
Bank transfer details are NOT retrieved from `site_settings` or from any backend API endpoint. They are hardcoded directly into the frontend React components.

#### 1. Company AMC Portal: `client/src/pages/company/CompanyAmcManagement.tsx`
**Lines:** 1794–1825

```tsx
<strong className="block text-white">ICICI Bank</strong>
<span>Account Number:</span>
<strong className="text-white font-mono">2345XXXX1234 (MASKED)</strong>
onClick={() => handleCopyBank('2345XXXX1234 (MASKED)', 'Account Number')}
<span>IFSC Code:</span>
<strong className="text-white font-mono">ICIC0002345</strong>
onClick={() => handleCopyBank('ICIC0002345', 'IFSC')}
```

#### 2. Public / Billing Payment Page: `client/src/pages/billing/pay/PaymentPage.tsx`
**Lines:** 695–745

```tsx
<span className="text-white font-bold">ICICI Bank</span>
<span className="text-neon-cyan font-bold">2345XXXX1234 (MASKED)</span>
onClick={() => handleCopy('2345XXXX1234 (MASKED)', 'bank')}
<span className="text-white font-bold">ICIC0002345</span>
<span className="text-emerald-400 font-bold">tekdoctor@icici</span>
```

#### 3. Modal Dialog: `client/src/components/PaymentMethodModal.tsx`
**Lines:** 393–420, 476

```tsx
<span className="text-zinc-500 block text-[10px]">Bank Name</span>
onClick={() => copyToClipboard('5020XXXX1122 (MASKED)', 'Account Number')}
onClick={() => copyToClipboard('HDFC0001234', 'IFSC')}
onClick={() => copyToClipboard('tekdoctor@icici', 'UPI ID')}
```


---

=== PART 7: Frontend ===

### 1. `client/src/pages/company/CompanyAmcManagement.tsx` Profile

- **Total Line Count:** 2,446 lines
- **List of Tabs:**
  1. `contracts` ("My Contracts")
  2. `plans` ("Available Plans")
  3. `inquiries` ("Quote Inquiries")
  4. `replacements` ("Hardware Swaps")
- **List of Modals & Drawers:**
  1. `isRequestModalOpen` — "Request Custom AMC Quote" dialog
  2. `offerModalContract` — "Review Contract Offer" review/accept/decline modal
  3. `paymentModalContract` — "Complete AMC Payment" modal (Online Razorpay / Offline Bank Transfer tabs)
  4. `manageDevicesContract` — "Manage Covered Devices" allocation dialog
  5. `replacementContract` — "Request Hardware Device Swap" modal
  6. `renewalModalContract` — "Request AMC Renewal" modal
  7. `detailsDrawerContract` — "Contract Details Slide-over Drawer"
- **State Variables (46 names):**
  `activeTab`, `loading`, `refreshing`, `contracts`, `requests`, `plans`, `replacements`, `fleetDevices`, `searchQuery`, `contractStatusFilter`, `isRequestModalOpen`, `selectedPlanForRequest`, `requestedDeviceCount`, `requestNotes`, `acceptTerms`, `isSubmittingRequest`, `offerModalContract`, `declineReason`, `isDecliningOffer`, `isProcessingOffer`, `paymentModalContract`, `paymentMethodTab`, `offlinePaymentMode`, `offlineRefNumber`, `offlineDate`, `offlineNotes`, `isSubmittingPayment`, `copiedBankField`, `manageDevicesContract`, `contractCapacityInfo`, `selectedDeviceIdsToAssign`, `deviceSearchQuery`, `isAssigningDevices`, `replacementContract`, `replacementOldDeviceId`, `replacementNewDeviceId`, `replacementReason`, `isSubmittingReplacement`, `renewalModalContract`, `renewalRequestedCapacity`, `renewalNotes`, `isSubmittingRenewal`, `isDownloadingCert`, `detailsDrawerContract`, `drawerDetailsLoading`, `replacementDetailsLoading`.
- **Handler Functions (15 handlers):**
  1. `handleSubmitRequest` (line 344): Submits new custom AMC quote inquiry.
  2. `handleAcceptOffer` (line 384): Accepts pending contract offer.
  3. `handleDeclineOffer` (line 404): Rejects contract offer with explanation.
  4. `handleOnlinePayment` (line 426): Opens Razorpay checkout modal and completes verification.
  5. `handleSubmitOfflinePayment` (line 499): Submits bank transfer reference for admin review.
  6. `handleOpenManageDevices` (line 533): Opens modal to allocate fleet devices to contract.
  7. `handleOpenReplacementModal` (line 566): Opens hardware swap request dialog.
  8. `handleAssignDevices` (line 591): Submits device IDs to occupy contract coverage capacity.
  9. `handleSubmitReplacement` (line 617): Submits device swap under contract SLA.
  10. `handleOpenDetails` (line 665): Fetches and displays full contract audit drawer.
  11. `handleDownloadCertificate` (line 687): Fetches authoritative cryptographic data and generates client PDF.
  12. `handlePrintCertificate` (line 709): Opens browser print dialog for AMC certificate.
  13. `handleOpenRenewModal` (line 730): Opens renewal request modal for active/expired contract.
  14. `handleSubmitRenewal` (line 737): Submits renewal request to admin queue.
  15. `handleCopyBank` (line 763): Copies hardcoded bank account or IFSC to clipboard.
- **`amcApi` Methods Called (16 methods):**
  `getCompanyContracts`, `getCompanyRequests`, `getPublicPlans`, `getCompanyReplacements`, `createRequest`, `acceptOffer`, `rejectOffer`, `createPaymentOrder`, `verifyPayment`, `initiateOfflinePayment`, `getContractCapacity`, `getCompanyContractDetails`, `assignDevices`, `requestReplacement`, `getCertificate`, `requestRenewal`.

### 2. `client/src/pages/admin/AdminAmcManagement.tsx` Profile

- **Total Line Count:** 3,122 lines
- **List of Tabs:**
  1. `contracts` ("All Contracts")
  2. `requests` ("Inquiries / Requests")
  3. `plans` ("AMC Plans")
  4. `replacements` ("Hardware Swaps")
  5. `reminders` ("Expiry Reminders")
- **List of Modals & Drawers:**
  1. `showRenewalModal` — Create renewal offer modal
  2. `showCreatePlanModal` — Create new AMC master plan modal
  3. `showEditPlanModal` — Edit plan modal
  4. `showCreateContractModal` — Create / offer contract modal
  5. `showReviewRequestModal` — Review quote inquiry modal
  6. `showReviewReplacementModal` — Review device swap modal
  7. `showConfirmApproveModal` — Approve contract confirmation dialog
  8. `showStatusModal` — Update contract status modal
  9. `showVerifyOfflineModal` — Verify offline payment modal
  10. `contractDrawerOpen` — Contract details slide-over drawer
- **State Variables (52 names):**
  `activeTab`, `overview`, `loadingOverview`, `contracts`, `loadingContracts`, `contractSearch`, `contractStatusFilter`, `selectedContract`, `contractDrawerOpen`, `loadingContractDetails`, `requests`, `loadingRequests`, `requestSearch`, `requestStatusFilter`, `plans`, `loadingPlans`, `replacements`, `loadingReplacements`, `replacementStatusFilter`, `reminders`, `loadingReminders`, `remindersStatusFilter`, `retryingReminderId`, `isSweepingExpiries`, `isSweepingReminders`, `isDownloadingCert`, `showRenewalModal`, `renewalTargetContract`, `renewalSourceRequest`, `renewalForm`, `isSubmittingRenewalOffer`, `companiesList`, `loadingCompanies`, `companiesError`, `companySearchQuery`, `showCreatePlanModal`, `showEditPlanModal`, `selectedPlanForEdit`, `showCreateContractModal`, `showReviewRequestModal`, `selectedRequestForReview`, `showReviewReplacementModal`, `selectedReplacementForReview`, `showConfirmApproveModal`, `showStatusModal`, `showVerifyOfflineModal`, `planForm`, `contractForm`, `requestReviewForm`, `replacementReviewForm`, `contractStatusForm`, `verifyOfflineForm`.
- **Handler Functions (25 handlers):**
  `fetchOverview`, `fetchContracts`, `fetchRequests`, `fetchPlans`, `fetchReplacements`, `fetchCompanies`, `fetchReminders`, `handleRetryReminder`, `handleTriggerExpiriesSweep`, `handleTriggerRemindersSweep`, `handleDownloadCertificate`, `handlePrintCertificate`, `handleOpenRenewalModal`, `handleOpenRenewalFromRequest`, `handleSubmitRenewalOffer`, `handleOpenContractDetails`, `handleCreatePlan`, `handleUpdatePlan`, `handleTogglePlan`, `handleCreateContract`, `handleReviewRequest`, `handleApproveContract`, `handleUpdateContractStatus`, `handleVerifyOfflinePayment`, `handleReviewReplacement`.
- **`amcApi` Methods Called (21 methods):**
  `getAdminOverview`, `getAdminContracts`, `getAdminRequests`, `getAdminPlans`, `getAdminReplacements`, `getAdminReminders`, `retryAdminReminder`, `triggerExpiriesSweep`, `triggerRemindersSweep`, `getCertificate`, `getAdminContractDetails`, `createRenewalContract`, `createPlan`, `updatePlan`, `togglePlanStatus`, `createContract`, `reviewRequest`, `approveContract`, `updateContractStatus`, `verifyOfflinePayment`, `reviewReplacement`.

### 3. Key UI Sections (Full Verbatim Code)

#### (a) Company "Available Plans" Tab + "Request Quote" Handler
**Handler:** `handleSubmitRequest` in `client/src/pages/company/CompanyAmcManagement.tsx` (Lines 344–382)

```tsx
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (requestedDeviceCount < 1) {
      toast.error('Device count must be at least 1.');
      return;
    }
    if (!acceptTerms) {
      toast.error('Please accept the AMC Terms & Conditions to proceed.');
      return;
    }

    setIsSubmittingRequest(true);
    try {
      const payload = {
        planId: selectedPlanForRequest || undefined,
        requestedDeviceCount,
        notes: requestNotes.trim() || undefined,
      };

      const res = await amcApi.createRequest(token, payload);
      if (res.ok) {
        toast.success('AMC Inquiry submitted successfully! Our enterprise team will review and send you a custom offer.');
        setIsRequestModalOpen(false);
        setSelectedPlanForRequest(null);
        setRequestNotes('');
        setAcceptTerms(false);
        loadData(false);
      } else {
        toast.error(res.error || 'Failed to submit request.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error submitting request.');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

```

**Render Part (Available Plans Tab):** `client/src/pages/company/CompanyAmcManagement.tsx` (Lines 1250–1354)

```tsx
      {activeTab === 'plans' && (
        <div className="space-y-6">
          <div className="max-w-2xl">
            <h3 className="text-base font-bold text-white">Official AMC Maintenance Plans</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Select the plan that matches your organization's device inventory and SLA response expectations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(!Array.isArray(plans) || plans.length === 0) ? (
              <div className="col-span-full p-8 text-center text-zinc-500 text-xs bg-zinc-900/30 rounded-xl border border-zinc-800/60">
                No AMC plans currently available.
              </div>
            ) : (
              plans.map(plan => {
                const terms = typeof plan.coverage_terms === 'string'
                  ? JSON.parse(plan.coverage_terms || '{}')
                  : plan.coverage_terms || {};

              return (
                <div
                  key={plan.id}
                  className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-6 flex flex-col justify-between hover:border-neon-cyan/40 transition-all group"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 uppercase">
                        {plan.plan_code}
                      </span>
                      <span className="text-xs text-zinc-400 font-mono">
                        {plan.duration_months} Months
                      </span>
                    </div>

                    <div>
                      <h4 className="text-lg font-bold text-white group-hover:text-neon-cyan transition-colors">
                        {plan.name}
                      </h4>
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                        {plan.description || 'Comprehensive hardware maintenance & warranty protection.'}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-zinc-800/60">
                      <span className="text-xs text-zinc-500 block">Starting From</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-white font-mono">
                          {formatCurrency(plan.base_price)}
                        </span>
                        <span className="text-xs text-zinc-400">/ contract</span>
                      </div>
                      <span className="text-[11px] text-zinc-500 font-mono mt-0.5 block">
                        Default Capacity: {plan.default_device_capacity} Devices
                      </span>
                    </div>

                    {/* Features list */}
                    <div className="space-y-2 pt-2 border-t border-zinc-800/60 text-xs">
                      {terms.sla_response_time && (
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Check className="w-3.5 h-3.5 text-neon-cyan flex-shrink-0" />
                          <span>SLA Response: <strong>{terms.sla_response_time}</strong></span>
                        </div>
                      )}
                      {terms.preventive_maintenance_visits && (
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Check className="w-3.5 h-3.5 text-neon-cyan flex-shrink-0" />
                          <span>{terms.preventive_maintenance_visits} Preventive Maintenance Visits</span>
                        </div>
                      )}
                      {terms.standby_device_provided && (
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Check className="w-3.5 h-3.5 text-neon-cyan flex-shrink-0" />
                          <span>Standby Replacement Device Provided</span>
                        </div>
                      )}
                      {terms.discount_on_spares && (
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Check className="w-3.5 h-3.5 text-neon-cyan flex-shrink-0" />
                          <span>{terms.discount_on_spares}% Discount on Out-of-Scope Spares</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-6">
                    <button
                      onClick={() => {
                        setSelectedPlanForRequest(plan.id);
                        setRequestedDeviceCount(plan.default_device_capacity || 5);
                        setIsRequestModalOpen(true);
                      }}
                      className="w-full py-2.5 px-4 bg-neon-cyan/15 hover:bg-neon-cyan/25 text-neon-cyan border border-neon-cyan/40 rounded-xl text-xs font-bold transition-all shadow-md"
                    >
                      Request Quote for {plan.name}
                    </button>
                  </div>
                </div>
              );
            }))}
          </div>
        </div>
      )}

```

#### (b) Admin "Inquiries/Requests" Tab Handlers in `AdminAmcManagement.tsx`
**Handlers:** `handleReviewRequest` & `handleOpenRenewalFromRequest` (Lines 886–902, 651–671)

```tsx
  const handleReviewRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequestForReview) return;
    try {
      const res = await amcApi.reviewRequest(token!, selectedRequestForReview.id, requestReviewForm);
      if (res.ok) {
        toast.success('AMC Request review saved.');
        setShowReviewRequestModal(false);
        fetchRequests();
        fetchOverview();
      } else {
        toast.error(res.error || (res.data as any)?.message || 'Failed to review request.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving request review.');
    }
  };

  const handleOpenRenewalFromRequest = async (reqRow: AmcRequest) => {
    if (!token) return;
    if (!reqRow.previous_contract_id) {
      toast.error('This renewal request has no linked previous contract ID. Open the target contract row to issue a renewal offer.');
      return;
    }
    try {
      const res = await amcApi.getAdminContractDetails(token, reqRow.previous_contract_id);
      if (res.ok && res.data) {
        const prevContract = extractResponseData<AmcContract | null>(res, null);
        if (prevContract) {
          handleOpenRenewalModal(prevContract, reqRow);
          return;
        }
      }
      toast.error(res.error || 'Failed to load previous contract details for renewal.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error loading previous contract for renewal.');
    }
  };

```

#### (c) Admin Overview Cards Section in `AdminAmcManagement.tsx`
**Render Part:** `client/src/pages/admin/AdminAmcManagement.tsx` (Lines 1056–1123)

```tsx
              setShowCreateContractModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 transition"
          >
            <Plus className="h-4 w-4" />
            Create AMC Offer / Contract
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Active Contracts</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">{overview?.activeContracts ?? '--'}</div>
          <p className="text-[11px] text-zinc-500 mt-1">Currently active maintenance coverage</p>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Pending Approvals</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">{overview?.pendingApprovals ?? '--'}</div>
          <p className="text-[11px] text-zinc-500 mt-1">Contracts awaiting admin review</p>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Unpaid / Awaiting Pay</span>
            <DollarSign className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white">{overview?.awaitingPayment ?? '--'}</div>
          <p className="text-[11px] text-zinc-500 mt-1">Unpaid or pending verification</p>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Pending Replacements</span>
            <ArrowRightLeft className="h-4 w-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400">{overview?.pendingReplacements ?? '--'}</div>
          <p className="text-[11px] text-zinc-500 mt-1">Device replacement approvals queued</p>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Pending Requests</span>
            <FileText className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-400">{overview?.pendingRequests ?? '--'}</div>
          <p className="text-[11px] text-zinc-500 mt-1">Inquiries &amp; renewals awaiting offer</p>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Nearing Expiry (30d)</span>
            <AlertTriangle className="h-4 w-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-orange-400">{overview?.nearingExpiry ?? '--'}</div>
          <p className="text-[11px] text-zinc-500 mt-1">Active contracts expiring within 30 days</p>
        </div>
      </div>

      {/* Tabs */}
```

### 4. Complete `amcApi` Object from `client/src/services/api.ts` (Full Code)

**File:** `client/src/services/api.ts` (Lines 2613–2926)

```typescript
export const amcApi = {
  // Public
  getPublicPlans: async (): Promise<SafeResponse<any[]>> => {
    return safeFetch<any[]>(getUrl(ENDPOINTS.AMC.PLANS), {
      method: 'GET',
    });
  },

  // Eligibility
  checkEligibility: async (token: string, companyId?: number | string, deviceId?: number | string): Promise<SafeResponse<any>> => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', String(companyId));
    if (deviceId) params.append('deviceId', String(deviceId));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return safeFetch<any>(getUrl(`${ENDPOINTS.AMC.ELIGIBILITY}${qs}`), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  // Admin Methods
  getAdminOverview: async (token: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.ADMIN_OVERVIEW), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  getAdminPlans: async (token: string): Promise<SafeResponse<any[]>> => {
    return safeFetch<any[]>(getUrl(ENDPOINTS.AMC.ADMIN_PLANS), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  createPlan: async (token: string, data: any): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.ADMIN_PLANS), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  updatePlan: async (token: string, planId: number | string, data: any): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.ADMIN_PLAN_BY_ID(planId)), {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  togglePlanStatus: async (token: string, planId: number | string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.ADMIN_PLAN_TOGGLE(planId)), {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  getAdminRequests: async (token: string, params?: { status?: string; companyId?: number | string }): Promise<SafeResponse<any[]>> => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.companyId) q.append('companyId', String(params.companyId));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return safeFetch<any[]>(getUrl(`${ENDPOINTS.AMC.ADMIN_REQUESTS}${qs}`), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  reviewRequest: async (token: string, requestId: number | string, data: { status: string; adminNotes?: string }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.ADMIN_REQUEST_REVIEW(requestId)), {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  getAdminContracts: async (token: string, params?: { status?: string; companyId?: number | string }): Promise<SafeResponse<any[]>> => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.companyId) q.append('companyId', String(params.companyId));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return safeFetch<any[]>(getUrl(`${ENDPOINTS.AMC.ADMIN_CONTRACTS}${qs}`), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  getAdminContractDetails: async (token: string, contractId: number | string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.ADMIN_CONTRACT_BY_ID(contractId)), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  createContract: async (token: string, data: any): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.ADMIN_CONTRACTS), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  approveContract: async (token: string, contractId: number | string, data?: { startDate?: string; endDate?: string }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.ADMIN_CONTRACT_APPROVE(contractId)), {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data || {}),
    });
  },

  updateContractStatus: async (token: string, contractId: number | string, data: { status: string; reason?: string }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.ADMIN_CONTRACT_STATUS(contractId)), {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  verifyOfflinePayment: async (token: string, contractId: number | string, data: { decision: 'verified' | 'rejected'; adminNotes?: string }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.ADMIN_VERIFY_OFFLINE(contractId)), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  getAdminReplacements: async (token: string, params?: { status?: string; contractId?: number | string }): Promise<SafeResponse<any[]>> => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.contractId) q.append('contractId', String(params.contractId));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return safeFetch<any[]>(getUrl(`${ENDPOINTS.AMC.ADMIN_REPLACEMENTS}${qs}`), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  reviewReplacement: async (token: string, replacementId: number | string, data: { decision: 'approved' | 'rejected'; adminNotes?: string }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.ADMIN_REPLACEMENT_REVIEW(replacementId)), {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  // Company Methods
  getCompanyRequests: async (token: string): Promise<SafeResponse<any[]>> => {
    return safeFetch<any[]>(getUrl(ENDPOINTS.AMC.COMPANY_REQUESTS), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  createRequest: async (token: string, data: { planId?: number; requestedDeviceCount: number; notes?: string }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.COMPANY_REQUESTS), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  getCompanyContracts: async (token: string, params?: { status?: string }): Promise<SafeResponse<any[]>> => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return safeFetch<any[]>(getUrl(`${ENDPOINTS.AMC.COMPANY_CONTRACTS}${qs}`), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  getCompanyContractDetails: async (token: string, contractId: number | string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.COMPANY_CONTRACT_BY_ID(contractId)), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  acceptOffer: async (token: string, contractId: number | string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.COMPANY_CONTRACT_ACCEPT(contractId)), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  rejectOffer: async (token: string, contractId: number | string, reason?: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.COMPANY_CONTRACT_REJECT(contractId)), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ reason }),
    });
  },

  getContractCapacity: async (token: string, contractId: number | string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.COMPANY_CONTRACT_CAPACITY(contractId)), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  assignDevices: async (token: string, contractId: number | string, deviceIds: number[]): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.COMPANY_CONTRACT_DEVICES(contractId)), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ deviceIds }),
    });
  },

  createPaymentOrder: async (token: string, contractId: number | string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.COMPANY_CREATE_ORDER(contractId)), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  verifyPayment: async (token: string, contractId: number | string, data: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature?: string }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.COMPANY_VERIFY_PAYMENT(contractId)), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  initiateOfflinePayment: async (token: string, contractId: number | string, data: { paymentMethod?: string; referenceNumber?: string; notes?: string }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.COMPANY_OFFLINE_PAYMENT(contractId)), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  getCompanyReplacements: async (token: string): Promise<SafeResponse<any[]>> => {
    return safeFetch<any[]>(getUrl(ENDPOINTS.AMC.COMPANY_REPLACEMENTS), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  requestReplacement: async (token: string, data: { contractId: number; oldDeviceId: number; newDeviceId: number; reason: string }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.COMPANY_REPLACEMENTS), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  // Phase 3 Certificate
  getCertificate: async (token: string, contractId: number | string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.CERTIFICATE(contractId)), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  // Phase 3 Renewals
  requestRenewal: async (token: string, contractId: number | string, data: { requestedCapacity?: number; notes?: string }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.COMPANY_CONTRACT_RENEW(contractId)), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  createRenewalContract: async (token: string, previousContractId: number | string, data: any): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.ADMIN_CONTRACT_RENEW(previousContractId)), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Phase 3 Expiry Reminders & Maintenance
  getAdminReminders: async (token: string, params?: { contractId?: number | string; companyId?: number | string; status?: string; limit?: number }): Promise<SafeResponse<any[]>> => {
    const q = new URLSearchParams();
    if (params?.contractId) q.append('contractId', String(params.contractId));
    if (params?.companyId) q.append('companyId', String(params.companyId));
    if (params?.status) q.append('status', params.status);
    if (params?.limit) q.append('limit', String(params.limit));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return safeFetch<any[]>(getUrl(`${ENDPOINTS.AMC.ADMIN_REMINDERS}${qs}`), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  retryAdminReminder: async (token: string, reminderId: number): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.ADMIN_REMINDER_RETRY(reminderId)), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  triggerExpiriesSweep: async (token: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.ADMIN_MAINTENANCE_EXPIRIES), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  triggerRemindersSweep: async (token: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.AMC.ADMIN_MAINTENANCE_REMINDERS), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  verifyPublicCertificate: async (code: string, contractNumber?: string): Promise<SafeResponse<any>> => {
    const query = contractNumber ? `?contractNumber=${encodeURIComponent(contractNumber)}` : '';
    return safeFetch<any>(getUrl(`${ENDPOINTS.AMC.PUBLIC_VERIFY_CERTIFICATE(code)}${query}`), {
      method: 'GET'
    });
  },
};
```

### 5. AMC Route Constants & Sidebar Layout Integration

#### Constants in `client/src/config/routes.ts`:

```typescript
AMC: '/amc',                           // Public marketing landing page
ADMIN_AMC: '/admin/amc',                 // Admin portal AMC management
COMPANY_AMC: '/company/amc',             // Company B2B portal AMC management
VERIFY_CERTIFICATE: '/verify-certificate/:code', // Public certificate verification
```

#### Admin Sidebar (`client/src/layouts/AdminLayout.tsx` line 43):

```tsx
{ label: 'AMC Management', icon: ShieldCheck, path: ROUTES.ADMIN_AMC },
```

#### Company Sidebar (`client/src/layouts/CompanyLayout.tsx` line 27):

```tsx
{ label: 'AMC Contracts', icon: ShieldCheck, path: ROUTES.COMPANY_AMC },
```

### 6. Admin `DashboardOverview` Structure & API Calls

- **File:** `client/src/pages/admin/DashboardOverview.tsx` (833 lines)
- **Top-Level Architectural Outline:**
  - **Header & Metric Grid:** 4 primary metrics cards (Total Active Repairs, Pending Technician Diagnosis, Revenue Month-to-Date, Critical Hardware Alerts).
  - **Interactive Analytics Panels:** Tabbed line and bar charts tracking repair intake volume and revenue velocity over 7d / 30d / 90d.
  - **Recent Service Requests Feed:** Live table showing latest tickets across B2C and B2B accounts with inline quick actions.
  - **Technician Availability & Workload Grid:** Live status badges for active technicians, assigned ticket capacity, and transfer requests.
  - **Quick Action Bar:** Direct deep links to `/admin/tickets`, `/admin/amc`, `/admin/companies`, `/admin/technicians`.
- **Backend APIs Called by DashboardOverview:**
  - `adminApi.getDashboardStats(token)` (`GET /api/admin/dashboard-stats`)
  - `adminApi.getRecentTickets(token)` (`GET /api/admin/tickets?limit=10`)
  - `adminApi.getRevenueAnalytics(token)` (`GET /api/billing/analytics`)
  - `adminApi.getTechnicians(token)` (`GET /api/technicians`)

### 7. WebsiteSettings Load & Save Functions (Full Code)

#### `fetchSettings` Function
**File:** `client/src/pages/admin/WebsiteSettings.tsx` (Lines 71–116)

```tsx
    const fetchSettings = async (showLoading = true) => {
        if (!token) return;
        if (showLoading) setLoading(true);
        try {
            const res = await adminApi.getSettings(token);
            if (res.ok && res.data) {
                const data = (res.data as any).data || {};

                // Merge DB settings into DEFAULT_SETTINGS
                const mergedSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                Object.keys(data).forEach(group => {
                    if (mergedSettings[group]) {
                        Object.keys(data[group]).forEach(key => {
                            mergedSettings[group][key] = data[group][key];
                        });
                    }
                });

                setSettings(mergedSettings);
                const flat: Record<string, string> = {};
                Object.entries(mergedSettings).forEach(([, keys]: any) => {
                    Object.entries(keys).forEach(([k, v]: any) => { flat[k] = v; });
                });
                setEditedValues(flat);

                // Load branding values separately
                const storedLogo = data?.company?.logo_url || data?.branding?.logo_url || '';
                const storedFavicon = data?.branding?.favicon_url || '';
                const storedTekunikLogo = data?.branding?.tekunik_image_url || '';
                setLogoUrl(storedLogo);
                setFaviconUrl(storedFavicon);
                setTekunikLogoUrl(storedTekunikLogo);
                setLogoInputUrl(storedLogo);
                setFaviconInputUrl(storedFavicon);
                setTekunikLogoInputUrl(storedTekunikLogo);
                setLogoMode(isUploadPath(storedLogo) ? 'upload' : (storedLogo ? 'url' : 'upload'));
                setFaviconMode(isUploadPath(storedFavicon) ? 'upload' : (storedFavicon ? 'url' : 'upload'));
                setTekunikLogoMode(isUploadPath(storedTekunikLogo) ? 'upload' : (storedTekunikLogo ? 'url' : 'upload'));
            }
        } catch (error) {
            console.error('Error fetching website settings:', error);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

```

#### `handleSave` Function
**File:** `client/src/pages/admin/WebsiteSettings.tsx` (Lines 122–192)

```tsx
    const handleSave = async () => {
        if (!token) return;
        setSaving(true); setSaveMsg('');

        // Exclude logo_url, favicon_url, and tekunik_image_url from the general save
        const { logo_url: _logo, favicon_url: _favicon, tekunik_image_url: _tekunik, ...settingsToSave } = editedValues;

        // Auto-trim strings
        Object.keys(settingsToSave).forEach(k => {
            if (typeof settingsToSave[k] === 'string') {
                settingsToSave[k] = settingsToSave[k].trim();
            }
        });

        // Validate alternate contact number if entered
        const altPhone = settingsToSave.company_alternate_phone;
        if (altPhone) {
            const cleanDigits = altPhone.replace(/[\s\-()]/g, '').replace(/^(\+91|91|0)/, '');
            if (!/^[6-9]\d{9}$/.test(cleanDigits) && !/^\d{10}$/.test(cleanDigits)) {
                toast.error('Alternate contact number must be a valid 10-digit phone number.');
                setSaving(false);
                return;
            }
        }

        // Validate reCAPTCHA score threshold
        if (settingsToSave.recaptcha_score_threshold !== undefined && settingsToSave.recaptcha_score_threshold !== '') {
            const score = parseFloat(settingsToSave.recaptcha_score_threshold);
            if (isNaN(score) || score < 0 || score > 1) {
                toast.error('reCAPTCHA score threshold must be a number between 0.0 and 1.0.');
                setSaving(false);
                return;
            }
        }

        // Validate Google Login enabling
        if (settingsToSave.google_login_enabled === 'true') {
            const clientId = settingsToSave.google_client_id;
            if (!clientId || clientId.trim() === '') {
                toast.error('Google Client ID is required before enabling Google Sign-In.');
                setSaving(false);
                return;
            }
        }

        // Validate reCAPTCHA enabling
        if (settingsToSave.recaptcha_enabled === 'true') {
            const siteKey = settingsToSave.recaptcha_site_key;
            if (!siteKey || siteKey.trim() === '') {
                toast.error('reCAPTCHA Site Key is required before enabling reCAPTCHA.');
                setSaving(false);
                return;
            }
        }

        const res = await adminApi.updateSettings(token, settingsToSave);
        if (res.ok) {
            setSaveMsg('Settings saved successfully!');
            toast.success('Website settings updated successfully!');
            await fetchSettings(false);
            await refreshSiteData();
            setTimeout(() => setSaveMsg(''), 3000);
        } else {
            const errorMsg = (res.data as any)?.message || res.error || 'Failed to save settings.';
            toast.error(errorMsg);
        }
        setSaving(false);
    };

    // ─── Upload a branding image file and immediately persist ───
    const handleBrandingUpload = async (type: 'logo_url' | 'favicon_url' | 'tekunik_image_url', file: File) => {
```

### 8. AMC Eligibility Integration in Repair Booking Flow

#### Public Booking (`client/src/pages/public/RepairBooking.tsx`)
- AMC eligibility is **NOT** evaluated in public repair booking (B2C customer flow). It is strictly corporate fleet coverage.

#### Corporate Repair Flow (`client/src/pages/company/CompanyRepairs.tsx`)
- When a company selects a device from `company_devices`, the UI inspects `device.is_amc` and `device.amc_tag`.
- If active, it renders `<span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-mono">AMC #{device.amc_tag}</span>`.

#### Backend Repair Controller (`server/controllers/repair.controller.js`)
- In `createRepairRequest` (lines 437–457):
  ```javascript
  let isAmc = false;
  if (companyId && deviceId) {
    const amcEligibility = await resolveDeviceAmcEligibility(connection, {
      companyId,
      deviceId
    });
    isAmc = amcEligibility.isEligible;
  }
  ```
- In ticket workflow guards (lines 1619–1621):
  If a ticket is AMC-covered (`isAmcTicket = true`), the technician is **exempt** from requiring customer estimate approval before moving to `in_progress` or `completed`.


---

=== PART 8: Security & config facts ===

### 1. Default Admin Seed Location & Production Safeguard

- **File:** `server/models/db.init.js` (Lines 891–917)
- **Code Condition:**
  ```javascript
  const targetAdminEmail = config.initialAdmin?.email || (!config.isProduction ? '<MASKED_DEFAULT_ADMIN_EMAIL>' : '');
  const targetAdminPassword = config.initialAdmin?.password || (!config.isProduction ? '<MASKED_DEFAULT_PASSWORD>' : '');

  if (targetAdminEmail && targetAdminPassword) {
    const [existingTarget] = await connection.query('SELECT * FROM users WHERE email = ? LIMIT 1', [targetAdminEmail]);
    // Inserts user if missing, or re-hashes unhashed bcrypt passwords
  }
  ```
- **Does Production Prevent It?**
  **YES.** When `NODE_ENV=production` (`config.isProduction = true`), the fallback expression evaluates `(!config.isProduction ? ... : '')` to an empty string `''`.
  Unless `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` are explicitly provided as environment variables, `targetAdminEmail` and `targetAdminPassword` evaluate to `''`. Consequently `if (targetAdminEmail && targetAdminPassword)` is `false`, and no hardcoded default admin account is seeded or modified in production.

### 2. Complete List of Environment Variable Names Used by Server

*(Values strictly masked. Variable names only.)*

**Total Count:** 67 variables.

```text
ADMIN_EMAIL
AMC_ALLOW_LEGACY_V1
AMC_BUSINESS_TIMEZONE
AMC_CERTIFICATE_PREVIOUS_SECRETS
AMC_CERTIFICATE_SECRET
AMC_RETRY_BASE_MINUTES
API_BASE
CORS_ORIGIN
DB_AUTO_INIT
DB_CONNECTION_LIMIT
DB_HOST
DB_NAME
DB_PASSWORD
DB_PORT
DB_USER
EMAIL_PASS
EMAIL_USER
FROM_EMAIL
FROM_NAME
FRONTEND_BUILD_PATH
FRONTEND_URL
GOOGLE_CALLBACK_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_LOGIN_ENABLED
GOOGLE_PROJECT_ID
HOST
INITIAL_ADMIN_EMAIL
INITIAL_ADMIN_PASSWORD
JWT_EXPIRES_IN
JWT_SECRET
LOG_LEVEL
NODE_ENV
PASSENGER_APP_ROOT
PASSENGER_APP_TYPE
PASSENGER_VERSION
PORT
RATE_LIMIT_AUTH_MAX
RATE_LIMIT_BOOKING_MAX
RATE_LIMIT_CERT_VERIFY_MAX
RATE_LIMIT_TRACKING_MAX
RAZORPAY_CURRENCY
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
RECAPTCHA_API_KEY
RECAPTCHA_ENABLED
RECAPTCHA_PROJECT_ID
RECAPTCHA_SCORE_THRESHOLD
RECAPTCHA_SECRET_KEY
RECAPTCHA_SITE_KEY
SETTINGS_ENCRYPTION_KEY
SMTP_FROM_EMAIL
SMTP_FROM_NAME
SMTP_HOST
SMTP_PASS
SMTP_PASSWORD
SMTP_PORT
SMTP_REJECT_UNAUTHORIZED
SMTP_SECURE
SMTP_USER
TEST_API_BASE
UPLOAD_DIR
UPLOAD_MAX_SIZE_MB
VAPID_PRIVATE_KEY
VAPID_PUBLIC_KEY
VAPID_SUBJECT
```

- **Does `server/.env.example` exist?** **YES** (`server/.env.example` is present in the repository root of `server/`).

### 3. Hardcoded Credentials, Keys & Bank Details Found in Repository

| Item Type | File Path | Line(s) | Description / Finding (Value Masked) |
|---|---|---|---|
| Bank Account & IFSC | `client/src/pages/company/CompanyAmcManagement.tsx` | 1804, 1817 | Hardcoded ICICI Bank account `2345XXXX1234 (MASKED)` & IFSC `ICIC0002345` |
| Bank Account & IFSC | `client/src/pages/billing/pay/PaymentPage.tsx` | 701, 713, 741 | Hardcoded ICICI Bank account `2345XXXX1234 (MASKED)`, IFSC `ICIC0002345`, UPI `tekdoctor@icici` |
| Bank Account & IFSC | `client/src/components/PaymentMethodModal.tsx` | 403, 416, 476 | Hardcoded HDFC Bank account `5020XXXX1122 (MASKED)`, IFSC `HDFC0001234`, UPI `tekdoctor@icici` |
| Dev Admin Credentials | `server/models/db.init.js` | 892–893 | Fallback dev email `<MASKED_DEFAULT_ADMIN_EMAIL>` & password `<MASKED_DEFAULT_PASSWORD>` |
| JWT Dev Secret Fallback | `server/config/app.config.js` | 29 | Fallback dev JWT secret (blocked in production by `server.js`) |
| Encryption Key Fallback | `server/config/app.config.js` | 148 | 32-byte hex fallback key for AES-256-GCM settings encryption |
| AMC Cert Secret Fallback | `server/services/amc.service.js` | 2897 | Fallback signing key for HMAC certificate generation |

### 4. Company-Facing AMC Endpoints Ownership Enforcement Audit

| Endpoint | Method | Ownership Enforcement Mechanism | Enforced? |
|---|---|---|---|
| `/api/amc/company/plans` | `GET` | Catalog data only (no tenant isolation required). | **Yes** |
| `/api/amc/company/requests` | `POST` | `companyId = req.user.id` passed from authenticated token. | **Yes** |
| `/api/amc/company/requests` | `GET` | Filters `r.company_id = req.user.id`. | **Yes** |
| `/api/amc/company/contracts` | `GET` | Filters `c.company_id = req.user.id`. | **Yes** |
| `/api/amc/company/contracts/:id` | `GET` | `amcService.getContractDetails(id, req.user.id)` verifies ownership. | **Yes** |
| `/api/amc/company/contracts/:id/accept` | `POST` | `amcService.acceptAmcOffer({ id, companyId: req.user.id })` validates `company_id`. | **Yes** |
| `/api/amc/company/contracts/:id/reject` | `POST` | `amcService.rejectAmcOffer({ id, companyId: req.user.id })` validates `company_id`. | **Yes** |
| `/api/amc/company/contracts/:id/capacity` | `GET` | `if (req.user.role === "company" && capacityInfo.companyId !== req.user.id) return 403`. | **Yes** |
| `/api/amc/company/contracts/:id/devices` | `POST` | `assignDevicesToCoverage` asserts contract `company_id` and device `company_id`. | **Yes** |
| `/api/amc/company/contracts/:id/create-payment-order` | `POST` | `createContractPaymentOrder` asserts `c.company_id = resolvedCompanyId`. | **Yes** |
| `/api/amc/company/contracts/:id/verify-payment` | `POST` | `verifyContractPayment` asserts `c.company_id = resolvedCompanyId`. | **Yes** |
| `/api/amc/company/contracts/:id/offline-payment` | `POST` | `initiateContractOfflinePayment` asserts `c.company_id = resolvedCompanyId`. | **Yes** |
| `/api/amc/company/contracts/:id/renew` | `POST` | `requestAmcRenewal` asserts `c.company_id = resolvedCompanyId`. | **Yes** |
| `/api/amc/company/replacements` | `POST` | `requestDeviceReplacement` asserts `c.company_id` and both device IDs. | **Yes** |
| `/api/amc/company/replacements` | `GET` | Filters `r.company_id = req.user.id`. | **Yes** |
| `/api/amc/contracts/:id/certificate` | `GET` | `getContractCertificateData` checks `contract.company_id !== resolvedCompanyId` -> 403. | **Yes** |

**Result:** 100% of company-facing AMC endpoints enforce company ownership either via token session binding or SQL tenant filters. No IDOR vulnerabilities found on company AMC routes.


---

=== PART 9: Onboarding / purchase flow facts ===

### 1. User Creation & Password Reset Token Lifecycle (Full Code)

#### Customer Signup (`signup` in `server/controllers/auth.controller.js`)
**File:** `server/controllers/auth.controller.js` (Lines 29–105)

```javascript
const signup = async (req, res, next) => {
  const { name, email, password, phone } = req.body;
  let connection;

  try {
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    const cleanPhone = phone ? normalizePhoneNumber(phone) : null;
    connection = await pool.getConnection();

    // Check if user already exists with this email
    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [cleanEmail]
    );

    if (existingUsers.length > 0) {
      const resp = formatResponse(false, 'This email address is already registered. Please use a different email address.');
      resp.errors = { email: 'This email address is already registered. Please use a different email address.' };
      return res.status(400).json(resp);
    }

    // Check if phone number is already registered
    if (cleanPhone) {
      const [existingPhone] = await connection.query(
        'SELECT id FROM users WHERE phone = ? LIMIT 1',
        [cleanPhone]
      );
      if (existingPhone.length > 0) {
        const resp = formatResponse(false, 'This phone number is already registered. Please use a different phone number.');
        resp.errors = { phone: 'This phone number is already registered. Please use a different phone number.' };
        return res.status(400).json(resp);
      }
    }

    // Hash the password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Public registration must never create privileged accounts.
    // Technicians are created by admins and companies use their dedicated registration flow.
    const userRole = 'customer';
    const customerId = await generateCustomerId(connection);

    // Insert user
    const [result] = await connection.query(
      'INSERT INTO users (name, email, password, role, phone, customer_id) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), cleanEmail, hashedPassword, userRole, cleanPhone || null, customerId]
    );

    const userId = result.insertId;
    const user = { id: userId, customer_id: customerId, name, email, role: userRole };
    const token = generateToken(user);

    logger.info(`New user registered: ${email} with role ${userRole} (ID: ${userId}, CustomerID: ${customerId})`);

    // Log Activity
    await logActivity(userId, 'user', 'registration', 'users', userId, { name, email, role: userRole, customer_id: customerId }, req.ip);

    return res.status(201).json(formatResponse(true, 'Registration successful.', {
      id: userId,
      customer_id: customerId,
      name,
      email,
      role: userRole,
      phone: cleanPhone || null,
      company_id: null,
      hasPassword: true,
      token
    }));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

```

#### Corporate Company Register (`registerCompany` in `server/controllers/company.controller.js`)
**File:** `server/controllers/company.controller.js` (Lines 136–258)

```javascript
const registerCompany = async (req, res, next) => {
    const {
        companyName,
        contactPerson,
        email,
        phone,
        address,
        password,
        gstNumber,
        websiteUrl,
        socialFacebook,
        socialInstagram,
        socialTwitter,
        socialLinkedin
    } = req.body;

    let connection;
    try {
        const cleanEmail = email ? email.trim().toLowerCase() : '';
        const cleanPhone = phone ? normalizePhoneNumber(phone) : null;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Check if user already exists with this email
        const [existingUsers] = await connection.query(
            'SELECT id FROM users WHERE email = ? LIMIT 1',
            [cleanEmail]
        );

        if (existingUsers.length > 0) {
            await connection.rollback();
            const resp = formatResponse(false, 'This email address is already registered. Please use a different email address.');
            resp.errors = { email: 'This email address is already registered. Please use a different email address.' };
            return res.status(400).json(resp);
        }

        // Check if phone already exists
        if (cleanPhone) {
            const [existingPhone] = await connection.query(
                'SELECT id FROM users WHERE phone = ? LIMIT 1',
                [cleanPhone]
            );
            if (existingPhone.length > 0) {
                await connection.rollback();
                const resp = formatResponse(false, 'This phone number is already registered. Please use a different phone number.');
                resp.errors = { phone: 'This phone number is already registered. Please use a different phone number.' };
                return res.status(400).json(resp);
            }
        }

        // Hash the password
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Determine if logo was uploaded or is just a string URL
        let logoPath = null;
        if (req.file) {
            // In case logo uploaded via multer
            logoPath = `/uploads/${req.file.filename}`;
        } else if (req.body.companyLogo) {
            logoPath = req.body.companyLogo;
        }

        // Generate stable company ID (CMP-001, CMP-002...)
        const companyId = await generateCompanyId(connection);

        // 1. Insert user
        const [userResult] = await connection.query(
            'INSERT INTO users (name, email, password, role, phone, avatar_url, is_active, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [companyName.trim(), cleanEmail, hashedPassword, 'company', cleanPhone, logoPath || null, true, companyId]
        );
        const userId = userResult.insertId;

        // 2. Insert company profile
        await connection.query(
            `INSERT INTO company_profiles 
        (user_id, company_id, company_name, company_logo, contact_person, phone_number, address, gst_number, website_url, 
         social_facebook, social_instagram, social_twitter, social_linkedin) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                companyId,
                companyName.trim(),
                logoPath,
                contactPerson ? contactPerson.trim() : '',
                cleanPhone || '',
                address ? address.trim() : '',
                gstNumber || null,
                websiteUrl || null,
                socialFacebook || null,
                socialInstagram || null,
                socialTwitter || null,
                socialLinkedin || null
            ]
        );

        await connection.commit();

        const user = { id: userId, name: companyName, email, role: 'company', companyId };
        const token = generateToken(user);

        logger.info(`New company registered: ${companyName} (${email}) (ID: ${userId}, CompanyID: ${companyId})`);

        return res.status(201).json(formatResponse(true, 'Company registration successful.', {
            id: userId,
            companyId,
            name: companyName,
            email,
            role: 'company',
            token
        }));
    } catch (error) {
        if (connection) await connection.rollback();
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getCompanyProfile = async (req, res, next) => {
    let connection;
    try {
```

#### Password Reset Token Generation & Dispatch (`forgotPassword` in `server/controllers/auth.controller.js`)
**File:** `server/controllers/auth.controller.js` (Lines 580–680)

```javascript
const forgotPassword = async (req, res, next) => {
  const { email } = req.body;
  let connection;

  try {
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    connection = await pool.getConnection();

    const [rows] = await connection.query(
      'SELECT id, name, email, role, token_version FROM users WHERE LOWER(email) = ? AND is_active = 1 LIMIT 1',
      [normalizedEmail]
    );

    // Always respond with success to prevent user email enumeration
    if (rows.length === 0) {
      logger.info(`Password reset requested for unregistered or inactive email: ${normalizedEmail}`);
      return res.status(200).json(formatResponse(true, 'If an active account exists with that email, a password reset link has been sent.'));
    }

    const user = rows[0];

    // Admin Role: Dispatch OTP instead of direct URL link
    if (user.role === 'admin') {
      const otp = generateOtpCode();
      const otpHash = hashOtp(otp);

      await connection.query(
        'UPDATE auth_otps SET is_used = 1 WHERE user_id = ? AND purpose = "admin_reset_password" AND is_used = 0',
        [user.id]
      );

      await connection.query(
        'INSERT INTO auth_otps (user_id, otp_hash, purpose, expires_at, attempts_count, max_attempts, resend_count, last_sent_at) VALUES (?, ?, "admin_reset_password", DATE_ADD(NOW(), INTERVAL 15 MINUTE), 0, 5, 0, NOW())',
        [user.id, otpHash]
      );

      // Dispatch OTP asynchronously so response returns immediately
      sendOtpEmail({
        toEmail: user.email,
        otpCode: otp,
        purpose: 'password_reset',
        expiresInMinutes: 15
      }).catch(err => {
        logger.error(`[Admin Password Reset OTP Error] Failed to send OTP to ${user.email}: ${err.message}`);
      });

      logger.info(`[Admin Password Reset OTP Dispatched] User: ${user.email}`);

      await logActivity(user.id, 'security', 'admin_reset_otp_dispatched', 'users', user.id, { email: user.email }, req.ip);

      return res.status(200).json(formatResponse(true, 'If an active account exists with that email, a verification code has been sent.', {
        requiresOtp: true,
        email: user.email,
        maskedEmail: maskEmail(user.email)
      }));
    }

    // Generate short-lived reset token (1 hour) for non-admin roles
    const resetToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        type: 'password_reset',
        token_version: user.token_version || 1
      },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    // Build frontend reset URL based on reliable client origin
    const baseUrl = getFrontendBaseUrl(req);
    const resetUrl = `${baseUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(user.email)}`;

    const emailSubject = 'TekDoctor — Password Reset Request';
    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0d0d12; color: #f4f4f5; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; padding: 32px 24px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.5px; color: #ffffff;">TEK<span style="color: #00e5ff;">DOCTOR</span></span>
        </div>
        <h2 style="font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px;">Password Reset Request</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 16px;">Hello ${user.name || 'Valued Customer'},</p>
        <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 24px;">We received a request to reset the password for your TekDoctor account. Click the button below to choose a new password. This link is single-use and will expire in <strong>1 hour</strong>.</p>
        <div style="margin: 28px 0;">
          <a href="${resetUrl}" style="background-color: #00e5ff; color: #000000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block; text-transform: uppercase; letter-spacing: 0.5px;">Reset My Password</a>
        </div>
        <p style="font-size: 12px; color: #71717a; margin-bottom: 8px;">If the button above does not work, copy and paste this URL into your browser:</p>
        <p style="font-size: 12px; word-break: break-all; color: #00e5ff; background-color: #18181b; padding: 10px; border-radius: 6px; margin-bottom: 24px;">${resetUrl}</p>
        <hr style="border: 0; border-top: 1px solid #27272a; margin: 24px 0;" />
        <p style="font-size: 11px; color: #71717a; line-height: 1.5; margin: 0;">If you did not request this password reset, please ignore this email. Your current password remains completely secure.</p>
      </div>
    `;

    // Await delivery result
    const emailSent = await sendCustomerNotification(user.email, emailSubject, emailHtml);

    logger.info(`[Password Reset Link Generated] User: ${user.email}`);

    if (!emailSent && config.isProduction) {
      logger.error(`[PASSWORD_RESET_FAIL] Password reset email could not be delivered to ${user.email}`);
      return res.status(503).json(formatResponse(false, 'Email service is temporarily unavailable. Please try again later or contact support.'));
    }
```

#### Password Reset Execution (`resetPassword` in `server/controllers/auth.controller.js`)
**File:** `server/controllers/auth.controller.js` (Lines 784–845)

```javascript
const resetPassword = async (req, res, next) => {
  const token = req.body.token;
  const newPassword = req.body.newPassword || req.body.password;
  let connection;

  try {
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      return res.status(400).json(formatResponse(false, 'Invalid or expired password reset link. Please request a new one.'));
    }

    if ((decoded.type !== 'password_reset' && decoded.type !== 'set_password') || !decoded.id) {
      return res.status(400).json(formatResponse(false, 'Invalid reset token.'));
    }

    connection = await pool.getConnection();

    const [rows] = await connection.query(
      'SELECT id, name, email, role, token_version, is_active FROM users WHERE id = ? LIMIT 1',
      [decoded.id]
    );

    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(400).json(formatResponse(false, 'Account not found or has been deactivated.'));
    }

    const user = rows[0];

    // Invalidate token if token_version has already been bumped (prevents replay/reuse)
    if (decoded.token_version !== undefined && user.token_version !== undefined && decoded.token_version !== user.token_version) {
      return res.status(400).json(formatResponse(false, 'This reset link has already been used or is no longer valid.'));
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await connection.query(
      'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
      [hashedPassword, user.id]
    );

    logger.info(`Password successfully set/reset for user: ${user.email} (ID: ${user.id})`);
    await logActivity(user.id, 'security', 'password_reset_completed', 'users', user.id, { email: user.email }, req.ip);

    return res.status(200).json(formatResponse(true, 'Password has been set successfully. You can now sign in with your new password.'));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Invalidate current user session on server
 * POST /api/auth/logout
 */
const logout = async (req, res, next) => {
  let connection;
  try {
```

#### Token Storage, Expiration & Email Dispatch Facts
- **Token Generation:** Uses `jwt.sign({ id: user.id, email: user.email, token_version: user.token_version, type: "password_reset" }, config.jwt.secret, { expiresIn: "1h" })`.
- **Token Storage:** **NOT STORED in the database**. The token is stateless JWT cryptographically signed by `JWT_SECRET`.
- **Expiration:** Token expires naturally after 1 hour (`expiresIn: "1h"`). Replay protection is enforced by embedding `token_version` in the payload and comparing against `users.token_version`.
- **Invalidation:** When a password is changed, `token_version = token_version + 1` is executed atomically, immediately invalidating any outstanding tokens.
- **Email Delivery:** Link sent via `sendCustomerNotification(user.email, subject, emailHtml)` pointing to `${resetUrlBase}/reset-password?token=${resetToken}`.

### 2. Sequential `company_id` (CMP-xxx) Generation & Profile Insertion (Full Code)

#### `generateCompanyId` in `server/utils/helpers.js` (Lines 191–248)

```javascript
const generateCompanyId = async (connection = pool) => {
  const isPool = typeof connection?.getConnection === 'function';
  const conn = isPool ? await connection.getConnection() : connection;

  try {
    const [[userMaxRow]] = await conn.query(
      "SELECT COALESCE(MAX(CAST(SUBSTRING(company_id, 5) AS UNSIGNED)), 0) AS max_val FROM users WHERE company_id REGEXP '^CMP-[0-9]+$'"
    );
    const [[profileMaxRow]] = await conn.query(
      "SELECT COALESCE(MAX(CAST(SUBSTRING(company_id, 5) AS UNSIGNED)), 0) AS max_val FROM company_profiles WHERE company_id REGEXP '^CMP-[0-9]+$'"
    );
    const maxExisting = Math.max(
      Number(userMaxRow?.max_val || 0),
      Number(profileMaxRow?.max_val || 0)
    );

    await conn.query(
      "INSERT IGNORE INTO app_sequences (sequence_name, current_val) VALUES ('company_id', ?)",
      [maxExisting]
    );
    await conn.query(
      "UPDATE app_sequences SET current_val = LAST_INSERT_ID(GREATEST(current_val, ?) + 1) WHERE sequence_name = 'company_id'",
      [maxExisting]
    );
    const [[{ nextVal }]] = await conn.query('SELECT LAST_INSERT_ID() AS nextVal');

    let seqVal = Number(nextVal || 1);
    let candidate = `CMP-${String(seqVal).padStart(3, '0')}`;

    // Bounded safety loop verifying uniqueness across BOTH users and company_profiles
    const MAX_ATTEMPTS = 100;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const [existing] = await conn.query(
        `SELECT 1 FROM users WHERE company_id = ?
         UNION ALL
         SELECT 1 FROM company_profiles WHERE company_id = ?
         LIMIT 1`,
        [candidate, candidate]
      );
      if (existing.length === 0) {
        return candidate;
      }

      await conn.query(
        "UPDATE app_sequences SET current_val = LAST_INSERT_ID(current_val + 1) WHERE sequence_name = 'company_id'"
      );
      const [[{ advancedVal }]] = await conn.query('SELECT LAST_INSERT_ID() AS advancedVal');
      seqVal = Number(advancedVal);
      candidate = `CMP-${String(seqVal).padStart(3, '0')}`;
    }

    throw new Error('Unable to allocate a unique Company ID after maximum collision retries.');
  } finally {
    if (isPool && conn) {
      conn.release();
    }
  }
};
```

#### Where `company_profiles` is Inserted:

1. **Self-Registration (`server/controllers/company.controller.js`, lines 214–239):**
   ```javascript
   await connection.query(
     `INSERT INTO company_profiles 
      (user_id, company_id, company_name, company_logo, contact_person, phone_number, address, gst_number, website_url, 
       social_facebook, social_instagram, social_twitter, social_linkedin) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ...
   );
   ```
2. **Admin Company Creation (`server/controllers/admin.controller.js`, lines 680–687):**
   ```javascript
   await connection.query(
     'INSERT INTO company_profiles (user_id, company_id, company_name, contact_person, phone_number, address) VALUES (?, ?, ?, ?, ?, ?)',
     [companyUserId, companyCode, name, 'Admin Created', cleanPhone || '', '']
   );
   ```

### 3. AMC Razorpay Order Creation & Verification Flow (Full Code)

#### Order Creation (`createContractPaymentOrder` in `server/services/amc.service.js`, lines 1707–1778)

```javascript
const createContractPaymentOrder = async ({ contractId, companyId, userId }) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  const [contracts] = await pool.query(
    'SELECT * FROM amc_contracts WHERE id = ? AND company_id = ?',
    [contractId, resolvedCompanyId]
  );
  if (contracts.length === 0) throw new Error('Contract not found.');

  const contract = contracts[0];
  if (contract.status === 'rejected' || contract.approval_status === 'rejected') {
    throw new Error('Cannot initiate payment for a rejected contract offer.');
  }
  if (contract.payment_status === 'paid') {
    throw new Error('This contract is already paid.');
  }

  const totalAmount = parseFloat(contract.total_amount);
  const keyId = config.razorpay?.keyId || '';
  const keySecret = config.razorpay?.keySecret || '';
  const currency = contract.currency || 'INR';

  let orderId = `order_amc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // If live Razorpay keys are configured, create real Razorpay order
  if (keyId && keySecret && !keySecret.includes('YourKeySecret') && !keySecret.includes('demo')) {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: Math.round(totalAmount * 100), // in paise
          currency,
          receipt: `amc_${contract.id}`,
          notes: {
            contract_id: String(contract.id),
            contract_number: contract.contract_number,
            company_id: String(resolvedCompanyId)
          }
        })
      });
      const orderData = await res.json();
      if (orderData && orderData.id) {
        orderId = orderData.id;
      }
    } catch (orderErr) {
      logger.warn(`Razorpay API order creation fallback: ${orderErr.message}`);
    }
  }

  // Insert payment record
  await pool.query(`
    INSERT INTO payments (order_id, user_id, company_id, amount, currency, status, gateway, reference_note)
    VALUES (?, ?, ?, ?, ?, 'created', 'razorpay', ?)
  `, [orderId, userId, resolvedCompanyId, totalAmount, currency, `AMC Contract: ${contract.contract_number}`]);

  return {
    orderId,
    amount: totalAmount,
    currency,
    keyId,
    contractId: contract.id,
    contractNumber: contract.contract_number,
    planName: contract.plan_name
  };
};

/**
 * 17. Verify AMC Contract Payment (Razorpay signature verification)
```

#### Payment Verification (`verifyContractPayment` in `server/services/amc.service.js`, lines 1780–1896)

```javascript
const verifyContractPayment = async ({ contractId, companyId, razorpayOrderId, razorpayPaymentId, razorpaySignature, userId }) => {
  const resolvedCompanyId = await resolveCompanyUserId(pool, companyId);
  const [contracts] = await pool.query(
    'SELECT * FROM amc_contracts WHERE id = ? AND company_id = ?',
    [contractId, resolvedCompanyId]
  );
  if (contracts.length === 0) throw new Error('Contract not found.');

  const contract = contracts[0];
  if (contract.status === 'rejected' || contract.approval_status === 'rejected') {
    throw new Error('Cannot verify payment for a rejected contract offer.');
  }

  // Idempotency: avoid duplicate invoices on verification replays
  if (contract.payment_status === 'paid') {
    return {
      success: true,
      contractId,
      invoiceId: contract.invoice_id,
      paymentStatus: 'paid',
      status: contract.status
    };
  }

  const keySecret = config.razorpay?.keySecret;

  // Strict signature verification when real keys are configured
  if (keySecret && !keySecret.includes('YourKeySecret') && !keySecret.includes('demo')) {
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    const bufExpected = Buffer.from(expectedSignature, 'utf8');
    const bufReceived = Buffer.from(razorpaySignature || '', 'utf8');
    const isSignatureValid = bufExpected.length === bufReceived.length && crypto.timingSafeEqual(bufExpected, bufReceived);
    if (!isSignatureValid) {
      await pool.query('UPDATE payments SET status = "failed", error_message = "Invalid signature" WHERE order_id = ?', [razorpayOrderId]);
      await pool.query('UPDATE amc_contracts SET payment_status = "failed" WHERE id = ?', [contractId]);
      throw new Error('Payment signature verification failed.');
    }
  }

  // Update payment record
  await pool.query(`
    UPDATE payments 
    SET payment_id = ?, status = 'paid', verification_status = 'verified', verified_at = CURRENT_TIMESTAMP
    WHERE order_id = ?
  `, [razorpayPaymentId, razorpayOrderId]);

  // Create commercial invoice
  const [profiles] = await pool.query('SELECT company_name FROM company_profiles WHERE user_id = ?', [resolvedCompanyId]);
  const [users] = await pool.query('SELECT name FROM users WHERE id = ?', [resolvedCompanyId]);
  const clientName = profiles[0]?.company_name || users[0]?.name || 'Corporate Client';
  const invoiceId = await generateInvoiceId(pool);

  await pool.query(`
    INSERT INTO invoices (
      id, user_id, client_name, amount, subtotal, tax_amount, currency, invoice_date, due_date, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Paid', ?)
  `, [
    invoiceId, resolvedCompanyId, clientName,
    contract.total_amount, contract.price, contract.tax_amount || 0,
    contract.currency || 'INR', `AMC Contract Payment: ${contract.contract_number} (${contract.plan_name})`
  ]);

  await pool.query(`
    INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total, tax_amount)
    VALUES (?, ?, 1, ?, ?, ?)
  `, [invoiceId, `AMC Plan: ${contract.plan_name} (${contract.device_capacity} Devices)`, contract.price, contract.price, contract.tax_amount || 0]);

  // Update contract
  const shouldActivate = contract.approval_status === 'approved';
  const start = contract.start_date ? formatDateOnly(contract.start_date) : formatDateOnly(new Date());
  const end = contract.end_date ? formatDateOnly(contract.end_date) : formatDateOnly(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

  await pool.query(`
    UPDATE amc_contracts
    SET payment_status = 'paid', invoice_id = ?, status = ?, start_date = ?, end_date = ?
    WHERE id = ?
  `, [invoiceId, shouldActivate ? 'active' : (contract.status === 'offered' ? 'accepted' : contract.status), start, end, contractId]);

  if (shouldActivate) {
    await pool.query(`
      UPDATE amc_covered_devices
      SET coverage_start_date = ?, coverage_end_date = ?
      WHERE contract_id = ? AND status = 'active'
    `, [start, end, contractId]);
  }

  await pool.query(`
    INSERT INTO amc_contract_history (contract_id, action, performed_by, details)
    VALUES (?, 'PAYMENT_VERIFIED', ?, ?)
  `, [contractId, userId || null, JSON.stringify({ razorpayPaymentId, razorpayOrderId, invoiceId, amount: contract.total_amount, activated: shouldActivate })]);

  // Notify admin & company
  await sendAmcNotification({
    role: 'admin',
    title: `AMC Payment Verified (${contract.contract_number})`,
    message: `Payment of ₹${contract.total_amount} verified for contract ${contract.contract_number} (${contract.plan_name}). Invoice ${invoiceId} generated.`
  });
  await sendAmcNotification({
    userId: resolvedCompanyId,
    title: `Payment Receipt: AMC Contract ${contract.contract_number}`,
    message: `Your payment of ₹${contract.total_amount} was successfully verified. Invoice ${invoiceId} is generated.${shouldActivate ? ' Your AMC coverage is now ACTIVE.' : ' Contract is awaiting final admin approval.'}`
  });

  return {
    success: true,
    contractId,
    invoiceId,
    paymentStatus: 'paid',
    status: shouldActivate ? 'active' : contract.status
  };
};

/**
 * 18. Initiate Contract Offline Payment (Bank Transfer / NEFT / Cheque)
```

#### Columns of `payments` Table Used During AMC Payments
| Column Name | Order Creation Value | Verification Update Value |
|---|---|---|
| `order_id` | Gateway order ID (`order_...` or fallback `order_amc_...`) | Matched in WHERE clause |
| `user_id` | `userId` (Authenticated user ID) | Preserved |
| `company_id` | `resolvedCompanyId` (Company user ID) | Preserved |
| `amount` | `contract.total_amount` | Preserved |
| `currency` | `contract.currency` (e.g. `"INR"`) | Preserved |
| `status` | `"created"` | Updated to `"paid"` (or `"failed"` if invalid) |
| `gateway` | `"razorpay"` | Preserved |
| `reference_note` | `"AMC Contract: " + contract.contract_number` | Preserved |
| `payment_id` | `NULL` | Updated to `razorpayPaymentId` |
| `verification_status` | `NULL` | Updated to `"verified"` |
| `verified_at` | `NULL` | Updated to `CURRENT_TIMESTAMP` |
| `ticket_id` | `NULL` (unused for AMC) | `NULL` |
| `invoice_id` | `NULL` (unused in payments table for AMC) | `NULL` (invoice is saved in `amc_contracts.invoice_id`) |

### 4. Everything Depending on a Company Already Existing Before Payment

The current architecture strictly enforces that a company user account and profile exist prior to initiating any AMC payment:

1. **Database Foreign Key Constraints:**
   - `amc_contracts.company_id REFERENCES users(id) ON DELETE CASCADE`
   - `amc_contracts.request_id REFERENCES amc_requests(id) ON DELETE SET NULL` (and `amc_requests.company_id REFERENCES users(id)`)
   - `payments.company_id REFERENCES users(id) ON DELETE SET NULL`
   - `invoices.user_id REFERENCES users(id) ON DELETE CASCADE`
   - `amc_covered_devices.company_id REFERENCES users(id) ON DELETE CASCADE`
   - `amc_covered_devices.device_id REFERENCES company_devices(id) ON DELETE RESTRICT`

2. **Route Authorization Middleware:**
   - All AMC company endpoints (`/api/amc/company/*`) are guarded by `authenticate, authorize("company")`.
   - A visitor cannot create a payment order or verify a payment without an active bearer token having `role = "company"`.

3. **Service Logic Dependencies:**
   - `createContractPaymentOrder` explicitly verifies: `SELECT * FROM amc_contracts WHERE id = ? AND company_id = ?`. If no pre-existing contract exists for that company user, it throws `Contract not found.`
   - Contract number allocation (`allocateSequentialContractNumber`) requires `company_id` to determine company sequence (`AMC-CMP-001-001`).
   - Invoice generation inside `verifyContractPayment` queries `company_profiles WHERE user_id = ?` to populate `client_name`.

### 5. Public Route Definitions & How Public Pages Call the API

#### Frontend Public Route Definitions (`client/src/App.tsx`, lines 180–208)
Wrapped in `PublicLayout` and `ErrorBoundary`:
- `/` — `HomePage` (`ROUTES.HOME`)
- `/about` — `AboutPage` (`ROUTES.ABOUT`)
- `/billing/pay` and `/billing/pay/:invoiceId` — `PaymentPage` (`ROUTES.BILLING_PAY`)
- `/contact` — `Contact` (`ROUTES.CONTACT`)
- `/repair` — `RepairBooking` (`ROUTES.REPAIR`)
- `/faq` — `FAQPage` (`ROUTES.FAQ`)
- `/track` — `ServiceTracker` (`ROUTES.REPAIR_STATUS`)
- `/services` — `ServicesPage` (`ROUTES.SERVICES`)
- `/shop` and `/shop-v2` — `ShopPage` (`ROUTES.SHOP`)
- `/protocol` — `RepairProtocolPage` (`ROUTES.PROTOCOL`)
- `/verify-certificate` and `/verify-certificate/:code` — `AmcCertificateVerification` (`ROUTES.VERIFY_CERTIFICATE`)
- `/amc` — `AmcPage` (`ROUTES.AMC`)
- `/privacy` and `/terms` — Legal pages

#### Backend Public Route Definitions (`server/server.js`)
- `GET /api/amc/plans` (defined in `server/routes/amc.routes.js:25` without auth middleware)
- `GET /api/amc/public/verify-certificate/:code` (defined in `server/routes/amc.routes.js:28` with `certVerifyLimiter` only)
- `GET /api/public/*` (content, testimonials, FAQs, team in `server/routes/public.routes.js`)
- `POST /api/auth/signin`, `POST /api/auth/signup`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- `POST /api/company/register` (in `server/routes/company.routes.js:61`)
- `POST /api/contact` (in `server/routes/contact.routes.js`)
- `POST /api/billing/webhook` (in `server/routes/billing.routes.js:65`)

#### How a Public (No-Login) Page Calls the API
- In `client/src/services/api.ts`, API functions call `safeFetch(url, options)`.
- When no token is passed, `options.headers` omits the `Authorization: Bearer <token>` header.
- Example from `amcApi.getPublicPlans`:
  ```typescript
  getPublicPlans: async (): Promise<SafeResponse<any[]>> => {
    return safeFetch<any[]>(getUrl(ENDPOINTS.AMC.PLANS), {
      method: 'GET',
    });
  }
  ```
- The server allows the request to proceed because the route is registered before or without `authenticate` middleware.

=== UNVERIFIED / COULD NOT FIND ===

The following items were checked across the entire repository. Rather than guessing, their factual verified status is recorded below:

1. **Dynamic Bank Details in Database / Site Settings: [UNVERIFIED / COULD NOT FIND]**
   No setting key exists in `site_settings` or `server/config/app.config.js` for TekDoctor's bank account number, bank name, or IFSC code. All bank transfer information shown to companies is hardcoded in frontend JSX files (`CompanyAmcManagement.tsx:1804`, `PaymentPage.tsx:701`, `PaymentMethodModal.tsx:403`).

2. **Automated AMC Payment Reconciliation in Razorpay Webhook: [UNVERIFIED / COULD NOT FIND]**
   No code path exists connecting `POST /api/billing/webhook` to `amc_contracts`. `processAuthoritativePaymentSettlement` has zero queries or updates for AMC contracts or covered devices.

3. **Company Registration Approval Workflow: [UNVERIFIED / COULD NOT FIND]**
   No `is_verified`, `status`, or approval columns exist on `company_profiles` or `users` (role="company"). Newly registered companies receive active status (`is_active = 1`) and a valid JWT immediately upon completing `/api/company/register`.

4. **Public Instant AMC Checkout API: [UNVERIFIED / COULD NOT FIND]**
   No endpoint exists for an unauthenticated user to directly purchase an AMC plan, select devices, and checkout in a single flow. The public `/amc` page only contains static marketing cards linking to the company registration page.

