<<<<<<< HEAD
"use client"

import { Navigation } from "@/components/navigation"
import { SubnetAssignmentManagement } from "@/components/admin/subnet-assignment"
import { Card, CardContent } from "@/components/ui/card"
import { ShieldCheck } from "lucide-react"

export default function RolesPage() {
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
=======
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { SubnetAssignmentManagement } from "@/components/admin/subnet-assignment"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Shield, ShieldAlert, UserCheck } from "lucide-react"

export default function RolesPage() {
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

            // Check for admin role
            const role = user.user_metadata?.role
            if (role !== "admin") {
                router.push("/")
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
        <div className="min-h-screen bg-transparent">
            <Navigation />
            <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-2">
                        <h1 className="text-3xl font-bold tracking-tight">Access & Delegations</h1>
                        <div className="flex px-2 py-1 bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 text-xs font-bold rounded border border-red-200 dark:border-red-800 items-center gap-1 uppercase">
                            <ShieldAlert className="w-3 h-3" />
                            Admin restricted
                        </div>
                    </div>
                    <p className="text-muted-foreground">
                        Manage system roles and delegate approval authority through subnet assignments.
                    </p>
                </div>

                <div className="grid gap-8">
                    <SubnetAssignmentManagement />

                    <Card className="bg-muted/30 border-dashed border-2">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider">
                                <Shield className="w-4 h-4 text-primary" />
                                Role Definitions
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-foreground font-bold italic">
                                        <ShieldAlert className="w-4 h-4 text-red-500" />
                                        ADMIN
                                    </div>
                                    <p className="text-xs leading-relaxed">Full system governance. Manage devices, view global logs, handle quarantine, and assign subnets to other users.</p>
                                </div>

                                <div className="space-y-2 border-l border-dashed pl-6">
                                    <div className="flex items-center gap-2 text-foreground font-bold italic">
                                        <UserCheck className="w-4 h-4 text-indigo-500" />
                                        APPROVER
                                    </div>
                                    <p className="text-xs leading-relaxed">Assigned to specific subnets. Can approve USB requests from those subnets and monitor devices in their perimeter.</p>
                                </div>

                                <div className="space-y-2 border-l border-dashed pl-6">
                                    <div className="flex items-center gap-2 text-foreground font-bold italic">
                                        <Shield className="w-4 h-4 text-slate-400" />
                                        USER
                                    </div>
                                    <p className="text-xs leading-relaxed">Standard access. Can only monitor and manage devices they explicitly own (matched by email/hostname).</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    )
}
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
