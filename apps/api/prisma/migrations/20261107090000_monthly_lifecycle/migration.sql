-- AlterEnum
ALTER TYPE "PaymentExceptionKind" ADD VALUE 'SUBSCRIPTION_CHARGE_FAILED';
ALTER TYPE "PaymentExceptionKind" ADD VALUE 'SUBSCRIPTION_HALTED';

-- AlterTable
ALTER TABLE "payment_exceptions" ADD COLUMN     "subscription_id" UUID;

-- CreateTable
CREATE TABLE "subscription_status_events" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "from_status" "SubscriptionStatus" NOT NULL,
    "to_status" "SubscriptionStatus" NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_status_events_subscription_id_created_at_idx" ON "subscription_status_events"("subscription_id", "created_at");

-- AddForeignKey
ALTER TABLE "subscription_status_events" ADD CONSTRAINT "subscription_status_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "donation_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "donation_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written rules (#33) ──────────────────────────────────────────────────────────────
ALTER TABLE "subscription_status_events" ADD CONSTRAINT "subscription_status_events_changed" CHECK (
  "from_status" <> "to_status"
);
CREATE INDEX "payment_exceptions_subscription_id_idx" ON "payment_exceptions"("subscription_id");

-- Monthly-giving history is evidence: append-only.
CREATE FUNCTION "subscription_status_events_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'subscription status history is append-only';
END;
$$;
CREATE TRIGGER "subscription_status_events_append_only" BEFORE UPDATE OR DELETE ON "subscription_status_events"
  FOR EACH ROW EXECUTE FUNCTION "subscription_status_events_append_only"();
