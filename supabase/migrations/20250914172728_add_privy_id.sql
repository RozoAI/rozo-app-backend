-- Add new column privy_id (nullable by default)
ALTER TABLE IF EXISTS public.merchants
ADD COLUMN privy_id TEXT;

-- Make existing column dynamic_id nullable
ALTER TABLE IF EXISTS public.merchants
ALTER COLUMN dynamic_id DROP NOT NULL;
