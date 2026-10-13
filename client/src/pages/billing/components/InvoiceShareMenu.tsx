'use client';

import { useState, useRef } from 'react';
import { Share2, Mail, Download, Printer, Copy, Check, ShieldCheck, ShieldOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useSiteContext } from '../../../context/SiteContext';
import { appConfig } from '../../../config/appConfig';
import { ConfirmModal } from '@/components/ConfirmModal';
import { billingApi } from '@/services/api';
import {
  downloadPaymentBillPdf,
  printPaymentBill,
  type PaymentReceiptData
} from '@/utils/billGenerator';

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Invoice {
  id: string;
  userId: string;
  clientName: string;
  amount: number;
  currency: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  lineItems: LineItem[];
  notes: string;
  createdAt: string;
  lastUpdatedAt?: string;
  updatedAt?: string;
}

interface InvoiceShareMenuProps {
  invoice: Invoice;
  onDelete?: (invoiceId: string) => Promise<void>;
}

export default function InvoiceShareMenu({ invoice, onDelete }: InvoiceShareMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { flattenedSettings } = useSiteContext();

  const handleEmailShare = () => {
    const subject = `Invoice ${invoice.id} - ${invoice.clientName}`;
    const body = `
Invoice Details:
ID: ${invoice.id}
Client: ${invoice.clientName}
Amount: ₹${invoice.amount.toFixed(2)}
Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}
Due: ${new Date(invoice.dueDate).toLocaleDateString()}
Status: ${invoice.status}

Items:
${invoice.lineItems
        .map(
          item =>
            `- ${item.description}: ${item.quantity} x ₹${item.unitPrice.toFixed(
              2
            )} = ₹${item.total.toFixed(2)}`
        )
        .join('\n')}

Total: ₹${invoice.amount.toFixed(2)}

Notes: ${invoice.notes || 'N/A'}
    `.trim();

    const mailtoLink = `mailto:?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoLink;
    setIsOpen(false);
  };

  const buildReceiptDataFromInvoice = (inv: Invoice): PaymentReceiptData => {
    const lineItems = (inv.lineItems || []).map((li: any) => {
      const qty = Number(li.quantity || 1);
      const unitPrice = Number(li.unitPrice || 0);
      const itemTotal = Number(li.total || (qty * unitPrice));
      const taxRate = Number(li.taxRate !== undefined ? li.taxRate : 18);
      const taxAmount = Number(li.taxAmount || (itemTotal * taxRate / 100));
      return {
        description: li.description || 'Service Item',
        hsnSac: li.hsnSac || '9987',
        quantity: qty,
        unitPrice,
        unitRate: unitPrice,
        total: itemTotal,
        taxRate,
        taxAmount,
        taxableAmount: itemTotal,
        amount: itemTotal
      };
    });

    const subtotal = Number((inv as any).subtotal || lineItems.reduce((acc, li) => acc + li.total, 0));
    const isInterstate = Boolean((inv as any).isInterstate);
    const taxAmount = Number((inv as any).taxAmount || (inv.amount - subtotal));
    const effectiveTaxRate = subtotal > 0
      ? Math.round((taxAmount / subtotal) * 10000) / 100
      : (lineItems.length > 0 && lineItems[0].taxRate !== undefined ? lineItems[0].taxRate : 18);
    const halfRate = Math.round((effectiveTaxRate / 2) * 100) / 100;
    const cgstAmount = Number((inv as any).cgstAmount || (isInterstate ? 0 : taxAmount / 2));
    const sgstAmount = Number((inv as any).sgstAmount || (isInterstate ? 0 : taxAmount - cgstAmount));
    const igstAmount = Number((inv as any).igstAmount || (isInterstate ? taxAmount : 0));

    return {
      receiptNumber: inv.id,
      invoiceId: inv.id,
      invoiceStatus: inv.status,
      isFinal: inv.status === 'Final' || inv.status === 'Paid',
      ticketId: (inv as any).ticketId ? Number((inv as any).ticketId) : null,
      ticketNumber: (inv as any).ticketNumber || (inv as any).ticket_number || null,
      billDate: inv.invoiceDate || new Date().toISOString(),
      paymentDate: (inv as any).paidAt || inv.invoiceDate || new Date().toISOString(),
      paymentStatus: inv.status.toLowerCase() === 'paid' ? 'paid' : (inv.status.toLowerCase() === 'draft' ? 'draft' : 'unpaid'),
      paymentMethod: (inv as any).paymentMethod || (inv as any).payment_method || null,
      paymentId: (inv as any).paymentId || (inv as any).payment_id || null,
      notes: inv.notes,
      clientType: 'individual',
      customer: {
        name: inv.clientName || 'Customer',
        email: (inv as any).userEmail || (inv as any).email || '',
        mobile: (inv as any).userPhone || (inv as any).mobile || null,
        companyName: (inv as any).companyName || null,
        companyTaxId: (inv as any).companyGstin || null
      },
      device: (inv as any).deviceBrand ? {
        brand: (inv as any).deviceBrand,
        modelNumber: (inv as any).deviceModel || '',
        category: (inv as any).deviceCategory || 'Device',
      } : null,
      financials: {
        currency: inv.currency || 'INR',
        currencySymbol: '₹',
        subtotal,
        taxableAmount: subtotal,
        taxRate: effectiveTaxRate,
        taxAmount,
        totalGst: taxAmount,
        isInterstate,
        cgstRate: isInterstate ? 0 : halfRate,
        cgstAmount,
        sgstRate: isInterstate ? 0 : halfRate,
        sgstAmount,
        igstRate: isInterstate ? effectiveTaxRate : 0,
        igstAmount,
        totalAmount: inv.amount,
        amountPaid: inv.status === 'Paid' ? inv.amount : 0,
        balanceDue: inv.status === 'Paid' ? 0 : inv.amount,
        lineItems
      },
      business: {
        name: flattenedSettings.company_name || 'TekDoctor',
        tagline: flattenedSettings.site_tagline || 'Your Computer’s Personal Care Specialist',
        logoUrl: flattenedSettings.site_logo_black || flattenedSettings.site_logo || '/tekdoctor_logo_black.png',
        address: flattenedSettings.company_address || 'TekDoctor ESD Safe Facilities',
        email: flattenedSettings.company_email || 'support@tekdoctor.in',
        phone: flattenedSettings.company_phone || '+91 98765 43210',
        gstin: flattenedSettings.company_gstin || '27AAAAA0000A1Z5',
        website: flattenedSettings.site_url || 'https://thetekdoctor.com'
      }
    };
  };

  const handlePDFExport = async () => {
    const toastId = toast.loading('Generating official GST PDF bill...');
    try {
      let billData: PaymentReceiptData | null = null;
      try {
        const res = await billingApi.getPaymentReceiptByInvoice(invoice.id);
        if (res && res.ok && res.data?.data) {
          billData = res.data.data;
        }
      } catch { }

      if (!billData) {
        billData = buildReceiptDataFromInvoice(invoice);
      }

      await downloadPaymentBillPdf(billData);
      toast.success('Invoice PDF downloaded!', { id: toastId });
      setIsOpen(false);
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF. Please try again.', { id: toastId });
    }
  };

  const handlePrint = async () => {
    const toastId = toast.loading('Preparing print document...');
    try {
      let billData: PaymentReceiptData | null = null;
      try {
        const res = await billingApi.getPaymentReceiptByInvoice(invoice.id);
        if (res && res.ok && res.data?.data) {
          billData = res.data.data;
        }
      } catch { }

      if (!billData) {
        billData = buildReceiptDataFromInvoice(invoice);
      }

      await printPaymentBill(billData);
      toast.dismiss(toastId);
      setIsOpen(false);
    } catch (error) {
      console.error('Print error:', error);
      toast.error('Print failed. Please try again.', { id: toastId });
    }
  };

  const handleCopyDetails = () => {
    const details = `
Invoice ${invoice.id}
Client: ${invoice.clientName}
Amount: ₹${invoice.amount.toFixed(2)}
Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}
Due: ${new Date(invoice.dueDate).toLocaleDateString()}
Status: ${invoice.status}

Items:
${invoice.lineItems.map(item => `  - ${item.description}: ${item.quantity} x ₹${item.unitPrice.toFixed(2)} = ₹${item.total.toFixed(2)}`).join('\n')}

Total: ₹${invoice.amount.toFixed(2)}
    `.trim();

    navigator.clipboard.writeText(details).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    setIsOpen(false);
  };

  const isVoid = invoice.status?.toLowerCase() === 'void' || (invoice as any).is_active === false;

  const handleDelete = () => {
    if (!onDelete) return;
    setShowConfirmModal(true);
    setIsOpen(false);
  };

  const handleConfirmAction = async () => {
    if (!onDelete) return;
    try {
      setIsDeleting(true);
      await onDelete(invoice.id);
      setShowConfirmModal(false);
    } catch (error) {
      console.error('Error modifying invoice status:', error);
      toast.error('Failed to update invoice status. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="
          p-2 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80
          text-zinc-400 hover:text-white transition-all cursor-pointer
          hover:border-zinc-700 active:scale-95
        "
        title="Share & Export Options"
      >
        <Share2 size={16} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15 }}
            className="
              absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800
              rounded-xl shadow-xl z-50 overflow-hidden backdrop-blur-sm
            "
          >
            <div className="p-1.5 space-y-1">
              <button
                onClick={handleEmailShare}
                className="
                  w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
                  text-zinc-300 hover:bg-zinc-800/60 hover:text-white
                  transition-colors rounded font-mono
                "
              >
                <Mail size={16} className="text-blue-400 shrink-0" />
                <span>Send via Email</span>
              </button>

              <button
                onClick={handlePDFExport}
                className="
                  w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
                  text-zinc-300 hover:bg-zinc-800/60 hover:text-white
                  transition-colors rounded font-mono
                "
              >
                <Download size={16} className="text-neon-cyan shrink-0" />
                <span>Download PDF</span>
              </button>

              <button
                onClick={handlePrint}
                className="
                  w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
                  text-zinc-300 hover:bg-zinc-800/60 hover:text-white
                  transition-colors rounded font-mono
                "
              >
                <Printer size={16} className="text-purple-400 shrink-0" />
                <span>Print Invoice</span>
              </button>

              <button
                onClick={handleCopyDetails}
                className="
                  w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
                  text-zinc-300 hover:bg-zinc-800/60 hover:text-white
                  transition-colors rounded font-mono
                "
              >
                {copied ? (
                  <>
                    <Check size={16} className="text-emerald-400 shrink-0" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={16} className="text-amber-400 shrink-0" />
                    <span>Copy Details</span>
                  </>
                )}
              </button>

              {onDelete && (
                <>
                  <div className="border-t border-zinc-700" />
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className={`
                      w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
                      transition-colors rounded font-mono disabled:opacity-50
                      ${isVoid
                        ? 'text-emerald-400 hover:bg-emerald-900/20 hover:text-emerald-300'
                        : 'text-amber-400 hover:bg-amber-900/20 hover:text-amber-300'}
                    `}
                    title={isVoid ? 'Reactivate Invoice' : 'Void / Deactivate Invoice'}
                  >
                    {isVoid ? (
                      <ShieldCheck size={16} className="shrink-0" />
                    ) : (
                      <ShieldOff size={16} className="shrink-0" />
                    )}
                    <span>
                      {isDeleting
                        ? (isVoid ? 'Reactivating...' : 'Deactivating...')
                        : (isVoid ? 'Reactivate Invoice' : 'Void / Deactivate')}
                    </span>
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={showConfirmModal}
        title={isVoid ? `Reactivate Invoice` : `Void / Deactivate Invoice`}
        message={isVoid
          ? `Reactivate invoice ${invoice.id}?`
          : `Void / deactivate invoice ${invoice.id}? Records and line items will be preserved in history.`}
        confirmText={isVoid ? 'Reactivate' : 'Void Invoice'}
        variant={isVoid ? 'primary' : 'danger'}
        isLoading={isDeleting}
        onConfirm={handleConfirmAction}
        onCancel={() => setShowConfirmModal(false)}
      />
    </div>
  );
}
