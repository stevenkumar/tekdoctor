/**
 * TekDoctor — Production-Ready Express Server Entry Point
 * 
 * Deployment Checklist:
 * 1. Environment: Set NODE_ENV=production in your .env file on the live server.
 * 2. Ports & Domain:
 *    - Port is configurable via process.env.PORT (Default: 5000)
 *    - Domain host is configured via process.env.HOST (Default: localhost)
 * 3. Database:
 *    - Create your MySQL database (local or on cPanel/Hostinger/VPS).
 *    - Provide database name, user, password, host, and port in .env.
 * 4. Frontend static path:
 *    - Update FRONTEND_BUILD_PATH in .env to map to your HTML/JS distribution folder.
 *    - Local development: ../client/dist
 *    - cPanel: /home/username/public_html
 *    - Hostinger: /home/u123456789/domains/tekunik.vibgyorventures.co.in/public_html
 * 5. PM2 Process management (for VPS):
 *    - Run server with: pm2 start server.js --name "tekdoctor-server"
 * 6. Reverse Proxy (Nginx VPS Configuration):
 *    ```nginx
 *    location /api {
 *        proxy_pass http://localhost:5000;
 *        proxy_http_version 1.1;
 *        proxy_set_header Upgrade $http_upgrade;
 *        proxy_set_header Connection 'upgrade';
 *        proxy_set_header Host $host;
 *        proxy_cache_bypass $http_upgrade;
 *    }
 *    location /uploads {
 *        alias /var/www/tekdoctor/server/uploads;
 *    }
 *    location / {
 *        root /var/www/tekdoctor/client/dist;
 *        try_files $uri $uri/ /index.html;
 *    }
 *    ```
 */

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

const app = express();

// Set up security headers
app.use(helmet({
  // Relax content security policy for serving uploaded user images and static files
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
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
      return callback(new Error(`CORS policy deviation: origin ${origin} is not allowed.`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Parse application/json and application/x-www-form-urlencoded
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging HTTP Requests using morgan stream with winston logger
app.use(morgan(':remote-addr - :method :url :status :res[content-length] - :response-time ms', { stream: logger.stream }));

// Apply global rate limiting to all requests
app.use(globalLimiter);

// Serve uploads folder statically (accessible at /uploads/*)
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

// Serve frontend build static files in production
if (config.env === 'production' || fs.existsSync(config.paths.frontendBuild)) {
  app.use(express.static(config.paths.frontendBuild));
  logger.info(`Serving production frontend build from: ${config.paths.frontendBuild}`);

  // Wildcard fallback: handle SPA routing (send index.html for non-API routes)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith(config.server.apiPrefix) || req.path.startsWith('/uploads')) {
      return next(); // Pass down to 404 handler
    }
    const indexFile = path.join(config.paths.frontendBuild, 'index.html');
    if (fs.existsSync(indexFile)) {
      res.sendFile(indexFile);
    } else {
      next();
    }
  });
} else {
  logger.warn(`Frontend build directory not found at: ${config.paths.frontendBuild}. Running API-only server.`);
}

// 404 Handler for API and Uploads
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `API endpoint '${req.method} ${req.originalUrl}' not found.`
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

    // Initialize tables and seed default admin
    await initDatabase();

    const server = app.listen(config.server.port, () => {
      logger.info(`==================================================`);
      logger.info(`Server running in [${config.env}] mode`);
      logger.info(`Listening at http://${config.server.host}:${config.server.port}`);
      logger.info(`API endpoints prefix: ${config.server.apiPrefix}`);
      logger.info(`==================================================`);
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

startServer();
