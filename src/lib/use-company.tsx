import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './auth-context';

interface CompanyContextType {
  companyId: string | null;
  companyName: string | null;
  companyLogo: string | null;
  isSuperAdmin: boolean;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const profile = auth?.profile;
  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';

  useEffect(() => {
    console.log('CompanyProvider - Profile updated:', profile);
    console.log('CompanyProvider - isSuperAdmin:', isSuperAdmin);
    console.log('CompanyProvider - profile.company_id:', profile?.company_id);

    if (!isSuperAdmin && profile?.company_id) {
      console.log('Setting selectedCompanyId to:', profile.company_id);
      setSelectedCompanyId(profile.company_id);
    }
  }, [profile?.company_id, isSuperAdmin, profile]);

  const companyId = isSuperAdmin ? selectedCompanyId : profile?.company_id || null;

  useEffect(() => {
    console.log('CompanyProvider - Computed companyId:', companyId);
  }, [companyId]);

  const value = {
    companyId,
    companyName: profile?.companies?.name || null,
    companyLogo: profile?.companies?.logo_url || null,
    isSuperAdmin,
    selectedCompanyId,
    setSelectedCompanyId,
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
