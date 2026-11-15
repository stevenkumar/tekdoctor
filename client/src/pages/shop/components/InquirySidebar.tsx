'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, ShoppingBag, Trash2, Send, ChevronRight } from 'lucide-react';

interface InquirySidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  items: any[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

export default function InquirySidebar({ isOpen, setIsOpen, items, onRemove, onClear }: InquirySidebarProps) {
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow || '';
    };
  }, [isOpen, setIsOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.01 : 0.2 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Sidebar */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Inquiry List"
            initial={shouldReduceMotion ? { opacity: 0 } : { x: '100%' }}
            animate={shouldReduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { x: '100%' }}
            transition={shouldReduceMotion ? { duration: 0.1 } : { type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-zinc-950 border-l border-zinc-800/80 shadow-2xl z-[101] flex flex-col"
          >
            {/* Header */}
            <div className="p-8 border-b border-zinc-800/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-neon-cyan/10 rounded-2xl text-neon-cyan">
                  <ShoppingBag size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Inquiry List</h2>
                  <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">{items.length} items collected</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                title="Close inquiry list"
                aria-label="Close inquiry list"
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-500 hover:text-white transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X size={20} />
              </button>
            </div>

            {/* List */}
            <div className="flex-grow overflow-y-auto p-8 space-y-4">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-30">
                  <ShoppingBag size={64} className="text-zinc-600" />
                  <p className="text-sm font-medium text-zinc-500">Your inquiry list is empty</p>
                </div>
              ) : (
                items.map((item) => (
                  <motion.div
                    key={item.id}
                    layout={!shouldReduceMotion}
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    transition={{ duration: shouldReduceMotion ? 0.01 : 0.2 }}
                    className="p-4 bg-zinc-900/40 border border-zinc-800/60 rounded-2xl flex items-center justify-between group"
                  >
                    <div className="flex flex-col gap-1">
                      <h4 className="text-sm font-bold text-white group-hover:text-neon-cyan transition-colors">
                        {item.name || 'Unknown Item'}
                      </h4>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase">
                          {item.price || item.weeklyPrice || 'Quote Required'}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
                          item.weeklyPrice ? 'border-purple-500/30 text-purple-400' : 'border-neon-cyan/30 text-neon-cyan'
                        }`}>
                          {item.weeklyPrice ? 'RENTAL' : 'PURCHASE'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => onRemove(item.id)}
                      title="Remove from inquiry list"
                      aria-label={`Remove ${item.name || 'item'} from inquiry list`}
                      className="p-2 text-zinc-600 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </motion.div>
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="p-8 border-t border-zinc-800/80 space-y-4 bg-zinc-950">
                <button
                  onClick={onClear}
                  className="w-full py-3 text-xs font-bold text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  Clear All Items
                </button>
                <button
                  className="w-full py-4 bg-neon-cyan hover:bg-neon-cyan text-black font-black uppercase tracking-widest text-xs rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-neon-cyan/20 transition-all active:scale-[0.98] cursor-pointer"
                >
                  Submit Inquiry Bundle
                  <Send size={16} />
                </button>
                <div className="flex items-center justify-center gap-2 py-2">
                   <div className="h-[1px] w-8 bg-zinc-800" />
                   <p className="text-[9px] text-zinc-600 uppercase tracking-[0.3em]">Tekunik Integrated Solutions</p>
                   <div className="h-[1px] w-8 bg-zinc-800" />
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
