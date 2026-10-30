import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCompanyContext } from '@/context/CompanyContext';
import { amcApi, companyApi, extractResponseList, extractResponseData, formatDisplayDate } from '@/services/api';
import {
  ShieldCheck, AlertCircle, CheckCircle2, Clock, Plus, Search,
  RefreshCw, X, ChevronRight, Eye, Check, Ban, DollarSign,
  Smartphone, FileText, ArrowRightLeft, Building2, Calendar,
  Layers, Download, AlertTriangle, CreditCard, Info, Copy
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { SkeletonTable } from '@/components/Skeleton';
import { triggerRazorpayCheckout } from '@/utils/payment';

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
  old_device_id: number;
  old_brand?: string;
  old_model?: string;
  old_serial?: string;
  new_device_id: number;
  new_brand?: string;
  new_model?: string;
  new_serial?: string;
  reason: string;
  status: 'requested' | 'approved' | 'rejected' | 'cancelled';
  admin_notes?: string;
  created_at: string;
}

interface FleetDevice {
  id: number;
  brand: string;
  model_number?: string;
  model?: string;
  serial_number: string;
  asset_tag?: string;
  category?: string;
  is_active?: boolean | number;
}

export default function CompanyAmcManagement() {
  const { token, user } = useAuth();
  const { selectedCompanyId, companyProfile } = useCompanyContext();

  const [activeTab, setActiveTab] = useState<'contracts' | 'plans' | 'inquiries' | 'replacements'>('contracts');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data states
  const [contracts, setContracts] = useState<AmcContract[]>([]);
  const [requests, setRequests] = useState<AmcRequest[]>([]);
  const [plans, setPlans] = useState<AmcPlan[]>([]);
  const [replacements, setReplacements] = useState<AmcReplacement[]>([]);
  const [fleetDevices, setFleetDevices] = useState<FleetDevice[]>([]);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [contractStatusFilter, setContractStatusFilter] = useState('');

  // Modals state
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedPlanForRequest, setSelectedPlanForRequest] = useState<number | null>(null);
  const [requestedDeviceCount, setRequestedDeviceCount] = useState<number>(5);
  const [requestNotes, setRequestNotes] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // Review Offer modal
  const [offerModalContract, setOfferModalContract] = useState<AmcContract | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [isDecliningOffer, setIsDecliningOffer] = useState(false);
  const [isProcessingOffer, setIsProcessingOffer] = useState(false);

  // Payment modal
  const [paymentModalContract, setPaymentModalContract] = useState<AmcContract | null>(null);
  const [paymentMethodTab, setPaymentMethodTab] = useState<'razorpay' | 'offline'>('razorpay');
  const [offlinePaymentMode, setOfflinePaymentMode] = useState<'neft' | 'rtgs' | 'imps' | 'cheque' | 'upi'>('neft');
  const [offlineRefNumber, setOfflineRefNumber] = useState('');
  const [offlineDate, setOfflineDate] = useState(new Date().toISOString().split('T')[0]);
  const [offlineNotes, setOfflineNotes] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [copiedBankField, setCopiedBankField] = useState<string | null>(null);

  // Manage Covered Devices modal
  const [manageDevicesContract, setManageDevicesContract] = useState<AmcContract | null>(null);
  const [contractCapacityInfo, setContractCapacityInfo] = useState<any>(null);
  const [selectedDeviceIdsToAssign, setSelectedDeviceIdsToAssign] = useState<number[]>([]);
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');
  const [isAssigningDevices, setIsAssigningDevices] = useState(false);

  // Request Replacement modal
  const [replacementContract, setReplacementContract] = useState<AmcContract | null>(null);
  const [replacementOldDeviceId, setReplacementOldDeviceId] = useState<number | null>(null);
  const [replacementNewDeviceId, setReplacementNewDeviceId] = useState<number | null>(null);
  const [replacementReason, setReplacementReason] = useState('');
  const [isSubmittingReplacement, setIsSubmittingReplacement] = useState(false);

  // Contract Details Drawer
  const [detailsDrawerContract, setDetailsDrawerContract] = useState<AmcContract | null>(null);
  const [drawerDetailsLoading, setDrawerDetailsLoading] = useState(false);

  // Fetch all initial data
  const loadData = async (showLoadingState = true) => {
    if (!token) return;
    if (showLoadingState) setLoading(true);
    setRefreshing(true);

    try {
      const [contractsRes, requestsRes, plansRes, replacementsRes, devicesRes] = await Promise.all([
        amcApi.getCompanyContracts(token),
        amcApi.getCompanyRequests(token),
        amcApi.getPublicPlans(),
        amcApi.getCompanyReplacements(token),
        companyApi.getDevices(token)
      ]);

      if (contractsRes.ok) {
        setContracts(extractResponseList<AmcContract>(contractsRes));
      } else {
        setContracts([]);
        toast.error(contractsRes.error || 'Failed to load AMC contracts.');
      }

      if (requestsRes.ok) {
        setRequests(extractResponseList<AmcRequest>(requestsRes));
      } else {
        setRequests([]);
      }

      if (plansRes.ok) {
        setPlans(extractResponseList<AmcPlan>(plansRes));
      } else {
        setPlans([]);
      }

      if (replacementsRes.ok) {
        setReplacements(extractResponseList<AmcReplacement>(replacementsRes));
      } else {
        setReplacements([]);
      }

      if (devicesRes.ok) {
        setFleetDevices(extractResponseList<FleetDevice>(devicesRes));
      } else {
        setFleetDevices([]);
      }
    } catch (err: any) {
      setContracts([]);
      setRequests([]);
      setPlans([]);
      setReplacements([]);
      setFleetDevices([]);
      toast.error('Failed to load AMC details. Please check your network connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token, selectedCompanyId]);

  // Active Contract calculation
  const activeContract = useMemo(() => {
    if (!Array.isArray(contracts)) return null;
    return contracts.find(c => c && c.status === 'active') || null;
  }, [contracts]);

  // Overall metric counts
  const metrics = useMemo(() => {
    const contractsList = Array.isArray(contracts) ? contracts : [];
    const replacementsList = Array.isArray(replacements) ? replacements : [];

    const totalCovered = contractsList
      .filter(c => c && c.status === 'active')
      .reduce((sum, c) => sum + (c.active_covered_count || 0), 0);

    const totalCapacity = contractsList
      .filter(c => c && c.status === 'active')
      .reduce((sum, c) => sum + (c.device_capacity || 0), 0);

    const pendingOffers = contractsList.filter(c => c && c.status === 'offered').length;
    const pendingVerifications = contractsList.filter(c => c && c.payment_status === 'pending_verification').length;
    const pendingReplacementsCount = replacementsList.filter(r => r && r.status === 'requested').length;

    return {
      activeContractsCount: contractsList.filter(c => c && c.status === 'active').length,
      totalCovered,
      totalCapacity,
      pendingOffers,
      pendingVerifications,
      pendingReplacementsCount,
    };
  }, [contracts, replacements]);

  // Format currency
  const formatCurrency = (val: string | number) => {
    const num = Number(val) || 0;
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
  };

  // Helper for status badge
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
      case 'approved':
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {status.toUpperCase()}
          </span>
        );
      case 'offered':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <Clock className="w-3 h-3 text-cyan-400" />
            OFFER RECEIVED
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <CheckCircle2 className="w-3 h-3 text-blue-400" />
            ACCEPTED
          </span>
        );
      case 'pending':
      case 'pending_approval':
      case 'pending_verification':
      case 'under_review':
      case 'requested':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3 text-amber-400" />
            {status.replace(/_/g, ' ').toUpperCase()}
          </span>
        );
      case 'rejected':
      case 'cancelled':
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            {status.toUpperCase()}
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
            EXPIRED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-400">
            {status}
          </span>
        );
    }
  };

  // Capacity bar color
  const getCapacityColor = (used: number, total: number) => {
    if (!total || total === 0) return 'bg-zinc-600';
    const pct = (used / total) * 100;
    if (pct < 80) return 'bg-emerald-500';
    if (pct < 100) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  // Submit AMC request
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (requestedDeviceCount < 1) {
      toast.error('Device count must be at least 1.');
      return;
    }
    if (!acceptTerms) {
      toast.error('Please accept the AMC Terms & Conditions to proceed.');
      return;
    }

    setIsSubmittingRequest(true);
    try {
      const payload = {
        planId: selectedPlanForRequest || undefined,
        requestedDeviceCount,
        notes: requestNotes.trim() || undefined,
      };

      const res = await amcApi.createRequest(token, payload);
      if (res.ok) {
        toast.success('AMC Inquiry submitted successfully! Our enterprise team will review and send you a custom offer.');
        setIsRequestModalOpen(false);
        setSelectedPlanForRequest(null);
        setRequestNotes('');
        setAcceptTerms(false);
        loadData(false);
      } else {
        toast.error(res.error || 'Failed to submit request.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error submitting request.');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  // Accept Offer
  const handleAcceptOffer = async (contractId: number) => {
    if (!token) return;
    setIsProcessingOffer(true);
    try {
      const res = await amcApi.acceptOffer(token, contractId);
      if (res.ok) {
        toast.success('Offer accepted! You can now proceed to payment to activate your contract.');
        setOfferModalContract(null);
        loadData(false);
      } else {
        toast.error(res.error || 'Failed to accept offer.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error accepting offer.');
    } finally {
      setIsProcessingOffer(false);
    }
  };

  // Reject / Decline Offer
  const handleDeclineOffer = async (contractId: number) => {
    if (!token) return;
    setIsProcessingOffer(true);
    try {
      const res = await amcApi.rejectOffer(token, contractId, declineReason.trim() || undefined);
      if (res.ok) {
        toast.success('Offer declined.');
        setOfferModalContract(null);
        setDeclineReason('');
        setIsDecliningOffer(false);
        loadData(false);
      } else {
        toast.error(res.error || 'Failed to decline offer.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error declining offer.');
    } finally {
      setIsProcessingOffer(false);
    }
  };

  // Trigger Online Payment (Razorpay)
  const handleOnlinePayment = async (contract: AmcContract) => {
    if (!token) return;
    setIsSubmittingPayment(true);

    try {
      // 1. Create order
      const orderRes = await amcApi.createPaymentOrder(token, contract.id);
      if (!orderRes.ok || !orderRes.data) {
        toast.error(orderRes.error || 'Failed to initialize payment gateway order.');
        setIsSubmittingPayment(false);
        return;
      }

      // Unpack envelope safely using extractResponseData
      const orderData = extractResponseData<any>(orderRes, (orderRes.data as any)?.data || orderRes.data);

      if (!orderData || !orderData.orderId) {
        toast.error('Payment order could not be created. Please try again.');
        setIsSubmittingPayment(false);
        return;
      }

      // 2. Open Razorpay Checkout modal
      await triggerRazorpayCheckout({
        keyId: orderData.keyId,
        orderId: orderData.orderId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'TekDoctor AMC Contract',
        description: `Payment for Contract ${contract.contract_number} (${contract.plan_name})`,
        prefill: {
          name: companyProfile?.contact_person || user?.name || '',
          email: user?.email || '',
          contact: companyProfile?.phone || user?.phone || '',
        },
        themeColor: '#00F2FE',
        onPaymentSuccess: async (rzpResponse) => {
          try {
            // 3. Verify payment signature on backend
            const verifyRes = await amcApi.verifyPayment(token, contract.id, {
              razorpayOrderId: rzpResponse.razorpay_order_id,
              razorpayPaymentId: rzpResponse.razorpay_payment_id,
              razorpaySignature: rzpResponse.razorpay_signature,
            });

            if (verifyRes.ok) {
              toast.success('Payment verified successfully! Your AMC contract is now active.');
              setPaymentModalContract(null);
              loadData(false);
            } else {
              toast.error(verifyRes.error || 'Payment signature verification failed.');
            }
          } catch (err: any) {
            toast.error(err?.message || 'Error during payment verification.');
          } finally {
            setIsSubmittingPayment(false);
          }
        },
        onPaymentError: (error) => {
          toast.error(error?.message || 'Online payment gateway unavailable or cancelled.');
          setIsSubmittingPayment(false);
        },
        onDismiss: () => {
          setIsSubmittingPayment(false);
        }
      });
    } catch (err: any) {
      toast.error(err?.message || 'Error initiating payment gateway.');
      setIsSubmittingPayment(false);
    }
  };

  // Submit Offline Bank Payment
  const handleSubmitOfflinePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !paymentModalContract) return;

    if (!offlineRefNumber.trim()) {
      toast.error('Please enter the Bank UTR / Transaction Reference Number.');
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const res = await amcApi.initiateOfflinePayment(token, paymentModalContract.id, {
        paymentMethod: offlinePaymentMode,
        referenceNumber: offlineRefNumber.trim(),
        notes: offlineNotes.trim() ? `Date: ${offlineDate}. Notes: ${offlineNotes.trim()}` : `Date: ${offlineDate}`,
      });

      if (res.ok) {
        toast.success('Offline payment submitted! Status updated to Payment Verification awaiting Admin approval.');
        setPaymentModalContract(null);
        setOfflineRefNumber('');
        setOfflineNotes('');
        loadData(false);
      } else {
        toast.error(res.error || 'Failed to submit offline payment details.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error submitting offline payment.');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Open Manage Devices modal
  const handleOpenManageDevices = async (contract: AmcContract) => {
    setManageDevicesContract(contract);
    setSelectedDeviceIdsToAssign([]);
    if (!token) return;

    try {
      const [capRes, detailsRes] = await Promise.all([
        amcApi.getContractCapacity(token, contract.id),
        amcApi.getCompanyContractDetails(token, contract.id)
      ]);
      if (capRes.ok) {
        setContractCapacityInfo(extractResponseData(capRes, null));
      }
      if (detailsRes.ok) {
        const details = extractResponseData<AmcContract | null>(detailsRes, null);
        if (details && typeof details === 'object') {
          setManageDevicesContract(prev => prev && prev.id === contract.id ? { ...prev, ...details } : details);
        }
      }
    } catch (err) {
      console.error('Failed to load contract details for device management', err);
    }
  };

  const [replacementDetailsLoading, setReplacementDetailsLoading] = useState(false);

  // Open Request Replacement modal
  const handleOpenReplacementModal = async (contract: AmcContract | null) => {
    if (!contract) return;
    setReplacementContract(contract);
    setReplacementOldDeviceId(null);
    setReplacementNewDeviceId(null);
    setReplacementReason('');
    if (!token) return;

    setReplacementDetailsLoading(true);
    try {
      const res = await amcApi.getCompanyContractDetails(token, contract.id);
      if (res.ok) {
        const details = extractResponseData<AmcContract | null>(res, null);
        if (details && typeof details === 'object') {
          setReplacementContract(prev => prev && prev.id === contract.id ? { ...prev, ...details } : details);
        }
      }
    } catch (err) {
      console.error('Failed to load covered devices for replacement modal', err);
    } finally {
      setReplacementDetailsLoading(false);
    }
  };

  // Assign Devices to contract
  const handleAssignDevices = async () => {
    if (!token || !manageDevicesContract) return;
    if (selectedDeviceIdsToAssign.length === 0) {
      toast.error('Please select at least one device to add.');
      return;
    }

    setIsAssigningDevices(true);
    try {
      const res = await amcApi.assignDevices(token, manageDevicesContract.id, selectedDeviceIdsToAssign);
      if (res.ok) {
        toast.success(`Successfully added ${selectedDeviceIdsToAssign.length} device(s) to AMC coverage.`);
        setManageDevicesContract(null);
        setSelectedDeviceIdsToAssign([]);
        loadData(false);
      } else {
        toast.error(res.error || 'Failed to assign devices.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error assigning devices.');
    } finally {
      setIsAssigningDevices(false);
    }
  };

  // Submit Replacement Request
  const handleSubmitReplacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !replacementContract) return;

    if (!replacementOldDeviceId) {
      toast.error('Please select the covered device to replace.');
      return;
    }
    if (!replacementNewDeviceId) {
      toast.error('Please select the new device from your inventory.');
      return;
    }
    if (replacementOldDeviceId === replacementNewDeviceId) {
      toast.error('Original and replacement devices cannot be the same.');
      return;
    }
    if (!replacementReason.trim()) {
      toast.error('Please provide a reason for the replacement.');
      return;
    }

    setIsSubmittingReplacement(true);
    try {
      const res = await amcApi.requestReplacement(token, {
        contractId: replacementContract.id,
        oldDeviceId: replacementOldDeviceId,
        newDeviceId: replacementNewDeviceId,
        reason: replacementReason.trim(),
      });

      if (res.ok) {
        toast.success('Device replacement request submitted! Admin will review and approve the transfer.');
        setReplacementContract(null);
        setReplacementOldDeviceId(null);
        setReplacementNewDeviceId(null);
        setReplacementReason('');
        loadData(false);
      } else {
        toast.error(res.error || 'Failed to submit replacement request.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error submitting replacement.');
    } finally {
      setIsSubmittingReplacement(false);
    }
  };

  // Open Details Drawer
  const handleOpenDetails = async (contract: AmcContract) => {
    setDetailsDrawerContract(contract);
    setDrawerDetailsLoading(true);
    if (!token) return;

    try {
      const res = await amcApi.getCompanyContractDetails(token, contract.id);
      if (res.ok) {
        setDetailsDrawerContract(extractResponseData<AmcContract>(res, contract));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDrawerDetailsLoading(false);
    }
  };

  // Copy helper for bank details
  const handleCopyBank = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBankField(label);
    toast.success(`Copied ${label} to clipboard`);
    setTimeout(() => setCopiedBankField(null), 2000);
  };

  // Filtered lists
  const filteredContracts = useMemo(() => {
    if (!Array.isArray(contracts)) return [];
    const q = (searchQuery || '').toLowerCase().trim();
    return contracts.filter(c => {
      if (!c) return false;
      const matchesSearch =
        !q ||
        (c.contract_number && c.contract_number.toLowerCase().includes(q)) ||
        (c.plan_name && c.plan_name.toLowerCase().includes(q));
      const matchesStatus = !contractStatusFilter || c.status === contractStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [contracts, searchQuery, contractStatusFilter]);

  // Devices available for assignment in manage modal
  const availableDevicesToAssign = useMemo(() => {
    if (!manageDevicesContract || !Array.isArray(fleetDevices)) return [];
    const coveredList = Array.isArray(manageDevicesContract.coveredDevices) ? manageDevicesContract.coveredDevices : [];
    const activeCoveredIds = new Set(
      coveredList
        .filter(cd => cd && cd.status === 'active')
        .map(cd => cd.device_id)
    );
    if (Array.isArray(contractCapacityInfo?.companyCoveredDeviceIds)) {
      contractCapacityInfo.companyCoveredDeviceIds.forEach((id: number) => activeCoveredIds.add(id));
    }
    if (Array.isArray(contractCapacityInfo?.coveredDeviceIds)) {
      contractCapacityInfo.coveredDeviceIds.forEach((id: number) => activeCoveredIds.add(id));
    }

    return fleetDevices.filter(d => {
      if (!d) return false;
      // Must not already be covered under this contract or another active contract
      if (activeCoveredIds.has(d.id)) return false;
      // Search filter inside modal
      if (!deviceSearchQuery) return true;
      const q = deviceSearchQuery.toLowerCase().trim();
      return (
        (d.brand && d.brand.toLowerCase().includes(q)) ||
        (d.model_number && d.model_number.toLowerCase().includes(q)) ||
        (d.model && d.model.toLowerCase().includes(q)) ||
        (d.serial_number && d.serial_number.toLowerCase().includes(q)) ||
        (d.asset_tag && d.asset_tag.toLowerCase().includes(q))
      );
    });
  }, [fleetDevices, manageDevicesContract, contractCapacityInfo, deviceSearchQuery]);

  return (
    <div className="space-y-8 pb-16">
      {/* ── Top Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center text-neon-cyan shadow-[0_0_15px_rgba(0,242,255,0.2)]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                AMC Contracts & Coverage
              </h1>
              <p className="text-xs text-zinc-400">
                Annual Maintenance Contracts, device coverage allocations, and service SLA management
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData(false)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 rounded-xl border border-zinc-800 text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-neon-cyan' : ''}`} />
            Refresh
          </button>

          <button
            onClick={() => {
              setSelectedPlanForRequest(null);
              setIsRequestModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-neon-cyan/20 to-blue-500/20 hover:from-neon-cyan/30 hover:to-blue-500/30 text-white rounded-xl border border-neon-cyan/40 text-xs font-semibold shadow-[0_0_15px_rgba(0,242,255,0.15)] transition-all"
          >
            <Plus className="w-4 h-4 text-neon-cyan" />
            Request AMC / Quote
          </button>
        </div>
      </div>

      {/* ── Active Coverage Banner or Get Started ── */}
      {activeContract ? (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900/90 via-zinc-900/60 to-zinc-950 border border-zinc-800/80 p-6 shadow-xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-neon-cyan/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left Info */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ACTIVE AMC CONTRACT
                </span>
                <span className="text-xs font-mono text-zinc-400">
                  #{activeContract.contract_number}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-medium">
                  {activeContract.plan_name}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <h3 className="text-xl font-bold text-white tracking-tight">
                  Coverage Active & Enforced
                </h3>
              </div>

              <p className="text-xs text-zinc-400 max-w-xl leading-relaxed">
                Repairs for covered devices automatically receive priority technician dispatch, zero diagnostic fees, and plan-covered spare parts under SLA.
              </p>

              <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 pt-1">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  Valid: {activeContract.start_date ? `${formatDisplayDate(activeContract.start_date)} → ${formatDisplayDate(activeContract.end_date)}` : 'Awaiting Activation'}
                </span>
                <span className="flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
                  {formatCurrency(activeContract.total_amount)} (Paid)
                </span>
              </div>
            </div>

            {/* Right Capacity Gauge */}
            <div className="lg:col-span-5 bg-zinc-950/60 rounded-xl border border-zinc-800/80 p-5 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-neon-cyan" />
                  Covered Devices Capacity
                </span>
                <span className="font-mono text-white font-bold">
                  {activeContract.active_covered_count || 0} / {activeContract.device_capacity} Devices
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-zinc-800/80 h-3 rounded-full overflow-hidden p-0.5 border border-zinc-700/50">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getCapacityColor(
                    activeContract.active_covered_count || 0,
                    activeContract.device_capacity
                  )}`}
                  style={{
                    width: `${Math.min(
                      100,
                      ((activeContract.active_covered_count || 0) / (activeContract.device_capacity || 1)) * 100
                    )}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>
                  {Math.max(0, activeContract.device_capacity - (activeContract.active_covered_count || 0))} slots remaining
                </span>
                <span>
                  {Math.round(
                    ((activeContract.active_covered_count || 0) / (activeContract.device_capacity || 1)) * 100
                  )}% utilized
                </span>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  onClick={() => handleOpenManageDevices(activeContract)}
                  className="flex-1 py-2 px-3 bg-neon-cyan/15 hover:bg-neon-cyan/25 text-neon-cyan border border-neon-cyan/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add / Manage Devices
                </button>
                <button
                  onClick={() => handleOpenReplacementModal(activeContract)}
                  className="py-2 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  title="Replace a covered device with another fleet device"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  Replace
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 mx-auto flex items-center justify-center text-zinc-400">
            <ShieldCheck className="w-6 h-6 text-neon-cyan" />
          </div>
          <h3 className="text-base font-semibold text-white">No Active AMC Contract</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Protect your company's IT fleet with guaranteed SLAs, priority doorstep service, and discounted parts. Browse our plans or request a custom proposal.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={() => setActiveTab('plans')}
              className="px-4 py-2 bg-neon-cyan/15 hover:bg-neon-cyan/25 text-neon-cyan border border-neon-cyan/40 rounded-xl text-xs font-semibold transition-colors"
            >
              Browse Available Plans
            </button>
          </div>
        </div>
      )}

      {/* ── 4 Quick Stat Badges ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-1">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Active Contracts</span>
          <p className="text-2xl font-bold text-white">{metrics.activeContractsCount}</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-1">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Covered Fleet Capacity</span>
          <p className="text-2xl font-bold text-neon-cyan">
            {metrics.totalCovered} <span className="text-xs text-zinc-500 font-normal">/ {metrics.totalCapacity}</span>
          </p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-1">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Pending Offers / Actions</span>
          <p className="text-2xl font-bold text-amber-400">
            {metrics.pendingOffers + metrics.pendingVerifications}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-1">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Replacements Requested</span>
          <p className="text-2xl font-bold text-zinc-300">{metrics.pendingReplacementsCount}</p>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex border-b border-zinc-800 gap-2">
        <button
          onClick={() => setActiveTab('contracts')}
          className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'contracts'
              ? 'border-neon-cyan text-neon-cyan'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          My Contracts ({Array.isArray(contracts) ? contracts.length : 0})
        </button>

        <button
          onClick={() => setActiveTab('plans')}
          className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'plans'
              ? 'border-neon-cyan text-neon-cyan'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          Available Plans ({Array.isArray(plans) ? plans.length : 0})
        </button>

        <button
          onClick={() => setActiveTab('inquiries')}
          className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'inquiries'
              ? 'border-neon-cyan text-neon-cyan'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          Inquiries & Quotes ({Array.isArray(requests) ? requests.length : 0})
        </button>

        <button
          onClick={() => setActiveTab('replacements')}
          className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'replacements'
              ? 'border-neon-cyan text-neon-cyan'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          Device Replacements ({Array.isArray(replacements) ? replacements.length : 0})
        </button>
      </div>

      {/* ── Tab 1: Contracts ── */}
      {activeTab === 'contracts' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/80">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search contracts by number, plan..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-neon-cyan"
              />
            </div>

            <select
              value={contractStatusFilter}
              onChange={e => setContractStatusFilter(e.target.value)}
              className="w-full sm:w-48 py-1.5 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 focus:outline-none focus:border-neon-cyan"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="offered">Offered (Action Required)</option>
              <option value="accepted">Accepted (Unpaid)</option>
              <option value="expired">Expired</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {loading ? (
            <SkeletonTable rows={5} />
          ) : filteredContracts.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-xs bg-zinc-900/30 rounded-xl border border-zinc-800/60">
              No contracts found matching your filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredContracts.map(contract => {
                const isOffered = contract.status === 'offered';
                const needsPayment =
                  contract.approval_status === 'approved' &&
                  contract.payment_status === 'unpaid' &&
                  contract.status !== 'rejected' &&
                  contract.status !== 'cancelled';
                const isPendingVerification = contract.payment_status === 'pending_verification';

                return (
                  <div
                    key={contract.id}
                    className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                  >
                    {/* Contract Details */}
                    <div className="space-y-3 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-sm font-bold text-white">
                          #{contract.contract_number}
                        </span>
                        {renderStatusBadge(contract.status)}
                        {contract.payment_status && contract.payment_status !== 'unpaid' && (
                          <span className="px-2 py-0.5 rounded text-[11px] bg-zinc-800 font-mono text-zinc-300">
                            Payment: {contract.payment_status.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-400 capitalize">
                          Type: {contract.contract_type}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                        <div>
                          <span className="text-zinc-500 block text-[10px] uppercase font-mono">Plan</span>
                          <span className="text-zinc-200 font-semibold">{contract.plan_name}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block text-[10px] uppercase font-mono">Capacity</span>
                          <span className="text-zinc-200 font-semibold">
                            {contract.active_covered_count || 0} / {contract.device_capacity} Devices
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block text-[10px] uppercase font-mono">Contract Value</span>
                          <span className="text-zinc-200 font-semibold font-mono">
                            {formatCurrency(contract.total_amount)}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block text-[10px] uppercase font-mono">Validity Period</span>
                          <span className="text-zinc-200">
                            {contract.start_date ? `${formatDisplayDate(contract.start_date)} to ${formatDisplayDate(contract.end_date)}` : 'Awaiting Activation'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800">
                      {isOffered && (
                        <button
                          onClick={() => {
                            setOfferModalContract(contract);
                            setIsDecliningOffer(false);
                            setDeclineReason('');
                          }}
                          className="px-3 py-1.5 bg-gradient-to-r from-neon-cyan to-blue-500 hover:opacity-90 text-black text-xs font-bold rounded-xl shadow-lg transition-all"
                        >
                          Review & Accept Offer
                        </button>
                      )}

                      {needsPayment && (
                        <button
                          onClick={() => {
                            setPaymentModalContract(contract);
                            setPaymentMethodTab('razorpay');
                          }}
                          className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold rounded-xl shadow-lg flex items-center gap-1.5 transition-all"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          Pay Now ({formatCurrency(contract.total_amount)})
                        </button>
                      )}

                      {isPendingVerification && (
                        <span className="px-3 py-1.5 rounded-xl text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 animate-pulse" />
                          Payment Verification Pending
                        </span>
                      )}

                      {contract.status === 'active' && (
                        <>
                          <button
                            onClick={() => handleOpenManageDevices(contract)}
                            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-xl border border-zinc-700 flex items-center gap-1.5 transition-colors"
                          >
                            <Smartphone className="w-3.5 h-3.5 text-neon-cyan" />
                            Manage Devices
                          </button>
                          <button
                            onClick={() => handleOpenReplacementModal(contract)}
                            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-xl border border-zinc-700 flex items-center gap-1.5 transition-colors"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-400" />
                            Replacement
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => handleOpenDetails(contract)}
                        className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium rounded-xl border border-zinc-800 flex items-center gap-1 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Available Plans ── */}
      {activeTab === 'plans' && (
        <div className="space-y-6">
          <div className="max-w-2xl">
            <h3 className="text-base font-bold text-white">Official AMC Maintenance Plans</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Select the plan that matches your organization's device inventory and SLA response expectations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(!Array.isArray(plans) || plans.length === 0) ? (
              <div className="col-span-full p-8 text-center text-zinc-500 text-xs bg-zinc-900/30 rounded-xl border border-zinc-800/60">
                No AMC plans currently available.
              </div>
            ) : (
              plans.map(plan => {
                const terms = typeof plan.coverage_terms === 'string'
                  ? JSON.parse(plan.coverage_terms || '{}')
                  : plan.coverage_terms || {};

              return (
                <div
                  key={plan.id}
                  className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-6 flex flex-col justify-between hover:border-neon-cyan/40 transition-all group"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 uppercase">
                        {plan.plan_code}
                      </span>
                      <span className="text-xs text-zinc-400 font-mono">
                        {plan.duration_months} Months
                      </span>
                    </div>

                    <div>
                      <h4 className="text-lg font-bold text-white group-hover:text-neon-cyan transition-colors">
                        {plan.name}
                      </h4>
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                        {plan.description || 'Comprehensive hardware maintenance & warranty protection.'}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-zinc-800/60">
                      <span className="text-xs text-zinc-500 block">Starting From</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-white font-mono">
                          {formatCurrency(plan.base_price)}
                        </span>
                        <span className="text-xs text-zinc-400">/ contract</span>
                      </div>
                      <span className="text-[11px] text-zinc-500 font-mono mt-0.5 block">
                        Default Capacity: {plan.default_device_capacity} Devices
                      </span>
                    </div>

                    {/* Features list */}
                    <div className="space-y-2 pt-2 border-t border-zinc-800/60 text-xs">
                      {terms.sla_response_time && (
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Check className="w-3.5 h-3.5 text-neon-cyan flex-shrink-0" />
                          <span>SLA Response: <strong>{terms.sla_response_time}</strong></span>
                        </div>
                      )}
                      {terms.preventive_maintenance_visits && (
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Check className="w-3.5 h-3.5 text-neon-cyan flex-shrink-0" />
                          <span>{terms.preventive_maintenance_visits} Preventive Maintenance Visits</span>
                        </div>
                      )}
                      {terms.standby_device_provided && (
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Check className="w-3.5 h-3.5 text-neon-cyan flex-shrink-0" />
                          <span>Standby Replacement Device Provided</span>
                        </div>
                      )}
                      {terms.discount_on_spares && (
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Check className="w-3.5 h-3.5 text-neon-cyan flex-shrink-0" />
                          <span>{terms.discount_on_spares}% Discount on Out-of-Scope Spares</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-6">
                    <button
                      onClick={() => {
                        setSelectedPlanForRequest(plan.id);
                        setRequestedDeviceCount(plan.default_device_capacity || 5);
                        setIsRequestModalOpen(true);
                      }}
                      className="w-full py-2.5 px-4 bg-neon-cyan/15 hover:bg-neon-cyan/25 text-neon-cyan border border-neon-cyan/40 rounded-xl text-xs font-bold transition-all shadow-md"
                    >
                      Request Quote for {plan.name}
                    </button>
                  </div>
                </div>
              );
            }))}
          </div>
        </div>
      )}

      {/* ── Tab 3: Inquiries / Requests ── */}
      {activeTab === 'inquiries' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-bold text-white">Your Submitted AMC Inquiries</h3>
              <p className="text-xs text-zinc-400">Track quotes and proposals submitted to the TekDoctor enterprise desk.</p>
            </div>
            <button
              onClick={() => {
                setSelectedPlanForRequest(null);
                setIsRequestModalOpen(true);
              }}
              className="px-3 py-1.5 bg-neon-cyan/15 hover:bg-neon-cyan/25 text-neon-cyan border border-neon-cyan/30 rounded-xl text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              New Inquiry
            </button>
          </div>

          {(!Array.isArray(requests) || requests.length === 0) ? (
            <div className="p-8 text-center text-zinc-500 text-xs bg-zinc-900/30 rounded-xl border border-zinc-800/60">
              You haven't submitted any AMC inquiries yet.
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map(req => (
                <div
                  key={req.id}
                  className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white">#{req.request_number}</span>
                      {renderStatusBadge(req.status)}
                      <span className="text-xs text-zinc-400 font-medium">
                        Plan: {req.plan_name || 'Custom Specification'}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400 flex flex-wrap gap-4">
                      <span>Requested Devices: <strong>{req.requested_device_count}</strong></span>
                      <span>Submitted on: {new Date(req.created_at).toLocaleDateString()}</span>
                    </div>
                    {req.notes && (
                      <p className="text-xs text-zinc-300 italic bg-zinc-950/60 p-2 rounded-lg border border-zinc-800">
                        "{req.notes}"
                      </p>
                    )}
                    {req.admin_notes && (
                      <p className="text-xs text-cyan-300 bg-cyan-950/20 p-2 rounded-lg border border-cyan-800/30">
                        Admin Note: {req.admin_notes}
                      </p>
                    )}
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
            <div>
              <h3 className="text-base font-bold text-white">Device Replacements History</h3>
              <p className="text-xs text-zinc-400">
                Track covered devices swapped or replaced due to irrecoverable hardware faults.
              </p>
            </div>
            {activeContract && (
              <button
                onClick={() => handleOpenReplacementModal(activeContract)}
                className="px-3 py-1.5 bg-neon-cyan/15 hover:bg-neon-cyan/25 text-neon-cyan border border-neon-cyan/30 rounded-xl text-xs font-semibold flex items-center gap-1.5"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Request Replacement
              </button>
            )}
          </div>

          {(!Array.isArray(replacements) || replacements.length === 0) ? (
            <div className="p-8 text-center text-zinc-500 text-xs bg-zinc-900/30 rounded-xl border border-zinc-800/60">
              No device replacement requests on record.
            </div>
          ) : (
            <div className="space-y-3">
              {replacements.map(rep => (
                <div
                  key={rep.id}
                  className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white">#{rep.replacement_number}</span>
                      {renderStatusBadge(rep.status)}
                      <span className="text-xs font-mono text-zinc-400">
                        Contract: {rep.contract_number}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                      <div className="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800">
                        <span className="text-[10px] text-rose-400 uppercase font-mono block">Original Device (Removed)</span>
                        <span className="text-zinc-200 font-semibold">{rep.old_brand} {rep.old_model}</span>
                        <span className="text-zinc-400 font-mono text-[11px] block">SN: {rep.old_serial}</span>
                      </div>
                      <div className="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800">
                        <span className="text-[10px] text-emerald-400 uppercase font-mono block">Replacement Device (Assigned)</span>
                        <span className="text-zinc-200 font-semibold">{rep.new_brand} {rep.new_model}</span>
                        <span className="text-zinc-400 font-mono text-[11px] block">SN: {rep.new_serial}</span>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-400 pt-1">
                      Reason: <span className="text-zinc-300 italic">{rep.reason}</span>
                    </p>

                    {rep.admin_notes && (
                      <p className="text-xs text-cyan-300 bg-cyan-950/20 p-2 rounded-lg border border-cyan-800/30">
                        Admin Note: {rep.admin_notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL 1: Request AMC / Quote ── */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setIsRequestModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center text-neon-cyan">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Request AMC Coverage</h3>
                <p className="text-xs text-zinc-400">Submit an inquiry to receive a customized contract offer.</p>
              </div>
            </div>

            <form onSubmit={handleSubmitRequest} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                  Select AMC Plan
                </label>
                <select
                  value={selectedPlanForRequest || ''}
                  onChange={e => setSelectedPlanForRequest(e.target.value ? Number(e.target.value) : null)}
                  className="w-full py-2 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-neon-cyan"
                >
                  <option value="">Custom Proposal / Not Sure</option>
                  {(Array.isArray(plans) ? plans : []).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.duration_months} mo - Default {p.default_device_capacity} devices)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                  Number of Devices Requiring Coverage *
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  required
                  value={requestedDeviceCount}
                  onChange={e => setRequestedDeviceCount(Number(e.target.value))}
                  className="w-full py-2 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-neon-cyan"
                />
                <span className="text-[11px] text-zinc-500 mt-1 block">
                  You can register unlimited fleet devices in inventory; this defines contract coverage capacity.
                </span>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                  Special Requirements / Notes (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. 15 ThinkPads, 10 MacBooks across Bangalore and Mumbai branches, requires 4-hour SLA."
                  value={requestNotes}
                  onChange={e => setRequestNotes(e.target.value)}
                  className="w-full py-2 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-neon-cyan resize-none"
                />
              </div>

              <div className="flex items-start gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="acceptTerms"
                  required
                  checked={acceptTerms}
                  onChange={e => setAcceptTerms(e.target.checked)}
                  className="mt-0.5 rounded border-zinc-700 bg-zinc-950 text-neon-cyan focus:ring-neon-cyan"
                />
                <label htmlFor="acceptTerms" className="text-xs text-zinc-400 leading-tight">
                  I accept the TekDoctor Annual Maintenance Contract terms and understand that coverage activates only after quotation approval and payment.
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRequest}
                  className="px-4 py-2 bg-gradient-to-r from-neon-cyan to-blue-500 hover:opacity-90 text-black text-xs font-bold rounded-xl shadow-lg transition-all disabled:opacity-50"
                >
                  {isSubmittingRequest ? 'Submitting...' : 'Submit Inquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Review & Accept / Decline Offer ── */}
      {offerModalContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setOfferModalContract(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <span className="text-[11px] font-mono text-neon-cyan uppercase tracking-wider block">Official Offer</span>
              <h3 className="text-lg font-bold text-white mt-0.5">
                Review Contract Offer #{offerModalContract.contract_number}
              </h3>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/80 space-y-3 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                <span className="text-zinc-400">Plan:</span>
                <span className="text-white font-bold">{offerModalContract.plan_name}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                <span className="text-zinc-400">Device Capacity:</span>
                <span className="text-white font-bold">{offerModalContract.device_capacity} Devices</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                <span className="text-zinc-400">Base Price:</span>
                <span className="text-zinc-300 font-mono">{formatCurrency(offerModalContract.price)}</span>
              </div>
              {Number(offerModalContract.discount_amount) > 0 && (
                <div className="flex justify-between items-center pb-2 border-b border-zinc-800 text-emerald-400">
                  <span>Special Discount:</span>
                  <span className="font-mono">-{formatCurrency(offerModalContract.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                <span className="text-zinc-400">Taxes (GST 18%):</span>
                <span className="text-zinc-300 font-mono">{formatCurrency(offerModalContract.tax_amount)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 text-sm font-bold">
                <span className="text-white">Total Amount:</span>
                <span className="text-neon-cyan font-mono">{formatCurrency(offerModalContract.total_amount)}</span>
              </div>
            </div>

            {offerModalContract.terms_and_conditions && (
              <div className="text-xs text-zinc-400 bg-zinc-950/40 p-3 rounded-lg border border-zinc-800/60 max-h-32 overflow-y-auto">
                <span className="font-semibold text-zinc-300 block mb-1">Contract Terms:</span>
                {offerModalContract.terms_and_conditions}
              </div>
            )}

            {isDecliningOffer ? (
              <div className="space-y-3 pt-2 border-t border-zinc-800">
                <label className="text-xs font-medium text-rose-400 block">
                  Reason for declining (Optional)
                </label>
                <textarea
                  rows={2}
                  value={declineReason}
                  onChange={e => setDeclineReason(e.target.value)}
                  placeholder="e.g. Budget constraints, device count changed..."
                  className="w-full p-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-white resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsDecliningOffer(false)}
                    className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => handleDeclineOffer(offerModalContract.id)}
                    disabled={isProcessingOffer}
                    className="px-4 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold rounded-lg"
                  >
                    {isProcessingOffer ? 'Declining...' : 'Confirm Decline'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsDecliningOffer(true)}
                  className="px-3 py-2 text-xs text-rose-400 hover:text-rose-300"
                >
                  Decline Offer
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOfferModalContract(null)}
                    className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAcceptOffer(offerModalContract.id)}
                    disabled={isProcessingOffer}
                    className="px-5 py-2 bg-gradient-to-r from-neon-cyan to-blue-500 hover:opacity-90 text-black text-xs font-bold rounded-xl shadow-lg transition-all disabled:opacity-50"
                  >
                    {isProcessingOffer ? 'Accepting...' : 'Accept Offer & Proceed'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL 3: Invoicing & Payment (Online / Offline) ── */}
      {paymentModalContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setPaymentModalContract(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <span className="text-[11px] font-mono text-neon-cyan uppercase tracking-wider block">Contract Activation</span>
              <h3 className="text-lg font-bold text-white mt-0.5">
                Complete AMC Payment
              </h3>
              <p className="text-xs text-zinc-400">
                Contract: <strong>{paymentModalContract.contract_number}</strong> &bull; Total:{' '}
                <strong className="text-neon-cyan font-mono">{formatCurrency(paymentModalContract.total_amount)}</strong>
              </p>
            </div>

            {/* Payment Method Selector */}
            <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
              <button
                type="button"
                onClick={() => setPaymentMethodTab('razorpay')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  paymentMethodTab === 'razorpay'
                    ? 'bg-zinc-800 text-white shadow'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <CreditCard className="w-4 h-4 text-neon-cyan" />
                Online (Razorpay / UPI)
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethodTab('offline')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  paymentMethodTab === 'offline'
                    ? 'bg-zinc-800 text-white shadow'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Building2 className="w-4 h-4 text-emerald-400" />
                Direct Bank Transfer
              </button>
            </div>

            {/* Online Tab */}
            {paymentMethodTab === 'razorpay' && (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-zinc-300 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-neon-cyan" />
                    Instant Contract Activation
                  </div>
                  <p className="text-zinc-400">
                    Supports corporate credit/debit cards, NetBanking, and instant UPI. Your AMC contract activates immediately upon confirmation.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => handleOnlinePayment(paymentModalContract)}
                    disabled={isSubmittingPayment}
                    className="w-full py-3 bg-gradient-to-r from-neon-cyan to-blue-500 hover:opacity-90 text-black text-xs font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <CreditCard className="w-4 h-4" />
                    {isSubmittingPayment ? 'Processing...' : `Pay ${formatCurrency(paymentModalContract.total_amount)} via Razorpay`}
                  </button>
                </div>
              </div>
            )}

            {/* Offline Bank Transfer Tab */}
            {paymentMethodTab === 'offline' && (
              <form onSubmit={handleSubmitOfflinePayment} className="space-y-4">
                {/* Official Bank Account Details */}
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2 text-xs">
                  <span className="font-semibold text-zinc-200 block text-[11px] uppercase tracking-wider text-emerald-400">
                    TekDoctor Corporate Bank Account
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-zinc-400">
                    <div>
                      <span>Bank:</span>
                      <strong className="block text-white">ICICI Bank</strong>
                    </div>
                    <div>
                      <span>Account Name:</span>
                      <strong className="block text-white">TekDoctor Tech Pvt Ltd</strong>
                    </div>
                    <div>
                      <span>Account Number:</span>
                      <div className="flex items-center gap-1.5">
                        <strong className="text-white font-mono">234505001234</strong>
                        <button
                          type="button"
                          onClick={() => handleCopyBank('234505001234', 'Account Number')}
                          className="text-zinc-500 hover:text-white"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <span>IFSC Code:</span>
                      <div className="flex items-center gap-1.5">
                        <strong className="text-white font-mono">ICIC0002345</strong>
                        <button
                          type="button"
                          onClick={() => handleCopyBank('ICIC0002345', 'IFSC')}
                          className="text-zinc-500 hover:text-white"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">
                      Transfer Mode *
                    </label>
                    <select
                      value={offlinePaymentMode}
                      onChange={e => setOfflinePaymentMode(e.target.value as any)}
                      className="w-full py-1.5 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                    >
                      <option value="neft">NEFT</option>
                      <option value="rtgs">RTGS</option>
                      <option value="imps">IMPS</option>
                      <option value="upi">Corporate UPI</option>
                      <option value="cheque">Bank Cheque</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">
                      Payment Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={offlineDate}
                      onChange={e => setOfflineDate(e.target.value)}
                      className="w-full py-1.5 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">
                    Bank UTR / Transaction Reference Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ICICR52026102900012345"
                    value={offlineRefNumber}
                    onChange={e => setOfflineRefNumber(e.target.value)}
                    className="w-full py-1.5 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-neon-cyan font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">
                    Notes / Remitting Bank Details (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Transferred from HDFC Corporate Account"
                    value={offlineNotes}
                    onChange={e => setOfflineNotes(e.target.value)}
                    className="w-full py-1.5 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setPaymentModalContract(null)}
                    className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingPayment}
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold rounded-xl shadow-lg transition-all disabled:opacity-50"
                  >
                    {isSubmittingPayment ? 'Submitting...' : 'Submit Offline Payment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL 4: Manage Covered Devices ── */}
      {manageDevicesContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setManageDevicesContract(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <span className="text-[11px] font-mono text-neon-cyan uppercase tracking-wider block">Fleet Allocation</span>
              <h3 className="text-lg font-bold text-white mt-0.5">
                Manage Covered Devices — Contract #{manageDevicesContract.contract_number}
              </h3>
              <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1">
                <span>
                  Contract Capacity: <strong>{manageDevicesContract.device_capacity} Devices</strong>
                </span>
                <span>&bull;</span>
                <span>
                  Currently Covered: <strong className="text-emerald-400">{manageDevicesContract.active_covered_count || 0}</strong>
                </span>
                <span>&bull;</span>
                <span>
                  Available Slots:{' '}
                  <strong className="text-neon-cyan">
                    {Math.max(0, manageDevicesContract.device_capacity - (manageDevicesContract.active_covered_count || 0))}
                  </strong>
                </span>
              </div>
            </div>

            {/* Current Covered Devices List */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-zinc-300 block">
                Actively Covered Devices under this Contract
              </span>
              <div className="max-h-36 overflow-y-auto space-y-1.5 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                {(!Array.isArray(manageDevicesContract.coveredDevices) || manageDevicesContract.coveredDevices.length === 0) ? (
                  <p className="text-xs text-zinc-500 text-center py-2">No devices assigned yet.</p>
                ) : (
                  manageDevicesContract.coveredDevices.map(cd => (
                    <div
                      key={cd.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="text-white font-medium">{cd.brand} {cd.model_number}</span>
                        <span className="text-zinc-500 font-mono">SN: {cd.serial_number}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono capitalize ${
                        cd.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'
                      }`}>
                        {cd.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add Registered Fleet Devices */}
            <div className="space-y-2 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">
                  Select Registered Devices from Company Inventory
                </span>
                <span className="text-[11px] text-zinc-500">
                  Selected: {selectedDeviceIdsToAssign.length} /{' '}
                  {Math.max(0, manageDevicesContract.device_capacity - (manageDevicesContract.active_covered_count || 0))} slots
                </span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filter available inventory by brand, model, serial, asset tag..."
                  value={deviceSearchQuery}
                  onChange={e => setDeviceSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 max-h-48">
                {availableDevicesToAssign.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-4">
                    No additional uncovered devices available in your registered fleet.
                  </p>
                ) : (
                  availableDevicesToAssign.map(dev => {
                    const isSelected = selectedDeviceIdsToAssign.includes(dev.id);
                    const remainingSlots = Math.max(
                      0,
                      manageDevicesContract.device_capacity - (manageDevicesContract.active_covered_count || 0)
                    );
                    const canSelectMore = selectedDeviceIdsToAssign.length < remainingSlots;

                    return (
                      <label
                        key={dev.id}
                        className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-neon-cyan/10 border-neon-cyan/40 text-white'
                            : 'bg-zinc-900/40 border-zinc-800/80 text-zinc-300 hover:bg-zinc-900'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!isSelected && !canSelectMore}
                            onChange={() => {
                              if (isSelected) {
                                setSelectedDeviceIdsToAssign(prev => prev.filter(id => id !== dev.id));
                              } else {
                                if (canSelectMore) {
                                  setSelectedDeviceIdsToAssign(prev => [...prev, dev.id]);
                                } else {
                                  toast.error(`Cannot exceed contract capacity of ${manageDevicesContract.device_capacity} devices.`);
                                }
                              }
                            }}
                            className="rounded border-zinc-700 bg-zinc-950 text-neon-cyan focus:ring-neon-cyan"
                          />
                          <div>
                            <span className="font-semibold">{dev.brand} {dev.model_number || dev.model}</span>
                            <span className="text-zinc-500 font-mono ml-2">SN: {dev.serial_number}</span>
                            {dev.asset_tag && (
                              <span className="text-zinc-400 font-mono text-[10px] ml-2">[{dev.asset_tag}]</span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setManageDevicesContract(null)}
                className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignDevices}
                disabled={isAssigningDevices || selectedDeviceIdsToAssign.length === 0}
                className="px-5 py-2 bg-gradient-to-r from-neon-cyan to-blue-500 hover:opacity-90 text-black text-xs font-bold rounded-xl shadow-lg transition-all disabled:opacity-50"
              >
                {isAssigningDevices
                  ? 'Saving...'
                  : `Add ${selectedDeviceIdsToAssign.length} Device(s) to Coverage`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 5: Request Device Replacement ── */}
      {replacementContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setReplacementContract(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <span className="text-[11px] font-mono text-neon-cyan uppercase tracking-wider block">Hardware Transfer</span>
              <h3 className="text-lg font-bold text-white mt-0.5">
                Request Device Replacement
              </h3>
              <p className="text-xs text-zinc-400">
                Replace an irreparably damaged or decommissioned device with another unit from your company fleet.
              </p>
            </div>

            <form onSubmit={handleSubmitReplacement} className="space-y-4">
              {/* Select Current Covered Device to Replace */}
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  1. Select Current Covered Device to Replace *
                </label>
                <select
                  required
                  value={replacementOldDeviceId || ''}
                  onChange={e => setReplacementOldDeviceId(e.target.value ? Number(e.target.value) : null)}
                  disabled={replacementDetailsLoading}
                  className="w-full py-2 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-white disabled:opacity-50"
                >
                  <option value="">-- Choose covered device --</option>
                  {replacementDetailsLoading && (
                    <option value="" disabled>Loading covered devices...</option>
                  )}
                  {!replacementDetailsLoading &&
                   (Array.isArray(replacementContract.coveredDevices) ? replacementContract.coveredDevices : []).filter(cd => cd && cd.status === 'active').length === 0 && (
                    <option value="" disabled>No actively covered devices in this contract</option>
                  )}
                  {(Array.isArray(replacementContract.coveredDevices) ? replacementContract.coveredDevices : [])
                    .filter(cd => cd && cd.status === 'active')
                    .map(cd => (
                      <option key={cd.device_id} value={cd.device_id}>
                        {cd.brand} {cd.model_number || cd.model || ''} (SN: {cd.serial_number || 'N/A'}{cd.amc_tag ? ` | Tag: ${cd.amc_tag}` : ''})
                      </option>
                    ))}
                </select>
              </div>

              {/* Select New Fleet Device */}
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  2. Select Replacement Unit from Registered Fleet *
                </label>
                <select
                  required
                  value={replacementNewDeviceId || ''}
                  onChange={e => setReplacementNewDeviceId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full py-2 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                >
                  <option value="">-- Choose fleet device --</option>
                  {(Array.isArray(fleetDevices) ? fleetDevices : [])
                    .filter(d => {
                      if (!d) return false;
                      if (d.id === replacementOldDeviceId) return false;
                      const coveredList = Array.isArray(replacementContract.coveredDevices) ? replacementContract.coveredDevices : [];
                      const coveredIds = new Set(
                        coveredList.filter(cd => cd && cd.status === 'active').map(cd => cd && cd.device_id)
                      );
                      return !coveredIds.has(d.id);
                    })
                    .map(d => (
                      <option key={d.id} value={d.id}>
                        {d.brand} {d.model_number || d.model} (SN: {d.serial_number})
                      </option>
                    ))}
                </select>
              </div>

              {/* Replacement Reason */}
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  3. Reason for Hardware Replacement *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Total display and motherboard liquid damage; employee issued new laptop."
                  value={replacementReason}
                  onChange={e => setReplacementReason(e.target.value)}
                  className="w-full py-2 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-white resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setReplacementContract(null)}
                  className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReplacement}
                  className="px-5 py-2 bg-gradient-to-r from-neon-cyan to-blue-500 hover:opacity-90 text-black text-xs font-bold rounded-xl shadow-lg transition-all disabled:opacity-50"
                >
                  {isSubmittingReplacement ? 'Submitting...' : 'Submit Replacement Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DRAWER: Contract Details & Audit Trail ── */}
      {detailsDrawerContract && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-zinc-900 border-l border-zinc-800 h-full overflow-y-auto p-6 space-y-6 shadow-2xl relative">
            <button
              onClick={() => setDetailsDrawerContract(null)}
              className="absolute top-5 right-5 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <span className="text-[11px] font-mono text-neon-cyan uppercase tracking-wider block">Contract Details</span>
              <h3 className="text-xl font-bold text-white mt-1">
                #{detailsDrawerContract.contract_number}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                {renderStatusBadge(detailsDrawerContract.status)}
                <span className="text-xs text-zinc-400">&bull; {detailsDrawerContract.plan_name}</span>
              </div>
            </div>

            {/* Quick Summary Grid */}
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-mono">Contract Type</span>
                <span className="text-white font-medium capitalize">{detailsDrawerContract.contract_type}</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-mono">Device Capacity</span>
                <span className="text-white font-medium font-mono">
                  {detailsDrawerContract.active_covered_count || 0} / {detailsDrawerContract.device_capacity}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-mono">Validity Range</span>
                <span className="text-zinc-300">
                  {detailsDrawerContract.start_date ? `${formatDisplayDate(detailsDrawerContract.start_date)} → ${formatDisplayDate(detailsDrawerContract.end_date)}` : 'Awaiting Activation'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-mono">Total Value</span>
                <span className="text-neon-cyan font-mono font-bold">
                  {formatCurrency(detailsDrawerContract.total_amount)}
                </span>
              </div>
            </div>

            {/* Covered Devices section */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                <span>Covered Devices ({Array.isArray(detailsDrawerContract.coveredDevices) ? detailsDrawerContract.coveredDevices.length : 0})</span>
                {detailsDrawerContract.status === 'active' && (
                  <button
                    onClick={() => {
                      const c = detailsDrawerContract;
                      setDetailsDrawerContract(null);
                      handleOpenManageDevices(c);
                    }}
                    className="text-neon-cyan hover:underline text-[11px] font-medium lowercase"
                  >
                    + manage
                  </button>
                )}
              </h4>
              <div className="space-y-2">
                {(!Array.isArray(detailsDrawerContract.coveredDevices) || detailsDrawerContract.coveredDevices.length === 0) ? (
                  <p className="text-xs text-zinc-500 bg-zinc-950 p-4 rounded-xl border border-zinc-800 text-center">
                    No devices covered yet.
                  </p>
                ) : (
                  detailsDrawerContract.coveredDevices.map(cd => (
                    <div
                      key={cd.id}
                      className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-semibold text-white block">{cd.brand} {cd.model_number}</span>
                        <span className="text-zinc-500 font-mono text-[11px]">SN: {cd.serial_number}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono capitalize ${
                        cd.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'
                      }`}>
                        {cd.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Contract History / Lifecycle */}
            {Array.isArray(detailsDrawerContract.history) && detailsDrawerContract.history.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-zinc-800">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Audit History
                </h4>
                <div className="space-y-2">
                  {detailsDrawerContract.history.map((h: any) => (
                    <div key={h.id} className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-300 capitalize">{h.action.replace(/_/g, ' ')}</span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          {new Date(h.created_at).toLocaleString()}
                        </span>
                      </div>
                      {h.notes && <p className="text-zinc-400 text-[11px]">{h.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

