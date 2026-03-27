import React from 'react';
import Link from 'next/link';

const HeroSection = () => {
  return (
    <section className="relative h-[80vh] flex items-center overflow-hidden">
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-transform duration-1000 hover:scale-105"
        style={{ backgroundImage: "url('/hero.png')" }}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent"></div>
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-2xl">
          <h1 className="text-5xl md:text-7xl font-black text-white leading-tight uppercase tracking-tighter mb-8">
            Your Computer's <br/>
            <span className="neon-text">Personal Care</span> <br/>
            Specialist.
          </h1>
          <Link href="/services">
            <button className="btn-neon text-sm py-4 px-8 cursor-pointer">
              Discover Our Services
            </button>
          </Link><br /><br />
          <Link href="/contact">
            <button className="btn-neon text-sm py-4 px-8 cursor-pointer">
              Contact Us
            </button>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
