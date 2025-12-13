import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// PATCH /api/devices/[id]/policies
// Update USB policies for a specific device
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient()
        const { id } = await params

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check if user is admin
        const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('email', user.email)
            .single()

        if (profile?.role !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        }

        const body = await request.json()
        const { usb_read_only, usb_data_limit_mb, usb_expiration_date } = body

        // Validate inputs
        if (typeof usb_read_only !== 'boolean' && usb_read_only !== undefined) {
            return NextResponse.json({ error: 'usb_read_only must be boolean' }, { status: 400 })
        }

        if (usb_data_limit_mb !== undefined && (typeof usb_data_limit_mb !== 'number' || usb_data_limit_mb < 0)) {
            return NextResponse.json({ error: 'usb_data_limit_mb must be a positive number' }, { status: 400 })
        }

        // Update device policies
        const { data, error } = await supabase
            .from('devices')
            .update({
                usb_read_only: usb_read_only ?? false,
                usb_data_limit_mb: usb_data_limit_mb ?? 0,
                usb_expiration_date: usb_expiration_date || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single()

        if (error) {
            console.error('Error updating policies:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            device: data
        })

    } catch (error: any) {
        console.error('Policy update error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// GET /api/devices/[id]/policies
// Get current policies for a device
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient()
        const { id } = await params

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data, error } = await supabase
            .from('devices')
            .select('id, device_name, usb_read_only, usb_data_limit_mb, usb_expiration_date')
            .eq('id', id)
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            policies: {
                usb_read_only: data.usb_read_only || false,
                usb_data_limit_mb: data.usb_data_limit_mb || 0,
                usb_expiration_date: data.usb_expiration_date || null
            }
        })

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
