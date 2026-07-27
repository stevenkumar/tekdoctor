'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import InvoiceHeader from './components/InvoiceHeader';
import InvoiceTable from './components/InvoiceTable';
import { AlertCircle } from 'lucide-react';
import { billingApi } from '@/services/api';
import type { Invoice } from '@/services/api';
import { useSiteContext } from '../../context/SiteContext';

export default function BillingPage() {
  const { user, isAuthenticated } = useAuth();
  const { flattenedSettings } = useSiteContext();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // If user is authenticated, filter by userId, otherwise get all
      const data = await billingApi.getInvoices(isAuthenticated ? user?.id?.toString() : undefined);
      setInvoices(data);
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while fetching invoices');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleStatusChange = async (invoiceId: string, newStatus: string) => {
    try {
      const updatedInvoice = await billingApi.updateInvoice(invoiceId, { status: newStatus });

      // Update local state
      setInvoices(prev =>
        prev.map(inv => (inv.id === invoiceId ? updatedInvoice : inv))
      );
    } catch (err) {
      console.error('Error updating status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update invoice status');
    }
  };

  const handleUpdateInvoice = async (invoiceId: string, updateData: Partial<Invoice>) => {
    try {
      const updatedInvoice = await billingApi.updateInvoice(invoiceId, updateData);

      // Update local state
      setInvoices(prev =>
        prev.map(inv => (inv.id === invoiceId ? updatedInvoice : inv))
      );
    } catch (err) {
      console.error('Error updating invoice:', err);
      setError(err instanceof Error ? err.message : 'Failed to update invoice');
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    try {
      await billingApi.deleteInvoice(invoiceId);

      // Update local state
      setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
    } catch (err) {
      console.error('Error deleting invoice:', err);
      throw err;
    }
  };

  const totalInvoices = invoices.length;
  const totalRevenue = invoices
    .filter(inv => inv.status === 'Paid')
    .reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div className="min-h-screen bg-black text-white py-12">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <InvoiceHeader totalInvoices={totalInvoices} totalRevenue={totalRevenue} />

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
              onDeleteInvoice={handleDeleteInvoice}
              isLoading={loading}
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

        {/* Footer Info */}
        <div className="mt-12 text-center text-xs text-zinc-600 font-mono">
          <p>BILLING_SYSTEM • INVOICE_MANAGEMENT_v1.0</p>
          <p className="mt-2">© {new Date().getFullYear()} {flattenedSettings.company_name || 'TekDoctor'}. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
