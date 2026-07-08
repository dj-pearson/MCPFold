import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { type AuthClient, createAuthClient, type Session } from './authClient';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  configError: string | null;
  signIn(email: string, password: string): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [client, configError] = useMemo<[AuthClient | null, string | null]>(() => {
    try {
      return [createAuthClient(), null];
    } catch (e) {
      return [null, e instanceof Error ? e.message : 'Auth is not configured.'];
    }
  }, []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    let active = true;
    client.getSession().then((s) => {
      if (active) {
        setSession(s);
        setLoading(false);
      }
    });
    const unsub = client.onChange(setSession);
    return () => {
      active = false;
      unsub();
    };
  }, [client]);

  const value: AuthContextValue = {
    session,
    loading,
    configError,
    signIn: async (email, password) => {
      if (!client) return { error: configError };
      const result = await client.signIn(email, password);
      if (!result.error) setSession(await client.getSession());
      return result;
    },
    signOut: async () => {
      if (client) await client.signOut();
      setSession(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
