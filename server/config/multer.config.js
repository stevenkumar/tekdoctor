const multer = require('multer');
const path = require('path');
const config = require('./app.config');
const { sanitizeFilename } = require('../utils/helpers');

// Configure Disk Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let dest = config.paths.uploadsRoot;
    
    // Choose destination subfolder based on field name
    if (file.fieldname === 'deviceImage') {
      dest = config.paths.deviceImages;
    } else if (file.fieldname === 'errorScreenshot') {
      dest = config.paths.screenshots;
    }
    
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const safeName = sanitizeFilename(file.originalname);
    cb(null, safeName);
  }
});

// File validation filter
const fileFilter = (req, file, cb) => {
  if (config.uploads.allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed formats: ${config.uploads.allowedMimeTypes.join(', ')}`), false);
  }
};

// Initialize Multer upload middleware
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.uploads.maxSizeBytes
  }
});

module.exports = upload;
