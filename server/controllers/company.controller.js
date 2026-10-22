const bcrypt = require('bcryptjs');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const { formatResponse, generateTicketNumber, generateCompanyId } = require('../utils/helpers');
const logger = require('../utils/logger');
const fs = require('fs');
const { generateToken } = require('../utils/auth.helpers');
const { parseSpreadsheet, generateSpreadsheet, parseDateSafe, formatDateSafe } = require('../utils/spreadsheet.utils');
const { parseCsv, generateCsv } = require('../utils/csv.utils');
const { normalizePhoneNumber } = require('../middleware/validate.middleware');
const { sendAdminNotification } = require('../utils/email.utils');

const { logActivity } = require('../utils/activity.logger');

const getFrontendBaseUrl = (req) => {
    if (config.frontend && config.frontend.url) {
        return config.frontend.url.replace(/\/+$/, '');
    }
    if (process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim()) {
        return process.env.FRONTEND_URL.trim().replace(/\/+$/, '');
    }
    const origin = req.get('origin');
    if (origin && origin !== 'null' && !origin.includes(`localhost:${config.server?.port || 5000}`)) {
        return origin.replace(/\/+$/, '');
    }
    const referer = req.get('referer');
    if (referer) {
        try {
            const parsed = new URL(referer);
            if (!parsed.host.includes(`localhost:${config.server?.port || 5000}`)) {
                return `${parsed.protocol}//${parsed.host}`;
            }
        } catch (_) {}
    }
    return config.frontend?.url || 'http://localhost:3000';
};

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
              COALESCE(p.company_id, u.company_id, CONCAT('CMP-', LPAD(u.id, 3, '0'))) AS company_id,
              COALESCE(p.company_id, u.company_id, CONCAT('CMP-', LPAD(u.id, 3, '0'))) AS permanent_company_id,
              COALESCE(p.company_id, u.company_id, CONCAT('CMP-', LPAD(u.id, 3, '0'))) AS companyId,
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
        let device = null;
        let isCustomerDevice = false;
        let ticketsWhereSql = 'WHERE sr.device_id = ?';
        let ticketsParams = [id];

        if (devRows.length > 0) {
            device = devRows[0];
        } else {
            // If device was not found in company_devices, check if caller is admin (or authorized) requesting by ticket ID or customer device
            const [ticketRows] = await connection.query(`
                SELECT sr.*, 
                       u.name as customer_account_name, 
                       u.email as customer_account_email, 
                       u.phone as customer_account_phone
                FROM service_requests sr
                LEFT JOIN users u ON sr.user_id = u.id
                WHERE sr.id = ? OR sr.ticket_number = ?
                LIMIT 1
            `, [id, id]);

            if (ticketRows.length > 0) {
                const sourceTicket = ticketRows[0];

                // If this ticket is tied to a company device, fetch that company device
                if (sourceTicket.device_id) {
                    let compDevQuery = `
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
                    const compDevParams = [sourceTicket.device_id];
                    if (req.user.role !== 'admin') {
                        compDevQuery += ' AND d.company_id = ?';
                        compDevParams.push(targetCompanyId);
                    }
                    const [cRows] = await connection.query(compDevQuery, compDevParams);
                    if (cRows.length > 0) {
                        device = cRows[0];
                        ticketsWhereSql = 'WHERE sr.device_id = ?';
                        ticketsParams = [sourceTicket.device_id];
                    }
                }

                // If not a company device, this is an individual customer's physical device
                if (!device) {
                    // Check authorization for customer
                    if (req.user.role !== 'admin' && req.user.role !== 'technician') {
                        if (sourceTicket.user_id !== req.user.id) {
                            return res.status(403).json(formatResponse(false, 'Unauthorized to view this device history.'));
                        }
                    }

                    isCustomerDevice = true;
                    device = {
                        id: sourceTicket.id,
                        is_customer_device: true,
                        brand: sourceTicket.brand || 'Device',
                        model_number: sourceTicket.model_number || 'Standard',
                        serial_number: sourceTicket.serial_number || 'N/A',
                        device_category: sourceTicket.device_category || 'Hardware',
                        device_type: sourceTicket.device_category || 'Hardware',
                        customer_name: sourceTicket.customer_name || sourceTicket.customer_account_name || 'Customer',
                        customer_email: sourceTicket.email || sourceTicket.customer_account_email || null,
                        customer_phone: sourceTicket.mobile || sourceTicket.customer_account_phone || null,
                        employee_name: null,
                        branch_name: sourceTicket.city || null,
                        is_active: 1,
                        status: 'active',
                        created_at: sourceTicket.created_at
                    };

                    // For an individual customer's device, match tickets for that customer device
                    if (sourceTicket.serial_number && String(sourceTicket.serial_number).trim() !== '') {
                        ticketsWhereSql = 'WHERE sr.company_id IS NULL AND (sr.serial_number = ? OR (sr.user_id = ? AND sr.model_number = ? AND sr.brand = ?))';
                        ticketsParams = [sourceTicket.serial_number, sourceTicket.user_id, sourceTicket.model_number, sourceTicket.brand];
                    } else {
                        ticketsWhereSql = 'WHERE sr.company_id IS NULL AND sr.user_id = ? AND sr.model_number = ? AND sr.brand = ?';
                        ticketsParams = [sourceTicket.user_id, sourceTicket.model_number, sourceTicket.brand];
                    }
                }
            }
        }

        if (!device) {
            return res.status(404).json(formatResponse(false, 'Device not found or unauthorized.'));
        }

        // Fetch All Repair Tickets strictly for this device with joined technicians, invoices, quotations, and verified payments
        // Using scalar subqueries for invoices, quotations, and payments to guarantee zero duplicate ticket rows
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
                sr.repair_cost as cost_billed,
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
            LEFT JOIN (
                SELECT ticket_id, MAX(id) as max_inv_id
                FROM invoices 
                WHERE is_active = TRUE OR is_active IS NULL
                GROUP BY ticket_id
            ) latest_inv ON latest_inv.ticket_id = sr.id
            LEFT JOIN invoices inv ON inv.id = latest_inv.max_inv_id
            LEFT JOIN (
                SELECT request_id, MAX(id) as max_q_id
                FROM quotations
                GROUP BY request_id
            ) latest_q ON latest_q.request_id = sr.id
            LEFT JOIN quotations q ON q.id = latest_q.max_q_id
            LEFT JOIN (
                SELECT ticket_id, MAX(id) as max_pmt_id
                FROM payments 
                WHERE status IN ('paid', 'success')
                GROUP BY ticket_id
            ) latest_pmt ON latest_pmt.ticket_id = sr.id
            LEFT JOIN payments pmt ON pmt.id = latest_pmt.max_pmt_id
            ${ticketsWhereSql}
            ORDER BY sr.created_at DESC
        `, ticketsParams);

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
        const companyName = profile.company_name || target.companyName || companyUser[0]?.name || 'Corporate Client';

        // AMC Source of Truth Detection (Section 17):
        // Check company's profile amc_status OR specific device's is_amc
        const isCompanyAmc = (profile.amc_status || '').toLowerCase() === 'active' || (profile.company_type || '').toUpperCase() === 'AMC' || device.is_amc === 1;

        // Generate authoritative per-company sequential ticket number (CMP-xxx-xxx)
        const ticketNumber = await generateTicketNumber(connection, {
            companyId: profile.company_id || targetCompanyId,
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

        logger.info(`B2B repair ticket created: ${ticketNumber} (Individual) for Company: ${targetCompanyId} by user: ${req.user.id}`);

        // Create background log
        await logCompanyActivity(connection, req.user.id, 'create_repair_request', 'service_requests', result.insertId, { ticketNumber });

        const deviceSummary = [device.brand, device.model_number].filter(Boolean).join(' ') + 
            (device.device_category ? ` (${device.device_category})` : '') + 
            (device.serial_number ? ` [SN: ${device.serial_number}]` : '');

        // Persist Admin Dashboard notification for active admins
        try {
            const [adminUsers] = await connection.query(
                'SELECT id FROM users WHERE role = "admin" AND is_active = 1'
            );
            if (adminUsers.length > 0) {
                const notifTitle = 'New Company Repair Request';
                const notifMessage = `Company: ${companyName}\nTicket ID: ${ticketNumber}\nType: Individual\nDevice: ${deviceSummary}\nIssue: ${cleanDesc.length > 120 ? cleanDesc.substring(0, 117) + '...' : cleanDesc}\nStatus: Pending`;
                const notifRows = adminUsers.map(a => [
                    a.id,
                    req.user.id,
                    result.insertId,
                    notifTitle,
                    notifMessage,
                    0
                ]);
                await connection.query(
                    'INSERT INTO notifications (user_id, sender_id, ticket_id, title, message, is_read) VALUES ?',
                    [notifRows]
                );
            }
        } catch (notifErr) {
            logger.error('Failed to create in-app notification for company ticket request:', notifErr);
        }

        // Asynchronously dispatch Admin email alert
        const baseUrl = getFrontendBaseUrl(req);
        const ticketUrl = `${baseUrl}/admin/tickets?id=${result.insertId}`;
        const emailSubject = `New Company Repair Request [${ticketNumber}] - ${companyName}`;
        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0d0d12; color: #f4f4f5; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; padding: 32px 24px;">
            <div style="margin-bottom: 24px;">
              <span style="font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.5px; color: #ffffff;">TEK<span style="color: #00e5ff;">DOCTOR</span></span>
            </div>
            <h2 style="font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 8px;">New Company Repair Request</h2>
            <p style="font-size: 14px; color: #a1a1aa; margin-top: 0; margin-bottom: 20px;">A new B2B repair request has been submitted from the Company Portal.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #71717a; width: 35%;">Company:</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #ffffff; font-weight: 600;">${companyName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #71717a;">Ticket ID:</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #00e5ff; font-weight: 700; font-family: monospace;">${ticketNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #71717a;">Type:</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #ffffff;">Individual</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #71717a;">Device:</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #ffffff;">${deviceSummary}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #71717a;">Problem:</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #ffffff;">${problemType}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #71717a;">Issue Summary:</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #e4e4e7;">${cleanDesc}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #71717a;">Priority:</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: ${priority === 'Urgent' ? '#f43f5e' : '#ffffff'}; font-weight: 600;">${priority || 'Standard'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #71717a;">Status:</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #fbbf24; font-weight: 600;">Pending</td>
              </tr>
            </table>

            <div style="text-align: center; margin-top: 24px;">
              <a href="${ticketUrl}" style="display: inline-block; background-color: #00e5ff; color: #000000; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px;">View Ticket</a>
            </div>
          </div>
        `;

        sendAdminNotification(emailSubject, emailHtml)
            .catch(err => logger.error(`Failed to send company ticket creation email notification to admin: ${err.message}`));

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
        return res.status(400).json(formatResponse(false, 'No spreadsheet file uploaded. Please upload a .csv or .xlsx file.'));
    }

    const filePath = req.file.path;
    let connection;
    try {
        const parsed = await parseSpreadsheet(filePath, req.file.originalname);

        if (!parsed.data || parsed.data.length === 0) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json(formatResponse(false, 'Uploaded file is empty or missing data rows.'));
        }

        if (parsed.data.length > 500) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json(formatResponse(false, 'File exceeds maximum limit of 500 rows per upload batch.'));
        }

        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(target.status).json(formatResponse(false, target.error));
        }
        const targetCompanyId = target.companyId;

        await connection.beginTransaction();

        // Pre-fetch existing branches
        const [branchRows] = await connection.query(
            'SELECT id, name FROM company_branches WHERE company_id = ?',
            [targetCompanyId]
        );
        const branchMap = new Map();
        branchRows.forEach(b => {
            branchMap.set(b.name.toLowerCase().trim(), b.id);
            branchMap.set(String(b.id), b.id);
        });

        // Pre-fetch existing employees
        const [empRows] = await connection.query(
            'SELECT id, name, email FROM company_employees WHERE company_id = ?',
            [targetCompanyId]
        );
        const empEmailMap = new Map();
        const empNameMap = new Map();
        empRows.forEach(e => {
            if (e.email) empEmailMap.set(e.email.toLowerCase().trim(), e.id);
            if (e.name) empNameMap.set(e.name.toLowerCase().trim(), e.id);
            empEmailMap.set(String(e.id), e.id);
        });

        // Pre-fetch existing devices
        const [existingDevs] = await connection.query(
            'SELECT id, serial_number, asset_id, branch_id, employee_id FROM company_devices WHERE company_id = ?',
            [targetCompanyId]
        );
        const existingSerialMap = new Map();
        existingDevs.forEach(d => existingSerialMap.set(d.serial_number.toLowerCase().trim(), d));

        // Get max AMC tag number for auto-generation
        const [maxRows] = await connection.query(
            `SELECT amc_tag FROM company_devices 
             WHERE company_id = ? AND amc_tag LIKE 'td-amc-%' 
             ORDER BY CAST(SUBSTRING(amc_tag, 8) AS UNSIGNED) DESC 
             LIMIT 1`,
            [targetCompanyId]
        );
        let nextAmcNum = 1;
        if (maxRows.length > 0) {
            const match = maxRows[0].amc_tag.match(/td-amc-(\d+)/i);
            if (match) {
                nextAmcNum = parseInt(match[1], 10) + 1;
            }
        }

        let importedCount = 0;
        let updatedCount = 0;
        const skippedDuplicates = [];
        const errors = [];
        const seenInFileSerials = new Map();

        for (let idx = 0; idx < parsed.data.length; idx++) {
            const rowNumber = idx + 2;
            const device = parsed.data[idx];

            const category = (device.category || device.device_category || 'Laptop').trim();
            const brand = (device.brand || device.make || device.manufacturer || '').trim();
            const modelNumber = (device.model_number || device.model || device.device_model || '').trim();
            const serialNumber = (device.serial_number || device.serial || device.sn || device.device_serial || '').trim();
            let assetId = (device.asset_tag || device.asset_id || device.assetid || '').trim();
            const branchRaw = (device.branch || device.branch_name || '').trim();
            const empRaw = (device.assigned_employee_email || device.assigned_employee || device.employee_email || device.employee || '').trim();
            const rawPurchaseDate = device.purchase_date || device.purchased_on || '';
            const rawWarrantyExpiry = device.warranty_expiry || device.warranty_end || '';
            const isAmcRaw = (device.amc_covered || device.is_amc || device.amc_active || '').trim().toLowerCase();
            const amcTagInput = (device.amc_tag || '').trim();
            const statusRaw = (device.status || device.is_active || 'active').trim().toLowerCase();
            const notes = (device.notes || device.comments || device.remarks || '').trim();

            // 1. Validate required fields
            if (!serialNumber) {
                errors.push({ row: rowNumber, field: 'serial_number', error: 'Missing required Serial Number.', suggestion: 'Provide the hardware serial number.' });
                continue;
            }
            if (!brand) {
                errors.push({ row: rowNumber, field: 'brand', error: `Row with serial "${serialNumber}" is missing required Brand.`, suggestion: 'Specify manufacturer brand (e.g. Dell, Apple, HP).' });
                continue;
            }
            if (!modelNumber) {
                errors.push({ row: rowNumber, field: 'model_number', error: `Row with serial "${serialNumber}" is missing required Model Number.`, suggestion: 'Specify device model (e.g. Latitude 5420).' });
                continue;
            }

            // In-file duplicate detection
            const cleanSerialKey = serialNumber.toLowerCase();
            if (seenInFileSerials.has(cleanSerialKey)) {
                const prevRow = seenInFileSerials.get(cleanSerialKey);
                errors.push({ row: rowNumber, field: 'serial_number', error: `Duplicate serial number "${serialNumber}" found in this file (already defined at row ${prevRow}).`, suggestion: 'Ensure each row has a unique serial number.' });
                continue;
            }
            seenInFileSerials.set(cleanSerialKey, rowNumber);

            // 2. Validate branch reference
            let resolvedBranchId = null;
            if (branchRaw) {
                const cleanBranchKey = branchRaw.toLowerCase();
                if (branchMap.has(cleanBranchKey)) {
                    resolvedBranchId = branchMap.get(cleanBranchKey);
                } else {
                    errors.push({ row: rowNumber, field: 'branch', error: `Branch "${branchRaw}" does not exist in your company branches.`, suggestion: 'Create the branch under Branches first or leave empty.' });
                    continue;
                }
            }

            // 3. Validate employee reference
            let resolvedEmployeeId = null;
            if (empRaw) {
                const cleanEmpKey = empRaw.toLowerCase();
                if (empEmailMap.has(cleanEmpKey)) {
                    resolvedEmployeeId = empEmailMap.get(cleanEmpKey);
                } else if (empNameMap.has(cleanEmpKey)) {
                    resolvedEmployeeId = empNameMap.get(cleanEmpKey);
                } else {
                    errors.push({ row: rowNumber, field: 'assigned_employee', error: `Assigned employee "${empRaw}" not found in company staff directory.`, suggestion: 'Register the employee under Employees first or check email.' });
                    continue;
                }
            }

            // 4. Validate and parse dates
            let purchaseDate = null;
            if (rawPurchaseDate) {
                purchaseDate = parseDateSafe(rawPurchaseDate);
                if (!purchaseDate) {
                    errors.push({ row: rowNumber, field: 'purchase_date', error: `Invalid Purchase Date format "${rawPurchaseDate}".`, suggestion: 'Use YYYY-MM-DD or DD/MM/YYYY format.' });
                    continue;
                }
            }

            let warrantyExpiry = null;
            if (rawWarrantyExpiry) {
                warrantyExpiry = parseDateSafe(rawWarrantyExpiry);
                if (!warrantyExpiry) {
                    errors.push({ row: rowNumber, field: 'warranty_expiry', error: `Invalid Warranty Expiry format "${rawWarrantyExpiry}".`, suggestion: 'Use YYYY-MM-DD or DD/MM/YYYY format.' });
                    continue;
                }
            }

            // AMC logic
            const isAmc = isAmcRaw === 'yes' || isAmcRaw === 'true' || isAmcRaw === '1';
            let finalAmcTag = null;
            if (isAmc) {
                finalAmcTag = amcTagInput || `TD-AMC-${String(nextAmcNum++).padStart(3, '0')}`;
            }

            // Status logic
            const isActive = !(statusRaw === 'inactive' || statusRaw === 'decommissioned' || statusRaw === '0' || statusRaw === 'false');
            const statusVal = isActive ? 'active' : 'decommissioned';

            if (existingSerialMap.has(cleanSerialKey)) {
                // Update existing record
                const existingRec = existingSerialMap.get(cleanSerialKey);
                const finalAssetId = assetId || existingRec.asset_id || `AST-${Math.floor(Math.random() * 899999 + 100000)}`;

                await connection.query(
                    `UPDATE company_devices 
                     SET device_category = ?, brand = ?, model_number = ?, asset_id = ?, 
                         branch_id = COALESCE(?, branch_id),
                         employee_id = COALESCE(?, employee_id),
                         purchase_date = COALESCE(?, purchase_date),
                         warranty_expiry = COALESCE(?, warranty_expiry),
                         notes = COALESCE(NULLIF(?, ''), notes),
                         is_amc = ?,
                         amc_tag = COALESCE(?, amc_tag),
                         is_active = ?,
                         status = ?
                     WHERE id = ? AND company_id = ?`,
                    [
                        category, brand, modelNumber, finalAssetId,
                        resolvedBranchId, resolvedEmployeeId,
                        purchaseDate, warrantyExpiry,
                        notes, isAmc ? 1 : 0, finalAmcTag,
                        isActive ? 1 : 0, statusVal,
                        existingRec.id, targetCompanyId
                    ]
                );
                updatedCount++;
                skippedDuplicates.push({ row: rowNumber, serialNumber, action: 'Updated existing fleet record' });
            } else {
                // Insert new record
                if (!assetId) {
                    assetId = `AST-${Math.floor(Math.random() * 899999 + 100000)}`;
                }
                const [insertRes] = await connection.query(
                    `INSERT INTO company_devices 
                     (company_id, branch_id, employee_id, device_category, brand, model_number, serial_number, asset_id, purchase_date, warranty_expiry, notes, is_amc, amc_tag, is_active, status) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        targetCompanyId, resolvedBranchId, resolvedEmployeeId,
                        category, brand, modelNumber, serialNumber, assetId,
                        purchaseDate, warrantyExpiry, notes,
                        isAmc ? 1 : 0, finalAmcTag,
                        isActive ? 1 : 0, statusVal
                    ]
                );
                existingSerialMap.set(cleanSerialKey, { id: insertRes.insertId, serial_number: serialNumber, asset_id: assetId });
                importedCount++;
            }
        }

        await connection.commit();

        await logCompanyActivity(connection, req.user.id, 'bulk_import_devices', 'company_devices', null, { 
            imported: importedCount, 
            updated: updatedCount, 
            failed: errors.length 
        }, req.ip);

        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}

        return res.json(formatResponse(true, `Processed ${parsed.data.length} device rows: ${importedCount} created, ${updatedCount} updated, ${errors.length} failed.`, {
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
        return res.status(400).json(formatResponse(false, 'No spreadsheet file uploaded. Please upload a .csv or .xlsx file.'));
    }

    const filePath = req.file.path;
    let connection;
    try {
        const parsed = await parseSpreadsheet(filePath, req.file.originalname);

        if (!parsed.data || parsed.data.length === 0) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json(formatResponse(false, 'Uploaded file is empty or missing data rows.'));
        }

        if (parsed.data.length > 100) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json(formatResponse(false, 'Bulk ticket import is limited to a maximum of 100 requests per batch.'));
        }

        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(target.status).json(formatResponse(false, target.error));
        }
        const targetCompanyId = target.companyId;

        // Fetch company profile & user details
        const [profiles] = await connection.query(
            'SELECT company_name, phone_number, amc_status, company_type FROM company_profiles WHERE user_id = ? LIMIT 1',
            [targetCompanyId]
        );
        const [companyUser] = await connection.query(
            'SELECT name, email, phone FROM users WHERE id = ? LIMIT 1',
            [targetCompanyId]
        );
        const profile = profiles[0] || { company_name: companyUser[0]?.name || target.companyName, phone_number: companyUser[0]?.phone || '' };
        const companyName = profile.company_name || target.companyName || companyUser[0]?.name || 'Corporate Client';

        // Fetch company devices
        const [devs] = await connection.query(
            'SELECT id, serial_number, device_category, brand, model_number, employee_id, is_active, status FROM company_devices WHERE company_id = ?',
            [targetCompanyId]
        );
        const devMap = new Map();
        devs.forEach(d => devMap.set(d.serial_number.toLowerCase().trim(), d));

        // Fetch company employees
        const [empRows] = await connection.query(
            'SELECT id, email, name FROM company_employees WHERE company_id = ?',
            [targetCompanyId]
        );
        const empMap = new Map();
        empRows.forEach(e => {
            if (e.email) empMap.set(e.email.toLowerCase().trim(), e.id);
            if (e.name) empMap.set(e.name.toLowerCase().trim(), e.id);
        });

        // Fetch devices currently in open repairs to prevent duplicate active tickets
        const [openRepairs] = await connection.query(
            "SELECT device_id FROM service_requests WHERE company_id = ? AND status IN ('pending', 'in_progress') AND device_id IS NOT NULL",
            [targetCompanyId]
        );
        const openRepairDeviceIds = new Set(openRepairs.map(r => r.device_id));

        const errors = [];
        const validBatch = [];
        const seenInFileSerials = new Map();

        // ── Phase 1: Complete Validation (NO ticket sequence numbers generated yet!) ──
        for (let idx = 0; idx < parsed.data.length; idx++) {
            const rowNumber = idx + 2;
            const rowData = parsed.data[idx];

            const serialNumber = (rowData.device_serial || rowData.serial_number || rowData.serial || rowData.sn || '').trim();
            const problemDescription = (rowData.problem_description || rowData.description || rowData.problem_details || rowData.issue || '').trim();
            const problemType = (rowData.problem_type || rowData.problem || rowData.issue_type || 'Hardware').trim();
            const priorityRaw = (rowData.priority || 'Standard').trim();
            const priority = priorityRaw.toLowerCase() === 'urgent' ? 'Urgent' : 'Standard';
            const serviceType = (rowData.service_type || rowData.service_preference || 'Bring to Service Center').trim();
            const employeeEmail = (rowData.employee_email || rowData.email || rowData.employee || '').trim();

            if (!serialNumber) {
                errors.push({ row: rowNumber, field: 'device_serial', error: 'Missing required Device Serial Number.', suggestion: 'Provide the device serial number.' });
                continue;
            }

            const cleanSerialKey = serialNumber.toLowerCase();

            // Enforce registered fleet device (NO phantom auto-creation)
            if (!devMap.has(cleanSerialKey)) {
                errors.push({
                    row: rowNumber,
                    field: 'device_serial',
                    error: `Device serial "${serialNumber}" is not registered in your company fleet.`,
                    suggestion: 'Register the device under Fleet Devices before booking a repair ticket.'
                });
                continue;
            }

            const device = devMap.get(cleanSerialKey);
            const isDeactivated = device.is_active === 0 || device.is_active === false || device.status === 'decommissioned' || device.status === 'inactive';
            if (isDeactivated) {
                errors.push({
                    row: rowNumber,
                    field: 'device_serial',
                    error: `Device serial "${serialNumber}" is decommissioned or inactive.`,
                    suggestion: 'Reactivate the device under Fleet Devices or choose an active device.'
                });
                continue;
            }

            if (openRepairDeviceIds.has(device.id)) {
                errors.push({
                    row: rowNumber,
                    field: 'device_serial',
                    error: `Device serial "${serialNumber}" already has an active repair ticket in progress.`,
                    suggestion: 'Wait for the open repair ticket to complete before booking another.'
                });
                continue;
            }

            if (seenInFileSerials.has(cleanSerialKey)) {
                const prevRow = seenInFileSerials.get(cleanSerialKey);
                errors.push({
                    row: rowNumber,
                    field: 'device_serial',
                    error: `Duplicate ticket request for serial "${serialNumber}" in the same file (already defined at row ${prevRow}).`,
                    suggestion: 'Each device can only have one repair ticket request per upload batch.'
                });
                continue;
            }
            seenInFileSerials.set(cleanSerialKey, rowNumber);

            if (!problemDescription || problemDescription.length < 10) {
                errors.push({
                    row: rowNumber,
                    field: 'problem_description',
                    error: 'Problem description must be at least 10 characters describing the issue.',
                    suggestion: 'Describe symptoms (e.g. Screen flickering or battery draining rapidly).'
                });
                continue;
            }

            let employeeId = device.employee_id || null;
            if (employeeEmail) {
                const cleanEmpKey = employeeEmail.toLowerCase();
                if (empMap.has(cleanEmpKey)) {
                    employeeId = empMap.get(cleanEmpKey);
                } else {
                    errors.push({
                        row: rowNumber,
                        field: 'employee_email',
                        error: `Employee "${employeeEmail}" not found in company staff directory.`,
                        suggestion: 'Provide an active employee email from your staff directory or leave blank.'
                    });
                    continue;
                }
            }

            validBatch.push({
                rowNumber,
                deviceId: device.id,
                category: device.device_category || 'Laptop',
                brand: device.brand || 'Other',
                model: device.model_number || 'Unknown',
                serialNumber: device.serial_number,
                employeeId,
                problemType,
                problemDescription,
                priority,
                serviceType
            });
        }

        if (validBatch.length === 0) {
            try {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (_) {}
            return res.status(400).json(formatResponse(false, 'All rows in the uploaded spreadsheet failed validation.', {
                count: 0,
                imported: 0,
                failed: errors.length,
                totalRows: parsed.data.length,
                errors
            }));
        }

        // ── Phase 2: Create Tickets for Valid Rows ─────────────────────────────
        await connection.beginTransaction();

        const isCompanyAmc = (profile.amc_status || '').toLowerCase() === 'active' || (profile.company_type || '').toUpperCase() === 'AMC';
        const batchKey = (req.body?.clientSubmissionId || req.headers['x-submission-id'] || '').trim();
        const batchId = batchKey || `bulk_${Date.now()}_${targetCompanyId}_${Math.random().toString(36).substring(2, 7)}`;
        let importedCount = 0;

        for (let idx = 0; idx < validBatch.length; idx++) {
            const item = validBatch[idx];
            // Generate sequence only for fully validated records (zero sequence waste!)
            const ticketNumber = await generateTicketNumber(connection, {
                companyId: profile.company_id || targetCompanyId,
                isAmc: isCompanyAmc
            });
            const slaHours = item.priority === 'Urgent' ? 48 : 120;
            const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);
            const rowSubmissionId = `${batchId}_${idx + 1}`;

            await connection.query(
                `INSERT INTO service_requests 
                 (user_id, company_id, employee_id, device_id, customer_name, mobile, email, city, 
                  device_category, brand, model_number, serial_number, status, service_type, priority, 
                  preferred_contact_method, problem_type, problem_description, ticket_number, sla_deadline, submission_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    targetCompanyId,
                    targetCompanyId,
                    item.employeeId,
                    item.deviceId,
                    profile.company_name,
                    profile.phone_number || companyUser[0]?.phone || '9876543210',
                    companyUser[0]?.email || req.user.email,
                    'B2B Operations',
                    item.category,
                    item.brand,
                    item.model,
                    item.serialNumber,
                    'pending',
                    item.serviceType,
                    item.priority,
                    'WhatsApp',
                    item.problemType,
                    item.problemDescription,
                    ticketNumber,
                    slaDeadline,
                    rowSubmissionId
                ]
            );
            importedCount++;
        }

        await connection.commit();

        await logCompanyActivity(connection, req.user.id, 'bulk_import_requests', 'service_requests', null, { 
            imported: importedCount, 
            failed: errors.length,
            batchId
        }, req.ip);

        // Notify Admin if at least one ticket was successfully created
        if (importedCount > 0) {
            const submissionTime = new Date().toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Asia/Kolkata'
            });

            // Persist Admin Dashboard notification for active admins
            try {
                const [adminUsers] = await connection.query(
                    'SELECT id FROM users WHERE role = "admin" AND is_active = 1'
                );
                if (adminUsers.length > 0) {
                    const notifTitle = 'New Bulk Repair Request';
                    const notifMessage = `Company: ${companyName}\nType: Bulk\nCreated: ${importedCount}\nFailed: ${errors.length}\nTime: ${submissionTime}`;
                    const notifRows = adminUsers.map(a => [
                        a.id,
                        req.user.id,
                        null,
                        notifTitle,
                        notifMessage,
                        0
                    ]);
                    await connection.query(
                        'INSERT INTO notifications (user_id, sender_id, ticket_id, title, message, is_read) VALUES ?',
                        [notifRows]
                    );
                }
            } catch (notifErr) {
                logger.error('Failed to create in-app notification for bulk ticket request:', notifErr);
            }

            // Asynchronously dispatch Admin email alert
            const baseUrl = getFrontendBaseUrl(req);
            const bulkTicketsUrl = `${baseUrl}/admin/tickets?search=${encodeURIComponent(companyName)}`;
            const emailSubject = `New Bulk Repair Request [${importedCount} Tickets] - ${companyName}`;
            const emailHtml = `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0d0d12; color: #f4f4f5; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; padding: 32px 24px;">
                <div style="margin-bottom: 24px;">
                  <span style="font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.5px; color: #ffffff;">TEK<span style="color: #00e5ff;">DOCTOR</span></span>
                </div>
                <h2 style="font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 8px;">New Bulk Repair Request</h2>
                <p style="font-size: 14px; color: #a1a1aa; margin-top: 0; margin-bottom: 20px;">A spreadsheet bulk repair import has been processed for corporate client <strong>${companyName}</strong>.</p>
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
                  <tr>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #71717a; width: 35%;">Company:</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #ffffff; font-weight: 600;">${companyName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #71717a;">Type:</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #ffffff;">Bulk</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #71717a;">Created:</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #10b981; font-weight: 700;">${importedCount} tickets</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #71717a;">Failed:</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: ${errors.length > 0 ? '#f43f5e' : '#a1a1aa'}; font-weight: 600;">${errors.length} rows</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #71717a;">Submission Time:</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; color: #ffffff;">${submissionTime}</td>
                  </tr>
                </table>

                <div style="text-align: center; margin-top: 24px;">
                  <a href="${bulkTicketsUrl}" style="display: inline-block; background-color: #00e5ff; color: #000000; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px;">View Tickets</a>
                </div>
              </div>
            `;

            sendAdminNotification(emailSubject, emailHtml)
                .catch(err => logger.error(`Failed to send bulk repair import email notification to admin: ${err.message}`));
        }

        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}

        return res.json(formatResponse(true, `Successfully processed B2B repair requests: ${importedCount} tickets created, ${errors.length} failed.`, {
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

// ── Export Company Devices ─────────────────────────────────────────────

const exportCompanyDevicesCsv = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const format = (req.query.format || 'csv').toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
        const singleId = req.query.id ? parseInt(req.query.id, 10) : null;
        const search = req.query.search ? req.query.search.trim() : '';
        const status = req.query.status || '';
        const branchFilter = req.query.branch || '';
        const categoryFilter = req.query.category || '';

        let query = `
            SELECT d.id, d.device_category, d.brand, d.model_number, d.serial_number, d.asset_id,
                   d.purchase_date, d.warranty_expiry, d.is_amc, d.amc_tag, d.notes, d.is_active, d.status,
                   b.name as branch_name, e.name as employee_name, e.email as employee_email, d.created_at
            FROM company_devices d
            LEFT JOIN company_branches b ON d.branch_id = b.id
            LEFT JOIN company_employees e ON d.employee_id = e.id
            WHERE d.company_id = ?
        `;
        const params = [targetCompanyId];

        if (singleId) {
            query += ' AND d.id = ?';
            params.push(singleId);
        }

        if (status === 'active') {
            query += ' AND COALESCE(d.is_active, 1) = 1 AND (d.status IS NULL OR d.status != "decommissioned")';
        } else if (status === 'inactive' || status === 'decommissioned') {
            query += ' AND (d.is_active = 0 OR d.status = "decommissioned")';
        }

        if (categoryFilter) {
            query += ' AND d.device_category = ?';
            params.push(categoryFilter);
        }

        if (branchFilter) {
            if (/^\d+$/.test(branchFilter)) {
                query += ' AND d.branch_id = ?';
                params.push(parseInt(branchFilter, 10));
            } else {
                query += ' AND b.name LIKE ?';
                params.push(`%${branchFilter}%`);
            }
        }

        if (search) {
            query += ' AND (d.serial_number LIKE ? OR d.brand LIKE ? OR d.model_number LIKE ? OR d.asset_id LIKE ? OR e.name LIKE ? OR b.name LIKE ?)';
            const sp = `%${search}%`;
            params.push(sp, sp, sp, sp, sp, sp);
        }

        query += ' ORDER BY d.created_at DESC';

        const [rows] = await connection.query(query, params);

        const columns = [
            { header: 'Serial Number', key: 'serial_number', width: 22, isText: true },
            { header: 'Brand', key: 'brand', width: 16 },
            { header: 'Model Number', key: 'model_number', width: 22 },
            { header: 'Category', key: 'device_category', width: 16 },
            { header: 'Asset Tag', key: 'asset_id', width: 18, isText: true },
            { header: 'Branch', key: 'branch_name', width: 22 },
            { header: 'Assigned Employee Name', key: 'employee_name', width: 25 },
            { header: 'Assigned Employee Email', key: 'employee_email', width: 30 },
            { header: 'Purchase Date', key: 'purchase_date', width: 16 },
            { header: 'Warranty Expiry', key: 'warranty_expiry', width: 16 },
            { header: 'AMC Active', key: 'is_amc', width: 14 },
            { header: 'AMC Tag', key: 'amc_tag', width: 18, isText: true },
            { header: 'Status', key: 'status', width: 16 },
            { header: 'Notes', key: 'notes', width: 30 },
            { header: 'Registered Date', key: 'created_at', width: 16 }
        ];

        const formattedRows = rows.map(r => ({
            serial_number: r.serial_number || '',
            brand: r.brand || '',
            model_number: r.model_number || '',
            device_category: r.device_category || 'Laptop',
            asset_id: r.asset_id || '',
            branch_name: r.branch_name || 'Unassigned',
            employee_name: r.employee_name || 'Unassigned',
            employee_email: r.employee_email || '',
            purchase_date: formatDateSafe(r.purchase_date),
            warranty_expiry: formatDateSafe(r.warranty_expiry),
            is_amc: r.is_amc ? 'Yes' : 'No',
            amc_tag: r.amc_tag || '',
            status: (r.is_active === 0 || r.status === 'decommissioned') ? 'Decommissioned' : 'Active',
            notes: r.notes || '',
            created_at: formatDateSafe(r.created_at)
        }));

        const result = await generateSpreadsheet({
            format,
            sheetName: 'Fleet Devices',
            columns,
            rows: formattedRows
        });

        const filename = singleId 
            ? `company_device_${singleId}_export.${result.extension}` 
            : `company_devices_export.${result.extension}`;

        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(result.data);
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Export Company Repair Tickets ──────────────────────────────────────

const exportCompanyRepairsCsv = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const target = await resolveTargetCompanyId(req, connection);
        if (target.error) return res.status(target.status).json(formatResponse(false, target.error));
        const targetCompanyId = target.companyId;

        const format = (req.query.format || 'csv').toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
        const singleId = req.query.id ? parseInt(req.query.id, 10) : null;
        const search = req.query.search ? req.query.search.trim() : '';
        const status = req.query.status || '';
        const priorityFilter = req.query.priority || '';

        let query = `
            SELECT sr.id, sr.ticket_number, sr.brand, sr.model_number, sr.serial_number,
                   sr.device_category, sr.problem_type, sr.problem_description, sr.status,
                   sr.priority, sr.service_type, sr.repair_cost, sr.payment_status, sr.sla_deadline, sr.created_at,
                   e.name as employee_name, tech.name as technician_name, b.name as branch_name
            FROM service_requests sr
            LEFT JOIN company_employees e ON sr.employee_id = e.id
            LEFT JOIN company_branches b ON e.branch_id = b.id
            LEFT JOIN users tech ON sr.assigned_technician_id = tech.id
            WHERE sr.company_id = ?
        `;
        const params = [targetCompanyId];

        if (singleId) {
            query += ' AND sr.id = ?';
            params.push(singleId);
        }

        if (status) {
            query += ' AND sr.status = ?';
            params.push(status);
        }

        if (priorityFilter) {
            query += ' AND sr.priority = ?';
            params.push(priorityFilter);
        }

        if (search) {
            query += ' AND (sr.ticket_number LIKE ? OR sr.serial_number LIKE ? OR sr.brand LIKE ? OR sr.model_number LIKE ? OR sr.problem_description LIKE ? OR e.name LIKE ?)';
            const sp = `%${search}%`;
            params.push(sp, sp, sp, sp, sp, sp);
        }

        query += ' ORDER BY sr.created_at DESC';

        const [rows] = await connection.query(query, params);

        const columns = [
            { header: 'Ticket Number', key: 'ticket_number', width: 20, isText: true },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Priority', key: 'priority', width: 14 },
            { header: 'Device Category', key: 'device_category', width: 18 },
            { header: 'Brand', key: 'brand', width: 16 },
            { header: 'Model', key: 'model_number', width: 20 },
            { header: 'Serial Number', key: 'serial_number', width: 22, isText: true },
            { header: 'Problem Type', key: 'problem_type', width: 18 },
            { header: 'Problem Description', key: 'problem_description', width: 38 },
            { header: 'Service Type', key: 'service_type', width: 22 },
            { header: 'Assigned Staff', key: 'employee_name', width: 22 },
            { header: 'Branch', key: 'branch_name', width: 20 },
            { header: 'Technician', key: 'technician_name', width: 20 },
            { header: 'Repair Cost (INR)', key: 'repair_cost', width: 18 },
            { header: 'Payment Status', key: 'payment_status', width: 16 },
            { header: 'SLA Deadline', key: 'sla_deadline', width: 20 },
            { header: 'Submitted Date', key: 'created_at', width: 20 }
        ];

        const formattedRows = rows.map(r => ({
            ticket_number: r.ticket_number || '',
            status: r.status ? (r.status.charAt(0).toUpperCase() + r.status.slice(1).replace('_', ' ')) : 'Pending',
            priority: r.priority || 'Standard',
            device_category: r.device_category || 'Laptop',
            brand: r.brand || '',
            model_number: r.model_number || '',
            serial_number: r.serial_number || '',
            problem_type: r.problem_type || 'Hardware',
            problem_description: r.problem_description || '',
            service_type: r.service_type || 'Bring to Service Center',
            employee_name: r.employee_name || 'Unassigned',
            branch_name: r.branch_name || 'Main Office',
            technician_name: r.technician_name || 'Unassigned',
            repair_cost: r.repair_cost ? Number(r.repair_cost).toFixed(2) : '0.00',
            payment_status: r.payment_status ? (r.payment_status.charAt(0).toUpperCase() + r.payment_status.slice(1)) : 'Unpaid',
            sla_deadline: formatDateSafe(r.sla_deadline),
            created_at: formatDateSafe(r.created_at)
        }));

        const result = await generateSpreadsheet({
            format,
            sheetName: 'Repair Tickets',
            columns,
            rows: formattedRows
        });

        const filename = singleId 
            ? `company_repair_ticket_${singleId}_export.${result.extension}` 
            : `company_repairs_export.${result.extension}`;

        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(result.data);
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
        return res.status(400).json(formatResponse(false, 'No spreadsheet file uploaded. Please upload a .csv or .xlsx file.'));
    }

    const filePath = req.file.path;
    let connection;
    try {
        const parsed = await parseSpreadsheet(filePath, req.file.originalname);

        if (!parsed.data || parsed.data.length === 0) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json(formatResponse(false, 'Uploaded file is empty or missing data rows.'));
        }

        if (parsed.data.length > 500) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json(formatResponse(false, 'File exceeds maximum limit of 500 rows per upload batch.'));
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
        const seenInFileEmails = new Map();

        for (let idx = 0; idx < parsed.data.length; idx++) {
            const rowNumber = idx + 2;
            const row = parsed.data[idx];

            const name = (row.name || row.employee_name || row.full_name || '').trim();
            const email = (row.email || row.employee_email || row.email_address || '').trim();
            const phone = (row.phone || row.mobile || row.phone_number || '').trim();
            const department = (row.department || row.dept || '').trim();
            const designation = (row.designation || row.role || row.position || row.title || 'Staff').trim();
            const branchRaw = (row.branch || row.branch_name || row.branch_id || '').trim();
            const statusRaw = (row.status || row.is_active || 'active').trim().toLowerCase();

            if (!name) {
                errors.push({ row: rowNumber, field: 'name', error: 'Missing required employee name.', suggestion: 'Provide employee full name.' });
                continue;
            }

            if (!email) {
                errors.push({ row: rowNumber, field: 'email', error: `Row "${name}" is missing required email.`, suggestion: 'Provide employee work email.' });
                continue;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                errors.push({ row: rowNumber, field: 'email', error: `Invalid email format "${email}" for ${name}.`, suggestion: 'Provide a valid email (e.g. name@company.in).' });
                continue;
            }

            // In-file duplicate checking
            const cleanEmailKey = email.toLowerCase();
            if (seenInFileEmails.has(cleanEmailKey)) {
                const prevRow = seenInFileEmails.get(cleanEmailKey);
                errors.push({ row: rowNumber, field: 'email', error: `Duplicate email "${email}" found in this file (already defined at row ${prevRow}).`, suggestion: 'Ensure each employee row has a unique email address.' });
                continue;
            }
            seenInFileEmails.set(cleanEmailKey, rowNumber);

            // Validate branch reference (DO NOT auto-create phantom branches!)
            let resolvedBranchId = null;
            if (branchRaw) {
                const cleanBranchKey = branchRaw.toLowerCase();
                if (branchMap.has(cleanBranchKey)) {
                    resolvedBranchId = branchMap.get(cleanBranchKey);
                } else {
                    errors.push({
                        row: rowNumber,
                        field: 'branch',
                        error: `Branch "${branchRaw}" does not exist in your company branches.`,
                        suggestion: 'Create the branch under Branches first or leave empty.'
                    });
                    continue;
                }
            }

            // Status handling
            const isActive = !(statusRaw === 'inactive' || statusRaw === '0' || statusRaw === 'false');

            if (existingEmpMap.has(cleanEmailKey)) {
                const existingId = existingEmpMap.get(cleanEmailKey);
                await connection.query(
                    `UPDATE company_employees 
                     SET name = ?, phone = COALESCE(NULLIF(?, ''), phone),
                         department = COALESCE(NULLIF(?, ''), department),
                         designation = COALESCE(NULLIF(?, ''), designation),
                         branch_id = COALESCE(?, branch_id),
                         is_active = ?,
                         status = ?
                     WHERE id = ? AND company_id = ?`,
                    [name, phone, department, designation, resolvedBranchId, isActive ? 1 : 0, isActive ? 'active' : 'inactive', existingId, targetCompanyId]
                );
                updatedCount++;
                duplicates.push({ row: rowNumber, email, name, action: 'Updated existing record' });
            } else {
                const [insertRes] = await connection.query(
                    `INSERT INTO company_employees 
                     (company_id, branch_id, name, email, phone, department, designation, is_active, status) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [targetCompanyId, resolvedBranchId, name, email, phone || null, department || null, designation || null, isActive ? 1 : 0, isActive ? 'active' : 'inactive']
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

        const format = (req.query.format || 'csv').toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
        const search = req.query.search ? req.query.search.trim() : '';
        const status = req.query.status || '';
        const branchFilter = req.query.branch || '';
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

        if (branchFilter) {
            if (/^\d+$/.test(branchFilter)) {
                query += ' AND e.branch_id = ?';
                params.push(parseInt(branchFilter, 10));
            } else {
                query += ' AND b.name LIKE ?';
                params.push(`%${branchFilter}%`);
            }
        }

        if (search) {
            query += ' AND (e.name LIKE ? OR e.email LIKE ? OR e.phone LIKE ? OR e.department LIKE ? OR e.designation LIKE ? OR b.name LIKE ?)';
            const sp = `%${search}%`;
            params.push(sp, sp, sp, sp, sp, sp);
        }

        query += ' ORDER BY e.name ASC';

        const [rows] = await connection.query(query, params);

        const columns = [
            { header: 'Full Name', key: 'name', width: 25 },
            { header: 'Email Address', key: 'email', width: 32 },
            { header: 'Phone', key: 'phone', width: 20, isText: true },
            { header: 'Department', key: 'department', width: 22 },
            { header: 'Designation', key: 'designation', width: 25 },
            { header: 'Branch', key: 'branch_name', width: 22 },
            { header: 'Status', key: 'status', width: 14 },
            { header: 'Assigned Devices', key: 'assigned_devices', width: 18 },
            { header: 'Total Repair Tickets', key: 'total_repairs', width: 20 },
            { header: 'Registered Date', key: 'created_at', width: 16 }
        ];

        const formattedRows = rows.map(r => ({
            name: r.name || '',
            email: r.email || '',
            phone: r.phone || '',
            department: r.department || '',
            designation: r.designation || 'Staff',
            branch_name: r.branch_name || 'Main Office',
            status: r.is_active ? 'Active' : 'Inactive',
            assigned_devices: r.assigned_devices || 0,
            total_repairs: r.total_repairs || 0,
            created_at: formatDateSafe(r.created_at)
        }));

        const result = await generateSpreadsheet({
            format,
            sheetName: 'Employees',
            columns,
            rows: formattedRows
        });

        const filename = singleId 
            ? `company_employee_${singleId}_export.${result.extension}` 
            : `company_employees_export.${result.extension}`;

        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(result.data);
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Bulk Branch Import & Export ───────────────────────────────────────

const importBulkBranches = async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json(formatResponse(false, 'No spreadsheet file uploaded. Please upload a .csv or .xlsx file.'));
    }

    const filePath = req.file.path;
    let connection;
    try {
        const parsed = await parseSpreadsheet(filePath, req.file.originalname);

        if (!parsed.data || parsed.data.length === 0) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json(formatResponse(false, 'Uploaded file is empty or missing data rows.'));
        }

        if (parsed.data.length > 500) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json(formatResponse(false, 'File exceeds maximum limit of 500 rows per upload batch.'));
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
        const seenInFileBranches = new Map();

        for (let idx = 0; idx < parsed.data.length; idx++) {
            const rowNumber = idx + 2;
            const row = parsed.data[idx];

            const name = (row.name || row.branch_name || row.branch || '').trim();
            const address = (row.address || row.branch_address || row.location || row.office_address || '').trim();
            const phone = (row.phone || row.phone_number || row.contact_number || '').trim();
            const statusRaw = (row.status || row.is_active || 'active').trim().toLowerCase();

            if (!name) {
                errors.push({ row: rowNumber, field: 'name', error: 'Missing required branch name.', suggestion: 'Provide branch title (e.g. Bangalore HQ).' });
                continue;
            }

            if (!address) {
                errors.push({ row: rowNumber, field: 'address', error: `Branch "${name}" is missing required address.`, suggestion: 'Provide full branch address.' });
                continue;
            }

            // In-file duplicate checking
            const cleanNameKey = name.toLowerCase();
            if (seenInFileBranches.has(cleanNameKey)) {
                const prevRow = seenInFileBranches.get(cleanNameKey);
                errors.push({ row: rowNumber, field: 'name', error: `Duplicate branch name "${name}" found in this file (already defined at row ${prevRow}).`, suggestion: 'Ensure each branch row has a unique branch name.' });
                continue;
            }
            seenInFileBranches.set(cleanNameKey, rowNumber);

            const isActive = !(statusRaw === 'inactive' || statusRaw === '0' || statusRaw === 'false');

            if (existingBranchMap.has(cleanNameKey)) {
                const existingId = existingBranchMap.get(cleanNameKey);
                await connection.query(
                    `UPDATE company_branches 
                     SET address = COALESCE(NULLIF(?, ''), address),
                         phone = COALESCE(NULLIF(?, ''), phone),
                         is_active = ?,
                         status = ?
                     WHERE id = ? AND company_id = ?`,
                    [address, phone, isActive ? 1 : 0, isActive ? 'active' : 'inactive', existingId, targetCompanyId]
                );
                updatedCount++;
                duplicates.push({ row: rowNumber, name, action: 'Updated existing record' });
            } else {
                const [insertRes] = await connection.query(
                    'INSERT INTO company_branches (company_id, name, address, phone, is_active, status) VALUES (?, ?, ?, ?, ?, ?)',
                    [targetCompanyId, name, address, phone || null, isActive ? 1 : 0, isActive ? 'active' : 'inactive']
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

        const format = (req.query.format || 'csv').toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
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

        const columns = [
            { header: 'Branch Name', key: 'name', width: 25 },
            { header: 'Office Address', key: 'address', width: 45 },
            { header: 'Phone', key: 'phone', width: 20, isText: true },
            { header: 'Status', key: 'status', width: 14 },
            { header: 'Total Assigned Staff', key: 'staff_count', width: 20 },
            { header: 'Total Fleet Devices', key: 'device_count', width: 20 },
            { header: 'Created Date', key: 'created_at', width: 16 }
        ];

        const formattedRows = rows.map(r => ({
            name: r.name || '',
            address: r.address || '',
            phone: r.phone || '',
            status: r.is_active ? 'Active' : 'Inactive',
            staff_count: r.staff_count || 0,
            device_count: r.device_count || 0,
            created_at: formatDateSafe(r.created_at)
        }));

        const result = await generateSpreadsheet({
            format,
            sheetName: 'Branches',
            columns,
            rows: formattedRows
        });

        const filename = singleId 
            ? `company_branch_${singleId}_export.${result.extension}` 
            : `company_branches_export.${result.extension}`;

        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(result.data);
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// ── Download Standard Company Template (CSV or Excel) ─────────────────

const COMPANY_MODULE_TEMPLATES = {
    branches: {
        sheetName: 'Branches',
        filenamePrefix: 'company_branches_template',
        columns: [
            { header: 'Branch Name', key: 'name', width: 25 },
            { header: 'Address', key: 'address', width: 45 },
            { header: 'Phone', key: 'phone', width: 20, isText: true },
            { header: 'Status', key: 'status', width: 15 }
        ],
        sampleRows: [
            {
                name: 'Bengaluru HQ',
                address: '102 Koramangala 4th Block, Bengaluru, Karnataka 560034',
                phone: '+91 80 2553 1234',
                status: 'Active'
            },
            {
                name: 'Mumbai Tech Hub',
                address: 'Plot C-59, G Block, BKC, Bandra East, Mumbai, Maharashtra 400051',
                phone: '+91 22 6678 4321',
                status: 'Active'
            },
            {
                name: 'Delhi Regional Office',
                address: '14 Barakhamba Road, Connaught Place, New Delhi, Delhi 110001',
                phone: '+91 11 4152 7890',
                status: 'Active'
            }
        ],
        instructions: {
            fields: [
                { name: 'Branch Name', required: true, rules: 'Unique branch name for the company (2-100 chars). Used to match records on update.', example: 'Bengaluru HQ' },
                { name: 'Address', required: true, rules: 'Full physical office address.', example: '102 Koramangala, Bengaluru 560034' },
                { name: 'Phone', required: false, rules: 'Valid contact phone number with STD/country code.', example: '+91 80 2553 1234' },
                { name: 'Status', required: false, rules: 'Active or Inactive (defaults to Active).', example: 'Active' }
            ]
        }
    },
    employees: {
        sheetName: 'Employees',
        filenamePrefix: 'company_employees_template',
        columns: [
            { header: 'Full Name', key: 'name', width: 25 },
            { header: 'Email Address', key: 'email', width: 32 },
            { header: 'Phone', key: 'phone', width: 20, isText: true },
            { header: 'Department', key: 'department', width: 22 },
            { header: 'Designation', key: 'designation', width: 25 },
            { header: 'Branch', key: 'branch', width: 25 },
            { header: 'Status', key: 'status', width: 15 }
        ],
        sampleRows: [
            {
                name: 'Aarav Sharma',
                email: 'aarav.sharma@enterprise.in',
                phone: '+91 98765 43210',
                department: 'Information Technology',
                designation: 'Senior Lead Engineer',
                branch: 'Bengaluru HQ',
                status: 'Active'
            },
            {
                name: 'Priya Patel',
                email: 'priya.patel@enterprise.in',
                phone: '+91 98765 43211',
                department: 'Finance & Accounts',
                designation: 'Finance Manager',
                branch: 'Mumbai Tech Hub',
                status: 'Active'
            },
            {
                name: 'Rajesh Kumar',
                email: 'rajesh.kumar@enterprise.in',
                phone: '+91 98765 43212',
                department: 'Operations',
                designation: 'Operations Executive',
                branch: 'Delhi Regional Office',
                status: 'Active'
            }
        ],
        instructions: {
            fields: [
                { name: 'Full Name', required: true, rules: 'Full employee legal name (2-100 chars).', example: 'Aarav Sharma' },
                { name: 'Email Address', required: true, rules: 'Unique official work email. Used as primary key for updates.', example: 'aarav.sharma@enterprise.in' },
                { name: 'Phone', required: false, rules: 'Mobile or direct phone number.', example: '+91 98765 43210' },
                { name: 'Department', required: false, rules: 'Department or business unit.', example: 'Information Technology' },
                { name: 'Designation', required: false, rules: 'Job title or role.', example: 'Senior Lead Engineer' },
                { name: 'Branch', required: false, rules: 'Must match an existing Branch Name in your company. Cannot create branches automatically.', example: 'Bengaluru HQ' },
                { name: 'Status', required: false, rules: 'Active or Inactive (defaults to Active).', example: 'Active' }
            ]
        }
    },
    devices: {
        sheetName: 'Devices',
        filenamePrefix: 'company_devices_template',
        columns: [
            { header: 'Serial Number', key: 'serial_number', width: 24, isText: true },
            { header: 'Brand', key: 'brand', width: 18 },
            { header: 'Model Number', key: 'model_number', width: 24 },
            { header: 'Category', key: 'device_category', width: 18 },
            { header: 'Asset Tag', key: 'asset_id', width: 20, isText: true },
            { header: 'Branch', key: 'branch', width: 25 },
            { header: 'Assigned Employee Email', key: 'assigned_employee', width: 32 },
            { header: 'Purchase Date', key: 'purchase_date', width: 18 },
            { header: 'Warranty Expiry', key: 'warranty_expiry', width: 18 },
            { header: 'AMC Covered', key: 'is_amc', width: 16 },
            { header: 'AMC Tag', key: 'amc_tag', width: 20, isText: true },
            { header: 'Status', key: 'status', width: 16 },
            { header: 'Notes', key: 'notes', width: 35 }
        ],
        sampleRows: [
            {
                serial_number: 'DL5420-98721',
                brand: 'Dell',
                model_number: 'Latitude 5420',
                device_category: 'Laptop',
                asset_id: 'AST-100291',
                branch: 'Bengaluru HQ',
                assigned_employee: 'aarav.sharma@enterprise.in',
                purchase_date: '2024-01-15',
                warranty_expiry: '2027-01-15',
                is_amc: 'Yes',
                amc_tag: 'TD-AMC-001',
                status: 'Active',
                notes: 'Primary development laptop'
            },
            {
                serial_number: 'C02F12345678',
                brand: 'Apple',
                model_number: 'MacBook Pro 14 M3',
                device_category: 'Laptop',
                asset_id: 'AST-100292',
                branch: 'Mumbai Tech Hub',
                assigned_employee: 'priya.patel@enterprise.in',
                purchase_date: '2024-02-10',
                warranty_expiry: '2027-02-10',
                is_amc: 'No',
                amc_tag: '',
                status: 'Active',
                notes: 'Finance team workstation'
            },
            {
                serial_number: 'HP-EB840-3321',
                brand: 'HP',
                model_number: 'EliteBook 840 G9',
                device_category: 'Laptop',
                asset_id: 'AST-100293',
                branch: 'Delhi Regional Office',
                assigned_employee: 'rajesh.kumar@enterprise.in',
                purchase_date: '2023-11-20',
                warranty_expiry: '2026-11-20',
                is_amc: 'Yes',
                amc_tag: 'TD-AMC-002',
                status: 'Active',
                notes: 'Regional operations laptop'
            }
        ],
        instructions: {
            fields: [
                { name: 'Serial Number', required: true, rules: 'Unique hardware serial number. Primary identifier for updates.', example: 'DL5420-98721' },
                { name: 'Brand', required: true, rules: 'Hardware manufacturer.', example: 'Dell' },
                { name: 'Model Number', required: true, rules: 'Device model name or number.', example: 'Latitude 5420' },
                { name: 'Category', required: false, rules: 'Laptop, Desktop, Smartphone, Tablet, Server, etc. (defaults to Laptop).', example: 'Laptop' },
                { name: 'Asset Tag', required: false, rules: 'Internal company asset ID (auto-generated if blank).', example: 'AST-100291' },
                { name: 'Branch', required: false, rules: 'Must match an existing Branch Name in your company.', example: 'Bengaluru HQ' },
                { name: 'Assigned Employee Email', required: false, rules: 'Must match an existing employee email in your company staff directory.', example: 'aarav.sharma@enterprise.in' },
                { name: 'Purchase Date', required: false, rules: 'Format YYYY-MM-DD or DD/MM/YYYY.', example: '2024-01-15' },
                { name: 'Warranty Expiry', required: false, rules: 'Format YYYY-MM-DD or DD/MM/YYYY.', example: '2027-01-15' },
                { name: 'AMC Covered', required: false, rules: 'Yes / No (or True / False / 1 / 0).', example: 'Yes' },
                { name: 'AMC Tag', required: false, rules: 'Optional AMC contract reference tag.', example: 'TD-AMC-001' },
                { name: 'Status', required: false, rules: 'Active or Decommissioned (defaults to Active).', example: 'Active' },
                { name: 'Notes', required: false, rules: 'Any notes or device remarks.', example: 'Primary development laptop' }
            ]
        }
    },
    repairs: {
        sheetName: 'RepairTickets',
        filenamePrefix: 'company_repairs_template',
        columns: [
            { header: 'Device Serial', key: 'device_serial', width: 24, isText: true },
            { header: 'Problem Description', key: 'problem_description', width: 45 },
            { header: 'Problem Type', key: 'problem_type', width: 20 },
            { header: 'Priority', key: 'priority', width: 16 },
            { header: 'Service Type', key: 'service_type', width: 25 },
            { header: 'Employee Email', key: 'employee_email', width: 32 }
        ],
        sampleRows: [
            {
                device_serial: 'DL5420-98721',
                problem_description: 'Screen flickering intermittently during heavy load and display goes blank.',
                problem_type: 'Hardware',
                priority: 'Standard',
                service_type: 'Bring to Service Center',
                employee_email: 'aarav.sharma@enterprise.in'
            },
            {
                device_serial: 'C02F12345678',
                problem_description: 'Battery health degraded, system shuts down unexpectedly after 20 minutes.',
                problem_type: 'Battery',
                priority: 'Urgent',
                service_type: 'Onsite Visit',
                employee_email: 'priya.patel@enterprise.in'
            },
            {
                device_serial: 'HP-EB840-3321',
                problem_description: 'Operating system fails to boot into Windows after recent system update.',
                problem_type: 'Software',
                priority: 'Standard',
                service_type: 'Bring to Service Center',
                employee_email: 'rajesh.kumar@enterprise.in'
            }
        ],
        instructions: {
            fields: [
                { name: 'Device Serial', required: true, rules: 'Must match an existing registered, active device in your fleet.', example: 'DL5420-98721' },
                { name: 'Problem Description', required: true, rules: 'Minimum 10 characters describing the defect or symptom.', example: 'Screen flickering intermittently' },
                { name: 'Problem Type', required: false, rules: 'Hardware, Software, Screen Damage, Battery, Power, Network, etc. (defaults to Hardware).', example: 'Hardware' },
                { name: 'Priority', required: false, rules: 'Standard or Urgent (defaults to Standard).', example: 'Standard' },
                { name: 'Service Type', required: false, rules: 'Bring to Service Center, Onsite Visit, or Pickup & Delivery.', example: 'Bring to Service Center' },
                { name: 'Employee Email', required: false, rules: 'Optional employee email who reported or holds the device. Must exist in company staff if provided.', example: 'aarav.sharma@enterprise.in' }
            ]
        }
    }
};

const downloadCompanyTemplate = async (req, res, next) => {
    try {
        const moduleKey = (req.params.module || '').toLowerCase();
        const templateConfig = COMPANY_MODULE_TEMPLATES[moduleKey];

        if (!templateConfig) {
            return res.status(400).json(formatResponse(false, `Invalid template module "${req.params.module}". Allowed modules: branches, employees, devices, repairs.`));
        }

        const format = (req.query.format || 'csv').toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
        const includeSamples = req.query.samples !== 'false';
        const rows = includeSamples ? templateConfig.sampleRows : [];

        const result = await generateSpreadsheet({
            format,
            sheetName: templateConfig.sheetName,
            columns: templateConfig.columns,
            rows,
            instructions: templateConfig.instructions
        });

        const filename = `${templateConfig.filenamePrefix}.${result.extension}`;
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(result.data);
    } catch (error) {
        next(error);
    }
};

// Aliases for cleaner naming
const exportCompanyBranches = exportCompanyBranchesCsv;
const exportCompanyEmployees = exportCompanyEmployeesCsv;
const exportCompanyDevices = exportCompanyDevicesCsv;
const exportCompanyRepairs = exportCompanyRepairsCsv;

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
    exportCompanyBranches,
    exportCompanyEmployees,
    exportCompanyDevices,
    exportCompanyRepairs,
    downloadCompanyTemplate,
    getActivityLogs
};

