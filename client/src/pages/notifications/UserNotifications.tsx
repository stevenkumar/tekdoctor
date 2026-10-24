import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Bell, CheckCheck, Trash2, ChevronLeft, ArrowUpRight,
  RefreshCw, Loader2, X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { notificationApi } from '@/services/api';
import type { NotificationItem } from '@/services/api';
import { ROUTES } from '@/config/routes';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { SkeletonList } from '@/components/Skeleton';

export default function UserNotifications() {
  const { user: _user, token, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [activeModalNotif, setActiveModalNotif] = useState<NotificationItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await notificationApi.getAll(token);
      if (res.ok && res.data) {
        setNotifications(res.data.data);
      } else {
        toast.error(res.error || 'Failed to fetch notifications.');
      }
    } catch {
      toast.error('Network error loading notifications.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchNotifications();
    }
  }, [token, fetchNotifications]);

  // If unauthenticated, redirect to sign-in
  useEffect(() => {
    if (!isAuthenticated && !token) {
      navigate(ROUTES.SIGN_IN, { replace: true });
    }
  }, [isAuthenticated, token, navigate]);

  const notifyUpdated = () => {
    window.dispatchEvent(new Event('tekdoctor:notifications_updated'));
  };

  const handleMarkAsRead = async (id: number | 'all') => {
    if (!token) return;
    setActionLoading(true);
    try {
      const res = await notificationApi.markAsRead(token, id);
      if (res.ok) {
        setNotifications(prev =>
          prev.map(n => ((id === 'all' || n.id === id) ? { ...n, is_read: true } : n))
        );
        notifyUpdated();
        toast.success(id === 'all' ? 'All notifications marked as read' : 'Notification marked as read');
      } else {
        toast.error(res.error || 'Failed to update notification');
      }
    } catch {
      toast.error('Network error updating notification');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!token) return;
    try {
      const res = await notificationApi.delete(token, id);
      if (res.ok) {
        setNotifications(prev => prev.filter(n => n.id !== id));
        notifyUpdated();
        toast.success('Notification removed');
      } else {
        toast.error(res.error || 'Failed to delete notification');
      }
    } catch {
      toast.error('Network error deleting notification');
    }
  };

  const handleClearAll = async () => {
    if (!token) return;
    if (!window.confirm('Are you sure you want to clear all notifications?')) return;
    setActionLoading(true);
    try {
      const res = await notificationApi.clearAll(token);
      if (res.ok) {
        setNotifications([]);
        notifyUpdated();
        toast.success('All notifications cleared');
      } else {
        toast.error(res.error || 'Failed to clear notifications');
      }
    } catch {
      toast.error('Network error clearing notifications');
    } finally {
      setActionLoading(false);
    }
  };

  const handleNotificationClick = async (n: NotificationItem) => {
    if (!n.is_read) {
      await handleMarkAsRead(Number(n.id));
    }
    setActiveModalNotif({ ...n, is_read: true });
  };

  // Keyboard shortcut to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeModalNotif) {
        setActiveModalNotif(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModalNotif]);

  // Lock background scroll when modal is open
  useEffect(() => {
    if (activeModalNotif) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [activeModalNotif]);

  const unreadCount = notifications.filter(n => n.is_read === false || n.is_read === 0 || !n.is_read).length;
  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => n.is_read === false || n.is_read === 0 || !n.is_read)
    : notifications;

  if (!isAuthenticated && !token) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Top Back Navigation Bar */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => {
              if (window.history.length > 2) {
                navigate(-1);
              } else {
                navigate(ROUTES.PROFILE);
              }
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all text-xs font-mono font-medium group cursor-pointer shadow-lg"
          >
            <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform text-neon-cyan" />
            <span>Back to Dashboard</span>
          </button>

          <Link
            to={ROUTES.PROFILE}
            className="text-xs font-mono text-zinc-500 hover:text-neon-cyan transition-colors hidden sm:inline"
          >
            Customer Account / Dashboard
          </Link>
        </div>

        {/* Main Header Card */}
        <header className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neon-cyan">Alerts & Dispatch</span>
              <div className="w-1.5 h-1.5 bg-neon-cyan rounded-full animate-pulse" />
              {unreadCount > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-bold">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white font-outfit tracking-tight flex items-center gap-2.5">
              <Bell size={22} className="text-neon-cyan" />
              <span>Notifications Center</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Operational updates, repair stage milestones, estimate approvals, and system messages
            </p>
          </div>

          {/* Header Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => handleMarkAsRead('all')}
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-xl bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/30 text-neon-cyan text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckCheck size={14} />
                <span>Mark All Read</span>
              </button>
            )}

            {notifications.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 size={13} />
                <span>Clear All</span>
              </button>
            )}

            <button
              type="button"
              onClick={fetchNotifications}
              disabled={loading}
              title="Refresh Notifications"
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin text-neon-cyan' : ''} />
            </button>
          </div>
        </header>

        {/* Filter Segmented Controls */}
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
          <div className="flex items-center gap-1.5 bg-zinc-900/60 p-1 rounded-xl border border-zinc-800/60">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono tracking-wide transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-neon-cyan text-black font-bold shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
                filter === 'unread'
                  ? 'bg-neon-cyan text-black font-bold shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  filter === 'unread' ? 'bg-black text-white' : 'bg-red-500/20 text-red-400'
                }`}>
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          <span className="text-xs font-mono text-zinc-500 hidden sm:inline">
            Showing {filteredNotifications.length} of {notifications.length} alerts
          </span>
        </div>

        {/* Notifications List */}
        {loading ? (
          <div className="py-2">
            <SkeletonList count={5} />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-12 text-center bg-zinc-950/60 border border-dashed border-zinc-900 rounded-2xl flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600">
              <Bell size={22} />
            </div>
            <h3 className="text-sm font-bold text-zinc-300 font-outfit uppercase tracking-wider">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm font-mono leading-relaxed">
              {filter === 'unread'
                ? "You've read all your alerts! Switch to 'All' to review previous updates."
                : "When your repair status changes or updates are posted to your account, they will appear here."}
            </p>
            {filter === 'unread' && notifications.length > 0 && (
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="mt-2 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs font-mono text-neon-cyan transition-colors"
              >
                View All Notifications
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((n) => {
              const isUnread = n.is_read === false || n.is_read === 0 || !n.is_read;
              const hasTicket = !!n.ticket_number;

              return (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer relative group text-left ${
                    isUnread
                      ? 'bg-neon-cyan/[0.03] border-neon-cyan/30 shadow-lg shadow-neon-cyan/5 hover:border-neon-cyan/50 hover:bg-neon-cyan/[0.06]'
                      : 'bg-zinc-950/60 border-zinc-900 hover:border-zinc-800 hover:bg-zinc-900/40 text-zinc-400'
                  }`}
                >
                  {/* Top Bar of Card */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 mb-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isUnread ? 'bg-neon-cyan animate-pulse' : 'bg-zinc-700'}`} />
                      <h3 className={`text-sm font-bold truncate ${isUnread ? 'text-white' : 'text-zinc-300'}`}>
                        {n.title}
                      </h3>
                      {isUnread && (
                        <span className="text-[9px] font-mono bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                          New
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-zinc-500 font-mono shrink-0">
                      <span className="text-[11px]">{new Date(n.created_at).toLocaleString()}</span>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, Number(n.id))}
                        className="text-zinc-600 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-500/10 cursor-pointer"
                        title="Delete notification"
                        aria-label="Delete notification"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Message body */}
                  <p className="text-xs leading-relaxed text-zinc-300 mb-3 whitespace-pre-wrap">
                    {n.message}
                  </p>

                  {/* Footer Info & Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-900/70 text-xs">
                    <div className="flex items-center gap-3 flex-wrap">
                      {n.sender_name && (
                        <span className="text-zinc-500 font-mono text-[11px]">
                          From: <span className="text-zinc-400">{n.sender_name}</span>
                        </span>
                      )}
                      {hasTicket && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`${ROUTES.REPAIR_STATUS}?ticket=${n.ticket_number}`);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/30 text-neon-cyan font-mono text-[11px] font-bold transition-all cursor-pointer"
                          title="Track this repair ticket"
                        >
                          <span>Ticket #{n.ticket_number}</span>
                          <ArrowUpRight size={11} />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isUnread && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(Number(n.id));
                          }}
                          className="text-[11px] font-mono text-zinc-400 hover:text-white px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors cursor-pointer"
                        >
                          Mark as read
                        </button>
                      )}
                      <span className="text-[11px] font-mono text-neon-cyan group-hover:underline flex items-center gap-0.5">
                        Details <ArrowUpRight size={10} />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Notification Detail Modal (Portaled directly to document.body) */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {activeModalNotif && (
            <div
              onClick={() => setActiveModalNotif(null)}
              className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 sm:p-6 z-[99999] backdrop-blur-sm overflow-y-auto"
              style={{ minHeight: '100vh' }}
            >
              <motion.div
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 16 }}
                transition={{ duration: 0.2 }}
                className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl relative text-left max-h-[85vh] sm:max-h-[80vh] flex flex-col my-auto overflow-hidden"
              >
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-zinc-900 flex justify-between items-center bg-black/60 shrink-0 sticky top-0 z-10 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <Bell size={16} className="text-neon-cyan" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-widest font-mono">
                      Notification Details
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModalNotif(null)}
                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer border border-zinc-800 flex items-center gap-1.5"
                    aria-label="Close modal"
                  >
                    <X size={14} />
                    <span className="hidden sm:inline text-[10px] font-mono">ESC</span>
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-6 space-y-4 flex-1 overflow-y-auto scrollbar-thin">
                  <div>
                    <h4 className="text-base font-bold text-neon-cyan leading-snug font-outfit">
                      {activeModalNotif.title}
                    </h4>
                    <span className="text-[10px] font-mono text-zinc-500 mt-1 block">
                      Received on {new Date(activeModalNotif.created_at).toLocaleString()}
                    </span>
                  </div>

                  {/* Extra Information Grid */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    <div className="bg-[#0b0b0b] p-3 rounded-xl border border-zinc-900">
                      <span className="text-zinc-600 block text-[9px] uppercase tracking-wider mb-0.5">Type</span>
                      <span className="text-zinc-300 font-bold">
                        {activeModalNotif.ticket_number || activeModalNotif.ticket_id
                          ? 'Repair Ticket Update'
                          : activeModalNotif.sender_name
                          ? 'Technician Message'
                          : 'System Alert'}
                      </span>
                    </div>
                    <div className="bg-[#0b0b0b] p-3 rounded-xl border border-zinc-900">
                      <span className="text-zinc-600 block text-[9px] uppercase tracking-wider mb-0.5">Status</span>
                      <span className="font-bold text-emerald-400">Read</span>
                    </div>
                  </div>

                  {/* Message Box */}
                  <div className="bg-zinc-900/40 p-4 border border-zinc-900 rounded-xl">
                    <span className="text-zinc-500 block text-[9px] uppercase font-mono tracking-wider mb-1.5">Message</span>
                    <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed break-words">
                      {activeModalNotif.message}
                    </p>
                  </div>

                  {/* Sender Metadata */}
                  {activeModalNotif.sender_name && (
                    <div className="text-[11px] text-zinc-400 font-mono">
                      <span className="text-zinc-500 block text-[9px] uppercase tracking-wider mb-1">Sender Info</span>
                      <div className="bg-[#0c0c0c] p-3 rounded-xl border border-zinc-900">
                        <strong>Name:</strong> {activeModalNotif.sender_name} <br />
                        <strong>Email:</strong> {activeModalNotif.sender_email || 'N/A'}
                      </div>
                    </div>
                  )}

                  {/* Related Ticket Info */}
                  {activeModalNotif.ticket_number && (
                    <div className="space-y-1 font-mono">
                      <span className="text-zinc-500 block text-[9px] uppercase tracking-wider mb-1">Related Ticket</span>
                      <div className="flex justify-between items-center bg-neon-cyan/5 p-3.5 border border-neon-cyan/20 rounded-xl gap-2">
                        <div>
                          <span className="text-xs font-bold text-white block">#{activeModalNotif.ticket_number}</span>
                          <span className="text-[10px] text-zinc-400">View complete repair stages & timeline</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigate(`${ROUTES.REPAIR_STATUS}?ticket=${activeModalNotif.ticket_number}`);
                            setActiveModalNotif(null);
                          }}
                          className="text-[10px] bg-neon-cyan hover:bg-neon-cyan/80 text-black font-bold uppercase py-2 px-3 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_10px_rgba(0,242,255,0.2)] shrink-0"
                        >
                          <span>Track Ticket</span>
                          <ArrowUpRight size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 border-t border-zinc-900 bg-black/40 flex justify-end shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveModalNotif(null)}
                    className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-mono transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
