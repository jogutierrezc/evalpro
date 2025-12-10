import { createContext, useContext, useEffect, useState, useRef, useMemo, ReactNode } from 'react';
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
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state change:', event);
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        localStorage.removeItem('user');
        setLoading(false);
      } else {
        setSession(prev => {
          if (prev?.access_token === session?.access_token) return prev;
          return session;
        });

        if (session?.user) {
          // Only load profile if user changed or completely missing
          // This prevents reloading on every TOKEN_REFRESHED (window focus)
          if (userRef.current?.id !== session.user.id) {
            loadUserProfile(session.user.id);
          }
        } else {
          // Only clear if we are sure it's not a local session
          if (!localStorage.getItem('user')) {
            if (userRef.current) setUser(null);
          }
          setLoading(false);
        }
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


      setUser(prev => {
        // Only update if data actually changed to avoid triggering unnecessary re-renders
        // which causes Dashboard and other modules to reload
        if (JSON.stringify(prev) === JSON.stringify(data)) {
          return prev;
        }
        return data;
      });
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
    setSession(null);
    setUser(null);
    localStorage.removeItem('user');
    localStorage.clear(); // Optional: clear everything to be safe, or just specific keys
  };

  const value = useMemo(() => ({
    session,
    user,
    loading,
    signIn,
    signOut
  }), [session, user, loading]);

  return (
    <AuthContext.Provider value={value}>
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
