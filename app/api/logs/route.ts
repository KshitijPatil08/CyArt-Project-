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

    // Insert log into database
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

    // Check for security alerts based on log content
    await checkAndCreateAlerts(supabase, device_id, log_type, message, severity)

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
}
