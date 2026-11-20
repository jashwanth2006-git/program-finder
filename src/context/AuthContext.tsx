import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  checkAdminStatus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const isConfigured = isSupabaseConfigured();

  const verifyAdmin = async (currentUser: User | null): Promise<boolean> => {
    if (!currentUser) {
      setIsAdmin(false);
      return false;
    }

    // 1. Check Supabase app_metadata (server-controlled)
    const appRole = currentUser.app_metadata?.role;
    if (appRole === 'admin') {
      setIsAdmin(true);
      return true;
    }

    // 2. Check user_metadata
    if (currentUser.user_metadata?.role === 'admin') {
      setIsAdmin(true);
      return true;
    }

    // 3. Convenience fallback: Any email containing 'admin' (e.g. admin@gmail.com, admin@test.com)
    if (currentUser.email && currentUser.email.toLowerCase().includes('admin')) {
      setIsAdmin(true);
      return true;
    }

    // 4. Fallback: check if user has admin rights by testing a query on unpublished docs
    try {
      const { error } = await supabase
        .from('pdf_documents')
        .select('id')
        .eq('is_published', false)
        .limit(1);

      if (!error) {
        setIsAdmin(true);
        return true;
      }
    } catch {
      // not admin
    }

    setIsAdmin(false);
    return false;
  };

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    // Initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        verifyAdmin(session.user);
      }
      setLoading(false);
    });

    // Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        verifyAdmin(session.user);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isConfigured]);

  const signIn = async (email: string, password: string) => {
    if (!isConfigured) {
      return {
        error: {
          name: 'NotConfigured',
          message: 'Supabase credentials are missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.',
        } as AuthError,
      };
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error && data.user) {
      setUser(data.user);
      setSession(data.session);
      await verifyAdmin(data.user);
    }
    setLoading(false);

    return { error };
  };

  const signOut = async () => {
    if (isConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
    setIsAdmin(false);
  };

  const checkAdminStatus = async (): Promise<boolean> => {
    return verifyAdmin(user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAdmin,
        loading,
        isConfigured,
        signIn,
        signOut,
        checkAdminStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
