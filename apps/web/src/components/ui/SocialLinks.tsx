import type { TrustFacts } from '../../config/trust-facts.ts';

type Network = 'whatsapp' | 'facebook' | 'instagram' | 'youtube' | 'x';

const NAMES: Record<Network, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  x: 'X (Twitter)',
};

/** Simple one-colour glyphs (currentColor), drawn for a 24 × 24 box. */
const ICONS: Record<Network, string> = {
  whatsapp:
    'M12 2.5a9.4 9.4 0 0 0-8.1 14.2L2.6 21.4l4.8-1.3A9.4 9.4 0 1 0 12 2.5Zm0 17.1a7.7 7.7 0 0 1-3.9-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A7.7 7.7 0 1 1 12 19.6Zm4.3-5.8c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.3 6.3 0 0 1-3.1-2.7c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 5 5 0 0 0 1 2.6 11.3 11.3 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.5-.3Z',
  facebook:
    'M13.4 21.5v-8.1h2.7l.4-3.2h-3.1V8.2c0-.9.3-1.5 1.6-1.5h1.6V3.8a22 22 0 0 0-2.4-.1c-2.4 0-4 1.4-4 4.1v2.4H7.5v3.2h2.7v8.1h3.2Z',
  instagram:
    'M12 4.2c2.5 0 2.8 0 3.8.1 2.6.1 3.8 1.3 3.9 3.9.1 1 .1 1.3.1 3.8s0 2.8-.1 3.8c-.1 2.6-1.3 3.8-3.9 3.9-1 .1-1.3.1-3.8.1s-2.8 0-3.8-.1c-2.6-.1-3.8-1.3-3.9-3.9-.1-1-.1-1.3-.1-3.8s0-2.8.1-3.8c.1-2.6 1.3-3.8 3.9-3.9 1-.1 1.3-.1 3.8-.1ZM12 2.5c-2.6 0-2.9 0-3.9.1-3.5.2-5.4 2.1-5.6 5.6-.1 1-.1 1.3-.1 3.8s0 2.9.1 3.9c.2 3.5 2.1 5.4 5.6 5.6 1 .1 1.3.1 3.9.1s2.9 0 3.9-.1c3.5-.2 5.4-2.1 5.6-5.6.1-1 .1-1.3.1-3.9s0-2.8-.1-3.8c-.2-3.5-2.1-5.4-5.6-5.6-1-.1-1.3-.1-3.9-.1Zm0 4.6a4.9 4.9 0 1 0 0 9.8 4.9 4.9 0 0 0 0-9.8Zm0 8.1a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4Zm5.1-9.4a1.1 1.1 0 1 0 0 2.3 1.1 1.1 0 0 0 0-2.3Z',
  youtube:
    'M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z',
  x: 'M17.8 3h3l-6.6 7.6L22 21h-6.1l-4.8-6.3L5.6 21h-3l7.1-8.1L2.2 3h6.2l4.3 5.7L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z',
};

/**
 * Round social icons for the footer (client, Nov 2026). Only links the trust has confirmed are
 * shown — WhatsApp today; the others appear once their page addresses are added to TRUST_FACTS.
 * Each icon's accessible name is the network name; the glyphs are decorative.
 */
export function SocialLinks({ facts, label }: { facts: TrustFacts; label: string }) {
  const links: [Network, string][] = [];
  if (facts.whatsappUrl) links.push(['whatsapp', facts.whatsappUrl]);
  for (const key of ['facebook', 'instagram', 'youtube', 'x'] as const) {
    const url = facts.social?.[key];
    if (url) links.push([key, url]);
  }
  if (links.length === 0) return null;
  return (
    <ul className="ui-social" aria-label={label}>
      {links.map(([key, url]) => (
        <li key={key}>
          <a
            className="ui-social__link"
            href={url}
            rel="noopener noreferrer"
            aria-label={NAMES[key]}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              <path d={ICONS[key]} fill="currentColor" />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
