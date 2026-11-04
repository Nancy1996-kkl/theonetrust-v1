-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "failed_login_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locale" "Locale" NOT NULL DEFAULT 'en',
ADD COLUMN     "locked_until" TIMESTAMPTZ(3),
ADD COLUMN     "totp_enabled_at" TIMESTAMPTZ(3),
ADD COLUMN     "totp_key_version" INTEGER,
ADD COLUMN     "totp_last_step" BIGINT,
ADD COLUMN     "totp_secret_ciphertext" BYTEA;

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "mfa_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_recovery_codes" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_user_id_idx" ON "admin_sessions"("admin_user_id");

-- CreateIndex
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_recovery_codes_code_hash_key" ON "admin_recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "admin_recovery_codes_admin_user_id_idx" ON "admin_recovery_codes"("admin_user_id");

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_recovery_codes" ADD CONSTRAINT "admin_recovery_codes_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Constraints Prisma cannot express ─────────────────────────────────────────────────────
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_totp_pair"
  CHECK (("totp_secret_ciphertext" IS NULL) = ("totp_key_version" IS NULL));
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_totp_enabled_has_secret"
  CHECK ("totp_enabled_at" IS NULL OR "totp_secret_ciphertext" IS NOT NULL);
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_failed_login_count" CHECK ("failed_login_count" >= 0);
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_has_credential"
  CHECK ("password_hash" IS NOT NULL OR ("auth_provider" IS NOT NULL AND "auth_subject" IS NOT NULL));
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_expiry_after_creation" CHECK ("expires_at" > "created_at");
