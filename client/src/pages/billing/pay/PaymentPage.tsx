'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CreditCard, CheckCircle2, AlertCircle, ShieldCheck, Download, Printer, Loader2,
  Building2, Banknote, QrCode, Copy, Check, Clock, RotateCcw
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { billingApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/routes';
import { triggerRazorpayCheckout } from '@/utils/payment';
import { downloadPaymentBillPdf, printPaymentBill } from '@/utils/billGenerator';
import { SkeletonPaymentCheckout } from '@/components/Skeleton';

export default function PaymentPage() {
  const { invoiceId: paramInvoiceId } = useParams();
  const [searchParams] = useSearchParams();
  const invoiceId = paramInvoiceId || searchParams.get('id') || searchParams.get('invoiceId') || '';
  const navigate = useNavigate();
  const { token } = useAuth();

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloadingBill, setIsDownloadingBill] = useState(false);
  const [isPrintingBill, setIsPrintingBill] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'cash' | 'bank' | 'upi'>('razorpay');
  const [referenceNote, setReferenceNote] = useState('');
  const [guestInvoiceToken, setGuestInvoiceToken] = useState<string | null>(null);

  const [copiedBank, setCopiedBank] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const res = await billingApi.getInvoiceById(token, invoiceId!);
        if (res.ok && res.data) {
          const invData = res.data.data || res.data;
          setInvoice(invData);
          const st = (invData.status || '').toLowerCase();
          const pst = (invData.paymentStatus || '').toLowerCase();
          const pm = (invData.paymentMethod || invData.payment_method || '').toLowerCase();
          if (pm.includes('cash')) {
            setPaymentMethod('cash');
          } else if (pm.includes('bank')) {
            setPaymentMethod('bank');
          } else if (pm.includes('upi')) {
            setPaymentMethod('upi');
          }
          if (invData.referenceNote || invData.reference_note) {
            setReferenceNote(invData.referenceNote || invData.reference_note);
          }
          if (st === 'paid' || pst === 'paid') {
            setPaymentSuccess(true);
          } else if (st === 'pending_verification' || pst === 'pending_verification') {
            setPendingVerification(true);
          }
        } else {
          setError(res.error || 'Invoice not found');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (invoiceId) fetchInvoice();
  }, [token, invoiceId]);

  const handleCopy = (text: string, type: 'bank' | 'upi') => {
    navigator.clipboard.writeText(text);
    if (type === 'bank') {
      setCopiedBank(true);
      setTimeout(() => setCopiedBank(false), 2000);
    } else {
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    }
    toast.success('Copied to clipboard');
  };

  const handleRazorpayCheckout = async () => {
    if (!invoice) return;
    setIsProcessing(true);
    setError('');

    try {
      const configRes = await billingApi.getConfig();
      const gatewayKey = configRes.data?.data?.keyId || '';

      const orderRes = await billingApi.createPaymentOrder({
        invoiceId: invoice.id,
        invoice_id: invoice.id,
        amount: invoice.amount,
        currency: 'INR'
      }, token);

      if (!orderRes.ok || !orderRes.data?.data) {
        throw new Error(orderRes.error || 'Failed to initialize payment gateway.');
      }

      const orderData = orderRes.data.data;

      await triggerRazorpayCheckout({
        keyId: orderData.keyId || gatewayKey,
        orderId: orderData.orderId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'TekDoctor Billing Services',
        description: `Invoice Settlement #${invoice.id}`,
        prefill: {
          name: invoice.clientName || 'Customer',
          email: invoice.clientEmail || '',
          contact: invoice.clientPhone || ''
        },
        onPaymentSuccess: async (rzpResponse) => {
          try {
            const verifyRes = await billingApi.verifyPayment({
              razorpay_order_id: rzpResponse.razorpay_order_id,
              razorpay_payment_id: rzpResponse.razorpay_payment_id,
              razorpay_signature: rzpResponse.razorpay_signature,
              invoiceId: invoice.id,
              invoice_id: invoice.id
            }, token);

            if (verifyRes.ok) {
              const invToken = verifyRes.data?.data?.invoiceAccessToken || verifyRes.data?.invoiceAccessToken || (verifyRes.data as any)?.token;
              if (invToken) setGuestInvoiceToken(invToken);
              toast.success('Invoice settled successfully!');
              setPaymentSuccess(true);
            } else {
              setError(verifyRes.error || 'Payment verification failed on the server.');
            }
          } catch (verErr: any) {
            setError(verErr?.message || 'Error settling payment.');
          } finally {
            setIsProcessing(false);
          }
        },
        onDismiss: () => {
          setIsProcessing(false);
        },
        onPaymentError: (pErr) => {
          setIsProcessing(false);
          setError(pErr?.description || pErr?.message || 'Payment cancelled or failed.');
        }
      });
    } catch (err: any) {
      setIsProcessing(false);
      setError(err.message || 'Payment initialization failed.');
    }
  };

  const handleDownloadBill = async () => {
    if (!invoiceId) return;
    setIsDownloadingBill(true);
    const toastId = toast.loading('Generating invoice PDF...');
    try {
      const res = await billingApi.getPaymentReceiptByInvoice(invoiceId, token || guestInvoiceToken);
      if (res.ok && res.data?.data) {
        await downloadPaymentBillPdf(res.data.data);
        toast.success('Invoice PDF downloaded!', { id: toastId });
      } else {
        toast.error(res.error || 'Failed to fetch invoice bill data.', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Error generating PDF.', { id: toastId });
    } finally {
      setIsDownloadingBill(false);
    }
  };

  const handlePrintBill = async () => {
    if (!invoiceId) return;
    setIsPrintingBill(true);
    const toastId = toast.loading('Preparing invoice for print...');
    try {
      const res = await billingApi.getPaymentReceiptByInvoice(invoiceId, token || guestInvoiceToken);
      if (res.ok && res.data?.data) {
        await printPaymentBill(res.data.data);
        toast.success('Print window opened!', { id: toastId });
      } else {
        toast.error(res.error || 'Failed to fetch invoice bill data.', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Error printing invoice.', { id: toastId });
    } finally {
      setIsPrintingBill(false);
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice) return;

    if (paymentMethod === 'razorpay') {
      await handleRazorpayCheckout();
      return;
    }

    if ((paymentMethod === 'bank' || paymentMethod === 'upi') && !referenceNote.trim()) {
      setError(`Please enter the ${paymentMethod === 'bank' ? 'Bank UTR / Transaction Reference' : 'UPI Transaction ID'} to continue.`);
      return;
    }

    setIsProcessing(true);
    setError('');

    const mappedMethod = paymentMethod === 'cash' ? 'cash' : paymentMethod === 'bank' ? 'bank_transfer' : 'offline_upi';

    try {
      const res = await billingApi.initiateOfflinePayment({
        invoiceId: invoice.id,
        paymentMethod: mappedMethod,
        referenceNote: referenceNote.trim() || undefined
      }, token);

      if (res.ok) {
        toast.success('Offline payment recorded! Awaiting admin verification.');
        setPendingVerification(true);
      } else {
        setError(res.error || 'Failed to record offline payment.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error processing offline payment request.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return <SkeletonPaymentCheckout />;
  }

  if (error && !invoice) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-red-500 font-mono">
        Error: {error}
      </div>
    );
  }

  if (paymentSuccess) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-center p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-emerald-950/30 border border-emerald-500/50 rounded-3xl p-8 max-w-md w-full shadow-2xl"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-400 border border-emerald-500/40"
          >
            <CheckCircle2 size={40} />
          </motion.div>
          <h2 className="text-2xl font-bold text-white mb-2 font-mono uppercase tracking-wider">Payment Settled</h2>
          <p className="text-emerald-400 mb-6 text-sm">Invoice #{invoiceId} has been fully settled and recorded!</p>

          <div className="space-y-3">
            <button
              onClick={handleDownloadBill}
              disabled={isDownloadingBill}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isDownloadingBill ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Download Tax Invoice (PDF)
            </button>
            <button
              onClick={handlePrintBill}
              disabled={isPrintingBill}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl transition-colors border border-zinc-700 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isPrintingBill ? <Loader2 size={16} className="animate-spin text-neon-cyan" /> : <Printer size={16} className="text-neon-cyan" />}
              Print Tax Invoice
            </button>
            <button
              onClick={() => navigate(ROUTES.BILLING)}
              className="w-full bg-zinc-900/60 hover:bg-zinc-900 text-zinc-400 hover:text-white font-mono text-xs uppercase tracking-wider py-3 px-4 rounded-xl transition-colors border border-zinc-800 cursor-pointer"
            >
              Return to Invoices
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const isCashPayment = paymentMethod === 'cash' || ((invoice?.paymentMethod || invoice?.payment_method || '').toLowerCase().includes('cash'));
  const isCollected = (invoice?.collectionStatus || invoice?.collection_status) === 'collected';
  const canSwitchToOnline = isCashPayment && !isCollected;

  const invStatus = (invoice?.status || '').toLowerCase();
  const isDraft = invStatus === 'draft';
  const isVoid = invStatus === 'void' || invStatus === 'cancelled';

  if (isDraft) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-center p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-amber-950/30 border border-amber-500/50 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-5"
        >
          <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-400 border border-amber-500/40">
            <Clock size={40} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2 font-mono uppercase tracking-wider">Under Administrative Review</h2>
            <p className="text-amber-300 text-xs font-mono leading-relaxed">
              Invoice <strong className="text-white">#{invoiceId}</strong> is currently a Draft undergoing administrative review. Payment will be enabled once finalized and released.
            </p>
          </div>
          <button
            onClick={() => navigate(ROUTES.BILLING)}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl transition-colors border border-zinc-800 cursor-pointer"
          >
            Return to Invoices
          </button>
        </motion.div>
      </div>
    );
  }

  if (isVoid) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-center p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-rose-950/30 border border-rose-500/50 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-5"
        >
          <div className="w-20 h-20 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto text-rose-400 border border-rose-500/40">
            <AlertCircle size={40} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2 font-mono uppercase tracking-wider">Invoice Void / Cancelled</h2>
            <p className="text-rose-300 text-xs font-mono leading-relaxed">
              Invoice <strong className="text-white">#{invoiceId}</strong> is void or cancelled and cannot accept payments.
            </p>
          </div>
          <button
            onClick={() => navigate(ROUTES.BILLING)}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl transition-colors border border-zinc-800 cursor-pointer"
          >
            Return to Invoices
          </button>
        </motion.div>
      </div>
    );
  }

  if (pendingVerification) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-center p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-amber-950/30 border border-amber-500/50 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-5"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-400 border border-amber-500/40"
          >
            <Clock size={40} />
          </motion.div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2 font-mono uppercase tracking-wider">Pending Verification</h2>
            <p className="text-amber-300 text-xs font-mono leading-relaxed">
              Your offline payment for Invoice <strong className="text-white">#{invoiceId}</strong> (₹{invoice?.amount?.toFixed(2)}) has been submitted to TekDoctor Accounts for clearance.
            </p>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 text-left space-y-2 text-xs font-mono">
            <div className="flex justify-between text-zinc-400">
              <span>Payment Mode:</span>
              <span className="text-white font-bold capitalize">{paymentMethod.replace('_', ' ')}</span>
            </div>
            {referenceNote && (
              <div className="flex justify-between text-zinc-400">
                <span>Reference / UTR:</span>
                <span className="text-neon-cyan font-bold truncate max-w-[180px]">{referenceNote}</span>
              </div>
            )}
            <div className="flex justify-between text-zinc-400">
              <span>Status:</span>
              <span className="text-amber-400 font-bold">Awaiting Admin Approval</span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {canSwitchToOnline && (
              <>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={async () => {
                    setIsProcessing(true);
                    try {
                      const res = await billingApi.switchPaymentMethod({ invoiceId: invoice.id }, token);
                      if (res.ok) {
                        toast.success('Switched to online payment!');
                        setPendingVerification(false);
                        setPaymentMethod('razorpay');
                        await handleRazorpayCheckout();
                      } else {
                        toast.error(res.error || 'Failed to switch payment method.');
                      }
                    } catch (e: any) {
                      toast.error(e?.message || 'Error switching payment method.');
                    } finally {
                      setIsProcessing(false);
                    }
                  }}
                  className="w-full bg-gradient-to-r from-neon-cyan to-blue-500 hover:from-white hover:to-neon-cyan text-black font-black uppercase text-xs tracking-widest py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-neon-cyan/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                  Pay Online Instead
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={async () => {
                    setIsProcessing(true);
                    try {
                      const res = await billingApi.switchPaymentMethod({ invoiceId: invoice.id }, token);
                      if (res.ok) {
                        toast.success('Payment method reset. You can now select another method.');
                        setPendingVerification(false);
                        setPaymentMethod('razorpay');
                      } else {
                        toast.error(res.error || 'Failed to switch payment method.');
                      }
                    } catch (e: any) {
                      toast.error(e?.message || 'Error resetting payment method.');
                    } finally {
                      setIsProcessing(false);
                    }
                  }}
                  className="w-full bg-zinc-900 hover:bg-zinc-800 text-neon-cyan font-mono text-xs uppercase tracking-wider py-3 px-4 rounded-xl transition-colors border border-zinc-800 hover:border-neon-cyan/40 cursor-pointer disabled:opacity-50"
                >
                  Change Payment Method
                </button>
              </>
            )}
            <button
              onClick={() => navigate(ROUTES.BILLING)}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl transition-colors border border-zinc-800 cursor-pointer"
            >
              Return to Invoices
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white py-16 px-6">
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Invoice Summary */}
        <div className="space-y-8">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              Invoice Summary
            </h2>
            <div className="space-y-4 mb-8">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Invoice ID</span>
                <span className="font-mono text-neon-cyan">{invoice.id}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Client Name</span>
                <span className="font-semibold">{invoice.clientName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Status</span>
                <span className="bg-yellow-500/20 text-yellow-500 px-2 rounded text-xs font-mono py-0.5 border border-yellow-500/30">
                  {invoice.status.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-800">
              <div className="space-y-3 mb-6">
                {(invoice.lineItems || []).map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-zinc-400">{item.description} (x{item.quantity})</span>
                    <span className="font-mono">₹{Number(item.total || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* GST & Financial Breakdown */}
              {(() => {
                const subtotal = Number(invoice.subtotal || (invoice.lineItems || []).reduce((s: number, it: any) => s + (Number(it.total) || 0), 0));
                const totalTax = Number(invoice.taxAmount !== undefined && invoice.taxAmount !== null ? invoice.taxAmount : (Number(invoice.amount || 0) - subtotal));
                const isInterstate = Boolean(invoice.isInterstate || (invoice as any).is_interstate);
                const cgst = isInterstate ? 0 : Number(invoice.cgstAmount !== undefined && invoice.cgstAmount !== null ? invoice.cgstAmount : Math.round((totalTax / 2) * 100) / 100);
                const sgst = isInterstate ? 0 : Number(invoice.sgstAmount !== undefined && invoice.sgstAmount !== null ? invoice.sgstAmount : Math.round((totalTax - cgst) * 100) / 100);
                const igst = isInterstate ? Number(invoice.igstAmount !== undefined && invoice.igstAmount !== null ? invoice.igstAmount : totalTax) : 0;

                return (
                  <div className="py-4 border-t border-zinc-800/80 space-y-2 text-xs font-mono">
                    <div className="flex justify-between text-zinc-400">
                      <span>Taxable Subtotal:</span>
                      <span className="text-white font-bold">₹{subtotal.toFixed(2)}</span>
                    </div>

                    {isInterstate ? (
                      <div className="flex justify-between text-zinc-400">
                        <span>IGST (18%):</span>
                        <span className="text-amber-400 font-bold">₹{igst.toFixed(2)}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between text-zinc-400">
                          <span>CGST (9.0%):</span>
                          <span className="text-neon-cyan font-bold">₹{cgst.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>SGST (9.0%):</span>
                          <span className="text-neon-cyan font-bold">₹{sgst.toFixed(2)}</span>
                        </div>
                      </>
                    )}

                    <div className="flex justify-between text-zinc-400 pt-1 border-t border-zinc-900">
                      <span>Total GST:</span>
                      <span className="text-cyan-300 font-bold">₹{totalTax.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-between items-end pt-4 border-t border-zinc-800">
                <span className="text-zinc-500 uppercase tracking-widest text-xs font-bold">Total Due (INR)</span>
                <span className="text-4xl font-black text-white font-mono">₹{Number(invoice.amount || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payment Methods Info */}
          <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-3xl p-8">
            <h3 className="text-xs font-bold text-white uppercase tracking-[0.3em] mb-6">Accepted Methods</h3>
            <p className="text-sm text-zinc-500 leading-relaxed mb-6">
              We accept online payments via Razorpay (UPI, Credit/Debit Cards, NetBanking), Cash on Delivery/Handover, Direct Bank Transfers (NEFT/RTGS), and direct UPI transfers.
            </p>
            <div className="bg-neon-cyan/5 border border-neon-cyan/10 rounded-2xl p-6">
              <p className="text-xs text-neon-cyan font-bold uppercase tracking-widest mb-2">Verified Receipts</p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                All settlements receive an official GST-compliant tax invoice generated immediately upon verification.
              </p>
            </div>
          </div>
        </div>

        {/* Payment Form */}
        <div className="bg-zinc-950 border border-neon-cyan/30 rounded-3xl p-8 relative overflow-hidden" style={{ boxShadow: '0 0 30px rgba(var(--neon-cyan-rgb), 0.05)' }}>
          <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
            <ShieldCheck size={100} className="text-neon-cyan" />
          </div>

          <h2 className="text-2xl font-bold mb-6 relative z-10">Select Payment Method</h2>

          {/* Method Selector Tabs */}
          <div className="relative z-10 mb-6 grid grid-cols-2 gap-2">
            {[
              { id: 'razorpay' as const, label: 'Online Gateway', icon: CreditCard },
              { id: 'cash' as const, label: 'Cash', icon: Banknote },
              { id: 'bank' as const, label: 'Bank Transfer', icon: Building2 },
              { id: 'upi' as const, label: 'Offline UPI', icon: QrCode }
            ].map(method => {
              const Icon = method.icon;
              const isSelected = paymentMethod === method.id;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(method.id);
                    setError('');
                  }}
                  className={`p-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                    isSelected
                      ? 'bg-neon-cyan/15 border-neon-cyan text-neon-cyan shadow-md shadow-neon-cyan/10'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  <Icon size={16} />
                  <span>{method.label}</span>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="mb-6 bg-red-900/20 border border-red-500/50 rounded-xl p-3 flex gap-2 items-center text-red-400 text-xs font-mono">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handlePayment} className="space-y-6 relative z-10">
            {paymentMethod === 'razorpay' && (
              <div className="bg-zinc-900/60 border border-neon-cyan/30 rounded-2xl p-5 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center text-neon-cyan">
                  <CreditCard size={24} />
                </div>
                <h4 className="font-bold text-white text-sm">Official Razorpay Gateway</h4>
                <p className="text-zinc-400 text-xs font-mono leading-relaxed">
                  Pay instantly via UPI (GPay, PhonePe, Paytm), All Major Debit & Credit Cards, NetBanking, or Digital Wallets with instant verification.
                </p>
              </div>
            )}

            {paymentMethod === 'cash' && (
              <div className="bg-zinc-900/60 border border-amber-500/30 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm font-mono">
                  <Banknote size={18} />
                  <span>Cash on Handover / Collection</span>
                </div>
                <p className="text-xs text-zinc-300 font-mono leading-relaxed">
                  Pay with physical cash to our authorized technician or service center cashier. Your payment will be recorded as collected and settled upon administrative verification.
                </p>
                <div className="space-y-1.5 pt-1">
                  <label className="text-[10px] font-mono uppercase text-zinc-400">Additional Notes / Handover Details (Optional)</label>
                  <input
                    type="text"
                    value={referenceNote}
                    onChange={e => setReferenceNote(e.target.value)}
                    placeholder="e.g. Handed cash to desk cashier / Tech #4"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>
              </div>
            )}

            {paymentMethod === 'bank' && (
              <div className="bg-zinc-900/60 border border-blue-500/30 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm font-mono">
                  <Building2 size={18} />
                  <span>Direct Bank Account (NEFT / RTGS / IMPS)</span>
                </div>
                <div className="bg-zinc-950/80 rounded-xl p-3 space-y-2 text-xs font-mono border border-zinc-800">
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Beneficiary:</span>
                    <span className="text-white font-bold">TekDoctor Solutions Pvt Ltd</span>
                  </div>
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Bank Name:</span>
                    <span className="text-white font-bold">ICICI Bank</span>
                  </div>
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Account Number:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-neon-cyan font-bold">234505001234</span>
                      <button
                        type="button"
                        onClick={() => handleCopy('234505001234', 'bank')}
                        className="text-zinc-400 hover:text-white p-1 rounded"
                      >
                        {copiedBank ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>IFSC Code:</span>
                    <span className="text-white font-bold">ICIC0002345</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-zinc-400">Bank Transaction / UTR / Reference ID (Required):</label>
                  <input
                    type="text"
                    required
                    value={referenceNote}
                    onChange={e => setReferenceNote(e.target.value)}
                    placeholder="e.g. UTR123456789012"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-blue-400 font-mono"
                  />
                </div>
              </div>
            )}

            {paymentMethod === 'upi' && (
              <div className="bg-zinc-900/60 border border-emerald-500/30 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm font-mono">
                  <QrCode size={18} />
                  <span>Offline Direct UPI Transfer</span>
                </div>
                <div className="bg-zinc-950/80 rounded-xl p-3 space-y-2 text-xs font-mono border border-zinc-800">
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>TekDoctor UPI VPA:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-400 font-bold">tekdoctor@icici</span>
                      <button
                        type="button"
                        onClick={() => handleCopy('tekdoctor@icici', 'upi')}
                        className="text-zinc-400 hover:text-white p-1 rounded"
                      >
                        {copiedUpi ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Merchant Name:</span>
                    <span className="text-white font-bold">TekDoctor Solutions</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-zinc-400">12-Digit UPI Transaction / Ref ID (Required):</label>
                  <input
                    type="text"
                    required
                    value={referenceNote}
                    onChange={e => setReferenceNote(e.target.value)}
                    placeholder="e.g. 423456789012"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-400 font-mono"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full bg-neon-cyan hover:bg-white text-black font-black uppercase tracking-widest py-4 rounded-xl transition-colors mt-4 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-neon-cyan/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Processing...
                </>
              ) : paymentMethod === 'razorpay' ? (
                `Authorize Online Payment (₹${Number(invoice.amount || 0).toFixed(2)})`
              ) : (
                `Submit Offline Payment (₹${Number(invoice.amount || 0).toFixed(2)})`
              )}
            </button>
            <p className="text-center text-[10px] text-zinc-600 font-mono mt-4 flex items-center justify-center gap-1">
              <ShieldCheck size={10} /> 256-BIT ENCRYPTION SECURED
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
