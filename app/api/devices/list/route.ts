import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // 1. Authenticate user using standard client (cookie-based)
    const supabaseWithAuth = await createClient();
    const { data: { user } } = await supabaseWithAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Initialize Admin Client (Bypass RLS)
    const adminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    let query = adminClient
      .from('devices')
      .select('*')
      .order('last_seen', { ascending: false });

    // Fetch ALL devices first (server-side only)
    const { data: allDevices, error } = await query;
    if (error) {
      console.error("Device fetch error:", error);
      throw error;
    }

    let devices = allDevices || [];

    // Filter in memory for Standard Users
    if (user.user_metadata?.role !== 'admin') {
      const email = (user.email || '').toLowerCase();
      const username = email.split('@')[0];

      devices = devices.filter((device: any) => {
        if (device.is_server) return true; // Always show server status

        const owner = (device.owner || '').toLowerCase().trim();
        if (!owner) return false;

        // Permissive Matches:
        // 1. Exact email match
        // 2. Owner is contained in email (e.g. owner="kshit", email="kshitij...")
        // 3. Email/Username contains owner (e.g. owner="kshit", username="kshitij...")
        // 4. Owner contains username (e.g. owner="kshitij-pc")
        return (
          owner === email ||
          email.includes(owner) ||
          username.includes(owner) ||
          owner.includes(username)
        );
      });
    }

    // 2. Check for offline devices (threshold: 1 minute)
    const now = new Date();
    const offlineThreshold = 1 * 60 * 1000; // 1 minute in milliseconds

    const updatedDevices = devices.map((device: any) => {
      const lastSeen = new Date(device.last_seen).getTime();
      const isOffline = (now.getTime() - lastSeen) > offlineThreshold;

      if (isOffline && device.status === 'online') {
        return { ...device, status: 'offline' };
      }
      return device;
    });

    // Optional: Background update for persistence
    const devicesToUpdate = updatedDevices.filter((d: any) =>
      d.status === 'offline' && devices.find((old: any) => old.id === d.id)?.status === 'online'
    );

    if (devicesToUpdate.length > 0) {
      const idsToUpdate = devicesToUpdate.map((d: any) => d.id);
      adminClient
        .from('devices')
        .update({ status: 'offline' })
        .in('id', idsToUpdate)
        .then(({ error }) => {
          if (error) console.error("Error auto-updating offline status:", error);
        });
    }

    return NextResponse.json({
      success: true,
      count: updatedDevices.length,
      devices: updatedDevices
    });
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
