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

// Image validation filter
const imageFileFilter = (req, file, cb) => {
  if (config.uploads.allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed formats: ${config.uploads.allowedMimeTypes.join(', ')}`), false);
  }
};

const csvMimeTypes = ['text/csv', 'application/csv', 'application/vnd.ms-excel'];
const csvFileFilter = (req, file, cb) => {
  if (csvMimeTypes.includes(file.mimetype) || path.extname(file.originalname).toLowerCase() === '.csv') {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Upload a CSV file.'), false);
  }
};

// Initialize Multer upload middleware
const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: config.uploads.maxSizeBytes
  }
});

const csvUpload = multer({
  storage,
  fileFilter: csvFileFilter,
  limits: {
    fileSize: config.uploads.maxSizeBytes
  }
});

module.exports = upload;
module.exports.csvUpload = csvUpload;
