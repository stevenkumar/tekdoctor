import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Clock, Search, ShieldAlert, ArrowLeftRight, Terminal, User, Smartphone, MapPin } from 'lucide-react';

interface ActivityLog {
    id: number;
    action: string;
    target_type: string | null;
    target_id: number | null;
    details: any;
    ip_address: string | null;
    created_at: string;
}

interface Pagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export default function CompanyActivityLogs() {
    const { token } = useAuth();
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState<Pagination | null>(null);

    const fetchLogs = async (page: number) => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`http://localhost:5000/api/company/activity-logs?page=${page}&limit=15`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success) {
                setLogs(json.data.data);
                setPagination(json.data.pagination);
            } else {
                setError(json.message);
            }
        } catch (err) {
            setError('Failed to load activity logs.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) {
            fetchLogs(currentPage);
        }
    }, [token, currentPage]);

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };

    const humanizeAction = (action: string) => {
        return action
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    const getActionTypeInfo = (action: string) => {
        if (action.includes('device')) {
            return { color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: Smartphone };
        }
        if (action.includes('employee')) {
            return { color: 'text-violet-400 bg-violet-500/10 border-violet-500/20', icon: User };
        }
        if (action.includes('branch')) {
            return { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: MapPin };
        }
        if (action.includes('profile')) {
            return { color: 'text-amber-400 bg-amber-500/10 border-amber-500/25', icon: Terminal };
        }
        return { color: 'text-zinc-400 bg-zinc-800/40 border-zinc-700/30', icon: Clock };
    };

    const renderDetails = (log: ActivityLog) => {
        if (!log.details) return <span className="text-zinc-650">—</span>;

        let detailsObj = log.details;
        if (typeof log.details === 'string') {
            try {
                detailsObj = JSON.parse(log.details);
            } catch {
                return <span className="text-zinc-400 truncate max-w-[200px] inline-block">{log.details}</span>;
            }
        }

        const keys = Object.keys(detailsObj);
        if (keys.length === 0) return <span className="text-zinc-650">—</span>;

        return (
            <div className="flex flex-wrap gap-1 text-[11px]">
                {keys.map((k) => (
                    <span key={k} className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">
                        {k}: <span className="text-zinc-300 font-semibold">{String(detailsObj[k])}</span>
                    </span>
                ))}
            </div>
        );
    };

    const filteredLogs = logs.filter(log => {
        const query = search.toLowerCase();
        const actionMatch = log.action.toLowerCase().includes(query);
        const typeMatch = log.target_type?.toLowerCase().includes(query) || false;
        const detailsString = typeof log.details === 'string' ? log.details : JSON.stringify(log.details || {});
        const detailsMatch = detailsString.toLowerCase().includes(query);
        return actionMatch || typeMatch || detailsMatch;
    });

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Title Block */}
            <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                        <Terminal className="text-indigo-400 shrink-0" size={28} />
                        <span>Security & Activity Audit Logs</span>
                    </h1>
                    <p className="text-zinc-500 text-sm mt-1">
                        Historical ledger of all profile updates, branch creation, employee additions, and asset modifications.
                    </p>
                </div>
            </div>

            {/* Error or No Logs */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-2">
                    <ShieldAlert size={18} />
                    <span>{error}</span>
                </div>
            )}

            {/* List and Tools */}
            <div className="bg-[#0c0c0c] border border-zinc-900/60 rounded-2xl p-6 space-y-6">

                {/* Search Bar */}
                <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-900/80 px-4 py-2.5 rounded-xl max-w-md focus-within:border-zinc-800 transition-colors">
                    <Search className="text-zinc-500 shrink-0" size={18} />
                    <input
                        type="text"
                        placeholder="Search logs by action, details, type..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-transparent text-white border-0 outline-none text-sm w-full placeholder-zinc-650"
                    />
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="py-16 text-center text-zinc-600 text-sm">
                        No activity records found matching query parameters.
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-zinc-900 text-xs text-zinc-500 uppercase tracking-widest font-mono">
                                        <th className="py-3 px-4">Action</th>
                                        <th className="py-3 px-4">Entity Type</th>
                                        <th className="py-3 px-4">Target ID</th>
                                        <th className="py-3 px-4">Event Metadata</th>
                                        <th className="py-3 px-4 font-mono font-medium">IP Address</th>
                                        <th className="py-3 px-4 text-right">Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900/40 text-sm text-zinc-300">
                                    {filteredLogs.map((log) => {
                                        const { color, icon: Icon } = getActionTypeInfo(log.action);
                                        return (
                                            <tr key={log.id} className="hover:bg-zinc-900/10 transition-colors">
                                                <td className="py-3.5 px-4 font-semibold text-white">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${color}`}>
                                                        <Icon size={12} className="shrink-0" />
                                                        {humanizeAction(log.action)}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4 text-zinc-400 font-mono text-xs">
                                                    {log.target_type || '—'}
                                                </td>
                                                <td className="py-3.5 px-4 text-zinc-400 font-mono text-xs">
                                                    {log.target_id || '—'}
                                                </td>
                                                <td className="py-3.5 px-4 max-w-[300px]">
                                                    {renderDetails(log)}
                                                </td>
                                                <td className="py-3.5 px-4 text-zinc-500 font-mono text-xs">
                                                    {log.ip_address || '—'}
                                                </td>
                                                <td className="py-3.5 px-4 text-zinc-500 text-right text-xs">
                                                    {new Date(log.created_at).toLocaleString()}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {pagination && pagination.totalPages > 1 && (
                            <div className="flex items-center justify-between border-t border-zinc-900/50 pt-4">
                                <span className="text-zinc-500 text-xs font-mono">
                                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handlePageChange(pagination.page - 1)}
                                        disabled={pagination.page === 1}
                                        className="px-3 py-1.5 text-xs bg-zinc-950 border border-zinc-900 rounded-lg text-zinc-400 hover:text-white disabled:pointer-events-none disabled:opacity-40 transition-colors"
                                    >
                                        Prev
                                    </button>
                                    <button
                                        onClick={() => handlePageChange(pagination.page + 1)}
                                        disabled={pagination.page === pagination.totalPages}
                                        className="px-3 py-1.5 text-xs bg-zinc-950 border border-zinc-900 rounded-lg text-zinc-400 hover:text-white disabled:pointer-events-none disabled:opacity-40 transition-colors"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
