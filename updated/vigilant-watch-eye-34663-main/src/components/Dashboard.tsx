"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Shield, Activity, AlertTriangle, Server, HardDrive, Cpu, LogOut } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MetricCard } from "@/components/MetricCard"
import { LogViewer } from "@/components/LogViewer"
import { NetworkTopology } from "@/components/NetworkTopology"
import { AlertFeed } from "@/components/AlertFeed"
import { authService } from "@/lib/auth"
import { wazuhAPI } from "@/lib/wazuh-api"
import { useToast } from "@/hooks/use-toast"

interface Metrics {
  activeSystems: number
  securityEvents: number
  activeAlerts: number
  cpuUsage: number
}

export const Dashboard = () => {
  const [loading, setLoading] = useState(false)
  const [metrics, setMetrics] = useState<Metrics>({
    activeSystems: 0,
    securityEvents: 0,
    activeAlerts: 0,
    cpuUsage: 0,
  })
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      navigate("/auth")
    }
  }, [navigate])

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const [agents, alerts, logs] = await Promise.all([
          wazuhAPI.getAgents(),
          wazuhAPI.getAlerts(),
          wazuhAPI.getLogs(),
        ])

        setMetrics({
          activeSystems: agents.filter((a: any) => a.status === "active").length,
          securityEvents: logs.length,
          activeAlerts: alerts.filter((a: any) => a.rule?.level >= 7).length,
          cpuUsage: Math.floor(Math.random() * 40) + 40, // Placeholder for CPU usage
        })
      } catch (error) {
        console.error("Failed to fetch metrics:", error)
      }
    }

    fetchMetrics()
    // Refresh metrics every 60 seconds
    const interval = setInterval(fetchMetrics, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = async () => {
    setLoading(true)
    try {
      authService.logout()
      toast({
        title: "Logged Out",
        description: "You've been successfully logged out.",
      })
      navigate("/auth")
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred during logout.",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            Security Operations Center
          </h1>
          <p className="text-muted-foreground mt-1">Real-time monitoring and threat detection</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span className="text-sm text-muted-foreground">System Active</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} disabled={loading}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Active Systems"
          value={metrics.activeSystems.toString()}
          change="+12"
          trend="up"
          icon={Server}
          color="primary"
        />
        <MetricCard
          title="Security Events"
          value={metrics.securityEvents.toLocaleString()}
          change="+89"
          trend="up"
          icon={Activity}
          color="info"
        />
        <MetricCard
          title="Active Alerts"
          value={metrics.activeAlerts.toString()}
          change="-5"
          trend="down"
          icon={AlertTriangle}
          color="warning"
        />
        <MetricCard
          title="CPU Usage"
          value={`${metrics.cpuUsage}%`}
          change="+3%"
          trend="up"
          icon={Cpu}
          color="success"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Device Topology - Takes 2 columns */}
        <Card className="lg:col-span-2 p-6 card-shadow border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" />
              Network Topology
            </h2>
          </div>
          <NetworkTopology />
        </Card>

        {/* Alert Feed */}
        <Card className="p-6 card-shadow border-border">
          <AlertFeed />
        </Card>
      </div>

      {/* Log Viewer - Full Width */}
      <Card className="p-6 card-shadow border-border">
        <LogViewer />
      </Card>
    </div>
  )
}
