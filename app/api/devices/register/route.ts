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

    console.log("Registering device:", { device_name, hostname })

    // Check if device already exists by hostname
    const { data: existingDevice, error: fetchError } = await supabase
      .from("devices")
      .select("id, readable_id")
      .eq("hostname", hostname)
      .maybeSingle()

    if (fetchError) {
      console.error("Error checking existing device:", fetchError)
      return NextResponse.json(
        { error: "Database query failed", details: fetchError.message },
        { status: 500, headers: corsHeaders }
      )
    }

    let deviceId
    let readableId

    if (existingDevice) {
      // Reuse existing readable ID
      readableId = existingDevice.readable_id

      console.log("Updating existing device:", existingDevice.id)
      const { error } = await supabase
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
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingDevice.id)

      if (error) {
        console.error("Error updating device:", error)
        return NextResponse.json(
          { error: "Failed to update device", details: error.message },
          { status: 500, headers: corsHeaders }
        )
      }
      deviceId = existingDevice.id
    } else {
      // Generate next readable ID
      const { count } = await supabase
        .from("devices")
        .select("id", { count: "exact", head: true })

      const nextNumber = (count || 0) + 1
      readableId = `Device-${nextNumber.toString().padStart(3, "0")}`

      console.log("Creating new device with readable ID:", readableId)

      const { data, error } = await supabase
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
            last_seen: new Date().toISOString(),
          },
        ])
        .select()
        .single()

      if (error) {
        console.error("Error creating device:", error)
        return NextResponse.json(
          { error: "Failed to create device", details: error.message },
          { status: 500, headers: corsHeaders }
        )
      }
      deviceId = data.id
    }

    return NextResponse.json(
      { success: true, device_id: deviceId, readable_id: readableId },
      { status: 201, headers: corsHeaders }
    )
  } catch (error: any) {
    console.error("Unexpected error in device registration:", error)
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