'use client';

import React from 'react';
import { motion } from 'framer-motion';

export default function BrandingSection() {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="mb-16"
    >
      <div className="mb-12 border-l-4 border-cyan-400 pl-6">
        <h2 className="text-cyan-400 font-mono tracking-widest uppercase text-sm mb-4">Established 2024</h2>
        <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter">
          The <span className="text-cyan-400">Tek Doctor</span>
        </h1>
        <p className="mt-2 text-zinc-500 font-mono text-sm uppercase tracking-widest">
          Official Inventory & Tooling Specification
        </p>
      </div>
      
      <p className="text-zinc-400 text-lg md:text-xl leading-relaxed max-w-3xl">
        We treat technology with the same precision a surgeon treats a patient. 
        The Tek Doctor was founded on the principle that your devices are the 
        lifeline to your digital world. We don't just "fix" hardware; 
        we restore productivity and peace of mind through expert engineering 
        and transparent diagnostics.
      </p>
    </motion.div>
  );
}
