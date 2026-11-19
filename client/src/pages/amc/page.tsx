import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  Wrench,
  Laptop,
  Building2,
  Award,
  ArrowRight,
  FileCheck2,
  Zap,
  HelpCircle,
  PhoneCall
} from 'lucide-react';
import { ROUTES } from '@/config/routes';
import { useSiteContext } from '@/context/SiteContext';
import { appConfig } from '@/config/appConfig';

export default function AmcPage() {
  const { flattenedSettings } = useSiteContext();
  const appName = flattenedSettings.company_name || appConfig.appName;

  const highlights = [
    {
      icon: Clock,
      title: '4-Hour Emergency SLA',
      description: 'Guaranteed rapid on-site and remote diagnostic response times across registered branches.'
    },
    {
      icon: Wrench,
      title: '100% Genuine OEM Parts',
      description: 'Strict supply chain compliance with certified manufacturer grade components and IC-level micro-soldering.'
    },
    {
      icon: ShieldCheck,
      title: 'Scheduled Preventative Audits',
      description: 'Quarterly and bi-annual thermal re-pasting, fan cleaning, storage health checks, and OS optimization.'
    },
    {
      icon: Zap,
      title: 'Zero Labor Charges',
      description: 'All routine servicing, diagnostic teardowns, and repairs covered under contract without hidden labor fees.'
    },
    {
      icon: Laptop,
      title: 'Loaner Device Fleet Support',
      description: 'Temporary high-performance workstations supplied during motherboard chip-level overhauls to ensure zero downtime.'
    },
    {
      icon: FileCheck2,
      title: 'Cryptographic Certificates',
      description: 'Every covered asset and maintenance plan is backed by a verifiable, tamper-evident digital certificate.'
    }
  ];

  const plans = [
    {
      badge: 'Individual & Home',
      title: 'Home Care Plan',
      description: 'Designed for individual creators, remote executives, and families needing uninterrupted uptime.',
      features: [
        'Coverage for up to 3 personal devices (Laptops, Desktops, Tablets)',
        'Priority queue placement in our diagnostic workshop',
        '2 Preventative Maintenance & Thermal deep-cleans per year',
        '15% Flat Discount on all replacement hardware components',
        'Direct phone & WhatsApp technician support line',
        'Tamper-evident digital warranty & maintenance certificate'
      ],
      popular: false,
      ctaText: 'Inquire For Home Plan',
      ctaLink: ROUTES.CONTACT
    },
    {
      badge: 'Startups & Studios',
      title: 'Office Pro Plan',
      description: 'Comprehensive IT hardware maintenance for growing studios, legal offices, medical clinics, and tech teams.',
      features: [
        'Coverage for 5 to 25 workstation units & laptops',
        '4-Hour on-site emergency dispatch within metropolitan limits',
        'Quarterly preventative maintenance visits & hardware audits',
        'Unlimited remote IT troubleshooting & OS driver fixes',
        'Zero labor charges on all approved component replacements',
        'Dedicated Technical Account Manager & employee device onboarding'
      ],
      popular: true,
      ctaText: 'Protect Your Office',
      ctaLink: ROUTES.CONTACT
    },
    {
      badge: 'Enterprise Fleets',
      title: 'Enterprise Fleet Contract',
      description: 'Multi-branch hardware maintenance SLA tailored for corporate organizations, BPOs, and educational labs.',
      features: [
        'Unlimited workstation & corporate fleet coverage',
        'Sub-2-hour SLA response with dedicated on-call engineers',
        'Pre-provisioned standby loaner laptops during repairs',
        'Corporate Portal access with bulk CSV device & repair management',
        'Custom billing cycles (Quarterly, Semi-annual, or Annual invoices)',
        'Full compliance reporting & certified disposal certificates'
      ],
      popular: false,
      ctaText: 'Schedule Corporate Briefing',
      ctaLink: ROUTES.CONTACT
    }
  ];

  const faqs = [
    {
      q: 'What types of devices can be enrolled in an AMC plan?',
      a: 'We cover enterprise and consumer laptops (Apple MacBooks, ThinkPads, Dell, HP, ASUS), custom desktop workstations, all-in-one PCs, monitors, and select network hardware.'
    },
    {
      q: 'How do you verify whether a replacement part is authentic?',
      a: 'Every component installed by our lab comes directly from authorized distributor channels and carries our standard warranty plus verifiable batch serial tracing.'
    },
    {
      q: 'How does AMC Certificate Verification work?',
      a: 'Each contract and covered device is issued an immutable certificate code. Anyone can enter the certificate code at our public verification terminal to inspect active dates, device serials, and SLA coverage tier.'
    },
    {
      q: 'Can existing damaged devices be enrolled in an AMC contract?',
      a: 'Devices must undergo an initial diagnostic intake inspection. Existing pre-damage can be repaired at special subsidized AMC onboarding rates before entering the active contract period.'
    }
  ];

  return (
    <main className="min-h-screen bg-black text-white selection:bg-neon-cyan/30 overflow-hidden">
      {/* Background glow effects */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,240,255,0.06)_0%,transparent_50%)] pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(0,255,170,0.04)_0%,transparent_50%)] pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-6 py-16 sm:py-24">
        {/* Header Hero */}
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-24">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-xs font-mono uppercase tracking-widest mb-6"
          >
            <ShieldCheck size={14} />
            Hardware Assurance & SLA Contracts
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight text-white mb-6 font-outfit"
          >
            Annual Maintenance <span className="text-neon-cyan">Contracts</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-sm sm:text-base text-zinc-400 leading-relaxed font-mono"
          >
            Ensure 99.9% hardware availability with proactive thermal maintenance, zero-labor repairs,
            and guaranteed SLA turnaround from certified chip-level diagnostic technicians.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-4 mt-8"
          >
            <Link
              to={ROUTES.CONTACT}
              className="px-6 py-3.5 bg-neon-cyan hover:bg-white text-black font-black uppercase text-xs tracking-widest rounded-xl transition-all shadow-lg shadow-neon-cyan/20 flex items-center gap-2 cursor-pointer"
            >
              <PhoneCall size={14} />
              Inquire For AMC
            </Link>
            <Link
              to={ROUTES.VERIFY_CERTIFICATE.replace('/:code', '')}
              className="px-6 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-neon-cyan border border-neon-cyan/30 hover:border-neon-cyan font-mono text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 cursor-pointer"
            >
              <FileCheck2 size={14} />
              Verify AMC Certificate
            </Link>
          </motion.div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="mb-20 sm:mb-28">
          <div className="text-center mb-12">
            <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-neon-cyan mb-2">Enterprise Hardware SLA</h2>
            <p className="text-xl sm:text-2xl font-bold text-white uppercase tracking-wider">Why Choose {appName} AMC?</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {highlights.map((h, i) => (
              <motion.div
                key={h.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                className="p-6 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 hover:border-neon-cyan/40 transition-all group backdrop-blur-sm"
              >
                <div className="w-12 h-12 rounded-xl bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center text-neon-cyan mb-4 group-hover:scale-105 transition-transform">
                  <h.icon size={22} />
                </div>
                <h3 className="text-base font-bold text-white mb-2 tracking-wide font-outfit">{h.title}</h3>
                <p className="text-xs text-zinc-400 font-mono leading-relaxed">{h.description}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Plan Cards */}
        <div className="mb-20 sm:mb-28">
          <div className="text-center mb-12">
            <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-neon-cyan mb-2">Coverage Tiers</h2>
            <p className="text-xl sm:text-2xl font-bold text-white uppercase tracking-wider">Flexible Plans Tailored For Every Scale</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {plans.map((p, i) => (
              <div
                key={p.title}
                className={`relative rounded-2xl p-6 sm:p-8 flex flex-col justify-between transition-all ${
                  p.popular
                    ? 'bg-zinc-900/90 border-2 border-neon-cyan shadow-xl shadow-neon-cyan/10'
                    : 'bg-zinc-950/80 border border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                {p.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-neon-cyan text-black font-black text-[10px] uppercase tracking-widest shadow-md">
                    Most Popular Choice
                  </div>
                )}

                <div>
                  <span className="text-[10px] font-mono uppercase px-2.5 py-1 rounded-md bg-zinc-800/80 text-neon-cyan border border-neon-cyan/20 inline-block mb-3">
                    {p.badge}
                  </span>
                  <h3 className="text-xl font-bold text-white uppercase tracking-wider mb-2 font-outfit">{p.title}</h3>
                  <p className="text-xs text-zinc-400 font-mono mb-6 leading-relaxed">{p.description}</p>

                  <div className="space-y-3 mb-8">
                    {p.features.map((feat) => (
                      <div key={feat} className="flex items-start gap-2.5 text-xs text-zinc-300 font-mono">
                        <CheckCircle2 size={14} className="text-neon-cyan shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Link
                  to={p.ctaLink}
                  className={`w-full py-3.5 rounded-xl font-mono text-xs uppercase tracking-widest font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    p.popular
                      ? 'bg-neon-cyan text-black hover:bg-white shadow-lg shadow-neon-cyan/20'
                      : 'bg-zinc-900 hover:bg-zinc-800 text-neon-cyan border border-neon-cyan/30 hover:border-neon-cyan'
                  }`}
                >
                  <span>{p.ctaText}</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Certificate Verification Callout Banner */}
        <div className="mb-20 sm:mb-28 rounded-2xl bg-gradient-to-r from-neon-cyan/10 via-zinc-900 to-black border border-neon-cyan/30 p-8 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-neon-cyan text-xs font-mono uppercase tracking-widest mb-2">
              <Award size={16} />
              Cryptographic Integrity Verification
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white uppercase tracking-tight mb-2 font-outfit">
              Already have an AMC Certificate?
            </h3>
            <p className="text-xs text-zinc-400 font-mono leading-relaxed">
              Verify your certificate's authenticity, active validity window, registered hardware serial numbers, and emergency SLA coverage tier online.
            </p>
          </div>
          <Link
            to={ROUTES.VERIFY_CERTIFICATE.replace('/:code', '')}
            className="shrink-0 px-6 py-3.5 bg-neon-cyan hover:bg-white text-black font-black uppercase text-xs tracking-widest rounded-xl transition-all shadow-lg shadow-neon-cyan/20 flex items-center gap-2 cursor-pointer"
          >
            <FileCheck2 size={15} />
            Verify Certificate Now
          </Link>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mb-20">
          <div className="text-center mb-10">
            <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-neon-cyan mb-2">Got Questions?</h2>
            <p className="text-xl sm:text-2xl font-bold text-white uppercase tracking-wider">Frequently Asked Questions</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq) => (
              <div key={faq.q} className="p-6 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <HelpCircle size={15} className="text-neon-cyan shrink-0" />
                  {faq.q}
                </h4>
                <p className="text-xs text-zinc-400 font-mono pl-6 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center py-10 border-t border-zinc-800/80">
          <h3 className="text-2xl font-bold text-white uppercase tracking-wider mb-3 font-outfit">
            Have a Specific Device or Fleet Requirement?
          </h3>
          <p className="text-xs text-zinc-400 font-mono max-w-lg mx-auto mb-6">
            Speak directly with our technical hardware consultants for a customized contract evaluation.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              to={ROUTES.CONTACT}
              className="px-6 py-3.5 bg-neon-cyan hover:bg-white text-black font-black uppercase text-xs tracking-widest rounded-xl transition-all cursor-pointer shadow-lg shadow-neon-cyan/10"
            >
              Contact Our AMC Team
            </Link>
            <Link
              to={ROUTES.REPAIR}
              className="px-6 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 font-mono text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Book Single Device Repair
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
