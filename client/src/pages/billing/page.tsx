'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import InvoiceHeader from './components/InvoiceHeader';
import InvoiceTable from './components/InvoiceTable';
import { CreateInvoiceModal } from './components/CreateInvoiceModal';
import { AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { billingApi } from '@/services/api';
import type { Invoice } from '@/services/api';
import { useSiteContext } from '../../context/SiteContext';
import { SkeletonMetrics } from '@/components/Skeleton';

export default function BillingPage() {
  const { token, user, isAuthenticated } = useAuth();
  const { flattenedSettings } = useSiteContext();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const navState = location.state as { selectedInvoiceId?: string; status?: string } | null;
  const targetInvoiceId = searchParams.get('invoiceId') || navState?.selectedInvoiceId || null;
  const targetStatus = searchParams.get('status') || navState?.status || null;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Invoice listing requires authentication — skip the API call for guests
      if (!isAuthenticated) {
        setInvoices([]);
        setLoading(false);
        return;
      }

      const targetUserId = user?.role === 'admin' ? undefined : (isAuthenticated && user?.id ? user.id.toString() : undefined);
      const res = await billingApi.getInvoices(token, targetUserId);
      if (res.ok && res.data) {
        setInvoices(Array.isArray(res.data) ? res.data : (res.data.data || []));
      } else {
        setError(res.error || 'Failed to load invoices');
      }
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while fetching invoices');
    } finally {
      setLoading(false);
    }
  }, [token, isAuthenticated, user?.id, user?.role]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleStatusChange = async (invoiceId: string, newStatus: string) => {
    try {
      const current = invoices.find(inv => inv.id === invoiceId);
      if (!current) {
        toast.error('Invoice not found.');
        return;
      }
      const payload: Partial<Invoice> = {
        clientName: current.clientName,
        userId: current.userId,
        amount: current.amount,
        currency: current.currency,
        invoiceDate: current.invoiceDate,
        dueDate: current.dueDate,
        lineItems: current.lineItems,
        notes: current.notes,
        status: newStatus as any,
      };
      const res = await billingApi.updateInvoice(token, invoiceId, payload);
      if (res.ok) {
        setInvoices(prev => prev.map(inv => (inv.id === invoiceId ? { ...inv, status: newStatus } : inv)));
        toast.success(`Invoice status updated to ${newStatus}.`);
      } else {
        toast.error(res.error || 'Failed to update invoice status');
        throw new Error(res.error || 'Failed to update invoice status');
      }
    } catch (err) {
      console.error('Error updating status:', err);
      throw err;
    }
  };

  const handleUpdateInvoice = async (invoiceId: string, updateData: Partial<Invoice>) => {
    try {
      const current = invoices.find(inv => inv.id === invoiceId);
      if (!current) {
        toast.error('Invoice not found.');
        return;
      }
      // Backend requires the full invoice payload (clientName, userId, amount,
      // invoiceDate, dueDate, lineItems) — merge the edited fields with the
      // server record so validation passes.
      const payload: Partial<Invoice> = {
        ...updateData,
        userId: current.userId,
        clientName: updateData.clientName ?? current.clientName,
        amount: updateData.amount ?? current.amount,
        invoiceDate: updateData.invoiceDate ?? current.invoiceDate,
        dueDate: updateData.dueDate ?? current.dueDate,
        lineItems: updateData.lineItems ?? current.lineItems,
      };
      const res = await billingApi.updateInvoice(token, invoiceId, payload);
      if (res.ok) {
        toast.success(`Invoice ${invoiceId} updated successfully.`);
        await fetchInvoices();
      } else {
        toast.error(res.error || 'Failed to update invoice');
        throw new Error(res.error || 'Failed to update invoice');
      }
    } catch (err) {
      console.error('Error updating invoice:', err);
      throw err;
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    try {
      const res = await billingApi.deleteInvoice(token, invoiceId);
      if (res.ok) {
        setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
      } else {
        throw new Error(res.error || 'Failed to delete invoice');
      }
    } catch (err) {
      console.error('Error deleting invoice:', err);
      throw err;
    }
  };

  const handleFinalizeInvoice = async (invoiceId: string) => {
    try {
      const res = await billingApi.finalizeInvoice(token, invoiceId);
      if (res.ok) {
        toast.success(`Invoice ${invoiceId} finalized successfully.`);
        await fetchInvoices();
      } else {
        toast.error(res.error || 'Failed to finalize invoice');
        throw new Error(res.error || 'Failed to finalize invoice');
      }
    } catch (err) {
      console.error('Error finalizing invoice:', err);
      throw err;
    }
  };

  const totalInvoices = invoices.length;
  const totalBilled = invoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
  const totalPaid = invoices
    .filter(inv => inv.status === 'Paid')
    .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
  const totalPending = invoices
    .filter(inv => inv.status !== 'Paid' && inv.status !== 'Void')
    .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
  const totalGst = invoices
    .reduce((sum, inv) => sum + Number(inv.taxAmount || 0), 0);

  return (
    <div className="min-h-screen bg-black text-white py-12">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        {loading ? (
          <div className="mb-8">
            <SkeletonMetrics count={4} />
          </div>
        ) : (
          <InvoiceHeader
            totalInvoices={totalInvoices}
            totalBilled={totalBilled}
            totalPaid={totalPaid}
            totalPending={totalPending}
            totalGst={totalGst}
            canCreate={isAuthenticated && user?.role === 'admin'}
            onCreateClick={() => setShowCreateModal(true)}
          />
        )}

        {/* Auth Notice */}
        {!isAuthenticated && (
          <div className="mb-6 bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-4 flex gap-3">
            <AlertCircle className="text-yellow-400 shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-yellow-300">
              <p className="font-semibold mb-1">Viewing All Invoices</p>
              <p className="text-yellow-200/70">
                Sign in to view only your invoices and manage them directly.
              </p>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-900/20 border border-red-500/50 rounded-lg p-4 flex gap-3">
            <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-sm text-red-300 font-semibold">{error}</p>
              <button
                onClick={fetchInvoices}
                className="text-xs text-red-400 hover:text-red-300 mt-2 underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Invoice Table */}
        {!error && (
          <div className="border border-neon-cyan/20 rounded-lg p-6 bg-zinc-950/50">
            <InvoiceTable
              invoices={invoices}
              onStatusChange={handleStatusChange}
              onUpdateInvoice={handleUpdateInvoice}
              onFinalizeInvoice={handleFinalizeInvoice}
              onDeleteInvoice={handleDeleteInvoice}
              canManage={isAuthenticated && user?.role === 'admin'}
              isLoading={loading}
              initialSelectedInvoiceId={targetInvoiceId}
              initialFilterStatus={targetStatus}
            />
          </div>
        )}

        {/* Empty State */}
        {!loading && invoices.length === 0 && !error && (
          <div className="text-center py-12">
            <p className="text-zinc-400 font-mono mb-4">NO_INVOICES_FOUND</p>
            <p className="text-sm text-zinc-500">
              {isAuthenticated
                ? 'You don\'t have any invoices yet.'
                : 'No invoices are available at this time.'}
            </p>
          </div>
        )}

        {/* Create Commercial Invoice Modal */}
        <CreateInvoiceModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          token={token}
          currentUserId={user?.id}
          onInvoiceCreated={fetchInvoices}
        />
      </div>
    </div>
  );
}
