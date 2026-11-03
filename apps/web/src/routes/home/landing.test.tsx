import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../../test/a11y.ts';
import { renderRoute } from '../../test/render.tsx';
import { TRUST_FACTS, type TrustFacts } from '../../config/trust-facts.ts';
import {
  LANDING_CONTENT,
  draftsVisible,
  visible,
  type Bilingual,
  type LandingContent,
} from '../../content/landing.ts';
import { useDonationDraft } from '../../state/donation-draft.ts';
import { RootLayout } from '../../app/RootLayout.tsx';
import { HomePage } from './HomePage.tsx';

afterEach(() => {
  document.documentElement.lang = 'en';
});

const probe: { draft?: ReturnType<typeof useDonationDraft>['draft'] } = {};
function DraftProbe() {
  const { draft } = useDonationDraft();
  useEffect(() => {
    probe.draft = draft;
  }, [draft]);
  return null;
}

function renderHome(
  path = '/',
  props: { content?: LandingContent; facts?: TrustFacts; showDrafts?: boolean } = {},
) {
  const page = (
    <>
      <HomePage showDrafts={false} {...props} />
      <DraftProbe />
    </>
  );
  const routes: RouteObject[] = [
    {
      path: '/',
      element: <RootLayout />,
      children: [
        { index: true, element: page },
        { path: 'ta', children: [{ index: true, element: page }] },
      ],
    },
  ];
  return renderRoute(path, routes);
}

/** Every string in the content, flattened, for parity and "no placeholder" checks. */
function bilinguals(value: unknown, out: Bilingual[] = []): Bilingual[] {
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 2 && keys.includes('en') && keys.includes('ta'))
      out.push(value as Bilingual);
    else for (const child of Object.values(value)) bilinguals(child, out);
  }
  return out;
}

describe('landing content file', () => {
  const all = bilinguals(LANDING_CONTENT);

  it('has text to check', () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it('every entry has non-empty English and Tamil (Tamil in Tamil script)', () => {
    for (const text of all) {
      expect(text.en.trim(), JSON.stringify(text)).not.toBe('');
      expect(text.ta, text.en).toMatch(/[஀-௿]/);
    }
  });

  it('contains no wireframe placeholders like [CONFIRM] or [Headline]', () => {
    for (const text of all) {
      expect(text.en, text.en).not.toMatch(/\[|\]/);
      expect(text.ta, text.en).not.toMatch(/\[|\]/);
    }
  });

  it('programme slugs are unique and URL-safe', () => {
    const slugs = LANDING_CONTENT.ways.programmes.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('nothing unconfirmed is treated as a fact: unconfirmed programmes have no claims', () => {
    for (const p of LANDING_CONTENT.ways.programmes.filter((x) => !x.confirmed)) {
      expect(p.summary, p.slug).toBeNull();
      expect(p.whoFor, p.slug).toBeNull();
    }
  });

  it('drafts are shown only when VITE_SHOW_DRAFT_CONTENT is exactly "true"', () => {
    expect(draftsVisible({ VITE_SHOW_DRAFT_CONTENT: 'true' })).toBe(true);
    expect(draftsVisible({ VITE_SHOW_DRAFT_CONTENT: 'TRUE' })).toBe(false);
    expect(draftsVisible({ VITE_SHOW_DRAFT_CONTENT: '1' })).toBe(false);
    expect(draftsVisible({})).toBe(false);
    expect(draftsVisible()).toBe(false); // the test/production default
  });

  it('visible() hides unconfirmed and missing items unless drafts are on', () => {
    const draft = { confirmed: false, value: 1 };
    const real = { confirmed: true, value: 2 };
    expect(visible(null, true)).toBeNull();
    expect(visible(draft, false)).toBeNull();
    expect(visible(draft, true)).toBe(draft);
    expect(visible(real, false)).toBe(real);
  });
});

describe('live page (drafts hidden)', () => {
  it('shows sections in plan order with one h1', () => {
    renderHome();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const ids = [...document.querySelectorAll('main section[id]')].map((s) => s.id);
    expect(ids).toEqual([
      'top',
      'about',
      'ways-we-help',
      'how-it-works',
      'impact',
      'transparency',
      'faq',
      'contact',
      'give',
    ]);
  });

  it('hero falls back to the site name and never shows unconfirmed wording', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(TRUST_FACTS.siteName);
    expect(document.body).not.toHaveTextContent(LANDING_CONTENT.hero.headline.value.en);
    expect(document.body).not.toHaveTextContent('Razorpay');
    expect(document.body).not.toHaveTextContent('Draft —');
  });

  it('hero has Donate (primary) and Get Help (secondary) actions', () => {
    renderHome();
    const hero = document.getElementById('top')!;
    expect(within(hero).getByRole('link', { name: 'Donate now' })).toHaveAttribute(
      'href',
      '/#donate',
    );
    expect(within(hero).getByRole('link', { name: 'Get Help' })).toHaveAttribute(
      'href',
      '/#get-help',
    );
  });

  it('facts strip shows only verified facts (area) and hides unknown ones', () => {
    renderHome();
    const about = document.getElementById('about')!;
    expect(within(about).getByText('Area')).toBeInTheDocument();
    expect(within(about).getByText('Kanchipuram, Tamil Nadu')).toBeInTheDocument();
    for (const hidden of ['Legal name', 'Registration', 'Established', 'Tax approval']) {
      expect(within(about).queryByText(hidden)).not.toBeInTheDocument();
    }
  });

  it('facts strip disappears completely when no fact is verified', () => {
    renderHome('/', { facts: { ...TRUST_FACTS, area: null } });
    expect(document.querySelector('.landing-facts')).toBeNull();
  });

  it('ways we help shows only confirmed cards with who-for and general/earmarked label', () => {
    renderHome();
    const ways = document.getElementById('ways-we-help')!;
    const cards = within(ways).getAllByRole('article');
    expect(cards).toHaveLength(1);
    expect(
      within(cards[0]!).getByRole('heading', { name: 'Where it’s needed most' }),
    ).toBeVisible();
    expect(cards[0]).toHaveTextContent('For: Whoever needs it most at the time');
    expect(cards[0]).toHaveTextContent('General fund');
    expect(within(ways).queryByText('Education')).not.toBeInTheDocument();
  });

  it('a card passes its programme to the donate panel and the draft', async () => {
    const user = userEvent.setup();
    renderHome();
    const link = screen.getByRole('link', { name: /^Give\W+Where it’s needed most/ });
    expect(link).toHaveAttribute('href', '/?programme=general#donate');
    await user.click(link);
    expect(probe.draft!.programme).toBe('general');
  });

  it('how a donation helps is hidden while no example is verified', () => {
    renderHome();
    expect(document.getElementById('how-donations-help')).toBeNull();
  });

  it('how it works lists four steps and links to the refund/payment-help policy', () => {
    renderHome();
    const how = document.getElementById('how-it-works')!;
    expect(within(how).getAllByRole('listitem')).toHaveLength(4);
    expect(
      within(how).getByRole('link', { name: 'Payment help, refunds and corrections' }),
    ).toHaveAttribute('href', '/refund-policy');
  });

  it('Tamil page uses Tamil content and /ta/ links', () => {
    renderHome('/ta/');
    expect(screen.getByRole('heading', { level: 2, name: 'நாங்கள் உதவும் வழிகள்' })).toBeVisible();
    expect(screen.getByRole('link', { name: /நன்கொடை அளிக்க/ })).toHaveAttribute(
      'href',
      '/ta/?programme=general#donate',
    );
    expect(
      within(document.getElementById('about')!).getByText('காஞ்சிபுரம், தமிழ்நாடு'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'கட்டண உதவி, பணம் திரும்பப்பெறுதல் மற்றும் திருத்தங்கள்' }),
    ).toHaveAttribute('href', '/ta/refund-policy');
  });

  it.each(['/', '/ta/'])('%s has no axe violations', async (path) => {
    const { container } = renderHome(path);
    await expectNoA11yViolations(container);
  });
});

describe('preview page (drafts visible, always labelled)', () => {
  const withExample: LandingContent = {
    ...LANDING_CONTENT,
    hero: {
      ...LANDING_CONTENT.hero,
      eyebrow: { confirmed: true, value: { en: 'Kanchipuram', ta: 'காஞ்சிபுரம்' } },
      lead: { confirmed: false, value: { en: 'Draft lead', ta: 'வரைவு முன்னுரை' } },
    },
    about: {
      ...LANDING_CONTENT.about,
      intro: { confirmed: true, value: { en: 'Verified intro', ta: 'உறுதியான அறிமுகம்' } },
    },
    donationHelps: {
      ...LANDING_CONTENT.donationHelps,
      examples: [
        {
          amountRupees: 500,
          covers: { en: 'Draft example', ta: 'வரைவு எடுத்துக்காட்டு' },
          confirmed: false,
        },
      ],
    },
  };

  it('shows draft headline, payment note and all programmes, each marked Draft', () => {
    renderHome('/', { showDrafts: true });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Together, we create a better tomorrow.',
    );
    const ways = document.getElementById('ways-we-help')!;
    expect(within(ways).getAllByRole('article')).toHaveLength(7);
    expect(within(ways).getAllByText('Draft — not yet confirmed')).toHaveLength(6);
    expect(screen.getByText(/Secure payment via Razorpay/)).toBeInTheDocument();
  });

  it('shows examples with the illustrative note, confirmed text without a Draft label', () => {
    renderHome('/', { showDrafts: true, content: withExample });
    const helps = document.getElementById('how-donations-help')!;
    expect(helps).toHaveTextContent('₹500');
    expect(helps).toHaveTextContent('Illustrative examples');
    expect(screen.getByText('Verified intro')).toBeInTheDocument();
    expect(screen.getByText('Verified intro')).not.toHaveTextContent('Draft');
    expect(screen.getByText(/Draft lead/)).toHaveTextContent('Draft — not yet confirmed');
    expect(screen.getByText(/Kanchipuram/, { selector: '.landing-hero__eyebrow' })).toBeVisible();
  });

  it('Tamil example amounts use Indian formatting', () => {
    renderHome('/ta/', { showDrafts: true, content: withExample });
    expect(document.getElementById('how-donations-help')).toHaveTextContent('₹500');
  });

  it('hides examples on the live page even when they exist unconfirmed', () => {
    renderHome('/', { showDrafts: false, content: withExample });
    expect(document.getElementById('how-donations-help')).toBeNull();
    expect(screen.queryByText(/Draft lead/)).not.toBeInTheDocument();
  });

  it('has no axe violations with drafts shown', async () => {
    const { container } = renderHome('/', { showDrafts: true, content: withExample });
    await expectNoA11yViolations(container);
  });
});

describe('scroll reveal', () => {
  it('content is visible without IntersectionObserver (static)', () => {
    renderHome();
    for (const el of document.querySelectorAll('.reveal')) {
      expect(el).toHaveAttribute('data-reveal', 'static');
    }
  });

  it('waits, then reveals when the section scrolls into view, and disconnects', () => {
    const observers: Array<{ cb: IntersectionObserverCallback; disconnect: () => void }> = [];
    class FakeObserver {
      disconnect = vi.fn();
      constructor(cb: IntersectionObserverCallback) {
        observers.push({ cb, disconnect: this.disconnect });
      }
      observe() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    renderHome();
    const first = document.querySelector('.reveal')!;
    expect(first).toHaveAttribute('data-reveal', 'waiting');
    act(() =>
      observers[0]!.cb([{ isIntersecting: false } as IntersectionObserverEntry], {} as never),
    );
    expect(first).toHaveAttribute('data-reveal', 'waiting');
    act(() =>
      observers[0]!.cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as never),
    );
    expect(first).toHaveAttribute('data-reveal', 'shown');
    expect(observers[0]!.disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
