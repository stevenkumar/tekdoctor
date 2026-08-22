'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Zap, Shield, Headphones, Wrench, Leaf } from 'lucide-react';
import { useSiteContext } from '../../context/SiteContext';

const WhyChooseUs = () => {
  const { flattenedSettings } = useSiteContext();
  const reasons = [
    {
      icon: CheckCircle2,
      title: 'Expert Technicians',
      description: 'Certified professionals with 15+ years of combined experience in hardware diagnostics'
    },
    {
      icon: Shield,
      title: '90-Day Warranty',
      description: 'All repairs backed by our comprehensive warranty for complete peace of mind'
    },
    {
      icon: Zap,
      title: 'Latest Technology',
      description: 'State-of-the-art diagnostic equipment and repair tools for precision work'
    },
    {
      icon: Headphones,
      title: '24/7 Support',
      description: 'Dedicated customer support available around the clock for your questions'
    },
    {
      icon: Wrench,
      title: 'Full Range Services',
      description: 'From component-level repairs to complete system restoration and upgrades'
    },
    {
      icon: Leaf,
      title: 'Eco-Friendly',
      description: 'Sustainable practices and responsible disposal of electronic waste'
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.15,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <section className="py-8 bg-black relative overflow-hidden">
      <div className="container mx-auto px-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <h2 className="text-xs font-bold text-neon-cyan uppercase tracking-[0.4em] mb-4">Advantages</h2>
          <h3 className="text-4xl md:text-5xl font-black text-white uppercase italic">Why Choose {flattenedSettings.company_name || 'TekDoctor'}?</h3>
          <p className="text-zinc-400 text-lg mt-4 max-w-2xl mx-auto">
            We combine expertise, technology, and customer-first values to deliver exceptional results
          </p>
        </motion.div>

        {/* Reasons Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          {reasons.map((reason, index) => {
            const Icon = reason.icon;
            return (
              <motion.div
                key={index}
                variants={itemVariants}
                className="group relative p-8 border border-zinc-800 rounded-xl bg-zinc-900/30 hover:border-neon-cyan/50 hover:bg-zinc-900/60 transition-all duration-300 backdrop-blur-md"
              >
                {/* Background Gradient on Hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-neon-cyan/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />

                <div className="relative z-10">
                  {/* Icon */}
                  <div className="mb-4 inline-block p-3 rounded-lg bg-neon-cyan/10 group-hover:bg-neon-cyan/20 transition-colors">
                    <Icon className="w-6 h-6 text-neon-cyan" />
                  </div>

                  {/* Title */}
                  <h4 className="text-xl font-bold text-white mb-3 group-hover:text-neon-cyan transition-colors">
                    {reason.title}
                  </h4>

                  {/* Description */}
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    {reason.description}
                  </p>
                </div>

                {/* Right accent line */}
                <div className="absolute right-0 top-0 h-0 group-hover:h-full w-1 bg-gradient-to-b from-neon-cyan to-transparent transition-all duration-300" />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
};

export default WhyChooseUs;
