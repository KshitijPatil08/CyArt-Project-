"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Trash2, Plus, Shield, Network, Edit, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface SubnetAssignment {
    id: string
    user_id: string
    user_email: string
    subnets: string[]
    created_at: string
}

export function SubnetAssignmentManagement() {
    const [assignments, setAssignments] = useState<SubnetAssignment[]>([])
    const [loading, setLoading] = useState(true)
    const [isOpen, setIsOpen] = useState(false)
    const { toast } = useToast()

    // Form
    const [selectedUser, setSelectedUser] = useState("")
    const [cidr, setCidr] = useState("")
    const [editingUser, setEditingUser] = useState<string | null>(null) // If set, we are editing this user

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/admin/subnets')
            const data = await res.json()
            if (data.assignments) {
                setAssignments(data.assignments)
            }
        } catch (error) {
            console.error("Failed to fetch data", error)
        } finally {
            setLoading(false)
        }
    }

    const handleOpenEdit = (assignment: SubnetAssignment) => {
        setEditingUser(assignment.user_id)
        setSelectedUser(assignment.user_id) // Keep ID for API
        setCidr(assignment.subnets.join(', '))
        setIsOpen(true)
    }

    const handleOpenNew = () => {
        setEditingUser(null)
        setSelectedUser("")
        setCidr("")
        setIsOpen(true)
    }

    const [saveLoading, setSaveLoading] = useState(false)

    const handleSave = async () => {
        if (!selectedUser) {
            toast({ title: "Error", description: "User UUID is required", variant: "destructive" })
            return
        }

        if (!cidr || cidr.trim() === "") {
            toast({ title: "Error", description: "At least one Subnet CIDR is required", variant: "destructive" })
            return
        }

        // Basic client-side format check
        const invalidCidrs = cidr.split(',').map(s => s.trim()).filter(s => s.length > 0 && !s.includes('/'));
        if (invalidCidrs.length > 0) {
            toast({
                title: "Invalid Format",
                description: `Entries must be in CIDR format (e.g., 192.168.1.0/24). Invalid: ${invalidCidrs.join(', ')}`,
                variant: "destructive"
            })
            return
        }

        setSaveLoading(true)
        try {
            const isEdit = !!editingUser

            const endpoint = '/api/admin/subnets'
            const method = isEdit ? 'PUT' : 'POST'

            const res = await fetch(endpoint, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_user_id: selectedUser,
                    subnet_cidr: cidr
                })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            toast({ title: "Success", description: isEdit ? "Assignments updated" : "Assignment created" })
            setIsOpen(false)
            fetchData()

            // Content reset if it was a new entry
            if (!isEdit) {
                setCidr("")
                setSelectedUser("")
            }

        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" })
        } finally {
            setSaveLoading(false)
        }
    }

    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [userToDelete, setUserToDelete] = useState<string | null>(null)

    const handleDeleteClick = (userId: string) => {
        setUserToDelete(userId)
        setDeleteConfirmOpen(true)
    }

    const confirmDelete = async () => {
        if (!userToDelete) return

        try {
            // Using PUT with empty list to clear all
            const res = await fetch('/api/admin/subnets', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_user_id: userToDelete,
                    subnet_cidr: "" // Empty to clear
                })
            })

            if (!res.ok) throw new Error("Failed to clear assignments")

            toast({ title: "Deleted", description: "All assignments removed for user" })
            fetchData()
        } catch (error) {
            toast({ title: "Error", description: "Delete failed", variant: "destructive" })
        } finally {
            setDeleteConfirmOpen(false)
            setUserToDelete(null)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-semibold">Subnet Assignments</h2>
                    <p className="text-sm text-muted-foreground">Assign Approver roles to specific network subnets.</p>
                </div>
                <Button onClick={handleOpenNew} className="gap-2"><Plus className="w-4 h-4" /> New Assignment</Button>

                {/* Edit/Create Dialog */}
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingUser ? 'Edit Assignments' : 'Assign Subnet Approver'}</DialogTitle>
                            <DialogDescription>
                                {editingUser
                                    ? 'Update the list of subnets for this user (comma separated).'
                                    : 'Enter the User\'s UUID and the Subnet CIDR (comma separated for multiple).'
                                }
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>User UUID</Label>
                                <Input
                                    placeholder="e.g. a0eebc99-9c0b..."
                                    value={selectedUser}
                                    onChange={e => setSelectedUser(e.target.value)}
                                    disabled={!!editingUser} // Lock ID when editing
                                />
                                {!editingUser && <p className="text-xs text-muted-foreground">Get this from the Users table.</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Subnet CIDRs</Label>
                                <Input
                                    placeholder="e.g. 192.168.1.0/24, 10.0.0.0/8"
                                    value={cidr}
                                    onChange={e => setCidr(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">Comma-separated list of CIDRs (e.g. 192.168.1.0/24, 10.10.0.0/16)</p>
                            </div>
                            <Button onClick={handleSave} className="w-full" disabled={saveLoading}>
                                {saveLoading ? 'Saving...' : (editingUser ? 'Update Assignments' : 'Assign Role')}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation Dialog */}
                <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Revoke Role Assignment?</DialogTitle>
                            <DialogDescription>
                                Are you sure you want to remove ALL subnet assignments for this user?
                                This will restrict their access and demote them to a standard User role immediately.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex justify-end gap-3 py-4">
                            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
                            <Button variant="destructive" onClick={confirmDelete}>Revoke Access</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>User / Approver</TableHead>
                            <TableHead>Assigned Subnets</TableHead>
                            <TableHead>Last Updated</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-48 text-center">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                        <p className="text-sm text-muted-foreground">Fetching assignments...</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : assignments.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                    No subnet assignments found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            assignments.map((assignment) => (
                                <TableRow key={assignment.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-100 rounded-lg">
                                                <Shield className="w-4 h-4 text-blue-600" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-medium text-foreground">{assignment.user_email}</span>
                                                <span className="text-xs text-muted-foreground font-mono">{assignment.user_id}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {assignment.subnets.map((sub, idx) => (
                                                <Badge key={idx} variant="outline" className="font-mono bg-blue-50 text-blue-700 border-blue-200">
                                                    <Network className="w-3 h-3 mr-1" />
                                                    {sub}
                                                </Badge>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {new Date(assignment.created_at).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="outline" size="sm" onClick={() => handleOpenEdit(assignment)}>
                                                <Edit className="w-4 h-4 mr-1" />
                                                Edit
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(assignment.user_id)}>
                                                <Trash2 className="w-4 h-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
