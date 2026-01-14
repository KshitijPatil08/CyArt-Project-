import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getCorsHeaders, verifyAgentKey, unauthorizedResponse } from "@/lib/api-utils"

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(request),
  })
}

export async function POST(request: NextRequest) {
  // 1. Verify Agent Key
  if (!verifyAgentKey(request)) {
    return unauthorizedResponse()
  }

  try {
    const supabase = await createClient()
    const body = await request.json()

    const { device_id, status, security_status } = body

    if (!device_id || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400, headers: getCorsHeaders(request) })
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

    return NextResponse.json({ success: true, data }, { status: 200, headers: getCorsHeaders(request) })
  } catch (error) {
    console.error("[STATUS] Update error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: getCorsHeaders(request) })
  }
}
