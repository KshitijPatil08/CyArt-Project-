"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Usb, Clock, CheckCircle2, XCircle, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface UsbRequest {
    id: string
    device_name: string
    serial_number: string
    status: 'pending' | 'approved' | 'rejected'
    requested_at: string
}

export function UserUsbRequests() {
    const [requests, setRequests] = useState<UsbRequest[]>([])
    const [loading, setLoading] = useState(true)
    const [dismissedIds, setDismissedIds] = useState<string[]>([])

    // Load dismissed IDs from local storage on mount
    useEffect(() => {
        const saved = localStorage.getItem("dismissedUsbRequests")
        if (saved) {
            setDismissedIds(JSON.parse(saved))
        }
    }, [])

    const fetchRequests = async () => {
        try {
            setLoading(true)
            const response = await fetch("/api/usb/request")
            const data = await response.json()
            if (data.success) {
                setRequests(data.requests)
            }
        } catch (error) {
            console.error("Failed to fetch requests:", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchRequests()
        // Poll every 30 seconds for status updates
        const interval = setInterval(fetchRequests, 30000)
        return () => clearInterval(interval)
    }, [])

    const handleClearCompleted = () => {
        const completedIds = requests
            .filter(r => r.status !== 'pending')
            .map(r => r.id)

        const newDismissed = [...new Set([...dismissedIds, ...completedIds])]
        setDismissedIds(newDismissed)
        localStorage.setItem("dismissedUsbRequests", JSON.stringify(newDismissed))
    }

    const filteredRequests = requests.filter(r => !dismissedIds.includes(r.id))
    const hasCompletedRequests = filteredRequests.some(r => r.status !== 'pending')

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'approved':
                return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 flex gap-1 items-center hover:bg-green-500/20"><CheckCircle2 className="w-3 h-3" /> Approved</Badge>
            case 'rejected':
                return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 flex gap-1 items-center hover:bg-red-500/20"><XCircle className="w-3 h-3" /> Rejected</Badge>
            default:
                return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 flex gap-1 items-center hover:bg-amber-500/20"><Clock className="w-3 h-3" /> Pending</Badge>
        }
    }

    return (
        <Card className="h-full border-border shadow-sm overflow-hidden flex flex-col">
            <CardHeader className="p-4 bg-muted/20 dark:bg-muted/30 border-b flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Usb className="w-4 h-4 text-primary" />
                    My USB Requests
                </CardTitle>
                <div className="flex items-center gap-1">
                    {hasCompletedRequests && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={handleClearCompleted}
                            title="Clear completed requests"
                        >
                            <Trash2 className="w-3 h-3" />
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={fetchRequests}
                        disabled={loading}
                        title="Refresh status"
                    >
                        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0 flex-1">
                <div className="h-[300px] lg:h-[400px] overflow-y-auto custom-scrollbar">
                    {filteredRequests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                            <Usb className="w-8 h-8 mb-2 opacity-20" />
                            <p className="text-xs">
                                {requests.length > 0 ? "All requests cleared" : "No USB requests found"}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredRequests.map((req) => (
                                <div key={req.id} className="p-4 space-y-2 hover:bg-accent/50 transition-colors">
                                    <div className="flex justify-between items-start gap-2">
                                        <span className="text-sm font-medium truncate flex-1">{req.device_name}</span>
                                        {getStatusBadge(req.status)}
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                                            <span className="truncate max-w-[150px]" title={req.serial_number}>S/N: {req.serial_number}</span>
                                            <span>{new Date(req.requested_at).toLocaleDateString()}</span>
                                        </div>
                                        {req.status === 'pending' && (
                                            <p className="text-[10px] text-amber-600/80 italic">Awaiting administrator review</p>
                                        )}
                                        {req.status === 'approved' && (
                                            <p className="text-[10px] text-green-600/80">Device is authorized for use</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
