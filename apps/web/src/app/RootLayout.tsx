import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { ToastProvider } from '../components/ui/Toast.tsx';
import { UiLangContext, type UiLang } from '../components/ui/ui-strings.ts';
import { langFromPath, saveLangPreference, switchLanguagePath } from '../i18n/lang.ts';
import { MESSAGES } from '../i18n/messages.ts';
import {
  DonationDraftContext,
  draftFromSearch,
  type DonationDraft,
} from '../state/donation-draft.ts';
import { SiteFooter } from './SiteFooter.tsx';
import { SiteHeader } from './SiteHeader.tsx';
import { GetHelpPanel } from '../help/GetHelpPanel.tsx';

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Public app shell (issue #11). Sits ABOVE both language route trees, so switching language
 * keeps the donation draft and any open panel state. The URL decides the language (ADR 0004).
 */
export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const lang = langFromPath(location.pathname);
  const t = MESSAGES[lang];
  const [draft, setDraft] = useState<DonationDraft>(() => draftFromSearch(location.search));

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
          {/* New pages open at the top (or at their #anchor); back/forward restore the old position.
              The key ignores the /ta prefix, so switching language keeps the reader's place. */}
          <ScrollRestoration getKey={(loc) => loc.pathname.replace(/^\/ta(?=\/|$)/, '') || '/'} />
        </ToastProvider>
      </DonationDraftContext.Provider>
    </UiLangContext.Provider>
  );
}
