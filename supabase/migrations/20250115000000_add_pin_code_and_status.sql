-- Migration: Add PIN code and merchant status fields
-- This migration adds PIN code functionality and merchant status management

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Add PIN code and status fields to merchants table
ALTER TABLE "public"."merchants" ADD COLUMN "pin_code_hash" TEXT;
ALTER TABLE "public"."merchants" ADD COLUMN "pin_code_attempts" INTEGER DEFAULT 0;
ALTER TABLE "public"."merchants" ADD COLUMN "pin_code_blocked_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "public"."merchants" ADD COLUMN "pin_code_last_attempt_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "public"."merchants" ADD COLUMN "status" TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'PIN_BLOCKED'));

-- Create PIN code audit log table
CREATE TABLE IF NOT EXISTS "public"."merchant_pin_audit_log" (
    "audit_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "merchant_id" "uuid" NOT NULL,
    "action" "text" NOT NULL CHECK (action IN ('SET', 'UPDATE', 'REVOKE', 'VALIDATE_SUCCESS', 'VALIDATE_FAILED', 'BLOCKED')),
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT ("now"() AT TIME ZONE 'utc'::"text") NOT NULL
);

ALTER TABLE "public"."merchant_pin_audit_log" OWNER TO "postgres";

-- Primary Key for audit log
ALTER TABLE ONLY "public"."merchant_pin_audit_log"
    ADD CONSTRAINT "merchant_pin_audit_log_pkey" PRIMARY KEY ("audit_id");

-- Foreign Key for audit log
ALTER TABLE ONLY "public"."merchant_pin_audit_log"
    ADD CONSTRAINT "merchant_pin_audit_log_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("merchant_id");

-- Indexes for performance
CREATE INDEX "merchant_pin_audit_log_merchant_id_idx" ON "public"."merchant_pin_audit_log" USING "btree" ("merchant_id");
CREATE INDEX "merchant_pin_audit_log_action_idx" ON "public"."merchant_pin_audit_log" USING "btree" ("action");
CREATE INDEX "merchant_pin_audit_log_created_at_idx" ON "public"."merchant_pin_audit_log" USING "btree" ("created_at");

-- Row Level Security Policy for audit log
CREATE POLICY "crud_access_to_service_role_for_merchant_pin_audit_log" ON "public"."merchant_pin_audit_log" TO "service_role" USING (true) WITH CHECK (true);

-- Enable RLS for audit log
ALTER TABLE "public"."merchant_pin_audit_log" ENABLE ROW LEVEL SECURITY;

-- Grants for audit log
GRANT ALL ON TABLE "public"."merchant_pin_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."merchant_pin_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."merchant_pin_audit_log" TO "service_role";

RESET ALL;
