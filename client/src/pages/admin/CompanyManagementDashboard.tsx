import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { adminApi, repairApi, companyApi, billingApi } from '@/services/api';
import type { Customer } from '@/services/api';
import {
    Building2, Search, Wrench, DollarSign, Receipt, Laptop,
    Users, UserCog, ArrowLeft, CheckCircle2, Clock, AlertCircle,
    Check, X, ExternalLink, RefreshCw, ChevronRight, ChevronLeft, ShieldCheck,
    ShieldAlert, Phone, Mail, MapPin, Plus, FileText, ChevronDown,
    SlidersHorizontal, Sparkles, AlertTriangle, Calendar, Filter,
    Tag, ArrowUpRight, CreditCard, Download, FileDown, Eye,
    MessageSquare, Send, Printer, XCircle, Hourglass
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { ROUTES } from '@/config/routes';
import DeviceRepairHistoryModal from '@/components/DeviceRepairHistoryModal';
import RepairTicketWorkspace from '@/components/RepairTicketWorkspace';
import SideDrawer from '@/components/SideDrawer';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';
import { downloadPaymentBillPdf, printPaymentBill } from '@/utils/billGenerator';
import { MESSAGE_MAX_LENGTH } from '@/config/constants';

interface CompanyStats {
    totalCompanies: number;
    activeCompanies: number;
    inactiveCompanies: number;
    totalCompanyTickets: number;
    totalCompanyIncome: number;
    totalPaidPaymentsCount: number;
    invoices: {
        total: number;
        paid: number;
        unpaid: number;
    };
    statusCounts: {
        pending: number;
        inProgress: number;
        completed: number;
        delivered?: number;
        cancelled: number;
        open: number;
    };
    infrastructure: {
        totalDevices: number;
        totalBranches: number;
        totalEmployees: number;
        totalDevicesUnderRepair: number;
    };
}

export default function CompanyManagementDashboard() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // Query params for deep-linking: ?companyId=102, ?tab=income|repairs|invoices
    const selectedCompanyIdParam = searchParams.get('companyId');
    type OverviewTab = 'clients' | 'income' | 'repairs' | 'invoices';
    const activeTabParam = searchParams.get('tab') as OverviewTab | null;
    const [activeOverviewTab, setActiveOverviewTab] = useState<OverviewTab>(
        (activeTabParam && ['clients', 'income', 'repairs', 'invoices'].includes(activeTabParam)) ? activeTabParam : 'clients'
    );

    const handleSelectOverviewTab = (tab: OverviewTab) => {
        setActiveOverviewTab(tab);
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (tab === 'clients') {
                next.delete('tab');
            } else {
                next.set('tab', tab);
            }
            return next;
        });
    };

    // Overview Stats
    const [stats, setStats] = useState<CompanyStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);

    // Verified Income (Payments) State
    const [payments, setPayments] = useState<any[]>([]);
    const [paymentSummaries, setPaymentSummaries] = useState<any[]>([]);
    const [paymentTotalSummary, setPaymentTotalSummary] = useState<any | null>(null);
    const [paymentsLoading, setPaymentsLoading] = useState(false);
    const [incomeSearch, setIncomeSearch] = useState('');
    const [incomeCompanyFilter, setIncomeCompanyFilter] = useState('all');
    const [incomePage, setIncomePage] = useState(1);
    const [incomeTotalPages, setIncomeTotalPages] = useState(1);
    const [incomeStartDate, setIncomeStartDate] = useState('');
    const [incomeEndDate, setIncomeEndDate] = useState('');

    // Corporate Repairs State
    const [allCorporateRepairs, setAllCorporateRepairs] = useState<any[]>([]);
    const [corporateRepairsLoading, setCorporateRepairsLoading] = useState(false);
    const [repairSearch, setRepairSearch] = useState('');
    const [repairStatusFilter, setRepairStatusFilter] = useState('all');
    const [repairPriorityFilter, setRepairPriorityFilter] = useState('all');
    const [repairCompanyFilter, setRepairCompanyFilter] = useState('all');
    const [repairPage, setRepairPage] = useState(1);
    const [repairTotalPages, setRepairTotalPages] = useState(1);
    const [totalCorporateRepairsCount, setTotalCorporateRepairsCount] = useState(0);

    // Corporate Invoices State
    const [corporateInvoices, setCorporateInvoices] = useState<any[]>([]);
    const [companyInvoiceSummaries, setCompanyInvoiceSummaries] = useState<any[]>([]);
    const [invoiceTotalSummary, setInvoiceTotalSummary] = useState<any | null>(null);
    const [corporateInvoicesLoading, setCorporateInvoicesLoading] = useState(false);
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [invoiceCompanyFilter, setInvoiceCompanyFilter] = useState('all');
    const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');
    const [invoicePage, setInvoicePage] = useState(1);
    const [invoiceTotalPages, setInvoiceTotalPages] = useState(1);

    // Companies Directory List
    const [companies, setCompanies] = useState<any[]>([]);
    const [companiesLoading, setCompaniesLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCompaniesCount, setTotalCompaniesCount] = useState(0);

    // Selected Company Drilldown
    const [selectedCompany, setSelectedCompany] = useState<any | null>(null);
    const [companyDetailsLoading, setCompanyDetailsLoading] = useState(false);
    const [companyTickets, setCompanyTickets] = useState<any[]>([]);
    const [companyTicketsLoading, setCompanyTicketsLoading] = useState(false);
    const [ticketStatusFilter, setTicketStatusFilter] = useState<string>('all');
    const [ticketSearch, setTicketSearch] = useState('');
    const [drilldownTab, setDrilldownTab] = useState<'tickets' | 'devices' | 'support'>('tickets');
    const [historyModalDeviceId, setHistoryModalDeviceId] = useState<number | null>(null);
    const [deviceSearch, setDeviceSearch] = useState('');
    const [companyDropdownList, setCompanyDropdownList] = useState<Array<{ id: number; name: string }>>([]);
    const [downloadingId, setDownloadingId] = useState<string | number | null>(null);

    // Main Content Ticket Workspace State
    const [workspaceTicket, setWorkspaceTicket] = useState<any | null>(null);
    const [quickDrawerTicket, setQuickDrawerTicket] = useState<any | null>(null);
    const [workspaceLoading, setWorkspaceLoading] = useState(false);
    const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);

    // Support Queries State for Selected Company
    const [companySupportMessages, setCompanySupportMessages] = useState<any[]>([]);
    const [supportMessagesLoading, setSupportMessagesLoading] = useState(false);
    const [supportReplyText, setSupportReplyText] = useState('');
    const [sendingSupportReply, setSendingSupportReply] = useState(false);
    const [supportTicketFilter, setSupportTicketFilter] = useState('all');
    const supportChatEndRef = useRef<HTMLDivElement>(null);

    // Assign Technician Modal State
    const [assignModalTicket, setAssignModalTicket] = useState<any | null>(null);
    const [technicians, setTechnicians] = useState<Customer[]>([]);
    const [techniciansLoading, setTechniciansLoading] = useState(false);
    const [selectedTechId, setSelectedTechId] = useState<string>('');
    const [assignStatus, setAssignStatus] = useState<string>('in_progress');
    const [assigning, setAssigning] = useState(false);

    // In-Dashboard Company Registration State
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [registering, setRegistering] = useState(false);
    const [registerForm, setRegisterForm] = useState({
        companyName: '',
        contactPerson: '',
        email: '',
        phone: '',
        address: '',
        password: '',
        gstNumber: '',
        websiteUrl: ''
    });

    // In-Dashboard Company Profile Edit State
    const [showEditModal, setShowEditModal] = useState(false);
    const [updatingProfile, setUpdatingProfile] = useState(false);
    const [editForm, setEditForm] = useState({
        companyName: '',
        contactPerson: '',
        phone: '',
        address: '',
        gstNumber: '',
        websiteUrl: ''
    });

    const handleOpenRegisterModal = () => {
        setRegisterForm({
            companyName: '',
            contactPerson: '',
            email: '',
            phone: '',
            address: '',
            password: '',
            gstNumber: '',
            websiteUrl: ''
        });
        setShowRegisterModal(true);
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!registerForm.companyName || !registerForm.email || !registerForm.password) {
            toast.error('Company name, email, and password are required.');
            return;
        }
        setRegistering(true);
        try {
            const res = await companyApi.registerCompany(registerForm);
            if (res.ok && res.data?.success) {
                toast.success('Company registered successfully!');
                setShowRegisterModal(false);
                fetchCompanies();
                fetchStats();
            } else {
                toast.error(res.error || res.data?.message || 'Registration failed');
            }
        } catch (err: any) {
            toast.error(err.message || 'Error registering company');
        } finally {
            setRegistering(false);
        }
    };

    const handleOpenEditModal = () => {
        if (!selectedCompany) return;
        setEditForm({
            companyName: selectedCompany.company_name || selectedCompany.name || '',
            contactPerson: selectedCompany.contact_person || '',
            phone: selectedCompany.phone || selectedCompany.phone_number || '',
            address: selectedCompany.address || '',
            gstNumber: selectedCompany.gst_number || '',
            websiteUrl: selectedCompany.website_url || ''
        });
        setShowEditModal(true);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token || !selectedCompany) return;
        setUpdatingProfile(true);
        try {
            const res = await companyApi.updateProfile(token, editForm, selectedCompany.id);
            if (res.ok && res.data?.success) {
                toast.success('Company profile updated successfully!');
                setSelectedCompany((prev: any) => ({ ...prev, ...editForm, name: editForm.companyName }));
                setShowEditModal(false);
                fetchCompanies();
            } else {
                toast.error(res.error || res.data?.message || 'Profile update failed');
            }
        } catch (err: any) {
            toast.error(err.message || 'Error updating profile');
        } finally {
            setUpdatingProfile(false);
        }
    };

    // Fetch Overview Stats
    const fetchStats = useCallback(async () => {
        if (!token) return;
        setStatsLoading(true);
        try {
            const res = await adminApi.getCompanyStats(token);
            if (res.ok && res.data?.data) {
                setStats(res.data.data);
            }
        } catch (err) {
            console.error('Failed to load company stats:', err);
        } finally {
            setStatsLoading(false);
        }
    }, [token]);

    // Fetch Companies Table Data
    const fetchCompanies = useCallback(async () => {
        if (!token) return;
        setCompaniesLoading(true);
        try {
            const apiStatus = statusFilter === 'all' ? '' : statusFilter;
            const res = await adminApi.getCompanies(token, currentPage, 15, searchQuery, apiStatus);
            if (res.ok && res.data?.data) {
                setCompanies(res.data.data.data || []);
                setTotalPages(res.data.data.pagination?.totalPages || 1);
                setTotalCompaniesCount(res.data.data.pagination?.total || 0);
            }
        } catch (err) {
            console.error('Failed to load companies:', err);
            toast.error('Failed to load companies');
        } finally {
            setCompaniesLoading(false);
        }
    }, [token, currentPage, searchQuery, statusFilter]);

    // Fetch Verified Income / Payments
    const fetchPayments = useCallback(async () => {
        if (!token) return;
        setPaymentsLoading(true);
        try {
            const compId = incomeCompanyFilter === 'all' ? '' : incomeCompanyFilter;
            const res = await adminApi.getCompanyPayments(
                token, incomePage, 15, compId, incomeSearch, incomeStartDate, incomeEndDate
            );
            if (res.ok && res.data?.data) {
                setPayments(res.data.data.payments || []);
                setPaymentSummaries(res.data.data.companySummaries || []);
                setPaymentTotalSummary(res.data.data.summary || null);
                setIncomeTotalPages(res.data.data.pagination?.totalPages || 1);
            }
        } catch (err) {
            console.error('Failed to load corporate payments:', err);
            toast.error('Failed to load verified income ledger');
        } finally {
            setPaymentsLoading(false);
        }
    }, [token, incomePage, incomeCompanyFilter, incomeSearch, incomeStartDate, incomeEndDate]);

    // Fetch Corporate Repairs
    const fetchCorporateRepairs = useCallback(async () => {
        if (!token) return;
        setCorporateRepairsLoading(true);
        try {
            const compId = repairCompanyFilter === 'all' ? undefined : repairCompanyFilter;
            const stat = repairStatusFilter === 'all' ? undefined : repairStatusFilter;
            const prio = repairPriorityFilter === 'all' ? undefined : repairPriorityFilter;
            const res = await repairApi.getRequests(
                token,
                {
                    clientType: 'company',
                    companyId: compId,
                    status: stat,
                    priority: prio,
                    search: repairSearch
                },
                repairPage,
                15
            );
            if (res.ok && res.data?.data) {
                setAllCorporateRepairs((res.data.data as any).data || (res.data.data as any).requests || []);
                setRepairTotalPages(res.data.data.pagination?.totalPages || 1);
                setTotalCorporateRepairsCount(res.data.data.pagination?.total || 0);
            }
        } catch (err) {
            console.error('Failed to load corporate repairs:', err);
            toast.error('Failed to load corporate repairs');
        } finally {
            setCorporateRepairsLoading(false);
        }
    }, [token, repairPage, repairCompanyFilter, repairStatusFilter, repairPriorityFilter, repairSearch]);

    // Fetch Corporate Invoices
    const fetchCorporateInvoices = useCallback(async () => {
        if (!token) return;
        setCorporateInvoicesLoading(true);
        try {
            const compId = invoiceCompanyFilter === 'all' ? '' : invoiceCompanyFilter;
            const stat = invoiceStatusFilter === 'all' ? '' : invoiceStatusFilter;
            const res = await adminApi.getCompanyInvoices(
                token, invoicePage, 15, compId, stat, invoiceSearch
            );
            if (res.ok && res.data?.data) {
                setCorporateInvoices(res.data.data.invoices || []);
                setCompanyInvoiceSummaries(res.data.data.companySummary || []);
                setInvoiceTotalSummary(res.data.data.summary || null);
                setInvoiceTotalPages(res.data.data.pagination?.totalPages || 1);
            }
        } catch (err) {
            console.error('Failed to load corporate invoices:', err);
            toast.error('Failed to load corporate invoices');
        } finally {
            setCorporateInvoicesLoading(false);
        }
    }, [token, invoicePage, invoiceCompanyFilter, invoiceStatusFilter, invoiceSearch]);

    // Fetch Technician Pool for assignment
    const fetchTechnicians = useCallback(async () => {
        if (!token) return;
        setTechniciansLoading(true);
        try {
            const res = await adminApi.getCustomers(token, 1, 100, '', 'technician');
            if (res.ok && res.data?.data?.data) {
                setTechnicians(res.data.data.data);
            }
        } catch (err) {
            console.error('Failed to load technicians:', err);
        } finally {
            setTechniciansLoading(false);
        }
    }, [token]);

    // Fetch Company Support Messages
    const fetchCompanySupportMessages = useCallback(async (companyId: number, silent = false) => {
        if (!token || !companyId) return;
        if (!silent) setSupportMessagesLoading(true);
        try {
            const res = await adminApi.getCompanyMessages(token, companyId);
            if (res.ok && res.data) {
                const list = res.data.data || res.data;
                const arr = Array.isArray(list) ? list : [];
                setCompanySupportMessages(arr);
                setSelectedCompany((prev: any) => prev ? {
                    ...prev,
                    unread_support_queries: 0,
                    unreadSupportCount: 0,
                    totalSupportQueries: arr.length
                } : null);
            }
        } catch (err) {
            console.error('Failed to load company support messages:', err);
        } finally {
            if (!silent) setSupportMessagesLoading(false);
        }
    }, [token]);

    // Handle Sending Support Reply
    const handleSendSupportReply = async (e: React.FormEvent) => {
        e.preventDefault();
        const text = supportReplyText.trim();
        if (!text || sendingSupportReply || !token || !selectedCompany) return;

        if (text.length > MESSAGE_MAX_LENGTH) {
            toast.error(`Message cannot exceed ${MESSAGE_MAX_LENGTH} characters.`);
            return;
        }

        setSendingSupportReply(true);
        try {
            const ticketId = supportTicketFilter !== 'all' ? parseInt(supportTicketFilter, 10) : undefined;
            const res = await adminApi.sendCompanyMessage(token, selectedCompany.id, {
                message: text,
                repairRequestId: ticketId
            });

            if (res.ok) {
                toast.success('Reply dispatched to company');
                setSupportReplyText('');
                fetchCompanySupportMessages(selectedCompany.id, true);
                fetchCompanies();
            } else {
                toast.error(res.error || 'Failed to dispatch reply');
            }
        } catch (err) {
            console.error('Error sending support reply:', err);
            toast.error('Network error sending reply');
        } finally {
            setSendingSupportReply(false);
        }
    };

    // Auto-poll support messages every 5 seconds when viewing support tab
    useEffect(() => {
        if (selectedCompany && drilldownTab === 'support') {
            const interval = setInterval(() => {
                fetchCompanySupportMessages(selectedCompany.id, true);
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [selectedCompany, drilldownTab, fetchCompanySupportMessages]);

    // Auto scroll chat thread to bottom on message change
    useEffect(() => {
        if (drilldownTab === 'support') {
            supportChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [companySupportMessages, drilldownTab]);

    // Fetch Drilldown Details & Tickets for a Selected Company
    const loadCompanyDrilldown = useCallback(async (companyId: number) => {
        if (!token) return;
        setCompanyDetailsLoading(true);
        setCompanyTicketsLoading(true);

        try {
            // Load Company Details
            const detailRes = await adminApi.getCompanyDetails(token, companyId);
            if (detailRes.ok && detailRes.data?.data) {
                const d = detailRes.data.data;
                const profileObj = d.profile || {};
                const combinedCompany = {
                    ...profileObj,
                    name: profileObj.company_name || profileObj.name,
                    devices: d.devices || [],
                    branches: d.branches || [],
                    employees: d.employees || [],
                    total_devices: (d.devices || []).length,
                    total_tickets: (d.tickets || []).length,
                    active_repairs: (d.tickets || []).filter((t: any) => !['completed', 'delivered', 'cancelled', 'rejected'].includes(t.status)).length,
                    completed_repairs: (d.tickets || []).filter((t: any) => ['completed', 'repaired', 'delivered', 'closed'].includes(t.status)).length,
                    total_paid_amount: (d.payments || []).reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0),
                    total_support_queries: d.totalSupportQueries || (d.messages || []).length,
                    unread_support_queries: d.unreadSupportCount || 0
                };
                setSelectedCompany((prev: any) => ({ ...(prev || {}), ...combinedCompany }));
                if (Array.isArray(d.messages)) {
                    setCompanySupportMessages(d.messages);
                }
            }

            // Load Company Tickets strictly for this company
            const ticketsRes = await adminApi.getCompanyTickets(
                token, 1, 50, ticketSearch, ticketStatusFilter, 'all', String(companyId)
            );
            if (ticketsRes.ok && ticketsRes.data?.data) {
                setCompanyTickets(ticketsRes.data.data.data || []);
            }

            // Also load fresh messages
            fetchCompanySupportMessages(companyId, true);
        } catch (err) {
            console.error('Error loading company drilldown:', err);
            toast.error('Could not load company details');
        } finally {
            setCompanyDetailsLoading(false);
            setCompanyTicketsLoading(false);
        }
    }, [token, ticketSearch, ticketStatusFilter, fetchCompanySupportMessages]);

    // Initial load
    useEffect(() => {
        fetchStats();
        fetchTechnicians();
    }, [fetchStats, fetchTechnicians]);

    useEffect(() => {
        fetchCompanies();
    }, [fetchCompanies]);

    // Load full company list for dropdown filters
    useEffect(() => {
        if (!token) return;
        adminApi.getCompanies(token, 1, 200).then(res => {
            if (res.ok && res.data?.data?.data) {
                setCompanyDropdownList(res.data.data.data.map((c: any) => ({
                    id: c.id,
                    name: c.name || c.company_name
                })));
            }
        }).catch(err => console.error('Failed to load company dropdown list:', err));
    }, [token]);

    useEffect(() => {
        if (activeOverviewTab === 'income') {
            fetchPayments();
        } else if (activeOverviewTab === 'repairs') {
            fetchCorporateRepairs();
        } else if (activeOverviewTab === 'invoices') {
            fetchCorporateInvoices();
        }
    }, [activeOverviewTab, fetchPayments, fetchCorporateRepairs, fetchCorporateInvoices]);

    // Check if query param companyId exists on mount or URL change
    const subtabParam = searchParams.get('subtab') as 'tickets' | 'devices' | 'support' | null;
    const ticketIdParam = searchParams.get('ticketId');

    useEffect(() => {
        if (selectedCompanyIdParam) {
            const idNum = parseInt(selectedCompanyIdParam, 10);
            if (!isNaN(idNum)) {
                loadCompanyDrilldown(idNum);
                if (subtabParam && ['tickets', 'devices', 'support'].includes(subtabParam)) {
                    setDrilldownTab(subtabParam);
                }
            }
        } else {
            setSelectedCompany(null);
            setCompanyTickets([]);
            setCompanySupportMessages([]);
            setWorkspaceTicket(null);
        }
    }, [selectedCompanyIdParam, subtabParam, loadCompanyDrilldown]);

    // Handle deep linking to a specific ticket via ticketId query param
    useEffect(() => {
        if (ticketIdParam && token) {
            setWorkspaceLoading(true);
            repairApi.getRequestById(token, ticketIdParam).then(res => {
                if (res.ok && res.data?.data) {
                    setWorkspaceTicket(res.data.data);
                }
            }).catch(err => {
                console.error('Failed to load deep-linked ticket:', err);
            }).finally(() => {
                setWorkspaceLoading(false);
            });
        } else if (!ticketIdParam) {
            setWorkspaceTicket(null);
        }
    }, [ticketIdParam, token]);

    // Open full ticket details workspace in main content
    const handleOpenTicketWorkspace = async (ticket: any) => {
        if (!token) return;
        setWorkspaceLoading(true);
        const ticketKey = ticket.id || ticket.ticket_number || ticket.ticketNumber;
        try {
            const res = await repairApi.getRequestById(token, ticketKey);
            if (res.ok && res.data?.data) {
                setWorkspaceTicket(res.data.data);
            } else {
                setWorkspaceTicket(ticket);
            }
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                next.set('ticketId', String(ticketKey));
                return next;
            });
        } catch (err) {
            console.error('Error opening ticket workspace:', err);
            setWorkspaceTicket(ticket);
        } finally {
            setWorkspaceLoading(false);
        }
    };

    // Close ticket details workspace and return to company tickets
    const handleCloseTicketWorkspace = () => {
        setWorkspaceTicket(null);
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.delete('ticketId');
            return next;
        });
        if (selectedCompany) {
            loadCompanyDrilldown(selectedCompany.id);
        }
    };

    // Handle Company Click in Table
    const handleSelectCompany = (company: any, targetTab: 'tickets' | 'devices' | 'support' = 'tickets') => {
        setSelectedCompany(company);
        setWorkspaceTicket(null);
        setDrilldownTab(targetTab);
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('companyId', String(company.id));
            next.delete('ticketId');
            if (targetTab !== 'tickets') {
                next.set('subtab', targetTab);
            } else {
                next.delete('subtab');
            }
            return next;
        });
        loadCompanyDrilldown(company.id);
        if (targetTab === 'support') {
            fetchCompanySupportMessages(company.id);
        }
    };

    // Handle Switching Drilldown Sub-Tab
    const handleSelectDrilldownTab = (tab: 'tickets' | 'devices' | 'support') => {
        setDrilldownTab(tab);
        setWorkspaceTicket(null);
        if (tab === 'support' && selectedCompany) {
            fetchCompanySupportMessages(selectedCompany.id);
        }
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.delete('ticketId');
            if (tab !== 'tickets') {
                next.set('subtab', tab);
            } else {
                next.delete('subtab');
            }
            return next;
        });
    };

    // Handle Back to All Companies
    const handleBackToOverview = () => {
        setSelectedCompany(null);
        setWorkspaceTicket(null);
        setDrilldownTab('tickets');
        setCompanySupportMessages([]);
        setHistoryModalDeviceId(null);
        setSearchParams(prev => {
            const next = new URLSearchParams();
            if (activeOverviewTab !== 'clients') {
                next.set('tab', activeOverviewTab);
            }
            return next;
        });
        fetchCompanies();
    };

    // Toggle Company Active Status
    const handleToggleStatus = async (companyId: number, currentStatus: boolean, companyName: string) => {
        if (!token) return;
        const newStatus = !currentStatus;
        try {
            const res = await adminApi.toggleCompanyStatus(token, companyId, newStatus);
            if (res.ok) {
                toast.success(`${companyName} status changed to ${newStatus ? 'Active' : 'Suspended'}`);
                fetchCompanies();
                fetchStats();
                if (selectedCompany && selectedCompany.id === companyId) {
                    setSelectedCompany((prev: any) => prev ? { ...prev, is_active: newStatus ? 1 : 0 } : null);
                }
            } else {
                toast.error(res.error || 'Failed to update status');
            }
        } catch (err) {
            console.error(err);
            toast.error('Network error updating status');
        }
    };

    // Open Assign Technician Modal
    const handleOpenAssignModal = (ticket: any) => {
        setAssignModalTicket(ticket);
        const currentTechId = ticket.assigned_technician_id || ticket.assignedTechnicianId;
        setSelectedTechId(currentTechId ? String(currentTechId) : '');
        setAssignStatus(ticket.status === 'pending' ? 'in_progress' : ticket.status || 'in_progress');
    };

    // Submit Technician Assignment
    const handleAssignSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token || !assignModalTicket) return;

        const techId = selectedTechId ? parseInt(selectedTechId, 10) : null;
        setAssigning(true);
        try {
            const res = await repairApi.assignTechnician(token, assignModalTicket.id, techId, assignStatus);
            if (res.ok) {
                const assignedTechObj = technicians.find(t => t.id === techId);
                const techName = assignedTechObj?.name || 'Technician';
                toast.success(techId ? `Assigned to ${techName}` : 'Technician unassigned');

                // Update local company tickets list
                setCompanyTickets(prev => prev.map(t => {
                    if (t.id === assignModalTicket.id) {
                        return {
                            ...t,
                            assigned_technician_id: techId,
                            assignedTechnicianId: techId,
                            technician_name: assignedTechObj?.name || null,
                            technicianName: assignedTechObj?.name || null,
                            status: assignStatus
                        };
                    }
                    return t;
                }));

                // Also update global corporate repairs list if active
                setAllCorporateRepairs(prev => prev.map(t => {
                    if (t.id === assignModalTicket.id) {
                        return {
                            ...t,
                            assigned_technician_id: techId,
                            assignedTechnicianId: techId,
                            technician_name: assignedTechObj?.name || null,
                            assigned_technician_name: assignedTechObj?.name || null,
                            status: assignStatus
                        };
                    }
                    return t;
                }));

                // Refresh stats
                fetchStats();
                setAssignModalTicket(null);
            } else {
                toast.error(res.error || 'Failed to assign technician');
            }
        } catch (err) {
            console.error('Assign error:', err);
            toast.error('Network error during technician assignment');
        } finally {
            setAssigning(false);
        }
    };

    // Helper for selecting company by ID from any table row
    const handleSelectCompanyById = (companyId: number, companyName?: string) => {
        const matched = companies.find(c => c.id === companyId);
        if (matched) {
            handleSelectCompany(matched);
        } else {
            const partial = { id: companyId, name: companyName || `Company #${companyId}` };
            handleSelectCompany(partial);
        }
    };

    // Helper for formatting Currency (INR)
    const formatINR = (val: number | string | undefined | null) => {
        const num = typeof val === 'string' ? parseFloat(val) : Number(val || 0);
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(num);
    };

    // Status badge style helper
    const getStatusBadge = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'completed':
                return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
            case 'delivered':
                return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
            case 'in_progress':
                return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
            case 'pending':
                return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
            case 'cancelled':
                return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
            default:
                return 'bg-zinc-800 text-zinc-400 border-zinc-700';
        }
    };

    // Priority badge style helper
    const getPriorityBadge = (priority: string) => {
        switch (priority?.toLowerCase()) {
            case 'urgent':
                return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
            case 'high':
                return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
            case 'medium':
                return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
            case 'low':
                return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
            default:
                return 'bg-zinc-800 text-zinc-400 border-zinc-700';
        }
    };

    // Receipt / Invoice Viewer Modal State
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [modalInvoiceId, setModalInvoiceId] = useState<string | number | null>(null);
    const [modalTicketId, setModalTicketId] = useState<string | number | null>(null);

    // View Ticket Receipt Modal
    const handleViewTicketReceipt = (ticketId: number) => {
        setModalTicketId(ticketId);
        setModalInvoiceId(null);
        setReceiptModalOpen(true);
    };

    // Print Ticket Tax Invoice / Bill
    const handlePrintTicketReceipt = async (ticketId: number) => {
        if (!token) return;
        const toastId = toast.loading('Preparing document for printing...');
        try {
            const res = await billingApi.getPaymentReceiptByTicket(ticketId, token);
            const receiptData = res.data?.data || res.data?.receipt || (res.data?.receiptNumber ? res.data : null);
            if (res.ok && receiptData) {
                await printPaymentBill(receiptData);
                toast.dismiss(toastId);
            } else {
                toast.error('Could not prepare invoice for printing.', { id: toastId });
            }
        } catch {
            toast.error('Print failed.', { id: toastId });
        }
    };

    // Download Ticket Tax Invoice / Bill PDF
    const handleDownloadTicketReceipt = async (ticketId: number) => {
        if (!token || downloadingId) return;
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

    // Print Invoice Handler
    const handlePrintInvoice = async (inv: any) => {
        if (!token) return;
        const toastId = toast.loading(`Preparing Invoice #${inv.invoice_number || inv.id} for printing...`);
        try {
            let receiptData = null;
            if (inv.id) {
                const res = await billingApi.getPaymentReceiptByInvoice(inv.id, token);
                if (res.ok && (res.data?.data || res.data)) {
                    receiptData = res.data?.data || res.data;
                }
            }
            if (!receiptData && inv.ticket_id) {
                const res = await billingApi.getPaymentReceiptByTicket(inv.ticket_id, token);
                if (res.ok && (res.data?.data || res.data)) {
                    receiptData = res.data?.data || res.data;
                }
            }
            if (receiptData) {
                await printPaymentBill(receiptData);
                toast.dismiss(toastId);
            } else {
                toast.error('Could not prepare invoice for printing.', { id: toastId });
            }
        } catch (err: any) {
            toast.error('Print preview failed: ' + (err?.message || 'Unknown error'), { id: toastId });
        }
    };

    // Print Payment Receipt Handler
    const handlePrintPaymentReceipt = async (pmt: any) => {
        if (!token) return;
        const toastId = toast.loading(`Preparing receipt #${pmt.payment_number || pmt.id} for printing...`);
        try {
            let receiptData = null;
            if (pmt.invoice_id) {
                const res = await billingApi.getPaymentReceiptByInvoice(pmt.invoice_id, token);
                if (res.ok && (res.data?.data || res.data)) {
                    receiptData = res.data?.data || res.data;
                }
            }
            if (!receiptData && pmt.ticket_id) {
                const res = await billingApi.getPaymentReceiptByTicket(pmt.ticket_id, token);
                if (res.ok && (res.data?.data || res.data)) {
                    receiptData = res.data?.data || res.data;
                }
            }
            if (receiptData) {
                await printPaymentBill(receiptData);
                toast.dismiss(toastId);
            } else {
                toast.error('Could not prepare receipt for printing.', { id: toastId });
            }
        } catch (err: any) {
            toast.error('Print preview failed: ' + (err?.message || 'Unknown error'), { id: toastId });
        }
    };

    // Download PDF Invoice for Corporate Invoices Table
    const handleDownloadInvoicePdf = async (inv: any) => {
        if (!token || downloadingId) return;
        setDownloadingId(inv.id);
        const toastId = toast.loading(`Generating GST Tax Invoice #${inv.invoice_number || inv.id}...`);
        try {
            let receiptData = null;
            if (inv.id) {
                const res = await billingApi.getPaymentReceiptByInvoice(inv.id, token);
                if (res.ok && (res.data?.data || res.data)) {
                    receiptData = res.data?.data || res.data;
                }
            }
            if (!receiptData && inv.ticket_id) {
                const res = await billingApi.getPaymentReceiptByTicket(inv.ticket_id, token);
                if (res.ok && (res.data?.data || res.data)) {
                    receiptData = res.data?.data || res.data;
                }
            }
            if (!receiptData) {
                receiptData = {
                    receiptNumber: inv.invoice_number || `INV-${inv.id}`,
                    invoiceId: String(inv.id),
                    ticketId: inv.ticket_id,
                    ticketNumber: inv.ticket_number,
                    billDate: inv.created_at || new Date(),
                    paymentDate: inv.paid_at || new Date(),
                    paymentStatus: (inv.status || 'paid').toLowerCase(),
                    paymentId: inv.payment_reference || `PAY-${inv.id}`,
                    paymentMethod: inv.payment_method || 'Corporate Account',
                    clientType: 'company',
                    customer: {
                        name: inv.company_name || 'Corporate Client',
                        email: inv.company_email || '',
                        companyName: inv.company_name || 'Corporate Client'
                    },
                    lineItems: [
                        {
                            description: inv.issue_description ? `Repair: ${inv.issue_description}` : 'Enterprise Device Repair & Diagnostic Service',
                            quantity: 1,
                            unitPrice: Number(inv.total_amount || 0),
                            total: Number(inv.total_amount || 0)
                        }
                    ],
                    subtotal: Number(inv.total_amount || 0),
                    total: Number(inv.total_amount || 0)
                };
            }
            await downloadPaymentBillPdf(receiptData);
            toast.success(`Invoice #${inv.invoice_number || inv.id} downloaded!`, { id: toastId });
        } catch (err: any) {
            console.error(err);
            toast.error('Failed to generate PDF document.', { id: toastId });
        } finally {
            setDownloadingId(null);
        }
    };

    // Download Payment Receipt for Verified Income Table
    const handleDownloadPaymentReceipt = async (pmt: any) => {
        if (!token || downloadingId) return;
        setDownloadingId(pmt.id);
        const toastId = toast.loading(`Generating verified payment receipt...`);
        try {
            let receiptData = null;
            if (pmt.invoice_id) {
                const res = await billingApi.getPaymentReceiptByInvoice(pmt.invoice_id, token);
                if (res.ok && (res.data?.data || res.data)) {
                    receiptData = res.data?.data || res.data;
                }
            }
            if (!receiptData && pmt.ticket_id) {
                const res = await billingApi.getPaymentReceiptByTicket(pmt.ticket_id, token);
                if (res.ok && (res.data?.data || res.data)) {
                    receiptData = res.data?.data || res.data;
                }
            }
            if (!receiptData) {
                receiptData = {
                    receiptNumber: pmt.payment_number || `REC-${pmt.id}`,
                    invoiceId: pmt.invoice_id ? String(pmt.invoice_id) : null,
                    ticketId: pmt.ticket_id,
                    ticketNumber: pmt.ticket_number,
                    billDate: pmt.paid_at || new Date(),
                    paymentDate: pmt.paid_at || new Date(),
                    paymentStatus: 'paid',
                    paymentId: (pmt.payment_method || '').toLowerCase() === 'cash'
                        ? (pmt.payment_id || pmt.payment_number || `PAY-CASH-${pmt.id}`)
                        : (pmt.transaction_id || pmt.payment_id || `TXN-${pmt.id}`),
                    paymentMethod: pmt.payment_method || 'Online Settlement',
                    clientType: 'company',
                    customer: {
                        name: pmt.company_name || 'Corporate Client',
                        email: pmt.company_email || '',
                        companyName: pmt.company_name || 'Corporate Client'
                    },
                    lineItems: [
                        {
                            description: pmt.device_brand ? `Repair Settlement: ${pmt.device_brand} ${pmt.device_model || ''}` : 'Corporate Device Repair Settlement',
                            quantity: 1,
                            unitPrice: Number(pmt.amount || 0),
                            total: Number(pmt.amount || 0)
                        }
                    ],
                    subtotal: Number(pmt.amount || 0),
                    total: Number(pmt.amount || 0)
                };
            }
            await downloadPaymentBillPdf(receiptData);
            toast.success(`Receipt downloaded successfully!`, { id: toastId });
        } catch (err: any) {
            console.error(err);
            toast.error('Failed to generate receipt PDF.', { id: toastId });
        } finally {
            setDownloadingId(null);
        }
    };

    const rawDevices = selectedCompany?.devices || [];
    const filteredDevices = rawDevices.filter((dev: any) => {
        if (!deviceSearch) return true;
        const q = deviceSearch.toLowerCase();
        return (
            (dev.brand && dev.brand.toLowerCase().includes(q)) ||
            (dev.model && dev.model.toLowerCase().includes(q)) ||
            (dev.model_number && dev.model_number.toLowerCase().includes(q)) ||
            (dev.serial_number && dev.serial_number.toLowerCase().includes(q)) ||
            (dev.asset_id && dev.asset_id.toLowerCase().includes(q)) ||
            (dev.employee_name && dev.employee_name.toLowerCase().includes(q)) ||
            (dev.branch_name && dev.branch_name.toLowerCase().includes(q))
        );
    });

    // Counts for Selected Company Ticket Status Tabs
    const companyTicketCounts = useMemo(() => {
        const counts: Record<string, number> = {
            all: companyTickets.length,
            approval_budget: 0,
            pending: 0,
            in_progress: 0,
            completed: 0,
            delivered: 0,
            cancelled: 0,
        };
        for (const rep of companyTickets) {
            const st = (rep.status || '').toLowerCase();
            if (counts[st] !== undefined) {
                counts[st]++;
            }
            const isPendingApproval = (rep.customer_approval_status === 'pending_approval' || rep.customerApprovalStatus === 'pending_approval') &&
                (Number(rep.estimated_cost || rep.estimatedCost || 0) > 0 || Number(rep.repair_cost || rep.repairCost || 0) > 0) &&
                !['completed', 'cancelled', 'delivered'].includes(st);
            if (isPendingApproval) {
                counts.approval_budget++;
            }
        }
        return counts;
    }, [companyTickets]);

    // Filtered Tickets for Selected Company (Client-side fallback for instant responsiveness & budget filtering)
    const filteredCompanyTickets = useMemo(() => {
        return companyTickets.filter((t: any) => {
            const status = (t.status || '').toLowerCase();
            if (ticketStatusFilter === 'approval_budget' || ticketStatusFilter === 'pending_approval') {
                const isPendingApproval = (t.customer_approval_status === 'pending_approval' || t.customerApprovalStatus === 'pending_approval') &&
                    (Number(t.estimated_cost || t.estimatedCost || 0) > 0 || Number(t.repair_cost || t.repairCost || 0) > 0) &&
                    !['completed', 'cancelled', 'delivered'].includes(status);
                if (!isPendingApproval) return false;
            } else if (ticketStatusFilter !== 'all' && ticketStatusFilter !== '') {
                if (status !== ticketStatusFilter.toLowerCase()) return false;
            }

            if (ticketSearch.trim()) {
                const q = ticketSearch.toLowerCase().trim();
                const ticketNo = String(t.ticket_number || t.ticketNumber || t.id || '').toLowerCase();
                const brand = String(t.brand || t.device_brand || '').toLowerCase();
                const model = String(t.model || t.model_number || t.modelNumber || t.device_model || '').toLowerCase();
                const serial = String(t.serial_number || t.device_serial || t.asset_tag || t.asset_id || '').toLowerCase();
                const emp = String(t.employee_name || t.employeeName || t.customer_name || t.customerName || '').toLowerCase();
                const desc = String(t.issue_description || t.problem_description || t.problemDescription || '').toLowerCase();
                const branch = String(t.branch_name || t.branchName || '').toLowerCase();

                const matchSearch = ticketNo.includes(q) ||
                    brand.includes(q) ||
                    model.includes(q) ||
                    serial.includes(q) ||
                    emp.includes(q) ||
                    desc.includes(q) ||
                    branch.includes(q);
                if (!matchSearch) return false;
            }

            return true;
        });
    }, [companyTickets, ticketStatusFilter, ticketSearch]);

    // Status Tabs Definition for Selected Company Tickets
    const companyTicketTabs = [
        { id: 'all', label: 'All', count: companyTicketCounts.all },
        {
            id: 'approval_budget',
            label: `Approval Budget${companyTicketCounts.approval_budget > 0 ? ` (${companyTicketCounts.approval_budget})` : ''}`,
            count: companyTicketCounts.approval_budget,
            highlight: companyTicketCounts.approval_budget > 0
        },
        { id: 'pending', label: 'Pending', count: companyTicketCounts.pending },
        { id: 'in_progress', label: 'In Progress', count: companyTicketCounts.in_progress },
        { id: 'completed', label: 'Completed', count: companyTicketCounts.completed },
        { id: 'delivered', label: 'Delivered', count: companyTicketCounts.delivered },
        { id: 'cancelled', label: 'Cancelled', count: companyTicketCounts.cancelled },
    ];

    if (workspaceTicket) {
        return (
            <div className="space-y-6 pb-20">
                <RepairTicketWorkspace
                    ticket={workspaceTicket}
                    role="admin"
                    technicians={technicians as any}
                    onBack={handleCloseTicketWorkspace}
                    onRefresh={() => {
                        if (workspaceTicket?.id && token) {
                            repairApi.getRequestById(token, workspaceTicket.id).then(res => {
                                if (res.ok && res.data?.data) {
                                    setWorkspaceTicket(res.data.data);
                                }
                            });
                        }
                        if (selectedCompany) {
                            loadCompanyDrilldown(selectedCompany.id);
                        }
                        fetchCorporateRepairs();
                    }}
                    onRequestUpdated={(updated: any) => {
                        setWorkspaceTicket((prev: any) => prev ? ({ ...prev, ...updated }) : null);
                        setCompanyTickets(prev => prev.map(item => item.id === updated.id ? { ...item, ...updated } : item));
                        setAllCorporateRepairs(prev => prev.map(item => item.id === updated.id ? { ...item, ...updated } : item));
                    }}
                    onDelete={async () => {
                        if (!token || !workspaceTicket) return;
                        if (!window.confirm('Are you sure you want to delete this repair ticket?')) return;
                        try {
                            const res = await repairApi.deleteRequest(token, workspaceTicket.id);
                            if (res.ok) {
                                toast.success('Repair ticket deleted successfully');
                                handleCloseTicketWorkspace();
                            } else {
                                toast.error(res.error || 'Failed to delete ticket');
                            }
                        } catch (e) {
                            toast.error('Error deleting ticket');
                        }
                    }}
                    onImagePreview={(src, alt) => setPreviewImage({ src, alt })}
                />

                {/* Lightbox Image Preview Modal */}
                <ImagePreviewModal
                    isOpen={Boolean(previewImage)}
                    onClose={() => setPreviewImage(null)}
                    src={previewImage?.src || ''}
                    alt={previewImage?.alt || 'Attachment Preview'}
                />

                {/* Device Repair History Modal */}
                {historyModalDeviceId && (
                    <DeviceRepairHistoryModal
                        deviceId={historyModalDeviceId}
                        onClose={() => setHistoryModalDeviceId(null)}
                    />
                )}
            </div>
        );
    }

    if (workspaceLoading && !workspaceTicket) {
        return (
            <div className="space-y-8 pb-16">
                <div className="py-24 text-center space-y-3 bg-[#0a0a0a] border border-zinc-900/90 rounded-2xl p-8 shadow-xl max-w-xl mx-auto my-12">
                    <RefreshCw size={32} className="animate-spin mx-auto text-neon-cyan" />
                    <p className="text-zinc-200 font-mono text-sm font-semibold">Opening Complete Repair Ticket Details...</p>
                    <p className="text-zinc-500 text-xs">Retrieving corporate client information, hardware fleet identification, technician diagnosis, and invoice data.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-16">
            {/* ── BREADCRUMB & HEADER ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 mb-1">
                        <span>Admin</span>
                        <span>/</span>
                        <button
                            onClick={handleBackToOverview}
                            className={`hover:text-neon-cyan transition-colors ${selectedCompany ? 'text-zinc-400' : 'text-neon-cyan font-semibold'}`}
                        >
                            Companies
                        </button>
                        {selectedCompany && (
                            <>
                                <span>/</span>
                                <span className="text-neon-cyan font-semibold truncate max-w-[200px]">
                                    {selectedCompany.name}
                                </span>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center text-neon-cyan shadow-lg shadow-neon-cyan/5">
                            <Building2 size={22} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold font-outfit text-white tracking-tight">
                                {selectedCompany ? selectedCompany.name : 'B2B Company Management'}
                            </h1>
                            <p className="text-xs text-zinc-400">
                                {selectedCompany
                                    ? `Corporate repairs, assigned technicians, and operational drilldown`
                                    : `Executive overview of registered corporate accounts, verified revenue, and repair operations`}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-2.5">
                    {selectedCompany ? (
                        <button
                            onClick={handleBackToOverview}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 text-xs font-medium transition-all shadow-sm cursor-pointer"
                        >
                            <ArrowLeft size={14} />
                            <span>Back to All Companies</span>
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={() => { fetchStats(); fetchCompanies(); }}
                                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs font-medium transition-all cursor-pointer"
                                title="Refresh data"
                            >
                                <RefreshCw size={14} className={companiesLoading || statsLoading ? 'animate-spin' : ''} />
                                <span className="hidden sm:inline">Refresh</span>
                            </button>
                            <button
                                onClick={handleOpenRegisterModal}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-neon-cyan to-blue-600 text-black font-semibold text-xs transition-all hover:shadow-lg hover:shadow-neon-cyan/20 hover:brightness-110 active:scale-[0.98] cursor-pointer"
                            >
                                <Plus size={15} />
                                <span>Register New Company</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ── CONDITIONAL VIEW: OVERVIEW vs DRILLDOWN ── */}
            {!selectedCompany ? (
                /* ══════════════════════════════════════════════════════════
                   VIEW 1: EXECUTIVE OVERVIEW & ALL COMPANIES TABLE
                   ══════════════════════════════════════════════════════════ */
                <div className="space-y-8">
                    {/* Top KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* 1. Total Companies */}
                        <div
                            onClick={() => handleSelectOverviewTab('clients')}
                            className={`relative p-5 rounded-2xl bg-[#0a0a0a] border shadow-xl overflow-hidden group transition-all cursor-pointer ${
                                activeOverviewTab === 'clients'
                                    ? 'border-neon-cyan/60 ring-2 ring-neon-cyan/20 shadow-neon-cyan/5 bg-zinc-950/90'
                                    : 'border-zinc-900/90 hover:border-zinc-800'
                            }`}
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-neon-cyan/5 rounded-full blur-2xl group-hover:bg-neon-cyan/10 transition-all pointer-events-none" />
                            <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Corporate Clients</div>
                                        {activeOverviewTab === 'clients' && (
                                            <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30">Active</span>
                                        )}
                                    </div>
                                    <div className="text-3xl font-extrabold font-outfit text-white">
                                        {statsLoading ? '—' : stats?.totalCompanies ?? 0}
                                    </div>
                                </div>
                                <div className={`p-2.5 rounded-xl border transition-all ${
                                    activeOverviewTab === 'clients' ? 'bg-neon-cyan/20 border-neon-cyan/40 text-neon-cyan scale-105' : 'bg-neon-cyan/10 border-neon-cyan/20 text-neon-cyan group-hover:scale-105'
                                }`}>
                                    <Building2 size={20} />
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-zinc-900 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5 text-emerald-400">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <span>{stats?.activeCompanies ?? 0} Active</span>
                                </div>
                                <span className={`transition-colors ${activeOverviewTab === 'clients' ? 'text-neon-cyan font-medium' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                                    {activeOverviewTab === 'clients' ? 'Viewing Clients' : 'View Clients →'}
                                </span>
                            </div>
                        </div>

                        {/* 2. Total Verified Revenue */}
                        <div
                            onClick={() => handleSelectOverviewTab('income')}
                            className={`relative p-5 rounded-2xl bg-[#0a0a0a] border shadow-xl overflow-hidden group transition-all cursor-pointer ${
                                activeOverviewTab === 'income'
                                    ? 'border-emerald-500/60 ring-2 ring-emerald-500/20 shadow-emerald-500/5 bg-zinc-950/90'
                                    : 'border-zinc-900/90 hover:border-zinc-800'
                            }`}
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all pointer-events-none" />
                            <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Verified Income</div>
                                        {activeOverviewTab === 'income' && (
                                            <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Active</span>
                                        )}
                                    </div>
                                    <div className="text-3xl font-extrabold font-outfit text-emerald-400">
                                        {statsLoading ? '—' : formatINR(stats?.totalCompanyIncome)}
                                    </div>
                                </div>
                                <div className={`p-2.5 rounded-xl border transition-all ${
                                    activeOverviewTab === 'income' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 scale-105' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 group-hover:scale-105'
                                }`}>
                                    <DollarSign size={20} />
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-400">
                                <span>{stats?.totalPaidPaymentsCount ?? 0} Completed</span>
                                <span className={`transition-colors ${activeOverviewTab === 'income' ? 'text-emerald-400 font-medium' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                                    {activeOverviewTab === 'income' ? 'Viewing Income' : 'View Income →'}
                                </span>
                            </div>
                        </div>

                        {/* 3. Company Repair Tickets */}
                        <div
                            onClick={() => handleSelectOverviewTab('repairs')}
                            className={`relative p-5 rounded-2xl bg-[#0a0a0a] border shadow-xl overflow-hidden group transition-all cursor-pointer ${
                                activeOverviewTab === 'repairs'
                                    ? 'border-blue-500/60 ring-2 ring-blue-500/20 shadow-blue-500/5 bg-zinc-950/90'
                                    : 'border-zinc-900/90 hover:border-zinc-800'
                            }`}
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all pointer-events-none" />
                            <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Corporate Repairs</div>
                                        {activeOverviewTab === 'repairs' && (
                                            <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Active</span>
                                        )}
                                    </div>
                                    <div className="text-3xl font-extrabold font-outfit text-white">
                                        {statsLoading ? '—' : stats?.totalCompanyTickets ?? 0}
                                    </div>
                                </div>
                                <div className={`p-2.5 rounded-xl border transition-all ${
                                    activeOverviewTab === 'repairs' ? 'bg-blue-500/20 border-blue-500/40 text-blue-400 scale-105' : 'bg-blue-500/10 border-blue-500/20 text-blue-400 group-hover:scale-105'
                                }`}>
                                    <Wrench size={20} />
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-zinc-900 flex items-center justify-between text-xs">
                                <span className="text-amber-400 flex items-center gap-1">
                                    <Clock size={12} />
                                    <span>{stats?.statusCounts?.open ?? 0} Open Tickets</span>
                                </span>
                                <span className={`transition-colors ${activeOverviewTab === 'repairs' ? 'text-blue-400 font-medium' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                                    {activeOverviewTab === 'repairs' ? 'Viewing Repairs' : 'View Repairs →'}
                                </span>
                            </div>
                        </div>

                        {/* 4. Corporate Invoices */}
                        <div
                            onClick={() => handleSelectOverviewTab('invoices')}
                            className={`relative p-5 rounded-2xl bg-[#0a0a0a] border shadow-xl overflow-hidden group transition-all cursor-pointer ${
                                activeOverviewTab === 'invoices'
                                    ? 'border-purple-500/60 ring-2 ring-purple-500/20 shadow-purple-500/5 bg-zinc-950/90'
                                    : 'border-zinc-900/90 hover:border-zinc-800'
                            }`}
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-all pointer-events-none" />
                            <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Corporate Invoices</div>
                                        {activeOverviewTab === 'invoices' && (
                                            <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">Active</span>
                                        )}
                                    </div>
                                    <div className="text-3xl font-extrabold font-outfit text-white">
                                        {statsLoading ? '—' : stats?.invoices?.total ?? 0}
                                    </div>
                                </div>
                                <div className={`p-2.5 rounded-xl border transition-all ${
                                    activeOverviewTab === 'invoices' ? 'bg-purple-500/20 border-purple-500/40 text-purple-400 scale-105' : 'bg-purple-500/10 border-purple-500/20 text-purple-400 group-hover:scale-105'
                                }`}>
                                    <Receipt size={20} />
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-zinc-900 flex items-center justify-between text-xs">
                                <span className="text-emerald-400">{stats?.invoices?.paid ?? 0} Paid</span>
                                <span className={`transition-colors ${activeOverviewTab === 'invoices' ? 'text-purple-400 font-medium' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                                    {activeOverviewTab === 'invoices' ? 'Viewing Invoices' : 'View Invoices →'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Infrastructure Summary Banner */}
                    <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-900 flex flex-wrap items-center justify-between gap-4 text-xs">
                        <div className="flex items-center gap-2 text-zinc-400">
                            <Sparkles size={16} className="text-neon-cyan shrink-0" />
                            <span className="font-medium text-zinc-300">Corporate Infrastructure Pool:</span>
                            <span className="text-zinc-500">Across all registered corporate workspaces</span>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <Laptop size={14} className="text-cyan-400" />
                                <span className="text-zinc-400">Registered Devices:</span>
                                <span className="font-mono font-bold text-white">{stats?.infrastructure?.totalDevices ?? 0}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Building2 size={14} className="text-indigo-400" />
                                <span className="text-zinc-400">Branches:</span>
                                <span className="font-mono font-bold text-white">{stats?.infrastructure?.totalBranches ?? 0}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Users size={14} className="text-emerald-400" />
                                <span className="text-zinc-400">Staff Members:</span>
                                <span className="font-mono font-bold text-white">{stats?.infrastructure?.totalEmployees ?? 0}</span>
                            </div>
                        </div>
                    </div>

                    {/* ── SECTION SWITCHER TABS ── */}
                    {/* <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-900 pb-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => handleSelectOverviewTab('clients')}
                                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                    activeOverviewTab === 'clients'
                                        ? 'bg-neon-cyan/15 border border-neon-cyan/40 text-neon-cyan shadow-sm shadow-neon-cyan/10'
                                        : 'bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'
                                }`}
                            >
                                <Building2 size={14} />
                                <span>Corporate Clients</span>
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-300">
                                    {stats?.totalCompanies ?? totalCompaniesCount}
                                </span>
                            </button>

                            <button
                                onClick={() => handleSelectOverviewTab('income')}
                                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                    activeOverviewTab === 'income'
                                        ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shadow-sm shadow-emerald-500/10'
                                        : 'bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'
                                }`}
                            >
                                <DollarSign size={14} />
                                <span>Verified Income</span>
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 font-bold">
                                    {formatINR(stats?.totalCompanyIncome)}
                                </span>
                            </button>

                            <button
                                onClick={() => handleSelectOverviewTab('repairs')}
                                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                    activeOverviewTab === 'repairs'
                                        ? 'bg-blue-500/15 border border-blue-500/40 text-blue-400 shadow-sm shadow-blue-500/10'
                                        : 'bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'
                                }`}
                            >
                                <Wrench size={14} />
                                <span>Corporate Repairs</span>
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-300">
                                    {stats?.totalCompanyTickets ?? 0}
                                </span>
                            </button>

                            <button
                                onClick={() => handleSelectOverviewTab('invoices')}
                                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                    activeOverviewTab === 'invoices'
                                        ? 'bg-purple-500/15 border border-purple-500/40 text-purple-400 shadow-sm shadow-purple-500/10'
                                        : 'bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'
                                }`}
                            >
                                <Receipt size={14} />
                                <span>Corporate Invoices</span>
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-300">
                                    {stats?.invoices?.total ?? 0}
                                </span>
                            </button>
                        </div>
                    </div> */}

                    {/* ── TAB 1: CORPORATE CLIENTS OVERVIEW TABLE ── */}
                    {activeOverviewTab === 'clients' && (
                        <div className="bg-[#0a0a0a] border border-zinc-900/90 rounded-2xl overflow-hidden shadow-xl">
                        {/* Table Controls Header */}
                        <div className="p-4 border-b border-zinc-900/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                            <div className="relative flex-1 max-w-md">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder="Search by Company ID (TD-C001, TD-AMC-C001), name, contact, email..."
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    className="w-full pl-9 pr-3 py-2 bg-zinc-900/70 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-neon-cyan/40 transition-colors"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="flex bg-zinc-900/80 p-1 rounded-xl border border-zinc-800/80 text-xs">
                                    <button
                                        onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
                                        className={`px-3 py-1 rounded-lg font-medium transition-all ${statusFilter === 'all' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400 hover:text-white'}`}
                                    >
                                        All ({totalCompaniesCount})
                                    </button>
                                    <button
                                        onClick={() => { setStatusFilter('active'); setCurrentPage(1); }}
                                        className={`px-3 py-1 rounded-lg font-medium transition-all ${statusFilter === 'active' ? 'bg-emerald-500/20 text-emerald-400 font-semibold' : 'text-zinc-400 hover:text-white'}`}
                                    >
                                        Active
                                    </button>
                                    <button
                                        onClick={() => { setStatusFilter('inactive'); setCurrentPage(1); }}
                                        className={`px-3 py-1 rounded-lg font-medium transition-all ${statusFilter === 'inactive' ? 'bg-rose-500/20 text-rose-400 font-semibold' : 'text-zinc-400 hover:text-white'}`}
                                    >
                                        Suspended
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[860px] text-left border-collapse text-xs">
                                <thead>
                                    <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                                        <th className="py-3 px-4">Company</th>
                                        <th className="py-3 px-4">Contact Person</th>
                                        <th className="py-3 px-4">Infrastructure</th>
                                        <th className="py-3 px-4">Repair Tickets</th>
                                        <th className="py-3 px-4">Verified Income</th>
                                        <th className="py-3 px-4">Invoices</th>
                                        <th className="py-3 px-4">Status</th>
                                        <th className="py-3 px-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900/70">
                                    {companiesLoading ? (
                                        <tr>
                                            <td colSpan={8} className="py-12 text-center text-zinc-500">
                                                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-neon-cyan" />
                                                <span>Loading company directory...</span>
                                            </td>
                                        </tr>
                                    ) : companies.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="py-12 text-center text-zinc-500">
                                                <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                                                <p className="text-zinc-400 font-medium">No companies found</p>
                                                <p className="text-[11px] text-zinc-600 mt-1">Try adjusting your search or filters</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        companies.map((comp) => {
                                            const isActive = Boolean(comp.is_active);
                                            const openTickets = Number(comp.active_repairs || 0);
                                            const totalRepairs = Number(comp.total_repairs || 0);
                                            const paidAmount = parseFloat(comp.total_paid_amount || 0);

                                            return (
                                                <tr
                                                    key={comp.id}
                                                    className="group hover:bg-zinc-900/40 transition-colors cursor-pointer"
                                                    onClick={() => handleSelectCompany(comp)}
                                                >
                                                    {/* Company Name & Email */}
                                                    <td className="py-3.5 px-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/50 flex items-center justify-center font-bold text-neon-cyan font-outfit uppercase shrink-0 group-hover:border-neon-cyan/40 transition-colors">
                                                                {comp.name?.charAt(0) || 'C'}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="font-semibold text-white group-hover:text-neon-cyan transition-colors flex items-center gap-1.5 flex-wrap">
                                                                    <span className="truncate">{comp.name}</span>
                                                                    {(comp.permanent_company_id || comp.company_id) && (
                                                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold shrink-0">
                                                                            {comp.permanent_company_id || comp.company_id}
                                                                        </span>
                                                                    )}
                                                                    <ChevronRight size={13} className="text-zinc-600 group-hover:text-neon-cyan transition-colors opacity-0 group-hover:opacity-100" />
                                                                </div>
                                                                <div className="text-[11px] text-zinc-500 truncate">{comp.email}</div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Contact Person */}
                                                    <td className="py-3.5 px-4">
                                                        <div className="text-zinc-300 font-medium">
                                                            {comp.contact_person || '—'}
                                                        </div>
                                                        <div className="text-[11px] text-zinc-500 font-mono">
                                                            {comp.phone || 'No phone'}
                                                        </div>
                                                    </td>

                                                    {/* Infrastructure */}
                                                    <td className="py-3.5 px-4">
                                                        <div className="flex items-center gap-2 text-zinc-400">
                                                            <span title="Devices" className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                                                                <Laptop size={11} className="text-cyan-400" />
                                                                <span className="font-mono text-zinc-200">{comp.total_devices || 0}</span>
                                                            </span>
                                                            <span title="Branches" className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                                                                <Building2 size={11} className="text-indigo-400" />
                                                                <span className="font-mono text-zinc-200">{comp.total_branches || 0}</span>
                                                            </span>
                                                            <span title="Employees" className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                                                                <Users size={11} className="text-emerald-400" />
                                                                <span className="font-mono text-zinc-200">{comp.total_employees || 0}</span>
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Repair Tickets */}
                                                    <td className="py-3.5 px-4">
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-1 font-mono text-xs">
                                                                <span className="font-bold text-white">{comp.total_tickets ?? totalRepairs}</span>
                                                                <span className="text-zinc-500 text-[10px]">total</span>
                                                            </div>
                                                            <div className="flex items-center gap-1 font-mono text-[9px]">
                                                                <span className={`px-1.5 py-0.2 rounded font-semibold ${Number(comp.active_tickets || openTickets || 0) > 0 ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-zinc-900 text-zinc-500'}`} title="Active Tickets">
                                                                    {comp.active_tickets || openTickets || 0} active
                                                                </span>
                                                                <span className={`px-1.5 py-0.2 rounded font-semibold ${Number(comp.completed_tickets || comp.completed_repairs || 0) > 0 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-900 text-zinc-500'}`} title="Completed Tickets">
                                                                    {comp.completed_tickets || comp.completed_repairs || 0} done
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Verified Income */}
                                                    <td className="py-3.5 px-4">
                                                        <span className="font-mono font-bold text-emerald-400">
                                                            {paidAmount > 0 ? formatINR(paidAmount) : '₹0'}
                                                        </span>
                                                    </td>

                                                    {/* Invoices */}
                                                    <td className="py-3.5 px-4">
                                                        <div className="flex items-center gap-1.5 text-[11px] font-mono">
                                                            <span className="text-emerald-400" title="Paid Invoices">
                                                                {comp.paid_invoices || 0}P
                                                            </span>
                                                            <span className="text-zinc-600">/</span>
                                                            <span className={Number(comp.unpaid_invoices || 0) > 0 ? 'text-rose-400 font-bold' : 'text-zinc-500'} title="Unpaid Invoices">
                                                                {comp.unpaid_invoices || 0}U
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Status */}
                                                    <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => handleToggleStatus(comp.id, isActive, comp.name)}
                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${isActive
                                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30'
                                                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30'
                                                                }`}
                                                            title="Click to toggle active status"
                                                        >
                                                            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                                            <span>{isActive ? 'Active' : 'Suspended'}</span>
                                                        </button>
                                                    </td>

                                                    {/* Actions */}
                                                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => handleSelectCompany(comp)}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-neon-cyan/10 hover:text-neon-cyan border border-zinc-800 hover:border-neon-cyan/30 text-zinc-300 text-xs font-medium transition-all cursor-pointer"
                                                        >
                                                            <span>Details</span>
                                                            <ChevronRight size={13} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="p-4 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-400">
                                <div>
                                    Showing page <span className="font-mono text-white">{currentPage}</span> of <span className="font-mono text-white">{totalPages}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        disabled={currentPage <= 1}
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 disabled:opacity-40 hover:text-white transition-colors cursor-pointer"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        disabled={currentPage >= totalPages}
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 disabled:opacity-40 hover:text-white transition-colors cursor-pointer"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    )}

                    {/* ══════════════════════════════════════════════════════════
                       TAB 2: VERIFIED CORPORATE INCOME & TRANSACTION LEDGER
                       ══════════════════════════════════════════════════════════ */}
                    {activeOverviewTab === 'income' && (
                        <div className="space-y-6">
                            {/* Company-wise Verified Breakdown Strip */}
                            <div className="bg-[#0a0a0a] border border-zinc-900/90 rounded-2xl p-5 shadow-xl">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-900">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                                            <DollarSign size={16} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold font-outfit text-white">Company-Wise Verified Income Breakdown</h3>
                                            <p className="text-[11px] text-zinc-500">
                                                Actual verified revenue collected per corporate client (strictly paid & settled transactions)
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-xs">
                                        <div className="px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-semibold">
                                            Total Verified: {formatINR(paymentTotalSummary?.total_verified_income ?? stats?.totalCompanyIncome)}
                                        </div>
                                        <div className="text-zinc-500 font-mono">
                                            {paymentTotalSummary?.total_transactions ?? stats?.totalPaidPaymentsCount ?? 0} Transactions
                                        </div>
                                    </div>
                                </div>

                                {paymentSummaries.length === 0 ? (
                                    <div className="text-center py-6 text-xs text-zinc-500">
                                        No verified corporate payments recorded yet.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                        {paymentSummaries.map((cs: any) => (
                                            <div
                                                key={cs.company_id}
                                                onClick={() => {
                                                    setIncomeCompanyFilter(incomeCompanyFilter === String(cs.company_id) ? 'all' : String(cs.company_id));
                                                    setIncomePage(1);
                                                }}
                                                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                                                    incomeCompanyFilter === String(cs.company_id)
                                                        ? 'bg-emerald-500/10 border-emerald-500/40 ring-1 ring-emerald-500/30'
                                                        : 'bg-zinc-950/60 border-zinc-900 hover:border-zinc-800'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-semibold text-white truncate hover:text-neon-cyan" title={cs.company_name}>
                                                            {cs.company_name}
                                                        </div>
                                                        <div className="text-[11px] text-zinc-500 truncate">{cs.company_email}</div>
                                                    </div>
                                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 shrink-0">
                                                        {cs.successful_payments_count} txns
                                                    </span>
                                                </div>
                                                <div className="mt-2.5 pt-2 border-t border-zinc-900 flex items-center justify-between text-xs">
                                                    <span className="text-[11px] text-zinc-500">Verified Paid:</span>
                                                    <span className="font-mono font-bold text-emerald-400">{formatINR(cs.total_verified_amount)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Verified Payments Ledger Table */}
                            <div className="bg-[#0a0a0a] border border-zinc-900/90 rounded-2xl overflow-hidden shadow-xl">
                                {/* Filters Bar */}
                                <div className="p-4 border-b border-zinc-900/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                                    <div className="relative flex-1 max-w-md">
                                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                                        <input
                                            type="text"
                                            placeholder="Search ticket #, invoice #, transaction ID, device..."
                                            value={incomeSearch}
                                            onChange={(e) => {
                                                setIncomeSearch(e.target.value);
                                                setIncomePage(1);
                                            }}
                                            className="w-full pl-9 pr-3 py-2 bg-zinc-900/70 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/40 transition-colors"
                                        />
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        {/* Company Filter Dropdown */}
                                        <select
                                            value={incomeCompanyFilter}
                                            onChange={(e) => {
                                                setIncomeCompanyFilter(e.target.value);
                                                setIncomePage(1);
                                            }}
                                            className="px-3 py-2 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-emerald-500/40 cursor-pointer max-w-[180px]"
                                        >
                                            <option value="all">All Corporate Clients</option>
                                            {companyDropdownList.map((c) => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>

                                        {/* Date Range Start & End */}
                                        <div className="flex items-center gap-1.5 bg-zinc-900/80 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-400">
                                            <Calendar size={13} className="text-zinc-500" />
                                            <input
                                                type="date"
                                                value={incomeStartDate}
                                                onChange={(e) => { setIncomeStartDate(e.target.value); setIncomePage(1); }}
                                                className="bg-transparent text-zinc-300 text-xs focus:outline-none"
                                                title="Start Date"
                                            />
                                            <span className="text-zinc-600">to</span>
                                            <input
                                                type="date"
                                                value={incomeEndDate}
                                                onChange={(e) => { setIncomeEndDate(e.target.value); setIncomePage(1); }}
                                                className="bg-transparent text-zinc-300 text-xs focus:outline-none"
                                                title="End Date"
                                            />
                                            {(incomeStartDate || incomeEndDate) && (
                                                <button
                                                    onClick={() => { setIncomeStartDate(''); setIncomeEndDate(''); setIncomePage(1); }}
                                                    className="text-zinc-500 hover:text-white p-0.5 cursor-pointer"
                                                    title="Clear date filter"
                                                >
                                                    <X size={12} />
                                                </button>
                                            )}
                                        </div>

                                        <button
                                            onClick={fetchPayments}
                                            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                            title="Refresh payments"
                                        >
                                            <RefreshCw size={14} className={paymentsLoading ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                </div>

                                {/* Table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[760px] text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                                                <th className="py-3.5 px-4">Company</th>
                                                <th className="py-3.5 px-4">Ticket & Device</th>
                                                <th className="py-3.5 px-4">Invoice # / Ref</th>
                                                <th className="py-3.5 px-4">Verified Paid</th>
                                                <th className="py-3.5 px-4">Payment Method</th>
                                                <th className="py-3.5 px-4">Payment Date</th>
                                                <th className="py-3.5 px-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-900/60">
                                            {paymentsLoading ? (
                                                <tr>
                                                    <td colSpan={7} className="py-12 text-center text-zinc-500">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <RefreshCw size={16} className="animate-spin text-emerald-400" />
                                                            <span>Loading verified payment ledger...</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : payments.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} className="py-12 text-center text-zinc-500">
                                                        <div className="max-w-xs mx-auto space-y-2">
                                                            <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center mx-auto text-zinc-600">
                                                                <DollarSign size={20} />
                                                            </div>
                                                            <p className="font-medium text-zinc-400">No verified payments found</p>
                                                            <p className="text-[11px]">Unpaid invoices and pending quotes are strictly excluded from verified income.</p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                payments.map((pmt: any) => (
                                                    <tr key={pmt.id} className="hover:bg-zinc-900/30 transition-colors">
                                                        <td className="py-3.5 px-4">
                                                            <div className="flex items-start gap-2.5">
                                                                <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-xs text-neon-cyan shrink-0">
                                                                    {pmt.company_name?.charAt(0) || 'C'}
                                                                </div>
                                                                <div>
                                                                    <button
                                                                        onClick={() => handleSelectCompanyById(pmt.company_id, pmt.company_name)}
                                                                        className="font-semibold text-white hover:text-neon-cyan transition-colors text-left cursor-pointer"
                                                                    >
                                                                        {pmt.company_name}
                                                                    </button>
                                                                    <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
                                                                        {pmt.branch_name && <span>{pmt.branch_name}</span>}
                                                                        {pmt.branch_name && pmt.employee_name && <span>•</span>}
                                                                        {pmt.employee_name && <span>{pmt.employee_name}</span>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <div className="space-y-0.5">
                                                                <div className="font-mono font-semibold text-zinc-200">
                                                                    {pmt.ticket_number ? `#${pmt.ticket_number}` : (pmt.ticket_id ? `#TKT-${pmt.ticket_id}` : 'Direct')}
                                                                </div>
                                                                <div className="text-zinc-400 text-[11px]">
                                                                    {pmt.device_brand || ''} {pmt.device_model || 'Enterprise Equipment'}
                                                                </div>
                                                                {(pmt.asset_id || pmt.serial_number) && (
                                                                    <div className="text-[10px] font-mono text-zinc-500">
                                                                        {pmt.asset_id ? `Asset: ${pmt.asset_id}` : `S/N: ${pmt.serial_number}`}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <div className="space-y-0.5">
                                                                <div className="font-mono text-zinc-300">
                                                                    {pmt.invoice_number ? `#${pmt.invoice_number}` : '—'}
                                                                </div>
                                                                <div className="text-[10px] font-mono text-zinc-500 truncate max-w-[140px]" title={pmt.transaction_id}>
                                                                    {pmt.transaction_id ? `Ref: ${pmt.transaction_id}` : (pmt.payment_number || 'Completed')}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <div className="font-mono font-bold text-emerald-400 text-sm">
                                                                {formatINR(pmt.amount)}
                                                            </div>
                                                            <div className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                                <ShieldCheck size={10} />
                                                                <span>Verified</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <span className="capitalize text-zinc-300 font-medium">
                                                                {pmt.payment_method || 'Online'}
                                                            </span>
                                                        </td>
                                                        <td className="py-3.5 px-4 text-zinc-400 font-mono text-[11px]">
                                                            {pmt.paid_at ? new Date(pmt.paid_at).toLocaleDateString('en-IN', {
                                                                day: '2-digit', month: 'short', year: 'numeric'
                                                            }) : '—'}
                                                        </td>
                                                        <td className="py-3.5 px-4 text-right">
                                                            <div className="inline-flex items-center gap-1.5 justify-end">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setModalInvoiceId(pmt.invoice_id || null);
                                                                        setModalTicketId(pmt.ticket_id || null);
                                                                        setReceiptModalOpen(true);
                                                                    }}
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neon-cyan/10 hover:bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/25 text-xs font-medium transition-colors cursor-pointer"
                                                                    title="View Payment Receipt Statement"
                                                                >
                                                                    <Receipt size={12} />
                                                                    <span>View</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handlePrintPaymentReceipt(pmt)}
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-medium transition-colors cursor-pointer"
                                                                    title="Print Official Payment Receipt"
                                                                >
                                                                    <Printer size={12} />
                                                                    <span>Print</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDownloadPaymentReceipt(pmt)}
                                                                    disabled={downloadingId === pmt.id}
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-medium transition-colors cursor-pointer"
                                                                    title="Download Official Receipt PDF"
                                                                >
                                                                    <FileDown size={12} className={downloadingId === pmt.id ? 'animate-bounce text-neon-cyan' : ''} />
                                                                    <span>PDF</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => handleSelectCompanyById(pmt.company_id, pmt.company_name)}
                                                                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-neon-cyan/10 text-zinc-400 hover:text-neon-cyan border border-zinc-800 transition-colors cursor-pointer"
                                                                    title="View Company"
                                                                >
                                                                    <ChevronRight size={14} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Income Pagination */}
                                {incomeTotalPages > 1 && (
                                    <div className="p-4 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-400">
                                        <div>
                                            Showing page <span className="font-mono text-white">{incomePage}</span> of <span className="font-mono text-white">{incomeTotalPages}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                disabled={incomePage <= 1}
                                                onClick={() => setIncomePage(p => Math.max(1, p - 1))}
                                                className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 disabled:opacity-40 hover:text-white transition-colors cursor-pointer"
                                            >
                                                Previous
                                            </button>
                                            <button
                                                disabled={incomePage >= incomeTotalPages}
                                                onClick={() => setIncomePage(p => Math.min(incomeTotalPages, p + 1))}
                                                className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 disabled:opacity-40 hover:text-white transition-colors cursor-pointer"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════════
                       TAB 3: CORPORATE REPAIRS OPERATIONS & TICKETING
                       ══════════════════════════════════════════════════════════ */}
                    {activeOverviewTab === 'repairs' && (
                        <div className="space-y-6">
                            {/* Status Count Chips */}
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                <button
                                    onClick={() => { setRepairStatusFilter('all'); setRepairPage(1); }}
                                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                        repairStatusFilter === 'all'
                                            ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
                                            : 'bg-[#0a0a0a] border-zinc-900 text-zinc-400 hover:border-zinc-800'
                                    }`}
                                >
                                    <div className="text-[11px] font-mono uppercase text-zinc-500">All Corporate</div>
                                    <div className="text-xl font-bold font-mono text-white mt-0.5">{totalCorporateRepairsCount}</div>
                                </button>
                                <button
                                    onClick={() => { setRepairStatusFilter('pending'); setRepairPage(1); }}
                                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                        repairStatusFilter === 'pending'
                                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                                            : 'bg-[#0a0a0a] border-zinc-900 text-zinc-400 hover:border-zinc-800'
                                    }`}
                                >
                                    <div className="text-[11px] font-mono uppercase text-zinc-500">Pending Intake</div>
                                    <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">{stats?.statusCounts?.pending ?? 0}</div>
                                </button>
                                <button
                                    onClick={() => { setRepairStatusFilter('in_progress'); setRepairPage(1); }}
                                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                        repairStatusFilter === 'in_progress'
                                            ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
                                            : 'bg-[#0a0a0a] border-zinc-900 text-zinc-400 hover:border-zinc-800'
                                    }`}
                                >
                                    <div className="text-[11px] font-mono uppercase text-zinc-500">In Progress</div>
                                    <div className="text-xl font-bold font-mono text-blue-400 mt-0.5">{stats?.statusCounts?.inProgress ?? 0}</div>
                                </button>
                                <button
                                    onClick={() => { setRepairStatusFilter('completed'); setRepairPage(1); }}
                                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                        repairStatusFilter === 'completed'
                                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                                            : 'bg-[#0a0a0a] border-zinc-900 text-zinc-400 hover:border-zinc-800'
                                    }`}
                                >
                                    <div className="text-[11px] font-mono uppercase text-zinc-500">Completed</div>
                                    <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">{(stats?.statusCounts?.completed ?? 0) + (stats?.statusCounts?.delivered ?? 0)}</div>
                                </button>
                                <button
                                    onClick={() => { setRepairStatusFilter('cancelled'); setRepairPage(1); }}
                                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                        repairStatusFilter === 'cancelled'
                                            ? 'bg-rose-500/10 border-rose-500/40 text-rose-400'
                                            : 'bg-[#0a0a0a] border-zinc-900 text-zinc-400 hover:border-zinc-800'
                                    }`}
                                >
                                    <div className="text-[11px] font-mono uppercase text-zinc-500">Cancelled</div>
                                    <div className="text-xl font-bold font-mono text-rose-400 mt-0.5">{stats?.statusCounts?.cancelled ?? 0}</div>
                                </button>
                            </div>

                            {/* Corporate Repairs Table */}
                            <div className="bg-[#0a0a0a] border border-zinc-900/90 rounded-2xl overflow-hidden shadow-xl">
                                {/* Filter Bar */}
                                <div className="p-4 border-b border-zinc-900/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                                    <div className="relative flex-1 max-w-md">
                                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                                        <input
                                            type="text"
                                            placeholder="Search ticket #, device, issue, employee..."
                                            value={repairSearch}
                                            onChange={(e) => {
                                                setRepairSearch(e.target.value);
                                                setRepairPage(1);
                                            }}
                                            className="w-full pl-9 pr-3 py-2 bg-zinc-900/70 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/40 transition-colors"
                                        />
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        {/* Company Dropdown */}
                                        <select
                                            value={repairCompanyFilter}
                                            onChange={(e) => {
                                                setRepairCompanyFilter(e.target.value);
                                                setRepairPage(1);
                                            }}
                                            className="px-3 py-2 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-blue-500/40 cursor-pointer max-w-[180px]"
                                        >
                                            <option value="all">All Corporate Clients</option>
                                            {companyDropdownList.map((c) => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>

                                        {/* Status Dropdown */}
                                        <select
                                            value={repairStatusFilter}
                                            onChange={(e) => {
                                                setRepairStatusFilter(e.target.value);
                                                setRepairPage(1);
                                            }}
                                            className="px-3 py-2 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-blue-500/40 cursor-pointer"
                                        >
                                            <option value="all">All Statuses</option>
                                            <option value="pending">Pending</option>
                                            <option value="in_progress">In Progress</option>
                                            <option value="completed">Completed</option>
                                            <option value="delivered">Delivered</option>
                                            <option value="cancelled">Cancelled</option>
                                        </select>

                                        {/* Priority Dropdown */}
                                        <select
                                            value={repairPriorityFilter}
                                            onChange={(e) => {
                                                setRepairPriorityFilter(e.target.value);
                                                setRepairPage(1);
                                            }}
                                            className="px-3 py-2 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-blue-500/40 cursor-pointer"
                                        >
                                            <option value="all">All Priorities</option>
                                            <option value="urgent">Urgent</option>
                                            <option value="high">High</option>
                                            <option value="medium">Medium</option>
                                            <option value="low">Low</option>
                                        </select>

                                        <button
                                            onClick={fetchCorporateRepairs}
                                            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                            title="Refresh repairs"
                                        >
                                            <RefreshCw size={14} className={corporateRepairsLoading ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                </div>

                                {/* Table Body */}
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[760px] text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                                                <th className="py-3.5 px-4">Ticket</th>
                                                <th className="py-3.5 px-4">Company & Branch</th>
                                                <th className="py-3.5 px-4">Device & Problem</th>
                                                <th className="py-3.5 px-4">Priority</th>
                                                <th className="py-3.5 px-4">Status</th>
                                                <th className="py-3.5 px-4">Technician</th>
                                                <th className="py-3.5 px-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-900/60">
                                            {corporateRepairsLoading ? (
                                                <tr>
                                                    <td colSpan={7} className="py-12 text-center text-zinc-500">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <RefreshCw size={16} className="animate-spin text-blue-400" />
                                                            <span>Loading corporate repair tickets...</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : allCorporateRepairs.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} className="py-12 text-center text-zinc-500">
                                                        <div className="max-w-xs mx-auto space-y-2">
                                                            <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center mx-auto text-zinc-600">
                                                                <Wrench size={20} />
                                                            </div>
                                                            <p className="font-medium text-zinc-400">No corporate repairs found</p>
                                                            <p className="text-[11px]">No active or matching repair tickets raised by B2B accounts.</p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                allCorporateRepairs.map((t: any) => (
                                                    <tr key={t.id} className="hover:bg-zinc-900/30 transition-colors">
                                                        <td className="py-3.5 px-4">
                                                            <div 
                                                                onClick={() => handleOpenTicketWorkspace(t)}
                                                                className="font-mono font-bold text-white hover:text-neon-cyan transition-colors cursor-pointer flex items-center gap-1.5"
                                                                title="Open Complete Ticket Workspace"
                                                            >
                                                                <span>{t.ticket_number ? `#${t.ticket_number}` : `#TKT-${t.id}`}</span>
                                                                <Eye size={12} className="opacity-60 hover:opacity-100 text-neon-cyan" />
                                                            </div>
                                                            <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                                                                {t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN', {
                                                                    day: '2-digit', month: 'short'
                                                                }) : '—'}
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <button
                                                                onClick={() => handleSelectCompanyById(t.company_id, t.company_name)}
                                                                className="font-semibold text-white hover:text-neon-cyan transition-colors text-left flex items-center gap-1.5 cursor-pointer"
                                                            >
                                                                <Building2 size={13} className="text-zinc-500 shrink-0" />
                                                                <span>{t.company_name || 'B2B Client'}</span>
                                                            </button>
                                                            <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1">
                                                                <span>{t.branch_name || 'Main Branch'}</span>
                                                                {t.customer_name && <span className="text-zinc-500">({t.customer_name})</span>}
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <div className="space-y-0.5 max-w-xs">
                                                                <div className="font-medium text-zinc-200">
                                                                    {t.device_category ? `${t.device_category} • ` : ''}{t.brand} {t.model}
                                                                </div>
                                                                <div className="text-[11px] text-zinc-400 truncate" title={t.issue_description}>
                                                                    {t.issue_description || 'Device diagnosis required'}
                                                                </div>
                                                                {(t.serial_number || t.asset_tag || t.asset_id) && (
                                                                    <div className="text-[10px] font-mono text-zinc-500">
                                                                        {t.asset_tag || t.asset_id ? `Asset: ${t.asset_tag || t.asset_id}` : `S/N: ${t.serial_number}`}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border capitalize ${getPriorityBadge(t.priority)}`}>
                                                                {t.priority || 'Normal'}
                                                            </span>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border capitalize ${getStatusBadge(t.status)}`}>
                                                                {t.status?.replace('_', ' ')}
                                                            </span>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            {t.assigned_technician_name || t.technician_name ? (
                                                                <div className="flex items-center gap-1.5 text-zinc-300">
                                                                    <UserCog size={13} className="text-neon-cyan" />
                                                                    <span className="font-medium">{t.assigned_technician_name || t.technician_name}</span>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleOpenAssignModal(t)}
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neon-cyan/10 hover:bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30 text-[11px] font-medium transition-colors cursor-pointer"
                                                                >
                                                                    <UserCog size={12} />
                                                                    <span>Assign Tech</span>
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td className="py-3.5 px-4 text-right">
                                                            <div className="inline-flex items-center gap-1.5 justify-end">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setQuickDrawerTicket(t)}
                                                                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 transition-colors cursor-pointer"
                                                                    title="Quick Preview in Drawer"
                                                                >
                                                                    <Eye size={13} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleOpenTicketWorkspace(t)}
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-medium transition-colors cursor-pointer"
                                                                    title="Open Complete Ticket Workspace"
                                                                >
                                                                    <ExternalLink size={12} />
                                                                    <span>Workspace</span>
                                                                </button>
                                                                {t.device_id && (
                                                                    <button
                                                                        onClick={() => setHistoryModalDeviceId(t.device_id)}
                                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 text-xs font-medium transition-colors cursor-pointer"
                                                                        title="View Device Repair History"
                                                                    >
                                                                        <Clock size={12} />
                                                                        <span>History</span>
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => handleOpenAssignModal(t)}
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-medium transition-colors cursor-pointer"
                                                                    title="Assign or reassign technician"
                                                                >
                                                                    <UserCog size={12} />
                                                                    <span>Manage</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => handleSelectCompanyById(t.company_id, t.company_name)}
                                                                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-neon-cyan/10 text-zinc-400 hover:text-neon-cyan border border-zinc-800 transition-colors cursor-pointer"
                                                                    title="View Company"
                                                                >
                                                                    <ChevronRight size={14} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Repair Pagination */}
                                {repairTotalPages > 1 && (
                                    <div className="p-4 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-400">
                                        <div>
                                            Showing page <span className="font-mono text-white">{repairPage}</span> of <span className="font-mono text-white">{repairTotalPages}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                disabled={repairPage <= 1}
                                                onClick={() => setRepairPage(p => Math.max(1, p - 1))}
                                                className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 disabled:opacity-40 hover:text-white transition-colors cursor-pointer"
                                            >
                                                Previous
                                            </button>
                                            <button
                                                disabled={repairPage >= repairTotalPages}
                                                onClick={() => setRepairPage(p => Math.min(repairTotalPages, p + 1))}
                                                className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 disabled:opacity-40 hover:text-white transition-colors cursor-pointer"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════════
                       TAB 4: CORPORATE INVOICES & REVENUE LEDGER
                       ══════════════════════════════════════════════════════════ */}
                    {activeOverviewTab === 'invoices' && (
                        <div className="space-y-6">
                            {/* Core Questions Summary Table: Answers the 3 Essential Questions */}
                            <div className="bg-[#0a0a0a] border border-zinc-900/90 rounded-2xl p-5 shadow-xl">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-900">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                                            <Receipt size={16} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold font-outfit text-white">Company Invoice & Payment Intelligence</h3>
                                            <p className="text-[11px] text-zinc-500">
                                                Clear breakdown answering: 1) Tickets raised, 2) Invoices created, 3) Successful payments completed, 4) Total verified paid amount
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-xs">
                                        <div className="px-3 py-1 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 font-mono font-semibold">
                                            Total Billed: {formatINR(Number(invoiceTotalSummary?.total_paid_amount || 0) + Number(invoiceTotalSummary?.total_unpaid_amount || 0))}
                                        </div>
                                        <div className="px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-semibold">
                                            Verified Paid: {formatINR(invoiceTotalSummary?.total_paid_amount || 0)}
                                        </div>
                                    </div>
                                </div>

                                {companyInvoiceSummaries.length === 0 ? (
                                    <div className="text-center py-6 text-xs text-zinc-500">
                                        No corporate invoices generated yet.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[760px] text-left border-collapse text-xs">
                                            <thead>
                                                <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                                                    <th className="py-3 px-3">Corporate Client</th>
                                                    <th className="py-3 px-3 text-center">1. Repair Tickets</th>
                                                    <th className="py-3 px-3 text-center">2. Invoices Created</th>
                                                    <th className="py-3 px-3 text-center">3. Payments Completed</th>
                                                    <th className="py-3 px-3">4. Total Verified Paid</th>
                                                    <th className="py-3 px-3">Pending / Unpaid</th>
                                                    <th className="py-3 px-3 text-right">Quick Filter</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-900/60">
                                                {companyInvoiceSummaries.map((cis: any) => (
                                                    <tr key={cis.company_id} className="hover:bg-zinc-900/30 transition-colors">
                                                        <td className="py-3 px-3">
                                                            <button
                                                                onClick={() => handleSelectCompanyById(cis.company_id, cis.company_name)}
                                                                className="font-semibold text-white hover:text-neon-cyan transition-colors text-left cursor-pointer"
                                                            >
                                                                {cis.company_name}
                                                            </button>
                                                            <div className="text-[11px] text-zinc-500 truncate">{cis.company_email}</div>
                                                        </td>
                                                        <td className="py-3 px-3 text-center font-mono font-bold text-blue-400">
                                                            {cis.total_tickets}
                                                        </td>
                                                        <td className="py-3 px-3 text-center font-mono font-bold text-purple-400">
                                                            {cis.total_invoices}
                                                        </td>
                                                        <td className="py-3 px-3 text-center">
                                                            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                                {cis.paid_invoices}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-3 font-mono font-bold text-emerald-400 text-sm">
                                                            {formatINR(cis.total_paid_amount)}
                                                        </td>
                                                        <td className="py-3 px-3">
                                                            {Number(cis.unpaid_invoices) > 0 ? (
                                                                <div className="space-y-0.5">
                                                                    <div className="font-mono text-amber-400 font-semibold">
                                                                        {formatINR(cis.total_unpaid_amount)}
                                                                    </div>
                                                                    <div className="text-[10px] text-zinc-500 font-mono">
                                                                        {cis.unpaid_invoices} unpaid
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-[11px] text-zinc-500">All settled</span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-3 text-right">
                                                            <button
                                                                onClick={() => {
                                                                    setInvoiceCompanyFilter(invoiceCompanyFilter === String(cis.company_id) ? 'all' : String(cis.company_id));
                                                                    setInvoicePage(1);
                                                                }}
                                                                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                                                                    invoiceCompanyFilter === String(cis.company_id)
                                                                        ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                                                                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                                                                }`}
                                                            >
                                                                {invoiceCompanyFilter === String(cis.company_id) ? 'Showing' : 'Filter Ledger'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Corporate Invoices Ledger Table */}
                            <div className="bg-[#0a0a0a] border border-zinc-900/90 rounded-2xl overflow-hidden shadow-xl">
                                {/* Filter Controls */}
                                <div className="p-4 border-b border-zinc-900/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                                    <div className="relative flex-1 max-w-md">
                                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                                        <input
                                            type="text"
                                            placeholder="Search invoice #, ticket #, company name..."
                                            value={invoiceSearch}
                                            onChange={(e) => {
                                                setInvoiceSearch(e.target.value);
                                                setInvoicePage(1);
                                            }}
                                            className="w-full pl-9 pr-3 py-2 bg-zinc-900/70 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/40 transition-colors"
                                        />
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        {/* Company Dropdown */}
                                        <select
                                            value={invoiceCompanyFilter}
                                            onChange={(e) => {
                                                setInvoiceCompanyFilter(e.target.value);
                                                setInvoicePage(1);
                                            }}
                                            className="px-3 py-2 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-purple-500/40 cursor-pointer max-w-[180px]"
                                        >
                                            <option value="all">All Corporate Clients</option>
                                            {companyDropdownList.map((c) => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>

                                        {/* Status Dropdown */}
                                        <select
                                            value={invoiceStatusFilter}
                                            onChange={(e) => {
                                                setInvoiceStatusFilter(e.target.value);
                                                setInvoicePage(1);
                                            }}
                                            className="px-3 py-2 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-purple-500/40 cursor-pointer"
                                        >
                                            <option value="all">All Invoices</option>
                                            <option value="Paid">Paid</option>
                                            <option value="Pending">Pending / Unpaid</option>
                                            <option value="Draft">Draft</option>
                                        </select>

                                        <button
                                            onClick={fetchCorporateInvoices}
                                            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                            title="Refresh invoices"
                                        >
                                            <RefreshCw size={14} className={corporateInvoicesLoading ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                </div>

                                {/* Table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[760px] text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                                                <th className="py-3.5 px-4">Invoice #</th>
                                                <th className="py-3.5 px-4">Company</th>
                                                <th className="py-3.5 px-4">Related Ticket & Device</th>
                                                <th className="py-3.5 px-4">Amount</th>
                                                <th className="py-3.5 px-4">Status</th>
                                                <th className="py-3.5 px-4">Payment Reference</th>
                                                <th className="py-3.5 px-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-900/60">
                                            {corporateInvoicesLoading ? (
                                                <tr>
                                                    <td colSpan={7} className="py-12 text-center text-zinc-500">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <RefreshCw size={16} className="animate-spin text-purple-400" />
                                                            <span>Loading corporate invoice ledger...</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : corporateInvoices.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} className="py-12 text-center text-zinc-500">
                                                        <div className="max-w-xs mx-auto space-y-2">
                                                            <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center mx-auto text-zinc-600">
                                                                <Receipt size={20} />
                                                            </div>
                                                            <p className="font-medium text-zinc-400">No corporate invoices found</p>
                                                            <p className="text-[11px]">Invoices generated for corporate client repairs will appear here.</p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                corporateInvoices.map((inv: any) => (
                                                    <tr key={inv.id} className="hover:bg-zinc-900/30 transition-colors">
                                                        <td className="py-3.5 px-4">
                                                            <div className="font-mono font-bold text-white">
                                                                {inv.invoice_number || `#INV-${inv.id}`}
                                                            </div>
                                                            <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                                                                {inv.invoice_date || inv.created_at ? new Date(inv.invoice_date || inv.created_at).toLocaleDateString('en-IN', {
                                                                    day: '2-digit', month: 'short', year: 'numeric'
                                                                }) : '—'}
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <button
                                                                onClick={() => handleSelectCompanyById(inv.company_id, inv.company_name)}
                                                                className="font-semibold text-white hover:text-neon-cyan transition-colors text-left flex items-center gap-1.5 cursor-pointer"
                                                            >
                                                                <Building2 size={13} className="text-zinc-500 shrink-0" />
                                                                <span>{inv.company_name || 'Corporate Client'}</span>
                                                            </button>
                                                            <div className="text-[11px] text-zinc-500 mt-0.5">{inv.company_email}</div>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <div className="space-y-0.5">
                                                                <div className="font-mono text-zinc-300">
                                                                    {inv.ticket_number ? `#${inv.ticket_number}` : (inv.ticket_id ? `#TKT-${inv.ticket_id}` : 'General')}
                                                                </div>
                                                                <div className="text-[11px] text-zinc-400 truncate max-w-[180px]">
                                                                    {inv.device_brand || ''} {inv.device_model || ''}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4 font-mono font-bold text-white text-sm">
                                                            {formatINR(inv.total_amount)}
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${
                                                                inv.status?.toLowerCase() === 'paid'
                                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                                    : inv.status?.toLowerCase() === 'pending' || inv.status?.toLowerCase() === 'unpaid'
                                                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                                                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                                            }`}>
                                                                {inv.status || 'Pending'}
                                                            </span>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <div className="space-y-0.5">
                                                                <div className="font-mono text-[11px] text-zinc-300 truncate max-w-[150px]" title={inv.payment_reference}>
                                                                    {inv.payment_reference ? inv.payment_reference : (inv.paid_at ? 'Settled' : 'Unsettled')}
                                                                </div>
                                                                {inv.payment_method && (
                                                                    <div className="text-[10px] text-zinc-500 capitalize">{inv.payment_method}</div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4 text-right">
                                                            <div className="inline-flex items-center gap-1.5 justify-end">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setModalInvoiceId(inv.id);
                                                                        setModalTicketId(inv.ticket_id || null);
                                                                        setReceiptModalOpen(true);
                                                                    }}
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neon-cyan/10 hover:bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/25 text-xs font-medium transition-colors cursor-pointer"
                                                                    title="View GST Tax Invoice & Statement"
                                                                >
                                                                    <Receipt size={12} />
                                                                    <span>View</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handlePrintInvoice(inv)}
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-medium transition-colors cursor-pointer"
                                                                    title="Print Official GST Invoice"
                                                                >
                                                                    <Printer size={12} />
                                                                    <span>Print</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDownloadInvoicePdf(inv)}
                                                                    disabled={downloadingId === inv.id}
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-medium transition-colors cursor-pointer"
                                                                    title="Download GST Invoice PDF"
                                                                >
                                                                    <FileDown size={12} className={downloadingId === inv.id ? 'animate-bounce text-purple-400' : ''} />
                                                                    <span>PDF</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => handleSelectCompanyById(inv.company_id, inv.company_name)}
                                                                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-neon-cyan/10 text-zinc-400 hover:text-neon-cyan border border-zinc-800 transition-colors cursor-pointer"
                                                                    title="View Company"
                                                                >
                                                                    <ChevronRight size={14} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Invoice Pagination */}
                                {invoiceTotalPages > 1 && (
                                    <div className="p-4 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-400">
                                        <div>
                                            Showing page <span className="font-mono text-white">{invoicePage}</span> of <span className="font-mono text-white">{invoiceTotalPages}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                disabled={invoicePage <= 1}
                                                onClick={() => setInvoicePage(p => Math.max(1, p - 1))}
                                                className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 disabled:opacity-40 hover:text-white transition-colors cursor-pointer"
                                            >
                                                Previous
                                            </button>
                                            <button
                                                disabled={invoicePage >= invoiceTotalPages}
                                                onClick={() => setInvoicePage(p => Math.min(invoiceTotalPages, p + 1))}
                                                className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 disabled:opacity-40 hover:text-white transition-colors cursor-pointer"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* ══════════════════════════════════════════════════════════
                   VIEW 2: CLICKABLE COMPANY DRILLDOWN & REPAIR TICKETS
                   ══════════════════════════════════════════════════════════ */
                <div className="space-y-6">
                    {/* Selected Company Profile & Metrics Header */}
                    <div className="p-6 rounded-2xl bg-[#0a0a0a] border border-zinc-900/90 shadow-xl space-y-6">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                            <div className="flex items-start gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-2xl text-neon-cyan font-outfit uppercase shrink-0 shadow-lg shadow-black">
                                    {selectedCompany.name?.charAt(0) || 'C'}
                                </div>
                                <div>
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <h2 className="text-xl font-bold font-outfit text-white tracking-tight">
                                            {selectedCompany.name}
                                        </h2>
                                        {(selectedCompany.permanent_company_id || selectedCompany.company_id) && (
                                            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                                                {selectedCompany.permanent_company_id || selectedCompany.company_id}
                                            </span>
                                        )}
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${selectedCompany.is_active
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                            }`}>
                                            {selectedCompany.is_active ? 'Active Account' : 'Suspended'}
                                        </span>
                                    </div>

                                    {/* Company Meta Info */}
                                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-2 text-xs text-zinc-400">
                                        <div className="flex items-center gap-1.5">
                                            <Mail size={13} className="text-zinc-500" />
                                            <span>{selectedCompany.email}</span>
                                        </div>
                                        {selectedCompany.phone && (
                                            <div className="flex items-center gap-1.5">
                                                <Phone size={13} className="text-zinc-500" />
                                                <span className="font-mono">{selectedCompany.phone}</span>
                                            </div>
                                        )}
                                        {selectedCompany.contact_person && (
                                            <div className="flex items-center gap-1.5">
                                                <Users size={13} className="text-zinc-500" />
                                                <span>Contact: <strong className="text-zinc-200">{selectedCompany.contact_person}</strong></span>
                                            </div>
                                        )}
                                        {selectedCompany.gst_number && (
                                            <div className="flex items-center gap-1.5">
                                                <FileText size={13} className="text-zinc-500" />
                                                <span className="font-mono">GST: {selectedCompany.gst_number}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Actions on this company */}
                            <div className="flex items-center gap-2">
                                {/* <button
                                    onClick={() => handleSelectDrilldownTab('support')}
                                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${drilldownTab === 'support'
                                        ? 'bg-neon-cyan/20 border-neon-cyan/50 text-neon-cyan'
                                        : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
                                        }`}
                                >
                                    <MessageSquare size={13} className={((selectedCompany.unread_support_queries || 0) > 0 || (companySupportMessages || []).filter((m: any) => (m.sender_role === 'company' || String(m.sender_id) === String(selectedCompany?.id)) && !m.is_read).length > 0) ? 'text-amber-400' : ''} />
                                    <span>Support Queries</span>
                                    {((selectedCompany.unread_support_queries || 0) > 0 || (companySupportMessages || []).filter((m: any) => (m.sender_role === 'company' || String(m.sender_id) === String(selectedCompany?.id)) && !m.is_read).length > 0) ? (
                                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-400 font-bold">
                                            {selectedCompany.unread_support_queries || (companySupportMessages || []).filter((m: any) => (m.sender_role === 'company' || String(m.sender_id) === String(selectedCompany?.id)) && !m.is_read).length}
                                        </span>
                                    ) : companySupportMessages.length > 0 ? (
                                        <span className="text-[10px] font-mono text-zinc-500">
                                            ({companySupportMessages.length})
                                        </span>
                                    ) : null}
                                </button> */}
                                <button
                                    onClick={() => handleToggleStatus(selectedCompany.id, Boolean(selectedCompany.is_active), selectedCompany.name)}
                                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${selectedCompany.is_active
                                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                                        }`}
                                >
                                    {selectedCompany.is_active ? 'Suspend Account' : 'Reactivate Account'}
                                </button>
                                <button
                                    onClick={handleOpenEditModal}
                                    className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs font-medium transition-all cursor-pointer"
                                >
                                    Edit Profile
                                </button>
                            </div>
                        </div>

                        {/* Company Quick Metric Strip */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-4 border-t border-zinc-900 text-xs">
                            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-900">
                                <div className="text-zinc-500 text-[11px] uppercase font-mono">Total Tickets</div>
                                <div className="text-lg font-bold font-mono text-white mt-0.5">
                                    {selectedCompany.total_tickets ?? (selectedCompany.total_repairs || 0)}
                                </div>
                            </div>
                            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-900">
                                <div className="text-zinc-500 text-[11px] uppercase font-mono">Active Repairs</div>
                                <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">
                                    {selectedCompany.active_repairs || selectedCompany.activeRepairsCount || 0}
                                </div>
                            </div>
                            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-900">
                                <div className="text-zinc-500 text-[11px] uppercase font-mono">Completed Repairs</div>
                                <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                                    {selectedCompany.completed_repairs || selectedCompany.completedRepairsCount || 0}
                                </div>
                            </div>
                            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-900">
                                <div className="text-zinc-500 text-[11px] uppercase font-mono">Fleet Devices</div>
                                <div className="text-lg font-bold font-mono text-neon-cyan mt-0.5">
                                    {selectedCompany.total_devices || selectedCompany.deviceCount || 0}
                                </div>
                            </div>
                            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-900">
                                <div className="text-zinc-500 text-[11px] uppercase font-mono">Verified Payments</div>
                                <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                                    {formatINR(selectedCompany.total_paid_amount || selectedCompany.totalIncome || 0)}
                                </div>
                            </div>
                            <div
                                onClick={() => handleSelectDrilldownTab('support')}
                                className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-900 hover:border-zinc-800 transition-colors cursor-pointer group"
                            >
                                <div className="flex items-center justify-between text-zinc-500 text-[11px] uppercase font-mono">
                                    <span>Support Queries</span>
                                    <MessageSquare size={12} className="text-zinc-600 group-hover:text-neon-cyan transition-colors" />
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-lg font-bold font-mono text-white">
                                        {companySupportMessages.length}
                                    </span>
                                    {((selectedCompany.unread_support_queries || 0) > 0 || (companySupportMessages || []).filter((m: any) => (m.sender_role === 'company' || String(m.sender_id) === String(selectedCompany?.id)) && !m.is_read).length > 0) && (
                                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold">
                                            {selectedCompany.unread_support_queries || (companySupportMessages || []).filter((m: any) => (m.sender_role === 'company' || String(m.sender_id) === String(selectedCompany?.id)) && !m.is_read).length} new
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── SUB-NAVIGATION TABS (TICKETS / FLEET & DEVICES / SUPPORT QUERIES) ── */}
                    <div className="flex items-center gap-3 border-b border-zinc-900 pb-3">
                        <button
                            onClick={() => handleSelectDrilldownTab('tickets')}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                drilldownTab === 'tickets'
                                    ? 'bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan shadow-sm shadow-neon-cyan/10'
                                    : 'bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'
                            }`}
                        >
                            <Wrench size={14} />
                            <span>Repair Tickets</span>
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-300">
                                {companyTickets.length}
                            </span>
                        </button>
                        <button
                            onClick={() => handleSelectDrilldownTab('devices')}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                drilldownTab === 'devices'
                                    ? 'bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan shadow-sm shadow-neon-cyan/10'
                                    : 'bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'
                            }`}
                        >
                            <Laptop size={14} />
                            <span>Fleet & Devices</span>
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-300">
                                {(selectedCompany?.devices || []).length}
                            </span>
                        </button>
                        {/* <button
                            onClick={() => handleSelectDrilldownTab('support')}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                drilldownTab === 'support'
                                    ? 'bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan shadow-sm shadow-neon-cyan/10'
                                    : 'bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'
                            }`}
                        >
                            <MessageSquare size={14} className={((selectedCompany.unread_support_queries || 0) > 0 || (companySupportMessages || []).filter((m: any) => (m.sender_role === 'company' || String(m.sender_id) === String(selectedCompany?.id)) && !m.is_read).length > 0) ? 'text-amber-400' : ''} />
                            <span>Support Queries</span>
                            {((selectedCompany.unread_support_queries || 0) > 0 || (companySupportMessages || []).filter((m: any) => (m.sender_role === 'company' || String(m.sender_id) === String(selectedCompany?.id)) && !m.is_read).length > 0) ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold animate-pulse">
                                    {selectedCompany.unread_support_queries || (companySupportMessages || []).filter((m: any) => (m.sender_role === 'company' || String(m.sender_id) === String(selectedCompany?.id)) && !m.is_read).length} unread
                                </span>
                            ) : (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-300">
                                    {companySupportMessages.length}
                                </span>
                            )}
                        </button> */}
                    </div>

                    {drilldownTab === 'tickets' ? (
                        /* ── COMPANY REPAIR TICKETS (ALIGNED WITH COMPANY PORTAL & ADMIN REPAIR TICKETS) ── */
                        <div className="space-y-4">
                            {/* Header & Status Pill Tabs */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-xl font-bold font-outfit text-white tracking-tight flex items-center gap-2">
                                        <Wrench size={18} className="text-neon-cyan" />
                                        <span>Company Repair Tickets</span>
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
                                            {filteredCompanyTickets.length} / {companyTickets.length}
                                        </span>
                                    </h3>
                                    <p className="text-xs text-zinc-400 mt-1">
                                        Monitor hardware service requests, SLAs, and settlements for {selectedCompany.name}
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Status Pill Tabs Bar */}
                                    <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
                                        {companyTicketTabs.map(st => (
                                            <button
                                                key={st.id}
                                                type="button"
                                                onClick={() => setTicketStatusFilter(st.id)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${ticketStatusFilter === st.id
                                                    ? 'bg-zinc-800 text-white font-semibold shadow-sm'
                                                    : st.highlight
                                                        ? 'text-amber-400 hover:text-amber-300 font-semibold'
                                                        : 'text-zinc-400 hover:text-zinc-200'
                                                    }`}
                                            >
                                                <span>{st.label}</span>
                                                {st.count !== undefined && (
                                                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${ticketStatusFilter === st.id ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-500'}`}>
                                                        {st.count}
                                                    </span>
                                                )}
                                                {st.highlight && ticketStatusFilter !== st.id && (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                                )}
                                            </button>
                                        ))}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => selectedCompany?.id && loadCompanyDrilldown(selectedCompany.id)}
                                        className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                        title="Refresh Tickets"
                                    >
                                        <RefreshCw size={14} className={companyTicketsLoading ? 'animate-spin text-neon-cyan' : ''} />
                                    </button>
                                </div>
                            </div>

                            {/* Search Input Bar with Clear Action */}
                            <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search tickets by ticket number, brand, model, serial, employee, or problem description..."
                                    value={ticketSearch}
                                    onChange={e => setTicketSearch(e.target.value)}
                                    className="w-full bg-[#0c0c0c] border border-zinc-900 focus:border-neon-cyan/50 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                />
                                {ticketSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setTicketSearch('')}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-1 cursor-pointer"
                                        title="Clear search"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            {/* Table */}
                            {companyTicketsLoading ? (
                                <div className="bg-[#0c0c0c] border border-zinc-800/40 rounded-2xl py-20 text-center flex flex-col items-center justify-center space-y-3">
                                    <RefreshCw size={24} className="animate-spin text-neon-cyan" />
                                    <p className="text-zinc-400 text-xs font-medium">Loading repair tickets for {selectedCompany.name}...</p>
                                </div>
                            ) : filteredCompanyTickets.length === 0 ? (
                                <div className="bg-[#0c0c0c] border border-zinc-800/40 border-dashed rounded-2xl py-20 text-center flex flex-col items-center justify-center space-y-4">
                                    <Wrench size={40} className="text-zinc-700" />
                                    <div className="space-y-1">
                                        <h3 className="text-zinc-300 font-bold text-base">
                                            {ticketSearch || ticketStatusFilter !== 'all' ? 'No Tickets Match Your Filters' : 'No Tickets Found'}
                                        </h3>
                                        <p className="text-zinc-500 text-xs max-w-sm">
                                            {ticketSearch || ticketStatusFilter !== 'all' ? 'Try clearing your search or status filter.' : `No repair tickets have been raised for ${selectedCompany.name} yet.`}
                                        </p>
                                    </div>
                                    {ticketSearch || ticketStatusFilter !== 'all' ? (
                                        <button
                                            type="button"
                                            onClick={() => { setTicketSearch(''); setTicketStatusFilter('all'); }}
                                            className="text-xs text-neon-cyan hover:underline font-semibold cursor-pointer mt-2"
                                        >
                                            Reset filters
                                        </button>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="bg-[#0c0c0c] border border-zinc-800/40 rounded-2xl overflow-hidden shadow-xl">
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
                                                {filteredCompanyTickets.map((rep: any) => {
                                                    const isSlaClose = rep.sla_deadline
                                                        ? new Date(rep.sla_deadline) < new Date(Date.now() + 24 * 60 * 60 * 1000) && !['completed', 'delivered', 'cancelled'].includes((rep.status || '').toLowerCase())
                                                        : false;
                                                    const approxBudget = Number(rep.estimated_cost || rep.estimatedCost || rep.repair_cost || rep.repairCost || rep.charges || 0);
                                                    const approvalStatus = (rep.customer_approval_status || rep.customerApprovalStatus || 'none').toLowerCase();
                                                    const pStatus = (rep.payment_status || rep.paymentStatus || 'unpaid').toLowerCase();
                                                    const hasTech = Boolean(rep.assigned_technician_id || rep.assignedTechnicianId);
                                                    const ticketNum = rep.ticket_number || rep.ticketNumber || rep.id;
                                                    const createdDate = rep.created_at || rep.createdAt;
                                                    const devId = rep.device_id || rep.deviceId;

                                                    return (
                                                        <tr
                                                            key={rep.id}
                                                            onClick={() => handleOpenTicketWorkspace(rep)}
                                                            className="hover:bg-zinc-900/10 transition-colors cursor-pointer group hover:opacity-90"
                                                        >
                                                            {/* Ticket No. */}
                                                            <td className="py-4 px-6">
                                                                <span className="font-mono text-white text-sm block group-hover:text-neon-cyan transition-colors">
                                                                    #{ticketNum}
                                                                </span>
                                                                <span className="text-[10px] text-zinc-500 font-mono font-medium block mt-1">
                                                                    {createdDate ? new Date(createdDate).toLocaleDateString() : '—'}
                                                                </span>
                                                            </td>

                                                            {/* Device Details */}
                                                            <td className="py-4 px-4">
                                                                <div className="text-zinc-200 flex items-center gap-1.5">
                                                                    <span>
                                                                        {rep.brand || rep.device_brand || 'Device'} {rep.model || rep.model_number || rep.modelNumber || rep.device_model || ''}
                                                                    </span>
                                                                    {devId && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setHistoryModalDeviceId(Number(devId));
                                                                            }}
                                                                            className="p-1 text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors cursor-pointer"
                                                                            title="View Complete Device Repair History"
                                                                        >
                                                                            <Clock size={12} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                                                                    {rep.serial_number || rep.device_serial || rep.asset_tag || rep.asset_id || rep.assetId || '—'}
                                                                </div>
                                                            </td>

                                                            {/* User Assignment */}
                                                            <td className="py-4 px-4 text-zinc-400">
                                                                <div className="text-zinc-300 font-medium truncate max-w-[150px]">
                                                                    {rep.employee_name || rep.employeeName || rep.customer_name || rep.customerName || (
                                                                        <span className="text-zinc-600 italic">Inventory / Staff</span>
                                                                    )}
                                                                </div>
                                                                <div className="text-[11px] text-zinc-500 truncate max-w-[150px]">
                                                                    {rep.branch_name || rep.branchName || 'Main Branch'}
                                                                </div>
                                                            </td>

                                                            {/* Priority / Type */}
                                                            <td className="py-4 px-4">
                                                                <div className="flex flex-col gap-1 items-start">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${
                                                                        (rep.priority || '').toLowerCase() === 'urgent'
                                                                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                                                            : (rep.priority || '').toLowerCase() === 'high'
                                                                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                                                : 'bg-zinc-900 text-zinc-400 border-zinc-800/40'
                                                                    }`}>
                                                                        {rep.priority || 'Standard'}
                                                                    </span>
                                                                    <span className="text-[10px] text-zinc-400 block font-mono truncate max-w-[140px]" title={rep.problem_type || rep.problemType || rep.issue_description || 'Hardware'}>
                                                                        {rep.problem_type || rep.problemType || rep.issue_description || 'Hardware'}
                                                                    </span>
                                                                </div>
                                                            </td>

                                                            {/* SLA Resolve Deadline */}
                                                            <td className="py-4 px-4">
                                                                {rep.sla_deadline ? (
                                                                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                                                                        isSlaClose ? 'text-red-400 animate-pulse' : 'text-zinc-400'
                                                                    }`}>
                                                                        {isSlaClose ? <ShieldAlert size={13} /> : <Clock size={13} />}
                                                                        {String(rep.sla_deadline).replace('T', ' ').substring(0, 16)}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-zinc-600 font-mono text-xs">—</span>
                                                                )}
                                                            </td>

                                                            {/* Status */}
                                                            <td className="py-4 px-4">
                                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                                                    rep.status === 'completed'
                                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                                        : rep.status === 'delivered'
                                                                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                                            : rep.status === 'in_progress'
                                                                                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                                                                : rep.status === 'cancelled'
                                                                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                                }`}>
                                                                    {(rep.status || 'PENDING').toUpperCase().replace('_', ' ')}
                                                                </span>
                                                            </td>

                                                            {/* Payment */}
                                                            <td className="py-4 px-4" onClick={e => e.stopPropagation()}>
                                                                {pStatus === 'paid' ? (
                                                                    <div className="flex flex-col items-start gap-1">
                                                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                                                            <CheckCircle2 size={11} /> Paid {approxBudget > 0 ? `₹${approxBudget.toLocaleString('en-IN')}` : ''}
                                                                        </span>
                                                                        <div className="flex items-center gap-1.5 pt-0.5">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleViewTicketReceipt(rep.id)}
                                                                                className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-cyan-400/40 text-zinc-300 hover:text-cyan-400 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                                                                                title="View Official Tax Invoice"
                                                                            >
                                                                                <Receipt size={11} className="text-cyan-400" />
                                                                                <span>View</span>
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handlePrintTicketReceipt(rep.id)}
                                                                                className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-400/40 text-zinc-300 hover:text-amber-400 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                                                                                title="Print Document"
                                                                            >
                                                                                <Printer size={11} className="text-amber-400" />
                                                                                <span>Print</span>
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleDownloadTicketReceipt(rep.id)}
                                                                                disabled={downloadingId === rep.id}
                                                                                className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/40 text-zinc-300 hover:text-emerald-400 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                                                                                title="Download Official GST Tax Invoice"
                                                                            >
                                                                                {downloadingId === rep.id ? (
                                                                                    <RefreshCw size={11} className="animate-spin text-emerald-400" />
                                                                                ) : (
                                                                                    <Download size={11} className="text-emerald-400" />
                                                                                )}
                                                                                <span>PDF</span>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : pStatus === 'pending_verification' ? (
                                                                    <div className="flex flex-col items-start gap-1">
                                                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full animate-pulse font-mono">
                                                                            <Clock size={11} /> {(rep.collection_status === 'collected' || rep.collectionStatus === 'collected') ? 'Cash Collected' : 'Verification Pending'}
                                                                        </span>
                                                                        <span className="text-[10px] text-zinc-500 font-mono">Awaiting Clearance</span>
                                                                    </div>
                                                                ) : pStatus === 'rejected' ? (
                                                                    <div className="flex flex-col items-start gap-1">
                                                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full font-mono">
                                                                            <AlertCircle size={11} /> Rejected
                                                                        </span>
                                                                    </div>
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
                                                                    <span className="text-xs text-zinc-600 font-mono">—</span>
                                                                )}
                                                            </td>

                                                            {/* Actions */}
                                                            <td className="py-4 px-4 text-right" onClick={e => e.stopPropagation()}>
                                                                <div className="flex justify-end items-center gap-1.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setQuickDrawerTicket(rep)}
                                                                        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 transition-colors cursor-pointer"
                                                                        title="Quick Preview in Drawer"
                                                                    >
                                                                        <Eye size={13} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOpenTicketWorkspace(rep)}
                                                                        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-indigo-400 transition-colors cursor-pointer"
                                                                        title="Open Complete Ticket Workspace"
                                                                    >
                                                                        <ExternalLink size={13} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOpenAssignModal(rep)}
                                                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                                                            hasTech
                                                                                ? 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
                                                                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow'
                                                                        }`}
                                                                        title="Assign or Reassign Technician"
                                                                    >
                                                                        <UserCog size={12} />
                                                                        <span>{hasTech ? 'Reassign' : 'Assign'}</span>
                                                                    </button>
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
                        </div>
                    ) : drilldownTab === 'devices' ? (
                        /* ── COMPANY FLEET & DEVICES TABLE ── */
                        <div className="bg-[#0a0a0a] border border-zinc-900/90 rounded-2xl overflow-hidden shadow-xl">
                            {/* Table Header & Device Search */}
                            <div className="p-4 border-b border-zinc-900/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                                        <Laptop size={16} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold font-outfit text-white">
                                            Corporate Fleet & Devices ({filteredDevices.length})
                                        </h3>
                                        <p className="text-[11px] text-zinc-500">
                                            Hardware inventory with full repair lifecycle logs
                                        </p>
                                    </div>
                                </div>

                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                                    <input
                                        type="text"
                                        placeholder="Search brand, model, S/N, asset ID..."
                                        value={deviceSearch}
                                        onChange={(e) => setDeviceSearch(e.target.value)}
                                        className="pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-neon-cyan/40"
                                    />
                                </div>
                            </div>

                            {/* Devices List */}
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[700px] text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                                            <th className="py-3 px-4">Device Model</th>
                                            <th className="py-3 px-4">Asset ID / Serial</th>
                                            <th className="py-3 px-4">Assigned Employee</th>
                                            <th className="py-3 px-4">Branch</th>
                                            <th className="py-3 px-4">Repair History</th>
                                            <th className="py-3 px-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-900/70">
                                        {filteredDevices.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="py-12 text-center text-zinc-500">
                                                    <Laptop size={32} className="mx-auto mb-2 opacity-30" />
                                                    <p className="text-zinc-400 font-medium">No devices registered</p>
                                                    <p className="text-[11px] text-zinc-600 mt-1">
                                                        Devices registered by this company will be listed here.
                                                    </p>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredDevices.map((dev: any) => {
                                                const repCount = Number(dev.repair_count || 0);
                                                const activeRep = Number(dev.active_repairs || 0);
                                                const compRep = Number(dev.completed_repairs || 0);

                                                return (
                                                    <tr key={dev.id} className="hover:bg-zinc-900/30 transition-colors">
                                                        <td className="py-3.5 px-4">
                                                            <div className="font-semibold text-white">
                                                                {dev.brand} {dev.model || dev.model_number || 'Device'}
                                                            </div>
                                                            <div className="text-[11px] text-zinc-500 capitalize">
                                                                {dev.device_type || 'Hardware'}
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4 font-mono">
                                                            {dev.asset_id && (
                                                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700 mr-2">
                                                                    {dev.asset_id}
                                                                </span>
                                                            )}
                                                            <span className="text-zinc-400">
                                                                {dev.serial_number || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <div className="text-zinc-300 font-medium">
                                                                {dev.employee_name || 'Unassigned'}
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4 text-zinc-400">
                                                            {dev.branch_name || 'Main Office'}
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
                                                                    {repCount} {repCount === 1 ? 'repair' : 'repairs'}
                                                                </span>
                                                                {activeRep > 0 && (
                                                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                                                        {activeRep} active
                                                                    </span>
                                                                )}
                                                                {compRep > 0 && (
                                                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                                        {compRep} done
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4 text-right">
                                                            <button
                                                                onClick={() => setHistoryModalDeviceId(Number(dev.id))}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-neon-cyan/10 hover:text-neon-cyan border border-zinc-800 hover:border-neon-cyan/30 text-zinc-300 text-xs font-medium transition-all cursor-pointer"
                                                            >
                                                                <Clock size={13} />
                                                                <span>View History</span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        /* ── COMPANY SUPPORT QUERIES & COMMUNICATIONS PANEL ── */
                        <div className="bg-[#0a0a0a] border border-zinc-900/90 rounded-2xl overflow-hidden shadow-xl animate-fadeIn">
                            {/* Header & Quick Action Bar */}
                            <div className="p-4 md:p-5 border-b border-zinc-900/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center text-neon-cyan shrink-0">
                                        <MessageSquare size={18} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-bold font-outfit text-white">
                                                Support Queries & Communications
                                            </h3>
                                            {((selectedCompany.unread_support_queries || 0) > 0 || (companySupportMessages || []).filter((m: any) => (m.sender_role === 'company' || String(m.sender_id) === String(selectedCompany?.id)) && !m.is_read).length > 0) && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold">
                                                    {selectedCompany.unread_support_queries || (companySupportMessages || []).filter((m: any) => (m.sender_role === 'company' || String(m.sender_id) === String(selectedCompany?.id)) && !m.is_read).length} unread
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-zinc-500">
                                            Real-time support channel with {selectedCompany.name}
                                        </p>
                                    </div>
                                </div>

                                {/* Contact Company Quick Actions */}
                                <div className="flex flex-wrap items-center gap-2">
                                    {selectedCompany.email && (
                                        <a
                                            href={`mailto:${selectedCompany.email}`}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl text-xs font-medium text-zinc-300 hover:text-white transition-colors"
                                            title={`Send direct email to ${selectedCompany.email}`}
                                        >
                                            <Mail size={13} className="text-zinc-400" />
                                            <span>Email Company</span>
                                        </a>
                                    )}
                                    {selectedCompany.phone && (
                                        <a
                                            href={`tel:${selectedCompany.phone}`}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl text-xs font-medium text-zinc-300 hover:text-white transition-colors font-mono"
                                            title={`Call ${selectedCompany.phone}`}
                                        >
                                            <Phone size={13} className="text-zinc-400" />
                                            <span>Call Company</span>
                                        </a>
                                    )}
                                    <button
                                        onClick={() => fetchCompanySupportMessages(selectedCompany.id)}
                                        disabled={supportMessagesLoading}
                                        className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                        title="Refresh messages"
                                    >
                                        <RefreshCw size={13} className={supportMessagesLoading ? 'animate-spin text-neon-cyan' : ''} />
                                    </button>
                                </div>
                            </div>

                            {/* Metadata Strip */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-zinc-950/40 border-b border-zinc-900/60 text-xs">
                                <div className="p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60">
                                    <span className="text-[10px] uppercase font-mono text-zinc-500 block">Contact Person</span>
                                    <span className="font-semibold text-zinc-200 truncate block mt-0.5">
                                        {selectedCompany.contact_person || 'Not specified'}
                                    </span>
                                </div>
                                <div className="p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60">
                                    <span className="text-[10px] uppercase font-mono text-zinc-500 block">Total Messages</span>
                                    <span className="font-semibold font-mono text-white block mt-0.5">
                                        {companySupportMessages.length}
                                    </span>
                                </div>
                                <div className="p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60">
                                    <span className="text-[10px] uppercase font-mono text-zinc-500 block">Pending Queries</span>
                                    <span className={`font-semibold font-mono block mt-0.5 ${((selectedCompany.unread_support_queries || 0) > 0 || (companySupportMessages || []).filter((m: any) => (m.sender_role === 'company' || String(m.sender_id) === String(selectedCompany?.id)) && !m.is_read).length > 0) ? 'text-amber-400 font-bold' : 'text-zinc-400'}`}>
                                        {selectedCompany.unread_support_queries || (companySupportMessages || []).filter((m: any) => (m.sender_role === 'company' || String(m.sender_id) === String(selectedCompany?.id)) && !m.is_read).length} unread
                                    </span>
                                </div>
                                <div className="p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60">
                                    <span className="text-[10px] uppercase font-mono text-zinc-500 block">Latest Message</span>
                                    <span className="font-mono text-zinc-400 truncate block mt-0.5">
                                        {companySupportMessages.length > 0
                                            ? new Date(companySupportMessages[companySupportMessages.length - 1].created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                                            : 'No activity'}
                                    </span>
                                </div>
                            </div>

                            {/* Communication Thread */}
                            <div className="p-4 md:p-6 space-y-4">
                                <div className="h-[420px] overflow-y-auto space-y-4 p-4 rounded-2xl bg-zinc-950/90 border border-zinc-900 scrollbar-thin scrollbar-thumb-zinc-800">
                                    {supportMessagesLoading && companySupportMessages.length === 0 ? (
                                        <div className="h-full flex items-center justify-center">
                                            <RefreshCw size={24} className="animate-spin text-neon-cyan" />
                                        </div>
                                    ) : companySupportMessages.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                                            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600">
                                                <MessageSquare size={24} />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-zinc-300">No Support Queries Found</h4>
                                                <p className="text-xs text-zinc-500 max-w-sm mt-1">
                                                    When {selectedCompany.name} submits support messages or questions from their portal, they will appear in this thread.
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        companySupportMessages.map((msg: any) => {
                                            const isCompany = msg.sender_role === 'company' || String(msg.sender_id) === String(selectedCompany.id);
                                            const text = msg.message || msg.content || '';
                                            return (
                                                <div
                                                    key={msg.id}
                                                    className={`flex gap-3 max-w-[85%] ${isCompany ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}
                                                >
                                                    {/* Avatar Icon */}
                                                    <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${
                                                        isCompany
                                                            ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md'
                                                            : 'bg-zinc-800 border border-neon-cyan/30 text-neon-cyan'
                                                    }`}>
                                                        {isCompany ? <Building2 size={14} /> : <ShieldCheck size={14} />}
                                                    </div>

                                                    {/* Message Body */}
                                                    <div className="space-y-1">
                                                        <div className={`text-[10px] text-zinc-500 font-mono flex items-center gap-1.5 ${isCompany ? '' : 'justify-end'}`}>
                                                            <span className="font-semibold text-zinc-300">
                                                                {isCompany ? (msg.sender_name || selectedCompany.name) : 'TekDoctor Admin'}
                                                            </span>
                                                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono uppercase ${
                                                                isCompany ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20'
                                                            }`}>
                                                                {isCompany ? 'Company Client' : 'Admin'}
                                                            </span>
                                                            <span>•</span>
                                                            <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                            <span>({new Date(msg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })})</span>
                                                        </div>

                                                        <div className={`p-4 rounded-2xl text-xs leading-relaxed ${
                                                            isCompany
                                                                ? 'bg-zinc-900 text-zinc-200 rounded-tl-none border border-zinc-800'
                                                                : 'bg-gradient-to-r from-cyan-950/60 to-zinc-900 text-cyan-100 rounded-tr-none border border-neon-cyan/30 shadow-sm shadow-neon-cyan/5'
                                                        }`}>
                                                            {/* Linked Ticket Tag if message is associated with a repair ticket */}
                                                            {msg.ticket_number && (
                                                                <div className="mb-2 pb-2 border-b border-zinc-800/80 flex items-center gap-1.5 text-[11px] font-mono text-neon-cyan">
                                                                    <Wrench size={11} />
                                                                    <span>Ref Ticket #{msg.ticket_number}</span>
                                                                    {msg.ticket_brand && (
                                                                        <span className="text-zinc-400">({msg.ticket_brand} {msg.ticket_model || ''})</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <p className="whitespace-pre-wrap">{text}</p>
                                                        </div>

                                                        {isCompany && (
                                                            <div className="text-[10px] font-mono text-zinc-600 pl-1">
                                                                Status: {msg.is_read ? <span className="text-emerald-500">Seen by Admin</span> : <span className="text-amber-500">New Query</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={supportChatEndRef}></div>
                                </div>

                                {/* Reply Dispatch Console */}
                                <form onSubmit={handleSendSupportReply} className="space-y-3 pt-2">
                                    {/* Optional Link to Ticket */}
                                    {companyTickets.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-zinc-500 font-mono">Link to ticket (optional):</span>
                                            <select
                                                value={supportTicketFilter}
                                                onChange={(e) => setSupportTicketFilter(e.target.value)}
                                                className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-neon-cyan/40"
                                            >
                                                <option value="all">General Company Support</option>
                                                {companyTickets.map((t: any) => (
                                                    <option key={t.id} value={t.id}>
                                                        #{t.ticket_number || t.id} — {t.brand} {t.model_number || t.device_type}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Input and Counter */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-[11px] text-zinc-400 font-medium">Reply as TekDoctor Admin:</span>
                                            <span className={`text-[10px] font-mono ${supportReplyText.length > MESSAGE_MAX_LENGTH ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
                                                {supportReplyText.length} / {MESSAGE_MAX_LENGTH}
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            <textarea
                                                rows={2}
                                                maxLength={MESSAGE_MAX_LENGTH}
                                                placeholder={`Write reply to ${selectedCompany.name}...`}
                                                value={supportReplyText}
                                                onChange={(e) => setSupportReplyText(e.target.value)}
                                                className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-neon-cyan/50 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none transition-colors resize-none"
                                                disabled={sendingSupportReply}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        handleSendSupportReply(e);
                                                    }
                                                }}
                                            />
                                            <button
                                                type="submit"
                                                disabled={!supportReplyText.trim() || sendingSupportReply}
                                                className="px-5 bg-neon-cyan hover:bg-cyan-300 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-neon-cyan/10 shrink-0"
                                            >
                                                {sendingSupportReply ? (
                                                    <RefreshCw size={14} className="animate-spin" />
                                                ) : (
                                                    <>
                                                        <Send size={14} />
                                                        <span>Send Reply</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                </div>
            )}

            {/* Device Repair History Modal (Available Globally for Corporate Repairs & Fleet Devices) */}
            {historyModalDeviceId && (
                <DeviceRepairHistoryModal
                    deviceId={historyModalDeviceId}
                    onClose={() => setHistoryModalDeviceId(null)}
                />
            )}

            {/* Lightbox Image Preview Modal */}
            <ImagePreviewModal
                isOpen={Boolean(previewImage)}
                onClose={() => setPreviewImage(null)}
                src={previewImage?.src || ''}
                alt={previewImage?.alt || 'Attachment Preview'}
            />

            {/* ══════════════════════════════════════════════════════════
               ASSIGN TECHNICIAN MODAL (REUSING INDIVIDUAL REPAIR FLOW)
               ══════════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {assignModalTicket && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-md bg-[#0d0d0d] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
                        >
                            {/* Modal Header */}
                            <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center text-neon-cyan">
                                        <UserCog size={18} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white font-outfit text-base">Assign Technician</h3>
                                        <p className="text-xs text-zinc-400">
                                            Ticket #{assignModalTicket.ticket_number || assignModalTicket.id}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setAssignModalTicket(null)}
                                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <form onSubmit={handleAssignSubmit} className="p-5 space-y-4">
                                {/* Ticket Briefing Box */}
                                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-zinc-500">Company:</span>
                                        <span className="font-semibold text-white">{selectedCompany?.name || assignModalTicket.company_name || 'B2B Client'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-500">Device:</span>
                                        <span className="text-zinc-300">{assignModalTicket.device_type} {assignModalTicket.brand} {assignModalTicket.model}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-500">Issue:</span>
                                        <span className="text-zinc-400 truncate max-w-[200px]" title={assignModalTicket.issue_description}>
                                            {assignModalTicket.issue_description || 'Repair diagnosis'}
                                        </span>
                                    </div>
                                </div>

                                {/* Select Technician from Shared Technician Pool */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                                        <span>Select Technician</span>
                                        {techniciansLoading && (
                                            <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                                                <RefreshCw size={10} className="animate-spin" /> Loading pool...
                                            </span>
                                        )}
                                    </label>
                                    <select
                                        value={selectedTechId}
                                        onChange={(e) => setSelectedTechId(e.target.value)}
                                        className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-neon-cyan transition-colors cursor-pointer"
                                    >
                                        <option value="">-- Unassigned (Remove Technician) --</option>
                                        {technicians.map((tech) => (
                                            <option key={tech.id} value={tech.id}>
                                                {tech.name} ({tech.email}) {tech.phone ? `• ${tech.phone}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-zinc-500">
                                        Technicians will receive this task directly in their technician portal.
                                    </p>
                                </div>

                                {/* Ticket Status Transition */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-zinc-300">Set Ticket Status</label>
                                    <select
                                        value={assignStatus}
                                        onChange={(e) => setAssignStatus(e.target.value)}
                                        className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-neon-cyan transition-colors cursor-pointer"
                                    >
                                        <option value="pending">Pending</option>
                                        <option value="in_progress">In Progress (Active Job)</option>
                                        <option value="completed">Completed</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>

                                {/* Modal Actions */}
                                <div className="pt-3 flex items-center justify-end gap-2 border-t border-zinc-800/80">
                                    <button
                                        type="button"
                                        onClick={() => setAssignModalTicket(null)}
                                        className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={assigning}
                                        className="px-5 py-2 rounded-xl bg-gradient-to-r from-neon-cyan to-blue-600 text-black font-semibold text-xs transition-all hover:shadow-lg hover:shadow-neon-cyan/20 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                                    >
                                        {assigning ? 'Assigning...' : 'Save & Assign'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── REGISTER NEW COMPANY MODAL ── */}
            <AnimatePresence>
                {showRegisterModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-lg bg-[#09090b] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
                        >
                            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan">
                                        <Building2 size={16} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-white font-outfit">Register Corporate Client</h3>
                                        <p className="text-[11px] text-zinc-500">Create a new corporate account in the system</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowRegisterModal(false)}
                                    className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <form onSubmit={handleRegisterSubmit} className="p-5 space-y-3.5 max-h-[75vh] overflow-y-auto">
                                <div>
                                    <label className="text-xs font-medium text-zinc-300 block mb-1">Company Name *</label>
                                    <input
                                        type="text"
                                        required
                                        value={registerForm.companyName}
                                        onChange={(e) => setRegisterForm(f => ({ ...f, companyName: e.target.value }))}
                                        placeholder="e.g. Acme Innovations Corp"
                                        className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-neon-cyan"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-zinc-300 block mb-1">Corporate Email *</label>
                                        <input
                                            type="email"
                                            required
                                            value={registerForm.email}
                                            onChange={(e) => setRegisterForm(f => ({ ...f, email: e.target.value }))}
                                            placeholder="admin@company.com"
                                            className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-neon-cyan"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-zinc-300 block mb-1">Initial Password *</label>
                                        <input
                                            type="password"
                                            required
                                            value={registerForm.password}
                                            onChange={(e) => setRegisterForm(f => ({ ...f, password: e.target.value }))}
                                            placeholder="Min 8 chars, 1 uppercase"
                                            className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-neon-cyan"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-zinc-300 block mb-1">Contact Person</label>
                                        <input
                                            type="text"
                                            value={registerForm.contactPerson}
                                            onChange={(e) => setRegisterForm(f => ({ ...f, contactPerson: e.target.value }))}
                                            placeholder="Primary contact name"
                                            className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-neon-cyan"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-zinc-300 block mb-1">Phone Number</label>
                                        <input
                                            type="text"
                                            value={registerForm.phone}
                                            onChange={(e) => setRegisterForm(f => ({ ...f, phone: e.target.value }))}
                                            placeholder="10-digit mobile or phone"
                                            className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-neon-cyan"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-zinc-300 block mb-1">GST Number (Optional)</label>
                                        <input
                                            type="text"
                                            value={registerForm.gstNumber}
                                            onChange={(e) => setRegisterForm(f => ({ ...f, gstNumber: e.target.value.toUpperCase() }))}
                                            placeholder="15-char GSTIN"
                                            className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-neon-cyan uppercase font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-zinc-300 block mb-1">Website URL (Optional)</label>
                                        <input
                                            type="text"
                                            value={registerForm.websiteUrl}
                                            onChange={(e) => setRegisterForm(f => ({ ...f, websiteUrl: e.target.value }))}
                                            placeholder="https://company.com"
                                            className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-neon-cyan"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-zinc-300 block mb-1">Headquarters / Office Address</label>
                                    <textarea
                                        rows={2}
                                        value={registerForm.address}
                                        onChange={(e) => setRegisterForm(f => ({ ...f, address: e.target.value }))}
                                        placeholder="Corporate address..."
                                        className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-neon-cyan resize-none"
                                    />
                                </div>

                                <div className="pt-3 flex items-center justify-end gap-2 border-t border-zinc-800">
                                    <button
                                        type="button"
                                        onClick={() => setShowRegisterModal(false)}
                                        className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={registering}
                                        className="px-5 py-2 rounded-xl bg-gradient-to-r from-neon-cyan to-blue-600 text-black font-semibold text-xs transition-all hover:shadow-lg hover:shadow-neon-cyan/20 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                                    >
                                        {registering ? 'Creating Account...' : 'Register Company'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── EDIT COMPANY PROFILE MODAL ── */}
            <AnimatePresence>
                {showEditModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-lg bg-[#09090b] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
                        >
                            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                                        <Building2 size={16} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-white font-outfit">Edit Corporate Profile</h3>
                                        <p className="text-[11px] text-zinc-500">{selectedCompany?.name || 'Company Details'}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowEditModal(false)}
                                    className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <form onSubmit={handleEditSubmit} className="p-5 space-y-3.5 max-h-[75vh] overflow-y-auto">
                                <div>
                                    <label className="text-xs font-medium text-zinc-300 block mb-1">Company Legal / Trading Name *</label>
                                    <input
                                        type="text"
                                        required
                                        value={editForm.companyName}
                                        onChange={(e) => setEditForm(f => ({ ...f, companyName: e.target.value }))}
                                        className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-neon-cyan"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-zinc-300 block mb-1">Contact Person</label>
                                        <input
                                            type="text"
                                            value={editForm.contactPerson}
                                            onChange={(e) => setEditForm(f => ({ ...f, contactPerson: e.target.value }))}
                                            className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-neon-cyan"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-zinc-300 block mb-1">Phone Number</label>
                                        <input
                                            type="text"
                                            value={editForm.phone}
                                            onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
                                            className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-neon-cyan"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-zinc-300 block mb-1">GSTIN Number</label>
                                        <input
                                            type="text"
                                            value={editForm.gstNumber}
                                            onChange={(e) => setEditForm(f => ({ ...f, gstNumber: e.target.value.toUpperCase() }))}
                                            className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-neon-cyan uppercase font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-zinc-300 block mb-1">Website URL</label>
                                        <input
                                            type="text"
                                            value={editForm.websiteUrl}
                                            onChange={(e) => setEditForm(f => ({ ...f, websiteUrl: e.target.value }))}
                                            className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-neon-cyan"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-zinc-300 block mb-1">Office Address</label>
                                    <textarea
                                        rows={2}
                                        value={editForm.address}
                                        onChange={(e) => setEditForm(f => ({ ...f, address: e.target.value }))}
                                        className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-neon-cyan resize-none"
                                    />
                                </div>

                                <div className="pt-3 flex items-center justify-end gap-2 border-t border-zinc-800">
                                    <button
                                        type="button"
                                        onClick={() => setShowEditModal(false)}
                                        className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={updatingProfile}
                                        className="px-5 py-2 rounded-xl bg-gradient-to-r from-neon-cyan to-blue-600 text-black font-semibold text-xs transition-all hover:shadow-lg hover:shadow-neon-cyan/20 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                                    >
                                        {updatingProfile ? 'Saving Changes...' : 'Save Profile'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* View, Print & Download Payment Receipt / Tax Invoice Modal */}
            <PaymentReceiptModal
                isOpen={receiptModalOpen}
                onClose={() => {
                    setReceiptModalOpen(false);
                    setModalInvoiceId(null);
                    setModalTicketId(null);
                }}
                invoiceId={modalInvoiceId}
                ticketId={modalTicketId}
            />

            {/* Quick Preview Side Drawer (Reusing RepairTicketWorkspace) */}
            <SideDrawer
                isOpen={Boolean(quickDrawerTicket)}
                onClose={() => setQuickDrawerTicket(null)}
                title={`Ticket #${quickDrawerTicket?.ticket_number || quickDrawerTicket?.ticketNumber || quickDrawerTicket?.id || ''}`}
                subtitle={`${quickDrawerTicket?.brand || quickDrawerTicket?.device_brand || ''} ${quickDrawerTicket?.model || quickDrawerTicket?.model_number || quickDrawerTicket?.modelNumber || quickDrawerTicket?.device_model || ''}`}
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
                                const t = quickDrawerTicket;
                                setQuickDrawerTicket(null);
                                if (t) handleOpenTicketWorkspace(t);
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
                        role="admin"
                        technicians={technicians as any}
                        onBack={() => setQuickDrawerTicket(null)}
                        onOpenFullWorkspace={() => {
                            const t = quickDrawerTicket;
                            setQuickDrawerTicket(null);
                            if (t) handleOpenTicketWorkspace(t);
                        }}
                        onRefresh={() => {
                            if (selectedCompany) {
                                loadCompanyDrilldown(selectedCompany.id);
                            }
                            fetchCorporateRepairs();
                            setQuickDrawerTicket(null);
                        }}
                        onRequestUpdated={(updated: any) => {
                            setCompanyTickets(prev => prev.map(item => item.id === updated.id ? { ...item, ...updated } : item));
                            setAllCorporateRepairs(prev => prev.map(item => item.id === updated.id ? { ...item, ...updated } : item));
                            setQuickDrawerTicket((prev: any) => prev ? ({ ...prev, ...updated }) : null);
                        }}
                        onDelete={async () => {
                            const t = quickDrawerTicket;
                            setQuickDrawerTicket(null);
                            if (t && token) {
                                if (!window.confirm('Are you sure you want to delete this repair ticket?')) return;
                                try {
                                    const res = await repairApi.deleteRequest(token, t.id);
                                    if (res.ok) {
                                        toast.success('Repair ticket deleted successfully');
                                        if (selectedCompany) loadCompanyDrilldown(selectedCompany.id);
                                        fetchCorporateRepairs();
                                    } else {
                                        toast.error(res.error || 'Failed to delete ticket');
                                    }
                                } catch {
                                    toast.error('Error deleting ticket');
                                }
                            }
                        }}
                        onImagePreview={(src, alt) => setPreviewImage({ src, alt })}
                    />
                )}
            </SideDrawer>
        </div>
    );
}
