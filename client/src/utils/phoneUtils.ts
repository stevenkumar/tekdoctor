/**
 * Phone and Country Utilities for TekDoctor
 * Provides international country codes, flags, national formatting rules,
 * validation, and E.164 normalization.
 */

export interface CountryInfo {
  code: string;        // ISO 3166-1 alpha-2 code
  name: string;        // Country name
  dialCode: string;    // International calling code (e.g. "+91")
  flag: string;        // Flag emoji
  placeholder: string; // Formatted example placeholder
  minLength: number;   // Min digits in national number
  maxLength: number;   // Max digits in national number
  pattern?: RegExp;    // Optional regex for country-specific national validation
}

export const COUNTRIES: CountryInfo[] = [
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', placeholder: '98765 43210', minLength: 10, maxLength: 10, pattern: /^[6-9]\d{9}$/ },
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', placeholder: '(201) 555-0123', minLength: 10, maxLength: 10, pattern: /^[2-9]\d{2}[2-9]\d{6}$/ },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', placeholder: '7911 123456', minLength: 10, maxLength: 10, pattern: /^[1-9]\d{9}$/ },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪', placeholder: '50 123 4567', minLength: 9, maxLength: 9, pattern: /^5\d{8}$/ },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦', placeholder: '(416) 555-0199', minLength: 10, maxLength: 10, pattern: /^[2-9]\d{2}[2-9]\d{6}$/ },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺', placeholder: '412 345 678', minLength: 9, maxLength: 9, pattern: /^(4|[2378])\d{8}$/ },
  { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬', placeholder: '9123 4567', minLength: 8, maxLength: 8, pattern: /^[3689]\d{7}$/ },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', flag: '🇸🇦', placeholder: '50 123 4567', minLength: 9, maxLength: 9, pattern: /^5\d{8}$/ },
  { code: 'QA', name: 'Qatar', dialCode: '+974', flag: '🇶🇦', placeholder: '3312 3456', minLength: 8, maxLength: 8, pattern: /^[3567]\d{7}$/ },
  { code: 'KW', name: 'Kuwait', dialCode: '+965', flag: '🇰🇼', placeholder: '9123 4567', minLength: 8, maxLength: 8, pattern: /^[569]\d{7}$/ },
  { code: 'OM', name: 'Oman', dialCode: '+968', flag: '🇴🇲', placeholder: '9123 4567', minLength: 8, maxLength: 8, pattern: /^[79]\d{7}$/ },
  { code: 'BH', name: 'Bahrain', dialCode: '+973', flag: '🇧🇭', placeholder: '3612 3456', minLength: 8, maxLength: 8, pattern: /^[36]\d{7}$/ },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪', placeholder: '151 23456789', minLength: 10, maxLength: 11 },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷', placeholder: '6 12 34 56 78', minLength: 9, maxLength: 9, pattern: /^[1-9]\d{8}$/ },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿', placeholder: '21 123 4567', minLength: 8, maxLength: 10 },
  { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵', placeholder: '90 1234 5678', minLength: 10, maxLength: 10 },
  { code: 'MY', name: 'Malaysia', dialCode: '+60', flag: '🇲🇾', placeholder: '12 345 6789', minLength: 9, maxLength: 10 },
  { code: 'ID', name: 'Indonesia', dialCode: '+62', flag: '🇮🇩', placeholder: '812 3456 7890', minLength: 9, maxLength: 12 },
  { code: 'PH', name: 'Philippines', dialCode: '+63', flag: '🇵🇭', placeholder: '917 123 4567', minLength: 10, maxLength: 10 },
  { code: 'TH', name: 'Thailand', dialCode: '+66', flag: '🇹🇭', placeholder: '81 234 5678', minLength: 9, maxLength: 9 },
  { code: 'BD', name: 'Bangladesh', dialCode: '+880', flag: '🇧🇩', placeholder: '1712 345678', minLength: 10, maxLength: 10, pattern: /^1[3-9]\d{8}$/ },
  { code: 'LK', name: 'Sri Lanka', dialCode: '+94', flag: '🇱🇰', placeholder: '71 234 5678', minLength: 9, maxLength: 9 },
  { code: 'NP', name: 'Nepal', dialCode: '+977', flag: '🇳🇵', placeholder: '984 1234567', minLength: 10, maxLength: 10, pattern: /^9[78]\d{8}$/ },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦', placeholder: '71 234 5678', minLength: 9, maxLength: 9 },
  { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬', placeholder: '802 123 4567', minLength: 10, maxLength: 10 },
  { code: 'KE', name: 'Kenya', dialCode: '+254', flag: '🇰🇪', placeholder: '712 345678', minLength: 9, maxLength: 9 },
  { code: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹', placeholder: '312 345 6789', minLength: 9, maxLength: 10 },
  { code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸', placeholder: '612 34 56 78', minLength: 9, maxLength: 9 },
  { code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱', placeholder: '6 12345678', minLength: 9, maxLength: 9 },
  { code: 'CH', name: 'Switzerland', dialCode: '+41', flag: '🇨🇭', placeholder: '78 123 45 67', minLength: 9, maxLength: 9 },
  { code: 'SE', name: 'Sweden', dialCode: '+46', flag: '🇸🇪', placeholder: '70 123 45 67', minLength: 9, maxLength: 9 },
  { code: 'NO', name: 'Norway', dialCode: '+47', flag: '🇳🇴', placeholder: '412 34 567', minLength: 8, maxLength: 8 },
  { code: 'DK', name: 'Denmark', dialCode: '+45', flag: '🇩🇰', placeholder: '20 12 34 56', minLength: 8, maxLength: 8 },
  { code: 'IE', name: 'Ireland', dialCode: '+353', flag: '🇮🇪', placeholder: '83 123 4567', minLength: 9, maxLength: 9 },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷', placeholder: '11 98765-4321', minLength: 10, maxLength: 11 },
  { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽', placeholder: '55 1234 5678', minLength: 10, maxLength: 10 },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]; // India (+91)

/**
 * Finds a country by ISO code (case-insensitive)
 */
export const findCountryByCode = (code: string): CountryInfo => {
  const match = COUNTRIES.find((c) => c.code.toUpperCase() === code.trim().toUpperCase());
  return match || DEFAULT_COUNTRY;
};

/**
 * Finds a country by international dial code (e.g. "+91" or "+1")
 */
export const findCountryByDialCode = (dialCode: string): CountryInfo | undefined => {
  const clean = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;
  return COUNTRIES.find((c) => c.dialCode === clean);
};

/**
 * Parses an input string (e.g. "+919876543210" or "9876543210")
 * into a matching country and national number digits.
 */
export const parsePhoneNumber = (input: string, fallbackCountry = DEFAULT_COUNTRY): {
  country: CountryInfo;
  nationalNumber: string;
} => {
  if (!input) {
    return { country: fallbackCountry, nationalNumber: '' };
  }

  const trimmed = input.trim();

  if (trimmed.startsWith('+')) {
    // Sort countries by dialCode length descending (+880 before +88 etc.)
    const sorted = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
    for (const c of sorted) {
      if (trimmed.startsWith(c.dialCode)) {
        const national = trimmed.slice(c.dialCode.length).replace(/\D/g, '');
        return { country: c, nationalNumber: national };
      }
    }
  }

  // If no '+' prefix, treat entire string as national digits for fallbackCountry
  const cleanDigits = trimmed.replace(/\D/g, '');
  return { country: fallbackCountry, nationalNumber: cleanDigits };
};

/**
 * Normalizes a national number + country into standard E.164 (+<dialCode><nationalDigits>)
 */
export const normalizeToE164 = (nationalNumber: string, country: CountryInfo): string => {
  const cleanDigits = nationalNumber.replace(/\D/g, '');
  if (!cleanDigits) return '';
  return `${country.dialCode}${cleanDigits}`;
};

export interface PhoneValidationResult {
  isValid: boolean;
  error?: string;
  normalizedNumber: string;
}

/**
 * Validates a national phone number according to country rules.
 * Enforces:
 * - Non-empty
 * - Exact or bounded digit length per country
 * - Country-specific prefix rules (e.g., [6-9] for India, [2-9] for US)
 * - Rejects dummy repeating digits (e.g., 0000000000, 1111111111)
 * - Leading/trailing spaces trimmed
 */
export const validatePhoneNumber = (
  nationalNumber: string,
  country: CountryInfo
): PhoneValidationResult => {
  const trimmed = nationalNumber ? nationalNumber.trim() : '';
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Phone number is required.',
      normalizedNumber: ''
    };
  }

  // Reject letters and non-phone characters immediately
  if (/[a-zA-Z]/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Invalid phone number. Letters are not allowed.',
      normalizedNumber: ''
    };
  }

  if (/[^\d\s\-()]/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Invalid phone number. Please enter a valid phone number with country code.',
      normalizedNumber: ''
    };
  }

  const digitsOnly = trimmed.replace(/\D/g, '');

  if (!digitsOnly) {
    return {
      isValid: false,
      error: 'Invalid phone number. Please enter a valid phone number.',
      normalizedNumber: ''
    };
  }

  // Reject dummy repeating digits like 0000000000, 1111111111, 9999999999
  if (/^(\d)\1+$/.test(digitsOnly) && digitsOnly.length >= 6) {
    return {
      isValid: false,
      error: 'Please enter a valid phone number.',
      normalizedNumber: normalizeToE164(digitsOnly, country)
    };
  }

  // Length checks
  if (country.minLength === country.maxLength) {
    if (digitsOnly.length < country.minLength) {
      return {
        isValid: false,
        error: `Phone number is too short (${digitsOnly.length}/${country.minLength} digits for ${country.name}).`,
        normalizedNumber: normalizeToE164(digitsOnly, country)
      };
    }
    if (digitsOnly.length > country.maxLength) {
      return {
        isValid: false,
        error: `Phone number cannot exceed ${country.maxLength} digits for ${country.name}.`,
        normalizedNumber: normalizeToE164(digitsOnly, country)
      };
    }
  } else {
    if (digitsOnly.length < country.minLength) {
      return {
        isValid: false,
        error: `Phone number must be at least ${country.minLength} digits for ${country.name}.`,
        normalizedNumber: normalizeToE164(digitsOnly, country)
      };
    }
    if (digitsOnly.length > country.maxLength) {
      return {
        isValid: false,
        error: `Phone number cannot exceed ${country.maxLength} digits for ${country.name}.`,
        normalizedNumber: normalizeToE164(digitsOnly, country)
      };
    }
  }

  // Specific country prefix rules
  if (country.code === 'IN') {
    if (!/^[6-9]/.test(digitsOnly)) {
      return {
        isValid: false,
        error: 'Indian mobile numbers must start with 6, 7, 8, or 9.',
        normalizedNumber: normalizeToE164(digitsOnly, country)
      };
    }
  } else if (country.code === 'US' || country.code === 'CA') {
    if (/^[01]/.test(digitsOnly)) {
      return {
        isValid: false,
        error: 'Area code cannot start with 0 or 1.',
        normalizedNumber: normalizeToE164(digitsOnly, country)
      };
    }
  }

  // Pattern check if defined
  if (country.pattern && !country.pattern.test(digitsOnly)) {
    return {
      isValid: false,
      error: `Please enter a valid phone number for ${country.name}.`,
      normalizedNumber: normalizeToE164(digitsOnly, country)
    };
  }

  return {
    isValid: true,
    normalizedNumber: normalizeToE164(digitsOnly, country)
  };
};
