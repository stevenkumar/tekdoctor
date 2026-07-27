import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KeyRound, ShieldCheck, Mail, User, Info, Loader2, AlertCircle, History, Hash, Clock, Smartphone, ExternalLink, Activity, Image, FileImage, Star, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { authApi, repairApi } from '@/services/api';
import type { ServiceRequest } from '@/services/api';
import { ROUTES } from '@/config/routes';
import { VALIDATION } from '@/config/constants';
import { appConfig } from '@/config/appConfig';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import CustomerFeedbackModal from '@/components/CustomerFeedbackModal';

const getFileUrl = (path: string | null) => {
  if (!path) return null;
  const base = (appConfig.apiUrl || window.location.origin).replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return `${base}/${cleanPath}`;
};

export default function ProfilePage() {
  const { user, token, isAuthenticated, updateToken } = useAuth();
  const navigate = useNavigate();

  // Photo Lightbox
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState('');
  const [previewAlt, setPreviewAlt] = useState('');

  // Feedback Modal
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackTicketId, setFeedbackTicketId] = useState<number | null>(null);
  const [feedbackTicketNumber, setFeedbackTicketNumber] = useState('');

  const openFeedback = (id: number, tNumber: string) => {
    setFeedbackTicketId(id);
    setFeedbackTicketNumber(tNumber);
    setFeedbackOpen(true);
  };

  const handleImagePreview = (src: string, alt: string) => {
    setPreviewSrc(src);
    setPreviewAlt(alt);
    setPreviewOpen(true);
  };

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | ''; message: string }>({
    type: '',
    message: ''
  });

  const [history, setHistory] = useState<ServiceRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalCompleted, setHistoryTotalCompleted] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  const fetchHistory = (pageIndex: number = 1) => {
    if (!token) return;
    setLoadingHistory(true);
    repairApi.getMyHistory(token, pageIndex, 5).then((res) => {
      if (res.ok && res.data) {
        setHistory(res.data.data.data);
        setHistoryTotal(res.data.data.pagination.total);
        setHistoryTotalCompleted(res.data.data.pagination.totalCompleted || 0);
        setHistoryTotalPages(res.data.data.pagination.totalPages);
        setHistoryPage(pageIndex);
      }
    }).finally(() => setLoadingHistory(false));
  };

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(ROUTES.SIGN_IN);
    } else if (token) {
      fetchHistory(1);
    }
  }, [isAuthenticated, token, navigate]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setStatus({ type: '', message: '' });

    // Validate inputs
    const tempErrors: Record<string, string> = {};
    if (!password) {
      tempErrors.password = 'Password is required.';
    } else if (password.length < VALIDATION.AUTH.PASSWORD_MIN_LENGTH) {
      tempErrors.password = `Password must be at least ${VALIDATION.AUTH.PASSWORD_MIN_LENGTH} characters.`;
    }

    if (password !== confirmPassword) {
      tempErrors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(tempErrors).length > 0) {
      setErrors(tempErrors);
      return;
    }

    if (!token) return;

    setIsSubmitting(true);
    try {
      const response = await authApi.setPassword(password, token);
      if (response.ok) {
        if (response.data && response.data.token) {
          updateToken(response.data.token);
        }
        setStatus({
          type: 'success',
          message: '✓ Password set successfully! You can now sign in using this password on any device.'
        });
        setPassword('');
        setConfirmPassword('');
      } else {
        setStatus({
          type: 'error',
          message: response.error || 'Failed to update password. Please try again.'
        });
      }
    } catch (err) {
      setStatus({
        type: 'error',
        message: 'An unexpected network error occurred.'
      });
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans py-16 px-6">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Title Block */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neon-cyan">Account Telemetry</span>
            <div className="w-1.5 h-1.5 bg-neon-cyan rounded-full animate-pulse" />
          </div>
          <h1 className="text-3xl font-extrabold text-white font-outfit tracking-tight">Your Profile</h1>
          <p className="text-xs text-zinc-500 mt-1">Configure your login credentials and profile details</p>
        </div>

        {/* Profile Details Card */}
        <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 md:p-8 backdrop-blur-md shadow-xl space-y-6">
          <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4">
            <div className="w-10 h-10 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
              <User className="text-neon-cyan w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white font-outfit">Identity Profile</h3>
              <p className="text-xs text-zinc-500">Your profile details stored in database</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div className="space-y-1">
              <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Username</span>
              <div className="flex items-center gap-2.5 text-white bg-black/30 border border-zinc-850 rounded-lg p-3 font-mono text-xs">
                <User size={14} className="text-zinc-500" />
                {user.name}
              </div>
            </div>

            <div className="space-y-1">
              <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Permanent Customer ID</span>
              <div className="flex items-center gap-2.5 text-neon-cyan bg-black/30 border border-zinc-850 rounded-lg p-3 font-mono text-xs font-bold uppercase tracking-wider">
                <ShieldCheck size={14} className="text-neon-cyan" />
                {user.role === 'company' ? 'TD-C' : 'TD-'}{String(user.id).padStart(3, '0')}
              </div>
            </div>

            <div className="space-y-1">
              <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Email Address</span>
              <div className="flex items-center gap-2.5 text-white bg-black/30 border border-zinc-850 rounded-lg p-3 font-mono text-xs">
                <Mail size={14} className="text-zinc-500" />
                {user.email}
              </div>
            </div>

            <div className="space-y-1">
              <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Authorization Role</span>
              <div className="flex items-center gap-2.5 text-neon-cyan bg-black/30 border border-zinc-850 rounded-lg p-3 font-mono text-xs font-bold uppercase">
                <ShieldCheck size={14} className="text-neon-cyan" />
                {user.role}
              </div>
            </div>
          </div>
        </div>

        {/* Password Setter Card */}
        <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 md:p-8 backdrop-blur-md shadow-xl space-y-6">
          <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4">
            <div className="w-10 h-10 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
              <KeyRound className="text-neon-cyan w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white font-outfit">Set/Update Password</h3>
              <p className="text-xs text-zinc-500">Configure a password to enable device-wide sign in</p>
            </div>
          </div>

          {status.message && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-xl text-sm flex gap-3 ${status.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}
            >
              {status.type === 'success' ? (
                <ShieldCheck size={16} className="shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed">{status.message}</div>
            </motion.div>
          )}

          <div className="flex items-start gap-3 bg-zinc-950/40 border border-zinc-850 rounded-xl p-4 text-xs text-zinc-500 leading-relaxed">
            <Info size={16} className="text-neon-cyan shrink-0 mt-0.5" />
            <div>
              If you auto-registered during repair checkout, setting a password here allows you to login from any desktop or mobile device using your email address <span className="text-zinc-300 font-mono font-semibold">{user.email}</span>.
            </div>
          </div>

          <form onSubmit={handleSetPassword} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">New Password *</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className={`w-full bg-zinc-950/60 border ${errors.password ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                />
                {errors.password && <p className="text-red-400 text-xs mt-1 font-mono">{errors.password}</p>}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Confirm Password *</label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className={`w-full bg-zinc-950/60 border ${errors.confirmPassword ? 'border-red-500/50 focus:border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-lg p-3 text-sm text-white focus:outline-none transition-all`}
                />
                {errors.confirmPassword && <p className="text-red-400 text-xs mt-1 font-mono">{errors.confirmPassword}</p>}
              </div>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full btn-neon py-3 cursor-pointer font-bold tracking-[0.2em] uppercase text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  Updating Encryption Keys...
                </>
              ) : (
                'Set New Password'
              )}
            </button>
          </form>
        </div>

        {/* Repair Booking History Card */}
        <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 md:p-8 backdrop-blur-md shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
                <History className="text-neon-cyan w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white font-outfit">Repair Booking History</h3>
                <p className="text-xs text-zinc-500">Track and review all your previous service requests</p>
              </div>
            </div>
            {!loadingHistory && historyTotal > 0 && (
              <div className="flex gap-3 text-xs font-mono mt-2 md:mt-0">
                <div className="flex flex-col items-start p-2 px-3 bg-zinc-950/50 rounded-lg border border-zinc-800/80">
                  <span className="text-zinc-500 text-[9px] uppercase tracking-wider">Total</span>
                  <span className="font-bold text-white">{historyTotal}</span>
                </div>
                <div className="flex flex-col items-start p-2 px-3 bg-emerald-500/5 rounded-lg border border-emerald-500/20">
                  <span className="text-zinc-500 text-[9px] uppercase tracking-wider">Completed</span>
                  <span className="font-bold text-emerald-400">{historyTotalCompleted}</span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {loadingHistory ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-neon-cyan" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center p-8 border border-dashed border-zinc-800/80 rounded-xl">
                <p className="text-sm font-mono text-zinc-500">No repair bookings found.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((req) => (
                  <div key={req.id} className="bg-black/50 border border-zinc-800/80 rounded-2xl p-5 hover:border-neon-cyan/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-neon-cyan uppercase tracking-widest font-bold flex items-center gap-1">
                          <Hash size={10} /> {req.ticketNumber || `#${req.id}`}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-widest border ${req.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                          req.status === 'in_progress' ? 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/30' :
                            req.status === 'cancelled' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                              'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}>
                          {req.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-white flex items-center gap-2">
                        <Smartphone size={14} className="text-zinc-400" />
                        {req.brand} {req.modelNumber && `(${req.modelNumber})`}
                      </p>
                      <div className="flex flex-col gap-1 mt-2 text-xs font-mono text-zinc-500">
                        <span className="flex items-center gap-1.5"><Clock size={11} /> {new Date(req.createdAt).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1.5"><User size={11} /> Tech: <span className="text-zinc-300">{req.technicianName || 'Unassigned'}</span></span>
                        {req.customerRepairDescription && <span className="flex items-center gap-1.5 text-neon-cyan/70"><Activity size={11} /> Progress: <span className="italic line-clamp-1">{req.customerRepairDescription}</span></span>}
                      </div>
                      {/* Image Thumbnail Row */}
                      {(req.imagePath || req.screenshotPath) && (
                        <div className="flex gap-2 mt-3">
                          {req.imagePath && (
                            <div className="w-10 h-10 rounded border border-zinc-800 bg-black overflow-hidden flex items-center justify-center cursor-pointer hover:border-neon-cyan/45 transition-colors" title="Device Photo" onClick={() => handleImagePreview(getFileUrl(req.imagePath)!, 'Device Photo')}>
                              <img src={getFileUrl(req.imagePath)!} alt="Device" className="max-h-full max-w-full object-contain" />
                            </div>
                          )}
                          {req.screenshotPath && (
                            <div className="w-10 h-10 rounded border border-zinc-800 bg-black overflow-hidden flex items-center justify-center cursor-pointer hover:border-neon-cyan/45 transition-colors" title="Screenshot" onClick={() => handleImagePreview(getFileUrl(req.screenshotPath)!, 'Screenshot')}>
                              <img src={getFileUrl(req.screenshotPath)!} alt="Screenshot" className="max-h-full max-w-full object-contain" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col justify-end gap-2 shrink-0">
                      {req.feedbackRating ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg self-end" title={req.feedbackComment || 'No comment provided'}>
                          <span className="text-[10px] uppercase font-bold text-yellow-500 tracking-wider">Your Rating</span>
                          <div className="flex border-l border-yellow-500/30 pl-1.5 ml-0.5">
                            {Array.from({ length: req.feedbackRating }).map((_, i) => (
                              <Star key={i} size={10} className="text-yellow-400 fill-yellow-400" />
                            ))}
                          </div>
                        </div>
                      ) : (
                        req.status === 'completed' && (
                          <button
                            onClick={() => openFeedback(req.id, req.ticketNumber || String(req.id))}
                            className="text-[10px] uppercase font-bold text-zinc-300 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 px-4 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 justify-center"
                          >
                            <MessageSquare size={10} /> Leave Feedback
                          </button>
                        )
                      )}

                      <Link
                        to={`/repair/status/?id=${req.ticketNumber || req.id}`}
                        className="text-[10px] uppercase font-bold text-black bg-neon-cyan hover:bg-neon-cyan/80 px-4 py-2.5 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        View Details <ExternalLink size={10} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {historyTotalPages > 1 && (
              <div className="flex items-center justify-between border-t border-zinc-800/80 pt-6 mt-6">
                <p className="text-[10px] font-mono text-zinc-500">
                  Page <span className="text-neon-cyan font-bold">{historyPage}</span> of {historyTotalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchHistory(historyPage - 1)}
                    disabled={historyPage === 1 || loadingHistory}
                    className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-xs font-mono text-zinc-400 hover:text-white hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => fetchHistory(historyPage + 1)}
                    disabled={historyPage === historyTotalPages || loadingHistory}
                    className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-xs font-mono text-zinc-400 hover:text-white hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image Lightbox Preview Modal */}
      <ImagePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        src={previewSrc}
        alt={previewAlt}
      />

      {/* Customer Feedback Modal */}
      {feedbackTicketId && (
        <CustomerFeedbackModal
          isOpen={feedbackOpen}
          onClose={() => {
            setFeedbackOpen(false);
            setFeedbackTicketId(null);
          }}
          ticketId={feedbackTicketId}
          ticketNumber={feedbackTicketNumber}
          onSuccess={() => fetchHistory(historyPage)}
        />
      )}
    </div>
  );
}
