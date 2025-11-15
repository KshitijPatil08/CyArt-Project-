"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertCircle, Plus, Trash2, Copy, Eye, EyeOff, Shield, ShieldOff } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface Device {
  id: string
  device_name: string
  device_type: string
  owner: string
  location: string
  ip_address: string
  hostname: string
  os_version: string
  status: string
  security_status: string
  is_quarantined: boolean
  quarantine_reason: string | null
  quarantined_at: string | null
  quarantined_by: string | null
  last_seen: string
  created_at: string
}

interface DeviceCredentials {
  device_id: string
  username: string
  password: string
}

export function DeviceManagement() {
  const [devices, setDevices] = useState<Device[]>([])
  const [credentials, setCredentials] = useState<Record<string, DeviceCredentials>>({})
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({})
  const [formData, setFormData] = useState({
    device_name: "",
    device_type: "windows",
    owner: "",
    location: "",
    ip_address: "",
    hostname: "",
    os_version: "",
  })
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchDevices()
  }, [])

  const fetchDevices = async () => {
    try {
      const { data, error } = await supabase.from("devices").select("*").order("created_at", { ascending: false })
      if (error) throw error
      setDevices(data || [])

      // Fetch credentials for each device
      const credsMap: Record<string, DeviceCredentials> = {}
      for (const device of data || []) {
        const { data: cred } = await supabase.from("device_credentials").select("*").eq("device_id", device.id).single()
        if (cred) {
          credsMap[device.id] = cred
        }
      }
      setCredentials(credsMap)
      setLoading(false)
    } catch (error) {
      console.error("[v0] Error fetching devices:", error)
      toast({ title: "Error", description: "Failed to fetch devices", variant: "destructive" })
      setLoading(false)
    }
  }

  const handleAddDevice = async () => {
    try {
      if (!formData.device_name || !formData.hostname) {
        toast({ title: "Error", description: "Device name and hostname are required", variant: "destructive" })
        return
      }

      const { data, error } = await supabase
        .from("devices")
        .insert([
          {
            ...formData,
            status: "offline",
            security_status: "unknown",
          },
        ])
        .select()

      if (error) throw error

      // Generate credentials for the device
      const deviceId = data[0].id
      const username = `device_${data[0].device_name.toLowerCase().replace(/\s+/g, "_")}`
      const password = Math.random().toString(36).slice(-12)

      const { error: credError } = await supabase.from("device_credentials").insert([
        {
          device_id: deviceId,
          username,
          password,
        },
      ])

      if (credError) throw credError

      toast({ title: "Success", description: "Device registered successfully" })
      setFormData({
        device_name: "",
        device_type: "windows",
        owner: "",
        location: "",
        ip_address: "",
        hostname: "",
        os_version: "",
      })
      setIsDialogOpen(false)
      fetchDevices()
    } catch (error) {
      console.error("[v0] Error adding device:", error)
      toast({ title: "Error", description: "Failed to register device", variant: "destructive" })
    }
  }

  const handleDeleteDevice = async (deviceId: string) => {
    try {
      const { error } = await supabase.from("devices").delete().eq("id", deviceId)
      if (error) throw error
      toast({ title: "Success", description: "Device deleted successfully" })
      fetchDevices()
    } catch (error) {
      console.error("[v0] Error deleting device:", error)
      toast({ title: "Error", description: "Failed to delete device", variant: "destructive" })
    }
  }

  const handleQuarantine = async (deviceId: string, deviceName: string) => {
    const reason = prompt(`Enter reason for quarantining "${deviceName}":`)
    if (!reason) return

    try {
      const response = await fetch("/api/devices/quarantine", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceId,
          reason,
          quarantined_by: "admin@company.com", // Replace with actual user
        }),
      })

      if (!response.ok) throw new Error("Quarantine failed")

      toast({
        title: "Device Quarantined",
        description: `${deviceName} has been quarantined. Network access will be restricted within 10 seconds.`,
      })
      fetchDevices()
    } catch (error) {
      console.error("Error quarantining device:", error)
      toast({ title: "Error", description: "Failed to quarantine device", variant: "destructive" })
    }
  }

  const handleReleaseQuarantine = async (deviceId: string, deviceName: string) => {
    if (!confirm(`Release "${deviceName}" from quarantine?`)) return

    try {
      const response = await fetch("/api/devices/quarantine", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceId,
          released_by: "admin@company.com", // Replace with actual user
        }),
      })

      if (!response.ok) throw new Error("Release failed")

      toast({
        title: "Quarantine Released",
        description: `${deviceName} has been released from quarantine.`,
      })
      fetchDevices()
    } catch (error) {
      console.error("Error releasing quarantine:", error)
      toast({ title: "Error", description: "Failed to release quarantine", variant: "destructive" })
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: "Copied", description: `${label} copied to clipboard` })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "bg-green-100 text-green-800"
      case "offline":
        return "bg-gray-100 text-gray-800"
      case "error":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  if (loading) {
    return <div className="p-4">Loading devices...</div>
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Device Management</h1>
          <p className="text-muted-foreground mt-1">Register and manage connected devices</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Register Device
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Register New Device</DialogTitle>
              <DialogDescription>Add a new device to monitor</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="device_name">Device Name</Label>
                <Input
                  id="device_name"
                  placeholder="e.g., Office PC 1"
                  value={formData.device_name}
                  onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="device_type">Device Type</Label>
                <Select
                  value={formData.device_type}
                  onValueChange={(value) => setFormData({ ...formData, device_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="windows">Windows</SelectItem>
                    <SelectItem value="linux">Linux</SelectItem>
                    <SelectItem value="mac">Mac</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="hostname">Hostname</Label>
                <Input
                  id="hostname"
                  placeholder="e.g., OFFICE-PC-01"
                  value={formData.hostname}
                  onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="owner">Owner</Label>
                <Input
                  id="owner"
                  placeholder="e.g., John Doe"
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g., Office Building A"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="ip_address">IP Address</Label>
                <Input
                  id="ip_address"
                  placeholder="e.g., 192.168.1.100"
                  value={formData.ip_address}
                  onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                />
              </div>
              <Button onClick={handleAddDevice} className="w-full">
                Register Device
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registered Devices</CardTitle>
          <CardDescription>Total devices: {devices.length}</CardDescription>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No devices registered yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead>Credentials</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell className="font-medium">{device.device_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{device.device_type}</Badge>
                      </TableCell>
                      <TableCell>{device.owner}</TableCell>
                      <TableCell>{device.location}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge className={getStatusColor(device.status)}>{device.status}</Badge>
                          {device.is_quarantined && (
                            <Badge className="bg-red-500 text-white">
                              🔒 QUARANTINED
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {device.last_seen ? new Date(device.last_seen).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell>
                        {credentials[device.id] ? (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                View
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Device Credentials</DialogTitle>
                                <DialogDescription>{device.device_name}</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <Label>Username</Label>
                                  <div className="flex gap-2 mt-1">
                                    <Input value={credentials[device.id].username} readOnly />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => copyToClipboard(credentials[device.id].username, "Username")}
                                    >
                                      <Copy className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                                <div>
                                  <Label>Password</Label>
                                  <div className="flex gap-2 mt-1">
                                    <Input
                                      type={showPassword[device.id] ? "text" : "password"}
                                      value={credentials[device.id].password}
                                      readOnly
                                    />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setShowPassword({ ...showPassword, [device.id]: !showPassword[device.id] })
                                      }
                                    >
                                      {showPassword[device.id] ? (
                                        <EyeOff className="w-4 h-4" />
                                      ) : (
                                        <Eye className="w-4 h-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => copyToClipboard(credentials[device.id].password, "Password")}
                                    >
                                      <Copy className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Use these credentials to authenticate the device agent when connecting to the API.
                                </p>
                              </div>
                            </DialogContent>
                          </Dialog>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {device.is_quarantined ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReleaseQuarantine(device.id, device.device_name)}
                              className="text-green-600 hover:text-green-700"
                              title="Release from quarantine"
                            >
                              <ShieldOff className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleQuarantine(device.id, device.device_name)}
                              className="text-orange-600 hover:text-orange-700"
                              title="Quarantine device"
                            >
                              <Shield className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDevice(device.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
