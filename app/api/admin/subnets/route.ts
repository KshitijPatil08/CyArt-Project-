import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import ipaddr from "ipaddr.js"
import { getCorsHeaders } from "@/lib/api-utils"

export const dynamic = 'force-dynamic'

/**
 * Validates a CIDR string using ipaddr.js
 */
function isValidCIDR(cidr: string): boolean {
    try {
        ipaddr.parseCIDR(cidr)
        return true
    } catch (e) {
        return false
    }
}

export async function OPTIONS(request: NextRequest) {
    return NextResponse.json({}, { headers: getCorsHeaders(request) })
}

// GET: List all assignments
export async function GET(request: NextRequest) {
    const headers = getCorsHeaders(request)
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        // 1. Check Auth & Admin Role
        if (!user || user.user_metadata?.role !== 'admin') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403, headers })
        }

        const adminClient = createAdminClient()

        // 2. Fetch Assignments
        const { data: assignments, error } = await adminClient
            .from('subnet_assignments')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error

        const uniqueUserIds = Array.from(new Set(assignments.map(a => a.user_id)))
        const userPromises = uniqueUserIds.map(id => adminClient.auth.admin.getUserById(id))
        const userResponses = await Promise.all(userPromises)

        const usersMap = new Map()
        userResponses.forEach(res => {
            if (res.data && res.data.user) {
                usersMap.set(res.data.user.id, res.data.user)
            }
        })

        const assignmentsWithEmail = assignments.map(a => {
            const user = usersMap.get(a.user_id)
            return {
                ...a,
                user_email: user?.email || 'Unknown User',
                subnets: a.subnet_cidrs || []
            }
        })

        return NextResponse.json({ assignments: assignmentsWithEmail }, { headers })

    } catch (error: any) {
        console.error("Error fetching subnet assignments:", error)
        return NextResponse.json({ error: error.message }, { status: 500, headers })
    }
}

// POST: Create or Update Assignment
export async function POST(request: NextRequest) {
    const headers = getCorsHeaders(request)
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user || user.user_metadata?.role !== 'admin') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403, headers })
        }

        const { target_user_id, subnet_cidr } = await request.json()

        if (!target_user_id || !subnet_cidr) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400, headers })
        }

        // Robust CIDR validation
        const subnets = subnet_cidr.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        const invalidSubnets = subnets.filter((s: string) => !isValidCIDR(s));

        if (invalidSubnets.length > 0) {
            return NextResponse.json({ error: `Invalid CIDR format: ${invalidSubnets.join(', ')}` }, { status: 400, headers })
        }

        const adminClient = createAdminClient()

        // 1. Assign 'approver' role if needed
        const { data: targetUser, error: fetchError } = await adminClient.auth.admin.getUserById(target_user_id)
        if (fetchError || !targetUser.user) {
            return NextResponse.json({ error: "User not found" }, { status: 404, headers })
        }

        const currentRole = targetUser.user.user_metadata?.role
        if (currentRole !== 'admin' && currentRole !== 'approver') {
            console.log(`[Admin API] Promoting ${targetUser.user.email} to approver...`);

            const { error: authError } = await adminClient.auth.admin.updateUserById(target_user_id, {
                user_metadata: { ...targetUser.user.user_metadata, role: 'approver' },
                app_metadata: { ...targetUser.user.app_metadata, role: 'approver' }
            })
            if (authError) throw new Error(`Auth update failed: ${authError.message}`)

            const { error: profileError } = await adminClient
                .from('profiles')
                .update({ role: 'approver' })
                .eq('id', target_user_id)
            if (profileError) throw new Error(`Profile table update failed: ${profileError.message}`)
        }

        // 2. Upsert Assignment
        const { data, error } = await adminClient
            .from('subnet_assignments')
            .upsert({
                user_id: target_user_id,
                subnet_cidrs: subnets,
                created_by: user.id
            }, { onConflict: 'user_id' })
            .select()

        if (error) throw error

        return NextResponse.json({ success: true, entries: data }, { headers })
    } catch (error: any) {
        console.error("Error creating assignment:", error)
        return NextResponse.json({ error: error.message }, { status: 500, headers })
    }
}

// DELETE: Remove Assignment
export async function DELETE(request: NextRequest) {
    const headers = getCorsHeaders(request)
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user || user.user_metadata?.role !== 'admin') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403, headers })
        }

        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) return NextResponse.json({ error: "ID required" }, { status: 400, headers })

        const adminClient = createAdminClient()

        // Get user_id before deleting so we can check if they need demotion
        const { data: existing } = await adminClient
            .from('subnet_assignments')
            .select('user_id')
            .eq('id', id)
            .single()

        const { error } = await adminClient
            .from('subnet_assignments')
            .delete()
            .eq('id', id)

        if (error) throw error

        // If user has no more assignments, demote them
        if (existing?.user_id) {
            const { count } = await adminClient
                .from('subnet_assignments')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', existing.user_id)

            if (count === 0) {
                const { data: targetUser } = await adminClient.auth.admin.getUserById(existing.user_id)
                if (targetUser?.user?.user_metadata?.role === 'approver') {
                    await adminClient.auth.admin.updateUserById(existing.user_id, {
                        user_metadata: { ...targetUser.user.user_metadata, role: 'user' },
                        app_metadata: { ...targetUser.user.app_metadata, role: 'user' }
                    })
                    await adminClient.from('profiles').update({ role: 'user' }).eq('id', existing.user_id)
                }
            }
        }

        return NextResponse.json({ success: true }, { headers })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers })
    }
}

// PUT: Sync Assignments
export async function PUT(request: NextRequest) {
    const headers = getCorsHeaders(request)
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user || user.user_metadata?.role !== 'admin') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403, headers })
        }

        const { target_user_id, subnet_cidr } = await request.json()
        if (!target_user_id) {
            return NextResponse.json({ error: "Missing Target User ID" }, { status: 400, headers })
        }

        const subnets = (subnet_cidr || '').split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);

        // Validate subnets
        const invalidSubnets = subnets.filter((s: string) => !isValidCIDR(s));
        if (invalidSubnets.length > 0) {
            return NextResponse.json({ error: `Invalid CIDR format: ${invalidSubnets.join(', ')}` }, { status: 400, headers })
        }

        const adminClient = createAdminClient()

        // 1. Role Logic (Promote or Demote)
        const { data: targetUser, error: fetchError } = await adminClient.auth.admin.getUserById(target_user_id)
        if (!fetchError && targetUser.user) {
            const currentRole = targetUser.user.user_metadata?.role
            if (subnets.length > 0) {
                if (currentRole !== 'admin' && currentRole !== 'approver') {
                    const { error: authErr } = await adminClient.auth.admin.updateUserById(target_user_id, {
                        user_metadata: { ...targetUser.user.user_metadata, role: 'approver' },
                        app_metadata: { ...targetUser.user.app_metadata, role: 'approver' }
                    })
                    if (authErr) throw authErr

                    const { error: profErr } = await adminClient.from('profiles').update({ role: 'approver' }).eq('id', target_user_id)
                    if (profErr) throw profErr
                }
            } else {
                if (currentRole === 'approver') {
                    const { error: authErr } = await adminClient.auth.admin.updateUserById(target_user_id, {
                        user_metadata: { ...targetUser.user.user_metadata, role: 'user' },
                        app_metadata: { ...targetUser.user.app_metadata, role: 'user' }
                    })
                    if (authErr) throw authErr

                    const { error: profErr } = await adminClient.from('profiles').update({ role: 'user' }).eq('id', target_user_id)
                    if (profErr) throw profErr
                }
            }
        }

        // 2. Clear or Upsert Assignments
        if (subnets.length === 0) {
            const { error: deleteError } = await adminClient
                .from('subnet_assignments')
                .delete()
                .eq('user_id', target_user_id)
            if (deleteError) throw deleteError
        } else {
            const { error: upsertError } = await adminClient
                .from('subnet_assignments')
                .upsert({
                    user_id: target_user_id,
                    subnet_cidrs: subnets,
                    created_by: user.id
                }, { onConflict: 'user_id' })
            if (upsertError) throw upsertError
        }

        return NextResponse.json({ success: true }, { headers })
    } catch (error: any) {
        console.error("Error syncing assignments:", error)
        return NextResponse.json({ error: error.message }, { status: 500, headers })
    }
}

