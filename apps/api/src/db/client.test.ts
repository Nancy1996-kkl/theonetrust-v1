import { describe, expect, it } from 'vitest';
import { createDb, qualified } from './client.ts';

describe('createDb', () => {
  it('builds a client without connecting (no database needed until the first query)', async () => {
    const db = createDb('postgresql://user:pw@127.0.0.1:1/never');
    expect(typeof db.donationIntent.create).toBe('function');
    await db.$disconnect();
  });
});

describe('createDb schema (Phase 2b)', () => {
  const URL = 'postgresql://app@127.0.0.1:1/never-connected'; // clients connect lazily

  it('qualifies raw SQL object names with the configured schema (never the role search_path)', async () => {
    const plain = createDb(URL);
    expect(qualified('receipt_number_seq')).toBe('"public"."receipt_number_seq"');
    const trust = createDb(URL, {}, 'theonetrust');
    expect(qualified('receipt_number_seq')).toBe('"theonetrust"."receipt_number_seq"');
    await Promise.all([plain.$disconnect(), trust.$disconnect()]);
    createDb(URL); // back to the default for other tests in this worker
  });
});
