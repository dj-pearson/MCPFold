import { createClient } from '@supabase/supabase-js';

/**
 * Auth is abstracted behind {@link AuthClient} so the UI never depends on Supabase directly and
 * can be driven deterministically in e2e (VITE_E2E=1 → an in-memory mock, no backend needed).
 * The real implementation wraps Supabase GoTrue against the self-hosted instance.
 */

export interface Session {
  email: string;
  accessToken: string;
}

export interface AuthClient {
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
  onChange(cb: (session: Session | null) => void): () => void;
}

function supabaseAuthClient(url: string, anonKey: string): AuthClient {
  const supabase = createClient(url, anonKey);
  const toSession = (
    s: { access_token?: string; user?: { email?: string } } | null,
  ): Session | null =>
    s?.user?.email && s.access_token ? { email: s.user.email, accessToken: s.access_token } : null;
  return {
    async getSession() {
      const { data } = await supabase.auth.getSession();
      return toSession(data.session);
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    onChange(cb) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(toSession(session)));
      return () => data.subscription.unsubscribe();
    },
  };
}

/** Deterministic in-memory auth for e2e — accepts any email with the password "password". */
function mockAuthClient(): AuthClient {
  const KEY = 'mcpfold-e2e-session';
  const listeners = new Set<(s: Session | null) => void>();
  const read = (): Session | null => {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  };
  const emit = (): void => {
    const s = read();
    for (const l of listeners) l(s);
  };
  return {
    getSession: () => Promise.resolve(read()),
    signIn: (email, password) => {
      if (password !== 'password') return Promise.resolve({ error: 'Invalid login credentials' });
      localStorage.setItem(KEY, JSON.stringify({ email, accessToken: 'e2e-token' }));
      emit();
      return Promise.resolve({ error: null });
    },
    signOut: () => {
      localStorage.removeItem(KEY);
      emit();
      return Promise.resolve();
    },
    onChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

/** Construct the active auth client from the environment. Throws if misconfigured (caught upstream). */
export function createAuthClient(): AuthClient {
  if (import.meta.env.VITE_E2E === '1') return mockAuthClient();
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set');
  }
  return supabaseAuthClient(url, anonKey);
}
