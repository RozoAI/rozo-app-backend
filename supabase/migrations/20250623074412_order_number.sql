-- Add order number column to orders table

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
-- Add number column to orders table
ALTER TABLE "public"."orders" 
ADD COLUMN IF NOT EXISTS "number" "text";
-- Add unique constraint for order number
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'orders_number_key'
    ) THEN
        ALTER TABLE ONLY "public"."orders"
            ADD CONSTRAINT "orders_number_key" UNIQUE ("number");
    END IF;
END $$;
-- Create index for order number
CREATE INDEX IF NOT EXISTS "orders_number_idx" ON "public"."orders" USING "btree" ("number");
RESET ALL;
