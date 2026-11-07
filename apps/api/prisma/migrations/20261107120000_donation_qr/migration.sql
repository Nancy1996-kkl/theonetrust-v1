-- AlterTable
ALTER TABLE "payment_attempts" ADD COLUMN     "qr_expires_at" TIMESTAMPTZ(3),
ADD COLUMN     "qr_image_url" TEXT;

-- A QR attempt carries both its image link and its expiry, or neither.
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_qr_fields"
  CHECK (("qr_image_url" IS NULL) = ("qr_expires_at" IS NULL));
