# TekDoctor — Agent Instructions

## Project Overview
**TekDoctor** is a device repair management platform with a React/TypeScript frontend and Express/MySQL backend.

- **Frontend**: `client/` — React 19 + Vite + TypeScript + TailwindCSS + React Router
- **Backend**: `server/` — Express + MySQL (mysql2) + JWT auth + Winston logging
- **Architecture**: Monorepo (root `package.json` has workspace scripts but no actual workspaces configured)

---

## Monorepo Layout
Root `package.json` delegates to the real folders via `--prefix`:
```json
"dev:backend":  "npm run dev  --prefix server",
"dev:frontend": "npm run dev  --prefix client",
"build":        "npm run build --prefix client",
```

---

## Developer Commands

### Backend (`server/`)
| Command | Description |
|---------|-------------|
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm start` | Production start |
| `node server.js` | Direct run (same as start) |

### Frontend (`client/`)
| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server on port 3000 (`strictPort`), proxies `/api` & `/uploads` to `VITE_DEV_PROXY_TARGET` (dev only) |
| `npm run build` | TypeScript build + Vite production build → `client/dist/` |
| `npm run lint` | ESLint check |
| `npm run preview` | Preview production build |

### Database
- **Auto-initializes on server startup**: Creates tables, seeds default admin (`admin@tekdoctor.in` / `Admin@123`), seeds site settings & homepage content
- **No migration tool** — schema changes are done via `ALTER TABLE` in `server/models/db.init.js`
- **MySQL only** (mysql2 pool), no ORM

---

## Environment Configuration

### Server (`server/.env` — copy from `server/.env.example`)
```bash
# Development
NODE_ENV=development
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=tekdoctor_db
CORS_ORIGIN=http://localhost:3000,http://localhost:5173
FRONTEND_URL=http://localhost:3000
FRONTEND_BUILD_PATH=../client/dist

# Production (cPanel) — live domain https://thetekdoctor.com
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
CORS_ORIGIN=https://thetekdoctor.com
FRONTEND_URL=https://thetekdoctor.com
DB_HOST=127.0.0.1          # cPanel MySQL only accepts localhost connections
DB_USER=<cpanel-db-user>
DB_NAME=<cpanel-db-name>
FRONTEND_BUILD_PATH=/home/<user>/public_html

# Shared
JWT_SECRET=<openssl rand -base64 48>   # startup blocked in production if weak
JWT_EXPIRES_IN=7d
UPLOAD_DIR=uploads
LOG_LEVEL=info
EMAIL_USER=your@gmail.com
EMAIL_PASS="app-password"
ADMIN_EMAIL=your@gmail.com
```

> **Env file loading:** `config/app.config.js` reads `server/.env`, then
> `server/.env.<NODE_ENV>` if present. Neither overrides variables already set
> in the real process environment (so cPanel UI variables win). Within a single
> file, a **duplicate key is silently last-one-wins** — never define
> `CORS_ORIGIN` or `FRONTEND_URL` twice.

### Key Paths (resolved in `server/config/app.config.js`)
| Config | Default | Production Override |
|--------|---------|---------------------|
| `FRONTEND_BUILD_PATH` | `../client/dist` | cPanel: `/home/user/public_html` |
| `UPLOAD_DIR` | `uploads` | VPS: `/var/www/tekdoctor/server/uploads` |

---

## Architecture Highlights

### API Prefix
All routes mounted under `/api` (configurable via `config.server.apiPrefix`)

### Auth & Roles
- **JWT** in `Authorization: Bearer <token>` header
- **Token version** invalidates sessions on password change
- **Roles**: `customer`, `technician`, `admin`, `company`
- **Middleware**: `authenticate`, `optionalAuth`, `authorize(...roles)`

### Route Groups
| Prefix | Area | Protection |
|--------|------|------------|
| `/api/auth` | Public auth | Rate limited |
| `/api/admin` | Admin panel | `authorize('admin')` |
| `/api/technicians` | Technician dashboard | `authorize('technician')` |
| `/api/company` | B2B company portal | `authorize('company')` |
| `/api/public` | Public content | None |
| `/api/repair-request` | Repair tickets | Mixed |
| `/api/billing` | Invoices/payments | Auth required |
| `/api/notifications` | Notifications | Auth required |
| `/api/contact` | Contact form | Rate limited |
| `/api/testimonials` | Reviews | Mixed |

### Frontend Route Structure (`client/src/App.tsx`)
- **PublicLayout**: Home, About, Auth, Repair, Shop, Services, FAQ, Profile, Billing
- **AdminLayout** + `ProtectedAdminRoute`: Dashboard, Tickets, Technicians, Customers, Settings, Reports, Logs
- **CompanyLayout** + `ProtectedCompanyRoute`: Dashboard, Branches, Employees, Devices, Repairs, Profile, Messages, Billing, Logs
- **Technician** uses AdminLayout + `ProtectedTechnicianRoute`

---

## Production Deployment Notes (from `server/server.js`)

### cPanel / Hostinger (Passenger) — the primary production target
- Express serves the SPA, `/api/*`, `/uploads/*` and `/health` from the domain
  root. No Nginx/Apache SPA rewrite rules are needed.
- `server/.env`: `NODE_ENV=production`, `HOST=0.0.0.0`, live `CORS_ORIGIN` /
  `FRONTEND_URL`, cPanel DB credentials, `FRONTEND_BUILD_PATH` = `public_html`.
- `PORT=5000` is an internal socket only Passenger talks to. Never open it.
- Startup file is `server.js`; register the app via Setup Node.js App.
- Build the client with `VITE_API_URL` set to the live domain, then upload
  `client/dist` into `public_html`.
- See `DEPLOY-CPANEL.md` for the full runbook.

### VPS (PM2 + Nginx) — alternative
```bash
# Server
pm2 start server.js --name "tekdoctor-server"

# Nginx
location /api { proxy_pass http://127.0.0.1:5000; }
location /uploads { alias /var/www/tekdoctor/server/uploads; }
location / { root /var/www/tekdoctor/client/dist; try_files $uri $uri/ /index.html; }
```

---

## Known Issues / Gotchas

1. **Root package.json workspace scripts broken** — folder names don't match
2. **No test framework** — only `server/tests/verify-repair-fields.js` exists
3. **No CI/CD config** — no GitHub Actions, GitLab CI, etc.
4. **JWT secret hardcoded default** — must override in production `.env`
5. **CORS origins** — must include production domain in `.env`
6. **Database credentials in `.env`** — never commit real credentials
7. **Upload directories** — created auto on startup, ensure writable in production
8. **Email uses Gmail app password** — configure `EMAIL_USER`/`EMAIL_PASS`

---

## File Patterns to Know

| Pattern | Purpose |
|---------|---------|
| `server/controllers/*.controller.js` | Route handlers |
| `server/routes/*.routes.js` | Express route definitions |
| `server/middleware/*.middleware.js` | Auth, validation, rate limiting, errors |
| `server/utils/*.js` | Logger, email, helpers, activity logging |
| `server/config/*.config.js` | Centralized config (app, db, multer) |
| `server/models/db.init.js` | Schema creation + seeding (runs on startup) |
| `client/src/pages/**/*.tsx` | Page components (route targets) |
| `client/src/components/*.tsx` | Reusable UI components |
| `client/src/context/*.tsx` | React Context providers (Auth, Site) |
| `client/src/config/*.ts` | Constants, routes, API config |

---

## Verification Checklist (before production)

- [x] Fix root `package.json` script paths (`backend`→`server`, `frontend`→`client`)
- [ ] Set strong `JWT_SECRET` in production `.env`
- [ ] Configure production `CORS_ORIGIN` with actual domain (exactly once — no duplicate key)
- [ ] Set `NODE_ENV=production` and `HOST=0.0.0.0`
- [ ] Configure real `DB_*` credentials
- [ ] Set `FRONTEND_URL` to the live domain (drives password-reset links)
- [ ] Set `FRONTEND_BUILD_PATH` to deployed frontend location
- [ ] Ensure `UPLOAD_DIR` is writable and served by Express at `/uploads/*`
- [ ] Configure `EMAIL_USER`/`EMAIL_PASS` for transactional emails
- [ ] Run `npm run build` in `client/` and verify `dist/` bakes in the live `VITE_API_URL`
- [ ] Test health endpoint: `GET /health` returns `{ "status": "UP", "database": "connected" }`