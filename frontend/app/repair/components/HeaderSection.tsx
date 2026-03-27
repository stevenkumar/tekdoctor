import React from 'react';
import { motion } from 'framer-motion';
import { Wrench } from 'lucide-react';

export default function HeaderSection() {
  return (
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
  );
}
