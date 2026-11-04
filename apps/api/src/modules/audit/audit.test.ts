import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../../db/client.ts';
import { InvalidAuditEntryError, auditLog, auditRow, changedFieldNames } from './audit.ts';

const base = {
  actorId: '00000000-0000-4000-8000-000000000001',
  action: 'admin.preferences.update',
  entityType: 'admin_user',
  correlationId: 'req-12345678',
};

describe('auditRow', () => {
  it('keeps names only, sorted and de-duplicated, and trims the reason', () => {
    expect(
      auditRow({
        ...base,
        changedFields: ['locale', 'email', 'locale'],
        reason: '  owner asked  ',
      }),
    ).toEqual({
      ...base,
      entityId: null,
      reason: 'owner asked',
      changedFields: ['email', 'locale'],
    });
  });

  it('stores an empty reason as null', () => {
    expect(auditRow({ ...base, reason: '   ' }).reason).toBeNull();
  });

  it.each([
    ['action', { action: 'Update' }],
    ['action', { action: 'admin' }],
    ['entityType', { entityType: 'Admin User' }],
    ['changedFields', { changedFields: ['owner@example.org'] }],
    ['changedFields', { changedFields: ['9876 543210'] }],
    ['reason', { reason: 'x'.repeat(501) }],
  ])('refuses an invalid %s', (_part, patch) => {
    expect(() => auditRow({ ...base, ...patch })).toThrow(InvalidAuditEntryError);
  });
});

describe('changedFieldNames', () => {
  it('returns only the names of fields whose values changed', () => {
    expect(
      changedFieldNames({ locale: 'en', active: true }, { locale: 'ta', active: true }),
    ).toEqual(['locale']);
    expect(changedFieldNames({ a: 1 }, {})).toEqual([]);
  });
});

describe('auditLog', () => {
  function fakeDb() {
    const create = vi.fn(async () => ({}));
    const db = {
      auditLog: { create },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ auditLog: { create } }),
      ),
    };
    return { db: db as unknown as Db, create };
  }

  it('has no update or delete path — only record and mutate', () => {
    expect(Object.keys(auditLog(fakeDb().db)).sort()).toEqual(['mutate', 'record']);
  });

  it('records an event', async () => {
    const { db, create } = fakeDb();
    await auditLog(db).record(base);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: base.action }) });
  });

  it('writes the change and its entry in one transaction, entry built from the result', async () => {
    const { db, create } = fakeDb();
    const result = await auditLog(db).mutate(
      (r: { id: string }) => ({ ...base, entityId: r.id }),
      async () => ({ id: 'x1' }),
    );
    expect(result).toEqual({ id: 'x1' });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ entityId: 'x1' }) });
  });

  it('accepts a fixed entry too', async () => {
    const { db, create } = fakeDb();
    await auditLog(db).mutate(base, async () => 1);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
