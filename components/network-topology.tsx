"use client"

import React, { useState, useRef, useEffect } from 'react'
import { Monitor, Server, Laptop, Smartphone, Lock, Box, Network, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
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

interface NodePosition {
  x: number
  y: number
  id: string
  type: 'server' | 'switch' | 'device'
  data: any
}

export function NetworkTopology({ devices }: NetworkTopologyProps) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  const getDeviceIcon = (deviceType?: string) => {
    switch (deviceType?.toLowerCase()) {
      case 'server':
        return Server
      case 'switch':
        return Box
      case 'laptop':
        return Laptop
      case 'mobile':
      case 'smartphone':
        return Smartphone
      default:
        return Monitor
    }
  }

  // Calculate node positions and connections
  const topology = React.useMemo(() => {
    if (devices.length === 0) return { nodes: [], edges: [], subnets: [] }

    const nodes: NodePosition[] = []
    const edges: any[] = []
    const subnets: any[] = []

    // Find main server
    const servers = devices.filter(d =>
      d.is_server ||
      d.device_type?.toLowerCase() === 'server' ||
      d.device_name?.toLowerCase().includes('server')
    )
    const mainServer = servers.length > 0 ? servers[0] : null
    const mainServerId = mainServer ? mainServer.device_id : 'virtual-server'

    const CENTER_X = 400
    const CENTER_Y = 300

    // Add main server node
    if (mainServer) {
      nodes.push({
        x: CENTER_X,
        y: CENTER_Y,
        id: mainServer.device_id,
        type: 'server',
        data: {
          label: mainServer.device_name,
          ipAddress: mainServer.ip_address,
          status: mainServer.status,
          deviceType: 'server',
          isQuarantined: mainServer.is_quarantined,
        }
      })
    } else {
      nodes.push({
        x: CENTER_X,
        y: CENTER_Y,
        id: 'virtual-server',
        type: 'server',
        data: {
          label: 'Central Server',
          ipAddress: 'N/A',
          status: 'online',
          deviceType: 'server',
        }
      })
    }

    // Group agents by subnet
    const agents = devices.filter(d => !servers.includes(d))
    const subnetMap = new Map<string, Device[]>()

    agents.forEach(agent => {
      const ipParts = (agent.ip_address || '0.0.0.0').split('.')
      const subnet = ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}` : 'Unknown'
      if (!subnetMap.has(subnet)) subnetMap.set(subnet, [])
      subnetMap.get(subnet)?.push(agent)
    })

    const subnetArray = Array.from(subnetMap.keys())
    const RADIUS = 450 // Increased radius for better spacing
    const ANGLE_STEP = (2 * Math.PI) / (subnetArray.length || 1)

    subnetArray.forEach((subnet, index) => {
      const angle = index * ANGLE_STEP
      const subnetAgents = subnetMap.get(subnet) || []

      const groupCenterX = CENTER_X + RADIUS * Math.cos(angle)
      const groupCenterY = CENTER_Y + RADIUS * Math.sin(angle)

      const subnetWidth = Math.max(280, subnetAgents.length * 160 + 40)
      const subnetHeight = 220

      const switchId = `switch-${subnet}`
      const switchX = groupCenterX
      const switchY = groupCenterY - 60

      // Add subnet box
      subnets.push({
        x: groupCenterX - subnetWidth / 2,
        y: groupCenterY - subnetHeight / 2,
        width: subnetWidth,
        height: subnetHeight,
        label: `Subnet ${subnet}.x`
      })

      // Add switch node
      nodes.push({
        x: switchX,
        y: switchY,
        id: switchId,
        type: 'switch',
        data: {
          label: 'Switch',
          deviceType: 'switch',
          status: 'online',
        }
      })

      // Add edge from server to switch (Backbone - Straight)
      edges.push({
        id: `link-${mainServerId}-${switchId}`,
        source: mainServerId,
        target: switchId,
        sourceNode: nodes.find(n => n.id === mainServerId),
        targetNode: { x: switchX, y: switchY, id: switchId },
        type: 'backbone',
        animated: true
      })

      // Add agent devices
      subnetAgents.forEach((agent, agentIndex) => {
        const DEVICE_SPACING = 160
        const rowWidth = subnetAgents.length * DEVICE_SPACING
        const startX = groupCenterX - rowWidth / 2 + DEVICE_SPACING / 2

        const agentX = startX + agentIndex * DEVICE_SPACING
        const agentY = groupCenterY + 60

        const agentNode = {
          x: agentX,
          y: agentY,
          id: agent.device_id,
          type: 'device' as const,
          data: {
            label: agent.device_name || agent.hostname,
            ipAddress: agent.ip_address,
            owner: agent.owner,
            status: agent.status,
            deviceType: agent.device_type || 'unknown',
            isQuarantined: agent.is_quarantined,
          }
        }

        nodes.push(agentNode)

        // Add edge from switch to device (Orthogonal)
        const isOnline = agent.status === 'online'
        edges.push({
          id: `link-${switchId}-${agent.device_id}`,
          source: switchId,
          target: agent.device_id,
          sourceNode: { x: switchX, y: switchY, id: switchId },
          targetNode: agentNode,
          type: 'device', // Will be rendered as orthogonal
          color: isOnline ? '#22c55e' : '#ef4444'
        })
      })
    })

    return { nodes, edges, subnets }
  }, [devices])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.2, 3))
  }

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.2, 0.3))
  }

  const handleReset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  // Helper for orthogonal paths
  const getOrthogonalPath = (x1: number, y1: number, x2: number, y2: number) => {
    const midY = (y1 + y2) / 2
    return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`
  }

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
    <div className="relative w-full h-[600px] border rounded-lg bg-slate-950 overflow-hidden">
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-slate-900 border border-slate-700 rounded-lg p-2">
        <button
          onClick={handleZoomIn}
          className="p-2 hover:bg-slate-800 rounded transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4 text-slate-300" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 hover:bg-slate-800 rounded transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4 text-slate-300" />
        </button>
        <button
          onClick={handleReset}
          className="p-2 hover:bg-slate-800 rounded transition-colors"
          title="Reset View"
        >
          <Maximize2 className="w-4 h-4 text-slate-300" />
        </button>
      </div>

      {/* Canvas */}
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#334155" />
          </pattern>
          <marker
            id="arrowhead-green"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="#22c55e" />
          </marker>
          <marker
            id="arrowhead-red"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="#ef4444" />
          </marker>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Background grid */}
          <rect x="0" y="0" width="800" height="600" fill="url(#grid)" />

          {/* Subnet boxes */}
          {topology.subnets.map((subnet, idx) => (
            <g key={`subnet-${idx}`}>
              <rect
                x={subnet.x}
                y={subnet.y}
                width={subnet.width}
                height={subnet.height}
                fill="rgba(15, 23, 42, 0.3)"
                stroke="rgba(148, 163, 184, 0.4)"
                strokeWidth="2"
                strokeDasharray="8,8"
                rx="16"
              />
              <rect
                x={subnet.x + 16}
                y={subnet.y - 12}
                width={subnet.label.length * 8 + 30}
                height={24}
                fill="#0f172a"
                stroke="#334155"
                rx="6"
              />
              <text
                x={subnet.x + 24}
                y={subnet.y + 4}
                fill="#94a3b8"
                fontSize="12"
                fontWeight="bold"
                alignmentBaseline="middle"
              >
                <tspan>⚡</tspan> {subnet.label}
              </text>
            </g>
          ))}

          {/* Edges */}
          {topology.edges.map((edge) => {
            const sourceNode = topology.nodes.find(n => n.id === edge.source)
            const targetNode = topology.nodes.find(n => n.id === edge.target)

            if (!sourceNode || !targetNode) return null

            const isBackbone = edge.type === 'backbone'
            const strokeColor = isBackbone ? '#e2e8f0' : edge.color // Slate-200 for backbone
            const strokeWidth = isBackbone ? 3 : 2
            const markerEnd = isBackbone ? '' : (edge.color === '#22c55e' ? 'url(#arrowhead-green)' : 'url(#arrowhead-red)')

            if (isBackbone) {
              return (
                <g key={edge.id}>
                  <line
                    x1={sourceNode.x}
                    y1={sourceNode.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    markerEnd={markerEnd}
                    opacity={0.6}
                  />
                </g>
              )
            } else {
              // Orthogonal Path for Devices
              const pathD = getOrthogonalPath(sourceNode.x, sourceNode.y, targetNode.x, targetNode.y)
              return (
                <g key={edge.id}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    markerEnd={markerEnd}
                    opacity={0.8}
                  />
                </g>
              )
            }
          })}

          {/* Nodes */}
          {topology.nodes.map((node) => {
            const Icon = getDeviceIcon(node.data.deviceType)
            const isSwitch = node.type === 'switch'
            const isServer = node.type === 'server'
            const isOnline = node.data.status === 'online'
            const isQuarantined = node.data.isQuarantined

            if (isSwitch) {
              return (
                <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                  <rect
                    x="-60"
                    y="-15"
                    width="120"
                    height="30"
                    fill="rgba(30, 58, 138, 0.9)"
                    stroke="#60a5fa"
                    strokeWidth="2"
                    rx="6"
                  />
                  <text
                    x="0"
                    y="5"
                    textAnchor="middle"
                    fill="#bfdbfe"
                    fontSize="12"
                    fontWeight="bold"
                  >
                    ⚙ Switch
                  </text>
                </g>
              )
            }

            if (isServer) {
              return (
                <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                  <rect
                    x="-70"
                    y="-30"
                    width="140"
                    height="60"
                    fill="#1e293b"
                    stroke="#10b981"
                    strokeWidth="2"
                    rx="8"
                  />
                  <circle cx="-50" cy="-15" r="4" fill={isOnline ? '#22c55e' : '#6b7280'} />
                  <text
                    x="0"
                    y="-5"
                    textAnchor="middle"
                    fill="#f8fafc"
                    fontSize="13"
                    fontWeight="bold"
                  >
                    🖥 {node.data.label}
                  </text>
                  <text
                    x="0"
                    y="15"
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="11"
                  >
                    {node.data.ipAddress}
                  </text>
                </g>
              )
            }

            // Regular device
            const borderColor = isQuarantined ? '#ef4444' : (isOnline ? '#22c55e' : '#6b7280')
            const bgColor = isQuarantined ? 'rgba(127, 29, 29, 0.3)' : '#0f172a'

            return (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                <rect
                  x="-70"
                  y="-25"
                  width="140"
                  height="50"
                  fill={bgColor}
                  stroke={borderColor}
                  strokeWidth="1.5"
                  rx="6"
                />
                <circle cx="-55" cy="-12" r="3" fill={isOnline ? '#22c55e' : '#6b7280'} />
                {isQuarantined && (
                  <text x="-40" y="-8" fill="#ef4444" fontSize="10">🔒</text>
                )}
                <text
                  x="0"
                  y="-5"
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="11"
                  fontWeight="600"
                >
                  {node.data.label.length > 15 ? node.data.label.substring(0, 15) + '...' : node.data.label}
                </text>
                <text
                  x="0"
                  y="12"
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="10"
                >
                  {node.data.ipAddress}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-700 rounded-lg p-3 text-xs">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="text-slate-300">Online</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full bg-gray-500"></div>
          <span className="text-slate-300">Offline</span>
        </div>
        <div className="flex items-center gap-2">
          <Lock className="w-3 h-3 text-red-500" />
          <span className="text-slate-300">Quarantined</span>
        </div>
      </div>
    </div>
  )
}