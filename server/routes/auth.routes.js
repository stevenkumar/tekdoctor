const express = require('express');
const router = express.Router();

const { signup, signin, setPassword } = require('../controllers/auth.controller');
const { validateSignUp, validateSignIn, validateSetPassword } = require('../middleware/validate.middleware');
const { authLimiter } = require('../middleware/rateLimiter.middleware');
const { authenticate } = require('../middleware/auth.middleware');

// Route: POST /api/auth/signup
router.post('/signup', authLimiter, validateSignUp, signup);

// Route: POST /api/auth/signin
router.post('/signin', authLimiter, validateSignIn, signin);

// Route: PUT /api/auth/set-password
router.put('/set-password', authenticate, validateSetPassword, setPassword);

module.exports = router;
