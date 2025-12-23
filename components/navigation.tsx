"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  LayoutDashboard,
  Monitor,
  FileText,
  LogOut,
  User,
  Menu,
  X,
  Shield,
  ShieldAlert
} from "lucide-react"
import Link from "next/link"
import { UserMenu } from "./user-menu"

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Devices", href: "/devices", icon: Monitor },
  { name: "Logs", href: "/logs", icon: FileText },
  { name: "USB Whitelist", href: "/usb-whitelist", icon: Shield },
  { name: "Quarantine", href: "/quarantine", icon: ShieldAlert },
]

export function Navigation() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }

    getUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return null
  }

  // if (!user) {
  //   return null
  // }

  // Filter navigation items based on role
  const filteredNavigation = navigation.filter(item => {
    // Admin-only pages
    if (item.name === "Logs" || item.name === "Devices") {
      return user?.user_metadata?.role === 'admin';
    }

    // USB Whitelist and Quarantine are visible to all (regulated by component-level permissions)
    return true;
  });

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo and Desktop Navigation */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="relative w-8 h-8">
                <Image
                  src="/cyart-logo.png"
                  alt="CyArt Security"
                  fill
                  className="rounded-lg object-contain"
                />
              </div>
              <span className="text-xl font-bold text-foreground">CyArt Security</span>
            </Link>

            <div className="hidden md:flex md:gap-1">
              {filteredNavigation.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link key={item.name} href={item.href}>
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      className="gap-2"
                    >
                      <item.icon className="w-4 h-4" />
                      {item.name}
                    </Button>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            <UserMenu />

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t py-4 space-y-1 animate-in slide-in-from-top-2">
            {filteredNavigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link key={item.name} href={item.href}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    className="w-full justify-start gap-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </Button>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </nav>
  )
}

