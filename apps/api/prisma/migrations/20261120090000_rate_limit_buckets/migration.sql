-- Phase 2c: shared rate-limit counters (additive; undo: DROP TABLE "rate_limit_buckets").
-- On the shared Supabase project, re-run ops/supabase/01-roles-and-ownership.sql afterwards
-- (row-level security policy + grants for the new table).
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "hits" INTEGER NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "rate_limit_buckets_hits_positive" CHECK ("hits" > 0),
    CONSTRAINT "rate_limit_buckets_key_shape" CHECK ("key" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "rate_limit_buckets_window_start_idx" ON "rate_limit_buckets"("window_start");
