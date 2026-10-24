import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCompanyContext } from '../../context/CompanyContext';
import {
    Receipt, FileText, Check, X, CreditCard,
    Loader2, AlertTriangle, CheckCircle2, Search, RefreshCw,
    Download, ShieldCheck, ArrowUpRight, History, Clock, Printer
} from 'lucide-react';
import { useSiteContext } from '../../context/SiteContext';
import { billingApi } from '../../services/api';
import { triggerRazorpayCheckout } from '@/utils/payment';
import { downloadPaymentBillPdf, printPaymentBill } from '@/utils/billGenerator';
import PaymentMethodModal from '@/components/PaymentMethodModal';
import { PaymentReceiptModal } from '@/components/PaymentReceiptModal';
import { toast } from 'react-hot-toast';
import { SkeletonTable } from '@/components/Skeleton';

interface LineItem {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
}

interface Quotation {
    id: string;
    companyId: number;
    companyName: string;
    requestId: number | null;
    title: string;
    amount: number;
    status: 'Pending' | 'Approved' | 'Rejected';
    items: LineItem[];
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

interface Invoice {
    id: string;
    userId: string;
    clientName: string;
    clientEmail?: string;
    clientPhone?: string;
    amount: number;
    currency: string;
    invoiceDate: string;
    dueDate: string;
    status: 'Paid' | 'Unpaid' | 'Overdue' | 'Draft' | 'Sent' | 'pending_verification' | 'rejected' | string;
    lineItems?: LineItem[];
    notes: string;
    payment_id?: string | null;
    payment_order_id?: string | null;
    payment_method?: string | null;
    paymentMethod?: string | null;
    collection_status?: string | null;
    collectionStatus?: string | null;
    ticket_id?: number | null;
    paid_at?: string | null;
    createdAt: string;
    updatedAt: string;
}

interface PaymentRecord {
    id: number;
    paymentId: string;
    orderId: string;
    ticketId: number | null;
    ticketNumber: string | null;
    invoiceId: string | null;
    userId: number;
    companyId: number | null;
    amount: number;
    currency: string;
    paymentMethod: string;
    status: 'success' | 'failed' | 'pending' | 'paid' | 'pending_verification' | 'rejected' | string;
    collectionStatus?: string;
    verificationStatus?: string;
    referenceNote?: string;
    gateway: string;
    clientName: string;
    deviceInfo: string | null;
    createdAt: string;
    updatedAt: string;
}

export default function CompanyBilling() {
    const { token, user } = useAuth();
    const { selectedCompanyId, isAdminManagingCompany, loadingCompanies } = useCompanyContext();
    const { flattenedSettings } = useSiteContext();
    const [activeTab, setActiveTab] = useState<'quotes' | 'invoices' | 'payments'>('quotes');
    const [quotes, setQuotes] = useState<Quotation[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

    // Quote breakdown modal
    const [selectedQuote, setSelectedQuote] = useState<Quotation | null>(null);

    // Track active payment / download loading state
    const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
    const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
    const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

    // Bill / Invoice modal & action state
    const [viewReceiptModalOpen, setViewReceiptModalOpen] = useState(false);
    const [selectedReceiptData, setSelectedReceiptData] = useState<any>(null);
    const [selectedReceiptTicketId, setSelectedReceiptTicketId] = useState<number | string | undefined>(undefined);
    const [selectedReceiptInvoiceId, setSelectedReceiptInvoiceId] = useState<string | undefined>(undefined);
    const [isActionLoading, setIsActionLoading] = useState(false);

    const handleViewInvoice = async (invoiceId: string) => {
        try {
            setIsActionLoading(true);
            const res = await billingApi.getPaymentReceiptByInvoice(invoiceId, token);
            const receipt = res.data?.data || res.data?.receipt || (res.data?.receiptNumber ? res.data : null);
            if (receipt) {
                setSelectedReceiptData(receipt);
                setSelectedReceiptInvoiceId(invoiceId);
                setSelectedReceiptTicketId(undefined);
                setViewReceiptModalOpen(true);
            } else {
                toast.error(res.error || 'Failed to fetch invoice details.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error opening invoice document.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handlePrintInvoice = async (invoiceId: string) => {
        try {
            setIsActionLoading(true);
            const res = await billingApi.getPaymentReceiptByInvoice(invoiceId, token);
            const receipt = res.data?.data || res.data?.receipt || (res.data?.receiptNumber ? res.data : null);
            if (receipt) {
                await printPaymentBill(receipt);
            } else {
                toast.error(res.error || 'Failed to fetch invoice for printing.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error printing invoice.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleViewTicketReceipt = async (ticketId: number | string) => {
        try {
            setIsActionLoading(true);
            const res = await billingApi.getPaymentReceiptByTicket(ticketId, token);
            const receipt = res.data?.data || res.data?.receipt || (res.data?.receiptNumber ? res.data : null);
            if (receipt) {
                setSelectedReceiptData(receipt);
                setSelectedReceiptTicketId(ticketId);
                setSelectedReceiptInvoiceId(undefined);
                setViewReceiptModalOpen(true);
            } else {
                toast.error(res.error || 'Failed to fetch ticket receipt.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error opening receipt document.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handlePrintTicketReceipt = async (ticketId: number | string) => {
        try {
            setIsActionLoading(true);
            const res = await billingApi.getPaymentReceiptByTicket(ticketId, token);
            const receipt = res.data?.data || res.data?.receipt || (res.data?.receiptNumber ? res.data : null);
            if (receipt) {
                await printPaymentBill(receipt);
            } else {
                toast.error(res.error || 'Failed to fetch ticket receipt for printing.');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error printing ticket receipt.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const fetchData = useCallback(async (isInitial = false) => {
        if (!token) return;
        if (isAdminManagingCompany && !selectedCompanyId && !loadingCompanies) {
            setLoading(false);
            return;
        }
        if (isInitial) setLoading(true);
        else setRefreshing(true);
        setError('');

        try {
            const [quotesRes, invoicesRes, paymentsRes] = await Promise.all([
                billingApi.getQuotations(token),
                billingApi.getInvoices(token),
                billingApi.getPayments(token)
            ]);

            if (quotesRes.data?.success && Array.isArray(quotesRes.data.data)) {
                setQuotes(quotesRes.data.data);
            } else if (Array.isArray(quotesRes.data)) {
                setQuotes(quotesRes.data);
            }

            if (invoicesRes.data?.success && Array.isArray(invoicesRes.data.data)) {
                setInvoices(invoicesRes.data.data);
            } else if (Array.isArray(invoicesRes.data)) {
                setInvoices(invoicesRes.data);
            }

            if (paymentsRes.data?.success && Array.isArray(paymentsRes.data.data)) {
                setPayments(paymentsRes.data.data);
            } else if (Array.isArray(paymentsRes.data)) {
                setPayments(paymentsRes.data);
            }

            setLastUpdated(new Date());
        } catch (err) {
            console.error('Failed to fetch billing data:', err);
            if (isInitial) {
                setError('Failed to fetch corporate billing and quotation records.');
            }
        } finally {
            if (isInitial) setLoading(false);
            setRefreshing(false);
        }
    }, [token, selectedCompanyId, isAdminManagingCompany, loadingCompanies]);

    // Initial fetch and 10s auto-refresh poll for real-time updates
    useEffect(() => {
        if (!token) return;
        if (isAdminManagingCompany && loadingCompanies) return;
        fetchData(true);

        const interval = setInterval(() => {
            fetchData(false);
        }, 10000);

        const handleFocus = () => {
            fetchData(false);
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', handleFocus);
        };
    }, [fetchData, token, selectedCompanyId, loadingCompanies]);

    const handleRespondQuote = async (id: string, status: 'Approved' | 'Rejected') => {
        setError('');
        setSuccess('');
        try {
            const res = await billingApi.respondToQuotation(token, id, status);
            const json = res.data;
            if (json?.success || res.status === 200) {
                toast.success(`Quotation has been successfully ${status.toLowerCase()}!`);
                setSuccess(`Quotation has been successfully ${status.toLowerCase()}!`);
                setSelectedQuote(null);
                fetchData(false);
                if (status === 'Approved') {
                    setActiveTab('invoices');
                }
            } else {
                toast.error(json?.message || 'Failed to update quotation response.');
                setError(json?.message || 'Failed to update quotation response.');
            }
        } catch {
            toast.error('An error occurred while responding to this quotation.');
            setError('An error occurred while responding to this quotation.');
        }
    };

    /**
     * Handle Official Razorpay Payment Flow for an Invoice
     */
    const handlePayInvoice = async (inv: Invoice) => {
        if (!token || payingInvoiceId) return;
        setPayingInvoiceId(inv.id);
        setError('');
        setSuccess('');

        try {
            // 1. Fetch Gateway Config
            const configRes = await billingApi.getConfig();
            const gatewayKey = configRes.data?.data?.keyId || '';

            // 2. Create authoritative payment order on the backend
            const orderRes = await billingApi.createPaymentOrder({
                invoiceId: inv.id,
                invoice_id: inv.id,
                amount: inv.amount,
                currency: 'INR'
            }, token);

            if (!orderRes.ok || !orderRes.data?.data) {
                throw new Error(orderRes.error || 'Failed to initialize payment gateway order.');
            }

            const orderData = orderRes.data.data;

            // 3. Trigger verified Razorpay checkout
            await triggerRazorpayCheckout({
                keyId: orderData.keyId || gatewayKey,
                orderId: orderData.orderId,
                amount: orderData.amount,
                currency: orderData.currency || 'INR',
                name: flattenedSettings.company_name || 'TekDoctor Services',
                description: `Invoice Settlement #${inv.id}`,
                prefill: {
                    name: inv.clientName || user?.name || 'Corporate Client',
                    email: user?.email || '',
                    contact: ''
                },
                onPaymentSuccess: async (rzpResponse) => {
                    try {
                        const verifyRes = await billingApi.verifyPayment({
                            razorpay_order_id: rzpResponse.razorpay_order_id,
                            razorpay_payment_id: rzpResponse.razorpay_payment_id,
                            razorpay_signature: rzpResponse.razorpay_signature,
                            invoiceId: inv.id,
                            invoice_id: inv.id
                        }, token);

                        if (verifyRes.ok) {
                            toast.success(`Invoice #${inv.id} paid & settled successfully!`);
                            setSuccess(`Invoice #${inv.id} paid successfully! Payment Reference: ${rzpResponse.razorpay_payment_id}`);
                            await fetchData(false);
                        } else {
                            const errMsg = verifyRes.error || 'Payment verification failed on the server.';
                            toast.error(errMsg);
                            setError(errMsg);
                        }
                    } catch (verErr: any) {
                        const msg = verErr?.message || 'Error settling payment.';
                        toast.error(msg);
                        setError(msg);
                    } finally {
                        setPayingInvoiceId(null);
                    }
                },
                onDismiss: async () => {
                    setPayingInvoiceId(null);
                    try {
                        await billingApi.reportPaymentFailure({
                            orderId: orderData.orderId,
                            invoiceId: inv.id,
                            reason: 'Payment modal closed by user',
                            status: 'cancelled'
                        }, token);
                    } catch { }
                },
                onPaymentError: async (pErr: any) => {
                    setPayingInvoiceId(null);
                    const errorMsg = pErr?.description || pErr?.message || 'Payment cancelled or declined.';
                    toast.error(errorMsg);
                    setError(errorMsg);
                    try {
                        await billingApi.reportPaymentFailure({
                            orderId: orderData.orderId,
                            invoiceId: inv.id,
                            reason: errorMsg,
                            status: 'failed'
                        }, token);
                    } catch { }
                }
            });
        } catch (err: any) {
            setPayingInvoiceId(null);
            const msg = err?.message || 'Payment initialization failed.';
            toast.error(msg);
            setError(msg);
        }
    };

    /**
     * Download Official GST Tax Invoice PDF
     */
    const handleDownloadInvoice = async (invoiceId: string) => {
        if (!token || downloadingInvoiceId) return;
        setDownloadingInvoiceId(invoiceId);
        const toastId = toast.loading(`Generating GST Tax Invoice #${invoiceId}...`);

        try {
            const res = await billingApi.getPaymentReceiptByInvoice(invoiceId, token);
            if (res.ok && res.data?.data) {
                await downloadPaymentBillPdf(res.data.data);
                toast.success(`GST Invoice #${invoiceId} downloaded successfully!`, { id: toastId });
            } else {
                toast.error(res.error || 'Failed to generate invoice PDF data.', { id: toastId });
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error generating PDF invoice.', { id: toastId });
        } finally {
            setDownloadingInvoiceId(null);
        }
    };

    /**
     * Download GST Invoice by Ticket ID
     */
    const handleDownloadTicketInvoice = async (ticketId: number | string) => {
        if (!token || downloadingInvoiceId) return;
        setDownloadingInvoiceId(String(ticketId));
        const toastId = toast.loading(`Generating GST Invoice for Ticket #${ticketId}...`);

        try {
            const res = await billingApi.getPaymentReceiptByTicket(ticketId, token);
            if (res.ok && res.data?.data) {
                await downloadPaymentBillPdf(res.data.data);
                toast.success(`GST Invoice for Ticket #${ticketId} downloaded!`, { id: toastId });
            } else {
                toast.error(res.error || 'Failed to retrieve invoice for ticket.', { id: toastId });
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error generating ticket PDF invoice.', { id: toastId });
        } finally {
            setDownloadingInvoiceId(null);
        }
    };

    // Filter quotes, invoices, and payments based on search query
    const filteredQuotes = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return quotes;
        return quotes.filter(q =>
            q.id.toLowerCase().includes(query) ||
            q.title.toLowerCase().includes(query) ||
            (q.notes && q.notes.toLowerCase().includes(query)) ||
            q.status.toLowerCase().includes(query)
        );
    }, [quotes, searchQuery]);

    const filteredInvoices = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return invoices;
        return invoices.filter(inv =>
            inv.id.toLowerCase().includes(query) ||
            inv.clientName.toLowerCase().includes(query) ||
            (inv.notes && inv.notes.toLowerCase().includes(query)) ||
            inv.status.toLowerCase().includes(query)
        );
    }, [invoices, searchQuery]);

    const filteredPayments = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return payments;
        return payments.filter(p =>
            p.paymentId.toLowerCase().includes(query) ||
            (p.orderId && p.orderId.toLowerCase().includes(query)) ||
            (p.ticketNumber && p.ticketNumber.toLowerCase().includes(query)) ||
            (p.invoiceId && p.invoiceId.toLowerCase().includes(query)) ||
            p.status.toLowerCase().includes(query)
        );
    }, [payments, searchQuery]);

    return (
        <div className="space-y-8 animate-fadeIn text-zinc-300">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-zinc-900 pb-5">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Billing, Payments & Invoices</h1>
                    <p className="text-zinc-500 text-sm mt-1">Review service estimates, settle pending invoices with Razorpay, and download official GST Tax Invoices.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>Gateway Active</span>
                    </div>
                    <button
                        onClick={() => fetchData(false)}
                        disabled={refreshing || loading}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl border border-zinc-800 transition-all cursor-pointer disabled:opacity-50"
                        title="Manual Refresh"
                    >
                        <RefreshCw size={13} className={refreshing ? 'animate-spin text-indigo-400' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Alert Messages */}
            {success && (
                <div className="bg-[#10b981]/10 border border-[#10b981]/25 text-[#10b981] p-4 rounded-xl text-sm font-medium flex items-center gap-2 animate-fadeIn">
                    <CheckCircle2 size={16} />
                    <span>{success}</span>
                </div>
            )}
            {error && (
                <div className="bg-[#ef4444]/10 border border-[#ef4444]/25 text-[#ef4444] p-4 rounded-xl text-sm font-medium flex items-center gap-2 animate-fadeIn">
                    <AlertTriangle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {/* Search and Tabs Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-900 pb-4">
                {/* Tabs Selector */}
                <div className="flex space-x-6">
                    <button
                        onClick={() => setActiveTab('quotes')}
                        className={`pb-2 text-sm font-mono uppercase tracking-wider relative transition-all cursor-pointer ${
                            activeTab === 'quotes' ? 'text-indigo-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        Estimates & Quotes ({quotes.length})
                        {activeTab === 'quotes' && (
                            <div className="absolute -bottom-4 left-0 right-0 h-[2px] bg-indigo-500 shadow-md shadow-indigo-500/50" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('invoices')}
                        className={`pb-2 text-sm font-mono uppercase tracking-wider relative transition-all cursor-pointer ${
                            activeTab === 'invoices' ? 'text-indigo-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        Invoices ({invoices.length})
                        {activeTab === 'invoices' && (
                            <div className="absolute -bottom-4 left-0 right-0 h-[2px] bg-indigo-500 shadow-md shadow-indigo-500/50" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('payments')}
                        className={`pb-2 text-sm font-mono uppercase tracking-wider relative transition-all cursor-pointer ${
                            activeTab === 'payments' ? 'text-indigo-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        Payment History ({payments.length})
                        {activeTab === 'payments' && (
                            <div className="absolute -bottom-4 left-0 right-0 h-[2px] bg-indigo-500 shadow-md shadow-indigo-500/50" />
                        )}
                    </button>
                </div>

                {/* Real-time Search Input */}
                <div className="relative w-full md:w-72">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                        type="text"
                        placeholder={`Search ${activeTab === 'quotes' ? 'quotes' : activeTab === 'invoices' ? 'invoices' : 'payments'}...`}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-zinc-800/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-all font-mono"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Last updated subtitle */}
            <div className="flex justify-between items-center text-[11px] font-mono text-zinc-600">
                <span>Secure PCI-DSS & GST Settle Network</span>
                <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
            </div>

            {/* Content Display */}
            {loading ? (
                <div className="py-2">
                    <SkeletonTable rows={5} columns={6} hasHeaderFilter={false} />
                </div>
            ) : activeTab === 'quotes' ? (
                /* ── TAB 1: Estimates & Quotes ── */
                filteredQuotes.length === 0 ? (
                    <div className="bg-[#0c0c0c] border border-zinc-900 border-dashed rounded-2xl py-20 text-center flex flex-col items-center justify-center space-y-4">
                        <FileText size={40} className="text-zinc-700" />
                        <div className="space-y-1">
                            <h3 className="text-zinc-300 font-bold text-base">
                                {searchQuery ? 'No Matching Quotations' : 'No Quotations Found'}
                            </h3>
                            <p className="text-zinc-500 text-xs max-w-sm">
                                {searchQuery
                                    ? `No quotations matched "${searchQuery}". Try clearing your search filter.`
                                    : 'When technicians inspect your fleet devices and submit repair scope estimates, they will appear here for company approval.'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {filteredQuotes.map(quote => (
                            <div
                                key={quote.id}
                                className="bg-[#0c0c0c] border border-zinc-900 hover:border-zinc-800 rounded-2xl p-6 transition-all flex flex-col justify-between space-y-6"
                            >
                                <div className="space-y-4">
                                    <div className="flex justify-between items-start gap-4">
                                        <div>
                                            <h3 className="font-bold text-white text-lg leading-snug">{quote.title}</h3>
                                            <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{quote.id}</span>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-mono tracking-wider font-bold ${
                                            quote.status === 'Approved'
                                                ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30'
                                                : quote.status === 'Rejected'
                                                    ? 'bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/30'
                                                    : 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
                                        }`}>
                                            {quote.status}
                                        </span>
                                    </div>

                                    {/* Quote items breakdown */}
                                    <div className="bg-black/40 border border-zinc-900 rounded-xl p-4 space-y-2">
                                        <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider block mb-1">Repair Scope Breakdown</span>
                                        {quote.items && quote.items.map((it, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-xs text-zinc-400">
                                                <span>{it.description} (x{it.quantity})</span>
                                                <span className="font-mono text-zinc-300">₹{(it.quantity * it.unitPrice).toLocaleString()}</span>
                                            </div>
                                        ))}
                                        <div className="border-t border-zinc-900 pt-2 flex justify-between items-center text-sm font-bold text-indigo-400">
                                            <span>Quoted Total</span>
                                            <span className="font-mono">₹{quote.amount.toLocaleString()}</span>
                                        </div>
                                    </div>

                                    {quote.notes && (
                                        <div className="text-xs text-zinc-500 bg-[#050505] p-3 rounded-lg border border-zinc-900 font-mono">
                                            <strong>Technician Notes:</strong> {quote.notes}
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-3 justify-end items-center pt-2">
                                    <button
                                        onClick={() => setSelectedQuote(quote)}
                                        className="text-xs font-semibold text-zinc-400 hover:text-white px-4 py-2 hover:bg-zinc-900 rounded-xl transition-all cursor-pointer"
                                    >
                                        View Breakdown
                                    </button>
                                    {quote.status === 'Pending' && (
                                        <>
                                            <button
                                                onClick={() => handleRespondQuote(quote.id, 'Rejected')}
                                                className="bg-transparent border border-zinc-800 hover:border-red-500/40 text-zinc-400 hover:text-red-400 font-semibold text-xs px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                                            >
                                                <X size={13} />
                                                <span>Reject</span>
                                            </button>
                                            <button
                                                onClick={() => handleRespondQuote(quote.id, 'Approved')}
                                                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/20"
                                            >
                                                <Check size={13} />
                                                <span>Approve Quote</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : activeTab === 'invoices' ? (
                /* ── TAB 2: Invoices ── */
                filteredInvoices.length === 0 ? (
                    <div className="bg-[#0c0c0c] border border-zinc-900 border-dashed rounded-2xl py-20 text-center flex flex-col items-center justify-center space-y-4">
                        <Receipt size={40} className="text-zinc-700" />
                        <div className="space-y-1">
                            <h3 className="text-zinc-300 font-bold text-base">
                                {searchQuery ? 'No Matching Invoices' : 'No Invoices Yet'}
                            </h3>
                            <p className="text-zinc-500 text-xs max-w-sm">
                                {searchQuery
                                    ? `No invoices matched "${searchQuery}". Try clearing your search filter.`
                                    : 'When quotations are approved or repairs completed, final corporate billing statements appear here for settlement and GST invoice download.'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto bg-[#0a0a0a] border border-zinc-900 rounded-2xl">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-zinc-900 bg-black/60 text-xs font-mono uppercase text-zinc-500 tracking-wider">
                                    <th className="py-4 px-6">Invoice ID</th>
                                    <th className="py-4 px-6">Client Name</th>
                                    <th className="py-4 px-6">Issue Date</th>
                                    <th className="py-4 px-6">Service Scope</th>
                                    <th className="py-4 px-6">Amount</th>
                                    <th className="py-4 px-6">Status</th>
                                    <th className="py-4 px-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900/60 text-sm">
                                {filteredInvoices.map(inv => {
                                    const isPaid = inv.status === 'Paid';
                                    const isPaying = payingInvoiceId === inv.id;
                                    const isDownloading = downloadingInvoiceId === inv.id;

                                    return (
                                        <tr key={inv.id} className="hover:bg-zinc-900/30 transition-colors">
                                            <td className="py-4 px-6 font-mono text-zinc-300 font-semibold">{inv.id}</td>
                                            <td className="py-4 px-6 text-zinc-300">{inv.clientName}</td>
                                            <td className="py-4 px-6 text-zinc-400 font-mono text-xs">
                                                {new Date(inv.invoiceDate).toLocaleDateString()}
                                            </td>
                                            <td className="py-4 px-6 text-zinc-400 text-xs truncate max-w-xs" title={inv.notes}>
                                                {inv.notes || 'IT & Device Repair Services'}
                                            </td>
                                            <td className="py-4 px-6 font-mono text-indigo-400 font-bold">
                                                ₹{inv.amount.toLocaleString()}
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-mono tracking-wider font-bold ${
                                                    isPaid
                                                        ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30'
                                                        : inv.status === 'pending_verification'
                                                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse'
                                                        : inv.status === 'rejected'
                                                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                                        : 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
                                                }`}>
                                                    {inv.status === 'pending_verification' ? 'PENDING VERIFICATION' : inv.status}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                <div className="flex justify-end items-center gap-1.5 text-xs">
                                                    {isPaid ? (
                                                        <>
                                                            <button
                                                                onClick={() => handleViewInvoice(inv.id)}
                                                                disabled={isActionLoading}
                                                                className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-neon-cyan/40 text-zinc-300 hover:text-neon-cyan font-medium rounded-xl transition-all cursor-pointer shadow-sm"
                                                                title="View Tax Invoice Details"
                                                            >
                                                                <Receipt size={13} className="text-neon-cyan" />
                                                                <span>View</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handlePrintInvoice(inv.id)}
                                                                disabled={isActionLoading}
                                                                className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-400/40 text-zinc-300 hover:text-amber-400 font-medium rounded-xl transition-all cursor-pointer shadow-sm"
                                                                title="Print Tax Invoice"
                                                            >
                                                                <Printer size={13} className="text-amber-400" />
                                                                <span>Print</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDownloadInvoice(inv.id)}
                                                                disabled={isDownloading || isActionLoading}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-semibold rounded-xl transition-all cursor-pointer shadow-sm"
                                                                title="Download Official GST Tax Invoice"
                                                            >
                                                                {isDownloading ? (
                                                                    <Loader2 size={13} className="animate-spin" />
                                                                ) : (
                                                                    <Download size={13} />
                                                                )}
                                                                <span>PDF</span>
                                                            </button>
                                                        </>
                                                    ) : inv.status === 'pending_verification' ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
                                                                <Clock size={12} className="animate-pulse" />
                                                                <span>Verification Pending</span>
                                                            </span>
                                                            {(inv.collection_status !== 'collected' && ((inv.payment_method || inv.paymentMethod || '').toLowerCase() === 'cash')) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPayingInvoice(inv)}
                                                                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-md shadow-indigo-600/20"
                                                                    title="Pay Online Instead"
                                                                >
                                                                    <CreditCard size={12} />
                                                                    <span>Pay Online</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : (inv.status === 'Draft' || inv.status === 'Void') ? (
                                                        <span className="text-xs font-mono text-zinc-500 italic px-2 py-1 bg-zinc-900 rounded-lg border border-zinc-800">
                                                            {inv.status === 'Draft' ? 'Under Review' : 'Voided'}
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={() => setPayingInvoice(inv)}
                                                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
                                                        >
                                                            <CreditCard size={13} />
                                                            <span>{inv.status === 'rejected' ? 'Pay Online (Retry)' : 'Pay Now'}</span>
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
                )
            ) : (
                /* ── TAB 3: Payment History ── */
                filteredPayments.length === 0 ? (
                    <div className="bg-[#0c0c0c] border border-zinc-900 border-dashed rounded-2xl py-20 text-center flex flex-col items-center justify-center space-y-4">
                        <History size={40} className="text-zinc-700" />
                        <div className="space-y-1">
                            <h3 className="text-zinc-300 font-bold text-base">
                                {searchQuery ? 'No Matching Payment Records' : 'No Payment Transactions Yet'}
                            </h3>
                            <p className="text-zinc-500 text-xs max-w-sm">
                                {searchQuery
                                    ? `No transactions matched "${searchQuery}". Try clearing your search filter.`
                                    : 'Once you settle invoices or repair bills via Razorpay, all verified transactions will appear here with instant GST invoice download.'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto bg-[#0a0a0a] border border-zinc-900 rounded-2xl">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-zinc-900 bg-black/60 text-xs font-mono uppercase text-zinc-500 tracking-wider">
                                    <th className="py-4 px-6">Payment Reference</th>
                                    <th className="py-4 px-6">Order ID</th>
                                    <th className="py-4 px-6">Date & Time</th>
                                    <th className="py-4 px-6">Reference Document</th>
                                    <th className="py-4 px-6">Amount Settled</th>
                                    <th className="py-4 px-6">Status</th>
                                    <th className="py-4 px-6 text-right">Tax Invoice</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900/60 text-sm">
                                {filteredPayments.map(p => {
                                    const isDownloading = downloadingInvoiceId === (p.invoiceId || String(p.ticketId));

                                    return (
                                        <tr key={p.id} className="hover:bg-zinc-900/30 transition-colors">
                                            <td className="py-4 px-6">
                                                <span className="font-mono text-white text-xs font-bold block">{p.paymentId}</span>
                                                <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">{p.paymentMethod || 'Razorpay Online'}</span>
                                            </td>
                                            <td className="py-4 px-6 font-mono text-zinc-400 text-xs">
                                                {p.orderId || '-'}
                                            </td>
                                            <td className="py-4 px-6 font-mono text-zinc-400 text-xs">
                                                {new Date(p.createdAt).toLocaleString()}
                                            </td>
                                            <td className="py-4 px-6 text-xs">
                                                {p.invoiceId ? (
                                                    <span className="font-mono text-indigo-400 font-semibold">Invoice #{p.invoiceId}</span>
                                                ) : p.ticketNumber ? (
                                                    <span className="font-mono text-cyan-400 font-semibold">Ticket #{p.ticketNumber}</span>
                                                ) : (
                                                    <span className="text-zinc-500">Direct Settlement</span>
                                                )}
                                            </td>
                                            <td className="py-4 px-6 font-mono text-emerald-400 font-bold">
                                                ₹{Number(p.amount).toLocaleString()}
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className={`px-2.5 py-1 rounded-full text-[11px] font-mono tracking-wider font-bold ${
                                                    p.status === 'paid' ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30' :
                                                    p.status === 'pending_verification' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' :
                                                    p.status === 'rejected' ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' :
                                                    'bg-zinc-800 text-zinc-400 border border-zinc-700'
                                                }`}>
                                                    {p.status ? p.status.toUpperCase().replace('_', ' ') : 'PAID'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                <div className="flex justify-end items-center gap-1.5 text-xs">
                                                    <button
                                                        onClick={() => {
                                                            if (p.invoiceId) handleViewInvoice(p.invoiceId);
                                                            else if (p.ticketId) handleViewTicketReceipt(p.ticketId);
                                                        }}
                                                        disabled={isActionLoading}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-neon-cyan/40 text-zinc-300 hover:text-neon-cyan font-medium rounded-xl transition-all cursor-pointer shadow-sm"
                                                        title="View Bill / Receipt"
                                                    >
                                                        <Receipt size={13} className="text-neon-cyan" />
                                                        <span>View</span>
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (p.invoiceId) handlePrintInvoice(p.invoiceId);
                                                            else if (p.ticketId) handlePrintTicketReceipt(p.ticketId);
                                                        }}
                                                        disabled={isActionLoading}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-400/40 text-zinc-300 hover:text-amber-400 font-medium rounded-xl transition-all cursor-pointer shadow-sm"
                                                        title="Print Document"
                                                    >
                                                        <Printer size={13} className="text-amber-400" />
                                                        <span>Print</span>
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (p.invoiceId) handleDownloadInvoice(p.invoiceId);
                                                            else if (p.ticketId) handleDownloadTicketInvoice(p.ticketId);
                                                        }}
                                                        disabled={isDownloading || isActionLoading}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/40 text-zinc-300 hover:text-emerald-400 text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-sm"
                                                        title="Download GST Tax Invoice"
                                                    >
                                                        {isDownloading ? (
                                                            <Loader2 size={13} className="animate-spin text-emerald-400" />
                                                        ) : (
                                                            <Download size={13} />
                                                        )}
                                                        <span>PDF</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )
            )}

            {/* Quotation Detail Modal */}
            {selectedQuote && (
                <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-sm">
                    <div className="bg-[#0a0a0a] border border-zinc-900 rounded-2xl w-full max-w-xl overflow-hidden animate-slideUp">
                        <div className="px-6 py-4 border-b border-zinc-900 flex justify-between items-center shadow-lg">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Receipt className="text-indigo-400" size={18} />
                                <span>Quotation Details & Estimate Scope</span>
                            </h2>
                            <button
                                onClick={() => setSelectedQuote(null)}
                                className="p-1 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div>
                                <div className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Project ID & Title</div>
                                <h3 className="text-xl font-bold text-white mt-1">{selectedQuote.title}</h3>
                                <div className="text-zinc-500 text-xs font-mono mt-0.5">Quote Reference: {selectedQuote.id}</div>
                            </div>

                            {/* Quote line items */}
                            <div className="space-y-3">
                                <div className="text-xs font-mono uppercase text-zinc-500 tracking-wider border-b border-zinc-900 pb-2">Scope Breakdown</div>
                                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                                    {selectedQuote.items && selectedQuote.items.map((item, idx) => (
                                        <div key={idx} className="bg-black/30 border border-zinc-900/60 p-3 rounded-xl flex justify-between items-center">
                                            <div>
                                                <div className="text-sm font-semibold text-white">{item.description}</div>
                                                <div className="text-xs text-zinc-500 font-mono mt-0.5">Qty: {item.quantity} • Unit: ₹{item.unitPrice.toLocaleString()}</div>
                                            </div>
                                            <div className="font-mono text-indigo-400 font-bold text-sm">₹{item.total.toLocaleString()}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-[#0c0c0c] border border-zinc-900 p-4 rounded-xl flex justify-between items-center">
                                <span className="text-sm font-bold text-zinc-400">Total Quoted Amount</span>
                                <span className="font-mono text-lg font-bold text-indigo-400">₹{selectedQuote.amount.toLocaleString()}</span>
                            </div>

                            {selectedQuote.notes && (
                                <div className="bg-[#0c0c0c] border border-zinc-900 p-4 rounded-xl text-xs space-y-1">
                                    <div className="text-zinc-400 font-bold">Important Notes / Terms:</div>
                                    <div className="text-zinc-500 leading-relaxed font-mono">{selectedQuote.notes}</div>
                                </div>
                            )}

                            <div className="pt-4 border-t border-zinc-900 flex justify-end gap-3">
                                <button
                                    onClick={() => setSelectedQuote(null)}
                                    className="bg-transparent hover:bg-zinc-900 text-zinc-400 hover:text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                                >
                                    Close
                                </button>
                                {selectedQuote.status === 'Pending' && (
                                    <>
                                        <button
                                            onClick={() => handleRespondQuote(selectedQuote.id, 'Rejected')}
                                            className="bg-transparent border border-zinc-800 hover:border-red-500/40 text-red-500/80 hover:text-red-400 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all cursor-pointer"
                                        >
                                            Reject Estimate
                                        </button>
                                        <button
                                            onClick={() => handleRespondQuote(selectedQuote.id, 'Approved')}
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all cursor-pointer shadow-lg shadow-indigo-600/20"
                                        >
                                            Accept & Generate Invoice
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Method Modal for Invoices */}
            {payingInvoice && (
                <PaymentMethodModal
                    isOpen={Boolean(payingInvoice)}
                    onClose={() => setPayingInvoice(null)}
                    invoiceId={payingInvoice.id}
                    amount={payingInvoice.amount}
                    token={token}
                    customerName={payingInvoice.clientName || 'Corporate Client'}
                    customerEmail={payingInvoice.clientEmail}
                    customerPhone={payingInvoice.clientPhone}
                    onSuccess={() => {
                        setPayingInvoice(null);
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
                    setSelectedReceiptInvoiceId(undefined);
                }}
                receipt={selectedReceiptData}
                ticketId={selectedReceiptTicketId}
                invoiceId={selectedReceiptInvoiceId}
            />
        </div>
    );
}
