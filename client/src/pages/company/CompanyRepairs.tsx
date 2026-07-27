import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    Wrench, Plus, X, Upload, Calendar, Clock, AlertTriangle,
    CheckCircle, FileText, FileDown, ShieldAlert
} from 'lucide-react';
import { useSiteContext } from '../../context/SiteContext';
import { repairApi } from '../../services/api';

interface Device {
    id: number;
    brand: string;
    model_number: string;
    serial_number: string;
    asset_tag: string;
}

interface Employee {
    id: number;
    name: string;
    branch_name?: string;
    department?: string;
}

interface RepairRequest {
    id: number;
    ticket_number: string;
    device_id: number;
    device_brand: string;
    device_model: string;
    device_serial: string;
    employee_name: string;
    problem_type: string;
    problem_description: string;
    status: string;
    priority: string;
    sla_deadline: string;
    created_at: string;
}

export default function CompanyRepairs() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [repairs, setRepairs] = useState<RepairRequest[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const { flattenedSettings } = useSiteContext();

    // Modals
    const [isOpen, setIsOpen] = useState(false);
    const [isBulkOpen, setIsBulkOpen] = useState(false);
    const [cancelModalOpen, setCancelModalOpen] = useState(false);

    // Cancel Form
    const [cancellingTicketId, setCancellingTicketId] = useState<number | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);

    // Form fields
    const [deviceId, setDeviceId] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [problemType, setProblemType] = useState('Hardware');
    const [problemDescription, setProblemDescription] = useState('');
    const [priority, setPriority] = useState('Standard');
    const [servicePreference, setServicePreference] = useState('carry_in');
    const [preferredContact, setPreferredContact] = useState('email');

    // Bulk Upload state
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleCancelTicket = async () => {
        if (!cancellingTicketId || !token) return;
        setIsCancelling(true);
        setError('');
        setSuccess('');

        try {
            const res = await repairApi.cancelRequest(token, cancellingTicketId, cancelReason);
            if (res.ok) {
                setSuccess('Repair ticket was successfully cancelled.');
                setCancelModalOpen(false);
                setCancellingTicketId(null);
                setCancelReason('');
                fetchData();
            } else {
                setError(res.error || 'Failed to cancel the repair ticket.');
                setCancelModalOpen(false);
            }
        } catch {
            setError('Network error while cancelling ticket.');
            setCancelModalOpen(false);
        } finally {
            setIsCancelling(false);
        }
    };

    const fetchData = async () => {
        try {
            const [repRes, devRes, empRes] = await Promise.all([
                fetch('http://localhost:5000/api/company/repairs', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('http://localhost:5000/api/company/devices', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('http://localhost:5000/api/company/employees', { headers: { Authorization: `Bearer ${token}` } })
            ]);

            const repJson = await repRes.json();
            const devJson = await devRes.json();
            const empJson = await empRes.json();

            if (repJson.success) setRepairs(repJson.data);
            if (devJson.success) setDevices(devJson.data);
            if (empJson.success) setEmployees(empJson.data);
        } catch {
            setError('Failed to load corporate repairs records.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [token]);

    const handleOpenCreateModel = () => {
        setError('');
        setSuccess('');
        setDeviceId('');
        setEmployeeId('');
        setProblemType('Hardware');
        setProblemDescription('');
        setPriority('Standard');
        setServicePreference('carry_in');
        setPreferredContact('email');
        setIsOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!deviceId) {
            setError('You must select a registered company device.');
            return;
        }
        if (!problemDescription) {
            setError('Please provide a brief problem description.');
            return;
        }

        try {
            const res = await fetch('http://localhost:5000/api/company/repairs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    deviceId: parseInt(deviceId, 10),
                    employeeId: employeeId ? parseInt(employeeId, 10) : null,
                    problemType,
                    problemDescription,
                    priority,
                    servicePreference,
                    preferredContact
                })
            });
            const json = await res.json();

            if (json.success) {
                setSuccess(`Repair request submitted successfully! Ticket: ${json.data.ticketNumber}`);
                setIsOpen(false);
                fetchData();
            } else {
                setError(json.message);
            }
        } catch {
            setError('Failed to submit repair request.');
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
            const res = await fetch('http://localhost:5000/api/company/bulk-requests', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });
            const json = await res.json();

            if (json.success) {
                setSuccess(`Bulk tickets created! Registered ${json.data.imported} B2B repair tickets.`);
                setIsBulkOpen(false);
                setCsvFile(null);
                fetchData();
            } else {
                setError(json.message);
            }
        } catch {
            setError('Failed to process bulk tickets file. Ensure device serial tags match records.');
        } finally {
            setUploading(false);
        }
    };

    const handleDownloadSample = () => {
        // Generate dummy template file for bulk repairs
        const headers = 'device_serial,employee_email,problem_type,problem_description,priority,service_preference,preferred_contact\n';
        const row = 'C02F12345678,john.doe@company.com,Hardware,Screen replacement request,Urgent,carry_in,email\n';
        const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(headers + row);
        const link = document.createElement('a');
        link.setAttribute('href', csvContent);
        link.setAttribute('download', `${(flattenedSettings.company_name || 'tekdoctor').toLowerCase().replace(/\s+/g, '_')}_bulk_tickets_template.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Service Tickets</h1>
                    <p className="text-zinc-500 text-sm mt-1">Submit B2B repairs and monitor active hardware SLA resolve times.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsBulkOpen(true)}
                        className="border border-zinc-800 hover:border-zinc-700 bg-zinc-950 text-zinc-300 text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transform active:scale-[0.98] transition-all cursor-pointer"
                    >
                        <Upload size={16} className="text-indigo-400" />
                        <span>Bulk Tickets</span>
                    </button>
                    <button
                        onClick={handleOpenCreateModel}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transform active:scale-[0.98] transition-all cursor-pointer shadow-lg"
                    >
                        <Plus size={16} />
                        <span>New Ticket</span>
                    </button>
                </div>
            </div>

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

            {loading ? (
                <div className="flex items-center justify-center min-h-[300px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                </div>
            ) : repairs.length === 0 ? (
                <div className="bg-[#0c0c0c] border border-zinc-900 border-dashed rounded-2xl py-20 text-center flex flex-col items-center justify-center space-y-4">
                    <Wrench size={40} className="text-zinc-700" />
                    <div className="space-y-1">
                        <h3 className="text-zinc-300 font-bold text-base">No Tickets Found</h3>
                        <p className="text-zinc-650 text-xs max-w-sm">Need maintenance? Click New Ticket to map an employee hardware device for administrator diagnostic checks.</p>
                    </div>
                    <button
                        onClick={handleOpenCreateModel}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1.5 cursor-pointer mt-2"
                    >
                        Create Your First Ticket
                    </button>
                </div>
            ) : (
                <div className="bg-[#0c0c0c] border border-zinc-900/60 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-zinc-900 text-xs text-zinc-500 uppercase tracking-widest font-mono select-none">
                                    <th className="py-4 px-6">Ticket No.</th>
                                    <th className="py-4 px-4 font-mono">Device Details</th>
                                    <th className="py-4 px-4">User Assignment</th>
                                    <th className="py-4 px-4">Priority / Type</th>
                                    <th className="py-4 px-4">SLA Resolve Deadline</th>
                                    <th className="py-4 px-4">Status</th>
                                    <th className="py-4 px-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900/40 text-sm text-zinc-300 font-medium">
                                {repairs.map(rep => {
                                    const isSlaClose = rep.sla_deadline
                                        ? new Date(rep.sla_deadline) < new Date(Date.now() + 24 * 60 * 60 * 1000) && rep.status !== 'completed' && rep.status !== 'cancelled'
                                        : false;

                                    return (
                                        <tr key={rep.id} onClick={() => navigate(`/repair/status/?id=${rep.ticket_number || rep.id}`)} className="hover:bg-zinc-900/10 transition-colors cursor-pointer group hover:opacity-80">
                                            <td className="py-4 px-6">
                                                <span className="font-mono text-white text-sm block group-hover:text-indigo-400 transition-colors">{rep.ticket_number}</span>
                                                <span className="text-[10px] text-zinc-650 font-mono font-medium block mt-1">
                                                    {new Date(rep.created_at).toLocaleDateString()}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="text-zinc-200">{rep.device_brand} {rep.device_model}</div>
                                                <div className="text-[11px] text-zinc-500 font-mono mt-0.5">{rep.device_serial}</div>
                                            </td>
                                            <td className="py-4 px-4 text-zinc-400">
                                                {rep.employee_name || <span className="text-zinc-650 italic">Inventory</span>}
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="flex flex-col gap-1 items-start">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${rep.priority === 'Urgent'
                                                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                                        : 'bg-zinc-900 text-zinc-550 border-zinc-800'
                                                        }`}>
                                                        {rep.priority}
                                                    </span>
                                                    <span className="text-[10px] text-zinc-550 block font-mono">{rep.problem_type}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4">
                                                {rep.sla_deadline ? (
                                                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${isSlaClose ? 'text-red-400 animate-pulse' : 'text-zinc-400'
                                                        }`}>
                                                        {isSlaClose ? <ShieldAlert size={13} /> : <Clock size={13} />}
                                                        {rep.sla_deadline.replace('T', ' ').substring(0, 16)}
                                                    </span>
                                                ) : (
                                                    <span className="text-zinc-600">-</span>
                                                )}
                                            </td>
                                            <td className="py-4 px-4">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${rep.status === 'completed'
                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                    : rep.status === 'in_progress'
                                                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                                        : rep.status === 'cancelled'
                                                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                    }`}>
                                                    {rep.status.toUpperCase().replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4 text-right">
                                                {rep.status === 'pending' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setCancellingTicketId(rep.id);
                                                            setCancelModalOpen(true);
                                                        }}
                                                        className="text-[10px] uppercase font-bold text-red-500 hover:text-red-400 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors border border-red-500/20 cursor-pointer"
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* New B2B Ticket Modal */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fadeIn bg-blur-sm">
                    <div className="bg-[#0a0a0a] border border-zinc-900/80 rounded-2xl w-full max-w-lg overflow-hidden animate-slideUp">
                        <div className="px-6 py-4 border-b border-zinc-900/80 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-white">Create B2B Repair Ticket</h2>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1 col-span-2">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Select Device (Asset) *</label>
                                    <select
                                        value={deviceId}
                                        onChange={e => setDeviceId(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                    >
                                        <option value="">-- Choose Corporate Device --</option>
                                        {devices.map(d => (
                                            <option key={d.id} value={d.id}>
                                                [{d.asset_tag || 'NO-TAG'}] {d.brand} {d.model_number} (S/N: {d.serial_number})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider font-semibold">User Assignee (Employee)</label>
                                    <select
                                        value={employeeId}
                                        onChange={e => setEmployeeId(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                    >
                                        <option value="">No owner / Inventory asset</option>
                                        {employees.map(e => (
                                            <option key={e.id} value={e.id}>{e.name} ({e.department || 'All'})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Problem Type</label>
                                    <select
                                        value={problemType}
                                        onChange={e => setProblemType(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                    >
                                        <option value="Hardware">Hardware Fault</option>
                                        <option value="Software">Software/OS Bug</option>
                                        <option value="Network">Networking Error</option>
                                        <option value="Other">Other Diagnostic</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Repair Priority</label>
                                    <select
                                        value={priority}
                                        onChange={e => setPriority(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                    >
                                        <option value="Standard">Standard (Low impact)</option>
                                        <option value="Medium">Medium Priority</option>
                                        <option value="Urgent">Urgent (Restricted workflow)</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Service Option</label>
                                    <select
                                        value={servicePreference}
                                        onChange={e => setServicePreference(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-zinc-400 focus:outline-none transition-colors"
                                    >
                                        <option value="carry_in">Carry-In (Drop off)</option>
                                        <option value="pick_up">Pick-Up request</option>
                                        <option value="onsite">On-Site Technicians</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Preferred Notification</label>
                                <select
                                    value={preferredContact}
                                    onChange={e => setPreferredContact(e.target.value)}
                                    className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors"
                                >
                                    <option value="email">Email address</option>
                                    <option value="sms">SMS Text Alert</option>
                                    <option value="whatsapp">WhatsApp chat</option>
                                    <option value="phone">Direct Call</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Explain Fault *</label>
                                <textarea
                                    rows={3}
                                    placeholder="Specify problem description..."
                                    value={problemDescription}
                                    onChange={e => setProblemDescription(e.target.value)}
                                    className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors resize-none font-medium"
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
                                    Submit Request
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Cancel Proof Modal */}
            {cancelModalOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-sm">
                    <div className="bg-[#0a0a0a] border border-red-500/30 rounded-2xl w-full max-w-sm overflow-hidden animate-slideUp">
                        <div className="px-6 py-4 border-b border-zinc-900/80 flex justify-between items-center text-red-500 font-bold uppercase tracking-widest text-xs">
                            ⚠ Confirm Void Action
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-zinc-400 leading-relaxed font-semibold">
                                Voiding this ticket will alert administrators securely via system logs. You will have to create a new ticket to restore this flow.
                            </p>
                            <textarea
                                rows={2}
                                placeholder="Audit Reason (E.g. Cost, Handled internally)..."
                                value={cancelReason}
                                onChange={e => setCancelReason(e.target.value)}
                                className="w-full bg-[#050505] border border-zinc-900 focus:border-red-500/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors resize-none mb-2 font-medium"
                            />

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setCancelModalOpen(false)}
                                    disabled={isCancelling}
                                    className="bg-transparent hover:bg-zinc-900 text-zinc-500 hover:text-white px-4 py-2.5 rounded-xl text-xs uppercase tracking-widest font-bold transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCancelTicket}
                                    disabled={isCancelling}
                                    className="bg-red-500/20 text-red-500 border border-red-500/30 hover:bg-red-500/30 px-6 py-2.5 rounded-xl text-xs uppercase tracking-widest font-bold transition-colors cursor-pointer flex items-center gap-2"
                                >
                                    {isCancelling ? 'Processing...' : 'Void Ticket'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CSV Bulk Tickets Import Modal */}
            {isBulkOpen && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fadeIn bg-blur-sm">
                    <div className="bg-[#0a0a0a] border border-zinc-900/80 rounded-2xl w-full max-w-lg overflow-hidden animate-slideUp">
                        <div className="px-6 py-4 border-b border-zinc-900/80 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Upload size={18} className="text-indigo-400" />
                                <span>Bulk Tickets Importer</span>
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
                                <p>Submit numerous repair tickets in a single batch. Use a CSV document with the column headers below.</p>
                                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-900 font-mono text-[10px] text-zinc-405 overflow-x-auto select-all">
                                    device_serial,employee_email,problem_type,problem_description,priority,service_preference,preferred_contact
                                </div>
                                <button
                                    type="button"
                                    onClick={handleDownloadSample}
                                    className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1.5 cursor-pointer pt-1"
                                >
                                    <FileDown size={14} /> Download Reference Ticket Template (.csv)
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
                                            <span>Submitting...</span>
                                        </>
                                    ) : (
                                        <span>Process Tickets</span>
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
