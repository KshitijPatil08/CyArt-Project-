-- Create device credentials table for device authentication
CREATE TABLE IF NOT EXISTS device_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_device_credentials_device_id ON device_credentials(device_id);
CREATE INDEX idx_device_credentials_username ON device_credentials(username);

-- Enable RLS
ALTER TABLE device_credentials ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read credentials
CREATE POLICY "Users can read device credentials" ON device_credentials
  FOR SELECT USING (auth.role() = 'authenticated_user');

-- Allow service role to manage credentials
CREATE POLICY "Service role can manage credentials" ON device_credentials
  FOR ALL USING (auth.role() = 'service_role');
