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
import { Monitor, Server, Laptop, Smartphone, Lock, Box, Router, Network, Wifi, ShieldAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'

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
      <div className="absolute -top-3 left-4 bg-slate-950 px-2 text-sm font-bold text-slate-400 flex items-center gap-2 border border-slate-800 rounded-md shadow-sm">
        <Network className="w-4 h-4" />
        {data.label}
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
  const isOnline = data.status === 'online'
  const statusColor = isOnline ? 'bg-green-500' : 'bg-gray-500'

  // Infrastructure Node Styling (Switch/AP)
  if (isSwitch || isWifi) {
    const infrastructureColor = isWifi ? 'border-purple-500 bg-purple-950/80' : 'border-blue-500 bg-blue-950/80'
    const iconColor = isWifi ? 'text-purple-400' : 'text-blue-400'
    const textColor = isWifi ? 'text-purple-300' : 'text-blue-300'

    return (
      <div className={`px-3 py-1.5 ${infrastructureColor} border-2 rounded shadow-sm min-w-[140px] flex items-center justify-center gap-2 relative`}>
        <Handle type="target" position={Position.Top} className={`!bg-${isWifi ? 'purple' : 'blue'}-500 !w-2 !h-2`} />
        <Handle type="source" position={Position.Bottom} className={`!bg-${isWifi ? 'purple' : 'blue'}-500 !w-2 !h-2`} />
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

export function NetworkTopology({ devices, userRole = 'user' }: NetworkTopologyProps) {
  const [topologyLogs, setTopologyLogs] = useState<TopologyLog[]>([])

  // Fetch Topology Logs on Mount
  useEffect(() => {
    const fetchTopology = async () => {
      try {
        const res = await fetch("/api/logs?log_type=network_topology&limit=50")
        const data = await res.json()
        if (data.logs) {
          // Parse raw data if it's stringified
          const parsedLogs = data.logs.map((log: any) => ({
            ...log,
            raw_data: typeof log.raw_data === 'string' ? JSON.parse(log.raw_data) : log.raw_data
          }))
          setTopologyLogs(parsedLogs)
        }
      } catch (e) {
        console.error("Failed to fetch topology logs", e)
      }
    }
    fetchTopology()
  }, [])

  const { initialNodes, initialEdges } = useMemo(() => {
    if (devices.length === 0) return { initialNodes: [], initialEdges: [] }

    const nodes: Node[] = []
    const edges: Edge[] = []

    // 1. Identify Main Server
    const servers = devices.filter(d => d.is_server || d.device_type?.toLowerCase() === 'server' || d.device_name?.toLowerCase().includes('server'))
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

      if (logs.length > 0) {
        const log = logs[0] // Assuming API returns newest first or we just take one

        let infraId = ""
        let infraLabel = ""
        let infraType = ""
        let infraDetails = ""

        if (log.hardware_type === 'wifi_ap') {
          infraId = `ap-${log.raw_data.bssid?.replace(/:/g, '') || 'unknown'}`
          infraLabel = log.raw_data.ssid || 'WiFi AP'
          infraType = 'wifi_ap'
          infraDetails = 'Signal: ' + (log.raw_data.signal || 'N/A')
        } else if (log.hardware_type === 'switch') {
          infraId = `sw-${log.raw_data.chassis_id?.replace(/:/g, '') || log.raw_data.switch_name || 'unknown'}`
          infraLabel = log.raw_data.switch_name || 'Switch'
          infraType = 'switch'
          infraDetails = 'Port: ' + (log.raw_data.port_id || 'Unknown Port')
        }

        if (infraId) {
          deviceConnections.set(device.device_id, infraId)

          if (!infrastructureMap.has(infraId)) {
            // Create Infrastructure Node (will position later)
            infrastructureMap.set(infraId, {
              id: infraId,
              type: 'device',
              position: { x: 0, y: 0 }, // Placeholder
              data: {
                label: infraLabel,
                deviceType: infraType,
                details: infraDetails, // e.g. signal strength not per device but general... wait details are per link usually but node serves many.
                // Keeping details simple for node label
                status: 'online',
                userRole: userRole,
              },
              zIndex: 10,
            })
          }
        }
      }
    })

    // 3. Group Agents by Subnet (Fallback for those without LLDP/WiFi logs)
    const agents = devices.filter(d => !servers.includes(d))
    const subnetMap = new Map<string, Device[]>()

    agents.forEach(agent => {
      const ipParts = (agent.ip_address || '0.0.0.0').split('.')
      const subnet = ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}` : 'Unknown'
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

      const subnetWidth = Math.max(300, subnetAgents.length * 180 + 40)
      const subnetHeight = 350 // Increased for APs

      // Top-Left corner for the Group Box
      const groupBoxX = groupCenterX - (subnetWidth / 2)
      const groupBoxY = groupCenterY - (subnetHeight / 2)

      const groupId = `group-${subnet}`

      // Determine what infrastructure exists in this subnet
      // Filter infrastructureMap to find nodes that these agents are connected to
      const subnetInfraNodes = new Set<string>()
      subnetAgents.forEach(agent => {
        const conn = deviceConnections.get(agent.device_id)
        if (conn) subnetInfraNodes.add(conn)
      })

      // Fallback Switch if no infra discovered for this subnet
      let fallbackSwitchId = `switch-${subnet}`
      let useFallbackSwitch = subnetInfraNodes.size === 0

      // Subnet Label
      let subnetLabel = `Subnet ${subnet}.x`
      if (userRole !== 'admin') {
        const departments = ['HR Department', 'Engineering', 'Sales', 'Finance', 'Marketing', 'Operations']
        const deptIndex = subnet.split('.').reduce((acc, part) => acc + parseInt(part), 0) % departments.length
        subnetLabel = departments[deptIndex]
      }

      // 1. Add Subnet Group Node
      nodes.push({
        id: groupId,
        type: 'subnet',
        position: { x: groupBoxX, y: groupBoxY },
        style: { width: subnetWidth, height: subnetHeight },
        data: { label: subnetLabel },
        zIndex: -1,
      })

      // 2. Add Infrastructure Nodes (Real or Fallback)
      const placedInfraIds: string[] = []

      if (useFallbackSwitch) {
        // Legacy Hardcoded Switch (Discovery Failed)
        nodes.push({
          id: fallbackSwitchId,
          type: 'device',
          position: { x: (subnetWidth / 2) - 60, y: 40 },
          parentNode: groupId,
          extent: 'parent',
          data: {
            label: 'Switch (Unmanaged)',
            deviceType: 'switch',
            status: 'online',
            userRole: userRole,
            details: 'No LLDP Data',
          },
          zIndex: 10,
        })
        placedInfraIds.push(fallbackSwitchId)

        // Connect to Server
        edges.push({
          id: `link-${mainServerId}-${fallbackSwitchId}`,
          source: mainServerId,
          target: fallbackSwitchId,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#0ea5e9', strokeWidth: 3 },
          zIndex: 50,
        })
      } else {
        // Place Real Discovered Infra Nodes
        let infraIndex = 0
        const infraCount = subnetInfraNodes.size
        const infraSpacing = subnetWidth / (infraCount + 1)

        subnetInfraNodes.forEach(infraId => {
          const infraNode = infrastructureMap.get(infraId)
          if (infraNode) {
            // Clone and Position relative to Subnet
            nodes.push({
              ...infraNode,
              position: { x: (infraSpacing * (infraIndex + 1)) - 70, y: 40 },
              parentNode: groupId,
              extent: 'parent',
            })
            placedInfraIds.push(infraId)
            infraIndex++

            // Edge from Server to this Infra
            edges.push({
              id: `link-${mainServerId}-${infraId}`,
              source: mainServerId,
              target: infraId,
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#0ea5e9', strokeWidth: 3 },
              zIndex: 50,
            })
          }
        })
      }

      // 3. Place Agents and Connect
      subnetAgents.forEach((agent, agentIndex) => {
        const DEVICE_SPACING = 180
        const rowWidth = subnetAgents.length * DEVICE_SPACING
        const rowStartX = (subnetWidth - rowWidth) / 2

        const agentX = rowStartX + (agentIndex * DEVICE_SPACING) + 10 // Relative
        const agentY = 180 // Relative

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

        // Determine which node to connect to
        let targetId = deviceConnections.get(agent.device_id)
        if (!targetId || !subnetInfraNodes.has(targetId)) {
          targetId = useFallbackSwitch ? fallbackSwitchId : placedInfraIds[0] // Default to first available
        }

        const isOnline = agent.status === 'online'
        const infraNode = infrastructureMap.get(targetId!)
        const isWireless = infraNode?.data.deviceType === 'wifi_ap'

        edges.push({
          id: `link-${targetId}-${agent.device_id}`,
          source: targetId || 'virtual-server',
          target: agent.device_id,
          type: isWireless ? 'wireless' : 'wired', // Use custom edge types
          animated: isOnline,
          style: {
            stroke: isOnline ? (isWireless ? '#a855f7' : '#22c55e') : '#64748b',
            strokeWidth: 2,
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

    return { initialNodes: nodes, initialEdges: edges }
  }, [devices, userRole, topologyLogs])

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
      >
        <Background color="#1e293b" gap={20} size={1} />
        <Controls className="!bg-slate-900 !border-slate-800 !fill-slate-400" />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'subnet') return '#0f172a'
            if (node.data.deviceType === 'server') return '#0ea5e9'
            if (node.data.deviceType === 'switch') return '#3b82f6'
            if (node.data.deviceType === 'wifi_ap') return '#a855f7'
            return '#475569'
          }}
          maskColor="rgba(0, 0, 0, 0.3)"
          className="!bg-slate-900 !border-slate-800"
        />
        <div className="absolute bottom-4 left-4 p-3 bg-slate-900/80 backdrop-blur border border-slate-800 rounded-lg shadow-lg">
          <h4 className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Legend</h4>
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
              <div className="w-4 h-0.5 border-t-2 border-slate-500 border-dashed" /> <span className="text-xs text-slate-300">Wireless Link</span>
            </div>
          </div>
        </div>
      </ReactFlow>
    </div>
  )
}