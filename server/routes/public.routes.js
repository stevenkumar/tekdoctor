const express = require('express');
const router = express.Router();
const { getPublicSiteData } = require('../controllers/public.controller');

// Route: GET /api/public/site-data
router.get('/site-data', getPublicSiteData);

module.exports = router;
