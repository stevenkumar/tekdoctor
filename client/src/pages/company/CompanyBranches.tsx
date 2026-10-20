import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCompanyContext } from '../../context/CompanyContext';
import { companyApi } from '../../services/api';
import {
    MapPin, Phone, Plus, Edit2, ShieldOff, ShieldCheck, X,
    PlusCircle, Upload, Download, Search, FileDown,
    CheckCircle2, AlertCircle, Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import PhoneInput from '@/components/PhoneInput';
import { PromptModal } from '@/components/PromptModal';
import { NAME_MAX_LENGTH, validateName } from '@/config/constants';
import { parsePhoneNumber, validatePhoneNumber, DEFAULT_COUNTRY } from '@/utils/phoneUtils';

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
    const { selectedCompanyId, isAdminManagingCompany, loadingCompanies } = useCompanyContext();
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');
    const [searchQuery, setSearchQuery] = useState('');

    // Modal / form states
    const [isOpen, setIsOpen] = useState(false);
    const [isBulkOpen, setIsBulkOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formErrors, setFormErrors] = useState<{ name?: string; address?: string; phone?: string; general?: string }>({});
    const [deactivateModal, setDeactivateModal] = useState<{ id: number; branchName: string } | null>(null);
    const [deactivateLoading, setDeactivateLoading] = useState(false);
    const [bulkError, setBulkError] = useState('');
    const [bulkErrors, setBulkErrors] = useState<Array<{ row: number; field: string; error: string; suggestion?: string }>>([]);

    // Bulk Import state
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchBranches = async () => {
        if (!token) return;
        if (isAdminManagingCompany && !selectedCompanyId && !loadingCompanies) {
            setLoading(false);
            return;
        }
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
        if (isAdminManagingCompany && loadingCompanies) return;
        fetchBranches();
    }, [token, selectedCompanyId, loadingCompanies]);

    const handleOpenCreateModel = () => {
        setName('');
        setAddress('');
        setPhone('');
        setFormErrors({});
        setEditingId(null);
        setIsOpen(true);
    };

    const handleOpenEditModel = (branch: Branch) => {
        setName(branch.name);
        setAddress(branch.address);
        setPhone(branch.phone || '');
        setFormErrors({});
        setEditingId(branch.id);
        setIsOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;

        const errors: { name?: string; address?: string; phone?: string; general?: string } = {};

        const nameVal = validateName(name, 'Branch name');
        if (!nameVal.isValid) {
            errors.name = nameVal.error || 'Please enter a valid branch name.';
        }

        if (!address.trim()) {
            errors.address = 'Branch address is required.';
        } else if (address.trim().length > 150) {
            errors.address = 'Branch address cannot exceed 150 characters.';
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
            const res = editingId
                ? await companyApi.updateBranch(token || '', editingId, { name, address, phone })
                : await companyApi.createBranch(token || '', { name, address, phone });

            if (res.ok) {
                setSuccess(editingId ? 'Branch updated successfully!' : 'Branch created successfully!');
                setIsOpen(false);
                setFormErrors({});
                fetchBranches();
            } else {
                const serverErrors = (res.data as any)?.errors || {};
                setFormErrors({
                    name: serverErrors.name,
                    address: serverErrors.address,
                    phone: serverErrors.phone,
                    general: res.error || (res.data as any)?.message || 'Failed to submit branch information.'
                });
            }
        } catch {
            setFormErrors({ general: 'Failed to submit branch information. Please try again.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeactivate = (id: number, branchName: string) => {
        setDeactivateModal({ id, branchName });
    };

    const handleConfirmDeactivate = async (reason: string) => {
        if (!token || !deactivateModal) return;
        setError('');
        setSuccess('');
        setDeactivateLoading(true);

        try {
            const res = await companyApi.deleteBranch(token, deactivateModal.id, reason.trim() || undefined);
            if (res.ok) {
                toast.success('Branch deactivated successfully.');
                setDeactivateModal(null);
                fetchBranches();
            } else {
                setError(res.error || 'Failed to deactivate branch.');
            }
        } catch {
            setError('Failed to deactivate branch.');
        } finally {
            setDeactivateLoading(false);
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

    const handleBulkUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!csvFile || !token) return;

        setUploading(true);
        setBulkError('');
        setBulkErrors([]);

        try {
            const res = await companyApi.importBulkBranches(token, csvFile);
            if (res.ok && res.data?.success) {
                const importedCount = res.data.data?.imported || 0;
                const updatedCount = res.data.data?.updated || 0;
                const failedCount = res.data.data?.failed || 0;
                const errors = res.data.data?.errors || [];

                if (failedCount > 0 && errors.length > 0) {
                    setBulkErrors(errors);
                    setBulkError(`Import completed with ${failedCount} errors (${importedCount} created, ${updatedCount} updated). Please review the errors below.`);
                    fetchBranches();
                } else {
                    setSuccess(`Bulk import complete! Successfully processed: ${importedCount} created, ${updatedCount} updated.`);
                    setIsBulkOpen(false);
                    setCsvFile(null);
                    setBulkError('');
                    setBulkErrors([]);
                    fetchBranches();
                }
            } else {
                setBulkError(res.error || res.data?.message || 'Failed to import branches.');
                if (res.data?.data?.errors) {
                    setBulkErrors(res.data.data.errors);
                }
            }
        } catch {
            setBulkError('Failed to upload branches spreadsheet.');
        } finally {
            setUploading(false);
        }
    };

    const handleDownloadTemplate = async (format: 'csv' | 'xlsx') => {
        if (!token) return;
        try {
            await companyApi.downloadTemplate(token, 'branches', format);
            toast.success(`Downloaded ${format.toUpperCase()} branch template.`);
        } catch {
            toast.error('Failed to download template.');
        }
    };

    const handleBulkExport = async (format: 'csv' | 'xlsx' = exportFormat) => {
        if (!token || exporting) return;
        setExporting(true);
        try {
            await companyApi.exportBranches(token, {
                format,
                search: searchQuery.trim() || undefined,
                status: statusFilter || undefined
            });
            toast.success(`Branches ${format.toUpperCase()} exported successfully.`);
        } catch {
            toast.error('Failed to export branches.');
        } finally {
            setExporting(false);
        }
    };

    const handleSingleExport = async (branchId: number, branchName: string, format: 'csv' | 'xlsx' = 'xlsx') => {
        if (!token) return;
        try {
            await companyApi.exportBranches(token, { id: branchId, format });
            toast.success(`Exported branch: ${branchName} (${format.toUpperCase()})`);
        } catch {
            toast.error('Failed to export branch record.');
        }
    };

    const filteredBranches = branches.filter(b => {
        if (statusFilter === 'active' && b.is_active === false) return false;
        if (statusFilter === 'inactive' && b.is_active !== false) return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const nameMatch = (b.name || '').toLowerCase().includes(q);
            const addressMatch = (b.address || '').toLowerCase().includes(q);
            const phoneMatch = (b.phone || '').toLowerCase().includes(q);
            if (!nameMatch && !addressMatch && !phoneMatch) return false;
        }
        return true;
    });

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Title Header & Actions */}
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Branches Management</h1>
                    <p className="text-zinc-500 text-sm mt-1">Manage office operations hubs and repair transfer locations.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
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
                        onClick={() => { setBulkError(''); setBulkErrors([]); setIsBulkOpen(true); }}
                        className="border border-zinc-800 hover:border-zinc-700 bg-zinc-950 text-zinc-300 text-sm font-semibold px-3.5 py-2 rounded-xl flex items-center gap-2 transform active:scale-[0.98] transition-all cursor-pointer"
                    >
                        <Upload size={15} className="text-indigo-400" />
                        <span>Bulk Import</span>
                    </button>

                    <div className="flex items-center rounded-xl border border-zinc-800 bg-zinc-950 p-0.5">
                        <button
                            onClick={() => handleBulkExport('xlsx')}
                            disabled={exporting || branches.length === 0}
                            className="px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-zinc-900 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                            title="Export filtered branches to Excel (.xlsx)"
                        >
                            <Download size={14} />
                            <span>Excel</span>
                        </button>
                        <div className="w-[1px] h-4 bg-zinc-800"></div>
                        <button
                            onClick={() => handleBulkExport('csv')}
                            disabled={exporting || branches.length === 0}
                            className="px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                            title="Export filtered branches to CSV"
                        >
                            <Download size={14} />
                            <span>CSV</span>
                        </button>
                    </div>

                    <button
                        onClick={handleOpenCreateModel}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transform active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-indigo-600/10"
                    >
                        <Plus size={16} />
                        <span>Add Branch</span>
                    </button>
                </div>
            </div>

            {/* Search Input Bar */}
            <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                <input
                    type="text"
                    placeholder="Search branches by name, location address, or contact phone..."
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

            {/* Messaging alerts */}
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

            {/* Loading state */}
            {loading ? (
                <div className="flex items-center justify-center min-h-[300px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                </div>
            ) : filteredBranches.length === 0 ? (
                <div className="bg-[#0c0c0c] border border-zinc-900 border-dashed rounded-2xl py-20 text-center flex flex-col items-center justify-center space-y-4">
                    <MapPin size={40} className="text-zinc-700" />
                    <div className="space-y-1">
                        <h3 className="text-zinc-300 font-bold text-base">
                            {searchQuery ? 'No Branches Match Your Search' : 'No Branches Found'}
                        </h3>
                        <p className="text-zinc-650 text-xs max-w-sm">
                            {searchQuery ? 'Try adjusting your search criteria.' : 'Define your secondary branches to map service tasks and assign employee resources.'}
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
                            <PlusCircle size={14} /> Register Branch
                        </button>
                    )}
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
                                            onClick={() => handleSingleExport(branch.id, branch.name)}
                                            className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-emerald-400 transition-colors cursor-pointer"
                                            title="Export Single Branch (CSV)"
                                        >
                                            <Download size={13} />
                                        </button>
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
                            {formErrors.general && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs flex items-center gap-2">
                                    <AlertCircle size={15} className="shrink-0" />
                                    <span>{formErrors.general}</span>
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Branch Name *</label>
                                <input
                                    type="text"
                                    maxLength={NAME_MAX_LENGTH}
                                    placeholder="e.g. London Office, Chicago Branch"
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
                                <PhoneInput
                                    size="sm"
                                    label="Branch Phone (Optional)"
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
                                <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Address *</label>
                                <textarea
                                    rows={3}
                                    placeholder="Full office location address"
                                    value={address}
                                    onChange={e => {
                                        setAddress(e.target.value);
                                        if (formErrors.address) setFormErrors(prev => ({ ...prev, address: undefined }));
                                    }}
                                    className={`w-full bg-[#050505] border ${formErrors.address ? 'border-red-500/80 focus:border-red-500' : 'border-zinc-900 focus:border-indigo-500/50'} rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors resize-none`}
                                />
                                {formErrors.address && (
                                    <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                                        <AlertCircle size={12} className="shrink-0" />
                                        <span>{formErrors.address}</span>
                                    </p>
                                )}
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
                                    {isSubmitting ? (editingId ? 'Saving...' : 'Creating...') : (editingId ? 'Save Changes' : 'Create Branch')}
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
                                <span>Bulk Import Branches</span>
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

            {/* Deactivation Modal */}
            <PromptModal
                isOpen={deactivateModal !== null}
                title={`Deactivate Branch - ${deactivateModal?.branchName}`}
                message={`Deactivate branch "${deactivateModal?.branchName}"? Associated employee and device assignments will remain intact.`}
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
