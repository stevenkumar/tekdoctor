import React from 'react';

const ServicesSection = () => {
  const services = [
    { title: "Computer Repairing", desc: "Hardware diagnostics, logic board repair.", icon: "🔧" },
    { title: "Laptop Repairing", desc: "Screen replacement, hinge repair, upgrades.", icon: "💻" },
    { title: "CCTV & TV Repairing", desc: "Security system setup, flat-screen repair.", icon: "📷" },
    { title: "Computer Refurbished", desc: "Certified pre-owned computers, budget solutions.", icon: "♻️" },
    { title: "New Computer & Laptop", desc: "Custom builds, latest models, retail sales.", icon: "🖥️" },
    { title: "Networking & WIFI", desc: "Home/office setup, connectivity fixes.", icon: "📡" },
  ];

  return (
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
  );
};

export default ServicesSection;
