// Wazuh API client for fetching security data
import { apiClient } from "./auth"

export interface WazuhAgent {
  id: string
  name: string
  status: string
  ip: string
  os: string
}

export interface WazuhAlert {
  id: string
  timestamp: string
  rule_id: string
  rule_description: string
  level: number
  agent_id: string
  agent_name: string
}

export interface WazuhLog {
  id: string
  timestamp: string
  message: string
  level: string
  agent_id: string
}

export const wazuhAPI = {
  // Get all agents
  async getAgents(): Promise<WazuhAgent[]> {
    try {
      const response = await apiClient.get<{ data: { affected_items: WazuhAgent[] } }>("/wazuh/agents?limit=500")
      return response.data.affected_items || []
    } catch (error) {
      console.error("[v0] Error fetching agents:", error)
      return []
    }
  },

  // Get agent by ID
  async getAgent(agentId: string): Promise<WazuhAgent | null> {
    try {
      const response = await apiClient.get<{ data: { affected_items: WazuhAgent[] } }>(`/wazuh/agents/${agentId}`)
      return response.data.affected_items?.[0] || null
    } catch (error) {
      console.error("[v0] Error fetching agent:", error)
      return null
    }
  },

  // Get alerts
  async getAlerts(limit = 100): Promise<WazuhAlert[]> {
    try {
      const response = await apiClient.get<{ data: { affected_items: WazuhAlert[] } }>(
        `/wazuh/alerts?limit=${limit}&sort=-timestamp`,
      )
      return response.data.affected_items || []
    } catch (error) {
      console.error("[v0] Error fetching alerts:", error)
      return []
    }
  },

  // Get logs
  async getLogs(limit = 100): Promise<WazuhLog[]> {
    try {
      const response = await apiClient.get<{ data: { affected_items: WazuhLog[] } }>(
        `/wazuh/logs?limit=${limit}&sort=-timestamp`,
      )
      return response.data.affected_items || []
    } catch (error) {
      console.error("[v0] Error fetching logs:", error)
      return []
    }
  },

  // Get system status
  async getSystemStatus(): Promise<{ status: string; version: string }> {
    try {
      const response = await apiClient.get<{ data: { status: string; version: string } }>("/wazuh/manager/status")
      return response.data
    } catch (error) {
      console.error("[v0] Error fetching system status:", error)
      return { status: "unknown", version: "unknown" }
    }
  },
}
