'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, Award, Clock } from 'lucide-react';

const StatsSection = () => {
  const stats = [
    {
      icon: TrendingUp,
      number: '10,000+',
      label: 'Devices Repaired',
      description: 'Successfully restored to working condition'
    },
    {
      icon: Award,
      number: '99.9%',
      label: 'Success Rate',
      description: 'Industry-leading repair completion rate'
    },
    {
      icon: Users,
      number: '5,000+',
      label: 'Happy Customers',
      description: 'Trusted by individuals and businesses'
    },
    {
      icon: Clock,
      number: '24-48hrs',
      label: 'Average Turnaround',
      description: 'Most repairs completed within 2 days'
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6 },
    },
  };

  return (
    <section className="py-24 bg-gradient-to-b from-black via-zinc-950 to-black relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] opacity-40" />
      
      <div className="container mx-auto px-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <h2 className="text-xs font-bold text-neon-cyan uppercase tracking-[0.4em] mb-4">By The Numbers</h2>
          <h3 className="text-4xl md:text-5xl font-black text-white uppercase italic">Our Impact</h3>
          <p className="text-zinc-400 text-lg mt-4 max-w-2xl mx-auto">
            Trusted by thousands of customers for precision repairs and expert diagnostics
          </p>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={index}
                variants={itemVariants}
                className="group card-neon relative overflow-hidden"
              >
                {/* Icon */}
                <div className="mb-6 inline-flex p-3 rounded-lg bg-neon-cyan/10 group-hover:bg-neon-cyan/20 transition-colors">
                  <Icon className="w-8 h-8 text-neon-cyan" />
                </div>

                {/* Number */}
                <h4 className="text-4xl md:text-5xl font-black text-neon-cyan mb-2 group-hover:scale-110 transition-transform duration-300 origin-left">
                  {stat.number}
                </h4>

                {/* Label */}
                <p className="text-white font-bold text-lg mb-2">{stat.label}</p>

                {/* Description */}
                <p className="text-zinc-500 text-sm">{stat.description}</p>

                {/* Bottom accent line */}
                <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-transparent via-neon-cyan to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
};

export default StatsSection;
