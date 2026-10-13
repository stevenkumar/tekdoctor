# ─────────────────────────────────────────────────────────────────────────────
# TekDoctor — Build & package for cPanel Node.js App (Passenger) deployment
#
# Run from the repo root (Windows / PowerShell), e.g.:
#     powershell -ExecutionPolicy Bypass -File scripts\deploy-cpanel.ps1
#
# What it does:
#   1. Builds the production frontend (client/dist) with VITE_API_URL pointing
#      at your live domain (read from client/.env.production).
#   2. Creates a `deploy/` folder containing:
#        - server/            -> the Express backend to upload to cPanel
#        - frontend/public_html -> the built SPA assets (upload to cPanel docroot)
#   3. Removes the SPA-routing .htaccess from the frontend package because, in
#      the Passenger model, Express (server.js) handles SPA fallback itself.
#   4. Copies your server/.env into the package so the DB/JWT/CORS settings go
#      with it (these are git-ignored, so this packaging step is important).
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'

$ROOT      = Split-Path -Parent $PSScriptRoot
$CLIENT    = Join-Path $ROOT 'client'
$SERVER    = Join-Path $ROOT 'server'
$DEPLOY    = Join-Path $ROOT 'deploy'
$BUNDLE    = Join-Path $CLIENT 'dist'

Write-Host "==> TekDoctor cPanel deploy packager ==" -ForegroundColor Cyan
Write-Host "Repo root : $ROOT"

# 1 ── Build frontend ────────────────────────────────────────────────────────
if (-not (Test-Path (Join-Path $CLIENT 'node_modules'))) {
  Write-Host "Installing client dependencies..." -ForegroundColor Yellow
  Push-Location $CLIENT
  npm install
  Pop-Location
}

Write-Host "Building production frontend..." -ForegroundColor Yellow
Push-Location $CLIENT
npm run build
Pop-Location

if (-not (Test-Path (Join-Path $BUNDLE 'index.html'))) {
  throw "Frontend build failed: no index.html in $BUNDLE"
}
Write-Host "Frontend built at: $BUNDLE" -ForegroundColor Green

# 2 ── Prepare deploy folder ─────────────────────────────────────────────────
if (Test-Path $DEPLOY) {
  Remove-Item -Recurse -Force $DEPLOY
}

$DEPLOY_SERVER      = Join-Path $DEPLOY 'server'
$DEPLOY_FRONTEND    = Join-Path $DEPLOY 'frontend\public_html'

New-Item -ItemType Directory -Force -Path $DEPLOY_SERVER    | Out-Null
New-Item -ItemType Directory -Force -Path $DEPLOY_FRONTEND  | Out-Null

Write-Host "Copying backend source..." -ForegroundColor Yellow
# Files/folders that must NOT be uploaded
$exclude = @(
  'node_modules', 'logs', 'uploads', '.only-copy-server-env',
  '.htaccess'   # no Apache SPA rules in Passenger model
)

Get-ChildItem -LiteralPath $SERVER -Force | Where-Object {
  $_.Name -notin $exclude -and $_.Name -ne 'passenger.htaccess.example'
} | ForEach-Object {
  Copy-Item -Recurse -Force -LiteralPath $_.FullName -Destination $DEPLOY_SERVER
}

# Backend .env travels with the package (it is git-ignored).
if (Test-Path (Join-Path $SERVER '.env')) {
  Copy-Item -Force -LiteralPath (Join-Path $SERVER '.env') -Destination $DEPLOY_SERVER
  Write-Host "server/.env included in package." -ForegroundColor Green
} else {
  Write-Warning "server/.env not found - copy it manually to the cPanel app root."
}

# Passenger .htaccess example for reference only
Copy-Item -Force -LiteralPath (Join-Path $SERVER 'passenger.htaccess.example') `
          -Destination (Join-Path $DEPLOY_SERVER 'passenger.htaccess.example')

Write-Host "Copying built frontend..." -ForegroundColor Yellow
Get-ChildItem -LiteralPath $BUNDLE -Force | ForEach-Object {
  if ($_.Name -ne '.htaccess') {   # drop any SPA-routing rules from the build
    Copy-Item -Recurse -Force -LiteralPath $_.FullName -Destination $DEPLOY_FRONTEND
  }
}

# Passenger entry point for the WEB ROOT (public_html). This is required so
# Apache hands the domain to the Node/Express process; without it, refreshing
# a client route (e.g. /dashboard) returns a web-server 404 and /api/* 404s.
$rootHtaccess = Join-Path $ROOT '.htaccess'
if (Test-Path $rootHtaccess) {
  Copy-Item -Force -LiteralPath $rootHtaccess -Destination (Join-Path $DEPLOY_FRONTEND '.htaccess')
  Write-Host "Passenger .htaccess included for public_html (verify paths inside it)." -ForegroundColor Green
} else {
  Write-Warning "Root .htaccess not found - create the Passenger entry point in public_html manually."
}

# 3 ── Summary ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "==== Deploy package ready at: $DEPLOY ====" -ForegroundColor Green
Write-Host " 1. Upload contents of deploy\server\              -> cPanel Node app root (e.g. ~/backend, holds server.js)"
Write-Host " 2. Upload contents of deploy\frontend\public_html\ -> domain docroot (e.g. ~/public_html)."
Write-Host "    A Passenger .htaccess is included - it routes the domain to Node. VERIFY the"
Write-Host "    PassengerAppRoot / PassengerNodejs paths inside it match cPanel -> Setup Node.js App."
Write-Host " 3. On cPanel: Run NPM Install in the app root, then Restart the app"
Write-Host " 4. cPanel: Setup Node.js App -> startup file server.js (see DEPLOY-CPANEL.md)."
Write-Host "    If you configure the app in cPanel, click Save and let it own public_html\.htaccess."
Write-Host " 5. Never upload the SPA-routing .htaccess to public_html (Express handles the SPA fallback)."
Write-Host " 6. Auto-init runs on boot and self-heals missing tables. Optionally set"
Write-Host "    DB_AUTO_INIT=false after go-live; use 'npm run db:init' for schema changes."
Write-Host ""
