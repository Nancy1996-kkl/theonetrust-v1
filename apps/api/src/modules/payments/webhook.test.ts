import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { verifyWebhookSignature } from './webhook-routes.ts';

const SECRET = 'webhook-secret-0123456789';

describe('verifyWebhookSignature', () => {
  const body = Buffer.from('{"event":"payment.captured"}');
  const good = createHmac('sha256', SECRET).update(body).digest('hex');

  it('accepts only the HMAC of the exact raw bytes', () => {
    expect(verifyWebhookSignature(body, good, SECRET)).toBe(true);
    expect(verifyWebhookSignature(Buffer.from('{"event": "payment.captured"}'), good, SECRET)).toBe(
      false,
    );
    expect(verifyWebhookSignature(body, good, 'another-secret-0123456')).toBe(false);
    expect(verifyWebhookSignature(body, good.toUpperCase(), SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, ['x'], SECRET)).toBe(false);
  });
});

describe('webhook without a secret or database', () => {
  it('answers 503 and never processes', async () => {
    const app = buildApp(loadEnv({ NODE_ENV: 'test' }));
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/razorpay',
      payload: { event: 'payment.captured' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('accepts RAZORPAY_WEBHOOK_SECRET in env (empty = unset)', () => {
    expect(loadEnv({ RAZORPAY_WEBHOOK_SECRET: SECRET }).RAZORPAY_WEBHOOK_SECRET).toBe(SECRET);
    expect(loadEnv({ RAZORPAY_WEBHOOK_SECRET: '' }).RAZORPAY_WEBHOOK_SECRET).toBeUndefined();
    expect(() => loadEnv({ RAZORPAY_WEBHOOK_SECRET: 'short' })).toThrow();
  });
});
