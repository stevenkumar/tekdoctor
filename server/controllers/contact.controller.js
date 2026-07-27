const { pool } = require('../config/db.config');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const { sendAdminNotification } = require('../utils/email.utils');

/**
 * Submit contact form details
 */
const submitContactForm = async (req, res, next) => {
  const { name, email, phone, message } = req.body;
  let connection;

  try {
    connection = await pool.getConnection();

    const [result] = await connection.query(
      'INSERT INTO contacts (name, email, phone, message) VALUES (?, ?, ?, ?)',
      [name, email, phone, message]
    );

    const contactId = result.insertId;
    logger.info(`Contact form submitted: ID ${contactId} by ${name} (${email})`);

    // Asynchronously send email notification to admin
    const emailSubject = `New Contact Form Submission - ${name}`;
    const emailHtml = `
      <h2>New Contact Request</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Message:</strong><br/>${message}</p>
    `;
    sendAdminNotification(emailSubject, emailHtml).catch(err => logger.error('Failed to send contact notification', err));

    // Handle Google Sheets Integration Webhook asynchronously
    try {
      const [settings] = await connection.query(
        "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('google_sheet_enabled', 'google_sheet_url')"
      );
      const settingsMap = {};
      settings.forEach(s => {
        settingsMap[s.setting_key] = s.setting_value;
      });

      if (settingsMap.google_sheet_enabled === 'true' && settingsMap.google_sheet_url) {
        const { triggerGoogleSheetWebhook } = require('../utils/webhook.utils');
        triggerGoogleSheetWebhook(settingsMap.google_sheet_url, {
          type: 'contact',
          contactId,
          name,
          email,
          phone,
          message
        }).catch(err => logger.error('Failed to trigger Google Sheets Webhook for contact submission:', err));
      }
    } catch (wsErr) {
      logger.error('Error fetching/triggering Google Sheets integration for contact submission:', wsErr);
    }

    return res.status(201).json(formatResponse(true, "Message received. We'll contact you shortly.", {
      contactId
    }));

  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  submitContactForm
};
