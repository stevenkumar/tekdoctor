import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserCircle, Shield, Globe, Award, MapPin, Phone, Upload, CheckCircle2, AlertCircle } from 'lucide-react';

interface CompanyProfileData {
    company_name: string;
    company_logo: string;
    contact_person: string;
    address: string;
    gst_number: string;
    website_url: string;
}

export default function CompanyProfile() {
    const { token, user } = useAuth();

    // Profile settings state
    const [profile, setProfile] = useState<CompanyProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [saving, setSaving] = useState(false);

    // Form fields
    const [companyName, setCompanyName] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [address, setAddress] = useState('');
    const [gstNumber, setGstNumber] = useState('');
    const [websiteUrl, setWebsiteUrl] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await fetch('http://localhost:5000/api/company/profile', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const json = await res.json();
                if (json.success && json.data) {
                    setProfile(json.data);
                    setCompanyName(json.data.company_name);
                    setContactPerson(json.data.contact_person || '');
                    setAddress(json.data.address || '');
                    setGstNumber(json.data.gst_number || '');
                    setWebsiteUrl(json.data.website_url || '');
                    if (json.data.company_logo) {
                        setLogoPreview(
                            json.data.company_logo.startsWith('http')
                                ? json.data.company_logo
                                : `http://localhost:5000${json.data.company_logo}`
                        );
                    }
                } else {
                    setError(json.message);
                }
            } catch {
                setError('Failed to load company profile.');
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [token]);

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogoFile(file);
            setLogoPreview(URL.createObjectURL(file));
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setSaving(true);

        if (!companyName) {
            setError('Company name is required.');
            setSaving(false);
            return;
        }

        try {
            const formData = new FormData();
            formData.append('companyName', companyName);
            formData.append('contactPerson', contactPerson);
            formData.append('address', address);
            formData.append('gstNumber', gstNumber);
            formData.append('websiteUrl', websiteUrl);
            if (logoFile) {
                formData.append('companyLogo', logoFile);
            }

            const res = await fetch('http://localhost:5000/api/company/profile', {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: formData
            });
            const json = await res.json();

            if (json.success) {
                setSuccess('Company profile saved successfully!');
                if (json.data && json.data.company_logo) {
                    setLogoPreview(
                        json.data.company_logo.startsWith('http')
                            ? json.data.company_logo
                            : `http://localhost:5000${json.data.company_logo}`
                    );
                }
            } else {
                setError(json.message);
            }
        } catch {
            setError('An error occurred while saving the profile.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
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
                        <h3 className="text-sm font-mono text-zinc-500 uppercase tracking-wider">Company Logo</h3>
                        <p className="text-[11px] text-zinc-600">Represent brand identification internally and on dispatch tags.</p>
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

                    <div className="w-full pt-4 border-t border-zinc-900/40 text-[10px] text-zinc-650 flex items-center gap-2 justify-center leading-normal">
                        <Shield size={14} className="text-indigo-400/80 shrink-0" />
                        <span>Secured B2B organization portal accounts</span>
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
                                placeholder="Enterprise Legal Name"
                                value={companyName}
                                onChange={e => setCompanyName(e.target.value)}
                                className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                            />
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
                                onChange={e => setGstNumber(e.target.value)}
                                className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors font-mono"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Contact Liaison Person</label>
                            <input
                                type="text"
                                placeholder="Direct account manager"
                                value={contactPerson}
                                onChange={e => setContactPerson(e.target.value)}
                                className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold flex items-center gap-1">
                                <Globe size={12} className="text-indigo-400" />
                                <span>Website Domain URL</span>
                            </label>
                            <input
                                type="text"
                                placeholder="https://example.com"
                                value={websiteUrl}
                                onChange={e => setWebsiteUrl(e.target.value)}
                                className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold flex items-center gap-1">
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
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                            disabled={saving}
                        >
                            {saving ? 'Saving...' : 'Update Profile'}
                        </button>
                    </div>
                </div>

            </form>
        </div>
    );
}
