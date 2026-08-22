import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { adminApi } from '@/services/api';
import type { ActivityLog } from '@/services/api';
import {
    ScrollText, Loader2, ChevronLeft, ChevronRight, Hash, MonitorSmartphone,
    Search, RefreshCw, User, Building2, Wrench, Shield, Globe,
    AlertCircle, DollarSign, HelpCircle, Eye, EyeOff, Calendar,
    Play, Square, Bell, Plus, CheckCircle2, ShieldAlert
} from 'lucide-react';

export default function ActivityLogs() {
    const { token } = useAuth();
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Filters state
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [dateRange, setDateRange] = useState('');

    // Auto-refresh state
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState<number | null>(null);
    const [countdown, setCountdown] = useState(20);
    const countdownTimerRef = useRef<any>(null);

    // Expandable logs details state
    const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

    const fetchLogs = async (showLoadingIndicator = true) => {
        if (!token) return;
        if (showLoadingIndicator) setLoading(true);

        const filters = {
            search: search.trim() || undefined,
            category: category || undefined,
            dateRange: dateRange || undefined
        };

        const res = await adminApi.getActivityLogs(token, page, 15, filters);
        if (res.ok && res.data) {
            setLogs((res.data as any).data?.data || []);
            setTotalPages((res.data as any).data?.pagination?.totalPages || 1);
        }
        if (showLoadingIndicator) setLoading(false);
    };

    // Main fetch trigger
    useEffect(() => {
        setPage(1);
        fetchLogs(true);
    }, [search, category, dateRange]);

    // Handle page changes
    useEffect(() => {
        fetchLogs(true);
    }, [page]);

    // Auto-refresh implementation
    useEffect(() => {
        if (autoRefresh) {
            setCountdown(20);

            // Interval for API calling
            const interval = setInterval(() => {
                fetchLogs(false);
                setCountdown(20);
            }, 20000);

            // Countdown timer interval for UI feedback
            const countdownInterval = setInterval(() => {
                setCountdown(prev => (prev > 1 ? prev - 1 : 20));
            }, 1000);

            return () => {
                clearInterval(interval);
                clearInterval(countdownInterval);
            };
        }
    }, [autoRefresh, search, category, dateRange, page, token]);

    const handleManualRefresh = () => {
        fetchLogs(true);
        if (autoRefresh) setCountdown(20);
    };

    // Category Helpers
    const getCategoryMeta = (cat: string) => {
        switch (cat) {
            case 'security':
                return {
                    icon: Shield,
                    color: 'text-rose-400 bg-rose-400/10 border-rose-500/20',
                    label: 'Security & Auth'
                };
            case 'company':
                return {
                    icon: Building2,
                    color: 'text-indigo-400 bg-indigo-400/10 border-indigo-500/20',
                    label: 'B2B Client'
                };
            case 'repair':
                return {
                    icon: Wrench,
                    color: 'text-amber-400 bg-amber-400/10 border-amber-500/20',
                    label: 'Repair Operations'
                };
            case 'billing':
                return {
                    icon: DollarSign,
                    color: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
                    label: 'Billing'
                };
            case 'website':
                return {
                    icon: Globe,
                    color: 'text-neon-cyan bg-neon-cyan/10 border-neon-cyan/20',
                    label: 'Branding/SEO'
                };
            case 'notification':
                return {
                    icon: Bell,
                    color: 'text-purple-400 bg-purple-400/10 border-purple-500/20',
                    label: 'Alert/Notif'
                };
            case 'user':
                return {
                    icon: User,
                    color: 'text-sky-400 bg-sky-400/10 border-sky-500/20',
                    label: 'Customer'
                };
            case 'admin':
                return {
                    icon: ShieldAlert,
                    color: 'text-pink-400 bg-pink-400/10 border-pink-500/20',
                    label: 'Admin Control'
                };
            default:
                return {
                    icon: ScrollText,
                    color: 'text-zinc-400 bg-zinc-800 border-zinc-700',
                    label: 'System Log'
                };
        }
    };

    const getActionBadge = (action: string) => {
        const lower = action.toLowerCase();
        if (lower.includes('create') || lower.includes('register') || lower.includes('signup')) {
            return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
        }
        if (lower.includes('delete') || lower.includes('failed') || lower.includes('reject')) {
            return 'bg-rose-500/15 text-rose-400 border border-rose-500/20';
        }
        if (lower.includes('update') || lower.includes('change') || lower.includes('edit')) {
            return 'bg-blue-500/15 text-blue-400 border border-blue-500/20';
        }
        if (lower.includes('login') || lower.includes('approve')) {
            return 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/20';
        }
        return 'bg-zinc-800 text-zinc-300 border border-zinc-700';
    };

    return (
        <div className="space-y-6">
            {/* Header with Title and Settings */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight flex items-center gap-2">
                        <ScrollText size={24} className="text-neon-cyan animate-pulse" />
                        Operator Activity Feed
                    </h1>
                    <p className="text-xs text-zinc-500 mt-1">Real-time system actions audit, logging, and security trail console</p>
                </div>

                {/* Live Feeds Auto-Refresh Toggle */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleManualRefresh}
                        className="p-2 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center"
                        title="Refresh activity logs manually"
                        disabled={loading}
                    >
                        <RefreshCw size={16} className={`${loading ? 'animate-spin text-neon-cyan' : ''}`} />
                    </button>

                    <div className="flex items-center bg-zinc-950 border border-zinc-800/80 rounded-xl px-3 py-1.5 gap-2.5">
                        <span className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-ping' : 'bg-zinc-650'}`} />
                            Live Feed
                        </span>

                        <button
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${autoRefresh ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${autoRefresh ? 'translate-x-4' : 'translate-x-0'}`}
                            />
                        </button>

                        {autoRefresh && (
                            <span className="text-[9px] font-mono text-zinc-500 border-l border-zinc-800 pl-2">
                                Refresh in {countdown}s
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter Console */}
            <div className="bg-zinc-950/40 border border-zinc-900 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Search Term Input */}
                <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                        <Search size={15} />
                    </span>
                    <input
                        type="text"
                        placeholder="Search logs..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="bg-zinc-900/60 border border-zinc-800/80 text-white placeholder-zinc-500 rounded-xl pl-10 pr-4 py-2.5 text-xs w-full focus:outline-none focus:border-neon-cyan/50 focus:bg-zinc-900 transition-all font-outfit"
                    />
                </div>

                {/* Category Selector */}
                <div>
                    <select
                        value={category}
                        onChange={e => setCategory(e.target.value)}
                        className="bg-zinc-900/60 border border-zinc-800/80 text-zinc-300 rounded-xl px-3.5 py-2.5 text-xs w-full focus:outline-none focus:border-neon-cyan/50 cursor-pointer font-outfit"
                    >
                        <option value="">All Categories</option>
                        <option value="security">Security & Authentications</option>
                        <option value="company">B2B Clients & Devices</option>
                        <option value="repair">Repair Service Tickets</option>
                        <option value="billing">Invoices & Quotations</option>
                        <option value="website">Branding & SEO Settings</option>
                        <option value="notification">System Templates & Alerts</option>
                        <option value="user">Customer Registrations</option>
                        <option value="admin">Admin Actions</option>
                    </select>
                </div>

                {/* Date Filter Selector */}
                <div>
                    <select
                        value={dateRange}
                        onChange={e => setDateRange(e.target.value)}
                        className="bg-zinc-900/60 border border-zinc-800/80 text-zinc-300 rounded-xl px-3.5 py-2.5 text-xs w-full focus:outline-none focus:border-neon-cyan/50 cursor-pointer font-outfit"
                    >
                        <option value="">All Time</option>
                        <option value="today">Today</option>
                        <option value="week">Past 7 Days</option>
                        <option value="month">Past 30 Days</option>
                    </select>
                </div>

                {/* Reset Filters Option Button */}
                <div className="flex items-center font-outfit">
                    {(search || category || dateRange) && (
                        <button
                            onClick={() => {
                                setSearch('');
                                setCategory('');
                                setDateRange('');
                            }}
                            className="text-xs text-rose-400 hover:text-rose-300 transition-colors cursor-pointer font-semibold underline underline-offset-4"
                        >
                            Reset Active Filters
                        </button>
                    )}
                </div>
            </div>

            {/* Timeline Stream Listing */}
            {loading ? (
                <div className="min-h-[45vh] flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-9 h-9 text-neon-cyan animate-spin" />
                    <span className="text-zinc-500 text-xs font-outfit">Syncing operator activities stream...</span>
                </div>
            ) : logs.length === 0 ? (
                <div className="border border-zinc-900/60 bg-zinc-950/10 rounded-2xl py-24 text-center">
                    <AlertCircle className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-500 text-sm font-outfit font-semibold">No activity feed items logged matching the criteria.</p>
                    <p className="text-zinc-650 text-xs mt-1">Try resetting filters or choosing broader date range params.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Timeline Container */}
                    <div className="relative border-l border-zinc-800/60 ml-4 pl-8 space-y-5 py-2">
                        {logs.map((log) => {
                            const meta = getCategoryMeta(log.category || 'system');
                            const LogIcon = meta.icon;
                            const isExpanded = expandedLogId === log.id;

                            // Format actions name
                            const prettyAction = log.action.replace(/_/g, ' ').toUpperCase();

                            return (
                                <div key={log.id} className="relative group">
                                    {/* Timeline dot */}
                                    <span className={`absolute -left-[45px] top-6 w-9 h-9 rounded-full flex items-center justify-center border font-semibold ${meta.color} shadow-lg transition-transform group-hover:scale-105 duration-200`}>
                                        <LogIcon size={14} />
                                    </span>

                                    {/* Activity Card */}
                                    <div className={`border transition-all duration-300 rounded-2xl p-4 bg-zinc-950/40 hover:bg-zinc-900/10 ${isExpanded ? 'border-neon-cyan/35 shadow-[0_0_15px_rgba(6,182,212,0.05)] bg-zinc-900/15' : 'border-zinc-900/60'}`}>
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            {/* Details & Main action context */}
                                            <div className="space-y-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider font-mono ${getActionBadge(log.action)}`}>
                                                        {prettyAction}
                                                    </span>

                                                    <span className="text-[10px] text-zinc-500 font-mono">
                                                        {new Date(log.created_at).toLocaleString()}
                                                    </span>

                                                    {log.ip_address && (
                                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-805 rounded">
                                                            <MonitorSmartphone size={10} />
                                                            {log.ip_address}
                                                        </span>
                                                    )}
                                                </div>

                                                <p className="text-xs font-semibold text-white mt-1.5 font-outfit">
                                                    {log.user_name ? (
                                                        <span className="text-zinc-300 font-bold">{log.user_name} </span>
                                                    ) : (
                                                        <span className="text-zinc-500 font-bold italic">System background process </span>
                                                    )}
                                                    performed the action
                                                </p>

                                                {/* Target type and context info preview */}
                                                {log.target_type && (
                                                    <div className="flex items-center gap-1.5 text-xs text-zinc-400/90 font-outfit mt-1">
                                                        <span className="text-zinc-500">Related Asset:</span>
                                                        <span className="inline-flex items-center px-1.5 py-0.2 px-2 bg-zinc-900 border border-zinc-850/80 rounded gap-1 font-mono text-[10px] text-neon-cyan capitalize">
                                                            <Hash size={10} />
                                                            {log.target_type} {log.target_id && `#${log.target_id}`}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Expand action */}
                                            <div className="flex items-center justify-end">
                                                <button
                                                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                                    className="px-3 py-1.5 bg-zinc-905 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer font-outfit"
                                                >
                                                    {isExpanded ? (
                                                        <>
                                                            <EyeOff size={12} className="text-rose-400" />
                                                            Hide Details
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Eye size={12} className="text-neon-cyan" />
                                                            Show Details
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expandable Parameter metadata panel */}
                                        {isExpanded && (
                                            <div className="mt-4 border-t border-zinc-900 pt-4 space-y-3 animate-fadeIn">
                                                <p className="text-[10px] font-semibold text-zinc-500 font-mono tracking-wider uppercase">Log Transaction Parameters:</p>

                                                {/* JSON pretty print container */}
                                                <div className="bg-zinc-950 border border-zinc-900/60 rounded-xl p-3.5 overflow-x-auto text-[10px] font-mono text-zinc-400 leading-relaxed max-w-full max-h-64 scrollbar-thin">
                                                    {log.details ? (
                                                        <pre>{JSON.stringify(typeof log.details === 'string' ? JSON.parse(log.details) : log.details, null, 2)}</pre>
                                                    ) : (
                                                        <div className="text-zinc-650 italic">No structured change parameters stored for this transaction record.</div>
                                                    )}
                                                </div>

                                                <div className="flex justify-between items-center text-[10px] text-zinc-500 border-t border-zinc-900/40 pt-2 font-mono">
                                                    <span>Actor Signature: {log.user_email || 'SYSTEM_DAEMON'}</span>
                                                    <span>Transaction ID: {log.id}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Pagination Footer controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-zinc-900/60 pt-5 mt-6 font-outfit">
                            <span className="text-xs text-zinc-500 font-medium">
                                Showing page <span className="text-zinc-300 font-bold">{page}</span> of <span className="text-zinc-300 font-bold">{totalPages}</span>
                            </span>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="px-3.5 py-1.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-950 text-zinc-400 hover:text-white rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                                >
                                    <ChevronLeft size={14} />
                                    Previous
                                </button>

                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="px-3.5 py-1.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-950 text-zinc-400 hover:text-white rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                                >
                                    Next
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
