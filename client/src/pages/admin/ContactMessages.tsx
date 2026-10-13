import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { adminApi } from '@/services/api';
import {
    MessageSquare, Loader2, Trash2, Reply, ChevronLeft, ChevronRight,
    X, Send, Search, Calendar, RotateCcw, Mail, Phone, Clock,
    User, Eye, Copy, Check, ExternalLink, Tag
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { MESSAGE_MAX_LENGTH } from '@/config/constants';
import { ConfirmModal } from '@/components/ConfirmModal';

const formatDateTime = (dateStr: string | Date) => {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        return d.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    } catch {
        return String(dateStr);
    }
};

const getRelativeTime = (dateStr: string | Date) => {
    if (!dateStr) return '';
    try {
        const diffMs = Date.now() - new Date(dateStr).getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) {
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            if (diffHours === 0) {
                const diffMins = Math.floor(diffMs / (1000 * 60));
                return `${Math.max(1, diffMins)}m ago`;
            }
            return `${diffHours}h ago`;
        }
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 30) return `${diffDays}d ago`;
        return '';
    } catch {
        return '';
    }
};

export default function ContactMessages() {
    const { token } = useAuth();
    const [contacts, setContacts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [deleteLoading, setDeleteLoading] = useState<number | null>(null);
    const [deleteMessageId, setDeleteMessageId] = useState<number | null>(null);
    const [replyModal, setReplyModal] = useState<any | null>(null);
    const [replyForm, setReplyForm] = useState({ subject: '', message: '' });
    const [replySending, setReplySending] = useState(false);

    // Detail Drawer state & 1-click copy feedback
    const [activeContact, setActiveContact] = useState<any | null>(null);
    const [copiedField, setCopiedField] = useState<'email' | 'phone' | null>(null);

    const handleCopy = (text: string, field: 'email' | 'phone') => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        toast.success(`Copied ${field} to clipboard`);
        setTimeout(() => setCopiedField(null), 2000);
    };

    // Search and Date Range states
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [appliedStartDate, setAppliedStartDate] = useState('');
    const [appliedEndDate, setAppliedEndDate] = useState('');

    const fetchContacts = async () => {
        if (!token) return;
        setLoading(true);
        const res = await adminApi.getContacts(
            token,
            page,
            20,
            searchQuery || undefined,
            appliedStartDate || undefined,
            appliedEndDate || undefined
        );
        if (res.ok && res.data) {
            setContacts((res.data as any).data?.data || []);
            setTotalPages((res.data as any).data?.pagination?.totalPages || 1);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchContacts();
    }, [token, page, searchQuery, appliedStartDate, appliedEndDate]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchQuery(searchInput.trim());
        setPage(1);
    };

    const handleApplyDateRange = () => {
        if (startDate && endDate && startDate > endDate) {
            toast.error('Start date cannot be after end date');
            return;
        }
        setAppliedStartDate(startDate);
        setAppliedEndDate(endDate);
        setPage(1);
    };

    const handleResetDateRange = () => {
        setStartDate('');
        setEndDate('');
        setAppliedStartDate('');
        setAppliedEndDate('');
        setPage(1);
    };

    const handleClearAllFilters = () => {
        setSearchInput('');
        setSearchQuery('');
        handleResetDateRange();
    };

    // Bulk delete states and handlers
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
    const [confirmDeleteModal, setConfirmDeleteModal] = useState<{ isOpen: boolean; count: number; ids: number[] } | null>(null);

    const isAllSelected = contacts.length > 0 && contacts.every(c => selectedIds.includes(c.id));

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds([]);
        } else {
            setSelectedIds(contacts.map(c => c.id));
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
            const res = await adminApi.bulkDeleteContacts(token, confirmDeleteModal.ids);
            if (res.ok) {
                toast.success(`${confirmDeleteModal.ids.length} message(s) deleted successfully.`);
                setSelectedIds(prev => prev.filter(id => !confirmDeleteModal.ids.includes(id)));
                if (activeContact && confirmDeleteModal.ids.includes(activeContact.id)) {
                    setActiveContact(null);
                }
                setConfirmDeleteModal(null);
                fetchContacts();
            } else {
                toast.error(res.error || 'Failed to delete messages.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error occurred while deleting.');
        } finally {
            setBulkDeleteLoading(false);
        }
    };

    const handleDelete = (id: number) => {
        setDeleteMessageId(id);
    };

    const handleConfirmDelete = async () => {
        if (!token || deleteMessageId === null) return;
        setDeleteLoading(deleteMessageId);
        const res = await adminApi.deleteContact(token, deleteMessageId);
        if (res.ok) {
            setContacts(prev => prev.filter(c => c.id !== deleteMessageId));
            setSelectedIds(prev => prev.filter(item => item !== deleteMessageId));
            if (activeContact?.id === deleteMessageId) {
                setActiveContact(null);
            }
            toast.success('Message deleted');
            setDeleteMessageId(null);
        } else {
            toast.error('Failed to delete message');
        }
        setDeleteLoading(null);
    };

    const handleReply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token || !replyModal) return;
        if (replyForm.message.length > MESSAGE_MAX_LENGTH) {
            toast.error(`Reply message cannot exceed ${MESSAGE_MAX_LENGTH} characters.`);
            return;
        }
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

    const hasActiveFilters = Boolean(searchQuery || appliedStartDate || appliedEndDate);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight flex items-center gap-2"><MessageSquare size={24} className="text-neon-cyan" />Contact Messages</h1>
                    <p className="text-xs text-zinc-500 mt-1">View and respond to contact form submissions</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] bg-zinc-900 text-zinc-400 px-3 py-1 rounded-full font-mono border border-zinc-800">
                        6-month auto-cleanup
                    </span>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                        type="text"
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                        placeholder="Search by name, email, subject, message..."
                        className="w-full bg-zinc-900/40 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-neon-cyan"
                    />
                    {searchInput && (
                        <button
                            type="button"
                            onClick={() => { setSearchInput(''); setSearchQuery(''); setPage(1); }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                        >
                            <X size={13} />
                        </button>
                    )}
                </form>

                <div className="flex flex-wrap items-center gap-2 bg-zinc-900/30 p-2 rounded-xl border border-zinc-900">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <Calendar size={13} className="text-neon-cyan" />
                        <span className="font-semibold">Date Range:</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-zinc-500 uppercase font-mono">From</span>
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-neon-cyan [color-scheme:dark]"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-zinc-500 uppercase font-mono">To</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-neon-cyan [color-scheme:dark]"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={handleApplyDateRange}
                            className="px-3 py-1 bg-neon-cyan text-black text-xs font-bold rounded-lg hover:bg-neon-cyan/90 cursor-pointer transition-all"
                        >
                            Apply
                        </button>
                        {(appliedStartDate || appliedEndDate) && (
                            <button
                                type="button"
                                onClick={handleResetDateRange}
                                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg cursor-pointer transition-all flex items-center gap-1"
                                title="Reset date filter"
                            >
                                <RotateCcw size={12} />
                                <span>Reset</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {hasActiveFilters && (
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-500">Active filters:</span>
                    {searchQuery && (
                        <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-1 text-[11px]">
                            Query: &quot;{searchQuery}&quot;
                            <button onClick={() => { setSearchInput(''); setSearchQuery(''); setPage(1); }} className="hover:text-white"><X size={11} /></button>
                        </span>
                    )}
                    {(appliedStartDate || appliedEndDate) && (
                        <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-1 text-[11px]">
                            Date: {appliedStartDate || 'Any'} to {appliedEndDate || 'Today'}
                            <button onClick={handleResetDateRange} className="hover:text-white"><X size={11} /></button>
                        </span>
                    )}
                    <button onClick={handleClearAllFilters} className="text-xs text-neon-cyan hover:underline ml-2">Clear all</button>
                </div>
            )}

            {/* Selection Bar / Select All */}
            {contacts.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/40 border border-zinc-900 px-4 py-2.5 rounded-xl">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-zinc-300 font-medium">
                        <input
                            type="checkbox"
                            checked={isAllSelected}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-neon-cyan focus:ring-neon-cyan accent-neon-cyan cursor-pointer"
                        />
                        <span>Select All Visible ({contacts.length})</span>
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

            {loading ? (
                <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="w-8 h-8 text-neon-cyan animate-spin" /></div>
            ) : contacts.length === 0 ? (
                <div className="border border-zinc-900 bg-zinc-950/20 rounded-2xl p-16 text-center text-zinc-500 text-sm">
                    {hasActiveFilters ? 'No contact messages matched your search criteria.' : 'No contact messages yet.'}
                </div>
            ) : (
                <div className="space-y-3">
                    {contacts.map((c: any) => {
                        const isSelected = selectedIds.includes(c.id);
                        return (
                            <div
                                key={c.id}
                                onClick={() => setActiveContact(c)}
                                className={`border rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group ${
                                    isSelected
                                        ? 'border-neon-cyan/50 bg-zinc-900/40 shadow-lg shadow-cyan-950/20'
                                        : 'border-zinc-800/60 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/30'
                                }`}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleSelect(c.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-neon-cyan focus:ring-neon-cyan accent-neon-cyan cursor-pointer shrink-0"
                                        />

                                        {/* Sender Avatar Initial */}
                                        <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-neon-cyan font-outfit uppercase shrink-0 shadow-sm">
                                            {c.name?.charAt(0) || 'U'}
                                        </div>

                                        {/* Sender Identity & Metadata */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm sm:text-base font-bold text-white font-outfit truncate group-hover:text-neon-cyan transition-colors">
                                                    {c.name}
                                                </span>
                                                {c.subject ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-semibold truncate max-w-[200px]">
                                                        <Tag size={10} className="shrink-0" />
                                                        <span className="truncate">{c.subject}</span>
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60 text-zinc-400">
                                                        General Inquiry
                                                    </span>
                                                )}
                                            </div>

                                            {/* Email and Phone */}
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-zinc-400 font-mono">
                                                <a
                                                    href={`mailto:${c.email}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="flex items-center gap-1 text-zinc-400 hover:text-neon-cyan transition-colors"
                                                    title="Click to send email"
                                                >
                                                    <Mail size={12} className="text-zinc-500 shrink-0" />
                                                    <span className="truncate max-w-[220px]">{c.email}</span>
                                                </a>
                                                {c.phone && (
                                                    <a
                                                        href={`tel:${c.phone}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="flex items-center gap-1 text-zinc-400 hover:text-neon-cyan transition-colors"
                                                        title="Click to call"
                                                    >
                                                        <Phone size={12} className="text-zinc-500 shrink-0" />
                                                        <span>{c.phone}</span>
                                                    </a>
                                                )}
                                            </div>

                                            {/* Message Content Preview (Snippet) */}
                                            <div className="mt-3 bg-black/30 border border-zinc-800/70 rounded-xl p-3 text-xs text-zinc-300 leading-relaxed font-sans line-clamp-2 italic break-words">
                                                &quot;{c.message}&quot;
                                            </div>

                                            {/* Submission Date & Drilldown Hint */}
                                            {/* <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-900 text-[11px] text-zinc-500 font-mono">
                                                <div className="flex items-center gap-1.5">
                                                    <Clock size={12} className="text-zinc-500 shrink-0" />
                                                    <span>{formatDateTime(c.created_at)}</span>
                                                    {getRelativeTime(c.created_at) && (
                                                        <span className="text-zinc-600">({getRelativeTime(c.created_at)})</span>
                                                    )}
                                                </div>
                                                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-zinc-500 group-hover:text-neon-cyan transition-colors">
                                                    Open full details <ChevronRight size={12} />
                                                </span>
                                            </div> */}
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center sm:flex-col justify-end gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-900" onClick={(e) => e.stopPropagation()}>
                                        {/* <button
                                            type="button"
                                            onClick={() => setActiveContact(c)}
                                            className="px-3 py-1.5 bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/30 text-neon-cyan rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                                            title="View complete message"
                                        >
                                            <Eye size={13} />
                                            <span>View</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setReplyModal(c);
                                                setReplyForm({ subject: `Re: ${c.subject || 'Contact Form Inquiry'}`, message: '' });
                                            }}
                                            className="p-1.5 sm:px-2.5 sm:py-1.5 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-750 rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
                                            title="Reply by email"
                                        >
                                            <Reply size={13} />
                                            <span className="hidden sm:inline">Reply</span>
                                        </button> */}
                                        <button
                                            type="button"
                                            onClick={() => setConfirmDeleteModal({ isOpen: true, count: 1, ids: [c.id] })}
                                            disabled={deleteLoading === c.id}
                                            className="p-1.5 sm:px-2.5 sm:py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
                                            title="Delete message"
                                        >
                                            {deleteLoading === c.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                            <span className="hidden sm:inline">Delete</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 border border-zinc-800 rounded-lg text-zinc-400 disabled:opacity-30 cursor-pointer"><ChevronLeft size={16} /></button>
                    <span className="text-xs font-mono text-zinc-500">Page {page} of {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 border border-zinc-800 rounded-lg text-zinc-400 disabled:opacity-30 cursor-pointer"><ChevronRight size={16} /></button>
                </div>
            )}

            {/* Right-Side Slide-Over Detail Drawer */}
            {activeContact && (
                <div className="fixed inset-0 z-50 overflow-hidden" onClick={() => setActiveContact(null)}>
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity" />
                    <div className="fixed inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10">
                        <div
                            className="w-screen max-w-xl bg-[#0c0c0e] border-l border-zinc-800 shadow-2xl flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Drawer Header */}
                            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/40">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center text-neon-cyan">
                                        <MessageSquare size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-white font-outfit">Contact Message Details</h3>
                                        <span className="text-[11px] font-mono text-zinc-500">ID: #MSG-{activeContact.id}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setActiveContact(null)}
                                    className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                                    title="Close details"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Scrollable Drawer Content */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
                                {/* Sender Profile Card */}
                                <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
                                    <div className="flex items-center gap-3 border-b border-zinc-800/60 pb-3">
                                        <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-750 flex items-center justify-center font-bold text-xl text-neon-cyan font-outfit uppercase shrink-0">
                                            {activeContact.name?.charAt(0) || 'U'}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">Sender Name</span>
                                            <h4 className="text-base font-bold text-white font-outfit truncate">{activeContact.name}</h4>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                                        {/* Email Address */}
                                        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3 flex flex-col justify-between gap-1.5">
                                            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                                                <Mail size={11} className="text-neon-cyan" /> Email Address
                                            </span>
                                            <div className="flex items-center justify-between gap-2">
                                                <a
                                                    href={`mailto:${activeContact.email}`}
                                                    className="font-mono text-zinc-200 hover:text-neon-cyan transition-colors truncate"
                                                    title="Send email"
                                                >
                                                    {activeContact.email}
                                                </a>
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopy(activeContact.email, 'email')}
                                                    className="p-1 text-zinc-500 hover:text-white rounded hover:bg-zinc-800 transition-colors shrink-0"
                                                    title="Copy email"
                                                >
                                                    {copiedField === 'email' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Phone Number */}
                                        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3 flex flex-col justify-between gap-1.5">
                                            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                                                <Phone size={11} className="text-neon-cyan" /> Phone Number
                                            </span>
                                            <div className="flex items-center justify-between gap-2">
                                                {activeContact.phone ? (
                                                    <>
                                                        <a
                                                            href={`tel:${activeContact.phone}`}
                                                            className="font-mono text-zinc-200 hover:text-neon-cyan transition-colors truncate"
                                                            title="Call number"
                                                        >
                                                            {activeContact.phone}
                                                        </a>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCopy(activeContact.phone, 'phone')}
                                                            className="p-1 text-zinc-500 hover:text-white rounded hover:bg-zinc-800 transition-colors shrink-0"
                                                            title="Copy phone"
                                                        >
                                                            {copiedField === 'phone' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <span className="font-mono text-zinc-500">Not provided</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Submitted Timestamp */}
                                    <div className="flex items-center gap-2 pt-1 text-xs text-zinc-400 font-mono">
                                        <Clock size={13} className="text-zinc-500 shrink-0" />
                                        <span>Submitted: <strong className="text-zinc-300 font-normal">{formatDateTime(activeContact.created_at)}</strong></span>
                                        {getRelativeTime(activeContact.created_at) && (
                                            <span className="text-zinc-500">({getRelativeTime(activeContact.created_at)})</span>
                                        )}
                                    </div>
                                </div>

                                {/* Subject Section */}
                                <div className="space-y-1.5">
                                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                                        <Tag size={11} className="text-neon-cyan" /> Subject / Category
                                    </span>
                                    <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl px-4 py-3 text-sm text-white font-medium">
                                        {activeContact.subject || 'General Contact Inquiry'}
                                    </div>
                                </div>

                                {/* Complete Message Content */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                                            <MessageSquare size={11} className="text-neon-cyan" /> Full Message Content
                                        </span>
                                        <span className="text-[10px] font-mono text-zinc-500">
                                            {activeContact.message?.length || 0} characters
                                        </span>
                                    </div>
                                    <div className="bg-black/50 border border-zinc-800/60 rounded-2xl p-5 text-sm text-zinc-200 leading-relaxed font-sans whitespace-pre-wrap break-words break-all select-text max-h-[45vh] overflow-y-auto shadow-inner">
                                        {activeContact.message}
                                    </div>
                                </div>
                            </div>

                            {/* Drawer Footer Actions */}
                            <div className="p-4 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setConfirmDeleteModal({ isOpen: true, count: 1, ids: [activeContact.id] });
                                    }}
                                    className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                    <Trash2 size={13} />
                                    <span>Delete Message</span>
                                </button>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setActiveContact(null)}
                                        className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                                    >
                                        Close
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setReplyModal(activeContact);
                                            setReplyForm({ subject: `Re: ${activeContact.subject || 'Contact Form Inquiry'}`, message: '' });
                                        }}
                                        className="btn-neon px-5 py-2.5 text-xs flex items-center gap-2 font-bold cursor-pointer"
                                    >
                                        <Reply size={13} />
                                        <span>Reply to Sender</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
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
                            Are you sure you want to permanently delete <strong className="text-white">{confirmDeleteModal.count}</strong> contact message(s)? This action cannot be undone.
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
                                Delete {confirmDeleteModal.count} Message(s)
                            </button>
                        </div>
                    </div>
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
                            <div>
                                <div className="flex items-center justify-between mb-1.5 px-0.5">
                                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Your Reply</span>
                                    <span className={`text-[10px] font-mono ${replyForm.message.length > MESSAGE_MAX_LENGTH ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
                                        {replyForm.message.length} / {MESSAGE_MAX_LENGTH}
                                    </span>
                                </div>
                                <textarea required maxLength={MESSAGE_MAX_LENGTH} value={replyForm.message} onChange={e => setReplyForm(p => ({ ...p, message: e.target.value }))} rows={4}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan resize-none" placeholder="Your reply..." />
                            </div>
                            <button type="submit" disabled={replySending} className="w-full py-2.5 bg-neon-cyan hover:bg-neon-cyan text-black font-bold rounded-xl cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-sm transition-all">
                                {replySending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Send Reply
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Contact Modal */}
            <ConfirmModal
                isOpen={deleteMessageId !== null}
                title="Delete Contact Inquiry"
                message="Are you sure you want to permanently delete this contact inquiry message?"
                confirmText="Delete Message"
                variant="danger"
                isLoading={deleteLoading === deleteMessageId}
                onConfirm={handleConfirmDelete}
                onCancel={() => setDeleteMessageId(null)}
            />
        </div>
    );
}
