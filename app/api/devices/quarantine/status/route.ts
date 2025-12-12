import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

// GET /api/devices/quarantine/status - Check device quarantine status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const device_id = searchParams.get("device_id")

    if (!device_id) {
      return NextResponse.json({ error: "Missing device_id" }, { status: 400 })
    }

    // Fetch Device Status & Global Policies
    const { data: deviceData, error: deviceError } = await supabase
      .from("devices")
      .select("is_quarantined, quarantine_reason, quarantined_at, quarantined_by, usb_read_only, usb_data_limit_mb, usb_expiration_date")
      .eq("id", device_id)
      .single()

    if (deviceError) throw deviceError

    // Fetch Authorized USB Policies for this device (by matching hostnames logic or just returning all for this device in future)
    // Currently, the agent sends its hostname, but the device object has the hostname.
    // The `authorized_usb_devices` table has a `computer_name` field which seems to match the device hostname.
    // Let's first get the device hostname from the `deviceData` (we need to select it).

    // We need to re-fetch device to get hostname if we want to filter by it, 
    // OR we can just return ALL policies if the agent filters them? 
    // The agent knows its own hostname. But filtering server-side is better.
    // Let's actually fetch the hostname in the first query.

    const { data: deviceWithHostname, error: hostnameError } = await supabase
      .from("devices")
      .select("hostname")
      .eq("id", device_id)
      .single()

    if (hostnameError) throw hostnameError

    let usbPolicies: any[] = []
    if (deviceWithHostname?.hostname) {
      const { data: usbData, error: usbError } = await supabase
        .from("authorized_usb_devices")
        .select("serial_number, is_active, is_read_only, expiration_date, allowed_start_time, allowed_end_time, max_daily_transfer_mb")
        .or(`computer_name.eq.${deviceWithHostname.hostname},computer_name.is.null`)

      if (!usbError && usbData) {
        usbPolicies = usbData
      }
    }

    return NextResponse.json({
      is_quarantined: deviceData?.is_quarantined || false,
      quarantine_reason: deviceData?.quarantine_reason || null,
      quarantined_at: deviceData?.quarantined_at || null,
      quarantined_by: deviceData?.quarantined_by || null,
      // Global Policies
      usb_read_only: deviceData?.usb_read_only || false,
      usb_data_limit_mb: deviceData?.usb_data_limit_mb || 0,
      usb_expiration_date: deviceData?.usb_expiration_date || null,
      // Per-Device Policies
      usb_policies: usbPolicies
    }, { status: 200 })
  } catch (error) {
    console.error("Status check error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
