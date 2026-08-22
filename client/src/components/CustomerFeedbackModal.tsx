import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Star, X, Send, Loader2, CheckCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { repairApi } from '@/services/api';

interface CustomerFeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticketId: number;
    ticketNumber: string;
    onSuccess: () => void;
}

export default function CustomerFeedbackModal({ isOpen, onClose, ticketId, ticketNumber, onSuccess }: CustomerFeedbackModalProps) {
    const { token } = useAuth();
    const [rating, setRating] = useState<number>(0);
    const [hoveredRating, setHoveredRating] = useState<number>(0);
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error' | ''; text: string }>({
        type: '',
        text: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMsg({ type: '', text: '' });

        if (rating === 0) {
            setMsg({ type: 'error', text: 'Please select a rating (1-5 stars).' });
            return;
        }

        if (!token) return;

        setIsSubmitting(true);
        try {
            const res = await repairApi.submitFeedback(token, ticketId, rating, comment);
            if (res.ok) {
                setMsg({
                    type: 'success',
                    text: '✓ Feedback submitted! Thank you for reviewing your repair experience.',
                });
                setTimeout(() => {
                    onSuccess();
                    onClose(); // Parent callback
                }, 3000);
            } else {
                setMsg({
                    type: 'error',
                    text: res.error || 'Failed to submit feedback. Please try again.',
                });
            }
        } catch (err) {
            setMsg({ type: 'error', text: 'Network connection failed.' });
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 rounded-3xl">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl overflow-hidden"
            >
                <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
                            <Star size={18} className="text-neon-cyan fill-neon-cyan/20" />
                        </div>
                        <div>
                            <h3 className="font-bold text-white font-outfit uppercase tracking-wider">Leave Feedback</h3>
                            <p className="text-[10px] text-zinc-500 font-mono tracking-widest mt-0.5">TICKET {ticketNumber}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-all cursor-pointer"
                    >
                        <X size={16} />
                    </button>
                </div>

                {msg.text && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`p-4 mb-5 text-xs rounded-xl flex gap-3 ${msg.type === 'success'
                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/10 border border-red-500/20 text-red-400'
                            }`}
                    >
                        {msg.type === 'success' ? (
                            <CheckCircle size={16} className="shrink-0 mt-0.5" />
                        ) : (
                            <X size={16} className="shrink-0 mt-0.5" />
                        )}
                        <div className="leading-relaxed">{msg.text}</div>
                    </motion.div>
                )}

                {msg.type !== 'success' && (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neon-cyan/5 to-transparent">
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                                Rate Your Experience *
                            </label>
                            <div className="flex gap-2">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        type="button"
                                        onClick={() => setRating(star)}
                                        onMouseEnter={() => setHoveredRating(star)}
                                        onMouseLeave={() => setHoveredRating(0)}
                                        className="text-zinc-650 hover:scale-110 active:scale-95 transition-transform cursor-pointer focus:outline-none"
                                    >
                                        <Star
                                            size={28}
                                            className={
                                                star <= (hoveredRating || rating)
                                                    ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]'
                                                    : 'text-zinc-700'
                                            }
                                            fill={star <= (hoveredRating || rating) ? 'currentColor' : 'none'}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="comments" className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                                Comments (Optional)
                            </label>
                            <textarea
                                id="comments"
                                rows={4}
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="What went well? Any areas for improvement?"
                                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-neon-cyan resize-none transition-all placeholder:text-zinc-600 font-mono"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-3.5 bg-neon-cyan text-black text-xs font-bold uppercase tracking-[0.2em] rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-neon-cyan/90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all font-outfit"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    Submitting Feedback...
                                </>
                            ) : (
                                <>
                                    <Send size={14} />
                                    Submit Feedback
                                </>
                            )}
                        </button>
                    </form>
                )}
            </motion.div>
        </div>
    );
}
