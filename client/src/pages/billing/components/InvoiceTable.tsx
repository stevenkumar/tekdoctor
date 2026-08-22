'use client';

import React, { useState } from 'react';
import { ChevronDown, Edit2, Check, X, Plus, Trash2, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import PaymentStatusBadge from './PaymentStatusBadge';
import InvoiceShareMenu from './InvoiceShareMenu';

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

interface InvoiceTableProps {
  invoices: Invoice[];
  onStatusChange: (invoiceId: string, newStatus: string) => Promise<void>;
  onUpdateInvoice?: (invoiceId: string, updateData: Partial<Invoice>) => Promise<void>;
  onDeleteInvoice?: (invoiceId: string) => Promise<void>;
  isLoading?: boolean;
}

type SortKey = 'id' | 'clientName' | 'amount' | 'invoiceDate' | 'dueDate' | 'status';
type SortOrder = 'asc' | 'desc';

export default function InvoiceTable({ invoices, onStatusChange, onUpdateInvoice, onDeleteInvoice, isLoading = false }: InvoiceTableProps) {
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  // Expanded form states
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
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const statusOptions = ['All', 'Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'];

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      order: prev.key === key && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  let filteredInvoices = [...invoices];

  // Apply search filter
  if (searchTerm) {
    filteredInvoices = filteredInvoices.filter(inv =>
      inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.clientName.toLowerCase().includes(searchTerm.toLowerCase())
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
    setEditClientName(invoice.clientName || '');
    setEditInvoiceDate(invoice.invoiceDate ? invoice.invoiceDate.split('T')[0] : '');
    setEditDueDate(invoice.dueDate ? invoice.dueDate.split('T')[0] : '');
    setEditStatus(invoice.status || 'Draft');
    setEditCurrency(invoice.currency || 'USD');
    setEditNotes(invoice.notes || '');
    setEditLineItems([...(invoice.lineItems || [])]);
  };

  const handleLineItemChange = (index: number, field: keyof LineItem, value: string | number) => {
    const updatedItems = editLineItems.map((item, idx) => {
      if (idx !== index) return item;
      const updatedItem = { ...item, [field]: value };
      
      // Auto-compute total
      if (field === 'quantity' || field === 'unitPrice') {
        const qty = field === 'quantity' ? Number(value) : Number(item.quantity);
        const price = field === 'unitPrice' ? Number(value) : Number(item.unitPrice);
        updatedItem.total = qty * price;
      }
      return updatedItem;
    });
    setEditLineItems(updatedItems);
  };

  const addLineItem = () => {
    setEditLineItems([
      ...editLineItems,
      { description: 'New Service Item', quantity: 1, unitPrice: 0, total: 0 }
    ]);
  };

  const removeLineItem = (index: number) => {
    setEditLineItems(editLineItems.filter((_, idx) => idx !== index));
  };

  const handleFullInvoiceUpdate = async (invoiceId: string) => {
    try {
      if (!onUpdateInvoice) return;
      
      // Calculate final total
      const finalAmount = editLineItems.reduce((sum, item) => sum + item.total, 0);

      const updateData: Partial<Invoice> = {
        clientName: editClientName,
        invoiceDate: editInvoiceDate ? new Date(editInvoiceDate).toISOString() : undefined,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : undefined,
        status: editStatus,
        currency: editCurrency,
        notes: editNotes,
        amount: finalAmount,
        lineItems: editLineItems,
      };

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
                      <span className="font-mono text-sm text-white font-bold">{invoice.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-zinc-300">{invoice.clientName}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-mono text-sm font-bold text-neon-cyan">
                        ${invoice.amount.toFixed(2)}
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
                        <InvoiceShareMenu invoice={invoice} onDelete={onDeleteInvoice} />
                        {(invoice.status === 'Sent' || invoice.status === 'Overdue' || invoice.status === 'Draft') && (
                          <Link to={`/billing/pay/${invoice.id}`}
                            title="Pay Invoice Online"
                            className="text-green-400 hover:text-green-300 transition-colors p-2 hover:bg-zinc-800/50 rounded flex items-center gap-1"
                          >
                            <CreditCard size={16} />
                          </Link>
                        )}
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
                                      Qty: {item.quantity} × ${item.unitPrice.toFixed(2)}
                                    </p>
                                  </div>
                                  <p className="font-mono text-neon-cyan font-bold ml-4">
                                    ${item.total.toFixed(2)}
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
                                {new Date(invoice.lastUpdatedAt).toLocaleDateString()}
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
                                {statusOptions.filter(opt => opt !== 'All').map(opt => (
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
                          </div>

                          {/* Line Items List Editing */}
                          <div className="space-y-4 pt-4 border-t border-zinc-800">
                            <div className="flex items-center justify-between">
                              <h5 className="font-mono text-xs uppercase tracking-widest text-zinc-400">
                                Line Items
                              </h5>
                              <button
                                onClick={addLineItem}
                                className="text-neon-cyan hover:text-neon-cyan flex items-center gap-1.5 font-mono text-xs font-bold uppercase transition-colors"
                              >
                                <Plus size={14} /> Add Item
                              </button>
                            </div>

                            <div className="space-y-3 bg-zinc-950/40 p-4 border border-zinc-800/80 rounded-xl">
                              {editLineItems.map((item, index) => (
                                <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border-b border-zinc-800/60 pb-3 last:border-0 last:pb-0">
                                  <div className="md:col-span-6">
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
                                      Quantity
                                    </label>
                                    <input
                                      type="number"
                                      value={item.quantity}
                                      onChange={e => handleLineItemChange(index, 'quantity', Number(e.target.value))}
                                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-neon-cyan"
                                    />
                                  </div>

                                  <div className="md:col-span-2">
                                    <label className="block font-mono text-[10px] text-zinc-600 mb-1 uppercase">
                                      Unit Price ($)
                                    </label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={item.unitPrice}
                                      onChange={e => handleLineItemChange(index, 'unitPrice', Number(e.target.value))}
                                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-neon-cyan"
                                    />
                                  </div>

                                  <div className="md:col-span-2 flex items-center justify-between gap-2">
                                    <div className="text-right flex-grow">
                                      <p className="font-mono text-[9px] text-zinc-600 uppercase">Total</p>
                                      <p className="font-mono text-xs font-bold text-neon-cyan">
                                        ${Number(item.total).toFixed(2)}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => removeLineItem(index)}
                                      className="text-red-400 hover:text-red-300 p-1.5 hover:bg-red-950/40 rounded transition-colors"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                              ))}
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
                              className="bg-red-900/40 border border-red-500 text-red-400 px-4 py-2 rounded flex items-center gap-1.5 hover:bg-red-900 transition-colors font-mono text-xs font-bold uppercase"
                            >
                              <X size={16} /> Cancel
                            </button>

                            <button
                              onClick={() => handleFullInvoiceUpdate(invoice.id)}
                              className="bg-green-900/40 border border-green-500 text-green-400 px-4 py-2 rounded flex items-center gap-1.5 hover:bg-green-900 transition-colors font-mono text-xs font-bold uppercase"
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
    </div>
  );
}
