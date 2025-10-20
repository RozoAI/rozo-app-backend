-- Schema file for Supabase migration
-- This file contains only the database structure (tables, types, constraints, policies)

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
COMMENT ON SCHEMA "public" IS 'standard public schema';
-- Extensions
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
-- Custom Types
CREATE TYPE "public"."payment_status" AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
    'DISCREPANCY'
);
ALTER TYPE "public"."payment_status" OWNER TO "postgres";
SET default_tablespace = '';
SET default_table_access_method = "heap";
-- Tables
CREATE TABLE IF NOT EXISTS "public"."currencies" (
    "currency_id" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "usd_price" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text") NOT NULL,
    "updated_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text") NOT NULL
);
ALTER TABLE "public"."currencies" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."languages" (
    "language_id" character varying NOT NULL,
    "display_name" character varying NOT NULL
);
ALTER TABLE "public"."languages" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."merchants" (
    "merchant_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dynamic_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text",
    "description" "text",
    "logo_url" "text",
    "wallet_address" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text") NOT NULL,
    "updated_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text") NOT NULL,
    "default_currency" character varying NOT NULL,
    "default_token_id" character varying NOT NULL,
    "default_language" character varying NOT NULL
);
ALTER TABLE "public"."merchants" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."orders" (
    "order_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
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
    "description" "text",
    "display_amount" numeric NOT NULL
);
ALTER TABLE "public"."orders" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."tokens" (
    "token_id" character varying NOT NULL,
    "token_name" character varying NOT NULL,
    "token_address" character varying NOT NULL,
    "chain_id" character varying NOT NULL,
    "chain_name" character varying NOT NULL
);
ALTER TABLE "public"."tokens" OWNER TO "postgres";
-- Primary Keys
ALTER TABLE ONLY "public"."currencies"
    ADD CONSTRAINT "currencies_pkey" PRIMARY KEY ("currency_id");
ALTER TABLE ONLY "public"."languages"
    ADD CONSTRAINT "languages_pkey" PRIMARY KEY ("language_id");
ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_dynamic_id_key" UNIQUE ("dynamic_id");
ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_email_key" UNIQUE ("email");
ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_pkey" PRIMARY KEY ("merchant_id");
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_payment_id_key" UNIQUE ("payment_id");
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id");
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_source_txn_hash_key" UNIQUE ("source_txn_hash");
ALTER TABLE ONLY "public"."tokens"
    ADD CONSTRAINT "tokens_pkey" PRIMARY KEY ("token_id");
-- Indexes
CREATE INDEX "merchants_dynamic_id_idx" ON "public"."merchants" USING "btree" ("dynamic_id");
-- Foreign Keys
ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_default_currency_fkey" FOREIGN KEY ("default_currency") REFERENCES "public"."currencies"("currency_id");
ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_default_language_fkey" FOREIGN KEY ("default_language") REFERENCES "public"."languages"("language_id");
ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_default_token_id_fkey" FOREIGN KEY ("default_token_id") REFERENCES "public"."tokens"("token_id");
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_display_currency_fkey" FOREIGN KEY ("display_currency") REFERENCES "public"."currencies"("currency_id");
-- Row Level Security Policies
CREATE POLICY "crud_access_to_service_role_for_currencies" ON "public"."currencies" TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "crud_access_to_service_role_for_languages" ON "public"."languages" TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "crud_access_to_service_role_for_merchants" ON "public"."merchants" TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "crud_access_to_service_role_for_orders" ON "public"."orders" TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "crud_access_to_service_role_for_tokens" ON "public"."tokens" TO "service_role" USING (true) WITH CHECK (true);
-- Enable RLS
ALTER TABLE "public"."currencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."languages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."merchants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tokens" ENABLE ROW LEVEL SECURITY;
-- Publications
ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";
-- Grants
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT ALL ON TABLE "public"."currencies" TO "anon";
GRANT ALL ON TABLE "public"."currencies" TO "authenticated";
GRANT ALL ON TABLE "public"."currencies" TO "service_role";
GRANT ALL ON TABLE "public"."languages" TO "anon";
GRANT ALL ON TABLE "public"."languages" TO "authenticated";
GRANT ALL ON TABLE "public"."languages" TO "service_role";
GRANT ALL ON TABLE "public"."merchants" TO "anon";
GRANT ALL ON TABLE "public"."merchants" TO "authenticated";
GRANT ALL ON TABLE "public"."merchants" TO "service_role";
GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";
GRANT ALL ON TABLE "public"."tokens" TO "anon";
GRANT ALL ON TABLE "public"."tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."tokens" TO "service_role";
-- Default Privileges
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
RESET ALL;
