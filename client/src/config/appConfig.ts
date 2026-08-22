/**
 * Centralized Application Settings
 * Resolves current environment variables and exposes core settings.
 */

export const appConfig = {
  env: (import.meta.env.VITE_APP_ENV || 'development') as 'development' | 'production',
  apiUrl: (import.meta.env.VITE_API_URL || '') as string,
  appName: 'The Tek Doctor',
  isProduction: import.meta.env.PROD as boolean,
  isDevelopment: import.meta.env.DEV as boolean,
} as const;
