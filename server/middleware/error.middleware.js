const logger = require('../utils/logger');
const { formatResponse } = require('../utils/helpers');
const config = require('../config/app.config');

// MySQL Client-Side Constraint / Input Violation Error Codes
// Only these genuine client constraint errors should return HTTP 400 Bad Request.
// All schema, table, syntax, or internal database errors must return HTTP 500 Internal Server Error.
const CLIENT_CONSTRAINT_ERRORS = new Set([
  'ER_DUP_ENTRY',           // 1062: Duplicate entry for unique key
  'ER_NO_REFERENCED_ROW_2', // 1452: Foreign key fails (child row invalid parent reference)
  'ER_NO_REFERENCED_ROW',   // 1216: Foreign key fails (child row invalid parent reference)
  'ER_ROW_IS_REFERENCED_2', // 1451: Foreign key fails (parent row referenced by child)
  'ER_ROW_IS_REFERENCED',   // 1217: Foreign key fails (parent row referenced by child)
  'ER_BAD_NULL_ERROR',      // 1048: Column cannot be null
  'ER_DATA_TOO_LONG'        // 1406: Data too long for column
]);

/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
  // If response headers have already been sent to client, delegate to default Express handler
  // to avoid ERR_HTTP_HEADERS_SENT process crashes.
  if (res.headersSent) {
    return next(err);
  }

  // Enhanced logging: Ensure MySQL error code, errno, sqlMessage, and SQL statement are always written to logger.error
  const dbDetails = (err.code || err.errno || err.sqlMessage || err.sql)
    ? `\nDB Details: Code=${err.code || 'N/A'}, Errno=${err.errno || 'N/A'}, SqlMessage=${err.sqlMessage || 'N/A'}${err.sql ? `\nSQL: ${err.sql}` : ''}`
    : '';
  logger.error(`${err.message}\nRequest details: ${req.method} ${req.originalUrl}${dbDetails}\nStack: ${err.stack}`);

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
  if (err.code && (err.code.startsWith('ER_') || typeof err.errno === 'number')) {
    if (CLIENT_CONSTRAINT_ERRORS.has(err.code)) {
      statusCode = 400;

      // Customize message for genuine client-side database constraint errors
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
      } else if (err.code === 'ER_BAD_NULL_ERROR') {
        message = 'A required field is missing or cannot be null.';
        const match = err.sqlMessage && err.sqlMessage.match(/Column '(.+)'/i);
        if (match) {
          errors = { [match[1]]: 'This field is required.' };
        }
      } else if (err.code === 'ER_DATA_TOO_LONG') {
        message = 'Provided data exceeds maximum allowed length.';
        const match = err.sqlMessage && err.sqlMessage.match(/column '(.+)'/i);
        if (match) {
          errors = { [match[1]]: 'Value exceeds maximum length.' };
        }
      } else {
        message = 'A database constraint error occurred.';
      }
    } else {
      // Schema/table/syntax/internal server database errors (e.g. ER_NO_SUCH_TABLE, ER_BAD_FIELD_ERROR)
      statusCode = 500;
      message = config.isProduction ? 'Internal server error' : `Database Error [${err.code || err.errno}]: ${err.sqlMessage || err.message}`;
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

  if (errors) {
    responseData.errors = errors;
  }

  // If in development mode and it was a 500 error, add debug stack
  if (config.env !== 'production' && statusCode === 500) {
    responseData.stack = err.stack;
    responseData.originalError = err.message;
    if (err.code) responseData.errorCode = err.code;
    if (err.sqlMessage) responseData.sqlMessage = err.sqlMessage;
  }

  res.status(statusCode).json(responseData);
};

module.exports = errorHandler;
