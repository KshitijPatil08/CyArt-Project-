import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const supabase = await createClient();

        // Authenticate and check admin role
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (user.user_metadata?.role !== 'admin') {
            return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
        }

        // Parse request body
        const { device_id, owner_email } = await request.json();

        if (!device_id || !owner_email) {
            return NextResponse.json(
                { error: "Missing required fields: device_id and owner_email" },
                { status: 400 }
            );
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(owner_email)) {
            return NextResponse.json(
                { error: "Invalid email format" },
                { status: 400 }
            );
        }

        // Update device owner
        const { data: updatedDevice, error } = await supabase
            .from('devices')
            .update({
                owner: owner_email,
                updated_at: new Date().toISOString()
            })
            .eq('id', device_id)
            .select()
            .single();

        if (error) {
            console.error("Error assigning device owner:", error);
            return NextResponse.json(
                { error: "Failed to assign device owner", details: error.message },
                { status: 500 }
            );
        }

        // Log the assignment action
        await supabase.from("logs").insert([{
            device_id: device_id,
            log_type: "system",
            source: "admin-assignment",
            severity: "info",
            message: `Device owner assigned to ${owner_email} by ${user.email}`,
            timestamp: new Date().toISOString(),
            raw_data: {
                action: "assign-owner",
                new_owner: owner_email,
                assigned_by: user.email
            }
        }]);

        return NextResponse.json({
            success: true,
            device: updatedDevice,
            message: "Device owner assigned successfully"
        });

    } catch (error: any) {
        console.error("API Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
