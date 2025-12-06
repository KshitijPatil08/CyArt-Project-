import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const device_id = searchParams.get("device_id");
    const limit = parseInt(searchParams.get("limit") || "200", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const logType = searchParams.get("log_type");
    const severity = searchParams.get("severity");
    const usbOnly = searchParams.get("usb_only") === "true";

    const { data: { user } } = await supabase.auth.getUser();

    let query = supabase
      .from("logs")
      .select("*, devices!inner(owner)", { count: "exact" });

    // RBAC: If not admin, only show logs for user's devices
    if (user?.user_metadata?.role !== 'admin' && user?.email) {
      query = query.eq("devices.owner", user.email);
    }

    if (device_id) {
      query = query.eq("device_id", device_id);
    }

    if (logType) {
      query = query.eq("log_type", logType);
    }

    if (severity) {
      query = query.eq("severity", severity);
    }

    if (usbOnly) {
      query = query.or("log_type.eq.usb,and(log_type.eq.hardware,hardware_type.eq.usb)");
    }

    const { data, error, count } = await query
      .order("timestamp", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      total: count ?? data?.length ?? 0,
      logs: data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { after, before } = body;

    if (!after && !before) {
      return NextResponse.json({ error: "Time range required" }, { status: 400 });
    }

    let query = supabase.from("logs").delete();

    if (after) {
      query = query.gte("timestamp", after);
    }
    if (before) {
      query = query.lte("timestamp", before);
    }

    const { data, error } = await query.select();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      deleted: data?.length || 0,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}