const nodemailer = require('nodemailer');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const logger = require('./logger');
const { decryptSecret } = require('./crypto.utils');

/**
 * Redact sensitive credentials or tokens from error messages before logging
 */
const sanitizeErrorMessage = (msg) => {
    if (!msg) return 'Unknown email error';
    const text = typeof msg === 'string' ? msg : (msg.message || String(msg));
    return text
        .replace(/(auth|pass|password|token)[=:\s]+[^\s,;&]+/gi, '$1=[REDACTED]')
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, (match) => {
            const parts = match.split('@');
            return `${parts[0].slice(0, 2)}***@${parts[1]}`;
        });
};

/**
 * Resolves TLS certificate validation settings for SMTP connections.
 * Enforces strict certificate validation in production and external SMTP hosts,
 * while maintaining compatibility for local development environments and configuration overrides.
 *
 * @param {string} host - Target SMTP host
 * @returns {{ rejectUnauthorized: boolean }}
 */
const resolveTlsConfig = (host) => {
    // 1. Explicit configuration override takes precedence
    if (config.email && config.email.smtpRejectUnauthorized !== null && config.email.smtpRejectUnauthorized !== undefined) {
        return { rejectUnauthorized: Boolean(config.email.smtpRejectUnauthorized) };
    }
    if (process.env.SMTP_REJECT_UNAUTHORIZED !== undefined) {
        return { rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === 'true' || process.env.SMTP_REJECT_UNAUTHORIZED === '1' };
    }

    // 2. Production: strictly validate TLS certificates
    if (config.isProduction) {
        return { rejectUnauthorized: true };
    }

    // 3. Non-production (development / test): local loopback or local testing allows compatible validation
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (isLocalHost || config.env === 'development' || config.env === 'test') {
        return { rejectUnauthorized: false };
    }

    return { rejectUnauthorized: true };
};

/**
 * Dynamically resolves SMTP configuration from:
 * 1. `site_settings` database (Admin Dashboard > Email Settings)
 * 2. Standard SMTP environment variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD)
 * 3. Direct Gmail service fallback (EMAIL_USER, EMAIL_PASS)
 *
 * @returns {Promise<{ transporter: any, fromHeader: string, adminEmail: string, isConfigured: boolean, source: string }>}
 */
const getEmailConfig = async () => {
    // ── Tier 1: Database-configured custom SMTP (Admin Dashboard) ──
    try {
        const [rows] = await pool.query(
            "SELECT setting_key, setting_value FROM site_settings WHERE setting_group = 'email' OR setting_key IN ('smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'from_email', 'from_name', 'admin_email', 'company_email')"
        );
        const settings = {};
        rows.forEach(r => {
            if (r.setting_value !== null && r.setting_value !== undefined) {
                settings[r.setting_key] = String(r.setting_value).trim();
            }
        });

        if (settings.smtp_host && settings.smtp_port && settings.smtp_user && settings.smtp_password) {
            let decryptedPass = settings.smtp_password;
            try {
                decryptedPass = decryptSecret(settings.smtp_password);
            } catch (decErr) {
                logger.error('[EmailConfig] Failed to decrypt stored SMTP password: ' + decErr.message);
                decryptedPass = '';
            }

            if (!decryptedPass) {
                logger.warn('[EmailConfig] SMTP password could not be decrypted or is empty. Falling back to environment configuration.');
            } else {
                const port = parseInt(settings.smtp_port, 10);
                const isSecure = port === 465;

                const transporter = nodemailer.createTransport({
                    host: settings.smtp_host,
                    port: port,
                    secure: isSecure,
                    auth: {
                        user: settings.smtp_user,
                        pass: decryptedPass
                    },
                    connectionTimeout: 10000,
                    greetingTimeout: 10000,
                    socketTimeout: 15000,
                    tls: resolveTlsConfig(settings.smtp_host)
                });

                const fromHeader = `"${settings.from_name || 'TekDoctor'}" <${settings.from_email || settings.smtp_user}>`;
                const adminEmail = settings.admin_email || config.email.adminEmail || settings.from_email || settings.smtp_user;

                return { transporter, fromHeader, adminEmail, isConfigured: true, source: 'database_smtp' };
            }
        }
    } catch (dbErr) {
        logger.debug(`Could not read SMTP settings from DB: ${dbErr.message}`);
    }

    // ── Tier 2: Standard SMTP from Environment Variables ──
    if (config.email.smtpHost && config.email.smtpUser && config.email.smtpPassword) {
        const port = config.email.smtpPort;
        const isSecure = config.email.smtpSecure;

        const transporter = nodemailer.createTransport({
            host: config.email.smtpHost,
            port: port,
            secure: isSecure,
            auth: {
                user: config.email.smtpUser,
                pass: config.email.smtpPassword
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
            tls: resolveTlsConfig(config.email.smtpHost)
        });

        const fromHeader = `"${config.email.fromName}" <${config.email.fromEmail || config.email.smtpUser}>`;
        const adminEmail = config.email.adminEmail || config.email.smtpUser;

        return { transporter, fromHeader, adminEmail, isConfigured: true, source: 'env_smtp' };
    }

    // ── Tier 3: Gmail Service from Environment Variables (EMAIL_USER / EMAIL_PASS) ──
    const emailUser = config.email.user;
    const emailPass = config.email.pass;
    const placeholderEmails = ['your-email@gmail.com', 'your@gmail.com', 'admin@example.com', ''];

    if (emailUser && emailPass && !placeholderEmails.includes(emailUser.toLowerCase())) {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: emailUser,
                pass: emailPass
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000
        });

        const fromHeader = `"${config.email.fromName}" <${emailUser}>`;
        const adminEmail = config.email.adminEmail || emailUser;

        return { transporter, fromHeader, adminEmail, isConfigured: true, source: 'env_gmail' };
    }

    // ── No valid SMTP configuration resolved ──
    return {
        transporter: null,
        fromHeader: `"TekDoctor" <noreply@tekdoctor.in>`,
        adminEmail: config.email.adminEmail || null,
        isConfigured: false,
        source: 'none'
    };
};

/**
 * Send an email notification to the admin
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML formatted email body
 * @returns {Promise<boolean>}
 */
const sendAdminNotification = async (subject, htmlContent) => {
    try {
        const { transporter, fromHeader, adminEmail, isConfigured, source } = await getEmailConfig();

        if (!isConfigured || !transporter || !adminEmail) {
            if (config.env === 'development' || config.env === 'test') {
                logger.info(`[DEV EMAIL SIMULATION] Admin email not sent (no SMTP configured). Subject: "${subject}"`);
                return true;
            }
            logger.warn('Email credentials not configured in DB or .env. Skipping admin email notification.');
            return false;
        }

        const mailOptions = {
            from: fromHeader,
            to: adminEmail,
            subject: subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        logger.info(`Admin email notification sent via [${source}]: ${info.messageId}`);
        return true;
    } catch (error) {
        logger.error(`Error sending admin email: ${sanitizeErrorMessage(error.message)}`);
        return false;
    }
};

/**
 * Send an email notification to a customer or user
 * @param {string} toEmail - Customer email address
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML formatted email body
 * @returns {Promise<boolean>}
 */
const sendCustomerNotification = async (toEmail, subject, htmlContent) => {
    try {
        if (!toEmail) {
            logger.warn('sendCustomerNotification called without toEmail');
            return false;
        }

        const { transporter, fromHeader, isConfigured, source } = await getEmailConfig();

        if (!isConfigured || !transporter) {
            if (config.env === 'development' || config.env === 'test') {
                logger.info(`[DEV EMAIL SIMULATION] Email to ${toEmail} not sent (no SMTP configured). Subject: "${subject}".`);
                return true;
            }
            logger.error(`[EMAIL DELIVERY FAILURE] Email credentials not configured in DB or .env. Cannot deliver email to ${toEmail}.`);
            return false;
        }

        const mailOptions = {
            from: fromHeader,
            to: toEmail,
            subject: subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        logger.info(`Customer notification sent to ${toEmail} via [${source}]: ${info.messageId}`);
        return true;
    } catch (error) {
        logger.error(`Error sending customer email to ${toEmail}: ${sanitizeErrorMessage(error.message)}`);
        return false;
    }
};

/**
 * Send an OTP code verification email using the branded TekDoctor template.
 * @param {Object} options
 * @param {string} options.toEmail - Recipient email address
 * @param {string} options.otpCode - 6-digit numeric OTP
 * @param {'login'|'password_reset'} [options.purpose='login']
 * @param {number} [options.expiresInMinutes=5]
 * @returns {Promise<boolean>}
 */
const sendOtpEmail = async ({ toEmail, otpCode, purpose = 'login', expiresInMinutes = 5 }) => {
    const isLogin = purpose === 'login';
    const isChangePassword = purpose === 'change_password' || purpose === 'password_change';
    const subject = isLogin 
        ? 'TekDoctor Admin — Login Verification Code' 
        : isChangePassword
        ? 'TekDoctor Admin — Password Change Verification Code'
        : 'TekDoctor Admin — Password Reset Code';
    const titleText = isLogin 
        ? 'Admin Login Verification' 
        : isChangePassword 
        ? 'Admin Password Change Verification' 
        : 'Admin Password Reset';
    const actionDesc = isLogin 
        ? 'Use the verification code below to complete your administrative login.'
        : isChangePassword
        ? 'Use the verification code below to confirm changing your administrator password.'
        : 'Use the verification code below to proceed with resetting your administrator password.';

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; background-color: #050508; color: #f4f4f5; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; padding: 36px 28px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.5px; color: #ffffff;">TEK<span style="color: #00e5ff;">DOCTOR</span></span>
        </div>
        <h2 style="font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px;">${titleText}</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 20px;">${actionDesc}</p>
        <div style="margin: 28px 0; background: #0e0e14; border: 1px solid #1f1f28; border-radius: 12px; padding: 24px; text-align: center;">
          <div style="font-size: 11px; font-family: monospace; text-transform: uppercase; letter-spacing: 2px; color: #71717a; margin-bottom: 8px;">One-Time Verification Code</div>
          <div style="font-size: 36px; font-family: monospace; font-weight: 800; letter-spacing: 8px; color: #00e5ff;">${otpCode}</div>
          <div style="font-size: 12px; color: #a1a1aa; margin-top: 12px;">Valid for <strong>${expiresInMinutes} minutes</strong>. Single-use only.</div>
        </div>
        <p style="font-size: 12px; color: #71717a; line-height: 1.6; margin-bottom: 24px;">
          If you did not initiate this administrator request, your password may be compromised. Please investigate immediate session activity.
        </p>
        <hr style="border: 0; border-top: 1px solid #27272a; margin: 24px 0;" />
        <p style="font-size: 11px; color: #52525b; line-height: 1.5; margin: 0;">TekDoctor Security Systems • Automated Notification • Do not reply to this email.</p>
      </div>
    `;

    return sendCustomerNotification(toEmail, subject, htmlContent);
};

module.exports = {
    sendAdminNotification,
    sendCustomerNotification,
    sendOtpEmail,
    getEmailConfig,
    resolveTlsConfig,
    sanitizeErrorMessage
};
