'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, Edit2, Check, X, Plus, Trash2, CreditCard, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import PaymentStatusBadge from './PaymentStatusBadge';
import InvoiceShareMenu from './InvoiceShareMenu';
import { PaymentReceiptModal } from '@/components/PaymentReceiptModal';
import { ConfirmModal } from '@/components/ConfirmModal';

interface LineItem {
  id?: number | string;
  description: string;
  hsnSac?: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  taxAmount?: number;
  total: number;
}

export const COMMON_SAC_CODES = [
  { code: '9987', label: '9987 - IT & Computer Repair Services' },
  { code: '998713', label: '998713 - Laptop & Desktop Hardware Repair' },
  { code: '998729', label: '998729 - Other Electronics & Device Repair' },
  { code: '8473', label: '8473 - Computer Parts & Display Panels' },
  { code: '8507', label: '8507 - Device Batteries & Power Cells' },
  { code: '9983', label: '9983 - OS & Software Installation Support' },
];

const DEFAULT_CATALOG_ITEMS: Array<{ description: string; hsnSac: string; unitPrice: number; taxRate: number }> = [
  { description: 'Diagnostic Service Fee', hsnSac: '9987', unitPrice: 499, taxRate: 18 },
  { description: 'Motherboard Chip-level Repair', hsnSac: '9987', unitPrice: 2499, taxRate: 18 },
  { description: 'Display Panel Replacement', hsnSac: '8473', unitPrice: 3999, taxRate: 18 },
  { description: 'Battery Replacement & Calibration', hsnSac: '8507', unitPrice: 1899, taxRate: 18 },
  { description: 'Thermal Paste & Deep Clean Maintenance', hsnSac: '9987', unitPrice: 799, taxRate: 18 },
  { description: 'OS & Software Diagnostics', hsnSac: '9983', unitPrice: 599, taxRate: 18 }
];

interface Invoice {
  id: string;
  userId: string;
  ticketId?: number | string | null;
  ticket_id?: number | string | null;
  ticketNumber?: string | null;
  ticket_number?: string | null;
  clientName: string;
  amount: number;
  subtotal?: number;
  taxAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  originalEstimate?: number | null;
  isInterstate?: boolean;
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

interface InvoiceTableProps {
  invoices: Invoice[];
  onStatusChange: (invoiceId: string, newStatus: string) => Promise<void>;
  onUpdateInvoice?: (invoiceId: string, updateData: Partial<Invoice> & { newInvoiceId?: string; isInterstate?: boolean }) => Promise<void>;
  onFinalizeInvoice?: (invoiceId: string) => Promise<void>;
  onDeleteInvoice?: (invoiceId: string) => Promise<void>;
  canManage?: boolean;
  isLoading?: boolean;
  initialSelectedInvoiceId?: string | null;
  initialFilterStatus?: string | null;
}

type SortKey = 'id' | 'clientName' | 'amount' | 'invoiceDate' | 'dueDate' | 'status';
type SortOrder = 'asc' | 'desc';

export default function InvoiceTable({
  invoices,
  onStatusChange,
  onUpdateInvoice,
  onFinalizeInvoice,
  onDeleteInvoice,
  canManage = false,
  isLoading = false,
  initialSelectedInvoiceId = null,
  initialFilterStatus = null
}: InvoiceTableProps) {
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(initialSelectedInvoiceId);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [finalizingInvoiceId, setFinalizingInvoiceId] = useState<string | null>(null);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const [invoiceToFinalize, setInvoiceToFinalize] = useState<{ id: string; targetId: string } | null>(null);

  // Expanded form states
  const [editInvoiceNumber, setEditInvoiceNumber] = useState('');
  const [editIsInterstate, setEditIsInterstate] = useState(false);
  const [editClientName, setEditClientName] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editCurrency, setEditCurrency] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editLineItems, setEditLineItems] = useState<LineItem[]>([]);

  const [sortConfig, setSortConfig] = useState<{ key: SortKey; order: SortOrder }>({
    key: 'invoiceDate',
    order: 'desc',
  });
  const [filterStatus, setFilterStatus] = useState<string>(initialFilterStatus || 'All');
  const [searchTerm, setSearchTerm] = useState<string>(initialSelectedInvoiceId || '');

  const statusOptions = ['All', 'Draft', 'Final', 'Sent', 'Paid', 'Overdue', 'Void'];

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      order: prev.key === key && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  let filteredInvoices = [...invoices];

  // Apply search filter
  if (searchTerm) {
    const s = searchTerm.toLowerCase();
    filteredInvoices = filteredInvoices.filter(inv =>
      inv.id.toLowerCase().includes(s) ||
      inv.clientName.toLowerCase().includes(s) ||
      (inv.ticketNumber && inv.ticketNumber.toLowerCase().includes(s)) ||
      (inv.ticketId && String(inv.ticketId).toLowerCase().includes(s))
    );
  }

  // Apply status filter
  if (filterStatus !== 'All') {
    filteredInvoices = filteredInvoices.filter(inv => inv.status === filterStatus);
  }

  // Apply sorting
  filteredInvoices.sort((a, b) => {
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];
    const multiplier = sortConfig.order === 'asc' ? 1 : -1;

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return aValue.localeCompare(bValue) * multiplier;
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return (aValue - bValue) * multiplier;
    }

    return 0;
  });

  const startEdit = (invoice: Invoice) => {
    setEditingInvoiceId(invoice.id);
    setEditInvoiceNumber(invoice.id);
    setEditIsInterstate(Boolean(invoice.isInterstate));
    setEditClientName(invoice.clientName || '');
    setEditInvoiceDate(invoice.invoiceDate ? invoice.invoiceDate.split('T')[0] : '');
    setEditDueDate(invoice.dueDate ? invoice.dueDate.split('T')[0] : '');
    setEditStatus(invoice.status || 'Draft');
    setEditCurrency(invoice.currency || 'INR');
    setEditNotes(invoice.notes || '');
    setEditLineItems((invoice.lineItems || []).map(li => {
      const itemTaxRate = li.taxRate !== undefined ? Number(li.taxRate) : ((li as any).tax_rate !== undefined ? Number((li as any).tax_rate) : 18);
      const itemTotal = Number(li.total) || (Number(li.quantity || 1) * Number(li.unitPrice || 0));
      const itemTaxAmount = li.taxAmount !== undefined ? Number(li.taxAmount) : ((li as any).tax_amount !== undefined ? Number((li as any).tax_amount) : Math.round((itemTotal * (itemTaxRate / 100)) * 100) / 100);
      return {
        ...li,
        hsnSac: li.hsnSac || (li as any).hsn_sac || '9987',
        taxRate: itemTaxRate,
        taxAmount: itemTaxAmount
      };
    }));
  };

  const handleApplyGlobalTaxRate = (newRate: number) => {
    const updatedItems = editLineItems.map(item => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const price = Math.max(0, Number(item.unitPrice) || 0);
      const lineTotal = Math.round(qty * price * 100) / 100;
      const itemTax = Math.round(lineTotal * (newRate / 100) * 100) / 100;
      return {
        ...item,
        quantity: qty,
        unitPrice: price,
        total: lineTotal,
        taxRate: newRate,
        taxAmount: itemTax
      };
    });
    setEditLineItems(updatedItems);
  };

  useEffect(() => {
    if (initialSelectedInvoiceId && invoices.length > 0) {
      const timer = setTimeout(() => {
        const targetClean = initialSelectedInvoiceId.trim().toLowerCase();
        const match = invoices.find(inv =>
          inv.id.toLowerCase() === targetClean ||
          (inv.ticketId && String(inv.ticketId).toLowerCase() === targetClean) ||
          (inv.ticketNumber && inv.ticketNumber.toLowerCase() === targetClean)
        );
        if (match) {
          setFilterStatus('All');
          setExpandedInvoiceId(match.id);
          if (canManage) {
            startEdit(match);
          }
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [initialSelectedInvoiceId, invoices, canManage]);

  const handleLineItemChange = (index: number, field: keyof LineItem, value: string | number) => {
    const updatedItems = editLineItems.map((item, idx) => {
      if (idx !== index) return item;
      const updatedItem = { ...item, [field]: value };
      
      const qty = field === 'quantity' ? Math.max(1, Number(value) || 1) : Math.max(1, Number(item.quantity) || 1);
      const price = field === 'unitPrice' ? Math.max(0, Number(value) || 0) : Math.max(0, Number(item.unitPrice) || 0);
      const taxRate = field === 'taxRate' ? Math.max(0, Number(value) || 0) : (item.taxRate !== undefined ? item.taxRate : 18);

      const lineTotal = Math.round(qty * price * 100) / 100;
      const itemTax = Math.round(lineTotal * (taxRate / 100) * 100) / 100;

      updatedItem.quantity = qty;
      updatedItem.unitPrice = price;
      updatedItem.total = lineTotal;
      updatedItem.taxRate = taxRate;
      updatedItem.taxAmount = itemTax;

      return updatedItem;
    });
    setEditLineItems(updatedItems);
  };

  const addLineItem = () => {
    setEditLineItems([
      ...editLineItems,
      { description: 'New Service Item', hsnSac: '9987', quantity: 1, unitPrice: 0, taxRate: 18, taxAmount: 0, total: 0 }
    ]);
  };

  const addCatalogItem = (catalogItem: { description: string; hsnSac: string; unitPrice: number; taxRate: number }) => {
    const lineTotal = catalogItem.unitPrice;
    const taxAmt = Math.round(lineTotal * (catalogItem.taxRate / 100) * 100) / 100;
    setEditLineItems([
      ...editLineItems,
      {
        description: catalogItem.description,
        hsnSac: catalogItem.hsnSac,
        quantity: 1,
        unitPrice: catalogItem.unitPrice,
        taxRate: catalogItem.taxRate,
        taxAmount: taxAmt,
        total: lineTotal
      }
    ]);
  };

  const removeLineItem = (index: number) => {
    setEditLineItems(editLineItems.filter((_, idx) => idx !== index));
  };

  const handleFullInvoiceUpdate = async (invoiceId: string): Promise<boolean> => {
    try {
      if (!onUpdateInvoice) return true;

      const current = invoices.find(inv => inv.id === invoiceId);
      if (!current) {
        console.error('Invoice not found for update:', invoiceId);
        return false;
      }

      const subtotal = editLineItems.reduce((sum, item) => sum + item.total, 0);
      const totalGst = editLineItems.reduce((sum, item) => sum + (item.taxAmount || (item.total * (item.taxRate !== undefined ? item.taxRate : 18) / 100)), 0);
      const finalAmount = Math.round((subtotal + totalGst) * 100) / 100;

      const effectiveRate = editLineItems.length > 0 && editLineItems[0].taxRate !== undefined
        ? editLineItems[0].taxRate
        : (subtotal > 0 ? Math.round((totalGst / subtotal) * 10000) / 100 : 18);

      const formattedLineItems = editLineItems.map(item => ({
        ...item,
        hsnSac: item.hsnSac || '9987',
        hsn_sac: item.hsnSac || '9987',
        taxRate: item.taxRate !== undefined ? item.taxRate : 18,
        tax_rate: item.taxRate !== undefined ? item.taxRate : 18,
        taxAmount: item.taxAmount !== undefined ? item.taxAmount : Math.round((item.total * ((item.taxRate !== undefined ? item.taxRate : 18) / 100)) * 100) / 100,
        tax_amount: item.taxAmount !== undefined ? item.taxAmount : Math.round((item.total * ((item.taxRate !== undefined ? item.taxRate : 18) / 100)) * 100) / 100,
      }));

      const updateData: any = {
        userId: current.userId,
        clientName: editClientName,
        invoiceDate: editInvoiceDate ? new Date(editInvoiceDate).toISOString() : undefined,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : undefined,
        status: editStatus,
        currency: editCurrency,
        notes: editNotes,
        amount: finalAmount,
        subtotal: Math.round(subtotal * 100) / 100,
        taxAmount: Math.round(totalGst * 100) / 100,
        taxRate: effectiveRate,
        gstRate: effectiveRate,
        gstPercentage: effectiveRate,
        cgstAmount: editIsInterstate ? 0 : Math.round((totalGst / 2) * 100) / 100,
        sgstAmount: editIsInterstate ? 0 : Math.round((totalGst - Math.round((totalGst / 2) * 100) / 100) * 100) / 100,
        igstAmount: editIsInterstate ? Math.round(totalGst * 100) / 100 : 0,
        isInterstate: editIsInterstate,
        lineItems: formattedLineItems,
      };

      if (current.status === 'Draft' && editInvoiceNumber && editInvoiceNumber.trim() !== invoiceId) {
        updateData.newInvoiceId = editInvoiceNumber.trim();
      }

      await onUpdateInvoice(invoiceId, updateData);
      setEditingInvoiceId(null);
      return true;
    } catch (error) {
      console.error('Failed to update invoice details:', error);
      return false;
    }
  };

  const handleConfirmFinalize = async () => {
    if (!invoiceToFinalize || !onFinalizeInvoice || finalizingInvoiceId) return;

    const { id, targetId } = invoiceToFinalize;
    setFinalizingInvoiceId(id);
    try {
      if (editingInvoiceId === id) {
        const updateOk = await handleFullInvoiceUpdate(id);
        if (!updateOk) {
          setInvoiceToFinalize(null);
          return;
        }
      }
      await onFinalizeInvoice(targetId || id);
      setInvoiceToFinalize(null);
    } catch (error) {
      console.error('Finalization failed:', error);
    } finally {
      setFinalizingInvoiceId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-pulse text-neon-cyan text-lg font-mono">
          LOADING_INVOICES...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters and Search */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 select-none">
        <input
          type="text"
          placeholder="Search by Invoice ID or Client Name..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="
            bg-zinc-900 border border-neon-cyan/30 rounded-lg px-4 py-2
            text-white placeholder-zinc-500 font-mono text-sm
            focus:outline-none focus:border-neon-cyan transition-colors
          "
        />

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          title="Filter invoices by status"
          className="
            bg-zinc-900 border border-neon-cyan/30 rounded-lg px-4 py-2
            text-white font-mono text-sm
            focus:outline-none focus:border-neon-cyan transition-colors cursor-pointer
          "
        >
          {statusOptions.map(status => (
            <option key={status} value={status} className="bg-zinc-900 text-white">
              {status}
            </option>
          ))}
        </select>

        <div className="text-sm text-zinc-400 font-mono flex items-center justify-end">
          Showing {filteredInvoices.length} of {invoices.length} invoices
        </div>
      </div>

      {/* Table */}
      {filteredInvoices.length === 0 ? (
        <div className="text-center py-12 text-zinc-400 font-mono">
          No invoices found. Try adjusting your filters.
        </div>
      ) : (
        <div className="overflow-x-auto border border-neon-cyan/30 rounded-lg select-none">
          <table className="w-full">
            <thead>
              <tr className="bg-zinc-900/50 border-b border-neon-cyan/30">
                <th className="px-6 py-4 text-left"></th>
                <th
                  className="px-6 py-4 text-left cursor-pointer hover:text-neon-cyan transition-colors"
                  onClick={() => handleSort('id')}
                >
                  <div className="flex items-center gap-2 font-mono text-xs tracking-widest text-zinc-300">
                    Invoice ID
                    {sortConfig.key === 'id' && (
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${
                          sortConfig.order === 'desc' ? 'rotate-180' : ''
                        }`}
                      />
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-4 text-left cursor-pointer hover:text-neon-cyan transition-colors"
                  onClick={() => handleSort('clientName')}
                >
                  <div className="flex items-center gap-2 font-mono text-xs tracking-widest text-zinc-300">
                    Client
                    {sortConfig.key === 'clientName' && (
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${
                          sortConfig.order === 'desc' ? 'rotate-180' : ''
                        }`}
                      />
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-4 text-right cursor-pointer hover:text-neon-cyan transition-colors"
                  onClick={() => handleSort('amount')}
                >
                  <div className="flex items-center justify-end gap-2 font-mono text-xs tracking-widest text-zinc-300">
                    Amount
                    {sortConfig.key === 'amount' && (
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${
                          sortConfig.order === 'desc' ? 'rotate-180' : ''
                        }`}
                      />
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-4 text-left cursor-pointer hover:text-neon-cyan transition-colors"
                  onClick={() => handleSort('invoiceDate')}
                >
                  <div className="flex items-center gap-2 font-mono text-xs tracking-widest text-zinc-300">
                    Date
                    {sortConfig.key === 'invoiceDate' && (
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${
                          sortConfig.order === 'desc' ? 'rotate-180' : ''
                        }`}
                      />
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-4 text-left cursor-pointer hover:text-neon-cyan transition-colors"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center gap-2 font-mono text-xs tracking-widest text-zinc-300">
                    Status
                    {sortConfig.key === 'status' && (
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${
                          sortConfig.order === 'desc' ? 'rotate-180' : ''
                        }`}
                      />
                    )}
                  </div>
                </th>
                <th className="px-6 py-4 text-center font-mono text-xs tracking-widest text-zinc-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <React.Fragment key={invoice.id}>
                  <tr
                    className="border-b border-zinc-800 hover:bg-zinc-900/30 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <button
                        title="Toggle invoice details"
                        onClick={() =>
                          setExpandedInvoiceId(
                            expandedInvoiceId === invoice.id ? null : invoice.id
                          )
                        }
                        className="text-neon-cyan hover:text-neon-cyan/70 transition-colors"
                      >
                        <ChevronDown
                          size={18}
                          className={`transition-transform ${
                            expandedInvoiceId === invoice.id ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm text-white font-bold block">{invoice.id}</span>
                      {(invoice.ticketNumber || invoice.ticketId) && (
                        <div className="mt-0.5">
                          {canManage ? (
                            <Link
                              to={`/admin/tickets?id=${encodeURIComponent(String(invoice.ticketId || invoice.ticketNumber || ''))}`}
                              className="inline-flex items-center text-[10px] font-mono text-neon-cyan hover:underline"
                              title="View associated repair ticket"
                            >
                              Ticket #{invoice.ticketNumber || invoice.ticketId}
                            </Link>
                          ) : (
                            <span className="text-[10px] font-mono text-zinc-500">
                              Ticket #{invoice.ticketNumber || invoice.ticketId}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-zinc-300">{invoice.clientName}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-mono text-sm font-bold text-neon-cyan">
                        ₹{invoice.amount.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-zinc-400 font-mono">
                        {new Date(invoice.invoiceDate).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <PaymentStatusBadge status={invoice.status} size="sm" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          title="Preview Canonical Bill"
                          onClick={() => setPreviewInvoiceId(invoice.id)}
                          className="text-cyan-400 hover:text-cyan-300 transition-colors p-2 hover:bg-zinc-800/50 rounded flex items-center"
                        >
                          <Eye size={16} />
                        </button>
                        <InvoiceShareMenu invoice={invoice} onDelete={canManage ? onDeleteInvoice : undefined} />
                        {(invoice.status === 'Sent' || invoice.status === 'Overdue') && (
                          <Link to={`/billing/pay/${invoice.id}`}
                            title="Pay Invoice Online"
                            className="text-green-400 hover:text-green-300 transition-colors p-2 hover:bg-zinc-800/50 rounded flex items-center gap-1"
                          >
                            <CreditCard size={16} />
                          </Link>
                        )}
                        {canManage && (
                        <button
                          title="Edit complete invoice details"
                          onClick={() => startEdit(invoice)}
                          className="
                            text-zinc-400 hover:text-neon-cyan transition-colors
                            p-2 hover:bg-zinc-800/50 rounded
                          "
                        >
                          <Edit2 size={16} />
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Row - Line Items */}
                  {expandedInvoiceId === invoice.id && (
                    <tr className="bg-zinc-900/40 border-b border-zinc-800">
                      <td colSpan={7} className="px-6 py-6">
                        <div className="space-y-4">
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-neon-cyan font-bold font-mono text-xs uppercase tracking-wider">
                                Line Items & Commercial Details ({invoice.lineItems?.length || 0})
                              </h4>
                              <span className="text-[11px] font-mono text-zinc-400">
                                Place of Supply: <strong className="text-white">{invoice.isInterstate ? 'Inter-State (IGST 18%)' : 'Intra-State (CGST 9% + SGST 9%)'}</strong>
                              </span>
                            </div>
                            <div className="space-y-2 bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                              {invoice.lineItems && invoice.lineItems.map((item, itemIdx) => {
                                const itemRate = item.taxRate !== undefined ? Number(item.taxRate) : ((item as any).tax_rate !== undefined ? Number((item as any).tax_rate) : 18);
                                const itemTaxAmt = item.taxAmount !== undefined ? Number(item.taxAmount) : ((item as any).tax_amount !== undefined ? Number((item as any).tax_amount) : Math.round((item.total * (itemRate / 100)) * 100) / 100);
                                const isInter = Boolean(invoice.isInterstate);
                                const halfRate = itemRate / 2;
                                const itemCgst = isInter ? 0 : Math.round((itemTaxAmt / 2) * 100) / 100;
                                const itemSgst = isInter ? 0 : Math.round((itemTaxAmt - itemCgst) * 100) / 100;

                                return (
                                  <div
                                    key={itemIdx}
                                    className="p-3 bg-zinc-900/50 border border-zinc-800/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                  >
                                    <div className="flex-1">
                                      <p className="font-mono text-zinc-200 text-sm font-semibold">{item.description}</p>
                                      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 font-mono mt-1">
                                        <span>SAC/HSN: <strong className="text-zinc-300">{item.hsnSac || (item as any).hsn_sac || '9987'}</strong></span>
                                        <span>•</span>
                                        <span>Qty: {item.quantity} × ₹{item.unitPrice.toFixed(2)}</span>
                                        <span>•</span>
                                        <span>Taxable: <strong className="text-zinc-300">₹{item.total.toFixed(2)}</strong></span>
                                      </div>
                                    </div>
                                    <div className="text-right font-mono">
                                      <p className="text-neon-cyan font-bold text-sm">
                                        ₹{(item.total + itemTaxAmt).toFixed(2)}
                                      </p>
                                      <p className="text-[10px] text-zinc-400">
                                        {isInter
                                          ? `IGST (${itemRate}%): ₹${itemTaxAmt.toFixed(2)}`
                                          : `CGST (${halfRate}%): ₹${itemCgst.toFixed(2)} + SGST (${halfRate}%): ₹${itemSgst.toFixed(2)}`}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Authoritative Financial & GST Breakdown Card */}
                            {(() => {
                              const subtotal = Number(invoice.subtotal !== null && invoice.subtotal !== undefined ? invoice.subtotal : invoice.amount);
                              const totalTax = Number(invoice.taxAmount !== undefined && invoice.taxAmount !== null ? invoice.taxAmount : (invoice.amount - subtotal));
                              const isInter = Boolean(invoice.isInterstate);
                              const cgst = isInter ? 0 : Number(invoice.cgstAmount !== undefined && invoice.cgstAmount !== null ? invoice.cgstAmount : Math.round((totalTax / 2) * 100) / 100);
                              const sgst = isInter ? 0 : Number(invoice.sgstAmount !== undefined && invoice.sgstAmount !== null ? invoice.sgstAmount : Math.round((totalTax - cgst) * 100) / 100);
                              const igst = isInter ? Number(invoice.igstAmount !== undefined && invoice.igstAmount !== null ? invoice.igstAmount : totalTax) : 0;

                              return (
                                <div className="mt-3 p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
                                  <div className="text-xs font-mono uppercase text-zinc-400 font-bold mb-3 flex items-center justify-between">
                                    <span>Financial & GST Breakdown</span>
                                    <span className="text-[10px] text-cyan-400 font-mono">
                                      {isInter ? '● Inter-State (IGST 18%)' : '● Intra-State Split (CGST 9% + SGST 9%)'}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
                                    <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
                                      <span className="text-zinc-500 block text-[10px] uppercase">Taxable Subtotal</span>
                                      <span className="text-white font-bold text-sm">₹{subtotal.toFixed(2)}</span>
                                    </div>

                                    {isInter ? (
                                      <div className="bg-amber-950/30 p-2.5 rounded-lg border border-amber-500/30">
                                        <span className="text-amber-400 block text-[10px] uppercase">IGST (18%)</span>
                                        <span className="text-amber-300 font-bold text-sm">₹{igst.toFixed(2)}</span>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="bg-cyan-950/30 p-2.5 rounded-lg border border-cyan-500/30">
                                          <span className="text-cyan-400 block text-[10px] uppercase">CGST (9.0%)</span>
                                          <span className="text-cyan-300 font-bold text-sm">₹{cgst.toFixed(2)}</span>
                                        </div>
                                        <div className="bg-cyan-950/30 p-2.5 rounded-lg border border-cyan-500/30">
                                          <span className="text-cyan-400 block text-[10px] uppercase">SGST (9.0%)</span>
                                          <span className="text-cyan-300 font-bold text-sm">₹{sgst.toFixed(2)}</span>
                                        </div>
                                      </>
                                    )}

                                    <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
                                      <span className="text-zinc-500 block text-[10px] uppercase">Total Tax (GST)</span>
                                      <span className="text-cyan-300 font-bold text-sm">₹{totalTax.toFixed(2)}</span>
                                    </div>

                                    <div className="bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-500/30">
                                      <span className="text-emerald-400 block text-[10px] uppercase font-bold">Total Payable</span>
                                      <span className="text-emerald-400 font-black text-sm">₹{invoice.amount.toFixed(2)}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          {invoice.notes && (
                            <div>
                              <p className="text-neon-cyan font-bold font-mono mb-2">NOTES:</p>
                              <p className="text-sm text-zinc-300 italic">{invoice.notes}</p>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-zinc-500 font-mono text-xs tracking-widest">
                                DUE_DATE
                              </p>
                              <p className="text-zinc-300 font-mono">
                                {new Date(invoice.dueDate).toLocaleDateString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-zinc-500 font-mono text-xs tracking-widest">
                                LAST_UPDATED
                              </p>
                              <p className="text-zinc-300 font-mono">
                                {new Date(invoice.updatedAt || invoice.lastUpdatedAt || invoice.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Edit Row - Complete Advanced Edit Form */}
                  {editingInvoiceId === invoice.id && (
                    <tr className="bg-blue-950/30 border-b border-blue-500/30">
                      <td colSpan={7} className="px-6 py-6">
                        <div className="space-y-6">
                          <h4 className="text-lg font-bold font-mono text-neon-cyan flex items-center gap-2 mb-4">
                            <Edit2 size={18} /> EDITING_INVOICE: {invoice.id}
                          </h4>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Custom Invoice ID (Draft only) */}
                            {invoice.status === 'Draft' && (
                              <div>
                                <label className="block font-mono text-xs text-amber-400 mb-1 uppercase tracking-wider">
                                  Custom Invoice Number (Draft Only)
                                </label>
                                <input
                                  type="text"
                                  value={editInvoiceNumber}
                                  onChange={e => setEditInvoiceNumber(e.target.value)}
                                  placeholder="e.g. TD/INV/2026/024"
                                  className="w-full bg-zinc-950 border border-amber-500/50 rounded px-3 py-2 font-mono text-sm text-white focus:outline-none focus:border-amber-400"
                                />
                                <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">
                                  Must be unique. Sequential invoice numbering will continue unaffected.
                                </span>
                              </div>
                            )}

                            {/* Client Field */}
                            <div>
                              <label className="block font-mono text-xs text-zinc-500 mb-1 uppercase tracking-wider">
                                Client Name
                              </label>
                              <input
                                type="text"
                                value={editClientName}
                                onChange={e => setEditClientName(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 font-sans text-sm text-white focus:outline-none focus:border-neon-cyan"
                              />
                            </div>

                            {/* Status Selector */}
                            <div>
                              <label className="block font-mono text-xs text-zinc-500 mb-1 uppercase tracking-wider">
                                Status
                              </label>
                              <select
                                value={editStatus}
                                onChange={e => setEditStatus(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 font-mono text-sm text-white focus:outline-none focus:border-neon-cyan"
                              >
                                {statusOptions.filter(opt => opt !== 'All' && opt !== 'Final').map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>

                            {/* Date Field */}
                            <div>
                              <label className="block font-mono text-xs text-zinc-500 mb-1 uppercase tracking-wider">
                                Invoice Date
                              </label>
                              <input
                                type="date"
                                value={editInvoiceDate}
                                onChange={e => setEditInvoiceDate(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 font-mono text-sm text-white focus:outline-none focus:border-neon-cyan"
                              />
                            </div>

                            {/* Due Date Field */}
                            <div>
                              <label className="block font-mono text-xs text-zinc-500 mb-1 uppercase tracking-wider">
                                Due Date
                              </label>
                              <input
                                type="date"
                                value={editDueDate}
                                onChange={e => setEditDueDate(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 font-mono text-sm text-white focus:outline-none focus:border-neon-cyan"
                              />
                            </div>

                            {/* Interstate Tax Toggle with State Place of Supply Badge */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 md:col-span-2 p-3.5 bg-zinc-950/80 border border-zinc-800 rounded-xl">
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  id={`interstate-${invoice.id}`}
                                  checked={editIsInterstate}
                                  onChange={e => setEditIsInterstate(e.target.checked)}
                                  className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-neon-cyan focus:ring-neon-cyan cursor-pointer"
                                />
                                <div>
                                  <label htmlFor={`interstate-${invoice.id}`} className="text-xs font-mono text-white font-bold cursor-pointer block">
                                    {editIsInterstate ? 'Inter-State Supply (IGST 18% Applicable)' : 'Intra-State Supply (CGST 9% + SGST 9% Applicable)'}
                                  </label>
                                  <span className="text-[10.5px] text-zinc-400 font-mono">
                                    {editIsInterstate 
                                      ? 'Client is outside Maharashtra ➔ Single IGST 18% applies.' 
                                      : 'Client is in Maharashtra ➔ Splits equally into CGST 9% + SGST 9%.'}
                                  </span>
                                </div>
                              </div>
                              <span className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider shrink-0 ${editIsInterstate ? 'bg-amber-950/60 border border-amber-500/40 text-amber-300' : 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-300'}`}>
                                {editIsInterstate ? 'Tax: IGST (18%)' : 'Tax: CGST (9%) + SGST (9%)'}
                              </span>
                            </div>
                          </div>

                          {/* Line Items List Editing */}
                          <div className="space-y-4 pt-4 border-t border-zinc-800">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-3">
                                <h5 className="font-mono text-xs uppercase tracking-widest text-zinc-400 font-bold">
                                  Line Items & GST Rates
                                </h5>
                                <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1">
                                  <span className="font-mono text-[10px] text-zinc-400 uppercase">Apply All:</span>
                                  {[0, 5, 12, 18, 28].map(rate => (
                                    <button
                                      key={rate}
                                      type="button"
                                      onClick={() => handleApplyGlobalTaxRate(rate)}
                                      title={editIsInterstate ? `Apply ${rate}% IGST` : `Apply ${rate}% (${rate / 2}% CGST + ${rate / 2}% SGST)`}
                                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition cursor-pointer ${
                                        rate === 18 
                                          ? 'bg-neon-cyan/20 border-neon-cyan/50 text-neon-cyan' 
                                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                                      }`}
                                    >
                                      {rate}% {rate === 18 ? (!editIsInterstate ? '(9+9)' : '(IGST)') : ''}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <select
                                  defaultValue=""
                                  onChange={e => {
                                    const selected = DEFAULT_CATALOG_ITEMS.find(c => c.description === e.target.value);
                                    if (selected) {
                                      addCatalogItem(selected);
                                      e.target.value = "";
                                    }
                                  }}
                                  className="bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[11px] rounded px-2 py-1 focus:outline-none focus:border-neon-cyan cursor-pointer"
                                  title="Add pre-configured service or part from catalog"
                                >
                                  <option value="" disabled>+ Add from Service Catalog...</option>
                                  {DEFAULT_CATALOG_ITEMS.map((cat, idx) => (
                                    <option key={idx} value={cat.description}>
                                      {cat.description} (₹{cat.unitPrice} | SAC: {cat.hsnSac})
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={addLineItem}
                                  className="text-neon-cyan hover:text-neon-cyan/80 flex items-center gap-1.5 font-mono text-xs font-bold uppercase transition-colors cursor-pointer"
                                >
                                  <Plus size={14} /> Custom Item
                                </button>
                              </div>
                            </div>

                            <div className="space-y-3 bg-zinc-950/60 p-4 border border-zinc-800/80 rounded-xl">
                              {editLineItems.map((item, index) => {
                                const itemQty = Math.max(1, Number(item.quantity) || 1);
                                const itemPrice = Math.max(0, Number(item.unitPrice) || 0);
                                const itemSubtotal = Math.round(itemQty * itemPrice * 100) / 100;
                                const itemTaxRate = item.taxRate !== undefined ? Number(item.taxRate) : 18;
                                const itemTaxAmount = item.taxAmount !== undefined ? item.taxAmount : Math.round((itemSubtotal * (itemTaxRate / 100)) * 100) / 100;
                                const itemCgst = editIsInterstate ? 0 : Math.round((itemTaxAmount / 2) * 100) / 100;
                                const itemSgst = editIsInterstate ? 0 : Math.round((itemTaxAmount - itemCgst) * 100) / 100;
                                const itemLineTotal = Math.round((itemSubtotal + itemTaxAmount) * 100) / 100;

                                return (
                                  <div key={index} className="p-3.5 bg-zinc-900/40 border border-zinc-800/80 rounded-xl space-y-2.5">
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                                      <div className="md:col-span-4">
                                        <label className="block font-mono text-[10px] text-zinc-500 mb-1 uppercase">
                                          Description
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
                                            HSN / SAC
                                          </label>
                                          <select
                                            className="bg-transparent text-[9px] font-mono text-neon-cyan cursor-pointer focus:outline-none"
                                            value=""
                                            onChange={e => {
                                              if (e.target.value) handleLineItemChange(index, 'hsnSac', e.target.value);
                                            }}
                                            title="Quick SAC preset"
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
                                          value={item.hsnSac || '9987'}
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
                                          value={itemTaxRate}
                                          onChange={e => handleLineItemChange(index, 'taxRate', Number(e.target.value))}
                                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs font-mono text-white text-center focus:outline-none focus:border-neon-cyan"
                                        />
                                      </div>

                                      <div className="md:col-span-2 flex items-center justify-between gap-2">
                                        <div className="text-right flex-grow">
                                          <p className="font-mono text-[9px] text-zinc-500 uppercase">Item Total (Inc. Tax)</p>
                                          <p className="font-mono text-xs font-bold text-neon-cyan">
                                            ₹{itemLineTotal.toFixed(2)}
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => removeLineItem(index)}
                                          className="text-red-400 hover:text-red-300 p-1.5 hover:bg-red-950/40 rounded transition-colors cursor-pointer"
                                          title="Remove item"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Item-Level Live GST Split Strip */}
                                    <div className="flex flex-wrap items-center justify-between text-[10px] font-mono bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800/70 text-zinc-400">
                                      <div>
                                        Taxable Subtotal: <strong className="text-white">₹{itemSubtotal.toFixed(2)}</strong>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {editIsInterstate ? (
                                          <span>IGST ({itemTaxRate}%): <strong className="text-amber-400">₹{itemTaxAmount.toFixed(2)}</strong></span>
                                        ) : (
                                          <>
                                            <span>CGST ({(itemTaxRate / 2).toFixed(1)}%): <strong className="text-neon-cyan">₹{itemCgst.toFixed(2)}</strong></span>
                                            <span>+</span>
                                            <span>SGST ({(itemTaxRate / 2).toFixed(1)}%): <strong className="text-neon-cyan">₹{itemSgst.toFixed(2)}</strong></span>
                                            <span className="text-zinc-600">•</span>
                                            <span>Tax: <strong className="text-cyan-300">₹{itemTaxAmount.toFixed(2)}</strong></span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Authoritative Live Totals Breakdown */}
                            {(() => {
                              const subtotal = editLineItems.reduce((sum, item) => sum + item.total, 0);
                              const totalGst = editLineItems.reduce((sum, item) => sum + (item.taxAmount || (item.total * (item.taxRate !== undefined ? item.taxRate : 18) / 100)), 0);
                              const cgstTotal = editIsInterstate ? 0 : Math.round((totalGst / 2) * 100) / 100;
                              const sgstTotal = editIsInterstate ? 0 : Math.round((totalGst - cgstTotal) * 100) / 100;
                              const igstTotal = editIsInterstate ? totalGst : 0;
                              const grandTotal = Math.round((subtotal + totalGst) * 100) / 100;
                              const effectiveRate = subtotal > 0 ? Math.round((totalGst / subtotal) * 10000) / 100 : 18;

                              return (
                                <div className="p-4 bg-zinc-900/90 border border-zinc-800 rounded-2xl grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono items-center">
                                  <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
                                    <span className="text-zinc-500 block text-[10px] uppercase">Taxable Subtotal</span>
                                    <span className="text-white font-bold text-sm">
                                      ₹{subtotal.toFixed(2)}
                                    </span>
                                  </div>

                                  {editIsInterstate ? (
                                    <div className="bg-amber-950/30 p-2.5 rounded-xl border border-amber-500/30">
                                      <span className="text-amber-400 block text-[10px] uppercase">IGST ({effectiveRate.toFixed(1)}%)</span>
                                      <span className="text-amber-300 font-bold text-sm">
                                        ₹{igstTotal.toFixed(2)}
                                      </span>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="bg-cyan-950/30 p-2.5 rounded-xl border border-cyan-500/30">
                                        <span className="text-cyan-400 block text-[10px] uppercase">CGST ({(effectiveRate / 2).toFixed(1)}%)</span>
                                        <span className="text-neon-cyan font-bold text-sm">
                                          ₹{cgstTotal.toFixed(2)}
                                        </span>
                                      </div>
                                      <div className="bg-cyan-950/30 p-2.5 rounded-xl border border-cyan-500/30">
                                        <span className="text-cyan-400 block text-[10px] uppercase">SGST ({(effectiveRate / 2).toFixed(1)}%)</span>
                                        <span className="text-neon-cyan font-bold text-sm">
                                          ₹{sgstTotal.toFixed(2)}
                                        </span>
                                      </div>
                                    </>
                                  )}

                                  <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
                                    <span className="text-zinc-500 block text-[10px] uppercase">Total Tax (GST)</span>
                                    <span className="text-cyan-300 font-bold text-sm">
                                      ₹{totalGst.toFixed(2)}
                                    </span>
                                  </div>

                                  <div className="bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-500/30">
                                    <span className="text-emerald-400 block text-[10px] uppercase font-bold">Grand Total</span>
                                    <span className="text-emerald-400 font-black text-base">
                                      ₹{grandTotal.toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="flex items-center justify-end gap-2 pt-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  await handleFullInvoiceUpdate(invoice.id);
                                  setPreviewInvoiceId(editInvoiceNumber.trim() || invoice.id);
                                }}
                                className="px-3.5 py-2 rounded-lg bg-cyan-950/80 border border-cyan-500/40 hover:bg-cyan-900/50 text-cyan-300 font-bold text-xs uppercase font-mono tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                              >
                                <Eye size={14} /> Preview Canonical Bill
                              </button>
                              {invoice.status === 'Draft' && onFinalizeInvoice && (
                                <button
                                  type="button"
                                  disabled={Boolean(finalizingInvoiceId)}
                                  onClick={() => {
                                    setInvoiceToFinalize({
                                      id: invoice.id,
                                      targetId: editInvoiceNumber.trim() || invoice.id,
                                    });
                                  }}
                                  className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs uppercase font-mono tracking-wider transition-all cursor-pointer disabled:opacity-50"
                                >
                                  {finalizingInvoiceId === invoice.id ? 'Finalizing & Releasing...' : 'Finalize & Release'}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Notes Field */}
                          <div className="pt-4 border-t border-zinc-800">
                            <label className="block font-mono text-xs text-zinc-500 mb-1 uppercase tracking-wider">
                              Notes
                            </label>
                            <textarea
                              value={editNotes}
                              onChange={e => setEditNotes(e.target.value)}
                              rows={2}
                              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 font-sans text-sm text-white focus:outline-none focus:border-neon-cyan"
                            />
                          </div>

                          {/* Action Form Footer */}
                          <div className="flex gap-4 items-center justify-end pt-4 border-t border-zinc-800">
                            <button
                              onClick={() => setEditingInvoiceId(null)}
                              className="bg-red-900/40 border border-red-500 text-red-400 px-4 py-2 rounded flex items-center gap-1.5 hover:bg-red-900 transition-colors font-mono text-xs font-bold uppercase cursor-pointer"
                            >
                              <X size={16} /> Cancel
                            </button>

                            <button
                              onClick={() => handleFullInvoiceUpdate(invoice.id)}
                              className="bg-green-900/40 border border-green-500 text-green-400 px-4 py-2 rounded flex items-center gap-1.5 hover:bg-green-900 transition-colors font-mono text-xs font-bold uppercase cursor-pointer"
                            >
                              <Check size={16} /> Save Changes
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {previewInvoiceId && (
        <PaymentReceiptModal
          isOpen={!!previewInvoiceId}
          onClose={() => setPreviewInvoiceId(null)}
          invoiceId={previewInvoiceId}
        />
      )}

      <ConfirmModal
        isOpen={Boolean(invoiceToFinalize)}
        title="Finalize Commercial Invoice"
        message={`Finalize invoice ${invoiceToFinalize?.targetId || invoiceToFinalize?.id}? Once finalized, it becomes the authoritative commercial invoice and releases it to the customer.`}
        confirmText={finalizingInvoiceId ? "Finalizing..." : "Finalize & Release"}
        cancelText="Cancel"
        variant="primary"
        isLoading={Boolean(finalizingInvoiceId)}
        onConfirm={handleConfirmFinalize}
        onCancel={() => {
          if (!finalizingInvoiceId) {
            setInvoiceToFinalize(null);
          }
        }}
      />
    </div>
  );
}
