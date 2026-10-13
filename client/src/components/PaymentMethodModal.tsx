import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  Banknote,
  Building2,
  QrCode,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  ShieldCheck,
  Copy,
  Check
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { billingApi } from '@/services/api';
import { triggerRazorpayCheckout } from '@/utils/payment';

export interface PaymentMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  ticketId?: number | string;
  ticketNumber?: string;
  invoiceId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  token?: string | null;
  onSuccess: (data?: any) => void;
}

type TabType = 'online' | 'cash' | 'bank_transfer' | 'offline_upi';

export default function PaymentMethodModal({
  isOpen,
  onClose,
  amount,
  ticketId,
  ticketNumber,
  invoiceId,
  customerName,
  customerEmail,
  customerPhone,
  token,
  onSuccess
}: PaymentMethodModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('online');
  const [referenceNote, setReferenceNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(`${field} copied to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // 1. Handle Online Razorpay Payment
  const handleOnlinePayment = async () => {
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const configRes = await billingApi.getConfig();
      const gatewayKey = configRes.data?.data?.keyId || '';

      const orderPayload: any = {
        amount,
        currency: 'INR'
      };
      if (ticketId) {
        orderPayload.ticketId = ticketId;
        orderPayload.ticket_id = ticketId;
      }
      if (ticketNumber) orderPayload.ticketNumber = ticketNumber;
      if (invoiceId) {
        orderPayload.invoiceId = invoiceId;
        orderPayload.invoice_id = invoiceId;
      }

      const orderRes = await billingApi.createPaymentOrder(orderPayload, token);
      if (!orderRes.ok || !orderRes.data?.data) {
        throw new Error(orderRes.error || 'Failed to initialize payment gateway.');
      }

      const orderData = orderRes.data.data;

      await triggerRazorpayCheckout({
        keyId: orderData.keyId || gatewayKey,
        orderId: orderData.orderId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'TekDoctor Repair & Maintenance',
        description: ticketNumber
          ? `Settlement for Ticket #${ticketNumber}`
          : invoiceId
          ? `Settlement for Invoice #${invoiceId}`
          : 'Service Settlement',
        prefill: {
          name: customerName || 'Customer',
          email: customerEmail || '',
          contact: customerPhone || ''
        },
        onPaymentSuccess: async (rzpResponse) => {
          try {
            const verifyPayload: any = {
              razorpay_order_id: rzpResponse.razorpay_order_id,
              razorpay_payment_id: rzpResponse.razorpay_payment_id,
              razorpay_signature: rzpResponse.razorpay_signature,
            };
            if (ticketId) verifyPayload.ticketId = ticketId;
            if (invoiceId) verifyPayload.invoiceId = invoiceId;
            if (ticketNumber) verifyPayload.ticketNumber = ticketNumber;

            const verifyRes = await billingApi.verifyPayment(verifyPayload, token);
            if (verifyRes.ok) {
              const invToken = verifyRes.data?.data?.invoiceAccessToken || (verifyRes.data as any)?.token;
              if (invToken && ticketId) {
                try {
                  sessionStorage.setItem(`tekdoctor_inv_token_${ticketId}`, invToken);
                } catch { }
              }
              toast.success('Payment verified successfully!');
              onSuccess(verifyRes.data?.data || verifyRes.data);
              onClose();
            } else {
              setErrorMessage(verifyRes.error || 'Payment verification failed on the server.');
            }
          } catch (verErr: any) {
            setErrorMessage(verErr?.message || 'Error settling payment.');
          } finally {
            setIsSubmitting(false);
          }
        },
        onDismiss: async () => {
          setIsSubmitting(false);
          try {
            await billingApi.reportPaymentFailure({
              orderId: orderData.orderId,
              ticketId,
              invoiceId,
              reason: 'Payment modal closed by user',
              status: 'cancelled'
            }, token);
          } catch { }
        },
        onPaymentError: async (pErr) => {
          setIsSubmitting(false);
          const errDesc = pErr?.description || pErr?.message || 'Payment cancelled or failed.';
          try {
            await billingApi.reportPaymentFailure({
              orderId: orderData.orderId,
              ticketId,
              invoiceId,
              reason: errDesc,
              status: 'failed'
            }, token);
          } catch { }
          setErrorMessage(errDesc);
        }
      });
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err.message || 'Payment initialization failed.');
    }
  };

  // 2. Handle Offline Payment Submission (Cash, Bank Transfer, Offline UPI)
  const handleOfflinePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');

    if (activeTab === 'bank_transfer' && !referenceNote.trim()) {
      setIsSubmitting(false);
      setErrorMessage('Please provide the Bank Transaction Reference / UTR Number.');
      return;
    }

    if (activeTab === 'offline_upi' && !referenceNote.trim()) {
      setIsSubmitting(false);
      setErrorMessage('Please provide the UPI Transaction ID / UTR Number.');
      return;
    }

    try {
      const payload: any = {
        paymentMethod: activeTab,
        referenceNote: referenceNote.trim()
      };
      if (ticketId) payload.ticketId = ticketId;
      if (ticketNumber) payload.ticketNumber = ticketNumber;
      if (invoiceId) payload.invoiceId = invoiceId;

      const res = await billingApi.initiateOfflinePayment(payload, token);
      if (res.ok && res.data) {
        const msg = activeTab === 'cash'
          ? 'Cash payment recorded! An authorized technician or admin will collect cash upon delivery or at service desk.'
          : 'Offline payment submitted! It is now pending verification by administration.';
        toast.success(msg, { duration: 5000 });
        onSuccess(res.data?.data || res.data);
        onClose();
      } else {
        setErrorMessage(res.error || 'Failed to submit offline payment request.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error submitting offline payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-[#0e0e11] border border-zinc-800 rounded-3xl w-full max-w-xl shadow-2xl relative overflow-hidden my-8"
        >
          {/* Top Gradient Accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-neon-cyan via-blue-500 to-emerald-400" />

          {/* Modal Header */}
          <div className="p-6 border-b border-zinc-800/80 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20">
                  Payment Settlement
                </span>
                <span className="text-xs font-mono text-zinc-500">
                  {ticketNumber ? `Ticket #${ticketNumber}` : invoiceId ? `Invoice #${invoiceId}` : 'Payable'}
                </span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight flex items-baseline gap-2">
                Select Payment Method
                <span className="text-neon-cyan text-xl font-mono font-black">
                  ₹{Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </h3>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tabs for Methods */}
          <div className="grid grid-cols-4 gap-1 p-3 bg-zinc-950/60 border-b border-zinc-800/60">
            {[
              { id: 'online', label: 'Online UPI/Cards', icon: <CreditCard size={15} /> },
              { id: 'cash', label: 'Cash on Delivery', icon: <Banknote size={15} /> },
              { id: 'bank_transfer', label: 'Bank Transfer', icon: <Building2 size={15} /> },
              { id: 'offline_upi', label: 'Offline UPI', icon: <QrCode size={15} /> },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as TabType); setErrorMessage(''); }}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-zinc-800 text-white font-semibold shadow-inner border border-zinc-700/60'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                }`}
              >
                {tab.icon}
                <span className="text-[11px] sm:text-xs text-center">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="p-6 space-y-5">
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/50 text-red-300 text-xs flex items-center gap-2.5">
                <AlertCircle size={16} className="shrink-0 text-red-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* TAB 1: Online Razorpay */}
            {activeTab === 'online' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-2">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm">
                    <ShieldCheck size={18} className="text-neon-cyan" />
                    Instant Verified Online Checkout
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed font-mono">
                    Pay securely using Google Pay, PhonePe, Paytm, BHIM UPI, Debit/Credit Card, or NetBanking. Instant status update and immediate tax invoice generation upon payment.
                  </p>
                </div>

                <div className="bg-zinc-950/80 rounded-2xl p-4 border border-zinc-800/80 flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-400">Total Authoritative Due:</span>
                  <span className="text-neon-cyan font-bold text-base">₹{Number(amount || 0).toFixed(2)}</span>
                </div>

                <button
                  type="button"
                  onClick={handleOnlinePayment}
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-neon-cyan via-blue-500 to-indigo-600 hover:from-white hover:to-neon-cyan text-black font-black uppercase tracking-wider text-xs py-4 px-6 rounded-xl transition-all shadow-lg shadow-neon-cyan/15 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Initializing Payment Gateway...
                    </>
                  ) : (
                    <>
                      <CreditCard size={16} />
                      Pay ₹{Number(amount || 0).toFixed(2)} Online Now
                    </>
                  )}
                </button>
              </div>
            )}

            {/* TAB 2: Cash Payment */}
            {activeTab === 'cash' && (
              <form onSubmit={handleOfflinePaymentSubmit} className="space-y-4">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                    <Banknote size={18} />
                    Cash Collection Flow
                  </div>
                  <p className="text-xs text-amber-200/80 leading-relaxed font-mono">
                    Request cash settlement. Hand over exact cash of <strong className="text-white font-bold">₹{Number(amount || 0).toFixed(2)}</strong> to our assigned field technician upon device delivery or at the TekDoctor repair counter.
                  </p>
                  <p className="text-[11px] text-zinc-400 font-mono pt-1">
                    * Cash payments will be marked as "Cash Collected — Pending Verification" when collected, and permanently marked as "Paid" once verified by the administrator.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                    Notes / Delivery Instructions (Optional)
                  </label>
                  <input
                    type="text"
                    value={referenceNote}
                    onChange={(e) => setReferenceNote(e.target.value)}
                    placeholder="e.g. Please bring change for ₹2000 / Available between 2-5 PM"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-wider text-xs py-4 px-6 rounded-xl transition-all shadow-lg shadow-amber-500/15 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Recording Request...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Confirm Cash Payment Request (₹{Number(amount || 0).toFixed(2)})
                    </>
                  )}
                </button>
              </form>
            )}

            {/* TAB 3: Bank Transfer */}
            {activeTab === 'bank_transfer' && (
              <form onSubmit={handleOfflinePaymentSubmit} className="space-y-4">
                <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">TekDoctor Official Account</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Active</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-black/60 p-3 rounded-xl border border-zinc-800/80">
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Beneficiary Name</span>
                      <span className="text-white font-semibold">TekDoctor Services Ltd</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Bank Name</span>
                      <span className="text-white font-semibold">HDFC Bank Ltd</span>
                    </div>
                    <div className="flex items-center justify-between pr-2">
                      <div>
                        <span className="text-zinc-500 block text-[10px]">Account Number</span>
                        <span className="text-neon-cyan font-bold">50200088991122</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('50200088991122', 'Account Number')}
                        className="text-zinc-500 hover:text-white"
                      >
                        {copiedField === 'Account Number' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between pr-2">
                      <div>
                        <span className="text-zinc-500 block text-[10px]">IFSC Code</span>
                        <span className="text-neon-cyan font-bold">HDFC0001234</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('HDFC0001234', 'IFSC')}
                        className="text-zinc-500 hover:text-white"
                      >
                        {copiedField === 'IFSC' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                    <span>UTR / Bank Transaction Reference <span className="text-red-400">*</span></span>
                    <span className="text-[10px] text-zinc-500">Required for verification</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={referenceNote}
                    onChange={(e) => setReferenceNote(e.target.value)}
                    placeholder="e.g. UTR / NEFT / IMPS reference (12 or 16 digits)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-neon-cyan transition-colors font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black uppercase tracking-wider text-xs py-4 px-6 rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Submitting for Verification...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Submit Bank Transfer for Verification (₹{Number(amount || 0).toFixed(2)})
                    </>
                  )}
                </button>
              </form>
            )}

            {/* TAB 4: Offline UPI */}
            {activeTab === 'offline_upi' && (
              <form onSubmit={handleOfflinePaymentSubmit} className="space-y-4">
                <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">TekDoctor UPI ID</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Instant</span>
                  </div>

                  <div className="flex items-center justify-between bg-black/60 p-3.5 rounded-xl border border-zinc-800/80">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <QrCode size={18} />
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block font-mono">UPI VPA</span>
                        <span className="text-white font-bold font-mono text-sm">tekdoctor@icici</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard('tekdoctor@icici', 'UPI ID')}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedField === 'UPI ID' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      Copy
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    Transfer <strong className="text-white">₹{Number(amount || 0).toFixed(2)}</strong> via any UPI app (GPay, PhonePe, Paytm, Cred) and paste the 12-digit UPI reference ID below.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                    <span>UPI Reference / UTR Number <span className="text-red-400">*</span></span>
                    <span className="text-[10px] text-zinc-500">12-digit numeric</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={referenceNote}
                    onChange={(e) => setReferenceNote(e.target.value)}
                    placeholder="e.g. 412356789012"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-400 transition-colors font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-black uppercase tracking-wider text-xs py-4 px-6 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Submitting for Verification...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Submit UPI Payment for Verification (₹{Number(amount || 0).toFixed(2)})
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Footer Note */}
          <div className="p-4 bg-zinc-950 border-t border-zinc-800/80 text-center">
            <span className="text-[10px] text-zinc-500 font-mono flex items-center justify-center gap-1.5">
              <ShieldCheck size={12} className="text-emerald-400" />
              All transactions are secured & recorded with GST compliance.
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
