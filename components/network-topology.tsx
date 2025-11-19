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
import { Monitor, Server, Laptop, Smartphone, AlertCircle } from 'lucide-react'
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
      case 'laptop':
        return <Laptop className="w-5 h-5" />
      case 'mobile':
      case 'smartphone':
        return <Smartphone className="w-5 h-5" />
      default:
        return <Monitor className="w-5 h-5" />
    }
  }

  const statusColor = data.status === 'online' ? 'bg-green-500' : 'bg-gray-500'
  const borderColor = data.status === 'online' ? 'border-green-500' : 'border-gray-500'

  return (
    <div className={`px-4 py-3 bg-card border-2 ${borderColor} rounded-lg shadow-lg min-w-[200px]`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-3 h-3 rounded-full ${statusColor}`} />
        {getDeviceIcon(data.deviceType)}
        <div className="flex-1">
          <h3 className="font-semibold text-sm text-foreground">{data.label}</h3>
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
          <span className="font-medium">Location:</span> {data.location}
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
  // Generate nodes from devices
  const initialNodes: Node[] = useMemo(() => {
    if (devices.length === 0) return []

    // Separate servers and agents
    const servers = devices.filter(d => (d as any).is_server === true || d.device_type?.toLowerCase() === 'server' || d.device_name?.toLowerCase().includes('server'))
    const agents = devices.filter(d => !servers.includes(d))

    const centerX = 500
    const centerY = 400
    const serverRadius = 100
    const agentRadius = Math.min(300, Math.max(200, agents.length * 25))

    const nodes: Node[] = []

    // Place server(s) in center
    if (servers.length > 0) {
      servers.forEach((server, index) => {
        const offsetX = servers.length > 1 ? (index - (servers.length - 1) / 2) * 150 : 0
        nodes.push({
          id: server.device_id,
          type: 'device',
          position: { x: centerX + offsetX, y: centerY },
          data: {
            label: server.device_name || server.hostname || 'Server',
            ipAddress: server.ip_address || 'N/A',
            owner: server.owner || 'Server',
            location: server.location || 'Data Center',
            status: server.status || 'offline',
            deviceType: 'server',
          },
        })
      })
    } else {
      // If no server, create a virtual server node
      nodes.push({
        id: 'virtual-server',
        type: 'device',
        position: { x: centerX, y: centerY },
        data: {
          label: 'Central Server',
          ipAddress: 'N/A',
          owner: 'System',
          location: 'Data Center',
          status: 'online',
          deviceType: 'server',
        },
      })
    }

    // Place agents in star topology around server(s)
    const mainServerId = servers.length > 0 ? servers[0].device_id : 'virtual-server'
    const angleStep = agents.length > 0 ? (2 * Math.PI) / agents.length : 0

    agents.forEach((agent, index) => {
      const angle = index * angleStep - Math.PI / 2 // Start from top
      const x = centerX + agentRadius * Math.cos(angle)
      const y = centerY + agentRadius * Math.sin(angle)

      nodes.push({
        id: agent.device_id,
        type: 'device',
        position: { x, y },
        data: {
          label: agent.device_name || agent.hostname,
          ipAddress: agent.ip_address || 'N/A',
          owner: agent.owner || 'Unknown',
          location: agent.location || 'Unknown',
          status: agent.status || 'offline',
          deviceType: agent.device_type || 'windows',
        },
      })
    })

    return nodes
  }, [devices])

  // Generate edges based on star topology (server to agents)
  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = []
    
    // Separate servers and agents
    const servers = devices.filter(d => (d as any).is_server === true || d.device_type?.toLowerCase() === 'server' || d.device_name?.toLowerCase().includes('server'))
    const agents = devices.filter(d => !servers.includes(d))
    
    const mainServerId = servers.length > 0 ? servers[0].device_id : 'virtual-server'

    // Create star topology: connect all agents to the main server
    agents.forEach((agent) => {
      const isOnline = agent.status === 'online'
      const serverStatus = servers.length > 0 ? (servers[0].status === 'online') : true
      const bothOnline = isOnline && serverStatus

      edges.push({
        id: `edge-${mainServerId}-${agent.device_id}`,
        source: mainServerId,
        target: agent.device_id,
        type: 'smoothstep',
        animated: bothOnline,
        style: {
          stroke: bothOnline ? '#10b981' : '#6b7280',
          strokeWidth: bothOnline ? 3 : 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: bothOnline ? '#10b981' : '#6b7280',
        },
        label: bothOnline ? 'Connected' : 'Offline',
        labelStyle: {
          fill: bothOnline ? '#10b981' : '#6b7280',
          fontWeight: 600,
        },
      })
    })

    // Connect additional servers to main server if multiple servers exist
    if (servers.length > 1) {
      for (let i = 1; i < servers.length; i++) {
        const isOnline = servers[i].status === 'online' && servers[0].status === 'online'
        edges.push({
          id: `edge-server-${servers[0].device_id}-${servers[i].device_id}`,
          source: servers[0].device_id,
          target: servers[i].device_id,
          type: 'smoothstep',
          animated: isOnline,
          style: {
            stroke: isOnline ? '#3b82f6' : '#6b7280',
            strokeWidth: 2,
            strokeDasharray: '5,5',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isOnline ? '#3b82f6' : '#6b7280',
          },
        })
      }
    }

    return edges
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
            return node.data.status === 'online' ? '#10b981' : '#6b7280'
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  )
}

