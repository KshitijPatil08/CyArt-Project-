"use client"

import { AlertLogsViewer } from "@/components/alert-logs-viewer"
import RealTimeAlerts from "@/components/real-time-alerts"
import { Navigation } from "@/components/navigation"

export default function LogsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1">
        <AlertLogsViewer />
        <RealTimeAlerts />
      </main>
    </div>
  )
}
