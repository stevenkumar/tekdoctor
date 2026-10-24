import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { adminApi } from '@/services/api';
import { Bell, Send, Radio, Loader2, ChevronLeft, ChevronRight, Users, History, RefreshCw, Trash2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { SkeletonList } from '@/components/Skeleton';

export default function NotificationCenter() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab = searchParams.get('tab') === 'history' ? 'history' : 'send';
    const [tab, setTab] = useState<'send' | 'history'>(initialTab);
    const [form, setForm] = useState({ userId: '', title: '', message: '', targetRole: 'all' });
    const [isBroadcast, setIsBroadcast] = useState(false);
    const [sending, setSending] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [history, setHistory] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Bulk delete states
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
    const [confirmDeleteModal, setConfirmDeleteModal] = useState<{ isOpen: boolean; count: number; ids: number[] } | null>(null);

    const switchTab = (newTab: 'send' | 'history') => {
        setTab(newTab);
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (newTab === 'history') {
                next.set('tab', 'history');
            } else {
                next.delete('tab');
            }
            return next;
        });
    };

    useEffect(() => {
        const urlTab = searchParams.get('tab') === 'history' ? 'history' : 'send';
        if (urlTab !== tab) {
            setTab(urlTab);
        }
    }, [searchParams]);

    const fetchHistory = async () => {
        if (!token) return;
        setHistoryLoading(true);
        setHistoryError('');
        try {
            const res = await adminApi.getNotificationHistory(token, page);
            if (res.ok && res.data) {
                const rawData = (res.data as any).data;
                const items = Array.isArray(rawData) ? rawData : rawData?.data || [];
                const pages = rawData?.pagination?.totalPages || (res.data as any).totalPages || 1;
                setHistory(items);
                setTotalPages(pages);
            } else {
                setHistoryError(res.error || 'Failed to load notification history.');
            }
        } catch (err: any) {
            setHistoryError(err?.message || 'An error occurred while fetching history.');
        } finally {
            setHistoryLoading(false);
        }
    };

    const isAllSelected = history.length > 0 && history.every(n => selectedIds.includes(n.id));

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds([]);
        } else {
            setSelectedIds(history.map(n => n.id));
        }
    };

    const toggleSelect = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const executeBulkDelete = async () => {
        if (!confirmDeleteModal || confirmDeleteModal.ids.length === 0 || !token) return;
        setBulkDeleteLoading(true);
        try {
            const res = await adminApi.bulkDeleteNotifications(token, confirmDeleteModal.ids);
            if (res.ok) {
                toast.success(`${confirmDeleteModal.ids.length} notification(s) deleted successfully.`);
                setSelectedIds(prev => prev.filter(id => !confirmDeleteModal.ids.includes(id)));
                setConfirmDeleteModal(null);
                fetchHistory();
            } else {
                toast.error(res.error || 'Failed to delete notifications.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error occurred while deleting.');
        } finally {
            setBulkDeleteLoading(false);
        }
    };

    useEffect(() => {
        if (tab === 'history') {
            fetchHistory();
        }
    }, [tab, page, token]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        setSending(true); setErrorMsg(''); setSuccessMsg('');
        let res;
        if (isBroadcast) {
            res = await adminApi.broadcastNotification(token, { title: form.title, message: form.message, targetRole: form.targetRole });
        } else {
            res = await adminApi.sendNotification(token, { userId: Number(form.userId), title: form.title, message: form.message });
        }
        if (res.ok) {
            setSuccessMsg(isBroadcast ? `Broadcast sent to ${(res.data as any)?.data?.count || 'all'} users.` : 'Notification sent.');
            setForm({ userId: '', title: '', message: '', targetRole: 'all' });
            setTimeout(() => setSuccessMsg(''), 3000);
            if (tab === 'history') fetchHistory();
        } else {
            setErrorMsg(res.error || 'Failed to send.');
        }
        setSending(false);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight flex items-center gap-2"><Bell size={24} className="text-neon-cyan" />Notification Center</h1>
                <p className="text-xs text-zinc-500 mt-1">Send notifications to users and view history</p>
            </div>

            <div className="flex gap-1.5 bg-zinc-900/40 p-1 rounded-xl border border-zinc-900 w-fit">
                <button onClick={() => switchTab('send')} className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${tab === 'send' ? 'bg-neon-cyan text-black' : 'text-zinc-400 hover:text-white'}`}><Send size={14} className="inline mr-1.5" />Send</button>
                <button onClick={() => switchTab('history')} className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${tab === 'history' ? 'bg-neon-cyan text-black' : 'text-zinc-400 hover:text-white'}`}><History size={14} className="inline mr-1.5" />History</button>
            </div>

            {tab === 'send' && (
                <div className="max-w-xl">
                    <div className="border border-zinc-900 bg-zinc-900/20 rounded-2xl p-4 sm:p-6 space-y-4">
                        <div className="flex items-center gap-3 mb-2">
                            <button onClick={() => setIsBroadcast(false)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-all ${!isBroadcast ? 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/30' : 'border-zinc-800 text-zinc-500'}`}><Send size={12} className="inline mr-1" />Individual</button>
                            <button onClick={() => setIsBroadcast(true)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-all ${isBroadcast ? 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/30' : 'border-zinc-800 text-zinc-500'}`}><Radio size={12} className="inline mr-1" />Broadcast</button>
                        </div>

                        {errorMsg && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl">{errorMsg}</div>}
                        {successMsg && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl">{successMsg}</div>}

                        <form onSubmit={handleSend} className="space-y-4">
                            {!isBroadcast && (
                                <div className="space-y-1.5">
                                    <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">User ID</label>
                                    <input type="number" required value={form.userId} onChange={e => setForm(p => ({ ...p, userId: e.target.value }))}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan" placeholder="Enter user ID" />
                                </div>
                            )}
                            {isBroadcast && (
                                <div className="space-y-1.5">
                                    <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Target Audience</label>
                                    <select value={form.targetRole} onChange={e => setForm(p => ({ ...p, targetRole: e.target.value }))}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan cursor-pointer">
                                        <option value="all">All Users</option><option value="customer">Customers Only</option><option value="technician">Technicians Only</option><option value="company">Companies Only</option>
                                    </select>
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Title</label>
                                <input type="text" required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan" placeholder="Notification title" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Message</label>
                                <textarea required value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} rows={4}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan resize-none" placeholder="Write your notification..." />
                            </div>
                            <button type="submit" disabled={sending} className="w-full py-2.5 bg-neon-cyan hover:bg-neon-cyan text-black font-bold rounded-xl cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-sm transition-all">
                                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}{isBroadcast ? 'Broadcast' : 'Send Notification'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {tab === 'history' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-zinc-400">Sent Logs</span>
                            <span className="text-[10px] bg-zinc-800/80 text-zinc-400 px-2 py-0.5 rounded-full font-mono border border-zinc-700/50">
                                3-month retention policy
                            </span>
                        </div>
                        <button
                            onClick={fetchHistory}
                            disabled={historyLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 cursor-pointer disabled:opacity-50 transition-all"
                            title="Refresh history"
                        >
                            <RefreshCw size={13} className={historyLoading ? 'animate-spin' : ''} />
                            <span>Refresh</span>
                        </button>
                    </div>

                    {/* Bulk Selection Bar */}
                    {history.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/40 border border-zinc-900 px-4 py-2.5 rounded-xl">
                            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-zinc-300 font-medium">
                                <input
                                    type="checkbox"
                                    checked={isAllSelected}
                                    onChange={toggleSelectAll}
                                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-neon-cyan focus:ring-neon-cyan accent-neon-cyan cursor-pointer"
                                />
                                <span>Select All Visible ({history.length})</span>
                            </label>

                            {selectedIds.length > 0 && (
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-zinc-400 font-mono">
                                        <strong className="text-neon-cyan">{selectedIds.length}</strong> selected
                                    </span>
                                    <button
                                        onClick={() => setConfirmDeleteModal({ isOpen: true, count: selectedIds.length, ids: [...selectedIds] })}
                                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
                                    >
                                        <Trash2 size={13} />
                                        <span>Delete Selected ({selectedIds.length})</span>
                                    </button>
                                    <button
                                        onClick={() => setSelectedIds([])}
                                        className="text-xs text-zinc-500 hover:text-white"
                                    >
                                        Clear
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {historyError && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-between text-xs text-red-400">
                            <span>{historyError}</span>
                            <button
                                onClick={fetchHistory}
                                className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg font-semibold transition-all"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {historyLoading ? (
                        <SkeletonList count={5} />
                    ) : history.length === 0 ? (
                        <div className="border border-zinc-900 bg-zinc-950/20 rounded-2xl p-16 text-center text-zinc-500 text-sm">No notifications sent yet.</div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                {history.map((n: any) => {
                                    const isSelected = selectedIds.includes(n.id);
                                    return (
                                        <div key={n.id} className={`border rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 transition-all ${isSelected ? 'border-neon-cyan/40 bg-zinc-900/30' : 'border-zinc-900 bg-zinc-900/20'}`}>
                                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelect(n.id)}
                                                    className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-neon-cyan focus:ring-neon-cyan accent-neon-cyan cursor-pointer shrink-0"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm text-white font-semibold break-words">{n.title}</div>
                                                    <div className="text-xs text-zinc-400 mt-1 break-words leading-relaxed">{n.message}</div>
                                                    <div className="text-[10px] text-zinc-600 font-mono mt-2 flex items-center gap-2 truncate">
                                                        <Users size={10} className="shrink-0" /><span className="truncate">{n.user_name || 'Unknown'} ({n.user_email || '—'})</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 sm:ml-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/40 w-full sm:w-auto">
                                                <div className="text-left sm:text-right">
                                                    <div className={`text-[10px] font-mono font-bold ${n.is_read ? 'text-emerald-400' : 'text-amber-400'}`}>{n.is_read ? 'READ' : 'UNREAD'}</div>
                                                    <div className="text-[10px] text-zinc-600 font-mono">{new Date(n.created_at).toLocaleDateString()}</div>
                                                </div>
                                                <button
                                                    onClick={() => setConfirmDeleteModal({ isOpen: true, count: 1, ids: [n.id] })}
                                                    className="p-1.5 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 text-red-500 transition-all cursor-pointer"
                                                    title="Delete Notification"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {totalPages > 1 && (
                                <div className="flex items-center justify-center gap-2 mt-4">
                                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 border border-zinc-800 rounded-lg text-zinc-400 disabled:opacity-30 cursor-pointer"><ChevronLeft size={16} /></button>
                                    <span className="text-xs font-mono text-zinc-500">Page {page} of {totalPages}</span>
                                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 border border-zinc-800 rounded-lg text-zinc-400 disabled:opacity-30 cursor-pointer"><ChevronRight size={16} /></button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Bulk / Single Delete Confirmation Modal */}
            {confirmDeleteModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setConfirmDeleteModal(null)}>
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-white font-bold font-outfit text-base">Confirm Deletion</h3>
                            <button onClick={() => setConfirmDeleteModal(null)} className="text-zinc-500 hover:text-white cursor-pointer"><X size={18} /></button>
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                            Are you sure you want to permanently delete <strong className="text-white">{confirmDeleteModal.count}</strong> notification log(s)? This action cannot be undone.
                        </p>
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                onClick={() => setConfirmDeleteModal(null)}
                                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold cursor-pointer transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeBulkDelete}
                                disabled={bulkDeleteLoading}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all"
                            >
                                {bulkDeleteLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                Delete {confirmDeleteModal.count} Notification(s)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
