import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { adminApi } from '@/services/api';
import type { Customer } from '@/services/api';
import { Search, Loader2, Trash2, ChevronLeft, ChevronRight, Users, X, History, Building2, Eye, Edit3, ShieldCheck, Mail, Phone, MapPin, Upload, KeyRound, ExternalLink, Activity } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { appConfig } from '@/config/appConfig';

export default function CustomerManagement() {
    const { token } = useAuth();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [companies, setCompanies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [searchParams, setSearchParams] = useSearchParams();
    const urlType = searchParams.get('type') === 'company' ? 'company' : 'individual';
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [activeTab, setActiveTab] = useState<'individual' | 'company'>(urlType);
    const [selectedRole, setSelectedRole] = useState<string>('');

    useEffect(() => {
        const type = searchParams.get('type') === 'company' ? 'company' : 'individual';
        const action = searchParams.get('action');

        if (type !== activeTab) {
            setActiveTab(type);
            setPage(1);
            setSearch('');
            setAppliedSearch('');
            setSelectedRole('');
        }

        if (action === 'create' && type === 'company') {
            setShowCreateModal(true);
        } else {
            setShowCreateModal(false);
        }
    }, [searchParams]);

    // Stats & Creation
    const [companyStats, setCompanyStats] = useState<any>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [companyPayload, setCompanyPayload] = useState({ name: '', email: '', phone: '', password: '' });
    const [creatingCompany, setCreatingCompany] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState<number | null>(null);

    // Edit Company Modal
    const [showEditModal, setShowEditModal] = useState<any>(null);
    const [editPayload, setEditPayload] = useState({
        name: '', email: '', phone: '', contact_person: '', address: '', gst_number: '', website_url: '',
        company_logo: '', company_type: 'Business', notes: '', amc_status: 'Inactive', assigned_technician_id: ''
    });
    const [updatingCompany, setUpdatingCompany] = useState(false);
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [uploadingLogo, setUploadingLogo] = useState(false);

    // Password reset modal states
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetUser, setResetUser] = useState<any>(null);
    const [newPassword, setNewPassword] = useState('');
    const [resetLoading, setResetLoading] = useState(false);

    const handleResetPasswordClick = (user: any) => {
        setResetUser(user);
        setNewPassword('');
        setShowResetModal(true);
    };

    const handleResetPasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPassword || newPassword.length < 8) {
            toast.error('Password must be at least 8 characters long.');
            return;
        }

        setResetLoading(true);
        try {
            const res = await adminApi.resetUserPassword(token || '', resetUser.id, newPassword);
            if (res.ok) {
                toast.success(`Password reset successfully for ${resetUser.company_name || resetUser.name}!`);
                setShowResetModal(false);
                setResetUser(null);
                setNewPassword('');
            } else {
                toast.error(res.error || 'Failed to reset password. Please try again.');
            }
        } catch (err) {
            toast.error('An unexpected network error occurred.');
            console.error(err);
        } finally {
            setResetLoading(false);
        }
    };

    useEffect(() => {
        if (!token) return;
        const fetchTechs = async () => {
            const res = await adminApi.getCustomers(token, 1, 100, '', 'technician');
            if (res.ok && res.data) {
                setTechnicians(res.data.data?.data || []);
            }
        };
        fetchTechs();
    }, [token]);

    const getMediaUrl = (filename: string) => {
        if (!filename) return '';
        if (filename.startsWith('http://') || filename.startsWith('https://')) return filename;
        return `${appConfig.apiUrl}/uploads/${filename}`;
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !token) return;

        setUploadingLogo(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const apiRes = await fetch(`${appConfig.apiUrl}/api/admin/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            const res = await apiRes.json();
            if (res.success && res.data) {
                setEditPayload(p => ({ ...p, company_logo: res.data.filename }));
                toast.success('Logo uploaded successfully!');
            } else {
                toast.error(res.message || 'Failed to upload logo');
            }
        } catch (err) {
            toast.error('Failed to upload logo');
        } finally {
            setUploadingLogo(false);
        }
    };

    // 360 Slide-over Details Panel
    const [selectedCompany, setSelectedCompany] = useState<any>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsTab, setDetailsTab] = useState<'overview' | 'employees' | 'devices' | 'tickets' | 'billing' | 'timeline'>('overview');

    // Individual standard History Modal
    const [historyModal, setHistoryModal] = useState<{ id: number; name: string; data: any[] } | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);

    const [appliedSearch, setAppliedSearch] = useState('');

    const fetchData = async (targetPage = page, targetSearch = appliedSearch, targetRole = selectedRole) => {
        if (!token) return;
        setLoading(true);
        if (activeTab === 'individual') {
            const res = await adminApi.getCustomers(token, targetPage, 10, targetSearch, targetRole);
            if (res.ok && res.data) {
                setCustomers(res.data.data?.data || []);
                setTotalPages(res.data.data?.pagination?.totalPages || 1);
            }
        } else {
            const res = await adminApi.getCompanies(token, targetPage, 10, targetSearch);
            if (res.ok && res.data) {
                setCompanies(res.data.data?.data || []);
                setTotalPages(res.data.data?.pagination?.totalPages || 1);
            }
            const statsRes = await adminApi.getCompanyStats(token);
            if (statsRes.ok && statsRes.data) {
                setCompanyStats(statsRes.data.data);
            }
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData(page, appliedSearch, selectedRole);
    }, [token, activeTab, page, appliedSearch, selectedRole]);

    const handleTabChange = (tab: 'individual' | 'company') => {
        setActiveTab(tab);
        setSearchParams({ type: tab });
        setPage(1);
        setSearch('');
        setAppliedSearch('');
        setSelectedRole('');
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setAppliedSearch(search);
        setPage(1);
    };

    const handleDelete = async (id: number, name: string) => {
        if (!token || !confirm(`Delete customer "${name}"? This cannot be undone.`)) return;
        setDeleteLoading(id);
        const res = await adminApi.deleteCustomer(token, id);
        if (res.ok) {
            fetchData();
        }
        setDeleteLoading(null);
    };

    const handleToggleStatus = async (id: number, currentActive: boolean | number) => {
        if (!token) return;
        const nextActive = currentActive ? false : true;
        const res = await adminApi.toggleCompanyStatus(token, id, nextActive);
        if (res.ok) {
            setCompanies(prev => prev.map(c => c.id === id ? { ...c, is_active: nextActive ? 1 : 0 } : c));
        } else {
            toast.error(res.error || 'Failed to toggle status');
        }
    };

    const handleCreateCompany = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        if (!companyPayload.password || companyPayload.password.length < 8) {
            toast.error('Password must be at least 8 characters long.');
            return;
        }

        setCreatingCompany(true);
        const res = await adminApi.createCompany(token, companyPayload);
        if (res.ok) {
            toast.success('Company created successfully!');
            setShowCreateModal(false);
            setCompanyPayload({ name: '', email: '', phone: '', password: '' });
            fetchData();
        } else {
            toast.error(res.error || 'Failed to create company');
        }
        setCreatingCompany(false);
    };

    const handleCloseCreateModal = () => {
        setShowCreateModal(false);
        if (searchParams.get('action') === 'create') {
            searchParams.delete('action');
            setSearchParams(searchParams);
        }
    };

    const handleEditClick = (company: any) => {
        setShowEditModal(company);
        setEditPayload({
            name: company.company_name || company.name || '',
            email: company.email || '',
            phone: company.phone || company.phone_number || '',
            contact_person: company.contact_person || '',
            address: company.address || '',
            gst_number: company.gst_number || '',
            website_url: company.website_url || '',
            company_logo: company.company_logo || '',
            company_type: company.company_type || 'Business',
            notes: company.notes || '',
            amc_status: company.amc_status || 'Inactive',
            assigned_technician_id: company.assigned_technician_id || ''
        });
    };

    const handleUpdateCompany = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token || !showEditModal) return;
        setUpdatingCompany(true);
        const res = await adminApi.updateCompany(token, showEditModal.id, editPayload);
        if (res.ok) {
            toast.success('Company updated successfully!');
            setShowEditModal(null);
            fetchData();
        } else {
            toast.error(res.error || 'Failed to update company');
        }
        setUpdatingCompany(false);
    };

    const view360Details = async (id: number) => {
        if (!token) return;
        setDetailsLoading(true);
        setDetailsTab('overview');
        const res = await adminApi.getCompanyDetails(token, id);
        if (res.ok && res.data) {
            setSelectedCompany(res.data.data);
        } else {
            toast.error(res.error || 'Failed to load details');
        }
        setDetailsLoading(false);
    };

    const viewHistory = async (id: number, name: string) => {
        if (!token) return;
        setHistoryLoading(true);
        const res = await adminApi.getCustomerHistory(token, id);
        setHistoryModal({ id, name, data: res.ok && res.data ? (res.data as any).data || [] : [] });
        setHistoryLoading(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight flex items-center gap-2">
                        <Users size={24} className="text-neon-cyan" />
                        User & Corporate Directory
                    </h1>
                    <p className="text-xs text-zinc-500 mt-1">Manage individual customers and corporate fleets from a unified commands post.</p>
                </div>
                {/* {activeTab === 'company' && (
                    <button onClick={() => setShowCreateModal(true)} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer">
                        <Building2 size={16} /> Register Corporate Client
                    </button>
                )} */}
            </div>

            {/* B2B Stats Header widget */}
            {activeTab === 'company' && companyStats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4">
                        <h4 className="text-[10px] uppercase font-mono text-zinc-500">Total Companies</h4>
                        <p className="text-xl font-bold font-mono text-white mt-1">{companyStats.totalCompanies || 0}</p>
                        <div className="text-[9px] text-zinc-600 mt-1">
                            {companyStats.activeCompanies || 0} active &bull; {companyStats.inactiveCompanies || 0} inactive
                        </div>
                    </div>
                    <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4">
                        <h4 className="text-[10px] uppercase font-mono text-zinc-500">Active Repair Fleet</h4>
                        <p className="text-xl font-bold font-mono text-white mt-1">{companyStats.totalCompanyTickets || 0}</p>
                        <div className="text-[9px] text-orange-400 mt-1">
                            {companyStats.statusCounts?.pending || 0} pending &bull; {companyStats.statusCounts?.inProgress || 0} in progress
                        </div>
                    </div>
                    <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4">
                        <h4 className="text-[10px] uppercase font-mono text-zinc-500">Devices Under Repair</h4>
                        <p className="text-xl font-bold font-mono text-white mt-1">{companyStats.totalDevicesUnderRepair || 0}</p>
                        <div className="text-[9px] text-neon-cyan mt-1">Registered fleet devices</div>
                    </div>
                    <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4">
                        <h4 className="text-[10px] uppercase font-mono text-zinc-500">Done / Settled</h4>
                        <p className="text-xl font-bold font-mono text-emerald-400 mt-1">{companyStats.statusCounts?.completed || 0}</p>
                        <div className="text-[9px] text-zinc-650 mt-1">Completed repairs</div>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                {activeTab === 'individual' ? (
                    <div className="flex flex-wrap gap-2 w-full md:w-auto">
                        {[
                            { label: 'All Accounts', value: '' },
                            { label: 'Customers', value: 'customer' },
                            { label: 'Companies', value: 'company' },
                            { label: 'Technicians', value: 'technician' },
                            { label: 'Admins', value: 'admin' },
                        ].map(f => (
                            <button
                                key={f.value}
                                onClick={() => {
                                    setSelectedRole(f.value);
                                    setPage(1);
                                }}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold font-outfit transition-all cursor-pointer border ${selectedRole === f.value
                                    ? 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/30'
                                    : 'bg-zinc-900/40 text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-zinc-805'
                                    }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div />
                )}
                <form onSubmit={handleSearch} className="relative w-full md:w-80">
                    <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
                    <input type="text" placeholder="Search by name, email, phone..." value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full bg-zinc-900/40 border border-zinc-800/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/40 transition-all font-outfit" />
                </form>
            </div>

            {loading ? (
                <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="w-8 h-8 text-neon-cyan animate-spin" /></div>
            ) : (
                <div className="border border-zinc-900 bg-zinc-950/10 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                            {activeTab === 'individual' ? (
                                <>
                                    <thead>
                                        <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                                            <th className="p-4">ID</th>
                                            <th className="p-4">Customer Name</th>
                                            <th className="p-4">Account Type</th>
                                            <th className="p-4">Email Address</th>
                                            <th className="p-4">Phone Number</th>
                                            <th className="p-4">Registered Date</th>
                                            <th className="p-4 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-900/50">
                                        {customers.map(c => (
                                            <tr key={c.id} className="hover:bg-zinc-900/20 transition-all">
                                                <td className="p-4 text-xs font-mono text-neon-cyan font-bold">#{c.id}</td>
                                                <td className="p-4 text-sm text-white font-medium">{c.name}</td>
                                                <td className="p-4 text-xs">
                                                    {c.role === 'admin' && (
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-red-500/10 text-red-400 border border-red-500/25">
                                                            Admin
                                                        </span>
                                                    )}
                                                    {c.role === 'technician' && (
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                                                            Technician
                                                        </span>
                                                    )}
                                                    {c.role === 'company' && (
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/25">
                                                            Company
                                                        </span>
                                                    )}
                                                    {c.role === 'customer' && (
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-sky-500/10 text-sky-400 border border-sky-500/25">
                                                            Individual
                                                        </span>
                                                    )}
                                                    {!['admin', 'technician', 'company', 'customer'].includes(c.role || '') && (
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-zinc-800 text-zinc-400 border border-zinc-700">
                                                            {c.role || 'User'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-xs text-zinc-400">{c.email}</td>
                                                <td className="p-4 text-xs text-zinc-400 font-mono">{c.phone || '—'}</td>
                                                <td className="p-4 text-xs text-zinc-500 font-mono">{new Date(c.created_at).toLocaleDateString()}</td>
                                                <td className="p-4 text-center">
                                                    <div className="flex items-center gap-1.5 justify-center">
                                                        <button onClick={() => handleResetPasswordClick(c)} className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-805 rounded-lg text-zinc-400 hover:text-amber-400 transition-all cursor-pointer" title="Reset Password"><KeyRound size={13} /></button>
                                                        <button onClick={() => viewHistory(c.id, c.name)} className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-805 rounded-lg text-zinc-400 hover:text-neon-cyan transition-all cursor-pointer" title="History"><History size={13} /></button>
                                                        <button onClick={() => handleDelete(c.id, c.name)} disabled={deleteLoading === c.id} className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-red-400 transition-all cursor-pointer" title="Delete">
                                                            {deleteLoading === c.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </>
                            ) : (
                                <>
                                    <thead>
                                        <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                                            <th className="p-4">Company Details</th>
                                            <th className="p-4">Contact Details</th>
                                            <th className="p-4 text-center">Fleet / Devices</th>
                                            <th className="p-4 text-center">Repairs Overview</th>
                                            <th className="p-4 text-center">Assigned Tech</th>
                                            <th className="p-4 text-center">Status</th>
                                            <th className="p-4 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-900/50">
                                        {companies.map(c => (
                                            <tr key={c.id} className="hover:bg-zinc-900/25 transition-all">
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        {c.company_logo ? (
                                                            <img src={getMediaUrl(c.company_logo)} alt={c.company_name || c.name} className="w-9 h-9 rounded-xl object-contain bg-zinc-950 border border-zinc-800" />
                                                        ) : (
                                                            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 font-bold uppercase select-none">
                                                                {c.company_name?.slice(0, 2) || c.name?.slice(0, 2) || 'CO'}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                                                                {c.company_name || c.name}
                                                                <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold font-mono tracking-wider ${c.company_type === 'Corporate' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' :
                                                                    c.company_type === 'AMC' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                                                        'bg-zinc-850 text-zinc-400 border border-zinc-800'
                                                                    }`}>{c.company_type || 'Business'}</span>
                                                            </div>
                                                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">ID: #{c.id}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="text-xs font-semibold text-white">{c.contact_person || 'No Contact Defined'}</div>
                                                    <div className="text-[11px] text-zinc-400 font-mono mt-0.5">{c.email}</div>
                                                    <div className="text-[10px] text-zinc-500 font-mono">{c.phone || c.phone_number || '—'}</div>
                                                </td>
                                                <td className="p-4 text-center font-mono text-sm text-neon-cyan font-bold">{c.total_devices || 0}</td>
                                                <td className="p-4">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="flex gap-1.5">
                                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono ${c.pending_repairs > 0 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/15' : 'bg-zinc-900/50 text-zinc-500'}`}>
                                                                {c.pending_repairs || 0} Pend
                                                            </span>
                                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono ${c.in_progress_repairs > 0 ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/15' : 'bg-zinc-900/50 text-zinc-500'}`}>
                                                                {c.in_progress_repairs || 0} Prog
                                                            </span>
                                                        </div>
                                                        <div className="flex gap-1.5">
                                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono ${c.completed_repairs > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'bg-zinc-900/50 text-zinc-500'}`}>
                                                                {c.completed_repairs || 0} Done
                                                            </span>
                                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono ${c.warranty_repairs > 0 ? 'bg-pink-500/10 text-pink-400 border border-pink-500/15' : 'bg-zinc-900/50 text-zinc-500'}`}>
                                                                {c.warranty_repairs || 0} War
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.assigned_technician_name ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/25' : 'text-zinc-550 bg-zinc-900/50 border border-zinc-800'}`}>
                                                        {c.assigned_technician_name || 'Unassigned'}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <button onClick={() => handleToggleStatus(c.id, c.is_active)} className={`w-10 h-5 px-0.5 rounded-full transition-colors flex items-center cursor-pointer mx-auto ${c.is_active ? 'bg-indigo-600 justify-end' : 'bg-zinc-800 justify-start'}`}>
                                                        <span className="w-4 h-4 bg-white rounded-full shadow-md" />
                                                    </button>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className="flex items-center gap-1.5 justify-center">
                                                        <button onClick={() => view360Details(c.id)} className="p-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg text-indigo-400 transition-all cursor-pointer font-semibold text-xs flex items-center gap-1" title="360° Portal">
                                                            <button onClick={() => handleResetPasswordClick(c)} className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-805 rounded-lg text-zinc-400 hover:text-amber-400 transition-all cursor-pointer" title="Reset Password"><KeyRound size={12} /></button>
                                                            <Eye size={12} />
                                                        </button>
                                                        <button onClick={() => handleResetPasswordClick(c)} className="p-2 bg-zinc-909 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-400 hover:text-amber-400 transition-all cursor-pointer" title="Reset Password">
                                                            <KeyRound size={12} />
                                                        </button>
                                                        <button onClick={() => handleEditClick(c)} className="p-2 bg-zinc-905 hover:bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-all cursor-pointer" title="Edit Profile">
                                                            <Edit3 size={12} />
                                                        </button>
                                                        <button onClick={() => handleDelete(c.id, c.company_name || c.name)} className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-red-500 transition-all cursor-pointer" title="Delete">
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </>
                            )}
                        </table>
                    </div>
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-zinc-805 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"><ChevronLeft size={16} /></button>
                    <span className="text-xs font-mono text-zinc-500">Page {page} of {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg border border-zinc-805 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"><ChevronRight size={16} /></button>
                </div>
            )}

            {/* Create Company Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleCloseCreateModal}>
                    <div className="bg-[#0b0b0b] border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
                            <h3 className="text-white font-bold font-outfit">Register Corporate Client</h3>
                            <button onClick={handleCloseCreateModal} className="text-zinc-500 hover:text-white cursor-pointer"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleCreateCompany} className="p-5 space-y-4">
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-500 mb-1">Company Name</label>
                                <input type="text" required value={companyPayload.name} onChange={e => setCompanyPayload(p => ({ ...p, name: e.target.value }))}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-500 mb-1">Admin Email</label>
                                <input type="email" required value={companyPayload.email} onChange={e => setCompanyPayload(p => ({ ...p, email: e.target.value }))}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-500 mb-1">Password</label>
                                <input type="password" required value={companyPayload.password} onChange={e => setCompanyPayload(p => ({ ...p, password: e.target.value }))}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-500 mb-1">Phone Number (Optional)</label>
                                <input type="text" value={companyPayload.phone} onChange={e => setCompanyPayload(p => ({ ...p, phone: e.target.value }))}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors" />
                            </div>
                            <div className="pt-2 flex justify-end gap-3">
                                <button type="button" onClick={handleCloseCreateModal} className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer">Cancel</button>
                                <button type="submit" disabled={creatingCompany} className="bg-indigo-650 hover:bg-indigo-600 text-white px-5 py-2 rounded-lg text-xs font-semibold transition-colors disabled:cursor-not-allowed">
                                    {creatingCompany ? <Loader2 size={14} className="animate-spin" /> : 'Register'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Company Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowEditModal(null)}>
                    <div className="bg-[#0b0b0b] border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
                            <h3 className="text-white font-bold font-outfit text-sm">Edit Company Profile: {showEditModal.company_name || showEditModal.name}</h3>
                            <button onClick={() => setShowEditModal(null)} className="text-zinc-500 hover:text-white cursor-pointer"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleUpdateCompany} className="p-5 space-y-3">
                            <div className="flex items-center gap-3 bg-zinc-950/40 p-3 rounded-xl border border-zinc-900">
                                {editPayload.company_logo ? (
                                    <img src={getMediaUrl(editPayload.company_logo)} alt="Logo Preview" className="w-12 h-12 rounded-lg object-contain bg-zinc-950 border border-zinc-850" />
                                ) : (
                                    <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-650 uppercase font-mono text-[9px]">No Logo</div>
                                )}
                                <div className="flex-1">
                                    <label className="block text-[9px] font-mono uppercase text-zinc-550 mb-1">Company Logo</label>
                                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 hover:text-white border border-zinc-800 text-[10px] font-semibold text-zinc-400 transition-all cursor-pointer">
                                        <Upload size={10} />
                                        {uploadingLogo ? 'Uploading...' : 'Choose Logo'}
                                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1">Company / Legal Name</label>
                                <input type="text" required value={editPayload.name} onChange={e => setEditPayload(p => ({ ...p, name: e.target.value }))}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1">Company Type</label>
                                    <select value={editPayload.company_type} onChange={e => setEditPayload(p => ({ ...p, company_type: e.target.value }))}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500">
                                        <option value="Business">Business</option>
                                        <option value="Corporate">Corporate</option>
                                        <option value="AMC">AMC Client</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1">AMC Status</label>
                                    <select value={editPayload.amc_status} onChange={e => setEditPayload(p => ({ ...p, amc_status: e.target.value }))}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500">
                                        <option value="Inactive">Inactive</option>
                                        <option value="Active">Active</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1">Assigned Dedicated Technician</label>
                                <select value={editPayload.assigned_technician_id} onChange={e => setEditPayload(p => ({ ...p, assigned_technician_id: e.target.value }))}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500">
                                    <option value="">No Dedicated Technician</option>
                                    {technicians.map(t => (
                                        <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1">Email</label>
                                    <input type="email" required value={editPayload.email} onChange={e => setEditPayload(p => ({ ...p, email: e.target.value }))}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1">Phone</label>
                                    <input type="text" value={editPayload.phone} onChange={e => setEditPayload(p => ({ ...p, phone: e.target.value }))}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1">Contact Person Name</label>
                                <input type="text" value={editPayload.contact_person} onChange={e => setEditPayload(p => ({ ...p, contact_person: e.target.value }))}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1">GST/VAT Number (Optional)</label>
                                <input type="text" placeholder="e.g. 27AAAAA1111A1Z1" value={editPayload.gst_number} onChange={e => setEditPayload(p => ({ ...p, gst_number: e.target.value }))}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1">Website URL</label>
                                <input type="text" placeholder="e.g. www.clientcorp.com" value={editPayload.website_url} onChange={e => setEditPayload(p => ({ ...p, website_url: e.target.value }))}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1">Registered Address</label>
                                <textarea rows={2} value={editPayload.address} onChange={e => setEditPayload(p => ({ ...p, address: e.target.value }))}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1">Internal Notes / Remarks</label>
                                <textarea rows={2} placeholder="Add private details or account terms..." value={editPayload.notes} onChange={e => setEditPayload(p => ({ ...p, notes: e.target.value }))}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div className="pt-2 flex justify-end gap-2">
                                <button type="button" onClick={() => setShowEditModal(null)} className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer">Cancel</button>
                                <button type="submit" disabled={updatingCompany} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-xs font-semibold transition-colors disabled:cursor-not-allowed">
                                    {updatingCompany ? <Loader2 size={12} className="animate-spin" /> : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Individual History Modal */}
            {historyModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setHistoryModal(null)}>
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-zinc-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-white font-bold font-outfit text-lg">Repair History — {historyModal.name}</h3>
                                {!historyLoading && historyModal.data && (
                                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs font-mono">
                                        <span className="text-neon-cyan">Total Booked: {historyModal.data.length}</span>
                                        <span className="text-emerald-400">Done: {historyModal.data.filter((r: any) => r.status === 'completed').length}</span>
                                        <span className="text-amber-400">Active: {historyModal.data.filter((r: any) => r.status === 'in_progress' || r.status === 'pending').length}</span>
                                        <span className="text-red-400">Voided: {historyModal.data.filter((r: any) => r.status === 'cancelled').length}</span>
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setHistoryModal(null)} className="text-zinc-500 hover:text-white cursor-pointer self-end md:self-auto"><X size={18} /></button>
                        </div>
                        <div className="p-5 max-h-[60vh] overflow-y-auto">
                            {historyLoading ? <Loader2 className="w-6 h-6 text-neon-cyan animate-spin mx-auto" /> : historyModal.data.length === 0 ? (
                                <p className="text-zinc-500 text-sm text-center">No repair requests registered.</p>
                            ) : (
                                <div className="space-y-3">
                                    {historyModal.data.map((r: any) => (
                                        <div key={r.id} className="border border-zinc-900 bg-zinc-950/40 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-zinc-800 transition-colors">
                                            <div className="flex-1 space-y-1">
                                                <div className="text-[11px] font-mono text-neon-cyan font-bold tracking-wider">{r.ticketNumber || `#${r.id}`}</div>
                                                <div className="text-sm text-white font-semibold">{r.deviceCategory} — {r.brand} {r.modelNumber && `(${r.modelNumber})`}</div>
                                                <div className="text-xs text-zinc-400 font-medium">{r.problemType}</div>

                                                <div className="flex flex-col gap-1 mt-2 text-[10px] font-mono text-zinc-500">
                                                    <span className="flex items-center gap-1.5">Tech: <span className="text-zinc-300">{r.technicianName || 'Unassigned'}</span></span>
                                                    {r.customerRepairDescription && <span className="flex items-center gap-1.5 text-neon-cyan/80"><Activity size={10} /> Notes: <span className="italic line-clamp-1">{r.customerRepairDescription}</span></span>}
                                                </div>
                                            </div>
                                            <div className="flex md:flex-col items-center md:items-end justify-between w-full md:w-auto gap-3">
                                                <div className="text-right flex flex-col items-start md:items-end">
                                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider ${r.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                        r.status === 'cancelled' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                                                            'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20'}`}>{r.status?.replace('_', ' ')}</span>
                                                    <div className="text-[10px] text-zinc-500 font-mono mt-1.5">{new Date(r.createdAt).toLocaleDateString()}</div>
                                                </div>
                                                <Link
                                                    to={`/admin/repair-tickets?id=${r.ticketNumber || r.id}`}
                                                    className="px-3 py-1.5 bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan rounded-lg hover:border-neon-cyan hover:bg-neon-cyan/20 transition-colors flex items-center gap-2 cursor-pointer font-bold text-[10px] tracking-wider uppercase"
                                                    title="View Full Ticket Details"
                                                >
                                                    View <ExternalLink size={12} />
                                                </Link>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 360 Slide-over Details Panel */}
            {selectedCompany && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs font-outfit" onClick={() => setSelectedCompany(null)}>
                    <div className="w-full max-w-3xl h-full bg-[#09090b] border-l border-zinc-900 text-white shadow-2xl flex flex-col p-6 overflow-hidden transform transition-transform" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold uppercase text-lg select-none">
                                    {selectedCompany.profile?.company_name?.slice(0, 2) || 'CO'}
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
                                        {selectedCompany.profile?.company_name}
                                        {selectedCompany.profile?.is_active && <ShieldCheck size={16} className="text-indigo-400" />}
                                    </h2>
                                    <span className="text-[10px] font-mono text-zinc-500">Corporate Account Oversight Dashboard</span>
                                </div>
                            </div>
                            <button onClick={() => setSelectedCompany(null)} className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white cursor-pointer">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Top overview stats */}
                        <div className="grid grid-cols-5 gap-3 mt-4 text-center">
                            <div className="bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-900">
                                <span className="text-[9px] uppercase font-mono text-zinc-500 block">Branches</span>
                                <span className="text-base font-bold font-mono text-white mt-0.5 block">{selectedCompany.branches?.length || 0}</span>
                            </div>
                            <div className="bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-900">
                                <span className="text-[9px] uppercase font-mono text-zinc-500 block">Employees</span>
                                <span className="text-base font-bold font-mono text-white mt-0.5 block">{selectedCompany.employees?.length || 0}</span>
                            </div>
                            <div className="bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-900">
                                <span className="text-[9px] uppercase font-mono text-zinc-500 block">Total Devices</span>
                                <span className="text-base font-bold font-mono text-white mt-0.5 block">{selectedCompany.devices?.length || 0}</span>
                            </div>
                            <div className="bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-900">
                                <span className="text-[9px] uppercase font-mono text-zinc-500 block">Active Tickets</span>
                                <span className="text-base font-bold font-mono text-orange-400 mt-0.5 block">
                                    {selectedCompany.tickets?.filter((t: any) => t.status !== 'completed' && t.status !== 'cancelled').length || 0}
                                </span>
                            </div>
                            <div className="bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-900">
                                <span className="text-[9px] uppercase font-mono text-zinc-500 block">Done Repairs</span>
                                <span className="text-base font-bold font-mono text-emerald-400 mt-0.5 block">
                                    {selectedCompany.tickets?.filter((t: any) => t.status === 'completed').length || 0}
                                </span>
                            </div>
                        </div>

                        {/* Detail Category Navigation tabs */}
                        <div className="mt-4 flex border-b border-zinc-900 p-0.5 bg-zinc-950/20 rounded-xl">
                            {(['overview', 'employees', 'devices', 'tickets', 'billing', 'timeline'] as const).map(tab => (
                                <button key={tab} onClick={() => setDetailsTab(tab)}
                                    className={`flex-1 py-2 text-[10px] font-mono uppercase tracking-wider rounded-lg transition-all cursor-pointer ${detailsTab === tab ? 'bg-indigo-650 text-white font-bold' : 'text-zinc-500 hover:text-white'}`}>
                                    {tab}
                                </button>
                            ))}
                        </div>

                        {/* Detail panels view area */}
                        <div className="flex-1 overflow-y-auto mt-4 pr-1 text-xs text-zinc-300">
                            {detailsTab === 'overview' && (
                                <div className="space-y-4">
                                    <div className="bg-zinc-950/40 p-4 border border-zinc-900 rounded-xl space-y-2">
                                        <h3 className="text-sm font-semibold text-white mb-2 font-mono">Company Metadata</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            {selectedCompany.profile?.company_logo && (
                                                <div className="col-span-2 flex items-center justify-center p-4 bg-zinc-950 rounded-xl border border-zinc-900">
                                                    <img src={getMediaUrl(selectedCompany.profile.company_logo)} alt="Company Logo" className="max-h-16 object-contain" />
                                                </div>
                                            )}
                                            <div>
                                                <span className="text-[10px] text-zinc-500 font-medium">Company Type</span>
                                                <p className="text-white font-semibold mt-0.5">{selectedCompany.profile?.company_type || 'Business'}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-zinc-500 font-medium">AMC Status</span>
                                                <p className="text-white font-semibold mt-0.5">{selectedCompany.profile?.amc_status || 'Inactive'}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-zinc-500 font-medium">Dedicated Lead Tech</span>
                                                <p className="text-indigo-400 font-semibold mt-0.5">{selectedCompany.profile?.assigned_technician_name || 'No Lead Tech Assigned'}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-zinc-500 font-medium">Contact Person</span>
                                                <p className="text-white font-semibold mt-0.5">{selectedCompany.profile?.contact_person || '—'}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-zinc-500 font-medium">GST Registration Number</span>
                                                <p className="text-white font-mono mt-0.5">{selectedCompany.profile?.gst_number || '—'}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-zinc-500 font-medium">Corporate Email</span>
                                                <p className="text-white font-mono mt-0.5">{selectedCompany.profile?.email || selectedCompany.profile?.contact_email || '—'}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-zinc-500 font-medium">Website URL</span>
                                                <a href={selectedCompany.profile?.website_url ? (selectedCompany.profile.website_url.startsWith('http') ? selectedCompany.profile.website_url : `https://${selectedCompany.profile.website_url}`) : '#'} target="_blank" rel="noopener noreferrer" className="text-indigo-400 font-mono mt-0.5 hover:underline block">{selectedCompany.profile?.website_url || '—'}</a>
                                            </div>
                                            <div className="col-span-2">
                                                <span className="text-[10px] text-zinc-500 font-medium">Physical / Head Office Address</span>
                                                <p className="text-white leading-relaxed mt-0.5">{selectedCompany.profile?.address || '—'}</p>
                                            </div>
                                            {selectedCompany.profile?.notes && (
                                                <div className="col-span-2 border-t border-zinc-900 pt-2.5">
                                                    <span className="text-[10px] text-zinc-500 font-medium block mb-1">Lead Notes / Remarks</span>
                                                    <p className="text-zinc-350 leading-relaxed whitespace-pre-wrap">{selectedCompany.profile.notes}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Branches */}
                                    <div className="bg-zinc-950/40 p-4 border border-zinc-900 rounded-xl">
                                        <h3 className="text-sm font-semibold text-white mb-2 font-mono">Branch Offices ({selectedCompany.branches?.length || 0})</h3>
                                        {selectedCompany.branches?.length === 0 ? (
                                            <p className="text-zinc-500 text-center">No branch offices declared.</p>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {selectedCompany.branches.map((b: any) => (
                                                    <div key={b.id} className="p-3 border border-zinc-900 bg-zinc-900/10 rounded-xl space-y-1">
                                                        <div className="font-semibold text-white">{b.name}</div>
                                                        <div className="text-[10px] text-zinc-400">{b.address}</div>
                                                        {b.phone && <div className="text-[9px] text-zinc-500 font-mono">Phone: {b.phone}</div>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {detailsTab === 'employees' && (
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center px-1 mb-2">
                                        <h3 className="font-mono text-white text-xs uppercase tracking-wider">Registered Corporate Staff</h3>
                                        <span className="text-[10px] text-zinc-500">{selectedCompany.employees?.length || 0} employees</span>
                                    </div>
                                    {selectedCompany.employees?.length === 0 ? (
                                        <p className="text-zinc-500 text-center py-6">No employee roster has been seeded.</p>
                                    ) : (
                                        <div className="border border-zinc-900 rounded-xl overflow-hidden divide-y divide-zinc-900 font-mono">
                                            {selectedCompany.employees.map((e: any) => (
                                                <div key={e.id} className="p-3 bg-zinc-950/20 hover:bg-zinc-900/10 flex items-center justify-between">
                                                    <div>
                                                        <div className="text-white font-semibold">{e.name}</div>
                                                        <div className="text-[10px] text-zinc-500 mt-0.5">{e.department} &bull; {e.designation}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[10px] text-zinc-400">{e.email}</div>
                                                        <div className="text-[9px] text-zinc-600 mt-1">{e.phone || '—'}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {detailsTab === 'devices' && (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center px-1">
                                        <h3 className="font-mono text-white text-xs uppercase tracking-wider">Asset Fleet</h3>
                                        <span className="text-[10px] text-zinc-500">{selectedCompany.devices?.length || 0} registered assets</span>
                                    </div>
                                    {selectedCompany.devices?.length === 0 ? (
                                        <p className="text-zinc-500 text-center py-6">No devices registered in asset log.</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {selectedCompany.devices.map((d: any) => (
                                                <div key={d.id} className="p-3 border border-zinc-900 bg-zinc-950/40 rounded-xl flex flex-col justify-between">
                                                    <div>
                                                        <div className="flex items-center justify-between">
                                                            <div className="text-white text-xs font-bold">{d.brand} {d.model_number}</div>
                                                            {d.is_amc ? (
                                                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-mono font-bold tracking-tight">AMC ({d.amc_tag || 'ACTIVE'})</span>
                                                            ) : (
                                                                <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 text-[9px] font-mono">NON-AMC</span>
                                                            )}
                                                        </div>
                                                        <div className="text-[9px] font-mono text-zinc-500 mt-1">Serial: {d.serial_number} &bull; Asset Key: {d.asset_id}</div>
                                                        {d.employee_name && <div className="text-[10px] text-zinc-450 mt-1.5 font-mono">Holder: {d.employee_name}</div>}
                                                    </div>
                                                    <div className="mt-3 pt-2 border-t border-zinc-900/60 text-[9px] font-mono text-zinc-500 flex justify-between">
                                                        <span>Branch: {d.branch_name || 'H.Q.'}</span>
                                                        <span>Exp: {d.warranty_expiry ? new Date(d.warranty_expiry).toLocaleDateString() : 'None'}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {detailsTab === 'tickets' && (
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center px-1 mb-2">
                                        <h3 className="font-mono text-white text-xs uppercase tracking-wider">Corp Repair Tickets</h3>
                                        <span className="text-[10px] text-zinc-500">{selectedCompany.tickets?.length || 0} tickets total</span>
                                    </div>
                                    {selectedCompany.tickets?.length === 0 ? (
                                        <p className="text-zinc-500 text-center py-6">No repair requests have been initiated.</p>
                                    ) : (
                                        <div className="space-y-2 font-mono">
                                            {selectedCompany.tickets.map((t: any) => (
                                                <div key={t.id} className="p-3 border border-zinc-900 bg-zinc-950/20 rounded-xl space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <div className="text-xs text-white font-bold">{t.deviceCategory} ({t.brand} {t.modelNumber})</div>
                                                            <div className="text-[9.5px] text-neon-cyan font-bold mt-0.5">#{t.ticketNumber || `REQ-${t.id}`}</div>
                                                        </div>
                                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${t.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                                                            t.status === 'in_progress' ? 'bg-orange-500/10 text-orange-400' :
                                                                t.status === 'cancelled' ? 'bg-red-500/10 text-red-400' : 'bg-neon-cyan/10 text-neon-cyan'
                                                            }`}>
                                                            {t.status?.toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-zinc-400 leading-relaxed font-sans">{t.problemDescription}</div>
                                                    <div className="grid grid-cols-3 gap-2 border-t border-zinc-900/60 pt-2 text-[9px] text-zinc-500">
                                                        <div>Staff: {t.employeeName || 'Company Admin'}</div>
                                                        <div>Tech: {t.techName || 'Unassigned'}</div>
                                                        <div>Date: {new Date(t.createdAt).toLocaleDateString()}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {detailsTab === 'billing' && (
                                <div className="space-y-4">
                                    {/* Quotations */}
                                    <div>
                                        <h3 className="font-mono text-white text-xs uppercase tracking-wider mb-2">Quotations</h3>
                                        {selectedCompany.quotations?.length === 0 ? (
                                            <p className="text-zinc-550 text-center py-4">No quotations drafted.</p>
                                        ) : (
                                            <div className="border border-zinc-900 rounded-xl overflow-hidden divide-y divide-zinc-900 font-mono">
                                                {selectedCompany.quotations.map((q: any) => (
                                                    <div key={q.id} className="p-3 bg-zinc-950/20 flex items-center justify-between">
                                                        <div>
                                                            <div className="text-white font-bold">{q.title}</div>
                                                            <div className="text-[10px] text-zinc-550 mt-1">Ref: #{q.id} &bull; Date: {new Date(q.created_at).toLocaleDateString()}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-white font-bold text-xs">INR {parseFloat(q.amount).toLocaleString()}</div>
                                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase mt-1 ${q.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                                                {q.status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Invoices */}
                                    <div>
                                        <h3 className="font-mono text-white text-xs uppercase tracking-wider mb-2 font-bold">Billing & Invoices</h3>
                                        {selectedCompany.invoices?.length === 0 ? (
                                            <p className="text-zinc-550 text-center py-4">No billing records found.</p>
                                        ) : (
                                            <div className="border border-zinc-900 rounded-xl overflow-hidden divide-y divide-zinc-900 font-mono">
                                                {selectedCompany.invoices.map((inv: any) => (
                                                    <div key={inv.id} className="p-3 bg-zinc-950/20 flex items-center justify-between">
                                                        <div>
                                                            <div className="text-white font-bold">{inv.id}</div>
                                                            <div className="text-[10px] text-zinc-500 mt-1">Due: {new Date(inv.due_date).toLocaleDateString()}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-indigo-400 font-bold text-xs">INR {parseFloat(inv.amount).toLocaleString()}</div>
                                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase mt-1 ${inv.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-500'}`}>
                                                                {inv.status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {detailsTab === 'timeline' && (
                                <div className="space-y-4 font-mono">
                                    <h3 className="font-mono text-white text-xs uppercase tracking-wider mb-2">Corporate Activity Audit Log</h3>
                                    {selectedCompany.activityLogs?.length === 0 ? (
                                        <p className="text-zinc-500 text-center py-6">No audits recorded.</p>
                                    ) : (
                                        <div className="relative pl-4 border-l border-zinc-850 space-y-4 py-2">
                                            {selectedCompany.activityLogs.map((log: any) => (
                                                <div key={log.id} className="relative group text-[10px]">
                                                    <div className="absolute -left-[20.5px] top-1 w-2.5 h-2.5 rounded-full border border-indigo-500 bg-zinc-950" />
                                                    <div className="text-zinc-400 font-semibold">{log.action?.replaceAll('_', ' ')?.toUpperCase()}</div>
                                                    <div className="text-zinc-500 mt-0.5">{log.details ? JSON.stringify(log.details) : 'Executed by client gateway'}</div>
                                                    <div className="text-[9px] text-zinc-650 mt-1 font-semibold">{new Date(log.created_at).toLocaleString()}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Custom password reset modal for users/companies */}
            {showResetModal && resetUser && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowResetModal(false); setResetUser(null); }}>
                    <div className="bg-[#0b0b0b] border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
                            <h3 className="text-white font-bold font-outfit flex items-center gap-2">
                                <KeyRound className="w-5 h-5 text-amber-500" />
                                Reset Account Password
                            </h3>
                            <button onClick={() => { setShowResetModal(false); setResetUser(null); }} className="text-zinc-500 hover:text-white cursor-pointer"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleResetPasswordSubmit} className="p-5 space-y-4">
                            <div className="bg-zinc-950/40 border border-zinc-900/60 rounded-xl p-3.5 space-y-1">
                                <div className="text-[10px] uppercase font-mono text-zinc-500">Target Account</div>
                                <div className="text-sm font-bold text-white">{resetUser.company_name || resetUser.name}</div>
                                <div className="text-xs text-zinc-400 font-mono mt-0.5">{resetUser.email}</div>
                                <div className="text-[10px] text-zinc-500 font-mono">Role: {resetUser.role?.toUpperCase()}</div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-500 mb-1">New Password</label>
                                <input
                                    type="password"
                                    placeholder="Enter new 8+ character password"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    required
                                    className="w-full bg-zinc-900/40 border border-zinc-800/80 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/40 transition-all font-outfit"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => { setShowResetModal(false); setResetUser(null); }}
                                    className="flex-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-white py-2.5 rounded-xl text-xs font-semibold font-outfit transition-all cursor-pointer">
                                    Cancel
                                </button>
                                <button type="submit" disabled={resetLoading}
                                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-black py-2.5 rounded-xl text-xs font-semibold font-outfit transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
                                    {resetLoading ? <Loader2 size={13} className="animate-spin" /> : 'Reset Password'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
