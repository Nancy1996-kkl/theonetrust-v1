import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { RouteObject } from 'react-router';
import { RootLayout } from './RootLayout.tsx';
import { RouteErrorPage } from '../routes/error/RouteErrorPage.tsx';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { consoleGuard } from '../test/console-guard.ts';
import { renderRoute } from '../test/render.tsx';

describe('home route', () => {
  it('renders one top-level heading in each language (the placeholder text was replaced in #12)', () => {
    renderRoute('/');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Where help is needed' })).toBeVisible();
  });

  it('renders the Tamil page under /ta/', () => {
    renderRoute('/ta/');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'எங்கே உதவி தேவை' })).toBeVisible();
    expect(document.documentElement.lang).toBe('ta');
  });

  it('exposes a skip link that targets the main landmark', () => {
    renderRoute('/');
    const skip = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skip).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderRoute('/');
    await expectNoA11yViolations(container);
  });
});

describe('unknown routes', () => {
  it.each(['/does-not-exist', '/donate/extra/segments', '/%E0%AE%A4%E0%AE%AE'])(
    'shows the not-found page for %s',
    (path) => {
      renderRoute(path);
      expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    },
  );

  it('lets the visitor return home from the not-found page', async () => {
    renderRoute('/missing');
    await userEvent.click(screen.getByRole('link', { name: 'Go to the home page' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Together, we can make a difference.' }),
    ).toBeVisible();
  });

  it('has no WCAG 2.2 AA violations on the not-found page', async () => {
    const { container } = renderRoute('/missing');
    await expectNoA11yViolations(container);
  });
});

describe('route errors', () => {
  function Crash(): never {
    throw new Error('secret internal detail');
  }
  const crashingRoutes: RouteObject[] = [
    {
      path: '/',
      element: <RootLayout />,
      errorElement: <RouteErrorPage />,
      children: [{ index: true, element: <Crash /> }],
    },
  ];

  it('shows a friendly recovery page without leaking error details', async () => {
    // React and the router log the thrown error; that output is expected here.
    consoleGuard.allow(/secret internal detail|error occurred in the <Crash>|React Router caught/i);
    renderRoute('/', crashingRoutes);
    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeVisible();
    expect(document.body).not.toHaveTextContent('secret internal detail');
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
  });
});
