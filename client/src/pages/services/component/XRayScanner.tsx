'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Cpu, Eye, ScanLine } from 'lucide-react';

export default function XRayScanner() {
  const [mousePos, setMousePos] = useState({ x: 200, y: 325 });
  const [isHovering, setIsHovering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setMousePos({ x: rect.width / 2, y: rect.height / 2 });
      }
    }
    return () => {
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    };
  }, []);

  const updateCoords = (clientX: number, clientY: number) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      setMousePos({ x, y });
    }
  };

  // Desktop Mouse Handlers (100% faithful to original)
  const handleMouseMove = (e: React.MouseEvent) => {
    setIsHovering(true);
    updateCoords(e.clientX, e.clientY);
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    setIsHovering(true);
    updateCoords(e.clientX, e.clientY);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  // Mobile Touch Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    if (e.touches && e.touches[0]) {
      setIsHovering(true);
      updateCoords(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches && e.touches[0]) {
      updateCoords(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    touchTimerRef.current = setTimeout(() => {
      setIsHovering(false);
    }, 2000);
  };

  const diagnosticPoints = [
    { label: "Board Analysis", value: "Precision Scan" },
    { label: "Component Health", value: "Verified" },
    { label: "Failure Detection", value: "High Precision" },
    { label: "Predictive Repair", value: "Standardized" },
  ];

  return (
    <section className="py-16 md:py-32 bg-[#050505] overflow-hidden relative border-t border-white/5">
      {/* Background Decoration */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, rgba(var(--neon-cyan-rgb), 0.03) 0%, transparent 100%)',
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        {/* Header */}
        <div className="text-center mb-12 md:mb-24">
          <div className="flex items-center justify-center gap-3 mb-4 sm:mb-6">
            <div className="h-[1px] w-8 sm:w-12 bg-gradient-to-r from-transparent to-neon-cyan" />
            <span className="text-neon-cyan font-bold text-[10px] tracking-[0.4em] sm:tracking-[0.5em] uppercase">
              Advanced Analysis
            </span>
            <div className="h-[1px] w-8 sm:w-12 bg-gradient-to-l from-transparent to-neon-cyan" />
          </div>
          <h2 className="text-3xl sm:text-5xl md:text-7xl font-black text-white uppercase mb-4 sm:mb-6 tracking-tighter leading-none">
            LABORATORY <span className="text-zinc-600">SCANNER</span>
          </h2>
          <p className="text-zinc-500 max-w-2xl mx-auto text-base sm:text-xl font-light leading-relaxed px-2">
            Proprietary diagnostic protocols that reveal hardware integrity with architectural precision.
          </p>
        </div>

        {/* Scanner Container */}
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-20 items-center">
          {/* Left - Scanner Visualization */}
          <div className="flex-1 flex justify-center relative w-full">
            {/* Wrapper with explicit responsive widths to prevent flex collapse */}
            <div className="relative w-full max-w-[280px] sm:max-w-[320px] md:max-w-[400px]">
              {/* HUD Elements - framed relative to the phone card */}
              <div className="absolute -top-3 -left-3 sm:-top-6 sm:-left-6 md:-top-10 md:-left-10 w-10 h-10 sm:w-16 sm:h-16 md:w-20 md:h-20 border-t border-l border-neon-cyan/20 pointer-events-none z-10" />
              <div className="absolute -bottom-3 -right-3 sm:-bottom-6 sm:-right-6 md:-bottom-10 md:-right-10 w-10 h-10 sm:w-16 sm:h-16 md:w-20 md:h-20 border-b border-r border-neon-cyan/20 pointer-events-none z-10" />

              <div
                ref={containerRef}
                onMouseMove={handleMouseMove}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="relative w-full h-[480px] sm:h-[540px] md:h-[650px] mx-auto bg-zinc-900 rounded-[2.5rem] overflow-hidden cursor-none select-none border border-white/10 shadow-2xl group transition-all duration-500 hover:border-neon-cyan/30 touch-none"
              >
                {/* Base Layer - Device Image */}
                <div
                  className="absolute inset-0 bg-cover bg-center transition-all duration-700 pointer-events-none select-none"
                  style={{
                    backgroundImage: `url('https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?q=80&w=2070&auto=format&fit=crop')`,
                    filter: isHovering
                      ? 'grayscale(100%) brightness(0.6)'
                      : 'brightness(0.9) contrast(1.1)',
                  }}
                />

                {/* X-Ray Layer - Internal Components */}
                <motion.div
                  className="absolute inset-0 bg-cover bg-center pointer-events-none select-none"
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
                      <div
                        className="w-full h-full border-[1px] border-neon-cyan rounded-full relative"
                        style={{ boxShadow: '0 0 30px rgba(var(--neon-cyan-rgb), 0.4)' }}
                      >
                        {/* Scanning Lines */}
                        <div className="absolute inset-0 border-t border-neon-cyan/40 rounded-full animate-spin-slow spin-4s" />
                        <div
                          className="absolute top-1/2 left-0 w-full h-[1px] bg-neon-cyan/50 animate-pulse"
                          style={{ boxShadow: '0 0 10px var(--neon-cyan)' }}
                        />
                      </div>
                      <div
                        className={`absolute ${
                          mousePos.y < 80 ? '-bottom-10' : '-top-12'
                        } left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md border border-neon-cyan/30 px-3 py-1.5 rounded-md`}
                      >
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
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[1px] pointer-events-none select-none p-6 text-center"
                  >
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/60 border border-white/10 flex items-center justify-center shadow-2xl mb-4 sm:mb-6 relative">
                      <div className="absolute inset-0 rounded-full border border-neon-cyan/30 animate-ping" />
                      <Eye size={28} className="text-neon-cyan sm:hidden" />
                      <Eye size={32} className="text-neon-cyan hidden sm:block" />
                    </div>
                    <p className="text-white font-bold text-xs sm:text-sm tracking-widest uppercase">
                      Initialize Hardware Scan
                    </p>
                    <p className="text-neon-cyan/80 text-[10px] mt-2 font-mono tracking-wider">
                      TAP OR HOVER TO SCAN
                    </p>
                  </motion.div>
                )}
              </div>
            </div>
          </div>

          {/* Right - Diagnostic Info */}
          <div className="flex-1 space-y-8 sm:space-y-12 w-full">
            <div>
              <h3 className="text-3xl sm:text-4xl font-black text-white mb-4 sm:mb-6 uppercase tracking-tighter italic">
                Diagnostic Intelligence
              </h3>
              <p className="text-zinc-500 text-base sm:text-lg leading-relaxed mb-6 sm:mb-8 font-light">
                Our proprietary diagnostic suite identifies hardware failures with surgical accuracy. We analyze every circuit trace and logic gate to ensure total system restoration.
              </p>
              <ul className="space-y-4 sm:space-y-6">
                <li className="flex items-start gap-4 sm:gap-5 group">
                  <div className="p-3 bg-zinc-900 rounded-2xl border border-white/5 group-hover:border-neon-cyan/50 transition-colors flex-shrink-0">
                    <Zap size={22} className="text-neon-cyan" />
                  </div>
                  <div>
                    <span className="block text-white font-bold text-base sm:text-lg mb-1 group-hover:text-neon-cyan transition-colors">
                      Electrical Forensics
                    </span>
                    <p className="text-xs sm:text-sm text-zinc-500 font-light">
                      Real-time monitoring of power delivery and thermal constraints.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-4 sm:gap-5 group">
                  <div className="p-3 bg-zinc-900 rounded-2xl border border-white/5 group-hover:border-neon-cyan/50 transition-colors flex-shrink-0">
                    <Cpu size={22} className="text-neon-cyan" />
                  </div>
                  <div>
                    <span className="block text-white font-bold text-base sm:text-lg mb-1 group-hover:text-neon-cyan transition-colors">
                      IC Integrity Analysis
                    </span>
                    <p className="text-xs sm:text-sm text-zinc-500 font-light">
                      Multi-layer testing of integrated circuits and signal paths.
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Diagnostic Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {diagnosticPoints.map((point, idx) => (
                <div
                  key={idx}
                  className="border border-white/5 rounded-3xl p-5 sm:p-6 bg-zinc-900/50 hover:bg-zinc-800 transition-all duration-300 group/card"
                >
                  <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-2 group-hover/card:text-neon-cyan transition-colors">
                    {point.label}
                  </p>
                  <p className="text-white font-black text-sm tracking-tight">
                    {point.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}