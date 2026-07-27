const rateLimit = require('express-rate-limit');
const config = require('../config/app.config');
const { formatResponse } = require('../utils/helpers');

// Global rate limiter (100 requests per 15 minutes)
const globalLimiter = rateLimit({
  windowMs: config.rateLimits.global.windowMs,
  max: config.rateLimits.global.max,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false,  // Disable the `X-RateLimit-*` headers
  message: formatResponse(false, 'Too many requests from this IP. Please try again after 15 minutes.'),
  skip: (req) => {
    // Skip rate limiting for authenticated dashboard requests (they carry bearer tokens)
    return req.headers.authorization ? true : false;
  }
});

// Auth endpoints rate limiter (15 requests per 15 minutes)
const authLimiter = rateLimit({
  windowMs: config.rateLimits.auth.windowMs,
  max: config.rateLimits.auth.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: formatResponse(false, 'Too many authentication attempts. Please try again after 15 minutes.')
});

// Contact form rate limiter (5 requests per 15 minutes)
const contactLimiter = rateLimit({
  windowMs: config.rateLimits.contact.windowMs,
  max: config.rateLimits.contact.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: formatResponse(false, 'Too many contact messages sent. Please try again after 15 minutes.')
});

module.exports = {
  globalLimiter,
  authLimiter,
  contactLimiter
};
