import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../config/routes';
import { useSiteContext } from '../context/SiteContext';
import { appConfig } from '../config/appConfig';
import { getMediaUrl } from '../utils/media';

export default function TitleManager() {
    const location = useLocation();
    const { role } = useAuth();
    const { flattenedSettings } = useSiteContext();



    useEffect(() => {
        const path = location.pathname;
        const appName = flattenedSettings.company_name || appConfig.appName;
        let baseTitle = appName.toUpperCase();

        // Dashboard specific overrides based on role area access
        if (path.startsWith('/admin')) {
            baseTitle = `${appName.toUpperCase()} - ADMIN`;
        } else if (path.startsWith('/company')) {
            baseTitle = `${appName.toUpperCase()} - COMPANY`;
        } else if (path.startsWith('/technician')) {
            baseTitle = `${appName.toUpperCase()} - TECHNICIAN`;
        } else {
            // Public pages
            switch (path) {
                case ROUTES.HOME:
                    baseTitle = `${appName.toUpperCase()} - Home`;
                    break;
                case ROUTES.ABOUT:
                    baseTitle = `${appName.toUpperCase()} - About Us`;
                    break;
                case ROUTES.SERVICES:
                    baseTitle = `${appName.toUpperCase()} - Services`;
                    break;
                case ROUTES.REPAIR:
                    baseTitle = `${appName.toUpperCase()} - Repair Booking`;
                    break;
                case ROUTES.REPAIR_STATUS:
                    baseTitle = `${appName.toUpperCase()} - Repair Status`;
                    break;
                case ROUTES.PROFILE:
                    baseTitle = `${appName.toUpperCase()} - Repair History`;
                    break;
                case ROUTES.SHOP:
                case ROUTES.SHOP_V2:
                    baseTitle = `${appName.toUpperCase()} - Shop`;
                    break;
                case ROUTES.CONTACT:
                    baseTitle = `${appName.toUpperCase()} - Contact`;
                    break;
                case ROUTES.SIGN_IN:
                    baseTitle = `${appName.toUpperCase()} - Login`;
                    break;
                case ROUTES.SIGN_UP:
                    baseTitle = `${appName.toUpperCase()} - Register`;
                    break;
                default:
                    baseTitle = appName.toUpperCase();
            }
        }

        // Apply meta title if available and we are on a page where it applies (like public pages)
        if (flattenedSettings.meta_title && !path.startsWith('/admin') && !path.startsWith('/company') && !path.startsWith('/technician')) {
            document.title = `${flattenedSettings.meta_title} | ${baseTitle}`;
        } else {
            document.title = baseTitle;
        }

        // Update favicon if provided
        if (flattenedSettings.favicon_url) {
            let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = getMediaUrl(flattenedSettings.favicon_url);
            // Remove 'type' attribute to allow browser auto-detection of PNG/JPEG/ICO formats
            link.removeAttribute('type');
        }

        // Update meta description (only on public pages to avoid polluting admin dashboards)
        if (!path.startsWith('/admin') && !path.startsWith('/company') && !path.startsWith('/technician')) {
            if (flattenedSettings.meta_description) {
                let metaDesc: HTMLMetaElement | null = document.querySelector("meta[name='description']");
                if (!metaDesc) {
                    metaDesc = document.createElement('meta');
                    metaDesc.name = 'description';
                    document.head.appendChild(metaDesc);
                }
                metaDesc.content = flattenedSettings.meta_description;
            }

            // Update meta keywords
            if (flattenedSettings.meta_keywords) {
                let metaKeywords: HTMLMetaElement | null = document.querySelector("meta[name='keywords']");
                if (!metaKeywords) {
                    metaKeywords = document.createElement('meta');
                    metaKeywords.name = 'keywords';
                    document.head.appendChild(metaKeywords);
                }
                metaKeywords.content = flattenedSettings.meta_keywords;
            }
        }
    }, [location, role, flattenedSettings]);

    return null;
}
