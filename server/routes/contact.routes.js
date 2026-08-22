const express = require('express');
const router = express.Router();

const { submitContactForm } = require('../controllers/contact.controller');
const { validateContact } = require('../middleware/validate.middleware');
const { contactLimiter } = require('../middleware/rateLimiter.middleware');

// Route: POST /api/contact
router.post('/', contactLimiter, validateContact, submitContactForm);

module.exports = router;
