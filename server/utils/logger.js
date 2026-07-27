const winston = require('winston');
const path = require('path');
const config = require('../config/app.config');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Define custom log format
const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

// Create the winston logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    // Output error logs to error.log
    new winston.transports.File({ 
      filename: path.join(config.logging.directory, config.logging.errorLogFile), 
      level: 'error' 
    }),
    // Output all logs to combined.log
    new winston.transports.File({ 
      filename: path.join(config.logging.directory, config.logging.combinedLogFile) 
    })
  ],
  exitOnError: false // Do not exit on handled exceptions
});

// If we are in development, also log to the console with colors
if (config.env !== 'production') {
  logger.add(new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      logFormat
    )
  }));
}

// Stream for morgan HTTP logger integration
logger.stream = {
  write: (message) => logger.info(message.trim())
};

module.exports = logger;
