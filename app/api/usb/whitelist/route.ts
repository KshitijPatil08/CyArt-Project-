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

// Get all authorized USB devices
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient(); // Standard client for Auth
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active_only") === "true";

    // Auth Check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    // Role Check: Handle string or array
    let role = user.user_metadata?.role || 'user';
    const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));
    const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));

    console.log(`[USB Whitelist] Fetching via Admin Client. User: ${user.email}, Role: ${role}, IsApprover: ${isApprover}`);

    // Use Admin Client for DATA fetching to bypass strict RLS
    const { createAdminClient } = await import("@/lib/supabase/admin"); // Import dynamically
    const adminClient = createAdminClient();

    // 1. Fetch Whitelist (Raw) - No Join needed, we join in code
    let query = adminClient
      .from("authorized_usb_devices")
      .select("*")
      .order("created_at", { ascending: false });

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data: whitelist, error } = await query;
    if (error) {
      console.error("[USB Whitelist] DB Error:", error);
      throw error;
    }

    let filteredData = whitelist || [];

    // 2. Role-Based Filtering
    if (isAdmin) {
      // Admin sees everything
    } else if (isApprover) {
      const { data: assignments } = await adminClient
        .from('subnet_assignments')
        .select('subnet_cidrs')
        .eq('user_id', user.id);

      if (!assignments || assignments.length === 0) {
        // No subnets? Only show Global Rules? Or nothing?
        // Let's safe-fail to only Global Rules.
        filteredData = filteredData.filter((item: any) => !item.device_id && !item.computer_name);
      } else {
        const { isIpInSubnet } = await import("@/lib/utils/subnet");
        const allowedSubnets = assignments.flatMap(a => a.subnet_cidrs || []);

        // REVERSE STRATEGY:
        // 1. Get ALL devices (lightweight)
        // 2. Identify which ones are in the approver's subnets
        // 3. Filter whitelist to match those "valid" devices OR Global Rules

        const { data: allDevices } = await adminClient
          .from('devices')
          .select('id, hostname, ip_address');

        const validDevices = (allDevices || []).filter((d: any) => {
          if (!d.ip_address) return false;
          return allowedSubnets.some(cidr => isIpInSubnet(d.ip_address, cidr));
        });

        // Create Lookup Sets for fast matching
        // Normalizing hostname to lowercase for case-insensitive match
        const validDeviceIds = new Set(validDevices.map((d: any) => d.id));
        const validHostnames = new Set(validDevices.map((d: any) => (d.hostname || '').toLowerCase()).filter(Boolean));

        console.log(`[USB Whitelist] Found ${validDevices.length} devices in approver subnets.`);

        filteredData = filteredData.filter((item: any) => {
          // Case 1: Global Rule (Not linked to specific device) -> SHOW
          if (!item.device_id && !item.computer_name) {
            return true;
          }

          // Case 2: Linked by ID -> Check against Valid List
          if (item.device_id && validDeviceIds.has(item.device_id)) {
            return true;
          }

          // Case 3: Linked by Hostname -> Check against Valid List
          if (item.computer_name) {
            const itemHost = (item.computer_name || '').toLowerCase();
            if (validHostnames.has(itemHost)) {
              return true;
            }
          }

          // Default: HIDE (It's linked to a device NOT in the subnet)
          return false;
        });
      }
    } else {
      // Standard User: Show only their own devices or global rules (if applicable, but usually specific)
      const { data: myDevices } = await adminClient
        .from('devices')
        .select('id, hostname')
        .eq('owner', user.email);

      const myDeviceIds = new Set((myDevices || []).map((d: any) => d.id));
      const myHostnames = new Set((myDevices || []).map((d: any) => (d.hostname || '').toLowerCase()).filter(Boolean));

      filteredData = filteredData.filter((item: any) => {
        // Case 1: Linked by ID -> Check against My Devices
        if (item.device_id && myDeviceIds.has(item.device_id)) {
          return true;
        }

        // Case 2: Linked by Hostname -> Check against My Devices
        if (item.computer_name) {
          const itemHost = (item.computer_name || '').toLowerCase();
          if (myHostnames.has(itemHost)) {
            return true;
          }
        }

        // Note: We don't show Global Rules to standard users to avoid clutter, 
        // they only care about their own whitelisted devices.
        return false;
      });
    }

    return NextResponse.json({
      success: true,
      count: filteredData.length,
      devices: filteredData,
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
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    // Role Check
    const role = user.user_metadata?.role || 'user';
    const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));
    const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));

    if (!isAdmin && !isApprover) {
      return NextResponse.json({ error: "Forbidden: Admin or Approver access required" }, { status: 403, headers: corsHeaders });
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
    // Role Check
    const role = user?.user_metadata?.role || 'user';
    const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));
    const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));

    if (!isAdmin && !isApprover) {
      return NextResponse.json({ error: "Forbidden: Admin or Approver access required" }, { status: 403, headers: corsHeaders });
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
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    // Role Check
    const role = user.user_metadata?.role || 'user';
    const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));
    const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));

    if (!isAdmin && !isApprover) {
      return NextResponse.json({ error: "Forbidden: Admin or Approver access required" }, { status: 403, headers: corsHeaders });
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
