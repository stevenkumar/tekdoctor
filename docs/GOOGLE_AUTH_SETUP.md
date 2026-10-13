# TekDoctor — Google Sign-In Setup & Integration Guide

This guide details how to configure Google OAuth 2.0 / OpenID Connect authentication for TekDoctor across both local development and live production environments.

---

## 1. Google Cloud Console Setup

### Step 1: Create or Select a Google Cloud Project
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `tekdoctor-app`) or select your existing project.

### Step 2: Configure the OAuth Consent Screen
1. Go to **APIs & Services > OAuth consent screen**.
2. Select **External** (unless restricting solely to Google Workspace organization users) and click **Create**.
3. Fill in the required application details:
   - **App name**: `TekDoctor`
   - **User support email**: Your admin/support email
   - **Developer contact information**: Your email
4. **Scopes**: Add the standard OpenID Connect scopes:
   - `.../auth/userinfo.email` (`email`)
   - `.../auth/userinfo.profile` (`profile`)
   - `openid`
5. **Test users**: In Development / Testing status, add test Gmail accounts that will test the login before publishing.

### Step 3: Create OAuth 2.0 Web Client Credentials
1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Select **Application type**: `Web application`.
4. **Name**: `TekDoctor Web Client`.
5. **Authorized JavaScript origins**:
   - **Development**:
     - `http://localhost:3000`
     - `http://localhost:5173`
   - **Production**:
     - `https://thetekdoctor.com`
6. **Authorized redirect URIs**:
   - **Development**:
     - `http://localhost:3000`
     - `http://localhost:5000/api/auth/google/callback`
   - **Production**:
     - `https://thetekdoctor.com`
     - `https://thetekdoctor.com/api/auth/google/callback`
7. Click **Create**.
8. Copy your **Client ID** (e.g., `1234567890-abcdef.apps.googleusercontent.com`) and **Client Secret**.

---

## 2. Environment Variables Configuration

### Backend (`server/.env`)
Add the following keys to your `server/.env` file:
```bash
# ─── Google OAuth 2.0 / OpenID Connect ────────────
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=
```

### Frontend (`client/.env.development` & `client/.env.production`)
Add the Google Client ID to the frontend environment configuration.

In `client/.env.development`:
```bash
VITE_API_URL=
VITE_APP_ENV=development
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

In `client/.env.production`:
```bash
VITE_API_URL=https://thetekdoctor.com
VITE_APP_ENV=production
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

> [!CAUTION]
> **Client Secret Security**:
> Never expose `GOOGLE_CLIENT_SECRET` in frontend `.env` files or client source code. Only `GOOGLE_CLIENT_ID` is public and needed on the client.

---

## 3. Account Linking & Authorization Behavior

| Scenario | Behavior | Security Guarantees |
|---|---|---|
| **New User** | Automatically registered with role `customer`. | Never automatically assigned `admin`, `technician`, or `company`. A random 64-char password hash is stored. |
| **Existing User (Same Email)** | Signs in to existing account; links `google_id` and saves avatar if empty. | Existing password, user ID, role, tickets, invoices, and devices are 100% preserved. |
| **Google ID Conflict** | Verified Google ID belongs to an account with a different email. | Operation rejected with HTTP 409 Conflict. Prevents unauthorized account takeover. |
| **Email Conflict** | Existing email already linked to a different Google ID. | Operation rejected with HTTP 409 Conflict. Prevents identity collision. |
| **Deactivated User** | Account has `is_active = 0`. | Rejected with HTTP 403 Forbidden. Access is blocked. |

### Role-Based Dashboard Redirection
After successful authentication:
- **`admin`** &rarr; `/admin/dashboard`
- **`technician`** &rarr; `/technician/dashboard`
- **`company`** &rarr; `/company/dashboard`
- **`customer`** &rarr; `/repair`

The user's role is always sourced strictly from the backend database record; the client cannot manipulate or request roles during login.

---

## 4. Local Testing Steps

1. Start backend server:
   ```bash
   cd server
   npm run dev
   ```
2. Start frontend dev server:
   ```bash
   cd client
   npm run dev
   ```
3. Open `http://localhost:3000/auth/signin` in your browser.
4. Click **Continue with Google**.
5. Log in with your test Google account.
6. Verify redirect to the appropriate dashboard based on your user role.
7. Test logout and verify the session is cleared.
8. Test repeat sign-in to verify the existing user is reused without creating duplicates.

---

## 5. Production Deployment Steps

### VPS (PM2 + Nginx)
1. In `server/.env`, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
2. Ensure production domain is listed under Authorized JavaScript origins in Google Cloud Console.
3. Build the frontend:
   ```bash
   cd client
   npm run build
   ```
4. Restart PM2:
   ```bash
   pm2 restart tekdoctor-server
   ```

### cPanel / Shared Hosting
1. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to Node.js application environment variables or `.env`.
2. Build frontend locally with `npm run build` and upload `dist/` contents to `public_html`.
3. Restart the Node.js application in cPanel.

---

## 6. Troubleshooting Common Errors

### "Google Sign-In is not configured yet"
- **Cause**: `VITE_GOOGLE_CLIENT_ID` is empty or missing from frontend `.env.development` / `.env.production`.
- **Fix**: Add your Google OAuth Client ID to the relevant `.env` file and restart Vite (`npm run dev`).

### "Token audience mismatch" / HTTP 401
- **Cause**: Backend `GOOGLE_CLIENT_ID` does not match the frontend `VITE_GOOGLE_CLIENT_ID`.
- **Fix**: Ensure both backend `server/.env` and frontend `client/.env.*` share the exact same Client ID.

### "Popup was blocked by your browser"
- **Cause**: Browser popup blocker suppressed the Google authentication window.
- **Fix**: Click the popup icon in the browser URL bar and choose "Always allow popups for this site".

### "Invalid token issuer" / HTTP 401
- **Cause**: The token was not issued by Google (`accounts.google.com`).
- **Fix**: The backend verifier automatically rejects forged or third-party tokens. Verify valid Google credentials.

### CORS or CSP Block in Production
- **Cause**: Strict Content Security Policy blocking external scripts or connections.
- **Fix**: `server/server.js` is already pre-configured to allow `https://accounts.google.com/gsi/client`, `https://accounts.google.com`, `https://oauth2.googleapis.com`, and `https://lh3.googleusercontent.com`.
