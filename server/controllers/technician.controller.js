const bcrypt = require('bcryptjs');
const { pool } = require('../config/db.config');
const { formatResponse, generateTechnicianId } = require('../utils/helpers');
const logger = require('../utils/logger');
const { logActivity } = require('../utils/activity.logger');

/**
 * GET /api/technicians
 * Returns all users with role='technician'.
 * Admin-only — used to populate the Assign Technician dropdown.
 */
const getTechnicians = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(
            'SELECT id, technician_id, name, email, created_at, is_active FROM users WHERE role = ? ORDER BY name ASC',
            ['technician']
        );
        return res.status(200).json(formatResponse(true, 'Technicians fetched successfully.', rows));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

/**
 * POST /api/technicians
 * Admin creates a new technician account with name, email, and password.
 */
const createTechnician = async (req, res, next) => {
    const { name, email, password } = req.body;
    let connection;
    try {
        if (!name || !email || !password) {
            return res.status(400).json(formatResponse(false, 'Name, email, and password are required.'));
        }

        if (password.length < 8) {
            return res.status(400).json(formatResponse(false, 'Password must be at least 8 characters long.'));
        }

        connection = await pool.getConnection();

        // Check for duplicate email
        const [existing] = await connection.query(
            'SELECT id FROM users WHERE email = ? LIMIT 1',
            [email]
        );
        if (existing.length > 0) {
            return res.status(400).json(formatResponse(false, 'An account with this email already exists.'));
        }

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        const technicianId = await generateTechnicianId(connection);

        const [result] = await connection.query(
            'INSERT INTO users (name, email, password, role, technician_id) VALUES (?, ?, ?, ?, ?)',
            [name, email, hashedPassword, 'technician', technicianId]
        );

        logger.info(`Technician account created by admin: ${email} (ID: ${result.insertId}, TechID: ${technicianId})`);
        return res.status(201).json(formatResponse(true, 'Technician account created successfully.', {
            id: result.insertId,
            technician_id: technicianId,
            name,
            email,
            role: 'technician'
        }));

    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

/**
 * DELETE /api/technicians/:id
 * Admin removes a technician account.
 * Any tickets assigned to this technician are unassigned first.
 */
const deleteTechnician = async (req, res, next) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await pool.getConnection();

        // Verify this is a technician account
        const [rows] = await connection.query(
            'SELECT id, name FROM users WHERE id = ? AND role = ? LIMIT 1',
            [id, 'technician']
        );
        if (rows.length === 0) {
            return res.status(404).json(formatResponse(false, 'Technician not found.'));
        }

        // Unassign open tickets before deleting
        await connection.query(
            'UPDATE service_requests SET assigned_technician_id = NULL WHERE assigned_technician_id = ?',
            [id]
        );

        await connection.query('DELETE FROM users WHERE id = ?', [id]);

        logger.info(`Technician account deleted by admin: ${rows[0].name} (ID: ${id})`);
        return res.status(200).json(formatResponse(true, 'Technician account deleted successfully.'));

    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

/**
 * PUT /api/technicians/:id
 * Admin updates technician details.
 */
const updateTechnician = async (req, res, next) => {
    const { id } = req.params;
    const { name, email, phone } = req.body;
    let connection;
    try {
        connection = await pool.getConnection();

        const [rows] = await connection.query(
            'SELECT id FROM users WHERE id = ? AND role = ? LIMIT 1',
            [id, 'technician']
        );
        if (rows.length === 0) {
            return res.status(404).json(formatResponse(false, 'Technician not found.'));
        }

        await connection.query(
            'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
            [name, email, phone || null, id]
        );

        logger.info(`Technician updated by admin: ID ${id}`);
        return res.json(formatResponse(true, 'Technician updated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

/**
 * PATCH /api/technicians/:id/toggle-status
 * Admin activates or deactivates a technician account.
 */
const toggleTechnicianStatus = async (req, res, next) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await pool.getConnection();

        const [rows] = await connection.query(
            'SELECT id, name, is_active FROM users WHERE id = ? AND role = ? LIMIT 1',
            [id, 'technician']
        );
        if (rows.length === 0) {
            return res.status(404).json(formatResponse(false, 'Technician not found.'));
        }

        const newStatus = !rows[0].is_active;
        await connection.query('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, id]);

        logger.info(`Technician ${rows[0].name} (ID: ${id}) ${newStatus ? 'activated' : 'deactivated'} by admin.`);
        return res.json(formatResponse(true, `Technician ${newStatus ? 'activated' : 'deactivated'} successfully.`, { is_active: newStatus }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

/**
 * POST /api/technicians/:id/reset-password
 * Admin resets a technician's password.
 */
const resetTechnicianPassword = async (req, res, next) => {
    const { id } = req.params;
    const { newPassword } = req.body;
    let connection;
    try {
        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json(formatResponse(false, 'Password must be at least 8 characters long.'));
        }

        connection = await pool.getConnection();

        const [rows] = await connection.query(
            'SELECT id, name, email FROM users WHERE id = ? AND role = ? LIMIT 1',
            [id, 'technician']
        );
        if (rows.length === 0) {
            return res.status(404).json(formatResponse(false, 'Technician not found.'));
        }

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await connection.query('UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?', [hashedPassword, id]);

        logger.info(`Technician password reset by admin: ${rows[0].name} (ID: ${id})`);

        // Log Activity
        await logActivity(req.user.id, 'security', 'password_reset', 'users', id, {
            targetName: rows[0].name,
            targetEmail: rows[0].email,
            role: 'technician'
        }, req.ip);

        return res.json(formatResponse(true, 'Password reset successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

/**
 * GET /api/technicians/:id/workload
 * Returns assigned ticket counts for a technician.
 */
const getTechnicianWorkload = async (req, res, next) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await pool.getConnection();

        const [rows] = await connection.query(
            'SELECT id, technician_id, name, email, phone, is_active FROM users WHERE id = ? AND role = ? LIMIT 1',
            [id, 'technician']
        );
        if (rows.length === 0) {
            return res.status(404).json(formatResponse(false, 'Technician not found.'));
        }

        const [[counts]] = await connection.query(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
            FROM service_requests WHERE assigned_technician_id = ?
        `, [id]);

        const [tickets] = await connection.query(
            'SELECT id, customer_name, device_category, brand, status, priority, created_at FROM service_requests WHERE assigned_technician_id = ? ORDER BY created_at DESC LIMIT 20',
            [id]
        );

        return res.json(formatResponse(true, 'Technician workload fetched.', {
            technician: rows[0],
            counts,
            tickets: tickets.map(t => ({
                id: t.id, customerName: t.customer_name, deviceCategory: t.device_category,
                brand: t.brand, status: t.status, priority: t.priority, createdAt: t.created_at
            }))
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

module.exports = {
    getTechnicians, createTechnician, deleteTechnician,
    updateTechnician, toggleTechnicianStatus, resetTechnicianPassword, getTechnicianWorkload
};
