import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { repairApi, technicianApi, adminApi } from '@/services/api';
import type { ServiceRequest, TechnicianUser, WorkLog } from '@/services/api';
import { toast } from 'react-hot-toast';
import {
    Search, RefreshCw, Loader2, Hourglass, Hammer, CheckCircle2, XCircle,
    ChevronLeft, ChevronRight, Trash2, Phone, Mail, MapPin, Calendar,
    FileImage, ExternalLink, UserCog, X, Edit2, Save, Send, AlertCircle,
    ClipboardList, Star, Image
} from 'lucide-react';
import { appConfig } from '@/config/appConfig';
import ImagePreviewModal from '@/components/ImagePreviewModal';

export default function RepairTickets() {
    const { token } = useAuth();

    // Photo Lightbox Preview state
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewSrc, setPreviewSrc] = useState('');
    const [previewAlt, setPreviewAlt] = useState('');

    const handleImagePreview = (src: string, alt: string) => {
        setPreviewSrc(src);
        setPreviewAlt(alt);
        setPreviewOpen(true);
    };

    const [requests, setRequests] = useState<ServiceRequest[]>([]);
    const [technicians, setTechnicians] = useState<TechnicianUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Bulk Actions State
    const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([]);
    const [bulkAssigning, setBulkAssigning] = useState(false);
    const [bulkTechSelect, setBulkTechSelect] = useState<number | ''>('');
    const [bulkStatusSelect, setBulkStatusSelect] = useState<string>('');

    // Modal State
    const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Partial<ServiceRequest>>({});
    const [selectedTechForAssign, setSelectedTechForAssign] = useState<number | ''>('');
    const [assigningTicket, setAssigningTicket] = useState<ServiceRequest | null>(null);
    const [quickTechSelect, setQuickTechSelect] = useState<number | ''>('');

    // Work Log & Tabs State
    type AdminModalTab = 'details' | 'work-log' | 'customer-note';
    const [modalTab, setModalTab] = useState<AdminModalTab>('details');
    const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
    const [workLogsLoading, setWorkLogsLoading] = useState(false);

    const handleBulkUpdate = async () => {
        if (!token || selectedTicketIds.length === 0) return;
        setBulkAssigning(true);
        const payload: any = { ticketIds: selectedTicketIds };
        if (bulkTechSelect !== '') {
            payload.assignedTechnicianId = Number(bulkTechSelect);
        } else if (bulkTechSelect === '') {
            // Wait, if select value is empty, do we want to clear the assignee? Or just ignore it? 
            // In our bulkUpdateTickets controller, if assignedTechnicianId is undefined, we don't update technician. 
            // So if bulkTechSelect is empty string, we don't pass it.
        }
        if (bulkStatusSelect !== '') {
            payload.status = bulkStatusSelect;
        }
        const res = await adminApi.bulkUpdateTickets(token, payload);
        if (res.ok) {
            toast.success(`Bulk update successful for ${selectedTicketIds.length} tickets!`);
            setSelectedTicketIds([]);
            setBulkTechSelect('');
            setBulkStatusSelect('');
            fetchData();
        } else {
            toast.error(res.error || 'Failed to update tickets');
        }
        setBulkAssigning(false);
    };

    // Loading States
    const [statusLoading, setStatusLoading] = useState<number | null>(null);
    const [assignLoading, setAssignLoading] = useState<number | null>(null);
    const [deleteLoading, setDeleteLoading] = useState<number | null>(null);
    const [editLoading, setEditLoading] = useState(false);
    const [notifyLoading, setNotifyLoading] = useState<number | null>(null);

    const handleQuickAssign = async () => {
        if (!token || !assigningTicket) return;
        const techId = quickTechSelect === '' ? null : Number(quickTechSelect);
        setAssignLoading(assigningTicket.id);
        const res = await repairApi.assignTechnician(token, assigningTicket.id, techId);
        if (res.ok) {
            setRequests(prev => prev.map(r => r.id === assigningTicket.id ? {
                ...r,
                pendingTechnicianId: techId,
                assignedTechnicianId: techId ? r.assignedTechnicianId : null
            } : r));
            if (selectedRequest?.id === assigningTicket.id) {
                setSelectedRequest(prev => prev ? {
                    ...prev,
                    pendingTechnicianId: techId,
                    assignedTechnicianId: techId ? prev.assignedTechnicianId : null
                } : null);
                setSelectedTechForAssign(techId || '');
            }
            toast.success('Technician assignment pending approval!');
            setAssigningTicket(null);
        } else {
            toast.error(res.error || 'Failed to assign technician');
        }
        setAssignLoading(null);
    };

    const fetchData = async (targetPage = page, targetFilter = activeFilter) => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await repairApi.getRequests(token, targetFilter, targetPage, 50);
            if (res.ok && res.data) {
                setRequests(res.data.data.data || []);
                setTotalPages(res.data.data.pagination?.totalPages || 1);
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    // Load technicians list once on mount or when token changes
    useEffect(() => {
        const fetchTechs = async () => {
            if (!token) return;
            try {
                const res = await technicianApi.getAll(token);
                if (res.ok && res.data) {
                    setTechnicians(res.data.data || []);
                }
            } catch (e) {
                console.error(e);
            }
        };
        fetchTechs();
    }, [token]);

    // Load repairs list when page or filter changes
    useEffect(() => {
        fetchData(page, activeFilter);
    }, [token, page, activeFilter]);

    // Handle deep linking to a specific ticket via ID query param
    const [searchParams, setSearchParams] = useSearchParams();

    useEffect(() => {
        const idParam = searchParams.get('id');
        if (idParam && token) {
            const ticketId = Number(idParam);
            // Check if ticket is already in current local state
            const localTicket = requests.find(r => r.id === ticketId);
            if (localTicket) {
                openModal(localTicket);
                // clear param after opening
                searchParams.delete('id');
                setSearchParams(searchParams, { replace: true });
            } else {
                // Fetch directly from server
                repairApi.getRequestById(token, ticketId).then(res => {
                    if (res.ok && res.data && res.data.data) {
                        openModal(res.data.data as ServiceRequest);
                        searchParams.delete('id');
                        setSearchParams(searchParams, { replace: true });
                    }
                }).catch(err => console.error(err));
            }
        }
    }, [searchParams, token, requests]);

    const fetchWorkLogs = useCallback(async (repairId: number) => {
        if (!token) return;
        setWorkLogsLoading(true);
        try {
            const res = await repairApi.getWorkLogs(token, repairId);
            if (res.ok && res.data) {
                setWorkLogs((res.data as any).data || []);
            }
        } finally {
            setWorkLogsLoading(false);
        }
    }, [token]);

    // Fetch work logs when switching to work-log tab
    useEffect(() => {
        if (modalTab === 'work-log' && selectedRequest) {
            fetchWorkLogs(selectedRequest.id);
        }
    }, [modalTab, selectedRequest, fetchWorkLogs]);

    const filteredRequests = requests.filter(r => {
        const matchFilter = activeFilter === 'all' || r.status.toLowerCase() === activeFilter;
        const q = searchQuery.toLowerCase().trim();
        const matchSearch = !q ||
            (r.ticketNumber && r.ticketNumber.toLowerCase().includes(q)) ||
            r.customerName.toLowerCase().includes(q) ||
            r.mobile.includes(q) ||
            r.brand.toLowerCase().includes(q) ||
            r.deviceCategory.toLowerCase().includes(q) ||
            r.city.toLowerCase().includes(q);
        return matchFilter && matchSearch;
    });

    const openModal = (r: ServiceRequest) => {
        setSelectedRequest(r);
        setIsEditing(false);
        setEditForm(r);
        setSelectedTechForAssign(r.pendingTechnicianId || r.assignedTechnicianId || '');
        setModalTab('details');
        setWorkLogs([]);
    };


    const handleStatusChange = async (id: number, status: string) => {
        if (!token) return;
        setStatusLoading(id);
        const res = await repairApi.updateStatus(token, id, status);
        if (res.ok) {
            const validStatus = status as 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled';
            setRequests(prev => prev.map(r => r.id === id ? { ...r, status: validStatus } : r));
            if (selectedRequest?.id === id) setSelectedRequest(prev => prev ? { ...prev, status: validStatus } : null);
        }
        setStatusLoading(null);
    };

    const handleAssign = async () => {
        if (!token || !selectedRequest || selectedTechForAssign === '') return;
        const techId = Number(selectedTechForAssign);
        setAssignLoading(selectedRequest.id);
        const res = await repairApi.assignTechnician(token, selectedRequest.id, techId);
        if (res.ok) {
            setRequests(prev => prev.map(r => r.id === selectedRequest.id ? {
                ...r,
                pendingTechnicianId: techId,
                assignedTechnicianId: techId ? r.assignedTechnicianId : null
            } : r));
            setSelectedRequest(prev => prev ? {
                ...prev,
                pendingTechnicianId: techId,
                assignedTechnicianId: techId ? prev.assignedTechnicianId : null
            } : null);
            toast.success('Technician assignment pending approval!');
        } else {
            toast.error(res.error || 'Failed to assign technician');
        }
        setAssignLoading(null);
    };

    const handleDelete = async (id: number) => {
        if (!token || !confirm('Permanently delete this repair record?')) return;
        setDeleteLoading(id);
        const res = await repairApi.deleteRequest(token, id);
        if (res.ok) {
            setRequests(prev => prev.filter(r => r.id !== id));
            if (selectedRequest?.id === id) setSelectedRequest(null);
        }
        setDeleteLoading(null);
    };

    const handleNotifyCustomer = async (id: number) => {
        if (!token || !confirm('Send completion notification email to customer?')) return;
        setNotifyLoading(id);
        const res = await repairApi.notifyCustomer(token, id);
        if (res.ok) toast.success('Customer notified successfully!');
        else toast.error('Failed to notify customer.');
        setNotifyLoading(null);
    };

    const handleSaveEdit = async () => {
        if (!token || !selectedRequest) return;
        setEditLoading(true);
        const res = await repairApi.updateRequest(token, selectedRequest.id, editForm);
        if (res.ok) {
            setRequests(prev => prev.map(r => r.id === selectedRequest.id ? { ...r, ...editForm } : r));
            setSelectedRequest(prev => prev ? { ...prev, ...editForm } as ServiceRequest : null);
            setIsEditing(false);
        } else {
            toast.error(res.error || 'Failed to save changes.');
        }
        setEditLoading(false);
    };

    const getFileUrl = (path: string | null) => {
        if (!path) return null;
        const base = (appConfig.apiUrl || window.location.origin).replace(/\/$/, '');
        const cleanPath = path.replace(/^\//, '');
        return `${base}/${cleanPath}`;
    };

    const getStatusBadge = (status: string) => {
        const map: Record<string, { cls: string; icon: any; label: string }> = {
            pending: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: Hourglass, label: 'PENDING' },
            in_progress: { cls: 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/20', icon: Hammer, label: 'IN_PROGRESS' },
            completed: { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: CheckCircle2, label: 'COMPLETED' },
            delivered: { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: CheckCircle2, label: 'DELIVERED' },
            cancelled: { cls: 'bg-red-500/10 text-red-400 border-red-500/20', icon: XCircle, label: 'CANCELLED' },
        };
        const s = map[status.toLowerCase()] || { cls: 'bg-zinc-800 text-zinc-400 border-zinc-700', icon: null, label: status };
        const Icon = s.icon;
        return (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold border ${s.cls}`}>
                {Icon && <Icon size={12} />}{s.label}
            </span>
        );
    };

    const tabs = [
        { id: 'all', label: 'All' },
        { id: 'pending', label: 'Pending' },
        { id: 'in_progress', label: 'In Porgress' },
        { id: 'completed', label: 'Completed' },
        { id: 'delivered', label: 'Delivered' },
        { id: 'cancelled', label: 'Cancelled' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight">Repair Tickets</h1>
                    <p className="text-xs text-zinc-500 mt-1">Manage all repair requests</p>
                </div>
                <button onClick={() => fetchData()} className="flex items-center gap-2 px-4 py-2 bg-zinc-900/60 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:border-neon-cyan/30 transition-all cursor-pointer">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh
                </button>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="flex flex-wrap gap-1.5 bg-zinc-900/40 p-1 rounded-xl border border-zinc-900">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => { setActiveFilter(tab.id); setPage(1); }}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${activeFilter === tab.id ? 'bg-neon-cyan text-black' : 'text-zinc-400 hover:text-white'}`}
                        >
                            {tab.label}
                            <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono ${activeFilter === tab.id ? 'bg-black/20 text-black font-bold' : 'bg-zinc-800 text-zinc-500'}`}>
                                {tab.id === 'all' ? requests.length : requests.filter(r => r.status.toLowerCase() === tab.id).length}
                            </span>
                        </button>
                    ))}
                </div>
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
                    <input
                        type="text" placeholder="Search name, phone, device..."
                        value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-zinc-900/40 border border-zinc-800/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-neon-cyan transition-all"
                    />
                </div>
            </div>

            {loading ? (
                <div className="min-h-[40vh] flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 text-neon-cyan animate-spin mb-3" />
                </div>
            ) : filteredRequests.length === 0 ? (
                <div className="border border-zinc-900 bg-zinc-950/20 rounded-2xl p-16 text-center">
                    <p className="text-zinc-500 text-sm">No tickets found.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {selectedTicketIds.length > 0 && (
                        <div className="bg-zinc-950 border border-neon-cyan/25 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-neon-cyan font-bold uppercase">{selectedTicketIds.length} tickets selected</span>
                                <button onClick={() => setSelectedTicketIds([])} className="text-[10px] text-zinc-500 hover:text-white underline cursor-pointer">Clear</button>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                                <select
                                    value={bulkTechSelect}
                                    onChange={e => setBulkTechSelect(e.target.value === '' ? '' : Number(e.target.value))}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none cursor-pointer"
                                >
                                    <option value="">Assign Technician...</option>
                                    {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                <select
                                    value={bulkStatusSelect}
                                    onChange={e => setBulkStatusSelect(e.target.value)}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none cursor-pointer"
                                >
                                    <option value="">Update Status...</option>
                                    <option value="pending">Pending</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="completed">Completed</option>
                                    <option value="delivered">Delivered</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                                <button
                                    onClick={handleBulkUpdate}
                                    disabled={bulkAssigning || (!bulkTechSelect && !bulkStatusSelect)}
                                    className="bg-neon-cyan hover:bg-neon-cyan text-black px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    {bulkAssigning ? 'Applying...' : 'Apply Bulk Actions'}
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="border border-zinc-900 bg-zinc-900/20 rounded-2xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-500">
                                        <th className="p-4 w-12 text-center">
                                            <input
                                                type="checkbox"
                                                checked={filteredRequests.length > 0 && selectedTicketIds.length === filteredRequests.length}
                                                onChange={e => {
                                                    if (e.target.checked) {
                                                        setSelectedTicketIds(filteredRequests.map(r => r.id));
                                                    } else {
                                                        setSelectedTicketIds([]);
                                                    }
                                                }}
                                                className="rounded border-zinc-800 bg-zinc-900 text-neon-cyan focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                            />
                                        </th>
                                        <th className="p-4">ID</th>
                                        <th className="p-4">Customer</th>
                                        <th className="p-4">Device</th>
                                        <th className="p-4">Status</th>
                                        <th className="p-4">Technician</th>
                                        <th className="p-4">Priority</th>
                                        <th className="p-4">Date</th>
                                        <th className="p-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900/50">
                                    {filteredRequests.map(r => {
                                        const tech = technicians.find(t => t.id === r.assignedTechnicianId);
                                        const isSelected = selectedTicketIds.includes(r.id);
                                        return (
                                            <tr key={r.id} className={`hover:bg-zinc-900/30 transition-colors cursor-pointer group ${isSelected ? 'bg-neon-cyan/10' : ''}`} onClick={() => openModal(r)}>
                                                <td className="p-4 text-center w-12" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={e => {
                                                            if (e.target.checked) {
                                                                setSelectedTicketIds(prev => [...prev, r.id]);
                                                            } else {
                                                                setSelectedTicketIds(prev => prev.filter(id => id !== r.id));
                                                            }
                                                        }}
                                                        className="rounded border-zinc-800 bg-zinc-900 text-neon-cyan focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="p-4 text-xs font-mono text-neon-cyan font-bold">{r.ticketNumber || `#${r.id}`}</td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-white font-medium">{r.customerName}</span>
                                                        {(r as any).repeatCount > 1 && (
                                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-rose-500/10 text-rose-400 border border-rose-500/20" title="This device has been sent for repair multiple times">
                                                                Repeat Failure ({(r as any).repeatCount})
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500">{r.mobile}</div>
                                                </td>
                                                <td className="p-4 text-xs text-zinc-400">{r.deviceCategory} - {r.brand}</td>
                                                <td className="p-4">{getStatusBadge(r.status)}</td>
                                                <td className="p-4 text-xs text-zinc-400">
                                                    {r.pendingTechnicianId ? (
                                                        <span className="text-amber-500 font-mono text-[10px] uppercase border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded">Pending: {technicians.find(t => t.id === r.pendingTechnicianId)?.name}</span>
                                                    ) : tech ? tech.name : <span className="text-zinc-600 italic">Unassigned</span>}
                                                </td>
                                                <td className="p-4">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${r.priority?.toLowerCase() === 'priority' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>{r.priority}</span>
                                                </td>
                                                <td className="p-4 text-xs text-zinc-500 font-mono">{new Date(r.createdAt).toLocaleDateString()}</td>
                                                <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                                                    <div className="flex justify-end gap-1.5">
                                                        <button
                                                            onClick={() => handleNotifyCustomer(r.id)}
                                                            disabled={notifyLoading === r.id || r.status.toLowerCase() !== 'completed'}
                                                            className={`p-1.5 rounded-lg border transition-all cursor-pointer inline-flex items-center text-xs ${r.status.toLowerCase() === 'completed'
                                                                ? 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300'
                                                                : 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed opacity-40'
                                                                }`}
                                                            title={r.status.toLowerCase() === 'completed' ? "Notify Customer" : "Only completed tickets can notify customer"}
                                                        >
                                                            {notifyLoading === r.id ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setAssigningTicket(r);
                                                                setQuickTechSelect(r.pendingTechnicianId || r.assignedTechnicianId || '');
                                                            }}
                                                            className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-neon-cyan text-zinc-400 hover:text-white transition-all cursor-pointer inline-flex items-center text-xs"
                                                            title="Assign Technician"
                                                        >
                                                            <UserCog size={12} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(r.id)} disabled={deleteLoading === r.id}
                                                            className="p-1.5 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 text-red-500 transition-all cursor-pointer inline-flex items-center gap-1 text-xs"
                                                            title="Delete Ticket"
                                                        >
                                                            {deleteLoading === r.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
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
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"><ChevronLeft size={16} /></button>
                    <span className="text-xs font-mono text-zinc-500">Page {page} of {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"><ChevronRight size={16} /></button>
                </div>
            )}

            {/* Detail/Edit Modal */}
            {selectedRequest && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedRequest(null)}>
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-cyan to-blue-500" />

                        <div className="p-6 border-b border-zinc-900 flex items-start justify-between shrink-0">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <span className="text-xs font-mono text-neon-cyan font-bold">{selectedRequest.ticketNumber || `TICKET #${selectedRequest.id}`}</span>
                                    {getStatusBadge(selectedRequest.status)}
                                </div>
                                <h3 className="text-xl font-bold text-white font-outfit">{selectedRequest.customerName}</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                {!isEditing ? (
                                    <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-white hover:border-neon-cyan/50 cursor-pointer transition-all text-xs font-semibold">
                                        <Edit2 size={12} /> Edit
                                    </button>
                                ) : (
                                    <button onClick={handleSaveEdit} disabled={editLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neon-cyan text-black hover:bg-neon-cyan cursor-pointer transition-all text-xs font-bold disabled:opacity-50">
                                        {editLoading ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                                    </button>
                                )}
                                <button onClick={() => setSelectedRequest(null)} className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white cursor-pointer"><X size={18} /></button>
                            </div>
                        </div>

                        {/* Tab Bar */}
                        <div className="flex border-b border-zinc-900 px-6 pt-1 gap-1">
                            {([['details', 'Details', null], ['work-log', 'Work Log', <ClipboardList size={12} key="wl" />], ['customer-note', 'Customer Note', <Star size={12} key="cn" />]] as [AdminModalTab, string, React.ReactNode][]).map(([id, label, icon]) => (
                                <button key={id} onClick={() => setModalTab(id)} className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap border-b-2 -mb-px ${modalTab === id ? 'text-neon-cyan border-neon-cyan bg-neon-cyan/5' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>
                                    {icon}{label}
                                </button>
                            ))}
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto grow">
                            {modalTab === 'details' && (<>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 space-y-2">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Contact</div>
                                        <div className="space-y-2 text-xs text-zinc-300">
                                            {!isEditing ? (
                                                <>
                                                    <div className="flex items-center gap-2"><Phone size={12} className="text-neon-cyan" />{selectedRequest.mobile}</div>
                                                    {selectedRequest.email && <div className="flex items-center gap-2"><Mail size={12} className="text-neon-cyan" />{selectedRequest.email}</div>}
                                                    <div className="flex items-center gap-2"><MapPin size={12} className="text-neon-cyan" />{selectedRequest.city}</div>
                                                </>
                                            ) : (
                                                <div className="space-y-2">
                                                    <input type="text" value={editForm.customerName} onChange={e => setEditForm(p => ({ ...p, customerName: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 focus:border-neon-cyan focus:outline-none" placeholder="Name" />
                                                    <input type="text" value={editForm.mobile} onChange={e => setEditForm(p => ({ ...p, mobile: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 focus:border-neon-cyan focus:outline-none" placeholder="Phone" />
                                                    <input type="text" value={editForm.email || ''} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 focus:border-neon-cyan focus:outline-none" placeholder="Email" />
                                                    <input type="text" value={editForm.city} onChange={e => setEditForm(p => ({ ...p, city: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 focus:border-neon-cyan focus:outline-none" placeholder="City" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 space-y-2">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Device</div>
                                        <div className="space-y-2 text-xs text-zinc-300">
                                            {!isEditing ? (
                                                <>
                                                    <div>{selectedRequest.deviceCategory} - {selectedRequest.brand}</div>
                                                    {selectedRequest.modelNumber && <div>Model: {selectedRequest.modelNumber}</div>}
                                                    {selectedRequest.serialNumber && <div>Serial Number: {selectedRequest.serialNumber}</div>}
                                                    {selectedRequest.deviceConfiguration && <div>Config: {selectedRequest.deviceConfiguration}</div>}
                                                    <div>Problem: {selectedRequest.problemType}</div>
                                                    <div>Priority: <span className="uppercase text-neon-cyan font-bold">{selectedRequest.priority}</span></div>
                                                </>
                                            ) : (
                                                <div className="space-y-2">
                                                    <input type="text" value={editForm.deviceCategory} onChange={e => setEditForm(p => ({ ...p, deviceCategory: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 focus:border-neon-cyan focus:outline-none" placeholder="Category" />
                                                    <input type="text" value={editForm.brand} onChange={e => setEditForm(p => ({ ...p, brand: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 focus:border-neon-cyan focus:outline-none" placeholder="Brand" />
                                                    <input type="text" value={editForm.modelNumber || ''} onChange={e => setEditForm(p => ({ ...p, modelNumber: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 focus:border-neon-cyan focus:outline-none" placeholder="Model" />
                                                    <input type="text" value={editForm.serialNumber || ''} onChange={e => setEditForm(p => ({ ...p, serialNumber: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 focus:border-neon-cyan focus:outline-none" placeholder="Serial Number" />
                                                    <textarea value={editForm.deviceConfiguration || ''} onChange={e => setEditForm(p => ({ ...p, deviceConfiguration: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 focus:border-neon-cyan focus:outline-none text-xs" placeholder="Device Configuration" rows={2} />
                                                    <input type="text" value={editForm.problemType} onChange={e => setEditForm(p => ({ ...p, problemType: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 focus:border-neon-cyan focus:outline-none" placeholder="Problem Type" />
                                                    <select value={editForm.priority || 'Standard'} onChange={e => setEditForm(p => ({ ...p, priority: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 focus:border-neon-cyan focus:outline-none cursor-pointer">
                                                        <option value="Low">Low</option><option value="Standard">Standard</option><option value="Priority">Priority</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {(!isEditing && selectedRequest.problemDescription) ? (
                                    <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">Description</div>
                                        <p className="text-sm text-zinc-300 whitespace-pre-wrap">{selectedRequest.problemDescription}</p>
                                    </div>
                                ) : isEditing ? (
                                    <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">Description</div>
                                        <textarea value={editForm.problemDescription || ''} onChange={e => setEditForm(p => ({ ...p, problemDescription: e.target.value }))} rows={4} className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 focus:border-neon-cyan focus:outline-none text-sm text-zinc-300 resize-y" />
                                    </div>
                                ) : null}

                                {(!isEditing && (selectedRequest as any).feedbackRating) && (
                                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-yellow-500 font-bold mb-2 flex items-center gap-2">
                                            <Star size={12} className="fill-yellow-500/50" /> Customer Service Feedback
                                        </div>
                                        <div className="flex items-center gap-1 mb-2">
                                            {Array.from({ length: (selectedRequest as any).feedbackRating }).map((_, i) => (
                                                <Star key={i} size={16} className="text-yellow-400 fill-yellow-400" />
                                            ))}
                                        </div>
                                        {(selectedRequest as any).feedbackComment && (
                                            <p className="text-sm text-yellow-200/80 italic mt-2 border-t border-yellow-500/20 pt-2 selection:bg-yellow-500/30">
                                                "{(selectedRequest as any).feedbackComment}"
                                            </p>
                                        )}
                                    </div>
                                )}

                                {(!isEditing && (selectedRequest.imagePath || selectedRequest.screenshotPath)) && (
                                    <div className="grid grid-cols-2 gap-4 my-2">
                                        {selectedRequest.imagePath && (
                                            <div className="border border-zinc-900 bg-zinc-950/45 rounded-xl p-3 flex flex-col gap-2 group hover:border-zinc-800 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-mono text-zinc-400 font-semibold flex items-center gap-1.5">
                                                        <FileImage size={12} className="text-neon-cyan" /> DEVICE_PHOTO
                                                    </span>
                                                    <span className="text-[9px] font-mono text-zinc-650 uppercase">Preview</span>
                                                </div>
                                                <div className="h-20 w-auto overflow-hidden bg-black rounded border border-zinc-900/80 flex items-center justify-center cursor-pointer" onClick={() => handleImagePreview(getFileUrl(selectedRequest.imagePath)!, 'Device Photo')}>
                                                    <img src={getFileUrl(selectedRequest.imagePath)!} alt="Device Photo" className="max-h-full max-w-full object-contain transition-transform duration-300 hover:scale-105" />
                                                </div>
                                            </div>
                                        )}
                                        {selectedRequest.screenshotPath && (
                                            <div className="border border-zinc-900 bg-zinc-950/45 rounded-xl p-3 flex flex-col gap-2 group hover:border-zinc-800 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-mono text-zinc-400 font-semibold flex items-center gap-1.5">
                                                        <FileImage size={12} className="text-neon-cyan" /> ERROR_SCREENSHOT
                                                    </span>
                                                    <span className="text-[9px] font-mono text-zinc-650 uppercase">Preview</span>
                                                </div>
                                                <div className="h-20 w-auto overflow-hidden bg-black rounded border border-zinc-900/80 flex items-center justify-center cursor-pointer" onClick={() => handleImagePreview(getFileUrl(selectedRequest.screenshotPath)!, 'Screenshot')}>
                                                    <img src={getFileUrl(selectedRequest.screenshotPath)!} alt="Screenshot" className="max-h-full max-w-full object-contain transition-transform duration-300 hover:scale-105" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!isEditing && (
                                    <>
                                        {/* Status Update */}
                                        <div className="border-t border-zinc-900 pt-4">
                                            <div className="text-xs text-zinc-500 font-mono mb-3">UPDATE STATUS:</div>
                                            <div className="flex flex-wrap gap-2">
                                                {statusLoading === selectedRequest.id ? <Loader2 className="animate-spin text-neon-cyan" size={18} /> : (
                                                    ['pending', 'in_progress', 'completed', 'delivered', 'cancelled'].map(st => (
                                                        <button key={st} onClick={() => handleStatusChange(selectedRequest.id, st)} disabled={selectedRequest.status === st}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border disabled:cursor-not-allowed ${selectedRequest.status === st ? 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/40' : 'bg-zinc-950 border-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'}`}
                                                        >{st.replace('_', ' ').toUpperCase()}</button>
                                                    ))
                                                )}
                                            </div>
                                        </div>

                                        {/* Repeat Treatment Timeline Insights */}
                                        {(selectedRequest as any).repairHistory?.length > 1 && (
                                            <div className="mt-4 p-4 border border-rose-500/20 bg-rose-500/5 rounded-xl">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <AlertCircle size={14} className="text-rose-400" />
                                                    <h4 className="text-xs font-mono uppercase font-bold text-rose-400 tracking-wider">Recurring Issue Warning</h4>
                                                </div>
                                                <p className="text-xs text-zinc-400 mb-3">This hardware was submitted for service {(selectedRequest as any).repeatCount} times.</p>

                                                <div className="space-y-2 border-l-2 border-zinc-900 ml-2 pl-3 relative">
                                                    {(selectedRequest as any).repairHistory.map((hist: any, index: number) => (
                                                        <div key={index} className="relative">
                                                            <div className={`absolute -left-[19px] top-1.5 w-2 h-2 rounded-full border-2 border-[#0c0c0c] ${hist.id === selectedRequest.id ? 'bg-rose-400' : 'bg-zinc-700'}`}></div>
                                                            <div className={`text-xs ${hist.id === selectedRequest.id ? 'text-white font-bold' : 'text-zinc-500'}`}>
                                                                {hist.ticketNumber || `#${hist.id}`} - {new Date(hist.createdAt).toLocaleDateString()}
                                                                <span className="ml-2 uppercase text-[9px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">{hist.status}</span>
                                                            </div>
                                                            <div className="text-[10px] text-zinc-600 mt-1 pl-1 italic">
                                                                "{hist.issueDescription?.substring(0, 50)}{hist.issueDescription?.length > 50 ? '...' : ''}"
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Assign Technician */}
                                        <div className="border-t border-zinc-900 pt-4 bg-zinc-950/30 -mx-6 px-6 pb-2 mt-4 rounded-b-2xl">
                                            <div className="text-xs text-zinc-400 font-mono mb-3 flex items-center gap-2">
                                                <UserCog size={14} className="text-neon-cyan" />ASSIGN TECHNICIAN
                                            </div>
                                            <div className="flex gap-3">
                                                <select
                                                    value={selectedTechForAssign}
                                                    onChange={e => setSelectedTechForAssign(e.target.value === '' ? '' : Number(e.target.value))}
                                                    className="flex-grow bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan cursor-pointer"
                                                >
                                                    <option value="">-- No Technician Selected --</option>
                                                    {technicians.map(t => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
                                                </select>
                                                <button
                                                    onClick={handleAssign}
                                                    disabled={assignLoading === selectedRequest.id || selectedTechForAssign === '' || selectedTechForAssign === (selectedRequest.pendingTechnicianId || selectedRequest.assignedTechnicianId)}
                                                    className="shrink-0 flex items-center gap-2 bg-neon-cyan hover:bg-neon-cyan text-black px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                                >
                                                    {assignLoading === selectedRequest.id ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                                    Assign
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </>)}

                            {/* Work Log Tab */}
                            {modalTab === 'work-log' && (
                                <div className="space-y-4">
                                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Technician Work Log History</div>
                                    {workLogsLoading ? (
                                        <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 size={13} className="animate-spin" /> Loading logs...</div>
                                    ) : workLogs.length === 0 ? (
                                        <div className="text-center py-10 border border-zinc-900 rounded-xl text-zinc-600 text-xs">No work log entries for this ticket yet.</div>
                                    ) : (
                                        <div className="space-y-3">
                                            {workLogs.map(log => (
                                                <div key={log.id} className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 space-y-2">
                                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold border bg-blue-500/10 text-blue-400 border-blue-500/20">{log.repair_stage}</span>
                                                        <span className="text-[10px] font-mono text-zinc-600">{new Date(log.created_at).toLocaleString()}</span>
                                                    </div>
                                                    <p className="text-sm text-zinc-300 leading-relaxed">{log.action_performed}</p>
                                                    <div className="flex flex-wrap gap-4 text-xs">
                                                        {log.parts_replaced && <span className="text-zinc-400"><span className="text-zinc-600">Parts:</span> {log.parts_replaced}</span>}
                                                        {log.time_spent && <span className="text-zinc-400"><span className="text-zinc-600">Time:</span> {log.time_spent}</span>}
                                                        {log.technician_name && <span className="text-zinc-500 font-mono"><span className="text-zinc-600">Technician:</span> {log.technician_name}</span>}
                                                    </div>
                                                    {log.notes && <p className="text-xs text-zinc-500 italic border-l-2 border-zinc-800 pl-3">{log.notes}</p>}
                                                    {log.media_path && (
                                                        <a href={getFileUrl(log.media_path)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-neon-cyan text-xs hover:underline">
                                                            <FileImage size={12} /> View Media <ExternalLink size={10} />
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Customer Note Tab */}
                            {modalTab === 'customer-note' && (
                                <div className="space-y-3">
                                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Customer-Facing Repair Description</div>
                                    {(selectedRequest as any).customerRepairDescription ? (
                                        <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                            {(selectedRequest as any).customerRepairDescription}
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 border border-zinc-900 rounded-xl text-zinc-600 text-xs">No customer repair description yet. Technicians can add this from their dashboard.</div>
                                    )}
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            )}

            {/* Quick Assign Modal */}
            {assigningTicket && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setAssigningTicket(null)}>
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-cyan to-blue-500" />

                        <div className="p-6 border-b border-zinc-900 flex items-center justify-between shrink-0">
                            <div>
                                <span className="text-[10px] font-mono text-neon-cyan font-bold block mb-1">QUICK ASSIGN</span>
                                <h3 className="text-base font-bold text-white font-outfit">{assigningTicket.ticketNumber || `Ticket #${assigningTicket.id}`}</h3>
                            </div>
                            <button onClick={() => setAssigningTicket(null)} className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white cursor-pointer"><X size={18} /></button>
                        </div>

                        <div className="p-6 space-y-4">
                            <p className="text-xs text-zinc-400 leading-relaxed">
                                Assign technician to work on request from <span className="text-white font-medium">{assigningTicket.customerName}</span> for <span className="text-white font-medium">{assigningTicket.brand} {assigningTicket.deviceCategory}</span>.
                            </p>

                            <div className="space-y-2">
                                <label className="text-[10px] text-zinc-500 font-mono block">SELECT TECHNICIAN</label>
                                <select
                                    value={quickTechSelect}
                                    onChange={e => setQuickTechSelect(e.target.value === '' ? '' : Number(e.target.value))}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan cursor-pointer"
                                >
                                    <option value="">-- No Technician (Unassigned) --</option>
                                    {technicians.map(t => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="p-4 bg-zinc-950/40 border-t border-zinc-900 flex justify-end gap-2 shrink-0">
                            <button onClick={() => setAssigningTicket(null)} className="px-4 py-2 bg-zinc-950 border border-zinc-850 hover:bg-zinc-900 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer">
                                Cancel
                            </button>
                            <button
                                onClick={handleQuickAssign}
                                disabled={assignLoading === assigningTicket.id || quickTechSelect === (assigningTicket.pendingTechnicianId || assigningTicket.assignedTechnicianId || '')}
                                className="flex items-center gap-1.5 bg-neon-cyan hover:bg-neon-cyan text-black px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                                {assignLoading === assigningTicket.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                Assign
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Image Lightbox Preview Modal */}
            <ImagePreviewModal
                isOpen={previewOpen}
                onClose={() => setPreviewOpen(false)}
                src={previewSrc}
                alt={previewAlt}
            />
        </div>
    );
}
