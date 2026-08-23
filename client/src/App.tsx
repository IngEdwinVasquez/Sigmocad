import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/auth-context';
import { CompanyProvider, useCompany } from './lib/use-company';
import { getPublicConfig } from './lib/api';
import { Auth } from './pages/Auth';
import { Register } from './pages/Register';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { News } from './pages/News';
import { Media } from './pages/Media';
import { TraditionalMedia } from './pages/TraditionalMedia';
import { Slots } from './pages/Slots';
import { Creatives } from './pages/Creatives';
import { Assignments } from './pages/Assignments';
import { Metrics } from './pages/Metrics';
import { Snippets } from './pages/Snippets';
import { Companies } from './pages/Companies';
import { Users } from './pages/Users';
import { MediaReports } from './pages/MediaReports';
import { MediaMonitoring } from './pages/MediaMonitoring';
import { EmailHistory } from './pages/EmailHistory';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [showRegister, setShowRegister] = useState(false);
  const [allowRegistration, setAllowRegistration] = useState(false);

  useEffect(() => {
    const isRegisterPath = window.location.pathname === '/register' || window.location.hash === '#/register';
    setShowRegister(isRegisterPath);
    getPublicConfig()
      .then((cfg) => setAllowRegistration(cfg.allowRegistration))
      .catch(() => setAllowRegistration(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return showRegister && allowRegistration ? <Register /> : <Auth />;
  }

  return (
    <CompanyProvider>
      <AuthenticatedApp currentPage={currentPage} setCurrentPage={setCurrentPage} />
    </CompanyProvider>
  );
}

function AuthenticatedApp({ currentPage, setCurrentPage }: { currentPage: string; setCurrentPage: (page: string) => void }) {
  const { profile } = useAuth();
  const { companyId } = useCompany();
  const isAdmin = profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN';

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} />;
      case 'news':
        return <News />;
      case 'media':
        return <Media />;
      case 'traditional-media':
        return <TraditionalMedia />;
      case 'slots':
        return <Slots />;
      case 'creatives':
        return <Creatives />;
      case 'assignments':
        return <Assignments />;
      case 'metrics':
        return <Metrics />;
      case 'snippets':
        return <Snippets />;
      case 'companies':
        return isAdmin ? <Companies /> : <Dashboard onNavigate={setCurrentPage} />;
      case 'users':
        return isAdmin ? <Users /> : <Dashboard onNavigate={setCurrentPage} />;
      case 'media-reports':
        return <MediaReports />;
      case 'media-monitoring':
        return <MediaMonitoring />;
      case 'email-history':
        return <EmailHistory />;
      default:
        return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {/* Re-mount the page when the selected company changes so data is reloaded */}
      <div key={companyId || 'all'}>{renderPage()}</div>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
