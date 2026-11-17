import { useLocation, useNavigate } from 'react-router';
import { Dialog } from '../components/ui/Dialog.tsx';
import { useLang } from '../i18n/use-lang.ts';
import { PolicyNotice } from '../routes/policy/PolicyNotice.tsx';
import { DONATE_HASH } from './DonatePanel.tsx';
import { DONATE_MESSAGES } from './donate-messages.ts';

/**
 * Donate pop-up in Razorpay Payment Page mode (see donate-page-link.ts). Opens at #donate like
 * the full panel, so every Donate button on the site keeps working. The donor finishes on
 * Razorpay's secure page; this site never sees or stores their payment details.
 */
export function DonateLinkPanel({ url }: { url: string }) {
  const lang = useLang();
  const t = DONATE_MESSAGES[lang];
  const location = useLocation();
  const navigate = useNavigate();
  const open = location.hash === DONATE_HASH;

  function close() {
    navigate({ pathname: location.pathname, search: location.search }, { replace: true });
  }

  return (
    <Dialog open={open} onClose={close} title={t.title} variant="modal">
      <div className="donate">
        <p>{t.linkLead}</p>
        <p>{t.linkMethods}</p>
        <a
          className="ui-button ui-button--donate ui-button--full"
          href={url}
          rel="noopener"
          data-testid="donate-page-link"
        >
          {t.linkContinue}
        </a>
        <p className="donate__muted">{t.linkReceipt}</p>
        <PolicyNotice />
      </div>
    </Dialog>
  );
}
