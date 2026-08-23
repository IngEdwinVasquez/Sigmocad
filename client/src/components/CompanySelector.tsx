import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Building2, Check } from 'lucide-react';

interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  status: string;
}

interface CompanySelectorProps {
  onCompanySelect: (companyId: string | null) => void;
  selectedCompanyId: string | null;
}

export function CompanySelector({ onCompanySelect, selectedCompanyId }: CompanySelectorProps) {
  const { profile } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    setLoading(true);
    api
      .get<Company[]>('/api/companies')
      .then((data) => {
        if (cancelled) return;
        setCompanies(data);
        // Auto-select the first company if the stored one no longer exists
        if (data.length > 0 && (!selectedCompanyId || !data.some((c) => c.id === selectedCompanyId))) {
          onCompanySelect(data[0].id);
        }
      })
      .catch(() => setCompanies([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-sm font-medium transition-all duration-200 border border-slate-700/50"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Building2 className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <div className="text-left min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">Viendo datos de:</p>
            <p className="text-sm text-slate-200 truncate">
              {selectedCompany ? selectedCompany.name : 'Todas las empresas'}
            </p>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
          <button
            onClick={() => {
              onCompanySelect(null);
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-700 transition-colors ${
              !selectedCompanyId ? 'bg-slate-700' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-slate-400" />
              <span className="text-sm text-slate-200 font-medium">Todas las empresas</span>
            </div>
            {!selectedCompanyId && <Check className="w-5 h-5 text-green-500" />}
          </button>

          <div className="border-t border-slate-700"></div>

          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">Cargando empresas...</div>
          ) : companies.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">No hay empresas disponibles</div>
          ) : (
            companies.map((company) => (
              <button
                key={company.id}
                onClick={() => {
                  onCompanySelect(company.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-700 transition-colors ${
                  selectedCompanyId === company.id ? 'bg-slate-700' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {company.logo_url ? (
                    <img src={company.logo_url} alt={company.name} className="w-8 h-8 rounded object-contain bg-white p-1" />
                  ) : (
                    <Building2 className="w-5 h-5 text-slate-400" />
                  )}
                  <span className="text-sm text-slate-200 truncate">{company.name}</span>
                </div>
                {selectedCompanyId === company.id && <Check className="w-5 h-5 text-green-500 flex-shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
