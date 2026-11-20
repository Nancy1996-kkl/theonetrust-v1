-- 02-verify-isolation.sql — Phase 2b. READ-ONLY: changes nothing, safe to run any time.
-- Every row must say ok = true. Any false → do not connect the website; ask for a review.

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
outside AS (
  -- Any table, view or sequence OUTSIDE the trust schema the app could touch (cafe included).
  SELECT n.nspname || '.' || c.relname AS obj
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    AND n.nspname NOT IN ('theonetrust', 'pg_catalog', 'information_schema', 'pg_toast')
    AND (
      (c.relkind = 'S' AND has_sequence_privilege('theonetrust_app', c.oid, 'USAGE,SELECT,UPDATE'))
      OR (c.relkind <> 'S' AND has_table_privilege('theonetrust_app', c.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    )
)
SELECT * FROM (
  SELECT 1 AS n, 'trust schema exists and is owned by theonetrust_owner' AS check,
    (SELECT nspowner = 'theonetrust_owner'::regrole FROM pg_namespace WHERE nspname = 'theonetrust') AS ok,
    '' AS detail
  UNION ALL
  SELECT 2, 'every trust table, sequence and function is owned by theonetrust_owner',
    NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'theonetrust' AND c.relowner <> 'theonetrust_owner'::regrole
      UNION ALL
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'theonetrust' AND p.proowner <> 'theonetrust_owner'::regrole),
    ''
  UNION ALL
  SELECT 3, 'theonetrust_app owns nothing (cannot alter tables or switch off triggers)',
    NOT EXISTS (SELECT 1 FROM pg_class WHERE relowner = 'theonetrust_app'::regrole)
      AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proowner = 'theonetrust_app'::regrole)
      AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = 'theonetrust_app'::regrole),
    ''
  UNION ALL
  SELECT 4, 'theonetrust_app is not a superuser, cannot bypass RLS, create roles or databases',
    (SELECT NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb
            AND NOT rolreplication FROM pg_roles WHERE rolname = 'theonetrust_app'),
    ''
  UNION ALL
  SELECT 5, 'theonetrust_app can touch NOTHING outside the trust schema (cafe included)',
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
  SELECT 13, 'the append-only triggers are present and enabled',
    (SELECT count(*) FROM pg_trigger tg
       JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'theonetrust' AND NOT tg.tgisinternal AND tg.tgenabled = 'O') = 4,
    ''
) checks ORDER BY n;
