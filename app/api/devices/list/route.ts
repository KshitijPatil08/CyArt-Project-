// app/api/devices/list/route.ts
// Returns list of all devices

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from "next/server"

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
            .select("*")
            .order("created_at", { ascending: false })

        if (fetchError) {
            console.error("[DEVICES LIST] Error fetching devices:", fetchError)
            return NextResponse.json(
                { error: "Database query failed", details: fetchError.message },
                { status: 500, headers: corsHeaders }
            )
        }

        // Auto-update stale devices to offline status in the database
        // A device is considered stale if last_seen is older than 60 seconds
        const OFFLINE_THRESHOLD_MS = 60 * 1000 // 60 seconds
        const now = Date.now()

        const staleDeviceIds = (devices || [])
            .filter((device: any) => {
                if (device.status !== 'online') return false
                if (!device.last_seen) return true // No last_seen = stale

                const lastSeenTime = new Date(device.last_seen).getTime()
                return (now - lastSeenTime) >= OFFLINE_THRESHOLD_MS
            })
            .map((device: any) => device.id)

        // Update stale devices to offline in database
        if (staleDeviceIds.length > 0) {
            const { error: updateError } = await supabase
                .from("devices")
                .update({
                    status: 'offline',
                    updated_at: new Date().toISOString()
                })
                .in("id", staleDeviceIds)

            if (updateError) {
                console.error("[DEVICES LIST] Error updating stale devices:", updateError)
            } else {
                console.log(`[DEVICES LIST] Marked ${staleDeviceIds.length} stale device(s) as offline`)
            }
        }

        // Transform data to match expected format
        // Apply the offline status for stale devices in the response
        const transformedDevices = (devices || []).map((device: any) => {
            const isStale = staleDeviceIds.includes(device.id)
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
                is_server: device.is_server,
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
