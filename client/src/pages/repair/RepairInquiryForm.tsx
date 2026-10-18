import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  User, Smartphone, Mail, MapPin,
  Laptop, Tag, Wrench, Shield, CheckCircle,
  FileImage, Eye, Trash2, Loader2, Info, ExternalLink,
  Copy, Check, ShieldCheck, ArrowRight
} from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { repairApi, publicApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/routes';
import RepairStepProgress from '@/components/RepairStepProgress';
import { INDIAN_STATES, STATES_DISTRICTS, validateName, validateProblemDescription, validatePostalCode } from '@/config/constants';
import PhoneInput from '@/components/PhoneInput';
import { validatePhoneNumber, parsePhoneNumber, DEFAULT_COUNTRY } from '@/utils/phoneUtils';
import { getRecaptchaToken } from '@/utils/recaptcha';

const DRAFT_ID_KEY = 'tekdoctor_repair_form_draft_id';

const DISTRICT_ALIASES: Record<string, Record<string, string>> = {
  'karnataka': {
    'bangalore': 'Bengaluru Urban',
    'bangalore urban': 'Bengaluru Urban',
    'bangalore rural': 'Bengaluru Rural',
    'bengaluru': 'Bengaluru Urban',
    'mysore': 'Mysuru',
    'mangalore': 'Dakshina Kannada',
    'belgaum': 'Belagavi',
    'gulbarga': 'Kalaburagi',
    'bellary': 'Ballari',
    'bijapur': 'Vijayapura',
    'shimoga': 'Shivamogga',
    'hubli': 'Dharwad',
    'hubli-dharwad': 'Dharwad',
  },
  'maharashtra': {
    'mumbai': 'Mumbai City',
    'bombay': 'Mumbai City',
    'aurangabad': 'Chhatrapati Sambhajinagar (Aurangabad)',
    'osmanabad': 'Dharashiv (Osmanabad)',
    'ahmednagar': 'Ahilyanagar (Ahmednagar)',
  },
  'delhi': {
    'delhi': 'New Delhi',
  },
  'uttar pradesh': {
    'noida': 'Gautam Buddha Nagar',
    'greater noida': 'Gautam Buddha Nagar',
    'allahabad': 'Prayagraj',
    'faizabad': 'Ayodhya',
  },
  'haryana': {
    'gurgaon': 'Gurugram',
  },
  'tamil nadu': {
    'madras': 'Chennai',
  },
  'west bengal': {
    'calcutta': 'Kolkata',
  },
  'kerala': {
    'cochin': 'Ernakulam',
    'kochi': 'Ernakulam',
    'trivandrum': 'Thiruvananthapuram',
  },
  'odisha': {
    'bhubaneswar': 'Khordha',
    'bhubaneshwar': 'Khordha',
  },
  'puducherry': {
    'pondicherry': 'Puducherry',
  },
};

function matchDistrictForState(stateName: string, loc: { district?: string; city?: string; places?: string[] }): string {
  if (!stateName) return '';
  const districts = STATES_DISTRICTS[stateName] || [];
  if (!districts.length) return '';

  const candidates = [
    loc.district,
    loc.city,
    ...(Array.isArray(loc.places) ? loc.places : [])
  ].filter(Boolean) as string[];

  // 1. Direct case-insensitive equality
  for (const candidate of candidates) {
    const cleanCand = candidate.trim().toLowerCase();
    const exact = districts.find(d => d.toLowerCase() === cleanCand);
    if (exact) return exact;
  }

  // 2. Alias dictionary
  const stateAliases = DISTRICT_ALIASES[stateName.toLowerCase()];
  if (stateAliases) {
    for (const candidate of candidates) {
      const cleanCand = candidate.trim().toLowerCase();
      if (stateAliases[cleanCand] && districts.includes(stateAliases[cleanCand])) {
        return stateAliases[cleanCand];
      }
    }
  }

  // 3. Substring match for compound district names
  for (const candidate of candidates) {
    const cleanCand = candidate.trim().toLowerCase().replace(/[().]/g, '');
    for (const d of districts) {
      const cleanD = d.toLowerCase().replace(/[().]/g, '');
      if (cleanCand.length >= 4 && (cleanD.includes(cleanCand) || cleanCand.includes(cleanD))) {
        return d;
      }
    }
  }

  return '';
}

const DEVICE_CATEGORIES = [
  'Laptop', 'Desktop PC', 'Printer', 'CCTV',
  'Monitor', 'UPS', 'Networking Device', 'Other'
];

const BRANDS = [
  'HP', 'Dell', 'Lenovo', 'Acer', 'Asus',
  'Canon', 'Epson', 'Hikvision', 'CP Plus', 'Other'
];

const CATEGORY_PROBLEMS: Record<string, string[]> = {
  'Laptop': [
    'Not Powering On', 'Screen Crack/Flicker', 'Keyboard/Touchpad Fault',
    'Battery/Charging Issue', 'Slow Performance/Boot Loop', 'Overheating/Fan Noise',
    'Hardware Upgrade (RAM/SSD)', 'OS/Software Issue', 'Liquid Damage', 'Other'
  ],
  'Desktop PC': [
    'No Power/No Display', 'Random Blue Screen/Crash', 'Overheating/Dust Cleaning',
    'Slow Performance/Virus', 'Hardware Upgrade (GPU/RAM/SSD)', 'Power Supply (PSU) Failure',
    'OS/Software Installation', 'Other'
  ],
  'Printer': [
    'Printer Not Printing', 'Paper Jam/Feeder Issue', 'Ghosting/Faded Prints',
    'Error Code/Connectivity Failure', 'Driver/Installation Issue', 'Cartridge/Toner Refill',
    'Spooler Error', 'Other'
  ],
  'CCTV': [
    'CCTV Camera Offline', 'No Video Feed/Blank Screen', 'Intermittent Signal Loss',
    'NVR/DVR Loading/Storage Issue', 'Password Reset/Admin Lockout', 'Night Vision Mode Failure',
    'Other'
  ],
  'Monitor': [
    'No Display/Standby Indicator Only', 'Dim Screen/Backlight Issue',
    'Flickering/Vertical Lines', 'Color Distortion/Bleeding', 'Physical Panel Damage', 'Other'
  ],
  'UPS': [
    'No Power/Backup Fail', 'Frequent Alarm/Beeping', 'Battery Replacement Alert',
    'Overload Trip/Voltage Issue', 'Other'
  ],
  'Networking Device': [
    'No WiFi/Internet Offline', 'Router/Switch Reboot Loop', 'Config/SSID Password Issue',
    'Local Network Access Failure', 'Range/Signal Strength Issues', 'Other'
  ],
  'Other': [
    'Hardware Component Fault', 'Diagnostic Request', 'General Technical Assistance', 'Other'
  ]
};

export default function RepairInquiryForm() {
  const { login, token, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isRebookMode, setIsRebookMode] = useState(false);
  const [rebookData, setRebookData] = useState<any>(null);

  const [isNewAccount, setIsNewAccount] = useState(false);
  const [isExistingAccount, setIsExistingAccount] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [copiedTicket, setCopiedTicket] = useState(false);
  const [countdown, setCountdown] = useState(7);
  const [autoRedirectPaused, setAutoRedirectPaused] = useState(false);

  const [formData, setFormData] = useState({
    customerName: '',
    mobile: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    deviceCategory: '',
    customDeviceCategory: '',
    brand: '',
    customBrand: '',
    modelNumber: '',
    serialNumber: '',
    deviceConfiguration: '',
    problemType: '',
    customProblemType: '',
    problemDescription: '',
    serviceType: 'Bring to Service Center',
    customServiceType: '',
    priority: 'Standard',
    preferredContactMethod: ['WhatsApp'],
  });

  const [deviceImage, setDeviceImage] = useState<File | null>(null);
  const [deviceImagePreview, setDeviceImagePreview] = useState<string | null>(null);

  const [errorScreenshot, setErrorScreenshot] = useState<File | null>(null);
  const [errorScreenshotPreview, setErrorScreenshotPreview] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitTicketId, setSubmitTicketId] = useState('');
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState('');
  const [clientSubmissionId, setClientSubmissionId] = useState(() =>
    window.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)
  );
  const [submitError, setSubmitError] = useState('');

  const deviceImageInputRef = useRef<HTMLInputElement>(null);
  const errorScreenshotInputRef = useRef<HTMLInputElement>(null);

  const [pincodePlaces, setPincodePlaces] = useState<string[]>([]);
  const [loadingPincode, setLoadingPincode] = useState(false);
  const lastFetchedZipRef = useRef('');

  // Auto redirect countdown to Customer Dashboard after successful booking
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (submitSuccess && !isDuplicate && !autoRedirectPaused && countdown > 0) {
      timer = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (submitSuccess && !isDuplicate && !autoRedirectPaused && countdown === 0) {
      navigate(ROUTES.PROFILE);
    }
    return () => clearTimeout(timer);
  }, [submitSuccess, isDuplicate, autoRedirectPaused, countdown, navigate]);

  useEffect(() => {
    const zip = formData.zipCode.trim();
    if (zip.length === 6 && /^\d{6}$/.test(zip)) {
      if (lastFetchedZipRef.current === zip) return;
      lastFetchedZipRef.current = zip;

      let isCurrent = true;
      setLoadingPincode(true);

      publicApi.getPincodeLocation(zip).then((res) => {
        if (!isCurrent) return;
        setLoadingPincode(false);
        if (res.ok && res.data?.data) {
          const loc = res.data.data;
          const matchedState = INDIAN_STATES.find(
            (s) => s.toLowerCase() === (loc.state || '').trim().toLowerCase()
          );

          const foundPlaces: string[] = Array.isArray(loc.places) ? loc.places : [];
          const placesList = Array.from(new Set([
            loc.city,
            loc.district,
            ...foundPlaces
          ].filter(Boolean))) as string[];

          setPincodePlaces(placesList);

          setFormData((prev) => {
            const nextState = matchedState || prev.state;
            let matchedDistrict = '';
            if (nextState) {
              matchedDistrict = matchDistrictForState(nextState, {
                district: loc.district,
                city: loc.city,
                places: foundPlaces
              });
            }

            // Only populate district if it matches the verified dataset for that state;
            // otherwise leave it empty so the user can cleanly select from that state's districts
            const chosenCity = matchedDistrict || (prev.state === nextState ? prev.city : '');
            return {
              ...prev,
              state: nextState || prev.state,
              city: chosenCity,
            };
          });

          // Clear errors if valid
          setErrors((prev) => {
            const newErr = { ...prev };
            delete newErr.zipCode;
            if (matchedState) {
              delete newErr.state;
            }
            return newErr;
          });
        }
      }).catch(() => {
        if (isCurrent) setLoadingPincode(false);
      });

      return () => {
        isCurrent = false;
      };
    } else {
      if (zip.length < 6) {
        lastFetchedZipRef.current = '';
      }
    }
  }, [formData.zipCode]);

  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        customerName: prev.customerName || user.name || '',
        email: prev.email || user.email || '',
      }));
    }
  }, [user]);

  // Detect Re-book Device from Profile / Device History
  useEffect(() => {
    let rebook: any = null;
    if (location.state && (location.state as any).rebookDevice) {
      rebook = (location.state as any).rebookDevice;
    } else {
      const stored = sessionStorage.getItem('tekdoctor_rebook_device');
      if (stored) {
        try {
          rebook = JSON.parse(stored);
        } catch (e) {
          // ignore
        }
      }
    }

    if (rebook && (rebook.brand || rebook.deviceCategory)) {
      setRebookData(rebook);
      setIsRebookMode(true);
      setFormData(prev => ({
        ...prev,
        customerName: rebook.customerName || prev.customerName || user?.name || '',
        mobile: rebook.mobile || prev.mobile || user?.phone || '',
        email: rebook.email || prev.email || user?.email || '',
        address: rebook.address || prev.address || '',
        city: rebook.city || prev.city || '',
        state: rebook.state || prev.state || '',
        zipCode: rebook.zipCode || prev.zipCode || '',
        deviceCategory: rebook.deviceCategory || prev.deviceCategory || '',
        customDeviceCategory: rebook.customDeviceCategory || prev.customDeviceCategory || '',
        brand: rebook.brand || prev.brand || '',
        customBrand: rebook.customBrand || prev.customBrand || '',
        modelNumber: rebook.modelNumber || prev.modelNumber || '',
        serialNumber: rebook.serialNumber || prev.serialNumber || '',
        deviceConfiguration: rebook.deviceConfiguration || prev.deviceConfiguration || '',
        problemType: '',
        customProblemType: '',
        problemDescription: '',
      }));
    }
  }, [location.state, user]);

  const handleCancelRebooking = () => {
    setIsRebookMode(false);
    setRebookData(null);
    try {
      sessionStorage.removeItem('tekdoctor_rebook_device');
    } catch (e) {
      // ignore
    }
    setFormData(prev => ({
      ...prev,
      deviceCategory: '',
      customDeviceCategory: '',
      brand: '',
      customBrand: '',
      modelNumber: '',
      serialNumber: '',
      deviceConfiguration: '',
      problemType: '',
      customProblemType: '',
      problemDescription: '',
    }));
  };

  useEffect(() => {
    let draftId = localStorage.getItem(DRAFT_ID_KEY);
    if (!draftId) {
      draftId = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
      localStorage.setItem(DRAFT_ID_KEY, draftId);
    }

    const loadDraft = async () => {
      // If rebooking a historical device, do not overwrite with old generic draft
      if (sessionStorage.getItem('tekdoctor_rebook_device') || (location.state as any)?.rebookDevice) {
        return;
      }
      try {
        const res = await repairApi.getDraft(draftId as string);
        if (res.ok && res.data) {
          const draftData = (res.data as any).data;
          if (draftData) {
            setFormData(prev => ({ ...prev, ...draftData }));
          }
        }
      } catch (e) {
        console.error('Failed to load repair form draft from server', e);
      }
    };
    loadDraft();
  }, [location.state]);

  const saveDraftTimeout = useRef<any>(null);

  useEffect(() => {
    const draftId = localStorage.getItem(DRAFT_ID_KEY);
    if (!draftId) return;

    if (saveDraftTimeout.current) clearTimeout(saveDraftTimeout.current);

    saveDraftTimeout.current = setTimeout(async () => {
      try {
        await repairApi.saveDraft(draftId, formData);
      } catch (e) {
        console.error('Failed to save repair form draft to server', e);
      }
    }, 1000);

    return () => {
      if (saveDraftTimeout.current) clearTimeout(saveDraftTimeout.current);
    }
  }, [formData]);

  const validateSingleField = (name: string, value: any, currentForm: typeof formData): string | undefined => {
    switch (name) {
      case 'customerName': {
        const trimmed = (value || '').trim();
        if (!trimmed) return 'Customer name is required.';
        if (trimmed.length < 2 || trimmed.length > 30) {
          return 'Name must be between 2 and 30 characters.';
        }
        if (/\d/.test(trimmed)) {
          return 'Name cannot contain numbers.';
        }
        if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) {
          return 'Name can only contain letters, spaces, hyphens, and apostrophes.';
        }
        return undefined;
      }
      case 'mobile': {
        const str = (value || '').trim();
        if (!str) return 'Mobile number is required.';
        const { country, nationalNumber } = parsePhoneNumber(str, DEFAULT_COUNTRY);
        if (country.code === 'IN') {
          const digits = str.replace(/\D/g, '');
          const nat = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
          if (nat.length !== 10 || !/^[6-9]\d{9}$/.test(nat) || /^(\d)\1{9}$/.test(nat)) {
            return 'Enter a valid 10-digit mobile number.';
          }
          return undefined;
        } else {
          const phoneRes = validatePhoneNumber(nationalNumber, country);
          if (!phoneRes.isValid) {
            return phoneRes.error || 'Please enter a valid phone number with country code.';
          }
          return undefined;
        }
      }
      case 'email': {
        const trimmed = (value || '').trim();
        if (!trimmed) return 'Email address is required.';
        if (trimmed.length > 255) return 'Email cannot exceed 255 characters.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
          return 'Please enter a valid email address.';
        }
        return undefined;
      }
      case 'address': {
        const trimmed = (value || '').trim();
        if (trimmed.length > 150) return 'Address cannot exceed 150 characters.';
        return undefined;
      }
      case 'city': {
        const trimmed = (value || '').trim();
        if (!trimmed) return 'Please select a District / City.';
        if (!currentForm.state) return 'Please select a State or Union Territory first.';
        const stateDistricts = STATES_DISTRICTS[currentForm.state] || [];
        if (stateDistricts.length > 0 && !stateDistricts.includes(trimmed)) {
          return 'Please select a valid District / City from the list.';
        }
        return undefined;
      }
      case 'state': {
        const trimmed = (value || '').trim();
        if (!trimmed) return 'Please select a State or Union Territory.';
        if (!STATES_DISTRICTS[trimmed]) return 'Please select a valid Indian State or Union Territory.';
        return undefined;
      }
      case 'zipCode': {
        const trimmed = (value || '').trim();
        if (!trimmed) return undefined;
        if (!/^[1-9][0-9]{5}$/.test(trimmed)) return 'Postal / PIN code must be a 6-digit number.';
        return undefined;
      }
      case 'deviceCategory': {
        if (!value || !(value as string).trim()) return 'Device category is required.';
        return undefined;
      }
      case 'customDeviceCategory': {
        if (currentForm.deviceCategory === 'Other') {
          const trimmed = (value || '').trim();
          if (!trimmed) return 'Please specify your device category.';
          if (trimmed.length < 2 || trimmed.length > 100) return 'Device category must be between 2 and 100 characters.';
          if (!/^[a-zA-Z0-9\s/&'()\-]+$/.test(trimmed)) return 'Device category contains invalid characters.';
        }
        return undefined;
      }
      case 'brand': {
        const trimmed = (value || '').trim();
        if (!trimmed) return 'Brand is required.';
        if (trimmed.length > 30) return 'Brand cannot exceed 30 characters.';
        return undefined;
      }
      case 'customBrand': {
        if (currentForm.brand === 'Other') {
          const trimmed = (value || '').trim();
          if (!trimmed) return 'Please specify your custom brand.';
          if (trimmed.length < 2 || trimmed.length > 30) return 'Brand name must be between 2 and 30 characters.';
        }
        return undefined;
      }
      case 'modelNumber': {
        const trimmed = (value || '').trim();
        if (!trimmed) return undefined;
        if (trimmed.length > 30) return 'Model number cannot exceed 30 characters.';
        if (!/^[a-zA-Z0-9\s\-._/]+$/.test(trimmed)) return 'Model number contains invalid characters.';
        return undefined;
      }
      case 'serialNumber': {
        const trimmed = (value || '').trim();
        if (!trimmed) return undefined;
        if (trimmed.length > 30) return 'Serial number cannot exceed 30 characters.';
        if (!/^[a-zA-Z0-9\s\-._/]+$/.test(trimmed)) return 'Serial number contains invalid characters.';
        return undefined;
      }
      case 'deviceConfiguration': {
        const trimmed = (value || '').trim();
        if (trimmed.length > 200) return 'Configuration cannot exceed 200 characters.';
        return undefined;
      }
      case 'problemType': {
        if (!value || !(value as string).trim()) return 'Problem type is required.';
        return undefined;
      }
      case 'customProblemType': {
        if (currentForm.problemType === 'Other') {
          const trimmed = (value || '').trim();
          if (!trimmed) return 'Please specify your custom problem type.';
          if (trimmed.length < 2 || trimmed.length > 150) return 'Custom problem type cannot exceed 150 characters.';
        }
        return undefined;
      }
      case 'problemDescription': {
        const trimmed = (value || '').trim();
        if (!trimmed) return 'Problem description is required.';
        if (trimmed.length < 10) return 'Problem description must be at least 10 characters.';
        if (trimmed.length > 500) return 'Problem description cannot exceed 500 characters.';
        return undefined;
      }
      case 'serviceType': {
        if (!value || !(value as string).trim()) return 'Service type is required.';
        return undefined;
      }
      case 'customServiceType': {
        if (currentForm.serviceType === 'Other') {
          const trimmed = (value || '').trim();
          if (!trimmed) return 'Please specify the service when Other is selected.';
          if (trimmed.length < 2 || trimmed.length > 150) return 'Custom service preference must be between 2 and 150 characters.';
        }
        return undefined;
      }
      default:
        return undefined;
    }
  };

  const handleBlur = (
    e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> | { target: { name: string; value: any } }
  ) => {
    const { name, value } = e.target;
    const err = validateSingleField(name, value, formData);
    setErrors(prev => {
      const next = { ...prev };
      if (err) {
        next[name] = err;
      } else {
        delete next[name];
      }
      return next;
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    setFormData(prev => {
      const nextData = { ...prev, [name]: value };
      if (name === 'state') {
        // Clear previously selected district immediately on State change
        nextData.city = '';
      }
      if (name === 'deviceCategory') {
        nextData.problemType = '';
        nextData.customProblemType = '';
        if (value !== 'Other') {
          nextData.customDeviceCategory = '';
        }
      }
      if (name === 'brand' && value !== 'Other') {
        nextData.customBrand = '';
      }
      if (name === 'problemType' && value !== 'Other') {
        nextData.customProblemType = '';
      }
      if (name === 'serviceType' && value !== 'Other') {
        nextData.customServiceType = '';
      }
      return nextData;
    });

    if (name === 'state') {
      setErrors(prev => {
        const next = { ...prev };
        delete next.city;
        if (value) {
          delete next.state;
        }
        return next;
      });
    }

    // Instant validation for field if already showing an error
    if (errors[name] || (name === 'deviceCategory' && errors.customDeviceCategory) || (name === 'brand' && errors.customBrand) || (name === 'problemType' && errors.customProblemType) || (name === 'serviceType' && errors.customServiceType)) {
      const currentValues = { ...formData, [name]: value, ...(name === 'state' ? { city: '' } : {}) };
      const err = validateSingleField(name, value, currentValues);
      setErrors(prev => {
        const next = { ...prev };
        if (err) {
          next[name] = err;
        } else {
          delete next[name];
        }
        if (name === 'state') delete next.city;
        if (name === 'deviceCategory' && value !== 'Other') delete next.customDeviceCategory;
        if (name === 'brand' && value !== 'Other') delete next.customBrand;
        if (name === 'problemType' && value !== 'Other') delete next.customProblemType;
        if (name === 'serviceType' && value !== 'Other') delete next.customServiceType;
        return next;
      });
    }
  };

  const validateFile = (file: File): string | null => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowedTypes.includes(file.type)) {
      return 'Format not supported. Only JPG, JPEG, and PNG are allowed.';
    }
    if (file.size > maxSize) {
      return 'File size exceeds 5 MB limit.';
    }
    return null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fileType: 'deviceImage' | 'errorScreenshot') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileError = validateFile(file);
    if (fileError) {
      setErrors(prev => ({ ...prev, [fileType]: fileError }));
      return;
    }

    // Clear existing error
    if (errors[fileType]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[fileType];
        return next;
      });
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (fileType === 'deviceImage') {
        setDeviceImage(file);
        setDeviceImagePreview(reader.result as string);
      } else {
        setErrorScreenshot(file);
        setErrorScreenshotPreview(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked } = e.target;
    if (name === 'preferredContactMethod') {
      setFormData(prev => {
        const currentArr = Array.isArray(prev.preferredContactMethod) ? prev.preferredContactMethod : [];
        let updatedArr;
        if (checked) {
          updatedArr = [...currentArr, value];
        } else {
          updatedArr = currentArr.filter(item => item !== value);
        }
        return { ...prev, preferredContactMethod: updatedArr };
      });
    }
  };

  const removeFile = (fileType: 'deviceImage' | 'errorScreenshot') => {
    if (fileType === 'deviceImage') {
      setDeviceImage(null);
      setDeviceImagePreview(null);
      if (deviceImageInputRef.current) deviceImageInputRef.current.value = '';
    } else {
      setErrorScreenshot(null);
      setErrorScreenshotPreview(null);
      if (errorScreenshotInputRef.current) errorScreenshotInputRef.current.value = '';
    }
  };

  const validateForm = () => {
    const tempErrors: Record<string, string> = {};
    const fieldOrder = [
      'customerName',
      'mobile',
      'email',
      'address',
      'state',
      'city',
      'zipCode',
      'deviceCategory',
      'customDeviceCategory',
      'brand',
      'customBrand',
      'modelNumber',
      'serialNumber',
      'deviceConfiguration',
      'problemType',
      'customProblemType',
      'problemDescription',
      'serviceType',
      'customServiceType'
    ];

    let firstFieldKey: string | undefined = undefined;

    for (const key of fieldOrder) {
      const err = validateSingleField(key, (formData as any)[key], formData);
      if (err) {
        tempErrors[key] = err;
        if (!firstFieldKey) {
          firstFieldKey = key;
        }
      }
    }

    setErrors(tempErrors);
    return {
      isValid: Object.keys(tempErrors).length === 0,
      firstFieldKey,
      errors: tempErrors
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError('');

    const { isValid, firstFieldKey } = validateForm();
    if (!isValid) {
      if (firstFieldKey) {
        const element = document.getElementsByName(firstFieldKey)[0] || document.getElementById(firstFieldKey);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if ('focus' in element && typeof (element as any).focus === 'function') {
            (element as any).focus();
          }
        }
      }
      return;
    }

    setIsSubmitting(true);

    // Prepare Multipart FormData with trimmed values
    const submissionData = new FormData();
    submissionData.append('clientSubmissionId', clientSubmissionId);
    Object.entries(formData).forEach(([key, value]) => {
      if (key === 'preferredContactMethod' && Array.isArray(value)) {
        submissionData.append(key, value.join(', '));
      } else if (key === 'customDeviceCategory') {
        if (formData.deviceCategory === 'Other' && value) {
          submissionData.append(key, (value as string).trim());
        }
      } else if (key === 'customBrand') {
        if (formData.brand === 'Other' && value) {
          submissionData.append(key, (value as string).trim());
        }
      } else if (key === 'customProblemType') {
        if (formData.problemType === 'Other' && value) {
          submissionData.append(key, (value as string).trim());
        }
      } else if (key === 'customServiceType') {
        if (formData.serviceType === 'Other' && value) {
          submissionData.append(key, (value as string).trim());
        }
      } else {
        const strVal = typeof value === 'string' ? value.trim() : (Array.isArray(value) ? value.join(', ') : String(value ?? ''));
        submissionData.append(key, strVal);
      }
    });

    if (deviceImage) {
      submissionData.append('deviceImage', deviceImage);
    }
    if (errorScreenshot) {
      submissionData.append('errorScreenshot', errorScreenshot);
    }

    try {
      const recaptchaToken = await getRecaptchaToken('book_repair');
      if (recaptchaToken) {
        submissionData.append('recaptchaToken', recaptchaToken);
      }

      const response = await repairApi.submitRequest(submissionData, token);
      if (response.ok) {
        setSubmitSuccess(true);
        if (response.data && response.data.ticketNumber) {
          setSubmitTicketId(response.data.ticketNumber);
        }
        if (response.data?.isDuplicate) {
          setIsDuplicate(true);
          setDuplicateMessage(response.data.message || `You have already submitted this repair request. Ticket ID: ${response.data.ticketNumber}`);
        } else {
          setIsDuplicate(false);
          setDuplicateMessage('');
        }

        setIsNewAccount(Boolean(response.data?.isNewCustomer));
        setIsExistingAccount(Boolean(response.data?.isExistingCustomer));
        setSubmittedEmail(formData.email.trim());
        setCountdown(8);
        setAutoRedirectPaused(false);

        // If guest submitted and system auto-created a customer account, log them in
        if (response.data && response.data.autoLogin) {
          const { token: newToken, user: newUser } = response.data.autoLogin;
          login(newToken, newUser, true); // skip navigation on auto-login
        }

        try {
          localStorage.removeItem(DRAFT_ID_KEY);
          sessionStorage.removeItem('tekdoctor_rebook_device');
        } catch (e) {
          // ignore
        }
      } else {
        const errMsg = response.error || 'Failed to submit repair inquiry. Please try again.';
        if (response.data?.isDuplicate || (response.data?.ticketNumber && errMsg.toLowerCase().includes('already submitted'))) {
          setSubmitSuccess(true);
          setIsDuplicate(true);
          const tNum = response.data?.ticketNumber || '';
          setSubmitTicketId(tNum);
          setDuplicateMessage(errMsg || `You have already submitted this repair request. Ticket ID: ${tNum}`);
        } else if (response.errors && typeof response.errors === 'object' && Object.keys(response.errors).length > 0) {
          setErrors(prev => ({ ...prev, ...response.errors }));
          setSubmitError(errMsg);
          const firstErrKey = Object.keys(response.errors)[0];
          const el = document.getElementsByName(firstErrKey)[0] || document.getElementById(firstErrKey);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if ('focus' in el && typeof (el as any).focus === 'function') (el as any).focus();
          }
        } else {
          setSubmitError(errMsg);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected network error occurred. Please check your connection.';
      setSubmitError(msg);
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyTicket = () => {
    if (!submitTicketId) return;
    navigator.clipboard.writeText(submitTicketId);
    setCopiedTicket(true);
    toast.success('Ticket ID copied to clipboard!');
    setTimeout(() => setCopiedTicket(false), 2500);
  };

  if (submitSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`max-w-xl mx-auto bg-zinc-900/60 border ${isDuplicate ? 'border-amber-500/40 shadow-[0_0_40px_rgba(245,158,11,0.1)]' : 'border-emerald-500/40 shadow-[0_0_50px_rgba(16,185,129,0.12)]'} rounded-3xl p-6 sm:p-8 text-center backdrop-blur-xl relative overflow-hidden`}
      >
        {/* Glow Header Accent */}
        <div className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${isDuplicate ? 'from-amber-500 via-yellow-400 to-amber-600' : 'from-emerald-500 via-neon-cyan to-teal-400'}`} />

        <div className={`w-16 h-16 ${isDuplicate ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'} border rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-inner`}>
          {isDuplicate ? (
            <Info className="w-8 h-8" />
          ) : (
            <CheckCircle className="w-8 h-8" />
          )}
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2 tracking-tight font-outfit">
          {isDuplicate ? 'Request Already In Progress' : 'Booking Successful!'}
        </h2>
        <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed mb-6">
          {isDuplicate
            ? (duplicateMessage || `An active ticket with this description is already being serviced. Ticket ID: #${submitTicketId}`)
            : 'Your repair request has been initialized in our engineering system.'}
        </p>

        {/* Ticket ID Box with Instant Copy */}
        {submitTicketId && (
          <div className="bg-black/60 border border-zinc-800 rounded-2xl p-4 mb-5 flex items-center justify-between gap-3 text-left">
            <div>
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-0.5">Ticket Identifier</span>
              <span className="text-lg sm:text-xl font-bold font-mono text-neon-cyan tracking-wider">#{submitTicketId}</span>
            </div>
            <button
              type="button"
              onClick={handleCopyTicket}
              className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Copy Ticket ID"
            >
              {copiedTicket ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copiedTicket ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        )}

        {/* Account Status Box */}
        {isNewAccount && (
          <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-4 sm:p-5 mb-5 text-left space-y-2.5">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider font-outfit">
              <ShieldCheck size={16} className="shrink-0" />
              <span>Customer Account Created & Signed In</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              We have automatically created your personal TekDoctor Customer Account and authenticated this browser.
            </p>
            <div className="bg-black/40 border border-zinc-800/80 rounded-xl p-3 text-[11px] text-zinc-400 flex items-start gap-2.5">
              <Mail size={16} className="text-neon-cyan shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                A welcome email with your secure <strong className="text-white">Set Your Password</strong> link has been dispatched to <span className="font-mono text-neon-cyan break-all">{submittedEmail || formData.email}</span>. Click it anytime to set your password and log in from any other computer, tablet, or phone.
              </div>
            </div>
          </div>
        )}

        {isExistingAccount && (
          <div className="bg-neon-cyan/10 border border-neon-cyan/25 rounded-2xl p-4 mb-5 text-left space-y-1.5">
            <div className="flex items-center gap-2 text-neon-cyan font-bold text-xs uppercase tracking-wider font-outfit">
              <ShieldCheck size={16} className="shrink-0" />
              <span>Linked to Your Customer Account</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              This repair ticket has been securely associated with your existing account for <span className="font-mono text-white break-all">{submittedEmail || formData.email}</span>. You are signed in on this browser.
            </p>
          </div>
        )}

        {/* Technical Details Strip */}
        <div className="bg-black/40 border border-zinc-800/80 rounded-2xl p-3.5 mb-5 text-left text-[11px] font-mono space-y-1.5 text-zinc-400">
          <div className="flex justify-between items-center">
            <span className="text-zinc-600 uppercase">Device:</span>
            <span className="text-zinc-200 font-medium">{formData.brand} {formData.modelNumber ? `(${formData.modelNumber})` : ''} - {formData.deviceCategory}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-600 uppercase">Customer:</span>
            <span className="text-zinc-200 font-medium">{formData.customerName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-600 uppercase">Contact Link:</span>
            <span className="text-zinc-200 font-medium">{Array.isArray(formData.preferredContactMethod) ? formData.preferredContactMethod.join(', ') : formData.preferredContactMethod}</span>
          </div>
        </div>

        {/* 4-Step Progress Flow for Ticket */}
        <div className="mb-6 text-left">
          <RepairStepProgress
            ticket={{
              id: submitTicketId,
              ticketNumber: submitTicketId,
              status: 'pending',
              priority: formData.priority,
            }}
          />
        </div>

        {/* Primary Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <Link
            to={submitTicketId ? `/repair/status?id=${encodeURIComponent(submitTicketId)}` : ROUTES.REPAIR_STATUS}
            className="btn-neon w-full py-3.5 px-4 font-bold text-xs uppercase tracking-wider text-center flex items-center justify-center gap-2 rounded-xl"
          >
            <span>View Repair Status</span>
            <ExternalLink size={14} />
          </Link>
          <Link
            to={ROUTES.PROFILE}
            className="w-full py-3.5 px-4 bg-white hover:bg-zinc-200 text-black font-extrabold text-xs uppercase tracking-wider text-center flex items-center justify-center gap-2 rounded-xl transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] cursor-pointer"
          >
            <span>Go To My Profile</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {/* Auto-Redirect Countdown Bar */}
        {!isDuplicate && (
          <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3 mb-4 flex items-center justify-between gap-3 text-left">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <Loader2 size={13} className="text-neon-cyan animate-spin shrink-0" />
              <span>
                {autoRedirectPaused
                  ? 'Auto-redirect paused.'
                  : `Redirecting to Customer Dashboard in ${countdown}s...`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAutoRedirectPaused(prev => !prev)}
              className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 hover:text-white transition-colors underline cursor-pointer shrink-0"
            >
              {autoRedirectPaused ? 'Resume' : 'Stay Here'}
            </button>
          </div>
        )}

        {/* Secondary Reset Button */}
        <button
          type="button"
          onClick={() => {
            setSubmitSuccess(false);
            setIsDuplicate(false);
            setDuplicateMessage('');
            setIsNewAccount(false);
            setIsExistingAccount(false);
            setSubmittedEmail('');
            setCountdown(8);
            setAutoRedirectPaused(false);
            setClientSubmissionId(
              window.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)
            );
            setFormData({
              customerName: '',
              mobile: '',
              email: '',
              address: '',
              city: '',
              state: '',
              zipCode: '',
              deviceCategory: '',
              customDeviceCategory: '',
              brand: '',
              customBrand: '',
              modelNumber: '',
              serialNumber: '',
              deviceConfiguration: '',
              problemType: '',
              customProblemType: '',
              problemDescription: '',
              serviceType: 'Bring to Service Center',
              customServiceType: '',
              priority: 'Standard',
              preferredContactMethod: ['WhatsApp'],
            });
            setDeviceImage(null);
            setDeviceImagePreview(null);
            setErrorScreenshot(null);
            setErrorScreenshotPreview(null);
            setSubmitTicketId('');
          }}
          className="w-full py-2.5 bg-transparent hover:bg-zinc-900/50 text-zinc-500 hover:text-zinc-300 font-mono text-[11px] uppercase tracking-wider transition-colors cursor-pointer rounded-lg border border-transparent hover:border-zinc-800"
        >
          Book Another Repair
        </button>
      </motion.div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <form id="repair-inquiry-form" onSubmit={handleSubmit} noValidate className="space-y-8">

        {/* Re-booking Banner */}
        {isRebookMode && (
          <div className="p-4 sm:p-5 rounded-2xl bg-cyan-950/40 border border-neon-cyan/40 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_0_30px_rgba(0,229,255,0.12)]">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-neon-cyan/15 border border-neon-cyan/30 flex items-center justify-center text-neon-cyan shrink-0">
                <Laptop size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-neon-cyan uppercase tracking-wider">
                    Re-booking Previously Serviced Device
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30 font-mono font-semibold">
                    Auto-filled from History
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white font-outfit mt-0.5">
                  {rebookData?.brand || formData.brand} {rebookData?.modelNumber || formData.modelNumber} {formData.deviceCategory ? `(${formData.deviceCategory})` : ''}
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Device specifications and customer details are pre-filled. Enter only your new issue details, service preferences, and optional attachments.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancelRebooking}
              className="text-xs font-mono text-zinc-300 hover:text-white px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-zinc-500 self-start sm:self-auto transition-all cursor-pointer whitespace-nowrap min-h-[40px]"
            >
              Reset to New Device
            </button>
          </div>
        )}

        {/* Section 1: Customer Info */}
        <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 md:p-8 backdrop-blur-md hover:border-zinc-800 transition-all shadow-xl">
          <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4 mb-6">
            <div className="w-10 h-10 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
              <User className="text-neon-cyan w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white font-outfit">01. Customer Information</h3>
              <p className="text-xs text-zinc-500">Provide your contact and location details</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="customerName" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Full Name *</label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={30}
                  id="customerName"
                  name="customerName"
                  value={formData.customerName}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errors.customerName)}
                  aria-describedby={errors.customerName ? "customerName-error" : undefined}
                  placeholder="e.g. Vivek Kumar"
                  className={`w-full bg-zinc-950/60 border ${errors.customerName ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                />
              </div>
              {errors.customerName && <p id="customerName-error" className="text-red-400 text-xs mt-1 font-mono">{errors.customerName}</p>}
            </div>

            <div>
              <PhoneInput
                id="mobile"
                name="mobile"
                label="Mobile Number"
                required
                value={formData.mobile}
                onChange={(normalized) => {
                  setFormData((prev) => ({ ...prev, mobile: normalized }));
                  if (errors.mobile) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.mobile;
                      return next;
                    });
                  }
                }}
                onBlur={() => handleBlur({ target: { name: 'mobile', value: formData.mobile } } as any)}
                error={errors.mobile}
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Email Address *</label>
              <div className="relative">
                <input
                  type="email"
                  id="email"
                  name="email"
                  maxLength={255}
                  value={formData.email}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  placeholder="e.g. you@example.com"
                  className={`w-full bg-zinc-950/60 border ${errors.email ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                />
              </div>
              {errors.email && <p id="email-error" className="text-red-400 text-xs mt-1 font-mono">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="address" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Address (Optional)</label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={150}
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errors.address)}
                  aria-describedby={errors.address ? "address-error" : undefined}
                  placeholder="Street / Landmark (Max 150 chars)"
                  className={`w-full bg-zinc-950/60 border ${errors.address ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                />
              </div>
              {errors.address && <p id="address-error" className="text-red-400 text-xs mt-1 font-mono">{errors.address}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 md:col-span-2">
              <div>
                <label htmlFor="state" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">State / UT *</label>
                <div className="relative">
                  <select
                    id="state"
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    aria-invalid={Boolean(errors.state)}
                    aria-describedby={errors.state ? "state-error" : undefined}
                    className={`w-full bg-zinc-950/60 border ${errors.state ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all cursor-pointer`}
                  >
                    <option value="" className="bg-zinc-900 text-zinc-400">Select State / UT</option>
                    {INDIAN_STATES.map((st) => (
                      <option key={st} value={st} className="bg-zinc-900 text-white">{st}</option>
                    ))}
                  </select>
                </div>
                {errors.state && <p id="state-error" className="text-red-400 text-xs mt-1 font-mono">{errors.state}</p>}
              </div>

              <div>
                <label htmlFor="city" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">District / City *</label>
                <div className="relative">
                  <select
                    id="city"
                    name="city"
                    disabled={!formData.state}
                    value={formData.city}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    aria-invalid={Boolean(errors.city)}
                    aria-describedby={errors.city ? "city-error" : undefined}
                    className={`w-full bg-zinc-950/60 border ${
                      errors.city ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'
                    } rounded-lg p-3 text-sm text-white focus:outline-none transition-all ${
                      !formData.state ? 'opacity-50 cursor-not-allowed text-zinc-500' : 'cursor-pointer'
                    }`}
                  >
                    <option value="" className="bg-zinc-900 text-zinc-400">
                      {!formData.state ? '← First select a State / UT' : 'Select District / City'}
                    </option>
                    {formData.state && (STATES_DISTRICTS[formData.state] || []).map((d) => (
                      <option key={d} value={d} className="bg-zinc-900 text-white font-normal">{d}</option>
                    ))}
                  </select>
                </div>
                {errors.city && <p id="city-error" className="text-red-400 text-xs mt-1 font-mono">{errors.city}</p>}
              </div>

              <div>
                <label htmlFor="zipCode" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2 flex items-center justify-between">
                  <span>Postal / PIN</span>
                  {loadingPincode && (
                    <span className="text-[10px] text-neon-cyan flex items-center gap-1 font-mono normal-case">
                      <Loader2 size={10} className="animate-spin" /> detecting...
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="zipCode"
                    maxLength={6}
                    name="zipCode"
                    value={formData.zipCode}
                    onChange={(e) => {
                      const onlyNums = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                      handleInputChange({
                        target: { name: e.target.name, value: onlyNums }
                      } as any);
                    }}
                    onBlur={handleBlur}
                    aria-invalid={Boolean(errors.zipCode)}
                    aria-describedby={errors.zipCode ? "zipCode-error" : undefined}
                    placeholder="e.g. 560001 (6 digits)"
                    className={`w-full bg-zinc-950/60 border ${errors.zipCode ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all pr-9`}
                  />
                  {loadingPincode && (
                    <div className="absolute right-3 top-3.5 text-neon-cyan">
                      <Loader2 size={16} className="animate-spin" />
                    </div>
                  )}
                </div>
                {errors.zipCode && <p id="zipCode-error" className="text-red-400 text-xs mt-1 font-mono">{errors.zipCode}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Device Info */}
        <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 md:p-8 backdrop-blur-md hover:border-zinc-800 transition-all shadow-xl">
          <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4 mb-6">
            <div className="w-10 h-10 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
              <Laptop className="text-neon-cyan w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg text-white font-outfit">02. Device Information</h3>
                {isRebookMode && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                    Re-book Mode (Auto-filled)
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500">Provide brand, category, and catalog models</p>
            </div>
          </div>

          {isRebookMode && (
            <div className="mb-5 p-3 rounded-xl bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan text-xs font-mono flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle size={15} className="shrink-0" />
                <span>Device specs loaded from history. Fields are locked to avoid manual re-entry errors.</span>
              </div>
              <button
                type="button"
                onClick={handleCancelRebooking}
                className="text-[11px] underline hover:text-white shrink-0 cursor-pointer font-sans"
              >
                Unlock
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="deviceCategory" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Device Category *</label>
              <select
                id="deviceCategory"
                name="deviceCategory"
                disabled={isRebookMode}
                value={formData.deviceCategory}
                onChange={handleInputChange}
                onBlur={handleBlur}
                aria-invalid={Boolean(errors.deviceCategory)}
                aria-describedby={errors.deviceCategory ? "deviceCategory-error" : undefined}
                className={`w-full bg-black border ${errors.deviceCategory ? 'border-red-500/50' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-zinc-300 focus:outline-none transition-all appearance-none ${
                  isRebookMode ? 'opacity-70 cursor-not-allowed bg-zinc-950/80 border-zinc-700' : 'cursor-pointer'
                }`}
              >
                <option value="">-- Select Category --</option>
                {DEVICE_CATEGORIES.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              {errors.deviceCategory && <p id="deviceCategory-error" className="text-red-400 text-xs mt-1 font-mono">{errors.deviceCategory}</p>}
            </div>

            {formData.deviceCategory === 'Other' && (
              <div className="md:col-span-2">
                <label htmlFor="customDeviceCategory" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  Please specify your device category *
                </label>
                <input
                  type="text"
                  id="customDeviceCategory"
                  name="customDeviceCategory"
                  disabled={isRebookMode}
                  readOnly={isRebookMode}
                  maxLength={100}
                  value={formData.customDeviceCategory}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errors.customDeviceCategory)}
                  aria-describedby={errors.customDeviceCategory ? "customDeviceCategory-error" : undefined}
                  placeholder="e.g. Medical Monitor, VR Headset, Smart Watch"
                  className={`w-full bg-black border ${errors.customDeviceCategory ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all ${
                    isRebookMode ? 'opacity-70 cursor-not-allowed bg-zinc-950/80 border-zinc-700' : ''
                  }`}
                />
                {errors.customDeviceCategory && (
                  <p id="customDeviceCategory-error" className="text-red-400 text-xs mt-1 font-mono">{errors.customDeviceCategory}</p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="brand" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Brand Name *</label>
              <select
                id="brand"
                name="brand"
                disabled={isRebookMode}
                value={formData.brand}
                onChange={handleInputChange}
                onBlur={handleBlur}
                aria-invalid={Boolean(errors.brand)}
                aria-describedby={errors.brand ? "brand-error" : undefined}
                className={`w-full bg-black border ${errors.brand ? 'border-red-500/50' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-zinc-300 focus:outline-none transition-all appearance-none ${
                  isRebookMode ? 'opacity-70 cursor-not-allowed bg-zinc-950/80 border-zinc-700' : 'cursor-pointer'
                }`}
              >
                <option value="">-- Select Brand --</option>
                {BRANDS.map(brand => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
              {errors.brand && <p id="brand-error" className="text-red-400 text-xs mt-1 font-mono">{errors.brand}</p>}
            </div>

            {formData.brand === 'Other' && (
              <div className="md:col-span-2">
                <label htmlFor="customBrand" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Custom Brand Name *</label>
                <input
                  type="text"
                  id="customBrand"
                  name="customBrand"
                  maxLength={30}
                  disabled={isRebookMode}
                  readOnly={isRebookMode}
                  value={formData.customBrand}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errors.customBrand)}
                  aria-describedby={errors.customBrand ? "customBrand-error" : undefined}
                  placeholder="e.g. Acer or MSI (Max 30 chars)"
                  className={`w-full bg-black border ${errors.customBrand ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all ${
                    isRebookMode ? 'opacity-70 cursor-not-allowed bg-zinc-950/80 border-zinc-700' : ''
                  }`}
                />
                {errors.customBrand && <p id="customBrand-error" className="text-red-400 text-xs mt-1 font-mono">{errors.customBrand}</p>}
              </div>
            )}

            <div>
              <label htmlFor="modelNumber" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Model Number (Optional)</label>
              <input
                type="text"
                id="modelNumber"
                disabled={isRebookMode}
                readOnly={isRebookMode}
                maxLength={30}
                name="modelNumber"
                value={formData.modelNumber}
                onChange={handleInputChange}
                onBlur={handleBlur}
                aria-invalid={Boolean(errors.modelNumber)}
                aria-describedby={errors.modelNumber ? "modelNumber-error" : undefined}
                placeholder="e.g. Latitude 5420 (Max 30 chars)"
                className={`w-full bg-black border ${errors.modelNumber ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all ${
                  isRebookMode ? 'opacity-70 cursor-not-allowed bg-zinc-950/80 border-zinc-700' : ''
                }`}
              />
              {errors.modelNumber && <p id="modelNumber-error" className="text-red-400 text-xs mt-1 font-mono">{errors.modelNumber}</p>}
            </div>

            <div>
              <label htmlFor="serialNumber" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Serial Number (Optional)</label>
              <input
                type="text"
                id="serialNumber"
                disabled={isRebookMode}
                readOnly={isRebookMode}
                maxLength={30}
                name="serialNumber"
                value={formData.serialNumber}
                onChange={handleInputChange}
                onBlur={handleBlur}
                aria-invalid={Boolean(errors.serialNumber)}
                aria-describedby={errors.serialNumber ? "serialNumber-error" : undefined}
                placeholder="e.g. SN123456789 (Max 30 chars)"
                className={`w-full bg-black border ${errors.serialNumber ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all ${
                  isRebookMode ? 'opacity-70 cursor-not-allowed bg-zinc-950/80 border-zinc-700' : ''
                }`}
              />
              {errors.serialNumber && <p id="serialNumber-error" className="text-red-400 text-xs mt-1 font-mono">{errors.serialNumber}</p>}
            </div>

            <div className="md:col-span-2">
              <label htmlFor="deviceConfiguration" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Device Configuration (Optional)</label>
              <textarea
                id="deviceConfiguration"
                name="deviceConfiguration"
                disabled={isRebookMode}
                readOnly={isRebookMode}
                maxLength={200}
                value={formData.deviceConfiguration}
                onChange={handleInputChange}
                onBlur={handleBlur}
                aria-invalid={Boolean(errors.deviceConfiguration)}
                aria-describedby={errors.deviceConfiguration ? "deviceConfiguration-error" : undefined}
                rows={2}
                placeholder="e.g. Core i7, 16GB RAM, 512GB SSD, Windows 11 (Max 200 chars)"
                className={`w-full bg-black border ${errors.deviceConfiguration ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all ${
                  isRebookMode ? 'opacity-70 cursor-not-allowed bg-zinc-950/80 border-zinc-700' : ''
                }`}
              />
              {errors.deviceConfiguration && <p id="deviceConfiguration-error" className="text-red-400 text-xs mt-1 font-mono">{errors.deviceConfiguration}</p>}
            </div>
          </div>
        </div>

        {/* Section 3: Issue Details */}
        <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 md:p-8 backdrop-blur-md hover:border-zinc-800 transition-all shadow-xl">
          <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4 mb-6">
            <div className="w-10 h-10 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
              <Wrench className="text-neon-cyan w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white font-outfit">03. Issue Details</h3>
              <p className="text-xs text-zinc-500">Tell us what's wrong with your system</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label htmlFor="problemType" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Problem Type *</label>
              <select
                id="problemType"
                name="problemType"
                value={formData.problemType}
                onChange={handleInputChange}
                onBlur={handleBlur}
                aria-invalid={Boolean(errors.problemType)}
                aria-describedby={errors.problemType ? "problemType-error" : undefined}
                className={`w-full bg-black border ${errors.problemType ? 'border-red-500/50' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-zinc-300 focus:outline-none transition-all appearance-none cursor-pointer`}
              >
                <option value="">-- Select Problem Type --</option>
                {formData.deviceCategory ? (
                  CATEGORY_PROBLEMS[formData.deviceCategory]?.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))
                ) : (
                  <option disabled value="">Please select device category first</option>
                )}
              </select>
              {errors.problemType && <p id="problemType-error" className="text-red-400 text-xs mt-1 font-mono">{errors.problemType}</p>}
            </div>

            {formData.problemType === 'Other' && (
              <div>
                <label htmlFor="customProblemType" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Specify Custom Problem *</label>
                <input
                  type="text"
                  id="customProblemType"
                  name="customProblemType"
                  maxLength={150}
                  value={formData.customProblemType}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errors.customProblemType)}
                  aria-describedby={errors.customProblemType ? "customProblemType-error" : undefined}
                  placeholder="e.g. Broken screen hinge, motherboard short circuit (Max 150 chars)"
                  className={`w-full bg-black border ${errors.customProblemType ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                />
                {errors.customProblemType && <p id="customProblemType-error" className="text-red-400 text-xs mt-1 font-mono">{errors.customProblemType}</p>}
              </div>
            )}

            <div>
              <label htmlFor="problemDescription" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Detailed Problem Description * (10 - 500 chars)</label>
              <div className="relative">
                <textarea
                  id="problemDescription"
                  name="problemDescription"
                  value={formData.problemDescription}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errors.problemDescription)}
                  aria-describedby={errors.problemDescription ? "problemDescription-error" : undefined}
                  maxLength={500}
                  rows={4}
                  placeholder="Please describe the symptoms, when it started happening, and what troubleshooting steps you've already attempted..."
                  className={`w-full bg-zinc-950/60 border ${errors.problemDescription ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                />
                <div className="absolute bottom-3 right-3 text-xs text-zinc-500 font-mono">
                  {formData.problemDescription.length} / 500
                </div>
              </div>
              <div className="flex justify-between items-center mt-1">
                {errors.problemDescription ? (
                  <p id="problemDescription-error" className="text-red-400 text-xs font-mono">{errors.problemDescription}</p>
                ) : (
                  <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Describe symptoms clearly</span>
                )}
                <span className={`text-[10px] font-mono ${formData.problemDescription.trim().length >= 10 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {formData.problemDescription.trim().length} chars
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Service Preference */}
        <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 md:p-8 backdrop-blur-md hover:border-zinc-800 transition-all shadow-xl">
          <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4 mb-6">
            <div className="w-10 h-10 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
              <Shield className="text-neon-cyan w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white font-outfit">04. Service Preference</h3>
              <p className="text-xs text-zinc-500">Customize how and when you want support</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Service Type</label>
              <div className="flex flex-col gap-2.5">
                {['Bring to Service Center', 'Home Visit', 'Pickup & Drop', 'Other'].map(type => (
                  <label key={type} className="flex items-center gap-3 cursor-pointer group text-sm text-zinc-300">
                    <input
                      type="radio"
                      name="serviceType"
                      value={type}
                      checked={formData.serviceType === type}
                      onChange={handleInputChange}
                      className="w-4 h-4 accent-neon-cyan cursor-pointer"
                    />
                    <span className="group-hover:text-white transition-colors">{type}</span>
                  </label>
                ))}
              </div>
              {errors.serviceType && <p id="serviceType-error" className="text-red-400 text-xs mt-1 font-mono">{errors.serviceType}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Priority Level</label>
              <div className="flex flex-col gap-2.5">
                {[
                  'Standard',
                  'Priority',
                  // Express and Urgent options are temporarily disabled as per business requirements
                  // 'Express (Same Day)',
                  // 'Urgent (Within 2 Hours)'
                ].map(level => (
                  <label key={level} className="flex items-center gap-3 cursor-pointer group text-sm text-zinc-300">
                    <input
                      type="radio"
                      name="priority"
                      value={level}
                      checked={formData.priority === level}
                      onChange={handleInputChange}
                      className="w-4 h-4 accent-neon-cyan cursor-pointer"
                    />
                    <span className={`group-hover:text-white transition-colors ${level === 'Priority' ? 'text-amber-400/80 font-bold' : ''}`}>{level}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Contact Method</label>
              <div className="flex flex-col gap-2.5">
                {['Phone Call', 'WhatsApp', 'Email'].map(method => (
                  <label key={method} className="flex items-center gap-3 cursor-pointer group text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      name="preferredContactMethod"
                      value={method}
                      checked={formData.preferredContactMethod.includes(method)}
                      onChange={handleCheckboxChange}
                      className="w-4 h-4 accent-neon-cyan cursor-pointer rounded"
                    />
                    <span className="group-hover:text-white transition-colors">{method}</span>
                  </label>
                ))}
              </div>
            </div>

            {formData.serviceType === 'Other' && (
              <div className="md:col-span-3 pt-2">
                <label htmlFor="customServiceType" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  Please specify the service *
                </label>
                <input
                  type="text"
                  id="customServiceType"
                  name="customServiceType"
                  maxLength={150}
                  value={formData.customServiceType}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errors.customServiceType)}
                  aria-describedby={errors.customServiceType ? "customServiceType-error" : undefined}
                  placeholder="e.g. Remote Diagnostic, Annual Maintenance Contract, Bulk Enterprise Repair"
                  className={`w-full bg-zinc-950/60 border ${errors.customServiceType ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                />
                {errors.customServiceType && (
                  <p id="customServiceType-error" className="text-red-400 text-xs mt-1 font-mono">{errors.customServiceType}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Section 5: Attachments */}
        <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 md:p-8 backdrop-blur-md hover:border-zinc-800 transition-all shadow-xl">
          <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4 mb-6">
            <div className="w-10 h-10 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
              <FileImage className="text-neon-cyan w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white font-outfit">05. Attachments</h3>
              <p className="text-xs text-zinc-500">Upload device condition photos and error reports (Max 5MB each)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Device Image Upload */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">Device Condition Image</label>

              {!deviceImagePreview ? (
                <div
                  onClick={() => deviceImageInputRef.current?.click()}
                  className={`border-2 border-dashed ${errors.deviceImage ? 'border-red-500/40 hover:border-red-500/80' : 'border-zinc-800 hover:border-neon-cyan/50'} bg-black/20 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-black/40`}
                >
                  <FileImage className="text-zinc-500 w-8 h-8 mb-2 group-hover:text-neon-cyan" />
                  <p className="text-xs text-zinc-400 text-center font-semibold">Upload Device Photo</p>
                  <p className="text-[10px] text-zinc-600 text-center mt-1 uppercase font-mono">JPG, PNG, JPEG &lt; 5MB</p>
                  <input
                    type="file"
                    ref={deviceImageInputRef}
                    accept=".jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange(e, 'deviceImage')}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="relative border border-zinc-800 bg-black/40 rounded-xl overflow-hidden p-3 flex items-center gap-3 group">
                  <img src={deviceImagePreview} alt="Device Preview" className="w-12 h-12 object-cover rounded-lg border border-zinc-800" />
                  <div className="flex-grow min-w-0">
                    <p className="text-xs text-zinc-300 truncate font-semibold font-mono">{deviceImage?.name}</p>
                    <p className="text-[10px] text-zinc-600 font-mono">{(deviceImage!.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => removeFile('deviceImage')}
                      className="p-1.5 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                      title="Remove File"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )}
              {errors.deviceImage && <p className="text-red-400 text-xs font-mono">{errors.deviceImage}</p>}
            </div>

            {/* Error Screenshot Upload */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">Error Screenshot</label>

              {!errorScreenshotPreview ? (
                <div
                  onClick={() => errorScreenshotInputRef.current?.click()}
                  className={`border-2 border-dashed ${errors.errorScreenshot ? 'border-red-500/40 hover:border-red-500/80' : 'border-zinc-800 hover:border-neon-cyan/50'} bg-black/20 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-black/40`}
                >
                  <FileImage className="text-zinc-500 w-8 h-8 mb-2 group-hover:text-neon-cyan" />
                  <p className="text-xs text-zinc-400 text-center font-semibold">Upload Error Screen</p>
                  <p className="text-[10px] text-zinc-600 text-center mt-1 uppercase font-mono">JPG, PNG, JPEG &lt; 5MB</p>
                  <input
                    type="file"
                    ref={errorScreenshotInputRef}
                    accept=".jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange(e, 'errorScreenshot')}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="relative border border-zinc-800 bg-black/40 rounded-xl overflow-hidden p-3 flex items-center gap-3 group">
                  <img src={errorScreenshotPreview} alt="Screenshot Preview" className="w-12 h-12 object-cover rounded-lg border border-zinc-800" />
                  <div className="flex-grow min-w-0">
                    <p className="text-xs text-zinc-300 truncate font-semibold font-mono">{errorScreenshot?.name}</p>
                    <p className="text-[10px] text-zinc-600 font-mono">{(errorScreenshot!.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => removeFile('errorScreenshot')}
                      className="p-1.5 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                      title="Remove File"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )}
              {errors.errorScreenshot && <p className="text-red-400 text-xs font-mono">{errors.errorScreenshot}</p>}
            </div>

          </div>
        </div>

        {/* Submit Section */}
        <div className="space-y-4">
          {submitError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex gap-3 text-red-400 text-sm items-start font-mono">
              <Info size={16} className="shrink-0 mt-0.5" />
              <div>{submitError}</div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full btn-neon py-4 cursor-pointer font-bold tracking-[0.2em] uppercase text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-black" />
                Processing Transmission...
              </>
            ) : (
              'Submit Repair Inquiry'
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
