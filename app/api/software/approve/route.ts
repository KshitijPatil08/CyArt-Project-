// app/api/software/approve/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod";

const softwareApproveSchema = z.object({
    id: z.string().min(1),
    action: z.enum(['approve', 'reject']),
    owner_email: z.string().email().optional().or(z.literal(''))
});

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // AUTH CHECK
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }

        // Role Detection
        const role = user.user_metadata?.role || 'user';
        const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));
        const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));

        if (!isAdmin && !isApprover) {
            return NextResponse.json({ error: "Forbidden: Admin or Approver access required" }, { status: 403, headers: corsHeaders });
        }

        const body = await request.json();
        const validationResult = softwareApproveSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: "Validation failed", details: validationResult.error.format() },
                { status: 400, headers: corsHeaders }
            );
        }

        const { id, action, owner_email } = validationResult.data;
        const adminClient = createAdminClient();

        if (action === "reject") {
            const { error } = await adminClient
                .from("software_approval_requests")
                .update({ status: "rejected" })
                .eq("id", id);
            if (error) throw error;
            return NextResponse.json({ success: true, message: "Request rejected" }, { headers: corsHeaders });
        }

        if (action === "approve") {
            // Get the request data using admin client
            const { data: reqData, error: fetchError } = await adminClient
                .from("software_approval_requests")
                .select("*")
                .eq("id", id)
                .single();
            if (fetchError || !reqData) throw fetchError || new Error("Request not found");

            // --- RBAC Validation for Approvers ---
            if (!isAdmin && isApprover) {
                const { isIpInSubnet } = await import("@/lib/utils/subnet");
                const { data: assignments } = await adminClient
                    .from('subnet_assignments')
                    .select('subnet_cidrs')
                    .eq('user_id', user.id);

                const allowedSubnets = assignments?.flatMap(a => a.subnet_cidrs || []) || [];

                // Check 1: Request comes physically from the Subnet
                let isAllowed = false;
                try {
                    isAllowed = reqData.ip_address && allowedSubnets.some(cidr => isIpInSubnet(reqData.ip_address, cidr));
                } catch (e) { }

                // Check 2: Request comes from a Device Identity that belongs to the Subnet
                if (!isAllowed && allowedSubnets.length > 0) {
                    const { data: allDevices } = await adminClient
                        .from('devices')
                        .select('device_id, hostname, ip_address');

                    if (allDevices) {
                        const allowedDeviceIds = new Set<string>();
                        const allowedHostnames = new Set<string>();

                        allDevices.forEach(d => {
                            if (!d.ip_address) return;
                            try {
                                if (allowedSubnets.some(cidr => isIpInSubnet(d.ip_address, cidr))) {
                                    if (d.device_id) allowedDeviceIds.add(d.device_id);
                                    if (d.hostname) allowedHostnames.add(d.hostname.toLowerCase());
                                }
                            } catch (e) { }
                        });

                        const idMatch = reqData.device_id && allowedDeviceIds.has(reqData.device_id);
                        const hostMatch = reqData.computer_name && allowedHostnames.has(reqData.computer_name.toLowerCase());

                        if (idMatch || hostMatch) {
                            isAllowed = true;
                        }
                    }
                }

                if (!isAllowed) {
                    return NextResponse.json({ error: "Forbidden: Request is outside your assigned subnets" }, { status: 403, headers: corsHeaders });
                }
            }

            // Add to authorized_software using admin client
            const { error: insertError } = await adminClient
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

            // Mark request as approved using admin client
            await adminClient
                .from("software_approval_requests")
                .update({ status: "approved" })
                .eq("id", id);

            return NextResponse.json({ success: true, message: "Software approved successfully" }, { headers: corsHeaders });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400, headers: corsHeaders });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
}

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        // AUTH CHECK
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }

        const { data, error } = await supabase
            .from("authorized_software")
            .select("*")
            .order("created_at", { ascending: false });
        if (error) throw error;

        return NextResponse.json({ success: true, software: data }, { headers: corsHeaders });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();

        // AUTH CHECK
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }

        // Role Check
        const role = user.user_metadata?.role || 'user';
        const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));
        const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));

        if (!isAdmin && !isApprover) {
            return NextResponse.json({ error: "Forbidden: Admin or Approver access required" }, { status: 403, headers: corsHeaders });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: "id is required" }, { status: 400, headers: corsHeaders });
        }

        const adminClient = createAdminClient();
        const { error } = await adminClient
            .from("authorized_software")
            .delete()
            .eq("id", id);

        if (error) throw error;

        return NextResponse.json({ success: true, message: "Software authorization removed" }, { headers: corsHeaders });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
}

export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, {
        status: 200,
        headers: corsHeaders,
    });
}

