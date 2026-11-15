const logger = require('../utils/logger');
const { formatResponse } = require('../utils/helpers');
const config = require('../config/app.config');

/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
  // If response headers have already been sent to client, delegate to default Express handler
  // to avoid ERR_HTTP_HEADERS_SENT process crashes.
  if (res.headersSent) {
    return next(err);
  }

  // Log the complete error stack trace
  logger.error(`${err.message}\nRequest details: ${req.method} ${req.originalUrl}\nStack: ${err.stack}`);

  // Default error properties
  let statusCode = err.statusCode || 500;
  let message = 'An unexpected error occurred on the server.';
  let errors = null;

  // Handle Multer upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    message = `File upload size limit exceeded. Max size allowed is ${config.uploads.maxSizeBytes / (1024 * 1024)}MB.`;
  } else if (err.name === 'MulterError' || (err.message && (err.message.includes('not supported') || err.message.includes('file type') || err.message.includes('Invalid file')))) {
    statusCode = 400;
    message = err.message;
  }

  // Handle MySQL database errors
  if (err.code && err.code.startsWith('ER_')) {
    statusCode = 400;
    
    // Customize message for common database constraint errors
    if (err.code === 'ER_DUP_ENTRY') {
      message = 'A record with this identifier already exists.';
      // Extract the duplicate field if possible
      const match = err.sqlMessage && err.sqlMessage.match(/key '(.+)'/);
      if (match) {
        errors = { [match[1]]: 'This value is already in use.' };
      }
    } else if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
      message = 'Invalid reference identifier provided.';
    } else if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      message = 'This record cannot be deleted because it is referenced by other items.';
    } else {
      // In production, strictly mask internal database errors and table schema details
      message = config.isProduction ? 'A database constraint error occurred.' : `Database Error: ${err.sqlMessage || err.message}`;
    }
  } else if (err.message) {
    // In production, never leak 500 error messages or internal system paths
    if (statusCode !== 500 || !config.isProduction) {
      message = err.message;
    }
  }
  
  if (err.errors) {
    errors = err.errors;
  }

  // Prepare standard response format
  const responseData = formatResponse(false, message, errors);

  // If in development mode and it was a 500 error, add debug stack
  if (config.env !== 'production' && statusCode === 500) {
    responseData.stack = err.stack;
    responseData.originalError = err.message;
  }

  res.status(statusCode).json(responseData);
};

module.exports = errorHandler;
