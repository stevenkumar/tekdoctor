import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { adminApi, notificationApi, repairApi } from '@/services/api';
import type { NotificationItem } from '@/services/api';
import {
    Users, Wrench, UserCog, MessageSquare, Clock,
    AlertCircle, CheckCircle2, Hourglass, Hammer, XCircle, Loader2,
    ShieldAlert, Activity, Calendar, ArrowUpRight, Bell, Trash2
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { AnimatePresence, motion } from 'framer-motion';

export default function DashboardOverview() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState<any | null>(null);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [activeModalNotif, setActiveModalNotif] = useState<NotificationItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'recent' | 'urgent' | 'unassigned' | 'status'>('recent');
    const [activeFilterStatus, setActiveFilterStatus] = useState<string | null>(null);
    const [filteredTickets, setFilteredTickets] = useState<any[]>([]);
    const [isFiltering, setIsFiltering] = useState(false);

    useEffect(() => {
        if (!token) return;
        let isMounted = true;

        const fetchData = async (isInitial = false) => {
            if (isInitial) setLoading(true);
            const [statsRes, notifsRes] = await Promise.all([
                adminApi.getDashboardStats(token),
                notificationApi.getAll(token)
            ]);

            if (isMounted) {
                if (statsRes.ok && statsRes.data) {
                    setStats(statsRes.data.data);
                } else if (isInitial) {
                    setError(statsRes.error || 'Failed to load dashboard stats.');
                }

                if (notifsRes.ok && notifsRes.data) {
                    setNotifications(notifsRes.data.data);
                }
                if (isInitial) setLoading(false);
            }
        };

        fetchData(true);
        const interval = setInterval(() => fetchData(false), 10000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [token]);

    const handleStatusClick = async (statusLabel: string) => {
        let statusVal = statusLabel.toLowerCase();
        if (statusVal === 'in progress') statusVal = 'in_progress';

        setActiveFilterStatus(statusVal);
        setActiveTab('status');
        if (!token) return;
        setIsFiltering(true);
        try {
            const res = await repairApi.getRequests(token, statusVal, 1, 50);
            if (res.ok && res.data) {
                setFilteredTickets((res.data.data as any).data || []);
            }
        } finally {
            setIsFiltering(false);
        }
    };

    const handleMarkRead = async (id: number) => {
        if (!token) return;
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        await notificationApi.markAsRead(token, id);
    };

    const handleMarkAllRead = async () => {
        if (!token) return;
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        await notificationApi.markAsRead(token, 'all');
    };

    const handleDeleteNotification = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (!token) return;
        setNotifications(prev => prev.filter(n => n.id !== id));
        await notificationApi.delete(token, id);
    };

    const handleClearAll = async () => {
        if (!token) return;
        setNotifications([]);
        await notificationApi.clearAll(token);
    };

    const unreadCount = notifications.filter(n => !n.is_read).length;

    if (loading) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 text-neon-cyan animate-spin mb-3" />
                <p className="text-zinc-500 text-xs font-mono uppercase tracking-wider">Loading operations console...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center text-red-400 font-mono text-sm max-w-xl mx-auto mt-12">
                <AlertCircle className="mx-auto mb-2" size={20} />{error}
            </div>
        );
    }

    if (!stats) return null;

    const statCards = [
        { label: 'Total Tickets', value: stats.totalTickets, icon: Wrench, color: 'text-neon-cyan', bg: 'bg-neon-cyan/5', border: 'border-neon-cyan/15', link: ROUTES.ADMIN_TICKETS },
        { label: 'Customers', value: stats.totalUsers, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/5', border: 'border-blue-500/15', link: ROUTES.ADMIN_CUSTOMERS },
        { label: 'Technicians', value: stats.totalTechnicians, icon: UserCog, color: 'text-emerald-400', bg: 'bg-emerald-500/5', border: 'border-emerald-500/15', link: ROUTES.ADMIN_TECHNICIANS },
        { label: 'Contact Messages', value: stats.totalContacts, icon: MessageSquare, color: 'text-purple-400', bg: 'bg-purple-500/5', border: 'border-purple-500/15', link: ROUTES.ADMIN_CONTACTS },
    ];

    const statusCards = [
        { label: 'Pending', value: stats.statusCounts.pending, icon: Hourglass, color: 'text-amber-400', bg: 'bg-amber-500/5', border: 'border-amber-500/15', link: `${ROUTES.ADMIN_TICKETS}?status=pending` },
        { label: 'In Progress', value: stats.statusCounts.inProgress, icon: Hammer, color: 'text-neon-cyan', bg: 'bg-neon-cyan/5', border: 'border-neon-cyan/15', link: `${ROUTES.ADMIN_TICKETS}?status=in_progress` },
        { label: 'Completed', value: stats.statusCounts.completed, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/5', border: 'border-emerald-500/15', link: `${ROUTES.ADMIN_TICKETS}?status=completed` },
        { label: 'Cancelled', value: stats.statusCounts.cancelled, icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/5', border: 'border-red-500/15', link: `${ROUTES.ADMIN_TICKETS}?status=cancelled` },
    ];

    const getStatusBadge = (status: string) => {
        const map: Record<string, { cls: string; label: string }> = {
            pending: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', label: 'PENDING' },
            in_progress: { cls: 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/20', label: 'IN PROGRESS' },
            completed: { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'COMPLETED' },
            cancelled: { cls: 'bg-red-500/10 text-red-500 border-red-500/20', label: 'CANCELLED' },
        };
        const s = map[status.toLowerCase()] || { cls: 'bg-zinc-800 text-zinc-400 border-zinc-700', label: status };
        return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border ${s.cls}`}>{s.label}</span>;
    };

    return (
        <div className="space-y-8 font-outfit">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neon-cyan">Operations Center</span>
                    <div className="w-1.5 h-1.5 bg-neon-cyan rounded-full animate-ping" />
                </div>
                <h1 className="text-3xl font-extrabold text-white tracking-tight">System Monitor & Dispatch Dashboard</h1>
            </div>

            {/* Main Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map(s => {
                    const Icon = s.icon;
                    return (
                        <Link to={s.link} key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-5 flex items-center gap-4 hover:-translate-y-1 hover:shadow-lg transition-all cursor-pointer`}>
                            <div className={`w-12 h-12 rounded-xl bg-zinc-950 flex items-center justify-center border border-zinc-900`}>
                                <Icon size={20} className={s.color} />
                            </div>
                            <div>
                                <div className="text-2xl font-extrabold text-white">{s.value}</div>
                                <div className="text-xs text-zinc-550 font-semibold">{s.label}</div>
                            </div>
                        </Link>
                    );
                })}
            </div>

            {/* Status Breakdown */}
            <div>
                <h2 className="text-xs font-bold font-mono uppercase text-zinc-400 mb-3 tracking-wider flex items-center gap-2">
                    Active Repair Backlog
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {statusCards.map(s => {
                        const Icon = s.icon;
                        let statusVal = s.label.toLowerCase();
                        if (statusVal === 'in progress') statusVal = 'in_progress';
                        const isActive = activeFilterStatus === statusVal;

                        return (
                            <button onClick={() => handleStatusClick(s.label)} key={s.label} className={`border ${isActive ? `ring-2 ring-offset-2 ring-offset-[#0a0a0a] ring-white ${s.border}` : s.border} rounded-xl p-4 ${s.bg} flex items-center gap-3 hover:-translate-y-1 hover:shadow-md transition-all cursor-pointer text-left`}>
                                <Icon size={16} className={s.color} />
                                <div>
                                    <div className="text-lg font-bold text-white leading-none mb-1">{s.value}</div>
                                    <div className={`text-[9px] uppercase tracking-wider font-mono ${isActive ? 'text-white font-bold' : 'text-zinc-500'}`}>{s.label}</div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Row 1: System Health & Logs Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* System Alerts Console */}
                <div className="bg-zinc-950/20 border border-zinc-900 rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider font-mono relative w-fit">
                        <ShieldAlert size={16} className="text-neon-cyan" /> System Alerts
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-3 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                        )}
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                        <Link
                            to={ROUTES.ADMIN_TICKETS}
                            className={`p-3 rounded-xl border flex items-center justify-between transition-all block ${stats.systemAlerts?.unassignedCount > 0
                                ? 'bg-amber-500/5 border-amber-500/20 text-amber-300 hover:border-amber-500/40 hover:bg-amber-500/10 hover:-translate-y-0.5'
                                : 'bg-zinc-800/10 border-zinc-900 text-zinc-500 hover:border-zinc-800 hover:-translate-y-0.5'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <AlertCircle size={15} />
                                <span>Unassigned</span>
                            </div>
                            <span className="font-mono font-bold">{stats.systemAlerts?.unassignedCount || 0}</span>
                        </Link>

                        <Link
                            to={ROUTES.ADMIN_TICKETS}
                            className={`p-3 rounded-xl border flex items-center justify-between transition-all block ${stats.systemAlerts?.overdueCount > 0
                                ? 'bg-red-500/5 border-red-500/20 text-red-300 hover:border-red-500/40 hover:bg-red-500/10 hover:-translate-y-0.5'
                                : 'bg-zinc-800/10 border-zinc-900 text-zinc-500 hover:border-zinc-800 hover:-translate-y-0.5'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <Clock size={15} />
                                <span>Overdue (SLA)</span>
                            </div>
                            <span className="font-mono font-bold">{stats.systemAlerts?.overdueCount || 0}</span>
                        </Link>

                        <Link
                            to={ROUTES.ADMIN_CONTACTS}
                            className={`p-3 rounded-xl border flex items-center justify-between transition-all block ${stats.systemAlerts?.pendingMessagesCount > 0
                                ? 'bg-indigo-500/5 border-indigo-500/20 text-indigo-300 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:-translate-y-0.5'
                                : 'bg-zinc-800/10 border-zinc-900 text-zinc-500 hover:border-zinc-800 hover:-translate-y-0.5'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <MessageSquare size={15} />
                                <span>Inquiries</span>
                            </div>
                            <span className="font-mono font-bold">{stats.systemAlerts?.pendingMessagesCount || 0}</span>
                        </Link>
                    </div>

                    {/* Inbox Alerts Sub-section */}
                    <div className="pt-4 border-t border-zinc-900/60 space-y-3">
                        <div className="flex justify-between items-center">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono flex items-center gap-1.5">
                                <Bell size={12} className="text-neon-cyan" /> Inbox Notifications
                                {unreadCount > 0 && (
                                    <span className="px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[8px] font-bold border border-red-500/20">
                                        {unreadCount} NEW
                                    </span>
                                )}
                            </h4>
                            <div className="flex gap-2">
                                {unreadCount > 0 && (
                                    <button
                                        onClick={handleMarkAllRead}
                                        className="text-[9px] font-mono text-neon-cyan hover:text-white uppercase transition-colors cursor-pointer"
                                    >
                                        Mark all read
                                    </button>
                                )}
                                {notifications.length > 0 && (
                                    <button
                                        onClick={handleClearAll}
                                        className="text-[9px] font-mono text-red-500 hover:text-white uppercase transition-colors cursor-pointer"
                                    >
                                        Clear all
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-1 scrollbar-thin">
                            {notifications.length === 0 ? (
                                <p className="text-center py-4 text-zinc-650 text-[10px] font-mono">No inbox messages.</p>
                            ) : (
                                notifications.map((n: any) => {
                                    const handleNotificationClick = async () => {
                                        if (!n.is_read) {
                                            await handleMarkRead(n.id);
                                        }
                                        setActiveModalNotif({ ...n, is_read: true });
                                    };
                                    return (
                                        <div
                                            key={n.id}
                                            onClick={handleNotificationClick}
                                            className={`p-2.5 rounded-xl border transition-all text-[11px] leading-relaxed cursor-pointer relative group ${n.is_read
                                                ? 'bg-zinc-950/20 border-zinc-900 text-zinc-550 hover:border-zinc-800'
                                                : 'bg-neon-cyan/5 border-neon-cyan/20 hover:bg-neon-cyan/10 text-white'
                                                }`}
                                        >
                                            <div className="flex justify-between items-start gap-4">
                                                <div className={`font-bold flex items-center gap-1.5 ${n.is_read ? 'text-zinc-400' : 'text-neon-cyan'}`}>
                                                    {n.title}
                                                    {!n.is_read && (
                                                        <span className="text-[8px] bg-red-500/10 text-red-400 font-bold px-1 rounded uppercase tracking-wider scale-90 origin-left">
                                                            New
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={(e) => handleDeleteNotification(e, n.id)}
                                                    className="text-zinc-500 hover:text-red-400 p-0.5 rounded transition-colors shrink-0"
                                                    title="Delete notification"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                            <p className="opacity-80 mt-0.5">{n.message}</p>
                                            <p className="text-[9px] font-mono opacity-40 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Today's Activity Console */}
                <div className="bg-zinc-950/20 border border-zinc-900 rounded-2xl p-5 space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider font-mono">
                            <Activity size={16} className="text-neon-cyan" /> Operator Activity Feed
                        </h3>
                        <Link
                            to={ROUTES.ADMIN_ACTIVITY_LOGS}
                            className="text-[10px] font-mono text-neon-cyan hover:text-white flex items-center gap-1"
                        >
                            VIEW FULL LOGS &rarr;
                        </Link>
                    </div>

                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                        {stats.todaysActivities?.length === 0 ? (
                            <p className="text-center py-6 text-zinc-600 text-xs font-mono">No operational logs today yet.</p>
                        ) : (
                            stats.todaysActivities?.map((log: any) => (
                                <div key={log.id} className="relative pl-3.5 border-l border-zinc-850 space-y-1 text-[11px] leading-relaxed">
                                    <div className="absolute -left-[5.5px] top-1.5 w-2.5 h-2.5 rounded-full border border-indigo-500 bg-zinc-950" />
                                    <div className="text-white font-semibold">
                                        {log.actorName || 'System'}
                                    </div>
                                    <div className="text-zinc-[450] font-medium font-sans">
                                        <span className="font-semibold text-indigo-400 font-mono text-[9px] uppercase mr-1">
                                            [{log.action?.replaceAll('_', ' ')}]
                                        </span>
                                        {log.details ? (
                                            typeof log.details === 'object' ? JSON.stringify(log.details) : log.details
                                        ) : 'Changed system parameter'}
                                    </div>
                                    <div className="text-[9px] text-zinc-600 font-mono mt-0.5">
                                        {new Date(log.createdAt).toLocaleTimeString()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Row 2: Ticket Operations Console (Full Width tabbed View) */}
            <div className="bg-zinc-950/20 border border-zinc-900 rounded-2xl p-6 space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-900/60 pb-4">
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => { setActiveTab('recent'); setActiveFilterStatus(null); }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all relative uppercase tracking-wider font-mono cursor-pointer ${activeTab === 'recent'
                                ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20'
                                : 'bg-zinc-900/30 text-zinc-400 border border-zinc-900 hover:border-zinc-800 hover:text-white'
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                <Clock size={14} />
                                Recent Tickets Log
                            </span>
                        </button>

                        <button
                            onClick={() => { setActiveTab('urgent'); setActiveFilterStatus(null); }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all relative uppercase tracking-wider font-mono cursor-pointer ${activeTab === 'urgent'
                                ? 'bg-red-500/10 text-red-500 border border-red-550/20'
                                : 'bg-zinc-900/30 text-zinc-400 border border-zinc-900 hover:border-zinc-800 hover:text-white'
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                <ShieldAlert size={14} />
                                Priority Backlog
                                {stats.highPriorityRepairs?.length > 0 && (
                                    <span className="ml-1 px-1.5 py-0.5 text-[9px] font-mono leading-none bg-red-550/20 text-red-400 border border-red-550/30 rounded-md font-bold">
                                        {stats.highPriorityRepairs.length}
                                    </span>
                                )}
                            </span>
                        </button>

                        <button
                            onClick={() => { setActiveTab('unassigned'); setActiveFilterStatus(null); }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all relative uppercase tracking-wider font-mono cursor-pointer ${activeTab === 'unassigned'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-zinc-900/30 text-zinc-400 border border-zinc-900 hover:border-zinc-800 hover:text-white'
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                <AlertCircle size={14} />
                                Unassigned Dispatch
                                {stats.pendingAssignments?.length > 0 && (
                                    <span className="ml-1 px-1.5 py-0.5 text-[9px] font-mono leading-none bg-amber-550/20 text-amber-400 border border-amber-555/30 rounded-md font-bold">
                                        {stats.pendingAssignments.length}
                                    </span>
                                )}
                            </span>
                        </button>
                    </div>

                    <Link to={ROUTES.ADMIN_TICKETS} className="text-xs font-mono text-neon-cyan hover:text-white hover:underline flex items-center gap-1 transition-colors self-end sm:self-auto py-1">
                        View Registry <ArrowUpRight size={12} />
                    </Link>
                </div>

                <div className="relative">
                    {activeTab === 'recent' && (
                        <div className="space-y-4">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-zinc-900/60 pb-2 text-[9px] font-mono uppercase text-zinc-500">
                                            <th className="py-2 pr-2">Ticket</th>
                                            <th className="py-2">Customer</th>
                                            <th className="py-2">Device Specification</th>
                                            <th className="py-2 text-center">Priority</th>
                                            <th className="py-2 text-center">Status</th>
                                            <th className="py-2 text-center">Lead Tech</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-900/40 text-xs">
                                        {stats.recentTickets?.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="text-center py-6 text-zinc-500">No recent tickets logged.</td>
                                            </tr>
                                        ) : (
                                            stats.recentTickets?.map((t: any) => (
                                                <tr key={t.id} onClick={() => navigate(`${ROUTES.ADMIN_TICKETS}?id=${t.id}`)} className="hover:bg-zinc-900/10 transition-colors cursor-pointer group">
                                                    <td className="py-3 pr-2 font-mono font-bold text-neon-cyan">{t.ticketNumber || `REQ-${t.id}`}</td>
                                                    <td className="py-3">
                                                        <div className="font-semibold text-white">{t.customerName}</div>
                                                        <span className="text-[9px] text-zinc-500 font-mono block mt-0.5">{new Date(t.createdAt).toLocaleDateString()}</span>
                                                    </td>
                                                    <td className="py-3">
                                                        <div className="text-white font-medium">{t.brand} {t.modelNumber}</div>
                                                        <span className="text-[9px] text-zinc-450 block mt-0.5 font-mono">{t.deviceCategory} &bull; {t.problemType}</span>
                                                    </td>
                                                    <td className="py-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${['urgent', 'critical', 'emergency'].includes(t.priority?.toLowerCase()) ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                                            t.priority?.toLowerCase() === 'high' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                                                                'bg-zinc-800 text-zinc-500'
                                                            }`}>{t.priority}</span>
                                                    </td>
                                                    <td className="py-3 text-center">{getStatusBadge(t.status)}</td>
                                                    <td className="py-3 text-center">
                                                        <span className={`px-1.5 py-0.5 rounded-lg text-[9px] font-bold ${t.techName ? 'text-indigo-400 bg-indigo-500/5' : 'text-zinc-650 bg-zinc-900/50'}`}>
                                                            {t.techName || 'Unassigned'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'urgent' && (
                        <div className="space-y-4">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-zinc-900/60 pb-2 text-[9px] font-mono uppercase text-zinc-500">
                                            <th className="py-2 pr-2">Ticket</th>
                                            <th className="py-2">Client / Model</th>
                                            <th className="py-2">System Diagnostic</th>
                                            <th className="py-2 text-center">Current Status</th>
                                            <th className="py-2 text-center">Target Delivery</th>
                                            <th className="py-2 text-center">Assigned Lead</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-900/40 text-xs">
                                        {stats.highPriorityRepairs?.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="text-center py-6 text-zinc-600 font-mono">No critical high-priority backlog tickets.</td>
                                            </tr>
                                        ) : (
                                            stats.highPriorityRepairs?.map((t: any) => (
                                                <tr key={t.id} onClick={() => navigate(`${ROUTES.ADMIN_TICKETS}?id=${t.id}`)} className="hover:bg-zinc-900/10 transition-colors cursor-pointer group">
                                                    <td className="py-3 pr-2 font-mono font-bold text-red-500">{t.ticketNumber || `REQ-${t.id}`}</td>
                                                    <td className="py-3">
                                                        <div className="font-semibold text-white">{t.customerName}</div>
                                                        <span className="text-[9px] text-zinc-450 block mt-0.5">{t.brand} {t.modelNumber}</span>
                                                    </td>
                                                    <td className="py-3 font-mono text-[10px] text-zinc-400">{t.problemType}</td>
                                                    <td className="py-3 text-center">{getStatusBadge(t.status)}</td>
                                                    <td className="py-3 text-center text-[10px] font-semibold font-mono text-zinc-405">
                                                        {t.estimatedCompletionDate ? new Date(t.estimatedCompletionDate).toLocaleDateString() : '—'}
                                                    </td>
                                                    <td className="py-3 text-center">
                                                        <span className={`px-1.5 py-0.5 rounded-lg text-[9px] font-bold ${t.techName ? 'text-indigo-400 bg-indigo-500/5' : 'text-zinc-650 bg-zinc-900/50'}`}>
                                                            {t.techName || 'Unassigned'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'unassigned' && (
                        <div className="space-y-4">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-zinc-900/60 pb-2 text-[9px] font-mono uppercase text-zinc-500">
                                            <th className="py-2 pr-2">Ticket</th>
                                            <th className="py-2">Client Details</th>
                                            <th className="py-2">Hardware Category</th>
                                            <th className="py-2">Inquired Fault</th>
                                            <th className="py-2 text-center font-bold">Severity</th>
                                            <th className="py-2 text-center">Register Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-900/40 text-xs">
                                        {stats.pendingAssignments?.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="text-center py-6 text-zinc-600 font-mono">Operations clear! All tickets dispatched.</td>
                                            </tr>
                                        ) : (
                                            stats.pendingAssignments?.map((t: any) => (
                                                <tr key={t.id} onClick={() => navigate(`${ROUTES.ADMIN_TICKETS}?id=${t.id}`)} className="hover:bg-zinc-900/10 transition-colors cursor-pointer group">
                                                    <td className="py-3 pr-2 font-mono font-bold text-amber-500">{t.ticketNumber || `REQ-${t.id}`}</td>
                                                    <td className="py-3 font-semibold text-white">{t.customerName}</td>
                                                    <td className="py-3 font-medium text-zinc-400">{t.deviceCategory} ({t.brand})</td>
                                                    <td className="py-3 text-[10px] text-zinc-500 font-mono">{t.problemType}</td>
                                                    <td className="py-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${['urgent', 'critical', 'emergency'].includes(t.priority?.toLowerCase()) ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                                            t.priority?.toLowerCase() === 'high' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                                                                'bg-zinc-800 text-zinc-500'
                                                            }`}>{t.priority}</span>
                                                    </td>
                                                    <td className="py-3 text-center text-zinc-500 font-mono text-[9px]">{new Date(t.createdAt).toLocaleDateString()}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'status' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2 p-3 bg-zinc-900/20 rounded-xl border border-zinc-900">
                                <span className="text-[10px] font-mono uppercase text-zinc-400">Filtering by status:</span>
                                <span className="text-xs font-bold text-white uppercase tracking-wider">{activeFilterStatus?.replace('_', ' ')}</span>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-zinc-900/60 pb-2 text-[9px] font-mono uppercase text-zinc-500">
                                            <th className="py-2 pr-2">Ticket</th>
                                            <th className="py-2">Client / Date</th>
                                            <th className="py-2">Device & Fault</th>
                                            <th className="py-2 text-center">Priority</th>
                                            <th className="py-2 text-center">Current Status</th>
                                            <th className="py-2 text-center">Lead Tech</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-900/40 text-xs">
                                        {isFiltering ? (
                                            <tr>
                                                <td colSpan={6} className="text-center py-6 text-neon-cyan"><Loader2 size={16} className="animate-spin text-neon-cyan inline-block" /></td>
                                            </tr>
                                        ) : filteredTickets?.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="text-center py-6 text-zinc-600 font-mono">No tickets found for this status filter.</td>
                                            </tr>
                                        ) : (
                                            filteredTickets?.map((t: any) => (
                                                <tr key={t.id} onClick={(e) => { e.preventDefault(); navigate(`${ROUTES.ADMIN_TICKETS}?id=${t.id}`); }} className="hover:bg-zinc-900/10 transition-colors cursor-pointer group">
                                                    <td className="py-3 pr-2 font-mono font-bold text-neon-cyan">{t.ticketNumber || `REQ-${t.id}`}</td>
                                                    <td className="py-3">
                                                        <div className="font-semibold text-white">{t.customerName}</div>
                                                        <span className="text-[9px] text-zinc-400 block mt-0.5 font-mono">{new Date(t.createdAt).toLocaleDateString()}</span>
                                                    </td>
                                                    <td className="py-3">
                                                        <div className="font-medium text-white">{t.deviceCategory}</div>
                                                        <span className="text-[10px] text-zinc-400 block font-mono">{t.problemType}</span>
                                                    </td>
                                                    <td className="py-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${['urgent', 'critical', 'emergency'].includes(t.priority?.toLowerCase()) ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                                            t.priority?.toLowerCase() === 'high' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                                                                'bg-zinc-800 text-zinc-500'
                                                            }`}>{t.priority}</span>
                                                    </td>
                                                    <td className="py-3 text-center">{getStatusBadge(t.status)}</td>
                                                    <td className="py-3 text-center">
                                                        <span className={`px-1.5 py-0.5 rounded-lg text-[9px] font-bold ${t.techName ? 'text-indigo-400 bg-indigo-500/5' : 'text-zinc-650 bg-zinc-900/50'}`}>
                                                            {t.techName || 'Unassigned'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>

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
                            className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative text-left"
                        >
                            <div className="px-6 py-4 border-b border-zinc-900 flex justify-between items-center bg-black/50">
                                <h3 className="text-xs font-bold text-white uppercase tracking-widest font-mono">Notification Details</h3>
                                <button
                                    onClick={() => setActiveModalNotif(null)}
                                    className="p-1 rounded-lg hover:bg-zinc-850 text-zinc-400 hover:text-white transition-colors cursor-pointer text-xs font-bold font-mono py-1 px-2 border border-zinc-850"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                {/* Title */}
                                <div>
                                    <h4 className="text-sm font-bold text-neon-cyan leading-snug">{activeModalNotif.title}</h4>
                                    <span className="text-[9px] font-mono text-zinc-550 mt-1 block">
                                        {new Date(activeModalNotif.created_at).toLocaleString()}
                                    </span>
                                </div>

                                {/* Extra Information Grid */}
                                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                                    <div className="bg-[#0b0b0b]/60 p-2 rounded-lg border border-zinc-900">
                                        <span className="text-zinc-600 block text-[8px] uppercase tracking-wider mb-0.5">Type</span>
                                        <span className="text-zinc-300 font-bold">
                                            {activeModalNotif.ticket_number || activeModalNotif.ticket_id ? 'Ticket Update' : activeModalNotif.sender_name ? 'User Message' : 'System Alert'}
                                        </span>
                                    </div>
                                    <div className="bg-[#0b0b0b]/60 p-2 rounded-lg border border-zinc-900">
                                        <span className="text-zinc-600 block text-[8px] uppercase tracking-wider mb-0.5">Status</span>
                                        <span className={`font-bold ${activeModalNotif.is_read ? 'text-emerald-400' : 'text-amber-400'}`}>
                                            {activeModalNotif.is_read ? 'Read' : 'Unread'}
                                        </span>
                                    </div>
                                </div>

                                {/* Message */}
                                <div className="bg-zinc-900/40 p-4 border border-zinc-900 rounded-xl">
                                    <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">{activeModalNotif.message}</p>
                                </div>

                                {/* Sender Metadata */}
                                {activeModalNotif.sender_name && (
                                    <div className="text-[11px] text-zinc-400 font-mono">
                                        <span className="text-zinc-650 block text-[9px] uppercase tracking-wider mb-1">Sender Info</span>
                                        <div className="bg-[#0c0c0c] p-3 rounded-xl border border-zinc-900">
                                            <strong>Name:</strong> {activeModalNotif.sender_name} <br />
                                            <strong>Email:</strong> {activeModalNotif.sender_email || 'N/A'}
                                        </div>
                                    </div>
                                )}

                                {/* Related Ticket Info */}
                                {activeModalNotif.ticket_number && (
                                    <div className="space-y-1 font-mono">
                                        <span className="text-zinc-655 block text-[9px] uppercase tracking-wider mb-1">Related Ticket</span>
                                        <div className="flex justify-between items-center bg-neon-cyan/5 p-3 border border-neon-cyan/15 rounded-xl">
                                            <span className="text-xs font-bold text-white">#{activeModalNotif.ticket_number}</span>
                                            <button
                                                onClick={() => {
                                                    const route = ROUTES.ADMIN_TICKETS;
                                                    const queryParam = activeModalNotif.ticket_id ? `id=${activeModalNotif.ticket_id}` : `search=${activeModalNotif.ticket_number}`;
                                                    navigate(`${route}?${queryParam}`);
                                                    setActiveModalNotif(null);
                                                }}
                                                className="text-[10px] bg-neon-cyan hover:bg-neon-cyan/85 text-black font-bold uppercase py-1.5 px-3 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-[0_0_10px_rgba(0,242,255,0.2)]"
                                            >
                                                <span>View Ticket</span>
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
        </div>
    );
}
