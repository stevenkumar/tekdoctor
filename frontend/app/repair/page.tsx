'use client';

import React, { useState } from 'react';
import { 
  Wrench, 
  Settings2, 
  Cpu, 
  Smartphone, 
  HardDrive, 
  CheckCircle2, 
  AlertTriangle,
  Send,
  Loader2,
  Clock,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const deviceCategories = [
  { id: 'computing', name: 'Computing', icon: Cpu, items: ['Laptops', 'Custom PCs', 'Workstations'] },
  { id: 'mobile', name: 'Mobile Devices', icon: Smartphone, items: ['Smartphones', 'Tablets', 'Foldables'] },
  { id: 'storage', name: 'Storage Media', icon: HardDrive, items: ['SSD/HDD', 'External Drives', 'RAID'] },
];

const priorityLevels = [
  { id: 'standard', name: 'Standard', time: '3-5 Days', icon: Clock },
  { id: 'express', name: 'Express', time: '24-48 Hours', icon: Zap, highlight: true },
];

export default function RepairBooking() {
  const [selectedDevice, setSelectedDevice] = useState('computing');
  const [priority, setPriority] = useState('standard');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans selection:bg-cyan-500/30 pb-20">
      <div className="max-w-5xl mx-auto px-6 pt-12">
        
        {/* Technical Header */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-16 border-l-4 border-cyan-400 pl-8 relative"
        >
          <div className="flex items-center gap-4 mb-3">
            <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-[0.4em] bg-cyan-400/10 px-3 py-1 rounded-sm border border-cyan-400/20">
              Protocol_ID: TD-8821
            </span>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                Diagnostics_Online
              </span>
            </div>
          </div>
          <h1 className="text-5xl md:text-6xl font-black text-white uppercase tracking-tighter leading-none">
            Repair <span className="text-cyan-400">Request</span>
          </h1>
          <p className="mt-4 text-zinc-500 font-mono text-xs uppercase tracking-[0.3em] max-w-lg">
            Authorized lab remediation for precision hardware. Initialize your service ticket below.
          </p>
          
          {/* Background watermark */}
          <div className="absolute -top-10 -right-10 opacity-[0.03] pointer-events-none select-none">
            <Wrench size={300} strokeWidth={1} />
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {!isSuccess ? (
            <motion.form 
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onSubmit={handleSubmit} 
              className="grid grid-cols-1 lg:grid-cols-3 gap-12"
            >
              
              {/* Left Column: Form Details */}
              <div className="lg:col-span-2 space-y-12">
                
                {/* Section 1: Classification */}
                <section>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-cyan-400">
                      <Settings2 size={16} />
                    </div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-[0.3em]">01. Hardware classification</h2>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {deviceCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedDevice(cat.id)}
                        className={`group relative p-6 text-left border rounded-2xl transition-all duration-500 overflow-hidden ${
                          selectedDevice === cat.id 
                          ? 'bg-cyan-400/5 border-cyan-400 shadow-[0_0_30px_rgba(0,242,255,0.05)]' 
                          : 'bg-zinc-900/20 border-zinc-800/50 hover:border-zinc-700'
                        }`}
                      >
                        <cat.icon className={`w-10 h-10 mb-6 transition-all duration-500 ${
                          selectedDevice === cat.id ? 'text-cyan-400 scale-110' : 'text-zinc-700 group-hover:text-zinc-500'
                        }`} />
                        <h3 className={`text-lg font-bold transition-colors ${
                          selectedDevice === cat.id ? 'text-white' : 'text-zinc-500'
                        }`}>{cat.name}</h3>
                        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mt-2 leading-relaxed">
                          {cat.items.join(' • ')}
                        </p>
                        
                        {selectedDevice === cat.id && (
                          <motion.div 
                            layoutId="active-bg"
                            className="absolute bottom-0 left-0 h-1 bg-cyan-400 w-full"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Section 2: Diagnostics */}
                <section>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-cyan-400">
                      <ShieldCheck size={16} />
                    </div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-[0.3em]">02. Telemetry & data</h2>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="group">
                      <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3 px-1 group-focus-within:text-cyan-400 transition-colors">Incident Description</label>
                      <textarea 
                        required
                        placeholder="Detail the failure parameters, symptoms, or physical damage..."
                        className="w-full bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-5 text-sm text-zinc-300 focus:outline-none focus:border-cyan-400/50 min-h-[160px] transition-all placeholder:text-zinc-800 focus:bg-zinc-900/50"
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="group">
                        <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3 px-1 group-focus-within:text-cyan-400 transition-colors">Client Signature (Name)</label>
                        <input 
                          required
                          type="text" 
                          placeholder="EX: JOHN_DOE"
                          className="w-full bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-5 text-sm focus:outline-none focus:border-cyan-400/50 transition-all placeholder:text-zinc-800 focus:bg-zinc-900/50"
                        />
                      </div>
                      <div className="group">
                        <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3 px-1 group-focus-within:text-cyan-400 transition-colors">Comm_Link (Email/Phone)</label>
                        <input 
                          required
                          type="text" 
                          placeholder="MOBILE_OR_ENCRYPTED_MAIL"
                          className="w-full bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-5 text-sm focus:outline-none focus:border-cyan-400/50 transition-all placeholder:text-zinc-800 focus:bg-zinc-900/50"
                        />
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* Right Column: Order Configuration */}
              <div className="lg:col-span-1">
                <div className="sticky top-32 space-y-8">
                  <div className="bg-zinc-900/40 border border-zinc-800 p-8 rounded-3xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 font-mono text-[8px] text-zinc-800 pointer-events-none group-hover:text-cyan-900 transition-colors">
                      PRIORITY_MATRIX_v1.2
                    </div>
                    
                    <h3 className="text-white font-black uppercase text-sm tracking-widest mb-8">Priority Level</h3>
                    
                    <div className="space-y-4">
                      {priorityLevels.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPriority(p.id)}
                          className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                            priority === p.id 
                            ? 'bg-cyan-400/10 border-cyan-400/50 text-white' 
                            : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <p.icon size={18} className={priority === p.id ? 'text-cyan-400' : 'text-zinc-700'} />
                            <div className="text-left">
                              <p className="text-xs font-bold uppercase tracking-widest">{p.name}</p>
                              <p className="text-[10px] font-mono opacity-50">{p.time}</p>
                            </div>
                          </div>
                          {priority === p.id && (
                            <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(0,242,255,0.8)]" />
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="mt-10 pt-8 border-t border-zinc-800/50">
                      <button
                        disabled={isSubmitting}
                        type="submit"
                        className="w-full group relative py-5 bg-cyan-500 text-black rounded-2xl font-black uppercase text-xs tracking-[0.4em] transition-all hover:bg-cyan-400 hover:shadow-[0_0_40px_rgba(0,242,255,0.4)] disabled:opacity-50 active:scale-95"
                      >
                        <span className="relative z-10 flex items-center justify-center">
                          {isSubmitting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              Initialize Protocol
                              <Send className="w-6 h-6 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform mr-6" />
                            </>
                          )}
                        </span>
                      </button>
                    </div>

                    <p className="mt-6 text-[9px] text-zinc-600 font-mono text-center uppercase tracking-widest leading-relaxed">
                      By initializing, you agree to our lab's <span className="text-zinc-400">terms of remediation</span> & data privacy protocols.
                    </p>
                  </div>

                  <div className="p-6 bg-cyan-400/5 border border-cyan-400/10 rounded-2xl">
                    <div className="flex items-center gap-3 mb-3 text-cyan-400">
                      <AlertTriangle size={16} />
                      <p className="text-[10px] font-black uppercase tracking-widest">Lab Note</p>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">
                      "Ensure all external storage media is detached unless relevant to the primary diagnostics request."
                    </p>
                  </div>
                </div>
              </div>

            </motion.form>
          ) : (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-zinc-900/20 border border-cyan-400/20 p-16 rounded-[40px] text-center max-w-2xl mx-auto shadow-[0_0_50px_rgba(0,242,255,0.02)]"
            >
              <div className="w-24 h-24 bg-cyan-400 rounded-full flex items-center justify-center mx-auto mb-10 shadow-[0_0_60px_rgba(0,242,255,0.3)] border-4 border-black">
                <CheckCircle2 className="w-12 h-12 text-black" />
              </div>
              <h2 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">Protocol Active</h2>
              <div className="h-px w-20 bg-cyan-400 mx-auto mb-8 opacity-50" />
              <p className="text-zinc-400 text-sm max-w-sm mx-auto leading-relaxed font-medium">
                Your hardware remediation ticket has been successfully logged into the mainframe. A specialist will contact you via your specified comm-link.
              </p>
              
              <div className="grid grid-cols-2 gap-4 mt-12 bg-black/40 p-6 rounded-2xl border border-zinc-800">
                <div className="text-left">
                  <p className="text-[8px] font-mono text-zinc-600 uppercase">Ticket_reference</p>
                  <p className="text-xs font-bold text-cyan-400">#TK-{Math.floor(Math.random() * 10000)}</p>
                </div>
                <div className="text-left">
                  <p className="text-[8px] font-mono text-zinc-600 uppercase">Est_triage</p>
                  <p className="text-xs font-bold text-white">4.2 HOURS</p>
                </div>
              </div>

              <div className="mt-12">
                <button 
                  onClick={() => setIsSuccess(false)}
                  className="px-8 py-3 bg-zinc-900 text-zinc-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 hover:text-white transition-all border border-zinc-800"
                >
                  Log another request
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Technical Footer Accent */}
        <div className="mt-32 flex items-center gap-6 opacity-20">
          <div className="h-px flex-grow bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
          <div className="flex gap-4">
            {[1, 2, 3].map(i => <div key={i} className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />)}
          </div>
          <p className="text-[9px] font-mono uppercase tracking-[1em] text-zinc-500">End_File_Transmission</p>
          <div className="h-px flex-grow bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
        </div>

      </div>
    </div>
  );
}