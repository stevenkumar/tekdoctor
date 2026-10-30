
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
      connectSrc: ["'self'", ...config.server.corsOrigins, 'https://accounts.google.com', 'https://oauth2.googleapis.com', 'https://api.razorpay.com', 'https://checkout.razorpay.com', 'https://www.google.com/recaptcha/', 'https://recaptchaenterprise.googleapis.com', 'https://www.recaptcha.net/'],
      fontSrc: ["'self'", 'data:', 'https:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      frameSrc: ["'self'", 'https://accounts.google.com', 'https://checkout.razorpay.com', 'https://www.google.com/recaptcha/', 'https://recaptcha.google.com/recaptcha/', 'https://www.recaptcha.net/'],
      imgSrc: ["'self'", 'data:', 'https:', 'https://lh3.googleusercontent.com'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client', 'https://apis.google.com', 'https://checkout.razorpay.com', 'https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/', 'https://www.recaptcha.net/'],
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
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or postman)
    if (!origin) return callback(null, true);

    // Check if origin is allowed
    const isAllowed = config.server.corsOrigins.some(allowedOrigin => {
      // Direct match or wildcard match
      if (allowedOrigin === '*') return true;
      if (allowedOrigin.trim() === origin.trim()) return true;
      return false;
    });

    if (isAllowed) {
      return callback(null, true);
    } else {
      const denied = new Error(`CORS policy deviation: origin ${origin} is not allowed.`);
      denied.statusCode = 403;
      return callback(denied);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Company-ID']
}));

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

// Apply global rate limiting to all requests
app.use(globalLimiter);

// Serve uploads folder statically (accessible at /uploads/*)
app.use('/uploads/device-images', express.static(config.paths.deviceImages));
app.use('/uploads/screenshots', express.static(config.paths.screenshots));
app.use('/uploads/repairs/images', express.static(config.paths.deviceImages));
app.use('/uploads/repairs/screenshots', express.static(config.paths.screenshots));
app.use('/uploads', express.static(config.paths.uploadsRoot));
logger.debug(`Serving static upload files from: ${config.paths.uploadsRoot}`);

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

// Health Check Endpoint
app.get('/health', async (req, res) => {
  const isDbHealthy = await testConnection();
  res.status(isDbHealthy ? 200 : 500).json({
    status: isDbHealthy ? 'UP' : 'DOWN',
    env: config.env,
    database: isDbHealthy ? 'connected' : 'disconnected',
    timestamp: new Date()
  });
});

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
// On the cPanel/Passenger layout the docroot IS the app root, so server.js,
// config/, .env, node_modules/ etc. sit in the same folder as the SPA assets
// and Apache may serve them as plain static files. The .htaccess template
// blocks this at the Apache layer; this is the equivalent guard for any
// request that reaches Express.
const BLOCKED_TOP_LEVEL = new Set([
  'server.js', 'package.json', 'package-lock.json',
  'config', 'controllers', 'routes', 'middleware', 'models',
  'utils', 'node_modules', 'logs', 'tests', 'scripts'
]);
app.use((req, res, next) => {
  let segment = '';
  try {
    segment = decodeURIComponent(req.path).split('/')[1] || '';
  } catch {
    segment = req.path.split('/')[1] || '';
  }
  // Leading-dot names (.env, .git, .htaccess ...) are never valid app routes.
  if (segment.startsWith('.') || BLOCKED_TOP_LEVEL.has(segment)) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  next();
});

// Serve static assets from all candidate build folders
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
];

const uniqueStaticDirs = [...new Set(candidateStaticDirs)].filter(dir => dir && fs.existsSync(dir));

uniqueStaticDirs.forEach(dir => {
  app.use(express.static(dir, {
    index: false, // Let SPA fallback handle index.html
    dotfiles: 'deny',
    maxAge: config.isProduction ? '1d' : 0
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
    startHoldScheduler(pool);

    // Start background retention scheduler (auto-delete 3mo notifications & 6mo contact messages)
    const { startRetentionScheduler } = require('./utils/retention.scheduler');
    startRetentionScheduler(pool);

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
