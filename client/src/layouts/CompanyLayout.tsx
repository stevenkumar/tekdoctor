import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../config/routes';
import FeedbackWidget from '../components/FeedbackWidget';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSiteContext } from '@/context/SiteContext';
import { appConfig } from '@/config/appConfig';
import { getMediaUrl } from '@/utils/media';
import { notificationApi } from '../services/api';
import type { NotificationItem } from '../services/api';
import {
    LayoutDashboard, Users, Smartphone, Wrench, Building2,
    MessageSquare, UserCircle, LogOut, ChevronLeft, ChevronRight, Menu, X, Terminal,
    CreditCard, Bell, Trash2, ArrowUpRight
} from 'lucide-react';

const companyNavItems = [
    { label: 'Overview', icon: LayoutDashboard, path: ROUTES.COMPANY_DASHBOARD },
    { label: 'Branches', icon: Building2, path: ROUTES.COMPANY_BRANCHES },
    { label: 'Employees', icon: Users, path: ROUTES.COMPANY_EMPLOYEES },
    { label: 'Tracked Assets', icon: Smartphone, path: ROUTES.COMPANY_DEVICES },
    { label: 'Service Tickets', icon: Wrench, path: ROUTES.COMPANY_REPAIRS },
    { label: 'Messages', icon: MessageSquare, path: ROUTES.COMPANY_MESSAGES },
    { label: 'Billing & Quotes', icon: CreditCard, path: ROUTES.COMPANY_BILLING },
    { label: 'Security Logs', icon: Terminal, path: ROUTES.COMPANY_ACTIVITY_LOGS },
    { divider: true },
    { label: 'Company Profile', icon: UserCircle, path: ROUTES.COMPANY_PROFILE },
];

export default function CompanyLayout() {
    const { user, logout, token } = useAuth();
    const navigate = useNavigate();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { flattenedSettings } = useSiteContext();


    // Notifications State & Logic
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [activeModalNotif, setActiveModalNotif] = useState<NotificationItem | null>(null);
    const notifRef = useRef<HTMLDivElement>(null);
    const unreadCount = notifications.filter(n => !n.is_read).length;

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        const fetchNotifs = async () => {
            if (user && token) {
                const res = await notificationApi.getAll(token);
                if (res.ok && res.data) {
                    setNotifications(res.data.data);
                }
            }
        };

        if (user && token) {
            fetchNotifs();
            interval = setInterval(fetchNotifs, 30000); // 30s polling
        }
        return () => clearInterval(interval);
    }, [user, token]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
                setShowNotifications(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

    const handleLogout = () => {
        logout();
        navigate(ROUTES.SIGNIN);
    };

    const sidebarWidth = collapsed ? 'w-[72px]' : 'w-64';

    return (
        <div className="min-h-screen bg-[#050505] text-zinc-300 flex">
            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed lg:sticky top-0 left-0 z-50 h-screen flex flex-col
                bg-[#0a0a0a] border-r border-zinc-900/80 transition-all duration-300
                ${sidebarWidth}
                ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                {/* Logo area */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-zinc-900/80 shrink-0">
                    {!collapsed && (
                        <div className="flex items-center gap-2">
                            {flattenedSettings.logo_url ? (
                                <img src={getMediaUrl(flattenedSettings.logo_url)} alt="Logo" className="h-8 w-auto object-contain" />
                            ) : (
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center">
                                        <Building2 size={16} className="text-white" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white font-outfit tracking-tight">{flattenedSettings.company_name || 'TekDoctor'}</div>
                                        <div className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest">Company Portal</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {collapsed && (
                        flattenedSettings.logo_url ? (
                            <img src={getMediaUrl(flattenedSettings.logo_url)} alt="Logo" className="h-8 w-auto object-contain mx-auto" />
                        ) : (
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center mx-auto">
                                <Building2 size={16} className="text-white" />
                            </div>
                        )
                    )}
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="hidden lg:flex p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                    >
                        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                    <button
                        onClick={() => setMobileOpen(false)}
                        className="lg:hidden p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Nav items */}
                <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 scrollbar-thin scrollbar-thumb-zinc-800">
                    {companyNavItems.map((item, i) => {
                        if ('divider' in item) {
                            return <div key={`d-${i}`} className="my-2 border-t border-zinc-900/60" />;
                        }
                        const Icon = item.icon!;
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path!}
                                onClick={() => setMobileOpen(false)}
                                className={({ isActive }) => `
                                    flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group
                                    ${isActive
                                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                        : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/40 border border-transparent'
                                    }
                                    ${collapsed ? 'justify-center px-0' : ''}
                                `}
                            >
                                <Icon size={18} className="shrink-0" />
                                {!collapsed && <span className="truncate">{item.label}</span>}
                            </NavLink>
                        );
                    })}
                </nav>

                {/* Bottom user */}
                <div className="p-3 border-t border-zinc-900/80 shrink-0">
                    {!collapsed && (
                        <div className="flex items-center gap-3 px-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white uppercase">
                                {user?.name?.charAt(0) || 'C'}
                            </div>
                            <div className="min-w-0">
                                <div className="text-xs font-semibold text-white truncate">{user?.name || 'Company'}</div>
                                <div className="text-[10px] text-zinc-600 font-mono truncate">{user?.email}</div>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        className={`
                            w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold
                            bg-zinc-900/40 border border-zinc-800 hover:border-red-500/30 text-zinc-500 hover:text-red-400
                            transition-all cursor-pointer
                            ${collapsed ? 'justify-center' : ''}
                        `}
                    >
                        <LogOut size={14} />
                        {!collapsed && 'Logout'}
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 min-h-screen flex flex-col">
                {/* Top Header Bar */}
                <header className="h-16 border-b border-zinc-900/80 bg-[#0a0a0a] flex items-center justify-between px-4 md:px-6 sticky top-0 z-30">
                    {/* Left: Mobile Toggle & Sidebar Brand Visuals */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setMobileOpen(true)}
                            className="lg:hidden p-2 rounded-xl hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all cursor-pointer"
                        >
                            <Menu size={20} />
                        </button>
                        <div className="flex items-center gap-2 lg:hidden">
                            {flattenedSettings.logo_url ? (
                                <img src={getMediaUrl(flattenedSettings.logo_url)} alt="Logo" className="h-6 w-auto object-contain" />
                            ) : (
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center">
                                        <Building2 size={12} className="text-white" />
                                    </div>
                                    <span className="text-sm font-bold text-white font-outfit">B2B Portal</span>
                                </div>
                            )}
                        </div>

                        {/* Desktop Breadcrumbs/Section Indicator */}
                        <div className="hidden lg:flex items-center gap-2">
                            <span className="text-[10px] font-mono text-zinc-650 tracking-wider">WORKSPACE /</span>
                            <span className="text-[10px] font-mono font-bold text-indigo-400 tracking-widest uppercase">B2B Dashboards</span>
                        </div>
                    </div>

                    {/* Right: Notifications & Quick Access */}
                    <div className="flex items-center gap-4">
                        {/* Notification Bell Dropdown */}
                        <div className="relative" ref={notifRef}>
                            <button
                                onClick={() => setShowNotifications(!showNotifications)}
                                className="relative p-2 rounded-xl bg-zinc-900/40 border border-zinc-800 text-zinc-400 hover:text-indigo-400 hover:border-indigo-500/20 hover:bg-indigo-500/5 transition-all duration-300 cursor-pointer flex items-center justify-center"
                            >
                                <Bell size={16} />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-red-500 rounded-full text-[8.5px] font-bold text-white flex items-center justify-center animate-pulse">
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                            </button>

                            <AnimatePresence>
                                {showNotifications && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 12, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 12, scale: 0.95 }}
                                        transition={{ duration: 0.15 }}
                                        className="absolute right-0 mt-3 w-80 bg-[#0a0a0a] border border-zinc-900 rounded-2xl overflow-hidden shadow-2xl z-50 text-left"
                                    >
                                        <div className="p-4 border-b border-zinc-950 flex justify-between items-center bg-[#070707]">
                                            <h4 className="text-[11px] font-bold text-white uppercase tracking-widest font-mono">B2B Notifications</h4>
                                            <div className="flex gap-2">
                                                {unreadCount > 0 && (
                                                    <button
                                                        onClick={() => handleMarkAsRead('all')}
                                                        className="text-[9px] font-mono text-indigo-400 hover:text-white uppercase transition-colors cursor-pointer"
                                                    >
                                                        Mark all read
                                                    </button>
                                                )}
                                                {notifications.length > 0 && (
                                                    <button
                                                        onClick={handleClearAllNotifications}
                                                        className="text-[9px] font-mono text-red-500 hover:text-white uppercase transition-colors cursor-pointer"
                                                    >
                                                        Clear all
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-850">
                                            {notifications.length === 0 ? (
                                                <div className="p-8 text-center text-zinc-655 text-xs font-mono">
                                                    No notifications received.
                                                </div>
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
                                                            className={`p-4 border-b border-zinc-950 transition-all relative group text-left cursor-pointer ${n.is_read
                                                                ? 'bg-transparent text-zinc-550 hover:bg-zinc-900/30'
                                                                : 'bg-indigo-500/[0.02] hover:bg-[#0f0f0f] border-l-2 border-l-indigo-500 text-white'
                                                                }`}
                                                        >
                                                            <div className="flex justify-between items-start gap-4 mb-1">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <p className={`text-xs font-bold ${n.is_read ? 'text-zinc-600' : 'text-indigo-400'}`}>
                                                                        {n.title}
                                                                    </p>
                                                                    {!n.is_read && (
                                                                        <span className="text-[8px] bg-red-500/10 text-red-400 font-bold px-1 rounded uppercase tracking-wider scale-90 origin-left">New</span>
                                                                    )}
                                                                </div>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteNotification(e, Number(n.id)); }}
                                                                    className="text-zinc-650 hover:text-red-400 p-0.5 rounded transition-colors shrink-0"
                                                                    title="Delete notification"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                            <p className="text-[10px] opacity-80 leading-relaxed mb-1.5 font-normal">
                                                                {n.message}
                                                            </p>
                                                            {n.sender_name && (
                                                                <div className="text-[9px] text-zinc-500 font-mono mb-1">
                                                                    From: {n.sender_name} {n.sender_email ? `(${n.sender_email})` : ''}
                                                                </div>
                                                            )}
                                                            {hasTicket && (
                                                                <div className="text-[9px] font-mono text-indigo-400/80 flex items-center gap-0.5 mb-2 hover:underline cursor-pointer">
                                                                    <span>Related Ticket: {n.ticket_number}</span>
                                                                    <ArrowUpRight size={10} />
                                                                </div>
                                                            )}
                                                            <p className="text-[9px] font-mono text-zinc-600">
                                                                {new Date(n.created_at).toLocaleString()}
                                                            </p>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </header>

                {/* B2B Notification Detail Modal */}
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
                                className="bg-[#0a0a0a] border border-zinc-900 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative text-left"
                            >
                                <div className="px-6 py-4 border-b border-zinc-950 flex justify-between items-center bg-[#070707]">
                                    <h3 className="text-[11px] font-bold text-white uppercase tracking-widest font-mono">Notification Details</h3>
                                    <button
                                        onClick={() => setActiveModalNotif(null)}
                                        className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer text-xs font-bold font-mono py-1 px-2 border border-zinc-900"
                                    >
                                        Close
                                    </button>
                                </div>

                                <div className="p-6 space-y-4">
                                    {/* Title */}
                                    <div>
                                        <h4 className="text-sm font-bold text-indigo-400 leading-snug">{activeModalNotif.title}</h4>
                                        <span className="text-[9px] font-mono text-zinc-550 mt-1 block">
                                            {new Date(activeModalNotif.created_at).toLocaleString()}
                                        </span>
                                    </div>

                                    {/* Extra Information Grid */}
                                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                                        <div className="bg-[#0b0b0b]/60 p-2 rounded-lg border border-zinc-900">
                                            <span className="text-zinc-[650] block text-[8px] uppercase tracking-wider mb-0.5">Type</span>
                                            <span className="text-zinc-350 font-bold">
                                                {activeModalNotif.ticket_number || activeModalNotif.ticket_id ? 'Ticket Update' : activeModalNotif.sender_name ? 'User Message' : 'System Alert'}
                                            </span>
                                        </div>
                                        <div className="bg-[#0b0b0b]/60 p-2 rounded-lg border border-zinc-900">
                                            <span className="text-zinc-[650] block text-[8px] uppercase tracking-wider mb-0.5">Status</span>
                                            <span className={`font-bold ${activeModalNotif.is_read ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                {activeModalNotif.is_read ? 'Read' : 'Unread'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Message */}
                                    <div className="bg-zinc-950 p-4 border border-zinc-900/60 rounded-xl">
                                        <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">{activeModalNotif.message}</p>
                                    </div>

                                    {/* Sender Info */}
                                    {activeModalNotif.sender_name && (
                                        <div className="text-[11px] text-zinc-400 font-mono">
                                            <span className="text-zinc-650 block text-[9px] uppercase tracking-wider mb-1">Sender Info</span>
                                            <div className="bg-[#050505] p-3 rounded-xl border border-zinc-950">
                                                <strong>Name:</strong> {activeModalNotif.sender_name} <br />
                                                <strong>Email:</strong> {activeModalNotif.sender_email || 'N/A'}
                                            </div>
                                        </div>
                                    )}

                                    {/* Related Ticket Info */}
                                    {activeModalNotif.ticket_number && (
                                        <div className="space-y-1 font-mono">
                                            <span className="text-zinc-655 block text-[9px] uppercase tracking-wider mb-1">Related Ticket</span>
                                            <div className="flex justify-between items-center bg-[#070707] p-3 border border-zinc-900 rounded-xl">
                                                <span className="text-xs font-bold text-white">#{activeModalNotif.ticket_number}</span>
                                                <button
                                                    onClick={() => {
                                                        navigate(ROUTES.COMPANY_REPAIRS);
                                                        setActiveModalNotif(null);
                                                        setShowNotifications(false);
                                                    }}
                                                    className="text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase py-1.5 px-3 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-lg"
                                                >
                                                    <span>View Tickets</span>
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

                {/* Page content */}
                <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
                    <Outlet />
                </div>
            </main>
            <FeedbackWidget />
        </div >
    );
}
