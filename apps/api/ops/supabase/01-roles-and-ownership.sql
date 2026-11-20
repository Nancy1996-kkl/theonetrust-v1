-- 01-roles-and-ownership.sql — Phase 2b (docs/decisions/2026-11-20-cashfree-migration-plan.md)
--
-- WHAT: splits the trust database user in two, inside the Supabase project's `theonetrust` schema:
--   theonetrust_owner — owns every trust table and function; used ONLY for migrations, from a
--                       trusted machine. Never stored in Vercel.
--   theonetrust_app   — the website's user: can read and write rows, and delete rows only in the
--                       4 tables the app ever deletes from. It cannot change tables or switch off
--                       triggers, so the append-only protections (audit log, payment history,
--                       receipts) bind it.
--
-- SAFETY:
--   * Touches ONLY the `theonetrust` schema and the two theonetrust_* roles. No cafe table,
--     function or role is read or changed. (Checked before writing: theonetrust_app owns nothing
--     outside `theonetrust` except Postgres's internal storage of those same tables.)
--   * One transaction: it either completes or changes nothing.
--   * Safe to run again (idempotent). Re-run it after every future migration that adds a table.
--   * No passwords here. Set them separately (README step 3) — never in Git, chat or logs.
--
-- RUN AS: postgres, in the Supabase SQL editor of the project that holds `theonetrust`.
-- PASSWORDS: never in this file and never as plain text in the SQL editor — this project logs
--   DDL statements. Use ops/supabase/scram-verifier.mjs (README step 3).
-- THEN RUN: 02-verify-isolation.sql (read-only) and check every row says ok = true.
-- UNDO:   03-rollback.sql.

BEGIN;
SET LOCAL client_min_messages = warning; -- hide "policy does not exist, skipping" notices

-- 0. Stop at once if this is not the database we expect.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'theonetrust') THEN
    RAISE EXCEPTION 'schema theonetrust not found: wrong project? Nothing was changed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'theonetrust_app') THEN
    RAISE EXCEPTION 'role theonetrust_app not found: wrong project? Nothing was changed.';
  END IF;
  -- Every object theonetrust_app owns, of every kind (tables, types, functions, schemas, shared
  -- objects), must belong to the trust schema; REASSIGN OWNED below moves exactly these.
  IF EXISTS (
    SELECT 1 FROM pg_shdepend d
    WHERE d.refobjid = 'theonetrust_app'::regrole AND d.deptype = 'o'
      AND d.dbid IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
      AND NOT (
        (d.classid = 'pg_class'::regclass AND EXISTS (
          SELECT 1 FROM pg_class c WHERE c.oid = d.objid AND (
            c.relnamespace = 'theonetrust'::regnamespace
            OR (c.relnamespace = 'pg_toast'::regnamespace AND EXISTS (
              SELECT 1 FROM pg_class t WHERE t.reltoastrelid = c.oid
                AND t.relnamespace = 'theonetrust'::regnamespace)))))
        OR (d.classid = 'pg_type'::regclass AND EXISTS (
          SELECT 1 FROM pg_type t WHERE t.oid = d.objid AND t.typnamespace = 'theonetrust'::regnamespace))
        OR (d.classid = 'pg_proc'::regclass AND EXISTS (
          SELECT 1 FROM pg_proc p WHERE p.oid = d.objid AND p.pronamespace = 'theonetrust'::regnamespace))
        OR (d.classid = 'pg_namespace'::regclass AND d.objid = 'theonetrust'::regnamespace)
      )
  ) THEN
    RAISE EXCEPTION 'theonetrust_app owns something outside the theonetrust schema: stopping. Nothing was changed.';
  END IF;
END $$;

-- 1. The migration owner (logs in only from a trusted machine, 2 connections at most).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'theonetrust_owner') THEN
    -- Defaults already mean no superuser, no role/database creation, no replication, no RLS bypass
    -- (02 check 4 verifies the app role; listing them here could fail on a managed Postgres).
    CREATE ROLE theonetrust_owner LOGIN NOINHERIT CONNECTION LIMIT 2;
  END IF;
END $$;
ALTER ROLE theonetrust_owner SET search_path = theonetrust;
-- postgres must hold both roles' privileges to hand ownership from one to the other.
GRANT theonetrust_owner TO postgres;

-- 2. Hand every trust object (schema, tables, sequence, types, functions) to the owner.
REASSIGN OWNED BY theonetrust_app TO theonetrust_owner;

-- 3. The website's user: rows only.
ALTER ROLE theonetrust_app WITH LOGIN NOINHERIT CONNECTION LIMIT 20;
ALTER ROLE theonetrust_app SET search_path = theonetrust;
ALTER ROLE theonetrust_app SET statement_timeout = '15s';
ALTER ROLE theonetrust_app SET idle_in_transaction_session_timeout = '30s';

-- Nobody else gets anything in this schema (Supabase's API roles included).
REVOKE ALL ON SCHEMA theonetrust FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA theonetrust FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA theonetrust FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA theonetrust FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA theonetrust TO theonetrust_app;
-- Start from nothing, then grant exactly what the app uses.
REVOKE ALL ON ALL TABLES IN SCHEMA theonetrust FROM theonetrust_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA theonetrust TO theonetrust_app;
-- The only tables the app deletes rows from (owner removes a draft/unused item; recovery codes are
-- replaced). Payment, receipt, audit and history tables: no DELETE at all.
GRANT DELETE ON theonetrust.admin_recovery_codes, theonetrust.programmes,
  theonetrust.impact_metrics, theonetrust.transparency_documents TO theonetrust_app;
-- The migration history is the owner's alone; the app may read it (launch check).
REVOKE INSERT, UPDATE, DELETE ON theonetrust._prisma_migrations FROM theonetrust_app;
-- Acknowledgement numbers (nextval).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA theonetrust TO theonetrust_app;

-- Tables and sequences added by future migrations get the same row-only rights.
ALTER DEFAULT PRIVILEGES FOR ROLE theonetrust_owner IN SCHEMA theonetrust
  GRANT SELECT, INSERT, UPDATE ON TABLES TO theonetrust_app;
ALTER DEFAULT PRIVILEGES FOR ROLE theonetrust_owner IN SCHEMA theonetrust
  GRANT USAGE, SELECT ON SEQUENCES TO theonetrust_app;

-- 4. Row-level security on every table: the app has one policy; everyone else stays denied.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'theonetrust' LOOP
    EXECUTE format('ALTER TABLE theonetrust.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS theonetrust_app_all ON theonetrust.%I', t.tablename);
    EXECUTE format(
      'CREATE POLICY theonetrust_app_all ON theonetrust.%I FOR ALL TO theonetrust_app USING (true) WITH CHECK (true)',
      t.tablename);
  END LOOP;
END $$;

COMMIT;
