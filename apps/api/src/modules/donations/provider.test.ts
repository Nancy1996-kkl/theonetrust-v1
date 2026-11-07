import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { isRazorpayImageUrl, PaymentProviderError, razorpayProvider } from './provider.ts';

const INPUT = {
  amountPaise: 51_200,
  currency: 'INR' as const,
  receipt: 'TOT-D-ABCDEFGHJKMN',
  notes: { programme: 'general' },
};

function reply(status: number, body: unknown) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );
}

describe('razorpayProvider', () => {
  it('creates an order with Basic auth and exposes only the key ID', async () => {
    const fetchImpl = reply(200, {
      id: 'order_Abc123XYZ',
      amount: 51_200,
      currency: 'INR',
      status: 'created',
    });
    const provider = razorpayProvider({
      keyId: 'rzp_test_abcdefgh12',
      keySecret: 'secret-secret-123',
      fetch: fetchImpl,
    });
    expect(provider.publicKeyId).toBe('rzp_test_abcdefgh12');
    expect(await provider.createOrder(INPUT)).toEqual({
      orderId: 'order_Abc123XYZ',
      amountPaise: 51_200,
      currency: 'INR',
      status: 'created',
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.razorpay.com/v1/orders');
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(
      `Basic ${Buffer.from('rzp_test_abcdefgh12:secret-secret-123').toString('base64')}`,
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      amount: 51_200,
      currency: 'INR',
      receipt: INPUT.receipt,
      notes: INPUT.notes,
      partial_payment: false,
    });
    expect(JSON.stringify(provider)).not.toContain('secret-secret-123');
  });

  it.each([
    ['a different amount', { id: 'order_Abc123XYZ', amount: 1, currency: 'INR' }],
    ['another currency', { id: 'order_Abc123XYZ', amount: 51_200, currency: 'USD' }],
    ['a malformed order ID', { id: 'pay_123', amount: 51_200, currency: 'INR' }],
    ['no JSON', 'oops'],
  ])('refuses %s in the response', async (_why, body) => {
    const provider = razorpayProvider({ keyId: 'k', keySecret: 's', fetch: reply(200, body) });
    await expect(provider.createOrder(INPUT)).rejects.toMatchObject({
      reason: 'unexpected_response',
    });
  });

  it('reports rejections and network failures', async () => {
    const rejected = razorpayProvider({
      keyId: 'k',
      keySecret: 's',
      baseUrl: 'https://x.example',
      fetch: reply(401, {}),
    });
    await expect(rejected.createOrder(INPUT)).rejects.toEqual(new PaymentProviderError('rejected'));
    const down = razorpayProvider({
      keyId: 'k',
      keySecret: 's',
      fetch: vi.fn(async () => Promise.reject(new Error('x'))),
    });
    await expect(down.createOrder(INPUT)).rejects.toMatchObject({ reason: 'network' });
  });

  it('defaults the status when Razorpay omits it', async () => {
    const provider = razorpayProvider({
      keyId: 'k',
      keySecret: 's',
      fetch: reply(200, { id: 'order_Abc123XYZ', amount: 51_200, currency: 'INR' }),
    });
    expect((await provider.createOrder(INPUT)).status).toBe('created');
  });
});

describe('razorpayProvider — verification and payment reads', () => {
  const keySecret = 'secret-secret-123';
  const sign = (o: string, p: string) =>
    createHmac('sha256', keySecret).update(`${o}|${p}`).digest('hex');
  const provider = (fetchImpl: typeof fetch = vi.fn()) =>
    razorpayProvider({ keyId: 'rzp_test_abcdefgh12', keySecret, fetch: fetchImpl });

  it('accepts only the exact HMAC of order_id|payment_id', () => {
    const p = provider();
    const good = sign('order_Abc123XYZ', 'pay_Def456UVW');
    expect(p.verifyCheckoutSignature('order_Abc123XYZ', 'pay_Def456UVW', good)).toBe(true);
    expect(p.verifyCheckoutSignature('order_Abc123XYZ', 'pay_Other999', good)).toBe(false);
    expect(p.verifyCheckoutSignature('order_Other999', 'pay_Def456UVW', good)).toBe(false);
    expect(p.verifyCheckoutSignature('order_Abc123XYZ', 'pay_Def456UVW', good.toUpperCase())).toBe(
      false,
    );
    expect(p.verifyCheckoutSignature('order_Abc123XYZ', 'pay_Def456UVW', 'short')).toBe(false);
    expect(p.verifyCheckoutSignature('bad', 'pay_Def456UVW', good)).toBe(false);
  });

  it('fetches a payment and an order’s payments with auth', async () => {
    const raw = {
      id: 'pay_Def456UVW',
      order_id: 'order_Abc123XYZ',
      amount: 100,
      currency: 'INR',
      status: 'captured',
      method: 'upi',
      amount_refunded: 0,
    };
    const fetchImpl = vi.fn(
      async (url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(String(url).includes('/orders/') ? { items: [raw] } : raw), {
          status: 200,
        }),
    );
    const p = provider(fetchImpl as never);
    expect(await p.fetchPayment('pay_Def456UVW')).toEqual({
      paymentId: 'pay_Def456UVW',
      orderId: 'order_Abc123XYZ',
      amountPaise: 100,
      currency: 'INR',
      status: 'captured',
      method: 'upi',
      refundedPaise: 0,
    });
    expect(await p.fetchOrderPayments('order_Abc123XYZ')).toHaveLength(1);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      'https://api.razorpay.com/v1/payments/pay_Def456UVW',
    );
    expect(String(fetchImpl.mock.calls[1]![0])).toBe(
      'https://api.razorpay.com/v1/orders/order_Abc123XYZ/payments',
    );
    expect((fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>).authorization).toMatch(
      /^Basic /,
    );
  });

  it('refuses bad IDs, errors and malformed answers', async () => {
    await expect(provider().fetchPayment('../x')).rejects.toMatchObject({ reason: 'rejected' });
    await expect(provider().fetchOrderPayments('x')).rejects.toMatchObject({ reason: 'rejected' });
    const answer = (status: number, body: unknown) =>
      provider(
        vi.fn(
          async () =>
            new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
        ) as never,
      );
    await expect(answer(404, {}).fetchPayment('pay_Def456UVW')).rejects.toMatchObject({
      reason: 'rejected',
    });
    await expect(answer(200, 'nope').fetchPayment('pay_Def456UVW')).rejects.toMatchObject({
      reason: 'unexpected_response',
    });
    await expect(answer(200, { id: 'x' }).fetchPayment('pay_Def456UVW')).rejects.toMatchObject({
      reason: 'unexpected_response',
    });
    await expect(
      answer(200, { items: 'x' }).fetchOrderPayments('order_Abc123XYZ'),
    ).rejects.toMatchObject({ reason: 'unexpected_response' });
    const minimal = await answer(200, {
      id: 'pay_Def456UVW',
      amount: 1,
      currency: 'INR',
      status: 'failed',
    }).fetchPayment('pay_Def456UVW');
    expect(minimal).toMatchObject({ orderId: null, method: null, refundedPaise: 0 });
    const down = provider(vi.fn(async () => Promise.reject(new Error('x'))) as never);
    await expect(down.fetchPayment('pay_Def456UVW')).rejects.toMatchObject({ reason: 'network' });
  });
});

describe('razorpayProvider — one-time UPI QR', () => {
  const provider = (fetchImpl: typeof fetch) =>
    razorpayProvider({ keyId: 'rzp_test_abcdefgh12', keySecret: 's', fetch: fetchImpl });
  const closeBy = new Date('2026-11-07T06:15:00.000Z');
  const input = { amountPaise: 50_000, reference: 'TOT-D-ABCDEFGHJKMN', closeBy, notes: {} };
  const qr = {
    id: 'qr_Abc123XYZ',
    image_url: 'https://rzp.io/i/abc',
    payment_amount: 50_000,
    close_by: closeBy.getTime() / 1000,
    status: 'active',
  };

  it('asks for a single-use, fixed-amount UPI QR and returns it', async () => {
    const fetchImpl = reply(200, qr);
    const made = await provider(fetchImpl as never).createQrCode!(input);
    expect(made).toEqual({
      qrId: 'qr_Abc123XYZ',
      imageUrl: 'https://rzp.io/i/abc',
      amountPaise: 50_000,
      closeBy,
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://api.razorpay.com/v1/payments/qr_codes');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      type: 'upi_qr',
      usage: 'single_use',
      fixed_amount: true,
      payment_amount: 50_000,
      close_by: closeBy.getTime() / 1000,
    });
  });

  it('rejects any reply that is not exactly what we asked for', async () => {
    for (const bad of [
      { ...qr, payment_amount: 1 },
      { ...qr, status: 'closed' },
      { ...qr, id: 'order_Abc123' },
      { ...qr, image_url: 'https://evil.example/qr.png' },
      'not json',
    ]) {
      await expect(provider(reply(200, bad) as never).createQrCode!(input)).rejects.toMatchObject({
        reason: 'unexpected_response',
      });
    }
    await expect(provider(reply(400, {}) as never).createQrCode!(input)).rejects.toMatchObject({
      reason: 'rejected',
    });
    const down = vi.fn(async () => Promise.reject(new Error('x')));
    await expect(provider(down as never).createQrCode!(input)).rejects.toMatchObject({
      reason: 'network',
    });
    // A missing close_by falls back to the time we asked for.
    const noClose: Partial<typeof qr> = { ...qr };
    delete noClose.close_by;
    expect((await provider(reply(200, noClose) as never).createQrCode!(input)).closeBy).toEqual(
      closeBy,
    );
  });

  it('lists the payments made on a QR', async () => {
    const raw = {
      id: 'pay_Def456UVW',
      order_id: null,
      amount: 50_000,
      currency: 'INR',
      status: 'captured',
      method: 'upi',
      amount_refunded: 0,
    };
    const fetchImpl = reply(200, { items: [raw] });
    const list = await provider(fetchImpl as never).fetchQrPayments!('qr_Abc123XYZ');
    expect(list).toEqual([expect.objectContaining({ paymentId: 'pay_Def456UVW', orderId: null })]);
    expect(String(fetchImpl.mock.calls[0]![0])).toContain(
      '/v1/payments/qr_codes/qr_Abc123XYZ/payments',
    );
    await expect(provider(fetchImpl as never).fetchQrPayments!('../x')).rejects.toMatchObject({
      reason: 'rejected',
    });
    await expect(
      provider(reply(200, { nope: 1 }) as never).fetchQrPayments!('qr_Abc123XYZ'),
    ).rejects.toMatchObject({ reason: 'unexpected_response' });
  });

  it('fetches only Razorpay PNG/JPEG QR images of a sane size', async () => {
    const image = (type: string, bytes = 10, status = 200) =>
      vi.fn(
        async () =>
          new Response(new Uint8Array(bytes), { status, headers: { 'content-type': type } }),
      );
    const ok = await provider(image('image/png; charset=binary') as never).fetchQrImage!(
      'https://rzp.io/i/abc',
    );
    expect(ok.contentType).toBe('image/png');
    expect(ok.data.length).toBe(10);
    for (const bad of [
      image('image/svg+xml'),
      image('text/html'),
      image('image/png', 0),
      image('image/png', 1_048_577),
      image('image/png', 10, 404),
    ]) {
      await expect(
        provider(bad as never).fetchQrImage!('https://rzp.io/i/abc'),
      ).rejects.toMatchObject({ reason: 'unexpected_response' });
    }
    await expect(
      provider(image('image/png') as never).fetchQrImage!('https://evil.example/x.png'),
    ).rejects.toMatchObject({ reason: 'rejected' });
    const down = vi.fn(async () => Promise.reject(new Error('x')));
    await expect(
      provider(down as never).fetchQrImage!('https://rzp.io/i/abc'),
    ).rejects.toMatchObject({ reason: 'network' });
  });

  it('recognises only https Razorpay image hosts', () => {
    expect(isRazorpayImageUrl('https://rzp.io/i/abc')).toBe(true);
    expect(isRazorpayImageUrl('https://cdn.razorpay.com/qr/abc.png')).toBe(true);
    expect(isRazorpayImageUrl('http://rzp.io/i/abc')).toBe(false);
    expect(isRazorpayImageUrl('https://razorpay.com.evil.example/x')).toBe(false);
    expect(isRazorpayImageUrl('https://evilrzp.io/x')).toBe(false);
    expect(isRazorpayImageUrl('not a url')).toBe(false);
  });
});
