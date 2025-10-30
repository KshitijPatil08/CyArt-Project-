"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Wifi, WifiOff, HardDrive, AlertTriangle } from "lucide-react"

interface Device {
  id: string
  device_name: string
  device_type: string
  owner: string
  location: string
  status: string
  security_status: string
  last_seen: string
}

interface USBDevice {
  id: string
  usb_name: string
  device_type: string
  insertion_time: string
  removal_time: string | null
  status: string
  data_transferred_mb: number
}

interface Alert {
  id: string
  title: string
  severity: string
  created_at: string
  is_read: boolean
}

export function DeviceDashboard() {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [usbDevices, setUsbDevices] = useState<USBDevice[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    fetchDevices()
    subscribeToUpdates()
  }, [])

  const fetchDevices = async () => {
    try {
      const { data, error } = await supabase.from("devices").select("*").order("last_seen", { ascending: false })

      if (error) throw error
      setDevices(data || [])
      if (data && data.length > 0) {
        setSelectedDevice(data[0])
        fetchUSBDevices(data[0].id)
      }
      setLoading(false)
    } catch (error) {
      console.error("[v0] Error fetching devices:", error)
      setLoading(false)
    }
  }

  const fetchUSBDevices = async (deviceId: string) => {
    try {
      const { data, error } = await supabase
        .from("usb_devices")
        .select("*")
        .eq("device_id", deviceId)
        .order("insertion_time", { ascending: false })

      if (error) throw error
      setUsbDevices(data || [])
    } catch (error) {
      console.error("[v0] Error fetching USB devices:", error)
    }
  }

  const subscribeToUpdates = () => {
    // Subscribe to device changes
    const deviceSubscription = supabase
      .channel("devices")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, (payload) => {
        fetchDevices()
      })
      .subscribe()

    // Subscribe to alerts
    const alertSubscription = supabase
      .channel("alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" }, (payload) => {
        setAlerts((prev) => [payload.new as Alert, ...prev.slice(0, 9)])
      })
      .subscribe()

    return () => {
      deviceSubscription.unsubscribe()
      alertSubscription.unsubscribe()
    }
  }

  const getStatusIcon = (status: string) => {
    return status === "online" ? (
      <Wifi className="w-4 h-4 text-green-500" />
    ) : (
      <WifiOff className="w-4 h-4 text-red-500" />
    )
  }

  const getSecurityBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      secure: "default",
      warning: "secondary",
      critical: "destructive",
      unknown: "outline",
    }
    return variants[status] || "outline"
  }

  if (loading) {
    return <div className="p-4">Loading...</div>
  }

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{devices.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {devices.filter((d) => d.status === "online").length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{alerts.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Devices List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Devices</CardTitle>
            <CardDescription>Connected devices</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {devices.map((device) => (
              <div
                key={device.id}
                onClick={() => {
                  setSelectedDevice(device)
                  fetchUSBDevices(device.id)
                }}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedDevice?.id === device.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(device.status)}
                    <div>
                      <p className="font-sm font-medium">{device.device_name}</p>
                      <p className="text-xs opacity-75">{device.owner}</p>
                    </div>
                  </div>
                  <Badge variant={getSecurityBadge(device.security_status)}>{device.security_status}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Device Details & USB Devices */}
        <div className="lg:col-span-2 space-y-4">
          {selectedDevice && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{selectedDevice.device_name}</CardTitle>
                  <CardDescription>{selectedDevice.device_type}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Owner</p>
                      <p className="font-medium">{selectedDevice.owner}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Location</p>
                      <p className="font-medium">{selectedDevice.location}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge>{selectedDevice.status}</Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Last Seen</p>
                      <p className="font-medium">{new Date(selectedDevice.last_seen).toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* USB Devices */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    USB Devices
                  </CardTitle>
                  <CardDescription>Connected peripherals</CardDescription>
                </CardHeader>
                <CardContent>
                  {usbDevices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No USB devices connected</p>
                  ) : (
                    <div className="space-y-3">
                      {usbDevices.map((usb) => (
                        <div key={usb.id} className="p-3 border rounded-lg">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium">{usb.usb_name}</p>
                              <p className="text-sm text-muted-foreground">{usb.device_type}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Inserted: {new Date(usb.insertion_time).toLocaleString()}
                              </p>
                              {usb.removal_time && (
                                <p className="text-xs text-muted-foreground">
                                  Removed: {new Date(usb.removal_time).toLocaleString()}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                Data Transferred: {usb.data_transferred_mb.toFixed(2)} MB
                              </p>
                            </div>
                            <Badge variant={usb.status === "connected" ? "default" : "secondary"}>{usb.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Alerts Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Recent Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No alerts</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div key={alert.id} className="p-3 border rounded-lg flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">{new Date(alert.created_at).toLocaleString()}</p>
                  </div>
                  <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"}>{alert.severity}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
