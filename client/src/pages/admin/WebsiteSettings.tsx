import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { adminApi } from '@/services/api';
import { Settings, Loader2, Save, CheckCircle2, Link as LinkIcon, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSiteContext } from '@/context/SiteContext';
import { getMediaUrl, isUploadPath } from '@/utils/media';

// ─── Schema for text/select settings (branding media handled separately) ───
const DEFAULT_SETTINGS = {
    company: { company_name: '', company_phone: '', company_email: '', company_address: '' },
    theme: { theme_primary_color: '#00f2ff', theme_secondary_color: '#1a1a1a' },
    social: { facebook_url: '', twitter_url: '', instagram_url: '', linkedin_url: '' },
    integrations: { google_maps_link: '', google_sheet_url: '' },
    system: { maintenance_mode: 'false' },
    seo: { meta_title: '', meta_description: '', meta_keywords: '' }
};

export default function WebsiteSettings() {
    const { token } = useAuth();
    const [settings, setSettings] = useState<Record<string, Record<string, string>>>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [editedValues, setEditedValues] = useState<Record<string, string>>({});
    const { refreshSiteData } = useSiteContext();

    // ─── Branding state (logo + favicon — managed independently from form) ───
    const [logoUrl, setLogoUrl] = useState('');
    const [faviconUrl, setFaviconUrl] = useState('');
    const [logoMode, setLogoMode] = useState<'upload' | 'url'>('upload');
    const [faviconMode, setFaviconMode] = useState<'upload' | 'url'>('upload');
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingFavicon, setUploadingFavicon] = useState(false);
    const [logoInputUrl, setLogoInputUrl] = useState('');
    const [faviconInputUrl, setFaviconInputUrl] = useState('');

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
                            if (Object.prototype.hasOwnProperty.call(mergedSettings[group], key)) {
                                mergedSettings[group][key] = data[group][key];
                            }
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
                setLogoUrl(storedLogo);
                setFaviconUrl(storedFavicon);
                setLogoInputUrl(storedLogo);
                setFaviconInputUrl(storedFavicon);
                setLogoMode(isUploadPath(storedLogo) ? 'upload' : (storedLogo ? 'url' : 'upload'));
                setFaviconMode(isUploadPath(storedFavicon) ? 'upload' : (storedFavicon ? 'url' : 'upload'));
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

    // ─── Save all non-media settings ───
    const handleSave = async () => {
        if (!token) return;
        setSaving(true); setSaveMsg('');
        // Exclude logo_url and favicon_url from the general save — they have their own handlers
        const { logo_url: _logo, favicon_url: _favicon, ...settingsToSave } = editedValues;


        const res = await adminApi.updateSettings(token, settingsToSave);
        if (res.ok) {
            setSaveMsg('Settings saved successfully!');
            await fetchSettings(false);
            await refreshSiteData();
            setTimeout(() => setSaveMsg(''), 3000);
        } else {
            toast.error('Failed to save settings.');
        }
        setSaving(false);
    };

    // ─── Upload a branding image file and immediately persist ───
    const handleBrandingUpload = async (type: 'logo_url' | 'favicon_url', file: File) => {
        if (!token) return;
        if (type === 'logo_url') setUploadingLogo(true);
        else setUploadingFavicon(true);

        try {
            const uploadRes = await adminApi.uploadFile(token, file);

            // The backend returns: { success, message, data: { url: "/uploads/xyz.png" } }
            // safeFetch stores the full JSON in res.data, so the path is res.data.data.url
            const resultData = (uploadRes.data as any);
            const url: string | undefined = resultData?.data?.url;

            if (uploadRes.ok && url) {
                // Persist to DB immediately — don't wait for "Save All"
                const saveRes = await adminApi.updateSettings(token, { [type]: url });
                if (saveRes.ok) {
                    if (type === 'logo_url') { setLogoUrl(url); setLogoInputUrl(url); }
                    else { setFaviconUrl(url); setFaviconInputUrl(url); }
                    toast.success(`${type === 'logo_url' ? 'Logo' : 'Favicon'} updated successfully!`);
                    await refreshSiteData();
                } else {
                    toast.error('File uploaded but save failed. Please try again.');
                }
            } else {
                console.error('[WebsiteSettings] uploadFile response:', uploadRes);
                toast.error('Upload failed — server returned no URL.');
            }
        } catch (error) {
            console.error('Upload Error', error);
            toast.error('File upload error.');
        } finally {
            if (type === 'logo_url') setUploadingLogo(false);
            else setUploadingFavicon(false);
        }
    };

    // ─── Save a branding URL (for the "URL" input mode) ───
    const handleBrandingUrlSave = async (type: 'logo_url' | 'favicon_url', url: string) => {
        if (!token || !url.trim()) return;
        const saveRes = await adminApi.updateSettings(token, { [type]: url.trim() });
        if (saveRes.ok) {
            if (type === 'logo_url') setLogoUrl(url.trim());
            else setFaviconUrl(url.trim());
            toast.success(`${type === 'logo_url' ? 'Logo' : 'Favicon'} URL saved!`);
            await refreshSiteData();
        } else {
            toast.error('Failed to save URL.');
        }
    };

    const groupLabels: Record<string, string> = {
        company: '🏢 Company Information',
        theme: '🎨 Theme Colors',
        social: '🌐 Social Media Links',
        integrations: '🔌 Integrations',
        system: '⚙️ System',
        seo: '🔍 SEO Settings',
    };

    const fieldLabels: Record<string, string> = {
        company_name: 'Company Name', company_phone: 'Contact Number', company_email: 'Contact Email', company_address: 'Address',
        theme_primary_color: 'Primary Theme Color', theme_secondary_color: 'Secondary Theme Color',
        facebook_url: 'Facebook', twitter_url: 'Twitter', instagram_url: 'Instagram', linkedin_url: 'LinkedIn',
        google_maps_link: 'Google Maps Link', google_sheet_url: 'Google Sheet URL',
        maintenance_mode: 'Maintenance Mode',
        meta_title: 'Meta Title', meta_description: 'Meta Description', meta_keywords: 'Meta Keywords',
    };

    if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 text-neon-cyan animate-spin" /></div>;

    // ─── Branding Media Card (Logo / Favicon) ───
    const BrandingCard = ({
        label, type, currentUrl, mode, uploading,
        inputUrl, onInputUrlChange,
        onModeChange, onUpload, onUrlSave
    }: {
        label: string;
        type: 'logo_url' | 'favicon_url';
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

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight flex items-center gap-2"><Settings size={24} className="text-neon-cyan" />Website Settings</h1>
                    <p className="text-xs text-zinc-500 mt-1">Configure site-wide priorities and integrations</p>
                </div>
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-neon-cyan hover:bg-neon-cyan text-black font-bold rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-neon-cyan/20">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save All Settings
                </button>
            </div>

            {saveMsg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2"><CheckCircle2 size={14} />{saveMsg}</div>
            )}

            {/* ── Branding Assets (Logo & Favicon) – independently saved ── */}
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
                </div>
            </div>

            {/* ── All Other Settings (text/select) ── */}
            <div className="space-y-6">
                {Object.entries(settings).map(([group, keys]) => (
                    <div key={group} className="border border-zinc-900 bg-zinc-900/20 rounded-2xl overflow-hidden hover:border-zinc-800 transition-colors">
                        <div className="p-5 border-b border-zinc-900 bg-zinc-950/50 text-white font-bold font-outfit text-sm">
                            {groupLabels[group] || group}
                        </div>
                        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                            {Object.entries(keys).map(([key]) => (
                                <div key={key} className={`space-y-2 ${key.includes('address') || key.includes('description') || key.includes('business') ? 'col-span-1 md:col-span-2' : ''}`}>
                                    <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">{fieldLabels[key] || key.replace(/_/g, ' ')}</label>
                                    {key === 'maintenance_mode' ? (
                                        <select value={editedValues[key] || 'false'} onChange={e => setEditedValues(p => ({ ...p, [key]: e.target.value }))}
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan">
                                            <option value="false">Off — Site is Live</option>
                                            <option value="true">On — Maintenance Screen Enabled</option>
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
                ))}
            </div>


        </div>
    );
}
