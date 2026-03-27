'use client';

import React from 'react';
import BrandingSection from './components/BrandingSection';
import CoreValuesSection from './components/CoreValuesSection';
import ConnectionSection from './components/ConnectionSection';

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-black text-white selection:bg-cyan-500/30 overflow-hidden">
      {/* Subtle Background Elements */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_30%,#002a2d_0%,transparent_40%)] pointer-events-none" />
      
      <section className="relative max-w-5xl mx-auto standard-padding">
        <BrandingSection />
        <CoreValuesSection />
        <ConnectionSection />
      </section>
    </main>
  );
}