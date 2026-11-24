import { Link } from 'react-router';
import { AreaLink } from '../components/ui/AreaLink.tsx';
import { LanguageSwitch } from '../components/ui/LanguageSwitch.tsx';
import { SocialLinks } from '../components/ui/SocialLinks.tsx';
import type { UiLang } from '../components/ui/ui-strings.ts';
import { TRUST_FACTS, type TrustFacts } from '../config/trust-facts.ts';
import { homePath, localizedPath } from '../i18n/lang.ts';
import { useLang, useMessages } from '../i18n/use-lang.ts';
import emblemUrl from '../assets/brand/emblem.webp';

interface SiteFooterProps {
  onLanguageChange: (lang: UiLang) => void;
  /** Injected for tests; defaults to the confirmed facts. */
  facts?: TrustFacts;
  /** Injected for tests; defaults to the current year. */
  year?: number;
}

/**
 * Trust · Explore · Help · Legal · Contact (docs/design/sitemap.md), then a bar with the area,
 * copyright and language switch, and a large faded wordmark (client, Nov 2026).
 * Unconfirmed facts (null) are not rendered at all — no placeholders on the live site.
 */
export function SiteFooter({ onLanguageChange, facts = TRUST_FACTS, year }: SiteFooterProps) {
  const lang = useLang();
  const t = useMessages();
  const home = homePath(lang);
  const shownYear = year ?? new Date().getFullYear();

  const name = facts.legalName ?? facts.siteName;

  return (
    <footer className="site-footer surface-inverse">
      <div className="site-footer__inner">
        <div className="site-footer__grid">
          <section className="site-footer__group site-footer__trust" aria-labelledby="footer-trust">
            <h2 id="footer-trust" className="site-footer__title site-footer__brand">
              <img className="site-footer__logo" src={emblemUrl} alt="" width={131} height={112} />
              <span className="brand-wordmark">{name}</span>
            </h2>
            {facts.registration && <p>{facts.registration}</p>}
            <p className="site-footer__vision">{t.footerVision}</p>
            <div className="site-footer__cta">
              <Link className="ui-button ui-button--donate" to={`${home}#donate`}>
                {t.donate}
              </Link>
              <Link className="ui-button ui-button--secondary" to={`${home}#get-help`}>
                {t.getHelp}
              </Link>
            </div>
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
                <Link to={`${home}#get-help`}>{t.getHelp}</Link>
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
          </nav>

          <section
            className="site-footer__group site-footer__contact"
            aria-labelledby="footer-contact"
          >
            <h2 id="footer-contact" className="site-footer__title">
              {t.navContact}
            </h2>
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
              {facts.callHours && (
                <div>
                  <dt>{t.callHours}</dt>
                  <dd>{facts.callHours[lang]}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        <div className="site-footer__bar">
          <div className="site-footer__meta">
            {facts.area && (
              <p className="site-footer__area">
                <span className="visually-hidden">{t.location}: </span>
                <AreaLink facts={facts} lang={lang} />
              </p>
            )}
            <p className="site-footer__copyright">
              © {shownYear} {name}
            </p>
          </div>
          <SocialLinks facts={facts} label={t.socialLinks} />
          <LanguageSwitch current={lang} onChange={onLanguageChange} />
        </div>
      </div>
      {/* Big faded name along the bottom edge — decoration only. */}
      <p className="site-footer__wordmark" aria-hidden="true">
        {facts.siteName.replace(/\.in$/, '')}
      </p>
    </footer>
  );
}
