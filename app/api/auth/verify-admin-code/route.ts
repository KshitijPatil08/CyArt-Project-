import { NextResponse } from "next/server";

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
        const CORRECT_CODE = process.env.ADMIN_SECRET_CODE || "CYART_ADMIN_SECRET";

        if (adminCode !== CORRECT_CODE) {
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
