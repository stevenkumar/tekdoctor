import React, { useState } from 'react';
import { X, Plus, Trash2, Receipt, AlertCircle, Sparkles, Building2, User, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { billingApi } from '@/services/api';
import { COMMON_SAC_CODES } from './InvoiceTable';

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  token?: string | null;
  currentUserId?: string | number;
  onInvoiceCreated: () => void;
}

interface NewLineItem {
  description: string;
  hsnSac: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

const PRESET_SERVICES = [
  { description: 'Comprehensive Device Diagnostic & Hardware Test', hsnSac: '9987', unitPrice: 499, taxRate: 18 },
  { description: 'Motherboard Chip-Level Micro-Soldering Repair', hsnSac: '998713', unitPrice: 2499, taxRate: 18 },
  { description: 'Display Panel Assembly Replacement', hsnSac: '8473', unitPrice: 3999, taxRate: 18 },
  { description: 'High-Capacity OEM Battery Replacement', hsnSac: '8507', unitPrice: 1899, taxRate: 18 },
  { description: 'Thermal Paste Re-Pasting & Ultrasonic Deep Cleaning', hsnSac: '9987', unitPrice: 799, taxRate: 18 },
  { description: 'Operating System & Productivity Suite Setup', hsnSac: '9983', unitPrice: 599, taxRate: 18 },
  { description: 'Corporate Annual Maintenance Contract (AMC) Service', hsnSac: '9987', unitPrice: 4999, taxRate: 18 },
];

export function CreateInvoiceModal({
  isOpen,
  onClose,
  token,
  currentUserId,
  onInvoiceCreated,
}: CreateInvoiceModalProps) {
  const [clientName, setClientName] = useState('');
  const [clientGstin, setClientGstin] = useState('');
  const [isInterstate, setIsInterstate] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [status, setStatus] = useState<'Draft' | 'Sent' | 'Final'>('Draft');
  const [notes, setNotes] = useState('Payment is due within 7 days of invoice date. 30-day warranty on repaired components.');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [lineItems, setLineItems] = useState<NewLineItem[]>([
    { description: 'Device Diagnostics & Hardware Repair', hsnSac: '9987', quantity: 1, unitPrice: 1000, taxRate: 18 }
  ]);

  if (!isOpen) return null;

  // Auto-detect inter-state if GSTIN starts with code other than '27' (Maharashtra)
  const handleGstinChange = (gst: string) => {
    setClientGstin(gst);
    const cleanGst = gst.trim();
    if (cleanGst.length >= 2) {
      const stateCode = cleanGst.substring(0, 2);
      if (/^\d{2}$/.test(stateCode)) {
        if (stateCode !== '27') {
          setIsInterstate(true);
        } else {
          setIsInterstate(false);
        }
      }
    }
  };

  const handleLineItemChange = (index: number, field: keyof NewLineItem, value: any) => {
    setLineItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      return { ...item, [field]: value };
    }));
  };

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      { description: 'Service / Component Item', hsnSac: '9987', quantity: 1, unitPrice: 0, taxRate: 18 }
    ]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length === 1) {
      toast.error('Invoice must contain at least one line item.');
      return;
    }
    setLineItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleApplyGlobalTax = (rate: number) => {
    setLineItems(prev => prev.map(item => ({ ...item, taxRate: rate })));
  };

  // Calculations
  const subtotal = lineItems.reduce((sum, item) => sum + (Math.max(1, Number(item.quantity) || 1) * Math.max(0, Number(item.unitPrice) || 0)), 0);
  const totalGst = lineItems.reduce((sum, item) => {
    const itemSub = Math.max(1, Number(item.quantity) || 1) * Math.max(0, Number(item.unitPrice) || 0);
    const rate = Math.max(0, Number(item.taxRate) || 0);
    return sum + (itemSub * (rate / 100));
  }, 0);

  const roundedSubtotal = Math.round(subtotal * 100) / 100;
  const roundedTotalGst = Math.round(totalGst * 100) / 100;
  const cgstAmount = isInterstate ? 0 : Math.round((roundedTotalGst / 2) * 100) / 100;
  const sgstAmount = isInterstate ? 0 : Math.round((roundedTotalGst - cgstAmount) * 100) / 100;
  const igstAmount = isInterstate ? roundedTotalGst : 0;
  const grandTotal = Math.round((roundedSubtotal + roundedTotalGst) * 100) / 100;
  const effectiveGstRate = roundedSubtotal > 0 ? Math.round((roundedTotalGst / roundedSubtotal) * 10000) / 100 : 18;

  const handleSubmit = async (submitStatus: 'Draft' | 'Sent' | 'Final') => {
    if (!clientName.trim()) {
      toast.error('Client name is required.');
      return;
    }

    if (lineItems.length === 0) {
      toast.error('At least one line item is required.');
      return;
    }

    for (const item of lineItems) {
      if (!item.description.trim()) {
        toast.error('All line items must have a description.');
        return;
      }
    }

    setIsSubmitting(true);
    const toastId = toast.loading('Creating commercial invoice...');

    try {
      const formattedItems = lineItems.map(item => {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const price = Math.max(0, Number(item.unitPrice) || 0);
        const itemTot = Math.round(qty * price * 100) / 100;
        const rate = Math.max(0, Number(item.taxRate) || 0);
        const taxAmt = Math.round((itemTot * (rate / 100)) * 100) / 100;

        return {
          description: item.description.trim(),
          hsnSac: item.hsnSac.trim() || '9987',
          hsn_sac: item.hsnSac.trim() || '9987',
          quantity: qty,
          unitPrice: price,
          unit_price: price,
          total: itemTot,
          taxRate: rate,
          tax_rate: rate,
          taxAmount: taxAmt,
          tax_amount: taxAmt
        };
      });

      const payload = {
        clientName: clientName.trim(),
        userId: currentUserId ? Number(currentUserId) : 1,
        invoiceDate: new Date(invoiceDate).toISOString(),
        dueDate: new Date(dueDate).toISOString(),
        currency: 'INR',
        status: submitStatus,
        notes: notes.trim(),
        isInterstate: Boolean(isInterstate),
        amount: grandTotal,
        subtotal: roundedSubtotal,
        taxAmount: roundedTotalGst,
        cgstAmount,
        sgstAmount,
        igstAmount,
        lineItems: formattedItems
      };

      const res = await billingApi.createInvoice(token, payload);
      if (res && res.ok) {
        toast.success(`Invoice created successfully! ID: ${res.data?.data?.invoiceId || 'New'}`, { id: toastId });
        onInvoiceCreated();
        onClose();
      } else {
        toast.error(res?.error || 'Failed to create invoice.', { id: toastId });
      }
    } catch (err: any) {
      console.error('Invoice creation failed:', err);
      toast.error(err.message || 'Failed to create commercial invoice.', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-4xl w-full my-8 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center text-neon-cyan">
              <Receipt size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                CREATE COMMERCIAL TAX INVOICE
              </h3>
              <p className="text-xs text-zinc-400 font-sans">
                Generate an official GST invoice with transparent 9% + 9% CGST & SGST split
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800/80 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-grow">
          {/* Client & Date Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase tracking-wider">
                Client / Company Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Reliance Retail Ltd or Rajesh Sharma"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-neon-cyan"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase tracking-wider">
                Client GSTIN (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. 27AAAAA0000A1Z5"
                value={clientGstin}
                onChange={e => handleGstinChange(e.target.value.toUpperCase())}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-neon-cyan uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase tracking-wider">
                Invoice Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-neon-cyan"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase tracking-wider">
                Payment Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-neon-cyan"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase tracking-wider">
                Initial Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-neon-cyan"
              >
                <option value="Draft">Draft (Under Review)</option>
                <option value="Sent">Sent (Payable by Client)</option>
              </select>
            </div>
          </div>

          {/* Interstate / Supply Place Detection Card */}
          <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="modal-is-interstate"
                checked={isInterstate}
                onChange={e => setIsInterstate(e.target.checked)}
                className="w-4 h-4 rounded bg-zinc-950 border-zinc-700 text-neon-cyan focus:ring-neon-cyan cursor-pointer"
              />
              <div>
                <label htmlFor="modal-is-interstate" className="text-xs font-mono text-white font-bold cursor-pointer block">
                  {isInterstate ? 'Inter-State Transaction (IGST Applicable)' : 'Intra-State Transaction (CGST 9% + SGST 9%)'}
                </label>
                <span className="text-[10.5px] text-zinc-400 font-mono">
                  {isInterstate 
                    ? 'Client location outside Maharashtra ➔ 18% Integrated GST applies.' 
                    : 'Client within Maharashtra ➔ 18% splits into 9% CGST + 9% SGST.'}
                </span>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider shrink-0 ${isInterstate ? 'bg-amber-950/60 border border-amber-500/40 text-amber-300' : 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-300'}`}>
              {isInterstate ? 'Tax: IGST (18%)' : 'Tax: CGST (9%) + SGST (9%)'}
            </span>
          </div>

          {/* Line Items Section */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800">
              <div className="flex items-center gap-3">
                <h4 className="text-xs font-mono uppercase tracking-widest text-zinc-300 font-bold">
                  Line Items ({lineItems.length})
                </h4>
                <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1">
                  <span className="font-mono text-[10px] text-zinc-400 uppercase">Apply GST:</span>
                  {[0, 5, 12, 18, 28].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleApplyGlobalTax(r)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition cursor-pointer ${
                        r === 18 
                          ? 'bg-neon-cyan/20 border-neon-cyan/50 text-neon-cyan' 
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                      }`}
                    >
                      {r}% {r === 18 ? (!isInterstate ? '(9+9)' : '(IGST)') : ''}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  defaultValue=""
                  onChange={e => {
                    const preset = PRESET_SERVICES.find(p => p.description === e.target.value);
                    if (preset) {
                      setLineItems(prev => [...prev, { ...preset, quantity: 1 }]);
                      e.target.value = "";
                    }
                  }}
                  className="bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[11px] rounded px-2 py-1 focus:outline-none focus:border-neon-cyan cursor-pointer"
                >
                  <option value="" disabled>+ Add from Preset Catalog...</option>
                  {PRESET_SERVICES.map((p, idx) => (
                    <option key={idx} value={p.description}>
                      {p.description} (₹{p.unitPrice})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="text-neon-cyan hover:text-neon-cyan/80 flex items-center gap-1 font-mono text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  <Plus size={14} /> Custom Item
                </button>
              </div>
            </div>

            {/* Line Items List */}
            <div className="space-y-3">
              {lineItems.map((item, index) => {
                const itemQty = Math.max(1, Number(item.quantity) || 1);
                const itemPrice = Math.max(0, Number(item.unitPrice) || 0);
                const itemSub = Math.round(itemQty * itemPrice * 100) / 100;
                const itemRate = Math.max(0, Number(item.taxRate) || 0);
                const itemTax = Math.round((itemSub * (itemRate / 100)) * 100) / 100;
                const itemCgst = isInterstate ? 0 : Math.round((itemTax / 2) * 100) / 100;
                const itemSgst = isInterstate ? 0 : Math.round((itemTax - itemCgst) * 100) / 100;
                const itemTotal = Math.round((itemSub + itemTax) * 100) / 100;

                return (
                  <div key={index} className="p-3.5 bg-zinc-900/40 border border-zinc-800/80 rounded-xl space-y-2.5">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-4">
                        <label className="block font-mono text-[10px] text-zinc-500 mb-1 uppercase">
                          Item / Service Description
                        </label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={e => handleLineItemChange(index, 'description', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-neon-cyan"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <div className="flex justify-between items-center mb-1">
                          <label className="block font-mono text-[10px] text-zinc-500 uppercase">
                            SAC / HSN
                          </label>
                          <select
                            className="bg-transparent text-[9px] font-mono text-neon-cyan cursor-pointer focus:outline-none"
                            value=""
                            onChange={e => {
                              if (e.target.value) handleLineItemChange(index, 'hsnSac', e.target.value);
                            }}
                          >
                            <option value="" disabled>Presets</option>
                            {COMMON_SAC_CODES.map(sac => (
                              <option key={sac.code} value={sac.code} className="bg-zinc-900 text-white">
                                {sac.code}
                              </option>
                            ))}
                          </select>
                        </div>
                        <input
                          type="text"
                          value={item.hsnSac}
                          onChange={e => handleLineItemChange(index, 'hsnSac', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-neon-cyan"
                        />
                      </div>

                      <div className="md:col-span-1">
                        <label className="block font-mono text-[10px] text-zinc-500 mb-1 uppercase">
                          Qty
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => handleLineItemChange(index, 'quantity', Number(e.target.value))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs font-mono text-white text-center focus:outline-none focus:border-neon-cyan"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block font-mono text-[10px] text-zinc-500 mb-1 uppercase">
                          Unit Rate (₹)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unitPrice}
                          onChange={e => handleLineItemChange(index, 'unitPrice', Number(e.target.value))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-neon-cyan"
                        />
                      </div>

                      <div className="md:col-span-1">
                        <label className="block font-mono text-[10px] text-zinc-500 mb-1 uppercase">
                          GST %
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max="28"
                          value={item.taxRate}
                          onChange={e => handleLineItemChange(index, 'taxRate', Number(e.target.value))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs font-mono text-white text-center focus:outline-none focus:border-neon-cyan"
                        />
                      </div>

                      <div className="md:col-span-2 flex items-center justify-between gap-2">
                        <div className="text-right flex-grow">
                          <p className="font-mono text-[9px] text-zinc-500 uppercase">Item Total (Inc. Tax)</p>
                          <p className="font-mono text-xs font-bold text-neon-cyan">
                            ₹{itemTotal.toFixed(2)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          className="text-red-400 hover:text-red-300 p-1.5 hover:bg-red-950/40 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Live item-level tax split strip */}
                    <div className="flex flex-wrap items-center justify-between text-[10px] font-mono bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800/70 text-zinc-400">
                      <div>
                        Taxable Subtotal: <strong className="text-white">₹{itemSub.toFixed(2)}</strong>
                      </div>
                      <div className="flex items-center gap-2">
                        {isInterstate ? (
                          <span>IGST ({itemRate}%): <strong className="text-amber-400">₹{itemTax.toFixed(2)}</strong></span>
                        ) : (
                          <>
                            <span>CGST ({(itemRate / 2).toFixed(1)}%): <strong className="text-neon-cyan">₹{itemCgst.toFixed(2)}</strong></span>
                            <span>+</span>
                            <span>SGST ({(itemRate / 2).toFixed(1)}%): <strong className="text-neon-cyan">₹{itemSgst.toFixed(2)}</strong></span>
                            <span className="text-zinc-600">•</span>
                            <span>Tax: <strong className="text-cyan-300">₹{itemTax.toFixed(2)}</strong></span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Authoritative Live Totals Breakdown */}
          <div className="p-4 bg-zinc-900/90 border border-zinc-800 rounded-2xl grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono items-center">
            <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase">Taxable Subtotal</span>
              <span className="text-white font-bold text-sm">
                ₹{roundedSubtotal.toFixed(2)}
              </span>
            </div>

            {isInterstate ? (
              <div className="bg-amber-950/30 p-2.5 rounded-xl border border-amber-500/30">
                <span className="text-amber-400 block text-[10px] uppercase">IGST ({effectiveGstRate.toFixed(1)}%)</span>
                <span className="text-amber-300 font-bold text-sm">
                  ₹{igstAmount.toFixed(2)}
                </span>
              </div>
            ) : (
              <>
                <div className="bg-cyan-950/30 p-2.5 rounded-xl border border-cyan-500/30">
                  <span className="text-cyan-400 block text-[10px] uppercase">CGST ({(effectiveGstRate / 2).toFixed(1)}%)</span>
                  <span className="text-neon-cyan font-bold text-sm">
                    ₹{cgstAmount.toFixed(2)}
                  </span>
                </div>
                <div className="bg-cyan-950/30 p-2.5 rounded-xl border border-cyan-500/30">
                  <span className="text-cyan-400 block text-[10px] uppercase">SGST ({(effectiveGstRate / 2).toFixed(1)}%)</span>
                  <span className="text-neon-cyan font-bold text-sm">
                    ₹{sgstAmount.toFixed(2)}
                  </span>
                </div>
              </>
            )}

            <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase">Total Tax (GST)</span>
              <span className="text-cyan-300 font-bold text-sm">
                ₹{roundedTotalGst.toFixed(2)}
              </span>
            </div>

            <div className="bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-500/30">
              <span className="text-emerald-400 block text-[10px] uppercase font-bold">Grand Total</span>
              <span className="text-emerald-400 font-black text-base">
                ₹{grandTotal.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase tracking-wider">
              Notes & Terms
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-neon-cyan"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-5 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSubmit('Draft')}
            className="px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            Save as Draft
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSubmit('Sent')}
            className="px-5 py-2 rounded-xl text-xs font-mono font-bold uppercase bg-gradient-to-r from-neon-cyan to-blue-500 text-black hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-cyan-500/20"
          >
            <CheckCircle2 size={16} /> Create Commercial Invoice
          </button>
        </div>
      </div>
    </div>
  );
}
