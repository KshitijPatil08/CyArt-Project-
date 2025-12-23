import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod";
import crypto from 'crypto';

const registerSchema = z.object({
  device_name: z.string().min(1),
  device_type: z.string().min(1),
  owner: z.string().optional(),
  location: z.string().optional(),
  ip_address: z.string().optional(),
  mac_address: z.string().optional(),
  hostname: z.string().optional(),
  os_version: z.string().optional(),
  agent_version: z.string().optional(),
});

const allowedOrigins = [
  'https://cyart-dashboard.vercel.app',
  process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : ''
].filter(Boolean);

function getCorsHeaders(request: NextRequest) {
  const origin = request.headers.get('origin');
  const isAllowed = allowedOrigins.includes(origin || '');

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin! : 'null',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
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
    headers: getCorsHeaders(request),
  })
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error("Missing Supabase environment variables")
      return NextResponse.json(
        { error: "Server configuration error: Missing Supabase credentials" },
        { status: 500, headers: getCorsHeaders(request) }
      )
    }

    let supabase
    try {
      supabase = await getSupabaseClient()
    } catch (error: any) {
      console.error("Failed to create Supabase client:", error)
      return NextResponse.json(
        { error: "Failed to initialize database connection", details: error.message },
        { status: 500, headers: getCorsHeaders(request) }
      )
    }

    // Parse JSON body
    let body
    try {
      body = await request.json()
    } catch (e) {
      console.error("Failed to parse request body:", e)
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: getCorsHeaders(request) }
      )
    }

    const validationResult = registerSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validationResult.error.format() },
        { status: 400, headers: getCorsHeaders(request) }
      );
    }

    const {
      device_name,
      device_type,
      owner,
      location,
      ip_address,
      mac_address,
      hostname,
      os_version,
      agent_version
    } = validationResult.data

    // Ensure hostname is provided, use device_name as fallback
    const finalHostname = hostname || device_name

    console.log("[REGISTRATION] Registering device:", { device_name, hostname: finalHostname, ip_address, mac_address })

    // CRITICAL FIX: Check if device exists by hostname
    const { data: existingDevice, error: fetchError } = await supabase
      .from("devices")
      .select("id, readable_id, device_name, status, owner, security_status, is_quarantined")
      .eq("hostname", finalHostname)
      .maybeSingle()

    if (fetchError) {
      console.error("[REGISTRATION] Error checking existing device:", fetchError)
      return NextResponse.json(
        { error: "Database query failed", details: fetchError.message },
        { status: 500, headers: getCorsHeaders(request) }
      )
    }

    let deviceId
    let readableId
    let isNewDevice = false

    if (existingDevice) {
      // Device exists - UPDATE it
      readableId = existingDevice.readable_id
      deviceId = existingDevice.id

      console.log("[REGISTRATION] Device found. Updating:", {
        id: deviceId,
        readable_id: readableId,
        hostname: finalHostname,
        ip_address,
        mac_address
      })

      // Build update object with all fields
      const updateData: any = {
        device_name,
        device_type,
        owner: existingDevice.owner || owner,
        location,
        hostname: finalHostname,
        os_version,
        agent_version,
        status: "online",
        // CRITICAL SECURITY FIX: Preserve existing security status and quarantine state
        // Do NOT reset to 'secure' or release from quarantine automatically
        // security_status: "secure", <--- REMOVED
        // is_quarantined: false,     <--- REMOVED
        security_status: existingDevice.security_status, // Preserve existing
        is_quarantined: existingDevice.is_quarantined,   // Preserve existing
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (ip_address) updateData.ip_address = ip_address
      if (mac_address) updateData.mac_address = mac_address

      const { error: updateError } = await supabase
        .from("devices")
        .update(updateData)
        .eq("id", existingDevice.id)

      if (updateError) {
        console.error("[REGISTRATION] Error updating device:", updateError)
        return NextResponse.json(
          { error: "Failed to update device", details: updateError.message },
          { status: 500, headers: getCorsHeaders(request) }
        )
      }

      console.log("[REGISTRATION] Device updated successfully")

      // Log the re-registration event
      await supabase.from("logs").insert([{
        device_id: deviceId,
        log_type: "system",
        source: "registration-system",
        severity: "info",
        message: `Device re-registered: ${device_name} (${finalHostname})`,
        timestamp: new Date().toISOString(),
        raw_data: {
          action: "re-registration",
          ip_address,
          mac_address,
          agent_version
        }
      }])

    } else {
      // Device doesn't exist - CREATE new device
      isNewDevice = true

      // Generate readable ID
      const { count } = await supabase
        .from("devices")
        .select("id", { count: "exact", head: true })

      readableId = `Device-${crypto.randomUUID().slice(0, 8)}`

      console.log("[REGISTRATION] Creating new device:", {
        readable_id: readableId,
        hostname: finalHostname,
        device_name,
        ip_address,
        mac_address
      })

      // Build insert object
      const insertData: any = {
        device_name,
        device_type,
        owner,
        location,
        hostname: finalHostname,
        os_version,
        agent_version,
        readable_id: readableId,
        status: "online",
        security_status: "secure",
        is_quarantined: false,
        last_seen: new Date().toISOString(),
      }

      if (ip_address) insertData.ip_address = ip_address
      if (mac_address) insertData.mac_address = mac_address

      const { data: newDevice, error: insertError } = await supabase
        .from("devices")
        .insert([insertData])
        .select()
        .single()

      if (insertError) {
        console.error("[REGISTRATION] Error creating device:", insertError)
        return NextResponse.json(
          { error: "Failed to create device", details: insertError.message },
          { status: 500, headers: getCorsHeaders(request) }
        )
      }

      deviceId = newDevice.id
      console.log("[REGISTRATION] Device created successfully:", deviceId)

      // Log the initial registration
      await supabase.from("logs").insert([{
        device_id: deviceId,
        log_type: "system",
        source: "registration-system",
        severity: "info",
        message: `Device registered for the first time: ${device_name} (${finalHostname})`,
        timestamp: new Date().toISOString(),
        raw_data: {
          action: "initial-registration",
          ip_address,
          mac_address,
          agent_version
        }
      }])
    }

    console.log("[REGISTRATION] Registration successful:", {
      device_id: deviceId,
      readable_id: readableId,
      is_new: isNewDevice
    })

    return NextResponse.json(
      {
        success: true,
        device_id: deviceId,
        readable_id: readableId,
        is_new_device: isNewDevice,
        message: isNewDevice ? "Device registered successfully" : "Device re-registered successfully"
      },
      { status: isNewDevice ? 201 : 200, headers: getCorsHeaders(request) }
    )

  } catch (error: any) {
    console.error("[REGISTRATION] Unexpected error:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error?.message || "Unknown error",
        stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      },
      { status: 500, headers: getCorsHeaders(request) }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { error: "Method not allowed. Use POST to register a device." },
    { status: 405, headers: getCorsHeaders(request) }
  )
}