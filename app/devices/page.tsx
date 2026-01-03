"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { DeviceManagement } from "@/components/device-management"
import { Navigation } from "@/components/navigation"

export default function DevicesPage() {
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const role = user.user_metadata?.role || 'user'
      const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'))
      const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'))

      // Allow all authenticated users to see the devices page
      // Access control (who sees which devices) is handled by the API

      setLoading(false)
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
        <DeviceManagement />
      </main>
    </div>
  )
}
