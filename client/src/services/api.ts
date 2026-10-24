/**
 * Centralized API Service Layer
 * Resolves all API endpoints using appConfig.apiUrl and safeFetch.
 */

import { safeFetch, getApiCompanyContext } from '@/utils/api';
import type { SafeResponse } from '@/utils/api';
import { appConfig } from '@/config/appConfig';
import { broadcastPaymentSettled } from '@/utils/paymentSync';
import { getRecaptchaToken } from '@/utils/recaptcha';

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
    REGISTER: '/api/company/register',
    STATS: '/api/company/stats',
    PROFILE: '/api/company/profile',
    BRANCHES: '/api/company/branches',
    BRANCH_BY_ID: (id: number) => `/api/company/branches/${id}`,
    EMPLOYEES: '/api/company/employees',
    EMPLOYEE_BY_ID: (id: number) => `/api/company/employees/${id}`,
    DEVICES: '/api/company/devices',
    DEVICE_BY_ID: (id: number) => `/api/company/devices/${id}`,
    DEVICE_HISTORY: (id: number | string) => `/api/company/devices/${id}/history`,
    REPAIRS: '/api/company/repairs',
    MESSAGES: '/api/company/messages',
    BULK_DEVICES: '/api/company/bulk-devices',
    BULK_REQUESTS: '/api/company/bulk-requests',
    BULK_BRANCHES: '/api/company/bulk-branches',
    BULK_EMPLOYEES: '/api/company/bulk-employees',
    EXPORT_BRANCHES: '/api/company/branches/export',
    EXPORT_EMPLOYEES: '/api/company/employees/export',
    EXPORT_DEVICES: '/api/company/devices/export',
    EXPORT_REPAIRS: '/api/company/repairs/export',
    TEMPLATES: '/api/company/templates',
    ACTIVITY_LOGS: '/api/company/activity-logs',
  }
} as const;

// ── Authentication API Methods ────────────────────────────────────────────────

export interface UserResponseData {
  id: number;
  name: string;
  email: string;
  role: 'customer' | 'technician' | 'admin' | 'company';
  avatar_url?: string;
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
  data: Partial<UserResponseData> & {
    token?: string;
    requiresOtp?: boolean;
    pendingToken?: string;
    maskedEmail?: string;
    email?: string;
  };
}

export const authApi = {
  signUp: async (payload: Record<string, any>): Promise<SafeResponse<AuthApiResponse>> => {
    let recaptchaToken = payload.recaptchaToken;
    if (!recaptchaToken) {
      try {
        recaptchaToken = await getRecaptchaToken('signup');
      } catch (err: any) {
        return {
          ok: false,
          status: 400,
          data: null,
          error: err?.message || 'Security verification failed. Please try again.',
        };
      }
    }
    const cleanPayload = { ...payload };
    if (recaptchaToken) {
      cleanPayload.recaptchaToken = recaptchaToken;
    } else {
      delete cleanPayload.recaptchaToken;
    }
    return safeFetch<AuthApiResponse>(getUrl(ENDPOINTS.AUTH.SIGN_UP), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanPayload),
    });
  },

  signIn: async (payload: Record<string, any>): Promise<SafeResponse<AuthApiResponse>> => {
    let recaptchaToken = payload.recaptchaToken;
    if (!recaptchaToken) {
      try {
        recaptchaToken = await getRecaptchaToken('login');
      } catch (err: any) {
        return {
          ok: false,
          status: 400,
          data: null,
          error: err?.message || 'Security verification failed. Please try again.',
        };
      }
    }
    const cleanPayload = { ...payload };
    if (recaptchaToken) {
      cleanPayload.recaptchaToken = recaptchaToken;
    } else {
      delete cleanPayload.recaptchaToken;
    }
    return safeFetch<AuthApiResponse>(getUrl(ENDPOINTS.AUTH.SIGN_IN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanPayload),
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

  googleSignIn: async (payload: { code?: string; credential?: string; recaptchaToken?: string | null }): Promise<SafeResponse<AuthApiResponse>> => {
    let recaptchaToken = payload.recaptchaToken;
    if (!recaptchaToken) {
      try {
        recaptchaToken = await getRecaptchaToken('google_login');
      } catch (err: any) {
        return {
          ok: false,
          status: 400,
          data: null,
          error: err?.message || 'Security verification failed for Google Sign-In.',
        };
      }
    }
    const cleanPayload: Record<string, any> = { ...payload };
    if (recaptchaToken) {
      cleanPayload.recaptchaToken = recaptchaToken;
    } else {
      delete cleanPayload.recaptchaToken;
    }
    return safeFetch<AuthApiResponse>(getUrl('/api/auth/google'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanPayload),
    });
  },

  forgotPassword: async (email: string, recaptchaToken?: string | null): Promise<SafeResponse<{ success: boolean; message: string; data?: { requiresOtp?: boolean; email?: string; maskedEmail?: string }; requiresOtp?: boolean; email?: string; maskedEmail?: string }>> => {
    let token = recaptchaToken;
    if (!token) {
      try {
        token = await getRecaptchaToken('forgot_password');
      } catch (err: any) {
        return {
          ok: false,
          status: 400,
          data: null,
          error: err?.message || 'Security verification failed.',
        };
      }
    }
    const body: Record<string, any> = { email };
    if (token) {
      body.recaptchaToken = token;
    }
    return safeFetch<{ success: boolean; message: string; data?: { requiresOtp?: boolean; email?: string; maskedEmail?: string }; requiresOtp?: boolean; email?: string; maskedEmail?: string }>(getUrl('/api/auth/forgot-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  verifyLoginOtp: async (pendingToken: string, otp: string): Promise<SafeResponse<AuthApiResponse>> => {
    return safeFetch<AuthApiResponse>(getUrl('/api/auth/admin/verify-login-otp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingToken, otp }),
    });
  },

  resendLoginOtp: async (pendingToken: string): Promise<SafeResponse<{ success: boolean; message: string }>> => {
    return safeFetch<{ success: boolean; message: string }>(getUrl('/api/auth/admin/resend-otp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingToken }),
    });
  },

  verifyResetOtp: async (email: string, otp: string): Promise<SafeResponse<{ success: boolean; message: string; data?: { resetToken: string } }>> => {
    return safeFetch<{ success: boolean; message: string; data?: { resetToken: string } }>(getUrl('/api/auth/admin/verify-reset-otp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });
  },

  resetPassword: async (token: string, password: string): Promise<SafeResponse<{ success: boolean; message: string }>> => {
    return safeFetch<{ success: boolean; message: string }>(getUrl('/api/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password, newPassword: password }),
    });
  },

  logout: async (token?: string | null): Promise<SafeResponse<{ success: boolean; message: string }>> => {
    return safeFetch<{ success: boolean; message: string }>(getUrl('/api/auth/logout'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
    });
  },

  updateProfile: async (token: string, payload: { name?: string; phone?: string }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl('/api/auth/profile'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
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
    let recaptchaToken = payload.recaptchaToken;
    if (!recaptchaToken) {
      try {
        recaptchaToken = await getRecaptchaToken('contact_us');
      } catch (err: any) {
        return {
          ok: false,
          status: 400,
          data: null,
          error: err?.message || 'Security verification failed.',
        };
      }
    }
    const cleanPayload = { ...payload };
    if (recaptchaToken) {
      cleanPayload.recaptchaToken = recaptchaToken;
    } else {
      delete cleanPayload.recaptchaToken;
    }
    return safeFetch<ContactApiResponse>(getUrl(ENDPOINTS.CONTACT.SUBMIT), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanPayload),
    });
  },
};

// ── Repair Booking API Methods ─────────────────────────────────────────────────

export interface RepairApiResponse {
  success: boolean;
  message: string;
  requestId?: number;
  ticketNumber?: string;
  isDuplicate?: boolean;
  isNewCustomer?: boolean;
  isExistingCustomer?: boolean;
  data?: any;
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
  customDeviceCategory?: string | null;
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
  assignedAt?: string | null;
  customProblemType?: string | null;
  customerRepairDescription?: string | null;
  feedbackRating?: number | null;
  feedbackComment?: string | null;
  feedbackDate?: string | null;
  // Diagnosis & Estimation Fields
  diagnosis?: string | null;
  identifiedIssues?: string | null;
  requiredWork?: string | null;
  requiredParts?: string | null;
  estimatedCost?: number;
  estimated_cost?: number;
  additionalCharges?: number;
  additional_charges?: number;
  totalEstimatedCost?: number;
  estimatedCompletionDate?: string | null;
  inspectionNotes?: string | null;
  deviceCondition?: string | null;
  inspectedAt?: string | null;
  estimateSubmittedAt?: string | null;
  // Customer Approval & Hold Fields
  customerApprovalStatus?: 'none' | 'pending_approval' | 'approved' | 'rejected' | 'on_hold' | 'reapproval_requested' | 'auto_cancelled' | string;
  approvedAt?: string | null;
  approvedBy?: number | null;
  approvalNotes?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  holdStartDate?: string | null;
  holdEndDate?: string | null;
  holdReason?: string | null;
  holdNotes?: string | null;
  reapprovalRequestedAt?: string | null;
  reapprovalNotes?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: number | null;
  // Billing & Payment Fields
  repairCost?: number;
  repair_cost?: number;
  paymentStatus?: string;
  payment_status?: string;
  collectionStatus?: string;
  collection_status?: string;
  paymentId?: string | null;
  payment_id?: string | null;
  paymentMethod?: string | null;
  payment_method?: string | null;
  paidAt?: string | null;
  paid_at?: string | null;
  amountUpdatedByAdmin?: boolean;
  adminUpdatedAmount?: number | null;
  amountUpdatedAt?: string | null;
  companyId?: number | null;
  company_id?: number | null;
  companyName?: string | null;
  company_name?: string | null;
  companyEmail?: string | null;
  company_email?: string | null;
  companyPhone?: string | null;
  company_phone?: string | null;
  companyAddress?: string | null;
  company_address?: string | null;
  companyContactPerson?: string | null;
  company_contact_person?: string | null;
  companyLogo?: string | null;
  company_logo?: string | null;
  companyGst?: string | null;
  company_gst?: string | null;
  companyAmcStatus?: string | null;
  company_amc_status?: string | null;
  deviceId?: number | null;
  device_id?: number | null;
  fleet_device_id?: number | null;
  employeeId?: number | null;
  employee_id?: number | null;
  employeeName?: string | null;
  employee_name?: string | null;
  employeeEmail?: string | null;
  employee_email?: string | null;
  employeePhone?: string | null;
  employee_phone?: string | null;
  employeeDepartment?: string | null;
  employee_department?: string | null;
  branchName?: string | null;
  branch_name?: string | null;
  assetId?: string | null;
  asset_id?: string | null;
  isAmc?: boolean;
  is_amc?: boolean;
  amcTag?: string | null;
  amc_tag?: string | null;
  invoiceId?: string | null;
  invoice_id?: string | null;
  invoiceAmount?: number | null;
  invoice_amount?: number | null;
  invoiceDate?: string | null;
  invoice_date?: string | null;
  invoiceStatus?: string | null;
  invoice_status?: string | null;
  deviceRepairHistory?: any[];
  repairHistory?: any[];
  repeatCount?: number;
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
  paymentStatus?: string;
  priority?: string;
  technicianId?: string | number;
  deviceCategory?: string;
  clientType?: string;
  companyId?: string | number;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export const repairApi = {
  submitRequest: async (payload: FormData, token?: string | null): Promise<SafeResponse<RepairApiResponse>> => {
    const existingToken = payload.get('recaptchaToken');
    if (!existingToken || typeof existingToken !== 'string' || !existingToken.trim()) {
      try {
        const recaptchaToken = await getRecaptchaToken('book_repair');
        if (recaptchaToken) {
          payload.set('recaptchaToken', recaptchaToken);
        } else {
          payload.delete('recaptchaToken');
        }
      } catch (err: any) {
        return {
          ok: false,
          status: 400,
          data: null,
          error: err?.message || 'Security verification failed for repair booking.',
        };
      }
    }
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
      if (filterObj.paymentStatus && filterObj.paymentStatus !== 'all') params.append('paymentStatus', filterObj.paymentStatus);
      if (filterObj.priority && filterObj.priority !== 'all') params.append('priority', filterObj.priority);
      if (filterObj.technicianId && filterObj.technicianId !== 'all') params.append('technicianId', filterObj.technicianId.toString());
      if (filterObj.deviceCategory && filterObj.deviceCategory !== 'all') params.append('deviceCategory', filterObj.deviceCategory);
      if (filterObj.clientType && filterObj.clientType !== 'all') params.append('clientType', filterObj.clientType);
      if (filterObj.companyId && filterObj.companyId !== 'all') params.append('companyId', filterObj.companyId.toString());
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

  getRequestById: async (token: string, id: number | string): Promise<SafeResponse<{ data: ServiceRequest }>> => {
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

  bulkDeleteRequests: async (
    token: string,
    ticketIds: number[],
    reason?: string
  ): Promise<SafeResponse<{ message: string; data?: { deletedCount: number; deletedIds: number[] } }>> => {
    return safeFetch<{ message: string; data?: { deletedCount: number; deletedIds: number[] } }>(
      getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/bulk-delete`),
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticketIds, reason }),
      }
    );
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

  updateStatus: async (
    token: string,
    id: number,
    status: string,
    options?: { isOverride?: boolean; overrideReason?: string }
  ): Promise<SafeResponse<ServiceRequestStatusUpdateResponse>> => {
    return safeFetch<ServiceRequestStatusUpdateResponse>(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}/status`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ status, ...options }),
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

  getMyTasks: async (token: string, search?: string): Promise<SafeResponse<ServiceRequestListResponse>> => {
    const query = search && search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    return safeFetch<ServiceRequestListResponse>(getUrl(`${ENDPOINTS.REPAIR.MY_TASKS}${query}`), {
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
  },

  submitDiagnosis: async (token: string, id: number | string, data: any): Promise<SafeResponse<{ message: string; ticket: any }>> => {
    return safeFetch(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}/diagnosis`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
  },

  approveEstimate: async (id: number | string, token?: string | null): Promise<SafeResponse<{ message: string; ticket: any }>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}/approve-estimate`), {
      method: 'POST',
      headers,
      body: JSON.stringify({ token: token || undefined })
    });
  },

  rejectEstimate: async (id: number | string, reason?: string, token?: string | null): Promise<SafeResponse<{ message: string; ticket: any }>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}/reject-estimate`), {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason, token: token || undefined })
    });
  },

  requestRepairAgain: async (id: number | string, comment?: string, token?: string | null): Promise<SafeResponse<{ message: string; ticket: any }>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch(getUrl(`${ENDPOINTS.REPAIR.SUBMIT}/${id}/request-repair-again`), {
      method: 'POST',
      headers,
      body: JSON.stringify({ comment: comment || undefined, token: token || undefined })
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

  create: async (token: string, name: string, email: string, password: string, phone?: string): Promise<SafeResponse<{ data: TechnicianUser }>> => {
    return safeFetch<{ data: TechnicianUser }>(getUrl(ENDPOINTS.TECHNICIAN.CREATE), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name, email, password, phone: phone?.trim() || undefined }),
    });
  },

  update: async (token: string, id: number, data: { name?: string; email?: string; phone?: string }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.TECHNICIAN.UPDATE(id)), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
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
  },

  updateProfile: async (token: string, payload: { name: string; email: string; phone?: string }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl('/api/technicians/profile'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  },

  changePassword: async (token: string, payload: { currentPassword: string; newPassword: string }): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl('/api/technicians/change-password'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  }
};

// ── Notification API Methods ─────────────────────────────────────────────────────
export const notificationApi = {
  getAll: async (token: string, limit?: number): Promise<SafeResponse<{ data: NotificationItem[]; unreadCount?: number }>> => {
    const url = (limit !== undefined && limit > 0)
      ? `${getUrl(ENDPOINTS.NOTIFICATIONS.BASE)}?limit=${encodeURIComponent(limit)}`
      : getUrl(ENDPOINTS.NOTIFICATIONS.BASE);
    return safeFetch<{ data: NotificationItem[]; unreadCount?: number }>(url, {
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

// ── Billing API Methods (backed by Express /api/billing routes) ──────────────

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  userId: string;
  ticketId?: number | string | null;
  ticket_id?: number | string | null;
  ticketNumber?: string | null;
  ticket_number?: string | null;
  clientName: string;
  amount: number;
  currency: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  lineItems: InvoiceLineItem[];
  notes: string;
  createdAt: string;
  lastUpdatedAt?: string;
  updatedAt?: string;
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

  finalizeInvoice: async (token: string | undefined | null, id: string): Promise<SafeResponse<any>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch<any>(getUrl(`/api/billing/invoices/${id}/finalize`), {
      method: 'POST',
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

  getQuotations: async (token?: string | null): Promise<SafeResponse<any>> => {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch<any>(getUrl('/api/billing/quotations'), {
      method: 'GET',
      headers,
    });
  },

  respondToQuotation: async (token: string | undefined | null, id: string, status: 'Approved' | 'Rejected'): Promise<SafeResponse<any>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch<any>(getUrl(`/api/billing/quotations/${id}/respond`), {
      method: 'POST',
      headers,
      body: JSON.stringify({ status }),
    });
  },

  getConfig: async (): Promise<SafeResponse<{ success: boolean; data: { keyId: string; currency: string; companyName: string } }>> => {
    return safeFetch<any>(getUrl('/api/billing/config'), {
      method: 'GET',
    });
  },

  getEligibility: async (ticketId: number | string, token?: string | null): Promise<SafeResponse<{
    success: boolean;
    data: {
      eligible: boolean;
      ticket?: any;
      amount?: number;
      currency?: string;
      reason?: string | null;
    };
  }>> => {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch<any>(getUrl(`/api/billing/eligibility/${ticketId}`), {
      method: 'GET',
      headers,
    });
  },

  createPaymentOrder: async (data: {
    ticketId?: number | string;
    ticket_id?: number | string;
    invoiceId?: number | string;
    invoice_id?: number | string;
    ticketNumber?: string;
    ticket_number?: string;
    amount?: number;
    currency?: string;
  }, token?: string | null): Promise<SafeResponse<{
    success: boolean;
    data: {
      orderId: string;
      amount: number;
      currency: string;
      keyId: string;
      ticketId?: number;
      ticket_id?: number;
      invoiceId?: number;
      invoice_id?: number;
    };
  }>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const payload = {
      ...data,
      ticketId: data.ticketId || data.ticket_id,
      ticket_id: data.ticket_id || data.ticketId,
      invoiceId: data.invoiceId || data.invoice_id,
      invoice_id: data.invoice_id || data.invoiceId,
      ticketNumber: data.ticketNumber || data.ticket_number,
      ticket_number: data.ticket_number || data.ticketNumber
    };
    return safeFetch<any>(getUrl('/api/billing/create-order'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  },

  verifyPayment: async (data: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
    ticketId?: number | string;
    ticket_id?: number | string;
    invoiceId?: number | string;
    invoice_id?: number | string;
    ticketNumber?: string;
    ticket_number?: string;
  }, token?: string | null): Promise<SafeResponse<any>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const payload = {
      ...data,
      ticketId: data.ticketId || data.ticket_id,
      ticket_id: data.ticket_id || data.ticketId,
      invoiceId: data.invoiceId || data.invoice_id,
      invoice_id: data.invoice_id || data.invoiceId,
      ticketNumber: data.ticketNumber || data.ticket_number,
      ticket_number: data.ticket_number || data.ticketNumber
    };
    const res = await safeFetch<any>(getUrl('/api/billing/verify-payment'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      broadcastPaymentSettled({
        ticketId: payload.ticketId,
        paymentId: data.razorpay_payment_id,
        invoiceId: payload.invoiceId,
        status: 'paid',
        amount: res.data?.data?.amount || (res.data as any)?.amount
      });
    }
    return res;
  },

  reportPaymentFailure: async (data: {
    orderId?: string;
    ticketId?: number | string;
    invoiceId?: number | string;
    reason?: string;
    status?: 'failed' | 'cancelled';
  }, token?: string | null): Promise<SafeResponse<any>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch<any>(getUrl('/api/billing/payment-failed'), {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
  },

  getPayments: async (token: string, page = 1, limit = 20): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(`/api/billing/payments?page=${page}&limit=${limit}`), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  getPaymentReceiptByTicket: async (ticketId: number | string, token?: string | null): Promise<SafeResponse<any>> => {
    const headers: Record<string, string> = {};
    const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    return safeFetch<any>(getUrl(`/api/billing/receipt/ticket/${ticketId}`), {
      method: 'GET',
      headers,
    });
  },

  getPaymentReceiptByInvoice: async (invoiceId: number | string, token?: string | null): Promise<SafeResponse<any>> => {
    const headers: Record<string, string> = {};
    const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    return safeFetch<any>(getUrl(`/api/billing/receipt/${invoiceId}`), {
      method: 'GET',
      headers,
    });
  },

  initiateOfflinePayment: async (payload: {
    ticketId?: number | string;
    ticketNumber?: string;
    invoiceId?: string;
    paymentMethod: 'cash' | 'bank_transfer' | 'offline_upi';
    referenceNote?: string;
    notes?: string;
  }, token?: string | null): Promise<SafeResponse<any>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch<any>(getUrl('/api/billing/offline-payment'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  },

  switchPaymentMethod: async (payload: {
    ticketId?: number | string;
    ticketNumber?: string;
    invoiceId?: string;
    targetMethod?: string;
  }, token?: string | null): Promise<SafeResponse<any>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return safeFetch<any>(getUrl('/api/billing/switch-payment-method'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  },

  recordCashCollected: async (payload: {
    ticketId?: number | string;
    paymentId?: string;
    notes?: string;
  }, token: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl('/api/billing/record-cash-collected'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload),
    });
  },

  verifyOfflinePayment: async (payload: {
    paymentId?: string;
    orderId?: string;
    ticketId?: number | string;
    invoiceId?: string;
    action: 'verify' | 'reject';
    rejectionReason?: string;
    notes?: string;
  }, token: string): Promise<SafeResponse<any>> => {
    const res = await safeFetch<any>(getUrl('/api/billing/verify-offline-payment'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload),
    });
    if (res.ok && payload.action === 'verify') {
      broadcastPaymentSettled({
        ticketId: payload.ticketId,
        paymentId: payload.paymentId,
        invoiceId: payload.invoiceId,
        status: 'paid',
        amount: res.data?.data?.amount || (res.data as any)?.amount
      });
    }
    return res;
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
  permanent_customer_id?: string;
  technician_id?: string | null;
  company_id?: string | null;
  name: string;
  email: string;
  phone: string | null;
  role?: string;
  is_active: boolean | number;
  deactivation_reason?: string;
  deactivated_at?: string;
  deactivated_by?: number;
  total_tickets?: number;
  active_tickets?: number;
  completed_tickets?: number;
  cancelled_tickets?: number;
  last_ticket_date?: string | null;
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
  getCustomers: (token: string, page = 1, limit = 20, search = '', role = '', status = '', startDate = '', endDate = '') =>
    safeFetch<{ data: PaginatedResponse<Customer> }>(getUrl(`${ENDPOINTS.ADMIN.CUSTOMERS}?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}${role ? `&role=${role}` : ''}${status ? `&status=${status}` : ''}${startDate ? `&startDate=${encodeURIComponent(startDate)}` : ''}${endDate ? `&endDate=${encodeURIComponent(endDate)}` : ''}`), {
      headers: adminHeaders(token),
    }),

  getCompanies: (token: string, page = 1, limit = 20, search = '', status = '') =>
    safeFetch<{ data: PaginatedResponse<any> }>(getUrl(`/api/admin/companies?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ''}`), {
      headers: adminHeaders(token),
    }),

  getCompanyPayments: (token: string, page = 1, limit = 20, companyId = '', search = '', startDate = '', endDate = '') =>
    safeFetch<{ data: { payments: any[]; companySummaries: any[]; summary: { totalVerifiedIncome: number; totalPaidTransactions: number }; pagination: any } }>(
      getUrl(`/api/admin/companies/payments?page=${page}&limit=${limit}${companyId ? `&companyId=${companyId}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}${startDate ? `&startDate=${startDate}` : ''}${endDate ? `&endDate=${endDate}` : ''}`),
      { headers: adminHeaders(token) }
    ),

  getCompanyInvoices: (token: string, page = 1, limit = 20, companyId = '', status = '', search = '') =>
    safeFetch<{ data: { invoices: any[]; companySummary: any[]; summary: { totalInvoices: number; totalAmount: number }; pagination: any } }>(
      getUrl(`/api/admin/companies/invoices?page=${page}&limit=${limit}${companyId ? `&companyId=${companyId}` : ''}${status ? `&status=${status}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
      { headers: adminHeaders(token) }
    ),

  getDeviceRepairHistory: (token: string, deviceId: number | string) =>
    safeFetch<{ data: any }>(getUrl(ENDPOINTS.COMPANY.DEVICE_HISTORY(deviceId)), {
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

  getCompanyDevices: (token: string, page = 1, limit = 20, search = '', status = '', companyId = '') =>
    safeFetch<{ data: PaginatedResponse<any> }>(getUrl(`/api/admin/companies/devices?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ''}${companyId ? `&companyId=${companyId}` : ''}`), {
      headers: adminHeaders(token),
    }),

  getCompanyMessages: (token: string, companyId: number) =>
    safeFetch<{ data: any[] }>(getUrl(`/api/admin/companies/${companyId}/messages`), {
      headers: adminHeaders(token),
    }),

  sendCompanyMessage: (token: string, companyId: number, data: { message: string; repairRequestId?: number }) =>
    safeFetch(getUrl(`/api/admin/companies/${companyId}/messages`), {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  markCompanyMessagesRead: (token: string, companyId: number) =>
    safeFetch(getUrl(`/api/admin/companies/${companyId}/messages/read`), {
      method: 'PUT',
      headers: adminHeaders(token),
    }),

  getCompanyTickets: (token: string, page = 1, limit = 20, search = '', status = '', paymentStatus = '', companyId = '') =>
    safeFetch<{ data: PaginatedResponse<any> }>(getUrl(`/api/repair-request?clientType=company&page=${page}&limit=${limit}&search=${encodeURIComponent(search)}${status && status !== 'all' ? `&status=${status}` : ''}${paymentStatus && paymentStatus !== 'all' ? `&paymentStatus=${paymentStatus}` : ''}${companyId && companyId !== 'all' ? `&companyId=${companyId}` : ''}`), {
      headers: adminHeaders(token),
    }),

  setRepairCharges: (token: string, ticketId: number, data: { repairCost: number; notifyCustomer?: boolean; notes?: string }) =>
    safeFetch(getUrl(`/api/admin/tickets/${ticketId}/charges`), {
      method: 'PUT',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  getPaymentReceipt: (token: string, ticketId: number) =>
    safeFetch<{ data: any }>(getUrl(`/api/admin/receipt/ticket/${ticketId}`), {
      headers: adminHeaders(token),
    }),

  bulkUpdateTickets: (token: string, data: { ticketIds: number[]; assignedTechnicianId?: number | null; status?: string }) =>
    safeFetch(getUrl('/api/admin/tickets/bulk'), {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  // Contacts
  getContacts: (token: string, page = 1, limit = 20, search = '', startDate = '', endDate = '') =>
    safeFetch<{ data: PaginatedResponse<Contact> }>(getUrl(`${ENDPOINTS.ADMIN.CONTACTS}?page=${page}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ''}${startDate ? `&startDate=${encodeURIComponent(startDate)}` : ''}${endDate ? `&endDate=${encodeURIComponent(endDate)}` : ''}`), {
      headers: adminHeaders(token),
    }),

  deleteContact: (token: string, id: number) =>
    safeFetch(getUrl(ENDPOINTS.ADMIN.CONTACT_BY_ID(id)), {
      method: 'DELETE',
      headers: adminHeaders(token),
    }),

  bulkDeleteContacts: (token: string, ids: number[]) =>
    safeFetch(getUrl('/api/admin/contacts/bulk-delete'), {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ ids }),
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
  getReports: (
    token: string,
    type: 'daily' | 'monthly' = 'monthly',
    startDate?: string,
    endDate?: string,
    extraParams?: Record<string, string>
  ) => {
    const params = new URLSearchParams();
    params.append('type', type);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value);
        }
      }
    }
    const url = `${ENDPOINTS.ADMIN.REPORTS}?${params.toString()}`;
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
    safeFetch<{ data?: { requiresOtp?: boolean; pendingToken?: string; maskedEmail?: string } }>(getUrl(ENDPOINTS.ADMIN.CHANGE_PASSWORD), {
      method: 'PUT',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  verifyChangePasswordOtp: (token: string, data: { pendingToken: string; otp: string }) =>
    safeFetch<{ data?: { token?: string } }>(getUrl('/api/admin/verify-change-password-otp'), {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify(data),
    }),

  resendChangePasswordOtp: (token: string, data: { pendingToken: string }) =>
    safeFetch(getUrl('/api/admin/resend-change-password-otp'), {
      method: 'POST',
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

  bulkDeleteNotifications: (token: string, ids: number[]) =>
    safeFetch(getUrl('/api/notifications/bulk-delete'), {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ ids }),
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
  getPincodeLocation: async (pincode: string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(`/api/public/pincode/${pincode}`), {
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

  registerCompany: async (data: FormData | Record<string, any>): Promise<SafeResponse<any>> => {
    const isForm = data instanceof FormData;
    const headers: Record<string, string> = {};
    if (!isForm) {
      headers['Content-Type'] = 'application/json';
    }
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.REGISTER), {
      method: 'POST',
      headers,
      body: isForm ? data : JSON.stringify(data),
    });
  },

  getProfile: async (token: string, companyId?: number): Promise<SafeResponse<any>> => {
    const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
    if (companyId) headers['X-Company-ID'] = String(companyId);
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.PROFILE), {
      method: 'GET',
      headers,
    });
  },

  updateProfile: async (token: string, data: FormData | Record<string, any>, companyId?: number): Promise<SafeResponse<any>> => {
    const isForm = data instanceof FormData;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`
    };
    if (companyId) {
      headers['X-Company-ID'] = String(companyId);
    }
    if (!isForm) {
      headers['Content-Type'] = 'application/json';
    }
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.PROFILE), {
      method: 'PUT',
      headers,
      body: isForm ? data : JSON.stringify(data),
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

  getDeviceRepairHistory: async (token: string, id: number | string): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.DEVICE_HISTORY(id)), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  // Repairs
  getRepairs: async (token: string, params?: { approvalStatus?: string; status?: string; search?: string }): Promise<SafeResponse<any>> => {
    let url = getUrl(ENDPOINTS.COMPANY.REPAIRS);
    if (params) {
      const q = new URLSearchParams();
      if (params.approvalStatus) q.set('approvalStatus', params.approvalStatus);
      if (params.status) q.set('status', params.status);
      if (params.search) q.set('search', params.search);
      const qs = q.toString();
      if (qs) url += `?${qs}`;
    }
    return safeFetch<any>(url, {
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

  // Bulk Imports & Exports
  importBulkBranches: async (token: string, file: File): Promise<SafeResponse<any>> => {
    const formData = new FormData();
    formData.append('csvFile', file);
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.BULK_BRANCHES), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
  },

  importBulkEmployees: async (token: string, file: File): Promise<SafeResponse<any>> => {
    const formData = new FormData();
    formData.append('csvFile', file);
    return safeFetch<any>(getUrl(ENDPOINTS.COMPANY.BULK_EMPLOYEES), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
  },

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

  exportBranches: async (token: string, optionsOrId?: number | { id?: number; format?: 'csv' | 'xlsx'; search?: string; status?: string }): Promise<void> => {
    const opts = typeof optionsOrId === 'number' ? { id: optionsOrId } : (optionsOrId || {});
    const params = new URLSearchParams();
    if (opts.id) params.set('id', String(opts.id));
    if (opts.format) params.set('format', opts.format);
    if (opts.search) params.set('search', opts.search);
    if (opts.status) params.set('status', opts.status);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const url = getUrl(`${ENDPOINTS.COMPANY.EXPORT_BRANCHES}${qs}`);
    const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
    const compId = getApiCompanyContext();
    if (compId) headers['X-Company-ID'] = String(compId);
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Failed to export branches.');
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    const ext = opts.format === 'xlsx' ? 'xlsx' : 'csv';
    a.download = opts.id ? `company_branch_${opts.id}_export.${ext}` : `company_branches_export.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },

  exportEmployees: async (token: string, optionsOrId?: number | { id?: number; format?: 'csv' | 'xlsx'; search?: string; status?: string; branch?: string }): Promise<void> => {
    const opts = typeof optionsOrId === 'number' ? { id: optionsOrId } : (optionsOrId || {});
    const params = new URLSearchParams();
    if (opts.id) params.set('id', String(opts.id));
    if (opts.format) params.set('format', opts.format);
    if (opts.search) params.set('search', opts.search);
    if (opts.status) params.set('status', opts.status);
    if (opts.branch) params.set('branch', opts.branch);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const url = getUrl(`${ENDPOINTS.COMPANY.EXPORT_EMPLOYEES}${qs}`);
    const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
    const compId = getApiCompanyContext();
    if (compId) headers['X-Company-ID'] = String(compId);
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Failed to export employees.');
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    const ext = opts.format === 'xlsx' ? 'xlsx' : 'csv';
    a.download = opts.id ? `company_employee_${opts.id}_export.${ext}` : `company_employees_export.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },

  exportDevices: async (token: string, optionsOrId?: number | { id?: number; format?: 'csv' | 'xlsx'; search?: string; status?: string; branch?: string; category?: string }): Promise<void> => {
    const opts = typeof optionsOrId === 'number' ? { id: optionsOrId } : (optionsOrId || {});
    const params = new URLSearchParams();
    if (opts.id) params.set('id', String(opts.id));
    if (opts.format) params.set('format', opts.format);
    if (opts.search) params.set('search', opts.search);
    if (opts.status) params.set('status', opts.status);
    if (opts.branch) params.set('branch', opts.branch);
    if (opts.category) params.set('category', opts.category);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const url = getUrl(`${ENDPOINTS.COMPANY.EXPORT_DEVICES}${qs}`);
    const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
    const compId = getApiCompanyContext();
    if (compId) headers['X-Company-ID'] = String(compId);
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Failed to export devices.');
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    const ext = opts.format === 'xlsx' ? 'xlsx' : 'csv';
    a.download = opts.id ? `company_device_${opts.id}_export.${ext}` : `company_devices_export.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },

  exportRepairs: async (token: string, optionsOrId?: number | { id?: number; format?: 'csv' | 'xlsx'; search?: string; status?: string; priority?: string }): Promise<void> => {
    const opts = typeof optionsOrId === 'number' ? { id: optionsOrId } : (optionsOrId || {});
    const params = new URLSearchParams();
    if (opts.id) params.set('id', String(opts.id));
    if (opts.format) params.set('format', opts.format);
    if (opts.search) params.set('search', opts.search);
    if (opts.status) params.set('status', opts.status);
    if (opts.priority) params.set('priority', opts.priority);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const url = getUrl(`${ENDPOINTS.COMPANY.EXPORT_REPAIRS}${qs}`);
    const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
    const compId = getApiCompanyContext();
    if (compId) headers['X-Company-ID'] = String(compId);
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Failed to export repair tickets.');
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    const ext = opts.format === 'xlsx' ? 'xlsx' : 'csv';
    a.download = opts.id ? `company_repair_ticket_${opts.id}_export.${ext}` : `company_repairs_export.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },

  downloadTemplate: async (token: string, module: 'branches' | 'employees' | 'devices' | 'repairs', format: 'csv' | 'xlsx' = 'csv', samples: boolean = true): Promise<void> => {
    const targetModule = (module as string) === 'tickets' ? 'repairs' : module;
    const url = getUrl(`${ENDPOINTS.COMPANY.TEMPLATES}/${targetModule}?format=${format}&samples=${samples}`);
    const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
    const compId = getApiCompanyContext();
    if (compId) headers['X-Company-ID'] = String(compId);
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to download ${targetModule} template.`);
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `company_${targetModule}_template.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },

  // Activity Logs
  getActivityLogs: async (token: string, page = 1, limit = 20): Promise<SafeResponse<any>> => {
    return safeFetch<any>(getUrl(`${ENDPOINTS.COMPANY.ACTIVITY_LOGS}?page=${page}&limit=${limit}`), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },
};

