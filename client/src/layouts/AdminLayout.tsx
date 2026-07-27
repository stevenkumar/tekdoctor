import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/routes';
import { useState, useEffect, useRef } from 'react';
import { useSiteContext } from '@/context/SiteContext';
import { appConfig } from '@/config/appConfig';
import { getMediaUrl } from '@/utils/media';
import {
    LayoutDashboard, Wrench, Users, UserCog, Bell, MessageSquare,
    Settings, Globe, Mail, BarChart3, ScrollText, UserCircle,
    LogOut, ChevronLeft, ChevronRight, Menu, X, ChevronDown, Star, Building2,
    ArrowUpRight, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: ROUTES.ADMIN_DASHBOARD },
    { label: 'Repair Tickets', icon: Wrench, path: ROUTES.ADMIN_TICKETS },
    { label: 'Technicians', icon: UserCog, path: ROUTES.ADMIN_TECHNICIANS },
    { label: 'Customers', icon: Users, path: `${ROUTES.ADMIN_CUSTOMERS}?type=individual` },
    {
        label: 'Company Accounts',
        icon: Building2,
        subItems: [
            { label: 'Manage Companies', path: `${ROUTES.ADMIN_CUSTOMERS}?type=company` },
            { label: 'Create Company', path: `${ROUTES.ADMIN_CUSTOMERS}?type=company&action=create` }
        ]
    },
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
    const [expandedMenu, setExpandedMenu] = useState<string | null>('Customers');
    const { flattenedSettings } = useSiteContext();

    const currentNavItems = user?.role === 'technician'
        ? [
            { label: 'Dashboard', icon: LayoutDashboard, path: ROUTES.TECHNICIAN_DASHBOARD }
        ]
        : navItems;


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
                                        <div className="text-[9px] font-mono text-neon-cyan uppercase tracking-widest">Admin Panel</div>
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
                                        onClick={() => setExpandedMenu(isExpanded ? null : item.label)}
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
                                <div className="text-xs font-semibold text-white truncate">{user?.name || 'Admin'}</div>
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
            <main className="flex-grow min-h-screen flex flex-col relative w-full overflow-x-hidden">
                {/* Floating Mobile Toggle Button */}
                <button
                    onClick={() => setMobileOpen(true)}
                    className="lg:hidden absolute top-4 left-4 z-40 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white shadow-xl hover:bg-zinc-800 transition-all cursor-pointer"
                >
                    <Menu size={20} />
                </button>
                {/* Page content */}
                <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
