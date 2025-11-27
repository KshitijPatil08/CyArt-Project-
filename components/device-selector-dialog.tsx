"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Monitor, Search, AlertCircle } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface Device {
    id?: string
    device_id: string
    device_name: string
    ip_address: string
    device_type: string
    status: string
    owner: string
    location: string
    is_quarantined: boolean
}

interface DeviceSelectorDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onDeviceSelect: (device: { device_id: string; device_name: string; ip_address: string }) => void
}

export function DeviceSelectorDialog({ open, onOpenChange, onDeviceSelect }: DeviceSelectorDialogProps) {
    const [devices, setDevices] = useState<Device[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const { toast } = useToast()

    useEffect(() => {
        if (open) {
            fetchAvailableDevices()
        }
    }, [open])

    const fetchAvailableDevices = async () => {
        try {
            setLoading(true)
            const res = await fetch("/api/devices/list")
            const data = await res.json()

            // Filter to show only non-quarantined devices and normalize IDs
            const availableDevices = (data.devices || [])
                .map((d: any) => ({
                    ...d,
                    device_id: d.device_id || d.id // Ensure device_id is present
                }))
                .filter((d: Device) => !d.is_quarantined)
            setDevices(availableDevices)
        } catch (error) {
            console.error("Error fetching devices:", error)
            toast({
                title: "Error",
                description: "Failed to fetch available devices",
                variant: "destructive"
            })
        } finally {
            setLoading(false)
        }
    }

    const handleSelectDevice = (device: Device) => {
        onDeviceSelect({
            device_id: device.device_id,
            device_name: device.device_name,
            ip_address: device.ip_address
        })
        onOpenChange(false)
        setSearchQuery("") // Reset search
    }

    const filteredDevices = devices.filter(device =>
        device.device_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.ip_address.includes(searchQuery) ||
        device.owner.toLowerCase().includes(searchQuery.toLowerCase())
    )

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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[900px] max-h-[80vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Monitor className="w-5 h-5" />
                        Select Device to Quarantine
                    </DialogTitle>
                    <DialogDescription>
                        Choose a device from the list below to quarantine
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 px-1">
                    {/* Search Bar */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by device name, IP, or owner..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    {/* Device List */}
                    <div className="border rounded-lg overflow-hidden">
                        {loading ? (
                            <div className="flex items-center justify-center p-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            </div>
                        ) : filteredDevices.length === 0 ? (
                            <div className="text-center py-8">
                                <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                                <p className="text-muted-foreground">
                                    {searchQuery ? "No devices match your search" : "No available devices to quarantine"}
                                </p>
                            </div>
                        ) : (
                            <div className="max-h-[400px] overflow-y-auto overflow-x-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Device Name</TableHead>
                                            <TableHead>IP Address</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Owner</TableHead>
                                            <TableHead>Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredDevices.map((device) => (
                                            <TableRow key={device.device_id}>
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <Monitor className="w-4 h-4 text-muted-foreground" />
                                                        {device.device_name}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">
                                                    {device.ip_address}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{device.device_type}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className={getStatusColor(device.status)}>
                                                        {device.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {device.owner || "-"}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleSelectDevice(device)}
                                                        className="text-orange-600 hover:text-orange-700"
                                                    >
                                                        Select
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>

                    {/* Footer Info */}
                    {!loading && filteredDevices.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                            Showing {filteredDevices.length} of {devices.length} available device{devices.length !== 1 ? 's' : ''}
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
