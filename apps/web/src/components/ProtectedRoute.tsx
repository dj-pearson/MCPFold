import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';

/** Gates a route: unauthenticated visitors are redirected to /login. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="center muted">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
