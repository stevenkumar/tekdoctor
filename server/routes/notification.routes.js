const express = require('express');
const router = express.Router();
const { getNotifications, markAsRead, sendNotification, broadcastNotification, getNotificationHistory, deleteNotification, clearAllNotifications } = require('../controllers/notification.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// User routes
router.get('/', authenticate, getNotifications);
router.put('/:id/read', authenticate, markAsRead);
router.delete('/:id', authenticate, deleteNotification);
router.delete('/', authenticate, clearAllNotifications);

// Admin routes
router.post('/send', authenticate, authorize('admin'), sendNotification);
router.post('/broadcast', authenticate, authorize('admin'), broadcastNotification);
router.get('/history', authenticate, authorize('admin'), getNotificationHistory);

module.exports = router;
