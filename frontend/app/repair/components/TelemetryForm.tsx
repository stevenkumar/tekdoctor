import React from 'react';
import { ShieldCheck } from 'lucide-react';

export default function TelemetryForm() {
  return (
    <section>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-cyan-400">
          <ShieldCheck size={16} />
        </div>
        <h2 className="text-xs font-bold text-white uppercase tracking-[0.3em]">02. Telemetry & data</h2>
      </div>
      
      <div className="space-y-6">
        <div className="group">
          <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3 px-1 group-focus-within:text-cyan-400 transition-colors">Incident Description</label>
          <textarea 
            required
            placeholder="Detail the failure parameters, symptoms, or physical damage..."
            className="w-full bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-5 text-sm text-zinc-300 focus:outline-none focus:border-cyan-400/50 min-h-[160px] transition-all placeholder:text-zinc-800 focus:bg-zinc-900/50"
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="group">
            <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3 px-1 group-focus-within:text-cyan-400 transition-colors">Client Signature (Name)</label>
            <input 
              required
              type="text" 
              placeholder="EX: JOHN_DOE"
              className="w-full bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-5 text-sm focus:outline-none focus:border-cyan-400/50 transition-all placeholder:text-zinc-800 focus:bg-zinc-900/50"
            />
          </div>
          <div className="group">
            <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3 px-1 group-focus-within:text-cyan-400 transition-colors">Comm_Link (Email/Phone)</label>
            <input 
              required
              type="text" 
              placeholder="MOBILE_OR_ENCRYPTED_MAIL"
              className="w-full bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-5 text-sm focus:outline-none focus:border-cyan-400/50 transition-all placeholder:text-zinc-800 focus:bg-zinc-900/50"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
