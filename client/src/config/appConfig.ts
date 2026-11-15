/**
 * Centralized Application Settings
 * Resolves current environment variables and exposes core settings.
 *
 * VITE_* values are inlined at build time, so the production bundle always
 * reflects client/.env.production. A rebuild + re-upload is required for
 * changes here to reach the live site.
 */

/** Strips any trailing slashes so `${url}/...` can never double up. */
const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const rawApiUrl = (import.meta.env.VITE_API_URL || '/api').trim();
const rawFrontendUrl = (import.meta.env.VITE_FRONTEND_URL || import.meta.env.VITE_PUBLIC_URL || '').trim();

export const appConfig = {
  env: (import.meta.env.VITE_APP_ENV || 'development') as 'development' | 'production',
  /**
   * Base URL every API call is prefixed with.
   * Defaults to relative '/api' for single-origin deployments.
   */
  apiUrl: trimTrailingSlash(rawApiUrl) || '/api',
  /**
   * Dedicated public frontend base URL used for public verification URLs and QR codes.
   * In single-origin deployments, falls back to window.location.origin.
   */
  frontendUrl: trimTrailingSlash(rawFrontendUrl),
  appName: 'The Tek Doctor',
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim(),
  recaptchaSiteKey: (import.meta.env.VITE_RECAPTCHA_SITE_KEY || '').trim(),
  isProduction: import.meta.env.PROD as boolean,
  isDevelopment: import.meta.env.DEV as boolean,
} as const;
