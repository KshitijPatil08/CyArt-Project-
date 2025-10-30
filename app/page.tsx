import { DeviceDashboard } from "@/components/device-dashboard"
import { DashboardLayout } from "@/components/dashboard-layout"

export default function Home() {
  return (
    <DashboardLayout>
      <DeviceDashboard />
    </DashboardLayout>
  )
}
