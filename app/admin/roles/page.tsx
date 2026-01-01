"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Navigation } from "@/components/navigation"
import { SubnetAssignmentManagement } from "@/components/admin/subnet-assignment"
import { Card, CardContent } from "@/components/ui/card"
import { ShieldCheck, Loader2 } from "lucide-react"

export default function RolesPage() {
    const [isAuthorized, setIsAuthorized] = useState(false)
    const [loading, setLoading] = useState(true)
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        const checkAccess = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            const role = user?.user_metadata?.role

            // Check if user is admin (handle both string and array roles)
            const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'))

            if (!user || !isAdmin) {
                router.push('/')
                return
            }

            setIsAuthorized(true)
            setLoading(false)
        }

        checkAccess()
    }, [router, supabase])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!isAuthorized) {
        return null
    }

    return (
        <div className="min-h-screen bg-muted/40 flex flex-col">
            <Navigation />
            <main className="flex-1 p-6 lg:p-10 space-y-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-full">
                        <ShieldCheck className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Role Management</h1>
                        <p className="text-muted-foreground">Manage user roles and subnet-based approval delegation.</p>
                    </div>
                </div>

                <Card>
                    <CardContent className="pt-6">
                        <SubnetAssignmentManagement />
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
