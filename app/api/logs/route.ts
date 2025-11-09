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
      hardware_type, // ✅ e.g. usb, mouse, printer, keyboard, charger
      event, // ✅ e.g. connected, disconnected
      device_name,
      hostname,
    } = body;

    if (!device_id || !log_type || !message || !timestamp) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // ✅ 1. Insert into main logs table
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
        hardware_type,
        event,
      },
    ]);

    if (error) {
      console.error("[v0] Log insertion error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ✅ 2. If this is a hardware connect/disconnect event, mirror into `device_events`
    if (
      log_type === "hardware" &&
      ["usb", "mouse", "keyboard", "printer", "charger"].includes(
        (hardware_type || "").toLowerCase()
      )
    ) {
      const category = hardware_type.toUpperCase();
      const ev = (event || "connected").toLowerCase();

      // ➕ Insert into Realtime-visible table
      await supabase.from("device_events").insert([
        {
          device_id,
          device_name: device_name || "Unknown Device",
          host_name: hostname || "Unknown Host",
          device_category: category,
          event: ev,
          timestamp: new Date(timestamp).toISOString(),
        },
      ]);

      // ➕ Still create a standard alert entry
      await supabase.from("alerts").insert([
        {
          device_id,
          alert_type: "hardware_event",
          severity: "info",
          title: "Device Event",
          description: `${category} ${ev} — ${device_id}`,
        },
      ]);
    }

    // ✅ 3. Keep your alert logic
    await checkAndCreateAlerts(supabase, device_id, log_type, message, severity);

    // ✅ 4. Keep data transfer tracking
    if (log_type === "usb" && message.toLowerCase().includes("transfer")) {
      await trackDataTransfer(supabase, device_id, message, raw_data);
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("[v0] API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}