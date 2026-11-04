-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "amount_paise" INTEGER NOT NULL,
ADD COLUMN     "bank_transfer_record_id" UUID,
ADD COLUMN     "token_salt" TEXT NOT NULL,
ADD COLUMN     "void_reason" TEXT,
ALTER COLUMN "payment_attempt_id" DROP NOT NULL,
ALTER COLUMN "token_hash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "trust_settings" ADD COLUMN     "legal_name" TEXT,
ADD COLUMN     "registration_text" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "receipts_bank_transfer_record_id_key" ON "receipts"("bank_transfer_record_id");

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_bank_transfer_record_id_fkey" FOREIGN KEY ("bank_transfer_record_id") REFERENCES "bank_transfer_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Hand-written rules (#29) ──────────────────────────────────────────────────────────────
-- An original receipt names exactly one verified source (Razorpay payment or confirmed bank
-- transfer); a correction names none and points at the receipt it replaces.
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_one_source" CHECK (
  ("replaces_id" IS NULL AND (("payment_attempt_id" IS NULL) <> ("bank_transfer_record_id" IS NULL)))
  OR ("replaces_id" IS NOT NULL AND "payment_attempt_id" IS NULL AND "bank_transfer_record_id" IS NULL)
);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_amount_positive" CHECK ("amount_paise" > 0);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_void_reason" CHECK (
  ("voided_at" IS NULL AND "void_reason" IS NULL)
  OR ("voided_at" IS NOT NULL AND "void_reason" IN ('REFUNDED', 'CORRECTED'))
);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_number_format" CHECK (
  "receipt_number" ~ '^TOT-R-[0-9]{4}-[0-9]{2}-[0-9]{6,}$'
);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_token_salt_length" CHECK (length("token_salt") >= 22);

-- Receipt numbers: one gap-tolerant sequence, formatted with the financial year by the API.
CREATE SEQUENCE "receipt_number_seq" START 1;

-- Receipts are evidence: never deleted (refunds and corrections add rows instead).
CREATE FUNCTION "receipts_no_delete"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'receipts are never deleted';
END;
$$;
CREATE TRIGGER "receipts_no_delete" BEFORE DELETE ON "receipts"
  FOR EACH ROW EXECUTE FUNCTION "receipts_no_delete"();
