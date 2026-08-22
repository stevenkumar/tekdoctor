import React from 'react';
import { Wrench, Zap, Gauge, CheckCircle } from 'lucide-react';
import equipmentData from '../data/equipment.json';

export default function LabTools() {
  return (
    <div className="bg-[#0a0a0a] border border-zinc-800 rounded-3xl p-8 relative overflow-hidden">
      {/* Background Detail */}
      <div className="absolute top-0 right-0 p-4 font-mono text-[8px] text-zinc-800 leading-none pointer-events-none">
        TECHNICAL_SPEC_V3.02<br/>PROFESSIONAL_EQUIPMENT_ACTIVE
      </div>

      <h2 className="text-lg font-black text-white uppercase tracking-tighter mb-2 flex items-center gap-2">
        <Wrench size={20} className="text-neon-cyan" /> Professional Tooling
      </h2>
      <p className="text-[11px] text-zinc-500 font-mono uppercase tracking-widest mb-8">
        ISO-Standard Diagnostic Equipment
      </p>

      <div className="space-y-6 max-h-[600px] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900">
        {equipmentData.tools.map((tool) => (
          <div key={tool.id} className="group pb-6 last:pb-0 last:border-b-0 border-b border-zinc-800/50">
            {/* Tool Header with Model */}
            <div className="flex items-start gap-4 mb-3">
              <div className="text-neon-cyan/60 group-hover:text-neon-cyan transition-colors mt-1">
                <Zap size={24} strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-white uppercase tracking-wide group-hover:text-neon-cyan transition-colors">
                  {tool.name}
                </h4>
                <p className="text-[9px] font-mono text-zinc-500 mt-1">MODEL: {tool.model}</p>
              </div>
              <span className="px-2 py-1 bg-neon-cyan/10 border border-neon-cyan/20 rounded text-[8px] font-mono text-neon-cyan uppercase">
                {tool.level}
              </span>
            </div>

            {/* Specifications Grid */}
            <div className="ml-10 grid grid-cols-1 gap-2 mb-3">
              <div>
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Capabilities</p>
                <p className="text-[11px] text-zinc-300">{tool.capabilities}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Precision Standards</p>
                <p className="text-[11px] text-zinc-300">{tool.precision}</p>
              </div>
            </div>

            {/* Why We Use It */}
            <div className="ml-10 p-3 bg-neon-cyan/5 border border-neon-cyan/10 rounded-lg">
              <div className="flex items-start gap-2">
                <CheckCircle size={14} className="text-neon-cyan mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-neon-cyan/80 italic font-mono">
                  {tool.whyWUse}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ISO Certification Note */}
      <div className="mt-8 pt-8 border-t border-zinc-800/50 p-4 bg-zinc-900/50 rounded-xl">
        <p className="text-[10px] text-zinc-500 italic leading-relaxed font-mono text-center">
          "All equipment meets ISO 9001 standards. Every tool is regularly calibrated and maintained to ensure optimal performance and accurate diagnostics."
        </p>
      </div>
    </div>
  );
}
