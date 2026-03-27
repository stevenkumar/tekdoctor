import React from 'react';
import { HardDrive, Wrench, Zap, Search, Settings2 } from 'lucide-react';

const specialistTools = [
  { name: "Precision Soldering", level: "Board Level", icon: Zap },
  { name: "Oscilloscope", level: "Signal Analysis", icon: Settings2 },
  { name: "Thermal Imaging", level: "Heat Diagnostics", icon: Search },
  { name: "Data Recovery", level: "Deep Storage", icon: HardDrive },
];

export default function LabTools() {
  return (
    <div className="bg-[#0a0a0a] border border-zinc-800 rounded-3xl p-8 relative overflow-hidden">
      {/* Background Detail */}
      <div className="absolute top-0 right-0 p-4 font-mono text-[8px] text-zinc-800 leading-none pointer-events-none">
        TECHNICAL_SPEC_V2.04<br/>REPAIR_PROTOCOLS_ACTIVE
      </div>

      <h2 className="text-lg font-black text-white uppercase tracking-tighter mb-8 flex items-center gap-2">
        <Wrench size={20} className="text-cyan-400" /> Professional Tooling
      </h2>

      <div className="space-y-8">
        {specialistTools.map((tool, idx) => (
          <div key={idx} className="flex items-center gap-5 group">
            <div className="text-zinc-600 group-hover:text-cyan-400 transition-colors">
              <tool.icon size={28} strokeWidth={1.5} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-200 uppercase tracking-wide group-hover:text-white transition-colors">
                {tool.name}
              </h4>
              <p className="text-[10px] font-mono text-cyan-500/60 uppercase tracking-widest leading-none mt-1">
                {tool.level}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 p-4 bg-zinc-900/80 rounded-xl border border-white/5">
        <p className="text-[11px] text-zinc-500 italic leading-relaxed">
          "Our lab utilizes ISO-standard diagnostic gear to ensure zero-risk repairs on all sensitive circuitry."
        </p>
      </div>
    </div>
  );
}
