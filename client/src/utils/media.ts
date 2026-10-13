import { appConfig } from '@/config/appConfig';

/**
 * Resolves a media URL (e.g. a stored logo_url from the database) to a fully
 * qualified URL that can be used in an <img> src attribute.
 *
 * - Absolute URLs (starting with "http") are returned as-is.
 * - Relative paths like "/uploads/logo.png" are prefixed with:
 *   - The configured VITE_API_URL in production
 *   - The current window origin (dev proxy / same-origin deployment)
 */
export function getMediaUrl(url: string): string {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const base = appConfig.apiUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Returns true if the given URL is a server-hosted relative path
 * (e.g. "/uploads/logo.png"), as opposed to an external http URL.
 */
export function isUploadPath(url: string): boolean {
    return !!url && !url.startsWith('http');
}
