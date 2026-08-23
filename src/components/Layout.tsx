import { ReactNode } from 'react';
import { useAuth } from '../lib/auth-context';
import { useCompany } from '../lib/use-company';
import { Button } from './ui/Button';
import { CompanySelector } from './CompanySelector';
import {
  LayoutDashboard,
  MonitorPlay,
  Radio,
  Grid3x3,
  Image,
  Link2,
  BarChart3,
  Code,
  LogOut,
  Newspaper,
  Settings,
  Building2,
  Users,
  FileText,
  Rss,
  Mail
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const navigation = [
  { id: 'dashboard', name: 'Inicio', icon: LayoutDashboard, adminOnly: false },
  { id: 'media', name: 'Medios Digitales', icon: MonitorPlay, adminOnly: false },
  { id: 'traditional-media', name: 'Medios: TV y Radio', icon: Radio, adminOnly: false },
  { id: 'slots', name: 'Espacios', icon: Grid3x3, adminOnly: false },
  { id: 'creatives', name: 'Campaña', icon: Image, adminOnly: false },
  { id: 'assignments', name: 'Asignaciones', icon: Link2, adminOnly: false },
  { id: 'metrics', name: 'Métricas', icon: BarChart3, adminOnly: false },
  { id: 'snippets', name: 'Código', icon: Code, adminOnly: false },
  { id: 'divider', name: '', icon: null, adminOnly: false },
  { id: 'news', name: 'Noticias', icon: Newspaper, adminOnly: false },
  { id: 'media-monitoring', name: 'Monitoreo de Medios', icon: Rss, adminOnly: false },
  { id: 'media-reports', name: 'Reporte de Medios', icon: FileText, adminOnly: false },
  { id: 'email-history', name: 'Historial de Correos', icon: Mail, adminOnly: false },
];

const adminNavigation = [
  { id: 'companies', name: 'Empresas', icon: Building2 },
  { id: 'users', name: 'Usuarios', icon: Users },
];

export function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { signOut, user, profile } = useAuth();
  const { isSuperAdmin, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const isAdmin = profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN';
  const companyLogo = profile?.institution_logo_url || profile?.companies?.logo_url;
  const companyName = profile?.institution_name || profile?.companies?.name;
  const websiteUrl = profile?.companies?.website_url;

  console.log('=== LAYOUT DEBUG ===');
  console.log('User:', user?.email);
  console.log('Profile:', profile);
  console.log('Is Admin:', isAdmin);
  console.log('Profile Role:', profile?.role);
  console.log('Company Logo:', companyLogo);
  console.log('Company Name:', companyName);
  console.log('Institution Logo:', profile?.institution_logo_url);
  console.log('Institution Name:', profile?.institution_name);
  console.log('==================');

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-72 bg-gradient-to-b from-slate-900 to-slate-800 flex flex-col shadow-xl border-r border-slate-700">
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex flex-col items-center gap-3">
            {companyLogo && (
              <div className="bg-white rounded-lg p-3 shadow-md w-full flex justify-center">
                <img src={companyLogo} alt={companyName || 'Logo'} className="h-12 w-auto object-contain" />
              </div>
            )}
            <div className="text-center w-full">
              <h1 className="text-xl font-bold text-white mb-1">SIGMOCAD</h1>
              {companyName && (
                <p className="text-sm text-slate-300 font-medium">{companyName}</p>
              )}
            </div>
          </div>
        </div>

        <div className="px-3 py-2 border-b border-slate-700/50">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <p className="text-xs font-medium text-slate-400 mb-1">Usuario</p>
            <p className="text-sm text-slate-200 truncate font-medium">{profile?.full_name || user?.email}</p>
            {isSuperAdmin && (
              <span className="inline-flex items-center px-2 py-0.5 mt-1 text-xs font-medium rounded bg-yellow-500 text-yellow-900">
                Master Admin
              </span>
            )}
          </div>
        </div>

        {isSuperAdmin && (
          <div className="px-3 py-2 border-b border-slate-700/50">
            <CompanySelector
              onCompanySelect={setSelectedCompanyId}
              selectedCompanyId={selectedCompanyId}
            />
          </div>
        )}

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            if (item.id === 'divider') {
              return <div key="divider" className="my-2 border-t border-slate-700"></div>;
            }
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-lg shadow-blue-500/25'
                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.name}</span>
              </button>
            );
          })}

          {isAdmin && (
            <>
              <div className="pt-4 pb-2 px-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <Settings className="w-4 h-4" />
                  <span>Administrador</span>
                </div>
              </div>
              {adminNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-lg shadow-blue-500/25'
                        : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span>{item.name}</span>
                  </button>
                );
              })}
            </>
          )}
        </nav>

        <div className="p-3 border-t border-slate-700/50">
          <Button
            variant="ghost"
            onClick={signOut}
            className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800/50"
          >
            <LogOut className="w-5 h-5 mr-3" />
            Cerrar Sesión
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
          <div className="px-8 py-4 max-w-[1600px] mx-auto">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{companyName || 'SIGMOCAD'}</h2>
              <p className="text-sm text-slate-500">Sistema de Gestión de Medios y Contenido Publicitario Digital</p>
            </div>
          </div>
        </div>
        <div className="p-8 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
