import type { RouteObject } from 'react-router';
import { AdminHomePage } from '../admin/AdminHomePage.tsx';
import { AdminLayout } from '../admin/AdminLayout.tsx';
import { AdminLoginPage } from '../admin/AdminLoginPage.tsx';
import { AdminNav } from '../admin/AdminNav.tsx';
import { AuditLogPage } from '../admin/AuditLogPage.tsx';
import { HelpInboxPage } from '../admin/HelpInboxPage.tsx';
import { HelpRequestPage } from '../admin/HelpRequestPage.tsx';
import { RequireAdmin } from '../admin/RequireAdmin.tsx';
import { RootLayout } from './RootLayout.tsx';
import { RouteErrorPage } from '../routes/error/RouteErrorPage.tsx';
import { HomePage } from '../routes/home/HomePage.tsx';
import { NotFoundPage } from '../routes/not-found/NotFoundPage.tsx';
import { PolicyPage } from '../routes/policy/PolicyPage.tsx';

/** Razorpay-required policy pages (ADR 0005), mirrored under /ta/. */
const policyRoutes: RouteObject[] = [
  { path: 'terms', element: <PolicyPage id="terms" /> },
  { path: 'privacy', element: <PolicyPage id="privacy" /> },
  { path: 'refund-policy', element: <PolicyPage id="refund" /> },
];

/**
 * Route table shared by the browser router and tests.
 * Planned routes and their Tamil /ta/ mirrors are listed in docs/design/sitemap.md;
 * sitemap.test.ts fails if a route here is missing from that table.
 */
export const routes: RouteObject[] = [
  // Owner dashboard (#19): own shell, never indexed, same URL in both languages.
  {
    path: '/admin',
    element: <AdminLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: 'login', element: <AdminLoginPage /> },
      {
        element: <RequireAdmin />,
        children: [
          {
            element: <AdminNav />,
            children: [
              { index: true, element: <AdminHomePage /> },
              { path: 'help-requests', element: <HelpInboxPage /> },
              { path: 'help-requests/:id', element: <HelpRequestPage /> },
              { path: 'audit-log', element: <AuditLogPage /> },
            ],
          },
        ],
      },
    ],
  },
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
          ...policyRoutes,
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      ...policyRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
