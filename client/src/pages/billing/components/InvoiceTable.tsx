'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, Edit2, Check, X, Plus, Trash2, CreditCard, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import PaymentStatusBadge from './PaymentStatusBadge';
import InvoiceShareMenu from './InvoiceShareMenu';
import { PaymentReceiptModal } from '@/components/PaymentReceiptModal';

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
  originalEstimate?: number;
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

  const handleFullInvoiceUpdate = async (invoiceId: string) => {
    try {
      if (!onUpdateInvoice) return;

      const current = invoices.find(inv => inv.id === invoiceId);
      if (!current) {
        console.error('Invoice not found for update:', invoiceId);
        return;
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
    } catch (error) {
      console.error('Failed to update invoice details:', error);
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
                            <h4 className="text-neon-cyan font-bold font-mono mb-3">
                              LINE_ITEMS:
                            </h4>
                            <div className="space-y-2 bg-zinc-950 border border-zinc-800 rounded p-4">
                              {invoice.lineItems && invoice.lineItems.map((item, itemIdx) => (
                                <div
                                  key={itemIdx}
                                  className="flex justify-between text-sm text-zinc-300 pb-2 border-b border-zinc-800 last:border-b-0"
                                >
                                  <div className="flex-1">
                                    <p className="font-mono text-zinc-200">{item.description}</p>
                                      <p className="text-xs text-zinc-500">
                                        Qty: {item.quantity} × ₹{item.unitPrice.toFixed(2)}
                                      </p>
                                    </div>
                                    <p className="font-mono text-neon-cyan font-bold ml-4">
                                      ₹{item.total.toFixed(2)}
                                    </p>
                                </div>
                              ))}
                            </div>
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

                            {/* Interstate Tax Toggle */}
                            <div className="flex items-center gap-2 md:col-span-2 pt-2">
                              <input
                                type="checkbox"
                                id={`interstate-${invoice.id}`}
                                checked={editIsInterstate}
                                onChange={e => setEditIsInterstate(e.target.checked)}
                                className="w-4 h-4 rounded bg-zinc-950 border-zinc-700 text-neon-cyan focus:ring-neon-cyan cursor-pointer"
                              />
                              <label htmlFor={`interstate-${invoice.id}`} className="text-xs font-mono text-zinc-300 cursor-pointer">
                                Inter-State Transaction (Apply IGST instead of CGST + SGST)
                              </label>
                            </div>
                          </div>

                          {/* Line Items List Editing */}
                          <div className="space-y-4 pt-4 border-t border-zinc-800">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-3">
                                <h5 className="font-mono text-xs uppercase tracking-widest text-zinc-400">
                                  Line Items & Item-Level Taxes
                                </h5>
                                <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded px-2 py-1">
                                  <span className="font-mono text-[10px] text-zinc-400 uppercase">Apply GST:</span>
                                  {[0, 5, 12, 18, 28].map(rate => (
                                    <button
                                      key={rate}
                                      type="button"
                                      onClick={() => handleApplyGlobalTaxRate(rate)}
                                      className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 hover:bg-neon-cyan/20 text-zinc-300 hover:text-neon-cyan border border-zinc-700 transition cursor-pointer"
                                    >
                                      {rate}%
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
                                  <option value="" disabled>+ Add from Catalog...</option>
                                  {DEFAULT_CATALOG_ITEMS.map((cat, idx) => (
                                    <option key={idx} value={cat.description}>
                                      {cat.description} (₹{cat.unitPrice})
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

                            <div className="space-y-3 bg-zinc-950/40 p-4 border border-zinc-800/80 rounded-xl">
                              {editLineItems.map((item, index) => (
                                <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border-b border-zinc-800/60 pb-3 last:border-0 last:pb-0">
                                  <div className="md:col-span-4">
                                    <label className="block font-mono text-[10px] text-zinc-600 mb-1 uppercase">
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
                                    <label className="block font-mono text-[10px] text-zinc-600 mb-1 uppercase">
                                      HSN/SAC
                                    </label>
                                    <input
                                      type="text"
                                      value={item.hsnSac || '9987'}
                                      onChange={e => handleLineItemChange(index, 'hsnSac', e.target.value)}
                                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-neon-cyan"
                                    />
                                  </div>

                                  <div className="md:col-span-1">
                                    <label className="block font-mono text-[10px] text-zinc-600 mb-1 uppercase">
                                      Qty
                                    </label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={item.quantity}
                                      onChange={e => handleLineItemChange(index, 'quantity', Number(e.target.value))}
                                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-neon-cyan"
                                    />
                                  </div>

                                  <div className="md:col-span-2">
                                    <label className="block font-mono text-[10px] text-zinc-600 mb-1 uppercase">
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
                                    <label className="block font-mono text-[10px] text-zinc-600 mb-1 uppercase">
                                      GST %
                                    </label>
                                    <input
                                      type="number"
                                      step="1"
                                      min="0"
                                      max="28"
                                      value={item.taxRate !== undefined ? item.taxRate : 18}
                                      onChange={e => handleLineItemChange(index, 'taxRate', Number(e.target.value))}
                                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-neon-cyan"
                                    />
                                  </div>

                                  <div className="md:col-span-2 flex items-center justify-between gap-2">
                                    <div className="text-right flex-grow">
                                      <p className="font-mono text-[9px] text-zinc-600 uppercase">Amount + Tax</p>
                                      <p className="font-mono text-xs font-bold text-neon-cyan">
                                        ₹{((item.total || 0) + (item.taxAmount || ((item.total || 0) * (item.taxRate !== undefined ? item.taxRate : 18) / 100))).toFixed(2)}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => removeLineItem(index)}
                                      className="text-red-400 hover:text-red-300 p-1.5 hover:bg-red-950/40 rounded transition-colors cursor-pointer"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Authoritative Live Totals Breakdown */}
                            <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                              <div>
                                <span className="text-zinc-500 block text-[10px] uppercase">Subtotal</span>
                                <span className="text-white font-bold">
                                  ₹{editLineItems.reduce((sum, item) => sum + item.total, 0).toFixed(2)}
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-500 block text-[10px] uppercase">
                                  {editIsInterstate ? 'IGST' : 'CGST + SGST'}
                                </span>
                                <span className="text-neon-cyan font-bold">
                                  ₹{editLineItems.reduce((sum, item) => sum + (item.taxAmount || (item.total * (item.taxRate !== undefined ? item.taxRate : 18) / 100)), 0).toFixed(2)}
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-500 block text-[10px] uppercase">Grand Total</span>
                                <span className="text-emerald-400 font-bold text-sm">
                                  ₹{(editLineItems.reduce((sum, item) => sum + item.total, 0) + editLineItems.reduce((sum, item) => sum + (item.taxAmount || (item.total * (item.taxRate !== undefined ? item.taxRate : 18) / 100)), 0)).toFixed(2)}
                                </span>
                              </div>
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await handleFullInvoiceUpdate(invoice.id);
                                    setPreviewInvoiceId(editInvoiceNumber.trim() || invoice.id);
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-cyan-950/80 border border-cyan-500/40 hover:bg-cyan-900/50 text-cyan-300 font-bold text-xs uppercase font-mono tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                                >
                                  <Eye size={14} /> Preview Bill
                                </button>
                                {invoice.status === 'Draft' && onFinalizeInvoice && (
                                  <button
                                    type="button"
                                    disabled={finalizingInvoiceId === invoice.id}
                                    onClick={async () => {
                                      if (window.confirm(`Finalize invoice ${invoice.id}? Once finalized, it becomes the authoritative commercial invoice and releases it to the customer.`)) {
                                        setFinalizingInvoiceId(invoice.id);
                                        try {
                                          await handleFullInvoiceUpdate(invoice.id);
                                          await onFinalizeInvoice(editInvoiceNumber.trim() || invoice.id);
                                        } finally {
                                          setFinalizingInvoiceId(null);
                                        }
                                      }
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs uppercase font-mono tracking-wider transition-all cursor-pointer disabled:opacity-50"
                                  >
                                    {finalizingInvoiceId === invoice.id ? 'Finalizing & Releasing...' : 'Finalize & Release'}
                                  </button>
                                )}
                              </div>
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
    </div>
  );
}
