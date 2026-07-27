'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Cpu, Zap, CreditCard, ClipboardList } from 'lucide-react';
import { useSiteContext } from '../../../context/SiteContext';

const steps = [
  { label: 'Device', icon: Cpu },
  { label: 'Priority', icon: Zap },
  { label: 'Payment', icon: CreditCard },
  { label: 'Details', icon: ClipboardList },
];

export default function HeaderSection() {
  const { flattenedSettings } = useSiteContext();
  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mb-12"
    >
      {/* Top meta line */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">System Online</span>
        </div>
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="text-[10px] font-mono text-zinc-700 uppercase tracking-wider">{flattenedSettings.company_name || 'TekDoctor'} Repairs</span>
      </div>

      {/* Title */}
      <h1 className="text-4xl md:text-5xl font-black text-white leading-tight tracking-tight mb-3">
        Book a <span className="text-neon-cyan">Repair</span>
      </h1>
      <p className="text-sm text-zinc-400 max-w-lg leading-relaxed mb-8">
        Fill in the form below to submit a repair service request. Our certified technicians will review your ticket and get back to you promptly.
      </p>

      {/* Step progress indicator */}
      <div className="flex items-center gap-0 max-w-md">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const isLast = i === steps.length - 1;
          const isDevice = step.label === 'Device';
          return (
            <React.Fragment key={step.label}>
              <button
                type="button"
                onClick={() => {
                  if (isDevice) {
                    const formEl = document.getElementById('repair-inquiry-form');
                    if (formEl) {
                      formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }
                }}
                disabled={!isDevice}
                className={`flex flex-col items-center gap-1.5 focus:outline-none transition-all duration-300 ${isDevice
                  ? 'cursor-pointer opacity-100'
                  : 'cursor-not-allowed opacity-40'
                  }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${isDevice
                  ? 'bg-neon-cyan/10 border border-neon-cyan/50 hover:border-neon-cyan'
                  : 'bg-zinc-900 border border-zinc-800'
                  }`}>
                  <Icon size={14} className={isDevice ? 'text-neon-cyan' : 'text-zinc-500'} />
                </div>
                <span className={`text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap transition-colors ${isDevice
                  ? 'text-zinc-300 hover:text-neon-cyan'
                  : 'text-zinc-600'
                  }`}>
                  {step.label}
                </span>
              </button>
              {!isLast && (
                <div className="flex-1 h-px bg-gradient-to-r from-neon-cyan/30 to-zinc-700/40 mx-2 mb-4" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </motion.div>
  );
}
