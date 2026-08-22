import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    Receipt, FileText, Check, X, Download, CreditCard, Printer,
    Loader2, Building2, Clock, AlertTriangle, ChevronRight, CheckCircle2
} from 'lucide-react';
import { useSiteContext } from '../../context/SiteContext';
import { appConfig } from '../../config/appConfig';

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
    amount: number;
    currency: string;
    invoiceDate: string;
    dueDate: string;
    status: 'Paid' | 'Unpaid' | 'Overdue' | 'Draft' | 'Sent';
    lineItems?: LineItem[]; // line items might match or dynamically format
    notes: string;
    createdAt: string;
    updatedAt: string;
}

export default function CompanyBilling() {
    const { token } = useAuth();
    const { flattenedSettings } = useSiteContext();
    const [activeTab, setActiveTab] = useState<'quotes' | 'invoices'>('quotes');
    const [quotes, setQuotes] = useState<Quotation[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Modal details
    const [selectedQuote, setSelectedQuote] = useState<Quotation | null>(null);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [processingPayment, setProcessingPayment] = useState(false);

    // Mock Card form fields
    const [cardHolder, setCardHolder] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [cvv, setCvv] = useState('');

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const [quotesRes, invoicesRes] = await Promise.all([
                fetch('http://localhost:5000/api/billing/quotations', {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch('http://localhost:5000/api/billing/invoices', {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);

            const quotesJson = await quotesRes.json();
            const invoicesJson = await invoicesRes.json();

            if (quotesJson.success) {
                setQuotes(quotesJson.data);
            }
            if (invoicesJson.success) {
                setInvoices(invoicesJson.data);
            } else if (invoicesJson.length !== undefined) {
                // If invoices is returned as a plain array (since fallback/mocking routes return direct arrays)
                setInvoices(invoicesJson);
            }
        } catch (err) {
            console.error(err);
            setError('Failed to fetch billing and quotation records details.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) {
            fetchData();
        }
    }, [token]);

    const handleRespondQuote = async (id: string, status: 'Approved' | 'Rejected') => {
        setError('');
        setSuccess('');
        try {
            const res = await fetch(`http://localhost:5000/api/billing/quotations/${id}/respond`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ status })
            });
            const json = await res.json();
            if (json.success) {
                setSuccess(`Quotation has been successfully ${status.toLowerCase()}!`);
                setSelectedQuote(null);
                fetchData();
            } else {
                setError(json.message);
            }
        } catch {
            setError('An error occurred while responding to this quotation.');
        }
    };

    const handlePayInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedInvoice) return;
        setError('');
        setSuccess('');
        setProcessingPayment(true);

        try {
            const res = await fetch('http://localhost:5000/api/billing/pay', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    invoiceId: selectedInvoice.id,
                    paymentMethod: 'Credit Card',
                    cardNumber,
                    expiry: expiryDate,
                    cvc: cvv
                })
            });

            const json = await res.json();
            if (json.success) {
                setSuccess(`Invoice ${selectedInvoice.id} paid successfully!`);
                setIsPaymentOpen(false);
                setSelectedInvoice(null);
                fetchData();
            } else {
                setError(json.message);
            }
        } catch {
            setError('Failed to process mock credit card payment.');
        } finally {
            setProcessingPayment(false);
        }
    };

    const handlePrintInvoice = (inv: Invoice) => {
        // Open print-friendly clean pop-up template
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) return;

        const dateStr = new Date(inv.invoiceDate).toLocaleDateString();
        const dueStr = new Date(inv.dueDate).toLocaleDateString();
        const items = inv.lineItems || [];

        printWindow.document.write(`
            <html>
                <head>
                    <title>Invoice ${inv.id}</title>
                    <style>
                        body { font-family: monospace; padding: 40px; color: #333; }
                        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 20px; }
                        .title { font-size: 24px; font-weight: bold; }
                        .meta { margin-top: 20px; line-height: 1.6; }
                        table { width: 100%; border-collapse: collapse; margin-top: 30px; }
                        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
                        th { bg-color: #f5f5f5; }
                        .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 25px; }
                        .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #777; border-top: 1px solid #ddd; padding-top: 20px; }
                    </style>
                </head>
                <body onload="window.print(); window.close();">
                    <div class="header">
                        <div>
                            <div class="title">${flattenedSettings.company_name?.toUpperCase() || 'TEKDOCTOR'}</div>
                            <div>Enterprise Device Repair Services</div>
                            <div>${flattenedSettings.company_email || 'help@tekdoctor.in'}</div>
                        </div>
                        <div style="text-align: right">
                            <div class="title">INVOICE</div>
                            <div>ID: ${inv.id}</div>
                            <div>Date: ${dateStr}</div>
                        </div>
                    </div>

                    <div class="meta">
                        <strong>Billed To:</strong><br/>
                        ${inv.clientName}<br/>
                        Corporate Client Portal<br/>
                        <strong>Due Date:</strong> ${dueStr}<br/>
                        <strong>Payment Status:</strong> ${inv.status}
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th>Quantity</th>
                                <th>Unit Price</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.length > 0
                ? items.map(item => `
                                    <tr>
                                        <td>${item.description}</td>
                                        <td>${item.quantity}</td>
                                        <td>INR ${item.unitPrice.toFixed(2)}</td>
                                        <td>INR ${item.total.toFixed(2)}</td>
                                    </tr>
                                  `).join('')
                : `<tr><td colspan="4" style="text-align:center">Standard service fee</td></tr>`
            }
                        </tbody>
                    </table>

                    <div class="total">
                        Total Amount Billed: INR ${inv.amount.toFixed(2)}
                    </div>

                    <div style="margin-top: 30px; font-size: 11px;">
                        <strong>Notes & Terms:</strong><br/>
                        ${inv.notes || 'Thank you for your business! Net 30 payment terms apply.'}
                    </div>

                    <div class="footer">
                        © ${new Date().getFullYear()} ${flattenedSettings.company_name || 'TekDoctor'} business invoicing network. All transactions are logged securely.
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div className="space-y-8 animate-fadeIn text-zinc-300">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-zinc-900 pb-5">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Billing & Quotations</h1>
                    <p className="text-zinc-500 text-sm mt-1">Review service quotation estimates, approve project bids, and clear pending invoices.</p>
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

            {/* Tabs Selector */}
            <div className="flex border-b border-zinc-900 space-x-6">
                <button
                    onClick={() => setActiveTab('quotes')}
                    className={`pb-4 text-sm font-mono uppercase tracking-wider relative transition-all cursor-pointer ${activeTab === 'quotes' ? 'text-indigo-400 font-bold' : 'text-zinc-500 hover:text-zinc-350'
                        }`}
                >
                    Estimates & Quotes ({quotes.length})
                    {activeTab === 'quotes' && (
                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500 shadow-md shadow-indigo-500/50" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('invoices')}
                    className={`pb-4 text-sm font-mono uppercase tracking-wider relative transition-all cursor-pointer ${activeTab === 'invoices' ? 'text-indigo-400 font-bold' : 'text-zinc-500 hover:text-zinc-350'
                        }`}
                >
                    Invoices & Payments ({invoices.length})
                    {activeTab === 'invoices' && (
                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500 shadow-md shadow-indigo-500/50" />
                    )}
                </button>
            </div>

            {/* Loading / Content */}
            {loading ? (
                <div className="flex items-center justify-center min-h-[300px]">
                    <Loader2 className="animate-spin text-indigo-500" size={32} />
                </div>
            ) : activeTab === 'quotes' ? (
                quotes.length === 0 ? (
                    <div className="bg-[#0c0c0c] border border-zinc-900 border-dashed rounded-2xl py-20 text-center flex flex-col items-center justify-center space-y-4">
                        <FileText size={40} className="text-zinc-700" />
                        <div className="space-y-1">
                            <h3 className="text-zinc-300 font-bold text-base">No Quotations Found</h3>
                            <p className="text-zinc-500 text-xs max-w-sm">When technicians inspect your devices and submit repair scope pricing, they will appear here as estimates for your approval.</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {quotes.map(quote => (
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
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-mono tracking-wider font-bold ${quote.status === 'Approved'
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
                                        <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider block mb-1">Repair Items Summary</span>
                                        {quote.items.map((it, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-xs text-zinc-400">
                                                <span>{it.description} (x{it.quantity})</span>
                                                <span className="font-mono text-zinc-300">INR {(it.quantity * it.unitPrice).toLocaleString()}</span>
                                            </div>
                                        ))}
                                        <div className="border-t border-zinc-900 pt-2 flex justify-between items-center text-sm font-bold text-indigo-400">
                                            <span>Quoted Total</span>
                                            <span className="font-mono">INR {quote.amount.toLocaleString()}</span>
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
                                                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
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
            ) : (
                invoices.length === 0 ? (
                    <div className="bg-[#0c0c0c] border border-zinc-900 border-dashed rounded-2xl py-20 text-center flex flex-col items-center justify-center space-y-4">
                        <Receipt size={40} className="text-zinc-700" />
                        <div className="space-y-1">
                            <h3 className="text-zinc-300 font-bold text-base">No Invoices Yet</h3>
                            <p className="text-zinc-500 text-xs max-w-sm">When you approve quotations, final corporate billing statements are created and listed here for outstanding payments.</p>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto bg-[#0a0a0a] border border-zinc-900 rounded-2xl">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-zinc-900 bg-black/60 text-xs font-mono uppercase text-zinc-500 tracking-wider">
                                    <th className="py-4 px-6">Invoice ID</th>
                                    <th className="py-4 px-6">Client Name</th>
                                    <th className="py-4 px-6">Date</th>
                                    <th className="py-4 px-6">Details</th>
                                    <th className="py-4 px-6">Amount</th>
                                    <th className="py-4 px-6">Status</th>
                                    <th className="py-4 px-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900/60 text-sm">
                                {invoices.map(inv => (
                                    <tr key={inv.id} className="hover:bg-zinc-900/30 transition-colors">
                                        <td className="py-4 px-6 font-mono text-zinc-300">{inv.id}</td>
                                        <td className="py-4 px-6 text-zinc-300">{inv.clientName}</td>
                                        <td className="py-4 px-6 text-zinc-400 font-mono text-xs">
                                            {new Date(inv.invoiceDate).toLocaleDateString()}
                                        </td>
                                        <td className="py-4 px-6 text-zinc-400 text-xs truncate max-w-xs" title={inv.notes}>
                                            {inv.notes || 'N/A'}
                                        </td>
                                        <td className="py-4 px-6 font-mono text-indigo-400 font-semibold">
                                            INR {inv.amount.toLocaleString()}
                                        </td>
                                        <td className="py-4 px-6">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-mono tracking-wider font-bold ${inv.status === 'Paid'
                                                ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30'
                                                : 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
                                                }`}>
                                                {inv.status}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-right flex justify-end gap-2 text-xs">
                                            <button
                                                onClick={() => handlePrintInvoice(inv)}
                                                className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                                                title="Print Invoice"
                                            >
                                                <Printer size={14} />
                                            </button>
                                            {inv.status !== 'Paid' && (
                                                <button
                                                    onClick={() => {
                                                        setSelectedInvoice(inv);
                                                        setIsPaymentOpen(true);
                                                    }}
                                                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                                                >
                                                    <CreditCard size={13} />
                                                    <span>Pay</span>
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
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
                                <span>Quotation details & Estimate</span>
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
                                <div className="text-xs font-mono uppercase text-zinc-500 tracking-wider border-b border-zinc-900 pb-2">Line Items Breakdown</div>
                                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                                    {selectedQuote.items.map((item, idx) => (
                                        <div key={idx} className="bg-black/30 border border-zinc-900/60 p-3 rounded-xl flex justify-between items-center">
                                            <div>
                                                <div className="text-sm font-semibold text-white">{item.description}</div>
                                                <div className="text-xs text-zinc-500 font-mono mt-0.5">Qty: {item.quantity} • Unit: INR {item.unitPrice.toLocaleString()}</div>
                                            </div>
                                            <div className="font-mono text-indigo-400 font-bold text-sm">INR {item.total.toLocaleString()}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-[#0c0c0c] border border-zinc-900 p-4 rounded-xl flex justify-between items-center">
                                <span className="text-sm font-bold text-zinc-400">Total Project Est.</span>
                                <span className="font-mono text-lg font-bold text-indigo-400">INR {selectedQuote.amount.toLocaleString()}</span>
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
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all cursor-pointer"
                                        >
                                            Accept Quote
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {isPaymentOpen && selectedInvoice && (
                <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-sm">
                    <div className="bg-[#0a0a0a] border border-zinc-900 rounded-2xl w-full max-w-md overflow-hidden animate-slideUp">
                        <div className="px-6 py-4 border-b border-zinc-900 flex justify-between items-center shadow-lg">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <CreditCard className="text-indigo-400" size={18} />
                                <span>Process Corporate Payment</span>
                            </h2>
                            <button
                                onClick={() => {
                                    setIsPaymentOpen(false);
                                    setSelectedInvoice(null);
                                }}
                                className="p-1 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handlePayInvoice} className="p-6 space-y-4">
                            <div className="bg-[#0c0c0c] border border-zinc-900 p-4 rounded-xl flex justify-between items-center">
                                <div>
                                    <div className="text-xs text-zinc-500 font-mono">INVOICE TO PAY</div>
                                    <div className="text-sm font-bold text-white mt-0.5">{selectedInvoice.id}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-zinc-500 font-mono">TOTAL DUE</div>
                                    <div className="text-sm font-mono font-bold text-indigo-400">INR {selectedInvoice.amount.toLocaleString()}</div>
                                </div>
                            </div>

                            <div className="text-xs font-mono uppercase text-zinc-550 border-b border-zinc-900 pb-2">Simulator Card Details</div>

                            <div className="space-y-1">
                                <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Cardholder Name *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. John Doe"
                                    value={cardHolder}
                                    onChange={e => setCardHolder(e.target.value)}
                                    className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Card Number *</label>
                                <input
                                    type="text"
                                    required
                                    maxLength={16}
                                    placeholder="4111 2222 3333 4444"
                                    value={cardNumber}
                                    onChange={e => setCardNumber(e.target.value)}
                                    className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors font-mono"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Expiry Date *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="MM/YY"
                                        maxLength={5}
                                        value={expiryDate}
                                        onChange={e => setExpiryDate(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">CVV *</label>
                                    <input
                                        type="text"
                                        required
                                        maxLength={3}
                                        placeholder="123"
                                        value={cvv}
                                        onChange={e => setCvv(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors font-mono"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-zinc-900 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsPaymentOpen(false);
                                        setSelectedInvoice(null);
                                    }}
                                    className="bg-transparent hover:bg-zinc-900 text-zinc-400 hover:text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={processingPayment}
                                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/10"
                                >
                                    {processingPayment ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            <span>Processing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 size={14} />
                                            <span>Submit Payment</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
