import express from "express"
import cors from "cors"
import axios from "axios"
import dotenv from "dotenv"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { initializeDatabase, getUserByEmail, getUserByUsername, createUser } from "./database"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production"

// Wazuh API configuration
const WAZUH_API_URL = process.env.WAZUH_API_URL || "https://61.0.171.101:55000"
const WAZUH_USERNAME = process.env.WAZUH_USERNAME || "wazuh-wui"
const WAZUH_PASSWORD = process.env.WAZUH_PASSWORD || "p8fkI3T3i.zfQM3qNGM.0Gg.4I+A0YJA"

// Middleware
app.use(cors())
app.use(express.json())

// Store Wazuh tokens
const wazuhTokens = new Map<string, { token: string; expiry: number }>()

// Initialize database on startup
initializeDatabase().catch((err) => {
  console.error("Failed to initialize database:", err)
  process.exit(1)
})

// Helper function to get Wazuh token
async function getWazuhToken(): Promise<string> {
  try {
    const response = await axios.post(
      `${WAZUH_API_URL}/security/user/authenticate`,
      { username: WAZUH_USERNAME, password: WAZUH_PASSWORD },
      {
        headers: {
          "Content-Type": "application/json",
        },
        httpsAgent: {
          rejectUnauthorized: false,
        },
      },
    )

    return response.data.data.token
  } catch (error) {
    console.error("Error authenticating with Wazuh:", error)
    throw new Error("Failed to authenticate with Wazuh API")
  }
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, username, password, confirmPassword } = req.body

    // Validation
    if (!email || !username || !password || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" })
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" })
    }

    // Check if user already exists
    const existingEmail = await getUserByEmail(email)
    if (existingEmail) {
      return res.status(400).json({ error: "Email already registered" })
    }

    const existingUsername = await getUserByUsername(username)
    if (existingUsername) {
      return res.status(400).json({ error: "Username already taken" })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create user
    const userId = await createUser(email, username, passwordHash)

    // Generate JWT token
    const token = jwt.sign({ userId, email, username }, JWT_SECRET, { expiresIn: "7d" })

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      data: {
        token,
        user: { id: userId, email, username },
      },
    })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ error: "Registration failed" })
  }
})

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" })
    }

    // Get user from database
    const user = await getUserByUsername(username)
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" })
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash)
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid username or password" })
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, email: user.email, username: user.username }, JWT_SECRET, {
      expiresIn: "7d",
    })

    res.json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: { id: user.id, email: user.email, username: user.username },
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ error: "Login failed" })
  }
})

function verifyToken(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace("Bearer ", "")

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" })
  }
}

app.get("/api/wazuh/*", verifyToken, async (req, res) => {
  try {
    // Get Wazuh token
    const wazuhToken = await getWazuhToken()

    // Get the original path (remove /api/wazuh prefix)
    const path = req.path.replace("/api/wazuh", "")
    const url = `${WAZUH_API_URL}${path}`

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${wazuhToken}`,
        "Content-Type": "application/json",
      },
      httpsAgent: {
        rejectUnauthorized: false,
      },
      params: req.query,
    })

    res.json(response.data)
  } catch (error) {
    console.error("Proxy error:", error)
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({
        error: error.response?.data || "Proxy request failed",
      })
    } else {
      res.status(500).json({ error: "Internal server error" })
    }
  }
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`)
})
