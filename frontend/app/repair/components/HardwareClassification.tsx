import React from 'react';
import { Settings2, Cpu, Smartphone, HardDrive } from 'lucide-react';
import { motion } from 'framer-motion';

const deviceCategories = [
  { id: 'computing', name: 'Computing', icon: Cpu, items: ['Laptops', 'Custom PCs', 'Workstations'] },
  { id: 'mobile', name: 'Mobile Devices', icon: Smartphone, items: ['Smartphones', 'Tablets', 'Foldables'] },
  { id: 'storage', name: 'Storage Media', icon: HardDrive, items: ['SSD/HDD', 'External Drives', 'RAID'] },
];

interface Props {
  selectedDevice: string;
  setSelectedDevice: (id: string) => void;
}

export default function HardwareClassification({ selectedDevice, setSelectedDevice }: Props) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-cyan-400">
          <Settings2 size={16} />
        </div>
        <h2 className="text-xs font-bold text-white uppercase tracking-[0.3em]">01. Hardware classification</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {deviceCategories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedDevice(cat.id)}
            className={`cursor-pointer group relative p-6 text-left border rounded-2xl transition-all duration-500 overflow-hidden ${
              selectedDevice === cat.id 
              ? 'bg-cyan-400/5 border-cyan-400 shadow-[0_0_30px_rgba(0,242,255,0.05)]' 
              : 'bg-zinc-900/20 border-zinc-800/50 hover:border-zinc-700'
            }`}
          >
            <cat.icon className={`w-10 h-10 mb-6 transition-all duration-500 ${
              selectedDevice === cat.id ? 'text-cyan-400 scale-110' : 'text-zinc-700 group-hover:text-zinc-500'
            }`} />
            <h3 className={`text-lg font-bold transition-colors ${
              selectedDevice === cat.id ? 'text-white' : 'text-zinc-500'
            }`}>{cat.name}</h3>
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mt-2 leading-relaxed">
              {cat.items.join(' • ')}
            </p>
            
            {selectedDevice === cat.id && (
              <motion.div 
                layoutId="active-bg"
                className="absolute bottom-0 left-0 h-1 bg-cyan-400 w-full"
              />
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
