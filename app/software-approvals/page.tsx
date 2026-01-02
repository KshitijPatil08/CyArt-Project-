<<<<<<< HEAD
"use client"

import { SoftwareManagement } from "@/components/software-management"
import { Navigation } from "@/components/navigation"

export default function SoftwareApprovalsPage() {
    return (
        <div className="min-h-screen flex flex-col">
            <Navigation />
            <main className="flex-1">
                <SoftwareManagement />
            </main>
        </div>
    )
}
=======
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { SoftwareManagement } from "@/components/software-management"
import { Navigation } from "@/components/navigation"

export default function SoftwareApprovalsPage() {
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
            <main className="max-w-7xl mx-auto py-8">
                <SoftwareManagement />
            </main>
        </div>
    )
}
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
