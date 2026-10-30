import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { amcApi, adminApi, extractResponseList, extractResponseData, formatDisplayDate } from '@/services/api';
import {
  ShieldCheck, AlertCircle, CheckCircle2, Clock, Plus, Search,
  Filter, RefreshCw, X, ChevronRight, Eye, Check, Ban, DollarSign,
  Smartphone, FileText, ArrowRightLeft, Users, Building2, Calendar,
  Layers, ChevronDown, Download, AlertTriangle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { SkeletonTable } from '@/components/Skeleton';
import { ConfirmModal } from '@/components/ConfirmModal';

interface AmcOverview {
  totalRequests: number;
  pendingRequests: number;
  activeContracts: number;
  pendingApprovals: number;
  awaitingPayment: number;
  nearingExpiry: number;
  expiredContracts: number;
  pendingReplacements: number;
}

interface AmcPlan {
  id: number;
  plan_code: string;
  name: string;
  description: string;
  base_price: string | number;
  duration_months: number;
  default_device_capacity: number;
  coverage_terms: any;
  is_active: boolean;
}

interface AmcRequest {
  id: number;
  request_number: string;
  company_id: number;
  company_name?: string;
  canonical_company_id?: string;
  plan_id?: number;
  plan_name?: string;
  plan_code?: string;
  requested_device_count: number;
  notes?: string;
  status: 'pending' | 'under_review' | 'offered' | 'rejected' | 'cancelled';
  admin_notes?: string;
  created_at: string;
}

interface AmcContract {
  id: number;
  contract_number: string;
  company_id: number;
  company_name?: string;
  company_email?: string;
  canonical_company_id?: string;
  request_id?: number;
  plan_id?: number;
  contract_type: 'standard' | 'custom' | 'renewal';
  plan_name: string;
  device_capacity: number;
  active_covered_count?: number;
  price: string | number;
  discount_amount: string | number;
  tax_amount: string | number;
  total_amount: string | number;
  currency: string;
  terms_and_conditions?: string;
  offer_valid_until?: string;
  start_date?: string;
  end_date?: string;
  status: 'draft' | 'offered' | 'accepted' | 'rejected' | 'active' | 'expired' | 'cancelled' | 'suspended';
  approval_status: 'pending_approval' | 'approved' | 'rejected';
  payment_status: 'unpaid' | 'pending_verification' | 'paid' | 'failed';
  invoice_id?: string;
  created_at: string;
  coveredDevices?: any[];
  history?: any[];
  replacements?: any[];
}

interface AmcReplacement {
  id: number;
  replacement_number: string;
  contract_id: number;
  contract_number?: string;
  company_id: number;
  company_name?: string;
  canonical_company_id?: string;
  old_device_id: number;
  old_brand?: string;
  old_model?: string;
  old_serial?: string;
  new_device_id: number;
  new_brand?: string;
  new_model?: string;
  new_serial?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  admin_notes?: string;
  created_at: string;
  effective_date?: string;
}

interface CompanyOption {
  id: number;
  company_id?: string;
  permanent_company_id?: string;
  company_name?: string;
  name?: string;
  email?: string;
  is_active?: number | boolean;
}

export default function AdminAmcManagement() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'contracts' | 'requests' | 'plans' | 'replacements'>('contracts');

  // Overview stats
  const [overview, setOverview] = useState<AmcOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  // Contracts
  const [contracts, setContracts] = useState<AmcContract[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [contractSearch, setContractSearch] = useState('');
  const [contractStatusFilter, setContractStatusFilter] = useState('');
  const [selectedContract, setSelectedContract] = useState<AmcContract | null>(null);
  const [contractDrawerOpen, setContractDrawerOpen] = useState(false);
  const [loadingContractDetails, setLoadingContractDetails] = useState(false);

  // Requests
  const [requests, setRequests] = useState<AmcRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestSearch, setRequestSearch] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState('');

  // Plans
  const [plans, setPlans] = useState<AmcPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Replacements
  const [replacements, setReplacements] = useState<AmcReplacement[]>([]);
  const [loadingReplacements, setLoadingReplacements] = useState(false);
  const [replacementStatusFilter, setReplacementStatusFilter] = useState('');

  // Companies for creation dropdown
  const [companiesList, setCompaniesList] = useState<CompanyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [companiesError, setCompaniesError] = useState<string | null>(null);

  // Modals
  const [showCreatePlanModal, setShowCreatePlanModal] = useState(false);
  const [showEditPlanModal, setShowEditPlanModal] = useState(false);
  const [selectedPlanForEdit, setSelectedPlanForEdit] = useState<AmcPlan | null>(null);
  const [showCreateContractModal, setShowCreateContractModal] = useState(false);
  const [showReviewRequestModal, setShowReviewRequestModal] = useState(false);
  const [selectedRequestForReview, setSelectedRequestForReview] = useState<AmcRequest | null>(null);
  const [showReviewReplacementModal, setShowReviewReplacementModal] = useState(false);
  const [selectedReplacementForReview, setSelectedReplacementForReview] = useState<AmcReplacement | null>(null);
  const [showConfirmApproveModal, setShowConfirmApproveModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showVerifyOfflineModal, setShowVerifyOfflineModal] = useState(false);

  // Form States
  const [planForm, setPlanForm] = useState({
    planCode: '',
    name: '',
    description: '',
    basePrice: '',
    durationMonths: '12',
    defaultDeviceCapacity: '10',
    coverageTerms: ''
  });

  const [contractForm, setContractForm] = useState({
    companyId: '',
    requestId: '',
    planId: '',
    contractType: 'standard',
    planName: '',
    deviceCapacity: '10',
    price: '',
    discountAmount: '0',
    taxAmount: '0',
    totalAmount: '',
    termsAndConditions: '',
    offerValidUntil: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
  });

  const [requestReviewForm, setRequestReviewForm] = useState({
    status: 'under_review',
    adminNotes: ''
  });

  const [replacementReviewForm, setReplacementReviewForm] = useState({
    decision: 'approved',
    adminNotes: ''
  });

  const [contractStatusForm, setContractStatusForm] = useState({
    status: 'active',
    reason: ''
  });

  const [verifyOfflineForm, setVerifyOfflineForm] = useState({
    decision: 'verified',
    adminNotes: ''
  });

  // Load Overview Data
  const fetchOverview = async () => {
    if (!token) return;
    setLoadingOverview(true);
    try {
      const res = await amcApi.getAdminOverview(token);
      if (res.ok) {
        setOverview(extractResponseData<AmcOverview | null>(res, null));
      } else {
        toast.error(res.error || 'Failed to load AMC overview statistics.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load AMC overview statistics.');
    } finally {
      setLoadingOverview(false);
    }
  };

  // Load Contracts
  const fetchContracts = async () => {
    if (!token) return;
    setLoadingContracts(true);
    try {
      const res = await amcApi.getAdminContracts(token, {
        status: contractStatusFilter || undefined
      });
      if (res.ok) {
        setContracts(extractResponseList<AmcContract>(res));
      } else {
        setContracts([]);
        toast.error(res.error || 'Failed to load AMC contracts.');
      }
    } catch (err: any) {
      setContracts([]);
      toast.error(err?.message || 'Failed to load AMC contracts.');
    } finally {
      setLoadingContracts(false);
    }
  };

  // Load Requests
  const fetchRequests = async () => {
    if (!token) return;
    setLoadingRequests(true);
    try {
      const res = await amcApi.getAdminRequests(token, {
        status: requestStatusFilter || undefined
      });
      if (res.ok) {
        setRequests(extractResponseList<AmcRequest>(res));
      } else {
        setRequests([]);
        toast.error(res.error || 'Failed to load AMC requests.');
      }
    } catch (err: any) {
      setRequests([]);
      toast.error(err?.message || 'Failed to load AMC requests.');
    } finally {
      setLoadingRequests(false);
    }
  };

  // Load Plans
  const fetchPlans = async () => {
    if (!token) return;
    setLoadingPlans(true);
    try {
      const res = await amcApi.getAdminPlans(token);
      if (res.ok) {
        setPlans(extractResponseList<AmcPlan>(res));
      } else {
        setPlans([]);
        toast.error(res.error || 'Failed to load AMC plans.');
      }
    } catch (err: any) {
      setPlans([]);
      toast.error(err?.message || 'Failed to load AMC plans.');
    } finally {
      setLoadingPlans(false);
    }
  };

  // Load Replacements
  const fetchReplacements = async () => {
    if (!token) return;
    setLoadingReplacements(true);
    try {
      const res = await amcApi.getAdminReplacements(token, {
        status: replacementStatusFilter || undefined
      });
      if (res.ok) {
        setReplacements(extractResponseList<AmcReplacement>(res));
      } else {
        setReplacements([]);
        toast.error(res.error || 'Failed to load replacement requests.');
      }
    } catch (err: any) {
      setReplacements([]);
      toast.error(err?.message || 'Failed to load replacement requests.');
    } finally {
      setLoadingReplacements(false);
    }
  };

  // Load Companies for Dropdown
  const fetchCompanies = async () => {
    if (!token) return;
    setLoadingCompanies(true);
    setCompaniesError(null);
    try {
      const res = await adminApi.getCompanies(token, 1, 200);
      if (res.ok && res.data) {
        const rawList =
          (res.data as any)?.data?.data ||
          (res.data as any)?.data?.companies ||
          (res.data as any)?.companies ||
          extractResponseList<CompanyOption>(res);
        const list = Array.isArray(rawList) ? rawList : [];
        setCompaniesList(list);
      } else {
        const errorMsg = res.error || (res.data as any)?.message || 'Failed to load company directory.';
        setCompaniesError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err: any) {
      const errorMsg = err?.message || 'Error loading companies.';
      setCompaniesError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoadingCompanies(false);
    }
  };

  // Filtered collections with guaranteed array fallbacks
  const filteredContracts = useMemo(() => {
    if (!Array.isArray(contracts)) return [];
    const q = (contractSearch || '').trim().toLowerCase();
    return contracts.filter(c => {
      if (!c) return false;
      const numMatch = (c.contract_number || '').toLowerCase().includes(q);
      const compMatch = (c.company_name || '').toLowerCase().includes(q) || (c.canonical_company_id || '').toLowerCase().includes(q);
      const planMatch = (c.plan_name || '').toLowerCase().includes(q);
      return !q || numMatch || compMatch || planMatch;
    });
  }, [contracts, contractSearch]);

  const filteredRequests = useMemo(() => {
    if (!Array.isArray(requests)) return [];
    const q = (requestSearch || '').trim().toLowerCase();
    return requests.filter(r => {
      if (!r) return false;
      const numMatch = (r.request_number || '').toLowerCase().includes(q);
      const compMatch = (r.company_name || '').toLowerCase().includes(q) || (r.canonical_company_id || '').toLowerCase().includes(q);
      const planMatch = (r.plan_name || '').toLowerCase().includes(q);
      return !q || numMatch || compMatch || planMatch;
    });
  }, [requests, requestSearch]);

  useEffect(() => {
    fetchOverview();
    fetchContracts();
    fetchRequests();
    fetchPlans();
    fetchReplacements();
    fetchCompanies();
  }, [token]);

  // Open Contract Details Drawer
  const handleOpenContractDetails = async (contract: AmcContract) => {
    setSelectedContract(contract);
    setContractDrawerOpen(true);
    setLoadingContractDetails(true);
    try {
      const res = await amcApi.getAdminContractDetails(token!, contract.id);
      if (res.ok) {
        const details = extractResponseData<AmcContract>(res, contract);
        setSelectedContract(details);
      }
    } catch (err: any) {
      toast.error('Failed to load full contract details.');
    } finally {
      setLoadingContractDetails(false);
    }
  };

  // Actions
  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planForm.planCode || !planForm.name || !planForm.basePrice) {
      toast.error('Plan Code, Name, and Base Price are required.');
      return;
    }
    try {
      const res = await amcApi.createPlan(token!, {
        ...planForm,
        basePrice: parseFloat(planForm.basePrice),
        durationMonths: parseInt(planForm.durationMonths, 10),
        defaultDeviceCapacity: parseInt(planForm.defaultDeviceCapacity, 10),
      });
      if (res.ok) {
        toast.success('AMC Plan created successfully.');
        setShowCreatePlanModal(false);
        setPlanForm({ planCode: '', name: '', description: '', basePrice: '', durationMonths: '12', defaultDeviceCapacity: '10', coverageTerms: '' });
        fetchPlans();
      } else {
        toast.error(res.error || (res.data as any)?.message || 'Failed to create plan.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error creating plan.');
    }
  };

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanForEdit) return;
    try {
      const res = await amcApi.updatePlan(token!, selectedPlanForEdit.id, {
        name: planForm.name,
        description: planForm.description,
        basePrice: parseFloat(planForm.basePrice),
        durationMonths: parseInt(planForm.durationMonths, 10),
        defaultDeviceCapacity: parseInt(planForm.defaultDeviceCapacity, 10),
        coverageTerms: planForm.coverageTerms
      });
      if (res.ok) {
        toast.success('AMC Plan updated successfully.');
        setShowEditPlanModal(false);
        fetchPlans();
      } else {
        toast.error(res.error || (res.data as any)?.message || 'Failed to update plan.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating plan.');
    }
  };

  const handleTogglePlan = async (plan: AmcPlan) => {
    try {
      const res = await amcApi.togglePlanStatus(token!, plan.id);
      if (res.ok) {
        toast.success(`Plan ${plan.name} status updated.`);
        fetchPlans();
      }
    } catch (err: any) {
      toast.error('Failed to toggle plan status.');
    }
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractForm.companyId || !contractForm.planName || !contractForm.price) {
      toast.error('Company, Plan Name, and Price are required.');
      return;
    }
    if (!contractForm.startDate || !contractForm.endDate) {
      toast.error('Contract Start Date and Contract End Date are required.');
      return;
    }
    const startD = new Date(contractForm.startDate);
    const endD = new Date(contractForm.endDate);
    if (isNaN(startD.getTime()) || isNaN(endD.getTime())) {
      toast.error('Please enter valid dates for Contract Start Date and End Date.');
      return;
    }
    if (endD < startD) {
      toast.error('Contract End Date cannot be earlier than Contract Start Date.');
      return;
    }
    try {
      const price = parseFloat(contractForm.price);
      const discount = parseFloat(contractForm.discountAmount || '0');
      const tax = parseFloat(contractForm.taxAmount || '0');
      const totalAmount = contractForm.totalAmount ? parseFloat(contractForm.totalAmount) : (price - discount + tax);

      const res = await amcApi.createContract(token!, {
        companyId: parseInt(contractForm.companyId, 10),
        requestId: contractForm.requestId ? parseInt(contractForm.requestId, 10) : undefined,
        planId: contractForm.planId ? parseInt(contractForm.planId, 10) : undefined,
        contractType: contractForm.contractType,
        planName: contractForm.planName,
        deviceCapacity: parseInt(contractForm.deviceCapacity, 10),
        price,
        discountAmount: discount,
        taxAmount: tax,
        totalAmount,
        termsAndConditions: contractForm.termsAndConditions,
        offerValidUntil: contractForm.offerValidUntil || undefined,
        startDate: contractForm.startDate || undefined,
        endDate: contractForm.endDate || undefined
      });

      if (res.ok) {
        toast.success(`AMC Contract ${res.data?.contractNumber} created.`);
        setShowCreateContractModal(false);
        fetchContracts();
        fetchOverview();
      } else {
        toast.error(res.error || (res.data as any)?.message || 'Failed to create contract.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error creating contract.');
    }
  };

  const handleReviewRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequestForReview) return;
    try {
      const res = await amcApi.reviewRequest(token!, selectedRequestForReview.id, requestReviewForm);
      if (res.ok) {
        toast.success('AMC Request review saved.');
        setShowReviewRequestModal(false);
        fetchRequests();
        fetchOverview();
      } else {
        toast.error(res.error || (res.data as any)?.message || 'Failed to review request.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving request review.');
    }
  };

  const handleApproveContract = async () => {
    if (!selectedContract) return;
    try {
      const res = await amcApi.approveContract(token!, selectedContract.id);
      if (res.ok) {
        toast.success(`Contract ${selectedContract.contract_number} approved.`);
        setShowConfirmApproveModal(false);
        fetchContracts();
        fetchOverview();
        if (contractDrawerOpen) handleOpenContractDetails(selectedContract);
      } else {
        toast.error(res.error || (res.data as any)?.message || 'Failed to approve contract.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error approving contract.');
    }
  };

  const handleUpdateContractStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContract) return;
    try {
      const res = await amcApi.updateContractStatus(token!, selectedContract.id, contractStatusForm);
      if (res.ok) {
        toast.success(`Contract status changed to ${contractStatusForm.status}.`);
        setShowStatusModal(false);
        fetchContracts();
        fetchOverview();
        if (contractDrawerOpen) handleOpenContractDetails(selectedContract);
      } else {
        toast.error(res.error || (res.data as any)?.message || 'Failed to update contract status.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating status.');
    }
  };

  const handleVerifyOfflinePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContract) return;
    try {
      const res = await amcApi.verifyOfflinePayment(token!, selectedContract.id, {
        decision: verifyOfflineForm.decision as 'verified' | 'rejected',
        adminNotes: verifyOfflineForm.adminNotes
      });
      if (res.ok) {
        toast.success(`Offline payment ${verifyOfflineForm.decision} successfully.`);
        setShowVerifyOfflineModal(false);
        fetchContracts();
        fetchOverview();
        if (contractDrawerOpen) handleOpenContractDetails(selectedContract);
      } else {
        toast.error(res.error || (res.data as any)?.message || 'Failed to verify payment.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error verifying payment.');
    }
  };

  const handleReviewReplacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReplacementForReview) return;
    try {
      const res = await amcApi.reviewReplacement(token!, selectedReplacementForReview.id, {
        decision: replacementReviewForm.decision as 'approved' | 'rejected',
        adminNotes: replacementReviewForm.adminNotes
      });
      if (res.ok) {
        toast.success(`Replacement request ${replacementReviewForm.decision}.`);
        setShowReviewReplacementModal(false);
        fetchReplacements();
        fetchOverview();
      } else {
        toast.error(res.error || (res.data as any)?.message || 'Failed to review replacement.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error reviewing replacement.');
    }
  };

  // Status Badge Colors
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>;
      case 'offered':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Offered</span>;
      case 'accepted':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Accepted</span>;
      case 'suspended':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Suspended</span>;
      case 'cancelled':
      case 'rejected':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-500/10 text-red-400 border border-red-500/20">{status}</span>;
      case 'expired':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">Expired</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-800 text-zinc-300">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-indigo-400" />
            AMC Contract & Fleet Management
          </h1>
          <p className="text-sm text-zinc-400">
            Authoritative lifecycle control for corporate maintenance contracts, published plans, device quotas, and replacements.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchOverview();
              fetchContracts();
              fetchRequests();
              fetchPlans();
              fetchReplacements();
              fetchCompanies();
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            onClick={() => {
              if (companiesList.length === 0) {
                fetchCompanies();
              }
              setContractForm({
                companyId: '',
                requestId: '',
                planId: '',
                contractType: 'standard',
                planName: 'Corporate Annual Maintenance',
                deviceCapacity: '10',
                price: '14999',
                discountAmount: '0',
                taxAmount: '2700',
                totalAmount: '17699',
                termsAndConditions: 'Comprehensive hardware maintenance & priority on-site support included.',
                offerValidUntil: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
                startDate: new Date().toISOString().slice(0, 10),
                endDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
              });
              setShowCreateContractModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 transition"
          >
            <Plus className="h-4 w-4" />
            Create AMC Offer / Contract
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Active Contracts</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">{overview?.activeContracts ?? '--'}</div>
          <p className="text-[11px] text-zinc-500 mt-1">Currently active maintenance coverage</p>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Pending Approvals</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">{overview?.pendingApprovals ?? '--'}</div>
          <p className="text-[11px] text-zinc-500 mt-1">Contracts awaiting admin review</p>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Unpaid / Awaiting Pay</span>
            <DollarSign className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white">{overview?.awaitingPayment ?? '--'}</div>
          <p className="text-[11px] text-zinc-500 mt-1">Unpaid or pending verification</p>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Pending Replacements</span>
            <ArrowRightLeft className="h-4 w-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400">{overview?.pendingReplacements ?? '--'}</div>
          <p className="text-[11px] text-zinc-500 mt-1">Device replacement approvals queued</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-800">
        <nav className="flex space-x-6">
          <button
            onClick={() => setActiveTab('contracts')}
            className={`py-3 text-sm font-medium border-b-2 transition ${
              activeTab === 'contracts'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Contracts ({Array.isArray(contracts) ? contracts.length : 0})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`py-3 text-sm font-medium border-b-2 transition ${
              activeTab === 'requests'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Inquiries & Requests ({Array.isArray(requests) ? requests.length : 0})
          </button>
          <button
            onClick={() => setActiveTab('plans')}
            className={`py-3 text-sm font-medium border-b-2 transition ${
              activeTab === 'plans'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Standard Plans ({Array.isArray(plans) ? plans.length : 0})
          </button>
          <button
            onClick={() => setActiveTab('replacements')}
            className={`py-3 text-sm font-medium border-b-2 transition ${
              activeTab === 'replacements'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Device Replacements ({Array.isArray(replacements) ? replacements.length : 0})
          </button>
        </nav>
      </div>

      {/* ── Tab 1: Contracts ── */}
      {activeTab === 'contracts' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <div className="flex items-center gap-2 flex-1 max-w-md bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300">
              <Search className="h-4 w-4 text-zinc-500 shrink-0" />
              <input
                type="text"
                placeholder="Search contract number, company, or plan..."
                value={contractSearch}
                onChange={(e) => setContractSearch(e.target.value)}
                className="bg-transparent border-none outline-none w-full text-zinc-200 placeholder:text-zinc-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={contractStatusFilter}
                onChange={(e) => {
                  setContractStatusFilter(e.target.value);
                  fetchContracts();
                }}
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-3 py-2 outline-none"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="offered">Offered</option>
                <option value="accepted">Accepted</option>
                <option value="draft">Draft</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          </div>

          {loadingContracts ? (
            <SkeletonTable rows={5} columns={6} />
          ) : !Array.isArray(contracts) || contracts.length === 0 ? (
            <div className="text-center py-12 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
              <ShieldCheck className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-300 font-medium">No AMC contracts found</p>
              <p className="text-xs text-zinc-500 mt-1">Create an AMC offer or convert a company request.</p>
            </div>
          ) : filteredContracts.length === 0 ? (
            <div className="text-center py-12 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
              <ShieldCheck className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-300 font-medium">No matching AMC contracts</p>
              <p className="text-xs text-zinc-500 mt-1">Try adjusting your search query or status filter.</p>
            </div>
          ) : (
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-300">
                  <thead className="bg-zinc-900/80 text-xs text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="px-4 py-3">Contract #</th>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Plan / Capacity</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Contract Status</th>
                      <th className="px-4 py-3">Approval</th>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredContracts.map((c) => (
                        <tr key={c.id} className="hover:bg-zinc-800/30 transition">
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-indigo-400">
                            {c.contract_number}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-white">{c.company_name || `Company #${c.company_id}`}</div>
                            <div className="text-[11px] text-zinc-500 font-mono">{c.canonical_company_id || 'CMP-XXX'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{c.plan_name}</div>
                            <div className="text-[11px] text-zinc-400">
                              {c.active_covered_count ?? 0} / {c.device_capacity} Devices Covered
                            </div>
                            {c.start_date && (
                              <div className="text-[10px] text-zinc-500 font-mono">
                                {formatDisplayDate(c.start_date)} &rarr; {formatDisplayDate(c.end_date)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono font-medium text-zinc-200">
                            ₹{Number(c.total_amount).toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3">
                            {getStatusBadge(c.status)}
                          </td>
                          <td className="px-4 py-3">
                            {c.approval_status === 'approved' ? (
                              <span className="text-xs text-emerald-400 flex items-center gap-1">
                                <Check className="h-3 w-3" /> Approved
                              </span>
                            ) : c.approval_status === 'rejected' ? (
                              <span className="text-xs text-red-400">Rejected</span>
                            ) : (
                              <span className="text-xs text-amber-400 flex items-center gap-1">
                                <Clock className="h-3 w-3" /> Pending
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {c.payment_status === 'paid' ? (
                              <span className="text-xs text-emerald-400 font-medium">Paid</span>
                            ) : c.payment_status === 'pending_verification' ? (
                              <span className="text-xs text-amber-400 font-medium">Verify Req</span>
                            ) : (
                              <span className="text-xs text-zinc-500">Unpaid</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleOpenContractDetails(c)}
                              className="px-2.5 py-1 text-xs font-medium rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition"
                            >
                              Manage
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Requests ── */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <div className="flex items-center gap-2 flex-1 max-w-md bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300">
              <Search className="h-4 w-4 text-zinc-500 shrink-0" />
              <input
                type="text"
                placeholder="Search requests by number, company, or plan..."
                value={requestSearch}
                onChange={(e) => setRequestSearch(e.target.value)}
                className="bg-transparent border-none outline-none w-full text-zinc-200 placeholder:text-zinc-500"
              />
            </div>
            <select
              value={requestStatusFilter}
              onChange={(e) => {
                setRequestStatusFilter(e.target.value);
                fetchRequests();
              }}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-3 py-2 outline-none"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="under_review">Under Review</option>
              <option value="offered">Offered</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {loadingRequests ? (
            <SkeletonTable rows={5} columns={6} />
          ) : !Array.isArray(requests) || requests.length === 0 ? (
            <div className="text-center py-12 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
              <FileText className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-300 font-medium">No AMC inquiries submitted yet</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-12 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
              <FileText className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-300 font-medium">No matching AMC inquiries</p>
              <p className="text-xs text-zinc-500 mt-1">Try adjusting your search query or status filter.</p>
            </div>
          ) : (
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-300">
                  <thead className="bg-zinc-900/80 text-xs text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="px-4 py-3">Request #</th>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Requested Plan</th>
                      <th className="px-4 py-3">Fleet Devices</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Submitted</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredRequests.map((r) => (
                        <tr key={r.id} className="hover:bg-zinc-800/30 transition">
                          <td className="px-4 py-3 font-mono text-xs text-indigo-400 font-medium">
                            {r.request_number}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-white">{r.company_name || `Company #${r.company_id}`}</div>
                            <div className="text-[11px] text-zinc-500 font-mono">{r.canonical_company_id || ''}</div>
                          </td>
                          <td className="px-4 py-3">
                            {r.plan_name ? `${r.plan_name} (${r.plan_code})` : 'Custom Specification'}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {r.requested_device_count} devices
                          </td>
                          <td className="px-4 py-3">
                            {getStatusBadge(r.status)}
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-500">
                            {new Date(r.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedRequestForReview(r);
                                setRequestReviewForm({
                                  status: r.status,
                                  adminNotes: r.admin_notes || ''
                                });
                                setShowReviewRequestModal(true);
                              }}
                              className="px-2.5 py-1 text-xs font-medium rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition"
                            >
                              Review
                            </button>
                            <button
                              onClick={() => {
                                if (companiesList.length === 0) {
                                  fetchCompanies();
                                }
                                setContractForm({
                                  companyId: String(r.company_id),
                                  requestId: String(r.id),
                                  planId: r.plan_id ? String(r.plan_id) : '',
                                  contractType: 'standard',
                                  planName: r.plan_name || 'Standard Fleet Maintenance',
                                  deviceCapacity: String(r.requested_device_count || 10),
                                  price: '14999',
                                  discountAmount: '0',
                                  taxAmount: '2700',
                                  totalAmount: '17699',
                                  termsAndConditions: 'Hardware maintenance agreement with priority SLA.',
                                  offerValidUntil: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
                                  startDate: new Date().toISOString().slice(0, 10),
                                  endDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
                                });
                                setShowCreateContractModal(true);
                              }}
                              className="px-2.5 py-1 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-500 transition"
                            >
                              Offer
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 3: Plans ── */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-zinc-400">
              Published standard AMC plans available for customer selection and contract quotation.
            </p>
            <button
              onClick={() => {
                setPlanForm({
                  planCode: '',
                  name: '',
                  description: '',
                  basePrice: '',
                  durationMonths: '12',
                  defaultDeviceCapacity: '10',
                  coverageTerms: 'Priority SLA response, preventative diagnostics, zero diagnostic fee.'
                });
                setShowCreatePlanModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Plan
            </button>
          </div>

          {loadingPlans ? (
            <SkeletonTable rows={3} columns={3} />
          ) : !Array.isArray(plans) || plans.length === 0 ? (
            <div className="text-center py-12 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
              <Layers className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-300 font-medium">No AMC plans found</p>
              <p className="text-xs text-zinc-500 mt-1">Add a new plan to populate the catalog.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map((p) => (
                <div
                  key={p.id}
                  className={`bg-zinc-900/60 border rounded-xl p-5 flex flex-col justify-between transition ${
                    p.is_active ? 'border-zinc-800' : 'border-zinc-800/40 opacity-60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-indigo-400">{p.plan_code}</span>
                      <button
                        onClick={() => handleTogglePlan(p)}
                        className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                          p.is_active
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}
                      >
                        {p.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">{p.name}</h3>
                    <p className="text-xs text-zinc-400 line-clamp-2 mb-4">{p.description || 'Standard corporate AMC package.'}</p>

                    <div className="space-y-2 border-t border-zinc-800/80 pt-3 text-xs text-zinc-300">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Base Price:</span>
                        <span className="font-mono font-bold text-white">₹{Number(p.base_price).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Duration:</span>
                        <span>{p.duration_months} Months</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Default Capacity:</span>
                        <span className="font-semibold text-indigo-400">{p.default_device_capacity} Devices</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-zinc-800/80 pt-4 mt-4 flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setSelectedPlanForEdit(p);
                        setPlanForm({
                          planCode: p.plan_code,
                          name: p.name,
                          description: p.description || '',
                          basePrice: String(p.base_price),
                          durationMonths: String(p.duration_months),
                          defaultDeviceCapacity: String(p.default_device_capacity),
                          coverageTerms: typeof p.coverage_terms === 'string' ? p.coverage_terms : JSON.stringify(p.coverage_terms || '')
                        });
                        setShowEditPlanModal(true);
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 4: Replacements ── */}
      {activeTab === 'replacements' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-zinc-400">
              Admin review for hardware device replacement requests. Pending requests retain existing coverage until approved.
            </p>
            <select
              value={replacementStatusFilter}
              onChange={(e) => {
                setReplacementStatusFilter(e.target.value);
                fetchReplacements();
              }}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-3 py-2 outline-none"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {loadingReplacements ? (
            <SkeletonTable rows={4} columns={6} />
          ) : !Array.isArray(replacements) || replacements.length === 0 ? (
            <div className="text-center py-12 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
              <ArrowRightLeft className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-300 font-medium">No device replacement requests found</p>
            </div>
          ) : (
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-300">
                  <thead className="bg-zinc-900/80 text-xs text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="px-4 py-3">Replacement #</th>
                      <th className="px-4 py-3">Contract / Company</th>
                      <th className="px-4 py-3">Current (Old) Device</th>
                      <th className="px-4 py-3">Replacement (New) Device</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {(Array.isArray(replacements) ? replacements : []).map((r) => (
                      <tr key={r.id} className="hover:bg-zinc-800/30 transition">
                        <td className="px-4 py-3 font-mono text-xs text-indigo-400 font-medium">
                          {r.replacement_number}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs">{r.contract_number}</div>
                          <div className="text-xs text-zinc-400">{r.company_name}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{r.old_brand} {r.old_model}</div>
                          <div className="text-[11px] font-mono text-zinc-500">SN: {r.old_serial}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-emerald-400">{r.new_brand} {r.new_model}</div>
                          <div className="text-[11px] font-mono text-zinc-500">SN: {r.new_serial}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-400 max-w-xs truncate">
                          {r.reason}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(r.status)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.status === 'pending' ? (
                            <button
                              onClick={() => {
                                setSelectedReplacementForReview(r);
                                setReplacementReviewForm({ decision: 'approved', adminNotes: '' });
                                setShowReviewReplacementModal(true);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-indigo-600 text-white hover:bg-indigo-500 transition"
                            >
                              Review
                            </button>
                          ) : (
                            <span className="text-xs text-zinc-500">Reviewed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Contract Detail Drawer ── */}
      {contractDrawerOpen && selectedContract && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 h-full overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                <span className="text-xs font-mono text-indigo-400 font-bold uppercase tracking-wider">AMC Contract Details</span>
                <h2 className="text-xl font-bold text-white">{selectedContract.contract_number}</h2>
              </div>
              <button
                onClick={() => setContractDrawerOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loadingContractDetails ? (
              <div className="text-center py-12 text-zinc-400">Loading details...</div>
            ) : (
              <>
                {/* Meta Grid */}
                <div className="grid grid-cols-2 gap-4 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 text-xs">
                  <div>
                    <span className="text-zinc-500 block mb-0.5">Company:</span>
                    <span className="font-semibold text-white">{selectedContract.company_name}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block mb-0.5">Plan Name:</span>
                    <span className="font-semibold text-white">{selectedContract.plan_name}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block mb-0.5">Contract Status:</span>
                    {getStatusBadge(selectedContract.status)}
                  </div>
                  <div>
                    <span className="text-zinc-500 block mb-0.5">Approval Status:</span>
                    <span className="font-semibold text-white uppercase">{selectedContract.approval_status}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block mb-0.5">Payment Status:</span>
                    <span className="font-semibold text-white uppercase">{selectedContract.payment_status}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block mb-0.5">Total Amount:</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">₹{Number(selectedContract.total_amount).toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block mb-0.5">Coverage Start Date:</span>
                    <span className="font-mono text-zinc-300">{selectedContract.start_date ? formatDisplayDate(selectedContract.start_date) : 'Pending Activation'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block mb-0.5">Coverage End Date:</span>
                    <span className="font-mono text-zinc-300">{selectedContract.end_date ? formatDisplayDate(selectedContract.end_date) : 'Pending Activation'}</span>
                  </div>
                </div>

                {/* Capacity Progress */}
                <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Device Quota Capacity:</span>
                    <span className="font-mono font-bold text-white">
                      {selectedContract.coveredDevices?.length || 0} / {selectedContract.device_capacity} Slots Covered
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (((selectedContract.coveredDevices?.length || 0) / (selectedContract.device_capacity || 1)) * 100))}%`
                      }}
                    />
                  </div>
                </div>

                {/* Quick Admin Actions */}
                <div className="border border-zinc-800 p-4 rounded-xl bg-zinc-900/30 space-y-3">
                  <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Admin Contract Controls</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedContract.approval_status !== 'approved' && (
                      <button
                        onClick={() => setShowConfirmApproveModal(true)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition"
                      >
                        Approve Contract
                      </button>
                    )}
                    {selectedContract.payment_status === 'pending_verification' && (
                      <button
                        onClick={() => {
                          setVerifyOfflineForm({ decision: 'verified', adminNotes: '' });
                          setShowVerifyOfflineModal(true);
                        }}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition"
                      >
                        Verify Offline Payment
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setContractStatusForm({ status: selectedContract.status, reason: '' });
                        setShowStatusModal(true);
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
                    >
                      Change Status (Suspend / Cancel)
                    </button>
                  </div>
                </div>

                {/* Covered Devices Table */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-white flex items-center justify-between">
                    <span>Actively Covered Fleet Devices ({Array.isArray(selectedContract.coveredDevices) ? selectedContract.coveredDevices.length : 0})</span>
                  </h4>
                  {(!Array.isArray(selectedContract.coveredDevices) || selectedContract.coveredDevices.length === 0) ? (
                    <p className="text-xs text-zinc-500 italic bg-zinc-900/30 p-3 rounded-lg border border-zinc-800/60">
                      No devices have been assigned to this contract yet. Company can select devices up to {selectedContract.device_capacity} slots.
                    </p>
                  ) : (
                    <div className="border border-zinc-800 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs text-zinc-300">
                        <thead className="bg-zinc-900 text-zinc-400">
                          <tr>
                            <th className="px-3 py-2">AMC Tag</th>
                            <th className="px-3 py-2">Hardware Device</th>
                            <th className="px-3 py-2">Serial Number</th>
                            <th className="px-3 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {selectedContract.coveredDevices.map((d: any) => (
                            <tr key={d.id} className="hover:bg-zinc-900/50">
                              <td className="px-3 py-2 font-mono font-bold text-indigo-400">{d.amc_tag}</td>
                              <td className="px-3 py-2">{d.brand} {d.model_number}</td>
                              <td className="px-3 py-2 font-mono text-zinc-400">{d.serial_number}</td>
                              <td className="px-3 py-2">{getStatusBadge(d.status)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Audit History */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-white">Contract Audit Trail</h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {Array.isArray(selectedContract.history) && selectedContract.history.length > 0 ? (
                      selectedContract.history.map((h: any) => (
                        <div key={h.id} className="text-xs bg-zinc-900/30 p-2 rounded border border-zinc-800/60 flex justify-between items-center">
                          <div>
                            <span className="font-mono font-semibold text-zinc-300">{h.action}</span>
                            {h.performed_by_name && <span className="text-zinc-500 ml-2">by {h.performed_by_name}</span>}
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono">{new Date(h.created_at).toLocaleString()}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-zinc-500 italic">No audit records found.</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Create Contract ── */}
      {showCreateContractModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white">Create AMC Offer / Contract</h3>
              <button onClick={() => setShowCreateContractModal(false)} className="text-zinc-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateContract} className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-zinc-400 block">Target Company *</label>
                  {loadingCompanies && (
                    <span className="text-[11px] text-zinc-500 animate-pulse">Loading companies...</span>
                  )}
                  {companiesError && (
                    <button
                      type="button"
                      onClick={fetchCompanies}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-medium"
                    >
                      Retry
                    </button>
                  )}
                </div>
                <select
                  required
                  value={contractForm.companyId}
                  onChange={(e) => setContractForm({ ...contractForm, companyId: e.target.value })}
                  disabled={loadingCompanies && companiesList.length === 0}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none focus:border-indigo-500 disabled:opacity-50"
                >
                  <option value="">
                    {loadingCompanies ? 'Loading Corporate Clients...' : 'Select Corporate Client...'}
                  </option>
                  {(Array.isArray(companiesList) ? companiesList : []).map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.company_name || c.name || c.email} ({c.company_id || c.permanent_company_id || `CMP-${String(c.id).padStart(3, '0')}`}){c.is_active === 0 || c.is_active === false ? ' [Inactive]' : ''}
                    </option>
                  ))}
                  {!loadingCompanies && companiesList.length === 0 && (
                    <option value="" disabled>No registered corporate clients found</option>
                  )}
                </select>
                {companiesError ? (
                  <p className="text-[11px] text-red-400 mt-1">{companiesError}</p>
                ) : !loadingCompanies && companiesList.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 mt-1">No corporate accounts registered yet.</p>
                ) : null}
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Plan / Package Name *</label>
                <input
                  type="text"
                  required
                  value={contractForm.planName}
                  onChange={(e) => setContractForm({ ...contractForm, planName: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none"
                  placeholder="e.g. Corporate Fleet Maintenance Standard"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Approved Device Capacity *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={contractForm.deviceCapacity}
                    onChange={(e) => setContractForm({ ...contractForm, deviceCapacity: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Contract Type</label>
                  <select
                    value={contractForm.contractType}
                    onChange={(e) => setContractForm({ ...contractForm, contractType: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none"
                  >
                    <option value="standard">Standard</option>
                    <option value="custom">Custom Offer</option>
                    <option value="renewal">Renewal</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Base Price (₹) *</label>
                  <input
                    type="number"
                    required
                    value={contractForm.price}
                    onChange={(e) => {
                      const p = parseFloat(e.target.value || '0');
                      const d = parseFloat(contractForm.discountAmount || '0');
                      const t = parseFloat(contractForm.taxAmount || '0');
                      setContractForm({ ...contractForm, price: e.target.value, totalAmount: String(p - d + t) });
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Discount (₹)</label>
                  <input
                    type="number"
                    value={contractForm.discountAmount}
                    onChange={(e) => {
                      const d = parseFloat(e.target.value || '0');
                      const p = parseFloat(contractForm.price || '0');
                      const t = parseFloat(contractForm.taxAmount || '0');
                      setContractForm({ ...contractForm, discountAmount: e.target.value, totalAmount: String(p - d + t) });
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Tax Amount (₹)</label>
                  <input
                    type="number"
                    value={contractForm.taxAmount}
                    onChange={(e) => {
                      const t = parseFloat(e.target.value || '0');
                      const p = parseFloat(contractForm.price || '0');
                      const d = parseFloat(contractForm.discountAmount || '0');
                      setContractForm({ ...contractForm, taxAmount: e.target.value, totalAmount: String(p - d + t) });
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Net Total Amount (₹) *</label>
                <input
                  type="number"
                  required
                  value={contractForm.totalAmount}
                  onChange={(e) => setContractForm({ ...contractForm, totalAmount: e.target.value })}
                  className="w-full bg-zinc-900 border border-indigo-500/50 rounded-lg px-3 py-2 text-emerald-400 font-mono font-bold outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Contract Start Date *</label>
                  <input
                    type="date"
                    required
                    value={contractForm.startDate}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      let newEnd = contractForm.endDate;
                      if (!newEnd || (newStart && new Date(newEnd) < new Date(newStart))) {
                        const sDate = new Date(newStart);
                        if (!isNaN(sDate.getTime())) {
                          sDate.setFullYear(sDate.getFullYear() + 1);
                          newEnd = sDate.toISOString().slice(0, 10);
                        }
                      }
                      setContractForm({ ...contractForm, startDate: newStart, endDate: newEnd });
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Contract End Date *</label>
                  <input
                    type="date"
                    required
                    min={contractForm.startDate || undefined}
                    value={contractForm.endDate}
                    onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Offer Valid Until</label>
                  <input
                    type="date"
                    value={contractForm.offerValidUntil}
                    onChange={(e) => setContractForm({ ...contractForm, offerValidUntil: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Terms / Notes</label>
                  <input
                    type="text"
                    value={contractForm.termsAndConditions}
                    onChange={(e) => setContractForm({ ...contractForm, termsAndConditions: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateContractModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
                >
                  Create Contract Offer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Create/Edit Plan ── */}
      {(showCreatePlanModal || showEditPlanModal) && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white">
                {showCreatePlanModal ? 'Create Standard AMC Plan' : 'Edit AMC Plan'}
              </h3>
              <button
                onClick={() => {
                  setShowCreatePlanModal(false);
                  setShowEditPlanModal(false);
                }}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={showCreatePlanModal ? handleCreatePlan : handleUpdatePlan} className="space-y-3 text-xs">
              {showCreatePlanModal && (
                <div>
                  <label className="text-zinc-400 block mb-1">Plan Code *</label>
                  <input
                    type="text"
                    required
                    value={planForm.planCode}
                    onChange={(e) => setPlanForm({ ...planForm, planCode: e.target.value.toUpperCase() })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none font-mono"
                    placeholder="e.g. AMC-CORP-25"
                  />
                </div>
              )}

              <div>
                <label className="text-zinc-400 block mb-1">Plan Name *</label>
                <input
                  type="text"
                  required
                  value={planForm.name}
                  onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Description</label>
                <textarea
                  rows={2}
                  value={planForm.description}
                  onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-zinc-400 block mb-1">Base Price (₹) *</label>
                  <input
                    type="number"
                    required
                    value={planForm.basePrice}
                    onChange={(e) => setPlanForm({ ...planForm, basePrice: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Duration (Months)</label>
                  <input
                    type="number"
                    required
                    value={planForm.durationMonths}
                    onChange={(e) => setPlanForm({ ...planForm, durationMonths: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Device Slots</label>
                  <input
                    type="number"
                    required
                    value={planForm.defaultDeviceCapacity}
                    onChange={(e) => setPlanForm({ ...planForm, defaultDeviceCapacity: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Coverage Terms Summary</label>
                <textarea
                  rows={2}
                  value={planForm.coverageTerms}
                  onChange={(e) => setPlanForm({ ...planForm, coverageTerms: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none"
                  placeholder="e.g. Free diagnostic, preventive servicing every quarter, priority replacement."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreatePlanModal(false);
                    setShowEditPlanModal(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
                >
                  {showCreatePlanModal ? 'Create Plan' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Review Request ── */}
      {showReviewRequestModal && selectedRequestForReview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white">Review AMC Request</h3>
              <button onClick={() => setShowReviewRequestModal(false)} className="text-zinc-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800 text-xs space-y-1">
              <div><span className="text-zinc-500">Request:</span> <span className="font-mono text-white">{selectedRequestForReview.request_number}</span></div>
              <div><span className="text-zinc-500">Company:</span> <span className="text-white">{selectedRequestForReview.company_name}</span></div>
              <div><span className="text-zinc-500">Devices:</span> <span className="text-white">{selectedRequestForReview.requested_device_count}</span></div>
              {selectedRequestForReview.notes && (
                <div><span className="text-zinc-500">Company Notes:</span> <span className="text-zinc-300 italic">{selectedRequestForReview.notes}</span></div>
              )}
            </div>

            <form onSubmit={handleReviewRequest} className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Decision / Status *</label>
                <select
                  value={requestReviewForm.status}
                  onChange={(e) => setRequestReviewForm({ ...requestReviewForm, status: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none"
                >
                  <option value="under_review">Under Review</option>
                  <option value="offered">Offered (Quotation Sent)</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Admin Notes (visible to company)</label>
                <textarea
                  rows={3}
                  value={requestReviewForm.adminNotes}
                  onChange={(e) => setRequestReviewForm({ ...requestReviewForm, adminNotes: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none"
                  placeholder="Provide guidance or reasons for status change..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowReviewRequestModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
                >
                  Save Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Review Replacement ── */}
      {showReviewReplacementModal && selectedReplacementForReview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white">Review Device Replacement</h3>
              <button onClick={() => setShowReviewReplacementModal(false)} className="text-zinc-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800 text-xs space-y-2">
              <div><span className="text-zinc-500">Replacement #:</span> <span className="font-mono text-white">{selectedReplacementForReview.replacement_number}</span></div>
              <div><span className="text-zinc-500">Old Covered Device:</span> <span className="text-white">{selectedReplacementForReview.old_brand} {selectedReplacementForReview.old_model} ({selectedReplacementForReview.old_serial})</span></div>
              <div><span className="text-zinc-500">Proposed Device:</span> <span className="text-emerald-400">{selectedReplacementForReview.new_brand} {selectedReplacementForReview.new_model} ({selectedReplacementForReview.new_serial})</span></div>
              <div><span className="text-zinc-500">Reason:</span> <span className="text-zinc-300 italic">{selectedReplacementForReview.reason}</span></div>
            </div>

            <form onSubmit={handleReviewReplacement} className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Decision *</label>
                <select
                  value={replacementReviewForm.decision}
                  onChange={(e) => setReplacementReviewForm({ ...replacementReviewForm, decision: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none"
                >
                  <option value="approved">Approve Replacement</option>
                  <option value="rejected">Reject Replacement</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Admin Notes</label>
                <textarea
                  rows={2}
                  value={replacementReviewForm.adminNotes}
                  onChange={(e) => setReplacementReviewForm({ ...replacementReviewForm, adminNotes: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none"
                  placeholder="Verification details or rejection reason..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowReviewReplacementModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-1.5 rounded-lg font-semibold text-white ${
                    replacementReviewForm.decision === 'approved' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                  }`}
                >
                  Submit Decision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Confirm Approve Contract ── */}
      <ConfirmModal
        isOpen={showConfirmApproveModal}
        title="Approve AMC Contract"
        message={`Are you sure you want to approve contract ${selectedContract?.contract_number}? If payment is already settled, this contract will automatically become ACTIVE.`}
        confirmText="Approve Contract"
        variant="primary"
        onConfirm={handleApproveContract}
        onCancel={() => setShowConfirmApproveModal(false)}
      />

      {/* ── Modal: Update Contract Status ── */}
      {showStatusModal && selectedContract && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white">Change Contract Status</h3>
              <button onClick={() => setShowStatusModal(false)} className="text-zinc-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateContractStatus} className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">New Status</label>
                <select
                  value={contractStatusForm.status}
                  onChange={(e) => setContractStatusForm({ ...contractStatusForm, status: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Reason / Notes</label>
                <input
                  type="text"
                  required
                  value={contractStatusForm.reason}
                  onChange={(e) => setContractStatusForm({ ...contractStatusForm, reason: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none"
                  placeholder="Reason for administrative status override..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowStatusModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
                >
                  Update Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Verify Offline Payment ── */}
      {showVerifyOfflineModal && selectedContract && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white">Verify Offline Payment</h3>
              <button onClick={() => setShowVerifyOfflineModal(false)} className="text-zinc-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Contract Amount: <span className="font-bold text-white">₹{Number(selectedContract.total_amount).toLocaleString('en-IN')}</span>
            </p>

            <form onSubmit={handleVerifyOfflinePayment} className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Decision</label>
                <select
                  value={verifyOfflineForm.decision}
                  onChange={(e) => setVerifyOfflineForm({ ...verifyOfflineForm, decision: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none"
                >
                  <option value="verified">Verified (Mark Paid & Generate Invoice)</option>
                  <option value="rejected">Rejected (Payment Failed)</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Admin Verification Notes</label>
                <input
                  type="text"
                  value={verifyOfflineForm.adminNotes}
                  onChange={(e) => setVerifyOfflineForm({ ...verifyOfflineForm, adminNotes: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none"
                  placeholder="e.g. Bank statement UTR 982173 verified."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowVerifyOfflineModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500"
                >
                  Save Verification
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
