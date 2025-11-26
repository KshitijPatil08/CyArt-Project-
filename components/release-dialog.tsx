"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Unlock, CheckCircle } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface ReleaseDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    device: {
        device_id: string
        device_name: string
        ip_address: string
        quarantine_reason?: string
        quarantined_at?: string
    } | null
    onSuccess: () => void
}

export function ReleaseDialog({ open, onOpenChange, device, onSuccess }: ReleaseDialogProps) {
    const [releaseNotes, setReleaseNotes] = useState<string>("")
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()

    const handleRelease = async () => {
        if (!device) return

        setLoading(true)

        try {
            const response = await fetch("/api/devices/quarantine", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    device_id: device.device_id,
                    released_by: "admin", // In a real app, this would come from auth context
                    release_notes: releaseNotes.trim() || undefined
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || "Failed to release device")
            }

            toast({
                title: "Success",
                description: `${device.device_name} has been released from quarantine.`
            })

            // Reset form
            setReleaseNotes("")
            onOpenChange(false)
            onSuccess()
        } catch (error) {
            console.error("Error releasing device:", error)
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to release device",
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
                        <Unlock className="w-5 h-5 text-green-600" />
                        Release from Quarantine
                    </DialogTitle>
                    <DialogDescription>
                        This will restore network access and unlock USB ports on the device.
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
                            {device.quarantine_reason && (
                                <div className="flex justify-between">
                                    <span className="text-sm font-medium">Quarantine Reason:</span>
                                    <span className="text-sm text-muted-foreground">{device.quarantine_reason}</span>
                                </div>
                            )}
                            {device.quarantined_at && (
                                <div className="flex justify-between">
                                    <span className="text-sm font-medium">Quarantined At:</span>
                                    <span className="text-sm text-muted-foreground">
                                        {new Date(device.quarantined_at).toLocaleString()}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Success Message */}
                        <div className="flex items-start gap-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-3">
                            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                            <div className="text-sm text-green-900 dark:text-green-200">
                                <p className="font-medium mb-1">Device will be restored</p>
                                <p className="text-xs">Network connectivity and USB ports will be re-enabled.</p>
                            </div>
                        </div>

                        {/* Release Notes (Optional) */}
                        <div className="space-y-2">
                            <Label htmlFor="release-notes">Release Notes (Optional)</Label>
                            <Textarea
                                id="release-notes"
                                placeholder="Add any notes about why this device is being released..."
                                value={releaseNotes}
                                onChange={(e) => setReleaseNotes(e.target.value)}
                                rows={3}
                                className="resize-none"
                            />
                        </div>
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
                        variant="default"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={handleRelease}
                        disabled={loading}
                    >
                        {loading ? "Releasing..." : "Release Device"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
