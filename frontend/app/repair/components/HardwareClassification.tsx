import React, { useState } from 'react';
import { Settings2, Cpu, Smartphone, HardDrive, Wifi, ShieldCheck, Printer, Monitor, CheckCircle2, ChevronRight, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const deviceCategories = [
  { 
    id: 'computing', 
    name: 'Computing & Portables', 
    icon: Cpu, 
    items: ['Laptops', 'Custom PCs', 'Workstations', 'Storage'],
    subCategories: [
      {
        name: 'Laptops',
        parts: ['Screen (LCD/LED)', 'Battery', 'Keyboard', 'Hinges', 'Charging Port (DC Jack)', 'Cooling Fans'],
        issues: ['Liquid spills', 'Overheating', 'Broken screens']
      },
      {
        name: 'Custom PCs & Workstations',
        parts: ['Power Supply Unit (PSU)', 'Graphics Card (GPU)', 'Motherboard', 'RAM sticks', 'CMOS batteries'],
        issues: ['Boot failures', 'Blue Screen of Death (BSOD)', 'Noisy fans']
      },
      {
        name: 'Storage (HDD/SSD)',
        parts: ['SSD Upgrade', 'Data Migration'],
        issues: ['Slow performance', 'Disk errors']
      }
    ]
  },
  { 
    id: 'networking', 
    name: 'Networking & Connectivity', 
    icon: Wifi, 
    items: ['Routers', 'Access Points', 'Switches'],
    subCategories: [
      {
        name: 'Wi-Fi Routers / Access Points',
        parts: ['Antennas', 'Power Adapters', 'Firmware'],
        issues: ['Signal dropping', 'Overheating', 'Corrupted firmware updates']
      },
      {
        name: 'Network Switches',
        parts: ['Individual Port repair', 'Internal Power Supplies'],
        issues: ['Blown capacitors', 'Port failure due to power surges']
      }
    ]
  },
  { 
    id: 'security', 
    name: 'Security & Surveillance', 
    icon: ShieldCheck, 
    items: ['CCTV Cameras', 'DVR / NVR'],
    subCategories: [
      {
        name: 'CCTV Cameras',
        parts: ['Lenses', 'IR (Infrared) Cut Filters', 'BNC Connectors', 'Housing/Mounts'],
        issues: ['Foggy lenses', 'Lost night vision', 'Cable corrosion']
      },
      {
        name: 'DVR / NVR (Recorders)',
        parts: ['Internal Hard Drives', 'Cooling Fans', 'Motherboards'],
        issues: ['Video loss', 'Storage full errors', 'Failure to boot']
      }
    ]
  },
  { 
    id: 'peripherals', 
    name: 'Peripherals & Add-ons', 
    icon: Printer, 
    items: ['Printers', 'Monitors'],
    subCategories: [
      {
        name: 'Printers',
        parts: ['Rollers', 'Print Heads', 'Logic Boards', 'Fuser Units'],
        issues: ['Paper jams', 'Streaky printing', 'Ink Not Recognized errors']
      },
      {
        name: 'Monitors',
        parts: ['Backlight Strips', 'Power Boards', 'Capacitors'],
        issues: ['No power', 'Flickering screen', 'Vertical lines']
      }
    ]
  },
];

interface Props {
  selectedDevice: string;
  setSelectedDevice: (id: string) => void;
}

export default function HardwareClassification({ selectedDevice, setSelectedDevice }: Props) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  const toggleSelection = (categoryId: string, item: string) => {
    setSelections(prev => {
      const current = prev[categoryId] || [];
      const updated = current.includes(item) 
        ? current.filter(i => i !== item) 
        : [...current, item];
      return { ...prev, [categoryId]: updated };
    });
  };

  return (
    <section>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-cyan-400">
          <Settings2 size={16} />
        </div>
        <h2 className="text-xs font-bold text-white uppercase tracking-[0.3em]">01. Hardware classification</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {deviceCategories.map((cat) => (
          <div
            key={cat.id}
            className={`group relative border rounded-2xl transition-all duration-500 overflow-hidden ${
              selectedDevice === cat.id 
              ? 'bg-cyan-400/5 border-cyan-400 shadow-[0_0_30px_rgba(0,242,255,0.05)] col-span-1 md:col-span-2' 
              : 'bg-zinc-900/20 border-zinc-800/50 hover:border-zinc-700 cursor-pointer'
            }`}
            onClick={() => selectedDevice !== cat.id && setSelectedDevice(cat.id)}
          >
            {/* Header Content */}
            <div className="p-6">
              <div className="flex items-start justify-between">
                <cat.icon className={`w-10 h-10 mb-6 transition-all duration-500 ${
                  selectedDevice === cat.id ? 'text-cyan-400 scale-110' : 'text-zinc-700 group-hover:text-zinc-500'
                }`} />
                {selectedDevice === cat.id && (
                  <button 
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedDevice(''); }}
                    className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-all"
                  >
                    <ChevronRight className="rotate-90" size={20} />
                  </button>
                )}
              </div>
              <h3 className={`text-lg font-bold transition-colors ${
                selectedDevice === cat.id ? 'text-white' : 'text-zinc-500'
              }`}>{cat.name}</h3>
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest mt-2 leading-relaxed">
                {cat.items.join(' • ')}
              </p>
            </div>

            {/* Expanded Content (Dropdown like) */}
            <AnimatePresence>
              {selectedDevice === cat.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-6 pb-8 pt-2 space-y-10 border-t border-zinc-800/50 bg-zinc-950/20">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10">
                      {cat.subCategories.map((sub, idx) => (
                        <div key={idx} className="space-y-6">
                           <div className="flex items-center gap-3">
                             <div className="w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,242,255,0.8)]" />
                             <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-300">{sub.name}</h4>
                           </div>
                           
                           <div className="space-y-5 px-4">
                             <div>
                               <div className="flex items-center gap-2 mb-3">
                                 <Settings2 size={10} className="text-zinc-700" />
                                 <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Repair Parts</span>
                               </div>
                               <div className="flex flex-wrap gap-2">
                                 {sub.parts.map(part => (
                                   <button
                                     key={part}
                                     type="button"
                                     onClick={(e) => { e.stopPropagation(); toggleSelection(`${cat.id}_${idx}_parts`, part); }}
                                     className={`px-3 py-1.5 rounded-lg border text-[10px] font-medium transition-all ${
                                       (selections[`${cat.id}_${idx}_parts`] || []).includes(part)
                                       ? 'bg-cyan-400/10 border-cyan-400/50 text-cyan-400 shadow-[0_0_15px_rgba(0,242,255,0.15)]'
                                       : 'bg-zinc-900/50 border-zinc-800/50 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400'
                                     }`}
                                   >
                                     {part}
                                   </button>
                                 ))}
                               </div>
                             </div>

                             <div>
                               <div className="flex items-center gap-2 mb-3">
                                 <AlertCircle size={10} className="text-zinc-700" />
                                 <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Common Issues</span>
                               </div>
                               <div className="grid grid-cols-1 gap-2">
                                 {sub.issues.map(issue => (
                                   <label 
                                     key={issue} 
                                     className="flex items-center gap-3 group/item cursor-pointer p-2 rounded-lg hover:bg-white/5 transition-all"
                                     onClick={(e) => e.stopPropagation()}
                                   >
                                     <input 
                                       type="checkbox" 
                                       className="hidden" 
                                       onChange={() => toggleSelection(`${cat.id}_${idx}_issues`, issue)}
                                     />
                                     <div className={`w-4 h-4 rounded border transition-all flex items-center justify-center ${
                                       (selections[`${cat.id}_${idx}_issues`] || []).includes(issue)
                                       ? 'bg-cyan-400 border-cyan-400' 
                                       : 'border-zinc-800 group-hover/item:border-zinc-600'
                                     }`}>
                                       {(selections[`${cat.id}_${idx}_issues`] || []).includes(issue) && <CheckCircle2 size={10} className="text-zinc-950" strokeWidth={3} />}
                                     </div>
                                     <span className={`text-[11px] transition-colors ${
                                       (selections[`${cat.id}_${idx}_issues`] || []).includes(issue) ? 'text-zinc-200' : 'text-zinc-500 group-hover/item:text-zinc-400'
                                     }`}>{issue}</span>
                                   </label>
                                 ))}
                               </div>
                             </div>
                           </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {selectedDevice === cat.id && (
              <motion.div 
                layoutId="active-bg"
                className="absolute bottom-0 left-0 h-1 bg-cyan-400 w-full"
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
