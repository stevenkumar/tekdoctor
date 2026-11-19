import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { adminApi } from '@/services/api';
import { Mail, Loader2, Save, CheckCircle2, Shield, TestTube, AlertCircle } from 'lucide-react';
import { SkeletonProfile } from '@/components/Skeleton';

export default function EmailSettings() {
    const { token } = useAuth();
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [testing, setTesting] = useState(false);
    const [testMsg, setTestMsg] = useState('');

    useEffect(() => {
        if (!token) return;
        const fetch = async () => {
            setLoading(true);
            const res = await adminApi.getSettings(token, 'email');
            if (res.ok && res.data) {
                const data = (res.data as any).data?.email || {};
                setSettings(data);
            }
            setLoading(false);
        };
        fetch();
    }, [token]);

    const handleSave = async () => {
        if (!token) return;
        setSaving(true);
        setSaveMsg('');
        try {
            const res = await adminApi.updateSettings(token, settings, 'email');
            setSaveMsg(res.ok ? 'Email settings saved!' : res.error || 'Failed to save.');
            if (res.ok) setTimeout(() => setSaveMsg(''), 3000);
        } catch {
            setSaveMsg('Network error while saving email settings.');
        } finally {
            setSaving(false);
        }
    };

    const handleTestEmail = async () => {
        if (!token) return;
        setTesting(true);
        setTestMsg('');
        try {
            const res = await adminApi.testEmailSettings(token, settings);
            const msg = res.ok ? (res.data as any)?.message || 'Email sent!' : res.error || 'Test failed.';
            setTestMsg(msg);
            setTimeout(() => setTestMsg(''), 10000);
        } catch {
            setTestMsg('Network error while sending test email.');
            setTimeout(() => setTestMsg(''), 10000);
        } finally {
            setTesting(false);
        }
    };

    const fields = [
        { key: 'smtp_host', label: 'SMTP Host', placeholder: 'smtp.gmail.com', icon: Mail },
        { key: 'smtp_port', label: 'SMTP Port', placeholder: '587', icon: Mail },
        { key: 'smtp_user', label: 'SMTP User', placeholder: 'admin@tekdoctor.in', icon: Mail },
        { key: 'smtp_password', label: 'SMTP Password', placeholder: '••••••••', type: 'password', icon: Shield },
        { key: 'from_email', label: 'From Email', placeholder: 'noreply@tekdoctor.in', icon: Mail },
        { key: 'from_name', label: 'From Name', placeholder: 'TekDoctor', icon: Mail },
    ];
    const templates = [
        { key: 'template_repair_ready', label: 'Repair Ready for Pickup', help: 'Variables: {{customer_name}}, {{device_brand}}, {{ticket_id}}' },
        { key: 'template_new_ticket', label: 'New Repair Ticket Created', help: 'Variables: {{customer_name}}, {{device_brand}}, {{ticket_id}}' },
        { key: 'template_status_update', label: 'Ticket Status Updated', help: 'Variables: {{customer_name}}, {{ticket_id}}, {{status}}' }
    ];

    if (loading) return <div className="max-w-2xl"><SkeletonProfile /></div>;

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight flex items-center gap-2"><Mail size={24} className="text-neon-cyan" />Email Settings</h1>
                    <p className="text-xs text-zinc-500 mt-1">Configure SMTP and email settings</p>
                </div>
                <button onClick={handleSave} disabled={saving} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-neon-cyan hover:bg-neon-cyan text-black font-bold rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50 w-full sm:w-auto">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save
                </button>
            </div>

            {saveMsg && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2"><CheckCircle2 size={14} />{saveMsg}</div>}

            <div className="border border-zinc-900 bg-zinc-900/20 rounded-2xl p-4 sm:p-6 space-y-4">
                {fields.map(f => (
                    <div key={f.key} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase flex items-center gap-1.5"><f.icon size={12} />{f.label}</label>
                            {f.key === 'smtp_password' && (
                                settings.smtp_password === '__CLEAR__' ? (
                                    <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1.5">
                                        [Will be cleared on save]
                                        <button
                                            type="button"
                                            onClick={() => setSettings(p => ({ ...p, smtp_password: '' }))}
                                            className="text-neon-cyan hover:underline cursor-pointer"
                                        >
                                            Undo
                                        </button>
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (window.confirm('Are you sure you want to clear the stored SMTP password?')) {
                                                setSettings(p => ({ ...p, smtp_password: '__CLEAR__' }));
                                            }
                                        }}
                                        className="text-[10px] text-rose-400 hover:text-rose-300 font-mono hover:underline cursor-pointer"
                                    >
                                        Clear Password
                                    </button>
                                )
                            )}
                        </div>
                        <input
                            type={f.type || 'text'}
                            value={settings[f.key] === '__CLEAR__' ? '' : (settings[f.key] || '')}
                            placeholder={settings[f.key] === '__CLEAR__' ? '[Password cleared — click Save to apply]' : f.placeholder}
                            disabled={settings[f.key] === '__CLEAR__'}
                            onChange={e => setSettings(p => ({ ...p, [f.key]: e.target.value }))}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan transition-colors disabled:opacity-60 font-mono text-xs" />
                    </div>
                ))}
            </div>

            <div className="border border-zinc-900/60 bg-zinc-950/30 rounded-2xl p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 text-zinc-400 text-sm font-medium">
                        <TestTube size={16} className="text-neon-cyan" />Test Email Configuration
                    </div>
                    <button
                        onClick={handleTestEmail}
                        disabled={testing}
                        className="px-4 py-2 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 transition-all rounded-lg text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer w-full sm:w-auto"
                    >
                        {testing ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                        Send Test Email
                    </button>
                </div>
                <p className="text-xs text-zinc-600">Send a test email to verify your SMTP configuration before saving.</p>
                {testMsg && (
                    <div className={`mt-3 p-3 rounded-xl text-xs flex items-center gap-2 ${testMsg.toLowerCase().includes('success') ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                        {testMsg.toLowerCase().includes('success') ? <CheckCircle2 size={14} /> : <AlertCircle size={14} className="text-red-400" />} {testMsg}
                    </div>
                )}
            </div>

            <div className="border border-zinc-900 bg-zinc-900/20 rounded-2xl overflow-hidden mt-8">
                <div className="p-4 sm:p-5 border-b border-zinc-900 bg-zinc-950/50 text-white font-bold font-outfit text-sm">
                    📧 Notification Templates
                </div>
                <div className="p-4 sm:p-6 space-y-6">
                    {templates.map(t => (
                        <div key={t.key} className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs text-white font-semibold tracking-wide uppercase">{t.label}</label>
                                <span className="text-[10px] text-zinc-500 font-mono bg-zinc-900 px-2 py-1 rounded border border-zinc-800">{t.help}</span>
                            </div>
                            <textarea
                                value={settings[t.key] || ''}
                                onChange={e => setSettings(p => ({ ...p, [t.key]: e.target.value }))}
                                rows={3}
                                placeholder="Enter email/notification template body..."
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:border-neon-cyan resize-none font-mono"
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
