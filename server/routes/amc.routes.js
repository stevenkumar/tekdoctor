const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const {
  getAdminOverview,
  getPublicPlans,
  getAdminPlans,
  createPlan,
  updatePlan,
  togglePlanStatus,
  createRequest,
  getCompanyRequests,
  getAdminRequests,
  reviewRequest,
  createAdminContract,
  getAdminContracts,
  getAdminContractDetails,
  approveContract,
  getCompanyContracts,
  getCompanyContractDetails,
  acceptOffer,
  rejectOffer,
  updateContractStatus,
  getCapacity,
  assignDevices,
  requestReplacement,
  getCompanyReplacements,
  getAdminReplacements,
  reviewReplacement,
  checkEligibility,
  createPaymentOrder,
  verifyPayment,
  initiateOfflinePayment,
  verifyOfflinePayment
} = require('../controllers/amc.controller');

// ── Public Routes ───────────────────────────────────────────────────────
// Anyone can view active public plans
router.get('/plans', getPublicPlans);

// ── Shared Authenticated Routes ─────────────────────────────────────────
// Check repair eligibility (accessible by authenticated users: admin, company, technician)
router.get('/eligibility', authenticate, checkEligibility);

// ── Company Routes ──────────────────────────────────────────────────────
router.get('/company/plans', authenticate, authorize('company'), getPublicPlans);
router.post('/company/requests', authenticate, authorize('company'), createRequest);
router.get('/company/requests', authenticate, authorize('company'), getCompanyRequests);
router.get('/company/contracts', authenticate, authorize('company'), getCompanyContracts);
router.get('/company/contracts/:id', authenticate, authorize('company'), getCompanyContractDetails);
router.post('/company/contracts/:id/accept', authenticate, authorize('company'), acceptOffer);
router.post('/company/contracts/:id/reject', authenticate, authorize('company'), rejectOffer);
router.get('/company/contracts/:id/capacity', authenticate, authorize('company', 'admin'), getCapacity);
router.post('/company/contracts/:id/devices', authenticate, authorize('company'), assignDevices);
router.post('/company/contracts/:id/create-payment-order', authenticate, authorize('company'), createPaymentOrder);
router.post('/company/contracts/:id/verify-payment', authenticate, authorize('company'), verifyPayment);
router.post('/company/contracts/:id/offline-payment', authenticate, authorize('company'), initiateOfflinePayment);
router.post('/company/replacements', authenticate, authorize('company'), requestReplacement);
router.get('/company/replacements', authenticate, authorize('company'), getCompanyReplacements);

// ── Admin Routes ────────────────────────────────────────────────────────
router.get('/admin/overview', authenticate, authorize('admin'), getAdminOverview);
router.get('/admin/plans', authenticate, authorize('admin'), getAdminPlans);
router.post('/admin/plans', authenticate, authorize('admin'), createPlan);
router.put('/admin/plans/:id', authenticate, authorize('admin'), updatePlan);
router.patch('/admin/plans/:id/toggle-status', authenticate, authorize('admin'), togglePlanStatus);
router.get('/admin/requests', authenticate, authorize('admin'), getAdminRequests);
router.put('/admin/requests/:id/review', authenticate, authorize('admin'), reviewRequest);
router.post('/admin/contracts', authenticate, authorize('admin'), createAdminContract);
router.get('/admin/contracts', authenticate, authorize('admin'), getAdminContracts);
router.get('/admin/contracts/:id', authenticate, authorize('admin'), getAdminContractDetails);
router.put('/admin/contracts/:id/approve', authenticate, authorize('admin'), approveContract);
router.put('/admin/contracts/:id/status', authenticate, authorize('admin'), updateContractStatus);
router.post('/admin/contracts/:id/verify-offline-payment', authenticate, authorize('admin'), verifyOfflinePayment);
router.get('/admin/replacements', authenticate, authorize('admin'), getAdminReplacements);
router.put('/admin/replacements/:id/review', authenticate, authorize('admin'), reviewReplacement);

module.exports = router;

