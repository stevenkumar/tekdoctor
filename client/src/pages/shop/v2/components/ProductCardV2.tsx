'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Calendar, ShieldCheck, Cpu, ExternalLink, ArrowRight } from 'lucide-react';

interface ProductCardProps {
  product: any;
  mode: 'sale' | 'rental';
  onInquiry: (product: any) => void;
  onViewDetails: (product: any) => void;
}

export default function ProductCardV2({ product, mode, onInquiry, onViewDetails }: ProductCardProps) {
  const isRental = mode === 'rental';

  return (
    <motion.div
      whileHover={{ y: -8, scale: 1.01 }}
      className="group relative flex flex-col bg-zinc-900/30 border border-zinc-800/80 rounded-[2rem] overflow-hidden hover:border-neon-cyan/30 hover:bg-zinc-900/50 transition-all duration-500 backdrop-blur-xl h-full"
    >
      {/* Decorative Glow */}
      <div className="absolute -inset-1 bg-gradient-to-tr from-neon-cyan/10 via-transparent to-purple-500/10 opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-700 -z-10" />

      <div className="p-7 space-y-5 flex-grow flex flex-col">
        {/* Top Header */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border flex items-center gap-1.5 ${isRental
              ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
              : 'bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan'
              }`}>
              {isRental ? <Calendar size={12} /> : <Cpu size={12} />}
              {isRental ? 'Rental Portfolio' : product.condition || 'Direct Purchase'}
            </span>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-white tracking-tighter">
              {isRental ? product.weeklyPrice : product.price}
            </p>
            {isRental && (
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest block -mt-1">per week</span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3">
          <h3 className="text-xl font-bold text-white group-hover:text-neon-cyan transition-colors duration-300">
            {product.name}
          </h3>
          <p className="text-sm text-zinc-400 line-clamp-2 leading-relaxed font-medium">
            {product.description}
          </p>
        </div>

        {/* Specs Pill */}
        <div className="p-4 bg-zinc-950/40 border border-zinc-800/50 rounded-2xl space-y-2">
          <div className="flex items-center justify-between opacity-50">
            <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400">Technical Config</span>
            <ShieldCheck size={12} className="text-neon-cyan" />
          </div>
          <p className="text-xs text-zinc-300 line-clamp-2 font-medium leading-snug">
            {product.specs}
          </p>
        </div>

        {/* Bottom Actions */}
        <div className="pt-4 mt-auto border-t border-zinc-800/40 flex items-center justify-between">
          <button
            onClick={() => onViewDetails(product)}
            className="text-xs font-bold text-zinc-500 hover:text-white transition-colors flex items-center gap-1 group/btn"
          >
            Specification Detail
            <ArrowRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
          </button>

          <button
            onClick={() => onInquiry(product)}
            className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2 shadow-lg ${isRental
              ? 'bg-purple-500/10 hover:bg-purple-500 text-purple-400 hover:text-white border border-purple-500/30 hover:border-transparent shadow-purple-500/5'
              : 'bg-neon-cyan/10 hover:bg-neon-cyan text-neon-cyan hover:text-black border border-neon-cyan/30 hover:border-transparent shadow-neon-cyan/5'
              }`}
          >
            {isRental ? 'Book Rental' : 'Buy Now'}
            <ExternalLink size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
