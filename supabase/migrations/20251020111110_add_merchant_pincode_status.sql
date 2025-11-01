-- Migration: Add PIN code and merchant status fields
-- This migration adds PIN code functionality and merchant status management

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

-- Add PIN code and status fields to merchants table
ALTER TABLE "public"."merchants" ADD COLUMN IF NOT EXISTS "pin_code_hash" TEXT;
ALTER TABLE "public"."merchants" ADD COLUMN IF NOT EXISTS "pin_code_attempts" INTEGER DEFAULT 0;
ALTER TABLE "public"."merchants" ADD COLUMN IF NOT EXISTS "pin_code_blocked_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "public"."merchants" ADD COLUMN IF NOT EXISTS "pin_code_last_attempt_at" TIMESTAMP WITH TIME ZONE;

-- Add status column with check constraint conditionally
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'merchants' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE "public"."merchants" ADD COLUMN "status" TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'PIN_BLOCKED'));
    END IF;
END $$;

RESET ALL;


