import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }
    const body = await request.json();
    const { device_id, purge_logs } = body || {};

    if (!device_id) {
      return NextResponse.json({ error: "Missing device_id" }, { status: 400 });
    }

    // Remove dependent records first to avoid orphaned rows
    await supabase.from("device_credentials").delete().eq("device_id", device_id);
    await supabase.from("alerts").delete().eq("device_id", device_id);

    if (purge_logs) {
      await supabase.from("logs").delete().eq("device_id", device_id);
      await supabase.from("device_events").delete().eq("device_id", device_id);
    }

    const { error } = await supabase.from("devices").delete().eq("id", device_id);

    if (error) throw error;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("[devices/delete] error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

