
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Package, CheckCircle2, Clock, Wrench, Cpu, History, User,
  ExternalLink, CreditCard, Hash, Settings, FileImage, Image, RefreshCw,
  AlertCircle, ShieldCheck, AlertTriangle, Download, Check, X, FileText,
  DollarSign, Loader2, Sparkles, CheckCheck, Star
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { repairApi, billingApi } from '@/services/api';
import type { ServiceRequest } from '@/services/api';
import { appConfig } from '@/config/appConfig';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import CustomerFeedbackModal from '@/components/CustomerFeedbackModal';
import PromptModal from '@/components/PromptModal';
import { triggerRazorpayCheckout } from '@/utils/payment';
import { downloadPaymentBillPdf } from '@/utils/billGenerator';
import RepairStepProgress, { type WorkflowStepKey } from '@/components/RepairStepProgress';
import PaymentMethodModal from '@/components/PaymentMethodModal';

const getFileUrl = (path: string | null) => {
  if (!path) return null;
  const base = (appConfig.apiUrl || window.location.origin).replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return `${base}/${cleanPath}`;
};

export default function ServiceTracker() {
  const { user, token, isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const [ticketId, setTicketId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [trackingData, setTrackingData] = useState<any>(null);
  const [history, setHistory] = useState<ServiceRequest[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);

  // Preview States
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState('');
  const [previewAlt, setPreviewAlt] = useState('');

  const handleImagePreview = (src: string, alt: string) => {
    setPreviewSrc(src);
    setPreviewAlt(alt);
    setPreviewOpen(true);
  };

  // Cancel Feature State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Payment & Estimate Feature States
  const [isPaying, setIsPaying] = useState(false);
  const [isDownloadingBill, setIsDownloadingBill] = useState(false);
  const [isApprovingEstimate, setIsApprovingEstimate] = useState(false);
  const [isRejectingEstimate, setIsRejectingEstimate] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectEstimateReason, setRejectEstimateReason] = useState('');
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);
  const [guestInvoiceToken, setGuestInvoiceToken] = useState<string | null>(null);

  const fetchTicketStatus = useCallback(async (idToSearch: string, isManualRefresh = false) => {
    if (!idToSearch) return;
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsSearching(true);
    }
    setSearchError('');

    try {
      const res = await repairApi.trackRequest(idToSearch.trim());
      if (res.ok && res.data) {
        setTrackingData(res.data.data);
        setShowStatus(true);
      } else {
        setSearchError(res.error || 'Ticket not found. Please verify the ticket ID and try again.');
        setShowStatus(false);
      }
    } catch (err) {
      setSearchError('Network error while retrieving ticket status. Please check your connection.');
      setShowStatus(false);
    } finally {
      setIsSearching(false);
      setIsRefreshing(false);
    }
  }, []);

  const queryToken = searchParams.get('token') || searchParams.get('approvalToken') || searchParams.get('actionToken') || searchParams.get('invoiceToken');
  const effectiveToken = token || guestInvoiceToken || queryToken || null;

  // Auto-fetch ticket details when 'id', 'ticket', or 'ticketId' query param is provided
  useEffect(() => {
    const queryId = searchParams.get('id') || searchParams.get('ticket') || searchParams.get('ticketId');
    if (queryId) {
      setTicketId(queryId);
      fetchTicketStatus(queryId);
    }
  }, [searchParams, fetchTicketStatus]);

  // Handle action parameter from direct email links
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'reject' && trackingData?.customerApprovalStatus === 'pending_approval') {
      setShowRejectModal(true);
    }
  }, [searchParams, trackingData]);

  const handleCancelRequest = async () => {
    if (!token || !trackingData) return;
    setIsCancelling(true);
    try {
      const res = await repairApi.cancelRequest(token, trackingData.id, cancelReason);
      if (res.ok) {
        setTrackingData({ ...trackingData, status: 'cancelled' });
        setShowCancelModal(false);
        setCancelReason('');
        toast.success('Repair request cancelled successfully.');
        // Refresh history to reflect cancellation natively
        repairApi.getMyHistory(token).then((res) => {
          if (res.ok && res.data) setHistory(res.data.data.data);
        });
      } else {
        toast.error(res.error || 'Failed to cancel the repair request. Please try again.');
      }
    } catch (err) {
      toast.error('Network error while cancelling. Please check your connection and try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && token) {
      repairApi.getMyHistory(token).then((res) => {
        if (res.ok && res.data) {
          setHistory(res.data.data.data);
        }
      });
    }
  }, [isAuthenticated, token]);

  const handleApproveEstimate = async () => {
    if (!trackingData) return;
    if (!effectiveToken) {
      toast.error('Authentication required: Please sign in or use the secure approval link sent to your registered email.');
      return;
    }
    setIsApprovingEstimate(true);
    try {
      const res = await repairApi.approveEstimate(trackingData.id, effectiveToken);
      if (res.ok) {
        toast.success('Repair estimate approved! Our technician has been notified to proceed.');
        await fetchTicketStatus(ticketId || trackingData.ticketNumber || String(trackingData.id), true);
      } else {
        toast.error(res.error || 'Failed to approve estimate.');
      }
    } catch (err: any) {
      toast.error('Network error while approving estimate.');
    } finally {
      setIsApprovingEstimate(false);
    }
  };

  const handleRejectEstimate = async () => {
    if (!trackingData) return;
    if (!effectiveToken) {
      toast.error('Authentication required: Please sign in or use the secure decline link sent to your registered email.');
      return;
    }
    setIsRejectingEstimate(true);
    try {
      const res = await repairApi.rejectEstimate(trackingData.id, rejectEstimateReason, effectiveToken);
      if (res.ok) {
        toast.success('Estimate declined. Our service team will reach out to assist you.');
        setShowRejectModal(false);
        setRejectEstimateReason('');
        await fetchTicketStatus(ticketId || trackingData.ticketNumber || String(trackingData.id), true);
      } else {
        toast.error(res.error || 'Failed to decline estimate.');
      }
    } catch (err: any) {
      toast.error('Network error while declining estimate.');
    } finally {
      setIsRejectingEstimate(false);
    }
  };

  const handleRequestRevision = async (noteToSubmit?: string) => {
    if (!trackingData) return;
    if (!effectiveToken) {
      toast.error('Authentication required: Please sign in or use the secure approval link sent to your registered email.');
      return;
    }
    const noteText = (typeof noteToSubmit === 'string' ? noteToSubmit : revisionNote).trim();
    if (noteText.length > 500) {
      toast.error('Revision request note cannot exceed 500 characters.');
      return;
    }

    setIsSubmittingRevision(true);
    try {
      const res = await repairApi.requestRepairAgain(trackingData.id, noteText || undefined, effectiveToken);
      if (res.ok) {
        toast.success('Revision requested! Our technician has been alerted to review your feedback.');
        setShowRevisionModal(false);
        setRevisionNote('');
        await fetchTicketStatus(ticketId || trackingData.ticketNumber || String(trackingData.id), true);
      } else {
        toast.error(res.error || 'Failed to submit revision request.');
      }
    } catch (err: any) {
      toast.error('Network error while requesting revision.');
    } finally {
      setIsSubmittingRevision(false);
    }
  };

  const handlePayWithRazorpay = async () => {
    if (!trackingData) return;
    setIsPaying(true);

    try {
      // 1. Check eligibility
      const eligRes = await billingApi.getEligibility(trackingData.id, token);
      if (!eligRes.ok || !eligRes.data?.data?.eligible) {
        const reason = eligRes.data?.data?.reason || eligRes.error || 'This ticket is not currently eligible for payment settlement.';
        toast.error(reason);
        setIsPaying(false);
        return;
      }

      const payableAmount = eligRes.data.data.amount || trackingData.repair_cost || trackingData.repairCost || 0;

      // 2. Fetch Gateway Config
      const configRes = await billingApi.getConfig();
      const gatewayKey = configRes.data?.data?.keyId || '';

      // 3. Create payment order
      const orderRes = await billingApi.createPaymentOrder({
        ticketId: trackingData.id,
        ticket_id: trackingData.id,
        ticketNumber: trackingData.ticketNumber,
        amount: payableAmount,
        currency: 'INR'
      }, token);

      if (!orderRes.ok || !orderRes.data?.data) {
        throw new Error(orderRes.error || 'Failed to initialize payment order with gateway.');
      }

      const orderData = orderRes.data.data;

      // 4. Trigger Razorpay Checkout
      await triggerRazorpayCheckout({
        keyId: orderData.keyId || gatewayKey,
        orderId: orderData.orderId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'TekDoctor Repair Services',
        description: `Repair Settlement #${trackingData.ticketNumber || trackingData.id}`,
        prefill: {
          name: trackingData.customerName || user?.name || 'Customer',
          email: trackingData.email || user?.email || '',
          contact: trackingData.mobile || ''
        },
        onPaymentSuccess: async (rzpResponse) => {
          try {
            const verifyRes = await billingApi.verifyPayment({
              razorpay_order_id: rzpResponse.razorpay_order_id,
              razorpay_payment_id: rzpResponse.razorpay_payment_id,
              razorpay_signature: rzpResponse.razorpay_signature,
              ticketId: trackingData.id,
              ticket_id: trackingData.id,
              ticketNumber: trackingData.ticketNumber
            }, token);

            if (verifyRes.ok) {
              const invToken = verifyRes.data?.data?.invoiceAccessToken || verifyRes.data?.invoiceAccessToken || (verifyRes.data as any)?.token;
              if (invToken) {
                setGuestInvoiceToken(invToken);
                try {
                  sessionStorage.setItem(`tekdoctor_inv_token_${trackingData.id}`, invToken);
                } catch {}
              }
              toast.success('Payment verified successfully! Thank you.');
              await fetchTicketStatus(ticketId || trackingData.ticketNumber || String(trackingData.id), true);
            } else {
              toast.error(verifyRes.error || 'Sir, your payment could not be completed and has failed. Please try again.');
            }
          } catch (verErr: any) {
            toast.error(verErr?.message || 'Sir, your payment could not be completed and has failed. Please try again.');
          } finally {
            setIsPaying(false);
          }
        },
        onDismiss: async () => {
          setIsPaying(false);
          try {
            await billingApi.reportPaymentFailure({
              orderId: orderData.orderId,
              ticketId: trackingData.id,
              reason: 'Payment modal closed by user',
              status: 'cancelled'
            }, token);
          } catch { }
        },
        onPaymentError: async (pErr) => {
          setIsPaying(false);
          const errorMsg = pErr?.description || pErr?.message || 'Payment processing failed.';
          try {
            await billingApi.reportPaymentFailure({
              orderId: orderData.orderId,
              ticketId: trackingData.id,
              reason: errorMsg,
              status: 'failed'
            }, token);
          } catch { }
          toast.error('Sir, your payment could not be completed and has failed. Please try again.');
        }
      });
    } catch (err: any) {
      setIsPaying(false);
      toast.error(err.message || 'Sir, your payment could not be completed and has failed. Please try again.');
    }
  };

  const handleDownloadBill = async () => {
    if (!trackingData) return;
    setIsDownloadingBill(true);
    const toastId = toast.loading('Preparing official PDF bill...');
    try {
      let tokenToUse = token || guestInvoiceToken || effectiveToken;
      if (!tokenToUse && trackingData.id) {
        try {
          tokenToUse = sessionStorage.getItem(`tekdoctor_inv_token_${trackingData.id}`);
        } catch {}
      }
      const res = await billingApi.getPaymentReceiptByTicket(trackingData.id, tokenToUse);
      if (res.ok && res.data?.data) {
        await downloadPaymentBillPdf(res.data.data);
        toast.success('Bill downloaded successfully!', { id: toastId });
      } else {
        toast.error(res.error || 'Could not retrieve payment bill data.', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate bill PDF.', { id: toastId });
    } finally {
      setIsDownloadingBill(false);
    }
  };

  const handleWorkflowStepClick = (stepKey: WorkflowStepKey) => {
    if (stepKey === 'device') {
      const el = document.getElementById('device-info-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (stepKey === 'priority') {
      const el = document.getElementById('diagnosis-estimate-section') || document.getElementById('technician-notes-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (stepKey === 'payment') {
      const isPaid = trackingData?.paymentStatus === 'paid' || trackingData?.payment_status === 'paid';
      const isCompleted = trackingData?.status === 'completed' || trackingData?.status === 'delivered';
      const hasCost = Number(trackingData?.repairCost || trackingData?.repair_cost || 0) > 0;
      const isApproved = trackingData?.customerApprovalStatus === 'approved';
      const isInvoiceDraft = Boolean(trackingData?.isInvoiceDraft || trackingData?.invoiceStatus === 'Draft');
      const isInvoiceFinal = Boolean(trackingData?.isInvoiceFinal || trackingData?.invoiceStatus === 'Final');

      if (!isPaid && isCompleted && hasCost && isApproved && isInvoiceFinal && !isInvoiceDraft) {
        setShowPaymentMethodModal(true);
      } else {
        const el = document.getElementById('payment-lifecycle-section');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else if (stepKey === 'details') {
      const isPaid = trackingData?.paymentStatus === 'paid' || trackingData?.payment_status === 'paid';
      if (isPaid) {
        handleDownloadBill();
      } else {
        const el = document.getElementById('payment-lifecycle-section');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId.trim()) return;
    fetchTicketStatus(ticketId);
  };

  return (
    <section className="w-full bg-black py-8 sm:py-12 md:py-16 px-3 sm:px-6 lg:px-8 border-t border-zinc-900 overflow-x-hidden">
      <div className="w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl 3xl:max-w-7xl mx-auto">

        {/* Tracker Input Card */}
        <div className="bg-zinc-900/40 border border-zinc-800 p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl backdrop-blur-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Search size={120} />
          </div>

          <div className="relative z-10 text-center mb-8 sm:mb-10">
            {isAuthenticated && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-center gap-2 mb-4 sm:mb-6 flex-wrap"
              >
                <div className="px-2 py-0.5 rounded border border-neon-cyan/30 bg-neon-cyan/5">
                  <span className="text-[9px] font-mono text-neon-cyan uppercase tracking-widest">Authorized_Link</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Welcome, {user?.name}</span>
              </motion.div>
            )}
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tighter text-white mb-2">
              Track Your <span className="text-neon-cyan">Repair</span>
            </h2>
            <p className="text-zinc-500 text-xs sm:text-sm font-mono uppercase tracking-wider sm:tracking-widest">
              Enter your ticket id provided at the counter
            </p>
          </div>

          <form onSubmit={handleSearch} className="relative z-10 max-w-md mx-auto flex flex-col sm:flex-row gap-2.5 sm:gap-3">
            <div className="flex-grow relative w-full">
              <input
                type="text"
                placeholder="Ex: TD-001-01, CMP-001-001"
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
                className="w-full bg-black border border-zinc-700 rounded-xl px-4 sm:px-5 py-3.5 sm:py-4 text-white text-sm sm:text-base focus:outline-none focus:border-neon-cyan transition-all font-mono uppercase tracking-wider sm:tracking-widest"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="w-full sm:w-auto shrink-0 bg-neon-cyan hover:bg-white text-black px-6 py-3.5 sm:py-4 rounded-xl font-black uppercase tracking-tighter transition-all disabled:opacity-50 text-sm sm:text-base flex items-center justify-center min-h-[48px] cursor-pointer"
            >
              {isSearching ? 'Analyzing...' : 'Check Status'}
            </button>
          </form>

          {/* History Button (if logged in and has history) */}
          {isAuthenticated && history.length > 0 && (
            <div className="flex justify-center mt-6 relative z-10">
              <button
                onClick={() => setShowHistoryModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-700/50 hover:border-neon-cyan/50 hover:bg-zinc-800 rounded-lg text-xs font-mono text-neon-cyan uppercase tracking-widest transition-all cursor-pointer"
              >
                <History size={14} /> My Repair History
              </button>
            </div>
          )}

          {searchError && (
            <div className="text-center mt-6 p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-sm font-mono rounded-xl max-w-md mx-auto">
              {searchError}
            </div>
          )}

          <AnimatePresence>
            {showStatus && trackingData && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-8 sm:mt-12 pt-8 sm:pt-10 border-t border-zinc-800/50"
              >
                {/* Prominent Current Status Banner */}
                <div className="mb-6 sm:mb-8 p-4 sm:p-6 bg-gradient-to-r from-zinc-950 via-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-2xl sm:rounded-3xl relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-cyan via-emerald-400 to-neon-cyan" />
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1.5 w-full sm:w-auto min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] sm:text-xs font-mono font-bold text-zinc-400">CURRENT_STATUS:</span>
                        <span className={`px-3 py-1 rounded-full text-[11px] sm:text-xs font-mono font-bold uppercase tracking-wider border flex items-center gap-1.5 shrink-0 ${
                          trackingData.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(52,211,153,0.2)]'
                            : trackingData.status === 'delivered'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.25)]'
                              : trackingData.status === 'in_progress'
                                ? 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/30 shadow-[0_0_12px_rgba(var(--neon-cyan-rgb),0.25)]'
                                : trackingData.status === 'cancelled'
                                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>
                          {trackingData.status === 'completed' ? <CheckCircle2 size={12} /> :
                           trackingData.status === 'delivered' ? <CheckCircle2 size={12} /> :
                           trackingData.status === 'in_progress' ? <Wrench size={12} className="animate-spin" /> :
                           trackingData.status === 'cancelled' ? <AlertTriangle size={12} /> :
                           <Clock size={12} />}
                          {trackingData.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-lg sm:text-xl md:text-2xl font-bold font-outfit text-white break-words">
                        Ticket {trackingData.ticketNumber || `#${trackingData.id}`}
                      </p>
                      <p className="text-xs font-mono text-zinc-500 break-words">
                        Assigned Engineer: <span className="text-zinc-300 font-semibold">{trackingData.technicianName || trackingData.assignedTechnicianName || 'Pending Assignment'}</span>
                      </p>
                    </div>

                    <div className="flex flex-col sm:items-end gap-1.5 w-full sm:w-auto shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-zinc-800/60">
                      <button
                        onClick={() => fetchTicketStatus(ticketId || trackingData.ticketNumber || String(trackingData.id), true)}
                        disabled={isRefreshing}
                        className="w-full sm:w-auto px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-neon-cyan/50 text-xs font-mono text-neon-cyan rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50 min-h-[40px]"
                      >
                        <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                        {isRefreshing ? 'Refreshing...' : 'Refresh Status'}
                      </button>
                      <span className="text-[10px] font-mono text-zinc-500 sm:text-right">
                        Last checked: {new Date().toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 4-Step Progressive Workflow Bar */}
                <div className="mb-8 sm:mb-10 w-full overflow-hidden">
                  <RepairStepProgress
                    ticket={trackingData}
                    onStepClick={handleWorkflowStepClick}
                  />
                </div>

                {/* User & Device Metadata Summary — 1 col on mobile, 2 col on tablet, 4 col on xl/2xl/3xl */}
                <div id="device-info-section" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-4">
                  {/* Item 1: Device Category */}
                  <div className="bg-black/40 border border-zinc-800/50 p-3.5 sm:p-5 rounded-xl sm:rounded-2xl flex items-start gap-3 sm:gap-4 group hover:border-neon-cyan/30 transition-all min-w-0 overflow-hidden">
                    <div className="p-2.5 sm:p-3 bg-zinc-900 border border-zinc-800 rounded-lg sm:rounded-xl text-neon-cyan group-hover:scale-110 transition-transform shrink-0 mt-0.5">
                      <Cpu size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em] mb-0.5">Device_Category</p>
                      <p className="text-xs sm:text-sm font-bold text-zinc-200 break-words">
                        {trackingData.deviceCategory?.toLowerCase() === 'other' && trackingData.customDeviceCategory
                          ? `Other — ${trackingData.customDeviceCategory}`
                          : (trackingData.deviceCategory || 'General Hardware')}
                      </p>
                    </div>
                  </div>

                  {/* Item 2: Asset Ident */}
                  <div className="bg-black/40 border border-zinc-800/50 p-3.5 sm:p-5 rounded-xl sm:rounded-2xl flex items-start gap-3 sm:gap-4 group hover:border-neon-cyan/30 transition-all min-w-0 overflow-hidden">
                    <div className="p-2.5 sm:p-3 bg-zinc-900 border border-zinc-800 rounded-lg sm:rounded-xl text-neon-cyan group-hover:scale-110 transition-transform shrink-0 mt-0.5">
                      <Clock size={18} className="animate-pulse" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em] mb-0.5">Asset_Ident</p>
                      <p className="text-xs sm:text-sm font-bold text-neon-cyan break-words">{trackingData.brand} {trackingData.modelNumber || ''}</p>
                    </div>
                  </div>

                  {/* Item 3: Serial Number */}
                  <div className="bg-black/40 border border-zinc-800/50 p-3.5 sm:p-5 rounded-xl sm:rounded-2xl flex items-start gap-3 sm:gap-4 group hover:border-neon-cyan/30 transition-all min-w-0 overflow-hidden">
                    <div className="p-2.5 sm:p-3 bg-zinc-900 border border-zinc-800 rounded-lg sm:rounded-xl text-neon-cyan group-hover:scale-110 transition-transform shrink-0 mt-0.5">
                      <Hash size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em] mb-0.5">Serial_Number</p>
                      <p className="text-xs sm:text-sm font-bold text-zinc-200 break-all font-mono">{trackingData.serialNumber || 'N/A'}</p>
                    </div>
                  </div>

                  {/* Item 4: Configuration */}
                  <div className="bg-black/40 border border-zinc-800/50 p-3.5 sm:p-5 rounded-xl sm:rounded-2xl flex items-start gap-3 sm:gap-4 group hover:border-neon-cyan/30 transition-all min-w-0 overflow-hidden">
                    <div className="p-2.5 sm:p-3 bg-zinc-900 border border-zinc-800 rounded-lg sm:rounded-xl text-neon-cyan group-hover:scale-110 transition-transform shrink-0 mt-0.5">
                      <Settings size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em] mb-0.5">Configuration</p>
                      <p className="text-xs sm:text-sm font-bold text-zinc-200 break-words leading-snug">{trackingData.deviceConfiguration || 'Standard / Factory Specs'}</p>
                    </div>
                  </div>
                </div>

                {/* Problem Reported section (standalone full-width) */}
                {trackingData.problemDescription && (
                  <div className="bg-black/40 border border-zinc-800/50 p-4 sm:p-5 rounded-xl sm:rounded-2xl flex items-start gap-3 sm:gap-4 group hover:border-neon-cyan/30 transition-all min-w-0 overflow-hidden mb-8 sm:mb-12">
                    <div className="p-2.5 sm:p-3 bg-zinc-900 border border-zinc-800 rounded-lg sm:rounded-xl text-neon-cyan group-hover:scale-110 transition-transform shrink-0 mt-0.5">
                      <Wrench size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em]">Problem_Reported</p>
                        {trackingData.problemType && (
                          <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-[9px] font-mono text-zinc-400 uppercase">
                            {trackingData.problemType}
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-zinc-300 break-words leading-relaxed whitespace-pre-wrap">{trackingData.problemDescription}</p>
                    </div>
                  </div>
                )}

                {/* Technician Notes for Customer */}
                <div id="technician-notes-section" className="mt-8 sm:mt-10 space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <History size={14} className="text-zinc-600" />
                    <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Technician_Notes</span>
                  </div>

                  {trackingData.customerRepairDescription ? (
                    <div className="p-4 sm:p-5 bg-neon-cyan/5 border border-neon-cyan/20 rounded-xl sm:rounded-2xl">
                      <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">{trackingData.customerRepairDescription}</p>
                    </div>
                  ) : (
                    <div className="p-4 border border-zinc-800/50 rounded-xl sm:rounded-2xl">
                      <p className="text-xs font-mono text-zinc-600 italic">No technician notes have been added yet. Check back after your device has been assessed.</p>
                    </div>
                  )}
                </div>

                {/* Customer Attachments Section */}
                {(trackingData.imagePath || trackingData.screenshotPath) && (
                  <div className="mt-8 sm:mt-10 space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Image size={14} className="text-zinc-650" />
                      <span className="text-[10px] font-mono text-zinc-650 uppercase tracking-widest">Customer_Attachments</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                      {trackingData.imagePath && (
                        <div className="border border-zinc-900 bg-zinc-950/40 rounded-xl p-3 flex flex-col gap-2 group hover:border-zinc-800 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-400 font-semibold font-mono flex items-center gap-1.5">
                              <FileImage size={13} className="text-neon-cyan" /> DEVICE_PHOTO
                            </span>
                            <span className="text-[9px] font-mono text-zinc-600 uppercase">Click to preview</span>
                          </div>
                          <div className="h-32 w-full overflow-hidden bg-black rounded-lg border border-zinc-900/80 flex items-center justify-center cursor-pointer" onClick={() => handleImagePreview(getFileUrl(trackingData.imagePath)!, 'Device Photo')}>
                            <img
                              src={getFileUrl(trackingData.imagePath)!}
                              alt="Device"
                              className="max-h-full max-w-full object-contain transition-transform duration-300 hover:scale-105"
                            />
                          </div>
                        </div>
                      )}
                      {trackingData.screenshotPath && (
                        <div className="border border-zinc-900 bg-zinc-950/40 rounded-xl p-3 flex flex-col gap-2 group hover:border-zinc-800 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-400 font-semibold font-mono flex items-center gap-1.5">
                              <FileImage size={13} className="text-neon-cyan" /> SCREENSHOT
                            </span>
                            <span className="text-[9px] font-mono text-zinc-600 uppercase">Click to preview</span>
                          </div>
                          <div className="h-32 w-full overflow-hidden bg-black rounded-lg border border-zinc-900/80 flex items-center justify-center cursor-pointer" onClick={() => handleImagePreview(getFileUrl(trackingData.screenshotPath)!, 'Screenshot')}>
                            <img
                              src={getFileUrl(trackingData.screenshotPath)!}
                              alt="Screenshot"
                              className="max-h-full max-w-full object-contain transition-transform duration-300 hover:scale-105"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Diagnosis & Estimate Workflow Section */}
                {(trackingData.diagnosis || (trackingData.estimatedCost > 0) || trackingData.customerApprovalStatus === 'pending_approval') && (
                  <div id="diagnosis-estimate-section" className="mt-6 sm:mt-8 bg-zinc-950/80 border border-zinc-800/80 rounded-2xl sm:rounded-3xl p-4 sm:p-6 relative overflow-hidden">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 shrink-0">
                          <Wrench size={18} />
                        </div>
                        <div>
                          <h4 className="text-white font-bold text-sm sm:text-base tracking-wide">
                            Engineer Diagnosis & Cost Estimate
                          </h4>
                          <p className="text-[11px] sm:text-xs font-mono text-zinc-500">
                            Technical assessment conducted by TekDoctor Engineering Team
                          </p>
                        </div>
                      </div>

                      {/* Customer Approval Badge */}
                      {trackingData.customerApprovalStatus === 'approved' && (
                        <span className="px-3 py-1 rounded-full text-[11px] sm:text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shrink-0">
                          <CheckCheck size={14} /> Estimate Approved
                        </span>
                      )}
                      {trackingData.customerApprovalStatus === 'rejected' && (
                        <span className="px-3 py-1 rounded-full text-[11px] sm:text-xs font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 shrink-0">
                          <X size={14} /> Estimate Declined
                        </span>
                      )}
                      {trackingData.customerApprovalStatus === 'pending_approval' && (
                        <span className="px-3 py-1 rounded-full text-[11px] sm:text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 animate-pulse shrink-0">
                          <Clock size={14} /> Approval Required
                        </span>
                      )}
                      {trackingData.customerApprovalStatus === 'on_hold' && (
                        <span className="px-3 py-1 rounded-full text-[11px] sm:text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 shrink-0">
                          <Clock size={14} /> On Hold (Reconsideration Window)
                        </span>
                      )}
                      {trackingData.customerApprovalStatus === 'reapproval_requested' && (
                        <span className="px-3 py-1 rounded-full text-[11px] sm:text-xs font-mono font-bold bg-sky-500/10 text-sky-400 border border-sky-500/30 flex items-center gap-1.5 shrink-0">
                          <RefreshCw size={14} className="animate-spin" /> Re-evaluation Requested
                        </span>
                      )}
                      {trackingData.customerApprovalStatus === 'auto_cancelled' && (
                        <span className="px-3 py-1 rounded-full text-[11px] sm:text-xs font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 shrink-0">
                          <X size={14} /> Hold Expired / Cancelled
                        </span>
                      )}
                    </div>

                    {/* Prominent Notice distinguishing Approximate Budget from Final Payment */}
                    <div className="mb-4 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl sm:rounded-2xl flex items-start gap-3">
                      <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-amber-200/90 font-sans leading-relaxed">
                          <strong className="text-amber-300 font-mono uppercase tracking-wider text-[11px] block sm:inline sm:mr-1.5">Original Repair Estimate (Technician) (Without GST):</strong>
                          This is an approximate repair estimate provided by the technician for approval purposes. It is not the final invoice. The final amount may vary based on actual parts, services, technician/service charges, and applicable taxes after repair completion.
                        </p>
                        {trackingData.estimatedCompletionDate && (
                          <p className="text-[11px] font-mono text-zinc-400 mt-1 flex items-center gap-1.5">
                            <Clock size={12} className="text-neon-cyan" />
                            Target Completion: <span className="text-neon-cyan font-bold">{new Date(trackingData.estimatedCompletionDate).toLocaleDateString()}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Findings & Work Breakdown */}
                    <div className="space-y-3 bg-zinc-900/40 border border-zinc-800/60 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 mb-5 text-sm">
                      {trackingData.diagnosis && (
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
                            Primary Diagnosis
                          </span>
                          <p className="text-zinc-200 leading-relaxed font-sans text-xs sm:text-sm break-words">{trackingData.diagnosis}</p>
                        </div>
                      )}

                      {trackingData.identifiedIssues && (
                        <div className="pt-2 border-t border-zinc-800/60">
                          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
                            Identified Hardware / Component Faults
                          </span>
                          <p className="text-zinc-300 font-sans text-xs sm:text-sm break-words">{trackingData.identifiedIssues}</p>
                        </div>
                      )}

                      {trackingData.requiredParts && (
                        <div className="pt-2 border-t border-zinc-800/60">
                          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
                            Required Replacement Parts
                          </span>
                          <p className="text-neon-cyan font-mono text-xs break-words">{trackingData.requiredParts}</p>
                        </div>
                      )}
                    </div>

                    {/* Estimate Financials */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 p-3.5 sm:p-4 bg-black/50 border border-zinc-800 rounded-xl sm:rounded-2xl mb-5">
                      <div className="min-w-0 pb-3 sm:pb-0 border-b sm:border-b-0 sm:border-r border-zinc-800/80 sm:pr-3">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">Base Estimate</span>
                        <span className="text-base sm:text-lg font-bold font-mono text-zinc-300 block my-0.5">
                          ₹{Number(trackingData.estimatedCost || 0).toFixed(2)}
                        </span>
                        <p className="text-[10px] text-zinc-500 font-sans leading-tight mt-1">
                          Initial estimated repair and diagnostic charge.
                        </p>
                      </div>
                      <div className="min-w-0 py-3 sm:py-0 border-b sm:border-b-0 sm:border-r border-zinc-800/80 sm:px-3">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">Additional Charges</span>
                        <span className="text-base sm:text-lg font-bold font-mono text-zinc-300 block my-0.5">
                          ₹{Number(trackingData.additionalCharges || 0).toFixed(2)}
                        </span>
                        <p className="text-[10px] text-zinc-500 font-sans leading-tight mt-1">
                          Component parts and extended work identified during service.
                        </p>
                      </div>
                      <div className="min-w-0 pt-3 sm:pt-0 sm:pl-3">
                        <span className="text-[10px] font-mono text-amber-400 uppercase tracking-widest block">Approximate Estimate (No GST)</span>
                        <span className="text-lg sm:text-xl font-black font-mono text-amber-400 block my-0.5">
                          ₹{Number(trackingData.repairCost || (trackingData.estimatedCost + trackingData.additionalCharges) || 0).toFixed(2)}
                        </span>
                        <p className="text-[10px] text-zinc-400 font-sans leading-tight mt-1">
                          Approximate budget for customer approval. Final commercial invoice generated after completion.
                        </p>
                      </div>
                    </div>

                    {/* Action buttons if approval required */}
                    {trackingData.customerApprovalStatus === 'pending_approval' && (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 pt-2">
                        <button
                          onClick={handleApproveEstimate}
                          disabled={isApprovingEstimate || isRejectingEstimate || isSubmittingRevision}
                          className="w-full sm:w-auto flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 min-h-[46px]"
                        >
                          {isApprovingEstimate ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Check size={16} />
                          )}
                          Approve Estimate & Proceed With Repair
                        </button>
                        <button
                          onClick={() => setShowRevisionModal(true)}
                          disabled={isApprovingEstimate || isRejectingEstimate || isSubmittingRevision}
                          className="w-full sm:w-auto px-5 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-neon-cyan border border-neon-cyan/30 hover:border-neon-cyan/60 font-mono text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[46px]"
                        >
                          <RefreshCw size={13} />
                          Request Revision
                        </button>
                        <button
                          onClick={() => setShowRejectModal(true)}
                          disabled={isApprovingEstimate || isRejectingEstimate || isSubmittingRevision}
                          className="w-full sm:w-auto px-5 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-rose-400 border border-rose-500/30 hover:border-rose-500/60 font-mono text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer disabled:opacity-50 min-h-[46px]"
                        >
                          Decline Estimate
                        </button>
                      </div>
                    )}

                    {(trackingData.customerApprovalStatus === 'rejected' || trackingData.customerApprovalStatus === 'on_hold') && (
                      <div className="space-y-3 p-3.5 sm:p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl sm:rounded-2xl">
                        <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <AlertTriangle size={16} className="text-rose-400 shrink-0" />
                              <h5 className="text-xs font-bold font-mono text-rose-300 uppercase tracking-wider">
                                Estimate Declined — Device On Temporary Hold
                              </h5>
                            </div>
                            <p className="text-xs text-zinc-300 font-sans leading-relaxed">
                              You declined this quotation. The technician has paused work on your device. You can request a re-evaluation or reconsider before the hold period expires.
                            </p>
                            {(trackingData.rejectionReason || trackingData.holdReason) && (
                              <p className="text-xs font-mono text-rose-200/90 pt-1">
                                <span className="text-zinc-400">Feedback provided:</span> "{trackingData.rejectionReason || trackingData.holdReason}"
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => setShowRevisionModal(true)}
                            className="w-full sm:w-auto px-4 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-mono text-xs font-bold rounded-xl transition-colors border border-rose-500/40 cursor-pointer flex items-center justify-center gap-1.5 shrink-0 min-h-[40px]"
                          >
                            <RefreshCw size={13} />
                            Request Re-evaluation / Reconsider
                          </button>
                        </div>

                        {trackingData.holdEndDate && (
                          <div className="pt-2 border-t border-rose-500/20 flex items-center gap-2 text-[11px] font-mono text-amber-300">
                            <Clock size={13} className="shrink-0" />
                            <span>
                              Hold Deadline: <strong className="text-amber-200">{new Date(trackingData.holdEndDate).toLocaleString()}</strong> — If not approved or re-evaluated by this date, the ticket will auto-cancel.
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {trackingData.customerApprovalStatus === 'reapproval_requested' && (
                      <div className="p-4 bg-sky-500/10 border border-sky-500/30 rounded-2xl flex items-start gap-3">
                        <RefreshCw size={18} className="text-sky-400 shrink-0 mt-0.5 animate-spin" />
                        <div className="space-y-1">
                          <h5 className="text-xs font-bold font-mono text-sky-300 uppercase tracking-wider">
                            Re-evaluation In Review
                          </h5>
                          <p className="text-xs text-zinc-300 font-sans leading-relaxed">
                            You requested re-evaluation for this device. The technician and service team are reviewing your feedback and will update the estimate shortly.
                          </p>
                          {trackingData.reapprovalNotes && (
                            <p className="text-xs font-mono text-sky-200/90 pt-1">
                              <span className="text-zinc-400">Your note:</span> "{trackingData.reapprovalNotes}"
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {trackingData.customerApprovalStatus === 'auto_cancelled' && (
                      <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-2xl flex items-center gap-3">
                        <AlertTriangle size={18} className="text-rose-400 shrink-0" />
                        <div>
                          <h5 className="text-xs font-bold font-mono text-rose-300 uppercase tracking-wider">
                            Hold Window Expired — Ticket Closed
                          </h5>
                          <p className="text-xs text-zinc-400 font-sans leading-relaxed">
                            The hold window for this quotation expired without confirmation. The service request was automatically closed. If you still need service, you can submit a new repair request.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Real Payment Lifecycle Section */}
                <div id="payment-lifecycle-section">
                {trackingData.paymentStatus === 'paid' || trackingData.payment_status === 'paid' ? (
                  /* Case A: Payment Settled & Cleared */
                  <div className="mt-6 sm:mt-8 bg-gradient-to-r from-emerald-950/40 via-zinc-900/60 to-zinc-950 border border-emerald-500/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none text-emerald-400">
                      <ShieldCheck size={100} />
                    </div>

                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                            <CheckCircle2 size={20} />
                          </span>
                          <div>
                            <h4 className="text-white font-bold text-sm sm:text-base tracking-wide flex items-center gap-2 flex-wrap">
                              <span>Payment Settled & Cleared</span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                Verified
                              </span>
                            </h4>
                            <p className="text-xs font-mono text-zinc-400 break-words">
                              {((trackingData.paymentMethod || '').toLowerCase() === 'cash' || String(trackingData.paymentId || trackingData.payment_id || '').startsWith('PAY-CASH')) ? (
                                <>Cash Payment Reference: <span className="text-emerald-400 font-bold">{trackingData.paymentId || trackingData.payment_id || 'RECORDED'}</span></>
                              ) : ((trackingData.paymentMethod || '').toLowerCase() === 'bank_transfer' || (trackingData.paymentMethod || '').toLowerCase() === 'offline_upi' || String(trackingData.paymentId || trackingData.payment_id || '').startsWith('PAY-BANK') || String(trackingData.paymentId || trackingData.payment_id || '').startsWith('PAY-UPI')) ? (
                                <>Offline Transfer Reference: <span className="text-emerald-400 font-bold">{trackingData.paymentId || trackingData.payment_id || 'VERIFIED'}</span></>
                              ) : (
                                <>Gateway Transaction ID: <span className="text-emerald-400 font-bold">{trackingData.paymentId || trackingData.payment_id || 'VERIFIED-GATEWAY'}</span></>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-zinc-400 pt-1">
                          <span>Amount Settled: <strong className="text-white font-bold">₹{Number(trackingData.repairCost || trackingData.repair_cost || 0).toFixed(2)}</strong></span>
                          <span>Method: <strong className="text-zinc-300">{trackingData.paymentMethod || 'Online Gateway'}</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                        <button
                          onClick={handleDownloadBill}
                          disabled={isDownloadingBill}
                          className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-black uppercase text-xs tracking-widest py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 min-h-[46px]"
                        >
                          {isDownloadingBill ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Download size={16} />
                          )}
                          Download Tax Invoice (PDF)
                        </button>
                      </div>
                    </div>
                  </div>
                ) : trackingData.paymentStatus === 'pending_verification' || trackingData.payment_status === 'pending_verification' ? (
                  /* Case B: Offline Payment Pending Verification */
                  <div className="mt-6 sm:mt-8 bg-gradient-to-r from-amber-950/40 via-zinc-900/60 to-zinc-950 border border-amber-500/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none text-amber-400">
                      <Clock size={100} />
                    </div>

                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                            <Clock size={20} />
                          </span>
                          <div>
                            <h4 className="text-white font-bold text-sm sm:text-base tracking-wide flex items-center gap-2 flex-wrap">
                              <span>
                                {trackingData.collectionStatus === 'collected'
                                  ? 'Cash Collected — Pending Verification'
                                  : 'Offline Payment — Pending Verification'}
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse">
                                Under Review
                              </span>
                            </h4>
                            <p className="text-xs font-mono text-zinc-400 break-words">
                              Ticket #{trackingData.ticketNumber || trackingData.id} • Payable Amount: <span className="text-amber-400 font-bold font-mono">₹{Number(trackingData.repairCost || trackingData.repair_cost || trackingData.estimatedCost || 0).toFixed(2)}</span>
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-400 font-mono leading-relaxed">
                          {trackingData.collectionStatus === 'collected'
                            ? 'Cash has been collected by your assigned technician. TekDoctor Accounts is completing the clearance verification. Your official Tax Invoice will be unlocked immediately upon admin approval.'
                            : ((trackingData.paymentMethod || trackingData.payment_method || '').toLowerCase() === 'cash')
                            ? 'Cash collection has been requested. If cash has not been collected yet, you can switch to Instant Online Payment via Razorpay at any time.'
                            : `Your offline payment details (${trackingData.paymentMethod || 'Offline Payment'}) have been submitted and are being verified by our accounts department. Your Tax Invoice will be ready once approved.`}
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto shrink-0">
                        {((trackingData.paymentMethod || trackingData.payment_method || '').toLowerCase() === 'cash' && trackingData.collectionStatus !== 'collected') && (
                          <button
                            type="button"
                            onClick={() => setShowPaymentMethodModal(true)}
                            className="w-full sm:w-auto bg-gradient-to-r from-neon-cyan to-blue-500 hover:from-white hover:to-neon-cyan text-black font-black uppercase text-xs tracking-widest py-2.5 px-4 rounded-xl transition-all shadow-lg shadow-neon-cyan/20 flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
                          >
                            <CreditCard size={15} />
                            Pay Online Instead
                          </button>
                        )}
                        <button
                          onClick={() => fetchTicketStatus(ticketId || trackingData.ticketNumber || String(trackingData.id), true)}
                          disabled={isRefreshing}
                          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[44px]"
                        >
                          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                          Check Verification Status
                        </button>
                      </div>
                    </div>
                  </div>
                ) : trackingData.paymentStatus === 'rejected' || trackingData.payment_status === 'rejected' ? (
                  /* Case C: Offline Payment Rejected */
                  <div className="mt-6 sm:mt-8 bg-gradient-to-r from-rose-950/40 via-zinc-900/60 to-zinc-950 border border-rose-500/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none text-rose-400">
                      <AlertTriangle size={100} />
                    </div>

                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                            <X size={20} />
                          </span>
                          <div>
                            <h4 className="text-white font-bold text-sm sm:text-base tracking-wide flex items-center gap-2 flex-wrap">
                              <span>Payment Verification Rejected</span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40">
                                Action Required
                              </span>
                            </h4>
                            <p className="text-xs font-mono text-zinc-400 break-words">
                              Ticket #{trackingData.ticketNumber || trackingData.id} • Payable Amount: <span className="text-rose-400 font-bold font-mono">₹{Number(trackingData.repairCost || trackingData.repair_cost || trackingData.estimatedCost || 0).toFixed(2)}</span>
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-rose-300 font-mono leading-relaxed">
                          The previous offline payment verification was not approved. You can switch to Instant Online Payment via Razorpay, or re-submit offline payment details.
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto shrink-0">
                        <button
                          onClick={() => setShowPaymentMethodModal(true)}
                          className="w-full sm:w-auto bg-gradient-to-r from-neon-cyan to-blue-500 hover:from-white hover:to-neon-cyan text-black font-black uppercase text-xs tracking-widest py-3 px-5 rounded-xl transition-all shadow-lg shadow-neon-cyan/20 flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
                        >
                          <CreditCard size={16} />
                          Pay Online Instead
                        </button>
                        <button
                          onClick={() => setShowPaymentMethodModal(true)}
                          className="w-full sm:w-auto px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[44px]"
                        >
                          <RefreshCw size={14} />
                          Re-submit Offline Payment
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (trackingData.status === 'completed' || trackingData.status === 'delivered') ? (
                  (trackingData.isInvoiceDraft || trackingData.invoiceStatus === 'Draft' || !trackingData.isInvoiceFinal) ? (
                    /* Case D1: Repair Completed, Commercial Invoice in Administrative Review */
                    <div className="mt-6 sm:mt-8 bg-gradient-to-r from-amber-950/30 via-zinc-900/60 to-zinc-950 border border-amber-500/30 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none text-amber-400">
                        <Clock size={100} />
                      </div>

                      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                              <Clock size={20} className="animate-pulse" />
                            </div>
                            <div>
                              <h4 className="text-white font-bold text-sm sm:text-base tracking-wide flex items-center gap-2 flex-wrap">
                                <span>Repair Servicing Completed — Commercial Bill in Review</span>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
                                  Administrative Review
                                </span>
                              </h4>
                              <p className="text-xs font-mono text-zinc-400 break-words">
                                Ticket #{trackingData.ticketNumber || trackingData.id} • Servicing Completed
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-zinc-300 font-mono leading-relaxed">
                            Your device servicing has concluded. Our accounts department is currently reviewing and finalizing your commercial tax invoice. The final bill and online payment options will become available as soon as the invoice is released by administration.
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => fetchTicketStatus(ticketId || trackingData.ticketNumber || String(trackingData.id), true)}
                            disabled={isRefreshing}
                            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[44px]"
                          >
                            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                            Check Release Status
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Case D2: Repair Completed & Invoice Finalized, Ready for Settlement */
                    <div className="mt-6 sm:mt-8 bg-gradient-to-r from-neon-cyan/15 via-zinc-900/60 to-zinc-950 border border-neon-cyan/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none text-neon-cyan">
                        <CreditCard size={100} />
                      </div>

                      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30 shrink-0">
                              <CreditCard size={20} />
                            </div>
                            <div>
                              <h4 className="text-white font-bold text-sm sm:text-base tracking-wide flex items-center gap-2 flex-wrap">
                                <span>Repair Completed — Final Invoice Released</span>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40 animate-pulse">
                                  Ready for Settlement
                                </span>
                              </h4>
                              <p className="text-xs font-mono text-zinc-400 break-words">
                                Ticket #{trackingData.ticketNumber || trackingData.id} • Authoritative Amount: <span className="text-neon-cyan font-bold font-mono">₹{Number(trackingData.repairCost || trackingData.repair_cost || trackingData.estimatedCost || 0).toFixed(2)}</span>
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-zinc-400 font-mono leading-relaxed">
                            Official commercial invoice has been issued. Settle online via Razorpay or offline via Cash, Bank Transfer, or UPI.
                          </p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto shrink-0">
                          <button
                            onClick={() => setShowPaymentMethodModal(true)}
                            disabled={isPaying}
                            className="w-full sm:w-auto bg-gradient-to-r from-neon-cyan to-blue-500 hover:from-white hover:to-neon-cyan text-black font-black uppercase text-xs tracking-widest py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-neon-cyan/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 min-h-[46px]"
                          >
                            <CreditCard size={16} />
                            Pay ₹{Number(trackingData.repairCost || trackingData.repair_cost || trackingData.estimatedCost || 0).toFixed(2)}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  /* Case E: In-Progress / Diagnostics — Payment Policy Info */
                  <div className="mt-6 sm:mt-8 bg-zinc-950/60 border border-zinc-800/80 rounded-xl sm:rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-neon-cyan shrink-0">
                        <ShieldCheck size={20} />
                      </div>
                      <div>
                        <h5 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">
                          TekDoctor Payment Protection
                        </h5>
                        <p className="text-xs text-zinc-500 font-mono">
                          Payment unlocks only after our engineer completes and verifies repairs. No upfront surprise charges.
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 shrink-0 self-start sm:self-center">
                      Status: {trackingData.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                )}
                </div>

                {/* Customer Service Feedback Section (for Completed / Delivered repairs) */}
                {(trackingData.status === 'completed' || trackingData.status === 'delivered') && (
                  trackingData.feedbackRating ? (
                    <div className="mt-6 sm:mt-8 p-4 sm:p-5 bg-gradient-to-r from-yellow-950/20 via-zinc-900/60 to-zinc-950 border border-yellow-500/30 rounded-2xl sm:rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-yellow-500 uppercase tracking-wider">Your Service Feedback</span>
                          <div className="flex border-l border-yellow-500/30 pl-2">
                            {Array.from({ length: trackingData.feedbackRating }).map((_, i) => (
                              <Star key={i} size={13} className="text-yellow-400 fill-yellow-400" />
                            ))}
                          </div>
                        </div>
                        {trackingData.feedbackComment && (
                          <p className="text-xs text-zinc-300 mt-1.5 italic font-sans leading-relaxed break-words">
                            "{trackingData.feedbackComment}"
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900/80 px-3 py-1 rounded-full border border-zinc-800 shrink-0">
                        Feedback Submitted
                      </span>
                    </div>
                  ) : (
                    <div className="mt-6 sm:mt-8 p-4 sm:p-5 bg-gradient-to-r from-yellow-950/20 via-zinc-900/60 to-zinc-950 border border-yellow-500/30 rounded-2xl sm:rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <h5 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                          <Star size={15} className="text-yellow-400" /> Rate Your Service Experience
                        </h5>
                        <p className="text-xs text-zinc-400 mt-1 font-sans">
                          Your repair has been completed! Please take a moment to rate our engineer's work.
                        </p>
                      </div>
                      <button
                        onClick={() => setFeedbackOpen(true)}
                        className="w-full sm:w-auto px-5 py-3 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/10 active:scale-[0.98] min-h-[44px]"
                      >
                        <Star size={14} className="fill-black" /> Leave Feedback
                      </button>
                    </div>
                  )
                )}

                {/* <div className="mt-12 flex justify-center">
                  <button className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-neon-cyan transition-colors">
                    <ExternalLink size={12} />
                    Contact Assigned Engineer
                  </button>
                </div> */}
                {isAuthenticated && (trackingData.status === 'pending' || trackingData.status === 'submitted') && (
                  <div className="mt-4 flex justify-center border-t border-zinc-900/50 pt-4">
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-red-500/70 hover:text-red-400 transition-colors"
                    >
                      Cancel Repair Request
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* History Modal */}
        <AnimatePresence>
          {showHistoryModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl relative"
              >
                <div className="p-4 sm:p-6 border-b border-zinc-800 flex justify-between items-center bg-black/40">
                  <h3 className="text-lg sm:text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2">
                    <History size={18} className="text-neon-cyan shrink-0" /> Request History
                  </h3>
                  <button
                    onClick={() => setShowHistoryModal(false)}
                    className="p-2 text-zinc-500 hover:text-white transition-colors cursor-pointer text-xs sm:text-sm font-mono uppercase"
                  >
                    Close
                  </button>
                </div>

                <div className="p-4 sm:p-6 max-h-[70vh] overflow-y-auto space-y-3 sm:space-y-4 scrollbar-thin">
                  {history.map((req) => (
                    <div key={req.id} className="bg-black/50 border border-zinc-800/80 rounded-xl sm:rounded-2xl p-4 sm:p-5 hover:border-neon-cyan/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0 overflow-hidden">
                      <div className="min-w-0 flex-1 space-y-1.5 overflow-hidden">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono text-neon-cyan uppercase tracking-widest font-bold break-all">{req.ticketNumber || `#${req.id}`}</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-widest border shrink-0 ${
                            req.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                            req.status === 'delivered' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                            req.status === 'in_progress' ? 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/30' :
                            req.status === 'cancelled' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                            'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}>
                            {req.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm font-bold text-white break-words">{req.brand} {req.modelNumber && `(${req.modelNumber})`}</p>
                        <p className="text-xs text-zinc-400 break-words line-clamp-2 leading-relaxed">{req.problemDescription}</p>
                        {req.customerRepairDescription && (
                          <p className="text-xs text-neon-cyan/70 break-words line-clamp-2 mt-1">📝 {req.customerRepairDescription}</p>
                        )}
                      </div>
                      <div className="text-left sm:text-right shrink-0 self-start sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/60 w-full sm:w-auto flex sm:flex-col items-center sm:items-end justify-between sm:justify-center">
                        <div className="text-[10px] font-mono text-zinc-500 sm:mb-2">{new Date(req.createdAt).toLocaleDateString()}</div>
                        <button
                          onClick={() => {
                            setTicketId(req.ticketNumber || req.id.toString());
                            setShowHistoryModal(false);
                            setTimeout(() => {
                              handleSearch({ preventDefault: () => { } } as any);
                            }, 100);
                          }}
                          className="text-[10px] font-mono uppercase tracking-widest text-neon-cyan hover:text-white transition-colors flex items-center justify-end gap-1 cursor-pointer"
                        >
                          Track <ExternalLink size={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>

      {/* Cancel Confirmation Modal */}
      <AnimatePresence>
        {showCancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#0a0a0a] border border-red-500/30 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl relative"
            >
              <div className="p-4 sm:p-6 border-b border-zinc-900 flex justify-between items-center bg-black/40">
                <h3 className="text-lg sm:text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2">
                  <span className="text-red-500">Cancel Request</span>
                </h3>
                <button disabled={isCancelling} onClick={() => setShowCancelModal(false)} className="p-2 text-zinc-500 hover:text-white transition-colors cursor-pointer text-xs sm:text-sm font-mono uppercase">
                  Close
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  Are you sure you want to cancel this service request? This action cannot be undone, and you'll need to submit a new ticket if you change your mind.
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Reason for Cancellation (Optional)</label>
                    <span className="text-[10px] font-mono text-zinc-500">{cancelReason.length} / 500</span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="E.g., Secured alternative repair, device resolved itself, cost concerns."
                    className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-xs sm:text-sm text-white focus:outline-none focus:border-red-500/50 resize-none font-sans"
                  />
                </div>

                <div className="pt-2 sm:pt-4 flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                  <button
                    onClick={handleCancelRequest}
                    disabled={isCancelling}
                    className="w-full sm:flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-500 border border-red-500/30 px-4 py-3 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px]"
                  >
                    {isCancelling ? 'Processing...' : 'Confirm Cancellation'}
                  </button>
                  <button
                    onClick={() => setShowCancelModal(false)}
                    disabled={isCancelling}
                    className="w-full sm:w-auto px-6 py-3 bg-zinc-900 hover:bg-zinc-800 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-widest text-zinc-300 transition-colors flex items-center justify-center min-h-[44px]"
                  >
                    Back
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Decline Estimate Modal */}
      <AnimatePresence>
        {showRejectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#0a0a0a] border border-rose-500/30 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl relative"
            >
              <div className="p-4 sm:p-6 border-b border-zinc-900 flex justify-between items-center bg-black/40">
                <h3 className="text-lg sm:text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2">
                  <span className="text-rose-400">Decline Quotation Estimate</span>
                </h3>
                <button
                  disabled={isRejectingEstimate}
                  onClick={() => setShowRejectModal(false)}
                  className="p-2 text-zinc-500 hover:text-white transition-colors cursor-pointer text-xs sm:text-sm font-mono uppercase"
                >
                  Close
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  Declining this estimate will halt service work. Our engineering supervisor will review your feedback and reach out.
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                      Reason for Declining (Optional)
                    </label>
                    <span className="text-[10px] font-mono text-zinc-500">{rejectEstimateReason.length} / 500</span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={rejectEstimateReason}
                    onChange={(e) => setRejectEstimateReason(e.target.value)}
                    placeholder="E.g., Cost higher than expected, deciding to replace device, etc."
                    className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-xs sm:text-sm text-white focus:outline-none focus:border-rose-500/50 resize-none font-sans"
                  />
                </div>

                <div className="pt-2 sm:pt-4 flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                  <button
                    onClick={handleRejectEstimate}
                    disabled={isRejectingEstimate}
                    className="w-full sm:flex-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 px-4 py-3 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 min-h-[44px]"
                  >
                    {isRejectingEstimate ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      'Confirm Decline'
                    )}
                  </button>
                  <button
                    onClick={() => setShowRejectModal(false)}
                    disabled={isRejectingEstimate}
                    className="w-full sm:w-auto px-6 py-3 bg-zinc-900 hover:bg-zinc-800 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-widest text-zinc-300 transition-colors cursor-pointer flex items-center justify-center min-h-[44px]"
                  >
                    Back
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Feedback Modal */}
      {trackingData && (
        <CustomerFeedbackModal
          isOpen={feedbackOpen}
          onClose={() => setFeedbackOpen(false)}
          ticketId={trackingData.id}
          ticketNumber={trackingData.ticketNumber || String(trackingData.id)}
          onSuccess={() => fetchTicketStatus(ticketId || trackingData.ticketNumber || String(trackingData.id), true)}
        />
      )}

      {/* Estimate Revision & Re-evaluation Modal */}
      <PromptModal
        isOpen={showRevisionModal}
        title={trackingData?.customerApprovalStatus === 'rejected' || trackingData?.customerApprovalStatus === 'on_hold'
          ? "Request Re-evaluation & Resume Repair"
          : "Request Estimate Revision"}
        message={trackingData?.customerApprovalStatus === 'rejected' || trackingData?.customerApprovalStatus === 'on_hold'
          ? "Please provide any notes or adjustments you would like the technician to consider before resuming service:"
          : "Explain what you would like the technician to re-evaluate or revise (e.g. adjust parts, inspect alternative repair options):"}
        inputLabel="Customer Revision Note (Optional, max 500 chars):"
        placeholder="E.g. Please quote for screen replacement only without optional battery service..."
        confirmText="Submit Request"
        cancelText="Cancel"
        variant="primary"
        isLoading={isSubmittingRevision}
        onConfirm={(val) => {
          setRevisionNote(val);
          handleRequestRevision(val);
        }}
        onCancel={() => setShowRevisionModal(false)}
      />

      {/* Image Lightbox Preview Modal */}
      <ImagePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        src={previewSrc}
        alt={previewAlt}
      />

      {/* Offline & Online Payment Methods Modal */}
      {trackingData && (
        <PaymentMethodModal
          isOpen={showPaymentMethodModal}
          onClose={() => setShowPaymentMethodModal(false)}
          ticketId={trackingData.id}
          ticketNumber={trackingData.ticketNumber || String(trackingData.id)}
          amount={Number(trackingData.repairCost || trackingData.repair_cost || trackingData.estimatedCost || 0)}
          token={token || effectiveToken || null}
          customerName={trackingData.customerName || user?.name || 'Customer'}
          customerEmail={trackingData.email || user?.email}
          customerPhone={trackingData.mobile}
          onSuccess={() => {
            setShowPaymentMethodModal(false);
            fetchTicketStatus(ticketId || trackingData.ticketNumber || String(trackingData.id), true);
          }}
        />
      )}
    </section>
  );
}