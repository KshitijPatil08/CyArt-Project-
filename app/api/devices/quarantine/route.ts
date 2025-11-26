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

    // Trigger hardware lock
    try {
      const hardwareLockResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/devices/hardware-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id,
          lock_network: true,
          lock_usb: true
        }),
      })

      if (!hardwareLockResponse.ok) {
        console.error("Hardware lock failed, but quarantine status set")
        // Log hardware lock failure
        await supabase.from("logs").insert({
          device_id,
          log_type: "security",
          source: "quarantine-system",
          severity: "high",
          message: "Hardware lock command failed",
          timestamp: new Date().toISOString(),
        })
      }
    } catch (hardwareLockError) {
      console.error("Hardware lock error:", hardwareLockError)
      // Continue even if hardware lock fails - quarantine status is still set
    }

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

    // Trigger hardware unlock
    try {
      const hardwareUnlockResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/devices/hardware-lock`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id }),
      })

      if (!hardwareUnlockResponse.ok) {
        console.error("Hardware unlock failed, but quarantine status cleared")
        // Log hardware unlock failure
        await supabase.from("logs").insert({
          device_id,
          log_type: "security",
          source: "quarantine-system",
          severity: "high",
          message: "Hardware unlock command failed",
          timestamp: new Date().toISOString(),
        })
      }
    } catch (hardwareUnlockError) {
      console.error("Hardware unlock error:", hardwareUnlockError)
      // Continue even if hardware unlock fails - quarantine status is still cleared
    }

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
