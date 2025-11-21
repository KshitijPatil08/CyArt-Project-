"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertCircle, Unlock, ShieldAlert, Monitor } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface QuarantinedDevice {
    device_id: string
    device_name: string
    ip_address: string
    quarantine_reason: string
    quarantined_at: string
    quarantined_by: string
    status: string
}

export function QuarantineManagement() {
    const [devices, setDevices] = useState<QuarantinedDevice[]>([])
    const [loading, setLoading] = useState(true)
    const { toast } = useToast()

    useEffect(() => {
        fetchQuarantinedDevices()
    }, [])

    const fetchQuarantinedDevices = async () => {
        try {
            // We fetch all devices and filter for quarantined ones
            // Ideally there should be a dedicated endpoint or filter, but for now we use the list
            const res = await fetch("/api/devices/list")
            const data = await res.json()

            const quarantined = (data.devices || []).filter((d: any) => d.is_quarantined)
            setDevices(quarantined)
            setLoading(false)
        } catch (error) {
            console.error("Error fetching quarantined devices:", error)
            toast({ title: "Error", description: "Failed to fetch quarantined devices", variant: "destructive" })
            setLoading(false)
        }
    }

    const handleRelease = async (deviceId: string, deviceName: string) => {
        if (!confirm(`Are you sure you want to release "${deviceName}" from quarantine?`)) return

        try {
            const response = await fetch("/api/devices/quarantine", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    device_id: deviceId,
                    released_by: "admin" // In a real app, this would come from auth context
                }),
            })

            if (!response.ok) throw new Error("Failed to release device")

            toast({
                title: "Success",
                description: `${deviceName} has been released from quarantine.`
            })

            fetchQuarantinedDevices()
        } catch (error) {
            console.error("Error releasing device:", error)
            toast({ title: "Error", description: "Failed to release device", variant: "destructive" })
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-semibold text-foreground">Quarantine Management</h2>
                    <p className="text-sm text-muted-foreground">
                        Manage devices that have been restricted from network access
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-red-500" />
                        Quarantined Devices
                    </CardTitle>
                    <CardDescription>
                        Currently quarantined: {devices.length} devices
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {devices.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="bg-green-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <ShieldAlert className="w-8 h-8 text-green-600" />
                            </div>
                            <h3 className="text-lg font-medium text-foreground">No Quarantined Devices</h3>
                            <p className="text-muted-foreground mt-1">All devices are compliant and have network access.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Device</TableHead>
                                        <TableHead>IP Address</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Quarantined At</TableHead>
                                        <TableHead>Quarantined By</TableHead>
                                        <TableHead>Actions</TableHead>
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
                                                <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200 hover:bg-red-500/20">
                                                    {device.quarantine_reason || "Security Violation"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {new Date(device.quarantined_at).toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {device.quarantined_by || "System"}
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                                    onClick={() => handleRelease(device.device_id, device.device_name)}
                                                >
                                                    <Unlock className="w-4 h-4" />
                                                    Release
                                                </Button>
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
