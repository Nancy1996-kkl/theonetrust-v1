import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { LanguageSwitch } from '../components/ui/LanguageSwitch.tsx';
import type { UiLang } from '../components/ui/ui-strings.ts';
import { focusableIn } from '../components/ui/focus.ts';
import { TRUST_FACTS } from '../config/trust-facts.ts';
import { homePath } from '../i18n/lang.ts';
import { useLang, useMessages } from '../i18n/use-lang.ts';
import { NAV_SECTIONS } from './nav-sections.ts';

interface SiteHeaderProps {
  onLanguageChange: (lang: UiLang) => void;
}

/**
 * Sticky header. Wide screens: logo · section links · language · Get Help · Donate.
 * Narrow screens: logo · Donate · Menu; the menu is a sheet below the header that keeps focus
 * inside and closes on Escape, an outside click or choosing a link (docs/design/sitemap.md).
 */
export function SiteHeader({ onLanguageChange }: SiteHeaderProps) {
  const lang = useLang();
  const t = useMessages();
  const home = homePath(lang);
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetId = useId();

  useEffect(() => {
    if (!open) return;
    const header = headerRef.current;
    const sheet = sheetRef.current;
    if (sheet) focusableIn(sheet)[0]?.focus();

    function close(returnFocus: boolean) {
      setOpen(false);
      if (returnFocus) buttonRef.current?.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close(true);
        return;
      }
      if (event.key !== 'Tab' || !sheet || !buttonRef.current) return;
      const items = [buttonRef.current, ...focusableIn(sheet)];
      const first = items.at(0);
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (header && event.target instanceof Node && !header.contains(event.target)) close(false);
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const sectionLinks = NAV_SECTIONS.map((section) => (
    <li key={section.id}>
      <a href={`${home}#${section.id}`} onClick={() => setOpen(false)}>
        {t[section.label]}
      </a>
    </li>
  ));

  return (
    <header ref={headerRef} className="site-header">
      <div className="site-header__bar">
        <a className="site-header__brand" href={home} aria-label={t.homeLink}>
          <span className="site-header__mark" aria-hidden="true" />
          <span className="site-header__name">{TRUST_FACTS.siteName}</span>
        </a>

        <nav className="site-header__nav" aria-label={t.sectionsNav}>
          <ul>{sectionLinks}</ul>
        </nav>

        <div className="site-header__actions">
          <LanguageSwitch
            current={lang}
            onChange={onLanguageChange}
            className="site-header__lang"
          />
          <Link
            className="ui-button ui-button--secondary site-header__help"
            to={`${home}#get-help`}
          >
            {t.getHelp}
          </Link>
          <a className="ui-button ui-button--donate site-header__donate" href={`${home}#donate`}>
            {t.donate}
          </a>
          <button
            ref={buttonRef}
            type="button"
            className="site-header__menu-button"
            aria-expanded={open}
            aria-controls={sheetId}
            onClick={() => setOpen((value) => !value)}
          >
            <span
              className="site-header__menu-icon"
              aria-hidden="true"
              data-open={open || undefined}
            />
            <span className="site-header__menu-text">{t.menu}</span>
          </button>
        </div>
      </div>

      <div ref={sheetRef} id={sheetId} className="site-header__sheet surface" hidden={!open}>
        {open && (
          <>
            <nav aria-label={t.menu}>
              <ul>{sectionLinks}</ul>
            </nav>
            <Link
              className="ui-button ui-button--secondary ui-button--full"
              to={`${home}#get-help`}
              onClick={() => setOpen(false)}
            >
              {t.getHelp}
            </Link>
            <LanguageSwitch
              current={lang}
              onChange={(next) => {
                setOpen(false);
                onLanguageChange(next);
              }}
            />
          </>
        )}
      </div>
    </header>
  );
}
