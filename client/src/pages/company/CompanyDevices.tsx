import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCompanyContext } from '../../context/CompanyContext';
import { companyApi } from '../../services/api';
import {
    Smartphone, Plus, Edit2, ShieldOff, ShieldCheck, X,
    Upload, Download, Calendar, FileDown, CheckCircle2,
    AlertCircle, Search, Clock, Wrench, Loader2
} from 'lucide-react';
import { useSiteContext } from '../../context/SiteContext';
import { toast } from 'react-hot-toast';
import DeviceRepairHistoryModal from '../../components/DeviceRepairHistoryModal';
import { PromptModal } from '@/components/PromptModal';
import { SkeletonTable } from '@/components/Skeleton';

interface Employee {
    id: number;
    name: string;
}

interface Device {
    id: number;
    category?: string;
    device_category?: string;
    brand: string;
    model_number: string;
    serial_number: string;
    asset_id?: string;
    asset_tag?: string;
    purchase_date: string;
    warranty_expiry: string;
    assigned_employee_id?: number;
    employee_id?: number;
    employee_name: string;
    is_amc: number;
    amc_tag: string;
    is_active?: boolean | number;
    status?: string;
    deactivation_reason?: string;
    repair_count?: number;
    active_repairs?: number;
    completed_repairs?: number;
    last_repair_date?: string;
}

export default function CompanyDevices() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const { selectedCompanyId, isAdminManagingCompany, loadingCompanies } = useCompanyContext();
    const [searchParams] = useSearchParams();
    const [devices, setDevices] = useState<Device[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
    const [exporting, setExporting] = useState(false);
    const [historyModalDeviceId, setHistoryModalDeviceId] = useState<number | null>(null);

    // Form modals
    const [isOpen, setIsOpen] = useState(false);
    const [isBulkOpen, setIsBulkOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Field states
    const [category, setCategory] = useState('');
    const [brand, setBrand] = useState('');
    const [modelNumber, setModelNumber] = useState('');
    const [serialNumber, setSerialNumber] = useState('');
    const [assetTag, setAssetTag] = useState('');
    const [purchaseDate, setPurchaseDate] = useState('');
    const [warrantyExpiry, setWarrantyExpiry] = useState('');
    const [assignedEmployeeId, setAssignedEmployeeId] = useState<string>('');
    const [isAmc, setIsAmc] = useState<boolean>(false);
    const [amcTag, setAmcTag] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formErrors, setFormErrors] = useState<{ brand?: string; modelNumber?: string; serialNumber?: string; purchaseDate?: string; warrantyExpiry?: string; general?: string }>({});
    const [bulkError, setBulkError] = useState('');
    const [bulkErrors, setBulkErrors] = useState<Array<{ row: number; field: string; error: string; suggestion?: string }>>([]);
    const [decommissionModal, setDecommissionModal] = useState<{ id: number; model: string } | null>(null);
    const [decommissionLoading, setDecommissionLoading] = useState(false);

    // Bulk Upload state
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchData = async () => {
        if (!token) return;
        if (isAdminManagingCompany && !selectedCompanyId && !loadingCompanies) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [devRes, empRes] = await Promise.all([
                companyApi.getDevices(token),
                companyApi.getEmployees(token)
            ]);

            if (devRes.ok && devRes.data) setDevices(devRes.data.data || []);
            if (empRes.ok && empRes.data) setEmployees(empRes.data.data || []);
        } catch {
            setError('Failed to fetch devices or employees data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAdminManagingCompany && loadingCompanies) return;
        fetchData();
    }, [token, selectedCompanyId, loadingCompanies]);

    const handleOpenCreateModel = () => {
        setCategory('Laptop');
        setBrand('');
        setModelNumber('');
        setSerialNumber('');
        setAssetTag('');
        setPurchaseDate('');
        setWarrantyExpiry('');
        setAssignedEmployeeId('');
        setIsAmc(false);
        setAmcTag('');
        setFormErrors({});
        setEditingId(null);
        setIsOpen(true);
    };

    const handleOpenEditModel = (dev: Device) => {
        setCategory(dev.device_category || dev.category || 'Laptop');
        setBrand(dev.brand);
        setModelNumber(dev.model_number);
        setSerialNumber(dev.serial_number);
        setAssetTag(dev.asset_tag || dev.asset_id || '');
        setPurchaseDate(dev.purchase_date ? dev.purchase_date.split('T')[0] : '');
        setWarrantyExpiry(dev.warranty_expiry ? dev.warranty_expiry.split('T')[0] : '');
        const currentEmpId = dev.assigned_employee_id || dev.employee_id;
        setAssignedEmployeeId(currentEmpId ? String(currentEmpId) : '');
        setIsAmc(Boolean(dev.is_amc));
        setAmcTag(dev.amc_tag || '');
        setFormErrors({});
        setEditingId(dev.id);
        setIsOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;

        const errors: { brand?: string; modelNumber?: string; serialNumber?: string; purchaseDate?: string; warrantyExpiry?: string; general?: string } = {};

        if (!brand.trim()) {
            errors.brand = 'Brand / Manufacturer is required.';
        } else if (brand.trim().length > 50) {
            errors.brand = 'Brand cannot exceed 50 characters.';
        }

        if (!modelNumber.trim()) {
            errors.modelNumber = 'Model name/number is required.';
        } else if (modelNumber.trim().length > 30) {
            errors.modelNumber = 'Model number cannot exceed 30 characters.';
        }

        if (!serialNumber.trim()) {
            errors.serialNumber = 'Serial number is required.';
        } else if (serialNumber.trim().length > 30) {
            errors.serialNumber = 'Serial number cannot exceed 30 characters.';
        }

        if (purchaseDate && warrantyExpiry) {
            if (new Date(warrantyExpiry) < new Date(purchaseDate)) {
                errors.warrantyExpiry = 'Warranty expiry date cannot be earlier than purchase date.';
            }
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                deviceCategory: category,
                category,
                brand,
                modelNumber,
                serialNumber,
                assetId: assetTag || `AST-${Date.now().toString().slice(-4)}`,
                assetTag,
                purchaseDate: purchaseDate || null,
                warrantyExpiry: warrantyExpiry || null,
                employeeId: assignedEmployeeId ? parseInt(assignedEmployeeId, 10) : null,
                isAmc,
                amcTag
            };

            const res = editingId
                ? await companyApi.updateDevice(token || '', editingId, payload)
                : await companyApi.createDevice(token || '', payload);

            if (res.ok) {
                setSuccess(editingId ? 'Asset details updated!' : 'Device registered in assets catalogue.');
                setIsOpen(false);
                setFormErrors({});
                fetchData();
            } else {
                const serverErrors = (res.data as any)?.errors || {};
                setFormErrors({
                    brand: serverErrors.brand,
                    modelNumber: serverErrors.modelNumber,
                    serialNumber: serverErrors.serialNumber,
                    purchaseDate: serverErrors.purchaseDate,
                    warrantyExpiry: serverErrors.warrantyExpiry,
                    general: res.error || (res.data as any)?.message || 'Failed to save device information.'
                });
            }
        } catch {
            setFormErrors({ general: 'Failed to save device information. Please try again.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDecommission = (id: number, model: string) => {
        setDecommissionModal({ id, model });
    };

    const handleConfirmDecommission = async (reason: string) => {
        if (!token || !decommissionModal) return;
        setError('');
        setSuccess('');
        setDecommissionLoading(true);

        try {
            const res = await companyApi.deleteDevice(token, decommissionModal.id, reason.trim() || undefined);
            if (res.ok) {
                toast.success('Device decommissioned / deactivated.');
                setDecommissionModal(null);
                fetchData();
            } else {
                setError(res.error || 'Failed to decommission device.');
            }
        } catch {
            setError('Failed to decommission device.');
        } finally {
            setDecommissionLoading(false);
        }
    };

    const handleReactivate = async (id: number, model: string) => {
        if (!token) return;
        setError('');
        setSuccess('');

        try {
            const res = await companyApi.reactivateDevice(token, id);
            if (res.ok) {
                toast.success(`Device "${model}" restored to active fleet.`);
                fetchData();
            } else {
                setError(res.error || 'Failed to reactivate device.');
            }
        } catch {
            setError('Failed to reactivate device.');
        }
    };

    const handleBulkUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!csvFile || !token) return;

        setUploading(true);
        setBulkError('');
        setBulkErrors([]);

        try {
            const res = await companyApi.importBulkDevices(token, csvFile);
            if (res.ok && res.data?.success) {
                const inserted = res.data.data?.inserted ?? res.data.data?.imported ?? 0;
                const updated = res.data.data?.updated ?? 0;
                toast.success(`Device import completed: ${inserted} created, ${updated} updated.`);
                setIsBulkOpen(false);
                setCsvFile(null);
                setBulkError('');
                setBulkErrors([]);
                fetchData();
            } else {
                setBulkError(res.error || res.data?.message || 'Failed to process bulk import. Check file format.');
                if (Array.isArray(res.data?.errors)) {
                    setBulkErrors(res.data.errors);
                }
            }
        } catch {
            setBulkError('Failed to process bulk import. Check file format.');
        } finally {
            setUploading(false);
        }
    };

    const handleBulkExport = async (format: 'xlsx' | 'csv' = 'xlsx') => {
        if (!token || exporting) return;
        setExporting(true);
        try {
            await companyApi.exportDevices(token, {
                format,
                search: searchQuery.trim() || undefined,
                status: statusFilter || undefined,
            });
            toast.success(`Fleet devices ${format.toUpperCase()} exported successfully.`);
        } catch {
            toast.error(`Failed to export devices as ${format.toUpperCase()}.`);
        } finally {
            setExporting(false);
        }
    };

    const handleSingleExport = async (devId: number, devName: string) => {
        if (!token) return;
        try {
            await companyApi.exportDevices(token, { id: devId, format: 'xlsx' });
            toast.success(`Exported device: ${devName}`);
        } catch {
            toast.error('Failed to export device record.');
        }
    };

    const handleDownloadTemplate = async (format: 'xlsx' | 'csv') => {
        if (!token) return;
        try {
            await companyApi.downloadTemplate(token, 'devices', format, true);
        } catch {
            toast.error(`Failed to download ${format.toUpperCase()} template.`);
        }
    };

    const isDeviceDecommissioned = (dev: Device) => {
        return dev.is_active === false || dev.is_active === 0 || (dev.is_active as any) === '0' || dev.status === 'decommissioned' || dev.status === 'inactive';
    };

    const decommissionedCount = devices.filter(isDeviceDecommissioned).length;
    const activeDevicesCount = devices.length - decommissionedCount;

    const filteredDevices = devices.filter(dev => {
        const isDecomm = isDeviceDecommissioned(dev);
        if (statusFilter === 'active' && isDecomm) return false;
        if (statusFilter === 'inactive' && !isDecomm) return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const tagMatch = (dev.asset_tag || dev.asset_id || '').toLowerCase().includes(q);
            const brandMatch = (dev.brand || '').toLowerCase().includes(q);
            const modelMatch = (dev.model_number || '').toLowerCase().includes(q);
            const serialMatch = (dev.serial_number || '').toLowerCase().includes(q);
            const empMatch = (dev.employee_name || '').toLowerCase().includes(q);
            if (!tagMatch && !brandMatch && !modelMatch && !serialMatch && !empMatch) return false;
        }
        return true;
    });

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Tracked Assets</h1>
                    <p className="text-zinc-500 text-sm mt-1">Audit company-assigned mobile phones, laptops, and networking hardware.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl p-1">
                        {[
                            { label: `All (${devices.length})`, value: '' },
                            { label: `Active (${activeDevicesCount})`, value: 'active' },
                            { label: `Decommissioned (${decommissionedCount})`, value: 'inactive' },
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
                    <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 p-0.5 rounded-xl">
                        <button
                            onClick={() => handleBulkExport('xlsx')}
                            disabled={exporting || devices.length === 0}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-emerald-400 hover:bg-zinc-900 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Export filtered fleet devices as Excel (.xlsx)"
                        >
                            <Download size={13} />
                            <span>Excel</span>
                        </button>
                        <div className="w-[1px] h-3.5 bg-zinc-800" />
                        <button
                            onClick={() => handleBulkExport('csv')}
                            disabled={exporting || devices.length === 0}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Export filtered fleet devices as CSV"
                        >
                            <span>CSV</span>
                        </button>
                    </div>
                    <button
                        onClick={handleOpenCreateModel}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transform active:scale-[0.98] transition-all cursor-pointer shadow-lg"
                    >
                        <Plus size={16} />
                        <span>Add Asset</span>
                    </button>
                </div>
            </div>

            {/* Search Input Bar */}
            <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                <input
                    type="text"
                    placeholder="Search fleet assets by tag, brand, model, serial number, or assigned staff..."
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
                    <SkeletonTable rows={6} columns={6} hasHeaderFilter={false} />
                </div>
            ) : filteredDevices.length === 0 ? (
                <div className="bg-[#0c0c0c] border border-zinc-900 border-dashed rounded-2xl py-20 text-center flex flex-col items-center justify-center space-y-4">
                    <Smartphone size={40} className="text-zinc-700 animate-pulse" />
                    <div className="space-y-1">
                        <h3 className="text-zinc-300 font-bold text-base">No Assets Found</h3>
                        <p className="text-zinc-650 text-xs max-w-sm">Create individual assets or import a complete CSV directory of business hardware.</p>
                    </div>
                    <div className="flex gap-4 mt-2">
                        <button
                            onClick={handleOpenCreateModel}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer"
                        >
                            + Register Asset
                        </button>
                        <span className="text-zinc-800">|</span>
                        <button
                            onClick={() => setIsBulkOpen(true)}
                            className="text-xs text-zinc-400 hover:text-white font-bold cursor-pointer"
                        >
                            Upload CSV Directory
                        </button>
                    </div>
                </div>
            ) : (
                <div className="bg-[#0c0c0c] border border-zinc-900/60 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-zinc-900 text-xs text-zinc-500 uppercase tracking-widest font-mono select-none">
                                    <th className="py-4 px-6">Asset Tag / ID</th>
                                    <th className="py-4 px-4">Brand & Model</th>
                                    <th className="py-4 px-4 font-mono">Serial Number</th>
                                    <th className="py-4 px-4">Assigned To</th>
                                    <th className="py-4 px-4">Repair History</th>
                                    <th className="py-4 px-4">Warranty Expiry</th>
                                    <th className="py-4 px-4 text-center">Status</th>
                                    <th className="py-4 px-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900/40 text-sm text-zinc-300">
                                {filteredDevices.map(dev => {
                                    const isWarrantyExpired = dev.warranty_expiry
                                        ? new Date(dev.warranty_expiry) < new Date()
                                        : false;
                                    const isDecommissioned = dev.is_active === false || dev.is_active === 0 || dev.status === 'decommissioned' || dev.status === 'inactive';

                                    return (
                                        <tr key={dev.id} className={`hover:bg-zinc-900/10 transition-colors ${isDecommissioned ? 'opacity-70 bg-zinc-950/30' : ''}`}>
                                            <td className="py-4 px-6 flex flex-col gap-2 items-start justify-center">
                                                <span className="font-mono text-zinc-400 bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-900 text-xs">
                                                    {dev.asset_tag || dev.asset_id || 'UNTAGGED'}
                                                </span>
                                                {dev.is_amc === 1 && (
                                                    <span className="text-[10px] uppercase font-bold tracking-widest text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/20 px-2 py-0.5 rounded-full block">
                                                        AMC: {dev.amc_tag}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="font-bold text-white text-base leading-tight">{dev.brand}</div>
                                                <div className="text-xs text-zinc-500 mt-1">{dev.category || dev.device_category} • {dev.model_number}</div>
                                                {dev.deactivation_reason && (
                                                    <div className="text-[10px] text-amber-400 font-mono mt-1">
                                                        Decommissioned: {dev.deactivation_reason}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-4 px-4 font-mono text-xs font-semibold text-zinc-450">
                                                {dev.serial_number}
                                            </td>
                                            <td className="py-4 px-4 text-zinc-400 font-semibold">
                                                {dev.employee_name ? (
                                                    <span className="text-white hover:underline">{dev.employee_name}</span>
                                                ) : (
                                                    <span className="text-zinc-650 italic">Unassigned / Inventory</span>
                                                )}
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <button
                                                        onClick={() => setHistoryModalDeviceId(dev.id)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-cyan-500/10 hover:text-cyan-400 border border-zinc-800 hover:border-cyan-500/30 text-xs font-mono text-zinc-300 transition-colors cursor-pointer"
                                                        title="View Complete Repair Lifecycle"
                                                    >
                                                        <Clock size={12} />
                                                        <span>{dev.repair_count || 0} repairs</span>
                                                    </button>
                                                    {Number(dev.active_repairs || 0) > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                                            {dev.active_repairs} active
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-4 px-4">
                                                {dev.warranty_expiry ? (
                                                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${isWarrantyExpired ? 'text-red-400' : 'text-emerald-400'
                                                        }`}>
                                                        <Calendar size={12} />
                                                        {dev.warranty_expiry.split('T')[0]}
                                                        {isWarrantyExpired && ' (Expired)'}
                                                    </span>
                                                ) : (
                                                    <span className="text-zinc-600">-</span>
                                                )}
                                            </td>
                                            <td className="py-4 px-4 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${!isDecommissioned ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                                                    {!isDecommissioned ? 'ACTIVE' : 'DECOMMISSIONED'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                <div className="flex justify-end gap-1">
                                                    {!isDecommissioned ? (
                                                        <button
                                                            onClick={() => navigate(`/company/repairs?deviceId=${dev.id}`)}
                                                            className="p-2 rounded-lg hover:bg-cyan-500/10 text-zinc-400 hover:text-cyan-400 transition-colors cursor-pointer"
                                                            title="Raise Repair Ticket for this Device"
                                                        >
                                                            <Wrench size={14} />
                                                        </button>
                                                    ) : (
                                                        <span
                                                            className="p-2 rounded-lg text-zinc-600 opacity-40 cursor-not-allowed inline-flex items-center justify-center"
                                                            title="Device is deactivated and cannot raise a repair ticket"
                                                        >
                                                            <Wrench size={14} />
                                                        </span>
                                                    )}
                                                    <button
                                                        onClick={() => handleSingleExport(dev.id, `${dev.brand} ${dev.model_number}`)}
                                                        className="p-2 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
                                                        title="Export Single Device (CSV)"
                                                    >
                                                        <Download size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenEditModel(dev)}
                                                        className="p-2 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                                        title="Edit Asset"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    {!isDecommissioned ? (
                                                        <button
                                                            onClick={() => handleDecommission(dev.id, `${dev.brand} ${dev.model_number}`)}
                                                            className="p-2 rounded-lg hover:bg-amber-500/10 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
                                                            title="Decommission Asset"
                                                        >
                                                            <ShieldOff size={14} />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleReactivate(dev.id, `${dev.brand} ${dev.model_number}`)}
                                                            className="p-2 rounded-lg hover:bg-emerald-500/10 text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
                                                            title="Restore Asset"
                                                        >
                                                            <ShieldCheck size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Device Repair History Modal */}
            {historyModalDeviceId && (
                <DeviceRepairHistoryModal
                    deviceId={historyModalDeviceId}
                    onClose={() => setHistoryModalDeviceId(null)}
                    onSelectTicket={(ticket) => navigate(`/company/repairs?ticketId=${ticket.ticket_number || ticket.id}`)}
                    onRaiseRepair={(device) => navigate(`/company/repairs?deviceId=${device.id}`)}
                />
            )}

            {/* Write/Edit Asset Modal */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fadeIn bg-blur-sm">
                    <div className="bg-[#0a0a0a] border border-zinc-900/80 rounded-2xl w-full max-w-lg overflow-hidden animate-slideUp">
                        <div className="px-6 py-4 border-b border-zinc-900/80 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-white">
                                {editingId ? 'Edit Asset details' : 'Register New Corporate Asset'}
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

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Asset Category</label>
                                    <select
                                        value={category}
                                        onChange={e => setCategory(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors"
                                    >
                                        <option value="Laptop">Laptop</option>
                                        <option value="Mobile Phone">Mobile Phone</option>
                                        <option value="Tablet">Tablet</option>
                                        <option value="Desktop PC">Desktop PC</option>
                                        <option value="Networking Router">Networking Router</option>
                                        <option value="Other">Other Category</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Asset Tag / QR Code</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. ASSET-9912"
                                        value={assetTag}
                                        onChange={e => setAssetTag(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider font-semibold">Brand / Manufacturer *</label>
                                    <input
                                        type="text"
                                        placeholder="Apple, Dell, Lenovo"
                                        value={brand}
                                        onChange={e => {
                                            setBrand(e.target.value);
                                            if (formErrors.brand) setFormErrors(prev => ({ ...prev, brand: undefined }));
                                        }}
                                        className={`w-full bg-[#050505] border ${formErrors.brand ? 'border-red-500/80 focus:border-red-500' : 'border-zinc-900 focus:border-indigo-500/50'} rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors`}
                                    />
                                    {formErrors.brand && (
                                        <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                                            <AlertCircle size={12} className="shrink-0" />
                                            <span>{formErrors.brand}</span>
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Model Name/Number *</label>
                                    <input
                                        type="text"
                                        placeholder="MacBook Pro M3 Max"
                                        value={modelNumber}
                                        onChange={e => {
                                            setModelNumber(e.target.value);
                                            if (formErrors.modelNumber) setFormErrors(prev => ({ ...prev, modelNumber: undefined }));
                                        }}
                                        className={`w-full bg-[#050505] border ${formErrors.modelNumber ? 'border-red-500/80 focus:border-red-500' : 'border-zinc-900 focus:border-indigo-500/50'} rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors`}
                                    />
                                    {formErrors.modelNumber && (
                                        <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                                            <AlertCircle size={12} className="shrink-0" />
                                            <span>{formErrors.modelNumber}</span>
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1 col-span-2">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider font-semibold">Serial Number *</label>
                                    <input
                                        type="text"
                                        placeholder="Provide exact hardware key"
                                        value={serialNumber}
                                        onChange={e => {
                                            setSerialNumber(e.target.value);
                                            if (formErrors.serialNumber) setFormErrors(prev => ({ ...prev, serialNumber: undefined }));
                                        }}
                                        className={`w-full bg-[#050505] border ${formErrors.serialNumber ? 'border-red-500/80 focus:border-red-500' : 'border-zinc-900 focus:border-indigo-500/50'} rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors font-mono`}
                                    />
                                    {formErrors.serialNumber && (
                                        <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                                            <AlertCircle size={12} className="shrink-0" />
                                            <span>{formErrors.serialNumber}</span>
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Purchase Date</label>
                                    <input
                                        type="date"
                                        value={purchaseDate}
                                        onChange={e => {
                                            setPurchaseDate(e.target.value);
                                            if (formErrors.purchaseDate || formErrors.warrantyExpiry) setFormErrors(prev => ({ ...prev, purchaseDate: undefined, warrantyExpiry: undefined }));
                                        }}
                                        className={`w-full bg-[#050505] border ${formErrors.purchaseDate ? 'border-red-500/80 focus:border-red-500' : 'border-zinc-900 focus:border-indigo-500/50'} rounded-xl px-4 py-2 text-sm text-zinc-400 focus:outline-none transition-colors`}
                                    />
                                    {formErrors.purchaseDate && (
                                        <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                                            <AlertCircle size={12} className="shrink-0" />
                                            <span>{formErrors.purchaseDate}</span>
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Warranty Expiry</label>
                                    <input
                                        type="date"
                                        value={warrantyExpiry}
                                        onChange={e => {
                                            setWarrantyExpiry(e.target.value);
                                            if (formErrors.warrantyExpiry) setFormErrors(prev => ({ ...prev, warrantyExpiry: undefined }));
                                        }}
                                        className={`w-full bg-[#050505] border ${formErrors.warrantyExpiry ? 'border-red-500/80 focus:border-red-500' : 'border-zinc-900 focus:border-indigo-500/50'} rounded-xl px-4 py-2 text-sm text-zinc-400 focus:outline-none transition-colors`}
                                    />
                                    {formErrors.warrantyExpiry && (
                                        <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                                            <AlertCircle size={12} className="shrink-0" />
                                            <span>{formErrors.warrantyExpiry}</span>
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 items-center bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isAmc}
                                        onChange={e => setIsAmc(e.target.checked)}
                                        className="w-5 h-5 rounded border-zinc-700 bg-zinc-950 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900"
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-sm font-semibold text-white">Under AMC Contract</span>
                                        <span className="text-xs text-zinc-500">Enable proactive maintenance</span>
                                    </div>
                                </label>

                                <div className={`space-y-1 transition-opacity duration-300 ${isAmc ? 'opacity-100 block' : 'opacity-50 pointer-events-none'}`}>
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">AMC Tag (Auto if empty)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. td-amc-024"
                                        value={amcTag}
                                        onChange={e => setAmcTag(e.target.value)}
                                        disabled={!isAmc}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors disabled:opacity-50"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Assignee (Employee)</label>
                                <select
                                    value={assignedEmployeeId}
                                    onChange={e => setAssignedEmployeeId(e.target.value)}
                                    className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors"
                                >
                                    <option value="">Keep in Warehouse Inventory (Unassigned)</option>
                                    {employees.map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                                    ))}
                                </select>
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
                                    {isSubmitting ? (editingId ? 'Saving...' : 'Registering...') : (editingId ? 'Save Changes' : 'Register Asset')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* CSV Bulk Importer Modal */}
            {isBulkOpen && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fadeIn bg-blur-sm">
                    <div className="bg-[#0a0a0a] border border-zinc-900/80 rounded-2xl w-full max-w-lg overflow-hidden animate-slideUp">
                        <div className="px-6 py-4 border-b border-zinc-900/80 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Upload size={18} className="text-indigo-400" />
                                <span>Bulk Asset Importer (Excel & CSV)</span>
                            </h2>
                            <button
                                onClick={() => setIsBulkOpen(false)}
                                className="p-1 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleBulkUpload} className="p-6 space-y-6">
                            {bulkError && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs flex items-center gap-2">
                                    <AlertCircle size={15} className="shrink-0" />
                                    <span>{bulkError}</span>
                                </div>
                            )}

                            {bulkErrors.length > 0 && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs space-y-2 max-h-48 overflow-y-auto">
                                    <div className="font-semibold text-red-300 flex items-center gap-1.5">
                                        <AlertCircle size={14} /> Validation Errors ({bulkErrors.length})
                                    </div>
                                    <div className="space-y-1 divide-y divide-red-500/10 text-red-400">
                                        {bulkErrors.map((err, idx) => (
                                            <div key={idx} className="pt-1.5 first:pt-0">
                                                <span className="font-mono font-semibold text-white">Row {err.row}</span> ({err.field}): {err.error}
                                                {err.suggestion && <span className="block text-[11px] text-zinc-400 mt-0.5">💡 {err.suggestion}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="text-xs text-zinc-500 leading-relaxed space-y-2">
                                <p>Import or update fleet devices using Excel (.xlsx) or CSV. Required headers: <code className="text-indigo-300 font-mono">device_type</code>, <code className="text-indigo-300 font-mono">brand</code>, <code className="text-indigo-300 font-mono">model</code>, <code className="text-indigo-300 font-mono">serial_number</code>.</p>
                                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-900 font-mono text-[10px] text-zinc-400 overflow-x-auto select-all">
                                    device_type, brand, model, serial_number, asset_tag, branch, employee_email, purchase_date, warranty_expiry
                                </div>
                                <div className="flex items-center gap-4 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => handleDownloadTemplate('xlsx')}
                                        className="text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1.5 cursor-pointer text-xs"
                                    >
                                        <FileDown size={14} /> Download Excel Template (.xlsx)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDownloadTemplate('csv')}
                                        className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1.5 cursor-pointer text-xs"
                                    >
                                        <FileDown size={14} /> Download CSV Template (.csv)
                                    </button>
                                </div>
                            </div>

                            {/* Drag/Drop Box */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-zinc-800 hover:border-indigo-500/50 hover:bg-zinc-900/10 rounded-2xl p-8 text-center cursor-pointer transition-colors space-y-2"
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept=".csv, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv"
                                    className="hidden"
                                    onChange={e => {
                                        const files = e.target.files;
                                        if (files && files[0]) setCsvFile(files[0]);
                                    }}
                                />
                                <Upload size={32} className="mx-auto text-zinc-500" />
                                <div className="text-sm font-semibold text-zinc-300">
                                    {csvFile ? csvFile.name : 'Select or drop Excel (.xlsx) or CSV file'}
                                </div>
                                <div className="text-xs text-zinc-600">Excel (.xlsx) or CSV up to 5MB allowed</div>
                            </div>

                            <div className="pt-4 border-t border-zinc-900/60 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsBulkOpen(false)}
                                    className="bg-transparent hover:bg-zinc-900 text-zinc-400 hover:text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                                    disabled={uploading}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer flex items-center gap-2"
                                    disabled={!csvFile || uploading}
                                >
                                    {uploading ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                                            <span>Importing...</span>
                                        </>
                                    ) : (
                                        <span>Process Import</span>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Decommission Device Modal */}
            <PromptModal
                isOpen={decommissionModal !== null}
                title={`Decommission Device - ${decommissionModal?.model}`}
                message={`Decommission / deactivate device "${decommissionModal?.model}"?\nHistorical service requests, tickets, and repair logs will remain intact.`}
                inputLabel="Reason (optional):"
                placeholder="Enter decommission reason..."
                confirmText="Decommission"
                variant="warning"
                isLoading={decommissionLoading}
                onConfirm={handleConfirmDecommission}
                onCancel={() => setDecommissionModal(null)}
            />
        </div>
    );
}
