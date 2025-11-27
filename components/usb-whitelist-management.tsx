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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2, AlertCircle, CheckCircle2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface AuthorizedUSB {
  id: string
  serial_number: string
  vendor_id?: string
  product_id?: string
  device_name: string
  vendor_name?: string
  description?: string
  is_active: boolean
  created_at: string
}

export function USBWhitelistManagement() {
  const [devices, setDevices] = useState<AuthorizedUSB[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    serial_number: "",
    vendor_id: "",
    product_id: "",
    device_name: "",
    vendor_name: "",
    description: "",
  })
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchDevices()
  }, [])

  const fetchDevices = async () => {
    try {
      const { data, error } = await supabase
        .from("authorized_usb_devices")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw error
      setDevices(data || [])
      setLoading(false)
    } catch (error) {
      console.error("Error fetching authorized USB devices:", error)
      toast({ title: "Error", description: "Failed to fetch authorized USB devices", variant: "destructive" })
      setLoading(false)
    }
  }

  const handleAddDevice = async () => {
    try {
      if (!formData.serial_number || !formData.device_name) {
        toast({ title: "Error", description: "Serial number and device name are required", variant: "destructive" })
        return
      }

      const { error } = await supabase.from("authorized_usb_devices").insert([formData])

      if (error) throw error

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
      const { error } = await supabase.from("authorized_usb_devices").delete().eq("id", id)
      if (error) throw error
      toast({ title: "Success", description: "USB device removed from whitelist" })
      fetchDevices()
    } catch (error) {
      console.error("Error deleting USB device:", error)
      toast({ title: "Error", description: "Failed to delete USB device", variant: "destructive" })
    }
  }

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("authorized_usb_devices")
        .update({ is_active: !currentStatus, updated_at: new Date().toISOString() })
        .eq("id", id)
      if (error) throw error
      toast({ title: "Success", description: `USB device ${!currentStatus ? "activated" : "deactivated"}` })
      fetchDevices()
    } catch (error) {
      console.error("Error toggling USB device status:", error)
      toast({ title: "Error", description: "Failed to update USB device status", variant: "destructive" })
    }
  }

  if (loading) {
    return <div className="p-4">Loading authorized USB devices...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-foreground">USB Whitelist Management</h2>
          <p className="text-sm text-muted-foreground">Manage authorized USB devices</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Authorized USB
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Authorized USB Device</DialogTitle>
              <DialogDescription>Add a USB device to the whitelist</DialogDescription>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Authorized USB Devices</CardTitle>
          <CardDescription>Total authorized devices: {devices.length} | Active: {devices.filter(d => d.is_active).length}</CardDescription>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No authorized USB devices yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device Name</TableHead>
                    <TableHead>Serial Number</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Vendor ID</TableHead>
                    <TableHead>Product ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell className="font-medium">{device.device_name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{device.serial_number}</code>
                      </TableCell>
                      <TableCell>{device.vendor_name || "-"}</TableCell>
                      <TableCell>{device.vendor_id || "-"}</TableCell>
                      <TableCell>{device.product_id || "-"}</TableCell>
                      <TableCell>
                        <Badge className={device.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                          {device.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(device.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(device.id, device.is_active)}
                          >
                            {device.is_active ? (
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-gray-600" />
                            )}
                          </Button>
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

