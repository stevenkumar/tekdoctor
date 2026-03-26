
'use client';

import React from 'react';
import { 
  Cpu, 
  Smartphone, 
  Printer, 
  Camera, 
  Wifi, 
  HardDrive, 
  Wrench, 
  Zap, 
  Search, 
  ShieldCheck,
  Settings2
} from 'lucide-react';

const hardwareCategories = [
  { name: "Computing", items: ["Custom PCs", "Laptops", "Gaming Rigs"], icon: Cpu },
  { name: "Networking", items: ["WiFi Routers", "Mesh Systems", "Switches"], icon: Wifi },
  { name: "Surveillance", items: ["IP Cameras", "DVR/NVR", "Biometrics"], icon: Camera },
  { name: "Printing", items: ["Laser Printers", "Ink Tanks", "Scanners"], icon: Printer },
];

const specialistTools = [
  { name: "Precision Soldering", level: "Board Level", icon: Zap },
  { name: "Oscilloscope", level: "Signal Analysis", icon: Settings2 },
  { name: "Thermal Imaging", level: "Heat Diagnostics", icon: Search },
  { name: "Data Recovery", level: "Deep Storage", icon: HardDrive },
];

export default function TechInventory() {
  return (
    <div className="w-full bg-[#050505] text-zinc-300 font-sans p-4 md:p-10">
      <div className="max-w-7xl mx-auto">
        
        {/* Header - Industrial Style */}
        <div className="mb-12 border-l-4 border-cyan-400 pl-6">
          <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter">
            Hardware & <span className="text-cyan-400">Diagnostics</span>
          </h1>
          <p className="mt-2 text-zinc-500 font-mono text-sm uppercase tracking-widest">
            Official Inventory & Tooling Specification
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left 2 Columns: Accessory Catalog */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-xs font-bold text-zinc-600 uppercase tracking-[0.3em] mb-4">Stock Availability</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hardwareCategories.map((cat, idx) => (
                <div key={idx} className="group bg-zinc-900/40 border border-zinc-800 p-6 rounded-2xl hover:bg-zinc-900/60 transition-all">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-cyan-500/10 rounded-xl text-cyan-400 group-hover:bg-cyan-400 group-hover:text-black transition-all">
                      <cat.icon size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-white tracking-tight">{cat.name}</h3>
                  </div>
                  <ul className="space-y-2">
                    {cat.items.map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-cyan-200 cursor-default">
                        <div className="w-1 h-1 bg-zinc-700 rounded-full" /> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Accessory Banner */}
            <div className="bg-gradient-to-r from-cyan-900/20 to-transparent border border-cyan-500/20 p-6 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-white font-bold italic">Need specific components?</p>
                <p className="text-xs text-zinc-500 uppercase">RAM, SSDs, GPUs, and Peripherals in stock daily.</p>
              </div>
              <ShieldCheck className="text-cyan-400 opacity-50" size={40} />
            </div>
          </div>

          {/* Right Column: Lab Tools (The "Doctor's" Equipment) */}
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

        </div>

        {/* Footer Accent */}
        <div className="mt-12 flex items-center gap-4 opacity-20">
          <div className="h-[1px] flex-grow bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
          <p className="text-[10px] font-mono uppercase tracking-[0.5em] whitespace-nowrap">Integrated Tekunik Solutions</p>
          <div className="h-[1px] flex-grow bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
        </div>
      </div>
    </div>
  );
}