import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ReceiptView } from '@theonetrust/contracts';
import { routes } from '../app/routes.tsx';
import {
  MOCK_RECEIPT_TOKEN,
  MOCK_REPLACED_TOKEN,
  ReceiptClientContext,
  createApiReceiptClient,
  createMockReceiptClient,
  selectReceiptClient,
  unavailableReceiptClient,
  type ReceiptClient,
} from './receipt-client.ts';
import { RECEIPT_MESSAGES } from './receipt-messages.ts';

const TOKEN = 'A'.repeat(43);
const VIEW: ReceiptView = {
  receiptNumber: 'TOT-R-2026-27-000042',
  donationReference: 'TOT-D-ABCDEFGHJKMN',
  issuedAt: '2026-11-04T10:00:00.000Z',
  amountPaise: 150_000,
  currency: 'INR',
  method: 'upi',
  purpose: null,
  donorName: 'Synthetic Donor',
  trust: { legalName: null, registration: null },
  approval: null,
  state: 'VALID',
  replacementToken: null,
  templateVersion: 'ack-v1',
};

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function renderAt(path: string, client: ReceiptClient) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ReceiptClientContext.Provider value={client}>
      <RouterProvider router={router} />
    </ReceiptClientContext.Provider>,
  );
  return router;
}

const found = (view: Partial<ReceiptView> = {}): ReceiptClient => ({
  get: vi.fn(async () => ({ kind: 'found' as const, view: { ...VIEW, ...view } })),
});

describe('acknowledgement page', () => {
  it('shows the minimal fields and a verified status, has no PDF download, and is never indexed', async () => {
    const t = RECEIPT_MESSAGES.en;
    renderAt(`/receipt/${TOKEN}`, found());
    expect(await screen.findByText(t.valid)).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: t.pageTitle })).toBeVisible();
    expect(screen.getByText(t.valid)).toBeVisible();
    for (const value of [
      'TOT-R-2026-27-000042',
      'TOT-D-ABCDEFGHJKMN',
      'Synthetic Donor',
      '4 November 2026',
      '₹1,500',
      'UPI',
      t.generalFund,
    ]) {
      expect(screen.getByText(value)).toBeVisible();
    }
    // Legal name not confirmed yet: the site name stands in, nothing is invented.
    expect(document.querySelector('.receipt__trust')).toHaveTextContent('Theonetrust.in');
    // Client, Nov 2026: the acknowledgement is a web page only — no PDF download.
    expect(screen.queryByRole('link', { name: /PDF/ })).toBeNull();
    await waitFor(() =>
      expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex, nofollow',
      ),
    );
    expect(document.querySelector('meta[name="referrer"]')).toHaveAttribute(
      'content',
      'no-referrer',
    );
  });

  it('Tamil page, programme purpose, trust particulars and approval line', async () => {
    const t = RECEIPT_MESSAGES.ta;
    renderAt(
      `/ta/receipt/${TOKEN}`,
      found({
        purpose: { en: 'Food support', ta: 'உணவு உதவி' },
        method: 'bank_transfer',
        trust: { legalName: 'Synthetic Trust', registration: 'Reg. [test]' },
        approval: { reference: 'APPROVAL-1', validUntil: '2029-03-31' },
      }),
    );
    expect(await screen.findByText('உணவு உதவி')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: t.pageTitle })).toBeVisible();
    expect(screen.getByText('வங்கிப் பரிமாற்றம்')).toBeVisible();
    expect(screen.getByText('Synthetic Trust')).toBeVisible();
    expect(screen.getByText('Reg. [test]')).toBeVisible();
    expect(screen.getByText(/APPROVAL-1/)).toHaveTextContent('2029');
    expect(screen.queryByRole('link', { name: /PDF/ })).toBeNull();
  });

  it('refunded and replaced acknowledgements say so in words, and link to the current one', async () => {
    renderAt(`/receipt/${TOKEN}`, found({ state: 'REFUNDED' }));
    expect(await screen.findByText(RECEIPT_MESSAGES.en.refunded)).toBeVisible();
    document.body.innerHTML = '';
    const next = 'B'.repeat(43);
    renderAt(`/receipt/${TOKEN}`, found({ state: 'REPLACED', replacementToken: next }));
    expect(await screen.findByText(RECEIPT_MESSAGES.en.replaced)).toBeVisible();
    expect(screen.getByRole('link', { name: RECEIPT_MESSAGES.en.openCurrent })).toHaveAttribute(
      'href',
      `/receipt/${next}`,
    );
  });

  it('not found offers the home page; unavailable offers try again', async () => {
    const user = userEvent.setup();
    renderAt(`/receipt/${TOKEN}`, { get: async () => ({ kind: 'not-found' }) });
    expect(await screen.findByText(RECEIPT_MESSAGES.en.notFoundTitle)).toBeVisible();
    expect(screen.getByRole('link', { name: RECEIPT_MESSAGES.en.home })).toHaveAttribute(
      'href',
      '/',
    );
    document.body.innerHTML = '';

    const get = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'unavailable' })
      .mockResolvedValueOnce({ kind: 'found', view: VIEW });
    renderAt(`/receipt/${TOKEN}`, { get });
    expect(await screen.findByText(RECEIPT_MESSAGES.en.unavailableTitle)).toBeVisible();
    await user.click(screen.getByRole('button', { name: RECEIPT_MESSAGES.en.tryAgain }));
    expect(await screen.findByText('TOT-R-2026-27-000042')).toBeVisible();
  });

  it('English and Tamil strings have the same keys', () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(RECEIPT_MESSAGES.ta)).toEqual(keys(RECEIPT_MESSAGES.en));
    expect(keys(RECEIPT_MESSAGES.ta.methods)).toEqual(keys(RECEIPT_MESSAGES.en.methods));
    expect(JSON.stringify(RECEIPT_MESSAGES)).not.toMatch(/form\s*1\d\d|80G|GST|deduct|exempt/i);
  });
});

describe('receipt clients', () => {
  it('api: fetches by token without credentials or referrer; maps 404 / errors', async () => {
    const fetchImpl = vi.fn(async () => ok(VIEW));
    const api = createApiReceiptClient('http://localhost:4000/api/v1', fetchImpl);
    expect(await api.get(TOKEN)).toEqual({ kind: 'found', view: VIEW });
    expect(fetchImpl).toHaveBeenCalledWith(`http://localhost:4000/api/v1/receipts/${TOKEN}`, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    expect(await api.get('not-a-token')).toEqual({ kind: 'not-found' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const reply = (res: () => Promise<Response>) => createApiReceiptClient('', res).get(TOKEN);
    expect(await reply(async () => ok({}, 404))).toEqual({ kind: 'not-found' });
    expect(await reply(async () => ok({}, 503))).toEqual({ kind: 'unavailable' });
    expect(await reply(async () => ok({ odd: true }))).toEqual({ kind: 'unavailable' });
    expect(await reply(async () => Promise.reject(new TypeError('x')))).toEqual({
      kind: 'unavailable',
    });
  });

  it('mock and unavailable clients; adapter selection', async () => {
    const mock = createMockReceiptClient();
    expect((await mock.get(MOCK_RECEIPT_TOKEN)).kind).toBe('found');
    const replaced = await mock.get(MOCK_REPLACED_TOKEN);
    expect(replaced.kind === 'found' && replaced.view.replacementToken).toBe(MOCK_RECEIPT_TOKEN);
    expect(await mock.get(TOKEN)).toEqual({ kind: 'not-found' });
    expect(await unavailableReceiptClient.get(TOKEN)).toEqual({ kind: 'unavailable' });
    expect(selectReceiptClient({ VITE_DONATE_ADAPTER: 'mock' }).get).toBeTypeOf('function');
    expect(await selectReceiptClient({ DEV: true }).get(MOCK_RECEIPT_TOKEN)).toMatchObject({
      kind: 'found',
    });
    expect(selectReceiptClient({ VITE_DONATE_ADAPTER: 'unavailable' })).toBe(
      unavailableReceiptClient,
    );
  });
});
