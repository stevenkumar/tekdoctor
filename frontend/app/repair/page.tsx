'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import HeaderSection from './components/HeaderSection';
import HardwareClassification from './components/HardwareClassification';
import TelemetryForm from './components/TelemetryForm';
import OrderConfig from './components/OrderConfig';
import SuccessMessage from './components/SuccessMessage';

export default function RepairBooking() {
  const [selectedDevice, setSelectedDevice] = useState('computing');
  const [priority, setPriority] = useState('standard');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans selection:bg-cyan-500/30 pb-20">
      <div className="max-w-5xl mx-auto px-6 pt-12">
        
        <HeaderSection />

        <AnimatePresence mode="wait">
          {!isSuccess ? (
            <motion.form 
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onSubmit={handleSubmit} 
              className="grid grid-cols-1 lg:grid-cols-3 gap-12"
            >
              <div className="lg:col-span-2 space-y-12">
                <HardwareClassification 
                  selectedDevice={selectedDevice} 
                  setSelectedDevice={setSelectedDevice} 
                />
                <TelemetryForm />
              </div>

              <OrderConfig 
                priority={priority} 
                setPriority={setPriority} 
                isSubmitting={isSubmitting} 
              />
            </motion.form>
          ) : (
            <SuccessMessage setIsSuccess={setIsSuccess} />
          )}
        </AnimatePresence>

        {/* Technical Footer Accent */}
        <div className="mt-32 flex items-center gap-6 opacity-20">
          <div className="h-px flex-grow bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
          <div className="flex gap-4">
            {[1, 2, 3].map(i => <div key={i} className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />)}
          </div>
          <p className="text-[9px] font-mono uppercase tracking-[1em] text-zinc-500">End_File_Transmission</p>
          <div className="h-px flex-grow bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
        </div>

      </div>
    </div>
  );
}