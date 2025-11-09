// /app/api/devices/logs/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Handle POST (from PowerShell agent)
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { device_id, device_name, hostname, log_type, hardware_type, event, source, severity, message, timestamp, raw_data } = body;

    if (!device_id) {
      return NextResponse.json({ error: "Missing device_id" }, { status: 400 });
    }

    const { error } = await supabase
      .from("logs")
      .insert([
        {
          device_id,
          device_name,
          hostname,
          log_type,
          hardware_type,
          event,
          source,
          severity,
          message,
          timestamp,
          raw_data,
        },
      ]);

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Log saved" }, { status: 200 });
  } catch (err: any) {
    console.error("Error in /api/devices/logs:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Optional: GET for debugging
export async function GET() {
  return NextResponse.json({ message: "Logs API online" });
}
