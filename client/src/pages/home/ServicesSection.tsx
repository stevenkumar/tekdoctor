'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { homeServicesData } from '@/data/servicesData';

const EASE_SMOOTH = [0.25, 0.1, 0.25, 1.0] as const;

const ServicesSection = () => {
  const [visibleCount, setVisibleCount] = useState(3);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleViewMore = () => {
    if (visibleCount === 3) {
      setVisibleCount(homeServicesData.length);
    } else {
      setVisibleCount(3);
      setExpandedId(null);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.08,
        delayChildren: shouldReduceMotion ? 0 : 0.1,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0.2 : 0.45,
        ease: EASE_SMOOTH,
      },
    },
    exit: {
      opacity: 0,
      scale: shouldReduceMotion ? 1 : 0.96,
      transition: {
        duration: 0.25,
        ease: EASE_SMOOTH,
      },
    },
  };

  return (
    <section className="bg-[#050505] py-16 px-6 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none" style={{ background: 'radial-gradient(circle at center, rgba(var(--neon-cyan-rgb), 0.03) 0%, transparent 70%)' }} />

      <div className="max-w-7xl mx-auto relative z-10">
        <header className="mb-12">
          <motion.div
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: shouldReduceMotion ? 0.2 : 0.6, ease: EASE_SMOOTH }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-8 bg-neon-cyan/50" />
              <h2 className="text-xs font-bold text-neon-cyan uppercase tracking-[0.4em]">Expertise</h2>
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter uppercase leading-none">
              OUR <span className="text-zinc-500">SERVICES</span>
            </h1>
          </motion.div>
        </header>

        <LayoutGroup id="services-grid">
          <motion.div
            layout
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            transition={{
              layout: {
                duration: shouldReduceMotion ? 0.01 : 0.4,
                ease: EASE_SMOOTH,
              },
            }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <AnimatePresence initial={false}>
              {homeServicesData.slice(0, visibleCount).map((service) => {
                const Icon = service.icon;
                const isExpanded = expandedId === service.id;

                return (
                  <motion.div
                    key={service.id}
                    layout
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{
                      layout: {
                        duration: shouldReduceMotion ? 0.01 : 0.38,
                        ease: EASE_SMOOTH,
                      },
                    }}
                    className={`group relative bg-zinc-900/50 rounded-3xl p-6 border border-white/5 hover:border-neon-cyan/30 transition-colors duration-300 cursor-pointer overflow-hidden ${
                      isExpanded ? 'md:col-span-2 lg:col-span-2 border-neon-cyan/20 bg-zinc-900/70' : 'hover:bg-zinc-900/60'
                    }`}
                    onClick={() => toggleExpand(service.id)}
                  >
                    <div className="flex flex-col md:flex-row gap-6 h-full w-full">
                      {/* Left Column (or Full card when collapsed) */}
                      <motion.div
                        layout="position"
                        className={`flex flex-col justify-between h-full min-w-0 ${isExpanded ? 'md:w-1/2' : 'w-full'}`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div className="p-3 rounded-2xl bg-zinc-800/50 text-neon-cyan border border-white/5 group-hover:border-neon-cyan/50 transition-colors">
                              <Icon size={28} />
                            </div>
                            <div className="text-[10px] font-mono text-zinc-700 tracking-wider">
                              REF_ID_{service.id.toString().padStart(3, '0')}
                            </div>
                          </div>

                          <h3 className="text-2xl font-bold text-white tracking-tight group-hover:text-neon-cyan transition-colors mb-3">
                            {service.title}
                          </h3>

                          <p className="text-zinc-400 text-sm leading-relaxed font-light">
                            {service.shortDesc || service.desc}
                          </p>
                        </div>

                        <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/5">
                          <div className="flex items-center gap-3 group/btn">
                            <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center group-hover/btn:bg-neon-cyan group-hover/btn:border-neon-cyan transition-colors duration-300">
                              <AnimatePresence mode="wait" initial={false}>
                                {isExpanded ? (
                                  <motion.div
                                    key="expanded"
                                    initial={{ opacity: 0, rotate: -45 }}
                                    animate={{ opacity: 1, rotate: 0 }}
                                    exit={{ opacity: 0, rotate: 45 }}
                                    transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
                                  >
                                    <ChevronUp size={18} className="text-zinc-500 group-hover/btn:text-black transition-colors" />
                                  </motion.div>
                                ) : (
                                  <motion.div
                                    key="collapsed"
                                    initial={{ opacity: 0, rotate: -45 }}
                                    animate={{ opacity: 1, rotate: 0 }}
                                    exit={{ opacity: 0, rotate: 45 }}
                                    transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
                                  >
                                    <ArrowRight size={18} className="text-zinc-500 group-hover/btn:text-black transition-colors" />
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest group-hover/btn:text-neon-cyan transition-colors">
                              {isExpanded ? 'Show Less' : 'Learn More'}
                            </span>
                          </div>

                          {service.category && (
                            <span className="text-[9px] font-bold uppercase text-zinc-600 tracking-widest border border-zinc-800 px-2 py-1 rounded">
                              {service.category}
                            </span>
                          )}
                        </div>
                      </motion.div>

                      {/* Right Column (only shown when expanded) */}
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
                          className="flex flex-col justify-between border-t md:border-t-0 md:border-l border-white/5 pt-6 md:pt-0 md:pl-6 md:w-1/2 h-full overflow-hidden"
                        >
                          <div>
                            <p className="text-zinc-300 text-sm leading-relaxed font-light mb-4 text-left">
                              {service.fullDesc}
                            </p>
                            <div className="mb-4">
                              <h4 className="text-xs font-semibold text-white mb-2 uppercase tracking-wider">Key Features</h4>
                              <ul className="grid grid-cols-1 gap-2">
                                {service.features.map((feature, i) => (
                                  <li key={i} className="flex items-center gap-2 text-zinc-400 text-sm">
                                    <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan"></div>
                                    {feature}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          {service.labStats && (
                            <div className="grid grid-cols-2 gap-4 mt-4 bg-black/20 p-4 rounded-xl border border-white/5">
                              {service.labStats.map((stat, i) => (
                                <div key={i}>
                                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{stat.label}</div>
                                  <div className="text-neon-cyan font-mono text-sm">{stat.value}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>

        {homeServicesData.length > 3 && (
          <motion.div
            layout="position"
            className="mt-12 flex justify-center"
          >
            <button
              onClick={handleViewMore}
              className="flex items-center gap-2 px-8 py-3 rounded-full border border-white/10 bg-zinc-900/40 text-sm font-semibold text-white hover:bg-neon-cyan hover:text-black hover:border-neon-cyan transition-colors duration-300 cursor-pointer"
            >
              {visibleCount === 3 ? (
                <>View All Services <ChevronDown size={16} /></>
              ) : (
                <>Show Less <ChevronUp size={16} /></>
              )}
            </button>
          </motion.div>
        )}
      </div>
    </section>
  );
};

export default ServicesSection;
