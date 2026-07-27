import React from 'react';
import HeaderSection from './components/HeaderSection';
import RepairInquiryForm from './RepairInquiryForm';

export default function RepairBooking() {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans selection:bg-neon-cyan/30 pb-20">
      <div className="max-w-5xl mx-auto px-6 pt-12">
        
        <HeaderSection />

        <div className="mt-10">
          <RepairInquiryForm />
        </div>

        {/* Technical Footer Accent */}
        <div className="mt-32 flex items-center gap-6 opacity-20">
          <div className="h-px flex-grow bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
          <div className="flex gap-4">
            {[1, 2, 3].map(i => (
              <div 
                key={i} 
                className="w-1.5 h-1.5 bg-neon-cyan rounded-full animate-pulse" 
                style={{ animationDelay: `${i * 0.2}s` }} 
              />
            ))}
          </div>
          <p className="text-[9px] font-mono uppercase tracking-[1em] text-zinc-500">End_File_Transmission</p>
          <div className="h-px flex-grow bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
        </div>

      </div>
    </div>
  );
}