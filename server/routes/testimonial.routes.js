const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const {
    submitTestimonial,
    getApprovedTestimonials,
    getAllTestimonialsAdmin,
    approveTestimonial,
    editTestimonialAdmin,
    deleteTestimonial
} = require('../controllers/testimonial.controller');

// Public route: fetch approved testimonials
router.get('/', getApprovedTestimonials);

// Logged-in customer/company: submit feedback
router.post('/', authenticate, submitTestimonial);

// Admin-only management endpoints
router.get('/admin', authenticate, authorize('admin'), getAllTestimonialsAdmin);
router.put('/:id/approve', authenticate, authorize('admin'), approveTestimonial);
router.put('/:id', authenticate, authorize('admin'), editTestimonialAdmin);
router.delete('/:id', authenticate, authorize('admin'), deleteTestimonial);

module.exports = router;
