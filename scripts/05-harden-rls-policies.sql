-- 05-harden-rls-policies.sql
-- CRITICAL SECURITY UPDATE: Enforce Row-Level Security for Data Isolation

-- 1. Helper Functions
-- Get current user email from auth schema
CREATE OR REPLACE FUNCTION public.get_auth_email()
RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT email FROM auth.users WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Cleanup (Drop all permissive policies)
DROP POLICY IF EXISTS "Users can read all data" ON devices;
DROP POLICY IF EXISTS "Authenticated users can read devices" ON devices;
DROP POLICY IF EXISTS "Users can read all data" ON logs;
DROP POLICY IF EXISTS "Authenticated users can read logs" ON logs;
DROP POLICY IF EXISTS "Users can read all data" ON alerts;
DROP POLICY IF EXISTS "Authenticated users can read alerts" ON alerts;
DROP POLICY IF EXISTS "Users can read all data" ON authorized_usb_devices;
DROP POLICY IF EXISTS "Service role can manage authorized_usb_devices" ON authorized_usb_devices;
DROP POLICY IF EXISTS "Users can read all data" ON device_events;
DROP POLICY IF EXISTS "users_can_read_everything" ON devices;

-- Drop potential policies on new tables to be safe
DROP POLICY IF EXISTS "Admins can do everything" ON severity_rules;
DROP POLICY IF EXISTS "Admins can do everything" ON usb_approval_requests;

-- 3. DEVICES Table Policies
-- Admin: Full Access
CREATE POLICY "Admins can do everything on devices" ON devices
  FOR ALL USING (public.is_admin());

-- Standard User: Read OWN devices only
CREATE POLICY "Users can read own devices" ON devices
  FOR SELECT USING (
    owner = public.get_auth_email()
  );

-- Service Role (API): Full Access (Already exists usually, but good to explicit)
-- CREATE POLICY "Service role full access" ON devices FOR ALL USING (auth.role() = 'service_role');

-- 4. LOGS Table Policies
-- Admin: Full Access
CREATE POLICY "Admins can read all logs" ON logs
  FOR SELECT USING (public.is_admin());

-- Standard User: Read logs for THEIR devices only
CREATE POLICY "Users can read logs for own devices" ON logs
  FOR SELECT USING (
    device_id IN (SELECT id FROM devices WHERE owner = public.get_auth_email())
  );

-- Service Role: Insert logs
CREATE POLICY "Service role can insert logs" ON logs
  FOR INSERT WITH CHECK (true);

-- 5. ALERTS Table Policies
CREATE POLICY "Admins can read all alerts" ON alerts
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Users can read alerts for own devices" ON alerts
  FOR SELECT USING (
    device_id IN (SELECT id FROM devices WHERE owner = public.get_auth_email())
  );

-- 6. AUTHORIZED USB DEVICES (Whitelist)
-- Admin: Full Access
CREATE POLICY "Admins can read all authorized usb devices" ON authorized_usb_devices
  FOR SELECT USING (public.is_admin());
  
-- Standard User: Read-only access to the whitelist (to see what is allowed)
CREATE POLICY "Authenticated users can read authorized usb whitelist" ON authorized_usb_devices
  FOR SELECT USING (auth.role() = 'authenticated');

-- 7. DEVICE EVENTS Table Policies
CREATE POLICY "Admins can read all events" ON device_events
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Users can read events for own devices" ON device_events
  FOR SELECT USING (
    device_id IN (SELECT id FROM devices WHERE owner = public.get_auth_email())
  );

-- 8. SEVERITY RULES (Admin Config)
-- Secure newly discovered table
ALTER TABLE severity_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage severity rules" ON severity_rules
  FOR ALL USING (public.is_admin());

-- 9. USB APPROVAL REQUESTS (Agent/Admin Workflow)
-- Secure newly discovered table
ALTER TABLE usb_approval_requests ENABLE ROW LEVEL SECURITY;

-- Admins can manage requests (approve/reject)
CREATE POLICY "Admins can manage usb requests" ON usb_approval_requests
  FOR ALL USING (public.is_admin());

-- Service Role (API) can insert requests from Agents
CREATE POLICY "Service role can insert usb requests" ON usb_approval_requests
  FOR INSERT WITH CHECK (true);
