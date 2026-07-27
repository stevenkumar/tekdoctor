import React from 'react';
import HeroSection from './HeroSection';
import ServicesSection from './ServicesSection';
import XRayScanner from '../services/component/XRayScanner';
import StatsSection from './StatsSection';
import WhyChooseUs from './WhyChooseUs';
import HowItWorks from './HowItWorks';
import ToolsSection from './ToolsSection';
import Testimonials from './Testimonials';

const HomePage = () => {
  return (
    <div className="flex flex-col">
      <HeroSection />
      <ServicesSection />
      {/* <XRayScanner /> */}
      {/* <StatsSection /> */}
      <WhyChooseUs />
      <HowItWorks />
      <ToolsSection />
      <Testimonials />
    </div>
  );
};

export default HomePage;
