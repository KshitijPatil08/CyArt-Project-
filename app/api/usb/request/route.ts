// app/api/usb/request/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isIpInSubnet } from "@/lib/utils/subnet"
import { createAdminClient } from "@/lib/supabase/admin"
import crypto from "crypto";
import { z } from "zod";

// Helper to get IP
function getRequestIp(request: NextRequest) {
    const forwardedFor = request.headers.get('x-forwarded-for');
    return forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';
}


export const dynamic = 'force-dynamic'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function getCorsHeaders(request: NextRequest) {
    return corsHeaders;
}

export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, {
        status: 200,
        headers: getCorsHeaders(request),
    })
}

const usbRequestSchema = z.object({
    serial_number: z.string().min(1),
    vendor_id: z.string().optional().nullable(),
    product_id: z.string().optional().nullable(),
    device_name: z.string().min(1),
    vendor_name: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    device_class: z.string().optional().nullable(),
    hardware_id: z.string().optional().nullable(),
    device_id: z.string().min(1),
    computer_name: z.string().optional().nullable()
});

const usbApproveSchema = z.object({
    id: z.string().min(1),
    action: z.enum(['approve', 'reject']),
    policies: z.object({
        max_daily_transfer_mb: z.any().optional(), // Deprecated / Ignored
        allowed_start_time: z.string().optional().nullable(),
        allowed_end_time: z.string().optional().nullable(),
        expiration_date: z.string().optional().nullable(),
        is_read_only: z.boolean().optional().nullable()
    }).optional().nullable()
});

// Helper to generate SHA-256 fingerprint hash
function generateFingerprintHash(data: any) {
    const { serial_number, vendor_id, product_id, device_class, hardware_id, device_id } = data;
    const fingerprint = [
        serial_number || "",
        vendor_id || "",
        product_id || "",
        device_class || "",
        hardware_id || "",
        device_id || "" // Machine Binding
    ].join("|").toLowerCase();
    return crypto.createHash("sha256").update(fingerprint).digest("hex");
}

// GET: Fetch pending USB approval requests and flag unknown agents
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        // AUTH CHECK
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: getCorsHeaders(request) });
        }

        const role = user.user_metadata?.role || 'user';
        const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));
        const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));

        // Use Admin Client to bypass RLS for fetching requests.
        // We will apply strict Application-Level filtering below.
        const adminDb = createAdminClient();
        const { data: requests, error } = await adminDb
            .from("usb_approval_requests")
            .select("*")
            .eq("status", "pending")
            .order("requested_at", { ascending: false });

        if (error) throw error;

        let filteredRequests = requests || [];

        // Role-Based Filtering
        if (isAdmin) {
            // Admin sees all (no filter)
        } else if (isApprover) {
            // Fetch assignments
            const adminClient = createAdminClient();
            const { data: assignments } = await adminClient
                .from('subnet_assignments')
                .select('subnet_cidrs')
                .eq('user_id', user.id);

            if (!assignments || assignments.length === 0) {
                filteredRequests = [];
            } else {
                const allowedSubnets = assignments.flatMap(a => a.subnet_cidrs || []);

                // Fetch all devices to identify which ones belong to the allowed subnets
                // Use Admin Client to prevent RLS from hiding devices that we need to inspect for subnet membership.
                const deviceAdminDb = createAdminClient();
                const { data: allDevices } = await deviceAdminDb
                    .from('devices')
                    .select('device_id, hostname, ip_address');

                const allowedDeviceIds = new Set<string>();
                const allowedHostnames = new Set<string>();

                if (allDevices) {
                    allDevices.forEach(d => {
                        // Safe Check: Ensure IP exists
                        if (!d.ip_address) return;

                        // Check Subnet Membership
                        // (isIpInSubnet handles errors internally, but we can catch them to be safe)
                        try {
                            if (allowedSubnets.some(cidr => isIpInSubnet(d.ip_address, cidr))) {
                                if (d.device_id) allowedDeviceIds.add(d.device_id);
                                if (d.hostname) allowedHostnames.add(d.hostname.toLowerCase());
                            }
                        } catch (e) {
                            // Ignore IP parsing errors (e.g. IPv6 vs IPv4)
                        }
                    });
                }

                filteredRequests = filteredRequests.filter(req => {
                    // Check 1: Request comes physically from the Subnet
                    let ipMatch = false;
                    try {
                        ipMatch = req.ip_address && allowedSubnets.some(cidr => isIpInSubnet(req.ip_address, cidr));
                    } catch (e) { }

                    if (ipMatch) return true;

                    // Check 2: Request comes from a Device Identity that belongs to the Subnet
                    // (Handles localhost tools, roaming, VPN, etc.)
                    const idMatch = req.device_id && allowedDeviceIds.has(req.device_id);
                    const hostMatch = req.computer_name && allowedHostnames.has(req.computer_name.toLowerCase());

                    if (idMatch || hostMatch) {
                        return true;
                    }

                    return false;
                });
            }
        } else {
            // Regular user - return nothing
            filteredRequests = [];
        }

        // Optimize Entity Enrichment (Batch Fetch)
        const hostnames = Array.from(new Set(filteredRequests.map((r: any) => r.computer_name).filter(Boolean)));

        // Fetch all relevant devices in one go
        let knownDevicesMap = new Set();
        if (hostnames.length > 0) {
            const { data: devices } = await supabase
                .from("devices")
                .select("hostname")
                .in("hostname", hostnames);

            if (devices) {
                devices.forEach((d: any) => knownDevicesMap.add(d.hostname));
            }
        }

        const enriched = filteredRequests.map((req: any) => ({
            ...req,
            isUnknownAgent: req.computer_name ? !knownDevicesMap.has(req.computer_name) : true
        }));
        return NextResponse.json({ success: true, requests: enriched }, { headers: getCorsHeaders(request) });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: getCorsHeaders(request) });
    }
}

// POST: Agent submits a new USB request (allow unknown agents)
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // NOTE: Agent submission might be unauthenticated if it's a new agent.
        // For now, we allow POST but protect GET/PUT via auth checks.
        // TODO: Implement device token header validation to secure this endpoint while
        // allowing unknown agents to register on first submission.

        const body = await request.json();

        const validationResult = usbRequestSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: "Validation failed", details: validationResult.error.format() },
                { status: 400, headers: getCorsHeaders(request) }
            );
        }

        const {
            serial_number,
            vendor_id,
            product_id,
            device_name,
            vendor_name,
            description,
            device_class,
            hardware_id,
            device_id,
            computer_name
        } = validationResult.data;

        const fingerprint_hash = generateFingerprintHash({
            serial_number,
            vendor_id,
            product_id,
            device_class,
            hardware_id,
            device_id
        });

        // Prevent duplicate pending requests
        const { data: existingRequest } = await supabase
            .from("usb_approval_requests")
            .select("id")
            .eq("fingerprint_hash", fingerprint_hash)
            .eq("status", "pending")
            .maybeSingle();
        if (existingRequest) {
            return NextResponse.json({ success: true, message: "Request already pending" }, { headers: getCorsHeaders(request) });
        }

        // Prevent creating a request for a device that is already authorized
        const { data: existingAuth } = await supabase
            .from("authorized_usb_devices")
            .select("id")
            .eq("fingerprint_hash", fingerprint_hash)
            .eq("is_active", true)
            .maybeSingle();
        if (existingAuth) {
            return NextResponse.json({ success: true, message: "Device already authorized" }, { headers: getCorsHeaders(request) });
        }

        const { error } = await supabase.from("usb_approval_requests").insert([
            {
                serial_number,
                vendor_id,
                product_id,
                device_name,
                vendor_name,
                description,
                device_class,
                hardware_id,
                device_id,
                computer_name, // may be undefined for unknown agents
                fingerprint_hash,
                status: "pending",
                ip_address: getRequestIp(request)
            }
        ]);
        if (error) throw error;
        return NextResponse.json({ success: true, message: "Request submitted successfully" }, { headers: getCorsHeaders(request) });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: getCorsHeaders(request) });
    }
}

// PUT: Admin approves or rejects a request
export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient();

        // AUTH CHECK - Admin only
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: getCorsHeaders(request) });
        }

        // Enforce Admin or Approver Role
        const role = user.user_metadata?.role || 'user';
        const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));
        const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));

        if (!isAdmin && !isApprover) {
            return NextResponse.json({ error: "Forbidden: Admin or Approver access required" }, { status: 403, headers: getCorsHeaders(request) });
        }

        const body = await request.json();

        const validationResult = usbApproveSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: "Validation failed", details: validationResult.error.format() },
                { status: 400, headers: getCorsHeaders(request) }
            );
        }

        const { id, action, policies } = validationResult.data; // action: 'approve' | 'reject'

        // Use Admin Client to bypass RLS for this management action
        const admin = createAdminClient();

        if (action === "reject") {
            const { error } = await admin
                .from("usb_approval_requests")
                .update({ status: "rejected" })
                .eq("id", id);
            if (error) throw error;
            return NextResponse.json({ success: true, message: "Request rejected" }, { headers: getCorsHeaders(request) });
        }
        if (action === "approve") {
            const { data: reqData, error: fetchError } = await admin
                .from("usb_approval_requests")
                .select("*")
                .eq("id", id)
                .single();
            if (fetchError || !reqData) throw fetchError || new Error("Request not found");

            // --- RBAC Validation for Approvers ---
            if (!isAdmin && isApprover) {
                const { isIpInSubnet } = await import("@/lib/utils/subnet");
                const { data: assignments } = await admin
                    .from('subnet_assignments')
                    .select('subnet_cidrs')
                    .eq('user_id', user.id);

                const allowedSubnets = assignments?.flatMap(a => a.subnet_cidrs || []) || [];

                // Check 1: Request comes physically from the Subnet
                let isAllowed = false;
                try {
                    isAllowed = reqData.ip_address && allowedSubnets.some(cidr => isIpInSubnet(reqData.ip_address, cidr));
                } catch (e) { }

                // Check 2: Request comes from a Device Identity that belongs to the Subnet
                // Aligns with GET logic to handle roaming, localhost tools, etc.
                if (!isAllowed && allowedSubnets.length > 0) {
                    const { data: allDevices } = await admin
                        .from('devices')
                        .select('device_id, hostname, ip_address');

                    if (allDevices) {
                        const allowedDeviceIds = new Set<string>();
                        const allowedHostnames = new Set<string>();

                        allDevices.forEach(d => {
                            if (!d.ip_address) return;
                            try {
                                if (allowedSubnets.some(cidr => isIpInSubnet(d.ip_address, cidr))) {
                                    if (d.device_id) allowedDeviceIds.add(d.device_id);
                                    if (d.hostname) allowedHostnames.add(d.hostname.toLowerCase());
                                }
                            } catch (e) { }
                        });

                        const idMatch = reqData.device_id && allowedDeviceIds.has(reqData.device_id);
                        const hostMatch = reqData.computer_name && allowedHostnames.has(reqData.computer_name.toLowerCase());

                        if (idMatch || hostMatch) {
                            isAllowed = true;
                        }
                    }
                }

                if (!isAllowed) {
                    return NextResponse.json({ error: "Forbidden: Request is outside your assigned subnets" }, { status: 403, headers: getCorsHeaders(request) });
                }
            }

            console.log("Approving device: " + reqData.device_name + " (" + reqData.serial_number + ")");

            const { error: insertError } = await admin
                .from("authorized_usb_devices")
                .insert([
                    {
                        serial_number: reqData.serial_number,
                        vendor_id: reqData.vendor_id,
                        product_id: reqData.product_id,
                        device_name: reqData.device_name,
                        vendor_name: reqData.vendor_name,
                        description: reqData.description,
                        // device_id and computer_name are supported
                        device_id: reqData.device_id,
                        computer_name: reqData.computer_name,
                        is_active: true,
                        // Apply policies (permissive defaults)
                        max_daily_transfer_mb: policies?.max_daily_transfer_mb || null,
                        allowed_start_time: policies?.allowed_start_time || null,
                        allowed_end_time: policies?.allowed_end_time || null,
                        expiration_date: policies?.expiration_date || null,
                        is_read_only: policies?.is_read_only || false
                    }
                ]);
            if (insertError) {
                console.error('[USB API] Insert error:', insertError);
                throw insertError;
            }

            await admin
                .from("usb_approval_requests")
                .update({ status: "approved" })
                .eq("id", id);

            console.log('[USB API] Approval completed successfully');
            return NextResponse.json({ success: true, message: "Device authorized successfully" }, { headers: getCorsHeaders(request) });
        }
        return NextResponse.json({ error: "Invalid action" }, { status: 400, headers: getCorsHeaders(request) });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: getCorsHeaders(request) });
    }
}
