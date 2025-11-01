import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from "next/server"

// Enable CORS for all origins
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// Create Supabase client directly in this file to avoid import issues
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
    // Check environment variables first
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error("Missing Supabase environment variables")
      return NextResponse.json(
        { error: "Server configuration error: Missing Supabase credentials" },
        { status: 500, headers: corsHeaders }
      )
    }

    // Create Supabase client
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
    
    // Parse request body
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

    // Validate required fields
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
      .select("id")
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

    if (existingDevice) {
      // Update existing device
      console.log("Updating existing device:", existingDevice.id)
      const { data, error } = await supabase
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
        .select()
        .single()

      if (error) {
        console.error("Error updating device:", error)
        return NextResponse.json(
          { error: "Failed to update device", details: error.message },
          { status: 500, headers: corsHeaders }
        )
      }
      deviceId = existingDevice.id
      console.log("Device updated successfully:", deviceId)
    } else {
      // Create new device
      console.log("Creating new device")
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
      console.log("Device created successfully:", deviceId)
    }

    return NextResponse.json(
      { success: true, device_id: deviceId },
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

// Handle other methods
export async function GET(request: NextRequest) {
  return NextResponse.json(
    { error: "Method not allowed. Use POST to register a device." },
    { status: 405, headers: corsHeaders }
  )
}