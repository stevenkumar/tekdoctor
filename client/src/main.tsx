import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import initialInvoices from './data/invoices.json'
import { STORAGE_KEYS } from './config/storage'

// Global Fetch Interceptor for LocalStorage billing APIs
const originalFetch = window.fetch;
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  const urlString = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
  
  // Intercept billing API calls
  if (urlString.includes('/api/billing/')) {
    const getInvoices = () => {
      const stored = localStorage.getItem(STORAGE_KEYS.INVOICES);
      if (!stored) {
        localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(initialInvoices));
        return initialInvoices;
      }
      return JSON.parse(stored);
    };

    const saveInvoices = (data: any[]) => {
      localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(data));
    };

    try {
      const parsedUrl = new URL(urlString, window.location.origin);
      const pathname = parsedUrl.pathname;
      const method = init?.method?.toUpperCase() || 'GET';
      const body = init?.body ? JSON.parse(init.body as string) : null;

      // Match POST /api/billing/pay
      if (pathname === '/api/billing/pay' && method === 'POST') {
        const { invoiceId } = body || {};
        const invoices = getInvoices();
        const index = invoices.findIndex((inv: any) => inv.id === invoiceId);
        
        if (index === -1) {
          return new Response(JSON.stringify({ error: 'Invoice not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 1500));

        invoices[index] = {
          ...invoices[index],
          status: 'Paid',
          lastUpdatedAt: new Date().toISOString()
        };
        saveInvoices(invoices);

        return new Response(JSON.stringify({
          success: true,
          message: 'Payment processed successfully',
          invoice: invoices[index]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Match GET or POST /api/billing/invoices
      if (pathname === '/api/billing/invoices') {
        const invoices = getInvoices();

        if (method === 'GET') {
          const userId = parsedUrl.searchParams.get('userId');
          const status = parsedUrl.searchParams.get('status');
          let filtered = [...invoices];

          if (userId) {
            filtered = filtered.filter((inv: any) => inv.userId === userId);
          }
          if (status) {
            filtered = filtered.filter((inv: any) => inv.status === status);
          }

          filtered.sort((a: any, b: any) => 
            new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime()
          );

          return new Response(JSON.stringify(filtered), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        if (method === 'POST') {
          const invoices = getInvoices();
          const maxId = invoices.reduce((max: number, inv: any) => {
            const num = parseInt(inv.id.split('-')[1], 10);
            return num > max ? num : max;
          }, 0);
          const newId = `inv-${String(maxId + 1).padStart(3, '0')}`;
          
          const now = new Date().toISOString();
          const newInvoice = {
            id: newId,
            ...body,
            createdAt: now,
            lastUpdatedAt: now,
            status: body?.status || 'Draft'
          };

          invoices.push(newInvoice);
          saveInvoices(invoices);

          return new Response(JSON.stringify(newInvoice), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Match GET, PUT, DELETE for /api/billing/invoices/[id]
      const invoiceIdMatch = pathname.match(/^\/api\/billing\/invoices\/([^\/]+)$/);
      if (invoiceIdMatch) {
        const invoiceId = invoiceIdMatch[1];
        const invoices = getInvoices();
        const index = invoices.findIndex((inv: any) => inv.id === invoiceId);

        if (index === -1) {
          return new Response(JSON.stringify({ error: 'Invoice not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        if (method === 'GET') {
          return new Response(JSON.stringify(invoices[index]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        if (method === 'PUT') {
          invoices[index] = {
            ...invoices[index],
            ...body,
            lastUpdatedAt: new Date().toISOString()
          };
          saveInvoices(invoices);

          return new Response(JSON.stringify(invoices[index]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        if (method === 'DELETE') {
          const deleted = invoices[index];
          invoices.splice(index, 1);
          saveInvoices(invoices);

          return new Response(JSON.stringify({ message: 'Invoice deleted', deletedInvoice: deleted }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

    } catch (err: any) {
      console.error('Interceptor error:', err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Fallback to original fetch
  return originalFetch.apply(this, [input, init]);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
