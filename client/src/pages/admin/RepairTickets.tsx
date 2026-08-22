import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { repairApi, technicianApi, adminApi } from '@/services/api';
import type { ServiceRequest, TechnicianUser, WorkLog, RepairFilters, TaskTransfer } from '@/services/api';
import { toast } from 'react-hot-toast';
import {
    Search, RefreshCw, Loader2, Hourglass, Hammer, CheckCircle2, XCircle,
    ChevronLeft, ChevronRight, Trash2, Phone, Mail, MapPin, Calendar,
    FileImage, ExternalLink, UserCog, X, Edit2, Save, Send, AlertCircle,
    ClipboardList, Star, Filter, FilterX, ChevronDown, RotateCcw,
    Laptop, Smartphone, SlidersHorizontal, Check, ShieldCheck, ShieldOff,
    ArrowRightLeft, Layers
} from 'lucide-react';
import { appConfig } from '@/config/appConfig';
import ImagePreviewModal from '@/components/ImagePreviewModal';

const STANDARD_DEVICE_CATEGORIES = [
    'Laptop', 'Desktop', 'Smartphone', 'Tablet', 'Server', 'Printer', 'Smartwatch', 'Other'
];

export default function RepairTickets() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

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

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState(() => searchParams.get('status') || 'all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [technicianFilter, setTechnicianFilter] = useState('all');
    const [deviceCategoryFilter, setDeviceCategoryFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Date Picker Popover State
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [tempStartDate, setTempStartDate] = useState('');
    const [tempEndDate, setTempEndDate] = useState('');
    const datePickerRef = useRef<HTMLDivElement>(null);

    // Pagination & Status counts
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [statusCounts, setStatusCounts] = useState<Record<string, number>>({
        all: 0,
        pending: 0,
        in_progress: 0,
        completed: 0,
        delivered: 0,
        cancelled: 0
    });

    // Unique device categories for filter dropdown
    const [deviceCategories, setDeviceCategories] = useState<string[]>(STANDARD_DEVICE_CATEGORIES);

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

    // Work Log, Transfers & Tabs State
    type AdminModalTab = 'details' | 'work-log' | 'transfers' | 'customer-note';
    const [modalTab, setModalTab] = useState<AdminModalTab>('details');
    const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
    const [workLogsLoading, setWorkLogsLoading] = useState(false);
    const [transfersChain, setTransfersChain] = useState<TaskTransfer[]>([]);
    const [transfersLoading, setTransfersLoading] = useState(false);

    // Loading States
    const [statusLoading, setStatusLoading] = useState<number | null>(null);
    const [assignLoading, setAssignLoading] = useState<number | null>(null);
    const [deleteLoading, setDeleteLoading] = useState<number | null>(null);
    const [editLoading, setEditLoading] = useState(false);
    const [notifyLoading, setNotifyLoading] = useState<number | null>(null);

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery.trim());
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Close date picker on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
                setShowDatePicker(false);
            }
        };
        if (showDatePicker) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showDatePicker]);

    // Sync status from URL search params if present on initial load
    useEffect(() => {
        const statusParam = searchParams.get('status');
        if (statusParam && statusParam !== activeFilter) {
            setActiveFilter(statusParam);
        }
    }, [searchParams]);

    const fetchData = async (targetPage = page) => {
        if (!token) return;
        setLoading(true);
        try {
            const filters: RepairFilters = {
                status: activeFilter !== 'all' ? activeFilter : undefined,
                priority: priorityFilter !== 'all' ? priorityFilter : undefined,
                technicianId: technicianFilter !== 'all' ? technicianFilter : undefined,
                deviceCategory: deviceCategoryFilter !== 'all' ? deviceCategoryFilter : undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                search: debouncedSearch || undefined,
            };

            const res = await repairApi.getRequests(token, filters, targetPage, 50);
            if (res.ok && res.data) {
                const fetchedList: ServiceRequest[] = res.data.data?.data || [];
                setRequests(fetchedList);
                setTotalPages(res.data.data?.pagination?.totalPages || 1);
                setTotalRecords(res.data.data?.pagination?.total ?? fetchedList.length);

                if (res.data.data?.statusCounts) {
                    const counts = res.data.data.statusCounts;
                    setStatusCounts(prev => ({
                        ...prev,
                        ...counts
                    }));
                }

                // Extract & merge unique device categories
                const dynamicCats = fetchedList.map(r => r.deviceCategory).filter(Boolean);
                setDeviceCategories(prev => {
                    const combined = new Set([...STANDARD_DEVICE_CATEGORIES, ...prev, ...dynamicCats]);
                    return Array.from(combined);
                });
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

    // Load repairs list when page or any filter changes
    useEffect(() => {
        fetchData(1);
        setPage(1);
    }, [token, activeFilter, priorityFilter, technicianFilter, deviceCategoryFilter, startDate, endDate, debouncedSearch]);

    // Handle deep linking to a specific ticket via ID query param
    useEffect(() => {
        const idParam = searchParams.get('id');
        if (idParam && token) {
            const ticketId = Number(idParam);
            const localTicket = requests.find(r => r.id === ticketId);
            if (localTicket) {
                openModal(localTicket);
                searchParams.delete('id');
                setSearchParams(searchParams, { replace: true });
            } else {
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

    const fetchTransfersChain = useCallback(async (repairId: number) => {
        if (!token) return;
        setTransfersLoading(true);
        try {
            const res = await repairApi.getTicketTransfers(token, repairId);
            if (res.data?.data) {
                setTransfersChain(res.data.data);
            } else {
                setTransfersChain([]);
            }
        } catch (e) {
            console.error('Failed to load transfers chain', e);
        } finally {
            setTransfersLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (modalTab === 'work-log' && selectedRequest) {
            fetchWorkLogs(selectedRequest.id);
        } else if (modalTab === 'transfers' && selectedRequest) {
            fetchTransfersChain(selectedRequest.id);
        }
    }, [modalTab, selectedRequest, fetchWorkLogs, fetchTransfersChain]);

    // Format YYYY-MM-DD safely to readable string
    const formatDateLabel = (dStr: string) => {
        if (!dStr) return '';
        try {
            const parts = dStr.split('-');
            if (parts.length === 3) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const day = parseInt(parts[2], 10);
                const d = new Date(year, month, day);
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            }
        } catch {
            // fallback
        }
        return dStr;
    };

    // Quick date preset helper
    const applyDatePreset = (preset: 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'all') => {
        if (preset === 'all') {
            setStartDate('');
            setEndDate('');
            setTempStartDate('');
            setTempEndDate('');
            setShowDatePicker(false);
            return;
        }

        const now = new Date();
        const toYMD = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        let start = '';
        let end = toYMD(now);

        if (preset === 'today') {
            start = toYMD(now);
            end = toYMD(now);
        } else if (preset === 'yesterday') {
            const yest = new Date(now);
            yest.setDate(yest.getDate() - 1);
            start = toYMD(yest);
            end = toYMD(yest);
        } else if (preset === 'last7') {
            const d = new Date(now);
            d.setDate(d.getDate() - 6);
            start = toYMD(d);
        } else if (preset === 'last30') {
            const d = new Date(now);
            d.setDate(d.getDate() - 29);
            start = toYMD(d);
        } else if (preset === 'thisMonth') {
            const d = new Date(now.getFullYear(), now.getMonth(), 1);
            start = toYMD(d);
        }

        setStartDate(start);
        setEndDate(end);
        setTempStartDate(start);
        setTempEndDate(end);
        setShowDatePicker(false);
    };

    const handleApplyCustomDate = () => {
        if (tempStartDate && tempEndDate && tempStartDate > tempEndDate) {
            toast.error('Start date cannot be after End date.');
            return;
        }
        setStartDate(tempStartDate);
        setEndDate(tempEndDate);
        setShowDatePicker(false);
    };

    const handleClearDateFilter = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setStartDate('');
        setEndDate('');
        setTempStartDate('');
        setTempEndDate('');
        setShowDatePicker(false);
    };

    const handleClearAllFilters = () => {
        setSearchQuery('');
        setDebouncedSearch('');
        setActiveFilter('all');
        setPriorityFilter('all');
        setTechnicianFilter('all');
        setDeviceCategoryFilter('all');
        setStartDate('');
        setEndDate('');
        setTempStartDate('');
        setTempEndDate('');
        setPage(1);
    };

    const isAnyFilterActive =
        activeFilter !== 'all' ||
        priorityFilter !== 'all' ||
        technicianFilter !== 'all' ||
        deviceCategoryFilter !== 'all' ||
        !!startDate ||
        !!endDate ||
        !!searchQuery.trim();

    // Client-side fallback filter to guarantee consistency
    const filteredRequests = requests.filter(r => {
        const matchFilter = activeFilter === 'all' || (r.status && r.status.toLowerCase() === activeFilter.toLowerCase());
        const matchPriority = priorityFilter === 'all' || (r.priority && r.priority.toLowerCase() === priorityFilter.toLowerCase());
        
        let matchTechnician = true;
        if (technicianFilter !== 'all') {
            if (technicianFilter === 'unassigned') {
                matchTechnician = !r.assignedTechnicianId;
            } else {
                matchTechnician = r.assignedTechnicianId === Number(technicianFilter) || (r.assignedTechnicianId as any) === technicianFilter;
            }
        }

        const matchDeviceCategory = deviceCategoryFilter === 'all' || (r.deviceCategory && r.deviceCategory.toLowerCase() === deviceCategoryFilter.toLowerCase());
        
        let matchStartDate = true;
        let matchEndDate = true;
        if (startDate && r.createdAt) {
            const ticketDate = new Date(r.createdAt).toISOString().split('T')[0];
            matchStartDate = ticketDate >= startDate;
        }
        if (endDate && r.createdAt) {
            const ticketDate = new Date(r.createdAt).toISOString().split('T')[0];
            matchEndDate = ticketDate <= endDate;
        }

        const q = searchQuery.toLowerCase().trim();
        const matchSearch = !q ||
            (r.ticketNumber && r.ticketNumber.toLowerCase().includes(q)) ||
            (r.customerName && r.customerName.toLowerCase().includes(q)) ||
            (r.mobile && r.mobile.includes(q)) ||
            (r.brand && r.brand.toLowerCase().includes(q)) ||
            (r.modelNumber && r.modelNumber.toLowerCase().includes(q)) ||
            (r.deviceCategory && r.deviceCategory.toLowerCase().includes(q)) ||
            (r.city && r.city.toLowerCase().includes(q));

        return matchFilter && matchPriority && matchTechnician && matchDeviceCategory && matchStartDate && matchEndDate && matchSearch;
    });

    const openModal = (r: ServiceRequest) => {
        setSelectedRequest(r);
        setIsEditing(false);
        setEditForm(r);
        setSelectedTechForAssign(r.pendingTechnicianId || r.assignedTechnicianId || '');
        setModalTab('details');
        setWorkLogs([]);
    };

    const handleBulkUpdate = async () => {
        if (!token || selectedTicketIds.length === 0) return;
        setBulkAssigning(true);
        const payload: any = { ticketIds: selectedTicketIds };
        if (bulkTechSelect !== '') {
            payload.assignedTechnicianId = Number(bulkTechSelect);
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

    const handleStatusChange = async (id: number, status: string) => {
        if (!token) return;
        setStatusLoading(id);
        const res = await repairApi.updateStatus(token, id, status);
        if (res.ok) {
            const validStatus = status as 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled';
            setRequests(prev => prev.map(r => r.id === id ? { ...r, status: validStatus } : r));
            if (selectedRequest?.id === id) setSelectedRequest(prev => prev ? { ...prev, status: validStatus } : null);
            toast.success(`Status updated to ${status.replace('_', ' ').toUpperCase()}`);
            fetchData(page);
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

    const handleDeactivateTicket = async (id: number, ticketLabel: string) => {
        if (!token) return;
        const reason = prompt(`Deactivate / Cancel repair ticket ${ticketLabel}?\nTicket history, diagnostic logs, and records will be preserved.\nEnter reason (optional):`);
        if (reason === null) return;
        setDeleteLoading(id);
        const res = await repairApi.deleteRequest(token, id, reason || undefined);
        if (res.ok) {
            toast.success(`Ticket ${ticketLabel} cancelled & deactivated.`);
            fetchData(page);
        } else {
            toast.error(res.error || 'Failed to deactivate ticket');
        }
        setDeleteLoading(null);
    };

    const handleReactivateTicket = async (id: number, ticketLabel: string) => {
        if (!token) return;
        setDeleteLoading(id);
        const res = await repairApi.reactivateRequest(token, id);
        if (res.ok) {
            toast.success(`Ticket ${ticketLabel} reactivated!`);
            fetchData(page);
        } else {
            toast.error(res.error || 'Failed to reactivate ticket');
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
            toast.success('Ticket updated successfully!');
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
        const s = map[status?.toLowerCase()] || { cls: 'bg-zinc-800 text-zinc-400 border-zinc-700', icon: null, label: status || 'UNKNOWN' };
        const Icon = s.icon;
        return (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold border ${s.cls}`}>
                {Icon && <Icon size={12} />}{s.label}
            </span>
        );
    };

    const tabs = [
        { id: 'all', label: 'All', count: statusCounts.all },
        { id: 'pending', label: 'Pending', count: statusCounts.pending },
        { id: 'in_progress', label: 'In Progress', count: statusCounts.in_progress },
        { id: 'completed', label: 'Completed', count: statusCounts.completed },
        { id: 'delivered', label: 'Delivered', count: statusCounts.delivered },
        { id: 'cancelled', label: 'Cancelled', count: statusCounts.cancelled },
    ];

    // Compute date trigger button text
    const getDateTriggerText = () => {
        if (startDate && endDate) {
            if (startDate === endDate) {
                return formatDateLabel(startDate);
            }
            return `${formatDateLabel(startDate)} – ${formatDateLabel(endDate)}`;
        }
        if (startDate) {
            return `From ${formatDateLabel(startDate)}`;
        }
        if (endDate) {
            return `Until ${formatDateLabel(endDate)}`;
        }
        return 'Date Range';
    };

    return (
        <div className="space-y-6 font-sans">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight flex items-center gap-2">
                        Repair Tickets
                    </h1>
                    <p className="text-xs text-zinc-400 mt-1">Manage, filter, and dispatch device repair requests</p>
                </div>
                <div className="flex items-center gap-2">
                    {isAnyFilterActive && (
                        <button
                            onClick={handleClearAllFilters}
                            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:border-zinc-700 transition-all cursor-pointer"
                            title="Reset all filters"
                        >
                            <RotateCcw size={13} />
                            <span>Reset Filters</span>
                        </button>
                    )}
                    <button
                        onClick={() => fetchData()}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:border-neon-cyan/40 transition-all cursor-pointer shadow-sm"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin text-neon-cyan' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Status Tabs Bar */}
            <div className="overflow-x-auto pb-1">
                <div className="flex items-center gap-1.5 bg-zinc-900/60 p-1.5 rounded-2xl border border-zinc-850 w-fit min-w-full sm:min-w-0">
                    {tabs.map(tab => {
                        const isActive = activeFilter === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveFilter(tab.id); setPage(1); }}
                                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer whitespace-nowrap ${isActive
                                    ? 'bg-neon-cyan text-black font-bold shadow-sm'
                                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                                    }`}
                            >
                                <span>{tab.label}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${isActive
                                    ? 'bg-black/20 text-black'
                                    : 'bg-zinc-800 text-zinc-400'
                                    }`}>
                                    {tab.count ?? 0}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Filter Controls Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 bg-zinc-950/40 p-3 rounded-2xl border border-zinc-900">
                {/* Search Bar (4 cols on lg) */}
                <div className="relative sm:col-span-2 lg:col-span-4">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Search ticket #, customer, phone, device..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl pl-10 pr-9 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-neon-cyan transition-all"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-0.5 rounded transition-colors"
                            title="Clear search"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Date Filter Trigger & Popover (3 cols on lg) */}
                <div className="relative sm:col-span-1 lg:col-span-3" ref={datePickerRef}>
                    <button
                        type="button"
                        onClick={() => {
                            setTempStartDate(startDate);
                            setTempEndDate(endDate);
                            setShowDatePicker(!showDatePicker);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-xs transition-all cursor-pointer ${startDate || endDate
                            ? 'bg-neon-cyan/10 border-neon-cyan/40 text-neon-cyan font-medium'
                            : 'bg-zinc-900/80 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                            }`}
                    >
                        <div className="flex items-center gap-2 truncate">
                            <Calendar size={14} className={startDate || endDate ? 'text-neon-cyan shrink-0' : 'text-zinc-500 shrink-0'} />
                            <span className="truncate">{getDateTriggerText()}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            {(startDate || endDate) && (
                                <button
                                    type="button"
                                    onClick={handleClearDateFilter}
                                    className="p-1 text-neon-cyan hover:bg-neon-cyan/20 rounded transition-colors"
                                    title="Clear date filter"
                                >
                                    <X size={12} />
                                </button>
                            )}
                            <ChevronDown size={14} className={`text-zinc-500 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
                        </div>
                    </button>

                    {/* Date Picker Popover Panel */}
                    {showDatePicker && (
                        <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-80 sm:w-96 bg-[#0e0e10] border border-zinc-800 rounded-2xl p-4 shadow-2xl z-50 space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                                <div className="flex items-center gap-2">
                                    <Calendar size={14} className="text-neon-cyan" />
                                    <span className="text-xs font-bold text-white uppercase font-mono tracking-wider">Date Range Filter</span>
                                </div>
                                <button
                                    onClick={() => setShowDatePicker(false)}
                                    className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            {/* Quick Presets */}
                            <div>
                                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-2">Quick Presets</label>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {[
                                        { id: 'today', label: 'Today' },
                                        { id: 'yesterday', label: 'Yesterday' },
                                        { id: 'last7', label: 'Last 7 Days' },
                                        { id: 'last30', label: 'Last 30 Days' },
                                        { id: 'thisMonth', label: 'This Month' },
                                        { id: 'all', label: 'All Time' }
                                    ].map(preset => (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            onClick={() => applyDatePreset(preset.id as any)}
                                            className="px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-neon-cyan/40 hover:bg-zinc-800 text-[11px] font-medium text-zinc-300 hover:text-white transition-all text-center"
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Custom Date Pickers */}
                            <div className="space-y-2 pt-2 border-t border-zinc-850">
                                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">Custom Date Range</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] text-zinc-400 block mb-1">From (Start Date)</label>
                                        <input
                                            type="date"
                                            value={tempStartDate}
                                            max={tempEndDate || undefined}
                                            onChange={e => setTempStartDate(e.target.value)}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-neon-cyan"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-zinc-400 block mb-1">To (End Date)</label>
                                        <input
                                            type="date"
                                            value={tempEndDate}
                                            min={tempStartDate || undefined}
                                            onChange={e => setTempEndDate(e.target.value)}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-neon-cyan"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between pt-3 border-t border-zinc-800/80">
                                <button
                                    type="button"
                                    onClick={handleClearDateFilter}
                                    className="text-xs font-semibold text-zinc-400 hover:text-rose-400 transition-colors"
                                >
                                    Reset Date
                                </button>
                                <button
                                    type="button"
                                    onClick={handleApplyCustomDate}
                                    className="flex items-center gap-1.5 bg-neon-cyan hover:bg-neon-cyan text-black px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                                >
                                    <Check size={14} />
                                    <span>Apply</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Priority Filter (2 cols on lg) */}
                <div className="relative sm:col-span-1 lg:col-span-2">
                    <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                    <select
                        value={priorityFilter}
                        onChange={e => setPriorityFilter(e.target.value)}
                        className={`w-full border rounded-xl pl-9 pr-8 py-2.5 text-xs focus:outline-none focus:border-neon-cyan transition-all appearance-none cursor-pointer ${priorityFilter !== 'all'
                            ? 'bg-neon-cyan/10 border-neon-cyan/40 text-neon-cyan font-medium'
                            : 'bg-zinc-900/80 border-zinc-800 text-zinc-300'
                            }`}
                    >
                        <option value="all" className="bg-zinc-900 text-zinc-300">All Priorities</option>
                        <option value="standard" className="bg-zinc-900 text-zinc-300">Standard</option>
                        <option value="priority" className="bg-zinc-900 text-zinc-300">Priority</option>
                        <option value="express" className="bg-zinc-900 text-zinc-300">Express (Same Day)</option>
                        <option value="urgent" className="bg-zinc-900 text-zinc-300">Urgent (Within 2 Hours)</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>

                {/* Technician Filter (2 cols on lg) */}
                <div className="relative sm:col-span-1 lg:col-span-2">
                    <UserCog className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                    <select
                        value={technicianFilter}
                        onChange={e => setTechnicianFilter(e.target.value)}
                        className={`w-full border rounded-xl pl-9 pr-8 py-2.5 text-xs focus:outline-none focus:border-neon-cyan transition-all appearance-none cursor-pointer ${technicianFilter !== 'all'
                            ? 'bg-neon-cyan/10 border-neon-cyan/40 text-neon-cyan font-medium'
                            : 'bg-zinc-900/80 border-zinc-800 text-zinc-300'
                            }`}
                    >
                        <option value="all" className="bg-zinc-900 text-zinc-300">All Technicians</option>
                        <option value="unassigned" className="bg-zinc-900 text-zinc-300">Unassigned Only</option>
                        {technicians.map(t => (
                            <option key={t.id} value={t.id} className="bg-zinc-900 text-zinc-300">
                                {t.name}
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>

                {/* Device Category Filter (1 col on lg) */}
                <div className="relative sm:col-span-1 lg:col-span-1">
                    <Laptop className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                    <select
                        value={deviceCategoryFilter}
                        onChange={e => setDeviceCategoryFilter(e.target.value)}
                        className={`w-full border rounded-xl pl-8 pr-6 py-2.5 text-xs focus:outline-none focus:border-neon-cyan transition-all appearance-none cursor-pointer truncate ${deviceCategoryFilter !== 'all'
                            ? 'bg-neon-cyan/10 border-neon-cyan/40 text-neon-cyan font-medium'
                            : 'bg-zinc-900/80 border-zinc-800 text-zinc-300'
                            }`}
                    >
                        <option value="all" className="bg-zinc-900 text-zinc-300">Device</option>
                        {deviceCategories.map(cat => (
                            <option key={cat} value={cat} className="bg-zinc-900 text-zinc-300">{cat}</option>
                        ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>
            </div>

            {/* Active Filter Badges Bar */}
            {isAnyFilterActive && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mr-1 flex items-center gap-1">
                        <SlidersHorizontal size={11} /> Filters:
                    </span>

                    {activeFilter !== 'all' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-zinc-900 border border-zinc-800 text-zinc-300">
                            <span className="text-zinc-500 text-[10px] font-mono">STATUS:</span> {activeFilter.replace('_', ' ')}
                            <button onClick={() => setActiveFilter('all')} className="ml-1 text-zinc-500 hover:text-white"><X size={12} /></button>
                        </span>
                    )}

                    {(startDate || endDate) && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan">
                            <Calendar size={11} /> {getDateTriggerText()}
                            <button onClick={handleClearDateFilter} className="ml-1 text-neon-cyan hover:text-white"><X size={12} /></button>
                        </span>
                    )}

                    {searchQuery.trim() && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-zinc-900 border border-zinc-800 text-zinc-300">
                            <span className="text-zinc-500 text-[10px] font-mono">SEARCH:</span> "{searchQuery}"
                            <button onClick={() => setSearchQuery('')} className="ml-1 text-zinc-500 hover:text-white"><X size={12} /></button>
                        </span>
                    )}

                    {priorityFilter !== 'all' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-zinc-900 border border-zinc-800 text-zinc-300">
                            <span className="text-zinc-500 text-[10px] font-mono">PRIORITY:</span> {priorityFilter}
                            <button onClick={() => setPriorityFilter('all')} className="ml-1 text-zinc-500 hover:text-white"><X size={12} /></button>
                        </span>
                    )}

                    {technicianFilter !== 'all' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-zinc-900 border border-zinc-800 text-zinc-300">
                            <span className="text-zinc-500 text-[10px] font-mono">TECH:</span> {technicianFilter === 'unassigned' ? 'Unassigned' : (technicians.find(t => t.id === Number(technicianFilter))?.name || technicianFilter)}
                            <button onClick={() => setTechnicianFilter('all')} className="ml-1 text-zinc-500 hover:text-white"><X size={12} /></button>
                        </span>
                    )}

                    {deviceCategoryFilter !== 'all' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-zinc-900 border border-zinc-800 text-zinc-300">
                            <span className="text-zinc-500 text-[10px] font-mono">DEVICE:</span> {deviceCategoryFilter}
                            <button onClick={() => setDeviceCategoryFilter('all')} className="ml-1 text-zinc-500 hover:text-white"><X size={12} /></button>
                        </span>
                    )}

                    <button
                        onClick={handleClearAllFilters}
                        className="text-[11px] text-zinc-500 hover:text-white underline ml-1 cursor-pointer transition-colors"
                    >
                        Clear all
                    </button>
                </div>
            )}

            {/* Content Area */}
            {loading ? (
                <div className="min-h-[40vh] flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 text-neon-cyan animate-spin mb-3" />
                    <p className="text-zinc-500 text-xs font-mono tracking-wider uppercase">Loading Repair Tickets...</p>
                </div>
            ) : filteredRequests.length === 0 ? (
                /* No Records Found Empty State */
                <div className="border border-zinc-850 bg-zinc-950/40 rounded-2xl p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto my-6 shadow-inner">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-4 shadow-sm">
                        <FilterX size={28} className="text-zinc-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white font-outfit mb-1">No Records Found</h3>
                    <p className="text-xs text-zinc-400 max-w-sm mb-6 leading-relaxed">
                        {isAnyFilterActive
                            ? 'No repair tickets matched your selected date range or filter criteria. Try adjusting or clearing your filters.'
                            : 'There are currently no repair tickets registered in the system.'}
                    </p>
                    {isAnyFilterActive && (
                        <button
                            onClick={handleClearAllFilters}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neon-cyan text-black text-xs font-bold hover:bg-neon-cyan transition-all cursor-pointer shadow-sm"
                        >
                            <RotateCcw size={14} />
                            <span>Clear All Filters</span>
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Bulk Action Bar */}
                    {selectedTicketIds.length > 0 && (
                        <div className="bg-zinc-950 border border-neon-cyan/30 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg animate-in fade-in">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-neon-cyan font-bold uppercase">{selectedTicketIds.length} tickets selected</span>
                                <button onClick={() => setSelectedTicketIds([])} className="text-[10px] text-zinc-400 hover:text-white underline cursor-pointer">Clear Selection</button>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                                <select
                                    value={bulkTechSelect}
                                    onChange={e => setBulkTechSelect(e.target.value === '' ? '' : Number(e.target.value))}
                                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none cursor-pointer"
                                >
                                    <option value="">Assign Technician...</option>
                                    {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                <select
                                    value={bulkStatusSelect}
                                    onChange={e => setBulkStatusSelect(e.target.value)}
                                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none cursor-pointer"
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
                                    className="bg-neon-cyan hover:bg-neon-cyan text-black px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                                >
                                    {bulkAssigning ? 'Applying...' : 'Apply Bulk Actions'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Tickets Table */}
                    <div className="border border-zinc-900 bg-zinc-900/20 rounded-2xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-zinc-900 bg-zinc-950/60 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
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
                                        <th className="p-4">Ticket ID</th>
                                        <th className="p-4">Customer</th>
                                        <th className="p-4">Device Specification</th>
                                        <th className="p-4">Status</th>
                                        <th className="p-4">Assigned Tech</th>
                                        <th className="p-4">Priority</th>
                                        <th className="p-4">Date Logged</th>
                                        <th className="p-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900/50">
                                    {filteredRequests.map(r => {
                                        const tech = technicians.find(t => t.id === r.assignedTechnicianId);
                                        const isSelected = selectedTicketIds.includes(r.id);
                                        return (
                                            <tr
                                                key={r.id}
                                                className={`hover:bg-zinc-900/40 transition-colors cursor-pointer group ${isSelected ? 'bg-neon-cyan/10' : ''}`}
                                                onClick={() => openModal(r)}
                                            >
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
                                                <td className="p-4 text-xs font-mono text-neon-cyan font-bold whitespace-nowrap">
                                                    {r.ticketNumber || `#${r.id}`}
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-white font-semibold">{r.customerName}</span>
                                                        {(r as any).repeatCount > 1 && (
                                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-rose-500/10 text-rose-400 border border-rose-500/20" title="This device has been sent for repair multiple times">
                                                                Repeat ({(r as any).repeatCount})
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{r.mobile}</div>
                                                </td>
                                                <td className="p-4 text-xs text-zinc-300">
                                                    <div className="font-medium text-white">{r.brand} {r.modelNumber || ''}</div>
                                                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{r.deviceCategory} • {r.problemType}</div>
                                                </td>
                                                <td className="p-4 whitespace-nowrap">
                                                    {getStatusBadge(r.status)}
                                                </td>
                                                <td className="p-4 text-xs text-zinc-400 whitespace-nowrap">
                                                    {r.pendingTechnicianId ? (
                                                        <span className="text-amber-400 font-mono text-[10px] uppercase border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 rounded-md">
                                                            Pending: {technicians.find(t => t.id === r.pendingTechnicianId)?.name}
                                                        </span>
                                                    ) : tech ? (
                                                        <span className="text-zinc-200 font-medium">{tech.name}</span>
                                                    ) : (
                                                        <span className="text-zinc-600 italic">Unassigned</span>
                                                    )}
                                                </td>
                                                <td className="p-4 whitespace-nowrap">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${['urgent', 'express'].includes(r.priority?.toLowerCase())
                                                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                        : r.priority?.toLowerCase() === 'priority'
                                                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                            : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                                        }`}>
                                                        {r.priority}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-xs text-zinc-400 font-mono whitespace-nowrap">
                                                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                                                </td>
                                                <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                                                    <div className="flex justify-end gap-1.5">
                                                        <button
                                                            onClick={() => handleNotifyCustomer(r.id)}
                                                            disabled={notifyLoading === r.id || r.status?.toLowerCase() !== 'completed'}
                                                            className={`p-1.5 rounded-lg border transition-all cursor-pointer inline-flex items-center text-xs ${r.status?.toLowerCase() === 'completed'
                                                                ? 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300'
                                                                : 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed opacity-40'
                                                                }`}
                                                            title={r.status?.toLowerCase() === 'completed' ? "Notify Customer" : "Only completed tickets can notify customer"}
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
                                                        {r.status?.toLowerCase() === 'cancelled' || (r as any).is_active === false ? (
                                                            <button
                                                                onClick={() => handleReactivateTicket(r.id, r.ticketNumber || `#${r.id}`)}
                                                                disabled={deleteLoading === r.id}
                                                                className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 text-emerald-400 transition-all cursor-pointer inline-flex items-center gap-1 text-xs"
                                                                title="Reactivate Ticket"
                                                            >
                                                                {deleteLoading === r.id ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleDeactivateTicket(r.id, r.ticketNumber || `#${r.id}`)}
                                                                disabled={deleteLoading === r.id}
                                                                className="p-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 text-amber-400 transition-all cursor-pointer inline-flex items-center gap-1 text-xs"
                                                                title="Deactivate / Cancel Ticket"
                                                            >
                                                                {deleteLoading === r.id ? <Loader2 size={12} className="animate-spin" /> : <ShieldOff size={12} />}
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

                    {/* Pagination Bar */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                        <div className="text-xs font-mono text-zinc-500">
                            Showing <span className="text-zinc-300 font-bold">{filteredRequests.length}</span> of <span className="text-zinc-300 font-bold">{totalRecords}</span> tickets
                        </div>
                        {totalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="p-2 rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="text-xs font-mono text-zinc-400 px-2">
                                    Page <span className="text-white font-bold">{page}</span> of <span className="text-white font-bold">{totalPages}</span>
                                </span>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="p-2 rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
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
                        <div className="flex border-b border-zinc-900 px-6 pt-1 gap-1 overflow-x-auto">
                            {([
                                ['details', 'Details', null],
                                ['work-log', 'Work Log', <ClipboardList size={12} key="wl" />],
                                ['transfers', 'Transfer Chain', <ArrowRightLeft size={12} key="tc" />],
                                ['customer-note', 'Customer Note', <Star size={12} key="cn" />]
                            ] as [AdminModalTab, string, React.ReactNode][]).map(([id, label, icon]) => (
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
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-2">
                                        {selectedRequest.imagePath && (
                                            <div className="border border-zinc-900 bg-zinc-950/45 rounded-xl p-3 flex flex-col gap-2 group hover:border-zinc-800 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-mono text-zinc-400 font-semibold flex items-center gap-1.5">
                                                        <FileImage size={12} className="text-neon-cyan" /> DEVICE_PHOTO
                                                    </span>
                                                    <a
                                                        href={getFileUrl(selectedRequest.imagePath)!}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-neon-cyan hover:underline text-[10px] font-mono flex items-center gap-1"
                                                    >
                                                        OPEN <ExternalLink size={10} />
                                                    </a>
                                                </div>
                                                <div className="h-24 w-full overflow-hidden bg-black rounded border border-zinc-900/80 flex items-center justify-center cursor-pointer" onClick={() => handleImagePreview(getFileUrl(selectedRequest.imagePath)!, 'Device Photo')}>
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
                                                    <a
                                                        href={getFileUrl(selectedRequest.screenshotPath)!}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-neon-cyan hover:underline text-[10px] font-mono flex items-center gap-1"
                                                    >
                                                        OPEN <ExternalLink size={10} />
                                                    </a>
                                                </div>
                                                <div className="h-24 w-full overflow-hidden bg-black rounded border border-zinc-900/80 flex items-center justify-center cursor-pointer" onClick={() => handleImagePreview(getFileUrl(selectedRequest.screenshotPath)!, 'Screenshot')}>
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
                                                        <button
                                                            key={st}
                                                            onClick={() => handleStatusChange(selectedRequest.id, st)}
                                                            disabled={selectedRequest.status === st}
                                                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border disabled:cursor-not-allowed ${selectedRequest.status === st
                                                                ? 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/40 font-bold'
                                                                : 'bg-zinc-950 border-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                                                                }`}
                                                        >
                                                            {st.replace('_', ' ').toUpperCase()}
                                                        </button>
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
                                                                "{hist.problemDescription?.substring(0, 50)}{hist.problemDescription?.length > 50 ? '...' : ''}"
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

                            {/* Task Transfer Chain Tab */}
                            {modalTab === 'transfers' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                                            <Layers size={12} className="text-neon-cyan" /> Movement & Transfer Chain
                                        </div>
                                        <span className="text-[10px] font-mono text-zinc-600">{transfersChain.length} events recorded</span>
                                    </div>

                                    {transfersLoading ? (
                                        <div className="p-10 flex flex-col items-center justify-center">
                                            <Loader2 size={24} className="animate-spin text-neon-cyan mb-2" />
                                            <p className="text-xs font-mono text-zinc-500">Loading transfer history chain...</p>
                                        </div>
                                    ) : transfersChain.length === 0 ? (
                                        <div className="text-center py-10 border border-zinc-900 rounded-xl text-zinc-600 text-xs font-mono">
                                            No transfers recorded for this ticket. Initial technician assignment remains active.
                                        </div>
                                    ) : (
                                        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
                                            {transfersChain.map((t, idx) => (
                                                <div key={t.id} className="relative group">
                                                    <div className={`absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 bg-black ${
                                                        t.transferStatus === 'accepted'
                                                            ? 'border-emerald-400'
                                                            : t.transferStatus === 'rejected'
                                                                ? 'border-rose-500'
                                                                : 'border-amber-400'
                                                    }`} />

                                                    <div className="bg-zinc-950/60 border border-zinc-850 rounded-xl p-4 space-y-2.5 hover:border-zinc-700 transition-colors">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-bold font-mono text-white">Transfer Event #{idx + 1}</span>
                                                                {t.transferStatus === 'accepted' && (
                                                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                                                                        ACCEPTED
                                                                    </span>
                                                                )}
                                                                {t.transferStatus === 'rejected' && (
                                                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold">
                                                                        REJECTED
                                                                    </span>
                                                                )}
                                                                {t.transferStatus === 'pending' && (
                                                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                                                                        PENDING
                                                                    </span>
                                                                )}
                                                                {t.transferStatus === 'cancelled' && (
                                                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-semibold">
                                                                        CANCELLED
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-[10px] font-mono text-zinc-500">
                                                                {new Date(t.transferredAt).toLocaleString()}
                                                            </span>
                                                        </div>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-zinc-900/40 rounded-lg p-3">
                                                            <div>
                                                                <div className="text-[10px] font-mono text-zinc-500 uppercase">From Tech</div>
                                                                <div className="text-zinc-200 font-mono mt-0.5 font-medium">
                                                                    {t.fromTechnicianName || 'Initial Assignment'}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[10px] font-mono text-neon-cyan uppercase">To Tech</div>
                                                                <div className="text-emerald-400 font-mono mt-0.5 font-semibold">
                                                                    {t.toTechnicianName}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {t.reason && (
                                                            <div className="text-xs text-zinc-300 bg-black/40 rounded-lg p-2.5 border border-zinc-900 leading-relaxed">
                                                                <span className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">Reason:</span>
                                                                "{t.reason}"
                                                            </div>
                                                        )}

                                                        {t.responseNotes && (
                                                            <div className="text-xs text-rose-300 bg-rose-950/20 rounded-lg p-2.5 border border-rose-900/30 font-mono">
                                                                <span className="text-[10px] font-mono text-rose-400 uppercase block mb-1">Response Comment:</span>
                                                                "{t.responseNotes}"
                                                            </div>
                                                        )}

                                                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600 border-t border-zinc-900/80 pt-2">
                                                            <div>Initiated by: {t.initiatedByName} ({t.initiatedByRole})</div>
                                                            {t.respondedAt && <div>Responded at: {new Date(t.respondedAt).toLocaleString()}</div>}
                                                        </div>
                                                    </div>
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
