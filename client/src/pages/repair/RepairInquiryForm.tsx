import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  User, Smartphone, Mail, MapPin,
  Laptop, Tag, Wrench, Shield, CheckCircle,
  FileImage, Eye, Trash2, Loader2, Info
} from 'lucide-react';
import { repairApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

const DRAFT_ID_KEY = 'tekdoctor_repair_form_draft_id';

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
  const [formData, setFormData] = useState({
    customerName: '',
    mobile: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    deviceCategory: '',
    brand: '',
    customBrand: '',
    modelNumber: '',
    serialNumber: '',
    deviceConfiguration: '',
    problemType: '',
    problemDescription: '',
    serviceType: 'Bring to Service Center',
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
  const [submitError, setSubmitError] = useState('');

  const deviceImageInputRef = useRef<HTMLInputElement>(null);
  const errorScreenshotInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        customerName: prev.customerName || user.name || '',
        email: prev.email || user.email || '',
      }));
    }
  }, [user]);

  useEffect(() => {
    let draftId = localStorage.getItem(DRAFT_ID_KEY);
    if (!draftId) {
      draftId = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
      localStorage.setItem(DRAFT_ID_KEY, draftId);
    }

    const loadDraft = async () => {
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
  }, []);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    setFormData(prev => {
      const nextData = { ...prev, [name]: value };
      if (name === 'deviceCategory') {
        nextData.problemType = '';
      }
      return nextData;
    });

    // Clear error for field
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[name];
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

    // Customer Info
    if (!formData.customerName.trim()) tempErrors.customerName = 'Full Name is required.';
    else if (formData.customerName.length > 20) tempErrors.customerName = 'Full Name cannot exceed 20 characters.';

    if (!formData.mobile.trim()) {
      tempErrors.mobile = 'Mobile Number is required.';
    } else if (!/^\d{10}$/.test(formData.mobile)) {
      tempErrors.mobile = 'Phone number must be exactly 10 digits.';
    }

    if (!formData.email.trim()) {
      tempErrors.email = 'Email Address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(formData.email.trim())) {
      tempErrors.email = 'Enter a valid email address.';
    }

    if (formData.address && formData.address.length > 100) tempErrors.address = 'Address cannot exceed 100 characters.';

    if (!formData.city.trim()) tempErrors.city = 'City / Location is required.';
    else if (formData.city.length > 50) tempErrors.city = 'City cannot exceed 50 characters.';

    if (formData.state && formData.state.length > 50) tempErrors.state = 'State cannot exceed 50 characters.';

    if (formData.zipCode && !/^\d+$/.test(formData.zipCode)) tempErrors.zipCode = 'Postal/ZIP Code must contain only numeric characters.';

    // Device Info
    if (!formData.deviceCategory) tempErrors.deviceCategory = 'Device Category is required.';
    if (!formData.brand) {
      tempErrors.brand = 'Brand is required.';
    } else if (formData.brand === 'Other' && !formData.customBrand.trim()) {
      tempErrors.customBrand = 'Custom Brand name is required.';
    }

    if (formData.serialNumber && formData.serialNumber.length > 50) tempErrors.serialNumber = 'Serial Number cannot exceed 50 characters.';
    if (formData.modelNumber && formData.modelNumber.length > 50) tempErrors.modelNumber = 'Model Number cannot exceed 50 characters.';
    if (formData.deviceConfiguration && formData.deviceConfiguration.length > 100) tempErrors.deviceConfiguration = 'Configuration cannot exceed 100 characters.';

    // Issue Details
    if (!formData.problemType) tempErrors.problemType = 'Problem Type is required.';
    if (!formData.problemDescription.trim()) {
      tempErrors.problemDescription = 'Detailed problem description is required.';
    } else if (formData.problemDescription.trim().length < 20 || formData.problemDescription.trim().length > 500) {
      tempErrors.problemDescription = 'Description must be between 20 and 500 characters long.';
    }

    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!validateForm()) {
      const firstError = Object.keys(errors)[0];
      const element = document.getElementsByName(firstError)[0];
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setIsSubmitting(true);

    // Prepare Multipart FormData
    const submissionData = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (key === 'preferredContactMethod' && Array.isArray(value)) {
        submissionData.append(key, value.join(', '));
      } else {
        submissionData.append(key, value as string);
      }
    });

    if (deviceImage) {
      submissionData.append('deviceImage', deviceImage);
    }
    if (errorScreenshot) {
      submissionData.append('errorScreenshot', errorScreenshot);
    }

    try {
      const response = await repairApi.submitRequest(submissionData, token);
      if (response.ok) {
        setSubmitSuccess(true);
        if (response.data && response.data.ticketNumber) {
          setSubmitTicketId(response.data.ticketNumber);
        }
        // If guest submitted and system auto-created a customer account, log them in
        if (response.data && response.data.autoLogin) {
          const { token: newToken, user: newUser } = response.data.autoLogin;
          login(newToken, newUser, true); // skip navigation on auto-login
        }

        try {
          localStorage.removeItem(DRAFT_ID_KEY);
        } catch (e) {
          // ignore
        }
      } else {
        setSubmitError(response.error || 'Failed to submit repair inquiry. Please try again.');
      }
    } catch (err) {
      setSubmitError('An unexpected network error occurred. Please check your connection.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-xl mx-auto bg-zinc-900/50 border border-emerald-500/30 rounded-2xl p-8 text-center backdrop-blur-md shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
        <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="text-emerald-400 w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3 tracking-tight font-outfit">Submission Received</h2>
        <p className="text-zinc-400 leading-relaxed mb-6 text-sm">
          Your repair request has been submitted successfully. Our engineering team has logged your query and will contact you shortly.
        </p>
        <div className="bg-black/40 border border-zinc-800 rounded-xl p-4 mb-6 text-left text-xs font-mono space-y-2 text-zinc-500">
          <div><span className="text-neon-cyan">REQUEST_STATUS:</span> PENDING_REVIEW</div>
          {submitTicketId && <div><span className="text-neon-cyan">TICKET_ID:</span> {submitTicketId}</div>}
          <div><span className="text-neon-cyan">INITIALIZED_BY:</span> {formData.customerName.toUpperCase()}</div>
          <div><span className="text-neon-cyan">COMMUNICATION_LINK:</span> {Array.isArray(formData.preferredContactMethod) ? formData.preferredContactMethod.join(', ').toUpperCase() : (formData.preferredContactMethod as string).toUpperCase()}</div>
        </div>
        <button
          onClick={() => {
            setSubmitSuccess(false);
            setFormData({
              customerName: '',
              mobile: '',
              email: '',
              address: '',
              city: '',
              state: '',
              zipCode: '',
              deviceCategory: '',
              brand: '',
              customBrand: '',
              modelNumber: '',
              serialNumber: '',
              deviceConfiguration: '',
              problemType: '',
              problemDescription: '',
              serviceType: 'Bring to Service Center',
              priority: 'Standard',
              preferredContactMethod: ['WhatsApp'],
            });
            setDeviceImage(null);
            setDeviceImagePreview(null);
            setErrorScreenshot(null);
            setErrorScreenshotPreview(null);
            setSubmitTicketId('');
          }}
          className="btn-neon cursor-pointer w-full py-3 font-bold"
        >
          Initialize New Request
        </button>
      </motion.div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <form id="repair-inquiry-form" onSubmit={handleSubmit} noValidate className="space-y-8">

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
                  maxLength={20}
                  id="customerName"
                  name="customerName"
                  value={formData.customerName}
                  onChange={handleInputChange}
                  placeholder="e.g. Vivek Kumar"
                  className={`w-full bg-zinc-950/60 border ${errors.customerName ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                />
              </div>
              {errors.customerName && <p className="text-red-400 text-xs mt-1 font-mono">{errors.customerName}</p>}
            </div>

            <div>
              <label htmlFor="mobile" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Mobile Number *</label>
              <div className="relative">
                <input
                  type="tel"
                  maxLength={10}
                  id="mobile"
                  name="mobile"
                  value={formData.mobile}
                  onChange={(e) => {
                    const onlyNums = e.target.value.replace(/[^0-9]/g, '');
                    handleInputChange({
                      target: { name: e.target.name, value: onlyNums }
                    } as any);
                  }}
                  placeholder="e.g. 9876543210"
                  className={`w-full bg-zinc-950/60 border ${errors.mobile ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                />
              </div>
              {errors.mobile && <p className="text-red-400 text-xs mt-1 font-mono">{errors.mobile}</p>}
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Email Address *</label>
              <div className="relative">
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="e.g. you@example.com"
                  className={`w-full bg-zinc-950/60 border ${errors.email ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                />
              </div>
              {errors.email && <p className="text-red-400 text-xs mt-1 font-mono">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="address" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Address</label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={100}
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  placeholder="Street / Landmark"
                  className={`w-full bg-zinc-950/60 border ${errors.address ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                />
              </div>
              {errors.address && <p className="text-red-400 text-xs mt-1 font-mono">{errors.address}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 md:col-span-2">
              <div>
                <label htmlFor="city" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">City *</label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={50}
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    placeholder="e.g. Bangalore"
                    className={`w-full bg-zinc-950/60 border ${errors.city ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                  />
                </div>
                {errors.city && <p className="text-red-400 text-xs mt-1 font-mono">{errors.city}</p>}
              </div>

              <div>
                <label htmlFor="state" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">State</label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={50}
                    id="state"
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                    placeholder="e.g. Karnataka"
                    className={`w-full bg-zinc-950/60 border ${errors.state ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                  />
                </div>
                {errors.state && <p className="text-red-400 text-xs mt-1 font-mono">{errors.state}</p>}
              </div>

              <div>
                <label htmlFor="zipCode" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Postal / ZIP</label>
                <div className="relative">
                  <input
                    type="text"
                    id="zipCode"
                    maxLength={20}
                    name="zipCode"
                    value={formData.zipCode}
                    onChange={(e) => {
                      const onlyNums = e.target.value.replace(/[^0-9]/g, '');
                      handleInputChange({
                        target: { name: e.target.name, value: onlyNums }
                      } as any);
                    }}
                    placeholder="e.g. 560001"
                    className={`w-full bg-zinc-950/60 border ${errors.zipCode ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                  />
                </div>
                {errors.zipCode && <p className="text-red-400 text-xs mt-1 font-mono">{errors.zipCode}</p>}
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
            <div>
              <h3 className="font-bold text-lg text-white font-outfit">02. Device Information</h3>
              <p className="text-xs text-zinc-500">Provide brand, category, and catalog models</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="deviceCategory" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Device Category *</label>
              <select
                id="deviceCategory"
                name="deviceCategory"
                value={formData.deviceCategory}
                onChange={handleInputChange}
                className={`w-full bg-black border ${errors.deviceCategory ? 'border-red-500/50' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-zinc-300 focus:outline-none transition-all appearance-none cursor-pointer`}
              >
                <option value="">-- Select Category --</option>
                {DEVICE_CATEGORIES.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              {errors.deviceCategory && <p className="text-red-400 text-xs mt-1 font-mono">{errors.deviceCategory}</p>}
            </div>

            <div>
              <label htmlFor="brand" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Brand Name *</label>
              <select
                id="brand"
                name="brand"
                value={formData.brand}
                onChange={handleInputChange}
                className={`w-full bg-black border ${errors.brand ? 'border-red-500/50' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-zinc-300 focus:outline-none transition-all appearance-none cursor-pointer`}
              >
                <option value="">-- Select Brand --</option>
                {BRANDS.map(brand => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
              {errors.brand && <p className="text-red-400 text-xs mt-1 font-mono">{errors.brand}</p>}
            </div>

            {formData.brand === 'Other' && (
              <div className="md:col-span-2">
                <label htmlFor="customBrand" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Custom Brand Name *</label>
                <input
                  type="text"
                  id="customBrand"
                  name="customBrand"
                  value={formData.customBrand}
                  onChange={handleInputChange}
                  placeholder="e.g. Acer or MSI"
                  className={`w-full bg-black border ${errors.customBrand ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                />
                {errors.customBrand && <p className="text-red-400 text-xs mt-1 font-mono">{errors.customBrand}</p>}
              </div>
            )}

            <div>
              <label htmlFor="modelNumber" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Model Number (Optional)</label>
              <input
                type="text"
                id="modelNumber"
                maxLength={50}
                name="modelNumber"
                value={formData.modelNumber}
                onChange={handleInputChange}
                placeholder="e.g. Latitude 5420"
                className={`w-full bg-black border ${errors.modelNumber ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
              />
              {errors.modelNumber && <p className="text-red-400 text-xs mt-1 font-mono">{errors.modelNumber}</p>}
            </div>

            <div>
              <label htmlFor="serialNumber" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Serial Number (Optional)</label>
              <input
                type="text"
                id="serialNumber"
                maxLength={50}
                name="serialNumber"
                value={formData.serialNumber}
                onChange={handleInputChange}
                placeholder="e.g. SN123456789"
                className={`w-full bg-black border ${errors.serialNumber ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
              />
              {errors.serialNumber && <p className="text-red-400 text-xs mt-1 font-mono">{errors.serialNumber}</p>}
            </div>

            <div className="md:col-span-2">
              <label htmlFor="deviceConfiguration" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Device Configuration (Optional)</label>
              <textarea
                id="deviceConfiguration"
                name="deviceConfiguration"
                maxLength={100}
                value={formData.deviceConfiguration}
                onChange={handleInputChange}
                rows={2}
                placeholder="e.g. Core i7, 16GB RAM, 512GB SSD, Windows 11"
                className={`w-full bg-black border ${errors.deviceConfiguration ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
              />
              {errors.deviceConfiguration && <p className="text-red-400 text-xs mt-1 font-mono">{errors.deviceConfiguration}</p>}
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
              {errors.problemType && <p className="text-red-400 text-xs mt-1 font-mono">{errors.problemType}</p>}
            </div>

            <div>
              <label htmlFor="problemDescription" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Detailed Problem Description * (20 - 500 chars)</label>
              <div className="relative">
                <textarea
                  id="problemDescription"
                  name="problemDescription"
                  value={formData.problemDescription}
                  onChange={handleInputChange}
                  maxLength={500}
                  rows={4}
                  placeholder="Please describe the symptoms, when it started happening, and what troubleshooting steps you've already attempted..."
                  className={`w-full bg-zinc-950/60 border ${errors.problemDescription ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                />
                <div className="absolute bottom-3 right-3 text-xs text-zinc-500 font-mono">
                  {formData.problemDescription.length} / 500
                </div>
              </div>
              {errors.problemDescription && <p className="text-red-400 text-xs mt-1 font-mono">{errors.problemDescription}</p>}
              <div className="flex justify-between items-center mt-1">
                {errors.problemDescription ? (
                  <p className="text-red-400 text-xs font-mono">{errors.problemDescription}</p>
                ) : (
                  <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Describe symptoms clearly</span>
                )}
                <span className={`text-[10px] font-mono ${formData.problemDescription.trim().length >= 20 ? 'text-emerald-400' : 'text-zinc-500'}`}>
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
                {['Home Visit', 'Pickup & Drop', 'Bring to Service Center'].map(type => (
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
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Priority Level</label>
              <div className="flex flex-col gap-2.5">
                {['Standard', 'Priority'].map(level => (
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
