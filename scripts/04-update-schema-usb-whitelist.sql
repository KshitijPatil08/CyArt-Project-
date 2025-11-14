-- Update schema for USB whitelisting, server tracking, and enhanced alerts

-- Add missing columns to logs table
ALTER TABLE logs ADD COLUMN IF NOT EXISTS hardware_type TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS event TEXT;

-- Create device_events table if it doesn't exist
CREATE TABLE IF NOT EXISTS device_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  device_name TEXT,
  host_name TEXT,
  device_category TEXT NOT NULL, -- USB, MOUSE, PRINTER, KEYBOARD, CHARGER
  event TEXT NOT NULL, -- connected, disconnected
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create USB whitelist table
CREATE TABLE IF NOT EXISTS authorized_usb_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number TEXT UNIQUE NOT NULL,
  vendor_id TEXT,
  product_id TEXT,
  device_name TEXT NOT NULL,
  vendor_name TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add server flag to devices table
ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_server BOOLEAN DEFAULT FALSE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES devices(id) ON DELETE SET NULL;

-- Update alerts table to use proper severity levels
-- Severity: 'low', 'moderate', 'high', 'critical'
-- The schema already has this, but we'll ensure consistency

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_device_events_device_id ON device_events(device_id);
CREATE INDEX IF NOT EXISTS idx_device_events_timestamp ON device_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_authorized_usb_serial ON authorized_usb_devices(serial_number);
CREATE INDEX IF NOT EXISTS idx_authorized_usb_active ON authorized_usb_devices(is_active);
CREATE INDEX IF NOT EXISTS idx_devices_is_server ON devices(is_server);
CREATE INDEX IF NOT EXISTS idx_devices_server_id ON devices(server_id);

-- Enable RLS for new tables
ALTER TABLE device_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorized_usb_devices ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can read all data" ON device_events FOR SELECT USING (true);
CREATE POLICY "Users can read all data" ON authorized_usb_devices FOR SELECT USING (true);
CREATE POLICY "Service role can manage authorized_usb_devices" ON authorized_usb_devices FOR ALL USING (true);

