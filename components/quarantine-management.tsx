"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertCircle, Unlock, ShieldAlert, Monitor, Plus } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { ReleaseDialog } from "./release-dialog"
import { QuarantineDialog } from "./quarantine-dialog"
import { DeviceSelectorDialog } from "./device-selector-dialog"

interface Device {
    id?: string
    device_id: string
    device_name: string
    ip_address: string
    quarantine_reason?: string
    quarantined_at?: string
    quarantined_by?: string
    status: string
    is_quarantined: boolean
}

export function QuarantineManagement() {
    const [devices, setDevices] = useState<Device[]>([])
    const [loading, setLoading] = useState(true)
    const [releaseDialogOpen, setReleaseDialogOpen] = useState(false)
    const [deviceSelectorOpen, setDeviceSelectorOpen] = useState(false)
    const [quarantineDialogOpen, setQuarantineDialogOpen] = useState(false)
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
    const [userRole, setUserRole] = useState<string | null>(null)
    const { toast } = useToast()
    const supabase = createClient()

    useEffect(() => {
        fetchUserRole()
        fetchQuarantinedDevices()
    }, [])

    const fetchUserRole = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        setUserRole(user?.user_metadata?.role || 'user')
    }

    const fetchQuarantinedDevices = async () => {
        try {
            const res = await fetch("/api/devices/list")
            const data = await res.json()

            // Show only quarantined devices and normalize IDs
            const quarantinedDevices = (data.devices || [])
                .map((d: any) => ({
                    ...d,
                    device_id: d.device_id || d.id // Ensure device_id is present
                }))
                .filter((d: Device) => d.is_quarantined)
            setDevices(quarantinedDevices)
            setLoading(false)
        } catch (error) {
            console.error("Error fetching devices:", error)
            toast({ title: "Error", description: "Failed to fetch devices", variant: "destructive" })
            setLoading(false)
        }
    }

    const handleReleaseClick = (device: Device) => {
        setSelectedDevice(device)
        setReleaseDialogOpen(true)
    }


    const handleReleaseSuccess = () => {
        fetchQuarantinedDevices()
    }

    const handleDeviceSelect = (device: { device_id: string; device_name: string; ip_address: string }) => {
        setSelectedDevice(device as Device)
        setQuarantineDialogOpen(true)
    }

    const handleQuarantineSuccess = () => {
        fetchQuarantinedDevices()
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    return (
        <div className="space-y-6 p-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-semibold text-foreground">Quarantine Management</h2>
                    <p className="text-sm text-muted-foreground">
                        View and release devices that have been quarantined from network access
                    </p>
                </div>
                {userRole === 'admin' && (
                    <Button
                        onClick={() => setDeviceSelectorOpen(true)}
                        className="gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Add Quarantine Device
                    </Button>
                )}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-red-500" />
                        Device Quarantine Management
                    </CardTitle>
                    <CardDescription>
                        Quarantined devices: {devices.length}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {devices.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Monitor className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium text-foreground">No Quarantined Devices</h3>
                            <p className="text-muted-foreground mt-1">No devices are currently quarantined.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Device</TableHead>
                                        <TableHead>IP Address</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Quarantine Reason</TableHead>
                                        <TableHead>Quarantined At</TableHead>
                                        {userRole === 'admin' && <TableHead>Actions</TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {devices.map((device) => (
                                        <TableRow key={device.device_id}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Monitor className="w-4 h-4 text-muted-foreground" />
                                                    <span className="font-medium">{device.device_name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">{device.ip_address}</TableCell>
                                            <TableCell>
                                                {device.is_quarantined ? (
                                                    <Badge className="bg-red-500 text-white">🔒 QUARANTINED</Badge>
                                                ) : (
                                                    <Badge className="bg-green-500 text-white">✓ Active</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {device.is_quarantined ? (
                                                    <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200">
                                                        {device.quarantine_reason || "Security Violation"}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {device.quarantined_at ? new Date(device.quarantined_at).toLocaleString() : "-"}
                                            </TableCell>
                                            {userRole === 'admin' && (
                                                <TableCell>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="gap-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                                        onClick={() => handleReleaseClick(device)}
                                                    >
                                                        <Unlock className="w-4 h-4" />
                                                        Release
                                                    </Button>
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

            <DeviceSelectorDialog
                open={deviceSelectorOpen}
                onOpenChange={setDeviceSelectorOpen}
                onDeviceSelect={handleDeviceSelect}
            />

            <QuarantineDialog
                open={quarantineDialogOpen}
                onOpenChange={setQuarantineDialogOpen}
                device={selectedDevice ? {
                    device_id: selectedDevice.device_id,
                    device_name: selectedDevice.device_name,
                    ip_address: selectedDevice.ip_address
                } : null}
                onSuccess={handleQuarantineSuccess}
            />

            <ReleaseDialog
                open={releaseDialogOpen}
                onOpenChange={setReleaseDialogOpen}
                device={selectedDevice}
                onSuccess={handleReleaseSuccess}
            />
        </div>
    )
}
