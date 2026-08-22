/**
 * Centralized Client-Side Constants
 * Stores validation boundaries, regular expressions, and UI options.
 */

// ── Validation Limits ─────────────────────────────────────────────────────────

export const VALIDATION = {
  AUTH: {
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 100,
    PASSWORD_MIN_LENGTH: 8,
  },
  CONTACT: {
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 100,
    MESSAGE_MIN_LENGTH: 10,
    MESSAGE_MAX_LENGTH: 2000,
  },
  REPAIR: {
    NAME_MIN_LENGTH: 2,
    DESCRIPTION_MIN_LENGTH: 20,
    DESCRIPTION_MAX_LENGTH: 5000,
  },
} as const;

// ── Regular Expressions ────────────────────────────────────────────────────────

export const REGEX = {
  // Standard loose email validation matching backend
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  // Matches digits, spaces, hyphens, and parentheses for phone numbers
  PHONE: /^[+]?[\d\s\-()]{7,15}$/,
} as const;

// ── Helper Validators ─────────────────────────────────────────────────────────

export const isValidEmail = (email: string): boolean => {
  return REGEX.EMAIL.test(email.trim());
};

export const isValidPhone = (phone: string): boolean => {
  const cleanPhone = phone.replace(/[\s\-()+]/g, '');
  return cleanPhone === '' || /^\d{10,15}$/.test(cleanPhone);
};

export const isStrongPassword = (password: string): boolean => {
  // Requires min 8 chars, 1 uppercase letter, 1 number
  return (
    password.length >= VALIDATION.AUTH.PASSWORD_MIN_LENGTH &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
};
