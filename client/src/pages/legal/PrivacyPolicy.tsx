import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Lock, FileText, Mail, Phone, MapPin, ArrowLeft } from 'lucide-react';
import { ROUTES } from '@/config/routes';
import { useSiteContext } from '@/context/SiteContext';
import { appConfig } from '@/config/appConfig';

export default function PrivacyPolicy() {
  const { flattenedSettings } = useSiteContext();
  const companyName = flattenedSettings.company_name || appConfig.appName;
  const companyEmail = flattenedSettings.company_email || 'support@thetekdoctor.com';
  const companyPhone = flattenedSettings.company_phone || '+91 98765 43210';
  const companyAddress = flattenedSettings.company_address || 'India';

  return (
    <main className="min-h-screen bg-black text-white selection:bg-neon-cyan/30 overflow-hidden">
      {/* Background glow */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(0,240,255,0.05)_0%,transparent_50%)] pointer-events-none" />

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
            <Lock size={12} />
            Data Protection & Privacy
          </div>
          <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-white mb-3 font-outfit">
            Privacy <span className="text-neon-cyan">Policy</span>
          </h1>
          <p className="text-xs font-mono text-zinc-500">
            Last Updated: November 2026 &bull; Effective for all {companyName} websites, portals, and repair services.
          </p>
        </div>

        {/* Content Body */}
        <div className="space-y-10 text-sm font-mono text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2 font-outfit">
              <span className="text-neon-cyan">01.</span> Introduction
            </h2>
            <p>
              {companyName} ("we", "our", or "us") operates the device repair, IT maintenance, and corporate asset management platform accessible at thetekdoctor.com. We are committed to protecting your privacy and treating all personal, corporate, and hardware diagnostic data with strict confidentiality and OWASP-grade security practices.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2 font-outfit">
              <span className="text-neon-cyan">02.</span> Information We Collect
            </h2>
            <p className="mb-3">To deliver accurate diagnostics, repair tracking, and maintenance contracts, we collect:</p>
            <ul className="list-disc pl-6 space-y-2 text-xs text-zinc-400">
              <li><strong className="text-zinc-200">Personal & Contact Details:</strong> Name, email address, phone number, billing address, and corporate branch affiliations.</li>
              <li><strong className="text-zinc-200">Device Diagnostic Data:</strong> Hardware brand, model number, serial number, device configuration, physical condition images, error screenshots, and problem descriptions.</li>
              <li><strong className="text-zinc-200">Financial & Transaction Information:</strong> Repair estimate approvals, invoice records, and payment reference numbers. Online transactions are tokenized via Razorpay; raw payment card numbers or banking passwords are never stored on our servers.</li>
              <li><strong className="text-zinc-200">Technical Telemetry & PWA Data:</strong> IP addresses, browser types, session authorization tokens, and Web Push notification subscription endpoints for live lockscreen repair alerts.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2 font-outfit">
              <span className="text-neon-cyan">03.</span> How We Use Your Information
            </h2>
            <p className="mb-3">Collected information is strictly utilized to:</p>
            <ul className="list-disc pl-6 space-y-2 text-xs text-zinc-400">
              <li>Process, assign, and execute device repair tickets and Annual Maintenance Contracts (AMC).</li>
              <li>Send critical transactional notifications, including diagnosis completions, estimate approval requests, and payment settlement receipts.</li>
              <li>Generate tamper-evident, cryptographically signed AMC certificates and official PDF tax invoices.</li>
              <li>Detect and prevent fraudulent repair requests, unauthorized device claims, or abuse of warranty policies.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2 font-outfit">
              <span className="text-neon-cyan">04.</span> Data Security & Storage Controls
            </h2>
            <p>
              We enforce multi-tiered defense-in-depth controls across our infrastructure:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-xs text-zinc-400 mt-3">
              <li>All API communication is encrypted in transit using Transport Layer Security (TLS 1.3 / HTTPS).</li>
              <li>Sensitive configuration parameters and credentials at rest are encrypted with AES-256-GCM.</li>
              <li>Strict Role-Based Access Control (RBAC) isolates customer data so technicians can only view tickets explicitly assigned to them.</li>
              <li>Public repair tracking requires verification of the last 4 digits of the registered mobile number or a signed JWT action token to prevent IDOR access to device photos and diagnosis notes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2 font-outfit">
              <span className="text-neon-cyan">05.</span> Third-Party Service Providers
            </h2>
            <p>
              We collaborate with trusted third-party providers solely for operational execution:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-xs text-zinc-400 mt-3">
              <li><strong className="text-zinc-200">Payment Gateway:</strong> Razorpay Software Private Limited for secure payment checkout and webhook verification.</li>
              <li><strong className="text-zinc-200">Authentication:</strong> Google OAuth 2.0 for single sign-on authentication.</li>
              <li><strong className="text-zinc-200">Bot Protection:</strong> Google reCAPTCHA v3 to safeguard public contact and repair submission forms against automated abuse.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2 font-outfit">
              <span className="text-neon-cyan">06.</span> Your Data Rights & Retention
            </h2>
            <p>
              You maintain the right to inspect your service history, request updates to your customer profile, or request deletion of non-accounting service records upon completion of warranties. Accounting and tax invoice records are retained in compliance with applicable statutory regulations.
            </p>
          </section>

          <section className="p-6 rounded-2xl bg-zinc-950 border border-zinc-800">
            <h2 className="text-base font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2 font-outfit">
              <Mail size={18} className="text-neon-cyan" />
              Contact Our Data Privacy Officer
            </h2>
            <div className="space-y-2 text-xs text-zinc-400">
              <p><strong className="text-zinc-200">Entity:</strong> {companyName}</p>
              <p><strong className="text-zinc-200">Email:</strong> <a href={`mailto:${companyEmail}`} className="text-neon-cyan hover:underline">{companyEmail}</a></p>
              <p><strong className="text-zinc-200">Phone:</strong> {companyPhone}</p>
              <p><strong className="text-zinc-200">Address:</strong> {companyAddress}</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
