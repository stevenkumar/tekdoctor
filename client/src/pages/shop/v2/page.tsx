import React from 'react';
import ShopDashboard from './components/ShopDashboard';

export default function ShopV2Page() {
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
    </div>
  );
}
