"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Shield, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { authService } from "@/lib/auth"

const Auth = () => {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    const token = authService.getToken()
    if (token) {
      navigate("/")
    }
  }, [navigate])

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim() || !username.trim() || !password.trim() || !confirmPassword.trim()) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please fill in all fields",
      })
      return
    }

    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Passwords do not match",
      })
      return
    }

    if (password.length < 6) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Password must be at least 6 characters",
      })
      return
    }

    setLoading(true)

    try {
      const result = await authService.register(email, username, password, confirmPassword)

      if (result.success) {
        toast({
          title: "Success!",
          description: "Account created successfully. Welcome!",
        })
        navigate("/")
      } else {
        toast({
          variant: "destructive",
          title: "Registration Failed",
          description: result.error || "Failed to create account",
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!username.trim() || !password.trim()) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please enter both username and password",
      })
      return
    }

    setLoading(true)

    try {
      const result = await authService.login(username, password)

      if (result.success) {
        toast({
          title: "Welcome!",
          description: "You've successfully logged in.",
        })
        navigate("/")
      } else {
        toast({
          variant: "destructive",
          title: "Login Failed",
          description: result.error || "Invalid credentials",
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 card-shadow border-border">
        <div className="flex flex-col items-center mb-8">
          <Shield className="h-12 w-12 text-primary mb-4" />
          <h1 className="text-2xl font-bold">Security Operations Center</h1>
          <p className="text-muted-foreground text-sm mt-2">
            {isSignUp ? "Create your account" : "Login to your account"}
          </p>
        </div>

        <form onSubmit={isSignUp ? handleSignUp : handleLogin} className="space-y-4">
          {isSignUp && (
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                autoComplete="email"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              required
              autoComplete="username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              autoComplete={isSignUp ? "new-password" : "current-password"}
            />
          </div>

          {isSignUp && (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
                autoComplete="new-password"
              />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isSignUp ? "Creating account..." : "Logging in..."}
              </>
            ) : isSignUp ? (
              "Create Account"
            ) : (
              "Login"
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setEmail("")
                setUsername("")
                setPassword("")
                setConfirmPassword("")
              }}
              className="text-primary hover:underline font-medium"
            >
              {isSignUp ? "Login" : "Sign up"}
            </button>
          </p>
        </div>
      </Card>
    </div>
  )
}

export default Auth
