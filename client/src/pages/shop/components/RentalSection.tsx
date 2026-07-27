'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, ShieldCheck, X, Check, FileText } from 'lucide-react';
import rentProducts from '../data/products_for_rent.json';

export default function RentalSection() {
  const [selectedRental, setSelectedRental] = useState<typeof rentProducts[0] | null>(null);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <div className="space-y-8">
      {/* Rentals Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
      >
        {rentProducts.map((item) => (
          <motion.div
            key={item.id}
            variants={cardVariants}
            whileHover={{ scale: 1.02 }}
            className="group relative flex flex-col justify-between bg-zinc-900/40 border border-zinc-800/80 rounded-2xl overflow-hidden hover:border-neon-cyan/40 hover:bg-zinc-900/60 transition-all duration-300 backdrop-blur-md h-full select-none"
          >
            {/* Header / Banner */}
            <div className="p-6 space-y-4 flex-grow flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between mb-2">
                  <span className="px-3 py-1 bg-neon-cyan/10 border border-neon-cyan/20 rounded-full text-[10px] font-mono text-neon-cyan tracking-wider uppercase font-bold flex items-center gap-1.5">
                    <Calendar size={12} className="text-neon-cyan" />
                    Rent Option
                  </span>
                  <div className="text-right">
                    <span className="text-xl font-black font-sans tracking-tight text-white/95">{item.weeklyPrice}</span>
                    <span className="text-[10px] font-mono font-medium text-zinc-500 block uppercase tracking-wide">/ week</span>
                  </div>
                </div>

                <h3 className="text-xl font-black text-white group-hover:text-neon-cyan transition-colors tracking-tight mt-3">
                  {item.name}
                </h3>
                <p className="text-xs text-zinc-400 mt-2 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>

                {/* Rental Highlights & Details */}
                <div className="bg-zinc-950/40 border border-zinc-800/50 rounded-xl p-3 my-4 space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                    <span>Pricing Plans</span>
                    <Clock size={12} className="text-neon-cyan/40" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-300 font-sans tracking-tight">
                    <span className="text-zinc-500 font-medium">Monthly Plan:</span>
                    <span className="font-bold text-neon-cyan">{item.monthlyPrice} / Month</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-300 font-sans tracking-tight">
                    <span className="text-zinc-500 font-medium">Minimum Rental:</span>
                    <span className="font-bold text-white/90">{item.minDuration}</span>
                  </div>
                </div>
              </div>

              {/* View/Action Section */}
              <div className="pt-4 border-t border-zinc-800/60 flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider">Maintenance</span>
                  <span className="text-[11px] text-zinc-300 font-medium truncate max-w-[130px] lg:max-w-none flex items-center gap-1">
                    <ShieldCheck size={12} className="text-neon-cyan shrink-0" />
                    Included in rate
                  </span>
                </div>
                <button
                  onClick={() => setSelectedRental(item)}
                  className="px-4 py-2 bg-neon-cyan/10 hover:bg-neon-cyan text-neon-cyan hover:text-black border border-neon-cyan/30 hover:border-transparent rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-1.5 shadow-lg shadow-neon-cyan/5"
                >
                  Configure
                  <FileText size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Expanded Modal Overlay */}
      <AnimatePresence>
        {selectedRental && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-8 relative max-h-[90vh] overflow-y-auto space-y-6 shadow-2xl shadow-neon-cyan/10 select-none"
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedRental(null)}
                className="absolute top-5 right-5 p-2 text-zinc-400 hover:text-white bg-zinc-800/60 border border-zinc-700/50 rounded-xl hover:bg-zinc-800 transition-colors duration-200"
              >
                <X size={20} />
              </button>

              {/* Header Info */}
              <div className="space-y-4">
                <span className="px-3 py-1 bg-neon-cyan/10 border border-neon-cyan/20 rounded-full text-xs font-mono font-bold text-neon-cyan tracking-widest uppercase">
                  Rental Portfolio
                </span>

                <h2 className="text-3xl font-black text-white tracking-tight uppercase">
                  {selectedRental.name}
                </h2>

                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-zinc-800/60 pb-6">
                  <div>
                    <span className="text-3xl font-black font-sans text-neon-cyan tracking-tight">{selectedRental.weeklyPrice}</span>
                    <span className="text-xs font-mono text-zinc-500 ml-1">/ Weekly</span>
                  </div>
                  <div>
                    <span className="text-3xl font-black font-sans text-white/90 tracking-tight">{selectedRental.monthlyPrice}</span>
                    <span className="text-xs font-mono text-zinc-500 ml-1">/ Monthly</span>
                  </div>
                </div>
              </div>

              {/* Tech Specifications */}
              <div className="space-y-4">
                <h4 className="text-xs font-mono uppercase tracking-[0.3em] font-bold text-zinc-500">Tech Specifications</h4>
                <div className="p-4 bg-zinc-950/50 border border-zinc-800 rounded-xl text-zinc-300 font-sans text-sm leading-relaxed">
                  {selectedRental.specs}
                </div>
              </div>

              {/* Highlighting Advantages */}
              <div className="space-y-4">
                <h4 className="text-xs font-mono uppercase tracking-[0.3em] font-bold text-zinc-500">Rental Program Benefits</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedRental.highlights.map((highlight, index) => (
                    <div
                      key={index}
                      className="p-3 bg-neon-cyan/5 border border-neon-cyan/10 rounded-xl flex items-center gap-3 text-zinc-300 text-xs font-sans font-medium"
                    >
                      <div className="shrink-0 p-1 bg-neon-cyan/10 rounded text-neon-cyan">
                        <Check size={12} />
                      </div>
                      {highlight}
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-4 border-t border-zinc-800/60 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-xs text-zinc-400 font-sans leading-snug text-center sm:text-left max-w-sm">
                  Full service maintenance is completely integrated into your rate. Continuous local enterprise support.
                </p>
                <a
                  href={`/contact?subject=Rental Request on ${selectedRental.name}`}
                  className="w-full sm:w-auto px-6 py-3 bg-neon-cyan text-black hover:bg-neon-cyan hover:shadow-lg hover:shadow-neon-cyan/20 text-xs font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-md shadow-neon-cyan/5"
                >
                  Submit Rental Inquiry
                  <Calendar size={16} />
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
