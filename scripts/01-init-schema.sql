-- Create tables for device tracking system

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'viewer', -- admin, viewer, operator
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Devices table (computers, servers, etc.)
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL, -- 'windows', 'linux', 'mac'
  owner TEXT,
  location TEXT,
  ip_address TEXT,
  hostname TEXT,
  os_version TEXT,
  agent_version TEXT,
  status TEXT DEFAULT 'offline', -- 'online', 'offline', 'error'
  last_seen TIMESTAMP,
  security_status TEXT DEFAULT 'unknown', -- 'secure', 'warning', 'critical'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- USB Devices table (peripherals connected to devices)
CREATE TABLE IF NOT EXISTS usb_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  usb_name TEXT NOT NULL,
  usb_vendor TEXT,
  usb_product_id TEXT,
  usb_vendor_id TEXT,
  device_type TEXT NOT NULL, -- 'usb_drive', 'printer', 'mouse', 'keyboard', 'external_drive', 'other'
  serial_number TEXT,
  insertion_time TIMESTAMP NOT NULL,
  removal_time TIMESTAMP,
  status TEXT DEFAULT 'connected', -- 'connected', 'disconnected'
  data_transferred_mb FLOAT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Logs table (all system, application, security logs)
CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  log_type TEXT NOT NULL, -- 'system', 'application', 'security', 'network', 'usb'
  source TEXT, -- 'Windows Event Log', 'syslog', 'auth.log', etc.
  severity TEXT DEFAULT 'info', -- 'debug', 'info', 'warning', 'error', 'critical'
  message TEXT NOT NULL,
  event_code TEXT,
  event_id TEXT,
  timestamp TIMESTAMP NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Alerts table (security alerts and notifications)
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'usb_connection', 'security_event', 'suspicious_activity', 'offline'
  severity TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
  title TEXT NOT NULL,
  description TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  is_resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit trail table (track data transfers and access)
CREATE TABLE IF NOT EXISTS audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  usb_device_id UUID REFERENCES usb_devices(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'file_read', 'file_write', 'file_delete', 'usb_mount', 'usb_unmount'
  file_path TEXT,
  file_size_mb FLOAT,
  data_transferred_mb FLOAT,
  user_name TEXT,
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_devices_security_status ON devices(security_status);
CREATE INDEX idx_usb_devices_device_id ON usb_devices(device_id);
CREATE INDEX idx_usb_devices_status ON usb_devices(status);
CREATE INDEX idx_logs_device_id ON logs(device_id);
CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_severity ON logs(severity);
CREATE INDEX idx_alerts_device_id ON alerts(device_id);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_is_read ON alerts(is_read);
CREATE INDEX idx_audit_trail_device_id ON audit_trail(device_id);
CREATE INDEX idx_audit_trail_timestamp ON audit_trail(timestamp);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE usb_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow authenticated users to read all data)
CREATE POLICY "Users can read all data" ON devices FOR SELECT USING (true);
CREATE POLICY "Users can read all data" ON usb_devices FOR SELECT USING (true);
CREATE POLICY "Users can read all data" ON logs FOR SELECT USING (true);
CREATE POLICY "Users can read all data" ON alerts FOR SELECT USING (true);
CREATE POLICY "Users can read all data" ON audit_trail FOR SELECT USING (true);
