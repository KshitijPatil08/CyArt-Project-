import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { device_id, log_type, source, severity, message, event_code, timestamp, raw_data } = body

    // Validate required fields
    if (!device_id || !log_type || !message || !timestamp) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const { data, error } = await supabase.from("logs").insert([
      {
        device_id,
        log_type,
        source,
        severity: severity || "info",
        message,
        event_code,
        timestamp: new Date(timestamp).toISOString(),
        raw_data,
      },
    ])

    if (error) {
      console.error("[v0] Log insertion error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await checkAndCreateAlerts(supabase, device_id, log_type, message, severity)

    if (log_type === "usb" && message.toLowerCase().includes("transfer")) {
      await trackDataTransfer(supabase, device_id, message, raw_data)
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error("[v0] API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function checkAndCreateAlerts(
  supabase: any,
  device_id: string,
  log_type: string,
  message: string,
  severity: string,
) {
  // Create alerts for critical security events
  if (log_type === "security" && (severity === "error" || severity === "critical")) {
    await supabase.from("alerts").insert([
      {
        device_id,
        alert_type: "security_event",
        severity: severity === "critical" ? "critical" : "high",
        title: "Security Event Detected",
        description: message,
      },
    ])
  }

  if (message.toLowerCase().includes("unauthorized") || message.toLowerCase().includes("denied")) {
    await supabase.from("alerts").insert([
      {
        device_id,
        alert_type: "suspicious_activity",
        severity: "high",
        title: "Suspicious Activity Detected",
        description: message,
      },
    ])
  }
}

async function trackDataTransfer(supabase: any, device_id: string, message: string, raw_data: any) {
  try {
    const dataTransferred = raw_data?.data_transferred_mb || 0
    const fileName = raw_data?.file_name || "Unknown"

    await supabase.from("audit_trail").insert([
      {
        device_id,
        action: "file_write",
        file_path: fileName,
        data_transferred_mb: dataTransferred,
        timestamp: new Date().toISOString(),
      },
    ])
  } catch (error) {
    console.error("[v0] Error tracking data transfer:", error)
  }
}
