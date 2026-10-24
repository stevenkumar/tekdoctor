import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { adminApi } from '@/services/api';
import {
    Settings,
    Loader2,
    Save,
    CheckCircle2,
    Link as LinkIcon,
    Image as ImageIcon,
    Shield,
    ShieldAlert,
    Key,
    Eye,
    EyeOff,
    AlertTriangle,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSiteContext } from '@/context/SiteContext';
import { getMediaUrl, isUploadPath } from '@/utils/media';
import { SkeletonDashboard } from '@/components/Skeleton';

// ─── Schema for text/select settings (branding media handled separately) ───
const DEFAULT_SETTINGS = {
    company: { company_name: '', company_phone: '', company_alternate_phone: '', company_email: '', company_address: '', gstin: '' },
    billing: { invoice_prefix: 'inv', default_gst_rate: '18.00', invoice_gst_enabled: 'true' },
    theme: { theme_primary_color: '#00f2ff', theme_secondary_color: '#1a1a1a' },
    social: { facebook_url: '', twitter_url: '', instagram_url: '', linkedin_url: '' },
    integrations: { google_maps_link: '', google_sheet_url: '', google_login_enabled: 'false', google_client_id: '', google_client_secret: '' },
    security: { recaptcha_enabled: 'false', recaptcha_site_key: '', recaptcha_secret_key: '', recaptcha_api_key: '', recaptcha_project_id: '', recaptcha_score_threshold: '0.5' },
    system: { maintenance_mode: 'false' },
    seo: { meta_title: '', meta_description: '', meta_keywords: '' }
};

// Keys handled inside custom dedicated sections instead of generic loop
const DEDICATED_INTEGRATION_KEYS = new Set(['google_login_enabled', 'google_client_id', 'google_client_secret']);
const DEDICATED_GROUPS = new Set(['security']);

export default function WebsiteSettings() {
    const { token } = useAuth();
    const [settings, setSettings] = useState<Record<string, Record<string, string>>>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [editedValues, setEditedValues] = useState<Record<string, string>>({});
    const { refreshSiteData } = useSiteContext();

    // ─── Branding state (logo + favicon + tekunik logo) ───
    const [logoUrl, setLogoUrl] = useState('');
    const [faviconUrl, setFaviconUrl] = useState('');
    const [tekunikLogoUrl, setTekunikLogoUrl] = useState('');
    const [logoMode, setLogoMode] = useState<'upload' | 'url'>('upload');
    const [faviconMode, setFaviconMode] = useState<'upload' | 'url'>('upload');
    const [tekunikLogoMode, setTekunikLogoMode] = useState<'upload' | 'url'>('upload');
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingFavicon, setUploadingFavicon] = useState(false);
    const [uploadingTekunikLogo, setUploadingTekunikLogo] = useState(false);
    const [logoInputUrl, setLogoInputUrl] = useState('');
    const [faviconInputUrl, setFaviconInputUrl] = useState('');
    const [tekunikLogoInputUrl, setTekunikLogoInputUrl] = useState('');

    // ─── Security & OAuth Visibility and Warning States ───
    const [showGoogleSecret, setShowGoogleSecret] = useState(false);
    const [showRecaptchaSecret, setShowRecaptchaSecret] = useState(false);
    const [showEnterpriseApiKey, setShowRecaptchaApiKey] = useState(false);
    const [showEnterpriseSection, setShowEnterpriseSection] = useState(false);
    const [showRecaptchaWarningModal, setShowRecaptchaWarningModal] = useState(false);

    const fetchSettings = async (showLoading = true) => {
        if (!token) return;
        if (showLoading) setLoading(true);
        try {
            const res = await adminApi.getSettings(token);
            if (res.ok && res.data) {
                const data = (res.data as any).data || {};

                // Merge DB settings into DEFAULT_SETTINGS
                const mergedSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                Object.keys(data).forEach(group => {
                    if (mergedSettings[group]) {
                        Object.keys(data[group]).forEach(key => {
                            mergedSettings[group][key] = data[group][key];
                        });
                    }
                });

                setSettings(mergedSettings);
                const flat: Record<string, string> = {};
                Object.entries(mergedSettings).forEach(([, keys]: any) => {
                    Object.entries(keys).forEach(([k, v]: any) => { flat[k] = v; });
                });
                setEditedValues(flat);

                // Load branding values separately
                const storedLogo = data?.company?.logo_url || data?.branding?.logo_url || '';
                const storedFavicon = data?.branding?.favicon_url || '';
                const storedTekunikLogo = data?.branding?.tekunik_image_url || '';
                setLogoUrl(storedLogo);
                setFaviconUrl(storedFavicon);
                setTekunikLogoUrl(storedTekunikLogo);
                setLogoInputUrl(storedLogo);
                setFaviconInputUrl(storedFavicon);
                setTekunikLogoInputUrl(storedTekunikLogo);
                setLogoMode(isUploadPath(storedLogo) ? 'upload' : (storedLogo ? 'url' : 'upload'));
                setFaviconMode(isUploadPath(storedFavicon) ? 'upload' : (storedFavicon ? 'url' : 'upload'));
                setTekunikLogoMode(isUploadPath(storedTekunikLogo) ? 'upload' : (storedTekunikLogo ? 'url' : 'upload'));
            }
        } catch (error) {
            console.error('Error fetching website settings:', error);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings(true);
    }, [token]);

    // ─── Save all settings ───
    const handleSave = async () => {
        if (!token) return;
        setSaving(true); setSaveMsg('');

        // Exclude logo_url, favicon_url, and tekunik_image_url from the general save
        const { logo_url: _logo, favicon_url: _favicon, tekunik_image_url: _tekunik, ...settingsToSave } = editedValues;

        // Auto-trim strings
        Object.keys(settingsToSave).forEach(k => {
            if (typeof settingsToSave[k] === 'string') {
                settingsToSave[k] = settingsToSave[k].trim();
            }
        });

        // Validate alternate contact number if entered
        const altPhone = settingsToSave.company_alternate_phone;
        if (altPhone) {
            const cleanDigits = altPhone.replace(/[\s\-()]/g, '').replace(/^(\+91|91|0)/, '');
            if (!/^[6-9]\d{9}$/.test(cleanDigits) && !/^\d{10}$/.test(cleanDigits)) {
                toast.error('Alternate contact number must be a valid 10-digit phone number.');
                setSaving(false);
                return;
            }
        }

        // Validate reCAPTCHA score threshold
        if (settingsToSave.recaptcha_score_threshold !== undefined && settingsToSave.recaptcha_score_threshold !== '') {
            const score = parseFloat(settingsToSave.recaptcha_score_threshold);
            if (isNaN(score) || score < 0 || score > 1) {
                toast.error('reCAPTCHA score threshold must be a number between 0.0 and 1.0.');
                setSaving(false);
                return;
            }
        }

        // Validate Google Login enabling
        if (settingsToSave.google_login_enabled === 'true') {
            const clientId = settingsToSave.google_client_id;
            if (!clientId || clientId.trim() === '') {
                toast.error('Google Client ID is required before enabling Google Sign-In.');
                setSaving(false);
                return;
            }
        }

        // Validate reCAPTCHA enabling
        if (settingsToSave.recaptcha_enabled === 'true') {
            const siteKey = settingsToSave.recaptcha_site_key;
            if (!siteKey || siteKey.trim() === '') {
                toast.error('reCAPTCHA Site Key is required before enabling reCAPTCHA.');
                setSaving(false);
                return;
            }
        }

        const res = await adminApi.updateSettings(token, settingsToSave);
        if (res.ok) {
            setSaveMsg('Settings saved successfully!');
            toast.success('Website settings updated successfully!');
            await fetchSettings(false);
            await refreshSiteData();
            setTimeout(() => setSaveMsg(''), 3000);
        } else {
            const errorMsg = (res.data as any)?.message || res.error || 'Failed to save settings.';
            toast.error(errorMsg);
        }
        setSaving(false);
    };

    // ─── Upload a branding image file and immediately persist ───
    const handleBrandingUpload = async (type: 'logo_url' | 'favicon_url' | 'tekunik_image_url', file: File) => {
        if (!token) return;
        if (type === 'logo_url') setUploadingLogo(true);
        else if (type === 'favicon_url') setUploadingFavicon(true);
        else setUploadingTekunikLogo(true);

        try {
            const uploadRes = await adminApi.uploadFile(token, file);
            const resultData = (uploadRes.data as any);
            const url: string | undefined = resultData?.data?.url;

            if (uploadRes.ok && url) {
                const saveRes = await adminApi.updateSettings(token, { [type]: url });
                if (saveRes.ok) {
                    if (type === 'logo_url') { setLogoUrl(url); setLogoInputUrl(url); }
                    else if (type === 'favicon_url') { setFaviconUrl(url); setFaviconInputUrl(url); }
                    else { setTekunikLogoUrl(url); setTekunikLogoInputUrl(url); }
                    const labelName = type === 'logo_url' ? 'Logo' : (type === 'favicon_url' ? 'Favicon' : 'Tekunik Logo');
                    toast.success(`${labelName} updated successfully!`);
                    await refreshSiteData();
                } else {
                    toast.error('File uploaded but save failed. Please try again.');
                }
            } else {
                toast.error('Upload failed — server returned no URL.');
            }
        } catch (error) {
            console.error('Upload Error', error);
            toast.error('File upload error.');
        } finally {
            if (type === 'logo_url') setUploadingLogo(false);
            else if (type === 'favicon_url') setUploadingFavicon(false);
            else setUploadingTekunikLogo(false);
        }
    };

    // ─── Save a branding URL ───
    const handleBrandingUrlSave = async (type: 'logo_url' | 'favicon_url' | 'tekunik_image_url', url: string) => {
        if (!token || !url.trim()) return;
        const saveRes = await adminApi.updateSettings(token, { [type]: url.trim() });
        if (saveRes.ok) {
            if (type === 'logo_url') setLogoUrl(url.trim());
            else if (type === 'favicon_url') setFaviconUrl(url.trim());
            else setTekunikLogoUrl(url.trim());
            const labelName = type === 'logo_url' ? 'Logo' : (type === 'favicon_url' ? 'Favicon' : 'Tekunik Logo');
            toast.success(`${labelName} URL saved!`);
            await refreshSiteData();
        } else {
            toast.error('Failed to save URL.');
        }
    };

    // ─── Handle reCAPTCHA toggle with confirmation dialog ───
    const handleRecaptchaToggle = (newVal: string) => {
        if (newVal === 'false' && (editedValues.recaptcha_enabled === 'true' || editedValues.recaptcha_enabled === undefined)) {
            // Prompt confirmation modal before disabling
            setShowRecaptchaWarningModal(true);
        } else {
            setEditedValues(prev => ({ ...prev, recaptcha_enabled: newVal }));
        }
    };

    const confirmDisableRecaptcha = () => {
        setEditedValues(prev => ({ ...prev, recaptcha_enabled: 'false' }));
        setShowRecaptchaWarningModal(false);
        toast.error('reCAPTCHA marked to be disabled. Click "Save All Settings" to apply changes.', { duration: 4000 });
    };

    const groupLabels: Record<string, string> = {
        company: '🏢 Company Information',
        billing: '🧾 Billing & Invoicing Configuration',
        theme: '🎨 Theme Colors',
        social: '🌐 Social Media Links',
        integrations: '🔌 General Integrations',
        system: '⚙️ System',
        seo: '🔍 SEO Settings',
    };

    const fieldLabels: Record<string, string> = {
        company_name: 'Company Name', company_phone: 'Primary Contact Number', company_alternate_phone: 'Alternate Contact Number', company_email: 'Contact Email', company_address: 'Address', gstin: 'Business GSTIN',
        invoice_prefix: 'Invoice Number Prefix (e.g. inv, TD-INV)',
        default_gst_rate: 'Default GST Rate (%)',
        invoice_gst_enabled: 'Enable GST on Invoices',
        theme_primary_color: 'Primary Theme Color', theme_secondary_color: 'Secondary Theme Color',
        facebook_url: 'Facebook', twitter_url: 'Twitter', instagram_url: 'Instagram', linkedin_url: 'LinkedIn',
        google_maps_link: 'Google Maps Link', google_sheet_url: 'Google Sheet URL',
        maintenance_mode: 'Maintenance Mode',
        meta_title: 'Meta Title', meta_description: 'Meta Description', meta_keywords: 'Meta Keywords',
    };

    if (loading) return <SkeletonDashboard />;

    // ─── Branding Media Card Component ───
    const BrandingCard = ({
        label, type, currentUrl, mode, uploading,
        inputUrl, onInputUrlChange,
        onModeChange, onUpload, onUrlSave
    }: {
        label: string;
        type: 'logo_url' | 'favicon_url' | 'tekunik_image_url';
        currentUrl: string;
        mode: 'upload' | 'url';
        uploading: boolean;
        inputUrl: string;
        onInputUrlChange: (v: string) => void;
        onModeChange: (m: 'upload' | 'url') => void;
        onUpload: (file: File) => void;
        onUrlSave: (url: string) => void;
    }) => (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">{label}</label>
                <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
                    <button onClick={() => onModeChange('upload')}
                        className={`px-2 py-1 text-[10px] rounded-md font-medium transition-all ${mode === 'upload' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>
                        Upload
                    </button>
                    <button onClick={() => onModeChange('url')}
                        className={`px-2 py-1 text-[10px] rounded-md font-medium transition-all ${mode === 'url' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>
                        URL
                    </button>
                </div>
            </div>

            {mode === 'upload' ? (
                <div className="flex items-center gap-4 p-4 border border-dashed border-zinc-800 rounded-xl bg-zinc-950 hover:border-neon-cyan/50 transition-colors">
                    <div className="bg-zinc-900 p-3 rounded-full text-zinc-400 border border-zinc-800 shadow-inner">
                        {uploading ? <Loader2 className="animate-spin text-neon-cyan" size={20} /> : <ImageIcon size={20} />}
                    </div>
                    <div className="flex-1">
                        <div className="text-sm font-medium text-white mb-1">Upload {label}</div>
                        <input
                            type="file" accept="image/*" disabled={uploading}
                            onChange={e => { if (e.target.files?.[0]) onUpload(e.target.files[0]); }}
                            className="text-xs text-zinc-500 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-semibold file:bg-neon-cyan/10 file:text-neon-cyan hover:file:bg-neon-cyan/20 cursor-pointer"
                        />
                        <p className="text-[10px] text-zinc-600 mt-1">Saved instantly — no need to click "Save All"</p>
                    </div>
                    {currentUrl && (
                        <img src={getMediaUrl(currentUrl)} alt="Preview" className="w-14 h-14 object-contain bg-black/20 rounded-lg p-1 border border-zinc-800" onError={e => (e.currentTarget.style.display = 'none')} />
                    )}
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <span className="p-2 border border-zinc-800 rounded-xl bg-zinc-900 text-zinc-500"><LinkIcon size={16} /></span>
                    <input type="text" value={inputUrl} onChange={e => onInputUrlChange(e.target.value)}
                        placeholder="https://example.com/logo.png"
                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan" />
                    <button onClick={() => onUrlSave(inputUrl)}
                        className="px-3 py-2.5 bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan rounded-xl text-xs font-semibold hover:bg-neon-cyan/20 transition-all">
                        Save
                    </button>
                </div>
            )}

            {currentUrl && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>Current:</span>
                    <img src={getMediaUrl(currentUrl)} alt={label} className="h-6 w-auto object-contain bg-white rounded p-0.5 max-w-[100px]" onError={e => (e.currentTarget.style.display = 'none')} />
                    <span className="font-mono text-zinc-600 truncate max-w-[200px]">{currentUrl}</span>
                </div>
            )}
        </div>
    );

    const isGoogleActive = editedValues.google_login_enabled === 'true';
    const isRecaptchaActive = editedValues.recaptcha_enabled === 'true';
    const scoreVal = parseFloat(editedValues.recaptcha_score_threshold || '0.5');

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight flex items-center gap-2">
                        <Settings size={24} className="text-neon-cyan" />Website Settings
                    </h1>
                    <p className="text-xs text-zinc-500 mt-1">Configure authentication, bot protection, branding, and site-wide integrations</p>
                </div>
                <button
                    id="save-settings-btn"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-neon-cyan hover:bg-neon-cyan text-black font-bold rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-neon-cyan/20 w-full sm:w-auto"
                >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save All Settings
                </button>
            </div>

            {saveMsg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
                    <CheckCircle2 size={14} />{saveMsg}
                </div>
            )}

            {/* ── 1. Google Login / OAuth 2.0 Dedicated Card ── */}
            <div className="border border-zinc-900 bg-zinc-900/20 rounded-2xl overflow-hidden hover:border-zinc-800 transition-colors">
                <div className="p-5 border-b border-zinc-900 bg-zinc-950/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                            <Key size={18} />
                        </span>
                        <div>
                            <div className="text-white font-bold font-outfit text-sm flex items-center gap-2">
                                Google Login / OAuth 2.0
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${isGoogleActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                                    {isGoogleActive ? '● Active' : '○ Disabled'}
                                </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-0.5">Control Google Sign-In availability and manage OAuth credentials</p>
                        </div>
                    </div>
                </div>

                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Toggle */}
                    <div className="space-y-2 col-span-1 md:col-span-2">
                        <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Google Login Status</label>
                        <select
                            id="google_login_enabled"
                            value={editedValues.google_login_enabled || 'false'}
                            onChange={e => setEditedValues(p => ({ ...p, google_login_enabled: e.target.value }))}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan"
                        >
                            <option value="true">Enabled — Google Sign-In button displayed and OAuth accepted</option>
                            <option value="false">Disabled — Google Sign-In hidden on public forms; API returns 403 Forbidden</option>
                        </select>
                        <p className="text-[11px] text-zinc-500">When disabled, public Login and Signup buttons are removed, and the backend returns HTTP 403.</p>
                    </div>

                    {/* Google Client ID */}
                    <div className="space-y-2">
                        <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Google Client ID</label>
                        <input
                            id="google_client_id"
                            type="text"
                            value={editedValues.google_client_id || ''}
                            onChange={e => setEditedValues(p => ({ ...p, google_client_id: e.target.value }))}
                            placeholder="e.g. 123456789-xxxxxx.apps.googleusercontent.com"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan font-mono text-xs"
                        />
                        <p className="text-[10px] text-zinc-500">Public-safe OAuth identifier used by the browser to initiate Google Sign-In.</p>
                    </div>

                    {/* Google Client Secret */}
                    <div className="space-y-2">
                        <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Google Client Secret</label>
                        <div className="relative">
                            <input
                                id="google_client_secret"
                                type={showGoogleSecret ? 'text' : 'password'}
                                value={editedValues.google_client_secret !== undefined ? editedValues.google_client_secret : ''}
                                onChange={e => setEditedValues(p => ({ ...p, google_client_secret: e.target.value }))}
                                placeholder="••••••••"
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-neon-cyan font-mono text-xs"
                            />
                            <button
                                type="button"
                                onClick={() => setShowGoogleSecret(p => !p)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                                aria-label="Toggle Secret Visibility"
                            >
                                {showGoogleSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        <p className="text-[10px] text-zinc-500">Encrypted at rest with AES-256-GCM. Never exposed publicly. Leave masked to keep current secret.</p>
                    </div>
                </div>
            </div>

            {/* ── 2. reCAPTCHA Security Dedicated Card ── */}
            <div className="border border-zinc-900 bg-zinc-900/20 rounded-2xl overflow-hidden hover:border-zinc-800 transition-colors">
                <div className="p-5 border-b border-zinc-900 bg-zinc-950/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className={`p-2 rounded-xl border ${isRecaptchaActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                            {isRecaptchaActive ? <Shield size={18} /> : <ShieldAlert size={18} />}
                        </span>
                        <div>
                            <div className="text-white font-bold font-outfit text-sm flex items-center gap-2">
                                Google reCAPTCHA Security
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${isRecaptchaActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                                    {isRecaptchaActive ? '● Protected' : '○ Disabled'}
                                </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-0.5">Automated bot and brute-force protection across Login, Signup, Password Reset, Repairs & Contact forms</p>
                        </div>
                    </div>
                </div>

                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Toggle */}
                    <div className="space-y-2 col-span-1 md:col-span-2">
                        <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">reCAPTCHA Verification Status</label>
                        <select
                            id="recaptcha_enabled"
                            value={editedValues.recaptcha_enabled || 'false'}
                            onChange={e => handleRecaptchaToggle(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan"
                        >
                            <option value="true">Enabled — Full bot assessment active on all 6 protected customer workflows</option>
                            <option value="false">Disabled — Bot verification bypassed across all forms (requires confirmation)</option>
                        </select>
                        {!isRecaptchaActive && (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs flex items-center gap-2 mt-2">
                                <AlertTriangle size={14} className="shrink-0" />
                                <span>Security verification is disabled. Customer forms are unprotected from automated spam and abuse.</span>
                            </div>
                        )}
                    </div>

                    {/* Site Key */}
                    <div className="space-y-2">
                        <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">reCAPTCHA Site Key</label>
                        <input
                            id="recaptcha_site_key"
                            type="text"
                            value={editedValues.recaptcha_site_key || ''}
                            onChange={e => setEditedValues(p => ({ ...p, recaptcha_site_key: e.target.value }))}
                            placeholder="e.g. 6Lxxxxxx"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan font-mono text-xs"
                        />
                        <p className="text-[10px] text-zinc-500">Public-safe key delivered to the browser for script injection and badge initialization.</p>
                    </div>

                    {/* Secret Key (v3 Fallback) */}
                    <div className="space-y-2">
                        <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">reCAPTCHA Secret Key (Standard v3 Fallback)</label>
                        <div className="relative">
                            <input
                                id="recaptcha_secret_key"
                                type={showRecaptchaSecret ? 'text' : 'password'}
                                value={editedValues.recaptcha_secret_key !== undefined ? editedValues.recaptcha_secret_key : ''}
                                onChange={e => setEditedValues(p => ({ ...p, recaptcha_secret_key: e.target.value }))}
                                placeholder="••••••••"
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-neon-cyan font-mono text-xs"
                            />
                            <button
                                type="button"
                                onClick={() => setShowRecaptchaSecret(p => !p)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                                aria-label="Toggle Secret Key Visibility"
                            >
                                {showRecaptchaSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        <p className="text-[10px] text-zinc-500">Encrypted at rest with AES-256-GCM. Used for backend fallback assessment.</p>
                    </div>

                    {/* Score Threshold Control */}
                    <div className="space-y-2 col-span-1 md:col-span-2 bg-zinc-950/60 border border-zinc-900 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-zinc-300 font-semibold tracking-wide uppercase flex items-center gap-2">
                                Risk Score Threshold
                                <span className="font-mono text-neon-cyan text-xs">({scoreVal.toFixed(2)})</span>
                            </label>
                            <span className="text-[11px] font-mono text-zinc-400">
                                {scoreVal <= 0.3 ? '⚠️ Permissive (Higher Risk)' : scoreVal >= 0.7 ? '🛡️ Strict (May block users)' : '✅ 0.50 (Recommended)'}
                            </span>
                        </div>
                        <div className="flex items-center gap-4 pt-1">
                            <input
                                id="recaptcha_score_threshold_slider"
                                type="range"
                                min="0.0"
                                max="1.0"
                                step="0.05"
                                value={scoreVal}
                                onChange={e => setEditedValues(p => ({ ...p, recaptcha_score_threshold: e.target.value }))}
                                className="flex-1 accent-neon-cyan cursor-pointer"
                            />
                            <input
                                id="recaptcha_score_threshold"
                                type="number"
                                min="0"
                                max="1"
                                step="0.05"
                                value={editedValues.recaptcha_score_threshold || '0.5'}
                                onChange={e => setEditedValues(p => ({ ...p, recaptcha_score_threshold: e.target.value }))}
                                className="w-20 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-center font-mono text-xs text-white focus:outline-none focus:border-neon-cyan"
                            />
                        </div>
                        <p className="text-[10px] text-zinc-500">
                            Requests with scores below this threshold are blocked as suspicious bots. Google reCAPTCHA v3 scores range from 0.0 (likely bot) to 1.0 (good interaction).
                        </p>
                    </div>

                    {/* Collapsible Enterprise Integration Section */}
                    <div className="col-span-1 md:col-span-2 border border-zinc-900 rounded-xl overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setShowEnterpriseSection(p => !p)}
                            className="w-full p-4 bg-zinc-950/80 flex items-center justify-between text-left hover:bg-zinc-900/50 transition-colors"
                        >
                            <div>
                                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
                                    🏢 Google Cloud Enterprise Configuration
                                    <span className="text-[10px] text-zinc-500 font-mono bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">Priority 1 Engine</span>
                                </span>
                                <p className="text-[11px] text-zinc-500 mt-0.5">Optional enterprise project ID and API key for direct Google Cloud Enterprise Assessment API</p>
                            </div>
                            <span className="text-zinc-500">{showEnterpriseSection ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
                        </button>

                        {showEnterpriseSection && (
                            <div className="p-4 bg-zinc-950/40 border-t border-zinc-900 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] text-zinc-400 font-semibold tracking-wide uppercase">Google Cloud Project ID</label>
                                    <input
                                        id="recaptcha_project_id"
                                        type="text"
                                        value={editedValues.recaptcha_project_id || ''}
                                        onChange={e => setEditedValues(p => ({ ...p, recaptcha_project_id: e.target.value }))}
                                        placeholder="e.g. tekdoctor-production"
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white font-mono focus:outline-none focus:border-neon-cyan"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[11px] text-zinc-400 font-semibold tracking-wide uppercase">Enterprise Assessment API Key</label>
                                    <div className="relative">
                                        <input
                                            id="recaptcha_api_key"
                                            type={showEnterpriseApiKey ? 'text' : 'password'}
                                            value={editedValues.recaptcha_api_key !== undefined ? editedValues.recaptcha_api_key : ''}
                                            onChange={e => setEditedValues(p => ({ ...p, recaptcha_api_key: e.target.value }))}
                                            placeholder="••••••••"
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 pr-10 text-xs text-white font-mono focus:outline-none focus:border-neon-cyan"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowRecaptchaApiKey(p => !p)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
                                            aria-label="Toggle Enterprise API Key"
                                        >
                                            {showEnterpriseApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-zinc-600">Encrypted at rest with AES-256-GCM.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── 3. Branding Assets (Logo & Favicon) ── */}
            <div className="border border-zinc-900 bg-zinc-900/20 rounded-2xl overflow-hidden hover:border-zinc-800 transition-colors">
                <div className="p-5 border-b border-zinc-900 bg-zinc-950/50 flex items-center justify-between">
                    <span className="text-white font-bold font-outfit text-sm">🖼️ Branding Assets</span>
                    <span className="text-[10px] text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-lg">Auto-saves on upload</span>
                </div>
                <div className="p-5 grid grid-cols-1 gap-6">
                    <BrandingCard
                        label="Company Logo"
                        type="logo_url"
                        currentUrl={logoUrl}
                        mode={logoMode}
                        uploading={uploadingLogo}
                        inputUrl={logoInputUrl}
                        onInputUrlChange={setLogoInputUrl}
                        onModeChange={setLogoMode}
                        onUpload={file => handleBrandingUpload('logo_url', file)}
                        onUrlSave={url => handleBrandingUrlSave('logo_url', url)}
                    />
                    <div className="border-t border-zinc-900/80 pt-6">
                        <BrandingCard
                            label="Favicon"
                            type="favicon_url"
                            currentUrl={faviconUrl}
                            mode={faviconMode}
                            uploading={uploadingFavicon}
                            inputUrl={faviconInputUrl}
                            onInputUrlChange={setFaviconInputUrl}
                            onModeChange={setFaviconMode}
                            onUpload={file => handleBrandingUpload('favicon_url', file)}
                            onUrlSave={url => handleBrandingUrlSave('favicon_url', url)}
                        />
                    </div>
                    <div className="border-t border-zinc-900/80 pt-6">
                        <BrandingCard
                            label="Tekunik Partner Logo (About Section)"
                            type="tekunik_image_url"
                            currentUrl={tekunikLogoUrl}
                            mode={tekunikLogoMode}
                            uploading={uploadingTekunikLogo}
                            inputUrl={tekunikLogoInputUrl}
                            onInputUrlChange={setTekunikLogoInputUrl}
                            onModeChange={setTekunikLogoMode}
                            onUpload={file => handleBrandingUpload('tekunik_image_url', file)}
                            onUrlSave={url => handleBrandingUrlSave('tekunik_image_url', url)}
                        />
                    </div>
                </div>
            </div>

            {/* ── 4. All Other Standard Settings (filtered) ── */}
            <div className="space-y-6">
                {Object.entries(settings)
                    .filter(([group]) => !DEDICATED_GROUPS.has(group))
                    .map(([group, keys]) => {
                        const filteredKeys = Object.entries(keys).filter(([key]) => {
                            if (group === 'integrations' && DEDICATED_INTEGRATION_KEYS.has(key)) {
                                return false;
                            }
                            return true;
                        });

                        if (filteredKeys.length === 0) return null;

                        return (
                            <div key={group} className="border border-zinc-900 bg-zinc-900/20 rounded-2xl overflow-hidden hover:border-zinc-800 transition-colors">
                                <div className="p-5 border-b border-zinc-900 bg-zinc-950/50 text-white font-bold font-outfit text-sm">
                                    {groupLabels[group] || group}
                                </div>
                                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {filteredKeys.map(([key]) => (
                                        <div key={key} className={`space-y-2 ${key.includes('address') || key.includes('description') || key.includes('business') ? 'col-span-1 md:col-span-2' : ''}`}>
                                            <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">{fieldLabels[key] || key.replace(/_/g, ' ')}</label>
                                            {key === 'maintenance_mode' ? (
                                                <select value={editedValues[key] || 'false'} onChange={e => setEditedValues(p => ({ ...p, [key]: e.target.value }))}
                                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan">
                                                    <option value="false">Off — Site is Live</option>
                                                    <option value="true">On — Maintenance Screen Enabled</option>
                                                </select>
                                            ) : key === 'invoice_gst_enabled' ? (
                                                <select value={editedValues[key] || 'true'} onChange={e => setEditedValues(p => ({ ...p, [key]: e.target.value }))}
                                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan">
                                                    <option value="true">Enabled (Calculate CGST/SGST or IGST)</option>
                                                    <option value="false">Disabled (Exempt / Non-GST Bills)</option>
                                                </select>
                                            ) : key.includes('description') || key.includes('address') ? (
                                                <textarea value={editedValues[key] || ''} onChange={e => setEditedValues(p => ({ ...p, [key]: e.target.value }))} rows={2}
                                                    placeholder={`Enter ${fieldLabels[key] || key}`}
                                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan resize-none" />
                                            ) : key.includes('color') ? (
                                                <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-xl p-1.5 focus-within:border-neon-cyan transition-colors">
                                                    <input type="color" value={editedValues[key] || '#00bcd4'} onChange={e => setEditedValues(p => ({ ...p, [key]: e.target.value }))} className="w-8 h-8 rounded shrink-0 border-0 cursor-pointer" />
                                                    <input type="text" value={editedValues[key] || ''} onChange={e => setEditedValues(p => ({ ...p, [key]: e.target.value }))}
                                                        className="flex-1 bg-transparent border-0 px-2 text-sm text-white font-mono focus:outline-none focus:ring-0" />
                                                </div>
                                            ) : (
                                                <input type="text" value={editedValues[key] || ''} onChange={e => setEditedValues(p => ({ ...p, [key]: e.target.value }))}
                                                    placeholder={`Enter ${fieldLabels[key] || key}`}
                                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
            </div>

            {/* ── Confirmation Modal: Disable reCAPTCHA Warning ── */}
            {showRecaptchaWarningModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl shadow-amber-500/10 space-y-4">
                        <div className="flex items-start gap-4">
                            <span className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl shrink-0">
                                <AlertTriangle size={24} />
                            </span>
                            <div className="space-y-1">
                                <h3 className="text-lg font-bold text-white font-outfit">Disable reCAPTCHA Bot Protection?</h3>
                                <p className="text-xs text-zinc-400 leading-relaxed">
                                    Disabling reCAPTCHA removes automated bot, brute-force, and spam protection from all public forms (Login, Signup, Forgot Password, Booking, and Contact Us).
                                </p>
                            </div>
                        </div>

                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-[11px] text-amber-300/90 font-mono">
                            ⚠️ Warning: Your site will rely only on rate limiting to prevent automated account takeover attempts.
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowRecaptchaWarningModal(false)}
                                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
                            >
                                Keep Enabled
                            </button>
                            <button
                                type="button"
                                onClick={confirmDisableRecaptcha}
                                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg shadow-amber-500/20"
                            >
                                Confirm Disable
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
