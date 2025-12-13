import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/usb/connection-status
// Update connection status for authorized USB devices
export async function POST(request: Request) {
    try {
        const supabase = await createClient()
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

        // Update connection status in authorized_usb_devices table
        const { error } = await supabase
            .from('authorized_usb_devices')
            .update({
                connection_status,
                last_seen: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('serial_number', serial_number)
            .eq('computer_name', computer_name)

        if (error) {
            console.error('Error updating USB connection status:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            message: `Connection status updated to ${connection_status}`
        })

    } catch (error: any) {
        console.error('Connection status update error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
