const logger = require('../utils/logger');
const { formatResponse } = require('../utils/helpers');
const config = require('../config/app.config');

/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
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
  }

  // Handle MySQL database errors
  if (err.code && err.code.startsWith('ER_')) {
    statusCode = 400;
    
    // Customize message for common database constraint errors
    if (err.code === 'ER_DUP_ENTRY') {
      message = 'A record with this identifier already exists.';
      // Extract the duplicate field if possible
      const match = err.sqlMessage.match(/key '(.+)'/);
      if (match) {
        errors = { [match[1]]: 'This value is already in use.' };
      }
    } else if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
      message = 'Invalid reference identifier provided.';
    } else if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      message = 'This record cannot be deleted because it is referenced by other items.';
    } else if (config.env === 'development') {
      message = `Database Error: ${err.sqlMessage}`;
    }
  }

  // Handle validation or explicit application errors
  if (err.message && statusCode !== 500) {
    message = err.message;
  }
  
  if (err.errors) {
    errors = err.errors;
  }

  // Prepare standard response format
  const responseData = formatResponse(false, message, errors);

  // If in development mode and it was a 500 error, add details
  if (config.env !== 'production' && statusCode === 500) {
    responseData.stack = err.stack;
    responseData.originalError = err.message;
  }

  res.status(statusCode).json(responseData);
};

module.exports = errorHandler;
