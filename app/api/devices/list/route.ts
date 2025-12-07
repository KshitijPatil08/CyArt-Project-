import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // 1. Authenticate user
    const supabaseWithAuth = await createClient();
    const { data: { user } } = await supabaseWithAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[DEBUG] User:", user.email, "Role:", user.user_metadata?.role);

    // 2. Initialize Admin Client with error handling
    let adminClient;
    try {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      if (!supabaseUrl) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is not defined");
      }
      if (!serviceRoleKey && !anonKey) {
        throw new Error("No Supabase key available");
      }

      console.log("[DEBUG] Service Role Key exists:", !!serviceRoleKey);
      console.log("[DEBUG] Using key type:", serviceRoleKey ? "SERVICE_ROLE" : "ANON");

      adminClient = createSupabaseClient(
        supabaseUrl,
        serviceRoleKey || anonKey!
      );
    } catch (initError: any) {
      console.error("[DEBUG] Failed to initialize Supabase client:", initError);
      return NextResponse.json({
        error: "Failed to initialize database client",
        details: initError.message
      }, { status: 500 });
    }

    // 3. Fetch ALL devices (NO FILTERING)
    const { data: allDevices, error } = await adminClient
      .from('devices')
      .select('*')
      .order('last_seen', { ascending: false });

    if (error) {
      console.error("[DEBUG] Device fetch error:", error);
      return NextResponse.json({
        error: "Database error",
        details: error.message,
        code: error.code
      }, { status: 500 });
    }

    console.log("[DEBUG] Fetched devices count:", allDevices?.length || 0);

    // 4. NO FILTERING - Return all for now
    const now = new Date();
    const offlineThreshold = 1 * 60 * 1000;

    const updatedDevices = (allDevices || []).map((device: any) => {
      const lastSeen = new Date(device.last_seen).getTime();
      const isOffline = (now.getTime() - lastSeen) > offlineThreshold;

      if (isOffline && device.status === 'online') {
        return { ...device, status: 'offline' };
      }
      return device;
    });

    return NextResponse.json({
      success: true,
      count: updatedDevices.length,
      devices: updatedDevices
    });
  } catch (error: any) {
    console.error("[DEBUG] API Error:", error);
    console.error("[DEBUG] Stack:", error.stack);
    return NextResponse.json(
      { error: error.message || "Internal server error", stack: error.stack },
      { status: 500 }
    );
  }
}
