const { pool } = require('../config/db.config');
const logger = require('./logger');

/**
 * Log an activity in the system.
 * @param {number|null} userId - The user ID of the actor
 * @param {string} category - Category ('user', 'company', 'technician', 'admin', 'repair', 'billing', 'website', 'security', 'notification')
 * @param {string} action - Action identifier (e.g. 'registration', 'login', 'create_ticket')
 * @param {string|null} targetType - The type of target matching (e.g. 'service_requests', 'users')
 * @param {number|string|null} targetId - The target record ID
 * @param {Object|null} details - Custom JSON details (e.g. ticket number, change diff)
 * @param {string|null} ipAddress - The client's IP address
 */
const logActivity = async (userId, category, action, targetType = null, targetId = null, details = null, ipAddress = null) => {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.query(
            'INSERT INTO activity_logs (user_id, category, action, target_type, target_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                userId || null,
                category || 'system',
                action,
                targetType || null,
                targetId ? String(targetId) : null,
                details ? JSON.stringify(details) : null,
                ipAddress || null
            ]
        );
    } catch (e) {
        logger.error('Failed to log activity: ' + e.message);
    } finally {
        if (connection) connection.release();
    }
};

module.exports = { logActivity };
