'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Quote, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { testimonialApi } from '@/services/api';

const staticReviews = [
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

function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export default function Testimonials() {
  const [dbReviews, setDbReviews] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const width = useWindowWidth();

  // Responsive: 1 card mobile, 2 tablet, 4 desktop
  const cardsPerView = width >= 1024 ? 4 : width >= 640 ? 2 : 1;

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const res = await testimonialApi.getApproved();
        if (res.ok && res.data) {
          setDbReviews((res.data as any).data || []);
        }
      } catch (err) {
        console.error('Failed to fetch testimonials:', err);
      }
    };
    fetchReviews();
  }, []);

  const formattedDbReviews = dbReviews.map((r: any) => ({
    name: r.company_name ? `${r.user_name} (${r.company_name})` : r.user_name,
    role: r.user_role === 'company' ? 'B2B Partner' : 'Customer',
    comment: r.comment,
    rating: r.rating,
    service: r.user_role === 'company' ? 'B2B Feedback' : 'General Service'
  }));

  const allReviews = [...formattedDbReviews, ...staticReviews].slice(0, 12);
  const totalPages = Math.max(1, Math.ceil(allReviews.length / cardsPerView));

  // Clamp index when cardsPerView or data changes
  useEffect(() => {
    if (currentIndex >= totalPages) setCurrentIndex(0);
  }, [cardsPerView, totalPages, currentIndex]);

  const goTo = useCallback((index: number, dir: number) => {
    setDirection(dir);
    setCurrentIndex(index);
  }, []);

  const goNext = useCallback(() => {
    goTo((currentIndex + 1) % totalPages, 1);
  }, [currentIndex, totalPages, goTo]);

  const goPrev = useCallback(() => {
    goTo((currentIndex - 1 + totalPages) % totalPages, -1);
  }, [currentIndex, totalPages, goTo]);

  // Auto-play every 5 seconds
  useEffect(() => {
    if (isPaused || totalPages <= 1) return;
    const timer = setInterval(goNext, 5000);
    return () => clearInterval(timer);
  }, [goNext, isPaused, totalPages]);

  const visibleReviews = allReviews.slice(
    currentIndex * cardsPerView,
    currentIndex * cardsPerView + cardsPerView
  );

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -300 : 300,
      opacity: 0,
    }),
  };

  return (
    <section className="w-full bg-black py-16 sm:py-20 px-4 sm:px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 sm:mb-16 gap-4 sm:gap-6">
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 text-neon-cyan font-mono text-[10px] sm:text-xs tracking-[0.3em]">
              <Star size={14} fill="currentColor" /> RECENT FEEDBACK
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black uppercase tracking-tighter text-white leading-[0.95]">
              Trusted by <span className="text-neon-cyan">Hundreds</span>
            </h2>
          </div>
          <div className="text-zinc-500 font-mono text-xs sm:text-sm max-w-xs md:text-right">
            Real stories from clients who brought their tech back from the edge.
          </div>
        </div>

        {/* Slider Container */}
        <div
          className="relative"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Navigation Arrows */}
          {totalPages > 1 && (
            <>
              <button
                onClick={goPrev}
                aria-label="Previous testimonials"
                className="absolute -left-17 sm:-left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700 hover:border-neon-cyan/40 rounded-full flex items-center justify-center text-zinc-400 hover:text-neon-cyan transition-all cursor-pointer backdrop-blur-sm shadow-lg"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={goNext}
                aria-label="Next testimonials"
                className="absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700 hover:border-neon-cyan/40 rounded-full flex items-center justify-center text-zinc-400 hover:text-neon-cyan transition-all cursor-pointer backdrop-blur-sm shadow-lg"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}

          {/* Cards Slider */}
          <div className="overflow-hidden px-2 sm:px-12">
            <AnimatePresence initial={false} custom={direction} mode="wait">
              <motion.div
                key={currentIndex}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className={`grid gap-4 sm:gap-6 ${cardsPerView === 4
                  ? 'grid-cols-4'
                  : cardsPerView === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-1'
                  }`}
              >
                {visibleReviews.map((review, i) => (
                  <div
                    key={`${currentIndex}-${i}`}
                    className="group relative bg-zinc-900/30 border border-zinc-800 p-6 sm:p-8 rounded-2xl sm:rounded-3xl hover:border-neon-cyan/50 transition-all flex flex-col justify-between min-h-[260px] sm:min-h-[280px]"
                  >
                    {/* Background Quote Icon */}
                    <div className="absolute top-4 sm:top-6 right-4 sm:right-6 text-zinc-800 group-hover:text-neon-cyan/10 transition-colors">
                      <Quote size={32} className="sm:w-10 sm:h-10" />
                    </div>

                    <div className="relative z-10">
                      {/* Rating */}
                      <div className="flex gap-1 mb-4 sm:mb-6">
                        {[...Array(review.rating)].map((_, j) => (
                          <Star key={j} size={12} className="text-neon-cyan sm:w-3.5 sm:h-3.5" fill="currentColor" />
                        ))}
                      </div>

                      <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed mb-6 sm:mb-8 italic line-clamp-4">
                        "{review.comment}"
                      </p>
                    </div>

                    <div className="relative z-10 pt-4 sm:pt-6 border-t border-zinc-800 flex items-center gap-3 sm:gap-4">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-zinc-700 to-black border border-zinc-600 flex items-center justify-center font-bold text-white uppercase text-[10px] sm:text-xs shrink-0">
                        {review.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <h4 className="text-white font-bold text-xs sm:text-sm tracking-tight truncate">{review.name}</h4>
                          <CheckCircle2 size={10} className="text-neon-cyan shrink-0 sm:w-3 sm:h-3" />
                        </div>
                        <p className="text-zinc-500 text-[9px] sm:text-[10px] uppercase tracking-widest truncate">{review.role}</p>
                      </div>
                    </div>

                    {/* Service Tag */}
                    <div className="absolute bottom-6 sm:bottom-8 right-6 sm:right-8 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[9px] sm:text-[10px] font-mono text-neon-cyan bg-neon-cyan/10 px-2 py-1 rounded border border-neon-cyan/20 uppercase">
                        {review.service}
                      </span>
                    </div>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Dot Indicators */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8 sm:mt-10">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i, i > currentIndex ? 1 : -1)}
                  aria-label={`Go to page ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${i === currentIndex
                    ? 'w-8 bg-neon-cyan'
                    : 'w-3 bg-zinc-700 hover:bg-zinc-500'
                    }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}