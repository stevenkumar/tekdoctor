import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { testimonialApi } from '@/services/api';
import { toast } from 'react-hot-toast';
import { Loader2, Star, Trash2, CheckCircle2, MessageSquare, Edit2, X, Save } from 'lucide-react';

export default function ReviewsManagement() {
    const { token } = useAuth();
    const [reviewsList, setReviewsList] = useState<any[]>([]);
    const [reviewsLoading, setReviewsLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<number | null>(null);

    // Edit state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editData, setEditData] = useState<{ id: number, comment: string, rating: number } | null>(null);
    const [editSaving, setEditSaving] = useState(false);

    const fetchReviews = async () => {
        if (!token) return;
        setReviewsLoading(true);
        const res = await testimonialApi.getAllAdmin(token);
        if (res.ok && res.data) {
            setReviewsList((res.data as any).data || []);
        }
        setReviewsLoading(false);
    };

    useEffect(() => {
        fetchReviews();
    }, [token]);

    const handleApproveToggle = async (id: number, currentApproved: boolean) => {
        if (!token) return;
        setActionLoading(id);
        const res = await testimonialApi.approve(token, id, !currentApproved);
        if (res.ok) {
            fetchReviews();
        } else {
            toast.error('Failed to modify review status.');
        }
        setActionLoading(null);
    };

    const handleDeleteReview = async (id: number) => {
        if (!confirm('Are you sure you want to delete this review?')) return;
        if (!token) return;
        setActionLoading(id);
        const res = await testimonialApi.delete(token, id);
        if (res.ok) {
            fetchReviews();
        } else {
            toast.error('Failed to delete review.');
        }
        setActionLoading(null);
    };

    const handleEditSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token || !editData) return;

        setEditSaving(true);
        const res = await testimonialApi.editAdmin(token, editData.id, {
            comment: editData.comment,
            rating: editData.rating
        });

        if (res.ok) {
            toast.success('Review updated successfully!');
            setIsEditModalOpen(false);
            fetchReviews();
        } else {
            toast.error('Failed to update review.');
        }
        setEditSaving(false);
    };

    const openEditModal = (review: any) => {
        setEditData({ id: review.id, comment: review.comment, rating: review.rating });
        setIsEditModalOpen(true);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight flex items-center gap-2">
                    <Star size={24} className="text-indigo-400" /> Reviews & Feedback
                </h1>
                <p className="text-xs text-zinc-500 mt-1">Manage public testimonials, customer reviews, and feedback.</p>
            </div>

            {reviewsLoading ? (
                <div className="min-h-[40vh] flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                </div>
            ) : reviewsList.length === 0 ? (
                <div className="border border-zinc-900 bg-zinc-950/20 rounded-2xl p-16 text-center text-zinc-500 text-sm flex flex-col items-center">
                    <MessageSquare size={32} className="text-zinc-600 mb-3" />
                    No reviews submitted yet.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {reviewsList.map(r => (
                        <div key={r.id} className={`border rounded-2xl p-6 transition-all ${r.is_approved
                            ? 'border-zinc-850 bg-zinc-900/10'
                            : 'border-yellow-500/20 bg-yellow-500/[0.02]'
                            }`}>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-white font-bold text-sm">
                                            {r.company_name ? `${r.user_name} (${r.company_name})` : r.user_name}
                                        </h4>
                                        <span className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded ${r.user_role === 'company'
                                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                            : 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20'
                                            }`}>
                                            {r.user_role}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">{r.user_email}</p>
                                </div>
                                <div className="flex gap-0.5">
                                    {[...Array(5)].map((_, idx) => (
                                        <Star key={idx} size={12} className={idx < r.rating ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-700'} />
                                    ))}
                                </div>
                            </div>

                            <p className="text-zinc-300 text-xs leading-relaxed italic mb-6">
                                "{r.comment}"
                            </p>

                            <div className="flex justify-between items-center pt-4 border-t border-zinc-900/80">
                                <span className="text-[9px] font-mono text-zinc-600">
                                    {new Date(r.created_at).toLocaleDateString()}
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleApproveToggle(r.id, !!r.is_approved)}
                                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${r.is_approved
                                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                                            : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20'
                                            }`}
                                    >
                                        {r.is_approved ? <><CheckCircle2 size={12} /> Approved</> : 'Approve'}
                                    </button>
                                    <button
                                        onClick={() => openEditModal(r)}
                                        className="p-1.5 bg-zinc-900 border border-zinc-800 hover:bg-indigo-500/10 hover:border-indigo-500/20 text-zinc-400 hover:text-indigo-400 rounded-lg transition-all cursor-pointer"
                                        title="Edit review"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteReview(r.id)}
                                        className="p-1.5 bg-zinc-900 border border-zinc-800 hover:bg-red-500/10 hover:border-red-500/20 text-zinc-400 hover:text-red-400 rounded-lg transition-all cursor-pointer"
                                        title="Delete review"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Edit Modal */}
            {isEditModalOpen && editData && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-[#0f0f0f] border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl relative">
                        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/20 rounded-t-2xl">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Edit2 size={18} className="text-indigo-400" />
                                Edit Review
                            </h3>
                            <button
                                onClick={() => setIsEditModalOpen(false)}
                                className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleEditSave} className="p-6 space-y-5">
                            <div>
                                <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">Rating</label>
                                <div className="flex gap-1">
                                    {[1, 2, 3, 4, 5].map(star => (
                                        <Star
                                            key={star}
                                            size={24}
                                            className={`cursor-pointer transition-colors ${star <= editData.rating ? 'text-yellow-400 fill-yellow-400 hover:text-yellow-300' : 'text-zinc-700 hover:text-yellow-400/50'}`}
                                            onClick={() => setEditData({ ...editData, rating: star })}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">Review Content</label>
                                <textarea
                                    value={editData.comment}
                                    onChange={e => setEditData({ ...editData, comment: e.target.value })}
                                    rows={5}
                                    className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50 resize-none transition-colors"
                                    placeholder="Enter review message..."
                                    required
                                />
                                <p className="text-[10px] text-zinc-500 mt-2 font-mono">
                                    Adjust content layout, shorten long messages, or remove unwanted content before approving.
                                </p>
                            </div>

                            <div className="flex justify-end pt-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="px-5 py-2.5 rounded-xl border border-zinc-800 text-zinc-300 text-sm font-semibold hover:bg-zinc-800 transition-colors"
                                    disabled={editSaving}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all transform active:scale-95"
                                    disabled={editSaving}
                                >
                                    {editSaving ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <><Save size={16} /> Save Changes</>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
