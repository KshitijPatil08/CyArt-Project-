// app/api/devices/register/route.ts
// FIXED: Handles re-registration after device deletion

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from "next/server"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

export async function POST(request: NextRequest) {
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

    // Parse JSON body
    let body
    try {
      body = await request.json()
    } catch (e) {
      console.error("Failed to parse request body:", e)
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: corsHeaders }
      )
    }

    const { 
      device_name, 
      device_type, 
      owner, 
      location, 
      ip_address, 
      hostname, 
      os_version, 
      agent_version 
    } = body

    if (!device_name || !device_type) {
      return NextResponse.json(
        { error: "Missing required fields: device_name and device_type" },
        { status: 400, headers: corsHeaders }
      )
    }

    console.log("[REGISTRATION] Registering device:", { device_name, hostname })

    // CRITICAL FIX: Check if device exists by hostname
    // Use maybeSingle() instead of single() to avoid errors when device doesn't exist
    const { data: existingDevice, error: fetchError } = await supabase
      .from("devices")
      .select("id, readable_id, device_name, status")
      .eq("hostname", hostname)
      .maybeSingle()

    if (fetchError) {
      console.error("[REGISTRATION] Error checking existing device:", fetchError)
      return NextResponse.json(
        { error: "Database query failed", details: fetchError.message },
        { status: 500, headers: corsHeaders }
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
        hostname
      })

      const { error: updateError } = await supabase
        .from("devices")
        .update({
          device_name,
          device_type,
          owner,
          location,
          ip_address,
          hostname,
          os_version,
          agent_version,
          status: "online",
          security_status: "secure", // Reset security status on re-registration
          is_quarantined: false,     // Release from quarantine if it was quarantined
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingDevice.id)

      if (updateError) {
        console.error("[REGISTRATION] Error updating device:", updateError)
        return NextResponse.json(
          { error: "Failed to update device", details: updateError.message },
          { status: 500, headers: corsHeaders }
        )
      }

      console.log("[REGISTRATION] Device updated successfully")

      // Log the re-registration event
      await supabase.from("logs").insert([{
        device_id: deviceId,
        log_type: "system",
        source: "registration-system",
        severity: "info",
        message: `Device re-registered: ${device_name} (${hostname})`,
        timestamp: new Date().toISOString(),
        raw_data: { 
          action: "re-registration",
          ip_address,
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
        hostname,
        device_name
      })

      const { data: newDevice, error: insertError } = await supabase
        .from("devices")
        .insert([
          {
            device_name,
            device_type,
            owner,
            location,
            ip_address,
            hostname,
            os_version,
            agent_version,
            readable_id: readableId,
            status: "online",
            security_status: "secure",
            is_quarantined: false,
            last_seen: new Date().toISOString(),
          },
        ])
        .select()
        .single()

      if (insertError) {
        console.error("[REGISTRATION] Error creating device:", insertError)
        return NextResponse.json(
          { error: "Failed to create device", details: insertError.message },
          { status: 500, headers: corsHeaders }
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
        message: `Device registered for the first time: ${device_name} (${hostname})`,
        timestamp: new Date().toISOString(),
        raw_data: { 
          action: "initial-registration",
          ip_address,
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
      { status: isNewDevice ? 201 : 200, headers: corsHeaders }
    )

  } catch (error: any) {
    console.error("[REGISTRATION] Unexpected error:", error)
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

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { error: "Method not allowed. Use POST to register a device." },
    { status: 405, headers: corsHeaders }
  )
}