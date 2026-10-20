const express = require('express');
const router = express.Router();
const {
    registerCompany,
    getCompanyProfile,
    updateCompanyProfile,
    getBranches,
    createBranch,
    updateBranch,
    deleteBranch,
    toggleBranchStatus,
    getEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    toggleEmployeeStatus,
    getDevices,
    createDevice,
    updateDevice,
    deleteDevice,
    toggleDeviceStatus,
    getDeviceRepairHistory,
    getCompanyRepairRequests,
    createCompanyRepairRequest,
    getStatsOverview,
    getMessages,
    sendMessage,
    importBulkDevices,
    importBulkRequests,
    exportCompanyDevicesCsv,
    exportCompanyRepairsCsv,
    importBulkEmployees,
    exportCompanyEmployeesCsv,
    importBulkBranches,
    exportCompanyBranchesCsv,
    downloadCompanyTemplate,
    getActivityLogs
} = require('../controllers/company.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimiter.middleware');
const upload = require('../config/multer.config');
const {
    validateCompanyRegister,
    validateBranch,
    validateEmployee,
    validateDevice,
    validateCompanyRepairRequest,
    validateCompanyProfile,
    validateSendMessage
} = require('../middleware/validate.middleware');
const { verifyUploadSignatures, stripProtectedFields } = require('../middleware/security.middleware');
const { csvUpload } = upload;

// Company logo upload (field name: companyLogo)
const logoUpload = upload.single('companyLogo');

// CSV upload for bulk imports (field name: csvFile)
const csvImportUpload = csvUpload.single('csvFile');

// ── Authentication ──
router.post('/register', authLimiter, logoUpload, verifyUploadSignatures, validateCompanyRegister, registerCompany);

// ── Profile ──
router.get('/profile', authenticate, authorize('company', 'admin'), getCompanyProfile);
router.put('/profile', authenticate, authorize('company', 'admin'), logoUpload, verifyUploadSignatures, validateCompanyProfile, updateCompanyProfile);

// ── Statistics ──
router.get('/stats', authenticate, authorize('company', 'admin'), getStatsOverview);

// ── Branches ──
router.get('/branches/export', authenticate, authorize('company', 'admin'), exportCompanyBranchesCsv);
router.get('/branches', authenticate, authorize('company', 'admin'), getBranches);
router.post('/branches', authenticate, authorize('company', 'admin'), validateBranch, createBranch);
router.put('/branches/:id', authenticate, authorize('company', 'admin'), validateBranch, updateBranch);
router.put('/branches/:id/toggle-status', authenticate, authorize('company', 'admin'), toggleBranchStatus);
router.put('/branches/:id/reactivate', authenticate, authorize('company', 'admin'), (req, res, next) => {
    req.body = { ...req.body, isActive: true };
    toggleBranchStatus(req, res, next);
});
router.delete('/branches/:id', authenticate, authorize('company', 'admin'), deleteBranch);

// ── Employees ──
router.get('/employees/export', authenticate, authorize('company', 'admin'), exportCompanyEmployeesCsv);
router.get('/employees', authenticate, authorize('company', 'admin'), getEmployees);
router.post('/employees', authenticate, authorize('company', 'admin'), validateEmployee, createEmployee);
router.put('/employees/:id', authenticate, authorize('company', 'admin'), validateEmployee, updateEmployee);
router.put('/employees/:id/toggle-status', authenticate, authorize('company', 'admin'), toggleEmployeeStatus);
router.put('/employees/:id/reactivate', authenticate, authorize('company', 'admin'), (req, res, next) => {
    req.body = { ...req.body, isActive: true };
    toggleEmployeeStatus(req, res, next);
});
router.delete('/employees/:id', authenticate, authorize('company', 'admin'), deleteEmployee);

// ── Devices ──
router.get('/devices/export', authenticate, authorize('company', 'admin'), exportCompanyDevicesCsv);
router.get('/devices', authenticate, authorize('company', 'admin'), getDevices);
router.post('/devices', authenticate, authorize('company', 'admin'), validateDevice, createDevice);
router.put('/devices/:id', authenticate, authorize('company', 'admin'), validateDevice, updateDevice);
router.put('/devices/:id/toggle-status', authenticate, authorize('company', 'admin'), toggleDeviceStatus);
router.put('/devices/:id/reactivate', authenticate, authorize('company', 'admin'), (req, res, next) => {
    req.body = { ...req.body, isActive: true };
    toggleDeviceStatus(req, res, next);
});
router.delete('/devices/:id', authenticate, authorize('company', 'admin'), deleteDevice);
router.get('/devices/:id/history', authenticate, authorize('company', 'admin'), getDeviceRepairHistory);

// ── Repair Requests ──
router.get('/repairs/export', authenticate, authorize('company', 'admin'), exportCompanyRepairsCsv);
router.get('/repairs', authenticate, authorize('company', 'admin'), getCompanyRepairRequests);
router.post('/repairs', authenticate, authorize('company', 'admin'), stripProtectedFields(['status', 'repair_cost', 'customer_approval_status', 'payment_status']), validateCompanyRepairRequest, createCompanyRepairRequest);

// ── Messages ──
router.get('/messages', authenticate, authorize('company', 'admin'), getMessages);
router.post('/messages', authenticate, authorize('company', 'admin'), validateSendMessage, sendMessage);

// ── Bulk Imports ──
router.post('/bulk-employees', authenticate, authorize('company', 'admin'), csvImportUpload, verifyUploadSignatures, importBulkEmployees);
router.post('/bulk-branches', authenticate, authorize('company', 'admin'), csvImportUpload, verifyUploadSignatures, importBulkBranches);
router.post('/bulk-devices', authenticate, authorize('company', 'admin'), csvImportUpload, verifyUploadSignatures, importBulkDevices);
router.post('/bulk-requests', authenticate, authorize('company', 'admin'), csvImportUpload, verifyUploadSignatures, importBulkRequests);

// ── Templates ──
router.get('/templates/:module', authenticate, authorize('company', 'admin'), downloadCompanyTemplate);

// ── Activity Logs ──
router.get('/activity-logs', authenticate, authorize('company', 'admin'), getActivityLogs);

module.exports = router;

