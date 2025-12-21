import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"
import { z } from "zod"

const allowedOrigins = [
  'https://cyart-dashboard.vercel.app',
  process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : ''
].filter(Boolean);

function getCorsHeaders(request: NextRequest) {
  const origin = request.headers.get('origin');
  const isAllowed = allowedOrigins.includes(origin || '');
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin! : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: getCorsHeaders(request) })
}

const authSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const validation = authSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: "Validation failed", details: validation.error.format() }, { status: 400, headers: getCorsHeaders(request) })
    }

    const { username, password } = validation.data

    const { data: credentials, error: credError } = await supabase
      .from("device_credentials")
      .select("device_id, password")
      .eq("username", username)
      .single()

    if (credError || !credentials) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401, headers: getCorsHeaders(request) })
    }

    const passwordMatch = await bcrypt.compare(password, credentials.password)

    if (!passwordMatch) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401, headers: getCorsHeaders(request) })
    }

    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("*")
      .eq("id", credentials.device_id)
      .single()

    if (deviceError || !device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404, headers: getCorsHeaders(request) })
    }

    const JWT_SECRET = process.env.JWT_SECRET
    if (!JWT_SECRET) {
      console.error("JWT_SECRET is not defined")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500, headers: getCorsHeaders(request) })
    }

    const token = jwt.sign(
      {
        device_id: credentials.device_id,
        username: username,
        type: 'device'
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    await supabase
      .from("devices")
      .update({
        status: "online",
        last_seen: new Date().toISOString(),
      })
      .eq("id", credentials.device_id)

    return NextResponse.json(
      {
        success: true,
        device_id: credentials.device_id,
        device_name: device.device_name,
        token,
        message: "Authentication successful",
      },
      { status: 200, headers: getCorsHeaders(request) },
    )
  } catch (error) {
    console.error("[v0] Device authentication error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: getCorsHeaders(request) })
  }
}
