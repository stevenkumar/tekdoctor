import TechnicianTaskWorkspace from '@/components/TechnicianTaskWorkspace';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import {
    RefreshCw, Search, MapPin, Phone, Mail, Clock,
    CheckCircle2, Hourglass, Hammer, XCircle, FileImage,
    ChevronRight, ChevronLeft, ExternalLink, Calendar, Loader2,
    Wrench, LogOut, User, Wifi, Bell, ClipboardList,
    FileText, Plus, Send, AlertTriangle, CheckCheck,
    Truck, Cpu, PackageSearch, Star, Upload, ChevronDown,
    Trash2, ArrowUpRight, ArrowRightLeft, Layers, ArrowDownLeft,
    Inbox, SendHorizontal, X, Lock, ShieldAlert, RotateCcw,
    Building2, LayoutGrid, List, Users, Banknote, CreditCard,
    Printer, Receipt, Download
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { repairApi, notificationApi, technicianApi, billingApi } from '@/services/api';
import type { ServiceRequest, WorkLog, NotificationItem, TechnicianUser, TaskTransfer } from '@/services/api';
import { appConfig } from '@/config/appConfig';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';
import { downloadPaymentBillPdf, printPaymentBill } from '@/utils/billGenerator';
import { sanitizeAmountInput, handleAmountKeyDown } from '@/utils/currencyUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { getApprovalStatusBadge } from '@/components/TechnicianTaskWorkspace';
import { subscribeToPaymentUpdates } from '@/utils/paymentSync';

type ModalTab = 'overview' | 'diagnosis' | 'work-log' | 'transfers' | 'milestones' | 'customer-note';

const MILESTONES = [
    { key: 'diagnosis_completed', label: 'Diagnosis Completed', icon: <Cpu size={14} />, color: 'text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20' },
    { key: 'repair_started', label: 'Repair Started', icon: <Hammer size={14} />, color: 'text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20' },
    { key: 'parts_required', label: 'Parts Required', icon: <PackageSearch size={14} />, color: 'text-orange-400 border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20' },
    { key: 'repair_completed', label: 'Repair Completed', icon: <CheckCheck size={14} />, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20' },
    { key: 'ready_for_pickup', label: 'Ready for Pickup', icon: <Truck size={14} />, color: 'text-neon-cyan border-neon-cyan/30 bg-neon-cyan/10 hover:bg-neon-cyan/20' },
];

const REPAIR_STAGES = [
    'Initial Inspection',
    'Diagnosis',
    'Parts Sourcing',
    'Repair in Progress',
    'Quality Check',
    'Final Testing',
    'Packaging',
    'Ready for Delivery',
];

export default function TechnicianDashboard() {
    const { user, token, isAuthenticated, logout } = useAuth();

    // Photo Lightbox Preview state
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewSrc, setPreviewSrc] = useState('');
    const [previewAlt, setPreviewAlt] = useState('');

    const handleImagePreview = (src: string, alt: string) => {
        setPreviewSrc(src);
        setPreviewAlt(alt);
        setPreviewOpen(true);
    };

    const location = useLocation();
    const navigate = useNavigate();

    const isNotificationsRoute = location.pathname === ROUTES.TECHNICIAN_NOTIFICATIONS;
    const isDashboardRoute = location.pathname === ROUTES.TECHNICIAN_DASHBOARD;
    const isTransfersRoute = location.pathname === ROUTES.TECHNICIAN_TRANSFERS;
    const isAssignedTicketsRoute = location.pathname === ROUTES.TECHNICIAN_ASSIGNED_TICKETS;
    const isDiagnosisRoute = location.pathname === ROUTES.TECHNICIAN_DIAGNOSIS;
    const isInProgressRoute = location.pathname === ROUTES.TECHNICIAN_IN_PROGRESS;
    const isCompletedRoute = location.pathname === ROUTES.TECHNICIAN_COMPLETED;
    const isDeliveredRoute = location.pathname === ROUTES.TECHNICIAN_DELIVERED;
    const isStageRoute = isDiagnosisRoute || isInProgressRoute || isCompletedRoute || isDeliveredRoute;

    const [tasks, setTasks] = useState<ServiceRequest[]>([]);
    const [filteredTasks, setFilteredTasks] = useState<ServiceRequest[]>([]);
    const [activeFilter, setActiveFilter] = useState<string>('all');
    const [accountTypeFilter, setAccountTypeFilter] = useState<'all' | 'individual' | 'b2b'>('all');
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [diagSearch, setDiagSearch] = useState<string>('');
    const [diagFilter, setDiagFilter] = useState<'all' | 'priority' | 'individual' | 'b2b'>('all');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [selectedTask, setSelectedTask] = useState<ServiceRequest | null>(null);
    const [statusUpdateLoadingId, setStatusUpdateLoadingId] = useState<number | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
    const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const notifRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const debouncedSearchQueryRef = useRef<string>('');
    const isFirstMount = useRef<boolean>(true);

    // Sync activeFilter with URL route
    useEffect(() => {
        if (location.pathname === ROUTES.TECHNICIAN_DIAGNOSIS) {
            setActiveFilter('pending');
        } else if (location.pathname === ROUTES.TECHNICIAN_IN_PROGRESS) {
            setActiveFilter('in_progress');
        } else if (location.pathname === ROUTES.TECHNICIAN_COMPLETED) {
            setActiveFilter('completed');
        } else if (location.pathname === ROUTES.TECHNICIAN_DELIVERED) {
            setActiveFilter('delivered');
        } else if (location.pathname === ROUTES.TECHNICIAN_ASSIGNED_TICKETS || location.pathname === ROUTES.TECHNICIAN_DASHBOARD) {
            const params = new URLSearchParams(location.search);
            const tabParam = params.get('tab');
            if (tabParam) {
                setActiveFilter(tabParam);
            } else {
                setActiveFilter('all');
            }
        }
    }, [location.pathname, location.search]);

    // Notifications State & Logic
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [activeModalNotif, setActiveModalNotif] = useState<NotificationItem | null>(null);
    const notifRef = useRef<HTMLDivElement>(null);
    const unreadCount = notifications.filter(n => n.is_read === false || n.is_read === 0 || !n.is_read).length;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
                setShowNotifications(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMarkAsRead = async (id: number | 'all') => {
        if (!token) return;
        await notificationApi.markAsRead(token, id);
        setNotifications(prev => prev.map(n =>
            (id === 'all' || n.id === id) ? { ...n, is_read: true } : n
        ));
    };

    const handleDeleteNotification = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (!token) return;
        await notificationApi.delete(token, id);
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const handleClearAllNotifications = async () => {
        if (!token) return;
        await notificationApi.clearAll(token);
        setNotifications([]);
    };

    // Modal Tab State
    const [activeTab, setActiveTab] = useState<ModalTab>('overview');

    // Work Log State
    const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
    const [workLogsLoading, setWorkLogsLoading] = useState(false);
    const [newLog, setNewLog] = useState({ repairStage: '', actionPerformed: '', partsReplaced: '', timeSpent: '', notes: '' });
    const [logMediaFile, setLogMediaFile] = useState<File | null>(null);
    const [submittingLog, setSubmittingLog] = useState(false);

    // Milestone State
    const [selectedMilestone, setSelectedMilestone] = useState('');
    const [milestoneNotes, setMilestoneNotes] = useState('');
    const [sendingMilestone, setSendingMilestone] = useState(false);

    // Customer Description State
    const [customerDesc, setCustomerDesc] = useState('');
    const [savingDesc, setSavingDesc] = useState(false);

    // Diagnosis & Estimate Form State
    const [diagForm, setDiagForm] = useState({
        diagnosis: '',
        identifiedIssues: '',
        requiredWork: '',
        requiredParts: '',
        estimatedCost: '',
        additionalCharges: '',
        estimatedCompletionDate: '',
        inspectionNotes: '',
        deviceCondition: '',
    });
    const [submittingDiagnosis, setSubmittingDiagnosis] = useState(false);
    const [isEditingDiagnosis, setIsEditingDiagnosis] = useState(false);
    const [diagFormErrors, setDiagFormErrors] = useState<{ diagnosis?: string; estimatedCost?: string; additionalCharges?: string }>({});


    // My Task Transfers History
    const [myTransfers, setMyTransfers] = useState<TaskTransfer[]>([]);
    const [myTransfersLoading, setMyTransfersLoading] = useState(false);
    const [transferTypeFilter, setTransferTypeFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
    const [transferStatusFilter, setTransferStatusFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
    const [transferSearch, setTransferSearch] = useState('');
    const [transferStats, setTransferStats] = useState({
        total: 0,
        incomingCount: 0,
        outgoingCount: 0,
        pendingCount: 0,
        acceptedCount: 0,
        rejectedCount: 0
    });
    const [transferPage, setTransferPage] = useState(1);
    const [transferTotalPages, setTransferTotalPages] = useState(1);
    const [transferTotalRecords, setTransferTotalRecords] = useState(0);

    // Modal Task Transfer Chain
    const [ticketTransfers, setTicketTransfers] = useState<TaskTransfer[]>([]);
    const [ticketTransfersLoading, setTicketTransfersLoading] = useState(false);

    // Transfer Initiation State
    const [technicians, setTechnicians] = useState<TechnicianUser[]>([]);
    const [transferModalOpen, setTransferModalOpen] = useState(false);
    const [transferTargetId, setTransferTargetId] = useState('');
    const [transferReason, setTransferReason] = useState('');
    const [transferring, setTransferring] = useState(false);

    // Universal Ticket Search Modal State
    const [searchModalOpen, setSearchModalOpen] = useState(false);
    const [modalSearchQuery, setModalSearchQuery] = useState('');
    const [modalSearchResults, setModalSearchResults] = useState<ServiceRequest[]>([]);
    const [modalSearchLoading, setModalSearchLoading] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Handle Escape key to close open drawer/modals and lock background scroll while drawer/modal is open
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (searchModalOpen) {
                    setSearchModalOpen(false);
                } else if (transferModalOpen) {
                    setTransferModalOpen(false);
                } else if (previewOpen) {
                    setPreviewOpen(false);
                } else if (activeModalNotif) {
                    setActiveModalNotif(null);
                } else if (selectedTask) {
                    setSelectedTask(null);
                }
            }
        };

        if (selectedTask || searchModalOpen) {
            window.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        } else {
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [selectedTask, transferModalOpen, previewOpen, activeModalNotif, searchModalOpen]);

    // Global keyboard shortcut: Ctrl+K / Cmd+K to toggle Search
    useEffect(() => {
        const handleShortcut = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setSearchModalOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleShortcut);
        return () => window.removeEventListener('keydown', handleShortcut);
    }, []);

    // Autofocus search input when search modal opens
    useEffect(() => {
        if (searchModalOpen) {
            const timer = setTimeout(() => {
                searchInputRef.current?.focus();
            }, 60);
            return () => clearTimeout(timer);
        }
    }, [searchModalOpen]);

    // Debounce server search request for modal search
    useEffect(() => {
        if (!searchModalOpen || !modalSearchQuery.trim()) {
            setModalSearchResults([]);
            setModalSearchLoading(false);
            return;
        }

        const timer = setTimeout(async () => {
            if (!token) return;
            setModalSearchLoading(true);
            try {
                const res = await repairApi.getMyTasks(token, modalSearchQuery.trim());
                if (res.ok && res.data?.data) {
                    setModalSearchResults(res.data.data);
                }
            } catch (err) {
                console.error('Modal search query error:', err);
            } finally {
                setModalSearchLoading(false);
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [modalSearchQuery, searchModalOpen, token]);

    // Instant local filter matching against all loaded tasks for fast typing response
    const filteredModalTasks = useMemo(() => {
        if (!modalSearchQuery.trim()) {
            return tasks.slice(0, 6);
        }
        const q = modalSearchQuery.toLowerCase().trim();
        return tasks.filter(t =>
            (t.ticketNumber && t.ticketNumber.toLowerCase().includes(q)) ||
            (t.customerName && t.customerName.toLowerCase().includes(q)) ||
            (t.companyName && t.companyName.toLowerCase().includes(q)) ||
            (t.companyContactPerson && t.companyContactPerson.toLowerCase().includes(q)) ||
            (t.employeeName && t.employeeName.toLowerCase().includes(q)) ||
            (t.serialNumber && t.serialNumber.toLowerCase().includes(q)) ||
            (t.assetId && t.assetId.toLowerCase().includes(q)) ||
            (t.mobile && t.mobile.includes(q)) ||
            (t.companyPhone && t.companyPhone.includes(q)) ||
            (t.employeePhone && t.employeePhone.includes(q)) ||
            (t.email && t.email.toLowerCase().includes(q)) ||
            (t.city && t.city.toLowerCase().includes(q)) ||
            (t.deviceCategory && t.deviceCategory.toLowerCase().includes(q)) ||
            (t.brand && t.brand.toLowerCase().includes(q)) ||
            (t.customBrand && t.customBrand.toLowerCase().includes(q)) ||
            (t.modelNumber && t.modelNumber.toLowerCase().includes(q)) ||
            (t.problemType && t.problemType.toLowerCase().includes(q))
        );
    }, [tasks, modalSearchQuery]);

    const modalDisplayList = modalSearchQuery.trim()
        ? (modalSearchResults.length > 0 ? modalSearchResults : filteredModalTasks)
        : tasks.slice(0, 6);

    const fetchTechnicians = useCallback(async () => {
        if (!token) return;
        try {
            const res = await technicianApi.getAll(token);
            if (res.ok && res.data) {
                setTechnicians(res.data.data.filter(t => t.id !== user?.id)); // exclude self
            }
        } catch (e) { }
    }, [token, user]);

    const fetchTasks = useCallback(async (searchQueryParam?: any, isSilent = false) => {
        if (!token) return;
        if (!isSilent) setIsLoading(true);
        setErrorMsg('');
        try {
            const q = typeof searchQueryParam === 'string' ? searchQueryParam : debouncedSearchQueryRef.current || '';
            const response = await repairApi.getMyTasks(token, q);
            if (response.ok && response.data) {
                const newTasks = response.data.data || [];
                setTasks(newTasks);
                setLastRefreshed(new Date());
                setSelectedTask(prev => {
                    if (!prev) return null;
                    const found = newTasks.find(t => t.id === prev.id);
                    return found ? { ...prev, ...found } : prev;
                });
            } else {
                if (!isSilent) setErrorMsg(response.error || 'Failed to fetch assigned tasks.');
            }
        } catch (err) {
            if (!isSilent) setErrorMsg('Network error while retrieving tasks.');
        } finally {
            if (!isSilent) setIsLoading(false);
        }
    }, [token]);

    const fetchMyTransfers = useCallback(async () => {
        if (!token) return;
        setMyTransfersLoading(true);
        try {
            const res = await repairApi.getMyTransferHistory(token, {
                type: transferTypeFilter,
                status: transferStatusFilter,
                search: transferSearch.trim(),
                page: transferPage,
                limit: 15
            });
            if (res.data?.data) {
                const data = res.data.data;
                setMyTransfers(data.transfers || []);
                setTransferTotalPages(data.pagination?.totalPages || 1);
                setTransferTotalRecords(data.pagination?.totalRecords || 0);
                if (data.stats) {
                    setTransferStats({
                        total: data.stats.total || 0,
                        incomingCount: data.stats.incomingCount || 0,
                        outgoingCount: data.stats.outgoingCount || 0,
                        pendingCount: data.stats.pendingCount || 0,
                        acceptedCount: data.stats.acceptedCount || 0,
                        rejectedCount: data.stats.rejectedCount || 0
                    });
                }
            }
        } catch (e) {
            console.error('Failed to load transfer history', e);
        } finally {
            setMyTransfersLoading(false);
        }
    }, [token, transferTypeFilter, transferStatusFilter, transferSearch, transferPage]);

    const fetchTicketTransfers = useCallback(async (taskId: number) => {
        if (!token) return;
        setTicketTransfersLoading(true);
        try {
            const res = await repairApi.getTicketTransfers(token, taskId);
            if (res.data?.data) {
                setTicketTransfers(res.data.data);
            } else {
                setTicketTransfers([]);
            }
        } catch (e) {
            console.error('Failed to load ticket transfers', e);
        } finally {
            setTicketTransfersLoading(false);
        }
    }, [token]);

    const fetchWorkLogs = useCallback(async (taskId: number) => {
        if (!token) return;
        setWorkLogsLoading(true);
        try {
            const res = await repairApi.getWorkLogs(token, taskId);
            if (res.ok && res.data) {
                setWorkLogs((res.data as any).data || []);
            }
        } finally {
            setWorkLogsLoading(false);
        }
    }, [token]);

    const fetchNotifs = useCallback(async () => {
        if (!token) return;
        const res = await notificationApi.getAll(token);
        if (res.ok && res.data) {
            setNotifications(res.data.data);
        }
    }, [token]);

    // Debounce search requests to the backend
    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
            fetchTasks('');
            return;
        }

        const timer = setTimeout(() => {
            debouncedSearchQueryRef.current = searchQuery;
            fetchTasks(searchQuery);
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery, fetchTasks]);

    useEffect(() => {
        if (!isAuthenticated || !token) return;

        fetchNotifs();
        fetchTechnicians();

        const doSilentRefresh = () => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            fetchTasks(debouncedSearchQueryRef.current, true);
            fetchNotifs();
        };

        const interval = setInterval(doSilentRefresh, 30000); // 30-second auto-refresh
        autoRefreshRef.current = interval;
        notifRefreshRef.current = interval;

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
            fetchNotifs();
        };
        window.addEventListener('tekdoctor:notifications_updated', handleNotifsEvent);

        return () => {
            clearInterval(interval);
            autoRefreshRef.current = null;
            notifRefreshRef.current = null;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('tekdoctor:notifications_updated', handleNotifsEvent);
            unsubscribe();
        };
    }, [isAuthenticated, token, fetchTasks, fetchNotifs, fetchTechnicians]);

    useEffect(() => {
        let result = [...tasks];

        // 1. Status Filter
        if (activeFilter !== 'all') {
            if (activeFilter === 'pending_acceptance') {
                result = result.filter(t => t.pendingTechnicianId === user?.id);
            } else {
                result = result.filter(t => t.status.toLowerCase() === activeFilter.toLowerCase() && t.pendingTechnicianId !== user?.id);
            }
        }

        // 2. Account Type Filter (Individual Customer vs B2B Company)
        if (accountTypeFilter === 'individual') {
            result = result.filter(t => !t.companyId && !t.companyName);
        } else if (accountTypeFilter === 'b2b') {
            result = result.filter(t => Boolean(t.companyId || t.companyName));
        }

        // 3. Search Query Filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter(t =>
                (t.ticketNumber && t.ticketNumber.toLowerCase().includes(q)) ||
                (t.customerName && t.customerName.toLowerCase().includes(q)) ||
                (t.companyName && t.companyName.toLowerCase().includes(q)) ||
                (t.companyContactPerson && t.companyContactPerson.toLowerCase().includes(q)) ||
                (t.employeeName && t.employeeName.toLowerCase().includes(q)) ||
                (t.serialNumber && t.serialNumber.toLowerCase().includes(q)) ||
                (t.assetId && t.assetId.toLowerCase().includes(q)) ||
                (t.mobile && t.mobile.includes(q)) ||
                (t.companyPhone && t.companyPhone.includes(q)) ||
                (t.employeePhone && t.employeePhone.includes(q)) ||
                (t.email && t.email.toLowerCase().includes(q)) ||
                (t.city && t.city.toLowerCase().includes(q)) ||
                (t.deviceCategory && t.deviceCategory.toLowerCase().includes(q)) ||
                (t.brand && t.brand.toLowerCase().includes(q)) ||
                (t.customBrand && t.customBrand.toLowerCase().includes(q)) ||
                (t.modelNumber && t.modelNumber.toLowerCase().includes(q)) ||
                (t.problemType && t.problemType.toLowerCase().includes(q))
            );
        }

        setFilteredTasks(result);
    }, [tasks, activeFilter, accountTypeFilter, searchQuery, user?.id]);

    const openModal = (task: ServiceRequest, initialTab: ModalTab = 'overview') => {
        setSelectedTask(task);
        setActiveTab(initialTab);
        setCustomerDesc(task.customerRepairDescription || '');
        setWorkLogs([]);
        setTicketTransfers([]);
        setNewLog({ repairStage: '', actionPerformed: '', partsReplaced: '', timeSpent: '', notes: '' });
        setLogMediaFile(null);
        setSelectedMilestone('');
        setMilestoneNotes('');
        setDiagForm({
            diagnosis: task.diagnosis || '',
            identifiedIssues: task.identifiedIssues || '',
            requiredWork: task.requiredWork || '',
            requiredParts: task.requiredParts || '',
            estimatedCost: task.estimatedCost ? String(task.estimatedCost) : '',
            additionalCharges: task.additionalCharges ? String(task.additionalCharges) : '',
            estimatedCompletionDate: task.estimatedCompletionDate ? task.estimatedCompletionDate.split('T')[0] : '',
            inspectionNotes: task.inspectionNotes || '',
            deviceCondition: task.deviceCondition || '',
        });
        setIsEditingDiagnosis(false);
        setDiagFormErrors({});
    };

    const handleSubmitDiagnosis = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token || !selectedTask) return;
        if (selectedTask.assignedTechnicianId !== user?.id) {
            toast.error("Diagnosis submission is restricted to the assigned technician.");
            return;
        }
        setDiagFormErrors({});

        const errs: { diagnosis?: string; estimatedCost?: string; additionalCharges?: string } = {};
        if (!diagForm.diagnosis.trim()) {
            errs.diagnosis = 'Diagnosis description is required.';
        } else if (diagForm.diagnosis.trim().length > 500) {
            errs.diagnosis = 'Diagnosis description cannot exceed 500 characters.';
        }

        const trimmedCost = String(diagForm.estimatedCost || '').trim();
        const costNum = Number(trimmedCost);
        if (!trimmedCost) {
            errs.estimatedCost = 'Approximate repair budget is required.';
        } else if (isNaN(costNum) || costNum < 0) {
            errs.estimatedCost = 'Please enter a valid approximate repair budget (₹0 or greater).';
        } else if (costNum > 10000000) {
            errs.estimatedCost = 'Approximate budget cannot exceed ₹10,000,000.';
        } else if (trimmedCost.includes('.') && trimmedCost.split('.')[1].length > 2) {
            errs.estimatedCost = 'Amount cannot exceed 2 decimal places.';
        }

        const trimmedAdd = String(diagForm.additionalCharges || '').trim();
        const addNum = trimmedAdd ? Number(trimmedAdd) : 0;
        if (trimmedAdd) {
            if (isNaN(addNum) || addNum < 0) {
                errs.additionalCharges = 'Additional charges must be a valid amount (₹0 or greater).';
            } else if (addNum > 10000000) {
                errs.additionalCharges = 'Additional charges cannot exceed ₹10,000,000.';
            } else if (trimmedAdd.includes('.') && trimmedAdd.split('.')[1].length > 2) {
                errs.additionalCharges = 'Amount cannot exceed 2 decimal places.';
            }
        }

        if (Object.keys(errs).length > 0) {
            setDiagFormErrors(errs);
            return;
        }

        setSubmittingDiagnosis(true);
        try {
            const payload = {
                diagnosis: diagForm.diagnosis.trim(),
                identifiedIssues: diagForm.identifiedIssues.trim() || undefined,
                requiredWork: diagForm.requiredWork.trim() || undefined,
                requiredParts: diagForm.requiredParts.trim() || undefined,
                estimatedCost: costNum,
                additionalCharges: diagForm.additionalCharges ? parseFloat(diagForm.additionalCharges) || 0 : 0,
                estimatedCompletionDate: diagForm.estimatedCompletionDate || undefined,
                inspectionNotes: diagForm.inspectionNotes.trim() || undefined,
                deviceCondition: diagForm.deviceCondition.trim() || undefined
            };

            const res = await repairApi.submitDiagnosis(token, selectedTask.id, payload);
            if (res.ok) {
                toast.success('Diagnosis & approximate estimate submitted to customer!');
                setIsEditingDiagnosis(false);
                const updatedFields = {
                    ...payload,
                    customerApprovalStatus: 'pending_approval',
                    estimateSubmittedAt: new Date().toISOString()
                };
                setSelectedTask(prev => prev ? { ...prev, ...updatedFields } : null);
                setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, ...updatedFields } : t));
            } else {
                toast.error(res.error || 'Failed to submit diagnosis.');
            }
        } catch {
            toast.error('Network error submitting diagnosis.');
        } finally {
            setSubmittingDiagnosis(false);
        }
    };

    useEffect(() => {
        if (selectedTask && activeTab === 'work-log') {
            fetchWorkLogs(selectedTask.id);
        } else if (selectedTask && activeTab === 'transfers') {
            fetchTicketTransfers(selectedTask.id);
        }
    }, [activeTab, selectedTask, fetchWorkLogs, fetchTicketTransfers]);

    useEffect(() => {
        if (isTransfersRoute) {
            fetchMyTransfers();
        }
    }, [isTransfersRoute, fetchMyTransfers]);

    const handleStatusChange = async (taskId: number, newStatus: 'pending' | 'in_progress' | 'completed') => {
        if (!token) return;
        if (selectedTask && selectedTask.assignedTechnicianId !== user?.id) {
            toast.error("You are not authorized to modify another technician's decision or ticket status.");
            return;
        }
        if (selectedTask && selectedTask.status === 'in_progress' && newStatus === 'pending') {
            toast.error("Tickets in progress cannot be reverted to Pending.");
            return;
        }
        if (newStatus === 'in_progress' && selectedTask) {
            const approval = selectedTask.customerApprovalStatus?.toLowerCase();
            if (approval && approval !== 'none' && approval !== 'approved') {
                if (approval === 'pending_approval') {
                    toast.error("Cannot start repair: Approximate budget is awaiting customer approval.");
                    return;
                }
                if (approval === 'rejected' || approval === 'on_hold') {
                    toast.error("Cannot start repair: Customer declined the repair estimate (Ticket is On Hold).");
                    return;
                }
                if (approval === 'auto_cancelled') {
                    toast.error("Cannot start repair: Customer approval window has expired and ticket is cancelled.");
                    return;
                }
            }
        }
        setStatusUpdateLoadingId(taskId);
        try {
            const response = await repairApi.updateStatus(token, taskId, newStatus);
            if (response.ok) {
                setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
                if (selectedTask && selectedTask.id === taskId) {
                    setSelectedTask(prev => prev ? { ...prev, status: newStatus } : null);
                }
                toast.success('Status updated successfully');
            } else {
                toast.error(`Error: ${response.error}`);
            }
        } finally {
            setStatusUpdateLoadingId(null);
        }
    };

    const [recordingCash, setRecordingCash] = useState(false);

    // Bill / Invoice Viewer State
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [selectedReceiptTicketId, setSelectedReceiptTicketId] = useState<number | string | null>(null);
    const [printingTicketId, setPrintingTicketId] = useState<number | string | null>(null);
    const [downloadingTicketId, setDownloadingTicketId] = useState<number | string | null>(null);

    const handlePrintTaskReceipt = async (ticketId: number | string) => {
        if (!token) return;
        setPrintingTicketId(ticketId);
        const toastId = toast.loading('Preparing official bill for printing...');
        try {
            const res = await billingApi.getPaymentReceiptByTicket(ticketId, token);
            const receiptData = res.ok && res.data ? (res.data.data || res.data) : null;
            if (receiptData) {
                await printPaymentBill(receiptData);
                toast.dismiss(toastId);
            } else {
                toast.error(res.error || 'Failed to retrieve payment receipt.', { id: toastId });
            }
        } catch (err: any) {
            toast.error('Print preview failed: ' + (err?.message || 'Unknown error'), { id: toastId });
        } finally {
            setPrintingTicketId(null);
        }
    };

    const handleDownloadTaskReceipt = async (ticketId: number | string) => {
        if (!token) return;
        setDownloadingTicketId(ticketId);
        const toastId = toast.loading('Generating official GST tax invoice PDF...');
        try {
            const res = await billingApi.getPaymentReceiptByTicket(ticketId, token);
            const receiptData = res.ok && res.data ? (res.data.data || res.data) : null;
            if (receiptData) {
                await downloadPaymentBillPdf(receiptData);
                toast.success('Official tax invoice downloaded successfully!', { id: toastId });
            } else {
                toast.error(res.error || 'Failed to generate tax invoice PDF.', { id: toastId });
            }
        } catch (err: any) {
            toast.error('Download failed: ' + (err?.message || 'Unknown error'), { id: toastId });
        } finally {
            setDownloadingTicketId(null);
        }
    };

    const handleRecordCashCollected = async () => {
        if (!token || !selectedTask) return;
        const isFinal = (selectedTask as any).invoiceStatus === 'Final' || (selectedTask as any).invoice_status === 'Final';
        if (!isFinal) {
            toast.error('Cash collection is unavailable until the final invoice is released.');
            return;
        }
        const isCash = (selectedTask.paymentMethod || (selectedTask as any).payment_method || '').toLowerCase() === 'cash';
        if (!isCash) {
            toast.error('Cash payment has not been initiated for this repair ticket.');
            return;
        }
        setRecordingCash(true);
        try {
            const res = await billingApi.recordCashCollected({ ticketId: selectedTask.id }, token);
            if (res.ok) {
                toast.success('Cash collection recorded! Payment status is now pending admin verification.');
                setSelectedTask(prev => prev ? {
                    ...prev,
                    collectionStatus: 'collected',
                    collection_status: 'collected',
                    paymentStatus: 'pending_verification',
                    payment_status: 'pending_verification'
                } : null);
                setTasks(prev => prev.map(t => t.id === selectedTask.id ? {
                    ...t,
                    collectionStatus: 'collected',
                    collection_status: 'collected',
                    paymentStatus: 'pending_verification',
                    payment_status: 'pending_verification'
                } : t));
            } else {
                toast.error(res.error || 'Failed to record cash collection.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error recording cash collection.');
        } finally {
            setRecordingCash(false);
        }
    };

    const handleAccept = async (e: React.MouseEvent, taskId: number) => {
        e.stopPropagation();
        if (!token) return;
        try {
            const res = await repairApi.acceptAssignment(token, taskId);
            if (res.ok) {
                toast.success('Ticket Accepted');
                fetchTasks();
                if (isTransfersRoute) fetchMyTransfers();
            } else {
                toast.error(res.error || 'Failed to accept ticket');
            }
        } catch (e) {
            toast.error('Network Error');
        }
    };

    const handleReject = async (e: React.MouseEvent, taskId: number) => {
        e.stopPropagation();
        if (!token) return;
        try {
            const res = await repairApi.rejectAssignment(token, taskId);
            if (res.ok) {
                toast.success('Ticket Rejected');
                fetchTasks();
                if (isTransfersRoute) fetchMyTransfers();
            } else {
                toast.error(res.error || 'Failed to reject ticket');
            }
        } catch (e) {
            toast.error('Network Error');
        }
    };

    const handleTransfer = async () => {
        if (!token || !selectedTask || !transferTargetId) return;
        if (selectedTask.assignedTechnicianId !== user?.id) {
            toast.error('You can only transfer your own assigned tasks.');
            return;
        }
        setTransferring(true);
        try {
            const res = await repairApi.transferTicket(token, selectedTask.id, { targetTechnicianId: parseInt(transferTargetId), reason: transferReason });
            if (res.ok) {
                toast.success('Transfer Initiated!');
                setTransferModalOpen(false);
                setSelectedTask(null);
                fetchTasks();
                if (isTransfersRoute) fetchMyTransfers();
            } else {
                toast.error(res.error || 'Failed to transfer ticket.');
            }
        } catch (e) {
            toast.error('Network error during transfer.');
        } finally {
            setTransferring(false);
        }
    };

    const handleSubmitWorkLog = async () => {
        if (!token || !selectedTask) return;
        if (selectedTask.assignedTechnicianId !== user?.id) {
            toast.error("Work log creation is restricted to the assigned technician.");
            return;
        }
        if (!newLog.repairStage || !newLog.actionPerformed) {
            toast.error('Repair stage and action performed are required.');
            return;
        }
        setSubmittingLog(true);
        try {
            const fd = new FormData();
            fd.append('repairStage', newLog.repairStage);
            fd.append('actionPerformed', newLog.actionPerformed);
            if (newLog.partsReplaced) fd.append('partsReplaced', newLog.partsReplaced);
            if (newLog.timeSpent) fd.append('timeSpent', newLog.timeSpent);
            if (newLog.notes) fd.append('notes', newLog.notes);
            if (logMediaFile) fd.append('workLogMedia', logMediaFile);

            const res = await repairApi.createWorkLog(token, selectedTask.id, fd);
            if (res.ok) {
                toast.success('Work log entry added!');
                setNewLog({ repairStage: '', actionPerformed: '', partsReplaced: '', timeSpent: '', notes: '' });
                setLogMediaFile(null);
                fetchWorkLogs(selectedTask.id);
            } else {
                toast.error(res.error || 'Failed to add work log.');
            }
        } finally {
            setSubmittingLog(false);
        }
    };

    const handleSendMilestone = async () => {
        if (!token || !selectedTask || !selectedMilestone) {
            toast.error('Please select a milestone.');
            return;
        }
        if (selectedTask.assignedTechnicianId !== user?.id) {
            toast.error("Milestone notifications can only be sent by the assigned technician.");
            return;
        }
        setSendingMilestone(true);
        try {
            const res = await repairApi.sendMilestoneNotification(token, selectedTask.id, selectedMilestone, milestoneNotes);
            if (res.ok) {
                const emailSent = (res.data as any)?.data?.emailSent;
                toast.success(`Notification sent!${emailSent ? ' Email dispatched.' : ''}`);
                setSelectedMilestone('');
                setMilestoneNotes('');
            } else {
                toast.error(res.error || 'Failed to send milestone notification.');
            }
        } finally {
            setSendingMilestone(false);
        }
    };

    const handleSaveCustomerDesc = async () => {
        if (!token || !selectedTask) return;
        if (selectedTask.assignedTechnicianId !== user?.id) {
            toast.error("Only the assigned technician can modify the customer repair description.");
            return;
        }
        setSavingDesc(true);
        try {
            const res = await repairApi.updateCustomerDescription(token, selectedTask.id, customerDesc);
            if (res.ok) {
                toast.success('Customer repair description saved!');
                setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, customerRepairDescription: customerDesc } : t));
                setSelectedTask(prev => prev ? { ...prev, customerRepairDescription: customerDesc } : null);
            } else {
                toast.error(res.error || 'Failed to save description.');
            }
        } finally {
            setSavingDesc(false);
        }
    };

    const getFileUrl = (filePath: string | null) => {
        if (!filePath) return null;
        const base = appConfig.apiUrl || window.location.origin;
        const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
        const cleanPath = filePath.replace(/^\//, '');
        return `${cleanBase}/${cleanPath}`;
    };

    const getStatusBadge = (status: string) => {
        switch (status.toLowerCase()) {
            case 'pending': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"><Hourglass size={12} /> PENDING</span>;
            case 'in_progress': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20"><Hammer size={12} /> IN_PROGRESS</span>;
            case 'completed': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 size={12} /> COMPLETED</span>;
            case 'delivered': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20"><CheckCircle2 size={12} /> DELIVERED</span>;
            case 'cancelled': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-red-500/10 text-red-400 border border-red-500/20"><XCircle size={12} /> CANCELLED</span>;
            default: return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">{status.toUpperCase()}</span>;
        }
    };

    const getPriorityBadge = (priority: string) => {
        if (priority?.toLowerCase() === 'priority' || priority?.toLowerCase() === 'urgent') {
            return <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">Priority</span>;
        }
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-zinc-800 text-zinc-400 border border-zinc-700">Standard</span>;
    };

    const getStatusCardStyle = (status: string) => {
        switch (status.toLowerCase()) {
            case 'pending': return 'border-amber-500/20 hover:border-amber-500/40';
            case 'in_progress': return 'border-neon-cyan/20 hover:border-neon-cyan/40';
            case 'completed': return 'border-emerald-500/20 hover:border-emerald-500/40';
            case 'delivered': return 'border-blue-500/20 hover:border-blue-500/40';
            default: return 'border-zinc-800 hover:border-zinc-700';
        }
    };

    const allowedStatuses = ['pending', 'in_progress', 'completed'] as const;

    const TABS: { id: ModalTab; label: string; icon: React.ReactNode }[] = [
        { id: 'overview', label: 'Overview', icon: <FileText size={13} /> },
        { id: 'diagnosis', label: 'Diagnosis & Estimate', icon: <Cpu size={13} /> },
        { id: 'work-log', label: 'Work Log', icon: <ClipboardList size={13} /> },
        { id: 'transfers', label: 'Transfer Chain', icon: <ArrowRightLeft size={13} /> },
        { id: 'milestones', label: 'Milestones', icon: <Bell size={13} /> },
        { id: 'customer-note', label: 'Customer Note', icon: <Star size={13} /> },
    ];

    const stageBadgeColor: Record<string, string> = {
        'diagnosis': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        'repair': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        'parts': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
        'quality': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        'ready': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    };
    const getStageBadge = (stage: string) => {
        const key = Object.keys(stageBadgeColor).find(k => stage.toLowerCase().includes(k));
        const cls = key ? stageBadgeColor[key] : 'bg-zinc-800 text-zinc-400 border-zinc-700';
        return <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${cls}`}>{stage}</span>;
    };

    const getHeaderInfo = () => {
        if (location.pathname === ROUTES.TECHNICIAN_DIAGNOSIS) {
            return {
                badge: 'Stage: Inspection & Quotes',
                title: 'Diagnosis & Estimate',
                subtitle: 'Tasks requiring diagnostic inspection, parts estimation, and customer quotes'
            };
        }
        if (location.pathname === ROUTES.TECHNICIAN_IN_PROGRESS) {
            return {
                badge: 'Stage: Active Repair',
                title: 'In Progress Repairs',
                subtitle: 'Active repairs with approved customer estimates under bench execution'
            };
        }
        if (location.pathname === ROUTES.TECHNICIAN_COMPLETED) {
            return {
                badge: 'Stage: Finished & Verified',
                title: 'Completed Repairs',
                subtitle: 'Repairs finished with quality checks awaiting dispatch or customer handover'
            };
        }
        if (location.pathname === ROUTES.TECHNICIAN_DELIVERED) {
            return {
                badge: 'Stage: Dispatched / Closed',
                title: 'Delivered Repairs',
                subtitle: 'Archived tickets delivered or handed back to customer'
            };
        }
        if (location.pathname === ROUTES.TECHNICIAN_TRANSFERS) {
            return {
                badge: 'Task Handoffs & Audit',
                title: 'Task Transfer',
                subtitle: 'Manage incoming transfer requests and track cross-technician device handoffs'
            };
        }
        if (location.pathname === ROUTES.TECHNICIAN_NOTIFICATIONS) {
            return {
                badge: 'Alerts & Telemetry',
                title: 'Notifications Center',
                subtitle: 'Operational dispatches, customer approvals, and ticket lifecycle events'
            };
        }
        if (location.pathname === ROUTES.TECHNICIAN_ASSIGNED_TICKETS) {
            return {
                badge: 'Assigned Workload',
                title: 'My Assigned Tasks',
                subtitle: 'Authoritative list of repair tickets assigned to your bench'
            };
        }
        return {
            badge: 'Technician Workbench',
            title: 'Technician Dashboard',
            subtitle: 'Real-time telemetry and assigned device repair tickets'
        };
    };

    const headerInfo = getHeaderInfo();
    const individualCount = tasks.filter(t => !t.companyId && !t.companyName).length;
    const b2bCount = tasks.filter(t => Boolean(t.companyId || t.companyName)).length;
    const pendingTransferCount = tasks.filter(t => t.pendingTechnicianId === user?.id).length;
    const pendingCount = tasks.filter(t => t.status === 'pending' && t.pendingTechnicianId !== user?.id).length;
    const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    const deliveredCount = tasks.filter(t => t.status === 'delivered').length;

    // Diagnosis & Estimate queue for Dashboard overview
    const diagnosisTickets = useMemo(() => {
        const eligible = tasks.filter(t => t.status?.toLowerCase() === 'pending' && t.pendingTechnicianId !== user?.id);
        return [...eligible].sort((a, b) => {
            const isPriorityA = (a.priority?.toLowerCase() === 'priority' || a.priority?.toLowerCase() === 'urgent') ? 1 : 0;
            const isPriorityB = (b.priority?.toLowerCase() === 'priority' || b.priority?.toLowerCase() === 'urgent') ? 1 : 0;
            if (isPriorityA !== isPriorityB) return isPriorityB - isPriorityA;
            const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
            const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
            return timeB - timeA;
        });
    }, [tasks, user?.id]);

    const displayedDiagnosisTickets = useMemo(() => {
        let list = diagnosisTickets;
        if (diagFilter === 'priority') {
            list = list.filter(t => t.priority?.toLowerCase() === 'priority' || t.priority?.toLowerCase() === 'urgent');
        } else if (diagFilter === 'individual') {
            list = list.filter(t => !t.companyId && !t.companyName);
        } else if (diagFilter === 'b2b') {
            list = list.filter(t => Boolean(t.companyId || t.companyName));
        }

        if (diagSearch.trim()) {
            const q = diagSearch.toLowerCase().trim();
            list = list.filter(t =>
                (t.ticketNumber && t.ticketNumber.toLowerCase().includes(q)) ||
                (t.customerName && t.customerName.toLowerCase().includes(q)) ||
                (t.companyName && t.companyName.toLowerCase().includes(q)) ||
                (t.companyContactPerson && t.companyContactPerson.toLowerCase().includes(q)) ||
                (t.employeeName && t.employeeName.toLowerCase().includes(q)) ||
                (t.serialNumber && t.serialNumber.toLowerCase().includes(q)) ||
                (t.assetId && t.assetId.toLowerCase().includes(q)) ||
                (t.mobile && t.mobile.includes(q)) ||
                (t.companyPhone && t.companyPhone.includes(q)) ||
                (t.employeePhone && t.employeePhone.includes(q)) ||
                (t.city && t.city.toLowerCase().includes(q)) ||
                (t.deviceCategory && t.deviceCategory.toLowerCase().includes(q)) ||
                (t.brand && t.brand.toLowerCase().includes(q)) ||
                (t.customBrand && t.customBrand.toLowerCase().includes(q)) ||
                (t.modelNumber && t.modelNumber.toLowerCase().includes(q)) ||
                (t.problemType && t.problemType.toLowerCase().includes(q))
            );
        }
        return list;
    }, [diagnosisTickets, diagFilter, diagSearch]);

    const displayedNotifications = notifications.filter(n => {
        if (notifFilter === 'unread') {
            return n.is_read === false || n.is_read === 0 || !n.is_read;
        }
        return true;
    });

    return (
        <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans py-3 sm:py-6 md:py-10 px-0 sm:px-2 md:px-4">
            <div className="max-w-7xl mx-auto space-y-5 sm:space-y-8">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 border-b border-zinc-900 pb-5 md:pb-6">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-400 truncate">{headerInfo.badge}</span>
                            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping shrink-0" />
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-outfit tracking-tight break-words">{headerInfo.title}</h1>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{headerInfo.subtitle}</p>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
                            <div className="flex items-center gap-1.5 text-xs text-zinc-500"><User size={12} className="shrink-0" /><span className="truncate max-w-[140px] sm:max-w-none">{user?.name}</span></div>
                            <span className="text-zinc-700 hidden sm:inline">•</span>
                            <div className="flex items-center gap-1.5 text-xs text-zinc-600"><Wifi size={11} className="shrink-0" /><span>Auto-refresh 30s</span></div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="text-[10px] font-mono text-zinc-600 hidden md:block">LAST_SYNC: {lastRefreshed.toLocaleTimeString()}</div>

                        {/* Compact Search Icon for Ticket Searching */}
                        <button
                            type="button"
                            onClick={() => setSearchModalOpen(true)}
                            className="p-2 sm:p-2.5 bg-zinc-900/60 border border-zinc-800 rounded-lg text-zinc-400 hover:text-emerald-400 hover:border-emerald-400/30 hover:bg-emerald-400/5 transition-all duration-300 cursor-pointer flex items-center justify-center shrink-0"
                            title="Search tickets (Ctrl+K)"
                            aria-label="Search tickets"
                        >
                            <Search size={14} />
                        </button>

                        {/* Notification Bell Dropdown (Hidden on Notifications Center page to avoid duplicate popover) */}
                        {!isNotificationsRoute && (
                            <div className="hidden md:block relative" ref={notifRef}>
                                <button
                                    onClick={() => setShowNotifications(!showNotifications)}
                                    className="relative p-2 sm:p-2.5 bg-zinc-900/60 border border-zinc-800 rounded-lg text-zinc-400 hover:text-emerald-400 hover:border-emerald-400/30 hover:bg-emerald-400/5 transition-all duration-300 cursor-pointer flex items-center justify-center animate-fadeIn"
                                    title="Notifications Dropdown"
                                >
                                    <Bell size={14} />
                                    {unreadCount > 0 && (
                                        <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-red-500 rounded-full text-[8.5px] font-bold text-white flex items-center justify-center animate-pulse">
                                            {unreadCount > 9 ? '9+' : unreadCount}
                                        </span>
                                    )}
                                </button>

                                <AnimatePresence>
                                    {showNotifications && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 12, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 12, scale: 0.95 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute right-0 mt-3 w-[calc(100vw-2.5rem)] max-w-xs sm:w-80 sm:max-w-none bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl z-50 text-left"
                                        >
                                            <div className="p-4 border-b border-zinc-900 flex justify-between items-center bg-black/50">
                                                <h4 className="text-[11px] font-bold text-white uppercase tracking-widest font-mono">My Alerts</h4>
                                                <div className="flex gap-2">
                                                    {unreadCount > 0 && (
                                                        <button
                                                            onClick={() => handleMarkAsRead('all')}
                                                            className="text-[9px] font-mono text-emerald-400 hover:text-white uppercase transition-colors cursor-pointer"
                                                        >
                                                            Mark all read
                                                        </button>
                                                    )}
                                                    {notifications.length > 0 && (
                                                        <button
                                                            onClick={handleClearAllNotifications}
                                                            className="text-[9px] font-mono text-red-500 hover:text-white uppercase transition-colors cursor-pointer"
                                                        >
                                                            Clear all
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
                                                {notifications.length === 0 ? (
                                                    <div className="p-8 text-center text-zinc-600 text-xs font-mono">
                                                        No notifications received.
                                                    </div>
                                                ) : (
                                                    notifications.map((n) => {
                                                        const hasTicket = !!n.ticket_id;
                                                        const handleNotificationClick = async () => {
                                                            if (!n.is_read) {
                                                                await handleMarkAsRead(Number(n.id));
                                                            }
                                                            setShowNotifications(false);
                                                            setActiveModalNotif({ ...n, is_read: true });
                                                        };
                                                        return (
                                                            <div
                                                                key={n.id}
                                                                onClick={handleNotificationClick}
                                                                className={`p-4 border-b border-zinc-900 transition-all relative group text-left cursor-pointer ${n.is_read
                                                                    ? 'bg-transparent text-zinc-500 hover:bg-zinc-900/30'
                                                                    : 'bg-emerald-400/[0.03] hover:bg-zinc-900/50 border-l-2 border-l-emerald-400 text-white'
                                                                    }`}
                                                            >
                                                                <div className="flex justify-between items-start gap-4 mb-1">
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <p className={`text-xs font-bold ${n.is_read ? 'text-zinc-400' : 'text-emerald-400'}`}>
                                                                            {n.title}
                                                                        </p>
                                                                        {!n.is_read && (
                                                                            <span className="text-[8px] bg-red-500/10 text-red-400 font-bold px-1 rounded uppercase tracking-wider scale-90 origin-left">New</span>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleDeleteNotification(e, Number(n.id)); }}
                                                                        className="text-zinc-600 hover:text-red-400 p-0.5 rounded transition-colors shrink-0"
                                                                        title="Delete notification"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                </div>
                                                                <p className="text-[10px] opacity-80 leading-relaxed mb-1.5 font-normal">
                                                                    {n.message}
                                                                </p>
                                                                {n.sender_name && (
                                                                    <div className="text-[9px] text-zinc-500 font-mono mb-1">
                                                                        From: {n.sender_name}
                                                                    </div>
                                                                )}
                                                                {hasTicket && n.ticket_number && (
                                                                    <div className="text-[9px] font-mono text-emerald-400/80 flex items-center gap-0.5 mb-2 hover:underline cursor-pointer">
                                                                        <span>Related Ticket: {n.ticket_number}</span>
                                                                    </div>
                                                                )}
                                                                <p className="text-[9px] font-mono text-zinc-600">
                                                                    {new Date(n.created_at).toLocaleString()}
                                                                </p>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        <button onClick={fetchTasks} className="p-2 sm:p-2.5 bg-zinc-900/60 border border-zinc-800 rounded-lg hover:border-emerald-500/50 text-zinc-400 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 sm:gap-2 text-xs font-semibold font-mono">
                            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> SYNC
                        </button>
                    </div>
                </div>

                {/* KPI Metrics: Rendered on Dashboard Overview Route */}
                {isDashboardRoute && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
                        <div
                            onClick={() => navigate(ROUTES.TECHNICIAN_ASSIGNED_TICKETS)}
                            className="bg-[#0c0c0c] border border-zinc-900 rounded-xl sm:rounded-2xl p-3 sm:p-4 cursor-pointer transition-all hover:border-emerald-500/50 hover:bg-emerald-500/[0.03] group"
                        >
                            <div className="text-[10px] font-mono uppercase text-zinc-500 flex items-center justify-between mb-1">
                                <span className="truncate">Total Assigned</span>
                                <ClipboardList size={13} className="text-zinc-400 group-hover:text-emerald-400 transition-colors shrink-0" />
                            </div>
                            <div className="text-xl sm:text-2xl font-bold font-outfit text-white">{tasks.length}</div>
                            <div className="text-[10px] font-mono text-emerald-400/80 mt-1 flex items-center gap-1 truncate">Workbench <ChevronRight size={10} /></div>
                        </div>

                        <div
                            onClick={() => navigate(`${ROUTES.TECHNICIAN_ASSIGNED_TICKETS}?tab=pending_acceptance`)}
                            className="bg-[#0c0c0c] border border-zinc-900 rounded-xl sm:rounded-2xl p-3 sm:p-4 cursor-pointer transition-all hover:border-amber-500/50 hover:bg-amber-500/[0.03] group"
                        >
                            <div className="text-[10px] font-mono uppercase text-amber-400 flex items-center justify-between mb-1">
                                <span className="truncate">Pending Acceptance</span>
                                <Hourglass size={13} className="text-amber-400 shrink-0" />
                            </div>
                            <div className="text-xl sm:text-2xl font-bold font-outfit text-amber-400">{pendingTransferCount}</div>
                            <div className="text-[10px] font-mono text-amber-400/80 mt-1 flex items-center gap-1 truncate">Review <ChevronRight size={10} /></div>
                        </div>

                        <div
                            onClick={() => navigate(ROUTES.TECHNICIAN_DIAGNOSIS)}
                            className="bg-[#0c0c0c] border border-zinc-900 rounded-xl sm:rounded-2xl p-3 sm:p-4 cursor-pointer transition-all hover:border-blue-500/50 hover:bg-blue-500/[0.03] group"
                        >
                            <div className="text-[10px] font-mono uppercase text-blue-400 flex items-center justify-between mb-1">
                                <span className="truncate">Diagnosis & Quote</span>
                                <Cpu size={13} className="text-blue-400 shrink-0" />
                            </div>
                            <div className="text-xl sm:text-2xl font-bold font-outfit text-blue-400">{pendingCount}</div>
                            <div className="text-[10px] font-mono text-blue-400/80 mt-1 flex items-center gap-1 truncate">Queue <ChevronRight size={10} /></div>
                        </div>

                        <div
                            onClick={() => navigate(ROUTES.TECHNICIAN_IN_PROGRESS)}
                            className="bg-[#0c0c0c] border border-zinc-900 rounded-xl sm:rounded-2xl p-3 sm:p-4 cursor-pointer transition-all hover:border-neon-cyan/50 hover:bg-neon-cyan/[0.03] group"
                        >
                            <div className="text-[10px] font-mono uppercase text-neon-cyan flex items-center justify-between mb-1">
                                <span className="truncate">In Progress</span>
                                <Hammer size={13} className="text-neon-cyan shrink-0" />
                            </div>
                            <div className="text-xl sm:text-2xl font-bold font-outfit text-neon-cyan">{inProgressCount}</div>
                            <div className="text-[10px] font-mono text-cyan-400/80 mt-1 flex items-center gap-1 truncate">Bench <ChevronRight size={10} /></div>
                        </div>

                        <div
                            onClick={() => navigate(ROUTES.TECHNICIAN_COMPLETED)}
                            className="bg-[#0c0c0c] border border-zinc-900 rounded-xl sm:rounded-2xl p-3 sm:p-4 cursor-pointer transition-all hover:border-emerald-500/50 hover:bg-emerald-500/[0.03] group"
                        >
                            <div className="text-[10px] font-mono uppercase text-emerald-400 flex items-center justify-between mb-1">
                                <span className="truncate">Completed</span>
                                <CheckCheck size={13} className="text-emerald-400 shrink-0" />
                            </div>
                            <div className="text-xl sm:text-2xl font-bold font-outfit text-emerald-400">{completedCount}</div>
                            <div className="text-[10px] font-mono text-emerald-400/80 mt-1 flex items-center gap-1 truncate">Verified <ChevronRight size={10} /></div>
                        </div>

                        <div
                            onClick={() => navigate(ROUTES.TECHNICIAN_DELIVERED)}
                            className="bg-[#0c0c0c] border border-zinc-900 rounded-xl sm:rounded-2xl p-3 sm:p-4 cursor-pointer transition-all hover:border-purple-500/50 hover:bg-purple-500/[0.03] group"
                        >
                            <div className="text-[10px] font-mono uppercase text-purple-400 flex items-center justify-between mb-1">
                                <span className="truncate">Delivered</span>
                                <Truck size={13} className="text-purple-400 shrink-0" />
                            </div>
                            <div className="text-xl sm:text-2xl font-bold font-outfit text-purple-400">{deliveredCount}</div>
                            <div className="text-[10px] font-mono text-purple-400/80 mt-1 flex items-center gap-1 truncate">Archive <ChevronRight size={10} /></div>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════════ */}
                {/* ── NOTIFICATIONS ROUTE VIEW ── */}
                {/* ══════════════════════════════════════════════════════════════ */}
                {isNotificationsRoute ? (
                    <div className="space-y-4 sm:space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/40 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-zinc-900">
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={() => setNotifFilter('all')}
                                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 sm:gap-2 ${
                                        notifFilter === 'all' ? 'bg-emerald-400 text-black font-bold' : 'text-zinc-400 hover:text-white bg-zinc-900/60'
                                    }`}
                                >
                                    <Bell size={13} />
                                    <span>All Alerts</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${notifFilter === 'all' ? 'bg-black/20 text-black font-bold' : 'bg-zinc-800 text-zinc-400'}`}>
                                        {notifications.length}
                                    </span>
                                </button>

                                <button
                                    onClick={() => setNotifFilter('unread')}
                                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 sm:gap-2 ${
                                        notifFilter === 'unread' ? 'bg-red-500 text-white font-bold' : 'text-zinc-400 hover:text-white bg-zinc-900/60'
                                    }`}
                                >
                                    <span>Unread</span>
                                    {unreadCount > 0 && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white text-red-600 font-bold">
                                            {unreadCount}
                                        </span>
                                    )}
                                </button>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto">
                                {unreadCount > 0 && (
                                    <button
                                        onClick={() => handleMarkAsRead('all')}
                                        className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-semibold font-mono bg-zinc-800 hover:bg-zinc-700 text-emerald-400 transition-colors cursor-pointer"
                                    >
                                        Mark All Read
                                    </button>
                                )}
                                {notifications.length > 0 && (
                                    <button
                                        onClick={handleClearAllNotifications}
                                        className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-semibold font-mono bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors cursor-pointer"
                                    >
                                        Clear All
                                    </button>
                                )}
                            </div>
                        </div>

                        {displayedNotifications.length === 0 ? (
                            <div className="border border-zinc-900 bg-zinc-950/20 rounded-2xl p-16 text-center">
                                <Bell className="w-10 h-10 text-zinc-700 mx-auto mb-4" />
                                <p className="text-zinc-500 text-sm">
                                    {notifFilter === 'unread' ? 'No unread notifications.' : 'No notifications received yet.'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {displayedNotifications.map((n) => {
                                    const matchingTask = n.ticket_id ? tasks.find(t => t.id === Number(n.ticket_id)) : null;
                                    return (
                                        <div
                                            key={n.id}
                                            className={`p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border transition-all ${
                                                n.is_read
                                                    ? 'bg-zinc-900/20 border-zinc-900 text-zinc-400'
                                                    : 'bg-emerald-500/[0.04] border-emerald-500/20 text-zinc-200 shadow-lg shadow-emerald-500/5'
                                            }`}
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-3 mb-2">
                                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                                    <span className={`w-2 h-2 rounded-full shrink-0 ${n.is_read ? 'bg-zinc-700' : 'bg-emerald-400 animate-pulse'}`} />
                                                    <h3 className="font-semibold text-white text-sm break-words">{n.title}</h3>
                                                    {!n.is_read && (
                                                        <span className="text-[9px] font-mono bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                                                            New
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-zinc-500 font-mono">
                                                    <span>{new Date(n.created_at).toLocaleString()}</span>
                                                    <button
                                                        onClick={(e) => handleDeleteNotification(e, Number(n.id))}
                                                        className="text-zinc-600 hover:text-red-400 transition-colors p-1"
                                                        title="Delete Notification"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>

                                            <p className="text-xs leading-relaxed text-zinc-300 mb-3">{n.message}</p>

                                            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-900/60 text-xs">
                                                <div className="flex items-center gap-3">
                                                    {n.sender_name && (
                                                        <span className="text-zinc-500 font-mono text-[11px]">Sender: {n.sender_name}</span>
                                                    )}
                                                    {n.ticket_number && (
                                                        <span className="text-emerald-400 font-mono text-[11px] font-bold">
                                                            Ticket: {n.ticket_number}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {!n.is_read && (
                                                        <button
                                                            onClick={() => handleMarkAsRead(Number(n.id))}
                                                            className="text-[11px] font-mono text-zinc-400 hover:text-white px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
                                                        >
                                                            Mark Read
                                                        </button>
                                                    )}
                                                    {matchingTask && (
                                                        <button
                                                            onClick={() => openModal(matchingTask)}
                                                            className="text-[11px] font-mono text-black bg-emerald-400 hover:bg-emerald-300 px-2.5 py-1 rounded font-bold transition-colors cursor-pointer flex items-center gap-1"
                                                        >
                                                            Inspect Ticket <ChevronRight size={11} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : isTransfersRoute ? (
                    <div className="space-y-6">
                        {/* ── DEDICATED TASK TRANSFER VIEW ── */}
                        {/* KPI Metrics */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                            <div className="bg-[#0c0c0c] border border-zinc-900 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                                <div className="text-[10px] font-mono uppercase text-zinc-500 flex items-center justify-between mb-1">
                                    <span className="truncate">Total Transfers</span>
                                    <ArrowRightLeft size={13} className="text-cyan-400 shrink-0" />
                                </div>
                                <div className="text-xl sm:text-2xl font-bold font-outfit text-white">{transferStats.total}</div>
                                <div className="text-[10px] font-mono text-zinc-600 mt-1 truncate">All involved handoffs</div>
                            </div>

                            <div className="bg-[#0c0c0c] border border-zinc-900 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                                <div className="text-[10px] font-mono uppercase text-emerald-400 flex items-center justify-between mb-1">
                                    <span className="truncate">Incoming</span>
                                    <Inbox size={13} className="text-emerald-400 shrink-0" />
                                </div>
                                <div className="text-xl sm:text-2xl font-bold font-outfit text-emerald-400">{transferStats.incomingCount}</div>
                                <div className="text-[10px] font-mono text-zinc-600 mt-1 truncate">Transferred to you</div>
                            </div>

                            <div className="bg-[#0c0c0c] border border-zinc-900 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                                <div className="text-[10px] font-mono uppercase text-amber-400 flex items-center justify-between mb-1">
                                    <span className="truncate">Outgoing</span>
                                    <SendHorizontal size={13} className="text-amber-400 shrink-0" />
                                </div>
                                <div className="text-xl sm:text-2xl font-bold font-outfit text-amber-400">{transferStats.outgoingCount}</div>
                                <div className="text-[10px] font-mono text-zinc-600 mt-1 truncate">Transferred from you</div>
                            </div>

                            <div className="bg-[#0c0c0c] border border-zinc-900 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                                <div className="text-[10px] font-mono uppercase text-rose-400 flex items-center justify-between mb-1">
                                    <span className="truncate">Pending</span>
                                    <Clock size={13} className="text-rose-400 shrink-0" />
                                </div>
                                <div className="text-xl sm:text-2xl font-bold font-outfit text-rose-400">{transferStats.pendingCount}</div>
                                <div className="text-[10px] font-mono text-zinc-600 mt-1 truncate">Awaiting response</div>
                            </div>
                        </div>

                        {/* Filter Bar */}
                        <div className="bg-zinc-950/60 border border-zinc-900 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-3">
                            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                                {/* Direction Filter Tabs */}
                                <div className="flex flex-wrap gap-1 bg-zinc-900/60 p-1 rounded-xl border border-zinc-800/60">
                                    {[
                                        { id: 'all', label: 'All Movements', shortLabel: 'All' },
                                        { id: 'incoming', label: 'Transferred To Me', shortLabel: 'To Me' },
                                        { id: 'outgoing', label: 'Transferred By Me', shortLabel: 'By Me' }
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => { setTransferTypeFilter(tab.id as any); setTransferPage(1); }}
                                            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold font-mono tracking-wide transition-all cursor-pointer ${
                                                transferTypeFilter === tab.id ? 'bg-neon-cyan text-black font-bold' : 'text-zinc-400 hover:text-white'
                                            }`}
                                        >
                                            <span className="hidden sm:inline">{tab.label}</span>
                                            <span className="sm:hidden">{tab.shortLabel}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* Status Filter & Movement Count */}
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {['all', 'pending', 'accepted', 'rejected'].map(st => (
                                            <button
                                                key={st}
                                                onClick={() => { setTransferStatusFilter(st as any); setTransferPage(1); }}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono capitalize transition-all cursor-pointer ${
                                                    transferStatusFilter === st
                                                        ? 'bg-zinc-800 text-white font-bold border border-zinc-700'
                                                        : 'text-zinc-500 hover:text-zinc-300'
                                                }`}
                                            >
                                                {st}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="text-xs font-mono text-zinc-500">
                                        Showing <span className="text-white font-semibold">{myTransfers.length}</span> of <span className="text-white font-semibold">{transferTotalRecords}</span> movements
                                    </div>
                                </div>
                            </div>

                            {/* Search */}
                            <div className="relative">
                                <Search size={14} className="absolute left-3.5 top-3 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder="Search by ticket #, customer, device, technician, reason..."
                                    value={transferSearch}
                                    onChange={e => { setTransferSearch(e.target.value); setTransferPage(1); }}
                                    className="w-full bg-zinc-900/70 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-neon-cyan font-mono"
                                />
                            </div>
                        </div>

                        {/* Transfer Items */}
                        {myTransfersLoading ? (
                            <div className="min-h-[30vh] flex flex-col items-center justify-center text-center">
                                <Loader2 className="w-8 h-8 text-neon-cyan animate-spin mb-3" />
                                <p className="text-zinc-500 text-xs font-mono uppercase tracking-wider">Syncing transfer audit logs...</p>
                            </div>
                        ) : myTransfers.length === 0 ? (
                            <div className="border border-zinc-900 bg-zinc-950/20 rounded-2xl p-16 text-center">
                                <ArrowRightLeft className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                                <p className="text-zinc-400 text-sm font-semibold">No Task Transfers Recorded</p>
                                <p className="text-zinc-600 text-xs font-mono mt-1">No movements match your selected filters.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {myTransfers.map((item) => {
                                    const isIncoming = item.toTechnicianId === user?.id;
                                    const isPendingMyAction = isIncoming && item.transferStatus === 'pending';

                                    return (
                                        <div
                                            key={item.id}
                                            className={`bg-zinc-950/70 border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-3 sm:space-y-4 transition-all relative overflow-hidden group ${
                                                isIncoming
                                                    ? 'border-emerald-500/20 hover:border-emerald-500/40'
                                                    : 'border-blue-500/20 hover:border-blue-500/40'
                                            }`}
                                        >
                                            {/* Top Banner: Direction Badge & Status */}
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    {isIncoming ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                                            <Inbox size={11} /> INCOMING HANDOFF (TO ME)
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/30">
                                                            <SendHorizontal size={11} /> OUTGOING HANDOFF (BY ME)
                                                        </span>
                                                    )}
                                                    <div className="font-mono text-sm font-bold text-white mt-1.5 truncate">
                                                        {item.ticketNumber || `TICKET #${item.repairRequestId}`}
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-end gap-1 shrink-0">
                                                    {item.transferStatus === 'accepted' && (
                                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold uppercase">
                                                            ACCEPTED
                                                        </span>
                                                    )}
                                                    {item.transferStatus === 'rejected' && (
                                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 font-bold uppercase">
                                                            REJECTED
                                                        </span>
                                                    )}
                                                    {item.transferStatus === 'pending' && (
                                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold uppercase animate-pulse">
                                                            PENDING
                                                        </span>
                                                    )}
                                                    {item.transferStatus === 'cancelled' && (
                                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-bold uppercase">
                                                            CANCELLED
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Device & Customer */}
                                            <div className="bg-zinc-900/40 rounded-xl p-3 space-y-1">
                                                <div className="text-white text-xs font-semibold truncate">{item.customerName}</div>
                                                <div className="text-zinc-400 text-xs truncate">{item.deviceCategory} · {item.brand} {item.modelNumber || ''}</div>
                                            </div>

                                            {/* Transfer Participants */}
                                            <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-black/40 rounded-xl p-2.5 sm:p-3 border border-zinc-900">
                                                <div>
                                                    <div className="text-[9px] text-zinc-500 uppercase">From Tech</div>
                                                    <div className="text-zinc-300 font-medium truncate mt-0.5">
                                                        {item.fromTechnicianName || 'Initial Assignment'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[9px] text-zinc-500 uppercase">To Tech</div>
                                                    <div className="text-emerald-400 font-semibold truncate mt-0.5">
                                                        {item.toTechnicianName}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Reason */}
                                            {item.reason && (
                                                <div className="text-xs text-zinc-300 bg-zinc-900/30 rounded-lg p-2.5 border border-zinc-900 leading-relaxed">
                                                    <span className="text-[9px] font-mono text-zinc-500 uppercase block mb-0.5">Transfer Reason:</span>
                                                    "{item.reason}"
                                                </div>
                                            )}

                                            {/* Response Note */}
                                            {item.responseNotes && (
                                                <div className="text-xs text-rose-300 bg-rose-950/20 rounded-lg p-2.5 border border-rose-900/30 font-mono">
                                                    <span className="text-[9px] font-mono text-rose-400 uppercase block mb-0.5">Response Comment:</span>
                                                    "{item.responseNotes}"
                                                </div>
                                            )}

                                            {/* Timestamp & Actions */}
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 pt-2 border-t border-zinc-900 text-xs font-mono text-zinc-500">
                                                <div className="flex items-center gap-1.5">
                                                    <Clock size={11} />
                                                    <span>{new Date(item.transferredAt).toLocaleString()}</span>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {isPendingMyAction && (
                                                        <>
                                                            <button
                                                                onClick={(e) => handleAccept(e, item.repairRequestId)}
                                                                className="flex-1 sm:flex-none px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-lg transition-colors cursor-pointer text-center"
                                                            >
                                                                Accept
                                                            </button>
                                                            <button
                                                                onClick={(e) => handleReject(e, item.repairRequestId)}
                                                                className="flex-1 sm:flex-none px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-400 font-bold text-xs rounded-lg transition-colors cursor-pointer text-center"
                                                            >
                                                                Reject
                                                            </button>
                                                        </>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            const found = tasks.find(t => t.id === item.repairRequestId);
                                                            if (found) {
                                                                openModal(found);
                                                            } else {
                                                                repairApi.getRequestById(token!, item.repairRequestId).then(res => {
                                                                    if (res.data?.data) openModal(res.data.data);
                                                                });
                                                            }
                                                        }}
                                                        className="flex-1 sm:flex-none px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-300 hover:text-white text-xs transition-colors cursor-pointer text-center"
                                                    >
                                                        Details
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Transfer Pagination */}
                        {!myTransfersLoading && myTransfers.length > 0 && (
                            <div className="p-4 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-zinc-500">
                                <div>
                                    Page <span className="text-white font-bold">{transferPage}</span> of <span className="text-white font-bold">{transferTotalPages}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setTransferPage(p => Math.max(1, p - 1))}
                                        disabled={transferPage <= 1}
                                        className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <button
                                        onClick={() => setTransferPage(p => Math.min(transferTotalPages, p + 1))}
                                        disabled={transferPage >= transferTotalPages}
                                        className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : isDashboardRoute ? (
                    /* ── DASHBOARD VIEW: DEDICATED DIAGNOSIS & ESTIMATE SECTION ── */
                    <div className="space-y-6">
                        {/* Smart Banner: Only displayed if there are incoming transfer requests awaiting response */}
                        {pendingTransferCount > 0 && (
                            <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-3.5">
                                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                                        <Clock size={20} className="animate-pulse" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
                                                Task Transfer Requests Waiting
                                            </h4>
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                {pendingTransferCount} pending
                                            </span>
                                        </div>
                                        <p className="text-xs text-zinc-400 mt-0.5">
                                            Another technician has transferred device tasks to your bench. Review and accept or reject.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => navigate(`${ROUTES.TECHNICIAN_ASSIGNED_TICKETS}?tab=pending_acceptance`)}
                                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold transition-all cursor-pointer shadow-lg shadow-amber-500/10 flex items-center gap-1.5 shrink-0"
                                >
                                    <span>Review Requests ({pendingTransferCount})</span>
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        )}

                        {/* Section Header with Device Queue Counts & Quick Filters */}
                        <div className="bg-gradient-to-b from-[#0e0e0e] to-[#070707] border border-zinc-900 rounded-2xl p-4 sm:p-6 space-y-4">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-900">
                                <div>
                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                        <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                            <Cpu size={16} />
                                        </div>
                                        <span className="text-xs font-mono font-bold uppercase tracking-widest text-blue-400">
                                            Diagnosis & Estimate Queue
                                        </span>
                                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                            {diagnosisTickets.length} {diagnosisTickets.length === 1 ? 'Device' : 'Devices'} Pending Diagnosis
                                        </span>
                                    </div>
                                    <h2 className="text-xl sm:text-2xl font-extrabold text-white font-outfit tracking-tight">
                                        Devices Awaiting Diagnosis & Quotation
                                    </h2>
                                    <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                                        Inspect reported device issues, test hardware faults, and create accurate cost estimates for customer approval.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2.5 self-start lg:self-auto shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => navigate(ROUTES.TECHNICIAN_DIAGNOSIS)}
                                        className="px-3.5 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:text-white text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                                        title="Open full dedicated Diagnosis page"
                                    >
                                        <span>Full Stage View</span>
                                        <ChevronRight size={13} />
                                    </button>
                                </div>
                            </div>

                            {/* Filters & Search Row */}
                            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1">
                                {/* Segmented Filters */}
                                <div className="flex flex-wrap items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-zinc-900">
                                    <button
                                        type="button"
                                        onClick={() => setDiagFilter('all')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
                                            diagFilter === 'all'
                                                ? 'bg-blue-500 text-black font-bold shadow'
                                                : 'text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        <span>All Devices</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${diagFilter === 'all' ? 'bg-black/20 text-black font-bold' : 'bg-zinc-800 text-zinc-400'}`}>
                                            {diagnosisTickets.length}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setDiagFilter('priority')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
                                            diagFilter === 'priority'
                                                ? 'bg-amber-500 text-black font-bold shadow'
                                                : 'text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        <span>Priority / Urgent</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${diagFilter === 'priority' ? 'bg-black/20 text-black font-bold' : 'bg-zinc-800 text-amber-400'}`}>
                                            {diagnosisTickets.filter(t => t.priority?.toLowerCase() === 'priority' || t.priority?.toLowerCase() === 'urgent').length}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setDiagFilter('individual')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
                                            diagFilter === 'individual'
                                                ? 'bg-zinc-700 text-white font-bold shadow'
                                                : 'text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        <span>Individual</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${diagFilter === 'individual' ? 'bg-black/20 text-white font-bold' : 'bg-zinc-800 text-zinc-400'}`}>
                                            {diagnosisTickets.filter(t => !t.companyId && !t.companyName).length}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setDiagFilter('b2b')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
                                            diagFilter === 'b2b'
                                                ? 'bg-purple-600 text-white font-bold shadow'
                                                : 'text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        <span>B2B Company</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${diagFilter === 'b2b' ? 'bg-black/20 text-white font-bold' : 'bg-zinc-800 text-purple-300'}`}>
                                            {diagnosisTickets.filter(t => Boolean(t.companyId || t.companyName)).length}
                                        </span>
                                    </button>
                                </div>

                                {/* Quick Search for Diagnosis devices */}
                                <div className="relative w-full md:w-80">
                                    <Search className="absolute left-3.5 top-2.5 w-3.5 h-3.5 text-blue-400" />
                                    <input
                                        type="text"
                                        placeholder="Search by ticket #, brand, customer, fault..."
                                        value={diagSearch}
                                        onChange={e => setDiagSearch(e.target.value)}
                                        className="w-full bg-black/60 border border-zinc-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all font-mono"
                                    />
                                    {diagSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setDiagSearch('')}
                                            className="absolute right-2.5 top-2 text-zinc-500 hover:text-white p-0.5 rounded transition-colors cursor-pointer"
                                            title="Clear search"
                                        >
                                            <X size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Diagnosis Devices Grid */}
                        {isLoading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="bg-[#0c0c0c] border border-zinc-900 rounded-2xl p-5 min-h-[300px] flex flex-col justify-between animate-pulse">
                                        <div className="h-4 bg-zinc-800 rounded w-1/3 mb-4"></div>
                                        <div className="space-y-3">
                                            <div className="h-14 bg-zinc-900/60 rounded-xl"></div>
                                            <div className="h-20 bg-zinc-900/40 rounded-xl"></div>
                                        </div>
                                        <div className="h-6 bg-zinc-800/60 rounded w-1/2 mt-4"></div>
                                    </div>
                                ))}
                            </div>
                        ) : displayedDiagnosisTickets.length === 0 ? (
                            <div className="bg-[#0c0c0c] border border-dashed border-zinc-900 rounded-2xl p-10 sm:p-14 flex flex-col items-center justify-center text-center min-h-[300px]">
                                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
                                    <Cpu size={28} />
                                </div>
                                <h4 className="text-base font-mono font-bold uppercase tracking-wider text-zinc-200 mb-2">
                                    {diagnosisTickets.length === 0
                                        ? 'No Devices Currently Awaiting Diagnosis'
                                        : 'No Devices Match Selected Filter'}
                                </h4>
                                <p className="text-xs text-zinc-500 max-w-md font-mono mb-5 leading-relaxed">
                                    {diagnosisTickets.length === 0
                                        ? 'All repair tasks assigned to you have been diagnosed or moved to in-progress repairs. When new devices arrive for inspection, they will automatically appear here.'
                                        : 'Try clearing your search query or switching filters to view all devices waiting for diagnosis.'}
                                </p>
                                {diagnosisTickets.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => { setDiagFilter('all'); setDiagSearch(''); }}
                                        className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-mono text-blue-400 hover:text-white transition-colors cursor-pointer"
                                    >
                                        Reset Filters ({diagnosisTickets.length} devices)
                                    </button>
                                ) : (
                                    <div className="flex flex-wrap items-center justify-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => navigate(ROUTES.TECHNICIAN_IN_PROGRESS)}
                                            className="px-4 py-2 bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/30 text-neon-cyan hover:text-white rounded-xl text-xs font-mono font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                                        >
                                            <Hammer size={13} />
                                            <span>Active Repairs ({inProgressCount})</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => navigate(ROUTES.TECHNICIAN_ASSIGNED_TICKETS)}
                                            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                                        >
                                            <ClipboardList size={13} />
                                            <span>All Assigned Tasks ({tasks.length})</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                                {displayedDiagnosisTickets.map(ticket => {
                                    const isB2B = Boolean(ticket.companyId || ticket.companyName);
                                    const identifier = ticket.assetId ? `Asset: ${ticket.assetId}` : ticket.serialNumber ? `S/N: ${ticket.serialNumber}` : 'ID: N/A';
                                    return (
                                        <div
                                            key={ticket.id}
                                            onClick={() => openModal(ticket, 'diagnosis')}
                                            className="bg-[#0c0c0c] border border-blue-500/25 hover:border-blue-500/50 hover:bg-blue-500/[0.02] rounded-xl sm:rounded-2xl p-4 sm:p-5 cursor-pointer transition-all group relative overflow-hidden flex flex-col justify-between shadow-xl shadow-black/50 hover:shadow-blue-500/5"
                                        >
                                            <div>
                                                {/* Stage Header */}
                                                <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-zinc-900">
                                                    <div className="flex items-center gap-2">
                                                        <Cpu size={14} className="text-blue-400" />
                                                        <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-400">Diagnosis & Estimate</span>
                                                    </div>
                                                    <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800">
                                                        {ticket.deviceCategory || 'Device'}
                                                    </span>
                                                </div>

                                                {/* Authoritative Ticket ID & Badges */}
                                                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                                                    <div>
                                                        <span className="text-xs font-mono font-bold text-blue-400 tracking-wider block">
                                                            {ticket.ticketNumber || `TICKET_ID: #${ticket.id}`}
                                                        </span>
                                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                            {isB2B ? (
                                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">B2B</span>
                                                            ) : (
                                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800">INDIVIDUAL</span>
                                                            )}
                                                            {getPriorityBadge(ticket.priority)}
                                                        </div>
                                                    </div>
                                                    <div className="shrink-0">
                                                        {getStatusBadge(ticket.status)}
                                                    </div>
                                                </div>

                                                {/* Customer / Company Info */}
                                                <div className="bg-zinc-950/60 rounded-xl p-3 border border-zinc-900 mb-3 space-y-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="text-xs font-bold text-white font-mono truncate max-w-[150px] sm:max-w-[180px]">
                                                            {isB2B ? (ticket.companyName || ticket.customerName) : ticket.customerName}
                                                        </div>
                                                        {ticket.city && (
                                                            <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1 shrink-0">
                                                                <MapPin size={10} />
                                                                {ticket.city}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {isB2B && ticket.companyContactPerson && (
                                                        <div className="text-[11px] text-zinc-400 font-mono truncate">
                                                            Contact: {ticket.companyContactPerson}
                                                        </div>
                                                    )}
                                                    <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-2">
                                                        <Phone size={10} />
                                                        <span className="truncate">{ticket.mobile || ticket.companyPhone || 'No phone'}</span>
                                                    </div>
                                                </div>

                                                {/* Device & Problem Details */}
                                                <div className="space-y-1.5 text-xs font-mono">
                                                    <div className="flex items-center justify-between gap-2 text-zinc-300">
                                                        <span className="font-semibold text-white truncate">{ticket.brand} {ticket.modelNumber || ''}</span>
                                                        <span className="text-[11px] text-zinc-500 shrink-0">{identifier}</span>
                                                    </div>
                                                    <div className="text-xs text-zinc-300 bg-zinc-900/50 rounded-lg p-2.5 border border-zinc-900/80">
                                                        <span className="text-zinc-500 font-mono text-[10px] uppercase block mb-0.5">Problem Reported:</span>
                                                        <span className="text-zinc-300 line-clamp-2">{ticket.problemType || 'Device inspection requested'}</span>
                                                    </div>
                                                    {(ticket as any).approximateBudget && (
                                                        <div className="text-[11px] font-mono text-amber-400/90 pt-1">
                                                            Approx Budget: ₹{Number((ticket as any).approximateBudget).toLocaleString()}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Footer & Action */}
                                            <div className="pt-3 sm:pt-4 mt-3 sm:mt-4 border-t border-zinc-900 flex flex-wrap items-center justify-between gap-2">
                                                <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                                                    <Clock size={11} />
                                                    {ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                                                </span>
                                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openModal(ticket, 'overview');
                                                        }}
                                                        className="flex-1 sm:flex-none px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-mono transition-colors cursor-pointer text-center border border-zinc-800"
                                                        title="Inspect ticket details"
                                                    >
                                                        Review
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openModal(ticket, 'diagnosis');
                                                        }}
                                                        className="flex-1 sm:flex-none justify-center px-3.5 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-black text-xs font-mono font-bold transition-all cursor-pointer shadow-lg shadow-blue-500/10 flex items-center gap-1.5"
                                                        title="Diagnose & submit quote"
                                                    >
                                                        <span>Diagnose & Quote</span>
                                                        <ChevronRight size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* ══════════════════════════════════════════════════════════════ */}
                        {/* ── WORKBENCH TASKS VIEW (Dedicated My Assigned Tasks & Stages) ── */}
                        {/* ══════════════════════════════════════════════════════════════ */}
                        {/* Filters, Account Selector, View Switcher & Search */}
                        <div className="space-y-4">
                                    {/* Row 1: Account Type Filter & View Mode */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
                                        {/* Individual Customer vs B2B Company Segmented Filter */}
                                        <div className="flex items-center gap-1.5 bg-zinc-900/40 p-1 rounded-xl border border-zinc-900 overflow-x-auto max-w-full scrollbar-none">
                                            <button
                                                onClick={() => setAccountTypeFilter('all')}
                                                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                                                    accountTypeFilter === 'all'
                                                        ? 'bg-zinc-800 text-white font-bold shadow'
                                                        : 'text-zinc-400 hover:text-white'
                                                }`}
                                            >
                                                <Layers size={13} />
                                                <span className="hidden sm:inline">All Accounts</span>
                                                <span className="sm:hidden">All</span>
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 text-zinc-400">
                                                    {tasks.length}
                                                </span>
                                            </button>

                                            <button
                                                onClick={() => setAccountTypeFilter('individual')}
                                                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                                                    accountTypeFilter === 'individual'
                                                        ? 'bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30'
                                                        : 'text-zinc-400 hover:text-white'
                                                }`}
                                            >
                                                <User size={13} />
                                                <span className="hidden sm:inline">Individual Customers</span>
                                                <span className="sm:hidden">Individual</span>
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 font-bold">
                                                    {individualCount}
                                                </span>
                                            </button>

                                            <button
                                                onClick={() => setAccountTypeFilter('b2b')}
                                                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                                                    accountTypeFilter === 'b2b'
                                                        ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30'
                                                        : 'text-zinc-400 hover:text-white'
                                                }`}
                                            >
                                                <Building2 size={13} />
                                                <span className="hidden sm:inline">B2B Companies</span>
                                                <span className="sm:hidden">B2B</span>
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-400 font-bold">
                                                    {b2bCount}
                                                </span>
                                            </button>
                                        </div>

                                        {/* View Mode Toggle: Cards vs Table */}
                                        <div className="flex items-center gap-1 bg-zinc-900/40 p-1 rounded-xl border border-zinc-900">
                                            <button
                                                onClick={() => setViewMode('cards')}
                                                title="Card Grid View"
                                                className={`p-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                                                    viewMode === 'cards'
                                                        ? 'bg-emerald-400 text-black font-bold'
                                                        : 'text-zinc-400 hover:text-white'
                                                }`}
                                            >
                                                <LayoutGrid size={14} />
                                                <span className="hidden sm:inline">Cards</span>
                                            </button>
                                            <button
                                                onClick={() => setViewMode('table')}
                                                title="Detailed Table View"
                                                className={`p-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                                                    viewMode === 'table'
                                                        ? 'bg-emerald-400 text-black font-bold'
                                                        : 'text-zinc-400 hover:text-white'
                                                }`}
                                            >
                                                <List size={14} />
                                                <span className="hidden sm:inline">Table</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Row 2: Status Tabs & Search */}
                                    <div className="flex flex-col md:flex-row gap-3 sm:gap-4 items-stretch md:items-center justify-between">
                                        {isAssignedTicketsRoute ? (
                                            <div className="flex flex-wrap gap-1.5 bg-zinc-900/40 p-1 rounded-xl border border-zinc-900 self-start md:self-auto w-full md:w-auto">
                                                {[
                                                    { id: 'all', label: 'All Tasks', count: tasks.length },
                                                    { id: 'pending_acceptance', label: 'Pending Acceptance', shortLabel: 'Pending Accept', count: pendingTransferCount },
                                                    { id: 'pending', label: 'Pending / Diagnosis', shortLabel: 'Diagnosis', count: pendingCount },
                                                    { id: 'in_progress', label: 'In Progress', shortLabel: 'In Progress', count: inProgressCount },
                                                    { id: 'completed', label: 'Completed', shortLabel: 'Completed', count: completedCount },
                                                    { id: 'delivered', label: 'Delivered', shortLabel: 'Delivered', count: deliveredCount }
                                                ].map(tab => (
                                                    <button
                                                        key={tab.id}
                                                        onClick={() => setActiveFilter(tab.id)}
                                                        className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 sm:gap-2 ${
                                                            activeFilter === tab.id ? 'bg-emerald-400 text-black font-bold' : 'text-zinc-400 hover:text-white'
                                                        }`}
                                                    >
                                                        <span className="hidden sm:inline">{tab.label}</span>
                                                        <span className="sm:hidden">{tab.shortLabel || tab.label}</span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                                            activeFilter === tab.id ? 'bg-black/20 text-black font-bold' : 'bg-zinc-800 text-zinc-500'
                                                        }`}>
                                                            {tab.count}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-xs font-mono bg-zinc-900/40 px-3.5 py-2 rounded-xl border border-zinc-900 text-zinc-400">
                                                <span className="text-zinc-500 uppercase tracking-wider text-[11px]">Filtered Queue:</span>
                                                <span className="text-emerald-400 font-bold">{headerInfo.title}</span>
                                                <span className="text-zinc-700">•</span>
                                                <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded text-[10px] font-bold">
                                                    {filteredTasks.length} {filteredTasks.length === 1 ? 'ticket' : 'tickets'}
                                                </span>
                                            </div>
                                        )}
                                        <div className="relative w-full md:w-96">
                                            <Search className="absolute left-3.5 top-3 w-4 h-4 text-emerald-400" />
                                            <input
                                                type="text"
                                                placeholder="Search Ticket ID, Serial, Asset, Model, Brand, Customer, Phone..."
                                                value={searchQuery}
                                                onChange={e => setSearchQuery(e.target.value)}
                                                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl pl-10 pr-9 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all font-mono shadow-inner"
                                            />
                                            {searchQuery && (
                                                <button
                                                    type="button"
                                                    onClick={() => setSearchQuery('')}
                                                    className="absolute right-3 top-2.5 text-zinc-500 hover:text-white p-0.5 rounded transition-colors cursor-pointer"
                                                    title="Clear search"
                                                >
                                                    <X size={15} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Loading / Error / Empty / Views */}
                                {isLoading ? (
                                    <div className="min-h-[40vh] flex flex-col items-center justify-center text-center">
                                        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
                                        <p className="text-zinc-500 text-xs font-mono uppercase tracking-wider">Syncing workbench telemetry...</p>
                                    </div>
                                ) : errorMsg ? (
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center text-red-400 font-mono text-sm max-w-xl mx-auto">{errorMsg}</div>
                                ) : filteredTasks.length === 0 ? (
                                    <div className="border border-zinc-900 bg-zinc-950/20 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
                                        {searchQuery.trim() ? (
                                            <>
                                                <div className="w-12 h-12 rounded-full bg-zinc-900/80 border border-zinc-800 flex items-center justify-center text-zinc-400 mb-3.5">
                                                    <Search className="w-5 h-5 text-zinc-400" />
                                                </div>
                                                <h3 className="text-white font-bold text-sm mb-1 font-outfit">No matching tickets found</h3>
                                                <p className="text-zinc-400 text-xs max-w-md mx-auto mb-4 font-mono leading-relaxed">
                                                    No tickets match "<span className="text-emerald-400 font-bold">{searchQuery}</span>". Search supports Ticket ID, Serial Number, Asset ID, Model Name, Brand, Customer/Company Name, and Phone Number.
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => setSearchQuery('')}
                                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white transition-colors cursor-pointer border border-zinc-700/60"
                                                >
                                                    <RotateCcw size={13} />
                                                    Reset Search
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <Wrench className="w-10 h-10 text-zinc-700 mx-auto mb-4" />
                                                <p className="text-zinc-500 text-sm">
                                                    {tasks.length === 0 ? 'No tasks have been assigned to you yet.' : 'No tasks match the current filter selection.'}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                ) : viewMode === 'cards' ? (
                                    /* ── CARD GRID VIEW (Showing all 9 attributes) ── */
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                        {filteredTasks.map(task => {
                                            const isB2B = Boolean(task.companyId || task.companyName);
                                            const identifier = task.assetId ? `Asset: ${task.assetId}` : task.serialNumber ? `S/N: ${task.serialNumber}` : 'ID: N/A';
                                            return (
                                                <div
                                                    key={task.id}
                                                    onClick={() => openModal(task, isDiagnosisRoute ? 'diagnosis' : isInProgressRoute ? 'work-log' : 'overview')}
                                                    className={`bg-zinc-900/20 border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 cursor-pointer transition-all hover:bg-zinc-900/40 group ${getStatusCardStyle(task.status)} relative overflow-hidden flex flex-col justify-between`}
                                                >
                                                    {task.pendingTechnicianId === user?.id && (
                                                        <div className="absolute inset-0 bg-zinc-950/85 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity p-4 text-center">
                                                            <div className="text-white font-bold tracking-widest text-xs font-mono uppercase bg-emerald-500/20 px-3 py-1 rounded-lg border border-emerald-500/30 text-emerald-300">
                                                                Transfer Requires Confirmation
                                                            </div>
                                                            <div className="flex items-center gap-3 mt-2">
                                                                <button onClick={(e) => handleAccept(e, task.id)} className="px-5 py-2 bg-emerald-500 text-black font-bold rounded-lg text-xs hover:bg-emerald-400 transition-colors cursor-pointer">Accept</button>
                                                                <button onClick={(e) => handleReject(e, task.id)} className="px-5 py-2 bg-red-500/20 border border-red-500/30 text-red-400 font-bold rounded-lg text-xs hover:bg-red-500/40 transition-colors cursor-pointer">Reject</button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div>
                                                        {/* Header: Authoritative Ticket ID & Status */}
                                                        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                                                            <div>
                                                                <div className="font-mono text-xs font-bold text-emerald-400 mb-1 tracking-wider truncate max-w-[200px] sm:max-w-[220px]">
                                                                    {task.ticketNumber || `TICKET #${task.id}`}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    {isB2B ? (
                                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                                                            <Building2 size={11} /> B2B Company
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                                            <User size={11} /> Individual
                                                                        </span>
                                                                    )}
                                                                    {getPriorityBadge(task.priority)}
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                                {task.pendingTechnicianId === user?.id ? (
                                                                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">Pending Transfer</span>
                                                                ) : (
                                                                    getStatusBadge(task.status)
                                                                )}
                                                                {task.customerApprovalStatus && task.customerApprovalStatus !== 'none' && (
                                                                    getApprovalStatusBadge(task.customerApprovalStatus)
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Customer / Company */}
                                                        <div className="mb-3 bg-zinc-950/60 rounded-xl p-3 border border-zinc-900/60">
                                                            <div className="text-[10px] font-mono uppercase text-zinc-500 mb-1 flex items-center justify-between">
                                                                <span>Customer / Company</span>
                                                                {isB2B && task.companyName && (
                                                                    <span className="text-purple-400 font-semibold truncate max-w-[150px]">{task.companyName}</span>
                                                                )}
                                                            </div>
                                                            <div className="text-white font-semibold text-sm truncate">{task.customerName}</div>
                                                            {isB2B && task.employeeName && (
                                                                <div className="text-zinc-400 text-[11px] truncate">Employee: {task.employeeName}</div>
                                                            )}
                                                            <div className="flex items-center gap-3 mt-1.5 text-zinc-500 text-[11px]">
                                                                <span className="flex items-center gap-1"><MapPin size={10} /> {task.city}</span>
                                                                <span className="flex items-center gap-1"><Phone size={10} /> {task.mobile}</span>
                                                            </div>
                                                        </div>

                                                        {/* Device, Serial/Asset & Problem */}
                                                        <div className="mb-3 bg-zinc-950/40 rounded-xl p-3 space-y-1.5 border border-zinc-900/40">
                                                            <div className="flex items-center justify-between text-xs">
                                                                <span className="text-zinc-300 font-semibold truncate">{task.brand}{task.modelNumber ? ` · ${task.modelNumber}` : ''}</span>
                                                                <span className="text-zinc-500 text-[10px] font-mono uppercase">{task.deviceCategory}</span>
                                                            </div>
                                                            <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between pt-1 border-t border-zinc-900">
                                                                <span className="text-zinc-500">Serial / Asset:</span>
                                                                <span className="text-zinc-300 font-semibold truncate max-w-[180px]">{identifier}</span>
                                                            </div>
                                                            <div className="text-[11px] text-zinc-400 flex items-start gap-1 pt-1">
                                                                <span className="text-zinc-500 shrink-0 font-mono">Problem:</span>
                                                                <span className="text-zinc-300 font-medium truncate">{task.problemType}{task.customProblemType ? ` (${task.customProblemType})` : ''}</span>
                                                            </div>
                                                            {((task.estimatedCost && task.estimatedCost > 0) || (task.customerApprovalStatus && task.customerApprovalStatus !== 'none')) && (
                                                                <div className="flex items-center justify-between text-[11px] font-mono pt-1.5 border-t border-zinc-900">
                                                                    <span className="text-zinc-500">Approx Quote:</span>
                                                                    <span className="text-emerald-400 font-bold">₹{((task.estimatedCost || 0) + (task.additionalCharges || 0)).toFixed(2)}</span>
                                                                </div>
                                                            )}
                                                            {(task.paymentStatus === 'paid' || (task as any).payment_status === 'paid') && (
                                                                <div className="flex items-center justify-between text-[11px] font-mono pt-1.5 border-t border-zinc-900">
                                                                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                                                        <CheckCircle2 size={11} /> Paid
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedReceiptTicketId(task.id);
                                                                            setReceiptModalOpen(true);
                                                                        }}
                                                                        className="px-2 py-0.5 rounded bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/30 text-neon-cyan text-[10px] flex items-center gap-1 transition-all cursor-pointer font-mono"
                                                                        title="View Bill / Tax Invoice"
                                                                    >
                                                                        <Receipt size={10} /> Bill
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Timestamps & Action Footer */}
                                                    <div className="pt-2 border-t border-zinc-900/80 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-zinc-500">
                                                        <div className="space-y-0.5">
                                                            <div className="flex items-center gap-1">
                                                                <Clock size={10} className="text-zinc-600" />
                                                                <span>Assigned: {task.assignedAt || task.createdAt ? new Date(task.assignedAt || task.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <RotateCcw size={10} className="text-zinc-600" />
                                                                <span>Updated: {task.updatedAt ? new Date(task.updatedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1 text-zinc-400 group-hover:text-emerald-400 transition-colors font-sans text-xs font-semibold">
                                                            {isDiagnosisRoute ? 'Diagnose & Quote' : isInProgressRoute ? 'Update Work Log' : 'Inspect'} <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    /* ── TABLE VIEW (Showing all 9 attributes) ── */
                                    <div className="bg-[#0c0c0c] border border-zinc-900 rounded-xl sm:rounded-2xl overflow-hidden shadow-xl">
                                        <div className="overflow-x-auto w-full">
                                            <table className="w-full min-w-[760px] text-left text-xs font-sans">
                                                <thead className="bg-zinc-950/80 border-b border-zinc-900 text-zinc-400 font-mono uppercase text-[10px] tracking-wider">
                                                    <tr>
                                                        <th className="py-3.5 px-4 font-semibold">Authoritative ID</th>
                                                        <th className="py-3.5 px-4 font-semibold">Customer / Company</th>
                                                        <th className="py-3.5 px-4 font-semibold">Device</th>
                                                        <th className="py-3.5 px-4 font-semibold">Serial / Asset</th>
                                                        <th className="py-3.5 px-4 font-semibold">Problem</th>
                                                        <th className="py-3.5 px-4 font-semibold">Priority</th>
                                                        <th className="py-3.5 px-4 font-semibold">Assigned Date/Time</th>
                                                        <th className="py-3.5 px-4 font-semibold">Last Updated</th>
                                                        <th className="py-3.5 px-4 font-semibold">Status</th>
                                                        <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-900/70 text-zinc-300">
                                                    {filteredTasks.map(task => {
                                                        const isB2B = Boolean(task.companyId || task.companyName);
                                                        const identifier = task.assetId ? `Asset: ${task.assetId}` : task.serialNumber ? `S/N: ${task.serialNumber}` : 'N/A';
                                                        return (
                                                            <tr
                                                                key={task.id}
                                                                onClick={() => openModal(task, isDiagnosisRoute ? 'diagnosis' : isInProgressRoute ? 'work-log' : 'overview')}
                                                                className="hover:bg-zinc-900/40 transition-colors cursor-pointer group"
                                                            >
                                                                {/* 1. Authoritative Ticket ID */}
                                                                <td className="py-3 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                                                                    {task.ticketNumber || `TICKET #${task.id}`}
                                                                </td>

                                                                {/* 2. Customer / Company */}
                                                                <td className="py-3 px-4">
                                                                    <div className="font-semibold text-white truncate max-w-[170px]">{task.customerName}</div>
                                                                    {isB2B ? (
                                                                        <div className="inline-flex items-center gap-1 text-[10px] font-mono text-purple-400">
                                                                            <Building2 size={10} />
                                                                            <span className="truncate max-w-[130px]">{task.companyName || 'Corporate'}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-[10px] font-mono text-blue-400">Individual</span>
                                                                    )}
                                                                </td>

                                                                {/* 3. Device */}
                                                                <td className="py-3 px-4">
                                                                    <div className="text-zinc-200 font-medium truncate max-w-[150px]">{task.brand} {task.modelNumber || ''}</div>
                                                                    <div className="text-[10px] font-mono text-zinc-500 uppercase">{task.deviceCategory}</div>
                                                                </td>

                                                                {/* 4. Serial / Asset Number */}
                                                                <td className="py-3 px-4 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                                                                    {identifier}
                                                                </td>

                                                                {/* 5. Problem */}
                                                                <td className="py-3 px-4">
                                                                    <div className="truncate max-w-[140px] text-zinc-300">{task.problemType}</div>
                                                                </td>

                                                                {/* 6. Priority */}
                                                                <td className="py-3 px-4 whitespace-nowrap">
                                                                    {getPriorityBadge(task.priority)}
                                                                </td>

                                                                {/* 7. Assigned Date/Time */}
                                                                <td className="py-3 px-4 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                                                                    {task.assignedAt || task.createdAt ? new Date(task.assignedAt || task.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                                                                </td>

                                                                {/* 8. Last Updated */}
                                                                <td className="py-3 px-4 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                                                                    {task.updatedAt ? new Date(task.updatedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                                                                </td>

                                                                {/* 9. Status */}
                                                                <td className="py-3 px-4 whitespace-nowrap">
                                                                    <div className="flex flex-col gap-1 items-start">
                                                                        {task.pendingTechnicianId === user?.id ? (
                                                                            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">Pending Transfer</span>
                                                                        ) : (
                                                                            getStatusBadge(task.status)
                                                                        )}
                                                                        {task.customerApprovalStatus && task.customerApprovalStatus !== 'none' && (
                                                                            getApprovalStatusBadge(task.customerApprovalStatus)
                                                                        )}
                                                                    </div>
                                                                </td>

                                                                {/* Action button */}
                                                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); openModal(task, isDiagnosisRoute ? 'diagnosis' : isInProgressRoute ? 'work-log' : 'overview'); }}
                                                                        className={`px-3 py-1 font-semibold text-xs rounded-lg transition-colors cursor-pointer ${
                                                                            isDiagnosisRoute
                                                                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-400 hover:text-black'
                                                                                : isInProgressRoute
                                                                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-400 hover:text-black'
                                                                                : 'bg-zinc-800 text-zinc-300 hover:bg-emerald-400 hover:text-black'
                                                                        }`}
                                                                    >
                                                                        {isDiagnosisRoute ? 'Diagnose & Quote' : isInProgressRoute ? 'Work Log' : 'Inspect'}
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                    </div>
                )}
                {/* Detail Right-Side Drawer / Workspace */}
                <AnimatePresence>
                    {selectedTask && (
                        <div className="fixed inset-0 z-50 overflow-hidden">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setSelectedTask(null)}
                                className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
                            />
                            <div className="fixed inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10 pointer-events-none">
                                <motion.div
                                    initial={{ x: '100%' }}
                                    animate={{ x: 0 }}
                                    exit={{ x: '100%' }}
                                    transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                                    className="w-full sm:w-screen sm:max-w-4xl bg-[#0c0c0c] border-l border-zinc-800 shadow-2xl relative flex flex-col h-full overflow-hidden pointer-events-auto"
                                >
                                    <div className="flex-1 overflow-y-auto p-2.5 sm:p-6 custom-scrollbar">
                                        <TechnicianTaskWorkspace
                                            task={selectedTask}
                                            initialTab={activeTab}
                                            user={user}
                                            token={token}
                                            onBack={() => setSelectedTask(null)}
                                            onTaskUpdated={(updatedFields) => {
                                                setSelectedTask(prev => prev ? { ...prev, ...updatedFields } : null);
                                                setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, ...updatedFields } : t));
                                            }}
                                            onInitiateTransfer={() => setTransferModalOpen(true)}
                                            onImagePreview={(src, alt) => handleImagePreview(src, alt)}
                                            onAcceptAssignment={handleAccept}
                                            onRejectAssignment={handleReject}
                                        />
                                    </div>
                                </motion.div>
                            </div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Transfer Modal */}
                <AnimatePresence>
                    {transferModalOpen && (
                        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-[9999] animate-fadeIn bg-blur-sm">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="bg-[#0c0c0c] border border-zinc-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl relative text-left p-6 space-y-5"
                            >
                                <div>
                                    <h3 className="text-sm font-bold text-white uppercase tracking-widest font-mono">Transfer Task</h3>
                                    <p className="text-xs text-zinc-500 mt-1">Reassign this task to another technician.</p>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase">Select Technician</label>
                                        {technicians.filter(t => t.id !== user?.id).length > 0 ? (
                                            <select
                                                value={transferTargetId}
                                                onChange={e => setTransferTargetId(e.target.value)}
                                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all"
                                            >
                                                <option value="">-- Select --</option>
                                                {technicians.filter(t => t.id !== user?.id).map(t => (
                                                    <option key={t.id} value={t.id.toString()}>{t.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <div className="w-full bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-3 text-xs text-zinc-500 text-center font-mono">
                                                No other technicians available for transfer.
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase">Reason (Optional)</label>
                                        <textarea
                                            value={transferReason}
                                            onChange={e => setTransferReason(e.target.value)}
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all resize-none h-20"
                                            placeholder="Note for the receiving tech..."
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-900">
                                    <button
                                        onClick={() => { setTransferModalOpen(false); setTransferTargetId(''); setTransferReason(''); }}
                                        className="px-4 py-2 text-xs font-mono uppercase bg-transparent text-zinc-500 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleTransfer}
                                        disabled={!transferTargetId || transferring}
                                        className="px-4 py-2 text-xs font-mono uppercase font-bold bg-amber-500 text-black rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                    >
                                        {transferring ? <Loader2 size={12} className="animate-spin" /> : null}
                                        Initiate Transfer
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* View, Print, and Download Payment Receipt / Tax Invoice Modal */}
                <PaymentReceiptModal
                    isOpen={receiptModalOpen}
                    onClose={() => {
                        setReceiptModalOpen(false);
                        setSelectedReceiptTicketId(null);
                    }}
                    ticketId={selectedReceiptTicketId}
                />

                {/* Universal Ticket Search Modal (Ctrl+K) */}
                <AnimatePresence>
                    {searchModalOpen && (
                        <div className="fixed inset-0 bg-black/85 flex items-start justify-center p-3 sm:p-6 z-[9999] animate-fadeIn backdrop-blur-md overflow-y-auto">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -20 }}
                                className="bg-[#0c0c0c] border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative text-left my-8"
                            >
                                {/* Search Input Bar */}
                                <div className="p-4 border-b border-zinc-900 bg-black/60 flex items-center gap-3">
                                    <Search size={18} className="text-emerald-400 shrink-0" />
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        placeholder="Search Ticket ID, Serial, Asset, Model, Brand, Customer, Phone..."
                                        value={modalSearchQuery}
                                        onChange={e => setModalSearchQuery(e.target.value)}
                                        className="w-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none font-mono"
                                    />
                                    {modalSearchLoading && (
                                        <Loader2 size={16} className="text-emerald-400 animate-spin shrink-0" />
                                    )}
                                    {modalSearchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setModalSearchQuery('')}
                                            className="text-zinc-500 hover:text-white p-1 rounded transition-colors shrink-0 cursor-pointer"
                                            title="Clear search"
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>

                                {/* Search Results / Recents List */}
                                <div className="max-h-[60vh] overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
                                    {modalSearchLoading && modalDisplayList.length === 0 ? (
                                        <div className="py-12 flex flex-col items-center justify-center text-center text-zinc-500 font-mono text-xs gap-2">
                                            <Loader2 size={20} className="animate-spin text-emerald-400" />
                                            <span>Searching authorized tickets...</span>
                                        </div>
                                    ) : modalSearchQuery.trim() && modalDisplayList.length === 0 ? (
                                        <div className="py-12 text-center text-zinc-500 font-mono text-xs space-y-2">
                                            <p>No authorized tickets match "{modalSearchQuery}".</p>
                                            <p className="text-[11px] text-zinc-600">
                                                Search by Ticket ID, Serial #, Asset ID, Customer name, Phone, Brand, or Model.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => setModalSearchQuery('')}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white transition-colors cursor-pointer border border-zinc-700 font-mono"
                                            >
                                                <RotateCcw size={12} />
                                                Reset Search
                                            </button>
                                        </div>
                                    ) : modalDisplayList.length === 0 ? (
                                        <div className="py-12 text-center text-zinc-500 font-mono text-xs">
                                            No tickets have been assigned to your workbench yet.
                                        </div>
                                    ) : (
                                        <>
                                            {!modalSearchQuery.trim() && (
                                                <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider px-1 pb-1">
                                                    Active Assigned Workload ({modalDisplayList.length})
                                                </div>
                                            )}
                                            {modalDisplayList.map((task) => {
                                                const isB2B = Boolean(task.companyId || task.companyName);
                                                const identifier = task.assetId ? `Asset: ${task.assetId}` : task.serialNumber ? `S/N: ${task.serialNumber}` : 'ID: N/A';
                                                return (
                                                    <div
                                                        key={task.id}
                                                        onClick={() => {
                                                            setSearchModalOpen(false);
                                                            openModal(task);
                                                        }}
                                                        className="p-3.5 rounded-xl border border-zinc-900 bg-zinc-900/30 hover:bg-zinc-900/80 hover:border-emerald-500/40 transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                                    >
                                                        <div className="space-y-1 min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-mono text-xs font-bold text-emerald-400 tracking-wider">
                                                                    {task.ticketNumber || `TICKET #${task.id}`}
                                                                </span>
                                                                {isB2B ? (
                                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                                                        <Building2 size={10} /> {task.companyName || 'B2B'}
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                                        <User size={10} /> Individual
                                                                    </span>
                                                                )}
                                                                {getPriorityBadge(task.priority)}
                                                            </div>
                                                            <div className="text-sm font-semibold text-white truncate">
                                                                {task.customerName} {task.mobile ? <span className="text-xs font-mono text-zinc-500">· {task.mobile}</span> : null}
                                                            </div>
                                                            <div className="text-xs text-zinc-400 truncate">
                                                                {task.brand} {task.modelNumber || ''} · <span className="font-mono text-zinc-500">{identifier}</span>
                                                            </div>
                                                            {task.problemType && (
                                                                <div className="text-[11px] text-zinc-400 font-mono truncate">
                                                                    Problem: <span className="text-zinc-300">{task.problemType}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-900/60">
                                                            {task.pendingTechnicianId === user?.id ? (
                                                                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">Pending Transfer</span>
                                                            ) : (
                                                                getStatusBadge(task.status)
                                                            )}
                                                            <span className="text-xs font-mono text-emerald-400 group-hover:underline flex items-center gap-1 font-semibold">
                                                                Open Workspace <ChevronRight size={12} />
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}
                                </div>

                                {/* Bottom Footer */}
                                <div className="p-3 border-t border-zinc-900 bg-black/40 flex items-center justify-between text-[11px] font-mono text-zinc-500">
                                    <div className="flex items-center gap-2">
                                        <span>
                                            {modalSearchQuery.trim() ? `${modalDisplayList.length} matching` : `${tasks.length} total`} authorized {modalDisplayList.length === 1 ? 'ticket' : 'tickets'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="hidden sm:inline">Ticket ID, Serial, Asset, Model, Brand, Customer & Phone</span>
                                        <kbd className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-[10px] text-zinc-400">
                                            ESC to close
                                        </kbd>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
