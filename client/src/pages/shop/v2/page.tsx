import React from 'react';
import ShopDashboard from './components/ShopDashboard';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ShopV2Page() {
  return (
    <div className="relative min-h-screen bg-[#050505]">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-neon-cyan/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[5%] left-[-10%] w-[50%] h-[50%] bg-purple-500/5 blur-[120px] rounded-full" />
      </div>

      {/* Navigation Helper for Preview */}
      <div className="fixed top-6 right-6 z-[200]">
        <Link to="/shop"
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900/80 border border-zinc-800 rounded-full text-[10px] font-bold text-zinc-400 hover:text-white hover:border-zinc-700 transition-all backdrop-blur-md"
        >
          <ArrowLeft size={14} />
          Back to Original Shop
        </Link>
      </div>

      <main>
        <ShopDashboard />
      </main>

      {/* Experimental Tag */}
      <div className="fixed bottom-6 left-6 z-[200]">
        <div className="px-3 py-1 bg-neon-cyan/10 border border-neon-cyan/20 rounded-lg">
          <p className="text-[9px] font-mono font-bold text-neon-cyan uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-neon-cyan rounded-full animate-pulse" />
            V2 Interface Preview
          </p>
        </div>
      </div>
    </div>
  );
}
