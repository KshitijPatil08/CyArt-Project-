<<<<<<< HEAD
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
=======
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import SecurityDashboard from "@/components/SecurityDashboard"
import { Navigation } from "@/components/navigation"

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login")
        return
      }
      setUser(user)
      setLoading(false)
    }

    checkAuth()
  }, [router, supabase])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        <SecurityDashboard />
      </main>
    </div>
  )
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
}