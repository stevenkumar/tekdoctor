const { pool } = require('../config/db.config');
const { formatResponse } = require('../utils/helpers');

const getNotifications = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const userId = req.user.id;
        const [rows] = await connection.query(
            `SELECT n.*, u.name as sender_name, u.email as sender_email, sr.ticket_number 
             FROM notifications n 
             LEFT JOIN users u ON n.sender_id = u.id 
             LEFT JOIN service_requests sr ON n.ticket_id = sr.id 
             WHERE n.user_id = ? 
             ORDER BY n.created_at DESC LIMIT 50`,
            [userId]
        );
        return res.json(formatResponse(true, 'Notifications fetched.', rows));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const markAsRead = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        if (id === 'all') {
            await connection.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.user.id]);
        } else {
            await connection.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [id, req.user.id]);
        }
        return res.json(formatResponse(true, 'Notification marked as read.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const deleteNotification = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        await connection.query('DELETE FROM notifications WHERE id = ? AND user_id = ?', [id, req.user.id]);
        return res.json(formatResponse(true, 'Notification deleted successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const clearAllNotifications = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.query('DELETE FROM notifications WHERE user_id = ?', [req.user.id]);
        return res.json(formatResponse(true, 'All notifications cleared successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Admin Functions ──

const sendNotification = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { userId, title, message, ticketId } = req.body;

        if (!userId || !title || !message) {
            return res.status(400).json(formatResponse(false, 'userId, title, and message are required.'));
        }

        const [user] = await connection.query('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
        if (user.length === 0) return res.status(404).json(formatResponse(false, 'User not found.'));

        await connection.query(
            'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
            [userId, title, message, ticketId || null, req.user.id]
        );

        return res.json(formatResponse(true, 'Notification sent successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const broadcastNotification = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { title, message, targetRole, ticketId } = req.body;

        if (!title || !message) {
            return res.status(400).json(formatResponse(false, 'title and message are required.'));
        }

        let query = 'SELECT id FROM users';
        const params = [];
        if (targetRole && targetRole !== 'all') {
            query += ' WHERE role = ?';
            params.push(targetRole);
        }

        const [users] = await connection.query(query, params);

        for (const user of users) {
            await connection.query(
                'INSERT INTO notifications (user_id, title, message, ticket_id, sender_id) VALUES (?, ?, ?, ?, ?)',
                [user.id, title, message, ticketId || null, req.user.id]
            );
        }

        return res.json(formatResponse(true, `Notification broadcast to ${users.length} user(s).`, { count: users.length }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getNotificationHistory = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const offset = (page - 1) * limit;

        const [[{ total }]] = await connection.query('SELECT COUNT(*) as total FROM notifications');
        const [rows] = await connection.query(
            `SELECT n.*, u.name as user_name, u.email as user_email,
                    s.name as sender_name, s.email as sender_email,
                    sr.ticket_number 
             FROM notifications n 
             LEFT JOIN users u ON n.user_id = u.id 
             LEFT JOIN users s ON n.sender_id = s.id 
             LEFT JOIN service_requests sr ON n.ticket_id = sr.id 
             ORDER BY n.created_at DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        return res.json(formatResponse(true, 'Notification history fetched.', {
            data: rows,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

module.exports = { getNotifications, markAsRead, sendNotification, broadcastNotification, getNotificationHistory, deleteNotification, clearAllNotifications };
