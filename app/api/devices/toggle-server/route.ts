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
        const { device_id, is_server } = await request.json();

        if (!device_id) {
            return NextResponse.json(
                { error: "Missing required field: device_id" },
                { status: 400 }
            );
        }

        // If is_server is true, enforce single server rule by unsetting other servers
        if (is_server) {
            const { error: unsetError } = await supabase
                .from('devices')
                .update({ is_server: false, updated_at: new Date().toISOString() })
                .neq('id', device_id);

            if (unsetError) {
                console.error("Error unsetting other servers:", unsetError);
                return NextResponse.json(
                    { error: "Failed to unset other servers", details: unsetError.message },
                    { status: 500 }
                );
            }
        }

        // Update device server status
        const { data: updatedDevice, error } = await supabase
            .from('devices')
            .update({
                is_server: !!is_server,
                updated_at: new Date().toISOString()
            })
            .eq('id', device_id)
            .select()
            .single();

        if (error) {
            console.error("Error toggling server status:", error);
            return NextResponse.json(
                { error: "Failed to update device", details: error.message },
                { status: 500 }
            );
        }

        // Log the action
        await supabase.from("logs").insert([{
            device_id: device_id,
            log_type: "system",
            source: "admin-action",
            severity: "info",
            message: `Device server status set to ${!!is_server} by ${user.email}`,
            timestamp: new Date().toISOString(),
            raw_data: {
                action: "toggle-server",
                is_server: !!is_server,
                performed_by: user.email
            }
        }]);

        return NextResponse.json({
            success: true,
            device: updatedDevice,
            message: `Device marked as ${is_server ? 'Server' : 'Regular Device'}`
        });

    } catch (error: any) {
        console.error("API Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
