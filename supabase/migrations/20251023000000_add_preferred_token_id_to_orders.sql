-- Migration: Add preferred_token_id to orders table
-- This allows users to specify their preferred payment token when creating orders

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Add preferred_token_id column to orders table
ALTER TABLE "public"."orders"
  ADD COLUMN IF NOT EXISTS "preferred_token_id" text;

-- Add foreign key constraint to tokens table
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'orders_preferred_token_id_fkey'
    ) THEN
        ALTER TABLE "public"."orders"
            ADD CONSTRAINT "orders_preferred_token_id_fkey"
            FOREIGN KEY ("preferred_token_id")
            REFERENCES "public"."tokens"("token_id")
            ON DELETE SET NULL;
    END IF;
END $$;

-- Create index for preferred_token_id queries
CREATE INDEX IF NOT EXISTS "orders_preferred_token_id_idx" ON "public"."orders" USING "btree" ("preferred_token_id");

RESET ALL;

