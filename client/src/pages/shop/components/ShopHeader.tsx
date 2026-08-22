import React from 'react';
import { Shield, Zap, Cpu } from 'lucide-react';

export default function ShopHeader() {
  return (
    <div className="mb-12 space-y-6">
      {/* Main Header */}
      <div className="border-l-4 border-neon-cyan pl-6">
        <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter">
          Hardware & <span className="text-neon-cyan">Diagnostics</span>
        </h1>
        <p className="mt-2 text-zinc-500 font-mono text-sm uppercase tracking-widest">
          Official Inventory & Tooling Specification
        </p>
      </div>

      {/* Subheader with Description */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
        <p className="text-zinc-300 text-sm leading-relaxed mb-4">
          Explore the professional-grade equipment and components we use to diagnose and repair your devices. Every tool in our lab is carefully selected to ensure the highest quality service.
        </p>
        
        {/* Credential Badges */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-neon-cyan/10 border border-neon-cyan/20 rounded-lg">
            <Shield size={16} className="text-neon-cyan" />
            <span className="text-[10px] font-mono text-neon-cyan uppercase">ISO 9001 Certified</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-neon-cyan/10 border border-neon-cyan/20 rounded-lg">
            <Zap size={16} className="text-neon-cyan" />
            <span className="text-[10px] font-mono text-neon-cyan uppercase">ESD Safe Lab</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-neon-cyan/10 border border-neon-cyan/20 rounded-lg">
            <Cpu size={16} className="text-neon-cyan" />
            <span className="text-[10px] font-mono text-neon-cyan uppercase">Industry Standard</span>
          </div>
        </div>
      </div>
    </div>
  );
}
