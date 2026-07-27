import React from 'react';
import { Zap, Shield, Cpu, Lock, CheckCircle } from 'lucide-react';
import equipmentData from '../data/equipment.json';

const iconMap: { [key: string]: React.ReactNode } = {
  'Zap': <Zap size={28} />,
  'Shield': <Shield size={28} />,
  'Cpu': <Cpu size={28} />,
  'Lock': <Lock size={28} />,
  'CheckCircle': <CheckCircle size={28} />,
};

export default function WhyChooseUs() {
  return (
    <div className="my-12 space-y-6">
      <div className="border-l-4 border-neon-cyan pl-6">
        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
          Why <span className="text-neon-cyan">Choose Us</span>
        </h2>
        <p className="mt-2 text-zinc-500 font-mono text-sm uppercase tracking-widest">
          Professional Equipment & Expert Service
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {equipmentData.whyChooseUs.map((item, idx) => {
          const Icon = iconMap[item.icon] ? (
            React.cloneElement(iconMap[item.icon] as React.ReactElement, {
              className: 'text-neon-cyan group-hover:text-neon-cyan transition-colors'
            } as any)
          ) : null;

          return (
            <div 
              key={idx}
              className="group bg-zinc-900/40 border border-zinc-800 hover:border-neon-cyan/50 hover:bg-zinc-900/60 p-8 rounded-2xl transition-all"
            >
              {/* Icon */}
              <div className="mb-4 p-3 bg-neon-cyan/10 rounded-xl w-fit group-hover:bg-neon-cyan/20 transition-colors">
                {Icon}
              </div>

              {/* Title */}
              <h3 className="text-lg font-bold text-white mb-3 uppercase tracking-wide group-hover:text-neon-cyan transition-colors">
                {item.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors leading-relaxed">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Trust Banner */}
      <div className="bg-gradient-to-r from-neon-cyan/10 to-blue-500/10 border border-neon-cyan/30 rounded-2xl p-8 text-center">
        <p className="text-white font-bold mb-2">Trusted by hundreds of customers</p>
        <p className="text-zinc-400 text-sm">
          Every repair is handled with the same level of care and professional standards as a medical operation.
        </p>
      </div>
    </div>
  );
}
