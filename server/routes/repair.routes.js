const express = require('express');
const router = express.Router();

const {
  createRepairRequest,
  getRepairRequests,
  getMyTasks,
  updateRequestStatus,
  deleteRepairRequest,
  bulkDeleteRepairRequests,
  reactivateRepairRequest,
  getCustomerHistory,
  trackRequest,
  notifyCustomer,
  updateRepairRequest,
  setRepairCharges,
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
  getTicketTransfers,
  getMyTransferHistory,
  submitFeedback,
  submitDiagnosis,
  approveEstimate,
  rejectEstimate,
  placeTicketOnHold,
  cancelHold,
  requestRepairAgain
} = require('../controllers/repair.controller');
const { getPaymentReceipt } = require('../controllers/billing.controller');
const upload = require('../config/multer.config');
const {
  validateRepairRequest,
  validateStatusUpdate,
  validateSetRepairCharges,
  validateDiagnosis,
  validateWorkLog,
  validateTransferTicket,
  validateCustomerDescription
} = require('../middleware/validate.middleware');
const { verifyUploadSignatures, stripProtectedFields } = require('../middleware/security.middleware');
const { authenticate, optionalAuth, authorize } = require('../middleware/auth.middleware');
const { verifyRecaptcha } = require('../middleware/recaptcha.middleware');
const { apiLimiter } = require('../middleware/rateLimiter.middleware');

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
  verifyUploadSignatures,
  stripProtectedFields(['status', 'repair_cost', 'customer_approval_status', 'payment_status', 'assigned_technician_id']),
  verifyRecaptcha('book_repair'),
  validateRepairRequest,
  createRepairRequest
);

// ── Named routes MUST come before /:id to avoid being shadowed ──────────────

// Route: GET /api/repair-request/my-tasks (Technician only — returns tasks assigned to the caller)
router.get(
  '/my-tasks',
  authenticate,
  authorize('technician'),
  getMyTasks
);

// Route: GET /api/repair-request/transfers/my-history (Technician only — returns transfer history)
router.get(
  '/transfers/my-history',
  authenticate,
  authorize('technician'),
  getMyTransferHistory
);

// Route: GET /api/repair-request (Admin & Technicians only)
router.get(
  '/',
  authenticate,
  authorize('admin', 'technician'),
  getRepairRequests
);

// Route: GET /api/repair-request/history (Authenticated users)
router.get(
  '/history',
  authenticate,
  getCustomerHistory
);

// Route: GET /api/repair-request/track/:id (Public Tracking — no auth required)
router.get(
  '/track/:id',
  trackRequest
);

// Route: GET /api/repair-request/receipt/ticket/:ticketId (Payment Bill Receipt)
router.get('/receipt/ticket/:ticketId', optionalAuth, getPaymentReceipt);
router.get('/receipt/:id', optionalAuth, getPaymentReceipt);
router.get('/:id/receipt', optionalAuth, getPaymentReceipt);

// Route: POST /api/repair-request/draft/:draftId (Optional Auth — save draft)
router.post('/draft/:draftId', apiLimiter, optionalAuth, saveRepairDraft);

// Route: GET /api/repair-request/draft/:draftId (Optional Auth — load draft)
router.get('/draft/:draftId', apiLimiter, optionalAuth, getRepairDraft);

// Route: POST /api/repair-request/bulk-delete (Admin only — Bulk soft-deactivate/cancel tickets)
router.post(
  '/bulk-delete',
  authenticate,
  authorize('admin'),
  bulkDeleteRepairRequests
);

// Route: DELETE /api/repair-request/bulk (Admin only — alias for bulk delete)
router.delete(
  '/bulk',
  authenticate,
  authorize('admin'),
  bulkDeleteRepairRequests
);

// ── Parameterized /:id routes come AFTER all named routes ───────────────────

// Route: PUT /api/repair-request/:id/status (Admin & Technicians only)
router.put(
  '/:id/status',
  authenticate,
  authorize('admin', 'technician'),
  validateStatusUpdate,
  updateRequestStatus
);

// Route: GET /api/repair-request/:id (Admin, Technicians, Customer owner, Company owner)
router.get(
  '/:id',
  authenticate,
  authorize('admin', 'technician', 'customer', 'company'),
  getRepairRequestById
);

// Route: PUT /api/repair-request/:id/cancel (Customer, Company, Admin)
router.put(
  '/:id/cancel',
  authenticate,
  cancelRepairRequest
);

// Route: PUT /api/repair-request/:id/charges (Admin only - Set or update payable repair charges)
router.put(
  '/:id/charges',
  authenticate,
  authorize('admin'),
  validateSetRepairCharges,
  setRepairCharges
);

// Route: PUT /api/repair-request/:id (Admin only)
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  repairUpload,
  verifyUploadSignatures,
  updateRepairRequest
);

// Route: PUT /api/repair-request/:id/reactivate (Admin only)
router.put(
  '/:id/reactivate',
  authenticate,
  authorize('admin'),
  reactivateRepairRequest
);

// Route: DELETE /api/repair-request/:id (Admin only - Deactivates/cancels ticket)
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  deleteRepairRequest
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
  verifyUploadSignatures,
  validateWorkLog,
  createWorkLog
);

// Route: PUT /api/repair-request/:id/customer-description (Admin & Technicians only)
router.put(
  '/:id/customer-description',
  authenticate,
  authorize('admin', 'technician'),
  validateCustomerDescription,
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
  validateTransferTicket,
  transferTicket
);

// Route: GET /api/repair-request/:id/transfers (Admin & Technicians)
router.get(
  '/:id/transfers',
  authenticate,
  authorize('admin', 'technician'),
  getTicketTransfers
);

// Route: POST /api/repair-request/:id/feedback
router.post(
  '/:id/feedback',
  authenticate,
  authorize('customer', 'company'),
  submitFeedback
);

// Route: POST /api/repair-request/:id/diagnosis (Technician & Admin)
router.post(
  '/:id/diagnosis',
  authenticate,
  authorize('admin', 'technician'),
  validateDiagnosis,
  submitDiagnosis
);

// Route: POST /api/repair-request/:id/approve-estimate (Customer, Company, Admin & Public tracking)
router.post(
  '/:id/approve-estimate',
  optionalAuth,
  approveEstimate
);

// Route: POST /api/repair-request/:id/reject-estimate (Customer, Company, Admin & Public tracking)
router.post(
  '/:id/reject-estimate',
  optionalAuth,
  rejectEstimate
);

// Route: POST /api/repair-request/:id/request-repair-again (Customer, Company, Admin & Public tracking)
router.post(
  '/:id/request-repair-again',
  optionalAuth,
  requestRepairAgain
);

// Route: POST /api/repair-request/:id/hold (Admin only)
router.post(
  '/:id/hold',
  authenticate,
  authorize('admin'),
  placeTicketOnHold
);

// Route: POST /api/repair-request/:id/cancel-hold (Admin only)
router.post(
  '/:id/cancel-hold',
  authenticate,
  authorize('admin'),
  cancelHold
);

module.exports = router;
