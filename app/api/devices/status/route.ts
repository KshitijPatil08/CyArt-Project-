import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { device_id, status, security_status } = body

    if (!device_id || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders })
    }

    const { data, error } = await supabase
      .from("devices")
      .update({
        status,
        security_status: security_status || "unknown",
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", device_id)
      .select()

    if (error) throw error

    console.log(`[STATUS] Device ${device_id} updated: status=${status}, last_seen=${new Date().toISOString()}`)

    return NextResponse.json({ success: true, data }, { status: 200, headers: corsHeaders })
  } catch (error) {
    console.error("[STATUS] Update error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders })
  }
}
