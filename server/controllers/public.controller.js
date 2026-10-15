const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const { formatResponse } = require('../utils/helpers');

/**
 * Public Allowlist for Site Settings
 * Only explicitly listed, non-sensitive public settings are exposed to the browser.
 * Sensitive configuration (SMTP credentials, tokens, private secrets, and templates)
 * are strictly excluded from public responses.
 */
const PUBLIC_SAFE_SETTINGS = {
    company: new Set([
        'company_name',
        'company_email',
        'company_phone',
        'company_alternate_phone',
        'company_address',
        'logo_url',
        'gstin',
        'site_tagline',
        'site_logo',
        'site_logo_black',
        'site_url'
    ]),
    theme: new Set([
        'theme_primary_color',
        'theme_secondary_color',
        'primary_color',
        'secondary_color'
    ]),
    branding: new Set([
        'favicon_url',
        'tekunik_image_url',
        'logo_url'
    ]),
    social: new Set([
        'facebook_url',
        'twitter_url',
        'instagram_url',
        'linkedin_url'
    ]),
    integrations: new Set([
        'google_maps_link',
        'google_sheet_url',
        'google_login_enabled',
        'google_client_id'
    ]),
    security: new Set([
        'recaptcha_enabled',
        'recaptcha_site_key'
    ]),
    system: new Set([
        'maintenance_mode'
    ]),
    seo: new Set([
        'meta_title',
        'meta_description',
        'meta_keywords'
    ]),
    billing: new Set([
        'invoice_prefix',
        'default_gst_rate',
        'invoice_gst_enabled',
        'invoice_default_items'
    ])
};

/**
 * Get all active public site settings and homepage content
 * GET /api/public/site-data
 */
const getPublicSiteData = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();

        // Fetch site settings (strictly allowlisted for public consumption)
        const [settingsRows] = await connection.query('SELECT setting_group, setting_key, setting_value FROM site_settings');
        const settings = {};
        settingsRows.forEach(row => {
            const allowedKeys = PUBLIC_SAFE_SETTINGS[row.setting_group];
            if (allowedKeys && allowedKeys.has(row.setting_key)) {
                if (!settings[row.setting_group]) settings[row.setting_group] = {};
                settings[row.setting_group][row.setting_key] = row.setting_value;
            }
        });

        // Fall back to environment configuration if database settings are absent or empty
        if (!settings.integrations) settings.integrations = {};
        if (settings.integrations.google_login_enabled === undefined || settings.integrations.google_login_enabled === '') {
            const envGoogleEnabled = process.env.GOOGLE_LOGIN_ENABLED !== 'false' && Boolean(config.google?.clientId);
            settings.integrations.google_login_enabled = envGoogleEnabled ? 'true' : 'false';
        }
        if ((!settings.integrations.google_client_id || !settings.integrations.google_client_id.trim()) && config.google?.clientId) {
            settings.integrations.google_client_id = config.google.clientId;
        }

        if (!settings.security) settings.security = {};
        if (settings.security.recaptcha_enabled === undefined || settings.security.recaptcha_enabled === '') {
            const envRecaptchaEnabled = config.recaptcha?.enabled !== false;
            settings.security.recaptcha_enabled = envRecaptchaEnabled ? 'true' : 'false';
        }
        if ((!settings.security.recaptcha_site_key || !settings.security.recaptcha_site_key.trim()) && config.recaptcha?.siteKey) {
            settings.security.recaptcha_site_key = config.recaptcha.siteKey;
        }

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

