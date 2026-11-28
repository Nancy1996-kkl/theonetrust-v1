import { LANDING_CONTENT } from '../../content/landing.ts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from '../../app/routes.tsx';
import { expectNoA11yViolations } from '../../test/a11y.ts';
import { BANNER_CAUSES, EXPLORE_TABS, HOME_TEXT, SERVICES } from './home-content.ts';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

describe('home page design (client, Nov 2026)', () => {
  it('every home string has English and Tamil', () => {
    for (const [key, value] of Object.entries(HOME_TEXT)) {
      expect(value.en, key).toBeTruthy();
      expect(value.ta, key).toBeTruthy();
    }
    for (const t of EXPLORE_TABS) {
      for (const v of [t.label, t.title, t.body, ...t.points]) expect(v.ta).toBeTruthy();
    }
    for (const s of SERVICES) expect(s.title.ta && s.body.ta).toBeTruthy();
    expect(EXPLORE_TABS.map((t) => t.label.en)).toEqual([
      'Education',
      'Children',
      'Healthcare',
      'Elderly',
    ]);
  });

  it('shows all sections in order, is indexable, and has the site footer', async () => {
    const { container } = renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Together, we can make a difference.' }),
    ).toBeVisible();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(0, 10)).toEqual([
      'Our mission & vision',
      'Donate Today !',
      'Where help is needed',
      'Four ways we stand with families',
      'Explore what your gift does',
      'Our impact',
      'How your gift reaches people',
      'Be a part of our mission',
      'Talk to us',
      'Questions people ask',
    ]);
    // The live home page is indexed (no preview noindex) and keeps the one site footer.
    expect(document.querySelector('meta[name="robots"][content*="noindex"]')).toBeNull();
    expect(container.querySelectorAll('footer')).toHaveLength(1);
    expect(container.querySelector('footer.site-footer')).not.toBeNull();
    expect(screen.queryByText(/Preview of the new home page/)).toBeNull();
    // No draft badges on the page; no invented figures — impact waits for confirmed numbers.
    expect(screen.queryByText(/Draft/)).toBeNull();
    // No credits list in the footer; Creative Commons photos carry their credit on hover.
    expect(screen.queryByText(/photo credits/i)).toBeNull();
    for (const img of screen.getAllByRole('img').filter((el) => el.tagName === 'IMG')) {
      const title = img.getAttribute('title');
      if (title) expect(title).toMatch(/^Photo: .+ · CC BY/);
    }
    expect(screen.getByText(HOME_TEXT.impactEmpty.en)).toBeVisible();
    // Donate links stay on the page and open the pop-up pre-filled.
    expect(screen.getByRole('link', { name: '₹100' })).toHaveAttribute(
      'href',
      '/?amount=100#donate',
    );
    await expectNoA11yViolations(container);
  });

  it('Donate Today banner: four causes, Donate and Request Help links, both languages', async () => {
    renderAt('/');
    const heading = await screen.findByRole('heading', { level: 2, name: /^Donate Today/ });
    const banner = heading.closest('section')!;
    const causes = within(banner).getByRole('list', { name: 'Where your gift goes' });
    expect(
      within(causes)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Education', 'Health', 'Food', 'Elders']);
    expect(within(banner).getByRole('link', { name: 'Donate now' })).toHaveAttribute(
      'href',
      '/#donate',
    );
    expect(within(banner).getByRole('link', { name: 'Request Help' })).toHaveAttribute(
      'href',
      '/#get-help',
    );
    // The background photo is decoration; the side photo keeps its description.
    expect(banner.querySelector('.hp-banner__bg')).toHaveAttribute('alt', '');
    for (const c of BANNER_CAUSES) expect(c.ta).toBeTruthy();
  });

  it('Donate Today banner in Tamil', async () => {
    renderAt('/ta/');
    const heading = await screen.findByRole('heading', { level: 2, name: /^இன்றே உதவலாம்/ });
    const banner = heading.closest('section')!;
    expect(within(banner).getByRole('link', { name: 'உதவி கேட்க' })).toHaveAttribute(
      'href',
      '/ta/#get-help',
    );
    expect(banner).toHaveTextContent('மருத்துவம்');
  });

  it('only the Education card carries the gold tracing border, hidden from screen readers', async () => {
    renderAt('/');
    const services = await screen.findByRole('heading', {
      level: 2,
      name: HOME_TEXT.servicesTitle.en,
    });
    const cards = [...services.closest('section')!.querySelectorAll('.hp-service')];
    const traced = cards.filter((c) => c.querySelector('.hp-service__trace'));
    expect(traced).toHaveLength(1);
    expect(traced[0]).toHaveTextContent(SERVICES[1]!.title.en);
    expect(traced[0]!.querySelector('.hp-service__trace')).toHaveAttribute('aria-hidden', 'true');
  });

  it('amount cards keep the rupee amounts as their link text', async () => {
    renderAt('/');
    const give = (
      await screen.findByRole('heading', { level: 2, name: HOME_TEXT.donateTitle.en })
    ).closest('section')!;
    for (const amount of ['₹1', '₹10', '₹100', '₹1,000']) {
      expect(within(give).getByRole('link', { name: amount })).toHaveClass('hp-chip');
    }
  });

  it('explore tabs switch with a click and with the arrow keys', async () => {
    const user = userEvent.setup();
    renderAt('/');
    const list = await screen.findByRole('tablist', { name: 'Areas of work' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Education assistance');
    await user.click(tabs[2]!);
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Treatment on time');
    await user.keyboard('{ArrowRight}');
    expect(tabs[3]).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Care for our elders');
    await user.keyboard('{ArrowRight}');
    expect(tabs[0]).toHaveFocus();
    await user.keyboard('{End}');
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Home}{ArrowLeft}');
    expect(tabs[3]).toHaveFocus();
  });

  it('explore photos (client, 28 Nov 2026): one tidy layout, new Education and Children photos', async () => {
    const user = userEvent.setup();
    renderAt('/');
    const list = await screen.findByRole('tablist', { name: 'Areas of work' });
    const tabs = within(list).getAllByRole('tab');
    const photoIn = (name: RegExp) =>
      within(screen.getByRole('tabpanel')).getByRole('img', { name });
    expect(photoIn(/slate that says "Education"/)).toBeInTheDocument();
    await user.click(tabs[1]!);
    expect(photoIn(/handing folded clothes to smiling schoolchildren/)).toBeInTheDocument();
    await user.click(tabs[3]!);
    expect(photoIn(/Elderly women in saris/)).toBeInTheDocument();
    // The photo no longer jumps from side to side tab by tab.
    expect(screen.getByRole('tabpanel')).not.toHaveClass('hp-explore--photo-right');
  });

  it('Donate Today keeps its food-kits background and zooms in on entry', async () => {
    const { container } = renderAt('/');
    await screen.findByRole('heading', { name: /Donate Today/ });
    const bg = container.querySelector('.hp-banner__bg');
    expect(bg?.getAttribute('src')).toContain('children-food-kits');
    expect(bg).toHaveAttribute('alt', '');
    expect(container.querySelector('.hp-banner .reveal .hp-banner__copy')).not.toBeNull();
  });

  it('Talk to us (client, 28 Nov 2026): helping-hand photo background behind the contact details', async () => {
    const { container } = renderAt('/');
    const section = await screen.findByRole('region', { name: 'Talk to us' });
    expect(section).toHaveClass('hp-talk', 'surface-inverse');
    // Same layout as before: the volunteers photo stays next to the details.
    expect(within(section).getByRole('img', { name: /volunteers in yellow/ })).toBeInTheDocument();
    const bg = container.querySelector('#contact .hp-talk__bg');
    expect(bg?.getAttribute('src')).toContain('talk-helping-hand');
    expect(bg).toHaveAttribute('alt', '');
    expect(within(section).getByRole('link', { name: '+91 96005 16999' })).toBeInTheDocument();
  });

  it('FAQ: opening one question closes the one that was open', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/');
    await screen.findByRole('heading', { name: HOME_TEXT.faqTitle.en });
    const items = [...container.querySelectorAll<HTMLDetailsElement>('.hp-faq__item')];
    expect(items.length).toBeGreaterThan(1);
    await user.click(items[0]!.querySelector('summary')!);
    expect(items[0]!.open).toBe(true);
    await user.click(items[1]!.querySelector('summary')!);
    expect(items[1]!.open).toBe(true);
    expect(items[0]!.open).toBe(false);
    expect(container.querySelectorAll('.hp-faq__item[open]')).toHaveLength(1);
  });

  it('works in Tamil', async () => {
    renderAt('/ta/');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: LANDING_CONTENT.hero.headline.value.ta,
      }),
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: 'கல்வி' })).toBeVisible();
  });
});
