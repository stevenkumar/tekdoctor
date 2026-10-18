const bcrypt = require('bcryptjs');
const { pool } = require('../config/db.config');
const { formatResponse, generateCompanyId } = require('../utils/helpers');
const logger = require('../utils/logger');
const nodemailer = require('nodemailer');
const { sendCustomerNotification, resolveTlsConfig } = require('../utils/email.utils');
const { normalizePhoneNumber } = require('../middleware/validate.middleware');
const {
    isSecretKey,
    isMaskedPlaceholder,
    encryptSecret,
    decryptSecret,
    MASKED_SECRET_INDICATOR
} = require('../utils/crypto.utils');

const { logActivity: centralLogActivity } = require('../utils/activity.logger');

// ── Helper: Log an activity ──
const logActivity = async (connection, userId, action, targetType, targetId, details, ip) => {
    let category = 'admin';
    const act = (action || '').toLowerCase();
    if (act.includes('settings') || act.includes('theme') || act.includes('logo') || act.includes('favicon')) {
        category = 'website';
    } else if (act.includes('company') || act.includes('branch') || act.includes('employee') || act.includes('device')) {
        category = 'company';
    } else if (act.includes('ticket') || act.includes('repair') || act.includes('status') || act.includes('technician')) {
        category = 'repair';
    } else if (act.includes('notification')) {
        category = 'notification';
    } else if (act.includes('contact') || act.includes('reply')) {
        category = 'website';
    } else if (act.includes('login') || act.includes('logout') || act.includes('failed') || act.includes('password')) {
        category = 'security';
    }

    await centralLogActivity(userId, category, action, targetType, targetId, details, ip);
};

// ══════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ══════════════════════════════════════════════════════════════

const getDashboardStats = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();

        // Consolidated user counts in a single query
        const [[userCounts]] = await connection.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN role = 'customer' THEN 1 ELSE 0 END), 0) as totalUsers,
                COALESCE(SUM(CASE WHEN role = 'technician' THEN 1 ELSE 0 END), 0) as totalTechnicians
            FROM users
        `);
        const totalUsers = userCounts.totalUsers;
        const totalTechnicians = userCounts.totalTechnicians;

        // Consolidated ticket status & alert counts in a single query
        const [[ticketStats]] = await connection.query(`
            SELECT 
                COUNT(*) as totalTickets,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
                COALESCE(SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0) as inProgress,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
                COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0) as delivered,
                COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) as cancelled,
                COALESCE(SUM(CASE WHEN assigned_technician_id IS NULL AND status NOT IN ('completed', 'delivered', 'cancelled') THEN 1 ELSE 0 END), 0) as unassignedCount,
                COALESCE(SUM(CASE WHEN sla_deadline IS NOT NULL AND sla_deadline < NOW() AND status NOT IN ('completed', 'delivered', 'cancelled') THEN 1 ELSE 0 END), 0) as overdueCount
            FROM service_requests
        `);
        const totalTickets = ticketStats.totalTickets;
        const pending = ticketStats.pending;
        const inProgress = ticketStats.inProgress;
        const completed = ticketStats.completed;
        const delivered = ticketStats.delivered;
        const cancelled = ticketStats.cancelled;
        const unassignedCount = ticketStats.unassignedCount;
        const overdueCount = ticketStats.overdueCount;

        const [[{ totalContacts }]] = await connection.query('SELECT COUNT(*) as totalContacts FROM contacts');
        const pendingMessagesCount = totalContacts;

        // Company counts
        const [[{ totalCompanies, totalCompanyTickets }]] = await connection.query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE role = 'company' AND is_active = 1) as totalCompanies,
                (SELECT COUNT(*) FROM service_requests WHERE company_id IS NOT NULL) as totalCompanyTickets
        `);

        // Detailed Recent 10 tickets
        const [recentTickets] = await connection.query(`
            SELECT sr.id, sr.ticket_number, sr.customer_name, sr.company_id, cp.company_name, cp.company_logo,
                   sr.device_category, sr.brand, sr.model_number, sr.problem_type, sr.status, sr.priority, 
                   sr.created_at, sr.updated_at, sr.estimated_completion_date, tu.name as tech_name
            FROM service_requests sr
            LEFT JOIN company_profiles cp ON sr.company_id = cp.user_id
            LEFT JOIN users tu ON sr.assigned_technician_id = tu.id
            ORDER BY sr.created_at DESC LIMIT 10
        `);

        // High priority uncompleted repairs
        const [highPriorityRepairs] = await connection.query(`
            SELECT sr.id, sr.ticket_number, sr.customer_name, sr.company_id, cp.company_name, cp.company_logo,
                   sr.device_category, sr.brand, sr.model_number, sr.problem_type, sr.status, sr.priority, 
                   sr.created_at, sr.estimated_completion_date, tu.name as tech_name
            FROM service_requests sr
            LEFT JOIN company_profiles cp ON sr.company_id = cp.user_id
            LEFT JOIN users tu ON sr.assigned_technician_id = tu.id
            WHERE sr.priority IN ('urgent', 'critical', 'high', 'emergency') AND sr.status NOT IN ('completed', 'delivered', 'cancelled')
            ORDER BY sr.created_at DESC LIMIT 10
        `);

        // Pending assignments (repair tickets without technician assigned)
        const [pendingAssignments] = await connection.query(`
            SELECT sr.id, sr.ticket_number, sr.customer_name, sr.company_id, cp.company_name, cp.company_logo,
                   sr.device_category, sr.brand, sr.model_number, sr.problem_type, sr.status, sr.priority, sr.created_at
            FROM service_requests sr
            LEFT JOIN company_profiles cp ON sr.company_id = cp.user_id
            WHERE sr.assigned_technician_id IS NULL AND sr.status NOT IN ('completed', 'delivered', 'cancelled')
            ORDER BY sr.created_at DESC LIMIT 10
        `);

        // Today's activities
        const [todaysActivities] = await connection.query(`
            SELECT a.id, a.action, a.target_type, a.details, a.created_at, u.name as actor_name
            FROM activity_logs a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.created_at >= DATE(NOW())
            ORDER BY a.created_at DESC LIMIT 15
        `);

        // Monthly stats for the last 6 months  
        const [monthlyStats] = await connection.query(`
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m') as month,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
            FROM service_requests
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
            ORDER BY month ASC
        `);

        return res.json(formatResponse(true, 'Dashboard stats fetched.', {
            totalUsers,
            totalTechnicians,
            totalCompanies,
            totalCompanyTickets,
            totalTickets,
            totalContacts,
            statusCounts: { pending, inProgress, completed, delivered, cancelled },
            recentTickets: recentTickets.map(r => ({
                id: r.id,
                ticketNumber: r.ticket_number,
                customerName: r.customer_name,
                companyId: r.company_id || null,
                companyName: r.company_name || null,
                companyLogo: r.company_logo || null,
                deviceCategory: r.device_category,
                brand: r.brand,
                modelNumber: r.model_number,
                problemType: r.problem_type,
                status: r.status,
                priority: r.priority,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
                estimatedCompletionDate: r.estimated_completion_date,
                techName: r.tech_name
            })),
            highPriorityRepairs: highPriorityRepairs.map(r => ({
                id: r.id,
                ticketNumber: r.ticket_number,
                customerName: r.customer_name,
                companyId: r.company_id || null,
                companyName: r.company_name || null,
                companyLogo: r.company_logo || null,
                deviceCategory: r.device_category,
                brand: r.brand,
                modelNumber: r.model_number,
                problemType: r.problem_type,
                status: r.status,
                priority: r.priority,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
                estimatedCompletionDate: r.estimated_completion_date,
                techName: r.tech_name
            })),
            pendingAssignments: pendingAssignments.map(r => ({
                id: r.id,
                ticketNumber: r.ticket_number,
                customerName: r.customer_name,
                companyId: r.company_id || null,
                companyName: r.company_name || null,
                companyLogo: r.company_logo || null,
                deviceCategory: r.device_category,
                brand: r.brand,
                modelNumber: r.model_number,
                problemType: r.problem_type,
                status: r.status,
                priority: r.priority,
                createdAt: r.created_at
            })),
            todaysActivities: todaysActivities.map(r => ({
                id: r.id,
                action: r.action,
                targetType: r.target_type,
                details: r.details,
                createdAt: r.created_at,
                actorName: r.actor_name
            })),
            systemAlerts: {
                unassignedCount,
                overdueCount,
                pendingMessagesCount
            },
            monthlyStats
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};


// ══════════════════════════════════════════════════════════════
// CUSTOMER MANAGEMENT
// ══════════════════════════════════════════════════════════════

const getCustomers = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const role = req.query.role || '';
        const status = req.query.status || '';

        const allowedRoles = ['customer', 'technician', 'admin', 'company'];
        let baseQuery = ' FROM users u LEFT JOIN company_profiles cp ON u.id = cp.user_id WHERE 1=1';
        const params = [];

        if (role && allowedRoles.includes(role)) {
            baseQuery += ' AND u.role = ?';
            params.push(role);
        } else if (!role) {
            baseQuery += ' AND u.role IN ("customer", "technician", "admin", "company")';
        }

        if (status === 'active') {
            baseQuery += ' AND u.is_active = 1';
        } else if (status === 'inactive') {
            baseQuery += ' AND u.is_active = 0';
        }

        if (search) {
            const rawSearch = search.trim();
            const customerIdMatch = rawSearch.match(/^TD-?0*(\d+)$/i);
            const isSearchAdmin = rawSearch.toUpperCase() === 'ADMIN';
            const rawCustId = customerIdMatch ? parseInt(customerIdMatch[1], 10) : null;
            const rawId = !rawCustId && !isNaN(rawSearch) && rawSearch.length <= 6 && !rawSearch.startsWith('+') ? parseInt(rawSearch, 10) : null;
            const searchPattern = `%${rawSearch}%`;

            if (isSearchAdmin) {
                baseQuery += ` AND (
                    u.role = 'admin'
                    OR u.name LIKE ? 
                    OR cp.company_name LIKE ?
                    OR u.email LIKE ? 
                    OR u.phone LIKE ? 
                    OR cp.phone_number LIKE ?
                )`;
                params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
            } else if (rawCustId) {
                // TD-XXX customer ID format search - MUST ONLY match customers, NEVER admin
                baseQuery += ` AND (
                    (u.role = 'customer' AND u.id = ?)
                    OR u.name LIKE ? 
                    OR cp.company_name LIKE ?
                    OR u.email LIKE ? 
                    OR u.phone LIKE ? 
                    OR cp.phone_number LIKE ?
                    OR u.technician_id LIKE ? 
                    OR cp.company_id LIKE ? 
                    OR u.company_id LIKE ? 
                    OR u.id IN (SELECT user_id FROM service_requests WHERE ticket_number LIKE ?)
                    OR (u.role = 'company' AND u.id IN (SELECT company_id FROM service_requests WHERE ticket_number LIKE ?))
                )`;
                params.push(rawCustId, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
            } else if (rawId) {
                // Numeric ID search - do not expose or match admin via internal primary key
                baseQuery += ` AND (
                    (u.role != 'admin' AND u.id = ?)
                    OR u.name LIKE ? 
                    OR cp.company_name LIKE ?
                    OR u.email LIKE ? 
                    OR u.phone LIKE ? 
                    OR cp.phone_number LIKE ?
                    OR u.technician_id LIKE ? 
                    OR cp.company_id LIKE ? 
                    OR u.company_id LIKE ? 
                    OR u.id IN (SELECT user_id FROM service_requests WHERE ticket_number LIKE ?)
                    OR (u.role = 'company' AND u.id IN (SELECT company_id FROM service_requests WHERE ticket_number LIKE ?))
                )`;
                params.push(rawId, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
            } else {
                baseQuery += ` AND (
                    u.name LIKE ? 
                    OR cp.company_name LIKE ?
                    OR u.email LIKE ? 
                    OR u.phone LIKE ? 
                    OR cp.phone_number LIKE ?
                    OR u.technician_id LIKE ? 
                    OR cp.company_id LIKE ? 
                    OR u.company_id LIKE ? 
                    OR u.id IN (SELECT user_id FROM service_requests WHERE ticket_number LIKE ?)
                    OR (u.role = 'company' AND u.id IN (SELECT company_id FROM service_requests WHERE ticket_number LIKE ?))
                )`;
                params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
            }
        }

        const sanitizeDate = (d) => {
            if (!d) return null;
            const match = String(d).match(/^\d{4}-\d{2}-\d{2}/);
            return match ? match[0] : null;
        };
        const startDate = sanitizeDate(req.query.startDate || req.query.fromDate);
        const endDate = sanitizeDate(req.query.endDate || req.query.toDate);

        if (startDate) {
            baseQuery += ' AND DATE(u.created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            baseQuery += ' AND DATE(u.created_at) <= ?';
            params.push(endDate);
        }

        const [[{ total }]] = await connection.query(`SELECT COUNT(*) as total${baseQuery}`, params);
        const [rows] = await connection.query(
            `SELECT u.id, 
                    u.technician_id,
                    COALESCE(cp.company_id, u.company_id) AS company_id,
                    CASE 
                        WHEN u.role = 'admin' THEN 'ADMIN'
                        WHEN u.role = 'technician' THEN u.technician_id
                        WHEN u.role = 'company' THEN COALESCE(cp.company_id, u.company_id)
                        ELSE CONCAT('TD-', LPAD(u.id, GREATEST(3, CHAR_LENGTH(u.id)), '0'))
                    END as permanent_customer_id,
                    COALESCE(cp.company_name, u.name) as name, 
                    u.email, 
                    COALESCE(u.phone, cp.phone_number) as phone, 
                    u.role, 
                    u.is_active, 
                    u.deactivated_at, u.deactivated_by, u.deactivation_reason, 
                    u.created_at, u.updated_at,
                    (SELECT COUNT(*) FROM service_requests sr WHERE sr.user_id = u.id OR (u.role = 'company' AND sr.company_id = u.id)) as total_tickets,
                    (SELECT COUNT(*) FROM service_requests sr WHERE (sr.user_id = u.id OR (u.role = 'company' AND sr.company_id = u.id)) AND sr.status IN ('pending', 'in_progress')) as active_tickets,
                    (SELECT COUNT(*) FROM service_requests sr WHERE (sr.user_id = u.id OR (u.role = 'company' AND sr.company_id = u.id)) AND sr.status IN ('completed', 'delivered')) as completed_tickets,
                    (SELECT COUNT(*) FROM service_requests sr WHERE (sr.user_id = u.id OR (u.role = 'company' AND sr.company_id = u.id)) AND sr.status = 'cancelled') as cancelled_tickets,
                    (SELECT MAX(sr.created_at) FROM service_requests sr WHERE sr.user_id = u.id OR (u.role = 'company' AND sr.company_id = u.id)) as last_ticket_date
             ${baseQuery} 
             ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return res.json(formatResponse(true, 'Customers fetched.', {
            data: rows,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const updateCustomer = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        const { name, email, phone } = req.body;

        const [existing] = await connection.query('SELECT id, role FROM users WHERE id = ? AND role IN ("customer", "technician", "admin", "company") LIMIT 1', [id]);
        if (existing.length === 0) return res.status(404).json(formatResponse(false, 'Customer not found.'));

        const cleanEmail = email ? email.trim().toLowerCase() : '';
        const cleanPhone = phone ? normalizePhoneNumber(phone) : null;

        if (cleanEmail) {
            const [dupEmail] = await connection.query('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [cleanEmail, id]);
            if (dupEmail.length > 0) {
                const resp = formatResponse(false, 'This email address is already registered. Please use a different email address.');
                resp.errors = { email: 'This email address is already registered. Please use a different email address.' };
                return res.status(409).json(resp);
            }
        }

        if (cleanPhone) {
            const [dupPhone] = await connection.query('SELECT id FROM users WHERE phone = ? AND id != ? LIMIT 1', [cleanPhone, id]);
            if (dupPhone.length > 0) {
                const resp = formatResponse(false, 'This phone number is already registered. Please use a different phone number.');
                resp.errors = { phone: 'This phone number is already registered. Please use a different phone number.' };
                return res.status(409).json(resp);
            }
        }

        await connection.query('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?', [name, cleanEmail, cleanPhone, id]);
        if (existing[0].role === 'company') {
            await connection.query('UPDATE company_profiles SET company_name = ?, phone_number = ? WHERE user_id = ?', [name, cleanPhone || '', id]);
        }
        await logActivity(connection, req.user.id, 'update_customer', 'user', id, { name, email: cleanEmail }, req.ip);

        return res.json(formatResponse(true, 'Customer updated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const deleteCustomer = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        const { reason } = req.body || {};

        if (req.user.id === parseInt(id, 10)) {
            return res.status(400).json(formatResponse(false, 'You cannot deactivate your own admin account.'));
        }

        const [existing] = await connection.query('SELECT id, name, role, is_active FROM users WHERE id = ? LIMIT 1', [id]);
        if (existing.length === 0) return res.status(404).json(formatResponse(false, 'User not found.'));

        await connection.query(
            'UPDATE users SET is_active = 0, deactivated_at = NOW(), deactivated_by = ?, deactivation_reason = ? WHERE id = ?',
            [req.user.id, reason || 'Deactivated by admin', id]
        );
        await logActivity(connection, req.user.id, 'deactivate_customer', 'user', id, { name: existing[0].name, reason }, req.ip);

        return res.json(formatResponse(true, 'User deactivated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const reactivateCustomer = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;

        const [existing] = await connection.query('SELECT id, name FROM users WHERE id = ? LIMIT 1', [id]);
        if (existing.length === 0) return res.status(404).json(formatResponse(false, 'User not found.'));

        await connection.query(
            'UPDATE users SET is_active = 1, deactivated_at = NULL, deactivated_by = NULL, deactivation_reason = NULL WHERE id = ?',
            [id]
        );
        await logActivity(connection, req.user.id, 'reactivate_customer', 'user', id, { name: existing[0].name }, req.ip);

        return res.json(formatResponse(true, 'User reactivated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getCustomerHistory = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;

        // Fetch customer profile
        const [customerRows] = await connection.query(
            `SELECT u.id, 
                    u.technician_id,
                    COALESCE(cp.company_id, u.company_id) AS company_id,
                    CASE 
                        WHEN u.role = 'admin' THEN 'ADMIN'
                        WHEN u.role = 'technician' THEN u.technician_id
                        WHEN u.role = 'company' THEN COALESCE(cp.company_id, u.company_id)
                        ELSE CONCAT('TD-', LPAD(u.id, GREATEST(3, CHAR_LENGTH(u.id)), '0'))
                    END as permanent_customer_id,
                    COALESCE(cp.company_name, u.name) as name, 
                    u.email, 
                    COALESCE(u.phone, cp.phone_number) as phone, 
                    u.role, u.is_active, u.created_at, u.updated_at
             FROM users u
             LEFT JOIN company_profiles cp ON u.id = cp.user_id
             WHERE u.id = ? LIMIT 1`,
            [id]
        );
        const customer = customerRows[0] || null;

        const [rows] = await connection.query(
            `SELECT sr.id, sr.ticket_number, sr.customer_name, sr.mobile, sr.email,
                    sr.device_category, sr.custom_device_category, sr.brand, sr.custom_brand, 
                    sr.model_number, sr.serial_number, sr.device_configuration,
                    sr.problem_type, sr.custom_problem_type, sr.problem_description,
                    sr.service_type, sr.custom_service_type, sr.status, sr.priority,
                    sr.repair_cost, sr.estimated_cost, sr.additional_charges,
                    sr.diagnosis, sr.identified_issues, sr.required_work, sr.required_parts,
                    sr.inspection_notes, sr.device_condition, sr.estimated_completion_date, sr.estimate_submitted_at,
                    sr.payment_status, sr.payment_id, sr.payment_method, sr.paid_at,
                    sr.customer_approval_status, sr.approved_at, sr.approval_notes,
                    sr.rejected_at, sr.rejection_reason, sr.hold_start_date, sr.hold_end_date, sr.hold_reason,
                    sr.created_at, sr.updated_at, sr.customer_repair_description,
                    t.name as technician_name,
                    inv.id as invoice_id, inv.status as invoice_status, inv.amount as invoice_amount
             FROM service_requests sr
             LEFT JOIN users t ON sr.assigned_technician_id = t.id
             LEFT JOIN invoices inv ON inv.ticket_id = sr.id
             WHERE sr.user_id = ? OR sr.company_id = ?
             ORDER BY sr.created_at DESC`,
            [id, id]
        );

        const stats = {
            total: rows.length,
            active: rows.filter(r => ['pending', 'in_progress'].includes(r.status)).length,
            completed: rows.filter(r => ['completed', 'delivered'].includes(r.status)).length,
            cancelled: rows.filter(r => r.status === 'cancelled').length
        };

        const tickets = rows.map(r => {
            const estCost = r.estimated_cost !== null && r.estimated_cost !== undefined ? Number(r.estimated_cost) : (r.repair_cost ? Number(r.repair_cost) : 0);
            const addCharges = r.additional_charges !== null && r.additional_charges !== undefined ? Number(r.additional_charges) : 0;
            const repCost = r.repair_cost !== null && r.repair_cost !== undefined ? Number(r.repair_cost) : (estCost + addCharges);
            const totalEstimate = estCost > 0 ? (estCost + addCharges) : repCost;

            return {
                id: r.id,
                ticketNumber: r.ticket_number,
                customerName: r.customer_name,
                mobile: r.mobile,
                email: r.email,
                deviceCategory: r.custom_device_category ? `${r.device_category} (${r.custom_device_category})` : r.device_category,
                brand: r.custom_brand ? `${r.brand} (${r.custom_brand})` : r.brand,
                modelNumber: r.model_number,
                serialNumber: r.serial_number,
                deviceConfiguration: r.device_configuration,
                problemType: r.custom_problem_type ? `${r.problem_type} (${r.custom_problem_type})` : r.problem_type,
                problemDescription: r.problem_description,
                serviceType: r.custom_service_type ? `${r.service_type} (${r.custom_service_type})` : r.service_type,
                status: r.status,
                priority: r.priority,
                estimatedCost: estCost,
                additionalCharges: addCharges,
                totalEstimatedCost: totalEstimate,
                repairCost: repCost,
                repair_cost: repCost,
                diagnosis: r.diagnosis || null,
                identifiedIssues: r.identified_issues || null,
                requiredWork: r.required_work || null,
                requiredParts: r.required_parts || null,
                inspectionNotes: r.inspection_notes || null,
                deviceCondition: r.device_condition || null,
                estimatedCompletionDate: r.estimated_completion_date || null,
                estimateSubmittedAt: r.estimate_submitted_at || null,
                paymentStatus: r.payment_status || 'unpaid',
                collectionStatus: r.collection_status || 'not_applicable',
                paymentId: r.payment_id,
                paymentMethod: r.payment_method,
                paidAt: r.paid_at,
                customerApprovalStatus: r.customer_approval_status || 'none',
                approvedAt: r.approved_at || null,
                approvalNotes: r.approval_notes || null,
                rejectedAt: r.rejected_at || null,
                rejectionReason: r.rejection_reason || null,
                holdStartDate: r.hold_start_date || null,
                holdEndDate: r.hold_end_date || null,
                holdReason: r.hold_reason || null,
                technicianName: r.technician_name,
                customerRepairDescription: r.customer_repair_description,
                invoiceId: r.invoice_id,
                invoiceStatus: r.invoice_status,
                invoiceAmount: r.invoice_amount !== null && r.invoice_amount !== undefined ? Number(r.invoice_amount) : null,
                createdAt: r.created_at,
                updatedAt: r.updated_at
            };
        });

        return res.json(formatResponse(true, 'Customer history fetched.', {
            customer,
            stats,
            tickets
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const createCompany = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { name, email, phone, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json(formatResponse(false, 'Company name, email, and password are required.'));
        }

        if (password.length < 8) {
            return res.status(400).json(formatResponse(false, 'Password must be at least 8 characters long.'));
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanPhone = phone ? normalizePhoneNumber(phone) : null;

        // Check if email already exists
        const [existing] = await connection.query('SELECT id FROM users WHERE email = ? LIMIT 1', [cleanEmail]);
        if (existing.length > 0) {
            const resp = formatResponse(false, 'This email address is already registered. Please use a different email address.');
            resp.errors = { email: 'This email address is already registered. Please use a different email address.' };
            return res.status(409).json(resp);
        }

        // Check if phone already exists
        if (cleanPhone) {
            const [existingPhone] = await connection.query('SELECT id FROM users WHERE phone = ? LIMIT 1', [cleanPhone]);
            if (existingPhone.length > 0) {
                const resp = formatResponse(false, 'This phone number is already registered. Please use a different phone number.');
                resp.errors = { phone: 'This phone number is already registered. Please use a different phone number.' };
                return res.status(409).json(resp);
            }
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const companyCode = await generateCompanyId(connection);

        // Insert Company User
        const [userResult] = await connection.query(
            'INSERT INTO users (name, email, password, phone, role, company_id) VALUES (?, ?, ?, ?, "company", ?)',
            [name, cleanEmail, hashedPassword, cleanPhone, companyCode]
        );
        const companyUserId = userResult.insertId;

        // Scaffold company_profiles to prevent auth crashes
        await connection.query(
            'INSERT INTO company_profiles (user_id, company_id, company_name, contact_person, phone_number, address) VALUES (?, ?, ?, ?, ?, ?)',
            [companyUserId, companyCode, name, 'Admin Created', cleanPhone || '', '']
        );

        await logActivity(connection, req.user.id, 'create_company', 'user', companyUserId, { name, email: cleanEmail }, req.ip);

        return res.status(201).json(formatResponse(true, 'Company account created successfully.', { id: companyUserId }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ══════════════════════════════════════════════════════════════
// CONTACT MANAGEMENT
// ══════════════════════════════════════════════════════════════

const getContacts = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search ? req.query.search.trim() : '';

        const sanitizeDate = (d) => {
            if (!d) return null;
            const match = String(d).match(/^\d{4}-\d{2}-\d{2}/);
            return match ? match[0] : null;
        };
        const startDate = sanitizeDate(req.query.startDate || req.query.fromDate);
        const endDate = sanitizeDate(req.query.endDate || req.query.toDate);

        let baseQuery = ' FROM contacts';
        const whereConditions = [];
        const params = [];

        if (search) {
            whereConditions.push('(name LIKE ? OR email LIKE ? OR phone LIKE ? OR message LIKE ? OR COALESCE(subject, "") LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (startDate) {
            whereConditions.push('DATE(created_at) >= ?');
            params.push(startDate);
        }

        if (endDate) {
            whereConditions.push('DATE(created_at) <= ?');
            params.push(endDate);
        }

        if (whereConditions.length > 0) {
            baseQuery += ' WHERE ' + whereConditions.join(' AND ');
        }

        const [[{ total }]] = await connection.query(`SELECT COUNT(*) as total${baseQuery}`, params);
        const [rows] = await connection.query(`SELECT *${baseQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);

        return res.json(formatResponse(true, 'Contacts fetched.', {
            data: rows,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const deleteContact = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;

        const [existing] = await connection.query('SELECT id FROM contacts WHERE id = ? LIMIT 1', [id]);
        if (existing.length === 0) return res.status(404).json(formatResponse(false, 'Contact not found.'));

        await connection.query('DELETE FROM contacts WHERE id = ?', [id]);
        return res.json(formatResponse(true, 'Contact deleted successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const bulkDeleteContacts = async (req, res, next) => {
    let connection;
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json(formatResponse(false, 'Please provide an array of contact message IDs to delete.'));
        }

        const validIds = ids.map(id => Number(id)).filter(id => !isNaN(id) && id > 0);
        if (validIds.length === 0) {
            return res.status(400).json(formatResponse(false, 'No valid contact message IDs provided.'));
        }

        connection = await pool.getConnection();
        const [result] = await connection.query('DELETE FROM contacts WHERE id IN (?)', [validIds]);

        logger.info(`Admin ${req.user ? req.user.id : 'unknown'} bulk deleted ${result.affectedRows} contact messages.`);
        await logActivity(connection, req.user ? req.user.id : null, 'bulk_delete_contacts', 'contacts', null, { count: result.affectedRows, ids: validIds }, req.ip);

        return res.json(formatResponse(true, `${result.affectedRows} contact message(s) deleted successfully.`, {
            deletedCount: result.affectedRows
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const replyToContact = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        const { subject } = req.body;
        const replyMessageText = (req.body.message || req.body.replyMessage || '').trim();

        const [rows] = await connection.query('SELECT * FROM contacts WHERE id = ? LIMIT 1', [id]);
        if (rows.length === 0) return res.status(404).json(formatResponse(false, 'Contact not found.'));

        const contact = rows[0];
        const html = `<h3>Reply from The Tek Doctor</h3><p>${replyMessageText}</p><hr><p><em>Original message from ${contact.name}:</em></p><p>${contact.message}</p>`;

        const sent = await sendCustomerNotification(contact.email, subject || 'Reply from The Tek Doctor', html);
        if (sent) {
            await logActivity(connection, req.user.id, 'reply_contact', 'contact', id, { email: contact.email }, req.ip);
            return res.json(formatResponse(true, 'Reply sent successfully.'));
        }
        return res.status(500).json(formatResponse(false, 'Failed to send email. Check SMTP settings.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ══════════════════════════════════════════════════════════════
// SITE SETTINGS
// ══════════════════════════════════════════════════════════════

const getSettings = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const group = req.query.group;
        let query = 'SELECT * FROM site_settings';
        const params = [];
        if (group) {
            query += ' WHERE setting_group = ?';
            params.push(group);
        }
        query += ' ORDER BY setting_group, setting_key';
        const [rows] = await connection.query(query, params);

        // Transform to a grouped object, masking any secret fields
        const settings = {};
        rows.forEach(r => {
            if (!settings[r.setting_group]) settings[r.setting_group] = {};
            if (isSecretKey(r.setting_key)) {
                // Return masked indicator if secret exists and is non-empty, otherwise empty string
                settings[r.setting_group][r.setting_key] = (r.setting_value && String(r.setting_value).trim())
                    ? MASKED_SECRET_INDICATOR
                    : '';
            } else {
                settings[r.setting_group][r.setting_key] = r.setting_value;
            }
        });

        return res.json(formatResponse(true, 'Settings fetched.', settings));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const SETTING_KEY_GROUPS = {
    company_name: 'company',
    company_phone: 'company',
    company_alternate_phone: 'company',
    company_email: 'company',
    company_address: 'company',
    logo_url: 'company',
    gstin: 'company',
    theme_primary_color: 'theme',
    theme_secondary_color: 'theme',
    favicon_url: 'branding',
    tekunik_image_url: 'branding',
    facebook_url: 'social',
    twitter_url: 'social',
    instagram_url: 'social',
    linkedin_url: 'social',
    google_maps_link: 'integrations',
    google_sheet_url: 'integrations',
    google_login_enabled: 'integrations',
    google_client_id: 'integrations',
    google_client_secret: 'integrations',
    recaptcha_enabled: 'security',
    recaptcha_site_key: 'security',
    recaptcha_secret_key: 'security',
    recaptcha_api_key: 'security',
    recaptcha_project_id: 'security',
    recaptcha_score_threshold: 'security',
    maintenance_mode: 'system',
    meta_title: 'seo',
    meta_description: 'seo',
    meta_keywords: 'seo',
    smtp_host: 'email',
    smtp_port: 'email',
    smtp_user: 'email',
    smtp_password: 'email',
    from_email: 'email',
    from_name: 'email',
    template_repair_ready: 'email',
    template_new_ticket: 'email',
    template_status_update: 'email',
    invoice_prefix: 'billing',
    default_gst_rate: 'billing',
    invoice_gst_enabled: 'billing',
    invoice_default_items: 'billing'
};

const updateSettings = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { settings, group } = req.body; // { key: value, ... }

        if (!settings || typeof settings !== 'object') {
            return res.status(400).json(formatResponse(false, 'Settings object is required.'));
        }

        // Auto-trim strings and validate alternate contact number
        if (settings.company_alternate_phone !== undefined) {
            let altPhone = typeof settings.company_alternate_phone === 'string' ? settings.company_alternate_phone.trim() : '';
            if (altPhone) {
                const cleanDigits = altPhone.replace(/[\s\-()]/g, '').replace(/^(\+91|91|0)/, '');
                if (!/^[6-9]\d{9}$/.test(cleanDigits) && !/^\d{10}$/.test(cleanDigits)) {
                    return res.status(400).json(formatResponse(false, 'Alternate contact number must be a valid 10-digit phone number.'));
                }
            }
            settings.company_alternate_phone = altPhone;
        }

        // Validate invoice configuration
        if (settings.invoice_prefix !== undefined) {
            const prefixStr = String(settings.invoice_prefix).trim();
            if (prefixStr && (!/^[a-zA-Z0-9\-_]{1,15}$/.test(prefixStr))) {
                return res.status(400).json(formatResponse(false, 'Invoice prefix must be 1-15 characters containing only alphanumeric characters, hyphens, or underscores.'));
            }
            settings.invoice_prefix = prefixStr || 'inv';
        }

        if (settings.default_gst_rate !== undefined) {
            const rateNum = parseFloat(settings.default_gst_rate);
            if (isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
                return res.status(400).json(formatResponse(false, 'Default GST rate must be a valid percentage between 0 and 100.'));
            }
            settings.default_gst_rate = String(rateNum);
        }

        if (settings.invoice_default_items !== undefined) {
            if (typeof settings.invoice_default_items === 'object') {
                settings.invoice_default_items = JSON.stringify(settings.invoice_default_items);
            } else if (typeof settings.invoice_default_items === 'string') {
                try {
                    JSON.parse(settings.invoice_default_items);
                } catch (_) {
                    return res.status(400).json(formatResponse(false, 'Invoice default items must be valid JSON array.'));
                }
            }
        }

        // Validate reCAPTCHA score threshold (0.0 to 1.0)
        if (settings.recaptcha_score_threshold !== undefined) {
            const thresholdNum = parseFloat(settings.recaptcha_score_threshold);
            if (isNaN(thresholdNum) || thresholdNum < 0 || thresholdNum > 1) {
                return res.status(400).json(formatResponse(false, 'reCAPTCHA score threshold must be a valid number between 0.0 and 1.0.'));
            }
            settings.recaptcha_score_threshold = String(thresholdNum);
        }

        // Validate enabling Google Login
        if (settings.google_login_enabled === 'true' || settings.google_login_enabled === true) {
            let clientId = settings.google_client_id;
            if (!clientId || typeof clientId !== 'string' || !clientId.trim()) {
                const [dbClientId] = await connection.query(
                    "SELECT setting_value FROM site_settings WHERE setting_key = 'google_client_id' LIMIT 1"
                );
                clientId = (dbClientId[0]?.setting_value) || process.env.GOOGLE_CLIENT_ID || '';
            }
            if (!clientId || !String(clientId).trim()) {
                return res.status(400).json(formatResponse(false, 'Cannot enable Google Sign-In: Google Client ID must be configured.'));
            }
        }

        // Validate enabling reCAPTCHA
        if (settings.recaptcha_enabled === 'true' || settings.recaptcha_enabled === true) {
            let siteKey = settings.recaptcha_site_key;
            if (!siteKey || typeof siteKey !== 'string' || !siteKey.trim()) {
                const [dbSiteKey] = await connection.query(
                    "SELECT setting_value FROM site_settings WHERE setting_key = 'recaptcha_site_key' LIMIT 1"
                );
                siteKey = (dbSiteKey[0]?.setting_value) || process.env.RECAPTCHA_SITE_KEY || '';
            }
            if (!siteKey || !String(siteKey).trim()) {
                return res.status(400).json(formatResponse(false, 'Cannot enable reCAPTCHA: Site Key must be configured.'));
            }
        }

        for (const [key, value] of Object.entries(settings)) {
            const keyGroup = group || SETTING_KEY_GROUPS[key] || 'general';
            const isSecret = isSecretKey(key);

            if (isSecret) {
                // If omitted, blank, or unchanged masked placeholder, preserve existing stored secret without overwriting
                if (value === undefined || value === null || isMaskedPlaceholder(value)) {
                    continue;
                }
                const cleanVal = typeof value === 'string' ? value.trim() : String(value);
                if (!cleanVal) {
                    continue;
                }
                // Explicit new secret supplied: encrypt with AES-256-GCM before writing to database
                const encryptedVal = encryptSecret(cleanVal);
                await connection.query(
                    'INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?, setting_group = ?',
                    [key, encryptedVal, keyGroup, encryptedVal, keyGroup]
                );
            } else {
                const cleanVal = typeof value === 'string' ? value.trim() : value;
                await connection.query(
                    'INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?, setting_group = ?',
                    [key, cleanVal, keyGroup, cleanVal, keyGroup]
                );
            }
        }

        // Specific security activity logging for Google Login and reCAPTCHA toggle changes
        if (settings.google_login_enabled !== undefined) {
            const googleStatus = (settings.google_login_enabled === 'true' || settings.google_login_enabled === true) ? 'enabled' : 'disabled';
            await logActivity(
                connection,
                req.user.id,
                `google_login_${googleStatus}`,
                'security_setting',
                null,
                { setting: 'google_login_enabled', status: googleStatus },
                req.ip
            );
        }

        if (settings.recaptcha_enabled !== undefined) {
            const recaptchaStatus = (settings.recaptcha_enabled === 'true' || settings.recaptcha_enabled === true) ? 'enabled' : 'disabled';
            await logActivity(
                connection,
                req.user.id,
                `recaptcha_${recaptchaStatus}`,
                'security_setting',
                null,
                { setting: 'recaptcha_enabled', status: recaptchaStatus },
                req.ip
            );
        }

        // Invalidate cached runtime configurations
        try {
            const { invalidateGoogleConfigCache } = require('../utils/google.auth');
            invalidateGoogleConfigCache();
        } catch (_) {}

        try {
            const { invalidateRecaptchaConfigCache } = require('../utils/recaptcha.utils');
            invalidateRecaptchaConfigCache();
        } catch (_) {}

        await logActivity(connection, req.user.id, 'update_settings', 'settings', null, { keys: Object.keys(settings) }, req.ip);
        return res.json(formatResponse(true, 'Settings updated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const testEmailSettings = async (req, res, next) => {
    let connection;
    try {
        const { settings } = req.body;
        if (!settings || !settings.smtp_host || !settings.smtp_port || !settings.smtp_user) {
            return res.status(400).json(formatResponse(false, 'Incomplete SMTP configuration provided.'));
        }

        let smtpPassword = settings.smtp_password;
        // If password is blank or masked placeholder, retrieve and decrypt the stored password from the database
        if (!smtpPassword || isMaskedPlaceholder(smtpPassword)) {
            connection = await pool.getConnection();
            const [rows] = await connection.query(
                "SELECT setting_value FROM site_settings WHERE setting_key = 'smtp_password' LIMIT 1"
            );
            if (rows.length > 0 && rows[0].setting_value) {
                try {
                    smtpPassword = decryptSecret(rows[0].setting_value);
                } catch (decErr) {
                    logger.error('[testEmailSettings] Failed to decrypt stored SMTP password: ' + decErr.message);
                }
            }
        }

        if (!smtpPassword) {
            return res.status(400).json(formatResponse(false, 'SMTP password is required to test email.'));
        }

        const transporter = nodemailer.createTransport({
            host: settings.smtp_host,
            port: parseInt(settings.smtp_port, 10),
            secure: parseInt(settings.smtp_port, 10) === 465, // true for 465, false for other ports
            auth: {
                user: settings.smtp_user,
                pass: smtpPassword
            },
            tls: resolveTlsConfig(settings.smtp_host)
        });

        // Verify connection configuration
        await transporter.verify();

        // Send a test email
        await transporter.sendMail({
            from: `"${settings.from_name || 'TekDoctor'}" <${settings.from_email || settings.smtp_user}>`,
            to: req.user.email || settings.smtp_user,
            subject: 'TekDoctor - SMTP Test Successful',
            html: `<h3>Success!</h3><p>Your SMTP configuration for TekDoctor is working correctly.</p>`
        });

        return res.json(formatResponse(true, 'Test email sent successfully! Please check your inbox.'));
    } catch (error) {
        logger.error('SMTP Test Failed:', error);
        return res.status(500).json(formatResponse(false, 'Failed to connect or send email. ' + error.message));
    } finally {
        if (connection) connection.release();
    }
};

const uploadFile = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json(formatResponse(false, 'No file provided.'));
        }

        // The file is saved directly into the destination defined by multer storage
        // By default for unknown fieldnames, it falls back to uploadsRoot
        const fileUrl = `/uploads/${req.file.filename}`;

        await logActivity(pool, req.user.id, 'upload_file', 'media', null, { filename: req.file.filename }, req.ip);

        return res.json(formatResponse(true, 'File uploaded securely.', { url: fileUrl }));
    } catch (error) {
        next(error);
    }
};

// ══════════════════════════════════════════════════════════════
// HOMEPAGE CONTENT
// ══════════════════════════════════════════════════════════════

const getHomepageContent = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query('SELECT * FROM homepage_content ORDER BY sort_order ASC');

        // Compute dynamic metrics if hero section is returned
        try {
            const [[metricsResult]] = await connection.query(`
                SELECT 
                    COUNT(CASE WHEN status IN ('completed', 'delivered') THEN 1 END) as completed_count,
                    COUNT(CASE WHEN status IN ('completed', 'delivered', 'cancelled') THEN 1 END) as total_finished
                FROM service_requests
            `);
            const completedCount = metricsResult ? metricsResult.completed_count : 0;
            const totalFinished = metricsResult ? metricsResult.total_finished : 0;

            const heroIndex = rows.findIndex(row => row.section === 'hero');
            if (heroIndex !== -1) {
                let heroContent = rows[heroIndex].content;
                if (typeof heroContent === 'string') {
                    try {
                        heroContent = JSON.parse(heroContent);
                    } catch (e) { }
                }
                if (heroContent) {
                    if (!Array.isArray(heroContent.metrics)) {
                        heroContent.metrics = [
                            { label: 'Devices Revived', value: '10+' },
                            { label: 'Success Metric', value: '99.9%' },
                            { label: 'Response Time', value: '24/7' }
                        ];
                    }
                    if (heroContent.metrics[0]) {
                        heroContent.metrics[0].value = String(completedCount);
                    }
                    if (heroContent.metrics[1]) {
                        const percentage = totalFinished > 0
                            ? ((completedCount / totalFinished) * 100).toFixed(1) + '%'
                            : '100.0%';
                        heroContent.metrics[1].value = percentage;
                    }
                    rows[heroIndex].content = typeof rows[heroIndex].content === 'string' ? JSON.stringify(heroContent) : heroContent;
                }
            }
        } catch (metricsErr) {
            console.error('Failed to compute dynamic hero metrics in admin:', metricsErr);
        }

        return res.json(formatResponse(true, 'Homepage content fetched.', rows));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const updateHomepageContent = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        const { content, is_active } = req.body;

        if (!content) {
            return res.status(400).json(formatResponse(false, 'Content is required.'));
        }

        const isNumeric = /^\d+$/.test(String(id));
        const [existing] = await connection.query(
            isNumeric
                ? 'SELECT id, section FROM homepage_content WHERE id = ? LIMIT 1'
                : 'SELECT id, section FROM homepage_content WHERE section = ? LIMIT 1',
            [id]
        );

        const jsonContent = typeof content === 'string' ? content : JSON.stringify(content);
        const activeVal = is_active !== undefined ? is_active : true;

        if (existing.length === 0) {
            if (!isNumeric) {
                // Auto-create if updating by section name and not yet present
                const [[{ maxOrder }]] = await connection.query('SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM homepage_content');
                const [insertResult] = await connection.query(
                    'INSERT INTO homepage_content (section, content, sort_order, is_active) VALUES (?, ?, ?, ?)',
                    [id, jsonContent, maxOrder + 1, activeVal]
                );
                await logActivity(connection, req.user.id, 'create_homepage_section', 'homepage_content', insertResult.insertId, { section: id }, req.ip);
                return res.json(formatResponse(true, 'Homepage section created and updated.'));
            }
            return res.status(404).json(formatResponse(false, 'Content block not found.'));
        }

        await connection.query(
            'UPDATE homepage_content SET content = ?, is_active = ? WHERE id = ?',
            [jsonContent, activeVal, existing[0].id]
        );

        await logActivity(connection, req.user.id, 'update_homepage', 'homepage_content', existing[0].id, { section: existing[0].section }, req.ip);
        return res.json(formatResponse(true, 'Homepage content updated.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const updateHomepageContentBySection = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { section } = req.params;
        const { content, is_active } = req.body;

        if (!section || !content) {
            return res.status(400).json(formatResponse(false, 'Section name and content are required.'));
        }

        const [existing] = await connection.query('SELECT id FROM homepage_content WHERE section = ? LIMIT 1', [section]);
        const jsonContent = typeof content === 'string' ? content : JSON.stringify(content);
        const activeVal = is_active !== undefined ? is_active : true;

        if (existing.length > 0) {
            await connection.query(
                'UPDATE homepage_content SET content = ?, is_active = ? WHERE section = ?',
                [jsonContent, activeVal, section]
            );
            await logActivity(connection, req.user.id, 'update_homepage_section', 'homepage_content', existing[0].id, { section }, req.ip);
        } else {
            const [[{ maxOrder }]] = await connection.query('SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM homepage_content');
            const [insertResult] = await connection.query(
                'INSERT INTO homepage_content (section, content, sort_order, is_active) VALUES (?, ?, ?, ?)',
                [section, jsonContent, maxOrder + 1, activeVal]
            );
            await logActivity(connection, req.user.id, 'create_homepage_section', 'homepage_content', insertResult.insertId, { section }, req.ip);
        }

        return res.json(formatResponse(true, `Content for section '${section}' updated successfully.`));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ══════════════════════════════════════════════════════════════
// ACTIVITY LOGS
// ══════════════════════════════════════════════════════════════

const getActivityLogs = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const offset = (page - 1) * limit;
        const { search, category, dateRange, startDate, endDate } = req.query;

        let baseQuery = ' FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1';
        const params = [];

        if (search) {
            baseQuery += ' AND (al.action LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR al.target_type LIKE ? OR al.target_id LIKE ? OR al.ip_address LIKE ?)';
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
        }

        if (category) {
            baseQuery += ' AND al.category = ?';
            params.push(category);
        }

        if (dateRange) {
            if (dateRange === 'today') {
                baseQuery += ' AND al.created_at >= CURDATE()';
            } else if (dateRange === 'week') {
                baseQuery += ' AND al.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
            } else if (dateRange === 'month') {
                baseQuery += ' AND al.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
            }
        } else if (startDate && endDate) {
            baseQuery += ' AND al.created_at BETWEEN ? AND ?';
            params.push(new Date(startDate), new Date(endDate));
        }

        const [[{ total }]] = await connection.query(`SELECT COUNT(*) as total${baseQuery}`, params);
        const [rows] = await connection.query(
            `SELECT al.*, u.name as user_name, u.email as user_email${baseQuery} ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return res.json(formatResponse(true, 'Activity logs fetched.', {
            data: rows,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ══════════════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════════════

const getReports = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();

        // 1. Parameter Normalization: Support type, period, startDate, endDate, from, to, date, month
        const rawType = (req.query.type || (req.query.period === 'daily' || req.query.period === 'monthly' ? req.query.period : null) || 'monthly').toLowerCase();
        const type = rawType === 'daily' ? 'daily' : 'monthly';

        let startDate = req.query.startDate || req.query.from || null;
        let endDate = req.query.endDate || req.query.to || null;

        // If 'month' parameter is provided (e.g. "2026-09")
        const monthParam = req.query.month || (req.query.period && /^\d{4}-\d{2}$/.test(req.query.period) ? req.query.period : null);
        if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
            const [year, month] = monthParam.split('-').map(Number);
            const lastDay = new Date(year, month, 0).getDate();
            startDate = `${monthParam}-01`;
            endDate = `${monthParam}-${String(lastDay).padStart(2, '0')}`;
        }

        // If 'date' parameter is provided (e.g. "2026-09-23" or "2026-09")
        const dateParam = req.query.date || (req.query.period && /^\d{4}-\d{2}-\d{2}$/.test(req.query.period) ? req.query.period : null);
        if (dateParam) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
                startDate = dateParam;
                endDate = dateParam;
            } else if (/^\d{4}-\d{2}$/.test(dateParam)) {
                const [year, month] = dateParam.split('-').map(Number);
                const lastDay = new Date(year, month, 0).getDate();
                startDate = `${dateParam}-01`;
                endDate = `${dateParam}-${String(lastDay).padStart(2, '0')}`;
            }
        }

        let dateFormat = '%Y-%m';
        if (type === 'daily') {
            dateFormat = '%Y-%m-%d';
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        const validStart = startDate && dateRegex.test(startDate) ? startDate : null;
        const validEnd = endDate && dateRegex.test(endDate) ? endDate : null;

        // Helper to construct date conditions with parameterized SQL and inclusive timestamps
        const buildDateCondition = (tableCol) => {
            if (validStart && validEnd) {
                const s = validStart <= validEnd ? validStart : validEnd;
                const e = validStart <= validEnd ? validEnd : validStart;
                return {
                    condition: `${tableCol} BETWEEN ? AND ?`,
                    params: [`${s} 00:00:00`, `${e} 23:59:59`]
                };
            } else if (validStart) {
                return {
                    condition: `${tableCol} >= ?`,
                    params: [`${validStart} 00:00:00`]
                };
            } else if (validEnd) {
                return {
                    condition: `${tableCol} <= ?`,
                    params: [`${validEnd} 23:59:59`]
                };
            } else {
                if (type === 'daily') {
                    return {
                        condition: `${tableCol} >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
                        params: []
                    };
                } else {
                    return {
                        condition: `${tableCol} >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`,
                        params: []
                    };
                }
            }
        };

        const srDate = buildDateCondition('created_at');
        const pmtDate = buildDateCondition('created_at');
        const invDate = buildDateCondition('created_at');

        // 1. Repair volume by period (service_requests)
        const [repairRows] = await connection.query(`
            SELECT 
                DATE_FORMAT(created_at, '${dateFormat}') as period,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN status IN ('completed', 'delivered') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
            FROM service_requests
            WHERE ${srDate.condition}
            GROUP BY period
            ORDER BY period ASC
        `, srDate.params);

        // 2. Collected revenue from verified payments (status = 'paid')
        // Excludes failed, created, processing, cancelled, and refunded payments.
        const [paymentRows] = await connection.query(`
            SELECT 
                DATE_FORMAT(created_at, '${dateFormat}') as period,
                COALESCE(SUM(amount), 0) as collected_revenue,
                COUNT(*) as payment_count
            FROM payments
            WHERE status = 'paid' AND ${pmtDate.condition}
            GROUP BY period
            ORDER BY period ASC
        `, pmtDate.params);

        // Also check if any tickets have payment_status = 'paid' without a payment row (e.g. legacy/direct manual adjustments)
        const legacyDateCond = buildDateCondition('COALESCE(sr.paid_at, sr.created_at)');
        const [legacyPaidRows] = await connection.query(`
            SELECT 
                DATE_FORMAT(COALESCE(sr.paid_at, sr.created_at), '${dateFormat}') as period,
                COALESCE(SUM(COALESCE(sr.repair_cost, 0)), 0) as legacy_revenue
            FROM service_requests sr
            LEFT JOIN payments p ON sr.id = p.ticket_id AND p.status = 'paid'
            WHERE sr.payment_status = 'paid' AND p.id IS NULL AND ${legacyDateCond.condition}
            GROUP BY period
        `, legacyDateCond.params);

        // 3. Invoiced / billed amount by period (from invoices)
        const [invoiceRows] = await connection.query(`
            SELECT 
                DATE_FORMAT(created_at, '${dateFormat}') as period,
                COALESCE(SUM(amount), 0) as billed_amount,
                COUNT(*) as invoice_count
            FROM invoices
            WHERE (status IS NULL OR status != 'Cancelled') AND ${invDate.condition}
            GROUP BY period
            ORDER BY period ASC
        `, invDate.params);

        // 4. Technician performance
        const techDateCond = buildDateCondition('sr.created_at');
        const [techPerformance] = await connection.query(`
            SELECT 
                u.id, u.name,
                COUNT(sr.id) as total_assigned,
                SUM(CASE WHEN sr.status IN ('completed', 'delivered') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN sr.status = 'delivered' THEN 1 ELSE 0 END) as delivered,
                SUM(CASE WHEN sr.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN sr.status = 'pending' THEN 1 ELSE 0 END) as pending
            FROM users u
            LEFT JOIN service_requests sr ON u.id = sr.assigned_technician_id AND ${techDateCond.condition}
            WHERE u.role = 'technician'
            GROUP BY u.id, u.name
            ORDER BY total_assigned DESC
        `, techDateCond.params);

        // 5. Device category breakdown
        const [categoryStats] = await connection.query(`
            SELECT device_category, COUNT(*) as count 
            FROM service_requests 
            WHERE ${srDate.condition}
            GROUP BY device_category 
            ORDER BY count DESC 
            LIMIT 10
        `, srDate.params);

        // 6. Consolidate and merge by period without Cartesian product or duplicate counting
        const repairMap = new Map();
        for (const row of repairRows) {
            repairMap.set(row.period, row);
        }

        const paymentMap = new Map();
        for (const row of paymentRows) {
            paymentMap.set(row.period, parseFloat(row.collected_revenue || 0));
        }
        for (const row of legacyPaidRows) {
            const current = paymentMap.get(row.period) || 0;
            paymentMap.set(row.period, current + parseFloat(row.legacy_revenue || 0));
        }

        const invoiceMap = new Map();
        for (const row of invoiceRows) {
            invoiceMap.set(row.period, parseFloat(row.billed_amount || 0));
        }

        // Collect all distinct periods
        const allPeriods = new Set([
            ...repairMap.keys(),
            ...paymentMap.keys(),
            ...invoiceMap.keys()
        ]);

        const sortedPeriods = Array.from(allPeriods).sort();

        let totalCollected = 0;
        let totalBilled = 0;
        let totalRepairs = 0;
        let totalCompleted = 0;
        let totalCancelled = 0;
        let totalPending = 0;

        const repairStats = sortedPeriods.map(p => {
            const r = repairMap.get(p) || {};
            const collected = paymentMap.get(p) || 0;
            const billed = invoiceMap.get(p) || 0;

            const total = Number(r.total || 0);
            const pending = Number(r.pending || 0);
            const in_progress = Number(r.in_progress || 0);
            const completed = Number(r.completed || 0);
            const delivered = Number(r.delivered || 0);
            const cancelled = Number(r.cancelled || 0);

            totalCollected += collected;
            totalBilled += billed;
            totalRepairs += total;
            totalCompleted += completed;
            totalCancelled += cancelled;
            totalPending += pending;

            return {
                period: p,
                date: p,   // Populates for Recharts daily XAxis and table
                month: p,  // Populates for Recharts monthly XAxis and table
                total,
                pending,
                in_progress,
                completed,
                delivered,
                cancelled,
                revenue: collected, // Collected revenue from verified payments!
                collectedRevenue: collected,
                billedRevenue: billed,
                outstandingRevenue: Math.max(0, billed - collected)
            };
        });

        const summary = {
            totalRevenue: totalCollected,
            collectedRevenue: totalCollected,
            billedRevenue: totalBilled,
            outstandingRevenue: Math.max(0, totalBilled - totalCollected),
            totalRepairs,
            totalRequests: totalRepairs,
            completedRepairs: totalCompleted,
            cancelledRepairs: totalCancelled,
            pendingRepairs: totalPending,
            currency: 'INR'
        };

        return res.json(formatResponse(true, 'Reports fetched.', {
            summary,
            repairStats,
            techPerformance,
            categoryStats
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ══════════════════════════════════════════════════════════════
// ADMIN PROFILE
// ══════════════════════════════════════════════════════════════

const updateProfile = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const userId = req.user.id;
        const { name, email, phone } = req.body;

        const cleanEmail = email ? email.trim().toLowerCase() : '';
        const cleanPhone = phone ? normalizePhoneNumber(phone) : null;

        if (cleanEmail) {
            const [dupEmail] = await connection.query('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [cleanEmail, userId]);
            if (dupEmail.length > 0) {
                const resp = formatResponse(false, 'This email address is already registered. Please use a different email address.');
                resp.errors = { email: 'This email address is already registered. Please use a different email address.' };
                return res.status(409).json(resp);
            }
        }

        if (cleanPhone) {
            const [dupPhone] = await connection.query('SELECT id FROM users WHERE phone = ? AND id != ? LIMIT 1', [cleanPhone, userId]);
            if (dupPhone.length > 0) {
                const resp = formatResponse(false, 'This phone number is already registered. Please use a different phone number.');
                resp.errors = { phone: 'This phone number is already registered. Please use a different phone number.' };
                return res.status(409).json(resp);
            }
        }

        await connection.query('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?', [name, cleanEmail, cleanPhone, userId]);
        await logActivity(connection, userId, 'update_profile', 'user', userId, { name, email: cleanEmail }, req.ip);

        return res.json(formatResponse(true, 'Profile updated successfully.', { name, email: cleanEmail, phone: cleanPhone }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const changePassword = async (req, res, next) => {
    let connection;
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json(formatResponse(false, 'Access denied. Only administrators can use this password change function.'));
        }

        connection = await pool.getConnection();
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json(formatResponse(false, 'Current and new password are required.'));
        }

        if (newPassword.length < 8) {
            return res.status(400).json(formatResponse(false, 'Password must be at least 8 characters long.'));
        }

        const [rows] = await connection.query('SELECT password FROM users WHERE id = ? LIMIT 1', [userId]);
        if (rows.length === 0) return res.status(404).json(formatResponse(false, 'User not found.'));

        const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
        if (!isMatch) return res.status(400).json(formatResponse(false, 'Incorrect current password.'));

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await connection.query('UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?', [hashedPassword, userId]);
        await logActivity(connection, userId, 'change_password', 'user', userId, null, req.ip);

        return res.json(formatResponse(true, 'Password changed successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const resetUserPassword = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword) {
            return res.status(400).json(formatResponse(false, 'New password is required.'));
        }

        if (newPassword.length < 8) {
            return res.status(400).json(formatResponse(false, 'Password must be at least 8 characters long.'));
        }

        const [rows] = await connection.query('SELECT name, email, role FROM users WHERE id = ? LIMIT 1', [id]);
        if (rows.length === 0) {
            return res.status(404).json(formatResponse(false, 'User not found.'));
        }

        const targetUser = rows[0];

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await connection.query(
            'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
            [hashedPassword, id]
        );

        logger.info(`Admin (ID: ${req.user.id}) reset password for user: ${targetUser.email} (ID: ${id})`);

        await logActivity(connection, req.user.id, 'password_reset', 'user', id, {
            targetName: targetUser.name,
            targetEmail: targetUser.email,
            targetRole: targetUser.role
        }, req.ip);

        return res.json(formatResponse(true, 'Password reset successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getCompanies = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';

        let baseQuery = ' FROM users u INNER JOIN company_profiles p ON u.id = p.user_id LEFT JOIN users tu ON p.assigned_technician_id = tu.id WHERE u.role = "company"';
        const params = [];

        if (status === 'active') {
            baseQuery += ' AND u.is_active = 1';
        } else if (status === 'inactive') {
            baseQuery += ' AND u.is_active = 0';
        }

        if (search) {
            const rawSearch = search.trim();
            const compIdMatch = rawSearch.match(/^(?:TD-AMC-C?|TD-C-?|CMP-)?0*(\d+)$/i);
            const isIdFormat = /^(?:TD-AMC-C?|TD-C-?|CMP-)\d+$/i.test(rawSearch);
            if (compIdMatch && isIdFormat) {
                const idValue = parseInt(compIdMatch[1], 10);
                baseQuery += ' AND (u.id = ? OR p.company_id LIKE ? OR u.company_id LIKE ?)';
                params.push(idValue, `%${rawSearch}%`, `%${rawSearch}%`);
            } else {
                baseQuery += ' AND (p.company_name LIKE ? OR u.email LIKE ? OR p.contact_person LIKE ? OR u.phone LIKE ? OR p.phone_number LIKE ? OR COALESCE(p.company_id, u.company_id) LIKE ? OR CAST(u.id AS CHAR) = ?)';
                params.push(`%${rawSearch}%`, `%${rawSearch}%`, `%${rawSearch}%`, `%${rawSearch}%`, `%${rawSearch}%`, `%${rawSearch}%`, rawSearch);
            }
        }

        const [[{ total }]] = await connection.query(`SELECT COUNT(*) as total${baseQuery}`, params);
        const [rows] = await connection.query(
            `SELECT u.id, 
                    COALESCE(
                        p.company_id, 
                        u.company_id,
                        CASE 
                            WHEN p.amc_status = 'Active' OR p.company_type = 'AMC' THEN CONCAT('TD-AMC-C', LPAD(u.id, GREATEST(3, CHAR_LENGTH(u.id)), '0'))
                            ELSE CONCAT('TD-C', LPAD(u.id, GREATEST(3, CHAR_LENGTH(u.id)), '0'))
                        END
                    ) as company_id,
                    CASE 
                        WHEN p.amc_status = 'Active' OR p.company_type = 'AMC' THEN CONCAT('TD-AMC-C', LPAD(u.id, GREATEST(3, CHAR_LENGTH(u.id)), '0'))
                        ELSE CONCAT('TD-C', LPAD(u.id, GREATEST(3, CHAR_LENGTH(u.id)), '0'))
                    END as permanent_company_id,
                    u.email, u.phone, u.is_active, u.deactivated_at, u.deactivated_by, u.deactivation_reason, u.created_at, 
                    p.company_name, p.company_logo, p.contact_person, p.address, 
                    p.gst_number, p.website_url, p.company_type, p.notes, p.amc_status, p.assigned_technician_id,
                    tu.name as assigned_technician_name,
                    (SELECT COUNT(*) FROM company_branches b WHERE b.company_id = u.id) as total_branches,
                    (SELECT COUNT(*) FROM company_employees e WHERE e.company_id = u.id) as total_employees,
                    (SELECT COUNT(*) FROM company_devices d WHERE d.company_id = u.id) as total_devices,
                    (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id) as total_tickets,
                    (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id AND r.status IN ('pending', 'in_progress')) as active_tickets,
                    (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id AND r.status IN ('completed', 'delivered')) as completed_tickets,
                    (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id AND r.status = 'cancelled') as cancelled_tickets,
                    (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id AND r.status = 'pending') as pending_repairs,
                    (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id AND r.status = 'in_progress') as in_progress_repairs,
                    (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id AND r.status = 'completed') as completed_repairs,
                    (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id AND r.status = 'cancelled') as cancelled_repairs,
                    (SELECT MAX(r.created_at) FROM service_requests r WHERE r.company_id = u.id) as last_ticket_date,
                    (SELECT COUNT(*) FROM service_requests r INNER JOIN company_devices cd ON r.device_id = cd.id WHERE r.company_id = u.id AND cd.warranty_expiry >= r.created_at) as warranty_repairs,
                    (SELECT COUNT(*) FROM invoices inv WHERE inv.user_id = u.id) as total_invoices,
                    (SELECT COUNT(*) FROM invoices inv WHERE inv.user_id = u.id AND inv.status = 'Paid') as paid_invoices,
                    (SELECT COUNT(*) FROM invoices inv WHERE inv.user_id = u.id AND inv.status != 'Paid') as unpaid_invoices,
                    (SELECT COUNT(*) FROM quotations q WHERE q.company_id = u.id) as total_quotations,
                    (SELECT COALESCE(SUM(pmt.amount), 0) FROM payments pmt WHERE (pmt.company_id = u.id OR pmt.user_id = u.id OR pmt.ticket_id IN (SELECT sr_id.id FROM service_requests sr_id WHERE sr_id.company_id = u.id)) AND pmt.status IN ('paid', 'success')) as total_paid_amount,
                    (SELECT COUNT(*) FROM payments pmt WHERE (pmt.company_id = u.id OR pmt.user_id = u.id OR pmt.ticket_id IN (SELECT sr_id.id FROM service_requests sr_id WHERE sr_id.company_id = u.id)) AND pmt.status IN ('paid', 'success')) as total_paid_count,
                    (SELECT COUNT(*) FROM messages m WHERE (m.sender_id = u.id OR m.receiver_id = u.id)) as total_support_queries,
                    (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id AND m.is_read = 0) as unread_support_queries,
                    (SELECT MAX(created_at) FROM activity_logs l WHERE l.user_id = u.id OR (l.target_type = 'user' AND l.target_id = u.id)) as last_activity
             ${baseQuery} 
             ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return res.json(formatResponse(true, 'Companies fetched.', {
            data: rows,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const { parseCsv, generateCsv } = require('../utils/csv.utils');

const toggleCompanyStatus = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        const { isActive, reason } = req.body;

        if (isActive === undefined) {
            return res.status(400).json(formatResponse(false, 'isActive field is required.'));
        }

        const [existing] = await connection.query('SELECT id, name FROM users WHERE id = ? AND role = "company" LIMIT 1', [id]);
        if (existing.length === 0) return res.status(404).json(formatResponse(false, 'Company account not found.'));

        if (isActive) {
            await connection.query(
                'UPDATE users SET is_active = 1, deactivated_at = NULL, deactivated_by = NULL, deactivation_reason = NULL WHERE id = ?',
                [id]
            );
        } else {
            await connection.query(
                'UPDATE users SET is_active = 0, token_version = token_version + 1, deactivated_at = NOW(), deactivated_by = ?, deactivation_reason = ? WHERE id = ?',
                [req.user.id, reason || 'Deactivated by admin', id]
            );
        }
        await logActivity(connection, req.user.id, isActive ? 'activate_company' : 'deactivate_company', 'user', id, { name: existing[0].name, reason }, req.ip);

        return res.json(formatResponse(true, `Company account ${isActive ? 'activated' : 'deactivated'} successfully.`));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const deleteCompany = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        const { reason } = req.body || {};

        const [existing] = await connection.query('SELECT id, name FROM users WHERE id = ? AND role = "company" LIMIT 1', [id]);
        if (existing.length === 0) return res.status(404).json(formatResponse(false, 'Company account not found.'));

        await connection.query(
            'UPDATE users SET is_active = 0, token_version = token_version + 1, deactivated_at = NOW(), deactivated_by = ?, deactivation_reason = ? WHERE id = ?',
            [req.user.id, reason || 'Deactivated by admin', id]
        );
        await logActivity(connection, req.user.id, 'deactivate_company', 'user', id, { name: existing[0].name, reason }, req.ip);

        return res.json(formatResponse(true, 'Company account deactivated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getCompanyStats = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();

        const [[{ totalCompanies }]] = await connection.query('SELECT COUNT(*) as totalCompanies FROM users WHERE role = "company"');
        const [[{ activeCompanies }]] = await connection.query('SELECT COUNT(*) as activeCompanies FROM users WHERE role = "company" AND is_active = 1');
        const [[{ inactiveCompanies }]] = await connection.query('SELECT COUNT(*) as inactiveCompanies FROM users WHERE role = "company" AND is_active = 0');

        const [[{ totalCompanyTickets, pending, inProgress, completed, delivered, cancelled }]] = await connection.query(`
            SELECT 
                COUNT(*) as totalCompanyTickets,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as inProgress,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
            FROM service_requests 
            WHERE company_id IS NOT NULL
        `);

        // Total Verified Company Income (verified payments only)
        const [[{ totalCompanyIncome, totalPaidPaymentsCount }]] = await connection.query(`
            SELECT 
                COALESCE(SUM(amount), 0) as totalCompanyIncome,
                COUNT(*) as totalPaidPaymentsCount
            FROM payments 
            WHERE status IN ('paid', 'success') 
              AND (company_id IS NOT NULL OR user_id IN (SELECT id FROM users WHERE role = 'company'))
        `);

        // Corporate Invoices Summary
        const [[{ totalInvoices, paidInvoices, unpaidInvoices }]] = await connection.query(`
            SELECT 
                COUNT(*) as totalInvoices,
                SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) as paidInvoices,
                SUM(CASE WHEN status != 'Paid' THEN 1 ELSE 0 END) as unpaidInvoices
            FROM invoices 
            WHERE user_id IN (SELECT id FROM users WHERE role = 'company')
        `);

        // Infrastructure Counts
        const [[{ totalDevices }]] = await connection.query('SELECT COUNT(*) as totalDevices FROM company_devices');
        const [[{ totalBranches }]] = await connection.query('SELECT COUNT(*) as totalBranches FROM company_branches');
        const [[{ totalEmployees }]] = await connection.query('SELECT COUNT(*) as totalEmployees FROM company_employees');

        const [[{ totalDevicesUnderRepair }]] = await connection.query(`
            SELECT COUNT(DISTINCT device_id) as totalDevicesUnderRepair 
            FROM service_requests 
            WHERE company_id IS NOT NULL AND status IN ('pending', 'in_progress')
        `);

        // Monthly Stats (Last 6 Months)
        const [monthlyStats] = await connection.query(`
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m') as month,
                COUNT(*) as total,
                SUM(CASE WHEN status IN ('completed', 'delivered') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
            FROM service_requests
            WHERE company_id IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
            ORDER BY month ASC
        `);

        return res.json(formatResponse(true, 'Company stats fetched.', {
            totalCompanies,
            activeCompanies: Number(activeCompanies || 0),
            inactiveCompanies: Number(inactiveCompanies || 0),
            totalCompanyTickets: Number(totalCompanyTickets || 0),
            totalCompanyIncome: parseFloat(totalCompanyIncome || 0),
            totalPaidPaymentsCount: Number(totalPaidPaymentsCount || 0),
            invoices: {
                total: Number(totalInvoices || 0),
                paid: Number(paidInvoices || 0),
                unpaid: Number(unpaidInvoices || 0)
            },
            statusCounts: {
                pending: Number(pending || 0),
                inProgress: Number(inProgress || 0),
                completed: Number(completed || 0),
                delivered: Number(delivered || 0),
                cancelled: Number(cancelled || 0),
                open: Number(pending || 0) + Number(inProgress || 0)
            },
            infrastructure: {
                totalDevices: Number(totalDevices || 0),
                totalBranches: Number(totalBranches || 0),
                totalEmployees: Number(totalEmployees || 0),
                totalDevicesUnderRepair: Number(totalDevicesUnderRepair || 0)
            },
            totalDevicesUnderRepair: Number(totalDevicesUnderRepair || 0),
            monthlyStats
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getCompanyDetails = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;

        // Verify company exists
        const [companies] = await connection.query(`
            SELECT u.id, 
                   COALESCE(
                       p.company_id, 
                       u.company_id,
                       CASE 
                           WHEN p.amc_status = 'Active' OR p.company_type = 'AMC' THEN CONCAT('TD-AMC-C', LPAD(u.id, GREATEST(3, CHAR_LENGTH(u.id)), '0'))
                           ELSE CONCAT('TD-C', LPAD(u.id, GREATEST(3, CHAR_LENGTH(u.id)), '0'))
                       END
                   ) as company_id,
                   CASE 
                       WHEN p.amc_status = 'Active' OR p.company_type = 'AMC' THEN CONCAT('TD-AMC-C', LPAD(u.id, GREATEST(3, CHAR_LENGTH(u.id)), '0'))
                       ELSE CONCAT('TD-C', LPAD(u.id, GREATEST(3, CHAR_LENGTH(u.id)), '0'))
                   END as permanent_company_id,
                   u.email, u.phone, u.is_active, u.created_at, 
                   p.company_name, p.company_logo, p.contact_person, p.address, 
                   p.gst_number, p.website_url, p.company_type, p.notes, p.amc_status, p.assigned_technician_id,
                   tu.name as assigned_technician_name 
            FROM users u 
            INNER JOIN company_profiles p ON u.id = p.user_id 
            LEFT JOIN users tu ON p.assigned_technician_id = tu.id
            WHERE u.id = ? AND u.role = 'company' 
            LIMIT 1
        `, [id]);

        if (companies.length === 0) {
            return res.status(404).json(formatResponse(false, 'Company not found.'));
        }
        const company = companies[0];

        // Branches
        const [branches] = await connection.query('SELECT * FROM company_branches WHERE company_id = ? ORDER BY name ASC', [id]);

        // Employees
        const [employees] = await connection.query(`
            SELECT ce.*, cb.name as branch_name 
            FROM company_employees ce
            LEFT JOIN company_branches cb ON ce.branch_id = cb.id
            WHERE ce.company_id = ?
            ORDER BY ce.name ASC
        `, [id]);

        // Devices
        const [devices] = await connection.query(`
            SELECT cd.*, ce.name as employee_name, cb.name as branch_name,
                   (SELECT COUNT(*) FROM service_requests sr WHERE sr.device_id = cd.id) as repair_count,
                   (SELECT COUNT(*) FROM service_requests sr WHERE sr.device_id = cd.id AND sr.status NOT IN ('completed', 'cancelled', 'rejected')) as active_repairs,
                   (SELECT COUNT(*) FROM service_requests sr WHERE sr.device_id = cd.id AND sr.status IN ('completed', 'repaired', 'delivered', 'closed')) as completed_repairs,
                   (SELECT MAX(sr.created_at) FROM service_requests sr WHERE sr.device_id = cd.id) as last_repair_date
            FROM company_devices cd 
            LEFT JOIN company_employees ce ON cd.employee_id = ce.id 
            LEFT JOIN company_branches cb ON cd.branch_id = cb.id 
            WHERE cd.company_id = ?
            ORDER BY cd.created_at DESC
        `, [id]);

        // Repair requests / tickets with payment status, diagnosis, prices, and assets
        const [tickets] = await connection.query(`
            SELECT sr.*, 
                   ce.name as employee_name, 
                   cd.model_number as device_model, 
                   cd.serial_number as device_serial, 
                   cd.asset_id,
                   u.name as tech_name 
            FROM service_requests sr 
            LEFT JOIN company_employees ce ON sr.employee_id = ce.id 
            LEFT JOIN company_devices cd ON sr.device_id = cd.id 
            LEFT JOIN users u ON sr.assigned_technician_id = u.id 
            WHERE sr.company_id = ?
            ORDER BY sr.created_at DESC
        `, [id]);

        // Billing: Quotations & Invoices
        const [quotations] = await connection.query('SELECT * FROM quotations WHERE company_id = ? ORDER BY created_at DESC', [id]);
        const [invoices] = await connection.query('SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC', [id]);

        // Verified Company Payments & Transaction Ledger
        const [payments] = await connection.query(`
            SELECT p.*, 
                   sr.ticket_number, 
                   sr.brand as ticket_brand, 
                   sr.model_number as ticket_model, 
                   sr.device_category as ticket_category,
                   sr.problem_description as ticket_problem,
                   cd.asset_id as device_asset_id,
                   cd.serial_number as device_serial_number
            FROM payments p
            LEFT JOIN service_requests sr ON p.ticket_id = sr.id
            LEFT JOIN company_devices cd ON sr.device_id = cd.id
            WHERE p.company_id = ? OR p.user_id = ? OR p.ticket_id IN (SELECT sr_sub.id FROM service_requests sr_sub WHERE sr_sub.company_id = ?)
            ORDER BY p.created_at DESC
        `, [id, id, id]);

        // Activity Logs
        const [activityLogs] = await connection.query(`
            SELECT l.id, l.action, l.target_type, l.details, l.created_at, u.name as actor_name 
            FROM activity_logs l 
            LEFT JOIN users u ON l.user_id = u.id 
            WHERE l.user_id = ? OR (l.target_type = 'user' AND l.target_id = ?) 
            ORDER BY l.created_at DESC LIMIT 50
        `, [id, id]);

        // Support Queries & Communications
        const [supportQueries] = await connection.query(`
            SELECT m.id, m.repair_request_id, m.sender_id, m.receiver_id, 
                   m.message, m.message as content, m.is_read, m.created_at,
                   sender.name as sender_name, sender.role as sender_role, 
                   sender.email as sender_email, sender.phone as sender_phone,
                   sr.ticket_number, sr.brand as ticket_brand, sr.model_number as ticket_model
            FROM messages m 
            LEFT JOIN users sender ON m.sender_id = sender.id 
            LEFT JOIN service_requests sr ON m.repair_request_id = sr.id
            WHERE (m.sender_id = ? OR m.receiver_id = ?)
            ORDER BY m.created_at ASC
        `, [id, id]);

        const unreadSupportCount = supportQueries.filter(m => String(m.sender_id) === String(id) && !m.is_read).length;

        return res.json(formatResponse(true, 'Company details fetched.', {
            profile: company,
            branches,
            employees,
            devices,
            tickets: tickets.map(r => ({
                id: r.id,
                userId: r.user_id,
                deviceId: r.device_id,
                customerName: r.customer_name,
                mobile: r.mobile,
                email: r.email,
                city: r.city,
                deviceCategory: r.device_category,
                brand: r.brand,
                modelNumber: r.model_number,
                problemType: r.problem_type,
                problemDescription: r.problem_description,
                serviceType: r.service_type,
                priority: r.priority,
                status: r.status,
                assignedTechnicianId: r.assigned_technician_id,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
                employeeName: r.employee_name,
                deviceModel: r.device_model,
                deviceSerial: r.device_serial,
                techName: r.tech_name,
                estimatedCompletionDate: r.estimated_completion_date,
                repairNotes: r.repair_notes,
                repairCost: parseFloat(r.repair_cost || 0),
                repair_cost: parseFloat(r.repair_cost || 0),
                slaDeadline: r.sla_deadline,
                ticketNumber: r.ticket_number,
                // Verified Payment, Diagnosis & Pricing Fields
                paymentStatus: r.payment_status || 'unpaid',
                payment_status: r.payment_status || 'unpaid',
                collectionStatus: r.collection_status || 'not_applicable',
                paymentId: r.payment_id || null,
                paidAt: r.paid_at || null,
                diagnosis: r.diagnosis || null,
                identifiedIssues: r.identified_issues || null,
                estimatedCost: r.estimated_cost ? parseFloat(r.estimated_cost) : 0,
                additionalCharges: r.additional_charges ? parseFloat(r.additional_charges) : 0,
                customerApprovalStatus: r.customer_approval_status || 'none',
                amountUpdatedByAdmin: Boolean(r.amount_updated_by_admin),
                adminUpdatedAmount: r.admin_updated_amount ? parseFloat(r.admin_updated_amount) : null,
                assetId: r.asset_id || null
            })),
            quotations,
            invoices,
            payments: payments.map(p => ({
                id: p.id,
                paymentId: p.payment_id,
                orderId: p.order_id,
                ticketId: p.ticket_id,
                invoiceId: p.invoice_id,
                userId: p.user_id,
                companyId: p.company_id,
                amount: parseFloat(p.amount),
                currency: p.currency || 'INR',
                paymentMethod: p.payment_method || 'card',
                status: p.status,
                gateway: p.gateway,
                collectionStatus: p.collection_status || 'not_applicable',
                collectedBy: p.collected_by || null,
                collectedAt: p.collected_at || null,
                verificationStatus: p.verification_status || 'pending',
                verifiedBy: p.verified_by || null,
                verifiedAt: p.verified_at || null,
                referenceNote: p.reference_note || null,
                errorMessage: p.error_message,
                createdAt: p.created_at,
                updatedAt: p.updated_at,
                ticketNumber: p.ticket_number,
                ticketBrand: p.ticket_brand,
                ticketModel: p.ticket_model,
                ticketCategory: p.ticket_category,
                ticketProblem: p.ticket_problem,
                deviceAssetId: p.device_asset_id,
                deviceSerialNumber: p.device_serial_number
            })),
            activityLogs,
            messages: supportQueries,
            totalSupportQueries: supportQueries.length,
            unreadSupportCount,
            stats: {
                total_tickets: tickets.length,
                active_tickets: tickets.filter(t => ['pending', 'in_progress'].includes(t.status)).length,
                completed_tickets: tickets.filter(t => ['completed', 'delivered'].includes(t.status)).length,
                cancelled_tickets: tickets.filter(t => t.status === 'cancelled').length
            }
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getCompanyDevices = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const companyId = req.query.companyId;
        const search = req.query.search ? req.query.search.trim() : '';
        const status = req.query.status || '';

        let baseQuery = `
            FROM company_devices cd
            INNER JOIN users u ON cd.company_id = u.id
            INNER JOIN company_profiles cp ON cd.company_id = cp.user_id
            LEFT JOIN company_employees ce ON cd.employee_id = ce.id
            LEFT JOIN company_branches cb ON cd.branch_id = cb.id
            WHERE 1=1
        `;
        const params = [];

        if (companyId && companyId !== 'all') {
            baseQuery += ' AND cd.company_id = ?';
            params.push(companyId);
        }

        if (status === 'active') {
            baseQuery += ' AND COALESCE(cd.is_active, 1) = 1';
        } else if (status === 'inactive') {
            baseQuery += ' AND cd.is_active = 0';
        }

        if (search) {
            baseQuery += ' AND (cd.brand LIKE ? OR cd.model_number LIKE ? OR cd.serial_number LIKE ? OR cd.asset_id LIKE ? OR cp.company_name LIKE ? OR ce.name LIKE ?)';
            const sp = `%${search}%`;
            params.push(sp, sp, sp, sp, sp, sp);
        }

        const [[{ total }]] = await connection.query(`SELECT COUNT(*) as total ${baseQuery}`, params);
        const [rows] = await connection.query(`
            SELECT cd.*, 
                   cp.company_name, 
                   cp.company_logo,
                   ce.name as employee_name, 
                   cb.name as branch_name,
                   (SELECT COUNT(*) FROM service_requests sr WHERE sr.device_id = cd.id) as repair_count,
                   (SELECT COUNT(*) FROM service_requests sr WHERE sr.device_id = cd.id AND sr.status NOT IN ('completed', 'delivered', 'cancelled')) as active_repairs
            ${baseQuery}
            ORDER BY cd.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        return res.json(formatResponse(true, 'Company devices fetched.', {
            data: rows,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getCompanyPayments = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const companyId = req.query.companyId;
        const search = req.query.search ? req.query.search.trim() : '';
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;

        const status = req.query.status;

        let baseQuery = `
            FROM payments p
            LEFT JOIN service_requests sr ON p.ticket_id = sr.id
            LEFT JOIN company_devices cd ON sr.device_id = cd.id
            LEFT JOIN invoices inv ON (p.invoice_id = inv.id OR inv.ticket_id = p.ticket_id)
            INNER JOIN users u ON (u.id = COALESCE(p.company_id, sr.company_id, p.user_id) AND u.role = 'company')
            INNER JOIN company_profiles cp ON cp.user_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (status && status !== 'all') {
            if (status === 'paid') {
                baseQuery += " AND p.status IN ('paid', 'success')";
            } else {
                baseQuery += " AND p.status = ?";
                params.push(status);
            }
        } else if (!status) {
            baseQuery += " AND p.status IN ('paid', 'success')";
        }

        if (companyId && companyId !== 'all') {
            baseQuery += ' AND u.id = ?';
            params.push(companyId);
        }

        if (search) {
            baseQuery += ' AND (cp.company_name LIKE ? OR sr.ticket_number LIKE ? OR inv.id LIKE ? OR p.payment_id LIKE ? OR cd.serial_number LIKE ? OR cd.asset_id LIKE ?)';
            const sp = `%${search}%`;
            params.push(sp, sp, sp, sp, sp, sp);
        }

        if (startDate) {
            baseQuery += ' AND DATE(p.created_at) >= ?';
            params.push(startDate);
        }

        if (endDate) {
            baseQuery += ' AND DATE(p.created_at) <= ?';
            params.push(endDate);
        }

        // Count total matched records and total amount
        const [[{ total, totalAmount }]] = await connection.query(
            `SELECT COUNT(*) as total, COALESCE(SUM(p.amount), 0) as totalAmount ${baseQuery}`,
            params
        );

        // Fetch company-wise verified totals
        const [companySummaries] = await connection.query(`
            SELECT 
                u.id as company_id,
                cp.company_name,
                cp.contact_person,
                u.email as company_email,
                COALESCE(SUM(p.amount), 0) as total_company_paid,
                COALESCE(SUM(p.amount), 0) as total_verified_amount,
                COUNT(*) as payment_count,
                COUNT(*) as successful_payments_count,
                MAX(p.created_at) as last_payment_date
            FROM payments p
            LEFT JOIN service_requests sr ON p.ticket_id = sr.id
            INNER JOIN users u ON (u.id = COALESCE(p.company_id, sr.company_id, p.user_id) AND u.role = 'company')
            INNER JOIN company_profiles cp ON cp.user_id = u.id
            WHERE p.status IN ('paid', 'success')
            GROUP BY u.id, cp.company_name, cp.contact_person, u.email
            ORDER BY total_verified_amount DESC
        `);

        // Fetch paginated verified payment ledger
        const [rows] = await connection.query(`
            SELECT 
                p.id,
                p.payment_id,
                p.order_id,
                p.ticket_id,
                p.invoice_id,
                p.amount,
                p.currency,
                p.payment_method,
                p.status,
                p.collection_status,
                p.collected_by,
                p.collected_at,
                p.verification_status,
                p.verified_by,
                p.verified_at,
                p.reference_note,
                p.notes,
                p.created_at as payment_date,
                u.id as company_id,
                cp.company_name,
                cp.contact_person,
                sr.ticket_number,
                sr.brand as ticket_brand,
                sr.model_number as ticket_model,
                sr.problem_description as ticket_problem,
                cd.asset_id as device_asset_id,
                cd.serial_number as device_serial_number,
                inv.id as invoice_number,
                inv.amount as invoice_amount
            ${baseQuery}
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        return res.json(formatResponse(true, 'Corporate verified payments fetched.', {
            payments: rows,
            companySummaries,
            summary: {
                totalVerifiedIncome: parseFloat(totalAmount || 0),
                total_verified_income: parseFloat(totalAmount || 0),
                totalPaidTransactions: total,
                total_transactions: total
            },
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getCompanyInvoices = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const companyId = req.query.companyId;
        const status = req.query.status;
        const search = req.query.search ? req.query.search.trim() : '';

        let baseQuery = `
            FROM invoices inv
            INNER JOIN users u ON inv.user_id = u.id AND u.role = 'company'
            INNER JOIN company_profiles cp ON u.id = cp.user_id
            LEFT JOIN service_requests sr ON inv.ticket_id = sr.id
            LEFT JOIN payments pmt ON (pmt.invoice_id = inv.id OR (pmt.ticket_id = inv.ticket_id AND inv.ticket_id IS NOT NULL)) AND pmt.status IN ('paid', 'success')
            WHERE 1=1
        `;
        const params = [];

        if (companyId && companyId !== 'all') {
            baseQuery += ' AND u.id = ?';
            params.push(companyId);
        }

        if (status && status !== 'all') {
            if (status.toLowerCase() === 'paid') {
                baseQuery += ' AND inv.status = "Paid"';
            } else if (status.toLowerCase() === 'unpaid') {
                baseQuery += ' AND inv.status != "Paid"';
            } else {
                baseQuery += ' AND inv.status = ?';
                params.push(status);
            }
        }

        if (search) {
            baseQuery += ' AND (cp.company_name LIKE ? OR inv.id LIKE ? OR sr.ticket_number LIKE ? OR inv.client_name LIKE ?)';
            const sp = `%${search}%`;
            params.push(sp, sp, sp, sp);
        }

        const [[{ total, totalAmount }]] = await connection.query(
            `SELECT COUNT(*) as total, COALESCE(SUM(inv.amount), 0) as totalAmount ${baseQuery}`,
            params
        );

        // Overall corporate invoice totals
        const [[invTotals]] = await connection.query(`
            SELECT 
                COUNT(*) as total_invoices_count,
                COALESCE(SUM(CASE WHEN status = 'Paid' THEN amount ELSE 0 END), 0) as total_paid_amount,
                COALESCE(SUM(CASE WHEN status != 'Paid' THEN amount ELSE 0 END), 0) as total_unpaid_amount,
                COUNT(CASE WHEN status = 'Paid' THEN 1 END) as total_paid_invoices_count
            FROM invoices inv
            INNER JOIN users u ON inv.user_id = u.id AND u.role = 'company'
        `);

        // Fetch company-level invoice & payment summary table (answering the 3 core questions)
        const [companySummary] = await connection.query(`
            SELECT 
                u.id as company_id,
                cp.company_name,
                cp.contact_person,
                u.email as company_email,
                (SELECT COUNT(*) FROM service_requests sr_c WHERE sr_c.company_id = u.id) as total_tickets,
                (SELECT COUNT(*) FROM invoices inv_c WHERE inv_c.user_id = u.id) as total_invoices,
                (SELECT COUNT(*) FROM invoices inv_c WHERE inv_c.user_id = u.id AND inv_c.status = 'Paid') as paid_invoices,
                (SELECT COUNT(*) FROM invoices inv_c WHERE inv_c.user_id = u.id AND inv_c.status = 'Paid') as paid_invoices_count,
                (SELECT COUNT(*) FROM invoices inv_c WHERE inv_c.user_id = u.id AND inv_c.status != 'Paid') as unpaid_invoices,
                (SELECT COUNT(*) FROM invoices inv_c WHERE inv_c.user_id = u.id AND inv_c.status != 'Paid') as unpaid_invoices_count,
                (SELECT COALESCE(SUM(pmt_c.amount), 0) FROM payments pmt_c WHERE (pmt_c.company_id = u.id OR pmt_c.user_id = u.id) AND pmt_c.status IN ('paid', 'success')) as total_paid_amount,
                (SELECT COALESCE(SUM(inv_c.amount), 0) FROM invoices inv_c WHERE inv_c.user_id = u.id AND inv_c.status != 'Paid') as total_unpaid_amount
            FROM users u
            INNER JOIN company_profiles cp ON u.id = cp.user_id
            WHERE u.role = 'company'
            ORDER BY cp.company_name ASC
        `);

        // Fetch paginated corporate invoices list
        const [rows] = await connection.query(`
            SELECT 
                inv.id,
                inv.id as invoice_number,
                inv.client_name,
                inv.amount,
                inv.currency,
                inv.invoice_date,
                inv.due_date,
                inv.status,
                inv.notes,
                inv.created_at,
                inv.paid_at,
                u.id as company_id,
                cp.company_name,
                cp.contact_person,
                cp.gst_number,
                sr.id as ticket_id,
                sr.ticket_number,
                sr.brand as ticket_brand,
                sr.model_number as ticket_model,
                pmt.payment_id,
                pmt.payment_method
            ${baseQuery}
            ORDER BY inv.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        return res.json(formatResponse(true, 'Corporate invoices fetched.', {
            invoices: rows,
            companySummary,
            summary: {
                totalInvoices: total,
                total_invoices_count: parseInt(invTotals?.total_invoices_count || total),
                totalAmount: parseFloat(totalAmount || 0),
                total_paid_amount: parseFloat(invTotals?.total_paid_amount || 0),
                total_unpaid_amount: parseFloat(invTotals?.total_unpaid_amount || 0),
                total_paid_invoices_count: parseInt(invTotals?.total_paid_invoices_count || 0)
            },
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const updateCompany = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        const { name, email, phone, contact_person, address, gst_number, website_url, company_logo, company_type, notes, amc_status, assigned_technician_id } = req.body;

        const [existing] = await connection.query('SELECT id FROM users WHERE id = ? AND role = "company" LIMIT 1', [id]);
        if (existing.length === 0) {
            return res.status(404).json(formatResponse(false, 'Company not found.'));
        }

        const cleanEmail = email ? email.trim().toLowerCase() : '';
        const cleanPhone = phone ? normalizePhoneNumber(phone) : null;

        // Check unique email if changing
        if (cleanEmail) {
            const [emailCheck] = await connection.query('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [cleanEmail, id]);
            if (emailCheck.length > 0) {
                const resp = formatResponse(false, 'This email address is already registered. Please use a different email address.');
                resp.errors = { email: 'This email address is already registered. Please use a different email address.' };
                return res.status(409).json(resp);
            }
        }

        // Check unique phone if changing
        if (cleanPhone) {
            const [phoneCheck] = await connection.query('SELECT id FROM users WHERE phone = ? AND id != ? LIMIT 1', [cleanPhone, id]);
            if (phoneCheck.length > 0) {
                const resp = formatResponse(false, 'This phone number is already registered. Please use a different phone number.');
                resp.errors = { phone: 'This phone number is already registered. Please use a different phone number.' };
                return res.status(409).json(resp);
            }
        }

        await connection.beginTransaction();

        await connection.query(
            'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
            [name, cleanEmail, cleanPhone, id]
        );

        await connection.query(
            `UPDATE company_profiles 
             SET company_name = ?, contact_person = ?, phone_number = ?, address = ?, gst_number = ?, website_url = ?, 
                 company_logo = ?, company_type = ?, notes = ?, amc_status = ?, assigned_technician_id = ? 
             WHERE user_id = ?`,
            [
                name, contact_person || '', cleanPhone || '', address || '', gst_number || null, website_url || null,
                company_logo || null, company_type || 'Business', notes || null, amc_status || 'Inactive',
                assigned_technician_id || null, id
            ]
        );

        await connection.commit();

        await logActivity(connection, req.user.id, 'update_company', 'user', id, { name, email: cleanEmail }, req.ip);

        return res.json(formatResponse(true, 'Company updated successfully.'));
    } catch (error) {
        if (connection) await connection.rollback();
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Export Companies to CSV (Admin) ───────────────────────────────────

const exportCompaniesToCsv = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const search = req.query.search || '';
        const status = req.query.status || '';

        let query = `
            SELECT u.id, u.email, u.phone, u.is_active, u.created_at,
                   p.company_name, p.contact_person, p.address, p.gst_number, p.website_url,
                   p.company_type, p.notes, p.amc_status,
                   tu.name as assigned_technician_name,
                   (SELECT COUNT(*) FROM company_devices d WHERE d.company_id = u.id) as total_devices,
                   (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id) as total_tickets,
                   (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id AND r.status IN ('pending', 'in_progress')) as open_tickets,
                   (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id AND r.status = 'completed') as completed_tickets
            FROM users u
            INNER JOIN company_profiles p ON u.id = p.user_id
            LEFT JOIN users tu ON p.assigned_technician_id = tu.id
            WHERE u.role = 'company'
        `;
        const params = [];

        if (status === 'active') {
            query += ' AND u.is_active = 1';
        } else if (status === 'inactive') {
            query += ' AND u.is_active = 0';
        }

        if (search) {
            query += ' AND (p.company_name LIKE ? OR u.email LIKE ? OR p.contact_person LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY u.created_at DESC';

        const [rows] = await connection.query(query, params);

        const headers = [
            { label: 'Company ID', key: 'id' },
            { label: 'Company Name', key: 'company_name' },
            { label: 'Contact Person', key: 'contact_person' },
            { label: 'Email', key: 'email' },
            { label: 'Phone', key: 'phone' },
            { label: 'Address', key: 'address' },
            { label: 'GST Number', key: 'gst_number' },
            { label: 'Website', key: 'website_url' },
            { label: 'Company Type', key: 'company_type' },
            { label: 'AMC Status', key: 'amc_status' },
            { label: 'Dedicated Technician', key: 'assigned_technician_name' },
            { label: 'Total Devices', key: 'total_devices' },
            { label: 'Total Repair Tickets', key: 'total_tickets' },
            { label: 'Open Tickets', key: 'open_tickets' },
            { label: 'Completed Tickets', key: 'completed_tickets' },
            { label: 'Account Status', key: 'status_label' },
            { label: 'Registered Date', key: 'created_at' }
        ];

        const csvString = generateCsv(headers, rows.map(r => ({
            ...r,
            status_label: r.is_active ? 'Active' : 'Inactive',
            created_at: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : ''
        })));

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="corporate_clients_export.csv"');
        return res.send(csvString);
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Export Single Company Dossier (Admin / Company) ───────────────────

const exportSingleCompanyDetails = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;

        const [companies] = await connection.query(`
            SELECT u.id, u.email, u.phone, u.is_active, u.created_at,
                   p.company_name, p.contact_person, p.address, p.gst_number, p.website_url,
                   p.company_type, p.notes, p.amc_status,
                   tu.name as assigned_technician_name
            FROM users u
            INNER JOIN company_profiles p ON u.id = p.user_id
            LEFT JOIN users tu ON p.assigned_technician_id = tu.id
            WHERE u.id = ? AND u.role = 'company'
            LIMIT 1
        `, [id]);

        if (companies.length === 0) {
            return res.status(404).json(formatResponse(false, 'Company not found.'));
        }

        const [branches] = await connection.query('SELECT * FROM company_branches WHERE company_id = ?', [id]);
        const [employees] = await connection.query('SELECT * FROM company_employees WHERE company_id = ?', [id]);
        const [devices] = await connection.query('SELECT * FROM company_devices WHERE company_id = ?', [id]);
        const [tickets] = await connection.query('SELECT * FROM service_requests WHERE company_id = ? ORDER BY created_at DESC', [id]);

        return res.json(formatResponse(true, 'Company portfolio dossier fetched successfully.', {
            company: companies[0],
            branches,
            employees,
            devices,
            tickets,
            summary: {
                totalBranches: branches.length,
                totalEmployees: employees.length,
                totalDevices: devices.length,
                totalTickets: tickets.length,
                openTickets: tickets.filter(t => t.status === 'pending' || t.status === 'in_progress').length,
                completedTickets: tickets.filter(t => t.status === 'completed' || t.status === 'delivered').length
            }
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Bulk Import Companies (Admin) ─────────────────────────────────────

const importBulkCompanies = async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json(formatResponse(false, 'No CSV file uploaded.'));
    }

    const filePath = req.file.path;
    let connection;
    try {
        const fs = require('fs');
        const csvContent = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseCsv(csvContent);

        if (!parsed.data || parsed.data.length === 0) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json(formatResponse(false, 'CSV file is empty or missing data rows.'));
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        let importedCount = 0;
        let updatedCount = 0;
        const errors = [];
        const skipped = [];

        for (let idx = 0; idx < parsed.data.length; idx++) {
            const rowNumber = idx + 2;
            const row = parsed.data[idx];

            const name = row.company_name || row.name || row.company || '';
            const email = (row.email || row.contact_email || '').trim().toLowerCase();
            const phone = row.phone || row.phone_number || row.mobile || '';
            const contactPerson = row.contact_person || row.contact || name;
            const address = row.address || '';
            const gstNumber = row.gst_number || row.gst || null;
            const websiteUrl = row.website_url || row.website || null;
            const companyType = row.company_type || 'Business';
            const amcStatus = row.amc_status || 'Inactive';
            const password = row.password || 'TekDoctor@Company123';

            if (!name.trim()) {
                errors.push({ row: rowNumber, error: 'Missing company name.' });
                continue;
            }
            if (!email.trim() || !email.includes('@')) {
                errors.push({ row: rowNumber, error: `Invalid or missing email for company "${name}".` });
                continue;
            }

            // Check if user exists
            const [existing] = await connection.query('SELECT id, role FROM users WHERE email = ? LIMIT 1', [email]);
            if (existing.length > 0) {
                if (existing[0].role === 'company') {
                    // Update profile
                    await connection.query(
                        `UPDATE company_profiles
                         SET company_name = ?, contact_person = ?, phone_number = COALESCE(?, phone_number),
                             address = COALESCE(?, address), gst_number = COALESCE(?, gst_number),
                             website_url = COALESCE(?, website_url), company_type = ?, amc_status = ?
                         WHERE user_id = ?`,
                        [name, contactPerson, phone || null, address || null, gstNumber, websiteUrl, companyType, amcStatus, existing[0].id]
                    );
                    updatedCount++;
                    skipped.push({ row: rowNumber, email, reason: 'Updated existing corporate account' });
                } else {
                    errors.push({ row: rowNumber, error: `Email ${email} is already taken by a non-company account.` });
                }
                continue;
            }

            const salt = await bcrypt.genSalt(12);
            const hashedPassword = await bcrypt.hash(password, salt);

            const [userRes] = await connection.query(
                'INSERT INTO users (name, email, password, phone, role, is_active) VALUES (?, ?, ?, ?, "company", 1)',
                [name, email, hashedPassword, phone || null]
            );
            const newCompanyId = userRes.insertId;

            await connection.query(
                `INSERT INTO company_profiles
                 (user_id, company_name, contact_person, phone_number, address, gst_number, website_url, company_type, amc_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [newCompanyId, name, contactPerson, phone || '', address || '', gstNumber, websiteUrl, companyType, amcStatus]
            );

            importedCount++;
        }

        await logActivity(connection, req.user.id, 'bulk_import_companies', 'user', null, {
            imported: importedCount,
            updated: updatedCount,
            failed: errors.length
        }, req.ip);

        await connection.commit();

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        return res.json(formatResponse(true, `Processed ${parsed.data.length} corporate records: ${importedCount} created, ${updatedCount} updated, ${errors.length} failed.`, {
            count: importedCount,
            imported: importedCount,
            updated: updatedCount,
            failed: errors.length,
            totalRows: parsed.data.length,
            errors,
            skipped
        }));
    } catch (error) {
        if (connection) await connection.rollback();
        try {
            const fs = require('fs');
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}
        next(error);
    } finally {
        if (connection) connection.release();
    }
};


const bulkUpdateTickets = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { ticketIds, assignedTechnicianId, status } = req.body;

        if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
            return res.status(400).json(formatResponse(false, 'ticketIds array is required.'));
        }

        const updates = [];
        const params = [];

        if (status) {
            updates.push('status = ?');
            params.push(status);
        }

        if (assignedTechnicianId !== undefined) {
            updates.push('assigned_technician_id = ?');
            params.push(assignedTechnicianId === null ? null : assignedTechnicianId);
        }

        if (updates.length === 0) {
            return res.status(400).json(formatResponse(false, 'No fields provided to update (status or assignedTechnicianId).'));
        }

        const query = `UPDATE service_requests SET ${updates.join(', ')} WHERE id IN (?)`;
        await connection.query(query, [...params, ticketIds]);

        for (const tId of ticketIds) {
            await logActivity(connection, req.user.id, 'bulk_update_ticket', 'service_request', tId, { status, assignedTechnicianId }, req.ip);
        }

        return res.json(formatResponse(true, 'Tickets updated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getAllTaskTransfers = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const {
            page = 1,
            limit = 20,
            search = '',
            status = 'all',
            technicianId = 'all',
            startDate = '',
            endDate = '',
            ticketId = ''
        } = req.query;

        const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
        const numLimit = parseInt(limit, 10);

        const conditions = ['1=1'];
        const params = [];

        if (status && status !== 'all') {
            conditions.push('tt.status = ?');
            params.push(status);
        }

        if (ticketId) {
            conditions.push('tt.repair_request_id = ?');
            params.push(ticketId);
        }

        if (technicianId && technicianId !== 'all') {
            conditions.push('(tt.from_technician_id = ? OR tt.to_technician_id = ?)');
            params.push(technicianId, technicianId);
        }

        if (startDate) {
            conditions.push('tt.transferred_at >= ?');
            params.push(`${startDate} 00:00:00`);
        }

        if (endDate) {
            conditions.push('tt.transferred_at <= ?');
            params.push(`${endDate} 23:59:59.999`);
        }

        if (search && search.trim()) {
            const q = `%${search.trim()}%`;
            conditions.push('(sr.ticket_number LIKE ? OR sr.customer_name LIKE ? OR sr.brand LIKE ? OR sr.model_number LIKE ? OR from_u.name LIKE ? OR to_u.name LIKE ? OR tt.reason LIKE ?)');
            params.push(q, q, q, q, q, q, q);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get Total Count
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM task_transfers tt
            LEFT JOIN users from_u ON tt.from_technician_id = from_u.id
            LEFT JOIN users to_u ON tt.to_technician_id = to_u.id
            LEFT JOIN service_requests sr ON tt.repair_request_id = sr.id
            ${whereClause}
        `;
        const [countResult] = await connection.query(countQuery, params);
        const totalRecords = countResult[0].total;

        // Get Global Stats
        const [statRows] = await connection.query(`
            SELECT 
                COUNT(*) as totalTransfers,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingTransfers,
                SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as acceptedTransfers,
                SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejectedTransfers
            FROM task_transfers
        `);

        const stats = {
            totalTransfers: statRows[0]?.totalTransfers || 0,
            pendingTransfers: statRows[0]?.pendingTransfers || 0,
            acceptedTransfers: statRows[0]?.acceptedTransfers || 0,
            rejectedTransfers: statRows[0]?.rejectedTransfers || 0
        };

        // Data Query
        const dataQuery = `
            SELECT 
                tt.id,
                tt.repair_request_id AS repairRequestId,
                tt.from_technician_id AS fromTechnicianId,
                tt.to_technician_id AS toTechnicianId,
                tt.initiated_by_user_id AS initiatedByUserId,
                tt.reason,
                tt.status AS transferStatus,
                tt.response_notes AS responseNotes,
                tt.transferred_at AS transferredAt,
                tt.responded_at AS respondedAt,
                from_u.name AS fromTechnicianName,
                from_u.email AS fromTechnicianEmail,
                to_u.name AS toTechnicianName,
                to_u.email AS toTechnicianEmail,
                init_u.name AS initiatedByName,
                init_u.role AS initiatedByRole,
                sr.ticket_number AS ticketNumber,
                sr.customer_name AS customerName,
                sr.mobile AS customerMobile,
                sr.device_category AS deviceCategory,
                sr.brand,
                sr.model_number AS modelNumber,
                sr.status AS currentTicketStatus,
                sr.priority AS ticketPriority
            FROM task_transfers tt
            LEFT JOIN users from_u ON tt.from_technician_id = from_u.id
            LEFT JOIN users to_u ON tt.to_technician_id = to_u.id
            LEFT JOIN users init_u ON tt.initiated_by_user_id = init_u.id
            LEFT JOIN service_requests sr ON tt.repair_request_id = sr.id
            ${whereClause}
            ORDER BY tt.transferred_at DESC
            LIMIT ? OFFSET ?
        `;

        const [rows] = await connection.query(dataQuery, [...params, numLimit, offset]);

        return res.json(formatResponse(true, 'Task transfers retrieved successfully.', {
            transfers: rows,
            pagination: {
                page: Math.max(1, parseInt(page, 10)),
                limit: numLimit,
                totalRecords,
                totalPages: Math.ceil(totalRecords / numLimit) || 1
            },
            stats
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Company Support Queries & Communications ─────────────────────────────────

const getCompanyMessages = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        const companyId = parseInt(id, 10);
        if (!companyId || isNaN(companyId) || companyId <= 0) {
            return res.status(400).json(formatResponse(false, 'Valid company ID is required.'));
        }

        // Verify company exists
        const [comp] = await connection.query(
            'SELECT id, name, email, phone FROM users WHERE id = ? AND role = "company" LIMIT 1',
            [companyId]
        );
        if (comp.length === 0) {
            return res.status(404).json(formatResponse(false, 'Company not found.'));
        }

        // Automatically mark incoming messages from this company as read when Admin views them
        await connection.query(
            'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
            [companyId, req.user.id]
        );

        // Fetch all communications between this company and Admin
        const [rows] = await connection.query(`
            SELECT m.id, m.repair_request_id, m.sender_id, m.receiver_id, 
                   m.message, m.message as content, m.is_read, m.created_at,
                   sender.name as sender_name, sender.role as sender_role, 
                   sender.email as sender_email, sender.phone as sender_phone,
                   sr.ticket_number, sr.brand as ticket_brand, sr.model_number as ticket_model
            FROM messages m
            LEFT JOIN users sender ON m.sender_id = sender.id
            LEFT JOIN service_requests sr ON m.repair_request_id = sr.id
            WHERE (m.sender_id = ? OR m.receiver_id = ?)
            ORDER BY m.created_at ASC
        `, [companyId, companyId]);

        return res.json(formatResponse(true, 'Company support messages fetched.', rows));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const replyCompanyMessage = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        const companyId = parseInt(id, 10);
        if (!companyId || isNaN(companyId) || companyId <= 0) {
            return res.status(400).json(formatResponse(false, 'Valid company ID is required.'));
        }

        const message = (req.body.message || req.body.content || '').trim();
        if (!message) {
            return res.status(400).json(formatResponse(false, 'Reply message cannot be empty.'));
        }
        if (message.length > 500) {
            return res.status(400).json(formatResponse(false, 'Message cannot exceed 500 characters.'));
        }

        const repairRequestId = req.body.repairRequestId ? parseInt(req.body.repairRequestId, 10) : null;

        // Verify company exists
        const [comp] = await connection.query(
            'SELECT id, name, email FROM users WHERE id = ? AND role = "company" LIMIT 1',
            [companyId]
        );
        if (comp.length === 0) {
            return res.status(404).json(formatResponse(false, 'Company not found.'));
        }

        // Insert Admin reply into messages
        const [result] = await connection.query(
            'INSERT INTO messages (repair_request_id, sender_id, receiver_id, message, is_read) VALUES (?, ?, ?, ?, 0)',
            [repairRequestId, req.user.id, companyId, message]
        );

        // Also create a notification for the company
        const preview = message.length > 80 ? `${message.substring(0, 80)}...` : message;
        await connection.query(
            'INSERT INTO notifications (user_id, sender_id, ticket_id, title, message, is_read) VALUES (?, ?, ?, ?, ?, 0)',
            [companyId, req.user.id, repairRequestId, 'TekDoctor Support Response', `Admin replied to your support query: "${preview}"`]
        );

        await logActivity(connection, req.user.id, 'company_support_reply', 'company', companyId, {
            companyName: comp[0].name,
            messageId: result.insertId,
            replyPreview: preview
        }, req.ip);

        return res.status(201).json(formatResponse(true, 'Reply sent to company successfully.', {
            id: result.insertId,
            companyId,
            message
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const markCompanyMessagesRead = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        const companyId = parseInt(id, 10);
        if (!companyId || isNaN(companyId) || companyId <= 0) {
            return res.status(400).json(formatResponse(false, 'Valid company ID is required.'));
        }

        await connection.query(
            'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
            [companyId, req.user.id]
        );

        return res.json(formatResponse(true, 'Support messages marked as read.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

module.exports = {
    getDashboardStats,
    getCustomers, updateCustomer, deleteCustomer, reactivateCustomer, getCustomerHistory, createCompany,
    getCompanies, toggleCompanyStatus, deleteCompany, updateCompany, getCompanyStats, getCompanyDetails, getCompanyDevices,
    getCompanyPayments, getCompanyInvoices,
    exportCompaniesToCsv, exportSingleCompanyDetails, importBulkCompanies,
    bulkUpdateTickets,
    getContacts, deleteContact, bulkDeleteContacts, replyToContact,
    getSettings, updateSettings, testEmailSettings,
    getHomepageContent, updateHomepageContent, updateHomepageContentBySection,
    uploadFile,
    getActivityLogs,
    getReports,
    updateProfile, changePassword, resetUserPassword,
    getAllTaskTransfers,
    logActivity,
    getCompanyMessages,
    replyCompanyMessage,
    markCompanyMessagesRead
};


