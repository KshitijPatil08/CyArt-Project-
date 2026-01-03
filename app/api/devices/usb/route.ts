// app/api/devices/usb/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCorsHeaders } from "@/lib/api-utils";

// Handles CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request, 'GET, POST, OPTIONS') });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Use admin client (server-side service role key)
    const supabase = createAdminClient();

    // Insert the alert into the 'logs' table
    const { error } = await supabase
      .from("logs")
      .insert([{ type: "usb", data: body, created_at: new Date().toISOString() }]);

    const headers = getCorsHeaders(req as any, 'GET, POST, OPTIONS')

    if (error) {
      console.error("Supabase insert error:", error);
      return new NextResponse(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    return new NextResponse(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("POST /api/devices/usb error:", err);
    const headers = getCorsHeaders(req as any, 'GET, POST, OPTIONS')
    return new NextResponse(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
}