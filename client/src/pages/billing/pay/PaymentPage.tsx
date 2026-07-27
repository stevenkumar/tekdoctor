'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CreditCard, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { billingApi } from '@/services/api';
import { ROUTES } from '@/config/routes';

export default function PaymentPage() {
  const { invoiceId } = useParams();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('card');

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const data = await billingApi.getInvoiceById(invoiceId!);
        setInvoice(data);
        if (data.status === 'Paid') {
          setPaymentSuccess(true);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (invoiceId) fetchInvoice();
  }, [invoiceId]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethod === 'card' && (!cardNumber || !expiry || !cvc)) {
      setError('Please fill in all card details');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      await billingApi.payInvoice({ invoiceId: invoiceId!, paymentMethod, cardNumber, expiry, cvc });

      setPaymentSuccess(true);
      setTimeout(() => {
        navigate(ROUTES.BILLING);
      }, 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full"
        />
      </div>
    );
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
          className="bg-green-900/20 border border-green-500/50 rounded-2xl p-8 max-w-md w-full"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-green-400"
          >
            <CheckCircle2 size={40} />
          </motion.div>
          <h2 className="text-2xl font-bold text-white mb-2 font-mono">PAYMENT_SUCCESS</h2>
          <p className="text-green-400 mb-6">Invoice {invoiceId} has been fully paid!</p>
          <p className="text-zinc-500 text-sm font-mono animate-pulse">Redirecting to dashboard...</p>
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
                {invoice.lineItems.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-zinc-400">{item.description} (x{item.quantity})</span>
                    <span className="font-mono">${item.total.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-end">
                <span className="text-zinc-500 uppercase tracking-widest text-xs font-bold">Total Due</span>
                <span className="text-4xl font-black text-white font-mono">${invoice.amount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payment Methods Info */}
          <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-3xl p-8">
            <h3 className="text-xs font-bold text-white uppercase tracking-[0.3em] mb-6">Accepted Methods</h3>
            <p className="text-sm text-zinc-500 leading-relaxed mb-6">
              We accept all major credit cards (Visa, Mastercard, American Express), cash, bank transfers, and digital payment platforms.
            </p>
            <div className="bg-neon-cyan/5 border border-neon-cyan/10 rounded-2xl p-6">
              <p className="text-xs text-neon-cyan font-bold uppercase tracking-widest mb-2">Flexible Payment Plans</p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Flexible payment plans are available for major repairs. Contact our billing department if you need assistance.
              </p>
            </div>
          </div>
        </div>

        {/* Payment Form */}
        <div className="bg-zinc-950 border border-neon-cyan/30 rounded-3xl p-8 relative overflow-hidden" style={{ boxShadow: '0 0 30px rgba(var(--neon-cyan-rgb), 0.05)' }}>
          <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
            <ShieldCheck size={100} className="text-neon-cyan" />
          </div>

          <h2 className="text-2xl font-bold mb-8 relative z-10">Secure Payment</h2>

          <div className="relative z-10 mb-8 flex flex-wrap gap-2">
            {[
              { id: 'card', label: 'Credit Card' },
              { id: 'gpay', label: 'GPay' },
              { id: 'phonepe', label: 'PhonePe' },
              { id: 'paypal', label: 'PayPal' },
              { id: 'stripe', label: 'Stripe' },
              { id: 'bank', label: 'Bank Transfer' }
            ].map(method => (
              <button
                key={method.id}
                onClick={() => setPaymentMethod(method.id)}
                className={`px-4 py-2 rounded-lg font-mono text-xs font-bold transition-colors ${paymentMethod === method.id
                    ? 'bg-neon-cyan text-black'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
              >
                {method.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-6 bg-red-900/20 border border-red-500/50 rounded-lg p-3 flex gap-2 items-center text-red-400 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handlePayment} className="space-y-6 relative z-10">
            {paymentMethod === 'card' ? (
              <>
                <div>
                  <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase tracking-widest">Card Number (Mock)</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                    <input
                      type="text"
                      placeholder="0000 0000 0000 0000"
                      value={cardNumber}
                      onChange={e => setCardNumber(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-white font-mono focus:outline-none focus:border-neon-cyan transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase tracking-widest">Expiry</label>
                    <input
                      type="text"
                      placeholder="MM/YY"
                      value={expiry}
                      onChange={e => setExpiry(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 text-white font-mono focus:outline-none focus:border-neon-cyan transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase tracking-widest">CVC</label>
                    <input
                      type="text"
                      placeholder="123"
                      value={cvc}
                      onChange={e => setCvc(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 text-white font-mono focus:outline-none focus:border-neon-cyan transition-colors"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                <p className="text-zinc-400 font-mono text-sm mb-2">You selected {paymentMethod.toUpperCase()}</p>
                <p className="text-zinc-500 text-xs">You will be securely redirected to the provider to complete your transaction.</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full bg-neon-cyan hover:bg-white text-black font-black uppercase tracking-widest py-4 rounded-xl transition-colors mt-4 disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : `Pay $${invoice.amount.toFixed(2)}`}
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
