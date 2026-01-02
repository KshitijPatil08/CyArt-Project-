"use client"

import { useState, useEffect, useCallback } from "react"
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
    DialogFooter
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { Network, Plus, Trash2, Shield, User, Loader2, RefreshCcw } from "lucide-react"

interface SubnetAssignment {
    id: string
    user_id: string
    user_email: string
    subnet_cidrs: string[]
    created_at: string
}

interface UserInfo {
    id: string
    email: string
}

export function SubnetAssignmentManagement() {
    const [assignments, setAssignments] = useState<SubnetAssignment[]>([])
    const [availableUsers, setAvailableUsers] = useState<UserInfo[]>([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [isAddOpen, setIsAddOpen] = useState(false)
    const [selectedUserId, setSelectedUserId] = useState("")
    const [newSubnet, setNewSubnet] = useState("")

    const { toast } = useToast()
    const supabase = createClient()

    // 1. Fetch Assignments
    const fetchAssignments = useCallback(async () => {
        try {
            const response = await fetch('/api/admin/subnets')
            const data = await response.json()
            if (data.assignments) {
                setAssignments(data.assignments)
            }
        } catch (error) {
            console.error("Error fetching assignments:", error)
            toast({ title: "Error", description: "Failed to fetch assignments", variant: "destructive" })
        }
    }, [toast])

    // 2. Fetch Users (Simplified from profiles table)
    const fetchUsers = useCallback(async () => {
        try {
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('id, email')
                .order('email')

            if (error) throw error
            setAvailableUsers(profiles || [])
        } catch (error) {
            console.error("Error fetching users:", error)
        }
    }, [supabase])

    useEffect(() => {
        async function init() {
            setLoading(true)
            await Promise.all([fetchAssignments(), fetchUsers()])
            setLoading(false)
        }
        init()
    }, [fetchAssignments, fetchUsers])

    // 3. Handle Create Assignment
    const handleAddAssignment = async () => {
        if (!selectedUserId || !newSubnet) return

        // Basic CIDR validation
        if (!newSubnet.includes('/')) {
            toast({ title: "Invalid Format", description: "Please enter a valid CIDR (e.g., 192.168.1.0/24)", variant: "destructive" })
            return
        }

        try {
            setSubmitting(true)
            const res = await fetch('/api/admin/subnets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_user_id: selectedUserId,
                    subnet_cidr: newSubnet
                })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Failed to create assignment")

            toast({ title: "Success", description: "Assignment created. User promoted to Approver if applicable." })
            setIsAddOpen(false)
            setSelectedUserId("")
            setNewSubnet("")
            fetchAssignments()
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" })
        } finally {
            setSubmitting(false)
        }
    }

    // 4. Handle Delete Assignment
    const handleDelete = async (user_id: string) => {
        if (!confirm("Are you sure? This will remove the user's subnet access. If no subnets remain, they will be demoted to 'user'.")) return

        try {
            // We use PUT with empty subnets to handle demotion correctly through our logic
            const res = await fetch('/api/admin/subnets', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_user_id: user_id,
                    subnet_cidr: ""
                })
            })

            if (!res.ok) throw new Error("Failed to delete")

            toast({ title: "Success", description: "Assignment removed." })
            fetchAssignments()
        } catch (error) {
            console.error("Delete error:", error);
            toast({ title: "Error", description: "Failed to remove assignment", variant: "destructive" })
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Network className="w-5 h-5 text-indigo-600" />
                            Subnet Access Control
                        </CardTitle>
                        <CardDescription>
                            Assign IP ranges to users to delegate approval authority (Approver role)
                        </CardDescription>
                    </div>
                    <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2">
                                <Plus className="w-4 h-4" />
                                Add Assignment
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>New Subnet Assignment</DialogTitle>
                                <DialogDescription>
                                    Assigning a subnet automatically grants the user "Approver" permissions.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>Target User</Label>
                                    <Select onValueChange={setSelectedUserId} value={selectedUserId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a user" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableUsers.map(user => (
                                                <SelectItem key={user.id} value={user.id}>
                                                    {user.email}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Subnet CIDR(s)</Label>
                                    <Input
                                        placeholder="192.168.1.0/24, 10.0.0.0/16"
                                        value={newSubnet}
                                        onChange={(e) => setNewSubnet(e.target.value)}
                                    />
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Use comma to separate multiple ranges</p>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                                <Button onClick={handleAddAssignment} disabled={submitting}>
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
                                    Create & Promote
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </CardHeader>
                <CardContent>
                    <div className="bg-muted/50 rounded-lg border overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-bold">
                                <tr>
                                    <th className="px-4 py-3">User</th>
                                    <th className="px-4 py-3">Assigned Subnets</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {assignments.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                                            No active subnet assignments.
                                        </td>
                                    </tr>
                                ) : (
                                    assignments.map(assignment => (
                                        <tr key={assignment.id} className="bg-card hover:bg-muted/30 transition-colors">
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-2">
                                                    <User className="w-4 h-4 text-muted-foreground" />
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-foreground">{assignment.user_email}</span>
                                                        <span className="text-[10px] text-muted-foreground font-mono">{assignment.user_id}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {Array.isArray(assignment.subnet_cidrs) ? assignment.subnet_cidrs.map(s => (
                                                        <Badge key={s} variant="secondary" className="font-mono text-[11px]">
                                                            {s}
                                                        </Badge>
                                                    )) : (
                                                        <Badge variant="secondary" className="font-mono text-[11px]">
                                                            {assignment.subnet_cidrs}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-muted-foreground hover:text-red-500 hover:bg-red-50"
                                                    onClick={() => handleDelete(assignment.user_id)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-indigo-50/50 border-indigo-100 flex-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold text-indigo-900 uppercase">Delegation Logic</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-indigo-800 leading-relaxed">
                            When a user is assigned subnets, they are automatically granted the <strong>Approver</strong> role.
                            This allows them to approve USB requests originating from devices within those IP ranges.
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-emerald-50/50 border-emerald-100 flex-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold text-emerald-900 uppercase">Sync Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2 text-xs text-emerald-800">
                            <RefreshCcw className="w-3 h-3 text-emerald-600" />
                            <span>Real-time enforcement enabled</span>
                        </div>
                        <p className="text-[10px] text-emerald-700 mt-2">
                            Updates to assignments take effect immediately across all dashboard sessions.
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-50 border-slate-200 flex-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold text-slate-900 uppercase">Visibility</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-slate-700 leading-relaxed">
                            Approvers can only see devices and logs for their assigned subnets plus their own devices.
                            Admins retain global visibility.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

