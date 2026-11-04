-- AlterTable
ALTER TABLE "donation_intents" ADD COLUMN     "paid_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "webhook_events" ADD COLUMN     "donation_intent_id" UUID;

-- CreateTable
CREATE TABLE "donation_status_events" (
    "id" UUID NOT NULL,
    "donation_intent_id" UUID NOT NULL,
    "from_status" "DonationStatus" NOT NULL,
    "to_status" "DonationStatus" NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donation_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "donation_status_events_donation_intent_id_created_at_idx" ON "donation_status_events"("donation_intent_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_events_donation_intent_id_idx" ON "webhook_events"("donation_intent_id");

-- AddForeignKey
ALTER TABLE "donation_status_events" ADD CONSTRAINT "donation_status_events_donation_intent_id_fkey" FOREIGN KEY ("donation_intent_id") REFERENCES "donation_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_donation_intent_id_fkey" FOREIGN KEY ("donation_intent_id") REFERENCES "donation_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Hand-written rules (#31) ──────────────────────────────────────────────────────────────
-- A PAID-ish donation knows when it was paid; nothing else has a paid time.
ALTER TABLE "donation_intents" ADD CONSTRAINT "donation_intents_paid_at_status" CHECK (
  "paid_at" IS NULL OR "status" IN ('PAID', 'REFUND_PENDING', 'REFUNDED')
);
ALTER TABLE "donation_status_events" ADD CONSTRAINT "donation_status_events_changed" CHECK (
  "from_status" <> "to_status"
);

-- Status history is evidence: append-only.
CREATE FUNCTION "donation_status_events_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'donation status history is append-only';
END;
$$;
CREATE TRIGGER "donation_status_events_append_only" BEFORE UPDATE OR DELETE ON "donation_status_events"
  FOR EACH ROW EXECUTE FUNCTION "donation_status_events_append_only"();
