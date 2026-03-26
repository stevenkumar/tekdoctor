import React from 'react';
import Link from 'next/link';

const Navbar = () => {
  return (
    <nav className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/5 py-4">
      <div className="container mx-auto px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-10 h-10 bg-black border border-neon-cyan/50 rounded flex items-center justify-center group-hover:border-neon-cyan transition-colors">
            {/* Simple logo placeholder for 'The Tek Doctor' */}
            <span className="text-neon-cyan font-bold text-xl">+</span>
          </div>
          <div className="leading-tight">
            <h1 className="text-lg font-bold tracking-tight text-white group-hover:text-neon-cyan transition-colors">The Tek Doctor</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em]">A subdivision of tekunik.in</p>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <Link href="/about" className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">About</Link>
          <span className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">|</span>
          <Link href="/services" className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">Services</Link>
          <span className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">|</span>
          <Link href="/shop" className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">Shop</Link>
          <span className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">|</span>
          <Link href="/repair/status" className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">Repair Status</Link>
          <span className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">|</span>
          <Link href="/contact" className="text-[11px] font-semibold text-zinc-400 hover:text-neon-cyan uppercase tracking-widest transition-colors">Contact</Link>
        </div>

        <Link href="/repair">
          <button className="btn-neon cursor-pointer flex items-center gap-2 group relative">
            <span className="relative z-10 font-bold uppercase text-[11px] tracking-widest transition-colors duration-300">Book a repair</span>
            <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse group-hover:scale-125 transition-transform" />
          </button>
        </Link>
      </div>
    </nav>
  );
};

export default Navbar;
