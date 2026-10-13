import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { adminApi, companyApi } from '../services/api';
import { setApiCompanyContext, getApiCompanyContext } from '../utils/api';
import { useLocation } from 'react-router-dom';

export interface CompanyItem {
  id: number;
  name: string;
  email: string;
  phone?: string;
  company_name?: string;
  company_logo?: string;
  contact_person?: string;
  address?: string;
  gst_number?: string;
  website_url?: string;
  is_active?: boolean | number;
  company_id?: string;
  permanent_company_id?: string;
  amc_status?: string;
  total_branches?: number;
  total_employees?: number;
  total_devices?: number;
  total_tickets?: number;
}

export interface CompanyProfileDetails {
  id?: number;
  company_name?: string;
  company_logo?: string;
  contact_person?: string;
  phone?: string;
  phone_number?: string;
  address?: string;
  gst_number?: string;
  website_url?: string;
  social_facebook?: string;
  social_instagram?: string;
  social_twitter?: string;
  social_linkedin?: string;
}

interface CompanyContextType {
  selectedCompanyId: number | null;
  selectedCompany: CompanyItem | null;
  companies: CompanyItem[];
  companyProfile: CompanyProfileDetails | null;
  loadingCompanies: boolean;
  setSelectedCompanyId: (id: number | null) => void;
  refreshCompanies: () => Promise<void>;
  refreshCompanyProfile: () => Promise<void>;
  isAdminManagingCompany: boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, token, hasRole } = useAuth();
  const location = useLocation();

  const isAdmin = hasRole('admin');
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfileDetails | null>(null);
  const [loadingCompanies, setLoadingCompanies] = useState<boolean>(false);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<number | null>(() => {
    if (!isAdmin) {
      return user?.id || null;
    }
    // Check URL search param first
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlId = params.get('companyId');
      if (urlId && !isNaN(parseInt(urlId, 10))) {
        return parseInt(urlId, 10);
      }
    }
    return getApiCompanyContext();
  });

  // Sync API layer context whenever selectedCompanyId changes
  const setSelectedCompanyId = useCallback((id: number | null) => {
    setSelectedCompanyIdState(id);
    setApiCompanyContext(id);
  }, []);

  // Fetch company list for Admin
  const fetchCompanies = useCallback(async () => {
    if (!isAdmin || !token) return;
    setLoadingCompanies(true);
    try {
      const res = await adminApi.getCompanies(token, 1, 100, '', '');
      if (res.ok && res.data) {
        const payload: any = res.data.data || res.data;
        const list: CompanyItem[] = Array.isArray(payload)
          ? payload
          : (payload.data || payload.companies || []);

        // Normalize company display name
        const normalized = list.map((c: any) => ({
          ...c,
          company_name: c.company_name || c.name || `Company #${c.id}`
        }));

        setCompanies(normalized);

        // Auto-select if none currently selected or current selection is invalid
        setSelectedCompanyIdState((current) => {
          if (current && normalized.some(c => c.id === current)) {
            setApiCompanyContext(current);
            return current;
          }
          if (normalized.length > 0) {
            const firstId = normalized[0].id;
            setApiCompanyContext(firstId);
            return firstId;
          }
          return null;
        });
      }
    } catch (err) {
      console.error('[CompanyContext] Failed to fetch companies list:', err);
    } finally {
      setLoadingCompanies(false);
    }
  }, [isAdmin, token]);

  // Fetch specific company profile for company users
  const fetchCompanyProfile = useCallback(async () => {
    if (!token) return;
    try {
      const res = await companyApi.getProfile(token);
      if (res.ok && res.data && (res.data as any).data) {
        const profileData = (res.data as any).data as CompanyProfileDetails;
        setCompanyProfile(profileData);
      }
    } catch (err) {
      console.error('[CompanyContext] Failed to fetch company profile:', err);
    }
  }, [token]);

  useEffect(() => {
    if (isAdmin) {
      fetchCompanies();
    } else if (user) {
      setSelectedCompanyIdState(user.id);
      setApiCompanyContext(null); // Company users don't need header override
      fetchCompanyProfile();
    }
  }, [isAdmin, user, fetchCompanies, fetchCompanyProfile]);

  // Read URL query parameter changes if user switches via URL
  useEffect(() => {
    if (!isAdmin) return;
    const params = new URLSearchParams(location.search);
    const urlCompId = params.get('companyId');
    if (urlCompId) {
      const parsed = parseInt(urlCompId, 10);
      if (!isNaN(parsed) && parsed !== selectedCompanyId) {
        setSelectedCompanyId(parsed);
      }
    }
  }, [location.search, isAdmin, selectedCompanyId, setSelectedCompanyId]);

  const selectedCompany: CompanyItem | null = useMemo(() => {
    if (isAdmin) {
      return companies.find(c => c.id === selectedCompanyId) || null;
    }
    if (!user) return null;
    return {
      id: user.id,
      name: companyProfile?.company_name || user.name,
      email: user.email,
      phone: companyProfile?.phone || (companyProfile as any)?.phone_number || (user as any).phone || '',
      company_name: companyProfile?.company_name || user.name,
      company_logo: companyProfile?.company_logo || user.avatar_url,
      contact_person: companyProfile?.contact_person,
      address: companyProfile?.address,
      gst_number: companyProfile?.gst_number,
      website_url: companyProfile?.website_url,
    };
  }, [isAdmin, companies, selectedCompanyId, user, companyProfile]);

  return (
    <CompanyContext.Provider
      value={{
        selectedCompanyId,
        selectedCompany,
        companies,
        companyProfile,
        loadingCompanies,
        setSelectedCompanyId,
        refreshCompanies: fetchCompanies,
        refreshCompanyProfile: fetchCompanyProfile,
        isAdminManagingCompany: isAdmin,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompanyContext = (): CompanyContextType => {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error('useCompanyContext must be used within a CompanyProvider');
  }
  return ctx;
};
