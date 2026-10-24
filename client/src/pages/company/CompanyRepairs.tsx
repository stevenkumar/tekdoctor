import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCompanyContext } from '../../context/CompanyContext';
import {
    Wrench, Plus, X, Upload, Download, Calendar, Clock, AlertTriangle,
    CheckCircle, FileText, FileDown, ShieldAlert, Search, CheckCircle2,
    CreditCard, Loader2, AlertCircle, Check, ExternalLink, FileImage,
    Cpu, Laptop, MapPin, User, Mail, Phone, ShieldCheck, CheckCheck,
    DollarSign, Layers, MessageSquare, Eye, RefreshCw, XCircle, Printer, Receipt
} from 'lucide-react';
import { useSiteContext } from '../../context/SiteContext';
import { repairApi, companyApi, billingApi } from '../../services/api';
import { triggerRazorpayCheckout } from '@/utils/payment';
import { downloadPaymentBillPdf, printPaymentBill } from '@/utils/billGenerator';
import { toast } from 'react-hot-toast';
import DeviceRepairHistoryModal from '../../components/DeviceRepairHistoryModal';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import SideDrawer from '@/components/SideDrawer';
import RepairTicketWorkspace from '@/components/RepairTicketWorkspace';
import { SkeletonTable } from '@/components/Skeleton';
import PaymentMethodModal from '@/components/PaymentMethodModal';
import { PaymentReceiptModal } from '@/components/PaymentReceiptModal';
import { DESCRIPTION_MAX_LENGTH } from '@/config/constants';
import { appConfig } from '@/config/appConfig';

const getFileUrl = (path: string | null) => {
    if (!path) return null;
    const base = (appConfig.apiUrl || window.location.origin).replace(/\/$/, '');
    const cleanPath = path.replace(/^\//, '');
    return `${base}/${cleanPath}`;
};

interface Device {
    id: number;
    brand: string;
    model_number: string;
    serial_number: string;
    asset_tag: string;
    employee_id?: number;
    assigned_employee_id?: number;
    employee_name?: string;
    is_amc?: number;
    amc_tag?: string;
    is_active?: boolean | number;
    status?: string;
}

interface Employee {
    id: number;
    name: string;
    branch_name?: string;
    department?: string;
}

interface RepairRequest {
    id: number;
    ticket_number: string;
    ticketNumber?: string;
    device_id: number;
    deviceId?: number;
    device_brand: string;
    device_model: string;
    device_serial: string;
    device_category?: string;
    asset_id?: string;
    assetId?: string;
    is_amc?: number | boolean;
    amc_tag?: string;
    employee_id?: number;
    employee_name: string;
    employee_email?: string;
    employee_phone?: string;
    employee_department?: string;
    branch_name?: string;
    problem_type: string;
    problem_description: string;
    status: string;
    priority: string;
    sla_deadline: string;
    created_at: string;
    createdAt?: string;
    updated_at?: string;
    payment_status?: string;
    repair_cost?: string | number;
    repairCost?: number;
    estimated_cost?: string | number;
    estimatedCost?: number;
    additional_charges?: string | number;
    additionalCharges?: number;
    customer_approval_status?: string;
    customerApprovalStatus?: string;
    diagnosis?: string;
    identified_issues?: string;
    identifiedIssues?: string;
    required_work?: string;
    requiredWork?: string;
    required_parts?: string;
    requiredParts?: string;
    estimated_completion_date?: string;
    estimatedCompletionDate?: string;
    inspection_notes?: string;
    inspectionNotes?: string;
    device_condition?: string;
    deviceCondition?: string;
    approved_at?: string;
    approvedBy?: string;
    rejection_reason?: string;
    technician_name?: string;
    technician_email?: string;
    technician_phone?: string;
    image_path?: string;
    imagePath?: string;
    screenshot_path?: string;
    screenshotPath?: string;
    service_type?: string;
    preferred_contact_method?: string;
    workLogs?: any[];
    work_logs?: any[];
}

export default function CompanyRepairs() {
    const { token, user } = useAuth();
    const { selectedCompanyId, isAdminManagingCompany, loadingCompanies } = useCompanyContext();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [repairs, setRepairs] = useState<RepairRequest[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [payingId, setPayingId] = useState<number | null>(null);
    const [payingTicket, setPayingTicket] = useState<RepairRequest | null>(null);
    const [downloadingId, setDownloadingId] = useState<number | null>(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || searchParams.get('filter') || '');
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
    const [exporting, setExporting] = useState(false);
    const { flattenedSettings } = useSiteContext();

    // Modals
    const [isOpen, setIsOpen] = useState(false);
    const [isBulkOpen, setIsBulkOpen] = useState(false);
    const [cancelModalOpen, setCancelModalOpen] = useState(false);

    // Ticket Details Modal State
    const [detailTicketId, setDetailTicketId] = useState<number | string | null>(null);
    const [selectedTicketDetail, setSelectedTicketDetail] = useState<any | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState('');
    const [quickDrawerTicket, setQuickDrawerTicket] = useState<any | null>(null);

    // Estimate Approval / Decline Modal
    const [isApproving, setIsApproving] = useState(false);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [isRejecting, setIsRejecting] = useState(false);

    // Lightbox Media Preview
    const [previewSrc, setPreviewSrc] = useState<string | null>(null);
    const [previewAlt, setPreviewAlt] = useState<string>('');

    // Cancel Form
    const [cancellingTicketId, setCancellingTicketId] = useState<number | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);

    // Form fields
    const [deviceId, setDeviceId] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [problemType, setProblemType] = useState('Hardware');
    const [problemDescription, setProblemDescription] = useState('');
    const [priority, setPriority] = useState('Standard');
    const [servicePreference, setServicePreference] = useState('carry_in');
    const [preferredContact, setPreferredContact] = useState('email');
    const [historyModalDeviceId, setHistoryModalDeviceId] = useState<number | null>(null);
    const [formErrors, setFormErrors] = useState<{ deviceId?: string; problemDescription?: string; general?: string }>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [clientSubmissionId, setClientSubmissionId] = useState(() => 'SUB-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now());
    const [submittedTicket, setSubmittedTicket] = useState<{ ticketNumber: string; isDuplicate?: boolean } | null>(null);
    const [bulkError, setBulkError] = useState('');
    const [bulkErrors, setBulkErrors] = useState<Array<{ row: number; field: string; error: string; suggestion?: string }>>([]);
    const [cancelError, setCancelError] = useState('');

    // Bulk Upload state
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleCancelTicket = async () => {
        if (!cancellingTicketId || !token) return;
        if (cancelReason.length > 500) {
            setCancelError('Cancellation reason cannot exceed 500 characters.');
            return;
        }
        setIsCancelling(true);
        setCancelError('');

        try {
            const res = await repairApi.cancelRequest(token, cancellingTicketId, cancelReason);
            if (res.ok) {
                setSuccess('Repair ticket was successfully cancelled.');
                setCancelModalOpen(false);
                setCancellingTicketId(null);
                setCancelReason('');
                setCancelError('');
                fetchData();
            } else {
                setCancelError(res.error || 'Failed to cancel repair ticket.');
            }
        } catch {
            setCancelError('Failed to cancel repair ticket.');
        } finally {
            setIsCancelling(false);
        }
    };

    const fetchData = async () => {
        if (!token) return;
        if (isAdminManagingCompany && !selectedCompanyId && !loadingCompanies) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [repRes, devRes, empRes] = await Promise.all([
                companyApi.getRepairs(token),
                companyApi.getDevices(token),
                companyApi.getEmployees(token)
            ]);

            if (repRes.data?.success && repRes.data.data) setRepairs(repRes.data.data);
            else if (Array.isArray(repRes.data)) setRepairs(repRes.data);

            if (devRes.data?.success && devRes.data.data) setDevices(devRes.data.data);
            else if (Array.isArray(devRes.data)) setDevices(devRes.data);

            if (empRes.data?.success && empRes.data.data) setEmployees(empRes.data.data);
            else if (Array.isArray(empRes.data)) setEmployees(empRes.data);
        } catch {
            setError('Failed to load corporate repairs records.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAdminManagingCompany && loadingCompanies) return;
        fetchData();
    }, [token, selectedCompanyId, loadingCompanies]);

    // Handle deep-linked deviceId parameter e.g. /company/repairs?deviceId=12
    useEffect(() => {
        const devIdParam = searchParams.get('deviceId');
        if (devIdParam && devices.length > 0) {
            const foundDev = devices.find(d => String(d.id) === String(devIdParam));
            if (foundDev) {
                const isDeactivated = foundDev.is_active === false || foundDev.is_active === 0 || foundDev.status === 'decommissioned' || foundDev.status === 'inactive';
                if (isDeactivated) {
                    toast.error('This device is deactivated and cannot be used to create a new repair ticket.');
                    setFormErrors(prev => ({
                        ...prev,
                        deviceId: 'This device is deactivated and cannot be used to create a new repair ticket.'
                    }));
                } else {
                    setDeviceId(String(foundDev.id));
                    const empId = foundDev.employee_id || foundDev.assigned_employee_id;
                    if (empId) setEmployeeId(String(empId));
                    setIsOpen(true);
                }
            }
        }
    }, [searchParams, devices]);

    // Handle deep-linked ticketId parameter e.g. /company/repairs?id=TK-2026-0001
    useEffect(() => {
        const ticketParam = searchParams.get('id') || searchParams.get('ticketId') || searchParams.get('ticket');
        if (ticketParam && token) {
            openTicketDetails(ticketParam);
        }
    }, [searchParams, token]);

    const fetchTicketDetails = async (idOrNumber: number | string) => {
        if (!token) return;
        setDetailLoading(true);
        setDetailError('');
        try {
            const res = await repairApi.getRequestById(token, idOrNumber);
            if (res.ok && res.data?.data) {
                setSelectedTicketDetail(res.data.data);
                setDetailTicketId(idOrNumber);
            } else {
                setDetailError(res.error || 'Unable to load repair ticket details. Please try again.');
                setSelectedTicketDetail(null);
            }
        } catch {
            setDetailError('Network error while retrieving repair ticket details.');
            setSelectedTicketDetail(null);
        } finally {
            setDetailLoading(false);
        }
    };

    const openTicketDetails = (idOrNumber: number | string) => {
        setDetailTicketId(idOrNumber);
        const found = repairs.find(r => r.id === idOrNumber || r.ticket_number === idOrNumber);
        if (found) {
            setSelectedTicketDetail(found);
        }
        fetchTicketDetails(idOrNumber);
        const newParams = new URLSearchParams(searchParams);
        newParams.set('ticketId', String(idOrNumber));
        navigate(`/company/repairs?${newParams.toString()}`, { replace: true });
    };

    const closeTicketDetails = () => {
        setDetailTicketId(null);
        setSelectedTicketDetail(null);
        setDetailError('');
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('id');
        newParams.delete('ticketId');
        newParams.delete('ticket');
        navigate(`/company/repairs${newParams.toString() ? `?${newParams.toString()}` : ''}`, { replace: true });
        fetchData();
    };

    const handleApproveEstimate = async (ticketId: number) => {
        if (!token) return;
        setIsApproving(true);
        try {
            const res = await repairApi.approveEstimate(ticketId, token);
            if (res.ok) {
                toast.success('Repair estimate approved! Assigned technician has been notified to proceed.');
                await fetchTicketDetails(ticketId);
                await fetchData();
            } else {
                toast.error(res.error || 'Failed to approve estimate.');
            }
        } catch {
            toast.error('Network error while approving estimate.');
        } finally {
            setIsApproving(false);
        }
    };

    const handleRejectEstimate = async () => {
        if (!token || !selectedTicketDetail) return;
        setIsRejecting(true);
        try {
            const res = await repairApi.rejectEstimate(selectedTicketDetail.id, rejectReason, token);
            if (res.ok) {
                toast.success('Repair estimate declined.');
                setRejectModalOpen(false);
                setRejectReason('');
                await fetchTicketDetails(selectedTicketDetail.id);
                await fetchData();
            } else {
                toast.error(res.error || 'Failed to decline estimate.');
            }
        } catch {
            toast.error('Network error while declining estimate.');
        } finally {
            setIsRejecting(false);
        }
    };

    const handleDeviceSelect = (selectedId: string) => {
        if (!selectedId) {
            setDeviceId('');
            return;
        }
        const foundDev = devices.find(d => String(d.id) === String(selectedId));
        if (foundDev) {
            const isDeactivated = foundDev.is_active === false || foundDev.is_active === 0 || foundDev.status === 'decommissioned' || foundDev.status === 'inactive';
            if (isDeactivated) {
                setDeviceId('');
                setFormErrors(prev => ({
                    ...prev,
                    deviceId: 'This device is deactivated and cannot be used to create a new repair ticket.'
                }));
                return;
            }
            setDeviceId(selectedId);
            const empId = foundDev.employee_id || foundDev.assigned_employee_id;
            if (empId) setEmployeeId(String(empId));
        } else {
            setDeviceId(selectedId);
        }
    };

    const activeRepairOnSelectedDevice = deviceId
        ? repairs.find(r => String(r.device_id) === String(deviceId) && !['completed', 'delivered', 'cancelled', 'rejected'].includes((r.status || '').toLowerCase()))
        : null;

    const handleOpenCreateModel = () => {
        setDeviceId('');
        setEmployeeId('');
        setProblemType('Hardware');
        setProblemDescription('');
        setPriority('Standard');
        setServicePreference('carry_in');
        setPreferredContact('email');
        setFormErrors({});
        setSubmittedTicket(null);
        setClientSubmissionId('SUB-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now());
        setIsOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token || isSubmitting) return;

        const errors: { deviceId?: string; problemDescription?: string; general?: string } = {};

        if (!deviceId) {
            errors.deviceId = 'You must select a registered company device.';
        } else {
            const selectedDev = devices.find(d => String(d.id) === String(deviceId));
            if (selectedDev) {
                const isDeactivated = selectedDev.is_active === false || selectedDev.is_active === 0 || selectedDev.status === 'decommissioned' || selectedDev.status === 'inactive';
                if (isDeactivated) {
                    errors.deviceId = 'This device is deactivated and cannot be used to create a new repair ticket.';
                }
            }
        }
        if (!problemDescription.trim()) {
            errors.problemDescription = 'Please provide a brief problem description.';
        } else if (problemDescription.trim().length < 10) {
            errors.problemDescription = 'Problem description must be at least 10 characters.';
        } else if (problemDescription.trim().length > DESCRIPTION_MAX_LENGTH) {
            errors.problemDescription = `Problem description cannot exceed ${DESCRIPTION_MAX_LENGTH} characters.`;
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        setIsSubmitting(true);
        setFormErrors({});

        try {
            const res = await companyApi.createRepair(token, {
                deviceId: parseInt(deviceId, 10),
                employeeId: employeeId ? parseInt(employeeId, 10) : null,
                problemType,
                problemDescription: problemDescription.trim(),
                priority,
                servicePreference,
                preferredContact,
                clientSubmissionId
            });
            const json = res.data;

            if (json?.isDuplicate) {
                const ticketNum = json.data?.ticketNumber || json.ticketNumber;
                toast(`You have already submitted this repair request. Ticket ID: ${ticketNum}`, { icon: 'ℹ️' });
                setSubmittedTicket({ ticketNumber: ticketNum, isDuplicate: true });
                setSuccess(`You have already submitted this repair request. Ticket ID: ${ticketNum}`);
                fetchData();
            } else if (json?.success) {
                const ticketNum = json.data?.ticketNumber || json.ticketNumber;
                toast.success(`Repair ticket submitted successfully! Ticket ID: ${ticketNum}`);
                setSubmittedTicket({ ticketNumber: ticketNum, isDuplicate: false });
                setSuccess(`Repair request submitted successfully! Ticket ID: ${ticketNum}`);
                setIsOpen(false);
                fetchData();
            } else {
                const serverErrors = json?.errors || {};
                setFormErrors({
                    deviceId: serverErrors.deviceId,
                    problemDescription: serverErrors.problemDescription,
                    general: json?.message || res.error || 'Failed to submit repair request.'
                });
            }
        } catch {
            setFormErrors({ general: 'Failed to submit repair request. Please try again.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBulkUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!csvFile || !token) return;

        setUploading(true);
        setBulkError('');
        setBulkErrors([]);

        try {
            const res = await companyApi.importBulkRequests(token, csvFile);
            if (res.ok && res.data?.success) {
                const imported = res.data.data?.imported || res.data.data?.count || 0;
                toast.success(`Bulk tickets created! Registered ${imported} B2B repair tickets.`);
                setIsBulkOpen(false);
                setCsvFile(null);
                setBulkError('');
                setBulkErrors([]);
                fetchData();
            } else {
                setBulkError(res.error || res.data?.message || 'Failed to process bulk tickets file.');
                if (Array.isArray(res.data?.errors)) {
                    setBulkErrors(res.data.errors);
                }
            }
        } catch {
            setBulkError('Failed to process bulk tickets file. Ensure device serial tags match records.');
        } finally {
            setUploading(false);
        }
    };

    const handleBulkExport = async (format: 'xlsx' | 'csv' = 'xlsx') => {
        if (!token || exporting) return;
        setExporting(true);
        try {
            await companyApi.exportRepairs(token, {
                format,
                search: searchQuery.trim() || undefined,
                status: statusFilter || undefined,
            });
            toast.success(`Repair tickets ${format.toUpperCase()} exported successfully.`);
        } catch {
            toast.error(`Failed to export repair tickets as ${format.toUpperCase()}.`);
        } finally {
            setExporting(false);
        }
    };

    const handleSingleExport = async (ticketId: number, ticketNo: string) => {
        if (!token) return;
        try {
            await companyApi.exportRepairs(token, { id: ticketId, format: 'xlsx' });
            toast.success(`Exported ticket: ${ticketNo}`);
        } catch {
            toast.error('Failed to export repair ticket.');
        }
    };

    const handleDownloadTemplate = async (format: 'xlsx' | 'csv') => {
        if (!token) return;
        try {
            await companyApi.downloadTemplate(token, 'repairs', format, true);
        } catch {
            toast.error(`Failed to download ${format.toUpperCase()} template.`);
        }
    };

    const handlePayTicket = async (ticket: RepairRequest) => {
        if (!token) return;
        setPayingId(ticket.id);
        try {
            const configRes = await billingApi.getConfig();
            const keyId = configRes.data?.data?.keyId || (configRes.data as any)?.keyId;
            if (!keyId) {
                toast.error('Payment gateway is currently unavailable.');
                setPayingId(null);
                return;
            }

            const orderRes = await billingApi.createPaymentOrder({
                ticketId: ticket.id,
                ticketNumber: ticket.ticket_number
            }, token);

            const orderData = orderRes.data?.data || (orderRes.data as any);
            if (!orderRes.ok || !orderData?.orderId) {
                toast.error(orderRes.error || 'Failed to initiate payment order.');
                setPayingId(null);
                return;
            }

            await triggerRazorpayCheckout({
                keyId,
                orderId: orderData.orderId,
                amount: orderData.amount,
                currency: orderData.currency || 'INR',
                name: flattenedSettings.company_name || 'TekDoctor Repair',
                description: `Settlement for Ticket #${ticket.ticket_number}`,
                prefill: {
                    name: user?.name || '',
                    email: user?.email || '',
                    contact: ''
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
                            toast.success(`Payment verified for Ticket #${ticket.ticket_number}!`);
                            await fetchData();
                            handleDownloadTicketReceipt(ticket.id);
                        } else {
                            toast.error(verifyRes.error || 'Payment verification failed. Please contact support.');
                        }
                    } catch {
                        toast.error('Error verifying payment.');
                    } finally {
                        setPayingId(null);
                    }
                },
                onDismiss: () => {
                    toast('Payment dismissed.', { icon: 'ℹ️' });
                    setPayingId(null);
                },
                onPaymentError: async (errResp: any) => {
                    toast.error(errResp?.description || 'Payment failed.');
                    try {
                        await billingApi.reportPaymentFailure({
                            orderId: orderData.orderId,
                            ticketId: ticket.id,
                            reason: errResp?.description || 'Payment rejected'
                        }, token);
                    } catch (e) {
                        console.error('Failed to report payment failure', e);
                    }
                    setPayingId(null);
                }
            });
        } catch (err: any) {
            toast.error(err.message || 'Payment initiation failed.');
            setPayingId(null);
        }
    };

    const [viewReceiptModalOpen, setViewReceiptModalOpen] = useState(false);
    const [selectedReceiptData, setSelectedReceiptData] = useState<any>(null);
    const [selectedReceiptTicketId, setSelectedReceiptTicketId] = useState<number | undefined>(undefined);
    const [isActionLoading, setIsActionLoading] = useState(false);

    const handleDownloadTicketReceipt = async (ticketId: number) => {
        if (!token) return;
        setDownloadingId(ticketId);
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
            setDownloadingId(null);
        }
    };

    const handleViewTicketReceipt = async (ticketId: number) => {
        if (!token) return;
        setIsActionLoading(true);
        try {
            const res = await billingApi.getPaymentReceiptByTicket(ticketId, token);
            const receiptData = res.data?.data || res.data?.receipt || (res.data?.receiptNumber ? res.data : null);
            if (receiptData) {
                setSelectedReceiptData(receiptData);
                setSelectedReceiptTicketId(ticketId);
                setViewReceiptModalOpen(true);
            } else {
                toast.error(res.error || 'Failed to retrieve invoice for ticket.');
            }
        } catch {
            toast.error('Could not load bill receipt details.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handlePrintTicketReceipt = async (ticketId: number) => {
        if (!token) return;
        setIsActionLoading(true);
        try {
            const res = await billingApi.getPaymentReceiptByTicket(ticketId, token);
            const receiptData = res.data?.data || res.data?.receipt || (res.data?.receiptNumber ? res.data : null);
            if (receiptData) {
                await printPaymentBill(receiptData);
            } else {
                toast.error(res.error || 'Failed to retrieve invoice for printing.');
            }
        } catch {
            toast.error('Could not print receipt.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const pendingApprovalCount = repairs.filter(rep =>
        rep.customer_approval_status === 'pending_approval' &&
        (Number(rep.estimated_cost || 0) > 0 || Number(rep.repair_cost || 0) > 0) &&
        !['completed', 'cancelled', 'delivered'].includes(rep.status)
    ).length;

    const filteredRepairs = repairs.filter(rep => {
        if (statusFilter === 'approval_budget' || statusFilter === 'pending_approval') {
            const isPendingApproval = rep.customer_approval_status === 'pending_approval' &&
                (Number(rep.estimated_cost || 0) > 0 || Number(rep.repair_cost || 0) > 0) &&
                !['completed', 'cancelled', 'delivered'].includes(rep.status);
            if (!isPendingApproval) return false;
        } else if (statusFilter && rep.status !== statusFilter) {
            return false;
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const ticketMatch = (rep.ticket_number || '').toLowerCase().includes(q);
            const brandMatch = (rep.device_brand || '').toLowerCase().includes(q);
            const modelMatch = (rep.device_model || '').toLowerCase().includes(q);
            const serialMatch = (rep.device_serial || '').toLowerCase().includes(q);
            const empMatch = (rep.employee_name || '').toLowerCase().includes(q);
            const probMatch = (rep.problem_description || '').toLowerCase().includes(q);
            if (!ticketMatch && !brandMatch && !modelMatch && !serialMatch && !empMatch && !probMatch) return false;
        }
        return true;
    });

    if (detailTicketId) {
        return (
            <div className="space-y-6 animate-fadeIn">
                <RepairTicketWorkspace
                    ticket={selectedTicketDetail}
                    loading={detailLoading}
                    error={detailError}
                    role="company"
                    onBack={closeTicketDetails}
                    onRefresh={() => fetchTicketDetails(detailTicketId)}
                />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Service Tickets</h1>
                    <p className="text-zinc-500 text-sm mt-1">Submit B2B repairs and monitor active hardware SLA resolve times.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
                        {[
                            { label: 'All', value: '' },
                            {
                                label: `Approval Budget${pendingApprovalCount > 0 ? ` (${pendingApprovalCount})` : ''}`,
                                value: 'approval_budget',
                                highlight: pendingApprovalCount > 0
                            },
                            { label: 'Pending', value: 'pending' },
                            { label: 'In Progress', value: 'in_progress' },
                            { label: 'Completed', value: 'completed' },
                            { label: 'Delivered', value: 'delivered' },
                            { label: 'Cancelled', value: 'cancelled' },
                        ].map(st => (
                            <button
                                key={st.value}
                                onClick={() => setStatusFilter(st.value)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${statusFilter === st.value
                                    ? 'bg-zinc-800 text-white font-semibold shadow-sm'
                                    : st.highlight
                                        ? 'text-amber-400 hover:text-amber-300 font-semibold'
                                        : 'text-zinc-400 hover:text-zinc-200'
                                    }`}
                            >
                                {st.label}
                                {st.highlight && statusFilter !== st.value && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                )}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => { setBulkError(''); setBulkErrors([]); setIsBulkOpen(true); }}
                        className="border border-zinc-800 hover:border-zinc-700 bg-zinc-950 text-zinc-300 text-sm font-semibold px-3.5 py-2 rounded-xl flex items-center gap-2 transform active:scale-[0.98] transition-all cursor-pointer"
                    >
                        <Upload size={15} className="text-indigo-400" />
                        <span>Bulk Tickets</span>
                    </button>

                    <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 p-0.5 rounded-xl">
                        <button
                            onClick={() => handleBulkExport('xlsx')}
                            disabled={exporting || repairs.length === 0}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-emerald-400 hover:bg-zinc-900 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Export filtered repair tickets as Excel (.xlsx)"
                        >
                            <Download size={13} />
                            <span>Excel</span>
                        </button>
                        <div className="w-[1px] h-3.5 bg-zinc-800" />
                        <button
                            onClick={() => handleBulkExport('csv')}
                            disabled={exporting || repairs.length === 0}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Export filtered repair tickets as CSV"
                        >
                            <span>CSV</span>
                        </button>
                    </div>

                    <button
                        onClick={handleOpenCreateModel}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transform active:scale-[0.98] transition-all cursor-pointer shadow-lg"
                    >
                        <Plus size={16} />
                        <span>New Ticket</span>
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                <input
                    type="text"
                    placeholder="Search tickets by ticket number, brand, model, serial, employee, or problem description..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-[#0c0c0c] border border-zinc-900 focus:border-indigo-500/60 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white focus:outline-none transition-colors"
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-1"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {success && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-sm font-medium flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                        <span>{success}</span>
                    </div>
                    {submittedTicket?.ticketNumber && (
                        <button
                            onClick={() => openTicketDetails(submittedTicket.ticketNumber)}
                            className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-mono px-3 py-1.5 rounded-lg border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 font-semibold"
                        >
                            <span>View Ticket #{submittedTicket.ticketNumber}</span>
                            <ExternalLink size={12} />
                        </button>
                    )}
                </div>
            )}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm font-medium animate-fadeIn">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="py-2">
                    <SkeletonTable rows={6} columns={6} hasHeaderFilter={false} />
                </div>
            ) : filteredRepairs.length === 0 ? (
                <div className="bg-[#0c0c0c] border border-zinc-800/40 border-dashed rounded-2xl py-20 text-center flex flex-col items-center justify-center space-y-4">
                    <Wrench size={40} className="text-zinc-700" />
                    <div className="space-y-1">
                        <h3 className="text-zinc-300 font-bold text-base">
                            {searchQuery || statusFilter ? 'No Tickets Match Your Filters' : 'No Tickets Found'}
                        </h3>
                        <p className="text-zinc-650 text-xs max-w-sm">
                            {searchQuery || statusFilter ? 'Try clearing your search or status filter.' : 'Need maintenance? Click New Ticket to map an employee hardware device for administrator diagnostic checks.'}
                        </p>
                    </div>
                    {searchQuery || statusFilter ? (
                        <button
                            onClick={() => { setSearchQuery(''); setStatusFilter(''); }}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer mt-2"
                        >
                            Reset filters
                        </button>
                    ) : (
                        <button
                            onClick={handleOpenCreateModel}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1.5 cursor-pointer mt-2"
                        >
                            Create Your First Ticket
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-[#0c0c0c] border border-zinc-800/40 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-zinc-800/30 text-xs text-zinc-500 uppercase tracking-widest font-mono select-none">
                                    <th className="py-4 px-6">Ticket No.</th>
                                    <th className="py-4 px-4 font-mono">Device Details</th>
                                    <th className="py-4 px-4">User Assignment</th>
                                    <th className="py-4 px-4">Priority / Type</th>
                                    <th className="py-4 px-4">SLA Resolve Deadline</th>
                                    <th className="py-4 px-4">Status</th>
                                    <th className="py-4 px-4">Payment</th>
                                    <th className="py-4 px-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900/40 text-sm text-zinc-300 font-medium">
                                {filteredRepairs.map(rep => {
                                    const isSlaClose = rep.sla_deadline
                                        ? new Date(rep.sla_deadline) < new Date(Date.now() + 24 * 60 * 60 * 1000) && !['completed', 'delivered', 'cancelled'].includes(rep.status)
                                        : false;
                                    const approxBudget = Number(rep.estimated_cost || rep.estimatedCost || rep.repair_cost || rep.repairCost || 0);
                                    const approvalStatus = rep.customer_approval_status || rep.customerApprovalStatus || 'none';

                                    return (
                                        <tr key={rep.id} onClick={() => openTicketDetails(rep.id)} className="hover:bg-zinc-900/10 transition-colors cursor-pointer group hover:opacity-80">
                                            <td className="py-4 px-6">
                                                <span className="font-mono text-white text-sm block group-hover:text-indigo-400 transition-colors">{rep.ticket_number}</span>
                                                <span className="text-[10px] text-zinc-650 font-mono font-medium block mt-1">
                                                    {new Date(rep.created_at).toLocaleDateString()}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="text-zinc-200 flex items-center gap-1.5">
                                                    <span>{rep.device_brand} {rep.device_model}</span>
                                                    {rep.device_id && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setHistoryModalDeviceId(rep.device_id);
                                                            }}
                                                            className="p-1 text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors cursor-pointer"
                                                            title="View Complete Device Repair History"
                                                        >
                                                            <Clock size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="text-[11px] text-zinc-500 font-mono mt-0.5">{rep.device_serial}</div>
                                            </td>
                                            <td className="py-4 px-4 text-zinc-400">
                                                {rep.employee_name || <span className="text-zinc-650 italic">Inventory</span>}
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="flex flex-col gap-1 items-start">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${rep.priority === 'Urgent'
                                                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                                        : 'bg-zinc-900 text-zinc-550 border-zinc-800/40'
                                                        }`}>
                                                        {rep.priority}
                                                    </span>
                                                    <span className="text-[10px] text-zinc-550 block font-mono">{rep.problem_type}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4">
                                                {rep.sla_deadline ? (
                                                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${isSlaClose ? 'text-red-400 animate-pulse' : 'text-zinc-400'
                                                        }`}>
                                                        {isSlaClose ? <ShieldAlert size={13} /> : <Clock size={13} />}
                                                        {rep.sla_deadline.replace('T', ' ').substring(0, 16)}
                                                    </span>
                                                ) : (
                                                    <span className="text-zinc-600">-</span>
                                                )}
                                            </td>
                                            <td className="py-4 px-4">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${rep.status === 'completed'
                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                    : rep.status === 'delivered'
                                                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                        : rep.status === 'in_progress'
                                                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                                            : rep.status === 'cancelled'
                                                                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                    }`}>
                                                    {rep.status.toUpperCase().replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4" onClick={e => e.stopPropagation()}>
                                                {rep.payment_status === 'paid' ? (
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                                            <CheckCircle2 size={11} /> Paid {approxBudget > 0 ? `₹${approxBudget.toLocaleString('en-IN')}` : ''}
                                                        </span>
                                                        <div className="flex items-center gap-1.5 pt-0.5">
                                                            <button
                                                                onClick={() => handleViewTicketReceipt(rep.id)}
                                                                disabled={isActionLoading}
                                                                className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-neon-cyan/40 text-zinc-300 hover:text-neon-cyan text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                                                                title="View Official Tax Invoice"
                                                            >
                                                                <Receipt size={11} className="text-neon-cyan" />
                                                                <span>View</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handlePrintTicketReceipt(rep.id)}
                                                                disabled={isActionLoading}
                                                                className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-400/40 text-zinc-300 hover:text-amber-400 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                                                                title="Print Document"
                                                            >
                                                                <Printer size={11} className="text-amber-400" />
                                                                <span>Print</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDownloadTicketReceipt(rep.id)}
                                                                disabled={downloadingId === rep.id || isActionLoading}
                                                                className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/40 text-zinc-300 hover:text-emerald-400 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                                                                title="Download Official GST Tax Invoice"
                                                            >
                                                                {downloadingId === rep.id ? (
                                                                    <Loader2 size={11} className="animate-spin text-emerald-400" />
                                                                ) : (
                                                                    <Download size={11} className="text-emerald-400" />
                                                                )}
                                                                <span>PDF</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : rep.payment_status === 'pending_verification' ? (
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full animate-pulse font-mono">
                                                            <Clock size={11} /> {((rep as any).collection_status === 'collected' || (rep as any).collectionStatus === 'collected') ? 'Cash Collected' : 'Verification Pending'}
                                                        </span>
                                                        <span className="text-[10px] text-zinc-500 font-mono">Awaiting Clearance</span>
                                                    </div>
                                                ) : rep.payment_status === 'rejected' ? (
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full font-mono">
                                                            <XCircle size={11} /> Rejected
                                                        </span>
                                                        <button
                                                            onClick={() => setPayingTicket(rep)}
                                                            className="text-[10px] text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
                                                        >
                                                            Retry Payment
                                                        </button>
                                                    </div>
                                                ) : (rep.status === 'completed' || rep.status === 'delivered') && approxBudget > 0 ? (
                                                    <button
                                                        onClick={() => setPayingTicket(rep)}
                                                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow transition-all cursor-pointer"
                                                    >
                                                        <CreditCard size={12} />
                                                        <span>Pay ₹{approxBudget.toLocaleString('en-IN')}</span>
                                                    </button>
                                                ) : approvalStatus === 'pending_approval' ? (
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full animate-pulse">
                                                            <Clock size={10} /> Approval Req.
                                                        </span>
                                                        <span className="text-xs font-semibold text-white font-mono">
                                                            Approx: ₹{approxBudget.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                ) : approvalStatus === 'approved' ? (
                                                    <div className="flex flex-col items-start gap-0.5">
                                                        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                                                            <CheckCircle2 size={10} /> Approved
                                                        </span>
                                                        <span className="text-xs text-zinc-300 font-mono">
                                                            ₹{approxBudget.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                ) : approvalStatus === 'rejected' ? (
                                                    <div className="flex flex-col items-start gap-0.5">
                                                        <span className="text-[10px] uppercase font-mono font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded">
                                                            Declined
                                                        </span>
                                                        <span className="text-xs text-zinc-500 line-through font-mono">
                                                            ₹{approxBudget.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                ) : approxBudget > 0 ? (
                                                    <div className="text-xs text-zinc-400">
                                                        <span className="text-zinc-500 text-[10px] block font-mono">Approx. Budget</span>
                                                        <span className="font-mono font-semibold text-zinc-300">₹{approxBudget.toLocaleString('en-IN')}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-zinc-600">-</span>
                                                )}
                                            </td>
                                            <td className="py-4 px-4 text-right">
                                                <div className="flex justify-end items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => setQuickDrawerTicket(rep)}
                                                        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 transition-colors cursor-pointer"
                                                        title="Quick Preview in Drawer"
                                                    >
                                                        <Eye size={13} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleSingleExport(rep.id, rep.ticket_number)}
                                                        className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-emerald-400 transition-colors cursor-pointer"
                                                        title="Export Single Ticket (CSV)"
                                                    >
                                                        <Download size={13} />
                                                    </button>
                                                    {rep.status === 'pending' && (
                                                        <button
                                                            onClick={() => {
                                                                setCancellingTicketId(rep.id);
                                                                setCancelError('');
                                                                setCancelModalOpen(true);
                                                            }}
                                                            className="text-[10px] uppercase font-bold text-red-500 hover:text-red-400 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 rounded-lg transition-colors border border-red-500/20 cursor-pointer"
                                                        >
                                                            Cancel
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* New B2B Ticket Drawer */}
            <SideDrawer
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title="Create B2B Repair Ticket"
                subtitle="Register corporate hardware for repair and assign technician SLA"
                size="xl"
            >
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {formErrors.general && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs flex items-center gap-2">
                                    <AlertCircle size={15} className="shrink-0" />
                                    <span>{formErrors.general}</span>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1 col-span-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Select Device (Asset) *</label>
                                        {deviceId && (
                                            <button
                                                type="button"
                                                onClick={() => setHistoryModalDeviceId(Number(deviceId))}
                                                className="text-[11px] text-cyan-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                                            >
                                                <Clock size={11} /> View Device Repair History
                                            </button>
                                        )}
                                    </div>
                                    <select
                                        value={deviceId}
                                        onChange={e => {
                                            handleDeviceSelect(e.target.value);
                                            if (formErrors.deviceId) setFormErrors(prev => ({ ...prev, deviceId: undefined }));
                                        }}
                                        className={`w-full bg-[#050505] border ${formErrors.deviceId ? 'border-red-500/80 focus:border-red-500' : 'border-zinc-800/50 hover:border-zinc-700/50 focus:border-indigo-500/50'} rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors`}
                                    >
                                        <option value="">-- Choose Corporate Device --</option>
                                        {devices.map(d => {
                                            const isDeactivated = d.is_active === false || d.is_active === 0 || d.status === 'decommissioned' || d.status === 'inactive';
                                            return (
                                                <option key={d.id} value={d.id} disabled={isDeactivated}>
                                                    [{d.asset_tag || 'NO-TAG'}] {d.brand} {d.model_number} (S/N: {d.serial_number}){isDeactivated ? ' [DEACTIVATED]' : ''}
                                                </option>
                                            );
                                        })}
                                    </select>
                                    {formErrors.deviceId && (
                                        <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                                            <AlertCircle size={12} className="shrink-0" />
                                            <span>{formErrors.deviceId}</span>
                                        </p>
                                    )}
                                </div>
                            </div>

                            {activeRepairOnSelectedDevice && (
                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-start gap-2.5">
                                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                        <span className="font-semibold block">Notice: Device Currently Under Repair</span>
                                        <p className="text-[11px] text-amber-200/80 mt-0.5">
                                            This device already has an active repair ticket: <strong>#{activeRepairOnSelectedDevice.ticket_number}</strong> (Status: {activeRepairOnSelectedDevice.status}). Submitting this form will log an additional, separate repair ticket for this device.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setHistoryModalDeviceId(Number(deviceId))}
                                            className="text-[11px] text-cyan-400 hover:underline mt-1 inline-flex items-center gap-1 cursor-pointer"
                                        >
                                            <Clock size={11} /> View this device's full repair history
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider font-semibold">User Assignee (Employee)</label>
                                    <select
                                        value={employeeId}
                                        onChange={e => setEmployeeId(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-800/50 hover:border-zinc-700/50 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                    >
                                        <option value="">No owner / Inventory asset</option>
                                        {employees.map(e => (
                                            <option key={e.id} value={e.id}>{e.name} ({e.department || 'All'})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Problem Type</label>
                                    <select
                                        value={problemType}
                                        onChange={e => setProblemType(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-800/50 hover:border-zinc-700/50 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                    >
                                        <option value="Hardware">Hardware Fault</option>
                                        <option value="Software">Software/OS Bug</option>
                                        <option value="Network">Networking Error</option>
                                        <option value="Other">Other Diagnostic</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Repair Priority</label>
                                    <select
                                        value={priority}
                                        onChange={e => setPriority(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-800/50 hover:border-zinc-700/50 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                    >
                                        <option value="Standard">Standard (Low impact)</option>
                                        <option value="Medium">Medium Priority</option>
                                        <option value="Urgent">Urgent (Restricted workflow)</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Service Option</label>
                                    <select
                                        value={servicePreference}
                                        onChange={e => setServicePreference(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-800/50 hover:border-zinc-700/50 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-zinc-400 focus:outline-none transition-colors"
                                    >
                                        <option value="carry_in">Carry-In (Drop off)</option>
                                        <option value="pick_up">Pick-Up request</option>
                                        <option value="onsite">On-Site Technicians</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Preferred Notification</label>
                                <select
                                    value={preferredContact}
                                    onChange={e => setPreferredContact(e.target.value)}
                                    className="w-full bg-[#050505] border border-zinc-800/50 hover:border-zinc-700/50 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors"
                                >
                                    <option value="email">Email address</option>
                                    <option value="sms">SMS Text Alert</option>
                                    <option value="whatsapp">WhatsApp chat</option>
                                    <option value="phone">Direct Call</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Explain Fault *</label>
                                    <span className={`text-[10px] font-mono ${problemDescription.length > DESCRIPTION_MAX_LENGTH ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
                                        {problemDescription.length} / {DESCRIPTION_MAX_LENGTH}
                                    </span>
                                </div>
                                <textarea
                                    rows={3}
                                    maxLength={DESCRIPTION_MAX_LENGTH}
                                    placeholder="Specify problem description..."
                                    value={problemDescription}
                                    onChange={e => {
                                        setProblemDescription(e.target.value);
                                        if (formErrors.problemDescription) setFormErrors(prev => ({ ...prev, problemDescription: undefined }));
                                    }}
                                    className={`w-full bg-[#050505] border ${formErrors.problemDescription ? 'border-red-500/80 focus:border-red-500' : 'border-zinc-800/50 hover:border-zinc-700/50 focus:border-indigo-500/50'} rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors resize-none font-medium`}
                                />
                                {formErrors.problemDescription && (
                                    <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                                        <AlertCircle size={12} className="shrink-0" />
                                        <span>{formErrors.problemDescription}</span>
                                    </p>
                                )}
                            </div>

                            <div className="pt-4 border-t border-zinc-800/40 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="bg-transparent hover:bg-zinc-900 text-zinc-400 hover:text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer flex items-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={15} className="animate-spin" />
                                            <span>Submitting...</span>
                                        </>
                                    ) : (
                                        <span>Submit Request</span>
                                    )}
                                </button>
                            </div>
                        </form>
            </SideDrawer>

            {/* Cancel Proof Modal */}
            {cancelModalOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-sm">
                    <div className="bg-[#0a0a0a] border border-red-500/30 rounded-2xl w-full max-w-sm overflow-hidden animate-slideUp">
                        <div className="px-6 py-4 border-b border-zinc-800/40 flex justify-between items-center text-red-500 font-bold uppercase tracking-widest text-xs">
                            ⚠ Confirm Void Action
                        </div>
                        <div className="p-6 space-y-4">
                            {cancelError && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs flex items-center gap-2">
                                    <AlertCircle size={15} className="shrink-0" />
                                    <span>{cancelError}</span>
                                </div>
                            )}
                            <p className="text-sm text-zinc-400 leading-relaxed font-semibold">
                                Voiding this ticket will alert administrators securely via system logs. You will have to create a new ticket to restore this flow.
                            </p>
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider font-semibold">Cancellation Reason</span>
                                    <span className={`text-[10px] font-mono ${cancelReason.length > 500 ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
                                        {cancelReason.length} / 500
                                    </span>
                                </div>
                                <textarea
                                    rows={2}
                                    maxLength={500}
                                    placeholder="Audit Reason (E.g. Cost, Handled internally)..."
                                    value={cancelReason}
                                    onChange={e => {
                                        setCancelReason(e.target.value);
                                        if (cancelError) setCancelError('');
                                    }}
                                    className="w-full bg-[#050505] border border-zinc-800/50 hover:border-zinc-700/50 focus:border-red-500/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors resize-none mb-2 font-medium"
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setCancelModalOpen(false)}
                                    disabled={isCancelling}
                                    className="bg-transparent hover:bg-zinc-900 text-zinc-500 hover:text-white px-4 py-2.5 rounded-xl text-xs uppercase tracking-widest font-bold transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCancelTicket}
                                    disabled={isCancelling}
                                    className="bg-red-500/20 text-red-500 border border-red-500/30 hover:bg-red-500/30 px-6 py-2.5 rounded-xl text-xs uppercase tracking-widest font-bold transition-colors cursor-pointer flex items-center gap-2"
                                >
                                    {isCancelling ? 'Processing...' : 'Void Ticket'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Tickets Import Drawer */}
            <SideDrawer
                isOpen={isBulkOpen}
                onClose={() => setIsBulkOpen(false)}
                title="Bulk Upload Repair Tickets"
                subtitle="Submit multiple tickets in batch via Excel (.xlsx) or CSV"
                size="lg"
            >
                <form onSubmit={handleBulkUpload} className="p-6 space-y-6">
                            {bulkError && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs flex items-center gap-2">
                                    <AlertCircle size={15} className="shrink-0" />
                                    <span>{bulkError}</span>
                                </div>
                            )}

                            {bulkErrors.length > 0 && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs space-y-2 max-h-48 overflow-y-auto">
                                    <div className="font-semibold text-red-300 flex items-center gap-1.5">
                                        <AlertCircle size={14} /> Validation Errors ({bulkErrors.length})
                                    </div>
                                    <div className="space-y-1 divide-y divide-red-500/10 text-red-400">
                                        {bulkErrors.map((err, idx) => (
                                            <div key={idx} className="pt-1.5 first:pt-0">
                                                <span className="font-mono font-semibold text-white">Row {err.row}</span> ({err.field}): {err.error}
                                                {err.suggestion && <span className="block text-[11px] text-zinc-400 mt-0.5">💡 {err.suggestion}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="text-xs text-zinc-500 leading-relaxed space-y-2">
                                <p>Submit numerous repair tickets in a single batch. Devices must already be registered in fleet. Required headers: <code className="text-indigo-300 font-mono">device_serial</code>, <code className="text-indigo-300 font-mono">problem_description</code>.</p>
                                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/40 font-mono text-[10px] text-zinc-400 overflow-x-auto select-all">
                                    device_serial, employee_email, problem_type, problem_description, priority, service_preference, preferred_contact
                                </div>
                                <div className="flex items-center gap-4 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => handleDownloadTemplate('xlsx')}
                                        className="text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1.5 cursor-pointer text-xs"
                                    >
                                        <FileDown size={14} /> Download Excel Template (.xlsx)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDownloadTemplate('csv')}
                                        className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1.5 cursor-pointer text-xs"
                                    >
                                        <FileDown size={14} /> Download CSV Template (.csv)
                                    </button>
                                </div>
                            </div>

                            {/* Drag/Drop Box */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-zinc-800/50 hover:border-indigo-500/50 hover:bg-zinc-900/10 rounded-2xl p-8 text-center cursor-pointer transition-colors space-y-2"
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept=".csv, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv"
                                    className="hidden"
                                    onChange={e => {
                                        const files = e.target.files;
                                        if (files && files[0]) setCsvFile(files[0]);
                                    }}
                                />
                                <Upload size={32} className="mx-auto text-zinc-500" />
                                <div className="text-sm font-semibold text-zinc-300">
                                    {csvFile ? csvFile.name : 'Select or drop Excel (.xlsx) or CSV file'}
                                </div>
                                <div className="text-xs text-zinc-600">Excel (.xlsx) or CSV up to 5MB allowed</div>
                            </div>

                            <div className="pt-4 border-t border-zinc-800/40 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsBulkOpen(false)}
                                    className="bg-transparent hover:bg-zinc-900 text-zinc-400 hover:text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                                    disabled={uploading}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer flex items-center gap-2"
                                    disabled={!csvFile || uploading}
                                >
                                    {uploading ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                                            <span>Submitting...</span>
                                        </>
                                    ) : (
                                        <span>Process Tickets</span>
                                    )}
                                </button>
                            </div>
                        </form>
            </SideDrawer>

            {/* Device Repair History Modal */}
            {historyModalDeviceId && (
                <DeviceRepairHistoryModal
                    deviceId={historyModalDeviceId}
                    onSelectTicket={(ticket) => {
                        setHistoryModalDeviceId(null);
                        setQuickDrawerTicket(ticket);
                    }}
                    onClose={() => setHistoryModalDeviceId(null)}
                />
            )}

            {/* Quick Preview Drawer */}
            <SideDrawer
                isOpen={Boolean(quickDrawerTicket)}
                onClose={() => setQuickDrawerTicket(null)}
                title={`Ticket #${quickDrawerTicket?.ticket_number || quickDrawerTicket?.ticketNumber || ''}`}
                subtitle={`${quickDrawerTicket?.device_brand || ''} ${quickDrawerTicket?.device_model || ''}`}
                size="xl"
                badge={{
                    text: (quickDrawerTicket?.status || 'PENDING').toUpperCase().replace('_', ' '),
                    variant: quickDrawerTicket?.status === 'completed' ? 'success' : quickDrawerTicket?.status === 'delivered' ? 'info' : quickDrawerTicket?.status === 'in_progress' ? 'info' : 'warning'
                }}
                footer={
                    <div className="flex justify-between items-center w-full">
                        <button
                            type="button"
                            onClick={() => setQuickDrawerTicket(null)}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer"
                        >
                            Close Drawer
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const tid = quickDrawerTicket?.id;
                                setQuickDrawerTicket(null);
                                if (tid) openTicketDetails(tid);
                            }}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/20"
                        >
                            <ExternalLink size={13} />
                            Open Full Workspace
                        </button>
                    </div>
                }
            >
                {quickDrawerTicket && (
                    <RepairTicketWorkspace
                        ticket={quickDrawerTicket}
                        isDrawer={true}
                        role="company"
                        onSelectTicket={(ticket) => {
                            setQuickDrawerTicket(ticket);
                        }}
                        onBack={() => setQuickDrawerTicket(null)}
                        onOpenFullWorkspace={(tid) => {
                            setQuickDrawerTicket(null);
                            openTicketDetails(tid);
                        }}
                        onRefresh={() => {
                            fetchData();
                            setQuickDrawerTicket(null);
                        }}
                    />
                )}
            </SideDrawer>

            {/* Media Lightbox Modal */}
            {previewSrc && (
                <ImagePreviewModal
                    isOpen={!!previewSrc}
                    onClose={() => setPreviewSrc(null)}
                    src={previewSrc}
                    alt={previewAlt}
                />
            )}

            {/* Offline & Online Payment Methods Modal */}
            {payingTicket && (
                <PaymentMethodModal
                    isOpen={Boolean(payingTicket)}
                    onClose={() => setPayingTicket(null)}
                    ticketId={payingTicket.id}
                    ticketNumber={payingTicket.ticket_number}
                    amount={Number(payingTicket.repair_cost || payingTicket.estimated_cost || 0)}
                    token={token}
                    customerName={payingTicket.employee_name || (payingTicket as any).customer_name || (payingTicket as any).customerName || 'Corporate Customer'}
                    customerEmail={payingTicket.employee_email}
                    customerPhone={payingTicket.employee_phone}
                    onSuccess={() => {
                        setPayingTicket(null);
                        fetchData();
                    }}
                />
            )}

            {/* Standardized Bill / Tax Invoice Modal */}
            <PaymentReceiptModal
                isOpen={viewReceiptModalOpen}
                onClose={() => {
                    setViewReceiptModalOpen(false);
                    setSelectedReceiptData(null);
                    setSelectedReceiptTicketId(undefined);
                }}
                receipt={selectedReceiptData}
                ticketId={selectedReceiptData ? undefined : selectedReceiptTicketId}
            />
        </div>
    );
}
