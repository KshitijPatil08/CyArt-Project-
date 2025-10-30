"use client"

import { AlertLogsViewer } from "@/components/alert-logs-viewer"
import { RealTimeAlerts } from "@/components/real-time-alerts"

export default function LogsPage() {
  return (
    <>
      <AlertLogsViewer />
      <RealTimeAlerts />
    </>
  )
}
