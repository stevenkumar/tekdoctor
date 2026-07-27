const express = require('express');
const router = express.Router();

const { getTechnicians, createTechnician, deleteTechnician, updateTechnician, toggleTechnicianStatus, resetTechnicianPassword, getTechnicianWorkload } = require('../controllers/technician.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Route: GET /api/technicians (Admin and Technician)
router.get('/', authenticate, authorize('admin', 'technician'), getTechnicians);

// Route: POST /api/technicians (Admin only — creates a new technician account)
router.post('/', authenticate, authorize('admin'), createTechnician);

// Route: PUT /api/technicians/:id (Admin only — update technician)
router.put('/:id', authenticate, authorize('admin'), updateTechnician);

// Route: PATCH /api/technicians/:id/toggle-status (Admin only — activate/deactivate)
router.patch('/:id/toggle-status', authenticate, authorize('admin'), toggleTechnicianStatus);

// Route: POST /api/technicians/:id/reset-password (Admin only — reset password)
router.post('/:id/reset-password', authenticate, authorize('admin'), resetTechnicianPassword);

// Route: GET /api/technicians/:id/workload (Admin only — get workload)
router.get('/:id/workload', authenticate, authorize('admin'), getTechnicianWorkload);

// Route: DELETE /api/technicians/:id (Admin only — removes a technician account)
router.delete('/:id', authenticate, authorize('admin'), deleteTechnician);

module.exports = router;
