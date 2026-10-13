const { formatResponse } = require('../utils/helpers');
const { verifyRecaptchaEnterprise } = require('../utils/recaptcha.utils');
const logger = require('../utils/logger');

/**
 * Express middleware to enforce Google reCAPTCHA Enterprise verification on specific routes.
 *
 * @param {string} expectedAction - Action name expected for this endpoint ('login', 'signup', etc.)
 * @returns {Function} Express middleware function
 */
const verifyRecaptcha = (expectedAction) => {
  return async (req, res, next) => {
    try {
      const token = req.body?.recaptchaToken || req.headers['x-recaptcha-token'];

      const result = await verifyRecaptchaEnterprise({
        token,
        expectedAction,
        clientIp: req.ip
      });

      if (!result.success) {
        logger.warn(`[reCAPTCHA] Request blocked on ${req.originalUrl || req.url} for action "${expectedAction}": ${result.reason}`);
        
        const response = formatResponse(
          false,
          result.reason || 'Security verification failed. Please try again.',
          { recaptcha: result.reason || 'Invalid or missing reCAPTCHA token.' }
        );
        response.errors = { recaptcha: result.reason || 'Invalid or missing reCAPTCHA token.' };
        return res.status(400).json(response);
      }

      // Attach verification details to request for downstream logging or audit
      req.recaptcha = result;
      return next();

    } catch (error) {
      logger.error(`[reCAPTCHA] Middleware error on action "${expectedAction}": ${error.message}`);
      const response = formatResponse(false, 'Security verification service encountered an internal error.');
      return res.status(500).json(response);
    }
  };
};

module.exports = {
  verifyRecaptcha
};
