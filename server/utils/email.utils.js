const nodemailer = require('nodemailer');
const logger = require('./logger');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Send an email notification to the admin
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML formatted email body
 */
const sendAdminNotification = async (subject, htmlContent) => {
    try {
        const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;

        if (!adminEmail || !process.env.EMAIL_USER || !process.env.EMAIL_PASS || process.env.EMAIL_USER === 'your-email@gmail.com') {
            logger.warn('Email credentials not fully configured in .env. Skipping email notification.');
            return false;
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: adminEmail,
            subject: subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        logger.info(`Email notification sent: ${info.messageId}`);
        return true;
    } catch (error) {
        logger.error(`Error sending email: ${error.message}`);
        return false;
    }
};

/**
 * Send an email notification to the customer
 * @param {string} toEmail - Customer email address
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML formatted email body
 */
const sendCustomerNotification = async (toEmail, subject, htmlContent) => {
    try {
        if (!toEmail) return false;

        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || process.env.EMAIL_USER === 'your-email@gmail.com') {
            logger.warn('Email credentials not fully configured in .env. Skipping customer email notification.');
            return false;
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: toEmail,
            subject: subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        logger.info(`Customer notification sent to ${toEmail}: ${info.messageId}`);
        return true;
    } catch (error) {
        logger.error(`Error sending customer email: ${error.message}`);
        return false;
    }
};

module.exports = { sendAdminNotification, sendCustomerNotification };
