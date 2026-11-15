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
import { HOME_TEXT } from './home-content.ts';

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
  it('shows sections in order with one h1, keeping the menu anchors', () => {
    renderHome();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const ids = [...document.querySelectorAll('main section[id]')].map((s) => s.id);
    expect(ids).toEqual([
      'top',
      'about',
      'ways-we-help',
      'services',
      'explore',
      'impact',
      'how-it-works',
      'give',
      'contact',
      'faq',
    ]);
  });

  it('hero uses the approved wording and never shows unconfirmed dashboard text', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      LANDING_CONTENT.hero.headline.value.en,
    );
    expect(document.body).not.toHaveTextContent('Draft —');
  });

  it('a confirmed headline from the dashboard wins over the default wording', () => {
    renderHome('/', {
      content: {
        ...LANDING_CONTENT,
        hero: {
          ...LANDING_CONTENT.hero,
          headline: {
            confirmed: true,
            value: { en: 'Confirmed headline', ta: 'உறுதியான தலைப்பு' },
          },
        },
      },
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Confirmed headline');
  });

  it('hero has Donate (primary) and Get Help actions', () => {
    renderHome();
    const hero = document.getElementById('top')!;
    expect(within(hero).getByRole('link', { name: 'Donate now' })).toHaveAttribute(
      'href',
      '/#donate',
    );
    expect(within(hero).getByRole('link', { name: /Get Help/ })).toHaveAttribute(
      'href',
      '/#get-help',
    );
  });

  it('hero shows the area only when it is verified', () => {
    const { unmount } = renderHome();
    expect(
      within(document.getElementById('top')!).getByText('Kanchipuram, Tamil Nadu'),
    ).toBeVisible();
    unmount();
    renderHome('/', { facts: { ...TRUST_FACTS, area: null } });
    expect(document.getElementById('top')).not.toHaveTextContent('Kanchipuram');
  });

  it('hero area is a map link that opens in a new tab, in English and Tamil', () => {
    const { unmount } = renderHome();
    const map = within(document.getElementById('top')!).getByRole('link', {
      name: /Kanchipuram, Tamil Nadu/,
    });
    expect(map).toHaveAttribute('href', TRUST_FACTS.mapUrl);
    expect(map).toHaveAttribute('target', '_blank');
    expect(map).toHaveAttribute('rel', 'noopener noreferrer');
    expect(map).toHaveAccessibleName(/opens in a new tab/);
    unmount();
    renderHome('/ta');
    expect(
      within(document.getElementById('top')!).getByRole('link', { name: /காஞ்சிபுரம்/ }),
    ).toHaveAccessibleName(/புதிய தாவலில்/);
  });

  it('the area is a map link in three places: hero, contact and footer', () => {
    renderHome();
    const places = [
      document.getElementById('top')!,
      document.getElementById('contact')!,
      screen.getByRole('contentinfo'),
    ];
    for (const place of places) {
      expect(within(place).getByRole('link', { name: /Kanchipuram, Tamil Nadu/ })).toHaveAttribute(
        'href',
        TRUST_FACTS.mapUrl,
      );
    }
  });

  it('hero area stays plain text when there is no map link', () => {
    renderHome('/', { facts: { ...TRUST_FACTS, mapUrl: null } });
    const top = document.getElementById('top')!;
    expect(within(top).getByText('Kanchipuram, Tamil Nadu')).toBeVisible();
    expect(within(top).queryByRole('link', { name: /Kanchipuram/ })).toBeNull();
  });

  it('where help is needed shows only confirmed programmes with who-for and fund label', () => {
    renderHome();
    const ways = document.getElementById('ways-we-help')!;
    const rows = ways.querySelectorAll('.hp-need-row');
    expect(rows).toHaveLength(1);
    expect(within(ways).getByRole('heading', { name: 'Where it’s needed most' })).toBeVisible();
    expect(rows[0]).toHaveTextContent('For: Whoever needs it most at the time');
    expect(rows[0]).toHaveTextContent('General fund');
  });

  it('a programme’s Give link passes the programme to the donate panel and the draft', async () => {
    const user = userEvent.setup();
    renderHome();
    const link = screen.getByRole('link', { name: /^Give\W+Where it’s needed most/ });
    expect(link).toHaveAttribute('href', '/?programme=general#donate');
    await user.click(link);
    expect(probe.draft!.programme).toBe('general');
  });

  it('how it works lists four steps and links to the refund/payment-help policy', () => {
    renderHome();
    const how = document.getElementById('how-it-works')!;
    expect(how.querySelectorAll('.hp-step')).toHaveLength(4);
    expect(
      within(how).getByRole('link', { name: 'Payment help, refunds and corrections' }),
    ).toHaveAttribute('href', '/refund-policy');
  });

  it('Tamil page uses Tamil content and /ta/ links', () => {
    renderHome('/ta/');
    expect(screen.getByRole('heading', { level: 2, name: HOME_TEXT.needTitle.ta })).toBeVisible();
    expect(document.querySelector('#ways-we-help .hp-need-row__give')).toHaveAttribute(
      'href',
      '/ta/?programme=general#donate',
    );
    expect(
      screen.getByRole('link', {
        name: 'பணம் செலுத்துவதில் உதவி, பணம் திரும்பத் தருதல், திருத்தங்கள்',
      }),
    ).toHaveAttribute('href', '/ta/refund-policy');
  });

  it.each(['/', '/ta/'])('%s has no axe violations', async (path) => {
    const { container } = renderHome(path);
    await expectNoA11yViolations(container);
  });
});

describe('drafts visible (preview mode), always labelled', () => {
  it('shows all programmes, each unconfirmed one marked Draft', () => {
    renderHome('/', { showDrafts: true });
    const ways = document.getElementById('ways-we-help')!;
    const all = LANDING_CONTENT.ways.programmes;
    expect(ways.querySelectorAll('.hp-need-row')).toHaveLength(all.length);
    expect(within(ways).getAllByText('Draft — not yet confirmed')).toHaveLength(
      all.filter((p) => !p.confirmed).length,
    );
  });

  it('has no axe violations with drafts shown', async () => {
    const { container } = renderHome('/', { showDrafts: true });
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
    // The hero video carousel also observes the page, so match the observer to its element.
    const observers: Array<{
      cb: IntersectionObserverCallback;
      disconnect: () => void;
      target?: Element;
    }> = [];
    class FakeObserver {
      disconnect = vi.fn();
      entry: (typeof observers)[number];
      constructor(cb: IntersectionObserverCallback) {
        this.entry = { cb, disconnect: this.disconnect };
        observers.push(this.entry);
      }
      observe(el: Element) {
        this.entry.target = el;
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    renderHome();
    const first = document.querySelector('.reveal')!;
    const observer = observers.find((o) => o.target === first)!;
    expect(first).toHaveAttribute('data-reveal', 'waiting');
    act(() => observer.cb([{ isIntersecting: false } as IntersectionObserverEntry], {} as never));
    expect(first).toHaveAttribute('data-reveal', 'waiting');
    act(() => observer.cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as never));
    expect(first).toHaveAttribute('data-reveal', 'shown');
    expect(observer.disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
