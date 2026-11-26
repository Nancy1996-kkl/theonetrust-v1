import { describe, expect, it, vi } from 'vitest';
import { TAMIL_FONT, preloadTamilFont } from './preload-tamil-font.ts';

function fakeWindow(opts: { idle?: boolean; fonts?: boolean; reject?: boolean } = {}) {
  const load = vi.fn(() =>
    opts.reject ? Promise.reject(new Error('offline')) : Promise.resolve([]),
  );
  const idle = vi.fn((cb: () => void) => {
    cb();
    return 1;
  });
  const timeout = vi.fn((cb: () => void) => {
    cb();
    return 1;
  });
  const win = {
    document: { fonts: opts.fonts === false ? undefined : { load } },
    setTimeout: timeout,
    ...(opts.idle === false ? {} : { requestIdleCallback: idle }),
  } as unknown as Window;
  return { win, load, idle, timeout };
}

describe('preloadTamilFont', () => {
  it('loads the Tamil font when the browser is idle', () => {
    const { win, load, idle } = fakeWindow();
    preloadTamilFont(win);
    expect(idle).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith(TAMIL_FONT, 'தமிழ்');
  });

  it('falls back to a timer when requestIdleCallback is missing (Safari)', () => {
    const { win, load, timeout } = fakeWindow({ idle: false });
    preloadTamilFont(win);
    expect(timeout).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
  });

  it('does nothing without the Font Loading API', () => {
    const { win, idle } = fakeWindow({ fonts: false });
    expect(() => preloadTamilFont(win)).not.toThrow();
    expect(idle).not.toHaveBeenCalled();
  });

  it('ignores a failed download', async () => {
    const { win, load } = fakeWindow({ reject: true });
    preloadTamilFont(win);
    await expect(load.mock.results[0]?.value).rejects.toThrow('offline');
  });

  it('does nothing outside a browser', () => {
    expect(() => preloadTamilFont(undefined)).not.toThrow();
  });
});
