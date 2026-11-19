import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, CheckCircle, ShieldAlert, Wrench, Mail, ArrowLeft } from 'lucide-react';
import { ROUTES } from '@/config/routes';
import { useSiteContext } from '@/context/SiteContext';
import { appConfig } from '@/config/appConfig';

export default function TermsOfService() {
  const { flattenedSettings } = useSiteContext();
  const companyName = flattenedSettings.company_name || appConfig.appName;
  const companyEmail = flattenedSettings.company_email || 'support@thetekdoctor.com';
  const companyPhone = flattenedSettings.company_phone || '+91 98765 43210';
  const companyAddress = flattenedSettings.company_address || 'India';

  return (
    <main className="min-h-screen bg-black text-white selection:bg-neon-cyan/30 overflow-hidden">
      {/* Background glow */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(0,240,255,0.05)_0%,transparent_50%)] pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-6 py-16 sm:py-20">
        <Link
          to={ROUTES.HOME}
          className="inline-flex items-center gap-2 text-xs font-mono text-zinc-400 hover:text-neon-cyan transition-colors mb-8 cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back to Home
        </Link>

        {/* Title */}
        <div className="border-b border-zinc-800 pb-8 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-xs font-mono uppercase tracking-widest mb-4">
            <FileText size={12} />
            Service Terms & Conditions
          </div>
          <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-white mb-3 font-outfit">
            Terms of <span className="text-neon-cyan">Service</span>
          </h1>
          <p className="text-xs font-mono text-zinc-500">
            Last Updated: November 2026 &bull; Legally binding terms for all repair bookings, diagnostics, and AMC agreements.
          </p>
        </div>

        {/* Content Body */}
        <div className="space-y-10 text-sm font-mono text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2 font-outfit">
              <span className="text-neon-cyan">01.</span> Agreement to Terms
            </h2>
            <p>
              By booking a repair request, subscribing to an Annual Maintenance Contract (AMC), or using the services of {companyName} ("we", "us", or "our"), you agree to be bound by these Terms of Service. If you are entering into this agreement on behalf of a corporate entity, you represent that you possess the requisite authority to bind that entity.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2 font-outfit">
              <span className="text-neon-cyan">02.</span> Diagnostics, Estimates & Approvals
            </h2>
            <p className="mb-3">
              Our technicians perform thorough intake evaluations to diagnose reported issues:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-xs text-zinc-400">
              <li><strong className="text-zinc-200">No Unauthorized Work:</strong> No paid repair work or component replacements are executed until you explicitly review and approve the written diagnostic estimate via our customer portal or email action link.</li>
              <li><strong className="text-zinc-200">Revision & Decline Rights:</strong> You reserve the right to decline an estimate or request revisions (such as prioritizing specific components). If an estimate is declined, you may collect your hardware subject only to any agreed nominal evaluation fee.</li>
              <li><strong className="text-zinc-200">Hidden Internal Damage:</strong> On devices experiencing severe impact or liquid damage, full internal defects (e.g. corroded PCB traces) may only become apparent during teardown. Any secondary issues discovered will be submitted as an updated estimate for re-approval.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2 font-outfit">
              <span className="text-neon-cyan">03.</span> Repair Warranty & Replacement Parts
            </h2>
            <p className="mb-3">
              We stand firmly behind the quality of our engineering and parts:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-xs text-zinc-400">
              <li><strong className="text-zinc-200">90-Day Standard Warranty:</strong> Replaced hardware components and labor are covered under a 90-day warranty starting from the date of delivery.</li>
              <li><strong className="text-zinc-200">Warranty Exclusions:</strong> Warranty is immediately voided if the repaired device exhibits post-service physical impact, screen cracks, liquid ingress, unauthorized third-party teardown, or broken warranty seals.</li>
              <li><strong className="text-zinc-200">Software & OS Exclusions:</strong> Malfunctions resulting from subsequent malware infections, operating system updates, or third-party modifications are not covered under hardware repair warranty.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2 font-outfit">
              <span className="text-neon-cyan">04.</span> Customer Responsibilities & Data Backup Disclaimer
            </h2>
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs mb-3 flex items-start gap-3">
              <ShieldAlert size={18} className="shrink-0 mt-0.5" />
              <span>
                <strong>Crucial Reminder:</strong> Always back up your critical data prior to handing over any computer, mobile device, or storage drive for repair service.
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              While our technicians take utmost care to preserve stored data during hardware repairs, repairs involving motherboard short circuits, corrupted NAND/SSD flash memory, or BIOS chip reprogramming carry inherent risks of data corruption. {companyName} is not liable for claims arising from pre-existing or incidental data loss.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2 font-outfit">
              <span className="text-neon-cyan">05.</span> Payment Settlement & Abandoned Devices
            </h2>
            <ul className="list-disc pl-6 space-y-2 text-xs text-zinc-400">
              <li><strong className="text-zinc-200">Payment Due:</strong> Total repair charges become payable upon completion of service and prior to device handover or dispatch.</li>
              <li><strong className="text-zinc-200">Supported Methods:</strong> Payments may be completed online via Razorpay (UPI, Credit/Debit cards, Net Banking) or via verified offline methods as authorized by admin.</li>
              <li><strong className="text-zinc-200">Uncollected Hardware (60-Day Policy):</strong> Devices left uncollected or unpaid for more than 60 days following written completion notifications may incur recurring storage fees and may ultimately be recycled or disposed of to recover service costs in accordance with applicable laws.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2 font-outfit">
              <span className="text-neon-cyan">06.</span> Annual Maintenance Contracts (AMC)
            </h2>
            <p>
              Assets enrolled under AMC agreements are governed by the specific SLA tier (Home Care, Office Pro, Enterprise Fleet) selected upon contract execution. All issued AMC digital certificates carry verifiable cryptographic signatures and apply solely to the specific serial-numbered hardware registered on file.
            </p>
          </section>

          <section className="p-6 rounded-2xl bg-zinc-950 border border-zinc-800">
            <h2 className="text-base font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2 font-outfit">
              <Mail size={18} className="text-neon-cyan" />
              Inquiries Regarding Terms
            </h2>
            <div className="space-y-2 text-xs text-zinc-400">
              <p><strong className="text-zinc-200">Support Desk:</strong> {companyName}</p>
              <p><strong className="text-zinc-200">Email:</strong> <a href={`mailto:${companyEmail}`} className="text-neon-cyan hover:underline">{companyEmail}</a></p>
              <p><strong className="text-zinc-200">Phone:</strong> {companyPhone}</p>
              <p><strong className="text-zinc-200">Office:</strong> {companyAddress}</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
