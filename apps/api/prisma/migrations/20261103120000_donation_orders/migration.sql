-- AlterTable
ALTER TABLE "donation_intents" ADD COLUMN     "consent_at" TIMESTAMPTZ(3),
ADD COLUMN     "fee_paise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gift_paise" INTEGER NOT NULL,
ADD COLUMN     "idempotency_key" TEXT;

-- AlterTable
ALTER TABLE "trust_settings" ADD COLUMN     "fee_table" JSONB,
ADD COLUMN     "max_donation_paise" INTEGER NOT NULL DEFAULT 50000000;

-- CreateIndex
CREATE UNIQUE INDEX "donation_intents_idempotency_key_key" ON "donation_intents"("idempotency_key");


-- ── Money rules (#23). No live data exists yet. ───────────────────────────────────────────
ALTER TABLE "donation_intents" ADD CONSTRAINT "donation_intents_amount_is_gift_plus_fee"
  CHECK ("amount_paise" = "gift_paise" + "fee_paise" AND "gift_paise" >= 100 AND "fee_paise" >= 0);
ALTER TABLE "donation_intents" ADD CONSTRAINT "donation_intents_idempotency_key_format"
  CHECK ("idempotency_key" IS NULL OR "idempotency_key" ~ '^[A-Za-z0-9_-]{16,64}$');
ALTER TABLE "trust_settings" ADD CONSTRAINT "trust_settings_max_donation"
  CHECK ("max_donation_paise" >= 100);
