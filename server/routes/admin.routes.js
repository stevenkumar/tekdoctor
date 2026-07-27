const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const admin = require('../controllers/admin.controller');
const upload = require('../config/multer.config');

// All admin routes require authentication + admin role
router.use(authenticate);
router.use(authorize('admin'));

// Dashboard
router.get('/dashboard-stats', admin.getDashboardStats);

// Customers
router.get('/customers', admin.getCustomers);
router.put('/customers/:id', admin.updateCustomer);
router.delete('/customers/:id', admin.deleteCustomer);
router.get('/customers/:id/history', admin.getCustomerHistory);
router.post('/users/:id/reset-password', admin.resetUserPassword);

// Companies & B2B Oversight
router.get('/companies', admin.getCompanies);
router.post('/companies', admin.createCompany);
router.get('/companies/stats', admin.getCompanyStats);
router.get('/companies/:id/detail', admin.getCompanyDetails);
router.put('/companies/:id', admin.updateCompany);
router.put('/companies/:id/status', admin.toggleCompanyStatus);
router.delete('/companies/:id', admin.deleteCompany);

// Bulk Operations
router.post('/tickets/bulk', admin.bulkUpdateTickets);

// Contacts
router.get('/contacts', admin.getContacts);
router.delete('/contacts/:id', admin.deleteContact);
router.post('/contacts/:id/reply', admin.replyToContact);

// Site Settings
router.get('/settings', admin.getSettings);
router.put('/settings', admin.updateSettings);
router.post('/settings/test-email', admin.testEmailSettings);

// Homepage Content
router.get('/homepage', admin.getHomepageContent);
router.put('/homepage/:id', admin.updateHomepageContent);

// Media Upload
router.post('/upload', upload.single('file'), admin.uploadFile);

// Activity Logs
router.get('/activity-logs', admin.getActivityLogs);

// Reports
router.get('/reports', admin.getReports);

// Profile
router.put('/profile', admin.updateProfile);
router.put('/change-password', admin.changePassword);

module.exports = router;
