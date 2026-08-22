import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { publicApi } from '@/services/api';

interface SiteContextType {
    settings: Record<string, Record<string, string>>;
    homepage: Record<string, any>;
    loading: boolean;
    flattenedSettings: Record<string, string>;
    refreshSiteData: () => Promise<void>;
}

const SiteContext = createContext<SiteContextType>({
    settings: {},
    homepage: {},
    loading: true,
    flattenedSettings: {},
    refreshSiteData: async () => { },
});

export const useSiteContext = () => useContext(SiteContext);

/**
 * Convert a hex color string (#rrggbb) to an "r, g, b" string
 * for use in rgba() with CSS variables.
 */
function hexToRgb(hex: string): string {
    const clean = hex.replace('#', '');
    const bigint = parseInt(clean, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
}

export const SiteProvider = ({ children }: { children: ReactNode }) => {
    const [settings, setSettings] = useState({});
    const [flattenedSettings, setFlattenedSettings] = useState<Record<string, string>>({});
    const [homepage, setHomepage] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSiteData = async () => {
            try {
                const res = await publicApi.getSiteData();
                if (res.ok && res.data) {
                    const { settings: sData, homepage: hData } = (res.data as any).data;
                    setSettings(sData || {});
                    setHomepage(hData || {});

                    const flat: Record<string, string> = {};
                    if (sData) {
                        Object.entries(sData).forEach(([, keys]: any) => {
                            Object.entries(keys).forEach(([k, v]: any) => { flat[k] = v; });
                        });
                    }
                    setFlattenedSettings(flat);

                    // Apply global theme color variables
                    // The DB stores the key as "theme_primary_color" in group "theme"
                    // Also support the branding group key "primary_color"
                    const primaryColor = flat.theme_primary_color || flat.primary_color;
                    if (primaryColor) {
                        const rgb = hexToRgb(primaryColor);
                        document.documentElement.style.setProperty('--color-neon-cyan', primaryColor);
                        document.documentElement.style.setProperty('--neon-cyan', primaryColor);
                        document.documentElement.style.setProperty('--neon-cyan-rgb', rgb);
                        // Update glow/border vars to use the dynamic color
                        document.documentElement.style.setProperty('--neon-border', `1px solid rgba(${rgb}, 0.5)`);
                        document.documentElement.style.setProperty('--neon-glow', `0 0 10px rgba(${rgb}, 0.3)`);
                    }

                    const secondaryColor = flat.theme_secondary_color || flat.secondary_color;
                    if (secondaryColor) {
                        document.documentElement.style.setProperty('--color-neon-teal', secondaryColor);
                        document.documentElement.style.setProperty('--neon-teal', secondaryColor);
                    }
                }
            } catch (err) {
                console.error('Failed to load dynamic site settings', err);
            } finally {
                setLoading(false);
            }
        };
        fetchSiteData();
    }, []);

    const refreshSiteData = async () => {
        try {
            const res = await publicApi.getSiteData();
            if (res.ok && res.data) {
                const { settings: sData, homepage: hData } = (res.data as any).data;
                setSettings(sData || {});
                setHomepage(hData || {});

                const flat: Record<string, string> = {};
                if (sData) {
                    Object.entries(sData).forEach(([, keys]: any) => {
                        Object.entries(keys).forEach(([k, v]: any) => { flat[k] = v; });
                    });
                }
                setFlattenedSettings(flat);

                const primaryColor = flat.theme_primary_color || flat.primary_color;
                if (primaryColor) {
                    const rgb = hexToRgb(primaryColor);
                    document.documentElement.style.setProperty('--color-neon-cyan', primaryColor);
                    document.documentElement.style.setProperty('--neon-cyan', primaryColor);
                    document.documentElement.style.setProperty('--neon-cyan-rgb', rgb);
                    document.documentElement.style.setProperty('--neon-border', `1px solid rgba(${rgb}, 0.5)`);
                    document.documentElement.style.setProperty('--neon-glow', `0 0 10px rgba(${rgb}, 0.3)`);
                }

                const secondaryColor = flat.theme_secondary_color || flat.secondary_color;
                if (secondaryColor) {
                    document.documentElement.style.setProperty('--color-neon-teal', secondaryColor);
                    document.documentElement.style.setProperty('--neon-teal', secondaryColor);
                }
            }
        } catch (err) {
            console.error('Failed to load dynamic site settings', err);
        }
    };

    return (
        <SiteContext.Provider value={{ settings, homepage, loading, flattenedSettings, refreshSiteData }}>
            {children}
        </SiteContext.Provider>
    );
};
