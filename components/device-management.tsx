"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { createDeviceAction } from "@/app/actions/create-device" // Import server action
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
import { AlertCircle, Plus, Trash2, Copy, Eye, EyeOff, Shield, ShieldOff, Edit, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { QuarantineDialog } from "./quarantine-dialog"
import { ReleaseDialog } from "./release-dialog"

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
  is_server: boolean
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
  const [quarantineDialogOpen, setQuarantineDialogOpen] = useState(false)
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [formData, setFormData] = useState({
    device_name: "",
    device_type: "windows",
    owner: "",
    location: "",
    ip_address: "",
    hostname: "",
    os_version: "",
  })
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editFormData, setEditFormData] = useState({
    id: "",
    device_name: "",
    device_type: "",
    owner: "",
    location: "",
    hostname: "",
  })
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingDeviceData, setDeletingDeviceData] = useState<{ id: string; name: string } | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isApprover, setIsApprover] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      await fetchUserStatus()
      await fetchDevices()
    }
    init()
  }, [])

  const fetchUserStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const role = user?.user_metadata?.role || 'user'
    setUserRole(role)
    setIsAdmin(role === 'admin' || (Array.isArray(role) && role.includes('admin')))
    setIsApprover(role === 'approver' || (Array.isArray(role) && role.includes('approver')))
  }

  const fetchDevices = async () => {
    try {
      const response = await fetch('/api/devices/list')
      const data = await response.json()
      if (data.devices) {
        setDevices(data.devices)
      }

      // Fetch credentials securely via API route
      try {
        const credRes = await fetch('/api/devices/credentials')
        if (credRes.ok) {
          const { credentials: creds } = await credRes.json()
          const credsMap: Record<string, DeviceCredentials> = {}
          for (const cred of creds || []) {
            credsMap[cred.device_id] = cred
          }
          setCredentials(credsMap)
        }
      } catch (credError) {
        console.error("Error fetching credentials:", credError)
      }

      setLoading(false)
    } catch (error) {
      console.error("Error fetching devices:", error)
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

      setLoading(true)
      const result = await createDeviceAction(formData)
      setLoading(false)

      if (!result.success) {
        throw new Error(result.error)
      }

      if (!result.data) {
        throw new Error("No data returned from server action")
      }

      // Explicitly case the data to avoid TS errors
      const device = result.data.device;
      const newCreds = result.data.credentials;

      toast({ title: "Success", description: "Device registered successfully" })

      // Update local state temporarily to show credentials immediately
      setCredentials(prev => ({
        ...prev,
        [device.id]: {
          device_id: device.id,
          username: newCreds.username,
          password: newCreds.password // Display the raw password return from action
        }
      }))

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
    } catch (error: any) {
      console.error("[v0] Error adding device:", error)
      toast({ title: "Error", description: error.message || "Failed to register device", variant: "destructive" })
      setLoading(false)
    }
  }

  const handleDeleteDevice = (deviceId: string, deviceName: string) => {
    setDeletingDeviceData({ id: deviceId, name: deviceName })
    setIsDeleteOpen(true)
  }

  const confirmDeleteDevice = async () => {
    if (!deletingDeviceData) return

    try {
      setLoading(true)
      const response = await fetch("/api/devices/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deletingDeviceData.id, purge_logs: true }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error?.error || "Delete failed")
      }

      toast({ title: "Success", description: "Device deleted successfully" })
      setIsDeleteOpen(false)
      setDeletingDeviceData(null)
      fetchDevices()
    } catch (error) {
      console.error("[v0] Error deleting device:", error)
      toast({ title: "Error", description: "Failed to delete device", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }



  const openEditDialog = (device: Device) => {
    setEditFormData({
      id: device.id,
      device_name: device.device_name,
      device_type: device.device_type,
      owner: device.owner || "",
      location: device.location || "",
      hostname: device.hostname || "",
    })
    setIsEditOpen(true)
  }

  const handleUpdateDevice = async () => {
    try {
      setLoading(true)
      const { error } = await supabase
        .from("devices")
        .update({
          device_name: editFormData.device_name,
          device_type: editFormData.device_type,
          owner: editFormData.owner,
          location: editFormData.location,
          hostname: editFormData.hostname,
        })
        .eq("id", editFormData.id)

      if (error) throw error

      toast({ title: "Success", description: "Device updated successfully" })
      setIsEditOpen(false)
      fetchDevices()
    } catch (error: any) {
      console.error("Error updating device:", error)
      toast({ title: "Error", description: "Failed to update device", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleQuarantine = (device: Device) => {
    setSelectedDevice(device)
    setQuarantineDialogOpen(true)
  }

  const handleReleaseQuarantine = (device: Device) => {
    setSelectedDevice(device)
    setReleaseDialogOpen(true)
  }

  const handleQuarantineSuccess = () => {
    fetchDevices()
  }

  const handleReleaseSuccess = () => {
    fetchDevices()
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
        {isAdmin && (
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
        )}
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Device</DialogTitle>
            <DialogDescription>Update device details and location (Team).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Device Name</Label>
              <Input
                value={editFormData.device_name}
                onChange={(e) => setEditFormData({ ...editFormData, device_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Location (Team / Subnet)</Label>
              <Input
                value={editFormData.location}
                onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                placeholder="e.g. Red Team, Engineering"
              />
              <p className="text-xs text-muted-foreground mt-1">This overrides the subnet grouping in Network Topology.</p>
            </div>
            <div>
              <Label>Owner</Label>
              <Input
                value={editFormData.owner}
                onChange={(e) => setEditFormData({ ...editFormData, owner: e.target.value })}
              />
            </div>
            <div>
              <Label>Device Type</Label>
              <Select
                value={editFormData.device_type}
                onValueChange={(value) => setEditFormData({ ...editFormData, device_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="windows">Windows</SelectItem>
                  <SelectItem value="linux">Linux</SelectItem>
                  <SelectItem value="mac">Mac</SelectItem>
                  <SelectItem value="server">Server</SelectItem>
                  <SelectItem value="switch">Switch</SelectItem>
                  <SelectItem value="router">Router</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleUpdateDevice} className="w-full">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deletingDeviceData?.name}</strong>? This will purge all related logs and records permanently.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteDevice} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete Permanently
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                    {isAdmin && <TableHead>Credentials</TableHead>}
                    {isAdmin && <TableHead>Actions</TableHead>}
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
                          {device.is_server && (
                            <Badge className="bg-blue-600 text-white">
                              🖥️ SERVER
                            </Badge>
                          )}
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
                      {isAdmin && (
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
                      )}
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-2">
                            {device.is_quarantined ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleReleaseQuarantine(device)}
                                className="text-green-600 hover:text-green-700"
                                title="Release from quarantine"
                              >
                                <ShieldOff className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleQuarantine(device)}
                                className="text-orange-600 hover:text-orange-700"
                                title="Quarantine device"
                              >
                                <Shield className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(device)}
                              className="text-blue-600 hover:text-blue-700"
                              title="Edit Device (Team/Location)"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDevice(device.id, device.device_name)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <QuarantineDialog
        open={quarantineDialogOpen}
        onOpenChange={setQuarantineDialogOpen}
        device={selectedDevice ? {
          device_id: selectedDevice.id,
          device_name: selectedDevice.device_name,
          ip_address: selectedDevice.ip_address
        } : null}
        onSuccess={handleQuarantineSuccess}
      />

      <ReleaseDialog
        open={releaseDialogOpen}
        onOpenChange={setReleaseDialogOpen}
        device={selectedDevice ? {
          device_id: selectedDevice.id,
          device_name: selectedDevice.device_name,
          ip_address: selectedDevice.ip_address,
          quarantine_reason: selectedDevice.quarantine_reason || undefined,
          quarantined_at: selectedDevice.quarantined_at || undefined
        } : null}
        onSuccess={handleReleaseSuccess}
      />
    </div >
  )
}
