-- Cashfree checkout session (Phase 4): the one-time payment_session_id the browser opens the
-- Cashfree pop-up with. Not a secret (it only pays this one order) and never logged. Kept so a
-- retry with the same Idempotency-Key gets the same session instead of a second order.
-- Reversible: ALTER TABLE "payment_attempts" DROP COLUMN "checkout_session_id";
ALTER TABLE "payment_attempts" ADD COLUMN "checkout_session_id" TEXT;

ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_checkout_session_length"
  CHECK ("checkout_session_id" IS NULL OR char_length("checkout_session_id") BETWEEN 1 AND 512);
