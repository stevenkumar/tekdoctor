import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Suspense, useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/routes';
import { SkeletonDashboard } from '@/components/Skeleton';
import { useSiteContext } from '@/context/SiteContext';
import { appConfig } from '@/config/appConfig';
import { getMediaUrl } from '@/utils/media';
import {
    LayoutDashboard, Wrench, Users, UserCog, Bell, MessageSquare,
    Settings, Globe, Mail, BarChart3, ScrollText, UserCircle,
    LogOut, ChevronLeft, ChevronRight, Menu, X, ChevronDown, Star, Building2,
    ArrowUpRight, Trash2, ArrowRightLeft, ClipboardList, Cpu, Receipt
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface NavItem {
    label?: string;
    icon?: any;
    path?: string;
    divider?: boolean;
    subItems?: { label: string; path: string }[];
}

const technicianNavItems: NavItem[] = [
    { label: 'Dashboard', icon: LayoutDashboard, path: ROUTES.TECHNICIAN_DASHBOARD },
    { label: 'My Assigned Tasks', icon: ClipboardList, path: ROUTES.TECHNICIAN_ASSIGNED_TICKETS },
    { label: 'Task Transfer', icon: ArrowRightLeft, path: ROUTES.TECHNICIAN_TRANSFERS },
    { label: 'Diagnosis & Estimate', icon: Cpu, path: ROUTES.TECHNICIAN_DIAGNOSIS },
    { label: 'Notifications', icon: Bell, path: ROUTES.TECHNICIAN_NOTIFICATIONS },
    { divider: true },
    { label: 'My Profile', icon: UserCircle, path: ROUTES.TECHNICIAN_PROFILE },
];

const navItems: NavItem[] = [
    { label: 'Dashboard', icon: LayoutDashboard, path: ROUTES.ADMIN_DASHBOARD },
    { label: 'Repair Tickets', icon: Wrench, path: ROUTES.ADMIN_TICKETS },
    { label: 'Task Transfers', icon: ArrowRightLeft, path: ROUTES.ADMIN_TRANSFERS },
    { label: 'Technicians', icon: UserCog, path: ROUTES.ADMIN_TECHNICIANS },
    { label: 'Customers', icon: Users, path: `${ROUTES.ADMIN_CUSTOMERS}?type=individual` },
    { label: 'Companies', icon: Building2, path: ROUTES.ADMIN_COMPANIES },
    { label: 'Billing / Invoices', icon: Receipt, path: ROUTES.BILLING },
    { label: 'Notifications', icon: Bell, path: ROUTES.ADMIN_NOTIFICATIONS },
    { label: 'Contact Messages', icon: MessageSquare, path: ROUTES.ADMIN_CONTACTS },
    { divider: true },
    { label: 'Website Settings', icon: Settings, path: ROUTES.ADMIN_WEBSITE_SETTINGS },
    { label: 'Reviews & Feedback', icon: Star, path: ROUTES.ADMIN_REVIEWS },
    { label: 'Email Settings', icon: Mail, path: ROUTES.ADMIN_EMAIL_SETTINGS },
    { divider: true },
    { label: 'Reports', icon: BarChart3, path: ROUTES.ADMIN_REPORTS },
    { label: 'Activity Logs', icon: ScrollText, path: ROUTES.ADMIN_ACTIVITY_LOGS },
    { label: 'My Profile', icon: UserCircle, path: ROUTES.ADMIN_PROFILE },
];

export default function AdminLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
    const { flattenedSettings } = useSiteContext();

    const currentNavItems = user?.role === 'technician' ? technicianNavItems : navItems;

    const locationRef = useRef(location.pathname);
    locationRef.current = location.pathname;

    // Global keyboard shortcut: Ctrl+K / Cmd+K to open/focus existing Admin Search
    useEffect(() => {
        if (user?.role !== 'admin') return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                const target = e.target as HTMLElement | null;
                const isEditable = target && (
                    target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'SELECT' ||
                    target.isContentEditable
                );

                // Do not trigger when actively typing inside an editable field unless it's the search input itself
                if (isEditable && target?.id !== 'admin-search-input') {
                    return;
                }

                e.preventDefault();

                if (locationRef.current === ROUTES.ADMIN_TICKETS) {
                    const searchInput = document.getElementById('admin-search-input') as HTMLInputElement | null;
                    if (searchInput) {
                        searchInput.focus();
                    }
                } else {
                    navigate(ROUTES.ADMIN_TICKETS, { state: { focusSearch: true } });
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [user?.role, navigate]);


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
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-cyan to-blue-600 flex items-center justify-center">
                                        <Wrench size={16} className="text-white" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white font-outfit tracking-tight">{flattenedSettings.company_name || 'TekDoctor'}</div>
                                        <div className="text-[9px] font-mono text-neon-cyan uppercase tracking-widest">{user?.role === 'technician' ? 'Technician Portal' : 'Admin Panel'}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {collapsed && (
                        flattenedSettings.logo_url ? (
                            <img src={getMediaUrl(flattenedSettings.logo_url)} alt="Logo" className="h-8 w-auto object-contain mx-auto" />
                        ) : (
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-cyan to-blue-600 flex items-center justify-center mx-auto">
                                <Wrench size={16} className="text-white" />
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
                    {currentNavItems.map((item, i) => {
                        if ('divider' in item) {
                            return <div key={`d-${i}`} className="my-2 border-t border-zinc-900/60" />;
                        }
                        const Icon = item.icon!;
                        if ('subItems' in item) {
                            const isExpanded = expandedMenu === item.label;
                            // Check if any subItem matches the current path + search or just path
                            const isActive = item.subItems!.some(s => {
                                const [p, q] = s.path.split('?');
                                return location.pathname === p && (q ? location.search === `?${q}` : true);
                            });
                            return (
                                <div key={item.label}>
                                    <button
                                        onClick={() => setExpandedMenu(isExpanded ? null : (item.label ?? null))}
                                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${isActive ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/40 border border-transparent'} ${collapsed ? 'justify-center' : ''}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Icon size={18} className="shrink-0" />
                                            {!collapsed && <span>{item.label}</span>}
                                        </div>
                                        {!collapsed && <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />}
                                    </button>
                                    {isExpanded && !collapsed && (
                                        <div className="pl-9 pr-3 py-1 mt-1 space-y-1">
                                            {item.subItems!.map(sub => {
                                                const [subPath, subQuery] = sub.path.split('?');
                                                const isSubActive = location.pathname === subPath && (subQuery ? location.search === `?${subQuery}` : true);
                                                return (
                                                    <NavLink
                                                        key={sub.label}
                                                        to={sub.path}
                                                        onClick={() => setMobileOpen(false)}
                                                        className={`block px-3 py-2 rounded-lg text-xs font-medium transition-all ${isSubActive ? 'bg-neon-cyan/10 text-neon-cyan font-bold border border-neon-cyan/20' : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40 border border-transparent'}`}
                                                    >
                                                        {sub.label}
                                                    </NavLink>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        return (
                            <NavLink
                                key={item.path}
                                to={item.path!}
                                onClick={() => setMobileOpen(false)}
                                className={({ isActive }) => `
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group
                  ${isActive
                                        ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20'
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
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-neon-cyan uppercase">
                                {user?.name?.charAt(0) || 'A'}
                            </div>
                            <div className="min-w-0">
                                <div className="text-xs font-semibold text-white truncate">{user?.name || (user?.role === 'technician' ? 'Technician' : 'Admin')}</div>
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
            <main className="flex-grow min-h-screen flex flex-col relative w-full max-w-full overflow-x-hidden">
                {/* Mobile Top Header Bar */}
                <header className="lg:hidden h-14 border-b border-zinc-900/80 bg-[#0a0a0a] flex items-center justify-between px-3 sm:px-4 sticky top-0 z-30">
                    <button
                        onClick={() => setMobileOpen(true)}
                        className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white shadow-sm hover:bg-zinc-800 transition-all cursor-pointer"
                        title="Open navigation menu"
                    >
                        <Menu size={18} />
                    </button>
                    <div className="flex items-center gap-2">
                        {flattenedSettings.logo_url ? (
                            <img src={getMediaUrl(flattenedSettings.logo_url)} alt="Logo" className="h-6 w-auto object-contain" />
                        ) : (
                            <div className="flex items-center gap-1.5">
                                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-neon-cyan to-blue-600 flex items-center justify-center">
                                    <Wrench size={12} className="text-white" />
                                </div>
                                <span className="text-xs font-bold text-white font-outfit tracking-tight">{flattenedSettings.company_name || 'TekDoctor'}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {user?.role === 'technician' ? (
                            <NavLink
                                to={ROUTES.TECHNICIAN_NOTIFICATIONS}
                                className={({ isActive }) => `p-2 rounded-xl border transition-all flex items-center justify-center ${
                                    isActive
                                        ? 'bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan'
                                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                                }`}
                                title="Notifications"
                            >
                                <Bell size={16} />
                            </NavLink>
                        ) : (
                            <NavLink
                                to={ROUTES.ADMIN_NOTIFICATIONS}
                                className={({ isActive }) => `p-2 rounded-xl border transition-all flex items-center justify-center ${
                                    isActive
                                        ? 'bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan'
                                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                                }`}
                                title="Notifications"
                            >
                                <Bell size={16} />
                            </NavLink>
                        )}
                    </div>
                </header>

                {/* Page content */}
                <div className="flex-1 p-2.5 sm:p-4 md:p-6 lg:p-8 overflow-x-hidden">
                    <Suspense fallback={<SkeletonDashboard />}>
                        <Outlet />
                    </Suspense>
                </div>
            </main>
        </div>
    );
}
