const { pool } = require('../config/db.config');
const { formatResponse } = require('../utils/helpers');

/**
 * Get all active public site settings and homepage content
 * GET /api/public/site-data
 */
const getPublicSiteData = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();

        // Fetch site settings
        const [settingsRows] = await connection.query('SELECT setting_group, setting_key, setting_value FROM site_settings');
        const settings = {};
        settingsRows.forEach(row => {
            if (!settings[row.setting_group]) settings[row.setting_group] = {};
            settings[row.setting_group][row.setting_key] = row.setting_value;
        });

        // Fetch active homepage content
        const [contentRows] = await connection.query('SELECT section, content FROM homepage_content WHERE is_active = 1 ORDER BY sort_order ASC');
        const homepage = {};
        contentRows.forEach(row => {
            homepage[row.section] = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
        });

        // Compute dynamic metrics if hero section is present
        try {
            const [[metricsResult]] = await connection.query(`
                SELECT 
                    COUNT(CASE WHEN status IN ('completed', 'delivered') THEN 1 END) as completed_count,
                    COUNT(CASE WHEN status IN ('completed', 'delivered', 'cancelled') THEN 1 END) as total_finished
                FROM service_requests
            `);
            const completedCount = metricsResult ? metricsResult.completed_count : 0;
            const totalFinished = metricsResult ? metricsResult.total_finished : 0;

            if (homepage.hero) {
                if (!Array.isArray(homepage.hero.metrics)) {
                    homepage.hero.metrics = [
                        { label: 'Devices Revived', value: '10+' },
                        { label: 'Success Metric', value: '99.9%' },
                        { label: 'Response Time', value: '24/7' }
                    ];
                }
                if (homepage.hero.metrics[0]) {
                    homepage.hero.metrics[0].value = String(completedCount);
                }
                if (homepage.hero.metrics[1]) {
                    const percentage = totalFinished > 0
                        ? ((completedCount / totalFinished) * 100).toFixed(1) + '%'
                        : '100.0%';
                    homepage.hero.metrics[1].value = percentage;
                }
            }
        } catch (metricsErr) {
            console.error('Failed to compute dynamic hero metrics:', metricsErr);
        }

        return res.status(200).json(formatResponse(true, 'Public data fetched successfully', {
            settings,
            homepage
        }));

    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

module.exports = {
    getPublicSiteData
};
