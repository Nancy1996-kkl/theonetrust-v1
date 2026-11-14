import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '../../test/a11y.ts';
import { renderRoute } from '../../test/render.tsx';
import { UiLangContext } from '../../components/ui/ui-strings.ts';
import { TRUST_FACTS } from '../../config/trust-facts.ts';
import { POLICIES, POLICY_UI, type PolicyId } from '../../content/policies.ts';
import { PolicyNotice } from './PolicyNotice.tsx';
import { PolicyPage } from './PolicyPage.tsx';

afterEach(() => {
  document.documentElement.lang = 'en';
});

const IDS = Object.keys(POLICIES) as PolicyId[];
const tamil = /[஀-௿]/;

describe('policy content: Tamil and English are equivalent', () => {
  it.each(IDS)('%s has the same structure in both languages', (id) => {
    const policy = POLICIES[id];
    for (const text of [policy.title, policy.intro]) {
      expect(text.en.trim()).not.toBe('');
      expect(text.ta).toMatch(tamil);
    }
    const ids = policy.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of policy.sections) {
      for (const text of [section.heading, ...section.paragraphs, ...(section.list ?? [])]) {
        expect(text.en.trim(), `${id}/${section.id}`).not.toBe('');
        expect(text.ta, `${id}/${section.id}: ${text.en}`).toMatch(tamil);
        expect(`${text.en}${text.ta}`, `${id}/${section.id}`).not.toMatch(/\[|\]/);
      }
    }
  });

  it('UI strings are bilingual', () => {
    for (const [key, text] of Object.entries(POLICY_UI)) {
      expect(text.en.trim(), key).not.toBe('');
      expect(text.ta, key).toMatch(tamil);
    }
  });

  it('the refund policy states shipping does not apply (Razorpay)', () => {
    const shipping = POLICIES.refund.sections.find((s) => s.id === 'shipping')!;
    expect(shipping.confirmed).toBe(true);
    expect(shipping.paragraphs[0]!.en).toMatch(/^Not applicable\. .*donations only/);
  });

  it('the privacy policy covers required vs optional data, use, sharing, retention and contact', () => {
    const ids = POLICIES.privacy.sections.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining(['donors', 'help-seekers', 'use', 'sharing', 'retention', 'rights']),
    );
    const donors = POLICIES.privacy.sections.find((s) => s.id === 'donors')!;
    expect(donors.paragraphs.map((p) => p.en).join(' ')).toMatch(/Required:.*Optional:/s);
  });

  it('nothing promises a tax deduction', () => {
    for (const policy of Object.values(POLICIES)) {
      for (const section of policy.sections) {
        for (const text of section.paragraphs) {
          expect(text.en).not.toMatch(
            /you (will|can) (get|claim) a (tax )?deduction|80G|Form 114/i,
          );
        }
      }
    }
  });

  it('the refund policy covers cancelling monthly giving', () => {
    expect(POLICIES.refund.sections.some((s) => s.id === 'monthly')).toBe(true);
  });
});

describe.each([
  ['/terms', 'Terms of use', 'terms'],
  ['/privacy', 'Privacy policy', 'privacy'],
  ['/refund-policy', 'Refund, cancellation and correction policy', 'refund'],
] as const)('%s', (path, title, id) => {
  it('renders the page with one h1 and every section heading', () => {
    renderRoute(path);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeVisible();
    for (const section of POLICIES[id].sections) {
      expect(screen.getByRole('heading', { level: 2, name: section.heading.en })).toBeVisible();
    }
  });

  it('Tamil mirror under /ta/ shows the Tamil text', () => {
    renderRoute(`/ta${path}`);
    expect(screen.getByRole('heading', { level: 1, name: POLICIES[id].title.ta })).toBeVisible();
    expect(document.documentElement.lang).toBe('ta');
  });

  it('links to the other two policies in the same language', () => {
    renderRoute(`/ta${path}`);
    const others = screen.getByRole('navigation', { name: POLICY_UI.otherPolicies.ta });
    const links = within(others).getAllByRole('link');
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.getAttribute('href')).toMatch(/^\/ta\//);
  });

  it('has an "On this page" list linking to every section', () => {
    renderRoute(path);
    const toc = screen.getByRole('navigation', { name: POLICY_UI.onThisPage.en });
    const links = within(toc).getAllByRole('link');
    expect(links).toHaveLength(POLICIES[id].sections.length);
    POLICIES[id].sections.forEach((section, i) => {
      expect(links[i]).toHaveAttribute('href', `#${section.id}`);
      expect(document.getElementById(section.id)).not.toBeNull();
    });
  });

  it('Tamil page uses the Tamil "On this page" label', () => {
    renderRoute(`/ta${path}`);
    expect(screen.getByRole('navigation', { name: POLICY_UI.onThisPage.ta })).toBeInTheDocument();
  });

  it.each(['', '/ta'])('%s has no axe violations', async (prefix) => {
    const { container } = renderRoute(`${prefix}${path}`);
    await expectNoA11yViolations(container);
  });
});

describe('unconfirmed sections', () => {
  const retention = POLICIES.privacy.sections.find((s) => s.id === 'retention')!;

  it('live page: heading with a "being reviewed" placeholder, no draft wording', () => {
    renderRoute('/privacy');
    expect(screen.getByText(POLICY_UI.pendingNotice.en)).toBeVisible();
    const section = document.getElementById('retention')!;
    expect(section).toHaveTextContent(POLICY_UI.pendingSection.en);
    expect(section).not.toHaveTextContent(retention.paragraphs[0]!.en);
  });

  it('preview: draft wording shown and labelled Draft', () => {
    render(
      <MemoryRouter>
        <UiLangContext.Provider value="en">
          <PolicyPage id="privacy" showDrafts />
        </UiLangContext.Provider>
      </MemoryRouter>,
    );
    const section = document.getElementById('retention')!;
    expect(section).toHaveTextContent(retention.paragraphs[0]!.en);
    expect(section).toHaveTextContent(POLICY_UI.draftLabel.en);
  });

  it('a fully confirmed policy shows no review notice', () => {
    const confirmed = {
      ...POLICIES,
      privacy: {
        ...POLICIES.privacy,
        sections: POLICIES.privacy.sections.map((s) => ({ ...s, confirmed: true })),
      },
    };
    render(
      <MemoryRouter>
        <PolicyPage id="privacy" policies={confirmed} showDrafts={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(POLICY_UI.pendingNotice.en)).not.toBeInTheDocument();
    expect(screen.queryByText(POLICY_UI.pendingSection.en)).not.toBeInTheDocument();
  });

  it('confirmed list items render', () => {
    renderRoute('/refund-policy');
    const section = document.getElementById('when-refund')!;
    expect(within(section).getAllByRole('listitem')).toHaveLength(3);
  });
});

describe('contact block', () => {
  const contactSection = () =>
    screen.getByRole('heading', { name: POLICY_UI.contactHeading.en }).closest('section')!;

  it('shows WhatsApp, call and email as buttons with the verified details', () => {
    renderRoute('/terms');
    const contact = contactSection();
    const whatsapp = within(contact).getByRole('link', { name: POLICY_UI.whatsappUs.en });
    expect(whatsapp).toHaveAttribute('href', 'https://wa.me/919600516999');
    expect(whatsapp).toHaveClass('ui-button--primary');
    const call = within(contact).getByRole('link', { name: 'Call us +91 96005 16999' });
    expect(call).toHaveAttribute('href', 'tel:+919600516999');
    expect(call).toHaveClass('ui-button');
    const email = within(contact).getByRole('link', {
      name: 'Email us info.theonetrust@gmail.com',
    });
    expect(email).toHaveAttribute('href', 'mailto:info.theonetrust@gmail.com');
    expect(contact).toHaveTextContent('Every day, 8 AM – 10 PM');
  });

  it('Tamil contact buttons use Tamil labels', () => {
    renderRoute('/ta/terms');
    const contact = screen
      .getByRole('heading', { name: POLICY_UI.contactHeading.ta })
      .closest('section')!;
    expect(within(contact).getByRole('link', { name: POLICY_UI.whatsappUs.ta })).toBeVisible();
    expect(contact).toHaveTextContent(POLICY_UI.callUs.ta);
    expect(contact).toHaveTextContent(POLICY_UI.emailUs.ta);
    expect(contact).toHaveTextContent(POLICY_UI.callHours.ta);
  });

  it('hides missing channels', () => {
    render(
      <MemoryRouter>
        <PolicyPage
          id="terms"
          facts={{ ...TRUST_FACTS, email: null, phone: null, whatsappUrl: null, callHours: null }}
        />
      </MemoryRouter>,
    );
    expect(within(contactSection()).queryAllByRole('link')).toHaveLength(0);
    expect(contactSection()).not.toHaveTextContent(POLICY_UI.callHours.en);
  });
});

describe('linked from the footer and from forms', () => {
  it('footer links reach each policy page', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    const legal = screen.getByRole('navigation', { name: 'Legal' });
    await user.click(within(legal).getByRole('link', { name: 'Privacy' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
  });

  it('the home donation section shows the policy notice', () => {
    renderRoute('/');
    const give = document.getElementById('give')!;
    expect(within(give).getByRole('link', { name: 'Terms of use' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(within(give).getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(
      within(give).getByRole('link', { name: 'Refund, cancellation and correction policy' }),
    ).toHaveAttribute('href', '/refund-policy');
  });

  it('PolicyNotice for help forms can leave out the refund link; Tamil links go to /ta/', () => {
    render(
      <MemoryRouter>
        <UiLangContext.Provider value="ta">
          <PolicyNotice refund={false} />
        </UiLangContext.Provider>
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/ta/terms', '/ta/privacy']);
  });
});

describe('privacy notice matches what the system does (#38)', () => {
  it('says PAN and address are reported to the Income Tax Department for tax opt-ins', () => {
    const sharing = POLICIES.privacy.sections.find((s) => s.id === 'sharing');
    const en = sharing?.paragraphs.map((p) => p.en).join(' ') ?? '';
    const ta = sharing?.paragraphs.map((p) => p.ta).join(' ') ?? '';
    expect(sharing?.confirmed).toBe(true);
    expect(en).toMatch(/PAN, address and the amount are reported to the Income Tax Department/);
    expect(ta).toMatch(/வருமான வரித் துறைக்குத் தெரிவிக்கப்படும்/);
  });
});
