import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

// GET /api/devices/quarantine/status - Check device quarantine status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const device_id = searchParams.get("device_id")

    if (!device_id) {
      return NextResponse.json({ error: "Missing device_id" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("devices")
      .select("is_quarantined, quarantine_reason, quarantined_at, quarantined_by")
      .eq("id", device_id)
      .single()

    if (error) throw error

    return NextResponse.json({
      is_quarantined: data?.is_quarantined || false,
      quarantine_reason: data?.quarantine_reason || null,
      quarantined_at: data?.quarantined_at || null,
      quarantined_by: data?.quarantined_by || null,
    }, { status: 200 })
  } catch (error) {
    console.error("Status check error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
