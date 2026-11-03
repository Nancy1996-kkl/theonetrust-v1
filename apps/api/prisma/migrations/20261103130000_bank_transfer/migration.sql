-- CreateEnum
CREATE TYPE "DonationChannel" AS ENUM ('CHECKOUT', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentExceptionKind" AS ENUM ('UNMATCHED_CREDIT', 'AMOUNT_MISMATCH', 'ALREADY_PAID');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterTable
ALTER TABLE "bank_transfer_records" ADD COLUMN     "decision_reason" TEXT,
ADD COLUMN     "evidence" TEXT NOT NULL,
ADD COLUMN     "recorded_by_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "donation_intents" ADD COLUMN     "channel" "DonationChannel" NOT NULL DEFAULT 'CHECKOUT';

-- AlterTable
ALTER TABLE "trust_settings" ADD COLUMN     "bank_account_name" TEXT,
ADD COLUMN     "bank_account_number" TEXT,
ADD COLUMN     "bank_ifsc" CHAR(11),
ADD COLUMN     "bank_name" TEXT;

-- CreateTable
CREATE TABLE "bank_transfer_claims" (
    "id" UUID NOT NULL,
    "donation_intent_id" UUID NOT NULL,
    "utr" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transfer_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_exceptions" (
    "id" UUID NOT NULL,
    "kind" "PaymentExceptionKind" NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "donation_intent_id" UUID,
    "bank_transfer_record_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "resolved_by_id" UUID,
    "resolution" TEXT,

    CONSTRAINT "payment_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_transfer_claims_utr_idx" ON "bank_transfer_claims"("utr");

-- CreateIndex
CREATE INDEX "bank_transfer_claims_donation_intent_id_idx" ON "bank_transfer_claims"("donation_intent_id");

-- CreateIndex
CREATE INDEX "payment_exceptions_status_created_at_idx" ON "payment_exceptions"("status", "created_at");

-- AddForeignKey
ALTER TABLE "bank_transfer_records" ADD CONSTRAINT "bank_transfer_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transfer_claims" ADD CONSTRAINT "bank_transfer_claims_donation_intent_id_fkey" FOREIGN KEY ("donation_intent_id") REFERENCES "donation_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_donation_intent_id_fkey" FOREIGN KEY ("donation_intent_id") REFERENCES "donation_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_bank_transfer_record_id_fkey" FOREIGN KEY ("bank_transfer_record_id") REFERENCES "bank_transfer_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Bank transfer rules (#25). No live data exists yet. ──────────────────────────────────
ALTER TABLE "bank_transfer_records" ADD CONSTRAINT "bank_transfer_records_evidence_present"
  CHECK (char_length(btrim("evidence")) BETWEEN 3 AND 300);
ALTER TABLE "bank_transfer_records" ADD CONSTRAINT "bank_transfer_records_decision_reason"
  CHECK ("status" = 'REPORTED' OR char_length(btrim(coalesce("decision_reason", ''))) >= 5);
ALTER TABLE "bank_transfer_records" ADD CONSTRAINT "bank_transfer_records_reference_format"
  CHECK ("bank_reference" ~ '^[A-Z0-9]{6,30}$');
ALTER TABLE "bank_transfer_claims" ADD CONSTRAINT "bank_transfer_claims_utr_format"
  CHECK ("utr" IS NULL OR "utr" ~ '^[A-Z0-9]{6,30}$');
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_resolution"
  CHECK ("status" = 'OPEN' OR ("resolved_at" IS NOT NULL AND "resolved_by_id" IS NOT NULL AND char_length(btrim(coalesce("resolution", ''))) >= 5));
ALTER TABLE "trust_settings" ADD CONSTRAINT "trust_settings_bank_all_or_none"
  CHECK (("bank_account_name" IS NULL) = ("bank_account_number" IS NULL)
     AND ("bank_account_name" IS NULL) = ("bank_ifsc" IS NULL)
     AND ("bank_account_name" IS NULL) = ("bank_name" IS NULL));
ALTER TABLE "trust_settings" ADD CONSTRAINT "trust_settings_bank_ifsc_format"
  CHECK ("bank_ifsc" IS NULL OR "bank_ifsc" ~ '^[A-Z]{4}0[A-Z0-9]{6}$');
ALTER TABLE "donation_intents" ADD CONSTRAINT "donation_intents_bank_no_fee"
  CHECK ("channel" = 'CHECKOUT' OR "fee_paise" = 0);
