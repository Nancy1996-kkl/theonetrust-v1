-- 03-rollback.sql — Phase 2b. Puts the trust schema back exactly as it was before
-- 01-roles-and-ownership.sql: theonetrust_app owns everything again, row-level security stays ON
-- with no policies (deny-all for everyone else), and theonetrust_owner is removed.
-- Touches ONLY the theonetrust schema and the two theonetrust_* roles. One transaction.
-- RUN AS: postgres, in the Supabase SQL editor. Then 02 will (correctly) show ownership checks false.

BEGIN;
SET LOCAL client_min_messages = warning; -- hide "policy does not exist, skipping" notices

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'theonetrust_owner') THEN
    RAISE EXCEPTION 'theonetrust_owner does not exist: nothing to roll back.';
  END IF;
END $$;

GRANT theonetrust_app TO postgres;
REASSIGN OWNED BY theonetrust_owner TO theonetrust_app;

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'theonetrust' LOOP
    EXECUTE format('DROP POLICY IF EXISTS theonetrust_app_all ON theonetrust.%I', t.tablename);
    EXECUTE format('ALTER TABLE theonetrust.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

ALTER ROLE theonetrust_app RESET idle_in_transaction_session_timeout;

-- The default privileges and grants were made by theonetrust_owner; DROP OWNED clears them.
DROP OWNED BY theonetrust_owner;
DROP ROLE theonetrust_owner;

COMMIT;
