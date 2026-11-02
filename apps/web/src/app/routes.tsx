import type { RouteObject } from 'react-router';
import { RootLayout } from './RootLayout.tsx';
import { RouteErrorPage } from '../routes/error/RouteErrorPage.tsx';
import { HomePage } from '../routes/home/HomePage.tsx';
import { NotFoundPage } from '../routes/not-found/NotFoundPage.tsx';

/**
 * Route table shared by the browser router and tests.
 * Planned routes and their Tamil /ta/ mirrors are listed in docs/design/sitemap.md;
 * sitemap.test.ts fails if a route here is missing from that table.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      // Tamil mirror (ADR 0004). Same layout above it, so switching language keeps state.
      {
        path: 'ta',
        children: [
          { index: true, element: <HomePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
