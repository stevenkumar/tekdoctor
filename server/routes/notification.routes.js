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
  getNotificationHistory
} = require('../controllers/notification.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// All notification routes require authentication
router.use(authenticate);

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