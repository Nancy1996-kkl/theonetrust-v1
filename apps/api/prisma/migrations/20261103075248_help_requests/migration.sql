/*
  Warnings:

  - You are about to drop the column `help_type` on the `help_requests` table. All the data in the column will be lost.
  - You are about to drop the column `person_name` on the `help_requests` table. All the data in the column will be lost.
  - You are about to drop the column `person_village` on the `help_requests` table. All the data in the column will be lost.
  - You are about to drop the column `via_whatsapp` on the `help_requests` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "help_requests_help_type_locale_idx";

-- AlterTable
ALTER TABLE "help_requests" DROP COLUMN "help_type",
DROP COLUMN "person_name",
DROP COLUMN "person_village",
DROP COLUMN "via_whatsapp",
ADD COLUMN     "help_types" TEXT[],
ADD COLUMN     "page_locale" "Locale" NOT NULL DEFAULT 'ta',
ADD COLUMN     "person_name_or_village" TEXT,
ADD COLUMN     "third_party_consent_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "help_requests_locale_created_at_idx" ON "help_requests"("locale", "created_at");

-- CreateIndex
CREATE INDEX "help_requests_contact_phone_created_at_idx" ON "help_requests"("contact_phone", "created_at");

-- ── Rules for help requests (plan §5). No live data exists yet (issue #22). ──────────────
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_reference_format"
  CHECK ("reference" ~ '^HLP-[0-9A-HJ-NP-Z]{4,8}$');
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_phone_e164_in"
  CHECK ("contact_phone" ~ '^\+91[6-9][0-9]{9}$');
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_description_length"
  CHECK ("description" IS NULL OR char_length("description") <= 500);
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_person_length"
  CHECK ("person_name_or_village" IS NULL OR char_length("person_name_or_village") <= 80);
-- Asking for someone else needs their consent recorded; a call-back has no wizard fields.
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_third_party_consent"
  CHECK ("for_whom" IS NULL OR "for_whom" = 'self' OR "third_party_consent_at" IS NOT NULL);
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_kind_fields"
  CHECK ("kind" = 'FULL' OR ("for_whom" IS NULL AND "description" IS NULL AND "person_name_or_village" IS NULL));
ALTER TABLE "help_request_notes" ADD CONSTRAINT "help_request_notes_body_length"
  CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000);
