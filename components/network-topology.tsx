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

// Subnet Group Node (The "Box")
const SubnetNode = ({ data }: { data: any }) => {
  return (
    <div className="w-full h-full bg-transparent border-2 border-dashed border-slate-400 dark:border-slate-600 rounded-xl relative">
      <div className="absolute -top-3 left-4 bg-background px-2 text-sm font-bold text-muted-foreground flex items-center gap-2 border border-slate-200 dark:border-slate-800 rounded-md shadow-sm">
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

  // Switch styling (Small header node inside the group)
  if (isSwitch) {
    return (
      <div className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 border border-blue-500 rounded shadow-sm min-w-[120px] flex items-center justify-center gap-2">
        <Box className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        <span className="text-xs font-bold text-blue-700 dark:text-blue-300">Switch</span>
      </div>
    )
  }

  // Device styling
  const borderColor = data.isQuarantined ? 'border-red-500' : (isOnline ? 'border-green-500' : 'border-gray-500')
  const bgColor = data.isQuarantined ? 'bg-red-50' : 'bg-card'

  return (
    <div className={`px-3 py-2 ${bgColor} border ${borderColor} rounded shadow-sm w-[160px]`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${statusColor}`} />
        {getDeviceIcon(data.deviceType)}
        {data.isQuarantined && <Lock className="w-3 h-3 text-red-500" />}
        <div className="flex-1 overflow-hidden">
          <h3 className="font-semibold text-xs text-foreground truncate" title={data.label}>{data.label}</h3>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground truncate">
        {data.ipAddress}
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  device: DeviceNode,
  subnet: SubnetNode,
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

    // Layout Constants
    const SERVER_X = 600
    const SERVER_Y = 50
    const SUBNET_SPACING_X = 350
    const SUBNET_Y = 250
    const DEVICE_SPACING_X = 180
    const DEVICE_ROW_SPACING_Y = 100

    // Place Main Server
    if (mainServer) {
      nodes.push({
        id: mainServer.device_id,
        type: 'device',
        position: { x: SERVER_X, y: SERVER_Y },
        data: {
          label: mainServer.device_name,
          ipAddress: mainServer.ip_address,
          status: mainServer.status,
          deviceType: 'server',
          isQuarantined: mainServer.is_quarantined,
        },
      })
    } else {
      nodes.push({
        id: 'virtual-server',
        type: 'device',
        position: { x: SERVER_X, y: SERVER_Y },
        data: {
          label: 'Central Server',
          ipAddress: 'N/A',
          status: 'online',
          deviceType: 'server',
        },
      })
    }

    // Process Subnets
    const subnets = Array.from(subnetMap.keys())

    subnets.forEach((subnet, subnetIndex) => {
      const subnetAgents = subnetMap.get(subnet) || []
      const subnetWidth = Math.max(300, subnetAgents.length * DEVICE_SPACING_X + 40)
      const subnetHeight = 250

      const totalWidth = subnets.length * SUBNET_SPACING_X
      const startX = SERVER_X - (totalWidth / 2) + (SUBNET_SPACING_X / 2)
      const groupX = startX + (subnetIndex * (subnetWidth + 50))
      const groupY = SUBNET_Y

      const groupId = `group-${subnet}`
      const switchId = `switch-${subnet}`

      // Subnet Group
      nodes.push({
        id: groupId,
        type: 'subnet',
        position: { x: groupX, y: groupY },
        style: { width: subnetWidth, height: subnetHeight },
        data: { label: `Subnet ${subnet}.x` },
        zIndex: -1,
      })

      // Switch Node
      nodes.push({
        id: switchId,
        type: 'device',
        position: { x: (subnetWidth / 2) - 60, y: 40 },
        parentNode: groupId,
        extent: 'parent',
        data: {
          label: 'Switch',
          deviceType: 'switch',
          status: 'online',
        },
      })

      // Backbone Connection (Server -> Switch)
      edges.push({
        id: `link-${mainServerId}-${switchId}`,
        source: mainServerId,
        target: switchId,
        type: 'straight', // Debug: Straight line
        style: { stroke: '#00ffff', strokeWidth: 3 }, // Debug: Cyan
        animated: true,
      })

      // Place Agents
      subnetAgents.forEach((agent, agentIndex) => {
        const rowWidth = subnetAgents.length * DEVICE_SPACING_X
        const rowStartX = (subnetWidth - rowWidth) / 2
        const agentX = rowStartX + (agentIndex * DEVICE_SPACING_X) + 10
        const agentY = 140

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
        })

        // Wired Connection (Switch -> Agent)
        const isOnline = agent.status === 'online'
        edges.push({
          id: `link-${switchId}-${agent.device_id}`,
          source: switchId,
          target: agent.device_id,
          type: 'straight', // Debug: Straight line
          style: {
            stroke: '#00ffff', // Debug: Cyan
            strokeWidth: 3
          },
        })
      })
    })

    console.log('Topology generated:', { nodes: nodes.length, edges: edges.length })
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
        fitView
        className="bg-white dark:bg-slate-950"
      >
        <Background color="#94a3b8" gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'subnet') return '#f1f5f9'
            return '#cbd5e1'
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  )
}
