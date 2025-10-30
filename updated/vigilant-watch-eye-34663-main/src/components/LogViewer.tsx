"use client"

import { useState, useEffect } from "react"
import { Search, Filter, Download } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { wazuhAPI } from "@/lib/wazuh-api"

interface Log {
  id: number
  timestamp: string
  severity: "critical" | "warning" | "info" | "success"
  system: string
  message: string
  category: string
}

const severityConfig = {
  critical: { color: "bg-critical text-critical-foreground", label: "Critical" },
  warning: { color: "bg-warning text-warning-foreground", label: "Warning" },
  info: { color: "bg-info text-info-foreground", label: "Info" },
  success: { color: "bg-success text-success-foreground", label: "Success" },
}

export const LogViewer = () => {
  const [logs, setLogs] = useState<Log[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [severityFilter, setSeverityFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true)
        const data = await wazuhAPI.getLogs()

        // Transform Wazuh logs to our Log format
        const transformedLogs: Log[] = data.slice(0, 20).map((log: any, index: number) => ({
          id: index,
          timestamp: new Date(log.timestamp).toLocaleString(),
          severity: mapSeverity(log.rule?.level || 0),
          system: log.agent?.name || "Unknown",
          message: log.full_log || log.message || "No message",
          category: log.rule?.groups?.[0] || "General",
        }))

        setLogs(transformedLogs)
        setError(null)
      } catch (err) {
        console.error("Failed to fetch logs:", err)
        setError("Failed to load logs")
        setLogs([])
      } finally {
        setLoading(false)
      }
    }

    fetchLogs()
    // Refresh logs every 60 seconds
    const interval = setInterval(fetchLogs, 60000)
    return () => clearInterval(interval)
  }, [])

  const mapSeverity = (level: number): Log["severity"] => {
    if (level >= 12) return "critical"
    if (level >= 7) return "warning"
    if (level >= 4) return "info"
    return "success"
  }

  const sanitizedSearch = searchQuery.trim().toLowerCase()

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.message.toLowerCase().includes(sanitizedSearch) ||
      log.system.toLowerCase().includes(sanitizedSearch) ||
      log.category.toLowerCase().includes(sanitizedSearch)

    const matchesSeverity = severityFilter === "all" || log.severity === severityFilter

    return matchesSearch && matchesSeverity
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Security Event Logs</h2>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm">{error}</div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            maxLength={100}
          />
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="success">Success</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Log Entries */}
      {loading ? (
        <div className="flex items-center justify-center h-[400px]">
          <p className="text-muted-foreground">Loading logs...</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No logs match your search criteria</div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={severityConfig[log.severity as keyof typeof severityConfig].color}>
                        {severityConfig[log.severity as keyof typeof severityConfig].label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{log.timestamp}</span>
                      <Badge variant="outline" className="text-xs">
                        {log.category}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium mb-1">{log.system}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">{log.message}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
