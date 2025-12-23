import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const device_id = searchParams.get('device_id');
    const resolved = searchParams.get('resolved');

    const { data: { user } } = await supabase.auth.getUser();

    let query = supabase
      .from('alerts')
      .select('*, devices!inner(owner)')
      .order('created_at', { ascending: false });

    // RBAC: If not admin, only show alerts for user's devices
    if (user?.user_metadata?.role !== 'admin' && user?.email) {
      query = query.eq('devices.owner', user.email);
    }

    if (device_id) query = query.eq('device_id', device_id);
    if (resolved !== null) {
      query = query.eq('is_resolved', resolved === 'true');
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      alerts: data || []
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}