
'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Package, CheckCircle2, Clock, Wrench } from 'lucide-react';

export default function ServiceTracker() {
  const [ticketId, setTicketId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showStatus, setShowStatus] = useState(false);

  // Simulated status for demonstration
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId) return;
    setIsSearching(true);
    
    // Simulate API delay
    setTimeout(() => {
      setIsSearching(false);
      setShowStatus(true);
    }, 1200);
  };

  return (
    <section className="w-full bg-black py-16 px-6 border-t border-zinc-900">
      <div className="max-w-4xl mx-auto">
        
        {/* Tracker Input Card */}
        <div className="bg-zinc-900/40 border border-zinc-800 p-8 rounded-3xl backdrop-blur-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Search size={120} />
          </div>

          <div className="relative z-10 text-center mb-10">
            <h2 className="text-3xl font-black uppercase tracking-tighter text-white mb-2">
              Track Your <span className="text-cyan-400">Repair</span>
            </h2>
            <p className="text-zinc-500 text-sm font-mono uppercase tracking-widest">
              Enter your 8-digit Job ID provided at the counter
            </p>
          </div>

          <form onSubmit={handleSearch} className="relative z-10 max-w-md mx-auto flex gap-3">
            <div className="flex-grow relative">
              <input 
                type="text" 
                placeholder="Ex: TD-99283"
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
                className="w-full bg-black border border-zinc-700 rounded-xl px-5 py-4 text-white focus:outline-none focus:border-cyan-500 transition-all font-mono uppercase tracking-widest"
              />
            </div>
            <button 
              type="submit"
              disabled={isSearching}
              className="bg-cyan-500 hover:bg-white text-black px-6 py-4 rounded-xl font-black uppercase tracking-tighter transition-all disabled:opacity-50"
            >
              {isSearching ? 'Analyzing...' : 'Check Status'}
            </button>
          </form>

          {/* Result Section */}
          <AnimatePresence>
            {showStatus && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-12 pt-10 border-t border-zinc-800/50"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                  
                  {/* Step 1: Received */}
                  <div className="space-y-3 opacity-100">
                    <div className="w-10 h-10 bg-cyan-500 rounded-full flex items-center justify-center mx-auto text-black shadow-[0_0_15px_rgba(0,242,255,0.4)]">
                      <CheckCircle2 size={20} />
                    </div>
                    <p className="text-xs font-bold text-white uppercase tracking-widest">Received</p>
                    <p className="text-[10px] text-zinc-500 font-mono italic">March 24, 2:15 PM</p>
                  </div>

                  {/* Step 2: Diagnostic/In-Progress */}
                  <div className="space-y-3">
                    <div className="w-10 h-10 border-2 border-cyan-500 rounded-full flex items-center justify-center mx-auto text-cyan-400 animate-pulse">
                      <Wrench size={20} />
                    </div>
                    <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest">In Progress</p>
                    <p className="text-[10px] text-zinc-500 font-mono italic">Engineer: Tech-Alpha</p>
                  </div>

                  {/* Step 3: Ready for Pickup */}
                  <div className="space-y-3 opacity-30">
                    <div className="w-10 h-10 border-2 border-zinc-700 rounded-full flex items-center justify-center mx-auto text-zinc-700">
                      <Package size={20} />
                    </div>
                    <p className="text-xs font-bold text-zinc-600 uppercase tracking-widest">Ready</p>
                    <p className="text-[10px] text-zinc-500 font-mono italic">TBD</p>
                  </div>

                </div>

                <div className="mt-10 p-4 bg-cyan-950/20 border border-cyan-500/20 rounded-xl">
                  <p className="text-xs text-center text-cyan-200">
                    <span className="font-bold">Latest Update:</span> Component-level repair successful. Currently undergoing stress testing for thermal stability.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        

      </div>
    </section>
  );
}