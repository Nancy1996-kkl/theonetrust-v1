import { Link } from 'react-router';
import { LanguageSwitch } from '../components/ui/LanguageSwitch.tsx';
import type { UiLang } from '../components/ui/ui-strings.ts';
import { TRUST_FACTS, type TrustFacts } from '../config/trust-facts.ts';
import { homePath, localizedPath } from '../i18n/lang.ts';
import { useLang, useMessages } from '../i18n/use-lang.ts';

interface SiteFooterProps {
  onLanguageChange: (lang: UiLang) => void;
  /** Injected for tests; defaults to the confirmed facts. */
  facts?: TrustFacts;
  /** Injected for tests; defaults to the current year. */
  year?: number;
}

/**
 * Four groups (docs/design/sitemap.md): Trust · Explore · Help · Legal.
 * Unconfirmed facts (null) are not rendered at all — no placeholders on the live site.
 */
export function SiteFooter({ onLanguageChange, facts = TRUST_FACTS, year }: SiteFooterProps) {
  const lang = useLang();
  const t = useMessages();
  const home = homePath(lang);
  const shownYear = year ?? new Date().getFullYear();

  return (
    <footer className="site-footer surface-inverse">
      <div className="site-footer__grid">
        <section className="site-footer__group site-footer__trust" aria-labelledby="footer-trust">
          <h2 id="footer-trust" className="site-footer__title">
            {facts.legalName ?? facts.siteName}
          </h2>
          {facts.registration && <p>{facts.registration}</p>}
          <dl className="site-footer__facts">
            {facts.phone && (
              <div>
                <dt>{t.phoneWhatsapp}</dt>
                <dd>
                  <a href={`tel:${facts.phone.tel}`}>{facts.phone.display}</a>
                  {facts.whatsappUrl && (
                    <>
                      {' · '}
                      <a href={facts.whatsappUrl} rel="noopener noreferrer">
                        WhatsApp
                      </a>
                    </>
                  )}
                </dd>
              </div>
            )}
            {facts.email && (
              <div>
                <dt>{t.email}</dt>
                <dd>
                  <a href={`mailto:${facts.email}`}>{facts.email}</a>
                </dd>
              </div>
            )}
            {facts.area && (
              <div>
                <dt>{t.location}</dt>
                <dd>{facts.area[lang]}</dd>
              </div>
            )}
            {facts.callHours && (
              <div>
                <dt>{t.callHours}</dt>
                <dd>{facts.callHours[lang]}</dd>
              </div>
            )}
          </dl>
        </section>

        <nav className="site-footer__group" aria-labelledby="footer-explore">
          <h2 id="footer-explore" className="site-footer__title">
            {t.footerExplore}
          </h2>
          <ul>
            <li>
              <a href={`${home}#about`}>{t.navAbout}</a>
            </li>
            <li>
              <a href={`${home}#ways-we-help`}>{t.navWays}</a>
            </li>
            <li>
              <a href={`${home}#impact`}>{t.navImpact}</a>
            </li>
            <li>
              <a href={`${home}#transparency`}>{t.navTransparency}</a>
            </li>
            <li>
              <a href={`${home}#faq`}>{t.navFaq}</a>
            </li>
          </ul>
        </nav>

        <nav className="site-footer__group" aria-labelledby="footer-help">
          <h2 id="footer-help" className="site-footer__title">
            {t.footerHelp}
          </h2>
          <ul>
            <li>
              <a href={`${home}#get-help`}>{t.getHelp}</a>
            </li>
            <li>
              <a href={`${home}#contact`}>{t.navContact}</a>
            </li>
            <li>
              <a href={`${home}#faq`}>{t.receiptHelp}</a>
            </li>
          </ul>
        </nav>

        <nav className="site-footer__group" aria-labelledby="footer-legal">
          <h2 id="footer-legal" className="site-footer__title">
            {t.footerLegal}
          </h2>
          <ul>
            <li>
              <Link to={localizedPath('/terms', lang)}>{t.terms}</Link>
            </li>
            <li>
              <Link to={localizedPath('/privacy', lang)}>{t.privacy}</Link>
            </li>
            <li>
              <Link to={localizedPath('/refund-policy', lang)}>{t.refund}</Link>
            </li>
          </ul>
          <LanguageSwitch current={lang} onChange={onLanguageChange} />
        </nav>
      </div>
      <p className="site-footer__copyright">
        © {shownYear} {facts.legalName ?? facts.siteName}
      </p>
    </footer>
  );
}
