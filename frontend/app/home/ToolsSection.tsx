// import React from 'react';

// const ToolsSection = () => {
//   return (
//     <section className="py-24 bg-zinc-950/50 border-t border-white/5">
//       <div className="container mx-auto px-6">
//         <div className="flex flex-col lg:flex-row items-center gap-12">
//           <div className="lg:w-1/3">
//             <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Featured Tools</p>
//             <h3 className="text-3xl md:text-4xl font-bold text-white uppercase italic mb-6">
//               The Doctor's <br/> <span className="neon-text">Trusted Tools</span>
//             </h3>
//             <p className="text-zinc-400 text-sm leading-relaxed mb-8">
//               We use professional-grade diagnostic and repair equipment to ensure your devices receive the highest level of care and precision.
//             </p>
//           </div>

//           <div className="lg:w-2/3 grid grid-cols-2 md:grid-cols-3 gap-4">
//             <div className="aspect-square bg-zinc-900 rounded-lg overflow-hidden border border-white/5 hover:border-neon-cyan/50 transition-colors">
//               <img src="/tools.png" alt="Precision Tools" className="w-full h-full object-cover" />
//             </div>
//             <div className="aspect-square bg-zinc-900 rounded-lg overflow-hidden border border-white/5 hover:border-neon-cyan/50 transition-colors">
//               <img src="/mat.png" alt="Anti-static Mat" className="w-full h-full object-cover" />
//             </div>
//             <div className="aspect-square bg-zinc-900 rounded-lg overflow-hidden border border-white/5 hover:border-neon-cyan/50 transition-colors col-span-2 md:col-span-1">
//               <img src="/diagnostic.png" alt="Diagnostic Workstation" className="w-full h-full object-cover" />
//             </div>
//           </div>
//         </div>
//       </div>
//     </section>
//   );
// };

// export default ToolsSection;

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Crosshair, Cpu } from 'lucide-react';

const ToolsSection = () => {
  const toolImages = [
    { src: "/tools.png", alt: "Precision Tools", label: "Micro-Toolkit" },
    { src: "/mat.png", alt: "Anti-static Mat", label: "ESD Protection" },
    { src: "/diagnostic.png", alt: "Diagnostic Workstation", label: "Logic Analyzer" },
  ];

  return (
    <section className="py-24 bg-black border-t border-zinc-900 relative overflow-hidden">
      {/* Subtle Background Glow */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-64 h-64 bg-cyan-500/5 blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          
          {/* Left Text Content */}
          <div className="lg:w-1/3 space-y-6">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="flex items-center gap-2 text-cyan-500 font-mono text-[10px] uppercase tracking-[0.4em]"
            >
              <ShieldCheck size={14} /> Certified Equipment
            </motion.div>

            <motion.h3 
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-black text-white uppercase italic leading-tight tracking-tighter"
            >
              The Doctor's <br/> 
              <span className="text-cyan-400 drop-shadow-[0_0_15px_rgba(0,242,255,0.4)]">Trusted Tools</span>
            </motion.h3>

            <motion.p 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-zinc-500 text-sm leading-relaxed max-w-sm"
            >
              We don't believe in guesswork. Our laboratory is outfitted with 
              industry-standard diagnostic gear, ensuring every circuit board 
              and component receives surgical-grade precision.
            </motion.p>

            {/* Micro Tech Stats */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-900">
               <div>
                  <p className="text-white font-bold text-lg">0.01mm</p>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Repair Precision</p>
               </div>
               <div>
                  <p className="text-white font-bold text-lg">100%</p>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest">ESD Safe Lab</p>
               </div>
            </div>
          </div>

          {/* Right Image Grid */}
          <div className="lg:w-2/3 grid grid-cols-2 md:grid-cols-3 gap-6 w-full">
            {toolImages.map((tool, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
                viewport={{ once: true }}
                className={`group relative aspect-square bg-zinc-900/50 rounded-2xl overflow-hidden border border-white/5 hover:border-cyan-500/50 transition-all duration-500 ${
                  idx === 2 ? 'col-span-2 md:col-span-1' : ''
                }`}
              >
                {/* Tool Image */}
                <img 
                  src={tool.src} 
                  alt={tool.alt} 
                  className="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700" 
                />

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                <div className="absolute bottom-4 left-4 translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <p className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                    <Crosshair size={10} /> {tool.label}
                  </p>
                  <p className="text-white text-xs font-bold uppercase tracking-tighter">System Diagnostic</p>
                </div>

                {/* Scanning Line Animation */}
                <div className="absolute top-0 left-0 w-full h-[2px] bg-cyan-500/30 -translate-y-full group-hover:animate-scan pointer-events-none" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ToolsSection;
