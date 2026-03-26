import React from 'react';
import Link from 'next/link';

const HomePage = () => {
  const services = [
    { title: "Computer Repairing", desc: "Hardware diagnostics, logic board repair.", icon: "🔧" },
    { title: "Laptop Repairing", desc: "Screen replacement, hinge repair, upgrades.", icon: "💻" },
    { title: "CCTV & TV Repairing", desc: "Security system setup, flat-screen repair.", icon: "📷" },
    { title: "Computer Refurbished", desc: "Certified pre-owned computers, budget solutions.", icon: "♻️" },
    { title: "New Computer & Laptop", desc: "Custom builds, latest models, retail sales.", icon: "🖥️" },
    { title: "Networking & WIFI", desc: "Home/office setup, connectivity fixes.", icon: "📡" },
  ];

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
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
              <button className="btn-neon text-sm py-4 px-8">
                Discover Our Services
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-24 bg-black">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-xs font-bold text-neon-cyan uppercase tracking-[0.4em] mb-4">Expertise</h2>
            <h3 className="text-3xl md:text-4xl font-bold text-white uppercase italic">Our Expert Services</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service, index) => (
              <div key={index} className="card-neon group cursor-pointer">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-300">
                    {service.icon}
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white mb-2 uppercase group-hover:text-neon-cyan transition-colors italic">
                      {service.title}
                    </h4>
                    <p className="text-zinc-500 text-sm leading-relaxed">
                      {service.desc}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tools Section */}
      <section className="py-24 bg-zinc-950/50 border-t border-white/5">
        <div className="container mx-auto px-6">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="lg:w-1/3">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Featured Tools</p>
              <h3 className="text-3xl md:text-4xl font-bold text-white uppercase italic mb-6">
                The Doctor's <br/> <span className="neon-text">Trusted Tools</span>
              </h3>
              <p className="text-zinc-400 text-sm leading-relaxed mb-8">
                We use professional-grade diagnostic and repair equipment to ensure your devices receive the highest level of care and precision.
              </p>
            </div>

            <div className="lg:w-2/3 grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="aspect-square bg-zinc-900 rounded-lg overflow-hidden border border-white/5 hover:border-neon-cyan/50 transition-colors">
                <img src="/tools.png" alt="Precision Tools" className="w-full h-full object-cover" />
              </div>
              <div className="aspect-square bg-zinc-900 rounded-lg overflow-hidden border border-white/5 hover:border-neon-cyan/50 transition-colors">
                <img src="/mat.png" alt="Anti-static Mat" className="w-full h-full object-cover" />
              </div>
              <div className="aspect-square bg-zinc-900 rounded-lg overflow-hidden border border-white/5 hover:border-neon-cyan/50 transition-colors col-span-2 md:col-span-1">
                <img src="/diagnostic.png" alt="Diagnostic Workstation" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;