
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

const config = require('./config/app.config');
const { testConnection, pool } = require('./config/db.config');
const initDatabase = require('./models/db.init');
const logger = require('./utils/logger');

// Process Crash Guards: Log full stack traces via Winston without crashing on minor rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', reason instanceof Error ? (reason.stack || reason.message) : reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error.stack || error.message);
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

const { globalLimiter } = require('./middleware/rateLimiter.middleware');
const { preventPrototypePollution, sanitizeRequestPayload } = require('./middleware/security.middleware');
const errorHandler = require('./middleware/error.middleware');

// Route Imports
const authRoutes = require('./routes/auth.routes');
const contactRoutes = require('./routes/contact.routes');
const repairRoutes = require('./routes/repair.routes');
const billingRoutes = require('./routes/billing.routes');
const technicianRoutes = require('./routes/technician.routes');
const notificationRoutes = require('./routes/notification.routes');
const adminRoutes = require('./routes/admin.routes');
const publicRoutes = require('./routes/public.routes');
const companyRoutes = require('./routes/company.routes');
const testimonialRoutes = require('./routes/testimonial.routes');
const amcRoutes = require('./routes/amc.routes');

const app = express();

// Behind cPanel/Passenger (and Nginx) all requests arrive via a local reverse
// proxy; trust the first hop so rate limiting sees the real client IP.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Ensure upload directories exist even when DB auto-init is disabled
const ensureUploadDirs = () => {
  const dirs = [
    config.paths.uploadsRoot,
    config.paths.logo,
    config.paths.favicon,
    config.paths.users,
    config.paths.companies,
    config.paths.technicians,
    config.paths.repairs,
    config.paths.deviceImages,
    config.paths.screenshots,
    config.paths.videos
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
};
ensureUploadDirs();

const contentSecurityPolicy = config.isProduction
  ? {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: [
        "'self'",
        ...config.server.corsOrigins,
        'https://accounts.google.com',
        'https://oauth2.googleapis.com',
        'https://*.razorpay.com',
        'https://api.razorpay.com',
        'https://checkout.razorpay.com',
        'https://lumberjack.razorpay.com',
        'https://www.google.com/recaptcha/',
        'https://recaptchaenterprise.googleapis.com',
        'https://www.recaptcha.net/'
      ],
      fontSrc: ["'self'", 'data:', 'https:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      frameSrc: [
        "'self'",
        'https://accounts.google.com',
        'https://*.razorpay.com',
        'https://checkout.razorpay.com',
        'https://api.razorpay.com',
        'https://www.google.com/recaptcha/',
        'https://recaptcha.google.com/recaptcha/',
        'https://www.recaptcha.net/'
      ],
      imgSrc: ["'self'", 'data:', 'https:', 'https://*.razorpay.com', 'https://lh3.googleusercontent.com'],
      objectSrc: ["'none'"],
      scriptSrc: [
        "'self'",
        'https://accounts.google.com/gsi/client',
        'https://apis.google.com',
        'https://*.razorpay.com',
        'https://checkout.razorpay.com',
        'https://www.google.com/recaptcha/',
        'https://www.gstatic.com/recaptcha/',
        'https://www.recaptcha.net/'
      ],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      workerSrc: ["'self'", 'blob:'],
    }
  }
  : false;

// Set up security headers. Development keeps CSP off for Vite's HMR runtime.
app.use(helmet({
  contentSecurityPolicy,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));

// Apply response compression
app.use(compression());

// Set up CORS
// Determine trusted origins set
const trustedOrigins = new Set();
if (config.frontend && config.frontend.url) {
  trustedOrigins.add(config.frontend.url.replace(/\/+$/, ''));
}
if (config.server && config.server.publicOrigin) {
  trustedOrigins.add(config.server.publicOrigin.replace(/\/+$/, ''));
}
if (Array.isArray(config.server.corsOrigins)) {
  config.server.corsOrigins.forEach(o => {
    if (o && o !== '*') trustedOrigins.add(o.trim().replace(/\/+$/, ''));
  });
}

// In development, also trust standard dev hosts
if (!config.isProduction) {
  trustedOrigins.add(`http://localhost:${config.server.port}`);
  trustedOrigins.add(`http://127.0.0.1:${config.server.port}`);
  trustedOrigins.add('http://localhost:3000');
  trustedOrigins.add('http://localhost:5173');
}

const isOriginAllowed = (origin, req) => {
  if (!origin) return true;
  const cleanOrigin = origin.trim().replace(/\/+$/, '');

  // Wildcard allowed
  if (config.server.corsOrigins.includes('*')) return true;

  // Direct match in trusted origins
  if (trustedOrigins.has(cleanOrigin)) return true;

  // Same-origin matching: check against server's incoming Host header
  if (req && req.headers && req.headers.host) {
    const host = req.headers.host;
    if (cleanOrigin === `http://${host}` || cleanOrigin === `https://${host}`) {
      return true;
    }
  }

  // Development localhost/127.0.0.1 matching
  if (!config.isProduction) {
    try {
      const parsed = new URL(cleanOrigin);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return true;
      }
    } catch (_) {}
  }

  return false;
};

// CORS options delegate with per-request awareness
const corsOptionsDelegate = (req, callback) => {
  const origin = req.header('Origin');

  // Requests without origin header (direct navigation, curl, mobile apps, SSR)
  if (!origin) {
    return callback(null, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Company-ID']
    });
  }

  // Static assets & non-API routes: never block static assets with 403 error
  const isStaticOrPublicAsset = req.path.startsWith('/assets') ||
    req.path.startsWith('/uploads') ||
    !req.path.startsWith(config.server.apiPrefix);

  if (isStaticOrPublicAsset) {
    return callback(null, {
      origin: true,
      credentials: true,
      methods: ['GET', 'HEAD', 'OPTIONS']
    });
  }

  // For API endpoints, strictly validate origin
  if (isOriginAllowed(origin, req)) {
    return callback(null, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Company-ID']
    });
  }

  // Origin is not allowed for API endpoint
  const denied = new Error(`CORS policy deviation: origin ${origin} is not allowed.`);
  denied.statusCode = 403;
  return callback(denied);
};

app.use(cors(corsOptionsDelegate));

// Mount the Razorpay webhook raw-body parser BEFORE the global JSON parser so
// HMAC verification runs over the exact bytes Razorpay signed.
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// Parse application/json and application/x-www-form-urlencoded
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply security hardening: Prototype pollution prevention & payload sanitization
app.use(preventPrototypePollution);
app.use(sanitizeRequestPayload);

// Logging HTTP Requests using morgan stream with winston logger
app.use(morgan(':remote-addr - :method :url :status :res[content-length] - :response-time ms', { stream: logger.stream }));

// Serve uploads folder statically (accessible at /uploads/*)
app.use('/uploads/device-images', express.static(config.paths.deviceImages));
app.use('/uploads/screenshots', express.static(config.paths.screenshots));
app.use('/uploads/repairs/images', express.static(config.paths.deviceImages));
app.use('/uploads/repairs/screenshots', express.static(config.paths.screenshots));
app.use('/uploads', express.static(config.paths.uploadsRoot));
logger.debug(`Serving static upload files from: ${config.paths.uploadsRoot}`);

// Health Check Endpoint (never rate-limited)
app.get('/health', async (req, res) => {
  const isDbHealthy = await testConnection();
  res.status(isDbHealthy ? 200 : 500).json({
    status: isDbHealthy ? 'UP' : 'DOWN',
    env: config.env,
    database: isDbHealthy ? 'connected' : 'disconnected',
    timestamp: new Date()
  });
});

// Apply global rate limiting strictly to API endpoints
app.use(config.server.apiPrefix, globalLimiter);

// Mount API routes
app.use(`${config.server.apiPrefix}/auth`, authRoutes);
app.use(`${config.server.apiPrefix}/contact`, contactRoutes);
app.use(`${config.server.apiPrefix}/repair-request`, repairRoutes);
app.use(`${config.server.apiPrefix}/billing`, billingRoutes);
app.use(`${config.server.apiPrefix}/technicians`, technicianRoutes);
app.use(`${config.server.apiPrefix}/notifications`, notificationRoutes);
app.use(`${config.server.apiPrefix}/admin`, adminRoutes);
app.use(`${config.server.apiPrefix}/public`, publicRoutes);
app.use(`${config.server.apiPrefix}/company`, companyRoutes);
app.use(`${config.server.apiPrefix}/testimonials`, testimonialRoutes);
app.use(`${config.server.apiPrefix}/amc`, amcRoutes);

// ─── Frontend Static Files & SPA Fallback ───────────────────
const getFrontendIndexHtml = () => {
  const candidates = [
    path.join(config.paths.frontendBuild, 'index.html'),
    // App root == docroot (cPanel/Passenger): index.html lives next to server.js
    path.resolve(__dirname, 'index.html'),
    path.resolve(process.cwd(), 'index.html'),
    path.resolve(__dirname, '../client/dist/index.html'),
    path.resolve(__dirname, '../../client/dist/index.html'),
    path.resolve(process.cwd(), 'client/dist/index.html'),
    path.resolve(process.cwd(), '../client/dist/index.html'),
    path.resolve(process.cwd(), 'dist/index.html'),
    path.resolve(process.cwd(), '../dist/index.html'),
    path.resolve(__dirname, '../public_html/index.html'),
    path.resolve(process.cwd(), 'public_html/index.html'),
    path.resolve(__dirname, 'public/index.html'),
    path.resolve(__dirname, '../public/index.html')
  ];

  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }
  return null;
};

// ─── Block accidental exposure of backend source / secrets ─────
// Strict static file extension whitelist to prevent serving .sql dumps, .log files, .md docs, etc.
const ALLOWED_STATIC_EXTENSIONS = new Set([
  '.js', '.css', '.html', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2', '.json', '.txt'
]);

const BLOCKED_TOP_LEVEL = new Set([
  'server.js', 'package.json', 'package-lock.json',
  'config', 'controllers', 'routes', 'middleware', 'models',
  'utils', 'node_modules', 'logs', 'tests', 'scripts', 'database_backups'
]);

app.use((req, res, next) => {
  // Pass API, uploads, and health routes to their dedicated handlers
  if (
    req.path.startsWith(config.server.apiPrefix) ||
    req.path.startsWith('/uploads') ||
    req.path === '/health'
  ) {
    return next();
  }

  let segment = '';
  try {
    segment = decodeURIComponent(req.path).split('/')[1] || '';
  } catch {
    segment = req.path.split('/')[1] || '';
  }

  // Leading-dot names (.env, .git, .htaccess ...) and blocked backend folders are never valid app routes.
  if (segment.startsWith('.') || BLOCKED_TOP_LEVEL.has(segment)) {
    return res.status(404).json({ success: false, message: 'Resource not found.' });
  }

  // Check file extension: if requesting a file with an extension, it MUST be whitelisted
  const ext = path.extname(req.path).toLowerCase();
  if (ext) {
    if (!ALLOWED_STATIC_EXTENSIONS.has(ext)) {
      logger.warn(`Blocked request for non-whitelisted static file extension [${ext}]: ${req.path} from IP: ${req.ip}`);
      return res.status(404).json({ success: false, message: 'Resource not found.' });
    }
  }

  next();
});

// Serve static assets from all candidate build folders (EXCLUDING server/project root)
const serverDir = path.resolve(__dirname);
const projectRoot = path.resolve(__dirname, '..');

const candidateStaticDirs = [
  config.paths.frontendBuild,
  path.resolve(__dirname, '../client/dist'),
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(process.cwd(), 'client/dist'),
  path.resolve(process.cwd(), '../client/dist'),
  path.resolve(process.cwd(), 'dist'),
  path.resolve(process.cwd(), '../dist'),
  path.resolve(__dirname, '../public_html'),
  path.resolve(process.cwd(), 'public_html')
].filter(dir => {
  if (!dir) return false;
  const resolved = path.resolve(dir);
  // Strictly prevent serving the project root or server directory as static directories
  return resolved !== serverDir && resolved !== projectRoot;
});

const uniqueStaticDirs = [...new Set(candidateStaticDirs)].filter(dir => dir && fs.existsSync(dir));

uniqueStaticDirs.forEach(dir => {
  app.use(express.static(dir, {
    index: false, // Let SPA fallback handle index.html
    dotfiles: 'deny',
    maxAge: config.isProduction ? '1d' : 0,
    setHeaders: (res, filePath) => {
      // Hashed assets in Vite build (/assets/*) get immutable long-term caching
      if (filePath.includes(`${path.sep}assets${path.sep}`) || filePath.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  logger.info(`Serving static assets from: ${dir}`);
});

// Wildcard SPA Fallback: send index.html for all non-API GET requests
app.get('*', (req, res, next) => {
  // Pass API, uploads, and health routes to API handlers / 404
  if (
    req.path.startsWith(config.server.apiPrefix) ||
    req.path.startsWith('/uploads') ||
    req.path === '/health'
  ) {
    return next();
  }

  const indexPath = getFrontendIndexHtml();
  if (indexPath) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.sendFile(indexPath, (err) => {
      if (err && !res.headersSent) {
        logger.error(`Error delivering SPA fallback from ${indexPath}:`, err);
        next(err);
      }
    });
  }

  // If request is from a browser asking for HTML but build is missing
  if (req.accepts('html')) {
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>TekDoctor</title>
        <style>
          body { background: #09090b; color: #e4e4e7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }
          .card { background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 32px; max-width: 480px; text-align: center; }
          h1 { color: #00f0ff; font-size: 22px; margin-bottom: 12px; }
          p { color: #a1a1aa; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
          a { display: inline-block; background: #00f0ff; color: #09090b; font-weight: 600; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>TekDoctor Service Portal</h1>
          <p>Frontend production bundle is initializing. Please run <code>npm run build</code> in the client directory or ensure the build artifacts are deployed.</p>
          <a href="/">Reload</a>
        </div>
      </body>
      </html>
    `);
  }

  next();
});

// 404 Handler for API and unmatched routes
app.use((req, res) => {
  // If browser navigates directly and somehow reaches here, check if SPA index can be served
  if (req.method === 'GET' && req.accepts('html') && !req.path.startsWith(config.server.apiPrefix)) {
    const indexPath = getFrontendIndexHtml();
    if (indexPath) {
      return res.sendFile(indexPath);
    }
  }

  if (req.path.startsWith(config.server.apiPrefix)) {
    return res.status(404).json({
      success: false,
      message: `API endpoint '${req.method} ${req.originalUrl}' not found.`
    });
  }

  res.status(404).json({
    success: false,
    message: `Resource '${req.method} ${req.originalUrl}' not found.`
  });
});

// Mount global error handler middleware (MUST be last)
app.use(errorHandler);

// Database connection check, initialization and server startup
const startServer = async () => {
  try {
    const isDbConnected = await testConnection();
    if (!isDbConnected) {
      logger.error('Database connection could not be established. Exiting process.');
      process.exit(1);
    }

    if (config.db.autoInitialize) {
      await initDatabase();
    } else {
      logger.info('Database auto-initialization disabled. Using existing production schema.');
    }

    // Start background hold expiration scheduler
    const { startHoldScheduler } = require('./utils/hold.scheduler');
    const holdIntervalId = startHoldScheduler(pool);

    // Start background retention scheduler (auto-delete 3mo notifications & 6mo contact messages)
    const { startRetentionScheduler } = require('./utils/retention.scheduler');
    const retentionIntervalId = startRetentionScheduler(pool);

    // Start background AMC lifecycle scheduler (automated expiry reminders & contract status sweeps)
    const { startAmcScheduler, stopAmcScheduler } = require('./schedulers/amc.scheduler');
    startAmcScheduler(pool);

    const server = app.listen(config.server.port, config.server.host, () => {
      logger.info(`==================================================`);
      logger.info(`Server running in [${config.env}] mode`);
      logger.info(`Public URL: ${config.server.publicOrigin || 'n/a'}${config.server.apiPrefix}`);
      logger.info(`Bound on port ${config.server.port} (internal; fronted by Apache/Passenger in production)`);
      logger.info(`API endpoints prefix: ${config.server.apiPrefix}`);
      logger.info(`Serving frontend from: ${config.paths.frontendBuild}`);
      logger.info(`==================================================`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${config.server.port} is already in use. Please terminate the existing server process on port ${config.server.port} or configure a different PORT in .env`);
      } else {
        logger.error('Server encountered an error:', err);
      }
      process.exit(1);
    });

    // Graceful Shutdown handling
    const gracefulShutdown = (signal) => {
      logger.info(`${signal} received. Initiating graceful shutdown...`);
      if (holdIntervalId) clearInterval(holdIntervalId);
      if (retentionIntervalId) clearInterval(retentionIntervalId);
      stopAmcScheduler();
      server.close(async () => {
        logger.info('HTTP server closed.');
        try {
          await pool.end();
          logger.info('Database connection pool terminated.');
          process.exit(0);
        } catch (err) {
          logger.error('Error closing database pool:', err);
          process.exit(1);
        }
      });

      // Force shutdown if connections do not close in 10s
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = app;
