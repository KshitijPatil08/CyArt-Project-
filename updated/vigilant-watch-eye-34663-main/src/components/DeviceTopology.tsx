"use client"

import { useState, useEffect } from "react"
import { Server, Laptop, Smartphone } from "lucide-react"
import { wazuhAPI } from "@/lib/wazuh-api"

interface Device {
  id: string
  name: string
  type: "server" | "workstation" | "mobile"
  status: "online" | "offline" | "warning"
  peripherals: Peripheral[]
}

interface Peripheral {
  id: string
  name: string
  type: "usb" | "keyboard" | "mouse" | "monitor"
  connectedAt: string
}

const getDeviceIcon = (type: Device["type"]) => {
  switch (type) {
    case "server":
      return Server
    case "workstation":
      return Laptop
    case "mobile":
      return Smartphone
  }
}

const statusColors = {
  online: "bg-success",
  offline: "bg-muted-foreground",
  warning: "bg-warning",
}

export const DeviceTopology = () => {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        setLoading(true)
        const agents = await wazuhAPI.getAgents()

        // Transform Wazuh agents to our Device format
        const transformedDevices: Device[] = agents.slice(0, 5).map((agent: any) => ({
          id: agent.id,
          name: agent.name,
          type: agent.name.includes("SRV") ? "server" : "workstation",
          status: agent.status === "active" ? "online" : agent.status === "disconnected" ? "offline" : "warning",
          peripherals: [],
        }))

        setDevices(transformedDevices)
        setError(null)
      } catch (err) {
        console.error("Failed to fetch devices:", err)
        setError("Failed to load devices")
        setDevices([])
      } finally {
        setLoading(false)
      }
    }

    fetchDevices()
    // Refresh devices every 60 seconds
    const interval = setInterval(fetchDevices, 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <p className="text-muted-foreground">Loading devices...</p>
      </div>
    )
  }

  if (error) {
    return <div className="p-4 rounded-lg bg-warning/10 border border-warning/30 text-warning">{error}</div>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {devices.map((device) => {
          const DeviceIcon = getDeviceIcon(device.type)
          const isSelected = selectedDevice === device.id

          return (
            <div key={device.id} className="space-y-2">
              {/* Main Device */}
              <button
                onClick={() => setSelectedDevice(isSelected ? null : device.id)}
                className={`w-full p-4 rounded-lg border transition-all ${
                  isSelected ? "border-primary bg-primary/10 glow" : "border-border bg-card/50 hover:border-primary/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <DeviceIcon className="h-6 w-6 text-primary" />
                    <div
                      className={`absolute -top-1 -right-1 h-3 w-3 rounded-full ${statusColors[device.status]} border-2 border-card`}
                    />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium">{device.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{device.type}</p>
                  </div>
                  {device.peripherals.length > 0 && (
                    <div className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                      {device.peripherals.length}
                    </div>
                  )}
                </div>
              </button>

              {/* Peripherals */}
              {isSelected && device.peripherals.length > 0 && (
                <div className="ml-4 space-y-2 animate-in slide-in-from-left">
                  {device.peripherals.map((peripheral) => (
                    <div
                      key={peripheral.id}
                      className="p-3 rounded-lg border border-border bg-card/30 flex items-center gap-2"
                    >
                      <div className="flex-1">
                        <p className="text-xs font-medium">{peripheral.name}</p>
                        <p className="text-xs text-muted-foreground">Connected at {peripheral.connectedAt}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedDevice && (
        <div className="p-4 bg-card/50 rounded-lg border border-primary/30">
          <p className="text-sm text-muted-foreground">Click on a device to view its connected peripherals</p>
        </div>
      )}
    </div>
  )
}
