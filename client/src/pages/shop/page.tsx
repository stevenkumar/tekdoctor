import React from 'react';
import ShopDashboard from './components/ShopDashboard';

export default function ShopPage() {
  return (
    <div className="relative min-h-screen bg-[#050505]">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-neon-cyan/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[5%] left-[-10%] w-[50%] h-[50%] bg-purple-500/5 blur-[120px] rounded-full" />
      </div>

      <main>
        <ShopDashboard />
      </main>

      {/* Footer Branding Accent */}
      <div className="max-w-7xl mx-auto px-6 pb-12">
        <div className="flex items-center gap-4 opacity-20">
          <div className="h-[1px] flex-grow bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
          <p className="text-[10px] font-mono uppercase tracking-[0.5em] whitespace-nowrap">Integrated Tekunik Solutions</p>
          <div className="h-[1px] flex-grow bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
        </div>
      </div>
    </div>
  );
}