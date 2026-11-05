import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareCounts, sameDatabase } from './restore-drill.mjs';

test('identical counts pass; missing, extra and short tables are reported', () => {
  assert.deepEqual(compareCounts({ a: 1, b: 2 }, { a: 1, b: 2 }), []);
  assert.deepEqual(compareCounts({ a: 1, b: 2, c: 0 }, { a: 1, b: 1, d: 0 }), [
    'b: 2 rows in source, 1 restored',
    'missing table: c',
    'unexpected table: d',
  ]);
});

test('refuses to restore over the source database', () => {
  assert.equal(
    sameDatabase('postgresql://u@h:5432/app', 'postgresql://x:y@h/app?sslmode=require'),
    true,
  );
  assert.equal(sameDatabase('postgresql://u@h/app', 'postgresql://u@h/app_restore'), false);
  assert.equal(sameDatabase('postgresql://u@h:5433/app', 'postgresql://u@h:5432/app'), false);
});
