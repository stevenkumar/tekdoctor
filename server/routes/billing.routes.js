const express = require('express');
const router = express.Router();

const {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  reactivateInvoice,
  payInvoice,
  getPaymentConfig,
  getPaymentEligibility,
  createPaymentOrder,
  verifyPayment,
  handlePaymentFailure,
  getPayments,
  getPaymentReceipt,
  handleRazorpayWebhook,
  getQuotations,
  getQuotationById,
  createQuotation,
  updateQuotation,
  respondToQuotation,
  initiateOfflinePayment,
  recordCashCollected,
  verifyOfflinePayment,
  switchPaymentMethod,
  finalizeInvoice
} = require('../controllers/billing.controller');
const { validateInvoice, validatePayInvoice, validateCreateOrder } = require('../middleware/validate.middleware');
const { authenticate, optionalAuth, authorize } = require('../middleware/auth.middleware');

// ── Payment Gateway & Checkout Routes (Razorpay & Offline Arch) ────────────────

// Route: GET /api/billing/config (Public payment gateway settings & key ID)
router.get('/config', getPaymentConfig);

// Route: GET /api/billing/eligibility/:ticketId (Check payment eligibility for repair ticket)
router.get('/eligibility/:ticketId', optionalAuth, getPaymentEligibility);
router.get('/eligibility', optionalAuth, getPaymentEligibility);

// Route: POST /api/billing/create-order (Create Razorpay Order for Ticket or Invoice)
router.post('/create-order', optionalAuth, validateCreateOrder, createPaymentOrder);

// Route: POST /api/billing/offline-payment (Customer/Company/Guest initiate offline payment: Cash, Bank Transfer, Offline UPI)
router.post('/offline-payment', optionalAuth, initiateOfflinePayment);

// Route: POST /api/billing/switch-payment-method (Customer/Company/Guest switches from uncollected cash to online / another method)
router.post('/switch-payment-method', optionalAuth, switchPaymentMethod);

// Route: POST /api/billing/record-cash-collected (Technician/Admin records cash was collected)
router.post('/record-cash-collected', authenticate, authorize('technician', 'admin'), recordCashCollected);

// Route: POST /api/billing/verify-offline-payment (Admin verifies or rejects offline payment)
router.post('/verify-offline-payment', authenticate, authorize('admin'), verifyOfflinePayment);

// Route: POST /api/billing/verify-payment (Verify Signature and Settle Payment Status)
router.post('/verify-payment', optionalAuth, verifyPayment);

// Route: POST /api/billing/payment-failed (Record failed or cancelled payment attempt & notify user)
router.post('/payment-failed', optionalAuth, handlePaymentFailure);

// Route: POST /api/billing/webhook (Razorpay Webhook listener)
router.post('/webhook', express.raw({ type: 'application/json' }), handleRazorpayWebhook);

// Route: GET /api/billing/payments (Payment transaction history)
router.get('/payments', authenticate, getPayments);

// Route: GET /api/billing/receipt/ticket/:ticketId (Verified bill download with ownership check)
router.get('/receipt/ticket/:ticketId', optionalAuth, getPaymentReceipt);

// Route: GET /api/billing/receipt/:id (Verified bill download by invoice ID)
router.get('/receipt/:id', optionalAuth, getPaymentReceipt);

// ── Invoices Routes ────────────────────────────────────────────────────────────

// Route: GET /api/billing/invoices (Customers view their own, Admin/Tech view all)
router.get('/invoices', authenticate, getInvoices);

// Route: GET /api/billing/invoices/:id (Access restricted to owner or Admin/Tech)
router.get('/invoices/:id', authenticate, getInvoiceById);

// Route: POST /api/billing/invoices (Admin only - commercial invoice creation)
router.post('/invoices', authenticate, authorize('admin'), validateInvoice, createInvoice);

// Route: PUT /api/billing/invoices/:id (Admin only - commercial invoice editing)
router.put('/invoices/:id', authenticate, authorize('admin'), validateInvoice, updateInvoice);

// Route: POST /api/billing/invoices/:id/finalize (Admin only - Finalizes Draft invoice into authoritative commercial invoice)
router.post('/invoices/:id/finalize', authenticate, authorize('admin'), finalizeInvoice);

// Route: PUT /api/billing/invoices/:id/reactivate (Admin only)
router.put('/invoices/:id/reactivate', authenticate, authorize('admin'), reactivateInvoice);

// Route: DELETE /api/billing/invoices/:id (Admin only - Voids/deactivates invoice)
router.delete('/invoices/:id', authenticate, authorize('admin'), deleteInvoice);

// Route: POST /api/billing/pay (Manual offline settlement — Admin & Technicians only)
router.post('/pay', authenticate, authorize('admin', 'technician'), validatePayInvoice, payInvoice);

// ── Quotations Routes ──────────────────────────────────────────────────────────

// Route: GET /api/billing/quotations (Admin/Tech view all, Company view details)
router.get('/quotations', authenticate, authorize('admin', 'technician', 'company'), getQuotations);

// Route: GET /api/billing/quotations/:id
router.get('/quotations/:id', authenticate, authorize('admin', 'technician', 'company'), getQuotationById);

// Route: POST /api/billing/quotations (Admin/Tech only)
router.post('/quotations', authenticate, authorize('admin', 'technician'), createQuotation);

// Route: PUT /api/billing/quotations/:id (Admin/Tech only)
router.put('/quotations/:id', authenticate, authorize('admin', 'technician'), updateQuotation);

// Route: POST /api/billing/quotations/:id/respond (Company only)
router.post('/quotations/:id/respond', authenticate, authorize('company'), respondToQuotation);

module.exports = router;
