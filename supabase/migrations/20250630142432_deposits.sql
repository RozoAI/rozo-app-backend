-- Schema file for deposits table migration

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Create deposits table
CREATE TABLE IF NOT EXISTS "public"."deposits" (
    "deposit_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "merchant_id" "uuid" NOT NULL,
    "payment_id" character varying NOT NULL,
    "status" "public"."payment_status" NOT NULL,
    "callback_payload" "jsonb",
    "display_currency" character varying NOT NULL,
    "merchant_chain_id" character varying NOT NULL,
    "merchant_address" character varying NOT NULL,
    "required_token" character varying NOT NULL,
    "required_amount_usd" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text") NOT NULL,
    "updated_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text"),
    "source_txn_hash" character varying,
    "source_chain_name" character varying,
    "source_token_address" character varying,
    "source_token_amount" numeric,  
    "display_amount" numeric NOT NULL,
    "number" "text"
);

ALTER TABLE "public"."deposits" OWNER TO "postgres";

-- Primary Key
ALTER TABLE ONLY "public"."deposits"
    ADD CONSTRAINT "deposits_pkey" PRIMARY KEY ("deposit_id");

-- Unique constraints
ALTER TABLE ONLY "public"."deposits"
    ADD CONSTRAINT "deposits_payment_id_key" UNIQUE ("payment_id");

ALTER TABLE ONLY "public"."deposits"
    ADD CONSTRAINT "deposits_source_txn_hash_key" UNIQUE ("source_txn_hash");

ALTER TABLE ONLY "public"."deposits"
    ADD CONSTRAINT "deposits_number_key" UNIQUE ("number");

-- Indexes
CREATE INDEX "deposits_number_idx" ON "public"."deposits" USING "btree" ("number");

-- Foreign Keys
ALTER TABLE ONLY "public"."deposits"
    ADD CONSTRAINT "deposits_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("merchant_id");

ALTER TABLE ONLY "public"."deposits"
    ADD CONSTRAINT "deposits_display_currency_fkey" FOREIGN KEY ("display_currency") REFERENCES "public"."currencies"("currency_id");

-- Row Level Security Policy
CREATE POLICY "crud_access_to_service_role_for_deposits" ON "public"."deposits" TO "service_role" USING (true) WITH CHECK (true);

-- Enable RLS
ALTER TABLE "public"."deposits" ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT ALL ON TABLE "public"."deposits" TO "anon";
GRANT ALL ON TABLE "public"."deposits" TO "authenticated";
GRANT ALL ON TABLE "public"."deposits" TO "service_role";

RESET ALL;
