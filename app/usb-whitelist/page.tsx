"use client"

import { USBWhitelistManagement } from "@/components/usb-whitelist-management"
import { Navigation } from "@/components/navigation"

export default function USBWhitelistPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1">
        <USBWhitelistManagement />
      </main>
    </div>
  )
}

