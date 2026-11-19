const bcrypt = require('bcryptjs');
const { pool } = require('../config/db.config');
const { formatResponse, generateTechnicianId } = require('../utils/helpers');
const { normalizePhoneNumber } = require('../middleware/validate.middleware');
const logger = require('../utils/logger');
const { logActivity } = require('../utils/activity.logger');
const { dispatchNotification } = require('./notification.controller');

/**
 * GET /api/technicians
 * Returns all users with role='technician'.
 * Admin-only — used to populate the Assign Technician dropdown.
 */
const getTechnicians = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const status = req.query.status || '';

        let query = 'SELECT id, technician_id, name, email, phone, created_at, is_active, deactivated_at, deactivated_by, deactivation_reason FROM users WHERE role = ?';
        const params = ['technician'];

        if (status === 'active') {
            query += ' AND is_active = 1';
        } else if (status === 'inactive') {
            query += ' AND is_active = 0';
        }

        query += ' ORDER BY name ASC';

        const [rows] = await connection.query(query, params);
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
    const { name, email, password, phone } = req.body;
    let connection;
    try {
        const cleanPhone = phone ? normalizePhoneNumber(phone) : '';
        const cleanEmail = email ? email.trim().toLowerCase() : '';
        if (!name || !cleanEmail || !password || !cleanPhone) {
            return res.status(400).json(formatResponse(false, 'Name, email, password, and phone number are required.'));
        }

        if (password.length < 8) {
            return res.status(400).json(formatResponse(false, 'Password must be at least 8 characters long.'));
        }

        connection = await pool.getConnection();

        // Check for duplicate email across all users
        const [existingEmail] = await connection.query(
            'SELECT id FROM users WHERE email = ? LIMIT 1',
            [cleanEmail]
        );
        if (existingEmail.length > 0) {
            const resp = formatResponse(false, 'This email address is already registered. Please use a different email address.');
            resp.errors = { email: 'This email address is already registered. Please use a different email address.' };
            return res.status(400).json(resp);
        }

        // Check for duplicate phone across all users
        const [existingPhone] = await connection.query(
            'SELECT id FROM users WHERE phone = ? LIMIT 1',
            [cleanPhone]
        );
        if (existingPhone.length > 0) {
            const resp = formatResponse(false, 'This phone number is already registered. Please use a different phone number.');
            resp.errors = { phone: 'This phone number is already registered. Please use a different phone number.' };
            return res.status(400).json(resp);
        }

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        const technicianId = await generateTechnicianId(connection);

        const [result] = await connection.query(
            'INSERT INTO users (name, email, password, role, technician_id, phone) VALUES (?, ?, ?, ?, ?, ?)',
            [name.trim(), cleanEmail, hashedPassword, 'technician', technicianId, cleanPhone]
        );

        logger.info(`Technician account created by admin: ${cleanEmail} (ID: ${result.insertId}, TechID: ${technicianId})`);
        return res.status(201).json(formatResponse(true, 'Technician account created successfully.', {
            id: result.insertId,
            technician_id: technicianId,
            name: name.trim(),
            email: cleanEmail,
            phone: cleanPhone,
            role: 'technician'
        }));

    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Helper: Safely deactivates a technician inside an active transaction.
 * Reverts active 'in_progress' and 'pending' tickets to unassigned 'pending' state
 * and increments token_version to immediately revoke all active JWT sessions.
 */
const deactivateTechnicianCore = async (connection, technicianId, technicianName, adminUserId, reason, clientIp) => {
    // 1. Lock and select any open/active tickets currently assigned to this technician
    const [affectedTickets] = await connection.query(
        'SELECT id, ticket_number, status FROM service_requests WHERE assigned_technician_id = ? AND status IN ("pending", "in_progress") FOR UPDATE',
        [technicianId]
    );

    // 2. Unassign technician and revert any 'in_progress' tickets back to 'pending'
    if (affectedTickets.length > 0) {
        await connection.query(
            'UPDATE service_requests SET assigned_technician_id = NULL, status = "pending" WHERE assigned_technician_id = ? AND status IN ("pending", "in_progress")',
            [technicianId]
        );
    }

    // 3. Clear pending assignment offers targeting this technician
    await connection.query(
        'UPDATE service_requests SET pending_technician_id = NULL WHERE pending_technician_id = ?',
        [technicianId]
    );

    // 4. Cancel pending transfers involving this technician (as target or initiator)
    await connection.query(
        "UPDATE task_transfers SET status = 'cancelled' WHERE (to_technician_id = ? OR from_technician_id = ?) AND status = 'pending'",
        [technicianId, technicianId]
    );

    // 5. Deactivate technician record & increment token_version to invalidate active sessions
    await connection.query(
        'UPDATE users SET is_active = 0, token_version = token_version + 1, deactivated_at = NOW(), deactivated_by = ?, deactivation_reason = ? WHERE id = ?',
        [adminUserId || null, reason || 'Deactivated by admin', technicianId]
    );

    // 6. Log central audit activity
    await logActivity(
        adminUserId || null,
        'repair',
        'deactivate_technician',
        'users',
        technicianId,
        {
            name: technicianName,
            reason: reason || 'Deactivated by admin',
            reassignedTicketCount: affectedTickets.length,
            ticketNumbers: affectedTickets.map(t => t.ticket_number || `TD-${t.id}`)
        },
        clientIp
    );

    return affectedTickets;
};

/**
 * Helper: Alerts active administrators if deactivating a technician orphaned tickets.
 */
const alertAdminsOnTechnicianDeactivation = async (connection, technicianName, adminUserId, affectedTickets) => {
    if (!affectedTickets || affectedTickets.length === 0) return;
    try {
        const [admins] = await connection.query(
            'SELECT id FROM users WHERE role = "admin" AND is_active = 1'
        );
        const ticketNumbersStr = affectedTickets.map(t => t.ticket_number || `TD-${t.id}`).slice(0, 5).join(', ');
        const moreCount = affectedTickets.length > 5 ? ` and ${affectedTickets.length - 5} more` : '';
        const alertTitle = 'Technician Deactivated: Tickets Require Reassignment';
        const alertMsg = `${technicianName} was deactivated. ${affectedTickets.length} active ticket(s) (${ticketNumbersStr}${moreCount}) were reverted to pending and require reassignment.`;

        for (const admin of admins) {
            try {
                await dispatchNotification(connection, {
                    userId: admin.id,
                    title: alertTitle,
                    message: alertMsg,
                    senderId: adminUserId || null,
                    url: '/admin/repair-tickets?status=pending',
                    tag: 'admin-tech-reassign'
                });
            } catch (notifErr) {
                logger.warn(`Failed to dispatch admin notification on tech deactivation: ${notifErr.message}`);
            }
        }
    } catch (err) {
        logger.warn(`Error resolving active admins for tech deactivation alert: ${err.message}`);
    }
};

/**
 * DELETE /api/technicians/:id
 * Admin deactivates a technician account.
 * Any open tickets assigned to this technician are unassigned and reverted to pending.
 */
const deleteTechnician = async (req, res, next) => {
    const { id } = req.params;
    const { reason } = req.body || {};
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Verify this is a technician account
        const [rows] = await connection.query(
            'SELECT id, name FROM users WHERE id = ? AND role = ? LIMIT 1 FOR UPDATE',
            [id, 'technician']
        );
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json(formatResponse(false, 'Technician not found.'));
        }

        const affectedTickets = await deactivateTechnicianCore(
            connection,
            id,
            rows[0].name,
            req.user ? req.user.id : null,
            reason,
            req.ip
        );

        await connection.commit();

        logger.info(`Technician account deactivated by admin: ${rows[0].name} (ID: ${id}). Reassigned ${affectedTickets.length} ticket(s).`);

        // Post-commit alert to admins
        await alertAdminsOnTechnicianDeactivation(connection, rows[0].name, req.user ? req.user.id : null, affectedTickets);

        return res.status(200).json(formatResponse(true, `Technician account deactivated successfully. ${affectedTickets.length} ticket(s) returned to pending queue.`, {
            reassignedTicketCount: affectedTickets.length
        }));

    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
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
        const cleanPhone = phone ? normalizePhoneNumber(phone) : '';
        const cleanEmail = email ? email.trim().toLowerCase() : '';
        if (!name || !cleanEmail || !cleanPhone) {
            return res.status(400).json(formatResponse(false, 'Name, email, and phone number are required.'));
        }

        connection = await pool.getConnection();

        const [rows] = await connection.query(
            'SELECT id FROM users WHERE id = ? AND role = ? LIMIT 1',
            [id, 'technician']
        );
        if (rows.length === 0) {
            return res.status(404).json(formatResponse(false, 'Technician not found.'));
        }

        // Check if email already exists for another user
        const [existingEmail] = await connection.query(
            'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1',
            [cleanEmail, id]
        );
        if (existingEmail.length > 0) {
            const resp = formatResponse(false, 'This email address is already registered. Please use a different email address.');
            resp.errors = { email: 'This email address is already registered. Please use a different email address.' };
            return res.status(400).json(resp);
        }

        // Check if phone already exists for another user
        const [existingPhone] = await connection.query(
            'SELECT id FROM users WHERE phone = ? AND id != ? LIMIT 1',
            [cleanPhone, id]
        );
        if (existingPhone.length > 0) {
            const resp = formatResponse(false, 'This phone number is already registered. Please use a different phone number.');
            resp.errors = { phone: 'This phone number is already registered. Please use a different phone number.' };
            return res.status(400).json(resp);
        }

        await connection.query(
            'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
            [name.trim(), cleanEmail, cleanPhone, id]
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
    const { isActive, reason } = req.body || {};
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.query(
            'SELECT id, name, is_active FROM users WHERE id = ? AND role = ? LIMIT 1 FOR UPDATE',
            [id, 'technician']
        );
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json(formatResponse(false, 'Technician not found.'));
        }

        const newStatus = isActive !== undefined ? Boolean(isActive) : !rows[0].is_active;
        let affectedTickets = [];

        if (newStatus) {
            await connection.query(
                'UPDATE users SET is_active = 1, deactivated_at = NULL, deactivated_by = NULL, deactivation_reason = NULL WHERE id = ?',
                [id]
            );
            await logActivity(
                req.user ? req.user.id : null,
                'repair',
                'activate_technician',
                'users',
                id,
                { name: rows[0].name, reason },
                req.ip
            );
        } else {
            affectedTickets = await deactivateTechnicianCore(
                connection,
                id,
                rows[0].name,
                req.user ? req.user.id : null,
                reason,
                req.ip
            );
        }

        await connection.commit();

        logger.info(`Technician ${rows[0].name} (ID: ${id}) ${newStatus ? 'activated' : 'deactivated'} by admin.`);

        if (!newStatus) {
            await alertAdminsOnTechnicianDeactivation(connection, rows[0].name, req.user ? req.user.id : null, affectedTickets);
        }

        return res.json(formatResponse(true, `Technician ${newStatus ? 'activated' : 'deactivated'} successfully.${!newStatus ? ` ${affectedTickets.length} ticket(s) returned to pending queue.` : ''}`, {
            is_active: newStatus,
            reassignedTicketCount: affectedTickets.length
        }));
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
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
                SUM(CASE WHEN status IN ('completed', 'delivered') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered
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
