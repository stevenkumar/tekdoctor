import { appConfig } from '@/config/appConfig';

/**
 * Resolves a media URL (e.g. a stored logo_url from the database) to a fully
 * qualified URL that can be used in an <img> src attribute.
 *
 * - Absolute URLs (starting with "http") are returned as-is.
 * - Relative paths like "/uploads/logo.png" are prefixed with:
 *   - http://localhost:5000 in development
 *   - The configured VITE_API_URL in production
 */
export function getMediaUrl(url: string): string {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (appConfig.isDevelopment) {
        return `http://localhost:5000${url.startsWith('/') ? '' : '/'}${url}`;
    }
    const base = appConfig.apiUrl.endsWith('/') ? appConfig.apiUrl.slice(0, -1) : appConfig.apiUrl;
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Returns true if the given URL is a server-hosted relative path
 * (e.g. "/uploads/logo.png"), as opposed to an external http URL.
 */
export function isUploadPath(url: string): boolean {
    return !!url && !url.startsWith('http');
}
