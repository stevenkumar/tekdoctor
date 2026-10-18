/**
 * Company Registration Form Validation Utilities for TekDoctor
 * Enforces strict validation for company fields, Indian mobile numbers,
 * Indian GSTIN with Modulo-36 checksum, website URLs, and address constraints.
 */

export interface CompanyRegisterFormData {
  companyName: string;
  email: string;
  password: string;
  contactPerson?: string;
  phone?: string;
  gstNumber?: string;
  websiteUrl?: string;
  address?: string;
}

export type CompanyRegisterFieldErrors = Partial<Record<keyof CompanyRegisterFormData, string>>;

export const GSTN_CODEPOINT_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Validates 15-character Indian GSTIN with format and Modulo-36 right-to-left checksum verification.
 */
export const isValidGstinChecksum = (gstin: string): boolean => {
  const g = gstin.trim().toUpperCase();
  if (g.length !== 15) return false;
  const mod = 36;
  let factor = 2;
  let sum = 0;
  for (let i = 13; i >= 0; i--) {
    const codePoint = GSTN_CODEPOINT_CHARS.indexOf(g[i]);
    if (codePoint === -1) return false;
    let digit = factor * codePoint;
    factor = (factor === 2) ? 1 : 2;
    digit = Math.floor(digit / mod) + (digit % mod);
    sum += digit;
  }
  const checkCodePoint = (mod - (sum % mod)) % mod;
  return g[14] === GSTN_CODEPOINT_CHARS[checkCodePoint];
};

/**
 * Validates a website URL structure supporting http, https, or domain names without protocol.
 */
export const isValidUrl = (value: string): boolean => {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 255) return false;

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) {
    return false;
  }

  const toTest = hasScheme ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(toTest);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname;
    if (!host || host.length < 3) return false;
    if (host !== 'localhost' && !host.includes('.')) return false;
    if (/[\s<>{}|\\^~\[\]`]/g.test(trimmed)) return false;
    if (host !== 'localhost') {
      const parts = host.split('.');
      const tld = parts[parts.length - 1];
      if (!/^[a-zA-Z]{2,}$/.test(tld)) return false;
    }
    return true;
  } catch {
    return false;
  }
};

/**
 * Cleans phone input by stripping all non-digits and truncating to 10 digits.
 */
export const cleanPhoneInput = (value: string): string => {
  return value.replace(/\D/g, '').slice(0, 10);
};

/**
 * Cleans GST input by stripping unsupported chars, converting to uppercase, and truncating to 15 chars.
 */
export const cleanGstInput = (value: string): string => {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
};

/**
 * Validates individual field value for the company registration form.
 */
export const validateRegisterField = (
  field: keyof CompanyRegisterFormData,
  value: string
): string | undefined => {
  const str = (value || '').trim();

  switch (field) {
    case 'companyName': {
      if (!str) return 'Company name is required.';
      if (str.length < 2 || str.length > 50) {
        return 'Company name must be between 2 and 50 characters.';
      }
      return undefined;
    }

    case 'email': {
      if (!str) return 'Corporate email is required.';
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(str)) {
        return 'Please provide a valid corporate email.';
      }
      if (str.length > 255) {
        return 'Email cannot exceed 255 characters.';
      }
      return undefined;
    }

    case 'password': {
      if (!value) return 'Password is required.';
      if (value.length < 8 || value.length > 128) {
        return 'Password must be between 8 and 128 characters.';
      }
      if (!/[A-Z]/.test(value)) {
        return 'Password must contain at least one uppercase letter.';
      }
      if (!/[0-9]/.test(value)) {
        return 'Password must contain at least one number.';
      }
      return undefined;
    }

    case 'contactPerson': {
      if (!str) return undefined; // Optional
      if (str.length < 2 || str.length > 50) {
        return 'Contact person name must be between 2 and 50 characters.';
      }
      return undefined;
    }

    case 'phone': {
      if (!str) return undefined; // Optional
      if (!/^[6-9]\d{9}$/.test(str) || /^(\d)\1{9}$/.test(str)) {
        return 'Enter a valid 10-digit mobile number.';
      }
      return undefined;
    }

    case 'gstNumber': {
      if (!str) return undefined; // Optional
      const g = str.toUpperCase();
      if (g.length !== 15) {
        return 'Enter a valid 15-character GSTIN.';
      }
      const gstinRegex = /^(0[1-9]|[1-2][0-9]|3[0-8]|97|99)[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(g)) {
        return 'Enter a valid 15-character GSTIN.';
      }
      if (!isValidGstinChecksum(g)) {
        return 'Enter a valid 15-character GSTIN.';
      }
      return undefined;
    }

    case 'websiteUrl': {
      if (!str) return undefined; // Optional
      if (str.length > 255) {
        return 'Website URL is too long.';
      }
      if (!isValidUrl(str)) {
        return 'Enter a valid website URL.';
      }
      return undefined;
    }

    case 'address': {
      if (!str) return undefined; // Optional
      if (str.length > 250) {
        return 'Address is too long.';
      }
      return undefined;
    }

    default:
      return undefined;
  }
};

/**
 * Validates all fields in the company registration form.
 * Returns map of field -> error message for all failing fields.
 */
export const validateAllRegisterFields = (
  formData: CompanyRegisterFormData
): CompanyRegisterFieldErrors => {
  const errors: CompanyRegisterFieldErrors = {};
  const fields: (keyof CompanyRegisterFormData)[] = [
    'companyName',
    'email',
    'password',
    'contactPerson',
    'phone',
    'gstNumber',
    'websiteUrl',
    'address'
  ];

  for (const field of fields) {
    const error = validateRegisterField(field, formData[field] || '');
    if (error) {
      errors[field] = error;
    }
  }

  return errors;
};
