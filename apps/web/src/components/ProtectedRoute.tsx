import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { LiveMonitorUpdates } from '../lib/LiveMonitorUpdates';
import { useAuth } from '../lib/useAuth';

/**
 * Wrap protected screens. While the boot-time `/auth/me` validation is
 * running we render a tiny placeholder so we don't bounce signed-in
 * users to `/login` on every refresh.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthed, isLoading } = useAuth();
  if (isLoading) return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  if (!isAuthed) return <Navigate to="/login" replace />;
  return (
    <>
      <LiveMonitorUpdates />
      {children}
    </>
  );
}
