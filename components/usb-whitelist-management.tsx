
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
  DialogFooter,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2, AlertCircle, CheckCircle2, Clock, Calendar, Lock, Database, ShieldAlert, X, Pencil, Monitor, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Switch } from "@/components/ui/switch"

interface AuthorizedUSB {
  id: string
  serial_number: string
  vendor_id?: string
  product_id?: string
  device_name: string
  vendor_name?: string
  description?: string
  device_id?: string // Agent/Machine ID
  computer_name?: string // Hostname
  is_active: boolean
  created_at: string
  // Policies
  max_daily_transfer_mb?: number
  allowed_start_time?: string
  allowed_end_time?: string
  expiration_date?: string
  is_read_only?: boolean
  connection_status?: string
}

interface PendingRequest {
  id: string
  serial_number: string
  vendor_id?: string
  product_id?: string
  device_name: string
  vendor_name?: string
  description?: string
  device_class?: string
  hardware_id?: string
  device_id: string
  computer_name?: string // Hostname
  fingerprint_hash: string
  requested_at: string
  isUnknownAgent?: boolean
}

export function USBWhitelistManagement() {
  const [activeTab, setActiveTab] = useState<"authorized" | "pending">("authorized")
  const [devices, setDevices] = useState<AuthorizedUSB[]>([])
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  // Approval Dialog State
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null)
  const [approvalPolicies, setApprovalPolicies] = useState({
    allowed_start_time: "",
    allowed_end_time: "",
    expiration_date: "",
    is_read_only: false
  })

  const [isApproving, setIsApproving] = useState(false)

  // Edit Dialog State
  const [isEditPolicyDialogOpen, setIsEditPolicyDialogOpen] = useState(false)
  const [editingDevice, setEditingDevice] = useState<AuthorizedUSB | null>(null)
  const [editPolicies, setEditPolicies] = useState({
    allowed_start_time: "",
    allowed_end_time: "",
    expiration_date: "",
    is_read_only: false
  })

  // Manual Add Form
  const [formData, setFormData] = useState({
    serial_number: "",
    vendor_id: "",
    product_id: "",
    device_name: "",
    vendor_name: "",
    description: "",
  })

  const [userRole, setUserRole] = useState<string | null>(null)
  const [userDevices, setUserDevices] = useState<string[]>([]) // List of hostnames owned by user
  const [agentDevices, setAgentDevices] = useState<any[]>([]) // List of agent devices with their online/offline status
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isApprover, setIsApprover] = useState(false)

  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchUserStatus()
    // Poll for status updates
    const interval = setInterval(() => {
      fetchLogs()
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  // Refetch devices when user devices list changes or on mount
  useEffect(() => {
    if (userRole) {
      fetchDevices()
      fetchPendingRequests()
      fetchLogs()
      fetchAgentDevices() // Fetch agent status
    }
  }, [userRole, userDevices])

  // Fetch agent devices to check online/offline status
  const fetchAgentDevices = async () => {
    try {
      const res = await fetch("/api/devices/list")
      const data = await res.json()
      if (data.devices) {
        setAgentDevices(data.devices)
      }
    } catch (error) {
      console.error("Error fetching agent devices:", error)
    }
  }

  const fetchUserStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const role = user?.user_metadata?.role || 'user'
    const email = user?.email || null
    setUserRole(role)
    setUserEmail(email)

    const isA = role === 'admin' || (Array.isArray(role) && role.includes('admin'))
    const isP = role === 'approver' || (Array.isArray(role) && role.includes('approver'))

    setIsAdmin(isA)
    setIsApprover(isP)

    if (!isA) {
      // Fetch user's devices to filter the whitelist
      try {
        const res = await fetch("/api/devices/list")
        const data = await res.json()
        if (data.devices) {
          // Store hostnames to match against computer_name in allowed list
          // Case-insensitive matching for owner email
          const hostnames = data.devices
            .filter((d: any) => d.owner?.toLowerCase().trim() === user?.email?.toLowerCase().trim())
            .map((d: any) => d.hostname?.toLowerCase())
            .filter(Boolean)
          setUserDevices(hostnames)
        }
      } catch (e) {
        console.error("Error fetching user devices for filter", e)
      }
    }
  }

  const fetchDevices = async () => {
    try {
      const response = await fetch('/api/usb/whitelist')
      const data = await response.json()
      if (data.success) {
        setDevices(data.devices || [])
      }
    } catch (error) {
      console.error("Error fetching authorized USB devices:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPendingRequests = async () => {
    try {
      const response = await fetch("/api/usb/request")
      const data = await response.json()
      if (data.success) {
        let requests = data.requests || []

        // RBAC: Subnet-based Approval Logic
        // If user is 'subnet_admin' (or we simulate it), filter by subnet.
        // For this demo, we'll assume if the user has 'subnet' metadata (simulated) 
        // or if we just want to show the logic:

        // Example: check if request source IP matches a specific subnet pattern
        // const userSubnet = "192.168.1" 
        // requests = requests.filter(r => r.ip_address?.startsWith(userSubnet))

        setPendingRequests(requests)
      }
    } catch (error) {
      console.error("Error fetching pending requests:", error)
    }
  }

  const fetchLogs = async () => {
    try {
      // Fetch recent USB logs to determine connection status
      const res = await fetch("/api/logs?usb_only=true&limit=100")
      const data = await res.json()
      setLogs(data.logs || [])
    } catch (error) {
      console.error("Error fetching logs:", error)
    }
  }

  const getConnectionStatus = (device: AuthorizedUSB) => {
    // 0. CHECK AGENT STATUS
    // If agent is offline, the USB is effectively disconnected/unreachable
    if (device.computer_name) {
      const agentDevice = agentDevices.find(d => d.hostname?.toLowerCase() === device.computer_name?.toLowerCase())
      if (agentDevice && agentDevice.status === 'offline') {
        return 'disconnected'
      }
    }

    // 1. Logs Inference (Reverted as requested)
    // The user prefers log-based status over DB status for now.

    // 2. Fallback to Log Inference (Legacy)
    const deviceLogs = logs.filter(log =>
      (log.raw_data?.serial_number === device.serial_number) ||
      (log.message && log.message.includes(device.serial_number))
    ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    if (deviceLogs.length === 0) return "disconnected"

    const lastLog = deviceLogs[0]
    const logAge = Date.now() - new Date(lastLog.timestamp).getTime()
    const FIVE_MINUTES = 5 * 60 * 1000
    if (logAge > FIVE_MINUTES) {
      return 'disconnected'
    }

    return lastLog.event === 'connected' ? 'connected' : 'disconnected'
  }

  const handleAddDevice = async () => {
    try {
      if (!formData.serial_number || !formData.device_name) {
        toast({ title: "Error", description: "Serial number and device name are required", variant: "destructive" })
        return
      }

      // Use secure API route instead of direct Supabase call
      const response = await fetch('/api/usb/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to add device')
      }

      toast({ title: "Success", description: "USB device added to whitelist" })
      setFormData({
        serial_number: "",
        vendor_id: "",
        product_id: "",
        device_name: "",
        vendor_name: "",
        description: "",
      })
      setIsDialogOpen(false)
      fetchDevices()
    } catch (error: any) {
      console.error("Error adding USB device:", error)
      toast({ title: "Error", description: "Failed to add USB device", variant: "destructive" })
    }
  }

  const handleDeleteDevice = async (id: string) => {
    try {
      // Use secure API route instead of direct Supabase call
      const response = await fetch(`/api/usb/whitelist?id=${id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete device')
      }
      toast({ title: "Success", description: "USB device removed from whitelist" })
      fetchDevices()
    } catch (error) {
      console.error("Error deleting USB device:", error)
      toast({ title: "Error", description: "Failed to delete USB device", variant: "destructive" })
    }
  }

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      // Use secure API route instead of direct Supabase call
      const response = await fetch('/api/usb/whitelist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !currentStatus })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update device')
      }
      toast({ title: "Success", description: `USB device ${!currentStatus ? "activated" : "deactivated"}` })
      fetchDevices()
    } catch (error) {
      console.error("Error toggling USB device status:", error)
      toast({ title: "Error", description: "Failed to update USB device status", variant: "destructive" })
    }
  }

  const handleApproveClick = (request: PendingRequest) => {
    console.log('[USB] Approve button clicked for:', request.device_name)
    setSelectedRequest(request)
    setApprovalPolicies({
      allowed_start_time: "",
      allowed_end_time: "",
      expiration_date: "",
      is_read_only: false
    })
    setIsApproveDialogOpen(true)
    console.log('[USB] Approval dialog should now be open')
  }

  const handleConfirmApprove = async () => {
    console.log('[USB-UI] Confirm Approval Clicked. Request ID:', selectedRequest?.id)

    if (!selectedRequest) {
      console.error('[USB-UI] No selected request found in state.')
      toast({ title: "Error", description: "No request selected", variant: "destructive" })
      return
    }

    setIsApproving(true)
    try {
      console.log('[USB-UI] Sending approval request for:', selectedRequest.device_name)
      const response = await fetch("/api/usb/request", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedRequest.id,
          action: "approve",
          policies: {
            max_daily_transfer_mb: null,
            allowed_start_time: approvalPolicies.allowed_start_time || null,
            allowed_end_time: approvalPolicies.allowed_end_time || null,
            expiration_date: approvalPolicies.expiration_date || null,
            is_read_only: approvalPolicies.is_read_only
          }
        })
      })

      const data = await response.json() as { success: boolean; error?: string }
      console.log('[USB-UI] Server Response:', data)

      if (!data.success) {
        throw new Error(data.error || "Failed to authorize device")
      }

      toast({ title: "Approved", description: "Device authorized successfully" })
      setIsApproveDialogOpen(false)
      fetchPendingRequests()
      fetchDevices()
    } catch (error: any) {
      console.error('[USB-UI] Approval failed:', error)
      toast({
        title: "Approval Failed",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      })
    } finally {
      setIsApproving(false)
    }
  }

  const handleReject = async (id: string) => {
    console.log('[USB] Reject button clicked for ID:', id)
    try {
      const response = await fetch("/api/usb/request", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "reject" })
      })

      console.log('[USB] Reject API response status:', response.status)
      const data = await response.json() as { success: boolean; error?: string }
      console.log('[USB] Reject API response data:', data)
      if (!data.success) throw new Error(data.error)

      toast({ title: "Rejected", description: "Request rejected" })
      fetchPendingRequests()
    } catch (error: any) {
      console.error('[USB] Reject error:', error)
      toast({ title: "Error", description: error.message, variant: "destructive" })
    }
  }

  const handleEditClick = (device: AuthorizedUSB) => {
    setEditingDevice(device)
    setEditPolicies({
      allowed_start_time: device.allowed_start_time || "",
      allowed_end_time: device.allowed_end_time || "",
      expiration_date: device.expiration_date ? new Date(device.expiration_date).toISOString().split('T')[0] : "",
      is_read_only: device.is_read_only || false
    })
    setIsEditPolicyDialogOpen(true)
  }

  const handleConfirmEdit = async () => {
    if (!editingDevice) return

    try {
      // Use secure API route instead of direct Supabase call
      const response = await fetch('/api/usb/whitelist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingDevice.id,
          max_daily_transfer_mb: null,
          allowed_start_time: editPolicies.allowed_start_time || null,
          allowed_end_time: editPolicies.allowed_end_time || null,
          expiration_date: editPolicies.expiration_date || null,
          is_read_only: editPolicies.is_read_only
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update policies')
      }

      toast({ title: "Success", description: "Device policies updated successfully" })
      setIsEditPolicyDialogOpen(false)
      fetchDevices()
    } catch (error: any) {
      console.error("Error updating policies:", error)
      toast({ title: "Error", description: "Failed to update policies", variant: "destructive" })
    }
  }

  if (loading) {
    return <div className="p-4">Loading authorized USB devices...</div>
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">USB Whitelist Management</h2>
          <p className="text-muted-foreground">Manage authorized USB devices and approval requests</p>
        </div>

        {activeTab === "authorized" && isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Manually
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Authorized USB Device</DialogTitle>
                <DialogDescription>Manually add a USB device to the whitelist</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="serial_number">Serial Number *</Label>
                  <Input
                    id="serial_number"
                    placeholder="e.g., ABC123XYZ"
                    value={formData.serial_number}
                    onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="device_name">Device Name *</Label>
                  <Input
                    id="device_name"
                    placeholder="e.g., SanDisk USB Drive"
                    value={formData.device_name}
                    onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="vendor_id">Vendor ID</Label>
                  <Input
                    id="vendor_id"
                    placeholder="e.g., 0781"
                    value={formData.vendor_id}
                    onChange={(e) => setFormData({ ...formData, vendor_id: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="product_id">Product ID</Label>
                  <Input
                    id="product_id"
                    placeholder="e.g., 5583"
                    value={formData.product_id}
                    onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="vendor_name">Vendor Name</Label>
                  <Input
                    id="vendor_name"
                    placeholder="e.g., SanDisk"
                    value={formData.vendor_name}
                    onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    placeholder="e.g., Company USB Drive #1"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <Button onClick={handleAddDevice} className="w-full">
                  Add to Whitelist
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 rounded-xl bg-muted p-1 w-fit">
        <button
          onClick={() => setActiveTab("authorized")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === "authorized"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-background/50"
            }`}
        >
          Authorized Devices ({devices.length})
        </button>
        {(isAdmin || isApprover) && (
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${activeTab === "pending"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/50"
              }`}
          >
            Pending Requests
            {pendingRequests.length > 0 && (
              <Badge variant="destructive" className="h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px]">
                {pendingRequests.length}
              </Badge>
            )}
          </button>
        )}
      </div>

      {
        activeTab === "authorized" ? (
          <Card>
            <CardHeader>
              <CardTitle>Authorized USB Devices</CardTitle>
              <CardDescription>Devices allowed to connect to the network</CardDescription>
            </CardHeader>
            <CardContent>
              {devices.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No authorized USB devices yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Device Name</TableHead>
                        <TableHead>Agent / Machine</TableHead>
                        <TableHead>Serial Number</TableHead>
                        <TableHead>Policies</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>

                        {(isAdmin || isApprover) && <TableHead>Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {devices.map((device) => (
                        <TableRow key={device.id}>
                          <TableCell className="font-medium">
                            <div>{device.device_name}</div>
                            <div className="text-xs text-muted-foreground">{device.vendor_name}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 font-medium text-sm">
                              <Monitor className="w-3 h-3 text-muted-foreground" />
                              {device.computer_name || "Unknown"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {userRole === 'admin' ? device.serial_number : '••••••••'}
                            </code>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {device.is_read_only && <Badge variant="outline" className="text-xs"><Lock className="w-3 h-3 mr-1" /> Read-Only</Badge>}
                              {device.expiration_date && <Badge variant="outline" className="text-xs"><Calendar className="w-3 h-3 mr-1" /> Exp: {new Date(device.expiration_date).toLocaleString()}</Badge>}
                              {device.allowed_start_time && <Badge variant="outline" className="text-xs"><Clock className="w-3 h-3 mr-1" /> {device.allowed_start_time}-{device.allowed_end_time}</Badge>}
                              {!device.is_read_only && !device.expiration_date && !device.allowed_start_time && (
                                <span className="text-xs text-muted-foreground">Unrestricted</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {/* Connection Status */}
                              <Badge variant={getConnectionStatus(device) === 'connected' ? "default" : "secondary"}
                                className={getConnectionStatus(device) === 'connected' ? "bg-green-500 hover:bg-green-600" : ""}
                              >
                                {getConnectionStatus(device) === 'connected' ? "Connected" : "Disconnected"}
                              </Badge>

                              {/* Authorization Status */}
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <span className={`w-2 h-2 rounded-full ${device.is_active ? "bg-green-500" : "bg-red-500"}`}></span>
                                {device.is_active ? "Authorized" : "Disabled"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(device.created_at).toLocaleDateString()}
                          </TableCell>
                          {(isAdmin || isApprover) && (
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditClick(device)}
                                  className="text-blue-600 hover:text-blue-700"
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                {isAdmin && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleToggleActive(device.id, device.is_active)}
                                      className={device.is_active ? "text-red-600 hover:text-red-700" : "text-green-600 hover:text-green-700"}
                                      title={device.is_active ? "Block Device" : "Unblock Device"}
                                    >
                                      {device.is_active ? <ShieldAlert className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteDevice(device.id)}
                                      className="text-gray-600 hover:text-gray-700"
                                      title="Delete from whitelist"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
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
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Pending Approval Requests</CardTitle>
              <CardDescription>Review and approve USB device access requests from agents</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingRequests.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
                  <p className="text-muted-foreground">No pending requests. All good!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Device</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>Requested By</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium">
                            <div>{request.device_name}</div>
                            <div className="text-xs text-muted-foreground">{request.vendor_name || "Unknown Vendor"}</div>
                            <Badge variant="outline" className="mt-1 text-xs">{request.device_class || "Unknown Class"}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-sm">
                              <div className="flex gap-2"><span className="text-muted-foreground w-12">Serial:</span> <code className="bg-muted px-1 rounded">{request.serial_number}</code></div>
                              <div className="flex gap-2"><span className="text-muted-foreground w-12">VID:</span> <code>{request.vendor_id}</code></div>
                              <div className="flex gap-2"><span className="text-muted-foreground w-12">PID:</span> <code>{request.product_id}</code></div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 font-medium text-sm">
                              <Monitor className="w-3 h-3 text-muted-foreground" />
                              {request.computer_name || "Unknown"}
                              {request.isUnknownAgent && (
                                <Badge variant="destructive" className="ml-2 text-xs">
                                  <AlertCircle className="w-3 h-3 mr-1" /> Unknown Agent
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(request.requested_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleApproveClick(request)}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleReject(request.id)}
                              >
                                Reject
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
        )
      }

      {/* Approve Dialog with Policies */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Approve Device Access</DialogTitle>
            <DialogDescription>
              Configure security policies for <strong>{selectedRequest?.device_name}</strong>.
              <br />
              <span className="text-xs text-muted-foreground">Default: Unrestricted Access (Permissive)</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 overflow-y-auto flex-1 px-1">
            {/* Read Only */}
            <div className="flex items-center justify-between border p-3 rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-base flex items-center gap-2"><Lock className="w-4 h-4" /> Read-Only Mode</Label>
                <p className="text-xs text-muted-foreground">Prevent data exfiltration (Write Blocking)</p>
              </div>
              <Switch
                checked={approvalPolicies.is_read_only}
                onCheckedChange={(checked) => setApprovalPolicies({ ...approvalPolicies, is_read_only: checked })}
              />
            </div>

            {/* Expiry */}
            <div className="grid gap-2">
              <Label className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Expiration Date (Optional)</Label>
              <Input
                type="date"
                value={approvalPolicies.expiration_date}
                onChange={(e) => setApprovalPolicies({ ...approvalPolicies, expiration_date: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Access will be automatically revoked after this date.</p>
            </div>



            {/* Time Access */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="flex items-center gap-2"><Clock className="w-4 h-4" /> Start Time</Label>
                <Input
                  type="time"
                  value={approvalPolicies.allowed_start_time}
                  onChange={(e) => setApprovalPolicies({ ...approvalPolicies, allowed_start_time: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={approvalPolicies.allowed_end_time}
                  onChange={(e) => setApprovalPolicies({ ...approvalPolicies, allowed_end_time: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)} disabled={isApproving}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmApprove}
              className="bg-green-600 hover:bg-green-700 min-w-[140px]"
              disabled={isApproving}
            >
              {isApproving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm Approval"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Policies Dialog */}
      <Dialog open={isEditPolicyDialogOpen} onOpenChange={setIsEditPolicyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Device Policies</DialogTitle>
            <DialogDescription>
              Update security policies for <strong>{editingDevice?.device_name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Read Only */}
            <div className="flex items-center justify-between border p-3 rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-base flex items-center gap-2"><Lock className="w-4 h-4" /> Read-Only Mode</Label>
                <p className="text-xs text-muted-foreground">Prevent data exfiltration (Write Blocking)</p>
              </div>
              <Switch
                checked={editPolicies.is_read_only}
                onCheckedChange={(checked) => setEditPolicies({ ...editPolicies, is_read_only: checked })}
              />
            </div>

            {/* Expiry */}
            <div className="grid gap-2">
              <Label className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Expiration Date (Optional)</Label>
              <Input
                type="date"
                value={editPolicies.expiration_date}
                onChange={(e) => setEditPolicies({ ...editPolicies, expiration_date: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Access will be automatically revoked after this date.</p>
            </div>



            {/* Time Access */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="flex items-center gap-2"><Clock className="w-4 h-4" /> Start Time</Label>
                <Input
                  type="time"
                  value={editPolicies.allowed_start_time}
                  onChange={(e) => setEditPolicies({ ...editPolicies, allowed_start_time: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={editPolicies.allowed_end_time}
                  onChange={(e) => setEditPolicies({ ...editPolicies, allowed_end_time: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditPolicyDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirmEdit} className="bg-blue-600 hover:bg-blue-700">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  )
}

