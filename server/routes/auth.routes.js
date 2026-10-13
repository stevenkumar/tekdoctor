const express = require('express');
const router = express.Router();

const { signup, signin, setPassword, forgotPassword, resetPassword, googleSignIn, logout, updateProfile } = require('../controllers/auth.controller');
const { validateSignUp, validateSignIn, validateSetPassword, validateForgotPassword, validateResetPassword, validateGoogleSignIn, validateUpdateProfile } = require('../middleware/validate.middleware');
const { authLimiter } = require('../middleware/rateLimiter.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { verifyRecaptcha } = require('../middleware/recaptcha.middleware');

// Route: POST /api/auth/signup
router.post('/signup', authLimiter, verifyRecaptcha('signup'), validateSignUp, signup);

// Route: POST /api/auth/signin
router.post('/signin', authLimiter, verifyRecaptcha('login'), validateSignIn, signin);

// Route: POST /api/auth/google (Public OAuth / OpenID Connect — rate limited)
router.post('/google', authLimiter, verifyRecaptcha('google_login'), validateGoogleSignIn, googleSignIn);

// Route: POST /api/auth/forgot-password (Public — rate limited)
router.post('/forgot-password', authLimiter, verifyRecaptcha('forgot_password'), validateForgotPassword, forgotPassword);

// Route: POST /api/auth/reset-password (Public — rate limited with token)
router.post('/reset-password', authLimiter, validateResetPassword, resetPassword);

// Route: PUT /api/auth/set-password (Authenticated)
router.put('/set-password', authenticate, validateSetPassword, setPassword);

// Route: POST /api/auth/logout (Authenticated — invalidates session in DB)
router.post('/logout', authenticate, logout);

// Route: PUT /api/auth/profile (Authenticated — update Name and Phone)
router.put('/profile', authenticate, validateUpdateProfile, updateProfile);

module.exports = router;
