"use client"

export const dynamic = "force-dynamic"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, Shield, Eye, EyeOff, Loader2, Lock } from "lucide-react"
import Link from "next/link"

export default function AdminLoginPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")
        setLoading(true)

        try {
            // First, check if account is locked
            const lockoutCheckResponse = await fetch("/api/auth/check-lockout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, success: false }),
            })

            const lockoutData = await lockoutCheckResponse.json()

            if (lockoutData.locked) {
                setError(lockoutData.message)
                setLoading(false)
                return
            }

            // Attempt login with Supabase
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) {
                setError(lockoutData.message || error.message)
            } else {
                // Check if user is admin
                if (data.user?.user_metadata?.role !== 'admin') {
                    await supabase.auth.signOut()
                    setError("Access Denied: Administrative privileges required.")
                    setLoading(false)
                    return
                }

                // Login successful and verified as admin
                await fetch("/api/auth/check-lockout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, success: true }),
                })

                router.push("/")
                router.refresh()
            }
        } catch (err) {
            setError("An error occurred during login")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
            <div className="w-full max-w-md space-y-8 animate-in fade-in-0 zoom-in-95 duration-500">
                {/* Header Section */}
                <div className="text-center space-y-2">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 rounded-full bg-destructive/10">
                            <Shield className="w-8 h-8 text-destructive" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Admin Portal</h1>
                    <p className="text-muted-foreground">Restricted access for security administrators</p>
                </div>

                {/* Login Card */}
                <Card className="border-2 shadow-lg border-destructive/20">
                    <CardHeader className="space-y-1 pb-4">
                        <CardTitle className="text-2xl">Admin Sign In</CardTitle>
                        <CardDescription>Enter admin credentials to continue</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            {error && (
                                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 animate-in slide-in-from-top-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <p className="text-sm">{error}</p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="admin@cyart.security"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    disabled={loading}
                                    className="transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        disabled={loading}
                                        className="pr-10 transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? (
                                            <EyeOff className="w-4 h-4" />
                                        ) : (
                                            <Eye className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                disabled={loading}
                                size="lg"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Verifying credentials...
                                    </>
                                ) : (
                                    "Admin Login"
                                )}
                            </Button>

                            <div className="text-sm text-center text-muted-foreground pt-2">
                                <Link
                                    href="/auth/login"
                                    className="text-muted-foreground hover:text-foreground hover:underline transition-colors"
                                >
                                    Return to User Login
                                </Link>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* Footer */}
                <p className="text-xs text-center text-muted-foreground">
                    Unauthorized access attempts are monitored and logged
                </p>
            </div>
        </div>
    )
}
