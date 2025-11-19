'use client';

import React, { useState, useEffect } from 'react';
import { Monitor, Usb, AlertCircle, Activity, Network, List } from 'lucide-react';
import { NetworkTopology } from './network-topology';
import { Button } from '@/components/ui/button';

interface Device {
  device_id: string;
  device_name: string;
  owner: string;
  location: string;
  status: string;
  hostname: string;
  ip_address: string;
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

export default function SecurityDashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [usbEventCount, setUsbEventCount] = useState(0);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'topology'>('list');

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
    }, 5000);

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
      const res = await fetch(`${API_URL}/api/logs?limit=500`);
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Devices</p>
                <p className="text-2xl font-bold text-foreground">{devices.length}</p>
              </div>
              <Monitor className="w-8 h-8 text-primary" />
            </div>
          </div>

          <div className="bg-card border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Online</p>
                <p className="text-2xl font-bold text-green-600">
                  {devices.filter(d => d.status === 'online').length}
                </p>
              </div>
              <Activity className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-card border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">USB Events</p>
                <p className="text-2xl font-bold text-purple-600">{usbEventCount}</p>
              </div>
              <Usb className="w-8 h-8 text-purple-600" />
            </div>
          </div>

          <div className="bg-card border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Alerts</p>
                <div className="flex gap-2 items-baseline">
                  <p className="text-2xl font-bold text-red-600">{alerts.length}</p>
                  {alerts.filter(a => a.severity === 'critical').length > 0 && (
                    <span className="text-xs text-red-600">
                      ({alerts.filter(a => a.severity === 'critical').length} critical)
                    </span>
                  )}
                </div>
              </div>
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="mb-6 flex justify-end gap-2">
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="gap-2"
          >
            <List className="w-4 h-4" />
            List View
          </Button>
          <Button
            variant={viewMode === 'topology' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('topology')}
            className="gap-2"
          >
            <Network className="w-4 h-4" />
            Network Topology
          </Button>
        </div>

        {/* Main Content */}
        {viewMode === 'topology' ? (
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Devices List */}
            <div className="lg:col-span-1">
              <div className="bg-card border rounded-lg shadow-sm">
                <div className="p-4 border-b">
                  <h2 className="text-lg font-semibold text-foreground">Connected Devices</h2>
                </div>
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {devices.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Monitor className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No devices connected</p>
                  </div>
                ) : (
                  devices.map((device) => (
                    <div
                      key={device.device_id}
                      onClick={() => setSelectedDevice(device)}
                      className={`p-4 cursor-pointer hover:bg-accent transition-colors ${
                        selectedDevice?.device_id === device.device_id ? 'bg-accent border-l-2 border-l-primary' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${
                          device.status === 'online' ? 'bg-green-500' : 'bg-gray-500'
                        }`}></span>
                        <h3 className="font-medium text-foreground">{device.device_name}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">{device.owner}</p>
                      <p className="text-xs text-muted-foreground">{device.location}</p>
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
                  <h2 className="text-lg font-semibold mb-4 text-foreground">Device Information</h2>
                  <div className="grid grid-cols-2 gap-4">
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
                  </div>
                </div>

                <div className="bg-card border rounded-lg shadow-sm">
                  <div className="p-4 border-b">
                    <h2 className="text-lg font-semibold text-foreground">USB Activity</h2>
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