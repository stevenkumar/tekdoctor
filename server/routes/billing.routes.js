const express = require('express');
const router = express.Router();

const {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  payInvoice,
  getQuotations,
  getQuotationById,
  createQuotation,
  updateQuotation,
  respondToQuotation
} = require('../controllers/billing.controller');
const { validateInvoice, validatePayInvoice } = require('../middleware/validate.middleware');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Route: GET /api/billing/invoices (Customers view their own, Admin/Tech view all)
router.get('/invoices', authenticate, getInvoices);

// Route: GET /api/billing/invoices/:id (Access restricted to owner or Admin/Tech)
router.get('/invoices/:id', authenticate, getInvoiceById);

// Route: POST /api/billing/invoices (Admin & Technicians only)
router.post('/invoices', authenticate, authorize('admin', 'technician'), validateInvoice, createInvoice);

// Route: PUT /api/billing/invoices/:id (Admin & Technicians only)
router.put('/invoices/:id', authenticate, authorize('admin', 'technician'), validateInvoice, updateInvoice);

// Route: DELETE /api/billing/invoices/:id (Admin only)
router.delete('/invoices/:id', authenticate, authorize('admin'), deleteInvoice);

// Route: POST /api/billing/pay (Process mock payment for invoice)
router.post('/pay', authenticate, validatePayInvoice, payInvoice);

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
