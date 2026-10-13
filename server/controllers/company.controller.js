const bcrypt = require('bcryptjs');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const { formatResponse, generateTicketNumber, generateCompanyId } = require('../utils/helpers');
const logger = require('../utils/logger');
const fs = require('fs');
const { generateToken } = require('../utils/auth.helpers');
const { parseCsv, generateCsv } = require('../utils/csv.utils');
const { normalizePhoneNumber } = require('../middleware/validate.middleware');

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

// Helper for resolving target company ID (for Admin vs Company multi-tenancy)
const resolveTargetCompanyId = async (req, connection) => {
    if (req.user && req.user.role === 'admin') {
        const rawId = req.headers['x-company-id'] || req.query.companyId || req.body?.companyId;
        const parsedId = parseInt(rawId, 10);
        if (!parsedId || isNaN(parsedId) || parsedId <= 0) {
            return { error: 'Please select a company to view or manage.', status: 400 };
        }
        const [valid] = await connection.query(
            'SELECT id, name FROM users WHERE id = ? AND role = "company" LIMIT 1',
            [parsedId]
        );
        if (valid.length === 0) {
            return { error: 'Target company not found or invalid.', status: 404 };
        }
        return { companyId: parsedId, companyName: valid[0].name };
    }
    return { companyId: req.user.id, companyName: req.user.name };
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
        const cleanEmail = email ? email.trim().toLowerCase() : '';
        const cleanPhone = phone ? normalizePhoneNumber(phone) : null;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Check if user already exists with this email
        const [existingUsers] = await connection.query(
            'SELECT id FROM users WHERE email = ? LIMIT 1',
            [cleanEmail]
        );

        if (existingUsers.length > 0) {
            await connection.rollback();
            const resp = formatResponse(false, 'This email address is already registered. Please use a different email address.');
            resp.errors = { email: 'This email address is already registered. Please use a different email address.' };
            return res.status(400).json(resp);
        }

        // Check if phone already exists
        if (cleanPhone) {
            const [existingPhone] = await connection.query(
                'SELECT id FROM users WHERE phone = ? LIMIT 1',
                [cleanPhone]
            );
            if (existingPhone.length > 0) {
                await connection.rollback();
                const resp = formatResponse(false, 'This phone number is already registered. Please use a different phone number.');
                resp.errors = { phone: 'This phone number is already registered. Please use a different phone number.' };
                return res.status(400).json(resp);
            }
        }

        // Hash the password
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Determine if logo was uploaded or is just a string URL
        let logoPath = null;
        if (req.file) {
            // In case logo uploaded via multer
            logoPath = `/uploads/${req.file.filename}`;
        } else if (req.body.companyLogo) {
            logoPath = req.body.companyLogo;
        }

        // Generate stable company ID (CMP-001, CMP-002...)
        const companyId = await generateCompanyId(connection);

        // 1. Insert user
        const [userResult] = await connection.query(
            'INSERT INTO users (name, email, password, role, phone, avatar_url, is_active, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [companyName.trim(), cleanEmail, hashedPassword, 'company', cleanPhone, logoPath || null, true, companyId]
        );
        const userId = userResult.insertId;

        // 2. Insert company profile
        await connection.query(
            `INSERT INTO company_profiles 
        (user_id, company_id, company_name, company_logo, contact_person, phone_number, address, gst_number, website_url, 
         social_facebook, social_instagram, social_twitter, social_linkedin) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                companyId,
                companyName.trim(),
                logoPath,
                contactPerson ? contactPerson.trim() : '',
                cleanPhone || '',
                address ? address.trim() : '',
                gstNumber || null,
                websiteUrl || null,
                socialFacebook || null,
                socialInstagram || null,
                socialTwitter || null,
                socialLinkedin || null
            ]
        );

        await connection.commit();

        const user = { id: userId, name: companyName, email, role: 'company', companyId };
        const token = generateToken(user);

        logger.info(`New company registered: ${companyName} (${email}) (ID: ${userId}, CompanyID: ${companyId})`);

        return res.status(201).json(formatResponse(true, 'Company registration successful.', {
            id: userId,
            companyId,
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
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const [rows] = await connection.query(
            `SELECT u.id, u.email, COALESCE(p.phone_number, u.phone) AS phone, u.is_active, 
              COALESCE(p.company_id, u.company_id) AS company_id,
              COALESCE(p.company_id, u.company_id) AS companyId,
              p.company_name, p.company_logo, p.contact_person, p.address, 
              p.gst_number, p.website_url, p.social_facebook, p.social_instagram, 
              p.social_twitter, p.social_linkedin 
       FROM users u 
       INNER JOIN company_profiles p ON u.id = p.user_id 
       WHERE u.id = ? LIMIT 1`,
            [targetCompanyId]
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

        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) {
            await connection.rollback();
            return res.status(target.status).json(formatResponse(false, target.error));
        }
        const targetCompanyId = target.companyId;

        // Check profile exists
        const [profiles] = await connection.query('SELECT id, company_logo, phone_number FROM company_profiles WHERE user_id = ?', [targetCompanyId]);
        if (profiles.length === 0) {
            await connection.rollback();
            return res.status(404).json(formatResponse(false, 'Company profile not found.'));
        }

        const [users] = await connection.query('SELECT phone FROM users WHERE id = ?', [targetCompanyId]);
        const rawPhone = phone !== undefined ? phone : (users[0]?.phone || profiles[0]?.phone_number || null);
        const currentPhone = rawPhone ? normalizePhoneNumber(rawPhone) : null;

        // Check if phone number is already registered to another user
        if (currentPhone) {
            const [existingPhone] = await connection.query(
                'SELECT id FROM users WHERE phone = ? AND id != ? LIMIT 1',
                [currentPhone, targetCompanyId]
            );
            if (existingPhone.length > 0) {
                await connection.rollback();
                const resp = formatResponse(false, 'This phone number is already registered. Please use a different phone number.');
                resp.errors = { phone: 'This phone number is already registered. Please use a different phone number.' };
                return res.status(400).json(resp);
            }
        }

        let logoPath = profiles[0].company_logo;
        if (req.file) {
            logoPath = `/uploads/${req.file.filename}`;
        } else if (companyLogo !== undefined) {
            logoPath = companyLogo;
        }

        // Update users main table including avatar_url for company logo
        await connection.query(
            'UPDATE users SET name = ?, phone = ?, avatar_url = ? WHERE id = ?',
            [companyName, currentPhone, logoPath || null, targetCompanyId]
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
                currentPhone,
                address,
                gstNumber || null,
                websiteUrl || null,
                socialFacebook || null,
                socialInstagram || null,
                socialTwitter || null,
                socialLinkedin || null,
                targetCompanyId
            ]
        );

        await connection.commit();
        await logCompanyActivity(connection, req.user.id, 'update_profile', 'company_profiles', targetCompanyId, { companyName }, req.ip);
        logger.info(`Company profile updated for company ID: ${targetCompanyId} by user: ${req.user.id}`);

        const [updatedRows] = await connection.query(
            `SELECT u.id, u.email, COALESCE(p.phone_number, u.phone) AS phone, u.name, u.avatar_url,
                    p.company_name, p.company_logo, p.contact_person, p.address,
                    p.gst_number, p.website_url, p.social_facebook, p.social_instagram,
                    p.social_twitter, p.social_linkedin
             FROM users u
             INNER JOIN company_profiles p ON u.id = p.user_id
             WHERE u.id = ? LIMIT 1`,
            [targetCompanyId]
        );

        return res.json(formatResponse(true, 'Company profile updated successfully.', updatedRows[0] || null));
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
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const [rows] = await connection.query(
            'SELECT * FROM company_branches WHERE company_id = ? ORDER BY name ASC',
            [targetCompanyId]
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
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        // Check duplicate branch name for this company
        const [existingBranch] = await connection.query(
            'SELECT id, name FROM company_branches WHERE company_id = ? AND LOWER(name) = LOWER(?) LIMIT 1',
            [targetCompanyId, name.trim()]
        );
        if (existingBranch.length > 0) {
            return res.status(409).json(formatResponse(false, `A branch with the name "${name.trim()}" already exists for this company.`));
        }

        const [result] = await connection.query(
            'INSERT INTO company_branches (company_id, name, address, phone) VALUES (?, ?, ?, ?)',
            [targetCompanyId, name, address, phone || null]
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
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const [result] = await connection.query(
            'UPDATE company_branches SET name = ?, address = ?, phone = ? WHERE id = ? AND company_id = ?',
            [name, address, phone, id, targetCompanyId]
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
    const { reason } = req.body || {};

    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const [result] = await connection.query(
            'UPDATE company_branches SET is_active = FALSE, status = "inactive", deactivated_at = NOW(), deactivated_by = ?, deactivation_reason = ? WHERE id = ? AND company_id = ?',
            [req.user.id, reason || 'Deactivated by company', id, targetCompanyId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json(formatResponse(false, 'Branch not found or unauthorized.'));
        }
        await logCompanyActivity(connection, req.user.id, 'deactivate_branch', 'company_branches', id, { reason }, req.ip);
        return res.json(formatResponse(true, 'Branch deactivated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const toggleBranchStatus = async (req, res, next) => {
    const { id } = req.params;
    const { isActive, reason } = req.body || {};

    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const [existing] = await connection.query(
            'SELECT id, is_active FROM company_branches WHERE id = ? AND company_id = ? LIMIT 1',
            [id, targetCompanyId]
        );
        if (existing.length === 0) {
            return res.status(404).json(formatResponse(false, 'Branch not found or unauthorized.'));
        }

        const newActive = isActive !== undefined ? Boolean(isActive) : !existing[0].is_active;

        if (newActive) {
            await connection.query(
                'UPDATE company_branches SET is_active = TRUE, status = "active", deactivated_at = NULL, deactivated_by = NULL, deactivation_reason = NULL WHERE id = ? AND company_id = ?',
                [id, targetCompanyId]
            );
        } else {
            await connection.query(
                'UPDATE company_branches SET is_active = FALSE, status = "inactive", deactivated_at = NOW(), deactivated_by = ?, deactivation_reason = ? WHERE id = ? AND company_id = ?',
                [req.user.id, reason || 'Deactivated by company', id, targetCompanyId]
            );
        }

        await logCompanyActivity(connection, req.user.id, newActive ? 'activate_branch' : 'deactivate_branch', 'company_branches', id, { reason }, req.ip);
        return res.json(formatResponse(true, `Branch ${newActive ? 'activated' : 'deactivated'} successfully.`, { is_active: newActive }));
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
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const [rows] = await connection.query(
            `SELECT e.*, b.name as branch_name 
       FROM company_employees e 
       LEFT JOIN company_branches b ON e.branch_id = b.id 
       WHERE e.company_id = ? ORDER BY e.name ASC`,
            [targetCompanyId]
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
        const cleanEmail = email.trim().toLowerCase();
        const cleanPhone = phone ? normalizePhoneNumber(phone) : null;

        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        // Check duplicate email within company
        const [existingEmail] = await connection.query(
            'SELECT id FROM company_employees WHERE email = ? AND company_id = ? LIMIT 1',
            [cleanEmail, targetCompanyId]
        );
        if (existingEmail.length > 0) {
            const resp = formatResponse(false, 'This email address is already registered. Please use a different email address.');
            resp.errors = { email: 'This email address is already registered. Please use a different email address.' };
            return res.status(400).json(resp);
        }

        // Check duplicate phone within company
        if (cleanPhone) {
            const [existingPhone] = await connection.query(
                'SELECT id FROM company_employees WHERE phone = ? AND company_id = ? LIMIT 1',
                [cleanPhone, targetCompanyId]
            );
            if (existingPhone.length > 0) {
                const resp = formatResponse(false, 'This phone number is already registered. Please use a different phone number.');
                resp.errors = { phone: 'This phone number is already registered. Please use a different phone number.' };
                return res.status(400).json(resp);
            }
        }

        const [result] = await connection.query(
            'INSERT INTO company_employees (company_id, branch_id, name, email, phone, department, designation) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [targetCompanyId, branchId || null, name.trim(), cleanEmail, cleanPhone, department || null, designation || null]
        );
        await logCompanyActivity(connection, req.user.id, 'create_employee', 'company_employees', result.insertId, { name, email: cleanEmail }, req.ip);
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
        const cleanEmail = email ? email.trim().toLowerCase() : '';
        const cleanPhone = phone ? normalizePhoneNumber(phone) : null;

        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        // Check duplicate email within company for other employee
        if (cleanEmail) {
            const [existingEmail] = await connection.query(
                'SELECT id FROM company_employees WHERE email = ? AND company_id = ? AND id != ? LIMIT 1',
                [cleanEmail, targetCompanyId, id]
            );
            if (existingEmail.length > 0) {
                const resp = formatResponse(false, 'This email address is already registered. Please use a different email address.');
                resp.errors = { email: 'This email address is already registered. Please use a different email address.' };
                return res.status(400).json(resp);
            }
        }

        // Check duplicate phone within company for other employee
        if (cleanPhone) {
            const [existingPhone] = await connection.query(
                'SELECT id FROM company_employees WHERE phone = ? AND company_id = ? AND id != ? LIMIT 1',
                [cleanPhone, targetCompanyId, id]
            );
            if (existingPhone.length > 0) {
                const resp = formatResponse(false, 'This phone number is already registered. Please use a different phone number.');
                resp.errors = { phone: 'This phone number is already registered. Please use a different phone number.' };
                return res.status(400).json(resp);
            }
        }

        const [result] = await connection.query(
            'UPDATE company_employees SET name = ?, email = ?, phone = ?, department = ?, designation = ?, branch_id = ? WHERE id = ? AND company_id = ?',
            [name.trim(), cleanEmail, cleanPhone, department, designation, branchId || null, id, targetCompanyId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json(formatResponse(false, 'Employee not found or unauthorized.'));
        }
        await logCompanyActivity(connection, req.user.id, 'update_employee', 'company_employees', id, { name, email: cleanEmail }, req.ip);
        return res.json(formatResponse(true, 'Employee updated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const deleteEmployee = async (req, res, next) => {
    const { id } = req.params;
    const { reason } = req.body || {};

    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const [result] = await connection.query(
            'UPDATE company_employees SET is_active = FALSE, status = "inactive", deactivated_at = NOW(), deactivated_by = ?, deactivation_reason = ? WHERE id = ? AND company_id = ?',
            [req.user.id, reason || 'Deactivated by company', id, targetCompanyId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json(formatResponse(false, 'Employee not found or unauthorized.'));
        }
        await logCompanyActivity(connection, req.user.id, 'deactivate_employee', 'company_employees', id, { reason }, req.ip);
        return res.json(formatResponse(true, 'Employee deactivated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const toggleEmployeeStatus = async (req, res, next) => {
    const { id } = req.params;
    const { isActive, reason } = req.body || {};

    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const [existing] = await connection.query(
            'SELECT id, is_active FROM company_employees WHERE id = ? AND company_id = ? LIMIT 1',
            [id, targetCompanyId]
        );
        if (existing.length === 0) {
            return res.status(404).json(formatResponse(false, 'Employee not found or unauthorized.'));
        }

        const newActive = isActive !== undefined ? Boolean(isActive) : !existing[0].is_active;

        if (newActive) {
            await connection.query(
                'UPDATE company_employees SET is_active = TRUE, status = "active", deactivated_at = NULL, deactivated_by = NULL, deactivation_reason = NULL WHERE id = ? AND company_id = ?',
                [id, targetCompanyId]
            );
        } else {
            await connection.query(
                'UPDATE company_employees SET is_active = FALSE, status = "inactive", deactivated_at = NOW(), deactivated_by = ?, deactivation_reason = ? WHERE id = ? AND company_id = ?',
                [req.user.id, reason || 'Deactivated by company', id, targetCompanyId]
            );
        }

        await logCompanyActivity(connection, req.user.id, newActive ? 'activate_employee' : 'deactivate_employee', 'company_employees', id, { reason }, req.ip);
        return res.json(formatResponse(true, `Employee ${newActive ? 'activated' : 'deactivated'} successfully.`, { is_active: newActive }));
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
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const [rows] = await connection.query(
            `SELECT d.*, 
                    b.name as branch_name, 
                    e.name as employee_name, 
                    e.email as employee_email,
                    (SELECT COUNT(*) FROM service_requests sr WHERE sr.device_id = d.id) as repair_count,
                    (SELECT COUNT(*) FROM service_requests sr WHERE sr.device_id = d.id AND sr.status IN ('pending', 'in_progress')) as active_repairs,
                    (SELECT COUNT(*) FROM service_requests sr WHERE sr.device_id = d.id AND sr.status IN ('completed', 'delivered')) as completed_repairs,
                    (SELECT MAX(sr.created_at) FROM service_requests sr WHERE sr.device_id = d.id) as last_repair_date
       FROM company_devices d 
       LEFT JOIN company_branches b ON d.branch_id = b.id 
       LEFT JOIN company_employees e ON d.employee_id = e.id 
       WHERE d.company_id = ? ORDER BY d.created_at DESC`,
            [targetCompanyId]
        );
        return res.json(formatResponse(true, 'Devices fetched.', rows));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const createDevice = async (req, res, next) => {
    const category = req.body.deviceCategory || req.body.category || 'Laptop';
    const brand = req.body.brand || '';
    const modelNumber = req.body.modelNumber || req.body.model_number || req.body.model || '';
    const serialNumber = req.body.serialNumber || req.body.serial_number || req.body.serial || '';
    const assetId = req.body.assetId || req.body.assetTag || req.body.asset_id || req.body.asset_tag || `AST-${Math.floor(Math.random() * 899999 + 100000)}`;
    const employeeId = req.body.employeeId || req.body.assignedEmployeeId || req.body.assigned_employee_id || null;
    const {
        purchaseDate,
        warrantyExpiry,
        notes,
        branchId,
        isAmc,
        amcTag
    } = req.body;

    if (!brand || !modelNumber || !serialNumber) {
        return res.status(400).json(formatResponse(false, 'Brand, model, and serial number are required.'));
    }

    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        // Check if device with same serial number or asset_id already exists for this company
        const [existingDevs] = await connection.query(
            'SELECT * FROM company_devices WHERE company_id = ? AND (serial_number = ? OR asset_id = ?) LIMIT 1',
            [targetCompanyId, serialNumber.trim(), assetId.trim()]
        );
        if (existingDevs.length > 0) {
            const existing = existingDevs[0];
            return res.status(200).json(formatResponse(true, 'Device already registered in fleet. Reusing existing device record.', {
                ...existing,
                alreadyExists: true
            }));
        }

        let finalAmcTag = amcTag || null;
        if (isAmc && !finalAmcTag) {
            const [maxRows] = await connection.query(
                `SELECT amc_tag FROM company_devices 
                 WHERE company_id = ? AND amc_tag LIKE 'td-amc-%' 
                 ORDER BY CAST(SUBSTRING(amc_tag, 8) AS UNSIGNED) DESC 
                 LIMIT 1`,
                [targetCompanyId]
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
                targetCompanyId,
                branchId || null,
                employeeId || null,
                category,
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
        return res.status(201).json(formatResponse(true, 'Device registered successfully.', { id: result.insertId, assetId, amcTag: finalAmcTag }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const updateDevice = async (req, res, next) => {
    const { id } = req.params;
    const category = req.body.deviceCategory || req.body.category || 'Laptop';
    const brand = req.body.brand || '';
    const modelNumber = req.body.modelNumber || req.body.model_number || req.body.model || '';
    const serialNumber = req.body.serialNumber || req.body.serial_number || req.body.serial || '';
    const assetId = req.body.assetId || req.body.assetTag || req.body.asset_id || req.body.asset_tag || `AST-${Math.floor(Math.random() * 899999 + 100000)}`;
    const employeeId = req.body.employeeId || req.body.assignedEmployeeId || req.body.assigned_employee_id || null;
    const {
        purchaseDate,
        warrantyExpiry,
        notes,
        branchId,
        isAmc,
        amcTag
    } = req.body;

    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        let finalAmcTag = amcTag || null;
        if (isAmc && !finalAmcTag) {
            const [maxRows] = await connection.query(
                `SELECT amc_tag FROM company_devices 
                 WHERE company_id = ? AND amc_tag LIKE 'td-amc-%' 
                 ORDER BY CAST(SUBSTRING(amc_tag, 8) AS UNSIGNED) DESC 
                 LIMIT 1`,
                [targetCompanyId]
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
         SET branch_id = ?, employee_id = ?, device_category = ?, brand = ?, model_number = ?, 
             serial_number = ?, asset_id = ?, purchase_date = ?, warranty_expiry = ?, notes = ?, 
             is_amc = ?, amc_tag = ? 
         WHERE id = ? AND company_id = ?`,
            [
                branchId || null,
                employeeId || null,
                category,
                brand,
                modelNumber,
                serialNumber,
                assetId,
                purchaseDate || null,
                warrantyExpiry || null,
                notes || null,
                isAmc ? 1 : 0,
                finalAmcTag,
                id,
                targetCompanyId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json(formatResponse(false, 'Device not found or unauthorized.'));
        }

        await logCompanyActivity(connection, req.user.id, 'update_device', 'company_devices', id, { brand, modelNumber }, req.ip);
        return res.json(formatResponse(true, 'Device updated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const deleteDevice = async (req, res, next) => {
    const { id } = req.params;
    const { reason } = req.body || {};

    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const [result] = await connection.query(
            'UPDATE company_devices SET is_active = FALSE, status = "decommissioned", deactivated_at = NOW(), deactivated_by = ?, deactivation_reason = ? WHERE id = ? AND company_id = ?',
            [req.user.id, reason || 'Decommissioned by company', id, targetCompanyId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json(formatResponse(false, 'Device not found or unauthorized.'));
        }
        await logCompanyActivity(connection, req.user.id, 'decommission_device', 'company_devices', id, { reason }, req.ip);
        return res.json(formatResponse(true, 'Device decommissioned / deactivated successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const toggleDeviceStatus = async (req, res, next) => {
    const { id } = req.params;
    const { isActive, reason } = req.body || {};

    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const [existing] = await connection.query(
            'SELECT id, is_active FROM company_devices WHERE id = ? AND company_id = ? LIMIT 1',
            [id, targetCompanyId]
        );
        if (existing.length === 0) {
            return res.status(404).json(formatResponse(false, 'Device not found or unauthorized.'));
        }

        const newActive = isActive !== undefined ? Boolean(isActive) : !existing[0].is_active;

        if (newActive) {
            await connection.query(
                'UPDATE company_devices SET is_active = TRUE, status = "active", deactivated_at = NULL, deactivated_by = NULL, deactivation_reason = NULL WHERE id = ? AND company_id = ?',
                [id, targetCompanyId]
            );
        } else {
            await connection.query(
                'UPDATE company_devices SET is_active = FALSE, status = "decommissioned", deactivated_at = NOW(), deactivated_by = ?, deactivation_reason = ? WHERE id = ? AND company_id = ?',
                [req.user.id, reason || 'Decommissioned by company', id, targetCompanyId]
            );
        }

        await logCompanyActivity(connection, req.user.id, newActive ? 'activate_device' : 'decommission_device', 'company_devices', id, { reason }, req.ip);
        return res.json(formatResponse(true, `Device ${newActive ? 'activated' : 'decommissioned'} successfully.`, { is_active: newActive }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Device Repair History ─────────────────────────────────────────────

const getDeviceRepairHistory = async (req, res, next) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await pool.getConnection();
        let targetCompanyId = null;
        if (req.user.role !== 'admin') {
            const target = await resolveTargetCompanyId(req, connection);
            if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
            targetCompanyId = target.companyId;
        }

        // Fetch Device Details
        let deviceQuery = `
            SELECT d.*, 
                   cp.company_name,
                   cp.company_logo,
                   b.name as branch_name, 
                   e.name as employee_name, 
                   e.email as employee_email,
                   e.phone as employee_phone
            FROM company_devices d
            INNER JOIN company_profiles cp ON d.company_id = cp.user_id
            LEFT JOIN company_branches b ON d.branch_id = b.id
            LEFT JOIN company_employees e ON d.employee_id = e.id
            WHERE d.id = ?
        `;
        const deviceParams = [id];

        // If not admin, enforce company ownership
        if (req.user.role !== 'admin') {
            deviceQuery += ' AND d.company_id = ?';
            deviceParams.push(targetCompanyId);
        }

        const [devRows] = await connection.query(deviceQuery, deviceParams);
        if (devRows.length === 0) {
            return res.status(404).json(formatResponse(false, 'Device not found or unauthorized.'));
        }
        const device = devRows[0];

        // Fetch All Repair Tickets strictly for this device with joined technicians, invoices, quotations, and verified payments
        const [tickets] = await connection.query(`
            SELECT 
                sr.id,
                sr.ticket_number,
                sr.created_at,
                sr.status,
                sr.priority,
                sr.service_type,
                sr.problem_type,
                sr.problem_description,
                sr.customer_repair_description,
                sr.diagnosis,
                sr.identified_issues,
                sr.required_work,
                sr.required_parts,
                sr.estimated_cost,
                sr.repair_cost,
                sr.payment_status,
                sr.payment_id,
                sr.paid_at,
                sr.estimated_completion_date,
                sr.customer_approval_status,
                sr.repair_notes,
                sr.inspection_notes,
                sr.sla_deadline,
                sr.assigned_technician_id,
                sr.pending_technician_id,
                sr.image_path,
                sr.screenshot_path,
                sr.is_active,
                tu.name as technician_name,
                tu.email as technician_email,
                tu.phone as technician_phone,
                ce.name as employee_name,
                cb.name as branch_name,
                inv.id as invoice_id,
                inv.id as invoice_number,
                inv.status as invoice_status,
                inv.amount as invoice_amount,
                inv.invoice_date,
                inv.paid_at as invoice_paid_at,
                q.id as quotation_id,
                q.title as quotation_title,
                q.amount as quotation_amount,
                q.status as quotation_status,
                pmt.id as payment_pk,
                pmt.amount as verified_paid_amount,
                pmt.status as verified_payment_status,
                pmt.payment_method as verified_payment_method,
                pmt.payment_id as transaction_reference,
                pmt.created_at as payment_date
            FROM service_requests sr
            LEFT JOIN users tu ON sr.assigned_technician_id = tu.id
            LEFT JOIN company_employees ce ON sr.employee_id = ce.id
            LEFT JOIN company_branches cb ON ce.branch_id = cb.id
            LEFT JOIN invoices inv ON inv.ticket_id = sr.id
            LEFT JOIN quotations q ON q.request_id = sr.id
            LEFT JOIN payments pmt ON pmt.ticket_id = sr.id AND pmt.status IN ('paid', 'success')
            WHERE sr.device_id = ?
            ORDER BY sr.created_at DESC
        `, [id]);

        // Compute summary metrics from verified data
        const totalRepairs = tickets.length;
        const activeRepairs = tickets.filter(t => ['pending', 'in_progress'].includes(t.status)).length;
        const completedRepairs = tickets.filter(t => t.status === 'completed' || t.status === 'delivered').length;
        const cancelledRepairs = tickets.filter(t => t.status === 'cancelled').length;
        const lastRepairDate = tickets.length > 0 ? tickets[0].created_at : null;
        const lastRepairIssue = tickets.length > 0 ? (tickets[0].problem_description || tickets[0].problem_type) : null;
        
        let totalAmountBilled = 0;
        tickets.forEach(t => {
            if (t.verified_paid_amount) {
                totalAmountBilled += parseFloat(t.verified_paid_amount);
            } else if (t.payment_status === 'paid' && t.repair_cost) {
                totalAmountBilled += parseFloat(t.repair_cost);
            }
        });

        // Add isCurrentRepair flag to tickets
        const formattedTickets = tickets.map(t => ({
            ...t,
            isCurrentRepair: ['pending', 'in_progress'].includes(t.status)
        }));

        const activeRepair = formattedTickets.find(t => ['pending', 'in_progress'].includes(t.status)) || null;

        return res.json(formatResponse(true, 'Device repair history fetched.', {
            device,
            summary: {
                totalRepairs,
                activeRepairs,
                completedRepairs,
                cancelledRepairs,
                lastRepairDate,
                lastRepairIssue,
                totalAmountBilled,
                activeRepair
            },
            repairs: formattedTickets,
            history: formattedTickets
        }));
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
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const { approvalStatus, status, search } = req.query;
        let querySql = `
            SELECT sr.*, 
                    d.model_number as linked_model, 
                    d.serial_number as linked_serial, 
                    d.asset_id, 
                    d.brand as linked_brand,
                    d.device_category as linked_device_category,
                    d.is_amc,
                    d.amc_tag,
                    e.name as employee_name, 
                    e.email as employee_email,
                    e.phone as employee_phone,
                    e.department as employee_department,
                    b.name as branch_name,
                    tech.name as technician_name, 
                    tech.email as technician_email,
                    tech.phone as technician_phone 
             FROM service_requests sr 
             LEFT JOIN company_devices d ON sr.device_id = d.id 
             LEFT JOIN company_employees e ON sr.employee_id = e.id 
             LEFT JOIN company_branches b ON e.branch_id = b.id
             LEFT JOIN users tech ON sr.assigned_technician_id = tech.id 
             WHERE sr.company_id = ?
        `;
        const queryParams = [targetCompanyId];

        if (approvalStatus === 'pending' || approvalStatus === 'pending_approval') {
            querySql += ` AND sr.customer_approval_status = 'pending_approval'
                          AND (sr.estimated_cost > 0 OR sr.repair_cost > 0)
                          AND sr.status NOT IN ('completed', 'delivered', 'cancelled')
                          AND (sr.payment_status IS NULL OR sr.payment_status != 'paid')
                          AND (sr.is_active IS NULL OR sr.is_active = 1)`;
        } else if (approvalStatus && approvalStatus !== 'all') {
            querySql += ' AND sr.customer_approval_status = ?';
            queryParams.push(approvalStatus);
        }

        if (status && status !== 'all') {
            querySql += ' AND sr.status = ?';
            queryParams.push(status);
        }

        if (search && search.trim()) {
            const s = `%${search.trim()}%`;
            querySql += ` AND (sr.ticket_number LIKE ? OR d.brand LIKE ? OR d.model_number LIKE ? OR d.serial_number LIKE ? OR d.asset_id LIKE ? OR e.name LIKE ?)`;
            queryParams.push(s, s, s, s, s, s);
        }

        querySql += ' ORDER BY sr.created_at DESC';

        const [rows] = await connection.query(querySql, queryParams);

        const formatted = rows.map(r => ({
            ...r,
            estimated_cost: r.estimated_cost ? parseFloat(r.estimated_cost) : 0,
            estimatedCost: r.estimated_cost ? parseFloat(r.estimated_cost) : 0,
            additional_charges: r.additional_charges ? parseFloat(r.additional_charges) : 0,
            additionalCharges: r.additional_charges ? parseFloat(r.additional_charges) : 0,
            repair_cost: r.repair_cost ? parseFloat(r.repair_cost) : 0,
            repairCost: r.repair_cost ? parseFloat(r.repair_cost) : 0,
            customer_approval_status: r.customer_approval_status || 'none',
            customerApprovalStatus: r.customer_approval_status || 'none',
            branch_name: r.branch_name || null,
            device_brand: r.linked_brand || r.brand,
            device_model: r.linked_model || r.model_number,
            device_serial: r.linked_serial || r.serial_number,
            device_category: r.linked_device_category || r.device_category
        }));

        return res.json(formatResponse(true, 'Company repair requests fetched.', formatted));
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
        servicePreference,
        priority,
        preferredContactMethod,
        preferredContact,
        clientSubmissionId
    } = req.body;

    const finalServiceType = serviceType || (servicePreference === 'carry_in' ? 'Bring to Service Center' : (servicePreference === 'onsite' ? 'On-Site Corporate Technician' : servicePreference)) || 'Bring to Service Center';
    const finalContactMethod = preferredContactMethod || (preferredContact === 'email' ? 'Email' : (preferredContact === 'whatsapp' ? 'WhatsApp' : (preferredContact === 'phone' ? 'Phone' : preferredContact))) || 'WhatsApp';

    const serialNum = (req.body.serialNumber || req.body.serial || '').trim();
    let resolvedDeviceId = deviceId ? Number(deviceId) : null;

    if (!resolvedDeviceId && !serialNum) {
        return res.status(400).json(formatResponse(false, 'Device selection or serial number is required.'));
    }
    if (!problemType || !problemDescription) {
        return res.status(400).json(formatResponse(false, 'Problem Type and Description are required.'));
    }

    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        // Verify device existence and enforce strict company ownership & active status
        let device = null;
        if (resolvedDeviceId) {
            const [devs] = await connection.query('SELECT * FROM company_devices WHERE id = ? LIMIT 1', [resolvedDeviceId]);
            if (devs.length === 0) {
                return res.status(404).json(formatResponse(false, 'Registered device not found.'));
            }
            if (devs[0].company_id !== targetCompanyId) {
                return res.status(403).json(formatResponse(false, 'You are not authorized to create a repair request for this device.'));
            }
            device = devs[0];
        } else {
            const [devs] = await connection.query('SELECT * FROM company_devices WHERE serial_number = ? LIMIT 1', [serialNum]);
            if (devs.length === 0) {
                return res.status(404).json(formatResponse(false, 'Registered device with the specified serial number not found.'));
            }
            if (devs[0].company_id !== targetCompanyId) {
                return res.status(403).json(formatResponse(false, 'You are not authorized to create a repair request for this device.'));
            }
            device = devs[0];
            resolvedDeviceId = device.id;
        }

        // Check if device is deactivated / inactive / decommissioned
        const isDeactivated = device.is_active === 0 || device.is_active === false || device.status === 'decommissioned' || device.status === 'inactive' || device.status === 'retired' || device.status === 'disposed';
        if (isDeactivated) {
            return res.status(403).json(formatResponse(false, 'This device is inactive/deactivated and cannot be used to create a new repair ticket.'));
        }

        // 1. Check idempotency token (clientSubmissionId) if provided
        const submissionKey = (clientSubmissionId || req.headers['x-submission-id'] || '').trim();
        if (submissionKey) {
            const [existingSub] = await connection.query(
                'SELECT id, ticket_number, status, created_at FROM service_requests WHERE submission_id = ? LIMIT 1',
                [submissionKey]
            );
            if (existingSub.length > 0) {
                logger.info(`Duplicate company repair submission prevented via submission_id [${submissionKey}]. Existing ticket: ${existingSub[0].ticket_number}`);
                return res.status(200).json({
                    success: true,
                    isDuplicate: true,
                    message: `You have already submitted this repair request. Ticket ID: ${existingSub[0].ticket_number}`,
                    data: {
                        id: existingSub[0].id,
                        ticketNumber: existingSub[0].ticket_number,
                        status: existingSub[0].status,
                        alreadySubmitted: true
                    }
                });
            }
        }

        // 2. Content fingerprint & 60-second window duplicate check
        const cleanDesc = (problemDescription || '').trim();
        const [recentSub] = await connection.query(
            `SELECT id, ticket_number, status, created_at 
             FROM service_requests 
             WHERE company_id = ? AND device_id = ? AND problem_type = ? AND problem_description = ? 
               AND created_at >= NOW() - INTERVAL 60 SECOND 
             ORDER BY id DESC LIMIT 1`,
            [targetCompanyId, resolvedDeviceId, problemType, cleanDesc]
        );
        if (recentSub.length > 0) {
            logger.info(`Duplicate company repair submission prevented via 60s window for Company ${targetCompanyId}, Device ${resolvedDeviceId}. Existing ticket: ${recentSub[0].ticket_number}`);
            return res.status(200).json({
                success: true,
                isDuplicate: true,
                message: `You have already submitted this repair request. Ticket ID: ${recentSub[0].ticket_number}`,
                data: {
                    id: recentSub[0].id,
                    ticketNumber: recentSub[0].ticket_number,
                    status: recentSub[0].status,
                    alreadySubmitted: true
                }
            });
        }

        // Fetch company profile email/phone/amc_status
        const [profiles] = await connection.query('SELECT company_name, phone_number, address, amc_status, company_id FROM company_profiles WHERE user_id = ? LIMIT 1', [targetCompanyId]);
        const [companyUser] = await connection.query('SELECT name, email, phone, company_id FROM users WHERE id = ? LIMIT 1', [targetCompanyId]);
        const profile = profiles[0] || { company_name: companyUser[0]?.name || target.companyName, phone_number: companyUser[0]?.phone || '', address: '', amc_status: 'Inactive', company_id: companyUser[0]?.company_id };

        // AMC Source of Truth Detection (Section 17):
        // Check company's profile amc_status OR specific device's is_amc
        const isCompanyAmc = (profile.amc_status || '').toLowerCase() === 'active' || (profile.company_type || '').toUpperCase() === 'AMC' || device.is_amc === 1;

        // Generate authoritative per-company sequential ticket number (TD-Cxxx-01 or TD-AMC-Cxxx-01)
        const ticketNumber = await generateTicketNumber(connection, {
            companyId: targetCompanyId,
            isAmc: isCompanyAmc
        });

        // SLA tracking: SLA deadline is 48 hours for urgent, 5 days for standard
        const slaHours = priority === 'Urgent' ? 48 : 120;
        const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

        const [result] = await connection.query(
            `INSERT INTO service_requests 
        (user_id, company_id, employee_id, device_id, customer_name, mobile, email, city, 
         device_category, brand, model_number, serial_number, status, service_type, priority, 
         preferred_contact_method, problem_type, problem_description, ticket_number, sla_deadline, submission_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                targetCompanyId,
                targetCompanyId,
                employeeId || device.employee_id || null,
                resolvedDeviceId,
                profile.company_name,
                profile.phone_number,
                companyUser[0]?.email || req.user.email,
                'B2B Operations',
                device.device_category,
                device.brand,
                device.model_number,
                device.serial_number || null,
                'pending',
                finalServiceType,
                priority || 'Standard',
                finalContactMethod,
                problemType,
                cleanDesc,
                ticketNumber,
                slaDeadline,
                submissionKey || null
            ]
        );

        logger.info(`B2B repair ticket created: ${ticketNumber} (Type: ${ticketType}) for Company: ${targetCompanyId} by user: ${req.user.id}`);

        // Create background log
        await logCompanyActivity(connection, req.user.id, 'create_repair_request', 'service_requests', result.insertId, { ticketNumber });

        return res.status(201).json(formatResponse(true, 'B2B Repair ticket submitted successfully.', {
            id: result.insertId,
            ticketNumber,
            status: 'pending',
            companyId: profile.company_id || companyUser[0]?.company_id
        }));
    } catch (error) {
        // Gracefully catch potential race condition on unique submission_id
        if (error.code === 'ER_DUP_ENTRY' && error.sqlMessage?.includes('submission_id')) {
            try {
                const submissionKey = (clientSubmissionId || req.headers['x-submission-id'] || '').trim();
                const [existingSub] = await connection.query(
                    'SELECT id, ticket_number, status FROM service_requests WHERE submission_id = ? LIMIT 1',
                    [submissionKey]
                );
                if (existingSub.length > 0) {
                    return res.status(200).json({
                        success: true,
                        isDuplicate: true,
                        message: `You have already submitted this repair request. Ticket ID: ${existingSub[0].ticket_number}`,
                        data: {
                            id: existingSub[0].id,
                            ticketNumber: existingSub[0].ticket_number,
                            status: existingSub[0].status,
                            alreadySubmitted: true
                        }
                    });
                }
            } catch (innerErr) {
                // fall through to next(error)
            }
        }
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
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        // 1. Total Devices
        const [[{ totalDevices }]] = await connection.query('SELECT COUNT(*) as totalDevices FROM company_devices WHERE company_id = ?', [targetCompanyId]);

        // 2. Count statuses in service requests
        const [statusRows] = await connection.query(
            `SELECT status, COUNT(*) as cnt 
       FROM service_requests 
       WHERE company_id = ? 
       GROUP BY status`,
            [targetCompanyId]
        );

        const counts = { pending: 0, in_progress: 0, completed: 0, delivered: 0, cancelled: 0, total: 0 };
        statusRows.forEach(row => {
            counts[row.status] = row.cnt;
            counts.total += row.cnt;
        });

        // 3. Count tickets awaiting budget approval
        const [[{ pendingApprovalCount }]] = await connection.query(
            `SELECT COUNT(*) as pendingApprovalCount 
             FROM service_requests 
             WHERE company_id = ? 
               AND customer_approval_status = 'pending_approval'
               AND (estimated_cost > 0 OR repair_cost > 0)
               AND status NOT IN ('completed', 'delivered', 'cancelled')
               AND (payment_status IS NULL OR payment_status != 'paid')
               AND (is_active IS NULL OR is_active = 1)`,
            [targetCompanyId]
        );

        // 4. Recent activity list
        const [recentRequests] = await connection.query(
            `SELECT sr.id, sr.ticket_number, sr.status, sr.created_at, sr.priority, d.brand, d.model_number 
       FROM service_requests sr 
       LEFT JOIN company_devices d ON sr.device_id = d.id 
       WHERE sr.company_id = ? 
       ORDER BY sr.created_at DESC 
       LIMIT 5`,
            [targetCompanyId]
        );

        // 5. Device brand counts for brand analytics charts
        const [brandStats] = await connection.query(
            'SELECT brand, COUNT(*) as value FROM company_devices WHERE company_id = ? GROUP BY brand',
            [targetCompanyId]
        );

        return res.json(formatResponse(true, 'B2B statistics overview fetched successfully.', {
            totalDevices,
            ticketCounts: {
                ...counts,
                pendingApproval: Number(pendingApprovalCount || 0)
            },
            pendingApprovalCount: Number(pendingApprovalCount || 0),
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
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        let query = `
      SELECT m.*, m.message as content, sender.name as sender_name, sender.role as sender_role 
      FROM messages m 
      LEFT JOIN users sender ON m.sender_id = sender.id 
      WHERE (m.sender_id = ? OR m.receiver_id = ?)
    `;
        const params = [targetCompanyId, targetCompanyId];

        if (repairRequestId) {
            query += ' AND m.repair_request_id = ?';
            params.push(repairRequestId);
        }

        query += ' ORDER BY m.created_at ASC';

        // If company user is fetching messages, mark incoming messages from Admin as read
        if (req.user && req.user.role === 'company') {
            await connection.query(
                'UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND is_read = 0',
                [targetCompanyId]
            );
        }

        const [rows] = await connection.query(query, params);
        return res.json(formatResponse(true, 'Messages fetched.', rows));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const sendMessage = async (req, res, next) => {
    const { repairRequestId, receiverId } = req.body;
    const message = (req.body.message || req.body.content || '').trim();
    if (!message) {
        return res.status(400).json(formatResponse(false, 'Message body is required.'));
    }

    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        // Determine sender & receiver:
        let senderId = req.user.id;
        let finalReceiverId = receiverId;

        if (req.user.role === 'admin') {
            // Admin sending message to this company
            if (!finalReceiverId) {
                finalReceiverId = targetCompanyId;
            }
        } else {
            // Company sending message to Admin
            if (!finalReceiverId) {
                const [admins] = await connection.query('SELECT id FROM users WHERE role = "admin" LIMIT 1');
                if (admins.length > 0) {
                    finalReceiverId = admins[0].id;
                } else {
                    return res.status(404).json(formatResponse(false, 'No administrator was found to deliver the message.'));
                }
            }
        }

        const [result] = await connection.query(
            'INSERT INTO messages (repair_request_id, sender_id, receiver_id, message, is_read) VALUES (?, ?, ?, ?, 0)',
            [repairRequestId || null, senderId, finalReceiverId, message]
        );

        // Dispatch notification
        const preview = message.length > 80 ? `${message.substring(0, 80)}...` : message;
        if (req.user.role !== 'admin') {
            const compName = req.user.name || target.companyName || 'Corporate Client';
            await connection.query(
                'INSERT INTO notifications (user_id, sender_id, ticket_id, title, message, is_read) VALUES (?, ?, ?, ?, ?, 0)',
                [finalReceiverId, senderId, repairRequestId || null, `New Support Query: ${compName}`, `${compName} submitted a support query: "${preview}"`]
            );
        } else {
            await connection.query(
                'INSERT INTO notifications (user_id, sender_id, ticket_id, title, message, is_read) VALUES (?, ?, ?, ?, ?, 0)',
                [finalReceiverId, senderId, repairRequestId || null, 'TekDoctor Support Response', `Admin replied to your support query: "${preview}"`]
            );
        }

        await logActivity(connection, req.user.id, 'send_company_message', 'company', targetCompanyId, {
            messageId: result.insertId,
            preview
        }, req.ip);

        return res.status(201).json(formatResponse(true, 'Message sent.', { id: result.insertId }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const importBulkDevices = async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json(formatResponse(false, 'No CSV file uploaded.'));
    }

    const filePath = req.file.path;
    let connection;
    try {
        const csvContent = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseCsv(csvContent);

        if (!parsed.data || parsed.data.length === 0) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json(formatResponse(false, 'CSV file is empty or missing data rows.'));
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) {
            await connection.rollback();
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(target.status).json(formatResponse(false, target.error));
        }
        const targetCompanyId = target.companyId;

        // Check existing devices for duplicate serial numbers
        const [existingDevs] = await connection.query(
            'SELECT id, serial_number FROM company_devices WHERE company_id = ?',
            [targetCompanyId]
        );
        const existingSerialMap = new Map();
        existingDevs.forEach(d => existingSerialMap.set(d.serial_number.toLowerCase().trim(), d.id));

        const [maxRows] = await connection.query(
            `SELECT amc_tag FROM company_devices 
             WHERE company_id = ? AND amc_tag LIKE 'td-amc-%' 
             ORDER BY CAST(SUBSTRING(amc_tag, 8) AS UNSIGNED) DESC 
             LIMIT 1`,
            [targetCompanyId]
        );
        let nextAmcNum = 1;
        if (maxRows.length > 0) {
            const match = maxRows[0].amc_tag.match(/td-amc-(\d+)/);
            if (match) {
                nextAmcNum = parseInt(match[1], 10) + 1;
            }
        }

        let importedCount = 0;
        let updatedCount = 0;
        const skippedDuplicates = [];
        const errors = [];

        for (let idx = 0; idx < parsed.data.length; idx++) {
            const rowNumber = idx + 2; // header is row 1
            const device = parsed.data[idx];

            const category = device.category || device.device_category || 'Laptop';
            const brand = device.brand || device.make || '';
            const modelNumber = device.model || device.model_number || device.device_model || '';
            const serialNumber = device.serial || device.serial_number || device.sn || '';
            const assetId = device.asset_id || device.asset_tag || device.assetid || `AST-${Math.floor(Math.random() * 899999 + 100000)}`;
            const purchaseDate = device.purchase_date || null;
            const warrantyExpiry = device.warranty_expiry || null;
            const notes = device.notes || '';

            if (!serialNumber.trim()) {
                errors.push({ row: rowNumber, error: 'Missing required serial_number.' });
                continue;
            }
            if (!brand.trim()) {
                errors.push({ row: rowNumber, error: `Row with serial ${serialNumber} is missing required brand.` });
                continue;
            }
            if (!modelNumber.trim()) {
                errors.push({ row: rowNumber, error: `Row with serial ${serialNumber} is missing required model_number.` });
                continue;
            }

            const isAmc = (device.is_amc || device.is_amc_covered || '').trim().toLowerCase() === 'true' || (device.is_amc || '').trim() === '1';
            let finalAmcTag = null;
            if (isAmc) {
                finalAmcTag = (device.amc_tag || '').trim() || `td-amc-${String(nextAmcNum++).padStart(3, '0')}`;
            }

            const cleanSerialKey = serialNumber.toLowerCase().trim();
            if (existingSerialMap.has(cleanSerialKey)) {
                // Update existing record with refreshed asset / warranty data
                const devId = existingSerialMap.get(cleanSerialKey);
                await connection.query(
                    `UPDATE company_devices 
                     SET device_category = ?, brand = ?, model_number = ?, asset_id = ?, 
                         purchase_date = COALESCE(?, purchase_date), warranty_expiry = COALESCE(?, warranty_expiry),
                         notes = ?, is_amc = ?, amc_tag = COALESCE(?, amc_tag)
                     WHERE id = ? AND company_id = ?`,
                    [category, brand, modelNumber, assetId, purchaseDate || null, warrantyExpiry || null, notes, isAmc ? 1 : 0, finalAmcTag, devId, targetCompanyId]
                );
                updatedCount++;
                skippedDuplicates.push({ row: rowNumber, serialNumber, action: 'Updated existing record' });
            } else {
                const [insertRes] = await connection.query(
                    `INSERT INTO company_devices 
              (company_id, device_category, brand, model_number, serial_number, asset_id, purchase_date, warranty_expiry, notes, is_amc, amc_tag) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [targetCompanyId, category, brand, modelNumber, serialNumber.trim(), assetId, purchaseDate || null, warrantyExpiry || null, notes, isAmc ? 1 : 0, finalAmcTag]
                );
                existingSerialMap.set(cleanSerialKey, insertRes.insertId);
                importedCount++;
            }
        }

        await connection.commit();

        await logCompanyActivity(connection, req.user.id, 'bulk_import_devices', 'company_devices', null, { 
            imported: importedCount, 
            updated: updatedCount, 
            failed: errors.length 
        }, req.ip);

        // Clean up file
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (fErr) {
            logger.error('Failed to delete temp bulk devices CSV:', fErr);
        }

        return res.json(formatResponse(true, `Processed ${parsed.data.length} rows: ${importedCount} created, ${updatedCount} updated, ${errors.length} failed.`, {
            count: importedCount,
            imported: importedCount,
            updated: updatedCount,
            failed: errors.length,
            totalRows: parsed.data.length,
            errors,
            duplicates: skippedDuplicates
        }));
    } catch (error) {
        if (connection) await connection.rollback();
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const importBulkRequests = async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json(formatResponse(false, 'No CSV file uploaded.'));
    }

    const filePath = req.file.path;
    let connection;
    try {
        const csvContent = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseCsv(csvContent);

        if (!parsed.data || parsed.data.length === 0) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json(formatResponse(false, 'CSV file is empty or missing data rows.'));
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) {
            await connection.rollback();
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(target.status).json(formatResponse(false, target.error));
        }
        const targetCompanyId = target.companyId;

        // Fetch user details for ticket creation
        const [profiles] = await connection.query('SELECT company_name, phone_number, amc_status, company_type FROM company_profiles WHERE user_id = ? LIMIT 1', [targetCompanyId]);
        const [companyUser] = await connection.query('SELECT name, email, phone FROM users WHERE id = ? LIMIT 1', [targetCompanyId]);
        const profile = profiles[0] || { company_name: companyUser[0]?.name || target.companyName, phone_number: companyUser[0]?.phone || '' };

        let importedCount = 0;
        const errors = [];

        for (let idx = 0; idx < parsed.data.length; idx++) {
            const rowNumber = idx + 2;
            const rowData = parsed.data[idx];

            const serialNumber = rowData.serial || rowData.serial_number || rowData.device_serial || '';
            const problemType = rowData.problem_type || rowData.problem || 'Hardware';
            const problemDescription = rowData.description || rowData.problem_description || 'Bulk Import Service Request';
            const priority = rowData.priority || 'Standard';
            const serviceType = rowData.service_type || rowData.service_preference || 'Bring to Service Center';
            const employeeEmail = rowData.employee_email || rowData.email || '';

            if (!serialNumber.trim()) {
                errors.push({ row: rowNumber, error: 'Missing required serial_number.' });
                continue;
            }

            // Find device registered in company
            const [devs] = await connection.query('SELECT id, device_category, brand, model_number, employee_id, is_active, status FROM company_devices WHERE serial_number = ? AND company_id = ? LIMIT 1', [serialNumber.trim(), targetCompanyId]);
            let deviceId = null;
            let category = 'Other';
            let brand = 'Other';
            let model = 'Unknown';
            let employeeId = null;

            if (devs.length > 0) {
                const isDeactivated = devs[0].is_active === 0 || devs[0].is_active === false || devs[0].status === 'decommissioned' || devs[0].status === 'inactive';
                if (isDeactivated) {
                    errors.push({ row: rowNumber, error: `Device with serial ${serialNumber.trim()} is deactivated and cannot be used for a repair ticket.` });
                    continue;
                }
                deviceId = devs[0].id;
                category = devs[0].device_category;
                brand = devs[0].brand;
                model = devs[0].model_number;
                employeeId = devs[0].employee_id;
            } else {
                // Create auto device registration if this serial is new
                const autoAssetId = `AST-${Math.floor(Math.random() * 899999 + 100000)}`;
                const [newDev] = await connection.query(
                    `INSERT INTO company_devices 
            (company_id, device_category, brand, model_number, serial_number, asset_id, notes) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [targetCompanyId, 'Other', 'Other', 'Unknown', serialNumber.trim(), autoAssetId, 'Auto-registered during bulk ticket import']
                );
                deviceId = newDev.insertId;
            }

            // Check if employee email provided matches employee
            if (employeeEmail) {
                const [empRows] = await connection.query('SELECT id FROM company_employees WHERE email = ? AND company_id = ? LIMIT 1', [employeeEmail.trim(), targetCompanyId]);
                if (empRows.length > 0) {
                    employeeId = empRows[0].id;
                }
            }

            // Generate authoritative per-company sequential ticket number (TD-Cxxx-01 or TD-AMC-Cxxx-01)
            const isCompanyAmc = (profile.amc_status || '').toLowerCase() === 'active' || (profile.company_type || '').toUpperCase() === 'AMC';
            const ticketNumber = await generateTicketNumber(connection, {
                companyId: targetCompanyId,
                isAmc: isCompanyAmc
            });
            const slaHours = priority.toLowerCase() === 'urgent' ? 48 : 120;
            const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

            await connection.query(
                `INSERT INTO service_requests 
          (user_id, company_id, employee_id, device_id, customer_name, mobile, email, city, 
           device_category, brand, model_number, serial_number, status, service_type, priority, 
           preferred_contact_method, problem_type, problem_description, ticket_number, sla_deadline) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    targetCompanyId,
                    targetCompanyId,
                    employeeId || null,
                    deviceId,
                    profile.company_name,
                    profile.phone_number,
                    companyUser[0]?.email || req.user.email,
                    'B2B Operations',
                    category,
                    brand,
                    model,
                    serialNumber.trim(),
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

        await connection.commit();

        await logCompanyActivity(connection, req.user.id, 'bulk_import_requests', 'service_requests', null, { 
            imported: importedCount, 
            failed: errors.length 
        }, req.ip);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        return res.json(formatResponse(true, `Successfully imported B2B requests. Created ${importedCount} tickets, ${errors.length} failed.`, {
            count: importedCount,
            imported: importedCount,
            failed: errors.length,
            totalRows: parsed.data.length,
            errors
        }));
    } catch (error) {
        if (connection) await connection.rollback();
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Export Company Devices to CSV ─────────────────────────────────────

const exportCompanyDevicesCsv = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const singleId = req.query.id ? parseInt(req.query.id, 10) : null;
        let query = `SELECT d.id, d.device_category, d.brand, d.model_number, d.serial_number, d.asset_id,
                    d.purchase_date, d.warranty_expiry, d.is_amc, d.amc_tag, d.notes, d.is_active, d.status,
                    b.name as branch_name, e.name as employee_name, e.email as employee_email, d.created_at
             FROM company_devices d
             LEFT JOIN company_branches b ON d.branch_id = b.id
             LEFT JOIN company_employees e ON d.employee_id = e.id
             WHERE d.company_id = ?`;
        const params = [targetCompanyId];

        if (singleId) {
            query += ' AND d.id = ?';
            params.push(singleId);
        }

        query += ' ORDER BY d.created_at DESC';

        const [rows] = await connection.query(query, params);

        const headers = [
            { label: 'Device ID', key: 'id' },
            { label: 'Category', key: 'device_category' },
            { label: 'Brand', key: 'brand' },
            { label: 'Model Number', key: 'model_number' },
            { label: 'Serial Number', key: 'serial_number' },
            { label: 'Asset ID', key: 'asset_id' },
            { label: 'Branch', key: 'branch_name' },
            { label: 'Assigned Employee', key: 'employee_name' },
            { label: 'Employee Email', key: 'employee_email' },
            { label: 'Purchase Date', key: 'purchase_date' },
            { label: 'Warranty Expiry', key: 'warranty_expiry' },
            { label: 'AMC Active', key: 'is_amc' },
            { label: 'AMC Tag', key: 'amc_tag' },
            { label: 'Status', key: 'status' },
            { label: 'Notes', key: 'notes' },
            { label: 'Registered At', key: 'created_at' }
        ];

        const csvString = generateCsv(headers, rows.map(r => ({
            ...r,
            is_amc: r.is_amc ? 'Yes' : 'No',
            status: r.is_active === 0 ? 'Decommissioned' : 'Active',
            purchase_date: r.purchase_date ? new Date(r.purchase_date).toISOString().split('T')[0] : '',
            warranty_expiry: r.warranty_expiry ? new Date(r.warranty_expiry).toISOString().split('T')[0] : '',
            created_at: r.created_at ? new Date(r.created_at).toISOString() : ''
        })));

        const filename = singleId ? `company_device_${singleId}_export.csv` : 'company_devices_export.csv';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csvString);
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Export Company Repair Tickets to CSV ──────────────────────────────

const exportCompanyRepairsCsv = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const singleId = req.query.id ? parseInt(req.query.id, 10) : null;
        let query = `SELECT sr.id, sr.ticket_number, sr.brand, sr.model_number, sr.serial_number,
                    sr.device_category, sr.problem_type, sr.problem_description, sr.status,
                    sr.priority, sr.service_type, sr.repair_cost, sr.sla_deadline, sr.created_at,
                    e.name as employee_name, tech.name as technician_name
             FROM service_requests sr
             LEFT JOIN company_employees e ON sr.employee_id = e.id
             LEFT JOIN users tech ON sr.assigned_technician_id = tech.id
             WHERE sr.company_id = ?`;
        const params = [targetCompanyId];

        if (singleId) {
            query += ' AND sr.id = ?';
            params.push(singleId);
        }

        query += ' ORDER BY sr.created_at DESC';

        const [rows] = await connection.query(query, params);

        const headers = [
            { label: 'Ticket Number', key: 'ticket_number' },
            { label: 'Device Category', key: 'device_category' },
            { label: 'Brand', key: 'brand' },
            { label: 'Model', key: 'model_number' },
            { label: 'Serial Number', key: 'serial_number' },
            { label: 'Assigned Staff', key: 'employee_name' },
            { label: 'Technician', key: 'technician_name' },
            { label: 'Problem Type', key: 'problem_type' },
            { label: 'Description', key: 'problem_description' },
            { label: 'Status', key: 'status' },
            { label: 'Priority', key: 'priority' },
            { label: 'Service Type', key: 'service_type' },
            { label: 'Repair Cost (INR)', key: 'repair_cost' },
            { label: 'SLA Deadline', key: 'sla_deadline' },
            { label: 'Submitted Date', key: 'created_at' }
        ];

        const csvString = generateCsv(headers, rows.map(r => ({
            ...r,
            sla_deadline: r.sla_deadline ? new Date(r.sla_deadline).toISOString() : '',
            created_at: r.created_at ? new Date(r.created_at).toISOString() : ''
        })));

        const filename = singleId ? `company_repair_ticket_${singleId}_export.csv` : 'company_repairs_export.csv';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csvString);
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getActivityLogs = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const [[{ total }]] = await connection.query(
            'SELECT COUNT(*) as total FROM activity_logs WHERE user_id = ?',
            [targetCompanyId]
        );

        const [rows] = await connection.query(
            'SELECT id, action, target_type, target_id, details, ip_address, created_at FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [targetCompanyId, limit, offset]
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

const importBulkEmployees = async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json(formatResponse(false, 'No CSV file uploaded.'));
    }

    const filePath = req.file.path;
    let connection;
    try {
        const csvContent = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseCsv(csvContent);

        if (!parsed.data || parsed.data.length === 0) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json(formatResponse(false, 'CSV file is empty or missing data rows.'));
        }

        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(target.status).json(formatResponse(false, target.error));
        }
        const targetCompanyId = target.companyId;

        await connection.beginTransaction();

        // Cache existing branches
        const [branchRows] = await connection.query(
            'SELECT id, name FROM company_branches WHERE company_id = ?',
            [targetCompanyId]
        );
        const branchMap = new Map();
        branchRows.forEach(b => {
            branchMap.set(b.name.toLowerCase().trim(), b.id);
            branchMap.set(String(b.id), b.id);
        });

        // Cache existing employees
        const [existingEmpRows] = await connection.query(
            'SELECT id, email FROM company_employees WHERE company_id = ?',
            [targetCompanyId]
        );
        const existingEmpMap = new Map();
        existingEmpRows.forEach(e => {
            existingEmpMap.set(e.email.toLowerCase().trim(), e.id);
        });

        let importedCount = 0;
        let updatedCount = 0;
        const errors = [];
        const duplicates = [];

        for (let idx = 0; idx < parsed.data.length; idx++) {
            const rowNumber = idx + 2;
            const row = parsed.data[idx];

            const name = (row.name || row.employee_name || row.full_name || '').trim();
            const email = (row.email || row.employee_email || '').trim();
            const phone = (row.phone || row.mobile || row.phone_number || '').trim();
            const department = (row.department || row.dept || '').trim();
            const designation = (row.designation || row.role || row.position || row.title || 'Staff').trim();
            const branchRaw = (row.branch || row.branch_name || row.branch_id || '').trim();

            if (!name) {
                errors.push({ row: rowNumber, error: 'Missing required employee name.' });
                continue;
            }

            if (!email) {
                errors.push({ row: rowNumber, error: `Row "${name}" is missing required email.` });
                continue;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                errors.push({ row: rowNumber, error: `Invalid email format "${email}" for ${name}.` });
                continue;
            }

            let resolvedBranchId = null;
            if (branchRaw) {
                const cleanBranchKey = branchRaw.toLowerCase();
                if (branchMap.has(cleanBranchKey)) {
                    resolvedBranchId = branchMap.get(cleanBranchKey);
                } else {
                    const [newBranchRes] = await connection.query(
                        'INSERT INTO company_branches (company_id, name, address) VALUES (?, ?, ?)',
                        [targetCompanyId, branchRaw, 'Auto-created during bulk employee import']
                    );
                    resolvedBranchId = newBranchRes.insertId;
                    branchMap.set(cleanBranchKey, resolvedBranchId);
                }
            }

            const cleanEmailKey = email.toLowerCase();
            if (existingEmpMap.has(cleanEmailKey)) {
                const existingId = existingEmpMap.get(cleanEmailKey);
                await connection.query(
                    `UPDATE company_employees 
                     SET name = ?, phone = COALESCE(NULLIF(?, ''), phone),
                         department = COALESCE(NULLIF(?, ''), department),
                         designation = COALESCE(NULLIF(?, ''), designation),
                         branch_id = COALESCE(?, branch_id),
                         is_active = TRUE
                     WHERE id = ? AND company_id = ?`,
                    [name, phone, department, designation, resolvedBranchId, existingId, targetCompanyId]
                );
                updatedCount++;
                duplicates.push({ row: rowNumber, email, name, action: 'Updated existing record' });
            } else {
                const [insertRes] = await connection.query(
                    `INSERT INTO company_employees 
                     (company_id, branch_id, name, email, phone, department, designation, is_active) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
                    [targetCompanyId, resolvedBranchId, name, email, phone || null, department || null, designation || null]
                );
                existingEmpMap.set(cleanEmailKey, insertRes.insertId);
                importedCount++;
            }
        }

        await connection.commit();

        await logCompanyActivity(connection, targetCompanyId, 'bulk_import_employees', 'company_employees', null, { 
            imported: importedCount, 
            updated: updatedCount, 
            failed: errors.length 
        }, req.ip);

        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}

        return res.json(formatResponse(true, `Processed ${parsed.data.length} employee records: ${importedCount} created, ${updatedCount} updated, ${errors.length} failed.`, {
            count: importedCount,
            imported: importedCount,
            updated: updatedCount,
            failed: errors.length,
            totalRows: parsed.data.length,
            errors,
            duplicates
        }));
    } catch (error) {
        if (connection) await connection.rollback();
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const exportCompanyEmployeesCsv = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const search = req.query.search ? req.query.search.trim() : '';
        const status = req.query.status || '';
        const singleId = req.query.id ? parseInt(req.query.id, 10) : null;

        let query = `
            SELECT e.id, e.name, e.email, e.phone, e.department, e.designation,
                   COALESCE(e.is_active, 1) as is_active, e.created_at,
                   b.name as branch_name,
                   (SELECT COUNT(*) FROM company_devices cd WHERE cd.employee_id = e.id) as assigned_devices,
                   (SELECT COUNT(*) FROM service_requests sr WHERE sr.employee_id = e.id) as total_repairs
            FROM company_employees e
            LEFT JOIN company_branches b ON e.branch_id = b.id
            WHERE e.company_id = ?
        `;
        const params = [targetCompanyId];

        if (singleId) {
            query += ' AND e.id = ?';
            params.push(singleId);
        }

        if (status === 'active') {
            query += ' AND COALESCE(e.is_active, 1) = 1';
        } else if (status === 'inactive') {
            query += ' AND e.is_active = 0';
        }

        if (search) {
            query += ' AND (e.name LIKE ? OR e.email LIKE ? OR e.phone LIKE ? OR e.department LIKE ? OR e.designation LIKE ? OR b.name LIKE ?)';
            const sp = `%${search}%`;
            params.push(sp, sp, sp, sp, sp, sp);
        }

        query += ' ORDER BY e.name ASC';

        const [rows] = await connection.query(query, params);

        const headers = [
            { label: 'Employee ID', key: 'id' },
            { label: 'Full Name', key: 'name' },
            { label: 'Email Address', key: 'email' },
            { label: 'Phone', key: 'phone' },
            { label: 'Department', key: 'department' },
            { label: 'Designation', key: 'designation' },
            { label: 'Assigned Branch', key: 'branch_name' },
            { label: 'Assigned Devices', key: 'assigned_devices' },
            { label: 'Total Repair Tickets', key: 'total_repairs' },
            { label: 'Status', key: 'status' },
            { label: 'Registered Date', key: 'created_at' }
        ];

        const csvString = generateCsv(headers, rows.map(r => ({
            ...r,
            phone: r.phone || '—',
            department: r.department || '—',
            designation: r.designation || 'Staff',
            branch_name: r.branch_name || 'Main Office',
            status: r.is_active ? 'Active' : 'Inactive',
            created_at: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : ''
        })));

        const filename = singleId ? `company_employee_${singleId}_export.csv` : 'company_employees_export.csv';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csvString);
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Bulk Branch Import & Export ───────────────────────────────────────

const importBulkBranches = async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json(formatResponse(false, 'No CSV file uploaded.'));
    }

    const filePath = req.file.path;
    let connection;
    try {
        const csvContent = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseCsv(csvContent);

        if (!parsed.data || parsed.data.length === 0) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json(formatResponse(false, 'CSV file is empty or missing data rows.'));
        }

        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(target.status).json(formatResponse(false, target.error));
        }
        const targetCompanyId = target.companyId;

        await connection.beginTransaction();

        const [existingBranchRows] = await connection.query(
            'SELECT id, name FROM company_branches WHERE company_id = ?',
            [targetCompanyId]
        );
        const existingBranchMap = new Map();
        existingBranchRows.forEach(b => {
            existingBranchMap.set(b.name.toLowerCase().trim(), b.id);
        });

        let importedCount = 0;
        let updatedCount = 0;
        const errors = [];
        const duplicates = [];

        for (let idx = 0; idx < parsed.data.length; idx++) {
            const rowNumber = idx + 2;
            const row = parsed.data[idx];

            const name = (row.name || row.branch_name || row.branch || '').trim();
            const address = (row.address || row.branch_address || row.location || '').trim();
            const phone = (row.phone || row.phone_number || row.contact_number || '').trim();

            if (!name) {
                errors.push({ row: rowNumber, error: 'Missing required branch name.' });
                continue;
            }

            if (!address) {
                errors.push({ row: rowNumber, error: `Branch "${name}" is missing required address.` });
                continue;
            }

            const cleanNameKey = name.toLowerCase();
            if (existingBranchMap.has(cleanNameKey)) {
                const existingId = existingBranchMap.get(cleanNameKey);
                await connection.query(
                    `UPDATE company_branches 
                     SET address = COALESCE(NULLIF(?, ''), address),
                         phone = COALESCE(NULLIF(?, ''), phone),
                         is_active = TRUE
                     WHERE id = ? AND company_id = ?`,
                    [address, phone, existingId, targetCompanyId]
                );
                updatedCount++;
                duplicates.push({ row: rowNumber, name, action: 'Updated existing record' });
            } else {
                const [insertRes] = await connection.query(
                    'INSERT INTO company_branches (company_id, name, address, phone) VALUES (?, ?, ?, ?)',
                    [targetCompanyId, name, address, phone || null]
                );
                existingBranchMap.set(cleanNameKey, insertRes.insertId);
                importedCount++;
            }
        }

        await connection.commit();

        await logCompanyActivity(connection, targetCompanyId, 'bulk_import_branches', 'company_branches', null, { 
            imported: importedCount, 
            updated: updatedCount, 
            failed: errors.length 
        }, req.ip);

        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}

        return res.json(formatResponse(true, `Processed ${parsed.data.length} branch records: ${importedCount} created, ${updatedCount} updated, ${errors.length} failed.`, {
            count: importedCount,
            imported: importedCount,
            updated: updatedCount,
            failed: errors.length,
            totalRows: parsed.data.length,
            errors,
            duplicates
        }));
    } catch (error) {
        if (connection) await connection.rollback();
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const exportCompanyBranchesCsv = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const search = req.query.search ? req.query.search.trim() : '';
        const status = req.query.status || '';
        const singleId = req.query.id ? parseInt(req.query.id, 10) : null;

        let query = `
            SELECT b.id, b.name, b.address, b.phone,
                   COALESCE(b.is_active, 1) as is_active, b.created_at,
                   (SELECT COUNT(*) FROM company_employees ce WHERE ce.branch_id = b.id) as staff_count,
                   (SELECT COUNT(*) FROM company_devices cd WHERE cd.branch_id = b.id) as device_count
            FROM company_branches b
            WHERE b.company_id = ?
        `;
        const params = [targetCompanyId];

        if (singleId) {
            query += ' AND b.id = ?';
            params.push(singleId);
        }

        if (status === 'active') {
            query += ' AND COALESCE(b.is_active, 1) = 1';
        } else if (status === 'inactive') {
            query += ' AND b.is_active = 0';
        }

        if (search) {
            query += ' AND (b.name LIKE ? OR b.address LIKE ? OR b.phone LIKE ?)';
            const sp = `%${search}%`;
            params.push(sp, sp, sp);
        }

        query += ' ORDER BY b.name ASC';

        const [rows] = await connection.query(query, params);

        const headers = [
            { label: 'Branch ID', key: 'id' },
            { label: 'Branch Name', key: 'name' },
            { label: 'Office Address', key: 'address' },
            { label: 'Phone', key: 'phone' },
            { label: 'Total Assigned Staff', key: 'staff_count' },
            { label: 'Total Fleet Devices', key: 'device_count' },
            { label: 'Status', key: 'status' },
            { label: 'Created Date', key: 'created_at' }
        ];

        const csvString = generateCsv(headers, rows.map(r => ({
            ...r,
            phone: r.phone || '—',
            status: r.is_active ? 'Active' : 'Inactive',
            created_at: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : ''
        })));

        const filename = singleId ? `company_branch_${singleId}_export.csv` : 'company_branches_export.csv';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csvString);
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
    toggleBranchStatus,
    getEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    toggleEmployeeStatus,
    getDevices,
    createDevice,
    updateDevice,
    deleteDevice,
    toggleDeviceStatus,
    getDeviceRepairHistory,
    getCompanyRepairRequests,
    createCompanyRepairRequest,
    getStatsOverview,
    getMessages,
    sendMessage,
    importBulkDevices,
    importBulkRequests,
    exportCompanyDevicesCsv,
    exportCompanyRepairsCsv,
    importBulkEmployees,
    exportCompanyEmployeesCsv,
    importBulkBranches,
    exportCompanyBranchesCsv,
    getActivityLogs
};

