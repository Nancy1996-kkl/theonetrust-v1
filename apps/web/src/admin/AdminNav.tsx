import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { Button } from '../components/ui/Button.tsx';
import { useAdmin } from './admin-context.ts';
import { LEDGER_STRINGS } from './ledger-strings.ts';

/** Navigation for signed-in dashboard pages, with sign-out. */
export function AdminNav() {
  const { api, t, lang, session, setSession } = useAdmin();
  const l = LEDGER_STRINGS[lang];
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
    <>
      <div className="admin-nav">
        <nav aria-label={t.navLabel}>
          <ul className="admin-nav__list">
            <li>
              <NavLink to="/admin" end>
                {t.navOverview}
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/donations">{l.navDonations}</NavLink>
            </li>
            <li>
              <NavLink to="/admin/exceptions">{l.navExceptions}</NavLink>
            </li>
            <li>
              <NavLink to="/admin/receipts">{l.navReceipts}</NavLink>
            </li>
            <li>
              <NavLink to="/admin/monthly-giving">{l.navMonthly}</NavLink>
            </li>
            <li>
              <NavLink to="/admin/tax">{l.navTax}</NavLink>
            </li>
            <li>
              <NavLink to="/admin/help-requests">{t.navHelp}</NavLink>
            </li>
            <li>
              <NavLink to="/admin/bank-transfers">{t.navBank}</NavLink>
            </li>
            <li>
              <NavLink to="/admin/notifications">{t.navEmail}</NavLink>
            </li>
            <li>
              <NavLink to="/admin/audit-log">{t.navAuditLog}</NavLink>
            </li>
          </ul>
        </nav>
        <p className="admin-nav__who">
          {t.signedInAs} <strong>{session?.user?.email}</strong>
        </p>
        <Button variant="secondary" loading={busy} onClick={() => void signOut()}>
          {t.signOut}
        </Button>
      </div>
      <Outlet />
    </>
  );
}
