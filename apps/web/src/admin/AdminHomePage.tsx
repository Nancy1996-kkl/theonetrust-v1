import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/Button.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { useAdmin } from './admin-context.ts';

/** Placeholder overview: real figures arrive with #31 — nothing is invented here. */
export function AdminHomePage() {
  const { api, t, session, setSession } = useAdmin();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await api.logout();
    } catch {
      // Signed out locally either way; the server session also expires on its own.
    }
    setSession({ stage: 'SIGNED_OUT' });
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className="admin-page">
      <div className="admin-page__bar">
        <h1>{t.overviewTitle}</h1>
        <p className="admin-page__who">
          {t.signedInAs} <strong>{session?.user?.email}</strong>
        </p>
        <Button variant="secondary" loading={busy} onClick={() => void signOut()}>
          {t.signOut}
        </Button>
      </div>
      <StateBlock state="empty" title={t.overviewEmptyTitle} headingLevel={2}>
        {t.overviewEmpty}
      </StateBlock>
    </div>
  );
}
