"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { AlertCircle, Bell, X, CheckCircle } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface Alert {
  id: string
  device_id: string
  alert_type: string
  severity: string
  title: string
  description: string
  is_read: boolean
  is_resolved: boolean
  created_at: string
}

interface Device {
  id: string
  device_name: string
}

export function RealTimeAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [devices, setDevices] = useState<Record<string, Device>>({})
  const [unreadCount, setUnreadCount] = useState(0)
  const [showPanel, setShowPanel] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    fetchDevices()
    fetchAlerts()
    subscribeToAlerts()
  }, [])

  const fetchDevices = async () => {
    try {
      const { data, error } = await supabase.from("devices").select("id, device_name")
      if (error) throw error

      const deviceMap: Record<string, Device> = {}
      data?.forEach((device) => {
        deviceMap[device.id] = device
      })
      setDevices(deviceMap)
    } catch (error) {
      console.error("[v0] Error fetching devices:", error)
    }
  }

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("is_resolved", false)
        .order("created_at", { ascending: false })
        .limit(20)

      if (error) throw error

      setAlerts(data || [])
      setUnreadCount((data || []).filter((a) => !a.is_read).length)
    } catch (error) {
      console.error("[v0] Error fetching alerts:", error)
    }
  }

  const subscribeToAlerts = () => {
    const subscription = supabase
      .channel("alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" }, (payload) => {
        const newAlert = payload.new as Alert
        setAlerts((prev) => [newAlert, ...prev.slice(0, 19)])
        setUnreadCount((prev) => prev + 1)

        // Show toast notification for critical alerts
        if (newAlert.severity === "critical") {
          toast({
            title: "Critical Alert",
            description: newAlert.title,
            variant: "destructive",
          })
        }
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }

  const markAsRead = async (alertId: string) => {
    try {
      const { error } = await supabase.from("alerts").update({ is_read: true }).eq("id", alertId)

      if (error) throw error

      setAlerts((prev) => prev.map((alert) => (alert.id === alertId ? { ...alert, is_read: true } : alert)))
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      console.error("[v0] Error marking alert as read:", error)
    }
  }

  const resolveAlert = async (alertId: string) => {
    try {
      const { error } = await supabase.from("alerts").update({ is_resolved: true }).eq("id", alertId)

      if (error) throw error

      setAlerts((prev) => prev.filter((alert) => alert.id !== alertId))
      toast({ title: "Success", description: "Alert resolved" })
    } catch (error) {
      console.error("[v0] Error resolving alert:", error)
      toast({ title: "Error", description: "Failed to resolve alert", variant: "destructive" })
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-300"
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-300"
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-300"
      case "low":
        return "bg-blue-100 text-blue-800 border-blue-300"
      default:
        return "bg-gray-100 text-gray-800 border-gray-300"
    }
  }

  return (
    <>
      {/* Alert Bell Icon */}
      <div className="fixed bottom-6 right-6 z-40">
        <Button
          onClick={() => setShowPanel(!showPanel)}
          className="relative rounded-full w-14 h-14 shadow-lg"
          size="icon"
        >
          <Bell className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </div>

      {/* Alert Panel */}
      {showPanel && (
        <div className="fixed bottom-24 right-6 z-40 w-96 max-h-96 bg-white rounded-lg shadow-xl border">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Active Alerts ({alerts.length})
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setShowPanel(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="overflow-y-auto max-h-80">
            {alerts.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                <p>No active alerts</p>
              </div>
            ) : (
              <div className="space-y-2 p-4">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border-l-4 ${getSeverityColor(alert.severity)} ${
                      !alert.is_read ? "bg-opacity-100" : "bg-opacity-50"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{alert.title}</p>
                        <p className="text-xs opacity-75 mt-1">{alert.description}</p>
                        <p className="text-xs opacity-50 mt-1">
                          {devices[alert.device_id]?.device_name || "Unknown Device"}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {!alert.is_read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsRead(alert.id)}
                            className="h-6 w-6 p-0"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => resolveAlert(alert.id)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
