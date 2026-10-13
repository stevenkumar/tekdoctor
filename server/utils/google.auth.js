const { OAuth2Client } = require('google-auth-library');
const config = require('../config/app.config');
const logger = require('./logger');

let oauthClientInstance = null;

/**
 * Get or initialize the OAuth2Client instance
 * @returns {OAuth2Client}
 */
const getOAuthClient = () => {
  if (!oauthClientInstance) {
    if (!config.google.clientId) {
      throw new Error('Google Client ID is not configured on the server. Set GOOGLE_CLIENT_ID in environment variables.');
    }
    oauthClientInstance = new OAuth2Client(
      config.google.clientId,
      config.google.clientSecret || undefined
    );
  }
  return oauthClientInstance;
};

/**
 * Verify a Google ID token or exchange an authorization code
 *
 * @param {Object} params
 * @param {string} [params.credential] - Raw Google ID token (JWT) from Google Identity Services
 * @param {string} [params.code] - Authorization code from Google OAuth popup/flow
 * @returns {Promise<{ googleId: string, email: string, name: string, avatarUrl: string|null, emailVerified: boolean }>}
 */
const verifyGoogleIdentity = async ({ credential, code }) => {
  const client = getOAuthClient();
  let idToken = credential;

  // If authorization code provided, exchange for tokens first
  if (code && !idToken) {
    if (!config.google.clientSecret) {
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
      audience: config.google.clientId
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

  // Verify Audience
  if (payload.aud !== config.google.clientId) {
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
  verifyGoogleIdentity,
  getOAuthClient
};
