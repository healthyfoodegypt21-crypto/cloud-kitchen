import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseAvailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { useSupabaseRealtimeRefresh } from '@/hooks/useSupabaseRealtimeRefresh';

type AppRole = string;
type AuthMode = 'session' | 'demo';

const LOCAL_DEMO_AUTH_KEY = 'cloud_kitchen_demo_session';

type LocalDemoAuthState = {
  role: AppRole;
  displayName: string;
  email: string;
};

function readLocalDemoAuthState(): LocalDemoAuthState | null {
  try {
    const rawValue = sessionStorage.getItem(LOCAL_DEMO_AUTH_KEY);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<LocalDemoAuthState>;
    if (!parsed || typeof parsed.role !== 'string' || typeof parsed.displayName !== 'string' || typeof parsed.email !== 'string') {
      return null;
    }

    return {
      role: parsed.role,
      displayName: parsed.displayName,
      email: parsed.email,
    };
  } catch {
    return null;
  }
}

function buildLocalDemoUser(email: string) {
  return {
    id: 'local-demo-owner',
    app_metadata: {},
    user_metadata: { display_name: 'مالك تجريبي' },
    aud: 'authenticated',
    created_at: new Date(0).toISOString(),
    email,
  } as User;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  displayName: string;
  pagePermissions: string[];
  authMode: AuthMode;
  isDemoMode: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInAsLocalDemo: () => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [pagePermissions, setPagePermissions] = useState<string[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>('session');
  const [loading, setLoading] = useState(true);

  const applyLocalDemoAuth = (demoState: LocalDemoAuthState | null) => {
    if (!demoState) {
      return false;
    }

    markSupabaseUnavailable();
    setUser(buildLocalDemoUser(demoState.email));
    setSession(null);
    setRole(demoState.role);
    setDisplayName(demoState.displayName);
    setPagePermissions([]);
    setAuthMode('demo');
    return true;
  };

  const fetchUserData = async (userId: string) => {
    try {
      const [roleRes, profileRes, pagePermissionsRes] = await Promise.all([
        supabase.rpc('get_user_role', { _user_id: userId }),
        supabase.from('profiles').select('display_name').eq('id', userId).single(),
        supabase.from('user_page_permissions').select('page').eq('user_id', userId),
      ]);

      if (isSupabaseNetworkError(roleRes.error) || isSupabaseNetworkError(profileRes.error) || isSupabaseNetworkError(pagePermissionsRes.error)) {
        markSupabaseUnavailable();
        setRole(null);
        setDisplayName('');
        setPagePermissions([]);
        return;
      }

      if (!roleRes.error && !profileRes.error && !pagePermissionsRes.error) {
        markSupabaseAvailable();
        setAuthMode('session');
      }

      setRole(roleRes.data ?? null);
      setDisplayName(profileRes.data?.display_name ?? '');
      setPagePermissions((pagePermissionsRes.data ?? []).map((item) => item.page));
    } catch (error) {
      if (isSupabaseNetworkError(error as { message?: string })) {
        markSupabaseUnavailable();
      }

      markSupabaseUnavailable();
      setRole(null);
      setDisplayName('');
      setPagePermissions([]);
      console.error('Failed to hydrate auth user data', error);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setLoading(true);
        try {
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            sessionStorage.removeItem(LOCAL_DEMO_AUTH_KEY);
            setAuthMode('session');
            await fetchUserData(session.user.id);
          } else {
            setRole(null);
            setDisplayName('');
            setPagePermissions([]);
            setAuthMode('session');
          }
        } finally {
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setLoading(true);
      try {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          sessionStorage.removeItem(LOCAL_DEMO_AUTH_KEY);
          setAuthMode('session');
          await fetchUserData(session.user.id);
        } else if (import.meta.env.DEV && applyLocalDemoAuth(readLocalDemoAuthState())) {
          return;
        } else {
          setAuthMode('session');
        }
      } finally {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useSupabaseRealtimeRefresh({
    enabled: Boolean(user?.id && authMode === 'session'),
    channelName: `auth-context-${user?.id ?? 'guest'}`,
    tables: user?.id ? [
      { table: 'profiles', filter: `id=eq.${user.id}` },
      { table: 'user_roles', filter: `user_id=eq.${user.id}` },
      { table: 'user_page_permissions', filter: `user_id=eq.${user.id}` },
      { table: 'user_brand_access', filter: `user_id=eq.${user.id}` },
    ] : [],
    onRefresh: () => user?.id ? fetchUserData(user.id) : Promise.resolve(),
  });

  const signIn = async (email: string, password: string) => {
    if (isSupabaseUnavailable()) {
      return { error: 'الاتصال بقاعدة البيانات غير متاح حاليًا. استخدم الدخول التجريبي المحلي.' };
    }

    sessionStorage.removeItem(LOCAL_DEMO_AUTH_KEY);
    setAuthMode('session');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (isSupabaseNetworkError(error)) {
      markSupabaseUnavailable();
      return { error: 'الاتصال بقاعدة البيانات غير متاح حاليًا. استخدم الدخول التجريبي المحلي.' };
    }

    return { error: error?.message ?? null };
  };

  const signInAsLocalDemo = () => {
    if (!import.meta.env.DEV) {
      return false;
    }

    const demoState: LocalDemoAuthState = {
      role: 'owner',
      displayName: 'مالك تجريبي',
      email: 'demo@cloudkitchen.local',
    };

    sessionStorage.setItem(LOCAL_DEMO_AUTH_KEY, JSON.stringify(demoState));
    applyLocalDemoAuth(demoState);
    return true;
  };

  const signOut = async () => {
    if (!isSupabaseUnavailable()) {
      const { error } = await supabase.auth.signOut();
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
      }
    }

    sessionStorage.removeItem(LOCAL_DEMO_AUTH_KEY);
    setUser(null);
    setSession(null);
    setRole(null);
    setDisplayName('');
    setPagePermissions([]);
    setAuthMode('session');
  };

  return (
    <AuthContext.Provider value={{ user, session, role, displayName, pagePermissions, authMode, isDemoMode: authMode === 'demo', loading, signIn, signInAsLocalDemo, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
