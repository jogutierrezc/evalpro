import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, User } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (credentials: { email: string; password: string } | { identification: string }) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        // Check for local user (for evaluations)
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch (error) {
            console.error('Error parsing stored user:', error);
            localStorage.removeItem('user');
          }
        }
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      setUser(data);
    } catch (error) {
      console.error('Error loading user profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (credentials: { email: string; password: string } | { identification: string }): Promise<{ success: boolean; error?: string }> => {
    if ('email' in credentials) {
      // Admin login with Supabase Auth
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: credentials.email, password: credentials.password });

        if (error) {
          console.error('Auth signIn error:', error);
          return { success: false, error: error.message || 'Error al iniciar sesión' };
        }

        const session = data?.session ?? null;
        if (session?.user?.id) {
          await loadUserProfile(session.user.id);
        }

        return { success: true };
      } catch (err: any) {
        console.error('Sign in error:', err);
        return { success: false, error: err.message || 'Error al iniciar sesión' };
      }
    } else {
      // Evaluation login with identification -> look up in users (colaboradores migrated)
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('identification', credentials.identification)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          return { success: false, error: 'Cédula no encontrada' };
        }

        setUser(data);
        localStorage.setItem('user', JSON.stringify(data));
        return { success: true };
      } catch (err: any) {
        console.error('Sign in error:', err);
        return { success: false, error: err.message || 'Error al iniciar sesión' };
      }
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signOut }}>
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
