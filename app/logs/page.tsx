"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AlertLogsViewer } from "@/components/alert-logs-viewer"
import RealTimeAlerts from "@/components/real-time-alerts"
import { Navigation } from "@/components/navigation"

export default function LogsPage() {
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const role = user?.user_metadata?.role || 'user'

      if (role !== 'admin') {
        router.push('/')
      } else {
        setLoading(false)
      }
    }
    checkAccess()
  }, [])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

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
