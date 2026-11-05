#!/usr/bin/env node
/**
 * Backup + restore drill (#39). Dumps SOURCE_DATABASE_URL (use the DIRECT/unpooled URL), restores
 * it into an EMPTY scratch database at RESTORE_DATABASE_URL, then proves the copy is complete:
 * same tables, same row count in every table, same applied migrations. Never writes to the source.
 *
 *   SOURCE_DATABASE_URL=… RESTORE_DATABASE_URL=… node scripts/restore-drill.mjs
 *
 * Prints table names and counts only — never row data. Exit code 0 = restore verified.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COUNT_SQL = `
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;

/** Compares { table: count } maps; returns human-readable problems (empty = identical). */
export function compareCounts(source, restored) {
  const problems = [];
  for (const [table, count] of Object.entries(source)) {
    if (!(table in restored)) problems.push(`missing table: ${table}`);
    else if (restored[table] !== count)
      problems.push(`${table}: ${count} rows in source, ${restored[table]} restored`);
  }
  for (const table of Object.keys(restored))
    if (!(table in source)) problems.push(`unexpected table: ${table}`);
  return problems;
}

/** The same database twice is refused: the drill must never restore over the source. */
export function sameDatabase(a, b) {
  const key = (u) => {
    const url = new URL(u);
    return `${url.hostname}:${url.port || '5432'}/${url.pathname.replace(/^\//, '')}`;
  };
  return key(a) === key(b);
}

function run(cmd, args) {
  const out = spawnSync(cmd, args, { encoding: 'utf8' });
  if (out.status !== 0) {
    throw new Error(`${cmd} failed: ${(out.stderr || '').split('\n')[0]}`);
  }
  return out.stdout;
}

function counts(url) {
  const tables = run('psql', [url, '-At', '-c', COUNT_SQL]).split('\n').filter(Boolean);
  const result = {};
  for (const t of tables) {
    if (!/^[a-z_][a-z0-9_]*$/.test(t)) throw new Error(`unexpected table name: ${t}`);
    result[t] = Number(run('psql', [url, '-At', '-c', `SELECT count(*) FROM "${t}"`]).trim());
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = process.env.SOURCE_DATABASE_URL;
  const target = process.env.RESTORE_DATABASE_URL;
  if (!source || !target) {
    console.error('✖ set SOURCE_DATABASE_URL and RESTORE_DATABASE_URL');
    process.exit(2);
  }
  if (sameDatabase(source, target)) {
    console.error('✖ RESTORE_DATABASE_URL must be a different, empty database');
    process.exit(2);
  }
  const dir = mkdtempSync(join(tmpdir(), 'tot-drill-'));
  const dump = join(dir, 'backup.dump');
  const started = Date.now();
  try {
    run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', `--file=${dump}`, source]);
    run('pg_restore', [
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      `--dbname=${target}`,
      dump,
    ]);
    const a = counts(source);
    const b = counts(target);
    const problems = compareCounts(a, b);
    const migrations = (url) =>
      run('psql', [
        url,
        '-At',
        '-c',
        'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY 1',
      ]);
    if (migrations(source) !== migrations(target)) problems.push('applied migrations differ');
    for (const [t, n] of Object.entries(a)) console.log(`  ${t}: ${n}`);
    if (problems.length) {
      for (const p of problems) console.error(`✖ ${p}`);
      process.exit(1);
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `✔ restore verified: ${Object.keys(a).length} tables, row counts and migrations match (${seconds}s)`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
