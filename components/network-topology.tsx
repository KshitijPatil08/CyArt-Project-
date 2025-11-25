"use client"

import 'reactflow/dist/style.css'
import React, { useCallback, useMemo } from 'react'
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
} from 'reactflow'
import { Monitor, Server, Laptop, Smartphone, Lock, Box, Router, Network } from 'lucide-react'
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

interface NetworkTopologyProps {
  devices: Device[]
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
  const isOnline = data.status === 'online'
  const statusColor = isOnline ? 'bg-green-500' : 'bg-gray-500'

  // Switch styling
  if (isSwitch) {
    return (
      <div className="px-3 py-1.5 bg-blue-950/80 border-2 border-blue-500 rounded shadow-sm min-w-[120px] flex items-center justify-center gap-2">
        <Box className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-bold text-blue-300">Switch</span>
      </div>
    )
  }

  // Device styling
  const borderColor = data.isQuarantined ? 'border-red-500' : (isOnline ? 'border-green-500' : 'border-gray-500')
  const bgColor = data.isQuarantined ? 'bg-red-950/30' : 'bg-slate-900'

  return (
    <div className={`px-3 py-2 ${bgColor} border ${borderColor} rounded shadow-sm w-[160px]`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${statusColor}`} />
        {getDeviceIcon(data.deviceType)}
        {data.isQuarantined && <Lock className="w-3 h-3 text-red-500" />}
        <div className="flex-1 overflow-hidden">
          <h3 className="font-semibold text-xs text-slate-200 truncate" title={data.label}>{data.label}</h3>
        </div>
      </div>
      <div className="text-[10px] text-slate-400 truncate">
        {data.ipAddress}
      </div>
    </div>
  )
}

// Custom Wired Edge with better network cable visualization
const WiredEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: any) => {
  // Calculate control points for a more natural cable-like curve
  const offset = 50;
  const ctrlOffset = 30;
  
  // Determine if this is a switch-to-device connection
  const isSwitchConnection = data?.isSwitchConnection || false;
  
  let path;
  
  if (isSwitchConnection) {
    // For switch connections, use a straight line with a small curve
    const midY = sourceY + (targetY - sourceY) * 0.7;
    path = `M ${sourceX} ${sourceY} 
            C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`;
  } else {
    // For server-to-switch connections, use a more pronounced curve
    const ctrlX1 = sourceX + (targetX - sourceX) * 0.5;
    const ctrlY1 = sourceY;
    const ctrlX2 = sourceX + (targetX - sourceX) * 0.5;
    const ctrlY2 = targetY;
    
    path = `M ${sourceX} ${sourceY} 
            C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${targetX} ${targetY}`;
  }

  // Add a subtle gradient to the wire
  const gradientId = `gradient-${id}`;
  const strokeColor = style.stroke || '#94a3b8';
  
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.8" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <path
        id={id}
        className="react-flow__edge-path"
        d={path}
        style={{
          ...style,
          stroke: `url(#${gradientId})`,
          strokeWidth: isSwitchConnection ? 1.5 : 2.5,
          strokeDasharray: style.strokeDasharray || 'none',
          fill: 'none',
        }}
        markerEnd={markerEnd}
      />
      {/* Add a subtle highlight on top of the wire */}
      <path
        d={path}
        style={{
          stroke: 'rgba(255, 255, 255, 0.1)',
          strokeWidth: isSwitchConnection ? 3 : 4,
          fill: 'none',
          pointerEvents: 'none',
        }}
      />
    </>
  );
}

const nodeTypes: NodeTypes = {
  device: DeviceNode,
  subnet: SubnetNode,
}

const edgeTypes = {
  wired: WiredEdge,
}

export function NetworkTopology({ devices }: NetworkTopologyProps) {
  const { initialNodes, initialEdges } = useMemo(() => {
    if (devices.length === 0) return { initialNodes: [], initialEdges: [] }

    const nodes: Node[] = []
    const edges: Edge[] = []

    // 1. Identify Main Server
    const servers = devices.filter(d => d.is_server || d.device_type?.toLowerCase() === 'server' || d.device_name?.toLowerCase().includes('server'))
    const mainServer = servers.length > 0 ? servers[0] : null
    const mainServerId = mainServer ? mainServer.device_id : 'virtual-server'

    // 2. Group Agents by Subnet
    const agents = devices.filter(d => !servers.includes(d))
    const subnetMap = new Map<string, Device[]>()

    agents.forEach(agent => {
      const ipParts = (agent.ip_address || '0.0.0.0').split('.')
      const subnet = ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}` : 'Unknown'
      if (!subnetMap.has(subnet)) subnetMap.set(subnet, [])
      subnetMap.get(subnet)?.push(agent)
    })

    // --- RADIAL LAYOUT (PARENT-CHILD GROUPING) ---
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
        },
        zIndex: 100,
      })
    } else {
      nodes.push({
        id: 'virtual-server',
        type: 'device',
        position: { x: CENTER_X, y: CENTER_Y },
        data: {
          label: 'Central Server',
          ipAddress: 'N/A',
          status: 'online',
          deviceType: 'server',
        },
        zIndex: 100,
      })
    }

    const subnets = Array.from(subnetMap.keys())
    const RADIUS = 600
    const ANGLE_STEP = (2 * Math.PI) / (subnets.length || 1)

    subnets.forEach((subnet, index) => {
      const angle = index * ANGLE_STEP
      const subnetAgents = subnetMap.get(subnet) || []

      // Calculate Group Center
      const groupCenterX = CENTER_X + RADIUS * Math.cos(angle)
      const groupCenterY = CENTER_Y + RADIUS * Math.sin(angle)

      const subnetWidth = Math.max(300, subnetAgents.length * 180 + 40)
      const subnetHeight = 250

      // Top-Left corner for the Group Box
      const groupBoxX = groupCenterX - (subnetWidth / 2)
      const groupBoxY = groupCenterY - (subnetHeight / 2)

      const groupId = `group-${subnet}`
      const switchId = `switch-${subnet}`

      // Subnet Group Node (Parent)
      nodes.push({
        id: groupId,
        type: 'subnet',
        position: { x: groupBoxX, y: groupBoxY },
        style: { width: subnetWidth, height: subnetHeight },
        data: { label: `Subnet ${subnet}.x` },
        zIndex: -1,
      })

      // Switch Node (Child - Relative Position)
      nodes.push({
        id: switchId,
        type: 'device',
        position: { x: (subnetWidth / 2) - 60, y: 40 }, // Relative to Parent
        parentNode: groupId,
        extent: 'parent',
        data: {
          label: 'Switch',
          deviceType: 'switch',
          status: 'online',
        },
        zIndex: 10,
      })

      // Backbone Connection (Server -> Switch)
      edges.push({
        id: `link-${mainServerId}-${switchId}`,
        source: mainServerId,
        target: switchId,
        type: 'wired',
        style: { 
          stroke: '#60a5fa', // Blue-400
          strokeWidth: 3,
        },
        animated: true,
        zIndex: 50,
        data: { isBackbone: true },
      })

      // Place Agents (Child - Relative Position)
      subnetAgents.forEach((agent, agentIndex) => {
        const DEVICE_SPACING = 180
        const rowWidth = subnetAgents.length * DEVICE_SPACING
        const rowStartX = (subnetWidth - rowWidth) / 2

        const agentX = rowStartX + (agentIndex * DEVICE_SPACING) + 10 // Relative
        const agentY = 140 // Relative

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
          },
          zIndex: 10,
        })

        // Wired Connection (Switch -> Agent)
        const isOnline = agent.status === 'online';
        const portNumber = agentIndex + 1; // Simulate switch port numbers
        
        edges.push({
          id: `link-${switchId}-${agent.device_id}`,
          source: switchId,
          target: agent.device_id,
          type: 'wired',
          style: {
            stroke: isOnline ? '#4ade80' : '#f87171', // Green-400 when online, Red-400 when offline
            strokeWidth: 1.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 8,
            height: 8,
            color: isOnline ? '#22c55e' : '#ef4444',
          },
          zIndex: 50,
          data: {
            isSwitchConnection: true,
            portNumber,
            isOnline,
          },
          // Add a label for the port number near the switch
          label: `Port ${portNumber}`,
          labelStyle: {
            fill: isOnline ? '#4ade80' : '#f87171',
            fontSize: '8px',
            fontWeight: 'bold',
          },
          labelShowBg: false,
          labelBgPadding: [2, 4],
          labelBgBorderRadius: 2,
        })
      })
    })

    return { initialNodes: nodes, initialEdges: edges }
  }, [devices])

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
      <Card className="p-12 text-center">
        <Monitor className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 className="text-lg font-medium mb-2 text-foreground">No Devices</h3>
        <p className="text-muted-foreground">No devices available to display in network topology</p>
      </Card>
    )
  }

  return (
    <div className="w-full h-[600px] border rounded-lg bg-background">
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
        defaultEdgeOptions={{
          type: 'wired',
          style: { 
            stroke: '#94a3b8',
            strokeWidth: 2,
          },
        }}
        connectionLineStyle={{
          stroke: '#60a5fa',
          strokeWidth: 2,
        }}
      >
        <Background color="#334155" gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'subnet') return '#1e293b'
            return '#475569'
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  )
}