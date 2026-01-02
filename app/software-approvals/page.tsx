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
