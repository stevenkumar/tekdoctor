'use strict';

// Standalone database initializer.
// Creates the full schema, seeds defaults and applies migrations using the
// same code path the server runs on boot. Safe to run repeatedly.
//
//   npm run db:init        (from the server/ folder)

const initDatabase = require('../models/db.init');
const { testConnection } = require('../config/db.config');
const logger = require('../utils/logger');

(async () => {
  try {
    const connected = await testConnection();
    if (!connected) {
      logger.error('Database initialization aborted: could not connect with the configured DB_* settings.');
      process.exit(1);
    }

    await initDatabase();
    logger.info('Database schema initialization completed successfully.');
    process.exit(0);
  } catch (error) {
    logger.error('Database initialization failed:', error);
    process.exit(1);
  }
})();
