import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    Smartphone, Wrench, AlertCircle, CheckCircle,
    Clock, ArrowUpRight, BarChart3, AlertTriangle
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
        cancelled: number;
        total: number;
    };
    recentRequests: Ticket[];
    brandStats: BrandStat[];
}

export default function CompanyDashboard() {
    const { token, user } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch('http://localhost:5000/api/company/stats', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const json = await res.json();
                if (json.success) {
                    setStats(json.data);
                } else {
                    setError(json.message);
                }
            } catch (err) {
                setError('Failed to fetch dashboard statistics.');
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [token]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    if (error || !stats) {
        return (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-2">
                <AlertTriangle size={18} />
                <span>{error || 'An error occurred while loading dashboard statistics.'}</span>
            </div>
        );
    }

    const cards = [
        {
            title: 'Total Devices',
            value: stats.totalDevices,
            icon: Smartphone,
            color: 'from-blue-500 to-indigo-600',
            description: 'Asset catalog count'
        },
        {
            title: 'Pending Tickets',
            value: stats.ticketCounts.pending,
            icon: AlertCircle,
            color: 'from-amber-400 to-orange-500',
            description: 'Awaiting repair review'
        },
        {
            title: 'Active Repairs',
            value: stats.ticketCounts.in_progress,
            icon: Clock,
            color: 'from-violet-500 to-fuchsia-600',
            description: 'Currently on technician workbench'
        },
        {
            title: 'Completed Repairs',
            value: stats.ticketCounts.completed,
            icon: CheckCircle,
            color: 'from-emerald-400 to-teal-500',
            description: 'Resolved business assets'
        }
    ];

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Title */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Overview Dashboard</h1>
                    <p className="text-zinc-500 text-sm mt-1">Real-time tracking of company devices, maintenance schedules, and resolve rates.</p>
                </div>
                {user && (
                    <div className="flex items-center gap-3 bg-[#0c0c0c] border border-zinc-800/80 rounded-xl px-4 py-3 shrink-0 shadow-lg">
                        <div className="text-right">
                            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Permanent Corporate ID</div>
                            <div className="text-sm font-bold font-mono text-neon-cyan tracking-wider mt-0.5">
                                {user.role === 'company' ? 'TD-C' : 'TD'}-{String(user.id).padStart(3, '0')}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Grid of stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {cards.map((card, i) => {
                    const Icon = card.icon;
                    return (
                        <div key={i} className="bg-[#0c0c0c] border border-zinc-900/60 rounded-2xl p-5 hover:border-zinc-800 transition-all flex justify-between items-center group">
                            <div className="space-y-2">
                                <span className="text-xs text-zinc-500 uppercase font-mono tracking-wider">{card.title}</span>
                                <div className="text-3xl font-extrabold text-white font-outfit">{card.value}</div>
                                <p className="text-[10px] text-zinc-600">{card.description}</p>
                            </div>
                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-all shrink-0`}>
                                <Icon size={20} className="text-white" />
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Tickets table */}
                <div className="lg:col-span-2 bg-[#0c0c0c] border border-zinc-900/60 rounded-2xl p-6 space-y-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-bold text-white">Recent Service Requests</h2>
                            <p className="text-xs text-zinc-500">Overview of the last 5 submitted maintenance requests.</p>
                        </div>
                        <Link to="/company/repairs" className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 group">
                            View All <ArrowUpRight size={14} className="transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </Link>
                    </div>

                    <div className="overflow-x-auto">
                        {stats.recentRequests.length === 0 ? (
                            <div className="py-12 text-center text-zinc-600 text-sm">
                                No repair tickets registered.
                            </div>
                        ) : (
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-zinc-900 text-xs text-zinc-500 uppercase tracking-widest font-mono">
                                        <th className="py-3 pr-4">Ticket</th>
                                        <th className="py-3 px-4">Device</th>
                                        <th className="py-3 px-4">Priority</th>
                                        <th className="py-3 pl-4">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900/40 text-sm text-zinc-300">
                                    {stats.recentRequests.map((req) => (
                                        <tr key={req.id} onClick={(e) => { e.preventDefault(); navigate(`/repair/status/?id=${req.ticket_number || req.id}`); }} className="hover:bg-zinc-900/10 transition-colors cursor-pointer group hover:opacity-80">
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
                                            <td className="py-3.5 pl-4">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${req.status === 'completed'
                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                    : req.status === 'in_progress'
                                                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                                        : req.status === 'cancelled'
                                                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                    }`}>
                                                    {req.status.replace('_', ' ')}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
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
        </div>
    );
}
