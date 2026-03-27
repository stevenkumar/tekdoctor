import React from 'react';
import { Cpu, Smartphone, Printer, Camera, Wifi, ShieldCheck } from 'lucide-react';

const hardwareCategories = [
  { name: "Computing", items: ["Custom PCs", "Laptops", "Gaming Rigs"], icon: Cpu },
  { name: "Networking", items: ["WiFi Routers", "Mesh Systems", "Switches"], icon: Wifi },
  { name: "Surveillance", items: ["IP Cameras", "DVR/NVR", "Biometrics"], icon: Camera },
  { name: "Printing", items: ["Laser Printers", "Ink Tanks", "Scanners"], icon: Printer },
];

export default function AccessoryCatalog() {
  return (
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
  );
}
