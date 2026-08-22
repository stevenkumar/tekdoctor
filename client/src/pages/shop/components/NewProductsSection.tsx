'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Award, Cpu, ShieldCheck, X, Check, ExternalLink } from 'lucide-react';
import saleProducts from '../data/products_for_sale.json';

export default function NewProductsSection() {
  const [selectedProduct, setSelectedProduct] = useState<typeof saleProducts[0] | null>(null);

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
      {/* Catalog Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
      >
        {saleProducts.map((product) => (
          <motion.div
            key={product.id}
            variants={cardVariants}
            whileHover={{ scale: 1.02 }}
            className="group relative flex flex-col justify-between bg-zinc-900/40 border border-zinc-800/80 rounded-2xl overflow-hidden hover:border-neon-cyan/40 hover:bg-zinc-900/60 transition-all duration-300 backdrop-blur-md h-full select-none"
          >
            {/* Header / Banner */}
            <div className="p-6 space-y-4 flex-grow flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between mb-2">
                  <span className="px-3 py-1 bg-neon-cyan/10 border border-neon-cyan/20 rounded-full text-[10px] font-mono text-neon-cyan tracking-wider uppercase font-bold flex items-center gap-1.5">
                    <Cpu size={12} className="text-neon-cyan" />
                    {product.condition}
                  </span>
                  <span className="text-2xl font-black font-sans tracking-tight text-white/95">{product.price}</span>
                </div>

                <h3 className="text-xl font-black text-white group-hover:text-neon-cyan transition-colors tracking-tight mt-3">
                  {product.name}
                </h3>
                <p className="text-xs text-zinc-400 mt-2 line-clamp-2 leading-relaxed">
                  {product.description}
                </p>

                {/* Technical Specs Summary */}
                <div className="bg-zinc-950/40 border border-zinc-800/50 rounded-xl p-3 my-4 space-y-1">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 flex items-center justify-between">
                    <span>Hardware Spec</span>
                    <Award size={12} className="text-neon-cyan/40" />
                  </p>
                  <p className="text-xs text-zinc-300 font-sans tracking-tight line-clamp-2 leading-snug">
                    {product.specs}
                  </p>
                </div>
              </div>

              {/* View/Action Section */}
              <div className="pt-4 border-t border-zinc-800/60 flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider">Coverage</span>
                  <span className="text-[11px] text-zinc-300 font-medium truncate max-w-[130px] lg:max-w-none flex items-center gap-1">
                    <ShieldCheck size={12} className="text-neon-cyan shrink-0" />
                    {product.warranty.replace(' Warranty', '')}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedProduct(product)}
                  className="px-4 py-2 bg-neon-cyan/10 hover:bg-neon-cyan text-neon-cyan hover:text-black border border-neon-cyan/30 hover:border-transparent rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-1.5 shadow-lg shadow-neon-cyan/5"
                >
                  Configure
                  <ExternalLink size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Expanded Modal Overlay */}
      <AnimatePresence>
        {selectedProduct && (
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
                onClick={() => setSelectedProduct(null)}
                className="absolute top-5 right-5 p-2 text-zinc-400 hover:text-white bg-zinc-800/60 border border-zinc-700/50 rounded-xl hover:bg-zinc-800 transition-colors duration-200"
              >
                <X size={20} />
              </button>

              {/* Product Header Info */}
              <div className="space-y-4">
                <span className="px-3 py-1 bg-neon-cyan/10 border border-neon-cyan/20 rounded-full text-xs font-mono font-bold text-neon-cyan tracking-widest uppercase">
                  {selectedProduct.condition}
                </span>

                <h2 className="text-3xl font-black text-white tracking-tight uppercase">
                  {selectedProduct.name}
                </h2>

                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-zinc-800/60 pb-6">
                  <span className="text-4xl font-black font-sans text-neon-cyan tracking-tight">{selectedProduct.price}</span>
                  <span className="text-xs font-mono uppercase text-zinc-500 tracking-wide flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-zinc-500" />
                    {selectedProduct.warranty}
                  </span>
                </div>
              </div>

              {/* Technical Profile Details */}
              <div className="space-y-4">
                <h4 className="text-xs font-mono uppercase tracking-[0.3em] font-bold text-zinc-500">Tech Specifications</h4>
                <div className="p-4 bg-zinc-950/50 border border-zinc-800 rounded-xl text-zinc-300 font-sans text-sm leading-relaxed">
                  {selectedProduct.specs}
                </div>
              </div>

              {/* Highlighting Strengths */}
              <div className="space-y-4">
                <h4 className="text-xs font-mono uppercase tracking-[0.3em] font-bold text-zinc-500">Value Proposition & Advantages</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedProduct.highlights.map((highlight, index) => (
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
                  Our builds pass meticulous diagnostic routines in ESD safe laboratories. Includes 24/7 dedicated local support.
                </p>
                <a
                  href={`/contact?subject=Inquiry on ${selectedProduct.name}`}
                  className="w-full sm:w-auto px-6 py-3 bg-neon-cyan text-black hover:bg-neon-cyan hover:shadow-lg hover:shadow-neon-cyan/20 text-xs font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-md shadow-neon-cyan/5"
                >
                  Request Customized Quote
                  <ShoppingCart size={16} />
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
