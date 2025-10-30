"use client"

import { AlertTriangle, Shield, Info, CheckCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useState, useEffect } from "react"
import { wazuhAPI } from "@/lib/wazuh-api"

interface Alert {
  id: string
  timestamp: string
  severity: "critical" | "warning" | "info" | "success"
  title: string
  description: string
}

const severityConfig = {
  critical: { icon: AlertTriangle, color: "text-critical", bg: "bg-critical/10" },
  warning: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
  info: { icon: Info, color: "text-info", bg: "bg-info/10" },
  success: { icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
}

export const AlertFeed = () => {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        setLoading(true)
        const data = await wazuhAPI.getAlerts()

        // Transform Wazuh alerts to our Alert format
        const transformedAlerts: Alert[] = data.slice(0, 7).map((alert: any, index: number) => ({
          id: alert.id || `alert-${index}`,
          timestamp: new Date(alert.timestamp).toLocaleTimeString(),
          severity: mapSeverity(alert.rule?.level || 0),
          title: alert.rule?.description || "Security Alert",
          description: alert.full_log || alert.message || "No description available",
        }))

        setAlerts(transformedAlerts)
        setError(null)
      } catch (err) {
        console.error("Failed to fetch alerts:", err)
        setError("Failed to load alerts")
        // Fallback to empty state
        setAlerts([])
      } finally {
        setLoading(false)
      }
    }

    fetchAlerts()
    // Refresh alerts every 30 seconds
    const interval = setInterval(fetchAlerts, 30000)
    return () => clearInterval(interval)
  }, [])

  const mapSeverity = (level: number): Alert["severity"] => {
    if (level >= 12) return "critical"
    if (level >= 7) return "warning"
    if (level >= 4) return "info"
    return "success"
  }

  const criticalCount = alerts.filter((a) => a.severity === "critical").length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Active Alerts
        </h2>
        <Badge variant="outline" className="bg-critical/10 text-critical border-critical/30">
          {criticalCount} Critical
        </Badge>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-[500px]">
          <p className="text-muted-foreground">Loading alerts...</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex items-center justify-center h-[500px]">
          <p className="text-muted-foreground">No alerts at this time</p>
        </div>
      ) : (
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-3">
            {alerts.map((alert) => {
              const config = severityConfig[alert.severity]
              const Icon = config.icon

              return (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border border-border ${config.bg} hover:border-primary/50 transition-all cursor-pointer`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${config.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium">{alert.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{alert.description}</p>
                      <p className="text-xs text-muted-foreground">{alert.timestamp}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
