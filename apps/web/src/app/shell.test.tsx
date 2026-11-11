import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { renderRoute } from '../test/render.tsx';
import { UiLangContext } from '../components/ui/ui-strings.ts';
import { TRUST_FACTS } from '../config/trust-facts.ts';
import { LANG_STORAGE_KEY } from '../i18n/lang.ts';
import { useDonationDraft } from '../state/donation-draft.ts';
import { RootLayout } from './RootLayout.tsx';
import { SiteFooter } from './SiteFooter.tsx';

afterEach(() => {
  document.documentElement.lang = 'en';
  window.localStorage.clear();
});

const banner = () => screen.getByRole('banner');
const footer = () => screen.getByRole('contentinfo');

describe('landmarks and skip link', () => {
  it('has banner, main, contentinfo and a named section nav', () => {
    renderRoute('/');
    expect(banner()).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(footer()).toBeInTheDocument();
    expect(within(banner()).getByRole('navigation', { name: 'Sections' })).toBeInTheDocument();
  });

  it('skip link is first and targets main, in each language', () => {
    renderRoute('/ta/');
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAccessibleName('நேராக முக்கியப் பகுதிக்குச் செல்ல');
    expect(links[0]).toHaveAttribute('href', '#main');
  });

  it.each(['/', '/ta/', '/missing', '/ta/missing'])('%s has no axe violations', async (path) => {
    const { container } = renderRoute(path);
    await expectNoA11yViolations(container);
  });
});

describe('header', () => {
  it('home: floats see-through over the hero, turns solid once scrolled (client, Nov 2026)', () => {
    renderRoute('/');
    expect(banner()).toHaveClass('site-header--home', 'site-header--overlay');
    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 200, configurable: true });
      fireEvent.scroll(window);
    });
    expect(banner()).toHaveClass('site-header--home');
    expect(banner()).not.toHaveClass('site-header--overlay');
    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
      fireEvent.scroll(window);
    });
    expect(banner()).toHaveClass('site-header--overlay');
  });

  it('other pages keep the solid header', () => {
    renderRoute('/privacy');
    expect(banner()).not.toHaveClass('site-header--home');
    expect(banner()).not.toHaveClass('site-header--overlay');
  });

  it('links the five sections (in page order), Get Help and Donate to anchors on the single page', () => {
    renderRoute('/');
    const nav = within(banner()).getByRole('navigation', { name: 'Sections' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/#about', '/#ways-we-help', '/#services', '/#impact', '/#contact']);
    expect(within(banner()).getByRole('link', { name: 'Donate' })).toHaveAttribute(
      'href',
      '/#donate',
    );
    expect(within(banner()).getByRole('link', { name: 'Get Help' })).toHaveAttribute(
      'href',
      '/#get-help',
    );
    expect(within(banner()).getByRole('link', { name: 'Theonetrust.in — home' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('Tamil page uses Tamil labels and /ta/ anchors (same English IDs)', () => {
    renderRoute('/ta/');
    const nav = within(banner()).getByRole('navigation', { name: 'பிரிவுகள்' });
    expect(within(nav).getByRole('link', { name: 'சேவைகள்' })).toHaveAttribute(
      'href',
      '/ta/#services',
    );
    expect(within(banner()).getByRole('link', { name: 'நன்கொடை' })).toHaveAttribute(
      'href',
      '/ta/#donate',
    );
  });

  it('does not invent a trust name: shows only the site name', () => {
    renderRoute('/');
    expect(banner()).toHaveTextContent(TRUST_FACTS.siteName);
    // Visible text only (the JSON-LD script from #16 legitimately contains "[").
    for (const region of [banner(), screen.getByRole('main'), footer()]) {
      const visible = region.cloneNode(true) as HTMLElement;
      visible.querySelectorAll('script').forEach((s) => s.remove());
      expect(visible.textContent).not.toContain('[');
    }
  });
});

describe('mobile menu', () => {
  async function openMenu() {
    const user = userEvent.setup();
    renderRoute('/');
    const button = within(banner()).getByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    return { user, button };
  }

  it('opens a sheet with the sections, Get Help and the language switch; focus moves in', async () => {
    const { button } = await openMenu();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const sheet = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(sheet).toBeVisible();
    const menuNav = within(sheet).getByRole('navigation', { name: 'Menu' });
    expect(within(menuNav).getAllByRole('link')).toHaveLength(5);
    expect(within(sheet).getByRole('link', { name: 'Get Help' })).toBeInTheDocument();
    expect(within(sheet).getByRole('group', { name: 'Language' })).toBeInTheDocument();
    expect(within(menuNav).getByRole('link', { name: 'About' })).toHaveFocus();
  });

  it('Escape closes and returns focus to the menu button', async () => {
    const { user, button } = await openMenu();
    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('choosing a link closes the menu', async () => {
    const { user, button } = await openMenu();
    const sheet = document.getElementById(button.getAttribute('aria-controls')!)!;
    await user.click(within(sheet).getByRole('link', { name: 'Impact' }));
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('a click outside the header closes it; a click inside does not', async () => {
    const { button } = await openMenu();
    fireEvent.pointerDown(within(banner()).getByRole('link', { name: 'Donate' }));
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(screen.getByRole('main'));
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps Tab and Shift+Tab inside the button and the sheet', async () => {
    const { user, button } = await openMenu();
    const sheet = document.getElementById(button.getAttribute('aria-controls')!)!;
    const last = within(sheet).getByRole('button', { name: 'தமிழ்' });
    act(() => last.focus());
    await user.tab();
    expect(button).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it('pressing the menu button again closes it', async () => {
    const { user, button } = await openMenu();
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('switching language from the menu closes it and goes to Tamil', async () => {
    const { user, button } = await openMenu();
    const sheet = document.getElementById(button.getAttribute('aria-controls')!)!;
    await user.click(within(sheet).getByRole('button', { name: 'தமிழ்' }));
    expect(document.documentElement.lang).toBe('ta');
    expect(within(banner()).getByRole('button', { name: 'பட்டியல்' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

describe('language switching', () => {
  it('sets <html lang> from the URL', () => {
    renderRoute('/ta/');
    expect(document.documentElement.lang).toBe('ta');
  });

  it('switches to the same page in the other language, keeping query and hash, and saves the choice', async () => {
    const user = userEvent.setup();
    renderRoute('/?programme=education&amount=500#ways-we-help');
    const headerSwitch = within(banner()).getAllByRole('group', { name: 'Language' })[0]!;
    await user.click(within(headerSwitch).getByRole('button', { name: 'தமிழ்' }));
    expect(document.documentElement.lang).toBe('ta');
    expect(within(banner()).getByRole('link', { name: 'நன்கொடை' })).toBeInTheDocument();
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe('ta');
    // Back to English from the footer switch.
    await user.click(within(footer()).getByRole('button', { name: 'English' }));
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe('en');
  });

  it('keeps the chosen amount and programme when the language changes', async () => {
    const user = userEvent.setup();
    let latest: ReturnType<typeof useDonationDraft> | undefined;
    function Probe() {
      latest = useDonationDraft();
      return (
        <button type="button" onClick={() => latest!.updateDraft({ amountPaise: 123400 as never })}>
          set amount
        </button>
      );
    }
    const probeRoutes = [
      {
        path: '/',
        element: <RootLayout />,
        children: [
          { index: true, element: <Probe /> },
          { path: 'ta', children: [{ index: true, element: <Probe /> }] },
        ],
      },
    ];
    renderRoute('/?programme=health', probeRoutes);
    await user.click(screen.getByRole('button', { name: 'set amount' }));
    expect(latest!.draft).toMatchObject({ programme: 'health', amountPaise: 123400 });
    await user.click(
      within(within(banner()).getAllByRole('group', { name: 'Language' })[0]!).getByRole('button', {
        name: 'தமிழ்',
      }),
    );
    expect(document.documentElement.lang).toBe('ta');
    expect(latest!.draft).toEqual({ programme: 'health', amountPaise: 123400, frequency: 'once' });
  });

  it('works when browser storage is blocked', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    renderRoute('/');
    await user.click(within(footer()).getByRole('button', { name: 'தமிழ்' }));
    expect(document.documentElement.lang).toBe('ta');
    spy.mockRestore();
  });

  it('useDonationDraft outside the shell throws a clear error', () => {
    function Lonely() {
      useDonationDraft();
      return null;
    }
    expect(() => render(<Lonely />)).toThrow('useDonationDraft must be used inside the app shell');
  });
});

describe('footer', () => {
  it('shows only confirmed facts and the four groups', () => {
    renderRoute('/');
    const f = footer();
    for (const name of ['Explore', 'Help', 'Legal']) {
      expect(within(f).getByRole('navigation', { name })).toBeInTheDocument();
    }
    expect(within(f).getByRole('link', { name: '+91 96005 16999' })).toHaveAttribute(
      'href',
      'tel:+919600516999',
    );
    expect(within(f).getByRole('link', { name: 'info.theonetrust@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:info.theonetrust@gmail.com',
    );
    expect(f).toHaveTextContent('Kanchipuram, Tamil Nadu');
    expect(f).toHaveTextContent(`© ${new Date().getFullYear()} Theonetrust.in`);
  });

  it('policy links follow the language', () => {
    renderRoute('/ta/');
    const legal = within(footer()).getByRole('navigation', { name: 'விதிகள், கொள்கைகள்' });
    expect(within(legal).getByRole('link', { name: 'விதிமுறைகள்' })).toHaveAttribute(
      'href',
      '/ta/terms',
    );
    expect(within(legal).getByRole('link', { name: 'தனியுரிமை' })).toHaveAttribute(
      'href',
      '/ta/privacy',
    );
    expect(footer()).toHaveTextContent('காஞ்சிபுரம், தமிழ்நாடு');
  });

  it('hides every unconfirmed fact and shows verified ones when present', () => {
    const empty = {
      siteName: 'Theonetrust.in',
      legalName: null,
      registration: null,
      established: null,
      taxApproval: null,
      phone: null,
      whatsappUrl: null,
      email: null,
      area: null,
      address: null,
      callHours: null,
    };
    const { unmount } = render(
      <MemoryRouter>
        <SiteFooter onLanguageChange={vi.fn()} facts={empty} year={2027} />
      </MemoryRouter>,
    );
    expect(footer()).not.toHaveTextContent('Phone');
    expect(footer()).not.toHaveTextContent('Email');
    expect(footer()).not.toHaveTextContent('WhatsApp');
    expect(footer()).toHaveTextContent('© 2027 Theonetrust.in');
    unmount();

    render(
      <MemoryRouter>
        <UiLangContext.Provider value="en">
          <SiteFooter
            onLanguageChange={vi.fn()}
            facts={{
              ...empty,
              legalName: 'Example Charitable Trust',
              registration: 'Reg. No. TEST',
              phone: { display: '+91 00000 00000', tel: '+910000000000' },
            }}
          />
        </UiLangContext.Provider>
      </MemoryRouter>,
    );
    expect(
      within(footer()).getByRole('heading', { name: 'Example Charitable Trust' }),
    ).toBeVisible();
    expect(footer()).toHaveTextContent('Reg. No. TEST');
    expect(within(footer()).queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });
});

describe('not-found page', () => {
  it('is in Tamil under /ta/ and links to the Tamil home', () => {
    renderRoute('/ta/does-not-exist');
    expect(screen.getByRole('heading', { level: 1, name: 'பக்கம் கிடைக்கவில்லை' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'முகப்புப் பக்கத்துக்குச் செல்ல' })).toHaveAttribute(
      'href',
      '/ta/',
    );
  });

  it('is not indexed', () => {
    renderRoute('/missing');
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });
});
