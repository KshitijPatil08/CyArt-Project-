// app/api/software/approve/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { id, action, owner_email } = body; // action: 'approve' | 'reject'

        if (!id || !action) {
            return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
        }

        if (action === "reject") {
            const { error } = await supabase
                .from("software_approval_requests")
                .update({ status: "rejected" })
                .eq("id", id);
            if (error) throw error;
            return NextResponse.json({ success: true, message: "Request rejected" });
        }

        if (action === "approve") {
            // Get the request data
            const { data: reqData, error: fetchError } = await supabase
                .from("software_approval_requests")
                .select("*")
                .eq("id", id)
                .single();
            if (fetchError || !reqData) throw fetchError || new Error("Request not found");

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

            return NextResponse.json({ success: true, message: "Software approved successfully" });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// GET: List authorized software
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("authorized_software")
            .select("*")
            .order("created_at", { ascending: false });
        if (error) throw error;

        return NextResponse.json({ success: true, software: data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
