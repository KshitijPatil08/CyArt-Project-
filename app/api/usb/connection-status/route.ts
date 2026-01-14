import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'
import { getCorsHeaders, verifyAgentKey, unauthorizedResponse } from "@/lib/api-utils"

export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, {
        status: 200,
        headers: getCorsHeaders(request),
    })
}

// POST /api/usb/connection-status
// Update connection status for authorized USB devices
export async function POST(request: NextRequest) {
    // 1. Verify Agent Key
    if (!verifyAgentKey(request)) {
        return unauthorizedResponse()
    }

    try {
        const supabase = createAdminClient()
        const body = await request.json()
        const { serial_number, connection_status, computer_name } = body

        // Validate inputs
        if (!serial_number || !connection_status || !computer_name) {
            return NextResponse.json(
                { error: 'Missing required fields: serial_number, connection_status, computer_name' },
                { status: 400, headers: getCorsHeaders(request) }
            )
        }

        if (!['connected', 'disconnected'].includes(connection_status)) {
            return NextResponse.json(
                { error: 'connection_status must be "connected" or "disconnected"' },
                { status: 400, headers: getCorsHeaders(request) }
            )
        }

        // 1. Fetch all authorized devices to perform substring matching
        const { data: allDevices, error: fetchError } = await supabase
            .from('authorized_usb_devices')
            .select('*')

        if (fetchError) {
            console.error('Error fetching USB devices:', fetchError)
            return NextResponse.json({ error: fetchError.message }, { status: 500, headers: getCorsHeaders(request) })
        }

        // 2. Find the matching device using bi-directional STARTS WITH check
        // We match if:
        // A) The received serial (long) STARTS WITH the DB serial (short/partial)
        // B) The DB serial (long) STARTS WITH the received serial (short)
        // This enforces "left to right" matching as requested.
        let matchingDevice = null
        if (allDevices) {
            matchingDevice = allDevices.find(device =>
                (device.serial_number && serial_number.startsWith(device.serial_number)) ||
                (device.serial_number && device.serial_number.startsWith(serial_number))
            )
        }

        // If device exists, update it
        if (matchingDevice) {
            const targetSerial = matchingDevice.serial_number

            // Update the matched device using its ACTUAL database serial number
            const { error: updateError } = await supabase
                .from('authorized_usb_devices')
                .update({
                    connection_status,
                    computer_name, // Update computer_name in case it changed
                    last_seen_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('serial_number', targetSerial)

            if (updateError) {
                console.error('Error updating USB connection status:', updateError)
                return NextResponse.json({ error: updateError.message }, { status: 500, headers: getCorsHeaders(request) })
            }

            return NextResponse.json({
                success: true,
                message: `Connection status updated to ${connection_status} (Matched: ${targetSerial})`,
                updated_count: 1
            }, { headers: getCorsHeaders(request) })
        }

        // If device doesn't exist, log a warning but return success
        console.warn(`USB device with serial ${serial_number} not found in authorized_usb_devices table`)
        return NextResponse.json({
            success: true,
            message: `Device not found in database (serial: ${serial_number})`,
            warning: 'Device may not be whitelisted'
        }, { headers: getCorsHeaders(request) })

    } catch (error: any) {
        console.error('Connection status update error:', error)
        return NextResponse.json({ error: error.message }, { status: 500, headers: getCorsHeaders(request) })
    }
}
