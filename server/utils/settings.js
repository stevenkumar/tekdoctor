const { pool } = require('../config/db.config');

/**
 * Read raw string setting from site_settings table (no cache).
 *
 * @param {string} key - Setting key
 * @param {*} [defaultValue=null] - Fallback value if setting not found or null
 * @param {Object} [conn=pool] - Optional MySQL connection or pool
 * @returns {Promise<string|*>}
 */
const getSetting = async (key, defaultValue = null, conn = pool) => {
  try {
    const [rows] = await conn.query(
      'SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1',
      [key]
    );
    if (rows && rows.length > 0 && rows[0].setting_value !== null && rows[0].setting_value !== undefined) {
      return rows[0].setting_value;
    }
  } catch (_) {
    // If table doesn't exist or query fails, return default
  }
  return defaultValue;
};

/**
 * Read boolean setting from site_settings.
 * Recognizes 'true', '1', true as true; 'false', '0', false as false.
 *
 * @param {string} key - Setting key
 * @param {boolean} [defaultValue=false] - Fallback boolean
 * @param {Object} [conn=pool] - Optional MySQL connection or pool
 * @returns {Promise<boolean>}
 */
const getBooleanSetting = async (key, defaultValue = false, conn = pool) => {
  const val = await getSetting(key, null, conn);
  if (val === null || val === undefined) {
    return Boolean(defaultValue);
  }
  if (typeof val === 'boolean') {
    return val;
  }
  const clean = String(val).trim().toLowerCase();
  if (clean === 'true' || clean === '1') {
    return true;
  }
  if (clean === 'false' || clean === '0') {
    return false;
  }
  return Boolean(defaultValue);
};

/**
 * Read integer setting from site_settings.
 *
 * @param {string} key - Setting key
 * @param {number} [defaultValue=0] - Fallback integer
 * @param {Object} [conn=pool] - Optional MySQL connection or pool
 * @returns {Promise<number>}
 */
const getIntSetting = async (key, defaultValue = 0, conn = pool) => {
  const val = await getSetting(key, null, conn);
  if (val === null || val === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(String(val).trim(), 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

module.exports = {
  getSetting,
  getBooleanSetting,
  getIntSetting
};
