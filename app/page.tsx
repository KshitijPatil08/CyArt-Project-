import SecurityDashboard from '@/components/SecurityDashboard';
import { Navigation } from '@/components/navigation';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Admins, Approvers & Regular Users stay on Dashboard
  // Visibility is controlled within the components themselves based on role.
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1">
        <SecurityDashboard />
      </main>
    </div>
  );
}