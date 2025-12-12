import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

// POST /api/devices/hardware-lock - Lock hardware on a device
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const body = await request.json()

        const { data: { user } } = await supabase.auth.getUser()
        if (user?.user_metadata?.role !== 'admin') {
            return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
        }

        const { device_id, lock_network = true, lock_usb = true } = body

        if (!device_id) {
            return NextResponse.json({ error: "Missing device_id" }, { status: 400 })
        }

        // Get device information
        const { data: device, error: deviceError } = await supabase
            .from("devices")
            .select("*")
            .eq("id", device_id)
            .single()

        if (deviceError || !device) {
            return NextResponse.json({ error: "Device not found" }, { status: 404 })
        }

        // TODO: Send lock command to device agent
        // This would typically be done via WebSocket, HTTP polling, or message queue
        // For now, we'll just update the database status

        const lockStatus = {
            network_locked: lock_network,
            usb_locked: lock_usb,
            locked_at: new Date().toISOString()
        }

        // Update device with hardware lock status
        const { data, error } = await supabase
            .from("devices")
            .update({
                hardware_locked: true,
                lock_status: lockStatus,
                last_lock_attempt: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("id", device_id)
            .select()

        if (error) throw error

        // Log the hardware lock action
        await supabase.from("logs").insert({
            device_id,
            log_type: "security",
            source: "hardware-lock-system",
            severity: "critical",
            message: `Hardware locked: Network=${lock_network}, USB=${lock_usb}`,
            timestamp: new Date().toISOString(),
            raw_data: lockStatus,
        })

        return NextResponse.json({
            success: true,
            message: "Hardware lock command sent",
            data,
            note: "Agent integration required for actual hardware control"
        }, { status: 200 })
    } catch (error) {
        console.error("Hardware lock error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// DELETE /api/devices/hardware-lock - Unlock hardware on a device
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient()
        const body = await request.json()

        const { data: { user } } = await supabase.auth.getUser()
        if (user?.user_metadata?.role !== 'admin') {
            return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
        }

        const { device_id } = body

        if (!device_id) {
            return NextResponse.json({ error: "Missing device_id" }, { status: 400 })
        }

        // Get device information
        const { data: device, error: deviceError } = await supabase
            .from("devices")
            .select("*")
            .eq("id", device_id)
            .single()

        if (deviceError || !device) {
            return NextResponse.json({ error: "Device not found" }, { status: 404 })
        }

        // TODO: Send unlock command to device agent
        // This would typically be done via WebSocket, HTTP polling, or message queue

        // Update device with hardware unlock status
        const { data, error } = await supabase
            .from("devices")
            .update({
                hardware_locked: false,
                lock_status: null,
                updated_at: new Date().toISOString(),
            })
            .eq("id", device_id)
            .select()

        if (error) throw error

        // Log the hardware unlock action
        await supabase.from("logs").insert({
            device_id,
            log_type: "security",
            source: "hardware-lock-system",
            severity: "info",
            message: "Hardware unlocked",
            timestamp: new Date().toISOString(),
        })

        return NextResponse.json({
            success: true,
            message: "Hardware unlock command sent",
            data,
            note: "Agent integration required for actual hardware control"
        }, { status: 200 })
    } catch (error) {
        console.error("Hardware unlock error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
