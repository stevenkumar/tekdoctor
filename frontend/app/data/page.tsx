'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LucideIcon, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ServiceProps {
  title: string;
  shortDesc: string;
  fullQuote: string;
  Icon: LucideIcon;
  index: number;
}

const ServiceCard = ({ title, shortDesc, fullQuote, Icon, index }: ServiceProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      viewport={{ once: true }}
      className="group relative p-[1px] rounded-2xl overflow-hidden transition-all duration-300"
    >
      {/* The Glow Border effect */}
      <div className={`absolute inset-0 bg-gradient-to-br from-cyan-500/50 to-transparent transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`} />
      
      {/* Card Content */}
      <div className="relative bg-[#0a0a0a] p-6 md:p-8 rounded-2xl h-full flex flex-col gap-4">
        
        {/* Header Section */}
        <div className="flex justify-between items-start cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
          <div className="w-12 h-12 rounded-lg bg-cyan-950/30 flex items-center justify-center text-cyan-400 border border-cyan-500/20 group-hover:border-cyan-400/50 transition-colors">
            <Icon size={28} strokeWidth={1.5} />
          </div>
          <button 
            className="text-cyan-400/70 hover:text-cyan-400 p-2 transition-transform duration-300"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            aria-label="Toggle Details"
          >
            <ChevronDown size={24} />
          </button>
        </div>

        {/* Titles & Short Description */}
        <div className="cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
          <h3 className="text-white font-bold text-xl uppercase tracking-wider mb-2">
            {title}
          </h3>
          <p className="text-zinc-400 text-sm leading-relaxed">
            {shortDesc}
          </p>
        </div>

        {/* Expandable Quote/Details Section */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 rounded-lg bg-neutral-900/50 border-l-2 border-cyan-500">
                <p className="text-zinc-300 text-sm italic leading-relaxed">
                  "{fullQuote}"
                </p>
                <Link href="/repair">
                <button className="mt-4 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-black bg-cyan-400 rounded-md hover:bg-cyan-300 transition-colors shadow-[0_0_10px_rgba(0,242,255,0.4)] cursor-pointer">
                  Book This Repair
                </button>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ServiceCard;