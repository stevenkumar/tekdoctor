'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Zap, Microscope } from 'lucide-react';

export default function CoreValuesSection() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-32">
      {[
        { icon: Microscope, label: "Precision", text: "Micro-soldering and board-level repairs." },
        { icon: ShieldCheck, label: "Integrity", text: "OEM parts and guaranteed 90-day warranties." },
        { icon: Zap, label: "Speed", text: "Same-day diagnostics for critical hardware." }
      ].map((item, i) => (
        <motion.div 
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 + (i * 0.1) }}
          className="p-6 rounded-2xl bg-zinc-900/30 border border-white/5"
        >
          <item.icon className="text-cyan-400 mb-4" size={28} />
          <h3 className="text-white font-bold uppercase mb-2">{item.label}</h3>
          <p className="text-zinc-500 text-sm leading-relaxed">{item.text}</p>
        </motion.div>
      ))}
    </div>
  );
}
