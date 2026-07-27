import React from 'react';
import { Award, CheckCircle } from 'lucide-react';
import equipmentData from '../data/equipment.json';

export default function CertificationsSection() {
  return (
    <div className="my-12 bg-gradient-to-r from-cyan-900/10 via-zinc-900/20 to-cyan-900/10 border border-neon-cyan/20 rounded-3xl p-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-neon-cyan/20 rounded-lg">
          <Award size={24} className="text-neon-cyan" />
        </div>
        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">
          Industry <span className="text-neon-cyan">Certifications</span>
        </h2>
      </div>

      <p className="text-zinc-400 text-sm mb-8 max-w-2xl">
        We maintain industry-standard certifications and professional credentials to ensure quality service and data security. Every technician is trained and certified.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {equipmentData.certifications.map((cert, idx) => (
          <div 
            key={idx}
            className="group bg-zinc-900/40 border border-zinc-800 hover:border-neon-cyan/40 p-4 rounded-xl transition-all"
          >
            <div className="flex items-start gap-3">
              <CheckCircle 
                size={18} 
                className="text-neon-cyan group-hover:text-neon-cyan transition-colors flex-shrink-0 mt-0.5"
              />
              <div>
                <h3 className="font-bold text-white text-sm group-hover:text-neon-cyan transition-colors uppercase tracking-wide">
                  {cert.name}
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  {cert.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
