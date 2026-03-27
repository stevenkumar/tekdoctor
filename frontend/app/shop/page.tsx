'use client';

import React from 'react';
import ShopHeader from './components/ShopHeader';
import AccessoryCatalog from './components/AccessoryCatalog';
import LabTools from './components/LabTools';

export default function TechInventory() {
  return (
    <div className="w-full bg-[#050505] text-zinc-300 font-sans standard-padding">
      <div className="max-w-7xl mx-auto">
        
        <ShopHeader />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <AccessoryCatalog />
          <LabTools />
        </div>

        {/* Footer Accent */}
        <div className="mt-12 flex items-center gap-4 opacity-20">
          <div className="h-[1px] flex-grow bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
          <p className="text-[10px] font-mono uppercase tracking-[0.5em] whitespace-nowrap">Integrated Tekunik Solutions</p>
          <div className="h-[1px] flex-grow bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
        </div>
      </div>
    </div>
  );
}