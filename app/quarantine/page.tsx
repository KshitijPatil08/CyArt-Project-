"use client"

import { QuarantineManagement } from "@/components/quarantine-management"
import { Navigation } from "@/components/navigation"

export default function QuarantinePage() {
    return (
        <div className="min-h-screen flex flex-col">
            <Navigation />
            <main className="flex-1">
                <QuarantineManagement />
            </main>
        </div>
    )
}
