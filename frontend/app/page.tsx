import React from 'react';
import HeroSection from './home/HeroSection';
import ServicesSection from './home/ServicesSection';
import ToolsSection from './home/ToolsSection';
import Testimonials from './home/Testimonials';

const HomePage = () => {
  return (
    <div className="flex flex-col">
      <HeroSection />
      <ServicesSection />
      <ToolsSection />
      <Testimonials />  
    </div>
  );
};

export default HomePage;