'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Cpu, Eye, ScanLine } from 'lucide-react';

export default function XRayScanner() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const diagnosticPoints = [
    { label: "Board Analysis", value: "Precision Scan" },
    { label: "Component Health", value: "Verified" },
    { label: "Failure Detection", value: "High Precision" },
    { label: "Predictive Repair", value: "Standardized" },
  ];

  return (
    <section className="py-32 bg-[#050505] overflow-hidden relative border-t border-white/5">
      {/* Background Decoration */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, rgba(var(--neon-cyan-rgb), 0.03) 0%, transparent 100%)' }} />

      {/* Grid Pattern */}
      {/* <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" /> */}

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-24"
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-neon-cyan" />
            <span className="text-neon-cyan font-bold text-[10px] tracking-[0.5em] uppercase">Advanced Analysis</span>
            <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-neon-cyan" />
          </div>
          <h2 className="text-5xl md:text-7xl font-black text-white uppercase mb-6 tracking-tighter leading-none">
            LABORATORY <span className="text-zinc-600">SCANNER</span>
          </h2>
          <p className="text-zinc-500 max-w-2xl mx-auto text-xl font-light leading-relaxed">
            Proprietary diagnostic protocols that reveal hardware integrity with architectural precision.
          </p>
        </motion.div>

        {/* Scanner Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7 }}
          className="flex flex-col lg:flex-row gap-20 items-center"
        >
          {/* Left - Scanner Visualization */}
          <div className="flex-1 flex justify-center relative">
            {/* HUD Elements */}
            <div className="absolute -top-10 -left-10 w-20 h-20 border-t border-l border-neon-cyan/20 pointer-events-none" />
            <div className="absolute -bottom-10 -right-10 w-20 h-20 border-b border-r border-neon-cyan/20 pointer-events-none" />

            <div
              ref={containerRef}
              onMouseMove={handleMouseMove}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
              className="relative w-full max-w-[300px] h-[520px] md:max-w-[400px] md:h-[650px] mx-auto bg-zinc-900 rounded-[2.5rem] overflow-hidden cursor-none border border-white/10 shadow-2xl group transition-all duration-500 hover:border-neon-cyan/30"
            >
              {/* Base Layer - Device Image */}
              <div
                className="absolute inset-0 bg-cover bg-center transition-all duration-700"
                style={{
                  backgroundImage: `url('https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?q=80&w=2070&auto=format&fit=crop')`,
                  filter: isHovering ? 'grayscale(100%) brightness(0.6)' : 'brightness(0.9) contrast(1.1)',
                }}
              />

              {/* X-Ray Layer - Internal Components */}
              <motion.div
                className="absolute inset-0 bg-cover bg-center pointer-events-none"
                style={{
                  backgroundImage: `url('https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2070&auto=format&fit=crop')`,
                  clipPath: isHovering
                    ? `circle(100px at ${mousePos.x}px ${mousePos.y}px)`
                    : `circle(0px at ${mousePos.x}px ${mousePos.y}px)`,
                  filter: 'brightness(1.2) contrast(1.2) sepia(0.3) hue-rotate(150deg)',
                }}
                transition={{ type: 'tween', ease: 'backOut', duration: 0.1 }}
              />

              {/* Scanner Ring & UI */}
              <AnimatePresence>
                {isHovering && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="absolute pointer-events-none z-20"
                    style={{
                      width: '200px',
                      height: '200px',
                      left: mousePos.x - 100,
                      top: mousePos.y - 100,
                    }}
                  >
                    <div className="w-full h-full border-[1px] border-neon-cyan rounded-full relative" style={{ boxShadow: '0 0 30px rgba(var(--neon-cyan-rgb), 0.4)' }}>
                      {/* Scanning Lines */}
                      <div className="absolute inset-0 border-t border-neon-cyan/40 rounded-full animate-spin-slow spin-4s" />
                      <div className="absolute top-1/2 left-0 w-full h-[1px] bg-neon-cyan/50 animate-pulse" style={{ boxShadow: '0 0 10px var(--neon-cyan)' }} />
                    </div>
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md border border-neon-cyan/30 px-3 py-1.5 rounded-md">
                      <span className="text-[9px] font-mono text-neon-cyan uppercase tracking-tighter whitespace-nowrap flex items-center gap-2">
                        <ScanLine size={10} className="animate-pulse" /> CORE_SCAN_ACTIVE
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Overlay Text for Idle State */}
              {!isHovering && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[1px] pointer-events-none"
                >
                  <div className="w-20 h-20 rounded-full bg-black/60 border border-white/10 flex items-center justify-center shadow-2xl mb-6 relative">
                    <div className="absolute inset-0 rounded-full border border-neon-cyan/30 animate-ping" />
                    <Eye size={32} className="text-neon-cyan" />
                  </div>
                  <p className="text-white font-bold text-sm tracking-widest uppercase">Initialize Hardware Scan</p>
                  <p className="text-zinc-400 text-[10px] mt-2 font-mono">WAITING_FOR_INTERACTION</p>
                </motion.div>
              )}
            </div>
          </div>

          {/* Right - Diagnostic Info */}
          <div className="flex-1 space-y-12">
            <div>
              <h3 className="text-4xl font-black text-white mb-6 uppercase tracking-tighter italic">Diagnostic Intelligence</h3>
              <p className="text-zinc-500 text-lg leading-relaxed mb-8 font-light">
                Our proprietary diagnostic suite identifies hardware failures with surgical accuracy. We analyze every circuit trace and logic gate to ensure total system restoration.
              </p>
              <ul className="space-y-6">
                <li className="flex items-start gap-5 group">
                  <div className="p-3 bg-zinc-900 rounded-2xl border border-white/5 group-hover:border-neon-cyan/50 transition-colors">
                    <Zap size={22} className="text-neon-cyan" />
                  </div>
                  <div>
                    <span className="block text-white font-bold text-lg mb-1 group-hover:text-neon-cyan transition-colors">Electrical Forensics</span>
                    <p className="text-sm text-zinc-500 font-light">Real-time monitoring of power delivery and thermal constraints.</p>
                  </div>
                </li>
                <li className="flex items-start gap-5 group">
                  <div className="p-3 bg-zinc-900 rounded-2xl border border-white/5 group-hover:border-neon-cyan/50 transition-colors">
                    <Cpu size={22} className="text-neon-cyan" />
                  </div>
                  <div>
                    <span className="block text-white font-bold text-lg mb-1 group-hover:text-neon-cyan transition-colors">IC Integrity Analysis</span>
                    <p className="text-sm text-zinc-500 font-light">Multi-layer testing of integrated circuits and signal paths.</p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Diagnostic Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {diagnosticPoints.map((point, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * idx }}
                  className="border border-white/5 rounded-3xl p-6 bg-zinc-900/50 hover:bg-zinc-800 transition-all duration-300 group/card"
                >
                  <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-2 group-hover/card:text-neon-cyan transition-colors">{point.label}</p>
                  <p className="text-white font-black text-sm tracking-tight">{point.value}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}