import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { device_name, device_type, owner, location, ip_address, hostname, os_version, agent_version } = body

    if (!device_name || !device_type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Check if device already exists
    const { data: existingDevice } = await supabase.from("devices").select("id").eq("hostname", hostname).single()

    let deviceId

    if (existingDevice) {
      // Update existing device
      const { data, error } = await supabase
        .from("devices")
        .update({
          device_name,
          device_type,
          owner,
          location,
          ip_address,
          hostname,
          os_version,
          agent_version,
          status: "online",
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingDevice.id)
        .select()

      if (error) throw error
      deviceId = existingDevice.id
    } else {
      // Create new device
      const { data, error } = await supabase
        .from("devices")
        .insert([
          {
            device_name,
            device_type,
            owner,
            location,
            ip_address,
            hostname,
            os_version,
            agent_version,
            status: "online",
            last_seen: new Date().toISOString(),
          },
        ])
        .select()

      if (error) throw error
      deviceId = data[0].id
    }

    return NextResponse.json({ success: true, device_id: deviceId }, { status: 201 })
  } catch (error) {
    console.error("[v0] Device registration error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
