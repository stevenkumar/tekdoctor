const express = require('express');
const router = express.Router();

const {
  getNotifications,
  markAsRead,
  deleteNotification,
  bulkDeleteNotifications,
  clearAllNotifications,
  sendNotification,
  broadcastNotification,
  getNotificationHistory,
  getVapidPublicKey,
  subscribe,
  unsubscribe
} = require('../controllers/notification.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Public route to fetch active VAPID public key for browser push subscription
router.get('/vapid-public-key', getVapidPublicKey);

// All subsequent notification routes require authentication
router.use(authenticate);

// Web Push subscription registration/cancellation
router.post('/subscribe', subscribe);
router.post('/unsubscribe', unsubscribe);

// User notification routes
router.get('/', getNotifications);
router.put('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);
router.delete('/', clearAllNotifications);

// Admin/Technician notification routes
router.post('/send', authorize('admin', 'technician'), sendNotification);
router.post('/broadcast', authorize('admin'), broadcastNotification);
router.get('/history', authorize('admin'), getNotificationHistory);
router.post('/bulk-delete', authorize('admin'), bulkDeleteNotifications);
router.delete('/bulk', authorize('admin'), bulkDeleteNotifications);

module.exports = router;