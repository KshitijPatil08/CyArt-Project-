// app/api/software/request/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

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
        const { data, error } = await supabase
            .from("software_approval_requests")
            .select("*")
            .eq("status", "pending")
            .order("requested_at", { ascending: false });
        if (error) throw error;

        return NextResponse.json({ success: true, requests: data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const {
            name,
            publisher,
            year,
            device_id,
            computer_name
        } = body;

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
                status: "pending"
            }
        ]);
        if (error) throw error;
        return NextResponse.json({ success: true, message: "Software request submitted" });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
