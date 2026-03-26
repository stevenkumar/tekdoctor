import React from 'react';
import Link from 'next/link';

const Footer = () => {
  return (
    <footer className="bg-black border-t border-white/5 py-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col items-center md:items-start">
            <h2 className="text-white font-bold text-lg tracking-tight">The Tek Doctor</h2>
            <p className="text-zinc-500 text-xs mt-1">{new Date().getFullYear()}. All rights reserved. Subdomain of tekUnik.in</p>
          </div>

          <div className="flex flex-wrap justify-center gap-6 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
            <Link href="/privacy" className="hover:text-neon-cyan transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-neon-cyan transition-colors">Terms of Service</Link>
            <Link href="/faq" className="hover:text-neon-cyan transition-colors">FAQ</Link>
            <Link href="/careers" className="hover:text-neon-cyan transition-colors">Careers</Link>
          </div>

          <div className="flex gap-4">
            {/* Social Icons Placeholders */}
            <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 hover:border-neon-cyan hover:text-neon-cyan transition-all cursor-pointer">
              <span className="text-xs">FB</span>
            </div>
            <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 hover:border-neon-cyan hover:text-neon-cyan transition-all cursor-pointer">
              <span className="text-xs">X</span>
            </div>
            <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 hover:border-neon-cyan hover:text-neon-cyan transition-all cursor-pointer">
              <span className="text-xs">IG</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
