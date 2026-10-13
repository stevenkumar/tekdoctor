const express = require('express');
const router = express.Router();
const { getPublicSiteData, getPincodeLocation } = require('../controllers/public.controller');

// Route: GET /api/public/site-data
router.get('/site-data', getPublicSiteData);

// Route: GET /api/public/pincode/:pincode
router.get('/pincode/:pincode', getPincodeLocation);

module.exports = router;

