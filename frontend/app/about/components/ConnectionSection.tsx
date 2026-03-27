'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';

export default function ConnectionSection() {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      className="relative group p-1 rounded-3xl bg-gradient-to-br from-zinc-800 via-transparent to-cyan-900/20"
    >
      <div className="bg-[#050505] rounded-[22px] p-8 md:p-12 overflow-hidden relative">
        {/* Background Logo Watermark */}
        <div className="absolute -right-10 -bottom-10 opacity-[0.03] rotate-12 pointer-events-none">
          <h2 className="text-[12rem] font-black">TEK</h2>
        </div>

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/50 border border-cyan-500/30 text-cyan-400 text-[10px] font-bold uppercase tracking-widest mb-6">
              Parent Organization
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Driven by <span className="text-cyan-400">Tekunik</span>
            </h2>
            <p className="text-zinc-400 leading-relaxed mb-6">
              The Tek Doctor is a specialized subdivision of **Tekunik**. While the Doctor focuses on 
              restoration and repair, Tekunik is the engine of innovation—focusing on full-stack development, 
              IT infrastructure, and the future of web technologies. Together, we cover the full 
              lifecycle of your tech needs.
            </p>
            <a 
              href="https://tekunik.in" 
              target="_blank"
              className="inline-flex items-center gap-2 text-white font-bold hover:text-cyan-400 transition-colors group"
            >
              Explore Tekunik Ecosystem
              <ExternalLink size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </a>
          </div>

          {/* A visual "Bridge" or Logo Placeholder */}
          <div className="w-full md:w-64 h-64 bg-zinc-900/50 border border-white/5 rounded-2xl flex items-center justify-center relative overflow-hidden group-hover:border-cyan-500/20 transition-colors">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#00f2ff20_0%,transparent_70%)]" />
              <span className="text-zinc-700 font-black text-xl tracking-widest uppercase">Tekunik.in</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
