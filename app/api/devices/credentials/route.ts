// app/api/devices/credentials/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function getCorsHeaders(request: NextRequest) {
    return corsHeaders;
}

export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, {
        status: 200,
        headers: getCorsHeaders(request),
    });
}

/**
 * GET /api/devices/credentials
 * Fetch device credentials securely from server-side
 * 
 * Query params:
 * - device_id (optional): Fetch credentials for a specific device
 * 
 * Returns:
 * - Single credential object if device_id is provided
 * - Array of all credentials if no device_id (admin only)
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        // AUTH CHECK - Must be authenticated
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401, headers: getCorsHeaders(request) }
            );
        }

        const { searchParams } = new URL(request.url);
        const deviceId = searchParams.get('device_id');

        // If requesting a specific device's credentials
        if (deviceId) {
            // Check if user has permission to view this device's credentials
            const { data: device, error: deviceError } = await supabase
                .from("devices")
                .select("id, owner")
                .eq("id", deviceId)
                .single();

            if (deviceError || !device) {
                return NextResponse.json(
                    { error: "Device not found" },
                    { status: 404, headers: getCorsHeaders(request) }
                );
            }

            // Non-admin users can only view their own devices
            const userRole = user.user_metadata?.role;
            const userEmail = user.email?.toLowerCase().trim();
            const deviceOwner = device.owner?.toLowerCase().trim();

            if (userRole !== 'admin' && deviceOwner !== userEmail) {
                return NextResponse.json(
                    { error: "Forbidden: You can only view credentials for your own devices" },
                    { status: 403, headers: getCorsHeaders(request) }
                );
            }

            // Fetch the credentials
            const { data: credentials, error: credError } = await supabase
                .from("device_credentials")
                .select("device_id, username, password")
                .eq("device_id", deviceId)
                .single();

            if (credError) {
                return NextResponse.json(
                    { error: "Credentials not found" },
                    { status: 404, headers: getCorsHeaders(request) }
                );
            }

            return NextResponse.json(
                { success: true, credential: credentials },
                { headers: getCorsHeaders(request) }
            );
        }

        // If requesting all credentials (admin only or user's own devices)
        const userRole = user.user_metadata?.role;
        const userEmail = user.email?.toLowerCase().trim();

        if (userRole === 'admin') {
            // Admin can fetch all credentials
            const { data: credentials, error: credError } = await supabase
                .from("device_credentials")
                .select("device_id, username, password");

            if (credError) {
                return NextResponse.json(
                    { error: "Failed to fetch credentials" },
                    { status: 500, headers: getCorsHeaders(request) }
                );
            }

            return NextResponse.json(
                { success: true, credentials: credentials || [] },
                { headers: getCorsHeaders(request) }
            );
        } else {
            // Non-admin users: fetch credentials only for their own devices
            // First, get the user's devices
            const { data: userDevices, error: devicesError } = await supabase
                .from("devices")
                .select("id")
                .ilike("owner", userEmail || '');

            if (devicesError) {
                return NextResponse.json(
                    { error: "Failed to fetch devices" },
                    { status: 500, headers: getCorsHeaders(request) }
                );
            }

            const deviceIds = (userDevices || []).map(d => d.id);

            if (deviceIds.length === 0) {
                return NextResponse.json(
                    { success: true, credentials: [] },
                    { headers: getCorsHeaders(request) }
                );
            }

            // Fetch credentials for user's devices
            const { data: credentials, error: credError } = await supabase
                .from("device_credentials")
                .select("device_id, username, password")
                .in("device_id", deviceIds);

            if (credError) {
                return NextResponse.json(
                    { error: "Failed to fetch credentials" },
                    { status: 500, headers: getCorsHeaders(request) }
                );
            }

            return NextResponse.json(
                { success: true, credentials: credentials || [] },
                { headers: getCorsHeaders(request) }
            );
        }
    } catch (error: any) {
        console.error('[Credentials API] Error:', error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500, headers: getCorsHeaders(request) }
        );
    }
}
