'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck, AlertCircle, ChevronRight, User, Network } from 'lucide-react'
import Link from 'next/link'

interface SubnetAssignment {
    id: string
    user_id: string
    subnet_cidrs: string[]
    user_email?: string
    pending_count?: number
}

interface PendingRequest {
    id: string
    device_id: string
    ip_address: string
    device_name: string
}

export function ApproverDashboardWidget() {
    const [assignments, setAssignments] = useState<SubnetAssignment[]>([])
    const [totalPending, setTotalPending] = useState(0)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        try {
            // 1. Get user role
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const role = user.user_metadata?.role || 'user'
            const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'))
            const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'))
            setUserRole(role)

            if (!isAdmin && !isApprover) {
                setLoading(false)
                return
            }

            // 2. Fetch subnet assignments
            const assignmentRes = await fetch('/api/admin/subnets')
            const assignmentData = await assignmentRes.json()

            // 3. Fetch pending USB requests
            const requestRes = await fetch('/api/usb/request')
            const requestData = await requestRes.json()
            const pendingRequests: PendingRequest[] = requestData?.requests || []

            // 4. Fetch all devices to match subnets correctly
            const deviceRes = await fetch('/api/devices/list')
            const deviceData = await deviceRes.json()
            const allDevices = deviceData?.devices || []

            // Helper to match device to subnet
            const { isIpInSubnet } = await import('@/lib/utils/subnet')

            const rawAssignments = assignmentData?.assignments || []

            // Enforce visibility: Approver only sees their own assignment
            const filteredAssignments = isAdmin
                ? rawAssignments
                : rawAssignments.filter((a: any) => a.user_id === user.id)

            // 5. Enrich assignments with pending count and user email
            const enrichedAssignments = filteredAssignments.map((a: any) => {
                const subnetPending = pendingRequests.filter(req => {
                    // Find device IP for the request
                    let deviceIp = req.ip_address
                    if (!deviceIp) {
                        const dev = allDevices.find((d: any) => d.device_id === req.device_id)
                        deviceIp = dev?.ip_address
                    }

                    return deviceIp && a.subnet_cidrs.some((cidr: string) => {
                        try { return isIpInSubnet(deviceIp, cidr) } catch { return false }
                    })
                }).length

                return {
                    ...a,
                    pending_count: subnetPending
                }
            })

            setAssignments(enrichedAssignments)
            setTotalPending(pendingRequests.length)
        } catch (error) {
            console.error('Error fetching dashboard data:', error)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return null
    if (assignments.length === 0 && totalPending === 0) return null

    return (
        <Card className="overflow-hidden border-2 border-primary/10 shadow-lg">
            <CardHeader className="bg-primary/5 pb-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-xl flex items-center gap-2 text-primary font-bold">
                        <ShieldCheck className="w-6 h-6" />
                        USB Approval Operations
                    </CardTitle>
                    <Badge variant={totalPending > 0 ? "destructive" : "secondary"} className="text-sm px-3">
                        {totalPending} Total Pending
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="p-6 pt-4 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {assignments.map(assignment => (
                        <div
                            key={assignment.id}
                            className="group relative flex flex-col p-4 bg-card rounded-xl border border-border/60 hover:border-primary/50 transition-all hover:shadow-md"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div className="bg-primary/10 p-2 rounded-lg text-primary">
                                    <Network className="w-5 h-5" />
                                </div>
                                {assignment.pending_count ? (
                                    <Badge variant="destructive" className="animate-pulse">
                                        {assignment.pending_count} New
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="text-muted-foreground opacity-60">
                                        Quiet
                                    </Badge>
                                )}
                            </div>

                            <div className="space-y-1">
                                <h4 className="text-sm font-bold truncate">
                                    {assignment.subnet_cidrs.join(', ')}
                                </h4>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <User className="w-3.5 h-3.5" />
                                    <span className="truncate">{assignment.user_email || 'Assigned Approver'}</span>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                                    Subnet Authority
                                </span>
                                <Link href="/usb-whitelist">
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 hover:text-primary">
                                        Manage
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>

                {assignments.length === 0 && totalPending > 0 && userRole !== 'admin' && (
                    <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-600 dark:text-yellow-400">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-sm">
                            There are <strong>{totalPending}</strong> pending requests, but none match your assigned subnets. Contact an administrator for access.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
