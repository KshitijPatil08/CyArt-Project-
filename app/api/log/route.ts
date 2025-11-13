import { createClient } from "@/lib/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { checkAndCreateAlerts } from "@/lib/alerts";
import { trackDataTransfer } from "@/lib/trackers";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const {
      device_id,
      log_type,
      source,
      severity,
      message,
      event_code,
      timestamp,
      raw_data,
      hardware_type,
      event,
      device_name,
      hostname,
    } = body;

    if (!device_id || !log_type || !message || !timestamp) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    console.log("[LOG] Received:", { device_id, log_type, hardware_type, event });

    // 1. Insert into logs
    const { data: logData, error: logError } = await supabase
      .from("logs")
      .insert([{
        device_id,
        log_type,
        source: source || "windows-agent",
        severity: severity || "info",
        message,
        event_code,
        timestamp: new Date(timestamp).toISOString(),
        raw_data,
        hardware_type,
        event,
      }])
      .select()
      .single();

    if (logError) {
      console.error("[LOG] Error:", logError);
      return NextResponse.json({ error: logError.message }, { status: 500 });
    }

    // 2. Create device event
    if (log_type === "hardware" && hardware_type) {
      await supabase.from("device_events").insert([{
        device_id,
        device_name: device_name || "Unknown Device",
        host_name: hostname || "Unknown Host",
        device_category: hardware_type.toUpperCase(),
        event: (event || "connected").toLowerCase(),
        timestamp: new Date(timestamp).toISOString(),
      }]);

      // Create hardware alert
      await supabase.from("alerts").insert([{
        device_id,
        alert_type: "hardware_event",
        severity: "info",
        title: "Device Event",
        description: `${hardware_type.toUpperCase()} ${event} on ${hostname}`,
        log_type: "hardware",
        message: message,
        resolved: false,
      }]);
    }

    // 3. Security alerts
    await checkAndCreateAlerts(supabase, device_id, log_type, message, severity);

    // 4. Track data transfers
    if (log_type === "usb" && message.toLowerCase().includes("transfer")) {
      await trackDataTransfer(supabase, device_id, message, raw_data);
    }

    return NextResponse.json({ 
      success: true, 
      log_id: logData?.id 
    }, { status: 201 });

  } catch (error: any) {
    console.error("[LOG] API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}