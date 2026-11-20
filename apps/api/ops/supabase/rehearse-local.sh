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

row() { command psql -X -d $DB -At -F '|' -f "$HERE/02-verify-isolation.sql" | awk -F'|' -v n="$1" '$1 == n { print $3 "|" $4 }'; }
expect() { [ "$2" = "$3" ] && echo "ok    $1" || { echo "FAIL  $1 (got $2, want $3)"; exit 1; }; }

echo "== guard: 01 stops (and changes nothing) if the app role owns anything outside the trust schema"
psql -d $DB -c "SET ROLE theonetrust_app; CREATE TYPE public.stray_enum AS ENUM ('x');" 2>/dev/null \
  || psql -d $DB -c "CREATE TYPE public.stray_enum AS ENUM ('x'); ALTER TYPE public.stray_enum OWNER TO theonetrust_app;"
if psql -d $DB -f "$HERE/01-roles-and-ownership.sql" 2>/dev/null; then echo "FAIL  guard did not stop"; exit 1; fi
expect "guard stopped; nothing changed" "$(command psql -X -d $DB -Atc "select exists(select 1 from pg_roles where rolname='theonetrust_owner')")" f
psql -d $DB -c "DROP TYPE public.stray_enum"

echo "== 01, then 02"
psql -d $DB -f "$HERE/01-roles-and-ownership.sql"
command psql -X -d $DB -At -F '|' -f "$HERE/02-verify-isolation.sql" | awk -F'|' '$3 != "t" { bad = 1; print "FAILED:", $0 } END { exit bad }'
echo "== 02 notices problems (negative cases)"
psql -d $DB -c "ALTER TABLE theonetrust.audit_logs DISABLE TRIGGER audit_logs_no_update_delete"
expect "a disabled append-only trigger → row 13 false" "$(row 13 | cut -d'|' -f1)" f
psql -d $DB -c "ALTER TABLE theonetrust.audit_logs ENABLE TRIGGER audit_logs_no_update_delete"
psql -d $DB -c "GRANT SELECT (total) ON public.cafe_orders TO theonetrust_app"
expect "a column grant on a cafe table → row 5 false" "$(row 5 | cut -d'|' -f1)" f
psql -d $DB -c "REVOKE SELECT (total) ON public.cafe_orders FROM theonetrust_app"
psql -d $DB -c "CREATE FUNCTION public.cafe_secdef() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'select 1'"
expect "a callable owner-rights cafe function is listed in row 15" "$(row 15)" "f|public.cafe_secdef"
psql -d $DB -c "DROP FUNCTION public.cafe_secdef()"
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
