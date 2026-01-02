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
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const full = searchParams.get("full") === "true";
    const includeRaw = full || logType === "network_topology" || logType === "topology";

    const selectColumns = includeRaw
      ? "*, devices!inner(*)"
      : "id, device_id, log_type, hardware_type, event, message, severity, timestamp, devices!inner(id, device_name, owner, location, hostname, ip_address, status, is_quarantined)";

    let query = supabase
      .from("logs")
      .select(selectColumns, { count: "exact" });

    // Role Detection
    const role = user.user_metadata?.role || 'user';
    const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));
    const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));

    let allowedSubnets: string[] = [];

    // RBAC Filtering
    if (isAdmin) {
      // Admin sees everything (no filter)
    } else if (isApprover) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { isIpInSubnet } = await import("@/lib/utils/subnet");
      const adminClient = createAdminClient();
      const { data: assignments } = await adminClient
        .from('subnet_assignments')
        .select('subnet_cidrs')
        .eq('user_id', user.id);

      allowedSubnets = assignments?.flatMap(a => a.subnet_cidrs || []) || [];

      // For approvers, we filter by (Owner matches EMAIL) OR (Device IP in Subnet)
      // Since we already did devices!inner(*), we can use the joined device data.
      // But wait, it's easier to filter the results in memory or via a complex query.
      // For now, let's allow the query to fetch all, and we'll filter the results if needed, 
      // OR we can try to use a filtered devices join.

      // Better strategy: We can't easily do or(owner.eq, ip.in_subnet) in a single Supabase query filter.
      // So we will fetch all (subset) and filter in memory for the response.
    } else if (user.email) {
      // Standard User: Only own devices
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

    let { data, error, count } = await query
      .order("timestamp", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // --- Post-fetch Filtering for Approvers ---
    if (!isAdmin && isApprover) {
      const { isIpInSubnet } = await import("@/lib/utils/subnet");
      // Filter logs: Device owner matches Approver EMAIL OR Device IP is in assigned Subnet
      data = data?.filter((log: any) => {
        const device = log.devices;
        if (!device) return false;

        const isOwner = device.owner === user.email;
        const isInSubnet = device.ip_address && allowedSubnets.some((cidr: string) => isIpInSubnet(device.ip_address, cidr));

        return isOwner || isInSubnet;
      }) || [];
    }

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