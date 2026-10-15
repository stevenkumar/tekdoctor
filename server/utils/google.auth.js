const { OAuth2Client } = require('google-auth-library');
const config = require('../config/app.config');
const { pool } = require('../config/db.config');
const { decryptSecret } = require('./crypto.utils');
const logger = require('./logger');

// Dynamic configuration cache (60 seconds TTL)
let cachedGoogleConfig = null;
let googleConfigCacheTimestamp = 0;
const GOOGLE_CACHE_TTL_MS = 60 * 1000;

/**
 * Invalidates the cached Google OAuth runtime settings.
 * Called immediately upon settings updates in Admin controller.
 */
const invalidateGoogleConfigCache = () => {
  cachedGoogleConfig = null;
  googleConfigCacheTimestamp = 0;
};

/**
 * Dynamically resolves Google OAuth settings from:
 * 1. Database (`site_settings` table: `google_login_enabled`, `google_client_id`, `google_client_secret`)
 * 2. Environment variables (`config.google` / `process.env`) as safe fallback
 *
 * @returns {Promise<{ enabled: boolean, clientId: string, clientSecret: string }>}
 */
const getGoogleConfig = async () => {
  const now = Date.now();
  if (process.env.NODE_ENV !== 'test' && cachedGoogleConfig && (now - googleConfigCacheTimestamp < GOOGLE_CACHE_TTL_MS)) {
    return cachedGoogleConfig;
  }

  const dbSettings = {};
  try {
    const [rows] = await pool.query(
      "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('google_login_enabled', 'google_client_id', 'google_client_secret')"
    );
    rows.forEach(r => {
      if (r.setting_value !== null && r.setting_value !== undefined) {
        dbSettings[r.setting_key] = String(r.setting_value).trim();
      }
    });
  } catch (err) {
    logger.debug(`Could not read Google settings from DB: ${err.message}`);
  }

  // Determine enabled status:
  // If explicitly 'false' in DB, disabled.
  // If explicitly 'true' in DB, enabled.
  // If absent or unconfigured in DB, fall back to environment config:
  let enabled;
  if (dbSettings.google_login_enabled !== undefined && dbSettings.google_login_enabled !== '') {
    enabled = dbSettings.google_login_enabled === 'true';
  } else {
    enabled = process.env.GOOGLE_LOGIN_ENABLED !== 'false' && Boolean(config.google?.clientId);
  }

  // Determine clientId:
  const hasDbClientId = Boolean(dbSettings.google_client_id && dbSettings.google_client_id.trim());
  const clientId = hasDbClientId
    ? dbSettings.google_client_id.trim()
    : (config.google?.clientId || '').trim();

  // Determine clientSecret:
  // Cryptographic Pairing Invariant:
  // If the database defines an authoritative custom clientId, use the database's matching clientSecret.
  // If the database does not define a custom clientId, use the environment's matching clientSecret.
  let clientSecret = '';
  if (hasDbClientId && dbSettings.google_client_secret) {
    try {
      clientSecret = decryptSecret(dbSettings.google_client_secret);
    } catch (decErr) {
      logger.error(`[GoogleAuth] Failed to decrypt stored Google Client Secret: ${decErr.message}`);
      clientSecret = '';
    }
  } else if (!hasDbClientId) {
    clientSecret = (config.google?.clientSecret || '').trim();
  }

  cachedGoogleConfig = {
    enabled,
    clientId,
    clientSecret
  };
  googleConfigCacheTimestamp = now;
  return cachedGoogleConfig;
};

/**
 * Initializes an OAuth2Client instance using dynamic configuration
 * @param {Object} [googleConfig]
 * @returns {OAuth2Client}
 */
const getOAuthClient = (googleConfig) => {
  const activeClientId = googleConfig?.clientId || config.google?.clientId;
  const activeClientSecret = googleConfig?.clientSecret || config.google?.clientSecret;

  if (!activeClientId) {
    throw new Error('Google Client ID is not configured on the server.');
  }

  return new OAuth2Client(
    activeClientId,
    activeClientSecret || undefined
  );
};

/**
 * Verify a Google ID token or exchange an authorization code using dynamic runtime configuration
 *
 * @param {Object} params
 * @param {string} [params.credential] - Raw Google ID token (JWT) from Google Identity Services
 * @param {string} [params.code] - Authorization code from Google OAuth popup/flow
 * @returns {Promise<{ googleId: string, email: string, name: string, avatarUrl: string|null, emailVerified: boolean }>}
 */
const verifyGoogleIdentity = async ({ credential, code }) => {
  const googleConfig = await getGoogleConfig();

  if (!googleConfig.enabled) {
    throw new Error('Google Sign-In is currently disabled.');
  }

  if (!googleConfig.clientId) {
    throw new Error('Google Client ID is not configured on the server.');
  }

  const client = getOAuthClient(googleConfig);
  let idToken = credential;

  // If authorization code provided, exchange for tokens first
  if (code && !idToken) {
    if (!googleConfig.clientSecret) {
      throw new Error('Google Client Secret is required on the server to exchange authorization codes.');
    }
    try {
      const { tokens } = await client.getToken({
        code,
        redirect_uri: 'postmessage' // standard origin for web popup/one-tap flows
      });
      idToken = tokens.id_token;
    } catch (exchangeError) {
      logger.error(`Failed to exchange Google authorization code: ${exchangeError.message}`);
      throw new Error(`Google authorization exchange failed: ${exchangeError.message}`);
    }
  }

  if (!idToken) {
    throw new Error('No Google identity token provided or returned.');
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: googleConfig.clientId
    });
    payload = ticket.getPayload();
  } catch (verifyError) {
    logger.warn(`Google token verification failed: ${verifyError.message}`);
    throw new Error(`Invalid Google identity token: ${verifyError.message}`);
  }

  if (!payload || !payload.sub) {
    throw new Error('Invalid token payload received from Google.');
  }

  // Verify Issuer
  const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
  if (!validIssuers.includes(payload.iss)) {
    throw new Error(`Invalid token issuer: ${payload.iss}`);
  }

  // Verify Audience against dynamic Client ID
  if (payload.aud !== googleConfig.clientId) {
    throw new Error('Token audience mismatch.');
  }

  // Verify Email & Email Verification Status
  if (!payload.email) {
    throw new Error('Google account does not have an email address.');
  }

  if (!payload.email_verified) {
    throw new Error('Google email address is not verified. Please verify your email with Google.');
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase().trim(),
    name: payload.name || payload.given_name || payload.email.split('@')[0],
    avatarUrl: payload.picture || null,
    emailVerified: Boolean(payload.email_verified)
  };
};

module.exports = {
  getGoogleConfig,
  invalidateGoogleConfigCache,
  verifyGoogleIdentity,
  getOAuthClient
};
