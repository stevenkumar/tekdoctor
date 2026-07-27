const bcrypt = require('bcryptjs');
const { pool } = require('../config/db.config');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const nodemailer = require('nodemailer');
const { sendCustomerNotification } = require('../utils/email.utils');

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

        const [[{ totalUsers }]] = await connection.query('SELECT COUNT(*) as totalUsers FROM users WHERE role = "customer"');
        const [[{ totalTechnicians }]] = await connection.query('SELECT COUNT(*) as totalTechnicians FROM users WHERE role = "technician"');
        const [[{ totalTickets }]] = await connection.query('SELECT COUNT(*) as totalTickets FROM service_requests');
        const [[{ pending }]] = await connection.query('SELECT COUNT(*) as pending FROM service_requests WHERE status = "pending"');
        const [[{ inProgress }]] = await connection.query('SELECT COUNT(*) as inProgress FROM service_requests WHERE status = "in_progress"');
        const [[{ completed }]] = await connection.query('SELECT COUNT(*) as completed FROM service_requests WHERE status = "completed"');
        const [[{ cancelled }]] = await connection.query('SELECT COUNT(*) as cancelled FROM service_requests WHERE status = "cancelled"');
        const [[{ totalContacts }]] = await connection.query('SELECT COUNT(*) as totalContacts FROM contacts');

        // Detailed Recent 10 tickets
        const [recentTickets] = await connection.query(`
            SELECT sr.id, sr.ticket_number, sr.customer_name, sr.device_category, sr.brand, sr.model_number, sr.problem_type, sr.status, sr.priority, sr.created_at, sr.updated_at, sr.estimated_completion_date, tu.name as tech_name
            FROM service_requests sr
            LEFT JOIN users tu ON sr.assigned_technician_id = tu.id
            ORDER BY sr.created_at DESC LIMIT 10
        `);

        // High priority uncompleted repairs
        const [highPriorityRepairs] = await connection.query(`
            SELECT sr.id, sr.ticket_number, sr.customer_name, sr.device_category, sr.brand, sr.model_number, sr.problem_type, sr.status, sr.priority, sr.created_at, sr.estimated_completion_date, tu.name as tech_name
            FROM service_requests sr
            LEFT JOIN users tu ON sr.assigned_technician_id = tu.id
            WHERE sr.priority IN ('urgent', 'critical', 'high', 'emergency') AND sr.status NOT IN ('completed', 'cancelled')
            ORDER BY sr.created_at DESC LIMIT 10
        `);

        // Pending assignments (repair tickets without technician assigned)
        const [pendingAssignments] = await connection.query(`
            SELECT sr.id, sr.ticket_number, sr.customer_name, sr.device_category, sr.brand, sr.model_number, sr.problem_type, sr.status, sr.priority, sr.created_at
            FROM service_requests sr
            WHERE sr.assigned_technician_id IS NULL AND sr.status NOT IN ('completed', 'cancelled')
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

        // System Alerts
        const [[{ unassignedCount }]] = await connection.query('SELECT COUNT(*) as unassignedCount FROM service_requests WHERE assigned_technician_id IS NULL AND status NOT IN ("completed", "cancelled")');
        const [[{ overdueCount }]] = await connection.query('SELECT COUNT(*) as overdueCount FROM service_requests WHERE sla_deadline < NOW() AND status NOT IN ("completed", "cancelled")');
        const [[{ pendingMessagesCount }]] = await connection.query('SELECT COUNT(*) as pendingMessagesCount FROM contacts');

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
            totalTickets,
            totalContacts,
            statusCounts: { pending, inProgress, completed, cancelled },
            recentTickets: recentTickets.map(r => ({
                id: r.id,
                ticketNumber: r.ticket_number,
                customerName: r.customer_name,
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

        let baseQuery = ' FROM users WHERE 1=1';
        const params = [];

        if (role) {
            baseQuery += ' AND role = ?';
            params.push(role);
        } else {
            baseQuery += ' AND role IN ("customer", "company", "technician", "admin")';
        }

        if (search) {
            let customerIdMatch = search.match(/^TD-(C)?(\d+)$/i);
            if (customerIdMatch) {
                const idValue = parseInt(customerIdMatch[2], 10);
                baseQuery += ' AND id = ?';
                params.push(idValue);
            } else {
                baseQuery += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR id IN (SELECT user_id FROM service_requests WHERE ticket_number LIKE ?))';
                params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
            }
        }

        const [[{ total }]] = await connection.query(`SELECT COUNT(*) as total${baseQuery}`, params);
        const [rows] = await connection.query(
            `SELECT id, name, email, phone, role, is_active, created_at, updated_at${baseQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
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

        const [existing] = await connection.query('SELECT id FROM users WHERE id = ? AND role IN ("customer", "company") LIMIT 1', [id]);
        if (existing.length === 0) return res.status(404).json(formatResponse(false, 'Customer not found.'));

        await connection.query('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?', [name, email, phone || null, id]);
        await logActivity(connection, req.user.id, 'update_customer', 'user', id, { name, email }, req.ip);

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

        if (req.user.id === parseInt(id, 10)) {
            return res.status(400).json(formatResponse(false, 'You cannot delete your own admin account.'));
        }

        const [existing] = await connection.query('SELECT id, name FROM users WHERE id = ? LIMIT 1', [id]);
        if (existing.length === 0) return res.status(404).json(formatResponse(false, 'User not found.'));

        await connection.query('DELETE FROM users WHERE id = ?', [id]);
        await logActivity(connection, req.user.id, 'delete_customer', 'user', id, { name: existing[0].name }, req.ip);

        return res.json(formatResponse(true, 'User deleted successfully.'));
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

        const [rows] = await connection.query(
            `SELECT sr.id, sr.ticket_number, sr.customer_name, sr.device_category, sr.brand, sr.model_number, 
                    sr.problem_type, sr.status, sr.priority, sr.created_at, sr.updated_at, sr.customer_repair_description,
                    t.name as technician_name
             FROM service_requests sr
             LEFT JOIN users t ON sr.assigned_technician_id = t.id
             WHERE sr.user_id = ? ORDER BY sr.created_at DESC`,
            [id]
        );

        return res.json(formatResponse(true, 'Customer history fetched.', rows.map(r => ({
            id: r.id,
            ticketNumber: r.ticket_number,
            customerName: r.customer_name,
            deviceCategory: r.device_category,
            brand: r.brand,
            modelNumber: r.model_number,
            problemType: r.problem_type,
            status: r.status,
            priority: r.priority,
            technicianName: r.technician_name,
            customerRepairDescription: r.customer_repair_description,
            createdAt: r.created_at,
            updatedAt: r.updated_at
        }))));
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

        // Check if email already exists
        const [existing] = await connection.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
        if (existing.length > 0) {
            return res.status(400).json(formatResponse(false, 'A user with this email already exists.'));
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        // Insert Company User
        const [userResult] = await connection.query(
            'INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, "company")',
            [name, email, hashedPassword, phone || null]
        );
        const companyId = userResult.insertId;

        // Scaffold company_profiles to prevent auth crashes
        await connection.query(
            'INSERT INTO company_profiles (user_id, company_name, contact_person, phone_number, address) VALUES (?, ?, ?, ?, ?)',
            [companyId, name, 'Admin Created', phone || '', '']
        );

        await logActivity(connection, req.user.id, 'create_company', 'user', companyId, { name, email }, req.ip);

        return res.status(201).json(formatResponse(true, 'Company account created successfully.', { id: companyId }));
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

        const [[{ total }]] = await connection.query('SELECT COUNT(*) as total FROM contacts');
        const [rows] = await connection.query('SELECT * FROM contacts ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);

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

const replyToContact = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        const { subject, message } = req.body;

        const [rows] = await connection.query('SELECT * FROM contacts WHERE id = ? LIMIT 1', [id]);
        if (rows.length === 0) return res.status(404).json(formatResponse(false, 'Contact not found.'));

        const contact = rows[0];
        const html = `<h3>Reply from The Tek Doctor</h3><p>${message}</p><hr><p><em>Original message from ${contact.name}:</em></p><p>${contact.message}</p>`;

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

        // Transform to a grouped object
        const settings = {};
        rows.forEach(r => {
            if (!settings[r.setting_group]) settings[r.setting_group] = {};
            settings[r.setting_group][r.setting_key] = r.setting_value;
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
    company_email: 'company',
    company_address: 'company',
    logo_url: 'company',
    theme_primary_color: 'theme',
    theme_secondary_color: 'theme',
    favicon_url: 'branding',
    facebook_url: 'social',
    twitter_url: 'social',
    instagram_url: 'social',
    linkedin_url: 'social',
    google_maps_link: 'integrations',
    google_sheet_url: 'integrations',
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
    template_status_update: 'email'
};

const updateSettings = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { settings, group } = req.body; // { key: value, ... }

        if (!settings || typeof settings !== 'object') {
            return res.status(400).json(formatResponse(false, 'Settings object is required.'));
        }

        for (const [key, value] of Object.entries(settings)) {
            const keyGroup = group || SETTING_KEY_GROUPS[key] || 'general';
            await connection.query(
                'INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?, setting_group = ?',
                [key, value, keyGroup, value, keyGroup]
            );
        }

        await logActivity(connection, req.user.id, 'update_settings', 'settings', null, { keys: Object.keys(settings) }, req.ip);
        return res.json(formatResponse(true, 'Settings updated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const testEmailSettings = async (req, res, next) => {
    try {
        const { settings } = req.body;
        if (!settings || !settings.smtp_host || !settings.smtp_port || !settings.smtp_user || !settings.smtp_password) {
            return res.status(400).json(formatResponse(false, 'Incomplete SMTP configuration provided.'));
        }

        const transporter = nodemailer.createTransport({
            host: settings.smtp_host,
            port: parseInt(settings.smtp_port, 10),
            secure: parseInt(settings.smtp_port, 10) === 465, // true for 465, false for other ports
            auth: {
                user: settings.smtp_user,
                pass: settings.smtp_password
            },
            tls: {
                rejectUnauthorized: false
            }
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

        const [existing] = await connection.query('SELECT id FROM homepage_content WHERE id = ? LIMIT 1', [id]);
        if (existing.length === 0) return res.status(404).json(formatResponse(false, 'Content block not found.'));

        await connection.query(
            'UPDATE homepage_content SET content = ?, is_active = ? WHERE id = ?',
            [JSON.stringify(content), is_active !== undefined ? is_active : true, id]
        );

        await logActivity(connection, req.user.id, 'update_homepage', 'homepage_content', id, null, req.ip);
        return res.json(formatResponse(true, 'Homepage content updated.'));
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
        const type = req.query.type || 'monthly'; // daily or monthly
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;

        let dateFormat = '%Y-%m';
        let dateCondition = 'created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)';

        if (type === 'daily') {
            dateFormat = '%Y-%m-%d';
            dateCondition = 'created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        }

        if (startDate && endDate) {
            dateCondition = `created_at BETWEEN '${startDate} 00:00:00' AND '${endDate} 23:59:59'`;
        }

        // Repair stats with faux revenue mapping based on completed jobs (estimating $85 avg per job)
        const [repairStats] = await connection.query(`
      SELECT 
        DATE_FORMAT(created_at, '${dateFormat}') as period,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        (SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) * 85) as revenue
      FROM service_requests
      WHERE ${dateCondition}
      GROUP BY period
      ORDER BY period ASC
    `);

        // Technician performance
        const [techPerformance] = await connection.query(`
      SELECT 
        u.id, u.name,
        COUNT(sr.id) as total_assigned,
        SUM(CASE WHEN sr.status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN sr.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN sr.status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM users u
      LEFT JOIN service_requests sr ON u.id = sr.assigned_technician_id
      WHERE u.role = 'technician'
      GROUP BY u.id, u.name
      ORDER BY total_assigned DESC
    `);

        // Device category breakdown
        const [categoryStats] = await connection.query(`
      SELECT device_category, COUNT(*) as count 
      FROM service_requests 
      GROUP BY device_category 
      ORDER BY count DESC 
      LIMIT 10
    `);

        return res.json(formatResponse(true, 'Reports fetched.', {
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

        await connection.query('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?', [name, email, phone || null, userId]);
        await logActivity(connection, userId, 'update_profile', 'user', userId, { name, email }, req.ip);

        return res.json(formatResponse(true, 'Profile updated successfully.', { name, email, phone }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const changePassword = async (req, res, next) => {
    let connection;
    try {
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

        let baseQuery = ' FROM users u INNER JOIN company_profiles p ON u.id = p.user_id LEFT JOIN users tu ON p.assigned_technician_id = tu.id WHERE u.role = "company"';
        const params = [];

        if (search) {
            baseQuery += ' AND (p.company_name LIKE ? OR u.email LIKE ? OR p.contact_person LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        const [[{ total }]] = await connection.query(`SELECT COUNT(*) as total${baseQuery}`, params);
        const [rows] = await connection.query(
            `SELECT u.id, u.email, u.phone, u.is_active, u.created_at, 
                    p.company_name, p.company_logo, p.contact_person, p.address, 
                    p.gst_number, p.website_url, p.company_type, p.notes, p.amc_status, p.assigned_technician_id,
                    tu.name as assigned_technician_name,
                    (SELECT COUNT(*) FROM company_devices d WHERE d.company_id = u.id) as total_devices,
                    (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id) as total_tickets,
                    (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id AND r.status = 'pending') as pending_repairs,
                    (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id AND r.status = 'in_progress') as in_progress_repairs,
                    (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id AND r.status = 'completed') as completed_repairs,
                    (SELECT COUNT(*) FROM service_requests r WHERE r.company_id = u.id AND r.status = 'cancelled') as cancelled_repairs,
                    (SELECT COUNT(*) FROM service_requests r INNER JOIN company_devices cd ON r.device_id = cd.id WHERE r.company_id = u.id AND cd.warranty_expiry >= r.created_at) as warranty_repairs,
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

const toggleCompanyStatus = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        const { isActive } = req.body;

        if (isActive === undefined) {
            return res.status(400).json(formatResponse(false, 'isActive field is required.'));
        }

        const [existing] = await connection.query('SELECT id, name FROM users WHERE id = ? AND role = "company" LIMIT 1', [id]);
        if (existing.length === 0) return res.status(404).json(formatResponse(false, 'Company account not found.'));

        await connection.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive, id]);
        await logActivity(connection, req.user.id, isActive ? 'activate_company' : 'deactivate_company', 'user', id, { name: existing[0].name }, req.ip);

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

        const [existing] = await connection.query('SELECT id, name FROM users WHERE id = ? AND role = "company" LIMIT 1', [id]);
        if (existing.length === 0) return res.status(404).json(formatResponse(false, 'Company account not found.'));

        await connection.query('DELETE FROM users WHERE id = ?', [id]);
        await logActivity(connection, req.user.id, 'delete_company', 'user', id, { name: existing[0].name }, req.ip);

        return res.json(formatResponse(true, 'Company account deleted successfully.'));
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
        const [[{ totalCompanyTickets }]] = await connection.query('SELECT COUNT(*) as totalCompanyTickets FROM service_requests WHERE company_id IS NOT NULL');

        const [[{ pending, inProgress, completed, cancelled }]] = await connection.query(`
            SELECT 
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as inProgress,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
            FROM service_requests 
            WHERE company_id IS NOT NULL
        `);

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
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
            FROM service_requests
            WHERE company_id IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
            ORDER BY month ASC
        `);

        return res.json(formatResponse(true, 'Company stats fetched.', {
            totalCompanies,
            activeCompanies,
            inactiveCompanies,
            totalCompanyTickets,
            statusCounts: {
                pending: pending || 0,
                inProgress: inProgress || 0,
                completed: completed || 0,
                cancelled: cancelled || 0
            },
            totalDevicesUnderRepair: totalDevicesUnderRepair || 0,
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
            SELECT u.id, u.email, u.phone, u.is_active, u.created_at, 
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
        const [branches] = await connection.query('SELECT * FROM company_branches WHERE company_id = ?', [id]);

        // Employees
        const [employees] = await connection.query('SELECT * FROM company_employees WHERE company_id = ?', [id]);

        // Devices
        const [devices] = await connection.query(`
            SELECT cd.*, ce.name as employee_name, cb.name as branch_name 
            FROM company_devices cd 
            LEFT JOIN company_employees ce ON cd.employee_id = ce.id 
            LEFT JOIN company_branches cb ON cd.branch_id = cb.id 
            WHERE cd.company_id = ?
        `, [id]);

        // Repair requests / tickets
        const [tickets] = await connection.query(`
            SELECT sr.*, ce.name as employee_name, cd.model_number as device_model, cd.serial_number as device_serial, u.name as tech_name 
            FROM service_requests sr 
            LEFT JOIN company_employees ce ON sr.employee_id = ce.id 
            LEFT JOIN company_devices cd ON sr.device_id = cd.id 
            LEFT JOIN users u ON sr.assigned_technician_id = u.id 
            WHERE sr.company_id = ?
            ORDER BY sr.created_at DESC
        `, [id]);

        // Billing
        const [quotations] = await connection.query('SELECT * FROM quotations WHERE company_id = ? ORDER BY created_at DESC', [id]);
        const [invoices] = await connection.query('SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC', [id]);

        // Activity Logs
        const [activityLogs] = await connection.query(`
            SELECT l.id, l.action, l.target_type, l.details, l.created_at, u.name as actor_name 
            FROM activity_logs l 
            LEFT JOIN users u ON l.user_id = u.id 
            WHERE l.user_id = ? OR (l.target_type = 'user' AND l.target_id = ?) 
            ORDER BY l.created_at DESC LIMIT 50
        `, [id, id]);

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
                repairCost: r.repair_cost,
                slaDeadline: r.sla_deadline,
                ticketNumber: r.ticket_number
            })),
            quotations,
            invoices,
            activityLogs
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

        // Check unique email if changing
        if (email) {
            const [emailCheck] = await connection.query('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [email, id]);
            if (emailCheck.length > 0) {
                return res.status(400).json(formatResponse(false, 'Email already in use.'));
            }
        }

        await connection.beginTransaction();

        await connection.query(
            'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
            [name, email, phone || null, id]
        );

        await connection.query(
            `UPDATE company_profiles 
             SET company_name = ?, contact_person = ?, address = ?, gst_number = ?, website_url = ?, 
                 company_logo = ?, company_type = ?, notes = ?, amc_status = ?, assigned_technician_id = ? 
             WHERE user_id = ?`,
            [
                name, contact_person || '', address || '', gst_number || null, website_url || null,
                company_logo || null, company_type || 'Business', notes || null, amc_status || 'Inactive',
                assigned_technician_id || null, id
            ]
        );

        await connection.commit();

        await logActivity(connection, req.user.id, 'update_company', 'user', id, { name, email }, req.ip);

        return res.json(formatResponse(true, 'Company updated successfully.'));
    } catch (error) {
        if (connection) await connection.rollback();
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

module.exports = {
    getDashboardStats,
    getCustomers, updateCustomer, deleteCustomer, getCustomerHistory, createCompany,
    getCompanies, toggleCompanyStatus, deleteCompany, updateCompany, getCompanyStats, getCompanyDetails, bulkUpdateTickets,
    getContacts, deleteContact, replyToContact,
    getSettings, updateSettings, testEmailSettings,
    getHomepageContent, updateHomepageContent,
    uploadFile,
    getActivityLogs,
    getReports,
    updateProfile, changePassword, resetUserPassword,
    logActivity
};
