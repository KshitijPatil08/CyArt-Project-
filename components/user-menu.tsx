"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu"
<<<<<<< HEAD
import { LogOut, User, Moon, Sun, Monitor, ShieldCheck } from "lucide-react"
=======
import { LogOut, User, Moon, Sun, Monitor, ShieldCheck, Shield, UserCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c

export function UserMenu() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }

    getUser()
  }, [])

  const handleLogout = async () => {
    setLoggingOut(true)
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  if (loading || !mounted) {
    return null
  }

  if (!user) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
<<<<<<< HEAD
        <Button variant="ghost" size="sm" className="gap-2" disabled={loggingOut}>
          <User className="w-4 h-4" />
          <span className="hidden sm:inline">{loggingOut ? 'Signing out...' : user.email}</span>
=======
        <Button variant="ghost" className="h-10 px-2 flex items-center gap-2 group border border-transparent hover:border-border/50 hover:bg-accent/50 transition-all rounded-lg" disabled={loggingOut}>
          <div className="bg-primary/10 p-1.5 rounded-full group-hover:bg-primary/20 transition-colors">
            <User className="w-4 h-4 text-primary" />
          </div>
          {user.user_metadata?.role && (
            <Badge
              variant="outline"
              className={`text-[10px] py-0 px-1.5 h-4.5 font-bold uppercase tracking-tight border-primary/20 bg-primary/5 text-primary`}
            >
              {Array.isArray(user.user_metadata.role) ? user.user_metadata.role[0] : user.user_metadata.role}
            </Badge>
          )}
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
<<<<<<< HEAD
            <p className="text-sm font-medium leading-none">{user.email}</p>
            <p className="text-xs leading-none text-muted-foreground">Account</p>
=======
            <p className="text-sm font-bold leading-none">{user.email}</p>
            <div className="flex items-center gap-1.5 pt-1">
              <Badge variant="secondary" className="px-1 py-0 h-4 text-[10px] uppercase font-bold tracking-wider">
                {Array.isArray(user.user_metadata?.role) ? user.user_metadata.role.join(', ') : (user.user_metadata?.role || 'User')}
              </Badge>
              <p className="text-[10px] leading-none text-muted-foreground uppercase font-bold tracking-tighter">Account Type</p>
            </div>
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

<<<<<<< HEAD
        {/* Role Management Link for Admins */}
        {user.user_metadata?.role === 'admin' && (
          <>
            <DropdownMenuItem onClick={() => router.push("/admin/roles")} disabled={loggingOut}>
              <ShieldCheck className="w-4 h-4 mr-2" />
              Role Management
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

=======
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("light")} disabled={loggingOut}>
          <Sun className="w-4 h-4 mr-2" />
          Light
          {theme === "light" && <span className="ml-auto">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} disabled={loggingOut}>
          <Moon className="w-4 h-4 mr-2" />
          Dark
          {theme === "dark" && <span className="ml-auto">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} disabled={loggingOut}>
          <Monitor className="w-4 h-4 mr-2" />
          System
          {theme === "system" && <span className="ml-auto">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} variant="destructive" disabled={loggingOut}>
          <LogOut className="w-4 h-4 mr-2" />
          {loggingOut ? 'Signing out...' : 'Sign Out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu >
  )
}
