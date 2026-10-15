const path = require('path');
const fs = require('fs');

// Environment loading order (later files never override values that are
// already set, so real process.env values injected by cPanel always win):
//   1. .env              -> base config, travels with the deploy package
//   2. .env.<NODE_ENV>  -> optional environment-specific overrides
// Keeping this explicit avoids the "silently ignored .env.production" trap.
const ENV_BASE_PATH = path.join(__dirname, '../.env');
require('dotenv').config({ path: ENV_BASE_PATH });

const nodeEnv = process.env.NODE_ENV || 'development';
const envSpecificPath = path.join(__dirname, `../.env.${nodeEnv}`);
if (fs.existsSync(envSpecificPath)) {
  require('dotenv').config({ path: envSpecificPath });
}

// Passenger (cPanel / Hostinger "Setup Node.js App") only ever hosts a real
// deployment. If the process is running under Passenger but is not in
// production mode, the .env file was forgotten or never uploaded — and the
// app would otherwise boot in development mode with default local credentials,
// localhost CORS origins and a localhost frontend URL, i.e. silently broken.
const runningUnderPassenger = Boolean(
  process.env.PASSENGER_APP_TYPE
  || process.env.PASSENGER_APP_ROOT
  || process.env.PASSENGER_VERSION
);

if (runningUnderPassenger && nodeEnv !== 'production') {
  throw new Error(
    `NODE_ENV must be "production" when running under Passenger/cPanel, but got "${nodeEnv}". `
    + 'Upload the server/.env file to the application root and set NODE_ENV=production.'
  );
}


const env = process.env.NODE_ENV || 'development';
const corsOriginValue = process.env.CORS_ORIGIN;
const corsOrigins = (corsOriginValue || 'http://localhost:5173,http://localhost:3000,http://localhost:3001')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const jwtSecret = process.env.JWT_SECRET;
const insecureJwtSecret = !jwtSecret
  || jwtSecret.length < 32
  || jwtSecret.includes('CHANGE_THIS_IN_PRODUCTION')
  || jwtSecret.includes('tekdoctor-secret-key-change-in-production');

if (env === 'production' && insecureJwtSecret) {
  throw new Error('JWT_SECRET must be a unique value of at least 32 characters in production.');
}

if (env === 'production' && !corsOriginValue) {
  throw new Error('CORS_ORIGIN must list trusted frontend origins in production.');
}

if (env === 'production' && corsOrigins.includes('*')) {
  throw new Error('CORS_ORIGIN cannot use "*" in production. List trusted origins explicitly.');
}

if (env === 'production' && (!process.env.DB_USER || !process.env.DB_NAME)) {
  throw new Error('DB_USER and DB_NAME must be set in production. Check the server .env file.');
}

const rawBuildPath = process.env.FRONTEND_BUILD_PATH || '../client/dist';
const candidateBuildPaths = [
  path.isAbsolute(rawBuildPath) ? rawBuildPath : path.resolve(__dirname, '..', rawBuildPath),
  // App root. On the cPanel/Passenger layout the docroot IS the app root, so
  // the built index.html sits directly beside server.js and config/ (there is
  // no client/dist subfolder). __dirname here is <appRoot>/config.
  path.resolve(__dirname, '..'),
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../client/dist'),
  path.resolve(process.cwd(), rawBuildPath),
  path.resolve(process.cwd(), 'client/dist'),
  path.resolve(process.cwd(), 'dist')
];

let resolvedFrontendBuild = candidateBuildPaths[0];
for (const cp of candidateBuildPaths) {
  if (fs.existsSync(path.join(cp, 'index.html'))) {
    resolvedFrontendBuild = cp;
    break;
  }
}

// Canonical public origin of the deployed site (no trailing slash).
// In production this can only ever resolve to a real, non-localhost origin,
// so downstream code never needs a hardcoded localhost fallback.
const publicOrigin = (
  process.env.FRONTEND_URL
  || corsOrigins.find(o => !o.includes('localhost'))
  || corsOrigins[0]
  || ''
).replace(/\/+$/, '');

if (env === 'production' && (!publicOrigin || publicOrigin.includes('localhost'))) {
  throw new Error('FRONTEND_URL must be your live https:// domain in production (it drives password-reset links).');
}

const config = {
  env,
  isProduction: env === 'production',

  server: {
    port: parseInt(process.env.PORT, 10) || 5000,
    // Bind on all interfaces in production. Passenger/cPanel reaches the app
    // through the loopback, but a 127.0.0.1-only bind breaks reverse proxies.
    host: process.env.HOST || (env === 'production' ? '0.0.0.0' : 'localhost'),
    corsOrigins,
    apiPrefix: '/api',
    publicOrigin
  },

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tekdoctor_db',
    connectionLimit: 10,
    queueLimit: 0,
    waitForConnections: true,
    // Default ON everywhere so a fresh or partial database self-heals on boot.
    // initDatabase() is idempotent (CREATE TABLE IF NOT EXISTS + tracked
    // migrations), so set DB_AUTO_INIT=false only to freeze schema changes.
    autoInitialize: process.env.DB_AUTO_INIT !== 'false'
  },

  jwt: {
    // Production startup is blocked above when this value is missing or insecure.
    secret: jwtSecret || 'development-only-jwt-secret-not-for-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  security: {
    settingsEncryptionKey: (process.env.SETTINGS_ENCRYPTION_KEY || '').trim()
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    currency: process.env.RAZORPAY_CURRENCY || 'INR'
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || ''
  },

  recaptcha: {
    siteKey: (process.env.RECAPTCHA_SITE_KEY || '').trim(),
    apiKey: (process.env.RECAPTCHA_API_KEY || '').trim(),
    projectId: (process.env.RECAPTCHA_PROJECT_ID || process.env.GOOGLE_PROJECT_ID || '').trim(),
    secretKey: (process.env.RECAPTCHA_SECRET_KEY || '').trim(),
    scoreThreshold: parseFloat(process.env.RECAPTCHA_SCORE_THRESHOLD || '0.5'),
    enabled: process.env.RECAPTCHA_ENABLED !== 'false'
  },

  initialAdmin: {
    email: process.env.INITIAL_ADMIN_EMAIL || '',
    password: process.env.INITIAL_ADMIN_PASSWORD || ''
  },

  frontend: {
    url: publicOrigin
  },

  email: {
    user: (process.env.EMAIL_USER || '').trim(),
    pass: (process.env.EMAIL_PASS || '').replace(/^["']|["']$/g, '').trim(),
    adminEmail: (process.env.ADMIN_EMAIL || process.env.EMAIL_USER || '').trim(),
    smtpHost: (process.env.SMTP_HOST || '').trim(),
    smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587,
    smtpUser: (process.env.SMTP_USER || process.env.EMAIL_USER || '').trim(),
    smtpPassword: (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.EMAIL_PASS || '').replace(/^["']|["']$/g, '').trim(),
    smtpSecure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    smtpRejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== undefined
      ? (process.env.SMTP_REJECT_UNAUTHORIZED === 'true' || process.env.SMTP_REJECT_UNAUTHORIZED === '1')
      : null,
    fromEmail: (process.env.FROM_EMAIL || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || process.env.EMAIL_USER || 'noreply@tekdoctor.in').trim(),
    fromName: (process.env.FROM_NAME || process.env.SMTP_FROM_NAME || 'The Tek Doctor').trim()
  },

  uploads: {
    // Relative or absolute directory path where files are stored
    directory: process.env.UPLOAD_DIR || 'uploads',
    maxSizeBytes: (parseInt(process.env.UPLOAD_MAX_SIZE_MB, 10) || 5) * 1024 * 1024,
    allowedMimeTypes: [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp'
    ]
  },

  paths: {
    // Path to served client build folder
    frontendBuild: resolvedFrontendBuild,
    // Root uploads folder path
    uploadsRoot: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads'),
    // Specific upload categories
    logo: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'logo'),
    favicon: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'favicon'),
    users: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'users'),
    companies: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'companies'),
    technicians: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'technicians'),
    repairs: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'repairs'),
    deviceImages: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'repairs', 'images'),
    screenshots: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'repairs', 'screenshots'),
    videos: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'repairs', 'videos')
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    directory: path.resolve(__dirname, '../logs'),
    errorLogFile: 'error.log',
    combinedLogFile: 'combined.log'
  },

  rateLimits: {
    global: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: env === 'development' || env === 'test' ? 5000 : 500
    },
    auth: {
      windowMs: 15 * 60 * 1000,
      max: env === 'development' || env === 'test' ? 1000 : (parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 15)
    },
    contact: {
      windowMs: 15 * 60 * 1000,
      max: env === 'development' || env === 'test' ? 100 : 5
    }
  }
};

// Ensure the log directory exists before the winston logger initializes file transports
fs.mkdirSync(config.logging.directory, { recursive: true });

module.exports = config;
