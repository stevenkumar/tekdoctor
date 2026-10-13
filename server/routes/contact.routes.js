const express = require('express');
const router = express.Router();

const { submitContactForm } = require('../controllers/contact.controller');
const { validateContact } = require('../middleware/validate.middleware');
const { contactLimiter } = require('../middleware/rateLimiter.middleware');
const { verifyRecaptcha } = require('../middleware/recaptcha.middleware');

// Route: POST /api/contact
router.post('/', contactLimiter, verifyRecaptcha('contact_us'), validateContact, submitContactForm);

module.exports = router;
