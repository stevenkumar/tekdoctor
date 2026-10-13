import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  KeyRound,
  ShieldCheck,
  Mail,
  User,
  Info,
  Loader2,
  AlertCircle,
  History,
  Hash,
  Clock,
  Smartphone,
  ExternalLink,
  Activity,
  Star,
  MessageSquare,
  Eye,
  EyeOff,
  LogOut,
  Settings,
  Receipt,
  CreditCard,
  CheckCircle2,
  XCircle,
  FileText,
  ChevronDown,
  X,
  Phone,
  Edit3,
  Check,
  Laptop,
  ArrowRight,
  PlusCircle,
  Copy,
  AlertTriangle,
  Printer,
  Download,
  FileCheck
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { authApi, repairApi, billingApi } from '@/services/api';
import type { ServiceRequest, Invoice } from '@/services/api';
import { ROUTES } from '@/config/routes';
import { VALIDATION, validatePassword, validatePasswordMatch } from '@/config/constants';
import { appConfig } from '@/config/appConfig';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import CustomerFeedbackModal from '@/components/CustomerFeedbackModal';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';
import { downloadPaymentBillPdf, printPaymentBill, type PaymentReceiptData } from '@/utils/billGenerator';

const getFileUrl = (path: string | null) => {
  if (!path) return null;
  const base = (appConfig.apiUrl || window.location.origin).replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return `${base}/${cleanPath}`;
};

const formatINR = (amount: number | string | undefined | null) => {
  if (amount === undefined || amount === null || isNaN(Number(amount))) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(amount));
};

const getTicketTotalEstimate = (r: ServiceRequest | any): number => {
  if (!r) return 0;
  if (r.totalEstimatedCost !== undefined && r.totalEstimatedCost !== null && !isNaN(Number(r.totalEstimatedCost))) {
    const total = Number(r.totalEstimatedCost);
    if (total > 0) return total;
  }
  const base = Number(r.estimatedCost || r.estimated_cost || 0);
  const extra = Number(r.additionalCharges || r.additional_charges || 0);
  if (base > 0 || extra > 0) {
    return base + extra;
  }
  const repair = Number(r.repairCost || r.repair_cost || 0);
  return repair > 0 ? repair : 0;
};

type DashboardTab =
  | 'current_repairs'
  | 'previous_repairs'
  | 'devices'
  | 'estimates'
  | 'approvals'
  | 'payments'
  | 'invoices'
  | 'settings';

export default function ProfilePage() {
  const { user, token, isAuthenticated, updateToken, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab State
  const initialTab = (searchParams.get('tab') as DashboardTab) || 'current_repairs';
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);

  // Menu / Drawer States
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sync tab with URL
  const switchTab = (tab: DashboardTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
    setDrawerOpen(false);
  };

  // Keep activeTab reactive to URL query parameters
  useEffect(() => {
    const tabParam = searchParams.get('tab') as DashboardTab;
    const validTabs: DashboardTab[] = [
      'current_repairs',
      'previous_repairs',
      'devices',
      'estimates',
      'approvals',
      'payments',
      'invoices',
      'settings'
    ];
    if (tabParam && validTabs.includes(tabParam)) {
      if (tabParam !== activeTab) {
        setActiveTab(tabParam);
      }
    } else if (!tabParam && activeTab !== 'current_repairs') {
      setActiveTab('current_repairs');
    }
  }, [searchParams]);

  // Photo Lightbox
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState('');
  const [previewAlt, setPreviewAlt] = useState('');

  // Feedback Modal
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackTicketId, setFeedbackTicketId] = useState<number | null>(null);
  const [feedbackTicketNumber, setFeedbackTicketNumber] = useState('');

  // Edit Profile State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profilePhone, setProfilePhone] = useState(user?.phone || '');
  const [profileErrors, setProfileErrors] = useState<{ name?: string; phone?: string }>({});
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ type: 'success' | 'error' | ''; message: string }>({
    type: '',
    message: ''
  });

  // Password Setter State
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passErrors, setPassErrors] = useState<Record<string, string>>({});
  const [isSubmittingPass, setIsSubmittingPass] = useState(false);
  const [passStatus, setPassStatus] = useState<{ type: 'success' | 'error' | ''; message: string }>({
    type: '',
    message: ''
  });

  // Data States
  const [history, setHistory] = useState<ServiceRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Approval / Rejection States
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<{ type: 'success' | 'error' | ''; message: string }>({
    type: '',
    message: ''
  });

  // Receipt / Invoice Statement Viewer State
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<PaymentReceiptData | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [receiptActionError, setReceiptActionError] = useState<string | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Copied indicator
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const openFeedback = (id: number, tNumber: string) => {
    setFeedbackTicketId(id);
    setFeedbackTicketNumber(tNumber);
    setFeedbackOpen(true);
  };

  const handleImagePreview = (src: string, alt: string) => {
    setPreviewSrc(src);
    setPreviewAlt(alt);
    setPreviewOpen(true);
  };

  const fetchHistory = (pageIndex: number = 1) => {
    if (!token) return;
    setLoadingHistory(true);
    repairApi.getMyHistory(token, pageIndex, 50).then((res) => {
      if (res.ok && res.data) {
        setHistory(res.data.data.data);
        setHistoryTotal(res.data.data.pagination.total);
        setHistoryTotalPages(res.data.data.pagination.totalPages);
        setHistoryPage(pageIndex);
      }
    }).finally(() => setLoadingHistory(false));
  };

  const fetchInvoices = () => {
    if (!token || !user) return;
    setLoadingInvoices(true);
    billingApi.getInvoices(token, String(user.id)).then((res) => {
      if (res.ok && Array.isArray(res.data?.data)) {
        setInvoices(res.data.data);
      } else if (res.ok && Array.isArray(res.data)) {
        setInvoices(res.data);
      }
    }).finally(() => setLoadingInvoices(false));
  };

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(ROUTES.SIGN_IN);
    } else if (token) {
      fetchHistory(1);
      fetchInvoices();
    }
  }, [isAuthenticated, token, navigate]);

  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfilePhone(user.phone || '');
    }
  }, [user]);

  // Filtered views
  const currentRepairs = useMemo(() => {
    return history.filter(r => ['pending', 'in_progress'].includes(r.status));
  }, [history]);

  const previousRepairs = useMemo(() => {
    return history.filter(r => ['completed', 'delivered', 'cancelled'].includes(r.status));
  }, [history]);

  const uniqueDevices = useMemo(() => {
    const map = new Map<string, { brand: string; model: string; category: string; serial?: string; count: number; lastDate: string; tickets: ServiceRequest[] }>();
    history.forEach(r => {
      const brand = r.brand || 'Device';
      const model = r.modelNumber || 'Standard';
      const category = r.deviceCategory || 'General';
      const serial = r.serialNumber || undefined;
      const key = `${brand}---${model}---${category}`.toLowerCase();

      if (map.has(key)) {
        const item = map.get(key)!;
        item.count += 1;
        item.tickets.push(r);
        if (new Date(r.createdAt) > new Date(item.lastDate)) {
          item.lastDate = r.createdAt;
        }
      } else {
        map.set(key, {
          brand,
          model,
          category,
          serial,
          count: 1,
          lastDate: r.createdAt,
          tickets: [r]
        });
      }
    });
    return Array.from(map.values());
  }, [history]);

  const estimatesList = useMemo(() => {
    return history.filter(r => getTicketTotalEstimate(r) > 0 || (r.customerApprovalStatus && r.customerApprovalStatus !== 'none'));
  }, [history]);

  const pendingApprovals = useMemo(() => {
    return history.filter(r => r.customerApprovalStatus === 'pending_approval' || r.customerApprovalStatus === 'reapproval_requested');
  }, [history]);

  const paymentTickets = useMemo(() => {
    return history.filter(r => (r.repairCost && Number(r.repairCost) > 0) || r.paymentStatus || getTicketTotalEstimate(r) > 0);
  }, [history]);

  // Handle Profile Update
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErrors({});
    setProfileStatus({ type: '', message: '' });

    const errors: { name?: string; phone?: string } = {};
    if (!profileName.trim() || profileName.trim().length < 2) {
      errors.name = 'Full name must be at least 2 characters.';
    } else if (profileName.trim().length > 50) {
      errors.name = 'Name cannot exceed 50 characters.';
    }

    if (profilePhone && profilePhone.trim()) {
      const cleanPhone = profilePhone.trim().replace(/\D/g, '');
      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        errors.phone = 'Please enter a valid 10 to 15-digit phone number.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors);
      return;
    }

    if (!token) return;

    setIsUpdatingProfile(true);
    try {
      const res = await authApi.updateProfile(token, {
        name: profileName.trim(),
        phone: profilePhone.trim() || undefined
      });

      if (res.ok && res.data?.data) {
        const updated = res.data.data;
        updateToken(token, {
          ...user!,
          name: updated.name,
          phone: updated.phone
        });
        setProfileStatus({
          type: 'success',
          message: '✓ Profile details updated successfully!'
        });
        setIsEditingProfile(false);
      } else {
        setProfileStatus({
          type: 'error',
          message: res.error || 'Failed to update profile. Please try again.'
        });
      }
    } catch (err: any) {
      setProfileStatus({
        type: 'error',
        message: err.message || 'An unexpected error occurred.'
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Handle Set/Update Password
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassErrors({});
    setPassStatus({ type: '', message: '' });

    const tempErrors: Record<string, string> = {};
    const passVal = validatePassword(password);
    if (!passVal.isValid) {
      tempErrors.password = passVal.error || 'Password must be at least 8 characters long.';
    }

    const matchVal = validatePasswordMatch(password, confirmPassword);
    if (!matchVal.isValid) {
      tempErrors.confirmPassword = matchVal.error || 'Passwords do not match.';
    }

    if (Object.keys(tempErrors).length > 0) {
      setPassErrors(tempErrors);
      return;
    }

    if (!token) return;

    setIsSubmittingPass(true);
    try {
      const response = await authApi.setPassword(password, token);
      if (response.ok) {
        if (response.data && response.data.token) {
          updateToken(response.data.token);
        }
        setPassStatus({
          type: 'success',
          message: '✓ Password established successfully! You can now sign in using this password on any device.'
        });
        setPassword('');
        setConfirmPassword('');
      } else {
        setPassStatus({
          type: 'error',
          message: response.error || 'Failed to update password. Please try again.'
        });
      }
    } catch (err) {
      setPassStatus({
        type: 'error',
        message: 'An unexpected network error occurred.'
      });
    } finally {
      setIsSubmittingPass(false);
    }
  };

  // Approve Estimate Action
  const handleApproveEstimate = async (ticketId: number) => {
    if (!token) return;
    setApprovingId(ticketId);
    setApprovalStatus({ type: '', message: '' });
    try {
      const res = await repairApi.approveEstimate(ticketId, token);
      if (res.ok) {
        setApprovalStatus({
          type: 'success',
          message: '✓ Repair estimate approved successfully! Our technicians will proceed with the service.'
        });
        fetchHistory(historyPage);
      } else {
        setApprovalStatus({
          type: 'error',
          message: res.error || 'Failed to approve estimate. Please try again.'
        });
      }
    } catch (err: any) {
      setApprovalStatus({
        type: 'error',
        message: err.message || 'Error communicating with server.'
      });
    } finally {
      setApprovingId(null);
    }
  };

  // Reject Estimate Action
  const handleRejectEstimate = async () => {
    if (!token || !rejectingId) return;
    setApprovalStatus({ type: '', message: '' });
    try {
      const res = await repairApi.rejectEstimate(rejectingId, rejectReason, token);
      if (res.ok) {
        setApprovalStatus({
          type: 'success',
          message: 'Repair estimate declined. Our support team will reach out regarding next steps.'
        });
        setShowRejectModal(false);
        setRejectingId(null);
        setRejectReason('');
        fetchHistory(historyPage);
      } else {
        setApprovalStatus({
          type: 'error',
          message: res.error || 'Failed to decline estimate.'
        });
      }
    } catch (err: any) {
      setApprovalStatus({
        type: 'error',
        message: err.message || 'Error submitting response.'
      });
    }
  };

  // Re-book historical device into a new repair inquiry
  const handleRebookDevice = (dev: any) => {
    const sortedTickets = [...(dev.tickets || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const latest = sortedTickets[0] || {};
    const rebookData = {
      deviceCategory: latest.deviceCategory || dev.category || '',
      customDeviceCategory: latest.customDeviceCategory || '',
      brand: latest.brand || dev.brand || '',
      customBrand: latest.customBrand || '',
      modelNumber: latest.modelNumber || dev.model || '',
      serialNumber: latest.serialNumber || dev.serial || '',
      deviceConfiguration: latest.deviceConfiguration || '',
      customerName: latest.customerName || user?.name || '',
      mobile: latest.mobile || latest.phone || user?.phone || '',
      email: latest.email || user?.email || '',
      address: latest.address || '',
      city: latest.city || '',
      state: latest.state || '',
      zipCode: latest.zipCode || '',
      rebookedFromTicket: latest.ticketNumber || latest.id
    };

    try {
      sessionStorage.setItem('tekdoctor_rebook_device', JSON.stringify(rebookData));
    } catch (e) {
      // ignore
    }

    navigate(ROUTES.REPAIR, { state: { rebookDevice: rebookData } });
  };

  // View Receipt Action (Payments tab)
  const handleViewReceipt = async (req: ServiceRequest) => {
    if (!token) return;
    setReceiptActionError(null);
    setLoadingReceipt(true);
    setReceiptModalOpen(true);
    setReceiptData(null);
    try {
      const res = await billingApi.getPaymentReceiptByTicket(req.id, token);
      if (res.ok && res.data?.data) {
        setReceiptData(res.data.data);
      } else {
        setReceiptActionError(res.error || 'Payment receipt not available. Receipts are only issued for settled payments.');
      }
    } catch (err: any) {
      setReceiptActionError(err.message || 'Network error fetching payment receipt.');
    } finally {
      setLoadingReceipt(false);
    }
  };

  // View Invoice Statement Action (Invoices tab)
  const handleViewInvoiceStatement = async (inv: Invoice) => {
    if (!token) return;
    if (inv.status?.toLowerCase() !== 'paid') {
      navigate(`/billing/pay/${inv.id}`);
      return;
    }
    setReceiptActionError(null);
    setLoadingReceipt(true);
    setReceiptModalOpen(true);
    setReceiptData(null);
    try {
      const res = await billingApi.getPaymentReceiptByInvoice(inv.id, token);
      if (res.ok && res.data?.data) {
        setReceiptData(res.data.data);
      } else {
        setReceiptActionError(res.error || 'Unable to retrieve invoice statement. Please try again.');
      }
    } catch (err: any) {
      setReceiptActionError(err.message || 'Network error fetching invoice statement.');
    } finally {
      setLoadingReceipt(false);
    }
  };

  // Download PDF Bill/Receipt
  const handleDownloadReceiptPdf = async () => {
    if (!receiptData) return;
    setIsDownloadingPdf(true);
    try {
      await downloadPaymentBillPdf(receiptData);
    } catch (err: any) {
      console.error('Failed to download bill PDF:', err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Print Bill/Receipt
  const handlePrintReceipt = async () => {
    if (!receiptData) return;
    setIsPrinting(true);
    try {
      await printPaymentBill(receiptData);
    } catch (err: any) {
      console.error('Failed to print bill:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleLogout = () => {
    setDrawerOpen(false);
    logout();
  };

  if (!user) return null;

  const customerIdFormatted = `${user.role === 'company' ? 'TD-C' : 'TD-'}${String(user.id).padStart(3, '0')}`;

  const navMenuItems = [
    { id: 'current_repairs', label: 'Current Repairs', icon: Smartphone, count: currentRepairs.length },
    { id: 'previous_repairs', label: 'Previous Repairs', icon: History, count: previousRepairs.length },
    { id: 'devices', label: 'Device History', icon: Laptop, count: uniqueDevices.length },
    { id: 'estimates', label: 'Estimates', icon: FileText, count: estimatesList.length },
    { id: 'approvals', label: 'Approvals', icon: CheckCircle2, count: pendingApprovals.length, alert: pendingApprovals.length > 0 },
    { id: 'payments', label: 'Payments', icon: CreditCard, count: paymentTickets.length },
    { id: 'invoices', label: 'Invoices', icon: Receipt, count: invoices.length },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans py-6 sm:py-8 md:py-14 px-3 sm:px-6 lg:px-8 2xl:px-10 overflow-x-hidden">
      <div className="w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[1580px] 3xl:max-w-[1800px] mx-auto space-y-6">

        {/* ── Top Header Bar with Profile Button on Right ────────────────────── */}
        <header className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl sm:rounded-2xl p-4 sm:p-6 backdrop-blur-md shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 relative">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neon-cyan">Customer Permanent ID</span>
              <div className="w-1.5 h-1.5 bg-neon-cyan rounded-full animate-pulse" />
              {/* <span className="text-zinc-600 font-mono text-xs">•</span> */}
              <span className="text-[11px] font-mono text-zinc-400 font-semibold uppercase tracking-wider">{customerIdFormatted}</span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white font-outfit tracking-tight">
              Customer Dashboard
            </h1>
            <p className="text-xs text-zinc-400 mt-1">Manage your device repairs, approvals, estimates, and account settings</p>
          </div>

          {/* Profile / Customer Account Section (Dropdown disabled on desktop, drawer enabled on mobile) */}
          <div className="relative self-end md:self-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 768) {
                  setDrawerOpen(true);
                }
              }}
              className="flex items-center gap-3 bg-black/60 border border-zinc-700/60 rounded-xl px-3.5 py-2.5 transition-all text-left shadow-lg min-h-[48px] cursor-pointer md:cursor-default hover:bg-zinc-800/80 md:hover:bg-black/60 hover:border-neon-cyan/50 md:hover:border-zinc-700/60 group"
              aria-expanded={drawerOpen}
              aria-label="Customer Account Navigation Menu"
            >
              <div className="w-9 h-9 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center text-neon-cyan font-bold text-sm shrink-0 group-hover:scale-105 md:group-hover:scale-100 transition-transform">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover rounded-lg" />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 pr-1">
                <div className="text-xs font-bold text-white truncate max-w-[120px] sm:max-w-[160px] font-outfit">
                  {user.name}
                </div>
                <div className="text-[10px] font-mono text-neon-cyan tracking-wider flex items-center gap-1">
                  <span className="md:hidden">Account Menu</span>
                  <span className="hidden md:inline">Customer Account</span>
                  {pendingApprovals.length > 0 && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
                  )}
                </div>
              </div>
              <ChevronDown
                size={16}
                className="text-zinc-400 group-hover:text-neon-cyan transition-transform duration-200 shrink-0 md:hidden"
              />
            </button>
          </div>
        </header>

        {/* ── Mobile Slide-Over Drawer with Backdrop ────────────────────────── */}
        <AnimatePresence>
          {drawerOpen && (
            <div className="fixed inset-0 z-50 md:hidden flex justify-end">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDrawerOpen(false)}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm"
              />

              {/* Drawer Content */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                className="relative w-[85%] max-w-sm h-full bg-[#0a0a0c] border-l border-zinc-800 p-5 flex flex-col justify-between overflow-y-auto shadow-2xl z-10"
              >
                <div className="space-y-6">
                  {/* Drawer Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                    <div>
                      <div className="text-xs font-mono uppercase text-neon-cyan tracking-wider font-semibold">
                        Customer Account
                      </div>
                      <div className="text-base font-bold text-white truncate max-w-[180px] font-outfit mt-0.5">
                        {user.name}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-500">{user.email}</div>
                    </div>
                    <button
                      onClick={() => setDrawerOpen(false)}
                      className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                      aria-label="Close menu"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Customer Account Navigation */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold px-2 mb-2">
                      Navigation
                    </div>
                    {navMenuItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => switchTab(item.id as DashboardTab)}
                          className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all text-left cursor-pointer min-h-[48px] ${
                            isActive
                              ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/40 font-semibold'
                              : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon size={18} className={isActive ? 'text-neon-cyan' : 'text-zinc-500'} />
                            <span>{item.label}</span>
                          </div>
                          {item.count > 0 && (
                            <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${
                              item.alert
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse font-bold'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}>
                              {item.count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Settings */}
                  <div className="pt-2 border-t border-zinc-800 space-y-1.5">
                    <button
                      onClick={() => switchTab('settings')}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all text-left cursor-pointer min-h-[48px] ${
                        activeTab === 'settings'
                          ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/40 font-semibold'
                          : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                      }`}
                    >
                      <Settings size={18} className={activeTab === 'settings' ? 'text-neon-cyan' : 'text-zinc-500'} />
                      <span>Account Settings</span>
                    </button>
                  </div>
                </div>

                {/* Drawer Footer (Sign Out) */}
                <div className="pt-4 border-t border-zinc-800 mt-6">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all cursor-pointer min-h-[48px]"
                  >
                    <LogOut size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ── Scrollable Tab Bar for Fast Navigation (Desktop only, hidden on mobile) ── */}
        <div className="hidden md:flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-zinc-800/80 -mx-4 px-4 sm:mx-0 sm:px-0">
          {navMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => switchTab(item.id as DashboardTab)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer min-h-[44px] ${
                  isActive
                    ? 'bg-neon-cyan text-black font-bold shadow-[0_0_15px_rgba(0,229,255,0.3)]'
                    : 'bg-zinc-900/40 border border-zinc-800/60 text-zinc-400 hover:text-white hover:border-zinc-700'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-black' : 'text-zinc-500'} />
                <span>{item.label}</span>
                {item.count > 0 && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    isActive
                      ? 'bg-black/20 text-black font-bold'
                      : item.alert
                        ? 'bg-amber-500/20 text-amber-400 font-bold'
                        : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
          <button
            onClick={() => switchTab('settings')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer min-h-[44px] ${
              activeTab === 'settings'
                ? 'bg-neon-cyan text-black font-bold shadow-[0_0_15px_rgba(0,229,255,0.3)]'
                : 'bg-zinc-900/40 border border-zinc-800/60 text-zinc-400 hover:text-white hover:border-zinc-700'
            }`}
          >
            <Settings size={14} className={activeTab === 'settings' ? 'text-black' : 'text-zinc-500'} />
            <span>Settings</span>
          </button>
        </div>

        {/* Global Feedback Banner for Approvals or Profile Actions */}
        {approvalStatus.message && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-xl text-xs font-mono flex items-center justify-between gap-3 ${
              approvalStatus.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            <div className="flex items-center gap-2">
              {approvalStatus.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{approvalStatus.message}</span>
            </div>
            <button
              onClick={() => setApprovalStatus({ type: '', message: '' })}
              className="text-zinc-500 hover:text-white"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}

        {/* ── TAB 1: Current Repairs ────────────────────────────────────────── */}
        {activeTab === 'current_repairs' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white font-outfit">Active Repairs</h2>
                <p className="text-xs text-zinc-500">Live service tickets currently in diagnosis or repair</p>
              </div>
              <Link
                to={ROUTES.REPAIR}
                className="btn-neon text-xs py-2.5 px-4 flex items-center justify-center gap-1.5 font-bold uppercase tracking-wider min-h-[44px] w-full sm:w-auto shrink-0"
              >
                <PlusCircle size={14} /> Book New Repair
              </Link>
            </div>

            {loadingHistory ? (
              <div className="flex justify-center p-12 bg-zinc-900/20 border border-zinc-800/60 rounded-2xl">
                <Loader2 className="w-8 h-8 animate-spin text-neon-cyan" />
              </div>
            ) : currentRepairs.length === 0 ? (
              <div className="text-center p-8 sm:p-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-2xl space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
                  <Smartphone size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-outfit">No active repair requests</h3>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
                    You have no active repairs in progress. Need assistance with a phone, laptop, or other hardware?
                  </p>
                </div>
                <Link
                  to={ROUTES.REPAIR}
                  className="inline-flex items-center gap-2 btn-neon py-2.5 px-5 text-xs font-bold uppercase tracking-wider min-h-[44px]"
                >
                  Book a Repair Now <ArrowRight size={14} />
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
                {currentRepairs.map((req) => (
                  <div
                    key={req.id}
                    className="bg-zinc-900/30 border border-zinc-800 hover:border-neon-cyan/40 rounded-xl sm:rounded-2xl p-4 sm:p-6 transition-all space-y-4 flex flex-col justify-between"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 border-b border-zinc-800/80 pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-bold text-neon-cyan flex items-center gap-1 break-all">
                          <Hash size={12} className="shrink-0" /> {req.ticketNumber || `#${req.id}`}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold border shrink-0 ${
                          req.status === 'in_progress'
                            ? 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>
                          {req.status.replace('_', ' ')}
                        </span>
                        {req.customerApprovalStatus === 'pending_approval' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse font-bold shrink-0">
                            Estimate Awaiting Approval
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-zinc-500 flex items-center gap-1 shrink-0">
                        <Clock size={12} className="shrink-0" /> Created: {new Date(req.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-xs flex-1">
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-start gap-2">
                          <Smartphone size={16} className="text-neon-cyan shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-bold text-white block break-words">
                              {req.brand} {req.modelNumber && `(${req.modelNumber})`}
                            </span>
                            <span className="text-[11px] text-zinc-400 break-words">
                              Category: {req.deviceCategory || 'General Device'}
                            </span>
                          </div>
                        </div>

                        <div className="text-zinc-400 bg-black/40 border border-zinc-800/60 rounded-xl p-3 space-y-1">
                          <span className="text-[10px] font-mono uppercase text-zinc-500 font-semibold block">Reported Problem:</span>
                          <p className="text-zinc-300 break-words leading-relaxed">{req.problemDescription}</p>
                        </div>
                      </div>

                      <div className="space-y-2 min-w-0 flex flex-col justify-between">
                        <div className="bg-black/40 border border-zinc-800/60 rounded-xl p-3 space-y-1.5">
                          <div className="flex items-center justify-between text-zinc-400 flex-wrap gap-1">
                            <span className="text-[10px] font-mono uppercase text-zinc-500 font-semibold">Assigned Technician:</span>
                            <span className="text-zinc-300 font-medium break-words">{req.technicianName || 'Assigning soon...'}</span>
                          </div>
                          {req.customerRepairDescription && (
                            <div className="pt-1.5 border-t border-zinc-800/80">
                              <span className="text-[10px] font-mono uppercase text-neon-cyan font-semibold block">Repair Progress Update:</span>
                              <p className="text-zinc-300 italic mt-0.5 break-words">{req.customerRepairDescription}</p>
                            </div>
                          )}
                          {getTicketTotalEstimate(req) > 0 && (
                            <div className="space-y-0.5 pt-1">
                              <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                                <span className="text-zinc-500 font-mono">Approx. Estimate:</span>
                                <span className="text-neon-cyan font-bold font-mono">{formatINR(getTicketTotalEstimate(req))}</span>
                              </div>
                              {Number(req.additionalCharges || req.additional_charges || 0) > 0 && (
                                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 flex-wrap gap-1">
                                  <span>Base: {formatINR(req.estimatedCost || req.estimated_cost)}</span>
                                  <span>+ Extra: {formatINR(req.additionalCharges || req.additional_charges)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Quick Action Buttons */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                          <Link
                            to={`/repair/status/?id=${req.ticketNumber || req.id}`}
                            className="w-full sm:flex-1 btn-neon text-center py-2.5 px-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 min-h-[44px]"
                          >
                            Live Tracking Details <ExternalLink size={12} />
                          </Link>
                          {req.customerApprovalStatus === 'pending_approval' && (
                            <button
                              onClick={() => switchTab('approvals')}
                              className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-xs uppercase tracking-wider hover:bg-amber-400 transition-all flex items-center justify-center gap-1 min-h-[44px] cursor-pointer"
                            >
                              Review Estimate
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: Previous Repairs ───────────────────────────────────────── */}
        {activeTab === 'previous_repairs' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-white font-outfit">Service History</h2>
              <p className="text-xs text-zinc-500">Past completed, delivered, and finalized repair requests</p>
            </div>

            {loadingHistory ? (
              <div className="flex justify-center p-12 bg-zinc-900/20 border border-zinc-800/60 rounded-2xl">
                <Loader2 className="w-8 h-8 animate-spin text-neon-cyan" />
              </div>
            ) : previousRepairs.length === 0 ? (
              <div className="text-center p-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-2xl space-y-2">
                <p className="text-sm font-mono text-zinc-500">No previous repair history recorded yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
                {previousRepairs.map((req) => (
                  <div
                    key={req.id}
                    className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl sm:rounded-2xl p-4 sm:p-6 space-y-4 flex flex-col justify-between"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 border-b border-zinc-800/80 pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-bold text-white flex items-center gap-1 break-all">
                          <Hash size={12} className="shrink-0" /> {req.ticketNumber || `#${req.id}`}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold border shrink-0 ${
                          req.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                          req.status === 'delivered' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                          'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}>
                          {req.status}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                        Serviced: {new Date(req.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-1">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="text-sm font-bold text-white break-words">
                          {req.brand} {req.modelNumber && `(${req.modelNumber})`}
                        </div>
                        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed break-words">{req.problemDescription}</p>
                        {req.repairCost && (
                          <div className="text-xs font-mono text-zinc-400 pt-1">
                            Final Bill: <span className="text-emerald-400 font-bold">{formatINR(req.repairCost)}</span>
                          </div>
                        )}
                      </div>

                      {/* Feedback & Actions */}
                      <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto w-full sm:w-auto shrink-0">
                        {req.feedbackRating ? (
                          <div className="flex items-center gap-1.5 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl shrink-0">
                            <span className="text-[10px] uppercase font-bold text-yellow-500">Rating:</span>
                            <div className="flex">
                              {Array.from({ length: req.feedbackRating }).map((_, i) => (
                                <Star key={i} size={11} className="text-yellow-400 fill-yellow-400" />
                              ))}
                            </div>
                          </div>
                        ) : (
                          ['completed', 'delivered'].includes(req.status) && (
                            <button
                              onClick={() => openFeedback(req.id, req.ticketNumber || String(req.id))}
                              className="flex-1 sm:flex-none text-xs font-semibold text-zinc-300 bg-zinc-900 border border-zinc-800 hover:border-neon-cyan px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
                            >
                              <MessageSquare size={13} /> Rate Service
                            </button>
                          )
                        )}

                        <Link
                          to={`/repair/status/?id=${req.ticketNumber || req.id}`}
                          className="flex-1 sm:flex-none text-xs font-semibold text-white bg-zinc-800 hover:bg-zinc-700 px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
                        >
                          View Details <ExternalLink size={13} />
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: Device History ─────────────────────────────────────────── */}
        {activeTab === 'devices' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white font-outfit">My Devices</h2>
                <p className="text-xs text-zinc-500">All hardware units serviced under your customer profile</p>
              </div>
              <Link
                to={ROUTES.REPAIR}
                className="btn-neon text-xs py-2 px-3.5 flex items-center gap-1.5 font-bold uppercase tracking-wider min-h-[44px]"
              >
                <PlusCircle size={14} /> Add Device Service
              </Link>
            </div>

            {loadingHistory ? (
              <div className="flex justify-center p-12 bg-zinc-900/20 border border-zinc-800/60 rounded-2xl">
                <Loader2 className="w-8 h-8 animate-spin text-neon-cyan" />
              </div>
            ) : uniqueDevices.length === 0 ? (
              <div className="text-center p-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-2xl space-y-2">
                <p className="text-sm font-mono text-zinc-500">No registered devices found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {uniqueDevices.map((dev, idx) => (
                  <div
                    key={idx}
                    className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-5 space-y-3 hover:border-zinc-700 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center text-neon-cyan">
                          <Laptop size={18} />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-sm font-outfit">{dev.brand} {dev.model}</h3>
                          <span className="text-[11px] font-mono text-zinc-500">{dev.category}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {dev.count} Service{dev.count > 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="text-xs font-mono text-zinc-400 space-y-1 pt-1">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Last Serviced:</span>
                        <span>{new Date(dev.lastDate).toLocaleDateString()}</span>
                      </div>
                      {dev.serial && (
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Serial No:</span>
                          <span className="text-zinc-300 font-mono">{dev.serial}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-zinc-500">
                        Related Tickets: {dev.tickets.map(t => t.ticketNumber || `#${t.id}`).join(', ')}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRebookDevice(dev)}
                        className="btn-neon text-xs py-1.5 px-3 font-bold uppercase tracking-wider shrink-0 flex items-center gap-1.5 cursor-pointer min-h-[36px]"
                      >
                        <PlusCircle size={13} /> Re-book Device
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 4: Estimates ──────────────────────────────────────────────── */}
        {activeTab === 'estimates' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-white font-outfit">Cost Estimates</h2>
              <p className="text-xs text-zinc-500">Official technical diagnosis and repair cost breakdowns</p>
            </div>

            {loadingHistory ? (
              <div className="flex justify-center p-12 bg-zinc-900/20 border border-zinc-800/60 rounded-2xl">
                <Loader2 className="w-8 h-8 animate-spin text-neon-cyan" />
              </div>
            ) : estimatesList.length === 0 ? (
              <div className="text-center p-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-2xl space-y-2">
                <p className="text-sm font-mono text-zinc-500">No repair estimates issued yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
                {estimatesList.map((req) => (
                  <div
                    key={req.id}
                    className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl sm:rounded-2xl p-4 sm:p-6 space-y-4 flex flex-col justify-between"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 border-b border-zinc-800/80 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold text-neon-cyan break-all">
                          {req.ticketNumber || `#${req.id}`}
                        </span>
                        <span className="text-xs text-zinc-400 font-medium break-words">
                          • {req.brand} {req.modelNumber}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold border shrink-0 ${
                          req.customerApprovalStatus === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                          req.customerApprovalStatus === 'pending_approval' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse' :
                          req.customerApprovalStatus === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                          'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}>
                          {req.customerApprovalStatus?.replace('_', ' ') || 'Estimate Issued'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs flex-1">
                      <div className="bg-black/40 border border-zinc-800/60 rounded-xl p-3 space-y-1">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase font-semibold block">Diagnosis</span>
                        <p className="text-zinc-300 break-words leading-relaxed">{req.diagnosis || 'Technical inspection pending details.'}</p>
                      </div>

                      <div className="bg-black/40 border border-zinc-800/60 rounded-xl p-3 space-y-1">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase font-semibold block">Required Work / Parts</span>
                        <p className="text-zinc-300 break-words leading-relaxed">{req.requiredWork || req.requiredParts || 'Standard hardware service'}</p>
                      </div>

                      <div className="bg-black/40 border border-zinc-800/60 rounded-xl p-3 space-y-2 flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] font-mono text-zinc-500 uppercase font-semibold block">Estimated Total</span>
                          <span className="text-base sm:text-lg font-extrabold text-neon-cyan font-mono block">
                            {formatINR(getTicketTotalEstimate(req))}
                          </span>
                          {Number(req.additionalCharges || req.additional_charges || 0) > 0 && (
                            <span className="text-[10px] font-mono text-zinc-400 block mt-0.5 break-words">
                              Base: {formatINR(req.estimatedCost || req.estimated_cost)} + Extra: {formatINR(req.additionalCharges || req.additional_charges)}
                            </span>
                          )}
                        </div>
                        {req.customerApprovalStatus === 'pending_approval' && (
                          <button
                            onClick={() => switchTab('approvals')}
                            className="w-full py-2 bg-amber-500 text-black font-bold uppercase tracking-wider rounded-lg text-[10px] hover:bg-amber-400 transition-all min-h-[44px] cursor-pointer"
                          >
                            Decide on Estimate
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

        {/* ── TAB 5: Approvals ──────────────────────────────────────────────── */}
        {activeTab === 'approvals' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white font-outfit">Estimate Approvals</h2>
              <p className="text-xs text-zinc-500">Authorize or decline service estimates before repairs begin</p>
            </div>

            {/* Pending Approvals Section */}
            {pendingApprovals.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 font-mono">
                  <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                  <span>Action Required: You have {pendingApprovals.length} estimate(s) awaiting your decision.</span>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
                  {pendingApprovals.map((req) => (
                    <div
                      key={req.id}
                      className="bg-zinc-900/40 border-2 border-amber-500/40 rounded-xl sm:rounded-2xl p-4 sm:p-6 space-y-4 shadow-xl flex flex-col justify-between"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-3 border-b border-zinc-800/80 pb-3">
                        <div className="min-w-0">
                          <span className="text-xs font-mono font-bold text-amber-400 break-all">
                            {req.ticketNumber || `#${req.id}`}
                          </span>
                          <h3 className="text-base font-bold text-white font-outfit mt-0.5 break-words">
                            {req.brand} {req.modelNumber}
                          </h3>
                        </div>
                        <div className="text-left sm:text-right shrink-0">
                          <span className="text-[10px] font-mono text-zinc-500 uppercase block">Total Cost</span>
                          <span className="text-lg sm:text-xl font-extrabold text-neon-cyan font-mono block">
                            {formatINR(getTicketTotalEstimate(req))}
                          </span>
                          {Number(req.additionalCharges || req.additional_charges || 0) > 0 && (
                            <span className="text-[10px] font-mono text-zinc-400 block mt-0.5 break-words">
                              Base: {formatINR(req.estimatedCost || req.estimated_cost)} + Extra: {formatINR(req.additionalCharges || req.additional_charges)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-xs flex-1">
                        <div className="bg-black/50 border border-zinc-800 rounded-xl p-3 space-y-1">
                          <span className="text-[10px] font-mono text-zinc-500 uppercase font-semibold">Diagnosis Details:</span>
                          <p className="text-zinc-300 break-words leading-relaxed">{req.diagnosis || 'Standard diagnostic inspection complete.'}</p>
                        </div>
                        <div className="bg-black/50 border border-zinc-800 rounded-xl p-3 space-y-1">
                          <span className="text-[10px] font-mono text-zinc-500 uppercase font-semibold">Work / Parts:</span>
                          <p className="text-zinc-300 break-words leading-relaxed">{req.requiredWork || req.requiredParts || 'Standard service labor and parts.'}</p>
                        </div>
                      </div>

                      {/* 1-Click Approve / Decline Action Bar */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 pt-2">
                        <button
                          onClick={() => handleApproveEstimate(req.id)}
                          disabled={approvingId === req.id}
                          className="w-full sm:flex-1 btn-neon py-3 px-4 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 min-h-[44px]"
                        >
                          {approvingId === req.id ? (
                            <>
                              <Loader2 size={16} className="animate-spin text-black" />
                              Approving Estimate...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={16} /> Approve & Proceed with Repair
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => {
                            setRejectingId(req.id);
                            setShowRejectModal(true);
                          }}
                          disabled={approvingId === req.id}
                          className="w-full sm:w-auto px-5 py-3 rounded-xl bg-zinc-900 border border-red-500/30 text-red-400 hover:bg-red-500/10 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer min-h-[44px] flex items-center justify-center"
                        >
                          Decline Estimate
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-8 bg-zinc-900/20 border border-zinc-800/80 rounded-2xl text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-outfit">All Estimates Up to Date</h3>
                  <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1">
                    There are no repair estimates currently pending your approval. If a technician submits an estimate, it will appear here immediately.
                  </p>
                </div>
              </div>
            )}

            {/* Previously Approved/Rejected List */}
            {estimatesList.filter(r => r.customerApprovalStatus === 'approved' || r.customerApprovalStatus === 'rejected').length > 0 && (
              <div className="space-y-3 pt-4">
                <h3 className="text-sm font-bold text-white font-outfit uppercase tracking-wider text-zinc-400">Decision History</h3>
                <div className="space-y-2">
                  {estimatesList.filter(r => r.customerApprovalStatus === 'approved' || r.customerApprovalStatus === 'rejected').map(r => (
                    <div key={r.id} className="bg-zinc-900/20 border border-zinc-800/60 rounded-xl p-3.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-zinc-400">{r.ticketNumber || `#${r.id}`}</span>
                        <span className="text-white font-medium">{r.brand} {r.modelNumber}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-zinc-300">{formatINR(getTicketTotalEstimate(r))}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                          r.customerApprovalStatus === 'approved'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {r.customerApprovalStatus}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 6: Payments ───────────────────────────────────────────────── */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-white font-outfit">Payments & Receipts</h2>
              <p className="text-xs text-zinc-500">Track paid repair balances and settle pending service invoices</p>
            </div>

            {loadingHistory ? (
              <div className="flex justify-center p-12 bg-zinc-900/20 border border-zinc-800/60 rounded-2xl">
                <Loader2 className="w-8 h-8 animate-spin text-neon-cyan" />
              </div>
            ) : paymentTickets.length === 0 ? (
              <div className="text-center p-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-2xl space-y-2">
                <p className="text-sm font-mono text-zinc-500">No payment records found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {paymentTickets.map((req) => {
                  const isPaid = req.paymentStatus === 'paid' || req.payment_status === 'paid';
                  const amount = req.repairCost || req.repair_cost || req.estimatedCost || 0;

                  return (
                    <div
                      key={req.id}
                      className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-white">
                            {req.ticketNumber || `#${req.id}`}
                          </span>
                          <span className="text-xs text-zinc-400">• {req.brand} {req.modelNumber}</span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold border ${
                          isPaid
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>
                          {isPaid ? 'Paid' : 'Payment Pending'}
                        </span>
                      </div>

                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
                        <div>
                          <span className="text-[10px] font-mono text-zinc-500 uppercase block">Amount</span>
                          <span className="text-lg font-bold text-white font-mono">{formatINR(amount)}</span>
                          {req.paymentMethod && (
                            <span className="text-xs text-zinc-400 block mt-0.5">Method: {req.paymentMethod}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {isPaid ? (
                            <button
                              type="button"
                              onClick={() => handleViewReceipt(req)}
                              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition-all min-h-[44px] flex items-center gap-1.5 cursor-pointer"
                            >
                              <Receipt size={14} /> View Receipt
                            </button>
                          ) : (req.status !== 'completed' && req.status !== 'delivered') ? (
                            <span className="px-3.5 py-2 rounded-xl bg-zinc-800/60 border border-zinc-700/40 text-xs font-mono text-zinc-400">
                              Service In Progress
                            </span>
                          ) : (
                            <Link
                              to={`/repair/status/?id=${req.ticketNumber || req.id}`}
                              className="btn-neon px-4 py-2.5 text-xs font-bold uppercase tracking-wider min-h-[44px] flex items-center gap-1.5"
                            >
                              <CreditCard size={14} /> View Bill & Settle
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 7: Invoices ───────────────────────────────────────────────── */}
        {activeTab === 'invoices' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-white font-outfit">GST Invoices & Statements</h2>
              <p className="text-xs text-zinc-500">Official tax invoices for your device service bookings</p>
            </div>

            {loadingInvoices ? (
              <div className="flex justify-center p-12 bg-zinc-900/20 border border-zinc-800/60 rounded-2xl">
                <Loader2 className="w-8 h-8 animate-spin text-neon-cyan" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center p-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-2xl space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
                  <Receipt size={24} />
                </div>
                <h3 className="text-base font-bold text-white font-outfit">No invoices generated yet</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Tax invoices are automatically produced when service orders are finalized and settled.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                      <div>
                        <span className="text-xs font-mono font-bold text-neon-cyan">
                          {inv.id}
                        </span>
                        <span className="text-xs text-zinc-500 ml-2 font-mono">
                          Date: {new Date(inv.invoiceDate || inv.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold border ${
                        inv.status?.toLowerCase() === 'paid'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}>
                        {inv.status}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase block">Total Amount</span>
                        <span className="text-xl font-bold text-white font-mono">{formatINR(inv.amount)}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleViewInvoiceStatement(inv)}
                        className="btn-neon text-xs py-2.5 px-4 font-bold uppercase tracking-wider flex items-center gap-1.5 self-start sm:self-auto min-h-[44px] cursor-pointer"
                      >
                        <Receipt size={14} /> View Invoice Statement
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 8: Settings (Identity Profile & Password Setter) ───────────── */}
        {activeTab === 'settings' && (
          <div className="space-y-8">
            {/* Identity Profile Card */}
            <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 md:p-8 backdrop-blur-md shadow-xl space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
                    <User className="text-neon-cyan w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white font-outfit">Identity Profile</h3>
                    <p className="text-xs text-zinc-500">Edit your personal contact details</p>
                  </div>
                </div>

                {!isEditingProfile && (
                  <button
                    onClick={() => setIsEditingProfile(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-neon-cyan text-xs font-semibold text-white transition-all cursor-pointer min-h-[44px]"
                  >
                    <Edit3 size={13} /> Edit Profile
                  </button>
                )}
              </div>

              {profileStatus.message && (
                <div className={`p-4 rounded-xl text-xs font-mono flex items-center gap-2 ${
                  profileStatus.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {profileStatus.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{profileStatus.message}</span>
                </div>
              )}

              {isEditingProfile ? (
                <form onSubmit={handleUpdateProfile} className="space-y-4" noValidate>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="profileName" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        id="profileName"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className={`w-full bg-zinc-950/60 border ${profileErrors.name ? 'border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-xl p-3 text-sm text-white focus:outline-none`}
                        placeholder="Your full name"
                      />
                      {profileErrors.name && (
                        <p className="text-red-400 text-xs mt-1 font-mono">{profileErrors.name}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="profilePhone" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                        Mobile Phone
                      </label>
                      <input
                        type="tel"
                        id="profilePhone"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        className={`w-full bg-zinc-950/60 border ${profileErrors.phone ? 'border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-xl p-3 text-sm text-white focus:outline-none`}
                        placeholder="10-digit mobile number"
                      />
                      {profileErrors.phone && (
                        <p className="text-red-400 text-xs mt-1 font-mono">{profileErrors.phone}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={isUpdatingProfile}
                      className="btn-neon px-5 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50 min-h-[44px]"
                    >
                      {isUpdatingProfile ? (
                        <>
                          <Loader2 size={14} className="animate-spin text-black" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check size={14} /> Save Changes
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingProfile(false);
                        setProfileName(user.name || '');
                        setProfilePhone(user.phone || '');
                        setProfileErrors({});
                      }}
                      className="px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs font-semibold text-zinc-400 transition-all cursor-pointer min-h-[44px]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                  <div className="space-y-1">
                    <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Customer Name</span>
                    <div className="flex items-center gap-2.5 text-white bg-black/30 border border-zinc-800/60 rounded-xl p-3 font-mono text-xs">
                      <User size={14} className="text-zinc-500 shrink-0" />
                      <span className="truncate">{user.name}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Mobile Phone</span>
                    <div className="flex items-center gap-2.5 text-white bg-black/30 border border-zinc-800/60 rounded-xl p-3 font-mono text-xs">
                      <Phone size={14} className="text-zinc-500 shrink-0" />
                      <span className="truncate">{user.phone || 'Not configured'}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Permanent Customer ID</span>
                    <div className="flex items-center justify-between text-neon-cyan bg-black/30 border border-zinc-800/60 rounded-xl p-3 font-mono text-xs font-bold uppercase tracking-wider">
                      <div className="flex items-center gap-2.5">
                        <ShieldCheck size={14} className="text-neon-cyan shrink-0" />
                        <span>{customerIdFormatted}</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(customerIdFormatted)}
                        className="text-zinc-500 hover:text-white cursor-pointer"
                        title="Copy ID"
                      >
                        {copiedText === customerIdFormatted ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Email Address</span>
                    <div className="flex items-center gap-2.5 text-white bg-black/30 border border-zinc-800/60 rounded-xl p-3 font-mono text-xs">
                      <Mail size={14} className="text-zinc-500 shrink-0" />
                      <span className="truncate">{user.email}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Password Setter Card */}
            <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 md:p-8 backdrop-blur-md shadow-xl space-y-6">
              <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4">
                <div className="w-10 h-10 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
                  <KeyRound className="text-neon-cyan w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white font-outfit">Set / Update Password</h3>
                  <p className="text-xs text-zinc-500">Configure a secure password to log in directly on any device</p>
                </div>
              </div>

              {passStatus.message && (
                <div className={`p-4 rounded-xl text-xs font-mono flex items-center gap-2 ${
                  passStatus.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {passStatus.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{passStatus.message}</span>
                </div>
              )}

              <div className="flex items-start gap-3 bg-zinc-950/40 border border-zinc-800/60 rounded-xl p-4 text-xs text-zinc-400 leading-relaxed">
                <Info size={16} className="text-neon-cyan shrink-0 mt-0.5" />
                <div>
                  If you auto-registered as a guest while booking a repair, setting a password here lets you sign into TekDoctor from any phone, laptop, or browser using <span className="text-zinc-200 font-mono font-semibold">{user.email}</span>.
                </div>
              </div>

              <form onSubmit={handleSetPassword} className="space-y-4" noValidate>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="newPasswordInput" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                      New Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="newPasswordInput"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className={`w-full bg-zinc-950/60 border ${passErrors.password ? 'border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-xl p-3 pr-10 text-sm text-white focus:outline-none`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-1 cursor-pointer"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {passErrors.password && <p className="text-red-400 text-xs mt-1 font-mono">{passErrors.password}</p>}
                  </div>

                  <div>
                    <label htmlFor="confirmPasswordInput" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                      Confirm Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        id="confirmPasswordInput"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat new password"
                        className={`w-full bg-zinc-950/60 border ${passErrors.confirmPassword ? 'border-red-500' : 'border-zinc-800 focus:border-neon-cyan'} rounded-xl p-3 pr-10 text-sm text-white focus:outline-none`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-1 cursor-pointer"
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {passErrors.confirmPassword && <p className="text-red-400 text-xs mt-1 font-mono">{passErrors.confirmPassword}</p>}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingPass}
                  className="w-full btn-neon py-3 font-bold tracking-[0.15em] uppercase text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 min-h-[44px]"
                >
                  {isSubmittingPass ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                      Updating Security Credentials...
                    </>
                  ) : (
                    'Set New Password'
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Reject Estimate Reason Modal */}
      <AnimatePresence>
        {showRejectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRejectModal(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl z-10 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="text-base font-bold text-white font-outfit flex items-center gap-2">
                  <XCircle className="text-red-400" size={18} /> Decline Repair Estimate
                </h3>
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="text-zinc-500 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-zinc-400">
                Please provide an optional reason for declining this estimate. Our team will review your comments and contact you with alternatives.
              </p>

              <div>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g., Estimated cost exceeds budget, would prefer device return..."
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-red-500 rounded-xl p-3 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-400 hover:text-white min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectEstimate}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider transition-all min-h-[44px]"
                >
                  Confirm Decline
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Receipt / Invoice Statement Modal */}
      <PaymentReceiptModal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        receiptData={receiptData}
        loading={loadingReceipt}
        error={receiptActionError}
      />

      {/* Image Lightbox Preview Modal */}
      <ImagePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        src={previewSrc}
        alt={previewAlt}
      />

      {/* Customer Feedback Modal */}
      {feedbackTicketId && (
        <CustomerFeedbackModal
          isOpen={feedbackOpen}
          onClose={() => {
            setFeedbackOpen(false);
            setFeedbackTicketId(null);
          }}
          ticketId={feedbackTicketId}
          ticketNumber={feedbackTicketNumber}
          onSuccess={() => fetchHistory(historyPage)}
        />
      )}
    </div>
  );
}
