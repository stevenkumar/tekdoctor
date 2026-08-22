import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { adminApi } from '@/services/api';
import { MessageSquare, Loader2, Trash2, Reply, ChevronLeft, ChevronRight, X, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function ContactMessages() {
    const { token } = useAuth();
    const [contacts, setContacts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [deleteLoading, setDeleteLoading] = useState<number | null>(null);
    const [replyModal, setReplyModal] = useState<any | null>(null);
    const [replyForm, setReplyForm] = useState({ subject: '', message: '' });
    const [replySending, setReplySending] = useState(false);

    const fetchContacts = async () => {
        if (!token) return;
        setLoading(true);
        const res = await adminApi.getContacts(token, page);
        if (res.ok && res.data) {
            setContacts((res.data as any).data?.data || []);
            setTotalPages((res.data as any).data?.pagination?.totalPages || 1);
        }
        setLoading(false);
    };

    useEffect(() => { fetchContacts(); }, [token, page]);

    const handleDelete = async (id: number) => {
        if (!token || !confirm('Delete this contact message?')) return;
        setDeleteLoading(id);
        const res = await adminApi.deleteContact(token, id);
        if (res.ok) {
            setContacts(prev => prev.filter(c => c.id !== id));
            toast.success('Message deleted');
        } else {
            toast.error('Failed to delete message');
        }
        setDeleteLoading(null);
    };

    const handleReply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token || !replyModal) return;
        setReplySending(true);
        const res = await adminApi.replyToContact(token, replyModal.id, replyForm);
        if (res.ok) {
            setReplyModal(null);
            setReplyForm({ subject: '', message: '' });
            toast.success('Reply sent successfully!');
        } else {
            toast.error(res.error || 'Failed to send reply.');
        }
        setReplySending(false);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight flex items-center gap-2"><MessageSquare size={24} className="text-neon-cyan" />Contact Messages</h1>
                <p className="text-xs text-zinc-500 mt-1">View and respond to contact form submissions</p>
            </div>

            {loading ? (
                <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="w-8 h-8 text-neon-cyan animate-spin" /></div>
            ) : contacts.length === 0 ? (
                <div className="border border-zinc-900 bg-zinc-950/20 rounded-2xl p-16 text-center text-zinc-500 text-sm">No contact messages yet.</div>
            ) : (
                <div className="space-y-3">
                    {contacts.map((c: any) => (
                        <div key={c.id} className="border border-zinc-900 bg-zinc-900/20 rounded-2xl p-5">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-sm text-white font-semibold">{c.name}</div>
                                    <div className="text-xs text-zinc-500 mt-0.5">{c.email}{c.phone ? ` · ${c.phone}` : ''}</div>
                                    {c.subject && <div className="text-xs text-neon-cyan font-medium mt-1">{c.subject}</div>}
                                    <p className="text-sm text-zinc-300 mt-2 whitespace-pre-wrap">{c.message}</p>
                                    <div className="text-[10px] text-zinc-600 font-mono mt-2">{new Date(c.created_at).toLocaleString()}</div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 ml-4">
                                    <button onClick={() => { setReplyModal(c); setReplyForm({ subject: `Re: ${c.subject || 'Contact Form'}`, message: '' }); }} className="p-1.5 bg-neon-cyan/10 border border-neon-cyan/20 rounded-lg hover:bg-neon-cyan/20 text-neon-cyan transition-all cursor-pointer" title="Reply"><Reply size={13} /></button>
                                    <button onClick={() => handleDelete(c.id)} disabled={deleteLoading === c.id} className="p-1.5 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 text-red-500 transition-all cursor-pointer">
                                        {deleteLoading === c.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 border border-zinc-800 rounded-lg text-zinc-400 disabled:opacity-30 cursor-pointer"><ChevronLeft size={16} /></button>
                    <span className="text-xs font-mono text-zinc-500">Page {page} of {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 border border-zinc-800 rounded-lg text-zinc-400 disabled:opacity-30 cursor-pointer"><ChevronRight size={16} /></button>
                </div>
            )}

            {/* Reply Modal */}
            {replyModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setReplyModal(null)}>
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-white font-bold font-outfit">Reply to {replyModal.name}</h3>
                            <button onClick={() => setReplyModal(null)} className="text-zinc-500 hover:text-white cursor-pointer"><X size={18} /></button>
                        </div>
                        <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-3 text-xs text-zinc-400"><strong>Original:</strong> {replyModal.message}</div>
                        <form onSubmit={handleReply} className="space-y-3">
                            <input type="text" required value={replyForm.subject} onChange={e => setReplyForm(p => ({ ...p, subject: e.target.value }))}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan" placeholder="Subject" />
                            <textarea required value={replyForm.message} onChange={e => setReplyForm(p => ({ ...p, message: e.target.value }))} rows={4}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan resize-none" placeholder="Your reply..." />
                            <button type="submit" disabled={replySending} className="w-full py-2.5 bg-neon-cyan hover:bg-neon-cyan text-black font-bold rounded-xl cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-sm transition-all">
                                {replySending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Send Reply
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
