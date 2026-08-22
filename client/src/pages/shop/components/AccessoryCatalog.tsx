import React, { useState } from 'react';
import { Cpu, Smartphone, Printer, Camera, Wifi, ShieldCheck, ChevronDown } from 'lucide-react';
import equipmentData from '../data/equipment.json';

export default function AccessoryCatalog() {
  const [expandedCategory, setExpandedCategory] = useState<number | null>(null);

  const handleToggleCategory = (categoryId: number) => {
    if (expandedCategory === categoryId) {
      setExpandedCategory(null); // Close if already open
    } else {
      setExpandedCategory(categoryId); // Open this, close others automatically
    }
  };

  return (
    <div className="lg:col-span-2 space-y-6">
      <h2 className="text-xs font-bold text-zinc-600 uppercase tracking-[0.3em] mb-4">Stock Availability & Specifications</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 cursor-pointer">
        {equipmentData.hardware.map((cat) => {
          const categoryIcon = {
            'Computing': Cpu,
            'Networking': Wifi,
            'Surveillance': Camera,
            'Printing': Printer,
          }[cat.category] || Cpu;
          const IconComponent = categoryIcon;
          const isExpanded = expandedCategory === cat.id;

          return (
            <div 
              key={cat.id} 
              className="group bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden hover:bg-zinc-900/60 transition-all"
            >
              {/* Header */}
              <div 
                onClick={() => handleToggleCategory(cat.id)}
                className="p-6 cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-neon-cyan/10 rounded-xl text-neon-cyan group-hover:bg-neon-cyan group-hover:text-black transition-all">
                    <IconComponent size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">{cat.category}</h3>
                    <p className="text-[10px] text-neon-cyan/70 font-mono uppercase mt-1">
                      {cat.items.length} Products Available
                    </p>
                  </div>
                </div>
                <ChevronDown 
                  size={20} 
                  className={`text-zinc-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
              </div>

              {/* Expanded Content - Only shows if this specific card is expanded */}
              {isExpanded && (
                <div className="border-t border-zinc-800 px-6 py-4 space-y-4 bg-zinc-950/50">
                  {cat.items.map((item, i) => (
                    <div key={i} className="pb-4 last:pb-0 last:border-b-0 border-b border-zinc-800/50">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-bold text-white text-sm">{item.name}</h4>
                        <span className="px-2 py-1 bg-neon-cyan/20 border border-neon-cyan/40 rounded text-[9px] font-mono text-neon-cyan uppercase font-bold">
                          {item.stock} in stock
                        </span>
                      </div>
                      <p className="text-[12px] text-zinc-400 mb-2">
                        <span className="font-semibold text-zinc-300">Specs:</span> {item.specs}
                      </p>
                      <p className="text-[11px] text-neon-cyan/80 font-mono italic">
                        💡 Use Case: {item.useCase}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Accessory Banner */}
      <div className="bg-gradient-to-r from-cyan-900/20 to-transparent border border-neon-cyan/20 p-6 rounded-2xl flex items-center justify-between">
        <div>
          <p className="text-white font-bold italic">Complete Hardware Solutions</p>
          <p className="text-xs text-zinc-500 uppercase">RAM, SSDs, GPUs, Peripherals, and Custom Configurations</p>
        </div>
        <ShieldCheck className="text-neon-cyan opacity-50" size={40} />
      </div>
    </div>
  );
}
