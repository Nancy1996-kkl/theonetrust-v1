import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { ToastProvider } from '../components/ui/Toast.tsx';
import { UiLangContext, type UiLang } from '../components/ui/ui-strings.ts';
import { langFromPath, saveLangPreference, switchLanguagePath } from '../i18n/lang.ts';
import { MESSAGES } from '../i18n/messages.ts';
import {
  DonationDraftContext,
  initialDraft,
  saveDraft,
  type DonationDraft,
} from '../state/donation-draft.ts';
import { SiteFooter } from './SiteFooter.tsx';
import { SiteHeader } from './SiteHeader.tsx';
import { DonateCheckoutPanel } from '../donate/DonateCheckoutPanel.tsx';
import { DonateLinkPanel } from '../donate/DonateLinkPanel.tsx';
import { DonatePanel } from '../donate/DonatePanel.tsx';
import { DONATE_PAGE_URL } from '../donate/donate-page-link.ts';
import { DONATE_BUTTON } from '../donate/razorpay-button.ts';
import { selectDonatePopup } from '../donate/donate-popup.ts';
import { GetHelpPanel } from '../help/GetHelpPanel.tsx';

function sessionStore(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const DONATE_POPUP = selectDonatePopup({
  provider: import.meta.env.VITE_DONATE_PROVIDER,
  hasButton: Boolean(DONATE_BUTTON),
  hasPageLink: Boolean(DONATE_PAGE_URL),
});

/**
 * Public app shell (issue #11). Sits ABOVE both language route trees, so switching language
 * keeps the donation draft and any open panel state. The URL decides the language (ADR 0004).
 */
export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const lang = langFromPath(location.pathname);
  const t = MESSAGES[lang];
  const [draft, setDraft] = useState<DonationDraft>(() =>
    initialDraft(location.search, sessionStore()),
  );
  useEffect(() => {
    saveDraft(draft, sessionStore());
  }, [draft]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const changeLanguage = useCallback(
    (next: UiLang) => {
      saveLangPreference(next, browserStorage());
      navigate(switchLanguagePath(location.pathname, next) + location.search + location.hash);
    },
    [navigate, location.pathname, location.search, location.hash],
  );

  const draftApi = useMemo(
    () => ({
      draft,
      updateDraft: (patch: Partial<DonationDraft>) => setDraft((d) => ({ ...d, ...patch })),
    }),
    [draft],
  );

  return (
    <UiLangContext.Provider value={lang}>
      <DonationDraftContext.Provider value={draftApi}>
        <ToastProvider>
          <a className="skip-link" href="#main">
            {t.skipToContent}
          </a>
          <SiteHeader onLanguageChange={changeLanguage} />
          <main id="main" tabIndex={-1}>
            <Outlet />
          </main>
          <SiteFooter onLanguageChange={changeLanguage} />
          <GetHelpPanel />
          {/* Cashfree (full panel + our API) when selected, else the Razorpay Payment Button
              (pay inside the pop-up, the rollback), else the Payment Page link, else the panel. */}
          {DONATE_POPUP === 'button' && DONATE_BUTTON ? (
            <DonateCheckoutPanel config={DONATE_BUTTON} />
          ) : DONATE_POPUP === 'link' && DONATE_PAGE_URL ? (
            <DonateLinkPanel url={DONATE_PAGE_URL} />
          ) : (
            <DonatePanel />
          )}
          {/* New pages open at the top (or at their #anchor); back/forward restore the old position.
              The key ignores the /ta prefix, so switching language keeps the reader's place. */}
          <ScrollRestoration getKey={(loc) => loc.pathname.replace(/^\/ta(?=\/|$)/, '') || '/'} />
        </ToastProvider>
      </DonationDraftContext.Provider>
    </UiLangContext.Provider>
  );
}
