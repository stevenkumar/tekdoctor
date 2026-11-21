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

// Dedicated rate limiter for public repair bookings
const bookingLimiter = rateLimit({
  windowMs: config.rateLimits.booking?.windowMs || 15 * 60 * 1000,
  max: config.rateLimits.booking?.max || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: formatResponse(false, 'Too many repair requests submitted from this IP. Please try again after 15 minutes.'),
  skip: isDevOrLocal
});

// Dedicated rate limiter for public ticket tracking lookup (prevents 4-digit mobile enumeration)
const trackingLimiter = rateLimit({
  windowMs: config.rateLimits.tracking?.windowMs || 15 * 60 * 1000,
  max: config.rateLimits.tracking?.max || 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: formatResponse(false, 'Too many tracking attempts from this IP. Please try again after 15 minutes.'),
  skip: isDevOrLocal
});

// Dedicated rate limiter for public AMC self-serve checkout
const amcCheckoutLimiter = rateLimit({
  windowMs: config.rateLimits?.amcCheckout?.windowMs || 15 * 60 * 1000,
  max: config.rateLimits?.amcCheckout?.max || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: formatResponse(false, 'Too many checkout attempts from this IP. Please try again after 15 minutes.'),
  skip: isDevOrLocal
});

// Route-level alias reusing existing global rate limiter configuration
const apiLimiter = globalLimiter;

module.exports = {
  globalLimiter,
  apiLimiter,
  authLimiter,
  contactLimiter,
  certVerifyLimiter,
  bookingLimiter,
  trackingLimiter,
  amcCheckoutLimiter
};
