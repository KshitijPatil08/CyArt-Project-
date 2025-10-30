import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const {
      device_id,
      usb_name,
      usb_vendor,
      usb_product_id,
      usb_vendor_id,
      device_type,
      serial_number,
      action, // 'insert' or 'remove'
      data_transferred_mb,
    } = body

    if (!device_id || !usb_name || !device_type || !action) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (action === "insert") {
      // Record USB device insertion
      const { data, error } = await supabase
        .from("usb_devices")
        .insert([
          {
            device_id,
            usb_name,
            usb_vendor,
            usb_product_id,
            usb_vendor_id,
            device_type,
            serial_number,
            insertion_time: new Date().toISOString(),
            status: "connected",
          },
        ])
        .select()

      if (error) throw error

      // Create alert for USB connection
      await supabase.from("alerts").insert([
        {
          device_id,
          alert_type: "usb_connection",
          severity: "medium",
          title: `USB Device Connected: ${usb_name}`,
          description: `${device_type} connected to device`,
        },
      ])

      return NextResponse.json({ success: true, data }, { status: 201 })
    } else if (action === "remove") {
      // Find and update USB device removal
      const { data: usbDevice, error: findError } = await supabase
        .from("usb_devices")
        .select("id")
        .eq("device_id", device_id)
        .eq("serial_number", serial_number)
        .eq("status", "connected")
        .order("insertion_time", { ascending: false })
        .limit(1)
        .single()

      if (findError || !usbDevice) {
        return NextResponse.json({ error: "USB device not found" }, { status: 404 })
      }

      const { data, error } = await supabase
        .from("usb_devices")
        .update({
          removal_time: new Date().toISOString(),
          status: "disconnected",
          data_transferred_mb: data_transferred_mb || 0,
        })
        .eq("id", usbDevice.id)
        .select()

      if (error) throw error

      // Create alert for USB disconnection
      await supabase.from("alerts").insert([
        {
          device_id,
          alert_type: "usb_connection",
          severity: "low",
          title: `USB Device Disconnected: ${usb_name}`,
          description: `${device_type} disconnected from device`,
        },
      ])

      return NextResponse.json({ success: true, data }, { status: 201 })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("[v0] USB tracking error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
