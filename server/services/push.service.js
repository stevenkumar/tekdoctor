const crypto = require('crypto');
const webpush = require('web-push');
const { pool } = require('../config/db.config');
const logger = require('../utils/logger');

let cachedVapidConfig = null;
let vapidInitialized = false;

/**
 * Dynamically resolves and configures VAPID keys for Web Push notifications.
 * Priority:
 * 1. Environment variables: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 * 2. Database table `site_settings` (setting_group = 'push')
 * 3. Auto-generation: Generates a persistent VAPID key pair on first run and persists to `site_settings`.
 *
 * @returns {Promise<{ publicKey: string, privateKey: string, subject: string }>}
 */
const getVapidConfig = async () => {
  if (cachedVapidConfig && vapidInitialized) {
    return cachedVapidConfig;
  }

  const subject = process.env.VAPID_SUBJECT || 'mailto:support@thetekdoctor.com';

  // 1. Check environment variables
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cachedVapidConfig = {
      publicKey: process.env.VAPID_PUBLIC_KEY.trim(),
      privateKey: process.env.VAPID_PRIVATE_KEY.trim(),
      subject
    };
    try {
      webpush.setVapidDetails(
        cachedVapidConfig.subject,
        cachedVapidConfig.publicKey,
        cachedVapidConfig.privateKey
      );
      vapidInitialized = true;
      logger.info('[PushService] VAPID configured from environment variables.');
      return cachedVapidConfig;
    } catch (setErr) {
      logger.error(`[PushService] Failed to set VAPID details from env: ${setErr.message}`);
    }
  }

  // 2. Check site_settings database
  try {
    const [rows] = await pool.query(
      "SELECT setting_key, setting_value FROM site_settings WHERE setting_group = 'push' OR setting_key IN ('vapid_public_key', 'vapid_private_key', 'vapid_subject')"
    );
    const settings = {};
    rows.forEach(r => {
      if (r.setting_value) settings[r.setting_key] = String(r.setting_value).trim();
    });

    if (settings.vapid_public_key && settings.vapid_private_key) {
      cachedVapidConfig = {
        publicKey: settings.vapid_public_key,
        privateKey: settings.vapid_private_key,
        subject: settings.vapid_subject || subject
      };
      webpush.setVapidDetails(
        cachedVapidConfig.subject,
        cachedVapidConfig.publicKey,
        cachedVapidConfig.privateKey
      );
      vapidInitialized = true;
      logger.info('[PushService] VAPID configured from database site_settings.');
      return cachedVapidConfig;
    }

    // 3. Auto-generate persistent VAPID keypair
    const generated = webpush.generateVAPIDKeys();
    logger.info('[PushService] Auto-generating new persistent VAPID key pair...');

    await pool.query(`
      INSERT INTO site_settings (setting_key, setting_value, setting_group)
      VALUES 
        ('vapid_public_key', ?, 'push'),
        ('vapid_private_key', ?, 'push'),
        ('vapid_subject', ?, 'push')
      ON DUPLICATE KEY UPDATE 
        setting_value = VALUES(setting_value),
        setting_group = VALUES(setting_group)
    `, [generated.publicKey, generated.privateKey, subject]);

    cachedVapidConfig = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject
    };
    webpush.setVapidDetails(subject, generated.publicKey, generated.privateKey);
    vapidInitialized = true;
    logger.info('[PushService] Persistent VAPID key pair generated and saved to site_settings.');
    return cachedVapidConfig;

  } catch (dbErr) {
    logger.error(`[PushService] Database VAPID resolution error: ${dbErr.message}`);
    // Ephemeral in-memory fallback if DB is temporarily unreachable
    if (!cachedVapidConfig) {
      const fallback = webpush.generateVAPIDKeys();
      cachedVapidConfig = {
        publicKey: fallback.publicKey,
        privateKey: fallback.privateKey,
        subject
      };
      webpush.setVapidDetails(subject, fallback.publicKey, fallback.privateKey);
      vapidInitialized = true;
    }
    return cachedVapidConfig;
  }
};

/**
 * Retrieves the active VAPID public key for the browser to subscribe with.
 * @returns {Promise<string>}
 */
const getVapidPublicKey = async () => {
  const config = await getVapidConfig();
  return config.publicKey;
};

/**
 * Saves or updates a browser push subscription for a user.
 * @param {number} userId - The authenticated user ID
 * @param {Object} subscription - Standard PushSubscription object { endpoint, keys: { p256dh, auth } }
 * @param {string} [userAgent] - User agent string
 * @returns {Promise<boolean>}
 */
const saveSubscription = async (userId, subscription, userAgent = null) => {
  if (!userId || !subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new Error('Invalid push subscription payload');
  }

  const endpoint = String(subscription.endpoint).trim();
  const endpointHash = crypto.createHash('sha256').update(endpoint).digest('hex');
  const p256dh = String(subscription.keys.p256dh).trim();
  const auth = String(subscription.keys.auth).trim();
  const cleanUA = userAgent ? String(userAgent).slice(0, 255) : null;

  await pool.query(`
    INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      p256dh = VALUES(p256dh),
      auth = VALUES(auth),
      user_agent = VALUES(user_agent)
  `, [userId, endpoint, endpointHash, p256dh, auth, cleanUA]);

  logger.info(`[PushService] Push subscription saved for user ID: ${userId}`);
  return true;
};

/**
 * Removes a push subscription for a user.
 * @param {number} userId - The authenticated user ID
 * @param {string} [endpoint] - Specific endpoint to remove (or all if omitted)
 * @returns {Promise<boolean>}
 */
const removeSubscription = async (userId, endpoint = null) => {
  if (!userId) return false;

  if (endpoint) {
    const endpointHash = crypto.createHash('sha256').update(String(endpoint).trim()).digest('hex');
    await pool.query(
      'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?',
      [userId, endpointHash]
    );
  } else {
    await pool.query('DELETE FROM push_subscriptions WHERE user_id = ?', [userId]);
  }

  logger.info(`[PushService] Push subscription removed for user ID: ${userId}`);
  return true;
};

/**
 * Sends a Web Push lockscreen notification to a user's registered devices.
 * Uses Promise.allSettled and is strictly non-blocking.
 * Automatically cleans up stale/expired subscriptions on HTTP 404 or 410 (Gone).
 *
 * @param {number|number[]} userIds - Single user ID or array of user IDs
 * @param {Object} options
 * @param {string} options.title - Notification title (e.g. 'TekDoctor — Device Ready')
 * @param {string} options.body - Notification body
 * @param {string} [options.url] - Deep-link target URL on click
 * @param {string} [options.tag] - Tag to collapse/group notifications
 * @param {string} [options.icon] - Icon URL (defaults to /pwa-192.png)
 * @param {string} [options.badge] - Badge URL (defaults to /pwa-192.png)
 * @param {Object} [options.data] - Additional metadata
 * @returns {Promise<{ sent: number, failed: number }>}
 */
const sendPushToUser = async (userIds, options = {}) => {
  try {
    await getVapidConfig();

    const targets = Array.isArray(userIds) ? userIds.filter(Boolean) : [userIds].filter(Boolean);
    if (targets.length === 0) return { sent: 0, failed: 0 };

    const placeholders = targets.map(() => '?').join(',');
    const [subs] = await pool.query(
      `SELECT id, user_id, endpoint, endpoint_hash, p256dh, auth 
       FROM push_subscriptions 
       WHERE user_id IN (${placeholders})`,
      targets
    );

    if (subs.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const payload = JSON.stringify({
      title: options.title || 'TekDoctor',
      body: options.body || '',
      icon: options.icon || '/pwa-192.png',
      badge: options.badge || '/pwa-192.png',
      tag: options.tag || `tekdoctor-${Date.now()}`,
      data: {
        url: options.url || '/notifications',
        ...(options.data || {})
      }
    });

    const sendPromises = subs.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(pushSubscription, payload, {
          TTL: 86400, // 24 hours
          urgency: 'high'
        });
        return { success: true, id: sub.id };
      } catch (err) {
        // HTTP 404 or 410 indicates the push endpoint is expired or unsubscribed by the browser
        if (err.statusCode === 404 || err.statusCode === 410) {
          logger.info(`[PushService] Cleaning up expired push subscription ID: ${sub.id} (HTTP ${err.statusCode})`);
          await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]).catch(() => {});
        } else {
          logger.warn(`[PushService] Push delivery failed for sub ID ${sub.id}: ${err.message} (HTTP ${err.statusCode || 'N/A'})`);
        }
        return { success: false, id: sub.id, error: err.message };
      }
    });

    const results = await Promise.allSettled(sendPromises);
    let sent = 0;
    let failed = 0;

    results.forEach((res) => {
      if (res.status === 'fulfilled' && res.value.success) {
        sent++;
      } else {
        failed++;
      }
    });

    logger.debug(`[PushService] Push dispatch complete for user(s) [${targets.join(',')}]: ${sent} sent, ${failed} failed`);
    return { sent, failed };

  } catch (error) {
    logger.error(`[PushService] Top-level sendPushToUser error: ${error.message}`);
    return { sent: 0, failed: 0 };
  }
};

module.exports = {
  getVapidConfig,
  getVapidPublicKey,
  saveSubscription,
  removeSubscription,
  sendPushToUser
};
