'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Star, Quote, CheckCircle2 } from 'lucide-react';

const reviews = [
  {
    name: "Arjun Sharma",
    role: "Graphic Designer",
    comment: "The Tek Doctor saved my MacBook after a liquid spill. Component-level repair is no joke. Highly recommended!",
    rating: 5,
    service: "Laptop Repair"
  },
  {
    name: "Priya Patel",
    role: "Business Owner",
    comment: "Fastest CCTV installation in the city. The networking setup is seamless. Professional and transparent pricing.",
    rating: 5,
    service: "CCTV Setup"
  },
  {
    name: "Rahul Verma",
    role: "Gamer",
    comment: "Built my custom liquid-cooled PC here. The cable management is pure art. These guys are hardware geniuses.",
    rating: 5,
    service: "Custom Build"
  },
  {
    name: "Sneha Reddy",
    role: "Student",
    comment: "Fixed my printer and laptop on the same day. Very honest about what needed fixing and what didn't.",
    rating: 5,
    service: "General Service"
  }
];

export default function Testimonials() {
  return (
    <section className="w-full bg-black py-20 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs tracking-[0.3em]">
              <Star size={14} fill="currentColor" /> RECENT FEEDBACK
            </div>
            <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white">
              Trusted by <span className="text-cyan-400">Hundreds</span>
            </h2>
          </div>
          <div className="text-zinc-500 font-mono text-sm max-w-xs md:text-right">
            Real stories from clients who brought their tech back from the edge.
          </div>
        </div>

        {/* Testimonial Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {reviews.map((review, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              viewport={{ once: true }}
              className="group relative bg-zinc-900/30 border border-zinc-800 p-8 rounded-3xl hover:border-cyan-500/50 transition-all flex flex-col justify-between h-full"
            >
              {/* Background Quote Icon */}
              <div className="absolute top-6 right-6 text-zinc-800 group-hover:text-cyan-500/10 transition-colors">
                <Quote size={40} />
              </div>

              <div className="relative z-10">
                {/* Rating */}
                <div className="flex gap-1 mb-6">
                  {[...Array(review.rating)].map((_, i) => (
                    <Star key={i} size={14} className="text-cyan-400" fill="currentColor" />
                  ))}
                </div>

                <p className="text-zinc-300 text-sm leading-relaxed mb-8 italic">
                  "{review.comment}"
                </p>
              </div>

              <div className="relative z-10 pt-6 border-t border-zinc-800 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-700 to-black border border-zinc-600 flex items-center justify-center font-bold text-white uppercase text-xs">
                  {review.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <h4 className="text-white font-bold text-sm tracking-tight">{review.name}</h4>
                    <CheckCircle2 size={12} className="text-cyan-500" />
                  </div>
                  <p className="text-zinc-500 text-[10px] uppercase tracking-widest">{review.role}</p>
                </div>
              </div>
              
              {/* Service Tag */}
              <div className="absolute bottom-8 right-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] font-mono text-cyan-500 bg-cyan-500/10 px-2 py-1 rounded border border-cyan-500/20 uppercase">
                  {review.service}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Trust Metrics */}
        <div className="mt-20 py-8 border-y border-zinc-900 flex flex-wrap justify-around items-center gap-8 opacity-40">
           <div className="text-center">
              <p className="text-2xl font-black text-white">4.9/5</p>
              <p className="text-[10px] uppercase font-mono">Google Rating</p>
           </div>
           <div className="text-center">
              <p className="text-2xl font-black text-white">1.2K+</p>
              <p className="text-[10px] uppercase font-mono">Repairs Completed</p>
           </div>
           <div className="text-center">
              <p className="text-2xl font-black text-white">100%</p>
              <p className="text-[10px] uppercase font-mono">Genuine Parts</p>
           </div>
        </div>

      </div>
    </section>
  );
}