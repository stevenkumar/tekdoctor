import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { technicianApi, adminApi } from '@/services/api';
import type { TechnicianUser } from '@/services/api';
import { toast } from 'react-hot-toast';
import {
    UserPlus, Loader2, Eye, EyeOff, Mail, KeyRound, CheckCircle2,
    RefreshCw, UserCog, ShieldCheck, ShieldOff, Key, X, ActivitySquare,
    Phone, Edit2, Save
} from 'lucide-react';
import TechnicianPerformanceModal from '@/components/TechnicianPerformanceModal';
import SideDrawer from '@/components/SideDrawer';
import PhoneInput from '@/components/PhoneInput';
import { PromptModal } from '@/components/PromptModal';
import { parsePhoneNumber, validatePhoneNumber, DEFAULT_COUNTRY } from '@/utils/phoneUtils';
import { NAME_MAX_LENGTH, validateName, validateEmail, validatePassword, DUPLICATE_ERRORS } from '@/config/constants';

export default function TechnicianManagement() {
    const { token } = useAuth();
    const [technicians, setTechnicians] = useState<TechnicianUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', phone: '' });
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState('');
    const [createSuccess, setCreateSuccess] = useState('');
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [resetModal, setResetModal] = useState<{ id: number; name: string } | null>(null);
    const [editModal, setEditModal] = useState<{ id: number; name: string; email: string; phone: string } | null>(null);
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState('');
    const [performanceModalId, setPerformanceModalId] = useState<number | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [resetLoading, setResetLoading] = useState(false);

    const [createFieldErrors, setCreateFieldErrors] = useState<{ name?: string; email?: string; phone?: string; password?: string }>({});
    const [editFieldErrors, setEditFieldErrors] = useState<{ name?: string; email?: string; phone?: string }>({});
    const [deactivateModal, setDeactivateModal] = useState<{ id: number; name: string } | null>(null);
    const [deactivateLoading, setDeactivateLoading] = useState(false);

    const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');

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
        setCreateFieldErrors({});

        const errs: { name?: string; email?: string; phone?: string; password?: string } = {};

        const nameVal = validateName(createForm.name, 'Full name');
        if (!nameVal.isValid) {
            errs.name = nameVal.error || 'Please enter a valid full name.';
        }

        const emailVal = validateEmail(createForm.email);
        if (!emailVal.isValid) {
            errs.email = emailVal.error || 'Please enter a valid email address.';
        }

        const trimmedPhone = createForm.phone.trim();
        if (!trimmedPhone) {
            errs.phone = 'Phone number is required.';
        } else {
            const { country, nationalNumber } = parsePhoneNumber(trimmedPhone, DEFAULT_COUNTRY);
            const val = validatePhoneNumber(nationalNumber, country);
            if (!val.isValid) {
                errs.phone = val.error || 'Please enter a valid phone number.';
            }
        }

        const passVal = validatePassword(createForm.password);
        if (!passVal.isValid) {
            errs.password = passVal.error || 'Password must be at least 8 characters long.';
        }

        if (Object.keys(errs).length > 0) {
            setCreateFieldErrors(errs);
            setIsCreating(false);
            return;
        }

        const res = await technicianApi.create(token, createForm.name.trim(), createForm.email.trim(), createForm.password, trimmedPhone);
        if (res.ok) {
            setCreateSuccess('Technician account provisioned.');
            setCreateForm({ name: '', email: '', password: '', phone: '' });
            setCreateFieldErrors({});
            fetchTechnicians();
            setTimeout(() => setCreateSuccess(''), 3000);
        } else {
            const errMsg = res.error || 'Failed to create technician.';
            if (errMsg.toLowerCase().includes('phone') || res.errors?.phone) {
                setCreateFieldErrors(prev => ({ ...prev, phone: res.errors?.phone || DUPLICATE_ERRORS.PHONE }));
            } else if (errMsg.toLowerCase().includes('email') || res.errors?.email) {
                setCreateFieldErrors(prev => ({ ...prev, email: res.errors?.email || DUPLICATE_ERRORS.EMAIL }));
            } else {
                setCreateError(errMsg);
            }
        }
        setIsCreating(false);
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token || !editModal) return;
        setEditLoading(true); setEditError('');
        setEditFieldErrors({});

        const errs: { name?: string; email?: string; phone?: string } = {};

        const nameVal = validateName(editModal.name, 'Full name');
        if (!nameVal.isValid) {
            errs.name = nameVal.error || 'Please enter a valid full name.';
        }

        const emailVal = validateEmail(editModal.email);
        if (!emailVal.isValid) {
            errs.email = emailVal.error || 'Please enter a valid email address.';
        }

        const trimmedPhone = editModal.phone.trim();
        if (!trimmedPhone) {
            errs.phone = 'Phone number is required.';
        } else {
            const { country, nationalNumber } = parsePhoneNumber(trimmedPhone, DEFAULT_COUNTRY);
            const val = validatePhoneNumber(nationalNumber, country);
            if (!val.isValid) {
                errs.phone = val.error || 'Please enter a valid phone number.';
            }
        }

        if (Object.keys(errs).length > 0) {
            setEditFieldErrors(errs);
            setEditLoading(false);
            return;
        }

        const res = await technicianApi.update(token, editModal.id, {
            name: editModal.name.trim(),
            email: editModal.email.trim(),
            phone: trimmedPhone
        });

        if (res.ok) {
            toast.success('Technician details updated successfully.');
            setEditModal(null);
            setEditFieldErrors({});
            fetchTechnicians();
        } else {
            const errMsg = res.error || 'Failed to update technician.';
            if (errMsg.toLowerCase().includes('phone') || res.errors?.phone) {
                setEditFieldErrors(prev => ({ ...prev, phone: res.errors?.phone || DUPLICATE_ERRORS.PHONE }));
            } else if (errMsg.toLowerCase().includes('email') || res.errors?.email) {
                setEditFieldErrors(prev => ({ ...prev, email: res.errors?.email || DUPLICATE_ERRORS.EMAIL }));
            } else {
                setEditError(errMsg);
            }
        }
        setEditLoading(false);
    };

    const handleDeactivate = (id: number, name: string) => {
        setDeactivateModal({ id, name });
    };

    const handleConfirmDeactivate = async (reason: string) => {
        if (!token || !deactivateModal) return;
        setDeactivateLoading(true);
        const res = await technicianApi.deactivate(token, deactivateModal.id, reason.trim() || undefined);
        if (res.ok) {
            toast.success(`Technician "${deactivateModal.name}" deactivated.`);
            setDeactivateModal(null);
            fetchTechnicians();
        } else {
            toast.error(res.error || 'Failed to deactivate technician.');
        }
        setDeactivateLoading(false);
    };

    const handleReactivate = async (id: number, name: string) => {
        if (!token) return;
        setDeletingId(id);
        const res = await technicianApi.reactivate(token, id);
        if (res.ok) {
            toast.success(`Technician "${name}" reactivated!`);
            fetchTechnicians();
        } else {
            toast.error(res.error || 'Failed to reactivate technician.');
        }
        setDeletingId(null);
    };

    const handleToggleStatus = async (id: number) => {
        if (!token) return;
        const tech = technicians.find(t => t.id === id);
        if ((tech as any)?.is_active !== false) {
            handleDeactivate(id, tech?.name || 'Technician');
        } else {
            handleReactivate(id, tech?.name || 'Technician');
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

    const filteredTechnicians = technicians.filter(tech => {
        if (statusFilter === 'active') return (tech as any).is_active !== false;
        if (statusFilter === 'inactive') return (tech as any).is_active === false;
        return true;
    });

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
                    <div className="p-4 sm:p-6 border-b border-zinc-900 flex items-center gap-2">
                        <UserPlus size={16} className="text-neon-cyan" />
                        <h3 className="text-white font-bold font-outfit">Create Technician</h3>
                    </div>
                    <div className="p-4 sm:p-6 space-y-4">
                        {createError && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl">{createError}</div>}
                        {createSuccess && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2"><CheckCircle2 size={14} />{createSuccess}</div>}
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Full Name</label>
                                <input
                                    type="text"
                                    required
                                    maxLength={NAME_MAX_LENGTH}
                                    value={createForm.name}
                                    onChange={e => {
                                        setCreateForm(p => ({ ...p, name: e.target.value }));
                                        if (createFieldErrors.name) setCreateFieldErrors(p => ({ ...p, name: undefined }));
                                    }}
                                    className={`w-full bg-zinc-950 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors ${
                                        createFieldErrors.name ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-neon-cyan'
                                    }`}
                                    placeholder="John Doe"
                                />
                                {createFieldErrors.name && <p className="text-xs text-red-400 mt-1">{createFieldErrors.name}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Email</label>
                                <input
                                    type="email"
                                    required
                                    value={createForm.email}
                                    onChange={e => {
                                        setCreateForm(p => ({ ...p, email: e.target.value }));
                                        if (createFieldErrors.email) setCreateFieldErrors(p => ({ ...p, email: undefined }));
                                    }}
                                    className={`w-full bg-zinc-950 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors ${
                                        createFieldErrors.email ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-neon-cyan'
                                    }`}
                                    placeholder="john@tekdoctor.in"
                                />
                                {createFieldErrors.email && <p className="text-xs text-red-400 mt-1">{createFieldErrors.email}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <PhoneInput
                                    value={createForm.phone}
                                    onChange={val => {
                                        setCreateForm(p => ({ ...p, phone: val }));
                                        if (createFieldErrors.phone) setCreateFieldErrors(p => ({ ...p, phone: undefined }));
                                    }}
                                    size="sm"
                                    label="Phone Number"
                                    error={createFieldErrors.phone}
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Password</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        value={createForm.password}
                                        onChange={e => {
                                            setCreateForm(p => ({ ...p, password: e.target.value }));
                                            if (createFieldErrors.password) setCreateFieldErrors(p => ({ ...p, password: undefined }));
                                        }}
                                        className={`w-full bg-zinc-950 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors pr-10 ${
                                            createFieldErrors.password ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-neon-cyan'
                                        }`}
                                        placeholder="••••••••"
                                    />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-zinc-500 hover:text-white transition-colors cursor-pointer p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-neon-cyan/40" aria-label={showPassword ? "Hide password" : "Show password"} tabIndex={-1}>
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {createFieldErrors.password && <p className="text-xs text-red-400 mt-1">{createFieldErrors.password}</p>}
                            </div>
                            <button type="submit" disabled={isCreating} className="w-full py-2.5 bg-neon-cyan hover:bg-neon-cyan text-black font-extrabold tracking-wider rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                                {isCreating ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}PROVISION ACCESS
                            </button>
                        </form>
                    </div>
                </div>

                {/* Technicians List */}
                <div className="lg:col-span-2 border border-zinc-900 bg-zinc-900/20 rounded-2xl overflow-hidden shadow-xl">
                    <div className="p-4 sm:p-6 border-b border-zinc-900 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <UserCog size={16} className="text-neon-cyan" />
                            <h3 className="text-white font-bold font-outfit">Technician Roster ({filteredTechnicians.length})</h3>
                        </div>
                        <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl p-1">
                            {[
                                { label: 'All', value: '' },
                                { label: 'Active', value: 'active' },
                                { label: 'Inactive', value: 'inactive' },
                            ].map(st => (
                                <button
                                    key={st.value}
                                    onClick={() => setStatusFilter(st.value as any)}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${statusFilter === st.value
                                        ? 'bg-zinc-800 text-white font-semibold shadow-sm'
                                        : 'text-zinc-400 hover:text-zinc-200'
                                        }`}
                                >
                                    {st.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {loading ? (
                        <div className="p-12 text-center"><Loader2 className="w-6 h-6 text-neon-cyan animate-spin mx-auto" /></div>
                    ) : filteredTechnicians.length === 0 ? (
                        <div className="p-12 text-center text-zinc-500 text-sm">No technicians found for this filter.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] border-collapse text-left">
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
                                    {filteredTechnicians.map(tech => (
                                        <tr key={tech.id} className={`hover:bg-zinc-900/30 transition-colors group ${(tech as any).is_active === false ? 'opacity-70 bg-zinc-950/20' : ''}`}>
                                            <td className="p-4 cursor-pointer" onClick={() => setPerformanceModalId(tech.id)}>
                                                <div className="font-mono text-neon-cyan font-bold text-xs group-hover:underline">
                                                    {tech.technician_id || 'TD-TECH-???'}
                                                </div>
                                            </td>
                                            <td className="p-4 cursor-pointer" onClick={() => setPerformanceModalId(tech.id)}>
                                                <div className="font-semibold text-white text-sm group-hover:text-neon-cyan transition-colors">{tech.name}</div>
                                                <div className="flex items-center gap-1.5 text-zinc-500 text-xs mt-0.5"><Mail size={11} />{tech.email}</div>
                                                {tech.phone && (
                                                    <div className="flex items-center gap-1.5 text-zinc-400 text-xs mt-0.5"><Phone size={11} className="text-neon-cyan/70" />{tech.phone}</div>
                                                )}
                                                {(tech as any).deactivation_reason && (
                                                    <div className="text-[10px] text-amber-400 font-mono mt-0.5">
                                                        Deactivated: {(tech as any).deactivation_reason}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold border ${(tech as any).is_active !== false ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
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
                                                    <button onClick={() => { setEditModal({ id: tech.id, name: tech.name, email: tech.email, phone: tech.phone || '' }); setEditError(''); }} className="p-1.5 bg-zinc-800/50 border border-zinc-700 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer" title="Edit Technician">
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button onClick={() => { setResetModal({ id: tech.id, name: tech.name }); setNewPassword(''); }} className="p-1.5 bg-zinc-800/50 border border-zinc-700 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer" title="Reset Password">
                                                        <Key size={13} />
                                                    </button>
                                                    {(tech as any).is_active !== false ? (
                                                        <button onClick={() => handleDeactivate(tech.id, tech.name)} disabled={deletingId === tech.id} className="p-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 text-amber-400 transition-all cursor-pointer" title="Deactivate Technician">
                                                            {deletingId === tech.id ? <Loader2 size={13} className="animate-spin" /> : <ShieldOff size={13} />}
                                                        </button>
                                                    ) : (
                                                        <button onClick={() => handleReactivate(tech.id, tech.name)} disabled={deletingId === tech.id} className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 text-emerald-400 transition-all cursor-pointer" title="Reactivate Technician">
                                                            {deletingId === tech.id ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                                                        </button>
                                                    )}
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
                        <div className="relative">
                            <input
                                type={showResetPassword ? "text" : "password"}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="New password (min 6 chars)"
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-neon-cyan"
                            />
                            <button
                                type="button"
                                onClick={() => setShowResetPassword(!showResetPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer p-1 rounded focus:outline-none focus:ring-1 focus:ring-neon-cyan/40"
                                aria-label={showResetPassword ? "Hide password" : "Show password"}
                                tabIndex={-1}
                            >
                                {showResetPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        <button onClick={handleResetPassword} disabled={resetLoading || newPassword.length < 6} className="w-full py-2.5 bg-neon-cyan hover:bg-neon-cyan text-black font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                            {resetLoading ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}Reset Password
                        </button>
                    </div>
                </div>
            )}

            {/* Edit Technician Side Drawer */}
            <SideDrawer
                isOpen={Boolean(editModal)}
                onClose={() => setEditModal(null)}
                title={editModal ? `Edit Technician — ${editModal.name}` : 'Edit Technician'}
                size="md"
            >
                {editModal && (
                    <div className="space-y-4">
                        {editError && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl">{editError}</div>}
                        <form onSubmit={handleUpdate} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Full Name</label>
                                <input
                                    type="text"
                                    required
                                    maxLength={NAME_MAX_LENGTH}
                                    value={editModal.name}
                                    onChange={e => {
                                        setEditModal(p => p ? ({ ...p, name: e.target.value }) : null);
                                        if (editFieldErrors.name) setEditFieldErrors(p => ({ ...p, name: undefined }));
                                    }}
                                    className={`w-full bg-zinc-950 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none ${
                                        editFieldErrors.name ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-neon-cyan'
                                    }`}
                                />
                                {editFieldErrors.name && <p className="text-xs text-red-400 mt-1">{editFieldErrors.name}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Email</label>
                                <input
                                    type="email"
                                    required
                                    value={editModal.email}
                                    onChange={e => {
                                        setEditModal(p => p ? ({ ...p, email: e.target.value }) : null);
                                        if (editFieldErrors.email) setEditFieldErrors(p => ({ ...p, email: undefined }));
                                    }}
                                    className={`w-full bg-zinc-950 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none ${
                                        editFieldErrors.email ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-neon-cyan'
                                    }`}
                                />
                                {editFieldErrors.email && <p className="text-xs text-red-400 mt-1">{editFieldErrors.email}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <PhoneInput
                                    value={editModal.phone}
                                    onChange={val => {
                                        setEditModal(p => p ? ({ ...p, phone: val }) : null);
                                        if (editFieldErrors.phone) setEditFieldErrors(p => ({ ...p, phone: undefined }));
                                    }}
                                    size="sm"
                                    label="Phone Number"
                                    error={editFieldErrors.phone}
                                    required
                                />
                            </div>
                            <button type="submit" disabled={editLoading} className="w-full py-2.5 bg-neon-cyan hover:bg-neon-cyan text-black font-extrabold tracking-wider rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                                {editLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}SAVE CHANGES
                            </button>
                        </form>
                    </div>
                )}
            </SideDrawer>

            {/* Deactivation Modal */}
            <PromptModal
                isOpen={deactivateModal !== null}
                title={`Deactivate Technician - ${deactivateModal?.name}`}
                message={`Deactivate technician "${deactivateModal?.name}"?\nActive tickets will be unassigned. Historical records and logs will remain intact.`}
                inputLabel="Reason (optional):"
                placeholder="Enter deactivation reason..."
                confirmText="Deactivate"
                variant="warning"
                isLoading={deactivateLoading}
                onConfirm={handleConfirmDeactivate}
                onCancel={() => setDeactivateModal(null)}
            />

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
