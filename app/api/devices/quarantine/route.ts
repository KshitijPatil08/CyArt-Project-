import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

// PUT /api/devices/quarantine - Quarantine a device
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { device_id, reason, quarantined_by } = body

    if (!device_id || !reason) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Update device quarantine status
    const { data, error } = await supabase
      .from("devices")
      .update({
        is_quarantined: true,
        quarantine_reason: reason,
        quarantined_at: new Date().toISOString(),
        quarantined_by: quarantined_by ?? null,
        security_status: "critical",
        updated_at: new Date().toISOString(),
      })
      .eq("id", device_id)
      .select()

    if (error) throw error

    // Create alert for quarantine
    await supabase.from("alerts").insert({
      device_id,
      alert_type: "device_quarantined",
      severity: "critical",
      title: "Device Quarantined",
      description: `Device has been quarantined. Reason: ${reason}`,
      is_read: false,
      is_resolved: false,
    })

    // Log the quarantine action
    await supabase.from("logs").insert({
      device_id,
      log_type: "security",
      source: "quarantine-system",
      severity: "critical",
      message: `Device quarantined: ${reason}`,
      timestamp: new Date().toISOString(),
      raw_data: { reason, quarantined_by },
    })

    return NextResponse.json({ 
      success: true, 
      message: "Device quarantined successfully",
      data 
    }, { status: 200 })
  } catch (error) {
    console.error("Quarantine error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/devices/quarantine - Release from quarantine
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { device_id, released_by } = body

    if (!device_id) {
      return NextResponse.json({ error: "Missing device_id" }, { status: 400 })
    }

    // Update device quarantine status
    const { data, error } = await supabase
      .from("devices")
      .update({
        is_quarantined: false,
        quarantine_reason: null,
        quarantined_at: null,
        quarantined_by: null,
        security_status: "secure",
        updated_at: new Date().toISOString(),
      })
      .eq("id", device_id)
      .select()

    if (error) throw error

    // Create alert for release
    await supabase.from("alerts").insert({
      device_id,
      alert_type: "device_released",
      severity: "low",
      title: "Device Released from Quarantine",
      description: `Device has been released from quarantine by ${released_by || "system"}`,
      is_read: false,
      is_resolved: false,
    })

    // Log the release action
    await supabase.from("logs").insert({
      device_id,
      log_type: "security",
      source: "quarantine-system",
      severity: "info",
      message: "Device released from quarantine",
      timestamp: new Date().toISOString(),
      raw_data: { released_by },
    })

    return NextResponse.json({ 
      success: true, 
      message: "Device released from quarantine",
      data 
    }, { status: 200 })
  } catch (error) {
    console.error("Release error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
