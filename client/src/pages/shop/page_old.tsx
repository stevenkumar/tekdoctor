'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ShopHeader from './components/ShopHeader';
import AccessoryCatalog from './components/AccessoryCatalog';
import LabTools from './components/LabTools';
import CertificationsSection from './components/CertificationsSection';
import NewProductsSection from './components/NewProductsSection';
import RentalSection from './components/RentalSection';
import { ShoppingBag, CalendarRange, Wrench, ChevronDown, ChevronUp } from 'lucide-react';

export default function TechInventory() {
  const [isSalesExpanded, setIsSalesExpanded] = useState(false);
  const [isRentalsExpanded, setIsRentalsExpanded] = useState(false);

  return (
    <div className="w-full bg-[#050505] text-zinc-300 font-sans standard-padding">
      <div className="max-w-7xl mx-auto space-y-16">
        
        <ShopHeader />

        {/* SECTION 1: NEW PRODUCTS (Directly Visible with floating cloud/neon glow border, expands on button click) */}
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{
            duration: 5,
            repeat: Infinity,
            repeatType: 'mirror',
            ease: 'easeInOut',
          }}
          className="relative bg-zinc-900/25 border border-cyan-500/30 rounded-3xl p-8 space-y-6 backdrop-blur-lg shadow-[0_0_40px_rgba(6,182,212,0.06)] hover:shadow-[0_0_50px_rgba(6,182,212,0.12)] hover:border-cyan-400/50 transition-all duration-500"
        >
          {/* Cloud/Thinking border glow elements */}
          <div className="absolute -top-1.5 -left-1.5 right-1.5 bottom-1.5 bg-gradient-to-tr from-cyan-500/10 via-transparent to-cyan-500/10 rounded-3xl -z-10 blur-xl opacity-50" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-cyan-400 pl-6 select-none">
            <div className="flex items-center gap-3">
              <ShoppingBag size={26} className="text-cyan-400 animate-pulse shrink-0" />
              <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                  Premium <span className="text-cyan-400">Direct Purchases</span>
                </h2>
                <p className="mt-1 text-zinc-500 font-mono text-xs uppercase tracking-widest leading-relaxed">
                  Brand New Consumer & Enterprise Grade Hardware across all categories
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsSalesExpanded(!isSalesExpanded)}
              className={`px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all duration-300 border self-start sm:self-center shrink-0 ${
                isSalesExpanded
                  ? 'bg-zinc-800 text-cyan-300 border-zinc-700 hover:bg-zinc-700/60'
                  : 'bg-cyan-500 text-black border-transparent shadow-lg shadow-cyan-500/20 font-black scale-[1.02] hover:bg-cyan-400'
              }`}
            >
              {isSalesExpanded ? 'Collapse Purchases' : 'Explore Purchase Catalog'}
              {isSalesExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          <AnimatePresence>
            {isSalesExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                className="overflow-hidden pt-4 border-t border-zinc-800/60"
              >
                <NewProductsSection />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* SECTION 2: RENTALS (Directly Visible with floating cloud/neon glow border, expands on button click) */}
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{
            duration: 5.5,
            repeat: Infinity,
            repeatType: 'mirror',
            ease: 'easeInOut',
          }}
          className="relative bg-zinc-900/25 border border-cyan-500/30 rounded-3xl p-8 space-y-6 backdrop-blur-lg shadow-[0_0_40px_rgba(6,182,212,0.06)] hover:shadow-[0_0_50px_rgba(6,182,212,0.12)] hover:border-cyan-400/50 transition-all duration-500"
        >
          {/* Cloud/Thinking border glow elements */}
          <div className="absolute -top-1.5 -left-1.5 right-1.5 bottom-1.5 bg-gradient-to-tr from-cyan-500/10 via-transparent to-cyan-500/10 rounded-3xl -z-10 blur-xl opacity-50" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-cyan-400 pl-6 select-none">
            <div className="flex items-center gap-3">
              <CalendarRange size={26} className="text-cyan-400 animate-pulse shrink-0" />
              <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                  Technology <span className="text-cyan-400">Rental Program</span>
                </h2>
                <p className="mt-1 text-zinc-500 font-mono text-xs uppercase tracking-widest leading-relaxed">
                  Flexible Long & Short Term Options Tailored across all categories
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsRentalsExpanded(!isRentalsExpanded)}
              className={`px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all duration-300 border self-start sm:self-center shrink-0 ${
                isRentalsExpanded
                  ? 'bg-zinc-800 text-cyan-300 border-zinc-700 hover:bg-zinc-700/60'
                  : 'bg-cyan-500 text-black border-transparent shadow-lg shadow-cyan-500/20 font-black scale-[1.02] hover:bg-cyan-400'
              }`}
            >
              {isRentalsExpanded ? 'Collapse Rentals' : 'Explore Rental Catalog'}
              {isRentalsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          <AnimatePresence>
            {isRentalsExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                className="overflow-hidden pt-4 border-t border-zinc-800/60"
              >
                <RentalSection />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* SECTION 3: ORIGINAL LAB INVENTORY & ACCESSORIES */}
        <div className="bg-zinc-900/15 border border-zinc-800/80 rounded-3xl p-8 space-y-8 backdrop-blur-md">
          <div className="flex items-center gap-3 border-l-4 border-zinc-600 pl-6 mb-2">
            <Wrench size={24} className="text-zinc-400" />
            <div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                Lab Tools & <span className="text-zinc-500">Accessory Catalog</span>
              </h2>
              <p className="mt-1 text-zinc-400 font-mono text-xs uppercase tracking-widest leading-relaxed">
                Official Maintenance Inventory & Diagnostics Tooling
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <AccessoryCatalog />
            <LabTools />
          </div>

          <CertificationsSection />
        </div>

        {/* Footer Accent */}
        <div className="mt-16 flex items-center gap-4 opacity-20">
          <div className="h-[1px] flex-grow bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
          <p className="text-[10px] font-mono uppercase tracking-[0.5em] whitespace-nowrap">Integrated Tekunik Solutions</p>
          <div className="h-[1px] flex-grow bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
        </div>
      </div>
    </div>
  );
}
