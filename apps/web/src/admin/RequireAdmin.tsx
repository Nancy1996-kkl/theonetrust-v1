import { Navigate, Outlet } from 'react-router';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { useAdmin } from './admin-context.ts';

/**
 * Shows dashboard pages only to a fully signed-in owner (password + authenticator).
 * This is a convenience for the browser — the API refuses every admin request without a
 * valid session regardless of what the UI shows.
 */
export function RequireAdmin() {
  const { session, t } = useAdmin();
  if (session === null) {
    return <StateBlock state="loading" title={t.loading} headingLevel={2} />;
  }
  if (session.stage !== 'ACTIVE') return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}
