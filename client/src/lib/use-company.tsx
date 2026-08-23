import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useAuth } from './auth-context';
import { setCompanyHeader, getStoredCompanyId } from './api';

interface CompanyContextType {
  /** Effective company for data queries (null = all companies, SUPER_ADMIN only). */
  companyId: string | null;
  companyName: string | null;
  companyLogo: string | null;
  isSuperAdmin: boolean;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';
  const [selectedCompanyId, setSelected] = useState<string | null>(() => (isSuperAdmin ? getStoredCompanyId() : null));

  const setSelectedCompanyId = useCallback((id: string | null) => {
    setSelected(id);
    setCompanyHeader(id);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) {
      // Regular users are always scoped server-side to their own company.
      setCompanyHeader(null);
      setSelected(profile?.company_id || null);
    } else {
      setCompanyHeader(selectedCompanyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, profile?.company_id]);

  const companyId = isSuperAdmin ? selectedCompanyId : profile?.company_id || null;

  const value: CompanyContextType = {
    companyId,
    companyName: profile?.companies?.name || null,
    companyLogo: profile?.companies?.logo_url || null,
    isSuperAdmin,
    selectedCompanyId,
    setSelectedCompanyId,
  };

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
