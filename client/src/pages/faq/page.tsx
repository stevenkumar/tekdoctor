'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export default function FAQPage() {
    const [expanded, setExpanded] = useState<number | null>(0);

    const faqs = [
        {
            question: 'How long does a typical repair take?',
            answer: 'Most repairs are completed within 24-48 hours. Complex diagnostics and component-level repairs may take 3-5 business days. We always provide you with an estimated timeline after the initial assessment.'
        },
        {
            question: 'Do you offer a warranty on repairs?',
            answer: 'Yes! All our repairs come with a comprehensive 90-day warranty. If the same issue reoccurs within 90 days, we\'ll fix it for free. We stand behind our work 100%.'
        },
        {
            question: 'What payment methods do you accept?',
            answer: 'We accept all major credit cards (Visa, Mastercard, American Express), cash, bank transfers, and digital payment platforms. We also offer flexible payment plans for major repairs.'
        },
        {
            question: 'Can you recover data from my broken device?',
            answer: 'Absolutely! Our data recovery specialists can extract data from damaged hard drives, SSDs, and other storage devices using advanced equipment and techniques. Success rates vary based on damage severity.'
        },
        {
            question: 'Do you service all brands?',
            answer: 'We service most major brands including Dell, HP, Lenovo, Apple, ASUS, and many others. Whether it\'s desktops, laptops, tablets, or peripherals, we have the expertise to help. Contact us for brand-specific questions.'
        },
        {
            question: 'Is my data safe with you?',
            answer: 'Data security is our top priority. All devices are handled in our secure facility with restricted access. We never access your personal data unless necessary for repairs, and we sign comprehensive NDAs for sensitive devices.'
        }
    ];

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05,
                delayChildren: 0.1,
            },
        },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 10 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.4 },
        },
    };

    return (
        <main className="min-h-screen bg-black text-white selection:bg-neon-cyan/30 overflow-hidden relative py-24">
            {/* Subtle Background Elements */}
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_30%,#002a2d_0%,transparent_40%)] pointer-events-none" />

            <div className="container mx-auto px-6 relative z-10 max-w-5xl">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-20"
                >
                    <h2 className="text-xs font-bold text-neon-cyan uppercase tracking-[0.4em] mb-4">Questions?</h2>
                    <h1 className="text-4xl md:text-5xl font-black text-white uppercase italic">Frequently Asked Questions</h1>
                    <p className="text-zinc-400 text-lg mt-4 max-w-2xl mx-auto font-light">
                        Everything you need to know about our services and repair process
                    </p>
                </motion.div>

                {/* FAQ Items */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="max-w-3xl mx-auto space-y-4"
                >
                    {faqs.map((faq, index) => (
                        <motion.div
                            key={index}
                            variants={itemVariants}
                            className="group"
                        >
                            <button
                                onClick={() => setExpanded(expanded === index ? null : index)}
                                className="w-full p-6 text-left border border-zinc-800 rounded-lg bg-zinc-900/30 hover:border-neon-cyan/50 hover:bg-zinc-900/60 transition-all duration-300 flex items-center justify-between group"
                            >
                                <span className="text-lg font-bold text-white group-hover:text-neon-cyan transition-colors">
                                    {faq.question}
                                </span>
                                <motion.div
                                    animate={{ rotate: expanded === index ? 180 : 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="flex-shrink-0 ml-4"
                                >
                                    <ChevronDown className="w-6 h-6 text-neon-cyan" />
                                </motion.div>
                            </button>

                            <AnimatePresence>
                                {expanded === index && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="p-6 bg-zinc-900/20 border border-t-0 border-zinc-800 rounded-b-lg text-zinc-300 leading-relaxed font-light">
                                            {faq.answer}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ))}
                </motion.div>

                {/* Additional Help CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                    className="mt-16 text-center"
                >
                    <p className="text-zinc-400 mb-6">Didn't find what you're looking for?</p>
                    <a href="/contact" className="btn-neon text-sm py-4 px-10 cursor-pointer inline-block">
                        Get In Touch With Us
                    </a>
                </motion.div>
            </div>
        </main>
    );
}
