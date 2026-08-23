import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface Profile {
  id: string;
  email?: string;
  full_name: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  company_id: string | null;
  institution_name: string | null;
  institution_logo_url: string | null;
  companies?: {
    id: string;
    name: string;
    logo_url: string | null;
    website_url: string | null;
  };
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    // Get the profile with institution info
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, role, company_id, institution_name, institution_logo_url')
      .eq('id', userId)
      .maybeSingle();

    console.log('=== FETCH PROFILE DEBUG ===');
    console.log('User ID:', userId);
    console.log('Profile data:', profileData);
    console.log('Profile error:', profileError);

    if (profileData && profileData.company_id) {
      // Then get the company data separately for website_url
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('id, name, logo_url, website_url')
        .eq('id', profileData.company_id)
        .maybeSingle();

      console.log('Company data:', companyData);
      console.log('Company error:', companyError);

      if (companyData) {
        const fullProfile = {
          ...profileData,
          companies: companyData
        };
        console.log('Full profile to set:', fullProfile);
        setProfile(fullProfile as Profile);
      } else {
        setProfile(profileData as Profile);
      }
    } else {
      if (profileData) {
        setProfile(profileData as Profile);
      }
    }
    console.log('========================');
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (!error && data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        full_name: fullName || null,
        role: 'USER',
      });
    }

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut }}>
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
