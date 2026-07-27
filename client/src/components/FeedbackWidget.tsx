import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Star, X, Send, Loader2, CheckCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { testimonialApi } from '@/services/api';

export default function FeedbackWidget() {
    const { token, isAuthenticated } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [rating, setRating] = useState<number>(0);
    const [hoveredRating, setHoveredRating] = useState<number>(0);
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error' | ''; text: string }>({
        type: '',
        text: '',
    });

    // Only show if user is authenticated (dashboard zones)
    if (!isAuthenticated) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMsg({ type: '', text: '' });

        if (rating === 0) {
            setMsg({ type: 'error', text: 'Please select a rating (1-5 stars).' });
            return;
        }
        if (!comment.trim()) {
            setMsg({ type: 'error', text: 'Please provide some comment/feedback.' });
            return;
        }

        if (!token) return;

        setIsSubmitting(true);
        try {
            const res = await testimonialApi.submit(token, rating, comment);
            if (res.ok) {
                setMsg({
                    type: 'success',
                    text: '✓ Feedback submitted! Thank you. Your review will display on the website once approved by an admin.',
                });
                setComment('');
                setRating(0);
                // Auto-close widget after 3 seconds on success
                setTimeout(() => {
                    setIsOpen(false);
                    setMsg({ type: '', text: '' });
                }, 4000);
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

    return (
        <div className="fixed bottom-6 right-6 z-[9999]">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 30, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 30, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                        className="mb-4 w-80 md:w-96 bg-zinc-950/95 border border-zinc-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl overflow-hidden"
                    >
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-4">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
                                    <MessageSquare size={16} className="text-neon-cyan" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-white font-outfit uppercase tracking-wider">Leave Feedback</h4>
                                    <p className="text-[10px] text-zinc-500">Post reviews dynamically onto public site</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    setMsg({ type: '', text: '' });
                                }}
                                className="p-1.5 bg-zinc-900 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-all cursor-pointer"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {msg.text && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className={`p-3.5 mb-4 text-xs rounded-xl flex gap-2 ${msg.type === 'success'
                                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                                    }`}
                            >
                                {msg.type === 'success' ? (
                                    <CheckCircle size={14} className="shrink-0 mt-0.5" />
                                ) : (
                                    <X size={14} className="shrink-0 mt-0.5" />
                                )}
                                <div>{msg.text}</div>
                            </motion.div>
                        )}

                        {msg.type !== 'success' && (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                                        Your Rating *
                                    </label>
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <button
                                                key={star}
                                                type="button"
                                                onClick={() => setRating(star)}
                                                onMouseEnter={() => setHoveredRating(star)}
                                                onMouseLeave={() => setHoveredRating(0)}
                                                className="text-zinc-650 hover:scale-110 transition-transform cursor-pointer"
                                            >
                                                <Star
                                                    size={24}
                                                    className={
                                                        star <= (hoveredRating || rating)
                                                            ? 'text-yellow-400 fill-yellow-400'
                                                            : 'text-zinc-700'
                                                    }
                                                    fill={star <= (hoveredRating || rating) ? 'currentColor' : 'none'}
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="comments" className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                                        Comments / Feedback *
                                    </label>
                                    <textarea
                                        id="comments"
                                        rows={4}
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        placeholder="Tell us about your service or repair experience..."
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-neon-cyan resize-none transition-all placeholder:text-zinc-600"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full h-11 bg-neon-cyan text-black text-xs font-bold uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all font-outfit"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <Send size={12} />
                                            Submit Review
                                        </>
                                    )}
                                </button>
                            </form>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Action Button */}
            <motion.button
                onClick={() => setIsOpen((prev) => !prev)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-14 h-14 bg-gradient-to-br from-zinc-900 to-black hover:from-black hover:to-zinc-900 text-neon-cyan rounded-full border border-neon-cyan/35 border-t-neon-cyan/70 flex items-center justify-center cursor-pointer transition-all relative overflow-hidden group"
                style={{ boxShadow: '0 0 20px rgba(var(--neon-cyan-rgb), 0.15)' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 30px rgba(var(--neon-cyan-rgb), 0.3)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 0 20px rgba(var(--neon-cyan-rgb), 0.15)')}
            >
                <span className="absolute inset-0 w-full h-full bg-neon-cyan/5 rounded-full blur-[10px] group-hover:scale-150 transition-transform duration-500 animate-pulse pointer-events-none" />
                <span className="absolute -inset-px rounded-full bg-gradient-to-tr from-neon-cyan/5 via-neon-cyan/30 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <MessageSquare size={22} className="relative z-10" />
            </motion.button>
        </div>
    );
}
