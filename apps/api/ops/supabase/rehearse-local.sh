#!/usr/bin/env bash
# Rehearses 01/02/03 on a LOCAL throw-away database that mirrors the Supabase project (Phase 2b):
# trust tables in `theonetrust` owned by theonetrust_app, Supabase's API roles, stand-in "cafe"
# tables in `public` (one with the same name as a trust table). Then runs the real app as the
# restricted role. Local Postgres only: refuses any other host. Run from apps/api:
#   PGHOST=localhost PGUSER=postgres ops/supabase/rehearse-local.sh
set -euo pipefail
: "${PGHOST:=localhost}"
case "$PGHOST" in localhost | 127.0.0.1) ;; *) echo "local Postgres only" >&2; exit 1 ;; esac
DB=tt_rehearsal
HERE="$(cd "$(dirname "$0")" && pwd)"
APP_PW="rehearsal-only-local-$RANDOM"
OWNER_PW="rehearsal-owner-local-$RANDOM"
psql() { command psql -X -q -v ON_ERROR_STOP=1 "$@"; }

psql -d postgres <<SQL
DROP DATABASE IF EXISTS $DB;
CREATE DATABASE $DB;
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='theonetrust_owner') THEN DROP OWNED BY theonetrust_owner; DROP ROLE theonetrust_owner; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='theonetrust_app') THEN CREATE ROLE theonetrust_app LOGIN NOINHERIT CONNECTION LIMIT 20; END IF;
END \$\$;
ALTER ROLE theonetrust_app PASSWORD '$APP_PW';
ALTER ROLE theonetrust_app SET search_path = theonetrust;
ALTER ROLE theonetrust_app SET statement_timeout = '15s';
SQL
psql -d $DB <<'SQL'
CREATE SCHEMA theonetrust AUTHORIZATION theonetrust_app;
CREATE TABLE public.cafe_orders (id int PRIMARY KEY, total int);
INSERT INTO public.cafe_orders VALUES (1, 250);
CREATE TABLE public.programmes (id int PRIMARY KEY, note text);
INSERT INTO public.programmes VALUES (1, 'cafe data');
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
SQL
DIRECT_URL="postgresql://theonetrust_app:$APP_PW@$PGHOST:5432/$DB?schema=theonetrust" \
  pnpm exec prisma migrate deploy >/dev/null
psql -d $DB -c "DO \$\$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='theonetrust' LOOP EXECUTE format('ALTER TABLE theonetrust.%I ENABLE ROW LEVEL SECURITY', t.tablename); END LOOP; END \$\$;"

echo "== 01, then 02"
psql -d $DB -f "$HERE/01-roles-and-ownership.sql"
command psql -X -d $DB -At -F '|' -f "$HERE/02-verify-isolation.sql" | awk -F'|' '$3 != "t" { bad = 1; print "FAILED:", $0 } END { exit bad }'
echo "== the app as theonetrust_app"
REHEARSAL_APP_URL="postgresql://theonetrust_app:$APP_PW@$PGHOST:5432/$DB" npx tsx ops/supabase/rehearse-app.ts
echo "== 01 again, migrations as theonetrust_owner, 03, 01 again"
psql -d $DB -f "$HERE/01-roles-and-ownership.sql"
psql -d postgres -c "ALTER ROLE theonetrust_owner PASSWORD '$OWNER_PW'"
DIRECT_URL="postgresql://theonetrust_owner:$OWNER_PW@$PGHOST:5432/$DB?schema=theonetrust" \
  pnpm exec prisma migrate deploy | tail -1
psql -d $DB -f "$HERE/03-rollback.sql"
psql -d $DB -f "$HERE/01-roles-and-ownership.sql"
command psql -X -d $DB -At -F '|' -f "$HERE/02-verify-isolation.sql" | awk -F'|' '$3 != "t" { bad = 1; print "FAILED:", $0 } END { exit bad }'
echo "rehearsal passed"
