import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 })
    }

    const { data: credentials, error: credError } = await supabase
      .from("device_credentials")
      .select("device_id, password")
      .eq("username", username)
      .single()

    if (credError || !credentials) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    const passwordMatch = password === credentials.password

    if (!passwordMatch) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("*")
      .eq("id", credentials.device_id)
      .single()

    if (deviceError || !device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 })
    }

    const token = Buffer.from(`${username}:${credentials.device_id}:${Date.now()}`).toString("base64")

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
      { status: 200 },
    )
  } catch (error) {
    console.error("[v0] Device authentication error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
