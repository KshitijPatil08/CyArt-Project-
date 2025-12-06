"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, Shield, Eye, EyeOff, Loader2, UserPlus, Lock } from "lucide-react"
import Link from "next/link"

export default function AdminSignUpPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [fullName, setFullName] = useState("")
    const [adminCode, setAdminCode] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")
        setLoading(true)

        try {
            if (adminCode !== "CYART_ADMIN_SECRET") {
                setError("Invalid Admin Code")
                setLoading(false)
                return
            }

            const { error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                        role: "admin",
                    },
                },
            })

            if (signUpError) {
                setError(signUpError.message)
            } else {
                router.push("/auth/sign-up-success")
            }
        } catch (err) {
            setError("An error occurred during sign up")
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
                    <h1 className="text-3xl font-bold tracking-tight">Admin Access</h1>
                    <p className="text-muted-foreground">Create a privileged administrative account</p>
                </div>

                {/* Sign Up Card */}
                <Card className="border-2 shadow-lg border-destructive/20">
                    <CardHeader className="space-y-1 pb-4">
                        <CardTitle className="text-2xl">Admin Registration</CardTitle>
                        <CardDescription>Enter your credentials and admin code</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSignUp} className="space-y-4">
                            {error && (
                                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 animate-in slide-in-from-top-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <p className="text-sm">{error}</p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="fullName">Full Name</Label>
                                <Input
                                    id="fullName"
                                    type="text"
                                    placeholder="Admin Name"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required
                                    disabled={loading}
                                    className="transition-all"
                                />
                            </div>

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
                                <p className="text-xs text-muted-foreground">
                                    Password must be at least 6 characters
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="adminCode" className="text-destructive font-medium flex items-center gap-2">
                                    <Lock className="w-3 h-3" />
                                    Admin Code
                                </Label>
                                <Input
                                    id="adminCode"
                                    type="password"
                                    placeholder="Enter secure admin code"
                                    value={adminCode}
                                    onChange={(e) => setAdminCode(e.target.value)}
                                    required
                                    disabled={loading}
                                    className="transition-all border-destructive/30 focus-visible:ring-destructive/30"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Required for admin privilege escalation
                                </p>
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
                                        Creating admin account...
                                    </>
                                ) : (
                                    "Create Admin Account"
                                )}
                            </Button>

                            <div className="text-sm text-center text-muted-foreground pt-2">
                                Already have an account?{" "}
                                <Link
                                    href="/auth/admin/login"
                                    className="text-destructive hover:underline font-medium transition-colors"
                                >
                                    Admin Sign in
                                </Link>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* Footer */}
                <p className="text-xs text-center text-muted-foreground">
                    Restricted Access Area. Authorized Personnel Only.
                </p>
            </div>
        </div>
    )
}
