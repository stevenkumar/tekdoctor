const logger = require('./logger');

/**
 * Send webhook notification to Google Sheets
 * @param {string} url - Google Sheet webhook URL
 * @param {Object} data - Webhook payload data
 */
const triggerGoogleSheetWebhook = async (url, data) => {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...data,
                submittedAt: new Date().toISOString()
            })
        });

        if (!response.ok) {
            logger.error(`Google Sheets Webhook responded with status: ${response.status}`);
            return false;
        }

        logger.info(`Google Sheets Webhook dispatched successfully`);
        return true;
    } catch (error) {
        logger.error('Error dispatching Google Sheets Webhook:', error);
        return false;
    }
};

module.exports = {
    triggerGoogleSheetWebhook
};
