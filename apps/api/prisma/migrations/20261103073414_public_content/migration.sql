/*
  Warnings:

  - You are about to drop the column `period_label` on the `impact_metrics` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "impact_metrics" DROP COLUMN "period_label",
ADD COLUMN     "as_of" DATE,
ADD COLUMN     "period_en" TEXT,
ADD COLUMN     "period_ta" TEXT,
ADD COLUMN     "source_en" TEXT,
ADD COLUMN     "source_ta" TEXT;

-- ── Publishing rules (spec §4.7): nothing public without its evidence ────────────────────
-- No live data exists yet (issue #21); the old free-text period column is replaced by
-- bilingual source/period and an "as of" date.
ALTER TABLE "impact_metrics" DROP CONSTRAINT "impact_metrics_published_evidence";
ALTER TABLE "impact_metrics" ADD CONSTRAINT "impact_metrics_published_evidence"
  CHECK ("status" <> 'PUBLISHED' OR (
    NULLIF(btrim("source_ta"), '') IS NOT NULL AND NULLIF(btrim("source_en"), '') IS NOT NULL AND
    NULLIF(btrim("period_ta"), '') IS NOT NULL AND NULLIF(btrim("period_en"), '') IS NOT NULL AND
    "as_of" IS NOT NULL AND "approved_at" IS NOT NULL));
ALTER TABLE "impact_metrics" ADD CONSTRAINT "impact_metrics_value_non_negative" CHECK ("value" >= 0);
ALTER TABLE "transparency_documents" ADD CONSTRAINT "transparency_documents_published_approved"
  CHECK ("status" <> 'PUBLISHED' OR "approved_at" IS NOT NULL);
