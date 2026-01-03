// app/api/software/approve/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getCorsHeaders } from "@/lib/api-utils";
import { z } from "zod";

const softwareApproveSchema = z.object({
    id: z.string().min(1),
    action: z.enum(['approve', 'reject']),
    owner_email: z.string().email().optional().or(z.literal(''))
});


export async function POST(request: NextRequest) {
    const headers = getCorsHeaders(request, 'POST, OPTIONS');

    try {
        const supabase = await createClient();

        // AUTH CHECK
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
        }

        // Role Detection
        const role = user.user_metadata?.role || 'user';
        const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));
        const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));

        if (!isAdmin && !isApprover) {
            return NextResponse.json({ error: "Forbidden: Admin or Approver access required" }, { status: 403, headers });
        }


        const body = await request.json();

        const validationResult = softwareApproveSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: "Validation failed", details: validationResult.error.format() },
                { status: 400, headers: headers }
            );
        }

        const { id, action, owner_email } = validationResult.data; // action: 'approve' | 'reject'

        if (!id || !action) {
            return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
        }

        if (action === "reject") {
            const { error } = await supabase
                .from("software_approval_requests")
                .update({ status: "rejected" })
                .eq("id", id);
            if (error) throw error;
            return NextResponse.json({ success: true, message: "Request rejected" }, { headers: headers });
        }

        if (action === "approve") {
            // Get the request data
            const { data: reqData, error: fetchError } = await supabase
                .from("software_approval_requests")
                .select("*")
                .eq("id", id)
                .single();
            if (fetchError || !reqData) throw fetchError || new Error("Request not found");

            // --- RBAC Validation for Approvers ---
            if (!isAdmin && isApprover) {
                const { createAdminClient } = await import("@/lib/supabase/admin");
                const { isIpInSubnet } = await import("@/lib/utils/subnet");
                const adminClient = createAdminClient();
                const { data: assignments } = await adminClient
                    .from('subnet_assignments')
                    .select('subnet_cidrs')
                    .eq('user_id', user.id);

                const allowedSubnets = assignments?.flatMap(a => a.subnet_cidrs || []) || [];
                const isAllowed = reqData.ip_address && allowedSubnets.some(cidr => isIpInSubnet(reqData.ip_address, cidr));

                    if (!isAllowed) {
                    return NextResponse.json({ error: "Forbidden: Request is outside your assigned subnets" }, { status: 403, headers });
                }
            }


            // Add to authorized_software
            const { error: insertError } = await supabase
                .from("authorized_software")
                .insert([
                    {
                        name: reqData.name,
                        publisher: reqData.publisher,
                        hash: reqData.name, // Use name as hash for simple matching
                        is_approved: true,
                        owner_email: owner_email || null
                    }
                ]);
            if (insertError) throw insertError;

            // Mark request as approved
            await supabase
                .from("software_approval_requests")
                .update({ status: "approved" })
                .eq("id", id);

            return NextResponse.json({ success: true, message: "Software approved successfully" }, { headers });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400, headers });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers });
    }
}

// GET: List authorized software
export async function GET(request: NextRequest) {
    const headers = getCorsHeaders(request, 'GET, OPTIONS');

    try {
        const supabase = await createClient();

        // AUTH CHECK - Require authentication for listing software
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
        }

        const { data, error } = await supabase
            .from("authorized_software")
            .select("*")
            .order("created_at", { ascending: false });
        if (error) throw error;

        return NextResponse.json({ success: true, software: data }, { headers });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers });
    }
}

// DELETE: Remove authorized software
export async function DELETE(request: NextRequest) {
    const headers = getCorsHeaders(request, 'DELETE, OPTIONS');

    try {
        const supabase = await createClient();

        // AUTH CHECK
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
        }

        // Role Check
        const role = user.user_metadata?.role || 'user';
        const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));
        const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));

        if (!isAdmin && !isApprover) {
            return NextResponse.json({ error: "Forbidden: Admin or Approver access required" }, { status: 403, headers });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: "id is required" }, { status: 400, headers });
        }

        const { error } = await supabase
            .from("authorized_software")
            .delete()
            .eq("id", id);

        if (error) throw error;

        return NextResponse.json({ success: true, message: "Software authorization removed" }, { headers });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers });
    }
}

export async function OPTIONS(request: NextRequest) {
    return NextResponse.json({}, { headers: getCorsHeaders(request, 'GET, POST, DELETE, OPTIONS') });
}

