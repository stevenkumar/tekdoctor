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
    if (activeCompanyIdContext) {
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
      if (!headersRecord['X-Company-ID'] && !headersRecord['x-company-id']) {
        headersRecord['X-Company-ID'] = String(activeCompanyIdContext);
      }
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
