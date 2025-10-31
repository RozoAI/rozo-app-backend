-- Create merchant_devices table for FCM token management
-- Supports multiple devices per merchant (one merchant can have multiple devices)
CREATE TABLE merchant_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(merchant_id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  fcm_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One device can only be registered once per merchant
  UNIQUE(device_id, merchant_id)
);

-- Index for faster lookups by merchant_id
CREATE INDEX idx_merchant_devices_merchant_id ON merchant_devices(merchant_id);

-- Enable Row Level Security
ALTER TABLE merchant_devices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Note: Edge Functions use service role key which bypasses RLS,
-- but these policies are here for security if accessed via other means

CREATE POLICY "Merchants can view own devices"
ON merchant_devices FOR SELECT
USING (merchant_id = auth.uid());

CREATE POLICY "Merchants can insert own devices"
ON merchant_devices FOR INSERT
WITH CHECK (merchant_id = auth.uid());

CREATE POLICY "Merchants can update own devices"
ON merchant_devices FOR UPDATE
USING (merchant_id = auth.uid());

CREATE POLICY "Merchants can delete own devices"
ON merchant_devices FOR DELETE
USING (merchant_id = auth.uid());

-- Add comment to table
COMMENT ON TABLE merchant_devices IS 'Stores FCM tokens for push notifications. One merchant can have multiple devices registered.';
