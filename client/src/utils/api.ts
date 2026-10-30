import { appConfig } from '@/config/appConfig';

/**
 * safeFetch — A safe wrapper around the Fetch API.
 *
 * Prevents the "Unexpected token '<'" crash that occurs when the server
 * returns an HTML error page (e.g. 502 Bad Gateway, cPanel error) instead
 * of JSON. Also normalizes the response shape for all API calls.
 *
 * @param url     The API endpoint to call
 * @param options Standard RequestInit options
 * @returns       { ok, status, data, error }
 */
export interface SafeResponse<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string;
  errors?: Record<string, string>;
}

// Global active company ID context for multi-tenant admin inspection
let activeCompanyIdContext: number | null = (() => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('tekdoctor_admin_selected_company_id');
    if (saved && !isNaN(parseInt(saved, 10))) {
      return parseInt(saved, 10);
    }
  }
  return null;
})();

export function setApiCompanyContext(companyId: number | null) {
  activeCompanyIdContext = companyId;
  if (typeof window !== 'undefined') {
    if (companyId) {
      localStorage.setItem('tekdoctor_admin_selected_company_id', String(companyId));
    } else {
      localStorage.removeItem('tekdoctor_admin_selected_company_id');
    }
  }
}

export function getApiCompanyContext(): number | null {
  return activeCompanyIdContext;
}

export async function safeFetch<T = Record<string, unknown>>(
  url: string,
  options?: RequestInit
): Promise<SafeResponse<T>> {
  try {
    let finalOptions = options;
    const headersRecord: Record<string, string> = {};
    if (options?.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((v, k) => { headersRecord[k] = v; });
      } else if (Array.isArray(options.headers)) {
        options.headers.forEach(([k, v]) => { headersRecord[k] = v; });
      } else {
        Object.assign(headersRecord, options.headers);
      }
    }
    if (activeCompanyIdContext) {
      if (!headersRecord['X-Company-ID'] && !headersRecord['x-company-id']) {
        headersRecord['X-Company-ID'] = String(activeCompanyIdContext);
      }
    }
    // Automatically set application/json for stringified JSON payloads if not explicitly set
    if (options?.body && typeof options.body === 'string' && !headersRecord['Content-Type'] && !headersRecord['content-type']) {
      const trimmed = options.body.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        headersRecord['Content-Type'] = 'application/json';
      }
    }
    if (Object.keys(headersRecord).length > 0) {
      finalOptions = {
        ...options,
        headers: headersRecord,
      };
    }

    const response = await fetch(url, finalOptions);

    // Check Content-Type before attempting JSON.parse.
    // If the server is down or cPanel returns an HTML error page,
    // response.json() will throw "Unexpected token '<'".
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!isJson) {
      // Server returned non-JSON (HTML error page, plain text, etc.)
      console.error(`[safeFetch] Non-JSON response from ${url} — status: ${response.status}`);
      const errorMessage = response.status >= 500
        ? 'Server error. Please try again later.'
        : (response.status === 404 ? 'The requested resource was not found.' : 'Unexpected server response. Please try again.');

      return {
        ok: false,
        status: response.status,
        data: { success: false, message: errorMessage } as unknown as T,
        error: errorMessage,
      };
    }

    const data = await response.json() as T;

    if (!response.ok) {
      // Extract message from the standard error shape { success, message, errors }
      let message =
        (data as unknown as { message?: string })?.message ||
        `Request failed with status ${response.status}.`;

      const errorObj = (data as unknown as { errors?: Record<string, string> })?.errors;
      if (errorObj && typeof errorObj === 'object') {
        const fieldErrors = Object.values(errorObj).filter(Boolean);
        if (fieldErrors.length > 0 && (!message || message === 'Validation failed.')) {
          message = fieldErrors[0];
        }
      }

      return { ok: false, status: response.status, data, error: message, errors: errorObj };
    }

    return { ok: true, status: response.status, data, error: '' };
  } catch (err: unknown) {
    // Network error, DNS failure, CORS block, etc.
    const message =
      err instanceof Error ? err.message : 'Network error. Check your connection.';
    console.error(`[safeFetch] Network error for ${url}:`, message);
    return { ok: false, status: 0, data: null, error: message };
  }
}

/**
 * Convenience helper: build the Authorization header from a JWT token.
 */
export function authHeader(token: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Safely extracts an array/list payload from a SafeResponse.
 * Unpacks backend envelope { success: true, data: [...] } or direct array [...],
 * returning fallback [] if not an array.
 */
export function extractResponseList<T = any>(res: SafeResponse<any> | null | undefined): T[] {
  if (!res || !res.ok || !res.data) return [];
  // Case 1: Backend standard formatResponse envelope { success: true, data: [...] }
  if (res.data && typeof res.data === 'object' && 'data' in res.data && Array.isArray((res.data as any).data)) {
    return (res.data as any).data as T[];
  }
  // Case 2: Direct array in res.data
  if (Array.isArray(res.data)) {
    return res.data as T[];
  }
  // Case 3: Paginated backend envelope { success: true, data: { data: [...], pagination: {...} } }
  if (res.data && typeof res.data === 'object' && 'data' in res.data && (res.data as any).data && typeof (res.data as any).data === 'object') {
    const inner = (res.data as any).data;
    if (Array.isArray(inner.data)) return inner.data as T[];
    if (Array.isArray(inner.companies)) return inner.companies as T[];
    if (Array.isArray(inner.contracts)) return inner.contracts as T[];
    if (Array.isArray(inner.requests)) return inner.requests as T[];
    if (Array.isArray(inner.plans)) return inner.plans as T[];
    if (Array.isArray(inner.replacements)) return inner.replacements as T[];
    if (Array.isArray(inner.devices)) return inner.devices as T[];
  }
  // Case 4: Named entity collections in res.data
  if (res.data && typeof res.data === 'object') {
    const obj = res.data as any;
    if (Array.isArray(obj.companies)) return obj.companies as T[];
    if (Array.isArray(obj.contracts)) return obj.contracts as T[];
    if (Array.isArray(obj.requests)) return obj.requests as T[];
    if (Array.isArray(obj.plans)) return obj.plans as T[];
    if (Array.isArray(obj.replacements)) return obj.replacements as T[];
    if (Array.isArray(obj.devices)) return obj.devices as T[];
  }
  return [];
}

/**
 * Safely extracts an object payload from a SafeResponse.
 * Unpacks backend envelope { success: true, data: {...} } or direct object {...}.
 */
export function extractResponseData<T = any>(res: SafeResponse<any> | null | undefined, fallback: T): T {
  if (!res || !res.ok || !res.data) return fallback;
  if (res.data && typeof res.data === 'object' && 'data' in res.data && (res.data as any).data !== null && (res.data as any).data !== undefined) {
    return (res.data as any).data as T;
  }
  if (typeof res.data === 'object' && res.data !== null) {
    return res.data as T;
  }
  return fallback;
}

/**
 * Formats a date value (ISO string, YYYY-MM-DD, or Date object) into a clean, human-readable date.
 * Example: "2026-10-30" or "2026-10-29T18:30:00.000Z" -> "30 Oct 2026"
 * Protects against raw ISO strings and timezone shifting on date-only values.
 */
export function formatDisplayDate(dateInput: string | Date | null | undefined, fallback: string = 'N/A'): string {
  if (!dateInput) return fallback;
  try {
    let d: Date;
    if (typeof dateInput === 'string') {
      const clean = dateInput.trim();
      if (!clean) return fallback;
      if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        const [year, month, day] = clean.split('-').map(Number);
        d = new Date(year, month - 1, day);
      } else {
        d = new Date(clean);
      }
    } else {
      d = new Date(dateInput);
    }
    if (isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return String(dateInput);
  }
}

/**
 * Resolves an uploaded file path to a fully qualified URL.
 * Handles full URLs, data URLs, relative paths, and leading slash normalization.
 */
export function getFileUrl(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('data:')) {
    return filePath;
  }
  const base = (appConfig.apiUrl || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  const cleanPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
  return `${base}${cleanPath}`;
}
