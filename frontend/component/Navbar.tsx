'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../app/context/AuthContext';

const Navbar = () => {
  const { isAuthenticated, logout, user } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-10 h-10 bg-black border border-neon-cyan/50 rounded flex items-center justify-center group-hover:border-neon-cyan transition-colors">
            <span className="text-neon-cyan font-bold text-xl">+</span>
          </div>
          <div className="leading-tight">
            <h1 className="text-lg font-bold tracking-tight text-white group-hover:text-neon-cyan transition-colors">The Tek Doctor</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em]">A subdivision of tekunik.in</p>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          <Link href="/about" className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">About</Link>
          <span className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">|</span>
          <Link href="/services" className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">Services</Link>
          <span className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">|</span>
          <Link href="/shop" className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">Shop</Link>
          <span className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">|</span>
          <Link href="/contact" className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">Contact</Link>
          
          {isAuthenticated ? (
            <div className="flex items-center gap-6">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest transition-colors">|</span>
              <Link href="/repair/status" className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">Status</Link>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest transition-colors">|</span>
              <span className="text-[10px] text-neon-cyan font-mono">USER_{user?.name?.toUpperCase()}</span>
              <button 
                onClick={logout}
                className="text-[11px] font-semibold text-red-500/80 hover:text-red-500 uppercase tracking-widest transition-colors cursor-pointer"
              >
                Logout
              </button>
            </div>
          ) : (
            <>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest transition-colors">|</span>
              <Link href="/auth/signin" className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">Sign In</Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          <Link href="/repair" className="hidden sm:block">
            <button className="btn-neon cursor-pointer flex items-center gap-2 group relative py-2 px-4">
              <span className="relative z-10 font-bold uppercase text-[10px] tracking-widest transition-colors duration-300">Repair</span>
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
                <Link href="/about" onClick={toggleMenu} className="text-xs font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-[0.2em] transition-colors">About</Link>
                <Link href="/services" onClick={toggleMenu} className="text-xs font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-[0.2em] transition-colors">Services</Link>
                <Link href="/shop" onClick={toggleMenu} className="text-xs font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-[0.2em] transition-colors">Shop</Link>
                <Link href="/contact" onClick={toggleMenu} className="text-xs font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-[0.2em] transition-colors">Contact</Link>
                
                <div className="pt-6 border-t border-white/5 flex flex-col space-y-6">
                  {isAuthenticated ? (
                    <>
                      <Link href="/repair/status" onClick={toggleMenu} className="text-xs font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-[0.2em] transition-colors">Repair Status</Link>
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
                  ) : (
                    <Link href="/auth/signin" onClick={toggleMenu} className="text-xs font-semibold text-neon-cyan uppercase tracking-[0.2em] transition-colors">Auth Terminal (Sign In)</Link>
                  )}
                  
                  <Link href="/repair" onClick={toggleMenu} className="sm:hidden">
                     <button className="w-full btn-neon py-4 text-center font-bold uppercase text-[10px] tracking-[0.3em]">
                       Initialize Repair Protocol
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
