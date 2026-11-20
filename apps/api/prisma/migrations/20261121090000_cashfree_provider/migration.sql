-- Cashfree as a payment gateway (Phase 4a of docs/decisions/2026-11-20-cashfree-migration-plan.md).
-- IRREVERSIBLE: PostgreSQL cannot drop an enum value without rebuilding the type. Kept in its own
-- migration because a new enum value cannot be used in the transaction that adds it.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'CASHFREE';
