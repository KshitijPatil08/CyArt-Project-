import SecurityDashboard from '@/components/SecurityDashboard';
import { Navigation } from '@/components/navigation';

export default function DashboardPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1">
        <SecurityDashboard />
      </main>
    </div>
  );
}