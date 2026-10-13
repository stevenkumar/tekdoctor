/**
 * Centralized Application Settings
 * Resolves current environment variables and exposes core settings.
 *
 * VITE_* values are inlined at build time, so the production bundle always
 * reflects client/.env.production. A rebuild + re-upload is required for
 * changes here to reach the live site.
 */

/** Strips any trailing slashes so `${apiUrl}/api/...` can never double up. */
const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim();

export const appConfig = {
  env: (import.meta.env.VITE_APP_ENV || 'development') as 'development' | 'production',
  /**
   * Base URL every API call is prefixed with, e.g. "https://thetekdoctor.com".
   * Empty means "same origin", which is what local dev uses via the Vite proxy.
   */
  apiUrl: trimTrailingSlash(rawApiUrl),
  appName: 'The Tek Doctor',
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim(),
  recaptchaSiteKey: (import.meta.env.VITE_RECAPTCHA_SITE_KEY || '').trim(),
  isProduction: import.meta.env.PROD as boolean,
  isDevelopment: import.meta.env.DEV as boolean,
} as const;
