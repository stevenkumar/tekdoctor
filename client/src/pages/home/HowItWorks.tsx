'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Phone, Stethoscope, Wrench, CheckCircle } from 'lucide-react';

const HowItWorks = () => {
  const steps = [
    {
      icon: Phone,
      number: '01',
      title: 'Contact Us',
      description: 'Call or visit us with your device. We listen to your concerns and provide an initial assessment.'
    },
    {
      icon: Stethoscope,
      number: '02',
      title: 'Full Diagnostic',
      description: 'Our technicians perform comprehensive diagnostics to identify all hardware and software issues.'
    },
    {
      icon: Wrench,
      number: '03',
      title: 'Expert Repair',
      description: 'We execute precision repairs using advanced tools and proven techniques for optimal results.'
    },
    {
      icon: CheckCircle,
      number: '04',
      title: 'Quality Check',
      description: 'Thorough testing ensures everything works perfectly. Your device leaves with full confidence.'
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, type: 'spring' as const, stiffness: 300, damping: 30 },
    },
  };

  return (
    <section className="py-24 bg-gradient-to-b from-black via-zinc-950 to-black relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-neon-cyan/5 rounded-full blur-[120px] opacity-50" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/5 rounded-full blur-[120px] opacity-50" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <h2 className="text-xs font-bold text-neon-cyan uppercase tracking-[0.4em] mb-4">Simple Process</h2>
          <h3 className="text-4xl md:text-5xl font-black text-white uppercase italic">How It Works</h3>
          <p className="text-zinc-400 text-lg mt-4 max-w-2xl mx-auto">
            Four simple steps to get your device back to perfect condition
          </p>
        </motion.div>

        {/* Steps */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12"
        >
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div key={index} variants={itemVariants} className="relative group">
                {/* Card */}
                <div className="card-neon h-full flex flex-col relative overflow-hidden">
                  {/* Number Badge */}
                  <div className="absolute -top-8 -right-8 w-32 h-32 bg-neon-cyan/10 rounded-full group-hover:bg-neon-cyan/20 transition-colors" />
                  <span className="text-8xl font-black text-neon-cyan/20 group-hover:text-neon-cyan/30 transition-colors absolute top-2 right-2">
                    {step.number}
                  </span>

                  {/* Content */}
                  <div className="relative z-10">
                    {/* Icon */}
                    <div className="mb-6 inline-flex p-4 rounded-lg bg-neon-cyan/10 group-hover:bg-neon-cyan/20 transition-colors">
                      <Icon className="w-8 h-8 text-neon-cyan" />
                    </div>

                    {/* Title */}
                    <h4 className="text-2xl font-bold text-white mb-3 group-hover:text-neon-cyan transition-colors">
                      {step.title}
                    </h4>

                    {/* Description */}
                    <p className="text-zinc-400 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>

                {/* Connector Line (hide on last item) */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-20 -right-8 w-16 h-1 bg-gradient-to-r from-neon-cyan/30 to-transparent" />
                )}
              </motion.div>
            );
          })}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center"
        >
          <a href="/repair" className="btn-neon text-sm py-4 px-10 cursor-pointer">
            Start Your Repair Today
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default HowItWorks;
