const crypto = require('crypto');
const logger = require('./logger');

/**
 * Secret Setting Keys Classification
 * Any key in this set is strictly classified as sensitive and MUST:
 * 1. Never be returned to unauthenticated clients (filtered from public site-data).
 * 2. Never be returned in plaintext to Admin API clients (masked with MASKED_SECRET_INDICATOR).
 * 3. Never be overwritten by blank values or unchanged masked placeholders.
 * 4. Be encrypted at rest using AES-256-GCM when SETTINGS_ENCRYPTION_KEY is available.
 */
const SECRET_SETTING_KEYS = new Set([
  'smtp_password',
  'google_client_secret',
  'recaptcha_secret_key',
  'recaptcha_api_key',
  'razorpay_key_secret',
  'razorpay_webhook_secret'
]);

const MASKED_SECRET_INDICATOR = '••••••••';
const ENCRYPTION_PREFIX = 'enc:v1:';

/**
 * Determines whether a given setting key is classified as a secret.
 * @param {string} key
 * @returns {boolean}
 */
const isSecretKey = (key) => {
  if (!key || typeof key !== 'string') return false;
  const lower = key.toLowerCase().trim();
  if (SECRET_SETTING_KEYS.has(lower)) return true;
  // Fallback pattern guard for safety
  return lower.endsWith('_secret') || lower.endsWith('_password');
};

/**
 * Checks if a value is an omitted, empty, or unchanged masked placeholder.
 * If true, update operations MUST preserve the existing stored credential.
 *
 * @param {any} val
 * @returns {boolean}
 */
const isMaskedPlaceholder = (val) => {
  if (val === undefined || val === null) return true;
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed === '') return true;
  if (trimmed === MASKED_SECRET_INDICATOR) return true;
  // Matches strings composed only of bullets or asterisks (e.g. '********', '••••••••', '••••')
  return /^[\*•]+$/.test(trimmed);
};

/**
 * Parses and validates a 32-byte (256-bit) encryption key from the environment.
 * Supports:
 * - 64 hex characters (e.g. openssl rand -hex 32)
 * - 44-character Base64 string decoding to 32 bytes
 * - 32-byte UTF-8 string
 *
 * @param {string} [overrideKey] - Optional key string for testing or overrides
 * @returns {Buffer|null}
 */
const getEncryptionKey = (overrideKey) => {
  const rawKey = overrideKey !== undefined ? overrideKey : process.env.SETTINGS_ENCRYPTION_KEY;
  if (!rawKey || typeof rawKey !== 'string') {
    return null;
  }
  const trimmed = rawKey.trim();

  // 1. 64-character Hex string (standard recommendation)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  // 2. Base64 encoded 32-byte key
  if (/^[A-Za-z0-9+/=]{40,64}$/.test(trimmed)) {
    try {
      const buf = Buffer.from(trimmed, 'base64');
      if (buf.length === 32) return buf;
    } catch (_) {
      // not valid base64, continue
    }
  }

  // 3. Exactly 32-byte UTF-8 string
  if (Buffer.byteLength(trimmed, 'utf8') === 32) {
    return Buffer.from(trimmed, 'utf8');
  }

  return null;
};

/**
 * Checks if a stored setting value is already encrypted with version 1 envelope.
 * @param {any} val
 * @returns {boolean}
 */
const isEncrypted = (val) => {
  return typeof val === 'string' && val.startsWith(ENCRYPTION_PREFIX);
};

/**
 * Encrypts a plaintext secret using AES-256-GCM.
 * Format: enc:v1:<12-byte IV in hex>:<16-byte Auth Tag in hex>:<ciphertext in hex>
 *
 * @param {string} plaintext
 * @param {string} [overrideKey]
 * @returns {string} Versioned envelope ciphertext
 */
const encryptSecret = (plaintext, overrideKey) => {
  if (plaintext === null || plaintext === undefined) {
    return '';
  }
  const str = String(plaintext);
  if (str === '') {
    return '';
  }

  const key = getEncryptionKey(overrideKey);
  if (!key) {
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY is required to encrypt secrets at rest. ' +
      'Please configure a valid 32-byte key (64 hex characters) in the server environment.'
    );
  }

  // 12-byte IV for standard AES-GCM
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(str, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
};

/**
 * Decrypts an AES-256-GCM ciphertext envelope.
 * Backward Compatibility: If the value is not encrypted with the enc:v1: prefix,
 * it returns the legacy plaintext string as-is without crashing.
 *
 * @param {string} storedValue
 * @param {string} [overrideKey]
 * @returns {string} Decrypted plaintext
 */
const decryptSecret = (storedValue, overrideKey) => {
  if (!storedValue || typeof storedValue !== 'string') {
    return '';
  }

  // Backward compatibility: If not versioned ciphertext, return legacy plaintext
  if (!storedValue.startsWith(ENCRYPTION_PREFIX)) {
    return storedValue;
  }

  const parts = storedValue.split(':');
  // Expected: ['enc', 'v1', ivHex, tagHex, cipherHex]
  if (parts.length !== 5) {
    throw new Error('Malformed encrypted secret format: Invalid envelope structure.');
  }

  const [, , ivHex, tagHex, cipherHex] = parts;
  if (!ivHex || !tagHex || cipherHex === undefined) {
    throw new Error('Malformed encrypted secret format: Missing cryptographic components.');
  }

  // Strict hex validation to reject non-hex tampering
  if (!/^[0-9a-fA-F]{24}$/.test(ivHex) || !/^[0-9a-fA-F]{32}$/.test(tagHex) || !/^[0-9a-fA-F]*$/.test(cipherHex)) {
    throw new Error('Malformed encrypted secret format: Invalid hex encoding or tampering detected.');
  }

  const key = getEncryptionKey(overrideKey);
  if (!key) {
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY is missing or invalid. Unable to decrypt stored secret.'
    );
  }

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');

    if (iv.length !== 12 || authTag.length !== 16) {
      throw new Error('Invalid IV or Auth Tag length in ciphertext envelope.');
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    logger.error(`[Crypto] Decryption failed: ${err.message}`);
    throw new Error(`Authentication/Decryption failed: ${err.message}`);
  }
};

module.exports = {
  SECRET_SETTING_KEYS,
  MASKED_SECRET_INDICATOR,
  ENCRYPTION_PREFIX,
  isSecretKey,
  isMaskedPlaceholder,
  getEncryptionKey,
  isEncrypted,
  encryptSecret,
  decryptSecret
};
