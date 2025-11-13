"use client"

import { DeviceManagement } from "@/components/device-management"
import RealTimeAlerts from "@/components/real-time-alerts"
import { Navigation } from "@/components/navigation"

export default function DevicesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1">
        <DeviceManagement />
        <RealTimeAlerts />
      </main>
    </div>
  )
}
