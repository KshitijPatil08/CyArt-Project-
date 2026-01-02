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

  const role = user.user_metadata?.role || 'user';

  // Strict Redirection for Approvers
  // Strict Redirection Removed: Approvers now access the main dashboard but with a limited view.
  // if (role === 'approver') {
  //   redirect('/usb-whitelist');
  // }

  // Admins & Regular Users (viewers) stay on Dashboard
  // Users might see a read-only view. Admins see full control.
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1">
        <SecurityDashboard />
      </main>
    </div>
  );
}