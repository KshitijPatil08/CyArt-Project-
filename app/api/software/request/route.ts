// app/api/software/request/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isIpInSubnet } from "@/lib/utils/subnet"
import { createAdminClient } from "@/lib/supabase/admin"
import crypto from "crypto";
import { z } from "zod";

export const dynamic = 'force-dynamic'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function getRequestIp(request: NextRequest) {
    const forwardedFor = request.headers.get('x-forwarded-for');
    return forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';
}

export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, {
        status: 200,
        headers: corsHeaders,
    })
}

const softwareRequestSchema = z.object({
    name: z.string().min(1),
    publisher: z.string().optional().nullable(),
    year: z.union([z.string(), z.number()]).optional().nullable(),
    device_id: z.string().min(1),
    computer_name: z.string().optional().nullable()
});

function generateSoftwareHash(data: any) {
    const { name, publisher, device_id } = data;
    const fingerprint = [
        name || "",
        publisher || "",
        device_id || ""
    ].join("|").toLowerCase();
    return crypto.createHash("sha256").update(fingerprint).digest("hex");
}

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        // AUTH CHECK
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }

        const role = user.user_metadata?.role || 'user';
        const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));
        const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));

        // Use Admin Client to bypass RLS for fetching requests.
        // We will apply strict Application-Level filtering below.
        const adminDb = createAdminClient();
        const { data: requests, error } = await adminDb
            .from("software_approval_requests")
            .select("*")
            .eq("status", "pending")
            .order("requested_at", { ascending: false });

        if (error) throw error;

        let filteredRequests = requests || [];

        // Role-Based Filtering
        if (isAdmin) {
            // Admin sees all (no filter)
        } else if (isApprover) {
            const adminClient = createAdminClient();
            const { data: assignments } = await adminClient
                .from('subnet_assignments')
                .select('subnet_cidrs')
                .eq('user_id', user.id);

            if (!assignments || assignments.length === 0) {
                // If approver has no subnets assigned, they see nothing
                filteredRequests = [];
            } else {
                const allowedSubnets = assignments.flatMap(a => a.subnet_cidrs || []);

                // Fetch all devices to identify which ones belong to the allowed subnets
                const deviceAdminDb = createAdminClient();
                const { data: allDevices } = await deviceAdminDb
                    .from('devices')
                    .select('device_id, hostname, ip_address');

                const allowedDeviceIds = new Set<string>();
                const allowedHostnames = new Set<string>();

                if (allDevices) {
                    allDevices.forEach(d => {
                        if (!d.ip_address) return;
                        try {
                            if (allowedSubnets.some(cidr => isIpInSubnet(d.ip_address, cidr))) {
                                if (d.device_id) allowedDeviceIds.add(d.device_id);
                                if (d.hostname) allowedHostnames.add(d.hostname.toLowerCase());
                            }
                        } catch (e) { }
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
                    const idMatch = req.device_id && allowedDeviceIds.has(req.device_id);
                    const hostMatch = req.computer_name && allowedHostnames.has(req.computer_name.toLowerCase());

                    if (idMatch || hostMatch) {
                        return true;
                    }

                    return false;
                });
            }
        } else {
            // Standard user
            filteredRequests = [];
        }

        // Enrichment: Check for unknown agents
        const hostnames = Array.from(new Set(filteredRequests.map((r: any) => r.computer_name).filter(Boolean)));
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

        return NextResponse.json({ success: true, requests: enriched }, { headers: corsHeaders });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = createAdminClient();
        const body = await request.json();

        const validationResult = softwareRequestSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: "Validation failed", details: validationResult.error.format() },
                { status: 400, headers: corsHeaders }
            );
        }

        const {
            name,
            publisher,
            year,
            device_id,
            computer_name
        } = validationResult.data;

        const fingerprint_hash = generateSoftwareHash({ name, publisher, device_id });

        // Check if already pending
        const { data: existingRequest } = await supabase
            .from("software_approval_requests")
            .select("id")
            .eq("fingerprint_hash", fingerprint_hash)
            .eq("status", "pending")
            .maybeSingle();
        if (existingRequest) {
            return NextResponse.json({ success: true, message: "Request already pending" }, { headers: corsHeaders });
        }

        // Check if already authorized
        const { data: existingAuth } = await supabase
            .from("authorized_software")
            .select("id")
            .eq("hash", name) // For now, we match by name as a simple whitelist
            .maybeSingle();

        if (existingAuth) {
            return NextResponse.json({ success: true, message: "Software already authorized" }, { headers: corsHeaders });
        }

        const { error } = await supabase.from("software_approval_requests").insert([
            {
                name,
                publisher,
                year,
                device_id,
                computer_name,
                fingerprint_hash,
                status: "pending",
                ip_address: getRequestIp(request)
            }
        ]);
        if (error) throw error;
        return NextResponse.json({ success: true, message: "Software request submitted" }, { headers: corsHeaders });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
}
