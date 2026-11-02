import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../../test/a11y.ts';
import { renderRoute } from '../../test/render.tsx';
import { RootLayout } from '../../app/RootLayout.tsx';
import { TRUST_FACTS, type TrustFacts } from '../../config/trust-facts.ts';
import type { Bilingual } from '../../content/landing.ts';
import {
  PROOF_CONTENT,
  isPublishableMetric,
  isPublishableStory,
  type ImpactMetric,
  type ProofContent,
} from '../../content/proof.ts';
import { useDonationDraft } from '../../state/donation-draft.ts';
import { HomePage } from './HomePage.tsx';
import type { ProofProps } from './ProofSections.tsx';

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
  props: {
    proof?: ProofContent;
    facts?: TrustFacts;
    showDrafts?: boolean;
    states?: ProofProps['states'];
  } = {},
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

const section = (id: string) => document.getElementById(id)!;

const metric: ImpactMetric = {
  id: 'm1',
  value: '42',
  label: { en: 'Families supported', ta: 'ஆதரிக்கப்பட்ட குடும்பங்கள்' },
  source: { en: 'Annual report', ta: 'ஆண்டு அறிக்கை' },
  period: { en: 'Apr 2025 – Mar 2026', ta: 'ஏப் 2025 – மார் 2026' },
  updated: '2026-04-30',
  confirmed: true,
};

const withData: ProofContent = {
  ...PROOF_CONTENT,
  impact: {
    ...PROOF_CONTENT.impact,
    metrics: [
      metric,
      { ...metric, id: 'no-source', source: { en: '', ta: '' } },
      { ...metric, id: 'draft', value: '7', confirmed: false },
    ],
    stories: [
      {
        id: 's1',
        title: { en: 'A consented story', ta: 'ஒப்புதல் பெற்ற கதை' },
        body: { en: 'Body', ta: 'உள்ளடக்கம்' },
        consent: true,
        confirmed: true,
      },
      {
        id: 's2',
        title: { en: 'No consent story', ta: 'ஒப்புதல் இல்லாத கதை' },
        body: { en: 'Body', ta: 'உள்ளடக்கம்' },
        consent: false,
        confirmed: true,
      },
    ],
  },
  transparency: {
    ...PROOF_CONTENT.transparency,
    documents: [
      {
        id: 'd1',
        title: { en: 'Annual report 2025–26', ta: 'ஆண்டு அறிக்கை 2025–26' },
        language: 'en+ta',
        period: { en: 'Apr 2025 – Mar 2026', ta: 'ஏப் 2025 – மார் 2026' },
        published: '2026-05-15',
        fileType: 'PDF',
        url: '/docs/annual-report-2025-26.pdf',
        approved: true,
      },
      {
        id: 'd2',
        title: { en: 'Unapproved draft', ta: 'அங்கீகரிக்கப்படாத வரைவு' },
        language: 'en',
        period: { en: '2026', ta: '2026' },
        published: '2026-05-15',
        fileType: 'PDF',
        url: '/docs/x.pdf',
        approved: false,
      },
    ],
  },
};

function bilinguals(value: unknown, out: Bilingual[] = []): Bilingual[] {
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 2 && keys.includes('en') && keys.includes('ta'))
      out.push(value as Bilingual);
    else for (const child of Object.values(value)) bilinguals(child, out);
  }
  return out;
}

describe('proof content file', () => {
  it('every text has English and Tamil (Tamil script), no placeholders', () => {
    const all = bilinguals(PROOF_CONTENT);
    expect(all.length).toBeGreaterThan(40);
    for (const text of all) {
      expect(text.en.trim(), JSON.stringify(text)).not.toBe('');
      expect(text.ta, text.en).toMatch(/[஀-௿]/);
      expect(`${text.en} ${text.ta}`, text.en).not.toMatch(/\[|\]/);
    }
  });

  it('covers every FAQ topic the issue requires, in both languages', () => {
    const ids = PROOF_CONTENT.faq.items.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'donation-use',
        'earmarking',
        'pending-failed',
        'acknowledgement',
        'tax',
        'upi-over-2000',
        'upi-failed',
        'stop-monthly',
        'request-help',
        'data-use',
        'report-concern',
      ]),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the tax answer never promises a deduction', () => {
    const tax = PROOF_CONTENT.faq.items.find((f) => f.id === 'tax')!;
    expect(tax.answer.en).toMatch(/^Not at the moment/);
    expect(tax.answer.en).toMatch(/do not promise a deduction/);
    expect(tax.answer.en).not.toMatch(/Form 114|80G|10BE/);
  });

  it('a metric needs a value, source, period and valid date', () => {
    expect(isPublishableMetric(metric)).toBe(true);
    expect(isPublishableMetric({ ...metric, value: ' ' })).toBe(false);
    expect(isPublishableMetric({ ...metric, source: { en: 'x', ta: '' } })).toBe(false);
    expect(isPublishableMetric({ ...metric, period: { en: '', ta: 'x' } })).toBe(false);
    expect(isPublishableMetric({ ...metric, updated: 'yesterday' })).toBe(false);
  });

  it('a story needs consent', () => {
    const story = withData.impact.stories[0]!;
    expect(isPublishableStory(story)).toBe(true);
    expect(isPublishableStory({ ...story, consent: false })).toBe(false);
  });
});

describe('impact', () => {
  it('with no verified data shows a factual statement, never zeros', () => {
    renderHome();
    const impact = section('impact');
    expect(
      within(impact).getByRole('heading', { name: 'Figures will be published here' }),
    ).toBeVisible();
    expect(impact).not.toHaveTextContent(/\b0\b/);
    expect(within(impact).getByRole('link', { name: 'See our documents' })).toHaveAttribute(
      'href',
      '/#transparency',
    );
  });

  it('shows only publishable, confirmed metrics with source, period and date', () => {
    renderHome('/', { proof: withData });
    const items = within(section('impact')).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('42');
    expect(items[0]).toHaveTextContent('Source: Annual report');
    expect(items[0]).toHaveTextContent('Period: Apr 2025 – Mar 2026');
    expect(within(items[0]!).getByText('30 Apr 2026')).toHaveAttribute('datetime', '2026-04-30');
  });

  it('shows stories only with consent', () => {
    renderHome('/', { proof: withData });
    const impact = section('impact');
    expect(within(impact).getByRole('heading', { name: 'A consented story' })).toBeVisible();
    expect(within(impact).queryByText('No consent story')).not.toBeInTheDocument();
  });

  it('preview shows draft metrics labelled Draft', () => {
    renderHome('/', { proof: withData, showDrafts: true });
    const items = within(section('impact')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent('Draft — not yet confirmed');
  });

  it('stories without metrics still render (no empty state)', () => {
    renderHome('/', { proof: { ...withData, impact: { ...withData.impact, metrics: [] } } });
    expect(within(section('impact')).queryByRole('list')).not.toBeInTheDocument();
    expect(within(section('impact')).getByText('A consented story')).toBeVisible();
  });
});

describe('transparency centre', () => {
  it('empty: says documents will be published, no fake entries', () => {
    renderHome();
    const t = section('transparency');
    expect(within(t).getByText('Documents will be published here')).toBeVisible();
    expect(within(t).queryByRole('link', { name: /Download/ })).not.toBeInTheDocument();
  });

  it('lists approved documents with title, language, period, date and type', () => {
    renderHome('/', { proof: withData });
    const t = section('transparency');
    const row = within(t).getByRole('rowheader', { name: 'Annual report 2025–26' }).closest('tr')!;
    expect(row).toHaveTextContent('English and Tamil');
    expect(row).toHaveTextContent('Apr 2025 – Mar 2026');
    expect(row).toHaveTextContent('15 May 2026');
    const link = within(row).getByRole('link', { name: /Download: Annual report 2025–26/ });
    expect(link).toHaveAttribute('href', '/docs/annual-report-2025-26.pdf');
    expect(link).toHaveAttribute('download');
    expect(link).toHaveTextContent('(PDF)');
    expect(within(t).queryByText('Unapproved draft')).not.toBeInTheDocument();
  });

  it('Tamil labels in Tamil', () => {
    renderHome('/ta/', { proof: withData });
    const t = section('transparency');
    expect(within(t).getByRole('columnheader', { name: 'ஆவணம்' })).toBeInTheDocument();
    expect(t).toHaveTextContent('ஆங்கிலம் மற்றும் தமிழ்');
  });
});

describe('FAQ', () => {
  // Keyboard toggling of <details> is native browser behaviour; jsdom only models the click,
  // so Enter/Space are covered in e2e/proof.spec.ts.
  it('live page shows only confirmed answers as an accordion', async () => {
    const user = userEvent.setup();
    renderHome();
    const faq = section('faq');
    const questions = faq.querySelectorAll('summary');
    const confirmed = PROOF_CONTENT.faq.items.filter((f) => f.confirmed);
    expect(questions).toHaveLength(confirmed.length);
    expect(faq).not.toHaveTextContent('How is my donation used?');
    const tax = within(faq).getByText('Can I claim a tax deduction?');
    const details = tax.closest('details')!;
    expect(details.open).toBe(false);
    await user.click(tax);
    expect(details.open).toBe(true);
    expect(within(details).getByText(/Not at the moment/)).toBeVisible();
  });

  it('answers appear in Tamil on /ta/', () => {
    renderHome('/ta/');
    const faq = section('faq');
    expect(within(faq).getByRole('heading', { name: 'கேள்விகள்' })).toBeVisible();
    expect(within(faq).getByText('வரி விலக்கு கோர முடியுமா?')).toBeInTheDocument();
    expect(faq).toHaveTextContent('தற்போது இல்லை.');
  });

  it('preview shows every question; unconfirmed ones are labelled', () => {
    renderHome('/', { showDrafts: true });
    const faq = section('faq');
    expect(faq.querySelectorAll('summary')).toHaveLength(PROOF_CONTENT.faq.items.length);
    expect(within(faq).getAllByText('Draft — not yet confirmed')).toHaveLength(
      PROOF_CONTENT.faq.items.filter((f) => !f.confirmed).length,
    );
  });

  it('empty state when no answer is confirmed', () => {
    renderHome('/', {
      proof: {
        ...PROOF_CONTENT,
        faq: {
          ...PROOF_CONTENT.faq,
          items: PROOF_CONTENT.faq.items.map((f) => ({ ...f, confirmed: false })),
        },
      },
    });
    expect(within(section('faq')).getByText('Answers will be added soon')).toBeVisible();
  });
});

describe('loading and error states', () => {
  it.each(['impact', 'transparency', 'faq'] as const)('%s: loading state', (id) => {
    renderHome('/', { states: { [id]: { status: 'loading' } } });
    const s = section(id);
    expect(within(s).getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(within(s).getByRole('heading', { level: 3, name: 'Loading…' })).toBeInTheDocument();
  });

  it.each(['impact', 'transparency', 'faq'] as const)(
    '%s: error state with a working retry',
    async (id) => {
      const user = userEvent.setup();
      const retry = vi.fn();
      renderHome('/', { states: { [id]: { status: 'error', retry } } });
      const s = section(id);
      expect(within(s).getByRole('alert')).toHaveTextContent('This section could not be loaded');
      await user.click(within(s).getByRole('button', { name: 'Try again' }));
      expect(retry).toHaveBeenCalledTimes(1);
    },
  );

  it('error state in Tamil', () => {
    renderHome('/ta/', { states: { faq: { status: 'error', retry: vi.fn() } } });
    expect(
      within(section('faq')).getByRole('button', { name: 'மீண்டும் முயற்சிக்கவும்' }),
    ).toBeVisible();
  });
});

describe('contact', () => {
  it('shows verified phone, WhatsApp, email, area and hours; hides the unconfirmed address', () => {
    renderHome();
    const c = section('contact');
    expect(within(c).getByRole('link', { name: '+91 96005 16999' })).toHaveAttribute(
      'href',
      'tel:+919600516999',
    );
    expect(within(c).getByRole('link', { name: 'info.theonetrust@gmail.com' })).toBeInTheDocument();
    expect(c).toHaveTextContent('Kanchipuram, Tamil Nadu');
    expect(c).toHaveTextContent('Every day, 8 AM – 10 PM');
    expect(c).not.toHaveTextContent('Address');
    expect(within(c).getByRole('link', { name: 'WhatsApp us' })).toHaveAttribute(
      'href',
      'https://wa.me/919600516999',
    );
  });

  it('Get Help is the secondary style, never the Donate style', () => {
    renderHome();
    const help = within(section('contact')).getByRole('link', { name: 'Get Help' });
    expect(help).toHaveAttribute('href', '/#get-help');
    expect(help).toHaveClass('ui-button--secondary');
    expect(help).not.toHaveClass('ui-button--donate');
  });

  it('shows the address once confirmed, and hides missing channels', () => {
    renderHome('/', {
      facts: {
        ...TRUST_FACTS,
        address: { en: '1 Example Street', ta: '1 எடுத்துக்காட்டு தெரு' },
        whatsappUrl: null,
        email: null,
      },
    });
    const c = section('contact');
    expect(c).toHaveTextContent('Address1 Example Street');
    expect(within(c).queryByRole('link', { name: 'WhatsApp us' })).not.toBeInTheDocument();
    expect(c).not.toHaveTextContent('Email');
  });
});

describe('final call to action', () => {
  it('uses the neutral title on the live page and the draft title only in preview', () => {
    const { unmount } = renderHome();
    expect(within(section('give')).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Make a donation',
    );
    unmount();
    renderHome('/', { showDrafts: true });
    const give = section('give');
    expect(within(give).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Your contribution can change a life.',
    );
    expect(give).toHaveTextContent('Draft — not yet confirmed');
  });

  it('Donate without an amount opens the panel; with an amount it pre-fills and sets the draft', async () => {
    const user = userEvent.setup();
    renderHome();
    const give = section('give');
    const donate = within(give).getByRole('link', { name: 'Donate now' });
    expect(donate).toHaveAttribute('href', '/#donate');
    await user.click(within(give).getByRole('radio', { name: '₹2,000' }));
    expect(donate).toHaveAttribute('href', '/?amount=2000#donate');
    await user.click(donate);
    expect(probe.draft!.amountPaise).toBe(200000);
  });

  it('clicking Donate with no amount leaves the draft amount empty', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(within(section('give')).getByRole('link', { name: 'Donate now' }));
    expect(probe.draft!.amountPaise).toBeNull();
  });

  it('Tamil page: Tamil labels and /ta/ link', () => {
    renderHome('/ta/');
    const give = section('give');
    expect(
      within(give).getByRole('group', { name: 'தொகையைத் தேர்ந்தெடுங்கள்' }),
    ).toBeInTheDocument();
    expect(within(give).getByRole('link', { name: 'இப்போதே நன்கொடை அளியுங்கள்' })).toHaveAttribute(
      'href',
      '/ta/#donate',
    );
  });
});

describe('accessibility', () => {
  it.each(['/', '/ta/'])('%s full page with data has no axe violations', async (path) => {
    const { container } = renderHome(path, { proof: withData, showDrafts: true });
    await expectNoA11yViolations(container);
  });

  it('error and loading states have no axe violations', async () => {
    const { container } = renderHome('/', {
      states: {
        impact: { status: 'loading' },
        transparency: { status: 'error', retry: vi.fn() },
      },
    });
    await expectNoA11yViolations(container);
  });
});
