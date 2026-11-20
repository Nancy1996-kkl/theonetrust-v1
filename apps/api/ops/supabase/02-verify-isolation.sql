-- 02-verify-isolation.sql — Phase 2b. READ-ONLY: changes nothing, safe to run any time.
-- Rows 1–14 must say ok = true. Any false → do not connect the website; ask for a review.
-- Row 15 lists functions OUTSIDE the trust schema (the cafe's) that any database user can call and
-- that run with their owner's rights. It is a decision for the cafe, not something these scripts
-- change: see the README.

WITH
trust_tables AS (
  SELECT c.oid, c.relname, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'theonetrust' AND c.relkind = 'r'
),
delete_ok AS (
  SELECT unnest(ARRAY['admin_recovery_codes', 'programmes', 'impact_metrics',
                      'transparency_documents']) AS relname
),
allowed AS (
  -- Supabase lets every role read the pg_stat_statements views. Postgres shows another role's
  -- query text there only to roles with pg_read_all_stats, which theonetrust_app does not have,
  -- so no cafe query text is visible. Nothing else outside the trust schema is allowed.
  SELECT unnest(ARRAY['extensions.pg_stat_statements', 'extensions.pg_stat_statements_info']) AS obj
),
outside_cols AS (
  -- Column-level grants count too (a grant on one column is still access to the table).
  SELECT DISTINCT table_schema || '.' || table_name || ' (columns)' AS obj
  FROM information_schema.column_privileges
  WHERE grantee IN ('theonetrust_app', 'PUBLIC') AND table_schema NOT IN
    ('theonetrust', 'pg_catalog', 'information_schema')
    AND (table_schema || '.' || table_name) NOT IN (SELECT obj FROM allowed)
    AND has_column_privilege('theonetrust_app',
          format('%I.%I', table_schema, table_name)::regclass, column_name,
          'SELECT,INSERT,UPDATE,REFERENCES')
),
secdef AS (
  -- Functions outside the trust schema that run with their OWNER's rights and that the app could
  -- call (Postgres lets every role call functions by default). Listed for a decision; the trust
  -- app never calls any of them.
  SELECT n.nspname || '.' || p.proname AS obj
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosecdef AND n.nspname NOT IN ('theonetrust', 'pg_catalog', 'information_schema')
    AND has_schema_privilege('theonetrust_app', n.oid, 'USAGE')
    AND has_function_privilege('theonetrust_app', p.oid, 'EXECUTE')
),
outside AS (
  SELECT obj FROM outside_cols
  UNION
  -- Any table, view or sequence OUTSIDE the trust schema the app could touch (cafe included).
  SELECT n.nspname || '.' || c.relname AS obj
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    AND n.nspname NOT IN ('theonetrust', 'pg_catalog', 'information_schema', 'pg_toast')
    AND (n.nspname || '.' || c.relname) NOT IN (SELECT obj FROM allowed)
    AND (
      (c.relkind = 'S' AND has_sequence_privilege('theonetrust_app', c.oid, 'USAGE,SELECT,UPDATE'))
      OR (c.relkind <> 'S' AND has_table_privilege('theonetrust_app', c.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    )
)
SELECT n, "check", COALESCE(ok, false) AS ok, detail FROM (
  SELECT 1 AS n, 'trust schema exists and is owned by theonetrust_owner' AS check,
    (SELECT nspowner = to_regrole('theonetrust_owner') FROM pg_namespace WHERE nspname = 'theonetrust') AS ok,
    '' AS detail
  UNION ALL
  SELECT 2, 'every trust table, sequence, type and function is owned by theonetrust_owner',
    to_regrole('theonetrust_owner') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'theonetrust' AND c.relowner <> to_regrole('theonetrust_owner')
      UNION ALL
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'theonetrust' AND p.proowner <> to_regrole('theonetrust_owner')
      UNION ALL
      SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'theonetrust' AND t.typowner <> to_regrole('theonetrust_owner')),
    ''
  UNION ALL
  SELECT 3, 'theonetrust_app owns nothing (cannot alter tables or switch off triggers)',
    NOT EXISTS (SELECT 1 FROM pg_class WHERE relowner = 'theonetrust_app'::regrole)
      AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proowner = 'theonetrust_app'::regrole)
      AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = 'theonetrust_app'::regrole),
    ''
  UNION ALL
  SELECT 4, 'theonetrust_app: no superuser, RLS bypass, role/database creation, other roles or statistics rights',
    (SELECT NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb
            AND NOT rolreplication FROM pg_roles WHERE rolname = 'theonetrust_app')
      AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = 'theonetrust_app'::regrole)
      AND NOT pg_has_role('theonetrust_app', 'pg_read_all_stats', 'USAGE'),
    ''
  UNION ALL
  SELECT 5, 'theonetrust_app has no table, view, sequence or column right outside the trust schema',
    NOT EXISTS (SELECT 1 FROM outside),
    COALESCE((SELECT string_agg(obj, ', ' ORDER BY obj) FROM (SELECT obj FROM outside LIMIT 20) x), '')
  UNION ALL
  SELECT 6, 'theonetrust_app may DELETE only in the 4 expected tables',
    NOT EXISTS (
      SELECT 1 FROM trust_tables t
      WHERE has_table_privilege('theonetrust_app', t.oid, 'DELETE')
        AND t.relname NOT IN (SELECT relname FROM delete_ok)),
    COALESCE((SELECT string_agg(t.relname, ', ') FROM trust_tables t
              WHERE has_table_privilege('theonetrust_app', t.oid, 'DELETE')), '')
  UNION ALL
  SELECT 7, 'theonetrust_app has no TRUNCATE, REFERENCES or TRIGGER on any trust table',
    NOT EXISTS (SELECT 1 FROM trust_tables t
                WHERE has_table_privilege('theonetrust_app', t.oid, 'TRUNCATE,REFERENCES,TRIGGER')),
    ''
  UNION ALL
  SELECT 8, 'theonetrust_app cannot write the migration history',
    NOT has_table_privilege('theonetrust_app', 'theonetrust._prisma_migrations', 'INSERT,UPDATE,DELETE'),
    ''
  UNION ALL
  SELECT 9, 'Supabase API roles (anon, authenticated, service_role) and PUBLIC cannot use the trust schema',
    NOT has_schema_privilege('anon', 'theonetrust', 'USAGE')
      AND NOT has_schema_privilege('authenticated', 'theonetrust', 'USAGE')
      AND NOT has_schema_privilege('service_role', 'theonetrust', 'USAGE')
      AND NOT EXISTS (SELECT 1 FROM trust_tables t
                      WHERE has_table_privilege('anon', t.oid, 'SELECT,INSERT,UPDATE,DELETE')
                         OR has_table_privilege('authenticated', t.oid, 'SELECT,INSERT,UPDATE,DELETE')),
    ''
  UNION ALL
  SELECT 10, 'row-level security is ON for every trust table',
    NOT EXISTS (SELECT 1 FROM trust_tables WHERE NOT relrowsecurity),
    COALESCE((SELECT string_agg(relname, ', ') FROM trust_tables WHERE NOT relrowsecurity), '')
  UNION ALL
  SELECT 11, 'every trust table has the app policy, and only for theonetrust_app',
    NOT EXISTS (
      SELECT 1 FROM trust_tables t
      WHERE NOT EXISTS (SELECT 1 FROM pg_policies p
                        WHERE p.schemaname = 'theonetrust' AND p.tablename = t.relname
                          AND p.policyname = 'theonetrust_app_all'
                          AND p.roles = ARRAY['theonetrust_app']::name[]))
      AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'theonetrust' AND p.roles <> ARRAY['theonetrust_app']::name[]),
    ''
  UNION ALL
  SELECT 12, 'theonetrust_app defaults to the trust schema with a statement timeout',
    EXISTS (SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole
            WHERE r.rolname = 'theonetrust_app'
              AND 'search_path=theonetrust' = ANY (s.setconfig)
              AND EXISTS (SELECT 1 FROM unnest(s.setconfig) c WHERE c LIKE 'statement_timeout=%')),
    ''
  UNION ALL
  SELECT 13, 'each append-only trigger exists on its table and is enabled',
    (SELECT count(*) FROM (VALUES
        ('receipts', 'receipts_no_delete'),
        ('audit_logs', 'audit_logs_no_update_delete'),
        ('donation_status_events', 'donation_status_events_append_only'),
        ('subscription_status_events', 'subscription_status_events_append_only')) AS want(tbl, trg)
      WHERE EXISTS (
        SELECT 1 FROM pg_trigger tg
          JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'theonetrust' AND c.relname = want.tbl AND tg.tgname = want.trg
          AND tg.tgenabled IN ('O', 'A'))) = 4,
    ''
  UNION ALL
  SELECT 14, 'neither trust role can create objects in any other schema (a migration can never land in public)',
    NOT EXISTS (
      SELECT 1 FROM pg_namespace n, (VALUES ('theonetrust_app'), ('theonetrust_owner')) AS r(role)
      WHERE to_regrole(r.role) IS NOT NULL
        AND n.nspname NOT IN ('theonetrust', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%'
        AND n.nspname NOT LIKE 'pg_toast_temp%'
        AND has_schema_privilege(r.role, n.oid, 'CREATE')),
    ''
  UNION ALL
  SELECT 15, 'functions elsewhere that run with their owner''s rights and the app could call (see README)',
    NOT EXISTS (SELECT 1 FROM secdef),
    COALESCE((SELECT string_agg(obj, ', ' ORDER BY obj) FROM secdef), '')
) checks ORDER BY n;
