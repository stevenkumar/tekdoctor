import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

interface Props {
  setIsSuccess: (val: boolean) => void;
}

export default function SuccessMessage({ setIsSuccess }: Props) {
  return (
    <motion.div 
      key="success"
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="bg-zinc-900/20 border border-cyan-400/20 p-16 rounded-[40px] text-center max-w-2xl mx-auto shadow-[0_0_50px_rgba(0,242,255,0.02)]"
    >
      <div className="w-24 h-24 bg-cyan-400 rounded-full flex items-center justify-center mx-auto mb-10 shadow-[0_0_60px_rgba(0,242,255,0.3)] border-4 border-black">
        <CheckCircle2 className="w-12 h-12 text-black" />
      </div>
      <h2 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">Protocol Active</h2>
      <div className="h-px w-20 bg-cyan-400 mx-auto mb-8 opacity-50" />
      <p className="text-zinc-400 text-sm max-w-sm mx-auto leading-relaxed font-medium">
        Your hardware remediation ticket has been successfully logged into the mainframe. A specialist will contact you via your specified comm-link.
      </p>
      
      <div className="grid grid-cols-2 gap-4 mt-12 bg-black/40 p-6 rounded-2xl border border-zinc-800">
        <div className="text-left">
          <p className="text-[8px] font-mono text-zinc-600 uppercase">Ticket_reference</p>
          <p className="text-xs font-bold text-cyan-400">#TK-{Math.floor(Math.random() * 10000)}</p>
        </div>
        <div className="text-left">
          <p className="text-[8px] font-mono text-zinc-600 uppercase">Est_triage</p>
          <p className="text-xs font-bold text-white">4.2 HOURS</p>
        </div>
      </div>

      <div className="mt-12">
        <button 
          onClick={() => setIsSuccess(false)}
          className="px-8 py-3 bg-zinc-900 text-zinc-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 hover:text-white transition-all border border-zinc-800 cursor-pointer"
        >
          Log another request
        </button>
      </div>
    </motion.div>
  );
}
