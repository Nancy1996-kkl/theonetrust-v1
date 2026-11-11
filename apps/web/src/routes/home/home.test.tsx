import { LANDING_CONTENT } from '../../content/landing.ts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from '../../app/routes.tsx';
import { expectNoA11yViolations } from '../../test/a11y.ts';
import { EXPLORE_TABS, HOME_TEXT, SERVICES } from './home-content.ts';

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
    expect(headings.slice(0, 9)).toEqual([
      'Our mission & vision',
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
    expect(screen.getByRole('link', { name: '₹500' })).toHaveAttribute(
      'href',
      '/?amount=500#donate',
    );
    await expectNoA11yViolations(container);
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
