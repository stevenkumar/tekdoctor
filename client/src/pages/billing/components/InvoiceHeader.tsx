'use client';

import React from 'react';
import { Receipt, Plus, FileText, CheckCircle2, Clock, ShieldCheck, IndianRupee } from 'lucide-react';

interface InvoiceHeaderProps {
  totalInvoices: number;
  totalBilled: number;
  totalPaid: number;
  totalPending: number;
  totalGst: number;
  canCreate?: boolean;
  onCreateClick?: () => void;
}

export default function InvoiceHeader({
  totalInvoices,
  totalBilled,
  totalPaid,
  totalPending,
  totalGst,
  canCreate = false,
  onCreateClick,
}: InvoiceHeaderProps) {
  return (
    <div className="mb-8 space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-neon-cyan shrink-0">
            <Receipt size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wide">
                Commercial Invoices & Tax Management
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 uppercase tracking-widest">
                GST Compliant
              </span>
            </div>
            <p className="text-zinc-400 text-xs sm:text-sm font-sans mt-1">
              Authoritative commercial tax invoices, automated 9% CGST + 9% SGST calculation, and financial reconciliation.
            </p>
          </div>
        </div>

        {canCreate && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCreateClick}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-neon-cyan to-blue-500 text-black font-mono font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-cyan-500/20"
            >
              <Plus size={16} /> Create Invoice
            </button>
          </div>
        )}
      </div>

      {/* Corporate Financial Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Invoices */}
        <div className="bg-zinc-950/70 border border-zinc-800 rounded-2xl p-4.5 hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-mono uppercase mb-2">
            <span>Total Invoices</span>
            <FileText size={16} className="text-zinc-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-white font-mono">{totalInvoices}</p>
          <p className="text-[11px] text-zinc-500 mt-1 font-mono">Billed: ₹{totalBilled.toFixed(2)}</p>
        </div>

        {/* Paid & Settled */}
        <div className="bg-zinc-950/70 border border-emerald-500/30 rounded-2xl p-4.5 hover:border-emerald-500/60 transition-all">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-mono uppercase mb-2">
            <span>Settled Revenue</span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">₹{totalPaid.toFixed(2)}</p>
          <p className="text-[11px] text-emerald-500/80 mt-1 font-mono">Verified Settlements</p>
        </div>

        {/* Pending Receivables */}
        <div className="bg-zinc-950/70 border border-amber-500/30 rounded-2xl p-4.5 hover:border-amber-500/60 transition-all">
          <div className="flex items-center justify-between text-amber-400 text-xs font-mono uppercase mb-2">
            <span>Pending Balance</span>
            <Clock size={16} className="text-amber-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">₹{totalPending.toFixed(2)}</p>
          <p className="text-[11px] text-amber-500/80 mt-1 font-mono">Draft & Awaiting Payment</p>
        </div>

        {/* Total GST Settled */}
        <div className="bg-zinc-950/70 border border-cyan-500/30 rounded-2xl p-4.5 hover:border-cyan-500/60 transition-all">
          <div className="flex items-center justify-between text-cyan-400 text-xs font-mono uppercase mb-2">
            <span>GST Output Tax</span>
            <ShieldCheck size={16} className="text-neon-cyan" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-neon-cyan font-mono">₹{totalGst.toFixed(2)}</p>
          <p className="text-[11px] text-cyan-300/80 mt-1 font-mono">50% CGST + 50% SGST</p>
        </div>
      </div>
    </div>
  );
}
