import { describe, expect, it, vi } from 'vitest';
import { PaymentProviderError, razorpayProvider } from './provider.ts';

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
