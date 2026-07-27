'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Search,
  Microscope,
  Calculator,
  Wrench,
  ShieldCheck,
  Bell,
  Truck,
  LifeBuoy,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';

const steps = [
  {
    icon: FileText,
    title: 'Service Request Submission',
    description: 'Customers begin by submitting a repair request through our online form. Basic details such as contact information, device type, brand, model number, and a description of the issue help our technicians understand the problem before inspection.',
  },
  {
    icon: Search,
    title: 'Initial Assessment',
    description: 'Once the request is received, our support team reviews the information and contacts the customer if additional details are required. The device is then scheduled for inspection, either through a service center visit, pickup service, or on-site technician visit where applicable.',
  },
  {
    icon: Microscope,
    title: 'Device Inspection & Diagnosis',
    description: 'Our technicians perform a thorough diagnostic assessment to identify the root cause of the problem. Hardware, software, connectivity, power, performance, and component-related issues are carefully examined.',
  },
  {
    icon: Calculator,
    title: 'Repair Estimate & Approval',
    description: 'After diagnosis, a repair estimate is prepared. This includes the identified issue, recommended solution, estimated repair cost, required replacement parts (if any), and expected completion time. Repair work begins only after customer approval.',
  },
  {
    icon: Wrench,
    title: 'Professional Repair Process',
    description: 'Certified technicians use industry-standard tools and procedures to repair the device. Genuine or high-quality compatible replacement parts are used whenever required. All repairs are performed according to manufacturer-recommended practices whenever possible.',
  },
  {
    icon: ShieldCheck,
    title: 'Quality Testing',
    description: 'Before delivery, every repaired device undergoes comprehensive testing to verify functionality, performance, and safety. Multiple quality checks ensure that the reported issue has been resolved successfully.',
  },
  {
    icon: Bell,
    title: 'Customer Notification',
    description: 'Once the repair is completed and verified, the customer is notified through their preferred communication method, such as phone call, email, or WhatsApp.',
  },
  {
    icon: Truck,
    title: 'Device Delivery or Collection',
    description: 'Customers can collect their repaired device from the service location or receive it through the agreed delivery method. The device is returned in working condition along with repair details.',
  },
  {
    icon: LifeBuoy,
    title: 'Post-Repair Support',
    description: 'Our commitment does not end after the repair. Customers can contact our support team for assistance, service-related questions, or warranty-related inquiries according to the applicable service terms.',
  },
];

const standards = [
  'Transparent repair process',
  'Professional diagnostics',
  'Experienced technicians',
  'Quality replacement parts',
  'Timely service updates',
  'Thorough quality testing',
  'Customer-focused support'
];

export default function RepairProtocolPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans selection:bg-neon-cyan/30 pb-20">

      {/* Hero Section */}
      <section className="relative pt-25 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full" style={{ background: 'radial-gradient(circle at top, rgba(var(--neon-cyan-rgb), 0.05) 0%, transparent 50%)' }} />
        </div>

        <div className="max-w-5xl mx-auto relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-3 px-4 py-2 bg-neon-cyan/10 border border-neon-cyan/20 rounded-full mb-8"
          >
            <ShieldCheck size={16} className="text-neon-cyan" />
            <span className="text-[10px] font-bold text-neon-cyan uppercase tracking-widest">Standard Operating Procedure</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter mb-6"
          >
            Repair <span className="text-neon-cyan">Protocol</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-zinc-400 max-w-3xl mx-auto leading-relaxed font-light"
          >
            Our repair process is designed to be transparent, efficient, and customer-focused. Whether you need assistance with a smartphone, laptop, desktop computer, television, printer, home appliance, or any other electronic device, we follow a structured repair protocol to ensure the highest quality service.
          </motion.p>
        </div>
      </section>

      {/* Protocol Steps */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="space-y-6">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-zinc-900/30 border border-zinc-800/60 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start group hover:border-neon-cyan/30 transition-colors"
              >
                <div className="w-16 h-16 shrink-0 bg-neon-cyan/5 border border-neon-cyan/20 rounded-2xl flex items-center justify-center text-neon-cyan group-hover:bg-neon-cyan/10 transition-colors">
                  <Icon size={28} strokeWidth={1.5} />
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[10px] font-mono text-neon-cyan uppercase tracking-widest">Step 0{index + 1}</span>
                    <h3 className="text-xl font-bold text-white">{step.title}</h3>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Service Standards */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="bg-gradient-to-br from-zinc-900/80 to-zinc-950 border border-zinc-800 rounded-[3rem] p-8 md:p-16 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
            <ShieldCheck size={300} />
          </div>

          <div className="relative z-10">
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Our Service Standards</h2>
            <p className="text-zinc-400 mb-10 max-w-2xl leading-relaxed">
              We strive to provide reliable, affordable, and efficient repair solutions that help extend the life of your electronic devices while ensuring complete customer satisfaction.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mb-12">
              {standards.map((std, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CheckCircle2 size={18} className="text-neon-cyan shrink-0" />
                  <span className="text-sm font-semibold text-zinc-300">{std}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="pt-8 border-t border-zinc-800/80">
              <Link
                to="/repair"
                className="inline-flex items-center gap-3 px-8 py-4 bg-neon-cyan text-black font-black uppercase text-xs tracking-widest rounded-xl hover:bg-neon-cyan/90 transition-all"
              >
                Proceed to Booking
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}



