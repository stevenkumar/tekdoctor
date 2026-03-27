import React from 'react';

export default function ShopHeader() {
  return (
    <div className="mb-12 border-l-4 border-cyan-400 pl-6">
      <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter">
        Hardware & <span className="text-cyan-400">Diagnostics</span>
      </h1>
      <p className="mt-2 text-zinc-500 font-mono text-sm uppercase tracking-widest">
        Official Inventory & Tooling Specification
      </p>
    </div>
  );
}
