import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import ipaddr from 'ipaddr.js'

export const dynamic = 'force-dynamic'

// Removed wildcard CORS - API is same-origin only for security
const corsHeaders = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders })
}

// GET: List all assignments
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user
        const role = user?.user_metadata?.role || 'user';
        const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));
        const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));

        // 1. Check Auth & Role (Admin or Approver)
        if (!user || (!isAdmin && !isApprover)) {
            console.log("[Admin API] 403 Unauthorized. User:", user?.email, "Role:", role);
            return NextResponse.json({ error: "Unauthorized" }, { status: 403, headers: corsHeaders })
        }

        const adminClient = createAdminClient()

        // 2. Fetch Assignments
        let query = adminClient
            .from('subnet_assignments')
            .select('*');

        // If not admin, only fetch their own assignments
        if (!isAdmin) {
            query = query.eq('user_id', user.id);
        }

        const { data: assignments, error } = await query.order('created_at', { ascending: false })

        if (error) throw error

        // Optimize User Fetching: Only fetch unique users that are actually assigned
        const uniqueUserIds = Array.from(new Set(assignments.map(a => a.user_id)))

        // Fetch user emails in parallel and batch them
        // This is significantly faster than listUsers (which fetches everyone) or sequential calls
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
                subnets: a.subnet_cidrs || [] // Return as 'subnets' for the frontend
            }
        })

        return NextResponse.json({ assignments: assignmentsWithEmail }, { headers: corsHeaders })

    } catch (error: any) {
        console.error("Error fetching subnet assignments:", error)
        return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
    }
}

// POST: Create or Update Assignment
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user

        if (!user || user.user_metadata?.role !== 'admin') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403, headers: corsHeaders })
        }

        const { target_user_id, subnet_cidr } = await request.json()

        if (!target_user_id || !subnet_cidr) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders })
        }

        // Validate CIDR format using ipaddr.js for proper validation
        const subnets = subnet_cidr.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);

        const invalidSubnets = subnets.filter((s: string) => {
            try {
                ipaddr.parseCIDR(s);
                return false; // Valid CIDR
            } catch {
                return true; // Invalid CIDR
            }
        });
        if (invalidSubnets.length > 0) {
            return NextResponse.json({ error: `Invalid CIDR format: ${invalidSubnets.join(', ')}` }, { status: 400, headers: corsHeaders })
        }

        const adminClient = createAdminClient()

        // 1. Assign 'approver' role to the user if not already admin/approver
        const { data: targetUser, error: fetchError } = await adminClient.auth.admin.getUserById(target_user_id)
        if (fetchError) {
            return NextResponse.json({ error: "User ID not found" }, { status: 404, headers: corsHeaders })
        }

        const currentRole = targetUser.user?.user_metadata?.role
        if (currentRole !== 'admin' && currentRole !== 'approver') {
            // Update Auth Metadata with error handling
            const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(target_user_id, {
                user_metadata: { ...targetUser.user?.user_metadata, role: 'approver' },
                app_metadata: { ...targetUser.user?.app_metadata, role: 'approver' }
            })

            if (authUpdateError) {
                console.error('[Admin API] Failed to update auth metadata:', authUpdateError)
                return NextResponse.json({ error: 'Failed to update user role in auth' }, { status: 500, headers: corsHeaders })
            }

            // Update Profiles Table (for frontend visibility/filtering)
            const { error: profileUpdateError } = await adminClient
                .from('profiles')
                .update({ role: 'approver' })
                .eq('id', target_user_id)

            if (profileUpdateError) {
                console.error('[Admin API] Failed to update profile:', profileUpdateError)
                // Attempt to rollback auth update
                await adminClient.auth.admin.updateUserById(target_user_id, {
                    user_metadata: { ...targetUser.user?.user_metadata, role: currentRole },
                    app_metadata: { ...targetUser.user?.app_metadata, role: currentRole }
                })
                return NextResponse.json({ error: 'Failed to update user profile' }, { status: 500, headers: corsHeaders })
            }
        }

        // 2. Upsert Assignment (One row per user with subnets array)
        const { data, error } = await adminClient
            .from('subnet_assignments')
            .upsert({
                user_id: target_user_id,
                subnet_cidrs: subnets,
                created_by: user.id
            }, { onConflict: 'user_id' })
            .select()

        if (error) throw error

        return NextResponse.json({ success: true, entries: data }, { headers: corsHeaders })
    } catch (error: any) {
        console.error("Error creating assignment:", error)
        return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
    }
}

// DELETE: Remove Assignment
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user || user.user_metadata?.role !== 'admin') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403, headers: corsHeaders })
        }

        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) return NextResponse.json({ error: "ID required" }, { status: 400, headers: corsHeaders })

        const adminClient = createAdminClient()

        // Before deleting assignment, we might want to demote the user.
        // For simple DELETE (by row ID), we'll just delete. 
        // Sync (PUT) is where we handle the complex demotion.

        const { error } = await adminClient
            .from('subnet_assignments')
            .delete()
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ success: true }, { headers: corsHeaders })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
    }
}
// PUT: Sync Assignments (Replace all for a user - simplified with arrays)
export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user

        if (!user || user.user_metadata?.role !== 'admin') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403, headers: corsHeaders })
        }

        const { target_user_id, subnet_cidr } = await request.json()

        if (!target_user_id) {
            return NextResponse.json({ error: "Missing Target User ID" }, { status: 400, headers: corsHeaders })
        }

        const subnets = (subnet_cidr || '').split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);

        const adminClient = createAdminClient()

        // 1. Role Logic (Promote or Demote)
        const { data: targetUser, error: fetchError } = await adminClient.auth.admin.getUserById(target_user_id)
        if (!fetchError && targetUser.user) {
            const currentRole = targetUser.user.user_metadata?.role
            if (subnets.length > 0) {
                // Should be 'approver'
                if (currentRole !== 'admin' && currentRole !== 'approver') {
                    const { error: authError } = await adminClient.auth.admin.updateUserById(target_user_id, {
                        user_metadata: { ...targetUser.user.user_metadata, role: 'approver' },
                        app_metadata: { ...targetUser.user.app_metadata, role: 'approver' }
                    })
                    if (authError) {
                        console.error('[Admin API] Failed to promote user:', authError)
                        return NextResponse.json({ error: 'Failed to update user role' }, { status: 500, headers: corsHeaders })
                    }
                    const { error: profileError } = await adminClient
                        .from('profiles')
                        .update({ role: 'approver' })
                        .eq('id', target_user_id)
                    if (profileError) {
                        console.error('[Admin API] Failed to update profile:', profileError)
                    }
                }
            } else {
                // No subnets left -> Demote to 'user' if currently 'approver'
                if (currentRole === 'approver') {
                    const { error: authError } = await adminClient.auth.admin.updateUserById(target_user_id, {
                        user_metadata: { ...targetUser.user.user_metadata, role: 'user' },
                        app_metadata: { ...targetUser.user.app_metadata, role: 'user' }
                    })
                    if (authError) {
                        console.error('[Admin API] Failed to demote user:', authError)
                        return NextResponse.json({ error: 'Failed to update user role' }, { status: 500, headers: corsHeaders })
                    }
                    const { error: profileError } = await adminClient
                        .from('profiles')
                        .update({ role: 'user' })
                        .eq('id', target_user_id)
                    if (profileError) {
                        console.error('[Admin API] Failed to update profile:', profileError)
                    }
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

        return NextResponse.json({ success: true }, { headers: corsHeaders })

    } catch (error: any) {
        console.error("Error syncing assignments:", error)
        return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
    }
}

