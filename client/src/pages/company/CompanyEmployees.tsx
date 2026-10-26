import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCompanyContext } from '../../context/CompanyContext';
import { companyApi } from '../../services/api';
import {
    Users, Mail, Phone, Plus, Edit2, ShieldOff, ShieldCheck, X,
    PlusCircle, Building, Briefcase, Upload, Download, Search,
    FileDown, CheckCircle2, AlertCircle, Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import PhoneInput from '@/components/PhoneInput';
import { PromptModal } from '@/components/PromptModal';
import { NAME_MAX_LENGTH, validateName } from '@/config/constants';
import { parsePhoneNumber, validatePhoneNumber, DEFAULT_COUNTRY } from '@/utils/phoneUtils';
import { SkeletonTable } from '@/components/Skeleton';

interface Branch {
    id: number;
    name: string;
}

interface Employee {
    id: number;
    name: string;
    email: string;
    phone: string;
    department: string;
    designation: string;
    branch_id: number;
    branch_name: string;
    is_active?: boolean | number;
    status?: string;
    deactivation_reason?: string;
}

const isEmployeeActive = (emp: Employee): boolean => {
    if (emp.status === 'inactive') return false;
    if (emp.is_active === false || (emp.is_active as any) === 0 || (emp.is_active as any) === '0') return false;
    return true;
};

export default function CompanyEmployees() {
    const { token } = useAuth();
    const { selectedCompanyId, isAdminManagingCompany, loadingCompanies } = useCompanyContext();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');
    const [searchQuery, setSearchQuery] = useState('');

    // Form states
    const [isOpen, setIsOpen] = useState(false);
    const [isBulkOpen, setIsBulkOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [department, setDepartment] = useState('');
    const [designation, setDesignation] = useState('');
    const [branchId, setBranchId] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formErrors, setFormErrors] = useState<{ name?: string; email?: string; phone?: string; department?: string; designation?: string; general?: string }>({});
    const [bulkError, setBulkError] = useState('');
    const [bulkErrors, setBulkErrors] = useState<Array<{ row: number; field: string; error: string; suggestion?: string }>>([]);
    const [deactivateModal, setDeactivateModal] = useState<{ id: number; empName: string } | null>(null);
    const [deactivateLoading, setDeactivateLoading] = useState(false);

    // Bulk Import & Export state
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchData = async () => {
        if (!token) return;
        if (isAdminManagingCompany && !selectedCompanyId && !loadingCompanies) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [empRes, branchRes] = await Promise.all([
                companyApi.getEmployees(token),
                companyApi.getBranches(token)
            ]);

            if (empRes.ok && empRes.data) setEmployees(empRes.data.data || []);
            if (branchRes.ok && branchRes.data) setBranches(branchRes.data.data || []);
        } catch {
            setError('Failed to fetch employees or branches data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAdminManagingCompany && loadingCompanies) return;
        fetchData();
    }, [token, selectedCompanyId, loadingCompanies]);

    const handleOpenCreateModel = () => {
        setName('');
        setEmail('');
        setPhone('');
        setDepartment('');
        setDesignation('');
        setBranchId('');
        setFormErrors({});
        setEditingId(null);
        setIsOpen(true);
    };

    const handleOpenEditModel = (emp: Employee) => {
        setName(emp.name);
        setEmail(emp.email);
        setPhone(emp.phone || '');
        setDepartment(emp.department || '');
        setDesignation(emp.designation || '');
        setBranchId(emp.branch_id ? String(emp.branch_id) : '');
        setFormErrors({});
        setEditingId(emp.id);
        setIsOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;

        const errors: { name?: string; email?: string; phone?: string; department?: string; designation?: string; general?: string } = {};

        const nameVal = validateName(name, 'Employee name');
        if (!nameVal.isValid) {
            errors.name = nameVal.error || 'Please enter a valid employee name.';
        }

        if (!email.trim()) {
            errors.email = 'Employee email is required.';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            errors.email = 'Please enter a valid email address.';
        }

        if (phone.trim()) {
            const { country, nationalNumber } = parsePhoneNumber(phone.trim(), DEFAULT_COUNTRY);
            const val = validatePhoneNumber(nationalNumber, country);
            if (!val.isValid) {
                errors.phone = val.error || 'Please enter a valid phone number.';
            }
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                name,
                email,
                phone: phone || undefined,
                department: department || undefined,
                designation: designation || undefined,
                branchId: branchId ? Number(branchId) : undefined
            };

            const res = editingId
                ? await companyApi.updateEmployee(token || '', editingId, payload)
                : await companyApi.createEmployee(token || '', payload);

            if (res.ok) {
                setSuccess(editingId ? 'Employee updated successfully!' : 'Employee registered successfully!');
                setIsOpen(false);
                setFormErrors({});
                fetchData();
            } else {
                const serverErrors = (res.data as any)?.errors || {};
                setFormErrors({
                    name: serverErrors.name,
                    email: serverErrors.email,
                    phone: serverErrors.phone,
                    department: serverErrors.department,
                    designation: serverErrors.designation,
                    general: res.error || (res.data as any)?.message || 'Failed to submit employee data.'
                });
            }
        } catch {
            setFormErrors({ general: 'Failed to submit employee data. Please try again.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeactivate = (id: number, empName: string) => {
        setDeactivateModal({ id, empName });
    };

    const handleConfirmDeactivate = async (reason: string) => {
        if (!token || !deactivateModal) return;
        setError('');
        setSuccess('');
        setDeactivateLoading(true);

        try {
            const res = await companyApi.deleteEmployee(token, deactivateModal.id, reason.trim() || undefined);
            if (res.ok) {
                toast.success('Employee deactivated.');
                setDeactivateModal(null);
                fetchData();
            } else {
                setError(res.error || 'Failed to deactivate employee profile.');
            }
        } catch {
            setError('Failed to deactivate employee profile.');
        } finally {
            setDeactivateLoading(false);
        }
    };

    const handleReactivate = async (id: number, empName: string) => {
        if (!token) return;
        setError('');
        setSuccess('');

        try {
            const res = await companyApi.reactivateEmployee(token, id);
            if (res.ok) {
                toast.success(`Employee "${empName}" reactivated.`);
                fetchData();
            } else {
                setError(res.error || 'Failed to reactivate employee.');
            }
        } catch {
            setError('Failed to reactivate employee.');
        }
    };

    const handleBulkUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!csvFile || !token) return;

        setUploading(true);
        setBulkError('');
        setBulkErrors([]);

        try {
            const res = await companyApi.importBulkEmployees(token, csvFile);
            if (res.ok && res.data?.success) {
                const imported = res.data.data?.imported || 0;
                const updated = res.data.data?.updated || 0;
                const failed = res.data.data?.failed || 0;
                const errors = res.data.data?.errors || [];

                if (failed > 0 && errors.length > 0) {
                    setBulkErrors(errors);
                    setBulkError(`Import completed with ${failed} errors (${imported} created, ${updated} updated). Please review the errors below.`);
                    fetchData();
                } else {
                    setSuccess(`Bulk import complete! Successfully processed: ${imported} created, ${updated} updated.`);
                    setIsBulkOpen(false);
                    setCsvFile(null);
                    setBulkError('');
                    setBulkErrors([]);
                    fetchData();
                }
            } else {
                setBulkError(res.error || res.data?.message || 'Failed to import employees.');
                if (res.data?.data?.errors) {
                    setBulkErrors(res.data.data.errors);
                }
            }
        } catch {
            setBulkError('Failed to upload employees spreadsheet.');
        } finally {
            setUploading(false);
        }
    };

    const handleDownloadTemplate = async (format: 'csv' | 'xlsx') => {
        if (!token) return;
        try {
            await companyApi.downloadTemplate(token, 'employees', format);
            toast.success(`Downloaded ${format.toUpperCase()} employee template.`);
        } catch {
            toast.error('Failed to download template.');
        }
    };

    const handleBulkExport = async (format: 'csv' | 'xlsx' = 'xlsx') => {
        if (!token || exporting) return;
        setExporting(true);
        try {
            await companyApi.exportEmployees(token, {
                format,
                search: searchQuery.trim() || undefined,
                status: statusFilter || undefined
            });
            toast.success(`Employees ${format.toUpperCase()} exported successfully.`);
        } catch {
            toast.error('Failed to export employees.');
        } finally {
            setExporting(false);
        }
    };

    const handleSingleExport = async (empId: number, empName: string, format: 'csv' | 'xlsx' = 'xlsx') => {
        if (!token) return;
        try {
            await companyApi.exportEmployees(token, { id: empId, format });
            toast.success(`Exported record: ${empName} (${format.toUpperCase()})`);
        } catch {
            toast.error('Failed to export employee record.');
        }
    };

    const activeCount = employees.filter(isEmployeeActive).length;
    const inactiveCount = employees.length - activeCount;

    const filteredEmployees = employees.filter(emp => {
        const active = isEmployeeActive(emp);
        if (statusFilter === 'active' && !active) return false;
        if (statusFilter === 'inactive' && active) return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const nameMatch = (emp.name || '').toLowerCase().includes(q);
            const emailMatch = (emp.email || '').toLowerCase().includes(q);
            const phoneMatch = (emp.phone || '').toLowerCase().includes(q);
            const deptMatch = (emp.department || '').toLowerCase().includes(q);
            const desigMatch = (emp.designation || '').toLowerCase().includes(q);
            const branchMatch = (emp.branch_name || '').toLowerCase().includes(q);
            if (!nameMatch && !emailMatch && !phoneMatch && !deptMatch && !desigMatch && !branchMatch) return false;
        }
        return true;
    });

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Header & Action Bar */}
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Employee Directory</h1>
                    <p className="text-zinc-500 text-sm mt-1">Manage personnel profiles, office departments, and device mapping assignments.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl p-1">
                        {[
                            { label: `All (${employees.length})`, value: '' },
                            { label: `Active (${activeCount})`, value: 'active' },
                            { label: `Inactive (${inactiveCount})`, value: 'inactive' },
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
                        onClick={() => { setBulkError(''); setBulkErrors([]); setIsBulkOpen(true); }}
                        className="border border-zinc-800 hover:border-zinc-700 bg-zinc-950 text-zinc-300 text-sm font-semibold px-3.5 py-2 rounded-xl flex items-center gap-2 transform active:scale-[0.98] transition-all cursor-pointer"
                    >
                        <Upload size={15} className="text-indigo-400" />
                        <span>Bulk Import</span>
                    </button>

                    <div className="flex items-center rounded-xl border border-zinc-800 bg-zinc-950 p-0.5">
                        <button
                            onClick={() => handleBulkExport('xlsx')}
                            disabled={exporting || employees.length === 0}
                            className="px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-zinc-900 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                            title="Export filtered employees to Excel (.xlsx)"
                        >
                            <Download size={14} />
                            <span>Excel</span>
                        </button>
                        <div className="w-[1px] h-4 bg-zinc-800"></div>
                        <button
                            onClick={() => handleBulkExport('csv')}
                            disabled={exporting || employees.length === 0}
                            className="px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                            title="Export filtered employees to CSV"
                        >
                            <Download size={14} />
                            <span>CSV</span>
                        </button>
                    </div>

                    <button
                        onClick={handleOpenCreateModel}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transform active:scale-[0.98] transition-all cursor-pointer shadow-lg"
                    >
                        <Plus size={16} />
                        <span>Add Employee</span>
                    </button>
                </div>
            </div>

            {/* Search Input Bar */}
            <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                <input
                    type="text"
                    placeholder="Search employees by name, email, department, designation, or branch..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-[#0c0c0c] border border-zinc-900 focus:border-indigo-500/60 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white focus:outline-none transition-colors"
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-1"
                    >
                        <X size={14} />
                    </button>
                )}
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

            {loading ? (
                <div className="py-2">
                    <SkeletonTable rows={6} columns={5} hasHeaderFilter={false} />
                </div>
            ) : filteredEmployees.length === 0 ? (
                <div className="bg-[#0c0c0c] border border-zinc-900 border-dashed rounded-2xl py-20 text-center flex flex-col items-center justify-center space-y-4">
                    <Users size={40} className="text-zinc-700" />
                    <div className="space-y-1">
                        <h3 className="text-zinc-300 font-bold text-base">
                            {searchQuery ? 'No Employees Match Your Search' : 'No Employees Found'}
                        </h3>
                        <p className="text-zinc-650 text-xs max-w-sm">
                            {searchQuery ? 'Try adjusting your search terms.' : 'Register your branch employees so you can map corporate hardware keys and trace tickets.'}
                        </p>
                    </div>
                    {searchQuery ? (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer mt-2"
                        >
                            Clear search query
                        </button>
                    ) : (
                        <button
                            onClick={handleOpenCreateModel}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1.5 cursor-pointer mt-2"
                        >
                            <PlusCircle size={14} /> Add First Staff Member
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredEmployees.map(emp => {
                        const active = isEmployeeActive(emp);
                        return (
                            <div
                                key={emp.id}
                                className={`bg-[#0c0c0c] border rounded-2xl p-5 hover:border-zinc-800 transition-all flex flex-col justify-between space-y-5 ${
                                    !active
                                        ? 'border-amber-500/25 bg-amber-500/[0.02] opacity-90'
                                        : 'border-zinc-900/60'
                                }`}
                            >
                                <div className="space-y-4">
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div
                                                className={`w-10 h-10 rounded-xl border flex items-center justify-center font-bold font-mono text-sm shrink-0 ${
                                                    active
                                                        ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                                                        : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                                }`}
                                            >
                                                {emp.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="font-bold text-white text-base tracking-tight truncate" title={emp.name}>
                                                    {emp.name}
                                                </h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span
                                                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider ${
                                                            active
                                                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                        }`}
                                                    >
                                                        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                                                        {active ? 'ACTIVE' : 'INACTIVE'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => handleSingleExport(emp.id, emp.name)}
                                                className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-emerald-400 transition-colors cursor-pointer"
                                                title="Export Single Employee (CSV)"
                                            >
                                                <Download size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleOpenEditModel(emp)}
                                                className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
                                                title="Edit Employee"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            {active ? (
                                                <button
                                                    onClick={() => handleDeactivate(emp.id, emp.name)}
                                                    className="p-1.5 rounded-lg hover:bg-amber-500/10 text-zinc-500 hover:text-amber-400 transition-colors cursor-pointer"
                                                    title="Deactivate Profile"
                                                >
                                                    <ShieldOff size={14} />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleReactivate(emp.id, emp.name)}
                                                    className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors cursor-pointer"
                                                    title="Reactivate Profile"
                                                >
                                                    <ShieldCheck size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {!active && emp.deactivation_reason && (
                                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-xs flex items-start gap-2.5">
                                            <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-400" />
                                            <div className="min-w-0 flex-1">
                                                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-semibold block">
                                                    Inactive Reason
                                                </span>
                                                <p className="text-zinc-300 text-xs mt-0.5 leading-relaxed break-words">
                                                    {emp.deactivation_reason}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2 text-xs font-medium text-zinc-500">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Mail size={14} className="shrink-0 text-zinc-650" />
                                            <span className="truncate text-zinc-400">{emp.email}</span>
                                        </div>
                                        {emp.phone && (
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Phone size={14} className="shrink-0 text-zinc-650" />
                                                <span className="truncate">{emp.phone}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Briefcase size={14} className="shrink-0 text-zinc-650" />
                                            <span className="truncate">{emp.designation || 'Staff'} • {emp.department || 'General'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Building size={14} className="shrink-0 text-zinc-650" />
                                            <span className="truncate">{emp.branch_name || 'Main Office'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Editor Modal */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fadeIn bg-blur-sm">
                    <div className="bg-[#0a0a0a] border border-zinc-900/80 rounded-2xl w-full max-w-lg overflow-hidden animate-slideUp">
                        <div className="px-6 py-4 border-b border-zinc-900/80 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-white">
                                {editingId ? 'Edit Employee Details' : 'Register New Employee'}
                            </h2>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {formErrors.general && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs flex items-center gap-2">
                                    <AlertCircle size={15} className="shrink-0" />
                                    <span>{formErrors.general}</span>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Full Name *</label>
                                    <input
                                        type="text"
                                        maxLength={NAME_MAX_LENGTH}
                                        placeholder="e.g. Alex Morgan"
                                        value={name}
                                        onChange={e => {
                                            setName(e.target.value);
                                            if (formErrors.name) setFormErrors(prev => ({ ...prev, name: undefined }));
                                        }}
                                        className={`w-full bg-[#050505] border ${formErrors.name ? 'border-red-500/80 focus:border-red-500' : 'border-zinc-900 focus:border-indigo-500/50'} rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors`}
                                    />
                                    {formErrors.name && (
                                        <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                                            <AlertCircle size={12} className="shrink-0" />
                                            <span>{formErrors.name}</span>
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Email Address *</label>
                                    <input
                                        type="email"
                                        placeholder="alex@company.com"
                                        value={email}
                                        onChange={e => {
                                            setEmail(e.target.value);
                                            if (formErrors.email) setFormErrors(prev => ({ ...prev, email: undefined }));
                                        }}
                                        className={`w-full bg-[#050505] border ${formErrors.email ? 'border-red-500/80 focus:border-red-500' : 'border-zinc-900 focus:border-indigo-500/50'} rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors`}
                                    />
                                    {formErrors.email && (
                                        <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                                            <AlertCircle size={12} className="shrink-0" />
                                            <span>{formErrors.email}</span>
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <PhoneInput
                                        size="sm"
                                        label="Phone"
                                        value={phone}
                                        onChange={val => {
                                            setPhone(val);
                                            if (formErrors.phone) setFormErrors(prev => ({ ...prev, phone: undefined }));
                                        }}
                                    />
                                    {formErrors.phone && (
                                        <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                                            <AlertCircle size={12} className="shrink-0" />
                                            <span>{formErrors.phone}</span>
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Branch</label>
                                    <select
                                        value={branchId}
                                        onChange={e => setBranchId(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                    >
                                        <option value="">Main Office (Default)</option>
                                        {branches.map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Department</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Engineering, Sales"
                                        value={department}
                                        onChange={e => setDepartment(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Designation</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Senior Developer"
                                        value={designation}
                                        onChange={e => setDesignation(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                    />
                                </div>
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
                                    disabled={isSubmitting}
                                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer flex items-center gap-2"
                                >
                                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {isSubmitting ? (editingId ? 'Saving...' : 'Registering...') : (editingId ? 'Save Changes' : 'Register Staff')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Bulk Import Modal */}
            {isBulkOpen && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fadeIn bg-blur-sm">
                    <div className="bg-[#0a0a0a] border border-zinc-900/80 rounded-2xl w-full max-w-md overflow-hidden animate-slideUp">
                        <div className="px-6 py-4 border-b border-zinc-900/80 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Upload size={18} className="text-indigo-400" />
                                <span>Bulk Import Employees</span>
                            </h2>
                            <button
                                onClick={() => setIsBulkOpen(false)}
                                className="p-1 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleBulkUpload} className="p-6 space-y-4">
                            {bulkError && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs flex items-center gap-2">
                                    <AlertCircle size={15} className="shrink-0" />
                                    <span>{bulkError}</span>
                                </div>
                            )}

                            <div className="flex flex-wrap justify-between items-center gap-2">
                                <span className="text-xs text-zinc-400">Download formatted template:</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleDownloadTemplate('xlsx')}
                                        className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1 rounded-lg border border-zinc-800 transition-colors"
                                    >
                                        <FileDown size={14} /> Excel (.xlsx)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDownloadTemplate('csv')}
                                        className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1 rounded-lg border border-zinc-800 transition-colors"
                                    >
                                        <FileDown size={14} /> CSV (.csv)
                                    </button>
                                </div>
                            </div>

                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-zinc-800 hover:border-indigo-500/50 rounded-xl p-6 text-center cursor-pointer transition-colors bg-zinc-950/40"
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={e => setCsvFile(e.target.files?.[0] || null)}
                                    accept=".csv, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv"
                                    className="hidden"
                                />
                                <Upload size={24} className="mx-auto text-zinc-600 mb-2" />
                                <p className="text-sm font-medium text-zinc-300">
                                    {csvFile ? csvFile.name : 'Click or drag Excel (.xlsx) or CSV file to upload'}
                                </p>
                                <p className="text-[11px] text-zinc-500 mt-1">Supports UTF-8 CSV and Excel (.xlsx) formats (max 500 rows)</p>
                            </div>

                            {bulkErrors.length > 0 && (
                                <div className="max-h-48 overflow-y-auto rounded-xl border border-red-500/20 bg-red-950/20 p-3 text-xs">
                                    <div className="font-semibold text-red-300 mb-2">Detailed Row Errors ({bulkErrors.length}):</div>
                                    <table className="w-full text-left text-zinc-300">
                                        <thead>
                                            <tr className="border-b border-zinc-800 text-zinc-400">
                                                <th className="py-1 pr-2">Row</th>
                                                <th className="py-1 pr-2">Field</th>
                                                <th className="py-1 pr-2">Error</th>
                                                <th className="py-1">Correction</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bulkErrors.map((err, i) => (
                                                <tr key={i} className="border-b border-zinc-900/60">
                                                    <td className="py-1 pr-2 font-mono text-zinc-400">#{err.row}</td>
                                                    <td className="py-1 pr-2 font-mono text-amber-300">{err.field || 'General'}</td>
                                                    <td className="py-1 pr-2 text-red-300">{err.error}</td>
                                                    <td className="py-1 text-zinc-400">{err.suggestion || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="pt-4 border-t border-zinc-900/60 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsBulkOpen(false)}
                                    className="bg-transparent hover:bg-zinc-900 text-zinc-400 hover:text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!csvFile || uploading}
                                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer flex items-center gap-2"
                                >
                                    {uploading ? 'Importing...' : 'Upload & Process'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Deactivate Employee Modal */}
            <PromptModal
                isOpen={deactivateModal !== null}
                title={`Deactivate Employee - ${deactivateModal?.empName}`}
                message={`Deactivate profile for "${deactivateModal?.empName}"?\nDevice assignments and repair records will remain intact.`}
                inputLabel="Reason (optional):"
                placeholder="Enter deactivation reason..."
                confirmText="Deactivate"
                variant="warning"
                isLoading={deactivateLoading}
                onConfirm={handleConfirmDeactivate}
                onCancel={() => setDeactivateModal(null)}
            />
        </div>
    );
}
