/**
 * Centralized Client-Side Constants
 * Stores validation boundaries, regular expressions, and UI options.
 */

// ── Validation Limits ─────────────────────────────────────────────────────────

export const VALIDATION = {
  AUTH: {
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 50,
    PASSWORD_MIN_LENGTH: 8,
  },
  CONTACT: {
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 50,
    MESSAGE_MIN_LENGTH: 10,
    MESSAGE_MAX_LENGTH: 500,
  },
  REPAIR: {
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 50,
    DESCRIPTION_MIN_LENGTH: 10,
    DESCRIPTION_MAX_LENGTH: 500,
  },
} as const;

export const NAME_MAX_LENGTH = 50;
export const MESSAGE_MAX_LENGTH = 500;
export const DESCRIPTION_MAX_LENGTH = 500;

// ── Regular Expressions ────────────────────────────────────────────────────────

export const REGEX = {
  // Standard loose email validation matching backend
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  // Matches digits, spaces, hyphens, and parentheses for phone numbers
  PHONE: /^[+]?[\d\s\-()]{7,15}$/,
  // Name validation: letters, spaces, hyphens, apostrophes only
  NAME: /^[a-zA-Z\s'-]+$/,
  // 6-digit Indian PIN code
  PINCODE: /^[1-9][0-9]{5}$/,
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

/**
 * Validates email address format and length.
 */
export const validateEmail = (email: string): { isValid: boolean; error?: string } => {
  const trimmed = (email || '').trim();
  if (!trimmed) {
    return { isValid: false, error: 'Email address is required.' };
  }
  if (!REGEX.EMAIL.test(trimmed)) {
    return { isValid: false, error: 'Invalid email address. Please enter a valid email format.' };
  }
  if (trimmed.length > 100) {
    return { isValid: false, error: 'Email address cannot exceed 100 characters.' };
  }
  return { isValid: true };
};

/**
 * Validates password strength (min 8 chars, 1 uppercase, 1 number).
 */
export const validatePassword = (password: string): { isValid: boolean; error?: string } => {
  if (!password) {
    return { isValid: false, error: 'Password is required.' };
  }
  if (password.length < 8) {
    return { isValid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one number.' };
  }
  return { isValid: true };
};

/**
 * Validates password match.
 */
export const validatePasswordMatch = (
  password: string,
  confirmPassword: string
): { isValid: boolean; error?: string } => {
  if (!confirmPassword) {
    return { isValid: false, error: 'Please confirm your password.' };
  }
  if (password !== confirmPassword) {
    return { isValid: false, error: 'Passwords do not match.' };
  }
  return { isValid: true };
};

export const DUPLICATE_ERRORS = {
  EMAIL: 'This email address is already registered. Please use a different email address.',
  PHONE: 'This phone number is already registered. Please use a different phone number.',
} as const;

/**
 * Validates personal, corporate, or contact names (max 50 chars).
 * Rejects numbers and unusual special characters.
 */
export const validateName = (
  name: string,
  fieldLabel = 'Name'
): { isValid: boolean; error?: string } => {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return { isValid: false, error: `${fieldLabel} is required.` };
  }
  if (trimmed.length < 2) {
    return { isValid: false, error: `${fieldLabel} must be at least 2 characters.` };
  }
  if (trimmed.length > 50) {
    return { isValid: false, error: `${fieldLabel} cannot exceed 50 characters.` };
  }
  if (/\d/.test(trimmed)) {
    return { isValid: false, error: `Invalid ${fieldLabel.toLowerCase()}. Names cannot contain numbers.` };
  }
  if (!REGEX.NAME.test(trimmed)) {
    return { isValid: false, error: `Invalid ${fieldLabel.toLowerCase()}. Only letters, spaces, hyphens, and apostrophes are allowed.` };
  }
  return { isValid: true };
};

/**
 * Validates general-purpose messages (max 500 chars).
 */
export const validateMessage = (
  message: string,
  fieldLabel = 'Message',
  minLength = 10,
  maxLength = 500
): { isValid: boolean; error?: string } => {
  const trimmed = (message || '').trim();
  if (!trimmed) {
    return { isValid: false, error: `${fieldLabel} is required.` };
  }
  if (trimmed.length < minLength) {
    return { isValid: false, error: `${fieldLabel} must be at least ${minLength} characters.` };
  }
  if (trimmed.length > maxLength) {
    return { isValid: false, error: `${fieldLabel} cannot exceed ${maxLength} characters.` };
  }
  return { isValid: true };
};

/**
 * Validates repair problem descriptions (max 500 chars).
 */
export const validateProblemDescription = (
  desc: string,
  minLength = 10,
  maxLength = 500
): { isValid: boolean; error?: string } => {
  const trimmed = (desc || '').trim();
  if (!trimmed) {
    return { isValid: false, error: 'Problem description is required.' };
  }
  if (trimmed.length < minLength) {
    return { isValid: false, error: `Problem description must be at least ${minLength} characters.` };
  }
  if (trimmed.length > maxLength) {
    return { isValid: false, error: `Problem description cannot exceed ${maxLength} characters.` };
  }
  return { isValid: true };
};

/**
 * Validates 6-digit postal / PIN codes.
 */
export const validatePostalCode = (zip: string): { isValid: boolean; error?: string } => {
  const trimmed = (zip || '').trim();
  if (!trimmed) {
    return { isValid: true };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { isValid: false, error: 'Invalid postal code. Postal code must contain digits only.' };
  }
  if (trimmed.length !== 6 || !REGEX.PINCODE.test(trimmed)) {
    return { isValid: false, error: 'Invalid postal code. Please enter a valid 6-digit postal code.' };
  }
  return { isValid: true };
};

/**
 * Validates numeric fields and positive currency amounts.
 */
export const validateNumeric = (
  value: string | number,
  fieldLabel = 'Amount'
): { isValid: boolean; error?: string } => {
  const str = String(value).trim();
  if (!str) {
    return { isValid: false, error: `${fieldLabel} is required.` };
  }
  const num = Number(str);
  if (isNaN(num) || !isFinite(num)) {
    return { isValid: false, error: `Invalid ${fieldLabel.toLowerCase()}. Please enter a valid numeric value.` };
  }
  if (num < 0) {
    return { isValid: false, error: `${fieldLabel} must be a positive number.` };
  }
  return { isValid: true };
};

// ── Geographic Constants ──────────────────────────────────────────────────────

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry'
] as const;

export const POPULAR_CITIES = [
  'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Ahmedabad', 'Chennai',
  'Kolkata', 'Surat', 'Pune', 'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur',
  'Indore', 'Thane', 'Bhopal', 'Visakhapatnam', 'Patna', 'Vadodara',
  'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad', 'Meerut',
  'Rajkot', 'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad', 'Amritsar',
  'Navi Mumbai', 'Allahabad', 'Ranchi', 'Howrah', 'Coimbatore', 'Jabalpur',
  'Gwalior', 'Vijayawada', 'Jodhpur', 'Madurai', 'Raipur', 'Kota',
  'Guwahati', 'Chandigarh', 'Solapur', 'Hubli-Dharwad', 'Bareilly', 'Moradabad',
  'Mysore', 'Gurgaon', 'Noida', 'Dehradun'
];

export const STATE_CITIES: Record<string, string[]> = {
  'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad', 'Solapur', 'Navi Mumbai', 'Kolhapur', 'Amravati'],
  'Delhi': ['New Delhi', 'Central Delhi', 'North Delhi', 'South Delhi', 'East Delhi', 'West Delhi'],
  'Karnataka': ['Bengaluru', 'Mysore', 'Hubli-Dharwad', 'Mangalore', 'Belgaum', 'Gulbarga', 'Davanagere', 'Bellary'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore'],
  'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Ramagundam', 'Khammam'],
  'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar', 'Junagadh'],
  'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Ghaziabad', 'Agra', 'Meerut', 'Varanasi', 'Allahabad', 'Bareilly', 'Noida'],
  'West Bengal': ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri', 'Kharagpur'],
  'Rajasthan': ['Jaipur', 'Jodhpur', 'Kota', 'Bikaner', 'Ajmer', 'Udaipur', 'Bhilwara'],
  'Madhya Pradesh': ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar'],
  'Bihar': ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Purnia', 'Darbhanga'],
  'Punjab': ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali'],
  'Haryana': ['Gurgaon', 'Faridabad', 'Panipat', 'Ambala', 'Yamunanagar', 'Rohtak', 'Hisar', 'Karnal'],
  'Kerala': ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Kollam', 'Thrissur', 'Kannur', 'Alappuzha'],
  'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Rajahmundry', 'Tirupati'],
  'Odisha': ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur', 'Puri'],
  'Jharkhand': ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Deoghar'],
  'Assam': ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Nagaon'],
  'Chhattisgarh': ['Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg'],
  'Uttarakhand': ['Dehradun', 'Haridwar', 'Roorkee', 'Haldwani', 'Rishikesh'],
  'Goa': ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa'],
  'Chandigarh': ['Chandigarh'],
  'Himachal Pradesh': ['Shimla', 'Dharamshala', 'Mandi', 'Solan']
};
