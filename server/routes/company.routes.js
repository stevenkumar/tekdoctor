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
    getCompanyRepairRequests,
    createCompanyRepairRequest,
    getStatsOverview,
    getMessages,
    sendMessage,
    importBulkDevices,
    importBulkRequests,
    getActivityLogs
} = require('../controllers/company.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const upload = require('../config/multer.config');

// Company logo upload (field name: companyLogo)
const logoUpload = upload.single('companyLogo');

// CSV upload for bulk imports (field name: csvFile)
const csvUpload = upload.single('csvFile');

// ── Authentication ──
router.post('/register', logoUpload, registerCompany);

// ── Profile ──
router.get('/profile', authenticate, authorize('company'), getCompanyProfile);
router.put('/profile', authenticate, authorize('company'), logoUpload, updateCompanyProfile);

// ── Statistics ──
router.get('/stats', authenticate, authorize('company'), getStatsOverview);

// ── Branches ──
router.get('/branches', authenticate, authorize('company'), getBranches);
router.post('/branches', authenticate, authorize('company'), createBranch);
router.put('/branches/:id', authenticate, authorize('company'), updateBranch);
router.put('/branches/:id/toggle-status', authenticate, authorize('company'), toggleBranchStatus);
router.put('/branches/:id/reactivate', authenticate, authorize('company'), (req, res, next) => {
    req.body = { ...req.body, isActive: true };
    toggleBranchStatus(req, res, next);
});
router.delete('/branches/:id', authenticate, authorize('company'), deleteBranch);

// ── Employees ──
router.get('/employees', authenticate, authorize('company'), getEmployees);
router.post('/employees', authenticate, authorize('company'), createEmployee);
router.put('/employees/:id', authenticate, authorize('company'), updateEmployee);
router.put('/employees/:id/toggle-status', authenticate, authorize('company'), toggleEmployeeStatus);
router.put('/employees/:id/reactivate', authenticate, authorize('company'), (req, res, next) => {
    req.body = { ...req.body, isActive: true };
    toggleEmployeeStatus(req, res, next);
});
router.delete('/employees/:id', authenticate, authorize('company'), deleteEmployee);

// ── Devices ──
router.get('/devices', authenticate, authorize('company'), getDevices);
router.post('/devices', authenticate, authorize('company'), createDevice);
router.put('/devices/:id', authenticate, authorize('company'), updateDevice);
router.put('/devices/:id/toggle-status', authenticate, authorize('company'), toggleDeviceStatus);
router.put('/devices/:id/reactivate', authenticate, authorize('company'), (req, res, next) => {
    req.body = { ...req.body, isActive: true };
    toggleDeviceStatus(req, res, next);
});
router.delete('/devices/:id', authenticate, authorize('company'), deleteDevice);

// ── Repair Requests ──
router.get('/repairs', authenticate, authorize('company'), getCompanyRepairRequests);
router.post('/repairs', authenticate, authorize('company'), createCompanyRepairRequest);

// ── Messages ──
router.get('/messages', authenticate, authorize('company', 'admin'), getMessages);
router.post('/messages', authenticate, authorize('company', 'admin'), sendMessage);

// ── Bulk Imports ──
router.post('/bulk-devices', authenticate, authorize('company'), csvUpload, importBulkDevices);
router.post('/bulk-requests', authenticate, authorize('company'), csvUpload, importBulkRequests);

// ── Activity Logs ──
router.get('/activity-logs', authenticate, authorize('company'), getActivityLogs);

module.exports = router;
