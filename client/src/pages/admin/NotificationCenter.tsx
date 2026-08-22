import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { adminApi } from '@/services/api';
import { Bell, Send, Radio, Loader2, ChevronLeft, ChevronRight, Users } from 'lucide-react';

export default function NotificationCenter() {
    const { token } = useAuth();
    const [tab, setTab] = useState<'send' | 'history'>('send');
    const [form, setForm] = useState({ userId: '', title: '', message: '', targetRole: 'all' });
    const [isBroadcast, setIsBroadcast] = useState(false);
    const [sending, setSending] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [history, setHistory] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchHistory = async () => {
        if (!token) return;
        setHistoryLoading(true);
        const res = await adminApi.getNotificationHistory(token, page);
        if (res.ok && res.data) {
            setHistory((res.data as any).data?.data || []);
            setTotalPages((res.data as any).data?.pagination?.totalPages || 1);
        }
        setHistoryLoading(false);
    };

    useEffect(() => { if (tab === 'history') fetchHistory(); }, [tab, page, token]);

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
                <button onClick={() => setTab('send')} className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${tab === 'send' ? 'bg-neon-cyan text-black' : 'text-zinc-400 hover:text-white'}`}><Send size={14} className="inline mr-1.5" />Send</button>
                <button onClick={() => setTab('history')} className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${tab === 'history' ? 'bg-neon-cyan text-black' : 'text-zinc-400 hover:text-white'}`}>History</button>
            </div>

            {tab === 'send' && (
                <div className="max-w-xl">
                    <div className="border border-zinc-900 bg-zinc-900/20 rounded-2xl p-6 space-y-4">
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
                <div>
                    {historyLoading ? (
                        <div className="min-h-[30vh] flex items-center justify-center"><Loader2 className="w-6 h-6 text-neon-cyan animate-spin" /></div>
                    ) : history.length === 0 ? (
                        <div className="border border-zinc-900 bg-zinc-950/20 rounded-2xl p-16 text-center text-zinc-500 text-sm">No notifications sent yet.</div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                {history.map((n: any) => (
                                    <div key={n.id} className="border border-zinc-900 bg-zinc-900/20 rounded-xl p-4 flex items-start justify-between">
                                        <div>
                                            <div className="text-sm text-white font-semibold">{n.title}</div>
                                            <div className="text-xs text-zinc-400 mt-1">{n.message}</div>
                                            <div className="text-[10px] text-zinc-600 font-mono mt-2 flex items-center gap-2">
                                                <Users size={10} />{n.user_name || 'Unknown'} ({n.user_email || '—'})
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 ml-4">
                                            <div className={`text-[10px] font-mono font-bold ${n.is_read ? 'text-emerald-400' : 'text-amber-400'}`}>{n.is_read ? 'READ' : 'UNREAD'}</div>
                                            <div className="text-[10px] text-zinc-600 font-mono">{new Date(n.created_at).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                ))}
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
        </div>
    );
}
