'use client';

import { useState, useRef } from 'react';
import { Share2, Mail, Download, Printer, Copy, Check, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useSiteContext } from '../../../context/SiteContext';
import { appConfig } from '../../../config/appConfig';

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
  lastUpdatedAt: string;
}

interface InvoiceShareMenuProps {
  invoice: Invoice;
  onDelete?: (invoiceId: string) => Promise<void>;
}

export default function InvoiceShareMenu({ invoice, onDelete }: InvoiceShareMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { flattenedSettings } = useSiteContext();

  const handleEmailShare = () => {
    const subject = `Invoice ${invoice.id} - ${invoice.clientName}`;
    const body = `
Invoice Details:
ID: ${invoice.id}
Client: ${invoice.clientName}
Amount: $${invoice.amount.toFixed(2)}
Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}
Due: ${new Date(invoice.dueDate).toLocaleDateString()}
Status: ${invoice.status}

Items:
${invoice.lineItems
        .map(
          item =>
            `- ${item.description}: ${item.quantity} x $${item.unitPrice.toFixed(
              2
            )} = $${item.total.toFixed(2)}`
        )
        .join('\n')}

Total: $${invoice.amount.toFixed(2)}

Notes: ${invoice.notes || 'N/A'}
    `.trim();

    const mailtoLink = `mailto:?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoLink;
    setIsOpen(false);
  };

  const handlePDFExport = async () => {
    try {
      // Dynamic import to avoid server-side issues
      const html2pdf = (await import('html2pdf.js')).default;
      const themeColor = flattenedSettings.theme_primary_color || flattenedSettings.primary_color || '#00f2ff';

      const element = document.createElement('div');
      element.innerHTML = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; background: #ffffff; color: #1a1a1a; max-width: 800px; margin: 0 auto; border: 1px solid #e5e5e5; border-radius: 8px;">
          
          <!-- Header Section with Logo and Company info -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${themeColor}; padding-bottom: 25px; margin-bottom: 35px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <span style="background: ${themeColor}; color: #050505; width: 34px; height: 34px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 18px; font-family: sans-serif;">${(flattenedSettings.company_name || 'TD').substring(0, 2).toUpperCase()}</span>
                <h1 style="font-size: 28px; font-weight: 900; color: #000; margin: 0; text-transform: uppercase; letter-spacing: -1px;">${flattenedSettings.company_name || 'TEKDOCTOR'}</h1>
              </div>
              <p style="font-size: 11px; font-weight: bold; color: #71717a; text-transform: uppercase; margin: 0; letter-spacing: 2px;">Your Computer's Personal Care Specialist</p>
              <div style="font-size: 11px; color: #52525b; margin-top: 12px; line-height: 1.5;">
                <p style="margin: 0;">${flattenedSettings.company_name || 'TekDoctor'} ESD Safe Facilities</p>
                <p style="margin: 0;">${flattenedSettings.company_address || 'Silicon Valley Hub, CA'}</p>
                <p style="margin: 0;">${flattenedSettings.company_email || 'tech-support@tekdoctor.com'}</p>
              </div>
            </div>

            <div style="text-align: right;">
              <h2 style="font-size: 32px; font-weight: 900; color: ${themeColor}; margin: 0; text-transform: uppercase; letter-spacing: 1px;">INVOICE</h2>
              <p style="font-size: 13px; color: #3f3f46; margin: 5px 0 0 0;"><strong>Invoice ID:</strong> <span style="font-family: monospace; color: #111;">${invoice.id}</span></p>
              <p style="font-size: 13px; color: #3f3f46; margin: 3px 0 0 0;"><strong>Invoice Date:</strong> ${new Date(invoice.invoiceDate).toLocaleDateString()}</p>
              <p style="font-size: 13px; color: #3f3f46; margin: 3px 0 0 0;"><strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString()}</p>
            </div>
          </div>

          <!-- Billed To & Summary Info Grid -->
          <div style="display: flex; justify-content: space-between; gap: 30px; margin-bottom: 40px; background: #fafafa; border: 1px solid #f4f4f5; border-radius: 8px; padding: 20px;">
            <div>
              <h3 style="font-size: 11px; font-weight: bold; color: #71717a; text-transform: uppercase; margin: 0 0 8px 0; letter-spacing: 1.5px;">BILLED TO:</h3>
              <p style="font-size: 15px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0;">${invoice.clientName}</p>
              <p style="font-size: 12px; color: #64748b; margin: 0;">Enterprise Partner Client Account</p>
            </div>
            <div style="text-align: right;">
              <h3 style="font-size: 11px; font-weight: bold; color: #71717a; text-transform: uppercase; margin: 0 0 8px 0; letter-spacing: 1.5px;">PAYMENT SUMMARY:</h3>
              <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0;">Payment Status: <strong style="color: ${themeColor}; font-weight: bold;">${invoice.status}</strong></p>
              <p style="font-size: 12px; color: #64748b; margin: 0;">Currency Code: <span style="font-weight: 600; color: #1e293b;">${invoice.currency}</span></p>
            </div>
          </div>

          <!-- Table Items -->
          <div style="margin-bottom: 35px;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                  <th style="text-align: left; padding: 12px 14px; font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 1px;">Line Item Description</th>
                  <th style="text-align: center; padding: 12px 14px; font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 1px; width: 80px;">Qty</th>
                  <th style="text-align: right; padding: 12px 14px; font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 1px; width: 120px;">Unit Price</th>
                  <th style="text-align: right; padding: 12px 14px; font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 1px; width: 120px;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${invoice.lineItems && invoice.lineItems
          .map(
            item => `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 14px; font-size: 13px; font-weight: bold; color: #1e293b; line-height: 1.4;">${item.description}</td>
                    <td style="padding: 14px; text-align: center; font-size: 13px; color: #334155; font-family: monospace;">${item.quantity}</td>
                    <td style="padding: 14px; text-align: right; font-size: 13px; color: #334155; font-family: monospace;">$${item.unitPrice.toFixed(2)}</td>
                    <td style="padding: 14px; text-align: right; font-size: 13px; font-weight: bold; color: #0f172a; font-family: monospace;">$${item.total.toFixed(2)}</td>
                  </tr>
                `
          )
          .join('')}
              </tbody>
            </table>
          </div>

          <!-- Totals and Notes summary -->
          <div style="display: flex; justify-content: space-between; gap: 40px; border-top: 2px solid #f1f5f9; padding-top: 25px;">
            <div style="flex: 1;">
              ${invoice.notes ? `
                <h4 style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; margin: 0 0 6px 0; letter-spacing: 1px;">NOTES & PAYMENT INSTRUCTIONS</h4>
                <p style="font-size: 12px; color: #334155; margin: 0; line-height: 1.5; font-style: italic;">${invoice.notes}</p>
              ` : ''}
            </div>

            <div style="width: 280px; text-align: right;">
              <div style="display: flex; justify-content: space-between; padding-bottom: 8px;">
                <span style="font-size: 13px; color: #64748b; font-weight: 600;">Total Balance Due:</span>
                <span style="font-size: 24px; font-weight: 900; color: ${themeColor}; font-family: monospace; letter-spacing: -1px;">$${invoice.amount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <!-- Bottom / Footer -->
          <div style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center;">
            <p style="font-size: 11px; color: #94a3b8; font-weight: 500; margin: 0 0 4px 0; letter-spacing: 0.5px;">Thank you for your business! For any technical questions, contact ${flattenedSettings.company_email || 'support@tekdoctor.com'}</p>
            <p style="font-size: 10px; color: #cbd5e1; font-weight: bold; margin: 0; text-transform: uppercase; letter-spacing: 1px;">OFFICIAL INVOICE ISSUED BY ${(flattenedSettings.company_name || 'TEKDOCTOR').toUpperCase()} BILLING SERVICES</p>
          </div>

        </div>
      `;

      const options = {
        margin: 10,
        filename: `invoice-${invoice.id}.pdf`,
        image: { type: 'png' as const, quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait' as const, unit: 'mm' as const, format: 'a4' as const },
      };

      html2pdf().set(options).from(element).save();
      setIsOpen(false);
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF. Please try again.');
    }
  };

  const handlePrint = () => {
    const themeColor = flattenedSettings.theme_primary_color || flattenedSettings.primary_color || '#00f2ff';
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Invoice ${invoice.id}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { color: ${themeColor}; border-bottom: 2px solid ${themeColor}; padding-bottom: 10px; }
              h3 { color: ${themeColor}; margin-top: 20px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ccc; }
              th { color: ${themeColor}; font-weight: bold; }
              tr.total { border-top: 2px solid ${themeColor}; background: #f5f5f5; }
              tr.total td { font-weight: bold; }
              .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <h1>INVOICE</h1>
            
            <div class="grid">
              <div>
                <p><strong>Invoice ID:</strong> ${invoice.id}</p>
                <p><strong>Date:</strong> ${new Date(invoice.invoiceDate).toLocaleDateString()}</p>
                <p><strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString()}</p>
              </div>
              <div>
                <p><strong>Client:</strong> ${invoice.clientName}</p>
                <p><strong>Status:</strong> ${invoice.status}</p>
                <p><strong>Currency:</strong> ${invoice.currency}</p>
              </div>
            </div>

            <h3>Line Items</h3>
            <table>
              <tr>
                <th>Description</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Unit Price</th>
                <th style="text-align: right;">Total</th>
              </tr>
              ${invoice.lineItems
          .map(
            item => `
                <tr>
                  <td>${item.description}</td>
                  <td style="text-align: center;">${item.quantity}</td>
                  <td style="text-align: right;">$${item.unitPrice.toFixed(2)}</td>
                  <td style="text-align: right;"><strong>$${item.total.toFixed(2)}</strong></td>
                </tr>
              `
          )
          .join('')}
              <tr class="total">
                <td colspan="3" style="text-align: right;">TOTAL:</td>
                <td style="text-align: right; color: ${themeColor}; font-size: 16px;">$${invoice.amount.toFixed(2)}</td>
              </tr>
            </table>

            ${invoice.notes ? `<p><strong>Notes:</strong> ${invoice.notes}</p>` : ''}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
    setIsOpen(false);
  };

  const handleCopyDetails = () => {
    const details = `
Invoice ${invoice.id}
Client: ${invoice.clientName}
Amount: $${invoice.amount.toFixed(2)}
Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}
Due: ${new Date(invoice.dueDate).toLocaleDateString()}
Status: ${invoice.status}

Items:
${invoice.lineItems.map(item => `  - ${item.description}: ${item.quantity} x $${item.unitPrice.toFixed(2)} = $${item.total.toFixed(2)}`).join('\n')}

Total: $${invoice.amount.toFixed(2)}
    `.trim();

    navigator.clipboard.writeText(details).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    setIsOpen(false);
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    if (!confirm(`Are you sure you want to delete invoice ${invoice.id}? This action cannot be undone.`)) {
      return;
    }

    try {
      setIsDeleting(true);
      await onDelete(invoice.id);
      setIsOpen(false);
    } catch (error) {
      console.error('Error deleting invoice:', error);
      toast.error('Failed to delete invoice. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Share invoice"
        className="
          text-zinc-400 hover:text-neon-cyan transition-colors
          p-2 hover:bg-zinc-800/50 rounded
        "
      >
        <Share2 size={16} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="
              absolute right-0 mt-2 w-56 bg-zinc-900 border border-neon-cyan/50
              rounded-lg shadow-lg z-50 overflow-hidden select-none
            "
          >
            <div className="p-2 space-y-1">
              <button
                onClick={handleEmailShare}
                className="
                  w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
                  text-zinc-300 hover:bg-zinc-800 hover:text-neon-cyan
                  transition-colors rounded font-mono
                "
              >
                <Mail size={16} className="shrink-0" />
                <span>Share via Email</span>
              </button>

              <button
                onClick={handlePDFExport}
                className="
                  w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
                  text-zinc-300 hover:bg-zinc-800 hover:text-neon-cyan
                  transition-colors rounded font-mono
                "
              >
                <Download size={16} className="shrink-0" />
                <span>Export as PDF</span>
              </button>

              <button
                onClick={handlePrint}
                className="
                  w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
                  text-zinc-300 hover:bg-zinc-800 hover:text-neon-cyan
                  transition-colors rounded font-mono
                "
              >
                <Printer size={16} className="shrink-0" />
                <span>Print Invoice</span>
              </button>

              <button
                onClick={handleCopyDetails}
                className="
                  w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
                  text-zinc-300 hover:bg-zinc-800 hover:text-neon-cyan
                  transition-colors rounded font-mono
                "
              >
                {copied ? (
                  <>
                    <Check size={16} className="shrink-0 text-green-400" />
                    <span className="text-green-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={16} className="shrink-0" />
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
                    className="
                      w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
                      text-red-400 hover:bg-red-900/20 hover:text-red-300
                      transition-colors rounded font-mono disabled:opacity-50
                    "
                  >
                    <Trash2 size={16} className="shrink-0" />
                    <span>{isDeleting ? 'Deleting...' : 'Delete Invoice'}</span>
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
