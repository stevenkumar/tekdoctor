const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const { formatResponse, generateTicketNumber } = require('../utils/helpers');
const logger = require('../utils/logger');

// JWHelper for token generation
const generateToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            name: user.name,
            email: user.email,
            role: 'company'
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
    );
};

const { logActivity } = require('../utils/activity.logger');

// Helper for logging company activity
const logCompanyActivity = async (connection, userId, action, targetType, targetId, details, ip) => {
    let category = 'company';
    if (action.includes('repair') || action.includes('ticket')) {
        category = 'repair';
    } else if (action.includes('login') || action.includes('logout') || action.includes('failed')) {
        category = 'security';
    }
    await logActivity(userId, category, action, targetType, targetId, details, ip);
};

// ── Company Auth Controllers ──────────────────────────────────────────

const registerCompany = async (req, res, next) => {
    const {
        companyName,
        contactPerson,
        email,
        phone,
        address,
        password,
        gstNumber,
        websiteUrl,
        socialFacebook,
        socialInstagram,
        socialTwitter,
        socialLinkedin
    } = req.body;

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Check if user already exists
        const [existingUsers] = await connection.query(
            'SELECT id FROM users WHERE email = ? LIMIT 1',
            [email]
        );

        if (existingUsers.length > 0) {
            await connection.rollback();
            return res.status(400).json(formatResponse(false, 'An account with this email address already exists.'));
        }

        // Hash the password
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 1. Insert user
        const [userResult] = await connection.query(
            'INSERT INTO users (name, email, password, role, phone, is_active) VALUES (?, ?, ?, ?, ?, ?)',
            [companyName, email, hashedPassword, 'company', phone, true]
        );
        const userId = userResult.insertId;

        // Determine if logo was uploaded or is just a string URL
        let logoPath = null;
        if (req.file) {
            // In case logo uploaded via multer
            logoPath = `/uploads/${req.file.filename}`;
        } else if (req.body.companyLogo) {
            logoPath = req.body.companyLogo;
        }

        // 2. Insert company profile
        await connection.query(
            `INSERT INTO company_profiles 
        (user_id, company_name, company_logo, contact_person, phone_number, address, gst_number, website_url, 
         social_facebook, social_instagram, social_twitter, social_linkedin) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                companyName,
                logoPath,
                contactPerson,
                phone,
                address,
                gstNumber || null,
                websiteUrl || null,
                socialFacebook || null,
                socialInstagram || null,
                socialTwitter || null,
                socialLinkedin || null
            ]
        );

        await connection.commit();

        const user = { id: userId, name: companyName, email, role: 'company' };
        const token = generateToken(user);

        logger.info(`New company registered: ${companyName} (${email}) (ID: ${userId})`);

        return res.status(201).json(formatResponse(true, 'Company registration successful.', {
            id: userId,
            name: companyName,
            email,
            role: 'company',
            token
        }));
    } catch (error) {
        if (connection) await connection.rollback();
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getCompanyProfile = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(
            `SELECT u.id, u.email, u.phone, u.is_active, 
              p.company_name, p.company_logo, p.contact_person, p.address, 
              p.gst_number, p.website_url, p.social_facebook, p.social_instagram, 
              p.social_twitter, p.social_linkedin 
       FROM users u 
       INNER JOIN company_profiles p ON u.id = p.user_id 
       WHERE u.id = ? LIMIT 1`,
            [req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json(formatResponse(false, 'Company profile not found.'));
        }

        return res.json(formatResponse(true, 'Company profile fetched successfully.', rows[0]));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const updateCompanyProfile = async (req, res, next) => {
    const {
        companyName,
        contactPerson,
        phone,
        address,
        gstNumber,
        websiteUrl,
        socialFacebook,
        socialInstagram,
        socialTwitter,
        socialLinkedin,
        companyLogo
    } = req.body;

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Check profile exists
        const [profiles] = await connection.query('SELECT id, company_logo FROM company_profiles WHERE user_id = ?', [req.user.id]);
        if (profiles.length === 0) {
            await connection.rollback();
            return res.status(404).json(formatResponse(false, 'Company profile not found.'));
        }

        let logoPath = profiles[0].company_logo;
        if (req.file) {
            logoPath = `/uploads/${req.file.filename}`;
        } else if (companyLogo !== undefined) {
            logoPath = companyLogo;
        }

        // Update users main table
        await connection.query(
            'UPDATE users SET name = ?, phone = ? WHERE id = ?',
            [companyName, phone, req.user.id]
        );

        // Update company details
        await connection.query(
            `UPDATE company_profiles 
       SET company_name = ?, company_logo = ?, contact_person = ?, phone_number = ?, address = ?, 
           gst_number = ?, website_url = ?, social_facebook = ?, social_instagram = ?, 
           social_twitter = ?, social_linkedin = ? 
       WHERE user_id = ?`,
            [
                companyName,
                logoPath,
                contactPerson,
                phone,
                address,
                gstNumber || null,
                websiteUrl || null,
                socialFacebook || null,
                socialInstagram || null,
                socialTwitter || null,
                socialLinkedin || null,
                req.user.id
            ]
        );

        await logCompanyActivity(connection, req.user.id, 'update_profile', 'company_profiles', req.user.id, { companyName }, req.ip);
        await connection.commit();
        logger.info(`Company profile updated for user ID: ${req.user.id}`);
        return res.json(formatResponse(true, 'Company profile updated successfully.'));
    } catch (error) {
        if (connection) await connection.rollback();
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Company Branch CRUD Controllers ────────────────────────────────────

const getBranches = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(
            'SELECT * FROM company_branches WHERE company_id = ? ORDER BY name ASC',
            [req.user.id]
        );
        return res.json(formatResponse(true, 'Branches fetched.', rows));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const createBranch = async (req, res, next) => {
    const { name, address, phone } = req.body;
    if (!name || !address) {
        return res.status(400).json(formatResponse(false, 'Branch name and address are required.'));
    }

    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.query(
            'INSERT INTO company_branches (company_id, name, address, phone) VALUES (?, ?, ?, ?)',
            [req.user.id, name, address, phone || null]
        );
        await logCompanyActivity(connection, req.user.id, 'create_branch', 'company_branches', result.insertId, { name }, req.ip);
        return res.status(201).json(formatResponse(true, 'Branch created successfully.', { id: result.insertId, name }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const updateBranch = async (req, res, next) => {
    const { id } = req.params;
    const { name, address, phone } = req.body;

    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.query(
            'UPDATE company_branches SET name = ?, address = ?, phone = ? WHERE id = ? AND company_id = ?',
            [name, address, phone, id, req.user.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json(formatResponse(false, 'Branch not found or unauthorized.'));
        }
        await logCompanyActivity(connection, req.user.id, 'update_branch', 'company_branches', id, { name }, req.ip);
        return res.json(formatResponse(true, 'Branch updated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const deleteBranch = async (req, res, next) => {
    const { id } = req.params;

    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.query(
            'DELETE FROM company_branches WHERE id = ? AND company_id = ?',
            [id, req.user.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json(formatResponse(false, 'Branch not found or unauthorized.'));
        }
        await logCompanyActivity(connection, req.user.id, 'delete_branch', 'company_branches', id, null, req.ip);
        return res.json(formatResponse(true, 'Branch deleted successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Company Employee CRUD Controllers ────────────────────────────────

const getEmployees = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(
            `SELECT e.*, b.name as branch_name 
       FROM company_employees e 
       LEFT JOIN company_branches b ON e.branch_id = b.id 
       WHERE e.company_id = ? ORDER BY e.name ASC`,
            [req.user.id]
        );
        return res.json(formatResponse(true, 'Employees fetched.', rows));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const createEmployee = async (req, res, next) => {
    const { name, email, phone, department, designation, branchId } = req.body;
    if (!name || !email) {
        return res.status(400).json(formatResponse(false, 'Employee name and email are required.'));
    }

    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.query(
            'INSERT INTO company_employees (company_id, branch_id, name, email, phone, department, designation) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, branchId || null, name, email, phone || null, department || null, designation || null]
        );
        await logCompanyActivity(connection, req.user.id, 'create_employee', 'company_employees', result.insertId, { name, email }, req.ip);
        return res.status(201).json(formatResponse(true, 'Employee created successfully.', { id: result.insertId, name }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const updateEmployee = async (req, res, next) => {
    const { id } = req.params;
    const { name, email, phone, department, designation, branchId } = req.body;

    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.query(
            'UPDATE company_employees SET name = ?, email = ?, phone = ?, department = ?, designation = ?, branch_id = ? WHERE id = ? AND company_id = ?',
            [name, email, phone, department, designation, branchId || null, id, req.user.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json(formatResponse(false, 'Employee not found or unauthorized.'));
        }
        await logCompanyActivity(connection, req.user.id, 'update_employee', 'company_employees', id, { name, email }, req.ip);
        return res.json(formatResponse(true, 'Employee updated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const deleteEmployee = async (req, res, next) => {
    const { id } = req.params;

    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.query(
            'DELETE FROM company_employees WHERE id = ? AND company_id = ?',
            [id, req.user.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json(formatResponse(false, 'Employee not found or unauthorized.'));
        }
        await logCompanyActivity(connection, req.user.id, 'delete_employee', 'company_employees', id, null, req.ip);
        return res.json(formatResponse(true, 'Employee deleted successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Company Device CRUD Controllers ──────────────────────────────────

const getDevices = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(
            `SELECT d.*, b.name as branch_name, e.name as employee_name, e.email as employee_email 
       FROM company_devices d 
       LEFT JOIN company_branches b ON d.branch_id = b.id 
       LEFT JOIN company_employees e ON d.employee_id = e.id 
       WHERE d.company_id = ? ORDER BY d.created_at DESC`,
            [req.user.id]
        );
        return res.json(formatResponse(true, 'Devices fetched.', rows));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const createDevice = async (req, res, next) => {
    const {
        deviceCategory,
        brand,
        modelNumber,
        serialNumber,
        assetId,
        purchaseDate,
        warrantyExpiry,
        notes,
        branchId,
        employeeId,
        isAmc,
        amcTag
    } = req.body;

    if (!deviceCategory || !brand || !modelNumber || !serialNumber || !assetId) {
        return res.status(400).json(formatResponse(false, 'Category, brand, model, serial, and asset ID are required.'));
    }

    let connection;
    try {
        connection = await pool.getConnection();
        let finalAmcTag = amcTag || null;
        if (isAmc && !finalAmcTag) {
            const [maxRows] = await connection.query(
                `SELECT amc_tag FROM company_devices 
                 WHERE company_id = ? AND amc_tag LIKE 'td-amc-%' 
                 ORDER BY CAST(SUBSTRING(amc_tag, 8) AS UNSIGNED) DESC 
                 LIMIT 1`,
                [req.user.id]
            );
            let nextNum = 1;
            if (maxRows.length > 0) {
                const match = maxRows[0].amc_tag.match(/td-amc-(\d+)/);
                if (match) {
                    nextNum = parseInt(match[1], 10) + 1;
                }
            }
            finalAmcTag = `td-amc-${String(nextNum).padStart(3, '0')}`;
        }

        const [result] = await connection.query(
            `INSERT INTO company_devices 
         (company_id, branch_id, employee_id, device_category, brand, model_number, serial_number, asset_id, purchase_date, warranty_expiry, notes, is_amc, amc_tag) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id,
                branchId || null,
                employeeId || null,
                deviceCategory,
                brand,
                modelNumber,
                serialNumber,
                assetId,
                purchaseDate || null,
                warrantyExpiry || null,
                notes || null,
                isAmc ? 1 : 0,
                finalAmcTag
            ]
        );
        await logCompanyActivity(connection, req.user.id, 'create_device', 'company_devices', result.insertId, { brand, modelNumber, serialNumber }, req.ip);
        return res.status(201).json(formatResponse(true, 'Device registered successfully.', { id: result.insertId }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const updateDevice = async (req, res, next) => {
    const { id } = req.params;
    const {
        deviceCategory,
        brand,
        modelNumber,
        serialNumber,
        assetId,
        purchaseDate,
        warrantyExpiry,
        notes,
        branchId,
        employeeId,
        isAmc,
        amcTag
    } = req.body;

    let connection;
    try {
        connection = await pool.getConnection();
        let finalAmcTag = amcTag || null;
        if (isAmc && !finalAmcTag) {
            const [maxRows] = await connection.query(
                `SELECT amc_tag FROM company_devices 
                 WHERE company_id = ? AND amc_tag LIKE 'td-amc-%' 
                 ORDER BY CAST(SUBSTRING(amc_tag, 8) AS UNSIGNED) DESC 
                 LIMIT 1`,
                [req.user.id]
            );
            let nextNum = 1;
            if (maxRows.length > 0) {
                const match = maxRows[0].amc_tag.match(/td-amc-(\d+)/);
                if (match) {
                    nextNum = parseInt(match[1], 10) + 1;
                }
            }
            finalAmcTag = `td-amc-${String(nextNum).padStart(3, '0')}`;
        }

        const [result] = await connection.query(
            `UPDATE company_devices 
        SET device_category = ?, brand = ?, model_number = ?, serial_number = ?, asset_id = ?, 
            purchase_date = ?, warranty_expiry = ?, notes = ?, branch_id = ?, employee_id = ?,
            is_amc = ?, amc_tag = ? 
        WHERE id = ? AND company_id = ?`,
            [
                deviceCategory,
                brand,
                modelNumber,
                serialNumber,
                assetId,
                purchaseDate || null,
                warrantyExpiry || null,
                notes || null,
                branchId || null,
                employeeId || null,
                isAmc ? 1 : 0,
                finalAmcTag,
                id,
                req.user.id
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json(formatResponse(false, 'Device not found or unauthorized.'));
        }
        await logCompanyActivity(connection, req.user.id, 'update_device', 'company_devices', id, { brand, modelNumber, serialNumber }, req.ip);
        return res.json(formatResponse(true, 'Device updated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const deleteDevice = async (req, res, next) => {
    const { id } = req.params;

    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.query(
            'DELETE FROM company_devices WHERE id = ? AND company_id = ?',
            [id, req.user.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json(formatResponse(false, 'Device not found or unauthorized.'));
        }
        await logCompanyActivity(connection, req.user.id, 'delete_device', 'company_devices', id, null, req.ip);
        return res.json(formatResponse(true, 'Device deleted successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Company B2B Repair Tickets ────────────────────────────────────────

const getCompanyRepairRequests = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(
            `SELECT sr.*, d.model_number, d.serial_number, d.asset_id, e.name as employee_name, 
              tech.name as technician_name, tech.email as technician_email 
       FROM service_requests sr 
       LEFT JOIN company_devices d ON sr.device_id = d.id 
       LEFT JOIN company_employees e ON sr.employee_id = e.id 
       LEFT JOIN users tech ON sr.assigned_technician_id = tech.id 
       WHERE sr.company_id = ? ORDER BY sr.created_at DESC`,
            [req.user.id]
        );
        return res.json(formatResponse(true, 'Company repair requests fetched.', rows));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const createCompanyRepairRequest = async (req, res, next) => {
    const {
        deviceId,
        employeeId,
        problemType,
        problemDescription,
        serviceType,
        priority,
        preferredContactMethod
    } = req.body;

    if (!deviceId || !problemType || !problemDescription) {
        return res.status(400).json(formatResponse(false, 'Device, Problem Type, and Description are required.'));
    }

    let connection;
    try {
        connection = await pool.getConnection();

        // Verify device belongs to company
        const [devs] = await connection.query('SELECT * FROM company_devices WHERE id = ? AND company_id = ? LIMIT 1', [deviceId, req.user.id]);
        if (devs.length === 0) {
            return res.status(404).json(formatResponse(false, 'Registered device not found or unauthorized.'));
        }
        const device = devs[0];
        // Fetch user profile email/phone
        const [profiles] = await connection.query('SELECT company_name, phone_number, address FROM company_profiles WHERE user_id = ? LIMIT 1', [req.user.id]);
        const profile = profiles[0] || { company_name: req.user.name, phone_number: '', address: '' };

        // Inject User-based permanent ticket sequence mapping!
        const ticketNumber = 'TD-C' + String(req.user.id).padStart(3, '0');

        // SLA tracking: SLA deadline is 48 hours for urgent, 5 days for standard
        const slaHours = priority === 'Urgent' ? 48 : 120;
        const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

        const [result] = await connection.query(
            `INSERT INTO service_requests 
        (user_id, company_id, employee_id, device_id, customer_name, mobile, email, city, 
         device_category, brand, model_number, status, service_type, priority, 
         preferred_contact_method, problem_type, problem_description, ticket_number, sla_deadline) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id,
                req.user.id,
                employeeId || null,
                deviceId,
                profile.company_name,
                profile.phone_number,
                req.user.email,
                'B2B Operations',
                device.device_category,
                device.brand,
                device.model_number,
                'pending',
                serviceType || 'Bring to Service Center',
                priority || 'Standard',
                preferredContactMethod || 'WhatsApp',
                problemType,
                problemDescription,
                ticketNumber,
                slaDeadline
            ]
        );

        logger.info(`B2B repair ticket created: ${ticketNumber} by Company User: ${req.user.id}`);

        // Create background log
        await logCompanyActivity(connection, req.user.id, 'create_repair_request', 'service_requests', result.insertId, { ticketNumber });

        return res.status(201).json(formatResponse(true, 'B2B Repair ticket submitted successfully.', {
            id: result.insertId,
            ticketNumber,
            status: 'pending'
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── B2B Statistics overview ──────────────────────────────────────────

const getStatsOverview = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();

        // 1. Total Devices
        const [[{ totalDevices }]] = await connection.query('SELECT COUNT(*) as totalDevices FROM company_devices WHERE company_id = ?', [req.user.id]);

        // 2. Count statuses in service requests
        const [statusRows] = await connection.query(
            `SELECT status, COUNT(*) as cnt 
       FROM service_requests 
       WHERE company_id = ? 
       GROUP BY status`,
            [req.user.id]
        );

        const counts = { pending: 0, in_progress: 0, completed: 0, cancelled: 0, total: 0 };
        statusRows.forEach(row => {
            counts[row.status] = row.cnt;
            counts.total += row.cnt;
        });

        // 3. Recent activity list
        const [recentRequests] = await connection.query(
            `SELECT sr.id, sr.ticket_number, sr.status, sr.created_at, sr.priority, d.brand, d.model_number 
       FROM service_requests sr 
       LEFT JOIN company_devices d ON sr.device_id = d.id 
       WHERE sr.company_id = ? 
       ORDER BY sr.created_at DESC 
       LIMIT 5`,
            [req.user.id]
        );

        // 4. Device brand counts for brand analytics charts
        const [brandStats] = await connection.query(
            'SELECT brand, COUNT(*) as value FROM company_devices WHERE company_id = ? GROUP BY brand',
            [req.user.id]
        );

        return res.json(formatResponse(true, 'B2B statistics overview fetched successfully.', {
            totalDevices,
            ticketCounts: counts,
            recentRequests,
            brandStats
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Company-to-Admin Messaging ────────────────────────────────────────

const getMessages = async (req, res, next) => {
    const { repairRequestId } = req.query;
    let connection;
    try {
        connection = await pool.getConnection();

        let query = `
      SELECT m.*, sender.name as sender_name, sender.role as sender_role 
      FROM messages m 
      LEFT JOIN users sender ON m.sender_id = sender.id 
      WHERE (m.sender_id = ? OR m.receiver_id = ?)
    `;
        const params = [req.user.id, req.user.id];

        if (repairRequestId) {
            query += ' AND m.repair_request_id = ?';
            params.push(repairRequestId);
        }

        query += ' ORDER BY m.created_at ASC';

        const [rows] = await connection.query(query, params);
        return res.json(formatResponse(true, 'Messages fetched.', rows));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const sendMessage = async (req, res, next) => {
    const { repairRequestId, message, receiverId } = req.body;
    if (!message) {
        return res.status(400).json(formatResponse(false, 'Message body is required.'));
    }

    let connection;
    try {
        connection = await pool.getConnection();

        // Default receiver is Admin if none provided
        let finalReceiverId = receiverId;
        if (!finalReceiverId) {
            const [admins] = await connection.query('SELECT id FROM users WHERE role = "admin" LIMIT 1');
            if (admins.length > 0) {
                finalReceiverId = admins[0].id;
            } else {
                return res.status(404).json(formatResponse(false, 'No administrator was found to deliver the message.'));
            }
        }

        const [result] = await connection.query(
            'INSERT INTO messages (repair_request_id, sender_id, receiver_id, message) VALUES (?, ?, ?, ?)',
            [repairRequestId || null, req.user.id, finalReceiverId, message]
        );

        return res.status(201).json(formatResponse(true, 'Message sent.', { id: result.insertId }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Bulk CSV Device and Repair Imports ───────────────────────────────

const fs = require('fs');

const importBulkDevices = async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json(formatResponse(false, 'No CSV file uploaded.'));
    }

    let connection;
    try {
        const filePath = req.file.path;
        const csvContent = fs.readFileSync(filePath, 'utf-8');
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);

        if (lines.length <= 1) {
            return res.status(400).json(formatResponse(false, 'CSV file is empty or missing data rows.'));
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const dataRows = lines.slice(1);

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [maxRows] = await connection.query(
            `SELECT amc_tag FROM company_devices 
             WHERE company_id = ? AND amc_tag LIKE 'td-amc-%' 
             ORDER BY CAST(SUBSTRING(amc_tag, 8) AS UNSIGNED) DESC 
             LIMIT 1`,
            [req.user.id]
        );
        let nextAmcNum = 1;
        if (maxRows.length > 0) {
            const match = maxRows[0].amc_tag.match(/td-amc-(\d+)/);
            if (match) {
                nextAmcNum = parseInt(match[1], 10) + 1;
            }
        }

        let importedCount = 0;

        for (const row of dataRows) {
            const values = row.split(',').map(v => v.trim());
            if (values.length < headers.length) continue;

            const device = {};
            headers.forEach((header, idx) => {
                device[header] = values[idx];
            });

            const category = device.category || device.device_category || 'Other';
            const brand = device.brand || 'Other';
            const modelNumber = device.model || device.model_number || 'Unknown';
            const serialNumber = device.serial || device.serial_number || '';
            const assetId = device.asset_id || device.assetid || `AST-${Math.floor(Math.random() * 899999 + 100000)}`;
            const notes = device.notes || '';

            const isAmc = (device.is_amc || device.is_amc_covered || '').trim().toLowerCase() === 'true' || (device.is_amc || '').trim() === '1';
            let finalAmcTag = null;
            if (isAmc) {
                finalAmcTag = (device.amc_tag || '').trim() || `td-amc-${String(nextAmcNum++).padStart(3, '0')}`;
            }

            if (!serialNumber) continue;

            await connection.query(
                `INSERT INTO company_devices 
          (company_id, device_category, brand, model_number, serial_number, asset_id, notes, is_amc, amc_tag) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [req.user.id, category, brand, modelNumber, serialNumber, assetId, notes, isAmc ? 1 : 0, finalAmcTag]
            );
            importedCount++;
        }

        await logCompanyActivity(connection, req.user.id, 'bulk_import_devices', 'company_devices', null, { count: importedCount }, req.ip);
        await connection.commit();

        // Clean up file
        try {
            fs.unlinkSync(filePath);
        } catch (fErr) {
            logger.error('Failed to delete temp bulk devices CSV:', fErr);
        }

        return res.json(formatResponse(true, `Successfully imported ${importedCount} devices from CSV.`, { count: importedCount }));
    } catch (error) {
        if (connection) await connection.rollback();
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const importBulkRequests = async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json(formatResponse(false, 'No CSV file uploaded.'));
    }

    let connection;
    try {
        const filePath = req.file.path;
        const csvContent = fs.readFileSync(filePath, 'utf-8');
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);

        if (lines.length <= 1) {
            return res.status(400).json(formatResponse(false, 'CSV file is empty or missing data rows.'));
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const dataRows = lines.slice(1);

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Fetch user details for ticket creation
        const [profiles] = await connection.query('SELECT company_name, phone_number FROM company_profiles WHERE user_id = ? LIMIT 1', [req.user.id]);
        const profile = profiles[0] || { company_name: req.user.name, phone_number: '' };

        let importedCount = 0;

        for (const row of dataRows) {
            const values = row.split(',').map(v => v.trim());
            if (values.length < headers.length) continue;

            const rowData = {};
            headers.forEach((header, idx) => {
                rowData[header] = values[idx];
            });

            // Match by serial_number or model_number
            const serialNumber = rowData.serial || rowData.serial_number || '';
            const problemType = rowData.problem_type || rowData.problem || 'Other';
            const problemDescription = rowData.description || rowData.problem_description || 'Bulk Import Service Request';
            const priority = rowData.priority || 'Standard';
            const serviceType = rowData.service_type || 'Bring to Service Center';

            if (!serialNumber) continue;

            // Find device registered in company
            const [devs] = await connection.query('SELECT id, device_category, brand, model_number FROM company_devices WHERE serial_number = ? AND company_id = ? LIMIT 1', [serialNumber, req.user.id]);
            let deviceId = null;
            let category = 'Other';
            let brand = 'Other';
            let model = 'Unknown';

            if (devs.length > 0) {
                deviceId = devs[0].id;
                category = devs[0].device_category;
                brand = devs[0].brand;
                model = devs[0].model_number;
            } else {
                // Create auto device registration if this serial is new
                const autoAssetId = `AST-${Math.floor(Math.random() * 899999 + 100000)}`;
                const [newDev] = await connection.query(
                    `INSERT INTO company_devices 
            (company_id, device_category, brand, model_number, serial_number, asset_id, notes) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [req.user.id, 'Other', 'Other', 'Unknown', serialNumber, autoAssetId, 'Auto-registered during bulk import']
                );
                deviceId = newDev.insertId;
            }

            // Sync to universal generic permanent B2B key
            const ticketNumber = 'TD-C' + String(req.user.id).padStart(3, '0');
            const slaHours = priority === 'Urgent' ? 48 : 120;
            const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

            await connection.query(
                `INSERT INTO service_requests 
          (user_id, company_id, device_id, customer_name, mobile, email, city, 
           device_category, brand, model_number, status, service_type, priority, 
           preferred_contact_method, problem_type, problem_description, ticket_number, sla_deadline) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    req.user.id,
                    req.user.id,
                    deviceId,
                    profile.company_name,
                    profile.phone_number,
                    req.user.email,
                    'B2B Operations',
                    category,
                    brand,
                    model,
                    'pending',
                    serviceType,
                    priority,
                    'WhatsApp',
                    problemType,
                    problemDescription,
                    ticketNumber,
                    slaDeadline
                ]
            );
            importedCount++;
        }

        await logCompanyActivity(connection, req.user.id, 'bulk_import_requests', 'service_requests', null, { count: importedCount }, req.ip);
        await connection.commit();
        fs.unlinkSync(filePath);

        return res.json(formatResponse(true, `Successfully imported B2B requests. Created ${importedCount} tickets.`, { count: importedCount }));
    } catch (error) {
        if (connection) await connection.rollback();
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getActivityLogs = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const [[{ total }]] = await connection.query(
            'SELECT COUNT(*) as total FROM activity_logs WHERE user_id = ?',
            [req.user.id]
        );

        const [rows] = await connection.query(
            'SELECT id, action, target_type, target_id, details, ip_address, created_at FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [req.user.id, limit, offset]
        );

        return res.json(formatResponse(true, 'Activity logs fetched.', {
            data: rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

module.exports = {
    registerCompany,
    getCompanyProfile,
    updateCompanyProfile,
    getBranches,
    createBranch,
    updateBranch,
    deleteBranch,
    getEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    getDevices,
    createDevice,
    updateDevice,
    deleteDevice,
    getCompanyRepairRequests,
    createCompanyRepairRequest,
    getStatsOverview,
    getMessages,
    sendMessage,
    importBulkDevices,
    importBulkRequests,
    getActivityLogs
};
