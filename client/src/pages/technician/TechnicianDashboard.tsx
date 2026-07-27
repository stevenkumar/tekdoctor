import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    RefreshCw, Search, MapPin, Phone, Mail, Clock,
    CheckCircle2, Hourglass, Hammer, XCircle, FileImage,
    ChevronRight, ExternalLink, Calendar, Loader2,
    Wrench, LogOut, User, Wifi, Bell, ClipboardList,
    FileText, Plus, Send, AlertTriangle, CheckCheck,
    Truck, Cpu, PackageSearch, Star, Upload, ChevronDown,
    Trash2, ArrowUpRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { repairApi, notificationApi, technicianApi } from '@/services/api';
import type { ServiceRequest, WorkLog, NotificationItem, TechnicianUser } from '@/services/api';
import { appConfig } from '@/config/appConfig';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import { motion, AnimatePresence } from 'framer-motion';

type ModalTab = 'overview' | 'work-log' | 'milestones' | 'customer-note';

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

    const [tasks, setTasks] = useState<ServiceRequest[]>([]);
    const [filteredTasks, setFilteredTasks] = useState<ServiceRequest[]>([]);
    const [activeFilter, setActiveFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [selectedTask, setSelectedTask] = useState<ServiceRequest | null>(null);
    const [statusUpdateLoadingId, setStatusUpdateLoadingId] = useState<number | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
    const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const notifRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    // Transfer State
    const [technicians, setTechnicians] = useState<TechnicianUser[]>([]);
    const [transferModalOpen, setTransferModalOpen] = useState(false);
    const [transferTargetId, setTransferTargetId] = useState('');
    const [transferReason, setTransferReason] = useState('');
    const [transferring, setTransferring] = useState(false);

    const fetchTechnicians = useCallback(async () => {
        if (!token) return;
        try {
            const res = await technicianApi.getAll(token);
            if (res.ok && res.data) {
                setTechnicians(res.data.data.filter(t => t.id !== user?.id)); // exclude self
            }
        } catch (e) { }
    }, [token, user]);

    const fetchTasks = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        setErrorMsg('');
        try {
            const response = await repairApi.getMyTasks(token);
            if (response.ok && response.data) {
                setTasks(response.data.data || []);
                setLastRefreshed(new Date());
            } else {
                setErrorMsg(response.error || 'Failed to fetch assigned tasks.');
            }
        } catch (err) {
            setErrorMsg('Network error while retrieving tasks.');
        } finally {
            setIsLoading(false);
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

    useEffect(() => {
        if (!isAuthenticated || !token) return;

        fetchTasks();
        fetchNotifs();
        fetchTechnicians();

        const taskInterval = setInterval(fetchTasks, 30000);
        const notifInterval = setInterval(fetchNotifs, 30000);
        autoRefreshRef.current = taskInterval;
        notifRefreshRef.current = notifInterval;

        return () => {
            clearInterval(taskInterval);
            clearInterval(notifInterval);
            autoRefreshRef.current = null;
            notifRefreshRef.current = null;
        };
    }, [isAuthenticated, token, fetchTasks, fetchNotifs, fetchTechnicians]);

    useEffect(() => {
        let result = [...tasks];
        if (activeFilter !== 'all') {
            if (activeFilter === 'pending_acceptance') {
                result = result.filter(t => t.pendingTechnicianId === user?.id);
            } else {
                result = result.filter(t => t.status.toLowerCase() === activeFilter.toLowerCase() && t.pendingTechnicianId !== user?.id);
            }
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter(t =>
                (t.ticketNumber && t.ticketNumber.toLowerCase().includes(q)) ||
                t.customerName.toLowerCase().includes(q) ||
                t.mobile.includes(q) ||
                (t.email && t.email.toLowerCase().includes(q)) ||
                t.city.toLowerCase().includes(q) ||
                t.deviceCategory.toLowerCase().includes(q) ||
                t.brand.toLowerCase().includes(q)
            );
        }
        setFilteredTasks(result);
    }, [tasks, activeFilter, searchQuery]);

    const openModal = (task: ServiceRequest) => {
        setSelectedTask(task);
        setActiveTab('overview');
        setCustomerDesc(task.customerRepairDescription || '');
        setWorkLogs([]);
        setNewLog({ repairStage: '', actionPerformed: '', partsReplaced: '', timeSpent: '', notes: '' });
        setLogMediaFile(null);
        setSelectedMilestone('');
        setMilestoneNotes('');
    };

    useEffect(() => {
        if (selectedTask && activeTab === 'work-log') {
            fetchWorkLogs(selectedTask.id);
        }
    }, [activeTab, selectedTask, fetchWorkLogs]);

    const handleStatusChange = async (taskId: number, newStatus: 'pending' | 'in_progress' | 'completed') => {
        if (!token) return;
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

    const handleAccept = async (e: React.MouseEvent, taskId: number) => {
        e.stopPropagation();
        if (!token) return;
        try {
            const res = await repairApi.acceptAssignment(token, taskId);
            if (res.ok) {
                toast.success('Ticket Accepted');
                fetchTasks();
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
                fetchTasks(); // it will disappear from their pending queue
            } else {
                toast.error(res.error || 'Failed to reject ticket');
            }
        } catch (e) {
            toast.error('Network Error');
        }
    };

    const handleTransfer = async () => {
        if (!token || !selectedTask || !transferTargetId) return;
        setTransferring(true);
        try {
            const res = await repairApi.transferTicket(token, selectedTask.id, { targetTechnicianId: parseInt(transferTargetId), reason: transferReason });
            if (res.ok) {
                toast.success('Transfer Initiated!');
                setTransferModalOpen(false);
                setSelectedTask(null);
                fetchTasks();
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
        { id: 'work-log', label: 'Work Log', icon: <ClipboardList size={13} /> },
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

    return (
        <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans py-12 px-6">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-zinc-900 pb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-400">Technician Workbench</span>
                            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                        </div>
                        <h1 className="text-3xl font-extrabold text-white font-outfit tracking-tight">My Assigned Tasks</h1>
                        <div className="flex items-center gap-3 mt-1">
                            <div className="flex items-center gap-1.5 text-xs text-zinc-500"><User size={12} /><span>{user?.name}</span></div>
                            <span className="text-zinc-700">•</span>
                            <div className="flex items-center gap-1.5 text-xs text-zinc-600"><Wifi size={11} /><span>Auto-refresh every 30s</span></div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-[10px] font-mono text-zinc-600 hidden md:block">LAST_SYNC: {lastRefreshed.toLocaleTimeString()}</div>

                        {/* Notification Bell Dropdown */}
                        <div className="relative" ref={notifRef}>
                            <button
                                onClick={() => setShowNotifications(!showNotifications)}
                                className="relative p-2.5 bg-zinc-900/60 border border-zinc-800 rounded-lg text-zinc-400 hover:text-emerald-400 hover:border-emerald-400/30 hover:bg-emerald-400/5 transition-all duration-300 cursor-pointer flex items-center justify-center animate-fadeIn"
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
                                        className="absolute right-0 mt-3 w-80 bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl z-50 text-left"
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

                        <button onClick={fetchTasks} className="p-2.5 bg-zinc-900/60 border border-zinc-800 rounded-lg hover:border-emerald-500/50 text-zinc-400 hover:text-white transition-all cursor-pointer flex items-center gap-2 text-xs font-semibold font-mono">
                            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> SYNC
                        </button>
                        <button onClick={logout} className="p-2.5 bg-zinc-900/60 border border-zinc-800 rounded-lg hover:border-red-500/50 text-zinc-400 hover:text-red-400 transition-all cursor-pointer flex items-center gap-2 text-xs font-semibold font-mono">
                            <LogOut size={14} /> LOGOUT
                        </button>
                    </div>
                </div>

                {/* Filters & Search */}
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex flex-wrap gap-1.5 bg-zinc-900/40 p-1 rounded-xl border border-zinc-900 self-start md:self-auto w-full md:w-auto">
                        {[{ id: 'all', label: 'All Tasks' }, { id: 'pending_acceptance', label: 'Pending Acceptance' }, { id: 'pending', label: 'Pending' }, { id: 'in_progress', label: 'In Progress' }, { id: 'completed', label: 'Completed' }, { id: 'delivered', label: 'Delivered' }].map(tab => (
                            <button key={tab.id} onClick={() => setActiveFilter(tab.id)} className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-2 ${activeFilter === tab.id ? 'bg-emerald-400 text-black' : 'text-zinc-400 hover:text-white'}`}>
                                {tab.label}
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${activeFilter === tab.id ? 'bg-black/20 text-black font-bold' : 'bg-zinc-800 text-zinc-500'}`}>
                                    {tab.id === 'all' ? tasks.length : tab.id === 'pending_acceptance' ? tasks.filter(t => t.pendingTechnicianId === user?.id).length : tasks.filter(t => t.status.toLowerCase() === tab.id && t.pendingTechnicianId !== user?.id).length}
                                </span>
                            </button>
                        ))}
                    </div>
                    <div className="relative w-full md:w-72">
                        <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
                        <input type="text" placeholder="Search customer, device, city..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-zinc-900/40 border border-zinc-800/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all" />
                    </div>
                </div>

                {/* Loading / Error / Empty / Cards */}
                {isLoading ? (
                    <div className="min-h-[40vh] flex flex-col items-center justify-center text-center">
                        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
                        <p className="text-zinc-500 text-xs font-mono uppercase tracking-wider">Syncing workbench telemetry...</p>
                    </div>
                ) : errorMsg ? (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center text-red-400 font-mono text-sm max-w-xl mx-auto">{errorMsg}</div>
                ) : filteredTasks.length === 0 ? (
                    <div className="border border-zinc-900 bg-zinc-950/20 rounded-2xl p-16 text-center">
                        <Wrench className="w-10 h-10 text-zinc-700 mx-auto mb-4" />
                        <p className="text-zinc-500 text-sm">{tasks.length === 0 ? 'No tasks have been assigned to you yet.' : 'No tasks match the current filter.'}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {filteredTasks.map(task => (
                            <div key={task.id} onClick={() => openModal(task)} className={`bg-zinc-900/20 border rounded-2xl p-5 cursor-pointer transition-all hover:bg-zinc-900/40 group ${getStatusCardStyle(task.status)} relative overflow-hidden`}>
                                {task.pendingTechnicianId === user?.id && (
                                    <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="text-white font-bold tracking-widest text-xs font-mono uppercase bg-emerald-500/20 px-3 py-1 rounded-lg border border-emerald-500/30 text-emerald-300">Requires Confirmation</div>
                                        <div className="flex items-center gap-3 mt-2">
                                            <button onClick={(e) => handleAccept(e, task.id)} className="px-5 py-2 bg-emerald-500 text-black font-bold rounded-lg text-xs hover:bg-emerald-400 transition-colors">Accept</button>
                                            <button onClick={(e) => handleReject(e, task.id)} className="px-5 py-2 bg-red-500/20 border border-red-500/30 text-red-400 font-bold rounded-lg text-xs hover:bg-red-500/40 transition-colors">Reject</button>
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <div className="font-mono text-xs font-bold text-emerald-400 mb-1">{task.ticketNumber || `TICKET #${task.id}`}</div>
                                        <div className="text-white font-semibold text-sm">{task.customerName}</div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">{task.pendingTechnicianId === user?.id ? <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">Pending Transfer</span> : getStatusBadge(task.status)}</div>
                                </div>
                                <div className="mb-4 bg-zinc-950/40 rounded-xl p-3 space-y-1">
                                    <div className="text-zinc-300 text-xs font-semibold">{task.deviceCategory}</div>
                                    <div className="text-zinc-500 text-[11px] font-mono">{task.brand}{task.modelNumber ? ` · ${task.modelNumber}` : ''}</div>
                                    <div className="text-zinc-400 text-[11px] mt-1 font-medium">{task.problemType}</div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5 text-zinc-500 text-[11px]"><MapPin size={10} /> {task.city}</div>
                                        <div className="flex items-center gap-1.5 text-zinc-500 text-[11px]"><Phone size={10} /> {task.mobile}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {task.customerRepairDescription && (
                                            <span title="Customer note present" className="text-emerald-400"><FileText size={12} /></span>
                                        )}
                                        {getPriorityBadge(task.priority)}
                                        <ChevronRight size={14} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Detail Modal */}
                {selectedTask && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto">
                        <div className="bg-[#0c0c0c] border border-zinc-800 rounded-2xl w-full max-w-3xl shadow-2xl relative mb-8">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-neon-cyan rounded-t-2xl" />

                            {/* Modal Header */}
                            <div className="p-6 border-b border-zinc-900 flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="text-xs font-mono text-emerald-400 font-bold">{selectedTask.ticketNumber || `TICKET_ID: #${selectedTask.id}`}</span>
                                        {getStatusBadge(selectedTask.status)}
                                    </div>
                                    <h3 className="text-xl font-bold text-white font-outfit">{selectedTask.customerName}</h3>
                                    <div className="text-xs text-zinc-500 mt-0.5">{selectedTask.brand} {selectedTask.modelNumber || ''} · {selectedTask.deviceCategory}</div>
                                </div>
                                <div className="flex gap-2">
                                    {selectedTask.assignedTechnicianId === user?.id && !['completed', 'cancelled'].includes(selectedTask.status) && (
                                        <button onClick={() => setTransferModalOpen(true)} className="p-1.5 rounded-lg hover:bg-amber-500/10 text-amber-500 border border-transparent hover:border-amber-500/30 transition-colors cursor-pointer text-xs uppercase font-mono font-semibold h-fit flex items-center gap-1.5 px-3">Transfer</button>
                                    )}
                                    <button onClick={() => setSelectedTask(null)} className="p-1.5 rounded-lg hover:bg-zinc-900 border border-transparent hover:border-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer text-xs uppercase font-mono font-semibold h-fit">Close</button>
                                </div>
                            </div>

                            {/* Tab Bar */}
                            <div className="flex border-b border-zinc-900 px-6 pt-1 gap-1 overflow-x-auto">
                                {TABS.map(tab => (
                                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap border-b-2 -mb-px ${activeTab === tab.id ? 'text-emerald-400 border-emerald-400 bg-emerald-400/5' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>
                                        {tab.icon}{tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Tab Content */}
                            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">

                                {/* ── OVERVIEW TAB ── */}
                                {activeTab === 'overview' && (
                                    <>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 space-y-3">
                                                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Contact Details</div>
                                                <div className="space-y-2 text-xs text-zinc-300">
                                                    <div className="flex items-center gap-2.5"><Phone size={13} className="text-emerald-400" /> {selectedTask.mobile}</div>
                                                    {selectedTask.email && <div className="flex items-center gap-2.5"><Mail size={13} className="text-emerald-400" /> {selectedTask.email}</div>}
                                                    <div className="flex items-center gap-2.5"><MapPin size={13} className="text-emerald-400" /> {selectedTask.city}</div>
                                                </div>
                                            </div>
                                            <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 space-y-3">
                                                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Device Details</div>
                                                <div className="space-y-1.5 text-xs text-zinc-300">
                                                    <div><span className="text-zinc-500 uppercase tracking-wide">Category:</span> {selectedTask.deviceCategory}</div>
                                                    <div><span className="text-zinc-500 uppercase tracking-wide">Brand:</span> {selectedTask.brand}</div>
                                                    {selectedTask.modelNumber && <div><span className="text-zinc-500 uppercase tracking-wide">Model:</span> {selectedTask.modelNumber}</div>}
                                                    {selectedTask.serialNumber && <div><span className="text-zinc-500 uppercase tracking-wide">Serial:</span> {selectedTask.serialNumber}</div>}
                                                    {selectedTask.deviceConfiguration && <div><span className="text-zinc-500 uppercase tracking-wide">Config:</span> {selectedTask.deviceConfiguration}</div>}
                                                </div>
                                            </div>
                                            <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 space-y-3">
                                                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Service Preferences</div>
                                                <div className="space-y-1.5 text-xs text-zinc-300">
                                                    <div><span className="text-zinc-500 uppercase tracking-wide">Service:</span> {selectedTask.serviceType}</div>
                                                    <div className="flex items-center gap-2"><span className="text-zinc-500 uppercase tracking-wide">Priority:</span> {getPriorityBadge(selectedTask.priority)}</div>
                                                    <div><span className="text-zinc-500 uppercase tracking-wide">Contact Method:</span> {selectedTask.preferredContactMethod}</div>
                                                </div>
                                            </div>
                                            <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 space-y-3">
                                                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Metadata</div>
                                                <div className="space-y-1.5 text-xs text-zinc-300 font-mono">
                                                    <div className="flex items-center gap-2"><Clock size={12} /> {new Date(selectedTask.createdAt).toLocaleString()}</div>
                                                    <div className="flex items-center gap-2"><Calendar size={12} /> {selectedTask.ticketNumber || `ID_${selectedTask.id}`}</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <h4 className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Problem Description ({selectedTask.problemType})</h4>
                                            <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{selectedTask.problemDescription}</div>
                                        </div>

                                        {(selectedTask as any).feedbackRating && (
                                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 my-2">
                                                <div className="text-[10px] font-mono uppercase tracking-wider text-yellow-500 font-bold mb-2 flex items-center gap-2">
                                                    <Star size={12} className="fill-yellow-500/50" /> Customer Service Feedback
                                                </div>
                                                <div className="flex items-center gap-1 mb-2">
                                                    {Array.from({ length: (selectedTask as any).feedbackRating }).map((_, i) => (
                                                        <Star key={i} size={16} className="text-yellow-400 fill-yellow-400" />
                                                    ))}
                                                </div>
                                                {(selectedTask as any).feedbackComment && (
                                                    <p className="text-sm text-yellow-200/80 italic mt-2 border-t border-yellow-500/20 pt-2 selection:bg-yellow-500/30">
                                                        "{(selectedTask as any).feedbackComment}"
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {(selectedTask.imagePath || selectedTask.screenshotPath) && (
                                            <div className="space-y-3">
                                                <h4 className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Attachments</h4>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    {selectedTask.imagePath && (
                                                        <div className="border border-zinc-900 bg-zinc-950/40 rounded-xl p-3 flex flex-col gap-2">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs text-zinc-400 font-semibold font-mono flex items-center gap-1.5"><FileImage size={13} className="text-emerald-400" /> DEVICE_PHOTO</span>
                                                                <a href={getFileUrl(selectedTask.imagePath)!} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline text-[10px] font-mono flex items-center gap-1">OPEN <ExternalLink size={10} /></a>
                                                            </div>
                                                            <img src={getFileUrl(selectedTask.imagePath)!} alt="Device" className="h-20 w-auto object-contain bg-black rounded border border-zinc-900 cursor-pointer" onClick={() => handleImagePreview(getFileUrl(selectedTask.imagePath)!, 'Device Upload')} />
                                                        </div>
                                                    )}
                                                    {selectedTask.screenshotPath && (
                                                        <div className="border border-zinc-900 bg-zinc-950/40 rounded-xl p-3 flex flex-col gap-2">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs text-zinc-400 font-semibold font-mono flex items-center gap-1.5"><FileImage size={13} className="text-emerald-400" /> SCREENSHOT</span>
                                                                <a href={getFileUrl(selectedTask.screenshotPath)!} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline text-[10px] font-mono flex items-center gap-1">OPEN <ExternalLink size={10} /></a>
                                                            </div>
                                                            <img src={getFileUrl(selectedTask.screenshotPath)!} alt="Screenshot" className="h-20 w-auto object-contain bg-black rounded border border-zinc-900 cursor-pointer" onClick={() => handleImagePreview(getFileUrl(selectedTask.screenshotPath)!, 'Screenshot')} />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Status Update */}
                                        <div className="border-t border-zinc-900 pt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div className="text-xs text-zinc-500 font-mono">UPDATE_TICKET_STATUS:</div>
                                            <div className="flex flex-wrap gap-2">
                                                {statusUpdateLoadingId === selectedTask.id ? (
                                                    <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                                                ) : (
                                                    allowedStatuses.map(st => (
                                                        <button key={st} onClick={() => handleStatusChange(selectedTask.id, st)} disabled={selectedTask.status === st}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${selectedTask.status === st
                                                                ? st === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/40'
                                                                    : st === 'in_progress' ? 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/40'
                                                                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40'
                                                                : 'bg-zinc-950 border-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                                                                } disabled:cursor-not-allowed`}>
                                                            {st.replace('_', ' ').toUpperCase()}
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* ── WORK LOG TAB ── */}
                                {activeTab === 'work-log' && (
                                    <div className="space-y-6">
                                        {/* Add Entry Form */}
                                        <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-5 space-y-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Plus size={14} className="text-emerald-400" />
                                                <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">New Work Log Entry</h4>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Repair Stage *</label>
                                                    <div className="relative">
                                                        <select value={newLog.repairStage} onChange={e => setNewLog(p => ({ ...p, repairStage: e.target.value }))}
                                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-400 appearance-none cursor-pointer">
                                                            <option value="">Select stage...</option>
                                                            {REPAIR_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                                                        </select>
                                                        <ChevronDown size={12} className="absolute right-3 top-2.5 text-zinc-600 pointer-events-none" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Time Spent</label>
                                                    <input value={newLog.timeSpent} onChange={e => setNewLog(p => ({ ...p, timeSpent: e.target.value }))} placeholder="e.g. 2h 30m" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-400 placeholder:text-zinc-700" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Action Performed *</label>
                                                <textarea value={newLog.actionPerformed} onChange={e => setNewLog(p => ({ ...p, actionPerformed: e.target.value }))} rows={2} placeholder="Describe what was done..." className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-400 resize-none placeholder:text-zinc-700" />
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Parts Replaced</label>
                                                    <input value={newLog.partsReplaced} onChange={e => setNewLog(p => ({ ...p, partsReplaced: e.target.value }))} placeholder="e.g. Battery, Display" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-400 placeholder:text-zinc-700" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Media / Photo</label>
                                                    <label className="flex items-center gap-2 cursor-pointer w-full bg-zinc-900 border border-zinc-800 border-dashed rounded-lg px-3 py-2 text-xs text-zinc-500 hover:border-emerald-400 hover:text-emerald-400 transition-all">
                                                        <Upload size={12} />
                                                        {logMediaFile ? logMediaFile.name : 'Upload image/video'}
                                                        <input type="file" className="hidden" accept="image/*,video/*" onChange={e => setLogMediaFile(e.target.files?.[0] || null)} />
                                                    </label>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Internal Notes</label>
                                                <textarea value={newLog.notes} onChange={e => setNewLog(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Any additional technician notes..." className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-400 resize-none placeholder:text-zinc-700" />
                                            </div>
                                            <button onClick={handleSubmitWorkLog} disabled={submittingLog} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                                                {submittingLog ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                                                Add Work Log Entry
                                            </button>
                                        </div>

                                        {/* Work Log History */}
                                        <div className="space-y-3">
                                            <h4 className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Work Log History</h4>
                                            {workLogsLoading ? (
                                                <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 size={13} className="animate-spin" /> Loading logs...</div>
                                            ) : workLogs.length === 0 ? (
                                                <div className="text-center py-8 border border-zinc-900 rounded-xl text-zinc-600 text-xs">No work log entries yet. Add your first entry above.</div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {workLogs.map(log => (
                                                        <div key={log.id} className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 space-y-3">
                                                            <div className="flex items-center justify-between flex-wrap gap-2">
                                                                {getStageBadge(log.repair_stage)}
                                                                <span className="text-[10px] font-mono text-zinc-600">{new Date(log.created_at).toLocaleString()}</span>
                                                            </div>
                                                            <p className="text-sm text-zinc-300 leading-relaxed">{log.action_performed}</p>
                                                            <div className="flex flex-wrap gap-4 text-xs">
                                                                {log.parts_replaced && <span className="text-zinc-400"><span className="text-zinc-600">Parts:</span> {log.parts_replaced}</span>}
                                                                {log.time_spent && <span className="text-zinc-400"><span className="text-zinc-600">Time:</span> {log.time_spent}</span>}
                                                                {log.technician_name && <span className="text-zinc-500 font-mono"><span className="text-zinc-600">By:</span> {log.technician_name}</span>}
                                                            </div>
                                                            {log.notes && <p className="text-xs text-zinc-500 italic border-l-2 border-zinc-800 pl-3">{log.notes}</p>}
                                                            {log.media_path && (
                                                                <a href={getFileUrl(log.media_path)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-emerald-400 text-xs hover:underline">
                                                                    <FileImage size={12} /> View Media <ExternalLink size={10} />
                                                                </a>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ── MILESTONES TAB ── */}
                                {activeTab === 'milestones' && (
                                    <div className="space-y-6">
                                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                                            <AlertTriangle size={15} className="text-amber-400 mt-0.5 shrink-0" />
                                            <p className="text-xs text-amber-300/80 leading-relaxed">Sending a milestone notification will create an in-app alert for the customer and dispatch an email (if configured). Use these to keep clients informed about key repair stages.</p>
                                        </div>

                                        <div className="space-y-3">
                                            <h4 className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Select Milestone</h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {MILESTONES.map(m => (
                                                    <button key={m.key} onClick={() => setSelectedMilestone(selectedMilestone === m.key ? '' : m.key)}
                                                        className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer text-xs font-semibold ${selectedMilestone === m.key ? m.color + ' ring-1 ring-current' : 'bg-zinc-900/30 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'}`}>
                                                        <span className={selectedMilestone === m.key ? '' : 'text-zinc-600'}>{m.icon}</span>
                                                        {m.label}
                                                        {selectedMilestone === m.key && <CheckCircle2 size={12} className="ml-auto shrink-0" />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {selectedMilestone && (
                                            <div>
                                                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1.5">Additional Notes (Optional)</label>
                                                <textarea value={milestoneNotes} onChange={e => setMilestoneNotes(e.target.value)} rows={3} placeholder="Add any extra details to share with the customer..." className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-400 resize-none placeholder:text-zinc-700" />
                                            </div>
                                        )}

                                        <button onClick={handleSendMilestone} disabled={!selectedMilestone || sendingMilestone}
                                            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                                            {sendingMilestone ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                                            Send Milestone Notification
                                        </button>
                                    </div>
                                )}

                                {/* ── CUSTOMER NOTE TAB ── */}
                                {activeTab === 'customer-note' && (
                                    <div className="space-y-5">
                                        <div className="bg-neon-cyan/5 border border-neon-cyan/20 rounded-xl p-4 flex items-start gap-3">
                                            <Star size={15} className="text-neon-cyan mt-0.5 shrink-0" />
                                            <p className="text-xs text-neon-cyan/80 leading-relaxed">Write a clear, friendly explanation of the device condition for the customer. This will be displayed in their User/Company dashboard and repair ticket details. Avoid technical jargon.</p>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">Customer Repair Description</label>
                                            <textarea value={customerDesc} onChange={e => setCustomerDesc(e.target.value)} rows={10} placeholder={`Example:\n\nIssue Found: The device battery was deeply discharged and caused boot failure.\n\nRepair Performed: Full battery replacement and system diagnostics.\n\nParts Replaced: Genuine OEM Battery (3000 mAh).\n\nRecommendations: Avoid letting battery drain completely. Use original charger.\n\nWarranty: 30 days on parts and labour.`}
                                                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-neon-cyan focus:ring-1 focus:ring-neon-cyan/30 resize-none placeholder:text-zinc-700 leading-relaxed" />
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <div className="text-xs text-zinc-600">{customerDesc.length} characters</div>
                                            <button onClick={handleSaveCustomerDesc} disabled={savingDesc}
                                                className="flex items-center gap-2 px-5 py-2.5 bg-neon-cyan hover:bg-neon-cyan/80 text-black text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                                                {savingDesc ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
                                                Save Customer Note
                                            </button>
                                        </div>

                                        {selectedTask.customerRepairDescription && (
                                            <div className="border-t border-zinc-900 pt-4 space-y-2">
                                                <h5 className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">Currently Saved</h5>
                                                <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4 text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">{selectedTask.customerRepairDescription}</div>
                                            </div>
                                        )}
                                    </div>
                                )}

                            </div>
                        </div>
                    </div>
                )}

            </div>

            {/* Image Lightbox Preview Modal */}
            <ImagePreviewModal
                isOpen={previewOpen}
                onClose={() => setPreviewOpen(false)}
                src={previewSrc}
                alt={previewAlt}
            />

            {/* Notification Detail Modal */}
            <AnimatePresence>
                {activeModalNotif && (
                    <div
                        onClick={() => setActiveModalNotif(null)}
                        className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-[9999] animate-fadeIn bg-blur-sm"
                    >
                        <motion.div
                            onClick={(e) => e.stopPropagation()}
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.2 }}
                            className="bg-[#0c0c0c] border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative text-left"
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-neon-cyan" />
                            <div className="px-6 py-4 border-b border-zinc-900 flex justify-between items-center bg-black/50 mt-1">
                                <h3 className="text-xs font-bold text-white uppercase tracking-widest font-mono">Alert Details</h3>
                                <button
                                    onClick={() => setActiveModalNotif(null)}
                                    className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer text-xs font-bold font-mono py-1 px-2 border border-zinc-900"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <h4 className="text-sm font-bold text-emerald-400 leading-snug">{activeModalNotif.title}</h4>
                                    <span className="text-[9px] font-mono text-zinc-550 mt-1 block">
                                        {new Date(activeModalNotif.created_at).toLocaleString()}
                                    </span>
                                </div>

                                <div className="bg-zinc-950/40 p-4 border border-zinc-900 rounded-xl">
                                    <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">{activeModalNotif.message}</p>
                                </div>

                                {activeModalNotif.ticket_number && (
                                    <div className="space-y-1 font-mono">
                                        <span className="text-zinc-600 block text-[9px] uppercase tracking-wider mb-1">Related Assigment</span>
                                        <div className="flex justify-between items-center bg-emerald-400/5 p-3 border border-emerald-400/15 rounded-xl">
                                            <span className="text-xs font-bold text-white">#{activeModalNotif.ticket_number}</span>
                                            <button
                                                onClick={() => {
                                                    setActiveModalNotif(null);
                                                    setShowNotifications(false);
                                                    const matchingTask = tasks.find(t => t.ticketNumber === activeModalNotif.ticket_number || t.id === activeModalNotif.ticket_id);
                                                    if (matchingTask) {
                                                        openModal(matchingTask);
                                                    } else {
                                                        setSearchQuery(activeModalNotif.ticket_number || '');
                                                    }
                                                }}
                                                className="text-[10px] bg-emerald-400 hover:bg-emerald-300 text-black font-bold uppercase py-1.5 px-3 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-[0_0_10px_rgba(52,211,153,0.2)]"
                                            >
                                                <span>View Task</span>
                                                <ArrowUpRight size={10} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
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
        </div>
    );
}
