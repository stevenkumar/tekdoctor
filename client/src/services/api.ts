/**
 * Centralized API Service Layer
 * Resolves all API endpoints using appConfig.apiUrl and safeFetch.
 */

import { safeFetch } from '@/utils/api';
import type { SafeResponse } from '@/utils/api';
import { appConfig } from '@/config/appConfig';

// Helper to construct endpoint URLs
const getUrl = (endpoint: string) => {
  // If apiHost is empty, URLs will remain relative e.g. "/api/..."
  // If apiHost is set, URLs will be absolute e.g. "https://domain.com/api/..."
  const base = appConfig.apiUrl.endsWith('/')
    ? appConfig.apiUrl.slice(0, -1)
    : appConfig.apiUrl;
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${path}`;
};

// ── API Endpoint Definitions ──────────────────────────────────────────────────

export const ENDPOINTS = {
  AUTH: {
    SIGN_UP: '/api/auth/signup',
    SIGN_IN: '/api/auth/signin',
  },
  CONTACT: {
    SUBMIT: '/api/contact',
  },
  REPAIR: {
    SUBMIT: '/api/repair-request',
    MY_TASKS: '/api/repair-request/my-tasks',
    HISTORY: '/api/repair-request/history',
    WORK_LOGS: (id: number) => `/api/repair-request/${id}/work-logs`,
    CUSTOMER_DESCRIPTION: (id: number) => `/api/repair-request/${id}/customer-description`,
    MILESTONES: (id: number) => `/api/repair-request/${id}/milestones`,
  },
  PUBLIC: {
    SITE_DATA: '/api/public/site-data',
  },
  BILLING: {
    INVOICES: '/api/billing/invoices',
    PAY: '/api/billing/pay',
    INVOICE_BY_ID: (id: string) => `/api/billing/invoices/${id}`,
  },
  TECHNICIAN: {
    LIST: '/api/technicians',
    CREATE: '/api/technicians',
    DELETE: (id: number) => `/api/technicians/${id}`,
    UPDATE: (id: number) => `/api/technicians/${id}`,
    TOGGLE_STATUS: (id: number) => `/api/technicians/${id}/toggle-status`,
    RESET_PASSWORD: (id: number) => `/api/technicians/${id}/reset-password`,
    WORKLOAD: (id: number) => `/api/technicians/${id}/workload`,
  },
  NOTIFICATIONS: {
    BASE: '/api/notifications',
    READ: (id: string | number) => `/api/notifications/${id}/read`,
    SEND: '/api/notifications/send',
    BROADCAST: '/api/notifications/broadcast',
    HISTORY: '/api/notifications/history',
  },
  ADMIN: {
    DASHBOARD_STATS: '/api/admin/dashboard-stats',
    CUSTOMERS: '/api/admin/customers',
    CUSTOMER_BY_ID: (id: number) => `/api/admin/customers/${id}`,
    CUSTOMER_HISTORY: (id: number) => `/api/admin/customers/${id}/history`,
    CONTACTS: '/api/admin/contacts',
    CONTACT_BY_ID: (id: number) => `/api/admin/contacts/${id}`,
    CONTACT_REPLY: (id: number) => `/api/admin/contacts/${id}/reply`,
    SETTINGS: '/api/admin/settings',
    HOMEPAGE: '/api/admin/homepage',
    HOMEPAGE_BY_ID: (id: number) => `/api/admin/homepage/${id}`,
    ACTIVITY_LOGS: '/api/admin/activity-logs',
    REPORTS: '/api/admin/reports',
    PROFILE: '/api/admin/profile',
    CHANGE_PASSWORD: '/api/admin/change-password',
  },
  TESTIMONIALS: {
    BASE: '/api/testimonials',
    ADMIN: '/api/testimonials/admin',
    APPROVE: (id: number) => `/api/testimonials/${id}/approve`,
    EDIT: (id: number) => `/api/testimonials/${id}`,
    DELETE: (id: number) => `/api/testimonials/${id}`,
  },
  COMPANY: {
    STATS: '/api/company/stats',
    PROFILE: '/api/company/profile',
    BRANCHES: '/api/company/branches',
    BRANCH_BY_ID: (id: number) => `/api/company/branches/${id}`,
    EMPLOYEES: '/api/company/employees',
    EMPLOYEE_BY_ID: (id: number) => `/api/company/employees/${id}`,
    DEVICES: '/api/company/devices',
    DEVICE_BY_ID: (id: number) => `/api/company/devices/${id}`,
    REPAIRS: '/api/company/repairs',
    MESSAGES: '/api/company/messages',
    BULK_DEVICES: '/api/company/bulk-devices',
    BULK_REQUESTS: '/api/company/bulk-requests',
    ACTIVITY_LOGS: '/api/company/activity-logs',
  }
} as const;

// ── Authentication API Methods ────────────────────────────────────────────────

export interface UserResponseData {
  id: number;
  name: string;
  email: string;
  role: 'customer' | 'technician' | 'admin' | 'company';
}

export interface NotificationItem {
  id: number;
  user_id: number;
  ticket_id?: number | null;
  sender_id?: number | null;
  title: string;
  message: string;
  is_read: boolean | number;
  created_at: string;
  sender_name?: string | null;
  sender_email?: string | null;
  ticket_number?: string | null;
}

export interface AuthApiResponse {
  success: boolean;
  message: string;
  data: UserResponseData & { token: string };
}

export const authApi = {
  signUp: async (payload: Record<string, any>): Promise<SafeResponse<AuthApiResponse>> => {
    return safeFetch<AuthApiResponse>(getUrl(ENDPOINTS.AUTH.SIGN_UP), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  signIn: async (payload: Record<string, any>): Promise<SafeResponse<AuthApiResponse>> => {
    return safeFetch<AuthApiResponse>(getUrl(ENDPOINTS.AUTH.SIGN_IN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  setPassword: async (password: string, token: string): Promise<SafeResponse<{ success: boolean; message: string; token?: string }>> => {
    return safeFetch<{ success: boolean; message: string; token?: string }>(getUrl('/api/auth/set-password'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });
  },
};

// ── Contact API Methods ────────────────────────────────────────────────────────

export interface ContactApiResponse {
  success: boolean;
  message: string;
  data?: { contactId: number };
}

export const contactApi = {
  submitForm: async (payload: Record<string, any>): Promise<SafeResponse<ContactApiResponse>> => {
    return safeFetch<ContactApiResponse>(getUrl(ENDPOINTS.CONTACT.SUBMIT), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },
};

// ── Repair Booking API Methods ─────────────────────────────────────────────────

export interface RepairApiResponse {
  success: boolean;
  message: string;
  requestId?: number;
  ticketNumber?: string;
  autoLogin?: {
    token: string;
    user: {
      id: number;
      name: string;
      email: string;
      role: 'customer' | 'technician' | 'admin' | 'company';
    };
  } | null;
}

export interface ServiceRequest {
  id: number;
  ticketNumber?: string;
  customerName: string;
  mobile: string;
  email: string | null;
  city: string;
  deviceCategory: string;
  brand: string;
  customBrand?: string | null;
  modelNumber: string | null;
  serialNumber?: string | null;
  deviceConfiguration?: string | null;
  problemType: string;
  problemDescription: string;
  serviceType: string;
  priority: string;
  preferredContactMethod: string;
  imagePath: string | null;
  screenshotPath: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled';
  assignedTechnicianId?: number | null;
  pendingTechnicianId?: number | null;
  technicianName?: string | null;
  customerRepairDescription?: string | null;
  feedbackRating?: number | null;
  feedbackComment?: string | null;
  feedbackDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkLog {
  id: number;
  repair_request_id: number;
  technician_id: number;
  technician_name?: string;
  technician_email?: string;
  repair_stage: string;
  action_performed: string;
  parts_replaced: string | null;
  time_spent: string | null;
  notes: string | null;
  media_path: string | null;
  created_at: string;
}

export interface ServiceRequestListResponse {
  success: boolean;
  data: ServiceRequest[];
}

export interface PaginatedServiceRequestListResponse {
  success: boolean;
  data: {
    data: ServiceRequest[];
    pagination: {
      total: number;
      totalCompleted?: number;
      page: number;
      limit: number;
      totalPages: number;
    };
    statusCounts?: {
      all: number;
      pending: number;
      in_progress: number;
      completed: number;
      delivered: number;
      cancelled: number;
      [key: string]: number;
    };
  };
}

export interface ServiceRequestStatusUpdateResponse {
  success: boolean;
  message: string;
  data: {
    id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled';
  };
}

export interface RepairFilters {
  status?: string;
  priority?: string;
  technicianId?: string | number;
  deviceCategory?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export const repairApi = {
  submitRequest: async (payload: FormData, token?: string | null): Promise<SafeResponse<RepairApiResponse>> => {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return safeFetch<RepairApiResponse>(getUrl(ENDPOINTS.REPAIR.SUBMIT), {
      method: 'POST',
      headers,
      body: payload,
    });
  },

  getRequests: async (token: string, filters?: RepairFilters | string, page?: number, limit?: number): Promise<SafeResponse<PaginatedServiceRequestListResponse>> => {
    const params = new URLSearchParams();
    const filterObj: RepairFilters | undefined = typeof filters === 'string' ? { status: filters } : filters;
    if (filterObj) {
      if (filterObj.search) params.append('search', filterObj.search.trim());
      if (filterObj.status && filterObj.status !== 'all') params.append('status', filterObj.status);
      if (filterObj.priority && filterObj.priority !== 'all') params.append('priority', filterObj.priority);
      if (filterObj.technicianId && filterObj.technicianId !== 'all') params.append('technicianId', filterObj.technicianId.toString());
      if (filterObj.deviceCategory && filterObj.deviceCategory !== 'all') params.append('deviceCategory', filterObj.deviceCategory);
      if (filterObj.startDate) params.append('startDate', filterObj.startDate);
      if (filterObj.endDate) params.append('endDate', filterObj.endDate);
    }
    if (page) params.append('page', page.toString());
    if (limit) params.append('limit', limit.toString());

    const queryString = params.toString();
    const endpoint = queryString ? `${ENDPOINTS.REPAIR.SUBMIT}?${queryString}` : ENDPOINTS.REPAIR.SUBMIT;

    return safeFetch<PaginatedServiceRequestListResponse>(getUrl(endpoint), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  getRequestById: async (token: string, id: number): Promise<SafeResponse<{ data: ServiceRequest }>> => {
    return safeFetch<{ data: ServiceRequest }>(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}`), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  cancelRequest: async (token: string, id: number | string, reason?: string): Promise<SafeResponse<{ data: any, message: string }>> => {
    return safeFetch<{ data: any, message: string }>(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}/cancel`), {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    });
  },

  deleteRequest: async (token: string, id: number, reason?: string): Promise<SafeResponse<{ message: string }>> => {
    return safeFetch<{ message: string }>(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}`), {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: reason ? JSON.stringify({ reason }) : undefined,
    });
  },

  reactivateRequest: async (token: string, id: number): Promise<SafeResponse<{ message: string }>> => {
    return safeFetch<{ message: string }>(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}/reactivate`), {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  updateRequest: async (token: string, id: number, data: any): Promise<SafeResponse<{ message: string }>> => {
    return safeFetch<{ message: string }>(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
  },

  updateStatus: async (token: string, id: number, status: string): Promise<SafeResponse<ServiceRequestStatusUpdateResponse>> => {
    return safeFetch<ServiceRequestStatusUpdateResponse>(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}/status`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
  },

  assignTechnician: async (token: string, id: number, technicianId: number | null, status?: string): Promise<SafeResponse<ServiceRequestStatusUpdateResponse>> => {
    return safeFetch<ServiceRequestStatusUpdateResponse>(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}/status`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ status: status || 'pending', assignedTechnicianId: technicianId }),
    });
  },

  getMyTasks: async (token: string): Promise<SafeResponse<ServiceRequestListResponse>> => {
    return safeFetch<ServiceRequestListResponse>(getUrl(ENDPOINTS.REPAIR.MY_TASKS), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  getMyHistory: async (token: string, page: number = 1, limit: number = 10): Promise<SafeResponse<PaginatedServiceRequestListResponse>> => {
    return safeFetch<PaginatedServiceRequestListResponse>(getUrl(`${ENDPOINTS.REPAIR.HISTORY}?page=${page}&limit=${limit}`), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  trackRequest: async (id: string): Promise<SafeResponse<{ data: any }>> => {
    return safeFetch<{ data: any }>(getUrl(`/api/repair-request/track/${id}`), { method: 'GET' });
  },

  notifyCustomer: async (token: string, id: number): Promise<SafeResponse<{ message: string }>> => {
    return safeFetch<{ message: string }>(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}/notify`), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  },

  getWorkLogs: async (token: string, repairId: number): Promise<SafeResponse<{ data: WorkLog[] }>> => {
    return safeFetch<{ data: WorkLog[] }>(getUrl(ENDPOINTS.REPAIR.WORK_LOGS(repairId)), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  createWorkLog: async (token: string, repairId: number, formData: FormData): Promise<SafeResponse<{ message: string }>> => {
    return safeFetch<{ message: string }>(getUrl(ENDPOINTS.REPAIR.WORK_LOGS(repairId)), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
  },

  updateCustomerDescription: async (token: string, repairId: number, description: string): Promise<SafeResponse<{ message: string }>> => {
    return safeFetch<{ message: string }>(getUrl(ENDPOINTS.REPAIR.CUSTOMER_DESCRIPTION(repairId)), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ customerRepairDescription: description }),
    });
  },

  sendMilestoneNotification: async (token: string, repairId: number, milestone: string, notes?: string): Promise<SafeResponse<{ message: string; emailSent: boolean }>> => {
    return safeFetch<{ message: string; emailSent: boolean }>(getUrl(ENDPOINTS.REPAIR.MILESTONES(repairId)), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ milestone, notes: notes || '' }),
    });
  },

  saveDraft: async (draftId: string, formData: any): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(`/api/repair-request/draft/${draftId}`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ formData }),
    });
  },

  getDraft: async (draftId: string): Promise<SafeResponse<{ data: any }>> => {
    return safeFetch<{ data: any }>(getUrl(`/api/repair-request/draft/${draftId}`), {
      method: 'GET',
    });
  },

  acceptAssignment: async (token: string, id: number | string): Promise<SafeResponse<{ message: string }>> => {
    return safeFetch<{ message: string }>(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}/accept-assignment`), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  },

  rejectAssignment: async (token: string, id: number | string, reason?: string): Promise<SafeResponse<{ message: string }>> => {
    return safeFetch<{ message: string }>(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}/reject-assignment`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: reason ? JSON.stringify({ reason }) : undefined
    });
  },

  transferTicket: async (token: string, id: number | string, data: { targetTechnicianId: number; reason?: string }): Promise<SafeResponse<{ message: string }>> => {
    return safeFetch<{ message: string }>(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}/transfer`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
  },

  getTicketTransfers: async (token: string, ticketId: number | string): Promise<SafeResponse<{ success: boolean; data: TaskTransfer[] }>> => {
    return safeFetch<{ success: boolean; data: TaskTransfer[] }>(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${ticketId}/transfers`), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  },

  getMyTransferHistory: async (
    token: string,
    params?: { type?: string; status?: string; search?: string; page?: number; limit?: number }
  ): Promise<SafeResponse<{ success: boolean; data: TransferHistoryResponse }>> => {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set('type', params.type);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    return safeFetch<{ success: boolean; data: TransferHistoryResponse }>(getUrl(`/api/repair-request/transfers/my-history${qs ? `?${qs}` : ''}`), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  },

  submitFeedback: async (token: string, id: number | string, rating: number, comment?: string): Promise<SafeResponse<{ message: string }>> => {
    return safeFetch<{ message: string }>(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}/feedback`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ rating, comment })
    });
  }
};

export interface TaskTransfer {
  id: number;
  repairRequestId: number;
  fromTechnicianId: number | null;
  toTechnicianId: number;
  initiatedByUserId: number;
  reason: string | null;
  transferStatus: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  responseNotes: string | null;
  transferredAt: string;
  respondedAt: string | null;
  direction?: 'incoming' | 'outgoing';
  fromTechnicianName?: string | null;
  fromTechnicianEmail?: string | null;
  toTechnicianName?: string;
  toTechnicianEmail?: string;
  initiatedByName?: string;
  initiatedByRole?: string;
  ticketNumber?: string;
  customerName?: string;
  customerMobile?: string;
  deviceCategory?: string;
  brand?: string;
  modelNumber?: string;
  currentTicketStatus?: string;
  ticketPriority?: string;
}

export interface TransferHistoryStats {
  total?: number;
  totalTransfers?: number;
  incomingCount?: number;
  outgoingCount?: number;
  pendingCount?: number;
  pendingTransfers?: number;
  acceptedCount?: number;
  acceptedTransfers?: number;
  rejectedCount?: number;
  rejectedTransfers?: number;
}

export interface TransferHistoryResponse {
  transfers: TaskTransfer[];
  pagination: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
  };
  stats: TransferHistoryStats;
}

// ── Technician API Methods ─────────────────────────────────────────────────────

export interface TechnicianUser {
  id: number;
  technician_id?: string;
  name: string;
  email: string;
  phone?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface TechnicianListResponse {
  success: boolean;
  data: TechnicianUser[];
}

export const technicianApi = {
  getAll: async (token: string): Promise<SafeResponse<TechnicianListResponse>> => {
    return safeFetch<TechnicianListResponse>(getUrl(ENDPOINTS.TECHNICIAN.LIST), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  create: async (token: string, name: string, email: string, password: string): Promise<SafeResponse<{ data: TechnicianUser }>> => {
    return safeFetch<{ data: TechnicianUser }>(getUrl(ENDPOINTS.TECHNICIAN.CREATE), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name, email, password }),
    });
  },

  delete: async (token: string, id: number, reason?: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.TECHNICIAN.DELETE(id)), {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: reason ? JSON.stringify({ reason }) : undefined,
    });
  },

  deactivate: async (token: string, id: number, reason?: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.TECHNICIAN.DELETE(id)), {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: reason ? JSON.stringify({ reason }) : undefined,
    });
  },

  reactivate: async (token: string, id: number): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(`/api/technicians/${id}/reactivate`), {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  toggleStatus: async (token: string, id: number, isActive?: boolean, reason?: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.TECHNICIAN.TOGGLE_STATUS(id)), {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isActive, reason }),
    });
  },

  getWorkload: async (token: string, id: number): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.TECHNICIAN.WORKLOAD(id)), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  }
};

// ── Notification API Methods ─────────────────────────────────────────────────────
export const notificationApi = {
  getAll: async (token: string): Promise<SafeResponse<{ data: NotificationItem[] }>> => {
    return safeFetch<{ data: NotificationItem[] }>(getUrl(ENDPOINTS.NOTIFICATIONS.BASE), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  },
  markAsRead: async (token: string, id: number | 'all'): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.NOTIFICATIONS.READ(id)), {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  },
  delete: async (token: string, id: number): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(`${ENDPOINTS.NOTIFICATIONS.BASE}/${id}`), {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  },
  clearAll: async (token: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.NOTIFICATIONS.BASE), {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  }
};

// ── Billing API Methods (Mocked via Fetch Interceptor in main.tsx) ──────────────

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  userId: string;
  clientName: string;
  amount: number;
  currency: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  lineItems: InvoiceLineItem[];
  notes: string;
  createdAt: string;
  lastUpdatedAt: string;
}

export interface BillingPayResponse {
  success: boolean;
  message: string;
  invoice: Invoice;
}

export const billingApi = {
  getInvoices: async (token?: string | null, userId?: string): Promise<SafeResponse<any>> => {
    const url = userId
      ? getUrl(`${ENDPOINTS.BILLING.INVOICES}?userId=${userId}`)
      : getUrl(ENDPOINTS.BILLING.INVOICES);
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch<any>(url, {
      method: 'GET',
      headers,
    });
  },

  getInvoiceById: async (token: string | undefined | null, id: string): Promise<SafeResponse<any>> => {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch<any>(getUrl(ENDPOINTS.BILLING.INVOICE_BY_ID(id)), {
      method: 'GET',
      headers,
    });
  },

  updateInvoice: async (token: string | undefined | null, id: string, payload: Partial<Invoice>): Promise<SafeResponse<any>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch<any>(getUrl(ENDPOINTS.BILLING.INVOICE_BY_ID(id)), {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });
  },

  deleteInvoice: async (token: string | undefined | null, id: string, reason?: string): Promise<SafeResponse<any>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch<any>(getUrl(ENDPOINTS.BILLING.INVOICE_BY_ID(id)), {
      method: 'DELETE',
      headers,
      body: reason ? JSON.stringify({ reason }) : undefined,
    });
  },

  reactivateInvoice: async (token: string | undefined | null, id: string): Promise<SafeResponse<any>> => {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch<any>(getUrl(`/api/billing/invoices/${id}/reactivate`), {
      method: 'PUT',
      headers,
    });
  },

  payInvoice: async (token: string | undefined | null, payload: { invoiceId: string; paymentMethod: string;[key: string]: any }): Promise<SafeResponse<BillingPayResponse>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch<BillingPayResponse>(getUrl(ENDPOINTS.BILLING.PAY), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  },
};

// ── Admin API Methods ─────────────────────────────────────────────────────────

export interface DashboardStats {
  totalUsers: number;
  totalTechnicians: number;
  totalTickets: number;
  totalContacts: number;
  statusCounts: { pending: number; inProgress: number; completed: number; cancelled: number };
  recentTickets: Array<{ id: number; customerName: string; deviceCategory: string; brand: string; status: string; priority: string; createdAt: string }>;
  monthlyStats: Array<{ month: string; total: number; completed: number; cancelled: number }>;
}

export interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role?: string;
  is_active: boolean;
  deactivation_reason?: string;
  deactivated_at?: string;
  deactivated_by?: number;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: number;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  created_at: string;
}

export interface SiteSettings {
  [group: string]: { [key: string]: string };
}

export interface HomepageSection {
  id: number;
  section: string;
  content: any;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
}

export interface ActivityLog {
  id: number;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  category: string | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  details: any;
  ip_address: string | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

const adminHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`,
});

export const adminApi = {
  // Dashboard
  getDashboardStats: (token: string) =>
    safeFetch<{ data: DashboardStats }>(getUrl(ENDPOINTS.ADMIN.DASHBOARD_STATS), {
      headers: adminHeaders(token),
    }),

  // Customers
  getCustomers: (token: string, page = 1, limit = 20, search = '', role = '', status = '') =>
    safeFetch<{ data: PaginatedResponse<Customer> }>(getUrl(`${ENDPOINTS.ADMIN.CUSTOMERS}?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}${role ? `&role=${role}` : ''}${status ? `&status=${status}` : ''}`), {
      headers: adminHeaders(token),
    }),

  getCompanies: (token: string, page = 1, limit = 20, search = '', status = '') =>
    safeFetch<{ data: PaginatedResponse<any> }>(getUrl(`/api/admin/companies?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ''}`), {
      headers: adminHeaders(token),
    }),

  updateCustomer: (token: string, id: number, data: { name: string; email: string; phone?: string }) =>
    safeFetch(getUrl(ENDPOINTS.ADMIN.CUSTOMER_BY_ID(id)), {
      method: 'PUT',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  deleteCustomer: (token: string, id: number, reason?: string) =>
    safeFetch(getUrl(ENDPOINTS.ADMIN.CUSTOMER_BY_ID(id)), {
      method: 'DELETE',
      headers: adminHeaders(token),
      body: reason ? JSON.stringify({ reason }) : undefined,
    }),

  deactivateCustomer: (token: string, id: number, reason?: string) =>
    safeFetch(getUrl(ENDPOINTS.ADMIN.CUSTOMER_BY_ID(id)), {
      method: 'DELETE',
      headers: adminHeaders(token),
      body: reason ? JSON.stringify({ reason }) : undefined,
    }),

  reactivateCustomer: (token: string, id: number) =>
    safeFetch(getUrl(`/api/admin/customers/${id}/reactivate`), {
      method: 'PUT',
      headers: adminHeaders(token),
    }),

  getCustomerHistory: (token: string, id: number) =>
    safeFetch(getUrl(ENDPOINTS.ADMIN.CUSTOMER_HISTORY(id)), {
      headers: adminHeaders(token),
    }),

  createCompany: (token: string, data: any) =>
    safeFetch(getUrl('/api/admin/companies'), {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  getCompanyStats: (token: string) =>
    safeFetch<{ data: any }>(getUrl('/api/admin/companies/stats'), {
      headers: adminHeaders(token),
    }),

  getCompanyDetails: (token: string, id: number) =>
    safeFetch<{ data: any }>(getUrl(`/api/admin/companies/${id}/detail`), {
      headers: adminHeaders(token),
    }),

  updateCompany: (token: string, id: number, data: any) =>
    safeFetch(getUrl(`/api/admin/companies/${id}`), {
      method: 'PUT',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  toggleCompanyStatus: (token: string, id: number, isActive: boolean, reason?: string) =>
    safeFetch(getUrl(`/api/admin/companies/${id}/status`), {
      method: 'PUT',
      headers: adminHeaders(token),
      body: JSON.stringify({ isActive, reason }),
    }),

  deactivateCompany: (token: string, id: number, reason?: string) =>
    safeFetch(getUrl(`/api/admin/companies/${id}`), {
      method: 'DELETE',
      headers: adminHeaders(token),
      body: reason ? JSON.stringify({ reason }) : undefined,
    }),

  reactivateCompany: (token: string, id: number) =>
    safeFetch(getUrl(`/api/admin/companies/${id}/reactivate`), {
      method: 'PUT',
      headers: adminHeaders(token),
    }),

  bulkUpdateTickets: (token: string, data: { ticketIds: number[]; assignedTechnicianId?: number | null; status?: string }) =>
    safeFetch(getUrl('/api/admin/tickets/bulk'), {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  // Contacts
  getContacts: (token: string, page = 1, limit = 20) =>
    safeFetch<{ data: PaginatedResponse<Contact> }>(getUrl(`${ENDPOINTS.ADMIN.CONTACTS}?page=${page}&limit=${limit}`), {
      headers: adminHeaders(token),
    }),

  deleteContact: (token: string, id: number) =>
    safeFetch(getUrl(ENDPOINTS.ADMIN.CONTACT_BY_ID(id)), {
      method: 'DELETE',
      headers: adminHeaders(token),
    }),

  replyToContact: (token: string, id: number, data: { subject: string; message: string }) =>
    safeFetch(getUrl(ENDPOINTS.ADMIN.CONTACT_REPLY(id)), {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  // Settings
  getSettings: (token: string, group?: string) =>
    safeFetch<{ data: SiteSettings }>(getUrl(group ? `${ENDPOINTS.ADMIN.SETTINGS}?group=${group}` : ENDPOINTS.ADMIN.SETTINGS), {
      headers: adminHeaders(token),
    }),

  updateSettings: (token: string, settings: Record<string, string>, group?: string) =>
    safeFetch(getUrl(ENDPOINTS.ADMIN.SETTINGS), {
      method: 'PUT',
      headers: adminHeaders(token),
      body: JSON.stringify({ settings, group }),
    }),

  testEmailSettings: (token: string, settings: Record<string, string>) =>
    safeFetch(getUrl(`${ENDPOINTS.ADMIN.SETTINGS}/test-email`), {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ settings }),
    }),

  // Homepage
  getHomepageContent: (token: string) =>
    safeFetch<{ data: HomepageSection[] }>(getUrl(ENDPOINTS.ADMIN.HOMEPAGE), {
      headers: adminHeaders(token),
    }),

  updateHomepageContent: (token: string, id: number, data: { content: any; is_active?: boolean }) =>
    safeFetch(getUrl(ENDPOINTS.ADMIN.HOMEPAGE_BY_ID(id)), {
      method: 'PUT',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  uploadFile: (token: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return safeFetch<{ success: boolean; message: string; data: { url: string } }>(getUrl('/api/admin/upload'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
  },

  // Activity Logs
  getActivityLogs: (
    token: string,
    page = 1,
    limit = 30,
    filters?: {
      search?: string;
      category?: string;
      dateRange?: string;
      startDate?: string;
      endDate?: string;
    }
  ) => {
    let url = `${ENDPOINTS.ADMIN.ACTIVITY_LOGS}?page=${page}&limit=${limit}`;
    if (filters) {
      if (filters.search) url += `&search=${encodeURIComponent(filters.search)}`;
      if (filters.category) url += `&category=${encodeURIComponent(filters.category)}`;
      if (filters.dateRange) url += `&dateRange=${encodeURIComponent(filters.dateRange)}`;
      if (filters.startDate) url += `&startDate=${encodeURIComponent(filters.startDate)}`;
      if (filters.endDate) url += `&endDate=${encodeURIComponent(filters.endDate)}`;
    }
    return safeFetch<{ data: PaginatedResponse<ActivityLog> }>(getUrl(url), {
      headers: adminHeaders(token),
    });
  },

  // Task Transfers Oversight
  getAllTaskTransfers: (
    token: string,
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      technicianId?: string | number;
      startDate?: string;
      endDate?: string;
      ticketId?: string | number;
    }
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.technicianId && params.technicianId !== 'all') searchParams.set('technicianId', String(params.technicianId));
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.ticketId) searchParams.set('ticketId', String(params.ticketId));

    const qs = searchParams.toString();
    return safeFetch<{ success: boolean; data: TransferHistoryResponse }>(getUrl(`/api/admin/task-transfers${qs ? `?${qs}` : ''}`), {
      headers: adminHeaders(token),
    });
  },

  // Reports
  getReports: (token: string, type: 'daily' | 'monthly' = 'monthly', startDate?: string, endDate?: string) => {
    let url = `${ENDPOINTS.ADMIN.REPORTS}?type=${type}`;
    if (startDate && endDate) {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }
    return safeFetch(getUrl(url), {
      headers: adminHeaders(token),
    });
  },

  // Profile
  updateProfile: (token: string, data: { name: string; email: string; phone?: string }) =>
    safeFetch(getUrl(ENDPOINTS.ADMIN.PROFILE), {
      method: 'PUT',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  changePassword: (token: string, data: { currentPassword: string; newPassword: string }) =>
    safeFetch(getUrl(ENDPOINTS.ADMIN.CHANGE_PASSWORD), {
      method: 'PUT',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  resetUserPassword: (token: string, id: number, newPassword: string) =>
    safeFetch(getUrl(`/api/admin/users/${id}/reset-password`), {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ newPassword }),
    }),

  // Notifications (admin)
  sendNotification: (token: string, data: { userId: number; title: string; message: string }) =>
    safeFetch(getUrl(ENDPOINTS.NOTIFICATIONS.SEND), {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  broadcastNotification: (token: string, data: { title: string; message: string; targetRole?: string }) =>
    safeFetch(getUrl(ENDPOINTS.NOTIFICATIONS.BROADCAST), {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  getNotificationHistory: (token: string, page = 1, limit = 30) =>
    safeFetch<{ data: PaginatedResponse<NotificationItem & { user_name: string; user_email: string }> }>(getUrl(`${ENDPOINTS.NOTIFICATIONS.HISTORY}?page=${page}&limit=${limit}`), {
      headers: adminHeaders(token),
    }),

  // Technician management extensions
  updateTechnician: (token: string, id: number, data: { name: string; email: string; phone?: string }) =>
    safeFetch(getUrl(ENDPOINTS.TECHNICIAN.UPDATE(id)), {
      method: 'PUT',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  toggleTechnicianStatus: (token: string, id: number) =>
    safeFetch(getUrl(ENDPOINTS.TECHNICIAN.TOGGLE_STATUS(id)), {
      method: 'PATCH',
      headers: adminHeaders(token),
    }),

  resetTechnicianPassword: (token: string, id: number, newPassword: string) =>
    safeFetch(getUrl(ENDPOINTS.TECHNICIAN.RESET_PASSWORD(id)), {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ newPassword }),
    }),

  getTechnicianWorkload: (token: string, id: number) =>
    safeFetch(getUrl(ENDPOINTS.TECHNICIAN.WORKLOAD(id)), {
      headers: adminHeaders(token),
    }),
};

export const publicApi = {
  getSiteData: async (): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.PUBLIC.SITE_DATA), {
      method: 'GET',
    });
  },
};

export const testimonialApi = {
  submit: async (token: string, rating: number, comment: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.TESTIMONIALS.BASE), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ rating, comment })
    });
  },
  getApproved: async (): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.TESTIMONIALS.BASE), {
      method: 'GET',
    });
  },
  getAllAdmin: async (token: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.TESTIMONIALS.ADMIN), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  },
  approve: async (token: string, id: number, is_approved: boolean): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.TESTIMONIALS.APPROVE(id)), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ is_approved })
    });
  },
  delete: async (token: string, id: number): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.TESTIMONIALS.DELETE(id)), {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  },
  editAdmin: async (token: string, id: number, data: { comment: string, rating: number }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.TESTIMONIALS.EDIT(id)), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
  }
};

// ── Company API Methods ────────────────────────────────────────────────────────────
export const companyApi = {
  getStats: async (token: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.STATS), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  getProfile: async (token: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.PROFILE), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  updateProfile: async (token: string, formData: FormData): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.PROFILE), {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
  },

  // Branches
  getBranches: async (token: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.BRANCHES), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  createBranch: async (token: string, data: any): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.BRANCHES), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  updateBranch: async (token: string, id: number, data: any): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.BRANCH_BY_ID(id)), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  deleteBranch: async (token: string, id: number, reason?: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.BRANCH_BY_ID(id)), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: reason ? JSON.stringify({ reason }) : undefined,
    });
  },

  toggleBranchStatus: async (token: string, id: number, isActive?: boolean, reason?: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(`/api/company/branches/${id}/toggle-status`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ isActive, reason }),
    });
  },

  reactivateBranch: async (token: string, id: number): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(`/api/company/branches/${id}/reactivate`), {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  // Employees
  getEmployees: async (token: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.EMPLOYEES), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  createEmployee: async (token: string, data: any): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.EMPLOYEES), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  updateEmployee: async (token: string, id: number, data: any): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.EMPLOYEE_BY_ID(id)), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  deleteEmployee: async (token: string, id: number, reason?: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.EMPLOYEE_BY_ID(id)), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: reason ? JSON.stringify({ reason }) : undefined,
    });
  },

  toggleEmployeeStatus: async (token: string, id: number, isActive?: boolean, reason?: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(`/api/company/employees/${id}/toggle-status`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ isActive, reason }),
    });
  },

  reactivateEmployee: async (token: string, id: number): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(`/api/company/employees/${id}/reactivate`), {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  // Devices
  getDevices: async (token: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.DEVICES), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  createDevice: async (token: string, data: any): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.DEVICES), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  updateDevice: async (token: string, id: number, data: any): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.DEVICE_BY_ID(id)), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  deleteDevice: async (token: string, id: number, reason?: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.DEVICE_BY_ID(id)), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: reason ? JSON.stringify({ reason }) : undefined,
    });
  },

  toggleDeviceStatus: async (token: string, id: number, isActive?: boolean, reason?: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(`/api/company/devices/${id}/toggle-status`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ isActive, reason }),
    });
  },

  reactivateDevice: async (token: string, id: number): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(`/api/company/devices/${id}/reactivate`), {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  // Repairs
  getRepairs: async (token: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.REPAIRS), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  createRepair: async (token: string, data: any): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.REPAIRS), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  // Messages
  getMessages: async (token: string, repairRequestId?: number): Promise<SafeResponse<any>> => {
    const url = repairRequestId
      ? getUrl(`${ENDPOINTS.COMPANY.MESSAGES}?repairRequestId=${repairRequestId}`)
      : getUrl(ENDPOINTS.COMPANY.MESSAGES);
    return safeFetch<any>(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  sendMessage: async (token: string, data: { repairRequestId?: number; message: string; receiverId?: number }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.MESSAGES), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  // Bulk Imports
  importBulkDevices: async (token: string, file: File): Promise<SafeResponse<any>> => {
    const formData = new FormData();
    formData.append('csvFile', file);
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.BULK_DEVICES), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
  },

  importBulkRequests: async (token: string, file: File): Promise<SafeResponse<any>> => {
    const formData = new FormData();
    formData.append('csvFile', file);
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.BULK_REQUESTS), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
  },

  // Activity Logs
  getActivityLogs: async (token: string, page = 1, limit = 20): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(`${ENDPOINTS.COMPANY.ACTIVITY_LOGS}?page=${page}&limit=${limit}`), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },
};

