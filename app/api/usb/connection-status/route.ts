import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// POST /api/usb/connection-status
// Update connection status for authorized USB devices
export async function POST(request: Request) {
    try {
        const supabase = createAdminClient()
        const body = await request.json()
        const { serial_number, connection_status, computer_name } = body

        // Validate inputs
        if (!serial_number || !connection_status || !computer_name) {
            return NextResponse.json(
                { error: 'Missing required fields: serial_number, connection_status, computer_name' },
                { status: 400 }
            )
        }

        if (!['connected', 'disconnected'].includes(connection_status)) {
            return NextResponse.json(
                { error: 'connection_status must be "connected" or "disconnected"' },
                { status: 400 }
            )
        }

        // First, try to find the device by serial_number only
        const { data: existingDevices, error: fetchError } = await supabase
            .from('authorized_usb_devices')
            .select('*')
            .eq('serial_number', serial_number)

        if (fetchError) {
            console.error('Error fetching USB device:', fetchError)
            return NextResponse.json({ error: fetchError.message }, { status: 500 })
        }

        // If device exists, update it
        if (existingDevices && existingDevices.length > 0) {
            // Update all matching devices (in case there are multiple entries)
            const { error: updateError } = await supabase
                .from('authorized_usb_devices')
                .update({
                    connection_status,
                    computer_name, // Update computer_name in case it changed
                    updated_at: new Date().toISOString()
                })
                .eq('serial_number', serial_number)

            if (updateError) {
                console.error('Error updating USB connection status:', updateError)
                return NextResponse.json({ error: updateError.message }, { status: 500 })
            }

            return NextResponse.json({
                success: true,
                message: `Connection status updated to ${connection_status}`,
                updated_count: existingDevices.length
            })
        }

        // If device doesn't exist, log a warning but return success
        console.warn(`USB device with serial ${serial_number} not found in authorized_usb_devices table`)
        return NextResponse.json({
            success: true,
            message: `Device not found in database (serial: ${serial_number})`,
            warning: 'Device may not be whitelisted'
        })

    } catch (error: any) {
        console.error('Connection status update error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
