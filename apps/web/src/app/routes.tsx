import type { RouteObject } from 'react-router';
import { AdminHomePage } from '../admin/AdminHomePage.tsx';
import { AdminLayout } from '../admin/AdminLayout.tsx';
import { AdminLoginPage } from '../admin/AdminLoginPage.tsx';
import { AdminNav } from '../admin/AdminNav.tsx';
import { AuditLogPage } from '../admin/AuditLogPage.tsx';
import { BankTransfersPage } from '../admin/BankTransfersPage.tsx';
import { HelpInboxPage } from '../admin/HelpInboxPage.tsx';
import { HelpRequestPage } from '../admin/HelpRequestPage.tsx';
import { NotificationsPage } from '../admin/NotificationsPage.tsx';
import { DonationDetailPage } from '../admin/DonationDetailPage.tsx';
import { DonationsPage } from '../admin/DonationsPage.tsx';
import { ExceptionsPage } from '../admin/ExceptionsPage.tsx';
import { ReceiptsPage } from '../admin/ReceiptsPage.tsx';
import { MonthlyGivingPage } from '../admin/MonthlyGivingPage.tsx';
import { RequireAdmin } from '../admin/RequireAdmin.tsx';
import { RootLayout } from './RootLayout.tsx';
import { RouteErrorPage } from '../routes/error/RouteErrorPage.tsx';
import { HomePage } from '../routes/home/HomePage.tsx';
import { NotFoundPage } from '../routes/not-found/NotFoundPage.tsx';
import { PolicyPage } from '../routes/policy/PolicyPage.tsx';
import { ReceiptPage } from '../receipt/ReceiptPage.tsx';
import { ManagePage } from '../manage/ManagePage.tsx';

/** Razorpay-required policy pages (ADR 0005), mirrored under /ta/. */
const policyRoutes: RouteObject[] = [
  { path: 'terms', element: <PolicyPage id="terms" /> },
  { path: 'privacy', element: <PolicyPage id="privacy" /> },
  { path: 'refund-policy', element: <PolicyPage id="refund" /> },
];

/** Private acknowledgement link (#29): random token, never indexed. */
const receiptRoute: RouteObject = { path: 'receipt/:token', element: <ReceiptPage /> };

/** Private manage link for monthly giving (#32): random token, never indexed. */
const manageRoute: RouteObject = { path: 'manage/:token', element: <ManagePage /> };

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
              { path: 'bank-transfers', element: <BankTransfersPage /> },
              { path: 'notifications', element: <NotificationsPage /> },
              { path: 'donations', element: <DonationsPage /> },
              { path: 'donations/:id', element: <DonationDetailPage /> },
              { path: 'exceptions', element: <ExceptionsPage /> },
              { path: 'receipts', element: <ReceiptsPage /> },
              { path: 'monthly-giving', element: <MonthlyGivingPage /> },
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
          receiptRoute,
          manageRoute,
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      ...policyRoutes,
      receiptRoute,
      manageRoute,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
