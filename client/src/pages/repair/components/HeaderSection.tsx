import React from 'react';
import { motion } from 'framer-motion';
import { useSiteContext } from '../../../context/SiteContext';
import RepairStepProgress, { type RepairWorkflowTicket, type WorkflowStepKey } from '@/components/RepairStepProgress';

interface HeaderSectionProps {
  ticket?: RepairWorkflowTicket | null;
  currentStep?: WorkflowStepKey;
  onStepClick?: (step: WorkflowStepKey) => void;
}

export default function HeaderSection({ ticket, currentStep = 'device', onStepClick }: HeaderSectionProps) {
  const { flattenedSettings } = useSiteContext();

  const handleStepClick = (step: WorkflowStepKey) => {
    if (onStepClick) {
      onStepClick(step);
      return;
    }
    if (step === 'device') {
      const formEl = document.getElementById('repair-inquiry-form');
      if (formEl) {
        formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

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
      <div className="max-w-2xl">
        <RepairStepProgress
          ticket={ticket}
          currentActiveStep={currentStep}
          onStepClick={handleStepClick}
        />
      </div>
    </motion.div>
  );
}

