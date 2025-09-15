-- Migration: Add expired_at, payment_data, and EXPIRED status to orders
-- This migration consolidates order expiration enhancements and status improvements

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Step 1: Add EXPIRED to payment_status enum
-- This allows us to distinguish between failed payments and expired orders
ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- Step 2: Add new columns to orders table
ALTER TABLE "public"."orders"
  ADD COLUMN IF NOT EXISTS "expired_at" timestamp with time zone;

ALTER TABLE "public"."orders"
  ADD COLUMN IF NOT EXISTS "payment_data" jsonb;

-- Step 6: Create indexes to improve queries by expiration and status
CREATE INDEX IF NOT EXISTS "orders_expired_at_idx" ON "public"."orders" USING "btree" ("expired_at");
CREATE INDEX IF NOT EXISTS "orders_status_expired_idx" ON "public"."orders" USING "btree" ("status", "expired_at");

RESET ALL;
