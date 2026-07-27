'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Bell, Trash2, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSiteContext } from '../context/SiteContext';
import { notificationApi } from '../services/api';
import type { NotificationItem } from '../services/api';
import { ROUTES } from '../config/routes';
import { appConfig } from '../config/appConfig';
import { getMediaUrl } from '../utils/media';

const Navbar = () => {
  const { isAuthenticated, logout, user, token } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeModalNotif, setActiveModalNotif] = useState<NotificationItem | null>(null);
  const { flattenedSettings } = useSiteContext();
  const location = useLocation();
  const notifRef = useRef<HTMLDivElement>(null);

  const getLinkClass = (path: string) => {
    const isActive = location.pathname === path;
    return `text-[11px] font-semibold uppercase tracking-widest transition-all duration-300 ${isActive
      ? 'text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/20 px-3.5 py-1.5 rounded-lg shadow-[0_0_10px_rgba(0,242,255,0.15)] font-bold font-outfit'
      : 'text-zinc-400 hover:text-neon-cyan border border-transparent px-3.5 py-1.5 rounded-lg'
      }`;
  };

  const getMobileLinkClass = (path: string) => {
    const isActive = location.pathname === path;
    return `text-xs font-semibold uppercase tracking-[0.2em] transition-all duration-300 block ${isActive
      ? 'text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/20 px-4 py-2.5 rounded-lg font-bold font-outfit'
      : 'text-zinc-400 hover:text-neon-cyan px-4 py-2.5 border border-transparent'
      }`;
  };

  const appName = flattenedSettings.company_name || appConfig.appName;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const fetchNotifs = async () => {
      if (isAuthenticated && token) {
        const res = await notificationApi.getAll(token);
        if (res.ok && res.data) {
          setNotifications(res.data.data);
        }
      }
    };
    if (isAuthenticated && token && isMounted) {
      fetchNotifs();
      interval = setInterval(fetchNotifs, 30000); // 30s polling
    }
    return () => clearInterval(interval);
  }, [isAuthenticated, token, isMounted]);

  const handleMarkAsRead = async (id: number | 'all') => {
    if (!token) return;
    await notificationApi.markAsRead(token, id);
    setNotifications(prev => prev.map(n =>
      (id === 'all' || n.id === id) ? { ...n, is_read: true } : n
    ));
  };

  const handleDeleteNotification = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!token) return;
    await notificationApi.delete(token, id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleClearAllNotifications = async () => {
    if (!token) return;
    await notificationApi.clearAll(token);
    setNotifications([]);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMenuOpen]);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  return (
    <nav className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/5 py-4">
      <div className="container mx-auto px-6 flex items-center justify-between">
        <Link to={ROUTES.HOME} className="flex items-center gap-2 group">
          {flattenedSettings.logo_url ? (
            <img src={getMediaUrl(flattenedSettings.logo_url)} alt={`${appName} Logo`} className="h-12 w-auto object-contain" />
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-black border border-neon-cyan/50 rounded flex items-center justify-center group-hover:border-neon-cyan transition-colors">
                <span className="text-neon-cyan font-bold text-xl uppercase">{appName.charAt(0)}</span>
              </div>
              <h1 className="text-lg font-bold tracking-tight text-white group-hover:text-neon-cyan transition-colors">{appName}</h1>
            </div>
          )}
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          <Link to={ROUTES.ABOUT} className={getLinkClass(ROUTES.ABOUT)}>About</Link>
          <span className="text-[11px] font-semibold text-zinc-700 uppercase tracking-widest">|</span>
          <Link to={ROUTES.SERVICES} className={getLinkClass(ROUTES.SERVICES)}>Services</Link>
          {/* <span className="text-[11px] font-semibold text-zinc-700 uppercase tracking-widest">|</span> */}
          {/* <Link to={ROUTES.SHOP} className={getLinkClass(ROUTES.SHOP)}>Shop</Link> */}
          <span className="text-[11px] font-semibold text-zinc-700 uppercase tracking-widest">|</span>
          <Link to={ROUTES.CONTACT} className={getLinkClass(ROUTES.CONTACT)}>Contact</Link>

          {isMounted && isAuthenticated ? (
            <div className="flex items-center gap-6">
              <span className="text-[11px] font-semibold text-zinc-700 uppercase tracking-widest">|</span>
              <Link to={ROUTES.REPAIR_STATUS} className={getLinkClass(ROUTES.REPAIR_STATUS)}>Status</Link>
              <span className="text-[11px] font-semibold text-zinc-700 uppercase tracking-widest">|</span>

              <Link to={ROUTES.PROFILE} className={getLinkClass(ROUTES.PROFILE)}>Profile</Link>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest transition-colors">|</span>

              {/* Notification Bell */}
              <div className="relative" ref={notifRef}>
                <button onClick={() => setShowNotifications(!showNotifications)} className="relative text-zinc-400 hover:text-neon-cyan transition-colors cursor-pointer flex items-center">
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                <AnimatePresence>
                  {showNotifications && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 mt-6 w-72 sm:w-80 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl z-50 text-left"
                    >
                      <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-black/50">
                        <h4 className="text-sm font-bold text-white uppercase tracking-widest">System Alerts</h4>
                        <div className="flex gap-2">
                          {unreadCount > 0 && (
                            <button onClick={() => handleMarkAsRead('all')} className="text-[9px] font-mono text-neon-cyan hover:text-white uppercase transition-colors cursor-pointer">Mark all read</button>
                          )}
                          {notifications.length > 0 && (
                            <button onClick={handleClearAllNotifications} className="text-[9px] font-mono text-red-500 hover:text-white uppercase transition-colors cursor-pointer">Clear all</button>
                          )}
                        </div>
                      </div>
                      <div className="max-h-80 overflow-y-auto scrollbar-thin">
                        {notifications.length === 0 ? (
                          <div className="p-6 text-center text-zinc-500 text-xs font-mono">No alerts found.</div>
                        ) : (
                          notifications.map((n) => {
                            const hasTicket = !!n.ticket_number;
                            const handleNotificationClick = async () => {
                              if (!n.is_read) {
                                await handleMarkAsRead(Number(n.id));
                              }
                              setShowNotifications(false);
                              setActiveModalNotif({ ...n, is_read: true });
                            };
                            return (
                              <div
                                key={n.id}
                                onClick={handleNotificationClick}
                                className={`p-4 border-b border-zinc-800/50 transition-colors relative group text-left cursor-pointer ${n.is_read ? 'bg-transparent text-zinc-550 hover:bg-zinc-900/50' : 'bg-neon-cyan/5 text-white hover:bg-neon-cyan/10'}`}
                              >
                                <div className="flex justify-between items-start gap-4">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className={`text-xs font-bold ${n.is_read ? 'text-zinc-600' : 'text-neon-cyan'}`}>{n.title}</p>
                                    {!n.is_read && (
                                      <span className="text-[8px] bg-red-500/10 text-red-400 font-bold px-1 rounded uppercase tracking-wider scale-90 origin-left">New</span>
                                    )}
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteNotification(e, Number(n.id)); }}
                                    className="text-zinc-500 hover:text-red-400 p-0.5 rounded transition-colors shrink-0"
                                    title="Delete notification"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                                <p className="text-[10px] opacity-80 mt-1 mb-2 leading-relaxed">{n.message}</p>
                                {n.sender_name && (
                                  <div className="text-[9px] text-zinc-500 font-mono mb-1">
                                    From: {n.sender_name} {n.sender_email ? `(${n.sender_email})` : ''}
                                  </div>
                                )}
                                {hasTicket && (
                                  <div className="text-[9px] font-mono text-neon-cyan/80 flex items-center gap-0.5 mb-2 hover:underline cursor-pointer">
                                    <span>Related Ticket: {n.ticket_number}</span>
                                    <ArrowUpRight size={10} />
                                  </div>
                                )}
                                <p className="text-[9px] font-mono opacity-45">{new Date(n.created_at).toLocaleString()}</p>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Notification Detail Modal */}
              <AnimatePresence>
                {activeModalNotif && (
                  <div
                    onClick={() => setActiveModalNotif(null)}
                    className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-[9999] animate-fadeIn bg-blur-sm"
                  >
                    <motion.div
                      onClick={(e) => e.stopPropagation()}
                      initial={{ opacity: 0, scale: 0.95, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 20 }}
                      transition={{ duration: 0.2 }}
                      className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative text-left top-50"
                    >
                      <div className="px-6 py-4 border-b border-zinc-900 flex justify-between items-center bg-black/50">
                        <h3 className="text-xs font-bold text-white uppercase tracking-widest font-mono">Notification Details</h3>
                        <button
                          onClick={() => setActiveModalNotif(null)}
                          className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer text-xs font-bold font-mono py-1 px-2 border border-zinc-800"
                        >
                          Close
                        </button>
                      </div>

                      <div className="p-6 space-y-4">
                        {/* Title */}
                        <div>
                          <h4 className="text-sm font-bold text-neon-cyan leading-snug">{activeModalNotif.title}</h4>
                          <span className="text-[9px] font-mono text-zinc-550 mt-1 block">
                            {new Date(activeModalNotif.created_at).toLocaleString()}
                          </span>
                        </div>

                        {/* Extra Information Grid */}
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                          <div className="bg-[#0b0b0b]/60 p-2 rounded-lg border border-zinc-900">
                            <span className="text-zinc-600 block text-[8px] uppercase tracking-wider mb-0.5">Type</span>
                            <span className="text-zinc-300 font-bold">
                              {activeModalNotif.ticket_number || activeModalNotif.ticket_id ? 'Ticket Update' : activeModalNotif.sender_name ? 'User Message' : 'System Alert'}
                            </span>
                          </div>
                          <div className="bg-[#0b0b0b]/60 p-2 rounded-lg border border-zinc-900">
                            <span className="text-zinc-600 block text-[8px] uppercase tracking-wider mb-0.5">Status</span>
                            <span className={`font-bold ${activeModalNotif.is_read ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {activeModalNotif.is_read ? 'Read' : 'Unread'}
                            </span>
                          </div>
                        </div>

                        {/* Message */}
                        <div className="bg-zinc-900/40 p-4 border border-zinc-900 rounded-xl">
                          <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">{activeModalNotif.message}</p>
                        </div>

                        {/* Sender Metadata */}
                        {activeModalNotif.sender_name && (
                          <div className="text-[11px] text-zinc-400 font-mono">
                            <span className="text-zinc-650 block text-[9px] uppercase tracking-wider mb-1">Sender Info</span>
                            <div className="bg-[#0c0c0c] p-3 rounded-xl border border-zinc-900">
                              <strong>Name:</strong> {activeModalNotif.sender_name} <br />
                              <strong>Email:</strong> {activeModalNotif.sender_email || 'N/A'}
                            </div>
                          </div>
                        )}

                        {/* Related Ticket Info */}
                        {activeModalNotif.ticket_number && (
                          <div className="space-y-1 font-mono">
                            <span className="text-zinc-650 block text-[9px] uppercase tracking-wider mb-1">Related Ticket</span>
                            <div className="flex justify-between items-center bg-neon-cyan/5 p-3 border border-neon-cyan/15 rounded-xl">
                              <span className="text-xs font-bold text-white">#{activeModalNotif.ticket_number}</span>
                              <button
                                onClick={() => {
                                  navigate(`${ROUTES.REPAIR_STATUS}?ticket=${activeModalNotif.ticket_number}`);
                                  setActiveModalNotif(null);
                                  setShowNotifications(false);
                                }}
                                className="text-[10px] bg-neon-cyan hover:bg-neon-cyan/80 text-black font-bold uppercase py-1.5 px-3 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-[0_0_10px_rgba(0,242,255,0.2)]"
                              >
                                <span>Track Ticket</span>
                                <ArrowUpRight size={10} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest transition-colors">|</span>

              <span className="text-[10px] text-neon-cyan font-mono">USER_{user?.name?.toUpperCase()}</span>
              <button
                onClick={logout}
                className="text-[11px] font-semibold text-red-500/80 hover:text-red-500 uppercase tracking-widest transition-colors cursor-pointer"
              >
                Logout
              </button>
            </div>
          ) : isMounted ? (
            <>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest transition-colors">|</span>
              <Link to={ROUTES.SIGN_IN} className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">Sign In</Link>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-4">
          {/* Hide floating Repair button for Admin/Company/Tech as it's in their main nav */}
          <Link to={ROUTES.REPAIR} className="hidden sm:block">
            <button className="btn-neon cursor-pointer flex items-center gap-2 group relative py-2 px-4">
              <span className="relative z-10 font-bold uppercase text-[10px] tracking-widest transition-colors duration-300">Book A Repair</span>
              <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse group-hover:scale-125 transition-transform" />
            </button>
          </Link>

          {/* Hamburger Menu Toggle */}
          <button
            type="button"
            onClick={toggleMenu}
            className="md:hidden p-2 text-zinc-400 hover:text-neon-cyan transition-colors"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop for click-outside-to-close */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={toggleMenu}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[-1] md:hidden"
            />

            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-[#0a0a0a] border-b border-white/5 overflow-hidden relative z-50"
            >
              <div className="flex flex-col p-6 space-y-6">
                <Link to={ROUTES.ABOUT} onClick={toggleMenu} className={getMobileLinkClass(ROUTES.ABOUT)}>About</Link>
                <Link to={ROUTES.SERVICES} onClick={toggleMenu} className={getMobileLinkClass(ROUTES.SERVICES)}>Services</Link>
                {/* <Link to={ROUTES.SHOP} onClick={toggleMenu} className={getMobileLinkClass(ROUTES.SHOP)}>Shop</Link> */}
                <Link to={ROUTES.CONTACT} onClick={toggleMenu} className={getMobileLinkClass(ROUTES.CONTACT)}>Contact</Link>

                <div className="pt-6 border-t border-white/5 flex flex-col space-y-6">
                  {isMounted && isAuthenticated ? (
                    <>
                      <Link to={ROUTES.PROFILE} onClick={toggleMenu} className={getMobileLinkClass(ROUTES.PROFILE)}>Profile settings</Link>
                      <Link to={ROUTES.REPAIR_STATUS} onClick={toggleMenu} className={getMobileLinkClass(ROUTES.REPAIR_STATUS)}>Repair Status</Link>
                      {/* <Link to={ROUTES.BILLING} onClick={toggleMenu} className={getMobileLinkClass(ROUTES.BILLING)}>Billing</Link> */}

                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-neon-cyan font-mono">USER_{user?.name?.toUpperCase()}</span>
                        <button
                          onClick={() => { logout(); toggleMenu(); }}
                          className="text-xs font-semibold text-red-500/80 hover:text-red-500 uppercase tracking-[0.2em] transition-colors"
                        >
                          Disconnect
                        </button>
                      </div>
                    </>
                  ) : isMounted ? (
                    <Link to={ROUTES.SIGN_IN} onClick={toggleMenu} className="text-xs font-semibold text-neon-cyan uppercase tracking-[0.2em] transition-colors">Auth Terminal (Sign In)</Link>
                  ) : null}

                  <Link to={ROUTES.REPAIR} onClick={toggleMenu} className="sm:hidden">
                    <button className="w-full btn-neon py-4 text-center font-bold uppercase text-[10px] tracking-[0.3em]">
                      Book A Repair
                    </button>
                  </Link>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
