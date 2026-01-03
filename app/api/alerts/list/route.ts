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

    const device_id = searchParams.get('device_id');
    const resolved = searchParams.get('resolved');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    // Role Detection
    const role = user.user_metadata?.role || 'user';
    const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));
    const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));

    let query = supabase
      .from('alerts')
      .select('*, devices!inner(*)') // Select all device info for filtering
      .order('created_at', { ascending: false });

    let allowedSubnets: string[] = [];

    // RBAC Filtering
    if (isAdmin) {
      // Admin sees everything
    } else if (isApprover) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const adminClient = createAdminClient();
      const { data: assignments } = await adminClient
        .from('subnet_assignments')
        .select('subnet_cidrs')
        .eq('user_id', user.id);

      allowedSubnets = assignments?.flatMap(a => a.subnet_cidrs || []) || [];

      // Post-fetch filtering will handle the OR condition
    } else if (user.email) {
      // Standard User: Only own devices
      query = query.eq('devices.owner', user.email);
    }

    if (device_id) query = query.eq('device_id', device_id);
    if (resolved !== null) {
      query = query.eq('is_resolved', resolved === 'true');
    }

    let { data, error } = await query;
    if (error) throw error;

    // --- Post-fetch Filtering for Approvers ---
    if (!isAdmin && isApprover) {
      const { isIpInSubnet } = await import("@/lib/utils/subnet");
      data = data?.filter((alert: any) => {
        const device = alert.devices;
        if (!device) return false;

        const isOwner = device.owner === user.email;
        const isInSubnet = device.ip_address && allowedSubnets.some((cidr: string) => isIpInSubnet(device.ip_address, cidr));

        return isOwner || isInSubnet;
      }) || [];
    }

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      alerts: data || []
    }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
}