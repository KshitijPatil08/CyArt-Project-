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
  Position,
} from 'reactflow'
import { Monitor, Server, Laptop, Smartphone, AlertCircle, Lock, Box, Router } from 'lucide-react'
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

// Custom node component with device information
const DeviceNode = ({ data }: { data: any }) => {
  const getDeviceIcon = (deviceType?: string) => {
    switch (deviceType?.toLowerCase()) {
      case 'server':
        return <Server className="w-5 h-5" />
      case 'switch':
        return <Box className="w-5 h-5" /> // Using Box as a generic switch icon
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
  const statusColor = data.status === 'online' ? 'bg-green-500' : 'bg-gray-500'

  // Switch styling
  if (isSwitch) {
    return (
      <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border-2 border-blue-500 rounded-md shadow-md min-w-[150px]">
        <div className="flex items-center gap-2">
          <Router className="w-5 h-5 text-blue-500" />
          <div className="flex-1">
            <h3 className="font-bold text-sm text-foreground">{data.label}</h3>
            <p className="text-xs text-muted-foreground">{data.subnet}</p>
          </div>
        </div>
      </div>
    )
  }

  // Device styling
  const borderColor = data.isQuarantined ? 'border-red-500' : (data.status === 'online' ? 'border-green-500' : 'border-gray-500')
  const bgColor = data.isQuarantined ? 'bg-red-50' : 'bg-card'

  return (
    <div className={`px-4 py-3 ${bgColor} border-2 ${borderColor} rounded-lg shadow-lg min-w-[200px]`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-3 h-3 rounded-full ${statusColor}`} />
        {getDeviceIcon(data.deviceType)}
        {data.isQuarantined && <Lock className="w-4 h-4 text-red-500" />}
        <div className="flex-1">
          <h3 className="font-semibold text-sm text-foreground truncate max-w-[120px]">{data.label}</h3>
        </div>
      </div>
      <div className="space-y-1 text-xs">
        <p className="text-muted-foreground">
          <span className="font-medium">IP:</span> {data.ipAddress}
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium">Owner:</span> {data.owner}
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium">Status:</span>{' '}
          <span className={`capitalize ${data.status === 'online' ? 'text-green-600' : 'text-gray-500'}`}>
            {data.status}
          </span>
        </p>
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  device: DeviceNode,
}

export function NetworkTopology({ devices }: NetworkTopologyProps) {
  // Generate nodes and edges based on subnet grouping
  const { initialNodes, initialEdges } = useMemo(() => {
    if (devices.length === 0) return { initialNodes: [], initialEdges: [] }

    const nodes: Node[] = []
    const edges: Edge[] = []

    // 1. Identify Main Server(s)
    const servers = devices.filter(d => d.is_server || d.device_type?.toLowerCase() === 'server' || d.device_name?.toLowerCase().includes('server'))
    const mainServer = servers.length > 0 ? servers[0] : null
    const mainServerId = mainServer ? mainServer.device_id : 'virtual-server'

    // Place Main Server
    const centerX = 600
    const centerY = 100

    if (mainServer) {
      nodes.push({
        id: mainServer.device_id,
        type: 'device',
        position: { x: centerX, y: centerY },
        data: {
          label: mainServer.device_name,
          ipAddress: mainServer.ip_address,
          owner: mainServer.owner,
          status: mainServer.status,
          deviceType: 'server',
          isQuarantined: mainServer.is_quarantined,
        },
      })
    } else {
      nodes.push({
        id: 'virtual-server',
        type: 'device',
        position: { x: centerX, y: centerY },
        data: {
          label: 'Central Server',
          ipAddress: 'N/A',
          owner: 'System',
          status: 'online',
          deviceType: 'server',
          isQuarantined: false,
        },
      })
    }

    // 2. Group Agents by Subnet
    const agents = devices.filter(d => !servers.includes(d))
    const subnetMap = new Map<string, Device[]>()

    agents.forEach(agent => {
      // Extract subnet (first 3 octets, e.g., 192.168.1)
      const ipParts = (agent.ip_address || '0.0.0.0').split('.')
      const subnet = ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}` : 'Unknown Subnet'

      if (!subnetMap.has(subnet)) {
        subnetMap.set(subnet, [])
      }
      subnetMap.get(subnet)?.push(agent)
    })

    // 3. Create Switches and Place Agents
    const subnets = Array.from(subnetMap.keys())
    const switchSpacingX = 400
    const switchY = 300

    subnets.forEach((subnet, subnetIndex) => {
      const switchId = `switch-${subnet}`
      const switchX = centerX + (subnetIndex - (subnets.length - 1) / 2) * switchSpacingX

      // Create Switch Node
      nodes.push({
        id: switchId,
        type: 'device',
        position: { x: switchX, y: switchY },
        data: {
          label: `Switch - ${subnet}`,
          subnet: `${subnet}.x`,
          status: 'online',
          deviceType: 'switch',
        },
      })

      // Connect Server to Switch (Backbone)
      edges.push({
        id: `link-${mainServerId}-${switchId}`,
        source: mainServerId,
        target: switchId,
        type: 'step', // Orthogonal lines for backbone
        style: { stroke: '#3b82f6', strokeWidth: 4 }, // Thick blue line
        animated: true,
      })

      // Place Agents under their Switch
      const subnetAgents = subnetMap.get(subnet) || []
      const agentSpacingX = 220
      const agentStartY = switchY + 200

      subnetAgents.forEach((agent, agentIndex) => {
        const agentX = switchX + (agentIndex - (subnetAgents.length - 1) / 2) * agentSpacingX

        nodes.push({
          id: agent.device_id,
          type: 'device',
          position: { x: agentX, y: agentStartY },
          data: {
            label: agent.device_name || agent.hostname,
            ipAddress: agent.ip_address,
            owner: agent.owner,
            status: agent.status,
            deviceType: agent.device_type || 'unknown',
            isQuarantined: agent.is_quarantined,
          },
        })

        // Connect Switch to Agent (Wired)
        const isOnline = agent.status === 'online'
        edges.push({
          id: `link-${switchId}-${agent.device_id}`,
          source: switchId,
          target: agent.device_id,
          type: 'step', // Orthogonal lines for wired look
          style: {
            stroke: isOnline ? '#10b981' : '#9ca3af', // Green or Gray
            strokeWidth: 2
          },
          animated: false, // Wires don't animate usually, but could if active
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

  // Update nodes and edges when devices change
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
        className="bg-muted/20"
      >
        <Background color="#e5e7eb" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.data.isQuarantined) return '#ef4444'
            if (node.data.deviceType === 'switch') return '#3b82f6'
            return node.data.status === 'online' ? '#10b981' : '#6b7280'
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  )
}
