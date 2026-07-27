const { body, validationResult } = require('express-validator');
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
      // express-validator v7 uses err.path instead of err.param
      const field = err.path || err.param;
      if (!formattedErrors[field]) {
        formattedErrors[field] = err.msg;
      }
    });

    return res.status(400).json(formatResponse(false, 'Validation failed.', formattedErrors));
  };
};

// --- Auth Validations ---

const validateSignUp = validate([
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters.'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
  body('role')
    .optional()
    .isIn(['customer', 'technician', 'admin', 'company']).withMessage('Invalid user role specified.')
]);

const validateSignIn = validate([
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required.')
]);

const validateSetPassword = validate([
  body('password')
    .notEmpty().withMessage('Password must be at least 8 characters long.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.')
]);

// --- Contact Validations ---

const validateContact = validate([
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required.')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters.'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required.')
    .matches(/^\+?[0-9\s\-]{8,15}$/).withMessage('Please provide a valid phone number (8-15 digits).'),
  body('message')
    .trim()
    .notEmpty().withMessage('Message is required.')
    .isLength({ min: 10, max: 2000 }).withMessage('Message must be between 10 and 2000 characters.')
]);

// --- Repair Request Validations ---

const validateRepairRequest = validate([
  body('customerName')
    .trim()
    .notEmpty().withMessage('Customer name is required.')
    .isLength({ max: 20 }).withMessage('Customer name cannot exceed 20 characters.'),
  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required.')
    .matches(/^\d{10}$/).withMessage('Phone number must be exactly 10 digits.'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),
  body('address')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Address cannot exceed 100 characters.'),
  body('city')
    .trim()
    .notEmpty().withMessage('City is required.')
    .isLength({ max: 50 }).withMessage('City cannot exceed 50 characters.'),
  body('state')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 }).withMessage('State cannot exceed 50 characters.'),
  body('zipCode')
    .optional({ checkFalsy: true })
    .trim()
    .isNumeric().withMessage('Postal/ZIP Code must contain only numeric characters.'),
  body('deviceCategory')
    .trim()
    .notEmpty().withMessage('Device category is required.'),
  body('brand')
    .trim()
    .notEmpty().withMessage('Brand is required.'),
  body('customBrand')
    .optional({ checkFalsy: true })
    .trim()
    .custom((value, { req }) => {
      if (req.body.brand === 'Other' && !value) {
        throw new Error('Please specify your custom brand.');
      }
      return true;
    }),
  body('modelNumber')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 }).withMessage('Model Number cannot exceed 50 characters.'),
  body('serialNumber')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 }).withMessage('Serial Number cannot exceed 50 characters.'),
  body('deviceConfiguration')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Configuration cannot exceed 100 characters.'),
  body('problemType')
    .trim()
    .notEmpty().withMessage('Problem type is required.'),
  body('problemDescription')
    .trim()
    .notEmpty().withMessage('Problem description is required.')
    .isLength({ min: 20, max: 500 }).withMessage('Problem description must be between 20 and 500 characters.'),
  body('serviceType')
    .optional()
    .trim()
    .isIn(['Bring to Service Center', 'Home Visit', 'Pickup & Drop', 'Home Service', 'Courier Pickup']).withMessage('Invalid service type.'),
  body('priority')
    .optional()
    .trim()
    .isIn(['Standard', 'Priority', 'Express (Same Day)', 'Urgent (Within 2 Hours)']).withMessage('Invalid priority.'),
  body('preferredContactMethod')
    .optional()
    .trim()
    .custom((value) => {
      if (!value) return true;
      const methods = value.split(',').map(m => m.trim());
      const validMethods = ['WhatsApp', 'Phone Call', 'Call', 'Email'];
      for (let method of methods) {
        if (!validMethods.includes(method)) {
          throw new Error('Invalid contact method specified.');
        }
      }
      return true;
    })
]);

const validateStatusUpdate = validate([
  body('status')
    .trim()
    .notEmpty().withMessage('Status is required.')
    .isIn(['pending', 'in_progress', 'completed', 'delivered', 'cancelled']).withMessage('Invalid status value.')
]);

// --- Billing/Invoice Validations ---

const validateInvoice = validate([
  body('clientName')
    .trim()
    .notEmpty().withMessage('Client name is required.'),
  body('userId')
    .notEmpty().withMessage('User ID is required.')
    .isInt({ min: 1 }).withMessage('User ID must be a valid integer.'),
  body('amount')
    .notEmpty().withMessage('Amount is required.')
    .isDecimal().withMessage('Amount must be a decimal value.'),
  body('currency')
    .optional()
    .trim()
    .isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter code.'),
  body('invoiceDate')
    .notEmpty().withMessage('Invoice date is required.')
    .isISO8601().withMessage('Invoice date must be a valid ISO 8601 date.'),
  body('dueDate')
    .notEmpty().withMessage('Due date is required.')
    .isISO8601().withMessage('Due date must be a valid ISO 8601 date.'),
  body('status')
    .optional()
    .trim()
    .isIn(['Draft', 'Sent', 'Paid', 'Overdue']).withMessage('Invalid status.'),
  body('notes')
    .optional()
    .trim(),
  body('lineItems')
    .isArray({ min: 1 }).withMessage('At least one line item is required.'),
  body('lineItems.*.description')
    .trim()
    .notEmpty().withMessage('Line item description is required.'),
  body('lineItems.*.quantity')
    .isInt({ min: 1 }).withMessage('Line item quantity must be an integer >= 1.'),
  body('lineItems.*.unitPrice')
    .isDecimal().withMessage('Line item unit price must be a valid number.')
]);

const validatePayInvoice = validate([
  body('invoiceId')
    .trim()
    .notEmpty().withMessage('Invoice ID is required.')
]);

module.exports = {
  validateSignUp,
  validateSignIn,
  validateSetPassword,
  validateContact,
  validateRepairRequest,
  validateStatusUpdate,
  validateInvoice,
  validatePayInvoice
};
