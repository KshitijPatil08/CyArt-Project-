"use client"

import { useState, useEffect } from "react"
import { Server, Laptop, Smartphone } from "lucide-react"
import { wazuhAPI } from "@/lib/wazuh-api"

interface Device {
  id: string
  name: string
  type: "server" | "workstation" | "mobile"
  status: "online" | "offline" | "warning"
  position: { x: number; y: number }
  connections: string[]
}

interface Packet {
  id: string
  fromId: string
  toId: string
  progress: number
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
  online: "hsl(var(--success))",
  offline: "hsl(var(--muted-foreground))",
  warning: "hsl(var(--warning))",
}

export const NetworkTopology = () => {
  const [devices, setDevices] = useState<Device[]>([])
  const [packets, setPackets] = useState<Packet[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const agents = await wazuhAPI.getAgents()

        // Transform agents to devices with positions
        const transformedDevices: Device[] = agents.map((agent: any, index: number) => {
          const angle = (index / agents.length) * Math.PI * 2
          const radius = 150
          return {
            id: agent.id,
            name: agent.name,
            type: agent.name.includes("SRV") ? "server" : "workstation",
            status: agent.status === "active" ? "online" : agent.status === "disconnected" ? "offline" : "warning",
            position: {
              x: 400 + radius * Math.cos(angle),
              y: 300 + radius * Math.sin(angle),
            },
            connections: agents.length > 1 ? [agents[0].id] : [],
          }
        })

        setDevices(transformedDevices)
        setLoading(false)
      } catch (err) {
        console.error("Failed to fetch network topology:", err)
        setLoading(false)
      }
    }

    fetchDevices()
  }, [])

  useEffect(() => {
    // Generate random packets for animation
    const interval = setInterval(() => {
      const connections: Array<{ from: string; to: string }> = []
      devices.forEach((device) => {
        device.connections.forEach((connId) => {
          connections.push({ from: device.id, to: connId })
        })
      })

      if (connections.length > 0) {
        const randomConn = connections[Math.floor(Math.random() * connections.length)]
        const newPacket: Packet = {
          id: `packet-${Date.now()}-${Math.random()}`,
          fromId: randomConn.from,
          toId: randomConn.to,
          progress: 0,
        }
        setPackets((prev) => [...prev, newPacket])
      }
    }, 800)

    return () => clearInterval(interval)
  }, [devices])

  useEffect(() => {
    // Animate packets
    const interval = setInterval(() => {
      setPackets((prev) => prev.map((p) => ({ ...p, progress: p.progress + 0.02 })).filter((p) => p.progress < 1))
    }, 16)

    return () => clearInterval(interval)
  }, [])

  const getDevicePosition = (deviceId: string) => {
    const device = devices.find((d) => d.id === deviceId)
    return device?.position || { x: 0, y: 0 }
  }

  if (loading) {
    return (
      <div className="relative w-full h-[400px] md:h-[600px] bg-card/30 rounded-lg border border-border overflow-hidden flex items-center justify-center">
        <p className="text-muted-foreground">Loading network topology...</p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-[400px] md:h-[600px] bg-card/30 rounded-lg border border-border overflow-hidden">
      <svg className="w-full h-full" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
            <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Draw connections between devices */}
        {devices.map((device) =>
          device.connections.map((connId) => {
            const fromPos = device.position
            const toPos = getDevicePosition(connId)
            return (
              <g key={`${device.id}-${connId}`}>
                <line
                  x1={fromPos.x}
                  y1={fromPos.y}
                  x2={toPos.x}
                  y2={toPos.y}
                  stroke="url(#lineGradient)"
                  strokeWidth="2"
                  className="opacity-50"
                />
              </g>
            )
          }),
        )}

        {/* Animate packets along connections */}
        {packets.map((packet) => {
          const fromPos = getDevicePosition(packet.fromId)
          const toPos = getDevicePosition(packet.toId)
          const x = fromPos.x + (toPos.x - fromPos.x) * packet.progress
          const y = fromPos.y + (toPos.y - fromPos.y) * packet.progress

          return (
            <circle
              key={packet.id}
              cx={x}
              cy={y}
              r="4"
              fill="hsl(var(--primary))"
              filter="url(#glow)"
              className="animate-pulse"
            />
          )
        })}
      </svg>

      {/* Device nodes */}
      {devices.map((device) => {
        const DeviceIcon = getDeviceIcon(device.type)
        const isSelected = selectedDevice === device.id

        return (
          <div
            key={device.id}
            style={{
              position: "absolute",
              left: `${(device.position.x / 800) * 100}%`,
              top: `${(device.position.y / 600) * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <button
              onClick={() => setSelectedDevice(isSelected ? null : device.id)}
              className={`relative p-2 md:p-4 rounded-lg border transition-all ${
                isSelected ? "border-primary bg-primary/10 glow" : "border-border bg-card hover:border-primary/50"
              }`}
              style={{
                width: "60px",
                height: "60px",
              }}
            >
              <div className="flex flex-col items-center justify-center gap-0.5">
                <div className="relative">
                  <DeviceIcon className="h-4 w-4 md:h-6 md:w-6 text-primary" />
                  <div
                    className="absolute -top-1 -right-1 h-2 w-2 md:h-3 md:w-3 rounded-full border-2 border-card"
                    style={{ backgroundColor: statusColors[device.status] }}
                  />
                </div>
                <p className="text-[8px] md:text-xs font-medium truncate w-full text-center hidden md:block">
                  {device.name}
                </p>
              </div>
            </button>
          </div>
        )
      })}

      {/* Info panel */}
      {selectedDevice && (
        <div className="absolute bottom-2 left-2 right-2 md:bottom-4 md:left-4 md:right-4 p-2 md:p-4 bg-card/95 backdrop-blur rounded-lg border border-primary/30 animate-in slide-in-from-bottom">
          <p className="text-xs md:text-sm font-medium mb-1 md:mb-2">
            {devices.find((d) => d.id === selectedDevice)?.name}
          </p>
          <p className="text-[10px] md:text-xs text-muted-foreground">
            Real-time packet transfer • {devices.find((d) => d.id === selectedDevice)?.connections.length} connections
          </p>
        </div>
      )}
    </div>
  )
}
