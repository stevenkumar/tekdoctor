const { pool } = require('../config/db.config');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const pushService = require('../services/push.service');

/**
 * GET /api/notifications/vapid-public-key
 * Returns active VAPID public key for browser push subscription
 */
const getVapidPublicKey = async (req, res, next) => {
  try {
    const publicKey = await pushService.getVapidPublicKey();
    return res.status(200).json(formatResponse(true, 'VAPID public key retrieved.', { publicKey }));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/notifications/subscribe
 * Authenticated user registers a browser PushSubscription
 */
const subscribe = async (req, res, next) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return res.status(400).json(formatResponse(false, 'Valid PushSubscription with endpoint and keys is required.'));
    }

    const userAgent = req.headers['user-agent'] || null;
    await pushService.saveSubscription(req.user.id, subscription, userAgent);
    return res.status(201).json(formatResponse(true, 'Push subscription registered successfully.'));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/notifications/unsubscribe
 * Authenticated user deletes a browser PushSubscription
 */
const unsubscribe = async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    await pushService.removeSubscription(req.user.id, endpoint || null);
    return res.status(200).json(formatResponse(true, 'Push subscription removed successfully.'));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/notifications
 * Get all notifications for the authenticated user
 */
const getNotifications = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const userId = req.user.id;
    const { limit } = req.query;

    let query = `SELECT n.*, 
       COALESCE(cp.company_name, u.name) as sender_name, 
       u.email as sender_email, 
       sr.ticket_number
       FROM notifications n
       LEFT JOIN users u ON n.sender_id = u.id
       LEFT JOIN company_profiles cp ON cp.user_id = u.id
       LEFT JOIN service_requests sr ON n.ticket_id = sr.id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC`;
    const params = [userId];

    if (limit !== undefined) {
      const parsedLimit = parseInt(limit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        const safeLimit = Math.min(parsedLimit, 100);
        query += ' LIMIT ?';
        params.push(safeLimit);
      }
    }

    const [rows] = await connection.query(query, params);

    // Fast indexed unread count (hits idx_notif_user_read)
    const [[{ unreadCount }]] = await connection.query(
      'SELECT COUNT(*) as unreadCount FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );

    const response = formatResponse(true, 'Notifications fetched successfully.', rows);
    response.unreadCount = Number(unreadCount || 0);

    return res.status(200).json(response);
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * PUT /api/notifications/:id/read
 * Mark a notification as read
 */
const markAsRead = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const { id } = req.params;
    const userId = req.user.id;

    // Handle "all" case
    if (id === 'all') {
      await connection.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
      return res.status(200).json(formatResponse(true, 'All notifications marked as read.'));
    }

    const [result] = await connection.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json(formatResponse(false, 'Notification not found.'));
    }

    return res.status(200).json(formatResponse(true, 'Notification marked as read.'));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
const deleteNotification = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const { id } = req.params;
    const userId = req.user.id;

    const [result] = await connection.query(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json(formatResponse(false, 'Notification not found.'));
    }

    return res.status(200).json(formatResponse(true, 'Notification deleted.'));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * DELETE /api/notifications
 * Clear all notifications for user
 */
const clearAllNotifications = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const userId = req.user.id;

    await connection.query('DELETE FROM notifications WHERE user_id = ?', [userId]);
    return res.status(200).json(formatResponse(true, 'All notifications cleared.'));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * POST /api/notifications/bulk-delete
 * Admin bulk deletes notification records
 */
const bulkDeleteNotifications = async (req, res, next) => {
  let connection;
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json(formatResponse(false, 'Please provide an array of notification IDs to delete.'));
    }

    const validIds = ids.map(id => Number(id)).filter(id => !isNaN(id) && id > 0);
    if (validIds.length === 0) {
      return res.status(400).json(formatResponse(false, 'No valid notification IDs provided.'));
    }

    connection = await pool.getConnection();
    const [result] = await connection.query('DELETE FROM notifications WHERE id IN (?)', [validIds]);

    logger.info(`Admin ${req.user.id} bulk deleted ${result.affectedRows} notifications.`);
    return res.status(200).json(formatResponse(true, `${result.affectedRows} notification(s) deleted successfully.`, {
      deletedCount: result.affectedRows
    }));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * POST /api/notifications/send
 * Admin/Technician sends notification to specific user
 */
const sendNotification = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const { userId, title, message, ticketId } = req.body;

    if (!userId || !title || !message) {
      return res.status(400).json(formatResponse(false, 'userId, title, and message are required.'));
    }

    const [result] = await connection.query(
      'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
      [userId, title, message, ticketId || null, req.user.id]
    );

    // Dispatch Web Push lockscreen alert to target user
    pushService.sendPushToUser(userId, {
      title,
      body: message,
      url: ticketId ? `/repair/status?ticket=${ticketId}` : '/notifications',
      tag: ticketId ? `ticket-${ticketId}` : 'tekdoctor-alert'
    }).catch(err => logger.debug(`[Push] Push dispatch error: ${err.message}`));

    logger.info(`Notification sent to user ${userId} by ${req.user.role} ${req.user.id}`);
    return res.status(201).json(formatResponse(true, 'Notification sent.', { id: result.insertId }));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * POST /api/notifications/broadcast
 * Admin broadcasts notification to all users or specific role
 */
const broadcastNotification = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const { title, message, targetRole } = req.body;

    if (!title || !message) {
      return res.status(400).json(formatResponse(false, 'Title and message are required.'));
    }

    let query = 'SELECT id FROM users WHERE is_active = 1';
    const params = [];

    if (targetRole) {
      query += ' AND role = ?';
      params.push(targetRole);
    }

    const [users] = await connection.query(query, params);

    if (users.length === 0) {
      return res.status(404).json(formatResponse(false, 'No users found to notify.'));
    }

    const values = users.map(u => [u.id, title, message, null, req.user.id]);
    await connection.query(
      'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES ?',
      [values]
    );

    // Dispatch Web Push alert to all targeted users
    pushService.sendPushToUser(users.map(u => u.id), {
      title,
      body: message,
      url: '/notifications',
      tag: 'tekdoctor-broadcast'
    }).catch(err => logger.debug(`[Push] Broadcast push error: ${err.message}`));

    logger.info(`Broadcast notification sent to ${users.length} users by admin ${req.user.id}`);
    return res.status(201).json(formatResponse(true, `Notification sent to ${users.length} users.`));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Central helper to create an in-app notification row and dispatch a real-time Web Push alert.
 */
const dispatchNotification = async (connOrPool, { userId, title, message, ticketId = null, senderId = null, url = null, tag = null }) => {
  try {
    const conn = connOrPool || pool;
    const [result] = await conn.query(
      'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
      [userId, title, message, ticketId, senderId]
    );

    let resolvedUrl = url;
    if (!resolvedUrl) {
      let userRole = 'customer';
      try {
        const [uRows] = await conn.query('SELECT role FROM users WHERE id = ? LIMIT 1', [userId]);
        if (uRows && uRows.length > 0 && uRows[0].role) {
          userRole = uRows[0].role;
        }
      } catch (_) {}

      if (ticketId) {
        if (userRole === 'admin') resolvedUrl = `/admin/repair-tickets?search=${encodeURIComponent(ticketId)}`;
        else if (userRole === 'technician') resolvedUrl = '/technician/assigned-tickets';
        else if (userRole === 'company') resolvedUrl = `/company/repairs?ticket=${encodeURIComponent(ticketId)}`;
        else resolvedUrl = `/repair/status?ticket=${encodeURIComponent(ticketId)}`;
      } else {
        if (userRole === 'admin') resolvedUrl = '/admin/notifications';
        else if (userRole === 'technician') resolvedUrl = '/technician/notifications';
        else if (userRole === 'company') resolvedUrl = '/company/repairs';
        else resolvedUrl = '/notifications';
      }
    }

    pushService.sendPushToUser(userId, {
      title,
      body: message,
      url: resolvedUrl,
      tag: tag || (ticketId ? `tkt-${ticketId}` : 'tekdoctor-alert')
    }).catch(err => logger.debug(`[Push] Dispatch error: ${err.message}`));

    return result.insertId;
  } catch (err) {
    logger.error(`[Notification] dispatchNotification error for user ${userId}: ${err.message}`);
    throw err;
  }
};

/**
 * GET /api/notifications/history
 * Admin gets notification history with user details
 */
const getNotificationHistory = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;

    const [[{ total }]] = await connection.query(
      `SELECT COUNT(*) as total FROM notifications n LEFT JOIN users u ON n.user_id = u.id`
    );

    const [rows] = await connection.query(
      `SELECT n.*, u.name as user_name, u.email as user_email, u.role as user_role
       FROM notifications n
       LEFT JOIN users u ON n.user_id = u.id
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return res.status(200).json(formatResponse(true, 'Notification history fetched.', {
      data: rows,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  deleteNotification,
  bulkDeleteNotifications,
  clearAllNotifications,
  sendNotification,
  broadcastNotification,
  getNotificationHistory,
  getVapidPublicKey,
  subscribe,
  unsubscribe,
  dispatchNotification
};