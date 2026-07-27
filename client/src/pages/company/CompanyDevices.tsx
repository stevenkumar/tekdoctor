import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Smartphone, Plus, Edit2, Trash2, X, Upload, Calendar, FileDown, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSiteContext } from '../../context/SiteContext';

interface Employee {
    id: number;
    name: string;
}

interface Device {
    id: number;
    category: string;
    brand: string;
    model_number: string;
    serial_number: string;
    asset_tag: string;
    purchase_date: string;
    warranty_expiry: string;
    assigned_employee_id: number;
    employee_name: string;
    is_amc: number;
    amc_tag: string;
}

export default function CompanyDevices() {
    const { token } = useAuth();
    const { flattenedSettings } = useSiteContext();
    const [devices, setDevices] = useState<Device[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

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

    // Bulk Upload state
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchData = async () => {
        try {
            const [devRes, empRes] = await Promise.all([
                fetch('http://localhost:5000/api/company/devices', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('http://localhost:5000/api/company/employees', { headers: { Authorization: `Bearer ${token}` } })
            ]);

            const devJson = await devRes.json();
            const empJson = await empRes.json();

            if (devJson.success) setDevices(devJson.data);
            if (empJson.success) setEmployees(empJson.data);
        } catch {
            setError('Failed to fetch devices or employees data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [token]);

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
        setEditingId(null);
        setIsOpen(true);
    };

    const handleOpenEditModel = (dev: Device) => {
        setCategory(dev.category);
        setBrand(dev.brand);
        setModelNumber(dev.model_number);
        setSerialNumber(dev.serial_number);
        setAssetTag(dev.asset_tag || '');
        setPurchaseDate(dev.purchase_date ? dev.purchase_date.split('T')[0] : '');
        setWarrantyExpiry(dev.warranty_expiry ? dev.warranty_expiry.split('T')[0] : '');
        setAssignedEmployeeId(dev.assigned_employee_id ? String(dev.assigned_employee_id) : '');
        setIsAmc(Boolean(dev.is_amc));
        setAmcTag(dev.amc_tag || '');
        setEditingId(dev.id);
        setIsOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!brand || !modelNumber || !serialNumber) {
            setError('Brand, model, and serial number are required.');
            return;
        }

        try {
            const url = editingId
                ? `http://localhost:5000/api/company/devices/${editingId}`
                : 'http://localhost:5000/api/company/devices';
            const method = editingId ? 'PUT' : 'POST';

            const payload = {
                category,
                brand,
                modelNumber,
                serialNumber,
                assetTag,
                purchaseDate: purchaseDate || null,
                warrantyExpiry: warrantyExpiry || null,
                assignedEmployeeId: assignedEmployeeId ? parseInt(assignedEmployeeId, 10) : null,
                isAmc,
                amcTag
            };

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            const json = await res.json();

            if (json.success) {
                setSuccess(editingId ? 'Asset details updated!' : 'Device registered in assets catalogue.');
                setIsOpen(false);
                fetchData();
            } else {
                setError(json.message);
            }
        } catch {
            setError('Failed to save device information.');
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Delete this device from records?')) return;
        setError('');
        setSuccess('');

        try {
            const res = await fetch(`http://localhost:5000/api/company/devices/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success) {
                setSuccess('Device record deleted.');
                fetchData();
            } else {
                setError(json.message);
            }
        } catch {
            setError('Failed to delete asset profile.');
        }
    };

    const handleBulkUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!csvFile) return;

        setError('');
        setSuccess('');
        setUploading(true);

        const formData = new FormData();
        formData.append('csvFile', csvFile);

        try {
            const res = await fetch('http://localhost:5000/api/company/bulk-devices', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });
            const json = await res.json();

            if (json.success) {
                setSuccess(`Bulk upload successful! Imported ${json.data.imported} assets.`);
                setIsBulkOpen(false);
                setCsvFile(null);
                fetchData();
            } else {
                setError(json.message);
            }
        } catch {
            setError('Failed to process bulk import. Check file format.');
        } finally {
            setUploading(false);
        }
    };

    const handleDownloadSample = () => {
        // Generate dummy template file
        const headers = 'category,brand,model_number,serial_number,asset_tag,purchase_date,warranty_expiry\n';
        const row = 'Laptop,Apple,MacBook Pro M3,C02F12345678,ASSET-99211,2024-01-15,2027-01-15\n';
        const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(headers + row);
        const link = document.createElement('a');
        link.setAttribute('href', csvContent);
        link.setAttribute('download', `${(flattenedSettings.company_name || 'tekdoctor').toLowerCase().replace(/\s+/g, '_')}_device_template.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Tracked Assets</h1>
                    <p className="text-zinc-500 text-sm mt-1">Audit company-assigned mobile phones, laptops, and networking hardware.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsBulkOpen(true)}
                        className="border border-zinc-800 hover:border-zinc-700 bg-zinc-950 text-zinc-300 text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transform active:scale-[0.98] transition-all cursor-pointer"
                    >
                        <Upload size={16} className="text-indigo-400" />
                        <span>CSV Import</span>
                    </button>
                    <button
                        onClick={handleOpenCreateModel}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transform active:scale-[0.98] transition-all cursor-pointer shadow-lg"
                    >
                        <Plus size={16} />
                        <span>Add Asset</span>
                    </button>
                </div>
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
                <div className="flex items-center justify-center min-h-[300px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                </div>
            ) : devices.length === 0 ? (
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
                                    <th className="py-4 px-4">Warranty Expiry</th>
                                    <th className="py-4 px-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900/40 text-sm text-zinc-300">
                                {devices.map(dev => {
                                    const isWarrantyExpired = dev.warranty_expiry
                                        ? new Date(dev.warranty_expiry) < new Date()
                                        : false;

                                    return (
                                        <tr key={dev.id} className="hover:bg-zinc-900/10 transition-colors">
                                            <td className="py-4 px-6 flex flex-col gap-2 items-start justify-center">
                                                <span className="font-mono text-zinc-400 bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-900 text-xs">
                                                    {dev.asset_tag || 'UNTAGGED'}
                                                </span>
                                                {dev.is_amc === 1 && (
                                                    <span className="text-[10px] uppercase font-bold tracking-widest text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/20 px-2 py-0.5 rounded-full block">
                                                        AMC: {dev.amc_tag}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="font-bold text-white text-base leading-tight">{dev.brand}</div>
                                                <div className="text-xs text-zinc-500 mt-1">{dev.category} • {dev.model_number}</div>
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
                                            <td className="py-4 px-6 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        onClick={() => handleOpenEditModel(dev)}
                                                        className="p-2 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                                        title="Edit Asset"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(dev.id)}
                                                        className="p-2 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                                                        title="Remove Asset"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
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
                                        onChange={e => setBrand(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors animate-pulse-once"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Model Name/Number *</label>
                                    <input
                                        type="text"
                                        placeholder="MacBook Pro M3 Max"
                                        value={modelNumber}
                                        onChange={e => setModelNumber(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1 col-span-2">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider font-semibold">Serial Number *</label>
                                    <input
                                        type="text"
                                        placeholder="Provide exact hardware key"
                                        value={serialNumber}
                                        onChange={e => setSerialNumber(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors font-mono"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Purchase Date</label>
                                    <input
                                        type="date"
                                        value={purchaseDate}
                                        onChange={e => setPurchaseDate(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-zinc-400 focus:outline-none transition-colors"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Warranty Expiry</label>
                                    <input
                                        type="date"
                                        value={warrantyExpiry}
                                        onChange={e => setWarrantyExpiry(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-zinc-400 focus:outline-none transition-colors"
                                    />
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
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                                >
                                    {editingId ? 'Save Changes' : 'Register Asset'}
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
                                <span>Bulk CSV Asset Importer</span>
                            </h2>
                            <button
                                onClick={() => setIsBulkOpen(false)}
                                className="p-1 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleBulkUpload} className="p-6 space-y-6">
                            <div className="text-xs text-zinc-500 leading-relaxed space-y-2">
                                <p>Import many devices at once. Use a CSV document with the column headers below.</p>
                                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-900 font-mono text-[10px] text-zinc-405 overflow-x-auto select-all">
                                    category,brand,model_number,serial_number,asset_tag,purchase_date,warranty_expiry
                                </div>
                                <button
                                    type="button"
                                    onClick={handleDownloadSample}
                                    className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1.5 cursor-pointer pt-1"
                                >
                                    <FileDown size={14} /> Download Reference Pattern Template (.csv)
                                </button>
                            </div>

                            {/* Drag/Drop Box */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-zinc-800 hover:border-indigo-500/50 hover:bg-zinc-900/10 rounded-2xl p-8 text-center cursor-pointer transition-colors space-y-2"
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept=".csv"
                                    className="hidden"
                                    onChange={e => {
                                        const files = e.target.files;
                                        if (files && files[0]) setCsvFile(files[0]);
                                    }}
                                />
                                <Upload size={32} className="mx-auto text-zinc-650" />
                                <div className="text-sm font-semibold text-zinc-300">
                                    {csvFile ? csvFile.name : 'Select or drop CSV file'}
                                </div>
                                <div className="text-xs text-zinc-600">CSV files only up to 2MB allowed</div>
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
        </div>
    );
}
