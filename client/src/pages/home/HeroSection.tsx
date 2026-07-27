'use client';

import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, ChevronDown, Monitor, ShieldCheck, Zap } from 'lucide-react';
import { useSiteContext } from '../../context/SiteContext';

const HeroSection = () => {
  const { homepage } = useSiteContext();
  const heroContent = homepage?.hero || {};

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.3 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 25 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const },
    },
  };

  return (
    <section className="relative min-h-[90vh] lg:h-screen flex items-center justify-center overflow-hidden bg-[#030712]">
      {/* --- BACKGROUND LAYER --- */}
      <div className="absolute inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105 animate-soft-zoom"
          style={{ backgroundImage: "url('/hero.png')" }}
        />
        Layered Overlays for Depth
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950/80 via-gray-950/40 to-gray-950/90" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#030712_100%)]" />
      </div>

      {/* --- DECORATIVE LIGHTING --- */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ opacity: [0.4, 0.7, 0.4], scale: [1, 1.1, 1] }}
          transition={{ duration: 8, repeat: Infinity }}
          className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-neon-cyan/20 rounded-full blur-[120px]"
        />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px]" />
      </div>

      {/* --- MAIN CONTENT --- */}
      <div className="container mx-auto px-6 relative z-10 pt-20">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-5xl mx-auto text-center flex flex-col items-center"
        >
          {/* Advanced Badge */}
          <motion.div
            variants={itemVariants}
            className="group mb-8 flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md hover:border-neon-cyan/50 transition-colors cursor-default"
          >
            <Sparkles className="w-4 h-4 text-neon-cyan group-hover:rotate-12 transition-transform" />
            <span className="text-xs font-bold tracking-[0.2em] uppercase text-gray-300">
              Premium Tech Solutions
            </span>
          </motion.div>

          {/* Precision Heading */}
          <motion.h1
            variants={itemVariants}
            className="text-5xl sm:text-7xl lg:text-9xl font-black text-white leading-[0.95] tracking-tighter mb-8"
          >
            Computer <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-neon-cyan to-neon-cyan inline-block drop-shadow-[0_0_30px_rgba(34,211,238,0.3)]">
              care redefined
            </span>
          </motion.h1>

          {/* Glass Subheading Box */}
          <motion.p
            variants={itemVariants}
            className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl leading-relaxed font-light"
          >
            We don't just fix computers; we restore performance. Experience surgical-grade diagnostics and component restoration for the modern era.
          </motion.p>

          {/* Refined CTA Buttons */}
          <motion.div
            variants={itemVariants}
            className="flex flex-col sm:flex-row gap-6 mb-20"
          >
            <Link to="/services">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="group relative px-8 py-4 bg-white text-black font-bold rounded-full overflow-hidden flex items-center gap-3"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-neon-cyan to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative z-10 flex items-center gap-2 group-hover:text-white transition-colors">
                  View Our Services <ArrowRight className="w-5 h-5" />
                </span>
              </motion.button>
            </Link>

            <Link to="/contact">
              <motion.button
                whileHover={{ scale: 1.05 }}
                className="px-8 py-4 border border-white/20 text-white font-bold rounded-full backdrop-blur-md hover:bg-white/5 transition-all flex items-center gap-2"
              >
                Emergency Repair
              </motion.button>
            </Link>
          </motion.div>

          {/* Advanced Stats Row */}
          <motion.div
            variants={itemVariants}
            className="w-full grid grid-cols-1 md:grid-cols-3 gap-0 border border-white/10 rounded-[2rem] overflow-hidden bg-white/5 backdrop-blur-sm mb-30"
          >
            {(heroContent.metrics || [
              { label: 'Devices Revived', value: '10+' },
              { label: 'Success Metric', value: '99.9%' },
              { label: 'Response Time', value: '24/7' },
            ]).map((stat: any, i: number) => {
              const icons = [
                <Monitor className="w-4 h-4" key="1" />,
                <ShieldCheck className="w-4 h-4" key="2" />,
                <Zap className="w-4 h-4" key="3" />
              ];
              return (
                <div
                  key={i}
                  className={`p-8 flex flex-col items-center justify-center ${i !== 2 ? 'border-b md:border-b-0 md:border-r border-white/10' : ''} hover:bg-white/5 transition-colors`}
                >
                  <div className="flex items-center gap-2 text-neon-cyan mb-2">
                    {icons[i % icons.length]}
                    <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-gray-500">{stat.label}</span>
                  </div>
                  <p className="text-4xl font-black text-white">{stat.value}</p>
                </div>
              )
            })}
          </motion.div>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        animate={{ y: [0, 12, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 hidden lg:block"
      >
        <div className="w-6 h-10 border-2 border-white/20 rounded-full flex justify-center p-1">
          <div className="w-1 h-2 bg-neon-cyan rounded-full" />
        </div>
      </motion.div>

      {/* Bottom Gradient Transition */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#030712] to-transparent z-10" />
    </section>
  );
};

export default HeroSection;