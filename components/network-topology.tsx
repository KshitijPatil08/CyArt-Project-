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
  Handle,
  Position,
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
      <div className="px-3 py-1.5 bg-blue-950/80 border-2 border-blue-500 rounded shadow-sm min-w-[120px] flex items-center justify-center gap-2 relative">
        <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-2 !h-2" />
        <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-2 !h-2" />
        <Box className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-bold text-blue-300">Switch</span>
      </div>
    )
  }

  // Device styling
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

const nodeTypes: NodeTypes = {
  device: DeviceNode,
  subnet: SubnetNode,
}

const edgeTypes = {
  wired: WiredEdge,
}

interface NetworkTopologyProps {
  devices: Device[]
  userRole?: string
}

export function NetworkTopology({ devices, userRole = 'user' }: NetworkTopologyProps) {
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

    // Place Main Server (only if it exists)
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
      const subnetHeight = 250

      // Top-Left corner for the Group Box
      const groupBoxX = groupCenterX - (subnetWidth / 2)
      const groupBoxY = groupCenterY - (subnetHeight / 2)

      const groupId = `group-${subnet}`
      const switchId = `switch-${subnet}`

      // Subnet Label Logic
      // If admin, show actual subnet IP part. If user, show friendly name.
      // We'll simulate friendly names based on the subnet index or last octet for demo.
      // In a real app we'd need a mapping table.
      let subnetLabel = `Subnet ${subnet}.x`
      if (userRole !== 'admin') {
        // Simple hashing or mapping to create a consistent Department name
        const departments = ['HR Department', 'Engineering', 'Sales', 'Finance', 'Marketing', 'Operations']
        const deptIndex = subnet.split('.').reduce((acc, part) => acc + parseInt(part), 0) % departments.length
        subnetLabel = departments[deptIndex]
      }

      // Subnet Group Node (Parent)
      nodes.push({
        id: groupId,
        type: 'subnet',
        position: { x: groupBoxX, y: groupBoxY },
        style: { width: subnetWidth, height: subnetHeight },
        data: { label: subnetLabel },
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
          userRole: userRole,
        },
        zIndex: 10,
      })

      // Backbone Connection (Server -> Switch)
      edges.push({
        id: `link-${mainServerId}-${switchId}`,
        source: mainServerId,
        target: switchId,
        type: 'smoothstep',
        animated: true,
        style: {
          stroke: '#0ea5e9', // Bright Cyan
          strokeWidth: 3,
        },
        zIndex: 50,
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
            userRole: userRole,
          },
          zIndex: 60, // Higher than edges
        })

        // Wired Connection (Switch -> Agent)
        const isOnline = agent.status === 'online'
        edges.push({
          id: `link-${switchId}-${agent.device_id}`,
          source: switchId,
          target: agent.device_id,
          type: 'smoothstep',
          pathOptions: { borderRadius: 15 },
          animated: isOnline,
          style: {
            stroke: isOnline ? '#22c55e' : '#64748b', // Bright Green or Slate
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 10,
            height: 10,
            color: isOnline ? '#22c55e' : '#64748b',
          },
          zIndex: 40,
        })
      })
    })

    return { initialNodes: nodes, initialEdges: edges }
  }, [devices, userRole])

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