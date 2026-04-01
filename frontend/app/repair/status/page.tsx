
'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Package, CheckCircle2, Clock, Wrench, Cpu, History, User, ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function ServiceTracker() {
  const { user, isAuthenticated } = useAuth();
  const [ticketId, setTicketId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showStatus, setShowStatus] = useState(false);

  // Simulated status for demonstration
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId) return;
    setIsSearching(true);
    setShowStatus(false); // Reset previous status
    
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
            {isAuthenticated && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-center gap-2 mb-6"
              >
                <div className="px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/5">
                  <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-widest">Authorized_Link</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Welcome, {user?.name}</span>
              </motion.div>
            )}
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

          <AnimatePresence>
            {showStatus && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-12 pt-10 border-t border-zinc-800/50"
              >
                {/* User & Device Metadata Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
                   <div className="bg-black/40 border border-zinc-800/50 p-5 rounded-2xl flex items-center gap-4 group hover:border-cyan-500/30 transition-all">
                     <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-cyan-400 group-hover:scale-110 transition-transform">
                       <Cpu size={18} />
                     </div>
                     <div>
                       <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em] mb-0.5">Asset_Locked</p>
                       <p className="text-sm font-bold text-zinc-200">Workstation_M1_Custom</p>
                     </div>
                   </div>
                   <div className="bg-black/40 border border-zinc-800/50 p-5 rounded-2xl flex items-center gap-4 group hover:border-cyan-500/30 transition-all">
                     <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-cyan-400 group-hover:scale-110 transition-transform">
                       <Clock size={18} className="animate-pulse" />
                     </div>
                     <div>
                       <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em] mb-0.5">Estimated_TAT</p>
                       <p className="text-sm font-bold text-cyan-400">24-48 Hours Remaining</p>
                     </div>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center mb-12">
                  {/* Step 1: Received */}
                  <div className="space-y-3 opacity-100">
                    <div className="w-12 h-12 bg-cyan-500 rounded-full flex items-center justify-center mx-auto text-black shadow-[0_0_20px_rgba(0,242,255,0.3)]">
                      <CheckCircle2 size={24} />
                    </div>
                    <p className="text-xs font-bold text-white uppercase tracking-widest">Received</p>
                    <p className="text-[10px] text-zinc-500 font-mono italic">March 24, 2:15 PM</p>
                  </div>

                  {/* Step 2: Diagnostic/In-Progress */}
                  <div className="space-y-3">
                    <div className="w-12 h-12 border-2 border-cyan-500 bg-cyan-500/5 rounded-full flex items-center justify-center mx-auto text-cyan-400 animate-pulse">
                      <Wrench size={24} />
                    </div>
                    <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest">In Progress</p>
                    <p className="text-[10px] text-zinc-500 font-mono italic">Engineer: TECH_ALPHA</p>
                  </div>

                  {/* Step 3: Ready for Pickup */}
                  <div className="space-y-3 opacity-30">
                    <div className="w-12 h-12 border-2 border-zinc-700 rounded-full flex items-center justify-center mx-auto text-zinc-700">
                      <Package size={24} />
                    </div>
                    <p className="text-xs font-bold text-zinc-600 uppercase tracking-widest">Ready</p>
                    <p className="text-[10px] text-zinc-500 font-mono italic">TBD</p>
                  </div>
                </div>

                {/* Technical Activity Log */}
                <div className="mt-10 space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <History size={14} className="text-zinc-600" />
                    <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Technical_Transmission_Log</span>
                  </div>
                  
                  <div className="space-y-1">
                    {[
                      { time: "2:15 PM", msg: "Device incoming: Ticket ID initiated." },
                      { time: "3:45 PM", msg: "Initial diagnostic scan complete. Thermal anomalies detected." },
                      { time: "9:00 AM", msg: "Replacement components sourced from inventory." },
                      { time: "LAST", msg: "Component-level repair successful. Undergoing thermal stability stress test.", current: true },
                    ].map((log, i) => (
                      <div key={i} className={`flex items-start gap-4 p-3 rounded-lg border transition-all ${
                        log.current ? 'bg-cyan-500/5 border-cyan-500/20' : 'border-transparent opacity-40 hover:opacity-100'
                      }`}>
                         <span className="text-[9px] font-mono text-cyan-500 w-16 pt-1">{log.time}</span>
                         <p className={`text-xs ${log.current ? 'text-cyan-100' : 'text-zinc-400'}`}>{log.msg}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-12 flex justify-center">
                   <button className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-cyan-400 transition-colors">
                     <ExternalLink size={12} />
                     Contact Assigned Engineer
                   </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        

      </div>
    </section>
  );
}