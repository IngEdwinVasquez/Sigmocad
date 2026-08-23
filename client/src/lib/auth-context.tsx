import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { api, setToken, getToken, setUnauthorizedHandler, setCompanyHeader } from './api';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'USER';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  company_id: string | null;
  institution_name: string | null;
  institution_logo_url: string | null;
  is_active: boolean;
  companies?: {
    id: string;
    name: string;
    logo_url: string | null;
    website_url: string | null;
  } | null;
}

interface AuthContextType {
  /** Alias of `profile` kept for compatibility with the previous Supabase-based code. */
  user: Profile | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthResponse {
  token: string;
  user: Profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setToken(null);
    setCompanyHeader(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!getToken()) {
      setProfile(null);
      return;
    }
    try {
      const { user } = await api.get<{ user: Profile }>('/api/auth/me');
      setProfile(user);
    } catch {
      clearSession();
    }
  }, [clearSession]);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    refreshProfile().finally(() => setLoading(false));
    return () => setUnauthorizedHandler(null);
  }, [refreshProfile, clearSession]);

  const signIn = async (email: string, password: string) => {
    try {
      const data = await api.post<AuthResponse>('/api/auth/login', { email, password });
      setToken(data.token);
      setProfile(data.user);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Error al iniciar sesión') };
    }
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      await api.post<AuthResponse>('/api/auth/register', { email, password, full_name: fullName });
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Error al registrarse') };
    }
  };

  const signOut = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // stateless token; ignore
    }
    clearSession();
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await api.post('/api/auth/change-password', { current_password: currentPassword, new_password: newPassword });
  };

  return (
    <AuthContext.Provider
      value={{ user: profile, profile, loading, signIn, signUp, signOut, refreshProfile, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
