import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Code2, Shield, LogOut, LogIn, Search, AlertCircle } from 'lucide-react';

interface NavbarProps {
  currentPage: 'home' | 'login' | 'admin';
  onNavigate: (page: 'home' | 'login' | 'admin') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPage, onNavigate }) => {
  const { user, isAdmin, signOut, isConfigured } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <div
          onClick={() => onNavigate('home')}
          className="flex items-center space-x-2.5 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
            <Code2 className="w-5 h-5 text-indigo-100" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-lg text-slate-900 tracking-tight">
                Program<span className="text-indigo-600">Finder</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-600 -mt-0.5">Instant Question & Code Search</p>
          </div>
        </div>

        {/* Configuration Notice if Supabase env vars not set */}
        {!isConfigured && (
          <div className="hidden md:flex items-center space-x-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-800">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>Supabase .env setup pending</span>
          </div>
        )}

        {/* Right Navigation */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => onNavigate('home')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              currentPage === 'home'
                ? 'bg-indigo-50 text-indigo-700 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search</span>
          </button>

          {/* Admin Dashboard Navigation */}
          {user && isAdmin && (
            <button
              onClick={() => onNavigate('admin')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentPage === 'admin'
                  ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Admin Dashboard</span>
            </button>
          )}

          {/* Auth Button */}
          {user ? (
            <div className="flex items-center space-x-3 pl-2 border-l border-slate-200">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-medium text-slate-800 truncate max-w-[150px]">
                  {user.email}
                </span>
                <span className="text-[10px] text-indigo-700 font-semibold uppercase">
                  {isAdmin ? 'Administrator' : 'User'}
                </span>
              </div>
              <button
                onClick={signOut}
                className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-slate-200"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => onNavigate('login')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentPage === 'login'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Admin Login</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
