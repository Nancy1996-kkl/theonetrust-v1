import { describe, expect, it } from 'vitest';
import { createDb } from './client.ts';

describe('createDb', () => {
  it('builds a client without connecting (no database needed until the first query)', async () => {
    const db = createDb('postgresql://user:pw@127.0.0.1:1/never');
    expect(typeof db.donationIntent.create).toBe('function');
    await db.$disconnect();
  });
});
