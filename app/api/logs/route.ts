import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// =====================================================
// GET: Fetch logs (already good)
// POST: Insert logs (required for PowerShell agent)
// =====================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    
    const device_id = searchParams.get('device_id');
    const log_type = searchParams.get('log_type');
    const hardware_type = searchParams.get('hardware_type');
    const limit = parseInt(searchParams.get('limit') || '100');

    let query = supabase
      .from('logs')
      .select(`
        *,
        devices:device_id (
          device_name,
          hostname,
          owner,
          location
        )
      `)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (device_id) query = query.eq('device_id', device_id);
    if (log_type) query = query.eq('log_type', log_type);
    if (hardware_type) query = query.eq('hardware_type', hardware_type);

    const { data, error } = await query;

    if (error) {
      console.error('[API] Error fetching logs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      logs: data || [],
    });

  } catch (error: any) {
    console.error('[API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// =====================================================
// ✅ POST: Receive log events (for Windows agent)
// =====================================================
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
      hardware_type,
      event,
      raw_data
    } = body;

    if (!device_id || !log_type || !message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("logs")
      .insert([
        {
          device_id,
          log_type,
          source: source || "windows-agent",
          severity: severity || "info",
          message,
          event_code,
          timestamp: timestamp || new Date().toISOString(),
          hardware_type,
          event,
          raw_data,
        },
      ])
      .select();

    if (error) {
      console.error("[API] Error inserting log:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[LOG] New ${hardware_type || log_type} event from ${device_id}`);
    return NextResponse.json({ success: true, data }, { status: 201 });

  } catch (error: any) {
    console.error('[API] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
