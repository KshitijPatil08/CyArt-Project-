"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trash2, Plus, ShieldAlert, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Badge } from "@/components/ui/badge"

interface SeverityRule {
    id: string
    keyword: string
    target_severity: string
    is_active: boolean
    created_at: string
}

export function SeverityRulesManagement() {
    const [rules, setRules] = useState<SeverityRule[]>([])
    const [loading, setLoading] = useState(true)
    const [newKeyword, setNewKeyword] = useState("")
    const [newSeverity, setNewSeverity] = useState("critical")
    const [isAdding, setIsAdding] = useState(false)

    const { toast } = useToast()
    const supabase = createClient()

    useEffect(() => {
        fetchRules()
    }, [])

    const fetchRules = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from("severity_rules")
                .select("*")
                .order("created_at", { ascending: false })

            if (error) throw error
            setRules(data || [])
        } catch (error) {
            toast({ title: "Error", description: "Failed to fetch severity rules", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const handleAddRule = async () => {
        if (!newKeyword.trim()) {
            toast({ title: "Validation Error", description: "Keyword cannot be empty", variant: "destructive" })
            return
        }

        try {
            setIsAdding(true)
            const { error } = await supabase
                .from("severity_rules")
                .insert([{
                    keyword: newKeyword.trim(),
                    target_severity: newSeverity,
                    is_active: true
                }])

            if (error) throw error

            toast({ title: "Success", description: "Rule added successfully" })
            setNewKeyword("")
            setNewSeverity("critical")
            fetchRules()
        } catch (error: any) {
            toast({ title: "Error", description: error.message || "Failed to add rule", variant: "destructive" })
        } finally {
            setIsAdding(false)
        }
    }

    const handleDeleteRule = async (id: string) => {
        try {
            const { error } = await supabase
                .from("severity_rules")
                .delete()
                .eq("id", id)

            if (error) throw error

            toast({ title: "Success", description: "Rule deleted successfully" })
            setRules(rules.filter(r => r.id !== id))
        } catch (error) {
            toast({ title: "Error", description: "Failed to delete rule", variant: "destructive" })
        }
    }

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case "critical": return "bg-red-500/10 text-red-500 hover:bg-red-500/20"
            case "error": return "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20"
            case "warning": return "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20"
            case "info": return "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
            default: return "bg-gray-500/10 text-gray-500"
        }
    }

    return (
        <div className="space-y-6 p-6">
            <div>
                <h2 className="text-lg font-semibold text-foreground">Severity Rules Engine</h2>
                <p className="text-sm text-muted-foreground">
                    Define keywords that automatically trigger specific severity levels for incoming logs.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Add Rule Form */}
                <Card className="lg:col-span-1 h-fit">
                    <CardHeader>
                        <CardTitle className="text-lg">Add New Rule</CardTitle>
                        <CardDescription>Create a new keyword trigger.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="keyword">Keyword or Phrase</Label>
                            <Input
                                id="keyword"
                                placeholder="e.g. 'Backup Failed' or 'Malware'"
                                value={newKeyword}
                                onChange={(e) => setNewKeyword(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">Case-insensitive match in log message.</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="severity">Target Severity</Label>
                            <Select value={newSeverity} onValueChange={setNewSeverity}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="critical">Critical</SelectItem>
                                    <SelectItem value="error">Error</SelectItem>
                                    <SelectItem value="warning">Warning</SelectItem>
                                    <SelectItem value="info">Info</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Button className="w-full gap-2" onClick={handleAddRule} disabled={isAdding}>
                            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Add Rule
                        </Button>
                    </CardContent>
                </Card>

                {/* Rules List */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg">Active Rules</CardTitle>
                        <CardDescription>
                            {rules.length} rule{rules.length !== 1 ? 's' : ''} configured
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="text-center py-8 text-muted-foreground">Loading rules...</div>
                        ) : rules.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                                No rules defined yet. Add one to get started.
                            </div>
                        ) : (
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Keyword</TableHead>
                                            <TableHead>Target Severity</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {rules.map((rule) => (
                                            <TableRow key={rule.id}>
                                                <TableCell className="font-medium">"{rule.keyword}"</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={getSeverityColor(rule.target_severity)}>
                                                        {rule.target_severity.toUpperCase()}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => handleDeleteRule(rule.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
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
        </div>
    )
}
