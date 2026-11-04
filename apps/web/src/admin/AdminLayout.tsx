import { useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router';
import type { AdminSessionResponse } from '@theonetrust/contracts';
import { LanguageSwitch } from '../components/ui/LanguageSwitch.tsx';
import { UiLangContext, type UiLang } from '../components/ui/ui-strings.ts';
import { LANG_STORAGE_KEY, saveLangPreference } from '../i18n/lang.ts';
import { AdminContext, stringsFor } from './admin-context.ts';
import { createAdminApi, type AdminApi } from './api.ts';

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function initialLang(): UiLang {
  try {
    return storage()?.getItem(LANG_STORAGE_KEY) === 'ta' ? 'ta' : 'en';
  } catch {
    return 'en';
  }
}

export interface AdminLayoutProps {
  /** Injected in tests; defaults to the real API at VITE_API_BASE_URL. */
  api?: AdminApi;
}

/**
 * Owner dashboard shell (#19). Separate from the public shell: no public navigation, never
 * indexed, same URL in both languages (docs/design/sitemap.md). Access control lives in the API;
 * this shell only decides what to show.
 */
export function AdminLayout({ api: injected }: AdminLayoutProps) {
  const api = useMemo(
    () => injected ?? createAdminApi(import.meta.env.VITE_API_BASE_URL ?? ''),
    [injected],
  );
  const [lang, setLang] = useState<UiLang>(initialLang);
  const [session, setSession] = useState<AdminSessionResponse | null>(null);
  const t = stringsFor(lang);

  useEffect(() => {
    let cancelled = false;
    api
      .session()
      .then((s) => {
        if (cancelled) return;
        setSession(s);
        // The owner's saved dashboard language wins over this browser's preference.
        if (s.user?.locale) setLang(s.user.locale);
      })
      .catch(() => !cancelled && setSession({ stage: 'SIGNED_OUT' }));
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ api, lang, t, session, setSession }), [api, lang, t, session]);

  return (
    <UiLangContext.Provider value={lang}>
      <AdminContext.Provider value={value}>
        <title>{t.dashboardName}</title>
        <meta name="robots" content="noindex, nofollow" />
        <a className="skip-link" href="#main">
          {lang === 'ta' ? 'முதன்மை உள்ளடக்கத்திற்குச் செல்லவும்' : 'Skip to main content'}
        </a>
        <header className="admin-header surface-inverse">
          <span className="admin-header__name">{t.dashboardName}</span>
          <LanguageSwitch
            current={lang}
            onChange={(next) => {
              saveLangPreference(next, storage());
              setLang(next);
              if (session?.stage === 'ACTIVE') {
                // Saved to the account so it is the same on every device; failure is harmless.
                api.updatePreferences(next).catch(() => undefined);
              }
            }}
          />
        </header>
        <main id="main" tabIndex={-1} className="admin-main">
          <Outlet />
        </main>
      </AdminContext.Provider>
    </UiLangContext.Provider>
  );
}
