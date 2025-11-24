'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Monitor, Usb, AlertCircle, Activity, Network, List, Server, Search, ShieldCheck, Settings, Wifi, AlertTriangle, Clock, Power, Zap, ShieldAlert, Lock } from 'lucide-react';
import { NetworkTopology } from './network-topology';
import { USBWhitelistManagement } from './usb-whitelist-management';
import { QuarantineManagement } from './quarantine-management';

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
  const [viewMode, setViewMode] = useState<'list' | 'topology' | 'whitelist' | 'quarantine'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  // Derived server status - no manual override
  const serverStatus: ServerStatus = useMemo(() => {
    // Check if any device marked as server is online
    // If no device is explicitly marked as server, we might default to offline or check if *any* device is online?
    // For now, let's assume there is at least one device that should be a server.
    // If no devices are marked is_server, maybe we check if the current machine (localhost) is online?
    // But let's stick to the plan: check for is_server && status === 'online'
    const activeServer = devices.find(d => d.is_server && d.status === 'online');
    return activeServer ? 'online' : 'offline';
  }, [devices]);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://v0-project1-r9.vercel.app';

  useEffect(() => {
    fetchDevices();
    fetchLogs();
    fetchAlerts();
    fetchUsbEventsCount();

    const interval = setInterval(() => {
      fetchDevices();
      fetchLogs();
      fetchAlerts();
      fetchUsbEventsCount();
    }, 10000); // Increased to 10s to prevent UI hangs

    return () => clearInterval(interval);
  }, []);

  const fetchDevices = async () => {
    try {
      const res = await fetch(`${API_URL}/api/devices/list`);
      const data = await res.json();
      const normalizedDevices = (data.devices || []).map((device: any) => ({
        ...device,
        device_id: device.device_id || device.id,
      }));
      setDevices(normalizedDevices);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching devices:', error);
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/logs?limit=100`); // Reduced limit for dashboard performance
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
      log.log_type === 'hardware' &&
      (log.hardware_type === 'usb' || log.message?.toLowerCase().includes('usb'))
    );
  };

  const statCards = [
    {
      label: 'Total Devices',
      value: devices.length,
      accent: 'from-primary/15 via-primary/5 to-background',
      icon: Monitor,
      iconColor: 'text-primary',
    },
    {
      label: 'Online Devices',
      value: devices.filter(d => d.status === 'online' && !d.is_server).length,
      accent: 'from-emerald-500/15 via-emerald-500/5 to-background',
      icon: Network,
      iconColor: 'text-emerald-500',
    },
    {
      label: 'USB Events',
      value: usbEventCount,
      accent: 'from-purple-500/15 via-purple-500/5 to-background',
      icon: Usb,
      iconColor: 'text-purple-500',
    },
    {
      label: 'Critical Alerts',
      value: alerts.filter(a => a.severity === 'critical').length,
      accent: 'from-rose-500/15 via-rose-500/5 to-background',
      icon: AlertCircle,
      iconColor: 'text-rose-500',
    },
  ];

  const filteredDevices = useMemo(() => (
    devices.filter(device =>
      device.device_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.ip_address.includes(searchQuery)
    )
  ), [devices, searchQuery]);

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
          <div className="bg-gradient-to-br from-emerald-500/10 via-transparent to-background border border-emerald-500/30 rounded-xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none opacity-10">
              <div className="absolute -right-10 top-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-emerald-500 blur-3xl"></div>
            </div>
            <div className="relative z-10 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-widest text-muted-foreground">Server Status</p>
                  <div className="flex items-center gap-3 mt-2">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center border ${serverStatus === 'online' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600' : 'bg-rose-500/10 border-rose-500 text-rose-500'}`}>
                      <Wifi className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Agent Status</p>
                      <p className={`text-2xl font-semibold ${serverStatus === 'online' ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {serverStatus === 'online' ? 'Online' : 'Offline'}
                      </p>
                    </div>
                  </div>
                </div>
                {/* Auto-detected status indicator */}
                <div className={`h-10 w-10 rounded-full flex items-center justify-center border ${serverStatus === 'online'
                  ? 'border-emerald-500/60 text-emerald-600 bg-emerald-500/10'
                  : 'border-rose-500/60 text-rose-500 bg-rose-500/10'
                  }`}>
                  <Zap className="w-4 h-4" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg bg-background/60 border border-muted/60 p-3">
                  <p className="text-xs text-muted-foreground">Last Check</p>
                  <div className="flex items-center gap-2 mt-1 text-sm font-medium">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    {new Date().toLocaleTimeString()}
                  </div>
                </div>
                <div className="rounded-lg bg-background/60 border border-muted/60 p-3">
                  <p className="text-xs text-muted-foreground">Server Health</p>
                  <div className="flex items-center gap-2 mt-1 text-sm font-medium">
                    <AlertTriangle className={`w-4 h-4 ${serverStatus === 'online' ? 'text-emerald-500' : 'text-rose-500'}`} />
                    {serverStatus === 'online' ? 'Stable' : 'Critical'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {statCards.map((card) => (
            <div
              key={card.label}
              className={`bg-gradient-to-br ${card.accent} border border-border/40 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{card.label}</p>
                  <p className="text-2xl font-bold text-foreground">{card.value}</p>
                </div>
                <card.icon className={`w-8 h-8 ${card.iconColor}`} />
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
        ) : viewMode === 'topology' ? (
          <div className="mb-6">
            <div className="bg-card border rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Network Topology</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Visual representation of connected devices. Green connections indicate online devices, gray indicates offline.
              </p>
              <NetworkTopology devices={devices} />
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
                        <p className="font-medium text-foreground capitalize">{selectedDevice.status}</p>
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
                  </div>

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
                          const severityColor = log.severity === 'critical' ? 'text-red-600' :
                            log.severity === 'high' ? 'text-orange-600' :
                              log.severity === 'moderate' ? 'text-yellow-600' : 'text-green-600';
                          return (
                            <div key={log.id} className="p-4 hover:bg-accent transition-colors">
                              <div className="flex items-start gap-3">
                                <Usb className={`w-4 h-4 mt-0.5 ${isConnected ? 'text-green-600' : 'text-red-600'}`} />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium capitalize text-foreground">{log.event || 'USB Event'}</p>
                                    {log.severity && (
                                      <span className={`text-xs px-2 py-0.5 rounded ${severityColor} bg-opacity-10`}>
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
    </div>
  );
}