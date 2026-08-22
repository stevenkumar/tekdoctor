'use client';

import React from 'react';
import { Search, SlidersHorizontal, Package, Calendar } from 'lucide-react';

interface SearchFilterProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  activeCategory: string;
  setActiveCategory: (cat: string) => void;
  activeMode: 'all' | 'sale' | 'rental';
  setActiveMode: (mode: 'all' | 'sale' | 'rental') => void;
}

const CATEGORIES = ['All Products', 'Computing', 'Networking', 'Surveillance', 'Printing', 'Lab Equipment'];

export default function SearchFilter({ 
  searchQuery, 
  setSearchQuery, 
  activeCategory, 
  setActiveCategory,
  activeMode,
  setActiveMode
}: SearchFilterProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-6 items-center justify-between">
        {/* Search Bar */}
        <div className="relative w-full lg:max-w-md group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search size={18} className="text-zinc-500 group-focus-within:text-neon-cyan transition-colors" />
          </div>
          <input
            type="text"
            placeholder="Search inventory, parts, or tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-neon-cyan/50 focus:ring-1 focus:ring-neon-cyan/20 transition-all backdrop-blur-md"
          />
        </div>

        {/* Mode Toggle */}
        <div className="flex bg-zinc-900/50 p-1.5 rounded-2xl border border-zinc-800 backdrop-blur-md ">
          <button
            onClick={() => setActiveMode('all')}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 cursor-pointer ${
              activeMode === 'all' ? 'bg-zinc-800 text-white shadow-xl' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Show All
          </button>
          <button
            onClick={() => setActiveMode('sale')}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 cursor-pointer ${
              activeMode === 'sale' ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20' : 'text-zinc-500 hover:text-neon-cyan/70'
            }`}
          >
            <Package size={14} />
            Purchase
          </button>
          <button
            onClick={() => setActiveMode('rental')}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 cursor-pointer ${
              activeMode === 'rental' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'text-zinc-500 hover:text-purple-400/70'
            }`}
          >
            <Calendar size={14} />
            Rental
          </button>
        </div>
      </div>

      {/* Categories Horizontal Scroll */}
      <div className="flex items-center gap-4 overflow-x-auto pb-4 scrollbar-hide no-scrollbar">
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900/30 border border-zinc-800/50 rounded-xl shrink-0">
          <SlidersHorizontal size={14} className="text-zinc-500" />
          <span className="text-[10px] font-mono uppercase text-zinc-500 font-bold">Category</span>
        </div>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-300 cursor-pointer cursor-pointer ${
              activeCategory === cat 
                ? 'bg-zinc-100 text-black' 
                : 'bg-zinc-900/30 text-zinc-400 border border-zinc-800/50 hover:border-zinc-600 hover:text-zinc-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
    </div>
  );
}
