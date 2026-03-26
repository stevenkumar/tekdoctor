'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Zap, Microscope, ExternalLink } from 'lucide-react';

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-black text-white selection:bg-cyan-500/30 overflow-hidden">
      {/* Subtle Background Elements */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_30%,#002a2d_0%,transparent_40%)] pointer-events-none" />
      
      <section className="relative max-w-5xl mx-auto px-6 pt-32 pb-20">
        {/* Main Branding Section */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-16"
        >
          <h2 className="text-cyan-400 font-mono tracking-widest uppercase text-sm mb-4">Established 2024</h2>
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-8">
            The <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500">Tek Doctor</span>
          </h1>
          <p className="text-zinc-400 text-lg md:text-xl leading-relaxed max-w-3xl">
            We treat technology with the same precision a surgeon treats a patient. 
            The Tek Doctor was founded on the principle that your devices are the 
            lifeline to your digital world. We don't just "fix" hardware; 
            we restore productivity and peace of mind through expert engineering 
            and transparent diagnostics.
          </p>
        </motion.div>

        {/* Core Values Grid */}
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

        {/* The Tekunik Connection Section */}
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
      </section>
    </main>
  );
}