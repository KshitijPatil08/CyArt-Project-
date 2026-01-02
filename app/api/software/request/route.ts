// app/api/software/request/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isIpInSubnet } from "@/lib/utils/subnet"
import { createAdminClient } from "@/lib/supabase/admin"
import crypto from "crypto";
import { z } from "zod";

function getRequestIp(request: NextRequest) {
    const forwardedFor = request.headers.get('x-forwarded-for');
    return forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';
}


const softwareRequestSchema = z.object({
    name: z.string().min(1),
    publisher: z.string().optional(),
    year: z.union([z.string(), z.number()]).optional(),
    device_id: z.string().min(1),
    computer_name: z.string().optional()
});

function generateSoftwareHash(data: any) {
    const { name, publisher, device_id } = data;
    const fingerprint = [
        name || "",
        publisher || "",
        device_id || ""
    ].join("|").toLowerCase();
    return crypto.createHash("sha256").update(fingerprint).digest("hex");
}

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: requests, error } = await supabase
            .from("software_approval_requests")
            .select("*")
            .eq("status", "pending")
            .order("requested_at", { ascending: false });
        if (error) throw error;

        // AUTH CHECK
        const { data: { user } } = await supabase.auth.getUser();
        // If unauthenticated, public API might be intended? Original code didn't check.
        // Assuming public for agents? But this is GET (Admin Dashboard).
        // Let's protect it.
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const role = user.user_metadata?.role || 'user';
        const isApprover = role === 'approver' || (Array.isArray(role) && role.includes('approver'));
        const isAdmin = role === 'admin' || (Array.isArray(role) && role.includes('admin'));

        let filteredRequests = requests || [];

        if (isAdmin) {
            // Admin sees all
        } else if (isApprover) {
            const adminClient = createAdminClient();
            const { data: assignments } = await adminClient
                .from('subnet_assignments')
                .select('subnet_cidrs')
                .eq('user_id', user.id);

            if (!assignments || assignments.length === 0) {
                // If approver has no subnets assigned, they see nothing
                filteredRequests = [];
            } else {
                const allowedSubnets = assignments.flatMap(a => a.subnet_cidrs || []);
                filteredRequests = filteredRequests.filter(req => {
                    // Filter based on IP address of the request
                    if (!req.ip_address) return false;
                    return allowedSubnets.some(cidr => isIpInSubnet(req.ip_address, cidr));
                });
            }
        } else {
            // Standard user
            filteredRequests = [];
        }

        return NextResponse.json({ success: true, requests: filteredRequests });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json();

        const validationResult = softwareRequestSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: "Validation failed", details: validationResult.error.format() },
                { status: 400 }
            );
        }

        const {
            name,
            publisher,
            year,
            device_id,
            computer_name
        } = validationResult.data;

        if (!name || !device_id) {
            return NextResponse.json(
                { error: "Missing required fields: name, device_id" },
                { status: 400 }
            );
        }

        const fingerprint_hash = generateSoftwareHash({ name, publisher, device_id });

        // Check if already pending
        const { data: existingRequest } = await supabase
            .from("software_approval_requests")
            .select("id")
            .eq("fingerprint_hash", fingerprint_hash)
            .eq("status", "pending")
            .maybeSingle();
        if (existingRequest) {
            return NextResponse.json({ success: true, message: "Request already pending" });
        }

        // Check if already authorized
        const { data: existingAuth } = await supabase
            .from("authorized_software")
            .select("id")
            .eq("hash", name) // For now, we match by name as a simple whitelist
            .maybeSingle();

        if (existingAuth) {
            return NextResponse.json({ success: true, message: "Software already authorized" });
        }

        const { error } = await supabase.from("software_approval_requests").insert([
            {
                name,
                publisher,
                year,
                device_id,
                computer_name,
                fingerprint_hash,
                status: "pending",
                ip_address: getRequestIp(request)

            }
        ]);
        if (error) throw error;
        return NextResponse.json({ success: true, message: "Software request submitted" });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
