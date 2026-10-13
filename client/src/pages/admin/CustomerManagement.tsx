import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { adminApi, billingApi } from '@/services/api';
import type { Customer } from '@/services/api';
import {
    Search, Loader2, Users, X, History, Building2, Eye, EyeOff, Edit3,
    ShieldCheck, ShieldOff, Mail, Phone, MapPin, Upload, KeyRound,
    ExternalLink, Activity, Wrench, Laptop, CreditCard, Receipt,
    DollarSign, CheckCircle2, AlertCircle, Clock, Download, RefreshCw,
    Plus, Check, ChevronLeft, ChevronRight, Calendar, Printer
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { appConfig } from '@/config/appConfig';
import { downloadPaymentBillPdf, printPaymentBill } from '@/utils/billGenerator';
import PhoneInput from '@/components/PhoneInput';
import { PromptModal } from '@/components/PromptModal';
import SideDrawer from '@/components/SideDrawer';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';
import { NAME_MAX_LENGTH, validateName, validateEmail, validatePassword, DUPLICATE_ERRORS } from '@/config/constants';
import { parsePhoneNumber, validatePhoneNumber, DEFAULT_COUNTRY } from '@/utils/phoneUtils';

export default function CustomerManagement() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

    // Primary Tab: Individual vs Corporate
    const urlType = searchParams.get('type') === 'company' ? 'company' : 'individual';
    const [activeTab, setActiveTab] = useState<'individual' | 'company'>(urlType);

    // Company Sub-Tab: Accounts Directory vs Corporate Repair Tickets vs Fleet & Devices
    const urlSubTab = (searchParams.get('tab') as 'accounts' | 'tickets' | 'devices') || 'accounts';
    const [companySubTab, setCompanySubTab] = useState<'accounts' | 'tickets' | 'devices'>(
        urlSubTab === 'tickets' ? 'tickets' : urlSubTab === 'devices' ? 'devices' : 'accounts'
    );

    // Pagination & Search
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [loading, setLoading] = useState(true);

    // Filters for Individual Customers
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [selectedRole, setSelectedRole] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');
    const [customerStartDate, setCustomerStartDate] = useState('');
    const [customerEndDate, setCustomerEndDate] = useState('');
    const [appliedStartDate, setAppliedStartDate] = useState('');
    const [appliedEndDate, setAppliedEndDate] = useState('');

    // Data for Company Accounts Directory
    const [companies, setCompanies] = useState<any[]>([]);
    const [companyStats, setCompanyStats] = useState<any>(null);

    // Data for Company Repair Tickets tab
    const [companyTickets, setCompanyTickets] = useState<any[]>([]);
    const [ticketStatusFilter, setTicketStatusFilter] = useState<string>('all');
    const [ticketPaymentFilter, setTicketPaymentFilter] = useState<string>('all');
    const [ticketCompanyFilter, setTicketCompanyFilter] = useState<string>('all');

    // Data for Company Fleet & Devices tab
    const [companyDevices, setCompanyDevices] = useState<any[]>([]);
    const [deviceStatusFilter, setDeviceStatusFilter] = useState<string>('all');
    const [deviceCompanyFilter, setDeviceCompanyFilter] = useState<string>('all');

    // Creation Modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [companyPayload, setCompanyPayload] = useState({ name: '', email: '', phone: '', password: '' });
    const [creatingCompany, setCreatingCompany] = useState(false);
    const [showCompanyPassword, setShowCompanyPassword] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState<number | null>(null);

    // Edit Company Modal
    const [showEditModal, setShowEditModal] = useState<any>(null);
    const [editPayload, setEditPayload] = useState({
        name: '', email: '', phone: '', contact_person: '', address: '', gst_number: '', website_url: '',
        company_logo: '', company_type: 'Business', notes: '', amc_status: 'Inactive', assigned_technician_id: ''
    });
    const [updatingCompany, setUpdatingCompany] = useState(false);
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [uploadingLogo, setUploadingLogo] = useState(false);

    const [createCompanyErrors, setCreateCompanyErrors] = useState<{ name?: string; email?: string; phone?: string; password?: string }>({});
    const [editCompanyErrors, setEditCompanyErrors] = useState<{ name?: string; contact_person?: string; email?: string; phone?: string }>({});
    const [deactivateCompanyModal, setDeactivateCompanyModal] = useState<{ id: number; name: string } | null>(null);
    const [deactivateCompanyLoading, setDeactivateCompanyLoading] = useState(false);

    // Password reset modal
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetUser, setResetUser] = useState<any>(null);
    const [newPassword, setNewPassword] = useState('');
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);

    // Individual History Modal
    const [historyModal, setHistoryModal] = useState<{
        id: number;
        name: string;
        customer?: any;
        stats?: { total: number; active: number; completed: number; cancelled: number };
        tickets: any[];
    } | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [customerTicketFilter, setCustomerTicketFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');

    // 360 Slide-over Details Panel
    const [selectedCompany, setSelectedCompany] = useState<any>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsTab, setDetailsTab] = useState<'overview' | 'branches' | 'employees' | 'devices' | 'tickets' | 'billing' | 'payments' | 'timeline'>('overview');

    // Set Repair Price Modal
    const [priceModal, setPriceModal] = useState<{
        ticketId: number;
        ticketNumber?: string;
        customerName?: string;
        companyName?: string;
        brand?: string;
        modelNumber?: string;
        currentCost: number;
    } | null>(null);
    const [newPrice, setNewPrice] = useState<string>('');
    const [priceNotes, setPriceNotes] = useState<string>('');
    const [notifyCustomerOnPrice, setNotifyCustomerOnPrice] = useState<boolean>(true);
    const [priceUpdating, setPriceUpdating] = useState<boolean>(false);

    // Corporate Payment Verification Actions
    const [paymentActionLoading, setPaymentActionLoading] = useState<number | null>(null);
    const [rejectPaymentModal, setRejectPaymentModal] = useState<any | null>(null);

    // Synchronize URL Params with State
    useEffect(() => {
        const typeParam = searchParams.get('type') === 'company' ? 'company' : 'individual';
        const tabParam = (searchParams.get('tab') as 'accounts' | 'tickets' | 'devices') || 'accounts';
        const actionParam = searchParams.get('action');

        if (typeParam !== activeTab) {
            setActiveTab(typeParam);
            setPage(1);
            setSearch('');
            setAppliedSearch('');
        }

        if (tabParam !== companySubTab) {
            setCompanySubTab(tabParam);
            setPage(1);
            setSearch('');
            setAppliedSearch('');
        }

        if (actionParam === 'create' && typeParam === 'company') {
            setShowCreateModal(true);
        } else {
            setShowCreateModal(false);
        }
    }, [searchParams]);

    // Fetch Technicians for assignment dropdowns
    useEffect(() => {
        if (!token) return;
        const fetchTechs = async () => {
            const res = await adminApi.getCustomers(token, 1, 100, '', 'technician');
            if (res.ok && res.data) {
                setTechnicians(res.data.data?.data || []);
            }
        };
        fetchTechs();
    }, [token]);

    // Media URL Helper
    const getMediaUrl = (filename: string) => {
        if (!filename) return '';
        if (filename.startsWith('http://') || filename.startsWith('https://')) return filename;
        return `${appConfig.apiUrl}/uploads/${filename}`;
    };

    // Primary Data Fetcher
    const fetchData = useCallback(async (
        targetPage = page,
        targetSearch = appliedSearch,
        targetRole = selectedRole,
        targetStatus = statusFilter,
        targetStartDate = appliedStartDate,
        targetEndDate = appliedEndDate
    ) => {
        if (!token) return;
        setLoading(true);

        try {
            if (activeTab === 'individual') {
                const res = await adminApi.getCustomers(
                    token,
                    targetPage,
                    10,
                    targetSearch,
                    targetRole,
                    targetStatus,
                    targetStartDate || undefined,
                    targetEndDate || undefined
                );
                if (res.ok && res.data) {
                    setCustomers(res.data.data?.data || []);
                    setTotalPages(res.data.data?.pagination?.totalPages || 1);
                }
            } else {
                // Company Sub-Modules
                if (companySubTab === 'accounts') {
                    const res = await adminApi.getCompanies(token, targetPage, 10, targetSearch, targetStatus);
                    if (res.ok && res.data) {
                        setCompanies(res.data.data?.data || []);
                        setTotalPages(res.data.data?.pagination?.totalPages || 1);
                    }
                    const statsRes = await adminApi.getCompanyStats(token);
                    if (statsRes.ok && statsRes.data) {
                        setCompanyStats(statsRes.data.data);
                    }
                } else if (companySubTab === 'tickets') {
                    const res = await adminApi.getCompanyTickets(
                        token,
                        targetPage,
                        10,
                        targetSearch,
                        ticketStatusFilter,
                        ticketPaymentFilter,
                        ticketCompanyFilter
                    );
                    if (res.ok && res.data) {
                        setCompanyTickets(res.data.data?.data || []);
                        setTotalPages(res.data.data?.pagination?.totalPages || 1);
                    }
                    const statsRes = await adminApi.getCompanyStats(token);
                    if (statsRes.ok && statsRes.data) {
                        setCompanyStats(statsRes.data.data);
                    }
                } else if (companySubTab === 'devices') {
                    const res = await adminApi.getCompanyDevices(
                        token,
                        targetPage,
                        10,
                        targetSearch,
                        deviceStatusFilter,
                        deviceCompanyFilter
                    );
                    if (res.ok && res.data) {
                        setCompanyDevices(res.data.data?.data || []);
                        setTotalPages(res.data.data?.pagination?.totalPages || 1);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to fetch data:', err);
        } finally {
            setLoading(false);
        }
    }, [token, activeTab, companySubTab, page, appliedSearch, selectedRole, statusFilter, appliedStartDate, appliedEndDate, ticketStatusFilter, ticketPaymentFilter, ticketCompanyFilter, deviceStatusFilter, deviceCompanyFilter]);

    useEffect(() => {
        fetchData(page, appliedSearch, selectedRole, statusFilter, appliedStartDate, appliedEndDate);
    }, [fetchData]);

    const handleApplyDateFilter = () => {
        if (customerStartDate && customerEndDate && customerStartDate > customerEndDate) {
            toast.error('From Date cannot be later than To Date.');
            return;
        }
        setAppliedStartDate(customerStartDate);
        setAppliedEndDate(customerEndDate);
        setPage(1);
    };

    const handleClearDateFilter = () => {
        setCustomerStartDate('');
        setCustomerEndDate('');
        setAppliedStartDate('');
        setAppliedEndDate('');
        setPage(1);
    };

    // Tab Navigation Handlers
    const handleTabChange = (tab: 'individual' | 'company') => {
        setActiveTab(tab);
        setPage(1);
        setSearch('');
        setAppliedSearch('');
        setStatusFilter('');
        setSelectedRole('');
        setCustomerStartDate('');
        setCustomerEndDate('');
        setAppliedStartDate('');
        setAppliedEndDate('');
        if (tab === 'company') {
            setSearchParams({ type: 'company', tab: 'accounts' });
        } else {
            setSearchParams({ type: 'individual' });
        }
    };

    const handleSubTabChange = (newSubTab: 'accounts' | 'tickets' | 'devices') => {
        setCompanySubTab(newSubTab);
        setPage(1);
        setSearch('');
        setAppliedSearch('');
        setSearchParams({ type: 'company', tab: newSubTab });
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setAppliedSearch(search);
        setPage(1);
    };

    // 360 View Loader
    const view360Details = async (id: number) => {
        if (!token) return;
        setDetailsLoading(true);
        setDetailsTab('overview');
        const res = await adminApi.getCompanyDetails(token, id);
        if (res.ok && res.data) {
            setSelectedCompany(res.data.data);
        } else {
            toast.error(res.error || 'Failed to load details');
        }
        setDetailsLoading(false);
    };

    // History Modal Loader
    const viewHistory = async (id: number, name: string) => {
        if (!token) return;
        setHistoryLoading(true);
        setCustomerTicketFilter('all');
        setHistoryModal({ id, name, tickets: [] });
        try {
            const res = await adminApi.getCustomerHistory(token, id);
            if (res.ok && res.data) {
                const payload = (res.data as any).data;
                if (payload && payload.tickets) {
                    setHistoryModal({
                        id,
                        name: payload.customer?.name || name,
                        customer: payload.customer,
                        stats: payload.stats,
                        tickets: payload.tickets
                    });
                } else if (Array.isArray(payload)) {
                    setHistoryModal({
                        id,
                        name,
                        tickets: payload,
                        stats: {
                            total: payload.length,
                            active: payload.filter((t: any) => ['pending', 'in_progress'].includes(t.status)).length,
                            completed: payload.filter((t: any) => ['completed', 'delivered'].includes(t.status)).length,
                            cancelled: payload.filter((t: any) => t.status === 'cancelled').length
                        }
                    });
                }
            } else {
                toast.error(res.error || 'Failed to load customer history');
            }
        } catch (err) {
            console.error('Failed to load customer history:', err);
            toast.error('Failed to load customer history');
        } finally {
            setHistoryLoading(false);
        }
    };

    // Bill / Receipt Modal & Viewer State
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [selectedReceiptTicketId, setSelectedReceiptTicketId] = useState<number | string | null>(null);
    const [selectedReceiptInvoiceId, setSelectedReceiptInvoiceId] = useState<number | string | null>(null);

    // Bill / Receipt Generator
    const handleDownloadBill = async (ticketId: number) => {
        if (!token) return;
        const toastId = toast.loading('Generating official bill PDF...');
        try {
            const res = await adminApi.getPaymentReceipt(token, ticketId);
            if (res.ok && res.data) {
                await downloadPaymentBillPdf((res.data as any).data);
                toast.success('Bill generated and downloaded!', { id: toastId });
            } else {
                toast.error(res.error || 'Failed to retrieve bill data', { id: toastId });
            }
        } catch (err: any) {
            toast.error('Error generating bill: ' + (err.message || 'Unknown error'), { id: toastId });
        }
    };

    const handlePrintBill = async (ticketId: number) => {
        if (!token) return;
        const toastId = toast.loading('Preparing official bill for printing...');
        try {
            const res = await adminApi.getPaymentReceipt(token, ticketId);
            const receiptData = res.ok && res.data ? (res.data as any).data || res.data : null;
            if (receiptData) {
                await printPaymentBill(receiptData);
                toast.dismiss(toastId);
            } else {
                toast.error(res.error || 'Failed to retrieve bill data for printing', { id: toastId });
            }
        } catch (err: any) {
            toast.error('Error printing bill: ' + (err.message || 'Unknown error'), { id: toastId });
        }
    };

    // Corporate Payment Verification Handlers
    const handleVerifyCorporatePayment = async (pmt: any) => {
        if (!token) return;
        setPaymentActionLoading(pmt.id);
        const toastId = toast.loading('Verifying and settling offline payment...');
        try {
            const res = await billingApi.verifyOfflinePayment({
                paymentId: pmt.payment_id || pmt.paymentId,
                ticketId: pmt.ticket_id || pmt.ticketId,
                invoiceId: pmt.invoice_id || pmt.invoiceId,
                action: 'verify'
            }, token);
            if (res.ok) {
                toast.success('Offline payment verified and ticket settled!', { id: toastId });
                if (selectedCompany?.id) {
                    view360Details(selectedCompany.id);
                }
            } else {
                toast.error(res.error || 'Failed to verify payment.', { id: toastId });
            }
        } catch (err: any) {
            toast.error(err.message || 'Error verifying payment.', { id: toastId });
        } finally {
            setPaymentActionLoading(null);
        }
    };

    const handleRejectCorporatePayment = (pmt: any) => {
        setRejectPaymentModal(pmt);
    };

    const handleConfirmRejectCorporatePayment = async (reason: string) => {
        if (!token || !rejectPaymentModal) return;
        if (!reason.trim()) {
            toast.error('Please provide a reason for rejecting the payment.');
            return;
        }
        setPaymentActionLoading(rejectPaymentModal.id);
        const toastId = toast.loading('Rejecting payment...');
        try {
            const res = await billingApi.verifyOfflinePayment({
                paymentId: rejectPaymentModal.payment_id || rejectPaymentModal.paymentId,
                ticketId: rejectPaymentModal.ticket_id || rejectPaymentModal.ticketId,
                invoiceId: rejectPaymentModal.invoice_id || rejectPaymentModal.invoiceId,
                action: 'reject',
                rejectionReason: reason.trim()
            }, token);
            if (res.ok) {
                toast.success('Payment marked as rejected.', { id: toastId });
                setRejectPaymentModal(null);
                if (selectedCompany?.id) {
                    view360Details(selectedCompany.id);
                }
            } else {
                toast.error(res.error || 'Failed to reject payment.', { id: toastId });
            }
        } catch (err: any) {
            toast.error(err.message || 'Error rejecting payment.', { id: toastId });
        } finally {
            setPaymentActionLoading(null);
        }
    };

    // Set Price Action
    const handleOpenSetPrice = (ticket: any) => {
        const currentPrice = ticket.repairCost !== undefined ? ticket.repairCost : (ticket.repair_cost || ticket.estimatedCost || ticket.estimated_cost || 0);
        setPriceModal({
            ticketId: ticket.id,
            ticketNumber: ticket.ticketNumber || ticket.ticket_number || `#${ticket.id}`,
            customerName: ticket.customerName || ticket.customer_name,
            companyName: ticket.companyName || ticket.company_name,
            brand: ticket.brand,
            modelNumber: ticket.modelNumber || ticket.model_number,
            currentCost: Number(currentPrice) || 0
        });
        setNewPrice(String(currentPrice || ''));
        setPriceNotes('');
        setNotifyCustomerOnPrice(true);
    };

    const handleSavePrice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token || !priceModal) return;

        const parsedAmount = parseFloat(newPrice);
        if (isNaN(parsedAmount) || parsedAmount < 0) {
            toast.error('Please enter a valid non-negative repair charge.');
            return;
        }

        setPriceUpdating(true);
        try {
            const res = await adminApi.setRepairCharges(token, priceModal.ticketId, {
                repairCost: parsedAmount,
                notifyCustomer: notifyCustomerOnPrice,
                notes: priceNotes
            });

            if (res.ok) {
                toast.success(`Price updated to ₹${parsedAmount.toLocaleString()} for ticket ${priceModal.ticketNumber}!`);
                setPriceModal(null);
                // Refresh data
                fetchData();
                if (selectedCompany) {
                    view360Details(selectedCompany.profile?.id || selectedCompany.id);
                }
            } else {
                toast.error(res.error || 'Failed to update repair charge');
            }
        } catch (err) {
            toast.error('An unexpected error occurred while setting repair price.');
        } finally {
            setPriceUpdating(false);
        }
    };

    // Company Activation / Deactivation Handlers
    const handleToggleStatus = async (id: number, currentActive: boolean | number) => {
        if (!token) return;
        const nextActive = !currentActive;
        const res = await adminApi.toggleCompanyStatus(token, id, nextActive);
        if (res.ok) {
            setCompanies(prev => prev.map(c => c.id === id ? { ...c, is_active: nextActive ? 1 : 0 } : c));
            toast.success(`Company ${nextActive ? 'activated' : 'deactivated'} successfully.`);
        } else {
            toast.error(res.error || 'Failed to toggle status');
        }
    };

    const handleDeactivateCompany = (id: number, name: string) => {
        setDeactivateCompanyModal({ id, name });
    };

    const handleConfirmDeactivateCompany = async (reason: string) => {
        if (!token || !deactivateCompanyModal) return;
        setDeactivateCompanyLoading(true);
        const res = await adminApi.deactivateCompany(token, deactivateCompanyModal.id, reason.trim() || undefined);
        if (res.ok) {
            toast.success(`Company "${deactivateCompanyModal.name}" deactivated.`);
            setDeactivateCompanyModal(null);
            fetchData();
        } else {
            toast.error(res.error || 'Failed to deactivate company.');
        }
        setDeactivateCompanyLoading(false);
    };

    const handleReactivateCompany = async (id: number, name: string) => {
        if (!token) return;
        setDeleteLoading(id);
        const res = await adminApi.reactivateCompany(token, id);
        if (res.ok) {
            toast.success(`Company "${name}" reactivated!`);
            fetchData();
        } else {
            toast.error(res.error || 'Failed to reactivate company.');
        }
        setDeleteLoading(null);
    };

    // Password Reset
    const handleResetPasswordClick = (user: any) => {
        setResetUser(user);
        setNewPassword('');
        setShowResetModal(true);
    };

    const handleResetPasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPassword || newPassword.length < 8) {
            toast.error('Password must be at least 8 characters long.');
            return;
        }

        setResetLoading(true);
        try {
            const res = await adminApi.resetUserPassword(token || '', resetUser.id, newPassword);
            if (res.ok) {
                toast.success(`Password reset successfully for ${resetUser.company_name || resetUser.name}!`);
                setShowResetModal(false);
                setResetUser(null);
                setNewPassword('');
            } else {
                toast.error(res.error || 'Failed to reset password. Please try again.');
            }
        } catch (err) {
            toast.error('An unexpected network error occurred.');
        } finally {
            setResetLoading(false);
        }
    };

    // Edit Company
    const handleEditClick = (company: any) => {
        setShowEditModal(company);
        setEditPayload({
            name: company.company_name || company.name || '',
            email: company.email || '',
            phone: company.phone || company.phone_number || '',
            contact_person: company.contact_person || '',
            address: company.address || '',
            gst_number: company.gst_number || '',
            website_url: company.website_url || '',
            company_logo: company.company_logo || '',
            company_type: company.company_type || 'Business',
            notes: company.notes || '',
            amc_status: company.amc_status || 'Inactive',
            assigned_technician_id: company.assigned_technician_id || ''
        });
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token || !showEditModal) return;
        setEditCompanyErrors({});

        const errs: { name?: string; contact_person?: string; email?: string; phone?: string } = {};

        const nameVal = validateName(editPayload.name, 'Company name');
        if (!nameVal.isValid) {
            errs.name = nameVal.error || 'Please enter a valid company name.';
        }

        if (editPayload.contact_person) {
            const contactVal = validateName(editPayload.contact_person, 'Contact person');
            if (!contactVal.isValid) {
                errs.contact_person = contactVal.error || 'Please enter a valid contact person.';
            }
        }

        if (editPayload.email) {
            const emailVal = validateEmail(editPayload.email);
            if (!emailVal.isValid) {
                errs.email = emailVal.error || 'Please enter a valid email address.';
            }
        }

        if (editPayload.phone) {
            const { country, nationalNumber } = parsePhoneNumber(editPayload.phone.trim(), DEFAULT_COUNTRY);
            const val = validatePhoneNumber(nationalNumber, country);
            if (!val.isValid) {
                errs.phone = val.error || 'Please enter a valid phone number.';
            }
        }

        if (Object.keys(errs).length > 0) {
            setEditCompanyErrors(errs);
            return;
        }

        setUpdatingCompany(true);
        const res = await adminApi.updateCompany(token, showEditModal.id, editPayload);
        if (res.ok) {
            toast.success('Company updated successfully!');
            setShowEditModal(null);
            setEditCompanyErrors({});
            fetchData();
        } else {
            const errMsg = res.error || 'Failed to update company';
            if (errMsg.toLowerCase().includes('phone') || res.errors?.phone) {
                setEditCompanyErrors(prev => ({ ...prev, phone: res.errors?.phone || DUPLICATE_ERRORS.PHONE }));
            } else if (errMsg.toLowerCase().includes('email') || res.errors?.email) {
                setEditCompanyErrors(prev => ({ ...prev, email: res.errors?.email || DUPLICATE_ERRORS.EMAIL }));
            } else {
                toast.error(errMsg);
            }
        }
        setUpdatingCompany(false);
    };

    // Logo Upload
    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !token) return;

        setUploadingLogo(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const apiRes = await fetch(`${appConfig.apiUrl}/api/admin/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const res = await apiRes.json();
            if (res.success && res.data) {
                setEditPayload(p => ({ ...p, company_logo: res.data.filename }));
                toast.success('Logo uploaded successfully!');
            } else {
                toast.error(res.message || 'Failed to upload logo');
            }
        } catch (err) {
            toast.error('Failed to upload logo');
        } finally {
            setUploadingLogo(false);
        }
    };

    // Create Company
    const handleCreateCompany = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        setCreateCompanyErrors({});

        const errs: { name?: string; email?: string; phone?: string; password?: string } = {};

        const nameVal = validateName(companyPayload.name, 'Company legal name');
        if (!nameVal.isValid) {
            errs.name = nameVal.error || 'Please enter a valid company name.';
        }

        const emailVal = validateEmail(companyPayload.email);
        if (!emailVal.isValid) {
            errs.email = emailVal.error || 'Please enter a valid email address.';
        }

        if (companyPayload.phone) {
            const { country, nationalNumber } = parsePhoneNumber(companyPayload.phone.trim(), DEFAULT_COUNTRY);
            const val = validatePhoneNumber(nationalNumber, country);
            if (!val.isValid) {
                errs.phone = val.error || 'Please enter a valid contact phone number.';
            }
        }

        const passVal = validatePassword(companyPayload.password);
        if (!passVal.isValid) {
            errs.password = passVal.error || 'Password must be at least 8 characters long.';
        }

        if (Object.keys(errs).length > 0) {
            setCreateCompanyErrors(errs);
            return;
        }

        setCreatingCompany(true);
        const res = await adminApi.createCompany(token, companyPayload);
        if (res.ok) {
            toast.success('Company registered successfully!');
            setShowCreateModal(false);
            setCompanyPayload({ name: '', email: '', phone: '', password: '' });
            setCreateCompanyErrors({});
            fetchData();
        } else {
            const errMsg = res.error || 'Failed to register company';
            if (errMsg.toLowerCase().includes('phone') || res.errors?.phone) {
                setCreateCompanyErrors(prev => ({ ...prev, phone: res.errors?.phone || DUPLICATE_ERRORS.PHONE }));
            } else if (errMsg.toLowerCase().includes('email') || res.errors?.email) {
                setCreateCompanyErrors(prev => ({ ...prev, email: res.errors?.email || DUPLICATE_ERRORS.EMAIL }));
            } else {
                toast.error(errMsg);
            }
        }
        setCreatingCompany(false);
    };

    // Verified Payment Status Badge Component
    const renderPaymentBadge = (paymentStatus: string | null | undefined) => {
        const s = (paymentStatus || 'unpaid').toLowerCase();
        if (s === 'paid') {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 size={11} className="text-emerald-400" />
                    PAID
                </span>
            );
        }
        if (s === 'pending_verification') {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                    <Clock size={11} className="text-amber-400" />
                    VERIFICATION PENDING
                </span>
            );
        }
        if (s === 'rejected') {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    <AlertCircle size={11} className="text-rose-400" />
                    REJECTED
                </span>
            );
        }
        if (s === 'failed') {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                    <AlertCircle size={11} className="text-red-400" />
                    FAILED
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Clock size={11} className="text-amber-400" />
                UNPAID
            </span>
        );
    };

    return (
        <div className="space-y-6 font-sans">
            {/* Header Title & Subtitle */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight flex items-center gap-2">
                        {activeTab === 'company' ? (
                            <Building2 size={24} className="text-indigo-400" />
                        ) : (
                            <Users size={24} className="text-neon-cyan" />
                        )}
                        {activeTab === 'company' ? 'Corporate Client Management' : 'User Directory'}
                    </h1>
                    <p className="text-xs text-zinc-500 mt-1">
                        {activeTab === 'company'
                            ? 'Centralized corporate command center for accounts, fleet inventory, repair operations, invoices, and verified settlements.'
                            : 'Manage individual customer accounts, technician credentials, and user access roles.'}
                    </p>
                </div>
            </div>

            {/* Sub-Navigation for Corporate Clients Module */}
            {activeTab === 'company' && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-900 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => handleSubTabChange('accounts')}
                            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 border ${companySubTab === 'accounts'
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                                : 'bg-zinc-900/40 text-zinc-400 border-transparent hover:text-white hover:bg-zinc-850'
                                }`}
                        >
                            <Building2 size={15} />
                            <span>Company Directory</span>
                            {companyStats?.totalCompanies !== undefined && (
                                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-300">
                                    {companyStats.totalCompanies}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={() => handleSubTabChange('tickets')}
                            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 border ${companySubTab === 'tickets'
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                                : 'bg-zinc-900/40 text-zinc-400 border-transparent hover:text-white hover:bg-zinc-850'
                                }`}
                        >
                            <Wrench size={15} />
                            <span>Company Repair Tickets</span>
                            {companyStats?.totalCompanyTickets !== undefined && (
                                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-300">
                                    {companyStats.totalCompanyTickets}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={() => handleSubTabChange('devices')}
                            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 border ${companySubTab === 'devices'
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                                : 'bg-zinc-900/40 text-zinc-400 border-transparent hover:text-white hover:bg-zinc-850'
                                }`}
                        >
                            <Laptop size={15} />
                            <span>Fleet & Devices</span>
                        </button>
                    </div>

                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm w-full sm:w-auto sm:ml-auto"
                    >
                        <Plus size={15} /> Register Corporate Client
                    </button>
                </div>
            )}

            {/* B2B Stats Header Widgets */}
            {activeTab === 'company' && companySubTab === 'accounts' && companyStats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] uppercase font-mono text-zinc-500">Corporate Clients</h4>
                            <Building2 size={16} className="text-indigo-400" />
                        </div>
                        <p className="text-xl font-bold font-mono text-white mt-1">{companyStats.totalCompanies || 0}</p>
                        <div className="text-[10px] text-zinc-500 mt-1">
                            <span className="text-emerald-400 font-semibold">{companyStats.activeCompanies || 0} active</span> &bull; {companyStats.inactiveCompanies || 0} inactive
                        </div>
                    </div>

                    <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] uppercase font-mono text-zinc-500">Active Repair Fleet</h4>
                            <Wrench size={16} className="text-amber-400" />
                        </div>
                        <p className="text-xl font-bold font-mono text-white mt-1">{companyStats.totalCompanyTickets || 0}</p>
                        <div className="text-[10px] text-zinc-500 mt-1">
                            <span className="text-amber-400 font-semibold">{companyStats.statusCounts?.pending || 0} pending</span> &bull; <span className="text-cyan-400 font-semibold">{companyStats.statusCounts?.inProgress || 0} active</span>
                        </div>
                    </div>

                    <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] uppercase font-mono text-zinc-500">Devices Under Service</h4>
                            <Laptop size={16} className="text-cyan-400" />
                        </div>
                        <p className="text-xl font-bold font-mono text-white mt-1">{companyStats.totalDevicesUnderRepair || 0}</p>
                        <div className="text-[10px] text-zinc-500 mt-1">Corporate fleet inventory</div>
                    </div>

                    <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] uppercase font-mono text-zinc-500">Repairs Settled</h4>
                            <CheckCircle2 size={16} className="text-emerald-400" />
                        </div>
                        <p className="text-xl font-bold font-mono text-emerald-400 mt-1">{(companyStats.statusCounts?.completed || 0) + ((companyStats.statusCounts as any)?.delivered || 0)}</p>
                        <div className="text-[10px] text-zinc-500 mt-1">Verified and completed repairs</div>
                    </div>
                </div>
            )}

            {/* Filter Bar & Live Search */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
                    {activeTab === 'individual' && (
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { label: 'All Accounts', value: '' },
                                    { label: 'Customers', value: 'customer' },
                                    { label: 'Companies', value: 'company' },
                                    { label: 'Technicians', value: 'technician' },
                                    { label: 'Admins', value: 'admin' },
                                ].map(f => (
                                    <button
                                        key={f.value}
                                        onClick={() => { setSelectedRole(f.value); setPage(1); }}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${selectedRole === f.value
                                            ? 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/30'
                                            : 'bg-zinc-900/40 text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-zinc-805'
                                            }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>

                            {/* Date Range Filter */}
                            <div className="flex flex-wrap items-center gap-1.5 bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-1 text-xs">
                                <div className="flex items-center gap-1 px-2 text-zinc-500 font-mono text-[10px] uppercase">
                                    <Calendar size={12} className="text-neon-cyan" />
                                    <span>Registered:</span>
                                </div>
                                <input
                                    type="date"
                                    value={customerStartDate}
                                    max={customerEndDate || undefined}
                                    onChange={e => setCustomerStartDate(e.target.value)}
                                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-neon-cyan font-mono"
                                    title="From Date"
                                />
                                <span className="text-zinc-500 text-xs">to</span>
                                <input
                                    type="date"
                                    value={customerEndDate}
                                    min={customerStartDate || undefined}
                                    onChange={e => setCustomerEndDate(e.target.value)}
                                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-neon-cyan font-mono"
                                    title="To Date"
                                />
                                <button
                                    type="button"
                                    onClick={handleApplyDateFilter}
                                    className="px-2.5 py-1 bg-neon-cyan text-black font-semibold rounded-lg hover:bg-neon-cyan/90 transition-all cursor-pointer text-xs"
                                >
                                    Apply
                                </button>
                                {(appliedStartDate || appliedEndDate || customerStartDate || customerEndDate) && (
                                    <button
                                        type="button"
                                        onClick={handleClearDateFilter}
                                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-all cursor-pointer text-xs flex items-center gap-1"
                                        title="Clear date filter"
                                    >
                                        <X size={12} /> Reset
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Company Sub-Tab Filters */}
                    {activeTab === 'company' && companySubTab === 'accounts' && (
                        <div className="flex items-center bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-1">
                            {[
                                { label: 'All Companies', value: '' },
                                { label: 'Active', value: 'active' },
                                { label: 'Inactive', value: 'inactive' },
                            ].map(st => (
                                <button
                                    key={st.value}
                                    onClick={() => { setStatusFilter(st.value as any); setPage(1); }}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${statusFilter === st.value
                                        ? 'bg-zinc-800 text-white font-semibold shadow-sm'
                                        : 'text-zinc-400 hover:text-zinc-200'
                                        }`}
                                >
                                    {st.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {activeTab === 'company' && companySubTab === 'tickets' && (
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Ticket Status Filter */}
                            <select
                                value={ticketStatusFilter}
                                onChange={e => { setTicketStatusFilter(e.target.value); setPage(1); }}
                                className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono cursor-pointer"
                            >
                                <option value="all">All Repair Statuses</option>
                                <option value="pending">Pending</option>
                                <option value="in_progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="delivered">Delivered</option>
                                <option value="cancelled">Cancelled</option>
                            </select>

                            {/* Ticket Payment Status Filter */}
                            <select
                                value={ticketPaymentFilter}
                                onChange={e => { setTicketPaymentFilter(e.target.value); setPage(1); }}
                                className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono cursor-pointer"
                            >
                                <option value="all">All Payment Statuses</option>
                                <option value="paid">Verified Paid Only</option>
                                <option value="unpaid">Unpaid / Pending Only</option>
                                <option value="failed">Failed Only</option>
                            </select>
                        </div>
                    )}

                    {activeTab === 'company' && companySubTab === 'devices' && (
                        <div className="flex items-center bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-1">
                            {[
                                { label: 'All Fleet', value: 'all' },
                                { label: 'Active', value: 'active' },
                                { label: 'Inactive', value: 'inactive' },
                            ].map(st => (
                                <button
                                    key={st.value}
                                    onClick={() => { setDeviceStatusFilter(st.value); setPage(1); }}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${deviceStatusFilter === st.value
                                        ? 'bg-zinc-800 text-white font-semibold shadow-sm'
                                        : 'text-zinc-400 hover:text-zinc-200'
                                        }`}
                                >
                                    {st.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Search Bar */}
                <form onSubmit={handleSearch} className="relative w-full md:w-80">
                    <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
                    <input
                        type="text"
                        placeholder={
                            activeTab === 'individual'
                                ? "Search by Customer ID (TD-001), name, email, phone..."
                                : companySubTab === 'tickets'
                                    ? "Search ticket #, brand, model, employee..."
                                    : companySubTab === 'devices'
                                        ? "Search asset ID, serial, brand, model..."
                                        : "Search by Company ID (TD-C001, TD-AMC-C001), name, email, contact..."
                        }
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full bg-zinc-900/40 border border-zinc-800/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/40 transition-all font-outfit"
                    />
                </form>
            </div>

            {/* Main Content Area */}
            {loading ? (
                <div className="min-h-[40vh] flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                </div>
            ) : (
                <div className="border border-zinc-900 bg-zinc-950/20 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        {/* VIEW 1: Individual Customers Table */}
                        {activeTab === 'individual' && (
                            <table className="w-full min-w-[780px] border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                                        <th className="p-4">Customer ID</th>
                                        <th className="p-4">Customer Name</th>
                                        <th className="p-4">Contact Details</th>
                                        <th className="p-4 text-center">Account Status</th>
                                        <th className="p-4 text-center">Tickets Raised</th>
                                        <th className="p-4">Last Ticket</th>
                                        <th className="p-4">Registered Date</th>
                                        <th className="p-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900/50">
                                    {customers.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-zinc-500 text-xs font-mono">
                                                No customers found matching the query.
                                            </td>
                                        </tr>
                                    ) : (
                                        customers.map(c => (
                                            <tr
                                                key={c.id}
                                                onClick={() => viewHistory(c.id, c.name)}
                                                className={`hover:bg-zinc-900/30 transition-all cursor-pointer group ${!c.is_active ? 'opacity-70 bg-zinc-950/30' : ''}`}
                                            >
                                                <td className="p-4 text-xs font-mono">
                                                    <span className="px-2 py-0.5 rounded font-bold bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30">
                                                        {c.permanent_customer_id || `TD-${String(c.id).padStart(3, '0')}`}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-semibold text-white group-hover:text-neon-cyan transition-colors flex items-center gap-1.5">
                                                            {c.name}
                                                            <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-neon-cyan" />
                                                        </span>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold uppercase bg-zinc-800 text-zinc-300">
                                                                {c.role}
                                                            </span>
                                                            {!c.is_active && (
                                                                <span className="text-[10px] text-amber-400 font-mono">
                                                                    {c.deactivation_reason ? `(${c.deactivation_reason})` : '(Deactivated)'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="space-y-0.5 font-mono">
                                                        <div className="text-xs text-zinc-300 flex items-center gap-1.5">
                                                            <Mail size={12} className="text-zinc-500 shrink-0" />
                                                            <span className="truncate max-w-[190px]">{c.email}</span>
                                                        </div>
                                                        <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                                                            <Phone size={12} className="text-zinc-500 shrink-0" />
                                                            <span>{c.phone || '—'}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    {c.is_active ? (
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                                                            Active
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/25">
                                                            Inactive
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="font-mono text-xs font-bold text-white flex items-center gap-1">
                                                            <span>{c.total_tickets || 0}</span>
                                                            <span className="text-zinc-500 font-normal text-[10px]">raised</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 font-mono text-[9px]">
                                                            <span className={`px-1.5 py-0.2 rounded font-semibold ${Number(c.active_tickets || 0) > 0 ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-zinc-900 text-zinc-500'}`} title="Active / Current Tickets">
                                                                {c.active_tickets || 0} active
                                                            </span>
                                                            <span className={`px-1.5 py-0.2 rounded font-semibold ${Number(c.completed_tickets || 0) > 0 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-900 text-zinc-500'}`} title="Completed / Done Tickets">
                                                                {c.completed_tickets || 0} done
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-xs font-mono text-zinc-400">
                                                    {c.last_ticket_date ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <Clock size={12} className="text-zinc-500 shrink-0" />
                                                            <span>{new Date(c.last_ticket_date).toLocaleDateString()}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-zinc-600">—</span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-xs text-zinc-400 font-mono">
                                                    {new Date(c.created_at).toLocaleDateString()}
                                                </td>
                                                <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                                    <div className="flex items-center gap-1.5 justify-center">
                                                        <button
                                                            onClick={() => viewHistory(c.id, c.name)}
                                                            className="p-1.5 px-2.5 bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/30 rounded-lg text-neon-cyan transition-all cursor-pointer flex items-center gap-1 text-[10px] font-mono font-bold"
                                                            title="View Customer Profile & Repairs"
                                                        >
                                                            <Eye size={12} />
                                                            <span>Details</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleResetPasswordClick(c)}
                                                            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-400 hover:text-amber-400 transition-all cursor-pointer"
                                                            title="Reset Password"
                                                        >
                                                            <KeyRound size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}

                        {/* VIEW 2: Corporate Accounts Directory */}
                        {activeTab === 'company' && companySubTab === 'accounts' && (
                            <table className="w-full min-w-[840px] border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                                        <th className="p-4">Company Details</th>
                                        <th className="p-4">Authorized Contact</th>
                                        <th className="p-4 text-center">Branches & Staff</th>
                                        <th className="p-4 text-center">Fleet Devices</th>
                                        <th className="p-4 text-center">Repairs Breakdown</th>
                                        <th className="p-4 text-center">Settled Paid Amount</th>
                                        <th className="p-4 text-center">Lead Tech</th>
                                        <th className="p-4 text-center">Status</th>
                                        <th className="p-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900/50">
                                    {companies.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="p-8 text-center text-zinc-500 text-xs font-mono">
                                                No corporate clients found matching the query.
                                            </td>
                                        </tr>
                                    ) : (
                                        companies.map(c => (
                                            <tr key={c.id} className={`hover:bg-zinc-900/25 transition-all ${!c.is_active ? 'opacity-70 bg-zinc-950/30' : ''}`}>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        {c.company_logo ? (
                                                            <img src={getMediaUrl(c.company_logo)} alt={c.company_name || c.name} className="w-9 h-9 rounded-xl object-contain bg-zinc-950 border border-zinc-800" />
                                                        ) : (
                                                            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 font-bold uppercase select-none">
                                                                {c.company_name?.slice(0, 2) || c.name?.slice(0, 2) || 'CO'}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                                                                {c.company_name || c.name}
                                                                <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold font-mono tracking-wider ${c.company_type === 'Corporate' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' :
                                                                    c.company_type === 'AMC' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                                                        'bg-zinc-850 text-zinc-400 border border-zinc-800'
                                                                    }`}>{c.company_type || 'Business'}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-bold">
                                                                    {c.permanent_company_id || c.company_id || `TD-C${String(c.id).padStart(3, '0')}`}
                                                                </span>
                                                                <span className="text-[10px] text-zinc-500 font-mono">#{c.id}</span>
                                                            </div>
                                                            {!c.is_active && (
                                                                <div className="text-[10px] text-amber-400 font-mono mt-0.5">
                                                                    {c.deactivation_reason ? `Deactivated: ${c.deactivation_reason}` : 'Deactivated'}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="p-4">
                                                    <div className="text-xs font-semibold text-white">{c.contact_person || 'No Primary Contact'}</div>
                                                    <div className="text-[11px] text-zinc-400 font-mono mt-0.5">{c.email}</div>
                                                    <div className="text-[10px] text-zinc-500 font-mono">{c.phone || c.phone_number || '—'}</div>
                                                </td>

                                                <td className="p-4 text-center">
                                                    <div className="font-mono text-xs text-white">
                                                        <span className="font-bold text-indigo-400">{c.total_branches || 0}</span> branches
                                                    </div>
                                                    <div className="font-mono text-[10px] text-zinc-500 mt-0.5">
                                                        <span className="font-bold text-zinc-300">{c.total_employees || 0}</span> employees
                                                    </div>
                                                </td>

                                                <td className="p-4 text-center font-mono text-sm text-neon-cyan font-bold">
                                                    {c.total_devices || 0}
                                                </td>

                                                <td className="p-4">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="flex gap-1.5">
                                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono ${c.pending_repairs > 0 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/15' : 'bg-zinc-900/50 text-zinc-500'}`}>
                                                                {c.pending_repairs || 0} Pend
                                                            </span>
                                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono ${c.in_progress_repairs > 0 ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/15' : 'bg-zinc-900/50 text-zinc-500'}`}>
                                                                {c.in_progress_repairs || 0} Prog
                                                            </span>
                                                        </div>
                                                        <div className="flex gap-1.5">
                                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono ${c.completed_repairs > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'bg-zinc-900/50 text-zinc-500'}`}>
                                                                {c.completed_repairs || 0} Done
                                                            </span>
                                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono ${c.warranty_repairs > 0 ? 'bg-pink-500/10 text-pink-400 border border-pink-500/15' : 'bg-zinc-900/50 text-zinc-500'}`}>
                                                                {c.warranty_repairs || 0} War
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="p-4 text-center">
                                                    <div className="font-mono text-xs font-bold text-emerald-400">
                                                        ₹{Number(c.total_paid_amount || 0).toLocaleString()}
                                                    </div>
                                                    <div className="text-[9px] font-mono text-zinc-500 mt-0.5">
                                                        {c.total_paid_count || 0} verified payments
                                                    </div>
                                                </td>

                                                <td className="p-4 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.assigned_technician_name ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/25' : 'text-zinc-550 bg-zinc-900/50 border border-zinc-800'}`}>
                                                        {c.assigned_technician_name || 'Unassigned'}
                                                    </span>
                                                </td>

                                                <td className="p-4 text-center">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <button onClick={() => handleToggleStatus(c.id, c.is_active)} className={`w-10 h-5 px-0.5 rounded-full transition-colors flex items-center cursor-pointer mx-auto ${c.is_active ? 'bg-indigo-600 justify-end' : 'bg-zinc-800 justify-start'}`}>
                                                            <span className="w-4 h-4 bg-white rounded-full shadow-md" />
                                                        </button>
                                                        <span className={`text-[9px] font-mono font-bold ${c.is_active ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                            {c.is_active ? 'ACTIVE' : 'INACTIVE'}
                                                        </span>
                                                    </div>
                                                </td>

                                                <td className="p-4 text-center">
                                                    <div className="flex items-center gap-1.5 justify-center">
                                                        <button onClick={() => view360Details(c.id)} className="p-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg text-indigo-400 transition-all cursor-pointer font-semibold text-xs flex items-center gap-1" title="Company 360° Portal">
                                                            <Eye size={13} />
                                                        </button>
                                                        <button onClick={() => handleResetPasswordClick(c)} className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-400 hover:text-amber-400 transition-all cursor-pointer" title="Reset Password">
                                                            <KeyRound size={13} />
                                                        </button>
                                                        <button onClick={() => handleEditClick(c)} className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-all cursor-pointer" title="Edit Profile">
                                                            <Edit3 size={13} />
                                                        </button>
                                                        {c.is_active ? (
                                                            <button onClick={() => handleDeactivateCompany(c.id, c.company_name || c.name)} disabled={deleteLoading === c.id} className="p-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-amber-400 transition-all cursor-pointer" title="Deactivate Company">
                                                                {deleteLoading === c.id ? <Loader2 size={13} className="animate-spin" /> : <ShieldOff size={13} />}
                                                            </button>
                                                        ) : (
                                                            <button onClick={() => handleReactivateCompany(c.id, c.company_name || c.name)} disabled={deleteLoading === c.id} className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-emerald-400 transition-all cursor-pointer" title="Reactivate Company">
                                                                {deleteLoading === c.id ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}

                        {/* VIEW 3: Corporate Repair Tickets Table */}
                        {activeTab === 'company' && companySubTab === 'tickets' && (
                            <table className="w-full min-w-[840px] border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                                        <th className="p-4">Ticket & Date</th>
                                        <th className="p-4">Corporate Client / Staff</th>
                                        <th className="p-4">Device & Asset ID</th>
                                        <th className="p-4">Issue & Diagnosis</th>
                                        <th className="p-4">Technician</th>
                                        <th className="p-4 text-center">Repair Status</th>
                                        <th className="p-4 text-center">Repair Price</th>
                                        <th className="p-4 text-center">Payment Status</th>
                                        <th className="p-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900/50">
                                    {companyTickets.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="p-8 text-center text-zinc-500 text-xs font-mono">
                                                No corporate repair tickets found for the selected criteria.
                                            </td>
                                        </tr>
                                    ) : (
                                        companyTickets.map(t => (
                                            <tr key={t.id} className="hover:bg-zinc-900/25 transition-all">
                                                <td className="p-4">
                                                    <div className="text-xs font-mono font-bold text-neon-cyan">
                                                        #{t.ticket_number || t.ticketNumber || t.id}
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                                                        {new Date(t.created_at || t.createdAt).toLocaleDateString()}
                                                    </div>
                                                </td>

                                                <td className="p-4">
                                                    <div className="text-xs font-semibold text-white">
                                                        {t.company_name || t.companyName || t.customer_name}
                                                    </div>
                                                    <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                                                        Holder: {t.employee_name || t.customer_name || 'Staff'}
                                                    </div>
                                                </td>

                                                <td className="p-4">
                                                    <div className="text-xs font-semibold text-zinc-200">
                                                        {t.brand} {t.model_number || t.modelNumber}
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                                                        Asset: {t.asset_id || t.assetId || '—'} &bull; S/N: {t.serial_number || t.serialNumber || '—'}
                                                    </div>
                                                </td>

                                                <td className="p-4 max-w-xs">
                                                    <div className="text-xs text-zinc-300 line-clamp-1">
                                                        {t.problem_description || t.problemDescription || 'No description'}
                                                    </div>
                                                    {t.diagnosis && (
                                                        <div className="text-[10px] text-cyan-400 font-mono line-clamp-1 mt-0.5">
                                                            Diag: {t.diagnosis}
                                                        </div>
                                                    )}
                                                </td>

                                                <td className="p-4 text-xs font-medium text-zinc-300">
                                                    {t.technician_name || t.tech_name || (
                                                        <span className="text-zinc-600 italic">Unassigned</span>
                                                    )}
                                                </td>

                                                <td className="p-4 text-center">
                                                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${t.status === 'completed'
                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                        : t.status === 'delivered'
                                                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                            : t.status === 'in_progress'
                                                                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                                                : t.status === 'cancelled'
                                                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                        }`}>
                                                        {t.status?.replace('_', ' ')}
                                                    </span>
                                                </td>

                                                <td className="p-4 text-center font-mono">
                                                    <div className="text-xs font-bold text-white">
                                                        ₹{Number(t.repair_cost || t.repairCost || t.estimated_cost || 0).toLocaleString()}
                                                    </div>
                                                    {t.amount_updated_by_admin && (
                                                        <div className="text-[8px] text-indigo-400 font-mono">Admin Set</div>
                                                    )}
                                                </td>

                                                <td className="p-4 text-center">
                                                    {renderPaymentBadge(t.payment_status || t.paymentStatus)}
                                                </td>

                                                <td className="p-4 text-center">
                                                    <div className="flex items-center gap-1.5 justify-center">
                                                        <button
                                                            onClick={() => handleOpenSetPrice(t)}
                                                            className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-lg text-emerald-400 transition-all cursor-pointer text-xs font-semibold flex items-center gap-1"
                                                            title="Set Repair Price"
                                                        >
                                                            <DollarSign size={13} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedReceiptTicketId(t.id);
                                                                setSelectedReceiptInvoiceId(null);
                                                                setReceiptModalOpen(true);
                                                            }}
                                                            className="p-1.5 bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/25 rounded-lg text-neon-cyan transition-all cursor-pointer"
                                                            title="View Official Bill / Invoice Statement"
                                                        >
                                                            <Receipt size={13} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePrintBill(t.id)}
                                                            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-300 hover:text-white transition-all cursor-pointer"
                                                            title="Print Bill / Receipt"
                                                        >
                                                            <Printer size={13} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDownloadBill(t.id)}
                                                            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-300 hover:text-white transition-all cursor-pointer"
                                                            title="Download Bill / Receipt PDF"
                                                        >
                                                            <Download size={13} />
                                                        </button>
                                                        <Link
                                                            to={`/admin/repair-tickets?id=${t.ticket_number || t.ticketNumber || t.id}`}
                                                            className="p-1.5 bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/25 rounded-lg text-neon-cyan transition-all cursor-pointer"
                                                            title="Open Full Repair Ticket Details"
                                                        >
                                                            <ExternalLink size={13} />
                                                        </Link>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}

                        {/* VIEW 4: Corporate Fleet & Devices Table */}
                        {activeTab === 'company' && companySubTab === 'devices' && (
                            <table className="w-full min-w-[780px] border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                                        <th className="p-4">Asset ID / Key</th>
                                        <th className="p-4">Device (Brand & Model)</th>
                                        <th className="p-4">Corporate Owner</th>
                                        <th className="p-4">Assigned Holder</th>
                                        <th className="p-4 text-center">Warranty / AMC</th>
                                        <th className="p-4 text-center">Repairs History</th>
                                        <th className="p-4 text-center">Status</th>
                                        <th className="p-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900/50">
                                    {companyDevices.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-zinc-500 text-xs font-mono">
                                                No corporate fleet devices found matching this filter.
                                            </td>
                                        </tr>
                                    ) : (
                                        companyDevices.map(d => (
                                            <tr key={d.id} className="hover:bg-zinc-900/25 transition-all">
                                                <td className="p-4 text-xs font-mono font-bold text-neon-cyan">
                                                    {d.asset_id || `DEV-${d.id}`}
                                                </td>

                                                <td className="p-4">
                                                    <div className="text-xs font-semibold text-white">
                                                        {d.brand} {d.model_number}
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                                                        S/N: {d.serial_number || '—'}
                                                    </div>
                                                </td>

                                                <td className="p-4">
                                                    <div className="text-xs font-semibold text-indigo-300">
                                                        {d.company_name}
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                                                        Branch: {d.branch_name || 'Headquarters'}
                                                    </div>
                                                </td>

                                                <td className="p-4">
                                                    <div className="text-xs text-white">
                                                        {d.employee_name || <span className="text-zinc-500 italic">Unassigned Pool</span>}
                                                    </div>
                                                </td>

                                                <td className="p-4 text-center">
                                                    {d.is_amc ? (
                                                        <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                            AMC ({d.amc_tag || 'ACTIVE'})
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-500">
                                                            NON-AMC
                                                        </span>
                                                    )}
                                                    <div className="text-[9px] font-mono text-zinc-500 mt-0.5">
                                                        {d.warranty_expiry ? `Exp: ${new Date(d.warranty_expiry).toLocaleDateString()}` : 'No Warranty'}
                                                    </div>
                                                </td>

                                                <td className="p-4 text-center font-mono">
                                                    <span className="text-xs font-bold text-white">{d.repair_count || 0}</span> tickets
                                                    {d.active_repairs > 0 && (
                                                        <span className="ml-1 text-[9px] text-amber-400 font-bold">({d.active_repairs} active)</span>
                                                    )}
                                                </td>

                                                <td className="p-4 text-center">
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase font-mono ${d.is_active !== 0
                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                                                        : 'bg-zinc-800 text-zinc-500'
                                                        }`}>
                                                        {d.is_active !== 0 ? 'ACTIVE' : 'DECOMMISSIONED'}
                                                    </span>
                                                </td>

                                                <td className="p-4 text-center">
                                                    <button
                                                        onClick={() => view360Details(d.company_id)}
                                                        className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 rounded-lg text-indigo-400 transition-all cursor-pointer"
                                                        title="View Corporate Client 360°"
                                                    >
                                                        <Eye size={13} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Pagination Bar */}
                    {totalPages > 1 && (
                        <div className="p-4 border-t border-zinc-900 bg-zinc-950/40 flex items-center justify-between text-xs font-mono">
                            <span className="text-zinc-500">
                                Page <span className="text-white font-bold">{page}</span> of {totalPages}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Set Repair Charges / Price Modal */}
            {priceModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPriceModal(null)}>
                    <div className="bg-[#0b0b0b] border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
                            <h3 className="text-white font-bold font-outfit flex items-center gap-2">
                                <DollarSign className="w-5 h-5 text-emerald-400" />
                                Set Repair Charges / Price
                            </h3>
                            <button onClick={() => setPriceModal(null)} className="text-zinc-500 hover:text-white cursor-pointer"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSavePrice} className="p-5 space-y-4">
                            <div className="bg-zinc-950/60 border border-zinc-900 rounded-xl p-3.5 space-y-1.5 font-mono text-xs">
                                <div className="flex justify-between text-zinc-400">
                                    <span>Ticket ID:</span>
                                    <span className="text-neon-cyan font-bold">{priceModal.ticketNumber}</span>
                                </div>
                                {priceModal.companyName && (
                                    <div className="flex justify-between text-zinc-400">
                                        <span>Company:</span>
                                        <span className="text-white font-semibold">{priceModal.companyName}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-zinc-400">
                                    <span>Device:</span>
                                    <span className="text-zinc-300">{priceModal.brand} {priceModal.modelNumber}</span>
                                </div>
                                <div className="flex justify-between text-zinc-400 border-t border-zinc-900 pt-1.5 mt-1.5">
                                    <span>Current Set Price:</span>
                                    <span className="text-amber-400 font-bold">₹{Number(priceModal.currentCost || 0).toLocaleString()}</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">New Repair Charge (INR ₹) *</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="Enter final repair amount (e.g. 2500)"
                                    value={newPrice}
                                    onChange={e => setNewPrice(e.target.value)}
                                    required
                                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Pricing Notes / Service Terms (Optional)</label>
                                <textarea
                                    rows={2}
                                    placeholder="e.g. Authorized parts replacement & service labor included"
                                    value={priceNotes}
                                    onChange={e => setPriceNotes(e.target.value)}
                                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition-all font-sans"
                                />
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                                <input
                                    type="checkbox"
                                    id="notifyCustomer"
                                    checked={notifyCustomerOnPrice}
                                    onChange={e => setNotifyCustomerOnPrice(e.target.checked)}
                                    className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0 cursor-pointer"
                                />
                                <label htmlFor="notifyCustomer" className="text-xs text-zinc-400 cursor-pointer select-none">
                                    Send notification & email to client with updated repair charges
                                </label>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setPriceModal(null)}
                                    className="flex-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-white py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer">
                                    Cancel
                                </button>
                                <button type="submit" disabled={priceUpdating}
                                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-black py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
                                    {priceUpdating ? <Loader2 size={13} className="animate-spin" /> : 'Set Price & Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 360 Slide-over Details Panel */}
            {selectedCompany && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs font-outfit" onClick={() => setSelectedCompany(null)}>
                    <div className="w-full max-w-3xl h-full bg-[#09090b] border-l border-zinc-900 text-white shadow-2xl flex flex-col p-6 overflow-hidden transform transition-transform" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
                            <div className="flex items-center gap-3">
                                {selectedCompany.profile?.company_logo ? (
                                    <img src={getMediaUrl(selectedCompany.profile.company_logo)} alt="Logo" className="w-10 h-10 rounded-xl object-contain bg-zinc-950 border border-zinc-800" />
                                ) : (
                                    <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold uppercase text-lg select-none">
                                        {selectedCompany.profile?.company_name?.slice(0, 2) || 'CO'}
                                    </div>
                                )}
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
                                            {selectedCompany.profile?.company_name}
                                            {selectedCompany.profile?.is_active && <ShieldCheck size={16} className="text-indigo-400" />}
                                        </h2>
                                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-bold">
                                            {selectedCompany.profile?.permanent_company_id || selectedCompany.profile?.company_id || `TD-C${String(selectedCompany.profile?.id || selectedCompany.id).padStart(3, '0')}`}
                                        </span>
                                    </div>
                                    <span className="text-[10px] font-mono text-zinc-500">Corporate Oversight Dashboard &bull; Database ID #{selectedCompany.profile?.id}</span>
                                </div>
                            </div>
                            <button onClick={() => setSelectedCompany(null)} className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white cursor-pointer">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Top Overview Stats */}
                        <div className="grid grid-cols-6 gap-2 mt-4 text-center">
                            <div className="bg-zinc-950/40 p-2 rounded-xl border border-zinc-900">
                                <span className="text-[8px] uppercase font-mono text-zinc-500 block">Branches</span>
                                <span className="text-sm font-bold font-mono text-white mt-0.5 block">{selectedCompany.branches?.length || 0}</span>
                            </div>
                            <div className="bg-zinc-950/40 p-2 rounded-xl border border-zinc-900">
                                <span className="text-[8px] uppercase font-mono text-zinc-500 block">Employees</span>
                                <span className="text-sm font-bold font-mono text-white mt-0.5 block">{selectedCompany.employees?.length || 0}</span>
                            </div>
                            <div className="bg-zinc-950/40 p-2 rounded-xl border border-zinc-900">
                                <span className="text-[8px] uppercase font-mono text-zinc-500 block">Devices</span>
                                <span className="text-sm font-bold font-mono text-neon-cyan mt-0.5 block">{selectedCompany.devices?.length || 0}</span>
                            </div>
                            <div className="bg-zinc-950/40 p-2 rounded-xl border border-zinc-900">
                                <span className="text-[8px] uppercase font-mono text-zinc-500 block">Active Tickets</span>
                                <span className="text-sm font-bold font-mono text-amber-400 mt-0.5 block">
                                    {selectedCompany.tickets?.filter((t: any) => t.status !== 'completed' && t.status !== 'delivered' && t.status !== 'cancelled').length || 0}
                                </span>
                            </div>
                            <div className="bg-zinc-950/40 p-2 rounded-xl border border-zinc-900">
                                <span className="text-[8px] uppercase font-mono text-zinc-500 block">Done Repairs</span>
                                <span className="text-sm font-bold font-mono text-emerald-400 mt-0.5 block">
                                    {selectedCompany.tickets?.filter((t: any) => t.status === 'completed' || t.status === 'delivered').length || 0}
                                </span>
                            </div>
                            <div className="bg-zinc-950/40 p-2 rounded-xl border border-zinc-900">
                                <span className="text-[8px] uppercase font-mono text-zinc-500 block">Verified Paid</span>
                                <span className="text-sm font-bold font-mono text-emerald-400 mt-0.5 block">
                                    {selectedCompany.payments?.filter((p: any) => p.status === 'paid').length || 0}
                                </span>
                            </div>
                        </div>

                        {/* Navigation Tabs inside Slide-Over */}
                        <div className="mt-4 flex border-b border-zinc-900 p-0.5 bg-zinc-950/20 rounded-xl overflow-x-auto">
                            {(['overview', 'branches', 'employees', 'devices', 'tickets', 'billing', 'payments', 'timeline'] as const).map(tab => (
                                <button key={tab} onClick={() => setDetailsTab(tab)}
                                    className={`flex-1 py-1.5 px-2 text-[9.5px] font-mono uppercase tracking-wider rounded-lg transition-all cursor-pointer whitespace-nowrap ${detailsTab === tab ? 'bg-indigo-600 text-white font-bold shadow-sm' : 'text-zinc-500 hover:text-white'}`}>
                                    {tab}
                                </button>
                            ))}
                        </div>

                        {/* Slide-Over Panels Content */}
                        <div className="flex-1 overflow-y-auto mt-4 pr-1 text-xs text-zinc-300">
                            {/* OVERVIEW PANEL */}
                            {detailsTab === 'overview' && (
                                <div className="space-y-4">
                                    <div className="bg-zinc-950/40 p-4 border border-zinc-900 rounded-xl space-y-3">
                                        <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider">Company Metadata & Settings</h3>
                                        <div className="grid grid-cols-2 gap-3 font-sans">
                                            <div>
                                                <span className="text-[10px] text-zinc-500 font-medium">Company Type</span>
                                                <p className="text-white font-semibold mt-0.5">{selectedCompany.profile?.company_type || 'Business'}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-zinc-500 font-medium">AMC Status</span>
                                                <p className="text-white font-semibold mt-0.5">{selectedCompany.profile?.amc_status || 'Inactive'}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-zinc-500 font-medium">Dedicated Lead Tech</span>
                                                <p className="text-indigo-400 font-semibold mt-0.5">{selectedCompany.profile?.assigned_technician_name || 'No Lead Tech Assigned'}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-zinc-500 font-medium">Primary Contact</span>
                                                <p className="text-white font-semibold mt-0.5">{selectedCompany.profile?.contact_person || '—'}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-zinc-500 font-medium">GST Registration</span>
                                                <p className="text-white font-mono mt-0.5">{selectedCompany.profile?.gst_number || '—'}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-zinc-500 font-medium">Corporate Email</span>
                                                <p className="text-white font-mono mt-0.5">{selectedCompany.profile?.email || '—'}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-zinc-500 font-medium">Phone Number</span>
                                                <p className="text-white font-mono mt-0.5">{selectedCompany.profile?.phone || '—'}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-zinc-500 font-medium">Website URL</span>
                                                <p className="text-indigo-400 font-mono mt-0.5">{selectedCompany.profile?.website_url || '—'}</p>
                                            </div>
                                            <div className="col-span-2">
                                                <span className="text-[10px] text-zinc-500 font-medium">Office / Registered Address</span>
                                                <p className="text-white leading-relaxed mt-0.5">{selectedCompany.profile?.address || '—'}</p>
                                            </div>
                                            {selectedCompany.profile?.notes && (
                                                <div className="col-span-2 border-t border-zinc-900 pt-2">
                                                    <span className="text-[10px] text-zinc-500 font-medium block mb-1">Internal Notes / Account Terms</span>
                                                    <p className="text-zinc-350 leading-relaxed whitespace-pre-wrap">{selectedCompany.profile.notes}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* BRANCHES PANEL */}
                            {detailsTab === 'branches' && (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center px-1">
                                        <h3 className="font-mono text-white text-xs uppercase tracking-wider">Corporate Branches</h3>
                                        <span className="text-[10px] text-zinc-500">{selectedCompany.branches?.length || 0} registered branches</span>
                                    </div>
                                    {selectedCompany.branches?.length === 0 ? (
                                        <p className="text-zinc-500 text-center py-6">No branch offices declared.</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {selectedCompany.branches.map((b: any) => (
                                                <div key={b.id} className="p-3 border border-zinc-900 bg-zinc-950/40 rounded-xl space-y-1">
                                                    <div className="font-semibold text-white flex items-center justify-between">
                                                        <span>{b.name}</span>
                                                        <span className="text-[9px] font-mono text-zinc-500">ID #{b.id}</span>
                                                    </div>
                                                    <div className="text-[10px] text-zinc-400">{b.address || 'No address specified'}</div>
                                                    {b.phone && <div className="text-[9px] text-zinc-500 font-mono">Phone: {b.phone}</div>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* EMPLOYEES PANEL */}
                            {detailsTab === 'employees' && (
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center px-1 mb-2">
                                        <h3 className="font-mono text-white text-xs uppercase tracking-wider">Corporate Staff Roster</h3>
                                        <span className="text-[10px] text-zinc-500">{selectedCompany.employees?.length || 0} employees</span>
                                    </div>
                                    {selectedCompany.employees?.length === 0 ? (
                                        <p className="text-zinc-500 text-center py-6">No employee roster records found.</p>
                                    ) : (
                                        <div className="border border-zinc-900 rounded-xl overflow-hidden divide-y divide-zinc-900 font-mono">
                                            {selectedCompany.employees.map((e: any) => (
                                                <div key={e.id} className="p-3 bg-zinc-950/20 hover:bg-zinc-900/10 flex items-center justify-between">
                                                    <div>
                                                        <div className="text-white font-semibold">{e.name}</div>
                                                        <div className="text-[10px] text-zinc-500 mt-0.5">{e.department || 'General'} &bull; {e.designation || 'Staff'} {e.branch_name && `(${e.branch_name})`}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[10px] text-zinc-400">{e.email}</div>
                                                        <div className="text-[9px] text-zinc-600 mt-0.5">{e.phone || '—'}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* FLEET DEVICES PANEL */}
                            {detailsTab === 'devices' && (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center px-1">
                                        <h3 className="font-mono text-white text-xs uppercase tracking-wider">Registered Fleet Assets</h3>
                                        <span className="text-[10px] text-zinc-500">{selectedCompany.devices?.length || 0} total devices</span>
                                    </div>
                                    {selectedCompany.devices?.length === 0 ? (
                                        <p className="text-zinc-500 text-center py-6">No devices registered in asset log.</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {selectedCompany.devices.map((d: any) => (
                                                <div key={d.id} className="p-3 border border-zinc-900 bg-zinc-950/40 rounded-xl flex flex-col justify-between">
                                                    <div>
                                                        <div className="flex items-center justify-between">
                                                            <div className="text-white text-xs font-bold">{d.brand} {d.model_number}</div>
                                                            {d.is_amc ? (
                                                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-mono font-bold tracking-tight">AMC ({d.amc_tag || 'ACTIVE'})</span>
                                                            ) : (
                                                                <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 text-[9px] font-mono">NON-AMC</span>
                                                            )}
                                                        </div>
                                                        <div className="text-[9px] font-mono text-zinc-500 mt-1">Serial: {d.serial_number} &bull; Asset: {d.asset_id}</div>
                                                        {d.employee_name && <div className="text-[10px] text-zinc-400 mt-1 font-mono">Holder: {d.employee_name}</div>}
                                                    </div>
                                                    <div className="mt-3 pt-2 border-t border-zinc-900/60 text-[9px] font-mono text-zinc-500 flex justify-between">
                                                        <span>Branch: {d.branch_name || 'H.Q.'}</span>
                                                        <span>Exp: {d.warranty_expiry ? new Date(d.warranty_expiry).toLocaleDateString() : 'None'}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* REPAIR TICKETS PANEL */}
                            {detailsTab === 'tickets' && (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center px-1 mb-1">
                                        <h3 className="font-mono text-white text-xs uppercase tracking-wider">Corporate Repair Tickets</h3>
                                        <span className="text-[10px] text-zinc-500">{selectedCompany.tickets?.length || 0} total tickets</span>
                                    </div>
                                    {selectedCompany.tickets?.length === 0 ? (
                                        <p className="text-zinc-500 text-center py-6">No repair requests have been initiated.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {selectedCompany.tickets.map((t: any) => (
                                                <div key={t.id} className="p-3.5 border border-zinc-900 bg-zinc-950/40 rounded-xl space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <div className="text-xs text-white font-bold">{t.deviceCategory} &bull; {t.brand} {t.modelNumber}</div>
                                                            <div className="text-[10px] text-neon-cyan font-bold font-mono mt-0.5">#{t.ticketNumber || `REQ-${t.id}`}</div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {renderPaymentBadge(t.paymentStatus || t.payment_status)}
                                                            <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${t.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                                                                t.status === 'delivered' ? 'bg-blue-500/10 text-blue-400' :
                                                                t.status === 'in_progress' ? 'bg-cyan-500/10 text-cyan-400' :
                                                                    t.status === 'cancelled' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                                                                }`}>
                                                                {t.status?.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                                                        {t.problemDescription}
                                                    </div>

                                                    {t.diagnosis && (
                                                        <div className="text-[10px] bg-cyan-950/20 border border-cyan-900/30 text-cyan-300 p-2 rounded-lg font-mono">
                                                            Diagnosis: {t.diagnosis}
                                                        </div>
                                                    )}

                                                    <div className="flex flex-wrap items-center justify-between pt-2 border-t border-zinc-900/80 text-[10px] font-mono text-zinc-500 gap-2">
                                                        <div>Tech: <span className="text-zinc-300 font-semibold">{t.techName || 'Unassigned'}</span></div>
                                                        <div>Price: <span className="text-emerald-400 font-bold">₹{Number(t.repairCost || t.estimatedCost || 0).toLocaleString()}</span></div>
                                                        <div className="flex items-center gap-1.5 ml-auto">
                                                            <button
                                                                onClick={() => handleOpenSetPrice(t)}
                                                                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded text-emerald-400 text-[9px] font-bold cursor-pointer"
                                                            >
                                                                Set Price
                                                            </button>
                                                            <button
                                                                onClick={() => handleDownloadBill(t.id)}
                                                                className="px-2 py-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded text-zinc-300 text-[9px] font-bold cursor-pointer flex items-center gap-1"
                                                            >
                                                                <Download size={10} /> Bill PDF
                                                            </button>
                                                            <Link
                                                                to={`/admin/repair-tickets?id=${t.ticketNumber || t.id}`}
                                                                className="px-2 py-1 bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/25 rounded text-neon-cyan text-[9px] font-bold"
                                                            >
                                                                View
                                                            </Link>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* BILLING & INVOICES PANEL */}
                            {detailsTab === 'billing' && (
                                <div className="space-y-4">
                                    {/* Quotations */}
                                    <div>
                                        <h3 className="font-mono text-white text-xs uppercase tracking-wider mb-2">Quotations</h3>
                                        {selectedCompany.quotations?.length === 0 ? (
                                            <p className="text-zinc-550 text-center py-4">No quotations drafted.</p>
                                        ) : (
                                            <div className="border border-zinc-900 rounded-xl overflow-hidden divide-y divide-zinc-900 font-mono">
                                                {selectedCompany.quotations.map((q: any) => (
                                                    <div key={q.id} className="p-3 bg-zinc-950/20 flex items-center justify-between">
                                                        <div>
                                                            <div className="text-white font-bold">{q.title}</div>
                                                            <div className="text-[10px] text-zinc-500 mt-0.5">Ref: #{q.id} &bull; Date: {new Date(q.created_at).toLocaleDateString()}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-white font-bold text-xs">INR {parseFloat(q.amount).toLocaleString()}</div>
                                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase mt-1 ${q.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                                                {q.status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Invoices */}
                                    <div>
                                        <h3 className="font-mono text-white text-xs uppercase tracking-wider mb-2 font-bold">Billing & Invoices</h3>
                                        {selectedCompany.invoices?.length === 0 ? (
                                            <p className="text-zinc-550 text-center py-4">No billing records found.</p>
                                        ) : (
                                            <div className="border border-zinc-900 rounded-xl overflow-hidden divide-y divide-zinc-900 font-mono">
                                                {selectedCompany.invoices.map((inv: any) => (
                                                    <div key={inv.id} className="p-3 bg-zinc-950/20 flex items-center justify-between">
                                                        <div>
                                                            <div className="text-white font-bold">{inv.id}</div>
                                                            <div className="text-[10px] text-zinc-500 mt-0.5">Due: {new Date(inv.due_date).toLocaleDateString()}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-indigo-400 font-bold text-xs">INR {parseFloat(inv.amount).toLocaleString()}</div>
                                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase mt-1 ${inv.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-500'}`}>
                                                                {inv.status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* PAYMENTS PANEL (NEW DEDICATED TAB) */}
                            {detailsTab === 'payments' && (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center px-1 mb-1">
                                        <h3 className="font-mono text-white text-xs uppercase tracking-wider">Corporate Payments & Transactions</h3>
                                        <span className="text-[10px] text-zinc-500">{selectedCompany.payments?.length || 0} transactions</span>
                                    </div>
                                    {selectedCompany.payments?.length === 0 ? (
                                        <p className="text-zinc-500 text-center py-8">No payment transactions registered for this company.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {selectedCompany.payments.map((p: any) => (
                                                <div key={p.id} className="p-3.5 border border-zinc-900 bg-zinc-950/40 rounded-xl space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="font-mono">
                                                            <div className="text-xs font-bold text-white flex items-center gap-2">
                                                                <span>Ticket: #{p.ticket_number || p.ticketNumber || (p.ticket_id ? `TKT-${p.ticket_id}` : p.ticketId || p.id)}</span>
                                                                {(p.ticket_brand || p.ticketBrand) && <span className="text-zinc-400 font-sans font-normal">({p.ticket_brand || p.ticketBrand} {p.ticket_model || p.ticketModel})</span>}
                                                            </div>
                                                            <div className="text-[10px] text-zinc-500 mt-0.5">
                                                                {((p.payment_method || p.paymentMethod || '').toLowerCase() === 'cash' || String(p.payment_id || p.paymentId || '').startsWith('PAY-CASH')) ? (
                                                                    <>Payment ID: <span className="text-zinc-400">{p.payment_id || p.paymentId || '—'}</span> &bull; Method: <span className="uppercase text-zinc-300 font-semibold">Cash</span></>
                                                                ) : ((p.payment_method || p.paymentMethod || '').toLowerCase() === 'bank_transfer' || (p.payment_method || p.paymentMethod || '').toLowerCase() === 'offline_upi' || String(p.payment_id || p.paymentId || '').startsWith('PAY-BANK') || String(p.payment_id || p.paymentId || '').startsWith('PAY-UPI')) ? (
                                                                    <>Payment Ref: <span className="text-zinc-400">{p.payment_id || p.paymentId || '—'}</span> &bull; Method: <span className="uppercase text-zinc-300 font-semibold">{p.payment_method || p.paymentMethod}</span></>
                                                                ) : (
                                                                    <>Txn ID: <span className="text-zinc-400">{p.payment_id || p.paymentId || p.order_id || p.orderId || '—'}</span> &bull; Method: <span className="uppercase text-zinc-300 font-semibold">{p.payment_method || p.paymentMethod || 'Online'}</span></>
                                                                )}
                                                            </div>
                                                            {(p.reference_note || p.referenceNote) && (
                                                                <div className="text-[10px] font-mono text-cyan-400 mt-0.5">
                                                                    Ref/UTR: <span className="text-zinc-300 font-bold">{p.reference_note || p.referenceNote}</span>
                                                                </div>
                                                            )}
                                                            {(p.collection_status || p.collectionStatus) && (p.collection_status || p.collectionStatus) !== 'not_applicable' && (
                                                                <div className="text-[10px] font-mono text-zinc-400 mt-0.5 flex items-center gap-1.5">
                                                                    <span>Cash Collection:</span>
                                                                    <span className={`font-semibold ${
                                                                        (p.collection_status || p.collectionStatus) === 'collected' ? 'text-emerald-400' : 'text-amber-400'
                                                                    }`}>
                                                                        {(p.collection_status || p.collectionStatus) === 'collected' ? 'Collected' : 'Pending Collection'}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-sm font-mono font-bold text-emerald-400">
                                                                ₹{Number(p.amount || 0).toLocaleString()}
                                                            </div>
                                                            <div className="mt-0.5">
                                                                {renderPaymentBadge(p.status)}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between pt-2 border-t border-zinc-900/80 text-[10px] font-mono text-zinc-500">
                                                        <div>Date: {new Date(p.created_at || p.createdAt).toLocaleString()}</div>
                                                        <div className="flex items-center gap-2">
                                                            {p.status === 'pending_verification' && (
                                                                <div className="flex items-center gap-1.5">
                                                                    <button
                                                                        onClick={() => handleVerifyCorporatePayment(p)}
                                                                        disabled={paymentActionLoading === p.id}
                                                                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold cursor-pointer flex items-center gap-1 transition-colors shadow-sm disabled:opacity-50"
                                                                    >
                                                                        {paymentActionLoading === p.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                                                        Verify & Settle
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleRejectCorporatePayment(p)}
                                                                        disabled={paymentActionLoading === p.id}
                                                                        className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded text-[10px] font-bold cursor-pointer flex items-center gap-1 transition-colors disabled:opacity-50"
                                                                    >
                                                                        <AlertCircle size={11} /> Reject
                                                                    </button>
                                                                </div>
                                                            )}
                                                            {(p.ticket_id || p.ticketId) && p.status === 'paid' && (
                                                                <button
                                                                    onClick={() => handleDownloadBill(p.ticket_id || p.ticketId)}
                                                                    className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-300 text-[9px] font-bold cursor-pointer flex items-center gap-1"
                                                                >
                                                                    <Download size={10} /> Bill PDF
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TIMELINE AUDIT LOG PANEL */}
                            {detailsTab === 'timeline' && (
                                <div className="space-y-4 font-mono">
                                    <h3 className="font-mono text-white text-xs uppercase tracking-wider mb-2">Corporate Activity Audit Log</h3>
                                    {selectedCompany.activityLogs?.length === 0 ? (
                                        <p className="text-zinc-500 text-center py-6">No audits recorded.</p>
                                    ) : (
                                        <div className="relative pl-4 border-l border-zinc-800/60 space-y-4 py-2">
                                            {selectedCompany.activityLogs.map((log: any) => (
                                                <div key={log.id} className="relative group text-[10px]">
                                                    <div className="absolute -left-[20.5px] top-1 w-2.5 h-2.5 rounded-full border border-indigo-500 bg-zinc-950" />
                                                    <div className="text-zinc-400 font-semibold">{log.action?.replaceAll('_', ' ')?.toUpperCase()}</div>
                                                    <div className="text-zinc-500 mt-0.5">{log.details ? JSON.stringify(log.details) : 'Executed by client gateway'}</div>
                                                    <div className="text-[9px] text-zinc-650 mt-1 font-semibold">{new Date(log.created_at).toLocaleString()}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Company Profile Side Drawer */}
            <SideDrawer
                isOpen={Boolean(showEditModal)}
                onClose={() => setShowEditModal(null)}
                title={`Edit Corporate Account — ${showEditModal?.company_name || showEditModal?.name || ''}`}
                size="lg"
            >
                {showEditModal && (
                    <form onSubmit={handleEditSubmit} className="p-5 space-y-3 font-sans">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Company Name</label>
                                    <input
                                        type="text"
                                        maxLength={NAME_MAX_LENGTH}
                                        value={editPayload.name}
                                        onChange={e => {
                                            setEditPayload(p => ({ ...p, name: e.target.value }));
                                            if (editCompanyErrors.name) setEditCompanyErrors(p => ({ ...p, name: undefined }));
                                        }}
                                        required
                                        className={`w-full bg-zinc-900 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none ${
                                            editCompanyErrors.name ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-indigo-500'
                                        }`}
                                    />
                                    {editCompanyErrors.name && <p className="text-[11px] text-red-400 mt-1">{editCompanyErrors.name}</p>}
                                </div>
                                <div>
                                    <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Contact Person</label>
                                    <input
                                        type="text"
                                        maxLength={NAME_MAX_LENGTH}
                                        value={editPayload.contact_person}
                                        onChange={e => {
                                            setEditPayload(p => ({ ...p, contact_person: e.target.value }));
                                            if (editCompanyErrors.contact_person) setEditCompanyErrors(p => ({ ...p, contact_person: undefined }));
                                        }}
                                        className={`w-full bg-zinc-900 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none ${
                                            editCompanyErrors.contact_person ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-indigo-500'
                                        }`}
                                    />
                                    {editCompanyErrors.contact_person && <p className="text-[11px] text-red-400 mt-1">{editCompanyErrors.contact_person}</p>}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={editPayload.email}
                                        onChange={e => {
                                            setEditPayload(p => ({ ...p, email: e.target.value }));
                                            if (editCompanyErrors.email) setEditCompanyErrors(p => ({ ...p, email: undefined }));
                                        }}
                                        required
                                        className={`w-full bg-zinc-900 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none ${
                                            editCompanyErrors.email ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-indigo-500'
                                        }`}
                                    />
                                    {editCompanyErrors.email && <p className="text-[11px] text-red-400 mt-1">{editCompanyErrors.email}</p>}
                                </div>
                                <div>
                                    <PhoneInput
                                        size="sm"
                                        label="Phone"
                                        value={editPayload.phone}
                                        onChange={val => {
                                            setEditPayload(p => ({ ...p, phone: val }));
                                            if (editCompanyErrors.phone) setEditCompanyErrors(p => ({ ...p, phone: undefined }));
                                        }}
                                        error={editCompanyErrors.phone}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">GST Number</label>
                                    <input type="text" value={editPayload.gst_number} onChange={e => setEditPayload(p => ({ ...p, gst_number: e.target.value }))}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Website URL</label>
                                    <input type="text" value={editPayload.website_url} onChange={e => setEditPayload(p => ({ ...p, website_url: e.target.value }))}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Address</label>
                                <textarea rows={2} value={editPayload.address} onChange={e => setEditPayload(p => ({ ...p, address: e.target.value }))}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div className="pt-4 border-t border-zinc-900 flex justify-end gap-2">
                                <button type="button" onClick={() => setShowEditModal(null)} className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer">Cancel</button>
                                <button type="submit" disabled={updatingCompany} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-xs font-semibold transition-colors disabled:cursor-not-allowed">
                                    {updatingCompany ? <Loader2 size={12} className="animate-spin" /> : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                )}
            </SideDrawer>

            {/* Password Reset Modal */}
            {showResetModal && resetUser && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowResetModal(false); setResetUser(null); }}>
                    <div className="bg-[#0b0b0b] border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
                            <h3 className="text-white font-bold font-outfit flex items-center gap-2">
                                <KeyRound className="w-5 h-5 text-amber-500" />
                                Reset Account Password
                            </h3>
                            <button onClick={() => { setShowResetModal(false); setResetUser(null); }} className="text-zinc-500 hover:text-white cursor-pointer"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleResetPasswordSubmit} className="p-5 space-y-4">
                            <div className="bg-zinc-950/40 border border-zinc-900/60 rounded-xl p-3.5 space-y-1">
                                <div className="text-[10px] uppercase font-mono text-zinc-500">Target Account</div>
                                <div className="text-sm font-bold text-white">{resetUser.company_name || resetUser.name}</div>
                                <div className="text-xs text-zinc-400 font-mono mt-0.5">{resetUser.email}</div>
                                <div className="text-[10px] text-zinc-500 font-mono">Role: {resetUser.role?.toUpperCase()}</div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-500 mb-1">New Password</label>
                                <div className="relative">
                                    <input
                                        type={showResetPassword ? "text" : "password"}
                                        placeholder="Enter new 8+ character password"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        required
                                        className="w-full bg-zinc-900/40 border border-zinc-800/80 rounded-xl px-4 py-2.5 pr-10 text-xs text-white focus:outline-none focus:border-amber-500/40 transition-all font-outfit"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowResetPassword(!showResetPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer p-1 rounded focus:outline-none focus:ring-1 focus:ring-amber-500/40"
                                        aria-label={showResetPassword ? "Hide password" : "Show password"}
                                        tabIndex={-1}
                                    >
                                        {showResetPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => { setShowResetModal(false); setResetUser(null); }}
                                    className="flex-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-white py-2.5 rounded-xl text-xs font-semibold font-outfit transition-all cursor-pointer">
                                    Cancel
                                </button>
                                <button type="submit" disabled={resetLoading}
                                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-black py-2.5 rounded-xl text-xs font-semibold font-outfit transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
                                    {resetLoading ? <Loader2 size={13} className="animate-spin" /> : 'Reset Password'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Customer Profile & Repair History Side Drawer */}
            <SideDrawer
                isOpen={Boolean(historyModal)}
                onClose={() => setHistoryModal(null)}
                title={historyModal?.customer?.permanent_customer_id
                    ? `${historyModal.name} (${historyModal.customer.permanent_customer_id})`
                    : `Customer Profile — ${historyModal?.name || ''}`
                }
                size="lg"
                badge={!historyLoading && historyModal?.stats ? (
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold border border-zinc-700/60">
                            Total: {historyModal.stats.total}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold border border-amber-500/30">
                            Active: {historyModal.stats.active}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30">
                            Completed: {historyModal.stats.completed}
                        </span>
                        {historyModal.stats.cancelled > 0 && (
                            <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 font-bold border border-rose-500/30">
                                Cancelled: {historyModal.stats.cancelled}
                            </span>
                        )}
                    </div>
                ) : undefined}
            >
                {historyModal && (
                    <div className="space-y-4">
                        {/* 1. Complete Customer Profile & Identity Card */}
                        <div className="bg-zinc-950/70 border border-zinc-900 rounded-2xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center text-neon-cyan font-bold text-base font-outfit uppercase shrink-0">
                                        {historyModal.customer?.name?.slice(0, 2) || historyModal.name?.slice(0, 2) || 'TD'}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-base font-bold text-white font-outfit">
                                                {historyModal.customer?.name || historyModal.name}
                                            </h3>
                                            <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30">
                                                {historyModal.customer?.permanent_customer_id || `TD-${String(historyModal.id).padStart(3, '0')}`}
                                            </span>
                                        </div>
                                        <span className="text-[11px] font-mono text-zinc-500">
                                            User ID #{historyModal.id} &bull; Role: <span className="text-zinc-300 font-semibold uppercase">{historyModal.customer?.role || 'customer'}</span>
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    {historyModal.customer?.is_active === 0 ? (
                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                            Inactive Account
                                        </span>
                                    ) : (
                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                            Active Account
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Contact Details Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-zinc-900 text-xs font-mono">
                                <div className="flex items-center gap-2 text-zinc-400">
                                    <Mail size={13} className="text-zinc-500 shrink-0" />
                                    <span className="text-zinc-500 text-[10px] uppercase">Email:</span>
                                    <span className="text-white truncate">{historyModal.customer?.email || '—'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-zinc-400">
                                    <Phone size={13} className="text-zinc-500 shrink-0" />
                                    <span className="text-zinc-500 text-[10px] uppercase">Phone:</span>
                                    <span className="text-white">{historyModal.customer?.phone || '—'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-zinc-400">
                                    <Calendar size={13} className="text-zinc-500 shrink-0" />
                                    <span className="text-zinc-500 text-[10px] uppercase">Registered:</span>
                                    <span className="text-zinc-300">
                                        {historyModal.customer?.created_at ? new Date(historyModal.customer.created_at).toLocaleDateString() : '—'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-zinc-400">
                                    <Wrench size={13} className="text-zinc-500 shrink-0" />
                                    <span className="text-zinc-500 text-[10px] uppercase">Tickets Raised:</span>
                                    <span className="text-neon-cyan font-bold">
                                        {historyModal.stats?.total ?? (historyModal.tickets || []).length} tickets
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Ticket Count Statistics Summary Ribbon */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
                            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-900">
                                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Total Raised</div>
                                <div className="text-lg font-extrabold text-white mt-0.5">
                                    {historyModal.stats?.total ?? (historyModal.tickets || []).length}
                                </div>
                            </div>
                            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-900">
                                <div className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold">Active Repairs</div>
                                <div className="text-lg font-extrabold text-amber-400 mt-0.5">
                                    {historyModal.stats?.active ?? 0}
                                </div>
                            </div>
                            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-900">
                                <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">Completed</div>
                                <div className="text-lg font-extrabold text-emerald-400 mt-0.5">
                                    {historyModal.stats?.completed ?? 0}
                                </div>
                            </div>
                            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-900">
                                <div className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold">Cancelled</div>
                                <div className="text-lg font-extrabold text-rose-400 mt-0.5">
                                    {historyModal.stats?.cancelled ?? 0}
                                </div>
                            </div>
                        </div>

                        {/* 3. Ticket Filter Tabs (All / Active / Completed / Cancelled) */}
                        <div className="flex border-b border-zinc-900 p-1 bg-zinc-950/30 rounded-xl gap-1">
                            {[
                                { id: 'all', label: `All (${historyModal.stats?.total ?? (historyModal.tickets || []).length})` },
                                { id: 'active', label: `Active (${historyModal.stats?.active ?? 0})` },
                                { id: 'completed', label: `Completed (${historyModal.stats?.completed ?? 0})` },
                                { id: 'cancelled', label: `Cancelled (${historyModal.stats?.cancelled ?? 0})` }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setCustomerTicketFilter(tab.id as any)}
                                    className={`flex-1 py-1.5 px-2 text-[10px] font-mono uppercase tracking-wider rounded-lg transition-all cursor-pointer text-center ${
                                        customerTicketFilter === tab.id
                                            ? 'bg-neon-cyan/20 text-neon-cyan font-bold border border-neon-cyan/40 shadow-sm'
                                            : 'text-zinc-500 hover:text-white hover:bg-zinc-900'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* 4. Ticket Records List */}
                        {historyLoading ? (
                            <div className="py-12 flex flex-col items-center justify-center gap-3">
                                <Loader2 className="w-7 h-7 text-neon-cyan animate-spin" />
                                <span className="text-xs font-mono text-zinc-500">Loading complete repair records...</span>
                            </div>
                        ) : (historyModal.tickets || []).length === 0 ? (
                            <div className="py-12 text-center bg-zinc-950/40 rounded-xl border border-zinc-900">
                                <p className="text-zinc-400 text-sm font-medium">No repair requests registered for this customer.</p>
                                <p className="text-[11px] text-zinc-600 mt-1">When this customer requests a device repair, all history will appear here.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {(() => {
                                    const filtered = (historyModal.tickets || []).filter((r: any) => {
                                        if (customerTicketFilter === 'active') return ['pending', 'in_progress'].includes(r.status);
                                        if (customerTicketFilter === 'completed') return ['completed', 'delivered'].includes(r.status);
                                        if (customerTicketFilter === 'cancelled') return r.status === 'cancelled';
                                        return true;
                                    });

                                    if (filtered.length === 0) {
                                        return (
                                            <div className="py-8 text-center text-zinc-500 text-xs font-mono">
                                                No tickets found under &quot;{customerTicketFilter}&quot; filter.
                                            </div>
                                        );
                                    }

                                    return filtered.map((r: any) => {
                                        const isPaid = (r.paymentStatus || '').toLowerCase() === 'paid';
                                        const costValue = r.repairCost !== null && r.repairCost !== undefined ? Number(r.repairCost) : null;

                                        return (
                                            <div key={r.id} className="border border-zinc-900 bg-zinc-950/70 rounded-xl p-4 space-y-3 hover:border-zinc-800 transition-all">
                                                {/* Header: Ticket ID & Status & Action */}
                                                <div className="flex items-center justify-between gap-3 border-b border-zinc-900/80 pb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-mono text-neon-cyan font-bold tracking-wider">
                                                            {r.ticketNumber || r.ticket_number || `#${r.id}`}
                                                        </span>
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                                                            r.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                                                            r.status === 'delivered' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' :
                                                            r.status === 'cancelled' ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' :
                                                            'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                                        }`}>
                                                            {r.status?.replace('_', ' ')}
                                                        </span>
                                                    </div>

                                                    <Link
                                                        to={`/admin/repair-tickets?id=${r.ticketNumber || r.id}`}
                                                        className="px-2.5 py-1 bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan rounded-lg hover:bg-neon-cyan/20 transition-colors font-bold text-[10px] tracking-wider uppercase flex items-center gap-1"
                                                    >
                                                        Manage <ExternalLink size={11} />
                                                    </Link>
                                                </div>

                                                {/* Device & Problem Details */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                                    <div className="space-y-1">
                                                        <div className="text-[10px] uppercase font-mono text-zinc-500 flex items-center gap-1">
                                                            <Laptop size={11} className="text-cyan-400" /> Device Information
                                                        </div>
                                                        <div className="text-white font-semibold">
                                                            {r.deviceCategory} — {r.brand} {r.modelNumber && `(${r.modelNumber})`}
                                                        </div>
                                                        {r.serialNumber && (
                                                            <div className="text-[11px] font-mono text-zinc-400">
                                                                S/N: {r.serialNumber}
                                                            </div>
                                                        )}
                                                        {r.deviceConfiguration && (
                                                            <div className="text-[11px] text-zinc-400">
                                                                Config: {r.deviceConfiguration}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="space-y-1">
                                                        <div className="text-[10px] uppercase font-mono text-zinc-500 flex items-center gap-1">
                                                            <Wrench size={11} className="text-amber-400" /> Issue & Service
                                                        </div>
                                                        <div className="text-zinc-200 font-medium">
                                                            {r.problemType}
                                                        </div>
                                                        {r.problemDescription && (
                                                            <div className="text-[11px] text-zinc-400 line-clamp-2">
                                                                {r.problemDescription}
                                                            </div>
                                                        )}
                                                        <div className="text-[10px] font-mono text-zinc-500">
                                                            Type: {r.serviceType || 'Standard'} &bull; Priority: {r.priority || 'Normal'}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Technician, Cost & Payment Row */}
                                                <div className="pt-2.5 border-t border-zinc-900/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-zinc-500 text-[10px] uppercase">Tech:</span>
                                                        <span className={r.technicianName ? 'text-indigo-400 font-semibold' : 'text-zinc-500'}>
                                                            {r.technicianName || 'Unassigned'}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        {/* Estimate / Charges in ₹ */}
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-zinc-500 text-[10px] uppercase">Charges:</span>
                                                            <span className="font-bold text-white">
                                                                {costValue !== null ? `₹${costValue.toLocaleString()}` : 'Pending Quote'}
                                                            </span>
                                                        </div>

                                                        {/* Payment Status Badge */}
                                                        {isPaid ? (
                                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                                                <CheckCircle2 size={10} /> PAID
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                                                                <Clock size={10} /> {r.paymentStatus ? r.paymentStatus.toUpperCase() : 'UNPAID'}
                                                            </span>
                                                        )}

                                                        {/* Invoice reference if exists */}
                                                        {r.invoiceId && (
                                                            <span className="px-2 py-0.5 rounded text-[10px] bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                                                                <Receipt size={10} /> Inv #{r.invoiceId}
                                                            </span>
                                                        )}

                                                        {isPaid && (
                                                            <div className="flex items-center gap-1.5 ml-auto">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setSelectedReceiptTicketId(r.id);
                                                                        setSelectedReceiptInvoiceId(r.invoiceId || null);
                                                                        setReceiptModalOpen(true);
                                                                    }}
                                                                    className="px-2 py-0.5 rounded bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/25 text-neon-cyan text-[10px] flex items-center gap-1 transition-all cursor-pointer font-mono"
                                                                    title="View Tax Invoice"
                                                                >
                                                                    <Receipt size={10} /> View
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handlePrintBill(r.id)}
                                                                    className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] flex items-center gap-1 transition-all cursor-pointer font-mono"
                                                                    title="Print Tax Invoice"
                                                                >
                                                                    <Printer size={10} /> Print
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDownloadBill(r.id)}
                                                                    className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 text-[10px] flex items-center gap-1 transition-all cursor-pointer font-mono"
                                                                    title="Download PDF"
                                                                >
                                                                    <Download size={10} /> PDF
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Timestamp Footer */}
                                                <div className="text-[10px] font-mono text-zinc-500 flex items-center justify-between pt-1">
                                                    <span>Raised: {new Date(r.createdAt).toLocaleDateString()}</span>
                                                    {r.updatedAt && <span>Updated: {new Date(r.updatedAt).toLocaleDateString()}</span>}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        )}
                    </div>
                )}
            </SideDrawer>

            {/* Create Company Side Drawer */}
            <SideDrawer
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title="Register New Corporate Client"
                size="md"
            >
                {showCreateModal && (
                    <form onSubmit={handleCreateCompany} className="p-5 space-y-3 font-sans">
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Company Legal Name *</label>
                                <input
                                    type="text"
                                    maxLength={NAME_MAX_LENGTH}
                                    placeholder="e.g. Acme Technologies Private Limited"
                                    value={companyPayload.name}
                                    onChange={e => {
                                        setCompanyPayload(p => ({ ...p, name: e.target.value }));
                                        if (createCompanyErrors.name) setCreateCompanyErrors(p => ({ ...p, name: undefined }));
                                    }}
                                    required
                                    className={`w-full bg-zinc-900 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none ${
                                        createCompanyErrors.name ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-indigo-500'
                                    }`}
                                />
                                {createCompanyErrors.name && <p className="text-[11px] text-red-400 mt-1">{createCompanyErrors.name}</p>}
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Corporate Email Address *</label>
                                <input
                                    type="email"
                                    placeholder="admin@acmetech.com"
                                    value={companyPayload.email}
                                    onChange={e => {
                                        setCompanyPayload(p => ({ ...p, email: e.target.value }));
                                        if (createCompanyErrors.email) setCreateCompanyErrors(p => ({ ...p, email: undefined }));
                                    }}
                                    required
                                    className={`w-full bg-zinc-900 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none ${
                                        createCompanyErrors.email ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-indigo-500'
                                    }`}
                                />
                                {createCompanyErrors.email && <p className="text-[11px] text-red-400 mt-1">{createCompanyErrors.email}</p>}
                            </div>
                            <div>
                                <PhoneInput
                                    size="sm"
                                    label="Contact Phone"
                                    value={companyPayload.phone}
                                    onChange={val => {
                                        setCompanyPayload(p => ({ ...p, phone: val }));
                                        if (createCompanyErrors.phone) setCreateCompanyErrors(p => ({ ...p, phone: undefined }));
                                    }}
                                    error={createCompanyErrors.phone}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Portal Login Password (Min 8 Chars) *</label>
                                <div className="relative">
                                    <input
                                        type={showCompanyPassword ? "text" : "password"}
                                        placeholder="Enter secure initial password"
                                        value={companyPayload.password}
                                        onChange={e => {
                                            setCompanyPayload(p => ({ ...p, password: e.target.value }));
                                            if (createCompanyErrors.password) setCreateCompanyErrors(p => ({ ...p, password: undefined }));
                                        }}
                                        required
                                        className={`w-full bg-zinc-900 border rounded-xl px-3 py-2 pr-10 text-xs text-white focus:outline-none ${
                                            createCompanyErrors.password ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-indigo-500'
                                        }`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCompanyPassword(!showCompanyPassword)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer p-1 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                                        aria-label={showCompanyPassword ? "Hide password" : "Show password"}
                                        tabIndex={-1}
                                    >
                                        {showCompanyPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                                {createCompanyErrors.password && <p className="text-[11px] text-red-400 mt-1">{createCompanyErrors.password}</p>}
                            </div>
                            <div className="pt-2 flex gap-3">
                                <button type="button" onClick={() => setShowCreateModal(false)}
                                    className="flex-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-white py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer">
                                    Cancel
                                </button>
                                <button type="submit" disabled={creatingCompany}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
                                    {creatingCompany ? <Loader2 size={13} className="animate-spin" /> : 'Register Company'}
                                </button>
                            </div>
                        </form>
                )}
            </SideDrawer>

            {/* Deactivate Company Modal */}
            <PromptModal
                isOpen={deactivateCompanyModal !== null}
                title={`Deactivate Corporate Account - ${deactivateCompanyModal?.name}`}
                message={`Deactivate corporate account "${deactivateCompanyModal?.name}"?\nAll fleet devices, tickets, invoices, and employee records will remain intact.`}
                inputLabel="Reason (optional):"
                placeholder="Enter deactivation reason..."
                confirmText="Deactivate"
                variant="warning"
                isLoading={deactivateCompanyLoading}
                onConfirm={handleConfirmDeactivateCompany}
                onCancel={() => setDeactivateCompanyModal(null)}
            />

            {/* Reject Corporate Payment Modal */}
            <PromptModal
                isOpen={rejectPaymentModal !== null}
                title={`Reject Payment - #${rejectPaymentModal?.payment_id || rejectPaymentModal?.paymentId || rejectPaymentModal?.id}`}
                message={`Are you sure you want to reject this offline payment of ₹${Number(rejectPaymentModal?.amount || 0).toLocaleString()} for Ticket #${rejectPaymentModal?.ticket_number || rejectPaymentModal?.ticketNumber || rejectPaymentModal?.ticket_id}?`}
                inputLabel="Rejection Reason (required):"
                placeholder="e.g. UTR not matching bank statement, cash not received..."
                confirmText="Reject Payment"
                variant="danger"
                isLoading={paymentActionLoading !== null}
                onConfirm={handleConfirmRejectCorporatePayment}
                onCancel={() => setRejectPaymentModal(null)}
            />

            {/* Payment Receipt / Invoice Statement Modal */}
            <PaymentReceiptModal
                isOpen={receiptModalOpen}
                onClose={() => {
                    setReceiptModalOpen(false);
                    setSelectedReceiptTicketId(null);
                    setSelectedReceiptInvoiceId(null);
                }}
                ticketId={selectedReceiptTicketId}
                invoiceId={selectedReceiptInvoiceId}
            />
        </div>
    );
}
