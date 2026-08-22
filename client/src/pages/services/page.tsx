'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Zap, Activity, Microscope } from 'lucide-react';
import ExpandableServices from './component/ExpandableService';
import XRayScanner from './component/XRayScanner';

const ServicesPage = () => {
  return (
    <main className="bg-[#050505] text-white">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center pt-20 pb-32 px-6 overflow-hidden">
        {/* Advanced Background System */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full" style={{ background: 'radial-gradient(circle at center, rgba(var(--neon-cyan-rgb), 0.05) 0%, transparent 70%)' }} />
          <div className="absolute top-1/4 -left-20 w-[600px] h-[600px] bg-neon-cyan/10 blur-[150px] rounded-full animate-pulse" />
          <div className="absolute bottom-1/4 -right-20 w-[500px] h-[500px] bg-blue-600/10 blur-[150px] rounded-full animate-pulse animation-delay-3s" />

          {/* Animated Grid Lines */}
          {/* <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:60px_60px]" /> */}
        </div>

        <div className="max-w-7xl mx-auto relative z-10 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-8"
            >
              <div className="inline-flex items-center gap-3 px-4 py-2 bg-zinc-900/50 border border-white/10 rounded-full mb-8 backdrop-blur-md">
                <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
                <span className="text-[10px] font-bold text-neon-cyan uppercase tracking-[0.3em]">Operational Excellence</span>
              </div>

              <h1 className="text-5xl md:text-7xl lg:text-9xl font-black uppercase tracking-tighter mb-8 leading-[0.8]">
                Precision <br />
                <span className="bg-gradient-to-r from-white via-white to-zinc-500 bg-clip-text text-transparent">Engineering</span>
              </h1>

              <div className="flex flex-col md:flex-row gap-8 items-start md:items-center mb-12">
                <p className="text-xl text-zinc-400 max-w-xl font-light leading-relaxed border-l border-neon-cyan/30 pl-6">
                  Deploying class-leading diagnostic arrays and micro-surgical techniques to restore your mission-critical hardware to factory specifications.
                </p>
                <div className="flex -space-x-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="w-12 h-12 rounded-full border-2 border-[#050505] bg-zinc-800 flex items-center justify-center">
                      <ShieldCheck size={20} className="text-neon-cyan" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                <a href="/protocol" className="group relative px-10 py-5 bg-neon-cyan text-black font-black uppercase tracking-widest text-xs rounded-full overflow-hidden transition-all" style={{ '--hover-shadow': '0 0 50px rgba(var(--neon-cyan-rgb), 0.4)' } as React.CSSProperties} onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 50px rgba(var(--neon-cyan-rgb), 0.4)')} onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                  <span className="relative z-10">Check Repair Protocol</span>
                  <div className="absolute inset-0 bg-white translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                </a>
                {/* <button className="px-10 py-5 border border-white/10 text-white font-bold uppercase tracking-widest text-xs rounded-full hover:bg-white/5 transition-all backdrop-blur-sm">
                  View Service Matrix
                </button> */}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.2, delay: 0.2 }}
              className="lg:col-span-4 hidden lg:block"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-neon-cyan/20 blur-[100px] rounded-full animate-pulse" />
                <div className="relative bg-zinc-900/40 border border-white/5 p-8 rounded-[3rem] backdrop-blur-xl">
                  <div className="flex items-center justify-between mb-8">
                    <Microscope size={32} className="text-neon-cyan" />
                    <div className="text-[10px] font-mono text-zinc-500">SYSTEM_READY</div>
                  </div>
                  <div className="space-y-6">
                    {[
                      { icon: Zap, label: "Rapid Response", value: "98.4%" },
                      { icon: Activity, label: "Success Matrix", value: "99.9%" },
                    ].map((stat, i) => (
                      <div key={i} className="p-4 bg-black/40 rounded-2xl border border-white/5">
                        <div className="flex items-center gap-3 mb-2">
                          <stat.icon size={14} className="text-neon-cyan" />
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{stat.label}</span>
                        </div>
                        <div className="text-2xl font-black text-white">{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Main Services Departments */}
      <ExpandableServices />

      {/* X-Ray Scanner Section */}
      <XRayScanner />

      {/* Support & Diagnostics CTA */}
      <section className="py-5 px-6 relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at bottom, rgba(var(--neon-cyan-rgb), 0.05) 0%, transparent 70%)' }} />

        <div className="max-w-5xl mx-auto relative z-10">
          <div className="bg-zinc-900/50 border border-white/5 rounded-[3rem] p-5 md:p-15 text-center backdrop-blur-sm relative overflow-hidden group">
            {/* Animated accent line */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-neon-cyan to-transparent opacity-50" />

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="relative z-10"
            >
              <h2 className="text-5xl md:text-6xl font-black text-white mb-8 uppercase tracking-tighter leading-none">
                REQUIRE CUSTOM <br />
                <span className="text-zinc-600">ARCHITECTURE?</span>
              </h2>
              <p className="text-zinc-400 text-xl mb-12 font-light max-w-2xl mx-auto leading-relaxed">
                Our diagnostic elite can assess your terminal completely free and architect the most efficient recovery vector.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-6">
                <a href="/repair" className="px-12 py-6 bg-white text-black font-black uppercase tracking-widest text-xs rounded-full hover:bg-neon-cyan transition-all hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] active:scale-95">
                  Schedule Free Diagnostic
                </a>
                <a href="/contact" className="px-12 py-6 border border-white/10 text-white font-bold uppercase tracking-widest text-xs rounded-full hover:bg-white/5 transition-all">
                  Consult Lead Technician
                </a>
              </div>
            </motion.div>

            {/* Background HUD elements */}
            <div className="absolute top-10 right-10 opacity-10 group-hover:opacity-20 transition-opacity">
              <ShieldCheck size={120} className="text-white" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default ServicesPage;

