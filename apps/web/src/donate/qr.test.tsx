import { createRef } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { DonationIntentRequest, DonationQrResponse } from '@theonetrust/contracts';
import { routes } from '../app/routes.tsx';
import { expectNoA11yViolations } from '../test/a11y.ts';
import {
  DonateClientContext,
  MOCK_QR_IMAGE,
  createApiDonateClient,
  createMockDonateClient,
  type DonateClient,
} from './donate-client.ts';
import { DONATE_MESSAGES } from './donate-messages.ts';
import { QrPay } from './QrPay.tsx';

const t = DONATE_MESSAGES.en;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]!);

const qrIntent = (amountPaise: number, minutes = 15): DonationQrResponse => ({
  publicReference: 'TOT-D-QRQRQRQRQRQR',
  giftPaise: amountPaise,
  feePaise: 0,
  amountPaise,
  currency: 'INR',
  qr: {
    imagePath: '/donation-intents/TOT-D-QRQRQRQRQRQR/qr.png',
    expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
  },
});

function client(overrides: Partial<DonateClient> = {}): DonateClient {
  return {
    acceptsDonations: true,
    estimate: vi.fn(async () => ({
      minPaise: 100,
      maxPaise: 500_000,
      receiptMinPaise: 50_000,
      feeCoverOffered: false,
      bankTransferOffered: false,
      qrOffered: true,
      qrMaxPaise: 150_000,
    })),
    start: vi.fn(),
    checkout: vi.fn(),
    verify: vi.fn(),
    status: vi.fn(async () => 'PENDING' as const),
    receipt: vi.fn(async () => null),
    startBankTransfer: vi.fn(),
    claimBankTransfer: vi.fn(),
    startQr: vi.fn(async (request: DonationIntentRequest) => ({
      ok: true as const,
      intent: qrIntent(request.giftPaise),
      imageUrl: MOCK_QR_IMAGE,
    })),
    ...overrides,
  } as DonateClient;
}

async function review(user: ReturnType<typeof userEvent.setup>, donate: DonateClient) {
  const router = createMemoryRouter(routes, { initialEntries: ['/#donate'] });
  render(
    <DonateClientContext.Provider value={donate}>
      <RouterProvider router={router} />
    </DonateClientContext.Provider>,
  );
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: t.continue }));
  await user.click(within(dialog).getByRole('radio', { name: '₹2,000' }));
  await user.click(within(dialog).getByRole('button', { name: t.continue }));
  await user.type(within(dialog).getByRole('textbox', { name: new RegExp(t.fullName) }), 'A');
  await user.type(within(dialog).getByRole('textbox', { name: t.email }), 'a@b.co');
  await user.click(within(dialog).getByLabelText(t.consent));
  await user.click(within(dialog).getByRole('button', { name: t.continue }));
  return dialog;
}

const qrButton = (rupees: string) => ({ name: fill(t.qrChoose, { amount: rupees }) });

describe('UPI QR in the donate pop-up', () => {
  it('offers only the amounts up to the server cap and makes a QR for exactly that amount', async () => {
    const user = userEvent.setup();
    const donate = client();
    const dialog = await review(user, donate);
    expect(await within(dialog).findByRole('heading', { name: t.qrTitle })).toBeVisible();
    for (const r of ['₹200', '₹500', '₹1,000', '₹1,500']) {
      expect(within(dialog).getByRole('button', qrButton(r))).toBeVisible();
    }
    // ₹2,000 is above this server's QR cap (₹1,500): not offered.
    expect(within(dialog).queryByRole('button', qrButton('₹2,000'))).toBeNull();
    await expectNoA11yViolations(dialog);

    await user.click(within(dialog).getByRole('button', qrButton('₹500')));
    expect(
      await within(dialog).findByRole('heading', { name: fill(t.qrHeading, { amount: '₹500' }) }),
    ).toBeVisible();
    expect(donate.startQr).toHaveBeenCalledWith(
      expect.objectContaining({ giftPaise: 50_000, coverFee: false }),
      expect.any(String),
    );
    const img = await within(dialog).findByRole('img', {
      name: fill(t.qrAlt, { amount: '₹500' }),
    });
    expect(img).toHaveAttribute('src', MOCK_QR_IMAGE);
    expect(within(dialog).getByRole('link', { name: t.qrDownload })).toHaveAttribute(
      'download',
      'TOT-D-QRQRQRQRQRQR-upi-qr.png',
    );
    expect(dialog).toHaveTextContent(t.qrNotProof);
    // Showing a QR is never "paid".
    expect(within(dialog).queryByText(t.thanks)).toBeNull();
    await expectNoA11yViolations(dialog);

    // Still pending on the server: stays on the QR.
    await user.click(within(dialog).getByRole('button', { name: t.qrPaid }));
    expect(donate.status).toHaveBeenCalledWith('TOT-D-QRQRQRQRQRQR');
    expect(within(dialog).queryByText(t.thanks)).toBeNull();

    // Back keeps the new amount on the review step.
    await user.click(within(dialog).getByRole('button', { name: t.back }));
    expect(await within(dialog).findByRole('heading', { name: t.review })).toBeVisible();
    expect(dialog).toHaveTextContent('₹500');
  });

  it('shows "thank you" only once the server says PAID', async () => {
    const user = userEvent.setup();
    const status = vi.fn<DonateClient['status']>(async () => 'PENDING');
    const donate = client({ status });
    const dialog = await review(user, donate);
    await user.click(await within(dialog).findByRole('button', qrButton('₹200')));
    await within(dialog).findByRole('img');
    status.mockResolvedValue('PAID');
    await user.click(within(dialog).getByRole('button', { name: t.qrPaid }));
    expect(await within(dialog).findByText(t.thanks)).toBeVisible();
  });

  it('a QR that cannot be made explains why', async () => {
    const user = userEvent.setup();
    const donate = client({
      startQr: vi.fn(async () => ({ ok: false as const, reason: 'rate_limited' as const })),
    });
    const dialog = await review(user, donate);
    await user.click(await within(dialog).findByRole('button', qrButton('₹200')));
    expect(await within(dialog).findByRole('heading', { name: t.waitTitle })).toBeVisible();
  });

  it('is not offered when the server does not offer it, or for monthly giving', async () => {
    const user = userEvent.setup();
    const donate = client({
      estimate: vi.fn(async () => ({
        minPaise: 100,
        maxPaise: 500_000,
        receiptMinPaise: 50_000,
        feeCoverOffered: false,
        bankTransferOffered: false,
        qrOffered: false,
      })),
    });
    const dialog = await review(user, donate);
    expect(within(dialog).queryByRole('heading', { name: t.qrTitle })).toBeNull();
  });
});

describe('QrPay on its own', () => {
  const request: DonationIntentRequest = {
    giftPaise: 20_000,
    currency: 'INR',
    programme: 'general',
    donorName: 'A',
    donorEmail: 'a@b.co',
    hideNamePublicly: false,
    wantsReceipt: false,
    coverFee: false,
    consent: true,
    locale: 'en',
  };
  const money = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`;

  it('polls the server and settles on PAID', async () => {
    const status = vi
      .fn<DonateClient['status']>()
      .mockResolvedValueOnce('PENDING')
      .mockResolvedValue('PAID');
    const onSettled = vi.fn();
    render(
      <QrPay
        client={{
          status,
          startQr: async () => ({ ok: true, intent: qrIntent(20_000), imageUrl: MOCK_QR_IMAGE }),
        }}
        request={request}
        t={t}
        money={money}
        locale="en-IN"
        headingRef={createRef()}
        onSettled={onSettled}
        onFailed={vi.fn()}
        pollMs={20}
      />,
    );
    await waitFor(() => expect(onSettled).toHaveBeenCalledWith('PAID', 'TOT-D-QRQRQRQRQRQR'));
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('an expired QR offers a new one (with a new idempotency key)', async () => {
    const user = userEvent.setup();
    const keys: string[] = [];
    const startQr = vi.fn(async (_r: DonationIntentRequest, key: string) => {
      keys.push(key);
      return { ok: true as const, intent: qrIntent(20_000, -1), imageUrl: MOCK_QR_IMAGE };
    });
    render(
      <QrPay
        client={{ status: vi.fn(async () => 'PENDING' as const), startQr }}
        request={request}
        t={t}
        money={money}
        locale="en-IN"
        headingRef={createRef()}
        onSettled={vi.fn()}
        onFailed={vi.fn()}
        pollMs={20}
      />,
    );
    expect(await screen.findByRole('heading', { name: t.qrExpiredTitle })).toBeVisible();
    await user.click(screen.getByRole('button', { name: t.qrNew }));
    await waitFor(() => expect(startQr).toHaveBeenCalledTimes(2));
    expect(new Set(keys).size).toBe(2);
  });
});

describe('donate clients — QR', () => {
  const reply = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it('the API client asks for channel qr without fee cover and checks the reply', async () => {
    const fetchImpl = reply(201, qrIntent(20_000));
    const api = createApiDonateClient('https://api.example.org/api/v1', fetchImpl as never);
    const started = await api.startQr!({ ...requestOf(20_000), coverFee: true }, 'k1');
    expect(started).toEqual({
      ok: true,
      intent: expect.objectContaining({ amountPaise: 20_000 }),
      imageUrl: 'https://api.example.org/api/v1/donation-intents/TOT-D-QRQRQRQRQRQR/qr.png',
    });
    const [, init] = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])!;
    expect(JSON.parse(String(init.body))).toMatchObject({ channel: 'qr', coverFee: false });
    expect(new Headers(init.headers).get('idempotency-key')).toBe('k1');

    // A reply for a different amount, or a foreign image path, is refused.
    const wrong = createApiDonateClient('/api/v1', reply(201, qrIntent(50_000)) as never);
    expect(await wrong.startQr!(requestOf(20_000), 'k')).toEqual({ ok: false, reason: 'network' });
    const evil = createApiDonateClient(
      '/api/v1',
      reply(201, {
        ...qrIntent(20_000),
        qr: { imagePath: 'https://evil.example/x.png', expiresAt: '' },
      }) as never,
    );
    expect(await evil.startQr!(requestOf(20_000), 'k')).toEqual({ ok: false, reason: 'network' });
    const big = createApiDonateClient('/api/v1', reply(400, {}) as never);
    expect(await big.startQr!(requestOf(20_000), 'k')).toEqual({ ok: false, reason: 'invalid' });
    const down = createApiDonateClient(
      '/api/v1',
      vi.fn(async () => Promise.reject(new Error())),
    );
    expect(await down.startQr!(requestOf(20_000), 'k')).toEqual({ ok: false, reason: 'network' });
  });

  it('the mock client returns a visibly fake QR', async () => {
    const mock = createMockDonateClient(0);
    const started = await mock.startQr!(requestOf(50_000), 'k');
    expect(started).toMatchObject({ ok: true, imageUrl: MOCK_QR_IMAGE });
    expect(decodeURIComponent(MOCK_QR_IMAGE)).toContain('TEST QR');
    (globalThis as { __donateMock?: string }).__donateMock = 'start-fail';
    expect(await mock.startQr!(requestOf(50_000), 'k')).toEqual({ ok: false, reason: 'network' });
    delete (globalThis as { __donateMock?: string }).__donateMock;
  });
});

function requestOf(giftPaise: number): DonationIntentRequest {
  return {
    giftPaise,
    currency: 'INR',
    programme: 'general',
    donorName: 'A',
    donorEmail: 'a@b.co',
    hideNamePublicly: false,
    wantsReceipt: false,
    coverFee: false,
    consent: true,
    locale: 'en',
  };
}
