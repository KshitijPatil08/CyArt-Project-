"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ShieldCheck, Clock, Trash2, CheckCircle2, XCircle, Search, Monitor, ShieldAlert } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"

interface SoftwareRequest {
    id: string
    name: string
    publisher: string
    year: string
    device_id: string
    computer_name: string
    requested_at: string
    status: string
}

interface AuthorizedSoftware {
    id: string
    name: string
    publisher: string
    created_at: string
    owner_email?: string
}

export function SoftwareManagement() {
    const [activeTab, setActiveTab] = useState<"pending" | "authorized">("pending")
    const [requests, setRequests] = useState<SoftwareRequest[]>([])
    const [authorized, setAuthorized] = useState<AuthorizedSoftware[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [isAdmin, setIsAdmin] = useState(false)
    const [isApprover, setIsApprover] = useState(false)
    const { toast } = useToast()
    const supabase = createClient()

    useEffect(() => {
        const init = async () => {
            await fetchUserStatus()
            await fetchData()
        }
        init()
        const interval = setInterval(fetchData, 10000)
        return () => clearInterval(interval)
    }, [])

    const fetchUserStatus = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            const role = user?.user_metadata?.role || 'user'
            setIsAdmin(role === 'admin' || (Array.isArray(role) && role.includes('admin')))
            setIsApprover(role === 'approver' || (Array.isArray(role) && role.includes('approver')))
        } catch (error) {
            console.error("Error fetching user status:", error)
        }
    }

    const fetchData = async () => {
        try {
            const [reqRes, authRes] = await Promise.all([
                fetch("/api/software/request"),
                fetch("/api/software/approve")
            ])

            const reqData = await reqRes.json()
            const authData = await authRes.json()

            if (reqData.success) setRequests(reqData.requests || [])
            if (authData.success) setAuthorized(authData.software || [])
        } catch (error) {
            console.error("Error fetching software data:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleAction = async (id: string, action: 'approve' | 'reject') => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            const res = await fetch("/api/software/approve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, action, owner_email: user?.email })
            })
            const data = await res.json()
            if (data.success) {

                fetchData()
            } else {
                throw new Error(data.error)
            }
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" })
        }
    }

    const handleDelete = async (id: string) => {
        try {
            const response = await fetch(`/api/software/approve?id=${id}`, {
                method: 'DELETE'
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to delete authorization')
            }


            fetchData()
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" })
        }
    }

    const filteredRequests = requests.filter(r =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.computer_name?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const filteredAuthorized = authorized.filter(a =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.publisher?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ShieldCheck className="w-6 h-6 text-primary" />
                        Software Approval Center
                    </h1>
                    <p className="text-muted-foreground text-sm">Review and authorize unverified applications across your network.</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant={activeTab === 'pending' ? 'default' : 'outline'}
                        onClick={() => setActiveTab('pending')}
                        className="gap-2"
                    >
                        <Clock className="w-4 h-4" />
                        Pending Requests
                        {requests.length > 0 && (
                            <Badge variant="secondary" className="ml-1 bg-primary/20 text-primary-foreground border-none">
                                {requests.length}
                            </Badge>
                        )}
                    </Button>
                    <Button
                        variant={activeTab === 'authorized' ? 'default' : 'outline'}
                        onClick={() => setActiveTab('authorized')}
                        className="gap-2"
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        Authorized List
                    </Button>
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search software or machines..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            <Card className="border-border shadow-sm">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/30">
                            {activeTab === 'pending' ? (
                                <TableRow>
                                    <TableHead className="w-[30%] font-semibold">Software Name</TableHead>
                                    <TableHead className="font-semibold">Context (Publisher/Year)</TableHead>
                                    <TableHead className="font-semibold">Target Machine</TableHead>
                                    <TableHead className="font-semibold text-right">Actions</TableHead>
                                </TableRow>
                            ) : (
                                <TableRow>
                                    <TableHead className="w-[40%] font-semibold">Software Name</TableHead>
                                    <TableHead className="font-semibold">Publisher</TableHead>
                                    <TableHead className="font-semibold">Authorized At</TableHead>
                                    <TableHead className="font-semibold text-right">
                                        {(isAdmin || isApprover) ? 'Actions' : ''}
                                    </TableHead>
                                </TableRow>
                            )}
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-48 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                            <p>Loading records...</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : activeTab === 'pending' ? (
                                filteredRequests.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-48 text-center text-muted-foreground">
                                            <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                            <p>No pending software requests</p>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredRequests.map((req) => (
                                        <TableRow key={req.id} className="hover:bg-muted/20 transition-colors">
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-foreground">{req.name}</span>
                                                    <span className="text-xs text-muted-foreground font-mono">ID: {req.device_id.slice(0, 8)}...</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col text-sm">
                                                    <span className="text-muted-foreground">{req.publisher || 'Unknown Publisher'}</span>
                                                    <span className="text-xs text-muted-foreground/60 italic">Released: {req.year || 'Unknown'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2 text-sm font-medium">
                                                    <Monitor className="w-4 h-4 text-muted-foreground" />
                                                    {req.computer_name || 'Generic Machine'}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                                                        onClick={() => handleAction(req.id, 'approve')}
                                                    >
                                                        <CheckCircle2 className="w-4 h-4 mr-1" />
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                                                        onClick={() => handleAction(req.id, 'reject')}
                                                    >
                                                        <XCircle className="w-4 h-4 mr-1" />
                                                        Reject
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )
                            ) : (
                                filteredAuthorized.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-48 text-center text-muted-foreground">
                                            <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                            <p>No authorized software found</p>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredAuthorized.map((app) => (
                                        <TableRow key={app.id} className="hover:bg-muted/20 transition-colors">
                                            <TableCell className="font-medium">{app.name}</TableCell>
                                            <TableCell className="text-muted-foreground">{app.publisher}</TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {new Date(app.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {(isAdmin || isApprover) && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                                                        onClick={() => handleDelete(app.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )
                            )}
                        </TableBody>
                    </ Table>
                </CardContent>
            </Card>
        </div>
    )
}
