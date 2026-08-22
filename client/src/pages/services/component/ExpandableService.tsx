'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, ArrowRight, Zap } from 'lucide-react';
import { servicesData } from '@/data/servicesData';
import { Link } from 'react-router-dom';

export default function ExpandableServices() {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <section className="bg-[#050505] py-24 px-6 text-white relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none" style={{ background: 'radial-gradient(circle at center, rgba(var(--neon-cyan-rgb), 0.03) 0%, transparent 70%)' }} />

      <div className="max-w-7xl mx-auto relative z-10">
        <header className="mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {servicesData.map((service) => {
            const isExpanded = expandedId === service.id;
            const Icon = service.icon;

            return (
              <motion.div
                layout
                key={service.id}
                onClick={() => !isExpanded && setExpandedId(service.id)}
                className={`relative group bg-zinc-900/40 rounded-3xl p-8 border border-white/5 hover:border-neon-cyan/30 transition-all duration-500 flex flex-col justify-between overflow-hidden cursor-pointer backdrop-blur-sm ${isExpanded ? 'md:col-span-2 lg:col-span-3 cursor-default border-neon-cyan/20 bg-zinc-900/60' : 'h-[250px] hover:bg-zinc-900/60'
                  }`}
              >
                {/* Background Accent for Expanded State */}
                {isExpanded && (
                  <div className="absolute top-0 right-0 w-96 h-86 bg-neon-cyan/5 rounded-bl-full blur-[100px] -z-10 pointer-events-none" />
                )}

                <div className="w-full">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <motion.div layout="position" className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl bg-zinc-800/50 text-neon-cyan border border-white/5 group-hover:border-neon-cyan/50 transition-colors`}>
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
                          className="text-zinc-400 text-sm leading-relaxed line-clamp-3 font-light"
                        >
                          {service.shortDesc}
                        </motion.p>
                      )}
                    </div>

                    {isExpanded && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedId(null);
                        }}
                        title="Close service details"
                        className="p-3 bg-zinc-800 hover:bg-neon-cyan hover:text-black rounded-full transition-all duration-300 border border-white/10"
                      >
                        <X size={20} />
                      </button>
                    )}
                  </div>

                  {/* Expanded Content Section */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.5, ease: "circOut" }}
                        className="mt-8 pt-8 border-t border-white/5"
                      >
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                          <div className="space-y-8">
                            <div>
                              <h4 className="text-[10px] font-bold uppercase text-neon-cyan tracking-widest mb-4 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
                                Facility Deep Dive
                              </h4>
                              <p className="text-xl text-zinc-300 leading-relaxed font-light">
                                {service.fullDesc}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-6 md:gap-12 py-6 border-y border-white/5">
                              {service.labStats.map((stat, i) => (
                                <div key={i}>
                                  <p className="text-[9px] font-bold uppercase text-zinc-500 tracking-[0.2em] mb-2">{stat.label}</p>
                                  <p className="text-2xl font-black text-white">{stat.value}</p>
                                </div>
                              ))}
                            </div>

                            <div className="flex flex-wrap gap-4">
                              <Link to="/repair">
                                <button className="px-8 py-4 bg-neon-cyan text-black font-bold uppercase text-xs tracking-widest rounded-full transition-all active:scale-95" style={{ boxShadow: 'none' }} onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 30px rgba(var(--neon-cyan-rgb), 0.4)')} onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                                  Initialize Service
                                </button>
                              </Link>
                              {/* <Link to="/services">
                                <button className="px-8 py-4 border border-white/10 text-white font-bold uppercase text-xs tracking-widest rounded-full hover:bg-white/5 transition-all">
                                  Protocol & Pricing
                                </button>
                              </Link> */}
                            </div>
                          </div>

                          <div className="bg-zinc-800/30 rounded-3xl p-8 border border-white/5 backdrop-blur-sm">
                            <h4 className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest mb-8 flex items-center gap-2">
                              <Zap size={14} className="text-neon-cyan" /> Mission Parameters
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
                              {service.features.map((feature, i) => (
                                <div key={i} className="flex items-start gap-3 group/item">
                                  <div className="mt-1 w-5 h-5 rounded-md bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center group-hover/item:bg-neon-cyan group-hover/item:text-black transition-colors">
                                    <CheckCircle2 size={12} />
                                  </div>
                                  <span className="text-sm font-medium text-zinc-300 group-hover/item:text-white transition-colors">{feature}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Bottom Row - Always visible for non-expanded */}
                {!isExpanded && (
                  <div className="flex items-center justify-between mt-auto pt-6 border-t border-white/5">
                    <div className="flex items-center gap-3 group/btn">
                      <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center group-hover/btn:bg-neon-cyan group-hover/btn:border-neon-cyan transition-all duration-300">
                        <ArrowRight size={18} className="text-zinc-500 group-hover/btn:text-black transition-colors" />
                      </div>
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest group-hover/btn:text-neon-cyan transition-colors">Explore Data</span>
                    </div>

                    <div className="text-[10px] font-mono text-zinc-700 tracking-wider">
                      REF_ID_{service.id.toString().padStart(3, '0')}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}