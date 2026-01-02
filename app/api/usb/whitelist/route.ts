import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
<<<<<<< HEAD

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
=======
import { isIpInSubnet } from "@/lib/utils/subnet";

// Restricted CORS (Same-origin only)
const corsHeaders = {
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Get all authorized USB devices
export async function GET(request: NextRequest) {
  try {
<<<<<<< HEAD
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
=======
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active_only") === "true";

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const role = user.user_metadata?.role || 'user';
    const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));
    const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));

    let query = supabase
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
      .from("authorized_usb_devices")
      .select("*")
      .order("created_at", { ascending: false });

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

<<<<<<< HEAD
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
=======
    const { data: devices, error } = await query;
    if (error) throw error;

    let filteredDevices = devices || [];

    // Role-Based Filtering
    if (isAdmin) {
      // Admin sees all
    } else if (isApprover) {
      // Approver sees devices in their assigned subnets
      const { data: assignments } = await supabase
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
        .from('subnet_assignments')
        .select('subnet_cidrs')
        .eq('user_id', user.id);

<<<<<<< HEAD
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
=======
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
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
    }

    return NextResponse.json({
      success: true,
<<<<<<< HEAD
      count: filteredData.length,
      devices: filteredData,
=======
      count: filteredDevices.length,
      devices: filteredDevices,
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
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
<<<<<<< HEAD
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    // Role Check
    const role = user.user_metadata?.role || 'user';
    const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));
    const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));

    if (!isAdmin && !isApprover) {
      return NextResponse.json({ error: "Forbidden: Admin or Approver access required" }, { status: 403, headers: corsHeaders });
    }

=======
    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403, headers: corsHeaders });
    }
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
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

<<<<<<< HEAD
=======
    // Generate fingerprint hash for manual adds
    const crypto = await import("crypto");
    const fingerprint = [serial_number, vendor_id || "", product_id || ""].join("|").toLowerCase();
    const fingerprint_hash = crypto.createHash("sha256").update(fingerprint).digest("hex");

>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
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
<<<<<<< HEAD
=======
          fingerprint_hash
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
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
<<<<<<< HEAD
    // Role Check
    const role = user?.user_metadata?.role || 'user';
    const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));
    const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));

    if (!isAdmin && !isApprover) {
      return NextResponse.json({ error: "Forbidden: Admin or Approver access required" }, { status: 403, headers: corsHeaders });
=======
    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403, headers: corsHeaders });
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
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
<<<<<<< HEAD
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    // Role Check
    const role = user.user_metadata?.role || 'user';
    const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));
    const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));

    if (!isAdmin && !isApprover) {
      return NextResponse.json({ error: "Forbidden: Admin or Approver access required" }, { status: 403, headers: corsHeaders });
    }

=======
    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403, headers: corsHeaders });
    }
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
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
