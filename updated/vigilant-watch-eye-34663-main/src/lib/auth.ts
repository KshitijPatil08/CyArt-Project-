// JWT Authentication utilities for user management
// Uses a backend proxy to avoid CORS issues
const API_BASE_URL = "http://localhost:3001/api"

interface AuthResponse {
  success: boolean
  data: {
    token: string
    user: {
      id: number
      email: string
      username: string
    }
  }
}

interface LoginResult {
  success: boolean
  error?: string
}

interface RegisterResult {
  success: boolean
  error?: string
}

// Store JWT token in localStorage
const TOKEN_KEY = "user_token"
const USER_KEY = "user_data"

export const authService = {
  async register(email: string, username: string, password: string, confirmPassword: string): Promise<RegisterResult> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          username,
          password,
          confirmPassword,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: errorData.error || "Registration failed",
        }
      }

      const data: AuthResponse = await response.json()
      const token = data.data.token
      const user = data.data.user

      // Store token and user data
      localStorage.setItem(TOKEN_KEY, token)
      localStorage.setItem(USER_KEY, JSON.stringify(user))

      return { success: true }
    } catch (error) {
      console.error("[v0] Registration error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }
    }
  },

  async login(username: string, password: string): Promise<LoginResult> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: errorData.error || "Authentication failed",
        }
      }

      const data: AuthResponse = await response.json()
      const token = data.data.token
      const user = data.data.user

      // Store token and user data
      localStorage.setItem(TOKEN_KEY, token)
      localStorage.setItem(USER_KEY, JSON.stringify(user))

      return { success: true }
    } catch (error) {
      console.error("[v0] Login error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }
    }
  },

  // Get stored JWT token
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY)
  },

  // Get current user
  getUser(): any {
    const userStr = localStorage.getItem(USER_KEY)
    return userStr ? JSON.parse(userStr) : null
  },

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return this.getToken() !== null
  },

  // Logout - clear token and user data
  logout(): void {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },

  // Get authorization header
  getAuthHeader(): { Authorization: string } | {} {
    const token = this.getToken()
    if (!token) {
      return {}
    }
    return {
      Authorization: `Bearer ${token}`,
    }
  },
}

// API client with automatic JWT token handling
export const apiClient = {
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`
    const headers = {
      "Content-Type": "application/json",
      ...authService.getAuthHeader(),
      ...options.headers,
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      })

      if (response.status === 401) {
        // Token expired or invalid
        authService.logout()
        throw new Error("Unauthorized - please login again")
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error("[v0] API request error:", error)
      throw error
    }
  },

  get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" })
  },

  post<T>(endpoint: string, body: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
}
