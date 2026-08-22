import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { companyApi } from '../../services/api';
import { MapPin, Phone, Plus, Edit2, ShieldOff, ShieldCheck, X, PlusCircle, RotateCcw } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Branch {
    id: number;
    name: string;
    address: string;
    phone: string;
    is_active?: boolean;
    status?: string;
    deactivation_reason?: string;
}

export default function CompanyBranches() {
    const { token } = useAuth();
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');

    // Modal / form states
    const [isOpen, setIsOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');

    const fetchBranches = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await companyApi.getBranches(token);
            if (res.ok && res.data) {
                setBranches(res.data.data || []);
            } else {
                setError(res.error || 'Failed to fetch branches list.');
            }
        } catch {
            setError('Failed to fetch branches list.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBranches();
    }, [token]);

    const handleOpenCreateModel = () => {
        setName('');
        setAddress('');
        setPhone('');
        setEditingId(null);
        setIsOpen(true);
    };

    const handleOpenEditModel = (branch: Branch) => {
        setName(branch.name);
        setAddress(branch.address);
        setPhone(branch.phone || '');
        setEditingId(branch.id);
        setIsOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!name || !address) {
            setError('Branch name and address are required.');
            return;
        }

        try {
            const res = editingId
                ? await companyApi.updateBranch(token || '', editingId, { name, address, phone })
                : await companyApi.createBranch(token || '', { name, address, phone });

            if (res.ok) {
                setSuccess(editingId ? 'Branch updated successfully!' : 'Branch created successfully!');
                setIsOpen(false);
                fetchBranches();
            } else {
                setError(res.error || 'Failed to submit branch information.');
            }
        } catch {
            setError('Failed to submit branch information.');
        }
    };

    const handleDeactivate = async (id: number, branchName: string) => {
        if (!token) return;
        const reason = prompt(`Deactivate branch "${branchName}"?\nEnter reason (optional):`);
        if (reason === null) return;

        setError('');
        setSuccess('');

        try {
            const res = await companyApi.deleteBranch(token, id, reason || undefined);
            if (res.ok) {
                toast.success('Branch deactivated successfully.');
                fetchBranches();
            } else {
                setError(res.error || 'Failed to deactivate branch.');
            }
        } catch {
            setError('Failed to deactivate branch.');
        }
    };

    const handleReactivate = async (id: number, branchName: string) => {
        if (!token) return;
        setError('');
        setSuccess('');

        try {
            const res = await companyApi.reactivateBranch(token, id);
            if (res.ok) {
                toast.success(`Branch "${branchName}" reactivated.`);
                fetchBranches();
            } else {
                setError(res.error || 'Failed to reactivate branch.');
            }
        } catch {
            setError('Failed to reactivate branch.');
        }
    };

    const filteredBranches = branches.filter(b => {
        if (statusFilter === 'active') return b.is_active !== false;
        if (statusFilter === 'inactive') return b.is_active === false;
        return true;
    });

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Title Header */}
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Branches Management</h1>
                    <p className="text-zinc-500 text-sm mt-1">Manage office operations hubs and repair transfer locations.</p>
                </div>
                <div className="flex items-center gap-3">
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
                    <button
                        onClick={handleOpenCreateModel}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transform active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-indigo-600/10"
                    >
                        <Plus size={16} />
                        <span>Add Branch</span>
                    </button>
                </div>
            </div>

            {/* Messaging alerts */}
            {success && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-sm font-medium animate-fadeIn">
                    {success}
                </div>
            )}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm font-medium animate-fadeIn">
                    {error}
                </div>
            )}

            {/* Loading state */}
            {loading ? (
                <div className="flex items-center justify-center min-h-[300px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                </div>
            ) : filteredBranches.length === 0 ? (
                <div className="bg-[#0c0c0c] border border-zinc-900 border-dashed rounded-2xl py-20 text-center flex flex-col items-center justify-center space-y-4">
                    <MapPin size={40} className="text-zinc-700" />
                    <div className="space-y-1">
                        <h3 className="text-zinc-300 font-bold text-base">No Branches Found</h3>
                        <p className="text-zinc-650 text-xs max-w-sm">Define your secondary branches to map service tasks and assign employee resources.</p>
                    </div>
                    <button
                        onClick={handleOpenCreateModel}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1.5 cursor-pointer mt-2"
                    >
                        <PlusCircle size={14} /> Register Branch
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredBranches.map(branch => (
                        <div key={branch.id} className={`bg-[#0c0c0c] border border-zinc-900/60 rounded-2xl p-5 hover:border-zinc-800 transition-all flex flex-col justify-between space-y-6 ${branch.is_active === false ? 'opacity-70 bg-zinc-950/30' : ''}`}>
                            <div className="space-y-3">
                                <div className="flex justify-between items-start gap-4">
                                    <div>
                                        <h3 className="font-bold text-white text-lg tracking-tight truncate">{branch.name}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${branch.is_active !== false ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                                                {branch.is_active !== false ? 'ACTIVE' : 'INACTIVE'}
                                            </span>
                                            {branch.deactivation_reason && (
                                                <span className="text-[10px] text-zinc-500 font-mono truncate" title={branch.deactivation_reason}>
                                                    {branch.deactivation_reason}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => handleOpenEditModel(branch)}
                                            className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
                                            title="Edit Branch"
                                        >
                                            <Edit2 size={13} />
                                        </button>
                                        {branch.is_active !== false ? (
                                            <button
                                                onClick={() => handleDeactivate(branch.id, branch.name)}
                                                className="p-1.5 rounded-lg hover:bg-amber-500/10 text-zinc-500 hover:text-amber-400 transition-colors cursor-pointer"
                                                title="Deactivate Branch"
                                            >
                                                <ShieldOff size={13} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleReactivate(branch.id, branch.name)}
                                                className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-zinc-500 hover:text-emerald-400 transition-colors cursor-pointer"
                                                title="Reactivate Branch"
                                            >
                                                <ShieldCheck size={13} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2 text-xs font-medium text-zinc-500">
                                    <div className="flex items-start gap-2">
                                        <MapPin size={14} className="shrink-0 text-zinc-650 mt-0.5" />
                                        <span className="leading-relaxed">{branch.address}</span>
                                    </div>
                                    {branch.phone && (
                                        <div className="flex items-center gap-2">
                                            <Phone size={14} className="shrink-0 text-zinc-650" />
                                            <span>{branch.phone}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Editor Modal */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fadeIn bg-blur-sm">
                    <div className="bg-[#0a0a0a] border border-zinc-900/80 rounded-2xl w-full max-w-lg overflow-hidden animate-slideUp">
                        <div className="px-6 py-4 border-b border-zinc-900/80 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-white">
                                {editingId ? 'Edit Branch details' : 'Register New Branch'}
                            </h2>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Branch Name *</label>
                                <input
                                    type="text"
                                    placeholder="e.g. London Office, Chicago Branch"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Branch Phone (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="Phone number"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                    className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Address *</label>
                                <textarea
                                    rows={3}
                                    placeholder="Full office location address"
                                    value={address}
                                    onChange={e => setAddress(e.target.value)}
                                    className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors resize-none"
                                />
                            </div>

                            <div className="pt-4 border-t border-zinc-900/60 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="bg-transparent hover:bg-zinc-900 text-zinc-400 hover:text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                                >
                                    {editingId ? 'Save Changes' : 'Create Branch'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
