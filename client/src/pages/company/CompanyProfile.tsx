import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCompanyContext } from '../../context/CompanyContext';
import { UserCircle, Shield, Globe, Award, MapPin, Phone, Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { companyApi } from '../../services/api';
import { getMediaUrl } from '@/utils/media';
import PhoneInput from '@/components/PhoneInput';
import { NAME_MAX_LENGTH, validateName } from '@/config/constants';
import { parsePhoneNumber, validatePhoneNumber, DEFAULT_COUNTRY } from '@/utils/phoneUtils';

interface CompanyProfileData {
    company_name: string;
    company_logo: string;
    contact_person: string;
    address: string;
    gst_number: string;
    website_url: string;
    phone?: string;
    email?: string;
}

export default function CompanyProfile() {
    const { token, user, updateToken } = useAuth();
    const { selectedCompanyId, isAdminManagingCompany, loadingCompanies, refreshCompanyProfile, refreshCompanies } = useCompanyContext();

    // Profile settings state
    const [profile, setProfile] = useState<CompanyProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [saving, setSaving] = useState(false);
    const [formErrors, setFormErrors] = useState<{
        companyName?: string;
        contactPerson?: string;
        phone?: string;
        gstNumber?: string;
        websiteUrl?: string;
        general?: string;
    }>({});

    // Form fields
    const [companyName, setCompanyName] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [gstNumber, setGstNumber] = useState('');
    const [websiteUrl, setWebsiteUrl] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!token) return;
            if (isAdminManagingCompany && !selectedCompanyId && !loadingCompanies) {
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const res = await companyApi.getProfile(token);
                const json = res.data;
                if (json?.success && json.data) {
                    setProfile(json.data);
                    setCompanyName(json.data.company_name || '');
                    setContactPerson(json.data.contact_person || '');
                    setPhone(json.data.phone || json.data.phone_number || '');
                    setAddress(json.data.address || '');
                    setGstNumber(json.data.gst_number || '');
                    setWebsiteUrl(json.data.website_url || '');
                    if (json.data.company_logo) {
                        setLogoPreview(getMediaUrl(json.data.company_logo));
                    } else {
                        setLogoPreview('');
                    }
                } else {
                    setError(json?.message || 'Failed to load company profile.');
                }
            } catch {
                setError('Failed to load company profile.');
            } finally {
                setLoading(false);
            }
        };
        if (isAdminManagingCompany && loadingCompanies) return;
        fetchProfile();
    }, [token, selectedCompanyId, loadingCompanies]);

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogoFile(file);
            setLogoPreview(URL.createObjectURL(file));
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        setError('');
        setSuccess('');
        const errors: { companyName?: string; contactPerson?: string; phone?: string; gstNumber?: string; websiteUrl?: string; general?: string } = {};

        const compVal = validateName(companyName, 'Company name');
        if (!compVal.isValid) {
            errors.companyName = compVal.error || 'Please enter a valid company name.';
        }

        if (contactPerson.trim()) {
            const personVal = validateName(contactPerson, 'Contact person');
            if (!personVal.isValid) {
                errors.contactPerson = personVal.error || 'Please enter a valid contact person.';
            }
        }

        if (phone.trim()) {
            const { country, nationalNumber } = parsePhoneNumber(phone.trim(), DEFAULT_COUNTRY);
            const val = validatePhoneNumber(nationalNumber, country);
            if (!val.isValid) {
                errors.phone = val.error || 'Please enter a valid phone number.';
            }
        }

        if (gstNumber.trim()) {
            const gstPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
            if (!gstPattern.test(gstNumber.trim().toUpperCase())) {
                errors.gstNumber = 'Please provide a valid 15-character GSTIN (e.g. 29ABCDE1234F1Z5).';
            }
        }

        if (websiteUrl.trim()) {
            try {
                new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
            } catch {
                errors.websiteUrl = 'Please enter a valid website URL.';
            }
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        setSaving(true);
        setFormErrors({});

        try {
            const formData = new FormData();
            formData.append('companyName', companyName.trim());
            formData.append('contactPerson', contactPerson.trim());
            formData.append('phone', phone.trim());
            formData.append('address', address.trim());
            formData.append('gstNumber', gstNumber.trim().toUpperCase());
            formData.append('websiteUrl', websiteUrl.trim());
            if (logoFile) {
                formData.append('companyLogo', logoFile);
            }

            const res = await companyApi.updateProfile(token, formData);
            const json = res.data;

            if (json?.success) {
                setSuccess('Company profile saved successfully!');
                const updatedData = json.data || {};
                const newLogo = updatedData.company_logo || (logoFile ? logoPreview : profile?.company_logo);
                if (newLogo) {
                    setLogoPreview(getMediaUrl(newLogo));
                }
                setProfile(prev => prev ? { ...prev, ...updatedData, company_logo: newLogo, phone: phone.trim() } : updatedData);

                // Update AuthContext user details so layout and header immediately reflect the updated profile
                if (user && !isAdminManagingCompany) {
                    updateToken(token, {
                        ...user,
                        name: companyName.trim(),
                        avatar_url: newLogo || undefined
                    });
                }
                // Refresh CompanyContext so all pages have the latest profile
                await refreshCompanyProfile();
                await refreshCompanies();
            } else {
                const serverErrors = (res.data as any)?.errors || {};
                setFormErrors({
                    companyName: serverErrors.companyName,
                    contactPerson: serverErrors.contactPerson,
                    phone: serverErrors.phone,
                    gstNumber: serverErrors.gstNumber,
                    websiteUrl: serverErrors.websiteUrl,
                    general: json?.message || 'Failed to save profile.'
                });
                setError(json?.message || 'Failed to save profile.');
            }
        } catch {
            setFormErrors({ general: 'An error occurred while saving the profile.' });
            setError('An error occurred while saving the profile.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin text-indigo-500" size={32} />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fadeIn max-w-4xl">
            {/* Title */}
            <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Company Profile</h1>
                <p className="text-zinc-500 text-sm mt-1">Configure business identifiers, primary contacts, and branding images.</p>
            </div>

            {success && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-sm font-medium animate-fadeIn flex items-center gap-2">
                    <CheckCircle2 size={16} className="shrink-0" />
                    <span>{success}</span>
                </div>
            )}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm font-medium animate-fadeIn flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-8">

                {/* Left branding card */}
                <div className="bg-[#0c0c0c] border border-zinc-900/60 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-6">
                    <div className="space-y-2">
                        <h3 className="text-sm font-mono text-zinc-500 uppercase tracking-wider">Company Profile Photo</h3>
                        <p className="text-[11px] text-zinc-600">Company avatar and brand identity for corporate profile and dispatch tags.</p>
                    </div>

                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="w-32 h-32 rounded-2xl bg-zinc-950 border border-zinc-900 hover:border-indigo-500/50 flex items-center justify-center overflow-hidden cursor-pointer relative group transition-all"
                    >
                        {logoPreview ? (
                            <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" />
                        ) : (
                            <UserCircle size={48} className="text-zinc-800" />
                        )}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold">
                            <Upload size={16} className="mr-1.5" /> Change
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept="image/*"
                            className="hidden"
                            onChange={handleLogoChange}
                        />
                    </div>

                    <div className="space-y-1">
                        <div className="font-bold text-white text-lg">{companyName || 'Registered Corp'}</div>
                        <div className="text-xs text-zinc-500 font-mono select-all">{user?.email}</div>
                    </div>

                    <div className="w-full pt-4 border-t border-zinc-900/40 text-[10px] text-zinc-600 flex items-center gap-2 justify-center leading-normal">
                        <Shield size={14} className="text-indigo-400/80 shrink-0" />
                        <span>Secured B2B organization portal account</span>
                    </div>
                </div>

                {/* Right Form Fields */}
                <div className="md:col-span-2 bg-[#0c0c0c] border border-zinc-900/60 rounded-2xl p-6 space-y-6">
                    <h2 className="text-lg font-bold text-white border-b border-zinc-900/40 pb-3">Corporate Identifiers</h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Company Name *</label>
                            <input
                                type="text"
                                maxLength={NAME_MAX_LENGTH}
                                placeholder="Enterprise Legal Name"
                                value={companyName}
                                onChange={e => {
                                    setCompanyName(e.target.value);
                                    if (formErrors.companyName) setFormErrors(prev => ({ ...prev, companyName: undefined }));
                                }}
                                className={`w-full bg-[#050505] border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors ${
                                    formErrors.companyName ? 'border-red-500/80 focus:border-red-500' : 'border-zinc-900 focus:border-indigo-500/50'
                                }`}
                            />
                            {formErrors.companyName && (
                                <p className="text-[11px] text-red-400 font-medium flex items-center gap-1 mt-1">
                                    <AlertCircle size={11} className="shrink-0" />
                                    <span>{formErrors.companyName}</span>
                                </p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider flex items-center gap-1">
                                <Award size={12} className="text-indigo-400" />
                                <span>GSTIN / Tax Reference</span>
                            </label>
                            <input
                                type="text"
                                placeholder="GSTIN Code (Taxation)"
                                value={gstNumber}
                                onChange={e => {
                                    setGstNumber(e.target.value);
                                    if (formErrors.gstNumber) setFormErrors(prev => ({ ...prev, gstNumber: undefined }));
                                }}
                                className={`w-full bg-[#050505] border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors font-mono ${
                                    formErrors.gstNumber ? 'border-red-500/80 focus:border-red-500' : 'border-zinc-900 focus:border-indigo-500/50'
                                }`}
                            />
                            {formErrors.gstNumber && (
                                <p className="text-[11px] text-red-400 font-medium flex items-center gap-1 mt-1">
                                    <AlertCircle size={11} className="shrink-0" />
                                    <span>{formErrors.gstNumber}</span>
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider font-semibold">Contact Liaison Person</label>
                            <input
                                type="text"
                                maxLength={NAME_MAX_LENGTH}
                                placeholder="Direct account manager"
                                value={contactPerson}
                                onChange={e => {
                                    setContactPerson(e.target.value);
                                    if (formErrors.contactPerson) setFormErrors(prev => ({ ...prev, contactPerson: undefined }));
                                }}
                                className={`w-full bg-[#050505] border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors ${
                                    formErrors.contactPerson ? 'border-red-500/80 focus:border-red-500' : 'border-zinc-900 focus:border-indigo-500/50'
                                }`}
                            />
                            {formErrors.contactPerson && (
                                <p className="text-[11px] text-red-400 font-medium flex items-center gap-1 mt-1">
                                    <AlertCircle size={11} className="shrink-0" />
                                    <span>{formErrors.contactPerson}</span>
                                </p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <PhoneInput
                                size="sm"
                                label="Official Phone Number"
                                value={phone}
                                onChange={val => {
                                    setPhone(val);
                                    if (formErrors.phone) setFormErrors(prev => ({ ...prev, phone: undefined }));
                                }}
                            />
                            {formErrors.phone && (
                                <p className="text-[11px] text-red-400 font-medium flex items-center gap-1 mt-1">
                                    <AlertCircle size={11} className="shrink-0" />
                                    <span>{formErrors.phone}</span>
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider font-semibold flex items-center gap-1">
                            <Globe size={12} className="text-indigo-400" />
                            <span>Website Domain URL</span>
                        </label>
                        <input
                            type="text"
                            placeholder="https://example.com"
                            value={websiteUrl}
                            onChange={e => {
                                setWebsiteUrl(e.target.value);
                                if (formErrors.websiteUrl) setFormErrors(prev => ({ ...prev, websiteUrl: undefined }));
                            }}
                            className={`w-full bg-[#050505] border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors ${
                                formErrors.websiteUrl ? 'border-red-500/80 focus:border-red-500' : 'border-zinc-900 focus:border-indigo-500/50'
                            }`}
                        />
                        {formErrors.websiteUrl && (
                            <p className="text-[11px] text-red-400 font-medium flex items-center gap-1 mt-1">
                                <AlertCircle size={11} className="shrink-0" />
                                <span>{formErrors.websiteUrl}</span>
                            </p>
                        )}
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider font-semibold flex items-center gap-1">
                            <MapPin size={12} className="text-indigo-400" />
                            <span>Headquarters Address</span>
                        </label>
                        <textarea
                            rows={4}
                            placeholder="Registered business address..."
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                            className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors resize-none"
                        />
                    </div>

                    <div className="pt-4 border-t border-zinc-900/60 flex justify-end gap-3">
                        <button
                            type="submit"
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer flex items-center gap-2"
                            disabled={saving}
                        >
                            {saving ? (
                                <>
                                    <Loader2 size={15} className="animate-spin" />
                                    <span>Saving...</span>
                                </>
                            ) : (
                                <span>Update Profile</span>
                            )}
                        </button>
                    </div>
                </div>

            </form>
        </div>
    );
}
