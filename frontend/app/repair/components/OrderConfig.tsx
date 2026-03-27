import React from 'react';
import { Clock, Zap, Loader2, Send, AlertTriangle } from 'lucide-react';

const priorityLevels = [
  { id: 'standard', name: 'Standard', time: '3-5 Days', icon: Clock },
  { id: 'express', name: 'Express', time: '24-48 Hours', icon: Zap, highlight: true },
];

interface Props {
  priority: string;
  setPriority: (id: string) => void;
  isSubmitting: boolean;
}

export default function OrderConfig({ priority, setPriority, isSubmitting }: Props) {
  return (
    <div className="lg:col-span-1">
      <div className="sticky top-32 space-y-8">
        <div className="bg-zinc-900/40 border border-zinc-800 p-8 rounded-3xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 font-mono text-[8px] text-zinc-800 pointer-events-none group-hover:text-cyan-900 transition-colors">
            PRIORITY_MATRIX_v1.2
          </div>
          
          <h3 className="text-white font-black uppercase text-sm tracking-widest mb-8">Priority Level</h3>
          
          <div className="space-y-4">
            {priorityLevels.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPriority(p.id)}
                className={`cursor-pointer w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                  priority === p.id 
                  ? 'bg-cyan-400/10 border-cyan-400/50 text-white' 
                  : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <p.icon size={18} className={priority === p.id ? 'text-cyan-400' : 'text-zinc-700'} />
                  <div className="text-left">
                    <p className="text-xs font-bold uppercase tracking-widest">{p.name}</p>
                    <p className="text-[10px] font-mono opacity-50">{p.time}</p>
                  </div>
                </div>
                {priority === p.id && (
                  <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(0,242,255,0.8)]" />
                )}
              </button>
            ))}
          </div>

          <div className="mt-10 pt-8 border-t border-zinc-800/50">
            <button
              disabled={isSubmitting}
              type="submit"
              className="w-full group relative py-5 bg-cyan-500 text-black rounded-2xl font-black uppercase text-xs tracking-[0.4em] transition-all hover:bg-cyan-400 hover:shadow-[0_0_40px_rgba(0,242,255,0.4)] disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              <span className="relative z-10 flex items-center justify-center">
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Initialize Protocol
                    <Send className="w-6 h-6 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform mr-6" />
                  </>
                )}
              </span>
            </button>
          </div>

          <p className="mt-6 text-[9px] text-zinc-600 font-mono text-center uppercase tracking-widest leading-relaxed">
            By initializing, you agree to our lab's <span className="text-zinc-400">terms of remediation</span> & data privacy protocols.
          </p>
        </div>

        <div className="p-6 bg-cyan-400/5 border border-cyan-400/10 rounded-2xl">
          <div className="flex items-center gap-3 mb-3 text-cyan-400">
            <AlertTriangle size={16} />
            <p className="text-[10px] font-black uppercase tracking-widest">Lab Note</p>
          </div>
          <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">
            "Ensure all external storage media is detached unless relevant to the primary diagnostics request."
          </p>
        </div>
      </div>
    </div>
  );
}
