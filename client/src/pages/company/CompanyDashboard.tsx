import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCompanyContext } from '../../context/CompanyContext';
import { companyApi, repairApi } from '../../services/api';
import { toast } from 'react-hot-toast';
import SideDrawer from '../../components/SideDrawer';
import RepairTicketWorkspace from '../../components/RepairTicketWorkspace';
import { PromptModal } from '../../components/PromptModal';
import {
    Smartphone, Wrench, AlertCircle, CheckCircle,
    Clock, ArrowUpRight, BarChart3, AlertTriangle,
    Search, Users, Building2, MessageSquare, CreditCard,
    Plus, RefreshCw, X, Edit2, CheckCircle2, DollarSign,
    Check, ShieldAlert, ChevronRight, User as UserIcon,
    Layers, Cpu, MapPin, Eye
} from 'lucide-react';

interface Ticket {
    id: number;
    ticket_number: string;
    status: string;
    created_at: string;
    priority: string;
    brand: string;
    model_number: string;
}

interface BrandStat {
    brand: string;
    value: number;
}

interface StatsData {
    totalDevices: number;
    ticketCounts: {
        pending: number;
        in_progress: number;
        completed: number;
        delivered?: number;
        cancelled: number;
        total: number;
        pendingApproval?: number;
    };
    pendingApprovalCount?: number;
    recentRequests: Ticket[];
    brandStats: BrandStat[];
}

export default function CompanyDashboard() {
    const { token, user } = useAuth();
    const { selectedCompanyId, selectedCompany, isAdminManagingCompany, loadingCompanies } = useCompanyContext();
    const navigate = useNavigate();

    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Tab state: 'recent' vs 'approval_budget'
    const [activeTab, setActiveTab] = useState<'recent' | 'approval_budget'>('recent');
    const [approvalTickets, setApprovalTickets] = useState<any[]>([]);
    const [loadingApprovalTickets, setLoadingApprovalTickets] = useState(false);
    const [approvalTicketsError, setApprovalTicketsError] = useState('');

    // Ticket Workspace States
    const [detailTicketId, setDetailTicketId] = useState<number | string | null>(null);
    const [selectedTicketDetail, setSelectedTicketDetail] = useState<any | null>(null);
    const [loadingTicketDetail, setLoadingTicketDetail] = useState(false);
    const [ticketDetailError, setTicketDetailError] = useState('');
    const [quickDrawerTicket, setQuickDrawerTicket] = useState<any | null>(null);

    // Quick Action States
    const [rejectTicketId, setRejectTicketId] = useState<number | string | null>(null);
    const [isRejecting, setIsRejecting] = useState(false);
    const [approvingId, setApprovingId] = useState<number | string | null>(null);

    // Load full ticket details when detailTicketId changes
    useEffect(() => {
        if (!detailTicketId || !token) {
            setSelectedTicketDetail(null);
            return;
        }
        let isMounted = true;
        setLoadingTicketDetail(true);
        setTicketDetailError('');
        repairApi.getRequestById(token, detailTicketId).then((res) => {
            if (!isMounted) return;
            if (res.ok && res.data?.data) {
                setSelectedTicketDetail(res.data.data);
            } else {
                setTicketDetailError(res.error || 'Failed to load ticket workspace details.');
            }
        }).catch(() => {
            if (isMounted) setTicketDetailError('Network error retrieving ticket details.');
        }).finally(() => {
            if (isMounted) setLoadingTicketDetail(false);
        });
        return () => { isMounted = false; };
    }, [detailTicketId, token]);

    const fetchStats = async (isManual = false) => {
        if (!token) return;
        if (isAdminManagingCompany && !selectedCompanyId && !loadingCompanies) {
            setLoading(false);
            return;
        }
        if (isManual) setRefreshing(true);
        try {
            const res = await companyApi.getStats(token);
            if (res.ok && res.data) {
                const payload = res.data.data || res.data;
                setStats(payload);
                setError('');
            } else {
                setError(res.error || 'Failed to fetch dashboard statistics.');
            }
        } catch {
            setError('Failed to fetch dashboard statistics.');
        } finally {
            setLoading(false);
            if (isManual) setRefreshing(false);
        }
    };

    const fetchApprovalTickets = async () => {
        if (!token) return;
        setLoadingApprovalTickets(true);
        setApprovalTicketsError('');
        try {
            const res = await companyApi.getRepairs(token, { approvalStatus: 'pending' });
            if (res.ok && res.data) {
                const data = res.data.data || res.data;
                setApprovalTickets(Array.isArray(data) ? data : []);
            } else {
                setApprovalTicketsError(res.error || 'Failed to load pending approval tickets.');
            }
        } catch {
            setApprovalTicketsError('Network error while loading pending approval tickets.');
        } finally {
            setLoadingApprovalTickets(false);
        }
    };

    useEffect(() => {
        if (isAdminManagingCompany && loadingCompanies) return;
        fetchStats();
        fetchApprovalTickets();
    }, [token, selectedCompanyId, loadingCompanies]);

    useEffect(() => {
        if (activeTab === 'approval_budget') {
            fetchApprovalTickets();
        }
    }, [activeTab]);

    const handleQuickApprove = async (ticket: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!token) return;
        setApprovingId(ticket.id);
        try {
            const res = await repairApi.approveEstimate(ticket.id, token);
            if (res.ok) {
                toast.success(`Budget approved for Ticket #${ticket.ticket_number || ticket.id}! Technician authorized.`);
                fetchStats();
                fetchApprovalTickets();
            } else {
                toast.error(res.error || 'Failed to approve budget.');
            }
        } catch {
            toast.error('An error occurred while approving the budget.');
        } finally {
            setApprovingId(null);
        }
    };

    const handleQuickReject = async (reason: string) => {
        if (!rejectTicketId || !token) return;
        setIsRejecting(true);
        try {
            const res = await repairApi.rejectEstimate(rejectTicketId, reason || 'Budget estimate declined by company', token);
            if (res.ok) {
                toast.success('Budget estimate declined. Ticket placed on hold.');
                setRejectTicketId(null);
                fetchStats();
                fetchApprovalTickets();
            } else {
                toast.error(res.error || 'Failed to decline estimate.');
            }
        } catch {
            toast.error('An error occurred while declining the estimate.');
        } finally {
            setIsRejecting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    if (error || !stats) {
        return (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <AlertTriangle size={18} />
                    <span>{error || 'An error occurred while loading dashboard statistics.'}</span>
                </div>
                <button
                    onClick={() => {
                        fetchStats(true);
                        fetchApprovalTickets();
                    }}
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                    Retry
                </button>
            </div>
        );
    }

    const pendingApprovalVal = stats.pendingApprovalCount ?? (stats.ticketCounts?.pendingApproval || 0);

    const cards = [
        {
            title: 'Approval Budget',
            value: pendingApprovalVal,
            icon: DollarSign,
            color: 'from-amber-500 to-rose-600',
            description: 'Awaiting budget approval',
            badge: pendingApprovalVal > 0 ? 'Action Needed' : null,
            onClick: () => setActiveTab('approval_budget')
        },
        {
            title: 'Total Devices',
            value: stats.totalDevices,
            icon: Smartphone,
            color: 'from-blue-500 to-indigo-600',
            description: 'Asset catalog count',
            path: '/company/devices'
        },
        {
            title: 'Pending Tickets',
            value: stats.ticketCounts?.pending || 0,
            icon: AlertCircle,
            color: 'from-amber-400 to-orange-500',
            description: 'Awaiting repair review',
            path: '/company/repairs'
        },
        {
            title: 'Active Repairs',
            value: stats.ticketCounts?.in_progress || 0,
            icon: Clock,
            color: 'from-violet-500 to-fuchsia-600',
            description: 'Currently on workbench',
            path: '/company/repairs'
        },
        {
            title: 'Completed Repairs',
            value: (stats.ticketCounts?.completed || 0) + (stats.ticketCounts?.delivered || 0),
            icon: CheckCircle,
            color: 'from-emerald-400 to-teal-500',
            description: 'Resolved business assets',
            path: '/company/repairs'
        }
    ];

    const filteredRecentRequests = (stats.recentRequests || []).filter(req => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            (req.ticket_number || '').toLowerCase().includes(q) ||
            (req.brand || '').toLowerCase().includes(q) ||
            (req.model_number || '').toLowerCase().includes(q) ||
            (req.status || '').toLowerCase().includes(q) ||
            (req.priority || '').toLowerCase().includes(q)
        );
    });

    const filteredApprovalTickets = approvalTickets.filter(req => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            (req.ticket_number || '').toLowerCase().includes(q) ||
            (req.brand || req.device_brand || '').toLowerCase().includes(q) ||
            (req.model_number || req.device_model || '').toLowerCase().includes(q) ||
            (req.asset_id || '').toLowerCase().includes(q) ||
            (req.employee_name || '').toLowerCase().includes(q) ||
            (req.branch_name || '').toLowerCase().includes(q) ||
            (req.diagnosis || '').toLowerCase().includes(q) ||
            (req.problem_description || '').toLowerCase().includes(q)
        );
    });

    if (detailTicketId) {
        return (
            <div className="space-y-6 animate-fadeIn">
                <RepairTicketWorkspace
                    ticket={selectedTicketDetail}
                    loading={loadingTicketDetail}
                    error={ticketDetailError}
                    role="company"
                    onBack={() => {
                        setDetailTicketId(null);
                        fetchStats();
                        fetchApprovalTickets();
                    }}
                    onRefresh={() => {
                        if (detailTicketId && token) {
                            setLoadingTicketDetail(true);
                            repairApi.getRequestById(token, detailTicketId).then(res => {
                                if (res.ok && res.data?.data) setSelectedTicketDetail(res.data.data);
                            }).finally(() => setLoadingTicketDetail(false));
                        }
                    }}
                />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Title & Permanent ID Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Overview Dashboard</h1>
                    <p className="text-zinc-500 text-sm mt-1">Real-time tracking of company devices, maintenance schedules, and resolve rates.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            fetchStats(true);
                            fetchApprovalTickets();
                        }}
                        disabled={refreshing}
                        className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-300 transition-all cursor-pointer"
                        title="Refresh statistics"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin text-indigo-400' : ''} />
                        <span>Refresh</span>
                    </button>
                    {(user || selectedCompany) && (
                        <div className="flex items-center gap-3 bg-[#0c0c0c] border border-zinc-800/80 rounded-xl px-4 py-2 shrink-0 shadow-lg">
                            <div className="text-right">
                                <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 font-bold">
                                    {isAdminManagingCompany && selectedCompany ? selectedCompany.company_name : 'Permanent Corporate ID'}
                                </div>
                                <div className="text-sm font-bold font-mono text-neon-cyan tracking-wider mt-0.5">
                                    {selectedCompany?.permanent_company_id || (user?.role === 'company' && (user as any).is_amc ? `TD-AMC-C${String(user.id).padStart(3, '0')}` : `TD-C${String(selectedCompany?.id || user?.id || 0).padStart(3, '0')}`)}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Corporate Global Search Bar */}
            <div className="bg-[#0c0c0c] border border-zinc-900/80 rounded-2xl p-4 space-y-3">
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={17} />
                    <input
                        type="text"
                        placeholder="Search company tickets, devices, models, and service states..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/60 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white focus:outline-none transition-colors"
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
                {searchQuery && (
                    <div className="flex flex-wrap items-center gap-2 text-xs pt-1 text-zinc-400">
                        <span className="text-zinc-500">Jump to section with query:</span>
                        <button
                            onClick={() => navigate(`/company/repairs?search=${encodeURIComponent(searchQuery)}`)}
                            className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-indigo-400 font-semibold cursor-pointer transition-colors"
                        >
                            Search in Repairs →
                        </button>
                        <button
                            onClick={() => navigate(`/company/devices?search=${encodeURIComponent(searchQuery)}`)}
                            className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-blue-400 font-semibold cursor-pointer transition-colors"
                        >
                            Search in Assets →
                        </button>
                        <button
                            onClick={() => navigate(`/company/employees?search=${encodeURIComponent(searchQuery)}`)}
                            className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-purple-400 font-semibold cursor-pointer transition-colors"
                        >
                            Search in Staff →
                        </button>
                    </div>
                )}
            </div>

            {/* Grid of Actionable Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {cards.map((card, i) => {
                    const Icon = card.icon;
                    const isApprovalCard = card.title === 'Approval Budget';
                    return (
                        <div
                            key={i}
                            onClick={() => {
                                if (card.onClick) card.onClick();
                                else if (card.path) navigate(card.path);
                            }}
                            className={`bg-[#0c0c0c] border rounded-2xl p-5 transition-all flex justify-between items-center group cursor-pointer shadow-sm hover:shadow-md hover:scale-[1.01] ${isApprovalCard && activeTab === 'approval_budget'
                                ? 'border-amber-500/60 ring-1 ring-amber-500/30 bg-amber-500/5'
                                : 'border-zinc-900/60 hover:border-zinc-700/80'
                                }`}
                        >
                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5 text-xs text-zinc-500 uppercase font-mono tracking-wider group-hover:text-zinc-300 transition-colors">
                                    <span>{card.title}</span>
                                    <ArrowUpRight size={13} className="opacity-0 group-hover:opacity-100 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="text-3xl font-extrabold text-white font-outfit">{card.value}</div>
                                    {card.badge && (
                                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
                                            {card.badge}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[10px] text-zinc-600">{card.description}</p>
                            </div>
                            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-all shrink-0`}>
                                <Icon size={19} className="text-white" />
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Activity & Approvals Table Panel */}
                <div className="lg:col-span-2 bg-[#0c0c0c] border border-zinc-900/60 rounded-2xl p-6 space-y-6">
                    {/* Header with Navigation Tabs */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-900 pb-4">
                        <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800/80 rounded-xl p-1 overflow-x-auto">
                            <button
                                type="button"
                                onClick={() => setActiveTab('recent')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${activeTab === 'recent'
                                    ? 'bg-zinc-800 text-white shadow-sm'
                                    : 'text-zinc-400 hover:text-zinc-200'
                                    }`}
                            >
                                Recent Service Requests
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('approval_budget')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'approval_budget'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                                    : pendingApprovalVal > 0
                                        ? 'text-amber-400 hover:text-amber-300'
                                        : 'text-zinc-400 hover:text-zinc-200'
                                    }`}
                            >
                                <span>Approval Budget</span>
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${pendingApprovalVal > 0
                                    ? 'bg-amber-500 text-black'
                                    : 'bg-zinc-800 text-zinc-400'
                                    }`}>
                                    {pendingApprovalVal}
                                </span>
                            </button>
                        </div>

                        <Link
                            to={activeTab === 'approval_budget' ? '/company/repairs?filter=approval_budget' : '/company/repairs'}
                            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 group self-end sm:self-auto"
                        >
                            View in Repairs <ArrowUpRight size={14} className="transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </Link>
                    </div>

                    {/* Tab 1: Recent Service Requests */}
                    {activeTab === 'recent' && (
                        <div className="overflow-x-auto">
                            {filteredRecentRequests.length === 0 ? (
                                <div className="py-12 text-center text-zinc-600 text-sm">
                                    {searchQuery ? 'No matching tickets found for this query.' : 'No repair tickets registered.'}
                                </div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-zinc-900 text-xs text-zinc-500 uppercase tracking-widest font-mono">
                                            <th className="py-3 pr-4">Ticket</th>
                                            <th className="py-3 px-4">Device</th>
                                            <th className="py-3 px-4">Priority</th>
                                            <th className="py-3 px-4">Status</th>
                                            <th className="py-3 pl-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-900/40 text-sm text-zinc-300">
                                        {filteredRecentRequests.map((req) => (
                                            <tr
                                                key={req.id}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setDetailTicketId(req.ticket_number || req.id);
                                                }}
                                                className="hover:bg-zinc-900/20 transition-colors cursor-pointer group hover:opacity-90"
                                            >
                                                <td className="py-3.5 pr-4 font-mono font-semibold text-white group-hover:text-indigo-400 transition-colors">{req.ticket_number}</td>
                                                <td className="py-3.5 px-4">
                                                    <div className="font-semibold text-zinc-200">{req.brand}</div>
                                                    <div className="text-[11px] text-zinc-500">{req.model_number}</div>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${req.priority?.toLowerCase() === 'priority' || req.priority?.toLowerCase() === 'urgent'
                                                        ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                        : 'bg-zinc-800 text-zinc-400'
                                                        }`}>
                                                        {req.priority}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${req.status === 'completed'
                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                        : req.status === 'delivered'
                                                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                            : req.status === 'in_progress'
                                                                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                                                : req.status === 'cancelled'
                                                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                        }`}>
                                                        {req.status.replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 pl-4 text-right" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setQuickDrawerTicket(req)}
                                                        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 transition-colors cursor-pointer"
                                                        title="Quick Preview in Drawer"
                                                    >
                                                        <Eye size={13} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {/* Tab 2: Approval Budget List */}
                    {activeTab === 'approval_budget' && (
                        <div className="space-y-4">
                            {loadingApprovalTickets ? (
                                <div className="py-12 flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-b-2 border-amber-500"></div>
                                </div>
                            ) : approvalTicketsError ? (
                                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center justify-between">
                                    <span>{approvalTicketsError}</span>
                                    <button
                                        onClick={fetchApprovalTickets}
                                        className="px-2.5 py-1 bg-red-500/20 text-red-300 font-semibold rounded-lg hover:bg-red-500/30"
                                    >
                                        Retry
                                    </button>
                                </div>
                            ) : filteredApprovalTickets.length === 0 ? (
                                <div className="py-14 text-center space-y-2.5">
                                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                                        <CheckCircle2 size={24} />
                                    </div>
                                    <div className="text-sm font-bold text-white tracking-wide">
                                        No repair budgets are awaiting approval.
                                    </div>
                                    <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                                        All technician estimates have been reviewed or no pending diagnosis is awaiting company action.
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b border-zinc-900 text-[11px] text-zinc-500 uppercase tracking-widest font-mono">
                                                <th className="py-3 pr-3">Ticket & Device</th>
                                                <th className="py-3 px-3">Location & Staff</th>
                                                <th className="py-3 px-3">Technician Diagnosis</th>
                                                <th className="py-3 px-3 text-right">Approx. Budget</th>
                                                <th className="py-3 pl-3 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-900/40 text-xs text-zinc-300">
                                            {filteredApprovalTickets.map((t) => {
                                                const baseEst = parseFloat(t.estimated_cost || t.estimatedCost || 0);
                                                const addChg = parseFloat(t.additional_charges || t.additionalCharges || 0);
                                                const repCost = parseFloat(t.repair_cost || t.repairCost || 0);
                                                const totalApproxBudget = (baseEst + addChg > 0) ? (baseEst + addChg) : repCost;
                                                const isThisApproving = approvingId === t.id;

                                                return (
                                                    <tr
                                                        key={t.id}
                                                        onClick={() => setDetailTicketId(t.ticket_number || t.id)}
                                                        className="hover:bg-amber-500/5 transition-colors cursor-pointer group"
                                                    >
                                                        {/* Ticket & Device */}
                                                        <td className="py-3.5 pr-3">
                                                            <div className="font-mono font-bold text-white group-hover:text-amber-400 transition-colors flex items-center gap-1.5">
                                                                <span>{t.ticket_number || `#${t.id}`}</span>
                                                                <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                                    Pending
                                                                </span>
                                                            </div>
                                                            <div className="font-semibold text-zinc-200 mt-0.5">
                                                                {t.device_brand || t.brand} {t.device_model || t.model_number}
                                                            </div>
                                                            <div className="text-[10px] text-zinc-500 font-mono">
                                                                Tag: {t.asset_id || 'NO-TAG'} {t.device_serial ? `• SN: ${t.device_serial}` : ''}
                                                            </div>
                                                        </td>

                                                        {/* Location & Requester */}
                                                        <td className="py-3.5 px-3">
                                                            <div className="font-medium text-zinc-200">
                                                                {t.branch_name || 'Main Office'}
                                                            </div>
                                                            <div className="text-[10px] text-zinc-400">
                                                                {t.employee_name || 'Corporate Asset'}
                                                                {t.employee_department ? ` (${t.employee_department})` : ''}
                                                            </div>
                                                            {t.priority && (
                                                                <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${t.priority === 'Urgent'
                                                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                                    : 'bg-zinc-800 text-zinc-400'
                                                                    }`}>
                                                                    {t.priority}
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* Diagnosis Snippet */}
                                                        <td className="py-3.5 px-3 max-w-xs">
                                                            {t.diagnosis ? (
                                                                <p className="line-clamp-2 text-zinc-300 font-mono text-[11px] leading-tight">
                                                                    {t.diagnosis}
                                                                </p>
                                                            ) : (
                                                                <p className="text-zinc-500 italic text-[11px] line-clamp-1">
                                                                    {t.problem_description || 'Estimate calculated by service team.'}
                                                                </p>
                                                            )}
                                                            <div className="text-[10px] text-zinc-500 mt-1">
                                                                Tech: <strong className="text-zinc-400">{t.technician_name || 'Assigned'}</strong>
                                                            </div>
                                                        </td>

                                                        {/* Approximate Budget */}
                                                        <td className="py-3.5 px-3 text-right">
                                                            <div className="font-extrabold text-neon-cyan font-mono text-sm">
                                                                ₹{totalApproxBudget.toFixed(2)}
                                                            </div>
                                                            {addChg > 0 && (
                                                                <div className="text-[9px] text-zinc-500 font-mono">
                                                                    (Base ₹{baseEst.toFixed(0)} + ₹{addChg.toFixed(0)})
                                                                </div>
                                                            )}
                                                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                                                Approval Req.
                                                            </span>
                                                        </td>

                                                        {/* Actions */}
                                                        <td className="py-3.5 pl-3 text-right">
                                                            <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setQuickDrawerTicket(t)}
                                                                    className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 transition-colors cursor-pointer"
                                                                    title="Quick Preview in Drawer"
                                                                >
                                                                    <Eye size={13} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setDetailTicketId(t.ticket_number || t.id)}
                                                                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                                                                    title="Inspect diagnosis and approximate budget breakdown"
                                                                >
                                                                    Review
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => handleQuickApprove(t, e)}
                                                                    disabled={isThisApproving}
                                                                    className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                                                    title="Approve estimate"
                                                                >
                                                                    {isThisApproving ? (
                                                                        <RefreshCw size={12} className="animate-spin" />
                                                                    ) : (
                                                                        <Check size={12} />
                                                                    )}
                                                                    <span>Approve</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setRejectTicketId(t.id)}
                                                                    className="p-1 rounded-lg hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                                                                    title="Decline budget"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Analytics bar charts */}
                <div className="bg-[#0c0c0c] border border-zinc-900/60 rounded-2xl p-6 space-y-6 flex flex-col justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <BarChart3 size={18} className="text-indigo-400" />
                            <span>Asset Brands</span>
                        </h2>
                        <p className="text-xs text-zinc-500 mt-1">Distributions of tracked devices across hardware vendor brands.</p>
                    </div>

                    <div className="space-y-4 flex-1 flex flex-col justify-center">
                        {stats.brandStats.length === 0 ? (
                            <div className="py-12 text-center text-zinc-650 text-xs">
                                No brands registered in catalog yet.
                            </div>
                        ) : (
                            stats.brandStats.map((brand, i) => {
                                const totalDevices = stats.totalDevices || 1;
                                const percentage = Math.round((brand.value / totalDevices) * 100);
                                return (
                                    <div key={i} className="space-y-1.5">
                                        <div className="flex justify-between text-xs font-semibold">
                                            <span className="text-zinc-300">{brand.brand}</span>
                                            <span className="text-zinc-500">{brand.value} ({percentage}%)</span>
                                        </div>
                                        <div className="w-full bg-zinc-900 h-2.5 rounded-full overflow-hidden">
                                            <div
                                                className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                                                style={{ width: `${percentage}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="pt-4 border-t border-zinc-900/60">
                        <p className="text-[10px] text-zinc-600 leading-normal">This brand metrics updates automatically after hardware devices register or transfer branches.</p>
                    </div>
                </div>
            </div>

            {/* Quick Preview Drawer */}
            <SideDrawer
                isOpen={Boolean(quickDrawerTicket)}
                onClose={() => setQuickDrawerTicket(null)}
                title={`Ticket #${quickDrawerTicket?.ticket_number || quickDrawerTicket?.ticketNumber || ''}`}
                subtitle={`${quickDrawerTicket?.brand || quickDrawerTicket?.device_brand || ''} ${quickDrawerTicket?.model_number || quickDrawerTicket?.device_model || ''}`}
                size="xl"
                badge={{
                    text: (quickDrawerTicket?.status || 'PENDING').toUpperCase().replace('_', ' '),
                    variant: quickDrawerTicket?.status === 'completed' ? 'success' : quickDrawerTicket?.status === 'delivered' ? 'info' : quickDrawerTicket?.status === 'in_progress' ? 'info' : 'warning'
                }}
                footer={
                    <div className="flex justify-between items-center w-full">
                        <button
                            type="button"
                            onClick={() => setQuickDrawerTicket(null)}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer"
                        >
                            Close Drawer
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const tid = quickDrawerTicket?.id || quickDrawerTicket?.ticket_number;
                                setQuickDrawerTicket(null);
                                if (tid) setDetailTicketId(tid);
                            }}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/20"
                        >
                            <ArrowUpRight size={13} />
                            Open Full Workspace
                        </button>
                    </div>
                }
            >
                {quickDrawerTicket && (
                    <RepairTicketWorkspace
                        ticket={quickDrawerTicket}
                        isDrawer={true}
                        role="company"
                        onBack={() => setQuickDrawerTicket(null)}
                        onOpenFullWorkspace={(tid) => {
                            setQuickDrawerTicket(null);
                            setDetailTicketId(tid);
                        }}
                        onRefresh={() => {
                            fetchStats();
                            fetchApprovalTickets();
                            setQuickDrawerTicket(null);
                        }}
                    />
                )}
            </SideDrawer>

            {/* Decline Reason Modal */}
            <PromptModal
                isOpen={Boolean(rejectTicketId)}
                title="Decline Budget Estimate"
                message="Please state the reason for declining this repair estimate. The ticket will be held for review."
                placeholder="Reason (e.g. Budget exceeds threshold, asset scheduled for retirement...)"
                confirmText="Confirm Decline"
                cancelText="Cancel"
                variant="danger"
                isLoading={isRejecting}
                onConfirm={(reason) => handleQuickReject(reason)}
                onCancel={() => setRejectTicketId(null)}
            />
        </div>
    );
}
