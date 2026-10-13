import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import {
    ChevronLeft, Edit2, Save, X, Phone, Mail, MapPin, Calendar, Clock,
    CreditCard, Wrench, AlertCircle, AlertTriangle, CheckCircle2, XCircle,
    RotateCcw, Lock, UserCog, Send, Loader2, ClipboardList, ArrowRightLeft,
    Star, Trash2, Layers, FileImage, ExternalLink, Building2, Tag, Download,
    Laptop, Cpu, Check, ShieldCheck, Sparkles, FileText, Truck, Printer, Receipt, Banknote
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { repairApi, adminApi, billingApi } from '@/services/api';
import type { ServiceRequest, TechnicianUser, WorkLog, TaskTransfer } from '@/services/api';
import { appConfig } from '@/config/appConfig';
import { getStatusBadge, getApprovalStatusBadge } from '@/components/TechnicianTaskWorkspace';
import { downloadPaymentBillPdf, printPaymentBill } from '@/utils/billGenerator';
import DeviceRepairHistoryModal from '@/components/DeviceRepairHistoryModal';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';

const getPaymentBadge = (paymentStatus?: string | null) => {
    const status = (paymentStatus || 'unpaid').toLowerCase();
    switch (status) {
        case 'paid':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <CreditCard size={10} /> Paid
                </span>
            );
        case 'pending_verification':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    <Clock size={10} /> Pending Verification
                </span>
            );
        case 'rejected':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/40">
                    <XCircle size={10} /> Payment Rejected
                </span>
            );
        case 'failed':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    <CreditCard size={10} /> Payment Failed
                </span>
            );
        case 'pending':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <CreditCard size={10} /> Payment Pending
                </span>
            );
        default:
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-800/80 text-zinc-400 border border-zinc-700/50">
                    <CreditCard size={10} /> Unpaid
                </span>
            );
    }
};

type AdminModalTab = 'details' | 'work-log' | 'transfers' | 'customer-note';

interface AdminTicketWorkspaceProps {
    request: ServiceRequest;
    technicians: TechnicianUser[];
    token: string | null;
    onBack: () => void;
    onRequestUpdated: (updated: Partial<ServiceRequest> & { id: number }) => void;
    onDelete: () => void;
    onImagePreview: (src: string, alt: string) => void;
}

const getFileUrl = (path: string | null) => {
    if (!path) return null;
    const base = (appConfig.apiUrl || window.location.origin).replace(/\/$/, '');
    const cleanPath = path.replace(/^\//, '');
    return `${base}/${cleanPath}`;
};

export default function AdminTicketWorkspace({
    request,
    technicians,
    token,
    onBack,
    onRequestUpdated,
    onDelete,
    onImagePreview
}: AdminTicketWorkspaceProps) {
    const navigate = useNavigate();
    const [modalTab, setModalTab] = useState<AdminModalTab>('details');
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Partial<ServiceRequest>>({});
    const [editLoading, setEditLoading] = useState(false);
    const [historyModalDeviceId, setHistoryModalDeviceId] = useState<number | null>(null);
    const [downloadingInvoice, setDownloadingInvoice] = useState(false);
    const [printingInvoice, setPrintingInvoice] = useState(false);
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);

    const [selectedTechForAssign, setSelectedTechForAssign] = useState<number | ''>(
        request.pendingTechnicianId || request.assignedTechnicianId || ''
    );
    const [assignLoading, setAssignLoading] = useState(false);

    // Controlled Admin Override State
    const [showOverrideModal, setShowOverrideModal] = useState(false);
    const [overrideReason, setOverrideReason] = useState('');
    const [isOverriding, setIsOverriding] = useState(false);

    // Status loading
    const [statusLoading, setStatusLoading] = useState(false);

    // Work logs & Transfers state
    const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
    const [workLogsLoading, setWorkLogsLoading] = useState(false);
    const [transfersChain, setTransfersChain] = useState<TaskTransfer[]>([]);
    const [transfersLoading, setTransfersLoading] = useState(false);

    // Offline Payment Verification State
    const [verifyingPayment, setVerifyingPayment] = useState(false);
    const [recordingCash, setRecordingCash] = useState(false);
    const [initiatingCash, setInitiatingCash] = useState(false);
    const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');

    const isInvoiceFinal = (request as any).invoiceStatus === 'Final' || (request as any).invoice_status === 'Final';
    const paymentStatus = request.paymentStatus || (request as any).payment_status || 'unpaid';
    const paymentMethod = (request.paymentMethod || (request as any).payment_method || '').toLowerCase().trim();
    const isCashPayment = paymentMethod === 'cash';
    const isBankOrUpi = paymentMethod === 'bank_transfer' || paymentMethod === 'offline_upi' || paymentMethod.includes('bank') || paymentMethod.includes('upi');
    const isCollected = (request.collectionStatus === 'collected' || (request as any).collection_status === 'collected');
    const isPendingVerification = paymentStatus === 'pending_verification';
    const isPaid = paymentStatus === 'paid';

    // Authoritative rule: Admin may see "Verify & Settle" ONLY when invoice is Final,
    // payment is in pending_verification, and EITHER cash is collected OR offline bank/upi is submitted.
    const canVerifyAndSettle = isInvoiceFinal && isPendingVerification && (
        (isCashPayment && isCollected) ||
        (!isCashPayment && isBankOrUpi)
    );

    const handleInitiateCash = async () => {
        if (!token) return;
        if (!isInvoiceFinal) {
            toast.error('Cash collection is unavailable until the final invoice is released.');
            return;
        }
        setInitiatingCash(true);
        try {
            const res = await billingApi.initiateOfflinePayment({
                ticketId: request.id,
                paymentMethod: 'cash'
            }, token);
            if (res.ok) {
                toast.success('Cash payment initiated. You can now record physical cash collection.');
                onRequestUpdated({
                    id: request.id,
                    paymentMethod: 'cash',
                    payment_method: 'cash',
                    paymentStatus: 'pending_verification',
                    payment_status: 'pending_verification',
                    collectionStatus: 'pending_collection',
                    collection_status: 'pending_collection'
                });
            } else {
                toast.error(res.error || 'Failed to initiate cash payment.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error initiating cash payment.');
        } finally {
            setInitiatingCash(false);
        }
    };

    const handleRecordCashCollected = async () => {
        if (!token) return;
        if (!isInvoiceFinal) {
            toast.error('Cash collection is unavailable until the final invoice is released.');
            return;
        }
        if (!isCashPayment) {
            toast.error('Cash payment has not been initiated for this repair ticket.');
            return;
        }
        setRecordingCash(true);
        try {
            const res = await billingApi.recordCashCollected({ ticketId: request.id }, token);
            if (res.ok) {
                toast.success('Cash collection recorded! Payment status is now pending admin verification.');
                onRequestUpdated({
                    id: request.id,
                    paymentStatus: 'pending_verification',
                    payment_status: 'pending_verification',
                    collectionStatus: 'collected',
                    collection_status: 'collected',
                    paymentMethod: 'cash',
                    payment_method: 'cash'
                });
            } else {
                toast.error(res.error || 'Failed to record cash collection.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error recording cash collection.');
        } finally {
            setRecordingCash(false);
        }
    };

    const handleVerifyOfflinePayment = async (action: 'verify' | 'reject', reason?: string) => {
        if (!token) return;
        setVerifyingPayment(true);
        try {
            const res = await billingApi.verifyOfflinePayment({
                ticketId: request.id,
                action,
                rejectionReason: reason
            }, token);
            if (res.ok) {
                toast.success(action === 'verify' ? 'Offline payment verified and settled successfully!' : 'Offline payment rejected.');
                onRequestUpdated({
                    id: request.id,
                    paymentStatus: action === 'verify' ? 'paid' : 'rejected',
                    payment_status: action === 'verify' ? 'paid' : 'rejected',
                    collectionStatus: action === 'verify' ? 'collected' : 'not_applicable',
                    collection_status: action === 'verify' ? 'collected' : 'not_applicable'
                });
                setRejectionModalOpen(false);
                setRejectionReason('');
            } else {
                toast.error(res.error || 'Failed to update payment verification state.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error processing verification.');
        } finally {
            setVerifyingPayment(false);
        }
    };

    useEffect(() => {
        setEditForm(request);
        setSelectedTechForAssign(request.pendingTechnicianId || request.assignedTechnicianId || '');
        setIsEditing(false);
    }, [request]);

    const fetchWorkLogs = useCallback(async () => {
        if (!token) return;
        setWorkLogsLoading(true);
        try {
            const res = await repairApi.getWorkLogs(token, request.id);
            if (res.ok && res.data) {
                setWorkLogs((res.data as any).data || []);
            }
        } finally {
            setWorkLogsLoading(false);
        }
    }, [token, request.id]);

    const fetchTransfersChain = useCallback(async () => {
        if (!token) return;
        setTransfersLoading(true);
        try {
            const res = await repairApi.getTicketTransfers(token, request.id);
            if (res.data?.data) {
                setTransfersChain(res.data.data);
            } else {
                setTransfersChain([]);
            }
        } catch (e) {
            console.error('Failed to load transfers chain', e);
        } finally {
            setTransfersLoading(false);
        }
    }, [token, request.id]);

    useEffect(() => {
        if (modalTab === 'work-log') {
            fetchWorkLogs();
        } else if (modalTab === 'transfers') {
            fetchTransfersChain();
        }
    }, [modalTab, fetchWorkLogs, fetchTransfersChain]);

    const handleSaveEdit = async () => {
        if (!token) return;
        setEditLoading(true);
        try {
            const res = await repairApi.updateRequest(token, request.id, editForm);
            if (res.ok) {
                onRequestUpdated({ ...editForm, id: request.id });
                setIsEditing(false);
                toast.success('Ticket updated successfully!');
            } else {
                toast.error(res.error || 'Failed to save changes.');
            }
        } finally {
            setEditLoading(false);
        }
    };

    const handleAssign = async () => {
        if (!token || selectedTechForAssign === '') return;
        const techId = Number(selectedTechForAssign);
        setAssignLoading(true);
        try {
            const res = await repairApi.assignTechnician(token, request.id, techId);
            if (res.ok) {
                onRequestUpdated({
                    id: request.id,
                    pendingTechnicianId: techId,
                    assignedTechnicianId: techId ? request.assignedTechnicianId : null
                });
                toast.success('Technician assignment pending approval!');
            } else {
                toast.error(res.error || 'Failed to assign technician');
            }
        } finally {
            setAssignLoading(false);
        }
    };

    const handleStatusChange = async (status: string) => {
        if (!token) return;
        if (request.status === 'completed') {
            if (status === 'pending') {
                toast.error('Completed repair tasks cannot be reverted to Pending.');
                return;
            }
            if (status === 'in_progress') {
                setShowOverrideModal(true);
                return;
            }
        }
        if (request.status === 'delivered') {
            if (status === 'pending') {
                toast.error('Delivered repair tickets cannot be reverted to Pending.');
                return;
            }
            if (status === 'in_progress' || status === 'completed') {
                setShowOverrideModal(true);
                return;
            }
        }
        setStatusLoading(true);
        try {
            const res = await repairApi.updateStatus(token, request.id, status);
            if (res.ok) {
                toast.success(`Ticket moved to ${status.replace('_', ' ').toUpperCase()}`);
                onRequestUpdated({ id: request.id, status: status as any });
            } else {
                toast.error(res.error || 'Failed to update status.');
            }
        } finally {
            setStatusLoading(false);
        }
    };

    const handleOverrideApproval = async () => {
        if (!token || !overrideReason.trim()) {
            toast.error('A justification reason is required for administrative override.');
            return;
        }
        setIsOverriding(true);
        try {
            const res = await repairApi.updateStatus(token, request.id, 'in_progress', {
                isOverride: true,
                overrideReason: overrideReason.trim()
            } as any);
            if (res.ok) {
                toast.success('Admin Override: Repair ticket reopened to IN PROGRESS.');
                onRequestUpdated({ id: request.id, status: 'in_progress' });
                setShowOverrideModal(false);
                setOverrideReason('');
            } else {
                toast.error(res.error || 'Failed to reopen repair ticket.');
            }
        } finally {
            setIsOverriding(false);
        }
    };

    const isCompanyTicket = Boolean(
        request.companyId ||
        (request as any).company_id ||
        request.companyName ||
        (request as any).company_name ||
        (request as any).employeeName ||
        (request as any).employee_name ||
        (request as any).assetId ||
        (request as any).asset_id
    );

    const companyName = request.companyName || (request as any).company_name || (request as any).company_account_name || 'Corporate Client';
    const companyEmail = request.companyEmail || (request as any).company_email || '';
    const companyPhone = request.companyPhone || (request as any).company_phone || '';
    const companyAddress = request.companyAddress || (request as any).company_address || '';
    const companyGst = (request as any).companyGst || (request as any).company_gst || '';
    const branchName = (request as any).branchName || (request as any).branch_name || 'Main Branch';
    const employeeName = (request as any).employeeName || (request as any).employee_name || request.customerName;
    const employeeEmail = (request as any).employeeEmail || (request as any).employee_email || request.email;
    const employeePhone = (request as any).employeePhone || (request as any).employee_phone || request.mobile;
    const employeeDept = (request as any).employeeDepartment || (request as any).employee_department || '';
    const assetId = (request as any).assetId || (request as any).asset_id;
    const serialNum = request.serialNumber || (request as any).serial_number || (request as any).linked_serial;
    const isAmc = Boolean((request as any).isAmc || (request as any).is_amc);
    const amcTag = (request as any).amcTag || (request as any).amc_tag;
    const deviceId = (request as any).deviceId || (request as any).device_id;
    const invoiceId = request.invoiceId || (request as any).invoice_id;
    const invoiceDate = request.invoiceDate || (request as any).invoice_date;
    const invoiceStatus = request.invoiceStatus || (request as any).invoice_status;

    const repeatHistory: any[] = (request as any).repairHistory || (request as any).deviceRepairHistory || [];

    const handleDownloadInvoice = async () => {
        if (!token) return;
        setDownloadingInvoice(true);
        try {
            const res = await adminApi.getPaymentReceipt(token, request.id);
            if (res.ok && res.data) {
                await downloadPaymentBillPdf((res.data as any).data);
                toast.success('Invoice PDF generated successfully!');
            } else {
                toast.error('Could not load invoice receipt.');
            }
        } catch (err) {
            console.error('Invoice download error:', err);
            toast.error('Failed to download invoice PDF.');
        } finally {
            setDownloadingInvoice(false);
        }
    };

    const handlePrintInvoice = async () => {
        if (!token) return;
        setPrintingInvoice(true);
        try {
            const res = await adminApi.getPaymentReceipt(token, request.id);
            const receiptData = res.ok && res.data ? (res.data as any).data || res.data : null;
            if (receiptData) {
                await printPaymentBill(receiptData);
            } else {
                toast.error('Could not load invoice receipt for printing.');
            }
        } catch (err) {
            console.error('Invoice print error:', err);
            toast.error('Failed to print invoice.');
        } finally {
            setPrintingInvoice(false);
        }
    };

    // Repair Lifecycle Stages Calculation
    const isCompleted = ['completed', 'delivered'].includes(request.status);
    const hasTech = Boolean(request.assignedTechnicianId || request.pendingTechnicianId);
    const approxTotalBudget = ((request.estimatedCost || 0) + (request.additionalCharges || 0)) || (request.repairCost || (request as any).repair_cost || 0);
    const hasDiagnosis = Boolean(request.diagnosis || approxTotalBudget > 0);
    const hasBudget = Boolean(approxTotalBudget > 0);
    const approvalState = request.customerApprovalStatus || 'none';

    const lifecycleSteps = [
        { label: 'Raised', sub: 'Ticket Created', done: true, current: false },
        { label: 'Assigned', sub: hasTech ? (request.technicianName || 'Tech Assigned') : 'Pending Tech', done: hasTech, current: !hasTech },
        { label: 'Diagnosis', sub: hasDiagnosis ? 'Diagnosed' : 'Pending Diagnosis', done: hasDiagnosis, current: hasTech && !hasDiagnosis },
        { label: 'Estimate', sub: hasBudget ? `₹${approxTotalBudget.toFixed(2)}` : 'Pending Quote', done: hasBudget, current: hasDiagnosis && !hasBudget },
        { 
            label: isCompanyTicket ? 'Approval' : 'Client Approval', 
            sub: approvalState === 'approved' ? 'Approved' : approvalState === 'rejected' ? 'Declined' : approvalState === 'pending_approval' ? 'Pending Approval' : 'Awaiting', 
            done: approvalState === 'approved', 
            current: approvalState === 'pending_approval', 
            rejected: approvalState === 'rejected' 
        },
        { label: 'Repairing', sub: ['in_progress', 'completed', 'delivered'].includes(request.status) ? 'In Progress' : 'Queued', done: ['in_progress', 'completed', 'delivered'].includes(request.status), current: request.status === 'in_progress' },
        { label: 'Completed', sub: isCompleted ? 'Service Done' : 'Pending', done: isCompleted, current: false },
        { label: 'Payment', sub: isPaid ? 'Settled' : 'Payment Due', done: isPaid, current: isCompleted && !isPaid },
        { label: 'Tax Invoice', sub: (isPaid && invoiceId) ? `#${invoiceId}` : isPaid ? 'Available' : 'Pending', done: isPaid, current: false }
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Top Navigation & Breadcrumbs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/60">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all text-xs font-mono font-medium group cursor-pointer"
                    >
                        <ChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                        Back to Tickets
                    </button>
                    <span className="text-zinc-700">/</span>
                    <span className="text-xs font-mono text-neon-cyan font-bold">{request.ticketNumber || `TICKET #${request.id}`}</span>
                    <span className="text-zinc-700">/</span>
                    <span className="text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-xs">
                        {isCompanyTicket ? companyName : request.customerName}
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {isCompanyTicket && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                            <Building2 size={11} /> Corporate B2B
                        </span>
                    )}
                    {getStatusBadge(request.status)}
                    {getPaymentBadge(request.paymentStatus || (request as any).payment_status)}
                    {request.customerApprovalStatus && getApprovalStatusBadge(request.customerApprovalStatus)}
                    <button
                        onClick={onDelete}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-semibold cursor-pointer transition-all ml-2"
                        title="Delete Repair Ticket"
                    >
                        <Trash2 size={12} />
                        Delete
                    </button>
                </div>
            </div>

            {/* Main Content Workspace Card */}
            <div className="bg-[#0c0c0c] border border-zinc-800/60 rounded-2xl shadow-2xl relative overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-neon-cyan via-blue-500 to-indigo-500" />

                {/* Workspace Header */}
                <div className="p-4 sm:p-6 border-b border-zinc-900 flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                            <span className="text-xs font-mono text-neon-cyan font-bold">{request.ticketNumber || `TICKET #${request.id}`}</span>
                            {isCompanyTicket ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                                    <Building2 size={10} /> Corporate Client
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-zinc-800 text-zinc-300 border border-zinc-700">
                                    Individual Customer
                                </span>
                            )}
                            {getStatusBadge(request.status)}
                            {getPaymentBadge(request.paymentStatus || (request as any).payment_status)}
                        </div>

                        {/* Company Name & Email Display (Requirement 15) */}
                        {isCompanyTicket ? (
                            <div className="space-y-1">
                                <h3 className="text-xl font-bold text-white font-outfit flex items-center gap-2">
                                    <span>{companyName}</span>
                                </h3>
                                {companyEmail && (
                                    <div className="text-xs font-mono text-neon-cyan flex items-center gap-1.5">
                                        <Mail size={12} />
                                        <span>{companyEmail}</span>
                                    </div>
                                )}
                                <div className="text-xs text-zinc-400 mt-1 flex flex-wrap items-center gap-3">
                                    <span>Branch: <strong className="text-zinc-200">{branchName}</strong></span>
                                    <span>&bull;</span>
                                    <span>Requested By: <strong className="text-zinc-200">{employeeName}</strong> {employeeDept ? `(${employeeDept})` : ''}</span>
                                </div>
                                <div className="text-xs text-zinc-400 mt-1 flex flex-wrap items-center gap-2">
                                    <span>Device: <strong className="text-white">{request.brand} {request.modelNumber || ''}</strong> · {request.deviceCategory}</span>
                                    {serialNum && (
                                        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 font-semibold">
                                            S/N: {serialNum}
                                        </span>
                                    )}
                                    {assetId && (
                                        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 font-semibold">
                                            Asset: {assetId}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div>
                                <h3 className="text-xl font-bold text-white font-outfit">{request.customerName}</h3>
                                <div className="text-xs text-zinc-500 mt-0.5">{request.brand} {request.modelNumber || ''} · {request.deviceCategory}</div>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {/* {modalTab === 'details' && (
                            !isEditing ? (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 cursor-pointer text-xs font-semibold transition-all"
                                >
                                    <Edit2 size={12} />
                                    <span>Edit Info</span>
                                </button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleSaveEdit}
                                        disabled={editLoading}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neon-cyan hover:bg-cyan-400 text-black text-xs font-bold cursor-pointer transition-all disabled:opacity-50"
                                    >
                                        {editLoading ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                        <span>Save</span>
                                    </button>
                                    <button
                                        onClick={() => { setIsEditing(false); setEditForm(request); }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white text-xs font-semibold cursor-pointer transition-all"
                                    >
                                        <X size={12} />
                                        <span>Cancel</span>
                                    </button>
                                </div>
                            )
                        )} */}
                        <button
                            onClick={onBack}
                            className="p-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer text-xs uppercase font-mono font-semibold h-fit flex items-center gap-1"
                        >
                            <ChevronLeft size={13} />
                            Back
                        </button>
                    </div>
                </div>

                {/* ── REPAIR LIFECYCLE PROGRESS PIPELINE (Requirement 9) ── */}
                <div className="px-4 sm:px-6 py-3 sm:py-3.5 bg-zinc-950/70 border-b border-zinc-900 overflow-x-auto">
                    <div className="flex items-center justify-between min-w-[760px] gap-2">
                        {lifecycleSteps.map((step, idx) => {
                            const isDone = step.done;
                            const isCurrent = step.current;
                            const isRejected = (step as any).rejected;

                            return (
                                <React.Fragment key={idx}>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
                                            isRejected
                                                ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                                                : isDone
                                                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                                    : isCurrent
                                                        ? 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan animate-pulse'
                                                        : 'bg-zinc-900 border-zinc-800 text-zinc-600'
                                        }`}>
                                            {isRejected ? <XCircle size={14} /> : isDone ? <Check size={14} /> : (idx + 1)}
                                        </div>
                                        <div>
                                            <div className={`text-[11px] font-semibold whitespace-nowrap ${
                                                isRejected ? 'text-rose-400' : isDone ? 'text-zinc-200' : isCurrent ? 'text-neon-cyan' : 'text-zinc-600'
                                            }`}>
                                                {step.label}
                                            </div>
                                            <div className="text-[9px] font-mono text-zinc-500 whitespace-nowrap">
                                                {step.sub}
                                            </div>
                                        </div>
                                    </div>
                                    {idx < lifecycleSteps.length - 1 && (
                                        <div className={`h-0.5 flex-1 min-w-[16px] rounded transition-all ${
                                            isDone ? 'bg-emerald-500/40' : 'bg-zinc-800'
                                        }`} />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                {/* Tab Bar */}
                <div className="flex border-b border-zinc-900 px-4 sm:px-6 pt-1 gap-1 overflow-x-auto">
                    {([
                        ['details', 'Details & Overview', null],
                        ['work-log', 'Work Log', <ClipboardList size={12} key="wl" />],
                        ['transfers', 'Transfer Chain', <ArrowRightLeft size={12} key="tc" />],
                        ['customer-note', 'Customer Note', <Star size={12} key="cn" />]
                    ] as [AdminModalTab, string, React.ReactNode][]).map(([id, label, icon]) => (
                        <button
                            key={id}
                            onClick={() => setModalTab(id)}
                            className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap border-b-2 -mb-px ${
                                modalTab === id
                                    ? 'text-neon-cyan border-neon-cyan bg-neon-cyan/5'
                                    : 'text-zinc-500 border-transparent hover:text-zinc-300'
                            }`}
                        >
                            {icon}{label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">

                    {/* ── DETAILS TAB ── */}
                    {modalTab === 'details' && (
                        <>
                            {/* Contact & Device Specs Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {isCompanyTicket ? (
                                    /* Corporate Client & Requester Card */
                                    <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-4 space-y-3 shadow-sm">
                                        <div className="flex items-center justify-between border-b border-zinc-900/80 pb-2">
                                            <div className="flex items-center gap-2 text-indigo-400 font-mono text-[11px] uppercase tracking-wider font-bold">
                                                <Building2 size={14} />
                                                <span>Corporate Account & Requester</span>
                                            </div>
                                            {isAmc && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                                    <ShieldCheck size={11} /> AMC Active
                                                </span>
                                            )}
                                        </div>

                                        <div className="space-y-2 text-xs text-zinc-300">
                                            <div>
                                                <span className="text-zinc-500 text-[10px] font-mono uppercase block">Company Name</span>
                                                <span className="text-white font-semibold text-sm">{companyName}</span>
                                            </div>
                                            {companyEmail && (
                                                <div>
                                                    <span className="text-zinc-500 text-[10px] font-mono uppercase block">Company Email</span>
                                                    <span className="text-neon-cyan font-mono">{companyEmail}</span>
                                                </div>
                                            )}
                                            <div className="grid grid-cols-2 gap-2 pt-1">
                                                <div>
                                                    <span className="text-zinc-500 text-[10px] font-mono uppercase block">Branch</span>
                                                    <span className="text-zinc-200 font-medium flex items-center gap-1.5 mt-0.5">
                                                        <MapPin size={12} className="text-zinc-500" />
                                                        {branchName}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-zinc-500 text-[10px] font-mono uppercase block">Requested By</span>
                                                    <span className="text-zinc-200 font-medium flex items-center gap-1.5 mt-0.5">
                                                        <Phone size={12} className="text-zinc-500" />
                                                        {employeeName} {employeeDept ? `(${employeeDept})` : ''}
                                                    </span>
                                                </div>
                                            </div>
                                            {(employeeEmail || employeePhone) && (
                                                <div className="pt-1 text-[11px] text-zinc-400 space-y-1 bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-800/60">
                                                    {employeeEmail && <div>Employee Email: <strong className="text-zinc-200">{employeeEmail}</strong></div>}
                                                    {employeePhone && <div>Employee Phone: <strong className="text-zinc-200">{employeePhone}</strong></div>}
                                                </div>
                                            )}
                                            <div className="text-[11px] text-zinc-500 pt-1 flex items-center gap-1.5">
                                                <Calendar size={12} />
                                                <span>Ticket Created: {new Date(request.createdAt).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* Individual Customer Contact Card */
                                    <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-xl p-4 space-y-2">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Customer Contact</div>
                                        <div className="space-y-2 text-xs text-zinc-300">
                                            {!isEditing ? (
                                                <>
                                                    <div className="flex items-center gap-2"><Phone size={13} className="text-neon-cyan" /> {request.mobile}</div>
                                                    {request.email && <div className="flex items-center gap-2"><Mail size={13} className="text-neon-cyan" /> {request.email}</div>}
                                                    <div className="flex items-center gap-2"><MapPin size={13} className="text-neon-cyan" /> {request.city}</div>
                                                    <div className="flex items-center gap-2"><Calendar size={13} className="text-zinc-500" /> Created: {new Date(request.createdAt).toLocaleDateString()}</div>
                                                </>
                                            ) : (
                                                <div className="space-y-2">
                                                    <input type="text" value={editForm.customerName || ''} onChange={e => setEditForm(p => ({ ...p, customerName: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 focus:border-neon-cyan focus:outline-none text-xs text-white" placeholder="Name" />
                                                    <input type="text" value={editForm.mobile || ''} onChange={e => setEditForm(p => ({ ...p, mobile: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 focus:border-neon-cyan focus:outline-none text-xs text-white" placeholder="Phone" />
                                                    <input type="text" value={editForm.email || ''} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 focus:border-neon-cyan focus:outline-none text-xs text-white" placeholder="Email" />
                                                    <input type="text" value={editForm.city || ''} onChange={e => setEditForm(p => ({ ...p, city: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 focus:border-neon-cyan focus:outline-none text-xs text-white" placeholder="City" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Physical Hardware Fleet Asset Card (Requirement 4) */}
                                <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-4 space-y-3 shadow-sm">
                                    <div className="flex items-center justify-between border-b border-zinc-900/80 pb-2">
                                        <div className="flex items-center gap-2 text-neon-cyan font-mono text-[11px] uppercase tracking-wider font-bold">
                                            <Laptop size={14} />
                                            <span>{isCompanyTicket ? 'Corporate Hardware Fleet Identification' : 'Device Specifications'}</span>
                                        </div>
                                        {deviceId && (
                                            <button
                                                onClick={() => setHistoryModalDeviceId(Number(deviceId))}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-neon-cyan hover:bg-neon-cyan/10 border border-neon-cyan/30 transition-colors cursor-pointer"
                                                title="View Device Lifecycle History"
                                            >
                                                <Clock size={11} />
                                                <span>Device History</span>
                                            </button>
                                        )}
                                    </div>

                                    <div className="space-y-2 text-xs text-zinc-300">
                                        {!isEditing ? (
                                            <>
                                                <div>
                                                    <span className="text-zinc-500 text-[10px] font-mono uppercase block">Category & Model</span>
                                                    <span className="text-white font-medium text-sm">
                                                        {request.deviceCategory} &bull; {request.brand} {request.modelNumber || ''}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2 pt-1">
                                                    <div className="bg-zinc-900/50 p-2 rounded-lg border border-zinc-800/60">
                                                        <span className="text-zinc-500 text-[10px] font-mono uppercase block">Serial Number</span>
                                                        <span className="font-mono text-xs font-bold text-neon-cyan truncate block mt-0.5">
                                                            {serialNum || 'Not Provided'}
                                                        </span>
                                                    </div>
                                                    <div className="bg-zinc-900/50 p-2 rounded-lg border border-zinc-800/60">
                                                        <span className="text-zinc-500 text-[10px] font-mono uppercase block">Asset ID</span>
                                                        <span className="font-mono text-xs font-bold text-indigo-400 truncate block mt-0.5">
                                                            {assetId || 'Standard Fleet'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {request.deviceConfiguration && (
                                                    <div className="pt-1">
                                                        <span className="text-zinc-500 text-[10px] font-mono uppercase block">Hardware Configuration</span>
                                                        <div className="text-zinc-300 text-[11px] bg-zinc-900/40 p-2 rounded-lg border border-zinc-800/60 mt-0.5 leading-relaxed">
                                                            {request.deviceConfiguration}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                                                    <div>
                                                        <span className="text-zinc-500 text-[10px] font-mono uppercase block">Reported Problem</span>
                                                        <span className="text-zinc-200 font-medium">{request.problemType}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-zinc-500 text-[10px] font-mono uppercase block">Service Priority</span>
                                                        <span className="uppercase text-neon-cyan font-bold">{request.priority}</span>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="space-y-2">
                                                <input type="text" value={editForm.deviceCategory || ''} onChange={e => setEditForm(p => ({ ...p, deviceCategory: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 focus:border-neon-cyan focus:outline-none text-xs text-white" placeholder="Category" />
                                                <input type="text" value={editForm.brand || ''} onChange={e => setEditForm(p => ({ ...p, brand: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 focus:border-neon-cyan focus:outline-none text-xs text-white" placeholder="Brand" />
                                                <input type="text" value={editForm.modelNumber || ''} onChange={e => setEditForm(p => ({ ...p, modelNumber: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 focus:border-neon-cyan focus:outline-none text-xs text-white" placeholder="Model" />
                                                <input type="text" value={editForm.serialNumber || ''} onChange={e => setEditForm(p => ({ ...p, serialNumber: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 focus:border-neon-cyan focus:outline-none text-xs text-white" placeholder="Serial Number" />
                                                <textarea value={editForm.deviceConfiguration || ''} onChange={e => setEditForm(p => ({ ...p, deviceConfiguration: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 focus:border-neon-cyan focus:outline-none text-xs text-white resize-none" placeholder="Device Configuration" rows={2} />
                                                <input type="text" value={editForm.problemType || ''} onChange={e => setEditForm(p => ({ ...p, problemType: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 focus:border-neon-cyan focus:outline-none text-xs text-white" placeholder="Problem Type" />
                                                <select value={editForm.priority || 'Standard'} onChange={e => setEditForm(p => ({ ...p, priority: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 focus:border-neon-cyan focus:outline-none text-xs text-white cursor-pointer">
                                                    <option value="Low">Low</option><option value="Standard">Standard</option><option value="Priority">Priority</option>
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Payment Status & Settlement Card */}
                            <div className={`border rounded-2xl p-5 space-y-4 shadow-xl transition-all ${
                                (request.paymentStatus === 'paid' || (request as any).payment_status === 'paid')
                                    ? 'bg-emerald-950/20 border-emerald-500/30'
                                    : (request.paymentStatus === 'pending_verification' || (request as any).payment_status === 'pending_verification')
                                        ? 'bg-amber-950/20 border-amber-500/30'
                                        : (request.paymentStatus === 'rejected' || (request as any).payment_status === 'rejected' || request.paymentStatus === 'failed' || (request as any).payment_status === 'failed')
                                            ? 'bg-rose-950/20 border-rose-500/30'
                                            : 'bg-zinc-950/70 border-zinc-800/60'
                            }`}>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-900 pb-3">
                                    <div className="flex items-center gap-2">
                                        <CreditCard size={16} className={(request.paymentStatus === 'paid' || (request as any).payment_status === 'paid') ? 'text-emerald-400' : (request.paymentStatus === 'pending_verification' || (request as any).payment_status === 'pending_verification') ? 'text-amber-400' : 'text-neon-cyan'} />
                                        <h4 className="text-xs font-mono uppercase tracking-wider text-white font-bold">
                                            Customer Payment Status & Settlement
                                        </h4>
                                    </div>
                                    <div>
                                        {getPaymentBadge(request.paymentStatus || (request as any).payment_status)}
                                    </div>
                                </div>

                                {/* Payment Banner */}
                                {(request.paymentStatus === 'paid' || (request as any).payment_status === 'paid') ? (
                                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 flex items-start gap-3">
                                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                                        <div className="text-xs text-emerald-200/90 leading-relaxed font-sans">
                                            <strong className="text-emerald-300 font-semibold">Payment Received & Verified:</strong> Customer <strong>{request.customerName}</strong> has completed payment of <strong>₹{(request.repairCost || (request as any).repair_cost || 0).toFixed(2)}</strong> for repair ticket <strong>{request.ticketNumber || `#${request.id}`}</strong>.
                                        </div>
                                    </div>
                                ) : (request.paymentStatus === 'pending_verification' || (request as any).payment_status === 'pending_verification') ? (
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div className="flex items-start gap-3">
                                                <Clock size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                                <div className="text-xs text-amber-200/90 leading-relaxed font-sans">
                                                    <strong className="text-amber-300 font-semibold">Payment Awaiting Verification:</strong> Customer <strong>{request.customerName}</strong> has submitted an offline payment ({request.paymentMethod || (request as any).payment_method || 'Offline Payment'}) of <strong>₹{(request.repairCost || (request as any).repair_cost || 0).toFixed(2)}</strong>.
                                                    {(request.collectionStatus === 'collected' || (request as any).collection_status === 'collected') && (
                                                        <div className="text-emerald-400 text-[11px] font-mono mt-1 font-semibold flex items-center gap-1">
                                                            <CheckCircle2 size={12} /> Cash collected by assigned technician. Ready for admin verification.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {canVerifyAndSettle ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            disabled={verifyingPayment}
                                                            onClick={() => handleVerifyOfflinePayment('verify')}
                                                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                                                        >
                                                            {verifyingPayment ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                                            Verify & Settle
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={verifyingPayment}
                                                            onClick={() => setRejectionModalOpen(true)}
                                                            className="px-3.5 py-1.5 bg-red-600/80 hover:bg-red-600 text-white font-mono text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                                                        >
                                                            <XCircle size={12} />
                                                            Reject
                                                        </button>
                                                    </>
                                                ) : !isInvoiceFinal ? (
                                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
                                                        <Lock size={12} className="text-amber-400 shrink-0" />
                                                        <span>Invoice must be Finalized before Verification</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
                                                            <Clock size={12} className="text-amber-400 shrink-0" />
                                                            <span>Awaiting Cash Collection by Staff</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            disabled={recordingCash}
                                                            onClick={handleRecordCashCollected}
                                                            className="px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-600 text-white font-mono text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                                                        >
                                                            {recordingCash ? <Loader2 size={12} className="animate-spin" /> : <Banknote size={12} />}
                                                            Record Cash Collected
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (request.paymentStatus === 'rejected' || (request as any).payment_status === 'rejected') ? (
                                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex items-start gap-3">
                                            <XCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                                            <div className="text-xs text-rose-200/90 leading-relaxed font-sans">
                                                <strong className="text-rose-300 font-semibold">Payment Verification Rejected:</strong> The offline payment verification was rejected. Outstanding repair amount payable: <strong>₹{(request.repairCost || (request as any).repair_cost || 0).toFixed(2)}</strong>.
                                            </div>
                                        </div>
                                        {(!isPaid && (request.collectionStatus !== 'collected' && (request as any).collection_status !== 'collected')) && (
                                            !isInvoiceFinal ? (
                                                <div className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-500 font-mono text-[11px] rounded-lg flex items-center gap-1.5 shrink-0" title="Commercial invoice must be finalized and released before recording cash.">
                                                    <Lock size={11} className="text-amber-400 shrink-0" />
                                                    <span>Cash collection locked until invoice finalized</span>
                                                </div>
                                            ) : isCashPayment ? (
                                                <button
                                                    type="button"
                                                    disabled={recordingCash}
                                                    onClick={handleRecordCashCollected}
                                                    className="px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-600 text-white font-mono text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                                                >
                                                    {recordingCash ? <Loader2 size={12} className="animate-spin" /> : <Banknote size={12} />}
                                                    Record Cash Collected
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={initiatingCash}
                                                    onClick={handleInitiateCash}
                                                    className="px-3 py-1.5 bg-amber-600/90 hover:bg-amber-600 text-white font-mono text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                                                >
                                                    {initiatingCash ? <Loader2 size={12} className="animate-spin" /> : <Banknote size={12} />}
                                                    Initiate Cash Payment
                                                </button>
                                            )
                                        )}
                                    </div>
                                ) : (request.paymentStatus === 'failed' || (request as any).payment_status === 'failed') ? (
                                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex items-start gap-3">
                                            <XCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                                            <div className="text-xs text-rose-200/90 leading-relaxed font-sans">
                                                <strong className="text-rose-300 font-semibold">Payment Incomplete:</strong> Customer payment attempt failed. Outstanding amount due: <strong>₹{(request.repairCost || (request as any).repair_cost || 0).toFixed(2)}</strong>.
                                            </div>
                                        </div>
                                        {(!isPaid && (request.collectionStatus !== 'collected' && (request as any).collection_status !== 'collected')) && (
                                            !isInvoiceFinal ? (
                                                <div className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-500 font-mono text-[11px] rounded-lg flex items-center gap-1.5 shrink-0" title="Commercial invoice must be finalized and released before recording cash.">
                                                    <Lock size={11} className="text-amber-400 shrink-0" />
                                                    <span>Cash collection locked until invoice finalized</span>
                                                </div>
                                            ) : isCashPayment ? (
                                                <button
                                                    type="button"
                                                    disabled={recordingCash}
                                                    onClick={handleRecordCashCollected}
                                                    className="px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-600 text-white font-mono text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                                                >
                                                    {recordingCash ? <Loader2 size={12} className="animate-spin" /> : <Banknote size={12} />}
                                                    Record Cash Collected
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={initiatingCash}
                                                    onClick={handleInitiateCash}
                                                    className="px-3 py-1.5 bg-amber-600/90 hover:bg-amber-600 text-white font-mono text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                                                >
                                                    {initiatingCash ? <Loader2 size={12} className="animate-spin" /> : <Banknote size={12} />}
                                                    Initiate Cash Payment
                                                </button>
                                            )
                                        )}
                                    </div>
                                ) : (
                                    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex items-start gap-3">
                                            <Clock size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                            <div className="text-xs text-zinc-300 leading-relaxed font-sans">
                                                <strong className="text-amber-400 font-semibold">Payment Status: Unpaid.</strong> Customer payment has not been completed. Outstanding repair amount payable: <strong>₹{(request.repairCost || (request as any).repair_cost || 0).toFixed(2)}</strong>.
                                                {!isCashPayment && (
                                                    <span className="block text-zinc-500 text-[11px] font-mono mt-0.5">
                                                        Cash payment has not been initiated.
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {(!isPaid && (request.collectionStatus !== 'collected' && (request as any).collection_status !== 'collected')) && (
                                            !isInvoiceFinal ? (
                                                <div className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-500 font-mono text-[11px] rounded-lg flex items-center gap-1.5 shrink-0" title="Commercial invoice must be finalized and released before recording cash.">
                                                    <Lock size={11} className="text-amber-400 shrink-0" />
                                                    <span>Cash collection locked until invoice finalized</span>
                                                </div>
                                            ) : isCashPayment ? (
                                                <button
                                                    type="button"
                                                    disabled={recordingCash}
                                                    onClick={handleRecordCashCollected}
                                                    className="px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-600 text-white font-mono text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                                                >
                                                    {recordingCash ? <Loader2 size={12} className="animate-spin" /> : <Banknote size={12} />}
                                                    Record Cash Collected
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={initiatingCash}
                                                    onClick={handleInitiateCash}
                                                    className="px-3 py-1.5 bg-amber-600/90 hover:bg-amber-600 text-white font-mono text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                                                >
                                                    {initiatingCash ? <Loader2 size={12} className="animate-spin" /> : <Banknote size={12} />}
                                                    Initiate Cash Payment
                                                </button>
                                            )
                                        )}
                                    </div>
                                )}

                                {/* Financial Breakdown */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-3">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Payment Status</div>
                                        <div className={`text-sm sm:text-base font-mono font-bold mt-1 ${
                                            (request.paymentStatus === 'paid' || (request as any).payment_status === 'paid')
                                                ? 'text-emerald-400'
                                                : (request.paymentStatus === 'failed' || (request as any).payment_status === 'failed')
                                                    ? 'text-rose-400'
                                                    : 'text-amber-400'
                                        }`}>
                                            {(request.paymentStatus === 'paid' || (request as any).payment_status === 'paid') ? 'Paid' : ((request.paymentStatus || (request as any).payment_status || 'unpaid').toUpperCase())}
                                        </div>
                                        <div className="text-[9px] font-mono text-zinc-500 mt-0.5">Authoritative Backend</div>
                                    </div>

                                    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-3">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Amount Paid</div>
                                        <div className="text-sm sm:text-base font-mono font-bold text-white mt-1">
                                            {(request.paymentStatus === 'paid' || (request as any).payment_status === 'paid')
                                                ? `₹${(request.repairCost || (request as any).repair_cost || 0).toFixed(2)}`
                                                : '₹0.00'}
                                        </div>
                                        <div className="text-[9px] font-mono text-zinc-500 mt-0.5">
                                            {(request.paymentStatus === 'paid' || (request as any).payment_status === 'paid') ? 'Settled in Full' : 'Outstanding Balance'}
                                        </div>
                                    </div>

                                    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-3">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Payment Date</div>
                                        <div className="text-xs font-mono font-semibold text-zinc-200 mt-1 truncate">
                                            {(request.paidAt || (request as any).paid_at)
                                                ? new Date(request.paidAt || (request as any).paid_at).toLocaleString()
                                                : 'Not Paid Yet'}
                                        </div>
                                        <div className="text-[9px] font-mono text-zinc-500 mt-0.5">Settlement Timestamp</div>
                                    </div>

                                    {(() => {
                                        const pMethod = (request.paymentMethod || (request as any).payment_method || '').toLowerCase();
                                        const pId = request.paymentId || (request as any).payment_id || '';
                                        const isCash = pMethod.includes('cash') || String(pId).startsWith('PAY-CASH');
                                        const isBankOrUpi = pMethod.includes('bank') || pMethod.includes('upi') || String(pId).startsWith('PAY-BANK') || String(pId).startsWith('PAY-UPI');
                                        const idLabel = isCash ? 'Cash Payment Reference' : isBankOrUpi ? 'Offline Transfer Reference' : 'Transaction ID';
                                        const subLabel = isCash
                                            ? (isPaid
                                                ? 'Cash Payment (Verified & Settled)'
                                                : (request.collectionStatus === 'collected' || (request as any).collection_status === 'collected')
                                                    ? 'Cash Collected (Pending Verification)'
                                                    : 'Cash Payment (Pending Collection)')
                                            : (request.paymentMethod || (request as any).payment_method || 'Online Settlement');
                                        return (
                                            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-3">
                                                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{idLabel}</div>
                                                <div className="text-xs font-mono font-semibold text-neon-cyan mt-1 truncate" title={pId || 'N/A'}>
                                                    {pId || 'N/A'}
                                                </div>
                                                <div className="text-[9px] font-mono text-zinc-500 mt-0.5">
                                                    {subLabel}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Commercial Invoice & Draft Finalize Actions */}
                                {(() => {
                                    const isVoid = invoiceStatus === 'Void';
                                    const isDraft = !isVoid && (invoiceStatus === 'Draft' || (Boolean(invoiceId) && !isPaid && invoiceStatus !== 'Final' && !invoiceDate));
                                    const isCompleted = ['completed', 'delivered'].includes(request.status);

                                    if (invoiceId && isVoid) {
                                        return (
                                            <div className="mt-4 pt-3 border-t border-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-rose-500/5 p-3.5 rounded-xl border border-rose-500/30">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                                                        <FileText size={18} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold font-mono text-white">
                                                                Invoice #{invoiceId}
                                                            </span>
                                                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/40">
                                                                Voided
                                                            </span>
                                                        </div>
                                                        <div className="text-[11px] text-zinc-400 mt-0.5">
                                                            This commercial invoice has been voided by an administrator.
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            navigate(`${ROUTES.BILLING}?invoiceId=${encodeURIComponent(invoiceId)}`);
                                                        }}
                                                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold font-mono transition-all cursor-pointer"
                                                    >
                                                        <FileText size={13} />
                                                        <span>View in Billing</span>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    }

                                    if (invoiceId && isDraft) {
                                        return (
                                            <div className="mt-4 pt-3 border-t border-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-500/5 p-3.5 rounded-xl border border-amber-500/30">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                                                        <FileText size={18} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold font-mono text-white">
                                                                Draft Invoice #{invoiceId}
                                                            </span>
                                                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40">
                                                                Draft • Review Required
                                                            </span>
                                                        </div>
                                                        <div className="text-[11px] text-zinc-400 mt-0.5">
                                                            Draft commercial invoice generated on repair completion. Review line items, GST breakup, and finalize before client payment.
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            navigate(`${ROUTES.BILLING}?invoiceId=${encodeURIComponent(invoiceId)}&status=Draft`, {
                                                                state: { selectedInvoiceId: invoiceId, status: 'Draft' }
                                                            });
                                                        }}
                                                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-mono transition-all cursor-pointer shadow-lg hover:shadow-amber-500/20"
                                                        title="Open Billing page to review line items, GST breakdown, and finalize invoice"
                                                    >
                                                        <FileText size={13} />
                                                        <span>Review & Finalize Invoice</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setReceiptModalOpen(true)}
                                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold font-mono transition-all cursor-pointer"
                                                        title="Preview Draft Invoice Statement"
                                                    >
                                                        <Receipt size={13} />
                                                        <span>Preview</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handlePrintInvoice}
                                                        disabled={printingInvoice}
                                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold font-mono transition-all cursor-pointer disabled:opacity-50"
                                                        title="Print Draft Invoice"
                                                    >
                                                        {printingInvoice ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                                                        <span>Print</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleDownloadInvoice}
                                                        disabled={downloadingInvoice}
                                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold font-mono transition-all cursor-pointer disabled:opacity-50"
                                                        title="Download Draft Invoice PDF"
                                                    >
                                                        {downloadingInvoice ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                                                        <span>Download</span>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    }

                                    if (isPaid || invoiceId) {
                                        return (
                                            <div className="mt-4 pt-3 border-t border-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/40 p-3.5 rounded-xl border border-zinc-800/70">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                                                        <FileText size={18} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold font-mono text-white">
                                                                Tax Invoice {invoiceId ? `#${invoiceId}` : ''}
                                                            </span>
                                                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold border ${
                                                                isPaid
                                                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                                                    : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                                            }`}>
                                                                {isPaid ? 'Settled / Ready' : 'Finalized • Ready for Payment'}
                                                            </span>
                                                        </div>
                                                        <div className="text-[11px] text-zinc-400 mt-0.5">
                                                            {invoiceDate ? `Issued on: ${new Date(invoiceDate).toLocaleDateString()}` : 'Official GST-compliant repair invoice receipt'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => setReceiptModalOpen(true)}
                                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neon-cyan/15 hover:bg-neon-cyan/25 border border-neon-cyan/30 text-neon-cyan text-xs font-semibold font-mono transition-all cursor-pointer"
                                                        title="View Tax Invoice & Receipt Statement"
                                                    >
                                                        <Receipt size={13} />
                                                        <span>View Invoice</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handlePrintInvoice}
                                                        disabled={printingInvoice}
                                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold font-mono transition-all cursor-pointer disabled:opacity-50"
                                                        title="Print Official Tax Invoice"
                                                    >
                                                        {printingInvoice ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                                                        <span>Print</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleDownloadInvoice}
                                                        disabled={downloadingInvoice}
                                                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold font-mono transition-all cursor-pointer disabled:opacity-50"
                                                        title="Download Tax Invoice PDF"
                                                    >
                                                        {downloadingInvoice ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                                                        <span>Download PDF</span>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    }

                                    if (isCompleted) {
                                        return (
                                            <div className="mt-4 pt-3 border-t border-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/30 p-3.5 rounded-xl border border-zinc-800/60">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-lg bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center text-zinc-400 shrink-0">
                                                        <Receipt size={18} />
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-bold font-mono text-zinc-300">
                                                            Repair Completed • No Commercial Invoice Linked
                                                        </div>
                                                        <div className="text-[11px] text-zinc-500 mt-0.5">
                                                            Repair is completed. Invoices can be generated or managed directly in the Billing module.
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(ROUTES.BILLING)}
                                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold font-mono transition-all cursor-pointer"
                                                >
                                                    <Receipt size={13} />
                                                    <span>Open Billing</span>
                                                </button>
                                            </div>
                                        );
                                    }

                                    return null;
                                })()}
                            </div>

                            {/* Technician Diagnosis & Approximate Budget Card */}
                            <div className="bg-zinc-950/70 border border-zinc-800/60 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-900 pb-3">
                                    <div className="flex items-center gap-2">
                                        <Wrench size={16} className="text-neon-cyan" />
                                        <h4 className="text-xs font-mono uppercase tracking-wider text-white font-bold">
                                            Technician Diagnosis & Approximate Budget
                                        </h4>
                                    </div>
                                    <div>
                                        {getApprovalStatusBadge(request.customerApprovalStatus)}
                                    </div>
                                </div>

                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3">
                                    <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                    <div className="text-xs text-amber-200/90 leading-relaxed font-sans">
                                        <strong className="text-amber-300 font-semibold">Original Repair Estimate (Technician) (Without GST):</strong> This is an approximate repair estimate provided by the technician for approval purposes. It is not the final invoice. The final amount may vary based on actual parts, services, technician/service charges, and applicable taxes after repair completion.
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400">Original Estimate (No GST)</div>
                                        <div className="text-sm sm:text-base font-mono font-bold text-white mt-1">
                                            {request.estimatedCost ? `₹${request.estimatedCost.toFixed(2)}` : 'Not Quoted'}
                                        </div>
                                        <div className="text-[9px] font-mono text-zinc-500 mt-0.5">Base Hardware Scope</div>
                                    </div>

                                    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Additional Charges</div>
                                        <div className="text-sm sm:text-base font-mono font-bold text-zinc-300 mt-1">
                                            {request.additionalCharges ? `₹${request.additionalCharges.toFixed(2)}` : '₹0.00'}
                                        </div>
                                        <div className="text-[9px] font-mono text-zinc-500 mt-0.5">Incidental Surcharges</div>
                                    </div>

                                    <div className="bg-neon-cyan/10 border border-neon-cyan/30 rounded-xl p-3">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-neon-cyan font-bold">Total Approx Quote</div>
                                        <div className="text-sm sm:text-base font-mono font-extrabold text-neon-cyan mt-1">
                                            {approxTotalBudget > 0
                                                ? `₹${approxTotalBudget.toFixed(2)}`
                                                : 'Pending Submission'}
                                        </div>
                                        <div className="text-[9px] font-mono text-cyan-500/80 mt-0.5">Communicated to Client</div>
                                    </div>

                                    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Billed Final Repair</div>
                                        <div className="text-sm sm:text-base font-mono font-bold text-emerald-400 mt-1">
                                            {(request.repairCost || (request as any).repair_cost)
                                                ? `₹${(request.repairCost || (request as any).repair_cost).toFixed(2)}`
                                                : '₹0.00'}
                                        </div>
                                        <div className="text-[9px] font-mono text-zinc-500 mt-0.5">Authoritative Final Charge</div>
                                    </div>
                                </div>

                                {request.customerApprovalStatus === 'rejected' && (
                                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-1">
                                        <div className="text-xs font-bold font-mono text-rose-400 uppercase flex items-center gap-1.5">
                                            <XCircle size={14} /> Customer Declined Estimate
                                        </div>
                                        <p className="text-xs text-rose-300">
                                            Reason: <span className="font-semibold italic">"{request.rejectionReason || 'No detailed reason provided'}"</span>
                                        </p>
                                        <div className="text-[10px] font-mono text-rose-400/80 mt-1">
                                            Device is on hold {request.holdEndDate ? `until ${new Date(request.holdEndDate).toLocaleDateString()}` : 'for 2–5 days'}.
                                        </div>
                                    </div>
                                )}

                                {request.customerApprovalStatus === 'reapproval_requested' && (
                                    <div className="p-3 bg-neon-cyan/10 border border-neon-cyan/20 rounded-xl space-y-1">
                                        <div className="text-xs font-bold font-mono text-neon-cyan uppercase flex items-center gap-1.5">
                                            <RotateCcw size={14} /> Client Requested Reapproval
                                        </div>
                                        <p className="text-xs text-cyan-200">
                                            Notes: <span className="font-semibold italic">"{request.reapprovalNotes || 'No notes'}"</span>
                                        </p>
                                    </div>
                                )}

                                {request.customerApprovalStatus === 'approved' && (
                                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1">
                                        <div className="text-xs font-bold font-mono text-emerald-400 uppercase flex items-center gap-1.5">
                                            <CheckCircle2 size={14} /> Client Approved Repair Quote
                                        </div>
                                        {request.approvedAt && (
                                            <p className="text-xs text-emerald-300">
                                                Approved on {new Date(request.approvedAt).toLocaleString()}
                                            </p>
                                        )}
                                        {request.approvalNotes && (
                                            <p className="text-xs text-emerald-300 italic">
                                                "{request.approvalNotes}"
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Problem Description & Attachments */}
                            <div className="space-y-2">
                                <h4 className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Problem Description ({request.problemType})</h4>
                                <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{request.problemDescription}</div>
                            </div>

                            {(request.imagePath || request.screenshotPath) && (
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Attachments</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {request.imagePath && (
                                            <div className="border border-zinc-900 bg-zinc-950/40 rounded-xl p-3 flex flex-col gap-2 group hover:border-zinc-800 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-zinc-400 font-semibold font-mono flex items-center gap-1.5"><FileImage size={13} className="text-neon-cyan" /> DEVICE_PHOTO</span>
                                                    <a href={getFileUrl(request.imagePath)!} target="_blank" rel="noopener noreferrer" className="text-neon-cyan hover:underline text-[10px] font-mono flex items-center gap-1">OPEN <ExternalLink size={10} /></a>
                                                </div>
                                                <div className="h-28 w-full overflow-hidden bg-black rounded border border-zinc-900 flex items-center justify-center cursor-pointer" onClick={() => onImagePreview(getFileUrl(request.imagePath)!, 'Device Photo')}>
                                                    <img src={getFileUrl(request.imagePath)!} alt="Device" className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105" />
                                                </div>
                                            </div>
                                        )}
                                        {request.screenshotPath && (
                                            <div className="border border-zinc-900 bg-zinc-950/40 rounded-xl p-3 flex flex-col gap-2 group hover:border-zinc-800 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-zinc-400 font-semibold font-mono flex items-center gap-1.5"><FileImage size={13} className="text-neon-cyan" /> SCREENSHOT</span>
                                                    <a href={getFileUrl(request.screenshotPath)!} target="_blank" rel="noopener noreferrer" className="text-neon-cyan hover:underline text-[10px] font-mono flex items-center gap-1">OPEN <ExternalLink size={10} /></a>
                                                </div>
                                                <div className="h-28 w-full overflow-hidden bg-black rounded border border-zinc-900 flex items-center justify-center cursor-pointer" onClick={() => onImagePreview(getFileUrl(request.screenshotPath)!, 'Screenshot')}>
                                                    <img src={getFileUrl(request.screenshotPath)!} alt="Screenshot" className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Device Repair History & Recurring Issue Assessment */}
                            {(repeatHistory.length > 0 || deviceId) && (
                                <div className="p-4 sm:p-5 border border-zinc-800/60 bg-zinc-950/60 rounded-xl space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-900 pb-3">
                                        <div className="flex items-center gap-2">
                                            <Clock size={15} className="text-neon-cyan" />
                                            <h4 className="text-xs font-mono uppercase font-bold text-white tracking-wider">
                                                Hardware Service & Repair History
                                            </h4>
                                            {repeatHistory.length > 1 && (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                                    Recurring ({repeatHistory.length} tickets)
                                                </span>
                                            )}
                                        </div>
                                        {deviceId && (
                                            <button
                                                onClick={() => setHistoryModalDeviceId(Number(deviceId))}
                                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-medium text-neon-cyan hover:bg-neon-cyan/10 border border-neon-cyan/30 transition-all cursor-pointer w-fit"
                                            >
                                                <Layers size={12} />
                                                <span>View Complete History Drawer</span>
                                            </button>
                                        )}
                                    </div>

                                    {repeatHistory.length > 1 && (
                                        <div className="bg-rose-500/10 border border-rose-500/25 rounded-lg p-3 flex items-start gap-2.5 text-xs text-rose-300">
                                            <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                                            <div>
                                                <strong className="text-rose-200">Recurring Hardware Alert:</strong> This physical device ({request.brand} {request.modelNumber || ''}) has {repeatHistory.length} total logged service requests. Review past technician work logs for repeat component failures.
                                            </div>
                                        </div>
                                    )}

                                    {repeatHistory.length > 0 ? (
                                        <div className="space-y-3 pt-1">
                                            {repeatHistory.map((hist: any, index: number) => (
                                                <div key={index} className="bg-zinc-900/40 border border-zinc-800/60 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-zinc-700 transition-colors">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-mono font-bold text-white">
                                                                {hist.ticketNumber || `#${hist.id}`}
                                                            </span>
                                                            <span className="text-[10px] font-mono px-2 py-0.5 rounded uppercase font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
                                                                {hist.status}
                                                            </span>
                                                            <span className="text-[10px] font-mono text-zinc-500">
                                                                {hist.createdAt ? new Date(hist.createdAt).toLocaleDateString() : ''}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-zinc-400 italic">
                                                            "{hist.problemDescription || 'No description logged'}"
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-zinc-500 font-mono py-2">
                                            This is the first logged service ticket for this device.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Status Update Actions */}
                            <div className="border-t border-zinc-900 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="text-xs text-zinc-400 font-mono">UPDATE_TICKET_STATUS:</div>
                                <div className="flex flex-wrap gap-2">
                                    {statusLoading ? (
                                        <Loader2 size={16} className="animate-spin text-neon-cyan" />
                                    ) : request.status === 'delivered' ? (
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                                                <Lock size={13} />
                                                <span>TICKET DELIVERED (LOCKED)</span>
                                            </div>
                                            <button
                                                onClick={() => setShowOverrideModal(true)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-all cursor-pointer"
                                            >
                                                ADMIN OVERRIDE
                                            </button>
                                        </div>
                                    ) : request.status === 'completed' ? (
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                                <CheckCircle2 size={13} />
                                                <span>REPAIR COMPLETED</span>
                                            </div>
                                            <button
                                                onClick={() => handleStatusChange('delivered')}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/40 hover:bg-blue-500/20 transition-all cursor-pointer"
                                            >
                                                <Truck size={13} />
                                                <span>MARK DELIVERED</span>
                                            </button>
                                            <button
                                                onClick={() => setShowOverrideModal(true)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-all cursor-pointer"
                                            >
                                                ADMIN OVERRIDE
                                            </button>
                                        </div>
                                    ) : (
                                        ['pending', 'in_progress', 'completed', 'delivered', 'cancelled'].map(st => (
                                            <button
                                                key={st}
                                                onClick={() => handleStatusChange(st)}
                                                disabled={request.status === st}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                                                    request.status === st
                                                        ? st === 'pending'
                                                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/40'
                                                            : st === 'in_progress'
                                                                ? 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/40'
                                                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40'
                                                        : 'bg-zinc-950 border-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                                                } disabled:cursor-not-allowed`}
                                            >
                                                {st.replace('_', ' ').toUpperCase()}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Assign Technician */}
                            <div className="border-t border-zinc-900 pt-4">
                                <div className="text-xs text-zinc-400 font-mono mb-3 flex items-center gap-2">
                                    <UserCog size={14} className="text-neon-cyan" />
                                    <span>ASSIGN TECHNICIAN</span>
                                </div>
                                <div className="flex gap-3">
                                    <select
                                        value={selectedTechForAssign}
                                        onChange={e => setSelectedTechForAssign(e.target.value === '' ? '' : Number(e.target.value))}
                                        className="flex-grow bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan cursor-pointer"
                                    >
                                        <option value="">-- No Technician Selected --</option>
                                        {technicians.map(t => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
                                    </select>
                                    <button
                                        onClick={handleAssign}
                                        disabled={assignLoading || selectedTechForAssign === '' || selectedTechForAssign === (request.pendingTechnicianId || request.assignedTechnicianId)}
                                        className="shrink-0 flex items-center gap-2 bg-neon-cyan hover:bg-cyan-400 text-black px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    >
                                        {assignLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                        Assign
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── WORK LOG TAB ── */}
                    {modalTab === 'work-log' && (
                        <div className="space-y-4">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Technician Work Log History</div>
                            {workLogsLoading ? (
                                <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 size={13} className="animate-spin" /> Loading logs...</div>
                            ) : workLogs.length === 0 ? (
                                <div className="text-center py-10 border border-zinc-900 rounded-xl text-zinc-600 text-xs">No work log entries for this ticket yet.</div>
                            ) : (
                                <div className="space-y-3">
                                    {workLogs.map(log => (
                                        <div key={log.id} className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 space-y-2">
                                            <div className="flex items-center justify-between flex-wrap gap-2">
                                                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold border bg-blue-500/10 text-blue-400 border-blue-500/20">{log.repair_stage}</span>
                                                <span className="text-[10px] font-mono text-zinc-600">{new Date(log.created_at).toLocaleString()}</span>
                                            </div>
                                            <p className="text-sm text-zinc-300 leading-relaxed">{log.action_performed}</p>
                                            <div className="flex flex-wrap gap-4 text-xs">
                                                {log.parts_replaced && <span className="text-zinc-400"><span className="text-zinc-600">Parts:</span> {log.parts_replaced}</span>}
                                                {log.time_spent && <span className="text-zinc-400"><span className="text-zinc-600">Time:</span> {log.time_spent}</span>}
                                                {log.technician_name && <span className="text-zinc-500 font-mono"><span className="text-zinc-600">By:</span> {log.technician_name}</span>}
                                            </div>
                                            {log.notes && <p className="text-xs text-zinc-500 italic border-l-2 border-zinc-800 pl-3">{log.notes}</p>}
                                            {log.media_path && (
                                                <a href={getFileUrl(log.media_path)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-neon-cyan text-xs hover:underline">
                                                    <FileImage size={12} /> View Media <ExternalLink size={10} />
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── TRANSFERS TAB ── */}
                    {modalTab === 'transfers' && (
                        <div className="space-y-4">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                                <Layers size={12} className="text-neon-cyan" /> Movement & Transfer Chain
                            </div>

                            {transfersLoading ? (
                                <div className="p-10 flex flex-col items-center justify-center">
                                    <Loader2 size={24} className="animate-spin text-neon-cyan mb-2" />
                                    <p className="text-xs font-mono text-zinc-500">Loading transfer history chain...</p>
                                </div>
                            ) : transfersChain.length === 0 ? (
                                <div className="text-center py-10 border border-zinc-900 rounded-xl text-zinc-600 text-xs font-mono">
                                    No transfers recorded for this task yet.
                                </div>
                            ) : (
                                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
                                    {transfersChain.map((t, idx) => (
                                        <div key={t.id} className="relative group">
                                            <div className={`absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 bg-black ${
                                                t.transferStatus === 'accepted'
                                                    ? 'border-emerald-400'
                                                    : t.transferStatus === 'rejected'
                                                        ? 'border-rose-500'
                                                        : 'border-amber-400'
                                            }`} />

                                            <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-4 space-y-2.5 hover:border-zinc-700 transition-colors">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold font-mono text-white">Event #{idx + 1}</span>
                                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded uppercase font-semibold bg-zinc-800 text-zinc-400">
                                                            {t.transferStatus}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] font-mono text-zinc-500">
                                                        {new Date(t.transferredAt).toLocaleString()}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-zinc-900/40 rounded-lg p-3">
                                                    <div>
                                                        <div className="text-[10px] font-mono text-zinc-500 uppercase">From Technician</div>
                                                        <div className="text-zinc-200 font-mono mt-0.5 font-medium">
                                                            {t.fromTechnicianName || 'Initial Assignment'}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-mono text-neon-cyan uppercase">To Technician</div>
                                                        <div className="text-neon-cyan font-mono mt-0.5 font-semibold">
                                                            {t.toTechnicianName}
                                                        </div>
                                                    </div>
                                                </div>

                                                {t.reason && (
                                                    <div className="text-xs text-zinc-300 bg-black/40 rounded-lg p-2.5 border border-zinc-900 leading-relaxed">
                                                        <span className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">Reason:</span>
                                                        "{t.reason}"
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── CUSTOMER NOTE TAB ── */}
                    {modalTab === 'customer-note' && (
                        <div className="space-y-3">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Customer-Facing Repair Description</div>
                            {(request as any).customerRepairDescription ? (
                                <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                    {(request as any).customerRepairDescription}
                                </div>
                            ) : (
                                <div className="text-center py-10 border border-zinc-900 rounded-xl text-zinc-600 text-xs">
                                    No customer repair description yet. Technicians can add this from their workbench.
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>

            {/* Controlled Admin Override Confirmation Modal */}
            {showOverrideModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl relative">
                        <div className="flex items-center gap-2 text-amber-400">
                            <AlertTriangle size={18} />
                            <h3 className="text-sm font-bold uppercase font-mono tracking-wider">Administrative Override</h3>
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed">
                            You are overriding the customer approval / hold decision to resume repair work on ticket <span className="text-white font-semibold">{request.ticketNumber || `#${request.id}`}</span>. Please provide an audit justification.
                        </p>
                        <textarea
                            rows={3}
                            value={overrideReason}
                            onChange={e => setOverrideReason(e.target.value)}
                            placeholder="Reason for administrative override (required)..."
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-400"
                        />
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                onClick={() => { setShowOverrideModal(false); setOverrideReason(''); }}
                                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleOverrideApproval}
                                disabled={isOverriding || !overrideReason.trim()}
                                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-xl transition-all disabled:opacity-50"
                            >
                                {isOverriding ? 'Overriding...' : 'Confirm Override'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Device Repair History Modal / Drawer */}
            {historyModalDeviceId && (
                <DeviceRepairHistoryModal
                    deviceId={historyModalDeviceId}
                    onClose={() => setHistoryModalDeviceId(null)}
                    asDrawer={true}
                />
            )}

            {/* Offline Payment Rejection Modal */}
            {rejectionModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-[#121216] border border-zinc-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl relative">
                        <div className="flex items-center justify-between">
                            <h4 className="text-base font-bold text-white font-mono flex items-center gap-2">
                                <AlertCircle size={18} className="text-red-400" />
                                Reject Offline Payment
                            </h4>
                            <button
                                onClick={() => { setRejectionModalOpen(false); setRejectionReason(''); }}
                                className="text-zinc-500 hover:text-white p-1 rounded-lg cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <p className="text-xs text-zinc-400 font-mono">
                            Ticket: <span className="text-neon-cyan font-bold">{request.ticketNumber || `#${request.id}`}</span>. Specify the reason for rejection (this will be sent to the customer/company).
                        </p>
                        <textarea
                            rows={3}
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="e.g. UTR number invalid / Cash amount mismatch / Account not credited..."
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-red-400 font-mono resize-none"
                        />
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => { setRejectionModalOpen(false); setRejectionReason(''); }}
                                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl text-xs font-mono transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={!rejectionReason.trim() || verifyingPayment}
                                onClick={() => handleVerifyOfflinePayment('reject', rejectionReason.trim())}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-mono font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                            >
                                {verifyingPayment ? <Loader2 size={13} className="animate-spin" /> : null}
                                Confirm Rejection
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View, Print, and Download Payment Receipt / Tax Invoice Modal */}
            <PaymentReceiptModal
                isOpen={receiptModalOpen}
                onClose={() => setReceiptModalOpen(false)}
                ticketId={request.id}
                ticketNumber={request.ticketNumber}
            />
        </div>
    );
}
