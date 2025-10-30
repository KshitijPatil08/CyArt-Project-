-- Setup authentication users and roles

-- Create a function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create RLS policies for authenticated users
CREATE POLICY "Authenticated users can read devices" ON devices
  FOR SELECT USING (auth.role() = 'authenticated_user');

CREATE POLICY "Authenticated users can read USB devices" ON usb_devices
  FOR SELECT USING (auth.role() = 'authenticated_user');

CREATE POLICY "Authenticated users can read logs" ON logs
  FOR SELECT USING (auth.role() = 'authenticated_user');

CREATE POLICY "Authenticated users can read alerts" ON alerts
  FOR SELECT USING (auth.role() = 'authenticated_user');

CREATE POLICY "Authenticated users can read audit trail" ON audit_trail
  FOR SELECT USING (auth.role() = 'authenticated_user');

-- Allow service role to insert data (for API routes)
CREATE POLICY "Service role can insert logs" ON logs
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can insert USB devices" ON usb_devices
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can insert alerts" ON alerts
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update devices" ON devices
  FOR UPDATE USING (auth.role() = 'service_role');
