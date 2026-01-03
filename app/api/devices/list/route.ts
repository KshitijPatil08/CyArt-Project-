// app/api/devices/list/route.ts
// Returns list of all devices

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from "next/server"
import { isIpInSubnet } from "@/lib/utils/subnet"
import { createAdminClient } from "@/lib/supabase/admin"


const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

async function getSupabaseClient() {
    const cookieStore = await cookies()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase environment variables')
    }

    return createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // Ignore if called from Server Component
                    }
                },
            },
        }
    )
}

export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, {
        status: 200,
        headers: corsHeaders,
    })
}

export async function GET(request: NextRequest) {
    try {
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
            console.error("Missing Supabase environment variables")
            return NextResponse.json(
                { error: "Server configuration error: Missing Supabase credentials" },
                { status: 500, headers: corsHeaders }
            )
        }

        let supabase
        try {
            supabase = await getSupabaseClient()
        } catch (error: any) {
            console.error("Failed to create Supabase client:", error)
            return NextResponse.json(
                { error: "Failed to initialize database connection", details: error.message },
                { status: 500, headers: corsHeaders }
            )
        }

        // Authentication Check
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            console.error("[DEVICES LIST] Unauthorized access attempt")
            return NextResponse.json(
                { error: "Unauthorized: Please log in" },
                { status: 401, headers: corsHeaders }
            )
        }

        // Fetch all devices from the database
        const { data: devices, error: fetchError } = await supabase
            .from("devices")
            .select("*, servers(id)")
            .order("created_at", { ascending: false })

        if (fetchError) {
            console.error("[DEVICES LIST] Error fetching devices:", fetchError)
            return NextResponse.json(
                { error: "Database query failed", details: fetchError.message },
                { status: 500, headers: corsHeaders }
            )
        }

        // --- Role-Based Filtering Logic ---
        const role = user.user_metadata?.role || 'user';
        const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));
        const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));

        let filteredDevices = devices || [];

        if (isAdmin) {
            // Admin sees all (filteredDevices = devices)
        } else if (isApprover) {
            // Approver Strategy:
            // 1. Fetch assigned subnets
            const adminClient = createAdminClient();
            const { data: assignments } = await adminClient
                .from('subnet_assignments')
                .select('subnet_cidrs')
                .eq('user_id', user.id);

            const assignedSubnets = assignments ? assignments.flatMap(a => a.subnet_cidrs || []) : [];

            // 2. Filter: Show device if (Owner Matches) OR (IP in Assigned Subnet)
            filteredDevices = filteredDevices.filter((d: any) => {
                const ownerEmail = d.owner?.toLowerCase().trim();
                const userEmail = user.email?.toLowerCase().trim();
                const isOwner = ownerEmail === userEmail;

                // Check ownership first (fastest)
                if (isOwner) return true;

                // If not owner, check subnet (if approver has assignments)
                if (assignedSubnets.length > 0 && d.ip_address) {
                    return assignedSubnets.some(cidr => isIpInSubnet(d.ip_address, cidr));
                }
                return false;
            });
        } else {
            // Standard User: Only own devices
            filteredDevices = filteredDevices.filter((d: any) => {
                const ownerEmail = d.owner?.toLowerCase().trim();
                const userEmail = user.email?.toLowerCase().trim();
                return ownerEmail === userEmail;
            });
        }

        // Auto-update stale devices to offline status (on-the-fly)
        const OFFLINE_THRESHOLD_MS = 300 * 1000; // 5 minutes
        const now = Date.now()

        const staleDeviceIds = (filteredDevices || [])
            .filter((device: any) => {
                if (device.status !== 'online') return false
                if (!device.last_seen) return true // No last_seen = stale

                const lastSeenTime = new Date(device.last_seen).getTime()
                return (now - lastSeenTime) >= OFFLINE_THRESHOLD_MS
            })
            .map((device: any) => device.id)

        // Optimization: Do NOT write to DB on GET request specific to every user load.
        // We will calculate the status 'on-the-fly' for the response. 
        // Writing to DB here causes lock contention and slows down the dashboard significantly.

        // Transform data to match expected format
        const transformedDevices = (filteredDevices || []).map((device: any) => {

            const isStale = staleDeviceIds.includes(device.id)
            const isServer = device.servers && (Array.isArray(device.servers) ? device.servers.length > 0 : true)

            return {
                device_id: device.id,
                id: device.id,
                readable_id: device.readable_id,
                device_name: device.device_name,
                device_type: device.device_type,
                owner: device.owner,
                location: device.location,
                hostname: device.hostname,
                ip_address: device.ip_address,
                mac_address: device.mac_address,
                os_version: device.os_version,
                agent_version: device.agent_version,
                status: isStale ? 'offline' : device.status,
                security_status: device.security_status,
                is_quarantined: device.is_quarantined,
                is_server: isServer,
                last_seen: device.last_seen,
                created_at: device.created_at,
                updated_at: device.updated_at,
            }
        })

        console.log(`[DEVICES LIST] Returning ${transformedDevices.length} devices`)

        return NextResponse.json(
            {
                devices: transformedDevices,
                count: transformedDevices.length
            },
            { status: 200, headers: corsHeaders }
        )

    } catch (error: any) {
        console.error("[DEVICES LIST] Unexpected error:", error)
        return NextResponse.json(
            {
                error: "Internal server error",
                details: error?.message || "Unknown error",
                stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
            },
            { status: 500, headers: corsHeaders }
        )
    }
}
