const logger = require('./logger');

/**
 * Retention Policy Cleanup for TekDoctor
 * - Notifications History: Auto-delete records older than 3 months (preserving active unread ticket alerts)
 * - Contact Messages: Auto-delete messages older than 6 months
 */

/**
 * Executes retention cleanup for notifications and contact messages.
 * @param {Object} pool - MySQL database pool
 * @returns {Promise<{ deletedNotifications: number, deletedContacts: number }>}
 */
const processRetentionCleanup = async (pool) => {
  let connection;
  try {
    connection = await pool.getConnection();

    let deletedNotifications = 0;
    let deletedContacts = 0;

    // 1. Clean up Notification History (> 3 months)
    // Safely preserves any unread notifications tied to currently pending/in-progress tickets
    try {
      const [notifResult] = await connection.query(`
        DELETE FROM notifications 
        WHERE created_at < DATE_SUB(NOW(), INTERVAL 3 MONTH)
          AND (
            is_read = 1 
            OR ticket_id IS NULL 
            OR ticket_id NOT IN (
              SELECT id FROM (
                SELECT id FROM service_requests WHERE status IN ('pending', 'in_progress')
              ) AS active_tickets
            )
          )
      `);
      deletedNotifications = notifResult.affectedRows || 0;
      if (deletedNotifications > 0) {
        logger.info(`[Retention Cleanup] Auto-deleted ${deletedNotifications} historical notification records older than 3 months.`);
      }
    } catch (notifErr) {
      logger.error(`[Retention Cleanup] Error deleting expired notifications: ${notifErr.message}`);
    }

    // 2. Clean up Contact Messages (> 6 months)
    try {
      const [contactResult] = await connection.query(`
        DELETE FROM contacts 
        WHERE created_at < DATE_SUB(NOW(), INTERVAL 6 MONTH)
      `);
      deletedContacts = contactResult.affectedRows || 0;
      if (deletedContacts > 0) {
        logger.info(`[Retention Cleanup] Auto-deleted ${deletedContacts} contact messages older than 6 months.`);
      }
    } catch (contactErr) {
      logger.error(`[Retention Cleanup] Error deleting expired contact messages: ${contactErr.message}`);
    }

    return { deletedNotifications, deletedContacts };

  } catch (error) {
    logger.error(`[Retention Cleanup] Unexpected database error: ${error.message}`);
    return { deletedNotifications: 0, deletedContacts: 0 };
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Start the background retention scheduler.
 * Defaults to checking every 6 hours (21,600,000 ms).
 * @param {Object} pool - MySQL database pool
 * @param {number} intervalMs - Interval in milliseconds
 * @returns {NodeJS.Timeout}
 */
const startRetentionScheduler = (pool, intervalMs = 6 * 60 * 60 * 1000) => {
  // Run once on server startup
  processRetentionCleanup(pool).catch(err => {
    logger.error(`[Retention Cleanup] Startup execution error: ${err.message}`);
  });

  // Schedule periodic cleanup
  const intervalId = setInterval(() => {
    processRetentionCleanup(pool).catch(err => {
      logger.error(`[Retention Cleanup] Periodic execution error: ${err.message}`);
    });
  }, intervalMs);

  logger.info('[Retention Cleanup] Automatic retention scheduler initialized.');
  return intervalId;
};

module.exports = {
  processRetentionCleanup,
  startRetentionScheduler
};
