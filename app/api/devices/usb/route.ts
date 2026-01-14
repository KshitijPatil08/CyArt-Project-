// app/api/devices/usb/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders, verifyAgentKey, unauthorizedResponse } from "@/lib/api-utils"

// Handles CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function POST(req: NextRequest) {
  // 1. Verify Agent Key
  if (!verifyAgentKey(req)) {
    return unauthorizedResponse()
  }

  try {
    const body = await req.json();

    // Connect to Supabase (server key required)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!  // use the private key here
    );

    // Insert the alert into the 'logs' table
    const { error } = await supabase
      .from("logs")
      .insert([{ type: "usb", data: body, created_at: new Date().toISOString() }]);

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ ok: false, error: error.message }, {
        status: 500,
        headers: getCorsHeaders(req)
      });
    }

    return NextResponse.json({ ok: true }, {
      status: 200,
      headers: getCorsHeaders(req)
    });
  } catch (err) {
    console.error("POST /api/devices/usb error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, {
      status: 500,
      headers: getCorsHeaders(req)
    });
  }
}