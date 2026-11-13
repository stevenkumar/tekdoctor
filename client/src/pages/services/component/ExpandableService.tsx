'use client';

import React, { useState } from 'react';
import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
import { X, CheckCircle2, ArrowRight, Zap } from 'lucide-react';
import { servicesData } from '@/data/servicesData';
import { Link } from 'react-router-dom';

const EASE_SMOOTH = [0.25, 0.1, 0.25, 1.0] as const;

/**
 * Explicit 3-column x 3-row coordinate layouts for desktop (lg: breakpoint).
 * When one card expands (cols 1-2, rows 1-2 or rows 2-3), two companion
 * collapsed cards stack in column 3, and the remaining 3 cards form a 3-column row.
 * Pure static strings ensure full Tailwind JIT class generation without dynamic interpolation.
 */
const DESKTOP_GRID_LAYOUTS: Record<number, Record<number, string>> = {
  1: {
    1: 'lg:col-start-1 lg:col-span-2 lg:row-start-1 lg:row-span-2',
    2: 'lg:col-start-3 lg:col-span-1 lg:row-start-1 lg:row-span-1',
    3: 'lg:col-start-3 lg:col-span-1 lg:row-start-2 lg:row-span-1',
    4: 'lg:col-start-1 lg:col-span-1 lg:row-start-3 lg:row-span-1',
    5: 'lg:col-start-2 lg:col-span-1 lg:row-start-3 lg:row-span-1',
    6: 'lg:col-start-3 lg:col-span-1 lg:row-start-3 lg:row-span-1',
  },
  2: {
    1: 'lg:col-start-3 lg:col-span-1 lg:row-start-1 lg:row-span-1',
    2: 'lg:col-start-1 lg:col-span-2 lg:row-start-1 lg:row-span-2',
    3: 'lg:col-start-3 lg:col-span-1 lg:row-start-2 lg:row-span-1',
    4: 'lg:col-start-1 lg:col-span-1 lg:row-start-3 lg:row-span-1',
    5: 'lg:col-start-2 lg:col-span-1 lg:row-start-3 lg:row-span-1',
    6: 'lg:col-start-3 lg:col-span-1 lg:row-start-3 lg:row-span-1',
  },
  3: {
    1: 'lg:col-start-3 lg:col-span-1 lg:row-start-1 lg:row-span-1',
    2: 'lg:col-start-3 lg:col-span-1 lg:row-start-2 lg:row-span-1',
    3: 'lg:col-start-1 lg:col-span-2 lg:row-start-1 lg:row-span-2',
    4: 'lg:col-start-1 lg:col-span-1 lg:row-start-3 lg:row-span-1',
    5: 'lg:col-start-2 lg:col-span-1 lg:row-start-3 lg:row-span-1',
    6: 'lg:col-start-3 lg:col-span-1 lg:row-start-3 lg:row-span-1',
  },
  4: {
    1: 'lg:col-start-1 lg:col-span-1 lg:row-start-1 lg:row-span-1',
    2: 'lg:col-start-2 lg:col-span-1 lg:row-start-1 lg:row-span-1',
    3: 'lg:col-start-3 lg:col-span-1 lg:row-start-1 lg:row-span-1',
    4: 'lg:col-start-1 lg:col-span-2 lg:row-start-2 lg:row-span-2',
    5: 'lg:col-start-3 lg:col-span-1 lg:row-start-2 lg:row-span-1',
    6: 'lg:col-start-3 lg:col-span-1 lg:row-start-3 lg:row-span-1',
  },
  5: {
    1: 'lg:col-start-1 lg:col-span-1 lg:row-start-1 lg:row-span-1',
    2: 'lg:col-start-2 lg:col-span-1 lg:row-start-1 lg:row-span-1',
    3: 'lg:col-start-3 lg:col-span-1 lg:row-start-1 lg:row-span-1',
    4: 'lg:col-start-3 lg:col-span-1 lg:row-start-2 lg:row-span-1',
    5: 'lg:col-start-1 lg:col-span-2 lg:row-start-2 lg:row-span-2',
    6: 'lg:col-start-3 lg:col-span-1 lg:row-start-3 lg:row-span-1',
  },
  6: {
    1: 'lg:col-start-1 lg:col-span-1 lg:row-start-1 lg:row-span-1',
    2: 'lg:col-start-2 lg:col-span-1 lg:row-start-1 lg:row-span-1',
    3: 'lg:col-start-3 lg:col-span-1 lg:row-start-1 lg:row-span-1',
    4: 'lg:col-start-3 lg:col-span-1 lg:row-start-2 lg:row-span-1',
    5: 'lg:col-start-3 lg:col-span-1 lg:row-start-3 lg:row-span-1',
    6: 'lg:col-start-1 lg:col-span-2 lg:row-start-2 lg:row-span-2',
  },
};

export default function ExpandableServices() {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <section className="bg-[#050505] py-24 px-6 text-white relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none" style={{ background: 'radial-gradient(circle at center, rgba(var(--neon-cyan-rgb), 0.03) 0%, transparent 70%)' }} />

      <div className="max-w-7xl mx-auto relative z-10">
        <header className="mb-20">
          <motion.div
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: shouldReduceMotion ? 0.2 : 0.6, ease: EASE_SMOOTH }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-8 bg-neon-cyan/50" />
              <h2 className="text-xs font-bold text-neon-cyan uppercase tracking-[0.4em]">The Laboratory</h2>
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter uppercase leading-none">
              OUR <span className="text-zinc-500">FACILITIES</span>
            </h1>
          </motion.div>
        </header>

        <LayoutGroup id="facilities-grid">
          <motion.div
            layout
            transition={{
              layout: {
                duration: shouldReduceMotion ? 0.01 : 0.4,
                ease: EASE_SMOOTH,
              },
            }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {servicesData.map((service) => {
              const isExpanded = expandedId === service.id;
              const Icon = service.icon;
              const desktopPlacement = expandedId !== null
                ? DESKTOP_GRID_LAYOUTS[expandedId]?.[service.id] || ''
                : '';

              return (
                <motion.div
                  layout
                  key={service.id}
                  transition={{
                    layout: {
                      duration: shouldReduceMotion ? 0.01 : 0.38,
                      ease: EASE_SMOOTH,
                    },
                  }}
                  className={`relative group bg-zinc-900/40 rounded-3xl p-6 border border-white/5 hover:border-neon-cyan/30 transition-colors duration-300 flex flex-col justify-between overflow-hidden cursor-pointer backdrop-blur-sm min-h-[200px] md:min-h-[220px] h-full ${desktopPlacement} ${
                    isExpanded ? 'md:col-span-2 border-neon-cyan/20 bg-zinc-900/60' : 'hover:bg-zinc-900/60'
                  }`}
                  onClick={() => toggleExpand(service.id)}
                >
                  {/* Background Accent for Expanded State */}
                  {isExpanded && (
                    <div className="absolute top-0 right-0 w-96 h-86 bg-neon-cyan/5 rounded-bl-full blur-[100px] -z-10 pointer-events-none" />
                  )}

                  <div className="w-full min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <motion.div layout="position" className="flex items-center gap-4">
                          <div className={`p-3 rounded-2xl bg-zinc-800/50 text-neon-cyan border border-white/5 group-hover:border-neon-cyan/50 transition-colors shrink-0`}>
                            <Icon size={24} />
                          </div>
                          <h3 className="text-2xl font-bold text-white tracking-tight group-hover:text-neon-cyan transition-colors">
                            {service.title}
                          </h3>
                        </motion.div>

                        {!isExpanded && (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: shouldReduceMotion ? 0.1 : 0.2 }}
                            className="text-zinc-400 text-sm leading-relaxed line-clamp-2 font-light mt-3.5"
                          >
                            {service.desc || service.shortDesc}
                          </motion.p>
                        )}
                      </div>

                      {isExpanded && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedId(null);
                          }}
                          title="Close service details"
                          className="p-3 bg-zinc-800 hover:bg-neon-cyan hover:text-black rounded-full transition-colors duration-300 border border-white/10 shrink-0 cursor-pointer"
                        >
                          <X size={20} />
                        </button>
                      )}
                    </div>

                    {/* Expanded Content Section */}
                    {isExpanded && (
                      <motion.div
                        layout="position"
                        initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.98 }}
                        animate={{
                          opacity: 1,
                          scale: 1,
                          transition: {
                            duration: shouldReduceMotion ? 0.15 : 0.3,
                            delay: shouldReduceMotion ? 0 : 0.08,
                            ease: EASE_SMOOTH,
                          },
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-8 pt-8 border-t border-white/5 w-full min-w-0"
                      >
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
                          <div className="space-y-6 flex flex-col justify-between">
                            <div>
                              <h4 className="text-[10px] font-bold uppercase text-neon-cyan tracking-widest mb-3 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
                                Facility Deep Dive
                              </h4>
                              <p className="text-base sm:text-lg text-zinc-300 leading-relaxed font-light">
                                {service.fullDesc}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-6 py-4 border-y border-white/5">
                              {service.labStats.map((stat, i) => (
                                <div key={i}>
                                  <p className="text-[9px] font-bold uppercase text-zinc-500 tracking-[0.2em] mb-1">{stat.label}</p>
                                  <p className="text-xl sm:text-2xl font-black text-white">{stat.value}</p>
                                </div>
                              ))}
                            </div>

                            <div className="pt-2">
                              <Link to="/repair" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="px-8 py-3.5 bg-neon-cyan text-black font-bold uppercase text-xs tracking-widest rounded-full transition-all active:scale-95 cursor-pointer hover:shadow-[0_0_30px_rgba(var(--neon-cyan-rgb),0.4)]"
                                >
                                  Initialize Service
                                </button>
                              </Link>
                            </div>
                          </div>

                          <div className="bg-zinc-800/30 rounded-3xl p-6 sm:p-7 border border-white/5 backdrop-blur-sm flex flex-col justify-between">
                            <div>
                              <h4 className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest mb-6 flex items-center gap-2">
                                <Zap size={14} className="text-neon-cyan" /> Mission Parameters
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-3">
                                {service.features.map((feature, i) => (
                                  <div key={i} className="flex items-start gap-2.5 group/item">
                                    <div className="mt-0.5 w-4 h-4 rounded-md bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center group-hover/item:bg-neon-cyan group-hover/item:text-black transition-colors shrink-0">
                                      <CheckCircle2 size={10} />
                                    </div>
                                    <span className="text-xs sm:text-sm font-medium text-zinc-300 group-hover/item:text-white transition-colors leading-snug">{feature}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Bottom Row - Always visible for non-expanded */}
                  {!isExpanded && (
                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                      <div className="flex items-center gap-3 group/btn">
                        <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center group-hover/btn:bg-neon-cyan group-hover/btn:border-neon-cyan transition-colors duration-300">
                          <ArrowRight size={18} className="text-zinc-500 group-hover/btn:text-black transition-colors" />
                        </div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest group-hover/btn:text-neon-cyan transition-colors">Explore Data</span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        {service.category && (
                          <span className="text-[9px] font-bold uppercase text-zinc-500 tracking-widest border border-zinc-800 px-2 py-0.5 rounded">
                            {service.category}
                          </span>
                        )}
                        <div className="text-[10px] font-mono text-zinc-700 tracking-wider">
                          REF_ID_{service.id.toString().padStart(3, '0')}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        </LayoutGroup>
      </div>
    </section>
  );
}
