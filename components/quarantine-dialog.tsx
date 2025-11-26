"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, Lock } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface QuarantineDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    device: {
        device_id: string
        device_name: string
        ip_address: string
    } | null
    onSuccess: () => void
}

const PREDEFINED_REASONS = [
    "Unauthorized USB device detected",
    "Malware or suspicious activity",
    "Policy violation",
    "Security audit requirement",
    "Network anomaly detected",
    "Custom reason"
]

export function QuarantineDialog({ open, onOpenChange, device, onSuccess }: QuarantineDialogProps) {
    const [selectedReason, setSelectedReason] = useState<string>("")
    const [customReason, setCustomReason] = useState<string>("")
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()

    const handleQuarantine = async () => {
        if (!device) return

        const reason = selectedReason === "Custom reason" ? customReason : selectedReason

        if (!reason || reason.trim() === "") {
            toast({
                title: "Error",
                description: "Please provide a reason for quarantine",
                variant: "destructive"
            })
            return
        }

        setLoading(true)

        try {
            const response = await fetch("/api/devices/quarantine", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    device_id: device.device_id,
                    reason: reason.trim(),
                    quarantined_by: "admin" // In a real app, this would come from auth context
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || "Failed to quarantine device")
            }

            toast({
                title: "Success",
                description: `${device.device_name} has been quarantined successfully.`
            })

            // Reset form
            setSelectedReason("")
            setCustomReason("")
            onOpenChange(false)
            onSuccess()
        } catch (error) {
            console.error("Error quarantining device:", error)
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to quarantine device",
                variant: "destructive"
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Lock className="w-5 h-5 text-red-500" />
                        Quarantine Device
                    </DialogTitle>
                    <DialogDescription>
                        This will restrict network access and lock USB ports on the device.
                    </DialogDescription>
                </DialogHeader>

                {device && (
                    <div className="space-y-4 py-4">
                        {/* Device Info */}
                        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                            <div className="flex justify-between">
                                <span className="text-sm font-medium">Device Name:</span>
                                <span className="text-sm text-muted-foreground">{device.device_name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm font-medium">IP Address:</span>
                                <span className="text-sm text-muted-foreground font-mono">{device.ip_address}</span>
                            </div>
                        </div>

                        {/* Warning */}
                        <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-3">
                            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                            <div className="text-sm text-red-900 dark:text-red-200">
                                <p className="font-medium mb-1">Warning</p>
                                <p className="text-xs">This action will immediately disable network connectivity and USB ports on this device.</p>
                            </div>
                        </div>

                        {/* Reason Selection */}
                        <div className="space-y-2">
                            <Label htmlFor="reason">Reason for Quarantine *</Label>
                            <Select value={selectedReason} onValueChange={setSelectedReason}>
                                <SelectTrigger id="reason">
                                    <SelectValue placeholder="Select a reason" />
                                </SelectTrigger>
                                <SelectContent>
                                    {PREDEFINED_REASONS.map((reason) => (
                                        <SelectItem key={reason} value={reason}>
                                            {reason}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Custom Reason Input */}
                        {selectedReason === "Custom reason" && (
                            <div className="space-y-2">
                                <Label htmlFor="custom-reason">Custom Reason *</Label>
                                <Textarea
                                    id="custom-reason"
                                    placeholder="Enter detailed reason for quarantine..."
                                    value={customReason}
                                    onChange={(e) => setCustomReason(e.target.value)}
                                    rows={3}
                                    className="resize-none"
                                />
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={loading}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleQuarantine}
                        disabled={loading || !selectedReason || (selectedReason === "Custom reason" && !customReason.trim())}
                    >
                        {loading ? "Quarantining..." : "Quarantine Device"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
