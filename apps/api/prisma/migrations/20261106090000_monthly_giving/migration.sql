-- AlterTable
ALTER TABLE "donation_subscriptions" ADD COLUMN     "consent_at" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "consent_version" TEXT NOT NULL,
ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "manage_token_salt" TEXT NOT NULL,
ADD COLUMN     "method_route" TEXT NOT NULL,
ADD COLUMN     "public_reference" TEXT NOT NULL,
ADD COLUMN     "start_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'RAZORPAY',
    "provider_plan_id" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'monthly',
    "interval" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_provider_plan_id_key" ON "subscription_plans"("provider_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_provider_amount_paise_period_interval_key" ON "subscription_plans"("provider", "amount_paise", "period", "interval");

-- CreateIndex
CREATE UNIQUE INDEX "donation_subscriptions_public_reference_key" ON "donation_subscriptions"("public_reference");

-- CreateIndex
CREATE UNIQUE INDEX "donation_subscriptions_idempotency_key_key" ON "donation_subscriptions"("idempotency_key");


-- ── Hand-written rules (#32) ──────────────────────────────────────────────────────────────
ALTER TABLE "donation_subscriptions" ADD CONSTRAINT "donation_subscriptions_method_route" CHECK (
  "method_route" IN ('upi_autopay', 'emandate_card')
);
-- UPI AutoPay without extra authentication is capped at ₹15,000 per debit.
ALTER TABLE "donation_subscriptions" ADD CONSTRAINT "donation_subscriptions_upi_cap" CHECK (
  "method_route" <> 'upi_autopay' OR "amount_paise" <= 1500000
);
ALTER TABLE "donation_subscriptions" ADD CONSTRAINT "donation_subscriptions_reference_format" CHECK (
  "public_reference" ~ '^TOT-M-[0-9A-HJKMNP-TV-Z]{12}$'
);
ALTER TABLE "donation_subscriptions" ADD CONSTRAINT "donation_subscriptions_cancelled_at" CHECK (
  ("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)
);
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_amount_min" CHECK ("amount_paise" >= 100);
