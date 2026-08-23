import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/auth-context';
import { CompanyProvider } from './lib/use-company';
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

  useEffect(() => {
    const isRegisterPath = window.location.pathname === '/register' || window.location.hash === '#/register';
    setShowRegister(isRegisterPath);
  }, []);

  console.log('AppContent - user:', user?.email);
  console.log('AppContent - loading:', loading);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return showRegister ? <Register /> : <Auth />;
  }

  return (
    <CompanyProvider>
      <AuthenticatedApp currentPage={currentPage} setCurrentPage={setCurrentPage} />
    </CompanyProvider>
  );
}

function AuthenticatedApp({ currentPage, setCurrentPage }: { currentPage: string; setCurrentPage: (page: string) => void }) {

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
        return <Companies />;
      case 'users':
        return <Users />;
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

  try {
    return (
      <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
        {renderPage()}
      </Layout>
    );
  } catch (error) {
    console.error('Error rendering AppContent:', error);
    return (
      <div className="min-h-screen bg-red-100 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-lg shadow-lg max-w-md">
          <h2 className="text-red-600 font-bold text-xl mb-2">Error</h2>
          <p className="text-gray-700">{error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      </div>
    );
  }
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
