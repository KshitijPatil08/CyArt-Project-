"use client"

import 'reactflow/dist/style.css'
import React, { useCallback, useMemo, useState, useEffect } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  NodeTypes,
  Handle,
  Position,
} from 'reactflow'
import { Monitor, Server, Laptop, Smartphone, Lock, Box, Router, Network, Wifi, ShieldAlert, Search, Loader2, User } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

// --- Custom Error Boundary to prevent crashes ---
class ErrorBoundary extends React.Component<
  { children: React.ReactNode, fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true }
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Topology Error:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

function TopologyErrorFallback() {
  return (
    <Card className="p-12 text-center bg-slate-900 border-red-800">
      <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-red-500" />
      <h3 className="text-lg font-medium mb-2 text-slate-200">Topology Visualization Error</h3>
      <p className="text-slate-400 text-sm mb-4">Something went wrong while rendering the network graph.</p>
      <Button onClick={() => window.location.reload()} variant="outline" className="border-red-800 hover:bg-red-950">
        Reload Dashboard
      </Button>
    </Card>
  )
}

interface Device {
  device_id: string
  device_name: string
  owner: string
  location: string
  status: string
  hostname: string
  ip_address: string
  device_type?: string
  is_quarantined?: boolean
  is_server?: boolean
}

interface TopologyLog {
  device_id: string
  hardware_type: string // 'switch' | 'wifi_ap'
  raw_data: {
    switch_name?: string
    port_id?: string
    chassis_id?: string
    ssid?: string
    bssid?: string
    signal?: string
    mac?: string
    ip?: string
  }
}

interface NetworkTopologyProps {
  devices: Device[]
  userRole?: string
}

// Subnet Group Node (The "Box") - Visual Background Only
const SubnetNode = ({ data }: { data: any }) => {
  return (
    <div className="w-full h-full bg-slate-900/10 border-2 border-dashed border-slate-500/50 rounded-xl relative">
      <div className="absolute -top-3 left-4 bg-slate-950 px-2 py-0.5 text-sm font-bold text-slate-400 flex flex-col items-start gap-0 border border-slate-800 rounded-md shadow-sm">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4" />
          {data.label}
        </div>
        {data.approver && (
          <div className="flex items-center gap-1.5 text-[10px] text-sky-400/80 font-medium">
            <User className="w-3 h-3" />
            Approver: {data.approver}
          </div>
        )}
      </div>
    </div>
  )
}

// Device Node (Card Style)
const DeviceNode = ({ data }: { data: any }) => {
  const getDeviceIcon = (deviceType?: string) => {
    switch (deviceType?.toLowerCase()) {
      case 'server':
        return <Server className="w-5 h-5" />
      case 'switch':
        return <Box className="w-5 h-5" />
      case 'router':
      case 'firewall':
        return <Router className="w-5 h-5" />
      case 'wifi_ap':
        return <Wifi className="w-5 h-5" />
      case 'laptop':
        return <Laptop className="w-5 h-5" />
      case 'mobile':
      case 'smartphone':
        return <Smartphone className="w-5 h-5" />
      default:
        return <Monitor className="w-5 h-5" />
    }
  }

  const isSwitch = data.deviceType === 'switch'
  const isWifi = data.deviceType === 'wifi_ap'
  const isRouter = data.deviceType === 'router' || data.deviceType === 'firewall'
  const isOnline = data.status === 'online'
  const statusColor = isOnline ? 'bg-green-500' : 'bg-gray-500'

  // Infrastructure Node Styling (Switch/AP/Router)
  if (isSwitch || isWifi || isRouter) {
    let infrastructureColor = 'border-blue-500 bg-blue-950/80'
    let iconColor = 'text-blue-400'
    let textColor = 'text-blue-300'
    let handleColor = 'blue'

    if (isWifi) {
      infrastructureColor = 'border-purple-500 bg-purple-950/80'
      iconColor = 'text-purple-400'
      textColor = 'text-purple-300'
      handleColor = 'purple'
    } else if (isRouter) {
      infrastructureColor = 'border-orange-500 bg-orange-950/80'
      iconColor = 'text-orange-400'
      textColor = 'text-orange-300'
      handleColor = 'orange'
    }

    return (
      <div className={`px-3 py-1.5 ${infrastructureColor} border-2 rounded shadow-sm min-w-[140px] flex items-center justify-center gap-2 relative`}>
        <Handle type="target" position={Position.Top} className={`!bg-${handleColor}-500 !w-2 !h-2`} />
        <Handle type="source" position={Position.Bottom} className={`!bg-${handleColor}-500 !w-2 !h-2`} />
        {getDeviceIcon(data.deviceType)}
        <div className="flex flex-col items-start">
          <span className={`text-xs font-bold ${textColor}`}>{data.label}</span>
          {data.details && <span className="text-[10px] text-slate-400">{data.details}</span>}
        </div>
      </div>
    )
  }

  // Standard Device Styling
  const borderColor = data.isQuarantined ? 'border-red-500' : (isOnline ? 'border-green-500' : 'border-gray-500')
  const bgColor = data.isQuarantined ? 'bg-red-950/30' : 'bg-slate-900'
  const showIp = data.userRole === 'admin'

  return (
    <div className={`px-3 py-2 ${bgColor} border ${borderColor} rounded shadow-sm w-[160px] relative`}>
      {/* Handles for manual connections - invisible but functional */}
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-2 !h-2 !opacity-0" />
      <Handle type="source" position={Position.Top} className="!bg-slate-500 !w-2 !h-2 !opacity-0" />

      <Handle type="target" position={Position.Bottom} className="!bg-slate-500 !w-2 !h-2 !opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-2 !h-2 !opacity-0" />

      <Handle type="target" position={Position.Left} className="!bg-slate-500 !w-2 !h-2 !opacity-0" />
      <Handle type="source" position={Position.Left} className="!bg-slate-500 !w-2 !h-2 !opacity-0" />

      <Handle type="target" position={Position.Right} className="!bg-slate-500 !w-2 !h-2 !opacity-0" />
      <Handle type="source" position={Position.Right} className="!bg-slate-500 !w-2 !h-2 !opacity-0" />

      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${statusColor}`} />
        {getDeviceIcon(data.deviceType)}
        {data.isQuarantined && <Lock className="w-3 h-3 text-red-500" />}
        <div className="flex-1 overflow-hidden">
          <h3 className="font-semibold text-xs text-slate-200 truncate" title={data.label}>{data.label}</h3>
        </div>
      </div>
      {showIp && (
        <div className="text-[10px] text-slate-400 truncate">
          {data.ipAddress}
        </div>
      )}
    </div>
  )
}

// Custom Wired Edge (Orthogonal: Down -> Over -> Down)
const WiredEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
}: any) => {
  const midY = (sourceY + targetY) / 2
  const path = `M ${sourceX} ${sourceY} L ${sourceX} ${midY} L ${targetX} ${midY} L ${targetX} ${targetY}`

  return (
    <path
      id={id}
      style={style}
      className="react-flow__edge-path"
      d={path}
      markerEnd={markerEnd}
    />
  )
}

// Custom Wireless Edge (Dashed curved line)
const WirelessEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
}: any) => {
  // Bezier curve
  const path = `M ${sourceX} ${sourceY} C ${sourceX} ${targetY}, ${targetX} ${sourceY}, ${targetX} ${targetY}`

  return (
    <path
      id={id}
      style={{ ...style, strokeDasharray: '5,5' }}
      className="react-flow__edge-path"
      d={path}
      markerEnd={markerEnd}
    />
  )
}

const nodeTypes: NodeTypes = {
  device: DeviceNode,
  subnet: SubnetNode,
}

const edgeTypes = {
  wired: WiredEdge,
  wireless: WirelessEdge,
}

export function NetworkTopology(props: NetworkTopologyProps) {
  return (
    <ErrorBoundary fallback={<TopologyErrorFallback />}>
      <NetworkTopologyInternal {...props} />
    </ErrorBoundary>
  )
}

function NetworkTopologyInternal({ devices, userRole = 'user' }: NetworkTopologyProps) {
  const [topologyLogs, setTopologyLogs] = useState<TopologyLog[]>([])
  const [discoveredDevices, setDiscoveredDevices] = useState<any[]>([])
  const [subnetAssignments, setSubnetAssignments] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Fetch Topology Logs on Mount with useCallback
  const fetchTopology = useCallback(async () => {
    try {
      // Don't set loading on every refresh, only initial if desired or handled elsewhere
      // setIsLoading(true) 
      const [logsRes, assignmentsRes] = await Promise.all([
        fetch("/api/logs?log_type=network_topology&limit=200"),
        fetch("/api/admin/subnets")
      ])

      const logsData = await logsRes.json()
      if (logsData.logs) {
        // Parse raw data if it's stringified
        const parsedLogs = logsData.logs.map((log: any) => ({
          ...log,
          raw_data: typeof log.raw_data === 'string' ? JSON.parse(log.raw_data) : log.raw_data
        }))
        setTopologyLogs(parsedLogs)
      }

      const assignmentsData = await assignmentsRes.json()
      if (assignmentsData.success) {
        setSubnetAssignments(assignmentsData.assignments || [])
      }
    } catch (e) {
      console.error("Failed to fetch topology logs", e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTopology()
    // Auto-refresh every 15 seconds
    const interval = setInterval(fetchTopology, 15000)
    return () => clearInterval(interval)
  }, [fetchTopology])

  const { initialNodes, initialEdges } = useMemo(() => {
    // Determine if we should render discovered devices or just standard devices
    // Logic: If discovered devices exist, render them too.

    // We need to merge standard `devices` and `discoveredDevices`
    // Standard devices have rich metadata. Discovered devices just have IP/Type.

    // Combine for node generation
    // ... (rest of the logic needs to account for discoveredDevices)

    const nodes: Node[] = []
    const edges: Edge[] = []

    // --- HELPER to check if IP already placed ---
    const placedIps = new Set<string>()

    // 1. Identify Main Server
    // STRICT SERVER DETECTION: Only accept explicit is_server flag or exact device_type match.
    // REMOVED loose name matching (d.device_name.includes('server')) per user request.
    const servers = devices.filter(d => d.is_server || d.device_type?.toLowerCase() === 'server')
    const mainServer = servers.length > 0 ? servers[0] : null
    const mainServerId = mainServer ? mainServer.device_id : 'virtual-server'

    // 2. Identify Infrastructure Nodes (Switches / APs) from Logs
    const infrastructureMap = new Map<string, Node>() // ID -> Node
    const deviceConnections = new Map<string, string>() // DeviceID -> InfrastructureID

    devices.forEach(device => {
      // Find latest topology log for this device
      const logs = topologyLogs
        .filter(l => l.device_id === device.device_id)
      // Sort by timestamp if available in future, for now take last (latest fetch)

      // Process ALL logs to find all infrastructure (Gateway + AP + Switch)
      let bestConnectionId = ""
      let bestConnectionPriority = 999 // 1 = Wifi/Switch (L2), 2 = Gateway (L3)

      if (logs.length > 0) {
        logs.forEach(log => {
          let infraId = ""
          let infraLabel = ""
          let infraType = ""
          let infraDetails = ""
          let priority = 999

          if (log.hardware_type === 'wifi_ap') {
            infraId = `ap-${log.raw_data.bssid?.replace(/:/g, '') || 'unknown'}`
            infraLabel = log.raw_data.ssid || 'WiFi AP'
            infraType = 'wifi_ap'
            infraDetails = 'Signal: ' + (log.raw_data.signal || 'N/A')
            priority = 1
          } else if (log.hardware_type === 'switch') {
            infraId = `sw-${log.raw_data.chassis_id?.replace(/:/g, '') || log.raw_data.switch_name || 'unknown'}`
            infraLabel = log.raw_data.switch_name || 'Switch'
            infraType = 'switch'
            infraDetails = 'Port: ' + (log.raw_data.port_id || 'Unknown Port')
            priority = 1
          } else if (log.hardware_type === 'router' || log.hardware_type === 'firewall' || log.hardware_type === 'repeater') {
            infraId = `gw-${log.raw_data.mac?.replace(/:/g, '') || log.raw_data.ip?.replace(/\./g, '-') || 'unknown'}`
            infraLabel = log.raw_data.switch_name || 'Gateway'
            infraType = log.hardware_type
            infraDetails = 'IP: ' + log.raw_data.ip
            priority = 2
          }

          if (infraId) {
            // 1. Ensure Infrastructure Node Exists
            if (!infrastructureMap.has(infraId)) {
              infrastructureMap.set(infraId, {
                id: infraId,
                type: 'device',
                position: { x: 0, y: 0 }, // Placeholder
                data: {
                  label: infraLabel,
                  deviceType: infraType,
                  details: infraDetails,
                  status: 'online',
                  userRole: userRole,
                },
                zIndex: 10,
              })
            }

            // 2. Determine Best Connection (Prioritize L2 over L3)
            // If we already have a connection, only overwrite if new one is higher priority (lower number)
            if (priority < bestConnectionPriority) {
              bestConnectionPriority = priority
              bestConnectionId = infraId
            }
          }
        })
      }

      // Link Agent to the best infrastructure found
      if (bestConnectionId) {
        deviceConnections.set(device.device_id, bestConnectionId)
      }
    })

    // 2.5. Integrate Discovered Infrastructure (SNMP/SSDP)
    // If we found a Switch or AP via SNMP, use it as valid infrastructure for that subnet
    discoveredDevices.forEach(dd => {
      const isInfra = dd.type === 'switch' || dd.type === 'wireless-ap' || dd.type === 'router' || dd.type === 'firewall'

      if (isInfra) {
        // Use IP or timestamp as ID if mac is missing
        const infraId = `disc-${dd.ip.replace(/\./g, '-')}`

        if (!infrastructureMap.has(infraId)) {
          infrastructureMap.set(infraId, {
            id: infraId,
            type: 'device',
            position: { x: 0, y: 0 },
            data: {
              label: dd.hostname !== 'Unknown' ? dd.hostname : `Discovered ${dd.type}`,
              deviceType: dd.type === 'wireless-ap' ? 'wifi_ap' : 'switch',
              details: dd.vendor !== 'Unknown' ? dd.vendor : 'SNMP Discovered',
              status: 'online',
              userRole: userRole,
            },
            zIndex: 10,
          })

          // Heuristic: Assign this infra to its subnet
          // We can't know for sure which agents connect to it without LLDP, 
          // but we can map the subnet to this infra ID so we prefer it over the Server.
          const subnet = dd.ip.split('.').slice(0, 3).join('.')
          // We'll use a special map to track "Default Infra for Subnet"
          // implementation detail: strictly speaking we need a new map or we iterate later
        }
      }
    })

    // 3. Group Agents by Subnet (Fallback for those without LLDP/WiFi logs)
    const agents = devices.filter(d => !servers.includes(d))
    const subnetMap = new Map<string, Device[]>()

    agents.forEach(agent => {
      let subnet = 'Unknown'

      // TEAM/LOCATION OVERRIDE: If a location is set, group by that instead of IP.
      if (agent.location && agent.location.trim().length > 0) {
        subnet = agent.location.trim()
      } else {
        // Fallback to IP-based subnet
        const ipParts = (agent.ip_address || '0.0.0.0').split('.')
        subnet = ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}` : 'Unknown'
      }

      if (!subnetMap.has(subnet)) subnetMap.set(subnet, [])
      subnetMap.get(subnet)?.push(agent)
    })

    // --- RADIAL LAYOUT ---
    const CENTER_X = 0
    const CENTER_Y = 0

    // Place Main Server
    if (mainServer) {
      nodes.push({
        id: mainServer.device_id,
        type: 'device',
        position: { x: CENTER_X, y: CENTER_Y },
        data: {
          label: mainServer.device_name,
          ipAddress: mainServer.ip_address,
          status: mainServer.status,
          deviceType: 'server',
          isQuarantined: mainServer.is_quarantined,
          userRole: userRole,
        },
        zIndex: 100,
      })
    } else {
      nodes.push({
        id: 'virtual-server',
        type: 'device',
        position: { x: CENTER_X, y: CENTER_Y },
        data: {
          label: 'Server',
          ipAddress: '',
          status: 'offline',
          deviceType: 'server',
          userRole: userRole,
        },
        zIndex: 100,
      })
    }

    const subnets = Array.from(subnetMap.keys())
    const RADIUS = 450
    const ANGLE_STEP = (2 * Math.PI) / (subnets.length || 1)

    subnets.forEach((subnet, index) => {
      const angle = index * ANGLE_STEP
      const subnetAgents = subnetMap.get(subnet) || []

      // Calculate Group Center
      const groupCenterX = CENTER_X + RADIUS * Math.cos(angle)
      const groupCenterY = CENTER_Y + RADIUS * Math.sin(angle)

      // Determine what infrastructure exists in this subnet
      // Filter infrastructureMap to find nodes that these agents are connected to
      const subnetInfraNodes = new Set<string>()
      subnetAgents.forEach(agent => {
        const conn = deviceConnections.get(agent.device_id)
        if (conn) subnetInfraNodes.add(conn)
      })

      // If no LLDP infra found, look for Discovered Infra in this subnet
      if (subnetInfraNodes.size === 0) {
        infrastructureMap.forEach((node, id) => {
          // Check if this node is in the current subnet
          if (id.startsWith('disc-')) {
            const originalIp = id.replace('disc-', '').replace(/-/g, '.')
            const nodeSubnet = originalIp.split('.').slice(0, 3).join('.')
            if (nodeSubnet === subnet) {
              subnetInfraNodes.add(id)
            }
          }
        })
      }

      // Calculate Subnet Dimensions
      // Classify Infrastructure
      const gateways: string[] = []
      const aps: string[] = []
      const switches: string[] = []

      // Enhanced Discovery: Look for any candidate gateway in Discovered Devices if none found in logs
      if (subnetInfraNodes.size === 0) {
        // Find any device ending in .1 or .254 in this subnet from discoveredDevices list
        const candidate = discoveredDevices.find(dd => {
          const ipParts = dd.ip.split('.')
          const ddSubnet = ipParts.slice(0, 3).join('.')
          const lastOctet = parseInt(ipParts[3])
          return ddSubnet === subnet && (lastOctet === 1 || lastOctet === 254)
        })

        if (candidate) {
          // We found a likely gateway via SNMP/Scan! Use it.
          const infraId = `disc-${candidate.ip.replace(/\./g, '-')}`

          // Ensure it exists in the map
          if (!infrastructureMap.has(infraId)) {
            infrastructureMap.set(infraId, {
              id: infraId,
              type: 'device',
              position: { x: 0, y: 0 },
              data: {
                label: candidate.hostname || 'Gateway',
                deviceType: 'router',
                details: candidate.vendor || 'Discovered',
                status: 'online',
                userRole: userRole,
              },
              zIndex: 10,
            })
          }
          subnetInfraNodes.add(infraId)
        }
      }

      subnetInfraNodes.forEach(id => {
        const node = infrastructureMap.get(id)
        if (node) {
          if (node.data.deviceType === 'router' || node.data.deviceType === 'firewall') {
            gateways.push(id)
          } else if (node.data.deviceType === 'wifi_ap') {
            aps.push(id)
          } else {
            switches.push(id)
          }
        }
      })

      // Level 2 consists of APs and Switches
      const level2Nodes = [...aps, ...switches]

      const hasGateway = gateways.length > 0
      const hasLevel2 = level2Nodes.length > 0

      // Layout Constants
      const LAYER_HEIGHT = 150
      const PADDING_TOP = 60
      const PADDING_BOTTOM = 60

      // Dynamic Height Calculation
      let calculatedHeight = PADDING_TOP + PADDING_BOTTOM
      if (hasGateway) calculatedHeight += LAYER_HEIGHT
      if (hasLevel2) calculatedHeight += LAYER_HEIGHT
      if (subnetAgents.length > 0) calculatedHeight += LAYER_HEIGHT

      const subnetWidth = Math.max(400, Math.max(gateways.length, level2Nodes.length, subnetAgents.length) * 180 + 40)
      const subnetHeight = Math.max(250, calculatedHeight) // Ensure minimum height

      // Top-Left corner for the Group Box
      const groupBoxX = groupCenterX - (subnetWidth / 2)
      const groupBoxY = groupCenterY - (subnetHeight / 2)

      const groupId = `group-${subnet}`

      // Subnet Label
      let subnetLabel = subnet
      // If it looks like an IP subnet (digits and dots), format it nicely.
      // If it's a Team Name (Location), just show it.
      if (/^\d+\.\d+\.\d+$/.test(subnet)) {
        subnetLabel = `Subnet ${subnet}.x`
        // Only mask if it IS an IP subnet and we are not admin?
        // User requested "Manual Option to assign to different subnets" -> imply visualizing them as teams.
        // We will respect the Location name as the label directly.
      } else {
        subnetLabel = subnet // It's a Team Name like "Red Team", "Engineering"
      }

      // 1. Add Subnet Group Node
      // Find approver for this subnet
      const assignment = subnetAssignments.find(a =>
        a.subnet_cidrs.some((cidr: string) => cidr.startsWith(subnet))
      )

      nodes.push({
        id: groupId,
        type: 'subnet',
        position: { x: groupBoxX, y: groupBoxY },
        style: { width: subnetWidth, height: subnetHeight },
        data: {
          label: subnetLabel,
          approver: assignment?.user_email
        },
        zIndex: -1,
      })

      // 2. Place Infrastructure Nodes & Create Backbone Links
      // Center vertically if missing layers
      let currentY = PADDING_TOP

      // If no gateway/switch, push agents down slightly to center them
      // This centers the content stack within the box dynamic height
      if (!hasGateway && !hasLevel2) {
        currentY = (subnetHeight - LAYER_HEIGHT) / 2 + 20
      }

      // --- LAYER 1: GATEWAYS ---
      if (hasGateway) {
        const spacing = subnetWidth / (gateways.length + 1)
        gateways.forEach((gwId, idx) => {
          const gwNode = infrastructureMap.get(gwId)
          if (gwNode) {
            nodes.push({
              ...gwNode,
              position: { x: (spacing * (idx + 1)) - 70, y: currentY },
              parentNode: groupId,
              extent: 'parent',
            })
            // Link Server -> Gateway
            edges.push({
              id: `link-${mainServerId}-${gwId}`,
              source: mainServerId,
              target: gwId,
              type: 'default',
              style: { stroke: '#0ea5e9', strokeWidth: 2 },
              animated: true,
              zIndex: 50,
            })
          }
        })
        currentY += LAYER_HEIGHT
      }

      // --- LAYER 2: APs / SWITCHES ---
      if (hasLevel2) {
        const spacing = subnetWidth / (level2Nodes.length + 1)
        level2Nodes.forEach((nodeId, idx) => {
          const node = infrastructureMap.get(nodeId)
          if (node) {
            nodes.push({
              ...node,
              position: { x: (spacing * (idx + 1)) - 70, y: currentY },
              parentNode: groupId,
              extent: 'parent',
            })

            // Link Upwards
            if (hasGateway) {
              // Connect Key Infrastructure to Gateway (Default to first gateway)
              edges.push({
                id: `link-${gateways[0]}-${nodeId}`,
                source: gateways[0],
                target: nodeId,
                type: 'wired', // Usually wired backhaul
                style: { stroke: '#64748b', strokeWidth: 2 },
                zIndex: 45,
              })
            } else {
              // No Gateway? Connect directly to Server (Fallback)
              edges.push({
                id: `link-${mainServerId}-${nodeId}`,
                source: mainServerId,
                target: nodeId,
                type: 'default',
                style: { stroke: '#0ea5e9', strokeWidth: 2 },
                animated: true,
                zIndex: 50,
              })
            }
          }
        })
        currentY += LAYER_HEIGHT
      }

      // --- LAYER 3: AGENTS ---
      subnetAgents.forEach((agent, agentIndex) => {
        const DEVICE_SPACING = 180
        const rowWidth = subnetAgents.length * DEVICE_SPACING
        const rowStartX = (subnetWidth - rowWidth) / 2

        const agentX = rowStartX + (agentIndex * DEVICE_SPACING) + 10 // Relative
        const agentY = currentY // Relative based on layers above

        nodes.push({
          id: agent.device_id,
          type: 'device',
          position: { x: agentX, y: agentY },
          parentNode: groupId,
          extent: 'parent',
          data: {
            label: agent.device_name || agent.hostname,
            ipAddress: agent.ip_address,
            owner: agent.owner,
            status: agent.status,
            deviceType: agent.device_type || 'unknown',
            isQuarantined: agent.is_quarantined,
            userRole: userRole,
          },
          zIndex: 60,
        })
        placedIps.add(agent.ip_address)

        // Connect Agent to Best Infrastructure
        let targetId = deviceConnections.get(agent.device_id)

        // Validation: Ensure target exists in this subnet structure
        if (!targetId || !subnetInfraNodes.has(targetId)) {
          // Intelligent Fallback
          if (hasLevel2) targetId = level2Nodes[0] // Prefer AP/Switch
          else if (hasGateway) targetId = gateways[0] // Then Gateway
          else targetId = mainServerId // Finally Server
        }

        const isOnline = agent.status === 'online'
        const infraNode = infrastructureMap.get(targetId!)
        const isWireless = infraNode?.data.deviceType === 'wifi_ap'
        const isDirectToServer = targetId === mainServerId

        edges.push({
          id: `link-${targetId}-${agent.device_id}`,
          source: targetId || 'virtual-server',
          target: agent.device_id,
          type: isWireless ? 'wireless' : (isDirectToServer ? 'default' : 'wired'),
          animated: isOnline,
          style: {
            stroke: isOnline ? (isWireless ? '#a855f7' : '#22c55e') : '#64748b',
            strokeWidth: isDirectToServer ? 1 : 2,
            strokeDasharray: isDirectToServer ? '5,5' : undefined
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 10,
            height: 10,
            color: isOnline ? (isWireless ? '#a855f7' : '#22c55e') : '#64748b',
          },
          zIndex: 40,
        })
      })
    })



    // 4. Place Discovered Devices (SNMP/SSDP) - Separate Group or Floating
    if (discoveredDevices.length > 0) {
      const DISCOVERY_GROUP_X = CENTER_X + RADIUS + 400
      const DISCOVERY_GROUP_Y = CENTER_Y

      nodes.push({
        id: 'group-discovery',
        type: 'subnet',
        position: { x: DISCOVERY_GROUP_X - 150, y: DISCOVERY_GROUP_Y - 200 },
        style: { width: 400, height: Math.max(400, discoveredDevices.length * 60) },
        data: { label: 'Discovered (Unmanaged)' },
        zIndex: -1,
      })

      discoveredDevices.forEach((dd, i) => {
        // Avoid duplicates if matched with managed agent
        if (placedIps.has(dd.ip)) return

        // Also avoid if it was recognized as Infrastructure and placed in the main graph
        const possibleInfraId = `disc-${dd.ip.replace(/\./g, '-')}`
        if (infrastructureMap.has(possibleInfraId)) return

        const nodeId = `discovered-${dd.ip}`
        nodes.push({
          id: nodeId,
          type: 'device',
          position: { x: 20, y: 60 + (i * 80) },
          parentNode: 'group-discovery',
          data: {
            label: dd.hostname !== 'Unknown' ? dd.hostname : dd.ip,
            ipAddress: dd.ip,
            status: 'online',
            deviceType: dd.type || 'unknown',
            userRole: userRole,
            details: dd.vendor,
            isQuarantined: false
          }
        })
      })
    }

    return { initialNodes: nodes, initialEdges: edges }
  }, [devices, userRole, topologyLogs, discoveredDevices])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  React.useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  if (isLoading && topologyLogs.length === 0 && devices.length === 0) {
    return (
      <Card className="p-12 text-center bg-slate-900 border-slate-800 flex flex-col items-center justify-center h-[600px]">
        <Loader2 className="w-12 h-12 mb-4 animate-spin text-blue-500" />
        <h3 className="text-lg font-medium mb-2 text-slate-200">Mapping Network...</h3>
        <p className="text-slate-400">Discovering devices and analyzing topology.</p>
      </Card>
    )
  }

  if (devices.length === 0) {
    return (
      <Card className="p-12 text-center bg-slate-900 border-slate-800">
        <Monitor className="w-16 h-16 mx-auto mb-4 text-slate-700" />
        <h3 className="text-lg font-medium mb-2 text-slate-200">No Devices</h3>
        <p className="text-slate-400">No devices available to display in network topology</p>
      </Card>
    )
  }

  return (
    <div className="w-full h-[600px] border border-slate-800 rounded-lg bg-slate-950 overflow-hidden shadow-inner">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        className="bg-slate-950"
        minZoom={0.2}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={20} size={1} />
        <Controls position="top-left" className="!bg-slate-900 !border-slate-800 !fill-slate-400" />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'subnet') return '#0f172a'
            if (node.data.deviceType === 'server') return '#0ea5e9'
            if (node.data.deviceType === 'switch') return '#3b82f6'
            if (node.data.deviceType === 'wifi_ap') return '#a855f7'
            if (['router', 'firewall', 'repeater'].includes(node.data.deviceType)) return '#f97316'
            return '#475569'
          }}
          maskColor="rgba(0, 0, 0, 0.3)"
          className="!bg-slate-900 !border-slate-800"
        />
        <div className="absolute bottom-4 left-4 p-3 bg-slate-900/80 backdrop-blur border border-slate-800 rounded-lg shadow-lg">
          <h4 className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Components</h4>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-sky-500" /> <span className="text-xs text-slate-300">Server</span>
            </div>
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4 text-blue-500" /> <span className="text-xs text-slate-300">Switch (Wired)</span>
            </div>
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-purple-500" /> <span className="text-xs text-slate-300">Access Point (WiFi)</span>
            </div>
            <div className="flex items-center gap-2">
              <Router className="w-4 h-4 text-orange-500" /> <span className="text-xs text-slate-300">Router/Gateway</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500" /> <span className="text-xs text-slate-300">Firewall</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 border-t-2 border-slate-500 border-dashed" /> <span className="text-xs text-slate-300">Wireless Link</span>
            </div>
          </div>
        </div>

        {/* Discovery Controls Removed as per user request to rely on Agent auto-discovery */}
      </ReactFlow>
    </div>
  )
}