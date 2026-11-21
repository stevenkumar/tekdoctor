const logger = require('../utils/logger');
const amcService = require('../services/amc.service');

const AMC_SCHEDULER_LOCK_NAME = 'tekdoctor_amc_scheduler_lock';

/**
 * Executes a task within the context of the shared AMC MySQL advisory lock.
 * Guarantees that scheduled sweeps and manual admin triggers share the exact same
 * lock namespace, connection session binding, and guaranteed release in finally.
 *
 * @param {Object} pool - MySQL database pool
 * @param {Function} taskFn - Async function taking (connection)
 * @param {Object} [options]
 * @param {number} [options.timeoutSeconds=0]
 * @returns {Promise<Object>} Execution result or { locked: true, skipped: true }
 */
const withAmcAdvisoryLock = async (pool, taskFn, { timeoutSeconds = 0 } = {}) => {
  let connection;
  let lockAcquired = false;

  try {
    connection = await pool.getConnection();

    // Acquire non-blocking or timed advisory lock
    const [lockRows] = await connection.query(
      'SELECT GET_LOCK(?, ?) AS lock_acquired',
      [AMC_SCHEDULER_LOCK_NAME, timeoutSeconds]
    );

    if (!lockRows[0] || lockRows[0].lock_acquired !== 1) {
      logger.warn('[AMC Lock] Another worker or maintenance sweep is currently executing with lock. Skipping.');
      return {
        success: false,
        skipped: true,
        locked: true,
        reason: 'LOCK_NOT_ACQUIRED',
        message: 'Another worker or scheduled maintenance sweep is currently in progress. Please try again shortly.'
      };
    }
    lockAcquired = true;

    const taskResult = await taskFn(connection);
    return {
      success: true,
      locked: false,
      ...taskResult
    };

  } catch (error) {
    logger.error(`[AMC Lock] Error executing locked task: ${error.message}`);
    throw error;
  } finally {
    if (connection) {
      if (lockAcquired) {
        try {
          await connection.query('SELECT RELEASE_LOCK(?)', [AMC_SCHEDULER_LOCK_NAME]);
        } catch (releaseErr) {
          logger.error(`[AMC Lock] Error releasing advisory lock: ${releaseErr.message}`);
        }
      }
      connection.release();
    }
  }
};

/**
 * Executes a full AMC maintenance sweep:
 * 1. Contract & offer expiry status transitions (atomic transactions)
 * 2. Automated expiry reminders based on configured milestones (outbox lifecycle)
 * 3. Selection deadline reminders for pending renewal contracts
 *
 * Employs MySQL advisory locks to guarantee that in multi-worker or multi-process
 * deployments, only a single instance runs the sweep at any given time.
 *
 * @param {Object} pool - MySQL database pool
 * @returns {Promise<Object>} Execution summary
 */
const runAmcMaintenanceSweep = async (pool) => {
  return withAmcAdvisoryLock(pool, async (connection) => {
    logger.info('[AMC Scheduler] Starting scheduled AMC maintenance sweep...');

    // 1. Process contract expiries and expired offers
    const expiryResults = await amcService.processContractExpiries(connection);
    if (expiryResults.expiredContractsCount > 0 || expiryResults.expiredOffersCount > 0) {
      logger.info(`[AMC Scheduler] Processed expiries: ${expiryResults.expiredContractsCount} contracts expired, ${expiryResults.expiredOffersCount} offers expired.`);
    }

    // 2. Process automated expiry reminders (with milestone deduplication and outbox retry)
    const reminderResults = await amcService.processExpiryReminders(connection);
    if (reminderResults.remindersSent > 0) {
      logger.info(`[AMC Scheduler] Dispatched ${reminderResults.remindersSent} AMC expiry reminders.`);
    }

    // 3. Process device selection deadline reminders
    const deadlineResults = await amcService.processSelectionDeadlineReminders(connection);
    if (deadlineResults.remindersSent > 0) {
      logger.info(`[AMC Scheduler] Dispatched ${deadlineResults.remindersSent} selection deadline alerts.`);
    }

    // 4. Process checkout session expiries
    const expiredCheckoutsCount = await amcService.processCheckoutExpiries(connection);
    if (expiredCheckoutsCount > 0) {
      logger.info(`[AMC Scheduler] Processed ${expiredCheckoutsCount} expired AMC checkouts.`);
    }

    logger.info('[AMC Scheduler] AMC maintenance sweep completed successfully.');
    return {
      expiryResults,
      reminderResults,
      deadlineResults,
      expiredCheckoutsCount
    };
  });
};

let activeSchedulerTimer = null;

/**
 * Starts the AMC background scheduler.
 * Defaults to hourly checks (3,600,000 ms).
 *
 * @param {Object} pool - MySQL database pool
 * @param {number} [intervalMs=3600000] - Interval in milliseconds
 * @returns {NodeJS.Timeout}
 */
const startAmcScheduler = (pool, intervalMs = 60 * 60 * 1000) => {
  if (activeSchedulerTimer) {
    clearInterval(activeSchedulerTimer);
  }

  // Run once shortly after startup (after 5 seconds to let server bind)
  setTimeout(() => {
    runAmcMaintenanceSweep(pool).catch(err => {
      logger.error(`[AMC Scheduler] Startup sweep error: ${err.message}`);
    });
  }, 5000);

  // Schedule periodic execution
  activeSchedulerTimer = setInterval(() => {
    runAmcMaintenanceSweep(pool).catch(err => {
      logger.error(`[AMC Scheduler] Periodic sweep error: ${err.message}`);
    });
  }, intervalMs);

  logger.info('[AMC Scheduler] Automated AMC lifecycle scheduler initialized.');
  return activeSchedulerTimer;
};

/**
 * Stops the AMC background scheduler (for graceful shutdown).
 */
const stopAmcScheduler = () => {
  if (activeSchedulerTimer) {
    clearInterval(activeSchedulerTimer);
    activeSchedulerTimer = null;
    logger.info('[AMC Scheduler] AMC lifecycle scheduler stopped.');
  }
};

module.exports = {
  AMC_SCHEDULER_LOCK_NAME,
  withAmcAdvisoryLock,
  runAmcMaintenanceSweep,
  startAmcScheduler,
  stopAmcScheduler
};
