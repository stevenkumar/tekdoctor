import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Phone,
  MessageCircle,
  Star,
  X,
  Send,
  Loader2,
  CheckCircle,
  Headphones,
  Copy,
  Check,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSiteContext } from '@/context/SiteContext';
import { testimonialApi, contactApi } from '@/services/api';
import { toast } from 'react-hot-toast';
import { isValidEmail } from '@/config/constants';

type WidgetTab = 'helpline' | 'feedback';

export default function FeedbackWidget() {
  const { user, token, isAuthenticated } = useAuth();
  const { flattenedSettings } = useSiteContext();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WidgetTab>('helpline');
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Configured contact & company settings
  const supportPhone = flattenedSettings.company_phone || '+91 9029073477';
  const companyName = flattenedSettings.company_name || 'TekDoctor';
  const cleanPhone = supportPhone.replace(/[^\d+]/g, '');
  const whatsappDigits = cleanPhone.replace(/\D/g, '') || '919029073477';
  const whatsappUrl = `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(
    `Hello ${companyName} Support, I need assistance with a device repair.`
  )}`;

  // ── Support Helpline: Message Form State ──
  const [isComposingMessage, setIsComposingMessage] = useState(false);
  const [messageName, setMessageName] = useState(user?.name || '');
  const [messagePhone, setMessagePhone] = useState(user?.phone || '');
  const [messageEmail, setMessageEmail] = useState(user?.email || '');
  const [messageText, setMessageText] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageStatus, setMessageStatus] = useState<{ type: 'success' | 'error' | ''; text: string }>({
    type: '',
    text: '',
  });

  // ── Feedback Form State ──
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackName, setFeedbackName] = useState(user?.name || '');
  const [feedbackPhone, setFeedbackPhone] = useState(user?.phone || '');
  const [feedbackEmail, setFeedbackEmail] = useState(user?.email || '');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<{ type: 'success' | 'error' | ''; text: string }>({
    type: '',
    text: '',
  });

  // Sync user details if authentication state loads
  useEffect(() => {
    if (user) {
      if (!messageName) setMessageName(user.name || '');
      if (!messageEmail) setMessageEmail(user.email || '');
      if (!messagePhone && user.phone) setMessagePhone(user.phone);

      if (!feedbackName) setFeedbackName(user.name || '');
      if (!feedbackEmail) setFeedbackEmail(user.email || '');
      if (!feedbackPhone && user.phone) setFeedbackPhone(user.phone);
    }
  }, [user]);

  // Handle phone number copy
  const handleCopyPhone = () => {
    navigator.clipboard.writeText(supportPhone);
    setCopiedPhone(true);
    toast.success('Support phone number copied to clipboard!');
    setTimeout(() => setCopiedPhone(false), 2500);
  };

  // ── Handle Support Helpline Message Submission ──
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessageStatus({ type: '', text: '' });

    const trimmedName = messageName.trim();
    const trimmedPhone = messagePhone.trim();
    const trimmedEmail = messageEmail.trim();
    const trimmedMsg = messageText.trim();

    if (!trimmedName) {
      setMessageStatus({ type: 'error', text: 'Please enter your full name.' });
      return;
    }
    if (!trimmedPhone) {
      setMessageStatus({ type: 'error', text: 'Please enter your phone number.' });
      return;
    }
    const cleanDigits = trimmedPhone.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      setMessageStatus({ type: 'error', text: 'Please enter a valid phone number (at least 10 digits).' });
      return;
    }
    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      setMessageStatus({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }
    if (!trimmedMsg || trimmedMsg.length < 10) {
      setMessageStatus({ type: 'error', text: 'Please enter a message of at least 10 characters.' });
      return;
    }

    setIsSendingMessage(true);
    try {
      const res = await contactApi.submitForm({
        name: trimmedName,
        phone: trimmedPhone,
        email: trimmedEmail || (user?.email ? user.email : 'support-helpline@tekdoctor.in'),
        message: trimmedMsg,
        subject: 'Support Helpline Inquiry',
      });

      if (res.ok) {
        toast.success('Your message has been sent to our support desk!');
        setMessageStatus({
          type: 'success',
          text: '✓ Message received! Our support team will reach out to you shortly.',
        });
        setMessageText('');
        setTimeout(() => {
          setIsComposingMessage(false);
          setMessageStatus({ type: '', text: '' });
        }, 4000);
      } else {
        const errorMsg = res.error || 'Failed to send message. Please try again or call our helpline.';
        setMessageStatus({ type: 'error', text: errorMsg });
        toast.error(errorMsg);
      }
    } catch (err) {
      console.error('Failed to submit helpline message:', err);
      const netError = 'Network connection failed. Please check your internet connection.';
      setMessageStatus({ type: 'error', text: netError });
      toast.error(netError);
    } finally {
      setIsSendingMessage(false);
    }
  };

  // ── Handle Feedback Submission ──
  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackStatus({ type: '', text: '' });

    if (rating === 0) {
      setFeedbackStatus({ type: 'error', text: 'Please select a rating (1-5 stars).' });
      return;
    }

    const trimmedComment = feedbackComment.trim();
    if (!trimmedComment || trimmedComment.length < 5) {
      setFeedbackStatus({ type: 'error', text: 'Please write a feedback comment (at least 5 characters).' });
      return;
    }

    // Validation for non-logged-in visitors
    const trimmedName = feedbackName.trim();
    const trimmedPhone = feedbackPhone.trim();
    const trimmedEmail = feedbackEmail.trim();

    if (!isAuthenticated) {
      if (!trimmedName) {
        setFeedbackStatus({ type: 'error', text: 'Please enter your name.' });
        return;
      }
      if (!trimmedPhone) {
        setFeedbackStatus({ type: 'error', text: 'Please enter your contact phone number.' });
        return;
      }
      const cleanDigits = trimmedPhone.replace(/\D/g, '');
      if (cleanDigits.length < 10) {
        setFeedbackStatus({ type: 'error', text: 'Please enter a valid 10-digit phone number.' });
        return;
      }
      if (trimmedEmail && !isValidEmail(trimmedEmail)) {
        setFeedbackStatus({ type: 'error', text: 'Please enter a valid email address.' });
        return;
      }
    }

    setIsSubmittingFeedback(true);
    try {
      if (isAuthenticated && token) {
        // Authenticated user: submit to testimonials API
        const res = await testimonialApi.submit(token, rating, trimmedComment);
        if (res.ok) {
          toast.success('Thank you! Your feedback has been submitted.');
          setFeedbackStatus({
            type: 'success',
            text: '✓ Feedback submitted! Thank you. Your review will display on the website once approved by an admin.',
          });
          setFeedbackComment('');
          setRating(0);
          setTimeout(() => {
            setIsOpen(false);
            setFeedbackStatus({ type: '', text: '' });
          }, 4000);
        } else {
          const errorMsg = res.error || 'Failed to submit feedback. Please try again.';
          setFeedbackStatus({ type: 'error', text: errorMsg });
          toast.error(errorMsg);
        }
      } else {
        // Non-logged-in visitor: reuse contact API for feedback
        const res = await contactApi.submitForm({
          name: trimmedName,
          phone: trimmedPhone,
          email: trimmedEmail || 'guest-feedback@tekdoctor.in',
          message: `[User Rating: ${rating}/5 Stars]\n\n${trimmedComment}`,
          subject: `Customer Feedback (${rating} Stars) - ${trimmedName}`,
        });

        if (res.ok) {
          toast.success('Thank you for your feedback!');
          setFeedbackStatus({
            type: 'success',
            text: '✓ Thank you! Your feedback has been received and shared with our team.',
          });
          setFeedbackComment('');
          setRating(0);
          setTimeout(() => {
            setIsOpen(false);
            setFeedbackStatus({ type: '', text: '' });
          }, 4000);
        } else {
          const errorMsg = res.error || 'Failed to submit feedback. Please try again.';
          setFeedbackStatus({ type: 'error', text: errorMsg });
          toast.error(errorMsg);
        }
      }
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      const netError = 'Network error while submitting feedback. Please try again.';
      setFeedbackStatus({ type: 'error', text: netError });
      toast.error(netError);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const ratingDescriptions: Record<number, string> = {
    1: 'Needs Improvement',
    2: 'Fair Experience',
    3: 'Good Service',
    4: 'Great Experience!',
    5: 'Excellent & Outstanding!',
  };

  return (
    <div className="fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-[9999] flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 25, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 25, scale: 0.95 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="mb-3 w-[calc(100vw-2rem)] sm:w-96 max-w-[420px] bg-zinc-950/95 border border-zinc-800/90 rounded-3xl p-4 sm:p-5 shadow-2xl backdrop-blur-2xl overflow-hidden max-h-[85vh] flex flex-col"
            style={{
              boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.8), 0 0 25px rgba(var(--neon-cyan-rgb, 0, 242, 255), 0.1)',
            }}
          >
            {/* ── Card Header ── */}
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3 mb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-neon-cyan/10 border border-neon-cyan/25 flex items-center justify-center text-neon-cyan">
                  {activeTab === 'helpline' ? <Headphones size={16} /> : <Sparkles size={16} />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white font-outfit uppercase tracking-wider">
                    {companyName} Assistance
                  </h4>
                  <p className="text-[10px] text-zinc-400 font-mono">Support Helpline &amp; Feedback</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close assistance card"
                className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer min-h-[32px] min-w-[32px]"
              >
                <X size={15} />
              </button>
            </div>

            {/* ── Common Card Segmented Tab Selector ── */}
            <div className="flex bg-zinc-900/90 p-1 rounded-2xl border border-zinc-800/80 mb-3 shrink-0">
              <button
                type="button"
                id="tab-support-helpline"
                onClick={() => setActiveTab('helpline')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all min-h-[44px] cursor-pointer font-outfit ${
                  activeTab === 'helpline'
                    ? 'bg-neon-cyan text-black shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <Phone size={14} />
                <span>Support Helpline</span>
              </button>
              <button
                type="button"
                id="tab-feedback"
                onClick={() => setActiveTab('feedback')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all min-h-[44px] cursor-pointer font-outfit ${
                  activeTab === 'feedback'
                    ? 'bg-neon-cyan text-black shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <Star size={14} />
                <span>Feedback</span>
              </button>
            </div>

            {/* ── Scrollable Tab Content Container ── */}
            <div className="overflow-y-auto pr-0.5 space-y-3 flex-grow scrollbar-thin scrollbar-thumb-zinc-800">
              {/* ──────────────── TAB 1: SUPPORT HELPLINE ──────────────── */}
              {activeTab === 'helpline' && (
                <div className="space-y-3">
                  {/* 1. Support Helpline Group (Call + Message) */}
                  <div className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between px-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest font-mono">
                          Helpline Options
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-zinc-500 uppercase">
                        Mon – Sat • 9AM – 8PM
                      </span>
                    </div>

                    {/* 📞 Call Option */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 hover:border-neon-cyan/40 transition-all gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center text-neon-cyan shrink-0">
                          <Phone size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                            Direct Helpline
                          </div>
                          <div className="text-xs sm:text-sm font-bold text-white font-mono truncate">
                            {supportPhone}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={handleCopyPhone}
                          title="Copy phone number"
                          aria-label="Copy helpline number"
                          className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                        >
                          {copiedPhone ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                        </button>
                        <a
                          href={`tel:${cleanPhone}`}
                          id="btn-call-helpline"
                          aria-label={`Call ${supportPhone}`}
                          className="px-3.5 py-2 rounded-lg bg-neon-cyan text-black text-xs font-bold font-outfit uppercase tracking-wider hover:opacity-90 transition-opacity min-h-[44px] flex items-center gap-1.5 cursor-pointer"
                        >
                          <Phone size={13} />
                          <span>Call</span>
                        </a>
                      </div>
                    </div>

                    {/* 💬 Message Option */}
                    <div className="rounded-xl bg-zinc-950/80 border border-zinc-800 transition-all overflow-hidden">
                      <button
                        type="button"
                        id="btn-toggle-message-option"
                        onClick={() => setIsComposingMessage((prev) => !prev)}
                        className="w-full flex items-center justify-between p-3 text-left transition-colors hover:bg-zinc-900/60 cursor-pointer min-h-[48px]"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center text-neon-cyan shrink-0">
                            <MessageSquare size={16} />
                          </div>
                          <div>
                            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                              Inquiry Message
                            </div>
                            <div className="text-xs font-bold text-white font-outfit">
                              Leave Message for Support
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-neon-cyan bg-neon-cyan/10 px-2 py-1 rounded-md border border-neon-cyan/20 uppercase tracking-wider">
                          {isComposingMessage ? 'Hide ↑' : 'Message →'}
                        </span>
                      </button>

                      {/* Inline Message Composer */}
                      <AnimatePresence>
                        {isComposingMessage && (
                          <motion.form
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            onSubmit={handleSendMessage}
                            className="p-3 border-t border-zinc-900 space-y-2.5 bg-zinc-950/60"
                          >
                            {messageStatus.text && (
                              <div
                                className={`p-2.5 text-xs rounded-xl flex items-start gap-2 ${
                                  messageStatus.type === 'success'
                                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                                }`}
                              >
                                {messageStatus.type === 'success' ? (
                                  <CheckCircle size={14} className="shrink-0 mt-0.5" />
                                ) : (
                                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                )}
                                <div>{messageStatus.text}</div>
                              </div>
                            )}

                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 font-mono">
                                Your Name *
                              </label>
                              <input
                                type="text"
                                value={messageName}
                                onChange={(e) => setMessageName(e.target.value)}
                                placeholder="Enter full name"
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neon-cyan transition-all placeholder:text-zinc-600 min-h-[40px]"
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 font-mono">
                                  Phone Number *
                                </label>
                                <input
                                  type="tel"
                                  value={messagePhone}
                                  onChange={(e) => setMessagePhone(e.target.value)}
                                  placeholder="10-digit phone"
                                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neon-cyan transition-all placeholder:text-zinc-600 min-h-[40px]"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 font-mono">
                                  Email (Optional)
                                </label>
                                <input
                                  type="email"
                                  value={messageEmail}
                                  onChange={(e) => setMessageEmail(e.target.value)}
                                  placeholder="you@email.com"
                                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neon-cyan transition-all placeholder:text-zinc-600 min-h-[40px]"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 font-mono">
                                Inquiry or Issue *
                              </label>
                              <textarea
                                rows={3}
                                value={messageText}
                                onChange={(e) => setMessageText(e.target.value)}
                                placeholder="How can our technical helpline assist you?"
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neon-cyan resize-none transition-all placeholder:text-zinc-600"
                              />
                            </div>

                            <button
                              type="submit"
                              id="btn-submit-helpline-message"
                              disabled={isSendingMessage}
                              className="w-full min-h-[44px] bg-neon-cyan text-black text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all font-outfit"
                            >
                              {isSendingMessage ? (
                                <>
                                  <Loader2 size={14} className="animate-spin" />
                                  <span>Sending Message...</span>
                                </>
                              ) : (
                                <>
                                  <Send size={13} />
                                  <span>Send Message to Helpline</span>
                                </>
                              )}
                            </button>
                          </motion.form>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* 2. Chat as a SEPARATE CTA (Strictly outside Call/Message group) */}
                  <div className="pt-0.5">
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      id="btn-chat-separate-cta"
                      className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-zinc-900 to-emerald-500/10 border border-emerald-500/35 hover:border-emerald-400/80 text-white font-outfit transition-all min-h-[48px] shadow-[0_0_20px_rgba(16,185,129,0.12)] hover:shadow-[0_0_25px_rgba(16,185,129,0.25)] group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform shrink-0">
                          <MessageCircle size={18} />
                        </div>
                        <div className="text-left">
                          <div className="text-xs font-bold text-white font-outfit flex items-center gap-1.5">
                            <span>Chat with Us</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 uppercase border border-emerald-500/30">
                              Live
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            Instant answers on WhatsApp
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-emerald-300 group-hover:text-white uppercase tracking-wider flex items-center gap-1 shrink-0">
                        Chat Now →
                      </span>
                    </a>
                  </div>
                </div>
              )}

              {/* ──────────────── TAB 2: FEEDBACK ──────────────── */}
              {activeTab === 'feedback' && (
                <div className="space-y-3">
                  {feedbackStatus.text && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 text-xs rounded-xl flex items-start gap-2 ${
                        feedbackStatus.type === 'success'
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                          : 'bg-red-500/10 border border-red-500/20 text-red-400'
                      }`}
                    >
                      {feedbackStatus.type === 'success' ? (
                        <CheckCircle size={15} className="shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle size={15} className="shrink-0 mt-0.5" />
                      )}
                      <div>{feedbackStatus.text}</div>
                    </motion.div>
                  )}

                  {feedbackStatus.type !== 'success' && (
                    <form onSubmit={handleSubmitFeedback} className="space-y-3">
                      {/* Star Rating Selector */}
                      <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono">
                            Your Rating *
                          </label>
                          <span className="text-[10px] font-mono text-neon-cyan">
                            {ratingDescriptions[hoveredRating || rating] || 'Select rating'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setRating(star)}
                              onMouseEnter={() => setHoveredRating(star)}
                              onMouseLeave={() => setHoveredRating(0)}
                              aria-label={`Rate ${star} star`}
                              className="p-1 text-zinc-700 hover:scale-115 transition-transform cursor-pointer min-h-[44px] min-w-[40px] flex items-center justify-center"
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

                      {/* Guest Details (only if not authenticated) */}
                      {!isAuthenticated && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 font-mono">
                              Your Name *
                            </label>
                            <input
                              type="text"
                              value={feedbackName}
                              onChange={(e) => setFeedbackName(e.target.value)}
                              placeholder="Full name"
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neon-cyan transition-all placeholder:text-zinc-600 min-h-[40px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 font-mono">
                              Phone Number *
                            </label>
                            <input
                              type="tel"
                              value={feedbackPhone}
                              onChange={(e) => setFeedbackPhone(e.target.value)}
                              placeholder="10-digit number"
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neon-cyan transition-all placeholder:text-zinc-600 min-h-[40px]"
                            />
                          </div>
                        </div>
                      )}

                      {!isAuthenticated && (
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 font-mono">
                            Email Address (Optional)
                          </label>
                          <input
                            type="email"
                            value={feedbackEmail}
                            onChange={(e) => setFeedbackEmail(e.target.value)}
                            placeholder="you@email.com"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neon-cyan transition-all placeholder:text-zinc-600 min-h-[40px]"
                          />
                        </div>
                      )}

                      {/* Comment */}
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 font-mono">
                          Comments &amp; Experience *
                        </label>
                        <textarea
                          rows={3}
                          value={feedbackComment}
                          onChange={(e) => setFeedbackComment(e.target.value)}
                          placeholder="Tell us about your repair, diagnosis, or customer service experience..."
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-neon-cyan resize-none transition-all placeholder:text-zinc-600"
                        />
                      </div>

                      <button
                        type="submit"
                        id="btn-submit-feedback"
                        disabled={isSubmittingFeedback}
                        className="w-full min-h-[44px] bg-neon-cyan text-black text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all font-outfit"
                      >
                        {isSubmittingFeedback ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            <span>Submitting Review...</span>
                          </>
                        ) : (
                          <>
                            <Send size={13} />
                            <span>Submit Feedback</span>
                          </>
                        )}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating Launcher Trigger Button ── */}
      <motion.button
        type="button"
        id="btn-floating-help-feedback"
        onClick={() => setIsOpen((prev) => !prev)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Open Support Helpline and Feedback"
        className="w-14 h-14 bg-gradient-to-br from-zinc-900 to-black hover:from-black hover:to-zinc-900 text-neon-cyan rounded-full border border-neon-cyan/40 hover:border-neon-cyan flex items-center justify-center cursor-pointer transition-all relative overflow-hidden group shadow-[0_0_20px_rgba(0,242,255,0.2)] hover:shadow-[0_0_30px_rgba(0,242,255,0.4)]"
      >
        <span className="absolute inset-0 w-full h-full bg-neon-cyan/10 rounded-full blur-[10px] group-hover:scale-150 transition-transform duration-500 animate-pulse pointer-events-none" />
        <span className="absolute -inset-px rounded-full bg-gradient-to-tr from-neon-cyan/10 via-neon-cyan/30 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        {isOpen ? (
          <X size={22} className="relative z-10 text-white" />
        ) : (
          <>
            <Headphones size={22} className="relative z-10 text-neon-cyan" />
            <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-neon-cyan animate-ping pointer-events-none" />
            <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-neon-cyan pointer-events-none" />
          </>
        )}
      </motion.button>
    </div>
  );
}
