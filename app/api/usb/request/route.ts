// app/api/usb/request/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";

const allowedOrigins = [
    'https://cyart-dashboard.vercel.app',
    process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : ''
].filter(Boolean);

function getCorsHeaders(request: NextRequest) {
    const origin = request.headers.get('origin');
    return {
        'Access-Control-Allow-Origin': allowedOrigins.includes(origin || '') ? origin! : allowedOrigins[0] || '',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, {
        status: 200,
        headers: getCorsHeaders(request),
    })
}


const usbRequestSchema = z.object({
    serial_number: z.string().min(1),
    vendor_id: z.string().optional(),
    product_id: z.string().optional(),
    device_name: z.string().min(1),
    vendor_name: z.string().optional(),
    description: z.string().optional(),
    device_class: z.string().optional(),
    hardware_id: z.string().optional(),
    device_id: z.string().min(1),
    computer_name: z.string().optional()
});

const usbApproveSchema = z.object({
    id: z.string().min(1),
    action: z.enum(['approve', 'reject']),
    policies: z.object({
        max_daily_transfer_mb: z.number().optional(),
        allowed_start_time: z.string().optional().nullable(),
        allowed_end_time: z.string().optional().nullable(),
        expiration_date: z.string().optional().nullable(),
        is_read_only: z.boolean().optional()
    }).optional()
});

// Helper to generate SHA-256 fingerprint hash
function generateFingerprintHash(data: any) {
    const { serial_number, vendor_id, product_id, device_class, hardware_id, device_id } = data;
    const fingerprint = [
        serial_number || "",
        vendor_id || "",
        product_id || "",
        device_class || "",
        hardware_id || "",
        device_id || "" // Machine Binding
    ].join("|").toLowerCase();
    return crypto.createHash("sha256").update(fingerprint).digest("hex");
}

// GET: Fetch pending USB approval requests and flag unknown agents
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        // AUTH CHECK
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: getCorsHeaders(request) });
        }

        const { data, error } = await supabase
            .from("usb_approval_requests")
            .select("*")
            .eq("status", "pending")
            .order("requested_at", { ascending: false });
        if (error) throw error;

        // Enrich each request with a flag indicating whether the agent is unknown
        const enriched = await Promise.all(
            (data as any[]).map(async (req) => {
                const { data: device } = await supabase
                    .from("devices")
                    .select("id")
                    .eq("hostname", req.computer_name)
                    .maybeSingle();
                return { ...req, isUnknownAgent: !device };
            })
        );
        return NextResponse.json({ success: true, requests: enriched }, { headers: getCorsHeaders(request) });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: getCorsHeaders(request) });
    }
}

// POST: Agent submits a new USB request (allow unknown agents)
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // NOTE: Agent submission might be unauthenticated if it's a new agent, 
        // OR checks internal device token. For now, we allow POST but protect GET/PUT.
        // Ideally checking a device token header here would be best.

        const body = await request.json();

        const validationResult = usbRequestSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: "Validation failed", details: validationResult.error.format() },
                { status: 400, headers: getCorsHeaders(request) }
            );
        }

        const {
            serial_number,
            vendor_id,
            product_id,
            device_name,
            vendor_name,
            description,
            device_class,
            hardware_id,
            device_id,
            computer_name
        } = validationResult.data;

        // Basic validation – required fields
        if (!serial_number || !device_name || !device_id) {
            return NextResponse.json(
                { error: "Missing required fields: serial_number, device_name, device_id" },
                { status: 400, headers: getCorsHeaders(request) }
            );
        }

        const fingerprint_hash = generateFingerprintHash({
            serial_number,
            vendor_id,
            product_id,
            device_class,
            hardware_id,
            device_id
        });

        // Prevent duplicate pending requests
        const { data: existingRequest } = await supabase
            .from("usb_approval_requests")
            .select("id")
            .eq("fingerprint_hash", fingerprint_hash)
            .eq("status", "pending")
            .maybeSingle();
        if (existingRequest) {
            return NextResponse.json({ success: true, message: "Request already pending" }, { headers: getCorsHeaders(request) });
        }

        // Prevent creating a request for a device that is already authorized
        const { data: existingAuth } = await supabase
            .from("authorized_usb_devices")
            .select("id")
            .eq("fingerprint_hash", fingerprint_hash)
            .eq("is_active", true)
            .maybeSingle();
        if (existingAuth) {
            return NextResponse.json({ success: true, message: "Device already authorized" }, { headers: getCorsHeaders(request) });
        }

        const { error } = await supabase.from("usb_approval_requests").insert([
            {
                serial_number,
                vendor_id,
                product_id,
                device_name,
                vendor_name,
                description,
                device_class,
                hardware_id,
                device_id,
                computer_name, // may be undefined for unknown agents
                fingerprint_hash,
                status: "pending"
            }
        ]);
        if (error) throw error;
        return NextResponse.json({ success: true, message: "Request submitted successfully" }, { headers: getCorsHeaders(request) });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: getCorsHeaders(request) });
    }
}

// PUT: Admin approves or rejects a request
export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient();

        // AUTH CHECK - Admin only
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: getCorsHeaders(request) });
        }

        const body = await request.json();

        const validationResult = usbApproveSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: "Validation failed", details: validationResult.error.format() },
                { status: 400, headers: getCorsHeaders(request) }
            );
        }

        const { id, action, policies } = validationResult.data; // action: 'approve' | 'reject'
        if (!id || !action) {
            return NextResponse.json({ error: "Missing id or action" }, { status: 400, headers: getCorsHeaders(request) });
        }
        if (action === "reject") {
            const { error } = await supabase
                .from("usb_approval_requests")
                .update({ status: "rejected" })
                .eq("id", id);
            if (error) throw error;
            return NextResponse.json({ success: true, message: "Request rejected" }, { headers: getCorsHeaders(request) });
        }
        if (action === "approve") {
            const { data: reqData, error: fetchError } = await supabase
                .from("usb_approval_requests")
                .select("*")
                .eq("id", id)
                .single();
            if (fetchError || !reqData) throw fetchError || new Error("Request not found");

            const { error: insertError } = await supabase
                .from("authorized_usb_devices")
                .insert([
                    {
                        serial_number: reqData.serial_number,
                        vendor_id: reqData.vendor_id,
                        product_id: reqData.product_id,
                        device_name: reqData.device_name,
                        vendor_name: reqData.vendor_name,
                        description: reqData.description,
                        device_class: reqData.device_class,
                        hardware_id: reqData.hardware_id,
                        device_id: reqData.device_id, // Machine Binding
                        computer_name: reqData.computer_name,
                        fingerprint_hash: reqData.fingerprint_hash,
                        is_active: true,
                        // Apply policies (permissive defaults)
                        max_daily_transfer_mb: policies?.max_daily_transfer_mb || null,
                        allowed_start_time: policies?.allowed_start_time || null,
                        allowed_end_time: policies?.allowed_end_time || null,
                        expiration_date: policies?.expiration_date || null,
                        is_read_only: policies?.is_read_only || false
                    }
                ]);
            if (insertError) throw insertError;

            await supabase
                .from("usb_approval_requests")
                .update({ status: "approved" })
                .eq("id", id);
            return NextResponse.json({ success: true, message: "Device authorized successfully" }, { headers: getCorsHeaders(request) });
        }
        return NextResponse.json({ error: "Invalid action" }, { status: 400, headers: getCorsHeaders(request) });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: getCorsHeaders(request) });
    }
}
