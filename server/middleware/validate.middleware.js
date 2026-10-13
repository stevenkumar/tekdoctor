const { body, param, validationResult } = require('express-validator');
const { formatResponse } = require('../utils/helpers');

/**
 * Common middleware helper to execute rules and check results
 */
const validate = (validations) => {
  return async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // Format errors as an object: { fieldName: message }
    const formattedErrors = {};
    errors.array().forEach(err => {
      const field = err.path || err.param;
      if (!formattedErrors[field]) {
        formattedErrors[field] = err.msg;
      }
    });

    const errorValues = Object.values(formattedErrors);
    const primaryMessage = errorValues.length > 0 ? errorValues[0] : 'Validation failed.';

    const response = formatResponse(false, primaryMessage, formattedErrors);
    response.errors = formattedErrors;
    return res.status(400).json(response);
  };
};

// ── Reusable Custom Validators ─────────────────────────────────────────────

const isValidName = (value) => {
  if (!value || typeof value !== 'string') {
    throw new Error('Name must be between 2 and 50 characters.');
  }
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 50) {
    throw new Error('Name must be between 2 and 50 characters.');
  }
  if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) {
    throw new Error('Name can only contain letters, spaces, hyphens, and apostrophes.');
  }
  return true;
};

const normalizePhoneNumber = (value) => {
  if (!value) return value;
  const clean = String(value).trim().replace(/[\s\-()]/g, '');
  if (/^[6-9]\d{9}$/.test(clean)) {
    return `+91${clean}`;
  }
  if (/^91[6-9]\d{9}$/.test(clean)) {
    return `+${clean}`;
  }
  return clean;
};

const isValidPhone = (value) => {
  if (!value) return true;
  const str = String(value).trim();
  const clean = str.replace(/[\s\-()]/g, '');

  // Must match either + followed by 7-15 digits, or standard 10-digit number
  if (!/^(\+[1-9]\d{6,14}|\d{10})$/.test(clean)) {
    throw new Error('Please enter a valid 10-digit phone number (or international number with country code).');
  }

  // Extract digits only
  const digitsOnly = clean.replace(/\D/g, '');

  // Reject repeated single digits like 0000000000, 1111111111, 9999999999
  if (/^(\d)\1+$/.test(digitsOnly)) {
    throw new Error('Please enter a valid 10-digit phone number.');
  }

  // If Indian 10-digit or +91 number, national part must start with 6, 7, 8, 9
  if (clean.startsWith('+91') && clean.length === 13) {
    if (!/^[6-9]/.test(clean.substring(3))) {
      throw new Error('Please enter a valid 10-digit phone number.');
    }
  } else if (/^\d{10}$/.test(clean)) {
    if (!/^[6-9]/.test(clean)) {
      throw new Error('Please enter a valid 10-digit phone number.');
    }
  }

  return true;
};

const isNonRepeatingPhone = isValidPhone;

const isValidPincode = (value) => {
  if (!value) return true;
  const trimmed = String(value).trim();
  if (!/^[1-9][0-9]{5}$/.test(trimmed)) {
    throw new Error('Please enter a valid 6-digit postal code.');
  }
  return true;
};

const isValidAddress = (value) => {
  if (!value) return true;
  const trimmed = String(value).trim();
  if (trimmed.length > 150) {
    throw new Error('Address cannot exceed 150 characters.');
  }
  return true;
};

const isValidModelNumber = (value) => {
  if (!value) return true;
  const trimmed = String(value).trim();
  if (trimmed.length > 30) {
    throw new Error('Model number cannot exceed 30 characters.');
  }
  if (!/^[a-zA-Z0-9\s\-._/]+$/.test(trimmed)) {
    throw new Error('Model number contains invalid characters.');
  }
  return true;
};

const isValidSerialNumber = (value) => {
  if (!value) return true;
  const trimmed = String(value).trim();
  if (trimmed.length > 30) {
    throw new Error('Serial number cannot exceed 30 characters.');
  }
  if (!/^[a-zA-Z0-9\s\-._/]+$/.test(trimmed)) {
    throw new Error('Serial number contains invalid characters.');
  }
  return true;
};

const isValidDeviceConfig = (value) => {
  if (!value) return true;
  const trimmed = String(value).trim();
  if (trimmed.length > 200) {
    throw new Error('Device configuration cannot exceed 200 characters.');
  }
  return true;
};

const isValidDescription = (value) => {
  if (!value) return true;
  const trimmed = String(value).trim();
  if (trimmed.length > 500) {
    throw new Error('Message cannot exceed 500 characters.');
  }
  return true;
};

const isFiniteNonNegativeAmount = (value) => {
  const num = Number(value);
  if (isNaN(num) || !isFinite(num) || num < 0) {
    throw new Error('Amount must be a valid, positive, finite number.');
  }
  if (num > 10000000) {
    throw new Error('Amount exceeds maximum allowed limit (₹10,000,000).');
  }
  // Max 2 decimal places
  const parts = String(value).split('.');
  if (parts.length === 2 && parts[1].length > 2) {
    throw new Error('Amount cannot exceed 2 decimal places.');
  }
  return true;
};

// ── Auth Validations ───────────────────────────────────────────────────────

const validateSignUp = validate([
  body('name')
    .trim()
    .notEmpty().withMessage('Full name is required.')
    .custom(isValidName),
  body('email')
    .trim()
    .notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .isLength({ max: 255 }).withMessage('Email cannot exceed 255 characters.')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.')
    .custom((val) => {
      if (/^\s|\s$/.test(val)) throw new Error('Password cannot start or end with spaces.');
      return true;
    }),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidPhone)
    .customSanitizer(normalizePhoneNumber),
  body('role')
    .optional()
    .equals('customer').withMessage('Public signup can only create customer accounts.')
]);

const validateSignIn = validate([
  body('email')
    .trim()
    .notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required.')
]);

const validateSetPassword = validate([
  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.')
]);

const validateForgotPassword = validate([
  body('email')
    .trim()
    .notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail()
]);

const validateResetPassword = validate([
  body('token')
    .trim()
    .notEmpty().withMessage('Reset token is required.'),
  body('newPassword')
    .custom((val, { req }) => {
      const pass = val || req.body.password;
      if (!pass) {
        throw new Error('New password is required.');
      }
      if (typeof pass !== 'string' || pass.length < 8 || pass.length > 128) {
        throw new Error('Password must be between 8 and 128 characters.');
      }
      if (!/[A-Z]/.test(pass)) {
        throw new Error('Password must contain at least one uppercase letter.');
      }
      if (!/[0-9]/.test(pass)) {
        throw new Error('Password must contain at least one number.');
      }
      if (/^\s|\s$/.test(pass)) {
        throw new Error('Password cannot start or end with spaces.');
      }
      req.body.newPassword = pass;
      req.body.password = pass;
      return true;
    })
]);

const validateChangePassword = validate([
  body('currentPassword')
    .notEmpty().withMessage('Current password is required.'),
  body('newPassword')
    .notEmpty().withMessage('New password is required.')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.')
    .custom((val, { req }) => {
      if (/^\s|\s$/.test(val)) throw new Error('Password cannot start or end with spaces.');
      if (val === req.body.currentPassword) throw new Error('New password must be different from current password.');
      return true;
    })
]);

const validateGoogleSignIn = (req, res, next) => {
  const { credential, code } = req.body || {};
  if (!credential && !code) {
    return res.status(400).json(formatResponse(false, 'Google authentication credential (id_token) or authorization code is required.'));
  }
  if (credential && (typeof credential !== 'string' || credential.trim().length === 0)) {
    return res.status(400).json(formatResponse(false, 'Google credential must be a valid non-empty string.'));
  }
  if (code && (typeof code !== 'string' || code.trim().length === 0)) {
    return res.status(400).json(formatResponse(false, 'Google authorization code must be a valid non-empty string.'));
  }
  next();
};

// ── Contact Validations ────────────────────────────────────────────────────

const validateContact = validate([
  body('name')
    .trim()
    .notEmpty().withMessage('Full name is required.')
    .custom(isValidName),
  body('email')
    .trim()
    .notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .isLength({ max: 255 }).withMessage('Email cannot exceed 255 characters.')
    .normalizeEmail(),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required.')
    .custom(isValidPhone)
    .customSanitizer(normalizePhoneNumber),
  body('message')
    .trim()
    .notEmpty().withMessage('Message is required.')
    .isLength({ min: 10, max: 500 }).withMessage('Message cannot exceed 500 characters.')
]);

const validateContactReply = validate([
  body('message')
    .custom((val, { req }) => {
      const msg = (val || req.body.replyMessage || '').trim();
      if (!msg) {
        throw new Error('Reply message is required.');
      }
      if (msg.length < 5 || msg.length > 1000) {
        throw new Error('Message must be between 5 and 1000 characters.');
      }
      return true;
    })
]);

// ── Repair Request Validations ─────────────────────────────────────────────

const ALLOWED_DEVICE_CATEGORIES = [
  'laptop', 'desktop pc', 'printer', 'cctv', 'monitor', 'ups', 'networking device', 'other',
  'desktop', 'pc'
];

const ALLOWED_PROBLEM_TYPES = [
  'not powering on', 'screen crack/flicker', 'keyboard/touchpad fault', 'battery/charging issue',
  'slow performance/boot loop', 'slow performance/virus', 'overheating/fan noise', 'hardware upgrade (ram/ssd)', 'os/software issue',
  'liquid damage', 'no power/no display', 'random blue screen/crash', 'overheating/dust cleaning',
  'hardware upgrade (gpu/ram/ssd)', 'power supply (psu) failure', 'os/software installation',
  'printer not printing', 'paper jam/feeder issue', 'ghosting/faded prints', 'error code/connectivity failure',
  'driver/installation issue', 'cartridge/toner refill', 'spooler error', 'cctv camera offline',
  'no video feed/blank screen', 'intermittent signal loss', 'nvr/dvr loading/storage issue',
  'password reset/admin lockout', 'night vision mode failure', 'no display/standby indicator only',
  'dim screen/backlight issue', 'flickering/vertical lines', 'color distortion/bleeding',
  'physical panel damage', 'no power/backup fail', 'frequent alarm/beeping', 'battery replacement alert',
  'overload trip/voltage issue', 'no wifi/internet offline', 'router/switch reboot loop',
  'config/ssid password issue', 'local network access failure', 'range/signal strength issues',
  'hardware component fault', 'diagnostic request', 'general technical assistance', 'other',
  'hardware', 'software', 'network'
];

const ALLOWED_SERVICE_TYPES = [
  'bring to service center', 'home visit', 'pickup & drop', 'home service',
  'courier pickup', 'on-site', 'other', 'bring_to_center', 'home_visit', 'pickup_drop'
];

const ALLOWED_PRIORITIES = [
  'standard', 'priority', 'express (same day)', 'urgent (within 2 hours)',
  'express', 'urgent', 'low', 'medium', 'high', 'critical', 'emergency'
];

const DEPRECATED_PRIORITIES = [
  'express (same day)', 'urgent (within 2 hours)', 'express', 'urgent'
];

const ALLOWED_CONTACT_METHODS = [
  'whatsapp', 'phone call', 'call', 'email', 'phone', 'sms', 'message'
];

const validateRepairRequest = validate([
  body('customerName')
    .trim()
    .notEmpty().withMessage('Customer name is required.')
    .custom((val, { req }) => {
      if (req.body.deviceId || req.user?.role === 'company') {
        if (typeof val !== 'string' || val.trim().length < 2 || val.trim().length > 50) {
          throw new Error('Customer name must be between 2 and 50 characters.');
        }
        return true;
      }
      return isValidName(val);
    }),
  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required.')
    .custom(isValidPhone)
    .customSanitizer(normalizePhoneNumber),
  body('email')
    .trim()
    .notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .isLength({ max: 255 }).withMessage('Email cannot exceed 255 characters.')
    .normalizeEmail(),
  body('address')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidAddress),
  body('city')
    .trim()
    .notEmpty().withMessage('City is required.')
    .isLength({ min: 2, max: 100 }).withMessage('City must be between 2 and 100 characters.')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('City can only contain letters, spaces, and hyphens.'),
  body('state')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('State must be between 2 and 100 characters.')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('State can only contain letters, spaces, and hyphens.'),
  body('zipCode')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidPincode),
  body('deviceCategory')
    .custom((val, { req }) => {
      if (req.body.deviceId) return true;
      if (!val) throw new Error('Device category is required.');
      if (!ALLOWED_DEVICE_CATEGORIES.includes(val.toLowerCase())) {
        throw new Error('Invalid device category selected.');
      }
      return true;
    }),
  body('customDeviceCategory')
    .custom((value, { req }) => {
      const isOther = req.body.deviceCategory && req.body.deviceCategory.toLowerCase() === 'other';
      const trimmed = value ? String(value).trim() : '';
      if (isOther) {
        if (!trimmed) {
          throw new Error('Please specify your device category.');
        }
        if (trimmed.length < 2 || trimmed.length > 100) {
          throw new Error('Device category must be between 2 and 100 characters.');
        }
        if (!/^[a-zA-Z0-9\s/&'()\-]+$/.test(trimmed)) {
          throw new Error('Device category contains invalid characters.');
        }
      }
      return true;
    }),
  body('brand')
    .custom((val, { req }) => {
      if (req.body.deviceId) return true;
      if (!val) throw new Error('Brand is required.');
      if (val.length < 1 || val.length > 50) {
        throw new Error('Brand must be between 1 and 50 characters.');
      }
      return true;
    }),
  body('customBrand')
    .optional({ checkFalsy: true })
    .trim()
    .custom((value, { req }) => {
      if (req.body.brand && req.body.brand.toLowerCase() === 'other') {
        if (!value || value.length < 2 || value.length > 50) {
          throw new Error('Please specify your custom brand (2-50 characters).');
        }
      }
      return true;
    }),
  body('modelNumber')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidModelNumber),
  body('serialNumber')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidSerialNumber),
  body('deviceConfiguration')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidDeviceConfig),
  body('problemType')
    .trim()
    .notEmpty().withMessage('Problem type is required.')
    .custom((val) => {
      const normalized = val.toLowerCase().replace(/\s*\/\s*/g, '/').trim();
      const isAllowed = ALLOWED_PROBLEM_TYPES.some(t => t.toLowerCase().replace(/\s*\/\s*/g, '/').trim() === normalized);
      if (!isAllowed) {
        if (typeof val === 'string' && val.trim().length >= 2 && val.trim().length <= 100 && !/[<>]/.test(val)) {
          return true;
        }
        throw new Error('Invalid problem type selected.');
      }
      return true;
    }),
  body('customProblemType')
    .optional({ checkFalsy: true })
    .trim()
    .custom((value, { req }) => {
      if (req.body.problemType && req.body.problemType.toLowerCase() === 'other') {
        if (!value || value.length < 2 || value.length > 150) {
          throw new Error('Please specify your custom problem type (2-150 characters).');
        }
      }
      return true;
    }),
  body('problemDescription')
    .trim()
    .notEmpty().withMessage('Problem description is required.')
    .isLength({ min: 10, max: 500 }).withMessage('Problem description cannot exceed 500 characters.'),
  body('serviceType')
    .optional({ checkFalsy: true })
    .trim()
    .custom((value) => {
      if (!value) return true;
      if (!ALLOWED_SERVICE_TYPES.includes(value.toLowerCase())) {
        throw new Error('Invalid service type selected.');
      }
      return true;
    }),
  body('customServiceType')
    .optional({ checkFalsy: true })
    .trim()
    .custom((value, { req }) => {
      if (req.body.serviceType && req.body.serviceType.toLowerCase() === 'other') {
        if (!value || value.length < 2 || value.length > 150) {
          throw new Error('Please specify your custom service preference (2-150 characters).');
        }
      }
      return true;
    }),
  body('priority')
    .optional({ checkFalsy: true })
    .trim()
    .custom((value) => {
      if (!value) return true;
      const lower = value.toLowerCase();
      if (DEPRECATED_PRIORITIES.includes(lower)) {
        throw new Error('The selected priority option is currently unavailable. Please select Standard or Priority.');
      }
      if (!ALLOWED_PRIORITIES.includes(lower)) {
        throw new Error('Invalid priority selected.');
      }
      return true;
    }),
  body('preferredContactMethod')
    .optional({ checkFalsy: true })
    .custom((value) => {
      if (!value) return true;
      let methods = [];
      if (Array.isArray(value)) {
        methods = value.map(m => String(m).trim());
      } else if (typeof value === 'string') {
        methods = value.split(',').map(m => m.trim());
      }
      for (const m of methods) {
        if (m && !ALLOWED_CONTACT_METHODS.includes(m.toLowerCase())) {
          throw new Error('Invalid preferred contact method.');
        }
      }
      return true;
    })
]);

const validateStatusUpdate = validate([
  body('status')
    .trim()
    .notEmpty().withMessage('Status is required.')
    .isIn(['pending', 'in_progress', 'completed', 'delivered', 'cancelled']).withMessage('Invalid status value.'),
  body('isOverride')
    .optional()
    .isBoolean().withMessage('isOverride must be a boolean.'),
  body('overrideReason')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Override reason cannot exceed 500 characters.')
]);

const validateSetRepairCharges = validate([
  body('repairCost')
    .notEmpty().withMessage('Repair charges amount is required.')
    .custom(isFiniteNonNegativeAmount),
  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters.')
]);

const validateDiagnosis = validate([
  body('diagnosis')
    .trim()
    .notEmpty().withMessage('Diagnosis description is required.')
    .isLength({ min: 5, max: 500 }).withMessage('Diagnosis description cannot exceed 500 characters.'),
  body('estimatedCost')
    .optional({ checkFalsy: true })
    .custom(isFiniteNonNegativeAmount),
  body('additionalCharges')
    .optional({ checkFalsy: true })
    .custom(isFiniteNonNegativeAmount),
  body('estimatedCompletionDate')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Estimated completion date must be a valid ISO 8601 date.')
]);

const validateWorkLog = validate([
  body('notes')
    .trim()
    .notEmpty().withMessage('Work log notes are required.')
    .isLength({ min: 5, max: 500 }).withMessage('Work log notes cannot exceed 500 characters.')
]);

const validateTransferTicket = validate([
  body('targetTechnicianId')
    .notEmpty().withMessage('Target technician is required.')
    .isInt({ min: 1 }).withMessage('Target technician must be a valid technician ID.'),
  body('reason')
    .trim()
    .notEmpty().withMessage('Transfer reason is required.')
    .isLength({ min: 5, max: 500 }).withMessage('Transfer reason must be between 5 and 500 characters.')
]);

const validateCustomerDescription = validate([
  param('id')
    .trim()
    .notEmpty().withMessage('Repair ticket ID is required.')
    .isInt({ min: 1 }).withMessage('Valid repair ticket ID is required.'),
  body('customerRepairDescription')
    .custom((val, { req }) => {
      const note = val !== undefined ? val : (req.body.notes !== undefined ? req.body.notes : (req.body.description !== undefined ? req.body.description : req.body.problemDescription));
      if (note === undefined || note === null) {
        throw new Error('Customer note is required.');
      }
      if (typeof note !== 'string') {
        throw new Error('Customer note must be a string.');
      }
      const trimmed = note.trim();
      if (trimmed.length === 0) {
        throw new Error('Customer note cannot be empty.');
      }
      if (trimmed.length > 500) {
        throw new Error('Customer note cannot exceed 500 characters.');
      }
      req.body.customerRepairDescription = trimmed;
      return true;
    })
]);

// ── Company & B2B Validations ──────────────────────────────────────────────

const validateCompanyRegister = validate([
  body('companyName')
    .trim()
    .notEmpty().withMessage('Company name is required.')
    .isLength({ min: 2, max: 50 }).withMessage('Company name must be between 2 and 50 characters.'),
  body('email')
    .trim()
    .notEmpty().withMessage('Corporate email is required.')
    .isEmail().withMessage('Please provide a valid corporate email.')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidPhone)
    .customSanitizer(normalizePhoneNumber),
  body('contactPerson')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Contact person name must be between 2 and 50 characters.'),
  body('address')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidAddress)
]);

const validateBranch = validate([
  body('name')
    .trim()
    .notEmpty().withMessage('Branch name is required.')
    .isLength({ min: 2, max: 50 }).withMessage('Branch name must be between 2 and 50 characters.'),
  body('address')
    .trim()
    .notEmpty().withMessage('Branch address is required.')
    .custom(isValidAddress),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidPhone)
    .customSanitizer(normalizePhoneNumber)
]);

const validateEmployee = validate([
  body('name')
    .trim()
    .notEmpty().withMessage('Employee name is required.')
    .custom(isValidName),
  body('email')
    .trim()
    .notEmpty().withMessage('Employee email is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidPhone)
    .customSanitizer(normalizePhoneNumber),
  body('department')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Department cannot exceed 100 characters.'),
  body('designation')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Designation cannot exceed 100 characters.'),
  body('branchId')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 }).withMessage('Invalid branch selected.')
]);

const validateDevice = validate([
  body('brand')
    .trim()
    .notEmpty().withMessage('Brand is required.')
    .isLength({ min: 1, max: 50 }).withMessage('Brand must be between 1 and 50 characters.'),
  body('modelNumber')
    .trim()
    .notEmpty().withMessage('Model number is required.')
    .custom(isValidModelNumber),
  body('serialNumber')
    .trim()
    .notEmpty().withMessage('Serial number is required.')
    .custom(isValidSerialNumber),
  body('deviceCategory')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 }).withMessage('Category cannot exceed 50 characters.'),
  body('purchaseDate')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Purchase date must be a valid ISO 8601 date.'),
  body('warrantyExpiry')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Warranty expiry must be a valid ISO 8601 date.')
    .custom((val, { req }) => {
      if (val && req.body.purchaseDate) {
        if (new Date(val) < new Date(req.body.purchaseDate)) {
          throw new Error('Warranty expiry date cannot be before purchase date.');
        }
      }
      return true;
    })
]);

const validateCompanyRepairRequest = validate([
  body('deviceId')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 }).withMessage('Valid device ID is required.'),
  body('serialNumber')
    .custom((val, { req }) => {
      if (!req.body.deviceId && !val) {
        throw new Error('Device selection or serial number is required.');
      }
      if (val && !isValidSerialNumber(val)) {
        throw new Error('Invalid serial number format.');
      }
      return true;
    }),
  body('problemType')
    .trim()
    .notEmpty().withMessage('Problem type is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Problem type must be between 2 and 100 characters.'),
  body('problemDescription')
    .trim()
    .notEmpty().withMessage('Problem description is required.')
    .isLength({ min: 10, max: 500 }).withMessage('Problem description cannot exceed 500 characters.'),
  body('priority')
    .optional({ checkFalsy: true })
    .trim()
    .custom((value) => {
      if (!value) return true;
      if (!ALLOWED_PRIORITIES.includes(value.toLowerCase())) {
        throw new Error('Invalid priority selected.');
      }
      return true;
    })
]);

const validateCompanyProfile = validate([
  body('companyName')
    .trim()
    .notEmpty().withMessage('Company name is required.')
    .isLength({ min: 2, max: 50 }).withMessage('Company name must be between 2 and 50 characters.'),
  body('contactPerson')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Contact person name must be between 2 and 50 characters.'),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidPhone)
    .customSanitizer(normalizePhoneNumber),
  body('address')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidAddress),
  body('gstNumber')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Please provide a valid 15-character GSTIN format (e.g. 29ABCDE1234F1Z5).'),
  body('websiteUrl')
    .optional({ checkFalsy: true })
    .trim()
    .isURL().withMessage('Website URL must be a valid URL.')
]);

const validateSendMessage = validate([
  body().custom((value, { req }) => {
    const text = (req.body?.message || req.body?.content || '').trim();
    if (!text) {
      throw new Error('Message text is required.');
    }
    if (text.length > 500) {
      throw new Error('Message cannot exceed 500 characters.');
    }
    return true;
  })
]);

// ── Admin & Technician Management Validations ──────────────────────────────

const validateCreateCompany = validate([
  body('name')
    .trim()
    .notEmpty().withMessage('Company name is required.')
    .isLength({ min: 2, max: 50 }).withMessage('Company name must be between 2 and 50 characters.'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidPhone)
    .customSanitizer(normalizePhoneNumber)
]);

const validateUpdateCompany = validate([
  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Company name must be between 2 and 50 characters.'),
  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidPhone)
    .customSanitizer(normalizePhoneNumber),
  body('contact_person')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Contact person name must be between 2 and 50 characters.'),
  body('address')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidAddress),
  body('gst_number')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Please provide a valid 15-character GSTIN format (e.g. 29ABCDE1234F1Z5).'),
  body('website_url')
    .optional({ checkFalsy: true })
    .trim()
    .isURL().withMessage('Website URL must be a valid URL.')
]);

const validateCreateTechnician = validate([
  body('name')
    .trim()
    .notEmpty().withMessage('Technician name is required.')
    .custom(isValidName),
  body('email')
    .trim()
    .notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required.')
    .custom((val) => {
      if (!val || !String(val).trim()) throw new Error('Phone number is required.');
      return isValidPhone(val);
    })
    .customSanitizer(normalizePhoneNumber),
  body('specialization')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Specialization cannot exceed 100 characters.')
]);

const validateUpdateTechnician = validate([
  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidName),
  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required.')
    .custom((val) => {
      if (!val || !String(val).trim()) throw new Error('Phone number is required.');
      return isValidPhone(val);
    })
    .customSanitizer(normalizePhoneNumber),
  body('specialization')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Specialization cannot exceed 100 characters.')
]);

// ── Billing/Invoice Validations ────────────────────────────────────────────

const validateInvoice = validate([
  body('clientName')
    .trim()
    .notEmpty().withMessage('Client name is required.')
    .isLength({ min: 2, max: 50 }).withMessage('Client name must be between 2 and 50 characters.'),
  body('userId')
    .notEmpty().withMessage('User ID is required.')
    .isInt({ min: 1 }).withMessage('User ID must be a valid integer.'),
  body('amount')
    .optional()
    .custom(isFiniteNonNegativeAmount),
  body('currency')
    .optional()
    .trim()
    .isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter code.'),
  body('invoiceDate')
    .notEmpty().withMessage('Invoice date is required.')
    .isISO8601().withMessage('Invoice date must be a valid ISO 8601 date.'),
  body('dueDate')
    .notEmpty().withMessage('Due date is required.')
    .isISO8601().withMessage('Due date must be a valid ISO 8601 date.')
    .custom((val, { req }) => {
      if (val && req.body.invoiceDate) {
        if (new Date(val) < new Date(req.body.invoiceDate)) {
          throw new Error('Due date cannot be before invoice date.');
        }
      }
      return true;
    }),
  body('status')
    .optional()
    .trim()
    .isIn(['Draft', 'Sent', 'Paid', 'Overdue', 'Void', 'Final', 'Pending']).withMessage('Invalid status.'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters.'),
  body('lineItems')
    .isArray({ min: 1 }).withMessage('At least one line item is required.'),
  body('lineItems.*.description')
    .trim()
    .notEmpty().withMessage('Line item description is required.')
    .isLength({ max: 255 }).withMessage('Line item description cannot exceed 255 characters.'),
  body('lineItems.*.quantity')
    .isInt({ min: 1, max: 10000 }).withMessage('Line item quantity must be an integer between 1 and 10,000.'),
  body('lineItems.*.unitPrice')
    .optional()
    .custom(isFiniteNonNegativeAmount),
  body('lineItems.*.unit_price')
    .optional()
    .custom(isFiniteNonNegativeAmount),
  body('lineItems.*.hsn_sac')
    .optional()
    .trim()
    .isLength({ max: 20 }).withMessage('HSN/SAC cannot exceed 20 characters.'),
  body('lineItems.*.hsnSac')
    .optional()
    .trim()
    .isLength({ max: 20 }).withMessage('HSN/SAC cannot exceed 20 characters.'),
  body('lineItems.*.taxRate')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100.'),
  body('lineItems.*.tax_rate')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100.'),
  body('newInvoiceId')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 }).withMessage('New invoice ID cannot exceed 50 characters.')
    .matches(/^[A-Za-z0-9\/\-_.]+$/).withMessage('New invoice ID can only contain alphanumeric characters, slashes, hyphens, underscores, and dots.'),
  body('isInterstate')
    .optional()
    .isBoolean().withMessage('isInterstate must be a boolean.')
]);

const validatePayInvoice = validate([
  body('invoiceId')
    .trim()
    .notEmpty().withMessage('Invoice ID is required.')
    .isLength({ min: 1, max: 100 }).withMessage('Invalid invoice ID length.')
]);

const validateCreateOrder = validate([
  body('ticketId')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Invalid ticket ID.'),
  body('ticket_id')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Invalid ticket ID.'),
  body('invoiceId')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Invalid invoice ID.'),
  body('invoice_id')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Invalid invoice ID.'),
  body('ticketNumber')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Invalid ticket number.'),
  body('ticket_number')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Invalid ticket number.')
]);

const validateUpdateCustomer = validate([
  body('name')
    .trim()
    .notEmpty().withMessage('Customer name is required.')
    .custom(isValidName),
  body('email')
    .trim()
    .notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail(),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidPhone)
    .customSanitizer(normalizePhoneNumber)
]);

const validateAdminProfile = validate([
  body('name')
    .trim()
    .notEmpty().withMessage('Full name is required.')
    .custom(isValidName),
  body('email')
    .trim()
    .notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail(),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidPhone)
    .customSanitizer(normalizePhoneNumber)
]);

const validateUpdateProfile = validate([
  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Full name must be between 2 and 50 characters.')
    .custom(isValidName),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .custom(isValidPhone)
    .customSanitizer(normalizePhoneNumber)
]);

module.exports = {
  validate,
  isValidName,
  isValidPhone,
  normalizePhoneNumber,
  isNonRepeatingPhone: isValidPhone,
  isValidPincode,
  isValidAddress,
  isValidModelNumber,
  isValidSerialNumber,
  isValidDeviceConfig,
  isValidDescription,
  isFiniteNonNegativeAmount,
  validateSignUp,
  validateSignIn,
  validateSetPassword,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
  validateGoogleSignIn,
  validateContact,
  validateContactReply,
  validateRepairRequest,
  validateStatusUpdate,
  validateSetRepairCharges,
  validateDiagnosis,
  validateWorkLog,
  validateTransferTicket,
  validateCustomerDescription,
  validateCompanyRegister,
  validateBranch,
  validateEmployee,
  validateDevice,
  validateCompanyRepairRequest,
  validateCompanyProfile,
  validateSendMessage,
  validateCreateCompany,
  validateUpdateCompany,
  validateCreateTechnician,
  validateUpdateTechnician,
  validateInvoice,
  validatePayInvoice,
  validateCreateOrder,
  validateUpdateCustomer,
  validateAdminProfile,
  validateUpdateProfile
};
