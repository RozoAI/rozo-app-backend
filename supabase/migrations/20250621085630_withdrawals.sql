-- Schema file for withdrawals table migration

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
-- Create withdrawals table
CREATE TABLE IF NOT EXISTS "public"."withdrawals" (
    "withdrawal_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "merchant_id" "uuid" NOT NULL,
    "currency" "text" NOT NULL DEFAULT 'USDC_BASE',
    "tx_hash" "text",
    "created_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text") NOT NULL,
    "updated_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text") NOT NULL
);
ALTER TABLE "public"."withdrawals" OWNER TO "postgres";
-- Primary Key
ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("withdrawal_id");
-- Unique constraint for tx_hash
ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_tx_hash_key" UNIQUE ("tx_hash");
-- Foreign Key
ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("merchant_id");
-- Row Level Security Policy
CREATE POLICY "crud_access_to_service_role_for_withdrawals" ON "public"."withdrawals" TO "service_role" USING (true) WITH CHECK (true);
-- Enable RLS
ALTER TABLE "public"."withdrawals" ENABLE ROW LEVEL SECURITY;
-- Grants
GRANT ALL ON TABLE "public"."withdrawals" TO "anon";
GRANT ALL ON TABLE "public"."withdrawals" TO "authenticated";
GRANT ALL ON TABLE "public"."withdrawals" TO "service_role";
RESET ALL;
