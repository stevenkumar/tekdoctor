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
}

export async function safeFetch<T = Record<string, unknown>>(
  url: string,
  options?: RequestInit
): Promise<SafeResponse<T>> {
  try {
    const response = await fetch(url, options);

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
      // Extract message from the standard error shape { success, message }
      const message =
        (data as unknown as { message?: string })?.message ||
        `Request failed with status ${response.status}.`;
      return { ok: false, status: response.status, data, error: message };
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
