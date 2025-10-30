import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { device_id, status, security_status } = body

    if (!device_id || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
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

    return NextResponse.json({ success: true, data }, { status: 200 })
  } catch (error) {
    console.error("[v0] Status update error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
