import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { repairApi, technicianApi, adminApi, billingApi } from '@/services/api';
import type { ServiceRequest, TechnicianUser, WorkLog, RepairFilters, TaskTransfer } from '@/services/api';
import { toast } from 'react-hot-toast';
import {
    Search, RefreshCw, Loader2, Hourglass, Hammer, CheckCircle2, XCircle,
    ChevronLeft, ChevronRight, Trash2, Phone, Mail, MapPin, Calendar,
    FileImage, ExternalLink, UserCog, X, Edit2, Save, Send, AlertCircle,
    ClipboardList, Star, Filter, FilterX, ChevronDown, RotateCcw,
    Laptop, Smartphone, SlidersHorizontal, Check, ShieldCheck, ShieldOff,
    ArrowRightLeft, Layers, Wrench, Clock, CreditCard, ShieldAlert, AlertTriangle, Lock,
    Users,
    Eye
} from 'lucide-react';
import { appConfig } from '@/config/appConfig';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import SideDrawer from '@/components/SideDrawer';
import AdminTicketWorkspace from '@/components/AdminTicketWorkspace';
import ConfirmModal from '@/components/ConfirmModal';
import { subscribeToPaymentUpdates } from '@/utils/paymentSync';

const STANDARD_DEVICE_CATEGORIES = [
    'Laptop', 'Desktop', 'Smartphone', 'Tablet', 'Server', 'Printer', 'Smartwatch', 'Other'
];

export default function RepairTickets() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const searchInputRef = useRef<HTMLInputElement>(null);

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
    const [notifyModalId, setNotifyModalId] = useState<number | null>(null);

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState(() => searchParams.get('status') || 'all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [paymentFilter, setPaymentFilter] = useState('all');
    const [technicianFilter, setTechnicianFilter] = useState('all');
    const [customerTypeFilter, setCustomerTypeFilter] = useState<'all' | 'individual' | 'company'>('all');
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

    // Single & Bulk Delete States
    const [ticketToDelete, setTicketToDelete] = useState<{ id: number; ticketNumber: string } | null>(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [isDeletingTicket, setIsDeletingTicket] = useState(false);

    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
    const [bulkDeleteReason, setBulkDeleteReason] = useState('');
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    // Modal State
    const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
    const [drawerRequest, setDrawerRequest] = useState<ServiceRequest | null>(null);
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
    const [verifyingPaymentId, setVerifyingPaymentId] = useState<number | null>(null);
    const [rejectionModalTicket, setRejectionModalTicket] = useState<{ id: number; ticketNumber: string } | null>(null);
    const [rejectionReasonInput, setRejectionReasonInput] = useState('');
    const [editLoading, setEditLoading] = useState(false);
    const [notifyLoading, setNotifyLoading] = useState<number | null>(null);
    // Controlled Admin Override State
    const [showOverrideModal, setShowOverrideModal] = useState(false);
    const [overrideReason, setOverrideReason] = useState('');
    const [isOverriding, setIsOverriding] = useState(false);

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

    // Focus search input when navigated with focusSearch state (Ctrl+K shortcut)
    useEffect(() => {
        if (location.state?.focusSearch) {
            const timer = setTimeout(() => {
                searchInputRef.current?.focus();
                window.history.replaceState({}, document.title);
            }, 60);
            return () => clearTimeout(timer);
        }
    }, [location.state]);

    const fetchData = async (targetPage = page, isSilent = false) => {
        if (!token) return;
        if (!isSilent) setLoading(true);
        try {
            const filters: RepairFilters = {
                status: activeFilter !== 'all' ? activeFilter : undefined,
                paymentStatus: paymentFilter !== 'all' ? paymentFilter : undefined,
                priority: priorityFilter !== 'all' ? priorityFilter : undefined,
                technicianId: technicianFilter !== 'all' ? technicianFilter : undefined,
                clientType: customerTypeFilter !== 'all' ? customerTypeFilter : undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                search: debouncedSearch || undefined,
            };

            const res = await repairApi.getRequests(token, filters, targetPage, 50);
            if (res.ok && res.data) {
                const fetchedList: ServiceRequest[] = res.data.data?.data || [];
                setRequests(fetchedList);
                setSelectedRequest(prev => {
                    if (!prev) return null;
                    const found = fetchedList.find(r => r.id === prev.id);
                    return found ? { ...prev, ...found } : prev;
                });
                setDrawerRequest(prev => {
                    if (!prev) return null;
                    const found = fetchedList.find(r => r.id === prev.id);
                    return found ? { ...prev, ...found } : prev;
                });
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
        } finally {
            if (!isSilent) setLoading(false);
        }
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
    }, [token, activeFilter, priorityFilter, paymentFilter, technicianFilter, customerTypeFilter, startDate, endDate, debouncedSearch]);

    // Background polling (every 5s) & real-time payment synchronization
    useEffect(() => {
        if (!token) return;

        const doSilentRefresh = () => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            fetchData(page, true);
        };

        const interval = setInterval(doSilentRefresh, 30000); // 30-second refresh for admin repair tickets

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                doSilentRefresh();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        const unsubscribe = subscribeToPaymentUpdates(() => {
            doSilentRefresh();
        });

        const handleNotifsEvent = () => {
            doSilentRefresh();
        };
        window.addEventListener('tekdoctor:notifications_updated', handleNotifsEvent);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('tekdoctor:notifications_updated', handleNotifsEvent);
            unsubscribe();
        };
    }, [token, page, activeFilter, priorityFilter, paymentFilter, technicianFilter, customerTypeFilter, startDate, endDate, debouncedSearch]);

    // Handle deep linking to a specific ticket via ID or ticketNumber query param
    useEffect(() => {
        const idParam = searchParams.get('id');
        if (idParam && token) {
            const numId = Number(idParam);
            const localTicket = requests.find(r => (!isNaN(numId) && r.id === numId) || r.ticketNumber === idParam);
            if (localTicket) {
                openModal(localTicket);
                searchParams.delete('id');
                setSearchParams(searchParams, { replace: true });
            } else {
                repairApi.getRequestById(token, !isNaN(numId) ? numId : idParam).then(res => {
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
        setPaymentFilter('all');
        setTechnicianFilter('all');
        setCustomerTypeFilter('all');
        setStartDate('');
        setEndDate('');
        setTempStartDate('');
        setTempEndDate('');
        setPage(1);
    };

    const isAnyFilterActive =
        activeFilter !== 'all' ||
        priorityFilter !== 'all' ||
        paymentFilter !== 'all' ||
        technicianFilter !== 'all' ||
        customerTypeFilter !== 'all' ||
        !!startDate ||
        !!endDate ||
        !!searchQuery.trim();

    // Client-side fallback filter to guarantee consistency
    const filteredRequests = requests.filter(r => {
        const matchFilter = activeFilter === 'all' || (r.status && r.status.toLowerCase() === activeFilter.toLowerCase());
        const matchPriority = priorityFilter === 'all' || (r.priority && r.priority.toLowerCase() === priorityFilter.toLowerCase());
        
        let matchPayment = true;
        if (paymentFilter !== 'all') {
            const pStatus = (r.paymentStatus || (r as any).payment_status || 'unpaid').toLowerCase();
            if (paymentFilter === 'paid') matchPayment = pStatus === 'paid';
            else if (paymentFilter === 'pending_verification') matchPayment = pStatus === 'pending_verification';
            else if (paymentFilter === 'unpaid') matchPayment = pStatus === 'unpaid' || pStatus === 'pending';
            else if (paymentFilter === 'rejected') matchPayment = pStatus === 'rejected';
            else if (paymentFilter === 'failed') matchPayment = pStatus === 'failed';
            else matchPayment = pStatus === paymentFilter.toLowerCase();
        }

        let matchTechnician = true;
        if (technicianFilter !== 'all') {
            if (technicianFilter === 'unassigned') {
                matchTechnician = !r.assignedTechnicianId;
            } else {
                matchTechnician = r.assignedTechnicianId === Number(technicianFilter) || (r.assignedTechnicianId as any) === technicianFilter;
            }
        }

        const matchCustomerType = customerTypeFilter === 'all' ||
            (customerTypeFilter === 'company' ? !!(r.companyId || (r as any).company_id) : !(r.companyId || (r as any).company_id));
        
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

        return matchFilter && matchPriority && matchPayment && matchTechnician && matchCustomerType && matchStartDate && matchEndDate && matchSearch;
    });

    const openModal = (r: ServiceRequest) => {
        setSelectedRequest(r);
        setIsEditing(false);
        setEditForm(r);
        setSelectedTechForAssign(r.pendingTechnicianId || r.assignedTechnicianId || '');
        setModalTab('details');
        setWorkLogs([]);

        // Real-time backend fetch to guarantee latest payment settlement state
        if (token) {
            repairApi.getRequestById(token, r.id).then(res => {
                if (res.ok && res.data?.data) {
                    const fresh = res.data.data as ServiceRequest;
                    setSelectedRequest(prev => (prev && prev.id === r.id ? { ...prev, ...fresh } : prev));
                    setEditForm(prev => (prev && prev.id === r.id ? { ...prev, ...fresh } : prev));
                }
            }).catch(err => console.error('Failed to refresh ticket payment details:', err));
        }
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
        if (selectedRequest && selectedRequest.id === id && selectedRequest.status === 'completed') {
            if (status === 'pending') {
                toast.error('Completed repair tasks cannot be reverted to Pending.');
                return;
            }
            if (status === 'in_progress') {
                setShowOverrideModal(true);
                return;
            }
        }
        if (selectedRequest && selectedRequest.id === id && selectedRequest.status === 'delivered') {
            if (status === 'pending') {
                toast.error('Delivered repair tickets cannot be reverted to Pending.');
                return;
            }
            if (status === 'in_progress' || status === 'completed') {
                setShowOverrideModal(true);
                return;
            }
        }
        setStatusLoading(id);
        const res = await repairApi.updateStatus(token, id, status);
        if (res.ok) {
            const validStatus = status as 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled';
            setRequests(prev => prev.map(r => r.id === id ? { ...r, status: validStatus } : r));
            if (selectedRequest?.id === id) setSelectedRequest(prev => prev ? { ...prev, status: validStatus } : null);
            toast.success(`Status updated to ${status.replace('_', ' ').toUpperCase()}`);
            fetchData(page);
        } else {
            toast.error(res.error || 'Failed to update status');
        }
        setStatusLoading(null);
    };

    const handleAdminOverride = async () => {
        if (!token || !selectedRequest) return;
        if (!overrideReason.trim()) {
            toast.error('Please provide an override reason to reopen this repair.');
            return;
        }
        setIsOverriding(true);
        try {
            const res = await repairApi.updateStatus(token, selectedRequest.id, 'in_progress', {
                isOverride: true,
                overrideReason: overrideReason.trim()
            });
            if (res.ok) {
                toast.success('Admin Override: Repair ticket reopened to IN PROGRESS.');
                setRequests(prev => prev.map(r => r.id === selectedRequest.id ? { ...r, status: 'in_progress' } : r));
                setSelectedRequest(prev => prev ? { ...prev, status: 'in_progress' } : null);
                setShowOverrideModal(false);
                setOverrideReason('');
                fetchData(page);
            } else {
                toast.error(res.error || 'Failed to reopen repair ticket.');
            }
        } finally {
            setIsOverriding(false);
        }
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

    const handleDeactivateTicket = (id: number, ticketLabel: string) => {
        setTicketToDelete({ id, ticketNumber: ticketLabel });
        setDeleteReason('');
    };

    const confirmSingleDelete = async () => {
        if (!token || !ticketToDelete) return;
        setIsDeletingTicket(true);
        try {
            const res = await repairApi.deleteRequest(token, ticketToDelete.id, deleteReason.trim() || undefined);
            if (res.ok) {
                toast.success(`Ticket ${ticketToDelete.ticketNumber} deleted successfully.`);
                setTicketToDelete(null);
                setDeleteReason('');
                if (selectedRequest && selectedRequest.id === ticketToDelete.id) {
                    setSelectedRequest(null);
                }
                fetchData(page);
            } else {
                toast.error(res.error || 'Failed to delete repair ticket.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error deleting ticket.');
        } finally {
            setIsDeletingTicket(false);
        }
    };

    const confirmBulkDelete = async () => {
        if (!token || selectedTicketIds.length === 0) return;
        setIsBulkDeleting(true);
        try {
            const res = await repairApi.bulkDeleteRequests(token, selectedTicketIds, bulkDeleteReason.trim() || undefined);
            if (res.ok) {
                toast.success(`Successfully deleted ${selectedTicketIds.length} repair tickets.`);
                setSelectedTicketIds([]);
                setShowBulkDeleteModal(false);
                setBulkDeleteReason('');
                fetchData(page);
            } else {
                toast.error(res.error || 'Failed to delete selected tickets.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error during bulk deletion.');
        } finally {
            setIsBulkDeleting(false);
        }
    };

    const handleVerifyOfflinePayment = async (ticketId: number, action: 'verify' | 'reject', reason?: string) => {
        if (!token) return;
        setVerifyingPaymentId(ticketId);
        try {
            const res = await billingApi.verifyOfflinePayment({
                ticketId,
                action,
                rejectionReason: reason
            }, token);
            if (res.ok) {
                toast.success(action === 'verify' ? 'Offline payment verified and settled successfully!' : 'Offline payment rejected.');
                fetchData(page);
                if (drawerRequest?.id === ticketId) {
                    setDrawerRequest(prev => prev ? {
                        ...prev,
                        paymentStatus: action === 'verify' ? 'paid' : 'rejected',
                        payment_status: action === 'verify' ? 'paid' : 'rejected',
                        collectionStatus: action === 'verify' ? 'collected' : 'not_applicable',
                        collection_status: action === 'verify' ? 'collected' : 'not_applicable'
                    } : null);
                }
                if (selectedRequest?.id === ticketId) {
                    setSelectedRequest(prev => prev ? {
                        ...prev,
                        paymentStatus: action === 'verify' ? 'paid' : 'rejected',
                        payment_status: action === 'verify' ? 'paid' : 'rejected',
                        collectionStatus: action === 'verify' ? 'collected' : 'not_applicable',
                        collection_status: action === 'verify' ? 'collected' : 'not_applicable'
                    } : null);
                }
                setRejectionModalTicket(null);
                setRejectionReasonInput('');
            } else {
                toast.error(res.error || 'Failed to update payment verification state.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error processing verification.');
        } finally {
            setVerifyingPaymentId(null);
        }
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

    const handleNotifyCustomer = (id: number) => {
        setNotifyModalId(id);
    };

    const handleConfirmNotifyCustomer = async () => {
        if (!token || notifyModalId === null) return;
        setNotifyLoading(notifyModalId);
        const res = await repairApi.notifyCustomer(token, notifyModalId);
        if (res.ok) {
            toast.success('Customer notified successfully!');
            setNotifyModalId(null);
        } else {
            toast.error('Failed to notify customer.');
        }
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
            assigned: { cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20', icon: UserCog, label: 'ASSIGNED' },
            completed: { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: CheckCircle2, label: 'COMPLETED' },
            delivered: { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: CheckCircle2, label: 'DELIVERED' },
            closed: { cls: 'bg-zinc-600/10 text-zinc-400 border-zinc-600/20', icon: CheckCircle2, label: 'CLOSED' },
            cancelled: { cls: 'bg-red-500/10 text-red-400 border-red-500/20', icon: XCircle, label: 'CANCELLED' },
        };
        const s = map[status?.toLowerCase()] || { cls: 'bg-zinc-800/80 text-zinc-400 border-zinc-700/40', icon: Clock, label: status || 'UNKNOWN' };
        const Icon = s.icon;
        return (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold border ${s.cls}`}>
                {Icon && <Icon size={12} />}{s.label}
            </span>
        );
    };

    const getPaymentBadge = (paymentStatus?: string | null, collectionStatus?: string | null) => {
        const status = (paymentStatus || 'unpaid').toLowerCase();
        switch (status) {
            case 'paid':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 size={10} /> Paid
                    </span>
                );
            case 'pending_verification':
                if (collectionStatus === 'collected') {
                    return (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse">
                            <Clock size={10} /> Cash Collected — Pending Verification
                        </span>
                    );
                }
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-purple-500/15 text-purple-400 border border-purple-500/30 animate-pulse">
                        <Clock size={10} /> Pending Verification
                    </span>
                );
            case 'rejected':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        <AlertCircle size={10} /> Payment Rejected
                    </span>
                );
            case 'failed':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        <CreditCard size={10} /> Payment Failed
                    </span>
                );
            case 'pending':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <Clock size={10} /> Payment Pending
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-800/80 text-zinc-400 border border-zinc-700/50">
                        <CreditCard size={10} /> Payment Due
                    </span>
                );
        }
    };

    const getApprovalStatusBadge = (approvalStatus?: string | null) => {
        const status = approvalStatus?.toLowerCase() || 'none';
        switch (status) {
            case 'pending_approval':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
                        <Hourglass size={10} /> Waiting for Customer Approval
                    </span>
                );
            case 'approved':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                        <CheckCircle2 size={10} /> Customer Approved
                    </span>
                );
            case 'rejected':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap">
                        <XCircle size={10} /> Customer Rejected / On Hold
                    </span>
                );
            case 'on_hold':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
                        <Clock size={10} /> Customer Rejected / On Hold
                    </span>
                );
            case 'reapproval_requested':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 whitespace-nowrap">
                        <RotateCcw size={10} /> Reapproval Requested
                    </span>
                );
            case 'auto_cancelled':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap">
                        <XCircle size={10} /> Hold Expired / Cancelled
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-zinc-500 bg-zinc-900/60 border border-zinc-800 whitespace-nowrap">
                        No Estimate
                    </span>
                );
        }
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
                            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 border border-zinc-800/50 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:border-zinc-700/60 transition-all cursor-pointer"
                            title="Reset all filters"
                        >
                            <RotateCcw size={13} />
                            <span>Reset Filters</span>
                        </button>
                    )}
                    <button
                        onClick={() => fetchData()}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-900/80 border border-zinc-800/50 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:border-neon-cyan/30 transition-all cursor-pointer shadow-sm"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin text-neon-cyan' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {selectedRequest ? (
                <AdminTicketWorkspace
                    request={selectedRequest}
                    technicians={technicians}
                    token={token}
                    onBack={() => {
                        setSelectedRequest(null);
                        searchParams.delete('id');
                        setSearchParams(searchParams, { replace: true });
                    }}
                    onRequestUpdated={(updated: any) => {
                        setRequests(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
                        setSelectedRequest(prev => prev ? { ...prev, ...updated } : null);
                    }}
                    onDelete={() => handleDeactivateTicket(selectedRequest.id, selectedRequest.ticketNumber || `#${selectedRequest.id}`)}
                    onImagePreview={handleImagePreview}
                />
            ) : (
                <>
                {/* Status Tabs Bar */}
            <div className="overflow-x-auto pb-1">
                <div className="flex items-center gap-1.5 bg-zinc-900/60 p-1.5 rounded-2xl border border-zinc-800/40 w-fit min-w-full sm:min-w-0">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 bg-zinc-950/40 p-3 rounded-2xl border border-zinc-900">                {/* Search Bar (3 cols on lg) */}
                <div className="relative sm:col-span-2 lg:col-span-3">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        ref={searchInputRef}
                        id="admin-search-input"
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

                {/* Date Filter Trigger & Popover (2 cols on lg) */}
                <div className="relative sm:col-span-1 lg:col-span-2" ref={datePickerRef}>
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
                        <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-[calc(100vw-2.5rem)] max-w-sm sm:w-96 bg-[#0e0e10] border border-zinc-800/60 rounded-2xl p-4 shadow-2xl z-50 space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/40">
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
                                            className="px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800/50 hover:border-neon-cyan/30 hover:bg-zinc-800 text-[11px] font-medium text-zinc-300 hover:text-white transition-all text-center"
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Custom Date Pickers */}
                            <div className="space-y-2 pt-2 border-t border-zinc-800/40">
                                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">Custom Date Range</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] text-zinc-400 block mb-1">From (Start Date)</label>
                                        <input
                                            type="date"
                                            value={tempStartDate}
                                            max={tempEndDate || undefined}
                                            onChange={e => setTempStartDate(e.target.value)}
                                            className="w-full bg-zinc-900 border border-zinc-800/50 hover:border-zinc-700/50 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-neon-cyan/60"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-zinc-400 block mb-1">To (End Date)</label>
                                        <input
                                            type="date"
                                            value={tempEndDate}
                                            min={tempStartDate || undefined}
                                            onChange={e => setTempEndDate(e.target.value)}
                                            className="w-full bg-zinc-900 border border-zinc-800/50 hover:border-zinc-700/50 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-neon-cyan/60"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between pt-3 border-t border-zinc-800/40">
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

                {/* Payment Status Filter (2 cols on lg) */}
                <div className="relative sm:col-span-1 lg:col-span-2">
                    <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                    <select
                        value={paymentFilter}
                        onChange={e => setPaymentFilter(e.target.value)}
                        className={`w-full border rounded-xl pl-9 pr-8 py-2.5 text-xs focus:outline-none focus:border-neon-cyan transition-all appearance-none cursor-pointer ${paymentFilter !== 'all'
                            ? 'bg-neon-cyan/10 border-neon-cyan/40 text-neon-cyan font-medium'
                            : 'bg-zinc-900/80 border-zinc-800 text-zinc-300'
                            }`}
                    >
                        <option value="all" className="bg-zinc-900 text-zinc-300">All Payments</option>
                        <option value="paid" className="bg-zinc-900 text-zinc-300">Paid / Verified</option>
                        <option value="pending_verification" className="bg-zinc-900 text-zinc-300">Pending Verification</option>
                        <option value="unpaid" className="bg-zinc-900 text-zinc-300">Payment Due / Unpaid</option>
                        <option value="rejected" className="bg-zinc-900 text-zinc-300">Payment Rejected</option>
                        <option value="failed" className="bg-zinc-900 text-zinc-300">Payment Failed</option>
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

                {/* Customer Type Filter (Individual Customer vs B2B Customer) */}
                <div className="relative sm:col-span-1 lg:col-span-1">
                    <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                    <select
                        value={customerTypeFilter}
                        onChange={e => setCustomerTypeFilter(e.target.value as any)}
                        className={`w-full border rounded-xl pl-8 pr-6 py-2.5 text-xs focus:outline-none focus:border-neon-cyan transition-all appearance-none cursor-pointer truncate ${customerTypeFilter !== 'all'
                            ? 'bg-neon-cyan/10 border-neon-cyan/40 text-neon-cyan font-medium'
                            : 'bg-zinc-900/80 border-zinc-800 text-zinc-300'
                            }`}
                    >
                        <option value="all" className="bg-zinc-900 text-zinc-300">All Customers</option>
                        <option value="individual" className="bg-zinc-900 text-zinc-300">Individual Customer</option>
                        <option value="company" className="bg-zinc-900 text-zinc-300">B2B Customer</option>
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
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-zinc-900/90 border border-zinc-800/50 text-zinc-300">
                            <span className="text-zinc-500 text-[10px] font-mono">STATUS:</span> {activeFilter.replace('_', ' ')}
                            <button onClick={() => setActiveFilter('all')} className="ml-1 text-zinc-500 hover:text-white"><X size={12} /></button>
                        </span>
                    )}

                    {paymentFilter !== 'all' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-zinc-900/90 border border-zinc-800/50 text-zinc-300">
                            <span className="text-zinc-500 text-[10px] font-mono">PAYMENT:</span> {paymentFilter.toUpperCase()}
                            <button onClick={() => setPaymentFilter('all')} className="ml-1 text-zinc-500 hover:text-white"><X size={12} /></button>
                        </span>
                    )}

                    {(startDate || endDate) && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-neon-cyan/10 border border-neon-cyan/25 text-neon-cyan">
                            <Calendar size={11} /> {getDateTriggerText()}
                            <button onClick={handleClearDateFilter} className="ml-1 text-neon-cyan hover:text-white"><X size={12} /></button>
                        </span>
                    )}

                    {searchQuery.trim() && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-zinc-900/90 border border-zinc-800/50 text-zinc-300">
                            <span className="text-zinc-500 text-[10px] font-mono">SEARCH:</span> "{searchQuery}"
                            <button onClick={() => setSearchQuery('')} className="ml-1 text-zinc-500 hover:text-white"><X size={12} /></button>
                        </span>
                    )}

                    {priorityFilter !== 'all' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-zinc-900/90 border border-zinc-800/50 text-zinc-300">
                            <span className="text-zinc-500 text-[10px] font-mono">PRIORITY:</span> {priorityFilter}
                            <button onClick={() => setPriorityFilter('all')} className="ml-1 text-zinc-500 hover:text-white"><X size={12} /></button>
                        </span>
                    )}

                    {technicianFilter !== 'all' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-zinc-900/90 border border-zinc-800/50 text-zinc-300">
                            <span className="text-zinc-500 text-[10px] font-mono">TECH:</span> {technicianFilter === 'unassigned' ? 'Unassigned' : (technicians.find(t => t.id === Number(technicianFilter))?.name || technicianFilter)}
                            <button onClick={() => setTechnicianFilter('all')} className="ml-1 text-zinc-500 hover:text-white"><X size={12} /></button>
                        </span>
                    )}

                    {customerTypeFilter !== 'all' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-zinc-900/90 border border-zinc-800/50 text-zinc-300">
                            <span className="text-zinc-500 text-[10px] font-mono">TYPE:</span> {customerTypeFilter === 'company' ? 'B2B Customer' : 'Individual Customer'}
                            <button onClick={() => setCustomerTypeFilter('all')} className="ml-1 text-zinc-500 hover:text-white"><X size={12} /></button>
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
                <div className="border border-zinc-800/40 bg-zinc-950/40 rounded-2xl p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto my-6 shadow-inner">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-900/80 border border-zinc-800/40 flex items-center justify-center text-zinc-500 mb-4 shadow-sm">
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
                        <div className="bg-zinc-950 border border-neon-cyan/25 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg animate-in fade-in">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-neon-cyan font-bold uppercase">{selectedTicketIds.length} tickets selected</span>
                                <button onClick={() => setSelectedTicketIds([])} className="text-[10px] text-zinc-400 hover:text-white underline cursor-pointer">Clear Selection</button>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                                <select
                                    value={bulkTechSelect}
                                    onChange={e => setBulkTechSelect(e.target.value === '' ? '' : Number(e.target.value))}
                                    className="bg-zinc-900 border border-zinc-800/50 hover:border-zinc-700/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none cursor-pointer w-full sm:w-auto"
                                >
                                    <option value="">Assign Technician...</option>
                                    {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                <select
                                    value={bulkStatusSelect}
                                    onChange={e => setBulkStatusSelect(e.target.value)}
                                    className="bg-zinc-900 border border-zinc-800/50 hover:border-zinc-700/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none cursor-pointer w-full sm:w-auto"
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
                                    className="bg-neon-cyan hover:bg-neon-cyan text-black px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm w-full sm:w-auto text-center"
                                >
                                    {bulkAssigning ? 'Applying...' : 'Apply Bulk Actions'}
                                </button>
                                <button
                                    onClick={() => {
                                        setShowBulkDeleteModal(true);
                                        setBulkDeleteReason('');
                                    }}
                                    className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm w-full sm:w-auto"
                                    title={`Delete ${selectedTicketIds.length} selected tickets`}
                                >
                                    <Trash2 size={13} />
                                    <span>Delete Selected ({selectedTicketIds.length})</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Tickets Table */}
                    <div className="border border-zinc-800/40 bg-zinc-900/20 rounded-2xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[980px] border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-zinc-800/40 bg-zinc-950/60 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
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
                                                className="rounded border-zinc-700/50 hover:border-zinc-600/60 bg-zinc-900 text-neon-cyan focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                            />
                                        </th>
                                        <th className="p-4">Ticket ID</th>
                                        <th className="p-4">Customer</th>
                                        <th className="p-4">Device Specification</th>
                                        <th className="p-4">Status</th>
                                        <th className="p-4">Estimate & Approval</th>
                                        <th className="p-4">Assigned Tech</th>
                                        <th className="p-4">Priority</th>
                                        <th className="p-4">Date Logged</th>
                                        <th className="p-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/30">
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
                                                        className="rounded border-zinc-700/50 hover:border-zinc-600/60 bg-zinc-900 text-neon-cyan focus:ring-0 focus:ring-offset-0 cursor-pointer"
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
                                                    <div className="flex flex-col gap-1.5 items-start">
                                                        {getStatusBadge(r.status)}
                                                        {getPaymentBadge(r.paymentStatus || (r as any).payment_status, r.collectionStatus || (r as any).collection_status)}
                                                    </div>
                                                </td>
                                                <td className="p-4 whitespace-nowrap">
                                                    {(() => {
                                                        const approxTotal = ((r.estimatedCost || 0) + (r.additionalCharges || 0)) || (r.repairCost || 0);
                                                        if (approxTotal > 0) {
                                                            return (
                                                                <div>
                                                                    <div className="text-xs font-mono font-bold text-white flex items-center gap-1">
                                                                        ₹{approxTotal.toFixed(2)}
                                                                        <span className="text-[9px] text-zinc-500 font-normal">(Approx)</span>
                                                                    </div>
                                                                    {r.additionalCharges && r.additionalCharges > 0 ? (
                                                                        <div className="text-[10px] font-mono text-zinc-400">
                                                                            Base: ₹{Number(r.estimatedCost || 0).toFixed(2)} + Extra: ₹{Number(r.additionalCharges).toFixed(2)}
                                                                        </div>
                                                                    ) : null}
                                                                    <div className="mt-1">
                                                                        {getApprovalStatusBadge(r.customerApprovalStatus)}
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return (
                                                            <div>
                                                                <span className="text-xs text-zinc-500 italic">No Estimate</span>
                                                                {r.customerApprovalStatus && r.customerApprovalStatus !== 'none' && (
                                                                    <div className="mt-1">
                                                                        {getApprovalStatusBadge(r.customerApprovalStatus)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="p-4 text-xs text-zinc-400 whitespace-nowrap">
                                                    {r.pendingTechnicianId ? (
                                                        <span className="text-amber-400 font-mono text-[10px] uppercase border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 rounded-md">
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
                                                            : 'bg-zinc-800/70 text-zinc-400 border-zinc-700/40'
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
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setDrawerRequest(r);
                                                            }}
                                                            className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-neon-cyan/60 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer inline-flex items-center text-xs"
                                                            title="Quick preview in side drawer"
                                                        >
                                                            <Eye size={12} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleNotifyCustomer(r.id)}
                                                            disabled={notifyLoading === r.id || !['completed', 'delivered'].includes(r.status?.toLowerCase())}
                                                            className={`p-1.5 rounded-lg border transition-all cursor-pointer inline-flex items-center text-xs ${['completed', 'delivered'].includes(r.status?.toLowerCase())
                                                                ? 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300'
                                                                : 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed opacity-40'
                                                                }`}
                                                            title={['completed', 'delivered'].includes(r.status?.toLowerCase()) ? "Notify Customer" : "Only completed or delivered tickets can notify customer"}
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
                                                                disabled={isDeletingTicket && ticketToDelete?.id === r.id}
                                                                className="p-1.5 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 text-red-400 transition-all cursor-pointer inline-flex items-center gap-1 text-xs"
                                                                title="Delete Ticket"
                                                            >
                                                                <Trash2 size={12} />
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
                                    className="p-2 rounded-xl border border-zinc-800/50 bg-zinc-900/60 text-zinc-400 hover:text-white hover:border-zinc-700/60 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="text-xs font-mono text-zinc-400 px-2">
                                    Page <span className="text-white font-bold">{page}</span> of <span className="text-white font-bold">{totalPages}</span>
                                </span>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="p-2 rounded-xl border border-zinc-800/50 bg-zinc-900/60 text-zinc-400 hover:text-white hover:border-zinc-700/60 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            </>
            )}

            {/* Quick Preview Side Drawer */}
            <SideDrawer
                isOpen={Boolean(drawerRequest)}
                onClose={() => setDrawerRequest(null)}
                title={drawerRequest?.ticketNumber || 'Ticket Preview'}
                size="lg"
                badge={drawerRequest ? getStatusBadge(drawerRequest.status) : undefined}
            >
                {drawerRequest && (
                    <div className="space-y-6">
                        <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-2xl p-4 space-y-3">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-xs font-mono font-bold text-neon-cyan">{drawerRequest.ticketNumber}</div>
                                    <h4 className="text-base font-bold text-white font-outfit mt-0.5">{drawerRequest.customerName}</h4>
                                    <div className="text-xs text-zinc-400 mt-0.5">{drawerRequest.brand} {drawerRequest.modelNumber || ''} · {drawerRequest.deviceCategory}</div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-zinc-800 text-zinc-300 border border-zinc-700">
                                        {drawerRequest.priority}
                                    </span>
                                    {getPaymentBadge(drawerRequest.paymentStatus || (drawerRequest as any).payment_status)}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-900 text-xs text-zinc-400">
                                <div className="flex items-center gap-1.5"><Phone size={12} className="text-neon-cyan" /> {drawerRequest.mobile}</div>
                                <div className="flex items-center gap-1.5"><MapPin size={12} className="text-neon-cyan" /> {drawerRequest.city}</div>
                            </div>
                        </div>

                        <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-2xl p-4 space-y-2">
                            <div className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider">Estimated Budget & Approvals</div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-sm font-bold text-white font-mono">
                                        {(() => {
                                            const total = ((drawerRequest.estimatedCost || 0) + (drawerRequest.additionalCharges || 0)) || (drawerRequest.repairCost || 0);
                                            return total > 0 ? `₹${total.toFixed(2)}` : 'Budget Not Quoted';
                                        })()}
                                    </span>
                                    {drawerRequest.additionalCharges && drawerRequest.additionalCharges > 0 ? (
                                        <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                                            Base: ₹{Number(drawerRequest.estimatedCost || 0).toFixed(2)} + Add'l: ₹{Number(drawerRequest.additionalCharges).toFixed(2)}
                                        </div>
                                    ) : null}
                                </div>
                                {getApprovalStatusBadge(drawerRequest.customerApprovalStatus)}
                            </div>
                        </div>

                        <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-2xl p-4 space-y-2">
                            <div className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider">Problem Description</div>
                            <div className="text-xs text-zinc-300"><span className="text-zinc-500">Type:</span> {drawerRequest.problemType}</div>
                            {drawerRequest.problemDescription && (
                                <div className="text-xs text-zinc-400 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/80 whitespace-pre-wrap">
                                    {drawerRequest.problemDescription}
                                </div>
                            )}
                        </div>

                        <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-2xl p-4 space-y-2">
                            <div className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider">Technician Assignment</div>
                            <div className="text-xs text-zinc-300">
                                {drawerRequest.assignedTechnicianId ? (
                                    <span className="text-emerald-400 font-semibold">
                                        {technicians.find(t => t.id === drawerRequest.assignedTechnicianId)?.name || `Technician #${drawerRequest.assignedTechnicianId}`}
                                    </span>
                                ) : drawerRequest.pendingTechnicianId ? (
                                    <span className="text-amber-400 font-semibold">
                                        {technicians.find(t => t.id === drawerRequest.pendingTechnicianId)?.name || `Technician #${drawerRequest.pendingTechnicianId}`} (Pending Acceptance)
                                    </span>
                                ) : (
                                    <span className="text-zinc-500 italic">Unassigned</span>
                                )}
                            </div>
                        </div>

                        {/* Offline Payment Verification Action Panel */}
                        {(drawerRequest.paymentStatus === 'pending_verification' || (drawerRequest as any).payment_status === 'pending_verification') && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-mono uppercase text-amber-400 font-bold flex items-center gap-1.5">
                                        <Clock size={14} />
                                        Offline Payment Verification
                                    </span>
                                    {drawerRequest.collectionStatus === 'collected' && (
                                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                                            Cash Collected
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-zinc-300 font-mono">
                                    An offline payment has been submitted for this repair. Verify payment receipt before final closure.
                                </p>
                                <div className="flex items-center gap-2 pt-1">
                                    <button
                                        type="button"
                                        disabled={verifyingPaymentId !== null}
                                        onClick={() => handleVerifyOfflinePayment(drawerRequest.id, 'verify')}
                                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                                    >
                                        {verifyingPaymentId === drawerRequest.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                        Verify & Settle
                                    </button>
                                    <button
                                        type="button"
                                        disabled={verifyingPaymentId !== null}
                                        onClick={() => setRejectionModalTicket({ id: drawerRequest.id, ticketNumber: drawerRequest.ticketNumber || `#${drawerRequest.id}` })}
                                        className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                                    >
                                        <XCircle size={14} />
                                        Reject
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="pt-4 border-t border-zinc-800/60 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setDrawerRequest(null)}
                                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-mono text-zinc-400 hover:text-white transition-all cursor-pointer"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const r = drawerRequest;
                                    setDrawerRequest(null);
                                    if (r) openModal(r);
                                }}
                                className="px-4 py-2 rounded-xl bg-neon-cyan hover:bg-cyan-400 text-black font-semibold text-xs font-mono flex items-center gap-1.5 transition-all shadow-lg shadow-cyan-500/10 cursor-pointer"
                            >
                                Open Full Workspace
                                <ExternalLink size={12} />
                            </button>
                        </div>
                    </div>
                )}
            </SideDrawer>

            {/* Quick Assign Modal */}
            {assigningTicket && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setAssigningTicket(null)}>
                    <div className="bg-[#0c0c0c] border border-zinc-800/60 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-cyan to-blue-500" />

                        <div className="p-6 border-b border-zinc-800/40 flex items-center justify-between shrink-0">
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
                                    className="w-full bg-zinc-900 border border-zinc-800/50 hover:border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan/60 cursor-pointer"
                                >
                                    <option value="">-- No Technician (Unassigned) --</option>
                                    {technicians.map(t => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="p-4 bg-zinc-950/40 border-t border-zinc-800/40 flex justify-end gap-2 shrink-0">
                            <button onClick={() => setAssigningTicket(null)} className="px-4 py-2 bg-zinc-950 border border-zinc-800/50 hover:border-zinc-700/50 hover:bg-zinc-900 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer">
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

            {/* Admin Status Override Modal */}
            {showOverrideModal && selectedRequest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-[#0e0e0e] border border-amber-500/40 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-scale-up">
                        <div className="p-5 border-b border-zinc-800/60 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                    <ShieldAlert size={20} />
                                </div>
                                <div>
                                    <span className="text-[10px] font-mono text-amber-400 font-bold block uppercase tracking-wider">CONTROLLED ADMIN OVERRIDE</span>
                                    <h3 className="text-base font-bold text-white">Reopen Completed Repair</h3>
                                </div>
                            </div>
                            <button
                                onClick={() => { setShowOverrideModal(false); setOverrideReason(''); }}
                                className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1.5 text-xs text-amber-200/90 font-sans leading-relaxed">
                                <p className="font-bold flex items-center gap-1.5 text-amber-300">
                                    <AlertTriangle size={14} className="shrink-0" />
                                    Completed repairs are protected from accidental modifications.
                                </p>
                                <p>
                                    As an Administrator, you may reopen this task from <strong className="text-white">COMPLETED</strong> back to <strong className="text-amber-400">IN PROGRESS</strong> for necessary corrections or further testing. Reverting to Pending is strictly disallowed.
                                </p>
                            </div>

                            <div className="text-xs font-mono text-zinc-400 space-y-1 bg-black/40 p-3 rounded-xl border border-zinc-800/60">
                                <div><span className="text-zinc-500">Ticket:</span> <strong className="text-white">{selectedRequest.ticketNumber || `#${selectedRequest.id}`}</strong></div>
                                <div><span className="text-zinc-500">Customer:</span> <strong className="text-zinc-200">{selectedRequest.customerName}</strong></div>
                                <div><span className="text-zinc-500">Device:</span> <strong className="text-zinc-200">{selectedRequest.brand} {selectedRequest.modelNumber || selectedRequest.deviceCategory}</strong></div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 block">
                                    Override Reason / Justification <span className="text-rose-400">*</span>
                                </label>
                                <textarea
                                    value={overrideReason}
                                    onChange={e => setOverrideReason(e.target.value)}
                                    placeholder="State why this completed task must be reopened (e.g., Post-repair QA fault detected, customer reported secondary issue, replacement part adjustment required)..."
                                    rows={3}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60"
                                />
                            </div>
                        </div>

                        <div className="p-4 bg-zinc-950/60 border-t border-zinc-800/60 flex items-center justify-end gap-2.5">
                            <button
                                onClick={() => { setShowOverrideModal(false); setOverrideReason(''); }}
                                disabled={isOverriding}
                                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAdminOverride}
                                disabled={isOverriding || !overrideReason.trim()}
                                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-amber-500/20"
                            >
                                {isOverriding ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                                Confirm Reopen to In Progress
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Single Ticket Delete Confirmation Modal */}
            {ticketToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={() => !isDeletingTicket && setTicketToDelete(null)}>
                    <div className="bg-[#0e0e0e] border border-red-500/40 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-scale-up" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-zinc-800/60 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30">
                                    <AlertTriangle size={18} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white">Delete Repair Ticket</h3>
                                    <p className="text-[11px] font-mono text-zinc-400">{ticketToDelete.ticketNumber}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => !isDeletingTicket && setTicketToDelete(null)}
                                disabled={isDeletingTicket}
                                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-xs text-zinc-300 leading-relaxed">
                                Are you sure you want to delete repair ticket <strong className="text-white">{ticketToDelete.ticketNumber}</strong>?
                            </p>
                            <p className="text-[11px] text-zinc-400 bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/60 leading-normal">
                                This safely deactivates the ticket and sets its status to cancelled. Associated customer profile, technician assignments, payments, and invoices are fully preserved for accounting and audit integrity.
                            </p>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">
                                    Reason for deletion (optional)
                                </label>
                                <input
                                    type="text"
                                    value={deleteReason}
                                    onChange={e => setDeleteReason(e.target.value)}
                                    placeholder="e.g. Cancelled by customer, duplicate entry, etc."
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/60"
                                />
                            </div>
                        </div>
                        <div className="p-4 bg-zinc-950/60 border-t border-zinc-800/60 flex items-center justify-end gap-2.5">
                            <button
                                onClick={() => setTicketToDelete(null)}
                                disabled={isDeletingTicket}
                                className="px-3.5 py-1.5 rounded-xl border border-zinc-800 text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800/60 cursor-pointer disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmSingleDelete}
                                disabled={isDeletingTicket}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
                            >
                                {isDeletingTicket ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                <span>{isDeletingTicket ? 'Deleting...' : 'Confirm Delete'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Ticket Delete Confirmation Modal */}
            {showBulkDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={() => !isBulkDeleting && setShowBulkDeleteModal(false)}>
                    <div className="bg-[#0e0e0e] border border-red-500/40 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-scale-up" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-zinc-800/60 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30">
                                    <AlertTriangle size={18} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white">Bulk Delete Repair Tickets</h3>
                                    <p className="text-[11px] font-mono text-zinc-400">{selectedTicketIds.length} tickets selected</p>
                                </div>
                            </div>
                            <button
                                onClick={() => !isBulkDeleting && setShowBulkDeleteModal(false)}
                                disabled={isBulkDeleting}
                                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-xs text-zinc-300 leading-relaxed">
                                Are you sure you want to delete all <strong className="text-white">{selectedTicketIds.length}</strong> selected repair tickets?
                            </p>
                            <p className="text-[11px] text-zinc-400 bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/60 leading-normal">
                                All selected tickets will be safely cancelled and deactivated. All diagnostic logs, technician work logs, payments, and customer accounts remain intact.
                            </p>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">
                                    Reason for bulk deletion (optional)
                                </label>
                                <input
                                    type="text"
                                    value={bulkDeleteReason}
                                    onChange={e => setBulkDeleteReason(e.target.value)}
                                    placeholder="e.g. Bulk cleanup, obsolete test tickets, etc."
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/60"
                                />
                            </div>
                        </div>
                        <div className="p-4 bg-zinc-950/60 border-t border-zinc-800/60 flex items-center justify-end gap-2.5">
                            <button
                                onClick={() => setShowBulkDeleteModal(false)}
                                disabled={isBulkDeleting}
                                className="px-3.5 py-1.5 rounded-xl border border-zinc-800 text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800/60 cursor-pointer disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmBulkDelete}
                                disabled={isBulkDeleting}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
                            >
                                {isBulkDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                <span>{isBulkDeleting ? 'Deleting...' : `Delete ${selectedTicketIds.length} Tickets`}</span>
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

            {/* Notify Customer Modal */}
            <ConfirmModal
                isOpen={notifyModalId !== null}
                title="Send Completion Notification"
                message="Send a repair completion notification email to the customer?"
                confirmText="Send Notification"
                variant="primary"
                isLoading={notifyLoading === notifyModalId}
                onConfirm={handleConfirmNotifyCustomer}
                onCancel={() => setNotifyModalId(null)}
            />

            {/* Rejection Modal for Offline Payment */}
            {rejectionModalTicket && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-[#121216] border border-zinc-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl relative">
                        <div className="flex items-center justify-between">
                            <h4 className="text-base font-bold text-white font-mono flex items-center gap-2">
                                <AlertCircle size={18} className="text-red-400" />
                                Reject Offline Payment
                            </h4>
                            <button
                                onClick={() => { setRejectionModalTicket(null); setRejectionReasonInput(''); }}
                                className="text-zinc-500 hover:text-white p-1 rounded-lg cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <p className="text-xs text-zinc-400 font-mono">
                            Ticket: <span className="text-neon-cyan font-bold">{rejectionModalTicket.ticketNumber}</span>. Please specify the reason for rejection (this will be shared with the customer/company).
                        </p>
                        <textarea
                            rows={3}
                            value={rejectionReasonInput}
                            onChange={(e) => setRejectionReasonInput(e.target.value)}
                            placeholder="e.g. UTR number invalid / Cash amount mismatch / Account not credited..."
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-red-400 font-mono resize-none"
                        />
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => { setRejectionModalTicket(null); setRejectionReasonInput(''); }}
                                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl text-xs font-mono transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={!rejectionReasonInput.trim() || verifyingPaymentId !== null}
                                onClick={() => handleVerifyOfflinePayment(rejectionModalTicket.id, 'reject', rejectionReasonInput.trim())}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-mono font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                            >
                                {verifyingPaymentId !== null ? <Loader2 size={13} className="animate-spin" /> : null}
                                Confirm Rejection
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
