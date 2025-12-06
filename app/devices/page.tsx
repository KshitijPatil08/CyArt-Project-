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
        <DeviceManagement />
      </main>
    </div>
  )
}
