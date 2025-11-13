'use client';

import React, { useState, useEffect } from 'react';
import { Monitor, Usb, AlertCircle, Activity } from 'lucide-react';

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

export default function SecurityDashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://v0-project1-r9.vercel.app';

  useEffect(() => {
    fetchDevices();
    fetchLogs();
    
    const interval = setInterval(() => {
      fetchDevices();
      fetchLogs();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const fetchDevices = async () => {
    try {
      const res = await fetch(`${API_URL}/api/devices/list`);
      const data = await res.json();
      setDevices(data.devices || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching devices:', error);
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/devices/logs?limit=50`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  const getDeviceLogs = (deviceId: string) => {
    return logs.filter(log => log.device_id === deviceId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Security Monitoring Dashboard
          </h1>
          <p className="text-gray-600">
            Real-time USB and device monitoring
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Devices</p>
                <p className="text-2xl font-bold">{devices.length}</p>
              </div>
              <Monitor className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Online</p>
                <p className="text-2xl font-bold text-green-600">
                  {devices.filter(d => d.status === 'online').length}
                </p>
              </div>
              <Activity className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">USB Events</p>
                <p className="text-2xl font-bold text-purple-600">{logs.length}</p>
              </div>
              <Usb className="w-8 h-8 text-purple-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Alerts</p>
                <p className="text-2xl font-bold text-red-600">0</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Devices List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b">
                <h2 className="text-lg font-semibold">Connected Devices</h2>
              </div>
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {devices.map((device) => (
                  <div
                    key={device.device_id}
                    onClick={() => setSelectedDevice(device)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 ${
                      selectedDevice?.device_id === device.device_id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${
                        device.status === 'online' ? 'bg-green-500' : 'bg-gray-500'
                      }`}></span>
                      <h3 className="font-medium">{device.device_name}</h3>
                    </div>
                    <p className="text-sm text-gray-600">{device.owner}</p>
                    <p className="text-xs text-gray-500">{device.location}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Device Details */}
          <div className="lg:col-span-2">
            {selectedDevice ? (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold mb-4">Device Information</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Hostname</p>
                      <p className="font-medium">{selectedDevice.hostname}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">IP Address</p>
                      <p className="font-medium">{selectedDevice.ip_address}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow">
                  <div className="p-4 border-b">
                    <h2 className="text-lg font-semibold">USB Activity</h2>
                  </div>
                  <div className="divide-y max-h-96 overflow-y-auto">
                    {getDeviceLogs(selectedDevice.device_id).map((log) => (
                      <div key={log.id} className="p-4">
                        <div className="flex items-start gap-3">
                          <Usb className={`w-4 h-4 ${
                            log.event === 'connected' ? 'text-green-600' : 'text-red-600'
                          }`} />
                          <div className="flex-1">
                            <p className="font-medium capitalize">{log.event}</p>
                            <p className="text-sm text-gray-600">{log.message}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(log.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <Monitor className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">Select a Device</h3>
                <p className="text-gray-600">Choose a device to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}