'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Monitor, Usb, AlertCircle, Activity, Network, List, Server, Search, ShieldCheck, Settings, Wifi, AlertTriangle, Clock, Power, Zap, ShieldAlert, Lock } from 'lucide-react';
import { NetworkTopology } from './network-topology';
import { USBWhitelistManagement } from './usb-whitelist-management';
import { QuarantineManagement } from './quarantine-management';
import { SeverityRulesManagement } from './SeverityRulesManagement';
import { createClient } from '@/lib/supabase/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Device {
  device_id: string;
  device_name: string;
  owner: string;
  location: string;
  status: string;
  hostname: string;
  ip_address: string;
  is_server?: boolean;
  is_quarantined?: boolean;
  last_seen?: string;
}

interface Log {
  id: string;
  device_id: string;
  log_type: string;
  hardware_type: string;
  event: string;
  message: string;
  severity: string;
  timestamp: string;
  raw_data?: any;
}

interface Alert {
  id: string;
  device_id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  is_read: boolean;
  is_resolved: boolean;
  created_at: string;
}

type ServerStatus = 'online' | 'offline';

export default function SecurityDashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [usbEventCount, setUsbEventCount] = useState(0);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'topology' | 'whitelist' | 'quarantine' | 'rules'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [serverStatus, setServerStatus] = useState<ServerStatus>('online');
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string>(new Date().toISOString());
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showAssignOwnerDialog, setShowAssignOwnerDialog] = useState(false);
  const [assignOwnerEmail, setAssignOwnerEmail] = useState('');

  const supabase = createClient();

  const [authorizedUSBs, setAuthorizedUSBs] = useState<any[]>([]);

  useEffect(() => {
    const fetchUserRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserRole(user?.user_metadata?.role || 'user');
      setUserEmail(user?.email || null);
    };
    fetchUserRole();
  }, []);

  const updateServerStatus = (status: ServerStatus) => {
    setServerStatus(status);
    setServerUpdatedAt(new Date().toISOString());
  };

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://v0-project1-r9.vercel.app';

  const fetchDevices = async () => {
    try {
      const res = await fetch(`${API_URL}/api/devices/list`);
      const data = await res.json();

      // Helper function to check if device is truly online
      // A device is online if status is 'online' AND last_seen is within the last 60 seconds
      const isDeviceTrulyOnline = (device: Device): boolean => {
        if (device.status !== 'online') return false;
        if (!device.last_seen) return false;

        const lastSeenTime = new Date(device.last_seen).getTime();
        const now = Date.now();
        const OFFLINE_THRESHOLD_MS = 60 * 1000; // 60 seconds

        return (now - lastSeenTime) < OFFLINE_THRESHOLD_MS;
      };

      const normalizedDevices = (data.devices || []).map((device: any) => ({
        ...device,
        device_id: device.device_id || device.id,
        // Override status based on last_seen for accurate real-time status
        status: isDeviceTrulyOnline(device) ? 'online' : 'offline',
      }));
      setDevices(normalizedDevices);

      // Auto-update server status based on devices
      const serverDevices = normalizedDevices.filter((d: Device) => d.is_server);
      if (serverDevices.length > 0) {
        const isAnyServerOnline = serverDevices.some((d: Device) => d.status === 'online');
        setServerStatus(isAnyServerOnline ? 'online' : 'offline');
      } else {
        // If no specific server device is found, strictly report offline
        // (User must register the server using the registration script)
        setServerStatus('offline');
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching devices:', error);
      setServerStatus('offline');
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/logs?limit=100`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  const fetchUsbEventsCount = async () => {
    try {
      const res = await fetch(`${API_URL}/api/logs?usb_only=true&limit=1`);
      const data = await res.json();
      setUsbEventCount(data.total || data.count || 0);
    } catch (error) {
      console.error('Error fetching USB stats:', error);
    }
  };

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/alerts/list?resolved=false`);
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  };

  const fetchAuthorizedUSBs = async () => {
    try {
      const { data, error } = await supabase
        .from("authorized_usb_devices")
        .select("*");
      if (!error && data) {
        setAuthorizedUSBs(data);
      }
    } catch (error) {
      console.error("Error fetching authorized USBs:", error);
    }
  };

  useEffect(() => {
    fetchDevices();
    fetchLogs();
    fetchAlerts();
    fetchUsbEventsCount();
    fetchAuthorizedUSBs();

    const interval = setInterval(() => {
      fetchDevices();
      fetchLogs();
      fetchAlerts();
      fetchUsbEventsCount();
      // authorized USBs don't change that often, but we can poll them too or separate it
      fetchAuthorizedUSBs();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const getDeviceLogs = (deviceId: string) => {
    // Filter logs for the device, prioritizing USB/hardware events
    const deviceLogs = logs.filter(log => log.device_id === deviceId);
    // Sort by timestamp, most recent first
    return deviceLogs.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  };

  const getUSBLogs = (deviceId: string) => {
    return getDeviceLogs(deviceId).filter(log =>
      (log.log_type === 'hardware' || log.log_type === 'usb') &&
      (log.hardware_type === 'usb' || log.message?.toLowerCase().includes('usb'))
    );
  };

  const getDeviceWhitelistedUSBs = (hostname: string) => {
    return authorizedUSBs.filter(usb =>
      usb.computer_name?.toLowerCase() === hostname?.toLowerCase()
    );
  };

  const handleAssignOwner = async () => {
    if (!selectedDevice || !assignOwnerEmail) return;

    try {
      const res = await fetch(`${API_URL}/api/devices/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: selectedDevice.device_id,
          owner_email: assignOwnerEmail
        })
      });

      const data = await res.json();

      if (res.ok) {
        // Update local state
        setDevices(devices.map(d =>
          d.device_id === selectedDevice.device_id
            ? { ...d, owner: assignOwnerEmail }
            : d
        ));
        setSelectedDevice({ ...selectedDevice, owner: assignOwnerEmail });
        setShowAssignOwnerDialog(false);
        setAssignOwnerEmail('');
        alert('Owner assigned successfully!');
      } else {
        alert(`Error: ${data.error || 'Failed to assign owner'}`);
      }
    } catch (error) {
      console.error('Error assigning owner:', error);
      alert('Failed to assign owner. Please try again.');
    }
  };

  const statCards = [
    {
      label: 'Total Devices',
      value: userRole === 'admin'
        ? devices.length
        : devices.filter(d => d.owner?.toLowerCase().trim() === userEmail?.toLowerCase().trim() && !d.is_server).length,
      borderColor: 'border-l-indigo-500',
      icon: Monitor,
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      iconBg: 'bg-indigo-50 dark:bg-indigo-500/20',
      darkGradient: 'dark:bg-gradient-to-br dark:from-slate-500/10 dark:via-slate-500/5 dark:to-transparent',
    },
    {
      label: 'Online Devices',
      value: userRole === 'admin'
        ? devices.filter(d => d.status === 'online' && !d.is_server).length
        : devices.filter(d => d.status === 'online' && !d.is_server && d.owner?.toLowerCase().trim() === userEmail?.toLowerCase().trim()).length,
      borderColor: 'border-l-emerald-500',
      icon: Network,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-500/20',
      darkGradient: 'dark:bg-gradient-to-br dark:from-slate-500/10 dark:via-slate-500/5 dark:to-transparent',
    },
    {
      label: 'USB Events',
      value: userRole === 'admin'
        ? usbEventCount
        : logs.filter(l => {
          const device = devices.find(d => d.device_id === l.device_id);
          return device &&
            device.owner?.toLowerCase().trim() === userEmail?.toLowerCase().trim() &&
            (l.log_type === 'hardware' || l.log_type === 'usb');
        }).length,
      borderColor: 'border-l-violet-500',
      icon: Usb,
      iconColor: 'text-violet-600 dark:text-violet-400',
      iconBg: 'bg-violet-50 dark:bg-violet-500/20',
      darkGradient: 'dark:bg-gradient-to-br dark:from-slate-500/10 dark:via-slate-500/5 dark:to-transparent',
    },
    {
      label: 'Critical Alerts',
      value: userRole === 'admin'
        ? alerts.filter(a => a.severity === 'critical').length
        : alerts.filter(a => {
          const device = devices.find(d => d.device_id === a.device_id);
          return a.severity === 'critical' &&
            device &&
            device.owner?.toLowerCase().trim() === userEmail?.toLowerCase().trim();
        }).length,
      borderColor: 'border-l-rose-500',
      icon: AlertCircle,
      iconColor: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-50 dark:bg-rose-500/20',
      darkGradient: 'dark:bg-gradient-to-br dark:from-slate-500/10 dark:via-slate-500/5 dark:to-transparent',
    },
  ];

  const filteredDevices = useMemo(() => (
    devices.filter(device => {
      // Standard user:
      if (userRole !== 'admin') {
        // Safety check: if user email is not loaded yet, don't show anything to non-admins
        if (!userEmail) return false;

        // 1. Hide server devices from list (they are strictly for status indicator)
        if (device.is_server) return false;

        // 2. Only show devices owned by the user (fuzzy match)
        const ownerLower = device.owner?.toLowerCase().trim() || '';
        const emailLower = userEmail.toLowerCase().trim();
        const username = emailLower.split('@')[0];

        // Match if:
        // - Exact match
        // - Owner contains username (e.g. owner="john-pc", email="john@...")
        // - Email contains owner (e.g. owner="john", email="john.doe@...")
        const isMatch =
          ownerLower === emailLower ||
          ownerLower.includes(username) ||
          (ownerLower.length > 3 && emailLower.includes(ownerLower));

        if (!isMatch) return false;
      }

      // Search filter (with null-safety)
      if (!searchQuery) return true;

      const deviceName = (device.device_name || '').toLowerCase();
      const hostname = (device.hostname || '').toLowerCase();
      const ipAddress = device.ip_address || '';
      const searchLower = searchQuery.toLowerCase();

      return (
        deviceName.includes(searchLower) ||
        hostname.includes(searchLower) ||
        ipAddress.includes(searchQuery)
      );
    })
  ), [devices, searchQuery, userRole, userEmail]);

  useEffect(() => {
    if (!filteredDevices.length) {
      setSelectedDevice(null);
      return;
    }

    const stillVisible = filteredDevices.find(device => device.device_id === selectedDevice?.device_id);
    if (!stillVisible) {
      setSelectedDevice(filteredDevices[0]);
    }
  }, [filteredDevices, selectedDevice]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Security Monitoring Dashboard
          </h1>
          <p className="text-muted-foreground">
            Real-time USB and device monitoring
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5 mb-8">
          {/* Status Card - Different for Admin vs Standard User */}
          {userRole === 'admin' ? (
            // Admin: Server Status Card
            <div className="bg-card dark:bg-gradient-to-br dark:from-slate-500/10 dark:via-slate-500/5 dark:to-transparent rounded-lg p-5 shadow-sm hover:shadow-md transition-all border border-border/40">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Server Status</p>
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-full ${serverStatus === 'online' ? 'bg-emerald-50 dark:bg-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/20'}`}>
                        <Wifi className={`w-5 h-5 ${serverStatus === 'online' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-medium mb-0.5">Server</p>
                        <p className={`text-xl font-bold ${serverStatus === 'online' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {serverStatus === 'online' ? 'Online' : 'Offline'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className={`h-10 w-10 rounded-full border ${serverStatus === 'online'
                          ? 'border-emerald-500/60 text-emerald-600 hover:bg-emerald-500/10'
                          : 'border-rose-500/60 text-rose-500 hover:bg-rose-500/10'
                          }`}
                      >
                        <div className="relative">
                          <Zap className="w-4 h-4" />
                          <span
                            className={`absolute -right-1 -bottom-1 h-2 w-2 rounded-full ${serverStatus === 'online' ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                          ></span>
                        </div>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() => updateServerStatus('online')}
                        className="gap-3"
                      >
                        <div className="h-6 w-6 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center">
                          <Power className="w-3 h-3 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Online</p>
                          <p className="text-xs text-muted-foreground">Mark server as healthy</p>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => updateServerStatus('offline')}
                        className="gap-3"
                      >
                        <div className="h-6 w-6 rounded-full bg-rose-500/15 border border-rose-500/40 flex items-center justify-center">
                          <Power className="w-3 h-3 text-rose-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Offline</p>
                          <p className="text-xs text-muted-foreground">Temporarily suppress activity</p>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ) : (
            // Standard User: Agent Status Card (shows their device status)
            (() => {
              const userDevices = devices.filter(d =>
                !d.is_server && d.owner?.toLowerCase().trim() === userEmail?.toLowerCase().trim()
              );
              const onlineDevices = userDevices.filter(d => d.status === 'online');
              const agentStatus = onlineDevices.length > 0 ? 'online' : 'offline';

              return (
                <div className="bg-card dark:bg-gradient-to-br dark:from-slate-500/10 dark:via-slate-500/5 dark:to-transparent rounded-lg p-5 shadow-sm hover:shadow-md transition-all border border-border/40">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Agent Status</p>
                        <div className="flex items-center gap-3">
                          <div className={`p-3 rounded-full ${agentStatus === 'online' ? 'bg-emerald-50 dark:bg-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/20'}`}>
                            <Monitor className={`w-5 h-5 ${agentStatus === 'online' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`} />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground font-medium mb-0.5">Your Device</p>
                            <p className={`text-xl font-bold ${agentStatus === 'online' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {agentStatus === 'online' ? 'Online' : 'Offline'}
                            </p>
                          </div>
                        </div>
                      </div>
                      {/* Status indicator only (no dropdown for standard users) */}
                      <div className={`h-10 w-10 rounded-full border flex items-center justify-center ${agentStatus === 'online'
                        ? 'border-emerald-500/60 text-emerald-600'
                        : 'border-rose-500/60 text-rose-500'
                        }`}>
                        <div className="relative">
                          <Activity className="w-4 h-4" />
                          <span
                            className={`absolute -right-1 -bottom-1 h-2 w-2 rounded-full ${agentStatus === 'online' ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                          ></span>
                        </div>
                      </div>
                    </div>
                    {userDevices.length > 1 && (
                      <p className="text-xs text-muted-foreground">
                        {onlineDevices.length} of {userDevices.length} devices online
                      </p>
                    )}
                  </div>
                </div>
              );
            })()
          )}

          {statCards.map((card) => (
            <div
              key={card.label}
              className={`bg-card rounded-lg p-5 shadow-sm hover:shadow-md transition-all ${card.darkGradient} border border-border/40`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-1.5 font-medium">{card.label}</p>
                  <p className="text-2xl font-bold text-foreground">{card.value}</p>
                </div>
                <div className={`${card.iconBg} p-3 rounded-full`}>
                  <card.icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* View Mode Toggle */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {viewMode === 'list' && (
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search devices..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto overflow-x-auto">
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="gap-2 whitespace-nowrap"
            >
              <List className="w-4 h-4" />
              List View
            </Button>
            {/* Show topology for everyone, but filtered inside */}
            <Button
              variant={viewMode === 'topology' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('topology')}
              className="gap-2 whitespace-nowrap"
            >
              <Network className="w-4 h-4" />
              Network Topology
            </Button>
            <Button
              variant={viewMode === 'whitelist' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('whitelist')}
              className="gap-2 whitespace-nowrap"
            >
              <ShieldCheck className="w-4 h-4" />
              USB Whitelist
            </Button>
            <Button
              variant={viewMode === 'quarantine' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('quarantine')}
              className="gap-2 whitespace-nowrap"
            >
              <ShieldAlert className="w-4 h-4" />
              Quarantine
            </Button>
            {userRole === 'admin' && (
              <Button
                variant={viewMode === 'rules' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('rules')}
                className="gap-2 whitespace-nowrap"
              >
                <Settings className="w-4 h-4" />
                Rules Engine
              </Button>
            )}
          </div>
        </div>

        {/* Main Content */}
        {viewMode === 'whitelist' ? (
          <div className="bg-card border rounded-lg shadow-sm">
            <USBWhitelistManagement />
          </div>
        ) : viewMode === 'quarantine' ? (
          <div className="bg-card border rounded-lg shadow-sm">
            <QuarantineManagement />
          </div>
        ) : viewMode === 'rules' ? (
          <div className="bg-card border rounded-lg shadow-sm">
            <SeverityRulesManagement />
          </div>
        ) : viewMode === 'topology' ? (
          <div className="mb-6">
            <div className="bg-card border rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Network Topology</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Visual representation of connected devices. Green connections indicate online devices, gray indicates offline.
              </p>
              <NetworkTopology
                devices={userRole === 'admin'
                  ? devices
                  : [...filteredDevices, ...devices.filter(d => d.is_server)]
                }
                userRole={userRole || 'user'}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {/* Devices List */}
            <div className="lg:col-span-1">
              <div className="bg-card border rounded-lg shadow-sm lg:sticky lg:top-24">
                <div className="p-4 border-b flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-foreground">Connected Devices</h2>
                  <span className="text-xs text-muted-foreground">{filteredDevices.length} devices</span>
                </div>
                <div className="divide-y max-h-[420px] lg:max-h-[600px] overflow-y-auto">
                  {filteredDevices.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Monitor className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No devices found</p>
                    </div>
                  ) : (
                    filteredDevices.map((device) => (
                      <div
                        key={device.device_id}
                        onClick={() => setSelectedDevice(device)}
                        className={`p-4 cursor-pointer hover:bg-accent transition-colors ${selectedDevice?.device_id === device.device_id ? 'bg-accent border-l-2 border-l-primary' : ''
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-2 h-2 rounded-full ${device.status === 'online' ? 'bg-green-500' : 'bg-gray-500'
                            }`}></span>
                          <h3 className="font-medium text-foreground flex items-center gap-2">
                            {device.is_server && <Server className="w-4 h-4 text-blue-500" />}
                            {device.is_quarantined && <Lock className="w-3 h-3 text-red-500" />}
                            {device.device_name}
                          </h3>
                        </div>
                        <p className="text-sm text-muted-foreground">{device.owner}</p>
                        <p className="text-xs text-muted-foreground">{device.location}</p>
                        {device.is_quarantined && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 mt-1">
                            Quarantined
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Device Details */}
            <div className="lg:col-span-2">
              {selectedDevice ? (
                <div className="space-y-6">
                  <div className="bg-card border rounded-lg shadow-sm p-6">
                    <div className="flex justify-between items-start mb-4">
                      <h2 className="text-lg font-semibold text-foreground">Device Information</h2>
                      {selectedDevice.is_quarantined && (
                        <div className="flex items-center gap-2 bg-red-100 text-red-800 px-3 py-1 rounded-full">
                          <Lock className="w-4 h-4" />
                          <span className="text-sm font-medium">Quarantined</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Hostname</p>
                        <p className="font-medium text-foreground">{selectedDevice.hostname}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">IP Address</p>
                        <p className="font-medium text-foreground">{selectedDevice.ip_address}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Status</p>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${selectedDevice.status === 'online' ? 'bg-emerald-500' : 'bg-gray-400'}`}></div>
                          <p className="font-medium text-foreground capitalize">
                            {selectedDevice.status === 'online' ? 'Connected to Server' : 'Offline'}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Location</p>
                        <p className="font-medium text-foreground">{selectedDevice.location}</p>
                      </div>
                      {selectedDevice.is_server && (
                        <div className="col-span-2 mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                            <Server className="w-4 h-4" />
                            <span className="font-medium text-sm">Designated Server</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Assign Owner Button - ONLY FOR ADMINS */}
                    {userRole === 'admin' && (
                      <div className="mt-4">
                        <Button
                          onClick={() => {
                            setAssignOwnerEmail(selectedDevice.owner || '');
                            setShowAssignOwnerDialog(true);
                          }}
                          variant="outline"
                          size="sm"
                          className="w-full"
                        >
                          <Settings className="w-4 h-4 mr-2" />
                          Assign Owner
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Whitelisted USBs Section - ONLY FOR STANDARD USERS */}
                  {userRole !== 'admin' && (
                    <div className="bg-card border rounded-lg shadow-sm">
                      <div className="p-4 border-b">
                        <h2 className="text-lg font-semibold text-foreground">Whitelisted USB Devices</h2>
                        <p className="text-xs text-muted-foreground">Standard authorized devices for this machine</p>
                      </div>
                      <div className="p-0">
                        {getDeviceWhitelistedUSBs(selectedDevice.hostname).length > 0 ? (
                          <div className="divide-y">
                            {getDeviceWhitelistedUSBs(selectedDevice.hostname).map((usb, idx) => (
                              <div key={usb.id || idx} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-full">
                                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                  </div>
                                  <div>
                                    <p className="font-medium text-sm">{usb.device_name}</p>
                                    <div className="flex gap-2 text-xs text-muted-foreground">
                                      <span>{usb.vendor_name || 'Unknown Vendor'}</span>
                                      <span>•</span>
                                      <code className="bg-muted px-1 rounded">{usb.serial_number}</code>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-xs">
                                  {usb.is_active ? (
                                    <span className="text-emerald-600 font-medium">Active</span>
                                  ) : (
                                    <span className="text-muted-foreground">Inactive</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-8 text-center text-muted-foreground">
                            <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p className="text-sm">No whitelisted USB devices found for {selectedDevice.hostname}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="bg-card border rounded-lg shadow-sm">
                    <div className="p-4 border-b flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">USB Activity</h2>
                        <p className="text-xs text-muted-foreground">Recent connections & security context</p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {getUSBLogs(selectedDevice.device_id).length} events
                      </span>
                    </div>
                    <div className="divide-y max-h-96 overflow-y-auto">
                      {getUSBLogs(selectedDevice.device_id).length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                          <Usb className="w-12 h-12 mx-auto mb-2 opacity-50" />
                          <p>No USB activity recorded</p>
                        </div>
                      ) : (
                        getUSBLogs(selectedDevice.device_id).map((log) => {
                          const isConnected = log.event === 'connected' || log.event === 'insert';
                          const severityColor = log.severity === 'critical' ? 'bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30' :
                            log.severity === 'high' ? 'bg-orange-600/15 text-orange-700 dark:text-orange-400 border border-orange-600/30' :
                              log.severity === 'moderate' ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30' : 'bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/30';
                          return (
                            <div key={log.id} className="p-4 hover:bg-accent transition-colors">
                              <div className="flex items-start gap-3">
                                <Usb className={`w-4 h-4 mt-0.5 ${isConnected ? 'text-green-600' : 'text-red-600'}`} />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium capitalize text-foreground">{log.event || 'USB Event'}</p>
                                    {log.severity && (
                                      <span className={`text-xs px-2 py-0.5 rounded ${severityColor}`}>
                                        {log.severity}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">{log.message}</p>
                                  {log.raw_data && typeof log.raw_data === 'object' && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {log.raw_data.usb_name && <p>Device: {log.raw_data.usb_name}</p>}
                                      {log.raw_data.serial_number && <p>Serial: {log.raw_data.serial_number}</p>}
                                    </div>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {new Date(log.timestamp).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-card border rounded-lg shadow-sm p-12 text-center">
                  <Monitor className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-medium mb-2 text-foreground">Select a Device</h3>
                  <p className="text-muted-foreground">Choose a device to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Assign Owner Dialog */}
      {showAssignOwnerDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-4">Assign Device Owner</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Enter the email address of the user who should own this device.
            </p>
            <Input
              type="email"
              placeholder="user@example.com"
              value={assignOwnerEmail}
              onChange={(e) => setAssignOwnerEmail(e.target.value)}
              className="mb-4"
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAssignOwnerDialog(false);
                  setAssignOwnerEmail('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssignOwner}
                disabled={!assignOwnerEmail}
              >
                Assign Owner
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}