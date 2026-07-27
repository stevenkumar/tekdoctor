const express = require('express');
const router = express.Router();

const {
  createRepairRequest,
  getRepairRequests,
  getMyTasks,
  updateRequestStatus,
  deleteRepairRequest,
  getCustomerHistory,
  trackRequest,
  notifyCustomer,
  updateRepairRequest,
  // New handlers
  createWorkLog,
  getWorkLogs,
  updateCustomerDescription,
  sendMilestoneNotification,
  getRepairRequestById,
  cancelRepairRequest,
  saveRepairDraft,
  getRepairDraft,
  acceptAssignment,
  rejectAssignment,
  transferTicket,
  submitFeedback
} = require('../controllers/repair.controller');
const upload = require('../config/multer.config');
const { validateRepairRequest, validateStatusUpdate } = require('../middleware/validate.middleware');
const { authenticate, optionalAuth, authorize } = require('../middleware/auth.middleware');

// File upload configuration for service requests
const repairUpload = upload.fields([
  { name: 'deviceImage', maxCount: 1 },
  { name: 'errorScreenshot', maxCount: 1 }
]);

const workLogUpload = upload.single('workLogMedia');

// Route: POST /api/repair-request (Optional Auth, guest submission allowed)
router.post(
  '/',
  optionalAuth,
  repairUpload,
  validateRepairRequest,
  createRepairRequest
);

// Route: GET /api/repair-request/my-tasks (Technician only — returns tasks assigned to the caller)
router.get(
  '/my-tasks',
  authenticate,
  authorize('technician'),
  getMyTasks
);

// Route: GET /api/repair-request (Admin & Technicians only)
router.get(
  '/',
  authenticate,
  authorize('admin', 'technician'),
  getRepairRequests
);

// Route: PUT /api/repair-request/:id/status (Admin & Technicians only)
router.put(
  '/:id/status',
  authenticate,
  authorize('admin', 'technician'),
  validateStatusUpdate,
  updateRequestStatus
);

// Route: GET /api/repair-request/history (Authenticated users)
router.get(
  '/history',
  authenticate,
  getCustomerHistory
);

// Route: GET /api/repair-request/:id (Admin & Technicians only)
router.get(
  '/:id',
  authenticate,
  authorize('admin', 'technician'),
  getRepairRequestById
);

// Route: PUT /api/repair-request/:id/cancel (Customer, Company, Admin)
router.put(
  '/:id/cancel',
  authenticate,
  cancelRepairRequest
);

// Route: PUT /api/repair-request/:id (Admin only)
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  updateRepairRequest
);

// Route: DELETE /api/repair-request/:id (Admin only)
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  deleteRepairRequest
);



// Route: GET /api/repair-request/track/:id (Public Tracking)
router.get(
  '/track/:id',
  trackRequest
);

// Route: POST /api/repair-request/:id/notify (Admin/Technician)
router.post(
  '/:id/notify',
  authenticate,
  authorize('admin', 'technician'),
  notifyCustomer
);

// Route: GET /api/repair-request/:id/work-logs (Admin & Technicians only)
router.get(
  '/:id/work-logs',
  authenticate,
  authorize('admin', 'technician'),
  getWorkLogs
);

// Route: POST /api/repair-request/:id/work-logs (Admin & Technicians only)
router.post(
  '/:id/work-logs',
  authenticate,
  authorize('admin', 'technician'),
  workLogUpload,
  createWorkLog
);

// Route: PUT /api/repair-request/:id/customer-description (Admin & Technicians only)
router.put(
  '/:id/customer-description',
  authenticate,
  authorize('admin', 'technician'),
  updateCustomerDescription
);

// Route: POST /api/repair-request/:id/milestones (Admin & Technicians only)
router.post(
  '/:id/milestones',
  authenticate,
  authorize('admin', 'technician'),
  sendMilestoneNotification
);

// Route: POST /api/repair-request/:id/accept-assignment
router.post(
  '/:id/accept-assignment',
  authenticate,
  authorize('technician'),
  acceptAssignment
);

// Route: POST /api/repair-request/:id/reject-assignment
router.post(
  '/:id/reject-assignment',
  authenticate,
  authorize('technician'),
  rejectAssignment
);

// Route: POST /api/repair-request/:id/transfer
router.post(
  '/:id/transfer',
  authenticate,
  authorize('admin', 'technician'),
  transferTicket
);

// Route: POST /api/repair-request/:id/feedback
router.post(
  '/:id/feedback',
  authenticate,
  authorize('customer', 'company'),
  submitFeedback
);

// Route: POST /api/repair-request/draft/:draftId
router.post('/draft/:draftId', optionalAuth, saveRepairDraft);

// Route: GET /api/repair-request/draft/:draftId
router.get('/draft/:draftId', optionalAuth, getRepairDraft);

module.exports = router;
