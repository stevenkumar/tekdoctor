'use client';

interface InvoiceHeaderProps {
  totalInvoices: number;
  totalRevenue: number;
}

export default function InvoiceHeader({ totalInvoices, totalRevenue }: InvoiceHeaderProps) {
  return (
    <div className="mb-8 border-l-4 border-neon-cyan pl-6">
      <h1 className="text-4xl font-black text-white mb-2 tracking-wider">BILLING_SYSTEM</h1>
      <p className="text-zinc-400 text-sm font-mono mb-4">
        PROTOCOL: INVOICE_MANAGEMENT v1.0
      </p>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <div className="bg-zinc-900/50 border border-neon-cyan/30 rounded-lg p-4 hover:border-neon-cyan/70 transition-colors">
          <p className="text-zinc-500 text-xs tracking-widest mb-2">TOTAL_INVOICES</p>
          <p className="text-2xl font-bold text-neon-cyan">{totalInvoices}</p>
        </div>
        
        <div className="bg-zinc-900/50 border border-neon-cyan/30 rounded-lg p-4 hover:border-neon-cyan/70 transition-colors">
          <p className="text-zinc-500 text-xs tracking-widest mb-2">TOTAL_REVENUE</p>
          <p className="text-2xl font-bold text-neon-cyan">${totalRevenue.toFixed(2)}</p>
        </div>

        <div className="bg-zinc-900/50 border border-green-500/30 rounded-lg p-4 hover:border-green-500/70 transition-colors">
          <p className="text-zinc-500 text-xs tracking-widest mb-2">STATUS</p>
          <p className="text-sm font-mono text-green-500">● ONLINE</p>
        </div>

        <div className="bg-zinc-900/50 border border-neon-cyan/30 rounded-lg p-4 hover:border-neon-cyan/70 transition-colors">
          <p className="text-zinc-500 text-xs tracking-widest mb-2">LAST_UPDATED</p>
          <p className="text-sm font-mono text-zinc-300">{new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <div 
        className="mt-4 opacity-10 text-neon-cyan text-xs font-mono tracking-[0.3em]"
      >
        INVOICE_SYSTEM_v1.0
      </div>
    </div>
  );
}
