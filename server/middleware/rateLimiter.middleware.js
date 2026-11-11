const rateLimit = require('express-rate-limit');
const config = require('../config/app.config');
const { formatResponse } = require('../utils/helpers');

const isDevOrLocal = (req) => {
  return config.env === 'development' || config.env === 'test';
};

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: config.rateLimits.global.windowMs,
  max: config.rateLimits.global.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: formatResponse(false, 'Too many requests from this IP. Please try again after 15 minutes.'),
  skip: isDevOrLocal
});

// Auth endpoints rate limiter
const authLimiter = rateLimit({
  windowMs: config.rateLimits.auth.windowMs,
  max: config.rateLimits.auth.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: formatResponse(false, 'Too many authentication attempts. Please try again after 15 minutes.'),
  skip: isDevOrLocal
});

// Contact form rate limiter
const contactLimiter = rateLimit({
  windowMs: config.rateLimits.contact.windowMs,
  max: config.rateLimits.contact.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: formatResponse(false, 'Too many contact messages sent. Please try again after 15 minutes.')
});

// Dedicated rate limiter for public certificate verification (Fix 3, SEC-01 Hardening)
const certVerifyLimiter = rateLimit({
  windowMs: config.rateLimits.certVerify?.windowMs || 15 * 60 * 1000,
  max: config.rateLimits.certVerify?.max || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: formatResponse(false, 'Too many certificate verification requests. Please try again after 15 minutes.'),
  // SEC-01: Header bypass is strictly confined to test environment; never active in dev or production
  skip: (req) => config.env === 'test' && req.headers['x-bypass-rate-limit'] === 'test-bypass'
});

// Route-level alias reusing existing global rate limiter configuration
const apiLimiter = globalLimiter;

module.exports = {
  globalLimiter,
  apiLimiter,
  authLimiter,
  contactLimiter,
  certVerifyLimiter
};
