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
import { AlertCircle, Download, Filter } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface Log {
  id: string
  device_id: string
  log_type: string
  source: string
  severity: string
  message: string
  timestamp: string
  event_code: string
  raw_data: any
}

interface Device {
  id: string
  device_name: string
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

  useEffect(() => {
    fetchDevices()
    fetchLogs()
  }, [])

  useEffect(() => {
    fetchLogs()
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

  const fetchLogs = async () => {
    try {
      setLoading(true)
      let query = supabase.from("logs").select("*", { count: "exact" })

      if (filters.device_id && filters.device_id !== "all") {
        query = query.eq("device_id", filters.device_id)
      }

      if (filters.log_type !== "all") {
        query = query.eq("log_type", filters.log_type)
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

  const handleExport = async () => {
    try {
      const csv = [
        ["Timestamp", "Device", "Type", "Severity", "Message", "Source"].join(","),
        ...logs.map((log) =>
          [
            new Date(log.timestamp).toLocaleString(),
            devices.find((d) => d.id === log.device_id)?.device_name || "Unknown",
            log.log_type,
            log.severity,
            `"${log.message.replace(/"/g, '""')}"`,
            log.source,
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
      default:
        return "bg-muted/30 border-border"
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Alert Logs</h1>
        <p className="text-muted-foreground mt-1">Monitor and analyze system logs and security events</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
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
                      <TableHead>Source</TableHead>
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
                        <TableCell className="text-sm text-muted-foreground">{log.source}</TableCell>
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
    </div>
  )
}
