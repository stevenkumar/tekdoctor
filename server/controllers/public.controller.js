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

const logger = require('../utils/logger');

// In-memory cache for pincode lookups (1 hour TTL)
const pincodeCache = new Map();
const PINCODE_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Fetch city, state, and district by 6-digit Indian postal code
 * GET /api/public/pincode/:pincode
 */
const getPincodeLocation = async (req, res) => {
    try {
        const rawPincode = req.params.pincode;
        if (!rawPincode || typeof rawPincode !== 'string') {
            return res.status(400).json(formatResponse(false, 'Please enter a valid 6-digit postal code.'));
        }

        const pincode = rawPincode.trim();
        // Indian postal code: exactly 6 digits, non-zero first digit
        if (!/^[1-9][0-9]{5}$/.test(pincode)) {
            return res.status(400).json(formatResponse(false, 'Please enter a valid 6-digit postal code.'));
        }

        // Check local in-memory cache
        const cached = pincodeCache.get(pincode);
        if (cached && (Date.now() - cached.timestamp < PINCODE_CACHE_TTL_MS)) {
            return res.status(200).json(formatResponse(true, 'Location retrieved successfully', cached.data));
        }

        let resultData = null;

        // 1. Try India Post API with 4-second timeout
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const json = await response.json();
                if (Array.isArray(json) && json[0] && json[0].Status === 'Success' && Array.isArray(json[0].PostOffice) && json[0].PostOffice.length > 0) {
                    const offices = json[0].PostOffice;
                    const first = offices[0];
                    const district = first.District || '';
                    const state = first.State || '';
                    const places = [...new Set(offices.map(o => o.Name).filter(Boolean))];

                    resultData = {
                        pincode,
                        city: district || places[0] || '',
                        district: district || '',
                        state: state || '',
                        places: places
                    };
                }
            }
        } catch (fetchErr) {
            logger.warn(`Primary India Post lookup failed or timed out for ${pincode}: ${fetchErr.message}`);
        }

        // 2. Fallback to zippopotam if India Post was unavailable
        if (!resultData) {
            try {
                const fbController = new AbortController();
                const fbTimeout = setTimeout(() => fbController.abort(), 3000);

                const fbRes = await fetch(`https://api.zippopotam.us/in/${pincode}`, {
                    signal: fbController.signal,
                    headers: { 'Accept': 'application/json' }
                });
                clearTimeout(fbTimeout);

                if (fbRes.ok) {
                    const fbJson = await fbRes.json();
                    if (fbJson.places && fbJson.places.length > 0) {
                        const p = fbJson.places[0];
                        resultData = {
                            pincode,
                            city: p['place name'] || '',
                            district: p['state abbreviation'] || '',
                            state: p['state'] || '',
                            places: fbJson.places.map(x => x['place name']).filter(Boolean)
                        };
                    }
                }
            } catch (fbErr) {
                logger.warn(`Secondary postal lookup failed for ${pincode}: ${fbErr.message}`);
            }
        }

        if (resultData) {
            pincodeCache.set(pincode, { data: resultData, timestamp: Date.now() });
            return res.status(200).json(formatResponse(true, 'Location retrieved successfully', resultData));
        }

        return res.status(404).json(formatResponse(false, 'No location found for this postal code.'));
    } catch (error) {
        logger.error('Error in getPincodeLocation:', error);
        return res.status(500).json(formatResponse(false, 'Postal code lookup service is temporarily unavailable.'));
    }
};

module.exports = {
    getPublicSiteData,
    getPincodeLocation
};

