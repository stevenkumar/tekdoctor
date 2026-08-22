const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

/**
 * TekDoctor — Centralized Server Configuration
 * 
 * This file serves as the single source of truth for all environment variables,
 * paths, database configurations, and app-wide constants.
 * 
 * Hosting Configuration Notes:
 * 1. cPanel:
 *    - FRONTEND_BUILD_PATH = '/home/username/public_html'
 *    - UPLOAD_DIR = '/home/username/public_html/uploads' (or subfolder in public_html)
 * 2. Hostinger:
 *    - FRONTEND_BUILD_PATH = '/home/u123456789/domains/tekunik.vibgyorventures.co.in/public_html'
 * 3. VPS (Nginx / Apache):
 *    - FRONTEND_BUILD_PATH = '/var/www/tekdoctor/client/dist'
 * 4. Local:
 *    - FRONTEND_BUILD_PATH = '../client/dist'
 */

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  isProduction: env === 'production',

  server: {
    port: process.env.PORT || 5000,
    host: process.env.HOST || 'localhost',
    // Split CORS origins by comma to support multiple origins
    corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000,http://localhost:3001').split(','),
    apiPrefix: '/api'
  },

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tekdoctor_db',
    connectionLimit: 10,
    queueLimit: 0,
    waitForConnections: true
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'tekdoctor-secret-key-change-in-production-12345',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
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
    frontendBuild: path.resolve(__dirname, '..', process.env.FRONTEND_BUILD_PATH || '../client/dist'),
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
      max: 500 // Limit each IP to 500 requests per windowMs
    },
    auth: {
      windowMs: 15 * 60 * 1000,
      max: 15000 // Limit each IP to 15 login/signup requests per windowMs
    },
    contact: {
      windowMs: 15 * 60 * 1000,
      max: 5 // Limit each IP to 5 contact requests per windowMs
    }
  }
};

module.exports = config;
