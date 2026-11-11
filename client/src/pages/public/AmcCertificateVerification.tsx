/**
 * TekDoctor — Public AMC Certificate Verification Page
 * Genuinely public, unauthenticated compliance verification portal.
 * Real-time cryptographic validation of AMC contracts.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Clock, 
  Ban, 
  Calendar, 
  Building2, 
  FileText, 
  CheckCircle2, 
  Loader2, 
  AlertCircle,
  ArrowLeft,
  ExternalLink
} from 'lucide-react';
import { amcApi } from '@/services/api';
import { ROUTES } from '@/config/routes';

interface VerificationResult {
  valid: boolean;
  version?: string;
  certificateNumber?: string;
  contractNumber?: string;
  companyName?: string;
  planName?: string;
  status?: string;
  complianceStatus?: string;
  startDate?: string;
  endDate?: string;
  verifiedAt?: string;
  reason?: string;
}

const formatDate = (dateStr?: string | null): string => {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
};

const formatTimestamp = (ts?: string | null): string => {
  if (!ts) return 'N/A';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });
};

export default function AmcCertificateVerification() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const contractNumber = searchParams.get('contractNumber') || undefined;

  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchVerification = async () => {
    if (!code) {
      setError('Verification code is missing from the request.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await amcApi.verifyPublicCertificate(code, contractNumber);
      if (res.ok && res.data?.data) {
        setResult(res.data.data);
      } else {
        setResult(res.data?.data || { valid: false, reason: res.data?.message || res.error || 'Verification failed.' });
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to connect to verification services. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVerification();
  }, [code, contractNumber]);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 py-16 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Decorative Accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-cyan-500/10 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute top-1/4 right-0 w-[400px] h-[400px] bg-sky-500/5 blur-3xl pointer-events-none" />

      <div className="max-w-2xl mx-auto relative z-10">
        
        {/* Top Header & Branding */}
        <div className="text-center mb-8">
          <Link 
            to={ROUTES.HOME}
            className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors mb-6 group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            Back to TekDoctor
          </Link>

          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="text-2xl font-black tracking-tight text-white">
              TEK<span className="text-cyan-400">DOCTOR</span>
            </span>
            <span className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded">
              VERIFICATION
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            AMC Compliance Registry
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-md mx-auto">
            Authoritative, real-time cryptographic authentication of Annual Maintenance Contracts.
          </p>
        </div>

        {/* Verification Card */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">

          {/* Loading State */}
          {loading && (
            <div className="py-16 text-center">
              <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mx-auto mb-4" />
              <h3 className="text-sm font-semibold text-zinc-200">Authenticating Certificate</h3>
              <p className="text-xs text-zinc-400 mt-1">Checking signature against TekDoctor cryptographic engine...</p>
            </div>
          )}

          {/* Unexpected Network / Server Error */}
          {!loading && error && (
            <div className="py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-red-950/50 border border-red-500/30 flex items-center justify-center mx-auto mb-4 text-red-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-red-300">Connection Error</h3>
              <p className="text-xs text-zinc-400 mt-2 max-w-sm mx-auto">{error}</p>
              <button
                onClick={fetchVerification}
                className="mt-6 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold rounded-lg text-white transition-colors"
              >
                Retry Verification
              </button>
            </div>
          )}

          {/* Verification Results Display */}
          {!loading && !error && result && (
            <div>
              {/* Authenticated & Compliant Status */}
              {result.valid && result.complianceStatus === 'ACTIVE_COMPLIANT' && (
                <div className="mb-6 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-wide">
                        Active & Compliant
                      </h3>
                      <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                        VERIFIED
                      </span>
                    </div>
                    <p className="text-xs text-emerald-200/80 mt-1 leading-relaxed">
                      This Annual Maintenance Contract is authentic, cryptographically authenticated, and currently in active coverage.
                    </p>
                  </div>
                </div>
              )}

              {/* Authentic but Expired */}
              {result.valid && result.complianceStatus === 'EXPIRED' && (
                <div className="mb-6 p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wide">
                        Coverage Expired
                      </h3>
                      <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                        HISTORIC
                      </span>
                    </div>
                    <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
                      This certificate was genuinely issued by TekDoctor, but the contractual coverage period has expired. Active maintenance coverage is no longer in effect.
                    </p>
                  </div>
                </div>
              )}

              {/* Authentic but Cancelled */}
              {result.valid && result.complianceStatus === 'CANCELLED' && (
                <div className="mb-6 p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
                    <Ban className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-rose-300 uppercase tracking-wide">
                        Contract Cancelled
                      </h3>
                      <span className="bg-rose-500/20 text-rose-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-500/30">
                        CANCELLED
                      </span>
                    </div>
                    <p className="text-xs text-rose-200/80 mt-1 leading-relaxed">
                      This certificate was authentically generated, but the contract was formally cancelled. Hardware maintenance coverage has been terminated.
                    </p>
                  </div>
                </div>
              )}

              {/* Authentic but Other Non-Active Status */}
              {result.valid && !['ACTIVE_COMPLIANT', 'EXPIRED', 'CANCELLED'].includes(result.complianceStatus || '') && (
                <div className="mb-6 p-4 rounded-xl bg-sky-950/40 border border-sky-500/30 flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400 shrink-0">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-sky-300 uppercase tracking-wide">
                        Status: {result.complianceStatus || result.status?.toUpperCase()}
                      </h3>
                      <span className="bg-sky-500/20 text-sky-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-sky-500/30">
                        AUTHENTIC
                      </span>
                    </div>
                    <p className="text-xs text-sky-200/80 mt-1 leading-relaxed">
                      This certificate signature is valid. The contract is currently in status: <strong>{result.status}</strong>.
                    </p>
                  </div>
                </div>
              )}

              {/* Verification Failed / Forged / Not Found */}
              {!result.valid && (
                <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-500/30 flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-red-500/20 text-red-400 shrink-0">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-red-300 uppercase tracking-wide">
                        Verification Failed
                      </h3>
                      <span className="bg-red-500/20 text-red-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-500/30">
                        INVALID
                      </span>
                    </div>
                    <p className="text-xs text-red-200/80 mt-1 leading-relaxed">
                      The verification code could not be validated against the TekDoctor Registry. This certificate may be invalid, modified, or forged.
                    </p>
                  </div>
                </div>
              )}

              {/* Verified Details Grid */}
              {result.valid && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    
                    {/* Certificate Number */}
                    <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3.5">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-cyan-400" />
                        Certificate Reference
                      </div>
                      <div className="font-mono text-sm font-extrabold text-cyan-400">
                        {result.certificateNumber || 'N/A'}
                      </div>
                    </div>

                    {/* Contract Number */}
                    <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3.5">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-zinc-400" />
                        Contract Number
                      </div>
                      <div className="font-mono text-sm font-bold text-zinc-200">
                        {result.contractNumber || 'N/A'}
                      </div>
                    </div>

                    {/* Client Organization */}
                    <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3.5">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                        Fleet Operator / Client
                      </div>
                      <div className="text-sm font-bold text-white">
                        {result.companyName || 'N/A'}
                      </div>
                    </div>

                    {/* Plan Name */}
                    <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3.5">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        Coverage Plan
                      </div>
                      <div className="text-sm font-bold text-zinc-200">
                        {result.planName || 'N/A'}
                      </div>
                    </div>

                    {/* Validity Window */}
                    <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3.5 sm:col-span-2">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                        Contract Validity Window
                      </div>
                      <div className="text-sm font-semibold text-zinc-200">
                        {formatDate(result.startDate)} <span className="text-zinc-500 mx-1.5">to</span> {formatDate(result.endDate)}
                      </div>
                    </div>

                  </div>

                  {/* Cryptographic Metadata Banner */}
                  <div className="pt-3 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-zinc-500 gap-2">
                    <div>
                      Engine: <span className="font-mono text-zinc-400">{result.version || 'v2_hmac'}</span>
                    </div>
                    <div>
                      Verified: <span className="text-zinc-400">{formatTimestamp(result.verifiedAt)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Re-check Input or Query Info */}
              <div className="mt-6 pt-4 border-t border-zinc-800/60 text-center">
                <span className="text-[11px] text-zinc-500">
                  Verification Code: <span className="font-mono text-zinc-300 font-bold">{code}</span>
                </span>
              </div>

            </div>
          )}

        </div>

        {/* Security & Privacy Notice */}
        <div className="mt-8 text-center text-xs text-zinc-500 max-w-lg mx-auto leading-relaxed">
          <p>
            This verification portal queries TekDoctor’s authoritative database and cryptographic verification engine in real time. Private hardware serial numbers and commercial billing amounts are strictly excluded to preserve customer privacy.
          </p>
        </div>

      </div>
    </div>
  );
}

