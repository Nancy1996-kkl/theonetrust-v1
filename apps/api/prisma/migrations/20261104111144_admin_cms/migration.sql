-- AlterTable
ALTER TABLE "transparency_documents" ADD COLUMN     "sha256" CHAR(64),
ADD COLUMN     "uploaded_by_id" UUID;

-- AlterTable
ALTER TABLE "trust_settings" ADD COLUMN     "owner_email" TEXT;

-- A stored file hash is always 64 lowercase hex characters.
ALTER TABLE "transparency_documents" ADD CONSTRAINT "transparency_documents_sha256_hex"
  CHECK ("sha256" IS NULL OR "sha256" ~ '^[0-9a-f]{64}$');
