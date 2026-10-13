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

// Route-level alias reusing existing global rate limiter configuration
const apiLimiter = globalLimiter;

module.exports = {
  globalLimiter,
  apiLimiter,
  authLimiter,
  contactLimiter
};
