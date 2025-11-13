"use client"

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

    // Calculate positions in a circular or grid layout
    const centerX = 400
    const centerY = 300
    const radius = Math.min(250, devices.length * 30)
    const angleStep = (2 * Math.PI) / devices.length

    return devices.map((device, index) => {
      const angle = index * angleStep
      const x = centerX + radius * Math.cos(angle)
      const y = centerY + radius * Math.sin(angle)

      return {
        id: device.device_id,
        type: 'device',
        position: { x, y },
        data: {
          label: device.device_name || device.hostname,
          ipAddress: device.ip_address || 'N/A',
          owner: device.owner || 'Unknown',
          location: device.location || 'Unknown',
          status: device.status || 'offline',
          deviceType: device.device_type,
        },
      }
    })
  }, [devices])

  // Generate edges based on relationships
  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = []
    
    // Group devices by location to create connections
    const devicesByLocation = new Map<string, Device[]>()
    devices.forEach((device) => {
      const location = device.location || 'unknown'
      if (!devicesByLocation.has(location)) {
        devicesByLocation.set(location, [])
      }
      devicesByLocation.get(location)!.push(device)
    })

    // Create edges between devices in the same location
    devicesByLocation.forEach((locationDevices) => {
      if (locationDevices.length > 1) {
        for (let i = 0; i < locationDevices.length; i++) {
          for (let j = i + 1; j < locationDevices.length; j++) {
            edges.push({
              id: `e${locationDevices[i].device_id}-${locationDevices[j].device_id}`,
              source: locationDevices[i].device_id,
              target: locationDevices[j].device_id,
              type: 'smoothstep',
              animated: locationDevices[i].status === 'online' && locationDevices[j].status === 'online',
              style: {
                stroke: locationDevices[i].status === 'online' && locationDevices[j].status === 'online' 
                  ? '#10b981' 
                  : '#6b7280',
                strokeWidth: 2,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: locationDevices[i].status === 'online' && locationDevices[j].status === 'online' 
                  ? '#10b981' 
                  : '#6b7280',
              },
            })
          }
        }
      }
    })

    // Also create connections based on owner (optional - can be commented out)
    const devicesByOwner = new Map<string, Device[]>()
    devices.forEach((device) => {
      const owner = device.owner || 'unknown'
      if (!devicesByOwner.has(owner)) {
        devicesByOwner.set(owner, [])
      }
      devicesByOwner.get(owner)!.push(device)
    })

    // Add owner-based connections (dashed lines)
    devicesByOwner.forEach((ownerDevices) => {
      if (ownerDevices.length > 1) {
        for (let i = 0; i < ownerDevices.length; i++) {
          for (let j = i + 1; j < ownerDevices.length; j++) {
            const edgeId = `e-owner-${ownerDevices[i].device_id}-${ownerDevices[j].device_id}`
            // Only add if not already connected by location
            if (!edges.find(e => e.id === edgeId)) {
              edges.push({
                id: edgeId,
                source: ownerDevices[i].device_id,
                target: ownerDevices[j].device_id,
                type: 'smoothstep',
                animated: false,
                style: {
                  stroke: '#8b5cf6',
                  strokeWidth: 1,
                  strokeDasharray: '5,5',
                },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: '#8b5cf6',
                },
              })
            }
          }
        }
      }
    })

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

