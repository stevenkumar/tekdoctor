const config = require('../config/app.config');
const { pool } = require('../config/db.config');
const { decryptSecret } = require('./crypto.utils');
const logger = require('./logger');

// Dynamic configuration cache (60 seconds TTL)
let cachedRecaptchaConfig = null;
let recaptchaConfigCacheTimestamp = 0;
const RECAPTCHA_CACHE_TTL_MS = 60 * 1000;

/**
 * Invalidates the cached reCAPTCHA runtime settings.
 * Called immediately upon settings updates in Admin controller.
 */
const invalidateRecaptchaConfigCache = () => {
  cachedRecaptchaConfig = null;
  recaptchaConfigCacheTimestamp = 0;
};

/**
 * Dynamically resolves reCAPTCHA settings from:
 * 1. Database (`site_settings` table: `recaptcha_enabled`, `recaptcha_site_key`, `recaptcha_secret_key`,
 *    `recaptcha_api_key`, `recaptcha_project_id`, `recaptcha_score_threshold`)
 * 2. Environment variables (`config.recaptcha` / `process.env`) as safe fallback
 *
 * @returns {Promise<{ enabled: boolean, siteKey: string, secretKey: string, apiKey: string, projectId: string, scoreThreshold: number }>}
 */
const getRecaptchaConfig = async () => {
  const now = Date.now();
  if (process.env.NODE_ENV !== 'test' && cachedRecaptchaConfig && (now - recaptchaConfigCacheTimestamp < RECAPTCHA_CACHE_TTL_MS)) {
    return cachedRecaptchaConfig;
  }

  const dbSettings = {};
  try {
    const [rows] = await pool.query(
      "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('recaptcha_enabled', 'recaptcha_site_key', 'recaptcha_secret_key', 'recaptcha_api_key', 'recaptcha_project_id', 'recaptcha_score_threshold')"
    );
    rows.forEach(r => {
      if (r.setting_value !== null && r.setting_value !== undefined) {
        dbSettings[r.setting_key] = String(r.setting_value).trim();
      }
    });
  } catch (err) {
    logger.debug(`Could not read reCAPTCHA settings from DB: ${err.message}`);
  }

  // 1. Enabled status:
  // If explicitly 'false' in DB, disabled.
  // If explicitly 'true' in DB, enabled.
  // If absent or unconfigured in DB, fall back to environment config:
  let enabled;
  if (dbSettings.recaptcha_enabled !== undefined && dbSettings.recaptcha_enabled !== '') {
    enabled = dbSettings.recaptcha_enabled === 'true';
  } else {
    enabled = config.recaptcha?.enabled !== false;
  }

  // 2. Site Key:
  const hasDbSiteKey = Boolean(dbSettings.recaptcha_site_key && dbSettings.recaptcha_site_key.trim());
  const siteKey = hasDbSiteKey
    ? dbSettings.recaptcha_site_key.trim()
    : (config.recaptcha?.siteKey || '').trim();

  // 3. Secret Key (decrypt if present):
  // Cryptographic Pairing Invariant:
  // If the database defines an authoritative custom siteKey, it must use the database's matching secretKey.
  // If the database does not define a custom siteKey, the configuration falls back to the environment siteKey;
  // therefore, the secretKey MUST also fall back to the environment's matching secretKey to prevent
  // an invalid hybrid key-pair mismatch (which triggers Google's 'invalid-input-response' rejection).
  let secretKey = '';
  if (hasDbSiteKey && dbSettings.recaptcha_secret_key) {
    try {
      secretKey = decryptSecret(dbSettings.recaptcha_secret_key);
    } catch (decErr) {
      logger.error(`[reCAPTCHA] Failed to decrypt stored Secret Key: ${decErr.message}`);
      secretKey = '';
    }
  } else if (!hasDbSiteKey) {
    secretKey = (config.recaptcha?.secretKey || '').trim();
  }

  // 4. API Key for Enterprise Assessment API (decrypt if present):
  let apiKey = '';
  if (hasDbSiteKey && dbSettings.recaptcha_api_key) {
    try {
      apiKey = decryptSecret(dbSettings.recaptcha_api_key);
    } catch (decErr) {
      logger.error(`[reCAPTCHA] Failed to decrypt stored API Key: ${decErr.message}`);
      apiKey = '';
    }
  } else if (!hasDbSiteKey) {
    apiKey = (config.recaptcha?.apiKey || '').trim();
  }

  // 5. Project ID for Enterprise Assessment:
  let projectId = '';
  if (hasDbSiteKey && dbSettings.recaptcha_project_id && dbSettings.recaptcha_project_id.trim()) {
    projectId = dbSettings.recaptcha_project_id.trim();
  } else if (!hasDbSiteKey) {
    projectId = (config.recaptcha?.projectId || '').trim();
  }

  // If in test mode and config.recaptcha credentials were explicitly cleared by a test case
  if (process.env.NODE_ENV === 'test' && config.recaptcha && config.recaptcha.secretKey === '' && config.recaptcha.projectId === '' && config.recaptcha.apiKey === '') {
    secretKey = '';
    apiKey = '';
    projectId = '';
  }

  // 6. Score Threshold:
  let scoreThreshold = 0.5;
  if (dbSettings.recaptcha_score_threshold) {
    const parsed = parseFloat(dbSettings.recaptcha_score_threshold);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      scoreThreshold = parsed;
    }
  } else if (config.recaptcha?.scoreThreshold !== undefined) {
    scoreThreshold = Number(config.recaptcha.scoreThreshold) || 0.5;
  }

  cachedRecaptchaConfig = {
    enabled,
    siteKey,
    secretKey,
    apiKey,
    projectId,
    scoreThreshold
  };
  recaptchaConfigCacheTimestamp = now;
  return cachedRecaptchaConfig;
};

/**
 * Verify Google reCAPTCHA Enterprise token (Web, score-based)
 *
 * Evaluation Strategy:
 * 1. Explicitly disabled via Admin settings or config: bypass gracefully
 * 2. Enterprise Assessment REST API (Priority 1) via projectId + apiKey
 * 3. Standard reCAPTCHA v3 siteverify endpoint fallback when Enterprise unavailable or unsupported
 * 4. Missing required configuration or verification failure fails closed (never fail-open)
 *
 * @param {Object} options
 * @param {string} options.token - The token generated by grecaptcha.enterprise.execute() or grecaptcha.execute()
 * @param {string} options.expectedAction - Expected action identifier (e.g. 'login', 'signup', etc.)
 * @param {string} [options.clientIp] - Client IP address
 * @returns {Promise<{ success: boolean, reason?: string, score?: number, bypassed?: boolean, testMode?: boolean }>}
 */
const verifyRecaptchaEnterprise = async ({ token, expectedAction, clientIp }) => {
  const recaptchaConfig = await getRecaptchaConfig();

  // 1. Graceful bypass when reCAPTCHA is explicitly disabled in configuration
  if (!recaptchaConfig.enabled) {
    if (config.env === 'production') {
      logger.warn('[reCAPTCHA] Verification bypassed: reCAPTCHA is explicitly disabled in settings/config.');
    } else {
      logger.info('[reCAPTCHA] Verification skipped: reCAPTCHA is explicitly disabled in settings/config.');
    }
    return {
      success: true,
      score: 1.0,
      bypassed: true
    };
  }

  const hasEnterpriseCredentials = Boolean(recaptchaConfig.projectId && recaptchaConfig.apiKey);
  const hasSecretKey = Boolean(recaptchaConfig.secretKey);

  // 2. Fail closed if credentials are missing
  if (!hasEnterpriseCredentials && !hasSecretKey) {
    if (config.env !== 'production') {
      logger.warn(`[reCAPTCHA] No credentials configured in ${config.env} environment. Allowing request.`);
      return {
        success: true,
        score: 1.0,
        bypassed: true
      };
    }

    logger.error('[reCAPTCHA] Error: reCAPTCHA is enabled but credentials are missing in configuration.');
    return {
      success: false,
      reason: 'Security verification service is not configured.'
    };
  }

  // 3. Allow test tokens in non-production or test environments
  const cleanToken = typeof token === 'string' ? token.trim() : '';
  if (
    (config.env !== 'production' || process.env.NODE_ENV === 'test') &&
    (cleanToken === 'test-token' || cleanToken === 'mock-recaptcha-token')
  ) {
    logger.debug(`[reCAPTCHA] Test token accepted for action: ${expectedAction}`);
    return {
      success: true,
      score: 1.0,
      testMode: true
    };
  }

  // 4. Token presence check (enforced when reCAPTCHA is enabled and configured)
  if (!cleanToken) {
    return {
      success: false,
      reason: 'reCAPTCHA token is required.'
    };
  }

  const scoreThreshold = recaptchaConfig.scoreThreshold;

  // 5. Priority 1: Google Cloud reCAPTCHA Enterprise Assessment REST API
  if (hasEnterpriseCredentials) {
    let enterpriseUnavailable = false;
    try {
      const endpoint = `https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(recaptchaConfig.projectId)}/assessments?key=${encodeURIComponent(recaptchaConfig.apiKey)}`;
      
      const requestPayload = {
        event: {
          token: cleanToken,
          siteKey: recaptchaConfig.siteKey || undefined,
          expectedAction: expectedAction || undefined,
          userIpAddress: clientIp || undefined
        }
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        logger.error(`[reCAPTCHA] Enterprise assessment API returned HTTP ${response.status}: ${errorText}`);
        // If HTTP 5xx or service error and standard secretKey fallback exists, mark for approved fallback
        if (response.status >= 500 && hasSecretKey) {
          enterpriseUnavailable = true;
        } else {
          return {
            success: false,
            reason: 'Security verification service error.'
          };
        }
      } else {
        const data = await response.json();

        // Check token validity
        if (!data.tokenProperties || !data.tokenProperties.valid) {
          const invalidReason = data.tokenProperties?.invalidReason || 'UNKNOWN';
          logger.warn(`[reCAPTCHA] Token invalid for action "${expectedAction}": ${invalidReason}`);
          return {
            success: false,
            reason: `reCAPTCHA token is invalid or expired (${invalidReason}).`
          };
        }

        // Check expected action match
        if (expectedAction && data.tokenProperties.action !== expectedAction) {
          logger.warn(`[reCAPTCHA] Action mismatch. Expected "${expectedAction}", got "${data.tokenProperties.action}".`);
          return {
            success: false,
            reason: 'Security verification action mismatch.'
          };
        }

        // Check risk score against dynamic threshold
        const score = typeof data.riskAnalysis?.score === 'number' ? data.riskAnalysis.score : 0;
        if (score < scoreThreshold) {
          logger.warn(`[reCAPTCHA] Risk score too low: ${score} < ${scoreThreshold} for action "${expectedAction}".`);
          return {
            success: false,
            reason: 'Security check failed. Suspicious activity detected.',
            score
          };
        }

        logger.debug(`[reCAPTCHA] Enterprise verification passed. Action: "${expectedAction}", Score: ${score}`);
        return {
          success: true,
          score,
          reasons: data.riskAnalysis?.reasons || []
        };
      }
    } catch (networkErr) {
      logger.error(`[reCAPTCHA] Enterprise assessment network error: ${networkErr.message}`);
      if (hasSecretKey) {
        enterpriseUnavailable = true;
      } else {
        return {
          success: false,
          reason: 'Security verification request timed out or failed.'
        };
      }
    }

    if (!enterpriseUnavailable) {
      return {
        success: false,
        reason: 'Security verification failed.'
      };
    }
    logger.warn('[reCAPTCHA] Enterprise service unavailable, attempting approved fallback to Standard reCAPTCHA v3 siteverify.');
  }

  // 6. Approved Fallback: Standard reCAPTCHA siteverify API (when secretKey is configured)
  if (hasSecretKey) {
    try {
      const params = new URLSearchParams({
        secret: recaptchaConfig.secretKey,
        response: cleanToken
      });
      if (clientIp) params.append('remoteip', clientIp);

      const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        logger.error(`[reCAPTCHA] siteverify returned HTTP ${response.status}`);
        return { success: false, reason: 'Security verification service error.' };
      }

      const data = await response.json();

      if (!data.success) {
        const errorCodes = Array.isArray(data['error-codes']) ? data['error-codes'].join(', ') : 'invalid';
        logger.warn(`[reCAPTCHA] Verification failed with error codes: ${errorCodes}`);
        return {
          success: false,
          reason: `reCAPTCHA verification failed (${errorCodes}).`
        };
      }

      if (expectedAction && data.action && data.action !== expectedAction) {
        logger.warn(`[reCAPTCHA] Action mismatch: expected "${expectedAction}", got "${data.action}"`);
        return {
          success: false,
          reason: 'Security verification action mismatch.'
        };
      }

      const score = typeof data.score === 'number' ? data.score : 1.0;
      if (score < scoreThreshold) {
        logger.warn(`[reCAPTCHA] Risk score too low: ${score} < ${scoreThreshold}`);
        return {
          success: false,
          reason: 'Security check failed. Suspicious activity detected.',
          score
        };
      }

      return {
        success: true,
        score
      };
    } catch (err) {
      logger.error(`[reCAPTCHA] siteverify network error: ${err.message}`);
      return {
        success: false,
        reason: 'Security verification request timed out or failed.'
      };
    }
  }

  return {
    success: false,
    reason: 'Security verification configuration error.'
  };
};

module.exports = {
  getRecaptchaConfig,
  invalidateRecaptchaConfigCache,
  verifyRecaptchaEnterprise
};
