import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { companyApi } from '../services/api';

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
  company_id?: string;
  permanent_company_id?: string;
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
  const { user, token } = useAuth();
  const [companyProfile, setCompanyProfile] = useState<CompanyProfileDetails | null>(null);

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
    if (user && user.role === 'company') {
      fetchCompanyProfile();
    }
  }, [user, fetchCompanyProfile]);

  const selectedCompanyId = user?.id || null;

  const selectedCompany: CompanyItem | null = useMemo(() => {
    if (!user) return null;
    const canonicalCompId = user.company_id || user.permanent_company_id || companyProfile?.company_id || (companyProfile as any)?.permanent_company_id || (user.id ? `CMP-${String(user.id).padStart(3, '0')}` : 'CMP-001');
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
      company_id: canonicalCompId,
      permanent_company_id: canonicalCompId,
    };
  }, [user, companyProfile]);

  return (
    <CompanyContext.Provider
      value={{
        selectedCompanyId,
        selectedCompany,
        companies: [],
        companyProfile,
        loadingCompanies: false,
        setSelectedCompanyId: () => {},
        refreshCompanies: async () => {},
        refreshCompanyProfile: fetchCompanyProfile,
        isAdminManagingCompany: false,
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
