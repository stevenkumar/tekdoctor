import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Cpu, Hammer, PackageSearch, CheckCheck, Truck, FileText,
    ClipboardList, ArrowRightLeft, Bell, Phone, Mail, MapPin,
    Clock, Calendar, CreditCard, Star, FileImage, ExternalLink,
    Lock, AlertTriangle, CheckCircle2, XCircle, RotateCcw,
    Hourglass, ShieldAlert, Loader2, Send, ChevronLeft, ChevronDown,
    Plus, Upload, Layers, Printer, Download, Receipt, X, Banknote
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { repairApi, billingApi } from '@/services/api';
import type { ServiceRequest, WorkLog, TaskTransfer } from '@/services/api';
import { appConfig } from '@/config/appConfig';
import { PaymentReceiptModal } from '@/components/PaymentReceiptModal';
import { downloadPaymentBillPdf, printPaymentBill } from '@/utils/billGenerator';
import { sanitizeAmountInput, handleAmountKeyDown } from '@/utils/currencyUtils';

export type ModalTab = 'overview' | 'diagnosis' | 'work-log' | 'transfers' | 'milestones' | 'customer-note';

const MILESTONES = [
    { key: 'diagnosis_completed', label: 'Diagnosis Completed', icon: <Cpu size={14} />, color: 'text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20' },
    { key: 'repair_started', label: 'Repair Started', icon: <Hammer size={14} />, color: 'text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20' },
    { key: 'parts_required', label: 'Parts Required', icon: <PackageSearch size={14} />, color: 'text-orange-400 border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20' },
    { key: 'repair_completed', label: 'Repair Completed', icon: <CheckCheck size={14} />, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20' },
    { key: 'ready_for_pickup', label: 'Ready for Pickup', icon: <Truck size={14} />, color: 'text-neon-cyan border-neon-cyan/30 bg-neon-cyan/10 hover:bg-neon-cyan/20' },
];

const REPAIR_STAGES = [
    'Initial Inspection',
    'Diagnosis',
    'Parts Sourcing',
    'Repair in Progress',
    'Quality Check',
    'Final Testing',
    'Packaging',
    'Ready for Delivery',
];

const stageBadgeColor: Record<string, string> = {
    'diagnosis': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'repair': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'parts': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    'quality': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    'ready': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

const getStageBadge = (stage: string) => {
    const key = Object.keys(stageBadgeColor).find(k => stage.toLowerCase().includes(k));
    const cls = key ? stageBadgeColor[key] : 'bg-zinc-800 text-zinc-400 border-zinc-700';
    return <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${cls}`}>{stage}</span>;
};

const getFileUrl = (filePath: string | null) => {
    if (!filePath) return null;
    const base = appConfig.apiUrl || window.location.origin;
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const cleanPath = filePath.replace(/^\//, '');
    return `${cleanBase}/${cleanPath}`;
};

export const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
        case 'pending': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"><Hourglass size={12} /> PENDING</span>;
        case 'in_progress': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20"><Hammer size={12} /> IN_PROGRESS</span>;
        case 'completed': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 size={12} /> COMPLETED</span>;
        case 'delivered': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20"><Truck size={12} /> DELIVERED</span>;
        case 'cancelled': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-red-500/10 text-red-400 border border-red-500/20"><XCircle size={12} /> CANCELLED</span>;
        default: return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">{status.toUpperCase()}</span>;
    }
};

export const getPriorityBadge = (priority: string) => {
    if (priority?.toLowerCase() === 'priority' || priority?.toLowerCase() === 'urgent') {
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">Priority</span>;
    }
    return <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-zinc-800 text-zinc-400 border border-zinc-700">Standard</span>;
};

export const getApprovalStatusBadge = (approvalStatus?: string | null) => {
    const status = approvalStatus?.toLowerCase() || 'none';
    switch (status) {
        case 'pending_approval':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
                    <Hourglass size={11} /> Waiting for Customer Approval
                </span>
            );
        case 'approved':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                    <CheckCircle2 size={11} /> Customer Approved
                </span>
            );
        case 'rejected':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap">
                    <XCircle size={11} /> Customer Rejected / On Hold
                </span>
            );
        case 'on_hold':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
                    <Clock size={11} /> Customer Rejected / On Hold
                </span>
            );
        case 'reapproval_requested':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 whitespace-nowrap">
                    <RotateCcw size={11} /> Reapproval Requested
                </span>
            );
        case 'auto_cancelled':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap">
                    <XCircle size={11} /> Hold Expired / Cancelled
                </span>
            );
        default:
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono text-zinc-400 bg-zinc-900/60 border border-zinc-800 whitespace-nowrap">
                    Pending Diagnosis
                </span>
            );
    }
};

export type DiagFormType = {
    diagnosis: string;
    identifiedIssues: string;
    requiredWork: string;
    requiredParts: string;
    estimatedCost: string;
    additionalCharges: string;
    estimatedCompletionDate: string;
    inspectionNotes: string;
    deviceCondition: string;
};

export const extractDiagForm = (t: ServiceRequest): DiagFormType => ({
    diagnosis: t.diagnosis || '',
    identifiedIssues: t.identifiedIssues || '',
    requiredWork: t.requiredWork || '',
    requiredParts: t.requiredParts || '',
    estimatedCost: t.estimatedCost ? String(t.estimatedCost) : '',
    additionalCharges: t.additionalCharges ? String(t.additionalCharges) : '',
    estimatedCompletionDate: t.estimatedCompletionDate ? t.estimatedCompletionDate.split('T')[0] : '',
    inspectionNotes: t.inspectionNotes || '',
    deviceCondition: t.deviceCondition || '',
});

interface TechnicianTaskWorkspaceProps {
    task: ServiceRequest;
    initialTab?: ModalTab;
    user: any;
    token: string | null;
    onBack: () => void;
    onTaskUpdated: (updatedTask: Partial<ServiceRequest>) => void;
    onInitiateTransfer: () => void;
    onImagePreview: (src: string, alt: string) => void;
    onAcceptAssignment?: (e: React.MouseEvent, taskId: number) => void;
    onRejectAssignment?: (e: React.MouseEvent, taskId: number) => void;
}

export default function TechnicianTaskWorkspace({
    task,
    initialTab = 'overview',
    user,
    token,
    onBack,
    onTaskUpdated,
    onInitiateTransfer,
    onImagePreview,
    onAcceptAssignment,
    onRejectAssignment,
}: TechnicianTaskWorkspaceProps) {
    const isAssignedToMe = task.assignedTechnicianId === user?.id;
    const isPendingAcceptance = task.pendingTechnicianId === user?.id && !isAssignedToMe;

    const [activeTab, setActiveTab] = useState<ModalTab>(initialTab);

    // Work Log State
    const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
    const [workLogsLoading, setWorkLogsLoading] = useState(false);
    const [newLog, setNewLog] = useState({ repairStage: '', actionPerformed: '', partsReplaced: '', timeSpent: '', notes: '' });
    const [logMediaFile, setLogMediaFile] = useState<File | null>(null);
    const [submittingLog, setSubmittingLog] = useState(false);

    // Milestones State
    const [selectedMilestone, setSelectedMilestone] = useState('');
    const [milestoneNotes, setMilestoneNotes] = useState('');
    const [sendingMilestone, setSendingMilestone] = useState(false);

    // Customer Description State
    const [customerDesc, setCustomerDesc] = useState(task.customerRepairDescription || '');
    const [savingDesc, setSavingDesc] = useState(false);

    // Diagnosis & Estimate Form State
    const [diagForm, setDiagForm] = useState<DiagFormType>(() => extractDiagForm(task));
    const [submittingDiagnosis, setSubmittingDiagnosis] = useState(false);

    // Context preservation refs across 30-second auto-refresh cycles
    const prevTaskIdRef = useRef<number>(task.id);
    const lastServerDiagRef = useRef<DiagFormType>(extractDiagForm(task));
    const lastServerCustomerDescRef = useRef<string>(task.customerRepairDescription || '');
    const dirtyDiagFieldsRef = useRef<Set<keyof DiagFormType>>(new Set());
    const isCustomerDescDirtyRef = useRef<boolean>(false);
    const diagFormRef = useRef<DiagFormType>(diagForm);
    diagFormRef.current = diagForm;
    const customerDescRef = useRef<string>(customerDesc);
    customerDescRef.current = customerDesc;

    const handleDiagFieldChange = <K extends keyof DiagFormType>(field: K, value: DiagFormType[K]) => {
        dirtyDiagFieldsRef.current.add(field);
        setDiagForm(prev => ({ ...prev, [field]: value }));
    };

    const handleCustomerDescChange = (val: string) => {
        isCustomerDescDirtyRef.current = true;
        setCustomerDesc(val);
    };

    // Bill / Invoice modal & action state
    const [billReceiptModalOpen, setBillReceiptModalOpen] = useState(false);
    const [billReceiptData, setBillReceiptData] = useState<any>(null);
    const [isBillActionLoading, setIsBillActionLoading] = useState(false);
    const [recordingCash, setRecordingCash] = useState(false);
    const [initiatingCash, setInitiatingCash] = useState(false);

    const isInvoiceFinal = (task as any).invoiceStatus === 'Final' || (task as any).invoice_status === 'Final';
    const paymentStatus = (task as any).paymentStatus || (task as any).payment_status || 'unpaid';
    const paymentMethod = ((task as any).paymentMethod || (task as any).payment_method || '').toLowerCase().trim();
    const isCashPayment = paymentMethod === 'cash';
    const isCollected = (task as any).collectionStatus === 'collected' || (task as any).collection_status === 'collected';
    const isPaid = paymentStatus === 'paid';

    const handleInitiateCash = async () => {
        if (!token) return;
        if (!isInvoiceFinal) {
            toast.error('Cash collection is unavailable until the final invoice is released.');
            return;
        }
        setInitiatingCash(true);
        try {
            const res = await billingApi.initiateOfflinePayment({
                ticketId: task.id,
                paymentMethod: 'cash'
            }, token);
            if (res.ok) {
                toast.success('Cash payment initiated. You can now record physical cash collection.');
                onTaskUpdated({
                    paymentMethod: 'cash',
                    payment_method: 'cash',
                    paymentStatus: 'pending_verification',
                    payment_status: 'pending_verification',
                    collectionStatus: 'pending_collection',
                    collection_status: 'pending_collection'
                } as any);
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
            const res = await billingApi.recordCashCollected({ ticketId: task.id }, token);
            if (res.ok) {
                toast.success('Cash collection recorded! Payment status is now pending admin verification.');
                onTaskUpdated({
                    collectionStatus: 'collected',
                    collection_status: 'collected',
                    paymentStatus: 'pending_verification',
                    payment_status: 'pending_verification'
                } as any);
            } else {
                toast.error(res.error || 'Failed to record cash collection.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error recording cash collection.');
        } finally {
            setRecordingCash(false);
        }
    };

    const handleViewBill = async () => {
        try {
            setIsBillActionLoading(true);
            const res = await billingApi.getPaymentReceiptByTicket(task.id, token || undefined);
            const receipt = res.data?.data || res.data?.receipt || (res.data?.receiptNumber ? res.data : null);
            if (res.ok && receipt) {
                setBillReceiptData(receipt);
                setBillReceiptModalOpen(true);
            } else {
                toast.error(res.error || 'Could not load bill receipt details.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Failed to fetch invoice/receipt.');
        } finally {
            setIsBillActionLoading(false);
        }
    };

    const handlePrintBill = async () => {
        try {
            setIsBillActionLoading(true);
            const res = await billingApi.getPaymentReceiptByTicket(task.id, token || undefined);
            const receipt = res.data?.data || res.data?.receipt || (res.data?.receiptNumber ? res.data : null);
            if (res.ok && receipt) {
                await printPaymentBill(receipt);
            } else {
                toast.error(res.error || 'Could not load bill receipt for printing.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Failed to print document.');
        } finally {
            setIsBillActionLoading(false);
        }
    };

    const handleDownloadBill = async () => {
        try {
            setIsBillActionLoading(true);
            const res = await billingApi.getPaymentReceiptByTicket(task.id, token || undefined);
            const receipt = res.data?.data || res.data?.receipt || (res.data?.receiptNumber ? res.data : null);
            if (res.ok && receipt) {
                await downloadPaymentBillPdf(receipt);
                toast.success('Document downloaded successfully');
            } else {
                toast.error(res.error || 'Could not load bill receipt for download.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Failed to download PDF.');
        } finally {
            setIsBillActionLoading(false);
        }
    };
    const [isEditingDiagnosis, setIsEditingDiagnosis] = useState(false);
    const [diagFormErrors, setDiagFormErrors] = useState<{ diagnosis?: string; estimatedCost?: string; additionalCharges?: string }>({});

    // Task Transfers
    const [ticketTransfers, setTicketTransfers] = useState<TaskTransfer[]>([]);
    const [ticketTransfersLoading, setTicketTransfersLoading] = useState(false);

    // Status Update Loading
    const [statusLoading, setStatusLoading] = useState(false);

    const fetchWorkLogs = useCallback(async () => {
        if (!token) return;
        setWorkLogsLoading(true);
        try {
            const res = await repairApi.getWorkLogs(token, task.id);
            if (res.ok && res.data) {
                setWorkLogs((res.data as any).data || []);
            }
        } finally {
            setWorkLogsLoading(false);
        }
    }, [token, task.id]);

    const fetchTicketTransfers = useCallback(async () => {
        if (!token) return;
        setTicketTransfersLoading(true);
        try {
            const res = await repairApi.getTicketTransfers(token, task.id);
            if (res.data?.data) {
                setTicketTransfers(res.data.data);
            } else {
                setTicketTransfers([]);
            }
        } catch (e) {
            console.error('Failed to load ticket transfers', e);
        } finally {
            setTicketTransfersLoading(false);
        }
    }, [token, task.id]);

    useEffect(() => {
        if (activeTab === 'work-log') {
            fetchWorkLogs();
        } else if (activeTab === 'transfers') {
            fetchTicketTransfers();
        }
    }, [activeTab, fetchWorkLogs, fetchTicketTransfers]);

    useEffect(() => {
        // SCENARIO 1: Technician switched to a DIFFERENT task
        if (task.id !== prevTaskIdRef.current) {
            prevTaskIdRef.current = task.id;

            // Clear dirty tracking for the new task
            dirtyDiagFieldsRef.current.clear();
            isCustomerDescDirtyRef.current = false;

            // Reset baseline server values to the new task
            const newDiag = extractDiagForm(task);
            lastServerDiagRef.current = newDiag;
            lastServerCustomerDescRef.current = task.customerRepairDescription || '';

            // Reset form states to the new task's data
            setDiagForm(newDiag);
            setCustomerDesc(task.customerRepairDescription || '');
            setIsEditingDiagnosis(false);
            setDiagFormErrors({});

            // Reset work log draft & attachments for new task
            setNewLog({ repairStage: '', actionPerformed: '', partsReplaced: '', timeSpent: '', notes: '' });
            setLogMediaFile(null);

            // Reset milestone draft for new task
            setSelectedMilestone('');
            setMilestoneNotes('');

            // Switch to initialTab if provided
            if (initialTab) {
                setActiveTab(initialTab);
            }
            return;
        }

        // SCENARIO 2: SAME task — 30-second background auto-refresh or polling update
        const serverDiag = extractDiagForm(task);
        const serverCustomerDesc = task.customerRepairDescription || '';

        // 1. Preserve or update Customer Description
        const isCustomerDirty = isCustomerDescDirtyRef.current || (customerDescRef.current !== lastServerCustomerDescRef.current);
        if (!isCustomerDirty) {
            // User has NOT edited customerDesc; if server changed, sync it
            if (serverCustomerDesc !== lastServerCustomerDescRef.current) {
                setCustomerDesc(serverCustomerDesc);
                lastServerCustomerDescRef.current = serverCustomerDesc;
            }
        } else {
            // User HAS unsaved edits in customerDesc: DO NOT overwrite!
            lastServerCustomerDescRef.current = serverCustomerDesc;
        }

        // 2. Preserve or update Diagnosis & Estimate form fields
        setDiagForm(prevCurrentForm => {
            const updatedForm: DiagFormType = { ...prevCurrentForm };
            let hasChanges = false;

            (Object.keys(serverDiag) as Array<keyof DiagFormType>).forEach(key => {
                const isFieldDirty = dirtyDiagFieldsRef.current.has(key) || (prevCurrentForm[key] !== lastServerDiagRef.current[key]);
                if (isFieldDirty) {
                    // Technician has unsaved edits in this field: PRESERVE technician's value!
                } else {
                    // Field was untouched by user. If server value changed, update it.
                    if (serverDiag[key] !== prevCurrentForm[key]) {
                        updatedForm[key] = serverDiag[key];
                        hasChanges = true;
                    }
                }
            });

            // Update baseline server values reference for subsequent refresh comparisons
            lastServerDiagRef.current = serverDiag;

            return hasChanges ? updatedForm : prevCurrentForm;
        });
    }, [task, initialTab]);

    const handleStatusChange = async (newStatus: ServiceRequest['status']) => {
        if (!token || !newStatus) return;
        if (task.status === 'in_progress' && newStatus === 'pending') {
            toast.error("Tickets in progress cannot be reverted to Pending.");
            return;
        }
        if (newStatus === 'in_progress') {
            const approval = task.customerApprovalStatus?.toLowerCase();
            if (approval && approval !== 'none' && approval !== 'approved') {
                if (approval === 'pending_approval') {
                    toast.error("Cannot start repair: Approximate budget is awaiting customer approval.");
                    return;
                }
                if (approval === 'rejected' || approval === 'on_hold') {
                    toast.error("Cannot start repair: Customer declined the repair estimate (Ticket is On Hold).");
                    return;
                }
                if (approval === 'auto_cancelled') {
                    toast.error("Cannot start repair: Customer approval window has expired and ticket is cancelled.");
                    return;
                }
            }
        }
        setStatusLoading(true);
        try {
            const res = await repairApi.updateStatus(token, task.id, newStatus);
            if (res.ok) {
                toast.success(`Status updated to ${newStatus.replace('_', ' ').toUpperCase()}`);
                onTaskUpdated({ status: newStatus });
            } else {
                toast.error(res.error || 'Failed to update status.');
            }
        } catch (e) {
            toast.error('Network error while updating status.');
        } finally {
            setStatusLoading(false);
        }
    };

    const handleSubmitWorkLog = async () => {
        if (!token) return;
        if (!isAssignedToMe) {
            toast.error("Work log creation is restricted to the assigned technician.");
            return;
        }
        if (!newLog.repairStage || !newLog.actionPerformed) {
            toast.error('Repair stage and action performed are required.');
            return;
        }
        if (newLog.notes && newLog.notes.length > 500) {
            toast.error('Work log notes cannot exceed 500 characters.');
            return;
        }
        setSubmittingLog(true);
        try {
            const fd = new FormData();
            fd.append('repairStage', newLog.repairStage);
            fd.append('actionPerformed', newLog.actionPerformed);
            if (newLog.partsReplaced) fd.append('partsReplaced', newLog.partsReplaced);
            if (newLog.timeSpent) fd.append('timeSpent', newLog.timeSpent);
            if (newLog.notes) fd.append('notes', newLog.notes);
            if (logMediaFile) fd.append('workLogMedia', logMediaFile);

            const res = await repairApi.createWorkLog(token, task.id, fd);
            if (res.ok) {
                toast.success('Work log entry added!');
                setNewLog({ repairStage: '', actionPerformed: '', partsReplaced: '', timeSpent: '', notes: '' });
                setLogMediaFile(null);
                fetchWorkLogs();
            } else {
                toast.error(res.error || 'Failed to add work log.');
            }
        } finally {
            setSubmittingLog(false);
        }
    };

    const handleSendMilestone = async () => {
        if (!token || !selectedMilestone) {
            toast.error('Please select a milestone.');
            return;
        }
        if (!isAssignedToMe) {
            toast.error("Milestone notifications can only be sent by the assigned technician.");
            return;
        }
        if (milestoneNotes && milestoneNotes.length > 500) {
            toast.error('Milestone notes cannot exceed 500 characters.');
            return;
        }
        setSendingMilestone(true);
        try {
            const res = await repairApi.sendMilestoneNotification(token, task.id, selectedMilestone, milestoneNotes);
            if (res.ok) {
                const emailSent = (res.data as any)?.data?.emailSent;
                toast.success(`Notification sent!${emailSent ? ' Email dispatched.' : ''}`);
                setSelectedMilestone('');
                setMilestoneNotes('');
            } else {
                toast.error(res.error || 'Failed to send milestone notification.');
            }
        } finally {
            setSendingMilestone(false);
        }
    };

    const handleSaveCustomerDesc = async () => {
        if (!token) return;
        if (!isAssignedToMe) {
            toast.error("Only the assigned technician can modify the customer repair description.");
            return;
        }
        const trimmedNote = customerDesc.trim();
        if (!trimmedNote) {
            toast.error("Customer note cannot be empty.");
            return;
        }
        if (trimmedNote.length > 500) {
            toast.error("Customer note cannot exceed 500 characters.");
            return;
        }
        setSavingDesc(true);
        try {
            const res = await repairApi.updateCustomerDescription(token, task.id, trimmedNote);
            if (res.ok) {
                toast.success('Customer note saved successfully!');
                isCustomerDescDirtyRef.current = false;
                lastServerCustomerDescRef.current = trimmedNote;
                setCustomerDesc(trimmedNote);
                onTaskUpdated({ customerRepairDescription: trimmedNote });
            } else {
                toast.error(res.error || 'Failed to save customer note.');
            }
        } finally {
            setSavingDesc(false);
        }
    };

    const handleSubmitDiagnosis = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        if (!isAssignedToMe) {
            toast.error("Diagnosis submission is restricted to the assigned technician.");
            return;
        }
        setDiagFormErrors({});

        const errs: { diagnosis?: string; estimatedCost?: string; additionalCharges?: string } = {};
        if (!diagForm.diagnosis.trim()) {
            errs.diagnosis = 'Diagnosis description is required.';
        } else if (diagForm.diagnosis.trim().length > 500) {
            errs.diagnosis = 'Diagnosis description cannot exceed 500 characters.';
        }

        const trimmedCost = String(diagForm.estimatedCost || '').trim();
        const costNum = Number(trimmedCost);
        if (!trimmedCost) {
            errs.estimatedCost = 'Approximate repair budget is required.';
        } else if (isNaN(costNum) || costNum < 0) {
            errs.estimatedCost = 'Please enter a valid approximate repair budget (₹0 or greater).';
        } else if (costNum > 10000000) {
            errs.estimatedCost = 'Approximate budget cannot exceed ₹10,000,000.';
        } else if (trimmedCost.includes('.') && trimmedCost.split('.')[1].length > 2) {
            errs.estimatedCost = 'Amount cannot exceed 2 decimal places.';
        }

        const trimmedAdd = String(diagForm.additionalCharges || '').trim();
        const addNum = trimmedAdd ? Number(trimmedAdd) : 0;
        if (trimmedAdd) {
            if (isNaN(addNum) || addNum < 0) {
                errs.additionalCharges = 'Additional charges must be a valid amount (₹0 or greater).';
            } else if (addNum > 10000000) {
                errs.additionalCharges = 'Additional charges cannot exceed ₹10,000,000.';
            } else if (trimmedAdd.includes('.') && trimmedAdd.split('.')[1].length > 2) {
                errs.additionalCharges = 'Amount cannot exceed 2 decimal places.';
            }
        }

        if (Object.keys(errs).length > 0) {
            setDiagFormErrors(errs);
            return;
        }

        setSubmittingDiagnosis(true);
        try {
            const payload = {
                diagnosis: diagForm.diagnosis.trim(),
                identifiedIssues: diagForm.identifiedIssues.trim() || undefined,
                requiredWork: diagForm.requiredWork.trim() || undefined,
                requiredParts: diagForm.requiredParts.trim() || undefined,
                estimatedCost: costNum,
                additionalCharges: diagForm.additionalCharges ? parseFloat(diagForm.additionalCharges) || 0 : 0,
                estimatedCompletionDate: diagForm.estimatedCompletionDate || undefined,
                inspectionNotes: diagForm.inspectionNotes.trim() || undefined,
                deviceCondition: diagForm.deviceCondition.trim() || undefined
            };

            const res = await repairApi.submitDiagnosis(token, task.id, payload);
            if (res.ok) {
                toast.success('Diagnosis & approximate estimate submitted to customer!');
                setIsEditingDiagnosis(false);
                const updatedFields = {
                    ...payload,
                    customerApprovalStatus: 'pending_approval',
                    estimateSubmittedAt: new Date().toISOString()
                };
                const newSavedDiag = extractDiagForm({ ...task, ...updatedFields });
                lastServerDiagRef.current = newSavedDiag;
                dirtyDiagFieldsRef.current.clear();
                setDiagForm(newSavedDiag);
                onTaskUpdated(updatedFields);
            } else {
                toast.error(res.error || 'Failed to submit diagnosis.');
            }
        } catch (err: any) {
            toast.error('Network error submitting diagnosis.');
        } finally {
            setSubmittingDiagnosis(false);
        }
    };

    const allowedStatuses = ['pending', 'in_progress', 'completed'] as const;

    const TABS: { id: ModalTab; label: string; icon: React.ReactNode }[] = [
        { id: 'overview', label: 'Overview', icon: <FileText size={13} /> },
        { id: 'diagnosis', label: 'Diagnosis & Estimate', icon: <Cpu size={13} /> },
        { id: 'work-log', label: 'Work Log', icon: <ClipboardList size={13} /> },
        { id: 'transfers', label: 'Transfer Chain', icon: <ArrowRightLeft size={13} /> },
        { id: 'milestones', label: 'Milestones', icon: <Bell size={13} /> },
        { id: 'customer-note', label: 'Customer Note', icon: <Star size={13} /> },
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Top Workspace Navigation Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-zinc-800/60">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all text-xs font-mono font-medium group cursor-pointer shrink-0"
                    >
                        <ChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                        <span className="hidden xs:inline">Back to Tasks</span>
                        <span className="xs:hidden">Back</span>
                    </button>
                    <span className="text-zinc-700">/</span>
                    <span className="text-xs font-mono text-emerald-400 font-bold truncate max-w-[130px] sm:max-w-none">{task.ticketNumber || `TICKET #${task.id}`}</span>
                    <span className="text-zinc-700">/</span>
                    <span className="text-xs sm:text-sm font-semibold text-white truncate max-w-[110px] sm:max-w-xs">{task.customerName}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {getStatusBadge(task.status)}
                    {task.customerApprovalStatus && getApprovalStatusBadge(task.customerApprovalStatus)}
                    {isAssignedToMe && !['completed', 'delivered', 'cancelled'].includes(task.status) && (
                        <button
                            onClick={onInitiateTransfer}
                            className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-mono font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                            <ArrowRightLeft size={12} />
                            Transfer
                        </button>
                    )}
                    <button
                        onClick={onBack}
                        className="p-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
                        title="Close drawer (Esc)"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Main Content Workspace Card */}
            <div className="bg-[#0c0c0c] border border-zinc-800/60 rounded-xl sm:rounded-2xl shadow-2xl relative overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-emerald-400 via-neon-cyan to-indigo-500" />

                {/* Workspace Header */}
                <div className="p-4 sm:p-6 border-b border-zinc-900 flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
                            <span className="text-xs font-mono text-emerald-400 font-bold">{task.ticketNumber || `TICKET_ID: #${task.id}`}</span>
                            {getStatusBadge(task.status)}
                            {task.customerApprovalStatus && getApprovalStatusBadge(task.customerApprovalStatus)}
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold text-white font-outfit truncate max-w-sm sm:max-w-none">{task.customerName}</h3>
                        <div className="text-xs text-zinc-500 mt-0.5">{task.brand} {task.modelNumber || ''} · {task.deviceCategory}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isAssignedToMe && !['completed', 'delivered', 'cancelled'].includes(task.status) && (
                            <button
                                onClick={onInitiateTransfer}
                                className="p-1.5 px-3 rounded-lg hover:bg-amber-500/10 text-amber-500 border border-transparent hover:border-amber-500/30 transition-colors cursor-pointer text-xs uppercase font-mono font-semibold h-fit flex items-center gap-1.5"
                            >
                                <ArrowRightLeft size={12} />
                                Transfer Task
                            </button>
                        )}
                        <button
                            onClick={onBack}
                            className="p-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer text-xs uppercase font-mono font-semibold h-fit flex items-center gap-1"
                        >
                            <ChevronLeft size={13} />
                            Back
                        </button>
                    </div>
                </div>

                {/* Tab Bar */}
                <div className="flex border-b border-zinc-900 px-3 sm:px-6 pt-1 gap-1 overflow-x-auto scrollbar-none">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold rounded-t-lg transition-all cursor-pointer whitespace-nowrap border-b-2 -mb-px ${
                                activeTab === tab.id
                                    ? 'text-emerald-400 border-emerald-400 bg-emerald-400/5'
                                    : 'text-zinc-500 border-transparent hover:text-zinc-300'
                            }`}
                        >
                            {tab.icon}{tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content Container */}
                <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-6">

                    {/* ── OVERVIEW TAB ── */}
                    {activeTab === 'overview' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 space-y-3">
                                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Contact Details</div>
                                    <div className="space-y-2 text-xs text-zinc-300">
                                        <div className="flex items-center gap-2.5"><Phone size={13} className="text-emerald-400" /> {task.mobile}</div>
                                        {task.email && <div className="flex items-center gap-2.5"><Mail size={13} className="text-emerald-400" /> {task.email}</div>}
                                        <div className="flex items-center gap-2.5"><MapPin size={13} className="text-emerald-400" /> {task.city}</div>
                                    </div>
                                </div>
                                <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 space-y-3">
                                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Device Details</div>
                                    <div className="space-y-1.5 text-xs text-zinc-300">
                                        <div><span className="text-zinc-500 uppercase tracking-wide">Category:</span> {task.deviceCategory}</div>
                                        <div><span className="text-zinc-500 uppercase tracking-wide">Brand:</span> {task.brand}</div>
                                        {task.modelNumber && <div><span className="text-zinc-500 uppercase tracking-wide">Model:</span> {task.modelNumber}</div>}
                                        {task.serialNumber && <div><span className="text-zinc-500 uppercase tracking-wide">Serial:</span> {task.serialNumber}</div>}
                                        {task.deviceConfiguration && <div><span className="text-zinc-500 uppercase tracking-wide">Config:</span> {task.deviceConfiguration}</div>}
                                    </div>
                                </div>
                                <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 space-y-3">
                                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Service Preferences</div>
                                    <div className="space-y-1.5 text-xs text-zinc-300">
                                        <div><span className="text-zinc-500 uppercase tracking-wide">Service:</span> {task.serviceType}</div>
                                        <div className="flex items-center gap-2"><span className="text-zinc-500 uppercase tracking-wide">Priority:</span> {getPriorityBadge(task.priority)}</div>
                                        <div><span className="text-zinc-500 uppercase tracking-wide">Contact Method:</span> {task.preferredContactMethod}</div>
                                    </div>
                                </div>
                                <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 space-y-3">
                                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Metadata & Billing</div>
                                    <div className="space-y-1.5 text-xs text-zinc-300 font-mono">
                                        <div className="flex items-center gap-2"><Clock size={12} /> {new Date(task.createdAt).toLocaleString()}</div>
                                        <div className="flex items-center gap-2"><Calendar size={12} /> {task.ticketNumber || `ID_${task.id}`}</div>
                                        <div className="flex items-center justify-between pt-1.5 border-t border-zinc-900">
                                            <div className="flex items-center gap-2">
                                                <CreditCard size={12} className={(task as any).paymentStatus === 'paid' || (task as any).payment_status === 'paid' ? 'text-emerald-400' : 'text-amber-400'} />
                                                <span>Payment: </span>
                                                <span className={`font-bold uppercase ${
                                                    ((task as any).paymentStatus === 'paid' || (task as any).payment_status === 'paid')
                                                        ? 'text-emerald-400'
                                                        : ((task as any).paymentStatus === 'pending_verification' || (task as any).payment_status === 'pending_verification')
                                                            ? 'text-amber-300'
                                                            : ((task as any).paymentStatus === 'rejected' || (task as any).payment_status === 'rejected')
                                                                ? 'text-rose-400'
                                                                : 'text-amber-400'
                                                }`}>
                                                    {((task as any).paymentStatus === 'paid' || (task as any).payment_status === 'paid')
                                                        ? 'PAID'
                                                        : (((task as any).paymentStatus || (task as any).payment_status || 'unpaid').replace(/_/g, ' '))}
                                                </span>
                                            </div>
                                        </div>
                                        {((task as any).collectionStatus === 'collected' || (task as any).collection_status === 'collected') && (
                                            <div className="text-emerald-400 text-[11px] font-mono font-semibold flex items-center gap-1.5 pt-1">
                                                <CheckCircle2 size={12} /> Cash Collected — Pending Admin Verification
                                            </div>
                                        )}
                                        {isAssignedToMe && !isPaid && !isCollected && (
                                            <div className="pt-2">
                                                {!isInvoiceFinal ? (
                                                    <div className="px-2.5 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[11px] font-mono text-zinc-400 flex items-center gap-1.5" title="Commercial invoice must be finalized and released by Admin before recording cash.">
                                                        <Lock size={12} className="text-amber-400 shrink-0" />
                                                        <span>Cash collection locked until final invoice released</span>
                                                    </div>
                                                ) : isCashPayment ? (
                                                    <button
                                                        type="button"
                                                        disabled={recordingCash}
                                                        onClick={handleRecordCashCollected}
                                                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white text-xs font-mono font-bold transition cursor-pointer disabled:opacity-50"
                                                    >
                                                        {recordingCash ? <Loader2 size={12} className="animate-spin" /> : <Banknote size={12} />}
                                                        Record Cash Collected
                                                    </button>
                                                ) : paymentMethod && paymentMethod !== 'cash' ? (
                                                    <div className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[11px] font-mono text-zinc-400 space-y-1.5">
                                                        <div className="text-zinc-300 font-semibold flex items-center gap-1.5">
                                                            <CreditCard size={12} className="text-neon-cyan shrink-0" />
                                                            <span>Method: {paymentMethod.replace(/_/g, ' ').toUpperCase()}</span>
                                                        </div>
                                                        <div className="text-zinc-500 text-[10px]">
                                                            Online/bank payment selected. Cash collection unavailable.
                                                        </div>
                                                        <button
                                                            type="button"
                                                            disabled={initiatingCash}
                                                            onClick={handleInitiateCash}
                                                            className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-[11px] font-mono font-bold transition cursor-pointer disabled:opacity-50"
                                                        >
                                                            {initiatingCash ? <Loader2 size={11} className="animate-spin" /> : <Banknote size={11} />}
                                                            Switch to Cash Payment
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[11px] font-mono text-zinc-400 space-y-1.5">
                                                        <div className="flex items-center gap-1.5 text-zinc-400">
                                                            <Clock size={12} className="text-amber-400 shrink-0" />
                                                            <span>Cash payment has not been initiated</span>
                                                        </div>
                                                        <div className="text-zinc-500 text-[10px]">
                                                            Customer has not selected a payment method. If collecting in person:
                                                        </div>
                                                        <button
                                                            type="button"
                                                            disabled={initiatingCash}
                                                            onClick={handleInitiateCash}
                                                            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/90 hover:bg-amber-600 text-white text-xs font-mono font-bold transition cursor-pointer disabled:opacity-50"
                                                        >
                                                            {initiatingCash ? <Loader2 size={12} className="animate-spin" /> : <Banknote size={12} />}
                                                            Initiate Cash Payment
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {(((task as any).paymentStatus === 'paid' || (task as any).payment_status === 'paid') || (task as any).invoiceId || (task.repairCost && task.repairCost > 0) || ['in_progress', 'completed', 'delivered'].includes(task.status)) && (
                                            <div className="pt-2 border-t border-zinc-900/80 flex flex-wrap items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={handleViewBill}
                                                    disabled={isBillActionLoading}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium transition cursor-pointer"
                                                    title="View Tax Invoice / Bill Preview"
                                                >
                                                    <Receipt size={11} className="text-neon-cyan" />
                                                    <span>View Bill</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handlePrintBill}
                                                    disabled={isBillActionLoading}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium transition cursor-pointer"
                                                    title="Print Document"
                                                >
                                                    <Printer size={11} className="text-amber-400" />
                                                    <span>Print</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleDownloadBill}
                                                    disabled={isBillActionLoading}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium transition cursor-pointer"
                                                    title="Download PDF"
                                                >
                                                    <Download size={11} className="text-emerald-400" />
                                                    <span>PDF</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Diagnosis & Customer Decision Overview Highlight */}
                            {((task.estimatedCost && task.estimatedCost > 0) || (task.customerApprovalStatus && task.customerApprovalStatus !== 'none') || task.diagnosis) && (
                                <div className="bg-zinc-950/70 border border-zinc-800/60 rounded-xl p-4 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5">
                                            <Cpu size={12} /> Diagnosis & Approximate Budget
                                        </span>
                                        {getApprovalStatusBadge(task.customerApprovalStatus)}
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                        <div>
                                            <span className="text-zinc-500">Approx Quote: </span>
                                            <strong className="text-white font-mono font-bold">
                                                ₹{((task.estimatedCost || 0) + (task.additionalCharges || 0)).toFixed(2)}
                                            </strong>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('diagnosis')}
                                            className="text-emerald-400 hover:text-emerald-300 font-mono text-[11px] hover:underline cursor-pointer flex items-center gap-1"
                                        >
                                            View Details & Scope →
                                        </button>
                                    </div>
                                    {task.diagnosis && (
                                        <p className="text-[11px] text-zinc-400 line-clamp-2 italic border-t border-zinc-900 pt-1.5">
                                            "{task.diagnosis}"
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="space-y-2">
                                <h4 className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Problem Description ({task.problemType})</h4>
                                <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{task.problemDescription}</div>
                            </div>

                            {(task as any).feedbackRating && (
                                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 my-2">
                                    <div className="text-[10px] font-mono uppercase tracking-wider text-yellow-500 font-bold mb-2 flex items-center gap-2">
                                        <Star size={12} className="fill-yellow-500/50" /> Customer Service Feedback
                                    </div>
                                    <div className="flex items-center gap-1 mb-2">
                                        {Array.from({ length: (task as any).feedbackRating }).map((_, i) => (
                                            <Star key={i} size={16} className="text-yellow-400 fill-yellow-400" />
                                        ))}
                                    </div>
                                    {(task as any).feedbackComment && (
                                        <p className="text-sm text-yellow-200/80 italic mt-2 border-t border-yellow-500/20 pt-2 selection:bg-yellow-500/30">
                                            "{(task as any).feedbackComment}"
                                        </p>
                                    )}
                                </div>
                            )}

                            {(task.imagePath || task.screenshotPath) && (
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Attachments</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {task.imagePath && (
                                            <div className="border border-zinc-900 bg-zinc-950/40 rounded-xl p-3 flex flex-col gap-2 group hover:border-zinc-800 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-zinc-400 font-semibold font-mono flex items-center gap-1.5"><FileImage size={13} className="text-emerald-400" /> DEVICE_PHOTO</span>
                                                    <a href={getFileUrl(task.imagePath)!} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline text-[10px] font-mono flex items-center gap-1">OPEN <ExternalLink size={10} /></a>
                                                </div>
                                                <div className="h-28 w-full overflow-hidden bg-black rounded border border-zinc-900 flex items-center justify-center cursor-pointer" onClick={() => onImagePreview(getFileUrl(task.imagePath)!, 'Device Photo')}>
                                                    <img src={getFileUrl(task.imagePath)!} alt="Device" className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105" />
                                                </div>
                                            </div>
                                        )}
                                        {task.screenshotPath && (
                                            <div className="border border-zinc-900 bg-zinc-950/40 rounded-xl p-3 flex flex-col gap-2 group hover:border-zinc-800 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-zinc-400 font-semibold font-mono flex items-center gap-1.5"><FileImage size={13} className="text-emerald-400" /> SCREENSHOT</span>
                                                    <a href={getFileUrl(task.screenshotPath)!} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline text-[10px] font-mono flex items-center gap-1">OPEN <ExternalLink size={10} /></a>
                                                </div>
                                                <div className="h-28 w-full overflow-hidden bg-black rounded border border-zinc-900 flex items-center justify-center cursor-pointer" onClick={() => onImagePreview(getFileUrl(task.screenshotPath)!, 'Screenshot')}>
                                                    <img src={getFileUrl(task.screenshotPath)!} alt="Screenshot" className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Status Update Actions */}
                            <div className="border-t border-zinc-900 pt-5">
                                {isAssignedToMe ? (
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="text-xs text-zinc-500 font-mono">UPDATE_TICKET_STATUS:</div>
                                        <div className="flex flex-wrap gap-2">
                                            {statusLoading ? (
                                                <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                                            ) : task.status === 'delivered' ? (
                                                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                                                    <Lock size={13} />
                                                    <span>TICKET DELIVERED (LOCKED)</span>
                                                </div>
                                            ) : task.status === 'completed' ? (
                                                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                                    <Lock size={13} />
                                                    <span>TASK COMPLETED (LOCKED)</span>
                                                </div>
                                            ) : (
                                                allowedStatuses
                                                    .filter(st => !(task.status === 'in_progress' && st === 'pending'))
                                                    .map(st => (
                                                        <button
                                                            key={st}
                                                            onClick={() => handleStatusChange(st)}
                                                            disabled={task.status === st}
                                                            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                                                                task.status === st
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
                                ) : isPendingAcceptance ? (
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                        <div className="flex items-center gap-2.5 text-xs text-amber-300">
                                            <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                                            <span>This ticket is awaiting your acceptance. Accept this assignment to update status or make decisions.</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {onAcceptAssignment && (
                                                <button
                                                    onClick={(e) => onAcceptAssignment(e, task.id)}
                                                    className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold font-mono rounded-lg transition-colors cursor-pointer"
                                                >
                                                    Accept Ticket
                                                </button>
                                            )}
                                            {onRejectAssignment && (
                                                <button
                                                    onClick={(e) => onRejectAssignment(e, task.id)}
                                                    className="px-3.5 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-bold font-mono rounded-lg transition-colors cursor-pointer"
                                                >
                                                    Reject
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-3.5 flex items-center gap-3 text-xs font-mono text-zinc-400">
                                        <ShieldAlert size={16} className="text-amber-400 shrink-0" />
                                        <span>Read-only: This ticket is assigned to another technician. You cannot modify decisions or status for this ticket.</span>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* ── DIAGNOSIS & ESTIMATE TAB ── */}
                    {activeTab === 'diagnosis' && (
                        <div className="space-y-6">
                            {/* Status Context Banner */}
                            <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-2xl p-5 space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-900 pb-3">
                                    <div className="flex items-center gap-2">
                                        <Cpu size={16} className="text-emerald-400" />
                                        <h4 className="text-xs font-mono uppercase tracking-wider text-white font-bold">
                                            Diagnosis & Approximate Repair Budget
                                        </h4>
                                    </div>
                                    <div>
                                        {getApprovalStatusBadge(task.customerApprovalStatus)}
                                    </div>
                                </div>

                                {/* Decision Status Messages */}
                                {task.customerApprovalStatus === 'approved' && (
                                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-start gap-3">
                                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                                        <div className="text-xs text-emerald-300 leading-relaxed">
                                            <strong>Customer Approved:</strong> The customer approved the approximate repair estimate of <strong>₹{((task.estimatedCost || 0) + (task.additionalCharges || 0)).toFixed(2)}</strong> on {task.approvedAt ? new Date(task.approvedAt).toLocaleString() : 'recently'}. You are authorized to proceed with the repair work.
                                            {task.approvalNotes && (
                                                <div className="text-[11px] text-emerald-400/90 mt-1 italic">
                                                    Customer note: "{task.approvalNotes}"
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {task.customerApprovalStatus === 'rejected' && (
                                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-start gap-3">
                                        <XCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                                        <div className="text-xs text-rose-300 leading-relaxed">
                                            <strong>Customer Declined Quote:</strong> The customer rejected the quotation of <strong>₹{((task.estimatedCost || 0) + (task.additionalCharges || 0)).toFixed(2)}</strong>. Reason: <em>{task.rejectionReason || 'Above budget / not specified'}</em>.
                                            <div className="mt-1 font-mono text-[11px] text-rose-400">
                                                Ticket is placed ON HOLD {task.holdEndDate ? `until ${new Date(task.holdEndDate).toLocaleString()}` : 'for 2–5 days'}. Repair cannot proceed.
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {task.customerApprovalStatus === 'pending_approval' && (
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
                                        <Hourglass size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                        <div className="text-xs text-amber-300 leading-relaxed">
                                            <strong>Waiting for Customer Approval:</strong> Your approximate budget of <strong>₹{((task.estimatedCost || 0) + (task.additionalCharges || 0)).toFixed(2)}</strong> has been sent to the customer. Repair cannot be moved to "In Progress" until the customer approves.
                                        </div>
                                    </div>
                                )}

                                {task.customerApprovalStatus === 'reapproval_requested' && (
                                    <div className="bg-neon-cyan/10 border border-neon-cyan/30 rounded-xl p-4 flex items-start gap-3">
                                        <RotateCcw size={16} className="text-neon-cyan shrink-0 mt-0.5" />
                                        <div className="text-xs text-cyan-200 leading-relaxed">
                                            <strong>Reapproval Requested:</strong> The customer has requested to proceed with the repair after previous hold/rejection. Review any notes: <em>{task.reapprovalNotes || 'None'}</em>.
                                        </div>
                                    </div>
                                )}

                                {/* Summary of current submitted estimate */}
                                {task.diagnosis && !isEditingDiagnosis && (
                                    <div className="space-y-4 pt-1">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3.5">
                                                <div className="text-[10px] font-mono text-zinc-500 uppercase">Estimated Budget</div>
                                                <div className="text-base font-mono font-bold text-white mt-1">₹{(task.estimatedCost || 0).toFixed(2)}</div>
                                            </div>
                                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3.5">
                                                <div className="text-[10px] font-mono text-zinc-500 uppercase">Additional Charges</div>
                                                <div className="text-base font-mono font-bold text-zinc-300 mt-1">₹{(task.additionalCharges || 0).toFixed(2)}</div>
                                            </div>
                                            <div className="bg-neon-cyan/10 border border-neon-cyan/20 rounded-xl p-3.5 col-span-2 sm:col-span-1">
                                                <div className="text-[10px] font-mono text-neon-cyan uppercase font-bold">Total Approx Quote</div>
                                                <div className="text-base font-mono font-black text-neon-cyan mt-1">₹{((task.estimatedCost || 0) + (task.additionalCharges || 0)).toFixed(2)}</div>
                                            </div>
                                        </div>

                                        <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-4 space-y-2.5 text-xs">
                                            <div><span className="text-zinc-500 uppercase text-[10px] block font-mono">Diagnosis:</span> <span className="text-zinc-200 whitespace-pre-wrap">{task.diagnosis}</span></div>
                                            {task.identifiedIssues && <div><span className="text-zinc-500 uppercase text-[10px] block font-mono">Identified Issues:</span> <span className="text-zinc-300">{task.identifiedIssues}</span></div>}
                                            {task.requiredWork && <div><span className="text-zinc-500 uppercase text-[10px] block font-mono">Required Work:</span> <span className="text-zinc-300">{task.requiredWork}</span></div>}
                                            {task.requiredParts && <div><span className="text-zinc-500 uppercase text-[10px] block font-mono">Parts Required:</span> <span className="text-zinc-300 font-mono">{task.requiredParts}</span></div>}
                                            {task.inspectionNotes && <div><span className="text-zinc-500 uppercase text-[10px] block font-mono">Inspection Notes:</span> <span className="text-zinc-400 italic">"{task.inspectionNotes}"</span></div>}
                                            {task.estimatedCompletionDate && <div><span className="text-zinc-500 uppercase text-[10px] block font-mono">Estimated Completion:</span> <span className="text-zinc-300 font-mono">{new Date(task.estimatedCompletionDate).toLocaleDateString()}</span></div>}
                                        </div>

                                        {isAssignedToMe && task.customerApprovalStatus !== 'approved' && (
                                            <div className="pt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditingDiagnosis(true)}
                                                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-mono rounded-lg transition-colors cursor-pointer"
                                                >
                                                    Modify Diagnosis & Estimate
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Form to submit/update diagnosis */}
                                {(!task.diagnosis || isEditingDiagnosis) && (
                                    isAssignedToMe ? (
                                        <form onSubmit={handleSubmitDiagnosis} className="space-y-4 pt-2">
                                            <div className="text-xs text-zinc-400 font-mono">
                                                {task.diagnosis ? 'UPDATE_DIAGNOSIS_ESTIMATE:' : 'SUBMIT_INITIAL_DIAGNOSIS_&_ESTIMATE:'}
                                            </div>

                                            <div>
                                                <div className="flex items-center justify-between mb-1">
                                                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">
                                                        Diagnosis & Problem Identified *
                                                    </label>
                                                    <span className={`text-[10px] font-mono ${diagForm.diagnosis.length > 500 ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
                                                        {diagForm.diagnosis.length} / 500
                                                    </span>
                                                </div>
                                                <textarea
                                                    maxLength={500}
                                                    rows={3}
                                                    required
                                                    value={diagForm.diagnosis}
                                                    onChange={e => handleDiagFieldChange('diagnosis', e.target.value)}
                                                    placeholder="Detailed diagnostic findings from physical and hardware inspection..."
                                                    className={`w-full bg-zinc-900 border ${diagFormErrors.diagnosis ? 'border-red-500' : 'border-zinc-800'} rounded-lg p-3 text-xs text-white focus:border-emerald-400 outline-none transition-all resize-none`}
                                                />
                                                {diagFormErrors.diagnosis && <p className="text-[10px] font-mono text-red-400 mt-1">{diagFormErrors.diagnosis}</p>}
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Identified Issues</label>
                                                    <input
                                                        type="text"
                                                        value={diagForm.identifiedIssues}
                                                        onChange={e => handleDiagFieldChange('identifiedIssues', e.target.value)}
                                                        placeholder="e.g. Swollen battery, cracked screen digitizer"
                                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Required Work</label>
                                                    <input
                                                        type="text"
                                                        value={diagForm.requiredWork}
                                                        onChange={e => handleDiagFieldChange('requiredWork', e.target.value)}
                                                        placeholder="e.g. Battery replacement & thermal paste re-application"
                                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Required Parts</label>
                                                    <input
                                                        type="text"
                                                        value={diagForm.requiredParts}
                                                        onChange={e => handleDiagFieldChange('requiredParts', e.target.value)}
                                                        placeholder="e.g. OEM Battery (Part #BAT-882)"
                                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Device Physical Condition</label>
                                                    <input
                                                        type="text"
                                                        value={diagForm.deviceCondition}
                                                        onChange={e => handleDiagFieldChange('deviceCondition', e.target.value)}
                                                        placeholder="e.g. Minor scratches on back panel, no water damage"
                                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                                                    />
                                                </div>
                                            </div>

                                            {/* Cost Calculations */}
                                            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-4">
                                                <div className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider font-semibold">
                                                    Repair Budget & Cost Calculation
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                    <div>
                                                        <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-1">
                                                            Approx Budget (₹) *
                                                        </label>
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            autoComplete="off"
                                                            spellCheck={false}
                                                            required
                                                            value={diagForm.estimatedCost}
                                                            onChange={e => {
                                                                const clean = sanitizeAmountInput(e.target.value);
                                                                handleDiagFieldChange('estimatedCost', clean);
                                                                if (diagFormErrors.estimatedCost) {
                                                                    setDiagFormErrors(p => ({ ...p, estimatedCost: undefined }));
                                                                }
                                                            }}
                                                            onKeyDown={handleAmountKeyDown}
                                                            onWheel={e => (e.target as HTMLElement).blur()}
                                                            placeholder="e.g. 1500"
                                                            className={`w-full bg-zinc-950 border ${diagFormErrors.estimatedCost ? 'border-red-500' : 'border-zinc-800'} rounded-lg p-2.5 text-xs font-mono text-white focus:border-emerald-400 outline-none`}
                                                        />
                                                        {diagFormErrors.estimatedCost && <p className="text-[10px] font-mono text-red-400 mt-1">{diagFormErrors.estimatedCost}</p>}
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-1">
                                                            Additional Charges (₹)
                                                        </label>
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            autoComplete="off"
                                                            spellCheck={false}
                                                            value={diagForm.additionalCharges}
                                                            onChange={e => {
                                                                const clean = sanitizeAmountInput(e.target.value);
                                                                handleDiagFieldChange('additionalCharges', clean);
                                                                if (diagFormErrors.additionalCharges) {
                                                                    setDiagFormErrors(p => ({ ...p, additionalCharges: undefined }));
                                                                }
                                                            }}
                                                            onKeyDown={handleAmountKeyDown}
                                                            onWheel={e => (e.target as HTMLElement).blur()}
                                                            placeholder="e.g. 200"
                                                            className={`w-full bg-zinc-950 border ${diagFormErrors.additionalCharges ? 'border-red-500' : 'border-zinc-800'} rounded-lg p-2.5 text-xs font-mono text-white focus:border-emerald-400 outline-none`}
                                                        />
                                                        {diagFormErrors.additionalCharges && <p className="text-[10px] font-mono text-red-400 mt-1">{diagFormErrors.additionalCharges}</p>}
                                                    </div>
                                                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex flex-col justify-center">
                                                        <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold">Total Quote to Client</span>
                                                        <span className="text-base font-mono font-extrabold text-emerald-300 mt-0.5">
                                                            ₹{((parseFloat(diagForm.estimatedCost) || 0) + (parseFloat(diagForm.additionalCharges) || 0)).toFixed(2)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Estimated Completion Date</label>
                                                    <input
                                                        type="date"
                                                        value={diagForm.estimatedCompletionDate}
                                                        onChange={e => handleDiagFieldChange('estimatedCompletionDate', e.target.value)}
                                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-white focus:border-emerald-400 outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Internal Inspection Notes</label>
                                                    <input
                                                        type="text"
                                                        value={diagForm.inspectionNotes}
                                                        onChange={e => handleDiagFieldChange('inspectionNotes', e.target.value)}
                                                        placeholder="Notes for workbench / team..."
                                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 pt-2">
                                                <button
                                                    type="submit"
                                                    disabled={submittingDiagnosis}
                                                    className="w-full sm:w-auto justify-center px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold font-mono rounded-xl transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 text-center"
                                                >
                                                    {submittingDiagnosis ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                                    Submit Diagnosis & Quote to Customer
                                                </button>
                                                {isEditingDiagnosis && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIsEditingDiagnosis(false);
                                                            dirtyDiagFieldsRef.current.clear();
                                                            setDiagForm(lastServerDiagRef.current);
                                                            setDiagFormErrors({});
                                                        }}
                                                        className="w-full sm:w-auto justify-center px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-xs font-mono rounded-lg transition-colors cursor-pointer text-center"
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                            </div>
                                        </form>
                                    ) : (
                                        <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-4 flex items-center gap-3 text-xs font-mono text-zinc-400">
                                            <Lock size={15} className="text-zinc-500 shrink-0" />
                                            <span>Diagnosis & estimate submission is restricted to the assigned technician.</span>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── WORK LOG TAB ── */}
                    {activeTab === 'work-log' && (
                        <div className="space-y-6">
                            {/* Add Entry Form or Read-Only Banner */}
                            {isAssignedToMe ? (
                                <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-5 space-y-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Plus size={14} className="text-emerald-400" />
                                        <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">New Work Log Entry</h4>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Repair Stage *</label>
                                            <div className="relative">
                                                <select
                                                    value={newLog.repairStage}
                                                    onChange={e => setNewLog(p => ({ ...p, repairStage: e.target.value }))}
                                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-400 appearance-none cursor-pointer"
                                                >
                                                    <option value="">Select stage...</option>
                                                    {REPAIR_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                                <ChevronDown size={12} className="absolute right-3 top-2.5 text-zinc-600 pointer-events-none" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Time Spent</label>
                                            <input
                                                value={newLog.timeSpent}
                                                onChange={e => setNewLog(p => ({ ...p, timeSpent: e.target.value }))}
                                                placeholder="e.g. 2h 30m"
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-400 placeholder:text-zinc-700"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Action Performed *</label>
                                        <textarea
                                            value={newLog.actionPerformed}
                                            onChange={e => setNewLog(p => ({ ...p, actionPerformed: e.target.value }))}
                                            rows={2}
                                            placeholder="Describe what was done..."
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-400 resize-none placeholder:text-zinc-700"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Parts Replaced</label>
                                            <input
                                                value={newLog.partsReplaced}
                                                onChange={e => setNewLog(p => ({ ...p, partsReplaced: e.target.value }))}
                                                placeholder="e.g. Battery, Display"
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-400 placeholder:text-zinc-700"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Media / Photo</label>
                                            <label className="flex items-center gap-2 cursor-pointer w-full bg-zinc-900 border border-zinc-800 border-dashed rounded-lg px-3 py-2 text-xs text-zinc-500 hover:border-emerald-400 hover:text-emerald-400 transition-all">
                                                <Upload size={12} />
                                                {logMediaFile ? logMediaFile.name : 'Upload image/video'}
                                                <input type="file" className="hidden" accept="image/*,video/*" onChange={e => setLogMediaFile(e.target.files?.[0] || null)} />
                                            </label>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">Internal Notes</label>
                                            <span className={`text-[10px] font-mono ${newLog.notes.length > 500 ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
                                                {newLog.notes.length} / 500
                                            </span>
                                        </div>
                                        <textarea
                                            maxLength={500}
                                            value={newLog.notes}
                                            onChange={e => setNewLog(p => ({ ...p, notes: e.target.value }))}
                                            rows={2}
                                            placeholder="Any additional technician notes..."
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-400 resize-none placeholder:text-zinc-700"
                                        />
                                    </div>
                                    <button
                                        onClick={handleSubmitWorkLog}
                                        disabled={submittingLog}
                                        className="w-full sm:w-auto justify-center flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed text-center"
                                    >
                                        {submittingLog ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                                        Add Work Log Entry
                                    </button>
                                </div>
                            ) : (
                                <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-4 flex items-center gap-3 text-xs font-mono text-zinc-400">
                                    <Lock size={15} className="text-zinc-500 shrink-0" />
                                    <span>Work log entry creation is restricted to the assigned technician. (Read-only log view)</span>
                                </div>
                            )}

                            {/* Work Log History */}
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Work Log History</h4>
                                {workLogsLoading ? (
                                    <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 size={13} className="animate-spin" /> Loading logs...</div>
                                ) : workLogs.length === 0 ? (
                                    <div className="text-center py-8 border border-zinc-900 rounded-xl text-zinc-600 text-xs">No work log entries yet.</div>
                                ) : (
                                    <div className="space-y-3">
                                        {workLogs.map(log => (
                                            <div key={log.id} className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 space-y-3">
                                                <div className="flex items-center justify-between flex-wrap gap-2">
                                                    {getStageBadge(log.repair_stage)}
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
                                                    <a href={getFileUrl(log.media_path)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-emerald-400 text-xs hover:underline">
                                                        <FileImage size={12} /> View Media <ExternalLink size={10} />
                                                    </a>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── TASK TRANSFERS CHAIN TAB ── */}
                    {activeTab === 'transfers' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                                    <Layers size={12} className="text-emerald-400" /> Movement & Transfer Chain
                                </div>
                                <span className="text-[10px] font-mono text-zinc-600">{ticketTransfers.length} transfer events</span>
                            </div>

                            {ticketTransfersLoading ? (
                                <div className="p-10 flex flex-col items-center justify-center">
                                    <Loader2 size={24} className="animate-spin text-emerald-400 mb-2" />
                                    <p className="text-xs font-mono text-zinc-500">Loading transfer history chain...</p>
                                </div>
                            ) : ticketTransfers.length === 0 ? (
                                <div className="text-center py-10 border border-zinc-900 rounded-xl text-zinc-600 text-xs font-mono">
                                    No transfers recorded for this task yet.
                                </div>
                            ) : (
                                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
                                    {ticketTransfers.map((t, idx) => (
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
                                                        {t.transferStatus === 'accepted' && (
                                                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                                                                ACCEPTED
                                                            </span>
                                                        )}
                                                        {t.transferStatus === 'rejected' && (
                                                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold">
                                                                REJECTED
                                                            </span>
                                                        )}
                                                        {t.transferStatus === 'pending' && (
                                                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                                                                PENDING
                                                            </span>
                                                        )}
                                                        {t.transferStatus === 'cancelled' && (
                                                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-semibold">
                                                                CANCELLED
                                                            </span>
                                                        )}
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
                                                        <div className="text-[10px] font-mono text-emerald-400 uppercase">To Technician</div>
                                                        <div className="text-emerald-400 font-mono mt-0.5 font-semibold">
                                                            {t.toTechnicianName}
                                                        </div>
                                                    </div>
                                                </div>

                                                {t.reason && (
                                                    <div className="text-xs text-zinc-300 bg-black/40 rounded-lg p-2.5 border border-zinc-900 leading-relaxed">
                                                        <span className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">Transfer Reason:</span>
                                                        "{t.reason}"
                                                    </div>
                                                )}

                                                {t.responseNotes && (
                                                    <div className="text-xs text-rose-300 bg-rose-950/20 rounded-lg p-2.5 border border-rose-900/30 font-mono">
                                                        <span className="text-[10px] font-mono text-rose-400 uppercase block mb-1">Response Comment:</span>
                                                        "{t.responseNotes}"
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600 border-t border-zinc-900/80 pt-2">
                                                    <div>Initiated by: {t.initiatedByName} ({t.initiatedByRole})</div>
                                                    {t.respondedAt && <div>Responded at: {new Date(t.respondedAt).toLocaleString()}</div>}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── MILESTONES TAB ── */}
                    {activeTab === 'milestones' && (
                        <div className="space-y-6">
                            {isAssignedToMe ? (
                                <>
                                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                                        <AlertTriangle size={15} className="text-amber-400 mt-0.5 shrink-0" />
                                        <p className="text-xs text-amber-300/80 leading-relaxed">Sending a milestone notification will create an in-app alert for the customer and dispatch an email (if configured). Use these to keep clients informed about key repair stages.</p>
                                    </div>

                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Select Milestone</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {MILESTONES.map(m => (
                                                <button
                                                    key={m.key}
                                                    onClick={() => setSelectedMilestone(selectedMilestone === m.key ? '' : m.key)}
                                                    className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer text-xs font-semibold ${selectedMilestone === m.key ? m.color + ' ring-1 ring-current' : 'bg-zinc-900/30 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'}`}
                                                >
                                                    <span className={selectedMilestone === m.key ? '' : 'text-zinc-600'}>{m.icon}</span>
                                                    {m.label}
                                                    {selectedMilestone === m.key && <CheckCircle2 size={12} className="ml-auto shrink-0" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {selectedMilestone && (
                                        <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">Additional Notes (Optional)</label>
                                                <span className={`text-[10px] font-mono ${milestoneNotes.length > 500 ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
                                                    {milestoneNotes.length} / 500
                                                </span>
                                            </div>
                                            <textarea
                                                maxLength={500}
                                                value={milestoneNotes}
                                                onChange={e => setMilestoneNotes(e.target.value)}
                                                rows={3}
                                                placeholder="Add any extra details to share with the customer..."
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-400 resize-none placeholder:text-zinc-700"
                                            />
                                        </div>
                                    )}

                                    <button
                                        onClick={handleSendMilestone}
                                        disabled={!selectedMilestone || sendingMilestone}
                                        className="w-full sm:w-auto justify-center flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-center"
                                    >
                                        {sendingMilestone ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                                        Send Milestone Notification
                                    </button>
                                </>
                            ) : (
                                <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-4 flex items-center gap-3 text-xs font-mono text-zinc-400">
                                    <Lock size={15} className="text-zinc-500 shrink-0" />
                                    <span>Milestone notifications can only be dispatched by the currently assigned technician.</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── CUSTOMER NOTE TAB ── */}
                    {activeTab === 'customer-note' && (
                        <div className="space-y-5">
                            <div className="bg-neon-cyan/5 border border-neon-cyan/20 rounded-xl p-4 flex items-start gap-3">
                                <Star size={15} className="text-neon-cyan mt-0.5 shrink-0" />
                                <p className="text-xs text-neon-cyan/80 leading-relaxed">Write a clear, friendly explanation of the device condition for the customer. This will be displayed in their User/Company dashboard and repair ticket details. Avoid technical jargon.</p>
                            </div>

                            {!isAssignedToMe && (
                                <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-3.5 flex items-center gap-3 text-xs font-mono text-zinc-400">
                                    <Lock size={15} className="text-zinc-500 shrink-0" />
                                    <span>Customer repair description is managed solely by the assigned technician. (Read-only)</span>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">Customer Repair Description</label>
                                <textarea
                                    value={customerDesc}
                                    maxLength={500}
                                    onChange={e => handleCustomerDescChange(e.target.value)}
                                    rows={8}
                                    disabled={!isAssignedToMe}
                                    placeholder={`Example:\n\nIssue Found: The device battery was deeply discharged and caused boot failure.\n\nRepair Performed: Full battery replacement and system diagnostics.\n\nParts Replaced: Genuine OEM Battery (3000 mAh).\n\nRecommendations: Avoid letting battery drain completely. Use original charger.\n\nWarranty: 30 days on parts and labour.`}
                                    className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-neon-cyan focus:ring-1 focus:ring-neon-cyan/30 resize-none placeholder:text-zinc-700 leading-relaxed disabled:opacity-60 disabled:cursor-not-allowed"
                                />
                            </div>

                            {isAssignedToMe && (
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                                    <div className={`text-xs font-mono ${customerDesc.length > 500 ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>{customerDesc.length} / 500 characters</div>
                                    <button
                                        onClick={handleSaveCustomerDesc}
                                        disabled={savingDesc}
                                        className="w-full sm:w-auto justify-center flex items-center gap-2 px-5 py-2.5 bg-neon-cyan hover:bg-neon-cyan/80 text-black text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed text-center"
                                    >
                                        {savingDesc ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
                                        Save Customer Note
                                    </button>
                                </div>
                            )}

                            {task.customerRepairDescription && !isAssignedToMe && (
                                <div className="border-t border-zinc-900 pt-4 space-y-2">
                                    <h5 className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">Currently Saved</h5>
                                    <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4 text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">{task.customerRepairDescription}</div>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>

            <PaymentReceiptModal
                isOpen={billReceiptModalOpen}
                onClose={() => {
                    setBillReceiptModalOpen(false);
                    setBillReceiptData(null);
                }}
                receipt={billReceiptData}
                ticketId={billReceiptData ? undefined : task.id}
            />
        </div>
    );
}
