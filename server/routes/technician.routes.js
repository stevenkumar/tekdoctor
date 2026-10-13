const express = require('express');
const router = express.Router();

const { getTechnicians, createTechnician, deleteTechnician, updateTechnician, toggleTechnicianStatus, resetTechnicianPassword, getTechnicianWorkload } = require('../controllers/technician.controller');
const { updateProfile } = require('../controllers/admin.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validateCreateTechnician, validateUpdateTechnician, validateAdminProfile } = require('../middleware/validate.middleware');
const { formatResponse } = require('../utils/helpers');

// Route: GET /api/technicians (Admin and Technician)
router.get('/', authenticate, authorize('admin', 'technician'), getTechnicians);

// Route: PUT /api/technicians/profile (Technician profile update)
router.put('/profile', authenticate, authorize('technician'), validateAdminProfile, updateProfile);

// Route: PUT /api/technicians/change-password (Technicians are restricted from self-service password changes)
router.put('/change-password', authenticate, authorize('technician'), (req, res) => {
    return res.status(403).json(formatResponse(false, 'Technicians are not authorized to change their own passwords. Please contact your coordinator.'));
});

// Route: POST /api/technicians (Admin only — creates a new technician account)
router.post('/', authenticate, authorize('admin'), validateCreateTechnician, createTechnician);

// Route: PUT /api/technicians/:id (Admin only — update technician)
router.put('/:id', authenticate, authorize('admin'), validateUpdateTechnician, updateTechnician);

// Route: PATCH /api/technicians/:id/toggle-status (Admin only — activate/deactivate)
router.patch('/:id/toggle-status', authenticate, authorize('admin'), toggleTechnicianStatus);
router.put('/:id/toggle-status', authenticate, authorize('admin'), toggleTechnicianStatus);
router.put('/:id/reactivate', authenticate, authorize('admin'), (req, res, next) => {
    req.body = { ...req.body, isActive: true };
    toggleTechnicianStatus(req, res, next);
});

// Route: POST /api/technicians/:id/reset-password (Admin only — reset password)
router.post('/:id/reset-password', authenticate, authorize('admin'), resetTechnicianPassword);

// Route: GET /api/technicians/:id/workload (Admin only — get workload)
router.get('/:id/workload', authenticate, authorize('admin'), getTechnicianWorkload);

// Route: DELETE /api/technicians/:id (Admin only — removes a technician account)
router.delete('/:id', authenticate, authorize('admin'), deleteTechnician);

module.exports = router;
