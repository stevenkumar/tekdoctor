import React, { useState } from 'react';
import {
    Wrench, ArrowLeft, Laptop, Clock, ShieldCheck, MapPin, User,
    FileImage, DollarSign, Check, AlertTriangle, AlertCircle,
    Loader2, CreditCard, Download, ExternalLink, ShieldAlert,
    ChevronRight, CheckCircle2, UserCheck, Calendar, Phone, Mail,
    Building2, RefreshCw, Eye, Tag, Printer, Receipt
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSiteContext } from '../context/SiteContext';
import { repairApi, billingApi } from '../services/api';
import { triggerRazorpayCheckout } from '@/utils/payment';
import { downloadPaymentBillPdf, printPaymentBill } from '@/utils/billGenerator';
import { toast } from 'react-hot-toast';
import DeviceRepairHistoryModal from './DeviceRepairHistoryModal';
import ImagePreviewModal from './ImagePreviewModal';
import { PromptModal } from './PromptModal';
import PaymentMethodModal from './PaymentMethodModal';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { appConfig } from '@/config/appConfig';

const getFileUrl = (path: string | null) => {
    if (!path) return null;
    const base = (appConfig.apiUrl || window.location.origin).replace(/\/$/, '');
    const cleanPath = path.replace(/^\//, '');
    return `${base}/${cleanPath}`;
};

export interface RepairTicketWorkspaceProps {
    ticket: any;
    loading?: boolean;
    error?: string;
    onBack?: () => void;
    onRefresh?: () => void;
    role?: 'admin' | 'technician' | 'company';
    isDrawer?: boolean;
    onOpenFullWorkspace?: (ticketId: number) => void;
}

export const RepairTicketWorkspace: React.FC<RepairTicketWorkspaceProps> = ({
    ticket,
    loading = false,
    error,
    onBack,
    onRefresh,
    role = 'company',
    isDrawer = false,
    onOpenFullWorkspace
}) => {
    const { token, user } = useAuth();
    const { flattenedSettings } = useSiteContext();

    // Estimate Approval / Reject states
    const [isApproving, setIsApproving] = useState(false);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);
    const [revisionModalOpen, setRevisionModalOpen] = useState(false);
    const [isRequestingRevision, setIsRequestingRevision] = useState(false);

    // Media & History Sub-Modals
    const [previewSrc, setPreviewSrc] = useState<string | null>(null);
    const [previewAlt, setPreviewAlt] = useState('');
    const [historyDeviceId, setHistoryDeviceId] = useState<number | null>(null);

    // Payment states
    const [isPaying, setIsPaying] = useState(false);
    const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [viewReceiptModalOpen, setViewReceiptModalOpen] = useState(false);
    const [receiptModalData, setReceiptModalData] = useState<any>(null);
    const [isActionLoading, setIsActionLoading] = useState(false);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center space-y-4">
                <Loader2 className="w-10 h-10 animate-spin text-cyan-400" />
                <div className="text-zinc-400 font-medium">Loading repair ticket workspace...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center space-y-4 bg-[#0a0a0a] border border-rose-500/20 rounded-2xl">
                <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
                <div className="text-rose-300 font-medium">{error}</div>
                {onBack && (
                    <button
                        onClick={onBack}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
                    >
                        Back to List
                    </button>
                )}
            </div>
        );
    }

    if (!ticket) return null;

    // Normalizing properties
    const ticketId = ticket.id;
    const ticketNum = ticket.ticket_number || ticket.ticketNumber || `#${ticket.id}`;
    const status = ticket.status || 'pending';
    const priority = ticket.priority || 'Standard';
    const approvalStatus = ticket.customer_approval_status || ticket.customerApprovalStatus || 'none';
    const deviceCategory = ticket.device_category || ticket.deviceCategory || 'Device';
    const brand = ticket.brand || ticket.device_brand || 'Unknown';
    const model = ticket.model_number || ticket.modelNumber || ticket.linked_model || 'Standard';
    const serialNum = ticket.serial_number || ticket.serialNumber || ticket.linked_serial || null;
    const assetId = ticket.asset_id || ticket.assetId || null;
    const isAmc = !!(ticket.is_amc || ticket.isAmc);
    const deviceId = ticket.device_id || ticket.deviceId || null;

    const requesterName = ticket.employee_name || ticket.employeeName || ticket.customer_name || ticket.customerName || 'Staff Member';
    const requesterEmail = ticket.employee_email || ticket.employeeEmail || ticket.email || null;
    const requesterPhone = ticket.employee_phone || ticket.employeePhone || ticket.mobile || ticket.phone || null;
    const requesterDept = ticket.employee_department || ticket.employeeDepartment || null;
    const branchName = ticket.branch_name || ticket.branchName || null;

    const techName = ticket.technician_name || ticket.technicianName || ticket.assignedTechnicianName || null;
    const techPhone = ticket.technician_phone || ticket.technicianPhone || null;

    const problemType = ticket.problem_type || ticket.problemType || 'Hardware Fault';
    const problemDesc = ticket.problem_description || ticket.problemDescription || '';
    const imgPath = ticket.image_path || ticket.imagePath || null;
    const screenshotPath = ticket.screenshot_path || ticket.screenshotPath || null;

    const diagnosis = ticket.diagnosis || null;
    const identifiedIssues = ticket.identified_issues || ticket.identifiedIssues || null;
    const requiredWork = ticket.required_work || ticket.requiredWork || null;
    const requiredParts = ticket.required_parts || ticket.requiredParts || null;

    const baseCost = Number(ticket.estimated_cost || ticket.estimatedCost || 0);
    const addCharges = Number(ticket.additional_charges || ticket.additionalCharges || 0);
    const totalRepairCost = Number(ticket.repair_cost || ticket.repairCost || (baseCost + addCharges));
    const hasEstimate = baseCost > 0 || totalRepairCost > 0;
    const isPendingApproval = approvalStatus === 'pending_approval' && hasEstimate;

    const paymentStatus = ticket.payment_status || ticket.paymentStatus || 'unpaid';
    const isPaid = paymentStatus === 'paid';
    const paidAt = ticket.paid_at || ticket.paidAt || null;
    const collectionStatus = (ticket as any).collection_status || (ticket as any).collectionStatus || 'not_applicable';
    const paymentMethod = (ticket as any).payment_method || (ticket as any).paymentMethod || '';

    const handleApproveEstimate = async () => {
        if (!ticketId || !token) return;

        setIsApproving(true);
        try {
            const res = await repairApi.approveEstimate(ticketId, token);
            if (res.ok) {
                toast.success('Budget estimate approved! Technician has been authorized to begin repair work.');
                if (onRefresh) onRefresh();
            } else {
                toast.error(res.error || 'Failed to approve budget estimate. Please try again.');
            }
        } catch {
            toast.error('An unexpected error occurred while approving the estimate.');
        } finally {
            setIsApproving(false);
        }
    };

    const handleConfirmReject = async (reason: string) => {
        if (!ticketId || !token) return;

        setIsRejecting(true);
        try {
            const res = await repairApi.rejectEstimate(ticketId, reason, token);
            if (res.ok) {
                toast.success('Estimate declined. Ticket placed on hold for revision or cancellation.');
                setRejectModalOpen(false);
                if (onRefresh) onRefresh();
            } else {
                toast.error(res.error || 'Failed to reject estimate.');
            }
        } catch {
            toast.error('Failed to submit estimate rejection.');
        } finally {
            setIsRejecting(false);
        }
    };

    const handleConfirmRevision = async (comment: string) => {
        if (!ticketId || !token) return;

        setIsRequestingRevision(true);
        try {
            const res = await repairApi.requestRepairAgain(ticketId, comment, token);
            if (res.ok) {
                toast.success('Revision request submitted. Assigned technician has been notified.');
                setRevisionModalOpen(false);
                if (onRefresh) onRefresh();
            } else {
                toast.error(res.error || 'Failed to submit revision request.');
            }
        } catch {
            toast.error('An unexpected error occurred while requesting estimate revision.');
        } finally {
            setIsRequestingRevision(false);
        }
    };

    const handlePayTicket = async () => {
        if (!token || !ticketId) return;

        setIsPaying(true);
        try {
            const configRes = await billingApi.getConfig();
            const keyId = configRes.data?.data?.keyId || (configRes.data as any)?.keyId;
            if (!keyId) {
                toast.error('Payment gateway is currently unavailable.');
                setIsPaying(false);
                return;
            }

            const orderRes = await billingApi.createPaymentOrder({
                ticketId: ticket.id,
                ticketNumber: ticketNum
            }, token);

            const orderData = orderRes.data?.data || (orderRes.data as any);
            if (!orderRes.ok || !orderData?.orderId) {
                toast.error(orderRes.error || 'Failed to initiate payment order.');
                setIsPaying(false);
                return;
            }

            await triggerRazorpayCheckout({
                keyId,
                orderId: orderData.orderId,
                amount: orderData.amount,
                currency: orderData.currency || 'INR',
                name: flattenedSettings.company_name || 'TekDoctor Repair',
                description: `Settlement for Ticket #${ticketNum}`,
                prefill: {
                    name: requesterName,
                    email: requesterEmail || user?.email || '',
                    contact: requesterPhone || ''
                },
                onPaymentSuccess: async (response) => {
                    try {
                        const verifyRes = await billingApi.verifyPayment({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            ticketId: ticket.id,
                            ticket_id: ticket.id
                        }, token);

                        if (verifyRes.ok) {
                            toast.success(`Payment verified for Ticket #${ticketNum}!`);
                            if (onRefresh) onRefresh();
                            handleDownloadReceipt();
                        } else {
                            toast.error(verifyRes.error || 'Payment verification failed. Please contact support.');
                        }
                    } catch {
                        toast.error('Error verifying payment.');
                    } finally {
                        setIsPaying(false);
                    }
                },
                onDismiss: () => {
                    toast('Payment dismissed.', { icon: 'ℹ️' });
                    setIsPaying(false);
                },
                onPaymentError: async (errResp: any) => {
                    toast.error(errResp?.description || 'Payment failed.');
                    setIsPaying(false);
                }
            });
        } catch (err: any) {
            toast.error(err.message || 'Payment initiation failed.');
            setIsPaying(false);
        }
    };

    const handleDownloadReceipt = async () => {
        if (!token || !ticketId) return;

        setIsDownloadingInvoice(true);
        try {
            const res = await billingApi.getPaymentReceiptByTicket(ticketId, token);
            const receiptData = res.data?.data || res.data?.receipt || (res.data?.receiptNumber ? res.data : null);
            if (res.ok && receiptData) {
                await downloadPaymentBillPdf(receiptData);
                toast.success('Official GST Tax Invoice downloaded.');
            } else {
                toast.error(res.error || 'Failed to download GST invoice.');
            }
        } catch {
            toast.error('Could not generate PDF bill.');
        } finally {
            setIsDownloadingInvoice(false);
        }
    };

    const handleViewReceipt = async () => {
        if (!token || !ticketId) return;
        try {
            setIsActionLoading(true);
            const res = await billingApi.getPaymentReceiptByTicket(ticketId, token);
            const receiptData = res.data?.data || res.data?.receipt || (res.data?.receiptNumber ? res.data : null);
            if (receiptData) {
                setReceiptModalData(receiptData);
                setViewReceiptModalOpen(true);
            } else {
                toast.error(res.error || 'Failed to fetch tax invoice details.');
            }
        } catch {
            toast.error('Could not load receipt details.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handlePrintReceipt = async () => {
        if (!token || !ticketId) return;
        try {
            setIsActionLoading(true);
            const res = await billingApi.getPaymentReceiptByTicket(ticketId, token);
            const receiptData = res.data?.data || res.data?.receipt || (res.data?.receiptNumber ? res.data : null);
            if (receiptData) {
                await printPaymentBill(receiptData);
            } else {
                toast.error(res.error || 'Failed to fetch receipt for printing.');
            }
        } catch {
            toast.error('Could not print receipt.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const statusBadge = (
        <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold uppercase tracking-wider ${
            status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
            status === 'delivered' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
            status === 'in_progress' ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20' :
            status === 'cancelled' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
            'bg-amber-500/10 text-amber-400 border border-amber-500/20'
        }`}>
            {status.replace('_', ' ')}
        </span>
    );

    const priorityBadge = (
        <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold uppercase tracking-wider ${
            priority === 'Urgent' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
            priority === 'High' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
            'bg-zinc-800 text-zinc-300 border border-zinc-700'
        }`}>
            {priority} Priority
        </span>
    );

    return (
        <div className={`space-y-6 ${isDrawer ? 'text-xs' : ''}`}>
            {/* Top Workspace Bar (When rendered in Main Content) */}
            {!isDrawer && (
                <div className="bg-[#0c0c0c] border border-zinc-800/80 rounded-2xl p-4 md:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer flex items-center gap-2 text-xs font-semibold shrink-0"
                                title="Return to previous list"
                            >
                                <ArrowLeft size={16} />
                                <span className="hidden sm:inline">Back</span>
                            </button>
                        )}
                        <div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-xl md:text-2xl font-black text-white font-outfit tracking-tight">
                                    Ticket #{ticketNum}
                                </span>
                                {statusBadge}
                                {priorityBadge}
                                {isAmc && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                                        <ShieldCheck size={12} /> AMC ACTIVE
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-zinc-400 font-mono mt-1">
                                {deviceCategory} • {brand} {model} {assetId ? `• Asset: ${assetId}` : ''}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                        {onRefresh && (
                            <button
                                onClick={onRefresh}
                                className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                                title="Refresh ticket data"
                            >
                                <RefreshCw size={16} />
                            </button>
                        )}
                        {deviceId && (
                            <button
                                onClick={() => setHistoryDeviceId(Number(deviceId))}
                                className="px-3 py-2 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-xs font-semibold hover:bg-neon-cyan/20 transition-all cursor-pointer flex items-center gap-1.5"
                            >
                                <Clock size={14} />
                                <span>Device History</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* In Drawer Mode Top Header Bar */}
            {isDrawer && onOpenFullWorkspace && (
                <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80 mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        {statusBadge}
                        {priorityBadge}
                    </div>
                    <button
                        onClick={() => onOpenFullWorkspace(ticketId)}
                        className="px-2.5 py-1.5 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-xs font-semibold hover:bg-neon-cyan/20 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                        <span>Open Workspace</span>
                        <ExternalLink size={12} />
                    </button>
                </div>
            )}

            {/* APPROVAL BUDGET CALLOUT (Prominent when pending) */}
            {isPendingApproval && (
                <div className="bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-transparent border border-amber-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                        <div className="space-y-1.5 max-w-2xl">
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wide">
                                    <Clock size={12} className="animate-pulse text-amber-400" /> Action Needed: Approval Pending
                                </span>
                                <span className="text-xs text-zinc-400 font-mono">
                                    Submitted by Technician
                                </span>
                            </div>
                            <h4 className="text-lg font-bold text-white font-outfit">
                                Approximate Repair Budget: <span className="text-neon-cyan font-mono font-black text-xl">₹{totalRepairCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </h4>
                            <p className="text-xs text-zinc-300 leading-relaxed">
                                The technician completed diagnosis for <strong className="text-white">{brand} {model}</strong>. Please review the estimated repair budget and authorization details below.
                            </p>
                        </div>

                        {role === 'company' && (
                            <div className="flex items-center gap-3 shrink-0">
                                <button
                                    onClick={handleApproveEstimate}
                                    disabled={isApproving || isRejecting}
                                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs tracking-wide transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                >
                                    {isApproving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                                    <span>Approve Budget & Proceed</span>
                                </button>
                                <button
                                    onClick={() => setRejectModalOpen(true)}
                                    disabled={isApproving || isRejecting}
                                    className="px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-red-500/40 text-zinc-300 hover:text-red-400 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                                >
                                    Decline
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Approved / Rejected / On Hold Status Banners */}
            {approvalStatus === 'approved' && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-3 text-xs text-emerald-300">
                    <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                    <div>
                        <strong className="text-white">Estimate Approved:</strong> Repair budget of ₹{totalRepairCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })} has been approved. The repair is authorized and in progress.
                    </div>
                </div>
            )}

            {approvalStatus === 'on_hold' && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3 text-xs text-amber-300">
                    <AlertTriangle size={18} className="text-amber-400 shrink-0" />
                    <div>
                        <strong className="text-white">Estimate On Hold / Declined:</strong> {ticket.rejection_reason || 'Ticket is on hold pending budget reconsideration.'}
                    </div>
                </div>
            )}

            {/* Main Content Layout */}
            <div className={`grid gap-6 ${isDrawer ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3'}`}>
                {/* Left Column: Device & Requester & Problem Context (Takes 1 of 3 or full in drawer) */}
                <div className={`space-y-6 ${isDrawer ? '' : 'lg:col-span-1'}`}>
                    {/* Device & Asset Card */}
                    <div className="bg-[#0c0c0c] border border-zinc-800/80 rounded-2xl p-5 shadow-lg space-y-4">
                        <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
                            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                                <Laptop size={14} className="text-neon-cyan" /> Device & Asset Details
                            </h4>
                            {deviceId && isDrawer && (
                                <button
                                    onClick={() => setHistoryDeviceId(Number(deviceId))}
                                    className="text-[11px] text-neon-cyan hover:underline flex items-center gap-1 font-mono"
                                >
                                    <Clock size={11} /> History
                                </button>
                            )}
                        </div>

                        <div className="space-y-2.5 text-xs">
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Category</span>
                                <span className="text-white font-medium">{deviceCategory}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Brand & Model</span>
                                <span className="text-white font-medium">{brand} {model}</span>
                            </div>
                            {serialNum && (
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Serial Number</span>
                                    <span className="text-zinc-300 font-mono">{serialNum}</span>
                                </div>
                            )}
                            {assetId && (
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Corporate Asset ID</span>
                                    <span className="text-neon-cyan font-mono font-bold">{assetId}</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Contract / AMC</span>
                                <span className={isAmc ? 'text-emerald-400 font-semibold' : 'text-zinc-400'}>
                                    {isAmc ? 'Active Coverage' : 'Standard Billing'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Requester & Location Card */}
                    <div className="bg-[#0c0c0c] border border-zinc-800/80 rounded-2xl p-5 shadow-lg space-y-4">
                        <div className="border-b border-zinc-800/60 pb-3">
                            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                                <User size={14} className="text-indigo-400" /> Requester & Branch
                            </h4>
                        </div>

                        <div className="space-y-2.5 text-xs">
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Staff Requester</span>
                                <span className="text-white font-medium">{requesterName}</span>
                            </div>
                            {requesterDept && (
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Department</span>
                                    <span className="text-zinc-300">{requesterDept}</span>
                                </div>
                            )}
                            {branchName && (
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Branch Office</span>
                                    <span className="text-zinc-200 flex items-center gap-1">
                                        <MapPin size={11} className="text-rose-400" /> {branchName}
                                    </span>
                                </div>
                            )}
                            {requesterEmail && (
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Email</span>
                                    <span className="text-zinc-300 font-mono truncate max-w-[180px]">{requesterEmail}</span>
                                </div>
                            )}
                            {requesterPhone && (
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Contact Phone</span>
                                    <span className="text-zinc-300 font-mono">{requesterPhone}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Assigned Technician Card */}
                    {techName && (
                        <div className="bg-[#0c0c0c] border border-zinc-800/80 rounded-2xl p-5 shadow-lg space-y-3">
                            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                                <UserCheck size={14} className="text-emerald-400" /> Assigned Technician
                            </h4>
                            <div className="flex items-center justify-between text-xs">
                                <div>
                                    <div className="text-white font-bold">{techName}</div>
                                    {techPhone && <div className="text-zinc-400 font-mono mt-0.5">{techPhone}</div>}
                                </div>
                                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold uppercase">
                                    Active Specialist
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Problem Description, Diagnosis & Approximate Budget, Work Logs, Payments (Takes 2 of 3) */}
                <div className={`space-y-6 ${isDrawer ? '' : 'lg:col-span-2'}`}>
                    {/* Problem Description & Media Attachments */}
                    <div className="bg-[#0c0c0c] border border-zinc-800/80 rounded-2xl p-5 shadow-lg space-y-4">
                        <div className="border-b border-zinc-800/60 pb-3 flex items-center justify-between">
                            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                                <AlertCircle size={14} className="text-amber-400" /> Issue & Problem Description
                            </h4>
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                                {problemType}
                            </span>
                        </div>

                        <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line bg-zinc-950/40 p-4 rounded-xl border border-zinc-900">
                            {problemDesc || 'No problem description provided.'}
                        </p>

                        {/* Customer Attachments */}
                        {(imgPath || screenshotPath) && (
                            <div className="space-y-2 pt-2">
                                <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider block">
                                    Attached Diagnostic Media:
                                </span>
                                <div className="flex items-center gap-3 flex-wrap">
                                    {imgPath && (
                                        <button
                                            onClick={() => {
                                                setPreviewSrc(getFileUrl(imgPath));
                                                setPreviewAlt('Device issue photo');
                                            }}
                                            className="group relative h-20 w-28 rounded-xl overflow-hidden border border-zinc-800 hover:border-neon-cyan/50 transition-all cursor-pointer"
                                        >
                                            <img
                                                src={getFileUrl(imgPath) || ''}
                                                alt="Device photo"
                                                className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                                            />
                                            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 flex items-center justify-center transition-colors">
                                                <Eye size={16} className="text-white opacity-80 group-hover:opacity-100" />
                                            </div>
                                        </button>
                                    )}
                                    {screenshotPath && (
                                        <button
                                            onClick={() => {
                                                setPreviewSrc(getFileUrl(screenshotPath));
                                                setPreviewAlt('Error screenshot');
                                            }}
                                            className="group relative h-20 w-28 rounded-xl overflow-hidden border border-zinc-800 hover:border-neon-cyan/50 transition-all cursor-pointer"
                                        >
                                            <img
                                                src={getFileUrl(screenshotPath) || ''}
                                                alt="Error screenshot"
                                                className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                                            />
                                            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 flex items-center justify-center transition-colors">
                                                <Eye size={16} className="text-white opacity-80 group-hover:opacity-100" />
                                            </div>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Technician Diagnosis & Approximate Budget Breakdown */}
                    {(diagnosis || hasEstimate) && (
                        <div className="bg-[#0c0c0c] border border-zinc-800/80 rounded-2xl p-5 shadow-lg space-y-4">
                            <div className="border-b border-zinc-800/60 pb-3 flex items-center justify-between">
                                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-neon-cyan flex items-center gap-2">
                                    <Wrench size={14} /> Technician Inspection & Approximate Budget
                                </h4>
                                <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase ${
                                    approvalStatus === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                                    approvalStatus === 'pending_approval' ? 'bg-amber-500/10 text-amber-400' :
                                    'bg-zinc-800 text-zinc-400'
                                }`}>
                                    {approvalStatus.replace('_', ' ')}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                {diagnosis && (
                                    <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-3.5 space-y-1 md:col-span-2">
                                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">Diagnosis Finding</span>
                                        <p className="text-white font-medium leading-relaxed">{diagnosis}</p>
                                    </div>
                                )}
                                {identifiedIssues && (
                                    <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-3.5 space-y-1">
                                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">Identified Faults</span>
                                        <p className="text-zinc-300">{identifiedIssues}</p>
                                    </div>
                                )}
                                {requiredParts && (
                                    <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-3.5 space-y-1">
                                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">Required OEM Components</span>
                                        <p className="text-zinc-300 font-mono">{requiredParts}</p>
                                    </div>
                                )}
                            </div>

                            {/* Itemized Cost Breakdown */}
                            <div className="bg-zinc-950/60 border border-zinc-900 rounded-xl p-4 space-y-3">
                                <div className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider">
                                    Original Repair Estimate (Technician) (Without GST)
                                </div>
                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-[11px] text-amber-200/90 leading-relaxed font-sans">
                                    This is an approximate repair estimate provided by the technician for approval purposes. It is not the final invoice. The final amount may vary based on actual parts, services, technician/service charges, and applicable taxes after repair completion.
                                </div>
                                <div className="space-y-2 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-zinc-400">Base Diagnosis & Component Estimate</span>
                                        <span className="text-white font-mono">₹{baseCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-400">Additional Services / Labor</span>
                                        <span className="text-white font-mono">₹{addCharges.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="border-t border-zinc-800 pt-2 flex justify-between items-center text-sm font-bold">
                                        <span className="text-white font-outfit">Approximate Estimate (Without GST)</span>
                                        <span className="text-amber-400 font-mono text-base">₹{totalRepairCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>

                                    {/* Action Buttons & Status Banners for Customer / Company */}
                                    {role !== 'technician' && (
                                        <div className="pt-3 border-t border-zinc-800 space-y-2">
                                            {isPendingApproval && (
                                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                                    <button
                                                        onClick={handleApproveEstimate}
                                                        disabled={isApproving || isRejecting || isRequestingRevision}
                                                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                    >
                                                        {isApproving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                                        <span>Approve Estimate</span>
                                                    </button>
                                                    <button
                                                        onClick={() => setRevisionModalOpen(true)}
                                                        disabled={isApproving || isRejecting || isRequestingRevision}
                                                        className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-neon-cyan border border-neon-cyan/30 hover:border-neon-cyan/60 font-mono text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                    >
                                                        <RefreshCw size={12} />
                                                        <span>Request Revision</span>
                                                    </button>
                                                    <button
                                                        onClick={() => setRejectModalOpen(true)}
                                                        disabled={isApproving || isRejecting || isRequestingRevision}
                                                        className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-rose-400 border border-rose-500/30 hover:border-rose-500/60 font-mono text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                                                    >
                                                        <span>Decline</span>
                                                    </button>
                                                </div>
                                            )}

                                            {(approvalStatus === 'rejected' || approvalStatus === 'on_hold') && (
                                                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-2">
                                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                                        <div>
                                                            <div className="text-xs font-bold text-rose-300 font-mono uppercase">
                                                                Estimate Declined — On Hold
                                                            </div>
                                                            {(ticket.rejection_reason || ticket.rejectionReason) && (
                                                                <div className="text-xs text-rose-200/80 italic mt-0.5">
                                                                    Feedback: "{ticket.rejection_reason || ticket.rejectionReason}"
                                                                </div>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => setRevisionModalOpen(true)}
                                                            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-mono font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                                                        >
                                                            <RefreshCw size={12} />
                                                            <span>Request Re-evaluation</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {approvalStatus === 'reapproval_requested' && (
                                                <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl space-y-1">
                                                    <div className="flex items-center gap-1.5 text-xs font-bold text-sky-300 font-mono uppercase">
                                                        <RefreshCw size={12} className="animate-spin text-sky-400" />
                                                        <span>Revision In Review</span>
                                                    </div>
                                                    <p className="text-xs text-zinc-300">
                                                        The assigned technician has been notified to review your feedback and submit a revised quote.
                                                    </p>
                                                    {(ticket.reapproval_notes || ticket.reapprovalNotes) && (
                                                        <div className="text-xs text-sky-200/80 italic font-mono pt-0.5">
                                                            Note: "{ticket.reapproval_notes || ticket.reapprovalNotes}"
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {approvalStatus === 'approved' && (
                                                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono pt-1">
                                                    <Check size={13} />
                                                    <span>Quotation approved. Work authorized.</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Invoicing, Payment & Settlement */}
                    {(isPaid || status === 'completed' || status === 'delivered') && (
                        <div className="bg-[#0c0c0c] border border-zinc-800/80 rounded-2xl p-5 shadow-lg space-y-4">
                            <div className="border-b border-zinc-800/60 pb-3 flex items-center justify-between">
                                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                                    <CreditCard size={14} /> Settlement & Invoicing
                                </h4>
                                <span className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold uppercase ${
                                    isPaid ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                    paymentStatus === 'pending_verification' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse' :
                                    paymentStatus === 'rejected' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                                    'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}>
                                    {isPaid ? 'Paid & Settled' :
                                     paymentStatus === 'pending_verification' ? 'Verification Pending' :
                                     paymentStatus === 'rejected' ? 'Payment Rejected' :
                                     'Payment Awaiting'}
                                </span>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-950/40 p-4 rounded-xl border border-zinc-900">
                                <div>
                                    <div className="text-xs text-zinc-400">Final Settled Amount</div>
                                    <div className="text-lg font-bold font-mono text-white">
                                        ₹{totalRepairCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </div>
                                    {paidAt && (
                                        <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                                            Paid on: {new Date(paidAt).toLocaleDateString()}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    {isPaid ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={handleViewReceipt}
                                                disabled={isActionLoading}
                                                className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-neon-cyan/40 text-zinc-200 hover:text-neon-cyan font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                                                title="View Verified Tax Invoice"
                                            >
                                                <Receipt size={13} className="text-neon-cyan" />
                                                <span>View Bill</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handlePrintReceipt}
                                                disabled={isActionLoading}
                                                className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-amber-400/40 text-zinc-200 hover:text-amber-400 font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                                                title="Print Official Document"
                                            >
                                                <Printer size={13} className="text-amber-400" />
                                                <span>Print</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleDownloadReceipt}
                                                disabled={isDownloadingInvoice || isActionLoading}
                                                className="px-3.5 py-2 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 hover:bg-neon-cyan/20 text-neon-cyan font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                                                title="Download Official GST PDF"
                                            >
                                                {isDownloadingInvoice ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                                                <span>Download PDF</span>
                                            </button>
                                        </>
                                    ) : paymentStatus === 'pending_verification' ? (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="flex items-center gap-1.5 text-xs text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
                                                <Clock size={13} className="animate-pulse" />
                                                <span>Awaiting Admin Clearance</span>
                                            </div>
                                            {(collectionStatus !== 'collected' && ((paymentMethod || (ticket as any)?.payment_method || '').toLowerCase() === 'cash')) && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPaymentModal(true)}
                                                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-neon-cyan to-blue-500 hover:from-white hover:to-neon-cyan text-black font-bold text-xs transition-all shadow-md shadow-neon-cyan/20 flex items-center gap-1.5 cursor-pointer"
                                                >
                                                    <CreditCard size={13} />
                                                    <span>Pay Online Instead</span>
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        (ticket?.invoice_status === 'Draft' || ticket?.invoiceStatus === 'Draft') ? (
                                            <div className="flex items-center gap-1.5 text-xs text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 px-3.5 py-2 rounded-xl">
                                                <Clock size={13} className="animate-pulse" />
                                                <span>Invoice In Review — Payment Pending Release</span>
                                            </div>
                                        ) : paymentStatus === 'rejected' ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    onClick={() => setShowPaymentModal(true)}
                                                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-neon-cyan to-blue-500 hover:from-white hover:to-neon-cyan text-black font-bold text-xs transition-all shadow-md shadow-neon-cyan/20 flex items-center gap-1.5 cursor-pointer"
                                                >
                                                    <CreditCard size={14} />
                                                    <span>Pay Online Instead</span>
                                                </button>
                                                <button
                                                    onClick={() => setShowPaymentModal(true)}
                                                    className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                                                >
                                                    <span>Re-submit Offline</span>
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setShowPaymentModal(true)}
                                                className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer"
                                            >
                                                <CreditCard size={14} />
                                                <span>Pay Now ₹{totalRepairCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Lightbox Preview Modal */}
            {previewSrc && (
                <ImagePreviewModal
                    isOpen={!!previewSrc}
                    onClose={() => setPreviewSrc(null)}
                    src={previewSrc}
                    alt={previewAlt}
                />
            )}

            {/* Device History Modal */}
            {historyDeviceId && (
                <DeviceRepairHistoryModal
                    deviceId={historyDeviceId}
                    onClose={() => setHistoryDeviceId(null)}
                />
            )}

            {/* Decline Reason Modal */}
            <PromptModal
                isOpen={rejectModalOpen}
                title="Decline Repair Estimate"
                message="Please specify the reason for declining this approximate budget estimate:"
                placeholder="e.g. Budget exceeds departmental replacement threshold..."
                confirmText="Confirm Decline"
                variant="danger"
                isLoading={isRejecting}
                onConfirm={handleConfirmReject}
                onCancel={() => setRejectModalOpen(false)}
            />

            {/* Revision Request Modal */}
            <PromptModal
                isOpen={revisionModalOpen}
                title={approvalStatus === 'rejected' || approvalStatus === 'on_hold' ? "Request Re-evaluation" : "Request Estimate Revision"}
                message="Specify what changes or reconsiderations you would like the technician to make to this estimate:"
                placeholder="e.g. Please check if alternative OEM display can be used, or revise labor charges..."
                confirmText="Submit Request"
                variant="primary"
                isLoading={isRequestingRevision}
                onConfirm={handleConfirmRevision}
                onCancel={() => setRevisionModalOpen(false)}
            />

            {/* Offline & Online Payment Methods Modal */}
            <PaymentMethodModal
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                ticketId={ticketId}
                ticketNumber={ticketNum}
                amount={totalRepairCost}
                token={token}
                customerName={ticket?.customer_name || ticket?.customerName || 'Customer'}
                customerEmail={ticket?.email || ticket?.employeeEmail}
                customerPhone={ticket?.mobile || ticket?.customer_mobile || ticket?.customerMobile}
                onSuccess={() => {
                    setShowPaymentModal(false);
                    onRefresh?.();
                }}
            />

            {/* Standardized Bill / Tax Invoice Modal */}
            <PaymentReceiptModal
                isOpen={viewReceiptModalOpen}
                onClose={() => {
                    setViewReceiptModalOpen(false);
                    setReceiptModalData(null);
                }}
                receipt={receiptModalData}
                ticketId={receiptModalData ? undefined : ticketId}
            />
        </div>
    );
};

export default RepairTicketWorkspace;
