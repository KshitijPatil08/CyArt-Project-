"use client"

import { useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { Usb, Loader2, ShieldPlus } from "lucide-react"

interface Device {
    device_id: string
    device_name: string
    hostname: string
}

interface UsbLog {
    id: string
    event: string
    message: string
    timestamp: string
    raw_data?: {
        serial_number?: string
        vendor_id?: string
        product_id?: string
        vendor_name?: string
        device_name?: string
        usb_name?: string
        manufacturer?: string
        friendly_name?: string
    }
}

interface UsbRequestDialogProps {
    devices: Device[]
    onSuccess?: () => void
}

export function UsbRequestDialog({ devices, onSuccess }: UsbRequestDialogProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()

    const [recentLogs, setRecentLogs] = useState<UsbLog[]>([])
    const [fetchingLogs, setFetchingLogs] = useState(false)
    const [showManual, setShowManual] = useState(false)

    const [formData, setFormData] = useState({
        serial_number: "",
        device_name: "",
        vendor_id: "",
        product_id: "",
        vendor_name: "",
        description: "",
        device_id: "",
    })

    const getUsbName = (log: UsbLog) => {
        const raw = log.raw_data
        const name = raw?.usb_name || raw?.friendly_name || raw?.device_name
        if (name) return name

        // Fallback: Parse from "USB connected: [Name]"
        if (log.message?.toLowerCase().includes('connected:')) {
            const parts = log.message.split(/connected:/i)
            if (parts.length > 1) return parts[1].trim()
        }
        return "Unknown USB Device"
    }

    const fetchRecentUsbs = async (deviceId: string) => {
        try {
            setRecentLogs([]) // Show scanning activity
            setFetchingLogs(true)
            const response = await fetch(`/api/logs?device_id=${deviceId}&usb_only=true&limit=20&full=true`)
            const data = await response.json()
            if (data.logs) {
                // Filter for "connected" events and extract unique devices by serial
                const connectedLogs = (data.logs as UsbLog[])
                    .filter(log => log.event === 'connected' || log.message.toLowerCase().includes('connected'))

                // Deduplicate by serial number
                const seenSerials = new Set()
                const uniqueLogs = connectedLogs.filter(log => {
                    const serial = log.raw_data?.serial_number
                    if (serial && !seenSerials.has(serial)) {
                        seenSerials.add(serial)
                        return true
                    }
                    return false
                })
                setRecentLogs(uniqueLogs)
            }
        } catch (error) {
            console.error("Error fetching recent USBs:", error)
        } finally {
            setFetchingLogs(false)
        }
    }

    const handleSelectLog = (log: UsbLog) => {
        const raw = log.raw_data
        const deviceName = getUsbName(log)
        setFormData(prev => ({
            ...prev,
            serial_number: raw?.serial_number || "",
            device_name: deviceName,
            vendor_id: raw?.vendor_id || "",
            product_id: raw?.product_id || "",
            vendor_name: raw?.vendor_name || raw?.manufacturer || "",
        }))
        setShowManual(true) // Show the form to allow adding a description

    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.serial_number || !formData.device_name || !formData.device_id) {
            toast({
                title: "Validation Error",
                description: "Serial Number, Device Name, and Target Machine are required.",
                variant: "destructive"
            })
            return
        }

        const selectedDevice = devices.find(d => d.device_id === formData.device_id)
        const payload = {
            ...formData,
            computer_name: selectedDevice?.hostname || "",
            device_class: "Manual Request",
            hardware_id: `MANUAL|${formData.vendor_id || "0000"}|${formData.product_id || "0000"}`
        }

        try {
            setLoading(true)
            const response = await fetch("/api/usb/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || "Failed to submit request")
            }


            setOpen(false)
            setFormData({
                serial_number: "",
                device_name: "",
                vendor_id: "",
                product_id: "",
                vendor_name: "",
                description: "",
                device_id: "",
            })
            if (onSuccess) onSuccess()
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive"
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                    <Usb className="w-4 h-4" />
                    Request USB Access
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldPlus className="w-5 h-5 text-emerald-600" />
                        Manual USB Whitelist Request
                    </DialogTitle>
                    <DialogDescription>
                        Enter the details of the USB device you want to use. An administrator will review your request.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="py-4">
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                        <div className="space-y-2">
                            <Label htmlFor="device_id">1. Select Your Machine</Label>
                            <Select
                                value={formData.device_id}
                                onValueChange={(val) => {
                                    setFormData(prev => ({ ...prev, device_id: val }))
                                    fetchRecentUsbs(val)
                                }}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Which computer are you using?" />
                                </SelectTrigger>
                                <SelectContent>
                                    {devices.map(device => (
                                        <SelectItem key={device.device_id} value={device.device_id}>
                                            {device.device_name} ({device.hostname})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {formData.device_id && (
                            <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-dashed border-border">
                                <Label className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-2">
                                    {fetchingLogs ? <Loader2 className="w-3 h-3 animate-spin" /> : <Usb className="w-3 h-3" />}
                                    2. Recently Connected Devices
                                </Label>

                                {fetchingLogs ? (
                                    <div className="py-4 text-center text-sm text-muted-foreground">Scanning logs...</div>
                                ) : recentLogs.length === 0 ? (
                                    <div className="py-2">
                                        <p className="text-xs text-muted-foreground mb-2">No recent USB connections found on this machine.</p>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setShowManual(true)}
                                            className="text-[10px] h-7"
                                        >
                                            Enter Details Manually
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {recentLogs.map((log) => (
                                            <div
                                                key={log.id}
                                                onClick={() => handleSelectLog(log)}
                                                className="flex flex-col p-2 bg-card border rounded hover:border-indigo-500/50 hover:bg-indigo-500/5 cursor-pointer transition-all overflow-hidden"
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <span className="text-sm font-medium truncate flex-1">{getUsbName(log)}</span>
                                                    <span className="text-[10px] text-muted-foreground font-mono shrink-0 break-all max-w-[120px] text-right">{log.raw_data?.serial_number}</span>
                                                </div>
                                                <div className="flex gap-2 mt-1">
                                                    <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                                        {new Date(log.timestamp).toLocaleTimeString()}
                                                    </span>
                                                    <span className="text-[9px] text-muted-foreground">
                                                        VID: {log.raw_data?.vendor_id || "????"} | PID: {log.raw_data?.product_id || "????"}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => setShowManual(!showManual)}
                                            className="text-[10px] text-muted-foreground hover:text-indigo-600 underline"
                                        >
                                            {showManual ? "Hide manual form" : "Device not listed? Enter manually"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {showManual && (
                            <div className="space-y-4 p-4 bg-indigo-50/30 dark:bg-indigo-900/10 rounded-lg border border-indigo-100 dark:border-indigo-500/20 animate-in fade-in slide-in-from-top-2">
                                <div className="space-y-2">
                                    <Label htmlFor="device_name" className="text-xs">Device Name</Label>
                                    <Input
                                        id="device_name"
                                        placeholder="e.g. My Kingston Drive"
                                        value={formData.device_name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, device_name: e.target.value }))}
                                        className="h-8"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="serial_number" className="text-xs">Serial Number</Label>
                                    <Input
                                        id="serial_number"
                                        placeholder="Exact serial number"
                                        value={formData.serial_number}
                                        onChange={(e) => setFormData(prev => ({ ...prev, serial_number: e.target.value }))}
                                        className="h-8 font-mono"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="vendor_id" className="text-xs">Vendor ID (VID)</Label>
                                        <Input
                                            id="vendor_id"
                                            placeholder="VID"
                                            value={formData.vendor_id}
                                            onChange={(e) => setFormData(prev => ({ ...prev, vendor_id: e.target.value }))}
                                            className="h-8 font-mono"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="product_id" className="text-xs">Product ID (PID)</Label>
                                        <Input
                                            id="product_id"
                                            placeholder="PID"
                                            value={formData.product_id}
                                            onChange={(e) => setFormData(prev => ({ ...prev, product_id: e.target.value }))}
                                            className="h-8 font-mono"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {(formData.serial_number || showManual) && (
                            <div className="space-y-2">
                                <Label htmlFor="description">3. Reason for Request</Label>
                                <Textarea
                                    id="description"
                                    placeholder="Briefly explain why you need to use this USB device..."
                                    value={formData.description}
                                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    className="min-h-[80px]"
                                />
                            </div>
                        )}
                    </div>

                    <DialogFooter className="mt-6 pt-4 border-t">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading || !formData.serial_number}
                            className="bg-emerald-600 hover:bg-emerald-700"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldPlus className="w-4 h-4 mr-2" />}
                            Submit Request
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
