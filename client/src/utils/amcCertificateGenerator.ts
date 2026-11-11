/**
 * TekDoctor — AMC Contract Certificate & Compliance PDF Generator
 * Generates official, high-resolution, printable compliance certificates for
 * Annual Maintenance Contracts (AMC) based on authoritative backend contract records.
 */

import { generateQrCodeSvg } from './qrCode';
import { appConfig } from '@/config/appConfig';
import { getBlackLogoDataUri } from './billGenerator';

/**
 * Returns the public application base URL for generating verification URLs and QR codes.
 * In production builds:
 *   Strictly uses appConfig.frontendUrl (configured via VITE_FRONTEND_URL).
 *   Never falls back to API URLs, preventing API routing confusion in decoupled architectures.
 * In development builds:
 *   Uses appConfig.frontendUrl if set; otherwise falls back to window.location.origin.
 */
export const getPublicAppBaseUrl = (): string => {
  if (appConfig.frontendUrl) {
    return appConfig.frontendUrl.replace(/\/+$/, '');
  }
  if (appConfig.isProduction) {
    return 'https://thetekdoctor.com';
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return 'https://thetekdoctor.com';
};

/**
 * Constructs the canonical public verification URL for a given certificate.
 */
export const getCertificateVerificationUrl = (verificationCode: string, contractNumber?: string): string => {
  const base = getPublicAppBaseUrl();
  const query = contractNumber ? `?contractNumber=${encodeURIComponent(contractNumber)}` : '';
  return `${base}/verify-certificate/${encodeURIComponent(verificationCode)}${query}`;
};

export interface AmcCertificateDevice {
  id: number;
  amcTag: string;
  brand: string;
  modelNumber: string;
  serialNumber: string;
  assetId?: string | null;
  deviceCategory?: string | null;
  status: string;
  coverageStartDate: string;
  coverageEndDate: string;
}

export interface AmcCertificateData {
  certificateNumber: string;
  verificationCode: string;
  issuedAt: string;
  isVerified: boolean;
  complianceStatus: 'ACTIVE_COMPLIANT' | 'EXPIRED' | string;
  contract: {
    id: number;
    contractNumber: string;
    planName: string;
    contractType: string;
    isRenewal: boolean;
    previousContractId?: number | null;
    status: string;
    approvalStatus: string;
    paymentStatus: string;
    startDate: string;
    endDate: string;
    deviceCapacity: number;
    activeCoveredCount: number;
    totalAmount: number | string;
    currency: string;
    invoiceId?: string | null;
    termsAndConditions?: string | null;
  };
  company: {
    id: number;
    code: string;
    name: string;
    email: string;
    phone?: string | null;
    address?: string | null;
    gstin?: string | null;
  };
  coveredDevices: AmcCertificateDevice[];
  sla: {
    slaTurnaroundHours: number;
    priorityLevel: string;
    quarterlyAudit: boolean;
    laborDiscountPct: number;
    partsDiscountPct: number;
  };
  issuer: {
    name: string;
    email: string;
    phone: string;
    address: string;
    gstin: string;
  };
}

/**
 * Format date nicely for official certificate display (e.g. 15 Oct 2026)
 */
const formatDate = (dateStr?: string | null): string => {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
};

/**
 * Generates the HTML layout for the AMC Certificate.
 */
export function generateAmcCertificateHtml(cert: AmcCertificateData, logoSrc: string = '/tekdoctor_logo_black.png'): string {
  const isCompliant = cert.isVerified && cert.contract.status === 'active';
  const statusBadgeBg = isCompliant ? '#ecfdf5' : '#fef2f2';
  const statusBadgeBorder = isCompliant ? '#10b981' : '#ef4444';
  const statusBadgeColor = isCompliant ? '#047857' : '#b91c1c';
  const statusText = isCompliant ? 'ACTIVE & COMPLIANT' : (cert.contract.status === 'expired' ? 'EXPIRED' : cert.contract.status.toUpperCase());

  const curSym = cert.contract.currency === 'INR' || !cert.contract.currency ? '₹' : cert.contract.currency;
  const totalAmount = Number(cert.contract.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const sla = cert.sla || {
    slaTurnaroundHours: 24,
    priorityLevel: 'Enterprise Priority',
    quarterlyAudit: true,
    laborDiscountPct: 100,
    partsDiscountPct: 15
  };

  const verifyUrl = getCertificateVerificationUrl(cert.verificationCode, cert.contract.contractNumber);
  const qrSvg = generateQrCodeSvg(verifyUrl, 108, 'M');

  const devicesRows = cert.coveredDevices.length > 0 ? cert.coveredDevices.map((dev, idx) => `
    <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10px;">
      <td style="padding: 6px 8px; text-align: center; color: #64748b; font-weight: 600;">${idx + 1}</td>
      <td style="padding: 6px 8px; font-weight: 700; color: #0f172a;">${dev.brand} ${dev.modelNumber}</td>
      <td style="padding: 6px 8px; font-family: monospace; color: #334155;">${dev.serialNumber || 'N/A'}</td>
      <td style="padding: 6px 8px; color: #475569;">${dev.assetId || '—'}</td>
      <td style="padding: 6px 8px; font-family: monospace; font-weight: 700; color: #0284c7;">${dev.amcTag}</td>
      <td style="padding: 6px 8px; color: #475569;">${formatDate(dev.coverageStartDate)} to ${formatDate(dev.coverageEndDate)}</td>
      <td style="padding: 6px 8px; text-align: center;">
        <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 8.5px; font-weight: 700; text-transform: uppercase; background: ${dev.status === 'active' ? '#dcfce7' : '#f1f5f9'}; color: ${dev.status === 'active' ? '#15803d' : '#64748b'};">
          ${dev.status}
        </span>
      </td>
    </tr>
  `).join('') : `
    <tr>
      <td colspan="7" style="padding: 16px; text-align: center; color: #94a3b8; font-size: 11px; font-style: italic;">
        No individual devices currently bound under this certificate schedule.
      </td>
    </tr>
  `;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #0f172a; background: #ffffff; width: 100%; max-width: 800px; margin: 0 auto; padding: 32px 36px; box-sizing: border-box; line-height: 1.4; border: 1.5px solid #e2e8f0; border-radius: 10px; position: relative; overflow: hidden;">
      
      <!-- Top Decorative Band -->
      <div style="position: absolute; top: 0; left: 0; right: 0; height: 6px; background: linear-gradient(90deg, #0284c7 0%, #00e5ff 50%, #0284c7 100%);"></div>

      <!-- Watermark for expired or non-active contracts -->
      ${!isCompliant ? `
        <div style="position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 80px; font-weight: 900; color: rgba(239, 68, 68, 0.08); text-transform: uppercase; letter-spacing: 8px; pointer-events: none; z-index: 0; white-space: nowrap;">
          ${statusText}
        </div>
      ` : ''}

      <!-- Header Section -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 18px; margin-bottom: 20px; position: relative; z-index: 1;">
        <div>
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 6px;">
            <img
              src="${logoSrc}"
              alt="TekDoctor"
              style="height: 38px; max-height: 38px; max-width: 190px; object-fit: contain; display: block;"
              crossorigin="anonymous"
            />
            <span style="background: #0f172a; color: #ffffff; font-size: 9px; font-weight: 800; letter-spacing: 1px; padding: 3px 8px; border-radius: 3px; text-transform: uppercase;">ENTERPRISE</span>
          </div>
          <div style="font-size: 11px; font-weight: 600; color: #475569;">Device Lifecycle & Maintenance Management Systems</div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
            ${cert.issuer.address} • GSTIN: ${cert.issuer.gstin}
          </div>
        </div>

        <div style="text-align: right;">
          <div style="display: inline-block; padding: 4px 12px; background: ${statusBadgeBg}; border: 1.5px solid ${statusBadgeBorder}; border-radius: 20px; color: ${statusBadgeColor}; font-size: 10px; font-weight: 800; letter-spacing: 0.8px; margin-bottom: 6px;">
            ${statusText}
          </div>
          <div style="font-size: 11px; font-family: monospace; font-weight: 800; color: #0284c7;">
            ${cert.certificateNumber}
          </div>
          <div style="font-size: 9.5px; color: #64748b; margin-top: 2px;">
            Issued: ${formatDate(cert.issuedAt)}
          </div>
        </div>
      </div>

      <!-- Certificate Title Banner -->
      <div style="text-align: center; margin-bottom: 22px; position: relative; z-index: 1;">
        <h1 style="margin: 0; font-size: 19px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a;">
          Annual Maintenance Contract Certificate
        </h1>
        <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b; font-weight: 500;">
          Official Fleet Service Level Guarantee & Hardware Coverage Schedule
        </p>
      </div>

      <!-- 2-Column Corporate Grid -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; position: relative; z-index: 1;">
        
        <!-- Company / Client Details Box -->
        <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 14px 16px;">
          <div style="font-size: 9.5px; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
            Client / Fleet Operator
          </div>
          <div style="font-size: 13.5px; font-weight: 800; color: #0f172a;">
            ${cert.company.name}
          </div>
          <div style="font-size: 10.5px; color: #475569; margin-top: 3px;">
            <strong>Company ID:</strong> <span style="font-family: monospace; color: #0284c7;">${cert.company.code}</span>
          </div>
          <div style="font-size: 10.5px; color: #475569; margin-top: 2px;">
            <strong>Email:</strong> ${cert.company.email}
          </div>
          ${cert.company.phone ? `<div style="font-size: 10.5px; color: #475569; margin-top: 2px;"><strong>Contact:</strong> ${cert.company.phone}</div>` : ''}
          <div style="font-size: 10px; color: #64748b; margin-top: 4px;">
            ${cert.company.address || 'Registered corporate premises on record'}
          </div>
          <div style="font-size: 10px; color: #334155; margin-top: 4px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
            <strong>GSTIN:</strong> ${cert.company.gstin || 'Unregistered / Exempt'}
          </div>
        </div>

        <!-- Contract & Coverage Terms Box -->
        <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 14px 16px;">
          <div style="font-size: 9.5px; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
            AMC Contract Details
          </div>
          <div style="font-size: 13.5px; font-weight: 800; color: #0f172a;">
            ${cert.contract.planName}
          </div>
          <div style="font-size: 10.5px; color: #475569; margin-top: 3px;">
            <strong>Contract No:</strong> <span style="font-family: monospace; color: #0284c7;">${cert.contract.contractNumber}</span>
            ${cert.contract.isRenewal ? ' <span style="background: #e0f2fe; color: #0369a1; padding: 1px 4px; border-radius: 3px; font-size: 9px; font-weight: 700;">RENEWAL</span>' : ''}
          </div>
          <div style="font-size: 10.5px; color: #475569; margin-top: 2px;">
            <strong>Validity Period:</strong> <span style="font-weight: 700; color: #0f172a;">${formatDate(cert.contract.startDate)}</span> to <span style="font-weight: 700; color: #0f172a;">${formatDate(cert.contract.endDate)}</span>
          </div>
          <div style="font-size: 10.5px; color: #475569; margin-top: 2px;">
            <strong>Fleet Capacity:</strong> ${cert.contract.activeCoveredCount} of ${cert.contract.deviceCapacity} Active Devices Covered
          </div>
          <div style="font-size: 10px; color: #334155; margin-top: 4px; padding-top: 4px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between;">
            <span><strong>Total Paid:</strong> ${curSym}${totalAmount}</span>
            <span><strong>Invoice:</strong> ${cert.contract.invoiceId || 'Paid'}</span>
          </div>
        </div>

      </div>

      <!-- Service Level Agreement (SLA) & Commitments Table -->
      <div style="margin-bottom: 20px; position: relative; z-index: 1;">
        <div style="font-size: 10px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;">
          Enterprise Service Level Commitments (SLA)
        </div>
        <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 10.5px;">
          <tr style="background: #f1f5f9; text-align: left; font-weight: 700; color: #334155; border-bottom: 1.5px solid #cbd5e1;">
            <th style="padding: 7px 10px;">Service Component</th>
            <th style="padding: 7px 10px;">Commitment Level</th>
            <th style="padding: 7px 10px;">Commercial Benefit</th>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 6px 10px; font-weight: 600; color: #0f172a;">Turnaround SLA</td>
            <td style="padding: 6px 10px; color: #0284c7; font-weight: 700;">Within ${sla.slaTurnaroundHours} Hours</td>
            <td style="padding: 6px 10px; color: #475569;">Priority diagnostics queue</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0; background: #fafafa;">
            <td style="padding: 6px 10px; font-weight: 600; color: #0f172a;">Labor & Service Charges</td>
            <td style="padding: 6px 10px; color: #16a34a; font-weight: 700;">${sla.laborDiscountPct}% Discount</td>
            <td style="padding: 6px 10px; color: #475569;">Zero labor fees on covered repairs</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 6px 10px; font-weight: 600; color: #0f172a;">Hardware Replacement Parts</td>
            <td style="padding: 6px 10px; color: #0284c7; font-weight: 700;">${sla.partsDiscountPct}% Flat Discount</td>
            <td style="padding: 6px 10px; color: #475569;">Genuine OEM-grade replacement parts</td>
          </tr>
          <tr style="background: #fafafa;">
            <td style="padding: 6px 10px; font-weight: 600; color: #0f172a;">Preventative Fleet Audit</td>
            <td style="padding: 6px 10px; color: #0f172a; font-weight: 700;">${sla.quarterlyAudit ? 'Quarterly Schedule' : 'Bi-Annual'}</td>
            <td style="padding: 6px 10px; color: #475569;">Preventative health and hardware checkup</td>
          </tr>
        </table>
      </div>

      <!-- Schedule of Covered Fleet Devices -->
      <div style="margin-bottom: 22px; position: relative; z-index: 1;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-size: 10px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.8px;">
            Schedule of Covered Devices (${cert.coveredDevices.length} Enrolled)
          </div>
          <div style="font-size: 9.5px; color: #64748b;">
            Capacity: ${cert.contract.deviceCapacity} Max Units
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background: #0f172a; color: #ffffff; font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; text-align: left;">
              <th style="padding: 7px 8px; text-align: center; width: 30px;">#</th>
              <th style="padding: 7px 8px;">Device Make & Model</th>
              <th style="padding: 7px 8px;">Serial Number</th>
              <th style="padding: 7px 8px;">Asset Tag</th>
              <th style="padding: 7px 8px;">AMC Tag</th>
              <th style="padding: 7px 8px;">Validity Window</th>
              <th style="padding: 7px 8px; text-align: center; width: 65px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${devicesRows}
          </tbody>
        </table>
      </div>

      <!-- Legal & Terms Footer -->
      <div style="border-top: 1.5px solid #e2e8f0; padding-top: 16px; position: relative; z-index: 1;">
        <div style="display: grid; grid-template-columns: 1.8fr 1.15fr 0.95fr; gap: 14px; align-items: center;">
          <div>
            <div style="font-size: 9px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
              Compliance Certification & Registry Terms
            </div>
            <p style="margin: 0; font-size: 8.5px; color: #64748b; line-height: 1.45;">
              This certifies that the organization and specific hardware items listed above are formally covered under TekDoctor's Enterprise Maintenance Agreement. All service dispatches, diagnostic assessments, and priority turnaround times are governed by the contractual terms executed under contract reference <strong>${cert.contract.contractNumber}</strong>. Repair requests for non-listed devices or modified serial numbers are subject to verification.
            </p>
            <div style="margin-top: 5px; font-size: 8px; font-family: monospace; color: #64748b;">
              HMAC-SHA256 Verification Code: <span style="font-weight: 700; color: #0284c7;">${cert.verificationCode}</span>
            </div>
            <div style="font-size: 7.5px; color: #94a3b8; margin-top: 2px;">
              Verify online: ${verifyUrl}
            </div>
          </div>

          <!-- Official QR Verification Code Box -->
          <div style="text-align: center; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; background: #ffffff; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div style="display: inline-block; padding: 4px; background: #ffffff;">
              ${qrSvg}
            </div>
            <div style="font-size: 8px; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 5px;">
              Scan to Verify Certificate
            </div>
          </div>

          <!-- Digital Seal & Signatory Box -->
          <div style="text-align: center; border: 1.5px dashed #cbd5e1; border-radius: 8px; padding: 10px; background: #fafafa;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: #0f172a; color: #00e5ff; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 900; margin-bottom: 4px;">
              ✓
            </div>
            <div style="font-size: 9px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">
              Authorized Registry Seal
            </div>
            <div style="font-size: 8px; color: #64748b; margin-top: 2px;">
              TekDoctor Operations & Quality Control
            </div>
          </div>
        </div>
      </div>

    </div>
  `;
}

/**
 * Downloads the AMC Compliance Certificate / Contract Letter as a high-resolution A4 PDF.
 */
export async function downloadAmcCertificatePdf(cert: AmcCertificateData): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default;

  const rawResolvedLogoUrl = (cert.issuer as any)?.logoBase64 || ((cert.issuer as any)?.logoUrl
    ? ((cert.issuer as any).logoUrl.startsWith('http') || (cert.issuer as any).logoUrl.startsWith('data:')
        ? (cert.issuer as any).logoUrl
        : `${typeof window !== 'undefined' ? window.location.origin : ''}${(cert.issuer as any).logoUrl.startsWith('/') ? '' : '/'}${(cert.issuer as any).logoUrl}`)
    : '/tekdoctor_logo_black.png');

  const logoSrc = await getBlackLogoDataUri(rawResolvedLogoUrl);

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.width = '800px';
  container.innerHTML = generateAmcCertificateHtml(cert, logoSrc);

  document.body.appendChild(container);

  // Synchronize image loading before rasterization starts
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

  const cleanDocName = `TekDoctor_AMC_Certificate_${cert.contract.contractNumber}_${cert.company.code || 'Fleet'}.pdf`
    .replace(/[^\w.-]/g, '_');

  const opt = {
    margin: [8, 8, 8, 8],
    filename: cleanDocName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };

  const elem = container.firstElementChild as HTMLElement;
  if (!elem) {
    if (document.body.contains(container)) document.body.removeChild(container);
    return;
  }

  try {
    await (html2pdf() as any).set(opt).from(elem).save();
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

/**
 * Directly prints the AMC Compliance Certificate / Contract Letter via browser print dialog.
 */
export async function printAmcCertificate(cert: AmcCertificateData): Promise<void> {
  const rawResolvedLogoUrl = (cert.issuer as any)?.logoBase64 || ((cert.issuer as any)?.logoUrl
    ? ((cert.issuer as any).logoUrl.startsWith('http') || (cert.issuer as any).logoUrl.startsWith('data:')
        ? (cert.issuer as any).logoUrl
        : `${typeof window !== 'undefined' ? window.location.origin : ''}${(cert.issuer as any).logoUrl.startsWith('/') ? '' : '/'}${(cert.issuer as any).logoUrl}`)
    : '/tekdoctor_logo_black.png');

  const logoSrc = await getBlackLogoDataUri(rawResolvedLogoUrl);
  const html = generateAmcCertificateHtml(cert, logoSrc);

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
        <title>AMC Certificate - ${cert.contract.contractNumber}</title>
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

  // Wait for iframe content and images to render
  const iframeImages = Array.from(doc.querySelectorAll('img'));
  await Promise.all(
    iframeImages.map(
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

  await new Promise(resolve => setTimeout(resolve, 250));

  try {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  } catch (e) {
    console.error('Certificate printing failed:', e);
  } finally {
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 2000);
  }
}

/**
 * AMC Contract Letter Aliases:
 * In TekDoctor AMC workflows, the SLA-backed Compliance Certificate also serves
 * as the official executed Contract Agreement / Letter. These aliases provide explicit
 * semantic parity for both contract letter and certificate invocations.
 */
export const downloadAmcContractLetterPdf = downloadAmcCertificatePdf;
export const printAmcContractLetterPdf = printAmcCertificate;
export const generateAmcContractLetterHtml = generateAmcCertificateHtml;

