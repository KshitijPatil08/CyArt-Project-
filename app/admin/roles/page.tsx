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
