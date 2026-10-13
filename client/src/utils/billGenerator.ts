/**
 * TekDoctor — Payment Bill & Invoice PDF Generator
 * Generates high-resolution, professional, printable business bills from verified backend payment data.
 * Fully compliant with Indian GST (CGST/SGST/IGST), SAC codes, and corporate billing standards.
 */

export interface PaymentReceiptLineItem {
  id?: number | string;
  description: string;
  hsnSac?: string;
  sacCode?: string;
  quantity: number;
  unitRate?: number;
  unitPrice: number;
  taxableAmount?: number;
  taxRate?: number;
  taxAmount?: number;
  amount?: number;
  total: number;
}

export interface PaymentReceiptData {
  receiptNumber: string;
  invoiceId?: string | null;
  invoiceStatus?: 'Draft' | 'Final' | 'Paid' | 'Pending' | string;
  isFinal?: boolean;
  ticketId?: number | null;
  ticketNumber?: string | null;
  billDate: string | Date;
  paymentDate: string | Date;
  paymentStatus: 'paid' | 'unpaid' | 'draft' | string;
  paymentId?: string | null;
  orderId?: string | null;
  paymentMethod?: string | null;
  referenceNote?: string | null;
  notes?: string | null;
  clientType: 'individual' | 'company' | string;
  originalEstimate?: number | null;
  originalEstimateLabel?: string;
  estimateDisclaimer?: string;
  customer: {
    name: string;
    contactPerson?: string | null;
    email: string;
    mobile?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    companyName?: string | null;
    companyTaxId?: string | null;
  };
  device?: {
    brand: string;
    modelNumber: string;
    category: string;
    serialNumber?: string | null;
    assetId?: string | null;
    problemDescription?: string | null;
    serviceType?: string | null;
  } | null;
  financials: {
    currency: string;
    currencySymbol: string;
    subtotal: number;
    taxableAmount?: number;
    taxRate?: number;
    taxAmount?: number;
    totalGst?: number;
    isInterstate?: boolean;
    cgstRate?: number;
    cgstAmount?: number;
    sgstRate?: number;
    sgstAmount?: number;
    igstRate?: number;
    igstAmount?: number;
    totalAmount: number;
    amountPaid: number;
    balanceDue: number;
    originalEstimate?: number | null;
    originalEstimateLabel?: string;
    estimateDisclaimer?: string;
    lineItems: PaymentReceiptLineItem[];
  };
  business: {
    name: string;
    tagline?: string;
    logoUrl?: string | null;
    logoBase64?: string | null;
    address: string;
    email: string;
    phone: string;
    gstin?: string;
    website?: string;
  };
}

/**
 * Standard Indian Rupee (INR ₹) currency formatter
 */
export const formatINR = (amount: number | string | undefined | null): string => {
  if (amount === undefined || amount === null || isNaN(Number(amount))) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(amount));
};

/**
 * Helper to dynamically composite transparent logo into crisp high-contrast black for white backgrounds
 */
export const getBlackLogoDataUri = (rawSource: string): Promise<string> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return resolve(rawSource);
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 681;
        canvas.height = img.naturalHeight || 197;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(rawSource);

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(rawSource);
      }
    };
    img.onerror = () => resolve(rawSource);
    img.src = rawSource;
  });
};

/**
 * Generate and download a professional GST PDF payment receipt / invoice.
 */
export async function downloadPaymentBillPdf(bill: PaymentReceiptData): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default;

  const formatDate = (dateStr: string | Date) => {
    if (!dateStr) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? String(dateStr) : d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const curSym = bill.financials.currencySymbol || '₹';
  const totalAmount = Number(bill.financials.totalAmount || bill.financials.amountPaid || 0);
  const totalPaid = Number(bill.financials.amountPaid || totalAmount).toFixed(2);
  const balanceDue = Number(bill.financials.balanceDue || 0).toFixed(2);

  // Centralized GST amounts
  const taxRate = bill.financials.taxRate !== undefined ? Number(bill.financials.taxRate) : 18;
  const taxableAmount = Number(bill.financials.taxableAmount || bill.financials.subtotal || (totalAmount / (1 + taxRate / 100))).toFixed(2);
  const totalTax = Number(bill.financials.taxAmount !== undefined ? bill.financials.taxAmount : (totalAmount - Number(taxableAmount))).toFixed(2);
  const isInterstate = Boolean(bill.financials.isInterstate);

  const cgstRate = bill.financials.cgstRate !== undefined ? bill.financials.cgstRate : (isInterstate ? 0 : taxRate / 2);
  const cgstAmount = Number(bill.financials.cgstAmount !== undefined ? bill.financials.cgstAmount : (isInterstate ? 0 : Number(totalTax) / 2)).toFixed(2);

  const sgstRate = bill.financials.sgstRate !== undefined ? bill.financials.sgstRate : (isInterstate ? 0 : taxRate / 2);
  const sgstAmount = Number(bill.financials.sgstAmount !== undefined ? bill.financials.sgstAmount : (isInterstate ? 0 : Number(totalTax) - Number(cgstAmount))).toFixed(2);

  const igstRate = bill.financials.igstRate !== undefined ? bill.financials.igstRate : (isInterstate ? taxRate : 0);
  const igstAmount = Number(bill.financials.igstAmount !== undefined ? bill.financials.igstAmount : (isInterstate ? totalTax : 0)).toFixed(2);

  const rawResolvedLogoUrl = bill.business?.logoBase64 || (bill.business?.logoUrl
    ? (bill.business.logoUrl.startsWith('http') || bill.business.logoUrl.startsWith('data:')
        ? bill.business.logoUrl
        : `${typeof window !== 'undefined' ? window.location.origin : ''}${bill.business.logoUrl.startsWith('/') ? '' : '/'}${bill.business.logoUrl}`)
    : '/tekdoctor_logo_black.png');

  const logoSrc = await getBlackLogoDataUri(rawResolvedLogoUrl);

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.width = '820px';

  container.innerHTML = generatePaymentBillHtmlContent(bill, logoSrc, curSym, totalAmount, totalPaid, balanceDue, taxRate, taxableAmount, totalTax, isInterstate, cgstRate, cgstAmount, sgstRate, sgstAmount, igstRate, igstAmount, formatDate);

  document.body.appendChild(container);

  const cleanDocName = `TekDoctor_Tax_Invoice_${bill.ticketNumber || bill.invoiceId || bill.receiptNumber || 'Receipt'}.pdf`
    .replace(/[^\w.-]/g, '_');

  const opt: any = {
    margin: [8, 8, 8, 8],
    filename: cleanDocName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };

  const elem = container.firstElementChild as HTMLElement;
  if (!elem) {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
    return;
  }

  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    images.map(
      img =>
        new Promise<void>(resolve => {
          if (img.complete && img.naturalHeight !== 0) {
            resolve();
          } else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        })
    )
  );

  try {
    await (html2pdf() as any).set(opt).from(elem).save();
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

/**
 * Helper to generate the exact HTML template for the receipt/invoice
 */
export function generatePaymentBillHtmlContent(
  bill: PaymentReceiptData,
  logoSrc: string,
  curSym: string,
  totalAmount: number,
  totalPaid: string,
  balanceDue: string,
  taxRate: number,
  taxableAmount: string,
  totalTax: string,
  isInterstate: boolean,
  cgstRate: number,
  cgstAmount: string,
  sgstRate: number,
  sgstAmount: string,
  igstRate: number,
  igstAmount: string,
  formatDate: (d: string | Date) => string
): string {
  return `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #ffffff; color: #0f172a; padding: 36px 40px; border: 1px solid #e2e8f0; border-radius: 6px; box-sizing: border-box; line-height: 1.45; max-width: 780px; width: 100%; margin: 0 auto;">
      
      <!-- Top Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #0284c7; padding-bottom: 20px; margin-bottom: 24px; break-inside: avoid; page-break-inside: avoid;">
        <div style="max-width: 480px;">
          <div style="display: flex; align-items: center; margin-bottom: 6px;">
            <img
              src="${logoSrc}"
              alt="${bill.business?.name || 'TekDoctor'}"
              style="height: 48px; max-height: 48px; max-width: 250px; object-fit: contain; display: block;"
              crossorigin="anonymous"
            />
          </div>
          <p style="margin: 4px 0 0 0; font-size: 11px; font-weight: 700; color: #475569; letter-spacing: 0.5px; text-transform: uppercase;">
            ${bill.business?.tagline || "Your Computer's Personal Care Specialist"}
          </p>
          <div style="font-size: 10.5px; color: #334155; margin-top: 8px; line-height: 1.45;">
            <p style="margin: 0; font-weight: 500;">${bill.business?.address || 'Silicon Valley Hub, Mumbai, Maharashtra, India'}</p>
            <p style="margin: 2px 0 0 0;">Email: <span style="color: #0284c7;">${bill.business?.email || 'support@tekdoctor.in'}</span> | Phone: ${bill.business?.phone || '+91 98765 43210'}</p>
            <p style="margin: 4px 0 0 0; font-size: 11px; font-weight: 800; color: #0f172a;">
              TEKDOCTOR GSTIN: <span style="font-family: monospace; color: #0369a1; background: #e0f2fe; padding: 2px 6px; border-radius: 4px; border: 1px solid #bae6fd;">${bill.business?.gstin || '27AAAAA0000A1Z5'}</span>
            </p>
          </div>
        </div>

        <div style="text-align: right; min-width: 240px;">
          ${(() => {
            const isPaid = bill.paymentStatus === 'paid' || bill.invoiceStatus === 'Paid';
            const isDraft = bill.invoiceStatus === 'Draft' || bill.paymentStatus === 'draft';
            if (isPaid) {
              return `<div style="display: inline-block; padding: 4px 12px; background: #ecfdf5; border: 1.5px solid #10b981; border-radius: 20px; color: #047857; font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px;">✓ PAID & SETTLED</div>`;
            }
            if (isDraft) {
              return `<div style="display: inline-block; padding: 4px 12px; background: #fffbeb; border: 1.5px solid #f59e0b; border-radius: 20px; color: #b45309; font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px;">DRAFT REVIEW (NON-PAYABLE)</div>`;
            }
            return `<div style="display: inline-block; padding: 4px 12px; background: #f0fdf4; border: 1.5px solid #22c55e; border-radius: 20px; color: #15803d; font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px;">COMMERCIAL INVOICE</div>`;
          })()}
          <h1 style="margin: 0; font-size: 22px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px;">
            ${(bill.invoiceStatus === 'Draft' || bill.paymentStatus === 'draft') ? 'DRAFT INVOICE' : 'TAX INVOICE'}
          </h1>
          <p style="margin: 4px 0 0 0; font-size: 11px; font-family: monospace; font-weight: 700; color: #0284c7;">
            Invoice No: ${bill.invoiceId || bill.receiptNumber}
          </p>
          <p style="margin: 2px 0 0 0; font-size: 10.5px; color: #64748b; font-weight: 500;">
            Date of Issue: ${formatDate(bill.billDate)}
          </p>
        </div>
      </div>

      <!-- Bill To & Device/Service Context Grid -->
      <div style="display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 20px; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; margin-bottom: 20px; break-inside: avoid; page-break-inside: avoid;">
        
        <!-- Billed To (Company Client) -->
        <div style="word-break: break-word; overflow-wrap: anywhere; min-width: 0;">
          <div style="font-size: 9.5px; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">
            BILLED TO (${bill.clientType === 'company' ? 'CORPORATE CLIENT' : 'INDIVIDUAL CUSTOMER'})
          </div>
          <div style="font-size: 14px; font-weight: 800; color: #0f172a; line-height: 1.3;">
            ${bill.customer.companyName || bill.customer.name}
          </div>
          ${bill.customer.contactPerson ? `<div style="font-size: 11px; color: #334155; margin-top: 2px;">Attn: <strong>${bill.customer.contactPerson}</strong></div>` : ''}
          <div style="font-size: 11px; color: #475569; margin-top: 3px;">Email: ${bill.customer.email}</div>
          ${bill.customer.mobile && bill.customer.mobile !== 'N/A' ? `<div style="font-size: 11px; color: #475569;">Contact: ${bill.customer.mobile}</div>` : ''}
          ${bill.customer.address ? `<div style="font-size: 10.5px; color: #475569; margin-top: 4px; line-height: 1.4;">${bill.customer.address}${bill.customer.city ? `, ${bill.customer.city}` : ''}${bill.customer.state ? `, ${bill.customer.state}` : ''} ${bill.customer.zipCode || ''}</div>` : ''}
          
          <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #cbd5e1; font-size: 11px;">
            ${bill.customer.companyTaxId ? `
              <span style="font-weight: 700; color: #0f172a;">CLIENT GSTIN:</span>
              <span style="font-family: monospace; font-weight: 800; color: #0284c7; background: #e0f2fe; padding: 2px 6px; border-radius: 4px; border: 1px solid #bae6fd; margin-left: 4px;">
                ${bill.customer.companyTaxId}
              </span>
            ` : `
              <span style="font-weight: 600; color: #64748b; font-style: italic;">GSTIN: Unregistered / Consumer Business</span>
            `}
          </div>
        </div>

        <!-- Service & Device Record -->
        <div style="word-break: break-word; overflow-wrap: anywhere; min-width: 0; border-left: 1.5px solid #e2e8f0; padding-left: 18px;">
          <div style="font-size: 9.5px; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">
            DEVICE & SERVICE DETAILS
          </div>
          ${bill.ticketNumber ? `
            <div style="font-size: 12.5px; font-weight: 800; color: #0f172a; margin-bottom: 3px;">
              Repair Ticket: <span style="font-family: monospace; color: #0284c7;">${bill.ticketNumber}</span>
            </div>
          ` : ''}
          ${bill.device ? `
            <div style="font-size: 11.5px; font-weight: 700; color: #1e293b;">
              ${bill.device.brand} ${bill.device.modelNumber} (${bill.device.category})
            </div>
            ${bill.device.serialNumber && bill.device.serialNumber !== 'N/A' ? `
              <div style="font-size: 10.5px; color: #475569; margin-top: 2px;">
                Serial No: <span style="font-family: monospace; font-weight: 600; color: #0f172a;">${bill.device.serialNumber}</span>
              </div>
            ` : ''}
            ${bill.device.assetId ? `
              <div style="font-size: 10.5px; color: #475569;">
                Asset ID: <span style="font-family: monospace; font-weight: 600; color: #0f172a;">${bill.device.assetId}</span>
              </div>
            ` : ''}
            <div style="font-size: 10.5px; color: #475569; margin-top: 2px;">
              Service Scope: <strong>${bill.device.serviceType || 'Diagnostics & Repair'}</strong>
            </div>
          ` : `
            <div style="font-size: 11px; color: #475569; margin-top: 4px;">
              Corporate IT Support & Hardware Maintenance Contract
            </div>
          `}
        </div>

      </div>

      <!-- Line Items Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; table-layout: fixed;">
        <thead>
          <tr style="background: #0f172a; color: #ffffff; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; break-inside: avoid; page-break-inside: avoid;">
            <th style="padding: 10px 10px; text-align: left; border-top-left-radius: 5px; border-bottom-left-radius: 5px; width: 32px;">#</th>
            <th style="padding: 10px 10px; text-align: left;">Description</th>
            <th style="padding: 10px 8px; text-align: center; width: 75px;">HSN/SAC</th>
            <th style="padding: 10px 8px; text-align: center; width: 45px;">Qty</th>
            <th style="padding: 10px 10px; text-align: right; width: 95px;">Unit Rate</th>
            <th style="padding: 10px 10px; text-align: right; width: 105px;">Amount</th>
            <th style="padding: 10px 10px; text-align: center; border-top-right-radius: 5px; border-bottom-right-radius: 5px; width: 75px;">Tax Rate</th>
          </tr>
        </thead>
        <tbody>
          ${bill.financials.lineItems.map((item, idx) => {
            const unitRate = item.unitRate !== undefined ? Number(item.unitRate) : Number(item.unitPrice || 0);
            const lineAmt = item.amount !== undefined ? Number(item.amount) : Number(item.total || (item.quantity * unitRate));
            const itemTaxRate = item.taxRate !== undefined ? Number(item.taxRate) : 18;
            return `
              <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11.5px; color: #334155; break-inside: avoid; page-break-inside: avoid;">
                <td style="padding: 10px 10px; color: #94a3b8; font-weight: 600;">${idx + 1}</td>
                <td style="padding: 10px 10px; font-weight: 600; color: #0f172a; word-break: break-word; overflow-wrap: anywhere;">
                  ${item.description}
                </td>
                <td style="padding: 10px 8px; text-align: center; font-family: monospace; font-size: 10.5px; color: #64748b;">
                  ${item.hsnSac || item.sacCode || '9987'}
                </td>
                <td style="padding: 10px 8px; text-align: center; font-weight: 600;">${item.quantity || 1}</td>
                <td style="padding: 10px 10px; text-align: right; font-family: monospace;">${curSym}${unitRate.toFixed(2)}</td>
                <td style="padding: 10px 10px; text-align: right; font-weight: 700; font-family: monospace; color: #0f172a;">${curSym}${lineAmt.toFixed(2)}</td>
                <td style="padding: 10px 10px; text-align: center; font-weight: 600; color: #0284c7; font-family: monospace;">${itemTaxRate}%</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <!-- Payment Summary & GST Breakdown Grid -->
      <div style="display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; align-items: start; margin-bottom: 24px; break-inside: avoid; page-break-inside: avoid;">
        
        <!-- Commercially Relevant Payment Information Box -->
        <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 16px; font-size: 11px; word-break: break-word; overflow-wrap: anywhere;">
          <div style="font-weight: 800; font-size: 10.5px; color: #0f172a; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; gap: 5px;">
            <span style="color: #0284c7; font-size: 13px;">●</span> Payment Information
          </div>
          <div style="color: #334155; line-height: 1.6;">
            ${(() => {
              const isPaid = bill.paymentStatus === 'paid' || bill.invoiceStatus === 'Paid';
              const isDraft = bill.invoiceStatus === 'Draft' || bill.paymentStatus === 'draft';
              if (isPaid) {
                return `
                  <div>Payment Status: <strong style="color: #047857; text-transform: uppercase;">Paid & Settled</strong></div>
                  <div>Payment Mode: <strong>${bill.paymentMethod || 'Online Transfer'}</strong></div>
                  ${bill.paymentId ? `<div style="word-break: break-all;">Transaction Reference: <span style="font-family: monospace; font-weight: 700; color: #0f172a;">${bill.paymentId}</span></div>` : ''}
                  <div>Settlement Date: <strong>${formatDate(bill.paymentDate)}</strong></div>
                  ${(bill.referenceNote || bill.orderId) ? `<div style="word-break: break-all;">Reference / UTR: <span style="font-family: monospace; color: #475569;">${bill.referenceNote || bill.orderId}</span></div>` : ''}
                `;
              }
              if (isDraft) {
                return `
                  <div>Payment Status: <strong style="color: #b45309; text-transform: uppercase;">Draft Review (Pending Finalization)</strong></div>
                  <div>Invoice Date: <strong>${formatDate(bill.billDate)}</strong></div>
                  <div>Note: <em>This draft invoice is under review and will become payable once finalized by Admin.</em></div>
                `;
              }
              return `
                <div>Payment Status: <strong style="color: #d97706; text-transform: uppercase;">Awaiting Settlement</strong></div>
                <div>Invoice Date: <strong>${formatDate(bill.billDate)}</strong></div>
                <div>Due Date: <strong>${formatDate(bill.billDate)}</strong></div>
              `;
            })()}
          </div>
        </div>

        <!-- GST Summary Box -->
        <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 16px; font-size: 11px;">
          
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #475569;">
            <span>Subtotal:</span>
            <span style="font-family: monospace; font-weight: 700; color: #0f172a;">${curSym}${taxableAmount}</span>
          </div>

          ${isInterstate ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; color: #475569;">
              <span>CGST (Intra-State):</span>
              <span style="font-family: monospace; color: #94a3b8;">${curSym}0.00</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; color: #475569;">
              <span>SGST (Intra-State):</span>
              <span style="font-family: monospace; color: #94a3b8;">${curSym}0.00</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #475569;">
              <span>IGST (${igstRate}%):</span>
              <span style="font-family: monospace; font-weight: 600; color: #0f172a;">${curSym}${igstAmount}</span>
            </div>
          ` : `
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; color: #475569;">
              <span>CGST (${cgstRate}%):</span>
              <span style="font-family: monospace; font-weight: 600; color: #0f172a;">${curSym}${cgstAmount}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; color: #475569;">
              <span>SGST (${sgstRate}%):</span>
              <span style="font-family: monospace; font-weight: 600; color: #0f172a;">${curSym}${sgstAmount}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #475569;">
              <span>IGST (Inter-State):</span>
              <span style="font-family: monospace; color: #94a3b8;">${curSym}0.00</span>
            </div>
          `}

          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed #cbd5e1; color: #0284c7; font-weight: 700;">
            <span>Total GST (${taxRate}%):</span>
            <span style="font-family: monospace;">${curSym}${totalTax}</span>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 14.5px; font-weight: 900; color: #0f172a; margin-top: 4px;">
            <span>Grand Total:</span>
            <span style="font-family: monospace; color: #0284c7;">${curSym}${totalAmount.toFixed(2)}</span>
          </div>

          <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px; font-weight: 700; color: #059669;">
            <span>Amount Paid:</span>
            <span style="font-family: monospace;">${curSym}${totalPaid}</span>
          </div>

          <div style="display: flex; justify-content: space-between; margin-top: 2px; font-size: 10px; font-weight: 700; color: #64748b;">
            <span>Balance Due:</span>
            <span style="font-family: monospace; color: #059669;">${curSym}${balanceDue}</span>
          </div>
        </div>

      </div>

      <!-- Professional Clean Footer -->
      <div style="border-top: 1.5px solid #e2e8f0; padding-top: 14px; font-size: 9.5px; color: #64748b; line-height: 1.5; text-align: center; break-inside: avoid; page-break-inside: avoid;">
        <p style="margin: 0; font-weight: 700; color: #334155;">
          Thank you for choosing ${bill.business?.name || 'TekDoctor'} for your technology maintenance and repair operations.
        </p>
        <p style="margin: 3px 0 0 0;">
          This is an electronically generated commercial tax invoice.
        </p>
      </div>

    </div>
  `;
}

/**
 * Generate the canonical bill HTML for in-app preview or embedding
 */
export async function generatePaymentBillHtml(bill: PaymentReceiptData): Promise<string> {
  const formatDate = (dateStr: string | Date) => {
    if (!dateStr) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? String(dateStr) : d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const curSym = bill.financials?.currencySymbol || '₹';
  const totalAmount = Number(bill.financials?.totalAmount || bill.financials?.amountPaid || 0);
  const totalPaid = Number(bill.financials?.amountPaid || totalAmount).toFixed(2);
  const balanceDue = Number(bill.financials?.balanceDue || 0).toFixed(2);

  const taxRate = bill.financials?.taxRate !== undefined ? Number(bill.financials.taxRate) : 18;
  const taxableAmount = Number(bill.financials?.taxableAmount || bill.financials?.subtotal || (totalAmount / (1 + taxRate / 100))).toFixed(2);
  const totalTax = Number(bill.financials?.taxAmount !== undefined ? bill.financials.taxAmount : (totalAmount - Number(taxableAmount))).toFixed(2);
  const isInterstate = Boolean(bill.financials?.isInterstate);

  const cgstRate = bill.financials?.cgstRate !== undefined ? bill.financials.cgstRate : (isInterstate ? 0 : taxRate / 2);
  const cgstAmount = Number(bill.financials?.cgstAmount !== undefined ? bill.financials.cgstAmount : (isInterstate ? 0 : Number(totalTax) / 2)).toFixed(2);

  const sgstRate = bill.financials?.sgstRate !== undefined ? bill.financials.sgstRate : (isInterstate ? 0 : taxRate / 2);
  const sgstAmount = Number(bill.financials?.sgstAmount !== undefined ? bill.financials.sgstAmount : (isInterstate ? 0 : Number(totalTax) - Number(cgstAmount))).toFixed(2);

  const igstRate = bill.financials?.igstRate !== undefined ? bill.financials.igstRate : (isInterstate ? taxRate : 0);
  const igstAmount = Number(bill.financials?.igstAmount !== undefined ? bill.financials.igstAmount : (isInterstate ? totalTax : 0)).toFixed(2);

  const rawResolvedLogoUrl = bill.business?.logoBase64 || (bill.business?.logoUrl
    ? (bill.business.logoUrl.startsWith('http') || bill.business.logoUrl.startsWith('data:')
        ? bill.business.logoUrl
        : `${typeof window !== 'undefined' ? window.location.origin : ''}${bill.business.logoUrl.startsWith('/') ? '' : '/'}${bill.business.logoUrl}`)
    : '/tekdoctor_logo_black.png');

  let logoSrc: string;
  try {
    logoSrc = await getBlackLogoDataUri(rawResolvedLogoUrl);
  } catch {
    logoSrc = rawResolvedLogoUrl;
  }

  return generatePaymentBillHtmlContent(
    bill, logoSrc, curSym, totalAmount, totalPaid, balanceDue,
    taxRate, taxableAmount, totalTax, isInterstate,
    cgstRate, cgstAmount, sgstRate, sgstAmount, igstRate, igstAmount, formatDate
  );
}

/**
 * Print a professional GST payment receipt / invoice directly.
 */
export async function printPaymentBill(bill: PaymentReceiptData): Promise<void> {
  const formatDate = (dateStr: string | Date) => {
    if (!dateStr) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? String(dateStr) : d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const curSym = bill.financials?.currencySymbol || '₹';
  const totalAmount = Number(bill.financials?.totalAmount || bill.financials?.amountPaid || 0);
  const totalPaid = Number(bill.financials?.amountPaid || totalAmount).toFixed(2);
  const balanceDue = Number(bill.financials?.balanceDue || 0).toFixed(2);

  const taxRate = bill.financials?.taxRate !== undefined ? Number(bill.financials.taxRate) : 18;
  const taxableAmount = Number(bill.financials?.taxableAmount || bill.financials?.subtotal || (totalAmount / (1 + taxRate / 100))).toFixed(2);
  const totalTax = Number(bill.financials?.taxAmount !== undefined ? bill.financials.taxAmount : (totalAmount - Number(taxableAmount))).toFixed(2);
  const isInterstate = Boolean(bill.financials?.isInterstate);

  const cgstRate = bill.financials?.cgstRate !== undefined ? bill.financials.cgstRate : (isInterstate ? 0 : taxRate / 2);
  const cgstAmount = Number(bill.financials?.cgstAmount !== undefined ? bill.financials.cgstAmount : (isInterstate ? 0 : Number(totalTax) / 2)).toFixed(2);

  const sgstRate = bill.financials?.sgstRate !== undefined ? bill.financials.sgstRate : (isInterstate ? 0 : taxRate / 2);
  const sgstAmount = Number(bill.financials?.sgstAmount !== undefined ? bill.financials.sgstAmount : (isInterstate ? 0 : Number(totalTax) - Number(cgstAmount))).toFixed(2);

  const igstRate = bill.financials?.igstRate !== undefined ? bill.financials.igstRate : (isInterstate ? taxRate : 0);
  const igstAmount = Number(bill.financials?.igstAmount !== undefined ? bill.financials.igstAmount : (isInterstate ? totalTax : 0)).toFixed(2);

  const rawResolvedLogoUrl = bill.business?.logoBase64 || (bill.business?.logoUrl
    ? (bill.business.logoUrl.startsWith('http') || bill.business.logoUrl.startsWith('data:')
        ? bill.business.logoUrl
        : `${typeof window !== 'undefined' ? window.location.origin : ''}${bill.business.logoUrl.startsWith('/') ? '' : '/'}${bill.business.logoUrl}`)
    : '/tekdoctor_logo_black.png');

  const logoSrc = await getBlackLogoDataUri(rawResolvedLogoUrl);

  const html = generatePaymentBillHtmlContent(
    bill, logoSrc, curSym, totalAmount, totalPaid, balanceDue,
    taxRate, taxableAmount, totalTax, isInterstate,
    cgstRate, cgstAmount, sgstRate, sgstAmount, igstRate, igstAmount, formatDate
  );

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    if (document.body.contains(iframe)) document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Invoice - ${bill.invoiceId || bill.receiptNumber || bill.ticketNumber || 'TekDoctor'}</title>
        <style>
          @page { size: A4 portrait; margin: 8mm; }
          *, *::before, *::after {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        </style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `);
  doc.close();

  // Wait for images in the iframe document to finish loading before invoking print
  const images = Array.from(doc.images || []);
  if (images.length > 0) {
    await Promise.all(
      images.map(img => {
        if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
        return new Promise<void>(resolve => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, 800);
        });
      })
    );
  }

  // Allow layout paint before triggering print dialog
  await new Promise(resolve => setTimeout(resolve, 250));

  try {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  } catch (e) {
    console.error('Printing failed:', e);
  } finally {
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 2000);
  }
}
