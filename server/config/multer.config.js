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

const spreadsheetMimeTypes = [
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];
const spreadsheetExtensions = ['.csv', '.xlsx'];

const csvFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  // Explicitly reject legacy binary .xls files with actionable explanation
  if (ext === '.xls') {
    const err = new Error('Legacy Excel 97-2003 (.xls) files are not supported. Please save or export your spreadsheet as an Excel Workbook (.xlsx) or CSV (.csv).');
    err.statusCode = 400;
    return cb(err, false);
  }

  // Windows sometimes associates application/vnd.ms-excel with CSV files
  const isAllowedMime = spreadsheetMimeTypes.includes(file.mimetype) || (file.mimetype === 'application/vnd.ms-excel' && ext === '.csv');
  const isAllowedExt = spreadsheetExtensions.includes(ext);

  if (isAllowedMime || isAllowedExt) {
    cb(null, true);
  } else {
    const err = new Error('Invalid file type. Upload an Excel (.xlsx) or CSV (.csv) file.');
    err.statusCode = 400;
    cb(err, false);
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
