"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertCircle, Download, Filter, Trash2, Clock, Activity, Shield, AlertTriangle } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Log {
  id: string
  device_id: string
  log_type: string
  hardware_type?: string
  event?: string
  source?: string
  severity: string
  message: string
  timestamp: string
  event_code?: string
  raw_data: any
}

interface Device {
  id: string
  device_name: string
}

interface SeverityCounts {
  critical: number
  error: number
  warning: number
  info: number
  debug: number
}

export function AlertLogsViewer() {
  const [logs, setLogs] = useState<Log[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    device_id: "all",
    log_type: "all",
    severity: "all",
    search: "",
  })
  const [pagination, setPagination] = useState({
    limit: 50,
    offset: 0,
    total: 0,
  })
  const { toast } = useToast()
  const supabase = createClient()
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearRange, setClearRange] = useState("24h")
  const [customRange, setCustomRange] = useState({ before: "", after: "" })
  const [clearing, setClearing] = useState(false)

  const [severityCounts, setSeverityCounts] = useState<SeverityCounts>({
    critical: 0,
    error: 0,
    warning: 0,
    info: 0,
    debug: 0,
  })

  useEffect(() => {
    fetchDevices()
    fetchLogs()
  }, [])

  useEffect(() => {
    fetchLogs()
    fetchSeverityCounts()
  }, [filters, pagination.offset])

  const fetchDevices = async () => {
    try {
      const { data, error } = await supabase.from("devices").select("id, device_name").order("device_name")
      if (error) throw error
      setDevices(data || [])
    } catch (error) {
      console.error("[v0] Error fetching devices:", error)
    }
  }

  const getBaseQuery = () => {
    let query = supabase.from("logs").select("*", { count: "exact", head: true })

    if (filters.device_id && filters.device_id !== "all") {
      query = query.eq("device_id", filters.device_id)
    }

    if (filters.log_type !== "all") {
      if (filters.log_type === "usb") {
        query = query.or("log_type.eq.usb,and(log_type.eq.hardware,hardware_type.eq.usb)")
      } else {
        query = query.eq("log_type", filters.log_type)
      }
    }

    if (filters.search) {
      query = query.ilike("message", `%${filters.search}%`)
    }

    return query
  }

  const fetchSeverityCounts = async () => {
    try {
      // If a specific severity is selected, we know the counts for others are 0
      // and the count for the selected one is the total.
      if (filters.severity !== "all") {
        const counts = { critical: 0, error: 0, warning: 0, info: 0, debug: 0 }
        // We can't easily get the total here without the main query result, 
        // but we can just let the main fetchLogs update the total and we set the specific one here?
        // Actually, let's just query the count for the selected severity to be safe and consistent.
        const query = getBaseQuery().eq("severity", filters.severity)
        const { count } = await query

        counts[filters.severity as keyof typeof counts] = count || 0
        setSeverityCounts(counts)
        return
      }

      // Otherwise, fetch counts for all severities in parallel
      const severities = ["critical", "error", "warning", "info", "debug"]
      const promises = severities.map(async (severity) => {
        const query = getBaseQuery().eq("severity", severity)
        const { count } = await query
        return { severity, count: count || 0 }
      })

      const results = await Promise.all(promises)

      const newCounts = results.reduce((acc, curr) => {
        acc[curr.severity as keyof SeverityCounts] = curr.count
        return acc
      }, { critical: 0, error: 0, warning: 0, info: 0, debug: 0 } as SeverityCounts)

      setSeverityCounts(newCounts)

    } catch (error) {
      console.error("Error fetching severity counts:", error)
    }
  }

  const fetchLogs = async () => {
    try {
      setLoading(true)
      let query = supabase.from("logs").select("*", { count: "exact" })

      if (filters.device_id && filters.device_id !== "all") {
        query = query.eq("device_id", filters.device_id)
      }

      if (filters.log_type !== "all") {
        if (filters.log_type === "usb") {
          query = query.or("log_type.eq.usb,and(log_type.eq.hardware,hardware_type.eq.usb)")
        } else {
          query = query.eq("log_type", filters.log_type)
        }
      }

      if (filters.severity !== "all") {
        query = query.eq("severity", filters.severity)
      }

      if (filters.search) {
        query = query.ilike("message", `%${filters.search}%`)
      }

      const { data, error, count } = await query
        .order("timestamp", { ascending: false })
        .range(pagination.offset, pagination.offset + pagination.limit - 1)

      if (error) throw error

      setLogs(data || [])
      setPagination((prev) => ({ ...prev, total: count || 0 }))
      setLoading(false)
    } catch (error) {
      console.error("[v0] Error fetching logs:", error)
      toast({ title: "Error", description: "Failed to fetch logs", variant: "destructive" })
      setLoading(false)
    }
  }

  const resetFilters = () => {
    setFilters({
      device_id: "all",
      log_type: "all",
      severity: "all",
      search: "",
    })
    setPagination((prev) => ({ ...prev, offset: 0 }))
  }

  const buildRangePayload = () => {
    const now = new Date()
    switch (clearRange) {
      case "24h":
        return { after: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), before: now.toISOString() }
      case "7d":
        return { after: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), before: now.toISOString() }
      case "30d":
        return { after: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), before: now.toISOString() }
      case "custom":
        return {
          before: customRange.before ? new Date(customRange.before).toISOString() : undefined,
          after: customRange.after ? new Date(customRange.after).toISOString() : undefined,
        }
      default:
        return {}
    }
  }

  const handleClearLogs = async () => {
    try {
      const payload = buildRangePayload()
      if (!payload.before && !payload.after) {
        toast({ title: "Range required", description: "Select or set at least one time bound.", variant: "destructive" })
        return
      }

      setClearing(true)
      const response = await fetch("/api/logs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result?.error || "Failed to clear logs")
      }

      toast({
        title: "Logs cleared",
        description: `Removed ${result.deleted || 0} log${(result.deleted || 0) === 1 ? "" : "s"}.`,
      })
      setClearDialogOpen(false)
      setCustomRange({ before: "", after: "" })
      setPagination((prev) => ({ ...prev, offset: 0 }))
      fetchLogs()
    } catch (error: any) {
      console.error("Error clearing logs:", error)
      toast({ title: "Error", description: error.message || "Unable to clear logs", variant: "destructive" })
    } finally {
      setClearing(false)
    }
  }

  const handleExport = async () => {
    try {
      const csv = [
        ["Timestamp", "Device", "Type", "Severity", "Message", "Event"].join(","),
        ...logs.map((log) =>
          [
            new Date(log.timestamp).toLocaleString(),
            devices.find((d) => d.id === log.device_id)?.device_name || "Unknown",
            log.log_type,
            log.severity,
            `"${log.message.replace(/"/g, '""')}"`,
            log.event || log.source || "-",
          ].join(","),
        ),
      ].join("\n")

      const blob = new Blob([csv], { type: "text/csv" })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `logs-${new Date().toISOString().split("T")[0]}.csv`
      a.click()
      window.URL.revokeObjectURL(url)

      toast({ title: "Success", description: "Logs exported successfully" })
    } catch (error) {
      console.error("[v0] Error exporting logs:", error)
      toast({ title: "Error", description: "Failed to export logs", variant: "destructive" })
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500/20 text-red-300"
      case "error":
        return "bg-orange-500/20 text-orange-200"
      case "warning":
        return "bg-yellow-500/20 text-yellow-200"
      case "info":
        return "bg-blue-500/20 text-blue-200"
      case "debug":
        return "bg-gray-500/20 text-gray-200"
      default:
        return "bg-muted text-foreground"
    }
  }

  const getLogTypeColor = (logType: string) => {
    switch (logType) {
      case "security":
        return "bg-red-500/10 border-red-500/40"
      case "usb":
        return "bg-purple-500/10 border-purple-500/40"
      case "system":
        return "bg-blue-500/10 border-blue-500/40"
      case "application":
        return "bg-green-500/10 border-green-500/40"
      case "network":
        return "bg-indigo-500/10 border-indigo-500/40"
      default:
        return "bg-muted/30 border-border"
    }
  }

  return (
    <div className="space-y-6 p-6">
      <Card className="bg-gradient-to-r from-primary/5 via-purple-500/5 to-background border-primary/10">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm uppercase tracking-wide text-muted-foreground">Operations Center</p>
              <h1 className="text-3xl font-bold">Alert Logs</h1>
              <p className="text-muted-foreground mt-1">
                Monitor live telemetry, investigate spikes, and prune noisy signals.
              </p>
            </div>
            <Button variant="outline" onClick={() => fetchLogs()} disabled={loading} className="gap-2">
              <Activity className="w-4 h-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {[
          {
            label: "Total Logs",
            value: pagination.total,
            icon: Activity,
            accent: "from-primary/15 to-primary/5 text-primary",
          },
          {
            label: "Critical Alerts",
            value: severityCounts.critical,
            icon: AlertCircle,
            accent: "from-red-500/20 to-red-500/5 text-red-600 dark:text-red-300",
          },
          {
            label: "Errors",
            value: severityCounts.error,
            icon: AlertTriangle,
            accent: "from-orange-500/20 to-orange-500/5 text-orange-600 dark:text-orange-200",
          },
          {
            label: "Warnings",
            value: severityCounts.warning,
            icon: Shield,
            accent: "from-amber-500/20 to-amber-500/5 text-amber-600 dark:text-amber-200",
          },
          {
            label: "Informational",
            value: severityCounts.info,
            icon: Clock,
            accent: "from-blue-500/20 to-blue-500/5 text-blue-600 dark:text-blue-200",
          },
        ].map((card) => (
          <Card key={card.label} className={`bg-gradient-to-br ${card.accent} border-border/40`}>
            <CardContent className="py-6 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-bold">{card.value}</p>
              </div>
              <card.icon className="w-8 h-8 opacity-70" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filters
            </CardTitle>
            <CardDescription>Slice data by device, severity, or keywords.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Reset
            </Button>
            <Button variant="secondary" size="sm" className="gap-2" onClick={() => setClearDialogOpen(true)}>
              <Trash2 className="w-4 h-4" />
              Clear Logs
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="device">Device</Label>
              <Select value={filters.device_id} onValueChange={(value) => setFilters({ ...filters, device_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="All devices" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All devices</SelectItem>
                  {devices.map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.device_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="log-type">Log Type</Label>
              <Select value={filters.log_type} onValueChange={(value) => setFilters({ ...filters, log_type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="usb">USB</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="application">Application</SelectItem>
                  <SelectItem value="network">Network</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="severity">Severity</Label>
              <Select value={filters.severity} onValueChange={(value) => setFilters({ ...filters, severity: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search logs..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={handleExport} variant="outline" className="gap-2 bg-transparent">
                <Download className="w-4 h-4" />
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
          <CardDescription>
            Showing {logs.length} of {pagination.total} logs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No logs found</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Event</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id} className={`border-l-4 ${getLogTypeColor(log.log_type)}`}>
                        <TableCell className="text-sm">{new Date(log.timestamp).toLocaleString()}</TableCell>
                        <TableCell className="font-medium">
                          {devices.find((d) => d.id === log.device_id)?.device_name || "Unknown"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.log_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getSeverityColor(log.severity)}>{log.severity}</Badge>
                        </TableCell>
                        <TableCell className="max-w-md truncate">{log.message}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{log.event || log.source || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {Math.floor(pagination.offset / pagination.limit) + 1} of{" "}
                  {Math.ceil(pagination.total / pagination.limit)}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setPagination((prev) => ({
                        ...prev,
                        offset: Math.max(0, prev.offset - prev.limit),
                      }))
                    }
                    disabled={pagination.offset === 0}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setPagination((prev) => ({
                        ...prev,
                        offset: prev.offset + prev.limit,
                      }))
                    }
                    disabled={pagination.offset + pagination.limit >= pagination.total}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Clear Logs by Time
            </DialogTitle>
            <DialogDescription>
              Permanently delete logs within the selected time window. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Time Range</Label>
              <Select value={clearRange} onValueChange={setClearRange}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {clearRange === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="clear-after">Start (after)</Label>
                  <Input
                    id="clear-after"
                    type="datetime-local"
                    value={customRange.after}
                    onChange={(e) => setCustomRange((prev) => ({ ...prev, after: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="clear-before">End (before)</Label>
                  <Input
                    id="clear-before"
                    type="datetime-local"
                    value={customRange.before}
                    onChange={(e) => setCustomRange((prev) => ({ ...prev, before: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
            <Button variant="ghost" onClick={() => setClearDialogOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto gap-2"
              onClick={handleClearLogs}
              disabled={clearing}
            >
              {clearing ? "Clearing..." : "Clear logs"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
