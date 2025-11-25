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
    const iconClass = "w-5 h-5";
    const iconProps = { className: `${iconClass} flex-shrink-0` };
    
    switch (deviceType?.toLowerCase()) {
      case 'server':
        return <Server {...iconProps} />;
      case 'switch':
        return <Box {...iconProps} />;
      case 'laptop':
        return <Laptop {...iconProps} />;
      case 'mobile':
      case 'smartphone':
        return <Smartphone {...iconProps} />;
      case 'router':
      case 'firewall':
        return <Network {...iconProps} />;
      default:
        return <Monitor {...iconProps} />;
    }
  };

  const isSwitch = data.deviceType === 'switch';
  const isServer = data.deviceType === 'server';
  const isOnline = data.status === 'online';
  const isQuarantined = data.isQuarantined;
  
  // Status colors
  const statusColor = isOnline ? 'bg-green-500' : 'bg-gray-500';
  const borderColor = isQuarantined 
    ? 'border-red-500' 
    : (isOnline ? 'border-green-500' : 'border-gray-500');
  const bgColor = isQuarantined 
    ? 'bg-red-950/30' 
    : (isServer ? 'bg-blue-950/80' : 'bg-slate-900');

  // Switch styling
  if (isSwitch) {
    return (
      <div className={`
        px-3 py-1.5 
        ${bgColor} 
        border-2 ${borderColor} 
        rounded-lg 
        shadow-md 
        min-w-[120px] 
        flex items-center justify-center gap-2
        transition-all duration-200
        hover:shadow-lg hover:shadow-blue-500/20
        relative
      `}>
        <Box className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-semibold text-blue-200">Switch</span>
        {isQuarantined && <Lock className="w-3 h-3 text-red-500 flex-shrink-0" />}
        <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${statusColor} border border-white/50`} />
      </div>
    );
  }

  // Regular device card
  return (
    <div className={`
      px-3 py-2 
      ${bgColor} 
      border ${borderColor} 
      rounded-lg 
      shadow-sm 
      w-[160px]
      transition-all duration-200
      hover:shadow-md hover:shadow-slate-500/20
      relative
      group
    `}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2.5 h-2.5 rounded-full ${statusColor} flex-shrink-0`} />
        {getDeviceIcon(data.deviceType)}
        {isQuarantined && <Lock className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <h3 
            className="font-semibold text-xs text-slate-200 truncate" 
            title={data.label}
          >
            {data.label}
          </h3>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400 truncate">
          {data.ipAddress}
        </span>
        {!isOnline && (
          <span className="text-[10px] text-slate-500 ml-2 whitespace-nowrap">
            offline
          </span>
        )}
      </div>
    </div>
  );
}

// Simple straight edge for better visibility
const WiredEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
  data,
}: any) => {
  // Draw a straight line between source and target
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  
  // Determine if this is a switch-to-device connection
  const isSwitchConnection = data?.isSwitchConnection || false;
  const isBackbone = data?.isBackbone || false;
  
  // Set colors based on connection type
  let strokeColor = style.stroke || '#94a3b8';
  let strokeWidth = 2;
  
  if (isBackbone) {
    strokeColor = '#60a5fa'; // Blue for backbone connections
    strokeWidth = 3;
  } else if (isSwitchConnection) {
    strokeColor = data?.isOnline ? '#4ade80' : '#f87171'; // Green/Red based on status
    strokeWidth = 2;
  }

  return (
    <path
      id={id}
      className="react-flow__edge-path"
      d={path}
      style={{
        ...style,
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        fill: 'none',
        pointerEvents: 'auto',
      }}
      markerEnd={markerEnd}
    />
  );
};

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
          stroke: '#60a5fa',
          strokeWidth: 3,
        },
        animated: true,
        zIndex: 1000, // Higher z-index to ensure visibility
        data: { 
          isBackbone: true,
          isOnline: true
        },
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
            // Color will be set in the WiredEdge component
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 10,
            height: 10,
            color: isOnline ? '#22c55e' : '#ef4444',
          },
          zIndex: 500, // Ensure edges are above nodes
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
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
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
          edgesUpdatable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          style={{
            zIndex: 1,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
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
    </div>
  )
}