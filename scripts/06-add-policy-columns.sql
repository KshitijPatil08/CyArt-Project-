-- Add USB Policy Columns to Devices Table
-- Run this in Supabase SQL Editor

-- Add policy columns to devices table
ALTER TABLE devices 
ADD COLUMN IF NOT EXISTS usb_read_only BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS usb_data_limit_mb FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS usb_expiration_date TIMESTAMP;

-- Add comment for documentation
COMMENT ON COLUMN devices.usb_read_only IS 'Global read-only mode for all USB devices on this computer';
COMMENT ON COLUMN devices.usb_data_limit_mb IS 'Global data transfer limit in MB for USB devices';
COMMENT ON COLUMN devices.usb_expiration_date IS 'Expiration date for USB access on this device';

-- Create index for faster policy queries
CREATE INDEX IF NOT EXISTS idx_devices_usb_policies ON devices(usb_read_only, usb_data_limit_mb);
