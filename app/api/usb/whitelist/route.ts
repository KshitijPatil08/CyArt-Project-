import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isIpInSubnet } from "@/lib/utils/subnet";

// Restricted CORS (Same-origin only)
const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Get all authorized USB devices
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active_only") === "true";

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const role = user.user_metadata?.role || 'user';
    const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));
    const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));

    let query = supabase
      .from("authorized_usb_devices")
      .select("*")
      .order("created_at", { ascending: false });

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data: devices, error } = await query;
    if (error) throw error;

    let filteredDevices = devices || [];

    // Role-Based Filtering
    if (isAdmin) {
      // Admin sees all
    } else if (isApprover) {
      // Approver sees devices in their assigned subnets
      const { data: assignments } = await supabase
        .from('subnet_assignments')
        .select('subnet_cidrs')
        .eq('user_id', user.id);

      const allowedSubnets = assignments?.flatMap((a: any) => a.subnet_cidrs || []) || [];

      // We need to match authorized devices to subnets. 
      // This is dynamic since devices can move, but we can check the IP stored in the original request or current device record.
      // For authorized devices, we store computer_name and device_id.
      const { data: allDevices } = await supabase
        .from('devices')
        .select('device_id, ip_address, hostname');

      const allowedDeviceIds = new Set<string>();
      const allowedHostnames = new Set<string>();

      allDevices?.forEach((d: any) => {
        if (d.ip_address && allowedSubnets.some((cidr: string) => {
          try { return isIpInSubnet(d.ip_address, cidr); } catch { return false; }
        })) {
          if (d.device_id) allowedDeviceIds.add(d.device_id);
          if (d.hostname) allowedHostnames.add(d.hostname.toLowerCase());
        }
      });

      filteredDevices = filteredDevices.filter((d: any) =>
        (d.device_id && allowedDeviceIds.has(d.device_id)) ||
        (d.computer_name && allowedHostnames.has(d.computer_name.toLowerCase()))
      );
    } else {
      // Regular user sees only devices assigned to their hostname(s)
      // This part matches the frontend logic
      const { data: userDevices } = await supabase
        .from('devices')
        .select('hostname')
        .eq('owner', user.email);

      const hostnames = new Set(userDevices?.map((d: any) => d.hostname?.toLowerCase()).filter(Boolean));
      filteredDevices = filteredDevices.filter((d: any) => d.computer_name && hostnames.has(d.computer_name.toLowerCase()));
    }

    return NextResponse.json({
      success: true,
      count: filteredDevices.length,
      devices: filteredDevices,
    }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Add authorized USB device
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403, headers: corsHeaders });
    }
    const body = await request.json();

    const {
      serial_number,
      vendor_id,
      product_id,
      device_name,
      vendor_name,
      description,
    } = body;

    if (!serial_number || !device_name) {
      return NextResponse.json(
        { error: "serial_number and device_name are required" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Generate fingerprint hash for manual adds
    const crypto = await import("crypto");
    const fingerprint = [serial_number, vendor_id || "", product_id || ""].join("|").toLowerCase();
    const fingerprint_hash = crypto.createHash("sha256").update(fingerprint).digest("hex");

    const { data, error } = await supabase
      .from("authorized_usb_devices")
      .insert([
        {
          serial_number,
          vendor_id,
          product_id,
          device_name,
          vendor_name,
          description,
          is_active: true,
          fingerprint_hash
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      device: data,
    }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Update authorized USB device
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403, headers: corsHeaders });
    }
    const body = await request.json();

    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const { data, error } = await supabase
      .from("authorized_usb_devices")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      device: data,
    }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Delete authorized USB device
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403, headers: corsHeaders });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const { error } = await supabase
      .from("authorized_usb_devices")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
    }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
