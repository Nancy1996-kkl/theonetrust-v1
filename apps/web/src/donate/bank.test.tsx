import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { routes } from '../app/routes.tsx';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { DonateClientContext, createApiDonateClient, type DonateClient } from './donate-client.ts';
import { DONATE_MESSAGES } from './donate-messages.ts';

const t = DONATE_MESSAGES.en;
const BANK = {
  publicReference: 'TOT-D-BANKBANKBANK',
  giftPaise: 100_000,
  feePaise: 0 as const,
  amountPaise: 100_000,
  currency: 'INR' as const,
  bankTransfer: {
    accountName: 'Synthetic Trust',
    accountNumber: '000011112222',
    ifsc: 'SBIN0000000',
    bankName: 'Synthetic Bank',
  },
};

function client(overrides: Partial<DonateClient> = {}): DonateClient {
  return {
    acceptsDonations: true,
    estimate: vi.fn(async () => ({
      minPaise: 100,
      maxPaise: 500_000,
      receiptMinPaise: 50_000,
      feeCoverOffered: false,
      bankTransferOffered: true,
    })),
    start: vi.fn(async () => ({
      ok: true as const,
      intent: {
        publicReference: 'TOT-D-ABCDEFGHJKMN',
        giftPaise: 100_000,
        feePaise: 0,
        amountPaise: 100_000,
        currency: 'INR' as const,
        checkout: { provider: 'RAZORPAY' as const, keyId: 'rzp_test_k', orderId: 'order_X1' },
      },
    })),
    checkout: vi.fn(async () => ({ kind: 'failed' as const, reason: 'upi_limit' as const })),
    verify: vi.fn(),
    status: vi.fn(),
    receipt: vi.fn(async () => null),
    startBankTransfer: vi.fn(async () => ({ ok: true as const, intent: BANK })),
    claimBankTransfer: vi.fn(async () => true),
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
  await user.click(within(dialog).getByRole('radio', { name: '₹1,000' }));
  await user.click(within(dialog).getByRole('button', { name: t.continue }));
  await user.type(within(dialog).getByRole('textbox', { name: new RegExp(t.fullName) }), 'A');
  await user.type(within(dialog).getByRole('textbox', { name: t.email }), 'a@b.co');
  await user.click(within(dialog).getByLabelText(t.consent));
  await user.click(within(dialog).getByRole('button', { name: t.continue }));
  return dialog;
}

describe('bank transfer in the donate panel', () => {
  it('shows the trust account and reference; the UTR is optional and never confirms', async () => {
    const user = userEvent.setup();
    const donate = client();
    const dialog = await review(user, donate);
    await user.click(within(dialog).getByRole('button', { name: t.bankTransferLink }));
    expect(await within(dialog).findByRole('heading', { name: t.bankTitle })).toBeVisible();
    for (const text of ['000011112222', 'SBIN0000000', 'Synthetic Bank', 'TOT-D-BANKBANKBANK']) {
      expect(dialog).toHaveTextContent(text);
    }
    expect(donate.startBankTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ coverFee: false, giftPaise: 100_000 }),
      expect.any(String),
    );
    await expectNoA11yViolations(dialog);
    await user.type(within(dialog).getByRole('textbox', { name: /UTR/ }), '12');
    await user.click(within(dialog).getByRole('button', { name: t.doneTransfer }));
    expect(within(dialog).getByText(t.utrError)).toBeVisible();
    await user.clear(within(dialog).getByRole('textbox', { name: /UTR/ }));
    await user.type(within(dialog).getByRole('textbox', { name: /UTR/ }), ' sbin 1234 5678 ');
    await user.click(within(dialog).getByRole('button', { name: t.doneTransfer }));
    expect(donate.claimBankTransfer).toHaveBeenCalledWith('TOT-D-BANKBANKBANK', 'SBIN12345678');
    expect(await within(dialog).findByRole('heading', { name: t.notYet })).toBeVisible();
    expect(within(dialog).queryByText(t.thanks)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: t.backToPage }));
  });

  it('is offered from the UPI-limit screen; failures explained; back returns to review', async () => {
    const user = userEvent.setup();
    const startBankTransfer = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'network' })
      .mockResolvedValue({ ok: true, intent: BANK });
    const donate = client({ startBankTransfer, claimBankTransfer: vi.fn(async () => false) });
    const dialog = await review(user, donate);
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    await user.click(await within(dialog).findByRole('button', { name: t.payBank }));
    expect(await within(dialog).findByRole('heading', { name: t.netTitle })).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: t.tryAgain }));
    await user.click(within(dialog).getByRole('button', { name: t.bankTransferLink }));
    await user.click(await within(dialog).findByRole('button', { name: t.back }));
    expect(within(dialog).getByRole('heading', { name: t.review })).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: t.bankTransferLink }));
    await user.click(await within(dialog).findByRole('button', { name: t.doneTransfer }));
    expect(await within(dialog).findByRole('heading', { name: t.netTitle })).toBeVisible();
  });

  it('is hidden when the trust has not confirmed bank details', async () => {
    const user = userEvent.setup();
    const dialog = await review(
      user,
      client({
        estimate: vi.fn(async () => ({
          minPaise: 100,
          maxPaise: 500_000,
          receiptMinPaise: 50_000,
          feeCoverOffered: false,
          bankTransferOffered: false,
        })),
      }),
    );
    expect(within(dialog).queryByRole('button', { name: t.bankTransferLink })).toBeNull();
  });
});

describe('api client: bank transfer', () => {
  const ok = (body: unknown, status = 201) => new Response(JSON.stringify(body), { status });
  const REQ = {
    giftPaise: 100_000,
    currency: 'INR' as const,
    programme: null,
    donorName: 'A',
    hideNamePublicly: true,
    wantsReceipt: false,
    coverFee: true,
    consent: true as const,
    locale: 'en' as const,
  };

  it('starts a bank-transfer intent (no fee cover) and posts the claim', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      String(url).includes('claim') ? new Response(null, { status: 202 }) : ok(BANK),
    );
    const api = createApiDonateClient('', fetchImpl);
    expect(await api.startBankTransfer(REQ, 'k')).toEqual({ ok: true, intent: BANK });
    expect(JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body))).toMatchObject({
      channel: 'bank_transfer',
      coverFee: false,
    });
    expect(await api.claimBankTransfer('TOT-D-BANKBANKBANK', 'UTR123456')).toBe(true);
    expect(String(fetchImpl.mock.calls[1]![0])).toBe(
      '/api/v1/donation-intents/TOT-D-BANKBANKBANK/bank-transfer-claim',
    );
  });

  it('maps failures and refuses a mismatched answer', async () => {
    expect(
      await createApiDonateClient(
        '',
        vi.fn(async () => ok({}, 400)),
      ).startBankTransfer(REQ, 'k'),
    ).toEqual({ ok: false, reason: 'invalid' });
    expect(
      await createApiDonateClient(
        '',
        vi.fn(async () => ok({ ...BANK, amountPaise: 1 })),
      ).startBankTransfer(REQ, 'k'),
    ).toEqual({ ok: false, reason: 'network' });
    const down = createApiDonateClient(
      '',
      vi.fn(async () => Promise.reject(new TypeError('x'))),
    );
    expect(await down.startBankTransfer(REQ, 'k')).toEqual({ ok: false, reason: 'network' });
    expect(await down.claimBankTransfer('r', null)).toBe(false);
  });
});
