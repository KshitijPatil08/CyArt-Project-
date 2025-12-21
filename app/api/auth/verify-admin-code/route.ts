import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
    try {
        const { adminCode } = await request.json();

        if (!adminCode) {
            return NextResponse.json(
                { valid: false, message: "Admin code is required" },
                { status: 400 }
            );
        }

        // SECURITY: Compare against server-side environment variable
        // Fallback to the known default if env var is not set, 
        // but this fallback is now hidden on the server.
        const CORRECT_CODE = process.env.ADMIN_SECRET_CODE;

        if (!CORRECT_CODE) {
            console.error("ADMIN_SECRET_CODE not configured");
            return NextResponse.json(
                { valid: false, message: "Server misconfiguration" },
                { status: 500 }
            );
        }

        if (adminCode !== CORRECT_CODE) {
            console.error(`[SECURITY] Failed admin login attempt: Invalid Code`);

            // Log to database if possible
            const supabase = await createClient();
            await supabase.from("logs").insert([{
                device_id: "system",
                log_type: "security",
                severity: "warning",
                message: "Failed admin login attempt: Invalid Code",
                source: "auth-api",
                timestamp: new Date().toISOString()
            }]);

            return NextResponse.json(
                { valid: false, message: "Invalid Admin Code" },
                { status: 401 }
            );
        }

        return NextResponse.json({ valid: true });
    } catch (error) {
        return NextResponse.json(
            { valid: false, message: "Internal Server Error" },
            { status: 500 }
        );
    }
}
