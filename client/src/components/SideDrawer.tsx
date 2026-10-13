import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export interface SideBadgeConfig {
    text: string;
    variant?: 'success' | 'warning' | 'info' | 'danger' | 'default';
}

export interface SideDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    badge?: React.ReactNode | SideBadgeConfig;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
    children: React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
}

const sizeClasses: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    '2xl': 'max-w-3xl',
    full: 'max-w-5xl'
};

export const SideDrawer: React.FC<SideDrawerProps> = ({
    isOpen,
    onClose,
    title,
    subtitle,
    badge,
    size = 'lg',
    children,
    footer,
    className = ''
}) => {
    const renderBadge = () => {
        if (!badge) return null;
        if (React.isValidElement(badge) || typeof badge === 'string' || typeof badge === 'number') {
            return badge;
        }
        const b = badge as SideBadgeConfig;
        const variantStyles: Record<string, string> = {
            success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
            warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
            info: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
            danger: 'bg-red-500/10 text-red-400 border-red-500/20',
            default: 'bg-zinc-800 text-zinc-300 border-zinc-700'
        };
        return (
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${variantStyles[b.variant || 'default']}`}>
                {b.text}
            </span>
        );
    };
    // Handle Escape key to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            // Prevent background scroll when drawer is open
            document.body.style.overflow = 'hidden';
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 overflow-hidden">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                        onClick={onClose}
                        aria-hidden="true"
                    />

                    {/* Drawer Slide-in Panel */}
                    <div className="fixed inset-y-0 right-0 flex max-w-full pl-0 sm:pl-6">
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                            className={`w-full sm:w-screen ${sizeClasses[size] || sizeClasses.lg} bg-[#0a0a0a] border-l border-zinc-800/80 shadow-2xl flex flex-col z-10 ${className}`}
                        >
                            {/* Drawer Header */}
                            <div className="p-4 sm:p-5 border-b border-zinc-800/80 flex items-center justify-between shrink-0 bg-[#0d0d0d]/80 backdrop-blur-md sticky top-0 z-20">
                                <div className="min-w-0 pr-4">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <h3 className="text-base font-bold text-white font-outfit tracking-tight truncate">
                                            {title}
                                        </h3>
                                        {renderBadge()}
                                    </div>
                                    {subtitle && (
                                        <p className="text-xs text-zinc-400 mt-0.5 truncate font-mono">
                                            {subtitle}
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
                                    title="Close panel (Esc)"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Drawer Body */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
                                {children}
                            </div>

                            {/* Optional Drawer Footer */}
                            {footer && (
                                <div className="p-4 border-t border-zinc-800/80 bg-[#0d0d0d]/80 backdrop-blur-md shrink-0 flex items-center justify-end gap-3">
                                    {footer}
                                </div>
                            )}
                        </motion.div>
                    </div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default SideDrawer;
