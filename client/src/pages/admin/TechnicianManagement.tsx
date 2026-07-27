import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { technicianApi, adminApi } from '@/services/api';
import type { TechnicianUser } from '@/services/api';
import { toast } from 'react-hot-toast';
import {
    UserPlus, Trash2, Loader2, Eye, EyeOff, Mail, KeyRound, CheckCircle2,
    RefreshCw, UserCog, Shield, ShieldOff, Key, X, ActivitySquare
} from 'lucide-react';
import TechnicianPerformanceModal from '@/components/TechnicianPerformanceModal';

export default function TechnicianManagement() {
    const { token } = useAuth();
    const [technicians, setTechnicians] = useState<TechnicianUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [createForm, setCreateForm] = useState({ name: '', email: '', password: '' });
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState('');
    const [createSuccess, setCreateSuccess] = useState('');
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [resetModal, setResetModal] = useState<{ id: number; name: string } | null>(null);
    const [performanceModalId, setPerformanceModalId] = useState<number | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [resetLoading, setResetLoading] = useState(false);

    const fetchTechnicians = async () => {
        if (!token) return;
        setLoading(true);
        const res = await technicianApi.getAll(token);
        if (res.ok && res.data) setTechnicians(res.data.data || []);
        setLoading(false);
    };

    useEffect(() => { fetchTechnicians(); }, [token]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        setIsCreating(true); setCreateError(''); setCreateSuccess('');
        const res = await technicianApi.create(token, createForm.name, createForm.email, createForm.password);
        if (res.ok) {
            setCreateSuccess('Technician account provisioned.');
            setCreateForm({ name: '', email: '', password: '' });
            fetchTechnicians();
            setTimeout(() => setCreateSuccess(''), 3000);
        } else {
            setCreateError(res.error || 'Failed to create technician.');
        }
        setIsCreating(false);
    };

    const handleDelete = async (id: number, name: string) => {
        if (!token || !confirm(`Remove technician "${name}"? This will unassign their tickets.`)) return;
        setDeletingId(id);
        const res = await technicianApi.delete(token, id);
        if (res.ok) setTechnicians(prev => prev.filter(t => t.id !== id));
        setDeletingId(null);
    };

    const handleToggleStatus = async (id: number) => {
        if (!token) return;

        // Optimistic UI update for instantaneous feedback
        setTechnicians(prev => prev.map(t => t.id === id ? { ...t, is_active: !t.is_active } : t));

        const res = await technicianApi.toggleStatus(token, id);
        if (!res.ok) {
            toast.error(res.error || 'Failed to toggle status.');
            // Revert if failed
            fetchTechnicians();
        }
    };

    const handleResetPassword = async () => {
        if (!token || !resetModal) return;
        setResetLoading(true);
        const res = await adminApi.resetTechnicianPassword(token, resetModal.id, newPassword);
        if (res.ok) {
            setResetModal(null); setNewPassword('');
            toast.success('Password reset successfully.');
        } else {
            toast.error(res.error || 'Failed to reset password.');
        }
        setResetLoading(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight">Technician Management</h1>
                    <p className="text-xs text-zinc-500 mt-1">Create, manage, and monitor technician accounts</p>
                </div>
                <button onClick={fetchTechnicians} className="flex items-center gap-2 px-4 py-2 bg-zinc-900/60 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Create Form */}
                <div className="lg:col-span-1 border border-zinc-900 bg-zinc-900/20 rounded-2xl overflow-hidden shadow-xl self-start">
                    <div className="p-6 border-b border-zinc-900 flex items-center gap-2">
                        <UserPlus size={16} className="text-neon-cyan" />
                        <h3 className="text-white font-bold font-outfit">Create Technician</h3>
                    </div>
                    <div className="p-6 space-y-4">
                        {createError && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl">{createError}</div>}
                        {createSuccess && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2"><CheckCircle2 size={14} />{createSuccess}</div>}
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Full Name</label>
                                <input type="text" required value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan transition-colors" placeholder="John Doe" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Email</label>
                                <input type="email" required value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan transition-colors" placeholder="john@tekdoctor.in" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Password</label>
                                <div className="relative">
                                    <input type={showPassword ? 'text' : 'password'} required value={createForm.password} onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan transition-colors pr-10" placeholder="••••••••" />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-zinc-500 hover:text-white cursor-pointer">
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                            <button type="submit" disabled={isCreating} className="w-full py-2.5 bg-neon-cyan hover:bg-neon-cyan text-black font-extrabold tracking-wider rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                                {isCreating ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}PROVISION ACCESS
                            </button>
                        </form>
                    </div>
                </div>

                {/* Technicians List */}
                <div className="lg:col-span-2 border border-zinc-900 bg-zinc-900/20 rounded-2xl overflow-hidden shadow-xl">
                    <div className="p-6 border-b border-zinc-900 flex items-center gap-2">
                        <UserCog size={16} className="text-neon-cyan" />
                        <h3 className="text-white font-bold font-outfit">Active Roster ({technicians.length})</h3>
                    </div>
                    {loading ? (
                        <div className="p-12 text-center"><Loader2 className="w-6 h-6 text-neon-cyan animate-spin mx-auto" /></div>
                    ) : technicians.length === 0 ? (
                        <div className="p-12 text-center text-zinc-500 text-sm">No technicians provisioned yet.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left">
                                <thead className="bg-zinc-950/40 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-500">
                                    <tr>
                                        <th className="p-4 border-b border-zinc-900">ID</th>
                                        <th className="p-4 border-b border-zinc-900">Technician</th>
                                        <th className="p-4 border-b border-zinc-900">Status</th>
                                        <th className="p-4 border-b border-zinc-900">Joined</th>
                                        <th className="p-4 border-b border-zinc-900 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900/50">
                                    {technicians.map(tech => (
                                        <tr key={tech.id} className="hover:bg-zinc-900/30 transition-colors group">
                                            <td className="p-4 cursor-pointer" onClick={() => setPerformanceModalId(tech.id)}>
                                                <div className="font-mono text-neon-cyan font-bold text-xs group-hover:underline">
                                                    {tech.technician_id || 'TD-TECH-???'}
                                                </div>
                                            </td>
                                            <td className="p-4 cursor-pointer" onClick={() => setPerformanceModalId(tech.id)}>
                                                <div className="font-semibold text-white text-sm group-hover:text-neon-cyan transition-colors">{tech.name}</div>
                                                <div className="flex items-center gap-1.5 text-zinc-500 text-xs mt-0.5"><Mail size={11} />{tech.email}</div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold border ${(tech as any).is_active !== false ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                                                    }`}>
                                                    {(tech as any).is_active !== false ? 'ACTIVE' : 'INACTIVE'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-xs text-zinc-500 font-mono">{tech.created_at ? new Date(tech.created_at).toLocaleDateString() : '—'}</td>
                                            <td className="p-4 text-right">
                                                <div className="flex items-center gap-1.5 justify-end">
                                                    <button onClick={() => setPerformanceModalId(tech.id)} className="p-1.5 bg-neon-cyan/10 border border-neon-cyan/20 rounded-lg hover:bg-neon-cyan/20 text-neon-cyan transition-all cursor-pointer" title="View Performance Details">
                                                        <ActivitySquare size={13} />
                                                    </button>
                                                    <button onClick={() => handleToggleStatus(tech.id)} className="p-1.5 bg-zinc-800/50 border border-zinc-700 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer" title={(tech as any).is_active !== false ? 'Deactivate' : 'Activate'}>
                                                        {(tech as any).is_active !== false ? <ShieldOff size={13} /> : <Shield size={13} />}
                                                    </button>
                                                    <button onClick={() => { setResetModal({ id: tech.id, name: tech.name }); setNewPassword(''); }} className="p-1.5 bg-zinc-800/50 border border-zinc-700 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer" title="Reset Password">
                                                        <Key size={13} />
                                                    </button>
                                                    <button onClick={() => handleDelete(tech.id, tech.name)} disabled={deletingId === tech.id} className="p-1.5 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 text-red-500 transition-all cursor-pointer">
                                                        {deletingId === tech.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Reset Password Modal */}
            {resetModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setResetModal(null)}>
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-white font-bold font-outfit">Reset Password — {resetModal.name}</h3>
                            <button onClick={() => setResetModal(null)} className="text-zinc-500 hover:text-white cursor-pointer"><X size={18} /></button>
                        </div>
                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password (min 6 chars)" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan" />
                        <button onClick={handleResetPassword} disabled={resetLoading || newPassword.length < 6} className="w-full py-2.5 bg-neon-cyan hover:bg-neon-cyan text-black font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                            {resetLoading ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}Reset Password
                        </button>
                    </div>
                </div>
            )}

            {/* Performance Modal */}
            {performanceModalId !== null && (
                <TechnicianPerformanceModal
                    technicianId={performanceModalId}
                    onClose={() => setPerformanceModalId(null)}
                />
            )}
        </div>
    );
}
