import { afterAll } from 'vitest';
import { createDb, type Db } from '../db/client.ts';
import { testDatabaseUrl } from './db-global-setup.ts';

/** One client per test file, disconnected after the file. */
export function useTestDb(): Db {
  const db = createDb(testDatabaseUrl());
  afterAll(async () => {
    await db.$disconnect();
  });
  return db;
}

/** Unique suffix so tests never collide on unique columns, without wiping between tests. */
export function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
