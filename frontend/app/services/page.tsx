'use client';

import React from 'react';
import { Monitor, Laptop, Cctv, Cpu, Printer } from 'lucide-react';
import ServiceCard from '../data/page';

// This data structure is ready to be swapped with a database fetch later
const servicesData = [
  {
    title: "Computer Repairing",
    shortDesc: "Hardware diagnostics, logic board repair, and thermal pasting.",
    fullQuote: "Our master technicians dive deep to the component level. Whether it's a blown capacitor on your motherboard or a failing power supply, we don't just replace parts—we repair the underlying circuitry to bring your rig back to life with a 90-day warranty.",
    icon: Monitor
  },
  {
    title: "Laptop Repairing",
    shortDesc: "Screen replacements, hinge repairs, and hardware upgrades.",
    fullQuote: "A cracked screen or busted hinge shouldn't mean a new laptop. We source OEM-grade displays and custom-fabricate hinge mounts for lasting durability. Need a speed boost? Ask us about our NVMe SSD cloning service.",
    icon: Laptop
  },
  {
    title: "CCTV & TV Repairing",
    shortDesc: "Security system configuration, NVR setup, and panel repairs.",
    fullQuote: "Secure your premises with our high-definition IP camera setups. We handle the entire network topology, custom cable runs, and NVR configurations so you can monitor your property from anywhere in the world.",
    icon: Cctv
  },
  {
    title: "Networking & WIFI",
    shortDesc: "Home/office network architecture and mesh systems.",
    fullQuote: "Say goodbye to dead zones. We analyze your floor plan to deploy enterprise-grade access points, ensuring seamless roaming and maximum throughput for all your smart devices and heavy-duty workstations.",
    icon: Cpu
  },
  {
    title: "Printer Repairing",
    shortDesc: "Printer diagnostics, maintenance, and part replacement.",
    fullQuote: "Don't let a malfunctioning printer disrupt your workflow. Our technicians handle everything from paper jams and print quality issues to complex hardware failures. We service all major brands, ensuring your printer runs smoothly and reliably.",
    icon: Printer
  },
  {
    title: "Computer & Laptop Refurbishing",
    shortDesc: "",
    fullQuote: "",
    icon: Monitor
  }
];

export default function ServicesPage() {
  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-12">
      <div className="max-w-7xl mx-auto pt-10">
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-12 text-center">
          Our Expert <span className="text-cyan-400 drop-shadow-[0_0_10px_rgba(0,242,255,0.6)]">Services</span>
        </h1>
        
        {/* Masonry-style Grid - alignItems 'start' prevents layout jumps when expanding */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 items-start">
          {servicesData.map((service, idx) => (
            <ServiceCard 
              key={idx}
              index={idx}
              title={service.title}
              shortDesc={service.shortDesc}
              fullQuote={service.fullQuote}
              Icon={service.icon}
            />
          ))}
        </div>
      </div>
    </main>
  );
}