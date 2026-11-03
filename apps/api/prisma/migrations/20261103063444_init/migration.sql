-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "FundDesignation" AS ENUM ('GENERAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('CREATED', 'PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('RAZORPAY', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "TaxCertificateStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING_TRUST_FILING', 'FORM_113_FILED', 'FORM_114_ISSUED', 'CORRECTION_REQUIRED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ta', 'en');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HelpRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'VERIFYING', 'HELPING', 'CLOSED');

-- CreateEnum
CREATE TYPE "HelpRequestKind" AS ENUM ('FULL', 'CALLBACK');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('CREATED', 'AUTHENTICATED', 'ACTIVE', 'PAUSED', 'HALTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BankTransferStatus" AS ENUM ('REPORTED', 'MATCHED', 'REJECTED');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "auth_provider" TEXT,
    "auth_subject" TEXT,
    "role" "AdminRole" NOT NULL DEFAULT 'STAFF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programmes" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title_ta" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "description_ta" TEXT,
    "description_en" TEXT,
    "designation" "FundDesignation" NOT NULL DEFAULT 'GENERAL',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "programmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_intents" (
    "id" UUID NOT NULL,
    "public_reference" TEXT NOT NULL,
    "programme_id" UUID,
    "amount_paise" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "status" "DonationStatus" NOT NULL DEFAULT 'CREATED',
    "donor_name" TEXT NOT NULL,
    "donor_email" TEXT,
    "donor_phone" TEXT,
    "hide_name_publicly" BOOLEAN NOT NULL DEFAULT true,
    "wants_receipt" BOOLEAN NOT NULL DEFAULT false,
    "wants_tax_certificate" BOOLEAN NOT NULL DEFAULT false,
    "cover_fee" BOOLEAN NOT NULL DEFAULT false,
    "locale" "Locale" NOT NULL DEFAULT 'en',
    "subscription_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "donation_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "donation_intent_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'RAZORPAY',
    "provider_order_id" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "provider_status" TEXT,
    "amount_paise" INTEGER NOT NULL,
    "method" TEXT,
    "captured_paise" INTEGER NOT NULL DEFAULT 0,
    "refunded_paise" INTEGER NOT NULL DEFAULT 0,
    "fee_paise" INTEGER,
    "signature_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'RAZORPAY',
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "processing_status" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "processing_error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_subscriptions" (
    "id" UUID NOT NULL,
    "provider_subscription_id" TEXT NOT NULL,
    "provider_plan_id" TEXT,
    "programme_id" UUID,
    "amount_paise" INTEGER NOT NULL,
    "interval" TEXT NOT NULL DEFAULT 'monthly',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'CREATED',
    "donor_name" TEXT NOT NULL,
    "donor_email" TEXT,
    "donor_phone" TEXT,
    "manage_token_hash" TEXT NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "donation_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_identity_records" (
    "id" UUID NOT NULL,
    "donation_intent_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "address_line" TEXT,
    "pan_ciphertext" BYTEA,
    "pan_key_version" INTEGER,
    "pan_last4" VARCHAR(4),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "donor_identity_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transfer_records" (
    "id" UUID NOT NULL,
    "donation_intent_id" UUID,
    "bank_reference" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "received_on" DATE NOT NULL,
    "status" "BankTransferStatus" NOT NULL DEFAULT 'REPORTED',
    "matched_by_id" UUID,
    "matched_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transfer_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "donation_intent_id" UUID NOT NULL,
    "payment_attempt_id" UUID NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "template_version" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "storage_key" TEXT,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replaces_id" UUID,
    "voided_at" TIMESTAMPTZ(3),

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_certificate_tracking" (
    "id" UUID NOT NULL,
    "donation_intent_id" UUID NOT NULL,
    "financial_year" VARCHAR(7) NOT NULL,
    "status" "TaxCertificateStatus" NOT NULL DEFAULT 'PENDING_TRUST_FILING',
    "form_113_reference" TEXT,
    "form_113_filed_at" TIMESTAMPTZ(3),
    "form_114_reference" TEXT,
    "form_114_issued_on" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_certificate_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_ref" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'en',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_sections" (
    "id" UUID NOT NULL,
    "section_key" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "content" JSONB NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "edited_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impact_metrics" (
    "id" UUID NOT NULL,
    "label_ta" TEXT NOT NULL,
    "label_en" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "value_format" TEXT NOT NULL DEFAULT 'count',
    "evidence_url" TEXT,
    "period_label" TEXT,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "impact_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transparency_documents" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "period_label" TEXT,
    "storage_key" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transparency_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "tax_benefit_enabled" BOOLEAN NOT NULL DEFAULT false,
    "rnpo_reference" TEXT,
    "section_354_approval" TEXT,
    "approval_valid_until" DATE,
    "receipt_min_paise" INTEGER NOT NULL DEFAULT 50000,
    "foreign_donations" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trust_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_requests" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" "HelpRequestKind" NOT NULL DEFAULT 'FULL',
    "status" "HelpRequestStatus" NOT NULL DEFAULT 'NEW',
    "for_whom" TEXT,
    "help_type" TEXT,
    "description" TEXT,
    "contact_phone" TEXT NOT NULL,
    "via_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "locale" "Locale" NOT NULL DEFAULT 'ta',
    "best_time" TEXT,
    "person_name" TEXT,
    "person_village" TEXT,
    "consent_at" TIMESTAMPTZ(3) NOT NULL,
    "assignee_id" UUID,
    "remind_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "help_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_request_notes" (
    "id" UUID NOT NULL,
    "help_request_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_request_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "reason" TEXT,
    "changed_fields" TEXT[],
    "correlation_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_auth_provider_auth_subject_key" ON "admin_users"("auth_provider", "auth_subject");

-- CreateIndex
CREATE UNIQUE INDEX "programmes_slug_key" ON "programmes"("slug");

-- CreateIndex
CREATE INDEX "programmes_active_sort_order_idx" ON "programmes"("active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "donation_intents_public_reference_key" ON "donation_intents"("public_reference");

-- CreateIndex
CREATE INDEX "donation_intents_status_created_at_idx" ON "donation_intents"("status", "created_at");

-- CreateIndex
CREATE INDEX "donation_intents_programme_id_created_at_idx" ON "donation_intents"("programme_id", "created_at");

-- CreateIndex
CREATE INDEX "donation_intents_created_at_idx" ON "donation_intents"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_provider_order_id_key" ON "payment_attempts"("provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_provider_payment_id_key" ON "payment_attempts"("provider_payment_id");

-- CreateIndex
CREATE INDEX "payment_attempts_donation_intent_id_idx" ON "payment_attempts"("donation_intent_id");

-- CreateIndex
CREATE INDEX "webhook_events_processing_status_received_at_idx" ON "webhook_events"("processing_status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_provider_event_id_key" ON "webhook_events"("provider", "provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "donation_subscriptions_provider_subscription_id_key" ON "donation_subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "donation_subscriptions_manage_token_hash_key" ON "donation_subscriptions"("manage_token_hash");

-- CreateIndex
CREATE INDEX "donation_subscriptions_status_idx" ON "donation_subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "donor_identity_records_donation_intent_id_key" ON "donor_identity_records"("donation_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transfer_records_bank_reference_key" ON "bank_transfer_records"("bank_reference");

-- CreateIndex
CREATE INDEX "bank_transfer_records_status_idx" ON "bank_transfer_records"("status");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_payment_attempt_id_key" ON "receipts"("payment_attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receipt_number_key" ON "receipts"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_token_hash_key" ON "receipts"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_replaces_id_key" ON "receipts"("replaces_id");

-- CreateIndex
CREATE INDEX "receipts_donation_intent_id_idx" ON "receipts"("donation_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_certificate_tracking_donation_intent_id_key" ON "tax_certificate_tracking"("donation_intent_id");

-- CreateIndex
CREATE INDEX "tax_certificate_tracking_financial_year_status_idx" ON "tax_certificate_tracking"("financial_year", "status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_dedupe_key_key" ON "notification_outbox"("dedupe_key");

-- CreateIndex
CREATE INDEX "notification_outbox_status_next_attempt_at_idx" ON "notification_outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "content_sections_section_key_locale_status_idx" ON "content_sections"("section_key", "locale", "status");

-- CreateIndex
CREATE UNIQUE INDEX "content_sections_section_key_locale_version_key" ON "content_sections"("section_key", "locale", "version");

-- CreateIndex
CREATE INDEX "impact_metrics_status_sort_order_idx" ON "impact_metrics"("status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "transparency_documents_storage_key_key" ON "transparency_documents"("storage_key");

-- CreateIndex
CREATE INDEX "transparency_documents_status_locale_idx" ON "transparency_documents"("status", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "help_requests_reference_key" ON "help_requests"("reference");

-- CreateIndex
CREATE INDEX "help_requests_status_created_at_idx" ON "help_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "help_requests_help_type_locale_idx" ON "help_requests"("help_type", "locale");

-- CreateIndex
CREATE INDEX "help_request_notes_help_request_id_created_at_idx" ON "help_request_notes"("help_request_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "donation_intents" ADD CONSTRAINT "donation_intents_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_intents" ADD CONSTRAINT "donation_intents_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "donation_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_donation_intent_id_fkey" FOREIGN KEY ("donation_intent_id") REFERENCES "donation_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_subscriptions" ADD CONSTRAINT "donation_subscriptions_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_identity_records" ADD CONSTRAINT "donor_identity_records_donation_intent_id_fkey" FOREIGN KEY ("donation_intent_id") REFERENCES "donation_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transfer_records" ADD CONSTRAINT "bank_transfer_records_donation_intent_id_fkey" FOREIGN KEY ("donation_intent_id") REFERENCES "donation_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transfer_records" ADD CONSTRAINT "bank_transfer_records_matched_by_id_fkey" FOREIGN KEY ("matched_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_donation_intent_id_fkey" FOREIGN KEY ("donation_intent_id") REFERENCES "donation_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_replaces_id_fkey" FOREIGN KEY ("replaces_id") REFERENCES "receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_certificate_tracking" ADD CONSTRAINT "tax_certificate_tracking_donation_intent_id_fkey" FOREIGN KEY ("donation_intent_id") REFERENCES "donation_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_request_notes" ADD CONSTRAINT "help_request_notes_help_request_id_fkey" FOREIGN KEY ("help_request_id") REFERENCES "help_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_request_notes" ADD CONSTRAINT "help_request_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Constraints Prisma cannot express (standard PostgreSQL CHECKs) ────────────────────────
-- Money is integer paise and never negative; a donation is at least ₹1 (100 paise).
ALTER TABLE "donation_intents" ADD CONSTRAINT "donation_intents_amount_min" CHECK ("amount_paise" >= 100);
ALTER TABLE "donation_intents" ADD CONSTRAINT "donation_intents_currency_inr" CHECK ("currency" = 'INR');
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_amounts_valid"
  CHECK ("amount_paise" >= 100 AND "captured_paise" >= 0 AND "refunded_paise" >= 0
         AND "captured_paise" <= "amount_paise" AND "refunded_paise" <= "captured_paise"
         AND ("fee_paise" IS NULL OR "fee_paise" >= 0));
ALTER TABLE "donation_subscriptions" ADD CONSTRAINT "donation_subscriptions_amount_min" CHECK ("amount_paise" >= 100);
ALTER TABLE "bank_transfer_records" ADD CONSTRAINT "bank_transfer_records_amount_min" CHECK ("amount_paise" >= 100);
ALTER TABLE "bank_transfer_records" ADD CONSTRAINT "bank_transfer_records_match_evidence"
  CHECK ("status" <> 'MATCHED' OR ("donation_intent_id" IS NOT NULL AND "matched_by_id" IS NOT NULL AND "matched_at" IS NOT NULL));
ALTER TABLE "trust_settings" ADD CONSTRAINT "trust_settings_singleton" CHECK ("id" = 1);
ALTER TABLE "trust_settings" ADD CONSTRAINT "trust_settings_receipt_min" CHECK ("receipt_min_paise" >= 100);
ALTER TABLE "tax_certificate_tracking" ADD CONSTRAINT "tax_certificate_tracking_fy_format"
  CHECK ("financial_year" ~ '^[0-9]{4}-[0-9]{2}$');
-- Form 114 is never marked issued without its reference and date.
ALTER TABLE "tax_certificate_tracking" ADD CONSTRAINT "tax_certificate_tracking_form114_evidence"
  CHECK ("status" <> 'FORM_114_ISSUED' OR ("form_114_reference" IS NOT NULL AND "form_114_issued_on" IS NOT NULL));
ALTER TABLE "tax_certificate_tracking" ADD CONSTRAINT "tax_certificate_tracking_form113_evidence"
  CHECK ("status" NOT IN ('FORM_113_FILED', 'FORM_114_ISSUED') OR "form_113_reference" IS NOT NULL);
ALTER TABLE "donor_identity_records" ADD CONSTRAINT "donor_identity_records_pan_pair"
  CHECK (("pan_ciphertext" IS NULL) = ("pan_key_version" IS NULL));
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_not_self_replacing" CHECK ("replaces_id" IS NULL OR "replaces_id" <> "id");
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_retry_count" CHECK ("retry_count" >= 0);
ALTER TABLE "transparency_documents" ADD CONSTRAINT "transparency_documents_file_size" CHECK ("file_size" > 0);
ALTER TABLE "impact_metrics" ADD CONSTRAINT "impact_metrics_published_evidence"
  CHECK ("status" <> 'PUBLISHED' OR ("evidence_url" IS NOT NULL AND "approved_at" IS NOT NULL));

-- ── Audit log is append-only: UPDATE and DELETE are refused for every role ────────────────
CREATE FUNCTION "audit_logs_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER "audit_logs_no_update_delete" BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_append_only"();
