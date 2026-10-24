const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const admin = require('../controllers/admin.controller');
const upload = require('../config/multer.config');
const {
    validateCreateCompany,
    validateUpdateCompany,
    validateSetRepairCharges,
    validateContactReply,
    validateChangePassword,
    validateVerifyLoginOtp,
    validateResendOtp,
    validateUpdateCustomer,
    validateAdminProfile,
    validateSendMessage
} = require('../middleware/validate.middleware');
const { verifyUploadSignatures } = require('../middleware/security.middleware');

// All admin routes require authentication + admin role
router.use(authenticate);
router.use(authorize('admin'));

// Dashboard
router.get('/dashboard-stats', admin.getDashboardStats);
router.get('/dashboard/stats', admin.getDashboardStats);

// Customers
router.get('/customers', admin.getCustomers);
router.put('/customers/:id', validateUpdateCustomer, admin.updateCustomer);
router.put('/customers/:id/reactivate', admin.reactivateCustomer);
router.delete('/customers/:id', admin.deleteCustomer);
router.get('/customers/:id/history', admin.getCustomerHistory);
router.post('/users/:id/reset-password', admin.resetUserPassword);

// Corporate / Company Management
router.get('/companies/export', admin.exportCompaniesToCsv);
router.get('/companies', admin.getCompanies);
router.post('/companies', validateCreateCompany, admin.createCompany);
router.post('/companies/bulk-import', upload.csvUpload.single('csvFile'), verifyUploadSignatures, admin.importBulkCompanies);
router.get('/companies/stats', admin.getCompanyStats);
router.get('/companies/devices', admin.getCompanyDevices);
router.get('/companies/payments', admin.getCompanyPayments);
router.get('/companies/invoices', admin.getCompanyInvoices);
router.get('/companies/:id/export', admin.exportSingleCompanyDetails);
router.get('/companies/:id/detail', admin.getCompanyDetails);
router.put('/companies/:id', validateUpdateCompany, admin.updateCompany);
router.put('/companies/:id/status', admin.toggleCompanyStatus);
router.put('/companies/:id/reactivate', (req, res, next) => {
    req.body = { ...req.body, isActive: true };
    admin.toggleCompanyStatus(req, res, next);
});
router.delete('/companies/:id', admin.deleteCompany);

// Company Support Queries & Communications
router.get('/companies/:id/messages', admin.getCompanyMessages);
router.post('/companies/:id/messages', validateSendMessage, admin.replyCompanyMessage);
router.put('/companies/:id/messages/read', admin.markCompanyMessagesRead);


const { setRepairCharges } = require('../controllers/repair.controller');
const { getPaymentReceipt } = require('../controllers/billing.controller');

// Bulk Operations & Repair Pricing
router.post('/tickets/bulk', admin.bulkUpdateTickets);
router.put('/tickets/:id/charges', validateSetRepairCharges, setRepairCharges);
router.put('/repair-request/:id/charges', validateSetRepairCharges, setRepairCharges);

// Receipt & Bill Downloads
router.get('/receipt/ticket/:ticketId', getPaymentReceipt);
router.get('/receipt/:id', getPaymentReceipt);
router.get('/repair-request/:id/receipt', getPaymentReceipt);
router.get('/billing/receipt/ticket/:ticketId', getPaymentReceipt);

// Contacts
router.get('/contacts', admin.getContacts);
router.delete('/contacts/:id', admin.deleteContact);
router.post('/contacts/bulk-delete', admin.bulkDeleteContacts);
router.delete('/contacts', admin.bulkDeleteContacts);
router.post('/contacts/:id/reply', validateContactReply, admin.replyToContact);

// Site Settings
router.get('/settings', admin.getSettings);
router.put('/settings', admin.updateSettings);
router.post('/settings/test-email', admin.testEmailSettings);

// Homepage Content
router.get('/homepage', admin.getHomepageContent);
router.put('/homepage/section/:section', admin.updateHomepageContentBySection);
router.put('/homepage/:id', admin.updateHomepageContent);

// Media Upload
router.post('/upload', upload.single('file'), verifyUploadSignatures, admin.uploadFile);

// Activity Logs
router.get('/activity-logs', admin.getActivityLogs);

// Task Transfers
router.get('/task-transfers', admin.getAllTaskTransfers);

// Reports
router.get('/reports', admin.getReports);

// Profile
router.put('/profile', validateAdminProfile, admin.updateProfile);
router.put('/change-password', validateChangePassword, admin.changePassword);
router.post('/verify-change-password-otp', validateVerifyLoginOtp, admin.verifyChangePasswordOtp);
router.post('/resend-change-password-otp', validateResendOtp, admin.resendChangePasswordOtp);

module.exports = router;
