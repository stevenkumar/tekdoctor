# TekDoctor — cPanel Production Deployment Guide (Node.js App / Passenger)

This guide deploys TekDoctor on cPanel using the **Setup Node.js App**
(Passenger) model. In this model a single Express process (`server/server.js`)
serves BOTH the built frontend (SPA) AND the API at the domain root:

```
Browser -> https://thetekdoctor.com
              -> Express (server.js) serves static frontend + /api + /uploads
              -> MySQL (cPanel database)
```

The `/api`, `/uploads`, `/health` routes and the Vue/React SPA fallback are all
handled by Express. No Apache SPA rewrite rules are needed.

---

## 1. What you already have

The source is configured for production:

- `server/.env` -> `NODE_ENV=production`, cPanel DB credentials,
  `HOST=0.0.0.0`, strong `JWT_SECRET`,
  `CORS_ORIGIN=https://thetekdoctor.com`,
  `FRONTEND_URL=https://thetekdoctor.com`,
  `FRONTEND_BUILD_PATH=/home/vibgyorventures/public_html`,
  `DB_AUTO_INIT=true` (first run only).
- `client/.env.production` -> `VITE_API_URL=https://thetekdoctor.com`.

> `server/.env` is the **only** env file the server reads by default.
> `server/.env.production` is loaded additionally when `NODE_ENV=production`,
> but it only fills in values that `.env` has not already set — it never
> overrides them, and real environment variables set in cPanel always win.
> This matters because a **duplicate key inside one file is silently
> last-one-wins**, which is the most common cause of a live site failing
> CORS while the file "looks" correct.

> Adjust `FRONTEND_BUILD_PATH` if your cPanel home is not `vibgyorventures`
> or your docroot is not `public_html`. The server logs the path it actually
> resolved on startup (`Serving frontend from: ...`) — check that line.

---

## 2. Build the frontend (production bundle)

Run this on your local machine (or anywhere with Node):

```bash
cd client
npm install
npm run build
```

A Node version >= 18 is recommended (cPanel usually offers 18/20/22).

Result: `client/dist/` contains the built `index.html` + hashed assets.

> IMPORTANT: because the frontend is served through Express/Passenger, do NOT
> upload the SPA-routing `client/public/.htaccess` into the served folder.
> Vite copies it into `dist/` automatically, so delete `dist/.htaccess` before
> uploading, or just leave the served assets to Express. The passenger
> `.htaccess` at the APP ROOT is a separate file (see section 5).

---

## 3. Upload the server to cPanel

Create a folder for the Node app (cPanel makes this under your home, e.g.
`/home/vibgyorventures/tekdoctor`). Upload the **`server/`** directory there:

- Upload `server.js`, `config/`, `controllers/`, `models/`, `routes/`,
  `middleware/`, `utils/`, `package.json`, `package-lock.json`, and your
  `server/.env`.
- Do NOT upload `node_modules` — run `npm install` on the server instead.
- `logs/` and `uploads/` are created automatically on first start.

Then, in cPanel terminal (or after `npm install`):

```bash
cd ~/tekdoctor            # or wherever you placed server/
npm install --production
```

---

## 4. Create the Node.js App in cPanel

1. cPanel -> **Setup Node.js App** -> **Create Application**.
2. Set:
   - **Node.js version:** 20.x (or 18/22).
   - **Application root:** the folder that contains `server.js`
     (e.g. `tekdoctor`).
   - **Application URL:** `tekunik.co.in:2083`
   - **Application startup file:** `server.js`
   - **Application startup script:** leave default (`node server.js`).
3. **Save / Create**. Note the generated application root path.

---

## 5. Confirm / generate the Passenger .htaccess

cPanel generates a Passenger config at the app root automatically (see
`server/passenger.htaccess.example` for what it contains). Key settings:

```
PassengerAppRoot "/home/vibgyorventures/tekdoctor"
PassengerStartupFile server.js
PassengerAppType node
```

If your host did not generate it, copy the examples from
`server/passenger.htaccess.example` and adapt the paths.

---

## 6. Serve the built frontend

Set `FRONTEND_BUILD_PATH` in `server/.env` to the absolute path of the folder
that contains the built `index.html`. Default (already set):
`/home/vibgyorventures/public_html`.

Upload the contents of `client/dist/` into that folder (public_html), so that
`index.html` sits at `<docroot>/index.html`. Express will serve the static
assets and the SPA fallback from there.

> Keep the Node app OUTSIDE public_html if possible (e.g. `~/tekdoctor`) so the
> source files are not publicly exposed. Only the built assets go in public_html.

---

## 7. Start the app & initialize the database

The first run seeds the schema and default admin because `DB_AUTO_INIT=true`:

1. cPanel -> Setup Node.js App -> **Restart** (or start) the application.
2. Watch the app log for:
   - `MySQL Database connection established successfully.`
   - `Table ... checked/created.` messages
   - `Server running in [production] mode`
   - `Public URL: https://thetekdoctor.com/api` — confirms the
     app knows its live origin (not localhost)
   - `Serving frontend from: /home/<youruser>/public_html` — confirms the
     built SPA was found. If this points somewhere unexpected, fix
     `FRONTEND_BUILD_PATH` before continuing.

3. **After it starts successfully with no errors, edit `server/.env` and set**
   ```env
   DB_AUTO_INIT=false
   ```
   Then Restart the app again so future restarts never touch the schema.

The seeded default admin is `admin@tekdoctor.in` / `Admin@123`
(change the password immediately after first login).

---

## 8. Verify

- Health check: open `https://thetekdoctor.com/health`
  -> expect `{ "status": "UP", "database": "connected", "env": "production" }`.
- Open the site root -> the React app loads (frontend served by Express).
- Open the site root `/api/public/site-data` -> returns JSON (API works).
- Log in as admin at `/admin` and confirm tickets/customers render.

### 8.1 Before you go live — security checklist

- [ ] **Rotate the database password.** It was shared in plaintext while
      configuring this deployment. Change it in cPanel -> MySQL Databases,
      update `DB_PASSWORD` in `server/.env`, then restart the app.
- [ ] Change the seeded admin password (`INITIAL_ADMIN_PASSWORD=Admin@123`)
      from the admin UI, then delete `INITIAL_ADMIN_EMAIL` and
      `INITIAL_ADMIN_PASSWORD` from `server/.env`.
- [ ] Replace the Razorpay **test** keys with live `rzp_live_...` keys before
      accepting real payments.
- [ ] Confirm `server/.env` is NOT inside `public_html` and is not served by
      Apache (it holds every secret in this project).
- [ ] `server/logs/combined.log` may contain password-reset tokens from
      earlier development runs. Delete it after the first clean production boot.

---

## 9. Troubleshooting

- **Frontend calls hit `localhost:5000` / "Cannot reach server"** -> the
  deployed `client/dist` is stale. `VITE_*` values are inlined at build time,
  so the URL is frozen into the bundle. Rebuild (`cd client && npm run build`),
  re-upload `client/dist`, then hard-refresh with Ctrl+Shift+R. Verify the
  baked value with:
  ```powershell
  Select-String -Path client\dist\assets\index-*.js -Pattern 'tekunik\.vibgyorventures\.co\.in'
  ```
- **CORS error in the browser console**
  (`CORS policy deviation: origin https://thetekdoctor.com is not allowed`)
  -> `CORS_ORIGIN` does not contain your live domain. Check for a **duplicate
  `CORS_ORIGIN=` line** in `server/.env`; only the last one counts.
- **Password-reset emails link to `localhost:3000`** -> `FRONTEND_URL` is wrong.
  It must be `https://thetekdoctor.com` with no trailing slash.
- **Startup refuses to boot** with `FRONTEND_URL must be your live https://
  domain in production` or `DB_USER and DB_NAME must be set in production`
  -> the guard in `config/app.config.js` fired. Fix `.env`; these are
  intentional, not bugs to bypass.
- **`Database connection failed`** -> confirm the DB user/host/password/dbname
  in `server/.env` are exactly what cPanel assigned, the database
  `vibgyorventures_tekdoctorv1` exists in cPanel MySQL, and the DB user has
  privileges on it. `DB_HOST` must stay `127.0.0.1` on cPanel.
- **Production startup error about JWT_SECRET / CORS_ORIGIN** -> ensure both
  are set in `server/.env` (they now are).
- **API works but SPA routes 404** -> frontend assets not found. Verify
  `FRONTEND_BUILD_PATH` resolves to the folder with `index.html` (check the
  `Serving frontend from:` line in the startup log).
- **Uploads not loading** -> ensure `uploads/` is writable by the Node user and
  served via Express at `/uploads/*` (already mounted in `server.js`).
- **Port** -> In Passenger mode the public port is your domain (80/443). The
  internal `PORT=5000` in `.env` is fine; Passenger proxies to it. Only change
  it if your host requires a specific port. Never firewall-open `5000`.
- **Frontend loads but every API call fails** -> confirm the app root is
  *outside* `public_html` and that `FRONTEND_BUILD_PATH` points at
  `public_html`, not at the app root. If Apache is serving `public_html`
  directly it will shadow the Express routes.

---

## 10. Email (optional but recommended)

For password reset / notification emails to actually send, set real values in
`server/.env`:

```env
EMAIL_USER=your-real@gmail.com
EMAIL_PASS=your-gmail-app-password
ADMIN_EMAIL=your-real@domain.com
```

Gmail requires an **App Password** (2-Step Verification must be enabled).
