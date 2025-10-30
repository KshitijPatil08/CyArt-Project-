import type React from "react"
import { UserMenu } from "./user-menu"

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="flex items-center justify-between p-4 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold">Device Tracking Dashboard</h1>
            <p className="text-sm text-muted-foreground">Real-time device and USB monitoring</p>
          </div>
          <UserMenu />
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
