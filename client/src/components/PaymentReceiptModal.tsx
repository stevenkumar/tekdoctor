import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Receipt,
  X,
  Printer,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Building2,
  User,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { billingApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import {
  downloadPaymentBillPdf,
  printPaymentBill,
  generatePaymentBillHtml,
  formatINR,
  type PaymentReceiptData,
} from '@/utils/billGenerator';

export interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptData?: PaymentReceiptData | null;
  receipt?: PaymentReceiptData | null;
  loading?: boolean;
  error?: string | null;
  ticketId?: number | string | null;
  ticketNumber?: string | null;
  invoiceId?: number | string | null;
  title?: string;
}

export function PaymentReceiptModal({
  isOpen,
  onClose,
  receiptData: propReceiptDataExplicit,
  receipt: propReceiptAlias,
  loading: propLoading,
  error: propError,
  ticketId,
  ticketNumber,
  invoiceId,
  title = 'Tax Invoice & Payment Receipt',
}: PaymentReceiptModalProps) {
  const propReceiptData = propReceiptDataExplicit ?? propReceiptAlias;
  const { token } = useAuth();
  const [data, setData] = useState<PaymentReceiptData | null>(propReceiptData || null);
  const [loading, setLoading] = useState<boolean>(propLoading ?? false);
  const [error, setError] = useState<string | null>(propError ?? null);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [billHtml, setBillHtml] = useState<string>('');

  useEffect(() => {
    if (data) {
      let isMounted = true;
      generatePaymentBillHtml(data).then(html => {
        if (isMounted) setBillHtml(html);
      }).catch(err => {
        console.error('Failed to generate bill preview HTML:', err);
      });
      return () => { isMounted = false; };
    } else {
      setBillHtml('');
    }
  }, [data]);

  // Sync prop changes
  useEffect(() => {
    if (propReceiptData !== undefined) {
      setData(propReceiptData);
    }
  }, [propReceiptData]);

  useEffect(() => {
    if (propLoading !== undefined) {
      setLoading(propLoading);
    }
  }, [propLoading]);

  useEffect(() => {
    if (propError !== undefined) {
      setError(propError);
    }
  }, [propError]);

  // Fetch receipt if not provided as prop
  const fetchReceipt = useCallback(async () => {
    if (propReceiptData) return;
    if (!ticketId && !invoiceId) return;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      let res: any = null;
      if (invoiceId) {
        res = await billingApi.getPaymentReceiptByInvoice(invoiceId, token);
      } else if (ticketId) {
        res = await billingApi.getPaymentReceiptByTicket(ticketId, token);
      }

      if (res && res.ok && res.data?.data) {
        setData(res.data.data);
      } else if (res && res.ok && res.data) {
        setData(res.data);
      } else {
        setError(res?.error || 'Payment receipt not available. Receipts are only issued for settled payments.');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error fetching payment receipt statement.');
    } finally {
      setLoading(false);
    }
  }, [propReceiptData, ticketId, invoiceId, token]);

  useEffect(() => {
    if (isOpen) {
      if (!propReceiptData && (ticketId || invoiceId)) {
        fetchReceipt();
      }
    } else {
      setIsPrinting(false);
      setIsDownloadingPdf(false);
    }
  }, [isOpen, propReceiptData, ticketId, invoiceId, fetchReceipt]);

  // Keyboard navigation (ESC to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const handlePrint = async () => {
    if (!data) return;
    setIsPrinting(true);
    try {
      await printPaymentBill(data);
    } catch (err: any) {
      console.error('Failed to print bill:', err);
      toast.error('Print preview failed. Please try again.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!data) return;
    setIsDownloadingPdf(true);
    const toastId = toast.loading('Generating high-resolution GST PDF...');
    try {
      await downloadPaymentBillPdf(data);
      toast.success('Document downloaded successfully!', { id: toastId });
    } catch (err: any) {
      console.error('Failed to download bill PDF:', err);
      toast.error('Failed to download PDF. Please try again.', { id: toastId });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
          {/* Backdrop click dismiss */}
          <div className="absolute inset-0" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl bg-zinc-950/95 border border-zinc-800 shadow-2xl overflow-hidden z-10 font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-zinc-800/80 bg-zinc-900/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center text-neon-cyan shrink-0">
                  <Receipt size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-white font-outfit">
                      {title}
                    </h3>
                    {(() => {
                      const isPaid = data?.paymentStatus === 'paid' || data?.invoiceStatus === 'Paid';
                      const isDraft = data?.invoiceStatus === 'Draft' || data?.paymentStatus === 'draft';
                      if (isPaid) {
                        return (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            Paid • Verified
                          </span>
                        );
                      }
                      if (isDraft) {
                        return (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            Draft Review (Non-Payable)
                          </span>
                        );
                      }
                      return (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                          Commercial Invoice
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-xs text-zinc-400">
                    Authoritative GST-compliant service statement
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                aria-label="Close invoice viewer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-xs">
              {loading ? (
                <div className="py-16 text-center space-y-3">
                  <Loader2 size={32} className="animate-spin text-neon-cyan mx-auto" />
                  <p className="text-xs font-mono text-zinc-400">
                    Loading verified payment receipt & tax details...
                  </p>
                </div>
              ) : error ? (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono flex items-start gap-3">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Unable to Display Receipt</span>
                    <p className="mt-1 text-zinc-300">{error}</p>
                  </div>
                </div>
              ) : data ? (
                <div className="max-w-[780px] w-full mx-auto bg-white rounded-lg shadow-2xl border border-zinc-200 overflow-hidden text-slate-900">
                  {billHtml ? (
                    <div dangerouslySetInnerHTML={{ __html: billHtml }} />
                  ) : (
                    <div className="py-20 text-center text-zinc-500">
                      <Loader2 size={28} className="animate-spin text-neon-cyan mx-auto mb-2" />
                      <span className="text-xs font-mono">Rendering canonical bill document...</span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Modal Footer Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 sm:p-5 border-t border-zinc-800/80 bg-zinc-900/60">
              <span className="text-[11px] font-mono text-zinc-500 truncate max-w-xs text-center sm:text-left">
                {data ? `Official Statement for ${data.customer.name}` : ''}
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-zinc-400 hover:text-white transition-all cursor-pointer min-h-[40px]"
                >
                  Close
                </button>

                {data && (
                  <>
                    <button
                      type="button"
                      onClick={handlePrint}
                      disabled={isPrinting}
                      className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 min-h-[40px]"
                      title="Print Document"
                    >
                      {isPrinting ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                      <span>{isPrinting ? 'Printing...' : 'Print'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      disabled={isDownloadingPdf}
                      className="flex-1 sm:flex-none btn-neon px-4 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 min-h-[40px]"
                      title="Download PDF Document"
                    >
                      {isDownloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      <span>{isDownloadingPdf ? 'Downloading...' : 'Download PDF'}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default PaymentReceiptModal;
