import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const device_id = searchParams.get("device_id");
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const logType = searchParams.get("log_type");
    const severity = searchParams.get("severity");
    const search = searchParams.get("search");
    const usbOnly = searchParams.get("usb_only") === "true";
    const after = searchParams.get("after");
    const before = searchParams.get("before");

    const { data: { user } } = await supabase.auth.getUser();

    let query = supabase
      .from("logs")
      .select("*, devices!inner(*)", { count: "exact" });

    // RBAC: If not admin, only show logs for user's devices
    if (user?.user_metadata?.role !== 'admin' && user?.email) {
      query = query.eq("devices.owner", user.email);
    }

    if (device_id && device_id !== "all") {
      query = query.eq("device_id", device_id);
    }

    if (logType && logType !== "all") {
      if (logType === "usb") {
        // Include direct USB logs, hardware USB events, AND security logs mentioning USB
        query = query.or("log_type.eq.usb,and(log_type.eq.hardware,hardware_type.eq.usb),and(log_type.eq.security,message.ilike.%USB%)");
      } else if (logType === "network_topology" || logType === "topology") {
        query = query.or("log_type.eq.network_topology,log_type.eq.topology");
      } else {
        query = query.eq("log_type", logType);
      }
    }

    if (severity && severity !== "all") {
      query = query.eq("severity", severity);
    }

    if (search) {
      query = query.ilike("message", `%${search}%`);
    }

    if (usbOnly) {
      query = query.or("log_type.eq.usb,and(log_type.eq.hardware,hardware_type.eq.usb),and(log_type.eq.security,message.ilike.%USB%)");
    }

    if (after) {
      query = query.gte("timestamp", after);
    }

    if (before) {
      query = query.lte("timestamp", before);
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
    }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403, headers: corsHeaders });
    }

    const { after, before } = body;

    if (!after && !before) {
      return NextResponse.json({ error: "Time range required" }, { status: 400, headers: corsHeaders });
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
    }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}