import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { Code2 } from 'lucide-react';

type Page = 'home' | 'login' | 'admin';

const MainApp: React.FC = () => {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const hash = window.location.hash.replace('#', '').toLowerCase();
    if (hash === 'admin') return 'admin';
    if (hash === 'login') return 'login';
    return 'home';
  });

  // Sync hash with current page
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (hash === 'admin') setCurrentPage('admin');
      else if (hash === 'login') setCurrentPage('login');
      else setCurrentPage('home');
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTo = (page: Page) => {
    setCurrentPage(page);
    window.location.hash = page === 'home' ? '' : page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // If user signs out and was on admin page, redirect to home
  useEffect(() => {
    if (!user && currentPage === 'admin') {
      navigateTo('home');
    }
  }, [user, currentPage]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-indigo-500 selection:text-white relative">
      <main className="flex-1 flex flex-col">
        {currentPage === 'home' && <HomePage onNavigate={navigateTo} />}
        {currentPage === 'login' && <LoginPage onNavigate={navigateTo} />}
        {currentPage === 'admin' && <AdminDashboard onNavigate={navigateTo} />}
      </main>

      {/* Minimal Bottom Footer */}
      <footer className="py-3 text-center text-xs text-slate-400 border-t border-slate-200/60 bg-white">
        <div className="flex items-center justify-center space-x-2">
          <Code2 className="w-3.5 h-3.5 text-indigo-500" />
          <span className="font-semibold text-slate-600">Program Finder</span>
          <span>• Precision Computer Science Program & Code Retrieval</span>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
