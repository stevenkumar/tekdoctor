# PROJECT_CONTEXT.md — TekDoctor Source of Truth

> **Last verified**: 2026-09-30  
> **Verified against**: Current working codebase (client + server)  
> **Rule**: If this document conflicts with actual code, trust the code. Update this file after confirmed changes.

---

## 1. Project Overview

**TekDoctor** is a device repair and service management platform with five distinct portals:

1. **Public Website** — Landing pages, repair booking, service tracking, contact, FAQ, shop
2. **Customer Dashboard** — Profile, repair history, billing, payment, service tracker
3. **Admin Dashboard** — Full management: tickets, technicians, customers, companies, settings, reports
4. **Technician Dashboard** — Assigned tasks, diagnosis and estimate, task transfers, work logs
5. **Company/B2B Dashboard** — Branches, employees, devices, bulk repairs, messages, billing

**Architecture**: Monorepo with two independent npm projects:
- **Frontend** (`client/`) — React 19 + Vite + TypeScript + TailwindCSS v4
- **Backend** (`server/`) — Express.js + MySQL (mysql2) + JWT auth

---

## 2. Technology Stack

### Frontend (`client/`)
| Technology | Version | Purpose |
|---|---|---|
| React | 19.2.6 | UI framework |
| Vite | 8.0.12 | Build tool + dev server |
| TypeScript | ~6.0.2 | Type safety |
| TailwindCSS | 4.3.0 | Styling (via `@tailwindcss/vite` plugin) |
| React Router | 7.16.0 | Client-side routing |
| Framer Motion | 12.40.0 | Animations |
| Recharts | 3.9.2 | Charts/dashboards |
| Lucide React | 1.17.0 | Icons |
| react-hot-toast | 2.6.0 | Toast notifications |
| html2pdf.js | 0.14.0 | PDF bill/receipt generation |

### Backend (`server/`)
| Technology | Version | Purpose |
|---|---|---|
| Express | 4.21.1 | HTTP server |
| mysql2 | 3.11.4 | MySQL driver (connection pool) |
| jsonwebtoken | 9.0.2 | JWT auth |
| bcryptjs | 2.4.3 | Password hashing |
| helmet | 8.0.0 | Security headers |
| express-rate-limit | 7.4.1 | Rate limiting |
| express-validator | 7.2.0 | Input validation |
| multer | 1.4.5-lts.1 | File uploads |
| nodemailer | 9.0.3 | Transactional emails |
| winston | 3.17.0 | Logging |
| morgan | 1.10.0 | HTTP request logging |
| compression | 1.8.1 | Response compression |
| google-auth-library | 11.0.2 | Google OAuth |
| uuid | 14.0.1 | UUID generation |
| cors | 2.8.5 | CORS handling |
| dotenv | 16.4.5 | Environment variables |

---

## 3. Monorepo Scripts

### Root `package.json`
```
dev:backend   -> npm run dev --prefix server
dev:frontend  -> npm run dev --prefix client
build         -> npm run build --prefix client
start:backend -> npm run start --prefix server
dev           -> concurrently "npm run dev:backend" "npm run dev:frontend"
```

### Server (`server/`)
```
dev   -> nodemon server.js
start -> node server.js
```

### Client (`client/`)
```
dev     -> vite (port 3000, strictPort)
build   -> tsc -b && vite build -> dist/
lint    -> eslint .
preview -> vite preview
```

---

## 4. Database Schema

**Engine**: MySQL/MariaDB — raw SQL via mysql2 connection pool, no ORM.

**Auto-initialization**: On startup (`db.init.js`), tables are created if missing, columns are added via `ALTER TABLE` (idempotent), and seed data is inserted. In production, `DB_AUTO_INIT=true` must be set explicitly.

### Tables (17+ total)

| Table | Purpose | Key Relationships |
|---|---|---|
| `users` | All user accounts (customer, technician, admin, company) | Central identity table |
| `service_requests` | Repair tickets — the core business entity | FK -> users (user_id, assigned_technician_id, pending_technician_id, company_id), FK -> company_employees, FK -> company_devices |
| `repair_form_drafts` | Saved repair form drafts (draft_id PK) | Standalone |
| `contacts` | Contact form submissions | Standalone |
| `invoices` | Financial invoices (VARCHAR PK like INV-001) | FK -> users |
| `invoice_line_items` | Line items per invoice | FK -> invoices |
| `notifications` | In-app notifications | FK -> users (user_id, sender_id), FK -> service_requests (ticket_id) |
| `company_profiles` | B2B company metadata | FK -> users (user_id), has company_id (CMP-xxx) |
| `company_branches` | Company branch offices | FK -> users (company_id) |
| `company_employees` | Company staff records | FK -> users (company_id), FK -> company_branches |
| `company_devices` | Company-owned device inventory | FK -> users (company_id), FK -> company_branches, FK -> company_employees |
| `messages` | Direct messaging between users | FK -> service_requests, FK -> users (sender_id, receiver_id) |
| `quotations` | B2B quotation documents (VARCHAR PK like QT-001) | FK -> users (company_id), FK -> service_requests |
| `testimonials` | Customer reviews | FK -> users |
| `technician_work_logs` | Technician repair progress logs | FK -> service_requests, FK -> users |
| `task_transfers` | Ticket transfer history between technicians | FK -> service_requests, FK -> users (from, to, initiated_by) |
| `payments` | Payment transactions (Razorpay + offline) | FK -> service_requests (ticket_id), FK -> invoices, FK -> users |
| `activity_logs` | System-wide audit trail | FK -> users |
| `site_settings` | Admin-configurable site settings (key/value) | Standalone |
| `homepage_content` | CMS-managed homepage sections | Standalone |
| `app_sequences` | Concurrency-safe sequential ID counters | Standalone |

### Key `service_requests` Columns (comprehensive)
- **Identity**: `id`, `ticket_number` (unique, e.g., `TD1-01`), `submission_id`
- **Customer**: `user_id`, `customer_name`, `mobile`, `email`, `address`, `city`, `state`, `zip_code`
- **Device**: `device_category`, `custom_device_category`, `brand`, `custom_brand`, `model_number`, `serial_number`, `device_age`, `device_configuration`
- **Problem**: `problem_type`, `custom_problem_type`, `problem_description`, `customer_repair_description`
- **Service**: `service_type`, `custom_service_type`, `priority`, `preferred_contact_method`
- **Media**: `image_path`, `screenshot_path`
- **Status**: `status` (ENUM: pending, in_progress, completed, delivered, cancelled)
- **Assignment**: `assigned_technician_id`, `pending_technician_id`, `estimated_completion_date`
- **B2B**: `company_id`, `employee_id`, `device_id`
- **Diagnosis/Estimate**: `diagnosis`, `identified_issues`, `required_work`, `required_parts`, `estimated_cost`, `additional_charges`, `inspection_notes`, `device_condition`, `inspected_at`, `estimate_submitted_at`
- **Customer Approval**: `customer_approval_status` (none, pending_approval, approved, rejected, on_hold), `approved_at`, `approved_by`, `approval_notes`, `rejected_at`, `rejection_reason`
- **Hold**: `hold_start_date`, `hold_end_date`, `hold_reason`, `hold_notes`
- **Cancellation**: `cancellation_reason`, `cancelled_at`, `cancelled_by`
- **Payment**: `payment_status` (ENUM: unpaid, pending, pending_verification, paid, failed, refunded, rejected), `collection_status`, `payment_id`, `payment_order_id`, `payment_method`, `paid_at`
- **Charges**: `repair_cost`, `estimated_cost`, `additional_charges`, `amount_updated_by_admin`, `admin_updated_amount`, `amount_updated_at`, `reapproval_requested_at`, `reapproval_notes`
- **Feedback**: `feedback_rating`, `feedback_comment`, `feedback_date`
- **SLA**: `sla_deadline`
- **Repair**: `repair_notes`
- **Soft Delete**: `is_active`, `deactivated_at`, `deactivated_by`, `deactivation_reason`

### Key `users` Columns
- `id`, `name`, `email`, `password` (nullable for OAuth), `role` (ENUM: customer, technician, admin, company)
- `google_id`, `auth_provider`, `avatar_url`
- `phone`, `technician_id` (display ID), `company_id` (CMP-xxx)
- `is_active`, `token_version`, `deactivated_at`, `deactivated_by`, `deactivation_reason`

---

## 5. Authentication and Authorization

### Authentication
- **JWT Bearer tokens** in `Authorization: Bearer <token>` header
- **Token version**: Stored in both JWT payload and `users.token_version`. Mismatch = session invalidated (password change forces re-login)
- **Session storage**: Frontend uses `sessionStorage` (keys: `token`, `user`)
- **Google Sign-In**: OAuth via `google-auth-library`, creates/links user on first login
- **Password hashing**: bcryptjs (salt rounds: 12)

### Auth Middleware
| Middleware | Behavior |
|---|---|
| `authenticate` | Requires valid JWT. Checks `is_active` and `token_version` in DB. Blocks if invalid. |
| `optionalAuth` | Extracts user from JWT if present/valid, but allows request to proceed as guest otherwise. |
| `authorize(...roles)` | Requires `authenticate` first. Checks `req.user.role` against allowed roles. |

### Roles and Default Navigation
| Role | Login redirect | Portal |
|---|---|---|
| `customer` | `/profile` | Public pages + profile + billing |
| `technician` | `/technician/dashboard` | Technician area (uses AdminLayout) |
| `admin` | `/admin/dashboard` | Admin area |
| `company` | `/company/dashboard` | Company/B2B area |

### Default Admin Seed
- **Email**: `admin@tekdoctor.in`
- **Password**: `Admin@123`
- Only seeded in development if no admin exists

---

## 6. API Routes (Complete)

**Base prefix**: `/api` (configurable via `config.server.apiPrefix`)

### Auth (`/api/auth`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/signup` | Public (rate limited) | Register new user |
| POST | `/signin` | Public (rate limited) | Login |
| POST | `/google` | Public (rate limited) | Google OAuth login/register |
| POST | `/forgot-password` | Public (rate limited) | Send password reset email |
| POST | `/reset-password` | Public (rate limited) | Reset password with token |
| PUT | `/set-password` | Authenticated | Set password (for OAuth users) |
| POST | `/logout` | Authenticated | Invalidate session |
| PUT | `/profile` | Authenticated | Update name/phone |

### Repair Requests (`/api/repair-request`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | Optional auth | Create repair request (guest allowed) |
| GET | `/` | Admin, Technician | List all repair requests |
| GET | `/my-tasks` | Technician | Get assigned tasks |
| GET | `/history` | Authenticated | Get customer repair history |
| GET | `/track/:id` | Public | Track repair by ticket number |
| GET | `/receipt/ticket/:ticketId` | Optional auth | Get payment receipt |
| POST | `/draft/:draftId` | Optional auth | Save form draft |
| GET | `/draft/:draftId` | Optional auth | Load form draft |
| GET | `/:id` | Admin, Tech, Customer, Company | Get single repair request (ownership check) |
| PUT | `/:id/status` | Admin, Technician | Update ticket status |
| PUT | `/:id/cancel` | Authenticated | Cancel repair request |
| PUT | `/:id/charges` | Admin | Set/update repair charges |
| PUT | `/:id` | Admin | Full update repair request |
| PUT | `/:id/reactivate` | Admin | Reactivate deactivated ticket |
| DELETE | `/:id` | Admin | Soft-deactivate ticket |
| POST | `/bulk-delete` | Admin | Bulk soft-deactivate |
| POST | `/:id/notify` | Admin, Technician | Send notification to customer |
| GET | `/:id/work-logs` | Admin, Technician | Get work logs |
| POST | `/:id/work-logs` | Admin, Technician | Create work log entry |
| PUT | `/:id/customer-description` | Admin, Technician | Update customer description |
| POST | `/:id/milestones` | Admin, Technician | Send milestone notification |
| POST | `/:id/accept-assignment` | Technician | Accept ticket assignment |
| POST | `/:id/reject-assignment` | Technician | Reject ticket assignment |
| POST | `/:id/transfer` | Admin, Technician | Transfer ticket |
| GET | `/:id/transfers` | Admin, Technician | Get transfer history |
| GET | `/transfers/my-history` | Technician | Get technician transfer history |
| POST | `/:id/feedback` | Customer, Company | Submit feedback |
| POST | `/:id/diagnosis` | Admin, Technician | Submit diagnosis and estimate |
| POST | `/:id/approve-estimate` | Optional auth | Approve repair estimate |
| POST | `/:id/reject-estimate` | Optional auth | Reject repair estimate |
| POST | `/:id/request-repair-again` | Optional auth | Request repair again after rejection |
| POST | `/:id/hold` | Admin | Place ticket on hold |
| POST | `/:id/cancel-hold` | Admin | Cancel hold |

### Billing (`/api/billing`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/config` | Public | Get Razorpay key/config |
| GET | `/eligibility/:ticketId` | Optional auth | Check payment eligibility |
| POST | `/create-order` | Optional auth | Create Razorpay order |
| POST | `/verify-payment` | Optional auth | Verify Razorpay payment signature |
| POST | `/payment-failed` | Optional auth | Record failed payment |
| POST | `/webhook` | Public (raw body) | Razorpay webhook |
| POST | `/offline-payment` | Optional auth | Initiate offline payment (Cash/Bank/UPI) |
| POST | `/switch-payment-method` | Optional auth | Switch payment method |
| POST | `/record-cash-collected` | Technician, Admin | Record cash collection |
| POST | `/verify-offline-payment` | Admin | Verify/reject offline payment |
| GET | `/payments` | Authenticated | Payment transaction history |
| GET | `/receipt/ticket/:ticketId` | Optional auth | Download bill/receipt |
| GET | `/invoices` | Authenticated | List invoices (own or all for admin) |
| GET | `/invoices/:id` | Authenticated | Get single invoice |
| POST | `/invoices` | Admin, Technician | Create invoice |
| PUT | `/invoices/:id` | Admin, Technician | Update invoice |
| PUT | `/invoices/:id/reactivate` | Admin | Reactivate invoice |
| DELETE | `/invoices/:id` | Admin | Void/deactivate invoice |
| POST | `/pay` | Admin, Technician | Manual offline settlement |
| GET | `/quotations` | Admin, Tech, Company | List quotations |
| GET | `/quotations/:id` | Admin, Tech, Company | Get quotation |
| POST | `/quotations` | Admin, Technician | Create quotation |
| PUT | `/quotations/:id` | Admin, Technician | Update quotation |
| POST | `/quotations/:id/respond` | Company | Respond to quotation |

### Admin (`/api/admin`) — All routes require `admin` role
| Method | Path | Description |
|---|---|---|
| GET | `/dashboard-stats` | Dashboard KPI statistics |
| GET | `/customers` | List customers |
| PUT | `/customers/:id` | Update customer |
| PUT | `/customers/:id/reactivate` | Reactivate customer |
| DELETE | `/customers/:id` | Deactivate customer |
| GET | `/customers/:id/history` | Customer repair history |
| POST | `/users/:id/reset-password` | Reset any user password |
| GET | `/companies` | List companies |
| POST | `/companies` | Create company |
| POST | `/companies/bulk-import` | CSV bulk import |
| GET | `/companies/export` | Export companies CSV |
| GET | `/companies/stats` | Company statistics |
| GET | `/companies/devices` | All company devices |
| GET | `/companies/payments` | All company payments |
| GET | `/companies/invoices` | All company invoices |
| GET | `/companies/:id/detail` | Company details |
| GET | `/companies/:id/export` | Export single company |
| PUT | `/companies/:id` | Update company |
| PUT | `/companies/:id/status` | Toggle company status |
| DELETE | `/companies/:id` | Delete company |
| GET | `/companies/:id/messages` | Company messages |
| POST | `/companies/:id/messages` | Reply to company |
| PUT | `/companies/:id/messages/read` | Mark messages read |
| POST | `/tickets/bulk` | Bulk update tickets |
| PUT | `/tickets/:id/charges` | Set repair charges |
| GET | `/receipt/ticket/:ticketId` | Download receipt |
| GET | `/contacts` | List contact messages |
| DELETE | `/contacts/:id` | Delete contact |
| POST | `/contacts/bulk-delete` | Bulk delete contacts |
| POST | `/contacts/:id/reply` | Reply to contact |
| GET | `/settings` | Get site settings |
| PUT | `/settings` | Update site settings |
| POST | `/settings/test-email` | Test email config |
| GET | `/homepage` | Get homepage content |
| PUT | `/homepage/section/:section` | Update section |
| PUT | `/homepage/:id` | Update content by ID |
| POST | `/upload` | Upload file |
| GET | `/activity-logs` | Get activity logs |
| GET | `/task-transfers` | Get all task transfers |
| GET | `/reports` | Reports and analytics |
| PUT | `/profile` | Update admin profile |
| PUT | `/change-password` | Change password |

### Technicians (`/api/technicians`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Admin, Technician | List technicians |
| PUT | `/profile` | Technician | Update own profile |
| PUT | `/change-password` | Technician | Change own password |
| POST | `/` | Admin | Create technician |
| PUT | `/:id` | Admin | Update technician |
| PATCH/PUT | `/:id/toggle-status` | Admin | Activate/deactivate |
| PUT | `/:id/reactivate` | Admin | Reactivate |
| POST | `/:id/reset-password` | Admin | Reset password |
| GET | `/:id/workload` | Admin | Get workload |
| DELETE | `/:id` | Admin | Delete technician |

### Company (`/api/company`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | Public | Register company account |
| GET/PUT | `/profile` | Company, Admin | Get/update company profile |
| GET | `/stats` | Company, Admin | Stats overview |
| CRUD | `/branches` | Company, Admin | Branch management |
| CRUD | `/employees` | Company, Admin | Employee management |
| CRUD | `/devices` | Company, Admin | Device management |
| GET | `/devices/:id/history` | Company, Admin | Device repair history |
| GET/POST | `/repairs` | Company, Admin | Repair requests |
| GET/POST | `/messages` | Company, Admin | Messaging |
| POST | `/bulk-*` | Company, Admin | Bulk CSV imports (employees, branches, devices, requests) |
| GET | `/*/export` | Company, Admin | CSV exports |
| GET | `/activity-logs` | Company, Admin | Activity logs |

### Notifications (`/api/notifications`) — All authenticated
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Authenticated | Get user notifications |
| PUT | `/:id/read` | Authenticated | Mark notification read |
| DELETE | `/:id` | Authenticated | Delete notification |
| DELETE | `/` | Authenticated | Clear all notifications |
| POST | `/send` | Admin, Technician | Send notification |
| POST | `/broadcast` | Admin | Broadcast notification |
| GET | `/history` | Admin | Notification history |
| POST | `/bulk-delete` | Admin | Bulk delete |

### Public (`/api/public`)
| Method | Path | Description |
|---|---|---|
| GET | `/site-data` | Get site settings + homepage content |
| GET | `/pincode/:pincode` | Pincode-to-location lookup |

### Contact (`/api/contact`)
| Method | Path | Description |
|---|---|---|
| POST | `/` | Submit contact form (rate limited) |

### Testimonials (`/api/testimonials`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Approved testimonials |
| POST | `/` | Authenticated | Submit testimonial |
| GET | `/admin` | Admin | All testimonials |
| PUT | `/:id/approve` | Admin | Approve testimonial |
| PUT | `/:id` | Admin | Edit testimonial |
| DELETE | `/:id` | Admin | Delete testimonial |

---

## 7. Frontend Architecture

### Routing Structure (`App.tsx`)

**Layouts**:
- `PublicLayout` — Navbar + Footer for all public pages
- `AdminLayout` — Sidebar + topbar for admin AND technician portals
- `CompanyLayout` — Sidebar + topbar for company B2B portal

**Route Guards**:
- `ProtectedAdminRoute` — Requires `admin` role
- `ProtectedTechnicianRoute` — Requires `technician` role
- `ProtectedCompanyRoute` — Requires `company` role

### Frontend Route Map

**Public Routes** (via `PublicLayout`):
| Path | Component |
|---|---|
| `/` | `HomePage` |
| `/about` | `AboutPage` |
| `/services` | `ServicesPage` |
| `/contact` | `Contact` |
| `/faq` | `FAQPage` |
| `/repair` | `RepairBooking` |
| `/repair/status` | `ServiceTracker` |
| `/shop` | `ShopPage` |
| `/shop/v2` | `ShopV2Page` |
| `/protocol` | `RepairProtocolPage` |
| `/profile` | `ProfilePage` |
| `/billing` | `BillingPage` |
| `/billing/pay` | `PaymentPage` |
| `/billing/pay/:invoiceId` | `PaymentPage` |
| `/auth/signin` | `SignIn` |
| `/auth/signup` | `SignUp` |
| `/auth/forgot-password` | `ForgotPassword` |
| `/auth/reset-password` | `ResetPassword` |

**Admin Routes** (via `AdminLayout` + `ProtectedAdminRoute`):
| Path | Component |
|---|---|
| `/admin/dashboard` | `DashboardOverview` |
| `/admin/tickets` | `RepairTickets` |
| `/admin/transfers` | `TaskTransfers` |
| `/admin/technicians` | `TechnicianManagement` |
| `/admin/customers` | `CustomerManagement` |
| `/admin/companies` | `CompanyManagementDashboard` |
| `/admin/notifications` | `NotificationCenter` |
| `/admin/contacts` | `ContactMessages` |
| `/admin/website-settings` | `WebsiteSettings` |
| `/admin/reviews` | `ReviewsManagement` |
| `/admin/email-settings` | `EmailSettings` |
| `/admin/reports` | `ReportsAnalytics` |
| `/admin/activity-logs` | `ActivityLogs` |
| `/admin/profile` | `AdminProfile` |

**Technician Routes** (via `AdminLayout` + `ProtectedTechnicianRoute`):
| Path | Component |
|---|---|
| `/technician/dashboard` | `TechnicianDashboard` |
| `/technician/assigned-tickets` | `TechnicianDashboard` |
| `/technician/transfers` | `TechnicianDashboard` |
| `/technician/diagnosis` | `TechnicianDashboard` |
| `/technician/in-progress` | `TechnicianDashboard` |
| `/technician/completed` | `TechnicianDashboard` |
| `/technician/delivered` | `TechnicianDashboard` |
| `/technician/notifications` | `TechnicianDashboard` |
| `/technician/profile` | `AdminProfile` |

> **Note**: All technician sub-routes render `TechnicianDashboard`, which uses the current path internally to determine which view/tab to show. The `TechnicianDashboard.tsx` is a single 185KB monolith component handling all technician views.

**Company Routes** (via `CompanyLayout` + `ProtectedCompanyRoute`):
| Path | Component |
|---|---|
| `/company/dashboard` | `CompanyDashboard` |
| `/company/branches` | `CompanyBranches` |
| `/company/employees` | `CompanyEmployees` |
| `/company/devices` | `CompanyDevices` |
| `/company/repairs` | `CompanyRepairs` |
| `/company/profile` | `CompanyProfile` |
| `/company/messages` | `CompanyMessages` |
| `/company/billing` | `CompanyBilling` |
| `/company/activity-logs` | `CompanyActivityLogs` |

### Context Providers
| Provider | File | Purpose |
|---|---|---|
| `AuthProvider` | `context/AuthContext.tsx` | User auth state, login/logout, role check, token management. Uses `sessionStorage`. |
| `SiteProvider` | `context/SiteContext.tsx` | Dynamic site settings + homepage content from `/api/public/site-data`. Applies theme CSS variables. |
| `CompanyContext` | `context/CompanyContext.tsx` | Company-specific state for the B2B portal. |

### Services Layer
| File | Purpose |
|---|---|
| `services/api.ts` (82KB) | Centralized API client. Contains all API call functions organized by domain (authApi, repairApi, billingApi, adminApi, technicianApi, companyApi, publicApi, etc.). Uses fetch with `appConfig.apiUrl` prefix. |
| `utils/api.ts` (5KB) | Low-level fetch wrapper with auth header injection |
| `utils/billGenerator.ts` | PDF bill/receipt generation using html2pdf.js |
| `utils/currencyUtils.ts` | INR currency formatting utilities |
| `utils/payment.ts` | Payment helper functions |
| `utils/phoneUtils.ts` | Phone number validation and formatting |
| `utils/activityFormatter.ts` | Activity log display formatting |
| `utils/media.ts` | Media/image URL helpers |

### Key Reusable Components
| Component | File Size | Purpose |
|---|---|---|
| `AdminTicketWorkspace` | 109KB | Admin full ticket detail/edit workspace |
| `TechnicianTaskWorkspace` | 110KB | Technician task detail/action workspace |
| `RepairTicketWorkspace` | 60KB | Shared repair ticket workspace (customer-facing) |
| `PaymentMethodModal` | 25KB | Payment method selection (Razorpay, Cash, Bank, UPI) |
| `PaymentReceiptModal` | 22KB | Receipt/bill viewing |
| `CustomerFeedbackModal` | 10KB | Feedback collection modal |
| `DeviceRepairHistoryModal` | 21KB | Device history viewer |
| `TechnicianPerformanceModal` | 12KB | Performance stats modal |
| `RepairStepProgress` | 10KB | Visual repair progress tracker |
| `PhoneInput` | 9KB | International phone input with country code |
| `ConfirmModal` | 3KB | Reusable confirmation dialog |
| `PromptModal` | 4KB | Reusable text prompt dialog |
| `SideDrawer` | 6KB | Reusable slide-out drawer |
| `ImagePreviewModal` | 4KB | Image preview lightbox |
| `FeedbackWidget` | 36KB | Inline feedback widget |
| `GoogleSignInButton` | 7KB | Google OAuth button |
| `SocialIcons` | 4KB | Social media icon links |
| `TitleManager` | 5KB | Dynamic page title management |
| `ScrollToTop` | <1KB | Scroll to top on navigation |

### Shared UI Components (`client/src/component/`)
| Component | Purpose |
|---|---|
| `Navbar.tsx` (28KB) | Public navigation bar |
| `Footer.tsx` (4KB) | Public footer |
| `ScrollToTop.tsx` | Scroll restoration |

---

## 8. Design System and Theming

### CSS Architecture
- **TailwindCSS v4** with `@tailwindcss/vite` plugin (no `tailwind.config.js`)
- **Theme tokens** defined in `@theme` block in `index.css`
- **Google Font**: Outfit (weights 100-900)
- **Dark mode only** — background `#050505`, foreground `#ffffff`

### Core Design Tokens
```css
--color-neon-cyan: #00f2ff     /* Primary accent — admin-configurable */
--color-neon-teal: #008c9e     /* Secondary accent — admin-configurable */
--color-dark-bg: #050505       /* Base background */
--color-border-subtle: #1c1c22
--color-border-subtle-hover: #2a2a33
--color-border-subtle-card: #16161a
--color-zinc-850: #1a1a20      /* Dark card backgrounds */
--color-zinc-750: #2d2d35
--color-zinc-650: #484852
--color-zinc-550: #666673
```

### Dynamic Theme System
- Admin can change `theme_primary_color` and `theme_secondary_color` via site settings
- `SiteContext` applies these dynamically to CSS variables on `document.documentElement`
- Scrollbars, borders, glows all respond to `--neon-cyan` / `--neon-cyan-rgb`

### CSS Utility Classes
- `.neon-border` — Subtle neon border with hover effect
- `.btn-neon` — Neon-styled button
- `.neon-text` — Neon cyan text color
- `.card-neon` — Dark card with subtle border
- `.border-subtle`, `.border-subtle-hover`, `.border-subtle-card`
- `.standard-padding` — Consistent page spacing
- `.scrollbar-thin`, `.custom-modal-scrollbar` — Styled scrollbars

---

## 9. Repair Ticket Lifecycle

```
Customer/Company submits repair request
  |
  v
Ticket created (status: pending, ticket_number assigned)
  |
  v
Admin assigns technician (pending_technician_id set)
  |
  v
Technician accepts assignment (assigned_technician_id set)
  OR Technician rejects assignment (pending_technician_id cleared)
  |
  v
Technician performs diagnosis
  |
  v
Technician submits estimate (diagnosis, estimated_cost, etc.)
  -> customer_approval_status -> pending_approval
  |
  v
Customer/Company approves estimate
  -> customer_approval_status -> approved
  -> status -> in_progress
  OR
Customer/Company rejects estimate
  -> customer_approval_status -> rejected
  -> Customer can request repair again (re-submits for re-diagnosis)
  |
  v
Technician performs repair (work logs, milestones)
  |
  v
Repair completed (status: completed)
  |
  v
Payment required (Razorpay online, Cash, Bank Transfer, Offline UPI)
  -> payment_status transitions: unpaid -> pending -> paid
  -> For offline: unpaid -> pending_verification -> paid (after admin verification)
  -> For cash: collection_status: pending_collection -> collected
  |
  v
Device delivered (status: delivered)
  |
  v
Customer submits feedback (feedback_rating, feedback_comment)
```

### Special States
- **On Hold**: Admin can place ticket on hold (hold_start_date, hold_end_date, hold_reason). Auto-expires via `hold.scheduler.js`.
- **Cancelled**: Customer/Company/Admin can cancel with reason.
- **Soft Delete**: `is_active = false` with audit trail (deactivated_at, deactivated_by, deactivation_reason).
- **Reactivation**: Admin can reactivate soft-deleted tickets.

---

## 10. Payment System

### Payment Methods
| Method | Gateway | Flow |
|---|---|---|
| Online (Card/UPI/Netbanking) | Razorpay | create-order -> Razorpay checkout -> verify-payment |
| Cash | Offline | initiate offline -> technician/admin records collection -> admin verifies |
| Bank Transfer | Offline | initiate offline -> customer transfers -> admin verifies |
| Offline UPI | Offline | initiate offline -> customer pays -> admin verifies |

### Payment Tables
- `payments` table tracks all transactions with `gateway_response` JSON for Razorpay data
- `service_requests` has mirrored payment columns (`payment_status`, `payment_method`, `payment_id`, `paid_at`, etc.)

### Key Payment Rules
- All monetary values in **INR (Rs.)**
- Offline payment references are NOT gateway transaction IDs
- Admin verification required for all offline payments
- Payment method switching supported (e.g., cash -> online)
- Razorpay webhook provides async backup verification

---

## 11. Notification System

- In-app notifications via `notifications` table
- Supports `user_id`, `ticket_id`, `sender_id` for context
- Admin can broadcast to all users
- Admin/technician can send targeted notifications
- 3-month auto-retention (older notifications deleted by `retention.scheduler.js`)

---

## 12. Security Implementation

### Middleware Stack (applied in order in `server.js`)
1. `helmet()` — Security headers (CSP in production)
2. `compression()` — Response compression
3. `cors()` — Origin-based CORS with credentials
4. `express.raw()` for webhook endpoint (before JSON parser)
5. `express.json()` — Body parsing (10MB limit)
6. `preventPrototypePollution` — Blocks `__proto__`, `constructor`, `prototype` in payloads
7. `sanitizeRequestPayload` — Strips dangerous content
8. `morgan` — HTTP request logging
9. `globalLimiter` — Rate limiting (500 req/15min production, 5000 dev)

### Rate Limiting
| Scope | Window | Max (prod) | Max (dev) |
|---|---|---|---|
| Global | 15 min | 500 | 5000 |
| Auth | 15 min | 15 | 1000 |
| Contact | 15 min | 5 | 100 |

### Security Middleware (`security.middleware.js`)
- `verifyUploadSignatures` — Validates uploaded file types match extensions
- `stripProtectedFields` — Removes sensitive fields from request body (prevents status/cost/assignment tampering)

### IDOR Protection
- Technicians can only access tickets assigned to them (`getMyTasks`, `getRepairRequestById` ownership checks)
- Customers can only access their own tickets and invoices
- Companies can only access their own data (company_id check)

---

## 13. Background Schedulers

| Scheduler | File | Purpose |
|---|---|---|
| `hold.scheduler.js` | `server/utils/` | Auto-expires ticket holds past `hold_end_date` |
| `retention.scheduler.js` | `server/utils/` | Auto-deletes notifications (>3 months) and contact messages (>6 months) |

---

## 14. Email System

- **Transport**: nodemailer with Gmail app password OR configurable SMTP
- **Config**: `EMAIL_USER`, `EMAIL_PASS` in `.env`, or per-setting SMTP config in site_settings
- **Used for**: Password reset, ticket notifications, contact form replies, milestone updates, test emails

---

## 15. File Upload System

### Upload Paths
```
uploads/
  logo/           -> Site logo
  favicon/        -> Site favicon
  users/          -> User avatars
  companies/      -> Company logos
  technicians/    -> Technician files
  repairs/
    images/       -> Device photos
    screenshots/  -> Error screenshots
    videos/       -> Repair videos
```

### Upload Rules
- Max size: 5MB (configurable via `UPLOAD_MAX_SIZE_MB`)
- Allowed types: JPEG, JPG, PNG, WebP
- Served at `/uploads/*` via Express static middleware
- Legacy path normalization: `/uploads/device-images/` -> `/uploads/repairs/images/`

---

## 16. Ticket Number System

- **Format**: Per-account sequential IDs (e.g., `TD1-01`, `TD-C2-03`, `TD-AMC-C1-05`)
- **Authoritative source**: Backend/database (`ticket_number` column)
- **Sequence table**: `app_sequences` for concurrency-safe ID generation
- **Migration script**: `server/scripts/migrate-per-account-ticket-ids.js` — auto-runs on startup if unmigrated tickets exist
- **Rule**: Frontend must NEVER generate or reformat ticket IDs

---

## 17. Validation Rules

### Backend Validation (`validate.middleware.js` — 39KB)
- Express-validator based with detailed error messages
- Covers: auth, repair requests, contacts, invoices, diagnosis, work logs, transfers, company operations, profiles

### Client Validation (`config/constants.ts`)
- Names: 2-50 characters
- Messages/descriptions: 10-500 characters
- Passwords: Min 8 chars, 1 uppercase, 1 number
- Email: Standard format validation
- Phone: International format with country code support

---

## 18. Tests

Located in `server/tests/` (10 verification scripts, no test framework):

| Test | Purpose |
|---|---|
| `verify-api-idempotency.js` | Duplicate submission prevention |
| `verify-document-ui-contracts.js` | UI/API contract alignment |
| `verify-estimate-sync.js` | Estimate data synchronization |
| `verify-guest-onboarding.js` | Guest user repair booking flow |
| `verify-offline-payments.js` | Offline payment workflow |
| `verify-payment-switching.js` | Payment method switching |
| `verify-repair-budget-input.js` | Budget/cost input validation |
| `verify-technician-isolation.js` | IDOR protection for technicians |
| `verify-technician-universal-search.js` | Technician search functionality |
| `verify-ticket-system.js` | Ticket numbering system |

---

## 19. Deployment

### Primary Target: cPanel/Passenger
- Express serves SPA + API from domain root
- `NODE_ENV=production`, `HOST=0.0.0.0`
- `FRONTEND_BUILD_PATH` points to `public_html`
- `PORT=5000` is internal Passenger socket only
- Startup file: `server.js`
- Passenger detection: Auto-checks for `PASSENGER_APP_TYPE` env var

### Alternative: VPS (PM2 + Nginx)
- PM2 manages Express process
- Nginx reverse-proxies `/api` and `/uploads`
- Nginx serves static SPA with `try_files`

### Production Safeguards (in `app.config.js`)
- JWT_SECRET must be >= 32 chars
- CORS_ORIGIN must not be `*`
- CORS_ORIGIN must be explicitly set
- DB_USER and DB_NAME must be set
- FRONTEND_URL must be a real https:// domain (not localhost)
- Passenger without `NODE_ENV=production` throws at startup

---

## 20. File Patterns Reference

| Pattern | Purpose |
|---|---|
| `server/controllers/*.controller.js` | Route handlers (business logic) |
| `server/routes/*.routes.js` | Express route definitions |
| `server/middleware/*.middleware.js` | Auth, validation, rate limiting, errors, security |
| `server/utils/*.js` | Logger, email, helpers, activity logging, schedulers |
| `server/config/*.config.js` | Centralized config (app, db, multer) |
| `server/models/db.init.js` | Schema creation + seeding + migrations |
| `server/scripts/*.js` | One-off migration scripts |
| `server/tests/*.js` | Verification/test scripts |
| `client/src/pages/**/*.tsx` | Page components (route targets) |
| `client/src/components/*.tsx` | Reusable UI components |
| `client/src/component/*.tsx` | Shared layout components (Navbar, Footer) |
| `client/src/context/*.tsx` | React Context providers |
| `client/src/config/*.ts` | Constants, routes, API config, storage keys |
| `client/src/services/api.ts` | Centralized API client |
| `client/src/utils/*.ts` | Client utility functions |
| `client/src/layouts/*.tsx` | Page layouts (Public, Admin, Company) |
| `client/src/data/*.ts` | Static data files |

---

## 21. Known Architecture Notes

1. **TechnicianDashboard** is a single 185KB monolith — all sub-routes render the same component, which determines the current view from the URL path internally.
2. **No ORM** — all database operations use raw SQL via mysql2 pool.
3. **No migration tool** — schema changes via `ALTER TABLE` in `db.init.js` (idempotent, wrapped in try/catch).
4. **No test framework** — verification scripts are standalone Node.js scripts.
5. **No CI/CD** — no GitHub Actions or GitLab CI configured.
6. **Two component directories**: `components/` (main reusable components) and `component/` (Navbar, Footer, ScrollToTop).
7. **Session storage** (not localStorage) — sessions lost on tab close by design.
8. **Single API service file** (`services/api.ts` at 82KB) contains ALL API call functions.
9. **Currency**: All monetary values use INR — never use $.
10. **App sequences**: `app_sequences` table provides concurrency-safe sequential ID generation for companies (CMP-xxx), invoices (INV-xxx), quotations (QT-xxx), and tickets.

---

## 22. Technician Dashboard Detail

The technician portal includes these views (all in `TechnicianDashboard.tsx`):

### Dashboard KPI Metrics
- Total Assigned
- Pending Acceptance
- Diagnosis and Estimate
- In Progress
- Completed
- Delivered

### Sidebar Navigation Items
| Path | Label |
|---|---|
| `/technician/dashboard` | Dashboard |
| `/technician/assigned-tickets` | My Assigned Tasks |
| `/technician/transfers` | Task Transfer |
| `/technician/diagnosis` | Diagnosis and Estimate |
| `/technician/in-progress` | In Progress |
| `/technician/completed` | Completed |
| `/technician/delivered` | Delivered |
| `/technician/notifications` | Notifications |
| `/technician/profile` | Profile (separate `AdminProfile` component) |

### Key Rules
- Technicians can ONLY see tickets assigned to them (IDOR protected)
- My Assigned Tasks is a dedicated page separate from Dashboard
- Task transfers require reason and admin/technician authorization
- Diagnosis submission creates customer approval workflow
