import { describe, expect, it, vi } from 'vitest';
import type { HelpRequest } from '@theonetrust/contracts';
import { createApiHelpClient, selectHelpClient } from './help-client.ts';

const callback: HelpRequest = {
  mode: 'callback',
  phone: '+919876543210',
  consentContact: true,
  pageLanguage: 'ta',
  website: '',
};

const respond = (status: number, body?: unknown) =>
  vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );

describe('createApiHelpClient', () => {
  it('posts a call-back to /help-requests/callback without cookies and returns the reference', async () => {
    const fetchImpl = respond(201, { reference: 'HLP-7K2M9Q' });
    const client = createApiHelpClient('http://localhost:4000/api/v1', fetchImpl);
    expect(client.acceptsRequests).toBe(true);
    expect(await client.submit(callback)).toEqual({ ok: true, reference: 'HLP-7K2M9Q' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('http://localhost:4000/api/v1/help-requests/callback');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      body: JSON.stringify(callback),
    });
  });

  it('posts the wizard to /help-requests', async () => {
    const fetchImpl = respond(201, { reference: 'HLP-ABCD' });
    await createApiHelpClient('', fetchImpl).submit({
      ...callback,
      mode: 'wizard',
    } as unknown as HelpRequest);
    expect(fetchImpl.mock.calls[0]![0]).toBe('/api/v1/help-requests');
  });

  it.each([
    [429, 'rate_limited'],
    [400, 'invalid'],
    [503, 'unavailable'],
    [500, 'network'],
  ] as const)('maps HTTP %i to %s', async (status, reason) => {
    expect(await createApiHelpClient('', respond(status, {})).submit(callback)).toEqual({
      ok: false,
      reason,
    });
  });

  it('never claims success without a valid reference', async () => {
    for (const body of [{ reference: 'not-a-ref' }, {}, 'oops']) {
      expect(await createApiHelpClient('', respond(201, body)).submit(callback)).toEqual({
        ok: false,
        reason: 'network',
      });
    }
    const broken = vi.fn(async () => new Response('<html>', { status: 201 }));
    expect(await createApiHelpClient('', broken).submit(callback)).toMatchObject({ ok: false });
  });

  it('reports a network failure', async () => {
    const down = vi.fn(async () => Promise.reject(new TypeError('offline')));
    expect(await createApiHelpClient('', down).submit(callback)).toEqual({
      ok: false,
      reason: 'network',
    });
  });

  it('is selected by VITE_HELP_ADAPTER=api', () => {
    expect(
      selectHelpClient({ VITE_HELP_ADAPTER: 'api', VITE_API_BASE_URL: '' }).acceptsRequests,
    ).toBe(true);
    expect(selectHelpClient({ VITE_HELP_ADAPTER: 'unavailable' }).acceptsRequests).toBe(false);
  });
});
